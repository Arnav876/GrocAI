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

    it("regression: a query for 'Amul Gold' never matches 'Amul Taaza'", () => {
      const res = matcher.match(
        { query: "Amul Gold" },
        {
          id: "p-taaza",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(false);
    });

    it("regression: a query for '5 kg atta' never matches '1 kg atta'", () => {
      const res = matcher.match(
        { query: "Aashirvaad Shudh Chakki Atta 5 kg", packSize: "5 kg" },
        {
          id: "p-atta-1kg",
          name: "Aashirvaad Shudh Chakki Atta",
          brand: "Aashirvaad",
          variant: "Whole Wheat",
          packSize: "1 kg",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBe(0.0);
    });

    it("regression: real Zepto '1 pack (1 L)' descriptor matches a 1 L catalog pack", () => {
      const res = matcher.match(
        {
          query: "Amul Taaza Homogenised Toned Milk (Tetra Pack)",
          brand: "Amul",
          packSize: "1 pack (1 L)",
        },
        {
          id: "amul-taaza-1l",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk (3% Fat)",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("regression: verbose Zepto Gold tetra title matches the Gold 1 L catalog product", () => {
      const res = matcher.match(
        {
          query: "Amul Gold Homogenised Standardised Milk (Tetra Pack)",
          brand: "Amul",
          packSize: "1 pack (1 L)",
        },
        {
          id: "amul-gold-1l",
          name: "Amul Gold Full Cream Fresh Milk",
          brand: "Amul",
          variant: "Full Cream Milk (6% Fat)",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(true);
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("rejects a different Amul milk variant with a distinctive missing token", () => {
      const res = matcher.match(
        {
          query: "Amul Moti Toned Milk | 90 Days Shelf life",
          brand: "Amul",
          packSize: "1 pack (450 ml)",
        },
        {
          id: "amul-taaza-1l",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk (3% Fat)",
          packSize: "450 ml",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBeLessThan(0.7);
    });

    it("regression: a 12 x 1 L combo never matches a single 1 L listing", () => {
      const res = matcher.match(
        {
          query: "Amul Taaza Homogenised Toned Milk (Tetra Pack) Combo",
          brand: "Amul",
          packSize: "1 L X 12",
        },
        {
          id: "amul-taaza-1l",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk (3% Fat)",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBe(0.0);
      expect(res.reasons.some((r) => r.includes("Incompatible pack size"))).toBe(true);
    });

    it("regression: real Zepto Gold 1 L is rejected for the Taaza catalog product", () => {
      const res = matcher.match(
        {
          query: "Amul Gold Homogenised Standardised Milk (Tetra Pack)",
          brand: "Amul",
          packSize: "1 pack (1 L)",
        },
        {
          id: "amul-taaza-1l",
          name: "Amul Taaza Toned Fresh Milk",
          brand: "Amul",
          variant: "Toned Milk (3% Fat)",
          packSize: "1 L",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.reasons.some((r) => r.includes("Conflicting product variant"))).toBe(true);
    });

    it("regression: completely unrelated query never matches and is not substituted", () => {
      const res = matcher.match(
        { query: "Apple iPhone 16 Pro Max" },
        {
          id: "p-onion",
          name: "Fresh Hybrid Red Onions",
          brand: "Farm Fresh",
          variant: "Red Onions",
          packSize: "1 kg",
        }
      );
      expect(res.isMatch).toBe(false);
      expect(res.confidence).toBe(0.0);
    });
  });
});
