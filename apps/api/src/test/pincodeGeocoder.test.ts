import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  PincodeGeocoder,
  resolvePincodeCoordinates,
  clearGeocodeCache,
  DETERMINISTIC_HUBS,
} from "../services/pincodeGeocoder.js";

describe("Live Data Phase B — Pincode Geocoder Service", () => {
  let tempCacheDir: string;

  beforeEach(() => {
    tempCacheDir = path.join(os.tmpdir(), `geocache_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempCacheDir)) {
        fs.rmSync(tempCacheDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe("Deterministic Quick-Commerce Hubs (Instant Zero-Latency)", () => {
    it("resolves primary reference pincode 560064 (Yelahanka / Avalahalli, Bengaluru) instantly", async () => {
      const coords = await resolvePincodeCoordinates("560064");
      expect(coords.pincode).toBe("560064");
      expect(coords.lat).toBe(13.1007);
      expect(coords.lon).toBe(77.5963);
      expect(coords.city).toBe("Bengaluru");
      expect(coords.areaName).toContain("Yelahanka");
      expect(coords.source).toBe("deterministic_hub");
    });

    it("resolves major metropolitan hubs (560001, 110001, 400001) instantly without network calls", async () => {
      const blr = await resolvePincodeCoordinates("560001");
      expect(blr.lat).toBe(12.9716);
      expect(blr.lon).toBe(77.5946);
      expect(blr.city).toBe("Bengaluru");

      const del = await resolvePincodeCoordinates("110001");
      expect(del.lat).toBe(28.6315);
      expect(del.lon).toBe(77.2167);
      expect(del.city).toBe("New Delhi");

      const mum = await resolvePincodeCoordinates("400001");
      expect(mum.lat).toBe(18.9388);
      expect(mum.lon).toBe(72.8354);
      expect(mum.city).toBe("Mumbai");
    });

    it("matches DETERMINISTIC_HUBS dictionary keys and values", () => {
      expect(Object.keys(DETERMINISTIC_HUBS)).toEqual(
        expect.arrayContaining(["560064", "560001", "110001", "400001"])
      );
    });
  });

  describe("Pincode Validation Invariants", () => {
    it("rejects invalid pincodes with descriptive error message", async () => {
      const invalidCodes = ["12345", "abcdef", "012345", "", "5600641", " 56006 "];
      for (const code of invalidCodes) {
        await expect(resolvePincodeCoordinates(code)).rejects.toThrow(/Invalid pincode/);
      }
    });
  });

  describe("Multi-Tier Dynamic Geocoding & Disk Caching", () => {
    it("fetches from Tier 1 Nominatim when hub cache misses, and persists to disk cache", async () => {
      const testPincode = "500001"; // Hyderabad GPO
      const mockFetch = (async (url: string) => {
        if (url.includes("nominatim.openstreetmap.org")) {
          return {
            ok: true,
            json: async () => [
              {
                lat: "17.3850",
                lon: "78.4867",
                display_name: "Hyderabad GPO, Telangana, India",
              },
            ],
          } as any;
        }
        return { ok: false } as any;
      }) as typeof fetch;

      const geocoder = new PincodeGeocoder(tempCacheDir, mockFetch);
      const coords = await geocoder.resolvePincodeCoordinates(testPincode);

      expect(coords.pincode).toBe("500001");
      expect(coords.lat).toBe(17.385);
      expect(coords.lon).toBe(78.4867);
      expect(coords.source).toBe("nominatim");

      // Verify written to disk cache
      const cacheFile = path.join(tempCacheDir, "geocache.json");
      expect(fs.existsSync(cacheFile)).toBe(true);
      const diskContent = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      expect(diskContent["500001"]).toBeDefined();
      expect(diskContent["500001"].lat).toBe(17.385);

      // Verify second call hits in-memory cache
      const cachedCoords = await geocoder.resolvePincodeCoordinates(testPincode);
      expect(cachedCoords.source).toBe("cache");
    });

    it("falls back to Tier 2 (Postal Pincode API + Locality Search) if Tier 1 times out or fails", async () => {
      const testPincode = "600001"; // Chennai
      const mockFetch = (async (url: string) => {
        if (url.includes("postalcode=")) {
          // Tier 1 returns empty
          return { ok: true, json: async () => [] } as any;
        }
        if (url.includes("api.postalpincode.in")) {
          return {
            ok: true,
            json: async () => [
              {
                Status: "Success",
                PostOffice: [
                  {
                    Name: "Chennai G.P.O.",
                    District: "Chennai",
                    State: "Tamil Nadu",
                  },
                ],
              },
            ],
          } as any;
        }
        if (url.includes("search?q=")) {
          return {
            ok: true,
            json: async () => [
              {
                lat: "13.0827",
                lon: "80.2707",
                display_name: "Chennai, Tamil Nadu, India",
              },
            ],
          } as any;
        }
        return { ok: false } as any;
      }) as typeof fetch;

      const geocoder = new PincodeGeocoder(tempCacheDir, mockFetch);
      const coords = await geocoder.resolvePincodeCoordinates(testPincode);

      expect(coords.pincode).toBe("600001");
      expect(coords.lat).toBe(13.0827);
      expect(coords.lon).toBe(80.2707);
      expect(coords.city).toBe("Chennai");
      expect(coords.source).toBe("postalpincode_nominatim");
    });

    it("throws a clear error when all tiers fail to resolve a pincode", async () => {
      const testPincode = "999999";
      const failingFetch = (async () => ({ ok: false })) as unknown as typeof fetch;

      const geocoder = new PincodeGeocoder(tempCacheDir, failingFetch);
      await expect(geocoder.resolvePincodeCoordinates(testPincode)).rejects.toThrow(
        /Unable to resolve geographical coordinates/
      );
    });

    it("supports clearing cache via clearCache()", async () => {
      const testPincode = "500001";
      const mockFetch = (async () => ({
        ok: true,
        json: async () => [{ lat: "17.3850", lon: "78.4867" }],
      })) as unknown as typeof fetch;

      const geocoder = new PincodeGeocoder(tempCacheDir, mockFetch);
      await geocoder.resolvePincodeCoordinates(testPincode);
      expect(geocoder.getCacheSize()).toBe(1);

      geocoder.clearCache();
      expect(geocoder.getCacheSize()).toBe(0);
      const cacheFile = path.join(tempCacheDir, "geocache.json");
      expect(fs.existsSync(cacheFile)).toBe(false);
    });
  });
});
