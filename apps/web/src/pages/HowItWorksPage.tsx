import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowRight, CheckCircle2, Split, Database, AlertCircle } from "lucide-react";
import { HowItWorksStrip } from "../components/home/HowItWorksStrip.js";

export const HowItWorksPage: React.FC = () => {
  return (
    <div className="max-w-container mx-auto px-4 py-8 space-y-12">
      {/* Page Header */}
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-brand-navy">How GroqAI Works</h1>
        <p className="text-sm text-brand-grey mt-2 leading-relaxed">
          GroqAI is designed to eliminate grocery price arbitrage in Indian quick commerce. Learn how our multi-platform optimizer works, our non-negotiable fee rules, and why your credentials and payment data are 100% secure.
        </p>
      </div>

      {/* 4-Step Process Section */}
      <HowItWorksStrip />

      {/* Core Principles Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm space-y-3">
          <div className="p-3 bg-brand-green-light rounded-xl text-brand-green w-fit">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-brand-navy text-base">Deterministic Integer Math</h3>
          <p className="text-xs text-brand-grey leading-relaxed">
            All prices and optimization totals are calculated in integer paise. We NEVER use AI or LLMs for price truth, arithmetic, or totals.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm space-y-3">
          <div className="p-3 bg-brand-peach rounded-xl text-orange-600 w-fit">
            <Split className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-brand-navy text-base">True Fee Transparency</h3>
          <p className="text-xs text-brand-grey leading-relaxed">
            Quick-commerce platforms add handling, platform, and delivery fees. GroqAI factors in all fees before recommending a split basket.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm space-y-3">
          <div className="p-3 bg-brand-sky rounded-xl text-blue-600 w-fit">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-brand-navy text-base">Zero Password or Payment Access</h3>
          <p className="text-xs text-brand-grey leading-relaxed">
            We never ask for your passwords, OTPs, session cookies, or payment info. You always pay directly on official merchant checkouts.
          </p>
        </div>
      </div>

      {/* Ready to start CTA */}
      <div className="bg-brand-green-light rounded-3xl p-8 sm:p-12 text-center space-y-4 border border-brand-green/20">
        <h2 className="text-2xl sm:text-3xl font-bold text-brand-navy">
          Ready to save on your weekly groceries?
        </h2>
        <p className="text-xs sm:text-sm text-brand-grey max-w-md mx-auto">
          Start building your grocery list now and compare Blinkit, Zepto, Swiggy Instamart, and BigBasket.
        </p>
        <Link
          to="/list"
          className="inline-flex items-center gap-2 bg-brand-green hover:bg-brand-green-hover text-white text-xs sm:text-sm font-bold px-8 py-3.5 rounded-full transition-colors shadow-sm"
        >
          <span>Build Your Grocery List</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};
