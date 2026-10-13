import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";
import { MockConnector } from "./mockConnector.js";
import { AuthorizedApiConnector } from "./authorizedApiConnector.js";
import { ManualPriceConnector } from "./manualPriceConnector.js";
import { LinksChecklistConnector } from "./linksChecklistConnector.js";
import { PlaywrightAssistedConnector } from "./playwrightAssistedConnector.js";
import { LicensedProviderConnector } from "./licensedProviderConnector.js";
import { PrismaClient } from "@prisma/client";

export type IntegrationMode =
  | "mock"
  | "manual"
  | "partner_feed"
  | "authorized_api"
  | "permitted_page"
  | "links_only";

export class FallbackPlatformConnector implements IPlatformConnector {
  private currentMode: IntegrationMode;
  private mockConnector: MockConnector;
  private authorizedConnector: AuthorizedApiConnector;
  private manualConnector: ManualPriceConnector;
  private linksConnector: LinksChecklistConnector;
  private playwrightConnector: PlaywrightAssistedConnector;
  private licensedConnector: LicensedProviderConnector;
  private faultConfig: FaultInjectionConfig = {};

  constructor(
    public readonly platformId: PlatformId,
    private prisma: PrismaClient,
    initialMode?: IntegrationMode
  ) {
    const envMode = (
      process.env[`${platformId.toUpperCase()}_INTEGRATION_MODE`] || "mock"
    ).toLowerCase() as IntegrationMode;

    this.currentMode = initialMode || envMode || "mock";
    this.mockConnector = new MockConnector(platformId, prisma);
    this.authorizedConnector = new AuthorizedApiConnector(platformId);
    this.manualConnector = new ManualPriceConnector(platformId, prisma);
    this.linksConnector = new LinksChecklistConnector(platformId);
    this.playwrightConnector = new PlaywrightAssistedConnector(platformId);
    this.licensedConnector = new LicensedProviderConnector(platformId);
  }

  getMode(): IntegrationMode {
    return this.currentMode;
  }

  setMode(mode: IntegrationMode): void {
    this.currentMode = mode;
  }

  getCapabilities(): PlatformCapabilities {
    const activeAdapter = this.getActiveAdapter();
    const caps = activeAdapter.getCapabilities();
    // Non-negotiable rule 9: cart creation is NEVER simulated as true
    return {
      ...caps,
      createCart: false,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
    this.mockConnector.setFaultInjection(config);
    this.authorizedConnector.setFaultInjection(config);
    this.manualConnector.setFaultInjection(config);
    this.linksConnector.setFaultInjection(config);
    this.playwrightConnector.setFaultInjection(config);
    this.licensedConnector.setFaultInjection(config);
  }

  getActiveAdapter(): IPlatformConnector {
    switch (this.currentMode) {
      case "authorized_api":
      case "partner_feed":
        return this.authorizedConnector;
      case "permitted_page":
        return this.playwrightConnector.isEnabled()
          ? this.playwrightConnector
          : this.linksConnector;
      case "manual":
        return this.manualConnector;
      case "links_only":
        return this.linksConnector;
      case "mock":
      default:
        return this.mockConnector;
    }
  }

  getCircuitBreakerMetrics() {
    return this.authorizedConnector.getCircuitBreakerMetrics();
  }

  /**
   * Runtime Fallback Hierarchy:
   * 1. Authorized API / Partner Feed
   * 2. Permitted page data (supervised Playwright)
   * 3. Manual price connector
   * 4. Mock catalog
   * 5. Links + Checklist (always succeeds with zero API access)
   */
  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    if (this.currentMode === "authorized_api" || this.currentMode === "partner_feed") {
      try {
        return await this.authorizedConnector.searchProducts(query, locationKey);
      } catch (err: any) {
        console.warn(
          `[GroqAI Fallback] ${this.platformId} authorized connector failed (${err.message}). Falling back to manual/mock.`
        );
        this.mockConnector.setFaultInjection({});
        return this.mockConnector.searchProducts(query, locationKey);
      }
    }

    if (this.currentMode === "permitted_page") {
      try {
        if (this.playwrightConnector.isEnabled()) {
          return await this.playwrightConnector.searchProducts(query, locationKey);
        }
      } catch (err: any) {
        console.warn(
          `[GroqAI Fallback] ${this.platformId} browser connector failed. Falling back to search links.`
        );
      }
      return this.linksConnector.searchProducts(query, locationKey);
    }

    if (this.currentMode === "manual") {
      return this.manualConnector.searchProducts(query, locationKey);
    }

    if (this.currentMode === "links_only") {
      return this.linksConnector.searchProducts(query, locationKey);
    }

    return this.mockConnector.searchProducts(query, locationKey);
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    if (this.currentMode === "authorized_api" || this.currentMode === "partner_feed") {
      try {
        return await this.authorizedConnector.getPrice(productId, locationKey);
      } catch (err) {
        this.mockConnector.setFaultInjection({});
        return this.mockConnector.getPrice(productId, locationKey);
      }
    }

    if (this.currentMode === "manual") {
      return this.manualConnector.getPrice(productId, locationKey);
    }

    if (this.currentMode === "links_only") {
      return this.linksConnector.getPrice(productId, locationKey);
    }

    return this.mockConnector.getPrice(productId, locationKey);
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    if (this.currentMode === "authorized_api" || this.currentMode === "partner_feed") {
      try {
        return await this.authorizedConnector.getFees(locationKey);
      } catch (err) {
        this.mockConnector.setFaultInjection({});
        return this.mockConnector.getFees(locationKey);
      }
    }

    if (this.currentMode === "manual") {
      return this.manualConnector.getFees(locationKey);
    }

    if (this.currentMode === "links_only") {
      return this.linksConnector.getFees(locationKey);
    }

    return this.mockConnector.getFees(locationKey);
  }
}
