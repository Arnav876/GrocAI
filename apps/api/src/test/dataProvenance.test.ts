import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import {
  ProvenanceListingRow,
  summarizeProvenance,
} from "../services/dataProvenance.js";

const prisma = new PrismaClient();
const TEST_LOCATION = "delhi_560005";
const productId = "amul-taaza-1l";

function row(overrides: Partial<ProvenanceListingRow> = {}): ProvenanceListingRow {
  return {
    platform: "blinkit",
    sourceType: "permitted_page",
    availability: "available",
    lastObservedAt: new Date(),
    ...overrides,
  };
}

describe("Phase 2 — Data provenance aggregation", () => {
  it("reports an empty location as empty, never as live", () => {
    const result = summarizeProvenance([], TEST_LOCATION);
    expect(result.status).toBe("empty");
    expect(result.counts.totalListings).toBe(0);
    expect(result.platforms).toHaveLength(4);
    expect(result.platforms.every((p) => p.totalListings === 0)).toBe(true);
  });

  it("reports all-mock data as mock", () => {
    const result = summarizeProvenance(
      [
        row({ platform: "blinkit", sourceType: "mock" }),
        row({ platform: "zepto", sourceType: "mock" }),
      ],
      TEST_LOCATION
    );
    expect(result.status).toBe("mock");
    expect(result.counts.mockListings).toBe(2);
    expect(result.counts.estimateListings).toBe(2);
    expect(result.counts.liveSourceListings).toBe(0);
  });

  it("reports live only when every listing is live-captured and fresh", () => {
    const result = summarizeProvenance(
      [
        row({ platform: "blinkit", sourceType: "permitted_page" }),
        row({ platform: "zepto", sourceType: "authorized_api" }),
        row({ platform: "bigbasket", sourceType: "partner_feed" }),
      ],
      TEST_LOCATION
    );
    expect(result.status).toBe("live");
    expect(result.counts.liveSourceListings).toBe(3);
    expect(result.counts.liveVerifiedListings).toBe(3);
  });

  it("reports mixed data when live, manual, or stale rows coexist", () => {
    const liveAndMock = summarizeProvenance(
      [
        row({ platform: "blinkit", sourceType: "permitted_page" }),
        row({ platform: "zepto", sourceType: "mock" }),
      ],
      TEST_LOCATION
    );
    expect(liveAndMock.status).toBe("mixed");
    expect(liveAndMock.counts.liveSourceListings).toBe(1);
    expect(liveAndMock.counts.mockListings).toBe(1);

    const manualOnly = summarizeProvenance(
      [row({ platform: "instamart", sourceType: "manual" })],
      TEST_LOCATION
    );
    expect(manualOnly.status).toBe("mixed");
    expect(manualOnly.counts.manualListings).toBe(1);

    const staleLive = summarizeProvenance(
      [
        row({
          platform: "bigbasket",
          sourceType: "permitted_page",
          lastObservedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        }),
      ],
      TEST_LOCATION
    );
    expect(staleLive.status).toBe("mixed");
    expect(staleLive.counts.staleListings).toBe(1);
  });

  it("never silently classifies an unrecognized source as live", () => {
    const result = summarizeProvenance(
      [row({ sourceType: "accidental_scrape" })],
      TEST_LOCATION
    );
    expect(result.status).toBe("mixed");
    expect(result.counts.unknownSourceListings).toBe(1);
    expect(result.counts.liveSourceListings).toBe(0);
  });

  it("counts per platform and preserves availability honestly", () => {
    const result = summarizeProvenance(
      [
        row({ platform: "zepto", sourceType: "permitted_page" }),
        row({
          platform: "zepto",
          sourceType: "permitted_page",
          availability: "unavailable",
        }),
      ],
      TEST_LOCATION
    );
    const zepto = result.platforms.find((p) => p.platform === "zepto")!;
    expect(zepto.totalListings).toBe(2);
    expect(zepto.bySourceType.permitted_page).toBe(2);
    expect(zepto.byVerification.unavailable).toBe(1);
    expect(result.counts.availableListings).toBe(1);
    expect(result.counts.unavailableListings).toBe(1);
  });
});

describe("GET /api/data-provenance", () => {
  const app = createServer(prisma);

  beforeAll(async () => {
    await prisma.platformListing.deleteMany({ where: { locationKey: TEST_LOCATION } });
    await prisma.platformListing.createMany({
      data: [
        {
          productId,
          platform: "blinkit",
          locationKey: TEST_LOCATION,
          currentPricePaise: 7700,
          availability: "available",
          sourceType: "permitted_page",
          lastObservedAt: new Date(),
        },
        {
          productId,
          platform: "zepto",
          locationKey: TEST_LOCATION,
          currentPricePaise: 8200,
          availability: "available",
          sourceType: "mock",
          lastObservedAt: new Date(),
        },
        {
          productId,
          platform: "instamart",
          locationKey: TEST_LOCATION,
          currentPricePaise: 7900,
          availability: "available",
          sourceType: "manual",
          lastObservedAt: new Date(),
        },
        {
          productId,
          platform: "bigbasket",
          locationKey: TEST_LOCATION,
          currentPricePaise: 7600,
          availability: "available",
          sourceType: "permitted_page",
          lastObservedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.platformListing.deleteMany({ where: { locationKey: TEST_LOCATION } });
    await prisma.$disconnect();
  });

  it("returns an honest mixed aggregate for a location with live, mock, and manual rows", async () => {
    const res = await request(app).get(
      `/api/data-provenance?locationKey=${TEST_LOCATION}`
    );
    expect(res.status).toBe(200);
    expect(res.body.locationKey).toBe(TEST_LOCATION);
    expect(res.body.pincode).toBe("560005");
    expect(res.body.status).toBe("mixed");
    expect(res.body.counts.totalListings).toBe(4);
    expect(res.body.counts.liveSourceListings).toBe(2);
    expect(res.body.counts.manualListings).toBe(1);
    expect(res.body.counts.mockListings).toBe(1);
    expect(res.body.counts.liveVerifiedListings).toBe(1);
    expect(res.body.counts.cachedListings).toBe(1);
    expect(res.body.counts.staleListings).toBe(1);
    expect(res.body.counts.estimateListings).toBe(1);
    expect(res.body.platforms).toHaveLength(4);
    expect(res.body.disclaimer).toContain("verify prices");
  });

  it("supports pincode lookup and returns empty for an uncaptured pincode", async () => {
    const res = await request(app).get("/api/data-provenance?pincode=599999");
    expect(res.status).toBe(200);
    expect(res.body.locationKey).toBe("delhi_599999");
    expect(res.body.status).toBe("empty");
    expect(res.body.counts.totalListings).toBe(0);
  });
});
