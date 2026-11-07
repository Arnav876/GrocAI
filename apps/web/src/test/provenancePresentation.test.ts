import { describe, it, expect } from "vitest";
import { DataProvenance } from "@groqai/shared";
import { describeProvenance } from "../services/provenancePresentation.js";

function provenance(overrides: Partial<DataProvenance> = {}): DataProvenance {
  return {
    locationKey: "delhi_110001",
    pincode: "110001",
    generatedAt: "2026-11-07T09:00:00.000Z",
    status: "mixed",
    counts: {
      totalListings: 10,
      availableListings: 9,
      liveSourceListings: 3,
      manualListings: 1,
      mockListings: 6,
      unknownSourceListings: 0,
      liveVerifiedListings: 2,
      cachedListings: 1,
      staleListings: 1,
      unavailableListings: 1,
      unverifiedListings: 0,
      estimateListings: 6,
    },
    bySourceType: {
      authorized_api: 0,
      partner_feed: 0,
      permitted_page: 3,
      manual: 1,
      mock: 6,
    },
    byVerification: {
      live_verified: 2,
      cached: 1,
      stale: 1,
      unverified: 0,
      unavailable: 1,
      estimate: 6,
    },
    lastObservedAt: "2026-11-07T08:55:00.000Z",
    platforms: [],
    disclaimer: "test",
    ...overrides,
  };
}

describe("Data provenance banner copy", () => {
  it("labels a mixed environment honestly with every source count", () => {
    const result = describeProvenance(provenance());
    expect(result.tone).toBe("mixed");
    expect(result.badge).toBe("MIXED DATA");
    expect(result.message).toContain("3 live");
    expect(result.message).toContain("1 manual");
    expect(result.message).toContain("6 simulated");
    expect(result.detail).toContain("2 live-verified");
    expect(result.detail).toContain("1 stale");
    expect(result.detail).toContain("verify at checkout");
  });

  it("never claims live for simulated-only data", () => {
    const result = describeProvenance(
      provenance({
        status: "mock",
        counts: {
          ...provenance().counts,
          liveSourceListings: 0,
          manualListings: 0,
          mockListings: 10,
          liveVerifiedListings: 0,
          cachedListings: 0,
          staleListings: 0,
          estimateListings: 10,
        },
      })
    );
    expect(result.tone).toBe("mock");
    expect(result.badge).toBe("MOCK DATA");
    expect(result.detail).toContain("10 simulated listings");
  });

  it("labels fully live-captured data as live with freshness caveats", () => {
    const result = describeProvenance(
      provenance({
        status: "live",
        counts: {
          ...provenance().counts,
          liveSourceListings: 10,
          manualListings: 0,
          mockListings: 0,
          liveVerifiedListings: 8,
          cachedListings: 2,
          staleListings: 0,
          estimateListings: 0,
        },
      })
    );
    expect(result.tone).toBe("live");
    expect(result.badge).toBe("LIVE DATA");
    expect(result.message).toContain("10 of 10 listings captured live");
    expect(result.detail).toContain("8 live-verified");
  });

  it("shows no-data instead of an empty live claim", () => {
    const result = describeProvenance(
      provenance({
        status: "empty",
        counts: {
          ...provenance().counts,
          totalListings: 0,
          availableListings: 0,
          liveSourceListings: 0,
          manualListings: 0,
          mockListings: 0,
          liveVerifiedListings: 0,
          cachedListings: 0,
          staleListings: 0,
          unavailableListings: 0,
          estimateListings: 0,
        },
      })
    );
    expect(result.tone).toBe("empty");
    expect(result.badge).toBe("NO DATA");
    expect(result.message).toContain("No prices captured");
  });

  it("surfaces unrecognized source rows rather than hiding them", () => {
    const result = describeProvenance(
      provenance({
        counts: { ...provenance().counts, unknownSourceListings: 2 },
      })
    );
    expect(result.detail).toContain("2 unknown source");
  });
});
