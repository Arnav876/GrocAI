import React from "react";
import { Link } from "react-router-dom";
import { GroqLogo } from "./GroqLogo.js";
import { MapPin, Mail, Phone, Clock, ShieldCheck, ExternalLink } from "lucide-react";
import { LEGAL_DISCLAIMER_TEXT } from "@groqai/shared";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-50 border-t border-brand-border mt-16 pt-12 pb-8 text-xs text-brand-grey">
      <div className="max-w-container mx-auto px-4">
        {/* Top 4 Value Badges Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-12 border-b border-gray-200">
          <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-brand-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-brand-green-light flex items-center justify-center text-brand-green font-bold text-xl">
              ₹
            </div>
            <div>
              <h4 className="font-bold text-brand-navy text-sm">Best Prices Across Apps</h4>
              <p className="text-gray-500 mt-0.5">Compare Blinkit, Zepto, Instamart & BigBasket</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-brand-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-brand-peach flex items-center justify-center text-brand-navy font-bold text-xl">
              ⚡
            </div>
            <div>
              <h4 className="font-bold text-brand-navy text-sm">Smart Split Optimization</h4>
              <p className="text-gray-500 mt-0.5">Save more when split savings exceed delivery fees</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-brand-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-brand-lime flex items-center justify-center text-brand-navy font-bold text-xl">
              🛡️
            </div>
            <div>
              <h4 className="font-bold text-brand-navy text-sm">Zero Passwords or OTPs</h4>
              <p className="text-gray-500 mt-0.5">You always check out directly on the merchant app</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-brand-border shadow-sm">
            <div className="w-12 h-12 rounded-full bg-brand-sky flex items-center justify-center text-brand-navy font-bold text-xl">
              🔍
            </div>
            <div>
              <h4 className="font-bold text-brand-navy text-sm">True Fee Transparency</h4>
              <p className="text-gray-500 mt-0.5">Handling, platform & surge fees factored in</p>
            </div>
          </div>
        </div>

        {/* 4 Footer Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 py-10 border-b border-gray-200">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-3">
            <GroqLogo />
            <p className="text-gray-500 text-xs leading-relaxed max-w-sm mt-3">
              GroqAI is an independent grocery price comparison and basket optimizer engineered for Indian quick-commerce shoppers. We help you find the absolute lowest total cost without compromising convenience.
            </p>
            <div className="pt-2 space-y-1.5 text-xs text-brand-navy">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-brand-green" />
                <span>Central Delhi & Bengaluru Hubs (Mock Environment)</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-brand-green" />
                <span>support@groqai.internal</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-brand-green" />
                <span>Catalog freshness TTL: 6 hours</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-brand-navy text-sm">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="hover:text-brand-green transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/search" className="hover:text-brand-green transition-colors">
                  Product Search
                </Link>
              </li>
              <li>
                <Link to="/list" className="hover:text-brand-green transition-colors">
                  Grocery List Builder
                </Link>
              </li>
              <li>
                <Link to="/optimize" className="hover:text-brand-green transition-colors">
                  Basket Optimizer
                </Link>
              </li>
              <li>
                <Link to="/platforms" className="hover:text-brand-green transition-colors">
                  Platform Status & Health
                </Link>
              </li>
            </ul>
          </div>

          {/* Platforms Compared */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-brand-navy text-sm">Platforms Compared</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-platform-blinkit"></span>
                <span>Blinkit (Zomato)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-platform-zepto"></span>
                <span>Zepto</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-platform-instamart"></span>
                <span>Swiggy Instamart</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-platform-bigbasket"></span>
                <span>BigBasket / BB Now</span>
              </li>
            </ul>
          </div>

          {/* Legal & Security */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-brand-navy text-sm">Trust & Security</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-1 text-brand-navy font-semibold">
                <ShieldCheck className="w-4 h-4 text-brand-green" />
                <span>Zero Payment Processing</span>
              </li>
              <li>
                <span className="text-gray-500">Payment always happens on merchant app</span>
              </li>
              <li>
                <Link to="/how-it-works" className="hover:text-brand-green transition-colors">
                  How GroqAI Works
                </Link>
              </li>
              <li>
                <Link to="/platforms" className="hover:text-brand-green transition-colors">
                  Capabilities Matrix
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer & Notice */}
        <div className="pt-6 pb-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-[11px] leading-relaxed text-gray-600 shadow-sm">
            <p className="font-semibold text-brand-navy mb-1">LEGAL DISCLAIMER & PRODUCT DISCLOSURE:</p>
            <p>{LEGAL_DISCLAIMER_TEXT}</p>
          </div>
        </div>

        {/* Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 text-gray-500 text-xs">
          <p>© 2026 GroqAI. Built with precision for Indian Quick-Commerce shoppers.</p>
          <div className="flex items-center gap-4">
            <span>Pincode Coverage: Delhi NCR, Bengaluru</span>
            <span>•</span>
            <span className="text-brand-green font-semibold">All Prices in INR (₹)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
