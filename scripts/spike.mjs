import { chromium } from "playwright";

const url = process.argv[2];
const headless = process.argv.includes("--headless");

if (!url) {
  console.error("Usage: node scripts/spike.mjs <url> [--headless]");
  process.exit(1);
}

console.log(`\n=== Running Spike on ${url} (mode: ${headless ? "headless" : "headed"}) ===`);

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  locale: "en-IN",
  timezoneId: "Asia/Kolkata",
});
const page = await context.newPage();

const interceptedResponses = [];

page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") || u.includes("search") || u.includes("product") || u.includes("gateway")) {
    console.log(`[NET] ${r.status()} ${u.substring(0, 100)}`);
    interceptedResponses.push({ status: r.status(), url: u });
  }
});

let resp = null;
try {
  resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) {
  console.error("Navigation error:", e.message);
}

const status = resp?.status();
let title = "";
try {
  title = await page.title();
} catch (e) {}

console.log(`Initial Status: ${status}`);
console.log(`Page Title: "${title}"`);

// Wait up to 8s for hydration/network
await page.waitForTimeout(8000);

// Check if page contains challenge/bot verification keywords
const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
const hasBotChallenge = /cloudflare|turnstile|captcha|datadome|challenge|access denied|perimeterx|security check|blocked/i.test(bodyText) || /just a moment|access denied|security service/i.test(title);

console.log(`Bot Challenge Detected: ${hasBotChallenge ? "YES" : "NO"}`);

const platformName = url.includes("blinkit") ? "blinkit" :
                     url.includes("zepto") ? "zepto" :
                     url.includes("swiggy") || url.includes("instamart") ? "instamart" :
                     url.includes("bigbasket") ? "bigbasket" : "custom";

const mode = headless ? "headless" : "headed";
const screenshotPath = `docs/phase-0/spike-${platformName}-${mode}.png`;

try {
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot to: ${screenshotPath}`);
} catch (e) {
  console.error("Failed to take screenshot:", e.message);
}

// Check if any product JSON was captured
const productJsonResponses = interceptedResponses.filter(
  (r) => r.status === 200 && (r.url.includes("search") || r.url.includes("product"))
);
console.log(`Product JSON Visible: ${productJsonResponses.length > 0 ? "YES" : "NO"} (${productJsonResponses.length} matching endpoints)`);

await browser.close();
console.log(`=== Completed Spike for ${platformName} ===\n`);
