# Händler-Dokumentation: M+W Dental (Müller & Weygandt GmbH)

> Erstellt am: 2026-04-16
> Zuletzt aktualisiert: 2026-04-16
> Erstellt von: Claude (/dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | M+W Dental (Müller & Weygandt GmbH) |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | mwdental.de |
| **Bekannte Absender** | Steffen.Diedolph@mwdental.de |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Büdingen, Hessen) |

---

## Bestellformat-Beschreibung

M+W Dental sendet Bestellungen als PDF mit tabellarischem Aufbau. Die Tabelle hat sieben Spalten: Pos, ArtNr, Art.Bezeichnung/Lieferantenartikelnummer, Menge, EZ-Preis (brutto), Gesamtwert (brutto) und Gesamtwert (netto). Jede Bestellposition erstreckt sich über zwei Zeilen: In der oberen Zeile stehen alle tabellarischen Daten (Positionsnummer, Händler-Artikelnummer, Beschreibung, Menge, Preise); in der zweiten Zeile steht nur die Lieferantenartikelnummer (Hersteller-Artikelnummer) direkt unter der Beschreibung. Am Ende der Tabelle folgt eine Summenzeile "Gesamtnettowert ohne Mwst in EUR". Der Kopfbereich enthält Bestellnummer, Datum, Lieferantennummer und Ansprechpartner.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein
- [ ] Bestellfuß-Zeilen vorhanden: Nein
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja — "Gesamtnettowert ohne Mwst in EUR [Betrag]"

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht in Zeile 2 unter der Spalte "Art.Bezeichnung / Lieferantenartikelnummer". Alphanumerisch, variierende Länge (z.B. `510909G314040`, `25077MG104023`, `1000001204012`).
- **Händler-Artikelnummer (dealer_article_number):** Spalte "ArtNr" (2. Spalte). Rein numerisch, 6-7 Stellen (z.B. `111277`, `3179558`, `7877939`).
- **Besondere Muster:** Der Spaltenname "ArtNr" suggeriert Herstellernummer, ist aber die interne M+W-Dental-Nummer. Die tatsächliche Herstellernummer (Lieferantenartikelnummer) steht immer allein auf Zeile 2, ohne weitere Spalteneinträge.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos | (nicht gemappt) | Positionsnummer (00010, 00020, ...) |
| ArtNr | dealer_article_number | Händler-interne Nummer |
| Art.Bezeichnung (Zeile 1) | description | Produktbeschreibung |
| Lieferantenartikelnummer (Zeile 2) | article_number | Hersteller-Artikelnummer |
| Menge | quantity + unit | Enthält Zahl + "ST" (z.B. "3 ST") |
| EZ-Preis (brutto) | unit_price | Einzelpreis brutto |
| Gesamtwert (brutto) | (nicht gemappt) | Brutto-Gesamtbetrag |
| Gesamtwert (netto) | total_price | Netto-Gesamtbetrag (letzte Spalte) |

### Kundennummer

- **Position:** Kopfbereich, Feld "Ihre Lieferantennummer bei uns"
- **Format:** Numerisch, 7 Stellen
- **Beispiel:** "5517248"

### Mengenbehandlung

- **Einheit im Dokument:** "ST" (Stück)
- **Verpackungseinheiten:** Keine besonderen Packungsumrechnungen. Die Beschreibung enthält teils Packungsgrößen (z.B. "5 St.", "10 St.", "100 St."), diese sind Teil der Beschreibung und nicht die bestellte Menge.
- **Besonderheiten:** Menge und Einheit stehen zusammen in einer Spalte (z.B. "3 ST"). Die Zahl muss separat als quantity extrahiert werden.

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** Zeile 1 = `[Pos] [ArtNr] [Beschreibung] [Menge] [EZ-Preis] [Gesamtwert brutto] [Gesamtwert netto]`; Zeile 2 = `[Lieferantenartikelnummer]` (nur unter Spalte 3, ohne weitere Einträge)
- **Beispiel:**
  ```
  00010  111277  H+M FG Diamant 909G ISO 040 (534) 5 St.  3 ST  29,60  88,80  88,80
  510909G314040
  ```
  ```
  00060  8287393  Meis. CoCr-Steine braun 733, 100 St.  2 ST  56,00  112,00  112,00
  6300733104005
  ```

