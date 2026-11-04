# GroqAI: Quick-Commerce Grocery Price Comparison & Basket Optimizer

GroqAI is an autonomous, deterministic grocery price comparison and basket optimizer for Indian quick-commerce: **Blinkit, Zepto, Swiggy Instamart, and BigBasket**. It determines the lowest **TOTAL** cost of a grocery basket across three transparent strategies:
1. **Cheapest Item-by-Item:** Theoretical minimum shelf price purchasing each item from whichever store has the lowest price.
2. **Cheapest Single Platform:** The lowest all-in basket fulfilled entirely by one store (serves as the named comparison baseline).
3. **Optimized Multi-Platform Split:** Deterministic subset optimization evaluating all $2^4 - 1 = 15$ platform combinations to find net savings after delivery, handling, and platform fees.

> [!IMPORTANT]
> **LEGAL & PAYMENT NOTICE**  
> GroqAI is an independent tool and is not affiliated with, authorized by, or endorsed by Blinkit, Zepto, Swiggy Instamart, or BigBasket.  
> **GroqAI NEVER processes payments, NEVER collects platform credentials or OTPs, and NEVER simulates automated checkout.**  
> The user reviews items and pays exclusively on the platform's official checkout.

---

## 1. Non-Negotiable Engineering Invariants

1. **Integer Paise Financial Precision:** All monetary amounts are stored, calculated, and optimized as integer paise ($1\text{ INR} = 100\text{ paise}$). Float arithmetic for currency is strictly prohibited across the codebase.
2. **Deterministic Pricing Truth:** No LLM is ever used for price arithmetic, calculations, or fee evaluations. All matching and optimization logic runs as pure deterministic code.
3. **Unknown Fee Preservation:** Missing handling or delivery fees are **NEVER converted to 0**. Plans with unknown or dynamic ranges (e.g. BigBasket handling fees) preserve `{ minPaise, maxPaise }` and are explicitly tagged `hasUnknownFees: true`.
4. **Honest Capabilities:** Every platform connector reports true capabilities via `getCapabilities()`. Automated cart creation (`createCart`) is explicitly `false` across all platforms backed by `NullCartAdapter`.
5. **Clear Data Source Labelling:** All prices are visibly stamped with `sourceType` (`mock`, `manual`, `partner_feed`, `authorized_api`), observation timestamp, and freshness flags (stale if $>6\text{h}$).
6. **Named Baseline Savings:** All savings are computed against an explicit named baseline (typically the cheapest single-platform total).

---

## 2. Monorepo Architecture

GroqAI is built using npm workspaces:

```
GroqAI/
├── packages/
│   └── shared/          # Shared TypeScript types, Zod schemas, money utilities, TTL checks
├── apps/
│   ├── web/             # React 18 + Vite + Tailwind CSS + TanStack Query + React Router
│   └── api/             # Node.js + Express + TypeScript + Prisma ORM (PostgreSQL)
├── docker-compose.yml   # PostgreSQL 16 container definition
└── docs/                # Comprehensive engineering reports & compliance matrices
```

---

## 3. Real-Time Data Synchronization & Provider Adapters

GroqAI features a modular real-time grocery synchronization layer that interfaces with quick-commerce platforms while maintaining strict resilience and financial honesty:

- **Modular Platform Adapters (`apps/api/src/connectors/adapters/`):**
  - `BlinkitAdapter`, `ZeptoAdapter`, `InstamartAdapter`, `BigBasketAdapter` inheriting from `BaseGroceryAdapter`.
  - Consistent interface: `searchProducts`, `getProductPrice`, `getAvailability`, `getFeeRules`.
  - Graceful fallback: When live credentials or direct platform sessions are absent, adapters safely pull verified cached observations and merchant search links without fabricating data.
- **14-Field Normalized Observation Standard:**
  Captures: `name`, `brand`, `quantity`, `pricePaise`/`priceRupees`, `originalPricePaise`, `discountPercentage`, `availabilityStatus`, `platformId`, `productUrl`, `imageUrl`, `pincode`/`serviceableArea`, `observedAt` timestamp, `dataSource`, and `verificationStatus`.
- **Unit-Price Normalization:**
  Product quantities are normalized to standard units (volume $\rightarrow$ 1 Litre, weight $\rightarrow$ 1 kg, count $\rightarrow$ 1 piece) via `calculateNormalizedUnitPrice`. This enables true apples-to-apples comparisons (e.g. 500 ml milk at ₹33 normalized to ₹66/L vs 1 L at ₹64/L).
- **Price Verification Taxonomy:**
  - `live_verified`: Data retrieved from platform source within 15 minutes.
  - `cached`: Valid cached data within 1-hour freshness TTL.
  - `stale`: Data older than freshness TTL or refreshed unsuccessfully (clearly flagged; never presented as live).
  - `unverified`: Catalog listings pending provider verification.
  - `estimate`: Platform totals where fees cannot be definitively verified.
