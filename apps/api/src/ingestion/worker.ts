import { PrismaClient } from "@prisma/client";
import { PlatformId, LocationContext } from "@groqai/shared";
import { PostgresScrapeQueue } from "./queue.js";
import { browserManager } from "./browser/manager.js";
import { getPlatformScraper } from "./platforms/index.js";
import { toObservation } from "./normalize.js";
import { validateRawObservations } from "./validate.js";
import { ConnectorRegistry } from "../connectors/registry.js";
import { defaultMatcher } from "../matching/matchingService.js";
import { ListingCandidate, isBetterListingCandidate } from "./listingCandidate.js";

export class IngestionWorker {
  private prisma: PrismaClient;
  private queue: PostgresScrapeQueue;
  private registry: ConnectorRegistry;
  private workerId: string;
  private isRunning: boolean = false;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.queue = new PostgresScrapeQueue(this.prisma);
    this.registry = new ConnectorRegistry(this.prisma);
    this.workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async runSingleJob(): Promise<boolean> {
    // Recover any jobs that got stuck if previous process crashed
    await this.queue.recoverStuckJobs(120000);

    // Remove live listings created before the 0.7 confidence guard. These are
    // legacy fuzzy matches (e.g. a buffalo-milk listing attached to a cow-milk
    // product) and must never be presented as verified prices.
    await this.prisma.platformListing.deleteMany({
      where: {
        sourceType: { in: ["permitted_page", "authorized_api", "partner_feed"] },
        confidence: { lt: 0.7 },
      },
    });

    const job = await this.queue.claimNext(this.workerId);
    if (!job) {
      return false;
    }

    console.log(`[Worker ${this.workerId}] Claimed job ${job.id} for ${job.platform} (${job.queries.length} queries)`);
    await this.processJob(job);
    return true;
  }

