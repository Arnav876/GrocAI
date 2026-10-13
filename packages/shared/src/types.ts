export type PlatformId = "blinkit" | "zepto" | "instamart" | "bigbasket";

export interface PlatformCapabilities {
  searchProducts: boolean;
  getPrices: boolean;
  getAvailability: boolean;
  getFees: boolean;
  createCart: boolean;
  supportsDeepLinks: boolean;
}

export type AvailabilityStatus = "available" | "unavailable" | "unknown";

export type SourceType = "authorized_api" | "partner_feed" | "permitted_page" | "manual" | "mock";

export interface PriceObservation {
  platform: PlatformId;
  productId?: string;
  productUrl?: string;
  searchUrl?: string;
  title: string;
  brand?: string;
  variant?: string;
  quantity?: number;
  unit?: string;
  price?: number; // In Rupees for public contract (float/number); internally store paise
  currency: "INR";
  availability?: AvailabilityStatus;
  locationKey?: string;
  sourceType: SourceType;
  observedAt: string;
  confidence: number;
  notes?: string[];
}

export interface FeeRange {
  minPaise: number;
  maxPaise: number;
}

export interface PlatformFeeStructure {
  platform: PlatformId;
  locationKey: string;
  deliveryFeePaise: number | FeeRange | null;
  handlingFeePaise: number | FeeRange | null;
  platformFeePaise: number | FeeRange | null;
  freeDeliveryThresholdPaise: number | null;
  minimumOrderValuePaise: number | null;
  sourceType: SourceType;
  observedAt: string;
  notes?: string[];
}

export interface ProductSummary {
  id: string;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string;
  variant: string;
  packSize: string;
  rating?: number;
  reviewCount?: number;
  lowestPricePaise: number;
  lowestPriceRupees: number;
  lowestPlatform: PlatformId;
  mrpPaise?: number;
  mrpRupees?: number;
  discountPercentage?: number;
  isNew?: boolean;
  isOutOfStock?: boolean;
  platformPrices: Record<
    PlatformId,
    {
      pricePaise?: number;
      priceRupees?: number;
      availability: AvailabilityStatus;
      isStale: boolean;
      observedAt?: string;
      sourceType: SourceType;
      confidence: number;
      isUnknownPrice?: boolean;
      productUrl?: string;
      searchUrl?: string;
      notes?: string[];
    }
  >;
}

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
  icon: string;
  bgPastel: string;
}

export interface GroceryListItemInput {
  query: string;
  quantity: number;
  unit: string;
  requiredVariant?: string;
  allowSubstitutions?: boolean;
}

export interface UserPreferences {
  strategy?: "cheapest_item_by_item" | "cheapest_single_platform" | "optimized_multi_platform" | "fewer_deliveries";
  maxPlatforms?: number;
  minimumSavingsPaise?: number; // Minimum savings before recommending basket split
  minimumSavingsRupees?: number;
  allowSubstitutions?: boolean;
  budgetPaise?: number;
  budgetRupees?: number;
  preferredBrands?: string[];
}

export interface OptimizationLineItem {
  id: string;
  requestedQuery: string;
  requestedQuantity: number;
  requestedUnit: string;
  matchedTitle: string;
  brand: string;
  variant: string;
  packSize: string;
  unitPricePaise: number;
  unitPriceRupees: number;
  quantity: number;
  totalPricePaise: number;
  totalPriceRupees: number;
  availability: AvailabilityStatus;
  productUrl?: string;
  searchUrl?: string;
  isStale: boolean;
  confidence: number;
  sourceType: SourceType;
  isSubstitution?: boolean;
}

