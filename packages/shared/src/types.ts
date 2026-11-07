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

export type PriceVerificationStatus =
  | "live_verified"
  | "cached"
  | "stale"
  | "unverified"
  | "unavailable"
  | "estimate";

export interface NormalizedUnitPrice {
  unit: string; // e.g. "L", "kg", "pcs"
  pricePerUnitPaise: number;
  pricePerUnitRupees: number;
  displayUnitPrice: string; // e.g. "₹66.00 / L"
}

export interface PriceObservation {
  platform: PlatformId;
  productId?: string;
  externalId?: string;
  productUrl?: string;
  imageUrl?: string;
  searchUrl?: string;
  title: string;
  brand?: string;
  variant?: string;
  packSize?: string;
  quantity?: number;
  unit?: string;
  price?: number; // In Rupees for public contract (float/number); internally store paise
  pricePaise?: number; // Integer paise
  originalPrice?: number;
  originalPricePaise?: number;
  discountPercentage?: number;
  currency: "INR";
  availability?: AvailabilityStatus;
  locationKey?: string;
  pincode?: string;
  serviceableArea?: string;
  latitude?: number;
  longitude?: number;
  sourceType: SourceType;
  verificationStatus?: PriceVerificationStatus;
  observedAt: string;
  fetchedAt?: string;
  scrapeRunId?: string;
  confidence: number;
  normalizedUnitPrice?: NormalizedUnitPrice;
  normalizedUnitPricePaise?: number;
  normalizedUnit?: string;
  notes?: string[];
}

export interface LocationContext {
  locationKey: string;
  pincode: string;
  city: string;
  latitude: number;
  longitude: number;
  serviceableArea?: string;
}

