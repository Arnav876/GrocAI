import React from "react";
import { Link } from "react-router-dom";
import { Headphones, Globe, IndianRupee } from "lucide-react";

export const TopBar: React.FC = () => {
  return (
    <div className="border-b border-brand-border py-2 text-xs text-brand-grey bg-white hidden lg:block">
      <div className="max-w-container mx-auto px-4 flex items-center justify-between">
        {/* Left Links */}
        <div className="flex items-center gap-4">
          <Link to="/about" className="hover:text-brand-green transition-colors">
            About Us
          </Link>
          <span className="text-gray-300">|</span>
          <Link to="/list" className="hover:text-brand-green transition-colors">
            My List
          </Link>
          <span className="text-gray-300">|</span>
          <Link to="/platforms" className="hover:text-brand-green transition-colors">
            Platforms Status
          </Link>
          <span className="text-gray-300">|</span>
          <Link to="/how-it-works" className="hover:text-brand-green transition-colors">
            Order Tracking
          </Link>
        </div>

        {/* Center Promo */}
        <div className="text-brand-green font-semibold tracking-wide">
          Compare 4 platforms • Save more with smart basket splitting
        </div>

        {/* Right Info */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5 text-brand-navy font-medium">
            <Headphones className="w-3.5 h-3.5 text-brand-green" />
            <span>Need help? </span>
            <span className="text-brand-green">support@groqai.internal</span>
          </div>

          <div className="flex items-center gap-1 text-brand-navy">
            <Globe className="w-3.5 h-3.5 text-brand-grey" />
            <span>English</span>
          </div>

          <div className="flex items-center gap-1 text-brand-navy font-semibold">
            <IndianRupee className="w-3 h-3 text-brand-green" />
            <span>INR</span>
          </div>
        </div>
      </div>
    </div>
  );
};
