import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";

export class LinksChecklistConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};

  constructor(public readonly platformId: PlatformId) {}

  getCapabilities(): PlatformCapabilities {
    return {
      searchProducts: false,
      getPrices: false,
      getAvailability: false,
      getFees: false,
      createCart: false,
      supportsDeepLinks: PLATFORM_METADATA[this.platformId].defaultCapabilities.supportsDeepLinks,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  buildSearchLink(query: string): string {
    const meta = PLATFORM_METADATA[this.platformId];
    return `${meta.searchBaseUrl}${encodeURIComponent(query)}`;
  }

  buildProductDeepLink(productId?: string, query?: string): { url: string; isDeepLink: boolean } {
    const meta = PLATFORM_METADATA[this.platformId];
    if (productId && meta.defaultCapabilities.supportsDeepLinks) {
      if (this.platformId === "blinkit") {
        return { url: `https://blinkit.com/prn/${encodeURIComponent(productId)}`, isDeepLink: true };
      }
      if (this.platformId === "zepto") {
        return { url: `https://www.zeptonow.com/pn/${encodeURIComponent(productId)}`, isDeepLink: true };
      }
      if (this.platformId === "bigbasket") {
        return { url: `https://www.bigbasket.com/pd/${encodeURIComponent(productId)}`, isDeepLink: true };
      }
    }
    return {
      url: this.buildSearchLink(query || productId || "grocery"),
      isDeepLink: false,
    };
  }

  generateChecklist(
    items: { title: string; quantity: number; unit?: string; estimatedPriceRupees?: number }[]
  ): string {
    const meta = PLATFORM_METADATA[this.platformId];
    const lines = [
      `🛒 ${meta.name} Manual Shopping Checklist`,
      `========================================`,
      `Notice: Payment & checkout happen directly on ${meta.name}. GroqAI is not affiliated.`,
      `Website: ${meta.websiteUrl}`,
      `----------------------------------------`,
      ...items.map((it, idx) => {
        const est = it.estimatedPriceRupees ? ` (~₹${it.estimatedPriceRupees})` : "";
        const u = it.unit ? ` ${it.unit}` : "";
        return `${idx + 1}. [ ] ${it.title} x ${it.quantity}${u}${est}`;
      }),
      `========================================`,
    ];
    return lines.join("\n");
  }

  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    // Links checklist connector does not read prices directly
    return [
      {
        platform: this.platformId,
        title: query,
        searchUrl: this.buildSearchLink(query),
        currency: "INR",
        availability: "unknown",
        locationKey,
        sourceType: "manual",
        observedAt: new Date().toISOString(),
        confidence: 0.5,
        notes: [
          `Search link generated for ${PLATFORM_METADATA[this.platformId].name}. Live price verification required in app.`,
        ],
      },
    ];
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    const linkInfo = this.buildProductDeepLink(productId);
    return {
      platform: this.platformId,
      productId,
      title: productId,
      productUrl: linkInfo.isDeepLink ? linkInfo.url : undefined,
      searchUrl: !linkInfo.isDeepLink ? linkInfo.url : undefined,
      currency: "INR",
      availability: "unknown",
      locationKey,
      sourceType: "manual",
      observedAt: new Date().toISOString(),
      confidence: 0.5,
      notes: ["Search/deep link generated with zero API access."],
    };
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    return null; // Fees unknown with zero API access
  }
}
