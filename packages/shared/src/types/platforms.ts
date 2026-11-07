import type { PlatformId } from '../types.js';
import { SUPPORTED_PLATFORMS } from '../constants.js';

export type { PlatformId };
export { SUPPORTED_PLATFORMS };

export type PlatformIngestionMode = 'headed_worker' | 'manual_assisted';
export type CheckoutMechanism = 'Search Links + Checklist';

export interface PlatformMetadata {
  id: PlatformId;
  name: string;
  ingestionMode: PlatformIngestionMode;
  checkoutMechanism: CheckoutMechanism;
  searchBaseUrl: string;
}

export const PLATFORM_METADATA_REGISTRY: Record<PlatformId, PlatformMetadata> = {
  blinkit: {
    id: 'blinkit',
    name: 'Blinkit',
    ingestionMode: 'headed_worker',
    checkoutMechanism: 'Search Links + Checklist',
    searchBaseUrl: 'https://blinkit.com/s/?q=',
  },
  zepto: {
    id: 'zepto',
    name: 'Zepto',
    ingestionMode: 'headed_worker',
    checkoutMechanism: 'Search Links + Checklist',
    searchBaseUrl: 'https://www.zepto.com/search?q=',
  },
  bigbasket: {
    id: 'bigbasket',
    name: 'BigBasket',
    ingestionMode: 'headed_worker',
    checkoutMechanism: 'Search Links + Checklist',
    searchBaseUrl: 'https://www.bigbasket.com/ps/?q=',
  },
  instamart: {
    id: 'instamart',
    name: 'Swiggy Instamart',
    ingestionMode: 'manual_assisted',
    checkoutMechanism: 'Search Links + Checklist',
    searchBaseUrl: 'https://www.swiggy.com/instamart/search?query=',
  },
};
