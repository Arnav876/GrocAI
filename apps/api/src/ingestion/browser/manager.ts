import { chromium, BrowserContext, Page } from "playwright";
import { PlatformId, LocationContext, RawObservation } from "@groqai/shared";
import { getBrowserSessionConfig } from "./session.js";
import { rateLimiter } from "./rateLimiter.js";
import { detectChallenge } from "./challengeDetector.js";
import { PlatformScraper, ScrapeContext } from "../types.js";

export class BrowserManager {
  private activeContexts: Map<PlatformId, BrowserContext> = new Map();

  async getContext(platform: PlatformId, loc?: LocationContext): Promise<BrowserContext> {
    const existing = this.activeContexts.get(platform);
    if (existing) {
      return existing;
    }

    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === "true";
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
    let interceptedJson: unknown = null;
    let mainStatus: number | undefined;

    try {
      page = await context.newPage();

      // Set up network interceptor
      page.on("response", async (response) => {
        const url = response.url();
        if (scraper.matchesResponse(url) && !interceptedJson && response.status() === 200) {
          try {
            const text = await response.text();
            interceptedJson = JSON.parse(text);
          } catch (e: any) {
            console.warn(`[BrowserManager] Failed to parse intercepted JSON for ${platform}:`, e.message);
          }
        }
      });

      const targetUrl = scraper.buildSearchUrl(query, location);
      console.log(`[BrowserManager] ${platform} navigating to: ${targetUrl}`);

      const resp = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      mainStatus = resp?.status();

      // Wait up to 6 seconds for network activity and hydration
      await page.waitForTimeout(6000);

      const title = await page.title().catch(() => "");
      const bodySample = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || "").catch(() => "");

      // Check anti-bot challenges
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

      // If intercepted JSON exists, parse it
      if (interceptedJson) {
        const observations = scraper.parse(interceptedJson, ctx);
        return { observations, isBlocked: false };
      }

      // Fallback: DOM extraction if supported
      if (scraper.extractFromDom) {
        const domObservations = await scraper.extractFromDom(page, ctx);
        if (domObservations.length > 0) {
          return { observations: domObservations, isBlocked: false };
        }
      }

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
