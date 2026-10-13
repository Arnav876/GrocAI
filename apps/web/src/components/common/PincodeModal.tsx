import React, { useState } from "react";
import { X, MapPin, Navigation, CheckCircle2 } from "lucide-react";
import { useBasket } from "../../context/BasketContext.js";

interface PincodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PincodeModal: React.FC<PincodeModalProps> = ({ isOpen, onClose }) => {
  const { pincode, locationName, setPincode, setLocationName } = useBasket();
  const [inputPincode, setInputPincode] = useState(pincode);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSavePincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(inputPincode)) {
      setError("Please enter a valid 6-digit Indian PIN code");
      return;
    }
    setError(null);
    setPincode(inputPincode);
    if (inputPincode === "110001") {
      setLocationName("Connaught Place, Central Delhi");
    } else if (inputPincode === "560001") {
      setLocationName("MG Road, Bengaluru");
    } else if (inputPincode === "400001") {
      setLocationName("Fort, South Mumbai");
    } else {
      setLocationName(`Delivery Area (${inputPincode})`);
    }
    onClose();
  };

  const handleRequestPreciseLocation = () => {
    setPermissionRequested(true);
    setGpsLoading(true);
    setError(null);

    // Ask permission before using precise location as required
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLoading(false);
          // In mock environment, map coordinates to central Delhi hub
          setInputPincode("110001");
          setPincode("110001");
          setLocationName("Central Delhi (Detected via GPS)");
          onClose();
        },
        (err) => {
          setGpsLoading(false);
          setError("Location permission denied or unavailable. Please enter your 6-digit pincode manually.");
        },
        { timeout: 8000 }
      );
    } else {
      setGpsLoading(false);
      setError("Geolocation is not supported by your browser. Please enter your pincode.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-brand-border relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-brand-grey hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-brand-green-light rounded-xl text-brand-green">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-brand-navy">Set Delivery Location</h3>
            <p className="text-xs text-brand-grey">
              Quick-commerce inventory and fees vary significantly by pincode.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSavePincode} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-brand-navy mb-1.5">
              Enter 6-Digit Indian Pincode
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={inputPincode}
                onChange={(e) => {
                  setInputPincode(e.target.value.replace(/\D/g, ""));
                  setError(null);
                }}
                placeholder="e.g. 110001"
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:border-brand-green font-semibold text-sm"
              />
              <button
                type="submit"
                className="bg-brand-green hover:bg-brand-green-hover text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </form>

        <div className="relative my-5 flex items-center justify-center">
          <div className="border-t border-gray-200 w-full"></div>
          <span className="bg-white px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider absolute">
            Or detect
          </span>
        </div>

        {/* GPS location with permission request */}
        <button
          onClick={handleRequestPreciseLocation}
          disabled={gpsLoading}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-brand-green/30 bg-brand-green-light hover:bg-brand-green/20 text-brand-green text-xs font-bold transition-colors"
        >
          <Navigation className="w-4 h-4" />
          <span>{gpsLoading ? "Detecting location..." : "Use Precise GPS Location (Permission Required)"}</span>
        </button>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Current: <strong className="text-brand-navy">{locationName}</strong></span>
          <span className="text-brand-green font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> PIN Verified
          </span>
        </div>
      </div>
    </div>
  );
};
