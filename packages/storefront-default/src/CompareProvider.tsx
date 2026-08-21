"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Product } from "@aether-commerce/schemas";
import { readCompareProducts, toggleCompareProduct, removeCompareProduct, clearCompareProducts } from "./compare-client";
import type { ToggleCompareResult } from "./compare-client";

export type CompareContextValue = {
  products: Product[];
  isComparing: (productId: string) => boolean;
  toggle: (product: Product) => ToggleCompareResult;
  remove: (productId: string) => void;
  clear: () => void;
};

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);

  const refresh = useCallback(() => {
    setProducts(readCompareProducts());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("aether-compare-changed", refresh);
    return () => window.removeEventListener("aether-compare-changed", refresh);
  }, [refresh]);

  const isComparing = useCallback((productId: string) => products.some((product) => product.id === productId), [products]);

  const toggle = useCallback(
    (product: Product) => {
      const result = toggleCompareProduct(product);
      refresh();
      return result;
    },
    [refresh]
  );

  const remove = useCallback(
    (productId: string) => {
      removeCompareProduct(productId);
      refresh();
    },
    [refresh]
  );

  const clear = useCallback(() => {
    clearCompareProducts();
    refresh();
  }, [refresh]);

  const value = useMemo<CompareContextValue>(
    () => ({ products, isComparing, toggle, remove, clear }),
    [products, isComparing, toggle, remove, clear]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error("useCompare must be used within CompareProvider");
  }
  return context;
}
