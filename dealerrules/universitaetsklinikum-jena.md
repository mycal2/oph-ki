# Händler-Dokumentation: Universitätsklinikum Jena

> Erstellt am: 2026-04-21
> Zuletzt aktualisiert: 2026-04-21
> Erstellt von: Claude (Dealerrule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Universitätsklinikum Jena (UKJ) |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | med.uni-jena.de, uniklinikum-jena.de |
| **Bekannte Absender** | einkauf-wv-Bedarf@med.uni-jena.de |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Thüringen) |

---

## Bestellformat-Beschreibung

Bestellungen kommen als PDF im SAP-Format, übermittelt über GHX Europe. Das Dokument hat einen strukturierten Kopfbereich mit Bestellnummer, Datum, Lieferadresse und Rechnungsadresse. Die Bestellpositionen stehen in einer Tabelle mit den Spalten Pos., Bezeichnung, Art.Nr., BestellmengeEinheit, Preis pro Einheit und Nettowert. Jede Position erstreckt sich über mehrere Zeilen: nach der Produktzeile folgt "Ihre Materialnummer: [REF] [Nr]" und optional eine Chargennummer. Die Spalte "Bezeichnung" enthält die Produktbeschreibung mit der Hersteller-Artikelnummer am Ende des Textes; die kanonische Artikelnummer kommt jedoch aus "Ihre Materialnummer:". Die Spalte "Art.Nr." enthält die Händler-Artikelnummer.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein (Header ist separater Bereich)
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Gesamtnettowert ohne MwSt EUR [Betrag]"
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [ ] Zwischensummen-Zeilen vorhanden: Nein
- [x] Sonstige Nicht-Produkt-Zeilen: "Chargennummer: XXXXXX"

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht in der Zeile "Ihre Materialnummer: [REF] [Nr]" unterhalb der Produktzeile. Format: numerisch, z.B. "57804", "57801". Achtung: manchmal mit "REF "-Präfix (z.B. "REF 57804"), manchmal ohne (z.B. "58502"). Das "REF " muss entfernt werden.
- **Händler-Artikelnummer (dealer_article_number):** Steht in der Spalte "Art.Nr.". Format: 6-7 stellig numerisch, z.B. "681771", "6002461"
- **Besondere Muster:** Die Bezeichnung enthält die Hersteller-Art.Nr. am Ende des Produktnamens (z.B. "Abdruckpfosten PS OTI Bego 57804") — diese Zahl ist Teil der Beschreibung, NICHT die kanonische article_number.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | — | Positionsnummer, nicht extrahieren |
| Bezeichnung | description | Produktbeschreibung (inkl. Art.Nr. am Ende) |
| Art.Nr. | dealer_article_number | Händler-Artikelnummer |
| BestellmengeEinheit | quantity + unit | z.B. "1 Stück" |
| Preis pro Einheit | unit_price | z.B. "46.55 EUR pro 1 Stück" |
| Nettowert | total_price | EUR |
| Ihre Materialnummer: | article_number | Hersteller-Art.Nr. (Folgezeile, "REF " entfernen) |

### Kundennummer

- **Position:** Im Dokumentkopf als "Unsere Kundennummer: manuell"
- **Format:** Nicht vorhanden — "manuell" ist keine echte Kundennummer
- **Beispiel:** Keine extrahierbare Kundennummer

### Mengenbehandlung

- **Einheit im Dokument:** "Stück"
- **Verpackungseinheiten:** Keine besondere Umrechnung nötig
- **Besonderheiten:** Keine

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja (3-4 Zeilen pro Position)
- **Muster:**
  - Zeile 1: [Pos.] [Bezeichnung/description] [Art.Nr./dealer_article_number]
  - Zeile 2: "Ihre Materialnummer: [REF] [article_number]"
  - Zeile 3: [quantity] [unit]
  - Zeile 4 (optional): "Chargennummer: [Nr]" → ignorieren
- **Beispiel:**
  ```
  10   Abdruckpfosten PS OTI Bego 57804    681771
       Ihre Materialnummer: REF 57804
       1 Stück
                                    46.55 EUR pro 1 Stück    46,55
  ```

### Sonstige Besonderheiten

- Bestellungen werden über GHX Europe übermittelt (Header: "Diese Bestellung wurde durch die GHX Europe übermittelt.")
- Bestellnummer enthält ein Suffix nach Bindestrich: "0045594740-010" — vollständig übernehmen.
- "Unsere Kundennummer: manuell" — keine echte Kundennummer extrahierbar.
- Beschreibungen können abgeschnitten sein (z.B. "Abformset PS CTI SC/SCX/RS/R.. 5,5 57802") — die ".." zeigt eine Kürzung an.

---

## Beispiel-Dokument

- **Dateiname:** Bestellung_0045594740-010.pdf
- **Anzahl Positionen:** 5 echte Produktzeilen (Pos. 10-50)
- **Auffälligkeiten:** Inkonsistentes "REF "-Präfix bei "Ihre Materialnummer:", eine Position hat eine Chargennummer. Kundennummer ist "manuell" (nicht extrahierbar).

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   - Die Spalte "Art.Nr." enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer steht in der Zeile "Ihre Materialnummer: [REF] [Nr]"
     direkt unter der Produktzeile → "article_number"
     Das Präfix "REF " NICHT in die article_number übernehmen, nur die Zahl.
   - Positionsnummern (10, 20, 30, ...) sind KEINE Artikelnummern.
   - Die Zahl am Ende der Bezeichnung (z.B. "57804" in "Abdruckpfosten PS OTI Bego 57804")
     gehört zur Produktbeschreibung — NICHT als article_number extrahieren.
     Die article_number kommt ausschließlich aus "Ihre Materialnummer:".

   Beispiel aus dem Dokument:
   10   Abdruckpfosten PS OTI Bego 57804   681771
        Ihre Materialnummer: REF 57804
        1 Stück                  46.55 EUR pro 1 Stück   46,55
   → dealer_article_number: "681771"
   → article_number: "57804"  (REF-Präfix entfernt)
   → description: "Abdruckpfosten PS OTI Bego 57804"
   → quantity: 1
   → unit: "Stueck"
   → unit_price: 46.55
   → total_price: 46.55

2. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte und MÜSSEN
   aus line_items AUSGESCHLOSSEN werden:
   - Zeilen "Chargennummer: XXXXXX" (Chargennummer, kein Produkt)
   - Zeile "Gesamtnettowert ohne MwSt EUR [Betrag]" (Summenzeile)

3. MEHRZEILIGE POSITIONEN - Jede Bestellposition besteht aus 3-4 Zeilen:
   Zeile 1: [Pos.] [description]          [dealer_article_number]
   Zeile 2: "Ihre Materialnummer: [REF] [article_number]"
   Zeile 3: [quantity] Stück
   Zeile 4 (optional): "Chargennummer: [Nr]" → IGNORIEREN
   Alle Zeilen einer Position gehören zum GLEICHEN line_item.

4. KUNDENNUMMER:
   - Im Dokument steht "Unsere Kundennummer: manuell" — keine echte Kundennummer.
   - customer_number nicht extrahieren / leer lassen.

5. BESTELLDATEN:
   - Bestellnummer im Format "0045594740-010" — vollständige Nummer
     inklusive Suffix "-010" als order_number übernehmen.
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-21 | Erstmalige Erstellung | Analyse der Bestellung 0045594740-010.pdf |
