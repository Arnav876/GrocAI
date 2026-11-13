import {
  NormalizedObservation,
  NormalizedObservationSchema,
  calculateDiscountPercentage,
  assertIntegerPaise,
  parseAndNormalizeQuantityWithPrice,
  PINCODE_REGEX,
  PlatformId,
  ObservationAvailabilityStatus,
  VerificationStatus,
  DataSource,
} from "@groqai/shared";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function parseRupeeStringToPaise(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return undefined;
    return Math.round(val * 100);
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    if (!cleaned) return undefined;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : Math.round(parsed * 100);
  }
  return undefined;
}

function isValidUrl(str: unknown): str is string {
  if (typeof str !== "string" || !str.trim()) return false;
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 1. BLINKIT: Deterministic Payload Normalizer (/v1/layout/search)
 */
export function parseBlinkitSearchPayload(
  rawJson: unknown,
  pincode: string = "110001"
): NormalizedObservation[] {
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  if (typeof rawJson === "string") {
    try {
      rawJson = JSON.parse(rawJson);
    } catch {
      return [];
    }
  }

  if (!rawJson || typeof rawJson !== "object") {
    return [];
  }

  const dataObj = rawJson as any;
  const snippets = dataObj?.response?.snippets;
  if (!Array.isArray(snippets)) {
    return [];
  }

  const results: NormalizedObservation[] = [];
  const now = new Date().toISOString();

  for (const snippet of snippets) {
    const d = snippet?.data;
    if (!d || typeof d !== "object") continue;

    const name = d.name?.text || d.display_name?.text;
    if (!name || typeof name !== "string" || !name.trim()) continue;

    const externalId = String(d.product_id || d.identity?.id || "");
    const brand = d.brand_name?.text || d.atc_action?.add_to_cart?.cart_item?.brand || null;
    const quantity = d.variant?.text || d.atc_action?.add_to_cart?.cart_item?.unit || "1 unit";

    const rawSellingPrice =
      parseRupeeStringToPaise(d.normal_price?.text) ??
      (d.atc_action?.add_to_cart?.cart_item?.price !== undefined
        ? Math.round(Number(d.atc_action.add_to_cart.cart_item.price) * 100)
        : undefined);

    if (rawSellingPrice === undefined || rawSellingPrice <= 0) continue;
    const pricePaise = Math.round(rawSellingPrice);
    assertIntegerPaise(pricePaise, `Blinkit item ${name}`);

    let rawMrp =
      parseRupeeStringToPaise(d.mrp?.text) ??
      (d.atc_action?.add_to_cart?.cart_item?.mrp !== undefined
        ? Math.round(Number(d.atc_action.add_to_cart.cart_item.mrp) * 100)
        : pricePaise);

    let originalPricePaise = rawMrp !== undefined ? Math.round(rawMrp) : pricePaise;

    let verificationStatus: VerificationStatus = "VERIFIED";
    // Anomaly guard: if originalPricePaise < pricePaise
    if (originalPricePaise < pricePaise) {
      originalPricePaise = pricePaise;
      verificationStatus = "FLAGGED_ANOMALY";
    }

    const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);

    const isSoldOut = Boolean(d.is_sold_out || (d.inventory !== undefined && d.inventory <= 0));
    const availabilityStatus: ObservationAvailabilityStatus = isSoldOut ? "OUT_OF_STOCK" : "IN_STOCK";

    const productUrl = externalId
      ? `https://blinkit.com/prn/${slugify(name)}/prid/${externalId}`
      : `https://blinkit.com/s/?q=${encodeURIComponent(name)}`;

    const rawImageUrl = d.image?.url || d.atc_action?.add_to_cart?.cart_item?.image_url;
    const imageUrl = isValidUrl(rawImageUrl) ? rawImageUrl : null;

    let normalizedUnitPricePaise: number | undefined;
    try {
      const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
      normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
    } catch {
      // Ignored if unparseable quantity
    }

    const obs: NormalizedObservation = NormalizedObservationSchema.parse({
      name: name.trim(),
      brand: brand ? String(brand).trim() : null,
      quantity: quantity.trim(),
      pricePaise,
      originalPricePaise,
      discountPercentage,
      availabilityStatus,
      platformId: "blinkit",
      productUrl,
      imageUrl,
      pincode,
      observedAt: now,
      dataSource: "headed_worker",
      verificationStatus,
      normalizedUnitPricePaise,
    });

    results.push(obs);
  }

  return results;
}

