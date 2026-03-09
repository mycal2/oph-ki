/**
 * OPH-32: Generate a Handlebars XML template from field mappings.
 * OPH-33: Also generates CSV column config (ErpColumnMappingExtended[]) from field mappings.
 *
 * Takes the detected schema, XML structure (if any), and user-defined field mappings
 * to produce either a Handlebars XML template or a CSV column config.
 */

import type {
  FieldMapping,
  OutputFormatSchemaColumn,
  OutputFormatFileType,
  XmlStructureNode,
  ErpColumnMappingExtended,
} from "@/lib/types";

export interface TemplateFromMappingsResult {
  template: string;
  warnings: string[];
}

/**
 * Wrap a variable path in the appropriate Handlebars expression
 * based on the transformation config.
 */
function renderVariable(mapping: FieldMapping): string {
  const { variable_path, transformation_type, transformation_options } = mapping;

  switch (transformation_type) {
    case "date":
      return `{{formatDate ${variable_path} "${transformation_options?.format ?? "DD.MM.YYYY"}"}}`;
    case "number":
      return `{{formatNumber ${variable_path} ${transformation_options?.format ?? "2"}}}`;
    case "prefix_suffix": {
      const prefix = transformation_options?.prefix ?? "";
      const suffix = transformation_options?.suffix ?? "";
      return `${prefix}{{${variable_path}}}${suffix}`;
    }
    case "none":
    default:
      return `{{${variable_path}}}`;
  }
}

/**
 * Sanitize a column name into a valid XML element name.
 */
