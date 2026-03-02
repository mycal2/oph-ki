# OPH-9: Admin: ERP-Mapping-Konfiguration

## Status: Planned
**Created:** 2026-02-27
**Last Updated:** 2026-03-02

## Dependencies
- Requires: OPH-8 (Admin: Mandanten-Management) — Konfiguration ist immer einem Mandanten zugeordnet
- Requires: OPH-6 (ERP-Export & Download) — Mapping-Regeln werden bei jedem Export ausgewertet
- Modifies: OPH-6 — Export-Logik muss Mapping-Konfiguration konsultieren

## Konzept

Jeder Mandant hat spezifische Anforderungen an das ERP-Import-Format (Spaltenreihenfolge, Feldnamen, Datentypen, Zeichensatz). Platform-Admins konfigurieren diese Regeln über eine UI — kein Code-Deployment nötig. Konfigurationen sind versioniert, können rückgängig gemacht und zwischen Mandanten übertragen werden.

**Mapping-Pipeline:** `Canonical JSON → [Mapping-Regeln] → ERP-Ausgabedatei`

**Canonical JSON** = das von der KI extrahierte, normalisierte Bestelldaten-Objekt (order_number, order_date, items[], etc.)

**Zielgruppe:** Ausschließlich Platform-Admins (internes Team) — kein Mandantenzugang.

---

## User Stories

- Als Platform-Admin möchte ich für jeden Mandanten das Ausgabeformat (CSV / XML / JSON) sowie technische Einstellungen (Zeichensatz, Dezimaltrennzeichen, Zeilenende) konfigurieren, damit jeder Mandant genau die Datei erhält, die sein ERP erwartet.
- Als Platform-Admin möchte ich für CSV-Exporte eine geordnete Liste von Spalten definieren (Ausgabename, Quelle im Canonical JSON, optionale Transformation), damit die Spaltenstruktur exakt dem ERP-Importtemplate des Mandanten entspricht.
- Als Platform-Admin möchte ich für XML-Exporte ein Handlebars-Template (`{{order.order_number}}`, `{{#each order.items}}...{{/each}}`) definieren, damit strukturell komplexe XML-Formate ohne Code-Änderungen konfiguriert werden können.
- Als Platform-Admin möchte ich Transformationsregeln auf Feldebene definieren (`to_uppercase`, `round(n)`, `multiply(n)`, `date_format(pattern)`, `default(value)`, `trim`, `to_lowercase`), damit Rohwerte korrekt in das Zielformat des ERP umgewandelt werden.
- Als Platform-Admin möchte ich eine Mapping-Konfiguration mit einem Beispiel-Canonical-JSON testen (manuell eingegeben oder aus einer existierenden Bestellung ausgewählt), damit ich den generierten Export-Inhalt vor dem Liveschalten prüfen kann.
- Als Platform-Admin möchte ich die Versionshistorie einer Mapping-Konfiguration einsehen und auf eine frühere Version zurückrollen, damit fehlerhafte Änderungen schnell rückgängig gemacht werden können.
- Als Platform-Admin möchte ich die aktive Mapping-Konfiguration eines Mandanten als Ausgangsbasis auf einen anderen Mandanten kopieren, damit ich Zeit bei ähnlichen ERP-Systemen spare.
- Als Platform-Admin möchte ich pro Mandant einstellen, ob ein fehlender Export-Mapping-Block den Export blockiert oder einen generischen Fallback-CSV auslöst, damit ich das Verhalten je nach Mandantenreife steuern kann.

---

## Acceptance Criteria

