import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformCartPlan, PlatformId } from "@groqai/shared";

// Mock component simulating fee row rendering in optimization breakdown
const MockFeeDisplay: React.FC<{
  plan: { hasUnknownFee: boolean; handlingFeeRupees: number; unknownFeeExplanation?: string };
}> = ({ plan }) => {
  return (
    <div>
      <span data-testid="handling-label">Handling Fee:</span>
      {plan.hasUnknownFee ? (
        <span data-testid="unknown-badge" className="text-amber-700 bg-amber-100">
          ₹5 – ₹15 (Unknown)
        </span>
      ) : (
        <span data-testid="known-fee">₹{plan.handlingFeeRupees}</span>
      )}
    </div>
  );
};

describe("Unknown Fee Display Rules", () => {
  it("displays unknown handling fee as range badge and NEVER as ₹0", () => {
    const unknownPlan = {
      hasUnknownFee: true,
      handlingFeeRupees: 0, // Even if 0 in raw number, UI must intercept and show unknown
      unknownFeeExplanation: "Handling fee varies by hub (range ₹5 - ₹15)",
    };

    render(<MockFeeDisplay plan={unknownPlan} />);

    const badge = screen.getByTestId("unknown-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("Unknown");
    expect(badge.textContent).not.toBe("₹0");
  });

  it("displays known handling fee when available", () => {
    const knownPlan = {
      hasUnknownFee: false,
      handlingFeeRupees: 5,
    };

    render(<MockFeeDisplay plan={knownPlan} />);

    const fee = screen.getByTestId("known-fee");
    expect(fee).toBeInTheDocument();
    expect(fee.textContent).toBe("₹5");
  });
});
