import React from "react";
import { Link } from "react-router-dom";

export const GroqLogo: React.FC<{ size?: "sm" | "md" | "lg" }> = ({ size = "md" }) => {
  const iconSize = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-3xl" : "text-2xl";

  return (
    <Link to="/" className="flex items-center gap-2 group select-none">
      <div className="relative flex items-center justify-center p-1.5 rounded-xl bg-brand-green-light group-hover:bg-brand-green/20 transition-colors">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Grocery Cart Basket */}
          <path
            d="M6 8H10L14.2 24.5C14.4 25.4 15.2 26 16.1 26H29.5C30.4 26 31.2 25.4 31.4 24.5L34 14H11.5"
            stroke="#253D4E"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Cart Wheels */}
          <circle cx="17" cy="31" r="2.5" fill="#3BB77E" />
          <circle cx="28" cy="31" r="2.5" fill="#3BB77E" />
          {/* Organic Grocery Fresh Leaf */}
          <path
            d="M24 6C20 6 18 10 18 13C21 13 25 11 26 8C27 5 25 6 24 6Z"
            fill="#3BB77E"
          />
          <path
            d="M18 13C22 10 24 6 24 6"
            stroke="#2FA66F"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className={`font-bold tracking-tight text-brand-navy ${textSize} leading-none`}>
          Groq<span className="text-brand-green">AI</span>
        </span>
        <span className="text-[10px] uppercase font-semibold tracking-wider text-brand-grey mt-0.5">
          Grocery Optimizer
        </span>
      </div>
    </Link>
  );
};
