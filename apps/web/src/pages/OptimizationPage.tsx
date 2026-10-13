import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Info,
  CheckCircle2,
  Package,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Truck,
  RotateCcw,
} from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import {
  OptimizationOption,
  OptimizationResponse,
  OptimizationStrategy,
  PLATFORM_METADATA,
  formatINR,
  paiseToRupees,
} from "@groqai/shared";
import { useBasket, BasketItem } from "../context/BasketContext.js";
import { SubstitutionModal, SubstitutionItem } from "../components/basket/SubstitutionModal.js";

export const OptimizationPage: React.FC = () => {
  const { items, pincode, preferences } = useBasket();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [optimization, setOptimization] = useState<OptimizationResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<OptimizationStrategy>("optimized_multi_platform");
  const [error, setError] = useState<string | null>(null);

  // Substitution state
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [activeSub, setActiveSub] = useState<SubstitutionItem | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .createOptimization({
        locationId: `delhi_${pincode}`,
        pincode,
        items: items.map((it: BasketItem) => ({
          query: it.query,
          quantity: it.quantity,
          unit: it.unit,
          requiredVariant: it.requiredVariant,
          allowSubstitutions: it.allowSubstitutions || false,
        })),
        preferences,
      })
      .then((res) => {
        if (mounted) {
          setOptimization(res);
          const initialStrat =
            (searchParams.get("strategy") as OptimizationStrategy) ||
            res.options[0]?.strategy ||
            "optimized_multi_platform";
          setSelectedStrategy(initialStrat);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Optimization failed:", err);
        if (mounted) {
          setError(err.message || "Failed to calculate optimization options");
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [items, pincode, preferences]);

  if (items.length === 0) {
    return (
      <div className="max-w-container mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-5xl">🛒</div>
        <h2 className="text-xl font-bold text-brand-navy">Your Basket is Empty</h2>
        <p className="text-xs text-brand-grey max-w-sm mx-auto">
          Add items to your grocery list first to compare prices and find the cheapest split.
        </p>
        <Link
          to="/list"
          className="inline-flex items-center gap-2 bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-6 py-3 rounded-full transition-colors shadow-sm"
        >
          <span>Go to Grocery List Builder</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-container mx-auto px-4 py-20 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full animate-spin mx-auto"></div>
        <h2 className="text-lg font-bold text-brand-navy">Optimizing Grocery Basket...</h2>
        <p className="text-xs text-brand-grey">
          Evaluating 15 platform subsets, minimum orders, delivery surcharges and platform fees...
        </p>
      </div>
    );
  }

  if (error || !optimization) {
    return (
      <div className="max-w-container mx-auto px-4 py-16 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-brand-navy">Optimization Encountered an Issue</h2>
        <p className="text-xs text-rose-600 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-brand-green text-white text-xs font-bold px-5 py-2.5 rounded-full mt-2"
        >
          Retry Optimization
        </button>
      </div>
    );
  }

  const activeOption =
    optimization.options.find((o) => o.strategy === selectedStrategy) || optimization.options[0];

  const handleProceedToHandoff = () => {
    navigate(`/handoff/${optimization.id}?strategy=${selectedStrategy}`);
  };

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-green-light text-brand-green uppercase tracking-wider">
              Optimization ID: {optimization.id.substring(0, 16)}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500 font-semibold">PIN: {optimization.pincode}</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-navy mt-1">Optimization Results</h1>
          <p className="text-xs text-brand-grey mt-0.5">
            Baseline comparison: <strong className="text-brand-navy">{optimization.baselineName}</strong> (₹{optimization.baselineTotalRupees})
          </p>
        </div>

        <button
          onClick={handleProceedToHandoff}
          className="bg-brand-green hover:bg-brand-green-hover text-white text-xs sm:text-sm font-bold px-6 py-3.5 rounded-full flex items-center gap-2 shadow-sm transition-all"
        >
          <span>Proceed to Purchase</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3 Strategy Cards / Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {optimization.options.map((opt) => {
          const isSelected = opt.strategy === selectedStrategy;
          return (
            <div
              key={opt.id}
              onClick={() => setSelectedStrategy(opt.strategy)}
              className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                isSelected
                  ? "border-brand-green bg-brand-green-light/20 shadow-md ring-2 ring-brand-green/20"
                  : "border-brand-border bg-white hover:border-gray-300 shadow-xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      opt.strategy === "optimized_multi_platform"
                        ? "bg-brand-green text-white"
                        : opt.strategy === "cheapest_single_platform"
                        ? "bg-brand-navy text-white"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {opt.strategy === "optimized_multi_platform"
                      ? "Recommended Split"
                      : opt.strategy === "cheapest_single_platform"
                      ? "Single Platform"
                      : "Raw Item-by-Item"}
                  </span>
                  <span className="text-xs font-bold text-gray-500">
                    {opt.orderCount} Order{opt.orderCount > 1 ? "s" : ""}
                  </span>
                </div>

                <h3 className="font-bold text-brand-navy text-base leading-snug">{opt.title}</h3>

                {/* Savings vs Baseline */}
                <div className="mt-3">
                  {opt.savingsVsBaselineRupees > 0 ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Saves ₹{opt.savingsVsBaselineRupees} net vs {opt.baselineName.split(" ")[0]}</span>
                    </div>
                  ) : opt.savingsVsBaselineRupees < 0 ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium">
                      <span>Extra ₹{Math.abs(opt.savingsVsBaselineRupees)} in split delivery fees</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">
                      <span>Baseline reference cart</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Estimated Total */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Estimated Total
                  </span>
                  <span className="text-xl font-black text-brand-navy">
                    ₹{opt.estimatedTotalRupees}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-brand-green">
                  <span>{isSelected ? "Selected" : "Select"}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Strategy Deep Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Per Platform Carts & Line Items (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Explanation Box */}
          <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-xs space-y-3">
            <h3 className="font-bold text-brand-navy text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-brand-green" />
              <span>Why This Plan Was Selected</span>
            </h3>
            <p className="text-xs text-brand-grey leading-relaxed">
              {activeOption.explanation.summary}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 space-y-1">
                <span className="font-bold text-emerald-900 block">Advantages</span>
                {activeOption.explanation.pros.map((pro, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-brand-green" />
                    <span>{pro}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                <span className="font-bold text-gray-700 block">Trade-offs</span>
                {activeOption.explanation.cons.length > 0 ? (
                  activeOption.explanation.cons.map((con, idx) => (
                    <div key={idx} className="text-gray-600 flex items-center gap-1.5">
                      <span>•</span>
                      <span>{con}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-gray-400">Zero major trade-offs.</span>
                )}
              </div>
            </div>
          </div>

          {/* Per-Platform Order Cards */}
          {Object.entries(activeOption.perPlatform).map(([pid, plan]) => {
            const meta = PLATFORM_METADATA[pid as keyof typeof PLATFORM_METADATA];
            return (
              <div
                key={pid}
                className="bg-white rounded-2xl border border-brand-border shadow-xs overflow-hidden"
              >
                {/* Platform Order Header */}
                <div className="p-4 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: meta.brandColor }}
                    />
                    <div>
                      <h4 className="font-bold text-brand-navy text-sm">{plan.platformName}</h4>
                      <span className="text-[11px] text-gray-500">
                        {plan.itemCount} items • Delivery & handling included
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-brand-navy">
                      Cart Total: <strong className="text-brand-green">₹{plan.estimatedTotalRupees}</strong>
                    </span>
                    {plan.hasUnknownFee && (
                      <span className="block text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded mt-0.5">
                        Unknown fee: verify in app
                      </span>
                    )}
                  </div>
                </div>

                {/* Items in this cart */}
                <div className="p-4 divide-y divide-gray-100">
                  {plan.items.map((it) => (
                    <div key={it.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-brand-navy">{it.matchedTitle}</div>
                        <div className="text-[11px] text-gray-400">
                          {it.brand} • {it.packSize} • Qty: {it.quantity}
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          <span className="font-bold text-brand-navy block">₹{it.totalPriceRupees}</span>
                          <span className="text-[10px] text-gray-400">₹{it.unitPriceRupees} ea</span>
                        </div>

                        {/* Substitution Demo Trigger */}
                        <button
                          onClick={() => {
                            setActiveSub({
                              requestedTitle: it.matchedTitle,
                              requestedBrand: it.brand,
                              requestedVariant: it.variant,
                              requestedPriceRupees: it.unitPriceRupees,
                              substituteTitle: `Alternative Organic ${it.matchedTitle.split(" ")[0]}`,
                              substituteBrand: "EcoFarm",
                              substituteVariant: "Pure Eco Grade",
                              substitutePriceRupees: Math.max(10, it.unitPriceRupees - 8),
                              savingsRupees: 8,
                            });
                            setSubModalOpen(true);
                          }}
                          className="text-[10px] text-brand-green font-bold hover:underline px-2 py-1 rounded bg-brand-green-light"
                        >
                          Check Alt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Platform Fee Row */}
                <div className="bg-gray-50 p-3 px-4 text-[11px] text-gray-600 flex flex-wrap items-center justify-between border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <span>Subtotal: <strong>₹{plan.subtotalRupees}</strong></span>
                    <span>Delivery: <strong>{plan.deliveryFeeRupees === 0 ? "FREE" : `₹${plan.deliveryFeeRupees}`}</strong></span>
                    <span>
                      Handling:{" "}
                      {plan.hasUnknownFee ? (
                        <span className="text-amber-700 font-bold bg-amber-100 px-1 rounded">
                          ₹5 – ₹15 (Unknown)
                        </span>
                      ) : (
                        <strong>₹{plan.handlingFeeRupees}</strong>
                      )}
                    </span>
                    <span>Platform: <strong>₹{plan.platformFeeRupees}</strong></span>
                  </div>

                  <span className="text-[10px] text-gray-400">
                    {plan.meetsMinimumOrder ? "✓ Meets Min Order" : "⚠️ Below Min Order"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Comprehensive Fee Breakdown & Checkout Action (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-xs space-y-5">
            <h3 className="font-bold text-brand-navy text-sm pb-3 border-b border-gray-100">
              Total Cost Breakdown (Estimate)
            </h3>

            {/* Line items for all fees */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-gray-600">
                <span>Items Subtotal:</span>
                <span className="font-bold text-brand-navy">₹{activeOption.subtotalRupees}</span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-gray-400" /> Delivery Fees:
                </span>
                <span className="font-bold text-brand-navy">
                  {activeOption.estimatedFees.deliveryRupees === 0
                    ? "FREE"
                    : `₹${activeOption.estimatedFees.deliveryRupees}`}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>Handling Fees:</span>
                {activeOption.unknownFees ? (
                  <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    ₹5 – ₹15 (Unknown Fee)
                  </span>
                ) : (
                  <span className="font-bold text-brand-navy">
                    ₹{activeOption.estimatedFees.handlingRupees}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>Platform Convenience Fees:</span>
                <span className="font-bold text-brand-navy">
                  ₹{activeOption.estimatedFees.platformRupees}
                </span>
              </div>

              {activeOption.verifiedDiscountsRupees > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Discounts Applied:</span>
                  <span className="font-bold">-₹{activeOption.verifiedDiscountsRupees}</span>
                </div>
              )}
            </div>

            {/* Unknown Fee Banner Note */}
            {activeOption.unknownFees && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Unknown Fee Disclosure</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {activeOption.unknownFees.message}. Under GroqAI non-negotiable rules, missing fees are never treated as ₹0.
                </p>
              </div>
            )}

            {/* Total Row */}
            <div className="pt-4 border-t border-gray-100 flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Estimated Net Total
                </span>
                <span className="text-2xl font-black text-brand-green">
                  ₹{activeOption.estimatedTotalRupees}
                </span>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                MOCK ESTIMATE
              </span>
            </div>

            {/* Coverage Note */}
            <div className="p-3 bg-gray-50 rounded-xl text-[11px] text-gray-500 space-y-1">
              <div>
                Catalog Coverage:{" "}
                <strong className="text-brand-navy">
                  {activeOption.dataCoverage.matchedItems}/{activeOption.dataCoverage.totalItems} items ({activeOption.dataCoverage.percentage}%)
                </strong>
              </div>
              <div className="text-[10px] text-gray-400">
                Prices and availability observed within 6 hours. Final total verified at merchant checkout.
              </div>
            </div>

            {/* Proceed Button */}
            <button
              onClick={handleProceedToHandoff}
              className="w-full bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold py-3.5 rounded-full flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span>Proceed to Purchase Checklist</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Substitution Modal */}
      <SubstitutionModal
        isOpen={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        substitution={activeSub}
        onConfirmSwap={() => {
          // Confirmed swap
          setSubModalOpen(false);
        }}
      />
    </div>
  );
};
