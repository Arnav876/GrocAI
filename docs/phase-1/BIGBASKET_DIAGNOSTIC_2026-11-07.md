# BigBasket Live Capture Diagnostic — 2026-11-07

## Summary
BigBasket served the HTML search shell but denied the product data request. The worker now reports this as a blocked capture and preserves previous stale prices instead of claiming a successful empty refresh.

## Reproduction
- Browser: headed Playwright Chromium with the persistent BigBasket profile (`apps/api/.cache/groqai/bigbasket`)
- Navigation: `https://www.bigbasket.com/ps/?q=Amul%20Taaza%20Toned%20Fresh%20Milk`
- Main document: `HTTP 200` (`text/html`)
- HTML shell loaded with skeleton product cards and the "Select Location" control
- Screenshot: [bigbasket-shell-2026-11-07.png](./diagnostics/bigbasket-shell-2026-11-07.png)

## Blocked data endpoint
```
GET https://www.bigbasket.com/listing-svc/v2/products?type=ps&slug=Amul%20Taaza%20Toned%20Fresh%20Milk&page=1&bucket_id=35
HTTP 403 (text/html)
```

Body:
```html
<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>
<H1>Access Denied</H1>
You don't have permission to access "http://www.bigbasket.com/listing-svc/v2/products?" on this server.
<P>Reference #18.148cd017.1794044349.864fb6c8
</BODY></HTML>
```

Response headers showed an Akamai edge denial:
- `server` chain not exposed by Playwright, but `x-akamai-cache: NotCacheable from child`
- `x-bb-grn: 0.148cd017.1794044349.864fb6c8` (matches the reference ID)
- The browser made three tagged listing-svc attempts; all returned the same 403.

The persistent profile still had BigBasket session and Akamai cookies (`_abck`, `bm_s`, `csrftoken`, etc.), so this is not a missing-cookie-only failure. The edge is denying the data endpoint for this session/IP. No CAPTCHA challenge was shown; the page simply rendered empty skeleton cards.

## Decision
- Do **not** attempt to bypass Akamai, replay tokens, solve challenges, or spoof fingerprints.
- Mark the capture `blocked` with the endpoint and HTTP status, as implemented in `apps/api/src/ingestion/browser/targetResponses.ts`.
- Keep the last stored BigBasket listing and let the 6-hour staleness policy label it stale.
- Use manual/assisted price capture until the platform provides a permitted feed or a valid human-refreshed session.
- Scheduler now backs off a recently blocked platform/location for `BLOCKED_PLATFORM_COOLDOWN_MS` (default 30 minutes).

## Verified worker behavior
```
[BrowserManager] bigbasket target endpoint blocked with HTTP 403: Access Denied (3 denied attempts) — https://www.bigbasket.com/listing-svc/v2/products?...
[Worker] Platform bigbasket challenge blocked job: ...
```

`/api/ingestion/status` then reported:
```json
{
  "blockedPlatforms": ["instamart", "bigbasket"],
  "lastRunByPlatform": {
    "bigbasket": { "status": "blocked", "itemsFound": 0 }
  }
}
```
