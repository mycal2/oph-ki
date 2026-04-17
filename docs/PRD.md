# Product Requirements Document

## Vision
Eine mandantenfähige SaaS-Plattform ("Order Intelligence Platform"), die Dentalprodukt-Herstellern ermöglicht, eingehende Bestellungen aus E-Mails (inkl. PDF- und Excel-Anhängen) automatisch zu verarbeiten, per KI (Claude API) in strukturierte JSON-Daten zu überführen und in die jeweiligen ERP-Systeme ihrer Kunden zu exportieren. Der Schlüssel liegt in global wiederverwendbaren Händler-Erkennungsregeln: Da Händler wie Henry Schein oder andere Dental-Distributoren immer ähnliche Bestellformate verwenden, werden einmal angelegte Regeln für alle Mandanten wiederverwendet.

## Target Users

### Primär: Mitarbeiter von Dentalprodukt-Herstellern (Mandanten)
- Erhalten täglich Bestellungen per E-Mail von Händlern oder Endkunden
- Verarbeiten diese aktuell manuell in ihre ERP-Systeme (zeitaufwendig, fehleranfällig)
- Benötigen eine schnelle, prüfbare Möglichkeit, Bestelldaten strukturiert zu importieren
- Sind keine technischen Experten — UI muss intuitiv sein

### Sekundär: Internes Admin-Team (Plattform-Betreiber)
- Pflegt globale Händler-Erkennungsregeln und Extraktionshints
- Verwaltet Mandanten und konfiguriert deren ERP-Mapping-Regeln
- Überwacht den Betrieb der Plattform

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | OPH-1: Multi-Tenant Auth & Benutzerverwaltung | Deployed |
| P0 (MVP) | OPH-2: Bestellungs-Upload (Web: .eml, PDF, Excel) | Deployed |
| P0 (MVP) | OPH-3: Händler-Erkennung & Händler-Profile | Deployed |
| P0 (MVP) | OPH-4: KI-Datenextraktion mit Händler-Kontext (Claude API) | Deployed |
| P0 (MVP) | OPH-5: Bestellprüfung & manuelle Korrektur | Deployed |
| P0 (MVP) | OPH-6: ERP-Export & Download | Deployed |
| P1 | OPH-7: Admin: Händler-Regelwerk-Verwaltung | Deployed |
| P1 | OPH-8: Admin: Mandanten-Management | Deployed |
| P1 | OPH-9: Admin: ERP-Mapping-Konfiguration | Deployed |
| P1 | OPH-10: E-Mail-Weiterleitungs-Ingestion | Deployed |
| P2 | OPH-11: Bestellhistorie & Dashboard | Deployed |
| P2 | OPH-12: DSGVO-Compliance & Datenaufbewahrung | Deployed |
| P1 | OPH-13: Order Submission Email Notifications | Deployed |
| P1 | OPH-14: Händler-Datentransformationen (Artikel-Mapping, Einheiten, Felder) | Deployed |
| P1 | OPH-15: Dealer Column Mapping for Extraction | Deployed |
| P1 | OPH-16: Trial-/Demo-Modus für Interessenten | Deployed |
| P1 | OPH-17: Allowed Email Domains für Sender-Autorisierung | Deployed |
| P1 | OPH-18: Admin: Cross-Tenant Order View | Deployed |
| P1 | OPH-19: Customer Number (Kundennummer) Recognition & Editing | Deployed |
| P1 | OPH-20: Sprach-Erkennung & Mengeneinheiten-Normalisierung | Deployed |
| P1 | OPH-21: E-Mail-Text als Extraktionsquelle | Deployed |
| P1 | OPH-22: Kundennummer immer in Extrahierten Bestelldaten anzeigen | Deployed |
| P1 | OPH-23: Chunked Extraction for Large Excel Files | Deployed |
| P1 | OPH-24: Platform Error Notification Emails | Deployed |
| P1 | OPH-25: E-Mail-Betreff als Extraktionsquelle | Deployed |
| P2 | OPH-26: Order File Download | Deployed |
| P2 | OPH-27: Order File Preview (Click-to-Open) | Deployed |
| P1 | OPH-28: Output Format Sample Upload & Confidence Score | Deployed |
| P1 | OPH-29: Shared ERP Configurations (Decoupled from Tenants) | Deployed |
| P1 | OPH-30: Auto-Generate XML Template from Output Format Sample | Deployed |
| P1 | OPH-31: Variable Click-to-Insert in XML Template Editor | Deployed |
| P1 | OPH-32: Visual Field Mapper for ERP Output Format | Deployed |
| P1 | OPH-33: Field Mapper Output for All Formats (CSV, JSON, XML) | In Review |
| P1 | OPH-34: Admin Manual Upload with Tenant Selection | Deployed |
| P1 | OPH-35: Per-Tenant Email Notification Settings | Deployed |
| P2 | OPH-36: Sticky PDF Preview on Order Review Page | In Review |
| P1 | OPH-37: Dealer Article Number (Lieferantenartikelnummer) | In Review |
| P1 | OPH-38: Admin: Resend Invite & Trigger Password Reset for Tenant Users | Deployed |
| P1 | OPH-39: Manufacturer Article Catalog | Deployed |
| P1 | OPH-40: AI Article Number Matching during Extraction | Deployed |
| P1 | OPH-41: Change Tenant User Role | Deployed |
| P1 | OPH-42: Admin Tenant Detail Page (Full-Page Layout) | Deployed |
| P2 | OPH-43: Sample CSV Download for Article Import | In Review |
| P1 | OPH-44: Manufacturer Article Number Label Recognition in Extraction | In Review |
| P1 | OPH-45: AI-Assisted ERP Field Mapping | Deployed |
| P1 | OPH-46: Manufacturer Customer Catalog | Deployed |
| P1 | OPH-47: AI Customer Number Matching during Extraction | Deployed |
| P1 | OPH-48: Platform Team User Management Actions | In Progress |
| P1 | OPH-49: Dealer-Linked Kundenstamm | Deployed |
| P1 | OPH-50: Dealer Count per Tenant on Admin Mandanten-Verwaltung | Deployed |
| P2 | OPH-51: Tenant Company Logo | Deployed |
| P1 | OPH-52: Tenant Billing Model Configuration | In Review |
| P1 | OPH-53: Platform Admin KPI Dashboard | In Progress |
| P1 | OPH-54: Platform Admin Billing Report | In Review |
| P1 | OPH-55: Sidebar Navigation Redesign | In Progress |
| P1 | OPH-56: Collapsible Sub-Groups in Platform Sidebar | In Progress |
| P1 | OPH-57: Tenant Count per Dealer in Händler-Verwaltung | In Review |
| P1 | OPH-58: Split Multi-File ERP Export (Header + Lines CSV) | In Progress |
| P1 | OPH-59: Split CSV Output Format Sample Upload | In Progress |
| P1 | OPH-60: Fixed Value Column Mapping in ERP Config | In Review |
| P1 | OPH-61: Configurable Output Filenames for Split CSV Export | In Progress |
| P1 | OPH-62: Article Catalog Bulk Delete | In Review |
| P1 | OPH-63: Per-Tenant Email Forwarding | Deployed |
| P1 | OPH-64: Admin: Reset Artikelstamm / Kundenstamm for Tenant | In Progress |
| P1 | OPH-65: Tolerant Article Number Matching (Whitespace, Hyphens, Optional Leading Zeros) | Planned |
| P1 | OPH-66: Reset Dealer Recognition on an Order | Planned |
| P1 | OPH-67: Tenant User Dashboard | Planned |
| P1 | OPH-68: Dealer Filter Dropdown on Orders Page | Planned |
| P1 | OPH-69: Image Extraction from Inbound Emails | Planned |
| P2 | OPH-70: Inline Email Body Text Preview in Dokument-Vorschau | Planned |

