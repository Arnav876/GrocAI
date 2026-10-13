import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const PromoBanners: React.FC = () => {
  return (
    <section className="max-w-container mx-auto px-4 mt-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Banner 1: Smart Basket Splitting */}
        <div className="bg-brand-cream rounded-2xl p-6 sm:p-7 flex items-center justify-between border border-orange-100 shadow-xs relative overflow-hidden group">
          <div className="space-y-3 z-10 max-w-[65%]">
            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider bg-orange-100 px-2 py-0.5 rounded-full">
              Recommended
            </span>
            <h3 className="font-bold text-brand-navy text-base sm:text-lg leading-snug">
              Smart Basket Splitting
            </h3>
            <p className="text-xs text-brand-grey font-medium leading-relaxed">
              Save more when split savings exceed delivery & platform fees.
            </p>
            <Link
              to="/optimize"
              className="inline-flex items-center gap-1.5 bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-4 py-2 rounded-full transition-colors shadow-xs"
            >
              <span>Optimize Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="text-6xl group-hover:scale-110 transition-transform duration-300 select-none">
            🧺
          </div>
        </div>

        {/* Banner 2: Cheapest Single Platform */}
        <div className="bg-brand-peach rounded-2xl p-6 sm:p-7 flex items-center justify-between border border-rose-100 shadow-xs relative overflow-hidden group">
          <div className="space-y-3 z-10 max-w-[65%]">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider bg-rose-100 px-2 py-0.5 rounded-full">
              Convenience First
            </span>
            <h3 className="font-bold text-brand-navy text-base sm:text-lg leading-snug">
              Cheapest Single Store
            </h3>
            <p className="text-xs text-brand-grey font-medium leading-relaxed">
              One delivery, zero coordination, lowest single merchant total.
            </p>
            <Link
              to="/optimize?strategy=cheapest_single_platform"
              className="inline-flex items-center gap-1.5 bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-4 py-2 rounded-full transition-colors shadow-xs"
            >
              <span>Compare Single</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="text-6xl group-hover:scale-110 transition-transform duration-300 select-none">
            🛵
          </div>
        </div>

        {/* Banner 3: Item-by-Item Cheapest */}
        <div className="bg-brand-sky rounded-2xl p-6 sm:p-7 flex items-center justify-between border border-blue-100 shadow-xs relative overflow-hidden group">
          <div className="space-y-3 z-10 max-w-[65%]">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-100 px-2 py-0.5 rounded-full">
              Full Transparency
            </span>
            <h3 className="font-bold text-brand-navy text-base sm:text-lg leading-snug">
              Item-by-Item Cheapest
            </h3>
            <p className="text-xs text-brand-grey font-medium leading-relaxed">
              See the raw shelf prices across all 4 quick-commerce catalogs.
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-1.5 bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-4 py-2 rounded-full transition-colors shadow-xs"
            >
              <span>Explore Items</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="text-6xl group-hover:scale-110 transition-transform duration-300 select-none">
            📊
          </div>
        </div>
      </div>
    </section>
  );
};
