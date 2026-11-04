# GrocAI: Real-Time Grocery Data Synchronization Architecture & Implementation Plan

## 1. Existing System Analysis

### Tech Stack & Monorepo Architecture
* **Monorepo:** npm workspaces (`packages/shared`, `apps/api`, `apps/web`).
* **Database & ORM:** PostgreSQL 16 with Prisma ORM (`apps/api/prisma/schema.prisma`).
* **Backend:** Node.js, Express, TypeScript, Helmet, CORS, express-rate-limit.
* **Frontend:** React 18, Vite, Tailwind CSS, Lucide icons, React Router, TanStack Query.
* **Core Financial Invariant:** All calculations, fees, and prices are strictly maintained as **integer paise** ($1\text{ INR} = 100\text{ paise}$). Float arithmetic for currency is strictly prohibited across the codebase.

### Current Data Models & Storage Locations
* **`Product`:** Catalog master records (`id`, `name`, `brand`, `categoryId`, `variant`, `packSize`, `mrpPaise`, `rating`, `discountPercentage`, etc.).
* **`PlatformListing`:** Cross-platform listings linking `Product` to each store (`platform`, `currentPricePaise`, `availability`, `isStale`, `confidence`, `sourceType`, `lastObservedAt`, `productUrl`, `searchUrl`).
* **`PriceObservation`:** Time-series observation log tracking historical prices, timestamps, location keys, data source labels, and confidence.
* **`PlatformFeeRule`:** Location-aware fee structures per platform (delivery, handling, platform fees, free delivery thresholds, minimum order values).
* **`GroceryList` & `GroceryListItem`:** User baskets with query, quantity, unit, variant constraints, and substitution allowances.
* **`OptimizationResult`:** Saved results for the 3 optimization strategies.

### Current Data Source & Basket Logic
* **Data Sources:** Initialized with 40 realistic mock items (`sourceType: "mock"`). Connector hierarchy exists (`FallbackPlatformConnector`, `MockConnector`, `AuthorizedApiConnector`, `PlaywrightAssistedConnector`, `ManualPriceConnector`), but currently returns database-seeded mock records.
* **Optimization Engine (`optimizer.ts`):** Deterministic evaluation of:
  1. *Cheapest Item-by-Item* (theoretical shelf minimum).
  2. *Cheapest Single Platform* (named baseline).
  3. *Optimized Multi-Platform Split* (evaluating all $2^4 - 1 = 15$ platform subsets considering fees and minimum order limits).
* **Matching Engine (`matchingService.ts` & `unitNormalizer.ts`):** Deterministic token matching, metric conversion parsing, and strict variant conflict guards (e.g. *Taaza* vs *Gold*, *toned* vs *full cream*).

---

## 2. Technical Feasibility & Regulatory Assessment of Target Platforms

| Platform | Official Public API | Anti-Bot / Access Controls | Feasible Legal Integration Paths | Permitted Fallback |
| :--- | :---: | :--- | :--- | :--- |
| **Blinkit** | ❌ None | Akamai Bot Manager, session tokens, app-only signatures | 1. Authorized Partner Feed / API (with credentials)<br>2. Supervised Playwright (with user presence, auto-disable on challenge)<br>3. Verified Local Cache | Search links + shopping checklist |
| **Zepto** | ❌ None | Cloudflare Turnstile / Bot Management, mobile JWTs | 1. Authorized Partner Feed / API<br>2. Supervised Playwright<br>3. Verified Local Cache | Search links + shopping checklist |
| **Swiggy Instamart** | ❌ None | Cloudflare, device fingerprinting (`x-device-id`) | 1. Authorized Partner Feed / API<br>2. Supervised Playwright<br>3. Verified Local Cache | Search links + shopping checklist |
| **BigBasket** | ❌ None | Akamai, dynamic session headers, dynamic handling fees | 1. Authorized Partner Feed / B2B SLA<br>2. Supervised Playwright<br>3. Verified Local Cache | Search links + shopping checklist |

**Invariants Enforced:**
1. No CAPTCHA or Cloudflare bypass.
2. No scraping of user credentials, OTPs, or session tokens.
3. Automated cart creation is explicitly disabled (`NullCartAdapter`).
4. Hardcoded prices are never presented as real-time. Unverified or stale data is visibly distinguished.

