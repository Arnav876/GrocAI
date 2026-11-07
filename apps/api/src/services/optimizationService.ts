import { PrismaClient } from "@prisma/client";
import {
  PlatformId,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  FeeBreakdownPaise,
  PINCODE_REGEX,
  assertIntegerPaise,
  addPaise,
  subtractPaise,
  multiplyPaiseByQty,
  formatPaiseToRupees,
} from "@groqai/shared";
import {
  FeeIntelligenceService,
  BasketFeeEvaluationResult,
} from "./feeIntelligence.js";
import { SEED_CANONICAL_PRODUCTS } from "../fixtures/seedFixtures.js";
import { buildPlatformSearchDeepLink } from "./shoppingHandoffService.js";

export interface BasketItemRequest {
  canonicalProductId?: string;
  queryName: string;
  quantity: number;
  allowSubstitutions?: boolean;
  preferredBrand?: string;
}

export interface PlatformObservationInput {
  id?: string;
  canonicalProductId?: string | null;
  name?: string;
  rawTitle?: string;
  title?: string;
  brand?: string | null;
  platformId?: PlatformId | string;
  platform?: PlatformId | string;
  pricePaise: number;
  originalPricePaise?: number;
  availabilityStatus?: string; // IN_STOCK | LOW_STOCK | OUT_OF_STOCK | UNAVAILABLE
  availability?: string; // available | unavailable | unknown
  productUrl?: string;
  searchUrl?: string;
  pincode?: string;
  quantity?: string | number;
  unit?: string;
  isStale?: boolean;
  confidence?: number;
}

export interface BasketOptimizationRequest {
  items: BasketItemRequest[];
  pincode: string;
  enabledPlatforms?: PlatformId[];
  observationsOverride?: PlatformObservationInput[];
}

export interface AssignedLineItem {
  queryName: string;
  canonicalProductId?: string;
  matchedTitle: string;
  brand?: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  availability: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNAVAILABLE";
  platformId: PlatformId;
  productUrl?: string;
  searchUrl: string;
}

export interface StoreCartEvaluation {
  platformId: PlatformId;
  platformName: string;
  items: AssignedLineItem[];
  subtotalPaise: number;
  feeBreakdown: FeeBreakdownPaise;
  totalMinPaise: number;
  totalMaxPaise: number;
  hasUnknownFees: boolean;
  cliffs: {
    amountToFreeDeliveryPaise: number;
    potentialDeliveryFeeSavingsPaise: number;
    amountToAvoidSmallCartFeePaise: number;
    potentialSmallCartFeeSavingsPaise: number;
  };
  feeCliffWarnings: string[];
}

export interface StrategyEvaluation {
  strategy: "CHEAPEST_ITEM_BY_ITEM" | "CHEAPEST_SINGLE_PLATFORM" | "OPTIMIZED_MULTI_PLATFORM_SPLIT";
  strategyName: string;
  platforms: PlatformId[];
  storeCarts: Record<PlatformId, StoreCartEvaluation>;
  shelfSubtotalPaise?: number; // Theoretical shelf floor (Strategy 1)
  itemSubtotalPaise: number;
  totalFeeMinPaise: number;
  totalFeeMaxPaise: number;
  estimatedTotalMinPaise: number;
  estimatedTotalMaxPaise: number;
  hasUnknownFees: boolean;
  coverageCount: number;
  totalRequestedItems: number;
  missingItems: { queryName: string; canonicalProductId?: string }[];
  feeCliffWarnings: string[];
  savingsVsSinglePlatformPaise?: number;
  savingsVsNaiveItemSplitPaise?: number;
  rationale?: string;
}

export interface SubsetEvaluationSummary {
  rank: number;
  subset: PlatformId[];
  subsetName: string;
  activeStoreCount: number;
  coverageCount: number;
  totalRequestedItems: number;
  subtotalPaise: number;
  feeMinPaise: number;
  feeMaxPaise: number;
  estimatedTotalMinPaise: number;
  estimatedTotalMaxPaise: number;
  hasUnknownFees: boolean;
  isFeasible: boolean;
}

export interface OptimizationRecommendation {
  winningStrategy: "CHEAPEST_SINGLE_PLATFORM" | "OPTIMIZED_MULTI_PLATFORM_SPLIT";
  netSavingsPaise: number;
  rationale: string;
  feeCliffWarnings: string[];
  hasUnknownFees: boolean;
}

export interface BasketOptimizationResult {
  pincode: string;
  evaluatedSubsetsCount: number;
  strategies: {
    cheapestItemByItem: StrategyEvaluation;
    cheapestSinglePlatform: StrategyEvaluation;
    optimizedMultiPlatform: StrategyEvaluation;
  };
  singlePlatformRankings: StrategyEvaluation[];
  allSubsetEvaluations: SubsetEvaluationSummary[];
  recommendation: OptimizationRecommendation;
}

