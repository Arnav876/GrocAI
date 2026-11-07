import { describe, it, expect } from "vitest";
import {
  OptimizationService,
  optimizeBasket,
  enumerateNonEmptySubsets,
  PlatformObservationInput,
} from "../services/optimizationService.js";
import { PlatformId, formatPaiseToRupees } from "@groqai/shared";

describe("Phase 3 — Deterministic 3-Strategy Combinatorial Basket Optimizer", () => {
  const service = new OptimizationService();
  const TEST_PINCODE = "110001";

  it("evaluates all 2^4 - 1 = 15 store combinations deterministically when 4 platforms are active", async () => {
    // 1. Check subset enumeration utility
    const platforms: PlatformId[] = ["blinkit", "zepto", "instamart", "bigbasket"];
    const subsets = enumerateNonEmptySubsets(platforms);
    expect(subsets.length).toBe(15);

    const size1 = subsets.filter((s) => s.length === 1);
    const size2 = subsets.filter((s) => s.length === 2);
    const size3 = subsets.filter((s) => s.length === 3);
    const size4 = subsets.filter((s) => s.length === 4);

    expect(size1.length).toBe(4);
    expect(size2.length).toBe(6);
    expect(size3.length).toBe(4);
    expect(size4.length).toBe(1);

    // 2. Run optimizer with 4 platforms
    const observations: PlatformObservationInput[] = [
      {
        canonicalProductId: "milk-1l",
        name: "Amul Taaza Milk 1L",
        platformId: "blinkit",
        pricePaise: 5400,
        availabilityStatus: "IN_STOCK",
      },
      {
        canonicalProductId: "milk-1l",
        name: "Amul Taaza Milk 1L",
        platformId: "zepto",
        pricePaise: 5400,
        availabilityStatus: "IN_STOCK",
      },
      {
        canonicalProductId: "milk-1l",
        name: "Amul Taaza Milk 1L",
        platformId: "instamart",
        pricePaise: 5500,
        availabilityStatus: "IN_STOCK",
      },
      {
        canonicalProductId: "milk-1l",
        name: "Amul Taaza Milk 1L",
        platformId: "bigbasket",
        pricePaise: 5400,
        availabilityStatus: "IN_STOCK",
      },
    ];

    const result = await service.optimizeBasket({
      items: [{ canonicalProductId: "milk-1l", queryName: "Milk 1L", quantity: 2 }],
      pincode: TEST_PINCODE,
      enabledPlatforms: platforms,
      observationsOverride: observations,
    });

    expect(result.pincode).toBe(TEST_PINCODE);
    expect(result.evaluatedSubsetsCount).toBe(15);
    expect(result.allSubsetEvaluations.length).toBe(15);

    // Check ranks 1 to 15
    for (let r = 1; r <= 15; r++) {
      const entry = result.allSubsetEvaluations.find((e) => e.rank === r);
      expect(entry).toBeDefined();
      expect(entry!.estimatedTotalMinPaise).toBeGreaterThan(0);
      expect([10800, 11000]).toContain(entry!.subtotalPaise);
    }

    // Single platform rankings has all 4 individual platforms
    expect(result.singlePlatformRankings.length).toBe(4);
    const singlePlatformNames = result.singlePlatformRankings.map((r) => r.platforms[0]);
    expect(singlePlatformNames).toContain("blinkit");
    expect(singlePlatformNames).toContain("zepto");
    expect(singlePlatformNames).toContain("instamart");
    expect(singlePlatformNames).toContain("bigbasket");
  });

  it("Fee Penalty Proof Test: Proves cherry-picking across 4 stores incurs heavy fee penalty while Strategy 3 rejects the 4-store split", async () => {
    // 4 items: each item is ₹5 (500 paise) cheaper on one platform
    // Blinkit: Item 1 is ₹95, others ₹100
    // Zepto: Item 2 is ₹95, others ₹100
    // Instamart: Item 3 is ₹95, others ₹100
    // BigBasket: Item 4 is ₹95, others ₹100
    const observations: PlatformObservationInput[] = [
      // Item 1
      { canonicalProductId: "item-1", name: "Item 1", platformId: "blinkit", pricePaise: 9500, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-1", name: "Item 1", platformId: "zepto", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-1", name: "Item 1", platformId: "instamart", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-1", name: "Item 1", platformId: "bigbasket", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      // Item 2
      { canonicalProductId: "item-2", name: "Item 2", platformId: "blinkit", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-2", name: "Item 2", platformId: "zepto", pricePaise: 9500, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-2", name: "Item 2", platformId: "instamart", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-2", name: "Item 2", platformId: "bigbasket", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      // Item 3
      { canonicalProductId: "item-3", name: "Item 3", platformId: "blinkit", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-3", name: "Item 3", platformId: "zepto", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-3", name: "Item 3", platformId: "instamart", pricePaise: 9500, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-3", name: "Item 3", platformId: "bigbasket", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      // Item 4
      { canonicalProductId: "item-4", name: "Item 4", platformId: "blinkit", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-4", name: "Item 4", platformId: "zepto", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-4", name: "Item 4", platformId: "instamart", pricePaise: 10000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-4", name: "Item 4", platformId: "bigbasket", pricePaise: 9500, availabilityStatus: "IN_STOCK" },
    ];

    const result = await service.optimizeBasket({
      items: [
        { canonicalProductId: "item-1", queryName: "Item 1", quantity: 1 },
        { canonicalProductId: "item-2", queryName: "Item 2", quantity: 1 },
        { canonicalProductId: "item-3", queryName: "Item 3", quantity: 1 },
        { canonicalProductId: "item-4", queryName: "Item 4", quantity: 1 },
      ],
      pincode: TEST_PINCODE,
      observationsOverride: observations,
    });

    const strategy1 = result.strategies.cheapestItemByItem;
    const strategy2 = result.strategies.cheapestSinglePlatform;
    const strategy3 = result.strategies.optimizedMultiPlatform;

    // Strategy 1: naive split across all 4 platforms
    expect(strategy1.platforms.length).toBe(4);
    // Shelf subtotal is 4 x ₹95 = ₹380 (38,000 paise)
    expect(strategy1.shelfSubtotalPaise).toBe(38000);
    // Cumulative fees across all 4 stores exceed ₹160 (16,000 paise)
    expect(strategy1.totalFeeMinPaise).toBeGreaterThanOrEqual(16000);
    // All-in spend for naive split is > ₹550 (55,000 paise)
    expect(strategy1.estimatedTotalMinPaise).toBeGreaterThan(55000);

    // Strategy 2: Single platform (e.g. Blinkit or Zepto)
    // Shelf subtotal is 1 x 9500 + 3 x 10000 = 39500 paise
    // Only 1 delivery fee + handling fee + platform fee
    expect(strategy2.platforms.length).toBe(1);
    expect(strategy2.estimatedTotalMinPaise).toBeLessThan(strategy1.estimatedTotalMinPaise);

    // Strategy 3: Evaluates all 15 subsets and rejects the 4-store split in favor of 1 store!
    expect(strategy3.platforms.length).toBe(1);
    expect(strategy3.estimatedTotalMinPaise).toBeLessThan(strategy1.estimatedTotalMinPaise);

    // Final recommendation must be CHEAPEST_SINGLE_PLATFORM
    expect(result.recommendation.winningStrategy).toBe("CHEAPEST_SINGLE_PLATFORM");
    expect(result.recommendation.netSavingsPaise).toBe(0);
    expect(result.recommendation.rationale).toContain("cumulative delivery and handling fees");
  });

  it("Genuine Multi-Store Split Win Test: Proves 2-store split wins when baskets cross free delivery threshold and yield net savings", async () => {
    // Large basket:
    // Item 1 (e.g. Premium Olive Oil): ₹500 on Blinkit, ₹700 on Zepto
    // Item 2 (e.g. Bulk Nuts & Coffee): ₹500 on Zepto, ₹700 on Blinkit
    // Subtotal on Blinkit = ₹500 (50,000 paise) >= ₹499 free delivery threshold!
    // Subtotal on Zepto = ₹500 (50,000 paise) >= ₹499 free delivery threshold!
    const observations: PlatformObservationInput[] = [
      { canonicalProductId: "olive-oil", name: "Borges Extra Virgin Olive Oil 1L", platformId: "blinkit", pricePaise: 50000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "olive-oil", name: "Borges Extra Virgin Olive Oil 1L", platformId: "zepto", pricePaise: 70000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "bulk-coffee", name: "Nescafe Gold Coffee 200g", platformId: "blinkit", pricePaise: 70000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "bulk-coffee", name: "Nescafe Gold Coffee 200g", platformId: "zepto", pricePaise: 50000, availabilityStatus: "IN_STOCK" },
    ];

    const result = await service.optimizeBasket({
      items: [
        { canonicalProductId: "olive-oil", queryName: "Olive Oil 1L", quantity: 1 },
        { canonicalProductId: "bulk-coffee", queryName: "Coffee 200g", quantity: 1 },
      ],
      pincode: TEST_PINCODE,
      enabledPlatforms: ["blinkit", "zepto"],
      observationsOverride: observations,
    });

    const strategy2 = result.strategies.cheapestSinglePlatform;
    const strategy3 = result.strategies.optimizedMultiPlatform;

    // Single store:
    // Blinkit: 50000 + 70000 = 120000 paise + fees
    // Zepto: 70000 + 50000 = 120000 paise + fees
    expect(strategy2.platforms.length).toBe(1);
    expect(strategy2.itemSubtotalPaise).toBe(120000);

    // 2-store split:
    // Blinkit: 50000 paise (free delivery!) + handling 400 + platform 200 = 50600 paise
    // Zepto: 50000 paise (free delivery!) + handling 500 + platform 300 = 50800 paise
    // Total 2-store split all-in: 50600 + 50800 = 101400 paise
    expect(strategy3.platforms.length).toBe(2);
    expect(strategy3.platforms).toContain("blinkit");
    expect(strategy3.platforms).toContain("zepto");
    expect(strategy3.itemSubtotalPaise).toBe(100000);
    expect(strategy3.estimatedTotalMinPaise).toBe(101400);

    // Exact net savings: 120600 (Blinkit single store) - 101400 (split) = 19200 paise (₹192.00)
    expect(strategy3.savingsVsSinglePlatformPaise).toBe(19200);

    // Recommendation must declare OPTIMIZED_MULTI_PLATFORM_SPLIT winner!
    expect(result.recommendation.winningStrategy).toBe("OPTIMIZED_MULTI_PLATFORM_SPLIT");
    expect(result.recommendation.netSavingsPaise).toBe(19200);
    expect(result.recommendation.rationale).toContain("Smart Split across 2 stores");
    expect(result.recommendation.rationale).toContain("saves ₹192.00");
  });

  it("Unknown Fee Propagation Test: Proves that when BigBasket is part of a strategy, hasUnknownFees is true and dynamic fee range 500..1500 is preserved", async () => {
    const observations: PlatformObservationInput[] = [
      {
        canonicalProductId: "atta-10kg",
        name: "Aashirvaad Superior MP Atta 10kg",
        platformId: "bigbasket",
        pricePaise: 42000,
        availabilityStatus: "IN_STOCK",
      },
      {
        canonicalProductId: "atta-10kg",
        name: "Aashirvaad Superior MP Atta 10kg",
        platformId: "blinkit",
        pricePaise: 48000,
        availabilityStatus: "IN_STOCK",
      },
    ];

    const result = await service.optimizeBasket({
      items: [{ canonicalProductId: "atta-10kg", queryName: "Atta 10kg", quantity: 1 }],
      pincode: TEST_PINCODE,
      enabledPlatforms: ["bigbasket", "blinkit"],
      observationsOverride: observations,
    });

    // Check BigBasket in singlePlatformRankings
    const bbSingle = result.singlePlatformRankings.find((r) => r.platforms[0] === "bigbasket")!;
    expect(bbSingle).toBeDefined();
    expect(bbSingle.hasUnknownFees).toBe(true);

    // Handling fee for BigBasket in Delhi is 500 to 1500 paise (difference of 1000 paise)
    expect(bbSingle.totalFeeMinPaise).toBeLessThan(bbSingle.totalFeeMaxPaise);
    expect(bbSingle.totalFeeMaxPaise - bbSingle.totalFeeMinPaise).toBe(1000);
    expect(bbSingle.estimatedTotalMinPaise).toBeLessThan(bbSingle.estimatedTotalMaxPaise);
    expect(bbSingle.estimatedTotalMaxPaise - bbSingle.estimatedTotalMinPaise).toBe(1000);

    // Verify unknown fee is never coerced to 0
    expect(bbSingle.storeCarts.bigbasket.feeBreakdown.handlingFee.minPaise).toBe(500);
    expect(bbSingle.storeCarts.bigbasket.feeBreakdown.handlingFee.maxPaise).toBe(1500);
    expect(bbSingle.storeCarts.bigbasket.feeBreakdown.handlingFee.isKnown).toBe(false);

    // Since BigBasket is cheaper by ₹60 on shelf (42000 vs 48000), it wins
    expect(result.recommendation.hasUnknownFees).toBe(true);
    expect(result.strategies.cheapestItemByItem.hasUnknownFees).toBe(true);
  });

  it("Partial Coverage & Out-of-Stock Handling: Gracefully routes out-of-stock items to in-stock platforms and flags missing items", async () => {
    const observations: PlatformObservationInput[] = [
      // Item 1: In stock on Blinkit and Zepto
      { canonicalProductId: "bread", name: "Harvest Gold Bread", platformId: "blinkit", pricePaise: 4500, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "bread", name: "Harvest Gold Bread", platformId: "zepto", pricePaise: 4500, availabilityStatus: "IN_STOCK" },

      // Item 2: OUT_OF_STOCK on Blinkit, IN_STOCK on Zepto
      { canonicalProductId: "butter", name: "Amul Butter 500g", platformId: "blinkit", pricePaise: 27500, availabilityStatus: "OUT_OF_STOCK" },
      { canonicalProductId: "butter", name: "Amul Butter 500g", platformId: "zepto", pricePaise: 27500, availabilityStatus: "IN_STOCK" },

      // Item 3: UNAVAILABLE everywhere
      { canonicalProductId: "exotic-truffle", name: "White Truffle Oil", platformId: "blinkit", pricePaise: 99000, availabilityStatus: "UNAVAILABLE" },
      { canonicalProductId: "exotic-truffle", name: "White Truffle Oil", platformId: "zepto", pricePaise: 99000, availabilityStatus: "OUT_OF_STOCK" },
    ];

    const result = await service.optimizeBasket({
      items: [
        { canonicalProductId: "bread", queryName: "Bread", quantity: 1 },
        { canonicalProductId: "butter", queryName: "Butter", quantity: 1 },
        { canonicalProductId: "exotic-truffle", queryName: "Exotic Truffle", quantity: 1 },
      ],
      pincode: TEST_PINCODE,
      enabledPlatforms: ["blinkit", "zepto"],
      observationsOverride: observations,
    });

    // 1. Single store ranking must rank Zepto ahead of Blinkit due to coverage (2 vs 1)
    const bbRank = result.singlePlatformRankings.find((r) => r.platforms[0] === "blinkit")!;
    const zeptoRank = result.singlePlatformRankings.find((r) => r.platforms[0] === "zepto")!;
    expect(zeptoRank.coverageCount).toBe(2);
    expect(bbRank.coverageCount).toBe(1);
    expect(result.singlePlatformRankings[0].platforms[0]).toBe("zepto");

    // 2. Strategy 1 & Strategy 3 should route Item 1 & 2 to in-stock stores
    expect(result.strategies.cheapestItemByItem.coverageCount).toBe(2);
    expect(result.strategies.cheapestItemByItem.missingItems.length).toBe(1);
    expect(result.strategies.cheapestItemByItem.missingItems[0].canonicalProductId).toBe("exotic-truffle");

    expect(result.strategies.optimizedMultiPlatform.coverageCount).toBe(2);
    expect(result.strategies.optimizedMultiPlatform.missingItems.length).toBe(1);
    expect(result.strategies.optimizedMultiPlatform.missingItems[0].queryName).toBe("Exotic Truffle");
  });

  it("Financial Invariant Enforcement: Strictly rejects float paise values, negative quantities, and invalid pincodes", async () => {
    // 1. Float price in paise
    await expect(
      service.optimizeBasket({
        items: [{ queryName: "Milk", quantity: 1 }],
        pincode: TEST_PINCODE,
        observationsOverride: [
          {
            name: "Milk",
            platformId: "blinkit",
            pricePaise: 54.5 as any, // Fractional paise forbidden!
            availabilityStatus: "IN_STOCK",
          },
        ],
      })
    ).rejects.toThrow(/Financial invariant violation/);

    // 2. Negative price in paise
    await expect(
      service.optimizeBasket({
        items: [{ queryName: "Milk", quantity: 1 }],
        pincode: TEST_PINCODE,
        observationsOverride: [
          {
            name: "Milk",
            platformId: "blinkit",
            pricePaise: -5400,
            availabilityStatus: "IN_STOCK",
          },
        ],
      })
    ).rejects.toThrow(/Financial invariant violation/);

    // 3. Negative quantity
    await expect(
      service.optimizeBasket({
        items: [{ queryName: "Milk", quantity: -2 }],
        pincode: TEST_PINCODE,
      })
    ).rejects.toThrow(/Financial invariant violation/);

    // 4. Invalid 4-digit pincode
    await expect(
      service.optimizeBasket({
        items: [{ queryName: "Milk", quantity: 1 }],
        pincode: "1100", // Invalid length
      })
    ).rejects.toThrow(/Invalid pincode/);

    // 5. Non-numeric pincode
    await expect(
      service.optimizeBasket({
        items: [{ queryName: "Milk", quantity: 1 }],
        pincode: "DELHI1",
      })
    ).rejects.toThrow(/Invalid pincode/);
  });

  it("Boundary Reallocation: Shifts an item to a store to cross free delivery threshold when net spend is lower", async () => {
    // Store 1 (Blinkit): free delivery at ₹499 (49900 paise), delivery fee ₹25 (2500 paise)
    // Store 2 (Zepto): free delivery at ₹499 (49900 paise), delivery fee ₹25 (2500 paise)
    // Item A: ₹450 on Blinkit, ₹450 on Zepto (assigned to Blinkit initially)
    // Item B: ₹60 on Blinkit, ₹55 on Zepto (Zepto is ₹5 cheaper, so initially assigned to Zepto)
    // Initial assignment:
    //   Blinkit: Item A = ₹450 (< ₹499) -> incurs ₹25 delivery fee + handling ₹4 + platform ₹2 = ₹31 fee. Total = ₹481.
    //   Zepto: Item B = ₹55 (< ₹149 small cart) -> incurs ₹25 delivery + ₹20 small cart + ₹5 handling + ₹3 platform = ₹53 fee. Total = ₹108.
    //   Total initial split spend = ₹481 + ₹108 = ₹589 (58,900 paise).
    // Boundary reallocation test:
    //   If Item B is shifted to Blinkit (even though Item B is ₹5 more expensive on Blinkit):
    //   Blinkit subtotal becomes ₹450 + ₹60 = ₹510 (51,000 paise).
    //   Blinkit crosses ₹499 free delivery threshold! Delivery fee becomes ₹0.
    //   Blinkit fees = ₹4 handling + ₹2 platform = ₹6.
    //   Blinkit total = ₹510 + ₹6 = ₹516 (51,600 paise).
    //   Zepto has 0 items -> ₹0.
    //   Net spend drops from ₹589 to ₹516! (Net savings of ₹73).
    const observations: PlatformObservationInput[] = [
      { canonicalProductId: "item-a", name: "Item A Large", platformId: "blinkit", pricePaise: 45000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-a", name: "Item A Large", platformId: "zepto", pricePaise: 45000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-b", name: "Item B Small", platformId: "blinkit", pricePaise: 6000, availabilityStatus: "IN_STOCK" },
      { canonicalProductId: "item-b", name: "Item B Small", platformId: "zepto", pricePaise: 5500, availabilityStatus: "IN_STOCK" },
    ];

    const result = await service.optimizeBasket({
      items: [
        { canonicalProductId: "item-a", queryName: "Item A", quantity: 1 },
        { canonicalProductId: "item-b", queryName: "Item B", quantity: 1 },
      ],
      pincode: TEST_PINCODE,
      enabledPlatforms: ["blinkit", "zepto"],
      observationsOverride: observations,
    });

    // The optimizer should reallocate Item B to Blinkit and recognize 1 store is cheaper
    expect(result.recommendation.winningStrategy).toBe("CHEAPEST_SINGLE_PLATFORM");
    expect(result.strategies.optimizedMultiPlatform.estimatedTotalMinPaise).toBeLessThanOrEqual(51600);
  });
});
