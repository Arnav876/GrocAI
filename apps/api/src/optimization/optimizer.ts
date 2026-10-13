import {
  OptimizationOption,
  OptimizationStrategy,
  PlatformCartPlan,
  PlatformId,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  paiseToRupees,
  FeeSummary,
  OptimizationLineItem,
  UnknownFeeDetail,
} from "@groqai/shared";

export interface ItemListingInput {
  platform: PlatformId;
  pricePaise: number | null; // null if unavailable
  availability: "available" | "unavailable" | "unknown";
  isStale: boolean;
  confidence: number;
  sourceType: "authorized_api" | "partner_feed" | "permitted_page" | "manual" | "mock";
  searchUrl?: string;
}

export interface RequestedOptimizationItem {
  id: string;
  query: string;
  quantity: number;
  unit: string;
  matchedTitle: string;
  brand: string;
  variant: string;
  packSize: string;
  listings: Record<PlatformId, ItemListingInput>;
}

export interface FeeRuleInput {
  platform: PlatformId;
  deliveryFeePaise: number | null;
  handlingFeePaise: number | null;
  handlingFeeRangeMinPaise?: number | null;
  handlingFeeRangeMaxPaise?: number | null;
  platformFeePaise: number | null;
  freeDeliveryThresholdPaise: number | null;
  minimumOrderValuePaise: number | null;
}

export interface OptimizationEngineInput {
  items: RequestedOptimizationItem[];
  feeRules: Record<PlatformId, FeeRuleInput>;
  maxPlatforms?: number;
  minimumSavingsPaise?: number; // e.g. 2000 paise (₹20)
  budgetPaise?: number;
}

export interface OptimizationEngineOutput {
  baselineName: string;
  baselineTotalPaise: number;
  baselineTotalRupees: number;
  options: OptimizationOption[];
  warnings: string[];
}

