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
 * 3. BIGBASKET: Deterministic Payload Normalizer (/listing-svc/v2/products)
 */
export function parseBigBasketSearchPayload(
  rawJson: unknown,
  pincode: string = "110001"
): NormalizedObservation[] {
  if (!PINCODE_REGEX.test(pincode)) {
    throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
  }

  if (!rawJson || typeof rawJson !== "object") {
    return [];
  }

  const dataObj = rawJson as any;
  const tabs = dataObj?.tabs;
  if (!Array.isArray(tabs)) {
    return [];
  }

  const productInfo = tabs.find((t: any) => t?.product_info?.products)?.product_info;
  const products = productInfo?.products;
  if (!Array.isArray(products)) {
    return [];
  }

  const results: NormalizedObservation[] = [];
  const now = new Date().toISOString();

  for (const p of products) {
    if (!p || typeof p !== "object") continue;

    const name = p.desc;
    if (!name || typeof name !== "string" || !name.trim()) continue;

    const externalId = String(p.id || "");
    const brand = p.brand?.name || null;
    const quantity = p.w || p.pack_desc || (p.magnitude ? `${p.magnitude} ${p.unit || ""}`.trim() : "1 unit");

    // BigBasket prices in listing-svc are rupee strings/numbers (e.g. "27" or 27)
    const rawSp = p.pricing?.discount?.prim_price?.sp ?? p.pricing?.discount?.sp;
    const pricePaise = parseRupeeStringToPaise(rawSp);

    if (pricePaise === undefined || pricePaise <= 0) continue;
    assertIntegerPaise(pricePaise, `BigBasket item ${name}`);

    const rawMrp = p.pricing?.discount?.mrp;
    let originalPricePaise = parseRupeeStringToPaise(rawMrp) ?? pricePaise;

    let verificationStatus: VerificationStatus = "VERIFIED";
    if (originalPricePaise < pricePaise) {
      originalPricePaise = pricePaise;
      verificationStatus = "FLAGGED_ANOMALY";
    }

    const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);

    const isUnavailable = Boolean(p.availability?.not_for_sale);
    const availabilityStatus: ObservationAvailabilityStatus = isUnavailable ? "UNAVAILABLE" : "IN_STOCK";

    let productUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(name)}`;
    if (p.absolute_url) {
      productUrl = p.absolute_url.startsWith("http")
        ? p.absolute_url
        : `https://www.bigbasket.com${p.absolute_url}`;
    }

    const rawImg = p.images?.[0]?.s || p.images?.[0]?.m || p.images?.[0]?.l;
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