/**
 * Enumerates all 2^N - 1 non-empty subsets of elements.
 * For 4 platforms, returns exactly 15 combinations.
 */
export function enumerateNonEmptySubsets<T>(elements: T[]): T[][] {
  const result: T[][] = [];
  const total = 1 << elements.length;
  for (let i = 1; i < total; i++) {
    const subset: T[] = [];
    for (let j = 0; j < elements.length; j++) {
      if ((i & (1 << j)) !== 0) {
        subset.push(elements[j]);
      }
    }
    result.push(subset);
  }
  return result;
}

interface ItemPlatformMatch {
  platformId: PlatformId;
  pricePaise: number;
  title: string;
  brand?: string;
  productUrl?: string;
  searchUrl: string;
  availability: "IN_STOCK" | "LOW_STOCK";
}

interface ResolvedItem {
  requested: BasketItemRequest;
  availableOn: Map<PlatformId, ItemPlatformMatch>;
}

export class OptimizationService {
  constructor(
    private prisma?: PrismaClient,
    private feeIntelligence: FeeIntelligenceService = new FeeIntelligenceService(prisma)
  ) {}

  /**
   * Deterministically evaluates basket optimization across all 3 strategies.
   * 100% integer paise arithmetic, zero AI, unknown fee ranges preserved.
   */
  async optimizeBasket(request: BasketOptimizationRequest): Promise<BasketOptimizationResult> {
    const { items, pincode, enabledPlatforms = SUPPORTED_PLATFORMS, observationsOverride } = request;

    // Invariant 1: Validate Pincode
    if (!PINCODE_REGEX.test(pincode)) {
      throw new Error(`Invalid pincode: ${pincode}. Must be a valid 6-digit Indian postal code.`);
    }

    // Invariant 2: Validate item quantities & integer paise invariants
    for (const it of items) {
      if (typeof it.quantity !== "number" || !Number.isFinite(it.quantity) || it.quantity <= 0) {
        throw new Error(
          `Financial invariant violation: item quantity must be a positive number, received: ${it.quantity}`
        );
      }
    }

    const activePlatforms: PlatformId[] = enabledPlatforms.filter((p) =>
      SUPPORTED_PLATFORMS.includes(p)
    );
    if (activePlatforms.length === 0) {
      throw new Error("At least one valid supported platform must be enabled.");
    }

    // Resolve observations per requested item
    const resolvedItems = await this.resolveItems(items, pincode, activePlatforms, observationsOverride);

    // 1. STRATEGY 1: Cheapest Item-by-Item (Theoretical Shelf Floor)
    const cheapestItemByItem = await this.evaluateCheapestItemByItem(
      resolvedItems,
      activePlatforms,
      pincode
    );

    // 2. STRATEGY 2: Cheapest Single Platform (Named Single-Store Baseline)
    const { winningBaseline: cheapestSinglePlatform, rankings: singlePlatformRankings } =
      await this.evaluateSinglePlatforms(resolvedItems, activePlatforms, pincode);

    // 3. STRATEGY 3: Optimized Multi-Platform Split (Combinatorial 2^N - 1 Solver)
    const { winningSplit: optimizedMultiPlatform, allSubsetSummaries } =
      await this.evaluateMultiPlatformSubsets(
        resolvedItems,
        activePlatforms,
        pincode,
        cheapestSinglePlatform,
        cheapestItemByItem
      );

    // Determine final recommendation
    const recommendation = this.buildRecommendation(
      cheapestSinglePlatform,
      optimizedMultiPlatform,
      cheapestItemByItem
    );

    return {
      pincode,
      evaluatedSubsetsCount: allSubsetSummaries.length,
      strategies: {
        cheapestItemByItem,
        cheapestSinglePlatform,
        optimizedMultiPlatform,
      },
      singlePlatformRankings,
      allSubsetEvaluations: allSubsetSummaries,
      recommendation,
    };
  }

  /**
   * Resolves available listings for each requested item across enabled platforms.
   */
  private async resolveItems(
    items: BasketItemRequest[],
    pincode: string,
    platforms: PlatformId[],
    observationsOverride?: PlatformObservationInput[]
  ): Promise<ResolvedItem[]> {
    // If override is provided, strictly validate integer paise on all prices
    if (observationsOverride) {
      for (const obs of observationsOverride) {
        assertIntegerPaise(
          obs.pricePaise,
          `Observation pricePaise for ${obs.name || obs.rawTitle || obs.title || "item"}`
        );
      }
    }

    let dbObservations: any[] = [];
    if (!observationsOverride && this.prisma) {
      dbObservations = await this.prisma.platformObservation.findMany({
        where: { pincode },
      });
    }

    const resolved: ResolvedItem[] = [];

    for (const item of items) {
      const matchMap = new Map<PlatformId, ItemPlatformMatch>();

      for (const platform of platforms) {
        let match: ItemPlatformMatch | null = null;

        if (observationsOverride) {
          match = this.findBestMatchInList(item, platform, observationsOverride);
        } else if (dbObservations.length > 0) {
          match = this.findBestMatchInList(item, platform, dbObservations);
        } else {
          // Fallback to seeded canonical products
          match = this.findBestMatchInSeed(item, platform);
        }

        if (match) {
          matchMap.set(platform, match);
        }
      }

      resolved.push({
        requested: item,
        availableOn: matchMap,
      });
    }

    return resolved;
  }

