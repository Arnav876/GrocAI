import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";

/**
 * BlinkitAdapter: Modular quick-commerce adapter for Blinkit (Zomato Quick Commerce).
 * Handles:
 * - Authorized partner API integrations when enterprise credentials are provided
 * - Supervised Playwright browser session when PLAYWRIGHT_ENABLED=true
 * - Local verified database observations
 * - Fallback to search links & merchant checklist
 */
export class BlinkitAdapter extends BaseGroceryPlatformAdapter {
  constructor(prisma: PrismaClient, initialMode?: IntegrationMode) {
    super("blinkit", prisma, initialMode);
  }

  getAdapterName(): string {
    return "BlinkitAdapter (Zomato Quick Commerce)";
  }
}
