# OPH-16: Trial-/Demo-Modus für Interessenten

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — `tenants.status = 'trial'` already in schema
- Requires: OPH-10 (E-Mail-Weiterleitungs-Ingestion) — trial rides on the same inbound email pipeline
- Requires: OPH-4 (KI-Datenextraktion) — trial reuses the same extraction engine
- Restricts: OPH-6 (ERP-Export) — blocked for trial tenants
- Restricts: OPH-9 (ERP-Mapping-Konfiguration) — blocked for trial tenants

## Konzept
Potenzielle Kunden (Interessenten) erhalten einen zeitlich begrenzten Demo-Zugang (28 Tage). Sie senden Bestellungs-E-Mails an ihre dedizierte Weiterleitungsadresse und erhalten automatisch eine Antwort-E-Mail mit den extrahierten Daten (Textübersicht + CSV-Anhang + Magic-Link zur Vorschau). Kein Web-Login nötig — der gesamte Workflow ist E-Mail-basiert. Nach Ablauf der Testphase wird der Admin benachrichtigt und entscheidet manuell über die weitere Vorgehensweise.

---

## User Stories

- Als Vertriebsmitarbeiter möchte ich im Admin-Panel einen Interessenten als Trial-Mandanten anlegen, damit dieser sofort seinen E-Mail-Workflow testen kann — ohne dass ein vollständiger Onboarding-Prozess nötig ist.
- Als Interessent möchte ich eine Bestellungs-E-Mail weiterleiten und automatisch eine Antwort mit den extrahierten Daten erhalten (Textübersicht + CSV + Vorschau-Link), damit ich die Plattform ohne Web-Login evaluieren kann.
- Als Interessent möchte ich über einen Magic-Link eine strukturierte, lesbare Vorschau der extrahierten Bestellung aufrufen können, ohne mich registrieren zu müssen — damit ich das Ergebnis auch mit Kollegen teilen kann.
- Als Admin möchte ich 7 Tage vor Ablauf der Testphase eine Benachrichtigungs-E-Mail erhalten, damit ich den Interessenten rechtzeitig kontaktieren kann.
- Als Admin möchte ich im Mandanten-Dashboard sehen, wann die Testphase eines Trial-Mandanten endet, damit ich den Überblick über laufende Demos behalte.

---

## Acceptance Criteria

1. **Trial-Mandant anlegen:** Admin kann beim Erstellen oder Bearbeiten eines Mandanten `status = trial` setzen. Das Startdatum (`trial_started_at`) wird automatisch auf das Erstellungsdatum gesetzt; das Ablaufdatum (`trial_expires_at`) wird auf 28 Tage später gesetzt.

2. **Admin-Übersicht:** In der Mandanten-Liste zeigt ein Trial-Mandant:
   - Badge "Trial" neben dem Namen
   - Verbleibende Tage bis zum Ablauf (z.B. "Noch 14 Tage")
   - Roter Hinweis wenn ≤ 7 Tage verbleiben

3. **E-Mail-Antwort nach Extraktion:** Wenn ein Trial-Mandant eine E-Mail einsendet und die KI-Extraktion abgeschlossen ist, erhält der Absender automatisch eine Antwort-E-Mail mit:
   - Einer lesbaren Textübersicht der extrahierten Bestelldaten (Bestellnummer, Datum, Artikel, Mengen, Gesamtbetrag)
   - Einem CSV-Datei-Anhang der extrahierten Bestellung
   - Einem Magic-Link zur read-only Vorschauseite (gültig 30 Tage)
   - Einem Hinweis auf die Vollversion der Plattform

4. **Magic-Link-Vorschauseite:** Eine öffentliche, token-geschützte Seite (`/orders/preview/[token]`) zeigt die extrahierten Bestelldaten in einer übersichtlichen, markenlosen Darstellung an — ohne Login-Anforderung. Die Seite ist schreibgeschützt (keine Aktionsbuttons außer "Vollversion testen"-CTA).

