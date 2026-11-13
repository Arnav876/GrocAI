import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";
import { PlatformFeeStructure, PriceObservation } from "@groqai/shared";
import { searchBigBasketLive } from "../../ingestion/platforms/bigbasket.js";

/**
 * BigBasketAdapter: Modular quick-commerce adapter for BigBasket (Tata Digital).
 * Handles:
 * - Real-time live search with Akamai TLS session warm-up + Base64 location injection
 * - Authorized partner API integrations when enterprise credentials are provided
 * - Supervised Playwright browser session when PLAYWRIGHT_ENABLED=true
 * - Local verified database observations
 * - Dynamic handling fee range preservation (₹5 - ₹15 range, never defaulted to 0)
 * - Fallback to search links & merchant checklist
 */
export class BigBasketAdapter extends BaseGroceryPlatformAdapter {
  constructor(prisma: PrismaClient, initialMode?: IntegrationMode) {
    super("bigbasket", prisma, initialMode);
  }

  getAdapterName(): string {
    return "BigBasketAdapter (Tata Digital / Supermarket Grocery Supplies)";
  }

  override async searchProducts(
    query: string,
    locationKey: string
  ): Promise<PriceObservation[]> {
    await this.applyFaults();

    const mode = this.getMode();
    if (mode === "live") {
      try {
        const pincode = locationKey.includes("_")
          ? locationKey.split("_")[1]
          : /^[1-9][0-9]{5}$/.test(locationKey)
          ? locationKey
          : "560064";

        const liveObs = await searchBigBasketLive(query, pincode);
        if (liveObs && liveObs.length > 0) {
          this.lastSuccessfulFetchTime = new Date().toISOString();
          return liveObs.map((obs) =>
            this.enrichObservation({
              platform: "bigbasket",
              productId: obs.productUrl ? obs.productUrl.split("/pd/")[1]?.split("/")[0] : undefined,
              title: obs.name,
              brand: obs.brand || undefined,
              packSize: obs.quantity,
              price: obs.pricePaise / 100,
              pricePaise: obs.pricePaise,
              originalPrice: obs.originalPricePaise ? obs.originalPricePaise / 100 : undefined,
              originalPricePaise: obs.originalPricePaise,
              discountPercentage: obs.discountPercentage,
              availability: obs.availabilityStatus === "IN_STOCK" ? "available" : "unavailable",
              productUrl: obs.productUrl,
              imageUrl: obs.imageUrl || undefined,
              locationKey,
              pincode: obs.pincode,
              sourceType: "permitted_page",
              verificationStatus: "live_verified",
              observedAt: obs.observedAt,
              confidence: 1.0,
            })
          );
        }
      } catch (err: any) {
        console.warn(
          `[BigBasketAdapter] Live search failed (${err.message}). Falling back to standard hierarchy.`
        );
      }
    }

    return super.searchProducts(query, locationKey);
  }

  override async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    const fees = await super.getFees(locationKey);
    if (!fees) return null;

    // Invariant: BigBasket handling fee is dynamic and unknown at catalog time.
    // Preserve dynamic range { minPaise: 500, maxPaise: 1500 } and never collapse to 0.
    if (fees.handlingFeePaise === null || typeof fees.handlingFeePaise === "number") {
      return {
        ...fees,
        handlingFeePaise: { minPaise: 500, maxPaise: 1500 },
        notes: [
          ...(fees.notes || []),
          "Handling fee is dynamic based on slot and location (modeled as ₹5 - ₹15 range).",
        ],
      };
    }

    return fees;
  }
}
