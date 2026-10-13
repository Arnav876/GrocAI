import { describe, it, expect } from "vitest";
import { runOptimizationEngine, RequestedOptimizationItem, FeeRuleInput } from "../optimization/optimizer.js";
import { PlatformId, SUPPORTED_PLATFORMS } from "@groqai/shared";

describe("Property-Style Financial Invariants", () => {
  const feeRules: Record<PlatformId, FeeRuleInput> = {
    blinkit: { platform: "blinkit", deliveryFeePaise: 1500, handlingFeePaise: 400, platformFeePaise: 300, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 9900 },
    zepto: { platform: "zepto", deliveryFeePaise: 2500, handlingFeePaise: 500, platformFeePaise: 200, freeDeliveryThresholdPaise: 14900, minimumOrderValuePaise: 9900 },
    instamart: { platform: "instamart", deliveryFeePaise: 3000, handlingFeePaise: 500, platformFeePaise: 400, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 10000 },
    bigbasket: { platform: "bigbasket", deliveryFeePaise: 3000, handlingFeePaise: null, handlingFeeRangeMinPaise: 500, handlingFeeRangeMaxPaise: 1500, platformFeePaise: 300, freeDeliveryThresholdPaise: 25000, minimumOrderValuePaise: 15000 },
  };

  it("invariant: a returned plan's estimated total always equals exactly the sum of its parts", () => {
    // Generate 15 randomized baskets and test invariant across all plans
    for (let testIdx = 0; testIdx < 15; testIdx++) {
      const items: RequestedOptimizationItem[] = [];
      const numItems = 1 + (testIdx % 6);

      for (let i = 0; i < numItems; i++) {
        const listings: any = {};
        for (const pid of SUPPORTED_PLATFORMS) {
          const price = 2000 + Math.floor(Math.random() * 20000); // 20 - 220 rupees
          listings[pid] = {
            platform: pid,
            pricePaise: price,
            availability: "available",
            isStale: false,
            confidence: 0.95,
            sourceType: "mock",
          };
        }

        items.push({
          id: `item-${testIdx}-${i}`,
          query: `Product ${i}`,
          quantity: 1 + (i % 3),
          unit: "pcs",
          matchedTitle: `Product ${i}`,
          brand: "Brand",
          variant: "V",
          packSize: "1",
          listings,
        });
      }

      const result = runOptimizationEngine({
        items,
        feeRules,
        maxPlatforms: 3,
        minimumSavingsPaise: 1500,
      });

      for (const option of result.options) {
        // Invariant 1: Total equals sum of subtotal + estimated fees - discounts
        const computedFees =
          option.estimatedFees.deliveryPaise +
          option.estimatedFees.handlingPaise +
          option.estimatedFees.platformPaise +
          option.estimatedFees.otherPaise;

        const expectedTotal =
          option.subtotalPaise + computedFees - option.verifiedDiscountsPaise;

        expect(option.estimatedTotalPaise).toBe(expectedTotal);

        // Invariant 2: Per platform carts sum to overall plan total
        const platformCarts = Object.values(option.perPlatform);
        if (platformCarts.length > 0) {
          const sumOfPerPlatformTotals = platformCarts.reduce(
            (sum, p) => sum + p.estimatedTotalPaise,
            0
          );
          expect(option.estimatedTotalPaise).toBe(sumOfPerPlatformTotals);
        }

        // Invariant 3: All values must be integer paise
        expect(Number.isInteger(option.subtotalPaise)).toBe(true);
        expect(Number.isInteger(option.estimatedTotalPaise)).toBe(true);
        expect(Number.isInteger(option.estimatedFees.totalPaise)).toBe(true);
      }
    }
  });
});
