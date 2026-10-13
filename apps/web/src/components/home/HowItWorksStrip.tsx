import React from "react";
import { Search, ListPlus, Sliders, ArrowUpRight } from "lucide-react";

export const HowItWorksStrip: React.FC = () => {
  const steps = [
    {
      step: "01",
      title: "Search & Browse",
      desc: "Find your daily groceries with verified live prices across Blinkit, Zepto, Instamart and BigBasket.",
      icon: <Search className="w-6 h-6 text-brand-green" />,
      bg: "bg-brand-green-light",
    },
    {
      step: "02",
      title: "Build Your List",
      desc: "Add items manually or paste natural grocery notes like '2L milk, 12 eggs, 5kg atta' for instant parsing.",
      icon: <ListPlus className="w-6 h-6 text-brand-navy" />,
      bg: "bg-brand-peach",
    },
    {
      step: "03",
      title: "Optimize Cart",
      desc: "Our engine evaluates 15 store combinations, delivery surcharges and platform fees to find the cheapest total.",
      icon: <Sliders className="w-6 h-6 text-brand-green" />,
      bg: "bg-brand-lime",
    },
    {
      step: "04",
      title: "Safe Handoff",
      desc: "Get an itemized checklist with merchant deep links. Review and pay safely on the official app — zero credentials stored.",
      icon: <ArrowUpRight className="w-6 h-6 text-brand-navy" />,
      bg: "bg-brand-sky",
    },
  ];

  return (
    <section className="max-w-container mx-auto px-4 mt-16">
      <div className="text-center max-w-xl mx-auto mb-10">
        <span className="text-xs font-bold text-brand-green uppercase tracking-wider bg-brand-green-light px-3 py-1 rounded-full">
          Simple 4-Step Flow
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-brand-navy mt-2">
          How GroqAI Finds Your Lowest Cost
        </h2>
        <p className="text-xs md:text-sm text-brand-grey mt-1">
          Save up to ₹250 on every weekly shopping run without manually switching between 4 apps.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {steps.map((st, idx) => (
          <div
            key={st.step}
            className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm flex flex-col justify-between relative group hover:border-brand-green transition-colors"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${st.bg} flex items-center justify-center`}>
                  {st.icon}
                </div>
                <span className="text-2xl font-black text-gray-200 group-hover:text-brand-green/30 transition-colors">
                  {st.step}
                </span>
              </div>
              <h3 className="text-base font-bold text-brand-navy">{st.title}</h3>
              <p className="text-xs text-brand-grey mt-2 leading-relaxed">{st.desc}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-[11px] font-semibold text-brand-green">
              <span>Step {idx + 1} of 4</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
