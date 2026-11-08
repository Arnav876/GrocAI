import { describe, it, expect } from "vitest";
import {
  DeterministicGroceryListParser,
  defaultNLParser,
} from "../services/naturalLanguageParser.js";

describe("Frontend Natural Language Grocery Parser (apps/web)", () => {
  const parser = new DeterministicGroceryListParser();

  it("parses multi-item natural language grocery lists into structured items", async () => {
    const raw = "2 litres milk, 12 eggs, 500g butter";
    const result = await parser.parse(raw);

    expect(result.items.length).toBe(3);

    // Item 1
    expect(result.items[0].query).toBe("milk");
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].unit).toBe("1 L");

    // Item 2
    expect(result.items[1].query).toBe("eggs");
    expect(result.items[1].quantity).toBe(12);

    // Item 3
    expect(result.items[2].query).toBe("butter");
    expect(result.items[2].quantity).toBe(1);
    expect(result.items[2].unit).toBe("500 g");
  });

  it("handles Indian brand and variant extraction with dozen conversion", async () => {
    const raw = "1 dozen eggs, 5 kg Aashirvaad Sharbati atta";
    const result = await parser.parse(raw);

    expect(result.items.length).toBe(2);

    // 1 dozen eggs
    expect(result.items[0].query).toContain("eggs");
    expect(result.items[0].unit).toBe("12 pcs");
    expect(result.items[0].quantity).toBe(1);

    // 5 kg Aashirvaad Sharbati atta
    expect(result.items[1].brandPreference).toBe("Aashirvaad");
    expect(result.items[1].variantPreference).toBe("Sharbati");
    expect(result.items[1].query).toBe("atta");
    expect(result.items[1].unit).toBe("5 kg");
  });

  it("detects substitution modifier 'no substitute' -> allowSubstitutions: false", async () => {
    const raw = "Amul butter 500g (no substitute), brown bread (any brand)";
    const result = await parser.parse(raw);

    expect(result.items.length).toBe(2);
    expect(result.items[0].allowSubstitutions).toBe(false);
    expect(result.items[1].allowSubstitutions).toBe(true);
  });

  it("defaultNLParser export is functional and synchronous parseDeterministic is exposed", () => {
    const res = defaultNLParser.parseDeterministic("1 packet bread");
    expect(res.items.length).toBe(1);
    expect(res.items[0].queryName).toBe("bread");
    expect(res.items[0].unitSize).toBe("1 pack");
  });
});

