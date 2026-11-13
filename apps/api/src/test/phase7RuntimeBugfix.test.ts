import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import { OptimizationService } from "../services/optimizationService.js";
import { SEED_FEE_RULES, SEED_CANONICAL_PRODUCTS } from "../fixtures/seedFixtures.js";
import { SUPPORTED_PLATFORMS, assertIntegerPaise } from "@groqai/shared";

describe("Phase 7 — Runtime Bugfix, Cart Optimization Stabilization & Pincode 560064 Defaulting", () => {
  const prisma = new PrismaClient();
  const service = new OptimizationService(prisma);
  const app = createServer(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Pincode 560064 (Bengaluru Yelahanka / Avalahalli) Persistence & Seed Verification", () => {
    it("SEED_FEE_RULES includes all 4 platforms for bengaluru_560064 with BigBasket unknown fee preserved", () => {
      const bglrRules = SEED_FEE_RULES.filter((r) => r.locationKey === "bengaluru_560064");
      expect(bglrRules.length).toBe(4);

      const platforms = bglrRules.map((r) => r.platform);
      for (const p of SUPPORTED_PLATFORMS) {
        expect(platforms).toContain(p);
      }

      const bbRule = bglrRules.find((r) => r.platform === "bigbasket");
      expect(bbRule).toBeDefined();
      expect(bbRule?.hasDynamicUnknownFees).toBe(true);
      expect(bbRule?.handlingFeeMinPaise).toBe(500);
      expect(bbRule?.handlingFeeMaxPaise).toBe(1500);
    });

    it("Database has location record for bengaluru_560064", async () => {
      const loc = await prisma.location.findUnique({
        where: { locationKey: "bengaluru_560064" },
      });
      expect(loc).toBeDefined();
      expect(loc?.pincode).toBe("560064");
      expect(loc?.serviceableArea).toContain("Yelahanka");
    });

    it("Database has at least 64 PlatformObservations for pincode 560064 across all 4 platforms", async () => {
      const obsList = await prisma.platformObservation.findMany({
        where: { pincode: "560064" },
      });
      expect(obsList.length).toBeGreaterThanOrEqual(64);

      const platforms = new Set(obsList.map((o) => o.platformId));
      for (const p of SUPPORTED_PLATFORMS) {
        expect(platforms.has(p)).toBe(true);
      }

      // Check all prices are valid integer paise
      for (const o of obsList) {
        assertIntegerPaise(o.pricePaise, `Observation ${o.id}`);
      }
    });
  });

  describe("2. Cart Optimization Payload & Fuzzy Token Item Resolution", () => {
    it("optimizes basket with pincode 560064 and queryName items without canonicalProductId", async () => {
      const result = await service.optimizeBasket({
        pincode: "560064",
        items: [
          { queryName: "fresh toned milk", quantity: 2 },
          { queryName: "table eggs", quantity: 1 },
          { queryName: "sunflower cooking oil", quantity: 1 },
        ],
      });

      expect(result.pincode).toBe("560064");
      expect(result.evaluatedSubsetsCount).toBe(15);
      expect(result.strategies.cheapestSinglePlatform).toBeDefined();
      expect(result.strategies.optimizedMultiPlatform).toBeDefined();
      expect(result.strategies.cheapestItemByItem).toBeDefined();

      // Integer paise check
      assertIntegerPaise(result.strategies.optimizedMultiPlatform.itemSubtotalPaise);
      assertIntegerPaise(result.strategies.optimizedMultiPlatform.estimatedTotalMinPaise);
      expect(result.strategies.optimizedMultiPlatform.estimatedTotalMinPaise).toBeGreaterThan(0);
    });

    it("resolves natural language grocery staple queries (milk, eggs, atta, bread) via token overlap", async () => {
      const result = await service.optimizeBasket({
        pincode: "560064",
        items: [
          { queryName: "milk", quantity: 2 },
          { queryName: "eggs", quantity: 2 },
          { queryName: "atta", quantity: 1 },
        ],
      });

      const opt = result.strategies.optimizedMultiPlatform;
      expect(opt.coverageCount).toBe(3);
      expect(opt.missingItems.length).toBe(0);
    });

    it("falls back gracefully to regional observations when an unseeded pincode is provided", async () => {
      const result = await service.optimizeBasket({
        pincode: "560099", // Unseeded local pincode
        items: [
          { queryName: "milk", quantity: 1 },
          { queryName: "eggs", quantity: 1 },
        ],
      });

      expect(result.strategies.optimizedMultiPlatform.coverageCount).toBeGreaterThan(0);
      expect(result.strategies.optimizedMultiPlatform.estimatedTotalMinPaise).toBeGreaterThan(0);
    });
  });

  describe("3. REST API Surface Compatibility (POST /api/optimizations)", () => {
    it("handles Phase 3 payload with { items, pincode: '560064' }", async () => {
      const res = await request(app)
        .post("/api/optimizations")
        .send({
          pincode: "560064",
          items: [
            { queryName: "Amul Taaza Milk", quantity: 2 },
            { queryName: "Farm Fresh Eggs", quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.strategies).toBeDefined();
      expect(res.body.strategies.optimizedMultiPlatform).toBeDefined();
    });

    it("handles legacy payload with { locationId: 'delhi_560064', pincode: '560064', items } and normalizes to bengaluru_560064", async () => {
      const res = await request(app)
        .post("/api/optimizations")
        .send({
          locationId: "delhi_560064", // Test mismatched prefix sent by frontend
          pincode: "560064",
          items: [
            { query: "milk", quantity: 2, unit: "L" },
            { query: "eggs", quantity: 1, unit: "pcs" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.locationId).toBe("bengaluru_560064");
      expect(res.body.options).toBeDefined();
      expect(res.body.options.length).toBe(3);
      expect(res.body.options[0].estimatedTotalRupees).toBeGreaterThan(0);
    });
  });
});
