import { PlatformId, LocationContext, RawObservation } from "@groqai/shared";

export interface ScrapeContext {
  platform: PlatformId;
  query: string;
  location: LocationContext;
  scrapeRunId?: string;
}

export interface PlatformScraper {
  platform: PlatformId;
  buildSearchUrl(query: string, loc: LocationContext): string;
  matchesResponse(url: string): boolean;
  parse(payload: unknown, ctx: ScrapeContext): RawObservation[];
  extractFromDom?(page: any, ctx: ScrapeContext): Promise<RawObservation[]>;
}

export interface RateLimiterOptions {
  minDelayMs: number; // e.g. 5000ms
  maxJitterMs: number; // e.g. 2000ms
  dailyCapPerPlatform?: number;
}

export interface ChallengeDetectionResult {
  isBlocked: boolean;
  reason?: string;
  statusCode?: number;
}