export function runOptimizationEngine(input: OptimizationEngineInput): OptimizationEngineOutput {
  const { items, feeRules, maxPlatforms = 3, minimumSavingsPaise = 2000, budgetPaise } = input;
  const warnings: string[] = [];

  if (items.length === 0) {
    return {
      baselineName: "Empty Basket",
      baselineTotalPaise: 0,
      baselineTotalRupees: 0,
      options: [],
      warnings: ["No items provided in basket to optimize"],
    };
  }

  // 1. Evaluate All 4 Single Store Options to establish Baseline & Strategy 2
  const singleStorePlans: {
    platform: PlatformId;
    option: OptimizationOption;
    totalPaise: number;
    feasible: boolean;
  }[] = [];

  for (const pid of SUPPORTED_PLATFORMS) {
    const subset: PlatformId[] = [pid];
    const planResult = buildPlanForPlatformSubset(subset, items, feeRules, "cheapest_single_platform");
    singleStorePlans.push({
      platform: pid,
      option: planResult,
      totalPaise: planResult.estimatedTotalPaise,
      feasible: planResult.isFeasible,
    });
  }

  // Sort single store plans prioritizing 100% item coverage first, then feasibility, then total cost
  const sortedSinglePlans = [...singleStorePlans].sort((a, b) => {
    // 1. More items matched is better
    const missingDiff = a.option.dataCoverage.missingItems - b.option.dataCoverage.missingItems;
    if (missingDiff !== 0) return missingDiff;
    // 2. Feasible is better
    if (a.feasible && !b.feasible) return -1;
    if (!a.feasible && b.feasible) return 1;
    // 3. Lower total is better
    return a.totalPaise - b.totalPaise;
  });
  const bestSingle = sortedSinglePlans[0];
  const baselineName = `Cheapest Single Store (${PLATFORM_METADATA[bestSingle.platform].name})`;
  const baselineTotalPaise = bestSingle.totalPaise;

  // Finalize Strategy 2 Option (cheapest_single_platform)
  const singleOption: OptimizationOption = {
    ...bestSingle.option,
    baselineName,
    savingsVsBaselinePaise: 0,
    savingsVsBaselineRupees: 0,
  };

  // 2. Evaluate Strategy 1: cheapest_item_by_item (Greedy across all available)
  const itemByItemOption = buildPlanForPlatformSubset(
    SUPPORTED_PLATFORMS,
    items,
    feeRules,
    "cheapest_item_by_item",
    baselineName,
    baselineTotalPaise
  );

  // 3. Evaluate Strategy 3: optimized_multi_platform
  // Enumerate all subsets of size 1 to maxPlatforms (2^4 - 1 = 15 total subsets)
  const allSubsets = enumerateSubsets(SUPPORTED_PLATFORMS, maxPlatforms);
  let bestMultiOption: OptimizationOption | null = null;
  let lowestMultiTotalPaise = Infinity;

  for (const subset of allSubsets) {
    if (subset.length === 0) continue;
    const candidatePlan = buildPlanForPlatformSubset(
      subset,
      items,
      feeRules,
      "optimized_multi_platform",
      baselineName,
      baselineTotalPaise
    );

    // Only consider feasible plans where all items are matched and minimum orders met
    if (candidatePlan.isFeasible && candidatePlan.dataCoverage.missingItems === 0) {
      if (candidatePlan.estimatedTotalPaise < lowestMultiTotalPaise) {
        lowestMultiTotalPaise = candidatePlan.estimatedTotalPaise;
        bestMultiOption = candidatePlan;
      }
    }
  }

  // Fallback if no multi-platform subset fulfilled all items
  if (!bestMultiOption) {
    bestMultiOption = {
      ...singleOption,
      strategy: "optimized_multi_platform",
      title: "Smart Split (Single Platform Recommended)",
    };
  }

  // Evaluate whether split savings exceed minimumSavingsPaise threshold or if split was rejected due to fees
  const netSavingsPaise = baselineTotalPaise - bestMultiOption.estimatedTotalPaise;

  if (bestMultiOption.platforms.length === 1 && itemByItemOption.platforms.length > 1) {
    bestMultiOption = {
      ...bestMultiOption,
      title: "Smart Split (Single Platform Recommended)",
      warnings: [
        ...bestMultiOption.warnings,
        `Splitting across stores was evaluated, but additional delivery fees would erase savings. Ordering entirely from ${PLATFORM_METADATA[bestSingle.platform].name} is the lowest-cost choice.`,
      ],
      explanation: {
        summary: `Keeping all items with ${PLATFORM_METADATA[bestSingle.platform].name} is cheaper than paying multiple delivery and platform fees.`,
        reasoning: [
          `Multi-store split was evaluated, but additional delivery fees exceed product price differences.`,
          `Ordering from a single store avoids multiple delivery and handling surcharges.`,
        ],
        pros: ["1 delivery only", "Zero coordination hassle", "Lowest net total cost"],
        cons: [],
      },
    };
  } else if (netSavingsPaise < minimumSavingsPaise && bestMultiOption.platforms.length > 1) {
    // Fees erase the savings or savings are below user threshold! Revert to single store.
    bestMultiOption = {
      ...singleOption,
      strategy: "optimized_multi_platform",
      title: "Smart Split (Single Platform Recommended)",
      warnings: [
        ...singleOption.warnings,
        `Splitting across stores was evaluated, but additional delivery fees would erase savings. Ordering entirely from ${PLATFORM_METADATA[bestSingle.platform].name} is the lowest-cost choice.`,
      ],
      explanation: {
        summary: `Keeping all items with ${PLATFORM_METADATA[bestSingle.platform].name} is cheaper than paying multiple delivery and platform fees.`,
        reasoning: [
          `Multi-store split savings of ₹${paiseToRupees(Math.max(0, netSavingsPaise))} is below your ₹${paiseToRupees(minimumSavingsPaise)} threshold.`,
          `Extra delivery fees outweigh shelf price differences.`,
        ],
        pros: ["1 delivery only", "Zero coordination hassle", "Lowest net total cost"],
        cons: [],
      },
    };
  }

  // Budget validation check
  if (budgetPaise && bestMultiOption.estimatedTotalPaise > budgetPaise) {
    warnings.push(
      `Estimated total (₹${bestMultiOption.estimatedTotalRupees}) exceeds your target budget (₹${paiseToRupees(budgetPaise)}) by ₹${bestMultiOption.estimatedTotalRupees - paiseToRupees(budgetPaise)}.`
    );
  }

  return {
    baselineName,
    baselineTotalPaise,
    baselineTotalRupees: paiseToRupees(baselineTotalPaise),
    options: [bestMultiOption, singleOption, itemByItemOption],
    warnings,
  };
}

