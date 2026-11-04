# GrocAI Feasibility Spike Report

**Date:** November 2026  
**Objective:** Empirically determine whether automated or browser-assisted data capture is feasible from this machine, under what conditions, and which security gates protect India's major quick-commerce platforms (**Blinkit, Zepto, Swiggy Instamart, BigBasket**).  
**Methodology:** Tested curl (edge), Playwright headless, and Playwright headed with network interception. No anti-bot evasion plugins or fake fingerprints were used.

---

## 1. Feasibility Matrix

| Platform | curl (Edge) | Playwright Headless | Playwright Headed | Product JSON Visible? | Bot / Gate Detected | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Blinkit** | 403 Forbidden | 403 Forbidden ("blinkit \| Error Page") | **200 OK** ("Buy milk Online \| blinkit") | **YES** (`/v1/layout/search?q=milk`) | Cloudflare / Akamai blocks headless; allows standard headed | **Feasible via Headed / Assisted Browser** |
| **Zepto** | 202 Accepted | 202 -> 429 Too Many Requests | **200 OK** (Redirects to `zepto.com/search?q=milk`) | **YES** (`bff-gateway.zepto.com/lms/api/v2/get_page`) | PerimeterX / Cloudflare challenges headless; headed passes challenge automatically | **Feasible via Headed / Assisted Browser** |
| **Instamart** | 202 Accepted | 202 -> 403 Forbidden | 202 -> 403 Forbidden | **NO** (Blocked at gateway) | Strict PerimeterX / Human challenge blocks headless & unauthenticated browser | **Requires User Assisted Session / Partner API** |
| **BigBasket** | 200 OK (HTML shell) | 403 Forbidden ("Access Denied") | **200 OK** | **YES** (`/listing-svc/v2/products?type=ps&slug=milk`) | Akamai Bot Manager blocks headless; allows standard headed | **Feasible via Headed / Assisted Browser** |

---

## 2. Platform-by-Platform Analysis

### 2.1 Blinkit (Zomato Quick Commerce)
- **Edge Status (curl):** `403 Forbidden`. Raw HTTP requests without browser TLS fingerprints and headers are immediately dropped.
- **Headless Browser:** `403 Forbidden`. Blinkit's Cloudflare/Akamai layer inspects headless Chrome flags (`navigator.webdriver`, headless user agent) and renders an error landing page.
- **Headed Browser:** `200 OK`. Standard Chromium window successfully completed handshake, loaded React SSR layout, and fired background catalog search requests:
  - `GET https://blinkit.com/v1/layout/search?q=milk&search_type=type_to_search` (HTTP 200)
  - `GET https://blinkit.com/v1/layout/search?offset=12&limit=12&actual_query=milk` (HTTP 200)
- **Artifacts:**
  - Headless Screenshot: `docs/phase-0/spike-blinkit-headless.png`
  - Headed Screenshot: `docs/phase-0/spike-blinkit-headed.png`
- **Location Dependency:** Catalog items and dark-store stock are bound to geolocation cookies (`lat`, `lon`, `pincode`). Defaults to Central Delhi / Bengaluru IP location without explicit pincode.

### 2.2 Zepto (KiranaKart Technologies)
- **Edge Status (curl):** `202 Accepted`. Returns an interstitial JavaScript challenge token.
- **Headless Browser:** Fails JavaScript evaluation loop, leading to `429 Too Many Requests`.
- **Headed Browser:** `200 OK`. The browser executes the initial interstitial token check in ~1.2s, seamlessly navigates to `https://www.zepto.com/search?q=milk`, and issues catalog gateway requests:
  - `GET https://bff-gateway.zepto.com/lms/api/v2/get_page?latitude=12.96902&longitude=77.75395&page_type=HOME` (HTTP 200)
  - 17 image and product asset endpoints resolved successfully.
- **Artifacts:**
  - Headless Screenshot: `docs/phase-0/spike-zepto-headless.png`
  - Headed Screenshot: `docs/phase-0/spike-zepto-headed.png`
- **Location Dependency:** Zepto queries `bff-gateway` with precise latitude/longitude coordinates corresponding to serviceable micro-warehouses (dark stores).

### 2.3 Swiggy Instamart (Bundl Technologies)
- **Edge Status (curl):** `202 Accepted`. PerimeterX / DataDome gatekeeper challenge.
- **Headless Browser:** `202 -> 403 Forbidden`. PerimeterX detects headless browser environment and blocks downstream API access.
- **Headed Browser:** `202 -> 403 Forbidden`. Even in a headed browser, PerimeterX halts automated Chromium instances that lack an existing authenticated user session, persistent browser profile, or local mobile device tokens.
- **Artifacts:**
  - Headless Screenshot: `docs/phase-0/spike-instamart-headless.png`
  - Headed Screenshot: `docs/phase-0/spike-instamart-headed.png`
- **Location Dependency:** Swiggy requires high-precision address resolution and location cookies before exposing dark-store stock.
- **Conclusion:** Automated headless/headed bot scraping on Instamart is not feasible without bypassing PerimeterX gates (which GrocAI strictly refuses to do). Feasible only through **Assisted Capture** (user's real browser session / extension) or **Partner API**.

### 2.4 BigBasket (Tata Digital)
- **Edge Status (curl):** `200 OK` on initial HTML shell, but no dynamic product listings are returned in curl response.
- **Headless Browser:** `403 Forbidden` with page title `"Access Denied"` generated by Akamai Bot Manager.
- **Headed Browser:** `200 OK`. Headed browser passed Akamai sensor checks and queried listing service:
  - `GET https://www.bigbasket.com/listing-svc/v2/products?type=ps&slug=milk&page=1&bucket_id=11` (HTTP 200)
  - Returned structured JSON product catalog including price, MRP, discounts, and pack sizes.
- **Artifacts:**
  - Headless Screenshot: `docs/phase-0/spike-bigbasket-headless.png`
  - Headed Screenshot: `docs/phase-0/spike-bigbasket-headed.png`
- **Location Dependency:** BigBasket requires a `bucket_id` or city/pincode context to return accurate local pricing and delivery slot availability.

---

## 3. Key Spike Findings

1. **Headless Scraping is Uniformly Dead:**
   All 4 platforms block headless Playwright with 403 Forbidden or challenge loops. Any ingestion pipeline relying on headless server-side bots without stealth plugins is non-viable.
2. **Standard Headed Browsers Work on 3/4 Platforms:**
   Blinkit, Zepto, and BigBasket allow standard headed Chromium without stealth patches or fingerprint spoofing, successfully exposing product and search API JSON feeds.
3. **Swiggy Instamart Enforces Strictest Perimeter:**
   Swiggy Instamart requires user session tokens or browser cookies that are only present in a genuine consumer browsing session.
4. **Geolocation / Pincode is Mandatory:**
   Prices, stock availability, and delivery fees vary by dark-store serviceability. Live pricing requires passing user location parameters (latitude/longitude or pincode) to the gateway endpoints.
