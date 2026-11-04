import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation } from "@groqai/shared";

function parseRupeeStringToPaise(str?: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.replace(/[^\d.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : Math.round(val * 100);
}

export class BlinkitScraper implements PlatformScraper {
  readonly platform = "blinkit" as const;

  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://blinkit.com/s/?q=${encodeURIComponent(query)}`;
  }

  matchesResponse(url: string): boolean {
    return url.includes("/v1/layout/search");
  }

  parse(payload: unknown, ctx: ScrapeContext): RawObservation[] {
    if (!payload || typeof payload !== "object") {
      console.warn("[BlinkitParser] Malformed payload (not an object)");
      return [];
    }

    const dataObj = payload as any;
    const snippets = dataObj?.response?.snippets;
    if (!Array.isArray(snippets)) {
      console.warn("[BlinkitParser] No snippets array found in response");
      return [];
    }

    const observations: RawObservation[] = [];

    for (const snippet of snippets) {
      const d = snippet?.data;
      if (!d || typeof d !== "object") continue;

      const title = d.name?.text || d.display_name?.text;
      if (!title) continue;

      const externalId = String(d.product_id || d.identity?.id || "");
      const brand = d.brand_name?.text || d.atc_action?.add_to_cart?.cart_item?.brand;
      const packSize = d.variant?.text || d.atc_action?.add_to_cart?.cart_item?.unit;

      const pricePaise =
        parseRupeeStringToPaise(d.normal_price?.text) ??
        (d.atc_action?.add_to_cart?.cart_item?.price !== undefined
          ? Math.round(Number(d.atc_action.add_to_cart.cart_item.price) * 100)
          : undefined);

      const mrpPaise =
        parseRupeeStringToPaise(d.mrp?.text) ??
        (d.atc_action?.add_to_cart?.cart_item?.mrp !== undefined
          ? Math.round(Number(d.atc_action.add_to_cart.cart_item.mrp) * 100)
          : pricePaise);

      let discountPercentage = 0;
      if (mrpPaise && pricePaise && mrpPaise > pricePaise) {
        discountPercentage = Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
      }

      const imageUrl = d.image?.url || d.atc_action?.add_to_cart?.cart_item?.image_url;
      const isSoldOut = Boolean(d.is_sold_out || (d.inventory !== undefined && d.inventory <= 0));

      const productUrl = externalId
        ? `https://blinkit.com/prn/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}/prid/${externalId}`
        : undefined;

      observations.push({
        platform: "blinkit",
        externalId: externalId || undefined,
        title,
        brand,
        packSize,
        pricePaise,
        originalPricePaise: mrpPaise,
        discountPercentage,
        availability: isSoldOut ? "unavailable" : "available",
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

export const blinkitScraper = new BlinkitScraper();
