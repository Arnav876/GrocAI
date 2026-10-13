# GroqAI Phase 2 Engineering Report: Backend, Database, Matching & Optimization Engine

## 1. Executive Summary
Phase 2 transitions GroqAI from mock frontend services to a real production-grade Express.js REST API backed by PostgreSQL (Prisma ORM), a deterministic product matching engine, and a mathematical basket optimization engine. All calculations (subtotals, delivery fees, handling fees, platform fees, minimum order thresholds, and savings) are executed deterministically on the backend using integer paise. Floating-point arithmetic for currency is strictly prohibited across the codebase.

## 2. What Was Built

### A. Database & Persistence Layer (`apps/api/prisma`)
- **PostgreSQL Schema (`schema.prisma`):**
  - `Category`: Grocery category taxonomy with pastel display metadata.
  - `Product`: Master catalog items with brand, packSize, MRP in paise, discount, rating, out-of-stock, and novelty flags.
  - `PlatformListing`: Normalized platform offerings across Blinkit, Zepto, Instamart, and BigBasket with unique composite keys `(productId, platform)`, integer paise prices, availability status, staleness indicator, confidence score, and last observed timestamp.
  - `PriceObservation`: Historical audit trail of all price recordings stamped with `sourceType`, `observedAt`, and confidence.
  - `PlatformFeeRule`: Location-specific fee structures with integer paise for delivery, handling (including support for `{ minPaise, maxPaise }` ranges when unknown), platform fees, free-delivery thresholds, and minimum order values.
  - `GroceryList` & `GroceryListItem`: User-defined shopping baskets with variants and substitution flags.
  - `OptimizationResult`: Persisted optimization plans with JSON-serialized strategy breakdowns and baseline comparisons.
- **Database Migrations & Seeding:**
  - `migrations/20261013000000_init/migration.sql`: Generated initial PostgreSQL migration applied cleanly via Prisma.
  - `prisma/seed.ts`: Seeds 10 categories, 45 products, multi-platform listings, and Central Delhi (`110001`) fee rules including deliberately tricky test cases (pack size variations, Amul Taaza vs Gold variants, stale prices, and BigBasket unknown handling fee).
- **Docker Compose:** `docker-compose.yml` configured for containerized PostgreSQL (`groqai-postgres` on port 5432).

### B. Connector Layer Skeleton (`apps/api/src/connectors`)
- `IPlatformConnector` interface requiring honest capability reporting via `getCapabilities()`, `searchProducts()`, `getPrice()`, `getFees()`, and `setFaultInjection()`.
- `MockConnector`: Implements the interface reading from PostgreSQL fixtures, strictly setting `createCart: false`. Supports fault injection for timeouts, 503 unavailability, staleness simulation, and latency.
- `ConnectorRegistry`: Manages connectors for all 4 platforms and enforces platform-level kill switches.

### C. Deterministic Matching Engine (`apps/api/src/matching`)
- `unitNormalizer.ts`: Deterministically parses and normalizes metric units (`ml` <-> `L`, `g` <-> `kg`, `pcs` <-> `dozen`).
- `matchingService.ts`: Two-stage matching pipeline:
  1. Candidate scoring via token-based text similarity.
  2. Strict deterministic variant guards that actively reject incompatible variants (e.g., *Amul Taaza* vs *Amul Gold*, *Brown Eggs* vs *White Eggs*) and mismatched pack sizes (e.g., *1 L* vs *5 L*).
  3. Matches with low confidence are explicitly flagged as `needsReview: true` and never silently equated.

### D. Pure Mathematical Optimization Engine (`apps/api/src/optimization`)
- Pure function `runOptimizationEngine` with zero I/O.
- Computes three core strategies:
  1. **`cheapest_item_by_item`**: Greedy selection across all 4 platforms showing raw theoretical minimum shelf prices.
  2. **`cheapest_single_platform`**: Evaluates all single stores and identifies the lowest all-in basket. Serves as the named baseline for savings calculations.
  3. **`optimized_multi_platform`**: Evaluates all $2^4 - 1 = 15$ platform subsets, assigns items to the cheapest available merchant, verifies minimum order constraints, computes all fees (delivery, handling, platform fees), and compares net savings against user threshold `minimumSavingsPaise`.
  - Reverts to a single store if delivery fees erase product savings, documenting the exact trade-off in the plan's `explanation` and `warnings`.
  - Accurately tracks missing items and flags plans with missing items as `isFeasible: false`.
  - Accurately tracks minimum order violations and calculates `shortfallForMinimumOrderPaise`.
  - Unknown fees (such as BigBasket handling fee) are never coerced to 0; plans preserve `hasUnknownFees: true` and record `{ minPaise, maxPaise }` ranges.

