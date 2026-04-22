# Händler-Dokumentation: Breitfeld & Schliekert GmbH (B&S)

> Erstellt am: 2026-04-22
> Zuletzt aktualisiert: 2026-04-22
> Erstellt von: Claude (Dealer Rule Generator)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Breitfeld & Schliekert GmbH (B&S / Hilco Vision) |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | b-s.de |
| **Bekannte Absender** | tamara.grieshaber@b-s.de, info@b-s.de |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Karben, Hessen) |

---

## Bestellformat-Beschreibung

B&S sendet PDF-Einkaufsaufträge mit einer strukturierten Tabelle. Spalten: Artikel, Bezeichnung, Einheit, Menge, MwSt, EK-Preis, Rab %, Betrag (EUR), Anlieferdatum Altenstadt. Die Besonderheit ist, dass die Hersteller-Artikelnummer über 2 Zeilen in der "Artikel"-Spalte aufgeteilt ist und zusammengesetzt werden muss. Zusätzliche Beschreibungszeilen (Aliasnr., Produktkategorie, Kurzbezeichnung) erscheinen unter jeder Position in der "Bezeichnung"-Spalte. Die Einheit ist immer "VE" (Verpackungseinheit).

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Ja — Total-Zeilen, "Wir bitten um Auftragsbestätigung.", Lieferbedingung/Zahlungsbedingung/Skonto auf Seite 2
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja — "Total ohne MwSt. EUR" / "Total inkl. MwSt. EUR"

Zusätzlich: Jede Position hat zusätzliche Beschreibungszeilen (Aliasnr., Hartmetallfräser, HM-Kurzbezeichnung) die KEINE eigenen Produkte sind.

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Aufgeteilt auf Zeile 2 und 3 in der "Artikel"-Spalte. MÜSSEN direkt zusammengesetzt werden (kein Trennzeichen). Beispiel: "20000011040" + "14" = "2000001104014". Variiert in der Länge des Suffixes (2 Ziffern).
- **Händler-Artikelnummer (dealer_article_number):** Zeile 1 in der "Artikel"-Spalte (z.B. "1202552"). Immer 7-stellig numerisch.
- **Besondere Muster:** 3-zeilige Darstellung in "Artikel"-Spalte. Zeile 1 = Händler-Nr., Zeilen 2+3 = Hersteller-Nr. (aufgeteilt).

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Artikel (Zeile 1) | dealer_article_number | Händler-eigene Nummer |
| Artikel (Zeile 2+3) | article_number | Zusammengesetzt, kein Trennzeichen |
| Bezeichnung (Zeile 1) | description | Hauptbeschreibung |
| Einheit | unit | Immer "VE" (Verpackungseinheit) |
| Menge | quantity | |
| EK-Preis | unit_price | Dezimalformat mit Komma |
| Betrag (EUR) | total_price | Dezimalformat mit Komma |

### Kundennummer

- **Position:** Im Adressblock der Empfängeradresse (Hager & Meisinger GmbH), zwischen Straße und PLZ
- **Format:** Rein numerisch, 6 Stellen
- **Beispiel:** "210355"
- **Achtung:** "Lieferant 5030108" und "Bisherige Lieferantennr. 7703" sind NICHT die Kundennummer — das sind Meisinger's Lieferanten-IDs im B&S-System.

### Mengenbehandlung

- **Einheit im Dokument:** "VE" (Verpackungseinheit)
- **Verpackungseinheiten:** Keine Umrechnung nötig — Menge in VE ist die Bestellmenge
- **Besonderheiten:** "1ST" in der Beschreibung ist Teil des Produktnamens (Einzelstück-Verpackung), NICHT eine Mengenangabe

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** 3 Zeilen in "Artikel" + 3 zusätzliche Zeilen in "Bezeichnung"
- **Beispiel:**
  ```
  Artikel:                          Bezeichnung:
  1202552                           Bohrer mit Kopf 1,4/2,34mm 1ST     VE  25  19,00%  2,9300  0,00  73,25
  20000011040                       Aliasnr.: 203714
  14                                Hartmetallfräser
                                    HM 1 H 014
  ```

