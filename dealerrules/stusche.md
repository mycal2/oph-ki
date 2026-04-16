# Händler-Dokumentation: Stusche GmbH (Vetshop Brandenburg)

> Erstellt am: 2026-04-15
> Zuletzt aktualisiert: 2026-04-15
> Erstellt von: Claude (via /dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Stusche GmbH (Brand: Vetshop Brandenburg) |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | _(unbekannt — beim ersten Eingang ergänzen)_ |
| **Bekannte Absender** | _(unbekannt — beim ersten Eingang ergänzen)_ |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Teltow, Brandenburg) |

---

## Bestellformat-Beschreibung

Stusche GmbH versendet Bestellungen als PDF-Tabelle. Jede Position erstreckt sich über zwei Zeilen: Zeile 1 enthält Positions-Nr., die kombinierte Artikel-Nr. (mit 4-Buchstaben-Hersteller-Präfix), die Händler-Katalognummer (V-Nummer), Lieferdatum sowie Preise; Zeile 2 enthält die Produktbeschreibung. Am Seitenende stehen Zwischenübertrag und am Dokumentende Netto/MwSt/Gesamtsumme. Die Kundennummer steht im Kopfbereich der ersten Seite als "unsere Kunden-Nr.".

---

## Erkannte Besonderheiten

### Zeilen-Filterung
Das Dokument enthält mehrere Nicht-Produkt-Zeilen, die gefiltert werden müssen:

- [x] Bestellkopf-Zeilen vorhanden: Nein (Kopf ist eigenständig, keine Tabellenzeile)
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Nettobetrag", "Mehrwertsteuer", "Gesamtbetrag"
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja — "Übertrag [Betrag]" am Seitenende

### Artikelnummern-Zuordnung
Die Artikelspalte enthält ZWEI Artikelnummern nebeneinander: die Hersteller-Artikelnummer mit vorangestelltem 4-Buchstaben-Hersteller-Präfix sowie die Händler-Katalognummer (V-Nummer).

- **Hersteller-Artikelnummer (article_number):** In Spalte "Artikel-Nr./PZN/Katalog-Nr./Beschreibung" als erster Wert. Beginnt IMMER mit einem 4-buchstabigen Präfix (z.B. "MEIS" für Meisinger), der weggelassen werden muss. Der Rest ist die tatsächliche Hersteller-Artikelnummer.
- **Händler-Artikelnummer (dealer_article_number):** Direkt hinter dem Hersteller-Feld — eine V-Nummer wie "V600632". Das ist Vetshops interne PZN/Katalog-Nr.
- **Besondere Muster:** Das Präfix variiert je nach Hersteller (z.B. "MEIS" = Meisinger). Bei anderen Herstellern wird voraussichtlich ein anderer 4-Buchstaben-Code erscheinen. Regel: Die ersten 4 alphabetischen Zeichen wegschneiden, Rest ist `article_number`.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | _(nicht gemappt)_ | Nur Positionsnummer |
| Artikel-Nr./PZN/Katalog-Nr. (1. Wert) | article_number | 4-Buchstaben-Präfix entfernen |
| Artikel-Nr./PZN/Katalog-Nr. (2. Wert, V-Nummer) | dealer_article_number | Händler-Katalog |
| Beschreibung (Zeile 2 der Position) | description | |
| Lieferdatum | _(nicht gemappt)_ | |
| Menge | quantity | |
| Einzelpreis | unit_price | |
| Gesamtpreis | total_price | |

### Kundennummer

- **Position:** Im Kopfbereich von Seite 1 als "unsere Kunden-Nr. [Nummer]"
- **Format:** Numerisch (6-stellig)
- **Beispiel:** "unsere Kunden-Nr. 108655" → customer_number: "108655"
- **Achtung:** Auf Seite 2+ erscheint in der Kopfzeile zusätzlich "Kunden-Nr.: 71116" — das ist eine ANDERE Nummer (vermutlich die interne Händler-Kunden-Nr. von Stusche selbst) und darf NICHT als customer_number verwendet werden.

### Mengenbehandlung

