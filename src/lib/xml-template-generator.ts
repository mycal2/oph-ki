/**
 * OPH-30: Auto-Generate XML Template from Output Format Sample
 *
 * Generates a Handlebars XML template from the detected schema of an
 * uploaded output format sample file. Runs client-side (pure string
 * transformation of the detected schema, no API call needed).
 *
 * - XML samples: preserves original nesting, element names, and attributes
 * - CSV/XLSX/JSON samples: config name (slugified) as root element,
 *   columns as child elements
 * - All formats: wraps repeating records in {{#each order.line_items}}...{{/each}}
 * - Uses original column names as placeholder values (not Handlebars variables)
 * - Validates generated template with Handlebars.compile()
 */

import Handlebars from "handlebars";
import type { OutputFormatSchemaColumn, OutputFormatFileType, XmlStructureNode } from "@/lib/types";

/**
 * Slugify a config name into a valid XML element name.
 * Lowercase, replace spaces/hyphens with underscores, remove invalid chars,
 * ensure it starts with a letter or underscore.
 */
function slugifyForXml(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  // XML element names must start with a letter or underscore
  if (slug && !/^[a-z_]/.test(slug)) {
    slug = "_" + slug;
  }

  return slug || "export";
}

/**
 * Sanitize a column name into a valid XML element name.
 * Replaces spaces and invalid characters, preserves the original name as much as possible.
 */
function sanitizeElementName(name: string): string {
  // Replace common separators with underscores
  let sanitized = name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // XML element names must start with a letter or underscore
  if (sanitized && !/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  return sanitized || "field";
}

/** Max columns to include in generated template. */
const MAX_COLUMNS = 200;

/** Warning threshold for large schemas. */
const LARGE_SCHEMA_THRESHOLD = 200;

export interface XmlTemplateGenerationResult {
  template: string;
  warnings: string[];
}

/**
 * Generate a Handlebars XML template from the detected output format schema.
 *
 * @param columns - Detected schema columns from the output format sample
 * @param fileType - The type of the sample file (csv, xlsx, xml, json)
 * @param configName - The ERP config name (used as root element for flat formats)
 * @param xmlStructure - Optional XML structure tree (only for XML files)
 * @returns Generated template string and any warnings
 */
export function generateXmlTemplate(
  columns: OutputFormatSchemaColumn[],
  fileType: OutputFormatFileType,
  configName: string,
  xmlStructure?: XmlStructureNode | null
): XmlTemplateGenerationResult {
  const warnings: string[] = [];

  if (!columns || columns.length === 0) {
    return {
      template: "",
      warnings: ["Keine Spalten erkannt -- Template-Generierung nicht möglich."],
    };
  }

  if (columns.length > LARGE_SCHEMA_THRESHOLD) {
    warnings.push(
      `${columns.length} Spalten erkannt. Das generierte Template ist umfangreich.`
    );
  }

  let template: string;

  // BUG-1 fix: For XML files with structure, preserve the original hierarchy
  if (fileType === "xml" && xmlStructure) {
    template = generateFromXmlStructure(xmlStructure);
  } else {
    // Flat formats (CSV, XLSX, JSON) or XML without structure
    template = generateFromFlatSchema(columns, configName);
  }

  // BUG-2 fix: Validate generated template with Handlebars
  try {
    Handlebars.compile(template, { strict: false });
  } catch (err) {
    warnings.push(
      `Warnung: Das generierte Template hat einen Syntaxfehler: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { template, warnings };
}

/**
 * Generate a template from a flat schema (CSV/XLSX/JSON).
 * Uses config name as root element, column names as child elements.
 */
function generateFromFlatSchema(
  columns: OutputFormatSchemaColumn[],
  configName: string
): string {
  const limitedColumns = columns.slice(0, MAX_COLUMNS);
  const rootElement = slugifyForXml(configName);

  const indent = "  ";
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<${rootElement}>`);
  lines.push(`${indent}<items>`);
  lines.push(`${indent}${indent}{{#each order.line_items}}`);
  lines.push(`${indent}${indent}<item>`);

  for (const col of limitedColumns) {
    // BUG-3 fix: Sanitize column names for valid XML element names
    const elementName = sanitizeElementName(col.column_name);
    lines.push(
      `${indent}${indent}${indent}<${elementName}>${col.column_name}</${elementName}>`
    );
  }

  lines.push(`${indent}${indent}</item>`);
  lines.push(`${indent}${indent}{{/each}}`);
  lines.push(`${indent}</items>`);
  lines.push(`</${rootElement}>`);

  return lines.join("\n");
}

/**
 * Generate a template from an XML structure tree.
 * Preserves the original element hierarchy, attributes, and nesting.
 * Marks the first repeating array with {{#each order.line_items}}.
 */
function generateFromXmlStructure(structure: XmlStructureNode): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  renderNode(structure, lines, 0, false);
  return lines.join("\n");
}

function renderNode(
  node: XmlStructureNode,
  lines: string[],
  depth: number,
  insideEach: boolean
): void {
  const indent = "  ".repeat(depth);
  const attrStr = renderAttributes(node.attributes);

  if (node.is_array) {
    // Repeating element — wrap with {{#each}} if not already inside one
    if (!insideEach) {
      lines.push(`${indent}{{#each order.line_items}}`);
    }

    const openTag = `<${node.tag}${attrStr}>`;

    if (node.children && node.children.length > 0) {
      lines.push(`${indent}${insideEach ? "" : "  "}${openTag}`);
      const childIndent = depth + (insideEach ? 1 : 2);
      for (const child of node.children) {
        renderNode(child, lines, childIndent, true);
      }
      lines.push(`${indent}${insideEach ? "" : "  "}</${node.tag}>`);
    } else {
      lines.push(`${indent}${insideEach ? "" : "  "}${openTag}${node.tag}</${node.tag}>`);
    }

    if (!insideEach) {
      lines.push(`${indent}{{/each}}`);
    }
    return;
  }

  // Non-array element
  if (node.text !== undefined && (!node.children || node.children.length === 0)) {
    // Leaf node — use the tag name as placeholder value
    lines.push(`${indent}<${node.tag}${attrStr}>${node.tag}</${node.tag}>`);
    return;
  }

  if (node.children && node.children.length > 0) {
    lines.push(`${indent}<${node.tag}${attrStr}>`);
    for (const child of node.children) {
      renderNode(child, lines, depth + 1, insideEach);
    }
    lines.push(`${indent}</${node.tag}>`);
  } else {
    lines.push(`${indent}<${node.tag}${attrStr} />`);
  }
}

function renderAttributes(attributes?: Record<string, string>): string {
  if (!attributes || Object.keys(attributes).length === 0) return "";
  const parts = Object.entries(attributes).map(
    ([key, value]) => ` ${key}="${value}"`
  );
  return parts.join("");
}
