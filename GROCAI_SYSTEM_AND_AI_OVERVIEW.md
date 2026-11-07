# GrocAI (GroqAI): System Architecture, Project Status, and AI Integration Overview

**Version:** 1.1.0  
**Generated Date:** November 8, 2026  
**Target Audience:** External Applications, Engineering Teams, Autonomous Agents, and API Consumers  
**Repository:** `GrocAI` (monorepo with `@groqai/shared`, `@groqai/web`, `@groqai/api`)  
**Active Branch:** `feat/phase-1-ingestion`  

---

## 1. Executive Summary & What the Project Is About

**GrocAI** (internally namespaced as **GroqAI**) is an autonomous, deterministic grocery price comparison and multi-cart basket optimizer engineered specifically for India’s quick-commerce grocery ecosystem:
- **Blinkit**
- **Zepto**
- **Swiggy Instamart**
- **BigBasket**

### 1.1 The Core Problem GrocAI Solves
In quick-commerce, individual product shelf prices do not represent the consumer's final out-of-pocket cost. Each platform levies dynamic platform fees, variable handling fees, surge pricing, delivery fees, and minimum order basket thresholds.
- Buying all items from the platform with the cheapest milk might make the basket significantly more expensive due to higher vegetable prices or handling fees.
- Splitting an order across four platforms to get the cheapest individual item prices often adds ₹80–₹160 in cumulative delivery and platform fees, erasing any shelf savings.

GrocAI solves this with an exact mathematical optimization engine that compares the total out-of-pocket cost across **3 transparent strategies**:
1. **Cheapest Item-by-Item:** Theoretical minimum shelf price purchasing each item wherever it is cheapest (informational floor).
2. **Cheapest Single Platform:** The lowest all-in basket fulfilled entirely by one store (serves as the named comparison baseline).
3. **Optimized Multi-Platform Split:** Evaluates all $2^N - 1$ ($2^4 - 1 = 15$) store combinations, checking delivery thresholds, handling fees, platform charges, and minimum order constraints to find real net savings.

---

## 2. Non-Negotiable Architectural & Engineering Invariants

Any external application integrating with GrocAI must uphold these core invariants:

