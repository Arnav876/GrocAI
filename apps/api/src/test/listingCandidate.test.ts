import { describe, it, expect } from "vitest";
import { PriceObservation } from "@groqai/shared";
import {
  ListingCandidate,
  isBetterListingCandidate,
  isMultipackOrCombo,
} from "../ingestion/listingCandidate.js";

function observation(overrides: Partial<PriceObservation> = {}): PriceObservation {
  return {
    platform: "zepto",
    title: "Amul Taaza Toned Fresh Milk",
    packSize: "1 L",
    pricePaise: 7700,
    availability: "available",
    currency: "INR",
    sourceType: "permitted_page",
    observedAt: "2026-11-07T09:00:00.000Z",
    confidence: 0.9,
    ...overrides,
  };
}

function candidate(overrides: Partial<PriceObservation> = {}): ListingCandidate {
  return {
    productId: "amul-taaza-1l",
    platform: "zepto",
    locationKey: "delhi_110001",
    observation: observation(overrides),
    confidence: overrides.confidence ?? 0.9,
  };
}

describe("Listing representative selection", () => {
  it("detects multipacks and combos in either quantity order", () => {
    expect(isMultipackOrCombo("500 ml X 2", "Amul Taaza")).toBe(true);
    expect(isMultipackOrCombo("2 x 1 L", "Amul Taaza")).toBe(true);
    expect(isMultipackOrCombo("1 L", "Amul Taaza Toned Milk Combo")).toBe(true);
    expect(isMultipackOrCombo("1 pack (1 L)", "Amul Taaza Tetra Pack")).toBe(false);
  });

  it("prefers an available observation over an unavailable one", () => {
    const available = candidate({
      title: "Amul Gold Homogenised Milk (Tetra Pack)",
      pricePaise: 8300,
      availability: "available",
    });
    const unavailable = candidate({
      title: "Amul Gold Full Cream Fresh Milk | Pouch",
      pricePaise: 7200,
      availability: "unavailable",
    });
    expect(isBetterListingCandidate(available, unavailable)).toBe(true);
    expect(isBetterListingCandidate(unavailable, available)).toBe(false);
  });

  it("prefers a single pack over a cheaper combo", () => {
    const single = candidate({
      title: "Amul Taaza Homogenised Toned Milk (Tetra Pack)",
      packSize: "1 pack (1 L)",
      pricePaise: 7700,
    });
    const combo = candidate({
      title: "Amul Taaza Toned Fresh Milk (Pouch) Combo",
      packSize: "500 ml X 2",
      pricePaise: 6000,
    });
    expect(isBetterListingCandidate(single, combo)).toBe(true);
    expect(isBetterListingCandidate(combo, single)).toBe(false);
  });

  it("uses confidence and then price as deterministic tie-breakers", () => {
    const highConfidence = candidate({ confidence: 0.95, pricePaise: 7900 });
    const lowConfidence = candidate({ confidence: 0.8, pricePaise: 7000 });
    expect(isBetterListingCandidate(highConfidence, lowConfidence)).toBe(true);

    const cheaper = candidate({ confidence: 0.9, pricePaise: 7000 });
    const pricier = candidate({ confidence: 0.9, pricePaise: 7700 });
    expect(isBetterListingCandidate(cheaper, pricier)).toBe(true);
  });

  it("breaks exact ties deterministically by external id", () => {
    const a = candidate({ externalId: "aaa" });
    const b = candidate({ externalId: "bbb" });
    expect(isBetterListingCandidate(a, b)).toBe(true);
    expect(isBetterListingCandidate(b, a)).toBe(false);
  });
});
