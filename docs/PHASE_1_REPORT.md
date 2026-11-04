# Phase 1 Completion Report: Real-Time Ingestion Architecture & Platform Connectors

**Date:** 2026-11-05  
**Baseline Git Tag:** `baseline-working-demo` (commit `81eba0e`)  
**Branch:** `feat/phase-1-ingestion`  
**Test Suite:** 101 tests passing across 20 test files (up from 75 in Phase 0)  
**Quality Gate Status:** Typecheck ✅, Lint ✅, Tests ✅ (101/101 passing), Build ✅  

---

## 1. Executive Summary

Phase 1 transformed GrocAI from a mock-data prototype into an automated price-comparison platform with live ingestion infrastructure. The system now supports automated headed network capture for **Blinkit**, **BigBasket**, and **Zepto**, and an assisted manual entry pipeline for **Swiggy Instamart**.

All architectural invariants and non-negotiables established during Phase 0 remain strictly enforced:
1. **Zero Browser In API:** Express request handlers never launch Chromium; only the isolated ingestion worker process (`worker.ts`) manages Playwright sessions.
2. **Deterministic Financial Math:** Every price, fee, subtotal, and unit-price calculation is strictly computed in integer paise. No floating-point currency representation exists anywhere in the database or calculation engines.
3. **Honest Capability Contracts:** Automated checkout creation (`createCart`) remains disabled via `NullCartAdapter`.
4. **Anti-Bot & Terms Compliance:** Zero CAPTCHA solving, bot evasion plugins, or fingerprint tampering. When anti-bot gates (PerimeterX/Cloudflare) are detected, scrapers immediately halt and enter cooldown.
5. **Deterministic Catalog Matching:** Removed naive `observations[0]` fallbacks; prices only attach to catalog items when token overlap and pack-size checks confirm a verified match.

---

## 2. Epics Delivered

### Epic 1 — Data Contract and Schema
- **Database Schema Expansion:**
  - Expanded `PriceObservation` model in Prisma to store all 14 mandatory fields: `externalId`, `brand`, `variant`, `packSize`, `quantity`, `unit`, `originalPricePaise`, `discountPercentage`, `productUrl`, `imageUrl`, `searchUrl`, `pincode`, `serviceableArea`, `latitude`, `longitude`, `normalizedUnitPricePaise`, `normalizedUnit`, `verificationStatus`, `fetchedAt`, and `scrapeRunId`.
  - Added `ScrapeJob`, `ScrapeRun`, and `Location` models for queue management and historical run tracking.
  - Applied migration `20261104214314_phase1_ingestion_contract` without data loss.
- **Contract & Normalization:**
  - Implemented `apps/api/src/ingestion/normalize.ts` with `toObservation()`, enforcing strict integer paise conversion and unit price normalization.
  - Updated shared schemas in `packages/shared/src/types.ts` and `schemas.ts`.

### Epic 2 — Worker Infrastructure
- **Postgres Job Queue:**
  - Implemented `apps/api/src/ingestion/queue.ts` supporting `enqueue()`, atomic `claimNext()` using row locking, `finish()`, `fail()`, and `recoverStuckJobs()`.
- **Browser Lifecycle & Session Management:**
  - Implemented `BrowserManager` (`apps/api/src/ingestion/browser/manager.ts`) managing isolated persistent browser contexts per platform under `apps/api/.browser-profiles/`.
  - Configured Indian geolocation (`28.6139, 77.2090`), Kolkata timezone, and `en-IN` locale.
- **Rate Limiting & Safety:**
  - Implemented `DomainRateLimiter` enforcing minimum 5-second delays between requests plus randomized jitter.
  - Implemented `ChallengeDetector` detecting HTTP 403, 202, and PerimeterX/Cloudflare challenges, stopping immediately without evasion tooling.
- **Worker Process:**
  - Created standalone process entrypoint `apps/api/src/ingestion/worker.ts`.
  - Added npm scripts: `npm run worker` (continuous polling) and `npm run worker:once` (single pass).

### Epic 3 — Platform Parsers
- Built modular parsers in `apps/api/src/ingestion/platforms/`:
  - `BlinkitScraper`: Intercepts `/v1/layout/search` JSON snippets.
  - `BigBasketScraper`: Intercepts `/listing-svc/v2/products` Tata catalog JSON.
  - `ZeptoScraper`: Dual-mode with JSON interception and fallback DOM extraction.
  - `InstamartScraper`: Explicitly marks platform as requiring assisted capture.
