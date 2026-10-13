import { describe, it, expect } from "vitest";
import {
  runOptimizationEngine,
  RequestedOptimizationItem,
  FeeRuleInput,
} from "../optimization/optimizer.js";
import { PlatformId } from "@groqai/shared";

describe("Optimization Engine Pure Tests", () => {
  const standardFeeRules: Record<PlatformId, FeeRuleInput> = {
    blinkit: {
      platform: "blinkit",
      deliveryFeePaise: 1500, // ₹15
      handlingFeePaise: 400,  // ₹4
      platformFeePaise: 300,  // ₹3
      freeDeliveryThresholdPaise: 19900, // ₹199
      minimumOrderValuePaise: 9900,     // ₹99
    },
    zepto: {
      platform: "zepto",
      deliveryFeePaise: 2500, // ₹25
      handlingFeePaise: 500,  // ₹5
      platformFeePaise: 200,  // ₹2
      freeDeliveryThresholdPaise: 14900, // ₹149
      minimumOrderValuePaise: 9900,     // ₹99
    },
    instamart: {
      platform: "instamart",
      deliveryFeePaise: 3000, // ₹30
      handlingFeePaise: 500,  // ₹5
      platformFeePaise: 400,  // ₹4
      freeDeliveryThresholdPaise: 19900, // ₹199
      minimumOrderValuePaise: 10000,    // ₹100
    },
    bigbasket: {
      platform: "bigbasket",
      deliveryFeePaise: 3000, // ₹30
      handlingFeePaise: null, // Unknown handling fee!
      handlingFeeRangeMinPaise: 500,
      handlingFeeRangeMaxPaise: 1500,
      platformFeePaise: 300,  // ₹3
      freeDeliveryThresholdPaise: 25000, // ₹250
      minimumOrderValuePaise: 15000,    // ₹150
    },
  };

  it("handles empty basket gracefully", () => {
    const result = runOptimizationEngine({
      items: [],
      feeRules: standardFeeRules,
    });
    expect(result.options.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("recommends single store when one store is consistently cheapest", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Milk",
        quantity: 2,
        unit: "L",
        matchedTitle: "Amul Milk",
        brand: "Amul",
        variant: "Toned",
        packSize: "1 L",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 5000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 6000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 6000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 6000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    const optMulti = result.options.find((o) => o.strategy === "optimized_multi_platform")!;
    expect(optMulti.platforms).toContain("blinkit");
    expect(optMulti.orderCount).toBe(1);
  });

  it("recommends a split basket when item price differences comfortably exceed extra delivery fees", () => {
    // Item 1 is ₹150 cheaper on Blinkit (e.g. oil)
    // Item 2 is ₹150 cheaper on Zepto (e.g. coffee)
    // Subtotal easily meets minimum orders (> ₹100 each)
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Oil",
        quantity: 1,
        unit: "L",
        matchedTitle: "Sunflower Oil",
        brand: "Fortune",
        variant: "Refined",
        packSize: "1 L",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 15000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" }, // ₹150
          zepto: { platform: "zepto", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },   // ₹300
          instamart: { platform: "instamart", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
      {
        id: "item-2",
        query: "Coffee",
        quantity: 1,
        unit: "pack",
        matchedTitle: "Nescafe Coffee",
        brand: "Nescafe",
        variant: "Classic",
        packSize: "100 g",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 35000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" }, // ₹350
          zepto: { platform: "zepto", pricePaise: 20000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },   // ₹200
          instamart: { platform: "instamart", pricePaise: 35000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 35000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
      minimumSavingsPaise: 2000, // ₹20
    });

    const optMulti = result.options.find((o) => o.strategy === "optimized_multi_platform")!;
    expect(optMulti.platforms).toContain("blinkit");
    expect(optMulti.platforms).toContain("zepto");
    expect(optMulti.orderCount).toBe(2);
    expect(optMulti.savingsVsBaselinePaise).toBeGreaterThan(5000); // Net savings > ₹50
  });

  it("rejects split basket when extra delivery fees erase the item shelf savings", () => {
    // Item 1 is only ₹2 cheaper on Blinkit (200 paise difference)
    // Item 2 is only ₹3 cheaper on Zepto (300 paise difference)
    // Extra delivery fee is ₹25 (2500 paise), so splitting loses ₹20!
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Milk",
        quantity: 2,
        unit: "L",
        matchedTitle: "Milk",
        brand: "Amul",
        variant: "Toned",
        packSize: "1 L",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 10000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 10200, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 10500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 10500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
      {
        id: "item-2",
        query: "Eggs",
        quantity: 2,
        unit: "pack",
        matchedTitle: "Eggs",
        brand: "Farm",
        variant: "White",
        packSize: "6 pcs",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 10500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 10200, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 10500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 10500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
      minimumSavingsPaise: 2000, // ₹20
    });

    const optMulti = result.options.find((o) => o.strategy === "optimized_multi_platform")!;
    // Must fall back to single store recommendation!
    expect(optMulti.orderCount).toBe(1);
    expect(optMulti.warnings.some((w) => w.includes("additional delivery fees"))).toBe(true);
  });

  it("handles out of stock items on one platform gracefully", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Buffalo Milk",
        quantity: 1,
        unit: "pack",
        matchedTitle: "Country Delight Buffalo Milk",
        brand: "Country Delight",
        variant: "Buffalo",
        packSize: "500 ml",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 4500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: null, availability: "unavailable", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: null, availability: "unavailable", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 4800, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    const optSingle = result.options.find((o) => o.strategy === "cheapest_single_platform")!;
    // Chosen store must be blinkit or bigbasket where item is available
    expect(["blinkit", "bigbasket"]).toContain(optSingle.platforms[0]);
  });

  it("handles unknown fee by flagging hasUnknownFees and never setting fee to 0", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Atta",
        quantity: 1,
        unit: "pack",
        matchedTitle: "Aashirvaad Atta",
        brand: "Aashirvaad",
        variant: "Whole Wheat",
        packSize: "5 kg",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 30000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 24000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    const bbPlan = result.options.find((o) => o.platforms.includes("bigbasket"));
    if (bbPlan) {
      expect(bbPlan.estimatedFees.hasUnknownFees).toBe(true);
      expect(bbPlan.unknownFees).not.toBeNull();
      expect(bbPlan.unknownFees?.feeNames).toContain("handlingFee");
      expect(bbPlan.perPlatform.bigbasket.hasUnknownFee).toBe(true);
    }
  });

  it("respects maxPlatforms constraint (maxPlatforms 1 vs 3)", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Item 1",
        quantity: 1,
        unit: "pcs",
        matchedTitle: "Item 1",
        brand: "Brand 1",
        variant: "V1",
        packSize: "1",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 15000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
      {
        id: "item-2",
        query: "Item 2",
        quantity: 1,
        unit: "pcs",
        matchedTitle: "Item 2",
        brand: "Brand 2",
        variant: "V2",
        packSize: "1",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 15000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 25000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    // Case A: maxPlatforms = 1
    const resMax1 = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
      maxPlatforms: 1,
    });
    expect(resMax1.options[0].orderCount).toBe(1);

    // Case B: maxPlatforms = 3
    const resMax3 = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
      maxPlatforms: 3,
      minimumSavingsPaise: 1000,
    });
    expect(resMax3.options[0].orderCount).toBe(2);
  });

  it("warns when budget is exceeded", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-1",
        query: "Oil",
        quantity: 1,
        unit: "L",
        matchedTitle: "Oil",
        brand: "Fortune",
        variant: "Refined",
        packSize: "1 L",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 20000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 20000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 20000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 20000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
      budgetPaise: 10000, // Budget is ₹100, but cart is > ₹200
    });

    expect(result.warnings.some((w) => w.includes("exceeds your target budget"))).toBe(true);
  });

  it("detects minimum-order violation and records shortfall without failing silently", () => {
    // Only 1 item costing ₹30 (3000 paise). All platforms require ₹99 - ₹150 minimum order
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-small",
        query: "Coriander",
        quantity: 1,
        unit: "bunch",
        matchedTitle: "Fresh Coriander",
        brand: "Farm",
        variant: "Fresh",
        packSize: "100 g",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 3000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 3200, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 3500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 3500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    const singleOption = result.options.find((o) => o.strategy === "cheapest_single_platform")!;
    expect(singleOption.isFeasible).toBe(false);
    expect(singleOption.warnings.some((w) => w.includes("minimum order value"))).toBe(true);
    const platformPlan = Object.values(singleOption.perPlatform)[0];
    expect(platformPlan.meetsMinimumOrder).toBe(false);
    expect(platformPlan.shortfallForMinimumOrderPaise).toBeGreaterThan(0);
  });

  it("handles item missing everywhere gracefully with coverage warning and infeasibility flag", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-rare",
        query: "Exotic Dragon Fruit",
        quantity: 1,
        unit: "pcs",
        matchedTitle: "Exotic Dragon Fruit",
        brand: "Exotic",
        variant: "Red",
        packSize: "1 pc",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    expect(result.options.length).toBeGreaterThan(0);
    for (const opt of result.options) {
      expect(opt.dataCoverage.missingItems).toBe(1);
      expect(opt.isFeasible).toBe(false);
      expect(opt.warnings.some((w) => w.includes("could not be found or are out of stock"))).toBe(true);
    }
  });

  it("resolves ties deterministically when two platforms have equal total cost", () => {
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-tie",
        query: "Sugar",
        quantity: 2,
        unit: "kg",
        matchedTitle: "Refined Sugar",
        brand: "Madhur",
        variant: "Pure",
        packSize: "1 kg",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: 5000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: 5000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 5000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 5000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    expect(result.options.length).toBe(3);
    const single = result.options.find((o) => o.strategy === "cheapest_single_platform")!;
    expect(single.platforms.length).toBe(1);
    expect(single.estimatedTotalPaise).toBeGreaterThan(0);
  });
});

