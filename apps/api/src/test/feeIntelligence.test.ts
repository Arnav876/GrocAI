import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FeeIntelligenceService } from "../services/feeIntelligence.js";

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
});
