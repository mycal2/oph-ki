"use client";

import { useContext } from "react";
import { CheckoutContext } from "@/components/salesforce/checkout-provider";
import type { CheckoutContextValue } from "@/components/salesforce/checkout-provider";

// Re-export types for consumers
export type {
  CheckoutContextValue,
  DealerIdentificationMethod,
  ManualDealerInfo,
  CheckoutState,
} from "@/components/salesforce/checkout-provider";

/**
 * OPH-78: Checkout hook that reads from the shared CheckoutContext.
 *
 * Must be used within a <CheckoutProvider>.
 * All checkout state (dealer identification, delivery, notes) is shared
 * across the three checkout steps.
 */
export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);

  if (!context) {
    throw new Error(
      "useCheckout must be used within a <CheckoutProvider>. " +
        "Wrap your component tree with <CheckoutProvider> in the Salesforce layout."
    );
  }

  return context;
}
