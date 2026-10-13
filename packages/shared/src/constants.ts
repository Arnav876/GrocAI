import { PlatformCapabilities, PlatformId } from "./types.js";

export const SUPPORTED_PLATFORMS: PlatformId[] = ["blinkit", "zepto", "instamart", "bigbasket"];

export const PLATFORM_METADATA: Record<
  PlatformId,
  {
    name: string;
    brandColor: string;
    badgeBg: string;
    badgeText: string;
    websiteUrl: string;
    searchBaseUrl: string;
    defaultCapabilities: PlatformCapabilities;
  }
> = {
  blinkit: {
    name: "Blinkit",
    brandColor: "#F8CB46",
    badgeBg: "#FEF9E7",
    badgeText: "#9A7308",
    websiteUrl: "https://blinkit.com",
    searchBaseUrl: "https://blinkit.com/s/?q=",
    defaultCapabilities: {
      searchProducts: true,
      getPrices: true,
      getAvailability: true,
      getFees: true,
      createCart: false,
      supportsDeepLinks: false,
    },
  },
  zepto: {
    name: "Zepto",
    brandColor: "#6739B7",
    badgeBg: "#F0EBF9",
    badgeText: "#4A228A",
    websiteUrl: "https://www.zeptonow.com",
    searchBaseUrl: "https://www.zeptonow.com/search?q=",
    defaultCapabilities: {
      searchProducts: true,
      getPrices: true,
      getAvailability: true,
      getFees: true,
      createCart: false,
      supportsDeepLinks: false,
    },
  },
  instamart: {
    name: "Swiggy Instamart",
    brandColor: "#FC8019",
    badgeBg: "#FFF1E7",
    badgeText: "#C25200",
    websiteUrl: "https://www.swiggy.com/instamart",
    searchBaseUrl: "https://www.swiggy.com/instamart/search?query=",
    defaultCapabilities: {
      searchProducts: true,
      getPrices: true,
      getAvailability: true,
      getFees: true,
      createCart: false,
      supportsDeepLinks: false,
    },
  },
  bigbasket: {
    name: "BigBasket",
    brandColor: "#84C225",
    badgeBg: "#F1F8E6",
    badgeText: "#4B7C07",
    websiteUrl: "https://www.bigbasket.com",
    searchBaseUrl: "https://www.bigbasket.com/ps/?q=",
    defaultCapabilities: {
      searchProducts: true,
      getPrices: true,
      getAvailability: true,
      getFees: true,
      createCart: false,
      supportsDeepLinks: false,
    },
  },
};

export const LEGAL_DISCLAIMER_TEXT =
  "GroqAI is an independent grocery comparison tool and is not affiliated with, sponsored by, or endorsed by Blinkit, Zepto, Swiggy Instamart, or BigBasket. Prices, fees, and stock are estimated from available observations and may change. Always review and complete your final order and payment on the official merchant application.";
