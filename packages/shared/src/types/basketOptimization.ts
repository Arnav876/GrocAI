import { PlatformId } from "./platforms.js";
import { FeeBreakdownPaise } from "../schemas/fees.js";

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
  availabilityStatus?: string;
  availability?: string;
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
  shelfSubtotalPaise?: number;
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

export interface PlatformHandoffItem {
  title: string;
  brand?: string;
  variant?: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  unitPriceRupees: number;
  totalPriceRupees: number;
  productUrl?: string;
  searchUrl: string;
  isDeepLink: boolean;
  checkboxMarkdown: string;
}

export interface PlatformHandoffGroup {
  platform: PlatformId;
  platformName: string;
  items: PlatformHandoffItem[];
  subtotalPaise: number;
  subtotalRupees: number;
  estimatedFeesRupees: number;
  hasUnknownFees: boolean;
  estimatedTotalRupees: number;
  estimatedTotalMinPaise: number;
  estimatedTotalMaxPaise: number;
  meetsMinimumOrder: boolean;
  checklistText: string;
  cartReviewUrl: string;
  storeChecklistMarkdown: string;
  cliffTip?: string;
  unknownFeeExplanation?: string;
}

export interface ShoppingHandoffPayload {
  handoffId: string;
  optimizationId?: string;
  pincode?: string;
  strategy: string;
  strategyName: string;
  timestamp: string;
  method: "links_and_checklist";
  isEstimate: boolean;
  notice: string;
  capabilities: {
    createCart: false;
    automatedCheckout: false;
    searchDeepLink: true;
    checklistHandoff: true;
  };
  markdownChecklist: string;
  grandTotalPaise: {
    subtotalPaise: number;
    feeMinPaise: number;
    feeMaxPaise: number;
    estimatedTotalMinPaise: number;
    estimatedTotalMaxPaise: number;
    hasUnknownFees: boolean;
  };
  grandTotalRupees: {
    subtotal: string;
    estimatedTotalMin: string;
    estimatedTotalMax: string;
  };
  platforms: PlatformHandoffGroup[];
}

