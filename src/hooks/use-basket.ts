"use client";

import { useContext } from "react";
import { BasketContext } from "@/components/salesforce/basket-provider";
import type { BasketContextValue, BasketItem } from "@/components/salesforce/basket-provider";

// Re-export the BasketItem type for consumers
export type { BasketItem };

/**
 * OPH-77: Basket hook that reads from the shared BasketContext.
 *
 * Must be used within a <BasketProvider>.
 * All operations (add, remove, setQuantity, clear) are shared across
 * the entire Salesforce App — header badge, search page, and basket page.
 */
export function useBasket(): BasketContextValue {
  const context = useContext(BasketContext);

  if (!context) {
    throw new Error(
      "useBasket must be used within a <BasketProvider>. " +
        "Wrap your component tree with <BasketProvider> in the Salesforce layout."
    );
  }

  return context;
}
