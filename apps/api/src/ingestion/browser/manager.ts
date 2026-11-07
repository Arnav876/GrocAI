import { chromium, BrowserContext, Page } from "playwright";
import { PlatformId, LocationContext, RawObservation } from "@groqai/shared";
import { getBrowserSessionConfig } from "./session.js";
import { rateLimiter } from "./rateLimiter.js";
import { detectChallenge } from "./challengeDetector.js";
import {
  BlockedTargetResponse,
  describeBlockedTargetResponse,
} from "./targetResponses.js";
import { PlatformScraper, ScrapeContext } from "../types.js";

export class BrowserManager {
  private activeContexts: Map<PlatformId, BrowserContext> = new Map();

  async getContext(platform: PlatformId, loc?: LocationContext): Promise<BrowserContext> {
    const existing = this.activeContexts.get(platform);
    if (existing) {
      return existing;
    }

    // Default to headless so background ingestion does not steal window focus
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    const config = getBrowserSessionConfig(platform, loc, isHeadless);

    console.log(`[BrowserManager] Launching persistent context for ${platform} (headless: ${config.headless})...`);
    const context = await chromium.launchPersistentContext(config.userDataDir, {
      headless: config.headless,
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      geolocation: {
        latitude: config.location.latitude,
        longitude: config.location.longitude,
      },
      permissions: ["geolocation"],
      viewport: { width: 1280, height: 800 },
    });

    this.activeContexts.set(platform, context);
    return context;
  }

  async closeContext(platform: PlatformId): Promise<void> {
    const context = this.activeContexts.get(platform);
    if (context) {
      try {
        await context.close();
      } catch (e: any) {
        console.warn(`[BrowserManager] Error closing context for ${platform}:`, e.message);
      }
      this.activeContexts.delete(platform);
    }
  }

  async closeAll(): Promise<void> {
    for (const platform of Array.from(this.activeContexts.keys())) {
      await this.closeContext(platform);
    }
  }

  async scrapePlatform(
    scraper: PlatformScraper,
    ctx: ScrapeContext
  ): Promise<{ observations: RawObservation[]; isBlocked: boolean; error?: string }> {
    const { platform, query, location } = ctx;

    // Polite rate limiting with jitter before issuing request
    await rateLimiter.throttle(platform);

    const context = await this.getContext(platform, location);
    let page: Page | null = null;
    const interceptedPayloads: unknown[] = [];
    const blockedTargetResponses: BlockedTargetResponse[] = [];
    let mainStatus: number | undefined;

    const isTargetResponse = (url: string): boolean => {
      const filter = scraper.responseFilter ?? scraper.matchesResponse;
      return filter.call(scraper, url);
    };

    try {
      page = await context.newPage();

      // Collect every JSON response that matches this platform. A page often
      // emits autosuggest/telemetry JSON before the actual product payload, so
      // parsing only the first response is not reliable.
      page.on("response", async (response) => {
        const url = response.url();
        if (!isTargetResponse(url)) return;

        const status = response.status();
        if (status !== 200) {
          // Denials on the data endpoint are access-control/bot blocks, not
          // empty results. Capture a short body sample for honest reporting.
          if (status === 403 || status === 429 || status === 503) {
            let bodySnippet = "";
            try {
              bodySnippet = (await response.text()).slice(0, 300);
            } catch {
              // Body may be unavailable after navigation; status is enough.
            }
            blockedTargetResponses.push({ status, url, bodySnippet });
          }
          return;
        }

        const contentType = (response.headers()["content-type"] || "").toLowerCase();
        if (!contentType.includes("json")) return;

        try {
          interceptedPayloads.push(await response.json());
        } catch (e: any) {
          console.warn(`[BrowserManager] Failed to parse intercepted JSON for ${platform}:`, e.message);
        }
      });

      // Start waiting before navigation so we do not miss an early response.
      const targetResponse = page
        .waitForResponse(
          (response) =>
            isTargetResponse(response.url()) &&
            response.status() === 200 &&
            (response.headers()["content-type"] || "").toLowerCase().includes("json"),
          { timeout: 25000 }
        )
        .catch(() => null);

      const targetUrl = scraper.getNavigationUrl
        ? scraper.getNavigationUrl(query, location)
        : scraper.buildSearchUrl(query, location);
      console.log(`[BrowserManager] ${platform} navigating to: ${targetUrl}`);

      const resp = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      mainStatus = resp?.status();

      // Allow the client app to hydrate before interacting with it.
      await page.waitForTimeout(2500);

      if (scraper.interact) {
        // Start listening before interacting: typing and clicking may emit the
        // product payload while interact() is still settling. The earlier
        // navigation-time wait can resolve on a recommendation payload, so it
        // must not be used for interactive platforms.
        const interactionResponse = page
          .waitForResponse(
            (response) =>
              isTargetResponse(response.url()) &&
              response.status() === 200 &&
              (response.headers()["content-type"] || "").toLowerCase().includes("json"),
            { timeout: 25000 }
          )
          .catch(() => null);

        await scraper.interact(page, ctx);
        await interactionResponse;
      } else {
        // Wait for the product payload (or time out and fall back to the DOM).
        await targetResponse;
      }
      await page.waitForTimeout(2500);

      const title = await page.title().catch(() => "");
      const bodySample = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || "").catch(() => "");

      // Check anti-bot challenges. A bare HTTP 202 is not enough on its own:
      // some platforms return 202 transiently before serving the real page.
      const challenge = await detectChallenge(mainStatus, title, bodySample);
      if (challenge.isBlocked) {
        console.warn(`[BrowserManager] Anti-bot challenge detected on ${platform}: ${challenge.reason}`);
        await this.closeContext(platform);
        return {
          observations: [],
          isBlocked: true,
          error: challenge.reason,
        };
      }

      // Parse every captured JSON payload and keep the richest result.
      let bestObservations: RawObservation[] = [];
      for (const payload of interceptedPayloads) {
        const observations = scraper.parse(payload, ctx);
        if (observations.length > bestObservations.length) {
          bestObservations = observations;
        }
      }

      if (bestObservations.length > 0) {
        return { observations: bestObservations, isBlocked: false };
      }

      // Fallback: DOM extraction if supported
      if (scraper.extractFromDom) {
        const domObservations = await scraper.extractFromDom(page, ctx);
        if (domObservations.length > 0) {
          return { observations: domObservations, isBlocked: false };
        }
      }

      if (mainStatus === 202) {
        return {
          observations: [],
          isBlocked: true,
          error: "HTTP 202 Interstitial: no product data was served after challenge",
        };
      }

      const blockedReason = describeBlockedTargetResponse(
        platform,
        blockedTargetResponses
      );
      if (blockedReason) {
        console.warn(`[BrowserManager] ${blockedReason}`);
        await this.closeContext(platform);
        return { observations: [], isBlocked: true, error: blockedReason };
      }

      console.warn(
        `[BrowserManager] No product data captured for ${platform} (${interceptedPayloads.length} JSON responses, DOM fallback empty)`
      );
      return { observations: [], isBlocked: false };
    } catch (err: any) {
      console.error(`[BrowserManager] Error during scrape for ${platform}:`, err.message);
      return {
        observations: [],
        isBlocked: false,
        error: err.message,
      };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }
}

export const browserManager = new BrowserManager();

