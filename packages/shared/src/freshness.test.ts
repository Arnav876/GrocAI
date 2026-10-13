import { describe, it, expect } from "vitest";
import { isPriceStale, formatTimeAgo, DEFAULT_PRICE_TTL_MS } from "./freshness.js";

describe("Freshness utility", () => {
  it("flags observations older than 6 hours as stale", () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(isPriceStale(sevenHoursAgo)).toBe(true);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isPriceStale(twoHoursAgo)).toBe(false);
  });

  it("handles invalid date strings gracefully", () => {
    expect(isPriceStale("invalid-date")).toBe(true);
    expect(formatTimeAgo("invalid-date")).toBe("Unknown");
  });

  it("formats human friendly relative time strings", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatTimeAgo(recent)).toBe("5m ago");

    const hours = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatTimeAgo(hours)).toBe("3h ago");
  });
});
