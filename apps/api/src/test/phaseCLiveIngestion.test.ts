import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import {
  parseBigBasketSearchPayload,
  parseInstamartSearchPayload,
  parseBlinkitSearchPayload,
  parseZeptoSearchPayload,
} from "../ingestion/payloadNormalizers.js";
import { BigBasketScraper, searchBigBasketLive } from "../ingestion/platforms/bigbasket.js";
import { InstamartScraper, searchInstamartLive } from "../ingestion/platforms/instamart.js";
import { BigBasketAdapter } from "../connectors/adapters/bigbasketAdapter.js";
import { InstamartAdapter } from "../connectors/adapters/instamartAdapter.js";
import { assertIntegerPaise } from "@groqai/shared";

const prisma = new PrismaClient();
const app = createServer(prisma);

describe("Phase C: BigBasket Akamai Warm-Up, Swiggy Instamart Hybrid & HAR/JSON Payload Importer", () => {
  const createdObservationIds: string[] = [];

  afterAll(async () => {
    if (createdObservationIds.length > 0) {
      await prisma.priceObservation.deleteMany({
        where: { id: { in: createdObservationIds } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // =========================================================================
  // DELIVERABLE 1: BigBasket Akamai Warm-Up & Payload Normalizer
  // =========================================================================
  describe("Deliverable 1: BigBasket Ingestion & Normalizer", () => {
    it("normalizes listing-svc/v2/products JSON payload accurately", () => {
      const listingSvcPayload = {
        tabs: [
          {
            product_info: {
              products: [
                {
                  id: "100001",
                  desc: "Amul Taaza Toned Fresh Milk",
                  brand: { name: "Amul" },
                  w: "1 L",
                  pricing: {
                    discount: {
                      prim_price: { sp: "54.00" },
                      mrp: "56.00",
                    },
                  },
                  availability: { not_for_sale: false },
                  images: [{ s: "https://www.bigbasket.com/media/uploads/p/s/100001_amul.jpg" }],
                  absolute_url: "/pd/100001/amul-taaza-toned-fresh-milk-1-l/",
                },
              ],
            },
          },
        ],
      };

      const obs = parseBigBasketSearchPayload(listingSvcPayload, "560064");
      expect(obs.length).toBe(1);
      const item = obs[0];
      expect(item.name).toBe("Amul Taaza Toned Fresh Milk");
      expect(item.brand).toBe("Amul");
      expect(item.quantity).toBe("1 L");
      expect(item.pricePaise).toBe(5400);
      assertIntegerPaise(item.pricePaise);
      expect(item.originalPricePaise).toBe(5600);
      assertIntegerPaise(item.originalPricePaise);
      expect(item.discountPercentage).toBe(4);
      expect(item.availabilityStatus).toBe("IN_STOCK");
      expect(item.platformId).toBe("bigbasket");
      expect(item.pincode).toBe("560064");
      expect(item.dataSource).toBe("headed_worker");
      expect(item.verificationStatus).toBe("VERIFIED");
      expect(item.productUrl).toBe("https://www.bigbasket.com/pd/100001/amul-taaza-toned-fresh-milk-1-l/");
      expect(item.normalizedUnitPricePaise).toBe(5400); // 5400 paise per L
    });

    it("normalizes Next.js SSR __NEXT_DATA__ payload", () => {
      const nextDataPayload = {
        props: {
          pageProps: {
            tabs: [
              {
                product_info: {
                  products: [
                    {
                      id: "100002",
                      desc: "Nandini Pasteurized Toned Milk",
                      brand: { name: "Nandini" },
                      w: "500 ml",
                      pricing: {
                        discount: {
                          prim_price: { sp: "24" },
                          mrp: "24",
                        },
                      },
                      availability: { not_for_sale: false },
                      images: [{ s: "https://www.bigbasket.com/media/uploads/p/s/100002.jpg" }],
                    },
                  ],
                },
              },
            ],
          },
        },
      };

      const obs = parseBigBasketSearchPayload(nextDataPayload, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].name).toBe("Nandini Pasteurized Toned Milk");
      expect(obs[0].pricePaise).toBe(2400);
      expect(obs[0].originalPricePaise).toBe(2400);
      expect(obs[0].discountPercentage).toBe(0);
      expect(obs[0].normalizedUnitPricePaise).toBe(4800); // 2400 paise per 500ml = 4800 per L
    });

    it("extracts and parses SSR HTML string containing <script id=\"__NEXT_DATA__\">", () => {
      const htmlString = `
        <!DOCTYPE html>
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              {
                "props": {
                  "pageProps": {
                    "products": [
                      {
                        "id": "100003",
                        "desc": "Fortune Sunlite Refined Sunflower Oil",
                        "brand": { "name": "Fortune" },
                        "w": "1 L",
                        "pricing": {
                          "discount": {
                            "prim_price": { "sp": "145.50" },
                            "mrp": "170"
                          }
                        },
                        "availability": { "not_for_sale": false }
                      }
                    ]
                  }
                }
              }
            </script>
          </head>
          <body><div>SSR Content</div></body>
        </html>
      `;

      const obs = parseBigBasketSearchPayload(htmlString, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].name).toBe("Fortune Sunlite Refined Sunflower Oil");
      expect(obs[0].pricePaise).toBe(14550);
      assertIntegerPaise(obs[0].pricePaise);
      expect(obs[0].originalPricePaise).toBe(17000);
    });

    it("flags anomaly if originalPricePaise is less than pricePaise", () => {
      const anomalyPayload = {
        tabs: [
          {
            product_info: {
              products: [
                {
                  id: "100004",
                  desc: "Anomalous Product",
                  pricing: {
                    discount: {
                      prim_price: { sp: "100" },
                      mrp: "80", // MRP lower than selling price
                    },
                  },
                },
              ],
            },
          },
        ],
      };

      const obs = parseBigBasketSearchPayload(anomalyPayload, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].pricePaise).toBe(10000);
      expect(obs[0].originalPricePaise).toBe(10000); // Normalized to pricePaise
      expect(obs[0].verificationStatus).toBe("FLAGGED_ANOMALY");
    });

    it("throws on invalid Indian pincode", () => {
      expect(() => parseBigBasketSearchPayload({}, "012345")).toThrow("Invalid pincode");
      expect(() => parseBigBasketSearchPayload({}, "invalid")).toThrow("Invalid pincode");
    });

    it("BigBasketScraper.searchLive degrades gracefully without unhandled exceptions", async () => {
      const scraper = new BigBasketScraper();
      // In CI/test environment without real browser connection, searchLive should return []
      const results = await scraper.searchLive("milk", "560064");
      expect(Array.isArray(results)).toBe(true);
    });

    it("BigBasketAdapter handles live mode with graceful fallback to standard hierarchy", async () => {
      const adapter = new BigBasketAdapter(prisma);
      // Even in live mode, if scraper returns [], it falls back cleanly to super.searchProducts
      adapter.setMode("live");
      const results = await adapter.searchProducts("milk", "bengaluru_560064");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // =========================================================================
  // DELIVERABLE 2: Swiggy Instamart Hybrid & Normalizer
  // =========================================================================
  describe("Deliverable 2: Swiggy Instamart Ingestion & Normalizer", () => {
    it("normalizes /api/instamart/search JSON with { units, nanos } price format", () => {
      const instamartPayload = {
        data: {
          cards: [
            {
              card: {
                card: {
                  gridElements: {
                    infoWithStyle: {
                      items: [
                        {
                          productId: "swiggy_milk_1",
                          displayName: "Nandini Toned Fresh Milk",
                          brand: "Nandini",
                          variations: [
                            {
                              id: "var_1",
                              displayName: "Nandini Toned Fresh Milk 500ml",
                              formattedPacksize: "500 ml",
                              price: {
                                offerPrice: { units: "24", nanos: 0 },
                                mrp: { units: "24", nanos: 0 },
                              },
                              inventory: { inStock: true },
                              images: ["nandini_toned.png"],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      };

      const obs = parseInstamartSearchPayload(instamartPayload, "560064");
      expect(obs.length).toBe(1);
      const item = obs[0];
      expect(item.name).toBe("Nandini Toned Fresh Milk 500ml");
      expect(item.brand).toBe("Nandini");
      expect(item.quantity).toBe("500 ml");
      expect(item.pricePaise).toBe(2400);
      assertIntegerPaise(item.pricePaise);
      expect(item.originalPricePaise).toBe(2400);
      expect(item.discountPercentage).toBe(0);
      expect(item.availabilityStatus).toBe("IN_STOCK");
      expect(item.platformId).toBe("instamart");
      expect(item.pincode).toBe("560064");
      expect(item.dataSource).toBe("headed_worker");
      expect(item.verificationStatus).toBe("VERIFIED");
      expect(item.productUrl).toBe("https://www.swiggy.com/instamart/item/var_1");
      expect(item.imageUrl).toContain("swiggy/image/upload");
    });

    it("normalizes Instamart payload with numeric float rupee or integer paise prices", () => {
      const numericPricePayload = {
        items: [
          {
            id: "swiggy_atta_1",
            name: "Aashirvaad Shudh Chakki Atta",
            brand: "Aashirvaad",
            quantityDescription: "5 kg",
            price: {
              offerPrice: 245, // ₹245.00
              mrp: 275,       // ₹275.00
            },
            inStock: true,
          },
        ],
      };

      const obs = parseInstamartSearchPayload(numericPricePayload, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].name).toBe("Aashirvaad Shudh Chakki Atta");
      expect(obs[0].pricePaise).toBe(24500);
      assertIntegerPaise(obs[0].pricePaise);
      expect(obs[0].originalPricePaise).toBe(27500);
      expect(obs[0].discountPercentage).toBe(11);
    });

    it("extracts and parses SSR HTML string containing window.___INITIAL_STATE___", () => {
      const ssrHtml = `
        <html>
          <body>
            <script>
              window.___INITIAL_STATE___ = {
                "items": [
                  {
                    "id": "swiggy_oil_1",
                    "name": "Fortune Premium Kachi Ghani Mustard Oil",
                    "brand": "Fortune",
                    "quantityDescription": "1 L",
                    "price": { "offerPrice": 155, "mrp": 180 },
                    "inStock": true
                  }
                ]
              };
            </script>
          </body>
        </html>
      `;

      const obs = parseInstamartSearchPayload(ssrHtml, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].name).toBe("Fortune Premium Kachi Ghani Mustard Oil");
      expect(obs[0].pricePaise).toBe(15500);
      expect(obs[0].originalPricePaise).toBe(18000);
      expect(obs[0].discountPercentage).toBe(14);
    });

    it("flags anomaly when Swiggy mrp is lower than offerPrice", () => {
      const anomalyPayload = {
        items: [
          {
            id: "swiggy_anom_1",
            name: "Anomalous Tea",
            quantityDescription: "500 g",
            price: {
              offerPrice: 200,
              mrp: 150,
            },
            inStock: true,
          },
        ],
      };

      const obs = parseInstamartSearchPayload(anomalyPayload, "560064");
      expect(obs.length).toBe(1);
      expect(obs[0].pricePaise).toBe(20000);
      expect(obs[0].originalPricePaise).toBe(20000);
      expect(obs[0].verificationStatus).toBe("FLAGGED_ANOMALY");
    });

    it("throws on invalid Indian pincode for Instamart", () => {
      expect(() => parseInstamartSearchPayload({}, "012345")).toThrow("Invalid pincode");
      expect(() => parseInstamartSearchPayload({}, "1234")).toThrow("Invalid pincode");
    });

    it("InstamartScraper.searchLive degrades gracefully without throwing", async () => {
      const scraper = new InstamartScraper();
      const results = await scraper.searchLive("milk", "560064");
      expect(Array.isArray(results)).toBe(true);
    });

    it("InstamartAdapter handles live mode with graceful fallback", async () => {
      const adapter = new InstamartAdapter(prisma);
      adapter.setMode("live");
      const results = await adapter.searchProducts("milk", "bengaluru_560064");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // =========================================================================
  // DELIVERABLE 3: DevTools HAR / JSON Payload Importer (POST /api/observations/import-payload)
  // =========================================================================
  describe("Deliverable 3: POST /api/observations/import-payload", () => {
    it("successfully imports direct JSON payload for BigBasket and persists to database", async () => {
      const directPayload = {
        tabs: [
          {
            product_info: {
              products: [
                {
                  id: "bb_import_101",
                  desc: "Amul Gold Whole Fresh Milk",
                  brand: { name: "Amul" },
                  w: "1 L",
                  pricing: {
                    discount: {
                      prim_price: { sp: "66" },
                      mrp: "68",
                    },
                  },
                  availability: { not_for_sale: false },
                },
              ],
            },
          },
        ],
      };

      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "bigbasket",
          pincode: "560064",
          rawPayload: directPayload,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.platformId).toBe("bigbasket");
      expect(res.body.pincode).toBe("560064");
      expect(res.body.locationKey).toBe("bengaluru_560064");
      expect(res.body.importedCount).toBe(1);
      expect(res.body.observations.length).toBe(1);

      const saved = res.body.observations[0];
      expect(saved.id).toBeDefined();
      createdObservationIds.push(saved.id);
      expect(saved.pricePaise).toBe(6600);
      assertIntegerPaise(saved.pricePaise);
      expect(saved.originalPricePaise).toBe(6800);
      expect(saved.platform).toBe("bigbasket");
      expect(saved.locationKey).toBe("bengaluru_560064");

      // Verify directly from Prisma DB
      const dbObs = await prisma.priceObservation.findUnique({
        where: { id: saved.id },
      });
      expect(dbObs).not.toBeNull();
      expect(dbObs?.pricePaise).toBe(6600);
      expect(dbObs?.currency).toBe("INR");
      expect(dbObs?.sourceType).toBe("manual");
    });

    it("successfully imports direct JSON payload for Instamart", async () => {
      const instamartPayload = {
        items: [
          {
            id: "im_import_201",
            name: "Amul Butter - Pasteurized",
            brand: "Amul",
            quantityDescription: "500 g",
            price: { offerPrice: 275, mrp: 285 },
            inStock: true,
          },
        ],
      };

      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "instamart",
          pincode: "560064",
          rawPayload: instamartPayload,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.platformId).toBe("instamart");
      expect(res.body.importedCount).toBe(1);

      const obs = res.body.observations[0];
      expect(obs.id).toBeDefined();
      createdObservationIds.push(obs.id);
      expect(obs.pricePaise).toBe(27500);
      assertIntegerPaise(obs.pricePaise);
      expect(obs.originalPricePaise).toBe(28500);
    });

    it("successfully imports full HAR export log matching search URL", async () => {
      const harArchive = {
        log: {
          version: "1.2",
          entries: [
            {
              request: {
                method: "GET",
                url: "https://www.bigbasket.com/static/js/bundle.js",
              },
              response: {
                status: 200,
                content: {
                  mimeType: "application/javascript",
                  text: "console.log('irrelevant');",
                },
              },
            },
            {
              request: {
                method: "GET",
                url: "https://www.bigbasket.com/listing-svc/v2/products?query=butter",
              },
              response: {
                status: 200,
                content: {
                  mimeType: "application/json",
                  text: JSON.stringify({
                    tabs: [
                      {
                        product_info: {
                          products: [
                            {
                              id: "bb_har_301",
                              desc: "Amul Delicious Salted Table Butter",
                              brand: { name: "Amul" },
                              w: "100 g",
                              pricing: {
                                discount: {
                                  prim_price: { sp: "58" },
                                  mrp: "60",
                                },
                              },
                              availability: { not_for_sale: false },
                            },
                          ],
                        },
                      },
                    ],
                  }),
                },
              },
            },
          ],
        },
      };

      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "bigbasket",
          pincode: "560064",
          rawPayload: harArchive,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.importedCount).toBe(1);

      const obs = res.body.observations[0];
      expect(obs.id).toBeDefined();
      createdObservationIds.push(obs.id);
      expect(obs.name).toContain("Butter");
      expect(obs.pricePaise).toBe(5800);
      assertIntegerPaise(obs.pricePaise);
    });

    it("rejects invalid platformId with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "dunzo", // Unsupported
          pincode: "560064",
          rawPayload: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid platformId");
    });

    it("rejects invalid pincode with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "blinkit",
          pincode: "999", // Invalid pincode
          rawPayload: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid pincode");
    });

    it("rejects missing rawPayload with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/observations/import-payload")
        .send({
          platformId: "blinkit",
          pincode: "560064",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("rawPayload is required");
    });
  });
});
