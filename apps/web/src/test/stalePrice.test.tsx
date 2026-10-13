import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformChipStrip } from "../components/products/PlatformChipStrip.js";
import { ProductSummary } from "@groqai/shared";

describe("Stale Price Detection & Rendering", () => {
  it("renders a stale price indicator when an observation is older than 6 hours", () => {
    const mockProduct: ProductSummary = {
      id: "test-stale-item",
      name: "Nandini Pure Cow Ghee",
      brand: "Nandini",
      category: "dairy",
      variant: "Pure Ghee",
      packSize: "500 ml",
      lowestPricePaise: 29500,
      lowestPriceRupees: 295,
      lowestPlatform: "zepto",
      platformPrices: {
        blinkit: {
          pricePaise: 31000,
          priceRupees: 310,
          availability: "available",
          isStale: true, // Marked stale (> 6 hours old)
          observedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
          sourceType: "mock",
          confidence: 0.95,
        },
        zepto: {
          pricePaise: 29500,
          priceRupees: 295,
          availability: "available",
          isStale: true,
          observedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
          sourceType: "mock",
          confidence: 0.95,
        },
        instamart: {
          pricePaise: 30500,
          priceRupees: 305,
          availability: "available",
          isStale: false,
          observedAt: new Date().toISOString(),
          sourceType: "mock",
          confidence: 0.95,
        },
        bigbasket: {
          pricePaise: 32000,
          priceRupees: 320,
          availability: "available",
          isStale: false,
          observedAt: new Date().toISOString(),
          sourceType: "mock",
          confidence: 0.95,
        },
      },
    };

    const { container } = render(<PlatformChipStrip product={mockProduct} />);

    // Must find title="Cached price older than 6h"
    const staleElements = container.querySelectorAll('[title="Cached price older than 6h"]');
    expect(staleElements.length).toBeGreaterThanOrEqual(1);
  });
});