---

## 3. Implementation Plan

### Step 1: Shared Types & Unit Price Normalization (`packages/shared`)
* Extend shared types with:
  * `PriceVerificationStatus` (`live_verified`, `cached`, `stale`, `unverified`, `unavailable`, `estimate`).
  * `NormalizedUnitPrice` (`unit`, `pricePerUnitPaise`, `pricePerUnitRupees`, `displayUnitPrice`).
  * Rich platform price metadata (`lastFetchedAt`, `serviceableArea`, `verificationStatus`, `normalizedUnitPrice`).
* Add unit price normalization functions in `unitNormalizer.ts` (e.g. converting 500ml milk at ₹33 to ₹66/L for accurate comparison with 1L packs).

### Step 2: Dedicated Modular Platform Adapters (`apps/api/src/connectors/adapters/`)
Implement a unified interface `IGroceryPlatformAdapter`:
* `BlinkitAdapter` (`blinkitAdapter.ts`)
* `ZeptoAdapter` (`zeptoAdapter.ts`)
* `InstamartAdapter` (`instamartAdapter.ts`)
* `BigBasketAdapter` (`bigbasketAdapter.ts`)
Each adapter encapsulates:
1. **Credentials & Config Check:** Reads `[PLATFORM]_API_BASE_URL` and `[PLATFORM]_API_KEY`.
2. **Circuit Breaker & Controlled Backoff:** Retries transient 5xx/timeout errors (max 2 retries) with exponential backoff; trips circuit breaker on 3 consecutive failures.
3. **Playwright Integration (if enabled):** Safely interacts with permitted pages without bypassing anti-bot defenses; auto-disables upon detecting challenge.
4. **Field Normalization:** Captures all 14 specified fields (name, brand, quantity, price, MRP, discount, availability, platform, URLs, location, fetch timestamp, source, verification status).
5. **Honest Capability Reporting:** Reports actual live access status.

### Step 3: Grocery Data Synchronization & Caching Service (`apps/api/src/services/grocerySyncService.ts`)
* Implements multi-provider coordinator:
  * Location-aware searches and price fetching by PIN code / `locationKey`.
  * Configurable freshness TTL (`PRICE_CACHE_TTL_MS`, default 1 hour; stale after 6 hours).
  * Cache lookup: Reuses fresh observations from `PlatformListing` and `PriceObservation`.
  * Out-of-date or forced refresh: Queries active adapter asynchronously.
  * Resilient update: **Never overwrites valid cached prices with failed requests**.
  * Updates `PlatformListing` and logs new `PriceObservation` records.
  * Handles partial provider failures gracefully (e.g., if Zepto fails, Blinkit, Instamart, and BigBasket comparisons proceed).

### Step 4: Backend API Routes & Basket Optimization Integration
* Update `POST /api/optimizations`:
  * Trigger data freshness evaluation and refresh for basket items.
  * Compare matching items using normalized unit prices where quantities differ.
  * Flag unverified items, label estimated checkout fees, and preserve unknown fee ranges.
* Add endpoints:
  * `POST /api/products/sync` — batch or item sync across platforms.
  * `POST /api/products/:id/refresh` — single product live refresh.
  * `GET /api/sync/status` — cache freshness and provider telemetry.

### Step 5: Frontend Enhancements (`apps/web`)
* In `ComparisonPage.tsx` and `ProductCard.tsx`:
  * Show accurate verification badges: **Live Verified**, **Cached**, **Stale**, or **Indicative / Mock**.
  * Display normalized unit price (e.g., "₹66.00 / L").
  * Add a "Refresh Prices" button with spinner, error handling, and retry option.
* In `OptimizationPage.tsx`:
  * Show per-platform fetch timestamps and verification statuses.
  * Clearly label estimates and separate unavailable items.

### Step 6: Testing & Documentation
* Unit and integration tests covering:
  * Unit price normalization (1L vs 500ml, 500g vs 1kg, 6pcs vs 12pcs).
  * Adapter data mapping, backoff, and circuit breaker.
  * Partial provider failure handling in basket optimizer.
  * Stale data marking and non-overwriting of valid cache on failure.
* Update `.env.example`, `docs/data-sources.md`, and generate `FINAL_REPORT.md`.
