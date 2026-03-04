/**
 * OPH-20: Server-side unit normalization fallback.
 *
 * This module provides a deterministic mapping table to normalize unit
 * abbreviations to German standard terms. It acts as a safety net after
 * the Claude extraction prompt (which is instructed to output German units)
 * in case the model returns unexpected or untranslated abbreviations.
 */

import type { CanonicalOrderData } from "@/lib/types";

/**
 * Mapping from lowercase unit abbreviation to the German standard term.
 * The prompt already instructs Claude to use these terms, so this table
 * only fires when Claude returns something unexpected.
 */
const UNIT_MAP: Record<string, string> = {
  // Stueck
  pc: "Stueck",
  pcs: "Stueck",
  piece: "Stueck",
  pieces: "Stueck",
  unit: "Stueck",
  units: "Stueck",
  ea: "Stueck",
  each: "Stueck",
  stk: "Stueck",
  "stueck": "Stueck",
  "stück": "Stueck",
  "unité": "Stueck",
  unite: "Stueck",
  "pièce": "Stueck",
  pieza: "Stueck",
  ks: "Stueck",
  szt: "Stueck",

  // Packung
  pkg: "Packung",
  pack: "Packung",
  package: "Packung",
  pkt: "Packung",
  pckg: "Packung",
  packung: "Packung",

  // Karton
  box: "Karton",
  bx: "Karton",
  ctn: "Karton",
  carton: "Karton",
  cs: "Karton",
  case: "Karton",
  karton: "Karton",

  // Flasche
  btl: "Flasche",
  bottle: "Flasche",
  flasche: "Flasche",
  fl: "Flasche",

  // Dose
  can: "Dose",
  tin: "Dose",
  dose: "Dose",
  ds: "Dose",

  // Tube
  tube: "Tube",
  tb: "Tube",
  tub: "Tube",

  // Beutel
  bag: "Beutel",
  beutel: "Beutel",
  sachet: "Beutel",

  // Rolle
  roll: "Rolle",
  rll: "Rolle",
  rolle: "Rolle",

  // Paar
  pair: "Paar",
  pr: "Paar",
  paar: "Paar",

  // Set
  set: "Set",
  kit: "Set",

  // Liter
  l: "Liter",
  lt: "Liter",
  liter: "Liter",
  litre: "Liter",

  // Milliliter
  ml: "Milliliter",
  milliliter: "Milliliter",

  // Gramm
  g: "Gramm",
  gr: "Gramm",
  gramm: "Gramm",
  gram: "Gramm",

  // Kilogramm
  kg: "Kilogramm",
  kilogramm: "Kilogramm",
  kilogram: "Kilogramm",

  // Meter
  m: "Meter",
  meter: "Meter",
  metre: "Meter",
};

/** The set of valid German standard terms (for fast lookup). */
const VALID_GERMAN_UNITS = new Set(Object.values(UNIT_MAP));

/**
 * Normalizes a single unit string to its German standard term.
 *
 * - If the unit is already a valid German term, return it as-is.
 * - If it can be mapped via UNIT_MAP, return the mapped value.
 * - If it cannot be mapped, return the original with "(unbekannt)" suffix.
 * - If the unit is null/empty, return "Stueck" as default.
 */
export function normalizeUnit(unit: string | null): string {
  if (!unit || unit.trim() === "") {
    return "Stueck";
  }

  const trimmed = unit.trim();

  // Already a valid German standard term
  if (VALID_GERMAN_UNITS.has(trimmed)) {
    return trimmed;
  }

  // Lookup in mapping table (case-insensitive)
  const mapped = UNIT_MAP[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  // Unknown unit -- mark it so users can identify and correct
  // Don't double-mark if already marked
  if (trimmed.endsWith("(unbekannt)")) {
    return trimmed;
  }

  return `${trimmed} (unbekannt)`;
}

/**
 * Applies unit normalization to all line items in extracted data.
 * Returns a new CanonicalOrderData object (does not mutate the input).
 */
export function normalizeUnits(data: CanonicalOrderData): CanonicalOrderData {
  const normalizedLineItems = data.order.line_items.map((item) => ({
    ...item,
    unit: normalizeUnit(item.unit),
  }));

  return {
    ...data,
    order: {
      ...data.order,
      line_items: normalizedLineItems,
    },
  };
}
