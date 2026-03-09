# OPH-32: Visual Field Mapper for ERP Output Format

## Status: Planned
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

## Dependencies
- Requires: OPH-28 (Output Format Sample Upload & Confidence Score) - for recognized field schema
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) - for XML template editor UI
- Requires: OPH-30 (Auto-Generate XML Template) - template preview after mapping
- Requires: OPH-31 (Variable Click-to-Insert) - the variable reference list it extends

## User Stories

- As a platform admin, I want to see all recognized fields from my uploaded output format sample in a structured list so that I know exactly what fields need to be mapped.
- As a platform admin, I want to drag a Handlebars variable from the right panel and drop it next to a recognized field on the left so that I can assign variables to fields without writing templates manually.
- As a platform admin, I want to optionally configure a transformation (date format, number format, text mapping) for each assigned variable after dropping it so that the output data is formatted correctly for the ERP system.
- As a platform admin, I want to see the auto-generated Handlebars XML template after saving my mappings so that I can review the result and make manual adjustments if needed.
- As a platform admin, I want to remove or reassign a mapping I made so that I can correct mistakes without starting over.

## Acceptance Criteria

- [ ] After uploading and saving an output format, the Field Mapper shows ALL detected schema columns on the left side as a list of "target fields".
- [ ] The right panel shows all available Handlebars variables grouped by category (order-level, sender, delivery address, line items).
- [ ] Each Handlebars variable on the right is draggable. Dragging it onto a target field on the left assigns that variable to the field.
- [ ] When a variable is dropped onto a field, an optional transformation picker appears inline (e.g. date format, number format, static text prefix/suffix, none).
- [ ] A field that has a variable assigned shows the variable name and transformation (if any) as a badge next to it. Unmapped fields show a placeholder "—" or empty slot.
- [ ] Clicking the badge on a mapped field opens the transformation picker to edit the transformation.
- [ ] Clicking an × button on a mapped field removes the assignment.
- [ ] Clicking "Template generieren" saves the mappings and auto-generates a Handlebars XML template from the field-variable assignments.
- [ ] The generated template is shown in the existing XML template editor below the mapper for review and manual editing.
- [ ] The field mapper and template editor can coexist: the admin can use the mapper to generate a base template, then fine-tune it manually in the editor.
- [ ] Mappings are stored persistently so they are restored when the admin reopens the ERP config.

## Available Transformations

The transformation picker should offer:
- **Kein** (none) — insert variable as-is: `{{this.article_number}}`
- **Datumsformat** — wrap in a date helper: `{{formatDate order.order_date "DD.MM.YYYY"}}`
- **Zahlenformat** — wrap in a number helper: `{{formatNumber this.quantity 2}}`
- **Text-Praefix / -Suffix** — add static text around the value: `PREFIX{{this.article_number}}SUFFIX`

## Edge Cases

- **Line items (repeating rows):** Fields detected from inside a repeating array (e.g. ArticleNumber, Quantity in an XML sample with `<Item>` arrays) should be visually grouped under a "Bestellpositionen (Wiederholend)" section. When any of these fields is mapped, the generated template wraps the corresponding block in `{{#each order.line_items}}...{{/each}}` automatically.
- **Unmapped fields:** Fields with no variable assigned are omitted from the generated template. A warning is shown if required fields (marked as Pflichtfeld) have no mapping.
- **Same variable assigned to multiple fields:** Allowed. The same variable can be used for multiple target fields.
- **XML sample with nested structure:** For XML samples, the original nesting is preserved in the generated template. Fields from nested elements stay nested; the mapper shows the field path (e.g. "Header > OrderDate") as context.
- **CSV/XLSX/JSON samples:** Fields are flat. Generated template uses the ERP config name as root element (same as OPH-30).
- **Existing XML template:** If the XML template field already has content when the admin clicks "Template generieren", show a confirmation: "Bestehendes Template überschreiben?"
- **No fields detected:** If the output format has no recognized columns, show: "Keine Felder erkannt — bitte zuerst eine Beispieldatei hochladen."
- **Mappings lost on format re-upload:** When the admin uploads a new output format sample, warn that existing mappings may no longer match the new field list.

