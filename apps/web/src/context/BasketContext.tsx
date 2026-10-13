import React, { createContext, useContext, useState, useEffect } from "react";
import { GroceryListItemInput, ProductSummary, UserPreferences } from "@groqai/shared";

export interface BasketItem extends GroceryListItemInput {
  productId?: string;
  matchedProduct?: ProductSummary;
}

interface BasketContextType {
  items: BasketItem[];
  pincode: string;
  locationName: string;
  preferences: UserPreferences;
  setPincode: (pin: string) => void;
  setLocationName: (name: string) => void;
  setPreferences: React.Dispatch<React.SetStateAction<UserPreferences>>;
  addItem: (item: BasketItem) => void;
  addProduct: (product: ProductSummary, quantity?: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  removeItem: (index: number) => void;
  clearItems: () => void;
  itemCount: number;
  estimatedTotalRupees: number;
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export const BasketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<BasketItem[]>([
    // Sensible pre-populated starting basket for instant exploration
    { query: "Amul Taaza Toned Fresh Milk", quantity: 2, unit: "L", allowSubstitutions: false },
    { query: "Fresh Hybrid Red Onions", quantity: 1, unit: "kg", allowSubstitutions: false },
    { query: "Farm Fresh Table White Eggs (6 pcs)", quantity: 2, unit: "pcs", allowSubstitutions: false },
    { query: "Fortune Sunlite Refined Sunflower Oil (1 Litre)", quantity: 1, unit: "L", allowSubstitutions: false },
  ]);

  const [pincode, setPincode] = useState<string>("110001");
  const [locationName, setLocationName] = useState<string>("Connaught Place, New Delhi");
  const [preferences, setPreferences] = useState<UserPreferences>({
    strategy: "optimized_multi_platform",
    maxPlatforms: 3,
    minimumSavingsPaise: 2000, // ₹20
    minimumSavingsRupees: 20,
    allowSubstitutions: false,
  });

  const addItem = (newItem: BasketItem) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.query.toLowerCase() === newItem.query.toLowerCase()
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += newItem.quantity;
        return copy;
      }
      return [...prev, newItem];
    });
  };

  const addProduct = (product: ProductSummary, quantity: number = 1) => {
    addItem({
      query: product.name,
      quantity,
      unit: product.packSize,
      productId: product.id,
      matchedProduct: product,
      allowSubstitutions: false,
    });
  };

  const updateQuantity = (index: number, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((_, idx) => idx !== index);
      }
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity };
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearItems = () => setItems([]);

  const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);

  // Simple estimated total in rupees for the header badge
  const estimatedTotalRupees = items.reduce((sum, it) => {
    const unitEst = it.matchedProduct?.lowestPriceRupees || 55;
    return sum + unitEst * it.quantity;
  }, 0);

  return (
    <BasketContext.Provider
      value={{
        items,
        pincode,
        locationName,
        preferences,
        setPincode,
        setLocationName,
        setPreferences,
        addItem,
        addProduct,
        updateQuantity,
        removeItem,
        clearItems,
        itemCount,
        estimatedTotalRupees,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export function useBasket() {
  const context = useContext(BasketContext);
  if (!context) {
    throw new Error("useBasket must be used within a BasketProvider");
  }
  return context;
}
