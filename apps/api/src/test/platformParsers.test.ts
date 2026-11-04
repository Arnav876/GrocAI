import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { blinkitScraper } from "../ingestion/platforms/blinkit.js";
import { bigBasketScraper } from "../ingestion/platforms/bigbasket.js";
import { zeptoScraper } from "../ingestion/platforms/zepto.js";
import { LocationContext } from "@groqai/shared";

const mockLocation: LocationContext = {
  locationKey: "delhi_110001",
  pincode: "110001",
  city: "Central Delhi",
  latitude: 28.6304,
  longitude: 77.2177,
  serviceableArea: "Connaught Place",
};

function loadFixture(platform: string, filename: string): unknown {
  const p = path.resolve(__dirname, `../ingestion/platforms/__fixtures__/${platform}/${filename}`);
  const content = fs.readFileSync(p, "utf-8");
  return JSON.parse(content);
}

describe("Epic 3 — Platform Parsers with Real & Synthetic Fixtures", () => {
  describe("Blinkit Parser", () => {
    it("parses normal milk fixture and outputs valid RawObservations", () => {
      const fixture = loadFixture("blinkit", "milk.json");
      const ctx = { platform: "blinkit" as const, query: "milk", location: mockLocation };

      const obs = blinkitScraper.parse(fixture, ctx);
      expect(obs.length).toBeGreaterThan(0);

      const first = obs[0];
      expect(first.platform).toBe("blinkit");
      expect(first.title).toBeDefined();
      expect(typeof first.title).toBe("string");
      expect(first.pricePaise).toBeGreaterThan(0);
      expect(Number.isInteger(first.pricePaise)).toBe(true);
      expect(first.originalPricePaise).toBeGreaterThanOrEqual(first.pricePaise!);
      expect(first.pincode).toBe("110001");
      expect(first.searchUrl).toContain("blinkit.com/s/?q=milk");
    });

    it("handles empty snippets gracefully by returning []", () => {
      const fixture = loadFixture("blinkit", "empty.json");
      const ctx = { platform: "blinkit" as const, query: "milk", location: mockLocation };

      const obs = blinkitScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });

    it("handles malformed payload without throwing", () => {
      const fixture = loadFixture("blinkit", "malformed.json");
      const ctx = { platform: "blinkit" as const, query: "milk", location: mockLocation };

      const obs = blinkitScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });
  });

  describe("BigBasket Parser", () => {
    it("parses normal milk fixture and outputs valid RawObservations", () => {
      const fixture = loadFixture("bigbasket", "milk.json");
      const ctx = { platform: "bigbasket" as const, query: "milk", location: mockLocation };

      const obs = bigBasketScraper.parse(fixture, ctx);
      expect(obs.length).toBeGreaterThan(0);

      const first = obs[0];
      expect(first.platform).toBe("bigbasket");
      expect(first.title).toBeDefined();
      expect(first.brand).toBeDefined();
      expect(first.packSize).toBeDefined();
      expect(first.pricePaise).toBeGreaterThan(0);
      expect(Number.isInteger(first.pricePaise)).toBe(true);
      expect(first.productUrl).toContain("bigbasket.com");
    });

    it("handles empty products array gracefully", () => {
      const fixture = loadFixture("bigbasket", "empty.json");
      const ctx = { platform: "bigbasket" as const, query: "milk", location: mockLocation };

      const obs = bigBasketScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });

    it("handles malformed payload without throwing", () => {
      const fixture = loadFixture("bigbasket", "malformed.json");
      const ctx = { platform: "bigbasket" as const, query: "milk", location: mockLocation };

      const obs = bigBasketScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });
  });

  describe("Zepto Parser", () => {
    it("parses normal milk fixture and outputs valid RawObservations", () => {
      const fixture = loadFixture("zepto", "milk.json");
      const ctx = { platform: "zepto" as const, query: "milk", location: mockLocation };

      const obs = zeptoScraper.parse(fixture, ctx);
      expect(obs.length).toBe(6);

      const first = obs[0];
      expect(first.platform).toBe("zepto");
      expect(first.title).toContain("Kinder");
      expect(first.pricePaise).toBe(13500); // ₹135 -> 13500 paise
      expect(first.originalPricePaise).toBe(15000); // ₹150 -> 15000 paise
      expect(first.discountPercentage).toBe(10);
      expect(first.availability).toBe("available");
      expect(first.productUrl).toContain("zepto.com/pn/");
    });

    it("handles empty products array gracefully", () => {
      const fixture = loadFixture("zepto", "empty.json");
      const ctx = { platform: "zepto" as const, query: "milk", location: mockLocation };

      const obs = zeptoScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });

    it("handles malformed payload without throwing", () => {
      const fixture = loadFixture("zepto", "malformed.json");
      const ctx = { platform: "zepto" as const, query: "milk", location: mockLocation };

      const obs = zeptoScraper.parse(fixture, ctx);
      expect(obs).toEqual([]);
    });
  });
});
