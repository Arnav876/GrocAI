import { describe, it, expect } from "vitest";
import { rupeesToPaise, paiseToRupees, formatINR, formatFeeRangeINR } from "./money.js";

describe("Money utility", () => {
  it("converts rupees to paise accurately", () => {
    expect(rupeesToPaise(10)).toBe(1000);
    expect(rupeesToPaise(24.5)).toBe(2450);
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(99.99)).toBe(9999);
  });

  it("converts paise to rupees accurately", () => {
    expect(paiseToRupees(1000)).toBe(10);
    expect(paiseToRupees(2450)).toBe(24.5);
    expect(paiseToRupees(0)).toBe(0);
  });

  it("formats INR currency string properly", () => {
    const formatted1 = formatINR(125000); // 1250 rupees
    expect(formatted1).toContain("1,250");
    const formatted2 = formatINR(500); // 5 rupees
    expect(formatted2).toContain("5");
  });

  it("formats fee ranges with min and max rupees", () => {
    const range = formatFeeRangeINR(500, 1500);
    expect(range).toBe("₹5 – ₹15");
  });
});