/**
 * 2. ZEPTO: Deterministic Payload Normalizer (Dual-Mode: Network JSON + DOM Extraction Fallback)
 */
export function parseZeptoSearchPayload(
  rawJsonOrDom: unknown,
  pincode: string = "110001"
): NormalizedObservation[] {
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  if (typeof rawJsonOrDom === "string") {
    try {
      rawJsonOrDom = JSON.parse(rawJsonOrDom);
    } catch {
      return [];
    }
  }

  if (!rawJsonOrDom || typeof rawJsonOrDom !== "object") {
    return [];
  }

  const results: NormalizedObservation[] = [];
  const now = new Date().toISOString();

  // Mode A: DOM Card Fallback ({ products: [...] } or direct array)
  const candidateProducts = Array.isArray(rawJsonOrDom)
    ? rawJsonOrDom
    : Array.isArray((rawJsonOrDom as any).products)
    ? (rawJsonOrDom as any).products
    : null;

  if (candidateProducts) {
    for (const p of candidateProducts) {
      if (!p || typeof p !== "object") continue;
      const name = p.name || p.title;
      if (!name || typeof name !== "string" || !name.trim()) continue;

      let pricePaise: number | undefined;
      if (typeof p.sellingPrice === "number") {
        // If > 1000 assume paise, otherwise rupees
        pricePaise = p.sellingPrice > 1000 ? Math.round(p.sellingPrice) : Math.round(p.sellingPrice * 100);
      } else if (typeof p.sellingPrice === "string") {
        pricePaise = parseRupeeStringToPaise(p.sellingPrice);
      } else if (typeof p.price === "number") {
        pricePaise = p.price > 1000 ? Math.round(p.price) : Math.round(p.price * 100);
      } else if (typeof p.price === "string") {
        pricePaise = parseRupeeStringToPaise(p.price);
      }

      if (pricePaise === undefined || pricePaise <= 0) continue;
      assertIntegerPaise(pricePaise, `Zepto item ${name}`);

      let mrpPaise: number | undefined;
      if (typeof p.mrp === "number") {
        mrpPaise = p.mrp > 1000 ? Math.round(p.mrp) : Math.round(p.mrp * 100);
      } else if (typeof p.mrp === "string") {
        mrpPaise = parseRupeeStringToPaise(p.mrp);
      } else {
        mrpPaise = pricePaise;
      }

      let originalPricePaise = mrpPaise !== undefined ? Math.round(mrpPaise) : pricePaise;

      let verificationStatus: VerificationStatus = "VERIFIED";
      if (originalPricePaise < pricePaise) {
        originalPricePaise = pricePaise;
        verificationStatus = "FLAGGED_ANOMALY";
      }

      const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);
      const isOutOfStock = Boolean(p.isOutOfStock || p.outOfStock);
      const availabilityStatus: ObservationAvailabilityStatus = isOutOfStock ? "OUT_OF_STOCK" : "IN_STOCK";

      const externalId = String(p.id || "");
      const productUrl = isValidUrl(p.productUrl)
        ? p.productUrl
        : externalId
        ? `https://www.zepto.com/pn/${slugify(name)}/pvid/${externalId}`
        : `https://www.zepto.com/search?query=${encodeURIComponent(name)}`;

      const imageUrl = isValidUrl(p.imageUrl) ? p.imageUrl : null;
      const quantity = (p.packSize || p.quantity || "1 unit").trim();

      let normalizedUnitPricePaise: number | undefined;
      try {
        const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
        normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
      } catch {
        // Ignored
      }

      const obs: NormalizedObservation = NormalizedObservationSchema.parse({
        name: name.trim(),
        brand: p.brand ? String(p.brand).trim() : null,
        quantity,
        pricePaise,
        originalPricePaise,
        discountPercentage,
        availabilityStatus,
        platformId: "zepto",
        productUrl,
        imageUrl,
        pincode,
        observedAt: now,
        dataSource: "headed_worker",
        verificationStatus,
        normalizedUnitPricePaise,
      });

      results.push(obs);
    }

    return results;
  }

  // Mode B: Network JSON Interception (Walk BFF widget tree / productResponse)
  const productResponses: any[] = [];

  function collectResponses(node: any, seen: Set<any>) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) collectResponses(el, seen);
      return;
    }

    if (node.productResponse && typeof node.productResponse === "object") {
      productResponses.push(node.productResponse);
      return;
    }

    if (
      (node.sellingPrice !== undefined || node.discountedSellingPrice !== undefined) &&
      (node.product || node.productName || node.name)
    ) {
      productResponses.push(node);
      return;
    }

    for (const val of Object.values(node)) {
      collectResponses(val, seen);
    }
  }

  collectResponses(rawJsonOrDom, new Set());

  for (const pr of productResponses) {
    const name = pr.product?.name || pr.name || pr.productName;
    if (!name || typeof name !== "string" || !name.trim()) continue;

    const brand = pr.product?.brand || pr.brand || null;
    const quantity =
      pr.productVariant?.formattedPacksize ||
      pr.formattedPacksize ||
      pr.packSize ||
      pr.quantity ||
      "1 unit";

    // In Zepto BFF, numbers are integer paise
    const rawSp = pr.discountedSellingPrice ?? pr.sellingPrice ?? pr.price;
    const pricePaise =
      typeof rawSp === "number"
        ? Math.round(rawSp)
        : parseRupeeStringToPaise(rawSp);

    if (pricePaise === undefined || pricePaise <= 0) continue;
    assertIntegerPaise(pricePaise, `Zepto item ${name}`);

    const rawMrp = pr.mrp ?? pr.productVariant?.mrp ?? pricePaise;
    let originalPricePaise =
      typeof rawMrp === "number"
        ? Math.round(rawMrp)
        : parseRupeeStringToPaise(rawMrp) ?? pricePaise;

    let verificationStatus: VerificationStatus = "VERIFIED";
    if (originalPricePaise < pricePaise) {
      originalPricePaise = pricePaise;
      verificationStatus = "FLAGGED_ANOMALY";
    }

    const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);

    const isAvailable =
      pr.isActive !== false &&
      (pr.availableQuantity === undefined || pr.availableQuantity > 0) &&
      !pr.isOutOfStock;
    const availabilityStatus: ObservationAvailabilityStatus = isAvailable ? "IN_STOCK" : "OUT_OF_STOCK";

    const externalId = String(pr.id || pr.productId || pr.productVariant?.id || "");
    const productUrl = externalId
      ? `https://www.zepto.com/pn/${slugify(name)}/pvid/${externalId}`
      : `https://www.zepto.com/search?query=${encodeURIComponent(name)}`;

    let imageUrl: string | null = null;
    const imgPath = pr.productVariant?.images?.[0]?.path || pr.images?.[0]?.path;
    if (imgPath) {
      imageUrl = imgPath.startsWith("http")
        ? imgPath
        : `https://cdn.zeptonow.com/production/ik-seo/tr:w-403,ar-4504-4504,pr-true,f-auto,q-40,dpr-2/${imgPath}`;
    }

    if (imageUrl && !isValidUrl(imageUrl)) {
      imageUrl = null;
    }

    let normalizedUnitPricePaise: number | undefined;
    try {
      const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
      normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
    } catch {
      // Ignored
    }

    const obs: NormalizedObservation = NormalizedObservationSchema.parse({
      name: name.trim(),
      brand: brand ? String(brand).trim() : null,
      quantity: quantity.trim(),
      pricePaise,
      originalPricePaise,
      discountPercentage,
      availabilityStatus,
      platformId: "zepto",
      productUrl,
      imageUrl,
      pincode,
      observedAt: now,
      dataSource: "headed_worker",
      verificationStatus,
      normalizedUnitPricePaise,
    });

    results.push(obs);
  }

  return results;
}