export type ScrapeTrigger = "scheduled" | "on_demand" | "refresh" | "manual";
export type ScrapeRunStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface ScrapeRun {
  id: string;
  platform: PlatformId;
  locationKey: string;
  trigger: ScrapeTrigger;
  status: ScrapeRunStatus;
  queries: string[];
  itemsFound: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ScrapeJob {
  id: string;
  platform: PlatformId;
  queries: string[];
  locationKey: string;
  priority: number;
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  attempts: number;
  maxAttempts: number;
  error?: string;
  scrapeRunId?: string;
  scheduledFor: string;
  lockedAt?: string;
  lockedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Review state for a stored price observation. Unmatched observations are
 * kept as `pending` for a human to promote or dismiss; they never become a
 * product listing on their own.
 */
export type ObservationReviewStatus =
  | "pending"
  | "auto_matched"
  | "promoted"
  | "dismissed";

export interface UnmatchedObservationSuggestion {
  productId: string;
  name: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  variant: string;
  packSize: string;
  confidence: number;
  isMatch: boolean;
  reasons: string[];
}

export interface UnmatchedObservationSummary {
  id: string;
  platform: PlatformId;
  rawTitle: string;
  brand: string | null;
  variant: string | null;
  packSize: string | null;
  pricePaise: number | null;
  priceRupees: number | null;
  originalPricePaise: number | null;
  availability: AvailabilityStatus;
  locationKey: string;
  pincode: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  searchUrl: string | null;
  sourceType: SourceType;
  observedAt: string;
  confidence: number;
  reviewStatus: ObservationReviewStatus;
  suggestions: UnmatchedObservationSuggestion[];
}

export interface UnmatchedObservationsResponse {
  total: number;
  limit: number;
  offset: number;
  observations: UnmatchedObservationSummary[];
}

export interface RawObservation {
  platform: PlatformId;
  externalId?: string;
  title: string;
  brand?: string;
  variant?: string;
  packSize?: string;
  quantity?: number;
  unit?: string;
  pricePaise?: number;
  originalPricePaise?: number;
  discountPercentage?: number;
  availability?: AvailabilityStatus;
  productUrl?: string;
  imageUrl?: string;
  searchUrl?: string;
  pincode?: string;
  serviceableArea?: string;
  latitude?: number;
  longitude?: number;
  rawPayload?: unknown;
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
  normalizedUnitPrice?: NormalizedUnitPrice;
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
      originalPricePaise?: number;
      originalPriceRupees?: number;
      discountPercentage?: number;
      availability: AvailabilityStatus;
      isStale: boolean;
      observedAt?: string;
      sourceType: SourceType;
      confidence: number;
      verificationStatus?: PriceVerificationStatus;
      normalizedUnitPrice?: NormalizedUnitPrice;
      isUnknownPrice?: boolean;
      productUrl?: string;
      imageUrl?: string;
      searchUrl?: string;
      serviceableArea?: string;
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

export interface HandoffItem {
  title: string;
  brand?: string;
  variant?: string;
  quantity: number;
  unitPriceRupees?: number;
  totalPriceRupees?: number;
  unitPricePaise?: number;
  totalPricePaise?: number;
  productUrl?: string;
  searchUrl?: string;
  isDeepLink: boolean;
  checkboxMarkdown?: string;
}

export interface HandoffPlatformGroup {
  platform: PlatformId;
  platformName: string;
  items: HandoffItem[];
  subtotalRupees?: number;
  subtotalPaise?: number;
  estimatedFeesRupees?: number;
  hasUnknownFees: boolean;
  estimatedTotalRupees?: number;
  estimatedTotalMinPaise?: number;
  estimatedTotalMaxPaise?: number;
  meetsMinimumOrder?: boolean;
  checklistText: string;
  cartReviewUrl?: string;
  storeChecklistMarkdown?: string;
  cliffTip?: string;
}

export interface CartHandoffCapabilities {
  createCart: boolean;
  automatedCheckout: boolean;
  searchDeepLink: boolean;
  checklistHandoff: boolean;
}

export interface ShoppingHandoffResponse {
  handoffId: string;
  optimizationId?: string;
  pincode?: string;
  strategy: string;
  strategyName?: string;
  timestamp: string;
  method: "links_and_checklist" | "automated_cart_api";
  isEstimate: boolean;
  notice: string;
  capabilities?: CartHandoffCapabilities;
  markdownChecklist?: string;
  grandTotalPaise?: {
    subtotalPaise: number;
    feeMinPaise: number;
    feeMaxPaise: number;
    estimatedTotalMinPaise: number;
    estimatedTotalMaxPaise: number;
    hasUnknownFees: boolean;
  };
  grandTotalRupees?: {
    subtotal: string;
    estimatedTotalMin: string;
    estimatedTotalMax: string;
  };
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

export type DataProvenanceStatus = "live" | "mixed" | "mock" | "empty";

export interface DataProvenanceCounts {
  totalListings: number;
  availableListings: number;
  liveSourceListings: number;
  manualListings: number;
  mockListings: number;
  unknownSourceListings: number;
  liveVerifiedListings: number;
  cachedListings: number;
  staleListings: number;
  unavailableListings: number;
  unverifiedListings: number;
  estimateListings: number;
}

export interface DataProvenancePlatformSummary {
  platform: PlatformId;
  totalListings: number;
  bySourceType: Record<SourceType, number>;
  byVerification: Record<PriceVerificationStatus, number>;
  lastObservedAt: string | null;
}

/**
 * Aggregate of stored PlatformListing provenance for a location. This is a
 * data-honesty surface: it reports what is actually stored (live-captured,
 * manually entered, or simulated) and never upgrades an estimate to live.
 */
export interface DataProvenance {
  locationKey: string;
  pincode: string;
  generatedAt: string;
  status: DataProvenanceStatus;
  counts: DataProvenanceCounts;
  bySourceType: Record<SourceType, number>;
  byVerification: Record<PriceVerificationStatus, number>;
  lastObservedAt: string | null;
  platforms: DataProvenancePlatformSummary[];
  disclaimer: string;
}