- **Resilient Cache Invariant:**
  Transient provider errors, rate limits, or timeouts will **never** overwrite valid cached data. Unsuccessful sync attempts mark observations as stale with explicit failure metadata while preserving the last known valid price.

---

## 4. Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL (via Docker Compose or local installation on port 5432)

### Installation
```bash
# Clone and install dependencies
git clone https://github.com/arnavyadav/GroqAI.git
cd GroqAI
npm install
```

### Database Setup
```bash
# Start PostgreSQL container
docker compose up -d

# Push Prisma schema and seed database
npm run db:push --workspace=apps/api
npm run db:seed --workspace=apps/api
```

### Starting the Applications
```bash
# Start Backend API (runs on http://localhost:5001)
npm run dev:api

# In a separate terminal, start Frontend (runs on http://localhost:5173)
npm run dev:web
```

---

## 5. Verification & Testing

GroqAI includes a comprehensive test suite across all packages and services:

```bash
# Run all tests across the entire monorepo
npm run test

# Run TypeScript typechecks across workspaces
npm run typecheck

# Run linter
npm run lint

# Build all packages and applications for production
npm run build
```

### Test Coverage Highlights (68 Passing Tests)
- **Financial Invariants (`property.test.ts`):** Verifies across randomized baskets that estimated totals strictly equal `subtotal + delivery + handling + platform - discounts`.
- **Optimization Scenarios (`optimizer.test.ts`):** Evaluates single store wins, multi-store splits, fee-erased split rejections, minimum order violations, out-of-stock handling, budget alerts, and tie breaking.
- **Deterministic Matching & Unit Normalization (`matching.test.ts`, `unitNormalizer.test.ts`):** Metric conversions (ml/L, g/kg), brand matching, unit price calculations, and strict rejection of variant mismatches (e.g. *Amul Taaza* vs *Amul Gold*).
- **Sync & Platform Adapters (`syncAndAdapters.test.ts`):** Validates all 4 platform adapters, 14-field data enrichment, BigBasket dynamic fee range preservation, resilient cache non-overwriting on provider failure, partial provider failure isolation, and refresh API endpoints.
- **Connector Contracts & Mappers (`connectors.contract.test.ts`, `mappers.test.ts`):** Validates honest capabilities, circuit breaker transitions, and sample API payload mapping with zero live CI network calls.
- **Resilience & Kill-Switch (`connectorFailures.test.ts`, `handoffAndKillSwitch.test.ts`):** Validates emergency kill switches, circuit breaker tripping, and graceful fallback hierarchies.

---

## 6. Platform Integration Matrix: Real vs Mock

| Platform | Current Mode | searchProducts | getPrices | getAvailability | getFees | createCart | Checkout Mechanism |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Blinkit** | `mock` / `manual` / `api` | Adapter / Seeded DB | 14-Field Adapter | 14-Field Adapter | ₹22 all-in | ❌ Unsupported | Search Links + Checklist |
| **Zepto** | `mock` / `manual` / `api` | Adapter / Seeded DB | 14-Field Adapter | 14-Field Adapter | ₹32 all-in | ❌ Unsupported | Search Links + Checklist |
| **Instamart** | `mock` / `manual` / `api` | Adapter / Seeded DB | 14-Field Adapter | 14-Field Adapter | ₹39 all-in | ❌ Unsupported | Search Links + Checklist |
| **BigBasket** | `mock` / `manual` / `api` | Adapter / Seeded DB | 14-Field Adapter | 14-Field Adapter | Dynamic handling | ❌ Unsupported | Search Links + Checklist |

*Note: Automated cart creation is unsupported. All live partner integration features require documented bilateral agreements or authorized API keys in `.env`.*

---

## 7. API Documentation

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | GET | System health, uptime, and platform killswitch states. |
| `/api/categories` | GET | Browse grocery categories with display metadata. |
| `/api/products/search` | GET | Search products with cross-platform pricing (`?refresh=true` triggers live sync). |
| `/api/products/:id` | GET | Single product details with all platform listings (`?refresh=true` triggers live sync). |
| `/api/products/:id/refresh` | POST | Explicitly refresh live data for a specific product from all platform adapters. |
| `/api/products/sync` | POST | Batch synchronize an entire basket of items across platforms. |
| `/api/sync/status` | GET | Real-time data sync configuration, cache TTL, and active provider modes. |
| `/api/optimizations` | POST | Execute 3-strategy basket optimization. |
| `/api/optimizations/:id` | GET | Retrieve saved optimization result. |
| `/api/platforms` | GET | Honest platform capability flags, health, and adapter registration. |
| `/api/connectors/health` | GET | Connector latency, error rates, circuit breaker states, and telemetry. |
| `/api/shopping-handoff` | POST | Generate merchant purchase checklists and deep/search links. |
| `/api/admin/platforms/:id/kill-switch` | POST/DELETE | Emergency activation/deactivation of connector kill switches. |
| `/api/admin/platforms/:id/mode` | POST | Runtime integration mode switching. |
| `/api/docs/openapi.json` | GET | OpenAPI 3.0 REST specification. |
