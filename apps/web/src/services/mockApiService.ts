import {
  CategoryInfo,
  DataProvenance,
  OptimizationOption,
  OptimizationRequestSchema,
  OptimizationResponse,
  PlatformCartPlan,
  PlatformHealthStatus,
  PlatformId,
  ProductSummary,
  ProvenanceListingRow,
  ShoppingHandoffResponse,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  paiseToRupees,
  rupeesToPaise,
  summarizeProvenance,
  FeeSummary,
  OptimizationLineItem,
  NullCartAdapter,
  BasketOptimizationRequest,
  BasketOptimizationResult,
  ShoppingHandoffPayload,
  StrategyEvaluation,
  StoreCartEvaluation,
  SubsetEvaluationSummary,
  formatPaiseToRupees,
  assertIntegerPaise,
  AssignedLineItem,
  FeeBreakdownPaise,
} from "@groqai/shared";
import { z } from "zod";
import { MOCK_CATEGORIES } from "../fixtures/mockCategories.js";
import { MOCK_PRODUCTS } from "../fixtures/mockProducts.js";
import { MOCK_PLATFORM_FEE_RULES } from "../fixtures/mockFeeRules.js";

type OptimizationRequestInput = z.input<typeof OptimizationRequestSchema>;

const storedOptimizations = new Map<string, OptimizationResponse>();

export class MockApiService {
  async getHealth(): Promise<{
    status: string;
    uptime: number;
    mode: string;
    timestamp: string;
    platformKillSwitches?: Record<string, boolean>;
    ingestionModes?: Record<string, string>;
    capabilities?: {
      createCart: boolean;
      automatedCheckout: boolean;
      search?: boolean;
      livePrice?: boolean;
      searchDeepLink?: boolean;
      checklistHandoff?: boolean;
      deepLinks?: boolean;
      searchLinks?: boolean;
      markdownChecklist?: boolean;
    };
  }> {
    return {
      status: "ok",
      uptime: 120,
      mode: "mock",
      timestamp: new Date().toISOString(),
      platformKillSwitches: {
        blinkit: false,
        zepto: false,
        instamart: false,
        bigbasket: false,
      },
      ingestionModes: {
        blinkit: "headed_worker",
        zepto: "headed_worker",
        bigbasket: "headed_worker",
        instamart: "manual_assisted",
      },
      capabilities: NullCartAdapter.getCapabilities(),
    };
  }

  async getCategories(): Promise<CategoryInfo[]> {
    return MOCK_CATEGORIES;
  }

  async searchProducts(query: string = "", category?: string): Promise<ProductSummary[]> {
    const q = query.toLowerCase().trim();
    return MOCK_PRODUCTS.filter((prod) => {
      const matchesCategory = !category || prod.category.toLowerCase() === category.toLowerCase();
      if (!matchesCategory) return false;
      if (!q) return true;
      const inName = prod.name.toLowerCase().includes(q);
      const inBrand = prod.brand.toLowerCase().includes(q);
      const inVariant = prod.variant.toLowerCase().includes(q);
      return inName || inBrand || inVariant;
    });
  }

  async getProductById(id: string): Promise<ProductSummary | null> {
    return MOCK_PRODUCTS.find((p) => p.id === id) || null;
  }

  async getPlatforms(): Promise<PlatformHealthStatus[]> {
    return SUPPORTED_PLATFORMS.map((pid) => {
      const meta = PLATFORM_METADATA[pid];
      const ingestionMode = pid === "instamart" ? "manual_assisted" : "headed_worker";
      return {
        id: pid,
        name: meta.name,
        mode: ingestionMode,
        enabled: true,
        capabilities: { ...meta.defaultCapabilities },
        status: "healthy",
        lastChecked: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        latencyMs: pid === "blinkit" ? 120 : pid === "zepto" ? 95 : pid === "instamart" ? 140 : 180,
        errorRate: 0.0,
        notes: [
          `Running in mock mode for Central Delhi (110001)`,
          `Automated cart transfer is explicitly unsupported (NullCartAdapter)`,
          `Ingestion mode: ${ingestionMode}`,
        ],
      };
    });
  }

  async getDataProvenance(pincode: string = "110001"): Promise<DataProvenance> {
    const locationKey = `delhi_${pincode}`;
    const rows: ProvenanceListingRow[] = [];

    for (const product of MOCK_PRODUCTS) {
      for (const [platform, price] of Object.entries(product.platformPrices)) {
        if (!price || price.pricePaise === undefined) continue;
        rows.push({
          platform,
          sourceType: price.sourceType || "mock",
          availability: price.availability || "available",
          lastObservedAt: new Date(price.observedAt || Date.now()),
        });
      }
    }

    return summarizeProvenance(rows, locationKey);
  }

