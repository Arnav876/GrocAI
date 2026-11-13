import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation, NormalizedObservation } from "@groqai/shared";
import { parseInstamartSearchPayload } from "../payloadNormalizers.js";
import { resolvePincodeCoordinates } from "../../services/pincodeGeocoder.js";
import { obscuraService } from "../browser/obscuraService.js";

/**
 * Swiggy Instamart Hybrid Scraper & Assisted Pipeline:
 * - Pathway A: ObscuraService CDP session with userLocation cookie injection & /api/instamart/search interception
 * - Pathway B: SSR window.___INITIAL_STATE___ JSON extraction fallback
 * - Pathway C: Graceful degradation to manual_assisted mode (zero crashes when PerimeterX blocks)
 */
export class InstamartScraper implements PlatformScraper {
  readonly platform = "instamart" as const;

  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(query)}`;
  }

  matchesResponse(url: string): boolean {
    return url.includes("/api/instamart/search");
  }

  parse(payload: unknown, ctx: ScrapeContext): RawObservation[] {
    const normalized = parseInstamartSearchPayload(payload, ctx.location.pincode);
    return normalized.map((norm) => ({
      platform: "instamart",
      externalId: norm.productUrl ? norm.productUrl.split("/item/")[1] : undefined,
      title: norm.name,
      brand: norm.brand || undefined,
      packSize: norm.quantity,
      pricePaise: norm.pricePaise,
      originalPricePaise: norm.originalPricePaise,
      discountPercentage: norm.discountPercentage,
      availability: norm.availabilityStatus === "IN_STOCK" ? "available" : "unavailable",
      productUrl: norm.productUrl,
      imageUrl: norm.imageUrl || undefined,
      searchUrl: this.buildSearchUrl(ctx.query, ctx.location),
      pincode: ctx.location.pincode,
      serviceableArea: ctx.location.serviceableArea,
      latitude: ctx.location.latitude,
      longitude: ctx.location.longitude,
    }));
  }

  /**
   * Real-Time Live Instamart Search
   */
  async searchLive(
    query: string,
    pincode: string = "560064"
  ): Promise<NormalizedObservation[]> {
    if (!query || !query.trim()) return [];

    const isObscuraEnabled =
      process.env.OBSCURA_ENABLED !== "false" &&
      (!process.env.VITEST || process.env.LIVE_INTEGRATION_TEST === "true");

    if (!isObscuraEnabled) {
      return [];
    }

    let coords = { lat: 13.1007, lon: 77.5963, areaName: "Yelahanka / Avalahalli", city: "Bengaluru" };
    try {
      const resolved = await resolvePincodeCoordinates(pincode);
      coords = {
        lat: resolved.lat,
        lon: resolved.lon,
        areaName: resolved.areaName || "Avalahalli",
        city: resolved.city || "Bengaluru",
      };
    } catch (e: any) {
      console.warn(`[InstamartConnector] Geocoding fallback for ${pincode}: ${e.message}`);
    }

    try {
      const { browser, context, page } = await obscuraService.connectPlaywright();
      let interceptedPayload: any = null;

      try {
        page.on("response", async (resp) => {
          const url = resp.url();
          if (url.includes("/api/instamart/search") && resp.status() === 200) {
            try {
              interceptedPayload = await resp.json();
            } catch {
              // ignore
            }
          }
        });

        // Set userLocation cookie for Instamart
        const userLocationPayload = encodeURIComponent(
          JSON.stringify({
            lat: coords.lat,
            lng: coords.lon,
            address: `${coords.areaName}, ${coords.city}`,
            area: coords.areaName,
            city: coords.city,
          })
        );

        await context.addCookies([
          { name: "userLocation", value: userLocationPayload, domain: ".swiggy.com", path: "/" },
          { name: "lat", value: String(coords.lat), domain: ".swiggy.com", path: "/" },
          { name: "lng", value: String(coords.lon), domain: ".swiggy.com", path: "/" },
        ]);

        const searchUrl = `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(
          query.trim()
        )}`;

        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

        // Pathway A: Wait up to 6s for /api/instamart/search response
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(400);
          if (interceptedPayload) break;
        }

        if (interceptedPayload) {
          const observations = parseInstamartSearchPayload(interceptedPayload, pincode);
          if (observations.length > 0) {
            console.info(
              `[InstamartConnector] Intercepted /api/instamart/search: ${observations.length} items for "${query}"`
            );
            return observations;
          }
        }

        // Pathway B: SSR window.___INITIAL_STATE___ extraction fallback
        const ssrState = await page
          .evaluate(() => {
            return (window as any).___INITIAL_STATE___ || null;
          })
          .catch(() => null);

        if (ssrState) {
          const observations = parseInstamartSearchPayload(ssrState, pincode);
          if (observations.length > 0) {
            console.info(
              `[InstamartConnector] Extracted window.___INITIAL_STATE___: ${observations.length} items for "${query}"`
            );
            return observations;
          }
        }
      } finally {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    } catch (err: any) {
      // Pathway C: Graceful degradation to manual_assisted
      console.warn(
        `[InstamartConnector] Live search failed (${err.message}). Degrading gracefully to manual_assisted mode.`
      );
    }

    return [];
  }
}

export const instamartScraper = new InstamartScraper();

export async function searchInstamartLive(
  query: string,
  pincode: string = "560064"
): Promise<NormalizedObservation[]> {
  return instamartScraper.searchLive(query, pincode);
}