| # | Invariant | Description |
|---|:---|:---|
| **1** | **Integer Paise Financial Precision** | All monetary calculations, fees, and prices are strictly computed and stored as integer paise ($1\text{ INR} = 100\text{ paise}$). Floating-point currency representation is strictly banned across the entire codebase to eliminate rounding errors. |
| **2** | **Deterministic Pricing Truth** | **No LLM or fuzzy reasoning is ever used for price arithmetic, calculations, or fee evaluations.** All matching, normalization, and optimization routines run as pure, deterministic code. |
| **3** | **Preservation of Unknown Fees** | Missing or variable fees (e.g. BigBasket's dynamic ₹5–₹15 handling fee) are **never coerced to 0**. They preserve `{ minPaise, maxPaise }` ranges and are flagged with `hasUnknownFees: true`. |
| **4** | **Honest Platform Capabilities** | Automated cart creation (`createCart`) is explicitly reported as `false` across all connectors via `NullCartAdapter`. GrocAI **never** handles user passwords, OTPs, or payment processing. Purchases hand off via official search links and copyable checklists. |
| **5** | **14-Field Normalized Observation Standard** | Every observed price captures 14 dimensions: `name`, `brand`, `quantity`, `pricePaise`, `originalPricePaise`, `discountPercentage`, `availabilityStatus`, `platformId`, `productUrl`, `imageUrl`, `pincode`, `observedAt`, `dataSource`, and `verificationStatus`. |
| **6** | **Apples-to-Apples Unit Normalization** | Quantities are normalized to reference units: Volume $\rightarrow$ 1 Litre, Weight $\rightarrow$ 1 kg, Count $\rightarrow$ 1 piece. This prevents false comparisons (e.g. 500 ml milk @ ₹33 vs 1 L milk @ ₹64). |

---

## 3. Current Project Status & Health

### 3.1 Verification & Test Metrics
- **Total Test Suite:** **154 passing tests** across 29 test files with **0 failures**.
  - `packages/shared`: 14 passed (3 test suites)
  - `apps/web`: 15 passed (6 test suites)
  - `apps/api`: 125 passed (20 test suites)
- **Quality Gates:** 100% clean across TypeScript compiler (`npm run typecheck`), ESLint (`npm run lint`), and production build (`npm run build`).

### 3.2 Implemented Milestones
- **Phase 0 (Baseline Demo):** Frozen with working mock data and deterministic optimizer (`tag: baseline-working-demo`).
- **Phase 1 (Live Ingestion Infrastructure):** Built standalone headed Playwright browser pool, Postgres scrape queue (`ScrapeJob`, `ScrapeRun`), and platform parsers (Blinkit JSON interception, BigBasket Tata catalog JSON, Zepto dual-mode, Instamart assisted entry).
- **Phase 2 & Hardening:** Scoped listings by location (`locationKey`, `pincode`), scheduled freshness engine (`scheduler.ts`), provenance-aware fee intelligence (`feeIntelligence.ts`), correlation ID tracing (`X-Request-Id`), and data provenance UI banners.
- **Current In-Flight Feature:** Human review workflow for unmatched price observations (`reviewStatus: pending | auto_matched | promoted | dismissed`).

### 3.3 Platform Integration Status Matrix

| Platform | Integration Mode | Method | Automated Live Feasibility | Checkout Mechanism |
| :--- | :---: | :--- | :---: | :--- |
| **Blinkit** | `headed_worker` / `api` | Network JSON interception (`/v1/layout/search`) | Headed Chromium verified | Search Links + Checklist |
| **Zepto** | `headed_worker` / `api` | Dual-mode: Network JSON + DOM extraction | Headed Chromium verified | Search Links + Checklist |
| **BigBasket** | `headed_worker` / `api` | Network JSON interception (`/listing-svc/v2/products`) | Headed Chromium verified | Search Links + Checklist |
| **Instamart** | `manual_assisted` | Assisted operator modal & manual submission API | Automated blocked (PerimeterX challenge) | Search Links + Checklist |

---

## 4. Current AI Architecture & Capabilities

### 4.1 What AI is Currently in the Project
The current AI implementation in GrocAI is designed around a **hybrid architecture**: flexible natural language understanding on the input layer coupled with strict mathematical determinism on the core financial engine.

```
Unstructured User Input (Text / Notes / Voice)
                     │
                     ▼
  ┌─────────────────────────────────────────────────────────┐
  │              NATURAL LANGUAGE PARSER LAYER              │
  │                                                         │
  │  Option A: DeterministicNLParser (Active Default)       │
  │  Option B: ExternalAIProviderParser (Pluggable LLM Hook) │
  └──────────────────────────┬──────────────────────────────┘
                             │ Structured Grocery Items:
                             │ [{ query: "milk", quantity: 2, unit: "L" }]
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │          DETERMINISTIC CATALOG MATCHING ENGINE          │
  │  • Token overlap & brand protection                     │
  │  • Metric pack-size unit normalization (L, kg, pcs)     │
  │  • Variant protection (e.g. Amul Taaza != Amul Gold)    │
  └──────────────────────────┬──────────────────────────────┘
                             │ Verified Platform Listings
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │         DETERMINISTIC 3-STRATEGY OPTIMIZER              │
  │  • Integer Paise Arithmetic                             │
  │  • All 15 Platform Subset Combinations                  │
  │  • Delivery, Handling, Platform Fee Evaluation          │
  └─────────────────────────────────────────────────────────┘
```

#### A. Natural Language Parser Layer (`DeterministicNLParser` & `ExternalAIProviderParser`)
- **Backend File:** `apps/api/src/services/naturalLanguageService.ts`
- **Frontend File:** `apps/web/src/services/naturalLanguageParser.ts`
- **Current Active Behavior:** A rule-based regex tokenizer capable of ingesting raw grocery notes:
  - Example input: `"2 litres milk, 12 eggs, 5 kg rice, 1 packet bread and 500g butter"`
  - Extracts item name, numerical quantity, standard unit (`L`, `ml`, `kg`, `g`, `pack`, `pcs`), and substitution permissions.
  - Normalizes dozen to 12 pieces, handles multi-character delimiters, and strips bullet points.

#### B. Pluggable AI / LLM Hook (`ExternalAIProviderParser`)
- Implements the `INLListParser` interface:
  ```typescript
  export interface INLListParser {
    parseText(rawText: string): Promise<GroceryListItemInput[]>;
  }
  ```
- Configured via environment variable `AI_PROVIDER` (e.g. `groq`, `openai`, `gemini`, `anthropic`).
- Defaults to `DeterministicNLParser` when `AI_PROVIDER=none`.

#### C. Strict AI Boundary / Guardrail Policy
To guarantee financial integrity and regulatory compliance, GrocAI enforces the following non-negotiable AI boundary:
> **LLMs and AI models are strictly limited to input understanding (text extraction, query normalization, fuzzy search intent, recipe breakdown) and are EXPLICITLY FORBIDDEN from performing price calculations, fee arithmetic, basket optimization, or price estimation.**

#### D. Algorithmic Intelligence (Catalog Matching & Suggestions)
- **Token Overlap & Guardrails (`MatchingService`):**
  - Evaluates similarity score ($0.0 \text{ to } 1.0$) between incoming product titles and database entries.
  - Rejects variant mismatches (e.g., *Amul Taaza* vs *Amul Gold*).
  - Rejects pack-size discrepancies (e.g., *1 L* vs *5 L*).
- **Candidate Suggestion Engine (`listingCandidate.ts`):**
  - Generates confidence scores and match reasons for unmatched platform observations awaiting human moderation.
- **Fee Intelligence (`feeIntelligence.ts`):**
  - Dynamically evaluates platform rules, tracking free delivery thresholds, handling fees, and platform surcharges with provenance tracking.

---

## 5. Roadmap & Recommended AI Extensions for Other Applications

External applications integrating with or extending GrocAI's AI layer can implement the following high-value capabilities:

### 5.1 Groq LPU / Fast LLM Inference Integration
- **Recipe-to-Cart Extraction:** Ingest recipe URLs or ingredient paragraphs (e.g., "Ingredients for Butter Chicken for 4 people") and convert them into standard grocery items with appropriate pack sizes.
- **Receipt & Invoice OCR:** Parse uploaded receipts or screenshots from Zepto/Blinkit orders into verified 14-field price observations.
- **Multilingual Indian Grocery Translation:** Support vernacular queries (e.g., "doodh", "chawal", "pyaaz", "atta") mapped to standardized catalog entities.

### 5.2 Intelligent Substitution Engine
- Recommend alternative brands when a requested item is out of stock (e.g., suggest Mother Dairy Toned Milk 500ml if Amul Taaza 500ml is unavailable), scoring similarity by nutritional profile, unit price, and user preference.

---

## 6. Monorepo Structure & Tech Stack

```
GrocAI/
├── packages/
│   └── shared/                # @groqai/shared: TypeScript types, Zod schemas, money/unit utilities
├── apps/
│   ├── web/                   # @groqai/web: React 18, Vite, Tailwind CSS, TanStack Query, React Router
│   └── api/                   # @groqai/api: Node.js, Express, TypeScript, Prisma ORM, Playwright
├── docker-compose.yml         # PostgreSQL 16 container definition
└── docs/                      # Comprehensive engineering specifications & compliance runbooks
```

### 6.1 Backend Tech Stack
- **Runtime:** Node.js 20+ with TypeScript (`tsx`)
- **Server:** Express 4.19 with Helmet, CORS, and Express Rate Limit
- **Database:** PostgreSQL 16 with Prisma ORM 5.14
- **Headless Ingestion:** Playwright 1.64 managing isolated browser contexts
- **Testing:** Vitest 1.6 + Supertest

### 6.2 Frontend Tech Stack
- **Framework:** React 18.3 with Vite 5.2
- **Styling:** Tailwind CSS 3.4 (Nest Mart & Grocery pastel theme with Quicksand typography)
- **State & Data Fetching:** TanStack React Query 5.37
- **Icons:** Lucide React

---

## 7. Key REST API Endpoints for External Applications

Base URL: `http://localhost:5001` (configurable via `PORT`)

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/health` | `GET` | Health check, uptime, platform kill-switch statuses. |
| `/api/products/search` | `GET` | Search catalog items with multi-platform pricing. Supports `?refresh=true`. |
| `/api/products/:id` | `GET` | Retrieve single product with all platform listings and unit prices. |
| `/api/products/:id/refresh` | `POST` | Trigger synchronous live sync across all platform adapters. |
| `/api/products/sync` | `POST` | Batch synchronize an entire basket of items across platforms. |
| `/api/sync/status` | `GET` | Sync configuration, cache TTL, and provider adapter modes. |
| `/api/optimizations` | `POST` | Execute 3-strategy basket optimization (item-by-item, single store, split). |
| `/api/optimizations/:id` | `GET` | Retrieve saved optimization result by ID. |
| `/api/platforms` | `GET` | Platform capability flags (`createCart: false`), latency, and health. |
| `/api/connectors/health` | `GET` | Connector latency, error rates, circuit breaker states. |
| `/api/data-provenance` | `GET` | Summary of catalog listings by provenance (`live_verified`, `cached`, `manual`, `mock`). |
| `/api/shopping-handoff` | `POST` | Generate verified deep links, search links, and copyable checklist. |
| `/api/ingestion/refresh` | `POST` | Enqueue background Playwright scrape jobs for platforms/locations. |
| `/api/observations/manual` | `POST` | Submit an operator or user price observation. |
| `/api/admin/platforms/:id/kill-switch` | `POST` / `DELETE` | Emergency enable/disable of specific platform connectors. |
| `/api/docs/openapi.json` | `GET` | Full OpenAPI 3.0 REST specification. |

---

## 8. Quick Start Guide for Developers & Applications

### 8.1 Prerequisites
- Node.js 20+
- PostgreSQL 16 (running locally on port 5432 or via Docker)

### 8.2 Environment Configuration (`apps/api/.env`)
```bash
PORT=5001
WEB_ORIGIN=http://localhost:5173
DATABASE_URL="postgresql://user:password@localhost:5432/groqai"
AI_PROVIDER="none"                # or "groq" / "openai" for custom LLM parser
PLAYWRIGHT_HEADLESS="false"       # headed required for anti-bot tolerance
PLAYWRIGHT_ENABLED="true"
ADMIN_API_KEY="optional-secret-key"
```

### 8.3 Starting the Services
```bash
# 1. Install all dependencies across monorepo
npm install

# 2. Start PostgreSQL container (if not using local daemon)
docker compose up -d

# 3. Setup Database & Seed Fixtures
npm run db:push --workspace=apps/api
npm run db:seed --workspace=apps/api

# 4. Run the API Server
npm run dev:api

# 5. Run the Web Application
npm run dev:web

# 6. Run Ingestion Worker (for live data scraping)
npm run worker --workspace=apps/api

# 7. Run All Tests
npm run test
```

---

## 9. Integration Checklist for External Applications

When consuming GrocAI or building on top of its API:
1. **Pass Location Context:** Always provide `pincode` (e.g. `"110001"`) or `locationKey` to receive accurate local pricing and fee rules.
2. **Treat Currency in Paise:** Read monetary values from `pricePaise`, `subtotalPaise`, and `estimatedTotalPaise`. Only use Rupee fields (`priceRupees`) for UI display.
3. **Respect Unknown Fees:** Check `hasUnknownFees` on optimization plans; if `true`, display the fee range (`minPaise` – `maxPaise`) rather than assuming a zero fee.
4. **Adhere to Handoff Architecture:** Do not attempt automated checkout; direct users to the generated platform search links or checklist returned by `/api/shopping-handoff`.
5. **Trace via Request IDs:** Supply `X-Request-Id` in request headers for end-to-end distributed tracing.
