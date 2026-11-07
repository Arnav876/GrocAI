import { PrismaClient } from "@prisma/client";
import {
  FeeRuleInput,
  OptimizationEngineInput,
} from "../optimization/optimizer.js";
import {
  PlatformId,
  SUPPORTED_PLATFORMS,
  SourceType,
} from "@groqai/shared";

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
  constructor(private prisma: PrismaClient) {}

  async getFeeRules(locationKey: string): Promise<FeeRuleSnapshot[]> {
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