/**
 * 3. BIGBASKET: Deterministic Payload Normalizer (/listing-svc/v2/products & Next.js __NEXT_DATA__)
 */
export function parseBigBasketSearchPayload(
  rawJson: unknown,
  pincode: string = "110001"
): NormalizedObservation[] {
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  let dataObj: any = rawJson;
  if (typeof rawJson === "string") {
    const trimmed = rawJson.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        dataObj = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      const match = trimmed.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
      if (match) {
        try {
          dataObj = JSON.parse(match[1]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }
  }

  if (!dataObj || typeof dataObj !== "object") {
    return [];
  }

  // Collect candidate product nodes from tabs or __NEXT_DATA__ pageProps
  const candidateProducts: any[] = [];

  const tabs =
    dataObj?.tabs ||
    dataObj?.props?.pageProps?.tabs ||
    dataObj?.props?.pageProps?.data?.tabs;

  if (Array.isArray(tabs)) {
    const productInfo = tabs.find((t: any) => t?.product_info?.products)?.product_info;
    if (Array.isArray(productInfo?.products)) {
      candidateProducts.push(...productInfo.products);
    }
  }

  if (Array.isArray(dataObj.products)) {
    candidateProducts.push(...dataObj.products);
  } else if (Array.isArray(dataObj?.props?.pageProps?.products)) {
    candidateProducts.push(...dataObj.props.pageProps.products);
  } else if (dataObj?.props?.pageProps?.productDetails) {
    const pd = dataObj.props.pageProps.productDetails;
    candidateProducts.push(pd);
    if (Array.isArray(pd.children)) {
      candidateProducts.push(...pd.children);
    }
  } else if (Array.isArray(rawJson)) {
    candidateProducts.push(...rawJson);
  } else if (dataObj.desc && (dataObj.pricing || dataObj.price)) {
    candidateProducts.push(dataObj);
  }

  if (candidateProducts.length === 0) {
    return [];
  }

  const results: NormalizedObservation[] = [];
  const now = new Date().toISOString();

  for (const p of candidateProducts) {
    if (!p || typeof p !== "object") continue;

    const name = p.desc || p.name || p.title;
    if (!name || typeof name !== "string" || !name.trim()) continue;

    const externalId = String(p.id || "");
    const brand = p.brand?.name || p.brand || null;
    const quantity = p.w || p.pack_desc || (p.magnitude ? `${p.magnitude} ${p.unit || ""}`.trim() : p.unit || "1 unit");

    // BigBasket prices in listing-svc are rupee strings/numbers (e.g. "27" or 27)
    const rawSp =
      p.pricing?.discount?.prim_price?.sp ??
      p.pricing?.discount?.sp ??
      p.sp ??
      p.price ??
      p.sellingPrice;
    const pricePaise = parseRupeeStringToPaise(rawSp);

    if (pricePaise === undefined || pricePaise <= 0) continue;
    assertIntegerPaise(pricePaise, `BigBasket item ${name}`);

    const rawMrp = p.pricing?.discount?.mrp ?? p.mrp ?? pricePaise;
    let originalPricePaise = parseRupeeStringToPaise(rawMrp) ?? pricePaise;

    let verificationStatus: VerificationStatus = "VERIFIED";
    if (originalPricePaise < pricePaise) {
      originalPricePaise = pricePaise;
      verificationStatus = "FLAGGED_ANOMALY";
    }

    const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);

    const isUnavailable = Boolean(p.availability?.not_for_sale || p.availability?.avail_status === "000");
    const availabilityStatus: ObservationAvailabilityStatus = isUnavailable ? "UNAVAILABLE" : "IN_STOCK";

    let productUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(name)}`;
    if (p.absolute_url) {
      productUrl = p.absolute_url.startsWith("http")
        ? p.absolute_url
        : `https://www.bigbasket.com${p.absolute_url}`;
    }

    const rawImg = p.images?.[0]?.s || p.images?.[0]?.m || p.images?.[0]?.l || p.image || p.imageUrl;
    const imageUrl = isValidUrl(rawImg) ? rawImg : null;

    let normalizedUnitPricePaise: number | undefined;
    try {
      const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
      normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
    } catch {
      // Ignored
    }

    const obs: NormalizedObservation = NormalizedObservationSchema.parse({
      name: name.trim(),
      brand: brand ? String(brand).trim() : null,
      quantity: quantity.trim(),
      pricePaise,
      originalPricePaise,
      discountPercentage,
      availabilityStatus,
      platformId: "bigbasket",
      productUrl,
      imageUrl,
      pincode,
      observedAt: now,
      dataSource: "headed_worker",
      verificationStatus,
      normalizedUnitPricePaise,
    });

    results.push(obs);
  }

  return results;
}

