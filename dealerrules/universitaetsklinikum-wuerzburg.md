# Händler-Dokumentation: Universitätsklinikum Würzburg

> Erstellt am: 2026-04-21
> Zuletzt aktualisiert: 2026-04-21
> Erstellt von: Claude (Dealerrule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Universitätsklinikum Würzburg (UKW) |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | ukw.de |
| **Bekannte Absender** | Weis_A1@ukw.de, einkauf_medizinbedarf@ukw.de |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Bayern) |

---

## Bestellformat-Beschreibung

Bestellungen kommen als PDF im SAP-Bestellformat. Das Dokument hat einen strukturierten Kopfbereich mit Bestellnummer, Datum, Kundennummer und Lieferadresse. Die Bestellpositionen stehen in einer Tabelle mit den Spalten Pos., Material, Bezeichnung, Bestellmenge, Einheit, Preis pro Einheit und Nettowert. Jede Position erstreckt sich über mehrere Zeilen: nach der Produktzeile folgen "Ihre Materialnummer" (Hersteller-Art.Nr.), "Ihre Charge" (Chargennummer) und optional "bestehend aus:"-Zeilen für Set-Bestandteile. Am Ende steht eine Gesamtnettowert-Summenzeile.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein (Header ist separater Bereich)
- [ ] Bestellfuß-Zeilen vorhanden: Ja — "Gesamtnettowert ohne Mwst EUR [Betrag]"
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja — Gesamtnettowert-Zeile
- [x] Sonstige Nicht-Produkt-Zeilen: "Ihre Charge XXXXXX" und "bestehend aus:"-Zeilen

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht in der Zeile "Ihre Materialnummer [Nr]" unterhalb der Produktzeile. Format: numerisch, z.B. "57804", "57820"
- **Händler-Artikelnummer (dealer_article_number):** Steht in der Spalte "Material". Format: 8-stellig numerisch, z.B. "11101531", "11115954"
- **Besondere Muster:** Positionsnummern (00010, 00020, ...) sind SAP-Positionsnummern und dürfen nicht als Artikelnummern extrahiert werden.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | — | SAP-Positionsnummer, nicht extrahieren |
| Material | dealer_article_number | 8-stellige Händler-Art.Nr. |
| Bezeichnung | description | Produktbeschreibung |
| Bestellmenge | quantity | Ganzzahl |
| Einheit | unit | z.B. "Stück" |
| Preis pro Einheit | unit_price | EUR |
| Nettowert | total_price | EUR |
| Ihre Materialnummer | article_number | Hersteller-Art.Nr. (Folgezeile) |

### Kundennummer

- **Position:** Im Dokumentkopf, als "Kundennummer: 500284"
- **Format:** Numerisch, 6-stellig
- **Beispiel:** "500284"

### Mengenbehandlung

- **Einheit im Dokument:** "Stück"
- **Verpackungseinheiten:** Keine besondere Umrechnung nötig
- **Besonderheiten:** Keine

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja (3-7 Zeilen pro Position)
- **Muster:**
  - Zeile 1: [Pos.] [Material] [Bezeichnung]
  - Zeile 2: [Bestellmenge] [Einheit] [Preis pro Einheit] [Nettowert]
  - Zeile 3: "Ihre Materialnummer [article_number]"
  - Zeile 4 (optional): "Ihre Charge [Nr]" → ignorieren
  - Zeile 5+ (optional): "bestehend aus: ..." → ignorieren
- **Beispiel:**
  ```
  00010   11101531   Abdruckpf.-Set Ø4,10mm PS OTI S/SC/RS/RI
          1          Stück   49,00   49,00
  Ihre Materialnummer 57804
  Ihre Charge 099148
  bestehend aus: PS-Abdruckpfosten
                 Titanschraube kurz/lang
                 PS Modellimplantat
  ```

### Sonstige Besonderheiten

- Bestellnummer und Datum stehen zusammen im Format "4501142469 / 17.04.2026" — nur der Teil vor dem Schrägstrich ist die Bestellnummer.
- Es handelt sich um Konsignationslager-Bestellungen ("Bestellung Konsignationslager Nr. KN28").
- Lieferadresse kann abweichend zur Rechnungsadresse sein (Poliklinik vs. Finanz- und Rechnungswesen).

---

## Beispiel-Dokument

- **Dateiname:** 4501142469.pdf
- **Anzahl Positionen:** 4 echte Produktzeilen (Pos. 00010-00040)
- **Auffälligkeiten:** 2 der 4 Positionen haben "bestehend aus:"-Zeilen (Set-Artikel), die gefiltert werden müssen. Alle Positionen haben "Ihre Charge"-Zeilen.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   - Die Spalte "Material" enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer steht in der Zeile "Ihre Materialnummer [Nr]"
     direkt unter der Produktzeile → "article_number"
   - Die Positionsnummern (00010, 00020, ...) sind SAP-Positionen, KEINE Artikelnummern
     und dürfen NICHT als article_number extrahiert werden.

   Beispiel aus dem Dokument:
   00010   11101531   Abdruckpf.-Set Ø4,10mm PS OTI S/SC/RS/RI
           1          Stück   49,00   49,00
   Ihre Materialnummer 57804
   → dealer_article_number: "11101531"
   → article_number: "57804"
   → description: "Abdruckpf.-Set Ø4,10mm PS OTI S/SC/RS/RI"
   → quantity: 1
   → unit: "Stueck"
   → unit_price: 49.00
   → total_price: 49.00

2. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte und MÜSSEN aus
   line_items AUSGESCHLOSSEN werden:
   - Zeilen "Ihre Charge XXXXXX" (Chargennummer, kein Produkt)
   - Zeilen "bestehend aus: ..." und alle nachfolgenden Einrückungszeilen
     (z.B. "PS-Abdruckpfosten", "Titanschraube kurz/lang", "PS Modellimplantat")
     — das sind Set-Bestandteile, keine eigenständigen Bestellpositionen
   - Zeile "Gesamtnettowert ohne Mwst EUR [Betrag]" (Summenzeile)

3. MEHRZEILIGE POSITIONEN - Jede Bestellposition besteht aus 3-7 Zeilen:
   Zeile 1: [Pos.] [dealer_article_number] [description]
   Zeile 2: [quantity] [unit] [unit_price] [total_price]
   Zeile 3: "Ihre Materialnummer [article_number]" → article_number extrahieren
   Zeile 4: "Ihre Charge [Nr]" → IGNORIEREN
   Zeile 5+: "bestehend aus: ..." → IGNORIEREN
   Alle Zeilen einer Position gehören zum GLEICHEN line_item.

4. KUNDENNUMMER:
   - Steht im Dokumentkopf als "Kundennummer: 500284"
   - Nur die Zahl nach "Kundennummer: " extrahieren → "customer_number"

5. BESTELLDATEN:
   - Bestellnummer im Format "4501142469 / 17.04.2026" im Kopf-Kasten
   - Nur die Zahl vor dem Schrägstrich ist die Bestellnummer → "order_number"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-21 | Erstmalige Erstellung | Analyse der Bestellung 4501142469.pdf |
