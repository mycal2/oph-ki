# OPH-10: E-Mail-Weiterleitungs-Ingestion

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-02-27

## Dependencies
- Requires: OPH-4 (KI-Datenextraktion) — E-Mail-Inhalte werden gleich verarbeitet wie Web-Uploads
- Requires: OPH-1 (Multi-Tenant Auth) — Weiterleitungs-Adressen sind mandantenspezifisch

## Konzept
Jeder Mandant erhält eine dedizierte Weiterleitungs-E-Mail-Adresse (z.B. `kunde123@orders.platform.de`). Mitarbeiter leiten Bestellungs-E-Mails direkt aus ihrem E-Mail-Programm weiter — kein manuelles Hochladen nötig. Das System empfängt die E-Mail, speichert alle Anhänge und startet automatisch die Verarbeitungspipeline.

## User Stories
- Als Mitarbeiter möchte ich eine Bestellungs-E-Mail aus meinem E-Mail-Programm (Outlook, Gmail) mit einem Klick an eine spezielle Adresse weiterleiten, damit die Bestellung ohne manuellen Upload-Schritt automatisch verarbeitet wird.
- Als Mitarbeiter möchte ich nach der Weiterleitung eine automatische Bestätigungs-E-Mail erhalten, damit ich weiß, dass die Bestellung empfangen und in Verarbeitung ist.
- Als Mandanten-Admin möchte ich die dedizierte Weiterleitungs-E-Mail-Adresse meines Unternehmens in den Einstellungen sehen, damit ich sie meinen Mitarbeitern kommunizieren kann.
- Als System möchte ich E-Mails von unbekannten Absendern (außerhalb des Mandanten) ablehnen oder in eine Quarantäne-Queue legen, damit keine unautorisierten Bestellungen ins System gelangen.

## Acceptance Criteria
- [ ] Jeder Mandant hat eine eindeutige Weiterleitungs-E-Mail-Adresse (generiert bei Mandanten-Erstellung)
- [ ] Eingehende E-Mails werden vollständig verarbeitet: E-Mail-Header (Von, An, Betreff, Datum), Text-Body (Plain-Text + HTML), alle Anhänge (.pdf, .xlsx, .xls, .csv)
- [ ] Automatische Bestätigungs-E-Mail an den Weiterleiter mit Link zur Bestellung in der Platform
- [ ] E-Mails von nicht-autorisierten Absendern (nicht in der Mitarbeiter-Liste des Mandanten) → Quarantäne-Queue; Mandanten-Admin wird benachrichtigt
- [ ] Verarbeiteter E-Mail-Inhalt wird gleich behandelt wie ein Web-Upload (gleiche Extraktions-Pipeline ab OPH-3)
- [ ] Maximale Anhang-Größe: 25 MB pro Datei (gleich wie Web-Upload)
- [ ] Empfangs-Bestätigung wird innerhalb von 30 Sekunden nach Eingang versendet
- [ ] Original-E-Mail wird als .eml-Datei in Supabase Storage archiviert

## Edge Cases
- Was passiert, wenn eine E-Mail keine Anhänge hat (nur Text-Body)? → Wird trotzdem verarbeitet; Extraktion aus dem Text-Body
- Was passiert, wenn ein Anhang ein nicht-unterstütztes Format hat (z.B. .docx)? → Nicht-unterstützte Anhänge werden übersprungen; Warnung in der Bestellübersicht; unterstützte Anhänge werden normal verarbeitet
- Was passiert, wenn dieselbe E-Mail zweimal weitergeleitet wird? → Duplikat-Erkennung via Message-ID-Header; zweite Weiterleitung wird als Duplikat markiert; Benutzer erhält Hinweis
- Was passiert, wenn das E-Mail-Ingest-System ausfällt? → E-Mails bleiben auf dem Mail-Server; Retry nach Systemwiederherstellung (falls Mail-Provider Queue unterstützt)
- Was passiert, wenn eine E-Mail sehr groß ist (viele Anhänge, > 50 MB gesamt)? → Ablehnung mit Bounce-Nachricht "E-Mail zu groß"

## Technical Requirements
- E-Mail-Ingest: Integration mit Inbound-E-Mail-Service (z.B. Postmark Inbound, Sendgrid Inbound Parse, oder AWS SES)
- Webhook von E-Mail-Provider → Next.js API Route → Verarbeitungspipeline
- Message-ID-Hashing für Duplikat-Erkennung
- Quarantäne-Queue: Tabelle `email_quarantine` mit Admin-Review-UI
- Weiterleitungs-Adresse: `{tenant_slug}@inbound.{platform-domain}`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
