import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation } from "@groqai/shared";

/**
 * Zepto's BFF returns numeric prices in paise (e.g. sellingPrice: 20200),
 * while older fixtures/DOM strings are rupee-formatted (e.g. "₹135").
 * Numbers are therefore treated as paise; strings are parsed as rupees.
 */
function parseZeptoPriceToPaise(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;

  if (typeof val === "number") {
    if (!Number.isFinite(val)) return undefined;
    return Math.round(val);
  }

  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    if (!cleaned) return undefined;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : Math.round(parsed * 100);
  }

  return undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function isProductNode(value: any): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const hasPrice =
    value.sellingPrice !== undefined ||
    value.discountedSellingPrice !== undefined ||
    value.price !== undefined ||
    value.sp !== undefined ||
    value.pricing?.discount?.sp !== undefined;

  const hasIdentity =
    value.product !== undefined ||
    value.productVariant !== undefined ||
    value.name !== undefined ||
    value.productName !== undefined;

  return hasPrice && hasIdentity;
}

/**
 * Zepto nests products under layout widgets/resolvers. Walk the payload and
 * collect product-shaped nodes without assuming one fixed widget shape.
 */
function collectProductNodes(node: any, out: any[], seen: Set<any>): void {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) collectProductNodes(item, out, seen);
    return;
  }

  if (isProductNode(node)) {
    out.push(node);
    return;
  }

  for (const value of Object.values(node)) {
    collectProductNodes(value, out, seen);
  }
}

export class ZeptoScraper implements PlatformScraper {
  readonly platform = "zepto" as const;

