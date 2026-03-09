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
  XmlStructureNode,
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
    throw new Error("Die Datei enthält keine Daten. Bitte laden Sie eine Datei mit Spaltenköpfen hoch.");
  }

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));

  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new Error("Keine Spaltenköpfe erkannt. Bitte laden Sie eine Datei mit einer Kopfzeile hoch.");
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
    throw new Error("Die Excel-Datei enthält keine Arbeitsblätter.");
  }

  if (workbook.SheetNames.length > 1) {
    warnings.push(`Die Datei enthält ${workbook.SheetNames.length} Arbeitsblätter. Nur das erste wird analysiert.`);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length === 0) {
    throw new Error("Das Arbeitsblatt enthält keine Daten. Bitte laden Sie eine Datei mit Spaltenköpfen hoch.");
  }

  const headers = rows[0].map((h) => String(h).trim());

  if (headers.length === 0 || headers.every((h) => h === "")) {
    throw new Error("Keine Spaltenköpfe erkannt. Bitte laden Sie eine Datei mit einer Kopfzeile hoch.");
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
    throw new Error("Die XML-Datei konnte nicht geparst werden. Bitte prüfen Sie das Format.");
  }

  // Find the first array of records in the parsed XML
  const records = findRecordArray(parsed);

  if (!records || records.length === 0) {
    throw new Error("Keine Datensätze in der XML-Datei gefunden. Die Datei muss wiederholende Elemente enthalten.");
  }

  const limited = records.slice(0, MAX_RECORDS);
  if (records.length > MAX_RECORDS) {
    warnings.push(`${records.length} Datensätze gefunden. Nur die ersten ${MAX_RECORDS} werden für die Schema-Erkennung verwendet.`);
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
    throw new Error("Keine Felder in den XML-Datensätzen erkannt.");
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

  // OPH-30: Extract the XML structure tree for template generation
  const xml_structure = buildXmlStructureTree(parsed);

  return {
    file_name: "",
    file_type: "xml",
    detected_schema,
    column_count: detected_schema.length,
    required_column_count: detected_schema.filter((c) => c.is_required).length,
    warnings,
    xml_structure,
  };
}

/**
 * OPH-30: Build a simplified XML structure tree from a parsed XML object.
 * Preserves element hierarchy, attributes, and marks repeating arrays.
 */
function buildXmlStructureTree(parsed: unknown): XmlStructureNode | null {
  if (typeof parsed !== "object" || parsed === null) return null;

  const entries = Object.entries(parsed as Record<string, unknown>);
  // Skip processing hints like ?xml declaration
  const contentEntries = entries.filter(([key]) => !key.startsWith("?"));

  if (contentEntries.length === 0) return null;

  // The root is typically a single element wrapping everything
  if (contentEntries.length === 1) {
    const [tag, value] = contentEntries[0];
    return buildNode(tag, value);
  }

  // Multiple root-level elements — wrap in a virtual root
  const children: XmlStructureNode[] = [];
  for (const [tag, value] of contentEntries) {
    const node = buildNode(tag, value);
    if (node) children.push(node);
  }
  return children.length === 1 ? children[0] : { tag: "root", children };
}

function buildNode(tag: string, value: unknown): XmlStructureNode | null {
  // Skip XSD schema definitions
  if (tag.startsWith("xsd:") || tag.startsWith("xs:")) return null;

  if (value === null || value === undefined) {
    return { tag, text: "" };
  }

  if (typeof value !== "object") {
    return { tag, text: String(value) };
  }

  if (Array.isArray(value)) {
    // This is a repeating element — take the first record as representative
    const node: XmlStructureNode = { tag, is_array: true };
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      node.children = buildChildNodes(value[0] as Record<string, unknown>);
    }
    return node;
  }

  // Object — check for attributes and child elements
  const obj = value as Record<string, unknown>;
  const attributes: Record<string, string> = {};
  const childEntries: [string, unknown][] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("@_")) {
      attributes[key.slice(2)] = String(val ?? "");
    } else {
      childEntries.push([key, val]);
    }
  }

  const node: XmlStructureNode = { tag };
  if (Object.keys(attributes).length > 0) {
    node.attributes = attributes;
  }

  if (childEntries.length === 0) {
    // Element with only attributes, no children
    node.text = "";
    return node;
  }

  // Check if it's a text-only element (single #text child from parser)
  if (childEntries.length === 1 && childEntries[0][0] === "#text") {
    node.text = String(childEntries[0][1] ?? "");
    return node;
  }

  const children = buildChildNodes(
    Object.fromEntries(childEntries) as Record<string, unknown>
  );
  if (children.length > 0) {
    node.children = children;
  }

  return node;
}

function buildChildNodes(obj: Record<string, unknown>): XmlStructureNode[] {
  const children: XmlStructureNode[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("@_") || key.startsWith("?")) continue;
    const node = buildNode(key, val);
    if (node) children.push(node);
  }
  return children;
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
    throw new Error("Die JSON-Datei konnte nicht geparst werden. Bitte prüfen Sie das Format.");
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
    throw new Error("Die JSON-Datei muss ein Array oder ein Objekt mit Datensätzen enthalten.");
  }

  if (records.length === 0) {
    throw new Error("Keine Datensätze in der JSON-Datei gefunden.");
  }

  const limited = records.slice(0, MAX_RECORDS);
  if (records.length > MAX_RECORDS) {
    warnings.push(`${records.length} Datensätze gefunden. Nur die ersten ${MAX_RECORDS} werden für die Schema-Erkennung verwendet.`);
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
    throw new Error("Keine Felder in den JSON-Datensätzen erkannt.");
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
      throw new Error(`Nicht unterstützter Dateityp: ${fileType}`);
  }

  result.file_name = fileName;
  return result;
}
