import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Activity, IndianRupee } from "lucide-react";

export const TopBar: React.FC = () => {
  return (
    <div className="border-b border-brand-border py-1.5 text-[11px] text-brand-grey bg-gray-50/70 hidden lg:block">
      <div className="max-w-container mx-auto px-4 flex items-center justify-between">
        {/* Left: Platform Connector & Mode Statuses */}
        <div className="flex items-center gap-2.5 font-medium">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
            <Activity className="w-3 h-3 text-brand-green" /> Ingestion Matrix:
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Blinkit: Headed</span>
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Zepto: Headed</span>
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>BigBasket: Headed</span>
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title="PerimeterX anti-bot protection respected">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Instamart: Manual Assisted</span>
          </span>
        </div>

        {/* Right Info: NullCartAdapter Honest Capability & Platform link */}
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1 text-brand-navy font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-green" />
            <span>Zero Auto-Checkout (NullCartAdapter)</span>
          </span>

          <span className="text-gray-300">|</span>

          <Link to="/platforms" className="hover:text-brand-green transition-colors font-medium">
            Connector Health
          </Link>

          <span className="text-gray-300">|</span>

          <div className="flex items-center gap-1 text-brand-navy font-semibold">
            <IndianRupee className="w-3 h-3 text-brand-green" />
            <span>Integer Paise Truth</span>
          </div>
        </div>
      </div>
    </div>
  );
};