### Sonstige Besonderheiten

- Bestellnummer und Datum stehen kombiniert im Kopfbereich: "Bestellnummer/Datum: 7100430933 / 13.04.2026"
- Anliefertermin ist angegeben (z.B. "20.04.2026") — wird aktuell nicht extrahiert.
- "Ihre Lieferantennummer bei uns: 5517248" ist die Kundennummer, die der Hersteller bei M+W Dental hat.
- Beschreibungen enthalten häufig die Verpackungseinheit als Teil des Texts (z.B. "5 St.", "10 St.") — dies ist NICHT die bestellte Menge.

---

## Beispiel-Dokument

- **Dateiname:** Bestellung 7100430933.pdf
- **Anzahl Positionen:** 13 echte Produktzeilen (über 2 Seiten verteilt)
- **Auffälligkeiten:**
  - 1 Summenzeile ("Gesamtnettowert ohne Mwst in EUR 527,18") muss gefiltert werden.
  - Verpackungsgrößen in der Beschreibung (z.B. "5 St.") dürfen nicht mit bestellter Menge verwechselt werden.
  - Spalte "ArtNr" ist trotz des Namens die Händler-Artikelnummer, nicht die Herstellernummer.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN - Jede Position besteht aus ZWEI Zeilen:
   - Zeile 1: [Pos] [ArtNr] [Beschreibung] [Menge] [EZ-Preis] [Gesamtwert brutto] [Gesamtwert netto]
   - Zeile 2: [Lieferantenartikelnummer] — steht direkt unter der Beschreibung,
     keine eigenen Spalteneinträge für Menge/Preis

   Beispiel:
   "00010  111277  H+M FG Diamant 909G ISO 040 (534) 5 St.  3 ST  29,60  88,80  88,80"
   "510909G314040"
   → dealer_article_number: "111277"
   → article_number: "510909G314040"
   → description: "H+M FG Diamant 909G ISO 040 (534) 5 St."
   → quantity: 3, unit: "Stueck", unit_price: 29.60, total_price: 88.80

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Spalte "ArtNr" (2. Spalte) = HÄNDLER-Artikelnummer → "dealer_article_number"
   - Zeile 2 (Lieferantenartikelnummer) = HERSTELLER-Artikelnummer → "article_number"

   Weitere Beispiele:
   ArtNr "3179558" → dealer_article_number: "3179558"
   Zeile 2 "25077MG104023" → article_number: "25077MG104023"

   ArtNr "5782839" → dealer_article_number: "5782839"
   Zeile 2 "6000601204000" → article_number: "6000601204000"

3. SPALTEN-MAPPING:
   - "EZ-Preis (brutto)" → unit_price
   - "Gesamtwert (netto)" (letzte Spalte) → total_price
   - "Menge" enthält Zahl + Einheit (z.B. "3 ST", "5 ST") → quantity und unit: "Stueck"

4. ZEILEN FILTERN - KEIN Produkt, AUSSCHLIESSEN:
   - Summenzeile: "Gesamtnettowert ohne Mwst in EUR ..." → AUSSCHLIESSEN

5. BESTELLDATEN:
   - Bestellnummer aus "Bestellnummer/Datum: 7100430933 / 13.04.2026"
     → order_number: "7100430933", order_date: "13.04.2026"

6. KUNDENNUMMER:
   - "Ihre Lieferantennummer bei uns: 5517248"
     → customer_number: "5517248"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-16 | Erstmalige Erstellung | Analyse von Bestellung 7100430933.pdf über /dealerrule |
