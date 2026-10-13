import { PrismaClient } from "@prisma/client";
import { MOCK_CATEGORIES } from "../../web/src/fixtures/mockCategories.js";
import { MOCK_PRODUCTS } from "../../web/src/fixtures/mockProducts.js";
import { MOCK_PLATFORM_FEE_RULES } from "../../web/src/fixtures/mockFeeRules.js";
import { SUPPORTED_PLATFORMS } from "@groqai/shared";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding GroqAI database...");

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

  // 2. Seed Fee Rules for Central Delhi 110001
  for (const pid of SUPPORTED_PLATFORMS) {
    const rule = MOCK_PLATFORM_FEE_RULES[pid];
    if (rule) {
      const isHandlingRange = typeof rule.handlingFeePaise === "object" && rule.handlingFeePaise !== null;
      const handlingMin = isHandlingRange ? (rule.handlingFeePaise as any).minPaise : null;
      const handlingMax = isHandlingRange ? (rule.handlingFeePaise as any).maxPaise : null;
      const handlingVal = typeof rule.handlingFeePaise === "number" ? rule.handlingFeePaise : null;

      await prisma.platformFeeRule.upsert({
        where: {
          platform_locationKey: {
            platform: pid,
            locationKey: rule.locationKey,
          },
        },
        update: {
          deliveryFeePaise: typeof rule.deliveryFeePaise === "number" ? rule.deliveryFeePaise : null,
          handlingFeePaise: handlingVal,
          handlingFeeRangeMinPaise: handlingMin,
          handlingFeeRangeMaxPaise: handlingMax,
          platformFeePaise: typeof rule.platformFeePaise === "number" ? rule.platformFeePaise : null,
          freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
          minimumOrderValuePaise: rule.minimumOrderValuePaise,
          sourceType: rule.sourceType,
          observedAt: new Date(rule.observedAt),
          notes: rule.notes || [],
        },
        create: {
          platform: pid,
          locationKey: rule.locationKey,
          deliveryFeePaise: typeof rule.deliveryFeePaise === "number" ? rule.deliveryFeePaise : null,
          handlingFeePaise: handlingVal,
          handlingFeeRangeMinPaise: handlingMin,
          handlingFeeRangeMaxPaise: handlingMax,
          platformFeePaise: typeof rule.platformFeePaise === "number" ? rule.platformFeePaise : null,
          freeDeliveryThresholdPaise: rule.freeDeliveryThresholdPaise,
          minimumOrderValuePaise: rule.minimumOrderValuePaise,
          sourceType: rule.sourceType,
          observedAt: new Date(rule.observedAt),
          notes: rule.notes || [],
        },
      });
    }
  }
  console.log("Seeded platform fee rules with deliberate unknown fee on BigBasket.");

  // 3. Seed Products, Platform Listings, and Price Observations
  for (const prod of MOCK_PRODUCTS) {
    // Ensure category exists
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

    // Seed listings and observations per platform
    for (const pid of SUPPORTED_PLATFORMS) {
      const platData = prod.platformPrices[pid];
      if (platData) {
        await prisma.platformListing.upsert({
          where: {
            productId_platform: {
              productId: prod.id,
              platform: pid,
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
            currentPricePaise: platData.pricePaise || null,
            availability: platData.availability,
            isStale: platData.isStale,
            confidence: platData.confidence,
            sourceType: platData.sourceType,
            searchUrl: platData.searchUrl,
            lastObservedAt: platData.observedAt ? new Date(platData.observedAt) : new Date(),
          },
        });

        // Add observation history entry
        await prisma.priceObservation.create({
          data: {
            productId: prod.id,
            platform: pid,
            rawTitle: prod.name,
            pricePaise: platData.pricePaise || null,
            availability: platData.availability,
            locationKey: "delhi_110001",
            sourceType: platData.sourceType,
            confidence: platData.confidence,
            observedAt: platData.observedAt ? new Date(platData.observedAt) : new Date(),
            notes: platData.notes || [],
          },
        });
      }
    }
  }

  console.log(`Seeded ${MOCK_PRODUCTS.length} products with listings and observations.`);
  console.log("Database seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