/**
 * 4. INSTAMART: Deterministic Payload Normalizer (/api/instamart/search & window.___INITIAL_STATE___)
 */
export function parseInstamartSearchPayload(
  rawJsonOrHtml: unknown,
  pincode: string = "560064"
): NormalizedObservation[] {
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  if (!rawJsonOrHtml) return [];

  let dataObj: any = rawJsonOrHtml;

  // If HTML string, extract window.___INITIAL_STATE___ or JSON
  if (typeof rawJsonOrHtml === "string") {
    const trimmed = rawJsonOrHtml.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        dataObj = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      const match =
        trimmed.match(/window\.___INITIAL_STATE___\s*=\s*(\{.*?\});/s) ||
        trimmed.match(/___INITIAL_STATE___\s*=\s*(\{.*?\});/s);
      if (match) {
        try {
          dataObj = JSON.parse(match[1]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }
  }

  if (!dataObj || typeof dataObj !== "object") return [];

  // Helper to parse Swiggy price representations (units/nanos, float rupees, integer paise)
  function parseSwiggyPrice(val: unknown): number | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === "number") {
      if (!Number.isFinite(val)) return undefined;
      return val > 1000 ? Math.round(val) : Math.round(val * 100);
    }
    if (typeof val === "string") {
      return parseRupeeStringToPaise(val);
    }
    if (typeof val === "object") {
      const p = val as any;
      if (p.units !== undefined) {
        const units = parseInt(String(p.units), 10) || 0;
        const nanos = Number(p.nanos) || 0;
        return units * 100 + Math.round(nanos / 1e7);
      }
      if (p.offerPrice !== undefined) return parseSwiggyPrice(p.offerPrice);
      if (p.storePrice !== undefined) return parseSwiggyPrice(p.storePrice);
      if (p.mrp !== undefined) return parseSwiggyPrice(p.mrp);
      if (p.price !== undefined) return parseSwiggyPrice(p.price);
    }
    return undefined;
  }

  const candidateItems: any[] = [];

  // Case 1: Swiggy Search API format (data.cards[].card.card.gridElements.infoWithStyle.items)
  const cards = dataObj?.data?.cards || dataObj?.cards;
  if (Array.isArray(cards)) {
    for (const c of cards) {
      const cardItems =
        c?.card?.card?.gridElements?.infoWithStyle?.items ||
        c?.card?.gridElements?.infoWithStyle?.items ||
        c?.gridElements?.infoWithStyle?.items ||
        c?.items;
      if (Array.isArray(cardItems)) {
        candidateItems.push(...cardItems);
      }
    }
  }

  // Case 2: Direct items or products array
  if (Array.isArray(dataObj.items)) {
    candidateItems.push(...dataObj.items);
  } else if (Array.isArray(dataObj.products)) {
    candidateItems.push(...dataObj.products);
  } else if (Array.isArray(dataObj)) {
    candidateItems.push(...dataObj);
  }

  // Case 3: Initial State / menu
  if (dataObj.menu && typeof dataObj.menu === "object") {
    for (const v of Object.values(dataObj.menu)) {
      if (v && typeof v === "object") candidateItems.push(v);
    }
  }

  const results: NormalizedObservation[] = [];
  const now = new Date().toISOString();
  const seenIds = new Set<string>();

  for (const item of candidateItems) {
    if (!item || typeof item !== "object") continue;

    const baseName = item.displayName || item.name || item.title;
    if (!baseName || typeof baseName !== "string" || !baseName.trim()) continue;

    const brand = item.brand ? String(item.brand).trim() : null;

    // Items may have variations array or be flat item
    const variations =
      Array.isArray(item.variations) && item.variations.length > 0
        ? item.variations
        : [item];

    for (const v of variations) {
      if (!v || typeof v !== "object") continue;

      const name = (v.displayName || baseName).trim();
      const variantId = String(v.id || v.productId || item.productId || item.id || "");
      const dedupeKey = `${variantId}-${name}`;
      if (seenIds.has(dedupeKey)) continue;
      seenIds.add(dedupeKey);

      const quantity = (
        v.quantityDescription ||
        v.formattedPacksize ||
        v.packSize ||
        item.quantityDescription ||
        "1 unit"
      ).trim();

      const pricePaise =
        parseSwiggyPrice(v.price?.offerPrice) ??
        parseSwiggyPrice(v.price?.storePrice) ??
        parseSwiggyPrice(v.price) ??
        parseSwiggyPrice(item.price?.offerPrice) ??
        parseSwiggyPrice(item.price);

      if (pricePaise === undefined || pricePaise <= 0) continue;
      assertIntegerPaise(pricePaise, `Instamart item ${name}`);

      const mrpPaise =
        parseSwiggyPrice(v.price?.mrp) ??
        parseSwiggyPrice(item.price?.mrp) ??
        pricePaise;

      let originalPricePaise = mrpPaise;
      let verificationStatus: VerificationStatus = "VERIFIED";
      if (originalPricePaise < pricePaise) {
        originalPricePaise = pricePaise;
        verificationStatus = "FLAGGED_ANOMALY";
      }

      const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);

      const isUnavailable =
        item.inStock === false ||
        item.isAvail === false ||
        v.inventory?.inStock === false ||
        v.inventory?.outOfStock === true ||
        v.outOfStock === true;

      const availabilityStatus: ObservationAvailabilityStatus = isUnavailable
        ? "OUT_OF_STOCK"
        : "IN_STOCK";

      let productUrl = variantId
        ? `https://www.swiggy.com/instamart/item/${variantId}`
        : `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(name)}`;

      let imageUrl: string | null = null;
      const rawImg = v.images?.[0] || item.images?.[0] || v.imageId || item.imageId || v.image;
      if (typeof rawImg === "string" && rawImg.trim()) {
        imageUrl = rawImg.startsWith("http")
          ? rawImg
          : `https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_272,w_252/${rawImg}`;
      }

      let normalizedUnitPricePaise: number | undefined;
      try {
        const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
        normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
      } catch {
        // Ignored
      }

      const obs: NormalizedObservation = NormalizedObservationSchema.parse({
        name,
        brand,
        quantity,
        pricePaise,
        originalPricePaise,
        discountPercentage,
        availabilityStatus,
        platformId: "instamart",
        productUrl,
        imageUrl,
        pincode,
        observedAt: now,
        dataSource: "headed_worker",
        verificationStatus,
        normalizedUnitPricePaise,
      });

      results.push(obs);
    }
  }

  return results;
}