- Captured real network payload fixtures in `__fixtures__/` and created offline parser tests verifying parsing, schema adherence, and error resiliency with zero live network calls.

### Epic 4 — Matching & Correctness
- Replaced dangerous `observations[0]` indexing in `GrocerySyncService.syncProduct` with `defaultMatcher.match()`.
- Replaced fallback `allProducts[0]` in `syncBasketItems` and `server.ts` with `null`, logging warnings and preventing accidental substitution.
- Added strict verification checks: only live feeds (`permitted_page`, `authorized_api`, `partner_feed`) clear the `isStale` flag.

### Epic 5 & 6 — Ingestion API & Instamart Manual Adapter
- **API Endpoints:**
  - `POST /api/ingestion/refresh`: Enqueues platform scrape jobs.
  - `GET /api/ingestion/jobs/:id`: Fetches job status and telemetry.
  - `GET /api/ingestion/status`: Reports queue depths and platform block status.
  - `POST /api/observations/manual`: Records user/operator price observations.
- **Frontend UI Integration:**
  - Added `ManualPriceModal` (`apps/web/src/components/products/ManualPriceModal.tsx`).
  - Added "+ Add Price" button on `SearchPage.tsx`.
  - Verified badges display all 5 states: `LIVE VERIFIED`, `CACHED`, `STALE`, `MANUAL`, and `MOCK ESTIMATE`.

### Epic 7 — Observability, Runbook & Documentation
- Published `docs/phase-1/PARSER_NOTES.md` documenting network patterns, headers, and quirks.
- Published `docs/phase-1/RUNBOOK.md` detailing startup, single-pass runs, Xvfb execution, and recovery.

---

## 3. Platform Capabilities & Status Matrix

| Platform | Integration Mode | Ingestion Method | Automation Feasibility | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Blinkit** | Headed Playwright | JSON Interception (`/v1/layout/search`) | Headed Chromium verified | Active |
| **BigBasket** | Headed Playwright | JSON Interception (`/listing-svc/v2/products`) | Headed Chromium verified | Active |
| **Zepto** | Headed Playwright | JSON Interception + DOM Fallback | Headed Chromium verified | Active |
| **Instamart** | Manual / Assisted | `POST /api/observations/manual` & UI Modal | Automated blocked (PerimeterX) | Manual / Assisted |

---

## 4. Test Suite Summary

All 101 tests pass across 20 test suites:

- **`@groqai/shared` (12 tests):**
  - Currency conversion, paise arithmetic, rounding guards.
  - Freshness TTL calculation (6-hour threshold).
  - Normalized unit price calculation.
- **`@groqai/web` (7 tests):**
  - Currency formatting components.
  - Price badge rendering (`LIVE VERIFIED`, `CACHED`, `STALE`, `MANUAL`, `MOCK ESTIMATE`).
  - Optimization breakdown and fee handling renders.
- **`@groqai/api` (82 tests):**
  - Contract & Schema roundtrip tests (`ingestionContract.test.ts`).
  - Queue, concurrency locking, and stuck job recovery (`queueAndWorker.test.ts`).
  - Platform scrapers against real fixtures without network calls (`platformParsers.test.ts`).
  - Deterministic matching and substitute prevention (`matching.test.ts`).
  - Ingestion and manual observation API endpoints (`ingestionApi.test.ts`).
  - Real-time sync, resilient fallback, and fault injection (`syncAndAdapters.test.ts`).
  - Optimizer deterministic integer paise solvers (`optimizer.test.ts`).
  - Handoff integrity and admin kill switches (`handoffAndKillSwitch.test.ts`).

---

## 5. Known Limitations & Handoff to Phase 2

1. **Platform Geolocation & Pincode Nuances:**
   - Ingestion currently defaults to Central Delhi (`110001` / `28.6139, 77.2090`). Expanding to Bangalore, Mumbai, and Hyderabad pincodes will require pre-seeded location cookies in Phase 2.
2. **Instamart Automation Policy:**
   - As established in compliance guidelines, GrocAI does not bypass bot gates. If Swiggy releases an authorized partner API or open portal, an adapter can be plugged into `InstamartAdapter`. Until then, assisted capture is the sanctioned mechanism.
3. **Multi-Item Basket Scrape Scheduling:**
   - In Phase 2, a cron/scheduler will periodically trigger `POST /api/ingestion/refresh` for top staple queries (milk, atta, eggs, dal, oil) so the cache remains fresh without manual triggers.
