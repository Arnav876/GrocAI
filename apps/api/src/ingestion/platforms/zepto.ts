import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation } from "@groqai/shared";

function parseRupeeStringToPaise(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") return Math.round(val * 100);
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : Math.round(parsed * 100);
  }
  return undefined;
}

export class ZeptoScraper implements PlatformScraper {
  readonly platform = "zepto" as const;

  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://www.zepto.com/search?q=${encodeURIComponent(query)}`;
  }

  matchesResponse(url: string): boolean {
    return url.includes("zepto.com/search") || url.includes("bff-gateway.zepto.com");
  }

  parse(payload: unknown, ctx: ScrapeContext): RawObservation[] {
    if (!payload || typeof payload !== "object") {
      console.warn("[ZeptoParser] Malformed payload (not an object)");
      return [];
    }

    const dataObj = payload as any;
    const products = dataObj?.products;
    if (!Array.isArray(products)) {
      return [];
    }

    const observations: RawObservation[] = [];

    for (const p of products) {
      if (!p || typeof p !== "object") continue;

      const title = p.name || p.title;
      if (!title) continue;

      const externalId = p.id;
      const packSize = p.packSize;
      const pricePaise = parseRupeeStringToPaise(p.sellingPrice ?? p.price);
      const mrpPaise = parseRupeeStringToPaise(p.mrp) ?? pricePaise;

      let discountPercentage = 0;
      if (mrpPaise && pricePaise && mrpPaise > pricePaise) {
        discountPercentage = Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
      }

      observations.push({
        platform: "zepto",
        externalId: externalId || undefined,
        title,
        brand: p.brand,
        packSize,
        pricePaise,
        originalPricePaise: mrpPaise,
        discountPercentage,
        availability: p.isOutOfStock ? "unavailable" : "available",
        productUrl: p.productUrl,
        imageUrl: p.imageUrl,
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
        const cards = Array.from(document.querySelectorAll("[data-testid=\"product-card\"]"));
        return cards.map((c: any) => {
          const link = c.getAttribute("href") || "";
          const idMatch = link.match(/pvid\/([a-zA-Z0-9_-]+)/);
          const nameEl = c.querySelector("[data-slot-id=\"ProductName\"]");
          const packEl = c.querySelector("[data-slot-id=\"PackSize\"]");
          const priceEl = c.querySelector("[data-slot-id=\"EdlpPrice\"]");
          const imgEl = c.querySelector("img");
          const outOfStockEl = c.querySelector("[data-is-out-of-stock]");

          const spans = priceEl
            ? Array.from(priceEl.querySelectorAll("span")).map((s: any) => s.innerText.trim())
            : [];

          return {
            id: idMatch ? idMatch[1] : "",
            name: nameEl ? nameEl.innerText.trim() : "",
            packSize: packEl ? packEl.innerText.trim() : "",
            sellingPrice: spans[0] || "",
            mrp: spans[1] || spans[0] || "",
            productUrl: link.startsWith("http") ? link : `https://www.zepto.com${link}`,
            imageUrl: imgEl ? imgEl.getAttribute("src") : "",
            isOutOfStock: outOfStockEl ? outOfStockEl.getAttribute("data-is-out-of-stock") === "true" : false,
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
