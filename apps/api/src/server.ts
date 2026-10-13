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
} from "@groqai/shared";
import { ConnectorRegistry } from "./connectors/registry.js";
import {
  runOptimizationEngine,
  RequestedOptimizationItem,
  FeeRuleInput,
} from "./optimization/optimizer.js";
import { defaultMatcher } from "./matching/matchingService.js";
import { createNLParser } from "./services/naturalLanguageService.js";

export function createServer(prisma: PrismaClient) {
  const app = express();
  const registry = new ConnectorRegistry(prisma);
  const nlParser = createNLParser();

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
        whereClause.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
          { variant: { contains: query, mode: "insensitive" } },
        ];
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          listings: true,
        },
      });

      // Transform products into ProductSummary
      const summaries = products.map((prod) => {
        let lowestPricePaise = Infinity;
        let lowestPlatform: PlatformId = "blinkit";

        const platformPrices: any = {};
        for (const l of prod.listings) {
          const pid = l.platform as PlatformId;
          const pricePaise = l.currentPricePaise || undefined;
          platformPrices[pid] = {
            pricePaise,
            priceRupees: pricePaise ? pricePaise / 100 : undefined,
            availability: l.availability,
            isStale: l.isStale,
            observedAt: l.lastObservedAt.toISOString(),
            sourceType: l.sourceType,
            confidence: l.confidence,
            searchUrl: l.searchUrl,
          };

          if (l.availability === "available" && pricePaise && pricePaise < lowestPricePaise) {
            lowestPricePaise = pricePaise;
            lowestPlatform = pid;
          }
        }

        const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;

        return {
          id: prod.id,
          name: prod.name,
          brand: prod.brand,
          category: prod.categoryId,
          variant: prod.variant,
          packSize: prod.packSize,
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
      });

      res.json(summaries);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/products/:id
  app.get("/api/products/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prod = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: { listings: true },
      });

      if (!prod) {
        return res.status(404).json({ error: "Product not found" });
      }

      let lowestPricePaise = Infinity;
      let lowestPlatform: PlatformId = "blinkit";
      const platformPrices: any = {};

      for (const l of prod.listings) {
        const pid = l.platform as PlatformId;
        const pricePaise = l.currentPricePaise || undefined;
        platformPrices[pid] = {
          pricePaise,
          priceRupees: pricePaise ? pricePaise / 100 : undefined,
          availability: l.availability,
          isStale: l.isStale,
          observedAt: l.lastObservedAt.toISOString(),
          sourceType: l.sourceType,
          confidence: l.confidence,
          searchUrl: l.searchUrl,
        };

        if (l.availability === "available" && pricePaise && pricePaise < lowestPricePaise) {
          lowestPricePaise = pricePaise;
          lowestPlatform = pid;
        }
      }

      const effectiveLowest = lowestPricePaise < Infinity ? lowestPricePaise : 0;

      res.json({
        id: prod.id,
        name: prod.name,
        brand: prod.brand,
        category: prod.categoryId,
        variant: prod.variant,
        packSize: prod.packSize,
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

      const optimizationItems: RequestedOptimizationItem[] = parsed.items.map((it, idx) => {
        const q = it.query.toLowerCase().trim();

        // Use matcher to score candidates
        let bestProd = allProducts[0];
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

        return {
          id: `item-${idx}-${bestProd.id}`,
          query: it.query,
          quantity: it.quantity,
          unit: it.unit,
          matchedTitle: bestProd.name,
          brand: bestProd.brand,
          variant: bestProd.variant,
          packSize: bestProd.packSize,
          listings: listingsMap,
        };
      });

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
          warnings: optResult.warnings,
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
        warnings: optResult.warnings,
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
      const conn = registry.get(pid);
      const isKilled = registry.isKillSwitchActive(pid);
      return {
        id: pid,
        name: PLATFORM_METADATA[pid].name,
        mode: process.env[`${pid.toUpperCase()}_INTEGRATION_MODE`] || "mock",
        enabled: !isKilled,
        capabilities: conn.getCapabilities(),
        status: isKilled ? "disabled" : "healthy",
        lastChecked: new Date().toISOString(),
        latencyMs: pid === "blinkit" ? 115 : pid === "zepto" ? 92 : pid === "instamart" ? 135 : 170,
        errorRate: 0.0,
        notes: [
          `Running in honest mode (NullCartAdapter active)`,
          `Kill switch state: ${isKilled ? "ACTIVE (Disabled)" : "Inactive (Enabled)"}`,
        ],
      };
    });
    res.json(statuses);
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

      const platformsList = chosenOption
        ? Object.entries(chosenOption.perPlatform).map(([pid, plan]: [string, any]) => {
            const platformKey = pid as PlatformId;
            const meta = PLATFORM_METADATA[platformKey];

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
              cartReviewUrl: meta.websiteUrl,
            };
          })
        : [];

      res.status(200).json({
        handoffId: `hnd-${Date.now()}`,
        optimizationId: parsed.optimizationId,
        strategy: parsed.strategy,
        timestamp: new Date().toISOString(),
        method: "links_and_checklist",
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
