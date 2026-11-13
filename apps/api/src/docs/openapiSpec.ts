/**
 * OpenAPI 3.0.3 Specification for GrocAI (GroqAI) REST API Surface
 * Port 5001
 */
export const openapiSpecification = {
  openapi: "3.0.3",
  info: {
    title: "GrocAI Grocery Price Comparison & Basket Optimizer API",
    version: "1.0.0",
    description: `Deterministic grocery price comparison and basket optimizer for Indian quick-commerce (Blinkit, Zepto, Swiggy Instamart, BigBasket).

### Architectural Invariants:
1. **100% Integer Paise Arithmetic**: All monetary quantities, subtotals, delivery fees, handling fees, small cart fees, and totals are computed strictly as integer paise (1 Rupee = 100 Paise). Floating-point currency math is prohibited.
2. **Zero AI in Pricing & Optimization**: Natural language models (LLMs) are strictly restricted to input understanding and grocery note parsing. AI is never used for price estimation, fee calculation, or basket optimization.
3. **Preservation of Unknown Fee Ranges**: When a platform exhibits dynamic/unpredictable fees (e.g. BigBasket ₹5–₹15 handling fee), the fee ranges and \`hasUnknownFees: true\` flag are preserved in strategy totals rather than artificially coerced to 0.
4. **Honest Platform Ingestion Matrix**:
   - Blinkit: \`headed_worker\` via network JSON interception (\`/v1/layout/search\`).
   - Zepto: \`headed_worker\` via dual-mode network JSON interception + DOM card fallback.
   - BigBasket: \`headed_worker\` via network JSON interception (\`/listing-svc/v2/products\`).
   - Swiggy Instamart: \`manual_assisted\` (automated browser scraping is disabled due to PerimeterX; data is captured via assisted operator submission and cached snapshots).
5. **Honest Shopping Handoff (Zero Auto-Checkout)**: Cart creation and automated checkouts are disabled via \`NullCartAdapter\` (\`createCart: false\`, \`automatedCheckout: false\`). Checkouts route through official merchant search deep links and markdown shopping checklists.`,
  },
  servers: [
    {
      url: "http://localhost:5001",
      description: "Local development server",
    },
  ],
  paths: {
    "/api/health": {
      get: {
        summary: "System Health, Platform Kill-Switches & Capabilities",
        description:
          "Reports service uptime, active platform kill-switches, ingestion modes, and NullCartAdapter capabilities.",
        responses: {
          "200": {
            description: "Service is healthy and operational",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/products/search": {
      get: {
        summary: "Search Canonical Products and Multi-Store Listings",
        description:
          "Searches the catalog across Blinkit, Zepto, Swiggy Instamart, and BigBasket for a given query and 6-digit Indian pincode. Returns integer paise prices, discount percentages, and unit-normalized pricing.",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Product search query (e.g. 'milk', 'atta', 'eggs')",
          },
          {
            name: "pincode",
            in: "query",
            required: false,
            schema: { type: "string", pattern: "^[1-9][0-9]{5}$", default: "110001" },
            description: "6-digit Indian postal code",
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            schema: { type: "boolean", default: false },
            description: "When true, triggers on-demand background refresh for queried items",
          },
        ],
        responses: {
          "200": {
            description: "Matching products with multi-platform listings",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProductSummary" },
                },
              },
            },
          },
          "400": {
            description: "Invalid query or pincode format",
          },
        },
      },
    },
    "/api/products/{id}": {
      get: {
        summary: "Get Product Details by ID",
        description: "Returns canonical product details with platform listings and location pricing.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "pincode",
            in: "query",
            required: false,
            schema: { type: "string", default: "110001" },
          },
        ],
        responses: {
          "200": {
            description: "Product details",
          },
          "404": {
            description: "Product not found",
          },
        },
      },
    },
    "/api/products/sync": {
      post: {
        summary: "Synchronize Multi-Platform Catalog Matrix",
        description:
          "Accepts a basket of item queries or product IDs and returns synchronized multi-platform pricing matrices ready for basket optimization.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SyncRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Synchronized catalog outcomes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SyncResponse" },
              },
            },
          },
        },
      },
    },
    "/api/optimizations": {
      post: {
        summary: "Calculate 3-Strategy Basket Optimization",
        description:
          "Evaluates exact combinatorial basket optimization across: 1) Cheapest Item-by-Item, 2) Cheapest Single Platform, 3) Optimized Multi-Platform Split (2^4 - 1 = 15 subsets).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BasketOptimizationRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Optimization result with 3-strategy evaluation and fee cliff alerts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BasketOptimizationResult" },
              },
            },
          },
          "400": {
            description: "Validation error or invalid pincode/items",
          },
        },
      },
    },
    "/api/basket/optimize": {
      post: {
        summary: "Alias for /api/optimizations",
        description: "Direct Phase 3 endpoint for 3-strategy basket optimization.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BasketOptimizationRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Optimization evaluation result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BasketOptimizationResult" },
              },
            },
          },
        },
      },
    },
    "/api/shopping-handoff": {
      post: {
        summary: "Generate Platform Shopping Handoff Links & Checklist",
        description:
          "Generates official merchant search deep links and markdown shopping checklist for the chosen strategy with NullCartAdapter capability flags.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ShoppingHandoffRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Handoff payload with merchant links and checklist",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ShoppingHandoffPayload" },
              },
            },
          },
        },
      },
    },
    "/api/basket/handoff": {
      post: {
        summary: "Alias for /api/shopping-handoff",
        description: "Direct Phase 3 endpoint for shopping handoff generation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ShoppingHandoffRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Handoff payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ShoppingHandoffPayload" },
              },
            },
          },
        },
      },
    },
    "/api/ingestion/refresh": {
      post: {
        summary: "Enqueue Background Platform Scrape / Refresh Jobs",
        description:
          "Enqueues Playwright worker scrape jobs for requested platforms, pincodes, and queries. Respects kill-switches and reports manual_assisted mode for Swiggy Instamart.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IngestionRefreshRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Jobs enqueued successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IngestionRefreshResponse" },
              },
            },
          },
          "400": {
            description: "Missing or invalid queries array",
          },
        },
      },
    },
    "/api/ingestion/jobs/{id}": {
      get: {
        summary: "Get Ingestion Job Status",
        description: "Returns status and execution metadata of a background ingestion job.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Job status details" },
          "404": { description: "Job not found" },
        },
      },
    },
    "/api/ingestion/status": {
      get: {
        summary: "Get Ingestion Queue Status & Blocked Platforms",
        description: "Reports queue depth, last run timestamps, and blocked platform lists.",
        responses: {
          "200": { description: "Queue status" },
        },
      },
    },
    "/api/observations/manual": {
      post: {
        summary: "Submit Operator / User Manual Price Observation",
        description:
          "Accepts a verified price observation (especially for Swiggy Instamart in manual_assisted mode), validates all 14 dimensions in integer paise, and persists it.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ManualObservationRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Observation validated and recorded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ManualObservationResponse" },
              },
            },
          },
          "400": {
            description: "Validation failure or invalid price/pincode",
          },
        },
      },
    },
    "/api/observations/import-payload": {
      post: {
        summary: "Import Raw Network HAR or JSON Response Payload",
        description:
          "Accepts a raw JSON response or DevTools HAR export from Blinkit, Zepto, BigBasket, or Swiggy Instamart. Normalizes observations, validates integer paise, matches to catalog products, and records price observations.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ImportPayloadRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Payload normalized, matched, and observations recorded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ImportPayloadResponse" },
              },
            },
          },
          "400": {
            description: "Invalid platformId, invalid pincode, or missing rawPayload",
          },
        },
      },
    },
    "/api/nl/parse": {
      post: {
        summary: "Natural Language Grocery List Parser & Optional Optimization Chaining",
        description:
          "Parses raw messy grocery notes into structured items with entity extraction and Indian idioms. AI price firewall enforces zero pricing in LLM output. When optimize=true, chains into basket optimization.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NLParseRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Parsed grocery items and optional optimization result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NLParseResponse" },
              },
            },
          },
          "400": {
            description: "Empty text or parsing failure",
          },
        },
      },
    },
    "/api/fees": {
      get: {
        summary: "Get Fee Structures and Unknown Fee Ranges",
        description: "Returns platform delivery, handling, and small cart fee rules.",
        responses: {
          "200": { description: "Fee rules by platform" },
        },
      },
    },
    "/api/data-provenance": {
      get: {
        summary: "Get Ingestion Data Provenance and Verification Breakdown",
        description: "Reports live, cached, and manual observation proportions for a given location.",
        responses: {
          "200": { description: "Provenance metrics" },
        },
      },
    },
    "/api/categories": {
      get: {
        summary: "List Product Categories",
        description: "Returns catalog categories (Dairy, Staples, Snacks, etc.).",
        responses: {
          "200": { description: "List of categories" },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          uptimeSeconds: { type: "number", example: 120.5 },
          timestamp: { type: "string", format: "date-time" },
          platformKillSwitches: {
            type: "object",
            properties: {
              blinkit: { type: "boolean" },
              zepto: { type: "boolean" },
              bigbasket: { type: "boolean" },
              instamart: { type: "boolean" },
            },
          },
          ingestionModes: {
            type: "object",
            properties: {
              blinkit: { type: "string", example: "headed_worker" },
              zepto: { type: "string", example: "headed_worker" },
              bigbasket: { type: "string", example: "headed_worker" },
              instamart: { type: "string", example: "manual_assisted" },
            },
          },
          capabilities: {
            type: "object",
            properties: {
              createCart: { type: "boolean", example: false },
              automatedCheckout: { type: "boolean", example: false },
              search: { type: "boolean", example: true },
              livePrice: { type: "boolean", example: true },
              searchDeepLink: { type: "boolean", example: true },
              checklistHandoff: { type: "boolean", example: true },
            },
          },
        },
      },
      ProductSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          brand: { type: "string", nullable: true },
          packSize: { type: "string" },
          lowestPricePaise: { type: "integer", description: "Price in integer paise" },
          lowestPlatform: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"] },
          platformPrices: { type: "object" },
        },
      },
      SyncRequest: {
        type: "object",
        properties: {
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$", default: "110001" },
          query: { type: "string" },
          productIds: { type: "array", items: { type: "string" } },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                query: { type: "string" },
                quantity: { type: "number", default: 1 },
              },
            },
          },
          forceRefresh: { type: "boolean", default: false },
        },
      },
      SyncResponse: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          locationKey: { type: "string" },
          totalSynced: { type: "integer" },
          outcomes: { type: "array", items: { type: "object" } },
        },
      },
      BasketOptimizationRequest: {
        type: "object",
        required: ["items", "pincode"],
        properties: {
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$", example: "110001" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["queryName", "quantity"],
              properties: {
                canonicalProductId: { type: "string" },
                queryName: { type: "string", example: "milk" },
                quantity: { type: "integer", minimum: 1, example: 2 },
                allowSubstitutions: { type: "boolean", default: true },
                preferredBrand: { type: "string", example: "Amul" },
              },
            },
          },
          enabledPlatforms: {
            type: "array",
            items: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"] },
          },
        },
      },
      BasketOptimizationResult: {
        type: "object",
        properties: {
          pincode: { type: "string" },
          evaluatedAt: { type: "string", format: "date-time" },
          strategies: {
            type: "object",
            properties: {
              cheapestItemByItem: { type: "object" },
              cheapestSinglePlatform: { type: "object" },
              optimizedMultiPlatformSplit: { type: "object" },
            },
          },
          recommendation: { type: "object" },
        },
      },
      ShoppingHandoffRequest: {
        type: "object",
        properties: {
          strategy: {
            type: "string",
            enum: ["CHEAPEST_ITEM_BY_ITEM", "CHEAPEST_SINGLE_PLATFORM", "OPTIMIZED_MULTI_PLATFORM_SPLIT"],
          },
          storeCarts: { type: "object" },
          optimizationId: { type: "string" },
        },
      },
      ShoppingHandoffPayload: {
        type: "object",
        properties: {
          strategy: { type: "string" },
          generatedAt: { type: "string", format: "date-time" },
          disclaimer: { type: "string" },
          capabilities: { type: "object" },
          markdownChecklist: { type: "string" },
          platforms: { type: "array", items: { type: "object" } },
        },
      },
      IngestionRefreshRequest: {
        type: "object",
        required: ["queries"],
        properties: {
          queries: { type: "array", items: { type: "string" }, example: ["Amul milk", "Fortune oil"] },
          platforms: {
            type: "array",
            items: { type: "string", enum: ["blinkit", "zepto", "bigbasket", "instamart"] },
          },
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$" },
          locationKey: { type: "string" },
          priority: { type: "integer", default: 5 },
        },
      },
      IngestionRefreshResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "queued" },
          jobId: { type: "string" },
          jobIds: { type: "array", items: { type: "string" } },
          platforms: { type: "array", items: { type: "string" } },
          queries: { type: "array", items: { type: "string" } },
          manualAssistedPlatforms: { type: "array", items: { type: "string" } },
          message: { type: "string" },
        },
      },
      ManualObservationRequest: {
        type: "object",
        required: ["title"],
        properties: {
          platform: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"], default: "instamart" },
          title: { type: "string", example: "Amul Taaza Toned Fresh Milk" },
          pricePaise: { type: "integer", minimum: 1, example: 5400 },
          priceRupees: { type: "number", example: 54 },
          mrpPaise: { type: "integer", example: 5400 },
          packSize: { type: "string", example: "1 L" },
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$", default: "110001" },
          productUrl: { type: "string" },
        },
      },
      ManualObservationResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          observation: { $ref: "#/components/schemas/NormalizedObservation" },
        },
      },
      ImportPayloadRequest: {
        type: "object",
        required: ["platformId", "pincode", "rawPayload"],
        properties: {
          platformId: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"] },
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$", example: "560064" },
          rawPayload: { type: "object", description: "Direct response JSON or DevTools HAR log" },
        },
      },
      ImportPayloadResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "success" },
          platformId: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"] },
          pincode: { type: "string", example: "560064" },
          locationKey: { type: "string", example: "bengaluru_560064" },
          importedCount: { type: "integer", example: 10 },
          observations: {
            type: "array",
            items: { $ref: "#/components/schemas/NormalizedObservation" },
          },
        },
      },
      NormalizedObservation: {
        type: "object",
        required: [
          "name",
          "quantity",
          "pricePaise",
          "originalPricePaise",
          "discountPercentage",
          "availabilityStatus",
          "platformId",
          "productUrl",
          "pincode",
          "observedAt",
          "dataSource",
          "verificationStatus",
        ],
        properties: {
          name: { type: "string" },
          brand: { type: "string", nullable: true },
          quantity: { type: "string" },
          pricePaise: { type: "integer", description: "Integer paise currency" },
          originalPricePaise: { type: "integer", description: "Integer paise currency" },
          discountPercentage: { type: "integer", minimum: 0, maximum: 100 },
          availabilityStatus: { type: "string", enum: ["IN_STOCK", "OUT_OF_STOCK", "LOW_STOCK", "UNAVAILABLE"] },
          platformId: { type: "string", enum: ["blinkit", "zepto", "instamart", "bigbasket"] },
          productUrl: { type: "string", format: "uri" },
          imageUrl: { type: "string", format: "uri", nullable: true },
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$" },
          observedAt: { type: "string", format: "date-time" },
          dataSource: { type: "string", enum: ["headed_worker", "manual_assisted", "seed_fixture", "cached_snapshot"] },
          verificationStatus: { type: "string", enum: ["VERIFIED", "UNVERIFIED", "STALE", "FLAGGED_ANOMALY"] },
          normalizedUnitPricePaise: { type: "integer" },
        },
      },
      NLParseRequest: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", example: "2 litres milk, 1 dozen eggs" },
          pincode: { type: "string", pattern: "^[1-9][0-9]{5}$", example: "110001" },
          optimize: { type: "boolean", default: false },
        },
      },
      NLParseResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "object" } },
          providerUsed: { type: "string" },
          rawText: { type: "string" },
          optimization: { type: "object", nullable: true },
        },
      },
    },
  },
};

