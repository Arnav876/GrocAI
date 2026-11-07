import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

describe("API Endpoint Integration Tests", () => {
  let prisma: PrismaClient;
  let app: any;
  const FEE_TEST_LOCATION = "delhi_560003";

  beforeAll(() => {
    prisma = new PrismaClient();
    app = createServer(prisma);
  });

  afterAll(async () => {
    await prisma.platformFeeRule.deleteMany({
      where: { locationKey: FEE_TEST_LOCATION },
    });
    await prisma.$disconnect();
  });

  it("GET /api/health returns healthy status and platform killswitch states", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.platforms)).toBe(true);
    expect(res.body.platforms.length).toBe(4);
  });

  it("GET /api/categories returns seeded categories", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(10);
    expect(res.body[0]).toHaveProperty("slug");
  });

  it("GET /api/products/search finds matching products across platforms", async () => {
    const res = await request(app).get("/api/products/search?q=milk");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("platformPrices");
    expect(res.body[0]).toHaveProperty("lowestPricePaise");
  });

  it("GET /api/fees returns every platform with honest unknown/provenance fields", async () => {
    const res = await request(app).get("/api/fees?locationKey=delhi_110001");
    expect(res.status).toBe(200);
    expect(res.body.locationKey).toBe("delhi_110001");
    expect(res.body.rules).toHaveLength(4);
    expect(res.body.disclaimer).toContain("never be treated as ₹0");
    for (const rule of res.body.rules) {
      expect(rule).toHaveProperty("isKnown");
      expect(rule).toHaveProperty("sourceType");
      expect(rule).toHaveProperty("deliveryFeePaise");
    }
  });

  it("PUT /api/fees/:platform persists manual fee data and rejects invalid paise", async () => {
    const save = await request(app).put("/api/fees/zepto").send({
      locationKey: FEE_TEST_LOCATION,
      deliveryFeePaise: 2500,
      handlingFeePaise: 500,
      platformFeePaise: 200,
      freeDeliveryThresholdPaise: 14900,
      minimumOrderValuePaise: 9900,
    });
    expect(save.status).toBe(200);
    expect(save.body.rule.sourceType).toBe("manual");
    expect(save.body.rule.deliveryFeePaise).toBe(2500);

    const read = await request(app).get(`/api/fees?locationKey=${FEE_TEST_LOCATION}`);
    const zepto = read.body.rules.find((r: any) => r.platform === "zepto");
    expect(zepto.isKnown).toBe(true);
    expect(zepto.sourceType).toBe("manual");
    expect(zepto.handlingFeePaise).toBe(500);

    // Other platforms at this location remain explicitly unknown.
    const blinkit = read.body.rules.find((r: any) => r.platform === "blinkit");
    expect(blinkit.isKnown).toBe(false);
    expect(blinkit.deliveryFeePaise).toBeNull();

    const invalid = await request(app).put("/api/fees/zepto").send({
      locationKey: FEE_TEST_LOCATION,
      deliveryFeePaise: 25.5,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain("integer number of paise");

    const unknownPlatform = await request(app).put("/api/fees/not-a-platform").send({});
    expect(unknownPlatform.status).toBe(404);
  });

  it("POST /api/optimizations calculates 3 strategies and returns valid response", async () => {
    const payload = {
      locationId: "delhi_110001",
      pincode: "110001",
      items: [
        { query: "Amul Taaza Milk", quantity: 2, unit: "L" },
        { query: "Fortune Sunflower Oil", quantity: 1, unit: "L" },
      ],
      preferences: {
        strategy: "optimized_multi_platform",
        maxPlatforms: 3,
        minimumSavingsPaise: 2000,
      },
    };

    const res = await request(app).post("/api/optimizations").send(payload);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("baselineName");
    expect(res.body.options.length).toBe(3);
    expect(
      res.body.warnings.some((w: string) => w.includes("mock estimate"))
    ).toBe(true);

    // Save optimization ID for subsequent tests
    const optId = res.body.id;

    // Test GET /api/optimizations/:id
    const getRes = await request(app).get(`/api/optimizations/${optId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(optId);
    expect(getRes.body.options.length).toBe(3);

    // Test POST /api/shopping-handoff
    const handoffRes = await request(app).post("/api/shopping-handoff").send({
      optimizationId: optId,
      strategy: "optimized_multi_platform",
    });
    expect(handoffRes.status).toBe(200);
    expect(handoffRes.body).toHaveProperty("handoffId");
    expect(handoffRes.body.method).toBe("links_and_checklist");
    expect(handoffRes.body.notice).toContain("Payment happens on the platform");
    expect(Array.isArray(handoffRes.body.platforms)).toBe(true);
  });

  it("POST /api/optimizations excludes unmatched items and warns instead of substituting allProducts[0]", async () => {
    const payload = {
      locationId: "delhi_110001",
      pincode: "110001",
      items: [
        { query: "Amul Taaza Milk", quantity: 1, unit: "L" },
        { query: "Completely Unmatched XYZ Random Tech Gadget", quantity: 1, unit: "pcs" },
      ],
    };

    const res = await request(app).post("/api/optimizations").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.warnings.some((w: string) => w.includes("could not be matched in catalog"))).toBe(true);
    // Verified: Only 1 item matched and optimized (no fake substitution)
    const option = res.body.options[0];
    const totalLines = Object.values(option.perPlatform).reduce(
      (sum: number, p: any) => sum + p.items.length,
      0
    );
    expect(totalLines).toBe(1);
  });

  it("GET /api/platforms returns honest capabilities without simulating fake cart creation", async () => {
    const res = await request(app).get("/api/platforms");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);

    for (const plat of res.body) {
      // Non-negotiable rule: createCart MUST be false for all platforms until partner approval
      expect(plat.capabilities.createCart).toBe(false);
      expect(plat.status).toBe("healthy");
    }
  });
});
