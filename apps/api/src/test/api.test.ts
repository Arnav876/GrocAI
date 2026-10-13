import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

describe("API Endpoint Integration Tests", () => {
  let prisma: PrismaClient;
  let app: any;

  beforeAll(() => {
    prisma = new PrismaClient();
    app = createServer(prisma);
  });

  afterAll(async () => {
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