  private findBestMatchInList(
    item: BasketItemRequest,
    platform: PlatformId,
    list: any[]
  ): ItemPlatformMatch | null {
    const qLower = item.queryName.toLowerCase().trim();
    const brandLower = item.preferredBrand?.toLowerCase().trim();

    const candidates = list.filter((obs) => {
      const obsPlat = (obs.platformId || obs.platform) as PlatformId;
      if (obsPlat !== platform) return false;

      // Check stock status
      const isOutOfStock =
        obs.availabilityStatus === "OUT_OF_STOCK" ||
        obs.availabilityStatus === "UNAVAILABLE" ||
        obs.availability === "unavailable";
      if (isOutOfStock) return false;

      const isAvailable =
        obs.availabilityStatus === "IN_STOCK" ||
        obs.availabilityStatus === "LOW_STOCK" ||
        obs.availability === "available" ||
        (!obs.availabilityStatus && !obs.availability && obs.pricePaise > 0);
      if (!isAvailable) return false;

      // Match criteria
      if (
        item.canonicalProductId &&
        (obs.canonicalProductId === item.canonicalProductId || obs.id === item.canonicalProductId)
      ) {
        return true;
      }

      const obsTitle = (obs.name || obs.rawTitle || obs.title || "").toLowerCase();
      if (obsTitle.includes(qLower) || qLower.includes(obsTitle)) {
        return true;
      }

      return false;
    });

    if (candidates.length === 0) return null;

    // Prioritize preferred brand if provided
    let pool = candidates;
    if (brandLower) {
      const brandFiltered = candidates.filter((c) =>
        (c.brand || "").toLowerCase().includes(brandLower)
      );
      if (brandFiltered.length > 0) pool = brandFiltered;
    }

    // Pick lowest shelf price
    pool.sort((a, b) => a.pricePaise - b.pricePaise);
    const chosen = pool[0];

    assertIntegerPaise(chosen.pricePaise, `${item.queryName} on ${platform}`);

    const title = chosen.name || chosen.rawTitle || chosen.title || item.queryName;
    const searchUrl =
      chosen.searchUrl || buildPlatformSearchDeepLink(platform, title);

    return {
      platformId: platform,
      pricePaise: chosen.pricePaise,
      title,
      brand: chosen.brand || undefined,
      productUrl: chosen.productUrl || undefined,
      searchUrl,
      availability:
        chosen.availabilityStatus === "LOW_STOCK" ? "LOW_STOCK" : "IN_STOCK",
    };
  }

  private findBestMatchInSeed(
    item: BasketItemRequest,
    platform: PlatformId
  ): ItemPlatformMatch | null {
    const qLower = item.queryName.toLowerCase().trim();
    for (const prod of SEED_CANONICAL_PRODUCTS) {
      const matchesId = item.canonicalProductId === prod.id || item.canonicalProductId === prod.slug;
      const matchesName = prod.name.toLowerCase().includes(qLower) || qLower.includes(prod.name.toLowerCase());
      const matchesAlias = prod.aliases.some((a) => a.toLowerCase().includes(qLower) || qLower.includes(a.toLowerCase()));

      if (matchesId || matchesName || matchesAlias) {
        const pInfo = prod.prices[platform];
        if (pInfo && pInfo.inStock && pInfo.pricePaise > 0) {
          assertIntegerPaise(pInfo.pricePaise, `${prod.name} on ${platform}`);
          return {
            platformId: platform,
            pricePaise: pInfo.pricePaise,
            title: prod.name,
            brand: prod.brand,
            searchUrl: buildPlatformSearchDeepLink(platform, prod.name),
            availability: "IN_STOCK",
          };
        }
      }
    }
    return null;
  }

