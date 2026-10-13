# GroqAI Phase 3 Engineering Report: Platform Integration & Governance

## 1. Executive Summary
Phase 3 extends GroqAI's backend connector architecture to support honest, validated capability management, runtime fallback hierarchies, independent connector adapters, immediate platform kill switches, and strict compliance enforcement. Under non-negotiable legal and platform constraints, automated cart creation (`createCart`) is explicitly reported as `false` across all quick-commerce platforms via `NullCartAdapter`. Handoff workflows generate copyable shopping checklists, verified deep links where official structures are known, and search links with clear merchant disclaimers.

## 2. What Was Built

### A. Capability & CartAdapter Layer (`apps/api/src/connectors`)
- **`cartAdapter.ts`**:
  - `ICartAdapter` interface with structured `CartTransferResult`.
  - `NullCartAdapter`: Active default adapter that honestly returns `status: "unsupported"`, zero simulated success, and points the user to review their basket on the platform's official checkout.
- **Independent Connector Adapters**:
  - `AuthorizedApiConnector`: Generic HTTP adapter configured via environment variables (`<PLATFORM>_API_BASE_URL`, `<PLATFORM>_API_KEY`). Features exponential backoff retries, request timeout race conditions, rate limit (429) detection, circuit breaker with `CLOSED`, `OPEN`, and `HALF_OPEN` states, and typed payload mappers.
  - `IPlatformPayloadMapper` with clearly documented `TODO` mappers for Blinkit, Zepto, Swiggy Instamart, and BigBasket.
  - `ManualPriceConnector`: Serves operator or user-submitted price observations stamped with `sourceType: "manual"`, confidence 0.80, and mandatory "Indicative" labelling. Enforces 24-hour expiration rules.
  - `LinksChecklistConnector`: Zero-API-access adapter that builds platform search links and copyable markdown shopping checklists with merchant checkout disclaimers.
  - `PlaywrightAssistedConnector`: Optional, headed user-supervised assistant that is **OFF by default** (`PLAYWRIGHT_ENABLED=false`). Never stores passwords, session cookies, or OTPs, and automatically deactivates upon detecting any CAPTCHA or challenge.
  - `LicensedProviderConnector`: Stub for commercial data feed partners with contract governance metadata, 30-day retention policies, and attribution notices.

### B. Runtime Fallback Hierarchy (`apps/api/src/connectors/fallbackHierarchy.ts`)
- Implements dynamic runtime fallback:
  $$\text{Authorized API / Partner Feed} \longrightarrow \text{Permitted Catalog} \longrightarrow \text{Manual Entries} \longrightarrow \text{Mock Catalog} \longrightarrow \text{Links + Checklist}$$
- If an upstream connector times out or its circuit breaker trips to `OPEN`, the adapter automatically cascades down the hierarchy without throwing unhandled exceptions.

### C. Kill Switches & Observability (`apps/api/src/connectors/registry.ts`, `catalogJobs.ts`, `server.ts`)
- **Emergency Platform Kill Switch**:
  - Admin endpoints: `POST /api/admin/platforms/:id/kill-switch` and `DELETE /api/admin/platforms/:id/kill-switch`.
  - Immediately isolates and disables a connector without server restarts.
- **Runtime Mode Switching**:
  - Admin endpoint: `POST /api/admin/platforms/:id/mode` (`mock`, `manual`, `partner_feed`, `authorized_api`, `permitted_page`, `links_only`).
- **Connector Health & Observability Endpoint**:
  - `GET /api/connectors/health`: Reports live connector status, circuit breaker state, average latency, error rate, and background maintenance alerts.
- **Background Catalog Service (`catalogJobs.ts`)**:
  - Identifies listings older than 6 hours and stamps them as `isStale: true`.
  - Aggregates alerts without logging user addresses, cookies, or authorization tokens.

### D. Compliance Documentation (`docs/`)
- `docs/platform-capabilities.md`: Detailed verified capabilities matrix explicitly documenting that NO platform has verified live API access.
- `docs/data-sources.md`: Classification of data sources, confidence scoring, TTL, and legal posture.
- `docs/compliance-checklist.md`: Per-platform go/no-go production release checklist with all criteria starting unchecked (`[ ]`).

### E. Frontend Enhancements (`apps/web`)
- Updated `PlatformsPage.tsx`:
  - Visual status cards for Blinkit, Zepto, Instamart, and BigBasket.
  - Verified capabilities badges (`createCart: Unsupported`).
  - Interactive admin mode dropdown and emergency kill-switch button.
  - Degraded operating mode alert banner when any connector is deactivated.
  - Real-time telemetry: latency, error rate, and background job metrics.

## 3. How to Run Phase 3 Features

### Start Services
```bash
# Terminal 1: Backend API (port 5001)
npm run dev:api

# Terminal 2: Web Frontend (port 5173)
npm run dev:web
```

### Testing Platform Governance Endpoints
```bash
# Health & Telemetry
curl http://localhost:5001/api/connectors/health

# Trigger Blinkit Kill Switch
curl -X POST http://localhost:5001/api/admin/platforms/blinkit/kill-switch

# Query Platforms to see disabled status
curl http://localhost:5001/api/platforms

# Re-enable Blinkit
curl -X DELETE http://localhost:5001/api/admin/platforms/blinkit/kill-switch

# Switch Zepto to Manual Mode
curl -X POST http://localhost:5001/api/admin/platforms/zepto/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"manual"}'
```

## 4. Test Suite Summary
Vitest executed across all workspaces with **60 passing tests** (0 failures):
- `@groqai/shared`: 7 passing tests.
- `@groqai/web`: 7 passing tests.
- `@groqai/api`: 46 passing tests:
  - `connectors.contract.test.ts` (6): Verifies `createCart: false` across all platforms, Playwright OFF by default, licensed provider stub, Zod schema validation, manual pricing labels, zero-API links generator.
  - `mappers.test.ts` (8): Fixture-based tests for Blinkit, Zepto, Instamart, and BigBasket mappers; malformed payload rejections.
  - `connectorFailures.test.ts` (4): Timeout handling, circuit breaker tripping to OPEN state, graceful fallback, partial platform failure recovery.
  - `handoffAndKillSwitch.test.ts` (4): Handoff fallback to `links_and_checklist`, emergency kill switch activation/deactivation, runtime mode switching, invalid mode validation.
  - `matching.test.ts` (7): Unit conversion, variant guards, pack size rejection.
  - `optimizer.test.ts` (11): 3-strategy optimization, minimum order rules, missing items, budget checks, ties.
  - `property.test.ts` (1): Property invariant test.
  - `api.test.ts` (5): End-to-end REST endpoint tests.

## 5. What Is Real vs Mock
- **Real:** Express server, PostgreSQL persistence, mathematical optimizer, matching engine, circuit breakers, fallback hierarchy, admin kill switches, background maintenance service, frontend UI.
- **Mock/Indicative:** Platform catalog observations are marked `sourceType: "mock"` or `sourceType: "manual"`. No live web scraping or reverse engineering is performed.
- **Checkout:** Automated cart transfer is disabled (`createCart: false`). All purchases occur through merchant search links and copyable checklists.
