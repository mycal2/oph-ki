# OPH-30: Auto-Generate XML Template from Output Format Sample

## Status: Planned
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

## Dependencies
- Requires: OPH-28 (Output Format Sample Upload & Confidence Score) - for sample file parsing and schema detection
- Requires: OPH-29 (Shared ERP Configurations) - for config-level output format management
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) - for XML template editor UI

## User Stories

- As a platform admin, I want the system to auto-generate a Handlebars XML template from an uploaded output format sample so that I don't have to write the template from scratch.
- As a platform admin, I want to review the generated template as a suggestion before accepting it so that I can verify the structure is correct before it populates the editor.
- As a platform admin, I want the generated template to preserve the exact element names and nesting from my XML sample so that the output matches the ERP system's expected format.
- As a platform admin, I want templates generated from CSV/XLSX/JSON samples to use the ERP config name as the root element so that the XML structure is meaningful even for flat file formats.
- As a platform admin, I want the generated template to include placeholder comments for Handlebars variables so that I know where to map order data fields.

## Acceptance Criteria

- [ ] When an XML sample is uploaded and parsed, the system generates a Handlebars XML template that mirrors the original XML structure (element names, nesting, attributes).
- [ ] When a CSV, XLSX, or JSON sample is uploaded and parsed, the system generates an XML template using the ERP config name (slugified) as the root element and detected column names as child elements.
- [ ] The generated template is shown as a suggestion panel (not auto-filled into the XML Template field).
- [ ] The suggestion panel includes an "Accept" button that copies the template into the XML Template editor field and a "Dismiss" button to discard it.
- [ ] The generated template uses original column/element names from the sample as placeholder values (e.g., `<ArticleNumber>ArticleNumber</ArticleNumber>`), not auto-mapped Handlebars variables.
- [ ] The generated template wraps repeating records in `{{#each order.line_items}}...{{/each}}` blocks.
- [ ] Accepting the template only populates the XML Template field — the admin must still click the main "Save" button to persist changes (consistent with existing editor flow).
- [ ] The template suggestion is shown after the output format is saved (not during parse preview), so it only appears for confirmed formats.
- [ ] If the ERP config format is not "xml", the template suggestion is still available (the admin may want to switch to XML export).
- [ ] The generated template is valid Handlebars syntax (passes `Handlebars.compile()` without errors).

## Edge Cases

- **Empty sample file:** If the sample has no records/columns, no template is generated. Show a message: "Keine Spalten erkannt — Template-Generierung nicht moeglich."
- **Deeply nested XML:** For XML samples with multiple nesting levels, the template should preserve the full hierarchy, but only the innermost repeating array gets the `{{#each}}` block.
- **XML with attributes:** XML attributes (e.g., `<item id="123">`) should be preserved in the generated template as `<item id="placeholder">`.
- **Special characters in element names:** Element names with special characters should be preserved as-is in the template (they are valid XML).
- **Config name with special characters:** When using the config name as root element for flat formats, slugify it to a valid XML element name (lowercase, hyphens replaced with underscores, no spaces).
- **Existing template in editor:** If the XML Template field already has content when the admin accepts, show a confirmation: "Bestehendes Template ueberschreiben?" with options to overwrite or cancel.
- **Large sample with many columns:** Templates should be generated for up to 200 columns. Beyond that, show a warning but still generate.

## Technical Requirements (optional)
- Template generation should run client-side (no additional API call needed — schema is already available from the parse response)
- Performance: Template generation should be instant (< 100ms) since it's a string transformation of the detected schema

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
