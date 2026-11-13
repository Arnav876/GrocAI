import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Sparkles,
  X,
  Plus,
  Check,
  Volume2,
  VolumeX,
  ExternalLink,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { apiClient } from "../../services/apiClient.js";
import { useBasket } from "../../context/BasketContext.js";
import { ProductSummary, formatINR, PLATFORM_METADATA, PlatformId } from "@groqai/shared";
import { soundEffects } from "../../services/soundEffects.js";

interface BrowserOmnibarProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const BrowserOmnibar: React.FC<BrowserOmnibarProps> = ({
  isOpen,
  onClose,
  initialQuery = "",
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [soundEnabled, setSoundEnabled] = useState(soundEffects.getSoundEnabled());
  const [obscuraMode, setObscuraMode] = useState(false);
  const [obscuraTestStatus, setObscuraTestStatus] = useState<string | null>(null);

  const { pincode, addProduct } = useBasket();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or custom event
          window.dispatchEvent(new CustomEvent("open-browser-omnibar"));
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search query
  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      // Pre-load popular suggestions if search is blank
      apiClient
        .searchProducts("", undefined, false, pincode)
        .then((data) => setResults(data.slice(0, 6)))
        .catch(() => setResults([]));
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      apiClient
        .searchProducts(query.trim(), undefined, false, pincode)
        .then((data) => {
          setResults(data);
          setLoading(false);
          if (data.length > 0) {
            soundEffects.playSearchCompleteSound();
          }
        })
        .catch(() => {
          setLoading(false);
          setResults([]);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen, pincode]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.setSoundEnabled(next);
    if (next) {
      soundEffects.playTaskCompleteSound();
    }
  };

  const handleAddProduct = (prod: ProductSummary) => {
    addProduct(prod, 1);
    setAddedIds((prev) => ({ ...prev, [prod.id]: true }));
    soundEffects.playAddToCartSound();

    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [prod.id]: false }));
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      soundEffects.playTaskCompleteSound();
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      onClose();
    }
  };

  const handleRunObscuraTest = async () => {
    setLoading(true);
    setObscuraTestStatus("Connecting to Obscura stealth browser engine...");
    try {
      const res = await fetch("http://localhost:5001/api/admin/obscura/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://httpbin.org/get" }),
      });
      const data = await res.json();
      if (data.success) {
        setObscuraTestStatus(`Obscura verified in ${data.durationMs}ms: Browser engine active!`);
        soundEffects.playTaskCompleteSound();
      } else {
        setObscuraTestStatus(`Obscura returned: ${data.error}`);
        soundEffects.playErrorSound();
      }
    } catch (err: any) {
      setObscuraTestStatus(`Connection error: ${err.message}`);
      soundEffects.playErrorSound();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in">
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Browser Omnibar Header / Input */}
        <form onSubmit={handleSubmit} className="border-b border-gray-100 relative">
          <div className="flex items-center px-4 py-3.5 gap-3">
            <div className="p-2 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search grocery products across Blinkit, Zepto, Instamart, BigBasket..."
              className="flex-1 text-base sm:text-lg font-medium text-brand-navy placeholder:text-gray-400 focus:outline-none bg-transparent"
            />

            {loading && <Loader2 className="w-5 h-5 text-brand-green animate-spin" />}

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={handleToggleSound}
              title={soundEnabled ? "Task completion sounds enabled" : "Sounds muted"}
              className={`p-2 rounded-lg transition-colors ${
                soundEnabled
                  ? "text-brand-green hover:bg-brand-green-light"
                  : "text-gray-400 hover:bg-gray-100"
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subheader controls */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50/80 text-xs text-brand-grey border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-semibold text-brand-navy">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Delivery Pincode: {pincode}
              </span>

              <button
                type="button"
                onClick={() => setObscuraMode(!obscuraMode)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  obscuraMode
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Obscura Stealth Mode</span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-gray-200/80 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-mono">
                ESC to close
              </span>
              <span className="bg-gray-200/80 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-mono">
                ENTER to view all
              </span>
            </div>
          </div>
        </form>

        {/* Obscura Diagnostics Panel (when toggled) */}
        {obscuraMode && (
          <div className="bg-purple-50/70 border-b border-purple-100 p-3.5 px-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-purple-900">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>
                <strong>Obscura Headless Engine:</strong> Bypasses anti-bot defenses with 30MB memory footprint.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRunObscuraTest}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test Obscura Engine</span>
            </button>
          </div>
        )}

        {obscuraTestStatus && (
          <div className="bg-purple-100/80 text-purple-900 px-4 py-2 text-xs font-medium border-b border-purple-200 flex items-center justify-between">
            <span>{obscuraTestStatus}</span>
            <button
              onClick={() => setObscuraTestStatus(null)}
              className="text-purple-700 hover:text-purple-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="overflow-y-auto flex-1 p-3 divide-y divide-gray-50">
          {results.length === 0 && !loading && (
            <div className="text-center py-12 text-brand-grey">
              <Search className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-brand-navy">No products found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try searching for items like "Amul milk", "onions", "butter", or "eggs".
              </p>
            </div>
          )}

          {results.map((product) => {
            const isAdded = addedIds[product.id];
            const platformName = product.lowestPlatform
              ? PLATFORM_METADATA[product.lowestPlatform as PlatformId]?.name || product.lowestPlatform
              : "Multiple Stores";

            return (
              <div
                key={product.id}
                className="py-3 px-3 hover:bg-gray-50/80 rounded-xl transition-colors flex items-center justify-between gap-4 group"
              >
                {/* Product details */}
                <div
                  className="flex items-center gap-3.5 flex-1 min-w-0 cursor-pointer"
                  onClick={() => {
                    soundEffects.playTaskCompleteSound();
                    navigate(`/compare/${product.id}`);
                    onClose();
                  }}
                >
                  <div className="w-12 h-12 bg-white border border-gray-100 rounded-lg p-1 flex items-center justify-center shrink-0 shadow-xs">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xl">🛒</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-brand-grey uppercase tracking-wider">
                        {product.brand}
                      </span>
                      {product.discountPercentage ? (
                        <span className="text-[10px] bg-red-50 text-red-600 font-bold px-1.5 py-0.2 rounded">
                          {product.discountPercentage}% OFF
                        </span>
                      ) : null}
                    </div>

                    <h4 className="text-sm font-bold text-brand-navy truncate group-hover:text-brand-green transition-colors">
                      {product.name}
                    </h4>

                    <div className="flex items-center gap-2 text-xs mt-0.5">
                      <span className="text-brand-grey font-medium">{product.packSize}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                        Lowest on {platformName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Price and Add button */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-extrabold text-brand-navy">
                      {formatINR(product.lowestPriceRupees)}
                    </div>
                    {product.mrpRupees && product.mrpRupees > product.lowestPriceRupees && (
                      <div className="text-[11px] text-gray-400 line-through">
                        {formatINR(product.mrpRupees)}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddProduct(product)}
                    className={`p-2 sm:px-3 sm:py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                      isAdded
                        ? "bg-brand-navy text-white"
                        : "bg-brand-green hover:bg-brand-green-hover text-white active:scale-95"
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Added!</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-3 px-4 bg-gray-50 flex items-center justify-between text-xs text-brand-grey">
          <span>
            Search results updated deterministically with real-time Indian quick-commerce pricing.
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            className="font-bold text-brand-green hover:underline flex items-center gap-1"
          >
            <span>View all matching items</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