  async processJob(job: any): Promise<void> {
    const platform = job.platform as PlatformId;

    // 1. Check emergency kill switch
    if (this.registry.isKillSwitchActive(platform)) {
      console.warn(`[Worker] Platform ${platform} kill switch active. Aborting job ${job.id}.`);
      await this.queue.markBlocked(job.id, `Platform ${platform} disabled by kill switch`);
      return;
    }

    // 2. Enforce compliance: Instamart is manual/assisted only
    if (platform === "instamart") {
      console.info(`[Worker] Instamart is manual/assisted only. Automated scraping blocked.`);
      await this.queue.markBlocked(job.id, `Instamart does not support automated scraping (manual/assisted only)`);
      return;
    }

    // 3. Create ScrapeRun record
    const run = await this.prisma.scrapeRun.create({
      data: {
        platform,
        locationKey: job.locationKey || "delhi_110001",
        trigger: "on_demand",
        status: "running",
        queries: job.queries,
        itemsFound: 0,
      },
    });

    const jobLocationKey = job.locationKey || "delhi_110001";
    const storedLocation = await this.prisma.location.findUnique({
      where: { locationKey: jobLocationKey },
    });

    const location: LocationContext = storedLocation
      ? {
          locationKey: storedLocation.locationKey,
          pincode: storedLocation.pincode,
          city: storedLocation.city,
          latitude: storedLocation.latitude,
          longitude: storedLocation.longitude,
          serviceableArea: storedLocation.serviceableArea || undefined,
        }
      : {
          locationKey: jobLocationKey,
          pincode: jobLocationKey.split("_")[1] || "110001",
          city: "Delhi",
          latitude: 28.6304,
          longitude: 77.2177,
          serviceableArea: "Central Delhi",
        };

    if (!storedLocation) {
      console.warn(
        `[Worker] No Location row for ${jobLocationKey}; using Delhi fallback coordinates`
      );
    }

    let totalItemsFound = 0;
    let isBlocked = false;
    let blockReason: string | undefined;
    const listingCandidates = new Map<string, ListingCandidate>();

    try {
      const scraper = getPlatformScraper(platform);

      // Preload all catalog products for matching
      const allCatalogProducts = await this.prisma.product.findMany({
        include: { listings: true },
      });

      for (const query of job.queries) {
        console.log(`[Worker] Scraping query "${query}" on ${platform}...`);
        const result = await browserManager.scrapePlatform(scraper, {
          platform,
          query,
          location,
          scrapeRunId: run.id,
        });

        if (result.isBlocked) {
          isBlocked = true;
          blockReason = result.error || "Anti-bot challenge encountered";
          console.error(`[Worker] Platform ${platform} challenge blocked job: ${blockReason}`);
          break;
        }

        const validObservations = validateRawObservations(result.observations);
        console.log(`[Worker] Intercepted ${validObservations.length} valid observations for "${query}"`);

        for (const raw of validObservations) {
          // Find matching catalog product
          let matchedCatalogProd: any = null;
          let bestConfidence = -1;

          for (const cand of allCatalogProducts) {
            const m = defaultMatcher.match(
              {
                query: raw.title,
                brand: raw.brand,
                variant: raw.variant,
                packSize: raw.packSize,
              },
              {
                id: cand.id,
                name: cand.name,
                brand: cand.brand,
                variant: cand.variant,
                packSize: cand.packSize,
              }
            );

            // High-confidence threshold: an unmatched price is safer than a
            // wrong-product match. Brand + pack size guards are enforced by
            // the matcher when those fields are present.
            if (m.isMatch && m.confidence >= 0.7 && m.confidence > bestConfidence) {
              bestConfidence = m.confidence;
              matchedCatalogProd = cand;
            }
          }

          const obs = toObservation(raw, location, {
            productId: matchedCatalogProd ? matchedCatalogProd.id : undefined,
            scrapeRunId: run.id,
            sourceType: "permitted_page",
            verificationStatus: "live_verified",
            confidence: matchedCatalogProd ? bestConfidence : 0,
          });

          // Persist PriceObservation to DB
          await this.prisma.priceObservation.create({
            data: {
              productId: obs.productId,
              platform: obs.platform,
              externalId: obs.externalId,
              rawTitle: obs.title,
              brand: obs.brand,
              variant: obs.variant,
              packSize: obs.packSize,
              quantity: obs.quantity,
              unit: obs.unit,
              pricePaise: obs.pricePaise,
              originalPricePaise: obs.originalPricePaise,
              discountPercentage: obs.discountPercentage,
              currency: obs.currency,
              availability: obs.availability || "available",
              productUrl: obs.productUrl,
              imageUrl: obs.imageUrl,
              searchUrl: obs.searchUrl,
              locationKey: obs.locationKey,
              pincode: obs.pincode,
              serviceableArea: obs.serviceableArea,
              latitude: obs.latitude,
              longitude: obs.longitude,
              normalizedUnitPricePaise: obs.normalizedUnitPricePaise,
              normalizedUnit: obs.normalizedUnit,
              sourceType: obs.sourceType,
              verificationStatus: obs.verificationStatus,
              confidence: obs.confidence,
              observedAt: new Date(obs.observedAt),
              fetchedAt: new Date(obs.fetchedAt || Date.now()),
              scrapeRunId: run.id,
            },
          });

          // If matched with catalog product, nominate it for listing update.
          // Multiple raw observations can map to the same product (pouch,
          // tetra, combo, unavailable variants). Raw observations are all
          // persisted; only one deterministic representative becomes the
          // listing for this run.
          if (matchedCatalogProd && obs.pricePaise !== undefined) {
            const observationLocationKey = obs.locationKey || location.locationKey;
            const listingKey = `${matchedCatalogProd.id}|${platform}|${observationLocationKey}`;
            const candidate: ListingCandidate = {
              productId: matchedCatalogProd.id,
              platform,
              locationKey: observationLocationKey,
              observation: obs,
              confidence: obs.confidence ?? 0,
            };
            const existing = listingCandidates.get(listingKey);
            if (!existing || isBetterListingCandidate(candidate, existing)) {
              listingCandidates.set(listingKey, candidate);
            }
          }

          totalItemsFound++;
        }
      }

      for (const candidate of listingCandidates.values()) {
        const obs = candidate.observation;
        await this.prisma.platformListing.upsert({
          where: {
            productId_platform_locationKey: {
              productId: candidate.productId,
              platform: candidate.platform,
              locationKey: candidate.locationKey,
            },
          },
          create: {
            productId: candidate.productId,
            platform: candidate.platform,
            locationKey: candidate.locationKey,
            externalId: obs.externalId,
            currentPricePaise: obs.pricePaise,
            availability: obs.availability || "available",
            isStale: false,
            confidence: candidate.confidence,
            sourceType: obs.sourceType,
            lastObservedAt: new Date(obs.observedAt),
            productUrl: obs.productUrl,
            searchUrl: obs.searchUrl,
          },
          update: {
            externalId: obs.externalId,
            currentPricePaise: obs.pricePaise,
            availability: obs.availability || "available",
            isStale: false,
            confidence: candidate.confidence,
            sourceType: obs.sourceType,
            lastObservedAt: new Date(obs.observedAt),
            productUrl: obs.productUrl || undefined,
            searchUrl: obs.searchUrl || undefined,
          },
        });
      }

      if (isBlocked) {
        await this.prisma.scrapeRun.update({
          where: { id: run.id },
          data: {
            status: "blocked",
            error: blockReason,
            finishedAt: new Date(),
            itemsFound: totalItemsFound,
          },
        });
        await this.queue.markBlocked(job.id, blockReason || "Anti-bot challenge blocked run");
      } else {
        await this.prisma.scrapeRun.update({
          where: { id: run.id },
          data: {
            status: "completed",
            finishedAt: new Date(),
            itemsFound: totalItemsFound,
          },
        });
        await this.queue.complete(job.id, run.id);
        console.log(`[Worker] Job ${job.id} completed. ${totalItemsFound} items recorded.`);
      }
    } catch (err: any) {
      console.error(`[Worker] Job ${job.id} execution error:`, err);
      await this.prisma.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: err.message,
          finishedAt: new Date(),
          itemsFound: totalItemsFound,
        },
      });
      await this.queue.fail(job.id, err.message, true);
    }
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Ingestion worker started.`);

    while (this.isRunning) {
      try {
        const processed = await this.runSingleJob();
        if (!processed) {
          // Queue empty, sleep 2s
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Error in loop:`, err.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await browserManager.closeAll();
    await this.prisma.$disconnect();
    console.log(`[Worker ${this.workerId}] Worker stopped cleanly.`);
  }
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  const worker = new IngestionWorker();
  const runOnce = process.argv.includes("--once");

  const shutdown = async () => {
    console.log("\nReceived shutdown signal. Stopping worker...");
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (runOnce) {
    console.log("Running single worker pass (--once)...");
    worker
      .runSingleJob()
      .then((processed) => {
        console.log(`Single job pass finished. Processed job: ${processed}`);
        return worker.stop();
      })
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("Worker run error:", err);
        process.exit(1);
      });
  } else {
    worker.start().catch((err) => {
      console.error("Worker fatal error:", err);
      process.exit(1);
    });
  }
}

