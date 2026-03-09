# OPH-32: Visual Field Mapper for ERP Output Format

## Status: Deployed
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

**Tested:** 2026-03-09
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build:** PASSES (npm run build succeeds with no errors)

### Acceptance Criteria Status

#### AC-1: Target fields shown after uploading output format
- [x] After uploading and saving an output format, the Field Mapper shows ALL detected schema columns on the left side as a list of "target fields". Verified in `field-mapper-panel.tsx` lines 330-350 (`outputFormat.detected_schema` is iterated), and the panel is conditionally rendered in `erp-config-editor.tsx` lines 488-510 when `savedOutputFormat` exists with `detected_schema.length > 0`.

#### AC-2: Right panel shows grouped Handlebars variables
- [x] The right panel shows all available Handlebars variables grouped by category: Bestellung (order-level), Absender (sender), Lieferadresse (delivery address), Bestellpositionen (line items). Verified in `VARIABLE_GROUPS` constant (lines 60-107) and rendered in lines 583-602.

#### AC-3: Drag-and-drop variable assignment
- [x] Each Handlebars variable on the right is draggable using `@dnd-kit/core`. The `DraggableVariableChip` component (lines 159-185) uses `useDraggable`, and `TargetFieldDropZone` (lines 198-293) uses `useDroppable`. The `handleDragEnd` callback (lines 365-400) creates a mapping when a variable is dropped onto a target field.

#### AC-4: Transformation picker appears after drop
- [x] When a variable is dropped onto a field, the transformation picker opens automatically. In `handleDragEnd` line 397: `setEditingField(fieldName)` is called after the mapping is created. The `TransformationPicker` dialog (transformation-picker.tsx) is rendered when `editingField` is set (lines 657-666).

#### AC-5: Mapped fields show badge, unmapped show placeholder
- [x] Mapped fields show a badge with the variable path and optional transformation label (lines 262-285 in `TargetFieldDropZone`). Unmapped fields show "Hierher ziehen" or "Loslassen zum Zuordnen" during drag-over (line 287).

#### AC-6: Badge click opens transformation picker
- [x] The Badge component has `onClick={() => onEditTransformation(fieldName)}` (line 267), which calls `handleEditTransformation` setting `editingField`. This opens the `TransformationPicker` dialog.

#### AC-7: Remove button on mapped fields
- [x] An X button is rendered next to the mapping badge (lines 276-283) with `onClick={() => onRemoveMapping(fieldName)}`. The `handleRemoveMapping` function (lines 406-408) filters the mapping out of state.

#### AC-8: "Template generieren" saves mappings and generates template
- [x] The "Template generieren" button (lines 629-640) calls `handleGenerateTemplate` which first saves mappings via `onSaveMappings(mappings)`, then imports and calls `generateTemplateFromMappings` (lines 434-468). The button is disabled when `mappings.length === 0`.

#### AC-9: Generated template shown in XML template editor
- [x] The `onGenerateTemplate` callback in `erp-config-editor.tsx` (lines 226-236) calls `setXmlTemplate(template)` which updates the `XmlTemplateEditor` component. It also switches to XML format tab if not already selected.

#### AC-10: Field mapper and template editor coexist
- [x] The field mapper panel is rendered separately from the XML template editor. The editor appears in the XML tab content (line 378-383), while the mapper appears below the output format section (lines 487-510). Both are visible and editable simultaneously.

#### AC-11: Mappings are stored persistently
- [x] Mappings are saved via PUT `/api/admin/erp-configs/[configId]/output-format` (route.ts lines 393-484), which updates the `field_mappings` JSONB column. On component mount, mappings are initialized from `outputFormat.field_mappings` (field-mapper-panel.tsx line 307-309). The `useOutputFormat` hook fetches and returns the full format record including `field_mappings`.

### Available Transformations Status

- [x] **Kein (none):** Renders `{{variable_path}}` -- verified in `renderVariable` (generate-template-from-mappings.ts line 42) and TransformationPicker preview (line 92).
- [x] **Datumsformat:** Renders `{{formatDate variable_path "FORMAT"}}` with default "DD.MM.YYYY" -- verified in renderVariable line 32 and TransformationPicker line 85.
- [x] **Zahlenformat:** Renders `{{formatNumber variable_path N}}` with default "2" decimal places -- verified in renderVariable line 34 and TransformationPicker line 87.
- [x] **Text-Praefix / -Suffix:** Renders `PREFIX{{variable_path}}SUFFIX` -- verified in renderVariable lines 35-38 and TransformationPicker line 89.

### Edge Cases Status

#### EC-1: Line items (repeating rows)
- [x] For XML samples with structure, `collectRepeatingFieldNames` (lines 129-152) identifies fields inside `is_array` nodes. These are grouped under "Bestellpositionen (Wiederholend)" section (lines 543-566). The generated template wraps these in `{{#each order.line_items}}...{{/each}}` (generate-template-from-mappings.ts lines 199-222).

