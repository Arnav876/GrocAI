import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number | null;
  successfulRequests: number;
  totalRequests: number;
}

export interface IPlatformPayloadMapper {
  mapProducts(rawResponse: any, locationKey: string): PriceObservation[];
  mapPrice(rawResponse: any, locationKey: string): PriceObservation | null;
  mapFees(rawResponse: any, locationKey: string): PlatformFeeStructure | null;
}

/**
 * TODO Mapper: Blinkit Partner / Authorized API
 * Note: Blinkit does not currently provide an open public API.
 * This mapper specifies the expected schema when an enterprise partner agreement is reached.
 */
export class BlinkitPartnerPayloadMapper implements IPlatformPayloadMapper {
  mapProducts(raw: any, locationKey: string): PriceObservation[] {
    if (!raw || !Array.isArray(raw.items)) {
      throw new Error("Invalid Blinkit payload: expected items array in authorized partner response");
    }
    return raw.items.map((it: any) => ({
      platform: "blinkit" as PlatformId,
      productId: it.id,
      title: it.name,
      brand: it.brand,
      variant: it.variant,
      unit: it.unit || it.pack_size,
      price: typeof it.price_paise === "number" ? it.price_paise / 100 : it.price,
      currency: "INR",
      availability: it.in_stock ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
      productUrl: it.product_url,
      searchUrl: it.search_url,
    }));
  }

  mapPrice(raw: any, locationKey: string): PriceObservation | null {
    if (!raw) return null;
    return {
      platform: "blinkit",
      productId: raw.id,
      title: raw.name,
      price: typeof raw.price_paise === "number" ? raw.price_paise / 100 : raw.price,
      currency: "INR",
      availability: raw.in_stock ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    };
  }

  mapFees(raw: any, locationKey: string): PlatformFeeStructure | null {
    if (!raw) return null;
    return {
      platform: "blinkit",
      locationKey,
      deliveryFeePaise: raw.delivery_fee_paise,
      handlingFeePaise: raw.handling_fee_paise,
      platformFeePaise: raw.platform_fee_paise,
      freeDeliveryThresholdPaise: raw.free_delivery_threshold_paise,
      minimumOrderValuePaise: raw.min_order_paise,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
    };
  }
}

/**
 * TODO Mapper: Zepto Partner / Authorized API
 */
export class ZeptoPartnerPayloadMapper implements IPlatformPayloadMapper {
  mapProducts(raw: any, locationKey: string): PriceObservation[] {
    if (!raw || !Array.isArray(raw.products)) {
      throw new Error("Invalid Zepto payload: expected products array in authorized partner response");
    }
    return raw.products.map((p: any) => ({
      platform: "zepto" as PlatformId,
      productId: p.sku_id,
      title: p.title,
      brand: p.brand_name,
      variant: p.variant,
      unit: p.quantity_unit,
      price: typeof p.price_paise === "number" ? p.price_paise / 100 : p.selling_price,
      currency: "INR",
      availability: p.available ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    }));
  }

  mapPrice(raw: any, locationKey: string): PriceObservation | null {
    if (!raw) return null;
    return {
      platform: "zepto",
      productId: raw.sku_id,
      title: raw.title,
      price: typeof raw.price_paise === "number" ? raw.price_paise / 100 : raw.selling_price,
      currency: "INR",
      availability: raw.available ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    };
  }

  mapFees(raw: any, locationKey: string): PlatformFeeStructure | null {
    if (!raw) return null;
    return {
      platform: "zepto",
      locationKey,
      deliveryFeePaise: raw.delivery_paise,
      handlingFeePaise: raw.handling_paise,
      platformFeePaise: raw.platform_fee_paise,
      freeDeliveryThresholdPaise: raw.free_delivery_paise,
      minimumOrderValuePaise: raw.min_order_paise,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
    };
  }
}

/**
 * TODO Mapper: Swiggy Instamart Partner / Authorized API
 */
