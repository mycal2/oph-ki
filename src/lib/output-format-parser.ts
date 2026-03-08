/**
 * OPH-28: Output Format Sample File Parser
 *
 * Parses uploaded sample files (CSV, XLSX, XML, JSON) and extracts
 * the output schema: column/field names, inferred data types, and
 * whether each column is required (has non-empty values in sample data).
 */

import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import type {
  OutputFormatFileType,
  OutputFormatDataType,
  OutputFormatSchemaColumn,
  OutputFormatParseResponse,
} from "@/lib/types";

/** Max records to scan in XML/JSON for schema inference. */
const MAX_RECORDS = 100;

/** Max file size in bytes (10 MB). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types mapped to our file types. */
const MIME_TYPE_MAP: Record<string, OutputFormatFileType> = {
  "text/csv": "csv",
  "text/plain": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "text/xml": "xml",
  "application/xml": "xml",
  "application/json": "json",
};

/** File extension to file type mapping (fallback). */
const EXTENSION_MAP: Record<string, OutputFormatFileType> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".xls": "xlsx",
  ".xml": "xml",
  ".json": "json",
};

/**
 * Detect file type from MIME type and filename extension.
 */
export function detectFileType(
  mimeType: string,
  fileName: string
): OutputFormatFileType | null {
  // Try MIME type first
  const fromMime = MIME_TYPE_MAP[mimeType.toLowerCase()];
  if (fromMime) return fromMime;

  // Fallback to extension
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext) return EXTENSION_MAP[ext] ?? null;

  return null;
}

/**
 * Infer the data type from a string value.
 */
function inferDataType(value: string): OutputFormatDataType {
  if (!value || value.trim() === "") return "text";

  const trimmed = value.trim();

  // Check date patterns (common formats: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY)
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    /^\d{2}[./]\d{2}[./]\d{4}$/.test(trimmed) ||
    /^\d{2}-\d{2}-\d{4}$/.test(trimmed)
  ) {
    return "date";
  }

  // Check number patterns (allow comma or dot as decimal separator, optional thousands separators)
  if (/^-?[\d.,]+$/.test(trimmed)) {
    // Exclude values that look like dates or identifiers with many dots
    const dotCount = (trimmed.match(/\./g) || []).length;
    const commaCount = (trimmed.match(/,/g) || []).length;

    if (dotCount <= 1 && commaCount <= 1) {
      return "number";
    }
  }

  return "text";
}

/**
 * Determine the dominant data type from an array of values.
 */
function dominantType(values: string[]): OutputFormatDataType {
  const nonEmpty = values.filter((v) => v && v.trim() !== "");
  if (nonEmpty.length === 0) return "text";

  const counts: Record<OutputFormatDataType, number> = { text: 0, number: 0, date: 0 };
  for (const v of nonEmpty) {
    counts[inferDataType(v)]++;
  }

  // If majority is number or date, use that; otherwise text
  if (counts.date > nonEmpty.length / 2) return "date";
  if (counts.number > nonEmpty.length / 2) return "number";
  return "text";
}

// ---------- CSV Parser ----------

function parseCSV(content: string): OutputFormatParseResponse {
  const warnings: string[] = [];

  // Auto-detect delimiter (semicolon or comma)
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolons >= commas ? ";" : ",";

  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    throw new Error("Die Datei enthaelt keine Daten. Bitte laden Sie eine Datei mit Spaltenkoepfen hoch.");
  }

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));

  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new Error("Keine Spaltenkoepfe erkannt. Bitte laden Sie eine Datei mit einer Kopfzeile hoch.");
  }

  const dataRows = lines.slice(1);

  if (dataRows.length === 0) {
    warnings.push("Keine Datenzeilen vorhanden. Alle Spalten werden als 'erforderlich' markiert.");
  }

  // Collect values per column
  const columnValues: string[][] = headers.map(() => []);
  for (const row of dataRows) {
    const cells = row.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    for (let i = 0; i < headers.length; i++) {
      columnValues[i].push(cells[i] ?? "");
    }
  }

  const detected_schema: OutputFormatSchemaColumn[] = headers.map((name, i) => {
    const values = columnValues[i];
    const hasNonEmpty = dataRows.length === 0 || values.some((v) => v && v.trim() !== "");
    return {
      column_name: name,
      data_type: dominantType(values),
      is_required: hasNonEmpty,
    };
  });

  return {
    file_name: "",
    file_type: "csv",
    detected_schema,
    column_count: detected_schema.length,
    required_column_count: detected_schema.filter((c) => c.is_required).length,
    warnings,
  };
}

