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

export const PriceObservationSchema = z.object({
  platform: PlatformIdSchema,
  productId: z.string().optional(),
  productUrl: z.string().url().optional(),
  searchUrl: z.string().url().optional(),
  title: z.string().min(1),
  brand: z.string().optional(),
  variant: z.string().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  price: z.number().nonnegative().optional(), // In INR rupees at contract boundary
  currency: z.literal("INR"),
  availability: AvailabilityStatusSchema.optional(),
  locationKey: z.string().optional(),
  sourceType: SourceTypeSchema,
  observedAt: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).optional(),
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