export interface PlatformCartPlan {
  platform: PlatformId;
  platformName: string;
  items: OptimizationLineItem[];
  itemCount: number;
  subtotalPaise: number;
  subtotalRupees: number;
  deliveryFeePaise: number;
  deliveryFeeRupees: number;
  handlingFeePaise: number;
  handlingFeeRupees: number;
  platformFeePaise: number;
  platformFeeRupees: number;
  discountsPaise: number;
  discountsRupees: number;
  estimatedTotalPaise: number;
  estimatedTotalRupees: number;
  meetsMinimumOrder: boolean;
  minimumOrderValuePaise?: number;
  shortfallForMinimumOrderPaise?: number;
  hasUnknownFee: boolean;
  unknownFeeExplanation?: string;
  supportsDeepLinks: boolean;
  cartReviewUrl?: string;
}

export type OptimizationStrategy = "cheapest_item_by_item" | "cheapest_single_platform" | "optimized_multi_platform";

export interface FeeSummary {
  deliveryPaise: number;
  handlingPaise: number;
  platformPaise: number;
  otherPaise: number;
  totalPaise: number;
  deliveryRupees: number;
  handlingRupees: number;
  platformRupees: number;
  otherRupees: number;
  totalRupees: number;
  hasUnknownFees: boolean;
}

export interface UnknownFeeDetail {
  feeNames: string[];
  ranges?: Record<string, { minPaise: number; maxPaise: number; minRupees: number; maxRupees: number }>;
  message: string;
}

export interface PlanExplanation {
  summary: string;
  reasoning: string[];
  pros: string[];
  cons: string[];
}

export interface PlanDataCoverage {
  totalItems: number;
  matchedItems: number;
  missingItems: number;
  percentage: number;
}

export interface OptimizationOption {
  id: string;
  strategy: OptimizationStrategy;
  title: string;
  platforms: PlatformId[];
  perPlatform: Record<string, PlatformCartPlan>;
  subtotalPaise: number;
  subtotalRupees: number;
  estimatedFees: FeeSummary;
  knownFees: FeeSummary;
  unknownFees: UnknownFeeDetail | null;
  verifiedDiscountsPaise: number;
  verifiedDiscountsRupees: number;
  estimatedTotalPaise: number;
  estimatedTotalRupees: number;
  orderCount: number;
  savingsVsBaselinePaise: number;
  savingsVsBaselineRupees: number;
  baselineName: string;
  isEstimate: boolean;
  warnings: string[];
  explanation: PlanExplanation;
  dataCoverage: PlanDataCoverage;
  isFeasible: boolean;
}

export interface OptimizationResponse {
  id: string;
  locationId: string;
  pincode: string;
  createdAt: string;
  baselineName: string;
  baselineTotalPaise: number;
  baselineTotalRupees: number;
  options: OptimizationOption[];
  warnings: string[];
}

export interface HandoffPlatformGroup {
  platform: PlatformId;
  platformName: string;
  items: {
    title: string;
    brand?: string;
    variant?: string;
    quantity: number;
    unitPriceRupees: number;
    totalPriceRupees: number;
    productUrl?: string;
    searchUrl?: string;
    isDeepLink: boolean;
  }[];
  subtotalRupees: number;
  estimatedFeesRupees: number;
  hasUnknownFees: boolean;
  estimatedTotalRupees: number;
  meetsMinimumOrder: boolean;
  checklistText: string;
  cartReviewUrl?: string;
}

export interface ShoppingHandoffResponse {
  handoffId: string;
  optimizationId: string;
  strategy: OptimizationStrategy;
  timestamp: string;
  method: "links_and_checklist" | "automated_cart_api";
  isEstimate: boolean;
  notice: string;
  platforms: HandoffPlatformGroup[];
}

export interface PlatformHealthStatus {
  id: PlatformId;
  name: string;
  mode: "mock" | "manual" | "partner_feed" | "authorized_api" | "permitted_page";
  enabled: boolean;
  capabilities: PlatformCapabilities;
  status: "healthy" | "degraded" | "disabled" | "offline";
  lastChecked: string;
  latencyMs: number;
  errorRate: number;
  notes: string[];
}