  /**
   * Evaluates Strategy 1: Cheapest Item-by-Item (Theoretical Shelf Floor)
   */
  private async evaluateCheapestItemByItem(
    items: ResolvedItem[],
    platforms: PlatformId[],
    pincode: string
  ): Promise<StrategyEvaluation> {
    const storeItems = new Map<PlatformId, AssignedLineItem[]>();
    for (const p of platforms) storeItems.set(p, []);

    let shelfSubtotalPaise = 0;
    const missingItems: { queryName: string; canonicalProductId?: string }[] = [];

    for (const item of items) {
      let cheapestPlatform: PlatformId | null = null;
      let lowestPrice = Infinity;
      let lowestMatch: ItemPlatformMatch | null = null;

      for (const p of platforms) {
        const match = item.availableOn.get(p);
        if (match && match.pricePaise < lowestPrice) {
          lowestPrice = match.pricePaise;
          cheapestPlatform = p;
          lowestMatch = match;
        }
      }

      if (cheapestPlatform && lowestMatch) {
        const lineTotal = multiplyPaiseByQty(lowestMatch.pricePaise, item.requested.quantity);
        shelfSubtotalPaise = addPaise(shelfSubtotalPaise, lineTotal);

        storeItems.get(cheapestPlatform)!.push({
          queryName: item.requested.queryName,
          canonicalProductId: item.requested.canonicalProductId,
          matchedTitle: lowestMatch.title,
          brand: lowestMatch.brand,
          quantity: item.requested.quantity,
          unitPricePaise: lowestMatch.pricePaise,
          lineTotalPaise: lineTotal,
          availability: lowestMatch.availability,
          platformId: cheapestPlatform,
          productUrl: lowestMatch.productUrl,
          searchUrl: lowestMatch.searchUrl,
        });
      } else {
        missingItems.push({
          queryName: item.requested.queryName,
          canonicalProductId: item.requested.canonicalProductId,
        });
      }
    }

    // Evaluate fees for all active stores
    const storeCarts: Record<PlatformId, StoreCartEvaluation> = {} as any;
    let totalFeeMinPaise = 0;
    let totalFeeMaxPaise = 0;
    let hasUnknownFees = false;
    const activeStores: PlatformId[] = [];
    const feeCliffWarnings: string[] = [];

    for (const p of platforms) {
      const pItems = storeItems.get(p) || [];
      if (pItems.length === 0) continue;

      activeStores.push(p);
      let storeSubtotal = 0;
      for (const it of pItems) {
        storeSubtotal = addPaise(storeSubtotal, it.lineTotalPaise);
      }

      const feeResult = await this.feeIntelligence.calculateBasketFees({
        platformId: p,
        basketSubtotalPaise: storeSubtotal,
        pincode,
      });

      totalFeeMinPaise = addPaise(totalFeeMinPaise, feeResult.breakdown.totalFeeMinPaise);
      totalFeeMaxPaise = addPaise(totalFeeMaxPaise, feeResult.breakdown.totalFeeMaxPaise);
      if (feeResult.breakdown.hasUnknownFees) hasUnknownFees = true;

      const storeWarnings: string[] = [];
      if (feeResult.cliffs.amountToFreeDeliveryPaise > 0) {
        storeWarnings.push(
          `Add ${formatPaiseToRupees(
            feeResult.cliffs.amountToFreeDeliveryPaise
          )} more to unlock Free Delivery on ${PLATFORM_METADATA[p].name}`
        );
      }

      feeCliffWarnings.push(...storeWarnings);

      storeCarts[p] = {
        platformId: p,
        platformName: PLATFORM_METADATA[p].name,
        items: pItems,
        subtotalPaise: storeSubtotal,
        feeBreakdown: feeResult.breakdown,
        totalMinPaise: feeResult.totalBasketMinPaise,
        totalMaxPaise: feeResult.totalBasketMaxPaise,
        hasUnknownFees: feeResult.breakdown.hasUnknownFees,
        cliffs: feeResult.cliffs,
        feeCliffWarnings: storeWarnings,
      };
    }

    const estimatedTotalMinPaise = addPaise(shelfSubtotalPaise, totalFeeMinPaise);
    const estimatedTotalMaxPaise = addPaise(shelfSubtotalPaise, totalFeeMaxPaise);

    const rationale =
      `Theoretical shelf floor assigns each item to the platform offering the lowest individual price. ` +
      `While shelf items total ${formatPaiseToRupees(shelfSubtotalPaise)}, naively splitting across ${activeStores.length} stores ` +
      `adds ${formatPaiseToRupees(totalFeeMinPaise)} in cumulative delivery and handling fees, resulting in ${formatPaiseToRupees(estimatedTotalMinPaise)} total spend.`;

    return {
      strategy: "CHEAPEST_ITEM_BY_ITEM",
      strategyName: "Cheapest Item-by-Item (Theoretical Shelf Floor)",
      platforms: activeStores,
      storeCarts,
      shelfSubtotalPaise,
      itemSubtotalPaise: shelfSubtotalPaise,
      totalFeeMinPaise,
      totalFeeMaxPaise,
      estimatedTotalMinPaise,
      estimatedTotalMaxPaise,
      hasUnknownFees,
      coverageCount: items.length - missingItems.length,
      totalRequestedItems: items.length,
      missingItems,
      feeCliffWarnings,
      rationale,
    };
  }

