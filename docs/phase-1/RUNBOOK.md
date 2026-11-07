# GrocAI Ingestion Worker Runbook

This runbook guides operators and developers on running, monitoring, debugging, and recovering the GrocAI ingestion worker.

---

## 1. Quick Start Commands

The ingestion worker runs as a dedicated background process isolated completely from Express HTTP request handlers.

### Continuous Daemon Mode
To start the worker in continuous polling mode:
```bash
# From repository root
npm run worker --workspace=apps/api

# Or directly within apps/api
cd apps/api
npm run worker
```
- Polls PostgreSQL `ScrapeJob` table every 5,000ms.
- Automatically claims pending jobs using `FOR UPDATE SKIP LOCKED`.
- Performs challenge detection before and during navigation.
- Recovers stuck jobs abandoned by crashing workers (> 15 minutes).

### Single-Job Pass Mode
To process at most one queued job and exit immediately (useful for cron jobs, local testing, or CI tasks):
```bash
npm run worker:once --workspace=apps/api
```

### Freshness Scheduler
The scheduler flags listings older than 6 hours as stale and enqueues one polite refresh job per platform/location (Instamart is skipped). It reuses an existing queued/running job instead of piling up duplicates.
```bash
# Run one maintenance cycle and exit
npm run scheduler:once --workspace=apps/api

# Run continuously (default every 15 minutes)
npm run scheduler --workspace=apps/api

# Override the interval
CATALOG_MAINTENANCE_INTERVAL_MS=300000 npm run scheduler --workspace=apps/api
```

## 2. Fee Intelligence

Fee rules are location-scoped and carry provenance. Unknown fees are stored as `null` (or a `{minPaise,maxPaise}` range) and are never coerced to ₹0. If a location has no rule, optimization warnings explicitly say the fees are unknown.

```bash
# Read fee structures for a location (all four platforms)
curl 'http://localhost:5001/api/fees?locationKey=delhi_110001'

# Record manually verified fees (instamart/bigbasket included; no checkout automation)
curl -X PUT http://localhost:5001/api/fees/bigbasket \
  -H "Content-Type: application/json" \
  -d '{
    "locationKey": "delhi_110001",
    "deliveryFeePaise": 3000,
    "handlingFeeRangeMinPaise": 500,
    "handlingFeeRangeMaxPaise": 1500,
    "platformFeePaise": 300,
    "freeDeliveryThresholdPaise": 25000,
    "minimumOrderValuePaise": 15000,
    "notes": ["Verified in app on 2026-11-07"]
  }'
```

Manual entries are stamped `sourceType: "manual"` and appear in optimization warnings; seeded values are stamped `mock` and also produce a verification warning.

## 3. Triggering Ingestion Jobs

### Via HTTP API
You can enqueue jobs via the Express API:
```bash
curl -X POST http://localhost:5001/api/ingestion/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["blinkit", "zepto", "bigbasket"],
    "queries": ["amul milk", "aashirvaad atta"],
    "locationKey": "delhi_110001",
    "priority": 10
  }'
```

The UI "Live Refresh" and `POST /api/products/:id/refresh` use the same queue. They return immediately with `refresh.status: "queued"` and job IDs; the frontend polls `GET /api/ingestion/jobs/:id` before re-reading the catalog. A queued refresh is never presented as verified fresh data.

### Checking Queue & Job Status
```bash
# Check aggregate queue depth and platform status
curl -s http://localhost:5001/api/ingestion/status | jq

# Check a specific job by ID
curl -s http://localhost:5001/api/ingestion/jobs/<JOB_ID> | jq
```

---

## 4. Submitting Manual Instamart / Offline Prices

Since Swiggy Instamart is routed through assisted/manual capture to respect anti-bot gates:
```bash
curl -X POST http://localhost:5001/api/observations/manual \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "instamart",
    "title": "Amul Taaza Homogenised Toned Milk",
    "priceRupees": 33,
    "mrpRupees": 35,
    "packSize": "500 ml",
    "pincode": "110001",
    "notes": "Verified in Instamart app"
  }'
```
Or use the frontend UI:
1. Open http://localhost:5173/search.
2. Click the **+ Add Price** button in the search banner.
3. Fill in product title, platform, price, and pack size.
4. Click Submit.

---

## 5. Recovering Blocked Platforms

When a platform responds with HTTP 403, 202, or a PerimeterX/Cloudflare challenge:
1. `ChallengeDetector` halts the scraper immediately to avoid sending suspicious traffic.
2. The job is marked as `failed` or `blocked` with the error `Anti-bot challenge detected`.
3. The platform enters an exponential backoff state (10m - 30m cooldown).

### Recovery Steps:
1. Check blocked platforms:
   ```bash
   curl -s http://localhost:5001/api/ingestion/status | jq '.blockedPlatforms'
   ```
2. Inspect browser profile directory:
   Profiles are saved in `apps/api/.browser-profiles/<platform>`.
3. If necessary, launch an interactive headed session to refresh human cookies:
   ```bash
   node -e '
     import("playwright").then(async ({ chromium }) => {
       const ctx = await chromium.launchPersistentContext("apps/api/.browser-profiles/zepto", { headless: false });
       const page = await ctx.newPage();
       await page.goto("https://www.zepto.com");
       console.log("Press Ctrl+C when session is ready");
     });
   '
   ```
4. Reset the cooldown timer in `apps/api/src/ingestion/browser/challengeDetector.ts` or restart the worker process.

---

## 6. Running with Xvfb on Headless Linux Hosts

Headed Chromium requires an X11 display. On headless cloud servers (e.g. AWS EC2, GCP, Ubuntu server), run the worker inside an Xvfb virtual framebuffer:

### Install Xvfb
```bash
sudo apt-get update && sudo apt-get install -y xvfb
```

### Launch Worker inside Xvfb
```bash
xvfb-run --server-args="-screen 0 1280x800x24" npm run worker --workspace=apps/api
```

---

## 7. Emergency Kill Switch

If a connector behaves erratically or sends excessive requests, use the admin kill switch:
```bash
# Deactivate Blinkit connector immediately
curl -X POST http://localhost:5001/api/admin/platforms/blinkit/kill-switch

# Re-enable connector
curl -X DELETE http://localhost:5001/api/admin/platforms/blinkit/kill-switch
```

---

## 8. Admin Authentication & Request Tracing

Set `ADMIN_API_KEY` in production. When present, `/api/admin/*` and `PUT /api/fees/:platform` require either `x-admin-key: <key>` or `Authorization: Bearer <key>`. User-facing refresh endpoints remain open because they only enqueue read-only ingestion jobs. When the key is unset (local development), admin routes stay open and responses include `X-Admin-Auth: disabled`.

Every response includes `X-Request-Id` (client-supplied values are accepted when alphanumeric) and structured logs include the same correlation ID. Error responses also carry `requestId` for tracing.

