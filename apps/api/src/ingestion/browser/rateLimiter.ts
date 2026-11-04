import { PlatformId } from "@groqai/shared";
import { RateLimiterOptions } from "../types.js";

export class PoliteRateLimiter {
  private lastRequestTimes: Map<PlatformId, number> = new Map();
  private dailyRequestCounts: Map<PlatformId, { count: number; date: string }> = new Map();
  private options: RateLimiterOptions;

  constructor(options: Partial<RateLimiterOptions> = {}) {
    this.options = {
      minDelayMs: options.minDelayMs ?? 5000,
      maxJitterMs: options.maxJitterMs ?? 2000,
      dailyCapPerPlatform: options.dailyCapPerPlatform ?? 500,
    };
  }

  async throttle(platform: PlatformId): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const daily = this.dailyRequestCounts.get(platform) || { count: 0, date: today };

    if (daily.date !== today) {
      daily.count = 0;
      daily.date = today;
    }

    if (this.options.dailyCapPerPlatform && daily.count >= this.options.dailyCapPerPlatform) {
      throw new Error(`Daily polite request cap (${this.options.dailyCapPerPlatform}) reached for ${platform}`);
    }

    const lastTime = this.lastRequestTimes.get(platform) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    const jitter = Math.floor(Math.random() * this.options.maxJitterMs);
    const requiredDelay = this.options.minDelayMs + jitter;

    if (elapsed < requiredDelay) {
      const waitTime = requiredDelay - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTimes.set(platform, Date.now());
    daily.count += 1;
    this.dailyRequestCounts.set(platform, daily);
  }

  getDailyCount(platform: PlatformId): number {
    return this.dailyRequestCounts.get(platform)?.count || 0;
  }

  reset(platform?: PlatformId) {
    if (platform) {
      this.lastRequestTimes.delete(platform);
      this.dailyRequestCounts.delete(platform);
    } else {
      this.lastRequestTimes.clear();
      this.dailyRequestCounts.clear();
    }
  }
}

export const rateLimiter = new PoliteRateLimiter();
