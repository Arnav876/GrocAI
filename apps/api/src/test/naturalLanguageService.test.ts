import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createServer } from "../server.js";
import {
  DeterministicNLParser,
  ExternalAIProviderParser,
  createNLParser,
} from "../services/naturalLanguageService.js";
import { AIProviderType } from "@groqai/shared";

describe("Phase 4 — Hybrid Natural Language Service & AI Price Firewall", () => {
  const prisma = new PrismaClient();
  const app = createServer(prisma);
  const deterministicParser = new DeterministicNLParser();

  describe("DeterministicNLParser (Complex Notes & Indian Quick-Commerce Idioms)", () => {
    it("parses complex multi-item strings separated by commas, newlines, and conjunctions", async () => {
      const rawText =
        "2 litres milk, 12 eggs, 5 kg rice, 1 packet bread and 500g butter";
      const result = await deterministicParser.parseGroceryList(rawText);

      expect(result.items.length).toBe(5);
      expect(result.providerUsed).toBe("deterministic");

      // Item 1: 2 litres milk
      expect(result.items[0].queryName).toBe("milk");
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].unitSize).toBe("1 L");
      expect(result.items[0].normalizedDimension).toBe("VOLUME");

      // Item 2: 12 eggs
      expect(result.items[1].queryName).toBe("eggs");
      expect(result.items[1].quantity).toBe(12);
      expect(result.items[1].normalizedDimension).toBe("COUNT");

      // Item 3: 5 kg rice
      expect(result.items[2].queryName).toBe("rice");
      expect(result.items[2].quantity).toBe(1);
      expect(result.items[2].unitSize).toBe("5 kg");
      expect(result.items[2].normalizedDimension).toBe("WEIGHT");

      // Item 4: 1 packet bread
      expect(result.items[3].queryName).toBe("bread");
      expect(result.items[3].quantity).toBe(1);
      expect(result.items[3].unitSize).toBe("1 pack");
      expect(result.items[3].normalizedDimension).toBe("COUNT");

      // Item 5: 500g butter
      expect(result.items[4].queryName).toBe("butter");
      expect(result.items[4].quantity).toBe(1);
      expect(result.items[4].unitSize).toBe("500 g");
      expect(result.items[4].normalizedDimension).toBe("WEIGHT");
    });

    it("handles dozen conversions: 1 dozen -> 12 pcs, half dozen -> 6 pcs, 2 dozen -> 24 pcs", async () => {
      // 1 dozen eggs
      const res1 = await deterministicParser.parseGroceryList("1 dozen farm eggs");
      expect(res1.items[0].quantity).toBe(1);
      expect(res1.items[0].unitSize).toBe("12 pcs");
      expect(res1.items[0].normalizedDimension).toBe("COUNT");
      expect(res1.items[0].queryName).toContain("eggs");

      // half dozen eggs
      const res2 = await deterministicParser.parseGroceryList("half dozen brown eggs");
      expect(res2.items[0].quantity).toBe(1);
      expect(res2.items[0].unitSize).toBe("6 pcs");
      expect(res2.items[0].normalizedDimension).toBe("COUNT");
      expect(res2.items[0].queryName).toContain("eggs");

      // 2 dozen eggs
      const res3 = await deterministicParser.parseGroceryList("2 dozen eggs");
      expect(res3.items[0].quantity).toBe(2);
      expect(res3.items[0].unitSize).toBe("24 pcs");
      expect(res3.items[0].normalizedDimension).toBe("COUNT");
    });

    it("handles unit conversions (gm -> g, ltr/litres -> L, ml) and multipacks (2 packets of 500 ml)", async () => {
      // Multipack volume: 2 packets of 500 ml milk
      const res1 = await deterministicParser.parseGroceryList("2 packets of 500 ml milk");
      expect(res1.items[0].quantity).toBe(2);
      expect(res1.items[0].unitSize).toBe("500 ml");
      expect(res1.items[0].normalizedDimension).toBe("VOLUME");
      expect(res1.items[0].queryName).toBe("milk");

      // 2 x 500ml milk
      const res2 = await deterministicParser.parseGroceryList("2 x 500ml milk");
      expect(res2.items[0].quantity).toBe(2);
      expect(res2.items[0].unitSize).toBe("500 ml");
      expect(res2.items[0].normalizedDimension).toBe("VOLUME");

      // 500 gm butter -> 500 g
      const res3 = await deterministicParser.parseGroceryList("500 gm butter");
      expect(res3.items[0].quantity).toBe(1);
      expect(res3.items[0].unitSize).toBe("500 g");
      expect(res3.items[0].normalizedDimension).toBe("WEIGHT");

      // 1 ltr oil -> 1 L
      const res4 = await deterministicParser.parseGroceryList("1 ltr sunflower oil");
      expect(res4.items[0].quantity).toBe(1);
      expect(res4.items[0].unitSize).toBe("1 L");
      expect(res4.items[0].normalizedDimension).toBe("VOLUME");
    });

    it("extracts staple brands and variants accurately", async () => {
      const text =
        "5 kg Aashirvaad Sharbati atta, 2 litres Amul Taaza milk, 1 packet Britannia Whole Wheat bread";
      const result = await deterministicParser.parseGroceryList(text);

      expect(result.items.length).toBe(3);

      // Aashirvaad Sharbati atta
      expect(result.items[0].brandPreference).toBe("Aashirvaad");
      expect(result.items[0].variantPreference).toBe("Sharbati");
      expect(result.items[0].queryName).toBe("atta");
      expect(result.items[0].unitSize).toBe("5 kg");

      // Amul Taaza milk
      expect(result.items[1].brandPreference).toBe("Amul");
      expect(result.items[1].variantPreference).toBe("Taaza");
      expect(result.items[1].queryName).toBe("milk");
      expect(result.items[1].unitSize).toBe("1 L");

      // Britannia Whole Wheat bread
      expect(result.items[2].brandPreference).toBe("Britannia");
      expect(result.items[2].variantPreference).toBe("Whole Wheat");
      expect(result.items[2].queryName).toBe("bread");
      expect(result.items[2].unitSize).toBe("1 pack");
    });

    it("detects substitution modifiers: 'only'/'no substitute' -> false, 'any brand' -> true", async () => {
      // Strict: no substitute
      const res1 = await deterministicParser.parseGroceryList(
        "500g Amul butter (no substitute)"
      );
      expect(res1.items[0].allowSubstitutions).toBe(false);
      expect(res1.items[0].brandPreference).toBe("Amul");
      expect(res1.items[0].queryName).toBe("butter");

      // Strict: strictly / only
      const res2 = await deterministicParser.parseGroceryList(
        "Amul milk only, strictly Harvest Gold bread"
      );
      expect(res2.items[0].allowSubstitutions).toBe(false);
      expect(res2.items[1].allowSubstitutions).toBe(false);

      // Permissive: any brand
      const res3 = await deterministicParser.parseGroceryList(
        "sugar 1 kg (any brand)"
      );
      expect(res3.items[0].allowSubstitutions).toBe(true);
    });

    it("supports backward-compatible parseText method", async () => {
      const items = await deterministicParser.parseText("2 litres milk, 500g butter");
      expect(items.length).toBe(2);
      expect(items[0].query).toBe("milk");
      expect(items[0].quantity).toBe(2);
      expect(items[0].unit).toBe("1 L");
      expect(items[1].query).toBe("butter");
      expect(items[1].unit).toBe("500 g");
    });
  });

  describe("ExternalAIProviderParser (Pluggable Provider, Price Firewall & Fallback)", () => {
    const originalEnv = process.env.AI_PROVIDER;

    afterEach(() => {
      process.env.AI_PROVIDER = originalEnv;
    });

    it("uses deterministic parser when AI_PROVIDER is 'none' (the default)", async () => {
      process.env.AI_PROVIDER = "none";
      const parser = new ExternalAIProviderParser();
      const result = await parser.parseGroceryList("2 litres milk, 12 eggs");

      expect(result.providerUsed).toBe("deterministic");
      expect(result.items.length).toBe(2);
      expect(result.items[0].queryName).toBe("milk");
    });

    it("passes external LLM response through the hard AI Price Firewall, stripping injected prices", async () => {
      // Mock LLM client caller that hallucinates prices and fees
      const mockLLMCaller = async (_provider: AIProviderType, _prompt: string) => {
        return JSON.stringify([
          {
            rawSegment: "2 litres Amul Taaza milk",
            queryName: "milk",
            brandPreference: "Amul",
            variantPreference: "Taaza",
            quantity: 2,
            unitSize: "1 L",
            normalizedDimension: "VOLUME",
            allowSubstitutions: true,
            // Hallucinated prices:
            pricePaise: 5400,
            price: 54,
            estimatedFee: 25,
            mrp: 60,
            cost: 108,
            total: 133,
          },
        ]);
      };

      const parser = new ExternalAIProviderParser(
        new DeterministicNLParser(),
        mockLLMCaller
      );

      const result = await parser.parseGroceryList("2 litres Amul Taaza milk", {
        providerOverride: "groq",
      });

      expect(result.providerUsed).toBe("groq");
      expect(result.items.length).toBe(1);

      const item = result.items[0] as any;
      expect(item.queryName).toBe("milk");
      expect(item.brandPreference).toBe("Amul");
      expect(item.variantPreference).toBe("Taaza");
      expect(item.quantity).toBe(2);

      // Price firewall verified: all price fields stripped
      expect(item.pricePaise).toBeUndefined();
      expect(item.price).toBeUndefined();
      expect(item.estimatedFee).toBeUndefined();
      expect(item.mrp).toBeUndefined();
      expect(item.cost).toBeUndefined();
      expect(item.total).toBeUndefined();
    });

    it("automatically falls back to DeterministicNLParser when provider throws or fails", async () => {
      const failingCaller = async (_provider: AIProviderType, _prompt: string) => {
        throw new Error("Provider rate limit reached (429)");
      };

      const parser = new ExternalAIProviderParser(
        new DeterministicNLParser(),
        failingCaller
      );

      const result = await parser.parseGroceryList("2 litres milk, 12 eggs", {
        providerOverride: "openai",
      });

      // Transparent fallback guarantee
      expect(result.providerUsed).toBe("deterministic_fallback");
      expect(result.warnings?.some((w) => w.includes("Provider 'openai' failed"))).toBe(true);
      expect(result.items.length).toBe(2);
      expect(result.items[0].queryName).toBe("milk");
    });

    it("automatically falls back to DeterministicNLParser when provider returns malformed JSON", async () => {
      const malformedCaller = async (_provider: AIProviderType, _prompt: string) => {
        return "Not valid JSON response from provider";
      };

      const parser = new ExternalAIProviderParser(
        new DeterministicNLParser(),
        malformedCaller
      );

      const result = await parser.parseGroceryList("5 kg atta", {
        providerOverride: "gemini",
      });

      expect(result.providerUsed).toBe("deterministic_fallback");
      expect(result.items.length).toBe(1);
      expect(result.items[0].queryName).toBe("atta");
      expect(result.items[0].unitSize).toBe("5 kg");
    });
  });

  describe("API Endpoint Integration (POST /api/nl/parse)", () => {
    it("POST /api/nl/parse returns parsed structured grocery items", async () => {
      const res = await request(app)
        .post("/api/nl/parse")
        .send({
          text: "2 litres Amul Taaza milk, 1 dozen eggs",
        });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(2);
      expect(res.body.items[0].queryName).toBe("milk");
      expect(res.body.items[0].brandPreference).toBe("Amul");
      expect(res.body.items[1].queryName).toContain("eggs");
      expect(res.body.providerUsed).toBe("deterministic");
    });

    it("POST /api/nl/parse returns 400 when text is empty", async () => {
      const res = await request(app).post("/api/nl/parse").send({ text: "" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("cannot be empty");
    });

    it("POST /api/nl/parse chains directly into optimizationService when optimize: true and pincode is provided", async () => {
      const res = await request(app)
        .post("/api/nl/parse")
        .send({
          text: "2 litres Amul Taaza milk",
          pincode: "110001",
          optimize: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.optimization).toBeDefined();
      expect(res.body.optimization.pincode).toBe("110001");
      expect(res.body.optimization.strategies).toBeDefined();
      expect(res.body.optimization.recommendation).toBeDefined();
    });
  });
});

