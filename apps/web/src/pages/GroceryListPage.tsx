import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  Sliders,
  Check,
  ShoppingBag,
  Info,
} from "lucide-react";
import { useBasket, BasketItem } from "../context/BasketContext.js";
import { defaultNLParser } from "../services/naturalLanguageParser.js";
import { formatINR, UserPreferences } from "@groqai/shared";

export const GroceryListPage: React.FC = () => {
  const {
    items,
    addItem,
    updateQuantity,
    removeItem,
    clearItems,
    itemCount,
    estimatedTotalRupees,
    preferences,
    setPreferences,
    pincode,
  } = useBasket();

  const navigate = useNavigate();

  // Manual Row Input Form State
  const [newQuery, setNewQuery] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newVariant, setNewVariant] = useState("");
  const [newAllowSub, setNewAllowSub] = useState(false);

  // Natural Language Box State
  const [nlText, setNlText] = useState("");
  const [isParsingNL, setIsParsingNL] = useState(false);
  const [nlNotice, setNlNotice] = useState<string | null>(null);

  // Manual Add Item
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuery.trim()) return;

    const qty = parseFloat(newQuantity) || 1;
    addItem({
      query: newQuery.trim(),
      quantity: qty,
      unit: newUnit,
      requiredVariant: newVariant.trim() || undefined,
      allowSubstitutions: newAllowSub,
    });

    setNewQuery("");
    setNewQuantity("1");
    setNewVariant("");
    setNewAllowSub(false);
  };

  // Natural Language Parse
  const handleParseNL = async () => {
    if (!nlText.trim()) return;
    setIsParsingNL(true);
    setNlNotice(null);

    try {
      const result = await defaultNLParser.parse(nlText);
      for (const it of result.items) {
        addItem(it);
      }
      if (result.items.length > 0) {
        setNlNotice(
          `Parsed and added ${result.items.length} item${
            result.items.length > 1 ? "s" : ""
          } to your list.`
        );
        setNlText("");
      } else {
        setNlNotice("Could not parse items. Please check the format.");
      }
    } catch (err) {
      setNlNotice("Failed to parse text notes.");
    } finally {
      setIsParsingNL(false);
    }
  };

  const handleProceedToOptimize = () => {
    if (items.length > 0) {
      navigate("/optimize");
    }
  };

  return (
    <div className="max-w-container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-brand-navy">Grocery List Builder</h1>
          <p className="text-xs md:text-sm text-brand-grey mt-1">
            Build your list with manual items or natural text notes, configure rules, and optimize.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button
              onClick={clearItems}
              className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline px-3 py-2"
            >
              Clear All ({itemCount})
            </button>
          )}

          <button
            onClick={handleProceedToOptimize}
            disabled={items.length === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-sm transition-all ${
              items.length === 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-brand-green hover:bg-brand-green-hover text-white cursor-pointer"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Optimize Cart ({itemCount} items)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Natural Language Box + Table (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Natural Language Box */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-brand-green/30 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-2 text-brand-navy font-bold text-sm">
              <Sparkles className="w-4 h-4 text-brand-green" />
              <span>Paste Smart Grocery Notes (Natural Language Parser)</span>
            </div>
            <p className="text-xs text-brand-grey mb-3">
              Type or paste items naturally: e.g. "2 litres milk, 12 eggs, 5 kg rice, 1 packet bread"
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParseNL()}
                placeholder="2 litres milk, 12 eggs, 5 kg atta, 500g butter..."
                className="flex-1 bg-white border border-brand-border rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:border-brand-green"
              />
              <button
                type="button"
                onClick={handleParseNL}
                disabled={isParsingNL || !nlText.trim()}
                className="bg-brand-navy hover:bg-brand-navy/90 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shrink-0 disabled:opacity-50"
              >
                {isParsingNL ? "Parsing..." : "Parse & Add"}
              </button>
            </div>
            {nlNotice && (
              <div className="mt-2 text-xs font-semibold text-brand-green flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {nlNotice}
              </div>
            )}
          </div>

          {/* Manual Add Item Row */}
          <div className="bg-white rounded-2xl border border-brand-border p-5 shadow-xs">
            <h3 className="font-bold text-brand-navy text-sm mb-3">Add Item Manually</h3>
            <form onSubmit={handleAddManualItem} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-brand-navy mb-1">Item Name / Query</label>
                <input
                  type="text"
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  placeholder="e.g. Amul Taaza Milk"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-green"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-brand-navy mb-1">Quantity</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-green"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-brand-navy mb-1">Unit</label>
                <select
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none focus:border-brand-green bg-white"
                >
                  <option value="pcs">pcs</option>
                  <option value="L">L</option>
                  <option value="ml">ml</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="pack">pack</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-brand-navy mb-1">Required Variant (opt)</label>
                <input
                  type="text"
                  value={newVariant}
                  onChange={(e) => setNewVariant(e.target.value)}
                  placeholder="e.g. Toned, Brown"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand-green"
                />
              </div>

              <div className="sm:col-span-1">
                <button
                  type="submit"
                  className="w-full bg-brand-green hover:bg-brand-green-hover text-white p-2.5 rounded-xl flex items-center justify-center transition-colors shadow-xs"
                  title="Add Row"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Current Grocery List Table */}
          <div className="bg-white rounded-2xl border border-brand-border shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-brand-navy text-sm flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-green" />
                <span>Your Grocery Items ({items.length})</span>
              </h3>
              <span className="text-xs font-bold text-brand-navy">
                Est. Subtotal: <span className="text-brand-green">{formatINR(estimatedTotalRupees, true)}</span>
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-2">
                <div className="text-4xl">🛒</div>
                <p className="font-semibold text-brand-navy">Your list is currently empty.</p>
                <p className="text-xs text-brand-grey">
                  Add items manually or use the quick notes box above to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100 text-brand-navy uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Item</th>
                      <th className="py-3 px-3">Quantity & Unit</th>
                      <th className="py-3 px-3">Variant Specification</th>
                      <th className="py-3 px-3">Substitutions</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((it: BasketItem, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4 font-bold text-brand-navy">
                          <div>{it.query}</div>
                          {it.matchedProduct && (
                            <span className="text-[10px] text-brand-green font-semibold">
                              Matched: {it.matchedProduct.brand} • Best ₹{it.matchedProduct.lowestPriceRupees}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQuantity(idx, it.quantity - 1)}
                              className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center font-bold hover:bg-gray-100"
                            >
                              -
                            </button>
                            <span className="font-bold text-brand-navy min-w-[20px] text-center">
                              {it.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(idx, it.quantity + 1)}
                              className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center font-bold hover:bg-gray-100"
                            >
                              +
                            </button>
                            <span className="text-gray-500 font-medium ml-1">{it.unit}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-gray-600">
                          {it.requiredVariant || <span className="text-gray-400 italic">Any variant</span>}
                        </td>

                        <td className="py-3 px-3">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!it.allowSubstitutions}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx] = { ...copy[idx], allowSubstitutions: e.target.checked };
                              }}
                              className="accent-brand-green rounded"
                            />
                            <span className="text-[11px] text-gray-600">Allow</span>
                          </label>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: User Preferences Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sliders className="w-4 h-4 text-brand-green" />
              <h3 className="font-bold text-brand-navy text-sm">Optimization Preferences</h3>
            </div>

            {/* Strategy Preference */}
            <div>
              <label className="block text-xs font-bold text-brand-navy mb-2">
                Primary Goal
              </label>
              <div className="space-y-2">
                {[
                  {
                    id: "optimized_multi_platform",
                    label: "Smart Split (Balanced)",
                    desc: "Recommends multi-store split only if savings beat fees",
                  },
                  {
                    id: "cheapest_single_platform",
                    label: "Single Store Only",
                    desc: "1 delivery, zero coordination, lowest single merchant",
                  },
                  {
                    id: "cheapest_item_by_item",
                    label: "Cheapest Item-by-Item",
                    desc: "Raw lowest shelf price for every product",
                  },
                ].map((strat) => (
                  <label
                    key={strat.id}
                    className={`block p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      preferences.strategy === strat.id
                        ? "border-brand-green bg-brand-green-light/40"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="strategy"
                        checked={preferences.strategy === strat.id}
                        onChange={() =>
                          setPreferences((p: UserPreferences) => ({
                            ...p,
                            strategy: strat.id as any,
                          }))
                        }
                        className="accent-brand-green"
                      />
                      <span className="font-bold text-brand-navy">{strat.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 pl-5">{strat.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* Max Platforms Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-brand-navy mb-1.5">
                <span>Max Delivery Platforms</span>
                <span className="text-brand-green font-bold text-sm">
                  {preferences.maxPlatforms || 3} Stores
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                value={preferences.maxPlatforms || 3}
                onChange={(e) =>
                  setPreferences((p: UserPreferences) => ({
                    ...p,
                    maxPlatforms: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-brand-green cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 font-semibold mt-1">
                <span>1 (Single)</span>
                <span>2</span>
                <span>3</span>
                <span>4 (All)</span>
              </div>
            </div>

            {/* Minimum Savings Threshold */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-brand-navy mb-1.5">
                <span>Min Savings to Split Basket</span>
                <span className="text-brand-green font-bold text-sm">
                  ₹{preferences.minimumSavingsRupees || 20}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={preferences.minimumSavingsRupees || 20}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPreferences((p: UserPreferences) => ({
                    ...p,
                    minimumSavingsRupees: val,
                    minimumSavingsPaise: val * 100,
                  }));
                }}
                className="w-full accent-brand-green cursor-pointer"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                If multi-store split saves less than ₹{preferences.minimumSavingsRupees || 20} after extra delivery fees, a single store is recommended.
              </p>
            </div>

            {/* Proceed Action Button */}
            <button
              onClick={handleProceedToOptimize}
              disabled={items.length === 0}
              className={`w-full py-3.5 rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
                items.length === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-brand-green hover:bg-brand-green-hover text-white cursor-pointer"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Optimize Basket ({items.length} Items)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