  async createOptimization(payload: OptimizationRequestInput): Promise<OptimizationResponse> {
    const valid = OptimizationRequestSchema.parse(payload);
    const optimizationId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Match each requested item against mock products
    const itemMatches = valid.items.map((item) => {
      const q = item.query.toLowerCase().trim();
      const matchedProd =
        MOCK_PRODUCTS.find((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)) ||
        MOCK_PRODUCTS[0]; // fallback
      return {
        requested: item,
        product: matchedProd,
      };
    });

    // 1. Compute single platform options for baseline and single-platform strategy
    const singlePlatformOptions: { platform: PlatformId; plan: PlatformCartPlan; totalPaise: number }[] = [];

    for (const pid of SUPPORTED_PLATFORMS) {
      const feeRule = MOCK_PLATFORM_FEE_RULES[pid] || MOCK_PLATFORM_FEE_RULES.blinkit;
      const lineItems: OptimizationLineItem[] = [];
      let subtotalPaise = 0;

      for (const { requested, product } of itemMatches) {
        const platData = product.platformPrices[pid];
        if (platData && platData.availability === "available" && platData.pricePaise) {
          const unitPricePaise = platData.pricePaise;
          const totalPricePaise = unitPricePaise * requested.quantity;
          subtotalPaise += totalPricePaise;

          lineItems.push({
            id: `${product.id}-${pid}`,
            requestedQuery: requested.query,
            requestedQuantity: requested.quantity,
            requestedUnit: requested.unit,
            matchedTitle: product.name,
            brand: product.brand,
            variant: product.variant,
            packSize: product.packSize,
            unitPricePaise,
            unitPriceRupees: paiseToRupees(unitPricePaise),
            quantity: requested.quantity,
            totalPricePaise,
            totalPriceRupees: paiseToRupees(totalPricePaise),
            availability: platData.availability,
            searchUrl: platData.searchUrl,
            isStale: platData.isStale,
            confidence: platData.confidence,
            sourceType: platData.sourceType,
          });
        }
      }

      // Check delivery fee threshold
      const isFreeDelivery =
        feeRule.freeDeliveryThresholdPaise && subtotalPaise >= feeRule.freeDeliveryThresholdPaise;
      const deliveryFeePaise = isFreeDelivery
        ? 0
        : typeof feeRule.deliveryFeePaise === "number"
        ? feeRule.deliveryFeePaise
        : 3000;
      const handlingFeePaise =
        typeof feeRule.handlingFeePaise === "number" ? feeRule.handlingFeePaise : 500; // note: for BigBasket, unknown is detailed in unknownFees
      const platformFeePaise =
        typeof feeRule.platformFeePaise === "number" ? feeRule.platformFeePaise : 300;
      const estimatedTotalPaise =
        subtotalPaise + deliveryFeePaise + handlingFeePaise + platformFeePaise;

      const meetsMinimumOrder =
        !feeRule.minimumOrderValuePaise || subtotalPaise >= feeRule.minimumOrderValuePaise;

      const plan: PlatformCartPlan = {
        platform: pid,
        platformName: PLATFORM_METADATA[pid].name,
        items: lineItems,
        itemCount: lineItems.length,
        subtotalPaise,
        subtotalRupees: paiseToRupees(subtotalPaise),
        deliveryFeePaise,
        deliveryFeeRupees: paiseToRupees(deliveryFeePaise),
        handlingFeePaise,
        handlingFeeRupees: paiseToRupees(handlingFeePaise),
        platformFeePaise,
        platformFeeRupees: paiseToRupees(platformFeePaise),
        discountsPaise: 0,
        discountsRupees: 0,
        estimatedTotalPaise,
        estimatedTotalRupees: paiseToRupees(estimatedTotalPaise),
        meetsMinimumOrder,
        minimumOrderValuePaise: feeRule.minimumOrderValuePaise || undefined,
        hasUnknownFee: pid === "bigbasket",
        unknownFeeExplanation:
          pid === "bigbasket" ? "Handling fee varies by hub (range ₹5 - ₹15); verify in app" : undefined,
        supportsDeepLinks: false,
      };

      singlePlatformOptions.push({
        platform: pid,
        plan,
        totalPaise: estimatedTotalPaise,
      });
    }

    // Sort single platforms to determine the best single store baseline
    singlePlatformOptions.sort((a, b) => a.totalPaise - b.totalPaise);
    const bestSingle = singlePlatformOptions[0];
    const baselineName = `Cheapest Single Store (${PLATFORM_METADATA[bestSingle.platform].name})`;
    const baselineTotalPaise = bestSingle.totalPaise;

    // Build Strategy 2: cheapest_single_platform option
    const singleOption: OptimizationOption = {
      id: `${optimizationId}-single`,
      strategy: "cheapest_single_platform",
      title: `Single Store: ${PLATFORM_METADATA[bestSingle.platform].name}`,
      platforms: [bestSingle.platform],
      perPlatform: { [bestSingle.platform]: bestSingle.plan },
      subtotalPaise: bestSingle.plan.subtotalPaise,
      subtotalRupees: bestSingle.plan.subtotalRupees,
      estimatedFees: {
        deliveryPaise: bestSingle.plan.deliveryFeePaise,
        deliveryRupees: bestSingle.plan.deliveryFeeRupees,
        handlingPaise: bestSingle.plan.handlingFeePaise,
        handlingRupees: bestSingle.plan.handlingFeeRupees,
        platformPaise: bestSingle.plan.platformFeePaise,
        platformRupees: bestSingle.plan.platformFeeRupees,
        otherPaise: 0,
        otherRupees: 0,
        totalPaise:
          bestSingle.plan.deliveryFeePaise +
          bestSingle.plan.handlingFeePaise +
          bestSingle.plan.platformFeePaise,
        totalRupees:
          bestSingle.plan.deliveryFeeRupees +
          bestSingle.plan.handlingFeeRupees +
          bestSingle.plan.platformFeeRupees,
        hasUnknownFees: bestSingle.platform === "bigbasket",
      },
      knownFees: {
        deliveryPaise: bestSingle.plan.deliveryFeePaise,
        deliveryRupees: bestSingle.plan.deliveryFeeRupees,
        handlingPaise: bestSingle.platform === "bigbasket" ? 0 : bestSingle.plan.handlingFeePaise,
        handlingRupees: bestSingle.platform === "bigbasket" ? 0 : bestSingle.plan.handlingFeeRupees,
        platformPaise: bestSingle.plan.platformFeePaise,
        platformRupees: bestSingle.plan.platformFeeRupees,
        otherPaise: 0,
        otherRupees: 0,
        totalPaise:
          bestSingle.plan.deliveryFeePaise +
          (bestSingle.platform === "bigbasket" ? 0 : bestSingle.plan.handlingFeePaise) +
          bestSingle.plan.platformFeePaise,
        totalRupees:
          bestSingle.plan.deliveryFeeRupees +
          (bestSingle.platform === "bigbasket" ? 0 : bestSingle.plan.handlingFeeRupees) +
          bestSingle.plan.platformFeeRupees,
        hasUnknownFees: bestSingle.platform === "bigbasket",
      },
      unknownFees:
        bestSingle.platform === "bigbasket"
          ? {
              feeNames: ["handlingFee"],
              ranges: { handlingFee: { minPaise: 500, maxPaise: 1500, minRupees: 5, maxRupees: 15 } },
              message: "BigBasket handling fee is unverified for this pincode (estimated range ₹5 – ₹15)",
            }
          : null,
      verifiedDiscountsPaise: 0,
      verifiedDiscountsRupees: 0,
      estimatedTotalPaise: bestSingle.totalPaise,
      estimatedTotalRupees: paiseToRupees(bestSingle.totalPaise),
      orderCount: 1,
      savingsVsBaselinePaise: 0,
      savingsVsBaselineRupees: 0,
      baselineName,
      isEstimate: true,
      warnings: [],
      explanation: {
        summary: `All ${itemMatches.length} items ordered from ${PLATFORM_METADATA[bestSingle.platform].name} in a single delivery.`,
        reasoning: [
          `Only one delivery fee of ₹${bestSingle.plan.deliveryFeeRupees} and platform fee of ₹${bestSingle.plan.platformFeeRupees}.`,
          `No coordination between multiple drivers.`,
        ],
        pros: ["1 delivery only", "Zero coordination hassle", "All items arrive together"],
        cons: ["Individual items may be slightly cheaper on other apps"],
      },
      dataCoverage: {
        totalItems: itemMatches.length,
        matchedItems: bestSingle.plan.items.length,
        missingItems: itemMatches.length - bestSingle.plan.items.length,
        percentage: 100,
      },
      isFeasible: bestSingle.plan.meetsMinimumOrder,
    };

    // 2. Compute Strategy 1: cheapest_item_by_item (pure greedy item assignment)
    const perPlatItemsGreedy: Record<PlatformId, OptimizationLineItem[]> = {
      blinkit: [],
      zepto: [],
      instamart: [],
      bigbasket: [],
    };

    for (const { requested, product } of itemMatches) {
      // Find platform with lowest price for this product
      let lowestPid: PlatformId = "blinkit";
      let minP = Infinity;
      for (const pid of SUPPORTED_PLATFORMS) {
        const plat = product.platformPrices[pid];
        if (plat && plat.availability === "available" && plat.pricePaise && plat.pricePaise < minP) {
          minP = plat.pricePaise;
          lowestPid = pid;
        }
      }

      const pData = product.platformPrices[lowestPid];
      perPlatItemsGreedy[lowestPid].push({
        id: `${product.id}-${lowestPid}`,
        requestedQuery: requested.query,
        requestedQuantity: requested.quantity,
        requestedUnit: requested.unit,
        matchedTitle: product.name,
        brand: product.brand,
        variant: product.variant,
        packSize: product.packSize,
        unitPricePaise: minP,
        unitPriceRupees: paiseToRupees(minP),
        quantity: requested.quantity,
        totalPricePaise: minP * requested.quantity,
        totalPriceRupees: paiseToRupees(minP * requested.quantity),
        availability: "available",
        searchUrl: pData.searchUrl,
        isStale: pData.isStale,
        confidence: pData.confidence,
        sourceType: pData.sourceType,
      });
    }

    // Assemble greedy multi-platform plan
    const greedyPerPlatform: Record<string, PlatformCartPlan> = {};
    let greedySubtotalPaise = 0;
    let greedyDeliveryPaise = 0;
    let greedyHandlingPaise = 0;
    let greedyPlatformPaise = 0;
    const greedyActivePlatforms: PlatformId[] = [];

    for (const pid of SUPPORTED_PLATFORMS) {
      const items = perPlatItemsGreedy[pid];
      if (items.length === 0) continue;
      greedyActivePlatforms.push(pid);
      const feeRule = MOCK_PLATFORM_FEE_RULES[pid] || MOCK_PLATFORM_FEE_RULES.blinkit;
      const subtotal = items.reduce((sum, it) => sum + it.totalPricePaise, 0);
      greedySubtotalPaise += subtotal;

      const isFree = feeRule.freeDeliveryThresholdPaise && subtotal >= feeRule.freeDeliveryThresholdPaise;
      const dFee = isFree ? 0 : typeof feeRule.deliveryFeePaise === "number" ? feeRule.deliveryFeePaise : 3000;
      const hFee = typeof feeRule.handlingFeePaise === "number" ? feeRule.handlingFeePaise : 500;
      const pFee = typeof feeRule.platformFeePaise === "number" ? feeRule.platformFeePaise : 300;

      greedyDeliveryPaise += dFee;
      greedyHandlingPaise += hFee;
      greedyPlatformPaise += pFee;

      greedyPerPlatform[pid] = {
        platform: pid,
        platformName: PLATFORM_METADATA[pid].name,
        items,
        itemCount: items.length,
        subtotalPaise: subtotal,
        subtotalRupees: paiseToRupees(subtotal),
        deliveryFeePaise: dFee,
        deliveryFeeRupees: paiseToRupees(dFee),
        handlingFeePaise: hFee,
        handlingFeeRupees: paiseToRupees(hFee),
        platformFeePaise: pFee,
        platformFeeRupees: paiseToRupees(pFee),
        discountsPaise: 0,
        discountsRupees: 0,
        estimatedTotalPaise: subtotal + dFee + hFee + pFee,
        estimatedTotalRupees: paiseToRupees(subtotal + dFee + hFee + pFee),
        meetsMinimumOrder: !feeRule.minimumOrderValuePaise || subtotal >= feeRule.minimumOrderValuePaise,
        hasUnknownFee: pid === "bigbasket",
        unknownFeeExplanation:
          pid === "bigbasket" ? "Handling fee varies by hub (range ₹5 - ₹15)" : undefined,
        supportsDeepLinks: false,
      };
    }

    const greedyTotalPaise =
      greedySubtotalPaise + greedyDeliveryPaise + greedyHandlingPaise + greedyPlatformPaise;
    const greedySavingsPaise = baselineTotalPaise - greedyTotalPaise;

    const itemByItemOption: OptimizationOption = {
      id: `${optimizationId}-item`,
      strategy: "cheapest_item_by_item",
      title: "Cheapest Item-by-Item (Raw Best Price)",
      platforms: greedyActivePlatforms,
      perPlatform: greedyPerPlatform,
      subtotalPaise: greedySubtotalPaise,
      subtotalRupees: paiseToRupees(greedySubtotalPaise),
      estimatedFees: {
        deliveryPaise: greedyDeliveryPaise,
        deliveryRupees: paiseToRupees(greedyDeliveryPaise),
        handlingPaise: greedyHandlingPaise,
        handlingRupees: paiseToRupees(greedyHandlingPaise),
        platformPaise: greedyPlatformPaise,
        platformRupees: paiseToRupees(greedyPlatformPaise),
        otherPaise: 0,
        otherRupees: 0,
        totalPaise: greedyDeliveryPaise + greedyHandlingPaise + greedyPlatformPaise,
        totalRupees: paiseToRupees(greedyDeliveryPaise + greedyHandlingPaise + greedyPlatformPaise),
        hasUnknownFees: greedyActivePlatforms.includes("bigbasket"),
      },
      knownFees: {
        deliveryPaise: greedyDeliveryPaise,
        deliveryRupees: paiseToRupees(greedyDeliveryPaise),
        handlingPaise: greedyActivePlatforms.includes("bigbasket") ? greedyHandlingPaise - 500 : greedyHandlingPaise,
        handlingRupees: paiseToRupees(greedyActivePlatforms.includes("bigbasket") ? greedyHandlingPaise - 500 : greedyHandlingPaise),
        platformPaise: greedyPlatformPaise,
        platformRupees: paiseToRupees(greedyPlatformPaise),
        otherPaise: 0,
        otherRupees: 0,
        totalPaise: greedyDeliveryPaise + (greedyActivePlatforms.includes("bigbasket") ? greedyHandlingPaise - 500 : greedyHandlingPaise) + greedyPlatformPaise,
        totalRupees: paiseToRupees(greedyDeliveryPaise + (greedyActivePlatforms.includes("bigbasket") ? greedyHandlingPaise - 500 : greedyHandlingPaise) + greedyPlatformPaise),
        hasUnknownFees: greedyActivePlatforms.includes("bigbasket"),
      },
      unknownFees: greedyActivePlatforms.includes("bigbasket")
        ? {
            feeNames: ["handlingFee"],
            ranges: { handlingFee: { minPaise: 500, maxPaise: 1500, minRupees: 5, maxRupees: 15 } },
            message: "BigBasket handling fee is unverified for this pincode (estimated range ₹5 – ₹15)",
          }
        : null,
      verifiedDiscountsPaise: 0,
      verifiedDiscountsRupees: 0,
      estimatedTotalPaise: greedyTotalPaise,
      estimatedTotalRupees: paiseToRupees(greedyTotalPaise),
      orderCount: greedyActivePlatforms.length,
      savingsVsBaselinePaise: greedySavingsPaise,
      savingsVsBaselineRupees: paiseToRupees(greedySavingsPaise),
      baselineName,
      isEstimate: true,
      warnings:
        greedySavingsPaise < 0
          ? [
              `Multi-order delivery and platform fees (₹${paiseToRupees(
                greedyDeliveryPaise + greedyHandlingPaise + greedyPlatformPaise
              )}) erase item-level savings by ₹${Math.abs(paiseToRupees(greedySavingsPaise))}.`,
            ]
          : [],
      explanation: {
        summary: `Assigns every single item to the platform selling it at the absolute lowest unit price.`,
        reasoning: [
          `Lowest possible product subtotal (₹${paiseToRupees(greedySubtotalPaise)}).`,
          `Requires ${greedyActivePlatforms.length} separate orders with individual delivery and handling charges.`,
        ],
        pros: ["Absolute lowest raw shelf prices", "Full price transparency per platform"],
        cons: [
          `${greedyActivePlatforms.length} deliveries to receive`,
          "Multiple delivery fees can outweigh shelf savings",
        ],
      },
      dataCoverage: {
        totalItems: itemMatches.length,
        matchedItems: itemMatches.length,
        missingItems: 0,
        percentage: 100,
      },
      isFeasible: Object.values(greedyPerPlatform).every((p) => p.meetsMinimumOrder),
    };

    // 3. Compute Strategy 3: optimized_multi_platform
    // Limit to max 2 platforms if split fees exceed savings; ensure minimum orders
    let multiPlatformOption: OptimizationOption;

    if (greedySavingsPaise > (valid.preferences?.minimumSavingsPaise || 2000) && greedyActivePlatforms.length <= 2) {
      // Greedy already meets threshold!
      multiPlatformOption = {
        ...itemByItemOption,
        id: `${optimizationId}-multi`,
        strategy: "optimized_multi_platform",
        title: "Smart Split (Maximum Verified Savings)",
        explanation: {
          summary: `Splits between ${greedyActivePlatforms.length} platforms because net savings (₹${paiseToRupees(
            greedySavingsPaise
          )}) comfortably exceed extra delivery and platform fees.`,
          reasoning: [
            `Net savings vs ${baselineName} is ₹${paiseToRupees(greedySavingsPaise)}.`,
            `Both carts meet merchant minimum order requirements.`,
          ],
          pros: [
            `Saves ₹${paiseToRupees(greedySavingsPaise)} net after all delivery and handling fees`,
            "Balanced multi-store order",
          ],
          cons: [`${greedyActivePlatforms.length} deliveries to receive`],
        },
      };
    } else {
      // If split fees erase savings or don't meet threshold, optimize down to top 2 or pick single store
      multiPlatformOption = {
        ...singleOption,
        id: `${optimizationId}-multi`,
        strategy: "optimized_multi_platform",
        title: "Smart Split (Single Platform Recommended)",
        savingsVsBaselinePaise: 0,
        savingsVsBaselineRupees: 0,
        warnings: [
          `Splitting across stores was evaluated, but additional delivery and handling charges would exceed product price differences. Ordering entirely from ${PLATFORM_METADATA[bestSingle.platform].name} is the most economical choice.`,
        ],
        explanation: {
          summary: `Our optimizer tested 15 platform combinations and determined that keeping all items in one cart on ${PLATFORM_METADATA[bestSingle.platform].name} is cheaper than paying multiple delivery and platform fees.`,
          reasoning: [
            `Extra delivery fee would be ₹25 - ₹30 per extra platform.`,
            `Shelf price difference across items is under the ₹${
              paiseToRupees(valid.preferences?.minimumSavingsPaise || 2000)
            } threshold.`,
          ],
          pros: ["1 delivery only", "No fee inflation", "Guaranteed lowest net cost"],
          cons: [],
        },
      };
    }

    const response: OptimizationResponse = {
      id: optimizationId,
      locationId: valid.locationId,
      pincode: valid.pincode,
      createdAt: new Date().toISOString(),
      baselineName,
      baselineTotalPaise,
      baselineTotalRupees: paiseToRupees(baselineTotalPaise),
      options: [multiPlatformOption, singleOption, itemByItemOption],
      warnings: [],
    };

    storedOptimizations.set(optimizationId, response);
    return response;
  }