// ---------- XLSX Parser ----------

function parseXLSX(buffer: ArrayBuffer): OutputFormatParseResponse {
  const warnings: string[] = [];
  const workbook = XLSX.read(buffer, { type: "array" });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Die Excel-Datei enthaelt keine Arbeitsblaetter.");
  }

  if (workbook.SheetNames.length > 1) {
    warnings.push(`Die Datei enthaelt ${workbook.SheetNames.length} Arbeitsblaetter. Nur das erste wird analysiert.`);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length === 0) {
    throw new Error("Das Arbeitsblatt enthaelt keine Daten. Bitte laden Sie eine Datei mit Spaltenkoepfen hoch.");
  }

  const headers = rows[0].map((h) => String(h).trim());

  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new Error("Keine Spaltenkoepfe erkannt. Bitte laden Sie eine Datei mit einer Kopfzeile hoch.");
  }

  const dataRows = rows.slice(1);

  if (dataRows.length === 0) {
    warnings.push("Keine Datenzeilen vorhanden. Alle Spalten werden als 'erforderlich' markiert.");
  }

  const columnValues: string[][] = headers.map(() => []);
  for (const row of dataRows) {
    for (let i = 0; i < headers.length; i++) {
      columnValues[i].push(String(row[i] ?? "").trim());
    }
  }

  const detected_schema: OutputFormatSchemaColumn[] = headers.map((name, i) => {
    const values = columnValues[i];
    const hasNonEmpty = dataRows.length === 0 || values.some((v) => v && v.trim() !== "");
    return {
      column_name: name,
      data_type: dominantType(values),
      is_required: hasNonEmpty,
    };
  });

  return {
    file_name: "",
    file_type: "xlsx",
    detected_schema,
    column_count: detected_schema.length,
    required_column_count: detected_schema.filter((c) => c.is_required).length,
    warnings,
  };
}

// ---------- XML Parser ----------

function parseXML(content: string): OutputFormatParseResponse {
  const warnings: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(content);
  } catch {
    throw new Error("Die XML-Datei konnte nicht geparst werden. Bitte pruefen Sie das Format.");
  }

  // Find the first array of records in the parsed XML
  const records = findRecordArray(parsed);

  if (!records || records.length === 0) {
    throw new Error("Keine Datensaetze in der XML-Datei gefunden. Die Datei muss wiederholende Elemente enthalten.");
  }

  const limited = records.slice(0, MAX_RECORDS);
  if (records.length > MAX_RECORDS) {
    warnings.push(`${records.length} Datensaetze gefunden. Nur die ersten ${MAX_RECORDS} werden fuer die Schema-Erkennung verwendet.`);
  }

  // Collect all field names across records (union)
  const fieldMap = new Map<string, string[]>();
  for (const record of limited) {
    if (typeof record === "object" && record !== null) {
      for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
        if (!fieldMap.has(key)) fieldMap.set(key, []);
        fieldMap.get(key)!.push(String(value ?? ""));
      }
    }
  }

  if (fieldMap.size === 0) {
    throw new Error("Keine Felder in den XML-Datensaetzen erkannt.");
  }

  const detected_schema: OutputFormatSchemaColumn[] = [];
  for (const [name, values] of fieldMap) {
    const hasNonEmpty = values.some((v) => v && v.trim() !== "");
    detected_schema.push({
      column_name: name,
      data_type: dominantType(values),
      is_required: hasNonEmpty,
    });
  }

  return {
    file_name: "",
    file_type: "xml",
    detected_schema,
    column_count: detected_schema.length,
    required_column_count: detected_schema.filter((c) => c.is_required).length,
    warnings,
  };
}

