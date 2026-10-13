import React, { useState } from "react";
import { ProductSummary } from "@groqai/shared";
import { ProductCard } from "../products/ProductCard.js";

interface PopularProductsSectionProps {
  products: ProductSummary[];
}

export const PopularProductsSection: React.FC<PopularProductsSectionProps> = ({ products }) => {
  const [activeTab, setActiveTab] = useState<string>("all");

  const tabs = [
    { id: "all", label: "All Items" },
    { id: "dairy", label: "Dairy" },
    { id: "fruits", label: "Fruits" },
    { id: "vegetables", label: "Vegetables" },
    { id: "staples", label: "Staples" },
    { id: "snacks", label: "Snacks" },
  ];

  const filteredProducts =
    activeTab === "all"
      ? products.slice(0, 15) // Show top 15 in popular
      : products.filter((p) => p.category.toLowerCase() === activeTab.toLowerCase());

  return (
    <section className="max-w-container mx-auto px-4 mt-14">
      {/* Heading and Tabs Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Popular Products</h2>
          <p className="text-xs text-brand-grey mt-0.5">
            Verified shelf prices across Blinkit, Zepto, Swiggy Instamart and BigBasket.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-full self-start sm:self-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-brand-green text-white shadow-xs"
                  : "text-brand-navy hover:text-brand-green"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5-Column Grid (4 on laptop, 2 on mobile) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
};