  /** Canonical, human-openable search URL stored for provenance. */
  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://www.zepto.com/search?query=${encodeURIComponent(query)}`;
  }

  /**
   * Load the search shell and trigger the search through the UI. Direct
   * navigation to `?query=` is login-gated for guests, while the in-page
   * search flow is served normally.
   */
  getNavigationUrl(_query: string, _loc: LocationContext): string {
    return "https://www.zepto.com/search";
  }

  matchesResponse(url: string): boolean {
    return url.includes("search-federator-service/api/v1/search");
  }

  /**
   * Product results are served under mode=SHOW_ALL_RESULTS. TYPED and
   * AUTOSUGGEST return the suggestion dropdown only, so waiting on them would
   * resolve before the product grid arrives.
   */
  responseFilter(url: string): boolean {
    if (!this.matchesResponse(url)) return false;
    try {
      return new URL(url).searchParams.get("mode") === "SHOW_ALL_RESULTS";
    } catch {
      return false;
    }
  }

  async interact(page: any, ctx: ScrapeContext): Promise<void> {
    const existingCards = await page
      .locator('[data-testid="product-card"]')
      .count()
      .catch(() => 0);
    if (existingCards > 0) return;

    let input = page.locator('input[placeholder*="Search"]').first();
    if ((await input.count().catch(() => 0)) === 0) {
      await page
        .locator('[data-testid="search-bar-icon"]')
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(1500);
      input = page.locator('input[placeholder*="Search"]').first();
    }

    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await input.fill("");
    await input.click();

    // Real key events are required: React's controlled search box ignores
    // programmatic value changes and never fires the autosuggest request.
    await page.keyboard.type(ctx.query, { delay: 100 });
    await page.waitForTimeout(3000);

    const showAll = page.getByText(/Show all results for/i).first();
    if ((await showAll.count().catch(() => 0)) > 0) {
      await showAll
        .click({ force: true })
        .catch(async () => page.keyboard.press("Enter"));
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(2000);
  }

  parse(payload: unknown, ctx: ScrapeContext): RawObservation[] {
    if (!payload || typeof payload !== "object") {
      console.warn("[ZeptoParser] Malformed payload (not an object)");
      return [];
    }

    const productNodes: any[] = [];
    collectProductNodes(payload, productNodes, new Set());

    // Legacy/offline fixture shape: { products: [...] }
    const legacyProducts = (payload as any)?.products;
    if (Array.isArray(legacyProducts)) {
      for (const p of legacyProducts) {
        if (p && typeof p === "object") productNodes.push(p);
      }
    }

    const observations: RawObservation[] = [];
    const seenKeys = new Set<string>();

    for (const p of productNodes) {
      if (!p || typeof p !== "object") continue;

      const title = p.product?.name || p.name || p.productName || p.title;
      if (!title) continue;

      const externalId = String(
        p.productVariant?.id || p.id || p.productId || p.productVariantId || p.pvid || ""
      );
      const packSize =
        p.productVariant?.formattedPacksize ||
        p.packSize ||
        p.pack_size ||
        p.unit ||
        undefined;

      const pricePaise = parseZeptoPriceToPaise(
        p.discountedSellingPrice ??
          p.sellingPrice ??
          p.price?.sellingPrice ??
          p.price ??
          p.sp
      );
      const mrpPaise =
        parseZeptoPriceToPaise(p.mrp ?? p.productVariant?.mrp ?? p.originalPrice) ??
        pricePaise;

      let discountPercentage = Number(p.discountPercent);
      if (!Number.isFinite(discountPercentage) || discountPercentage <= 0) {
        discountPercentage =
          mrpPaise && pricePaise && mrpPaise > pricePaise
            ? Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100)
            : 0;
      }

      const imageObj = p.productVariant?.images?.[0] || p.image;
      const imageUrl =
        typeof imageObj === "string"
          ? imageObj
          : imageObj?.path
          ? `https://cdn.zeptonow.com/production/${imageObj.path}`
          : imageObj?.name
          ? `https://cdn.zeptonow.com/production/${imageObj.name}`
          : p.imageUrl;

      const isOutOfStock =
        p.isOutOfStock === true ||
        p.outOfStock === true ||
        p.availableQuantity === 0 ||
        p.isActive === false;

      const productUrl =
        p.productUrl ||
        (externalId
          ? `https://www.zepto.com/pn/${slugify(String(title))}/pvid/${externalId}`
          : undefined);

      const dedupeKey = `${externalId}|${title}|${packSize || ""}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      observations.push({
        platform: "zepto",
        externalId: externalId || undefined,
        title,
        brand: p.product?.brand || p.brand || p.brandName,
        packSize,
        pricePaise,
        originalPricePaise: mrpPaise,
        discountPercentage,
        availability: isOutOfStock ? "unavailable" : "available",
        productUrl,
        imageUrl,
        searchUrl: this.buildSearchUrl(ctx.query, ctx.location),
        pincode: ctx.location.pincode,
        serviceableArea: ctx.location.serviceableArea,
        latitude: ctx.location.latitude,
        longitude: ctx.location.longitude,
      });
    }

    return observations;
  }

  async extractFromDom(page: any, ctx: ScrapeContext): Promise<RawObservation[]> {
    try {
      const items = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll('[data-testid="product-card"]')
        );
        return cards.map((c: any) => {
          const link = c.getAttribute("href") || "";
          const idMatch = link.match(/pvid\/([a-zA-Z0-9_-]+)/);
          const nameEl = c.querySelector('[data-slot-id="ProductName"]');
          const packEl = c.querySelector('[data-slot-id="PackSize"]');
          const priceEl = c.querySelector('[data-slot-id="EdlpPrice"]');
          const imgEl = c.querySelector("img");
          const outOfStockEl = c.querySelector("[data-is-out-of-stock]");

          const spans = priceEl
            ? Array.from(priceEl.querySelectorAll("span"))
                .map((s: any) => s.textContent?.trim() || "")
                .filter(Boolean)
            : [];

          return {
            id: idMatch ? idMatch[1] : "",
            name: nameEl?.textContent?.trim() || "",
            packSize: packEl?.textContent?.trim() || "",
            sellingPrice: spans[0] || "",
            mrp: spans[1] || spans[0] || "",
            productUrl: link.startsWith("http")
              ? link
              : `https://www.zepto.com${link}`,
            imageUrl: imgEl ? imgEl.getAttribute("src") : "",
            isOutOfStock: outOfStockEl
              ? outOfStockEl.getAttribute("data-is-out-of-stock") === "true"
              : false,
          };
        });
      });

      return this.parse({ products: items }, ctx);
    } catch (e: any) {
      console.warn("[ZeptoScraper] DOM extraction failed:", e.message);
      return [];
    }
  }
}

export const zeptoScraper = new ZeptoScraper();
