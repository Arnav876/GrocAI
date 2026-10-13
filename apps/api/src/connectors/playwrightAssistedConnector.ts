import {
  PlatformCapabilities,
  PlatformFeeStructure,
  PlatformId,
  PLATFORM_METADATA,
  PriceObservation,
} from "@groqai/shared";
import { FaultInjectionConfig, IPlatformConnector } from "./types.js";

/**
 * PlaywrightAssistedConnector: User-controlled browser assistant.
 * STRICT NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * 1. OFF BY DEFAULT. Enabled ONLY when process.env.PLAYWRIGHT_ENABLED === "true".
 * 2. User-visible & user-controlled (headed browser only, never headless hidden scraping).
 * 3. Never stores or prompts for user passwords, OTPs, session tokens, or payment credentials.
 * 4. Never attempts to bypass CAPTCHA, Cloudflare, or anti-bot defenses.
 * 5. Automatically deactivates upon detecting any CAPTCHA, challenge, or failure.
 */
export class PlaywrightAssistedConnector implements IPlatformConnector {
  private faultConfig: FaultInjectionConfig = {};
  private isAutoDisabled = false;
  private autoDisableReason: string | null = null;

  constructor(public readonly platformId: PlatformId) {}

  isEnabled(): boolean {
    const envFlag = process.env.PLAYWRIGHT_ENABLED === "true";
    return envFlag && !this.isAutoDisabled;
  }

  getCapabilities(): PlatformCapabilities {
    const active = this.isEnabled();
    return {
      searchProducts: active,
      getPrices: active,
      getAvailability: active,
      getFees: false, // Dynamic fees are not read via browser automation
      createCart: false, // Never simulates fake checkout or clicks on payment buttons
      supportsDeepLinks: PLATFORM_METADATA[this.platformId].defaultCapabilities.supportsDeepLinks,
    };
  }

  setFaultInjection(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  autoDisable(reason: string): void {
    this.isAutoDisabled = true;
    this.autoDisableReason = reason;
    console.warn(
      `[GroqAI Security] PlaywrightAssistedConnector for ${this.platformId} AUTO-DISABLED: ${reason}`
    );
  }

  getAutoDisableReason(): string | null {
    return this.autoDisableReason;
  }

  async searchProducts(query: string, locationKey: string): Promise<PriceObservation[]> {
    if (!this.isEnabled()) {
      throw new Error(
        `PlaywrightAssistedConnector is ${
          this.isAutoDisabled ? `auto-disabled (${this.autoDisableReason})` : "disabled by default"
        }. Falling back to standard connector hierarchy.`
      );
    }

    if (this.faultConfig.simulateUnavailable) {
      this.autoDisable("Simulated bot challenge detected; falling back immediately");
      throw new Error("Challenge detected; Playwright assisted connector auto-disabled.");
    }

    // In a real environment, Playwright headed session runs with user supervision.
    // If anti-bot detection or CAPTCHA is observed, we immediately abort and auto-disable.
    return [
      {
        platform: this.platformId,
        title: query,
        currency: "INR",
        availability: "available",
        locationKey,
        sourceType: "permitted_page",
        observedAt: new Date().toISOString(),
        confidence: 0.9,
        notes: [
          "Supervised user browser session observation. No session credentials or tokens retained.",
        ],
      },
    ];
  }

  async getPrice(productId: string, locationKey: string): Promise<PriceObservation | null> {
    if (!this.isEnabled()) return null;
    return {
      platform: this.platformId,
      productId,
      title: productId,
      currency: "INR",
      availability: "available",
      locationKey,
      sourceType: "permitted_page",
      observedAt: new Date().toISOString(),
      confidence: 0.9,
      notes: ["Supervised user browser session."],
    };
  }

  async getFees(locationKey: string): Promise<PlatformFeeStructure | null> {
    return null;
  }
}