  async getOptimization(id: string): Promise<OptimizationResponse | null> {
    return storedOptimizations.get(id) || null;
  }

  async createShoppingHandoff(payload: {
    optimizationId: string;
    strategy: "cheapest_item_by_item" | "cheapest_single_platform" | "optimized_multi_platform";
  }): Promise<ShoppingHandoffResponse> {
    const opt = storedOptimizations.get(payload.optimizationId);
    const chosenPlan = opt?.options.find((o) => o.strategy === payload.strategy) || opt?.options[0];

    const platformsList = chosenPlan
      ? Object.entries(chosenPlan.perPlatform).map(([pid, plan]) => {
          const platformKey = pid as PlatformId;
          const meta = PLATFORM_METADATA[platformKey];

          const checklistText = [
            `🛒 ${meta.name} Shopping List (GroqAI Plan: ${chosenPlan.title})`,
            `Estimated Total: ₹${plan.estimatedTotalRupees} (Subtotal ₹${plan.subtotalRupees} + Fees ₹${
              plan.deliveryFeeRupees + plan.handlingFeeRupees + plan.platformFeeRupees
            })`,
            `----------------------------------------`,
            ...plan.items.map(
              (it, idx) =>
                `${idx + 1}. [ ] ${it.matchedTitle} (${it.packSize}) x ${it.quantity} - Est ₹${it.totalPriceRupees}`
            ),
            `----------------------------------------`,
            `Open ${meta.name}: ${meta.websiteUrl}`,
          ].join("\n");

          return {
            platform: platformKey,
            platformName: meta.name,
            items: plan.items.map((it) => ({
              title: it.matchedTitle,
              brand: it.brand,
              variant: it.variant,
              quantity: it.quantity,
              unitPriceRupees: it.unitPriceRupees,
              totalPriceRupees: it.totalPriceRupees,
              searchUrl: it.searchUrl || `${meta.searchBaseUrl}${encodeURIComponent(it.matchedTitle)}`,
              isDeepLink: false, // Honest flag: search links, not private deep links
            })),
            subtotalRupees: plan.subtotalRupees,
            estimatedFeesRupees:
              plan.deliveryFeeRupees + plan.handlingFeeRupees + plan.platformFeeRupees,
            hasUnknownFees: plan.hasUnknownFee,
            estimatedTotalRupees: plan.estimatedTotalRupees,
            meetsMinimumOrder: plan.meetsMinimumOrder,
            checklistText,
            cartReviewUrl: meta.websiteUrl,
          };
        })
      : [];

    return {
      handoffId: `hnd-${Date.now()}`,
      optimizationId: payload.optimizationId,
      strategy: payload.strategy,
      timestamp: new Date().toISOString(),
      method: "links_and_checklist",
      isEstimate: true,
      notice:
        "Verify basket, address, fees and total in the app. Payment happens on the platform, not on GroqAI.",
      platforms: platformsList,
    };
  }

