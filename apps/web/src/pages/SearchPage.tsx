import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, SlidersHorizontal, AlertCircle } from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import { ProductSummary, SUPPORTED_PLATFORMS, PLATFORM_METADATA } from "@groqai/shared";
import { ProductCard } from "../components/products/ProductCard.js";
import { MOCK_CATEGORIES } from "../fixtures/mockCategories.js";

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

  useEffect(() => {
    setSearchTerm(queryParam);
    setSelectedCategory(categoryParam);
  }, [queryParam, categoryParam]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .searchProducts(searchTerm, selectedCategory)
      .then((data) => {
        if (mounted) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Search failed:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [searchTerm, selectedCategory]);

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
          </form>
        </div>
      </div>

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
    </div>
  );
};
