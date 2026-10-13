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

## 3. Getting Started

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

## 4. Verification & Testing

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

### Test Coverage Highlights (60 Tests)
- **Financial Invariants (`property.test.ts`):** Verifies across randomized baskets that estimated totals strictly equal `subtotal + delivery + handling + platform - discounts`.
- **Optimization Scenarios (`optimizer.test.ts`):** Evaluates single store wins, multi-store splits, fee-erased split rejections, minimum order violations, out-of-stock handling, budget alerts, and tie breaking.
- **Deterministic Matching (`matching.test.ts`):** Metric conversions (ml/L, g/kg), brand matching, and strict rejection of variant mismatches (e.g. *Amul Taaza* vs *Amul Gold*).
- **Connector Contracts & Mappers (`connectors.contract.test.ts`, `mappers.test.ts`):** Validates honest capabilities, circuit breaker transitions, and sample API payload mapping with zero live CI network calls.
- **Resilience & Kill-Switch (`connectorFailures.test.ts`, `handoffAndKillSwitch.test.ts`):** Validates emergency kill switches, circuit breaker tripping, and graceful fallback hierarchies.

---

## 5. Platform Integration Matrix: Real vs Mock

| Platform | Current Mode | searchProducts | getPrices | getAvailability | getFees | createCart | Checkout Mechanism |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Blinkit** | `mock` / `manual` | Seeded DB / Manual | Seeded DB | Seeded DB | ₹22 all-in | ❌ Unsupported | Search Links + Checklist |
| **Zepto** | `mock` / `manual` | Seeded DB / Manual | Seeded DB | Seeded DB | ₹32 all-in | ❌ Unsupported | Search Links + Checklist |
| **Instamart** | `mock` / `manual` | Seeded DB / Manual | Seeded DB | Seeded DB | ₹39 all-in | ❌ Unsupported | Search Links + Checklist |
| **BigBasket** | `mock` / `manual` | Seeded DB / Manual | Seeded DB | Seeded DB | Dynamic handling | ❌ Unsupported | Search Links + Checklist |

*Note: Automated cart creation and live scraping are unsupported. All live partner integration features require documented bilateral agreements and sign-off in `docs/compliance-checklist.md`.*

---

## 6. API Documentation

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | GET | System health, uptime, and platform killswitch states. |
| `/api/categories` | GET | Browse grocery categories with display metadata. |
| `/api/products/search` | GET | Search products with cross-platform lowest price indicators. |
| `/api/products/:id` | GET | Single product details with all platform listings. |
| `/api/optimizations` | POST | Execute 3-strategy basket optimization. |
| `/api/optimizations/:id` | GET | Retrieve saved optimization result. |
| `/api/platforms` | GET | Honest platform capability flags and health. |
| `/api/connectors/health` | GET | Connector latency, error rates, circuit breaker states, and telemetry. |
| `/api/shopping-handoff` | POST | Generate merchant purchase checklists and deep/search links. |
| `/api/admin/platforms/:id/kill-switch` | POST/DELETE | Emergency activation/deactivation of connector kill switches. |
| `/api/admin/platforms/:id/mode` | POST | Runtime integration mode switching. |
| `/api/docs/openapi.json` | GET | OpenAPI 3.0 REST specification. |
