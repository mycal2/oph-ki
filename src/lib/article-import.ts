/**
 * OPH-39: Shared utility for parsing article catalog CSV/Excel files.
 * Uses the `xlsx` package (already installed) to handle both formats.
 */
import * as XLSX from "xlsx";

/** Column name mapping: accepted header labels (case-insensitive) → canonical field name. */
const COLUMN_MAP: Record<string, string> = {
  // article_number
  "article_number": "article_number",
  "artikelnummer": "article_number",
  "herst.-art.-nr.": "article_number",
  "herst-art-nr": "article_number",
  "herst art nr": "article_number",
  "art.-nr.": "article_number",
  "art-nr": "article_number",
  "art nr": "article_number",
  "artnr": "article_number",
  // name
  "name": "name",
  "artikelbezeichnung": "name",
  "bezeichnung": "name",
  "description": "name",
  "produktname": "name",
  // category
  "category": "category",
  "kategorie": "category",
  // color
  "color": "color",
  "farbe": "color",
  "shade": "color",
  "farbe / shade": "color",
  "farbe/shade": "color",
  // packaging
  "packaging": "packaging",
  "verpackung": "packaging",
  "verpackungseinheit": "packaging",
  "vpe": "packaging",
  // ref_no
  "ref_no": "ref_no",
  "ref-nr": "ref_no",
  "ref.-nr.": "ref_no",
  "ref nr": "ref_no",
  "referenznummer": "ref_no",
  "reference": "ref_no",
  // gtin
  "gtin": "gtin",
  "ean": "gtin",
  "gtin / ean": "gtin",
  "gtin/ean": "gtin",
  "barcode": "gtin",
  // size1
  "size1": "size1",
  "groesse 1": "size1",
  "groesse1": "size1",
  "größe 1": "size1",
  "größe1": "size1",
  // size2
  "size2": "size2",
  "groesse 2": "size2",
  "groesse2": "size2",
  "größe 2": "size2",
  "größe2": "size2",
  // keywords
  "keywords": "keywords",
  "suchbegriffe": "keywords",
  "aliase": "keywords",
  "suchbegriffe / aliase": "keywords",
};

export interface ParsedArticleRow {
  article_number: string;
  name: string;
  category: string | null;
  color: string | null;
  packaging: string | null;
  size1: string | null;
  size2: string | null;
  ref_no: string | null;
  gtin: string | null;
  keywords: string | null;
}

export interface ParseResult {
  rows: ParsedArticleRow[];
  errors: string[];
  /** Column headers found in the file (for diagnostics). */
  detectedHeaders: string[];
}

/**
 * Parses an uploaded file buffer (CSV or Excel) into article rows.
 * Deduplicates by article_number (last row wins, per spec EC-2).
 */
export function parseArticleFile(buffer: Buffer, filename: string): ParseResult {
  const errors: string[] = [];
  const isExcel = /\.xlsx?$/i.test(filename);

  // Parse with xlsx (handles both CSV and Excel)
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    codepage: 65001, // UTF-8
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["Datei enthält keine Tabellenblätter."], detectedHeaders: [] };
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

  // Require article_number and name columns
  if (fieldIndexes["article_number"] === undefined) {
    errors.push(
      "Spalte 'Herst.-Art.-Nr.' (oder 'article_number', 'Artikelnummer', 'Art.-Nr.') nicht gefunden."
    );
  }
  if (fieldIndexes["name"] === undefined) {
    errors.push(
      "Spalte 'Artikelbezeichnung' (oder 'name', 'Bezeichnung') nicht gefunden."
    );
  }

  if (errors.length > 0) {
    return { rows: [], errors, detectedHeaders };
  }

  const artNumIdx = fieldIndexes["article_number"]!;
  const nameIdx = fieldIndexes["name"]!;

  // Parse rows, deduplicate by article_number (last wins, EC-2)
  const rowMap = new Map<string, ParsedArticleRow>();

  for (let i = 1; i < rawData.length; i++) {
    const cols = rawData[i];
    const articleNumber = String(cols[artNumIdx] ?? "").replace(/\s+/g, "");
    const articleName = String(cols[nameIdx] ?? "").trim();

    if (!articleNumber || !articleName) {
      errors.push(
        `Zeile ${i + 1}: Herst.-Art.-Nr. oder Artikelbezeichnung fehlt — übersprungen.`
      );
      continue;
    }

    if (articleNumber.length > 200) {
      errors.push(`Zeile ${i + 1}: Herst.-Art.-Nr. zu lang (max. 200 Zeichen) — übersprungen.`);
      continue;
    }

    if (articleName.length > 500) {
      errors.push(`Zeile ${i + 1}: Artikelbezeichnung zu lang (max. 500 Zeichen) — übersprungen.`);
      continue;
    }

    const getField = (field: string, maxLen: number): string | null => {
      const idx = fieldIndexes[field];
      if (idx === undefined) return null;
      const val = String(cols[idx] ?? "").trim();
      return val.length > 0 ? val.substring(0, maxLen) : null;
    };

    rowMap.set(articleNumber.toLowerCase(), {
      article_number: articleNumber,
      name: articleName,
      category: getField("category", 200),
      color: getField("color", 200),
      packaging: getField("packaging", 200),
      size1: getField("size1", 200),
      size2: getField("size2", 200),
      ref_no: getField("ref_no", 200),
      gtin: getField("gtin", 50),
      keywords: getField("keywords", 1000),
    });
  }

  return {
    rows: Array.from(rowMap.values()),
    errors,
    detectedHeaders,
  };
}
