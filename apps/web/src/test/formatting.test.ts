import { describe, it, expect } from "vitest";
import { formatINR, paiseToRupees, rupeesToPaise, formatFeeRangeINR } from "@groqai/shared";

describe("Frontend Price and Unit Formatting", () => {
  it("formats integer paise to Indian Rupee strings accurately", () => {
    // 5400 paise -> ₹54
    expect(formatINR(5400)).toContain("54");
    // 125050 paise -> ₹1,250.50
    expect(formatINR(125050)).toContain("1,250.5");
  });

  it("converts rupees to paise without floating-point errors", () => {
    expect(rupeesToPaise(54.99)).toBe(5499);
    expect(rupeesToPaise(100.5)).toBe(10050);
    expect(paiseToRupees(5499)).toBe(54.99);
  });

  it("formats fee ranges with min and max rupees without coercing to zero", () => {
    const formatted = formatFeeRangeINR(500, 1500);
    expect(formatted).toBe("₹5 – ₹15");
    expect(formatted).not.toContain("₹0");
  });
});
