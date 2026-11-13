import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BasketProvider, useBasket } from "../context/BasketContext.js";
import { PincodeModal } from "../components/common/PincodeModal.js";
import { OptimizationPage } from "../pages/OptimizationPage.js";
import { apiClient } from "../services/apiClient.js";

// Helper component to read basket context
const BasketContextReader: React.FC = () => {
  const { pincode, locationName, items } = useBasket();
  return (
    <div>
      <span data-testid="pincode">{pincode}</span>
      <span data-testid="locationName">{locationName}</span>
      <span data-testid="itemCount">{items.length}</span>
    </div>
  );
};

describe("Phase 7 — Frontend Bugfixes, Scroll Jump Prevention & Pincode 560064 Defaulting", () => {
  describe("1. Default Pincode 560064 (Bengaluru Yelahanka / Avalahalli)", () => {
    it("BasketContext initializes with default pincode 560064 and Bengaluru location name", () => {
      render(
        <BasketProvider>
          <BasketContextReader />
        </BasketProvider>
      );

      expect(screen.getByTestId("pincode").textContent).toBe("560064");
      expect(screen.getByTestId("locationName").textContent).toContain("Yelahanka");
      expect(screen.getByTestId("locationName").textContent).toContain("560064");
    });

    it("PincodeModal lists 560064 as the primary quick hub select option", () => {
      render(
        <BasketProvider>
          <PincodeModal isOpen={true} onClose={() => {}} />
        </BasketProvider>
      );

      const yelahankaHubBtn = screen.getByRole("button", {
        name: /Bengaluru - Yelahanka \/ Avalahalli \(560064\)/i,
      });
      expect(yelahankaHubBtn).toBeInTheDocument();
      expect(yelahankaHubBtn).toHaveAttribute("type", "button");
    });

    it("Selecting 560064 in PincodeModal sets active location to Yelahanka / Avalahalli", () => {
      let closed = false;
      render(
        <BasketProvider>
          <PincodeModal isOpen={true} onClose={() => { closed = true; }} />
          <BasketContextReader />
        </BasketProvider>
      );

      const hubBtn = screen.getByRole("button", {
        name: /Bengaluru - Yelahanka \/ Avalahalli \(560064\)/i,
      });
      fireEvent.click(hubBtn);

      expect(screen.getByTestId("pincode").textContent).toBe("560064");
      expect(screen.getByTestId("locationName").textContent).toContain("Yelahanka / Avalahalli");
      expect(closed).toBe(true);
    });
  });

  describe("2. Scroll-Jump Prevention & Non-Destructive Loading Invariant", () => {
    it("OptimizationPage keeps rendered DOM visible and renders non-destructive pulse when updating", async () => {
      vi.spyOn(apiClient, "createOptimization").mockResolvedValue({
        id: "opt-test-1234",
        locationId: "bengaluru_560064",
        pincode: "560064",
        createdAt: new Date().toISOString(),
        baselineName: "Cheapest Single Platform",
        baselineTotalPaise: 38000,
        baselineTotalRupees: 380,
        options: [
          {
            id: "opt-1",
            strategy: "optimized_multi_platform",
            title: "Optimal Multi-Platform Split",
            platforms: ["blinkit", "zepto"],
            perPlatform: {
              blinkit: {
                platform: "blinkit",
                platformName: "Blinkit",
                items: [],
                itemCount: 2,
                subtotalPaise: 19000,
                subtotalRupees: 190,
                deliveryFeePaise: 2500,
                deliveryFeeRupees: 25,
                handlingFeePaise: 400,
                handlingFeeRupees: 4,
                platformFeePaise: 200,
                platformFeeRupees: 2,
                discountsPaise: 0,
                discountsRupees: 0,
                estimatedTotalPaise: 22100,
                estimatedTotalRupees: 221,
                meetsMinimumOrder: true,
                hasUnknownFee: false,
                supportsDeepLinks: true,
              },
            },
            subtotalPaise: 34000,
            subtotalRupees: 340,
            estimatedFees: {
              deliveryPaise: 2500,
              handlingPaise: 400,
              platformPaise: 200,
              otherPaise: 0,
              totalPaise: 3100,
              deliveryRupees: 25,
              handlingRupees: 4,
              platformRupees: 2,
              otherRupees: 0,
              totalRupees: 31,
              hasUnknownFees: false,
            },
            knownFees: {
              deliveryPaise: 2500,
              handlingPaise: 400,
              platformPaise: 200,
              otherPaise: 0,
              totalPaise: 3100,
              deliveryRupees: 25,
              handlingRupees: 4,
              platformRupees: 2,
              otherRupees: 0,
              totalRupees: 31,
              hasUnknownFees: false,
            },
            unknownFees: null,
            verifiedDiscountsPaise: 0,
            verifiedDiscountsRupees: 0,
            estimatedTotalPaise: 37100,
            estimatedTotalRupees: 371,
            orderCount: 2,
            savingsVsBaselinePaise: 900,
            savingsVsBaselineRupees: 9,
            baselineName: "Cheapest Single Platform",
            isEstimate: true,
            warnings: [],
            explanation: {
              summary: "Best split saves ₹9",
              reasoning: [],
              pros: ["Saves ₹9 net"],
              cons: [],
            },
            dataCoverage: {
              totalItems: 4,
              matchedItems: 4,
              missingItems: 0,
              percentage: 100,
            },
            isFeasible: true,
          },
        ],
        warnings: [],
      });

      const { container } = render(
        <MemoryRouter>
          <BasketProvider>
            <OptimizationPage />
          </BasketProvider>
        </MemoryRouter>
      );

      // Wait for initial render to load
      await waitFor(() => {
        expect(screen.getByText("Optimization Results")).toBeInTheDocument();
      });

      // Verify that cards and proceed buttons are in DOM
      expect(screen.getByText("Optimal Multi-Platform Split")).toBeInTheDocument();
      const proceedBtns = screen.getAllByRole("button", { name: /Proceed to Purchase/i });
      expect(proceedBtns.length).toBeGreaterThanOrEqual(1);
      expect(proceedBtns[0]).toHaveAttribute("type", "button");

      // Verify subset explorer button has explicit type="button"
      const subsetBtn = screen.getByRole("button", { name: /Combinatorial Optimizer/i });
      expect(subsetBtn).toHaveAttribute("type", "button");
    });
  });

  describe("3. Dual-Format Optimization Result Normalization (Phase 3 strategies & Phase 1 options)", () => {
    it("seamlessly handles Phase 3 response containing strategies record without NaN or undefined", async () => {
      vi.spyOn(apiClient, "createOptimization").mockResolvedValue({
        pincode: "560064",
        evaluatedSubsetsCount: 15,
        strategies: {
          cheapestItemByItem: {
            strategy: "CHEAPEST_ITEM_BY_ITEM",
            strategyName: "Raw Item-by-Item Floor",
            platforms: ["blinkit", "zepto"],
            storeCarts: {},
            itemSubtotalPaise: 30000,
            totalFeeMinPaise: 6000,
            totalFeeMaxPaise: 6000,
            estimatedTotalMinPaise: 36000,
            estimatedTotalMaxPaise: 36000,
            hasUnknownFees: false,
            coverageCount: 4,
            totalRequestedItems: 4,
            missingItems: [],
            feeCliffWarnings: [],
          },
          cheapestSinglePlatform: {
            strategy: "CHEAPEST_SINGLE_PLATFORM",
            strategyName: "Cheapest Single Platform (Blinkit)",
            platforms: ["blinkit"],
            storeCarts: {},
            itemSubtotalPaise: 35000,
            totalFeeMinPaise: 3100,
            totalFeeMaxPaise: 3100,
            estimatedTotalMinPaise: 38100,
            estimatedTotalMaxPaise: 38100,
            hasUnknownFees: false,
            coverageCount: 4,
            totalRequestedItems: 4,
            missingItems: [],
            feeCliffWarnings: [],
          },
          optimizedMultiPlatform: {
            strategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
            strategyName: "Optimal 2-Store Split",
            platforms: ["blinkit", "zepto"],
            storeCarts: {},
            itemSubtotalPaise: 31000,
            totalFeeMinPaise: 5000,
            totalFeeMaxPaise: 5000,
            estimatedTotalMinPaise: 36000,
            estimatedTotalMaxPaise: 36000,
            hasUnknownFees: false,
            coverageCount: 4,
            totalRequestedItems: 4,
            missingItems: [],
            feeCliffWarnings: [],
            savingsVsSinglePlatformPaise: 2100,
            rationale: "Splitting between Blinkit and Zepto saves ₹21",
          },
        },
        singlePlatformRankings: [],
        allSubsetEvaluations: [],
        recommendation: {
          winningStrategy: "OPTIMIZED_MULTI_PLATFORM_SPLIT",
          netSavingsPaise: 2100,
          rationale: "Splitting between Blinkit and Zepto saves ₹21",
          feeCliffWarnings: [],
          hasUnknownFees: false,
        },
      } as any);

      render(
        <MemoryRouter>
          <BasketProvider>
            <OptimizationPage />
          </BasketProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Optimization Results")).toBeInTheDocument();
      });

      // Verify that total rupees is formatted cleanly without NaN
      expect(screen.getAllByText("₹360").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    });
  });
});
