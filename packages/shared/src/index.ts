export * from "./types.js";
export * from "./schemas.js";
export * from "./money.js";
export * from "./freshness.js";
export * from "./constants.js";
export * from "./unitNormalizer.js";
export * from "./provenance.js";

// Deliverable 2 Domain Contracts & Normalization
export {
  PLATFORM_METADATA_REGISTRY,
  type PlatformIngestionMode,
  type CheckoutMechanism,
  type PlatformMetadata,
} from "./types/platforms.js";
export * from "./adapters/NullCartAdapter.js";
export {
  NormalizedObservationSchema,
  type NormalizedObservation,
  calculateDiscountPercentage,
  PINCODE_REGEX,
  DataSourceEnum,
  type DataSource,
  VerificationStatusEnum,
  type VerificationStatus,
  AvailabilityStatusEnum as ObservationAvailabilityStatusEnum,
  type ObservationAvailabilityStatus,
  PlatformIdEnum as ObservationPlatformIdEnum,
  type ObservationPlatformId,
} from "./schemas/observation.js";
export * from "./schemas/fees.js";
export {
  assertIntegerPaise,
  addPaise,
  subtractPaise,
  multiplyPaiseByQty,
  formatPaiseToRupees,
  addFeeRanges,
} from "./utils/money.js";
export {
  parseAndNormalizeQuantity as parseAndNormalizeQuantityWithPrice,
  type CanonicalDimension,
  type CanonicalReferenceUnit,
  type NormalizedQuantityResult,
} from "./utils/unitNormalization.js";
