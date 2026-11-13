import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, MapPin, Shuffle, Heart, ShoppingBag, Command, Sparkles, User } from "lucide-react";
import { GroqLogo } from "./GroqLogo.js";
import { useBasket } from "../../context/BasketContext.js";
import { formatINR } from "@groqai/shared";

interface HeaderProps {
  onOpenPincodeModal: () => void;
  onOpenSearch?: (query?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenPincodeModal, onOpenSearch }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { itemCount, estimatedTotalRupees, pincode } = useBasket();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onOpenSearch) {
      onOpenSearch(searchQuery.trim());
    } else if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleBarClick = () => {
    if (onOpenSearch) {
      onOpenSearch(searchQuery);
    } else {
      window.dispatchEvent(
        new CustomEvent("open-browser-omnibar", { detail: { query: searchQuery } })
      );
    }
  };

  return (
    <header className="py-3 sm:py-4 bg-white border-b border-brand-border sticky top-0 lg:static z-40">
      <div className="max-w-container mx-auto px-4 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo */}
        <GroqLogo />

        {/* Browser-Like Omnibar Search Trigger (Visible on all devices/Safari) */}
        <div
          onClick={handleBarClick}
          className="flex-1 max-w-xl cursor-pointer"
        >
          <div className="flex w-full items-center border-2 border-brand-green/30 hover:border-brand-green focus-within:border-brand-green rounded-full pl-3 sm:pl-4 pr-1.5 py-1 transition-all shadow-sm bg-gray-50/50 hover:bg-white">
            <Search className="w-4 h-4 text-brand-grey mr-2 shrink-0" />
            <input
              type="text"
              readOnly
              value={searchQuery}
              placeholder="Search grocery products across all platforms..."
              className="w-full text-xs sm:text-sm font-medium focus:outline-none bg-transparent placeholder:text-gray-400 cursor-pointer"
            />
            <div className="hidden sm:flex items-center gap-1 mr-2 px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-mono font-medium border border-gray-200">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBarClick();
              }}
              className="bg-brand-green hover:bg-brand-green-hover text-white text-xs sm:text-sm font-semibold px-3 sm:px-5 py-1.5 rounded-full transition-colors flex items-center gap-1 shadow-sm shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 hidden sm:inline" />
              <span>Search</span>
            </button>
          </div>
        </div>

        {/* Action Controls & Badges */}
        <div className="flex items-center gap-3 lg:gap-6">
          {/* Check My Pincode Button */}
          <button
            type="button"
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