export class InstamartPartnerPayloadMapper implements IPlatformPayloadMapper {
  mapProducts(raw: any, locationKey: string): PriceObservation[] {
    if (!raw || !Array.isArray(raw.data?.items)) {
      throw new Error("Invalid Instamart payload: expected data.items in partner response");
    }
    return raw.data.items.map((it: any) => ({
      platform: "instamart" as PlatformId,
      productId: it.item_id,
      title: it.name,
      brand: it.brand,
      variant: it.variant,
      unit: it.pack_description,
      price: typeof it.price_paise === "number" ? it.price_paise / 100 : it.final_price,
      currency: "INR",
      availability: it.in_stock ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    }));
  }

  mapPrice(raw: any, locationKey: string): PriceObservation | null {
    if (!raw) return null;
    return {
      platform: "instamart",
      productId: raw.item_id,
      title: raw.name,
      price: typeof raw.price_paise === "number" ? raw.price_paise / 100 : raw.final_price,
      currency: "INR",
      availability: raw.in_stock ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    };
  }

  mapFees(raw: any, locationKey: string): PlatformFeeStructure | null {
    if (!raw) return null;
    return {
      platform: "instamart",
      locationKey,
      deliveryFeePaise: raw.delivery_fee_paise,
      handlingFeePaise: raw.surge_fee_paise,
      platformFeePaise: raw.platform_fee_paise,
      freeDeliveryThresholdPaise: raw.free_delivery_above_paise,
      minimumOrderValuePaise: raw.min_order_paise,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
    };
  }
}

/**
 * TODO Mapper: BigBasket Partner / Authorized API
 */
export class BigBasketPartnerPayloadMapper implements IPlatformPayloadMapper {
  mapProducts(raw: any, locationKey: string): PriceObservation[] {
    if (!raw || !Array.isArray(raw.tabs?.[0]?.product_info?.products)) {
      throw new Error("Invalid BigBasket payload: expected products array in partner feed");
    }
    return raw.tabs[0].product_info.products.map((p: any) => ({
      platform: "bigbasket" as PlatformId,
      productId: p.sku,
      title: p.p_desc,
      brand: p.p_brand,
      variant: p.p_variant,
      unit: p.w,
      price: typeof p.sp_paise === "number" ? p.sp_paise / 100 : parseFloat(p.sp),
      currency: "INR",
      availability: p.availability?.status === "IN_STOCK" ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    }));
  }

  mapPrice(raw: any, locationKey: string): PriceObservation | null {
    if (!raw) return null;
    return {
      platform: "bigbasket",
      productId: raw.sku,
      title: raw.p_desc,
      price: typeof raw.sp_paise === "number" ? raw.sp_paise / 100 : parseFloat(raw.sp),
      currency: "INR",
      availability: raw.availability?.status === "IN_STOCK" ? "available" : "unavailable",
      locationKey,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
      confidence: 1.0,
    };
  }

  mapFees(raw: any, locationKey: string): PlatformFeeStructure | null {
    if (!raw) return null;
    return {
      platform: "bigbasket",
      locationKey,
      deliveryFeePaise: raw.delivery_fee_paise,
      handlingFeePaise: raw.handling_fee_paise ?? null,
      platformFeePaise: raw.platform_fee_paise,
      freeDeliveryThresholdPaise: raw.free_delivery_paise,
      minimumOrderValuePaise: raw.min_order_paise,
      sourceType: "authorized_api",
      observedAt: new Date().toISOString(),
    };
  }
}