## Success Metrics
- Bearbeitungszeit pro Bestellung: von ~15 Min. manuell auf < 3 Min. mit System
- Extraktionsgenauigkeit: > 95 % der Felder korrekt erkannt ohne manuelle Korrektur
- Onboarding neuer Mandanten: < 1 Tag bis erste produktive Bestellung
- Händler-Erkennungsrate: > 90 % bekannter Händler automatisch identifiziert
- Dealer-Onboarding: Neuer Händler inkl. händlerspezifischer Regeln und Besonderheiten in < 5 Min. durch Nicht-Entwickler trainierbar

## Constraints
- **DSGVO / Datenschutz:** Bestelldaten enthalten personenbezogene Daten (Endkunden-Adressen etc.) — EU-Hosting erforderlich, Datenspeicherung nur so lange wie nötig
- **Kleines Team:** 1–3 Entwickler — Scope muss realistisch bleiben, keine Over-Engineering
- **Schnelle Time-to-Market:** MVP in < 3 Monaten live
- **Bestehende ERP-Systeme:** Kunden haben laufende ERP-Systeme (SAP, Dynamics 365, Sage), die nicht verändert werden können — wir liefern kompatible Importdateien

## Non-Goals
- Vollautomatischer ERP-Import ohne menschliche Prüfung (MVP: immer manuelle Review-Stufe)
- Eigene OCR-Engine entwickeln (nutzen Claude's multimodale Fähigkeiten)
- Native ERP-API-Integration (MVP: Datei-Download, kein Live-API-Push)
- Mobil-App
- Automatische E-Mail-Antworten an Händler
- Bestandsverwaltung oder Lagerhaltungssystem
