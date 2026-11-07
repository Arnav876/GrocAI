import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  FeeIntelligenceService,
  FeeRuleEvaluationInput,
} from "../services/feeIntelligence.js";

const prisma = new PrismaClient();
const TEST_LOCATION = "delhi_560001";
const UNKNOWN_LOCATION = "delhi_560002";

describe("Phase 2 — Fee intelligence with honest provenance", () => {
  const service = new FeeIntelligenceService(prisma);

  beforeAll(async () => {
    await prisma.platformFeeRule.deleteMany({
      where: { locationKey: { in: [TEST_LOCATION, UNKNOWN_LOCATION] } },
    });
  });

  afterAll(async () => {
    await prisma.platformFeeRule.deleteMany({
      where: { locationKey: { in: [TEST_LOCATION, UNKNOWN_LOCATION] } },
    });
    await prisma.$disconnect();
  });

  it("returns every supported platform as explicitly unknown when no rule exists", async () => {
    const rules = await service.getFeeRules(UNKNOWN_LOCATION);
    expect(rules.map((r) => r.platform)).toEqual([
      "blinkit",
      "zepto",
      "instamart",
      "bigbasket",
    ]);

    for (const rule of rules) {
      expect(rule.isKnown).toBe(false);
      expect(rule.sourceType).toBeNull();
      expect(rule.deliveryFeePaise).toBeNull();
      expect(rule.handlingFeePaise).toBeNull();
      expect(rule.platformFeePaise).toBeNull();
    }
  });

  it("saves a manual fee rule with integer paise and manual provenance", async () => {
    const saved = await service.upsertManualFeeRule("zepto", TEST_LOCATION, {
      deliveryFeePaise: 2500,
      handlingFeePaise: 500,
      platformFeePaise: 200,
      freeDeliveryThresholdPaise: 14900,
      minimumOrderValuePaise: 9900,
      notes: ["Checked on the Zepto app for 560001"],
    });

    expect(saved.isKnown).toBe(true);
    expect(saved.sourceType).toBe("manual");
    expect(saved.deliveryFeePaise).toBe(2500);
    expect(saved.handlingFeePaise).toBe(500);
    expect(saved.notes).toContain("Checked on the Zepto app for 560001");

    const rules = await service.getFeeRules(TEST_LOCATION);
    const zepto = rules.find((r) => r.platform === "zepto")!;
    expect(zepto.isKnown).toBe(true);
    expect(zepto.sourceType).toBe("manual");
    expect(zepto.deliveryFeePaise).toBe(2500);
  });

  it("preserves unknown handling fees as a range and clears the range for an exact fee", async () => {
    const ranged = await service.upsertManualFeeRule("bigbasket", TEST_LOCATION, {
      deliveryFeePaise: 3000,
      handlingFeeRangeMinPaise: 500,
      handlingFeeRangeMaxPaise: 1500,
      platformFeePaise: 300,
    });
    expect(ranged.handlingFeePaise).toBeNull();
    expect(ranged.handlingFeeRangeMinPaise).toBe(500);
    expect(ranged.handlingFeeRangeMaxPaise).toBe(1500);

    const exact = await service.upsertManualFeeRule("bigbasket", TEST_LOCATION, {
      deliveryFeePaise: 3000,
      handlingFeePaise: 900,
      handlingFeeRangeMinPaise: null,
      handlingFeeRangeMaxPaise: null,
      platformFeePaise: 300,
    });
    expect(exact.handlingFeePaise).toBe(900);
    expect(exact.handlingFeeRangeMinPaise).toBeNull();
    expect(exact.handlingFeeRangeMaxPaise).toBeNull();
  });

  it("rejects fractional, negative, and incomplete range values", async () => {
    await expect(
      service.upsertManualFeeRule("zepto", TEST_LOCATION, {
        deliveryFeePaise: 25.5,
      })
    ).rejects.toThrow(/integer number of paise/);

    await expect(
      service.upsertManualFeeRule("zepto", TEST_LOCATION, {
        deliveryFeePaise: -100,
      })
    ).rejects.toThrow(/cannot be negative/);

    await expect(
      service.upsertManualFeeRule("zepto", TEST_LOCATION, {
        handlingFeeRangeMinPaise: 500,
      })
    ).rejects.toThrow(/must be provided together/);

    await expect(
      service.upsertManualFeeRule("zepto", TEST_LOCATION, {
        handlingFeeRangeMinPaise: 1500,
        handlingFeeRangeMaxPaise: 500,
      })
    ).rejects.toThrow(/cannot exceed/);
  });

  it("warns about unknown and mock fee provenance for the optimizer", async () => {
    const unknown = await service.buildOptimizationFeeRules(UNKNOWN_LOCATION);
    expect(
      unknown.warnings.filter((w) => w.includes("is unknown")).length
    ).toBe(4);
    for (const platform of ["blinkit", "zepto", "instamart", "bigbasket"] as const) {
      const rule = unknown.feeRules[platform];
      expect(rule.deliveryFeePaise).toBeNull();
      expect(rule.handlingFeePaise).toBeNull();
      expect(rule.platformFeePaise).toBeNull();
    }

    const seeded = await service.buildOptimizationFeeRules("delhi_110001");
    expect(seeded.warnings.some((w) => w.includes("mock estimate"))).toBe(true);
  });

  it("never invents fee values when building optimizer input", async () => {
    const { feeRules } = await service.buildOptimizationFeeRules(UNKNOWN_LOCATION);
    for (const platform of ["blinkit", "zepto", "instamart", "bigbasket"] as const) {
      expect(feeRules[platform].deliveryFeePaise).not.toBe(0);
      expect(feeRules[platform].deliveryFeePaise).toBeNull();
    }
  });

  describe("Phase 2 — Dynamic Fee Intelligence Engine & Cliff Math", () => {
    const blinkitRule: FeeRuleEvaluationInput = {
      platform: "blinkit",
      platformId: "blinkit",
      pincode: "110001",
      locationKey: "delhi_110001",
      freeDeliveryThresholdPaise: 49900, // ₹499
      baseDeliveryFeeMinPaise: 2500,     // ₹25
      baseDeliveryFeeMaxPaise: 2500,     // ₹25
      handlingFeeMinPaise: 400,          // ₹4
      handlingFeeMaxPaise: 400,          // ₹4
      platformFeeMinPaise: 200,          // ₹2
      platformFeeMaxPaise: 200,          // ₹2
      smallCartThresholdPaise: 19900,    // ₹199
      smallCartFeePaise: 2000,           // ₹20
      hasDynamicUnknownFees: false,
    };

    const bigbasketRule: FeeRuleEvaluationInput = {
      platform: "bigbasket",
      platformId: "bigbasket",
      pincode: "110001",
      locationKey: "delhi_110001",
      freeDeliveryThresholdPaise: 50000, // ₹500
      baseDeliveryFeeMinPaise: 3000,     // ₹30
      baseDeliveryFeeMaxPaise: 3000,     // ₹30
      handlingFeeMinPaise: 500,          // ₹5
      handlingFeeMaxPaise: 1500,         // ₹15 (dynamic surge range)
      platformFeeMinPaise: 0,
      platformFeeMaxPaise: 0,
      smallCartThresholdPaise: 24900,    // ₹249
      smallCartFeePaise: 3000,           // ₹30
      hasDynamicUnknownFees: true,
      provenanceNotes: "BigBasket dynamic handling fee range ₹5-₹15 preserved.",
    };

    it("calculates exact fees below smallCartThresholdPaise and freeDeliveryThresholdPaise", () => {
      // Subtotal: ₹100 = 10,000 paise
      const res = FeeIntelligenceService.evaluateRuleFees(blinkitRule, 10000);

      expect(res.breakdown.deliveryFee.minPaise).toBe(2500);
      expect(res.breakdown.deliveryFee.maxPaise).toBe(2500);
      expect(res.breakdown.deliveryFee.isKnown).toBe(true);

      expect(res.breakdown.smallCartFee.minPaise).toBe(2000);
      expect(res.breakdown.smallCartFee.maxPaise).toBe(2000);
      expect(res.breakdown.smallCartFee.isKnown).toBe(true);

      expect(res.breakdown.handlingFee.minPaise).toBe(400);
      expect(res.breakdown.platformFee.minPaise).toBe(200);

      // Total fee: 2500 + 2000 + 400 + 200 = 5100 paise
      expect(res.breakdown.totalFeeMinPaise).toBe(5100);
      expect(res.breakdown.totalFeeMaxPaise).toBe(5100);
      expect(res.breakdown.hasUnknownFees).toBe(false);

      // Total basket: 10000 + 5100 = 15100 paise
      expect(res.totalBasketMinPaise).toBe(15100);
      expect(res.totalBasketMaxPaise).toBe(15100);

      // Cliff calculations in exact integer paise
      // Free delivery cliff: 49900 - 10000 = 39900 paise
      expect(res.cliffs.amountToFreeDeliveryPaise).toBe(39900);
      expect(res.cliffs.potentialDeliveryFeeSavingsPaise).toBe(2500);

      // Small cart cliff: 19900 - 10000 = 9900 paise
      expect(res.cliffs.amountToAvoidSmallCartFeePaise).toBe(9900);
      expect(res.cliffs.potentialSmallCartFeeSavingsPaise).toBe(2000);
    });

    it("waives smallCartFee above smallCartThresholdPaise but keeps deliveryFee below free delivery", () => {
      // Subtotal: ₹250 = 25,000 paise (above small cart ₹199, below free delivery ₹499)
      const res = FeeIntelligenceService.evaluateRuleFees(blinkitRule, 25000);

      expect(res.breakdown.smallCartFee.minPaise).toBe(0);
      expect(res.breakdown.smallCartFee.maxPaise).toBe(0);
      expect(res.cliffs.amountToAvoidSmallCartFeePaise).toBe(0);
      expect(res.cliffs.potentialSmallCartFeeSavingsPaise).toBe(0);

      expect(res.breakdown.deliveryFee.minPaise).toBe(2500);
      // Free delivery cliff: 49900 - 25000 = 24900 paise
      expect(res.cliffs.amountToFreeDeliveryPaise).toBe(24900);
      expect(res.cliffs.potentialDeliveryFeeSavingsPaise).toBe(2500);

      // Total fee: 2500 + 0 + 400 + 200 = 3100 paise
      expect(res.breakdown.totalFeeMinPaise).toBe(3100);
      expect(res.totalBasketMinPaise).toBe(28100);
    });

    it("verifies exact fee calculation at and above freeDeliveryThresholdPaise", () => {
      // Exactly at threshold: ₹499 = 49,900 paise
      const exactAt = FeeIntelligenceService.evaluateRuleFees(blinkitRule, 49900);
      expect(exactAt.breakdown.deliveryFee.minPaise).toBe(0);
      expect(exactAt.breakdown.deliveryFee.maxPaise).toBe(0);
      expect(exactAt.cliffs.amountToFreeDeliveryPaise).toBe(0);
      expect(exactAt.cliffs.potentialDeliveryFeeSavingsPaise).toBe(0);

      // Well above threshold: ₹600 = 60,000 paise
      const wellAbove = FeeIntelligenceService.evaluateRuleFees(blinkitRule, 60000);
      expect(wellAbove.breakdown.deliveryFee.minPaise).toBe(0);
      expect(wellAbove.breakdown.deliveryFee.maxPaise).toBe(0);
      expect(wellAbove.cliffs.amountToFreeDeliveryPaise).toBe(0);
    });

    it("verifies BigBasket dynamic handling fee (500-1500p) sets hasUnknownFees: true and never coerces to 0", () => {
      // Subtotal: ₹300 = 30,000 paise (above small cart ₹249, below free delivery ₹500)
      const res = FeeIntelligenceService.evaluateRuleFees(bigbasketRule, 30000);

      expect(res.breakdown.handlingFee.minPaise).toBe(500);
      expect(res.breakdown.handlingFee.maxPaise).toBe(1500);
      expect(res.breakdown.handlingFee.isKnown).toBe(false);

      expect(res.breakdown.hasUnknownFees).toBe(true);
      expect(res.provenance.hasUnknownFees).toBe(true);

      // Base delivery: 3000 paise
      // Min total fees: 3000 + 500 = 3500 paise
      // Max total fees: 3000 + 1500 = 4500 paise
      expect(res.breakdown.totalFeeMinPaise).toBe(3500);
      expect(res.breakdown.totalFeeMaxPaise).toBe(4500);
      expect(res.breakdown.totalFeeMinPaise).not.toBe(res.breakdown.totalFeeMaxPaise);
      expect(res.breakdown.totalFeeMinPaise).not.toBe(0);

      expect(res.totalBasketMinPaise).toBe(33500);
      expect(res.totalBasketMaxPaise).toBe(34500);
    });

    it("gracefully handles empty cart (0 subtotal) with 0 fees", () => {
      const res = FeeIntelligenceService.evaluateRuleFees(blinkitRule, 0);

      expect(res.basketSubtotalPaise).toBe(0);
      expect(res.breakdown.totalFeeMinPaise).toBe(0);
      expect(res.breakdown.totalFeeMaxPaise).toBe(0);
      expect(res.totalBasketMinPaise).toBe(0);
      expect(res.totalBasketMaxPaise).toBe(0);
      expect(res.breakdown.hasUnknownFees).toBe(false);
    });

    it("rejects float paise inputs strictly via assertIntegerPaise", () => {
      expect(() => {
        FeeIntelligenceService.evaluateRuleFees(blinkitRule, 185.5);
      }).toThrow(/Financial invariant violation/);

      expect(() => {
        FeeIntelligenceService.evaluateRuleFees(blinkitRule, -500);
      }).toThrow(/Financial invariant violation/);
    });

    it("evaluates basket fees through instance calculateBasketFees querying seeded database rules", async () => {
      const res = await service.calculateBasketFees({
        platformId: "blinkit",
        basketSubtotalPaise: 20000,
        pincode: "110001",
      });

      expect(res.platformId).toBe("blinkit");
      expect(res.basketSubtotalPaise).toBe(20000);
      expect(res.breakdown.deliveryFee.minPaise).toBe(2500);
      expect(res.breakdown.totalFeeMinPaise).toBeGreaterThan(0);
      expect(res.totalBasketMinPaise).toBe(20000 + res.breakdown.totalFeeMinPaise);
    });
  });
});
