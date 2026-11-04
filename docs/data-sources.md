# GroqAI Data Sources Taxonomy & Governance Policy

This document defines the technical, architectural, and regulatory classification of data sources permitted within GroqAI.

---

## 1. Data Source Taxonomy & Verification Hierarchy

| Source Type | Description | Verification Status | Freshness Cache TTL | Staleness TTL | Legal Basis | UI Label |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `authorized_api` | Authenticated REST API endpoint provided under merchant developer terms. | `live_verified` (<15m)<br>`cached` (<6h)<br>`stale` (>6h) | 1 Hour | 6 Hours | Developer API License | `Live Verified` |
| `partner_feed` | Direct JSON/CSV catalog feed provided under bilateral enterprise partner agreement. | `live_verified` (<1h)<br>`cached` (<6h)<br>`stale` (>6h) | 1 Hour | 6 Hours | Commercial Partner Agreement | `Partner Feed` |
| `permitted_page` | Supervised, user-controlled browser session where the user navigates and views merchant page. | `live_verified` (<15m)<br>`cached` (<4h)<br>`stale` (>4h) | 1 Hour | 4 Hours | Supervised fair dealing; zero headless botting | `User Verified` |
| `manual` | Operator-audited or community submitted price observations for local pincodes. | `cached` (<6h)<br>`stale` (>6h) | 6 Hours | 24 Hours | Crowd intelligence / fair dealing | `Indicative` |
| `mock` | Local synthetic fixture catalog representing common grocery staples and tricky test cases. | `estimate` | Indefinite | 6 Hours | Development sandbox | `Indicative / Mock` |

---

## 2. Mandatory 14-Field Product Price Capture Standard

Every observation retrieved across all platform adapters captures the following 14 structured fields:

1. **Product Name:** Canonical title (e.g., `Amul Taaza Toned Fresh Milk`).
2. **Brand:** Recognized manufacturer brand (e.g., `Amul`, `Aashirvaad`, `Tata`).
3. **Quantity or Package Size:** Standard raw specification string (e.g., `500 ml`, `1 Litre`, `5 kg`, `6 pcs`).
4. **Price:** Integer paise ($1\text{ INR} = 100\text{ paise}$) and rupees ($₹$).
5. **Original Price (MRP):** Maximum retail price if marked down.
6. **Discount:** Percentage discount ($0 - 100\%$) and savings amount in paise.
7. **Availability Status:** `available`, `unavailable`, or `unknown`.
8. **Platform Name:** `blinkit`, `zepto`, `instamart`, or `bigbasket`.
9. **Product URL:** Direct merchant product deep link (where available).
10. **Product Image URL:** High-resolution product thumbnail or icon.
11. **Delivery Location / Serviceable Area:** Specific dark-store area and PIN code (e.g., `delhi_110001`).
12. **Last Successful Fetch Timestamp:** ISO 8601 string of actual provider retrieval.
13. **Data Source:** Exact classification (`authorized_api`, `partner_feed`, `permitted_page`, `manual`, `mock`).
14. **Price Verification Status:** `live_verified`, `cached`, `stale`, `unverified`, `unavailable`, or `estimate`.

---

## 3. Metric Unit-Price Normalization Standard

To eliminate misleading comparisons between different pack sizes (e.g. comparing a 500ml milk packet directly with a 1L packet), GroqAI standardizes all grocery products to consumer reference units:

* **Liquids / Volume:** Standardized to **1 Litre (1000 ml)** (e.g., 500ml @ ₹33 becomes **₹66.00 / L**).
* **Solids / Weight:** Standardized to **1 Kilogram (1000 g)** (e.g., 500g @ ₹45 becomes **₹90.00 / kg**).
* **Count / Units:** Standardized to **1 Piece** (e.g., 6 eggs @ ₹54 becomes **₹9.00 / pc**).
* **Dozen:** Standardized to **12 Pieces**.

Matches and basket calculations evaluate equivalent quantities and normalized unit prices rather than raw packet shelf tags.

---

## 4. Cache Freshness & Controlled Backoff Strategy

* **Cache Reuse (`PRICE_CACHE_TTL_MS`, 1 Hour):** If a listing was observed within the last hour, cached data is served immediately without making redundant external calls.
* **Staleness Threshold (`PRICE_STALE_TTL_MS`, 6 Hours):** Observations older than 6 hours are marked `isStale: true` and surfaced with a clock icon.
* **Non-Overwriting Invariant:** If an external provider request fails, times out, or trips its circuit breaker, **valid cached prices are NEVER overwritten with null, 0, or empty responses**. The system marks the listing as stale, logs the failure, and informs the user honestly.
* **Controlled Backoff:** Transient 5xx errors or network timeouts are retried up to 2 times using exponential backoff ($500\text{ms} \to 1000\text{ms}$). Consecutive failures trip the circuit breaker (`OPEN`) for 15 seconds to protect downstream platforms.

---

## 5. Browser Automation Feasibility Matrix (Section 9 Evaluation)

| Workflow Stage | Technical Feasibility | Legal / Platform Compliance | Implemented in GroqAI |
| :--- | :---: | :---: | :--- |
| **1. Searching Products** | Permitted via headless/headed browsing when allowed | Fair dealing for user search; anti-bot restrictions active on mobile endpoints | Supported via `PlaywrightAssistedConnector` (OFF by default, auto-disables on CAPTCHA) |
| **2. Reading Current Prices** | Feasible from public product pages | Must adhere to robots.txt and platform terms | Supported; enriched via `enrichObservation` |
| **3. Checking Availability** | Dark-store dependent (requires pincode) | Serviceable area cookies required | Supported via locationKey |
| **4. Matching Across Platforms** | Fully deterministic in code | Pure GroqAI code (zero platform network calls) | `MatchingService` + `UnitNormalizer` |
| **5. Adding Products to Cart** | ❌ Complex session token requirement | Prohibited without developer API authorization | ❌ **UNSUPPORTED** (`NullCartAdapter` active) |
| **6. Session Auth & OTPs** | ❌ Requires phone OTP / SMS bypass | Prohibited; GroqAI never requests or stores OTPs | ❌ **PROHIBITED** |
| **7. Completing Checkout** | ❌ Requires financial payment & address confirmation | Prohibited; payments occur exclusively on official checkout | ❌ **PROHIBITED** |

**Conclusion:** GroqAI automates search, price comparison, stock verification, and basket optimization, but directs users to the merchant's official web/app checkout via deep links and checklists for checkout and payment.
