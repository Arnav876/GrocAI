import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID, timingSafeEqual } from "crypto";
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
  NullCartAdapter,
  PINCODE_REGEX,
  parseAndNormalizeQuantityWithPrice,
} from "@groqai/shared";
import { ConnectorRegistry } from "./connectors/registry.js";
import {
  runOptimizationEngine,
  RequestedOptimizationItem,
} from "./optimization/optimizer.js";
import { defaultMatcher } from "./matching/matchingService.js";
import { createNLParser } from "./services/naturalLanguageService.js";
import { CatalogBackgroundService } from "./services/catalogJobs.js";
import { GrocerySyncService } from "./services/grocerySyncService.js";
import { FeeIntelligenceService } from "./services/feeIntelligence.js";
import { DataProvenanceService } from "./services/dataProvenance.js";
import { OptimizationService } from "./services/optimizationService.js";
import {
  ShoppingHandoffService,
  buildPlatformSearchDeepLink,
} from "./services/shoppingHandoffService.js";
import { SEED_CANONICAL_PRODUCTS } from "./fixtures/seedFixtures.js";
import { PostgresScrapeQueue } from "./ingestion/queue.js";
import { toObservation } from "./ingestion/normalize.js";
import { createManualAssistedObservation } from "./ingestion/payloadNormalizers.js";
import { openapiSpecification } from "./docs/openapiSpec.js";
import { obscuraService } from "./ingestion/browser/obscuraService.js";

export interface ServerOptions {
  /**
   * Shared secret for /api/admin and fee-write endpoints. When omitted,
   * process.env.ADMIN_API_KEY is used. When neither is set, admin routes stay
   * open for local development and responses advertise that explicitly.
   */
  adminApiKey?: string | null;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function createServer(prisma: PrismaClient, options: ServerOptions = {}) {
  const app = express();
  const adminApiKey =
    options.adminApiKey !== undefined
      ? options.adminApiKey
      : process.env.ADMIN_API_KEY || null;
  const registry = new ConnectorRegistry(prisma);
  const catalogJobs = new CatalogBackgroundService(prisma, registry);
  const syncService = new GrocerySyncService(prisma, registry);
  const scrapeQueue = new PostgresScrapeQueue(prisma);
  const feeIntelligence = new FeeIntelligenceService(prisma);
  const optimizationService = new OptimizationService(prisma, feeIntelligence);
  const dataProvenance = new DataProvenanceService(prisma);
  const nlParser = createNLParser();

  // Live refresh is handled by the ingestion queue/worker. Instamart is
  // intentionally excluded because it is manual/assisted capture only.
  const INGESTION_PLATFORMS: PlatformId[] = ["blinkit", "zepto", "bigbasket"];

  function resolveLocationKey(pincode: string): string {
    if (pincode === "560064") return "bengaluru_560064";
    if (pincode === "560001") return "bengaluru_560001";
    return `delhi_${pincode}`;
  }

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

  // Correlation ID for every request. Clients may supply one for tracing;
  // otherwise a UUID is generated and returned in the response header.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const supplied = req.get("x-request-id");
    const requestId =
      supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!adminApiKey) {
      res.setHeader("X-Admin-Auth", "disabled");
      return next();
    }

    const bearer = req.get("authorization")?.startsWith("Bearer ")
      ? req.get("authorization")!.slice("Bearer ".length)
      : undefined;
    const provided = req.get("x-admin-key") || bearer;

    if (provided && timingSafeStringEqual(provided, adminApiKey)) {
      res.setHeader("X-Admin-Auth", "ok");
      return next();
    }

