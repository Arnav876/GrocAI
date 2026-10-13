import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, ExternalLink, CheckCircle, XCircle, AlertTriangle, ShoppingCart } from "lucide-react";
import { apiClient } from "../services/apiClient.js";
import {
  ProductSummary,
  SUPPORTED_PLATFORMS,
  PLATFORM_METADATA,
  formatINR,
  formatTimeAgo,
} from "@groqai/shared";
import { useBasket } from "../context/BasketContext.js";

export const ComparisonPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [allProducts, setAllProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { addProduct } = useBasket();

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    apiClient.searchProducts().then((list) => {
      if (!mounted) return;
      setAllProducts(list);
      const targetId = id || list[0]?.id;
      const found = list.find((p) => p.id === targetId) || list[0];
      setProduct(found || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-container mx-auto px-4 py-16 text-center text-sm text-gray-400">
        Loading 4-platform matrix...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-container mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-brand-navy">Product Not Found</h2>
        <Link to="/search" className="text-brand-green font-bold text-sm mt-3 inline-block">
          Return to Search
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Back button */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 text-xs font-bold text-brand-grey hover:text-brand-green transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalog</span>
        </Link>

        {/* Quick Product Switcher */}
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
          <span>Compare Another:</span>
          <select
            value={product.id}
            onChange={(e) => {
              const selected = allProducts.find((p) => p.id === e.target.value);
              if (selected) setProduct(selected);
            }}
            className="border border-brand-border rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-brand-green"
          >
            {allProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.packSize})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Product Overview Header Card */}
      <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-brand-green-light flex items-center justify-center text-4xl shadow-xs">
            🛒
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-grey uppercase tracking-wider">
                {product.brand}
              </span>
              <span className="text-xs text-gray-300">•</span>
              <span className="text-xs font-medium text-gray-500">{product.packSize}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-brand-navy mt-0.5">
              {product.name}
            </h1>
            <p className="text-xs text-brand-grey mt-1">
              Variant: <strong className="text-brand-navy">{product.variant}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-gray-100">
          <div className="text-right">
            <span className="text-[11px] text-gray-400 block font-semibold">Best Shelf Price</span>
            <span className="text-2xl font-black text-brand-green">
              {formatINR(product.lowestPricePaise)}
            </span>
          </div>
          <button
            onClick={() => addProduct(product)}
            className="bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold px-5 py-3 rounded-full flex items-center gap-2 shadow-sm transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Add to Basket</span>
          </button>
        </div>
      </div>

      {/* 4-Platform Detailed Comparison Matrix Table */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-brand-navy">
              Live Store Comparison Across 4 Platforms
            </h2>
            <p className="text-xs text-brand-grey mt-0.5">
              Verified with exact pack size ({product.packSize}) & variant ({product.variant}).
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-brand-green" /> Fresh (&lt; 6h)
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <Clock className="w-3.5 h-3.5 text-amber-500" /> Stale / Cached
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100 text-brand-navy uppercase font-bold text-[11px] tracking-wider">
              <tr>
                <th className="py-4 px-6">Store Platform</th>
                <th className="py-4 px-4">Listed Price</th>
                <th className="py-4 px-4">Effective Discount</th>
                <th className="py-4 px-4">Stock Availability</th>
                <th className="py-4 px-4">Last Checked</th>
                <th className="py-4 px-4">Data Source</th>
                <th className="py-4 px-6 text-right">Official Store Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SUPPORTED_PLATFORMS.map((pid) => {
                const meta = PLATFORM_METADATA[pid];
                const platData = product.platformPrices[pid];
                const isLowest =
                  product.lowestPlatform === pid && platData?.availability === "available";

                return (
                  <tr
                    key={pid}
                    className={`hover:bg-gray-50 transition-colors ${
                      isLowest ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    {/* Platform Brand */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ backgroundColor: meta.brandColor }}
                        />
                        <div>
                          <div className="font-bold text-brand-navy text-sm flex items-center gap-2">
                            <span>{meta.name}</span>
                            {isLowest && (
                              <span className="text-[10px] bg-brand-green text-white font-bold px-2 py-0.2 rounded-full">
                                Lowest Price
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400">Central Delhi Dark Store</span>
                        </div>
                      </div>
                    </td>

                    {/* Listed Price */}
                    <td className="py-4 px-4">
                      {platData && platData.pricePaise ? (
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`text-base font-bold ${
                              isLowest ? "text-brand-green" : "text-brand-navy"
                            }`}
                          >
                            {formatINR(platData.pricePaise)}
                          </span>
                          {product.mrpPaise && product.mrpPaise > platData.pricePaise && (
                            <span className="text-gray-400 line-through text-[11px]">
                              {formatINR(product.mrpPaise)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                          Price unavailable - verify in app
                        </span>
                      )}
                    </td>

                    {/* Discount */}
                    <td className="py-4 px-4">
                      {platData && platData.pricePaise && product.mrpPaise ? (
                        <span className="font-semibold text-rose-600">
                          Save ₹{((product.mrpPaise - platData.pricePaise) / 100).toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Availability */}
                    <td className="py-4 px-4">
                      {platData?.availability === "available" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle className="w-3 h-3 text-brand-green" /> In Stock
                        </span>
                      ) : platData?.availability === "unavailable" ? (
                        <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 font-bold px-2 py-0.5 rounded-full border border-red-200">
                          <XCircle className="w-3 h-3 text-red-500" /> Out of Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-500" /> Unverified
                        </span>
                      )}
                    </td>

                    {/* Freshness */}
                    <td className="py-4 px-4">
                      {platData?.observedAt ? (
                        <div className="flex items-center gap-1.5">
                          {platData.isStale ? (
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-brand-green" />
                          )}
                          <span
                            className={
                              platData.isStale
                                ? "text-amber-700 font-semibold"
                                : "text-gray-600"
                            }
                          >
                            {formatTimeAgo(platData.observedAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="py-4 px-4">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[10px] uppercase font-semibold">
                        {platData?.sourceType || "mock"}
                      </span>
                    </td>

                    {/* Store Link */}
                    <td className="py-4 px-6 text-right">
                      <a
                        href={
                          platData?.searchUrl ||
                          `${meta.searchBaseUrl}${encodeURIComponent(product.name)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-green hover:text-brand-green-hover font-bold hover:underline"
                      >
                        <span>Search on {meta.name.split(" ")[0]}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
