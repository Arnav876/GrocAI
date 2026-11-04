# GrocAI Phase 0 Data Acquisition Strategy & Decision Record

**Document Status:** Approved & Finalized  
**Date:** November 2026  
**Decision Authority:** GrocAI Architecture Board  
**Target:** Phase 1 Implementation Roadmap  

---

## 1. Decision Summary

Based on empirical evidence obtained during the Phase 0 Feasibility Spike, GrocAI adopts a **Polite Hybrid Data Strategy**:

| Platform | Chosen Strategy | Primary Acquisition Mode | Secondary / Fallback Mode |
| :--- | :--- | :--- | :--- |
| **Blinkit** | **Option A (Automated Capture)** | Headed Playwright worker querying `/v1/layout/search` at polite rate limit (max 1 req / 5s) | Seeded Mock Cache + Search Deep Link handoff |
| **Zepto** | **Option A (Automated Capture)** | Headed Playwright worker querying `bff-gateway.zepto.com/lms/api/v2/get_page` with geo-coordinates | Seeded Mock Cache + Search Deep Link handoff |
| **BigBasket** | **Option A (Automated Capture)** | Headed Playwright worker querying `bigbasket.com/listing-svc/v2/products` with bucket/pincode context | Seeded Mock Cache + Search Deep Link handoff |
| **Swiggy Instamart**| **Option B (Assisted Capture) / Option D** | User-assisted session / browser extension feed OR bilateral partner API | Indicative Manual Observation + Deep Link handoff |

---

## 2. Rationale

1. **Blinkit, Zepto, and BigBasket allow standard headed Chromium without bypass:**
   In our spike tests, headed browsers loaded pages with HTTP 200 and intercepted clear, structured product catalog JSON (`/v1/layout/search`, `bff-gateway`, `/listing-svc/v2/products`). No anti-bot evasion plugins or fingerprint falsification were necessary.
2. **Swiggy Instamart enforces strict PerimeterX challenge tokens:**
   Both headless and headed instances without real user cookies are rejected with HTTP 403. GrocAI explicitly rejects solving CAPTCHAs, spoofing fingerprints, or evading bot challenges. Therefore, Instamart will use **Option B (Assisted Session / Extension)** or partner API, falling back to indicative manual benchmarks.
3. **Graceful Fallbacks Guarantee High Availability:**
   If any platform tightens edge restrictions or trips circuit breakers, the system automatically falls back down the hierarchy (`Authorized API` → `Headed Ingestion Worker` → `Cached Observations` → `Manual Benchmarks` → `Search Checklist Links`).

---

## 3. Effort, Risk & Mitigation Matrix

| Dimension | Assessment | Details & Mitigations |
| :--- | :--- | :--- |
| **Development Effort** | **Medium (3–5 days)** | Implementing background worker queue (BullMQ/Redis or in-process queue), headed worker orchestration, rate limiter, and response parsers for Blinkit, Zepto, and BigBasket. |
| **IP / Rate Limit Risk** | **Medium** | Aggressive scraping risks residential IP throttling. **Mitigation:** Polite rate limiting (1 request per 5-10 seconds per platform), localized pincode caching with 1-hour TTL, and caching fresh listings. |
| **DOM / Schema Drift** | **Low-to-Medium** | JSON API endpoints are versioned (`/v1/layout/search`, `listing-svc/v2`). **Mitigation:** Zod runtime validation (`PriceObservation` schema) ensures corrupted responses trip fallbacks rather than crashing the app. |
| **Platform Terms Compliance**| **Strict Enforcement**| No automated cart creation (`createCart: false`), no credential/OTP storage, no payment processing. Users complete orders directly on merchant apps. |

---

## 4. Phase 1 Backlog & Implementation Plan

Now that the data strategy is explicitly chosen with real evidence, Phase 1 will construct the ingestion layer:

### Epic 1: Shared Data Contract Expansion
- [ ] Add all 14 telemetry fields to `PriceObservation` schema and Prisma DB (`normalizedUnitPricePaise`, `packUnit`, `serviceableArea`, `confidenceScore`, `verificationStatus`, `sourceType`).
- [ ] Run Prisma migration and regenerate Prisma Client.

### Epic 2: Polite Headed Ingestion Worker
- [ ] Create `HeadedScraperService` using Playwright in headed mode with rate limiting and concurrency capped at 1.
- [ ] Implement Blinkit response parser (`/v1/layout/search`).
- [ ] Implement Zepto response parser (`bff-gateway.zepto.com/lms/api/v2/get_page`).
- [ ] Implement BigBasket response parser (`listing-svc/v2/products`).

### Epic 3: Instamart Assisted / Manual Adapter
- [ ] Implement `InstamartAssistedAdapter` accepting imported session payload or manual price benchmark entries.
- [ ] Connect Swiggy search links to the checklist handoff screen.

### Epic 4: Matching Engine Integration
- [ ] Upgrade `GrocerySyncService.syncProduct()` to invoke `MatchingService.matchProduct()` across fuzzy tokens, brand synonyms, and pack size equivalence instead of defaulting to `observations[0]`.
- [ ] Eliminate `allProducts[0]` fallback in `server.ts`.

### Epic 5: End-to-End Freshness & Optimization Validation
- [ ] Verify that live synced observations show `live_verified` status when observed < 1 hour ago.
- [ ] Verify that the optimizer calculates multi-store splits using real ingested prices.

