import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OptimizationOption } from "@groqai/shared";

const MockOptionCard: React.FC<{ option: OptimizationOption }> = ({ option }) => {
  return (
    <div data-testid="option-card">
      <h3 data-testid="option-title">{option.title}</h3>
      <div data-testid="baseline-savings">
        Savings: ₹{option.savingsVsBaselineRupees} vs {option.baselineName}
      </div>
      <div data-testid="estimated-total">Total: ₹{option.estimatedTotalRupees}</div>
      <p data-testid="explanation-summary">{option.explanation.summary}</p>
      {option.unknownFees && (
        <span data-testid="unknown-fees-badge">Unknown fees present</span>
      )}
    </div>
  );
};

describe("Optimization Result Rendering", () => {
  const sampleOption: OptimizationOption = {
    id: "test-opt-1",
    strategy: "optimized_multi_platform",
    title: "Smart Split (Maximum Verified Savings)",
    platforms: ["blinkit", "zepto"],
    perPlatform: {} as any,
    subtotalPaise: 45000,
    subtotalRupees: 450,
    estimatedFees: {
      deliveryPaise: 2500,
      deliveryRupees: 25,
      handlingPaise: 900,
      handlingRupees: 9,
      platformPaise: 500,
      platformRupees: 5,
      otherPaise: 0,
      otherRupees: 0,
      totalPaise: 3900,
      totalRupees: 39,
      hasUnknownFees: false,
    },
    knownFees: {
      deliveryPaise: 2500,
      deliveryRupees: 25,
      handlingPaise: 900,
      handlingRupees: 9,
      platformPaise: 500,
      platformRupees: 5,
      otherPaise: 0,
      otherRupees: 0,
      totalPaise: 3900,
      totalRupees: 39,
      hasUnknownFees: false,
    },
    unknownFees: null,
    verifiedDiscountsPaise: 0,
    verifiedDiscountsRupees: 0,
    estimatedTotalPaise: 48900,
    estimatedTotalRupees: 489,
    orderCount: 2,
    savingsVsBaselinePaise: 6500,
    savingsVsBaselineRupees: 65,
    baselineName: "Cheapest Single Store (Blinkit)",
    isEstimate: true,
    warnings: [],
    explanation: {
      summary: "Splits order across Blinkit and Zepto to save ₹65 after delivery charges.",
      reasoning: ["Blinkit milk is ₹12 cheaper", "Zepto oil is ₹85 cheaper"],
      pros: ["Saves ₹65 net"],
      cons: ["2 deliveries"],
    },
    dataCoverage: {
      totalItems: 4,
      matchedItems: 4,
      missingItems: 0,
      percentage: 100,
    },
    isFeasible: true,
  };

  it("renders plan title, estimated total, and named baseline savings", () => {
    render(<MockOptionCard option={sampleOption} />);

    expect(screen.getByTestId("option-title")).toHaveTextContent(
      "Smart Split (Maximum Verified Savings)"
    );
    expect(screen.getByTestId("baseline-savings")).toHaveTextContent(
      "Savings: ₹65 vs Cheapest Single Store (Blinkit)"
    );
    expect(screen.getByTestId("estimated-total")).toHaveTextContent("Total: ₹489");
    expect(screen.getByTestId("explanation-summary")).toHaveTextContent(
      "Splits order across Blinkit and Zepto to save ₹65 after delivery charges."
    );
  });
});
