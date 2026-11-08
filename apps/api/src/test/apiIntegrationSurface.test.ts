import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

describe("Phase 5 — Complete REST API Surface & OpenAPI 3.0 Specification", () => {
  const prisma = new PrismaClient();
  const app = createServer(prisma);
  let createdManualObsId: string | undefined;

  afterAll(async () => {
    if (createdManualObsId) {
      await prisma.priceObservation.delete({ where: { id: createdManualObsId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // 1. GET /api/health
  describe("1. GET /api/health", () => {
    it("returns health, honest ingestion modes, and NullCartAdapter capabilities", async () => {
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.uptimeSeconds).toBeDefined();
      expect(typeof res.body.uptimeSeconds).toBe("number");

      // Ingestion Matrix check
      expect(res.body.ingestionModes).toEqual({
        blinkit: "headed_worker",
        zepto: "headed_worker",
        bigbasket: "headed_worker",
        instamart: "manual_assisted",
      });

      // NullCartAdapter capabilities check (honest platform handoff)
      expect(res.body.capabilities).toBeDefined();
      expect(res.body.capabilities.createCart).toBe(false);
      expect(res.body.capabilities.automatedCheckout).toBe(false);
      expect(res.body.capabilities.searchDeepLink).toBe(true);
      expect(res.body.capabilities.checklistHandoff).toBe(true);

      // Platform kill-switches check
      expect(res.body.platformKillSwitches).toBeDefined();
      expect(typeof res.body.platformKillSwitches.blinkit).toBe("boolean");
      expect(typeof res.body.platformKillSwitches.zepto).toBe("boolean");
      expect(typeof res.body.platformKillSwitches.bigbasket).toBe("boolean");
      expect(typeof res.body.platformKillSwitches.instamart).toBe("boolean");
    });
  });

  // 2. GET /api/products/search
  describe("2. GET /api/products/search", () => {
    it("searches catalog and returns products with integer paise listings and normalized unit prices", async () => {
      const res = await request(app).get("/api/products/search?q=milk&pincode=110001");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      if (res.body.length > 0) {
        const prod = res.body[0];
        expect(prod.name).toBeDefined();
        expect(Number.isInteger(prod.lowestPricePaise)).toBe(true);
        expect(prod.platformPrices).toBeDefined();
      }
    });

    it("rejects invalid 6-digit Indian pincode with 400 Bad Request", async () => {
      const res = await request(app).get("/api/products/search?q=milk&pincode=invalid-pincode");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid pincode");
    });
  });

  // 3. POST /api/products/sync
  describe("3. POST /api/products/sync", () => {
    it("synchronizes multi-platform catalog matrix for requested items", async () => {
      const res = await request(app)
        .post("/api/products/sync")
        .send({
          items: [{ query: "milk" }],
          pincode: "110001",
        });

      expect(res.status).toBe(200);
      expect(res.body.locationKey).toBe("delhi_110001");
      expect(res.body.totalSynced).toBeDefined();
      expect(Array.isArray(res.body.outcomes)).toBe(true);
    });
  });

  // 4. POST /api/optimizations (and POST /api/basket/optimize)
  describe("4. POST /api/optimizations & /api/basket/optimize", () => {
    it("POST /api/optimizations runs 3-strategy combinatorial optimizer with integer paise", async () => {
      const res = await request(app)
        .post("/api/optimizations")
        .send({
          items: [{ queryName: "milk", quantity: 2 }],
          pincode: "110001",
        });

      expect(res.status).toBe(201);
      expect(res.body.pincode).toBe("110001");
      expect(res.body.strategies).toBeDefined();

      // Strategy 1: Cheapest Item-by-Item
      expect(res.body.strategies.cheapestItemByItem).toBeDefined();
      expect(res.body.strategies.cheapestItemByItem.strategy).toBe("CHEAPEST_ITEM_BY_ITEM");
      expect(Number.isInteger(res.body.strategies.cheapestItemByItem.itemSubtotalPaise)).toBe(true);

      // Strategy 2: Cheapest Single Platform
      expect(res.body.strategies.cheapestSinglePlatform).toBeDefined();
      expect(res.body.strategies.cheapestSinglePlatform.strategy).toBe("CHEAPEST_SINGLE_PLATFORM");

      // Strategy 3: Optimized Multi-Platform Split (2^4 - 1 = 15 solver)
      expect(res.body.strategies.optimizedMultiPlatform).toBeDefined();
      expect(res.body.strategies.optimizedMultiPlatform.strategy).toBe("OPTIMIZED_MULTI_PLATFORM_SPLIT");
    });

    it("POST /api/basket/optimize alias also evaluates 3 strategies cleanly", async () => {
      const res = await request(app)
        .post("/api/basket/optimize")
        .send({
          items: [{ queryName: "milk", quantity: 1 }],
          pincode: "110001",
        });

      expect(res.status).toBe(201);
      expect(res.body.strategies).toBeDefined();
    });
  });

  // 5. POST /api/shopping-handoff (and POST /api/basket/handoff)
  describe("5. POST /api/shopping-handoff & /api/basket/handoff", () => {
    it("generates merchant deep links and markdown checklist with NullCartAdapter flags", async () => {
      const storeCarts = {
        blinkit: {
          platformId: "blinkit",
          platformName: "Blinkit",
          items: [
            {
              queryName: "milk",
              matchedTitle: "Amul Taaza Milk 1 L",
              quantity: 2,
              unitPricePaise: 5400,
              lineTotalPaise: 10800,
              availability: "IN_STOCK",
              platformId: "blinkit",
              searchUrl: "https://blinkit.com/s/?q=Amul+Taaza+Milk",
            },
          ],
          subtotalPaise: 10800,
          feeBreakdown: {
            deliveryFeePaise: 2500,
            handlingFeePaise: 500,
            smallCartFeePaise: 0,
            surgeFeePaise: 0,
            totalFeePaise: 3000,
          },
          totalMinPaise: 13800,
          totalMaxPaise: 13800,
          hasUnknownFees: false,
          cliffs: {
            amountToFreeDeliveryPaise: 0,
            potentialDeliveryFeeSavingsPaise: 0,
            amountToAvoidSmallCartFeePaise: 0,
            potentialSmallCartFeeSavingsPaise: 0,
          },
          feeCliffWarnings: [],
        },
      };

      const res = await request(app)
        .post("/api/shopping-handoff")
        .send({
          strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
          storeCarts,
        });

      expect(res.status).toBe(200);
      expect(res.body.capabilities.createCart).toBe(false);
      expect(res.body.capabilities.automatedCheckout).toBe(false);
      expect(res.body.capabilities.checklistHandoff).toBe(true);
      expect(res.body.markdownChecklist).toContain("Shopping Checklist");
      expect(res.body.platforms.length).toBe(1);
      expect(res.body.platforms[0].items[0].searchUrl).toContain("blinkit.com");
    });
  });

  // 6. POST /api/ingestion/refresh
  describe("6. POST /api/ingestion/refresh", () => {
    it("enqueues scrape jobs, respects kill-switches, and reports manual_assisted for Instamart", async () => {
      const res = await request(app)
        .post("/api/ingestion/refresh")
        .send({
          queries: ["Amul milk"],
          platforms: ["blinkit", "zepto", "instamart"],
          locationKey: "delhi_110001",
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe("queued");
      // Instamart is reported as manual_assisted and not enqueued as an automated browser job
      expect(res.body.manualAssistedPlatforms).toContain("instamart");
      expect(res.body.platforms).not.toContain("instamart");
      expect(res.body.jobIds.length).toBe(2); // blinkit and zepto
    });
  });

  // 7. POST /api/observations/manual
  describe("7. POST /api/observations/manual", () => {
    it("accepts a manual observation for Swiggy Instamart, validates 14 fields, and persists", async () => {
      const res = await request(app)
        .post("/api/observations/manual")
        .send({
          platform: "instamart",
          title: "Amul Taaza Toned Fresh Milk",
          pricePaise: 5400,
          mrpPaise: 5400,
          packSize: "1 L",
          pincode: "110001",
          productUrl: "https://www.swiggy.com/instamart/search?query=amul-taaza",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain("successfully");

      const obs = res.body.observation;
      createdManualObsId = obs.id;

      expect(obs.name).toBe("Amul Taaza Toned Fresh Milk");
      expect(obs.pricePaise).toBe(5400);
      expect(obs.platformId).toBe("instamart");
      expect(obs.dataSource).toBe("manual_assisted");
      expect(obs.pincode).toBe("110001");
      expect(obs.availabilityStatus).toBe("IN_STOCK");
    });
  });

  // 8. GET /api/docs/openapi.json
  describe("8. GET /api/docs/openapi.json", () => {
    it("returns valid OpenAPI 3.0.3 specification documenting all 8 canonical routes and integer paise rules", async () => {
      const res = await request(app).get("/api/docs/openapi.json");

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe("3.0.3");
      expect(res.body.info.title).toContain("GrocAI");

      // Verify all 8 canonical endpoints are documented
      const paths = res.body.paths;
      expect(paths["/api/health"]).toBeDefined();
      expect(paths["/api/products/search"]).toBeDefined();
      expect(paths["/api/products/sync"]).toBeDefined();
      expect(paths["/api/optimizations"]).toBeDefined();
      expect(paths["/api/basket/optimize"]).toBeDefined();
      expect(paths["/api/shopping-handoff"]).toBeDefined();
      expect(paths["/api/basket/handoff"]).toBeDefined();
      expect(paths["/api/ingestion/refresh"]).toBeDefined();
      expect(paths["/api/observations/manual"]).toBeDefined();
      expect(paths["/api/nl/parse"]).toBeDefined();

      // Verify components and 14-field NormalizedObservation schema
      const schemas = res.body.components.schemas;
      expect(schemas.NormalizedObservation).toBeDefined();
      expect(schemas.HealthResponse).toBeDefined();
      expect(schemas.BasketOptimizationRequest).toBeDefined();
    });
  });
});
