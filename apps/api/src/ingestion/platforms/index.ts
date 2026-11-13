import { PlatformId } from "@groqai/shared";
import { PlatformScraper } from "../types.js";
import { blinkitScraper, searchBlinkitLive } from "./blinkit.js";
import { bigBasketScraper } from "./bigbasket.js";
import { zeptoScraper, searchZeptoLive } from "./zepto.js";
import { instamartScraper } from "./instamart.js";

export { blinkitScraper, searchBlinkitLive, bigBasketScraper, zeptoScraper, searchZeptoLive, instamartScraper };
export {
  parseBlinkitSearchPayload,
  parseZeptoSearchPayload,
  parseBigBasketSearchPayload,
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