function sanitizeElementName(name: string): string {
  let sanitized = name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (sanitized && !/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  return sanitized || "field";
}

function slugifyForXml(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (slug && !/^[a-z_]/.test(slug)) {
    slug = "_" + slug;
  }

  return slug || "export";
}

/**
 * Check if a variable path references a line-item field.
 */
function isLineItemVariable(path: string): boolean {
  return path.startsWith("this.");
}

/**
 * Generate template from mappings for flat formats (CSV/XLSX/JSON).
 */
function generateFlatTemplate(
  columns: OutputFormatSchemaColumn[],
  mappings: FieldMapping[],
  configName: string
): TemplateFromMappingsResult {
  const warnings: string[] = [];
  const mappingMap = new Map<string, FieldMapping>();
  for (const m of mappings) {
    mappingMap.set(m.target_field, m);
  }

  const rootElement = slugifyForXml(configName);
  const indent = "  ";
  const lines: string[] = [];

  // Separate header and line-item mappings
  const headerMappings: { col: OutputFormatSchemaColumn; mapping: FieldMapping }[] = [];
  const lineItemMappings: { col: OutputFormatSchemaColumn; mapping: FieldMapping }[] = [];

  for (const col of columns) {
    const mapping = mappingMap.get(col.column_name);
    if (!mapping) continue;

    if (isLineItemVariable(mapping.variable_path)) {
      lineItemMappings.push({ col, mapping });
    } else {
      headerMappings.push({ col, mapping });
    }
  }

  // Check for unmapped required fields
  const unmappedRequired = columns.filter(
    (c) => c.is_required && !mappingMap.has(c.column_name)
  );
  if (unmappedRequired.length > 0) {
    warnings.push(
      `${unmappedRequired.length} Pflichtfeld(er) ohne Zuordnung: ${unmappedRequired.map((c) => c.column_name).join(", ")}`
    );
  }

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<${rootElement}>`);

  // Header fields
  for (const { col, mapping } of headerMappings) {
    const elementName = sanitizeElementName(col.column_name);
    lines.push(`${indent}<${elementName}>${renderVariable(mapping)}</${elementName}>`);
  }

  // Line items
  if (lineItemMappings.length > 0) {
    lines.push(`${indent}<items>`);
    lines.push(`${indent}${indent}{{#each order.line_items}}`);
    lines.push(`${indent}${indent}<item>`);
    for (const { col, mapping } of lineItemMappings) {
      const elementName = sanitizeElementName(col.column_name);
      lines.push(
        `${indent}${indent}${indent}<${elementName}>${renderVariable(mapping)}</${elementName}>`
      );
    }
    lines.push(`${indent}${indent}</item>`);
    lines.push(`${indent}${indent}{{/each}}`);
    lines.push(`${indent}</items>`);
  }

  lines.push(`</${rootElement}>`);

  return { template: lines.join("\n"), warnings };
}

/**
 * Generate template from mappings for XML format, preserving the original structure.
 */
function generateXmlStructureTemplate(
  structure: XmlStructureNode,
  mappings: FieldMapping[],
  columns: OutputFormatSchemaColumn[]
): TemplateFromMappingsResult {
  const warnings: string[] = [];
  const mappingMap = new Map<string, FieldMapping>();
  for (const m of mappings) {
    mappingMap.set(m.target_field, m);
  }

  // Check for unmapped required fields
  const unmappedRequired = columns.filter(
    (c) => c.is_required && !mappingMap.has(c.column_name)
  );
  if (unmappedRequired.length > 0) {
    warnings.push(
      `${unmappedRequired.length} Pflichtfeld(er) ohne Zuordnung: ${unmappedRequired.map((c) => c.column_name).join(", ")}`
    );
  }

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  renderMappedNode(structure, lines, 0, false, mappingMap);

  return { template: lines.join("\n"), warnings };
}

function renderMappedNode(
  node: XmlStructureNode,
  lines: string[],
  depth: number,
  insideEach: boolean,
  mappingMap: Map<string, FieldMapping>
): void {
  const indent = "  ".repeat(depth);
  const attrStr = renderAttributes(node.attributes);

  if (node.is_array) {
    if (!insideEach) {
      lines.push(`${indent}{{#each order.line_items}}`);
    }

    const openTag = `<${node.tag}${attrStr}>`;
    const childIndentDepth = depth + (insideEach ? 1 : 2);

    if (node.children && node.children.length > 0) {
      lines.push(`${indent}${insideEach ? "" : "  "}${openTag}`);
      for (const child of node.children) {
        renderMappedNode(child, lines, childIndentDepth, true, mappingMap);
      }
      lines.push(`${indent}${insideEach ? "" : "  "}</${node.tag}>`);
    } else {
      // Leaf array node
      const mapping = mappingMap.get(node.tag);
      const content = mapping ? renderVariable(mapping) : "";
      lines.push(`${indent}${insideEach ? "" : "  "}${openTag}${content}</${node.tag}>`);
    }

    if (!insideEach) {
      lines.push(`${indent}{{/each}}`);
    }
    return;
  }

  // Leaf node
  if (node.text !== undefined && (!node.children || node.children.length === 0)) {
    const mapping = mappingMap.get(node.tag);
    const content = mapping ? renderVariable(mapping) : "";
    lines.push(`${indent}<${node.tag}${attrStr}>${content}</${node.tag}>`);
    return;
  }

  // Parent node with children
  if (node.children && node.children.length > 0) {
    lines.push(`${indent}<${node.tag}${attrStr}>`);
    for (const child of node.children) {
      renderMappedNode(child, lines, depth + 1, insideEach, mappingMap);
    }
    lines.push(`${indent}</${node.tag}>`);
  } else {
    lines.push(`${indent}<${node.tag}${attrStr} />`);
  }
}

function renderAttributes(attributes?: Record<string, string>): string {
  if (!attributes || Object.keys(attributes).length === 0) return "";
  return Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join("");
}

/**
 * Main entry point: generate a Handlebars XML template from field mappings.
 */
export function generateTemplateFromMappings(
  columns: OutputFormatSchemaColumn[],
  fileType: OutputFormatFileType,
  configName: string,
  mappings: FieldMapping[],
  xmlStructure?: XmlStructureNode | null
): TemplateFromMappingsResult {
  if (!mappings || mappings.length === 0) {
    return {
      template: "",
      warnings: ["Keine Feld-Zuordnungen vorhanden."],
    };
  }

  if (fileType === "xml" && xmlStructure) {
    return generateXmlStructureTemplate(xmlStructure, mappings, columns);
  }

  return generateFlatTemplate(columns, mappings, configName);
}

// ---------------------------------------------------------------------------
// OPH-33: CSV column config generation
// ---------------------------------------------------------------------------

/**
 * Convert a Field Mapper variable path to the CSV source_field convention.
 * Field Mapper uses "this.X" for line-item fields; CSV builder uses "items[].X".
 * Header fields (order.X) are unchanged.
 */
function toSourceField(variablePath: string): string {
  if (variablePath.startsWith("this.")) {
    return "items[]." + variablePath.slice("this.".length);
  }
  return variablePath;
}

/**
 * OPH-33: Generate an ErpColumnMappingExtended[] array from field mappings.
 *
 * Used when the uploaded output format sample is CSV or XLSX.
 * Preserves detected_schema column order.
 * Unmapped columns are included with empty source_field.
 * Mapped columns include the variable path converted to CSV convention.
 */
export function generateCsvColumnsFromMappings(
  columns: OutputFormatSchemaColumn[],
  mappings: FieldMapping[]
): ErpColumnMappingExtended[] {
  const mappingMap = new Map<string, FieldMapping>();
  for (const m of mappings) {
    mappingMap.set(m.target_field, m);
  }

  return columns.map((col) => {
    const mapping = mappingMap.get(col.column_name);

    if (!mapping) {
      return {
        source_field: "",
        target_column_name: col.column_name,
        required: false,
        transformations: [],
      };
    }

    // Convert transformation from FieldMapping to ErpTransformationStep[]
    const transformations: ErpColumnMappingExtended["transformations"] = [];
    if (mapping.transformation_type === "date" && mapping.transformation_options?.format) {
      transformations.push({ type: "date_format", param: mapping.transformation_options.format });
    } else if (mapping.transformation_type === "number" && mapping.transformation_options?.format) {
      transformations.push({ type: "round", param: mapping.transformation_options.format });
    }
    // prefix_suffix has no direct ErpTransformationStep equivalent — omit

    return {
      source_field: toSourceField(mapping.variable_path),
      target_column_name: col.column_name,
      required: col.is_required,
      transformations,
    };
  });
}
