import { PrismaClient } from "@prisma/client";
import {
  FeeRuleInput,
  OptimizationEngineInput,
} from "../optimization/optimizer.js";
import {
  PlatformId,
  SUPPORTED_PLATFORMS,
  SourceType,
  FeeRangePaise,
  FeeBreakdownPaise,
  assertIntegerPaise,
  addPaise,
  subtractPaise,
  addFeeRanges,
} from "@groqai/shared";
import { SEED_FEE_RULES } from "../fixtures/seedFixtures.js";

export interface FeeRuleSnapshot {
  platform: PlatformId;
  locationKey: string;
  deliveryFeePaise: number | null;
  handlingFeePaise: number | null;
  handlingFeeRangeMinPaise: number | null;
  handlingFeeRangeMaxPaise: number | null;
  platformFeePaise: number | null;
  freeDeliveryThresholdPaise: number | null;
  minimumOrderValuePaise: number | null;
  sourceType: SourceType | null;
  observedAt: string | null;
  notes: string[];
  isKnown: boolean;
}

export interface ManualFeeRuleInput {
  deliveryFeePaise?: number | null;
  handlingFeePaise?: number | null;
  handlingFeeRangeMinPaise?: number | null;
  handlingFeeRangeMaxPaise?: number | null;
  platformFeePaise?: number | null;
  freeDeliveryThresholdPaise?: number | null;
  minimumOrderValuePaise?: number | null;
  notes?: string[];
}

export interface FeeRuleEvaluationInput {
  id?: string;
  platform: string;
  platformId?: string | null;
  locationKey?: string;
  pincode?: string | null;
  freeDeliveryThresholdPaise?: number | null;
  baseDeliveryFeeMinPaise?: number | null;
  baseDeliveryFeeMaxPaise?: number | null;
  handlingFeeMinPaise?: number | null;
  handlingFeeMaxPaise?: number | null;
  platformFeeMinPaise?: number | null;
  platformFeeMaxPaise?: number | null;
  smallCartThresholdPaise?: number | null;
  smallCartFeePaise?: number | null;
  hasDynamicUnknownFees?: boolean;
  provenanceNotes?: string | null;
  deliveryFeePaise?: number | null;
  handlingFeePaise?: number | null;
  handlingFeeRangeMinPaise?: number | null;
  handlingFeeRangeMaxPaise?: number | null;
  platformFeePaise?: number | null;
  minimumOrderValuePaise?: number | null;
  sourceType?: string;
  notes?: string[];
}

export interface BasketFeeEvaluationResult {
  platformId: PlatformId;
  pincode?: string;
  basketSubtotalPaise: number;
  breakdown: FeeBreakdownPaise;
  totalBasketMinPaise: number;
  totalBasketMaxPaise: number;
  cliffs: {
    amountToFreeDeliveryPaise: number;
    potentialDeliveryFeeSavingsPaise: number;
    amountToAvoidSmallCartFeePaise: number;
    potentialSmallCartFeeSavingsPaise: number;
  };
  provenance: {
    ruleId?: string;
    locationKey?: string;
    sourceType: string;
    notes: string[];
    hasUnknownFees: boolean;
  };
}

const FEE_FIELDS = [
  "deliveryFeePaise",
  "handlingFeePaise",
  "handlingFeeRangeMinPaise",
  "handlingFeeRangeMaxPaise",
  "platformFeePaise",
  "freeDeliveryThresholdPaise",
  "minimumOrderValuePaise",
] as const;

function emptyFeeSnapshot(
  platform: PlatformId,
  locationKey: string
): FeeRuleSnapshot {
  return {
    platform,
    locationKey,
    deliveryFeePaise: null,
    handlingFeePaise: null,
    handlingFeeRangeMinPaise: null,
    handlingFeeRangeMaxPaise: null,
    platformFeePaise: null,
    freeDeliveryThresholdPaise: null,
    minimumOrderValuePaise: null,
    sourceType: null,
    observedAt: null,
    notes: ["No fee data captured for this platform and location"],
    isKnown: false,
  };
}

function assertPaiseOrNull(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be an integer number of paise or null`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer number of paise (no decimals)`);
  }
  if (value < 0) {
    throw new Error(`${field} cannot be negative`);
  }
  return value;
}

