import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";
import { PriceObservation } from "@groqai/shared";
import { searchZeptoLive } from "../../ingestion/platforms/zepto.js";

/**
 * ZeptoAdapter: Modular quick-commerce adapter for Zepto (KiranaKart Technologies).
 * Handles:
 * - Live real-time search with multi-tier fallback (Tier 1 Obscura CDP Interception -> Tier 2 DOM Extraction -> Tier 3 DB)
 * - Authorized partner API integrations when enterprise credentials are provided
 * - Supervised Playwright browser session when PLAYWRIGHT_ENABLED=true
 * - Local verified database observations
 * - Fallback to search links & merchant checklist
 */
export class ZeptoAdapter extends BaseGroceryPlatformAdapter {
  constructor(prisma: PrismaClient, initialMode?: IntegrationMode) {
    super("zepto", prisma, initialMode);
  }

  getAdapterName(): string {
    return "ZeptoAdapter (KiranaKart Technologies)";
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

        const liveObs = await searchZeptoLive(query, pincode);
        if (liveObs && liveObs.length > 0) {
          this.lastSuccessfulFetchTime = new Date().toISOString();
          return liveObs.map((obs) =>
            this.enrichObservation({
              platform: "zepto",
              productId: obs.productUrl ? obs.productUrl.split("/pvid/")[1] : undefined,
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
          `[ZeptoAdapter] Live search failed (${err.message}). Falling back to standard hierarchy.`
        );
      }
    }

    return super.searchProducts(query, locationKey);
  }
}
