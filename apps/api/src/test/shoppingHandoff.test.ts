import { describe, it, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import {
  ShoppingHandoffService,
  buildPlatformSearchDeepLink,
  StoreCartHandoffInput,
} from "../services/shoppingHandoffService.js";
import { NullCartAdapter } from "@groqai/shared";

describe("Phase 3 — Platform Shopping Handoff Engine", () => {
  const prisma = new PrismaClient();
  const app = createServer(prisma);

  describe("Merchant Search Deep-Link Generator (buildPlatformSearchDeepLink)", () => {
    it("generates deterministic URL-encoded official search links for all 4 platforms", () => {
      const query = "Amul Taaza Toned Milk (500 ml)";
      const encoded = encodeURIComponent(query);

      // Blinkit
      const blinkitUrl = buildPlatformSearchDeepLink("blinkit", query);
      expect(blinkitUrl).toBe(`https://blinkit.com/s/?q=${encoded}`);

      // Zepto
      const zeptoUrl = buildPlatformSearchDeepLink("zepto", query);
      expect(zeptoUrl).toBe(`https://www.zeptonow.com/search?query=${encoded}`);

      // Swiggy Instamart
      const instamartUrl = buildPlatformSearchDeepLink("instamart", query);
      expect(instamartUrl).toBe(
        `https://www.swiggy.com/instamart/search?custom_back=true&query=${encoded}`
      );

      // BigBasket
      const bigbasketUrl = buildPlatformSearchDeepLink("bigbasket", query);
      expect(bigbasketUrl).toBe(`https://www.bigbasket.com/ps/?q=${encoded}`);
    });

    it("properly encodes queries with ampersands, slashes, plus signs, and quotes", () => {
      const complexQuery = 'Fortune Sunlite 1L & Aashirvaad 5kg / 100% "Pure"';
      const encoded = encodeURIComponent(complexQuery.trim());

      expect(buildPlatformSearchDeepLink("blinkit", complexQuery)).toBe(
        `https://blinkit.com/s/?q=${encoded}`
      );
      expect(buildPlatformSearchDeepLink("zepto", complexQuery)).toBe(
        `https://www.zeptonow.com/search?query=${encoded}`
      );
      expect(buildPlatformSearchDeepLink("instamart", complexQuery)).toBe(
        `https://www.swiggy.com/instamart/search?custom_back=true&query=${encoded}`
      );
      expect(buildPlatformSearchDeepLink("bigbasket", complexQuery)).toBe(
        `https://www.bigbasket.com/ps/?q=${encoded}`
      );
    });
  });

  describe("Copyable Markdown Shopping Checklist Generator", () => {
    const sampleCarts: StoreCartHandoffInput[] = [
      {
        platformId: "blinkit",
        platformName: "Blinkit",
        subtotalPaise: 5400, // ₹54.00
        deliveryFeePaise: 2500, // ₹25.00
        handlingFeeMinPaise: 400, // ₹4.00
        handlingFeeMaxPaise: 400,
        platformFeePaise: 200, // ₹2.00
        smallCartFeePaise: 2000, // ₹20.00
        hasUnknownFees: false,
        amountToFreeDeliveryPaise: 44500, // ₹445.00 to free delivery
        items: [
          {
            title: "Amul Taaza Toned Milk (500 ml)",
            quantity: 2,
            unitPricePaise: 2700,
            totalPricePaise: 5400,
          },
        ],
      },
      {
        platformId: "bigbasket",
        platformName: "BigBasket",
        subtotalPaise: 30000, // ₹300.00
        deliveryFeePaise: 3000, // ₹30.00
        handlingFeeMinPaise: 500, // ₹5.00
        handlingFeeMaxPaise: 1500, // ₹15.00 (Unknown dynamic range!)
        platformFeePaise: 0,
        smallCartFeePaise: 0,
        hasUnknownFees: true,
        amountToFreeDeliveryPaise: 20000, // ₹200.00 to free delivery
        items: [
          {
            title: "Aashirvaad Whole Wheat Atta 5kg",
            quantity: 1,
            unitPricePaise: 30000,
            totalPricePaise: 30000,
          },
        ],
      },
    ];

    it("renders store headers, interactive markdown checkboxes, formatted rupees, and cliff tips", () => {
      const markdown = ShoppingHandoffService.generateMarkdownChecklist(sampleCarts, {
        strategyName: "Smart Split (2 Stores)",
        pincode: "110001",
      });

      // Headers & Pincode
      expect(markdown).toContain("# 🛒 GrocAI Shopping Checklist — Smart Split (2 Stores)");
      expect(markdown).toContain("> **Delivery Pincode:** 110001");
      expect(markdown).toContain("### 🛒 Blinkit Cart (1 item)");
      expect(markdown).toContain("### 🛒 BigBasket Cart (1 item)");

      // Interactive Checkboxes with formatted rupees and merchant search links
      expect(markdown).toContain(
        "- [ ] 2x Amul Taaza Toned Milk (500 ml) — ₹54.00 [Search on Blinkit](https://blinkit.com/s/?q=Amul%20Taaza%20Toned%20Milk%20(500%20ml))"
      );
      expect(markdown).toContain(
        "- [ ] 1x Aashirvaad Whole Wheat Atta 5kg — ₹300.00 [Search on BigBasket](https://www.bigbasket.com/ps/?q=Aashirvaad%20Whole%20Wheat%20Atta%205kg)"
      );

      // Fee Breakdown
      expect(markdown).toContain("- **Subtotal:** ₹54.00");
      expect(markdown).toContain("- **Delivery Fee:** ₹25.00");
      expect(markdown).toContain("- **Handling Fee:** ₹4.00");
      expect(markdown).toContain("- **Small Cart Fee:** ₹20.00");

      // Free Delivery Tip
      expect(markdown).toContain(
        "💡 **Free Delivery Tip:** Add ₹445.00 more to qualify for FREE delivery on Blinkit"
      );
      expect(markdown).toContain(
        "💡 **Free Delivery Tip:** Add ₹200.00 more to qualify for FREE delivery on BigBasket"
      );

      // Dynamic unknown fee badge for BigBasket
      expect(markdown).toContain(
        "⚠️ **Dynamic Fee Range:** ₹5.00 – ₹15.00 (Final fee determined at merchant checkout based on surge/slot availability)"
      );

      // Grand Total Summary
      expect(markdown).toContain("## 🧾 Grand Total Summary");
      expect(markdown).toContain("- **Basket Subtotal:** ₹354.00");
      expect(markdown).toContain("- **Cumulative Delivery & Handling Fees:** ₹86.00 – ₹96.00");
      expect(markdown).toContain("- **Estimated Grand Total:** ₹440.00 – ₹450.00");
      expect(markdown).toContain("Honest Handoff: GrocAI does not perform automated checkout");
    });
  });

  describe("NullCartAdapter Invariant & Payload Generation", () => {
    it("attaches NullCartAdapter capabilities with zero automated checkout claim", () => {
      const nullAdapter = new NullCartAdapter("blinkit");
      expect(nullAdapter.supportsCartCreation()).toBe(false);
      expect(() => nullAdapter.createCart()).toThrow(/does not support automated cart creation/);

      const payload = ShoppingHandoffService.generateHandoffPayload({
        strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
        strategyName: "Smart Split (Blinkit + Zepto)",
        pincode: "110001",
        storeCarts: [
          {
            platformId: "blinkit",
            subtotalPaise: 10000,
            deliveryFeePaise: 2500,
            handlingFeeMinPaise: 400,
            handlingFeeMaxPaise: 400,
            platformFeePaise: 200,
            items: [
              {
                title: "Eggs 6 pcs",
                quantity: 2,
                unitPricePaise: 5000,
                totalPricePaise: 10000,
              },
            ],
          },
        ],
      });

      // Strict capability assertion
      expect(payload.capabilities).toEqual({
        createCart: false,
        automatedCheckout: false,
        searchDeepLink: true,
        checklistHandoff: true,
      });

      expect(payload.method).toBe("links_and_checklist");
      expect(payload.notice).toContain("Payment happens on the platform");
      expect(payload.markdownChecklist).toContain("GrocAI Shopping Checklist");

      // Integer paise total integrity
      expect(payload.grandTotalPaise.subtotalPaise).toBe(10000);
      expect(payload.grandTotalPaise.feeMinPaise).toBe(3100);
      expect(payload.grandTotalPaise.estimatedTotalMinPaise).toBe(13100);
      expect(payload.grandTotalRupees.subtotal).toBe("₹100.00");
      expect(payload.grandTotalRupees.estimatedTotalMin).toBe("₹131.00");

      // Platform group details
      const group = payload.platforms[0];
      expect(group.platform).toBe("blinkit");
      expect(group.items[0].isDeepLink).toBe(false); // Honest deep-link flag
      expect(group.items[0].searchUrl).toContain("https://blinkit.com/s/?q=");
      expect(group.checklistText).toContain("🛒 Blinkit Shopping List");
    });
  });

  describe("API Endpoints Integration (/api/basket/handoff and /api/shopping-handoff)", () => {
    it("POST /api/basket/handoff returns 200 with capabilities and copyable checklist", async () => {
      const res = await request(app)
        .post("/api/basket/handoff")
        .send({
          strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
          strategyName: "Smart Split (Zepto + BigBasket)",
          pincode: "110001",
          storeCarts: [
            {
              platformId: "zepto",
              subtotalPaise: 25000,
              deliveryFeePaise: 2500,
              handlingFeeMinPaise: 500,
              handlingFeeMaxPaise: 500,
              platformFeePaise: 300,
              items: [
                {
                  title: "Sunflower Oil 1L",
                  quantity: 1,
                  unitPricePaise: 25000,
                  totalPricePaise: 25000,
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.capabilities.createCart).toBe(false);
      expect(res.body.capabilities.automatedCheckout).toBe(false);
      expect(res.body.capabilities.searchDeepLink).toBe(true);
      expect(res.body.capabilities.checklistHandoff).toBe(true);
      expect(res.body.markdownChecklist).toContain("Sunflower Oil 1L");
      expect(res.body.grandTotalRupees.subtotal).toBe("₹250.00");
    });
  });
});
