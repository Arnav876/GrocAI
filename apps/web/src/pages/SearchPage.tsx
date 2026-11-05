import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, SlidersHorizontal, AlertCircle, RefreshCw, PlusCircle } from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import { ProductSummary, SUPPORTED_PLATFORMS, PLATFORM_METADATA } from "@groqai/shared";
import { ProductCard } from "../components/products/ProductCard.js";
import { ManualPriceModal } from "../components/products/ManualPriceModal.js";
import { MOCK_CATEGORIES } from "../fixtures/mockCategories.js";
import { useBasket } from "../context/BasketContext.js";

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const categoryParam = searchParams.get("category") || "";

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const { pincode } = useBasket();

  useEffect(() => {
    setSearchTerm(queryParam);
    setSelectedCategory(categoryParam);
  }, [queryParam, categoryParam]);

  const fetchResults = () => {
    let mounted = true;
    setLoading(true);

    apiClient
      .searchProducts(searchTerm, selectedCategory, false, pincode)
      .then((data) => {
        if (mounted) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  };

  useEffect(() => {
    return fetchResults();
  }, [searchTerm, selectedCategory]);

  /**
   * Live refresh is asynchronous: enqueue real ingestion jobs, wait for the
   * worker to finish, then re-read the catalog. We never claim fresh prices
   * when the jobs are still pending or blocked.
   */
  const handleLiveRefresh = async () => {
    if (refreshing) return;

    const queries = searchTerm
      ? [searchTerm]
      : products.slice(0, 5).map((p) => p.name);
    if (queries.length === 0) {
      setRefreshNotice({ text: "Search for a product before requesting a live refresh.", isError: true });
      return;
    }

    setRefreshing(true);
    setRefreshNotice({ text: `Queued live refresh for ${queries.length} search${queries.length > 1 ? "es" : ""}...` });

    try {
      const enqueued = await apiClient.enqueueRefresh(queries, ["blinkit", "zepto", "bigbasket"], `delhi_${pincode}`);
      const outcome = await apiClient.waitForIngestionJobs(enqueued.jobIds);

      setProducts(await apiClient.searchProducts(searchTerm, selectedCategory, false, pincode));

      if (outcome.completed.length > 0) {
        setRefreshNotice({
          text: `Live refresh completed on ${outcome.completed.length} job${outcome.completed.length > 1 ? "s" : ""}. Prices below reflect the latest verified observations.`,
        });
      } else if (outcome.blocked.length > 0) {
        setRefreshNotice({
          text: "Platforms blocked automated capture (rate limit or login wall). Cached prices were kept unchanged.",
          isError: true,
        });
      } else if (outcome.failed.length > 0) {
        setRefreshNotice({
          text: "Live refresh failed. Cached prices were kept unchanged.",
          isError: true,
        });
      } else {
        setRefreshNotice({
          text: "Refresh is still queued (no worker picked it up yet). Showing cached prices.",
          isError: true,
        });
      }
    } catch (err: any) {
      setRefreshNotice({ text: `Refresh error: ${err.message}. Cached prices were kept.`, isError: true });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({
      ...(searchTerm ? { q: searchTerm } : {}),
      ...(selectedCategory ? { category: selectedCategory } : {}),
    });
  };

  // Filter products by platform and stock
  const filteredProducts = products.filter((p) => {
    if (inStockOnly && p.isOutOfStock) return false;
    if (selectedPlatform !== "all") {
      const platData = p.platformPrices[selectedPlatform as keyof typeof p.platformPrices];
      if (!platData || platData.availability !== "available") return false;
    }
    return true;
  });

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Search Header Banner */}
      <div className="bg-brand-green-light rounded-2xl p-6 mb-8 border border-brand-green/20">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-brand-navy">Search Grocery Catalog</h1>
          <p className="text-xs text-brand-grey mt-1">
            Compare live prices across Blinkit, Zepto, Instamart and BigBasket.
          </p>

          <form onSubmit={handleSearchSubmit} className="mt-4 flex gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-brand-grey absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search milk, ghee, basmati rice, eggs..."
                className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold border border-brand-border focus:outline-none focus:border-brand-green"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-colors shadow-xs"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleLiveRefresh}
              disabled={refreshing}
              className="bg-white border border-brand-green text-brand-green hover:bg-brand-green-light disabled:opacity-50 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
              title="Queue a live refresh through the ingestion worker"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{refreshing ? "Refreshing..." : "Live Refresh"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="bg-white border border-brand-navy/20 hover:border-brand-navy text-brand-navy hover:bg-gray-50 text-xs font-bold px-3 py-2.5 rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
              title="Add Instamart or manual price observation"
            >
              <PlusCircle className="w-3.5 h-3.5 text-brand-green" />
              <span className="hidden sm:inline">+ Add Price</span>
            </button>
          </form>
        </div>
      </div>

      {refreshNotice && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-xs font-semibold flex items-start gap-2 ${
            refreshNotice.isError
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-brand-green-light border-brand-green/20 text-brand-green"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{refreshNotice.text}</span>
        </div>
      )}

      {/* Main Content: Left Filters + Right Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filter Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-brand-border p-5 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-brand-navy text-sm flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-brand-green" /> Filters
              </h3>
              {(selectedCategory || selectedPlatform !== "all" || inStockOnly) && (
                <button
                  onClick={() => {
                    setSelectedCategory("");
                    setSelectedPlatform("all");
                    setInStockOnly(false);
                    setSearchParams({});
                  }}
                  className="text-[11px] text-brand-green font-bold hover:underline"
                >
                  Reset all
                </button>
              )}
            </div>

            {/* Categories */}
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-2.5">Category</label>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                <button
                  onClick={() => {
                    setSelectedCategory("");
                    setSearchParams(searchTerm ? { q: searchTerm } : {});
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                    !selectedCategory ? "bg-brand-green-light text-brand-green font-bold" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span>All Categories</span>
                  <span className="text-[10px] text-gray-400">({products.length})</span>
                </button>
                {MOCK_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setSearchParams({
                        ...(searchTerm ? { q: searchTerm } : {}),
                        category: cat.id,
                      });
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between ${
                      selectedCategory === cat.id
                        ? "bg-brand-green-light text-brand-green font-bold"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{cat.icon} {cat.name}</span>
                    <span className="text-[10px] text-gray-400">({cat.itemCount})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Filter by Single Platform */}
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-xs font-bold text-brand-navy mb-2">Available On</label>
              <div className="space-y-1.5">
                <button
                  onClick={() => setSelectedPlatform("all")}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedPlatform === "all"
                      ? "bg-brand-green-light text-brand-green font-bold"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  All 4 Stores
                </button>
                {SUPPORTED_PLATFORMS.map((pid) => (
                  <button
                    key={pid}
                    onClick={() => setSelectedPlatform(pid)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                      selectedPlatform === pid
                        ? "bg-brand-green-light text-brand-green font-bold"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: PLATFORM_METADATA[pid].brandColor }}
                    />
                    <span>{PLATFORM_METADATA[pid].name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* In-Stock Toggle */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-brand-navy">In-Stock Only</span>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-4 h-4 accent-brand-green rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Product Results Grid */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-medium text-brand-grey">
              Showing <strong className="text-brand-navy font-bold">{filteredProducts.length}</strong> items
              {searchTerm && <span> for "<strong className="text-brand-navy">{searchTerm}</strong>"</span>}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-gray-400">Searching products across catalogs...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-brand-border p-12 text-center space-y-3">
              <div className="text-5xl">🔍</div>
              <h3 className="text-lg font-bold text-brand-navy">No products match your filter</h3>
              <p className="text-xs text-brand-grey max-w-sm mx-auto">
                We couldn't find items matching your search. Try searching for everyday staples like milk, atta, eggs, or oil.
              </p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                  setSelectedPlatform("all");
                  setInStockOnly(false);
                  setSearchParams({});
                }}
                className="bg-brand-green text-white text-xs font-bold px-4 py-2 rounded-full mt-2"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-5">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ManualPriceModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={() => fetchResults()}
        defaultTitle={searchTerm}
        defaultPincode={pincode}
      />
    </div>
  );
};
