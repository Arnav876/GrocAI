import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";
import { PrismaClient } from "@prisma/client";

export class MockConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};

  constructor(
    public readonly platformId: PlatformId,
    private prisma: PrismaClient
  ) {}

  getCapabilities(): PlatformCapabilities {
    return {
      ...PLATFORM_METADATA[this.platformId].defaultCapabilities,
      createCart: false, // Honest capability: automated cart creation is false
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  private async applyFaults(): Promise<void> {
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

  async searchProducts(query: string, locationKey: string = "delhi_110001"): Promise<PriceObservation[]> {
    await this.applyFaults();

    const listings = await this.prisma.platformListing.findMany({
      where: {
        platform: this.platformId,
        product: {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      include: {
        product: true,
      },
    });

    return listings.map((l) => {
      const observedTime = this.faultConfig.simulateStale
        ? new Date(Date.now() - 12 * 60 * 60 * 1000)
        : l.lastObservedAt;

      return {
        platform: this.platformId,
        productId: l.productId,
        searchUrl: l.searchUrl || undefined,
        title: l.product.name,
        brand: l.product.brand,
        variant: l.product.variant,
        unit: l.product.packSize,
        price: l.currentPricePaise ? l.currentPricePaise / 100 : undefined,
        currency: "INR",
        availability: l.availability as any,
        locationKey,
        sourceType: "mock",
        observedAt: observedTime.toISOString(),
        confidence: l.confidence,
      };
    });
  }

  async getPrice(productId: string, locationKey: string = "delhi_110001"): Promise<PriceObservation | null> {
    await this.applyFaults();

    const listing = await this.prisma.platformListing.findUnique({
      where: {
        productId_platform: {
          productId,
          platform: this.platformId,
        },
      },
      include: {
        product: true,
      },
    });

    if (!listing) return null;

    const observedTime = this.faultConfig.simulateStale
      ? new Date(Date.now() - 12 * 60 * 60 * 1000)
      : listing.lastObservedAt;

    return {
      platform: this.platformId,
      productId: listing.productId,
      searchUrl: listing.searchUrl || undefined,
      title: listing.product.name,
      brand: listing.product.brand,
      variant: listing.product.variant,
      unit: listing.product.packSize,
      price: listing.currentPricePaise ? listing.currentPricePaise / 100 : undefined,
      currency: "INR",
      availability: listing.availability as any,
      locationKey,
      sourceType: "mock",
      observedAt: observedTime.toISOString(),
      confidence: listing.confidence,
    };
  }

  async getFees(locationKey: string = "delhi_110001"): Promise<PlatformFeeStructure | null> {
    await this.applyFaults();

    const rule = await this.prisma.platformFeeRule.findUnique({
      where: {
        platform_locationKey: {
          platform: this.platformId,
          locationKey,
        },
      },
    });

    if (!rule) return null;

    const handlingRange =
      rule.handlingFeeRangeMinPaise && rule.handlingFeeRangeMaxPaise
        ? { minPaise: rule.handlingFeeRangeMinPaise, maxPaise: rule.handlingFeeRangeMaxPaise }
        : null;

    return {
      platform: this.platformId,
      locationKey: rule.locationKey,
      deliveryFeePaise: rule.deliveryFeePaise,
      handlingFeePaise: handlingRange || rule.handlingFeePaise,
      platformFeePaise: rule.platformFeePaise,
      freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
      minimumOrderValuePaise: rule.minimumOrderValuePaise,
      sourceType: "mock",
      observedAt: rule.observedAt.toISOString(),
      notes: rule.notes,
    };
  }
}
