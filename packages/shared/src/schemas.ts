import { z } from "zod";

export const PlatformIdSchema = z.enum(["blinkit", "zepto", "instamart", "bigbasket"]);

export const PlatformCapabilitiesSchema = z.object({
  searchProducts: z.boolean(),
  getPrices: z.boolean(),
  getAvailability: z.boolean(),
  getFees: z.boolean(),
  createCart: z.boolean(),
  supportsDeepLinks: z.boolean(),
});

export const SourceTypeSchema = z.enum([
  "authorized_api",
  "partner_feed",
  "permitted_page",
  "manual",
  "mock",
]);

export const AvailabilityStatusSchema = z.enum(["available", "unavailable", "unknown"]);

export const PriceVerificationStatusSchema = z.enum([
  "live_verified",
  "cached",
  "stale",
  "unverified",
  "unavailable",
  "estimate",
]);

export const NormalizedUnitPriceSchema = z.object({
  unit: z.string(),
  pricePerUnitPaise: z.number().int().nonnegative(),
  pricePerUnitRupees: z.number().nonnegative(),
  displayUnitPrice: z.string(),
});

export const PriceObservationSchema = z.object({
  platform: PlatformIdSchema,
  productId: z.string().optional(),
  externalId: z.string().optional(),
  productUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  searchUrl: z.string().optional(),
  title: z.string().min(1),
  brand: z.string().optional(),
  variant: z.string().optional(),
  packSize: z.string().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  price: z.number().nonnegative().optional(), // In INR rupees at contract boundary
  pricePaise: z.number().int().nonnegative().optional(),
  originalPrice: z.number().nonnegative().optional(),
  originalPricePaise: z.number().int().nonnegative().optional(),
  discountPercentage: z.number().nonnegative().optional(),
  currency: z.literal("INR"),
  availability: AvailabilityStatusSchema.optional(),
  locationKey: z.string().optional(),
  pincode: z.string().optional(),
  serviceableArea: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sourceType: SourceTypeSchema,
  verificationStatus: PriceVerificationStatusSchema.optional(),
  observedAt: z.string(),
  fetchedAt: z.string().optional(),
  scrapeRunId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  normalizedUnitPrice: NormalizedUnitPriceSchema.optional(),
  normalizedUnitPricePaise: z.number().int().optional(),
  normalizedUnit: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

export const LocationContextSchema = z.object({
  locationKey: z.string(),
  pincode: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  serviceableArea: z.string().optional(),
});

export const ScrapeTriggerSchema = z.enum(["scheduled", "on_demand", "refresh", "manual"]);
export const ScrapeRunStatusSchema = z.enum(["pending", "running", "completed", "failed", "blocked"]);

export const ScrapeRunSchema = z.object({
  id: z.string(),
  platform: PlatformIdSchema,
  locationKey: z.string(),
  trigger: ScrapeTriggerSchema,
  status: ScrapeRunStatusSchema,
  queries: z.array(z.string()),
  itemsFound: z.number().int(),
  error: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});

export const RawObservationSchema = z.object({
  platform: PlatformIdSchema,
  externalId: z.string().optional(),
  title: z.string().min(1),
  brand: z.string().optional(),
  variant: z.string().optional(),
  packSize: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  pricePaise: z.number().int().nonnegative().optional(),
  originalPricePaise: z.number().int().nonnegative().optional(),
  discountPercentage: z.number().nonnegative().optional(),
  availability: AvailabilityStatusSchema.optional(),
  productUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  searchUrl: z.string().optional(),
  pincode: z.string().optional(),
  serviceableArea: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  rawPayload: z.unknown().optional(),
});

export const GroceryListItemInputSchema = z.object({
  query: z.string().min(1, "Item query cannot be empty"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().default("pcs"),
  requiredVariant: z.string().optional(),
  allowSubstitutions: z.boolean().default(false),
});

export const UserPreferencesSchema = z.object({
  strategy: z
    .enum(["cheapest_item_by_item", "cheapest_single_platform", "optimized_multi_platform", "fewer_deliveries"])
    .optional(),
  maxPlatforms: z.number().int().min(1).max(4).optional().default(3),
  minimumSavingsPaise: z.number().int().nonnegative().optional().default(2000), // Default ₹20 min saving
  minimumSavingsRupees: z.number().nonnegative().optional(),
  allowSubstitutions: z.boolean().optional().default(false),
  budgetPaise: z.number().int().positive().optional(),
  budgetRupees: z.number().positive().optional(),
  preferredBrands: z.array(z.string()).optional(),
});

export const OptimizationRequestSchema = z.object({
  locationId: z.string().default("delhi_110001"),
  pincode: z.string().regex(/^\d{6}$/, "Must be a valid 6-digit Indian pincode").default("110001"),
  items: z.array(GroceryListItemInputSchema).min(1, "At least one grocery item is required"),
  preferences: UserPreferencesSchema.optional(),
});

export const FeeSummarySchema = z.object({
  deliveryPaise: z.number().int(),
  handlingPaise: z.number().int(),
  platformPaise: z.number().int(),
  otherPaise: z.number().int(),
  totalPaise: z.number().int(),
  deliveryRupees: z.number(),
  handlingRupees: z.number(),
  platformRupees: z.number(),
  otherRupees: z.number(),
  totalRupees: z.number(),
  hasUnknownFees: z.boolean(),
});

export const OptimizationLineItemSchema = z.object({
  id: z.string(),
  requestedQuery: z.string(),
  requestedQuantity: z.number(),
  requestedUnit: z.string(),
  matchedTitle: z.string(),
  brand: z.string(),
  variant: z.string(),
  packSize: z.string(),
  unitPricePaise: z.number().int(),
  unitPriceRupees: z.number(),
  quantity: z.number(),
  totalPricePaise: z.number().int(),
  totalPriceRupees: z.number(),
  availability: AvailabilityStatusSchema,
  productUrl: z.string().optional(),
  searchUrl: z.string().optional(),
  isStale: z.boolean(),
  confidence: z.number(),
  sourceType: SourceTypeSchema,
  isSubstitution: z.boolean().optional(),
});

export const PlatformCartPlanSchema = z.object({
  platform: PlatformIdSchema,
  platformName: z.string(),
  items: z.array(OptimizationLineItemSchema),
  itemCount: z.number().int(),
  subtotalPaise: z.number().int(),
  subtotalRupees: z.number(),
  deliveryFeePaise: z.number().int(),
  deliveryFeeRupees: z.number(),
  handlingFeePaise: z.number().int(),
  handlingFeeRupees: z.number(),
  platformFeePaise: z.number().int(),
  platformFeeRupees: z.number(),
  discountsPaise: z.number().int(),
  discountsRupees: z.number(),
  estimatedTotalPaise: z.number().int(),
  estimatedTotalRupees: z.number(),
  meetsMinimumOrder: z.boolean(),
  minimumOrderValuePaise: z.number().int().optional(),
  shortfallForMinimumOrderPaise: z.number().int().optional(),
  hasUnknownFee: z.boolean(),
  unknownFeeExplanation: z.string().optional(),
  supportsDeepLinks: z.boolean(),
  cartReviewUrl: z.string().optional(),
});

export const PlanExplanationSchema = z.object({
  summary: z.string(),
  reasoning: z.array(z.string()),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const PlanDataCoverageSchema = z.object({
  totalItems: z.number().int(),
  matchedItems: z.number().int(),
  missingItems: z.number().int(),
  percentage: z.number(),
});

export const UnknownFeeDetailSchema = z.object({
  feeNames: z.array(z.string()),
  ranges: z
    .record(
      z.object({
        minPaise: z.number().int(),
        maxPaise: z.number().int(),
        minRupees: z.number(),
        maxRupees: z.number(),
      })
    )
    .optional(),
  message: z.string(),
});

export const OptimizationOptionSchema = z.object({
  id: z.string(),
  strategy: z.enum(["cheapest_item_by_item", "cheapest_single_platform", "optimized_multi_platform"]),
  title: z.string(),
  platforms: z.array(PlatformIdSchema),
  perPlatform: z.record(PlatformCartPlanSchema),
  subtotalPaise: z.number().int(),
  subtotalRupees: z.number(),
  estimatedFees: FeeSummarySchema,
  knownFees: FeeSummarySchema,
  unknownFees: UnknownFeeDetailSchema.nullable(),
  verifiedDiscountsPaise: z.number().int(),
  verifiedDiscountsRupees: z.number(),
  estimatedTotalPaise: z.number().int(),
  estimatedTotalRupees: z.number(),
  orderCount: z.number().int(),
  savingsVsBaselinePaise: z.number().int(),
  savingsVsBaselineRupees: z.number(),
  baselineName: z.string(),
  isEstimate: z.boolean(),
  warnings: z.array(z.string()),
  explanation: PlanExplanationSchema,
  dataCoverage: PlanDataCoverageSchema,
  isFeasible: z.boolean(),
});

export const OptimizationResponseSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  pincode: z.string(),
  createdAt: z.string(),
  baselineName: z.string(),
  baselineTotalPaise: z.number().int(),
  baselineTotalRupees: z.number(),
  options: z.array(OptimizationOptionSchema),
  warnings: z.array(z.string()),
});

export const SourceTypeCountsSchema = z.object({
  authorized_api: z.number().int().nonnegative(),
  partner_feed: z.number().int().nonnegative(),
  permitted_page: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  mock: z.number().int().nonnegative(),
});

export const VerificationCountsSchema = z.object({
  live_verified: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  estimate: z.number().int().nonnegative(),
});

export const DataProvenanceCountsSchema = z.object({
  totalListings: z.number().int().nonnegative(),
  availableListings: z.number().int().nonnegative(),
  liveSourceListings: z.number().int().nonnegative(),
  manualListings: z.number().int().nonnegative(),
  mockListings: z.number().int().nonnegative(),
  unknownSourceListings: z.number().int().nonnegative(),
  liveVerifiedListings: z.number().int().nonnegative(),
  cachedListings: z.number().int().nonnegative(),
  staleListings: z.number().int().nonnegative(),
  unavailableListings: z.number().int().nonnegative(),
  unverifiedListings: z.number().int().nonnegative(),
  estimateListings: z.number().int().nonnegative(),
});

export const DataProvenancePlatformSummarySchema = z.object({
  platform: PlatformIdSchema,
  totalListings: z.number().int().nonnegative(),
  bySourceType: SourceTypeCountsSchema,
  byVerification: VerificationCountsSchema,
  lastObservedAt: z.string().nullable(),
});

export const DataProvenanceSchema = z.object({
  locationKey: z.string(),
  pincode: z.string(),
  generatedAt: z.string(),
  status: z.enum(["live", "mixed", "mock", "empty"]),
  counts: DataProvenanceCountsSchema,
  bySourceType: SourceTypeCountsSchema,
  byVerification: VerificationCountsSchema,
  lastObservedAt: z.string().nullable(),
  platforms: z.array(DataProvenancePlatformSummarySchema),
  disclaimer: z.string(),
});

export const ObservationReviewStatusSchema = z.enum([
  "pending",
  "auto_matched",
  "promoted",
  "dismissed",
]);

export const UnmatchedObservationSuggestionSchema = z.object({
  productId: z.string(),
  name: z.string(),
  brand: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  variant: z.string(),
  packSize: z.string(),
  confidence: z.number(),
  isMatch: z.boolean(),
  reasons: z.array(z.string()),
});

export const UnmatchedObservationSummarySchema = z.object({
  id: z.string(),
  platform: PlatformIdSchema,
  rawTitle: z.string(),
  brand: z.string().nullable(),
  variant: z.string().nullable(),
  packSize: z.string().nullable(),
  pricePaise: z.number().int().nullable(),
  priceRupees: z.number().nullable(),
  originalPricePaise: z.number().int().nullable(),
  availability: AvailabilityStatusSchema,
  locationKey: z.string(),
  pincode: z.string().nullable(),
  productUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  searchUrl: z.string().nullable(),
  sourceType: SourceTypeSchema,
  observedAt: z.string(),
  confidence: z.number(),
  reviewStatus: ObservationReviewStatusSchema,
  suggestions: z.array(UnmatchedObservationSuggestionSchema),
});

export const UnmatchedObservationsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  observations: z.array(UnmatchedObservationSummarySchema),
});

export const PromoteObservationToExistingSchema = z.object({
  productId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export const PromoteObservationByCreatingProductSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().min(1).max(100).optional(),
  variant: z.string().trim().min(1).max(120).optional(),
  packSize: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

export const DismissObservationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const ShoppingHandoffRequestSchema = z.object({
  optimizationId: z.string(),
  strategy: z.enum(["cheapest_item_by_item", "cheapest_single_platform", "optimized_multi_platform"]),
});

export const ShoppingHandoffResponseSchema = z.object({
  handoffId: z.string(),
  optimizationId: z.string(),
  strategy: z.enum(["cheapest_item_by_item", "cheapest_single_platform", "optimized_multi_platform"]),
  timestamp: z.string(),
  method: z.enum(["links_and_checklist", "automated_cart_api"]),
  isEstimate: z.boolean(),
  notice: z.string(),
  platforms: z.array(
    z.object({
      platform: PlatformIdSchema,
      platformName: z.string(),
      items: z.array(
        z.object({
          title: z.string(),
          brand: z.string().optional(),
          variant: z.string().optional(),
          quantity: z.number(),
          unitPriceRupees: z.number(),
          totalPriceRupees: z.number(),
          productUrl: z.string().optional(),
          searchUrl: z.string().optional(),
          isDeepLink: z.boolean(),
        })
      ),
      subtotalRupees: z.number(),
      estimatedFeesRupees: z.number(),
      hasUnknownFees: z.boolean(),
      estimatedTotalRupees: z.number(),
      meetsMinimumOrder: z.boolean(),
      checklistText: z.string(),
      cartReviewUrl: z.string().optional(),
    })
  ),
});