5. **Magic-Link-Ablauf:** Nach 30 Tagen ist der Magic-Link ungültig. Die Seite zeigt dann eine freundliche Meldung "Diese Vorschau ist nicht mehr verfügbar."

6. **Zugangsbeschränkungen für Trial-Mandanten:**
   - Kein Web-App-Login möglich (Login-Versuch zeigt Hinweis "Ihr Konto ist ein Trial-Konto. Bitte nutzen Sie die E-Mail-Weiterleitung.")
   - Kein Zugang zur ERP-Export-Funktion (API gibt 403 zurück)
   - Kein Zugang zur ERP-Mapping-Konfiguration (API gibt 403 zurück)
   - Keine Team-Einladungen möglich (API gibt 403 zurück)

7. **Trial-Ablauf-Benachrichtigung:** 7 Tage vor `trial_expires_at` erhält der Platform-Admin eine E-Mail mit dem Namen des Mandanten, dem Ablaufdatum und einem Link zur Admin-Mandantenübersicht. Am Tag des Ablaufs erhält der Admin eine zweite Benachrichtigung.

8. **Kein automatisches Deaktivieren:** Nach Ablauf der 28 Tage bleibt der Mandant aktiv (Admin entscheidet manuell). Eingehende E-Mails werden weiterhin verarbeitet — der Admin wird jedoch täglich benachrichtigt, bis der Status geändert wird.

---

## Edge Cases

- **Extraktion schlägt fehl:** Wenn die KI-Extraktion für einen Trial-Mandanten fehlschlägt, erhält der Absender eine E-Mail "Leider konnten die Bestelldaten nicht automatisch erkannt werden. Bitte prüfen Sie das Dokument-Format."
- **Mehrere E-Mails vom gleichen Absender:** Jede E-Mail erzeugt eine separate Bestellung mit eigenem Magic-Link — keine Zusammenführung.
- **Magic-Link geteilt:** Akzeptiertes Verhalten — die Vorschauseite ist bewusst öffentlich zugänglich (read-only, kein Schaden möglich).
- **Admin ändert Trial → Active:** Alle Beschränkungen werden sofort aufgehoben; die Antwort-E-Mail-Logik für die Vollversion bleibt bestehen (keine Trial-spezifische Antwort mehr).
- **Trial-Mandant sendet E-Mail von nicht-autorisiertem Absender:** Gleiche Quarantäne-Logik wie bei normalen Mandanten — kein Sonderverhalten.
- **Vorschauseite nach Ablauf:** Zeigt eine Hinweisseite "Vorschau abgelaufen" — kein 404, kein Server-Fehler.
- **CSV-Generierung schlägt fehl:** Antwort-E-Mail wird trotzdem versendet, aber ohne CSV-Anhang; ein Hinweis in der E-Mail erklärt das Fehlen des Anhangs.

---

## Technical Requirements

- Neue DB-Spalten auf `tenants`: `trial_started_at TIMESTAMPTZ`, `trial_expires_at TIMESTAMPTZ`
- Neue DB-Spalten auf `orders`: `preview_token TEXT UNIQUE`, `preview_token_expires_at TIMESTAMPTZ`
- Trial-Erkennung im inbound E-Mail webhook: `tenant.status === 'trial'` → andere Post-Extraction-Logik
- Trial-Antwort-E-Mail ausgelöst am Ende der Extraktion (nicht sofort bei Empfang)
- CSV-Generierung im Extraktion-Endpunkt für Trial-Tenants (kein ERP-Mapping nötig, einfache Spalten-Benennung)
- Cron Job: Tägliche Prüfung ablaufender Trial-Mandanten → Admin-Benachrichtigung
- Öffentliche Vorschauseite: kein Auth-Middleware, Token-Validierung in der API-Route
- Login-Seite: Trial-Tenant-Erkennung vor dem Login → Hinweis-Meldung

---
<!-- Sections below are added by subsequent skills -->
