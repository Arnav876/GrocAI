import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Shuffle, Heart, ShoppingBag, User } from "lucide-react";
import { GroqLogo } from "./GroqLogo.js";
import { useBasket } from "../../context/BasketContext.js";
import { formatINR } from "@groqai/shared";

interface HeaderProps {
  onOpenPincodeModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPincodeModal }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { itemCount, estimatedTotalRupees, pincode } = useBasket();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="py-4 bg-white border-b border-brand-border sticky top-0 lg:static z-40">
      <div className="max-w-container mx-auto px-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <GroqLogo />

        {/* Wide Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-2xl items-center relative"
        >
          <div className="flex w-full items-center border-2 border-brand-green/30 focus-within:border-brand-green rounded-full pl-4 pr-1 py-1 transition-all shadow-sm">
            <Search className="w-4 h-4 text-brand-grey mr-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for milk, eggs, rice, butter, oil..."
              className="w-full text-sm font-medium focus:outline-none bg-transparent placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="bg-brand-green hover:bg-brand-green-hover text-white text-sm font-semibold px-6 py-2 rounded-full transition-colors flex items-center gap-1.5 shadow-sm"
            >
              Search
            </button>
          </div>
        </form>

        {/* Action Controls & Badges */}
        <div className="flex items-center gap-3 lg:gap-6">
          {/* Check My Pincode Button */}
          <button
            onClick={onOpenPincodeModal}
            className="flex items-center gap-1.5 border border-brand-green text-brand-green hover:bg-brand-green-light px-3.5 py-1.5 rounded-full text-xs lg:text-sm font-semibold transition-all shadow-sm"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>PIN: {pincode}</span>
          </button>

          {/* Right Action Icons */}
          <div className="flex items-center gap-3 lg:gap-5 text-brand-navy">
            {/* Compare Link */}
            <Link
              to="/compare"
              className="hidden sm:flex items-center gap-1.5 hover:text-brand-green transition-colors text-xs font-semibold"
            >
              <div className="relative">
                <Shuffle className="w-5 h-5 text-brand-navy" />
              </div>
              <span className="hidden xl:inline">Compare</span>
            </Link>

            {/* Saved Lists */}
            <Link
              to="/saved"
              className="hidden sm:flex items-center gap-1.5 hover:text-brand-green transition-colors text-xs font-semibold"
            >
              <div className="relative">
                <Heart className="w-5 h-5 text-brand-navy" />
              </div>
              <span className="hidden xl:inline">Saved</span>
            </Link>

            {/* My List / Basket with running total badge */}
            <Link
              to="/list"
              className="flex items-center gap-2 hover:text-brand-green transition-colors text-xs font-semibold"
            >
              <div className="relative">
                <ShoppingBag className="w-6 h-6 text-brand-navy" />
                <span className="absolute -top-1.5 -right-2 bg-brand-green text-white text-[11px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-[10px] text-brand-grey font-medium leading-none">
                  My Basket
                </span>
                <span className="text-xs font-bold text-brand-green mt-0.5">
                  {formatINR(estimatedTotalRupees, true)}
                </span>
              </div>
            </Link>

            {/* Account */}
            <Link
              to="/platforms"
              className="flex items-center gap-1.5 hover:text-brand-green transition-colors text-xs font-semibold"
            >
              <User className="w-5 h-5 text-brand-navy" />
              <span className="hidden xl:inline">Account</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
