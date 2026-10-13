import React, { useEffect, useState } from "react";
import { HeroBanner } from "../components/home/HeroBanner.js";
import { FeaturedCategories } from "../components/home/FeaturedCategories.js";
import { PromoBanners } from "../components/home/PromoBanners.js";
import { PopularProductsSection } from "../components/home/PopularProductsSection.js";
import { TopSavingsSection } from "../components/home/TopSavingsSection.js";
import { HowItWorksStrip } from "../components/home/HowItWorksStrip.js";
import { apiClient } from "../services/apiClient.js";
import { ProductSummary } from "@groqai/shared";

export const HomePage: React.FC = () => {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiClient
      .searchProducts()
      .then((data) => {
        if (mounted) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load products on Home:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="pb-12">
      {/* Hero Banner Carousel with Pincode input */}
      <HeroBanner />

      {/* Featured Categories Carousel */}
      <FeaturedCategories />

      {/* Three Promo Banners */}
      <PromoBanners />

      {/* Popular Products 5-Column Grid with tab filters */}
      {loading ? (
        <div className="max-w-container mx-auto px-4 mt-12 text-center text-sm text-gray-400 py-12">
          Loading grocery prices across 4 quick-commerce platforms...
        </div>
      ) : (
        <PopularProductsSection products={products} />
      )}

      {/* Top Savings Today */}
      {!loading && <TopSavingsSection products={products} />}

      {/* How GroqAI Works 4-Step Strip */}
      <HowItWorksStrip />
    </div>
  );
};
