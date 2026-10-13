import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AuthorizedApiConnector } from "../connectors/authorizedApiConnector.js";
import { FallbackPlatformConnector } from "../connectors/fallbackHierarchy.js";
import { runOptimizationEngine, RequestedOptimizationItem, FeeRuleInput } from "../optimization/optimizer.js";
import { PlatformId } from "@groqai/shared";

describe("Phase 3 Failure & Resilience Tests", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("handles connector timeout by tripping retry logic and recording failure", async () => {
    const conn = new AuthorizedApiConnector("blinkit", {
      baseUrl: "https://api.blinkit.mock",
      apiKey: "test-key",
      timeoutMs: 100,
      maxRetries: 1,
    });
    conn.setFaultInjection({ simulateTimeout: true });

    await expect(conn.searchProducts("Milk", "delhi_110001")).rejects.toThrow(
      "timeout"
    );

    const metrics = conn.getCircuitBreakerMetrics();
    expect(metrics.failureCount).toBeGreaterThan(0);
  });

  it("trips circuit breaker to OPEN state after repeated failures to protect downstream merchant", async () => {
    const conn = new AuthorizedApiConnector("zepto", {
      baseUrl: "https://api.zepto.mock",
      apiKey: "test-key",
      timeoutMs: 50,
      maxRetries: 0,
    });
    conn.setFaultInjection({ simulateUnavailable: true });

    // Threshold is 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await conn.searchProducts("Bread", "delhi_110001");
      } catch (err) {
        // Expected failure
      }
    }

    const metrics = conn.getCircuitBreakerMetrics();
    expect(metrics.state).toBe("OPEN");

    // Fast-fail check without invoking network
    await expect(conn.searchProducts("Bread", "delhi_110001")).rejects.toThrow(
      "Circuit breaker for zepto is OPEN"
    );
  });

  it("gracefully falls back to mock/manual when authorized API fails", async () => {
    const fallback = new FallbackPlatformConnector("instamart", prisma, "authorized_api");
    fallback.setFaultInjection({ simulateTimeout: true });

    // Should not crash: catches failure and falls back down hierarchy to mock catalog
    const results = await fallback.searchProducts("Milk", "delhi_110001");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("partial platform failure: optimizer returns a valid plan from remaining available platforms with warnings", () => {
    const standardFeeRules: Record<PlatformId, FeeRuleInput> = {
      blinkit: { platform: "blinkit", deliveryFeePaise: 1500, handlingFeePaise: 400, platformFeePaise: 300, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 9900 },
      zepto: { platform: "zepto", deliveryFeePaise: 2500, handlingFeePaise: 500, platformFeePaise: 200, freeDeliveryThresholdPaise: 14900, minimumOrderValuePaise: 9900 },
      instamart: { platform: "instamart", deliveryFeePaise: 3000, handlingFeePaise: 500, platformFeePaise: 400, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 10000 },
      bigbasket: { platform: "bigbasket", deliveryFeePaise: 3000, handlingFeePaise: null, platformFeePaise: 300, freeDeliveryThresholdPaise: 25000, minimumOrderValuePaise: 15000 },
    };

    // Blinkit and Zepto are completely UNAVAILABLE (service failure / timeout)
    // Instamart and BigBasket are HEALTHY
    const items: RequestedOptimizationItem[] = [
      {
        id: "item-partial-1",
        query: "Wheat Flour",
        quantity: 1,
        unit: "pack",
        matchedTitle: "Wheat Flour 5kg",
        brand: "Aashirvaad",
        variant: "Atta",
        packSize: "5 kg",
        listings: {
          blinkit: { platform: "blinkit", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: 24000, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: 23500, availability: "available", isStale: false, confidence: 1, sourceType: "mock" },
        },
      },
    ];

    const result = runOptimizationEngine({
      items,
      feeRules: standardFeeRules,
    });

    expect(result.options.length).toBeGreaterThan(0);
    const chosenPlan = result.options[0];
    // Plan must be fulfilled by either Instamart or BigBasket
    expect(chosenPlan.platforms.some((p) => p === "instamart" || p === "bigbasket")).toBe(true);
    expect(chosenPlan.platforms.includes("blinkit")).toBe(false);
    expect(chosenPlan.platforms.includes("zepto")).toBe(false);
    expect(chosenPlan.isFeasible).toBe(true);
  });
});
