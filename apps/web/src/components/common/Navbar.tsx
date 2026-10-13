import React, { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import {
  LayoutGrid,
  Flame,
  Menu,
  X,
  ChevronDown,
  Headphones,
  Search,
} from "lucide-react";
import { MOCK_CATEGORIES } from "../../fixtures/mockCategories.js";

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Search", path: "/search" },
    { name: "My List", path: "/list" },
    { name: "Optimize", path: "/optimize" },
    { name: "Platforms", path: "/platforms" },
    { name: "How It Works", path: "/how-it-works" },
  ];

  return (
    <nav className="border-b border-brand-border bg-white sticky top-0 lg:top-0 z-30 shadow-sm">
      <div className="max-w-container mx-auto px-4 flex items-center justify-between">
        {/* Left: Browse All Categories button */}
        <div className="relative py-2.5">
          <button
            onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
            className="bg-brand-green hover:bg-brand-green-hover text-white text-xs lg:text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Browse All Categories</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                categoriesDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Categories Dropdown Menu */}
          {categoriesDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-brand-border rounded-xl shadow-xl py-2 z-50">
              {MOCK_CATEGORIES.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/search?category=${cat.id}`}
                  onClick={() => setCategoriesDropdownOpen(false)}
                  className="flex items-center justify-between px-4 py-2 hover:bg-brand-green-light text-brand-navy hover:text-brand-green text-xs font-semibold transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{cat.icon}</span>
                    <span>{cat.name}</span>
                  </div>
                  <span className="text-[10px] text-brand-grey bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {cat.itemCount}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Center: Main Nav Links (Desktop) */}
        <div className="hidden lg:flex items-center gap-6">
          {/* Hot Deals */}
          <Link
            to="/search?hot=true"
            className="flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
          >
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span>Hot Deals</span>
          </Link>

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `text-sm font-semibold transition-colors flex items-center gap-1 py-4 border-b-2 ${
                  isActive
                    ? "text-brand-green border-brand-green"
                    : "text-brand-navy hover:text-brand-green border-transparent"
                }`
              }
            >
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>

        {/* Right Support Hotline */}
        <div className="hidden xl:flex items-center gap-2 text-brand-navy">
          <Headphones className="w-8 h-8 text-brand-green p-1.5 rounded-full bg-brand-green-light" />
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-brand-green leading-none">
              1800-GROQ-AI
            </span>
            <span className="text-[10px] text-brand-grey font-medium mt-0.5">
              24/7 Smart Assistance
            </span>
          </div>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="lg:hidden py-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-brand-navy hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-brand-border bg-white px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 font-bold text-sm pb-2 border-b border-gray-100">
            <Flame className="w-4 h-4 text-orange-500" />
            <Link to="/search?hot=true" onClick={() => setMobileMenuOpen(false)}>
              Hot Deals (Top Price Drops)
            </Link>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `block text-sm font-semibold py-1.5 ${
                  isActive ? "text-brand-green" : "text-brand-navy"
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
};