- **Einheit im Dokument:** Nicht explizit ausgewiesen (Menge = numerisch, z.B. "5,00")
- **Verpackungseinheiten:** Keine Besonderheiten erkannt
- **Besonderheiten:** Menge steht in Zeile 1 der Position, nicht in Zeile 2 (Beschreibung)

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja — jede Position hat genau zwei Zeilen
- **Muster:** Zeile 1 = `[Pos.] [MEIS-Präfix+Hersteller-Art.Nr] [V-Nr.] [Lieferdatum] [Menge] [EP] [GP]`, Zeile 2 = Produktbeschreibung
- **Beispiel:**
  ```
  1  MEIS80631400152401  V600632  13.04.2026  5,00  2,31  11,55
  Diamantbohrer Fig 801 Arbeitsbereich 012 FG Schaft
  ```

### Sonstige Besonderheiten

- Bestellnummer erscheint als "Beleg-Nr. [Nummer]" im Kopfbereich (im Beispiel: 72603063)
- Bestelldatum als "Datum [TT.MM.JJJJ]" im Kopfbereich
- Das 4-Buchstaben-Präfix ist Stusche-spezifisch und dient als herstellerseitige Artikelkategorisierung — es gehört NICHT zur offiziellen Hersteller-Artikelnummer und würde sonst verhindern, dass Matches im Artikelstamm funktionieren.

---

## Beispiel-Dokument

- **Dateiname:** Bestellung_72603063.pdf
- **Anzahl Positionen:** 20 echte Produktzeilen (über 2 Seiten verteilt)
- **Auffälligkeiten:** 4 Nicht-Produkt-Zeilen (1× Übertrag, Nettobetrag, MwSt, Gesamtbetrag); Hersteller = Meisinger ("MEIS"-Präfix)

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG - Hersteller-Präfix in der Artikelnummer:
   Die Artikelnummer beginnt mit einem 4-buchstabigen Hersteller-Code (z.B.
   "MEIS" für Meisinger), gefolgt von der eigentlichen Hersteller-Artikelnummer.
   - Die ersten 4 Buchstaben (A-Z) sind der Hersteller-Code → WEGLASSEN
   - Alles danach ist die HERSTELLER-Artikelnummer → "article_number"

   Beispiele:
   "MEIS80631400152401" → article_number: "80631400152401"
   "MEIS9983P/204/045/5/" → article_number: "9983P/204/045/5/"
   "MEISHM33L/316/012/5/" → article_number: "HM33L/316/012/5/"

2. SPALTEN-MAPPING - Artikelspalte enthält zwei Werte:
   - Erster Wert: [4-Buchstaben-Code + Hersteller-Art.Nr] → article_number (nach Regel 1)
   - Zweiter Wert: "V"-Nummer (Händler-PZN/Katalog-Nr.) → "dealer_article_number"

   Beispiel: "MEIS80631400152401  V600632"
   → article_number: "80631400152401"
   → dealer_article_number: "V600632"

3. MEHRZEILIGE POSITIONEN - Jede Position besteht aus ZWEI Zeilen:
   - Zeile 1: [Pos.] [Art.Nr. + V-Nr.] [Lieferdatum] [Menge] [EP] [GP]
   - Zeile 2: Produktbeschreibung

   Beispiel:
   "1  MEIS80631400152401  V600632  13.04.2026  5,00  2,31  11,55"
   "Diamantbohrer Fig 801 Arbeitsbereich 012 FG Schaft"
   → article_number: "80631400152401", dealer_article_number: "V600632"
   → description: "Diamantbohrer Fig 801 Arbeitsbereich 012 FG Schaft"
   → quantity: 5, unit_price: 2.31, total_price: 11.55

4. ZEILEN FILTERN - KEINE Produkte, AUSSCHLIESSEN:
   - "Übertrag [Betrag]" (Seitenübertrag)
   - "Nettobetrag", "Mehrwertsteuer", "Gesamtbetrag" (Summenzeilen)

5. KUNDENNUMMER:
   - Steht auf Seite 1 im Kopfbereich: "unsere Kunden-Nr. [Nummer]"
   - Beispiel: "unsere Kunden-Nr. 108655" → customer_number: "108655"
   - NICHT verwenden: "Kunden-Nr.: 71116" in Seitenköpfen ab Seite 2

6. BESTELLDATEN:
   - Bestellnummer: "Beleg-Nr. 72603063" → order_number: "72603063"
   - Bestelldatum aus "Datum [TT.MM.JJJJ]"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-15 | Erstmalige Erstellung | Neuer Händler — Vetshop Brandenburg (Stusche GmbH) mit Meisinger-Bestellung; 4-Buchstaben-Hersteller-Präfix muss aus Artikelnummer entfernt werden, damit Artikelstamm-Matching funktioniert |
