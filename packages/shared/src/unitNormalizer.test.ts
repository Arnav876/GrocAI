import { describe, it, expect } from "vitest";
import {
  parseAndNormalizeQuantity,
  areQuantitiesCompatible,
  calculateNormalizedUnitPrice,
} from "./unitNormalizer.js";

describe("UnitNormalizer and Price Normalization", () => {
  it("normalizes volume metric strings accurately", () => {
    expect(parseAndNormalizeQuantity("1 Litre")).toEqual({ value: 1000, baseUnit: "ml", rawUnit: "litre" });
    expect(parseAndNormalizeQuantity("500 ml")).toEqual({ value: 500, baseUnit: "ml", rawUnit: "ml" });
    expect(parseAndNormalizeQuantity("2L")).toEqual({ value: 2000, baseUnit: "ml", rawUnit: "l" });
  });

  it("normalizes weight metric strings accurately", () => {
    expect(parseAndNormalizeQuantity("1 kg")).toEqual({ value: 1000, baseUnit: "g", rawUnit: "kg" });
    expect(parseAndNormalizeQuantity("500 g")).toEqual({ value: 500, baseUnit: "g", rawUnit: "g" });
    expect(parseAndNormalizeQuantity("250 gm")).toEqual({ value: 250, baseUnit: "g", rawUnit: "gm" });
  });

  it("normalizes count and dozen metrics accurately", () => {
    expect(parseAndNormalizeQuantity("6 pcs")).toEqual({ value: 6, baseUnit: "pcs", rawUnit: "pcs" });
    expect(parseAndNormalizeQuantity("1 dozen")).toEqual({ value: 12, baseUnit: "pcs", rawUnit: "dozen" });
  });

  it("correctly identifies quantity compatibility within tolerance", () => {
    expect(areQuantitiesCompatible("1000 ml", "1 L")).toBe(true);
    expect(areQuantitiesCompatible("500 g", "0.5 kg")).toBe(true);
    expect(areQuantitiesCompatible("1 L", "500 ml")).toBe(false); // Different quantity
    expect(areQuantitiesCompatible("1 kg", "1 L")).toBe(false); // Incompatible units
  });

  it("calculates normalized unit prices for accurate comparison across pack sizes", () => {
    // 500ml milk packet for ₹33 -> ₹66/L
    const milk500ml = calculateNormalizedUnitPrice(3300, "500 ml");
    expect(milk500ml).not.toBeNull();
    expect(milk500ml?.unit).toBe("L");
    expect(milk500ml?.pricePerUnitPaise).toBe(6600);
    expect(milk500ml?.pricePerUnitRupees).toBe(66);
    expect(milk500ml?.displayUnitPrice).toBe("₹66.00 / L");

    // 1 Litre milk packet for ₹64 -> ₹64/L
    const milk1L = calculateNormalizedUnitPrice(6400, "1 L");
    expect(milk1L).not.toBeNull();
    expect(milk1L?.unit).toBe("L");
    expect(milk1L?.pricePerUnitPaise).toBe(6400);
    expect(milk1L?.pricePerUnitRupees).toBe(64);
    expect(milk1L?.displayUnitPrice).toBe("₹64.00 / L");

    // Compare: 1L packet at ₹64/L is cheaper than 500ml packet at ₹66/L
    expect(milk1L!.pricePerUnitPaise).toBeLessThan(milk500ml!.pricePerUnitPaise);

    // 500g rice for ₹45 -> ₹90/kg
    const rice500g = calculateNormalizedUnitPrice(4500, "500 g");
    expect(rice500g?.pricePerUnitRupees).toBe(90);
    expect(rice500g?.displayUnitPrice).toBe("₹90.00 / kg");

    // 6 pcs eggs for ₹54 -> ₹9/pc
    const eggs6 = calculateNormalizedUnitPrice(5400, "6 pcs");
    expect(eggs6?.pricePerUnitRupees).toBe(9);
    expect(eggs6?.displayUnitPrice).toBe("₹9.00 / pc");
  });
});
