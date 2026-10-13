import React from "react";
import { Link } from "react-router-dom";
import { TrendingDown, ArrowRight } from "lucide-react";
import { ProductSummary } from "@groqai/shared";
import { ProductCard } from "../products/ProductCard.js";

interface TopSavingsSectionProps {
  products: ProductSummary[];
}

export const TopSavingsSection: React.FC<TopSavingsSectionProps> = ({ products }) => {
  // Select products with highest discount percentage
  const topDiscounted = [...products]
    .sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0))
    .slice(0, 5);

  return (
    <section className="max-w-container mx-auto px-4 mt-16">
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 rounded-3xl p-6 md:p-8 border border-emerald-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-green rounded-xl text-white">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-brand-navy">
                Top Savings Today (Price Drops)
              </h2>
              <p className="text-xs text-brand-grey mt-0.5">
                Up to 40% lower shelf prices compared across quick-commerce apps
              </p>
            </div>
          </div>

          <Link
            to="/search?hot=true"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-hover transition-colors self-start sm:self-auto"
          >
            <span>View All Deals</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 5 Card row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {topDiscounted.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};