  /**
   * Evaluates Strategy 2: Cheapest Single Platform (Named Single-Store Baseline)
   */
  private async evaluateSinglePlatforms(
    items: ResolvedItem[],
    platforms: PlatformId[],
    pincode: string
  ): Promise<{
    winningBaseline: StrategyEvaluation;
    rankings: StrategyEvaluation[];
  }> {
    const evaluations: StrategyEvaluation[] = [];

    for (const p of platforms) {
      const pItems: AssignedLineItem[] = [];
      const missingItems: { queryName: string; canonicalProductId?: string }[] = [];
      let subtotalPaise = 0;

      for (const item of items) {
        const match = item.availableOn.get(p);
        if (match) {
          const lineTotal = multiplyPaiseByQty(match.pricePaise, item.requested.quantity);
          subtotalPaise = addPaise(subtotalPaise, lineTotal);
          pItems.push({
            queryName: item.requested.queryName,
            canonicalProductId: item.requested.canonicalProductId,
            matchedTitle: match.title,
            brand: match.brand,
            quantity: item.requested.quantity,
            unitPricePaise: match.pricePaise,
            lineTotalPaise: lineTotal,
            availability: match.availability,
            platformId: p,
            productUrl: match.productUrl,
            searchUrl: match.searchUrl,
          });
        } else {
          missingItems.push({
            queryName: item.requested.queryName,
            canonicalProductId: item.requested.canonicalProductId,
          });
        }
      }

      const feeResult = await this.feeIntelligence.calculateBasketFees({
        platformId: p,
        basketSubtotalPaise: subtotalPaise,
        pincode,
      });

      const storeWarnings: string[] = [];
      if (feeResult.cliffs.amountToFreeDeliveryPaise > 0) {
        storeWarnings.push(
          `Add ${formatPaiseToRupees(
            feeResult.cliffs.amountToFreeDeliveryPaise
          )} more to unlock Free Delivery on ${PLATFORM_METADATA[p].name}`
        );
      }
      if (feeResult.cliffs.amountToAvoidSmallCartFeePaise > 0) {
        storeWarnings.push(
          `Add ${formatPaiseToRupees(
            feeResult.cliffs.amountToAvoidSmallCartFeePaise
          )} more to avoid Small Cart Fee on ${PLATFORM_METADATA[p].name}`
        );
      }

      const storeCart: StoreCartEvaluation = {
        platformId: p,
        platformName: PLATFORM_METADATA[p].name,
        items: pItems,
        subtotalPaise,
        feeBreakdown: feeResult.breakdown,
        totalMinPaise: feeResult.totalBasketMinPaise,
        totalMaxPaise: feeResult.totalBasketMaxPaise,
        hasUnknownFees: feeResult.breakdown.hasUnknownFees,
        cliffs: feeResult.cliffs,
        feeCliffWarnings: storeWarnings,
      };

      const evalResult: StrategyEvaluation = {
        strategy: "CHEAPEST_SINGLE_PLATFORM",
        strategyName: `Cheapest Single Platform (${PLATFORM_METADATA[p].name})`,
        platforms: pItems.length > 0 ? [p] : [],
        storeCarts: { [p]: storeCart } as Record<PlatformId, StoreCartEvaluation>,
        itemSubtotalPaise: subtotalPaise,
        totalFeeMinPaise: feeResult.breakdown.totalFeeMinPaise,
        totalFeeMaxPaise: feeResult.breakdown.totalFeeMaxPaise,
        estimatedTotalMinPaise: feeResult.totalBasketMinPaise,
        estimatedTotalMaxPaise: feeResult.totalBasketMaxPaise,
        hasUnknownFees: feeResult.breakdown.hasUnknownFees,
        coverageCount: pItems.length,
        totalRequestedItems: items.length,
        missingItems,
        feeCliffWarnings: storeWarnings,
        rationale: `Single delivery from ${PLATFORM_METADATA[p].name}. Covers ${pItems.length}/${items.length} items with total spend of ${formatPaiseToRupees(feeResult.totalBasketMinPaise)}.`,
      };

      evaluations.push(evalResult);
    }

    // Rank: coverage first, then lowest all-in total (minPaise, tie-break maxPaise)
    evaluations.sort((a, b) => {
      if (a.coverageCount !== b.coverageCount) {
        return b.coverageCount - a.coverageCount;
      }
      if (a.estimatedTotalMinPaise !== b.estimatedTotalMinPaise) {
        return a.estimatedTotalMinPaise - b.estimatedTotalMinPaise;
      }
      if (a.estimatedTotalMaxPaise !== b.estimatedTotalMaxPaise) {
        return a.estimatedTotalMaxPaise - b.estimatedTotalMaxPaise;
      }
      return a.platforms[0].localeCompare(b.platforms[0]);
    });

    return {
      winningBaseline: evaluations[0],
      rankings: evaluations,
    };
  }