## Technical Requirements (optional)
- Field mappings should be persisted in the database (new `field_mappings` JSONB column or separate table on `tenant_output_formats`).
- Drag-and-drop should use a well-supported library (e.g. `@dnd-kit/core` or HTML5 native drag-and-drop).
- Template generation from mappings is client-side (same approach as OPH-30's `generateXmlTemplate()`).
- The mapper replaces the OPH-30 suggestion banner for the "start from scratch" use case, but the XML template editor remains available for manual editing.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
ErpConfigEditor (existing)
└── XML Tab
    ├── OutputFormatTab (existing — upload stays unchanged)
    │
    ├── FieldMapperPanel (NEW — appears only when output format is saved)
    │   ├── Left column: TargetFieldList
    │   │   ├── Section: "Bestellkopf-Felder"
    │   │   │   └── TargetFieldRow × N
    │   │   │       ├── Field name + type badge
    │   │   │       └── DropZone
    │   │   │           ├── (empty) "Hierher ziehen"
    │   │   │           └── (filled) MappingBadge
    │   │   │               ├── {{variable.path}}
    │   │   │               ├── Transformation label (if any)
    │   │   │               └── × Remove button
    │   │   └── Section: "Bestellpositionen (Wiederholend)"
    │   │       └── TargetFieldRow × N (same structure)
    │   │
    │   └── Right column: VariablePanel
    │       ├── VariableGroup "Bestellung"
    │       ├── VariableGroup "Absender"
    │       ├── VariableGroup "Lieferadresse"
    │       └── VariableGroup "Bestellpositionen"
    │           └── DraggableVariableChip × N per group
    │
    ├── TransformationPicker (Popover — opens after drop or badge click)
    │   ├── Type selector: Kein / Datum / Zahl / Praefix-Suffix
    │   └── Options inputs (format string, prefix, suffix)
    │
    ├── Warning: unmapped required fields (if any)
    ├── Button: "Template generieren"
    │
    └── XmlTemplateEditor (existing — shows generated result)
```

### Data Model

Each field mapping stores:
- **Target field name** — e.g. "ArticleNumber" (from detected schema)
- **Handlebars variable path** — e.g. "this.article_number"
- **Transformation type** — none / date / number / prefix-suffix
- **Transformation options** — format string, or prefix + suffix text

**Stored as:** New `field_mappings` JSONB column on the existing `tenant_output_formats` table — same row as `detected_schema` and `xml_structure`.

### Tech Decisions

- **Drag-and-drop: `@dnd-kit/core`** — HTML5 native drag-and-drop breaks on mobile and is hard to style. `@dnd-kit` is accessibility-first (keyboard + screen reader support), touch-friendly, and the modern React standard.
- **JSONB column (not separate table)** — Mappings are tightly coupled to the format row. A column keeps them co-located with `detected_schema` and `xml_structure` and avoids extra joins.
- **Client-side template generation** — Mappings + schema are already in memory. Template generation is a pure string transformation, consistent with OPH-30's approach. No API call needed.
- **Placement:** Mapper appears between the format upload section and the XML template editor in the XML tab. Hidden until a format is saved.
- **OPH-30 suggestion banner** — Replaced by the mapper for the "start from scratch" use case. The XML editor below remains available for manual fine-tuning.

### Backend Changes
1. New migration: `field_mappings JSONB DEFAULT NULL` on `tenant_output_formats`
2. Extend existing `GET` and `PUT /api/admin/erp-configs/[configId]/output-format` to include `field_mappings`

### New Dependencies
| Package | Purpose |
|---|---|
| `@dnd-kit/core` | Drag-and-drop engine |
| `@dnd-kit/utilities` | Helper utilities for dnd-kit |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
