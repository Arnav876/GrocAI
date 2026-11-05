import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";

const prisma = new PrismaClient();
const app = createServer(prisma);

describe("Epic 5 & 6 — Ingestion API & Instamart Manual Adapter", () => {
  let createdJobId: string;
  let testManualObsId: string;

  afterAll(async () => {
    if (testManualObsId) {
      await prisma.priceObservation.delete({ where: { id: testManualObsId } }).catch(() => {});
    }
    if (createdJobId) {
      await prisma.scrapeJob.delete({ where: { id: createdJobId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("POST /api/ingestion/refresh", () => {
    it("enqueues jobs and returns HTTP 202 Accepted with jobId", async () => {
      const res = await request(app)
        .post("/api/ingestion/refresh")
        .send({
          queries: ["Amul Taaza milk"],
          platforms: ["blinkit", "zepto", "bigbasket"],
          locationKey: "delhi_110001",
          force: true,
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe("queued");
      expect(res.body.jobId).toBeDefined();
      expect(Array.isArray(res.body.jobIds)).toBe(true);
      expect(res.body.jobIds.length).toBe(3);

      createdJobId = res.body.jobId;
    });

    it("rejects empty queries with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/ingestion/refresh")
        .send({ queries: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("queries must be a non-empty array");
    });
  });

  describe("GET /api/ingestion/jobs/:id", () => {
    it("returns job status, platform, and execution metadata", async () => {
      const res = await request(app).get(`/api/ingestion/jobs/${createdJobId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdJobId);
      expect(res.body.status).toBe("queued");
      expect(Array.isArray(res.body.queries)).toBe(true);
    });

    it("returns 404 for unknown job id", async () => {
      const res = await request(app).get("/api/ingestion/jobs/unknown-job-id-999");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/ingestion/status", () => {
    it("reports queue depth, lastRunByPlatform, and blocked platforms", async () => {
      const res = await request(app).get("/api/ingestion/status");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("queueDepth");
      expect(res.body).toHaveProperty("lastRunByPlatform");
      expect(res.body).toHaveProperty("blockedPlatforms");
      // Instamart is always in blockedPlatforms for automated scraping
      expect(res.body.blockedPlatforms).toContain("instamart");
    });
  });

  describe("POST /api/observations/manual (Instamart Manual Adapter)", () => {
    it("accepts a manual Instamart price and updates product listing with sourceType: manual", async () => {
      const res = await request(app)
        .post("/api/observations/manual")
        .send({
          platform: "instamart",
          title: "Amul Taaza Toned Fresh Milk",
          pricePaise: 5400,
          pincode: "110001",
          productUrl: "https://www.swiggy.com/instamart/item/amul-taaza-1l",
          observedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain("successfully");
      expect(res.body.observation.platform).toBe("instamart");
      expect(res.body.observation.sourceType).toBe("manual");
      expect(res.body.observation.verificationStatus).toBe("cached");
      expect(res.body.observation.pricePaise).toBe(5400);

      testManualObsId = res.body.observation.id;

      // Verify the PlatformListing for amul-taaza-1l on Instamart was updated to manual
      const listing = await prisma.platformListing.findUnique({
        where: {
          productId_platform: {
            productId: "amul-taaza-1l",
            platform: "instamart",
          },
        },
      });

      expect(listing).not.toBeNull();
      expect(listing!.currentPricePaise).toBe(5400);
      expect(listing!.sourceType).toBe("manual");
      expect(listing!.availability).toBe("available");
    });

    it("rejects manual observation with missing title or invalid price", async () => {
      const res = await request(app)
        .post("/api/observations/manual")
        .send({ platform: "instamart", pricePaise: -100 });

      expect(res.status).toBe(400);
    });
  });
});