  /**
   * Evaluates Strategy 3: Optimized Multi-Platform Split (Combinatorial 2^N - 1 Solver)
   */
  private async evaluateMultiPlatformSubsets(
    items: ResolvedItem[],
    platforms: PlatformId[],
    pincode: string,
    baselineSingle: StrategyEvaluation,
    cheapestItemByItem: StrategyEvaluation
  ): Promise<{
    winningSplit: StrategyEvaluation;
    allSubsetSummaries: SubsetEvaluationSummary[];
  }> {
    const subsets = enumerateNonEmptySubsets(platforms);
    const subsetEvaluations: {
      subset: PlatformId[];
      evaluation: StrategyEvaluation;
      summary: SubsetEvaluationSummary;
    }[] = [];

    for (const subset of subsets) {
      const evaluation = await this.evaluateSubset(items, subset, pincode);

      const summary: SubsetEvaluationSummary = {
        rank: 0,
        subset,
        subsetName: subset.map((p) => PLATFORM_METADATA[p].name).join(" + "),
        activeStoreCount: evaluation.platforms.length,
        coverageCount: evaluation.coverageCount,
        totalRequestedItems: evaluation.totalRequestedItems,
        subtotalPaise: evaluation.itemSubtotalPaise,
        feeMinPaise: evaluation.totalFeeMinPaise,
        feeMaxPaise: evaluation.totalFeeMaxPaise,
        estimatedTotalMinPaise: evaluation.estimatedTotalMinPaise,
        estimatedTotalMaxPaise: evaluation.estimatedTotalMaxPaise,
        hasUnknownFees: evaluation.hasUnknownFees,
        isFeasible: evaluation.coverageCount === evaluation.totalRequestedItems,
      };

      subsetEvaluations.push({ subset, evaluation, summary });
    }

    // Sort subsets:
    // 1. Max coverage count
    // 2. Lowest estimatedTotalMinPaise
    // 3. Lowest estimatedTotalMaxPaise
    // 4. Fewer active stores
    // 5. Deterministic subset string
    subsetEvaluations.sort((a, b) => {
      if (a.evaluation.coverageCount !== b.evaluation.coverageCount) {
        return b.evaluation.coverageCount - a.evaluation.coverageCount;
      }
      if (a.evaluation.estimatedTotalMinPaise !== b.evaluation.estimatedTotalMinPaise) {
        return a.evaluation.estimatedTotalMinPaise - b.evaluation.estimatedTotalMinPaise;
      }
      if (a.evaluation.estimatedTotalMaxPaise !== b.evaluation.estimatedTotalMaxPaise) {
        return a.evaluation.estimatedTotalMaxPaise - b.evaluation.estimatedTotalMaxPaise;
      }
      if (a.summary.activeStoreCount !== b.summary.activeStoreCount) {
        return a.summary.activeStoreCount - b.summary.activeStoreCount;
      }
      return a.summary.subsetName.localeCompare(b.summary.subsetName);
    });

    // Assign rank 1..15
    const summaries: SubsetEvaluationSummary[] = subsetEvaluations.map((item, idx) => ({
      ...item.summary,
      rank: idx + 1,
    }));

    const bestSubsetEval = subsetEvaluations[0].evaluation;

    // Calculate net savings vs baseline single platform and vs naive split
    let savingsVsSinglePlatformPaise = 0;
    if (baselineSingle.estimatedTotalMinPaise > bestSubsetEval.estimatedTotalMinPaise) {
      savingsVsSinglePlatformPaise = subtractPaise(
        baselineSingle.estimatedTotalMinPaise,
        bestSubsetEval.estimatedTotalMinPaise
      );
    }

    let savingsVsNaiveItemSplitPaise = 0;
    if (cheapestItemByItem.estimatedTotalMinPaise > bestSubsetEval.estimatedTotalMinPaise) {
      savingsVsNaiveItemSplitPaise = subtractPaise(
        cheapestItemByItem.estimatedTotalMinPaise,
        bestSubsetEval.estimatedTotalMinPaise
      );
    }

    const winningSplit: StrategyEvaluation = {
      ...bestSubsetEval,
      strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
      strategyName:
        bestSubsetEval.platforms.length > 1
          ? `Optimized Multi-Platform Split (${bestSubsetEval.platforms.length} Stores)`
          : `Optimized Single Platform (${PLATFORM_METADATA[bestSubsetEval.platforms[0] || "blinkit"].name})`,
      savingsVsSinglePlatformPaise,
      savingsVsNaiveItemSplitPaise,
    };

    return {
      winningSplit,
      allSubsetSummaries: summaries,
    };
  }

