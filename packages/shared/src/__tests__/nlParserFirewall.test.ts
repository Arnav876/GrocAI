import { describe, it, expect } from "vitest";
import {
  ParsedGroceryItemSchema,
  sanitizeExternalAIOutput,
  PROHIBITED_FINANCIAL_KEYS,
  ParsedGroceryItem,
} from "../schemas/nlParser.js";

describe("Phase 4 — AI Price Firewall & Shared NL Contracts", () => {
  it("validates a well-formed parsed grocery item using ParsedGroceryItemSchema", () => {
    const validItem: ParsedGroceryItem = {
      rawSegment: "2 litres Amul Taaza milk",
      queryName: "milk",
      brandPreference: "Amul",
      variantPreference: "Taaza",
      quantity: 2,
      unitSize: "1 L",
      normalizedDimension: "VOLUME",
      allowSubstitutions: false,
    };

    const parsed = ParsedGroceryItemSchema.parse(validItem);
    expect(parsed.queryName).toBe("milk");
    expect(parsed.brandPreference).toBe("Amul");
    expect(parsed.variantPreference).toBe("Taaza");
    expect(parsed.quantity).toBe(2);
    expect(parsed.unitSize).toBe("1 L");
    expect(parsed.normalizedDimension).toBe("VOLUME");
    expect(parsed.allowSubstitutions).toBe(false);
  });

  it("applies schema defaults for quantity (1), normalizedDimension ('UNKNOWN'), and allowSubstitutions (true)", () => {
    const minimal = {
      rawSegment: "apples",
      queryName: "apples",
    };

    const parsed = ParsedGroceryItemSchema.parse(minimal);
    expect(parsed.quantity).toBe(1);
    expect(parsed.normalizedDimension).toBe("UNKNOWN");
    expect(parsed.allowSubstitutions).toBe(true);
    expect(parsed.brandPreference).toBeNull();
    expect(parsed.variantPreference).toBeNull();
    expect(parsed.unitSize).toBeNull();
  });

  it("STRICT AI PRICE FIREWALL: Strips and blocks injected price, pricePaise, cost, fee, mrp, discount, total", () => {
    const llmInjectedPayload = [
      {
        rawSegment: "2 litres milk",
        queryName: "milk",
        brandPreference: "Amul",
        variantPreference: "Taaza",
        quantity: 2,
        unitSize: "1 L",
        normalizedDimension: "VOLUME",
        allowSubstitutions: true,
        // Prohibited financial keys hallucinated/injected by LLM:
        pricePaise: 5400,
        price: 54,
        price_paise: 5400,
        cost: 108,
        fee: 30,
        fees: 25,
        estimatedFee: 30,
        estimated_fee: 30,
        discount: 10,
        mrp: 60,
        total: 138,
        estimate: 150,
        estimatedTotal: 150,
        unitPrice: 54,
        unit_price_paise: 5400,
        subtotal: 108,
      },
    ];

    const sanitized = sanitizeExternalAIOutput(llmInjectedPayload);
    expect(sanitized.length).toBe(1);
    const item = sanitized[0] as Record<string, unknown>;

    // Confirm core non-financial fields are preserved
    expect(item.queryName).toBe("milk");
    expect(item.brandPreference).toBe("Amul");
    expect(item.variantPreference).toBe("Taaza");
    expect(item.quantity).toBe(2);
    expect(item.unitSize).toBe("1 L");

    // CONFIRM EVERY SINGLE PROHIBITED KEY IS STRIPPED
    for (const key of Array.from(PROHIBITED_FINANCIAL_KEYS)) {
      expect(item).not.toHaveProperty(key);
    }
    expect(item).not.toHaveProperty("pricePaise");
    expect(item).not.toHaveProperty("price");
    expect(item).not.toHaveProperty("cost");
    expect(item).not.toHaveProperty("fee");
    expect(item).not.toHaveProperty("fees");
    expect(item).not.toHaveProperty("estimatedFee");
    expect(item).not.toHaveProperty("discount");
    expect(item).not.toHaveProperty("mrp");
    expect(item).not.toHaveProperty("total");
    expect(item).not.toHaveProperty("subtotal");
  });

  it("handles JSON string with markdown code fences and wrapper objects { items: [...] }", () => {
    const jsonStringWithFences = `\`\`\`json
    {
      "items": [
        {
          "rawSegment": "1 dozen eggs",
          "queryName": "eggs",
          "quantity": 1,
          "unitSize": "12 pcs",
          "normalizedDimension": "COUNT",
          "allowSubstitutions": true,
          "pricePaise": 9500
        }
      ]
    }
    \`\`\``;

    const sanitized = sanitizeExternalAIOutput(jsonStringWithFences);
    expect(sanitized.length).toBe(1);
    expect(sanitized[0].queryName).toBe("eggs");
    expect(sanitized[0].unitSize).toBe("12 pcs");
    expect((sanitized[0] as any).pricePaise).toBeUndefined();
  });

  it("throws descriptive error when AI payload is malformed or not an array/object", () => {
    expect(() => sanitizeExternalAIOutput(null)).toThrow(/AI payload is null or empty/);
    expect(() => sanitizeExternalAIOutput("invalid json string")).toThrow(
      /Failed to parse AI JSON response/
    );
    expect(() => sanitizeExternalAIOutput({ unknownField: 123 })).toThrow(
      /Invalid AI payload: expected an array or an object containing an 'items' array/
    );
    expect(() => sanitizeExternalAIOutput([null])).toThrow(
      /Invalid item format in AI payload: expected an object/
    );
  });
});

