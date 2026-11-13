import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
  SourceType,
  PriceVerificationStatus,
  determinePriceVerificationStatus,
  calculateNormalizedUnitPrice,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "../types.js";
import { FallbackPlatformConnector, IntegrationMode } from "../fallbackHierarchy.js";
import { PrismaClient } from "@prisma/client";

export interface AdapterFetchOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  locationKey?: string;
}

export interface AdapterStatus {
  platformId: PlatformId;
  name: string;
  mode: IntegrationMode;
  isEnabled: boolean;
  hasApiCredentials: boolean;
  capabilities: PlatformCapabilities;
  lastSuccessfulFetch: string | null;
  circuitBreaker: {
    state: string;
    failureCount: number;
    errorRate: number;
  };
}

export interface IGroceryPlatformAdapter extends IPlatformConnector {
  getAdapterName(): string;
  getStatus(): AdapterStatus;
  getMode(): IntegrationMode;
  setMode(mode: IntegrationMode): void;
  getLastSuccessfulFetch(): string | null;
  enrichObservation(obs: Partial<PriceObservation> & { title: string }): PriceObservation;
}

export abstract class BaseGroceryPlatformAdapter implements IGroceryPlatformAdapter {
  protected lastSuccessfulFetchTime: string | null = null;
  protected connector: FallbackPlatformConnector;
  protected faultConfig: FaultInjectionConfig = {};

  constructor(
    public readonly platformId: PlatformId,
    protected prisma: PrismaClient,
    initialMode?: IntegrationMode
  ) {
    this.connector = new FallbackPlatformConnector(platformId, prisma, initialMode);
  }

  abstract getAdapterName(): string;

  getMode(): IntegrationMode {
    return this.connector.getMode();
  }

  setMode(mode: IntegrationMode): void {
    this.connector.setMode(mode);
  }

  getCapabilities(): PlatformCapabilities {
    return this.connector.getCapabilities();
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
    this.connector.setFaultInjection(config);
  }

  protected async applyFaults(): Promise<void> {
    if (this.faultConfig.forcedLatencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.faultConfig.forcedLatencyMs));
    }
    if (this.faultConfig.simulateTimeout) {
      throw new Error(`Connector timeout for ${this.platformId} after 5000ms`);
    }
    if (this.faultConfig.simulateUnavailable) {
      throw new Error(`Platform ${this.platformId} service temporarily unavailable (503)`);
    }
  }

  getLastSuccessfulFetch(): string | null {
    return this.lastSuccessfulFetchTime;
  }

  hasApiCredentials(): boolean {
    const key = process.env[`${this.platformId.toUpperCase()}_API_KEY`];
    const url = process.env[`${this.platformId.toUpperCase()}_API_BASE_URL`];
    return Boolean(key && key.trim() !== "" && url && url.trim() !== "");
  }

  getStatus(): AdapterStatus {
    const cb = this.connector.getCircuitBreakerMetrics();
    const mode = this.getMode();
    const errorRate = cb.totalRequests > 0 ? Number((cb.failureCount / cb.totalRequests).toFixed(2)) : 0;

    return {
      platformId: this.platformId,
      name: PLATFORM_METADATA[this.platformId].name,
      mode,
      isEnabled: true,
      hasApiCredentials: this.hasApiCredentials(),
      capabilities: this.getCapabilities(),
      lastSuccessfulFetch: this.lastSuccessfulFetchTime,
      circuitBreaker: {
        state: cb.state,
        failureCount: cb.failureCount,
        errorRate,
      },
    };
  }

  /**
   * Enriches raw price observation ensuring all 14 mandatory fields and unit-price normalization are populated.
   */
  enrichObservation(raw: Partial<PriceObservation> & { title: string }): PriceObservation {
    const observedAt = raw.observedAt || new Date().toISOString();
    const sourceType: SourceType = raw.sourceType || (this.getMode() as SourceType) || "mock";
    const availability = raw.availability || "available";

    // Financial integer paise precision
    let pricePaise = raw.pricePaise;
    let priceRupees = raw.price;
    if (pricePaise !== undefined && priceRupees === undefined) {
      priceRupees = pricePaise / 100;
    } else if (priceRupees !== undefined && pricePaise === undefined) {
      pricePaise = Math.round(priceRupees * 100);
    }

    // Original MRP / price
    let originalPricePaise = raw.originalPricePaise;
    let originalPriceRupees = raw.originalPrice;
    if (originalPricePaise !== undefined && originalPriceRupees === undefined) {
      originalPriceRupees = originalPricePaise / 100;
    } else if (originalPriceRupees !== undefined && originalPricePaise === undefined) {
      originalPricePaise = Math.round(originalPriceRupees * 100);
    }

    // Discount percentage
    let discountPercentage = raw.discountPercentage;
    if (
      discountPercentage === undefined &&
      originalPricePaise &&
      pricePaise &&
      originalPricePaise > pricePaise
    ) {
      discountPercentage = Math.round(((originalPricePaise - pricePaise) / originalPricePaise) * 100);
    }

    // Normalized unit price (e.g. ₹66/L for 500ml milk)
    const packSizeStr = raw.unit || "";
    const normalizedUnitPrice =
      pricePaise && packSizeStr ? calculateNormalizedUnitPrice(pricePaise, packSizeStr) || undefined : undefined;

    // Price verification status
    const verificationStatus: PriceVerificationStatus =
      raw.verificationStatus || determinePriceVerificationStatus(observedAt, sourceType, availability);

    return {
      platform: this.platformId,
      productId: raw.productId,
      productUrl: raw.productUrl,
      imageUrl: raw.imageUrl,
      searchUrl:
        raw.searchUrl ||
        `${PLATFORM_METADATA[this.platformId].searchBaseUrl}${encodeURIComponent(raw.title)}`,
      title: raw.title,
      brand: raw.brand,
      variant: raw.variant,
      packSize: raw.packSize || raw.unit,
      quantity: raw.quantity || 1,
      unit: raw.unit,
      price: priceRupees,
      pricePaise,
      originalPrice: originalPriceRupees,
      originalPricePaise,
      discountPercentage,
      currency: "INR",
      availability,
      locationKey: raw.locationKey || "delhi_110001",
      serviceableArea: raw.serviceableArea || "Central Delhi",
      sourceType,
      verificationStatus,
      observedAt,
      confidence: raw.confidence ?? 1.0,
      normalizedUnitPrice,
      notes: raw.notes,
    };
  }

  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    const rawObs = await this.connector.searchProducts(query, locationKey);
    this.lastSuccessfulFetchTime = new Date().toISOString();
    return rawObs.map((obs) => this.enrichObservation(obs));
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    const raw = await this.connector.getPrice(productId, locationKey);
    if (!raw) return null;
    this.lastSuccessfulFetchTime = new Date().toISOString();
    return this.enrichObservation(raw);
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    return this.connector.getFees(locationKey);
  }
}