  /**
   * Evaluates a specific subset S with initial shelf assignment and boundary reallocation.
   */
  private async evaluateSubset(
    items: ResolvedItem[],
    subset: PlatformId[],
    pincode: string
  ): Promise<StrategyEvaluation> {
    // 1. Initial assignment: for each item, pick cheapest available platform in subset S
    const itemAssignments = new Map<number, PlatformId>();
    const missingItems: { queryName: string; canonicalProductId?: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let bestPlat: PlatformId | null = null;
      let lowestPrice = Infinity;

      for (const p of subset) {
        const match = item.availableOn.get(p);
        if (match && match.pricePaise < lowestPrice) {
          lowestPrice = match.pricePaise;
          bestPlat = p;
        }
      }

      if (bestPlat) {
        itemAssignments.set(i, bestPlat);
      } else {
        missingItems.push({
          queryName: item.requested.queryName,
          canonicalProductId: item.requested.canonicalProductId,
        });
      }
    }

    // 2. Boundary Reallocation Check:
    // Check if shifting an item between two active stores in S pushes a store over
    // freeDeliveryThresholdPaise or smallCartThresholdPaise to lower net all-in spend.
    if (subset.length > 1 && itemAssignments.size > 1) {
      let improved = true;
      let passes = 0;

      while (improved && passes < 4) {
        improved = false;
        passes++;

        const currentSpend = await this.calculateSpendForAssignment(
          itemAssignments,
          items,
          subset,
          pincode
        );

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const currentPlat = itemAssignments.get(i);
          if (!currentPlat) continue;

          for (const altPlat of subset) {
            if (altPlat === currentPlat) continue;
            if (!item.availableOn.has(altPlat)) continue;

            // Try candidate assignment with item i moved to altPlat
            itemAssignments.set(i, altPlat);
            const candidateSpend = await this.calculateSpendForAssignment(
              itemAssignments,
              items,
              subset,
              pincode
            );

            // Reallocation improves spend if candidate min total is strictly lower,
            // or if equal total spend has fewer active stores
            const isStrictlyCheaper =
              candidateSpend.estimatedTotalMinPaise < currentSpend.estimatedTotalMinPaise;
            const isFewerStoresAtSameCost =
              candidateSpend.estimatedTotalMinPaise === currentSpend.estimatedTotalMinPaise &&
              candidateSpend.activeStores.length < currentSpend.activeStores.length;

            if (isStrictlyCheaper || isFewerStoresAtSameCost) {
              improved = true;
              break; // Accept move and restart outer pass
            } else {
              // Revert assignment
              itemAssignments.set(i, currentPlat);
            }
          }
          if (improved) break;
        }
      }
    }

    // 3. Finalize store carts & totals for subset S
    const finalSpend = await this.calculateSpendForAssignment(
      itemAssignments,
      items,
      subset,
      pincode
    );