### E. Express REST API (`apps/api/src/server.ts`)
- Implements the complete contract:
  - `GET /api/health`: Health status, uptime, and platform killswitch states.
  - `GET /api/categories`: Category taxonomy.
  - `GET /api/products/search`: Multi-platform search with lowest price highlights.
  - `GET /api/products/:id`: Full product detail with platform listings.
  - `POST /api/comparisons`: Batch product comparison.
  - `POST /api/grocery-lists`: List creation with item rows.
  - `POST /api/grocery-lists/:id/items`: List item addition.
  - `POST /api/optimizations`: Runs matching and optimization, persists result.
  - `GET /api/optimizations/:id`: Retrieves saved optimization results.
  - `GET /api/platforms`: Returns honest platform capabilities and health.
  - `POST /api/shopping-handoff`: Generates platform purchase checklist and deep/search links with mandatory non-affiliated checkout disclaimers.
  - `GET /api/docs/openapi.json`: OpenAPI 3.0 specification.
- Hardened with Helmet security headers, CORS restricted to `WEB_ORIGIN`, rate limiting (200 req / 15 min), and structured logging that scrubs sensitive headers, addresses, and cookies.

### F. Frontend Integration (`apps/web`)
- `apps/web/.env` configured with `VITE_API_BASE_URL=http://localhost:5001`.
- `apps/web/src/services/apiClient.ts` seamlessly calls the real API endpoints, validating responses using `@groqai/shared` Zod schemas.

## 3. How to Run

### Database Setup
```bash
# Start PostgreSQL via Docker Compose (or use native PostgreSQL on port 5432)
docker compose up -d

# Run Prisma migrations & seed
npm run db:push --workspace=apps/api
npm run db:seed --workspace=apps/api
```

### Running Backend & Frontend
```bash
# Start API (port 5001)
npm run dev:api

# Start Web Frontend (port 5173)
npm run dev:web
```

## 4. Test Suite Results
Vitest executed across all workspaces with **38 passing tests** (0 failures):
- `@groqai/shared`: 7 passed (money formatting, paise conversion, price freshness TTL).
- `@groqai/web`: 7 passed (currency formatting, stale price rendering, unknown fee badges, optimization option UI).
- `@groqai/api`: 24 passed:
  - `matching.test.ts` (7): Unit conversion (ml/L, g/kg, dozens), same-variant matching, variant rejection (Amul Taaza vs Gold), pack size rejection (1L vs 5L), low-confidence review flagging.
  - `optimizer.test.ts` (11): Empty basket, single store wins, split basket wins, split rejected when fees erase savings, out-of-stock items, unknown fee preservation, maxPlatforms constraint, budget warning, minimum order violation & shortfall, missing item coverage warning & infeasibility, deterministic tie resolution.
  - `property.test.ts` (1): Property test verifying that `estimatedTotalPaise` strictly equals `subtotalPaise + delivery + handling + platform - discounts` and sums across per-platform carts for randomized baskets.
  - `api.test.ts` (5): End-to-end integration tests for `/api/health`, `/api/categories`, `/api/products/search`, `/api/optimizations`, `/api/optimizations/:id`, `/api/shopping-handoff`, and `/api/platforms`.

## 5. What Is Mocked vs Real
- **Database:** REAL PostgreSQL instance with Prisma ORM.
- **Matching & Optimization Engines:** REAL pure deterministic algorithms.
- **API Server & Routing:** REAL Express server with rate-limiting, Helmet, and OpenAPI documentation.
- **Platform Data:** Connectors operate in `mock` mode reading seeded database records (visibly stamped `sourceType: "mock"` and `isEstimate: true`).
- **Cart Creation:** `createCart` is explicitly reported as `false` on all platforms. Handoff generates real platform deep/search links and copyable checklists.

## 6. Known Gaps & Phase 3 Roadmap
1. Phase 3 will introduce independent connector adapters (`AuthorizedApiConnector`, `ManualPriceConnector`, `LinksChecklistConnector`, `PlaywrightAssistedConnector`) with runtime fallback hierarchy.
2. Capability reporting must be verified with go/no-go compliance documentation in `docs/`.
3. Background catalog refresh jobs and staleness alerts to be wired with BullMQ/Redis when configured.
