import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PriceObservation } from "@groqai/shared";
import {
  ListingCandidate,
  isBetterListingCandidate,
  isMultipackOrCombo,
  CandidateSuggestionService,
  determineRecommendedAction,
} from "../services/listingCandidate.js";
import { CanonicalProductMatchInput, MatchObservationInput } from "../services/matchingService.js";

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

describe("Phase 2 — Candidate Suggestion Engine & Operator Transitions", () => {
  const prisma = new PrismaClient();
  const suggestionService = new CandidateSuggestionService(prisma);

  const catalog: CanonicalProductMatchInput[] = [
    {
      id: "amul-taaza-1l",
      slug: "amul-taaza-1l",
      name: "Amul Taaza Homogenised Toned Milk",
      brand: "Amul",
      category: "dairy",
      variant: "Toned",
      baseDimension: "VOLUME",
      standardPackSize: "1 L",
      aliases: ["Taaza Milk 1L"],
    },
    {
      id: "amul-gold-1l",
      slug: "amul-gold-1l",
      name: "Amul Gold Full Cream Milk",
      brand: "Amul",
      category: "dairy",
      variant: "Full Cream",
      baseDimension: "VOLUME",
      standardPackSize: "1 L",
      aliases: ["Gold Milk 1L"],
    },
    {
      id: "aashirvaad-atta-5kg",
      slug: "aashirvaad-superior-mp-atta-5kg",
      name: "Aashirvaad Superior MP Atta",
      brand: "Aashirvaad",
      category: "staples",
      variant: "Superior MP",
      baseDimension: "WEIGHT",
      standardPackSize: "5 kg",
      aliases: ["Aashirvaad Atta 5kg"],
    },
  ];

  describe("Pure Candidate Suggestion Evaluation & Action Decision", () => {
    it("generates ranked candidate suggestions with structured reasons and guard flags", () => {
      const observation: MatchObservationInput & { id: string } = {
        id: "obs-101",
        name: "Amul Taaza Toned Milk 1L",
        brand: "Amul",
        quantity: "1 L",
        pricePaise: 5400,
        platformId: "blinkit",
      };

      const suggestions = suggestionService.evaluateObservationAgainstCatalog(observation, catalog, 3);

      expect(suggestions.length).toBe(3);
      const topMatch = suggestions[0];
      expect(topMatch.observationId).toBe("obs-101");
      expect(topMatch.suggestedCanonicalProductId).toBe("amul-taaza-1l");
      expect(topMatch.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(topMatch.recommendedAction).toBe("LINK_CANONICAL");
      expect(topMatch.guardFlags.brandGuardPassed).toBe(true);
      expect(topMatch.guardFlags.variantGuardPassed).toBe(true);
      expect(topMatch.guardFlags.packSizeGuardPassed).toBe(true);
      expect(topMatch.guardFlags.dimensionGuardPassed).toBe(true);
      expect(topMatch.matchReasons.length).toBeGreaterThan(0);
    });

    it("properly classifies pack-size mismatches as 'CREATE_NEW_VARIANT'", () => {
      // 500 ml observation against 1 L canonical product
      const observation: MatchObservationInput & { id: string } = {
        id: "obs-102",
        name: "Amul Taaza Homogenised Toned Milk 500ml",
        brand: "Amul",
        quantity: "500 ml",
        pricePaise: 2700,
        platformId: "zepto",
      };

      const suggestions = suggestionService.evaluateObservationAgainstCatalog(observation, catalog, 3);
      const taazaMatch = suggestions.find((s) => s.suggestedCanonicalProductId === "amul-taaza-1l")!;

      expect(taazaMatch).toBeDefined();
      expect(taazaMatch.guardFlags.brandGuardPassed).toBe(true);
      expect(taazaMatch.guardFlags.variantGuardPassed).toBe(true);
      expect(taazaMatch.guardFlags.dimensionGuardPassed).toBe(true);
      expect(taazaMatch.guardFlags.packSizeGuardPassed).toBe(false);
      expect(taazaMatch.recommendedAction).toBe("CREATE_NEW_VARIANT");
    });

    it("properly classifies conflicting variants as 'IGNORE'", () => {
      // Gold vs Taaza
      const observation: MatchObservationInput & { id: string } = {
        id: "obs-103",
        name: "Amul Gold Full Cream Milk 1L",
        brand: "Amul",
        quantity: "1 L",
        pricePaise: 6600,
      };

      const suggestions = suggestionService.evaluateObservationAgainstCatalog(observation, catalog, 3);
      const taazaMatch = suggestions.find((s) => s.suggestedCanonicalProductId === "amul-taaza-1l")!;

      expect(taazaMatch).toBeDefined();
      expect(taazaMatch.guardFlags.variantGuardPassed).toBe(false);
      expect(taazaMatch.recommendedAction).toBe("IGNORE");
    });

    it("properly classifies moderate score with matching pack size as 'NEEDS_HUMAN_REVIEW'", () => {
      const evaluation = {
        canonicalProductId: "amul-taaza-1l",
        score: 0.65,
        classification: "CANDIDATE_REVIEW" as const,
        guards: {
          brandGuardPassed: true,
          variantGuardPassed: true,
          packSizeGuardPassed: true,
          dimensionGuardPassed: true,
          conflictDetails: [],
        },
        reasons: ["Missing distinctive token"],
      };

      const action = determineRecommendedAction(evaluation);
      expect(action).toBe("NEEDS_HUMAN_REVIEW");
    });
  });

  describe("Operator Approval and Rejection Transitions (DB Integration)", () => {
    let createdObservationId: string;
    let createdCandidateMatchId: string;
    let rejectCandidateMatchId: string;

    beforeAll(async () => {
      // Create a test CanonicalProduct if needed
      await prisma.canonicalProduct.upsert({
        where: { slug: "test-amul-taaza-1l" },
        update: {},
        create: {
          id: "test-amul-taaza-1l",
          slug: "test-amul-taaza-1l",
          name: "Test Amul Taaza Milk",
          brand: "Amul",
          category: "dairy",
          variant: "Toned",
          baseDimension: "VOLUME",
          standardPackSize: "1 L",
        },
      });

      // Create an unverified observation
      const obs = await prisma.platformObservation.create({
        data: {
          name: "Amul Taaza Milk 1 L Pouch",
          brand: "Amul",
          quantity: "1 L",
          pricePaise: 5400,
          originalPricePaise: 5600,
          discountPercentage: 4,
          availabilityStatus: "IN_STOCK",
          platformId: "blinkit",
          productUrl: "https://blinkit.com/prn/test-milk",
          pincode: "110001",
          observedAt: new Date(),
          dataSource: "headed_worker",
          verificationStatus: "UNVERIFIED",
          canonicalProductId: null,
        },
      });
      createdObservationId = obs.id;

      // Create a pending candidate match
      const match = await prisma.candidateMatch.create({
        data: {
          observationId: createdObservationId,
          canonicalProductId: "test-amul-taaza-1l",
          confidenceScore: 0.92,
          matchReasons: ["Brand match", "Quantity match"],
          guardFlags: { brandGuardPassed: true, variantGuardPassed: true },
          reviewStatus: "PENDING",
        },
      });
      createdCandidateMatchId = match.id;

      // Create another candidate match to test rejection
      const matchToReject = await prisma.candidateMatch.create({
        data: {
          observationId: createdObservationId,
          canonicalProductId: "test-amul-taaza-1l",
          confidenceScore: 0.48,
          matchReasons: ["Low token match"],
          guardFlags: { brandGuardPassed: true },
          reviewStatus: "PENDING",
        },
      });
      rejectCandidateMatchId = matchToReject.id;
    });

    afterAll(async () => {
      // Clean up test data
      await prisma.candidateMatch.deleteMany({
        where: { observationId: createdObservationId },
      }).catch(() => {});
      await prisma.platformObservation.delete({
        where: { id: createdObservationId },
      }).catch(() => {});
      await prisma.canonicalProduct.delete({
        where: { id: "test-amul-taaza-1l" },
      }).catch(() => {});
      await prisma.$disconnect();
    });

    it("approving a candidate links canonicalProductId and marks verificationStatus: 'VERIFIED'", async () => {
      const result = await suggestionService.approveCandidate(
        createdCandidateMatchId,
        "Verified by catalog operator"
      );

      expect(result.candidateMatch.reviewStatus).toBe("APPROVED");
      expect(result.observation.canonicalProductId).toBe("test-amul-taaza-1l");
      expect(result.observation.verificationStatus).toBe("VERIFIED");

      // Verify in DB directly
      const dbObs = await prisma.platformObservation.findUnique({
        where: { id: createdObservationId },
      });
      expect(dbObs!.canonicalProductId).toBe("test-amul-taaza-1l");
      expect(dbObs!.verificationStatus).toBe("VERIFIED");
    });

    it("rejecting a candidate sets reviewStatus: 'REJECTED' without altering canonical link", async () => {
      const result = await suggestionService.rejectCandidate(
        rejectCandidateMatchId,
        "Rejected by operator: not a match"
      );

      expect(result.candidateMatch.reviewStatus).toBe("REJECTED");

      const dbMatch = await prisma.candidateMatch.findUnique({
        where: { id: rejectCandidateMatchId },
      });
      expect(dbMatch!.reviewStatus).toBe("REJECTED");
    });
  });
});
