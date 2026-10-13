import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";
import { PrismaClient } from "@prisma/client";

export class ManualPriceConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};

  constructor(
    public readonly platformId: PlatformId,
    private prisma: PrismaClient
  ) {}

  getCapabilities(): PlatformCapabilities {
    return {
      searchProducts: true,
      getPrices: true,
      getAvailability: true,
      getFees: true,
      createCart: false, // Manual prices never automate cart checkout
      supportsDeepLinks: PLATFORM_METADATA[this.platformId].defaultCapabilities.supportsDeepLinks,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  async searchProducts(query: string, locationKey: string = "delhi_110001"): Promise<PriceObservation[]> {
    if (this.faultConfig.simulateTimeout) {
      throw new Error(`Timeout accessing manual store entries for ${this.platformId}`);
    }

    const observations = await this.prisma.priceObservation.findMany({
      where: {
        platform: this.platformId,
        rawTitle: { contains: query, mode: "insensitive" },
        locationKey,
      },
      take: 20,
    });

    const now = Date.now();
    const maxTtlMs = 24 * 60 * 60 * 1000; // 24-hour expiry for manual entries

    return observations.map((obs) => {
      const isExpired = now - obs.observedAt.getTime() > maxTtlMs;
      return {
        platform: this.platformId,
        productId: obs.productId || undefined,
        title: obs.rawTitle,
        price: obs.pricePaise ? obs.pricePaise / 100 : undefined,
        currency: "INR",
        availability: isExpired ? "unknown" : (obs.availability as any),
        locationKey,
        sourceType: "manual",
        observedAt: obs.observedAt.toISOString(),
        confidence: isExpired ? 0.4 : 0.8,
        notes: [
          "Indicative community/manual observation - verify exact price in merchant app.",
          ...(isExpired ? ["Observed over 24h ago; requires manual verification."] : []),
          ...obs.notes,
        ],
      };
    });
  }

  async getPrice(productId: string, locationKey: string = "delhi_110001"): Promise<PriceObservation | null> {
    const obs = await this.prisma.priceObservation.findFirst({
      where: {
        platform: this.platformId,
        productId,
        locationKey,
      },
      orderBy: { observedAt: "desc" },
    });

    if (!obs) return null;

    const maxTtlMs = 24 * 60 * 60 * 1000;
    const isExpired = Date.now() - obs.observedAt.getTime() > maxTtlMs;

    return {
      platform: this.platformId,
      productId: obs.productId || undefined,
      title: obs.rawTitle,
      price: obs.pricePaise ? obs.pricePaise / 100 : undefined,
      currency: "INR",
      availability: isExpired ? "unknown" : (obs.availability as any),
      locationKey,
      sourceType: "manual",
      observedAt: obs.observedAt.toISOString(),
      confidence: isExpired ? 0.4 : 0.8,
      notes: [
        "Indicative price: verify in merchant app",
        ...(isExpired ? ["Entry expired (>24h old)."] : []),
      ],
    };
  }

  async getFees(locationKey: string = "delhi_110001"): Promise<PlatformFeeStructure | null> {
    const rule = await this.prisma.platformFeeRule.findUnique({
      where: {
        platform_locationKey: {
          platform: this.platformId,
          locationKey,
        },
      },
    });

    if (!rule) return null;

    return {
      platform: this.platformId,
      locationKey: rule.locationKey,
      deliveryFeePaise: rule.deliveryFeePaise,
      handlingFeePaise: rule.handlingFeePaise,
      platformFeePaise: rule.platformFeePaise,
      freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
      minimumOrderValuePaise: rule.minimumOrderValuePaise,
      sourceType: "manual",
      observedAt: rule.observedAt.toISOString(),
      notes: ["Indicative published merchant fee structure."],
    };
  }
}