#### EC-2: Unmapped fields
- [x] Fields with no variable assigned are omitted from the generated template (generate-template-from-mappings.ts line 108: `if (!mapping) continue`). A warning is shown if required unmapped fields exist (field-mapper-panel.tsx lines 617-625).

#### EC-3: Same variable assigned to multiple fields
- [x] Allowed. The drag-end handler creates a new mapping for each target field independently. The mapping map is keyed by `target_field`, not `variable_path`, so duplicates are possible.

#### EC-4: XML sample with nested structure
- [x] `generateXmlStructureTemplate` (generate-template-from-mappings.ts lines 160-186) preserves original XML nesting via recursive `renderMappedNode`. Attributes are preserved via `renderAttributes`.
- [ ] BUG: The mapper does NOT show field paths (e.g. "Header > OrderDate") as context for nested XML elements. The `TargetFieldDropZone` only shows the tag name (`fieldName`), not the full path hierarchy. This makes it harder to distinguish fields with the same name at different nesting levels.

#### EC-5: CSV/XLSX/JSON samples (flat)
- [x] For flat formats, all fields are treated as line-item fields by default (field-mapper-panel.tsx line 349). Generated template uses `slugifyForXml(configName)` as root element (generate-template-from-mappings.ts line 98).

#### EC-6: Existing XML template overwrite confirmation
- [x] When `currentTemplate.trim()` has content, the overwrite confirmation dialog is shown (field-mapper-panel.tsx lines 454-458). Dialog text: "Bestehendes Template ueberschreiben?" with Cancel and Overwrite buttons (lines 669-691).

#### EC-7: No fields detected
- [x] If `outputFormat.detected_schema.length === 0`, an Alert is shown: "Keine Felder erkannt -- bitte zuerst eine Beispieldatei hochladen." (lines 482-490).

#### EC-8: Mappings lost on format re-upload
- [ ] BUG: When the admin uploads a new output format sample, NO warning is shown about existing mappings potentially no longer matching the new field list. Additionally, the POST route (output-format/route.ts lines 196-213) does NOT clear `field_mappings` on re-upload, so stale mappings referencing old field names persist in the database.

### Security Audit Results

- [x] **Authentication:** PUT endpoint uses `requirePlatformAdmin()` -- non-admin users cannot save field mappings.
- [x] **Authorization:** Only platform admins can access the endpoint. RLS on `tenant_output_formats` restricts to `platform_admin` role.
- [x] **Input validation - Zod:** PUT endpoint uses a proper Zod schema (`putBodySchema`) to validate field_mappings array structure, transformation_type enum, and required string fields. This is an improvement over the OPH-28 pattern where Zod was defined but unused.
- [x] **UUID validation:** configId is validated against UUID regex before DB queries.
- [x] **Rate limiting:** `checkAdminRateLimit(user.id)` is called in the PUT handler.
- [x] **Non-existent output format:** PUT returns 404 if no output format exists for the config.
- [x] **Content-Type:** PUT correctly expects JSON body and handles parse errors.
- [ ] **BUG: No allowlist validation for variable_path** -- The Zod schema validates that `variable_path` is a non-empty string, but does NOT validate it against the known set of Handlebars variable paths defined in `VARIABLE_GROUPS`. A platform admin could submit arbitrary paths like `this.__proto__` or `constructor.prototype` that could cause unexpected behavior in Handlebars rendering. Since only platform admins can access this endpoint, severity is Low, but defense-in-depth suggests adding an allowlist.

### Cross-Browser & Responsive Testing

**Note:** Code review assessment based on implementation patterns (no live browser testing).

- [x] **@dnd-kit/core:** Uses PointerSensor and KeyboardSensor for cross-browser and accessibility support. Touch devices are supported.
- [x] **Responsive grid:** Uses `grid-cols-1 lg:grid-cols-[1fr_320px]` (line 513) -- stacks on mobile/tablet, side-by-side on desktop. This is correct behavior.
- [x] **ScrollArea:** Target fields use `max-h-[400px]` ScrollArea (line 550), variables use `max-h-[500px]` ScrollArea (line 587) -- prevents overflow on small screens.
- [x] **TransformationPicker dialog:** Uses `sm:max-w-lg` (transformation-picker.tsx line 98) -- responsive dialog width.
- [x] **Overwrite confirmation dialog:** Uses `sm:max-w-md` with `flex-col sm:flex-row` footer (lines 670, 678) -- mobile-friendly.
- [x] **Badge clicks:** Touch targets appear adequate (min-height via padding). The remove button has `p-0.5` padding which is small (approximately 20px touch target) but acceptable for a secondary action.
- [ ] **BUG: On mobile (375px), the FieldMapperPanel stacks into a single column (target fields above, variables below). This means the user must scroll past ALL target fields to see the variables, then scroll back up to the drop zone. For samples with many columns (20+), this makes drag-and-drop very difficult on mobile.** While the feature is primarily used by admins on desktop, the responsive layout makes the drag-and-drop workflow impractical on small screens.

### Regression Testing