/**
 * 4. MANUAL / ASSISTED OBSERVATION GENERATOR (Swiggy Instamart Assisted Pipeline)
 */
export interface ManualObservationInput {
  platformId?: PlatformId;
  platform?: PlatformId;
  name?: string;
  title?: string;
  brand?: string | null;
  quantity?: string;
  packSize?: string;
  pricePaise?: number;
  priceRupees?: number;
  originalPricePaise?: number;
  mrpPaise?: number;
  mrpRupees?: number;
  discountPercentage?: number;
  availabilityStatus?: ObservationAvailabilityStatus;
  availability?: string;
  productUrl?: string;
  imageUrl?: string | null;
  pincode?: string;
  observedAt?: string;
  dataSource?: DataSource;
  verificationStatus?: VerificationStatus;
}

export function createManualAssistedObservation(
  input: ManualObservationInput
): NormalizedObservation {
  const name = input.name || input.title;
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Name/title is required for manual observation");
  }

  const pincode = input.pincode || "110001";
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  const platformId: PlatformId = input.platformId || input.platform || "instamart";

  // Calculate Price in Integer Paise
  let pricePaise: number;
  if (input.pricePaise !== undefined) {
    pricePaise = Math.round(Number(input.pricePaise));
  } else if (input.priceRupees !== undefined) {
    pricePaise = Math.round(Number(input.priceRupees) * 100);
  } else {
    throw new Error("Either pricePaise or priceRupees must be provided");
  }

  if (!Number.isFinite(pricePaise) || pricePaise <= 0) {
    throw new Error(`pricePaise must be a positive integer, received: ${pricePaise}`);
  }
  assertIntegerPaise(pricePaise, `Manual observation ${name}`);

  // Calculate Original Price / MRP in Integer Paise
  let originalPricePaise: number;
  if (input.originalPricePaise !== undefined) {
    originalPricePaise = Math.round(Number(input.originalPricePaise));
  } else if (input.mrpPaise !== undefined) {
    originalPricePaise = Math.round(Number(input.mrpPaise));
  } else if (input.mrpRupees !== undefined) {
    originalPricePaise = Math.round(Number(input.mrpRupees) * 100);
  } else {
    originalPricePaise = pricePaise;
  }

  let verificationStatus: VerificationStatus = input.verificationStatus || "VERIFIED";

  // Anomaly Guard
  if (originalPricePaise < pricePaise) {
    originalPricePaise = pricePaise;
    verificationStatus = "FLAGGED_ANOMALY";
  }

  const discountPercentage =
    input.discountPercentage !== undefined
      ? input.discountPercentage
      : calculateDiscountPercentage(pricePaise, originalPricePaise);

  const quantity = (input.quantity || input.packSize || "1 unit").trim();

  let availabilityStatus: ObservationAvailabilityStatus = input.availabilityStatus || "IN_STOCK";
  if (!input.availabilityStatus && input.availability) {
    availabilityStatus =
      input.availability === "available"
        ? "IN_STOCK"
        : input.availability === "low_stock"
        ? "LOW_STOCK"
        : "OUT_OF_STOCK";
  }

  let productUrl = input.productUrl;
  if (!productUrl || !isValidUrl(productUrl)) {
    if (platformId === "instamart") {
      productUrl = `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(name)}`;
    } else if (platformId === "blinkit") {
      productUrl = `https://blinkit.com/s/?q=${encodeURIComponent(name)}`;
    } else if (platformId === "zepto") {
      productUrl = `https://www.zepto.com/search?query=${encodeURIComponent(name)}`;
    } else {
      productUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(name)}`;
    }
  }

  const imageUrl = input.imageUrl && isValidUrl(input.imageUrl) ? input.imageUrl : null;
  const observedAt = input.observedAt || new Date().toISOString();
  const dataSource: DataSource = input.dataSource || "manual_assisted";

  let normalizedUnitPricePaise: number | undefined;
  try {
    const norm = parseAndNormalizeQuantityWithPrice(quantity, pricePaise);
    normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
  } catch {
    // Ignored
  }

  return NormalizedObservationSchema.parse({
    name: name.trim(),
    brand: input.brand ? input.brand.trim() : null,
    quantity,
    pricePaise,
    originalPricePaise,
    discountPercentage,
    availabilityStatus,
    platformId,
    productUrl,
    imageUrl,
    pincode,
    observedAt,
    dataSource,
    verificationStatus,
    normalizedUnitPricePaise,
  });
}

