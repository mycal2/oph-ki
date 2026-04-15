# Händler-Dokumentation: Dreve ProDiMed GmbH

> Erstellt am: 2026-04-15
> Zuletzt aktualisiert: 2026-04-15
> Erstellt von: Claude (via /dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Dreve ProDiMed GmbH |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | _(unbekannt — beim ersten Eingang ergänzen)_ |
| **Bekannte Absender** | _(unbekannt — beim ersten Eingang ergänzen)_ |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland |

---

## Bestellformat-Beschreibung

Dreve ProDiMed verschickt Bestellungen als PDF mit 8-spaltiger Tabelle (Pos., Art.-Nr., Beschreibung, Menge, Einheit, EK-Preis, PE, Rab. %, Betrag). Jede Bestellposition erstreckt sich über ZWEI Zeilen: Zeile 1 enthält die Händler-Art.-Nr. und die Herstellernummer innerhalb des Beschreibungstexts ("Ihre Art.-Nr. [HERSTELLER_NR]"); Zeile 2 enthält den Liefertermin ("LT: ...") und die eigentliche Produktbeschreibung. Am Ende folgt ein Summenblock (Total EUR ohne MwSt., MwSt., Total EUR inkl.). Seite 2 enthält ausschließlich AGB/Bedingungen, keine Produkte.

---

## Erkannte Besonderheiten

### Zeilen-Filterung
Der Summenblock am Ende muss gefiltert werden:

- [ ] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Total EUR ohne MwSt.", "19% MwSt.", "Total EUR inkl. MwSt."
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein (es gibt eine "Rab. %"-Spalte, aber keine separaten Rabattzeilen)
- [ ] Zwischensummen-Zeilen vorhanden: Nein

### Artikelnummern-Zuordnung
Die Hersteller-Artikelnummer hat KEINE eigene Spalte — sie ist im Beschreibungstext der Zeile 1 eingebettet.

- **Hersteller-Artikelnummer (article_number):** Innerhalb der Spalte "Beschreibung" (Zeile 1), hinter dem Text "Ihre Art.-Nr. ". Format: alphanumerisch (z.B. "33082RF104050").
- **Händler-Artikelnummer (dealer_article_number):** In Spalte "Art.-Nr." (Zeile 1). Meist numerisch (z.B. "956").
- **Besondere Muster:** Jede Position ist zweizeilig. Der Beschreibungstext in Zeile 1 beginnt mit "Ihre Art.-Nr. [NR]" — das ist KEINE Beschreibung, sondern die Herstellernummer. Die echte Beschreibung steht in Zeile 2 nach dem "LT: [Liefertermin]"-Präfix.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | _(nicht gemappt)_ | Positionsnummer |
| Art.-Nr. | dealer_article_number | Händler-interne Nr. |
| Beschreibung (Zeile 1) | → article_number | Nur der Teil nach "Ihre Art.-Nr. " |
| Beschreibung (Zeile 2, nach "LT:") | description | Die eigentliche Produktbeschreibung |
| Menge | quantity | |
| Einheit | unit | z.B. "Stück" |
| EK-Preis | unit_price | |
| PE | _(nicht gemappt)_ | Verpackungseinheit |
| Rab. % | _(nicht gemappt)_ | Rabatt % |
| Betrag | total_price | |

### Kundennummer

- **Position:** Im Kopfbereich als "Unsere Kd-Nr." (bevorzugt) oder "Kreditorennr." (Fallback)
- **Format:** Numerisch
- **Beispiel:** "Kreditorennr. 60292" → customer_number: "60292" (wenn "Unsere Kd-Nr." leer ist)
- **Achtung:** "Unsere Kd-Nr." war im Beispieldokument leer — in dem Fall wird "Kreditorennr." als Fallback verwendet. Wenn beide leer sind, keine customer_number extrahieren.

### Mengenbehandlung

- **Einheit im Dokument:** "Stück" (in eigener Spalte "Einheit")
- **Verpackungseinheiten:** PE-Spalte existiert, wird aber nicht gemappt
- **Besonderheiten:** Menge und Einheit sind sauber getrennt in eigenen Spalten

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja — jede Position hat genau zwei Zeilen
- **Muster:** Zeile 1 = Nummern/Preise + "Ihre Art.-Nr." in der Beschreibungsspalte; Zeile 2 = "LT: [Datum]  [Produktbeschreibung]"
- **Beispiel:**
  ```
  1  956  Ihre Art.-Nr. 33082RF104050  300  Stück  5,11  1  1.533,00
  LT: 29.04.26  Fräse zylindrisch, DM: 5,0 mm
  ```
  → dealer_article_number: "956"
  → article_number: "33082RF104050"
  → description: "Fräse zylindrisch, DM: 5,0 mm"
  → quantity: 300
  → unit: "Stück"
  → unit_price: 5.11
  → total_price: 1533.00

### Sonstige Besonderheiten

- Bestellnummer erscheint als "Bestellnummer: [NR]" (z.B. "Bestellnummer: 3803604")
- Bestelldatum als "Datum [Tag]. [Monat] [Jahr]" in deutscher Langform (z.B. "9. April 2026")
- Seite 2 enthält ausschließlich Einkaufsbedingungen / AGB — darf nicht als Positionsquelle behandelt werden

---

## Beispiel-Dokument

- **Dateiname:** Bestellung_3803604.pdf
- **Anzahl Positionen:** (Produktzeilen auf Seite 1, jeweils 2 Zeilen pro Position)
- **Auffälligkeiten:** 3 Nicht-Produkt-Zeilen am Ende (Total ohne MwSt., MwSt., Total inkl. MwSt.); "Unsere Kd-Nr." war leer; AGB-Seite 2

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN - Jede Bestellposition besteht aus ZWEI Zeilen:
   - Zeile 1: [Pos.] [Art.-Nr.] "Ihre Art.-Nr. [HERSTELLER_NR]" [Menge] [Einheit] [EK-Preis] [PE] [Betrag]
   - Zeile 2: "LT: [Liefertermin]  [Produktbeschreibung]"
   Beide Zeilen gehören zur GLEICHEN Position.

   Beispiel aus dem Dokument:
   Zeile 1: "1  956  Ihre Art.-Nr. 33082RF104050  300  Stück  5,11  1  1.533,00"
   Zeile 2: "LT: 29.04.26  Fräse zylindrisch, DM: 5,0 mm"
   → dealer_article_number: "956"
   → article_number: "33082RF104050"
   → description: "Fräse zylindrisch, DM: 5,0 mm"
   → quantity: 300
   → unit: "Stück"
   → unit_price: 5.11
   → total_price: 1533.00

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Spalte "Art.-Nr." enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer steht NICHT in einer eigenen Spalte, sondern in der "Beschreibung"-Spalte (Zeile 1) als Zahl nach dem Text "Ihre Art.-Nr. " → "article_number"
   - Die eigentliche Produktbeschreibung folgt erst in Zeile 2, nach dem Liefertermin "LT: xx.xx.xx"

3. ZEILEN FILTERN - Summenzeilen sind KEINE Produkte:
   - Zeilen die mit "Total EUR" oder "MwSt." beginnen, MÜSSEN aus line_items AUSGESCHLOSSEN werden
   - Beispiele: "Total EUR ohne MwSt. 1.533,00", "19% MwSt. 291,27", "Total EUR inkl. MwSt. 1.824,27"

4. KUNDENNUMMER:
   - Bevorzugt: Feld "Unsere Kd-Nr." im Kopfbereich (Kundennummer des Herstellers beim Händler)
   - Fallback: "Kreditorennr." (z.B. "60292")
   - Wenn "Unsere Kd-Nr." leer ist, keine customer_number extrahieren

5. BESTELLDATEN:
   - Bestellnummer: "Bestellnummer: 3803604" → order_number: "3803604"
   - Bestelldatum: "Datum 9. April 2026"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-15 | Erstmalige Erstellung | Neuer Händler — Dreve ProDiMed GmbH. Kritische Besonderheit: mehrzeilige Positionen mit Herstellernummer im Beschreibungstext ("Ihre Art.-Nr. ...") statt in eigener Spalte |