- [x] **OPH-28 (Output Format Upload):** The OutputFormatTab component (`output-format-tab.tsx`) is unchanged and continues to work with `configId` (OPH-29 refactored from tenantId). Upload, replace, delete, and download actions are unaffected by OPH-32.
- [x] **OPH-30 (XML Template Auto-Generation):** The XmlTemplateSuggestion component is still rendered in `erp-config-editor.tsx` (lines 402-411) when a non-XML sample triggers it. The field mapper does not conflict with this flow.
- [x] **OPH-31 (Variable Click-to-Insert):** The XML template editor's variable click-to-insert functionality is independent of the field mapper. Both use the same variable definitions but operate on different UI surfaces.
- [x] **OPH-29 (Shared ERP Configs):** The PUT endpoint correctly uses `configId` (not tenantId). The output format is linked to the ERP config, not a tenant. All API routes under `[configId]/output-format/` are consistent.
- [x] **OPH-9 (ERP Config Editor):** The editor gains the field mapper section below the output format section without disturbing existing tabs (CSV, XML, JSON), technical settings, save behavior, or version history.
- [x] **Build:** `npm run build` completes successfully with no errors.

### Bugs Found

#### BUG-1: Stale Field Mappings Persist After Re-Upload of Output Format Sample
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As a platform admin, open an ERP config and upload a CSV sample with columns A, B, C
  2. Map column A to `order.order_number`, column B to `order.order_date`
  3. Save the mappings
  4. Upload a new sample file with completely different columns X, Y, Z (via the "Ersetzen" button)
  5. Expected: Old mappings should be cleared or a warning shown that mappings reference non-existent fields
  6. Actual: Old mappings persist in the database and the FieldMapperPanel initializes with stale mappings for A and B that no longer exist in the schema. No warning is displayed.
- **Location:** `src/app/api/admin/erp-configs/[configId]/output-format/route.ts` line 198-209 (POST update path does not reset `field_mappings`), and `src/components/admin/output-format-tab.tsx` (no warning about stale mappings)
- **Priority:** Fix before deployment -- this causes user confusion and generates templates with invalid field references

#### BUG-2: No Nested Path Context Shown for XML Fields in Mapper
- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload an XML sample with nested structure, e.g. `<Order><Header><OrderDate>...</OrderDate></Header><Items><Item><ArticleNumber>...</ArticleNumber></Item></Items></Order>`
  2. Open the Field Mapper panel
  3. Expected: Fields show their path context, e.g. "Header > OrderDate"
  4. Actual: Only the tag name is shown (e.g. "OrderDate"), making it hard to distinguish fields with the same name at different nesting levels
- **Location:** `src/components/admin/field-mapper-panel.tsx`, `TargetFieldDropZone` component
- **Priority:** Fix in next sprint -- cosmetic for most use cases but could be confusing for complex XML schemas

#### BUG-3: No Allowlist Validation for variable_path in PUT API
- **Severity:** Low
- **Steps to Reproduce:**
  1. As a platform admin, send a PUT request to `/api/admin/erp-configs/[configId]/output-format` with a crafted body: `{"field_mappings": [{"target_field": "test", "variable_path": "constructor.prototype.polluted", "transformation_type": "none"}]}`
  2. Expected: The API should reject paths not in the known variable set
  3. Actual: The API accepts any non-empty string as a variable_path
- **Location:** `src/app/api/admin/erp-configs/[configId]/output-format/route.ts` lines 370-385 (Zod schema)
- **Priority:** Fix in next sprint -- low risk since only platform admins can access, but defense-in-depth improvement

#### BUG-4: Drag-and-Drop Impractical on Mobile Viewports (375px)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open the ERP config editor on a 375px-wide screen
  2. Upload an output format sample with 20+ columns
  3. Attempt to drag a variable from the bottom of the page to a target field at the top
  4. Expected: Reasonable mobile UX for drag-and-drop
  5. Actual: Target fields and variables stack vertically, requiring extensive scrolling during drag operations
- **Location:** `src/components/admin/field-mapper-panel.tsx` line 513 (`grid-cols-1 lg:grid-cols-[1fr_320px]`)
- **Priority:** Nice to have -- admin feature primarily used on desktop; a "click-to-assign" fallback could be considered

### Summary

- **Acceptance Criteria:** 11/11 passed
- **Edge Cases:** 6/8 passed (2 bugs: stale mappings on re-upload, missing path context for XML fields)
- **Bugs Found:** 4 total (0 critical, 0 high, 1 medium, 3 low)
- **Security:** 1 low finding (no variable_path allowlist)
- **Production Ready:** YES (with recommendation to fix BUG-1 before deployment)
- **Recommendation:** Fix the stale mappings bug (BUG-1) before deploying. When an output format is re-uploaded, the `field_mappings` column should be reset to `null` in the POST update path, and a note should be shown in the UI. The remaining 3 low-severity bugs can be addressed in the next sprint.

## Deployment
- **Deployed:** 2026-03-09
- **Migration:** `027_oph32_field_mappings_column.sql` applied to production
- **BUG-1 fix:** `field_mappings` reset to null on format re-upload
