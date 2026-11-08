import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseBlinkitSearchPayload,
  parseZeptoSearchPayload,
  parseBigBasketSearchPayload,
  createManualAssistedObservation,
} from "../ingestion/payloadNormalizers.js";
import { NormalizedObservationSchema } from "@groqai/shared";

function loadFixture(platform: string, filename: string): unknown {
  const p = path.resolve(__dirname, `../ingestion/platforms/__fixtures__/${platform}/${filename}`);
  const content = fs.readFileSync(p, "utf-8");
  return JSON.parse(content);
}

describe("Phase 5 — Platform Ingestion Adapters & 14-Field Normalizers", () => {
  const testPincode = "110001";

  describe("Blinkit Payload Normalizer (parseBlinkitSearchPayload)", () => {
    it("extracts items from /v1/layout/search and validates exact 14-field NormalizedObservation compliance", () => {
      const fixture = loadFixture("blinkit", "milk.json");
      const observations = parseBlinkitSearchPayload(fixture, testPincode);

      expect(observations.length).toBeGreaterThan(0);

      const first = observations[0];
      // Validate schema compliance
      const validated = NormalizedObservationSchema.safeParse(first);
      expect(validated.success).toBe(true);

      // 14 dimensions check
      expect(first.name).toBe("Milky Mist 25 g High Protein Milk");
      expect(first.brand).toBeDefined();
      expect(first.quantity).toBe("250 ml");
      expect(first.pricePaise).toBe(7900);
      expect(Number.isInteger(first.pricePaise)).toBe(true);
      expect(first.originalPricePaise).toBe(9900);
      expect(Number.isInteger(first.originalPricePaise)).toBe(true);
      expect(first.discountPercentage).toBe(20);
      expect(first.availabilityStatus).toBe("IN_STOCK");
      expect(first.platformId).toBe("blinkit");
      expect(first.productUrl).toContain("blinkit.com/prn/");
      expect(first.productUrl).toContain("1453864");
      expect(first.imageUrl).toContain("https://cdn.grofers.com");
      expect(first.pincode).toBe("110001");
      expect(first.observedAt).toBeDefined();
      expect(first.dataSource).toBe("headed_worker");
      expect(first.verificationStatus).toBe("VERIFIED");

      // Normalized unit price check
      expect(first.normalizedUnitPricePaise).toBeDefined();
      expect(first.normalizedUnitPricePaise).toBeGreaterThan(0);
    });

    it("triggers anomaly guard when originalPricePaise < pricePaise", () => {
      const anomalyPayload = {
        is_success: true,
        response: {
          snippets: [
            {
              data: {
                name: { text: "Anomalous Price Item" },
                normal_price: { text: "₹100" },
                mrp: { text: "₹80" }, // MRP lower than selling price
                variant: { text: "1 L" },
                product_id: "anom-001",
                inventory: 5,
              },
            },
          ],
        },
      };

      const obs = parseBlinkitSearchPayload(anomalyPayload, testPincode);
      expect(obs.length).toBe(1);
      expect(obs[0].pricePaise).toBe(10000);
      expect(obs[0].originalPricePaise).toBe(10000); // Normalized to pricePaise
      expect(obs[0].verificationStatus).toBe("FLAGGED_ANOMALY");
    });

    it("rejects invalid pincode with error", () => {
      const fixture = loadFixture("blinkit", "empty.json");
      expect(() => parseBlinkitSearchPayload(fixture, "invalid")).toThrow(/Invalid pincode/);
      expect(() => parseBlinkitSearchPayload(fixture, "11001")).toThrow(/Invalid pincode/);
    });

    it("handles empty or malformed payload safely returning empty array", () => {
      const emptyFix = loadFixture("blinkit", "empty.json");
      const malformedFix = loadFixture("blinkit", "malformed.json");

      expect(parseBlinkitSearchPayload(emptyFix, testPincode)).toEqual([]);
      expect(parseBlinkitSearchPayload(malformedFix, testPincode)).toEqual([]);
      expect(parseBlinkitSearchPayload(null, testPincode)).toEqual([]);
    });
  });

  describe("Zepto Payload Normalizer (parseZeptoSearchPayload)", () => {
    it("parses network JSON interception payload (Zepto BFF format) with 14-field compliance", () => {
      const fixture = loadFixture("zepto", "search-results.json");
      const observations = parseZeptoSearchPayload(fixture, testPincode);

      expect(observations.length).toBeGreaterThan(0);

      const first = observations[0];
      const validated = NormalizedObservationSchema.safeParse(first);
      expect(validated.success).toBe(true);

      expect(first.name).toContain("Amul Taaza");
      expect(first.brand).toBe("Amul");
      expect(first.quantity).toBe("1 pack (1 L)");
      expect(first.pricePaise).toBe(7700);
      expect(first.originalPricePaise).toBe(8000);
      expect(first.discountPercentage).toBe(4);
      expect(first.availabilityStatus).toBe("IN_STOCK");
      expect(first.platformId).toBe("zepto");
      expect(first.dataSource).toBe("headed_worker");
      expect(first.pincode).toBe("110001");
      expect(first.normalizedUnitPricePaise).toBeDefined();

      // Second product is out of stock (availableQuantity: 0)
      const second = observations[1];
      expect(second.availabilityStatus).toBe("OUT_OF_STOCK");
    });

    it("parses DOM card extraction fallback payload with rupee strings", () => {
      const fixture = loadFixture("zepto", "milk.json");
      const observations = parseZeptoSearchPayload(fixture, testPincode);

      expect(observations.length).toBeGreaterThan(0);

      const first = observations[0];
      const validated = NormalizedObservationSchema.safeParse(first);
      expect(validated.success).toBe(true);

      expect(first.name).toBe("Kinder Schoko-Bons Crispy | 12 pcs");
      expect(first.quantity).toBe("1 pack (67.2 g)");
      expect(first.pricePaise).toBe(13500); // "₹135" -> 13500 paise
      expect(first.originalPricePaise).toBe(15000); // "₹150" -> 15000 paise
      expect(first.discountPercentage).toBe(10);
      expect(first.platformId).toBe("zepto");
      expect(first.dataSource).toBe("headed_worker");
      expect(first.productUrl).toContain("zepto.com/pn/");
    });

    it("handles empty or malformed payload returning empty array", () => {
      const emptyFix = loadFixture("zepto", "empty.json");
      const malformedFix = loadFixture("zepto", "malformed.json");

      expect(parseZeptoSearchPayload(emptyFix, testPincode)).toEqual([]);
      expect(parseZeptoSearchPayload(malformedFix, testPincode)).toEqual([]);
    });
  });

  describe("BigBasket Payload Normalizer (parseBigBasketSearchPayload)", () => {
    it("parses /listing-svc/v2/products payload with 14-field compliance and integer paise math", () => {
      const fixture = loadFixture("bigbasket", "milk.json");
      const observations = parseBigBasketSearchPayload(fixture, testPincode);

      expect(observations.length).toBeGreaterThan(0);

      const first = observations[0];
      const validated = NormalizedObservationSchema.safeParse(first);
      expect(validated.success).toBe(true);

      expect(first.name).toBe("Pasteurised Toned Milk");
      expect(first.quantity).toBe("500 ml");
      expect(first.pricePaise).toBe(2700); // "27" INR -> 2700 paise
      expect(Number.isInteger(first.pricePaise)).toBe(true);
      expect(first.originalPricePaise).toBe(2700);
      expect(first.discountPercentage).toBe(0);
      expect(first.availabilityStatus).toBe("IN_STOCK");
      expect(first.platformId).toBe("bigbasket");
      expect(first.productUrl).toContain("bigbasket.com");
      expect(first.dataSource).toBe("headed_worker");
      expect(first.pincode).toBe("110001");
      expect(first.normalizedUnitPricePaise).toBeDefined();
    });

    it("handles empty or malformed payload returning empty array", () => {
      const emptyFix = loadFixture("bigbasket", "empty.json");
      const malformedFix = loadFixture("bigbasket", "malformed.json");

      expect(parseBigBasketSearchPayload(emptyFix, testPincode)).toEqual([]);
      expect(parseBigBasketSearchPayload(malformedFix, testPincode)).toEqual([]);
    });
  });

  describe("Manual Assisted Ingestion (createManualAssistedObservation)", () => {
    it("creates a valid 14-field manual observation for Swiggy Instamart with integer paise", () => {
      const obs = createManualAssistedObservation({
        platform: "instamart",
        title: "Amul Taaza Toned Fresh Milk",
        brand: "Amul",
        quantity: "1 L",
        pricePaise: 5400,
        mrpPaise: 5600,
        pincode: "110001",
        productUrl: "https://www.swiggy.com/instamart/item/amul-taaza-1l",
      });

      const validated = NormalizedObservationSchema.safeParse(obs);
      expect(validated.success).toBe(true);

      expect(obs.name).toBe("Amul Taaza Toned Fresh Milk");
      expect(obs.brand).toBe("Amul");
      expect(obs.quantity).toBe("1 L");
      expect(obs.pricePaise).toBe(5400);
      expect(obs.originalPricePaise).toBe(5600);
      expect(obs.discountPercentage).toBe(4);
      expect(obs.platformId).toBe("instamart");
      expect(obs.dataSource).toBe("manual_assisted");
      expect(obs.verificationStatus).toBe("VERIFIED");
      expect(obs.pincode).toBe("110001");
      expect(obs.normalizedUnitPricePaise).toBe(5400); // 5400 paise per 1 L
    });

    it("accepts priceRupees and converts deterministically to integer paise", () => {
      const obs = createManualAssistedObservation({
        platform: "instamart",
        title: "Fortune Sunlite Sunflower Oil",
        quantity: "1 L",
        priceRupees: 135.5, // 135.50 INR -> 13550 paise
        mrpRupees: 160,
        pincode: "110001",
      });

      expect(obs.pricePaise).toBe(13550);
      expect(Number.isInteger(obs.pricePaise)).toBe(true);
      expect(obs.originalPricePaise).toBe(16000);
      expect(obs.discountPercentage).toBe(15);
    });

    it("handles anomaly guard when mrp is less than selling price", () => {
      const obs = createManualAssistedObservation({
        platform: "instamart",
        title: "Test Milk",
        pricePaise: 6000,
        mrpPaise: 5000, // lower MRP
        pincode: "110001",
      });

      expect(obs.pricePaise).toBe(6000);
      expect(obs.originalPricePaise).toBe(6000);
      expect(obs.verificationStatus).toBe("FLAGGED_ANOMALY");
    });

    it("throws when title is missing or price is non-positive", () => {
      expect(() =>
        createManualAssistedObservation({
          title: "",
          pricePaise: 5000,
        })
      ).toThrow(/Name\/title is required/);

      expect(() =>
        createManualAssistedObservation({
          title: "Milk",
          pricePaise: -100,
        })
      ).toThrow(/pricePaise must be a positive integer/);
    });
  });
});

