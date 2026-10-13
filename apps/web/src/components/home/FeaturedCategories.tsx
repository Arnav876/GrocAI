import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MOCK_CATEGORIES } from "../../fixtures/mockCategories.js";

export const FeaturedCategories: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === "left" ? -300 : 300;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <section className="max-w-container mx-auto px-4 mt-12">
      {/* Heading & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-baseline gap-4 sm:gap-6">
          <h2 className="text-2xl font-bold text-brand-navy">Featured Categories</h2>
          <div className="flex items-center gap-3 text-xs font-semibold text-brand-grey">
            <Link to="/search?category=dairy" className="hover:text-brand-green transition-colors">
              Dairy
            </Link>
            <span>•</span>
            <Link to="/search?category=fruits" className="hover:text-brand-green transition-colors">
              Fruits
            </Link>
            <span>•</span>
            <Link to="/search?category=staples" className="hover:text-brand-green transition-colors">
              Staples
            </Link>
            <span>•</span>
            <Link to="/search?category=snacks" className="hover:text-brand-green transition-colors">
              Snacks
            </Link>
          </div>
        </div>

        {/* Carousel Arrow Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-brand-green hover:text-white hover:border-brand-green transition-colors flex items-center justify-center text-brand-navy shadow-xs"
            aria-label="Previous categories"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-full border border-gray-200 bg-white hover:bg-brand-green hover:text-white hover:border-brand-green transition-colors flex items-center justify-center text-brand-navy shadow-xs"
            aria-label="Next categories"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel Row */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"
      >
        {MOCK_CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            to={`/search?category=${cat.id}`}
            className={`category-card ${cat.bgPastel} rounded-2xl p-5 min-w-[145px] sm:min-w-[160px] flex flex-col items-center justify-center text-center border border-transparent shadow-xs shrink-0 cursor-pointer`}
          >
            <div className="w-16 h-16 rounded-full bg-white/70 flex items-center justify-center text-3xl mb-3 shadow-xs">
              {cat.icon}
            </div>
            <h3 className="font-bold text-brand-navy text-xs sm:text-sm line-clamp-1">{cat.name}</h3>
            <span className="text-[11px] text-brand-grey font-medium mt-0.5">
              {cat.itemCount} items
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};
