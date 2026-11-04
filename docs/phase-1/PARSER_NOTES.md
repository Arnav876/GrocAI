# Platform Parser Implementation Notes — Phase 1

This document describes the intercepted endpoints, raw JSON payloads, request headers, and pagination/location quirks for each quick-commerce grocery platform in GrocAI's ingestion pipeline.

---

## 1. Blinkit (Zomato Quick Commerce)

- **Platform ID:** `blinkit`
- **Method / Engine:** Intercepted Headed Chromium network responses
- **Live Search URL:** `https://blinkit.com/s/?q=<query>`
- **Intercepted Endpoint:**
  - URL Pattern: `/v1/layout/search` or `/v2/layout/search`
  - Protocol: HTTPS / HTTP/2 JSON response
- **Headers & Context Required:**
  - `lat`, `lon` or cookie headers for location context (Delhi pincode `110001` mapped to `28.6139, 77.2090`).
  - Chromium user-agent and session context created via `BrowserManager`.
- **Top 5 Raw JSON Fields Used:**
  1. `item.product_name` / `item.name` -> `rawTitle`
  2. `item.brand` -> `brand`
  3. `item.unit` / `item.pack_size` -> `packSize` / `unit`
  4. `item.price` (or `item.normal_price`) -> `pricePaise` (converted via integer paise math)
  5. `item.mrp` -> `originalPricePaise`
  6. `item.image_url` -> `imageUrl`
  7. `item.inventory` / `item.out_of_stock` -> `availability` ("available" / "unavailable")
- **Quirks & Handling:**
  - Blinkit returns UI layout widgets where products are wrapped inside `product_card_snippet_type_2` objects.
  - The parser recursively searches layout objects and widgets if snippets are placed inside nested containers.
  - Price strings with "₹" or commas are cleaned and multiplied by 100 before rounding to integer paise.

---

## 2. BigBasket (Tata Enterprise Quick & Core Commerce)

- **Platform ID:** `bigbasket`
- **Method / Engine:** Intercepted Headed Chromium network responses
- **Live Search URL:** `https://www.bigbasket.com/ps/?q=<query>`
- **Intercepted Endpoint:**
  - URL Pattern: `/listing-svc/v2/products`
  - Protocol: HTTPS JSON response
- **Headers & Context Required:**
  - Tata BigBasket sets location cookies (`_bb_loc`, `_bb_city_id`) through user interaction.
- **Top 5 Raw JSON Fields Used:**
  1. `product.desc` -> `rawTitle`
  2. `product.brand.name` -> `brand`
  3. `product.w` -> `packSize` (e.g., "500 g", "1 kg")
  4. `product.pricing.discount.prim_price.sp` -> `pricePaise`
  5. `product.pricing.discount.mrp` -> `originalPricePaise`
  6. `product.images[0].s` -> `imageUrl`
  7. `product.availability.avail_status` -> `availability`
- **Quirks & Handling:**
  - Listing API wraps items under `tabs[0].product_info.products` or `response.products`.
  - BigBasket provides explicit MRP and Selling Price (SP). SP is parsed into integer paise.
  - Handling and convenience fee ranges are dynamic based on basket subtotal and time slot; never defaulted to ₹0 when unknown.

---

## 3. Zepto (KiranaKart Quick Commerce)

- **Platform ID:** `zepto`
- **Method / Engine:** Dual-mode parser: API JSON interception fallback + DOM card extraction
- **Live Search URL:** `https://www.zepto.com/search?q=<query>`
- **Intercepted Endpoint:**
  - URL Pattern: `/api/v2/search` or `/v1/search`
  - Protocol: HTTPS JSON or SSR rendered HTML
- **Top 5 Fields Used:**
  1. `item.productName` or DOM `data-testid="product-card-name"` -> `rawTitle`
  2. `item.brand` or title prefix extraction -> `brand`
  3. `item.formattedPacksize` or DOM `data-testid="product-card-quantity"` -> `packSize`
  4. `item.sellingPrice` or DOM price text -> `pricePaise`
  5. `item.mrp` or DOM strikethrough price -> `originalPricePaise`
  6. `item.images[0].url` -> `imageUrl`
  7. `item.outOfStock` -> `availability`
- **Quirks & Handling:**
  - Zepto frequently relies on server-rendered React components and hydration chunks.
  - When JSON interception does not catch a separate XHR, `ZeptoScraper.extractFromDom(page)` scans DOM elements containing `data-testid="product-card"`.
  - Anti-bot / rate-limit challenge detection triggers immediate pause and backs off; never injects stealth cloaking scripts.

---

## 4. Swiggy Instamart

- **Platform ID:** `instamart`
- **Method / Engine:** Assisted / Manual capture (API endpoint `POST /api/observations/manual` and UI modal)
- **Feasibility Decision:**
  - Instamart deploys strict PerimeterX / Cloudflare human-verification challenges on automated Chromium.
  - Per GrocAI compliance guidelines, CAPTCHAs, bot challenges, or evasion hacks are strictly forbidden.
  - Ingestion treats Instamart as assisted/manual capture with honest source attribution (`sourceType: "manual"` and verification badge `MANUAL` or `MOCK ESTIMATE`).
- **Endpoint for Ingestion:**
  - `POST /api/observations/manual`
  - Accepts `title`, `platform: "instamart"`, `priceRupees`, `mrpRupees`, `packSize`, `pincode`, and `notes`.
  - Automatically matches catalog products using `defaultMatcher` and stores verified `PriceObservation` records.
