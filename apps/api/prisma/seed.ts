import { PrismaClient } from "@prisma/client";
import { MOCK_CATEGORIES } from "../../web/src/fixtures/mockCategories.js";
import { MOCK_PRODUCTS } from "../../web/src/fixtures/mockProducts.js";
import { MOCK_PLATFORM_FEE_RULES } from "../../web/src/fixtures/mockFeeRules.js";
import {
  SUPPORTED_PLATFORMS,
  calculateDiscountPercentage,
  parseAndNormalizeQuantityWithPrice,
} from "@groqai/shared";
import {
  SEED_CANONICAL_PRODUCTS,
  SEED_FEE_RULES,
} from "../src/fixtures/seedFixtures.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding GroqAI database with Phase 1 contracts & persistence...");

  // 0. Seed Serviceable Locations: Delhi 110001 & Bengaluru 560001
  await prisma.location.upsert({
    where: { locationKey: "delhi_110001" },
    update: {
      pincode: "110001",
      city: "Central Delhi",
      latitude: 28.6304,
      longitude: 77.2177,
      serviceableArea: "Connaught Place",
    },
    create: {
      locationKey: "delhi_110001",
      pincode: "110001",
      city: "Central Delhi",
      latitude: 28.6304,
      longitude: 77.2177,
      serviceableArea: "Connaught Place",
    },
  });

  await prisma.location.upsert({
    where: { locationKey: "bengaluru_560001" },
    update: {
      pincode: "560001",
      city: "Bengaluru Central",
      latitude: 12.9716,
      longitude: 77.5946,
      serviceableArea: "MG Road / Brigade Road",
    },
    create: {
      locationKey: "bengaluru_560001",
      pincode: "560001",
      city: "Bengaluru Central",
      latitude: 12.9716,
      longitude: 77.5946,
      serviceableArea: "MG Road / Brigade Road",
    },
  });
  console.log("Seeded serviceable locations (Delhi 110001 & Bengaluru 560001).");

  // 1. Seed Categories
  for (const cat of MOCK_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        icon: cat.icon,
        bgPastel: cat.bgPastel,
        itemCount: cat.itemCount,
      },
      create: {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        bgPastel: cat.bgPastel,
        itemCount: cat.itemCount,
      },
    });
  }
  console.log(`Seeded ${MOCK_CATEGORIES.length} categories.`);

  // 2. Seed Fee Rules for all 4 platforms with explicit unknown fees on BigBasket
  for (const rule of SEED_FEE_RULES) {
    await prisma.platformFeeRule.upsert({
      where: {
        platform_locationKey: {
          platform: rule.platform,
          locationKey: rule.locationKey,
        },
      },
      update: {
        platformId: rule.platformId,
        pincode: rule.pincode,
        freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
        baseDeliveryFeeMinPaise: rule.baseDeliveryFeeMinPaise,
        baseDeliveryFeeMaxPaise: rule.baseDeliveryFeeMaxPaise,
        handlingFeeMinPaise: rule.handlingFeeMinPaise,
        handlingFeeMaxPaise: rule.handlingFeeMaxPaise,
        platformFeeMinPaise: rule.platformFeeMinPaise,
        platformFeeMaxPaise: rule.platformFeeMaxPaise,
        smallCartThresholdPaise: rule.smallCartThresholdPaise,
        smallCartFeePaise: rule.smallCartFeePaise,
        hasDynamicUnknownFees: rule.hasDynamicUnknownFees,
        provenanceNotes: rule.provenanceNotes,
        deliveryFeePaise: rule.baseDeliveryFeeMinPaise,
        handlingFeePaise: rule.hasDynamicUnknownFees ? null : rule.handlingFeeMinPaise,
        handlingFeeRangeMinPaise: rule.handlingFeeMinPaise,
        handlingFeeRangeMaxPaise: rule.handlingFeeMaxPaise,
        platformFeePaise: rule.platformFeeMinPaise,
        observedAt: new Date(),
      },
      create: {
        platform: rule.platform,
        platformId: rule.platformId,
        locationKey: rule.locationKey,
        pincode: rule.pincode,
        freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
        baseDeliveryFeeMinPaise: rule.baseDeliveryFeeMinPaise,
        baseDeliveryFeeMaxPaise: rule.baseDeliveryFeeMaxPaise,
        handlingFeeMinPaise: rule.handlingFeeMinPaise,
        handlingFeeMaxPaise: rule.handlingFeeMaxPaise,
        platformFeeMinPaise: rule.platformFeeMinPaise,
        platformFeeMaxPaise: rule.platformFeeMaxPaise,
        smallCartThresholdPaise: rule.smallCartThresholdPaise,
        smallCartFeePaise: rule.smallCartFeePaise,
        hasDynamicUnknownFees: rule.hasDynamicUnknownFees,
        provenanceNotes: rule.provenanceNotes,
        deliveryFeePaise: rule.baseDeliveryFeeMinPaise,
        handlingFeePaise: rule.hasDynamicUnknownFees ? null : rule.handlingFeeMinPaise,
        handlingFeeRangeMinPaise: rule.handlingFeeMinPaise,
        handlingFeeRangeMaxPaise: rule.handlingFeeMaxPaise,
        platformFeePaise: rule.platformFeeMinPaise,
        sourceType: "mock",
        observedAt: new Date(),
      },
    });
  }
  console.log(`Seeded ${SEED_FEE_RULES.length} platform fee rules across Delhi & Bengaluru.`);

  // 3. Seed Existing Product Catalog (Backward Compatibility)
  for (const prod of MOCK_PRODUCTS) {
    const categoryId = prod.category;

    await prisma.product.upsert({
      where: { id: prod.id },
      update: {
        name: prod.name,
        brand: prod.brand,
        categoryId,
        variant: prod.variant,
        packSize: prod.packSize,
        mrpPaise: prod.mrpPaise || null,
        rating: prod.rating || 4.5,
        reviewCount: prod.reviewCount || 100,
        discountPercentage: prod.discountPercentage || 0,
        isOutOfStock: prod.isOutOfStock || false,
        isNew: prod.isNew || false,
      },
      create: {
        id: prod.id,
        name: prod.name,
        brand: prod.brand,
        categoryId,
        variant: prod.variant,
        packSize: prod.packSize,
        mrpPaise: prod.mrpPaise || null,
        rating: prod.rating || 4.5,
        reviewCount: prod.reviewCount || 100,
        discountPercentage: prod.discountPercentage || 0,
        isOutOfStock: prod.isOutOfStock || false,
        isNew: prod.isNew || false,
      },
    });

    for (const pid of SUPPORTED_PLATFORMS) {
      const platData = prod.platformPrices[pid];
      if (platData) {
        await prisma.platformListing.upsert({
          where: {
            productId_platform_locationKey: {
              productId: prod.id,
              platform: pid,
              locationKey: "delhi_110001",
            },
          },
          update: {
            currentPricePaise: platData.pricePaise || null,
            availability: platData.availability,
            isStale: platData.isStale,
            confidence: platData.confidence,
            sourceType: platData.sourceType,
            searchUrl: platData.searchUrl,
            lastObservedAt: platData.observedAt ? new Date(platData.observedAt) : new Date(),
          },
          create: {
            productId: prod.id,
            platform: pid,
            locationKey: "delhi_110001",
            currentPricePaise: platData.pricePaise || null,
            availability: platData.availability,
            isStale: platData.isStale,
            confidence: platData.confidence,
            sourceType: platData.sourceType,
            searchUrl: platData.searchUrl,
            lastObservedAt: platData.observedAt ? new Date(platData.observedAt) : new Date(),
          },
        });
      }
    }
  }

  // 4. Seed Canonical Products (Phase 1 Standard)
  for (const cp of SEED_CANONICAL_PRODUCTS) {
    await prisma.canonicalProduct.upsert({
      where: { slug: cp.slug },
      update: {
        name: cp.name,
        brand: cp.brand,
        category: cp.category,
        variant: cp.variant,
        baseDimension: cp.baseDimension,
        standardPackSize: cp.standardPackSize,
        aliases: cp.aliases,
      },
      create: {
        id: cp.id,
        slug: cp.slug,
        name: cp.name,
        brand: cp.brand,
        category: cp.category,
        variant: cp.variant,
        baseDimension: cp.baseDimension,
        standardPackSize: cp.standardPackSize,
        aliases: cp.aliases,
      },
    });
  }
  console.log(`Seeded ${SEED_CANONICAL_PRODUCTS.length} CanonicalProducts.`);

  // 5. Seed 14-Field PlatformObservations (Delhi 110001 and Bengaluru 560001)
  const targetPincodes = [
    { pincode: "110001", locationKey: "delhi_110001" },
    { pincode: "560001", locationKey: "bengaluru_560001" },
  ];

  let observationCount = 0;
  let sampleObservationId: string | null = null;

  for (const loc of targetPincodes) {
    for (const cp of SEED_CANONICAL_PRODUCTS) {
      for (const pid of SUPPORTED_PLATFORMS) {
        const plat = cp.prices[pid];
        const pricePaise = plat.pricePaise;
        const originalPricePaise = cp.mrpPaise;
        const discountPercentage = calculateDiscountPercentage(pricePaise, originalPricePaise);
        const norm = parseAndNormalizeQuantityWithPrice(cp.standardPackSize, pricePaise);

        const obs = await prisma.platformObservation.create({
          data: {
            name: cp.name,
            brand: cp.brand,
            quantity: cp.standardPackSize,
            pricePaise,
            originalPricePaise,
            discountPercentage,
            availabilityStatus: plat.inStock ? "IN_STOCK" : "OUT_OF_STOCK",
            platformId: pid,
            productUrl: `https://${pid}.com/product/${cp.slug}`,
            imageUrl: `https://cdn.groqai.io/products/${cp.slug}.png`,
            pincode: loc.pincode,
            observedAt: new Date(),
            dataSource: "seed_fixture",
            verificationStatus: "VERIFIED",
            normalizedUnitPricePaise: norm.pricePerReferenceUnitPaise,
            canonicalProductId: cp.id,
          },
        });

        observationCount++;
        if (!sampleObservationId) {
          sampleObservationId = obs.id;
        }
      }
    }
  }
  console.log(`Seeded ${observationCount} 14-field PlatformObservations across Delhi and Bengaluru.`);

  // 6. Seed a CandidateMatch for review workflow
  if (sampleObservationId && SEED_CANONICAL_PRODUCTS[0]) {
    await prisma.candidateMatch.create({
      data: {
        observationId: sampleObservationId,
        canonicalProductId: SEED_CANONICAL_PRODUCTS[0].id,
        confidenceScore: 0.98,
        matchReasons: {
          tokenOverlap: 1.0,
          brandMatch: true,
          packSizeCompatible: true,
          exactNameMatch: true,
        },
        guardFlags: {
          conflictingVariantKeywords: false,
          packSizeMismatch: false,
          zeroPaiseAnomaly: false,
        },
        reviewStatus: "PENDING",
      },
    });
    console.log("Seeded sample CandidateMatch with reviewStatus PENDING.");
  }

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
