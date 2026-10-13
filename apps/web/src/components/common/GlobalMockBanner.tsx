import React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";

export const GlobalMockBanner: React.FC = () => {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-900 flex items-center justify-between z-50">
      <div className="max-w-container mx-auto w-full flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-800 tracking-wider uppercase">
            MOCK DATA ENVIRONMENT
          </span>
          <span className="font-medium text-amber-950">
            Simulated catalog feeds for Blinkit, Zepto, Swiggy Instamart & BigBasket.
          </span>
          <span className="hidden md:inline text-amber-700">
            Estimates only — verify prices and availability on merchants' official checkout.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-amber-800">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-green" /> Zero credential storage
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Never processes payments
          </span>
        </div>
      </div>
    </div>
  );
};