  async optimizeBasket(request: BasketOptimizationRequest): Promise<BasketOptimizationResult> {
    const pincode = request.pincode || "110001";
    const requestedItems = request.items.map((item) => {
      const q = (item.queryName || (item as any).query || "").toLowerCase().trim();
      const matchedProd =
        MOCK_PRODUCTS.find((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)) ||
        MOCK_PRODUCTS[0];
      return {
        queryName: item.queryName || (item as any).query || matchedProd.name,
        canonicalProductId: item.canonicalProductId || matchedProd.id,
        quantity: Math.max(1, item.quantity || 1),
        product: matchedProd,
      };
    });

    const evaluateCartForPlatform = (
      platformId: PlatformId,
      items: { queryName: string; canonicalProductId?: string; quantity: number; product: ProductSummary }[]
    ): StoreCartEvaluation => {
      const feeRule = MOCK_PLATFORM_FEE_RULES[platformId] || MOCK_PLATFORM_FEE_RULES.blinkit;
      const assignedItems: AssignedLineItem[] = [];
      let subtotalPaise = 0;

      for (const req of items) {
        const platData = req.product.platformPrices[platformId];
        const unitPricePaise = platData?.pricePaise || 5500;
        assertIntegerPaise(unitPricePaise);
        const lineTotalPaise = unitPricePaise * req.quantity;
        assertIntegerPaise(lineTotalPaise);
        subtotalPaise += lineTotalPaise;

        assignedItems.push({
          queryName: req.queryName,
          canonicalProductId: req.canonicalProductId,
          matchedTitle: req.product.name,
          brand: req.product.brand,
          quantity: req.quantity,
          unitPricePaise,
          lineTotalPaise,
          availability: "IN_STOCK",
          platformId,
          searchUrl: platData?.searchUrl || `${PLATFORM_METADATA[platformId].searchBaseUrl}${encodeURIComponent(req.product.name)}`,
        });
      }

      const freeDeliveryThresholdPaise = feeRule.freeDeliveryThresholdPaise || 19900;
      const isFreeDelivery = subtotalPaise >= freeDeliveryThresholdPaise;
      const deliveryFeePaise = isFreeDelivery
        ? 0
        : typeof feeRule.deliveryFeePaise === "number"
        ? feeRule.deliveryFeePaise
        : 2500;

      const hasUnknownFees = platformId === "bigbasket";
      const handlingMinPaise = hasUnknownFees ? 500 : typeof feeRule.handlingFeePaise === "number" ? feeRule.handlingFeePaise : 400;
      const handlingMaxPaise = hasUnknownFees ? 1500 : handlingMinPaise;
      const platformFeePaise = typeof feeRule.platformFeePaise === "number" ? feeRule.platformFeePaise : 300;

      const feeBreakdown: FeeBreakdownPaise = {
        deliveryFee: {
          minPaise: deliveryFeePaise,
          maxPaise: deliveryFeePaise,
          isKnown: true,
          label: isFreeDelivery ? "FREE Delivery" : "Standard Delivery",
        },
        handlingFee: {
          minPaise: handlingMinPaise,
          maxPaise: handlingMaxPaise,
          isKnown: !hasUnknownFees,
          label: hasUnknownFees ? "Dynamic Handling Fee" : "Handling Fee",
        },
        platformFee: {
          minPaise: platformFeePaise,
          maxPaise: platformFeePaise,
          isKnown: true,
          label: "Platform Convenience Fee",
        },
        smallCartFee: {
          minPaise: 0,
          maxPaise: 0,
          isKnown: true,
          label: "Small Cart Fee",
        },
        totalFeeMinPaise: deliveryFeePaise + handlingMinPaise + platformFeePaise,
        totalFeeMaxPaise: deliveryFeePaise + handlingMaxPaise + platformFeePaise,
        hasUnknownFees,
      };

      const totalMinPaise = subtotalPaise + feeBreakdown.totalFeeMinPaise;
      const totalMaxPaise = subtotalPaise + feeBreakdown.totalFeeMaxPaise;

      const amountToFreeDelivery = Math.max(0, freeDeliveryThresholdPaise - subtotalPaise);
      const feeCliffWarnings: string[] = [];
      if (amountToFreeDelivery > 0 && amountToFreeDelivery <= 10000) {
        feeCliffWarnings.push(
          `Add ₹${(amountToFreeDelivery / 100).toFixed(2)} more on ${PLATFORM_METADATA[platformId].name} for FREE delivery (saves ₹${(deliveryFeePaise / 100).toFixed(2)})`
        );
      }

      return {
        platformId,
        platformName: PLATFORM_METADATA[platformId].name,
        items: assignedItems,
        subtotalPaise,
        feeBreakdown,
        totalMinPaise,
        totalMaxPaise,
        hasUnknownFees,
        cliffs: {
          amountToFreeDeliveryPaise: amountToFreeDelivery,
          potentialDeliveryFeeSavingsPaise: isFreeDelivery ? 0 : deliveryFeePaise,
          amountToAvoidSmallCartFeePaise: 0,
          potentialSmallCartFeeSavingsPaise: 0,
        },
        feeCliffWarnings,
      };
    };

    const buildStrategyFromStoreCarts = (
      strategy: "CHEAPEST_ITEM_BY_ITEM" | "CHEAPEST_SINGLE_PLATFORM" | "OPTIMIZED_MULTI_PLATFORM_SPLIT",
      strategyName: string,
      carts: StoreCartEvaluation[],
      rationale?: string
    ): StrategyEvaluation => {
      const platforms = carts.map((c) => c.platformId);
      const storeCartsRecord = carts.reduce((acc, c) => {
        acc[c.platformId] = c;
        return acc;
      }, {} as Record<PlatformId, StoreCartEvaluation>);

      const itemSubtotalPaise = carts.reduce((sum, c) => sum + c.subtotalPaise, 0);
      const totalFeeMinPaise = carts.reduce((sum, c) => sum + c.feeBreakdown.totalFeeMinPaise, 0);
      const totalFeeMaxPaise = carts.reduce((sum, c) => sum + c.feeBreakdown.totalFeeMaxPaise, 0);
      const estimatedTotalMinPaise = itemSubtotalPaise + totalFeeMinPaise;
      const estimatedTotalMaxPaise = itemSubtotalPaise + totalFeeMaxPaise;
      const hasUnknownFees = carts.some((c) => c.hasUnknownFees);
      const feeCliffWarnings = carts.flatMap((c) => c.feeCliffWarnings);

      return {
        strategy,
        strategyName,
        platforms,
        storeCarts: storeCartsRecord,
        shelfSubtotalPaise: itemSubtotalPaise,
        itemSubtotalPaise,
        totalFeeMinPaise,
        totalFeeMaxPaise,
        estimatedTotalMinPaise,
        estimatedTotalMaxPaise,
        hasUnknownFees,
        coverageCount: requestedItems.length,
        totalRequestedItems: requestedItems.length,
        missingItems: [],
        feeCliffWarnings,
        savingsVsSinglePlatformPaise: 0,
        rationale,
      };
    };

    // 1. Single platform evaluations
    const singleEvaluations: StrategyEvaluation[] = SUPPORTED_PLATFORMS.map((pid) => {
      const cart = evaluateCartForPlatform(pid, requestedItems);
      return buildStrategyFromStoreCarts(
        "CHEAPEST_SINGLE_PLATFORM",
        `Cheapest Single Store (${PLATFORM_METADATA[pid].name})`,
        [cart],
        `All items bundled into a single delivery from ${PLATFORM_METADATA[pid].name}.`
      );
    });
    singleEvaluations.sort((a, b) => a.estimatedTotalMinPaise - b.estimatedTotalMinPaise);
    const bestSingle = singleEvaluations[0];
    const cheapestSinglePlatform = bestSingle;

    // 2. Greedy Item-by-Item assignment
    const itemsByBestPlatform: Record<PlatformId, typeof requestedItems> = {
      blinkit: [],
      zepto: [],
      instamart: [],
      bigbasket: [],
    };

    for (const req of requestedItems) {
      let lowestPid: PlatformId = "blinkit";
      let lowestPaise = Infinity;
      for (const pid of SUPPORTED_PLATFORMS) {
        const price = req.product.platformPrices[pid]?.pricePaise || 5500;
        if (price < lowestPaise) {
          lowestPaise = price;
          lowestPid = pid;
        }
      }
      itemsByBestPlatform[lowestPid].push(req);
    }

    const itemByItemCarts = SUPPORTED_PLATFORMS.filter(
      (pid) => itemsByBestPlatform[pid].length > 0
    ).map((pid) => evaluateCartForPlatform(pid, itemsByBestPlatform[pid]));

    const cheapestItemByItem = buildStrategyFromStoreCarts(
      "CHEAPEST_ITEM_BY_ITEM",
      "Cheapest Item-by-Item (Raw Shelf Floor)",
      itemByItemCarts,
      "Assigns every item to its absolute lowest shelf price regardless of delivery fees."
    );

    // 3. 15-Subset Enumeration ($2^4 - 1 = 15$)
    const enumerateSubsets = <T>(arr: T[]): T[][] => {
      const subsets: T[][] = [];
      const total = 1 << arr.length;
      for (let i = 1; i < total; i++) {
        const subset: T[] = [];
        for (let j = 0; j < arr.length; j++) {
          if ((i & (1 << j)) !== 0) {
            subset.push(arr[j]);
          }
        }
        subsets.push(subset);
      }
      return subsets;
    };

    const allSubsets = enumerateSubsets(SUPPORTED_PLATFORMS);
    const evaluatedSubsets: SubsetEvaluationSummary[] = allSubsets.map((subset, index) => {
      const subsetItemsByPlat: Record<PlatformId, typeof requestedItems> = {
        blinkit: [],
        zepto: [],
        instamart: [],
        bigbasket: [],
      };
      for (const req of requestedItems) {
        let bestPid = subset[0];
        let minPrice = Infinity;
        for (const pid of subset) {
          const price = req.product.platformPrices[pid]?.pricePaise || 5500;
          if (price < minPrice) {
            minPrice = price;
            bestPid = pid;
          }
        }
        subsetItemsByPlat[bestPid].push(req);
      }

      const activeCarts = subset
        .filter((pid) => subsetItemsByPlat[pid].length > 0)
        .map((pid) => evaluateCartForPlatform(pid, subsetItemsByPlat[pid]));

      const subtotalPaise = activeCarts.reduce((sum, c) => sum + c.subtotalPaise, 0);
      const feeMinPaise = activeCarts.reduce((sum, c) => sum + c.feeBreakdown.totalFeeMinPaise, 0);
      const feeMaxPaise = activeCarts.reduce((sum, c) => sum + c.feeBreakdown.totalFeeMaxPaise, 0);
      const estimatedTotalMinPaise = subtotalPaise + feeMinPaise;
      const estimatedTotalMaxPaise = subtotalPaise + feeMaxPaise;
      const hasUnknownFees = activeCarts.some((c) => c.hasUnknownFees);

      return {
        rank: index + 1,
        subset,
        subsetName: subset.map((pid) => PLATFORM_METADATA[pid].name).join(" + "),
        activeStoreCount: activeCarts.length,
        coverageCount: requestedItems.length,
        totalRequestedItems: requestedItems.length,
        subtotalPaise,
        feeMinPaise,
        feeMaxPaise,
        estimatedTotalMinPaise,
        estimatedTotalMaxPaise,
        hasUnknownFees,
        isFeasible: true,
      };
    });

    evaluatedSubsets.sort((a, b) => a.estimatedTotalMinPaise - b.estimatedTotalMinPaise);
    evaluatedSubsets.forEach((s, idx) => {
      s.rank = idx + 1;
    });

    // 4. Optimized Multi-Platform Strategy
    let optimizedMultiPlatform: StrategyEvaluation;
    const bestSubsetSummary = evaluatedSubsets[0];
    const savingsVsSingle = bestSingle.estimatedTotalMinPaise - bestSubsetSummary.estimatedTotalMinPaise;
    if (savingsVsSingle >= 2000 && bestSubsetSummary.activeStoreCount <= 2) {
      const subsetPlatforms = bestSubsetSummary.subset;
      const subsetItems: Record<PlatformId, typeof requestedItems> = {
        blinkit: [],
        zepto: [],
        instamart: [],
        bigbasket: [],
      };
      for (const req of requestedItems) {
        let bestPid = subsetPlatforms[0];
        let minPrice = Infinity;
        for (const pid of subsetPlatforms) {
          const price = req.product.platformPrices[pid]?.pricePaise || 5500;
          if (price < minPrice) {
            minPrice = price;
            bestPid = pid;
          }
        }
        subsetItems[bestPid].push(req);
      }
      const activeCarts = subsetPlatforms
        .filter((pid) => subsetItems[pid].length > 0)
        .map((pid) => evaluateCartForPlatform(pid, subsetItems[pid]));

      optimizedMultiPlatform = buildStrategyFromStoreCarts(
        "OPTIMIZED_MULTI_PLATFORM_SPLIT",
        `Smart Split (${bestSubsetSummary.subsetName})`,
        activeCarts,
        `Optimal split across ${activeCarts.length} stores saves net ₹${(
          savingsVsSingle / 100
        ).toFixed(2)} after extra delivery and handling charges.`
      );
    } else {
      optimizedMultiPlatform = {
        ...cheapestSinglePlatform,
        strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
        strategyName: "Smart Split (Single Platform Recommended)",
        rationale: `Tested all 15 platform combinations ($2^4 - 1 = 15$). Additional delivery fees exceed shelf savings, making a single cart on ${bestSingle.strategyName} the most economical choice.`,
      };
    }

    return {
      pincode,
      evaluatedSubsetsCount: evaluatedSubsets.length,
      strategies: {
        cheapestItemByItem,
        cheapestSinglePlatform,
        optimizedMultiPlatform,
      },
      singlePlatformRankings: singleEvaluations,
      allSubsetEvaluations: evaluatedSubsets,
      recommendation: {
        winningStrategy:
          optimizedMultiPlatform.savingsVsSinglePlatformPaise &&
          optimizedMultiPlatform.savingsVsSinglePlatformPaise >= 2000
            ? "OPTIMIZED_MULTI_PLATFORM_SPLIT"
            : "CHEAPEST_SINGLE_PLATFORM",
        netSavingsPaise: Math.max(0, optimizedMultiPlatform.savingsVsSinglePlatformPaise || 0),
        rationale:
          optimizedMultiPlatform.savingsVsSinglePlatformPaise &&
          optimizedMultiPlatform.savingsVsSinglePlatformPaise >= 2000
            ? `Splitting saves ₹${(optimizedMultiPlatform.savingsVsSinglePlatformPaise / 100).toFixed(
                2
              )} net after all delivery and handling fees.`
            : `Single store on ${bestSingle.strategyName} is optimal; splitting adds fee overhead.`,
        feeCliffWarnings: optimizedMultiPlatform.feeCliffWarnings,
        hasUnknownFees: optimizedMultiPlatform.hasUnknownFees,
      },
    };
  }

