import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlinkitScraper, blinkitScraper, searchBlinkitLive } from "../ingestion/platforms/blinkit.js";
import { ZeptoScraper, zeptoScraper, searchZeptoLive } from "../ingestion/platforms/zepto.js";
import { BlinkitAdapter } from "../connectors/adapters/blinkitAdapter.js";
import { ZeptoAdapter } from "../connectors/adapters/zeptoAdapter.js";
import { NormalizedObservationSchema } from "@groqai/shared";

describe("Live Data Phase B — Real-Time Live Connectors (Blinkit & Zepto)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Blinkit Live Connector (BlinkitScraper)", () => {
    it("conforms to PlatformScraper interface invariants", () => {
      expect(blinkitScraper.platform).toBe("blinkit");
      expect(
        blinkitScraper.buildSearchUrl("milk", {
          locationKey: "bengaluru_560064",
          pincode: "560064",
          city: "Bengaluru",
          latitude: 13.1007,
          longitude: 77.5963,
        })
      ).toBe("https://blinkit.com/s/?q=milk");
      expect(blinkitScraper.matchesResponse("https://blinkit.com/v1/layout/search")).toBe(true);
      expect(blinkitScraper.matchesResponse("https://blinkit.com/v1/other")).toBe(false);
    });

    it("Tier 1: executes direct BFF request with location headers and returns 14-field integer paise observations", async () => {
      const mockBlinkitPayload = {
        response: {
          snippets: [
            {
              widget_type: "product_card_snippet_type_2",
              data: {
                identity: { id: "19512" },
                name: { text: "Amul Taaza Toned Milk" },
                brand_name: { text: "Amul" },
                variant: { text: "500 ml" },
                normal_price: { text: "₹28" },
                mrp: { text: "₹30" },
                inventory: 15,
                is_sold_out: false,
                image: { url: "https://cdn.grofers.com/amul-milk.png" },
              },
            },
          ],
        },
      };

      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockBlinkitPayload,
      } as any);

      const results = await blinkitScraper.searchLive("amul taaza milk", "560064");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain("https://blinkit.com/v1/layout/search");
      expect((callArgs[1]?.headers as any).lat).toBe("13.1007");
      expect((callArgs[1]?.headers as any).lon).toBe("77.5963");
      expect((callArgs[1]?.headers as any).app_client).toBe("consumer_web");

      expect(results.length).toBe(1);
      const item = results[0];

      // Strict 14-field schema check
      const valid = NormalizedObservationSchema.safeParse(item);
      expect(valid.success).toBe(true);

      // Integer paise check
      expect(item.name).toBe("Amul Taaza Toned Milk");
      expect(item.brand).toBe("Amul");
      expect(item.quantity).toBe("500 ml");
      expect(item.pricePaise).toBe(2800);
      expect(Number.isInteger(item.pricePaise)).toBe(true);
      expect(item.originalPricePaise).toBe(3000);
      expect(item.discountPercentage).toBe(7);
      expect(item.availabilityStatus).toBe("IN_STOCK");
      expect(item.platformId).toBe("blinkit");
      expect(item.pincode).toBe("560064");
      expect(item.normalizedUnitPricePaise).toBe(5600); // 2800 paise / 0.5 L = 5600 paise / L
    });

    it("Tier 3: degrades gracefully with zero unhandled exceptions on network or HTTP error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ETIMEDOUT network error"));

      const results = await blinkitScraper.searchLive("milk", "560064");
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("searchBlinkitLive helper delegates directly to scraper", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Offline"));
      const res = await searchBlinkitLive("eggs", "560064");
      expect(res).toEqual([]);
    });
  });

  describe("Zepto Live Connector (ZeptoScraper)", () => {
    it("conforms to PlatformScraper interface invariants", () => {
      expect(zeptoScraper.platform).toBe("zepto");
      expect(
        zeptoScraper.buildSearchUrl("milk", {
          locationKey: "bengaluru_560064",
          pincode: "560064",
          city: "Bengaluru",
          latitude: 13.1007,
          longitude: 77.5963,
        })
      ).toBe("https://www.zepto.com/search?query=milk");
      expect(zeptoScraper.matchesResponse("https://www.zepto.com/user-search-service/api/v3/search")).toBe(true);
    });

    it("Financial Precision Invariant: preserves Zepto native integer paise without double-multiplying by 100", () => {
      const mockPayload = {
        products: [
          {
            id: "pvid-12345",
            product: { name: "Nandini Pasteurised Toned Milk", brand: "Nandini" },
            productVariant: { formattedPacksize: "500 ml" },
            sellingPrice: 2700, // 2700 paise = ₹27.00
            discountedSellingPrice: 2700,
            mrp: 2700,
            isOutOfStock: false,
          },
        ],
      };

      const raw = zeptoScraper.parse(mockPayload, {
        platform: "zepto",
        query: "milk",
        location: {
          locationKey: "bengaluru_560064",
          pincode: "560064",
          city: "Bengaluru",
          latitude: 13.1007,
          longitude: 77.5963,
        },
      });

      expect(raw.length).toBe(1);
      // Critical test: must be 2700, NEVER 270000!
      expect(raw[0].pricePaise).toBe(2700);
      expect(raw[0].originalPricePaise).toBe(2700);
    });

    it("parses string rupee prices correctly from DOM/fallback items", () => {
      const mockDomPayload = {
        products: [
          {
            id: "dom-item-1",
            name: "Country Delight Cow Milk",
            packSize: "500 ml",
            sellingPrice: "₹38",
            mrp: "₹40",
          },
        ],
      };

      const raw = zeptoScraper.parse(mockDomPayload, {
        platform: "zepto",
        query: "milk",
        location: {
          locationKey: "bengaluru_560064",
          pincode: "560064",
          city: "Bengaluru",
          latitude: 13.1007,
          longitude: 77.5963,
        },
      });

      expect(raw.length).toBe(1);
      expect(raw[0].pricePaise).toBe(3800);
      expect(raw[0].originalPricePaise).toBe(4000);
      expect(raw[0].discountPercentage).toBe(5);
    });

    it("Tier 3: degrades gracefully with zero crashes when live session encounters an error", async () => {
      const results = await zeptoScraper.searchLive("bread", "560064");
      expect(Array.isArray(results)).toBe(true);
    });

    it("searchZeptoLive helper delegates directly to scraper", async () => {
      const res = await searchZeptoLive("butter", "560064");
      expect(Array.isArray(res)).toBe(true);
    });
  });

  describe("Platform Adapters (BlinkitAdapter & ZeptoAdapter)", () => {
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        product: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        platformListing: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
    });

    it("BlinkitAdapter returns enriched PriceObservations when mode is live and live search succeeds", async () => {
      const adapter = new BlinkitAdapter(mockPrisma, "live");
      expect(adapter.getMode()).toBe("live");

      // Mock searchLive
      vi.spyOn(blinkitScraper, "searchLive").mockResolvedValueOnce([
        {
          name: "Amul Taaza Toned Milk",
          brand: "Amul",
          quantity: "500 ml",
          pricePaise: 2800,
          originalPricePaise: 3000,
          discountPercentage: 7,
          availabilityStatus: "IN_STOCK",
          platformId: "blinkit",
          productUrl: "https://blinkit.com/prn/amul-taaza-toned-milk/prid/19512",
          imageUrl: "https://cdn.grofers.com/amul.png",
          pincode: "560064",
          observedAt: new Date().toISOString(),
          dataSource: "headed_worker",
          verificationStatus: "VERIFIED",
          normalizedUnitPricePaise: 5600,
        },
      ]);

      const obs = await adapter.searchProducts("amul milk", "bengaluru_560064");
      expect(obs.length).toBe(1);
      expect(obs[0].platform).toBe("blinkit");
      expect(obs[0].title).toBe("Amul Taaza Toned Milk");
      expect(obs[0].pricePaise).toBe(2800);
      expect(obs[0].price).toBe(28); // Rupees
      expect(obs[0].verificationStatus).toBe("live_verified");
      expect(adapter.getLastSuccessfulFetch()).not.toBeNull();
    });

    it("ZeptoAdapter returns enriched PriceObservations when mode is live and live search succeeds", async () => {
      const adapter = new ZeptoAdapter(mockPrisma, "live");
      expect(adapter.getMode()).toBe("live");

      vi.spyOn(zeptoScraper, "searchLive").mockResolvedValueOnce([
        {
          name: "Nandini GoodLife Milk",
          brand: "Nandini",
          quantity: "500 ml",
          pricePaise: 3200,
          originalPricePaise: 3200,
          discountPercentage: 0,
          availabilityStatus: "IN_STOCK",
          platformId: "zepto",
          productUrl: "https://www.zepto.com/pn/nandini-goodlife/pvid/789",
          imageUrl: null,
          pincode: "560064",
          observedAt: new Date().toISOString(),
          dataSource: "headed_worker",
          verificationStatus: "VERIFIED",
          normalizedUnitPricePaise: 6400,
        },
      ]);

      const obs = await adapter.searchProducts("nandini milk", "bengaluru_560064");
      expect(obs.length).toBe(1);
      expect(obs[0].platform).toBe("zepto");
      expect(obs[0].title).toBe("Nandini GoodLife Milk");
      expect(obs[0].pricePaise).toBe(3200);
      expect(obs[0].price).toBe(32);
      expect(obs[0].verificationStatus).toBe("live_verified");
      expect(adapter.getLastSuccessfulFetch()).not.toBeNull();
    });

    it("falls back to standard fallback hierarchy if live search returns 0 results", async () => {
      const adapter = new BlinkitAdapter(mockPrisma, "live");
      vi.spyOn(blinkitScraper, "searchLive").mockResolvedValueOnce([]);

      // Will fall back to MockConnector which queries mock products
      const obs = await adapter.searchProducts("milk", "bengaluru_560064");
      expect(Array.isArray(obs)).toBe(true);
    });
  });
});
