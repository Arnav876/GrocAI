import React from "react";
import { X, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { formatINR } from "@groqai/shared";

export interface SubstitutionItem {
  requestedTitle: string;
  requestedBrand: string;
  requestedVariant: string;
  requestedPriceRupees: number;
  substituteTitle: string;
  substituteBrand: string;
  substituteVariant: string;
  substitutePriceRupees: number;
  savingsRupees: number;
}

interface SubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  substitution: SubstitutionItem | null;
  onConfirmSwap: () => void;
}

export const SubstitutionModal: React.FC<SubstitutionModalProps> = ({
  isOpen,
  onClose,
  substitution,
  onConfirmSwap,
}) => {
  if (!isOpen || !substitution) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-brand-border relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-brand-grey hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <span className="p-2 bg-brand-green-light rounded-xl text-brand-green">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-brand-navy">Review Item Substitution</h3>
            <p className="text-xs text-brand-grey">
              Substitute alternative with exact brand/variant comparison
            </p>
          </div>
        </div>

        {/* Diff Box */}
        <div className="grid grid-cols-2 gap-3 my-5">
          {/* Requested item */}
          <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Requested Item
            </span>
            <div className="font-bold text-brand-navy text-xs leading-snug">
              {substitution.requestedTitle}
            </div>
            <div className="text-[11px] text-gray-500">
              <div>Brand: <strong>{substitution.requestedBrand}</strong></div>
              <div>Variant: {substitution.requestedVariant}</div>
            </div>
            <div className="text-xs font-bold text-gray-700">
              Est: ₹{substitution.requestedPriceRupees}
            </div>
          </div>

          {/* Suggested substitute */}
          <div className="p-3.5 rounded-xl border border-brand-green bg-brand-green-light/40 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-green">
              Suggested Alternative
            </span>
            <div className="font-bold text-brand-navy text-xs leading-snug">
              {substitution.substituteTitle}
            </div>
            <div className="text-[11px] text-gray-500">
              <div>Brand: <strong>{substitution.substituteBrand}</strong></div>
              <div>Variant: {substitution.substituteVariant}</div>
            </div>
            <div className="text-xs font-bold text-brand-green">
              Est: ₹{substitution.substitutePriceRupees} (Save ₹{substitution.savingsRupees})
            </div>
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2 mb-5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Non-negotiable rule: GroqAI never silently swaps items. Confirmation is always required.
          </span>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Keep Original
          </button>
          <button
            onClick={() => {
              onConfirmSwap();
              onClose();
            }}
            className="px-5 py-2.5 rounded-full bg-brand-green hover:bg-brand-green-hover text-white text-xs font-bold transition-colors shadow-sm"
          >
            Confirm Swap & Save
          </button>
        </div>
      </div>
    </div>
  );
};
