import { describe, it, expect } from "vitest";
import {
  BlinkitPartnerPayloadMapper,
  ZeptoPartnerPayloadMapper,
  InstamartPartnerPayloadMapper,
  BigBasketPartnerPayloadMapper,
} from "../connectors/authorizedApiConnector.js";
import { PriceObservationSchema } from "@groqai/shared";

describe("Phase 3 Platform Fixture-Based Mapper Tests", () => {
  describe("Blinkit Partner Mapper", () => {
    const mapper = new BlinkitPartnerPayloadMapper();

    it("correctly maps valid sample payload into standardized PriceObservation[]", () => {
      const fixturePayload = {
        items: [
          {
            id: "bl-item-101",
            name: "Amul Taaza Toned Milk",
            brand: "Amul",
            variant: "Toned",
            unit: "1 L",
            price_paise: 5400,
            in_stock: true,
            product_url: "https://blinkit.com/prn/bl-item-101",
            search_url: "https://blinkit.com/s/?q=Amul+Taaza",
          },
        ],
      };

      const results = mapper.mapProducts(fixturePayload, "delhi_110001");
      expect(results.length).toBe(1);
      const item = results[0];
      expect(item.platform).toBe("blinkit");
      expect(item.productId).toBe("bl-item-101");
      expect(item.title).toBe("Amul Taaza Toned Milk");
      expect(item.price).toBe(54); // 5400 paise -> ₹54
      expect(item.currency).toBe("INR");
      expect(item.availability).toBe("available");
      expect(item.sourceType).toBe("authorized_api");

      const validated = PriceObservationSchema.safeParse(item);
      expect(validated.success).toBe(true);
    });

    it("rejects malformed payload missing items array", () => {
      expect(() => mapper.mapProducts({}, "delhi_110001")).toThrow(
        "Invalid Blinkit payload"
      );
    });
  });

  describe("Zepto Partner Mapper", () => {
    const mapper = new ZeptoPartnerPayloadMapper();

    it("correctly maps valid sample payload", () => {
      const fixturePayload = {
        products: [
          {
            sku_id: "zep-sku-202",
            title: "Fortune Sunflower Oil 1L",
            brand_name: "Fortune",
            variant: "Refined",
            quantity_unit: "1 L",
            price_paise: 16500,
            available: true,
          },
        ],
      };

      const results = mapper.mapProducts(fixturePayload, "delhi_110001");
      expect(results.length).toBe(1);
      const item = results[0];
      expect(item.platform).toBe("zepto");
      expect(item.productId).toBe("zep-sku-202");
      expect(item.price).toBe(165);
      expect(item.availability).toBe("available");

      const validated = PriceObservationSchema.safeParse(item);
      expect(validated.success).toBe(true);
    });

    it("rejects malformed payload missing products array", () => {
      expect(() => mapper.mapProducts(null, "delhi_110001")).toThrow(
        "Invalid Zepto payload"
      );
    });
  });

  describe("Swiggy Instamart Partner Mapper", () => {
    const mapper = new InstamartPartnerPayloadMapper();

    it("correctly maps nested data.items sample payload", () => {
      const fixturePayload = {
        data: {
          items: [
            {
              item_id: "insta-303",
              name: "Farm Fresh Brown Eggs",
              brand: "FreshFarm",
              variant: "Brown",
              pack_description: "6 pcs",
              final_price: 65,
              in_stock: true,
            },
          ],
        },
      };

      const results = mapper.mapProducts(fixturePayload, "delhi_110001");
      expect(results.length).toBe(1);
      const item = results[0];
      expect(item.platform).toBe("instamart");
      expect(item.productId).toBe("insta-303");
      expect(item.price).toBe(65);
      expect(item.availability).toBe("available");

      const validated = PriceObservationSchema.safeParse(item);
      expect(validated.success).toBe(true);
    });

    it("rejects malformed payload missing data.items", () => {
      expect(() => mapper.mapProducts({ data: {} }, "delhi_110001")).toThrow(
        "Invalid Instamart payload"
      );
    });
  });

  describe("BigBasket Partner Mapper", () => {
    const mapper = new BigBasketPartnerPayloadMapper();

    it("correctly maps sample payload with tab product structure", () => {
      const fixturePayload = {
        tabs: [
          {
            product_info: {
              products: [
                {
                  sku: "bb-404",
                  p_desc: "Aashirvaad Superior MP Whole Wheat Atta",
                  p_brand: "Aashirvaad",
                  p_variant: "Whole Wheat",
                  w: "5 kg",
                  sp_paise: 24500,
                  availability: { status: "IN_STOCK" },
                },
              ],
            },
          },
        ],
      };

      const results = mapper.mapProducts(fixturePayload, "delhi_110001");
      expect(results.length).toBe(1);
      const item = results[0];
      expect(item.platform).toBe("bigbasket");
      expect(item.productId).toBe("bb-404");
      expect(item.price).toBe(245);
      expect(item.availability).toBe("available");

      const validated = PriceObservationSchema.safeParse(item);
      expect(validated.success).toBe(true);
    });

    it("rejects malformed payload missing tabs", () => {
      expect(() => mapper.mapProducts({ invalid: true }, "delhi_110001")).toThrow(
        "Invalid BigBasket payload"
      );
    });
  });
});
