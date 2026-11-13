import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation, NormalizedObservation } from "@groqai/shared";
import { parseBigBasketSearchPayload } from "../payloadNormalizers.js";
import { resolvePincodeCoordinates } from "../../services/pincodeGeocoder.js";
import { obscuraService } from "../browser/obscuraService.js";

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

export interface BigBasketSessionCache {
  pincode: string;
  cookies: Array<{ name: string; value: string; domain?: string; path?: string }>;
  expiresAt: number;
}

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes
const sessionCache = new Map<string, BigBasketSessionCache>();

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

  /**
   * Real-Time Live BigBasket Search via ObscuraService CDP with Akamai Warm-Up
   * 1. Clean TLS session warm-up (navigates to bigbasket.com to obtain Akamai telemetry cookies _abck, bm_sz)
   * 2. Location cookie injection post-warmup (Base64 _bb_lat_long, _bb_addressinfo, _bb_pin_code, _bb_vid)
   * 3. Response interception (/listing-svc/v2/products) + SSR <script id="__NEXT_DATA__"> fallback
   * 4. 20-minute session caching
   * 5. Graceful degradation (returns empty array on error, zero crashes)
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
      console.warn(`[BigBasketConnector] Geocoding fallback for ${pincode}: ${e.message}`);
    }

    try {
      const { browser, context, page } = await obscuraService.connectPlaywright();
      let interceptedPayload: any = null;

      try {
        page.on("response", async (resp) => {
          const url = resp.url();
          if (url.includes("/listing-svc/v2/products") && resp.status() === 200) {
            try {
              interceptedPayload = await resp.json();
            } catch {
              // ignore
            }
          }
        });

        // Step 1: Check session cache or perform clean TLS session warm-up
        const cachedSession = sessionCache.get(pincode);
        if (cachedSession && cachedSession.expiresAt > Date.now() && cachedSession.cookies.length > 0) {
          await context.addCookies(cachedSession.cookies as any);
        } else {
          // Warm up session cleanly without pre-forged cookies to let Akamai initialize
          await page.goto("https://www.bigbasket.com/", {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          await page.waitForTimeout(1500);

          // Step 2: Inject Base64 location cookies post-warmup
          const latLonB64 = Buffer.from(`${coords.lat}|${coords.lon}`).toString("base64");
          const addressInfoB64 = Buffer.from(
            `${coords.lat}|${coords.lon}|${coords.areaName}|${pincode}|${coords.city}`
          ).toString("base64");
          const vidB64 = Buffer.from("1").toString("base64");

          const locationCookies = [
            { name: "_bb_lat_long", value: latLonB64, domain: ".bigbasket.com", path: "/" },
            { name: "_bb_addressinfo", value: addressInfoB64, domain: ".bigbasket.com", path: "/" },
            { name: "_bb_pin_code", value: pincode, domain: ".bigbasket.com", path: "/" },
            { name: "_bb_vid", value: vidB64, domain: ".bigbasket.com", path: "/" },
          ];

          await context.addCookies(locationCookies);

          // Save warmed cookies to session cache
          const allCookies = await context.cookies(["https://www.bigbasket.com"]);
          sessionCache.set(pincode, {
            pincode,
            cookies: allCookies,
            expiresAt: Date.now() + SESSION_TTL_MS,
          });
        }

        // Step 3: Navigate to search and capture response
        const searchUrl = this.buildSearchUrl(query, {
          locationKey: `bengaluru_${pincode}`,
          pincode,
          city: coords.city,
          latitude: coords.lat,
          longitude: coords.lon,
        });

        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

        // Wait up to 6s for /listing-svc/v2/products response
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(400);
          if (interceptedPayload) break;
        }

        if (interceptedPayload) {
          const observations = parseBigBasketSearchPayload(interceptedPayload, pincode);
          if (observations.length > 0) {
            console.info(
              `[BigBasketConnector] Intercepted /listing-svc: ${observations.length} items for "${query}" (pincode: ${pincode})`
            );
            return observations;
          }
        }

        // SSR __NEXT_DATA__ extraction fallback
        const nextData = await page
          .evaluate(() => {
            const el = document.getElementById("__NEXT_DATA__");
            return el ? JSON.parse(el.textContent || "{}") : null;
          })
          .catch(() => null);

        if (nextData) {
          const observations = parseBigBasketSearchPayload(nextData, pincode);
          if (observations.length > 0) {
            console.info(
              `[BigBasketConnector] Extracted __NEXT_DATA__: ${observations.length} items for "${query}"`
            );
            return observations;
          }
        }
      } finally {
        await page.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    } catch (err: any) {
      console.warn(
        `[BigBasketConnector] Live search error (${err.message}). Degrading gracefully.`
      );
    }

    return [];
  }
}

export const bigBasketScraper = new BigBasketScraper();

export async function searchBigBasketLive(
  query: string,
  pincode: string = "560064"
): Promise<NormalizedObservation[]> {
  return bigBasketScraper.searchLive(query, pincode);
}
