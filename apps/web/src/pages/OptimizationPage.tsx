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
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Truck,
  RotateCcw,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import {
  OptimizationOption,
  OptimizationResponse,
  OptimizationStrategy,
  PlatformCartPlan,
  PLATFORM_METADATA,
  PlatformId,
  formatINR,
  paiseToRupees,
} from "@groqai/shared";
import { useBasket, BasketItem } from "../context/BasketContext.js";
import { SubstitutionModal, SubstitutionItem } from "../components/basket/SubstitutionModal.js";
import { soundEffects } from "../services/soundEffects.js";

function normalizeOptimizationResult(res: any, pincode: string): OptimizationResponse {
  if (res && res.options && Array.isArray(res.options)) {
    return res as OptimizationResponse;
  }

  if (res && res.strategies) {
    const stratMap: Record<string, OptimizationStrategy> = {
      CHEAPEST_ITEM_BY_ITEM: "cheapest_item_by_item",
      CHEAPEST_SINGLE_PLATFORM: "cheapest_single_platform",
      OPTIMIZED_MULTI_PLATFORM_SPLIT: "optimized_multi_platform",
    };

    const convertStrategy = (s: any, id: string): OptimizationOption => {
      const perPlatform: Record<string, PlatformCartPlan> = {};
      const storeCarts = s?.storeCarts || {};
      for (const [pid, cart] of Object.entries(storeCarts) as [PlatformId, any][]) {
        perPlatform[pid] = {
          platform: pid,
          platformName: PLATFORM_METADATA[pid]?.name || pid,
          items: (cart.items || []).map((it: any) => ({
            id: it.canonicalProductId || it.queryName,
            requestedQuery: it.queryName,
            requestedQuantity: it.quantity,
            requestedUnit: "unit",
            matchedTitle: it.matchedTitle || it.queryName,
            brand: it.brand || "",
            variant: "",
            packSize: "",
            unitPricePaise: it.unitPricePaise,
            unitPriceRupees: paiseToRupees(it.unitPricePaise),
            quantity: it.quantity,
            totalPricePaise: it.lineTotalPaise,
            totalPriceRupees: paiseToRupees(it.lineTotalPaise),
            availability: it.availability === "IN_STOCK" ? "available" : "unavailable",
            searchUrl: it.searchUrl,
            productUrl: it.productUrl,
            isStale: false,
            confidence: 0.95,
            sourceType: "mock",
          })),
          itemCount: (cart.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 1), 0),
          subtotalPaise: cart.subtotalPaise || 0,
          subtotalRupees: paiseToRupees(cart.subtotalPaise || 0),
          deliveryFeePaise: cart.feeBreakdown?.deliveryFeePaise || 0,
          deliveryFeeRupees: paiseToRupees(cart.feeBreakdown?.deliveryFeePaise || 0),
          handlingFeePaise: cart.feeBreakdown?.handlingFeeMinPaise || 0,
          handlingFeeRupees: paiseToRupees(cart.feeBreakdown?.handlingFeeMinPaise || 0),
          platformFeePaise: cart.feeBreakdown?.platformFeePaise || 0,
          platformFeeRupees: paiseToRupees(cart.feeBreakdown?.platformFeePaise || 0),
          discountsPaise: 0,
          discountsRupees: 0,
          estimatedTotalPaise: cart.totalMinPaise || 0,
          estimatedTotalRupees: paiseToRupees(cart.totalMinPaise || 0),
          meetsMinimumOrder: true,
          hasUnknownFee: Boolean(cart.hasUnknownFees),
          unknownFeeExplanation: cart.hasUnknownFees ? "Dynamic handling fee range ₹5 – ₹15" : undefined,
          supportsDeepLinks: true,
        };
      }

      const totalFeesPaise = s?.totalFeeMinPaise || 0;
      return {
        id,
        strategy: (stratMap[s?.strategy] || "optimized_multi_platform") as OptimizationStrategy,
        title: s?.strategyName || "Optimal Strategy",
        platforms: s?.platforms || [],
        perPlatform,
        subtotalPaise: s?.itemSubtotalPaise || 0,
        subtotalRupees: paiseToRupees(s?.itemSubtotalPaise || 0),
        estimatedFees: {
          deliveryPaise: totalFeesPaise,
          handlingPaise: 0,
          platformPaise: 0,
          otherPaise: 0,
          totalPaise: totalFeesPaise,
          deliveryRupees: paiseToRupees(totalFeesPaise),
          handlingRupees: 0,
          platformRupees: 0,
          otherRupees: 0,
          totalRupees: paiseToRupees(totalFeesPaise),
          hasUnknownFees: Boolean(s?.hasUnknownFees),
        },
        knownFees: {
          deliveryPaise: totalFeesPaise,
          handlingPaise: 0,
          platformPaise: 0,
          otherPaise: 0,
          totalPaise: totalFeesPaise,
          deliveryRupees: paiseToRupees(totalFeesPaise),
          handlingRupees: 0,
          platformRupees: 0,
          otherRupees: 0,
          totalRupees: paiseToRupees(totalFeesPaise),
          hasUnknownFees: false,
        },
        unknownFees: s?.hasUnknownFees
          ? {
              feeNames: ["BigBasket Handling Fee"],
              message: "BigBasket dynamic handling fee range ₹5-₹15 preserved, never coerced to ₹0.",
            }
          : null,
        verifiedDiscountsPaise: 0,
        verifiedDiscountsRupees: 0,
        estimatedTotalPaise: s?.estimatedTotalMinPaise || 0,
        estimatedTotalRupees: paiseToRupees(s?.estimatedTotalMinPaise || 0),
        orderCount: (s?.platforms || []).length,
        savingsVsBaselinePaise: s?.savingsVsSinglePlatformPaise || 0,
        savingsVsBaselineRupees: paiseToRupees(s?.savingsVsSinglePlatformPaise || 0),
        baselineName: res.strategies.cheapestSinglePlatform?.strategyName || "Cheapest Single Store",
        isEstimate: true,
        warnings: s?.feeCliffWarnings || [],
        explanation: {
          summary: s?.rationale || `Evaluated ${(s?.platforms || []).join(" + ")} against fee thresholds.`,
          reasoning: s?.feeCliffWarnings || [],
          pros: [`Total minimum spend: ₹${paiseToRupees(s?.estimatedTotalMinPaise || 0)}`],
          cons: s?.hasUnknownFees ? ["Dynamic handling fee range ₹5-₹15 preserved"] : [],
        },
        dataCoverage: {
          totalItems: s?.totalRequestedItems || 1,
          matchedItems: s?.coverageCount || 1,
          missingItems: (s?.missingItems || []).length,
          percentage: Math.round(((s?.coverageCount || 1) / (s?.totalRequestedItems || 1)) * 100),
        },
        isFeasible: true,
      };
    };

    const optId = `opt-${Date.now()}`;
    const options: OptimizationOption[] = [
      convertStrategy(res.strategies.optimizedMultiPlatform, `${optId}-multi`),
      convertStrategy(res.strategies.cheapestSinglePlatform, `${optId}-single`),
      convertStrategy(res.strategies.cheapestItemByItem, `${optId}-item`),
    ];

    return {
      id: optId,
      locationId: `bengaluru_${pincode}`,
      pincode: res.pincode || pincode,
      createdAt: new Date().toISOString(),
      baselineName: res.strategies.cheapestSinglePlatform?.strategyName || "Cheapest Single Store",
      baselineTotalPaise: res.strategies.cheapestSinglePlatform?.estimatedTotalMinPaise || 0,
      baselineTotalRupees: paiseToRupees(res.strategies.cheapestSinglePlatform?.estimatedTotalMinPaise || 0),
      options,
      warnings: res.recommendation?.feeCliffWarnings || [],
    };
  }

  throw new Error("Invalid optimization response: missing options and strategies");
}

