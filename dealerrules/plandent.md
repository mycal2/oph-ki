# Händler-Dokumentation: Plandent GmbH & Co. KG

> Erstellt am: 2026-04-22
> Zuletzt aktualisiert: 2026-04-22
> Erstellt von: Claude (Dealerrule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Plandent GmbH & Co. KG |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | plandent.com |
| **Bekannte Absender** | (aus Bestelldokument nicht ersichtlich) |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (DACH) |

---

## Bestellformat-Beschreibung

Plandent-Bestellungen kommen als mehrseitige PDF-Tabellen. Das Layout enthält einen Kopfbereich mit Firmeninfo, Kundennummer, Bestellnummer und Datum, gefolgt von einer Tabelle mit den Spalten: Pos., Artikelbeschreibung, Preis EUR, Menge, Einheit, Umrechnung, Bestellwert in EUR. Jede Position erstreckt sich über mehrere Zeilen innerhalb der Spalte "Artikelbeschreibung": Produktname, Herst.Art.Nr, Lief.Art.Nr, und Interne Mat.Nr. Die Positionsnummern (10, 20, 30...) sind Sequenznummern, keine Artikelnummern.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein (Kopf ist separater Bereich, keine Tabellenzeile)
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Gesamtwert EUR [Betrag]" am Dokumentende
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [ ] Zwischensummen-Zeilen vorhanden: Nein

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht nach "Lief.Art.Nr:" in der Artikelbeschreibung. 15-stellige Meisinger-Lieferantennummer (z.B. "500104194141040"). Falls keine Lief.Art.Nr vorhanden, wird "Herst.Art.Nr:" als Fallback verwendet (z.B. "74CMC03").
- **Händler-Artikelnummer (dealer_article_number):** Steht nach "Interne Mat.Nr:" — 6-stellige Plandent-interne Nummer (z.B. "080667").
- **Besondere Muster:** Drei Artikelnummern pro Position (Herst.Art.Nr, Lief.Art.Nr, Interne Mat.Nr), jeweils in eigener Unterzeile der Artikelbeschreibung. Nicht jede Position hat alle drei Nummern — Pos. 110 hat z.B. keine Lief.Art.Nr.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Artikelbeschreibung (1. Zeile) | description | Nur die fettgedruckte Produktbezeichnung |
| Lief.Art.Nr: | article_number | Primäre Herstellernummer; Fallback: Herst.Art.Nr |
| Interne Mat.Nr: | dealer_article_number | Plandent-interne Nummer |
| Menge | quantity | |
| Einheit | unit | Immer "Stück" |
| Umrechnung | unit_price | Dezimalformat mit Komma (z.B. "29,8600") |
| Bestellwert in EUR | total_price | |
| Pos. | (ignorieren) | Positionsnummer, KEINE Artikelnummer |

### Kundennummer

- **Position:** Im Kopfbereich unter "Unsere Kundennummer"
- **Format:** Numerisch, 6-stellig
- **Beispiel:** "106003"

### Mengenbehandlung

- **Einheit im Dokument:** "Stück"
- **Verpackungseinheiten:** Manche Beschreibungen enthalten VE-Hinweise (z.B. "2 St." im Namen), aber die Spalte "Menge" gibt die Bestellmenge an
- **Besonderheiten:** Keine

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** Jede Position besteht aus 3-4 Zeilen innerhalb der Spalte "Artikelbeschreibung":
  - Zeile 1: Produktbeschreibung (fett)
  - Zeile 2: "Herst.Art.Nr: [Wert]"
  - Zeile 3: "Lief.Art.Nr: [Wert]" (optional, fehlt bei manchen Positionen)
  - Zeile 4: "Interne Mat.Nr: [Wert]"
- **Beispiel:**
  ```
  Pos.  Artikelbeschreibung                                    Preis EUR  Menge  Einheit  Umrechnung  Bestellwert
  10    HM Fräser kreuzvz. 79EX gelber Ring 040 x-fein HD 2 St.          5      Stück               149,30
        Herst.Art.Nr: 79EX040HDHM
        Lief.Art.Nr: 500104194141040
        Interne Mat.Nr: 080667                                 29,8600
  ```

### Sonstige Besonderheiten

- Lieferadresse und Rechnungsadresse sind im Kopfbereich getrennt aufgeführt
- Das Dokument enthält Fußzeilen mit Firmendaten (Geschäftsführer, Handelsregister) — diese sind kein Bestellinhalt
- Manche Artikelbeschreibungen enthalten technische Details mit Sonderzeichen (z.B. "Ø", Brüche)

---

## Beispiel-Dokument

- **Dateiname:** Plandent-Bestellung (PDF, 5 Seiten)
- **Anzahl Positionen:** ca. 11 echte Produktzeilen
- **Auffälligkeiten:** Position 110 hat keine Lief.Art.Nr (nur Herst.Art.Nr als Fallback). Gesamtwert-Zeile am Ende muss gefiltert werden.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN:
   Jede Bestellposition in der Spalte "Artikelbeschreibung" besteht aus mehreren Zeilen:
   Zeile 1 (fett): Produktbeschreibung → description
   Zeile 2: "Herst.Art.Nr: [Wert]" → zweite Herstellernummer (Fallback wenn keine Lief.Art.Nr)
   Zeile 3: "Lief.Art.Nr: [Wert]" → PRIMÄRE Herstellerartikelnummer → article_number
   Zeile 4: "Interne Mat.Nr: [Wert]" → Händler-interne Nummer → dealer_article_number
   Die Spalte "Pos." enthält Positionsnummern (10, 20, 30...) — KEINE Artikelnummern.

2. ARTIKELNUMMERN-ZUORDNUNG:
   - "Lief.Art.Nr:" = PRIMÄRE article_number (15-stellige Meisinger-Lieferantennummer)
   - "Herst.Art.Nr:" = SEKUNDÄRE article_number (nur wenn keine Lief.Art.Nr vorhanden)
   - "Interne Mat.Nr:" = dealer_article_number (6-stellige Plandent-interne Nummer)

   Beispiel Pos. 10:
   Herst.Art.Nr: 79EX040HDHM
   Lief.Art.Nr: 500104194141040
   Interne Mat.Nr: 080667
   → article_number: "500104194141040"
   → dealer_article_number: "080667"
   → description: "HM Fräser kreuzvz. 79EX gelber Ring 040 x-fein HD 2 St."

   Beispiel Pos. 110 (OHNE Lief.Art.Nr):
   Herst.Art.Nr: 74CMC03
   Interne Mat.Nr: 312175
   → article_number: "74CMC03"
   → dealer_article_number: "312175"

3. SPALTEN-MAPPING:
   - "Menge" = quantity
   - "Einheit" = unit (immer "Stück")
   - "Umrechnung" = unit_price (Dezimalformat mit Komma, z.B. "29,8600")
   - "Bestellwert in EUR" = total_price

4. ZEILEN FILTERN:
   - Zeile "Gesamtwert EUR [Betrag]" am Dokumentende NICHT als Produkt extrahieren.
   - Zeilen mit "Herst.Art.Nr:", "Lief.Art.Nr:", "Interne Mat.Nr:" sind KEINE
     eigenständigen Positionen — sie gehören zur vorherigen Produktzeile.

5. BESTELLDATEN:
   - Bestellnummer steht im Titel: "Bestellung BE-001566225" → order_number: "BE-001566225"
   - Bestelldatum steht nach "vom": "vom 16.04.2026" → order_date

6. KUNDENNUMMER:
   - Steht unter "Unsere Kundennummer" im Kopfbereich → customer_number: "106003"
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-22 | Erstmalige Erstellung | Dealerrule für Plandent-Bestellungen mit mehrzeiligen Positionen und drei Artikelnummern-Typen |