export class AuthorizedApiConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};
  private mapper: IPlatformPayloadMapper;
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private maxRetries: number;

  // Circuit Breaker State
  private cbState: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private successfulRequests = 0;
  private totalRequests = 0;
  private readonly failureThreshold = 3;
  private readonly recoveryTimeoutMs = 15000;

  constructor(
    public readonly platformId: PlatformId,
    config?: {
      baseUrl?: string;
      apiKey?: string;
      timeoutMs?: number;
      maxRetries?: number;
      mapper?: IPlatformPayloadMapper;
    }
  ) {
    this.baseUrl = config?.baseUrl || process.env[`${platformId.toUpperCase()}_API_BASE_URL`] || "";
    this.apiKey = config?.apiKey || process.env[`${platformId.toUpperCase()}_API_KEY`] || "";
    this.timeoutMs = config?.timeoutMs || 4000;
    this.maxRetries = config?.maxRetries ?? 2;

    if (config?.mapper) {
      this.mapper = config.mapper;
    } else {
      switch (platformId) {
        case "blinkit":
          this.mapper = new BlinkitPartnerPayloadMapper();
          break;
        case "zepto":
          this.mapper = new ZeptoPartnerPayloadMapper();
          break;
        case "instamart":
          this.mapper = new InstamartPartnerPayloadMapper();
          break;
        case "bigbasket":
          this.mapper = new BigBasketPartnerPayloadMapper();
          break;
      }
    }
  }

  getCapabilities(): PlatformCapabilities {
    const hasConfig = Boolean(this.baseUrl && this.baseUrl.trim() !== "");
    return {
      searchProducts: hasConfig,
      getPrices: hasConfig,
      getAvailability: hasConfig,
      getFees: hasConfig,
      createCart: false, // Non-negotiable: false until explicit written agreement
      supportsDeepLinks: PLATFORM_METADATA[this.platformId].defaultCapabilities.supportsDeepLinks,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  getCircuitBreakerMetrics(): CircuitBreakerMetrics {
    return {
      state: this.cbState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successfulRequests: this.successfulRequests,
      totalRequests: this.totalRequests,
    };
  }

  resetCircuitBreaker(): void {
    this.cbState = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  private checkCircuitBreaker(): void {
    const now = Date.now();
    if (this.cbState === "OPEN") {
      if (this.lastFailureTime && now - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.cbState = "HALF_OPEN";
      } else {
        throw new Error(
          `Circuit breaker for ${this.platformId} is OPEN. Fast-failing outbound request to protect downstream platform.`
        );
      }
    }
  }

  private recordSuccess(): void {
    this.successfulRequests++;
    this.totalRequests++;
    if (this.cbState === "HALF_OPEN") {
      this.cbState = "CLOSED";
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.totalRequests++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.cbState = "OPEN";
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    this.checkCircuitBreaker();

    if (this.faultConfig.forcedLatencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.faultConfig.forcedLatencyMs));
    }
    if (this.faultConfig.simulateTimeout) {
      this.recordFailure();
      throw new Error(`Connection timeout for ${this.platformId} partner endpoint`);
    }
    if (this.faultConfig.simulateUnavailable) {
      this.recordFailure();
      throw new Error(`Platform service ${this.platformId} temporarily unavailable (503)`);
    }

    let attempt = 0;
    let lastError: any;

    while (attempt <= this.maxRetries) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${this.timeoutMs}ms`)), this.timeoutMs)
          ),
        ]);
        this.recordSuccess();
        return result;
      } catch (err: any) {
        lastError = err;
        attempt++;
        if (attempt <= this.maxRetries) {
          const backoffDelay = Math.pow(2, attempt) * 100;
          await new Promise((res) => setTimeout(res, backoffDelay));
        }
      }
    }

    this.recordFailure();
    throw lastError;
  }

  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    if (!this.baseUrl) {
      throw new Error(
        `Authorized API connector unconfigured: missing ${this.platformId.toUpperCase()}_API_BASE_URL`
      );
    }

    return this.executeWithRetry(async () => {
      const url = `${this.baseUrl}/products/search?q=${encodeURIComponent(query)}&location=${encodeURIComponent(locationKey)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "GroqAI-AuthorizedConnector/1.0",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(`Rate limit exceeded (429) on ${this.platformId} partner API`);
        }
        throw new Error(`HTTP ${res.status} from ${this.platformId}: ${res.statusText}`);
      }

      const json = await res.json();
      return this.mapper.mapProducts(json, locationKey);
    });
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    if (!this.baseUrl) {
      throw new Error(
        `Authorized API connector unconfigured: missing ${this.platformId.toUpperCase()}_API_BASE_URL`
      );
    }

    return this.executeWithRetry(async () => {
      const url = `${this.baseUrl}/products/${encodeURIComponent(productId)}?location=${encodeURIComponent(locationKey)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${this.platformId}`);

      const json = await res.json();
      return this.mapper.mapPrice(json, locationKey);
    });
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    if (!this.baseUrl) {
      throw new Error(
        `Authorized API connector unconfigured: missing ${this.platformId.toUpperCase()}_API_BASE_URL`
      );
    }

    return this.executeWithRetry(async () => {
      const url = `${this.baseUrl}/fees?location=${encodeURIComponent(locationKey)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return this.mapper.mapFees(json, locationKey);
    });
  }
}