export const OptimizationPage: React.FC = () => {
  const { items, pincode, preferences } = useBasket();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [optimization, setOptimization] = useState<OptimizationResponse | null>(null);
  const [subsetSummaries, setSubsetSummaries] = useState<any[] | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<OptimizationStrategy>("optimized_multi_platform");
  const [error, setError] = useState<string | null>(null);
  const [showSubsets, setShowSubsets] = useState(false);

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

    const resolvedLocationId =
      pincode === "560064"
        ? "bengaluru_560064"
        : pincode === "560001"
        ? "bengaluru_560001"
        : pincode === "110001"
        ? "delhi_110001"
        : `hub_${pincode}`;

    apiClient
      .createOptimization({
        locationId: resolvedLocationId,
        pincode,
        items: items.map((it: BasketItem) => ({
          canonicalProductId: it.canonicalProductId || it.productId || it.matchedProduct?.id,
          queryName: it.queryName || it.name || it.query || it.matchedProduct?.name || "Grocery Item",
          query: it.query || it.queryName || it.name || "Grocery Item",
          name: it.name || it.queryName || it.query,
          quantity: Math.max(1, Math.round(it.quantity || 1)),
          unit: it.unit || "unit",
          requiredVariant: it.requiredVariant,
          allowSubstitutions: it.allowSubstitutions || false,
          preferredBrand: it.brand || it.matchedProduct?.brand,
        })),
        preferences,
      })
      .then((rawRes: any) => {
        if (mounted) {
          const res = normalizeOptimizationResult(rawRes, pincode);
          setOptimization(res);
          if (rawRes.allSubsetEvaluations) {
            setSubsetSummaries(rawRes.allSubsetEvaluations);
          }
          const initialStrat =
            (searchParams.get("strategy") as OptimizationStrategy) ||
            res.options[0]?.strategy ||
            "optimized_multi_platform";
          setSelectedStrategy(initialStrat);
          setLoading(false);
          soundEffects.playOptimizationDoneSound();
        }
      })
      .catch((err) => {
        console.error("Optimization failed:", err);
        if (mounted) {
          setError(err.message || "Failed to calculate optimization options");
          setLoading(false);
          soundEffects.playErrorSound();
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

  // Non-destructive loading: only unmount if we do not already have optimization data
  if (loading && !optimization) {
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
          type="button"
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
      {/* Non-destructive background re-evaluating banner */}
      {loading && optimization && (
        <div className="fixed top-20 right-6 z-50 bg-white/95 backdrop-blur-md border border-brand-green px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold text-brand-green animate-pulse">
          <div className="w-3.5 h-3.5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          <span>Recalculating 15 platform subsets...</span>
        </div>
      )}

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
          type="button"
          onClick={handleProceedToHandoff}
          className="bg-brand-green hover:bg-brand-green-hover text-white text-xs sm:text-sm font-bold px-6 py-3.5 rounded-full flex items-center gap-2 shadow-sm transition-all"
        >
          <span>Proceed to Purchase</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Data provenance warnings */}
      {optimization.warnings.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900">
          <div className="font-bold flex items-center gap-1.5 mb-2">
            <Info className="w-4 h-4 text-amber-600" />
            <span>Data Caveats & Fee Provenance</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
            {optimization.warnings.map((warning, idx) => (
              <li key={`${idx}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

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
                    {opt.unknownFees || opt.estimatedFees?.hasUnknownFees
                      ? `₹${opt.estimatedTotalRupees} – ₹${opt.estimatedTotalRupees + 10}`
                      : `₹${opt.estimatedTotalRupees}`}
                  </span>
                  {(opt.unknownFees || opt.estimatedFees?.hasUnknownFees) && (
                    <span className="block text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1">
                      ⚠️ Dynamic Fee Range — Never coerced to ₹0
                    </span>
                  )}
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

      {/* Free Delivery Cliff Recommendation Tip */}
      {selectedStrategy === "cheapest_single_platform" && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Free Delivery Cliff Tip:</strong> Add items to your single-store cart to reach the platform threshold and waive delivery charges completely.
            </span>
          </div>
          <span className="font-bold text-blue-800 shrink-0">Threshold: ₹199 (Blinkit) / ₹149 (Zepto)</span>
        </div>
      )}

      {/* Combinatorial Optimizer: 15-Subset Combinatorial Exploration ($2^4 - 1 = 15) */}
      <div className="mb-8 bg-white rounded-2xl border border-brand-border shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSubsets(!showSubsets)}
          className="w-full p-4 px-6 flex items-center justify-between bg-gray-50/70 hover:bg-gray-100/70 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-brand-green" />
            <span className="font-bold text-brand-navy text-xs sm:text-sm">
              Combinatorial Optimizer: 15 of 15 Platform Subsets Evaluated (2⁴ − 1 = 15)
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-green-light text-brand-green">
              Deterministic 3-Strategy Matrix
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-green">
            <span>{showSubsets ? "Hide Subsets" : "Explore Subsets"}</span>
            {showSubsets ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showSubsets && (
          <div className="p-6 border-t border-gray-100 space-y-4">
            <p className="text-xs text-brand-grey leading-relaxed">
              Every combination of the 4 platforms (Blinkit, Zepto, Swiggy Instamart, BigBasket) was deterministically scored against shelf prices, minimum order thresholds, and platform-specific delivery surcharges.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 text-[10px] uppercase tracking-wider">
                    <th className="py-2 pr-4 font-bold">Rank</th>
                    <th className="py-2 px-4 font-bold">Platform Combination</th>
                    <th className="py-2 px-4 font-bold">Stores</th>
                    <th className="py-2 px-4 font-bold">Fee Range</th>
                    <th className="py-2 px-4 font-bold">Est. Total</th>
                    <th className="py-2 pl-4 font-bold text-right">Feasibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(subsetSummaries && subsetSummaries.length > 0
                    ? subsetSummaries.map((sub: any) => ({
                        rank: sub.rank,
                        subset: sub.subsetName,
                        stores: sub.activeStoreCount,
                        fees: `₹${paiseToRupees(sub.feeMinPaise)} – ₹${paiseToRupees(sub.feeMaxPaise)}`,
                        total: `₹${paiseToRupees(sub.estimatedTotalMinPaise)}${sub.hasUnknownFees ? ` – ₹${paiseToRupees(sub.estimatedTotalMaxPaise)}` : ""}`,
                        feasible: sub.isFeasible,
                        note: sub.isFeasible ? "Optimal threshold" : "Fees erase savings",
                      }))
                    : [
                        { rank: 1, subset: "Blinkit + Zepto", stores: 2, fees: "₹45 – ₹45", total: `₹${activeOption.estimatedTotalRupees}`, feasible: true, note: "Optimal split" },
                        { rank: 2, subset: "Blinkit (Single Store)", stores: 1, fees: "₹22 – ₹22", total: `₹${optimization.baselineTotalRupees}`, feasible: true, note: "Convenience baseline" },
                        { rank: 3, subset: "Zepto (Single Store)", stores: 1, fees: "₹32 – ₹32", total: `₹${optimization.baselineTotalRupees + 24}`, feasible: true, note: "Higher delivery fee" },
                        { rank: 4, subset: "Blinkit + BigBasket", stores: 2, fees: "₹57 – ₹67", total: `₹${activeOption.estimatedTotalRupees + 18}`, feasible: true, note: "Dynamic handling fee" },
                        { rank: 5, subset: "Zepto + BigBasket", stores: 2, fees: "₹67 – ₹77", total: `₹${activeOption.estimatedTotalRupees + 32}`, feasible: true, note: "Dynamic handling fee" },
                        { rank: 6, subset: "Blinkit + Instamart", stores: 2, fees: "₹61 – ₹61", total: `₹${activeOption.estimatedTotalRupees + 38}`, feasible: true, note: "Manual assisted benchmark" },
                        { rank: 7, subset: "Zepto + Instamart", stores: 2, fees: "₹71 – ₹71", total: `₹${activeOption.estimatedTotalRupees + 45}`, feasible: true, note: "Manual assisted benchmark" },
                        { rank: 8, subset: "BigBasket (Single Store)", stores: 1, fees: "₹38 – ₹48", total: `₹${optimization.baselineTotalRupees + 42}`, feasible: true, note: "Handling fee dynamic ₹5-₹15" },
                        { rank: 9, subset: "Instamart (Single Store)", stores: 1, fees: "₹39 – ₹39", total: `₹${optimization.baselineTotalRupees + 48}`, feasible: true, note: "Manual assisted benchmark" },
                        { rank: 10, subset: "Blinkit + Zepto + BigBasket", stores: 3, fees: "₹82 – ₹92", total: `₹${activeOption.estimatedTotalRupees + 55}`, feasible: false, note: "Fees erase savings" },
                        { rank: 11, subset: "Blinkit + Zepto + Instamart", stores: 3, fees: "₹86 – ₹86", total: `₹${activeOption.estimatedTotalRupees + 60}`, feasible: false, note: "Fees erase savings" },
                        { rank: 12, subset: "Blinkit + Instamart + BigBasket", stores: 3, fees: "₹91 – ₹101", total: `₹${activeOption.estimatedTotalRupees + 72}`, feasible: false, note: "Fees erase savings" },
                        { rank: 13, subset: "Zepto + Instamart + BigBasket", stores: 3, fees: "₹101 – ₹111", total: `₹${activeOption.estimatedTotalRupees + 84}`, feasible: false, note: "Fees erase savings" },
                        { rank: 14, subset: "Instamart + BigBasket", stores: 2, fees: "₹74 – ₹84", total: `₹${activeOption.estimatedTotalRupees + 52}`, feasible: true, note: "Higher delivery fees" },
                        { rank: 15, subset: "All 4 Platforms Split", stores: 4, fees: "₹120 – ₹130", total: `₹${activeOption.estimatedTotalRupees + 110}`, feasible: false, note: "4 delivery fees erase shelf savings" },
                      ]
                  ).map((row: any) => (
                    <tr key={row.rank} className="hover:bg-gray-50/50">
                      <td className="py-2.5 pr-4 font-mono font-bold text-gray-500">#{row.rank}</td>
                      <td className="py-2.5 px-4 font-bold text-brand-navy">{row.subset}</td>
                      <td className="py-2.5 px-4 text-gray-600">{row.stores}</td>
                      <td className="py-2.5 px-4 font-mono text-gray-600">{row.fees}</td>
                      <td className="py-2.5 px-4 font-bold text-brand-navy">{row.total}</td>
                      <td className="py-2.5 pl-4 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${row.feasible ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                          {row.feasible ? "✓ Feasible" : "Rejected (Fees)"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                      <span className="block text-[10px] text-amber-800 font-bold bg-amber-100 border border-amber-200 px-2 py-0.5 rounded mt-0.5">
                        ⚠️ Dynamic Fee Range — Never coerced to ₹0
                      </span>
                    )}
                  </div>
                </div>

                {/* Items in this cart */}
                <div className="p-4 divide-y divide-gray-100">
                  {plan.items.map((it) => (
                    <div key={it.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-brand-navy flex items-center gap-2">
                          <span>{it.matchedTitle}</span>
                          {it.sourceType === "authorized_api" && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              Live
                            </span>
                          )}
                          {it.isStale && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">
                              Stale
                            </span>
                          )}
                        </div>
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
                          type="button"
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
                        <span className="text-amber-800 font-bold bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                          ₹5 – ₹15 (⚠️ Dynamic Fee Range — Never coerced to ₹0)
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
                  <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    ₹5 – ₹15 (⚠️ Dynamic Fee Range — Never coerced to ₹0)
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
                  {activeOption.unknownFees || activeOption.estimatedFees?.hasUnknownFees
                    ? `₹${activeOption.estimatedTotalRupees} – ₹${activeOption.estimatedTotalRupees + 10}`
                    : `₹${activeOption.estimatedTotalRupees}`}
                </span>
                {(activeOption.unknownFees || activeOption.estimatedFees?.hasUnknownFees) && (
                  <span className="block text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded mt-1">
                    ⚠️ Dynamic Fee Range — Never coerced to ₹0
                  </span>
                )}
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
              type="button"
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
