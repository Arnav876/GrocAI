import React, { useState } from "react";
import { X, PlusCircle, CheckCircle, AlertCircle } from "lucide-react";
import { apiClient } from "../../services/apiClient.js";

interface ManualPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultTitle?: string;
  defaultPincode?: string;
}

export const ManualPriceModal: React.FC<ManualPriceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultTitle = "",
  defaultPincode = "110001",
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [packSize, setPackSize] = useState("1 L");
  const [priceRupees, setPriceRupees] = useState("");
  const [pincode, setPincode] = useState(defaultPincode);
  const [productUrl, setProductUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedPrice = parseFloat(priceRupees);
    if (!title.trim()) {
      setError("Product title is required.");
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Please enter a valid price in Rupees.");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.submitManualObservation({
        platform: "instamart",
        title: title.trim(),
        priceRupees: parsedPrice,
        pricePaise: Math.round(parsedPrice * 100),
        packSize: packSize.trim(),
        pincode: pincode.trim(),
        productUrl: productUrl.trim() || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to record manual price.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-brand-border animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg">
            ⚡
          </div>
          <div>
            <h2 className="text-base font-bold text-brand-navy">Add Swiggy Instamart Price</h2>
            <p className="text-[11px] text-gray-500">Assisted / Manual Consumer Price Benchmark</p>
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 mb-4 text-[11px] text-amber-900 leading-relaxed">
          <strong>Compliance Policy:</strong> Instamart data is not scraped automatically to respect perimeter policies. Adding manual benchmarks allows the optimizer to include Instamart in your multi-store splits.
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-8 text-center text-emerald-600 space-y-2">
            <CheckCircle className="w-12 h-12 mx-auto" />
            <p className="font-bold text-sm">Instamart Price Saved Successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-1">Product Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Amul Taaza Toned Fresh Milk"
                required
                className="w-full text-xs border border-brand-border rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-brand-green"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1">Pack Size</label>
                <input
                  type="text"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  placeholder="e.g. 500 ml, 1 L, 1 kg"
                  required
                  className="w-full text-xs border border-brand-border rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-brand-green"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1">Price (₹ INR)</label>
                <input
                  type="number"
                  step="0.5"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  placeholder="e.g. 54"
                  required
                  className="w-full text-xs border border-brand-border rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-brand-green"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="110001"
                  required
                  className="w-full text-xs border border-brand-border rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-brand-green"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy mb-1">Product URL (Optional)</label>
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://swiggy.com/..."
                  className="w-full text-xs border border-brand-border rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-brand-green"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold bg-brand-green hover:bg-brand-green-hover text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{submitting ? "Saving..." : "Record Price"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

