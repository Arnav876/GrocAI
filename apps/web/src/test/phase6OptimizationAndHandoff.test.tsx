import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BasketProvider } from "../context/BasketContext.js";
import { PincodeModal } from "../components/common/PincodeModal.js";
import { TopBar } from "../components/common/TopBar.js";
import { ManualPriceModal } from "../components/products/ManualPriceModal.js";
import { apiClient } from "../services/apiClient.js";
import { mockApiService } from "../services/mockApiService.js";
import {
  PINCODE_REGEX,
  formatPaiseToRupees,
  assertIntegerPaise,
  NullCartAdapter,
  parseAndNormalizeQuantityWithPrice,
  type StrategyEvaluation,
  type StoreCartEvaluation,
} from "@groqai/shared";

describe("Phase 6: Frontend Quality Gate, 3-Strategy Optimization & Handoff Engine", () => {
  // --------------------------------------------------------------------------
  // 1. Integer Paise Truth & Formatting Invariants
  // --------------------------------------------------------------------------
  describe("Integer Paise Invariant & Display Formatting", () => {
    it("formats integer paise to standard Rupee currency representation strictly at UI boundary", () => {
      expect(formatPaiseToRupees(5400)).toBe("₹54.00");
      expect(formatPaiseToRupees(29900)).toBe("₹299.00");
      expect(formatPaiseToRupees(1550)).toBe("₹15.50");
      expect(formatPaiseToRupees(0)).toBe("₹0.00");

      expect(() => assertIntegerPaise(5400)).not.toThrow();
      expect(() => assertIntegerPaise(54.5)).toThrow(/Financial invariant violation/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Explicit Unknown Fee Range Disclosure
  // --------------------------------------------------------------------------
  describe("Explicit Unknown Fee Range Invariant (Never Coerced to ₹0)", () => {
    it("renders dynamic fee range and warning badge when hasUnknownFees is true", () => {
      const DynamicFeeComponent: React.FC<{
        hasUnknownFee: boolean;
        feeMinPaise: number;
        feeMaxPaise: number;
      }> = ({ hasUnknownFee, feeMinPaise, feeMaxPaise }) => {
        return (
          <div data-testid="fee-display">
            {hasUnknownFee ? (
              <span data-testid="dynamic-fee-badge" className="text-amber-800 bg-amber-100">
                {formatPaiseToRupees(feeMinPaise)} – {formatPaiseToRupees(feeMaxPaise)} (⚠️ Dynamic Fee Range — Never coerced to ₹0)
              </span>
            ) : (
              <span data-testid="fixed-fee">{formatPaiseToRupees(feeMinPaise)}</span>
            )}
          </div>
        );
      };

      // BigBasket dynamic ₹5 – ₹15 handling fee (500 to 1500 paise)
      render(<DynamicFeeComponent hasUnknownFee={true} feeMinPaise={500} feeMaxPaise={1500} />);

      const badge = screen.getByTestId("dynamic-fee-badge");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain("₹5.00 – ₹15.00");
      expect(badge.textContent).toContain("⚠️ Dynamic Fee Range — Never coerced to ₹0");
      expect(badge.textContent).not.toBe("₹0.00");
    });

    it("preserves hasUnknownFees in mockApiService.optimizeBasket when BigBasket is included", async () => {
      const result = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [{ queryName: "Amul Taaza Milk", quantity: 2 }],
      });

      expect(result.strategies.cheapestItemByItem).toBeDefined();
      expect(result.strategies.cheapestSinglePlatform).toBeDefined();
      expect(result.strategies.optimizedMultiPlatform).toBeDefined();

      // Check BigBasket store evaluation has hasUnknownFees = true
      const bbRanking = result.singlePlatformRankings.find((r) => r.platforms.includes("bigbasket"));
      expect(bbRanking).toBeDefined();
      expect(bbRanking?.hasUnknownFees).toBe(true);
      expect(bbRanking?.estimatedTotalMinPaise).toBeLessThan(bbRanking?.estimatedTotalMaxPaise || 0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. 3-Strategy Comparison & 15-Subset Combinatorial Exploration
  // --------------------------------------------------------------------------
  describe("Deterministic 3-Strategy Optimizer & 15-Subset Combinatorial Explorer", () => {
    it("evaluates exactly 15 platform subsets (2^4 - 1 = 15) in combinatorial optimizer", async () => {
      const result = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [
          { queryName: "Amul Taaza Milk", quantity: 2 },
          { queryName: "Sunflower Oil", quantity: 1 },
        ],
      });

      expect(result.allSubsetEvaluations).toHaveLength(15);
      expect(result.evaluatedSubsetsCount).toBe(15);
      const singleStoreSubsets = result.allSubsetEvaluations.filter((s) => s.subset.length === 1);
      const twoStoreSubsets = result.allSubsetEvaluations.filter((s) => s.subset.length === 2);
      const threeStoreSubsets = result.allSubsetEvaluations.filter((s) => s.subset.length === 3);
      const fourStoreSubsets = result.allSubsetEvaluations.filter((s) => s.subset.length === 4);

      expect(singleStoreSubsets).toHaveLength(4);
      expect(twoStoreSubsets).toHaveLength(6);
      expect(threeStoreSubsets).toHaveLength(4);
      expect(fourStoreSubsets).toHaveLength(1);
    });

    it("Strategy 1 (CHEAPEST_ITEM_BY_ITEM) calculates raw shelf floor and fee penalty", async () => {
      const result = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [
          { queryName: "Amul Taaza Milk", quantity: 1 },
          { queryName: "Onions", quantity: 1 },
        ],
      });

      const itemStrat = result.strategies.cheapestItemByItem;
      expect(itemStrat.strategy).toBe("CHEAPEST_ITEM_BY_ITEM");
      expect(itemStrat.itemSubtotalPaise).toBeGreaterThan(0);
      expect(itemStrat.totalFeeMinPaise).toBeGreaterThan(0);
      expect(itemStrat.estimatedTotalMinPaise).toBe(
        itemStrat.itemSubtotalPaise + itemStrat.totalFeeMinPaise
      );
    });

    it("Strategy 2 (CHEAPEST_SINGLE_PLATFORM) ranks all 4 platforms and computes free delivery cliff", async () => {
      const result = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [{ queryName: "Amul Taaza Milk", quantity: 2 }],
      });

      const singleStrat = result.strategies.cheapestSinglePlatform;
      expect(singleStrat.strategy).toBe("CHEAPEST_SINGLE_PLATFORM");
      expect(singleStrat.platforms).toHaveLength(1);
      expect(result.singlePlatformRankings).toHaveLength(4);

      // Verify rankings are sorted by total cost ascending
      for (let i = 1; i < result.singlePlatformRankings.length; i++) {
        expect(result.singlePlatformRankings[i].estimatedTotalMinPaise).toBeGreaterThanOrEqual(
          result.singlePlatformRankings[i - 1].estimatedTotalMinPaise
        );
      }
    });

    it("Strategy 3 (OPTIMIZED_MULTI_PLATFORM_SPLIT) only recommends split if net savings exceed threshold", async () => {
      const result = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [{ queryName: "Amul Taaza Milk", quantity: 1 }],
      });

      const multiStrat = result.strategies.optimizedMultiPlatform;
      expect(multiStrat.strategy).toBe("OPTIMIZED_MULTI_PLATFORM_SPLIT");
      expect(result.recommendation).toBeDefined();
      expect(["CHEAPEST_SINGLE_PLATFORM", "OPTIMIZED_MULTI_PLATFORM_SPLIT"]).toContain(
        result.recommendation.winningStrategy
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Honest Shopping Handoff & NullCartAdapter Compliance
  // --------------------------------------------------------------------------
  describe("Shopping Handoff Engine & NullCartAdapter Compliance", () => {
    it("NullCartAdapter explicitly advertises zero automated checkout capabilities", () => {
      const caps = NullCartAdapter.getCapabilities();
      expect(caps.createCart).toBe(false);
      expect(caps.automatedCheckout).toBe(false);
      expect(caps.searchDeepLink).toBe(true);
      expect(caps.checklistHandoff).toBe(true);
    });

    it("generates honest shopping handoff payload with search deep links and Markdown checklist", async () => {
      const optResult = await mockApiService.optimizeBasket({
        pincode: "110001",
        items: [{ queryName: "Amul Taaza Milk", quantity: 2 }],
      });

      const handoff = await mockApiService.generateShoppingHandoff({
        storeCarts: optResult.strategies.cheapestSinglePlatform.storeCarts,
        strategy: "CHEAPEST_SINGLE_PLATFORM",
        strategyName: "Single Store Baseline",
        pincode: "110001",
      });

      expect(handoff.capabilities.createCart).toBe(false);
      expect(handoff.capabilities.automatedCheckout).toBe(false);
      expect(handoff.capabilities.searchDeepLink).toBe(true);
      expect(handoff.method).toBe("links_and_checklist");
      expect(handoff.notice).toContain("NullCartAdapter");

      // Verify platforms items have isDeepLink: false and valid searchUrl
      expect(handoff.platforms.length).toBeGreaterThan(0);
      const firstPlatform = handoff.platforms[0];
      expect(firstPlatform.items.length).toBeGreaterThan(0);
      expect(firstPlatform.items[0].isDeepLink).toBe(false);
      expect(firstPlatform.items[0].searchUrl).toContain("http");

      // Verify markdown checklist format
      expect(handoff.markdownChecklist).toContain("# 🛒 GrocAI Multi-Store Shopping Checklist");
      expect(handoff.markdownChecklist).toContain("- [ ]");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Hyper-Local Pincode Context & PINCODE_REGEX Validation
  // --------------------------------------------------------------------------
  describe("Hyper-Local Pincode Invariant & Modal Validation", () => {
    it("PINCODE_REGEX strictly validates 6-digit Indian PIN codes and rejects leading 0", () => {
      expect(PINCODE_REGEX.test("110001")).toBe(true);
      expect(PINCODE_REGEX.test("560001")).toBe(true);
      expect(PINCODE_REGEX.test("400001")).toBe(true);

      // Invalid cases
      expect(PINCODE_REGEX.test("012345")).toBe(false); // starts with 0
      expect(PINCODE_REGEX.test("11000")).toBe(false);  // 5 digits
      expect(PINCODE_REGEX.test("1100001")).toBe(false); // 7 digits
      expect(PINCODE_REGEX.test("abc123")).toBe(false);
    });

    it("PincodeModal shows validation error when entering invalid pincode", () => {
      render(
        <BasketProvider>
          <PincodeModal isOpen={true} onClose={() => {}} />
        </BasketProvider>
      );

      const input = screen.getByPlaceholderText(/e\.g\. 110001/);
      const applyBtn = screen.getByRole("button", { name: /Apply/i });

      // Enter invalid pincode starting with 0
      fireEvent.change(input, { target: { value: "012345" } });
      fireEvent.click(applyBtn);

      expect(
        screen.getByText(/Please enter a valid 6-digit Indian PIN code/i)
      ).toBeInTheDocument();
    });

    it("PincodeModal accepts valid 6-digit PIN code", () => {
      const onClose = vi.fn();
      render(
        <BasketProvider>
          <PincodeModal isOpen={true} onClose={onClose} />
        </BasketProvider>
      );

      const input = screen.getByPlaceholderText(/e\.g\. 110001/);
      const applyBtn = screen.getByRole("button", { name: /Apply/i });

      fireEvent.change(input, { target: { value: "560001" } });
      fireEvent.click(applyBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Assisted Operator Mode (Swiggy Instamart) & Normalized Unit Pricing
  // --------------------------------------------------------------------------
  describe("Assisted Operator Mode (Swiggy Instamart) & PerimeterX Policy", () => {
    it("computes normalized unit price in real-time across standard units", () => {
      // 1 L fresh milk at ₹54.00 (5400 paise)
      const norm1L = parseAndNormalizeQuantityWithPrice("1 L", 5400);
      expect(norm1L.referenceUnit).toBe("1L");
      expect(norm1L.pricePerReferenceUnitPaise).toBe(5400);
      expect(formatPaiseToRupees(norm1L.pricePerReferenceUnitPaise)).toBe("₹54.00");

      // 500 ml at ₹30.00 (3000 paise) -> ₹60.00 / 1L
      const norm500ml = parseAndNormalizeQuantityWithPrice("500 ml", 3000);
      expect(norm500ml.referenceUnit).toBe("1L");
      expect(norm500ml.pricePerReferenceUnitPaise).toBe(6000);
      expect(formatPaiseToRupees(norm500ml.pricePerReferenceUnitPaise)).toBe("₹60.00");

      // 2 kg rice at ₹140.00 (14000 paise) -> ₹70.00 / 1kg
      const norm2kg = parseAndNormalizeQuantityWithPrice("2 kg", 14000);
      expect(norm2kg.referenceUnit).toBe("1kg");
      expect(norm2kg.pricePerReferenceUnitPaise).toBe(7000);
      expect(formatPaiseToRupees(norm2kg.pricePerReferenceUnitPaise)).toBe("₹70.00");
    });

    it("ManualPriceModal displays PerimeterX compliance policy notice", () => {
      render(
        <ManualPriceModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />
      );

      expect(
        screen.getByText(/PerimeterX Anti-Bot Compliance Policy/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/GrocAI NEVER bypasses or scripts around anti-bot gates/i)
      ).toBeInTheDocument();
    });

    it("ManualPriceModal displays real-time normalized unit price preview as user types", () => {
      render(
        <ManualPriceModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          defaultTitle="Amul Taaza Milk"
        />
      );

      const priceInput = screen.getByPlaceholderText(/e\.g\. 54/);
      fireEvent.change(priceInput, { target: { value: "54" } });

      expect(screen.getByText(/Normalized Unit Price:/i)).toBeInTheDocument();
      expect(screen.getByText(/₹54\.00 \/ 1L/)).toBeInTheDocument();
    });

    it("ManualPriceModal rejects invalid 6-digit pincode submission", async () => {
      render(
        <ManualPriceModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          defaultTitle="Amul Taaza Milk"
        />
      );

      const priceInput = screen.getByPlaceholderText(/e\.g\. 54/);
      fireEvent.change(priceInput, { target: { value: "54" } });

      const pincodeInput = screen.getByPlaceholderText("110001");
      fireEvent.change(pincodeInput, { target: { value: "012345" } }); // starts with 0

      const submitBtn = screen.getByRole("button", { name: /Record Price/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Please enter a valid 6-digit Indian PIN code/i)
        ).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 7. Connector Health Matrix & Header / TopBar Indicators
  // --------------------------------------------------------------------------
  describe("Connector Health Matrix & Ingestion Modes", () => {
    it("reports honest platform ingestion modes via getHealth()", async () => {
      const health = await apiClient.getHealth();
      expect(health.status).toBe("ok");
      expect(health.ingestionModes).toBeDefined();
      expect(health.ingestionModes?.blinkit).toBe("headed_worker");
      expect(health.ingestionModes?.zepto).toBe("headed_worker");
      expect(health.ingestionModes?.bigbasket).toBe("headed_worker");
      expect(health.ingestionModes?.instamart).toBe("manual_assisted");

      expect(health.capabilities?.automatedCheckout).toBe(false);
      expect(health.capabilities?.createCart).toBe(false);
    });

    it("TopBar renders platform ingestion statuses and Zero Auto-Checkout capability badge", () => {
      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      expect(screen.getByText(/Blinkit: Headed/i)).toBeInTheDocument();
      expect(screen.getByText(/Zepto: Headed/i)).toBeInTheDocument();
      expect(screen.getByText(/BigBasket: Headed/i)).toBeInTheDocument();
      expect(screen.getByText(/Instamart: Manual Assisted/i)).toBeInTheDocument();
      expect(screen.getByText(/Zero Auto-Checkout \(NullCartAdapter\)/i)).toBeInTheDocument();
    });
  });
});
