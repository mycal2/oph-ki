"use client";

import { createContext, useState, useCallback, useMemo } from "react";
import type { CustomerCatalogItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the dealer was identified during checkout. */
export type DealerIdentificationMethod =
  | "customer_number"
  | "dropdown"
  | "manual";

/** Manual dealer entry fields (used when dealer is not in the system). */
export interface ManualDealerInfo {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
}

/** OPH-79: Structured delivery address for alternate shipping location. */
export interface DeliveryAddress {
  companyName: string;
  street: string;
  zipCode: string;
  city: string;
  country: string;
}

/** All checkout state shared across steps OPH-78, OPH-79, OPH-80. */
export interface CheckoutState {
  /** The method used to identify the dealer. */
  identificationMethod: DealerIdentificationMethod | null;
  /** The selected customer from the catalog (customer_number or dropdown). */
  selectedCustomer: CustomerCatalogItem | null;
  /** Manual dealer info (if dealer is not in the system). */
  manualDealer: ManualDealerInfo | null;
  /** Delivery address (OPH-79). */
  deliveryAddress: DeliveryAddress | null;
  /** Order notes (OPH-79). */
  notes: string;
}

export interface CheckoutContextValue extends CheckoutState {
  /** Set the dealer via customer number match. */
  setCustomerMatch: (customer: CustomerCatalogItem) => void;
  /** Set the dealer via dropdown selection. */
  setDropdownSelection: (customer: CustomerCatalogItem) => void;
  /** Set the dealer via manual entry. */
  setManualDealer: (info: ManualDealerInfo) => void;
  /** Clear the dealer identification (reset to initial state). */
  clearDealerIdentification: () => void;
  /** Set delivery address (OPH-79). */
  setDeliveryAddress: (address: DeliveryAddress | null) => void;
  /** Set notes (OPH-79). */
  setNotes: (notes: string) => void;
  /** Whether a dealer has been identified (any method). */
  isDealerIdentified: boolean;
  /** Reset all checkout state. */
  resetCheckout: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const CheckoutContext = createContext<CheckoutContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface CheckoutProviderProps {
  children: React.ReactNode;
}

const INITIAL_STATE: CheckoutState = {
  identificationMethod: null,
  selectedCustomer: null,
  manualDealer: null,
  deliveryAddress: null,
  notes: "",
};

/**
 * OPH-78: React Context provider that holds shared checkout state
 * across all three checkout steps (dealer, delivery, confirm).
 *
 * Wraps the Salesforce App layout inside BasketProvider so that
 * checkout pages and the header all share the same state.
 */
export function CheckoutProvider({ children }: CheckoutProviderProps) {
  const [state, setState] = useState<CheckoutState>(INITIAL_STATE);

  const setCustomerMatch = useCallback((customer: CustomerCatalogItem) => {
    setState((prev) => ({
      ...prev,
      identificationMethod: "customer_number",
      selectedCustomer: customer,
      manualDealer: null,
    }));
  }, []);

  const setDropdownSelection = useCallback((customer: CustomerCatalogItem) => {
    setState((prev) => ({
      ...prev,
      identificationMethod: "dropdown",
      selectedCustomer: customer,
      manualDealer: null,
    }));
  }, []);

  const setManualDealer = useCallback((info: ManualDealerInfo) => {
    setState((prev) => ({
      ...prev,
      identificationMethod: "manual",
      selectedCustomer: null,
      manualDealer: info,
    }));
  }, []);

  const clearDealerIdentification = useCallback(() => {
    setState((prev) => ({
      ...prev,
      identificationMethod: null,
      selectedCustomer: null,
      manualDealer: null,
    }));
  }, []);

  const setDeliveryAddress = useCallback((address: DeliveryAddress | null) => {
    setState((prev) => ({ ...prev, deliveryAddress: address }));
  }, []);

  const setNotes = useCallback((notes: string) => {
    setState((prev) => ({ ...prev, notes }));
  }, []);

  const resetCheckout = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const isDealerIdentified =
    state.identificationMethod !== null &&
    (state.selectedCustomer !== null || state.manualDealer !== null);

  const value = useMemo<CheckoutContextValue>(
    () => ({
      ...state,
      setCustomerMatch,
      setDropdownSelection,
      setManualDealer,
      clearDealerIdentification,
      setDeliveryAddress,
      setNotes,
      isDealerIdentified,
      resetCheckout,
    }),
    [
      state,
      setCustomerMatch,
      setDropdownSelection,
      setManualDealer,
      clearDealerIdentification,
      setDeliveryAddress,
      setNotes,
      isDealerIdentified,
      resetCheckout,
    ]
  );

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}
