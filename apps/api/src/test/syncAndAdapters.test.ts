import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import { ConnectorRegistry } from "../connectors/registry.js";
import { GrocerySyncService } from "../services/grocerySyncService.js";
import {
  BlinkitAdapter,
  ZeptoAdapter,
  InstamartAdapter,
  BigBasketAdapter,
} from "../connectors/adapters/index.js";
import {
  calculateNormalizedUnitPrice,
  determinePriceVerificationStatus,
  paiseToRupees,
} from "@groqai/shared";

describe("Real-Time Grocery Data Integration & Adapters", () => {
  let prisma: PrismaClient;
  let registry: ConnectorRegistry;
  let syncService: GrocerySyncService;
  let app: any;
  const refreshJobIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient();
    registry = new ConnectorRegistry(prisma);
    syncService = new GrocerySyncService(prisma, registry, {
      cacheTtlMs: 60 * 1000, // 1 minute in test
      staleTtlMs: 5 * 60 * 1000,
    });
    app = createServer(prisma);
  });

  afterAll(async () => {
    if (refreshJobIds.length > 0) {
      await prisma.scrapeJob.deleteMany({ where: { id: { in: refreshJobIds } } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("Platform Adapters & Field Capture", () => {
    it("all 4 adapters report honest capabilities with createCart strictly false", () => {
      const blinkit = new BlinkitAdapter(prisma);
      const zepto = new ZeptoAdapter(prisma);
      const instamart = new InstamartAdapter(prisma);
      const bigbasket = new BigBasketAdapter(prisma);

      expect(blinkit.getCapabilities().createCart).toBe(false);
      expect(zepto.getCapabilities().createCart).toBe(false);
      expect(instamart.getCapabilities().createCart).toBe(false);
      expect(bigbasket.getCapabilities().createCart).toBe(false);
    });

    it("BigBasketAdapter preserves dynamic handling fee range and never defaults to 0", async () => {
      const bigbasket = new BigBasketAdapter(prisma);
      const fees = await bigbasket.getFees("delhi_110001");
      expect(fees).not.toBeNull();
      expect(fees?.handlingFeePaise).toEqual({ minPaise: 500, maxPaise: 1500 });
      expect(fees?.handlingFeePaise).not.toBe(0);
    });

    it("enriches observations with all 14 mandatory fields and normalized unit price", () => {
      const blinkit = new BlinkitAdapter(prisma);
      const enriched = blinkit.enrichObservation({
        title: "Amul Taaza Toned Milk",
        brand: "Amul",
        variant: "Toned",
        unit: "500 ml",
        pricePaise: 3300,
        originalPricePaise: 3500,
        availability: "available",
        locationKey: "delhi_110001",
        sourceType: "authorized_api",
        observedAt: new Date().toISOString(),
      });

      // 1. Product name
      expect(enriched.title).toBe("Amul Taaza Toned Milk");
      // 2. Brand
      expect(enriched.brand).toBe("Amul");
      // 3. Quantity or package size
      expect(enriched.unit).toBe("500 ml");
      // 4. Price (paise & rupees)
      expect(enriched.pricePaise).toBe(3300);
      expect(enriched.price).toBe(33);
      // 5. Original price (MRP)
      expect(enriched.originalPricePaise).toBe(3500);
      expect(enriched.originalPrice).toBe(35);
      // 6. Discount
      expect(enriched.discountPercentage).toBe(6);
      // 7. Availability status
      expect(enriched.availability).toBe("available");
      // 8. Platform name
      expect(enriched.platform).toBe("blinkit");
      // 9. Product/Search URL
      expect(enriched.searchUrl).toContain("blinkit.com");
      // 10. Serviceable area
      expect(enriched.serviceableArea).toBe("Central Delhi");
      // 11. Last successful fetch timestamp
      expect(enriched.observedAt).toBeDefined();
      // 12. Data source
      expect(enriched.sourceType).toBe("authorized_api");
      // 13. Price verification status
      expect(enriched.verificationStatus).toBe("live_verified");
      // 14. Normalized unit price (₹66/L for 500ml @ ₹33)
      expect(enriched.normalizedUnitPrice).toBeDefined();
      expect(enriched.normalizedUnitPrice?.pricePerUnitPaise).toBe(6600);
      expect(enriched.normalizedUnitPrice?.displayUnitPrice).toBe("₹66.00 / L");
    });
  });

  describe("GrocerySyncService Resilient Cache & Sync Logic", () => {
    it("synchronizes product across platforms and calculates normalized unit prices", async () => {
      const products = await prisma.product.findMany({ take: 1 });
      const target = products[0];

      const result = await syncService.syncProduct(target.id, "delhi_110001", { forceRefresh: true });
      expect(result.productId).toBe(target.id);
      expect(result.productName).toBe(target.name);
      expect(Object.keys(result.platforms).length).toBe(4);
      expect(result.refreshedPlatforms.length).toBeGreaterThan(0);
    });

    it("never overwrites valid cached data with failed adapter responses", async () => {
      const products = await prisma.product.findMany({ take: 1, include: { listings: true } });
      const target = products[0];
      const initialBlinkitPrice = target.listings.find((l) => l.platform === "blinkit")?.currentPricePaise;
      expect(initialBlinkitPrice).toBeDefined();

      // Inject simulated outage on Blinkit adapter
      const blinkitAdapter = registry.getAdapter("blinkit");
      blinkitAdapter.setFaultInjection({ simulateUnavailable: true });

      // Run sync with Blinkit failing
      const syncResult = await syncService.syncProduct(target.id, "delhi_110001", { forceRefresh: true });

      // Verify failure handling
      expect(syncResult.platforms.blinkit.status).toBe("failed");
      // CRITICAL INVARIANT: price is NOT set to null or 0, existing valid cached price is preserved
      expect(syncResult.platforms.blinkit.pricePaise).toBe(initialBlinkitPrice);
      expect(syncResult.platforms.blinkit.verificationStatus).toBe("stale");
      expect(syncResult.platforms.blinkit.error).toContain("Live refresh failed");

      // Verify that database was NOT corrupted with null or 0
      const dbListing = await prisma.platformListing.findUnique({
        where: { productId_platform: { productId: target.id, platform: "blinkit" } },
      });
      expect(dbListing?.currentPricePaise).toBe(initialBlinkitPrice);

      // Clean up fault injection
      blinkitAdapter.setFaultInjection({});
    });

    it("handles partial provider failures without failing entire comparison", async () => {
      const products = await prisma.product.findMany({ take: 1 });
      const target = products[0];

      // Simulate Zepto timeout
      const zeptoAdapter = registry.getAdapter("zepto");
      zeptoAdapter.setFaultInjection({ simulateTimeout: true });

      const syncResult = await syncService.syncProduct(target.id, "delhi_110001", { forceRefresh: true });

      // Zepto failed, but Blinkit, Instamart, BigBasket succeed
      expect(syncResult.platforms.zepto.status).toBe("failed");
      expect(syncResult.platforms.blinkit.status).toBe("success");
      expect(syncResult.platforms.instamart.status).toBe("success");
      expect(syncResult.platforms.bigbasket.status).toBe("success");

      // Clean up fault injection
      zeptoAdapter.setFaultInjection({});
    });
  });

  describe("API Endpoints for Real-Time Sync & Freshness", () => {
    it("POST /api/products/:id/refresh queues live ingestion jobs instead of faking a sync", async () => {
      const products = await prisma.product.findMany({ take: 1 });
      const target = products[0];

      const res = await request(app)
        .post(`/api/products/${target.id}/refresh`)
        .send({ pincode: "110001" });

      expect(res.status).toBe(200);
      expect(res.headers["x-ingestion-status"]).toBe("queued");
      expect(res.body).toHaveProperty("product");
      expect(res.body.product.id).toBe(target.id);
      expect(res.body.product).toHaveProperty("normalizedUnitPrice");

      // The endpoint must be honest: it returns a queued refresh, never a
      // synchronous syncResult that pretends live prices were verified.
      expect(res.body).not.toHaveProperty("syncResult");
      expect(res.body.refresh.status).toBe("queued");
      expect(res.body.refresh.platforms).toEqual(["blinkit", "zepto", "bigbasket"]);
      expect(res.body.refresh.queries).toEqual([target.name]);
      expect(res.body.refresh.jobIds).toHaveLength(3);
      refreshJobIds.push(...res.body.refresh.jobIds);
    });

    it("POST /api/products/sync batch-synchronizes products", async () => {
      const products = await prisma.product.findMany({ take: 2 });
      const ids = products.map((p) => p.id);

      const res = await request(app)
        .post("/api/products/sync")
        .send({ productIds: ids, pincode: "110001" });

      expect(res.status).toBe(200);
      expect(res.body.totalSynced).toBe(2);
      expect(Array.isArray(res.body.outcomes)).toBe(true);
      expect(res.body.outcomes.length).toBe(2);
    });

    it("GET /api/sync/status reports adapter telemetry and cache freshness counts", async () => {
      const res = await request(app).get("/api/sync/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("adapters");
      expect(res.body).toHaveProperty("cache");
      expect(res.body.adapters.length).toBe(4);
      expect(res.body.cache.totalListings).toBeGreaterThan(0);
    });

    it("GET /api/products/search returns normalized unit prices and verification statuses", async () => {
      const res = await request(app).get("/api/products/search?q=milk");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      const item = res.body[0];
      expect(item).toHaveProperty("normalizedUnitPrice");
      expect(item.platformPrices.blinkit).toHaveProperty("verificationStatus");
      expect(item.platformPrices.blinkit).toHaveProperty("normalizedUnitPrice");
      expect(item.platformPrices.blinkit).toHaveProperty("serviceableArea");
    });
  });
});
