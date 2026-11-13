import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation, NormalizedObservation } from "@groqai/shared";
import { parseBlinkitSearchPayload } from "../payloadNormalizers.js";
import { resolvePincodeCoordinates } from "../../services/pincodeGeocoder.js";
import { obscuraService } from "../browser/obscuraService.js";

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

  /**
   * Legacy / Worker scraper parser returning RawObservation[]
   */
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

  /**
   * Real-Time Live Search (Phase B Multi-Tier Architecture):
   * Tier 1: Direct HTTP/TLS fetch to Blinkit BFF (/v1/layout/search) with location headers
   * Tier 2: ObscuraService CDP session fallback
   * Tier 3: Graceful degradation (returns empty array, zero crashes)
   */
  async searchLive(
    query: string,
    pincode: string = "560064"
  ): Promise<NormalizedObservation[]> {
    if (!query || !query.trim()) return [];

    let coords = { lat: 13.1007, lon: 77.5963 };
    try {
      const resolved = await resolvePincodeCoordinates(pincode);
      coords = { lat: resolved.lat, lon: resolved.lon };
    } catch (e: any) {
      console.warn(`[BlinkitConnector] Geocoding fallback for ${pincode}: ${e.message}`);
    }

    // Tier 1: Direct HTTP/TLS BFF call
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const targetUrl = `https://blinkit.com/v1/layout/search?q=${encodeURIComponent(
        query.trim()
      )}&search_type=type_to_search`;

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          lat: String(coords.lat),
          lon: String(coords.lon),
          app_client: "consumer_web",
          web_app_version: "1008018",
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: "{}",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const observations = parseBlinkitSearchPayload(json, pincode);
        if (observations.length > 0) {
          console.info(
            `[BlinkitConnector] Tier 1 Direct BFF succeeded: ${observations.length} items for "${query}" (pincode: ${pincode})`
          );
          return observations;
        }
      } else {
        console.warn(
          `[BlinkitConnector] Tier 1 returned status ${response.status}. Attempting Tier 2 CDP fallback...`
        );
      }
    } catch (tier1Err: any) {
      console.warn(
        `[BlinkitConnector] Tier 1 fetch error (${tier1Err.message}). Attempting Tier 2 CDP fallback...`
      );
    }

    // Tier 2: ObscuraService CDP / Playwright fallback
    const isObscuraEnabled =
      process.env.OBSCURA_ENABLED !== "false" &&
      (!process.env.VITEST || process.env.LIVE_INTEGRATION_TEST === "true");

    if (isObscuraEnabled) {
      try {
        const { browser, context, page } = await obscuraService.connectPlaywright();
        let interceptedPayload: any = null;

        try {
          const searchUrl = `https://blinkit.com/s/?q=${encodeURIComponent(query.trim())}`;

          page.on("response", async (resp) => {
            if (resp.url().includes("/v1/layout/search") && resp.status() === 200) {
              try {
                interceptedPayload = await resp.json();
              } catch {
                // ignore
              }
            }
          });

          // Set location cookies if needed
          await context.addCookies([
            { name: "gr_1_lat", value: String(coords.lat), domain: ".blinkit.com", path: "/" },
            { name: "gr_1_lng", value: String(coords.lon), domain: ".blinkit.com", path: "/" },
          ]);

          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

          for (let i = 0; i < 15; i++) {
            await page.waitForTimeout(400);
            if (interceptedPayload) break;
          }

          if (interceptedPayload) {
            const observations = parseBlinkitSearchPayload(interceptedPayload, pincode);
            if (observations.length > 0) {
              console.info(
                `[BlinkitConnector] Tier 2 Obscura CDP succeeded: ${observations.length} items for "${query}"`
              );
              return observations;
            }
          }
        } finally {
          await page.close().catch(() => {});
          await browser.close().catch(() => {});
        }
      } catch (tier2Err: any) {
        console.warn(`[BlinkitConnector] Tier 2 CDP error: ${tier2Err.message}`);
      }
    }

    // Tier 3: Graceful degradation (empty array)
    console.warn(
      `[BlinkitConnector] Live search returned 0 items for "${query}" across all tiers. Degrading gracefully.`
    );
    return [];
  }
}

export const blinkitScraper = new BlinkitScraper();

export async function searchBlinkitLive(
  query: string,
  pincode: string = "560064"
): Promise<NormalizedObservation[]> {
  return blinkitScraper.searchLive(query, pincode);
}