    return res.status(401).json({
      error: "Admin authentication required",
      requestId: res.locals.requestId,
    });
  };

  // Protect destructive/admin-only operations. User-facing refresh endpoints
  // remain open because they only enqueue read-only ingestion jobs.
  app.use("/api/admin", requireAdminAuth);

  // Structured Logging Middleware (sanitizes addresses, tokens, cookies)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
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
    const uptimeSeconds = process.uptime();
    res.json({
      status: "ok",
      uptime: uptimeSeconds,
      uptimeSeconds,
      mode: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      adminAuthEnabled: Boolean(adminApiKey),
      platformKillSwitches: {
        blinkit: registry.isKillSwitchActive("blinkit"),
        zepto: registry.isKillSwitchActive("zepto"),
        bigbasket: registry.isKillSwitchActive("bigbasket"),
        instamart: registry.isKillSwitchActive("instamart"),
      },
      ingestionModes: {
        blinkit: "headed_worker",
        zepto: "headed_worker",
        bigbasket: "headed_worker",
        instamart: "manual_assisted",
      },
      capabilities: NullCartAdapter.getCapabilities(),
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
      const pincode = (req.query.pincode as string) || "110001";

      if (req.query.pincode && !PINCODE_REGEX.test(req.query.pincode as string)) {
        return res.status(400).json({
          error: `Invalid pincode: ${req.query.pincode}. Must be a valid 6-digit Indian postal code.`,
        });
      }

      const locationKey = resolveLocationKey(pincode);

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
        let relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === locationKey);
        if (relevantListings.length === 0) {
          relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "bengaluru_560064");
        }
        if (relevantListings.length === 0) {
          relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "delhi_110001");
        }

        for (const l of relevantListings) {
          const pid = l.platform as PlatformId;
          const pricePaise = l.currentPricePaise || undefined;
          const observedAtStr = l.lastObservedAt ? l.lastObservedAt.toISOString() : new Date().toISOString();
          const verificationStatus = determinePriceVerificationStatus(observedAtStr, l.sourceType, l.availability);
          const normalizedUnitPrice = pricePaise && prod.packSize
            ? calculateNormalizedUnitPrice(pricePaise, prod.packSize) || undefined
            : undefined;

          let normalizedUnitPricePaise = normalizedUnitPrice?.pricePerUnitPaise;
          let referenceUnit = normalizedUnitPrice?.unit;
          if (pricePaise && prod.packSize) {
            try {
              const norm = parseAndNormalizeQuantityWithPrice(prod.packSize, pricePaise);
              normalizedUnitPricePaise = norm.pricePerReferenceUnitPaise;
              referenceUnit = norm.referenceUnit;
            } catch {
              // fallback
            }
          }

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
            normalizedUnitPricePaise,
            referenceUnit,
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
          normalizedUnitPricePaise: lowestNormalizedUnitPrice?.pricePerUnitPaise,
          referenceUnit: lowestNormalizedUnitPrice?.unit,
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
      const locationKey = resolveLocationKey(pincode);

      const prod = await prisma.product.findUnique({
        where: { id },
        include: {
          listings: true,
        },
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

      let relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === locationKey);
      if (relevantListings.length === 0) {
        relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "bengaluru_560064");
      }
      if (relevantListings.length === 0) {
        relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "delhi_110001");
      }

      for (const l of relevantListings) {
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
      const pincode = req.body?.pincode || (req.query.pincode as string) || "560064";
      const locationKey = resolveLocationKey(pincode);

      const prod = await prisma.product.findUnique({
        where: { id },
        include: {
          listings: true,
        },
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

      let relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === locationKey);
      if (relevantListings.length === 0) {
        relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "bengaluru_560064");
      }
      if (relevantListings.length === 0) {
        relevantListings = (prod.listings || []).filter((l: any) => l.locationKey === "delhi_110001");
      }

      for (const l of relevantListings) {
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
      const { productIds = [], query, items = [], pincode = "560064", forceRefresh = false } = req.body || {};
      const locationKey = resolveLocationKey(pincode);

      let idsToSync: string[] = Array.isArray(productIds) ? [...productIds] : [];
      if (idsToSync.length === 0 && Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const itemText = typeof item === "string" ? item : item.query || item.queryName || item.name;
          if (itemText) {
            const matched = await prisma.product.findFirst({
              where: {
                OR: [
                  { name: { contains: itemText, mode: "insensitive" } },
                  { brand: { contains: itemText, mode: "insensitive" } },
                ],
              },
            });
            if (matched && !idsToSync.includes(matched.id)) {
              idsToSync.push(matched.id);
            }
          }
        }
      }
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
      if (idsToSync.length === 0) {
        const topProds = await prisma.product.findMany({ take: 5 });
        idsToSync = topProds.map((p) => p.id);
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
      const requestedPlatforms: PlatformId[] =
        Array.isArray(req.body.platforms) && req.body.platforms.length > 0
          ? req.body.platforms
          : ["blinkit", "zepto", "bigbasket"];
      const locationKey =
        (req.body.locationKey as string) ||
        (req.body.pincode ? `delhi_${req.body.pincode}` : "delhi_110001");
      const priority = Number(req.body.priority || 5);

      if (queries.length === 0) {
        return res.status(400).json({ error: "queries must be a non-empty array of strings" });
      }

      const manualAssistedPlatforms: string[] = [];
      const killedPlatforms: string[] = [];
      const automatedPlatforms: PlatformId[] = [];

      for (const p of requestedPlatforms) {
        if (p === "instamart") {
          manualAssistedPlatforms.push("instamart");
        } else if (registry.isKillSwitchActive(p)) {
          killedPlatforms.push(p);
        } else {
          automatedPlatforms.push(p);
        }
      }

      const jobIds: string[] = [];
      for (const p of automatedPlatforms) {
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
        jobId: jobIds[0] || "manual-assisted-only",
        jobIds,
        platforms: automatedPlatforms,
        queries,
        manualAssistedPlatforms: manualAssistedPlatforms.length > 0 ? manualAssistedPlatforms : undefined,
        killedPlatforms: killedPlatforms.length > 0 ? killedPlatforms : undefined,
        message:
          manualAssistedPlatforms.includes("instamart")
            ? `Enqueued ${jobIds.length} ingestion jobs. Instamart is in manual_assisted mode (automated scraping disabled; use /api/observations/manual).`
            : `Enqueued ${jobIds.length} ingestion jobs for processing`,
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
      const rawTitle = req.body?.title || req.body?.name;
      const explicitPackSize = req.body?.packSize || req.body?.quantity;

      const allProducts = await prisma.product.findMany();
      let bestProd: any = null;
      let highestConf = -1;

      if (req.body?.productId) {
        bestProd = allProducts.find((p) => p.id === req.body.productId) || null;
        if (bestProd) highestConf = 1.0;
      }

      if (!bestProd) {
        for (const cand of allProducts) {
          const m = defaultMatcher.match(
            { query: rawTitle, packSize: explicitPackSize },
            { id: cand.id, name: cand.name, brand: cand.brand, variant: cand.variant, packSize: cand.packSize }
          );
          if (m.isMatch && m.confidence > highestConf) {
            highestConf = m.confidence;
            bestProd = cand;
          }
        }
      }

      const normalized = createManualAssistedObservation({
        ...req.body,
        title: rawTitle,
        brand: req.body?.brand || bestProd?.brand,
        quantity: explicitPackSize || bestProd?.packSize || "1 unit",
      });

      const locationKey = resolveLocationKey(normalized.pincode);

      // Persist PriceObservation
      const savedObs = await prisma.priceObservation.create({
        data: {
          productId: bestProd?.id,
          platform: normalized.platformId,
          locationKey,
          rawTitle: normalized.name,
          brand: normalized.brand,
          variant: bestProd?.variant,
          packSize: normalized.quantity,
          pricePaise: normalized.pricePaise,
          originalPricePaise: normalized.originalPricePaise,
          currency: "INR",
          availability: normalized.availabilityStatus === "IN_STOCK" ? "available" : "unavailable",
          productUrl: normalized.productUrl,
          pincode: normalized.pincode,
          serviceableArea: "Manual User Entry",
          normalizedUnitPricePaise: normalized.normalizedUnitPricePaise,
          sourceType: "manual",
          verificationStatus: "cached",
          confidence: highestConf > 0 ? highestConf : 0.9,
          observedAt: new Date(normalized.observedAt),
          fetchedAt: new Date(),
          notes: ["User-submitted manual observation via /api/observations/manual"],
        },
      });

      // If matched with existing product, upsert listing
      if (bestProd) {
        await prisma.platformListing.upsert({
          where: {
            productId_platform_locationKey: {
              productId: bestProd.id,
              platform: normalized.platformId,
              locationKey,
            },
          },
          create: {
            productId: bestProd.id,
            platform: normalized.platformId,
            locationKey,
            currentPricePaise: normalized.pricePaise,
            availability: normalized.availabilityStatus === "IN_STOCK" ? "available" : "unavailable",
            isStale: false,
            confidence: highestConf > 0 ? highestConf : 0.9,
            sourceType: "manual",
            lastObservedAt: new Date(normalized.observedAt),
            productUrl: normalized.productUrl,
          },
          update: {
            currentPricePaise: normalized.pricePaise,
            availability: normalized.availabilityStatus === "IN_STOCK" ? "available" : "unavailable",
            isStale: false,
            confidence: highestConf > 0 ? highestConf : 0.9,
            sourceType: "manual",
            lastObservedAt: new Date(normalized.observedAt),
            productUrl: normalized.productUrl,
          },
        });
      }

      return res.status(201).json({
        message: "Manual price observation recorded successfully",
        observation: {
          ...savedObs,
          name: normalized.name,
          title: normalized.name,
          discountPercentage: normalized.discountPercentage,
          availabilityStatus: normalized.availabilityStatus,
          platformId: normalized.platformId,
          dataSource: normalized.dataSource,
          normalizedUnitPricePaise: normalized.normalizedUnitPricePaise,
        },
        matchedProduct: bestProd
          ? { id: bestProd.id, name: bestProd.name, confidence: highestConf }
          : null,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Invalid manual observation payload" });
    }
  });

  // POST /api/comparisons
  app.post("/api/comparisons", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productIds = req.body.productIds || [];
      const locationKey = (req.body.locationKey as string) || "delhi_110001";
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          listings: {
            where: { locationKey },
          },
        },
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
      if ((req.body.pincode && !req.body.locationId) || req.body.items?.[0]?.queryName || req.body.basketItems) {
        const result = await optimizationService.optimizeBasket(req.body);
        return res.status(201).json(result);
      }

      const parsed = OptimizationRequestSchema.parse(req.body);

      // Normalize locationId based on pincode if needed
      let resolvedLocId = parsed.locationId;
      if (parsed.pincode === "560064" || resolvedLocId === "delhi_560064") {
        resolvedLocId = "bengaluru_560064";
      } else if (parsed.pincode === "560001" || resolvedLocId === "delhi_560001") {
        resolvedLocId = "bengaluru_560001";
      } else if (parsed.pincode === "110001") {
        resolvedLocId = "delhi_110001";
      }

      // 1. Build fee rules for the location without inventing unknown fees.
      const { feeRules, warnings: feeWarnings } =
        await feeIntelligence.buildOptimizationFeeRules(resolvedLocId);

      // 2. Fetch products and match items
      const allProducts = await prisma.product.findMany({
        include: {
          listings: {
            where: { locationKey: resolvedLocId },
          },
        },
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

        // Fallback to SEED_CANONICAL_PRODUCTS if not matched in DB catalog
        if (!bestProd) {
          const qTokens = q.split(/[\s,\-_/]+/).filter((t: string) => t.length > 2);
          const seedMatch = SEED_CANONICAL_PRODUCTS.find((sp: any) => {
            const spNameLower = sp.name.toLowerCase();
            const matchesName = spNameLower.includes(q) || q.includes(spNameLower);
            const matchesAlias = sp.aliases.some((a: string) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()));
            const prodTokens = `${spNameLower} ${sp.slug} ${sp.category} ${sp.aliases.join(" ")}`.toLowerCase();
            const hasTokenMatch = qTokens.length > 0 && qTokens.some((tok: string) => prodTokens.includes(tok));
            return matchesName || matchesAlias || hasTokenMatch;
          });

          if (seedMatch) {
            bestProd = {
              id: seedMatch.id,
              name: seedMatch.name,
              brand: seedMatch.brand,
              variant: seedMatch.variant,
              packSize: seedMatch.standardPackSize,
              listings: SUPPORTED_PLATFORMS.map((pid) => ({
                platform: pid,
                currentPricePaise: seedMatch.prices[pid]?.pricePaise || null,
                availability: seedMatch.prices[pid]?.inStock ? "available" : "unavailable",
                isStale: false,
                confidence: 0.95,
                sourceType: "seed_fixture",
                searchUrl: undefined,
              })),
            };
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
          locationId: resolvedLocId,
          pincode: parsed.pincode,
          baselineName: optResult.baselineName,
          baselineTotalPaise: optResult.baselineTotalPaise,
          optionsJson: JSON.stringify(optResult.options),
          warnings: [...unmatchedWarnings, ...feeWarnings, ...optResult.warnings],
        },
      });

      res.status(201).json({
        id: optId,
        locationId: resolvedLocId,
        pincode: parsed.pincode,
        createdAt: new Date().toISOString(),
        baselineName: optResult.baselineName,
        baselineTotalPaise: optResult.baselineTotalPaise,
        baselineTotalRupees: optResult.baselineTotalRupees,
        options: optResult.options,
        warnings: [...unmatchedWarnings, ...feeWarnings, ...optResult.warnings],
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: err.errors });
      }
      console.error("POST /api/optimizations error:", err);
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

  // GET /api/data-provenance?pincode=110001&locationKey=delhi_110001
  app.get("/api/data-provenance", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pincode = (req.query.pincode as string) || "560064";
      const locationKey = (req.query.locationKey as string) || resolveLocationKey(pincode);
      const provenance = await dataProvenance.getForLocation(locationKey);
      return res.json(provenance);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/fees?locationKey=delhi_110001
  app.get("/api/fees", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const locationKey = (req.query.locationKey as string) || "delhi_110001";
      const rules = await feeIntelligence.getFeeRules(locationKey);
      res.json({
        locationKey,
        rules,
        disclaimer:
          "Fees are estimates. Unknown values are preserved as null and must never be treated as ₹0. Verify in the platform app before checkout.",
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/fees/:platform
  app.put("/api/fees/:platform", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as PlatformId;
      if (!SUPPORTED_PLATFORMS.includes(platform)) {
        return res.status(404).json({ error: `Platform ${req.params.platform} not recognized` });
      }

      const locationKey = (req.body?.locationKey as string) || "delhi_110001";
      const rule = await feeIntelligence.upsertManualFeeRule(
        platform,
        locationKey,
        req.body ?? {}
      );
      return res.json({
        rule,
        message: `Manual fee structure saved for ${platform} at ${locationKey}. Fees are not verified against checkout.`,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
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

  // GET /api/admin/obscura/status
  app.get("/api/admin/obscura/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await obscuraService.getStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/obscura/test
  app.post("/api/admin/obscura/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      const result = await obscuraService.scrapePage(url);
      res.json({
        success: true,
        title: result.title,
        content: result.content,
        status: result.status,
        durationMs: result.durationMs,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/shopping-handoff
  app.post("/api/shopping-handoff", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body.storeCarts) {
        const payload = ShoppingHandoffService.generateHandoffPayload(req.body);
        return res.status(200).json(payload);
      }

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
                items: plan.items.map((it: any) => {
                  const searchLink =
                    it.searchUrl || buildPlatformSearchDeepLink(platformKey, it.matchedTitle);
                  return {
                    title: it.matchedTitle,
                    brand: it.brand,
                    variant: it.variant,
                    quantity: it.quantity,
                    unitPriceRupees: it.unitPriceRupees,
                    totalPriceRupees: it.totalPriceRupees,
                    productUrl: undefined,
                    searchUrl: searchLink,
                    isDeepLink: false,
                  };
                }),
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

      // Generate full copyable markdown checklist
      const storeCartsForMarkdown = chosenOption
        ? Object.entries(chosenOption.perPlatform).map(([pid, plan]: [string, any]) => ({
            platformId: pid as PlatformId,
            platformName: PLATFORM_METADATA[pid as PlatformId].name,
            items: plan.items.map((it: any) => ({
              title: it.matchedTitle,
              brand: it.brand,
              variant: it.variant,
              quantity: it.quantity,
              unitPricePaise: Math.round(it.unitPriceRupees * 100),
              totalPricePaise: Math.round(it.totalPriceRupees * 100),
              searchUrl: it.searchUrl || buildPlatformSearchDeepLink(pid as PlatformId, it.matchedTitle),
            })),
            subtotalPaise: Math.round(plan.subtotalRupees * 100),
            deliveryFeePaise: Math.round(plan.deliveryFeeRupees * 100),
            handlingFeeMinPaise: Math.round(plan.handlingFeeRupees * 100),
            handlingFeeMaxPaise: Math.round(plan.handlingFeeRupees * 100),
            platformFeePaise: Math.round(plan.platformFeeRupees * 100),
            hasUnknownFees: plan.hasUnknownFee,
          }))
        : [];

      const markdownChecklist = ShoppingHandoffService.generateMarkdownChecklist(storeCartsForMarkdown, {
        strategyName: chosenOption?.title || parsed.strategy,
        pincode: record.pincode,
      });

      res.status(200).json({
        handoffId: `hnd-${Date.now()}`,
        optimizationId: parsed.optimizationId,
        strategy: parsed.strategy,
        timestamp: new Date().toISOString(),
        method: anyCartCreated ? "automated_cart" : "links_and_checklist",
        isEstimate: true,
        notice:
          "Verify basket, address, fees and total in the app. Payment happens on the platform, not on GroqAI.",
        capabilities: {
          createCart: false,
          automatedCheckout: false,
          searchDeepLink: true,
          checklistHandoff: true,
        },
        markdownChecklist,
        platforms: platformsList,
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: err.errors });
      }
      console.error("POST /api/optimizations error:", err);
      next(err);
    }
  });

  // POST /api/basket/optimize (Phase 3 Deterministic 3-Strategy Optimization Engine)
  app.post("/api/basket/optimize", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await optimizationService.optimizeBasket(req.body);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Optimization failed" });
    }
  });

  // POST /api/basket/handoff (Phase 3 Shopping Handoff Engine)
  app.post("/api/basket/handoff", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = ShoppingHandoffService.generateHandoffPayload(req.body);
      res.status(200).json(payload);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Handoff generation failed" });
    }
  });

  // POST /api/nl/parse (Phase 4 Hybrid NL Parser & Optimization Chaining)
  app.post("/api/nl/parse", async (req: Request, res: Response) => {
    try {
      const { text, pincode, optimize } = req.body || {};
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Input text cannot be empty" });
      }

      const parseResult = await nlParser.parseGroceryList(text);

      let optimizationResult = null;
      if (optimize && pincode) {
        const basketItems = parseResult.items.map((it) => ({
          queryName: it.queryName,
          quantity: it.quantity,
          allowSubstitutions: it.allowSubstitutions,
          preferredBrand: it.brandPreference || undefined,
        }));
        optimizationResult = await optimizationService.optimizeBasket({
          items: basketItems,
          pincode,
        });
      }

      return res.status(200).json({
        ...parseResult,
        parsed: parseResult,
        optimization: optimizationResult,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to parse natural language list" });
    }
  });

  // OpenAPI Specification endpoint (Deliverable 2)
  app.get("/api/docs/openapi.json", (req: Request, res: Response) => {
    res.json(openapiSpecification);
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred",
      requestId: res.locals.requestId,
    });
  });

  return app;
}
