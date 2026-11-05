import { PlatformScraper, ScrapeContext } from "../types.js";
import { LocationContext, RawObservation } from "@groqai/shared";

/**
 * Instamart does not permit automated browser scraping without PerimeterX evasion.
 * In strict compliance with GrocAI governance and platform policies, automated
 * scraping is disabled. Data is captured via manual/assisted user entries or official partner APIs.
 */
export class InstamartScraper implements PlatformScraper {
  readonly platform = "instamart" as const;

  buildSearchUrl(query: string, _loc: LocationContext): string {
    return `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(query)}`;
  }

  matchesResponse(_url: string): boolean {
    return false;
  }

  parse(_payload: unknown, _ctx: ScrapeContext): RawObservation[] {
    console.info("[InstamartScraper] Automated payload parsing is disabled. Use manual/assisted adapter.");
    return [];
  }
}

export const instamartScraper = new InstamartScraper();

