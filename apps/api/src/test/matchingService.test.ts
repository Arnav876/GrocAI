import { describe, it, expect } from "vitest";
import {
  MatchingService,
  MatchObservationInput,
  CanonicalProductMatchInput,
} from "../services/matchingService.js";

describe("Phase 2 — Deterministic Catalog Matching Engine", () => {
  const matchingService = new MatchingService();

  const canonicalAmulTaaza500ml: CanonicalProductMatchInput = {
    id: "amul-taaza-500ml",
    slug: "amul-taaza-homogenised-toned-milk-500ml",
    name: "Amul Taaza Homogenised Toned Milk",
    brand: "Amul",
    category: "dairy",
    variant: "Toned",
    baseDimension: "VOLUME",
    standardPackSize: "500 ml",
    aliases: ["Taaza Milk 500ml", "Amul Toned Milk 500ml", "Amul Taaza Toned Milk 500ml"],
  };

  const canonicalAmulGold500ml: CanonicalProductMatchInput = {
    id: "amul-gold-500ml",
    slug: "amul-gold-full-cream-milk-500ml",
    name: "Amul Gold Full Cream Milk",
    brand: "Amul",
    category: "dairy",
    variant: "Full Cream",
    baseDimension: "VOLUME",
    standardPackSize: "500 ml",
    aliases: ["Gold Milk 500ml", "Amul Full Cream 500ml"],
  };

  const canonicalAashirvaadMPAtta5kg: CanonicalProductMatchInput = {
    id: "aashirvaad-mp-atta-5kg",
    slug: "aashirvaad-superior-mp-atta-5kg",
    name: "Aashirvaad Superior MP Atta",
    brand: "Aashirvaad",
    category: "staples",
    variant: "Superior MP",
    baseDimension: "WEIGHT",
    standardPackSize: "5 kg",
    aliases: ["Aashirvaad Atta 5kg", "MP Atta 5kg"],
  };

  const canonicalIndiaGateRice5kg: CanonicalProductMatchInput = {
    id: "india-gate-rice-5kg",
    slug: "india-gate-classic-basmati-rice-5kg",
    name: "India Gate Classic Basmati Rice",
    brand: "India Gate",
    category: "staples",
    variant: "Classic",
    baseDimension: "WEIGHT",
    standardPackSize: "5 kg",
    aliases: ["India Gate Basmati 5kg"],
  };

  const canonicalMotherDairyButter500g: CanonicalProductMatchInput = {
    id: "mother-dairy-butter-500g",
    slug: "mother-dairy-salted-butter-500g",
    name: "Mother Dairy Salted Butter",
    brand: "Mother Dairy",
    category: "dairy",
    variant: "Salted",
    baseDimension: "WEIGHT",
    standardPackSize: "500 g",
    aliases: ["Mother Dairy Butter 500g"],
  };

  describe("Exact Match & Canonical Alias Overlap", () => {
    it("auto-matches exact product name and compatible pack size with high confidence (AUTO_MATCH)", () => {
      const observation: MatchObservationInput = {
        name: "Amul Taaza Homogenised Toned Milk",
        brand: "Amul",
        quantity: "500 ml",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulTaaza500ml);

      expect(result.classification).toBe("AUTO_MATCH");
      expect(result.score).toBeGreaterThanOrEqual(0.85);
      expect(result.guards.brandGuardPassed).toBe(true);
      expect(result.guards.variantGuardPassed).toBe(true);
      expect(result.guards.packSizeGuardPassed).toBe(true);
      expect(result.guards.dimensionGuardPassed).toBe(true);
    });

    it("auto-matches registered canonical alias ('Amul Taaza Toned Milk 500ml' -> AUTO_MATCH)", () => {
      const observation: MatchObservationInput = {
        name: "Amul Taaza Toned Milk 500ml",
        brand: "Amul",
        quantity: "500 ml",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulTaaza500ml);

      expect(result.classification).toBe("AUTO_MATCH");
      expect(result.score).toBeGreaterThanOrEqual(0.85);
      expect(result.reasons.some((r) => r.includes("canonical alias"))).toBe(true);
    });

    it("auto-matches immediately on exact barcode match with score 1.0", () => {
      const observation: MatchObservationInput = {
        name: "Raw Quick-Commerce SKU #9988",
        quantity: "500 ml",
        barcode: "amul-taaza-500ml",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulTaaza500ml);

      expect(result.classification).toBe("AUTO_MATCH");
      expect(result.score).toBe(1.0);
      expect(result.reasons).toContain("Exact barcode match");
    });
  });

  describe("Deterministic Variant Guard (Hard Rejections)", () => {
    it("Variant Guard rejection: 'Amul Taaza 500ml' vs 'Amul Gold 500ml' MUST NOT auto-match (REJECTED)", () => {
      const observation: MatchObservationInput = {
        name: "Amul Taaza 500ml",
        brand: "Amul",
        quantity: "500 ml",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulGold500ml);

      expect(result.guards.variantGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
      expect(result.score).toBeLessThan(0.45);
      expect(result.guards.conflictDetails.some((d) => d.includes("Conflicting variant"))).toBe(true);
    });

    it("Variant Guard rejection: 'Aashirvaad Select Sharbati Atta 5kg' vs 'Aashirvaad Superior MP Atta 5kg' MUST NOT auto-match", () => {
      const observation: MatchObservationInput = {
        name: "Aashirvaad Select Sharbati Atta 5kg",
        brand: "Aashirvaad",
        quantity: "5 kg",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAashirvaadMPAtta5kg);

      expect(result.guards.variantGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
      expect(result.score).toBeLessThan(0.45);
    });

    it("rejects conflicting rice variants (India Gate Mogra Basmati Rice vs Classic)", () => {
      const observation: MatchObservationInput = {
        name: "India Gate Mogra Basmati Rice 5kg",
        brand: "India Gate",
        quantity: "5 kg",
      };

      const result = matchingService.evaluateObservation(observation, canonicalIndiaGateRice5kg);

      expect(result.guards.variantGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
    });
  });

  describe("Pack-Size & Physical Dimension Guards", () => {
    it("Pack-Size Guard rejection: 'India Gate Classic Basmati Rice 1 kg' vs 'India Gate Classic Basmati Rice 5 kg' MUST flag packSizeGuardPassed: false", () => {
      const observation: MatchObservationInput = {
        name: "India Gate Classic Basmati Rice 1 kg",
        brand: "India Gate",
        quantity: "1 kg",
      };

      const result = matchingService.evaluateObservation(observation, canonicalIndiaGateRice5kg);

      expect(result.guards.brandGuardPassed).toBe(true);
      expect(result.guards.variantGuardPassed).toBe(true);
      expect(result.guards.dimensionGuardPassed).toBe(true);
      expect(result.guards.packSizeGuardPassed).toBe(false);
      expect(result.guards.exactPackSizeMatch).toBe(false);
      // Mismatched pack size cannot AUTO_MATCH, caps at review
      expect(result.classification).toBe("CANDIDATE_REVIEW");
      expect(result.score).toBeLessThanOrEqual(0.70);
      expect(result.reasons.some((r) => r.includes("Pack size differs"))).toBe(true);
    });

    it("rejects physical dimension incompatibility (VOLUME vs WEIGHT)", () => {
      const observation: MatchObservationInput = {
        name: "Amul Taaza Milk 500g",
        brand: "Amul",
        quantity: "500 g", // Weight instead of canonical Volume (ml)
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulTaaza500ml);

      expect(result.guards.dimensionGuardPassed).toBe(false);
      expect(result.guards.packSizeGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
      expect(result.score).toBeLessThan(0.45);
    });
  });

  describe("Brand Guard (Cross-Brand False Positive Rejection)", () => {
    it("Cross-brand rejection: 'Amul Salted Butter 500g' vs 'Mother Dairy Salted Butter 500g'", () => {
      const observation: MatchObservationInput = {
        name: "Amul Salted Butter 500g",
        brand: "Amul",
        quantity: "500 g",
      };

      const result = matchingService.evaluateObservation(observation, canonicalMotherDairyButter500g);

      expect(result.guards.brandGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
      expect(result.score).toBeLessThan(0.45);
      expect(result.reasons.some((r) => r.includes("Brand mismatch"))).toBe(true);
    });

    it("extracts and detects brand mismatch even when observation brand field is omitted", () => {
      const observation: MatchObservationInput = {
        name: "Mother Dairy Pure Ghee 1L",
        quantity: "1 L",
      };

      const result = matchingService.evaluateObservation(observation, canonicalAmulTaaza500ml);

      expect(result.guards.brandGuardPassed).toBe(false);
      expect(result.classification).toBe("REJECTED");
    });
  });

  describe("Deterministic Catalog Ranking", () => {
    it("ranks candidates in deterministic precedence order (AUTO_MATCH > CANDIDATE_REVIEW > REJECTED)", () => {
      const catalog = [
        canonicalAmulGold500ml,
        canonicalAmulTaaza500ml,
        canonicalMotherDairyButter500g,
      ];

      const observation: MatchObservationInput = {
        name: "Amul Taaza Toned Milk 500ml",
        brand: "Amul",
        quantity: "500 ml",
      };

      const ranked = matchingService.rankCatalogCandidates(observation, catalog, 3);

      expect(ranked.length).toBe(3);
      // Top candidate must be the exact Taaza match
      expect(ranked[0].canonicalProductId).toBe("amul-taaza-500ml");
      expect(ranked[0].classification).toBe("AUTO_MATCH");

      // Conflicting Gold variant and Mother Dairy cross-brand must be REJECTED
      expect(ranked[1].classification).toBe("REJECTED");
      expect(ranked[2].classification).toBe("REJECTED");
    });
  });
});