### Sonstige Besonderheiten

- Lieferadresse ist nicht B&S-Hauptsitz sondern "Hilco Vision Europe, c/o Breitfeld & Schliekert GmbH, Helmershäuser Straße 10, 63674 Altenstadt" — relevant für delivery_address.
- "Anlieferdatum Altenstadt" Spalte enthält das gewünschte Lieferdatum — nicht extraktionsrelevant für Standardfelder.
- B&S ist Teil der Hilco Vision Company.

---

## Beispiel-Dokument

- **Dateiname:** 1089888.pdf
- **Anzahl Positionen:** 4 echte Produktzeilen
- **Auffälligkeiten:** Hersteller-Artikelnummer über 2 Zeilen aufgeteilt. "Aliasnr."/"Hartmetallfräser"/"HM"-Zeilen als Zusatzbeschreibung. Seite 2 enthält nur Restbeschreibung der letzten Position + Summenzeile + Footer.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN:
   Jede Bestellposition besteht aus 3 Zeilen in der Spalte "Artikel":
   Zeile 1: Händler-Artikelnummer
   Zeile 2: Erster Teil der Hersteller-Artikelnummer
   Zeile 3: Zweiter Teil (Suffix) der Hersteller-Artikelnummer
   Die Teile in Zeile 2 und 3 werden DIREKT aneinandergereiht (kein Trennzeichen).
   Alle 3 Zeilen gehören zur GLEICHEN Position.

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Zeile 1 in "Artikel" = HÄNDLER-Artikelnummer → "dealer_article_number"
   - Zeile 2 + Zeile 3 direkt zusammengesetzt = HERSTELLER-Artikelnummer → "article_number"

   Beispiel aus dem Dokument:
   Zeile 1: 1202552
   Zeile 2: 20000011040
   Zeile 3: 14
   → dealer_article_number: "1202552"
   → article_number: "2000001104014"
   → description: "Bohrer mit Kopf 1,4/2,34mm 1ST"
   → unit: "VE"
   → quantity: 25
   → unit_price: 2.93
   → total_price: 73.25

   Weiteres Beispiel:
   Zeile 1: 1202550 | Zeile 2: 20000011040 | Zeile 3: 10
   → dealer_article_number: "1202550" → article_number: "2000001104010"

3. ZEILEN FILTERN - Folgende Inhalte sind KEINE eigenständigen Produkte:
   - Zeilen die mit "Aliasnr.:" beginnen → gehören zur vorherigen Position
   - Zeile "Hartmetallfräser" → gehören zur vorherigen Position
   - Zeilen die mit "HM " beginnen (z.B. "HM 1 H 014") → gehören zur vorherigen Position
   - "Wir bitten um Auftragsbestätigung." → AUSSCHLIESSEN
   - Zeilen mit "Total ohne MwSt." / "Total inkl. MwSt." → AUSSCHLIESSEN
   - Zeilen mit "Lieferbedingung" / "Zahlungsbedingung" / "Skonto" → AUSSCHLIESSEN

4. SPALTEN-MAPPING:
   - "Einheit" = unit (z.B. "VE" = Verpackungseinheit)
   - "Menge" = quantity
   - "EK-Preis" = unit_price
   - "Betrag (EUR)" = total_price

5. BESTELLDATEN:
   - Bestellnummer steht nach "Auft.Nr." im Kopf (z.B. "1089888")
   - Bestelldatum steht nach "Bestelldatum" (z.B. "13.04.2026")

6. KUNDENNUMMER:
   - Steht im Adressblock der Empfängeradresse zwischen Straße und PLZ
   - Beispiel: Hansemannstraße 10 / 210355 / 41468 Neuss → "210355"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-22 | Erstmalige Erstellung | Neue Bestellung von B&S analysiert (1089888.pdf) |
