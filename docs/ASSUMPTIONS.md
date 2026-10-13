# GroqAI Engineering Assumptions & Decisions

This document records architectural, product, and operational assumptions made during autonomous engineering across Phase 1, Phase 2, and Phase 3.

## 1. Data Integrity & Financial Precision
- **Integer Paise:** All monetary calculations, database storage, fee aggregations, and optimization algorithms operate exclusively on integer paise (1 INR = 100 paise). Conversion to INR occurs strictly at presentation boundaries and public PriceObservation contract boundaries. Floating-point arithmetic for currency is strictly prohibited.
- **Unknown Fee Handling:** When a platform fee, handling charge, or delivery charge is not known or not published for a location, it is represented as `null` or a `{ minPaise, maxPaise }` range. Under no circumstances is an unknown fee defaulted or coerced to 0. Plans with unknown fees are explicitly flagged as estimates with a coverage warning.
- **Price Observations:** Every price observation includes `observedAt` (ISO timestamp), `sourceType` (`mock`, `manual`, `partner_feed`, `authorized_api`, `permitted_page`), and confidence score (0.0 to 1.0). Prices older than the configured TTL (default 6 hours) are flagged as stale with visual indicator in the UI.

## 2. Platforms & Legal Posture
- **Zero Public API Assumption:** Blinkit, Zepto, Swiggy Instamart, and BigBasket currently do not offer open public APIs for live catalog search, inventory, dynamic surge fees, or automated cart creation.
- **No Credentials / No Botting:** GroqAI never asks for, stores, or transmits user passwords, OTPs, session cookies, or payment information. We do not attempt to bypass CAPTCHA, Cloudflare, or rate limiters.
- **Handoff Authority:** GroqAI never executes payments or completes orders. All checkouts and payments occur on the respective merchant's own official web/mobile platform. The handoff screen provides direct deep links or explicit search links, coupled with a copyable shopping checklist.
- **Capabilities & Kill-Switches:** Every platform connector reports honest capabilities (`searchProducts`, `getPrices`, `getAvailability`, `getFees`, `createCart`, `supportsDeepLinks`). `createCart` is explicitly `false` on all platforms, backing into `NullCartAdapter`. Any connector can be instantly deactivated via an environment variable or admin kill switch.

## 3. Infrastructure & Environment
- **Monorepo Layout:** npm workspaces with `apps/web` (React 18 + Vite + Tailwind CSS), `apps/api` (Express + TypeScript + Prisma), and `packages/shared` (Zod schemas, types, shared calculations).
- **Database:** PostgreSQL with Prisma ORM. Local PostgreSQL is detected and supported natively, alongside `docker-compose.yml` for containerized deployments.
- **Ports:** API defaults to `5001`, Web frontend defaults to `5173`.
- **Mock-First Transition:** In Phase 1, `apps/web` interacts with a mock API client conforming exactly to the Phase 2 Express endpoints. In Phase 2, changing `VITE_API_BASE_URL` seamlessly connects to the real backend with zero UI refactoring required.

## 4. Matching & Optimization Engine
- **Deterministic Variant Guards:** Candidate matching uses token similarity only for shortlisting; strict deterministic guards reject different product variants (e.g. Amul Taaza vs Amul Gold) and incompatible pack sizes (e.g. 500ml vs 1L).
- **Unit Normalization:** Standard metric units (`g`, `kg`, `ml`, `l`, `pcs`, `pack`) are normalized deterministically (1 kg = 1000 g, 1 L = 1000 ml).
- **Optimization Strategy:** Evaluates all $2^4 - 1 = 15$ platform subsets deterministically. Enforces minimum order values, platform fees, handling fees, free delivery thresholds, and minimum savings thresholds before recommending a split basket.
