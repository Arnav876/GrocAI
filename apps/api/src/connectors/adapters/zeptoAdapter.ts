import { PrismaClient } from "@prisma/client";
import { BaseGroceryPlatformAdapter } from "./baseAdapter.js";
import { IntegrationMode } from "../fallbackHierarchy.js";

/**
 * ZeptoAdapter: Modular quick-commerce adapter for Zepto (KiranaKart Technologies).
 * Handles:
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
}
