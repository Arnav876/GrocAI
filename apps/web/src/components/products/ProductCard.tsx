import React from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Star, Check } from "lucide-react";
import { ProductSummary, formatINR, PLATFORM_METADATA } from "@groqai/shared";
import { PlatformChipStrip } from "./PlatformChipStrip.js";
import { useBasket } from "../../context/BasketContext.js";

interface ProductCardProps {
  product: ProductSummary;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  dairy: "🥛",
  fruits: "🍎",
  vegetables: "🥦",
  staples: "🌾",
  oils: "🌻",
  snacks: "🍪",
  beverages: "☕",
  bakery: "🍞",
  "eggs-meat": "🥚",
  "personal-care": "🧼",
};

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addProduct, items } = useBasket();

  // Check if item is already in active basket
  const inBasket = items.find(
    (it) => it.query.toLowerCase() === product.name.toLowerCase()
  );

  const emoji = CATEGORY_EMOJIS[product.category] || "🛒";
  const lowestMeta = PLATFORM_METADATA[product.lowestPlatform];

  return (
    <div className="grocery-card bg-white rounded-card border border-brand-border p-4 flex flex-col justify-between relative group shadow-card">
      {/* Top Left Badge */}
      <div className="absolute top-3 left-3 z-10">
        {product.isOutOfStock ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-700 text-white uppercase tracking-wider">
            Out of Stock
          </span>
        ) : product.discountPercentage && product.discountPercentage > 15 ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white tracking-wider">
            Save {product.discountPercentage}%
          </span>
        ) : product.isNew ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-green text-white tracking-wider">
            New
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white tracking-wider">
            Hot Deal
          </span>
        )}
      </div>

      <div>
        {/* Centered Product Illustration */}
        <Link
          to={`/compare/${product.id}`}
          className="block h-36 w-full rounded-xl bg-gray-50 flex items-center justify-center text-5xl group-hover:scale-105 transition-transform duration-300 relative overflow-hidden"
        >
          <span role="img" aria-label={product.name}>
            {emoji}
          </span>
          <span className="absolute bottom-2 right-2 text-[10px] bg-white/90 backdrop-blur-xs font-bold text-gray-500 px-1.5 py-0.5 rounded">
            {product.packSize}
          </span>
        </Link>

        {/* Category Label */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-brand-grey font-semibold">
          <span className="capitalize">{product.category.replace("-", " & ")}</span>
          <span className="text-gray-400 font-normal">{product.brand}</span>
        </div>

        {/* Product Name (2-line clamp) */}
        <Link
          to={`/compare/${product.id}`}
          className="block mt-1 font-bold text-brand-navy text-sm leading-snug line-clamp-2 hover:text-brand-green transition-colors min-h-[2.5rem]"
          title={product.name}
        >
          {product.name}
        </Link>

        {/* Star Rating */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="flex items-center text-amber-400">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
          </div>
          <span className="text-xs font-bold text-brand-navy">{product.rating || 4.7}</span>
          <span className="text-[10px] text-gray-400">
            ({product.reviewCount || 120})
          </span>
        </div>

        {/* Sold On Line */}
        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1 flex-wrap">
          <span className="font-medium text-gray-400">Available on:</span>
          {Object.entries(product.platformPrices).map(([pid, p]) => (
            <span
              key={pid}
              className={`px-1 py-0.2 rounded text-[9px] font-semibold ${
                p.availability === "available"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-red-50 text-red-400 line-through"
              }`}
            >
              {PLATFORM_METADATA[pid as keyof typeof PLATFORM_METADATA].name.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {/* Price Row */}
        <div className="flex items-baseline justify-between gap-1">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-brand-green leading-none">
                {formatINR(product.lowestPricePaise)}
              </span>
              {product.mrpPaise && product.mrpPaise > product.lowestPricePaise && (
                <span className="text-xs text-gray-400 line-through">
                  {formatINR(product.mrpPaise)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-brand-navy">
                Lowest on {lowestMeta.name}
              </span>
              <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 font-bold">
                MOCK
              </span>
            </div>
          </div>

          {/* Add to List Button */}
          <button
            onClick={() => addProduct(product)}
            disabled={product.isOutOfStock}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs ${
              product.isOutOfStock
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : inBasket
                ? "bg-brand-green text-white"
                : "bg-brand-green-light hover:bg-brand-green hover:text-white text-brand-green"
            }`}
          >
            {inBasket ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added ({inBasket.quantity})</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>

        {/* 4-Chip Platform Strip */}
        <PlatformChipStrip product={product} />
      </div>
    </div>
  );
};
