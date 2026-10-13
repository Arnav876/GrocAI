import React from "react";
import { Clock, HelpCircle, XCircle } from "lucide-react";
import { PlatformId, ProductSummary, SUPPORTED_PLATFORMS, PLATFORM_METADATA, formatINR } from "@groqai/shared";

interface PlatformChipStripProps {
  product: ProductSummary;
}

export const PlatformChipStrip: React.FC<PlatformChipStripProps> = ({ product }) => {
  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
        <span>Store Prices</span>
        <span className="text-[9px] text-gray-400 lowercase font-normal">updated &lt; 6h</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {SUPPORTED_PLATFORMS.map((pid) => {
          const platData = product.platformPrices[pid];
          const meta = PLATFORM_METADATA[pid];
          const isLowest = product.lowestPlatform === pid && platData?.availability === "available";

          if (!platData) {
            return (
              <div
                key={pid}
                className="flex items-center justify-between text-[10px] px-1.5 py-1 rounded bg-gray-50 text-gray-400 border border-gray-100"
              >
                <span className="font-semibold">{meta.name.split(" ")[0]}</span>
                <span className="flex items-center gap-0.5 text-[9px]">
                  <HelpCircle className="w-2.5 h-2.5" /> Price unavail.
                </span>
              </div>
            );
          }

          if (platData.availability === "unavailable") {
            return (
              <div
                key={pid}
                className="flex items-center justify-between text-[10px] px-1.5 py-1 rounded bg-gray-50 text-gray-400 border border-gray-100"
              >
                <span className="font-semibold">{meta.name.split(" ")[0]}</span>
                <span className="text-red-500 font-semibold text-[9px] flex items-center gap-0.5">
                  <XCircle className="w-2.5 h-2.5" /> Out of stock
                </span>
              </div>
            );
          }

          if (platData.availability === "unknown" || !platData.pricePaise) {
            return (
              <div
                key={pid}
                className="flex items-center justify-between text-[10px] px-1.5 py-1 rounded bg-gray-50 text-amber-600 border border-amber-100"
              >
                <span className="font-semibold">{meta.name.split(" ")[0]}</span>
                <span className="text-[9px] font-medium">Verify in app</span>
              </div>
            );
          }

          return (
            <div
              key={pid}
              className={`flex items-center justify-between text-[10px] px-1.5 py-1 rounded border transition-all ${
                isLowest
                  ? "bg-brand-green-light border-brand-green text-brand-navy font-bold shadow-xs"
                  : "bg-gray-50 border-gray-200 text-gray-600 font-medium"
              }`}
            >
              <span className="truncate max-w-[50px]">{meta.name.split(" ")[0]}</span>
              <div className="flex items-center gap-1">
                {platData.isStale && (
                  <span title="Cached price older than 6h" className="text-amber-500">
                    <Clock className="w-2.5 h-2.5" />
                  </span>
                )}
                <span className={isLowest ? "text-brand-green font-bold" : ""}>
                  {formatINR(platData.pricePaise)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
