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

export class BigBasketScraper implements PlatformScraper {
  readonly platform = "bigbasket" as const;

  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`;
  }

  matchesResponse(url: string): boolean {
    return url.includes("/listing-svc/v2/products");
  }

  parse(payload: unknown, ctx: ScrapeContext): RawObservation[] {
    if (!payload || typeof payload !== "object") {
      console.warn("[BigBasketParser] Malformed payload (not an object)");
      return [];
    }

    const dataObj = payload as any;
    const tabs = dataObj?.tabs;
    if (!Array.isArray(tabs) || tabs.length === 0) {
      console.warn("[BigBasketParser] No tabs array found in payload");
      return [];
    }

    const productInfo = tabs.find((t: any) => t?.product_info?.products)?.product_info;
    const products = productInfo?.products;
    if (!Array.isArray(products)) {
      return [];
    }

    const observations: RawObservation[] = [];

    for (const p of products) {
      if (!p || typeof p !== "object") continue;

      const title = p.desc;
      if (!title) continue;

      const externalId = String(p.id || "");
      const brand = p.brand?.name;
      const packSize = p.w || p.pack_desc || p.unit;
      const quantity = p.magnitude ? parseFloat(p.magnitude) : undefined;
      const unit = p.unit;

      const pricePaise =
        parseRupeeStringToPaise(p.pricing?.discount?.prim_price?.sp) ??
        parseRupeeStringToPaise(p.pricing?.discount?.sp);

      const mrpPaise =
        parseRupeeStringToPaise(p.pricing?.discount?.mrp) ?? pricePaise;

      let discountPercentage = 0;
      if (mrpPaise && pricePaise && mrpPaise > pricePaise) {
        discountPercentage = Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
      }

      const imageUrl = p.images?.[0]?.s || p.images?.[0]?.m || p.images?.[0]?.l;
      const isUnavailable = Boolean(p.availability?.not_for_sale);

      const productUrl = p.absolute_url
        ? p.absolute_url.startsWith("http")
          ? p.absolute_url
          : `https://www.bigbasket.com${p.absolute_url}`
        : undefined;

      observations.push({
        platform: "bigbasket",
        externalId: externalId || undefined,
        title,
        brand,
        packSize,
        quantity: isNaN(quantity as number) ? undefined : quantity,
        unit,
        pricePaise,
        originalPricePaise: mrpPaise,
        discountPercentage,
        availability: isUnavailable ? "unavailable" : "available",
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
}

export const bigBasketScraper = new BigBasketScraper();
