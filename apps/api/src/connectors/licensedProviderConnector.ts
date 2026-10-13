import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";

export interface LicensedProviderAgreement {
  providerName: string;
  contractStatus: "active" | "negotiating" | "expired" | "stub";
  attributionNotice: string;
  dataRetentionMaxDays: number;
  refreshFrequencyHours: number;
  coverageGeographies: string[];
}

export class LicensedProviderConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};

  public readonly agreement: LicensedProviderAgreement = {
    providerName: "QuickCommerce Feed Partner Network (Enterprise Stub)",
    contractStatus: "stub",
    attributionNotice:
      "Catalog feeds provided under commercial evaluation agreement. All rights reserved by respective merchant brands.",
    dataRetentionMaxDays: 30,
    refreshFrequencyHours: 4,
    coverageGeographies: ["Delhi-NCR", "Bengaluru", "Mumbai"],
  };

  constructor(public readonly platformId: PlatformId) {}

  getCapabilities(): PlatformCapabilities {
    const isReady = this.agreement.contractStatus === "active";
    return {
      searchProducts: isReady,
      getPrices: isReady,
      getAvailability: isReady,
      getFees: isReady,
      createCart: false, // Third-party data provider feeds do not include cart injection
      supportsDeepLinks: PLATFORM_METADATA[this.platformId].defaultCapabilities.supportsDeepLinks,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    if (this.agreement.contractStatus !== "active") {
      throw new Error(
        `Licensed provider integration for ${this.platformId} is in status '${this.agreement.contractStatus}'. Partner feed agreement pending.`
      );
    }
    return [];
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    return null;
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    return null;
  }
}