/**
 * Recursively find the first array of objects in a parsed XML structure.
 * Uses breadth-first search so that data arrays (e.g. `bestexp2`) at the
 * same level are found before deeply nested schema/XSD definition arrays.
 */
function findRecordArray(obj: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      return obj as Record<string, unknown>[];
    }
  }

  if (typeof obj === "object" && obj !== null) {
    const entries = Object.entries(obj as Record<string, unknown>);

    // Breadth-first: check all direct children for arrays first
    for (const [, value] of entries) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
        return value as Record<string, unknown>[];
      }
    }

    // Then recurse into child objects (skip XSD schema namespaced keys)
    for (const [key, value] of entries) {
      if (key.startsWith("xsd:") || key.startsWith("xs:")) continue;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const found = findRecordArray(value);
        if (found) return found;
      }
    }
  }

  return null;
}

// ---------- JSON Parser ----------

function parseJSON(content: string): OutputFormatParseResponse {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Die JSON-Datei konnte nicht geparst werden. Bitte pruefen Sie das Format.");
  }

  // Find array of records
  let records: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    records = parsed.filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    );
  } else if (typeof parsed === "object" && parsed !== null) {
    // Look for the first array property
    const found = findJsonRecordArray(parsed as Record<string, unknown>);
    if (found) {
      records = found;
    } else {
      // Single object — treat as one record
      records = [parsed as Record<string, unknown>];
    }
  } else {
    throw new Error("Die JSON-Datei muss ein Array oder ein Objekt mit Datensaetzen enthalten.");
  }

  if (records.length === 0) {
    throw new Error("Keine Datensaetze in der JSON-Datei gefunden.");
  }

  const limited = records.slice(0, MAX_RECORDS);
  if (records.length > MAX_RECORDS) {
    warnings.push(`${records.length} Datensaetze gefunden. Nur die ersten ${MAX_RECORDS} werden fuer die Schema-Erkennung verwendet.`);
  }

  // Collect all field names across records (union)
  const fieldMap = new Map<string, string[]>();
  for (const record of limited) {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "object" && value !== null) continue; // Skip nested objects
      if (!fieldMap.has(key)) fieldMap.set(key, []);
      fieldMap.get(key)!.push(String(value ?? ""));
    }
  }

  if (fieldMap.size === 0) {
    throw new Error("Keine Felder in den JSON-Datensaetzen erkannt.");
  }

  const detected_schema: OutputFormatSchemaColumn[] = [];
  for (const [name, values] of fieldMap) {
    const hasNonEmpty = values.some((v) => v && v.trim() !== "" && v !== "null" && v !== "undefined");
    detected_schema.push({
      column_name: name,
      data_type: dominantType(values),
      is_required: hasNonEmpty,
    });
  }

  return {
    file_name: "",
    file_type: "json",
    detected_schema,
    column_count: detected_schema.length,
    required_column_count: detected_schema.filter((c) => c.is_required).length,
    warnings,
  };
}

function findJsonRecordArray(obj: Record<string, unknown>): Record<string, unknown>[] | null {
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      return value as Record<string, unknown>[];
    }
  }
  return null;
}

// ---------- Main Parse Function ----------

/**
 * Parse an uploaded sample file and extract the output schema.
 *
 * @param buffer - File content as ArrayBuffer
 * @param fileName - Original file name
 * @param fileType - Detected file type
 * @returns Parsed schema response
 */
export async function parseOutputFormatSample(
  buffer: ArrayBuffer,
  fileName: string,
  fileType: OutputFormatFileType
): Promise<OutputFormatParseResponse> {
  let result: OutputFormatParseResponse;

  switch (fileType) {
    case "csv": {
      const text = new TextDecoder("utf-8").decode(buffer);
      result = parseCSV(text);
      break;
    }
    case "xlsx":
      result = parseXLSX(buffer);
      break;
    case "xml": {
      const text = new TextDecoder("utf-8").decode(buffer);
      result = parseXML(text);
      break;
    }
    case "json": {
      const text = new TextDecoder("utf-8").decode(buffer);
      result = parseJSON(text);
      break;
    }
    default:
      throw new Error(`Nicht unterstuetzter Dateityp: ${fileType}`);
  }

  result.file_name = fileName;
  return result;
}
