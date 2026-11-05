import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import {
  OptimizationRequestSchema,
  ShoppingHandoffRequestSchema,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  PlatformId,
  paiseToRupees,
  determinePriceVerificationStatus,
  calculateNormalizedUnitPrice,
} from "@groqai/shared";
import { ConnectorRegistry } from "./connectors/registry.js";
import {
  runOptimizationEngine,
  RequestedOptimizationItem,
  FeeRuleInput,
} from "./optimization/optimizer.js";
import { defaultMatcher } from "./matching/matchingService.js";
import { createNLParser } from "./services/naturalLanguageService.js";
import { CatalogBackgroundService } from "./services/catalogJobs.js";
import { GrocerySyncService } from "./services/grocerySyncService.js";
import { PostgresScrapeQueue } from "./ingestion/queue.js";
import { toObservation } from "./ingestion/normalize.js";

export function createServer(prisma: PrismaClient) {
  const app = express();
  const registry = new ConnectorRegistry(prisma);
  const catalogJobs = new CatalogBackgroundService(prisma, registry);
  const syncService = new GrocerySyncService(prisma, registry);
  const scrapeQueue = new PostgresScrapeQueue(prisma);
  const nlParser = createNLParser();

  // Live refresh is handled by the ingestion queue/worker. Instamart is
  // intentionally excluded because it is manual/assisted capture only.
  const INGESTION_PLATFORMS: PlatformId[] = ["blinkit", "zepto", "bigbasket"];

  async function enqueueProductRefresh(
    queries: string[],
    locationKey: string
  ): Promise<string[]> {
    const jobIds: string[] = [];
    for (const platform of INGESTION_PLATFORMS) {
      const jobId = await scrapeQueue.enqueue({
        platform,
        queries,
        locationKey,
        priority: 5,
      });
      jobIds.push(jobId);
    }
    return jobIds;
  }

  // Security Headers
  app.use(helmet());

  // CORS restricted to WEB_ORIGIN
  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origin === webOrigin || origin.startsWith("http://localhost:")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS policy"));
        }
      },
      credentials: true,
    })
  );

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api/", limiter);

  app.use(express.json());

  // Structured Logging Middleware (sanitizes addresses, tokens, cookies)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
      };
      // Never log headers containing cookies or auth
      console.log(JSON.stringify(logEntry));
    });
    next();
  });

  // --- API ROUTES ---

  // GET /api/health
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      mode: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      platforms: SUPPORTED_PLATFORMS.map((pid) => ({
        id: pid,
        name: PLATFORM_METADATA[pid].name,
        killSwitchActive: registry.isKillSwitchActive(pid),
      })),
    });
  });

  // GET /api/categories
  app.get("/api/categories", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
      });
      res.json(categories);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/products/search?q=&category=
  app.get("/api/products/search", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req.query.q as string) || "";
      const category = (req.query.category as string) || "";

      const whereClause: any = {};
      if (category) {
        whereClause.categoryId = category;
      }
      if (query) {
        const words = query.trim().split(/\s+/).filter(Boolean);
        if (words.length === 1) {
          whereClause.OR = [
            { name: { contains: words[0], mode: "insensitive" } },
            { brand: { contains: words[0], mode: "insensitive" } },
            { variant: { contains: words[0], mode: "insensitive" } },
          ];
        } else if (words.length > 1) {
          whereClause.AND = words.map((w) => ({
            OR: [
              { name: { contains: w, mode: "insensitive" } },
              { brand: { contains: w, mode: "insensitive" } },
              { variant: { contains: w, mode: "insensitive" } },
            ],
          }));
        }
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          listings: true,
        },
      });

      // Helper to transform Product into rich ProductSummary with all 14 sync fields
      function formatProductSummary(prod: any) {
        let lowestPricePaise = Infinity;
        let lowestPlatform: PlatformId = "blinkit";

        const platformPrices: any = {};
        for (const l of prod.listings || []) {
          const pid = l.platform as PlatformId;
          const pricePaise = l.currentPricePaise || undefined;
          const observedAtStr = l.lastObservedAt ? l.lastObservedAt.toISOString() : new Date().toISOString();
          const verificationStatus = determinePriceVerificationStatus(observedAtStr, l.sourceType, l.availability);
          const normalizedUnitPrice = pricePaise && prod.packSize
            ? calculateNormalizedUnitPrice(pricePaise, prod.packSize) || undefined
            : undefined;

          let originalPricePaise = prod.mrpPaise || undefined;
          let discountPercentage = prod.discountPercentage || 0;
          if (originalPricePaise && pricePaise && originalPricePaise > pricePaise) {
            discountPercentage = Math.round(((originalPricePaise - pricePaise) / originalPricePaise) * 100);
          }

          platformPrices[pid] = {
            pricePaise,
            priceRupees: pricePaise ? pricePaise / 100 : undefined,
            originalPricePaise,
            originalPriceRupees: originalPricePaise ? originalPricePaise / 100 : undefined,
            discountPercentage,
            availability: l.availability,
            isStale: l.isStale,
            observedAt: observedAtStr,
            sourceType: l.sourceType,
            confidence: l.confidence,
            verificationStatus,
            normalizedUnitPrice,
            productUrl: l.productUrl || undefined,
            searchUrl: l.searchUrl || `${PLATFORM_METADATA[pid].searchBaseUrl}${encodeURIComponent(prod.name)}`,
            serviceableArea: "Central Delhi",
          };

          if (l.availability === "available" && pricePaise && pricePaise < lowestPricePaise) {
            lowestPricePaise = pricePaise;
            lowestPlatform = pid;
          }
        }

        const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;
        const lowestNormalizedUnitPrice = effectiveLowest > 0 && prod.packSize
          ? calculateNormalizedUnitPrice(effectiveLowest, prod.packSize) || undefined
          : undefined;

        return {
          id: prod.id,
          name: prod.name,
          brand: prod.brand,
          category: prod.categoryId,
          variant: prod.variant,
          packSize: prod.packSize,
          normalizedUnitPrice: lowestNormalizedUnitPrice,
          rating: prod.rating || 4.7,
          reviewCount: prod.reviewCount || 100,
          lowestPricePaise: effectiveLowest,
          lowestPriceRupees: paiseToRupees(effectiveLowest),
          lowestPlatform,
          mrpPaise: prod.mrpPaise || undefined,
          mrpRupees: prod.mrpPaise ? paiseToRupees(prod.mrpPaise) : undefined,
          discountPercentage: prod.discountPercentage || 0,
          isOutOfStock: prod.isOutOfStock,
          isNew: prod.isNew,
          platformPrices,
        };
      }

      const forceRefresh = req.query.refresh === "true";
      const pincode = (req.query.pincode as string) || "110001";
      const locationKey = `delhi_${pincode}`;

      if (forceRefresh && products.length > 0) {
        // Enqueue real ingestion jobs instead of calling the legacy mock
        // connectors. The current cached rows are returned immediately; the
        // client can poll /api/ingestion/jobs/:id for completion.
        const refreshQueries = query
          ? [query]
          : products.slice(0, 5).map((p) => p.name);
        const jobIds = await enqueueProductRefresh(refreshQueries, locationKey);
        res.setHeader("X-Ingestion-Job-Ids", jobIds.join(","));
        res.setHeader("X-Ingestion-Status", "queued");
        return res.json(products.map(formatProductSummary));
      }

      res.json(products.map(formatProductSummary));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/products/:id
  app.get("/api/products/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const forceRefresh = req.query.refresh === "true";
      const pincode = (req.query.pincode as string) || "110001";
      const locationKey = `delhi_${pincode}`;

      const prod = await prisma.product.findUnique({
        where: { id },
        include: { listings: true },
      });

      if (!prod) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (forceRefresh) {
        const jobIds = await enqueueProductRefresh([prod.name], locationKey);
        res.setHeader("X-Ingestion-Job-Ids", jobIds.join(","));
        res.setHeader("X-Ingestion-Status", "queued");
      }

      let lowestPricePaise = Infinity;
      let lowestPlatform: PlatformId = "blinkit";
      const platformPrices: any = {};

      for (const l of prod.listings) {
        const pid = l.platform as PlatformId;
        const pricePaise = l.currentPricePaise || undefined;
        const observedAtStr = l.lastObservedAt ? l.lastObservedAt.toISOString() : new Date().toISOString();
        const verificationStatus = determinePriceVerificationStatus(observedAtStr, l.sourceType, l.availability);
        const normalizedUnitPrice = pricePaise && prod.packSize
          ? calculateNormalizedUnitPrice(pricePaise, prod.packSize) || undefined
          : undefined;

        let originalPricePaise = prod.mrpPaise || undefined;
        let discountPercentage = prod.discountPercentage || 0;
        if (originalPricePaise && pricePaise && originalPricePaise > pricePaise) {
          discountPercentage = Math.round(((originalPricePaise - pricePaise) / originalPricePaise) * 100);
        }

        platformPrices[pid] = {
          pricePaise,
          priceRupees: pricePaise ? pricePaise / 100 : undefined,
          originalPricePaise,
          originalPriceRupees: originalPricePaise ? originalPricePaise / 100 : undefined,
          discountPercentage,
          availability: l.availability,
          isStale: l.isStale,
          observedAt: observedAtStr,
          sourceType: l.sourceType,
          confidence: l.confidence,
          verificationStatus,
          normalizedUnitPrice,
          productUrl: l.productUrl || undefined,
          searchUrl: l.searchUrl || `${PLATFORM_METADATA[pid].searchBaseUrl}${encodeURIComponent(prod.name)}`,
          serviceableArea: "Central Delhi",
        };

        if (l.availability === "available" && pricePaise && pricePaise < lowestPricePaise) {
          lowestPricePaise = pricePaise;
          lowestPlatform = pid;
        }
      }

      const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;
      const normalizedUnitPrice = effectiveLowest > 0 && prod.packSize
        ? calculateNormalizedUnitPrice(effectiveLowest, prod.packSize) || undefined
        : undefined;

      res.json({
        id: prod.id,
        name: prod.name,
        brand: prod.brand,
        category: prod.categoryId,
        variant: prod.variant,
        packSize: prod.packSize,
        normalizedUnitPrice,
        rating: prod.rating || 4.7,
        reviewCount: prod.reviewCount || 100,
        lowestPricePaise: effectiveLowest,
        lowestPriceRupees: paiseToRupees(effectiveLowest),
        lowestPlatform,
        mrpPaise: prod.mrpPaise || undefined,
        mrpRupees: prod.mrpPaise ? paiseToRupees(prod.mrpPaise) : undefined,
        discountPercentage: prod.discountPercentage || 0,
        isOutOfStock: prod.isOutOfStock,
        isNew: prod.isNew,
        platformPrices,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/products/:id/refresh
  app.post("/api/products/:id/refresh", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pincode = req.body?.pincode || (req.query.pincode as string) || "110001";
      const locationKey = `delhi_${pincode}`;

      const prod = await prisma.product.findUnique({
        where: { id },
        include: { listings: true },
      });

      if (!prod) {
        return res.status(404).json({ error: "Product not found" });
      }

      const jobIds = await enqueueProductRefresh([prod.name], locationKey);
      res.setHeader("X-Ingestion-Job-Ids", jobIds.join(","));
      res.setHeader("X-Ingestion-Status", "queued");

      let lowestPricePaise = Infinity;
      let lowestPlatform: PlatformId = "blinkit";
      const platformPrices: any = {};

      for (const l of prod.listings) {
        const pid = l.platform as PlatformId;
        const pricePaise = l.currentPricePaise || undefined;
        const observedAtStr = l.lastObservedAt ? l.lastObservedAt.toISOString() : new Date().toISOString();
        const verificationStatus = determinePriceVerificationStatus(observedAtStr, l.sourceType, l.availability);
        const normalizedUnitPrice = pricePaise && prod.packSize
          ? calculateNormalizedUnitPrice(pricePaise, prod.packSize) || undefined
          : undefined;

        let originalPricePaise = prod.mrpPaise || undefined;
        let discountPercentage = prod.discountPercentage || 0;
        if (originalPricePaise && pricePaise && originalPricePaise > pricePaise) {
          discountPercentage = Math.round(((originalPricePaise - pricePaise) / originalPricePaise) * 100);
        }

        platformPrices[pid] = {
          pricePaise,
          priceRupees: pricePaise ? pricePaise / 100 : undefined,
          originalPricePaise,
          originalPriceRupees: originalPricePaise ? originalPricePaise / 100 : undefined,
          discountPercentage,
          availability: l.availability,
          isStale: l.isStale,
          observedAt: observedAtStr,
          sourceType: l.sourceType,
          confidence: l.confidence,
          verificationStatus,
          normalizedUnitPrice,
          productUrl: l.productUrl || undefined,
          searchUrl: l.searchUrl || `${PLATFORM_METADATA[pid].searchBaseUrl}${encodeURIComponent(prod.name)}`,
          serviceableArea: "Central Delhi",
        };

        if (l.availability === "available" && pricePaise && pricePaise < lowestPricePaise) {
          lowestPricePaise = pricePaise;
          lowestPlatform = pid;
        }
      }

      const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;
      const normalizedUnitPrice = effectiveLowest > 0 && prod.packSize
        ? calculateNormalizedUnitPrice(effectiveLowest, prod.packSize) || undefined
        : undefined;

      res.json({
        product: {
          id: prod.id,
          name: prod.name,
          brand: prod.brand,
          category: prod.categoryId,
          variant: prod.variant,
          packSize: prod.packSize,
          normalizedUnitPrice,
          rating: prod.rating || 4.7,
          reviewCount: prod.reviewCount || 100,
          lowestPricePaise: effectiveLowest,
          lowestPriceRupees: paiseToRupees(effectiveLowest),
          lowestPlatform,
          mrpPaise: prod.mrpPaise || undefined,
          mrpRupees: prod.mrpPaise ? paiseToRupees(prod.mrpPaise) : undefined,
          discountPercentage: prod.discountPercentage || 0,
          isOutOfStock: prod.isOutOfStock,
          isNew: prod.isNew,
          platformPrices,
        },
        refresh: {
          status: "queued",
          jobIds,
          platforms: INGESTION_PLATFORMS,
          queries: [prod.name],
          message: `Queued live refresh for ${INGESTION_PLATFORMS.join(", ")}`,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/products/sync
  app.post("/api/products/sync", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productIds = [], query, pincode = "110001", forceRefresh = false } = req.body;
      const locationKey = `delhi_${pincode}`;

      let idsToSync: string[] = productIds;
      if (idsToSync.length === 0 && query) {
        const prods = await prisma.product.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { brand: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 10,
        });
        idsToSync = prods.map((p) => p.id);
      }

      const outcomes: any[] = [];
      for (const pid of idsToSync) {
        try {
          const resSync = await syncService.syncProduct(pid, locationKey, { forceRefresh });
          outcomes.push(resSync);
        } catch (e: any) {
          outcomes.push({ productId: pid, error: e.message });
        }
      }

      res.json({
        timestamp: new Date().toISOString(),
        locationKey,
        totalSynced: outcomes.length,
        outcomes,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/sync/status
  app.get("/api/sync/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adapters = registry.getAllAdapters().map((ad) => ad.getStatus());
      const totalListings = await prisma.platformListing.count();
      const staleListings = await prisma.platformListing.count({ where: { isStale: true } });
      const recentObservations = await prisma.priceObservation.count({
        where: { observedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      });

      res.json({
        timestamp: new Date().toISOString(),
        adapters,
        cache: {
          totalListings,
          staleListings,
          freshListings: totalListings - staleListings,
          recentObservations1h: recentObservations,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/ingestion/refresh
  app.post("/api/ingestion/refresh", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries: string[] = Array.isArray(req.body.queries)
        ? req.body.queries
        : req.body.query
        ? [req.body.query]
        : [];
      const platforms: PlatformId[] =
        Array.isArray(req.body.platforms) && req.body.platforms.length > 0
          ? req.body.platforms
          : ["blinkit", "zepto", "bigbasket"];
      const locationKey = (req.body.locationKey as string) || "delhi_110001";
      const priority = Number(req.body.priority || 5);

      if (queries.length === 0) {
        return res.status(400).json({ error: "queries must be a non-empty array of strings" });
      }

      const jobIds: string[] = [];
      for (const p of platforms) {
        const jobId = await scrapeQueue.enqueue({
          platform: p,
          queries,
          locationKey,
          priority,
        });
        jobIds.push(jobId);
      }

      return res.status(202).json({
        status: "queued",
        jobId: jobIds[0],
        jobIds,
        platforms,
        queries,
        message: `Enqueued ${jobIds.length} ingestion jobs for processing`,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/ingestion/jobs/:id
  app.get("/api/ingestion/jobs/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.scrapeJob.findUnique({
        where: { id: req.params.id },
        include: { scrapeRun: true },
      });

      if (!job) {
        return res.status(404).json({ error: `Ingestion job ${req.params.id} not found` });
      }

      const runs = job.scrapeRunId
        ? await prisma.scrapeRun.findMany({ where: { id: job.scrapeRunId } })
        : [];

      return res.json({
        id: job.id,
        platform: job.platform,
        status: job.status,
        queries: job.queries,
        locationKey: job.locationKey,
        attempts: job.attempts,
        error: job.error,
        platformRuns: runs,
        itemsFound: job.scrapeRun?.itemsFound || 0,
        scheduledFor: job.scheduledFor.toISOString(),
        completedAt: job.completedAt?.toISOString() || null,
        createdAt: job.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/ingestion/status
  app.get("/api/ingestion/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queueDepth = await scrapeQueue.getStats();

      const lastRunByPlatform: Record<string, any> = {};
      for (const pid of SUPPORTED_PLATFORMS) {
        const lastRun = await prisma.scrapeRun.findFirst({
          where: { platform: pid },
          orderBy: { startedAt: "desc" },
        });
        lastRunByPlatform[pid] = lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              trigger: lastRun.trigger,
              itemsFound: lastRun.itemsFound,
              error: lastRun.error,
              startedAt: lastRun.startedAt.toISOString(),
              finishedAt: lastRun.finishedAt?.toISOString() || null,
            }
          : null;
      }

      const blockedPlatforms = SUPPORTED_PLATFORMS.filter(
        (pid) =>
          pid === "instamart" ||
          lastRunByPlatform[pid]?.status === "blocked" ||
          registry.isKillSwitchActive(pid)
      );

      return res.json({
        timestamp: new Date().toISOString(),
        queueDepth,
        lastRunByPlatform,
        blockedPlatforms,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/observations/manual
  app.post("/api/observations/manual", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        platform = "instamart",
        title,
        pricePaise,
        priceRupees,
        mrpPaise,
        packSize,
        pincode = "110001",
        productUrl,
        observedAt = new Date().toISOString(),
      } = req.body;

      if (!title) {
        return res.status(400).json({ error: "title is required" });
      }

      const calculatedPricePaise =
        pricePaise !== undefined
          ? Math.round(Number(pricePaise))
          : priceRupees !== undefined
          ? Math.round(Number(priceRupees) * 100)
          : undefined;

      if (calculatedPricePaise === undefined || calculatedPricePaise <= 0) {
        return res.status(400).json({ error: "Valid pricePaise or priceRupees is required" });
      }

      const allProducts = await prisma.product.findMany();
      let bestProd: any = null;
      let highestConf = -1;

      for (const cand of allProducts) {
        const m = defaultMatcher.match(
          { query: title, packSize },
          { id: cand.id, name: cand.name, brand: cand.brand, variant: cand.variant, packSize: cand.packSize }
        );
        if (m.isMatch && m.confidence > highestConf) {
          highestConf = m.confidence;
          bestProd = cand;
        }
      }

      const obs = toObservation(
        {
          platform: platform as PlatformId,
          title,
          brand: bestProd?.brand,
          variant: bestProd?.variant,
          packSize: packSize || bestProd?.packSize,
          pricePaise: calculatedPricePaise,
          originalPricePaise: mrpPaise ? Math.round(Number(mrpPaise)) : calculatedPricePaise,
          productUrl,
          pincode,
          serviceableArea: "Manual User Entry",
        },
        { pincode, locationKey: `loc_${pincode}` },
        {
          productId: bestProd?.id,
          sourceType: "manual",
          verificationStatus: "cached",
          confidence: highestConf > 0 ? highestConf : 0.9,
        }
      );

      // Persist PriceObservation
      const savedObs = await prisma.priceObservation.create({
        data: {
          productId: obs.productId,
          platform: obs.platform,
          rawTitle: obs.title,
          brand: obs.brand,
          variant: obs.variant,
          packSize: obs.packSize,
          pricePaise: obs.pricePaise,
          originalPricePaise: obs.originalPricePaise,
          currency: "INR",
          availability: "available",
          productUrl: obs.productUrl,
          pincode: obs.pincode,
          serviceableArea: obs.serviceableArea,
          normalizedUnitPricePaise: obs.normalizedUnitPricePaise,
          normalizedUnit: obs.normalizedUnit,
          sourceType: "manual",
          verificationStatus: "cached",
          confidence: obs.confidence,
          observedAt: new Date(obs.observedAt),
          fetchedAt: new Date(),
          notes: ["User-submitted manual observation via /api/observations/manual"],
        },
      });

      // If matched with existing product, upsert listing
      if (bestProd) {
        await prisma.platformListing.upsert({
          where: {
            productId_platform: {
              productId: bestProd.id,
              platform: platform as PlatformId,
            },
          },
          create: {
            productId: bestProd.id,
            platform,
            currentPricePaise: calculatedPricePaise,
            availability: "available",
            isStale: false,
            confidence: obs.confidence,
            sourceType: "manual",
            lastObservedAt: new Date(obs.observedAt),
            productUrl,
          },
          update: {
            currentPricePaise: calculatedPricePaise,
            availability: "available",
            isStale: false,
            confidence: obs.confidence,
            sourceType: "manual",
            lastObservedAt: new Date(obs.observedAt),
            productUrl: productUrl || undefined,
          },
        });
      }

      return res.status(201).json({
        message: "Manual observation recorded successfully",
        observation: savedObs,
        matchedProduct: bestProd
          ? { id: bestProd.id, name: bestProd.name, confidence: highestConf }
          : null,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/comparisons
  app.post("/api/comparisons", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productIds = req.body.productIds || [];
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { listings: true },
      });
      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/grocery-lists
  app.post("/api/grocery-lists", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { locationId = "delhi_110001", pincode = "110001", items = [] } = req.body;
      const list = await prisma.groceryList.create({
        data: {
          locationId,
          pincode,
          items: {
            create: items.map((it: any) => ({
              query: it.query,
              quantity: it.quantity || 1,
              unit: it.unit || "pcs",
              requiredVariant: it.requiredVariant,
              allowSubstitutions: it.allowSubstitutions || false,
            })),
          },
        },
        include: { items: true },
      });
      res.status(201).json(list);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/grocery-lists/:id/items
  app.post("/api/grocery-lists/:id/items", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { query, quantity = 1, unit = "pcs", requiredVariant, allowSubstitutions = false } = req.body;

      const item = await prisma.groceryListItem.create({
        data: {
          listId: id,
          query,
          quantity,
          unit,
          requiredVariant,
          allowSubstitutions,
        },
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/optimizations
  app.post("/api/optimizations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = OptimizationRequestSchema.parse(req.body);

      // 1. Fetch fee rules for location from database
      const feeRuleRecords = await prisma.platformFeeRule.findMany({
        where: { locationKey: parsed.locationId },
      });

      const feeRules: Record<PlatformId, FeeRuleInput> = {
        blinkit: { platform: "blinkit", deliveryFeePaise: 1500, handlingFeePaise: 400, platformFeePaise: 300, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 9900 },
        zepto: { platform: "zepto", deliveryFeePaise: 2500, handlingFeePaise: 500, platformFeePaise: 200, freeDeliveryThresholdPaise: 14900, minimumOrderValuePaise: 9900 },
        instamart: { platform: "instamart", deliveryFeePaise: 3000, handlingFeePaise: 500, platformFeePaise: 400, freeDeliveryThresholdPaise: 19900, minimumOrderValuePaise: 10000 },
        bigbasket: { platform: "bigbasket", deliveryFeePaise: 3000, handlingFeePaise: null, handlingFeeRangeMinPaise: 500, handlingFeeRangeMaxPaise: 1500, platformFeePaise: 300, freeDeliveryThresholdPaise: 25000, minimumOrderValuePaise: 15000 },
      };

      for (const r of feeRuleRecords) {
        const pid = r.platform as PlatformId;
        feeRules[pid] = {
          platform: pid,
          deliveryFeePaise: r.deliveryFeePaise,
          handlingFeePaise: r.handlingFeePaise,
          handlingFeeRangeMinPaise: r.handlingFeeRangeMinPaise,
          handlingFeeRangeMaxPaise: r.handlingFeeRangeMaxPaise,
          platformFeePaise: r.platformFeePaise,
          freeDeliveryThresholdPaise: r.freeDeliveryThresholdPaise,
          minimumOrderValuePaise: r.minimumOrderValuePaise,
        };
      }

      // 2. Fetch products and match items
      const allProducts = await prisma.product.findMany({
        include: { listings: true },
      });

      const unmatchedWarnings: string[] = [];
      const optimizationItems: RequestedOptimizationItem[] = [];

      parsed.items.forEach((it, idx) => {
        const q = it.query.toLowerCase().trim();

        // Use matcher to score candidates
        let bestProd: any = null;
        let highestConfidence = -1;

        for (const prod of allProducts) {
          const matchResult = defaultMatcher.match(
            { query: q, variant: it.requiredVariant, allowSubstitutions: it.allowSubstitutions },
            { id: prod.id, name: prod.name, brand: prod.brand, variant: prod.variant, packSize: prod.packSize }
          );
          if (matchResult.isMatch && matchResult.confidence > highestConfidence) {
            highestConfidence = matchResult.confidence;
            bestProd = prod;
          }
        }

        if (!bestProd) {
          unmatchedWarnings.push(`Item "${it.query}" could not be matched in catalog (item_not_found) and was excluded.`);
          return;
        }

        const listingsMap: Record<PlatformId, any> = {
          blinkit: { platform: "blinkit", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          zepto: { platform: "zepto", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          instamart: { platform: "instamart", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
          bigbasket: { platform: "bigbasket", pricePaise: null, availability: "unavailable", isStale: false, confidence: 0, sourceType: "mock" },
        };

        for (const l of bestProd.listings) {
          const pid = l.platform as PlatformId;
          listingsMap[pid] = {
            platform: pid,
            pricePaise: l.currentPricePaise,
            availability: l.availability,
            isStale: l.isStale,
            confidence: l.confidence,
            sourceType: l.sourceType,
            searchUrl: l.searchUrl || undefined,
          };
        }

        optimizationItems.push({
          id: `item-${idx}-${bestProd.id}`,
          query: it.query,
          quantity: it.quantity,
          unit: it.unit,
          matchedTitle: bestProd.name,
          brand: bestProd.brand,
          variant: bestProd.variant,
          packSize: bestProd.packSize,
          listings: listingsMap,
        });
      });

      if (optimizationItems.length === 0) {
        return res.status(400).json({
          error: "None of the requested items could be matched in the catalog.",
          warnings: unmatchedWarnings,
        });
      }

      // 3. Run pure optimization engine
      const optResult = runOptimizationEngine({
        items: optimizationItems,
        feeRules,
        maxPlatforms: parsed.preferences?.maxPlatforms || 3,
        minimumSavingsPaise: parsed.preferences?.minimumSavingsPaise || 2000,
        budgetPaise: parsed.preferences?.budgetPaise,
      });

      const optId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // 4. Save to database
      await prisma.optimizationResult.create({
        data: {
          id: optId,
          locationId: parsed.locationId,
          pincode: parsed.pincode,
          baselineName: optResult.baselineName,
          baselineTotalPaise: optResult.baselineTotalPaise,
          optionsJson: JSON.stringify(optResult.options),
          warnings: [...unmatchedWarnings, ...optResult.warnings],
        },
      });

      res.status(201).json({
        id: optId,
        locationId: parsed.locationId,
        pincode: parsed.pincode,
        createdAt: new Date().toISOString(),
        baselineName: optResult.baselineName,
        baselineTotalPaise: optResult.baselineTotalPaise,
        baselineTotalRupees: optResult.baselineTotalRupees,
        options: optResult.options,
        warnings: [...unmatchedWarnings, ...optResult.warnings],
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: err.errors });
      }
      next(err);
    }
  });

  // GET /api/optimizations/:id
  app.get("/api/optimizations/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await prisma.optimizationResult.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        return res.status(404).json({ error: "Optimization result not found" });
      }

      const options = JSON.parse(record.optionsJson);

      res.json({
        id: record.id,
        locationId: record.locationId,
        pincode: record.pincode,
        createdAt: record.createdAt.toISOString(),
        baselineName: record.baselineName,
        baselineTotalPaise: record.baselineTotalPaise,
        baselineTotalRupees: paiseToRupees(record.baselineTotalPaise),
        options,
        warnings: record.warnings,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/platforms
  app.get("/api/platforms", (req: Request, res: Response) => {
    const statuses = SUPPORTED_PLATFORMS.map((pid) => {
      const conn = registry.getConnectorSafe(pid);
      const adapter = registry.getAdapterSafe(pid);
      const adapterStatus = adapter?.getStatus();
      const isKilled = registry.isKillSwitchActive(pid);
      const metrics = registry.getMetrics(pid);
      const mode = registry.getMode(pid);

      return {
        id: pid,
        name: PLATFORM_METADATA[pid].name,
        adapterName: adapter?.getAdapterName() || PLATFORM_METADATA[pid].name,
        mode,
        enabled: !isKilled,
        hasApiCredentials: adapterStatus?.hasApiCredentials ?? false,
        capabilities: conn ? conn.getCapabilities() : PLATFORM_METADATA[pid].defaultCapabilities,
        status: isKilled ? "disabled" : "healthy",
        lastChecked: new Date().toISOString(),
        lastSuccessfulFetch: adapterStatus?.lastSuccessfulFetch ?? null,
        latencyMs: metrics.avgLatencyMs,
        errorRate: metrics.errorRate,
        notes: [
          `Active integration mode: ${mode.toUpperCase()}`,
          `Cart creation: UNSUPPORTED (NullCartAdapter active)`,
          `Kill switch state: ${isKilled ? "ACTIVE (Disabled)" : "Inactive (Enabled)"}`,
          ...(metrics.circuitBreaker?.state === "OPEN"
            ? ["Circuit breaker: OPEN (Outbound requests paused)"]
            : []),
          ...(adapterStatus?.hasApiCredentials
            ? ["Official API credentials configured on server"]
            : ["No API credentials configured — running in honest sandbox/links mode"]),
        ],
        metrics,
      };
    });
    res.json(statuses);
  });

  // GET /api/connectors/health
  app.get("/api/connectors/health", async (req: Request, res: Response) => {
    const jobMetrics = await catalogJobs.runMaintenanceCycle();
    const connectors = SUPPORTED_PLATFORMS.map((pid) => {
      const conn = registry.getConnectorSafe(pid);
      const isKilled = registry.isKillSwitchActive(pid);
      const metrics = registry.getMetrics(pid);
      return {
        platform: pid,
        name: PLATFORM_METADATA[pid].name,
        mode: registry.getMode(pid),
        isKillSwitchActive: isKilled,
        status: isKilled ? "disabled" : "healthy",
        metrics,
        capabilities: conn ? conn.getCapabilities() : null,
      };
    });

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      connectors,
      backgroundJobs: jobMetrics,
    });
  });

  // POST /api/admin/platforms/:id/kill-switch
  app.post("/api/admin/platforms/:id/kill-switch", (req: Request, res: Response) => {
    const pid = req.params.id as PlatformId;
    if (!SUPPORTED_PLATFORMS.includes(pid)) {
      return res.status(404).json({ error: `Platform ${req.params.id} not recognized` });
    }
    registry.setKillSwitch(pid, true);
    res.json({
      success: true,
      platform: pid,
      killSwitchActive: true,
      message: `Connector for ${pid} disabled immediately by kill switch.`,
    });
  });

  // DELETE /api/admin/platforms/:id/kill-switch
  app.delete("/api/admin/platforms/:id/kill-switch", (req: Request, res: Response) => {
    const pid = req.params.id as PlatformId;
    if (!SUPPORTED_PLATFORMS.includes(pid)) {
      return res.status(404).json({ error: `Platform ${req.params.id} not recognized` });
    }
    registry.setKillSwitch(pid, false);
    res.json({
      success: true,
      platform: pid,
      killSwitchActive: false,
      message: `Connector for ${pid} re-enabled.`,
    });
  });

  // POST /api/admin/platforms/:id/mode
  app.post("/api/admin/platforms/:id/mode", (req: Request, res: Response) => {
    const pid = req.params.id as PlatformId;
    const { mode } = req.body;
    if (!SUPPORTED_PLATFORMS.includes(pid)) {
      return res.status(404).json({ error: `Platform ${req.params.id} not recognized` });
    }
    const validModes = ["mock", "manual", "partner_feed", "authorized_api", "permitted_page", "links_only"];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode '${mode}'. Expected one of: ${validModes.join(", ")}` });
    }
    registry.setMode(pid, mode);
    res.json({
      success: true,
      platform: pid,
      mode,
      message: `Platform ${pid} integration mode set to '${mode}'.`,
    });
  });

  // POST /api/shopping-handoff
  app.post("/api/shopping-handoff", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ShoppingHandoffRequestSchema.parse(req.body);
      const record = await prisma.optimizationResult.findUnique({
        where: { id: parsed.optimizationId },
      });

      if (!record) {
        return res.status(404).json({ error: "Optimization not found for handoff" });
      }

      const options = JSON.parse(record.optionsJson);
      const chosenOption = options.find((o: any) => o.strategy === parsed.strategy) || options[0];

      let anyCartCreated = false;

      const platformsList = chosenOption
        ? await Promise.all(
            Object.entries(chosenOption.perPlatform).map(async ([pid, plan]: [string, any]) => {
              const platformKey = pid as PlatformId;
              const meta = PLATFORM_METADATA[platformKey];
              const cartAdapter = registry.getCartAdapter(platformKey);

              // Check if automated cart creation is supported
              const cartResult = await cartAdapter.createCart({
                platform: platformKey,
                locationKey: record.locationId,
                items: plan.items.map((it: any) => ({
                  productId: it.id,
                  query: it.requestedQuery,
                  matchedTitle: it.matchedTitle,
                  quantity: it.quantity,
                  packSize: it.packSize,
                })),
              });

              if (cartResult.success) {
                anyCartCreated = true;
              }

              const checklistText = [
                `🛒 ${meta.name} Shopping List (GroqAI Plan: ${chosenOption.title})`,
                `Estimated Total: ₹${plan.estimatedTotalRupees} (Subtotal ₹${plan.subtotalRupees} + Fees ₹${
                  plan.deliveryFeeRupees + plan.handlingFeeRupees + plan.platformFeeRupees
                })`,
                `----------------------------------------`,
                ...plan.items.map(
                  (it: any, idx: number) =>
                    `${idx + 1}. [ ] ${it.matchedTitle} (${it.packSize}) x ${it.quantity} - Est ₹${it.totalPriceRupees}`
                ),
                `----------------------------------------`,
                `Open ${meta.name}: ${meta.websiteUrl}`,
              ].join("\n");

              return {
                platform: platformKey,
                platformName: meta.name,
                items: plan.items.map((it: any) => ({
                  title: it.matchedTitle,
                  brand: it.brand,
                  variant: it.variant,
                  quantity: it.quantity,
                  unitPriceRupees: it.unitPriceRupees,
                  totalPriceRupees: it.totalPriceRupees,
                  productUrl: undefined,
                  searchUrl: it.searchUrl || `${meta.searchBaseUrl}${encodeURIComponent(it.matchedTitle)}`,
                  isDeepLink: false,
                })),
                subtotalRupees: plan.subtotalRupees,
                estimatedFeesRupees:
                  plan.deliveryFeeRupees + plan.handlingFeeRupees + plan.platformFeeRupees,
                hasUnknownFees: plan.hasUnknownFee,
                estimatedTotalRupees: plan.estimatedTotalRupees,
                meetsMinimumOrder: plan.meetsMinimumOrder,
                checklistText,
                cartReviewUrl: cartResult.cartReviewUrl || meta.websiteUrl,
              };
            })
          )
        : [];

      res.status(200).json({
        handoffId: `hnd-${Date.now()}`,
        optimizationId: parsed.optimizationId,
        strategy: parsed.strategy,
        timestamp: new Date().toISOString(),
        method: anyCartCreated ? "automated_cart" : "links_and_checklist",
        isEstimate: true,
        notice:
          "Verify basket, address, fees and total in the app. Payment happens on the platform, not on GroqAI.",
        platforms: platformsList,
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: err.errors });
      }
      next(err);
    }
  });

  // OpenAPI Specification endpoint
  app.get("/api/docs/openapi.json", (req: Request, res: Response) => {
    res.json({
      openapi: "3.0.0",
      info: {
        title: "GroqAI Grocery Price Comparison & Basket Optimizer API",
        version: "1.0.0",
        description:
          "Deterministic grocery price comparison and basket optimizer for Indian quick-commerce (Blinkit, Zepto, Swiggy Instamart, BigBasket).",
      },
      servers: [{ url: `http://localhost:${process.env.API_PORT || 5001}` }],
      paths: {
        "/api/health": { get: { summary: "Health check and uptime" } },
        "/api/categories": { get: { summary: "List grocery categories" } },
        "/api/products/search": { get: { summary: "Search grocery products with multi-store prices" } },
        "/api/products/{id}": { get: { summary: "Get product details with platform listings" } },
        "/api/optimizations": { post: { summary: "Calculate 3-strategy basket optimization" } },
        "/api/optimizations/{id}": { get: { summary: "Retrieve optimization result" } },
        "/api/platforms": { get: { summary: "List platform connector capabilities and health" } },
        "/api/shopping-handoff": { post: { summary: "Generate merchant purchase checklist & links" } },
      },
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred",
    });
  });

  return app;
}
