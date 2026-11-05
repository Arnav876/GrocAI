import { PlatformId, LocationContext, RawObservation } from "@groqai/shared";

export interface ScrapeContext {
  platform: PlatformId;
  query: string;
  location: LocationContext;
  scrapeRunId?: string;
}

export interface PlatformScraper {
  platform: PlatformId;
  /** Canonical search URL stored on observations for provenance. */
  buildSearchUrl(query: string, loc: LocationContext): string;
  /** URL the browser should open. Defaults to buildSearchUrl when omitted. */
  getNavigationUrl?(query: string, loc: LocationContext): string;
  matchesResponse(url: string): boolean;
  /** Optional stricter filter for the response we actually wait for. */
  responseFilter?(url: string): boolean;
  /** Optional UI interaction needed to trigger search (e.g. type + Enter). */
  interact?(page: any, ctx: ScrapeContext): Promise<void>;
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

