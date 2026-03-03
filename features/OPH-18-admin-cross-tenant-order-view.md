# OPH-18: Admin Cross-Tenant Order View

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — platform_admin role required
- Requires: OPH-2 (Order Upload) — orders must exist to filter
- Requires: OPH-8 (Admin: Mandanten-Management) — tenants must exist for the filter list

---

## Konzept

Currently, a platform admin sees all orders from all tenants in a single flat list with no way to tell which order belongs to which tenant, and no way to filter to a specific tenant. With a growing number of tenants this becomes unmanageable.

This feature adds two improvements to the orders list for platform admins only:
1. A **"Mandant" column** in the orders table so each order shows its tenant name
2. A **tenant filter dropdown** in the toolbar so the admin can scope the view to one tenant

Regular tenant users are unaffected — they continue to see only their own orders with no tenant column or filter.

---

## User Stories

- Als Platform-Admin möchte ich in der Bestellungsliste sehen, welchem Mandanten jede Bestellung gehört, damit ich den Überblick über alle Mandanten-Aktivitäten behalte.
- Als Platform-Admin möchte ich die Bestellungsliste nach einem bestimmten Mandanten filtern können, damit ich gezielt die Aktivitäten eines einzelnen Mandanten prüfen kann.
- Als Platform-Admin möchte ich schnell zwischen "Alle Mandanten" und einem spezifischen Mandanten wechseln können, ohne die Seite neu zu laden.
- Als Platform-Admin möchte ich, dass der Mandanten-Filter und die Mandanten-Spalte nur für mich sichtbar sind, damit reguläre Tenant-User keine verwirrenden UI-Elemente sehen.
- Als Platform-Admin möchte ich, dass die bestehenden Filter (Suche, Status) zusammen mit dem Mandanten-Filter funktionieren, damit ich Bestellungen kombiniert eingrenzen kann.

---

## Acceptance Criteria

- [ ] **AC-1: Mandant-Spalte für Platform-Admins**
  - In der Bestellungstabelle gibt es eine neue Spalte "Mandant"
  - Die Spalte zeigt den Mandantennamen (z.B. "Dental GmbH") für jede Bestellung
  - Die Spalte ist nur sichtbar, wenn der eingeloggte Benutzer `platform_admin` ist
  - Reguläre Tenant-User sehen die Spalte nicht

- [ ] **AC-2: Mandanten-Filter Dropdown in der Toolbar**
  - Neben der Suchleiste erscheint ein Dropdown "Mandant: Alle" (nur für Platform-Admins)
  - Das Dropdown listet alle aktiven und trial Mandanten alphabetisch auf
  - Option "Alle Mandanten" zeigt alle Bestellungen (Standard)
  - Auswahl eines Mandanten filtert die Liste auf dessen Bestellungen
  - Der Filter arbeitet zusammen mit der Textsuche und dem Status-Filter

- [ ] **AC-3: Persistenz des Filters (Session)**
  - Der gewählte Mandanten-Filter bleibt beim Navigieren zur Bestellungs-Detailseite und zurück erhalten
  - Nach einem Browser-Refresh wird der Filter zurückgesetzt (kein permanentes Speichern nötig)

- [ ] **AC-4: Keine Änderung für Tenant-User**
  - Reguläre `tenant_user` und `tenant_admin` sehen weiterhin ausschließlich ihre eigenen Bestellungen
  - Die UI ist identisch mit dem heutigen Stand (kein Tenant-Filter, keine Mandant-Spalte)
  - Die API-Logik ändert sich nicht für nicht-admin Benutzer

- [ ] **AC-5: Tenant-Name kommt vom Backend**
  - Die Bestellungs-API gibt den Mandantennamen mit zurück (Join auf `tenants.name`)
  - Kein separater API-Aufruf nötig, um den Mandantennamen zu laden
  - Inaktive Mandanten bleiben filterbar (der Admin soll auch historische Daten einsehen können)

---

## Edge Cases

- **Mandant hat keine Bestellungen:** Dropdown zeigt den Mandanten trotzdem an; bei Auswahl erscheint der Leer-Zustand "Keine Bestellungen gefunden"
- **Sehr viele Mandanten im Dropdown (>20):** Dropdown bleibt scrollbar; keine Paginierung nötig (max. 100 Mandanten realistisch)
- **Mandant wurde gelöscht oder deaktiviert:** Falls ein Mandantenname nicht mehr in der Tenant-Liste erscheint, aber noch Bestellungen existieren, wird der Name direkt aus dem Order-Join angezeigt (keine fehlerhafte Anzeige)
- **Platform-Admin filtert auf Mandant X, dann öffnet eine Bestellung:** Zurück-Navigation zur Bestellungsliste sollte idealerweise den Filter beibehalten (State im Client)
- **Gleichzeitig Suche + Mandanten-Filter + Status-Filter:** Alle drei Filter werden mit AND-Logik kombiniert (d.h. Suche "Henry" + Mandant "Dental GmbH" zeigt nur Henry-Bestellungen von Dental GmbH)
- **Bestellung ohne Tenant-Name (theoretisch):** Zeige "—" als Fallback in der Mandant-Spalte

---

## Technical Requirements

- Der Mandantenname muss per Datenbank-Join in der orders-API mitgeliefert werden (kein N+1)
- Der Mandanten-Filter wird clientseitig aus den bereits geladenen Bestellungen befüllt (kein separater API-Aufruf für die Tenant-Liste nötig, da die Mandantennamen bereits im Response enthalten sind)
- Die Spalte "Mandant" ist auf Desktop sichtbar (`hidden lg:table-cell` oder ähnlich) — auf kleinen Bildschirmen kann sie ausgeblendet werden
- Die Änderungen dürfen die bestehende Performance der Orders-Liste nicht verschlechtern (der JOIN auf tenants ist ein einfacher Index-Lookup)

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
