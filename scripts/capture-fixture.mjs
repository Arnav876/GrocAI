import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const platform = process.argv[2]; // blinkit, zepto, bigbasket
const query = process.argv[3] || "milk";

if (!platform) {
  console.error("Usage: node scripts/capture-fixture.mjs <blinkit|zepto|bigbasket> [query]");
  process.exit(1);
}

const urlMap = {
  blinkit: `https://blinkit.com/s/?q=${encodeURIComponent(query)}`,
  zepto: `https://www.zeptonow.com/search?q=${encodeURIComponent(query)}`,
  bigbasket: `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
};

const filterMap = {
  blinkit: (u) => u.includes("/v1/layout/search"),
  zepto: (u) => u.includes("bff-gateway.zepto.com") || (u.includes("/api/") && u.includes("search")),
  bigbasket: (u) => u.includes("/listing-svc/v2/products"),
};

const targetUrl = urlMap[platform];
const matchesFilter = filterMap[platform];

if (!targetUrl || !matchesFilter) {
  console.error(`Unknown platform: ${platform}`);
  process.exit(1);
}

console.log(`[Capture] Launching headed browser for ${platform} at ${targetUrl}...`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  locale: "en-IN",
  timezoneId: "Asia/Kolkata",
  geolocation: { latitude: 28.6304, longitude: 77.2177 },
  permissions: ["geolocation"],
});
const page = await context.newPage();

let capturedJson = null;
let capturedUrl = null;

page.on("response", async (r) => {
  const u = r.url();
  if (matchesFilter(u) && !capturedJson && r.status() === 200) {
    try {
      const text = await r.text();
      capturedJson = JSON.parse(text);
      capturedUrl = u;
      console.log(`[Capture] Successfully intercepted ${u}`);
    } catch (e) {
      console.error(`[Capture] Failed to parse JSON from ${u}:`, e.message);
    }
  }
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(10000);
} catch (e) {
  console.error("[Capture] Error during page navigation:", e.message);
}

await browser.close();

if (capturedJson) {
  const fixturePath = path.resolve(
    `apps/api/src/ingestion/platforms/__fixtures__/${platform}/${query}.json`
  );
  fs.writeFileSync(fixturePath, JSON.stringify(capturedJson, null, 2), "utf-8");
  console.log(`[Capture] Saved fixture (${Buffer.byteLength(JSON.stringify(capturedJson))} bytes) to ${fixturePath}`);
} else {
  console.warn(`[Capture] No matching JSON endpoint was intercepted for ${platform}.`);
}