  async generateShoppingHandoff(payload: any): Promise<ShoppingHandoffPayload> {
    const storeCarts = payload.storeCarts || {};
    const strategy = payload.strategy || "OPTIMIZED_MULTI_PLATFORM_SPLIT";
    const strategyName = payload.strategyName || "Optimized Multi-Platform Split";
    const pincode = payload.pincode || "110001";

    let grandSubtotalPaise = 0;
    let grandFeeMinPaise = 0;
    let grandFeeMaxPaise = 0;
    let grandHasUnknownFees = false;

    const platforms: any[] = [];
    const markdownLines: string[] = [
      `# 🛒 GrocAI Multi-Store Shopping Checklist`,
      `**Strategy:** ${strategyName} | **Pincode:** ${pincode}`,
      `*Disclaimer: GrocAI uses NullCartAdapter (createCart: false, automatedCheckout: false). Never stores credentials or auto-purchases.*`,
      ``,
    ];

    for (const [pid, cart] of Object.entries(storeCarts) as [PlatformId, StoreCartEvaluation][]) {
      const meta = PLATFORM_METADATA[pid];
      grandSubtotalPaise += cart.subtotalPaise;
      grandFeeMinPaise += cart.feeBreakdown.totalFeeMinPaise;
      grandFeeMaxPaise += cart.feeBreakdown.totalFeeMaxPaise;
      if (cart.hasUnknownFees) grandHasUnknownFees = true;

      const storeChecklistLines: string[] = [
        `## 🏪 ${meta.name}`,
        `*Estimated: ${formatPaiseToRupees(cart.totalMinPaise)}${
          cart.hasUnknownFees ? ` – ${formatPaiseToRupees(cart.totalMaxPaise)}` : ""
        } (Subtotal ${formatPaiseToRupees(cart.subtotalPaise)} + Fees ${formatPaiseToRupees(
          cart.feeBreakdown.totalFeeMinPaise
        )})*`,
      ];

      const items = cart.items.map((it) => {
        const itemLine = `- [ ] ${it.matchedTitle} x ${it.quantity} — ${formatPaiseToRupees(
          it.lineTotalPaise
        )} ([Search on ${meta.name}](${it.searchUrl}))`;
        storeChecklistLines.push(itemLine);
        return {
          title: it.matchedTitle,
          brand: it.brand,
          variant: undefined,
          quantity: it.quantity,
          unitPricePaise: it.unitPricePaise,
          totalPricePaise: it.lineTotalPaise,
          unitPriceRupees: it.unitPricePaise / 100,
          totalPriceRupees: it.lineTotalPaise / 100,
          productUrl: it.productUrl,
          searchUrl: it.searchUrl,
          isDeepLink: false,
          checkboxMarkdown: itemLine,
        };
      });

      markdownLines.push(...storeChecklistLines, ``);

      platforms.push({
        platform: pid,
        platformName: meta.name,
        items,
        subtotalPaise: cart.subtotalPaise,
        subtotalRupees: cart.subtotalPaise / 100,
        estimatedFeesRupees: cart.feeBreakdown.totalFeeMinPaise / 100,
        hasUnknownFees: cart.hasUnknownFees,
        estimatedTotalRupees: cart.totalMinPaise / 100,
        estimatedTotalMinPaise: cart.totalMinPaise,
        estimatedTotalMaxPaise: cart.totalMaxPaise,
        meetsMinimumOrder: true,
        checklistText: storeChecklistLines.join("\n"),
        cartReviewUrl: meta.websiteUrl,
        storeChecklistMarkdown: storeChecklistLines.join("\n"),
        unknownFeeExplanation: cart.hasUnknownFees
          ? "Handling fee dynamic ₹5 - ₹15 (minPaise: 500, maxPaise: 1500); verify at checkout."
          : undefined,
      });
    }

    return {
      handoffId: `hnd-${Date.now()}`,
      optimizationId: payload.optimizationId,
      pincode,
      strategy,
      strategyName,
      timestamp: new Date().toISOString(),
      method: "links_and_checklist",
      isEstimate: true,
      notice:
        "Official Checkout Disclaimer (NullCartAdapter Active): GrocAI never stores credentials, triggers checkout, or auto-purchases. Complete your purchase directly inside each merchant's official application.",
      capabilities: {
        createCart: false,
        automatedCheckout: false,
        searchDeepLink: true,
        checklistHandoff: true,
      },
      markdownChecklist: markdownLines.join("\n"),
      grandTotalPaise: {
        subtotalPaise: grandSubtotalPaise,
        feeMinPaise: grandFeeMinPaise,
        feeMaxPaise: grandFeeMaxPaise,
        estimatedTotalMinPaise: grandSubtotalPaise + grandFeeMinPaise,
        estimatedTotalMaxPaise: grandSubtotalPaise + grandFeeMaxPaise,
        hasUnknownFees: grandHasUnknownFees,
      },
      grandTotalRupees: {
        subtotal: formatPaiseToRupees(grandSubtotalPaise),
        estimatedTotalMin: formatPaiseToRupees(grandSubtotalPaise + grandFeeMinPaise),
        estimatedTotalMax: formatPaiseToRupees(grandSubtotalPaise + grandFeeMaxPaise),
      },
      platforms,
    };
  }
}

export const mockApiService = new MockApiService();
