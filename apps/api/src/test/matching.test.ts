import { describe, it, expect } from "vitest";
import { MatchingService } from "../matching/matchingService.js";
import { parseAndNormalizeQuantity, areQuantitiesCompatible } from "../matching/unitNormalizer.js";

describe("Matching Service & Unit Normalization", () => {
  const matcher = new MatchingService();

  describe("Unit Normalization", () => {
    it("normalizes volume between litres and millilitres", () => {
      const oneL = parseAndNormalizeQuantity("1 L");
      const thousandMl = parseAndNormalizeQuantity("1000 ml");
      expect(oneL.value).toBe(1000);
      expect(oneL.baseUnit).toBe("ml");
      expect(thousandMl.value).toBe(1000);
      expect(thousandMl.baseUnit).toBe("ml");
      expect(areQuantitiesCompatible("1 L", "1000 ml")).toBe(true);
      expect(areQuantitiesCompatible("1L", "500 ml")).toBe(false);
    });

    it("normalizes weight between kg and grams", () => {
      const fiveKg = parseAndNormalizeQuantity("5 kg");
      const fiveThousandG = parseAndNormalizeQuantity("5000 g");
      expect(fiveKg.value).toBe(5000);
      expect(fiveKg.baseUnit).toBe("g");
      expect(areQuantitiesCompatible("5 kg", "5000 g")).toBe(true);
      expect(areQuantitiesCompatible("1 kg", "500 g")).toBe(false);
    });

    it("normalizes counts and dozens", () => {
      const oneDozen = parseAndNormalizeQuantity("1 dozen");
      expect(oneDozen.value).toBe(12);
      expect(oneDozen.baseUnit).toBe("pcs");
      expect(areQuantitiesCompatible("1 dozen", "12 pcs")).toBe(true);
    });
  });

  describe("Deterministic Variant & Brand Guards", () => {
    it("matches same product and compatible pack size with high confidence", () => {
      const res = matcher.match(
        { query: "Amul Taaza Milk", packSize: "1 L" },
        {
          id: "p1",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk",
          packSize: "1000 ml",
        }
      );
      expect(res.isMatch).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.85);
      expect(res.needsReview).toBe(false);
    });

    it("strictly rejects conflicting product variants (Amul Taaza vs Amul Gold)", () => {
      const res = matcher.match(
        { query: "Amul Taaza Toned Milk", variant: "Toned" },
        {
          id: "p2",
          name: "Amul Gold Full Cream Fresh Milk",
          brand: "Amul",
          variant: "Full Cream Milk",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBeLessThan(0.5);
      expect(res.reasons.some((r) => r.includes("Conflicting product variant"))).toBe(true);
    });

    it("strictly rejects incompatible pack sizes (1L vs 5L)", () => {
      const res = matcher.match(
        { query: "Fortune Sunflower Oil", packSize: "1 L" },
        {
          id: "p3",
          name: "Fortune Sunlite Refined Sunflower Oil Jar",
          brand: "Fortune",
          variant: "Refined Sunflower",
          packSize: "5 L",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBe(0.0);
      expect(res.reasons.some((r) => r.includes("Incompatible pack size"))).toBe(true);
    });

    it("flags low confidence candidate as needing review without silently equating", () => {
      const res = matcher.match(
        { query: "Organic Brown Eggs" },
        {
          id: "p4",
          name: "Farm Fresh Table White Eggs",
          brand: "FreshFarm",
          variant: "White Eggs",
          packSize: "6 pcs",
        }
      );
      // Conflicting brown vs white variant triggers rejection
      expect(res.isMatch).toBe(false);
    });
  });
});
