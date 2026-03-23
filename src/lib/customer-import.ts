/**
 * OPH-46: Shared utility for parsing customer catalog CSV/Excel files.
 * Uses the `xlsx` package (already installed) to handle both formats.
 * Mirrors the structure of article-import.ts (OPH-39).
 */
import * as XLSX from "xlsx";

/** Column name mapping: accepted header labels (case-insensitive) -> canonical field name. */
const COLUMN_MAP: Record<string, string> = {
  // customer_number
  "customer_number": "customer_number",
  "kundennummer": "customer_number",
  "kd.-nr.": "customer_number",
  "kd.nr.": "customer_number",
  "kd-nr": "customer_number",
  "kundennr": "customer_number",
  // company_name
  "company_name": "company_name",
  "firma": "company_name",
  "unternehmen": "company_name",
  "unternehmensname": "company_name",
  "company": "company_name",
  // street
  "street": "street",
  "strasse": "street",
  "straße": "street",
  "adresse": "street",
  "address": "street",
  // postal_code
  "postal_code": "postal_code",
  "plz": "postal_code",
  "postleitzahl": "postal_code",
  "zip": "postal_code",
  "zip_code": "postal_code",
  // city
  "city": "city",
  "stadt": "city",
  "ort": "city",
  // country
  "country": "country",
  "land": "country",
  // email
  "email": "email",
  "e-mail": "email",
  "e_mail": "email",
  // phone
  "phone": "phone",
  "telefon": "phone",
  "tel.": "phone",
  "tel": "phone",
  "telefonnummer": "phone",
  // keywords
  "keywords": "keywords",
  "suchbegriffe": "keywords",
  "aliase": "keywords",
  "suchbegriffe / aliase": "keywords",
};

export interface ParsedCustomerRow {
  customer_number: string;
  company_name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  keywords: string | null;
}

export interface CustomerParseResult {
  rows: ParsedCustomerRow[];
  errors: string[];
  /** Column headers found in the file (for diagnostics). */
  detectedHeaders: string[];
}

/**
 * Parses an uploaded file buffer (CSV or Excel) into customer rows.
 * Deduplicates by customer_number (last row wins, per spec EC-2).
 */
export function parseCustomerFile(buffer: Buffer, filename: string): CustomerParseResult {
  const errors: string[] = [];

  // Parse with xlsx (handles both CSV and Excel)
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    codepage: 65001, // UTF-8
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["Datei enthaelt keine Tabellenblaetter."], detectedHeaders: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  // Convert to array of arrays (first row = headers)
  const rawData: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as string[][];

  if (rawData.length < 2) {
    return {
      rows: [],
      errors: ["Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten."],
      detectedHeaders: rawData[0]?.map(String) ?? [],
    };
  }

  // Map headers to canonical field names
  const rawHeaders = rawData[0].map((h) => String(h).trim());
  const detectedHeaders = [...rawHeaders];
  const fieldIndexes: Record<string, number> = {};

  for (let i = 0; i < rawHeaders.length; i++) {
    const normalized = rawHeaders[i].toLowerCase().trim();
    const canonicalField = COLUMN_MAP[normalized];
    if (canonicalField && fieldIndexes[canonicalField] === undefined) {
      fieldIndexes[canonicalField] = i;
    }
  }

  // Require customer_number and company_name columns (EC-9)
  if (fieldIndexes["customer_number"] === undefined) {
    errors.push(
      "Spalte 'Kundennummer' (oder 'customer_number', 'Kd.-Nr.', 'Kd.Nr.', 'Kd-Nr', 'KundenNr') nicht gefunden."
    );
  }
  if (fieldIndexes["company_name"] === undefined) {
    errors.push(
      "Spalte 'Firma' (oder 'company_name', 'Unternehmen', 'Unternehmensname', 'Company') nicht gefunden."
    );
  }

  if (errors.length > 0) {
    return { rows: [], errors, detectedHeaders };
  }

  const custNumIdx = fieldIndexes["customer_number"]!;
  const companyIdx = fieldIndexes["company_name"]!;

  // Parse rows, deduplicate by customer_number (last wins, EC-2)
  const rowMap = new Map<string, ParsedCustomerRow>();

  for (let i = 1; i < rawData.length; i++) {
    const cols = rawData[i];
    // EC-8: Strip all spaces from customer_number
    const customerNumber = String(cols[custNumIdx] ?? "").replace(/\s+/g, "");
    const companyName = String(cols[companyIdx] ?? "").trim();

    if (!customerNumber || !companyName) {
      errors.push(
        `Zeile ${i + 1}: Kundennummer oder Firma fehlt -- uebersprungen.`
      );
      continue;
    }

    if (customerNumber.length > 200) {
      errors.push(`Zeile ${i + 1}: Kundennummer zu lang (max. 200 Zeichen) -- uebersprungen.`);
      continue;
    }

    if (companyName.length > 500) {
      errors.push(`Zeile ${i + 1}: Firma zu lang (max. 500 Zeichen) -- uebersprungen.`);
      continue;
    }

    const getField = (field: string, maxLen: number): string | null => {
      const idx = fieldIndexes[field];
      if (idx === undefined) return null;
      const val = String(cols[idx] ?? "").trim();
      return val.length > 0 ? val.substring(0, maxLen) : null;
    };

    rowMap.set(customerNumber.toLowerCase(), {
      customer_number: customerNumber,
      company_name: companyName,
      street: getField("street", 500),
      postal_code: getField("postal_code", 20),
      city: getField("city", 200),
      country: getField("country", 100),
      email: getField("email", 320),
      phone: getField("phone", 50),
      keywords: getField("keywords", 1000),
    });
  }

  return {
    rows: Array.from(rowMap.values()),
    errors,
    detectedHeaders,
  };
}