    return {
      strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
      strategyName: `Subset Plan: ${subset.map((p) => PLATFORM_METADATA[p].name).join(" + ")}`,
      platforms: finalSpend.activeStores,
      storeCarts: finalSpend.storeCarts,
      itemSubtotalPaise: finalSpend.subtotalPaise,
      totalFeeMinPaise: finalSpend.totalFeeMinPaise,
      totalFeeMaxPaise: finalSpend.totalFeeMaxPaise,
      estimatedTotalMinPaise: finalSpend.estimatedTotalMinPaise,
      estimatedTotalMaxPaise: finalSpend.estimatedTotalMaxPaise,
      hasUnknownFees: finalSpend.hasUnknownFees,
      coverageCount: items.length - missingItems.length,
      totalRequestedItems: items.length,
      missingItems,
      feeCliffWarnings: finalSpend.feeCliffWarnings,
    };
  }

  private async calculateSpendForAssignment(
    assignments: Map<number, PlatformId>,
    items: ResolvedItem[],
    subset: PlatformId[],
    pincode: string
  ): Promise<{
    subtotalPaise: number;
    totalFeeMinPaise: number;
    totalFeeMaxPaise: number;
    estimatedTotalMinPaise: number;
    estimatedTotalMaxPaise: number;
    hasUnknownFees: boolean;
    activeStores: PlatformId[];
    storeCarts: Record<PlatformId, StoreCartEvaluation>;
    feeCliffWarnings: string[];
  }> {
    const storeItems = new Map<PlatformId, AssignedLineItem[]>();
    for (const p of subset) storeItems.set(p, []);

    let subtotalPaise = 0;

    for (const [idx, p] of assignments.entries()) {
      const it = items[idx];
      const match = it.availableOn.get(p)!;
      const lineTotal = multiplyPaiseByQty(match.pricePaise, it.requested.quantity);
      subtotalPaise = addPaise(subtotalPaise, lineTotal);

      storeItems.get(p)!.push({
        queryName: it.requested.queryName,
        canonicalProductId: it.requested.canonicalProductId,
        matchedTitle: match.title,
        brand: match.brand,
        quantity: it.requested.quantity,
        unitPricePaise: match.pricePaise,
        lineTotalPaise: lineTotal,
        availability: match.availability,
        platformId: p,
        productUrl: match.productUrl,
        searchUrl: match.searchUrl,
      });
    }

    const storeCarts: Record<PlatformId, StoreCartEvaluation> = {} as any;
    let totalFeeMinPaise = 0;
    let totalFeeMaxPaise = 0;
    let hasUnknownFees = false;
    const activeStores: PlatformId[] = [];
    const feeCliffWarnings: string[] = [];

    for (const p of subset) {
      const pItems = storeItems.get(p) || [];
      if (pItems.length === 0) continue;

      activeStores.push(p);
      let storeSub = 0;
      for (const it of pItems) {
        storeSub = addPaise(storeSub, it.lineTotalPaise);
      }

      const feeResult = await this.feeIntelligence.calculateBasketFees({
        platformId: p,
        basketSubtotalPaise: storeSub,
        pincode,
      });

      totalFeeMinPaise = addPaise(totalFeeMinPaise, feeResult.breakdown.totalFeeMinPaise);
      totalFeeMaxPaise = addPaise(totalFeeMaxPaise, feeResult.breakdown.totalFeeMaxPaise);
      if (feeResult.breakdown.hasUnknownFees) hasUnknownFees = true;

      const storeWarnings: string[] = [];
      if (feeResult.cliffs.amountToFreeDeliveryPaise > 0) {
        storeWarnings.push(
          `Add ${formatPaiseToRupees(
            feeResult.cliffs.amountToFreeDeliveryPaise
          )} more to unlock Free Delivery on ${PLATFORM_METADATA[p].name}`
        );
      }

      feeCliffWarnings.push(...storeWarnings);

      storeCarts[p] = {
        platformId: p,
        platformName: PLATFORM_METADATA[p].name,
        items: pItems,
        subtotalPaise: storeSub,
        feeBreakdown: feeResult.breakdown,
        totalMinPaise: feeResult.totalBasketMinPaise,
        totalMaxPaise: feeResult.totalBasketMaxPaise,
        hasUnknownFees: feeResult.breakdown.hasUnknownFees,
        cliffs: feeResult.cliffs,
        feeCliffWarnings: storeWarnings,
      };
    }

    const estimatedTotalMinPaise = addPaise(subtotalPaise, totalFeeMinPaise);
    const estimatedTotalMaxPaise = addPaise(subtotalPaise, totalFeeMaxPaise);

    return {
      subtotalPaise,
      totalFeeMinPaise,
      totalFeeMaxPaise,
      estimatedTotalMinPaise,
      estimatedTotalMaxPaise,
      hasUnknownFees,
      activeStores,
      storeCarts,
      feeCliffWarnings,
    };
  }

  /**
   * Synthesizes the final recommendation based on true all-in savings and fees.
   */
  private buildRecommendation(
    cheapestSinglePlatform: StrategyEvaluation,
    optimizedMultiPlatform: StrategyEvaluation,
    cheapestItemByItem: StrategyEvaluation
  ): OptimizationRecommendation {
    const isMultiPlatformCheaper =
      optimizedMultiPlatform.platforms.length > 1 &&
      optimizedMultiPlatform.coverageCount >= cheapestSinglePlatform.coverageCount &&
      optimizedMultiPlatform.estimatedTotalMinPaise < cheapestSinglePlatform.estimatedTotalMinPaise;

    if (isMultiPlatformCheaper) {
      const netSavingsPaise = subtractPaise(
        cheapestSinglePlatform.estimatedTotalMinPaise,
        optimizedMultiPlatform.estimatedTotalMinPaise
      );

      const storeNames = optimizedMultiPlatform.platforms
        .map((p) => PLATFORM_METADATA[p].name)
        .join(" + ");

      const rationale =
        `Smart Split across ${optimizedMultiPlatform.platforms.length} stores (${storeNames}) ` +
        `saves ${formatPaiseToRupees(netSavingsPaise)} over the best single store (${cheapestSinglePlatform.strategyName}). ` +
        `Item price differences comfortably exceed cumulative delivery & handling fees.`;

      return {
        winningStrategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
        netSavingsPaise,
        rationale,
        feeCliffWarnings: optimizedMultiPlatform.feeCliffWarnings,
        hasUnknownFees: optimizedMultiPlatform.hasUnknownFees,
      };
    }

    // Single platform wins (split rejected due to fees or equal cost)
    const winningStoreName =
      cheapestSinglePlatform.platforms.length > 0
        ? PLATFORM_METADATA[cheapestSinglePlatform.platforms[0]].name
        : "Single Platform";

    const rationale =
      `Ordering entirely from ${winningStoreName} is the lowest-cost choice (${formatPaiseToRupees(
        cheapestSinglePlatform.estimatedTotalMinPaise
      )} all-in). While individual items may be slightly cheaper elsewhere, splitting across stores ` +
      `adds cumulative delivery and handling fees that erase product savings.`;

    return {
      winningStrategy: "CHEAPEST_SINGLE_PLATFORM",
      netSavingsPaise: 0,
      rationale,
      feeCliffWarnings: cheapestSinglePlatform.feeCliffWarnings,
      hasUnknownFees: cheapestSinglePlatform.hasUnknownFees,
    };
  }
}

/**
 * Functional entry point for deterministic basket optimization.
 */
export async function optimizeBasket(
  request: BasketOptimizationRequest,
  prisma?: PrismaClient,
  feeIntelligence?: FeeIntelligenceService
): Promise<BasketOptimizationResult> {
  const service = new OptimizationService(prisma, feeIntelligence);
  return service.optimizeBasket(request);
}