function enumerateSubsets<T>(elements: T[], maxSize: number): T[][] {
  const result: T[][] = [];
  const total = 1 << elements.length;
  for (let i = 1; i < total; i++) {
    const subset: T[] = [];
    for (let j = 0; j < elements.length; j++) {
      if ((i & (1 << j)) !== 0) {
        subset.push(elements[j]);
      }
    }
    if (subset.length <= maxSize) {
      result.push(subset);
    }
  }
  return result;
}

function buildPlanForPlatformSubset(
  subset: PlatformId[],
  items: RequestedOptimizationItem[],
  feeRules: Record<PlatformId, FeeRuleInput>,
  strategy: OptimizationStrategy,
  baselineName: string = "Baseline",
  baselineTotalPaise: number = 0
): OptimizationOption {
  const perPlatItems: Record<PlatformId, OptimizationLineItem[]> = {
    blinkit: [],
    zepto: [],
    instamart: [],
    bigbasket: [],
  };

  let missingItemsCount = 0;

  // Assign each item to the cheapest available store in the subset
  for (const item of items) {
    let cheapestPlat: PlatformId | null = null;
    let lowestPrice = Infinity;

    for (const pid of subset) {
      const listing = item.listings[pid];
      if (listing && listing.availability === "available" && listing.pricePaise !== null) {
        if (listing.pricePaise < lowestPrice) {
          lowestPrice = listing.pricePaise;
          cheapestPlat = pid;
        }
      }
    }

    if (cheapestPlat && lowestPrice < Infinity) {
      const listing = item.listings[cheapestPlat]!;
      const totalPaise = lowestPrice * item.quantity;

      perPlatItems[cheapestPlat].push({
        id: `${item.id}-${cheapestPlat}`,
        requestedQuery: item.query,
        requestedQuantity: item.quantity,
        requestedUnit: item.unit,
        matchedTitle: item.matchedTitle,
        brand: item.brand,
        variant: item.variant,
        packSize: item.packSize,
        unitPricePaise: lowestPrice,
        unitPriceRupees: paiseToRupees(lowestPrice),
        quantity: item.quantity,
        totalPricePaise: totalPaise,
        totalPriceRupees: paiseToRupees(totalPaise),
        availability: "available",
        searchUrl: listing.searchUrl,
        isStale: listing.isStale,
        confidence: listing.confidence,
        sourceType: listing.sourceType,
      });
    } else {
      missingItemsCount++;
    }
  }

  // Calculate fees per platform
  const perPlatform: Record<string, PlatformCartPlan> = {};
  let totalSubtotalPaise = 0;
  let totalDeliveryPaise = 0;
  let totalHandlingPaise = 0;
  let totalPlatformPaise = 0;
  let hasAnyUnknownFees = false;
  let allMinOrdersMet = true;

  const activePlatforms: PlatformId[] = [];

  for (const pid of subset) {
    const pItems = perPlatItems[pid];
    if (pItems.length === 0) continue;

    activePlatforms.push(pid);
    const rule = feeRules[pid];
    const subtotal = pItems.reduce((sum, it) => sum + it.totalPricePaise, 0);
    totalSubtotalPaise += subtotal;

    const isFreeDelivery = rule.freeDeliveryThresholdPaise && subtotal >= rule.freeDeliveryThresholdPaise;
    const deliveryPaise = isFreeDelivery
      ? 0
      : rule.deliveryFeePaise !== null
      ? rule.deliveryFeePaise
      : 3000;

    // Unknown handling fee handling (e.g. BigBasket range or null)
    const isHandlingUnknown = rule.handlingFeePaise === null;
    if (isHandlingUnknown) {
      hasAnyUnknownFees = true;
    }
    // Estimated handling: if range min/max exists, use midpoint for estimation, but flag unknown
    const handlingPaise =
      rule.handlingFeePaise !== null
        ? rule.handlingFeePaise
        : rule.handlingFeeRangeMinPaise && rule.handlingFeeRangeMaxPaise
        ? Math.round((rule.handlingFeeRangeMinPaise + rule.handlingFeeRangeMaxPaise) / 2)
        : 1000;

    const platformPaise = rule.platformFeePaise !== null ? rule.platformFeePaise : 300;

    totalDeliveryPaise += deliveryPaise;
    totalHandlingPaise += handlingPaise;
    totalPlatformPaise += platformPaise;

    const meetsMinOrder = !rule.minimumOrderValuePaise || subtotal >= rule.minimumOrderValuePaise;
    if (!meetsMinOrder) {
      allMinOrdersMet = false;
    }

    const estimatedTotal = subtotal + deliveryPaise + handlingPaise + platformPaise;

    perPlatform[pid] = {
      platform: pid,
      platformName: PLATFORM_METADATA[pid].name,
      items: pItems,
      itemCount: pItems.length,
      subtotalPaise: subtotal,
      subtotalRupees: paiseToRupees(subtotal),
      deliveryFeePaise: deliveryPaise,
      deliveryFeeRupees: paiseToRupees(deliveryPaise),
      handlingFeePaise: handlingPaise,
      handlingFeeRupees: paiseToRupees(handlingPaise),
      platformFeePaise: platformPaise,
      platformFeeRupees: paiseToRupees(platformPaise),
      discountsPaise: 0,
      discountsRupees: 0,
      estimatedTotalPaise: estimatedTotal,
      estimatedTotalRupees: paiseToRupees(estimatedTotal),
      meetsMinimumOrder: meetsMinOrder,
      minimumOrderValuePaise: rule.minimumOrderValuePaise || undefined,
      shortfallForMinimumOrderPaise:
        rule.minimumOrderValuePaise && subtotal < rule.minimumOrderValuePaise
          ? rule.minimumOrderValuePaise - subtotal
          : undefined,
      hasUnknownFee: isHandlingUnknown,
      unknownFeeExplanation: isHandlingUnknown
        ? `Handling fee not published (estimated range ₹${paiseToRupees(
            rule.handlingFeeRangeMinPaise || 500
          )} – ₹${paiseToRupees(rule.handlingFeeRangeMaxPaise || 1500)})`
        : undefined,
      supportsDeepLinks: false,
    };
  }

  const estimatedTotalPaise =
    totalSubtotalPaise + totalDeliveryPaise + totalHandlingPaise + totalPlatformPaise;
  const savingsVsBaselinePaise = baselineTotalPaise > 0 ? baselineTotalPaise - estimatedTotalPaise : 0;

  const estimatedFees: FeeSummary = {
    deliveryPaise: totalDeliveryPaise,
    deliveryRupees: paiseToRupees(totalDeliveryPaise),
    handlingPaise: totalHandlingPaise,
    handlingRupees: paiseToRupees(totalHandlingPaise),
    platformPaise: totalPlatformPaise,
    platformRupees: paiseToRupees(totalPlatformPaise),
    otherPaise: 0,
    otherRupees: 0,
    totalPaise: totalDeliveryPaise + totalHandlingPaise + totalPlatformPaise,
    totalRupees: paiseToRupees(totalDeliveryPaise + totalHandlingPaise + totalPlatformPaise),
    hasUnknownFees: hasAnyUnknownFees,
  };

  const unknownFeesDetail: UnknownFeeDetail | null = hasAnyUnknownFees
    ? {
        feeNames: ["handlingFee"],
        ranges: {
          handlingFee: {
            minPaise: 500,
            maxPaise: 1500,
            minRupees: 5,
            maxRupees: 15,
          },
        },
        message: "BigBasket handling fee is unverified for this pincode (estimated range ₹5 – ₹15)",
      }
    : null;

  const title =
    strategy === "cheapest_single_platform"
      ? `Single Store: ${PLATFORM_METADATA[subset[0]].name}`
      : strategy === "cheapest_item_by_item"
      ? "Cheapest Item-by-Item (Raw Best Price)"
      : activePlatforms.length > 1
      ? `Smart Split (${activePlatforms.length} Stores)`
      : `Single Store: ${PLATFORM_METADATA[activePlatforms[0] || subset[0]].name}`;

  return {
    id: `plan-${strategy}-${subset.join("-")}`,
    strategy,
    title,
    platforms: activePlatforms.length > 0 ? activePlatforms : subset,
    perPlatform,
    subtotalPaise: totalSubtotalPaise,
    subtotalRupees: paiseToRupees(totalSubtotalPaise),
    estimatedFees,
    knownFees: estimatedFees,
    unknownFees: unknownFeesDetail,
    verifiedDiscountsPaise: 0,
    verifiedDiscountsRupees: 0,
    estimatedTotalPaise,
    estimatedTotalRupees: paiseToRupees(estimatedTotalPaise),
    orderCount: activePlatforms.length,
    savingsVsBaselinePaise,
    savingsVsBaselineRupees: paiseToRupees(savingsVsBaselinePaise),
    baselineName,
    isEstimate: true,
    warnings: (() => {
      const list: string[] = [];
      if (savingsVsBaselinePaise < 0) {
        list.push(
          `Extra delivery and platform fees erase shelf savings by ₹${Math.abs(
            paiseToRupees(savingsVsBaselinePaise)
          )}.`
        );
      }
      if (!allMinOrdersMet) {
        list.push(
          "One or more orders do not meet the platform minimum order value requirement."
        );
      }
      if (missingItemsCount > 0) {
        list.push(
          `${missingItemsCount} item(s) could not be found or are out of stock on selected platform(s).`
        );
      }
      return list;
    })(),
    explanation: {
      summary:
        strategy === "cheapest_single_platform"
          ? `All items ordered from ${PLATFORM_METADATA[subset[0]].name} in a single delivery.`
          : strategy === "cheapest_item_by_item"
          ? `Each item bought at the lowest shelf price across all platforms.`
          : `Optimized combination minimizing total cost including delivery & platform fees.`,
      reasoning: [
        `Subtotal: ₹${paiseToRupees(totalSubtotalPaise)}`,
        `Fees: ₹${paiseToRupees(totalDeliveryPaise + totalHandlingPaise + totalPlatformPaise)} across ${activePlatforms.length} order(s).`,
      ],
      pros: activePlatforms.length === 1 ? ["1 delivery only", "Zero coordination"] : ["Lower shelf prices"],
      cons: activePlatforms.length > 1 ? [`${activePlatforms.length} deliveries`] : [],
    },
    dataCoverage: {
      totalItems: items.length,
      matchedItems: items.length - missingItemsCount,
      missingItems: missingItemsCount,
      percentage: Math.round(((items.length - missingItemsCount) / items.length) * 100),
    },
    isFeasible: allMinOrdersMet && missingItemsCount === 0,
  };
}
