import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { useBasket } from "../../context/BasketContext.js";

interface HeroSlide {
  badge: string;
  badgeIcon: React.ReactNode;
  heading: string;
  subheading: string;
  ctaText: string;
  ctaPath: string;
  illustrationType: "basket" | "split" | "compare";
}

export const HeroBanner: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const { pincode, setPincode } = useBasket();
  const [heroPin, setHeroPin] = useState(pincode);
  const navigate = useNavigate();

  const slides: HeroSlide[] = [
    {
      badge: "Smart Split Engine 2.0",
      badgeIcon: <Sparkles className="w-3.5 h-3.5 text-brand-green" />,
      heading: "Find the cheapest cart across quick-commerce",
      subheading:
        "Compare Blinkit, Zepto, Instamart and BigBasket in real-time, then split smartly to maximize savings.",
      ctaText: "Check Prices",
      ctaPath: "/optimize",
      illustrationType: "basket",
    },
    {
      badge: "Fee-Aware Calculations",
      badgeIcon: <Shield className="w-3.5 h-3.5 text-brand-green" />,
      heading: "Never pay hidden delivery or surge surcharges",
      subheading:
        "GroqAI calculates handling, platform and rain surge fees before you order, showing the TRUE final total.",
      ctaText: "Explore List",
      ctaPath: "/list",
      illustrationType: "split",
    },
    {
      badge: "Zero Password Handoff",
      badgeIcon: <Zap className="w-3.5 h-3.5 text-brand-green" />,
      heading: "You always check out directly on the merchant app",
      subheading:
        "We never ask for passwords, OTPs or payment details. Review your basket and pay safely on official checkouts.",
      ctaText: "See How It Works",
      ctaPath: "/how-it-works",
      illustrationType: "compare",
    },
  ];

  // Auto-advance every 5 seconds unless paused
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const handleCheckPrices = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(heroPin)) {
      setPincode(heroPin);
      navigate("/optimize");
    }
  };

  const slide = slides[currentSlide];

  return (
    <section
      className="max-w-container mx-auto px-4 mt-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Promotional Hero Carousel"
    >
      <div className="bg-doodle-pattern rounded-hero p-8 md:p-14 relative overflow-hidden border border-brand-border shadow-sm min-h-[420px] flex flex-col justify-between">
        {/* Decorative background blurs */}
        <div className="absolute -top-12 -right-12 w-80 h-80 bg-brand-green/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -left-16 w-80 h-80 bg-brand-peach/40 rounded-full blur-3xl pointer-events-none"></div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          {/* Left Text & Input */}
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-brand-green/30 text-brand-navy text-xs font-bold shadow-xs">
              {slide.badgeIcon}
              <span>{slide.badge}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-navy leading-tight tracking-tight">
              {slide.heading}
            </h1>

            <p className="text-brand-grey text-base md:text-lg max-w-xl font-medium leading-relaxed">
              {slide.subheading}
            </p>

            {/* Pill-shaped Pincode Input & Action Button */}
            <form onSubmit={handleCheckPrices} className="max-w-md pt-2">
              <div className="flex items-center bg-white rounded-full p-1.5 border-2 border-brand-green/20 focus-within:border-brand-green shadow-md transition-all">
                <div className="flex items-center pl-3 text-brand-grey">
                  <MapPin className="w-5 h-5 text-brand-green mr-2" />
                  <span className="text-xs font-semibold text-gray-400 mr-1">PIN:</span>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={heroPin}
                  onChange={(e) => setHeroPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit Pincode (e.g. 110001)"
                  className="w-full text-sm font-bold text-brand-navy focus:outline-none bg-transparent placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  className="bg-brand-green hover:bg-brand-green-hover text-white text-sm font-bold px-6 py-3 rounded-full transition-colors flex items-center gap-2 shrink-0 shadow-sm"
                >
                  <span>{slide.ctaText}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="flex items-center gap-6 pt-1 text-xs text-brand-grey font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-green"></span>
                <span>Central Delhi & Bengaluru</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-green"></span>
                <span>Deterministic integer math</span>
              </div>
            </div>
          </div>

          {/* Right Hero Illustration Art */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="relative w-72 h-72 sm:w-88 sm:h-88 flex items-center justify-center">
              {/* Outer decorative dashed circle */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-brand-green/40 animate-[spin_60s_linear_infinite]"></div>

              {/* Central Grocery SVG Collage Card */}
              <div className="relative z-10 bg-white/95 backdrop-blur-md p-6 rounded-2xl border border-brand-border shadow-xl text-center max-w-xs">
                <div className="text-6xl mb-2">🛒🥗🍞</div>
                <div className="font-bold text-brand-navy text-lg">Instant Multi-Cart</div>
                <p className="text-xs text-brand-grey mt-1">
                  Blinkit • Zepto • Instamart • BigBasket
                </p>
                <div className="mt-3 py-2 px-3 bg-brand-green-light rounded-xl flex items-center justify-between text-xs font-bold text-brand-navy">
                  <span>Smart Split Savings:</span>
                  <span className="text-brand-green text-sm">Save up to 28%</span>
                </div>
              </div>

              {/* Floating feature pills */}
              <div className="absolute top-4 -left-4 bg-white px-3 py-1.5 rounded-full shadow-lg border border-brand-border text-xs font-bold text-brand-navy flex items-center gap-1.5 animate-bounce">
                <span>⚡ Instant split</span>
              </div>
              <div className="absolute bottom-6 -right-2 bg-white px-3 py-1.5 rounded-full shadow-lg border border-brand-border text-xs font-bold text-brand-green flex items-center gap-1.5">
                <span>🛡️ Zero payment data</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Indicators / Dots */}
        <div className="flex items-center justify-center gap-2 pt-6 z-10">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-2.5 rounded-full transition-all ${
                currentSlide === idx ? "w-8 bg-brand-green" : "w-2.5 bg-gray-300 hover:bg-gray-400"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
