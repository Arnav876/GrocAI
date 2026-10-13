import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  ShoppingBag,
} from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import { ShoppingHandoffResponse, OptimizationStrategy, PLATFORM_METADATA } from "@groqai/shared";

export const HandoffPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const strategy =
    (searchParams.get("strategy") as OptimizationStrategy) || "optimized_multi_platform";

  const [handoff, setHandoff] = useState<ShoppingHandoffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);

    apiClient
      .createShoppingHandoff({
        optimizationId: id,
        strategy,
      })
      .then((res) => {
        if (mounted) {
          setHandoff(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Handoff generation failed:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, strategy]);

  const copyToClipboard = (platformKey: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPlatform(platformKey);
    setTimeout(() => setCopiedPlatform(null), 2500);
  };

  if (loading) {
    return (
      <div className="max-w-container mx-auto px-4 py-20 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full animate-spin mx-auto"></div>
        <h2 className="text-lg font-bold text-brand-navy">Preparing Merchant Handoff...</h2>
        <p className="text-xs text-brand-grey">
          Structuring verified links and copyable checklists for your checkout...
        </p>
      </div>
    );
  }

  if (!handoff) {
    return (
      <div className="max-w-container mx-auto px-4 py-16 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-brand-navy">Handoff Not Available</h2>
        <p className="text-xs text-brand-grey">
          Please run an optimization first to generate a purchase checklist.
        </p>
        <Link
          to="/list"
          className="bg-brand-green text-white text-xs font-bold px-5 py-2.5 rounded-full inline-block mt-2"
        >
          Return to List Builder
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Back button */}
      <div className="mb-6">
        <Link
          to="/optimize"
          className="inline-flex items-center gap-2 text-xs font-bold text-brand-grey hover:text-brand-green transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Optimization Results</span>
        </Link>
      </div>

      {/* Mandatory Non-Negotiable Persistent Notice Banner */}
      <div className="bg-amber-50 rounded-2xl border-2 border-amber-300 p-5 mb-8 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
              Official Checkout Disclaimer & Legal Notice
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed font-semibold">
              {handoff.notice}
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              GroqAI is an optimization tool and NEVER processes payments, completion tokens, or credentials. Use the links and checklists below to review and pay inside each merchant's official application.
            </p>
          </div>
        </div>
      </div>

      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-brand-navy">
          Proceed to Purchase (Checklist & Links)
        </h1>
        <p className="text-xs md:text-sm text-brand-grey mt-1">
          Handoff method: <strong className="text-brand-navy">Links & Checklist (NullCartAdapter Active)</strong> • Plan: {strategy.replace(/_/g, " ")}
        </p>
      </div>

      {/* Grouped by Platform */}
      <div className="space-y-8">
        {handoff.platforms.map((group) => {
          const meta = PLATFORM_METADATA[group.platform];
          const isCopied = copiedPlatform === group.platform;

          return (
            <div
              key={group.platform}
              className="bg-white rounded-2xl border border-brand-border shadow-sm overflow-hidden"
            >
              {/* Group Header */}
              <div className="p-6 bg-gray-50/80 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: meta.brandColor }}
                  />
                  <div>
                    <h3 className="text-lg font-bold text-brand-navy">{group.platformName}</h3>
                    <p className="text-xs text-gray-500">
                      {group.items.length} items to add • Estimated total:{" "}
                      <strong className="text-brand-green">₹{group.estimatedTotalRupees}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Copy Checklist Button */}
                  <button
                    onClick={() => copyToClipboard(group.platform, group.checklistText)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 text-brand-navy transition-colors shadow-xs"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-brand-green" />
                        <span className="text-brand-green font-bold">List Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-gray-500" />
                        <span>Copy Checklist</span>
                      </>
                    )}
                  </button>

                  {/* Open Official App/Store Link */}
                  <a
                    href={group.cartReviewUrl || meta.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-brand-green hover:bg-brand-green-hover text-white transition-colors shadow-xs"
                  >
                    <span>Open {meta.name.split(" ")[0]}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Items List */}
              <div className="p-6">
                <div className="mb-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Items to Add in {group.platformName} Cart:
                </div>

                <div className="divide-y divide-gray-100">
                  {group.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-brand-navy text-sm">{it.title}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Qty: <strong className="text-brand-navy">{it.quantity}</strong> • Estimated: ₹{it.totalPriceRupees}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                          {it.isDeepLink ? "Direct Product Link" : "Search Query Link"}
                        </span>
                        <a
                          href={it.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-green hover:text-brand-green-hover font-bold text-xs hover:underline"
                        >
                          <span>Find Item</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pre-formatted checklist text preview */}
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                    Quick Copy Text Format:
                  </span>
                  <pre className="p-3 bg-gray-50 rounded-xl text-[11px] font-mono text-gray-700 whitespace-pre-wrap border border-gray-200">
                    {group.checklistText}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
