import fs from "fs";
import path from "path";
import { PINCODE_REGEX } from "@groqai/shared";

export interface GeoCoordinates {
  pincode: string;
  lat: number;
  lon: number;
  areaName?: string;
  city?: string;
  state?: string;
  source?: "deterministic_hub" | "cache" | "nominatim" | "postalpincode_nominatim";
}

/**
 * Instant Deterministic Hub Cache for core quick-commerce clusters (Zero Network Latency).
 */
export const DETERMINISTIC_HUBS: Record<string, GeoCoordinates> = {
  "560064": {
    pincode: "560064",
    lat: 13.1007,
    lon: 77.5963,
    areaName: "Yelahanka / Avalahalli",
    city: "Bengaluru",
    state: "Karnataka",
    source: "deterministic_hub",
  },
  "560001": {
    pincode: "560001",
    lat: 12.9716,
    lon: 77.5946,
    areaName: "MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    source: "deterministic_hub",
  },
  "110001": {
    pincode: "110001",
    lat: 28.6315,
    lon: 77.2167,
    areaName: "Connaught Place",
    city: "New Delhi",
    state: "Delhi",
    source: "deterministic_hub",
  },
  "400001": {
    pincode: "400001",
    lat: 18.9388,
    lon: 72.8354,
    areaName: "Fort",
    city: "Mumbai",
    state: "Maharashtra",
    source: "deterministic_hub",
  },
};

export class PincodeGeocoder {
  private inMemoryCache = new Map<string, GeoCoordinates>();
  private cacheFilePath: string;
  private customFetch?: typeof fetch;

  constructor(cacheDir?: string, customFetch?: typeof fetch) {
    const baseDir = cacheDir || path.resolve(process.cwd(), ".cache/groqai");
    this.cacheFilePath = path.join(baseDir, "geocache.json");
    this.customFetch = customFetch;
    this.loadDiskCache();
  }

  setFetch(fn: typeof fetch): void {
    this.customFetch = fn;
  }

  private getFetch(): typeof fetch {
    return this.customFetch || globalThis.fetch;
  }

  private loadDiskCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === "object" && "lat" in (v as any) && "lon" in (v as any)) {
              this.inMemoryCache.set(k, v as GeoCoordinates);
            }
          }
        }
      }
    } catch {
      // Non-fatal if cache read fails
    }
  }

  private saveDiskCache(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj: Record<string, GeoCoordinates> = {};
      for (const [k, v] of this.inMemoryCache.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj, null, 2), "utf8");
    } catch {
      // Non-fatal if cache write fails
    }
  }

  clearCache(): void {
    this.inMemoryCache.clear();
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
      }
    } catch {
      // Ignore
    }
  }

  getCacheSize(): number {
    return this.inMemoryCache.size;
  }

  /**
   * Resolves a 6-digit Indian postal code to geographical coordinates.
   * Multi-Tier Protocol:
   * 1. Deterministic Hubs (Instant)
   * 2. In-Memory & Disk Cache
   * 3. OpenStreetMap Nominatim Postal Search
   * 4. Postal Pincode India Fallback -> Locality Search
   */
  async resolvePincodeCoordinates(pincode: string): Promise<GeoCoordinates> {
    const trimmed = (pincode || "").trim();
    if (!PINCODE_REGEX.test(trimmed)) {
      throw new Error(`Invalid pincode: "${pincode}". Must be a valid 6-digit Indian postal code.`);
    }

    // 1. Instant Deterministic Hubs
    if (DETERMINISTIC_HUBS[trimmed]) {
      return { ...DETERMINISTIC_HUBS[trimmed] };
    }

    // 2. In-Memory & Disk Cache
    if (this.inMemoryCache.has(trimmed)) {
      return { ...this.inMemoryCache.get(trimmed)!, source: "cache" };
    }

    const fetchFn = this.getFetch();

    // 3. Tier 1: Nominatim OpenStreetMap Search
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const nomUrl = `https://nominatim.openstreetmap.org/search?postalcode=${trimmed}&country=India&format=json&limit=1`;
      const res = await fetchFn(nomUrl, {
        headers: {
          "User-Agent": "GrocAI-PriceEngine/1.0 (Lead Systems Architect Ingestion)",
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0 && data[0]?.lat && data[0]?.lon) {
          const item = data[0];
          const coords: GeoCoordinates = {
            pincode: trimmed,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            areaName: item.display_name?.split(",")?.[0]?.trim() || undefined,
            source: "nominatim",
          };
          this.inMemoryCache.set(trimmed, coords);
          this.saveDiskCache();
          return coords;
        }
      }
    } catch {
      // Tier 1 timeout/failure -> fall through to Tier 2
    }

    // 4. Tier 2: Postal Pincode India Fallback -> Locality Query
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 4000);

      const postUrl = `https://api.postalpincode.in/pincode/${trimmed}`;
      const postRes = await fetchFn(postUrl, {
        headers: { Accept: "application/json" },
        signal: controller2.signal,
      });
      clearTimeout(timeoutId2);

      if (postRes.ok) {
        const postData = (await postRes.json()) as any[];
        const offices = postData?.[0]?.PostOffice;
        if (Array.isArray(offices) && offices.length > 0) {
          const po = offices[0];
          const officeName = po.Name;
          const district = po.District;
          const state = po.State;

          // Resolve locality via Nominatim
          const locQuery = encodeURIComponent(`${officeName}, ${district}, India`);
          const controller3 = new AbortController();
          const timeoutId3 = setTimeout(() => controller3.abort(), 4000);

          const nomLocUrl = `https://nominatim.openstreetmap.org/search?q=${locQuery}&format=json&limit=1`;
          const locRes = await fetchFn(nomLocUrl, {
            headers: {
              "User-Agent": "GrocAI-PriceEngine/1.0 (Lead Systems Architect Ingestion)",
              Accept: "application/json",
            },
            signal: controller3.signal,
          });
          clearTimeout(timeoutId3);

          if (locRes.ok) {
            const locData = (await locRes.json()) as any[];
            if (Array.isArray(locData) && locData.length > 0 && locData[0]?.lat && locData[0]?.lon) {
              const coords: GeoCoordinates = {
                pincode: trimmed,
                lat: parseFloat(locData[0].lat),
                lon: parseFloat(locData[0].lon),
                areaName: officeName,
                city: district,
                state,
                source: "postalpincode_nominatim",
              };
              this.inMemoryCache.set(trimmed, coords);
              this.saveDiskCache();
              return coords;
            }
          }

          // If Nominatim locality search failed, but we have district info, default centroid
          // fallback can still provide approximate district coordinates if needed, or throw.
        }
      }
    } catch {
      // Fallback failed
    }

    throw new Error(`Unable to resolve geographical coordinates for Indian pincode: ${trimmed}`);
  }
}

export const pincodeGeocoder = new PincodeGeocoder();

export async function resolvePincodeCoordinates(pincode: string): Promise<GeoCoordinates> {
  return pincodeGeocoder.resolvePincodeCoordinates(pincode);
}

export function clearGeocodeCache(): void {
  pincodeGeocoder.clearCache();
}
