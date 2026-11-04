import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";

/**
 * InstamartAdapter: Modular quick-commerce adapter for Swiggy Instamart (Bundl Technologies).
 * Handles:
 * - Authorized partner API integrations when enterprise credentials are provided
 * - Supervised Playwright browser session when PLAYWRIGHT_ENABLED=true
 * - Local verified database observations
 * - Fallback to search links & merchant checklist
 */
export class InstamartAdapter extends BaseGroceryPlatformAdapter {
  constructor(prisma: PrismaClient, initialMode?: IntegrationMode) {
    super("instamart", prisma, initialMode);
  }

  getAdapterName(): string {
    return "InstamartAdapter (Swiggy Instamart)";
  }
}
