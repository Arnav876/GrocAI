import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { toObservation } from "../ingestion/normalize.js";
import { RawObservation, PriceObservationSchema } from "@groqai/shared";

const prisma = new PrismaClient();

describe("Epic 1 — Ingestion Data Contract & Schema Roundtrip", () => {
  let testScrapeRunId: string;
  let testObservationId: string;

  beforeAll(async () => {
    // Create a ScrapeRun for foreign key reference
    const run = await prisma.scrapeRun.create({
      data: {
        platform: "blinkit",
        locationKey: "delhi_110001",
        trigger: "on_demand",
        status: "running",
        queries: ["Amul milk"],
        itemsFound: 0,
      },
    });
    testScrapeRunId = run.id;
  });

  afterAll(async () => {
    if (testObservationId) {
      await prisma.priceObservation.delete({ where: { id: testObservationId } }).catch(() => {});
    }
    if (testScrapeRunId) {
      await prisma.scrapeRun.delete({ where: { id: testScrapeRunId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("toObservation normalizes raw data and enforces integer paise math", () => {
    const raw: RawObservation = {
      platform: "blinkit",
      externalId: "ext-12345",
      title: "Amul Gold Full Cream Fresh Milk",
      brand: "Amul",
      variant: "Full Cream",
      packSize: "500 ml",
      pricePaise: 3300.75, // float input to test rounding
      originalPricePaise: 3500.25,
      discountPercentage: 6,
      availability: "available",
      productUrl: "https://blinkit.com/prn/amul-gold/prid/123",
      imageUrl: "https://cdn.grofers.com/amul-gold.jpg",
      searchUrl: "https://blinkit.com/s/?q=amul+gold",
      pincode: "110001",
      serviceableArea: "Connaught Place",
      latitude: 28.6304,
      longitude: 77.2177,
    };

    const obs = toObservation(
      raw,
      { locationKey: "delhi_110001", pincode: "110001", city: "Delhi", latitude: 28.6304, longitude: 77.2177 },
      { scrapeRunId: testScrapeRunId, sourceType: "permitted_page", verificationStatus: "live_verified" }
    );

    // Assert strict integer paise
    expect(Number.isInteger(obs.pricePaise)).toBe(true);
    expect(obs.pricePaise).toBe(3301);
    expect(Number.isInteger(obs.originalPricePaise)).toBe(true);
    expect(obs.originalPricePaise).toBe(3500);

    // Assert rupees conversion
    expect(obs.price).toBe(33.01);
    expect(obs.originalPrice).toBe(35);

    // Assert unit normalization: 3301 paise for 500 ml -> 6602 paise per L
    expect(obs.normalizedUnit).toBe("L");
    expect(obs.normalizedUnitPricePaise).toBe(6602);
    expect(obs.normalizedUnitPrice?.displayUnitPrice).toBe("₹66.02 / L");

    // Assert Zod validation passes
    const validated = PriceObservationSchema.safeParse(obs);
    expect(validated.success).toBe(true);
  });

  it("persists and reads back all 14+ fields from PostgreSQL without data loss", async () => {
    const now = new Date();
    const created = await prisma.priceObservation.create({
      data: {
        platform: "zepto",
        productId: "amul-gold-1l",
        externalId: "zep-9876",
        rawTitle: "Amul Gold Milk Pouch 1L",
        brand: "Amul",
        variant: "Full Cream",
        packSize: "1 L",
        quantity: 1,
        unit: "L",
        pricePaise: 6600,
        originalPricePaise: 6800,
        discountPercentage: 3,
        currency: "INR",
        availability: "available",
        productUrl: "https://zeptonow.com/p/amul-gold-1l",
        imageUrl: "https://cdn.zepto.com/amul-gold.png",
        searchUrl: "https://zeptonow.com/search?q=amul+gold",
        locationKey: "delhi_110001",
        pincode: "110001",
        serviceableArea: "Central Delhi",
        latitude: 28.6304,
        longitude: 77.2177,
        normalizedUnitPricePaise: 6600,
        normalizedUnit: "L",
        sourceType: "permitted_page",
        verificationStatus: "live_verified",
        confidence: 0.99,
        observedAt: now,
        fetchedAt: now,
        scrapeRunId: testScrapeRunId,
        notes: ["Verified in Phase 1 contract test"],
      },
      include: {
        scrapeRun: true,
      },
    });

    testObservationId = created.id;

    // Read back from DB
    const fetched = await prisma.priceObservation.findUnique({
      where: { id: testObservationId },
      include: { scrapeRun: true },
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.externalId).toBe("zep-9876");
    expect(fetched!.brand).toBe("Amul");
    expect(fetched!.variant).toBe("Full Cream");
    expect(fetched!.packSize).toBe("1 L");
    expect(fetched!.quantity).toBe(1);
    expect(fetched!.unit).toBe("L");
    expect(fetched!.pricePaise).toBe(6600);
    expect(fetched!.originalPricePaise).toBe(6800);
    expect(fetched!.discountPercentage).toBe(3);
    expect(fetched!.productUrl).toBe("https://zeptonow.com/p/amul-gold-1l");
    expect(fetched!.imageUrl).toBe("https://cdn.zepto.com/amul-gold.png");
    expect(fetched!.searchUrl).toBe("https://zeptonow.com/search?q=amul+gold");
    expect(fetched!.pincode).toBe("110001");
    expect(fetched!.serviceableArea).toBe("Central Delhi");
    expect(fetched!.latitude).toBeCloseTo(28.6304);
    expect(fetched!.longitude).toBeCloseTo(77.2177);
    expect(fetched!.normalizedUnitPricePaise).toBe(6600);
    expect(fetched!.normalizedUnit).toBe("L");
    expect(fetched!.verificationStatus).toBe("live_verified");
    expect(fetched!.sourceType).toBe("permitted_page");
    expect(fetched!.scrapeRunId).toBe(testScrapeRunId);
    expect(fetched!.scrapeRun?.status).toBe("running");
  });
});

