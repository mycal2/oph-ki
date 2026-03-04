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
| P0 (MVP) | OPH-1: Multi-Tenant Auth & Benutzerverwaltung | Planned |
| P0 (MVP) | OPH-2: Bestellungs-Upload (Web: .eml, PDF, Excel) | Planned |
| P0 (MVP) | OPH-3: Händler-Erkennung & Händler-Profile | Planned |
| P0 (MVP) | OPH-4: KI-Datenextraktion mit Händler-Kontext (Claude API) | Planned |
| P0 (MVP) | OPH-5: Bestellprüfung & manuelle Korrektur | Planned |
| P0 (MVP) | OPH-6: ERP-Export & Download | Planned |
| P1 | OPH-7: Admin: Händler-Regelwerk-Verwaltung | Planned |
| P1 | OPH-8: Admin: Mandanten-Management | Planned |
| P1 | OPH-9: Admin: ERP-Mapping-Konfiguration | Planned |
| P1 | OPH-10: E-Mail-Weiterleitungs-Ingestion | Planned |
| P2 | OPH-11: Bestellhistorie & Dashboard | Planned |
| P2 | OPH-12: DSGVO-Compliance & Datenaufbewahrung | Planned |
| P1 | OPH-13: Order Submission Email Notifications | Planned |
| P1 | OPH-14: Händler-Datentransformationen (Artikel-Mapping, Einheiten, Felder) | Planned |
| P1 | OPH-15: Dealer Column Mapping for Extraction | Planned |
| P1 | OPH-18: Admin: Cross-Tenant Order View | Planned |
| P1 | OPH-16: Trial-/Demo-Modus für Interessenten | Deployed |
| P1 | OPH-17: Allowed Email Domains für Sender-Autorisierung | Planned |
| P1 | OPH-19: Customer Number (Kundennummer) Recognition & Editing | Planned |
| P1 | OPH-20: Sprach-Erkennung & Mengeneinheiten-Normalisierung | Planned |

## Success Metrics
- Bearbeitungszeit pro Bestellung: von ~15 Min. manuell auf < 3 Min. mit System
- Extraktionsgenauigkeit: > 95 % der Felder korrekt erkannt ohne manuelle Korrektur
- Onboarding neuer Mandanten: < 1 Tag bis erste produktive Bestellung
- Händler-Erkennungsrate: > 90 % bekannter Händler automatisch identifiziert

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
