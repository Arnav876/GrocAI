import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";
import { PlatformFeeStructure } from "@groqai/shared";

/**
 * BigBasketAdapter: Modular quick-commerce adapter for BigBasket (Tata Digital).
 * Handles:
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
