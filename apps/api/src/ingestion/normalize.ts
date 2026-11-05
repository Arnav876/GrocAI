import {
  PriceObservation,
  RawObservation,
  LocationContext,
  SourceType,
  PriceVerificationStatus,
  calculateNormalizedUnitPrice,
  paiseToRupees,
} from "@groqai/shared";

export interface ToObservationOptions {
  productId?: string;
  scrapeRunId?: string;
  sourceType?: SourceType;
  verificationStatus?: PriceVerificationStatus;
  confidence?: number;
}

/**
 * Normalizes a RawObservation into a validated PriceObservation.
 * STRICT FINANCIAL INVARIANT: Prices are ALWAYS represented as integer paise.
 * Floating point paise is strictly forbidden and rounded via Math.round().
 */
export function toObservation(
  raw: RawObservation,
  loc?: Partial<LocationContext>,
  options: ToObservationOptions = {}
): PriceObservation {
  // Enforce integer paise
  const pricePaise =
    raw.pricePaise !== undefined && raw.pricePaise !== null
      ? Math.round(Number(raw.pricePaise))
      : undefined;

  const originalPricePaise =
    raw.originalPricePaise !== undefined && raw.originalPricePaise !== null
      ? Math.round(Number(raw.originalPricePaise))
      : undefined;

  const priceRupees = pricePaise !== undefined ? paiseToRupees(pricePaise) : undefined;
  const originalPriceRupees =
    originalPricePaise !== undefined ? paiseToRupees(originalPricePaise) : undefined;

  // Derive pack size string for unit normalization
  const packSizeStr = raw.packSize || (raw.quantity && raw.unit ? `${raw.quantity} ${raw.unit}` : "");

  let normalizedUnitPrice = undefined;
  let normalizedUnitPricePaise = undefined;
  let normalizedUnit = undefined;

  if (pricePaise !== undefined && packSizeStr) {
    const norm = calculateNormalizedUnitPrice(pricePaise, packSizeStr);
    if (norm) {
      normalizedUnitPrice = norm;
      normalizedUnitPricePaise = norm.pricePerUnitPaise;
      normalizedUnit = norm.unit;
    }
  }

  const now = new Date().toISOString();
  const sourceType = options.sourceType || "permitted_page";
  const verificationStatus = options.verificationStatus || (sourceType === "mock" ? "estimate" : "live_verified");

  return {
    platform: raw.platform,
    productId: options.productId,
    externalId: raw.externalId,
    productUrl: raw.productUrl,
    imageUrl: raw.imageUrl,
    searchUrl: raw.searchUrl,
    title: raw.title.trim(),
    brand: raw.brand?.trim(),
    variant: raw.variant?.trim(),
    packSize: packSizeStr || undefined,
    quantity: raw.quantity,
    unit: raw.unit,
    price: priceRupees,
    pricePaise,
    originalPrice: originalPriceRupees,
    originalPricePaise,
    discountPercentage: raw.discountPercentage ?? 0,
    currency: "INR",
    availability: raw.availability || "available",
    locationKey: loc?.locationKey || "delhi_110001",
    pincode: raw.pincode || loc?.pincode || "110001",
    serviceableArea: raw.serviceableArea || loc?.serviceableArea || loc?.city || "Central Delhi",
    latitude: raw.latitude ?? loc?.latitude,
    longitude: raw.longitude ?? loc?.longitude,
    sourceType,
    verificationStatus,
    observedAt: now,
    fetchedAt: now,
    scrapeRunId: options.scrapeRunId,
    confidence: options.confidence ?? 1.0,
    normalizedUnitPrice,
    normalizedUnitPricePaise,
    normalizedUnit,
    notes: [],
  };
}