- **AC-1:** Pro Mandant gibt es genau einen aktiven Mapping-Konfigurationsdatensatz. Alle früheren Versionen bleiben unbegrenzt erhalten.
- **AC-2:** Konfigurierbare technische Exportparameter pro Mandant: Ausgabeformat (CSV, XML, JSON), Zeichensatz (UTF-8, Latin-1, Windows-1252), Dezimaltrennzeichen (Punkt, Komma), Zeilenende (LF, CRLF).
- **AC-3:** Fallback-Modus ist pro Mandant einstellbar: `block` (Export wird verweigert wenn kein Mapping konfiguriert) oder `fallback_csv` (generischer CSV mit allen Canonical-JSON-Feldern in Standardreihenfolge). Default: `block`.
- **AC-4 (CSV):** CSV-Konfiguration besteht aus einer geordneten Liste von Spalten. Jede Spalte hat: Ausgabe-Spaltenname (Pflicht), Canonical-JSON-Pfad als Datenquelle (Pflicht, z.B. `order.order_number`, `items[].product_code`), optionale Transformation, Pflichtfeld-Flag.
- **AC-5 (XML):** XML-Konfiguration besteht aus einem Freitext-Template mit Handlebars-Syntax: `{{order.order_number}}` für skalare Werte, `{{#each order.items}}...{{/each}}` für Listenwiederholugen. Template wird beim Speichern auf Handlebars-Syntaxfehler geprüft — ungültige Templates werden abgelehnt.
- **AC-6 (Transformationen):** Folgende Transformationen sind verfügbar und kombinierbar (Reihenfolge der Ausführung entspricht Konfigurationsreihenfolge): `to_uppercase`, `to_lowercase`, `trim`, `round(n)` (n Dezimalstellen), `multiply(n)` (numerische Multiplikation), `date_format(pattern)` (Datumsformatierung nach Pattern, z.B. `DD.MM.YYYY`), `default(value)` (Fallback wenn Feld null/leer).
- **AC-7 (Test-Funktion):** Admin kann eine Mapping-Konfiguration testen durch: (a) manuelles Eingeben eines Canonical-JSON-Objekts, oder (b) Auswählen einer existierenden, approbierten Bestellung des Mandanten. Das System zeigt den vollständigen generierten Export-Inhalt als Text-Preview an.
- **AC-8 (Pflichtfelder):** Felder, die als Pflichtfeld markiert sind, blockieren den Export, wenn der Feldwert im Canonical JSON `null` oder leer ist. Die Fehlermeldung benennt das fehlende Feld konkret.
- **AC-9 (Versionshistorie):** Jede gespeicherte Änderung erzeugt eine neue Version mit: Versionsnummer (auto-increment), Timestamp, optionalem Änderungskommentar. Alle Versionen sind in einer Liste einsehbar.
- **AC-10 (Rollback):** Admin kann eine beliebige frühere Version als neue aktive Version wiederherstellen. Dies erzeugt eine neue Versionseinträg (Kopie der alten) — die Historie bleibt unverändert.
- **AC-11 (Kopieren):** Admin kann die aktiv Konfiguration (Spaltenregeln, Format, Transformationen) von Mandant A zu Mandant B kopieren. Die Kopie wird im Zielmandanten als neue Version gespeichert. Die Versionshistorie des Quellmandanten wird NICHT übertragen.
- **AC-12:** Konfigurationsänderungen sind sofort wirksam ohne Deployment. Laufende Exporte nutzen die zum Zeitpunkt des Exports aktive Version.
- **AC-13:** Die gesamte Verwaltungsoberfläche ist ausschließlich Platform-Admins zugänglich (kein Mandantenzugang).

---

## Edge Cases

- **Schema-Evolution:** Wenn ein Canonical-JSON-Feld umbenannt wird (z.B. `order_no` → `order_number`) und eine Mapping-Konfiguration noch den alten Pfad referenziert, gibt die Test-Funktion eine Warnung aus: "Feld nicht gefunden: [feldpfad]". Der Export läuft weiter (Feld gibt `null` zurück), so dass `default(value)` greifen kann.
- **Kein Mapping konfiguriert + Fallback = `block`:** ERP-Export-Endpoint gibt HTTP 409 zurück mit Nachricht "Kein ERP-Mapping konfiguriert für diesen Mandanten."
- **Kein Mapping konfiguriert + Fallback = `fallback_csv`:** Export liefert alle Canonical-JSON-Felder in einer generischen CSV-Datei ohne Transformation.
- **Transformationsfehler (z.B. `round` auf nicht-numerischen String):** Fehler wird beim Testen sichtbar; der Export einer echten Bestellung erzeugt eine leere Zelle für das betroffene Feld und protokolliert eine Warnung.
- **XML-Syntaxfehler im Template:** Handlebars-Parse-Fehler wird beim Speichern abgefangen; der Datensatz wird nicht gespeichert und die Fehlerstelle wird dem Admin angezeigt.
- **Kopieren auf Mandant mit bestehendem Mapping:** Die Kopie wird als neue Version zum Zielmandanten hinzugefügt. Die bestehende aktive Version des Zielmandanten bleibt in der Historie erhalten.
- **Gleichzeitige Bearbeitung durch zwei Admins:** Last-Write-Wins (akzeptabel für internes Tool). Beide Saves erzeugen je eine neue Version.
- **JSON-Pfad auf Array-Element ohne Index (`items[].product_code`):** Für CSV-Export: jedes Listen-Element erzeugt eine eigene Zeile im Output (Standardverhalten für Bestellpositionen).

---

## Out of Scope (für dieses Feature)

- Mandanten-seitige Konfigurationsoberfläche (nur Platform-Admin)
- Automatischer Schema-Migration wenn Canonical-JSON-Felder umbenannt werden
- Live-API-Push direkt ins ERP (MVP: Datei-Download bleibt)
- Diff-Anzeige zwischen zwei Versionen

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
