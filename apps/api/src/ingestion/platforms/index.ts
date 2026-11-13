import { PlatformId } from "@groqai/shared";
import { PlatformScraper } from "../types.js";
import { blinkitScraper, searchBlinkitLive } from "./blinkit.js";
import { bigBasketScraper, searchBigBasketLive } from "./bigbasket.js";
import { zeptoScraper, searchZeptoLive } from "./zepto.js";
import { instamartScraper, searchInstamartLive } from "./instamart.js";

export {
  blinkitScraper,
  searchBlinkitLive,
  bigBasketScraper,
  searchBigBasketLive,
  zeptoScraper,
  searchZeptoLive,
  instamartScraper,
  searchInstamartLive,
};
export {
  parseBlinkitSearchPayload,
  parseZeptoSearchPayload,
  parseBigBasketSearchPayload,
  parseInstamartSearchPayload,
  createManualAssistedObservation,
  type ManualObservationInput,
} from "../payloadNormalizers.js";

export const PLATFORM_SCRAPERS: Record<PlatformId, PlatformScraper> = {
  blinkit: blinkitScraper,
  bigbasket: bigBasketScraper,
  zepto: zeptoScraper,
  instamart: instamartScraper,
};

export function getPlatformScraper(platform: PlatformId): PlatformScraper {
  const scraper = PLATFORM_SCRAPERS[platform];
  if (!scraper) {
    throw new Error(`No scraper registered for platform: ${platform}`);
  }
  return scraper;
}

