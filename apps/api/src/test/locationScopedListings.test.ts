import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

describe("Phase 2 — Location-scoped platform listings", () => {
  const prisma = new PrismaClient();
  const app = createServer(prisma);
  const productId = "amul-taaza-1l";
  const otherLocationKey = "delhi_110002";
  let manualObservationId: string | undefined;

  beforeAll(async () => {
    await prisma.platformListing.upsert({
      where: {
        productId_platform_locationKey: {
          productId,
          platform: "zepto",
          locationKey: otherLocationKey,
        },
      },
      create: {
        productId,
        platform: "zepto",
        locationKey: otherLocationKey,
        currentPricePaise: 12345,
        availability: "available",
        isStale: false,
        confidence: 1,
        sourceType: "permitted_page",
        lastObservedAt: new Date(),
      },
      update: {
        currentPricePaise: 12345,
        availability: "available",
        isStale: false,
        confidence: 1,
        sourceType: "permitted_page",
        lastObservedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (manualObservationId) {
      await prisma.priceObservation.delete({ where: { id: manualObservationId } }).catch(() => {});
    }
    await prisma.platformListing
      .deleteMany({ where: { productId, platform: "zepto", locationKey: otherLocationKey } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  it("returns only the listing for the requested pincode", async () => {
    const other = await request(app).get(`/api/products/${productId}?pincode=110002`);
    expect(other.status).toBe(200);
    expect(other.body.platformPrices.zepto.pricePaise).toBe(12345);

    const delhi = await request(app).get(`/api/products/${productId}?pincode=110001`);
    expect(delhi.status).toBe(200);
    expect(delhi.body.platformPrices.zepto?.pricePaise).not.toBe(12345);
  });

  it("scopes search results to the requested pincode", async () => {
    const res = await request(app).get("/api/products/search?q=amul&pincode=110002");
    expect(res.status).toBe(200);

    const target = res.body.find((p: any) => p.id === productId);
    expect(target).toBeDefined();
    expect(target.platformPrices.zepto.pricePaise).toBe(12345);
  });

  it("writes manual observations into the observation pincode's listing", async () => {
    const res = await request(app)
      .post("/api/observations/manual")
      .send({
        platform: "instamart",
        title: "Amul Taaza Toned Fresh Milk",
        pricePaise: 5555,
        pincode: "110002",
      });

    expect(res.status).toBe(201);
    manualObservationId = res.body.observation.id;
    expect(res.body.observation.locationKey).toBe(otherLocationKey);

    const listing = await prisma.platformListing.findUnique({
      where: {
        productId_platform_locationKey: {
          productId,
          platform: "instamart",
          locationKey: otherLocationKey,
        },
      },
    });
    expect(listing?.currentPricePaise).toBe(5555);
    expect(listing?.sourceType).toBe("manual");

    // Clean up the instamart row this test created before afterAll runs.
    await prisma.platformListing.delete({ where: { id: listing!.id } });
  });
});
