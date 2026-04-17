"use client";

import { createContext, useState, useCallback, useMemo } from "react";
import type { ArticleCatalogItem } from "@/lib/types";

/** A single item in the basket. */
export interface BasketItem {
  article: ArticleCatalogItem;
  quantity: number;
}

export interface BasketContextValue {
  /** All items currently in the basket. */
  items: BasketItem[];
  /** Total number of items (sum of quantities). */
  itemCount: number;
  /** Add 1x of an article to the basket. If already present, increments quantity. */
  addToBasket: (article: ArticleCatalogItem) => void;
  /** Remove an article entirely from the basket. */
  removeFromBasket: (articleId: string) => void;
  /** Update quantity for a specific article. Removes if quantity <= 0. */
  setQuantity: (articleId: string, quantity: number) => void;
  /** Clear the entire basket. */
  clearBasket: () => void;
}

export const BasketContext = createContext<BasketContextValue | null>(null);

interface BasketProviderProps {
  children: React.ReactNode;
}

/**
 * OPH-77: React Context provider that holds shared basket state.
 *
 * Wraps the Salesforce App layout so that the header (badge count),
 * search page (add to basket), and basket page (view/edit) all
 * share the same in-memory basket.
 *
 * Data is session-based (clears on tab close) as specified in the feature spec.
 */
export function BasketProvider({ children }: BasketProviderProps) {
  const [items, setItems] = useState<BasketItem[]>([]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const addToBasket = useCallback((article: ArticleCatalogItem) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.article.id === article.id);
      if (existing) {
        return prev.map((item) =>
          item.article.id === article.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { article, quantity: 1 }];
    });
  }, []);

  const removeFromBasket = useCallback((articleId: string) => {
    setItems((prev) => prev.filter((item) => item.article.id !== articleId));
  }, []);

  const setQuantity = useCallback((articleId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.article.id !== articleId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.article.id === articleId ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearBasket = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<BasketContextValue>(
    () => ({
      items,
      itemCount,
      addToBasket,
      removeFromBasket,
      setQuantity,
      clearBasket,
    }),
    [items, itemCount, addToBasket, removeFromBasket, setQuantity, clearBasket]
  );

  return (
    <BasketContext.Provider value={value}>{children}</BasketContext.Provider>
  );
}