export class FeeIntelligenceService {
  constructor(private prisma?: PrismaClient) {}

  /**
   * Deterministically evaluates basket fees for a given platform rule and subtotal.
   * Strictly operates in integer paise and preserves dynamic unknown ranges.
   */
  static evaluateRuleFees(
    rule: FeeRuleEvaluationInput,
    basketSubtotalPaise: number,
    pincode?: string
  ): BasketFeeEvaluationResult {
    assertIntegerPaise(basketSubtotalPaise, "basketSubtotalPaise");

    const platformId = (rule.platformId || rule.platform) as PlatformId;

    // Gracefully handle empty carts (0 subtotal)
    if (basketSubtotalPaise === 0) {
      const deliveryFee: FeeRangePaise = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Delivery Fee",
      };
      const handlingFee: FeeRangePaise = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Handling Fee",
      };
      const platformFee: FeeRangePaise = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Platform Fee",
      };
      const smallCartFee: FeeRangePaise = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Small Cart Fee",
      };

      const breakdown: FeeBreakdownPaise = {
        deliveryFee,
        handlingFee,
        platformFee,
        smallCartFee,
        totalFeeMinPaise: 0,
        totalFeeMaxPaise: 0,
        hasUnknownFees: false,
      };

      return {
        platformId,
        pincode: pincode || rule.pincode || undefined,
        basketSubtotalPaise: 0,
        breakdown,
        totalBasketMinPaise: 0,
        totalBasketMaxPaise: 0,
        cliffs: {
          amountToFreeDeliveryPaise: rule.freeDeliveryThresholdPaise ?? 0,
          potentialDeliveryFeeSavingsPaise: 0,
          amountToAvoidSmallCartFeePaise: rule.smallCartThresholdPaise ?? 0,
          potentialSmallCartFeeSavingsPaise: 0,
        },
        provenance: {
          ruleId: rule.id,
          locationKey: rule.locationKey,
          sourceType: rule.sourceType || "system",
          notes: rule.notes || (rule.provenanceNotes ? [rule.provenanceNotes] : []),
          hasUnknownFees: false,
        },
      };
    }

    // 1. Delivery Fee Evaluation
    const freeDeliveryThreshold = rule.freeDeliveryThresholdPaise ?? 0;
    let deliveryFee: FeeRangePaise;
    if (freeDeliveryThreshold > 0 && basketSubtotalPaise >= freeDeliveryThreshold) {
      deliveryFee = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Free Delivery (threshold met)",
      };
    } else {
      const dMin = rule.baseDeliveryFeeMinPaise ?? rule.deliveryFeePaise ?? 0;
      const dMax = rule.baseDeliveryFeeMaxPaise ?? rule.deliveryFeePaise ?? dMin;
      const isKnown =
        (rule.baseDeliveryFeeMinPaise !== null || rule.deliveryFeePaise !== null) &&
        dMin === dMax;
      deliveryFee = {
        minPaise: dMin,
        maxPaise: dMax,
        isKnown,
        label: "Base Delivery Fee",
      };
    }

    // 2. Small Cart Fee Evaluation
    const smallCartThreshold = rule.smallCartThresholdPaise ?? 0;
    let smallCartFee: FeeRangePaise;
    if (smallCartThreshold > 0 && basketSubtotalPaise < smallCartThreshold) {
      const scFee = rule.smallCartFeePaise ?? 0;
      smallCartFee = {
        minPaise: scFee,
        maxPaise: scFee,
        isKnown: true,
        label: "Small Cart Fee",
      };
    } else {
      smallCartFee = {
        minPaise: 0,
        maxPaise: 0,
        isKnown: true,
        label: "Small Cart Fee (threshold met)",
      };
    }

    // 3. Handling Fee Evaluation (Preserve Dynamic Unknown Ranges)
    const hMin =
      rule.handlingFeeMinPaise ??
      rule.handlingFeeRangeMinPaise ??
      rule.handlingFeePaise ??
      0;
    const hMax =
      rule.handlingFeeMaxPaise ??
      rule.handlingFeeRangeMaxPaise ??
      rule.handlingFeePaise ??
      hMin;
    const isDynamicHandling =
      rule.hasDynamicUnknownFees === true || hMin !== hMax;
    const handlingFee: FeeRangePaise = {
      minPaise: hMin,
      maxPaise: hMax,
      isKnown: !isDynamicHandling,
      label: "Handling Fee",
      provenance: isDynamicHandling
        ? (rule.provenanceNotes || "Dynamic platform fee range")
        : undefined,
    };

    // 4. Platform Fee Evaluation
    const pMin = rule.platformFeeMinPaise ?? rule.platformFeePaise ?? 0;
    const pMax = rule.platformFeeMaxPaise ?? rule.platformFeePaise ?? pMin;
    const platformFee: FeeRangePaise = {
      minPaise: pMin,
      maxPaise: pMax,
      isKnown: pMin === pMax,
      label: "Platform Fee",
    };

    // 5. Aggregate Fee Breakdown using shared addFeeRanges
    const sum = addFeeRanges(deliveryFee, handlingFee, platformFee, smallCartFee);
    const hasUnknown =
      sum.hasUnknownFees ||
      (rule.hasDynamicUnknownFees ?? false) ||
      !deliveryFee.isKnown ||
      !handlingFee.isKnown ||
      !platformFee.isKnown ||
      !smallCartFee.isKnown;

    const breakdown: FeeBreakdownPaise = {
      deliveryFee,
      handlingFee,
      platformFee,
      smallCartFee,
      totalFeeMinPaise: sum.totalMinPaise,
      totalFeeMaxPaise: sum.totalMaxPaise,
      hasUnknownFees: hasUnknown,
    };

    const totalBasketMinPaise = addPaise(basketSubtotalPaise, sum.totalMinPaise);
    const totalBasketMaxPaise = addPaise(basketSubtotalPaise, sum.totalMaxPaise);

    // 6. Cliff-Edge Intelligence
    const amountToFreeDeliveryPaise =
      freeDeliveryThreshold > 0 && basketSubtotalPaise < freeDeliveryThreshold
        ? subtractPaise(freeDeliveryThreshold, basketSubtotalPaise)
        : 0;

    const potentialDeliveryFeeSavingsPaise =
      freeDeliveryThreshold > 0 && basketSubtotalPaise < freeDeliveryThreshold
        ? deliveryFee.minPaise
        : 0;

    const amountToAvoidSmallCartFeePaise =
      smallCartThreshold > 0 && basketSubtotalPaise < smallCartThreshold
        ? subtractPaise(smallCartThreshold, basketSubtotalPaise)
        : 0;

    const potentialSmallCartFeeSavingsPaise =
      smallCartThreshold > 0 && basketSubtotalPaise < smallCartThreshold
        ? smallCartFee.minPaise
        : 0;

    return {
      platformId,
      pincode: pincode || rule.pincode || undefined,
      basketSubtotalPaise,
      breakdown,
      totalBasketMinPaise,
      totalBasketMaxPaise,
      cliffs: {
        amountToFreeDeliveryPaise,
        potentialDeliveryFeeSavingsPaise,
        amountToAvoidSmallCartFeePaise,
        potentialSmallCartFeeSavingsPaise,
      },
      provenance: {
        ruleId: rule.id,
        locationKey: rule.locationKey,
        sourceType: rule.sourceType || "system",
        notes: rule.notes || (rule.provenanceNotes ? [rule.provenanceNotes] : []),
        hasUnknownFees: hasUnknown,
      },
    };
  }

  /**
   * Calculates basket fees fetching platform fee rule by pincode or location from DB,
   * falling back to standard default rules.
   */
  async calculateBasketFees(params: {
    platformId: PlatformId;
    basketSubtotalPaise: number;
    pincode?: string;
    ruleOverride?: Partial<FeeRuleEvaluationInput>;
  }): Promise<BasketFeeEvaluationResult> {
    const { platformId, basketSubtotalPaise, pincode, ruleOverride } = params;
    assertIntegerPaise(basketSubtotalPaise, "basketSubtotalPaise");

    let rule: FeeRuleEvaluationInput | null = null;

    if (ruleOverride) {
      rule = {
        platform: platformId,
        platformId,
        pincode,
        ...ruleOverride,
      };
    } else if (this.prisma) {
      if (pincode) {
        rule = await this.prisma.platformFeeRule.findFirst({
          where: {
            OR: [
              { platformId, pincode },
              { platform: platformId, pincode },
            ],
          },
        });
      }

      if (!rule) {
        rule = await this.prisma.platformFeeRule.findFirst({
          where: {
            OR: [{ platformId }, { platform: platformId }],
          },
        });
      }
    }

    if (!rule) {
      // Fallback to static seed rules
      const seedRule = SEED_FEE_RULES.find(
        (r) =>
          (r.platformId === platformId || r.platform === platformId) &&
          (!pincode || r.pincode === pincode)
      ) || SEED_FEE_RULES.find(
        (r) => r.platformId === platformId || r.platform === platformId
      );

      if (seedRule) {
        rule = seedRule;
      } else {
        rule = {
          platform: platformId,
          platformId,
          pincode,
          freeDeliveryThresholdPaise: null,
          baseDeliveryFeeMinPaise: null,
          baseDeliveryFeeMaxPaise: null,
          handlingFeeMinPaise: null,
          handlingFeeMaxPaise: null,
          platformFeeMinPaise: null,
          platformFeeMaxPaise: null,
          smallCartThresholdPaise: null,
          smallCartFeePaise: null,
          hasDynamicUnknownFees: true,
          provenanceNotes: "Unknown fee rule; preserved as unknown",
        };
      }
    }

    return FeeIntelligenceService.evaluateRuleFees(rule, basketSubtotalPaise, pincode);
  }

  async getFeeRules(locationKey: string): Promise<FeeRuleSnapshot[]> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for getFeeRules");
    }

    const records = await this.prisma.platformFeeRule.findMany({
      where: { locationKey },
    });
    const byPlatform = new Map(
      records.map((record) => [record.platform as PlatformId, record])
    );

    return SUPPORTED_PLATFORMS.map((platform) => {
      const record = byPlatform.get(platform);
      if (!record) return emptyFeeSnapshot(platform, locationKey);

      return {
        platform,
        locationKey: record.locationKey,
        deliveryFeePaise: record.deliveryFeePaise,
        handlingFeePaise: record.handlingFeePaise,
        handlingFeeRangeMinPaise: record.handlingFeeRangeMinPaise,
        handlingFeeRangeMaxPaise: record.handlingFeeRangeMaxPaise,
        platformFeePaise: record.platformFeePaise,
        freeDeliveryThresholdPaise: record.freeDeliveryThresholdPaise,
        minimumOrderValuePaise: record.minimumOrderValuePaise,
        sourceType: record.sourceType as SourceType,
        observedAt: record.observedAt.toISOString(),
        notes: record.notes,
        isKnown: true,
      };
    });
  }

  /**
   * Builds the optimizer input without ever inventing fees. A missing rule
   * becomes an all-null (unknown) structure, and the warnings explain the
   * provenance of every platform's fee data.
   */
  async buildOptimizationFeeRules(
    locationKey: string
  ): Promise<{
    feeRules: OptimizationEngineInput["feeRules"];
    warnings: string[];
  }> {
    const snapshots = await this.getFeeRules(locationKey);
    const feeRules = {} as OptimizationEngineInput["feeRules"];
    const warnings: string[] = [];

    for (const snapshot of snapshots) {
      feeRules[snapshot.platform] = this.toOptimizerFeeRule(snapshot);

      if (!snapshot.isKnown) {
        warnings.push(
          `Fee data for ${snapshot.platform} at ${locationKey} is unknown; fees are preserved as unknown and never treated as ₹0.`
        );
        continue;
      }

      if (snapshot.sourceType === "mock") {
        warnings.push(
          `Fee data for ${snapshot.platform} at ${locationKey} is a mock estimate (observed ${snapshot.observedAt}); verify in the platform app before checkout.`
        );
      } else if (snapshot.sourceType === "manual") {
        warnings.push(
          `Fee data for ${snapshot.platform} at ${locationKey} was entered manually (observed ${snapshot.observedAt}); verify in the platform app before checkout.`
        );
      }
    }

    return { feeRules, warnings };
  }

  async upsertManualFeeRule(
    platform: PlatformId,
    locationKey: string,
    input: ManualFeeRuleInput
  ): Promise<FeeRuleSnapshot> {
    if (!this.prisma) {
      throw new Error("PrismaClient is required for upsertManualFeeRule");
    }

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const values: Record<string, number | null> = {};
    for (const field of FEE_FIELDS) {
      values[field] = assertPaiseOrNull(input[field], field);
    }

    const rangeMin = values.handlingFeeRangeMinPaise;
    const rangeMax = values.handlingFeeRangeMaxPaise;
    if ((rangeMin === null) !== (rangeMax === null)) {
      throw new Error(
        "handlingFeeRangeMinPaise and handlingFeeRangeMaxPaise must be provided together"
      );
    }
    if (rangeMin !== null && rangeMax !== null && rangeMin > rangeMax) {
      throw new Error("handlingFeeRangeMinPaise cannot exceed handlingFeeRangeMaxPaise");
    }

    // An exact handling fee and a range are mutually exclusive representations.
    let handlingFeePaise = values.handlingFeePaise;
    let handlingFeeRangeMinPaise = rangeMin;
    let handlingFeeRangeMaxPaise = rangeMax;
    if (handlingFeePaise !== null) {
      handlingFeeRangeMinPaise = null;
      handlingFeeRangeMaxPaise = null;
    } else if (rangeMin !== null) {
      handlingFeePaise = null;
    }

    const notes = [
      "Manually entered fee structure; verify in the platform app before checkout",
      ...(input.notes ?? []),
    ];

    const record = await this.prisma.platformFeeRule.upsert({
      where: {
        platform_locationKey: {
          platform,
          locationKey,
        },
      },
      create: {
        platform,
        locationKey,
        deliveryFeePaise: values.deliveryFeePaise,
        handlingFeePaise,
        handlingFeeRangeMinPaise,
        handlingFeeRangeMaxPaise,
        platformFeePaise: values.platformFeePaise,
        freeDeliveryThresholdPaise: values.freeDeliveryThresholdPaise,
        minimumOrderValuePaise: values.minimumOrderValuePaise,
        sourceType: "manual",
        observedAt: new Date(),
        notes,
      },
      update: {
        deliveryFeePaise: values.deliveryFeePaise,
        handlingFeePaise,
        handlingFeeRangeMinPaise,
        handlingFeeRangeMaxPaise,
        platformFeePaise: values.platformFeePaise,
        freeDeliveryThresholdPaise: values.freeDeliveryThresholdPaise,
        minimumOrderValuePaise: values.minimumOrderValuePaise,
        sourceType: "manual",
        observedAt: new Date(),
        notes,
      },
    });

    return {
      platform,
      locationKey,
      deliveryFeePaise: record.deliveryFeePaise,
      handlingFeePaise: record.handlingFeePaise,
      handlingFeeRangeMinPaise: record.handlingFeeRangeMinPaise,
      handlingFeeRangeMaxPaise: record.handlingFeeRangeMaxPaise,
      platformFeePaise: record.platformFeePaise,
      freeDeliveryThresholdPaise: record.freeDeliveryThresholdPaise,
      minimumOrderValuePaise: record.minimumOrderValuePaise,
      sourceType: record.sourceType as SourceType,
      observedAt: record.observedAt.toISOString(),
      notes: record.notes,
      isKnown: true,
    };
  }

  private toOptimizerFeeRule(snapshot: FeeRuleSnapshot): FeeRuleInput {
    return {
      platform: snapshot.platform,
      deliveryFeePaise: snapshot.deliveryFeePaise,
      handlingFeePaise: snapshot.handlingFeePaise,
      handlingFeeRangeMinPaise: snapshot.handlingFeeRangeMinPaise,
      handlingFeeRangeMaxPaise: snapshot.handlingFeeRangeMaxPaise,
      platformFeePaise: snapshot.platformFeePaise,
      freeDeliveryThresholdPaise: snapshot.freeDeliveryThresholdPaise,
      minimumOrderValuePaise: snapshot.minimumOrderValuePaise,
    };
  }
}
