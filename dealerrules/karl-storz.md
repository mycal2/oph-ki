# Händler-Dokumentation: KARL STORZ SE & Co. KG

> Erstellt am: 2026-04-15
> Zuletzt aktualisiert: 2026-04-15
> Erstellt von: Claude (via /dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | KARL STORZ SE & Co. KG |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | karlstorz.com |
| **Bekannte Absender** | Ute.Rees@karlstorz.com |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Tuttlingen) |

---

## Bestellformat-Beschreibung

KARL STORZ sendet Bestellungen als PDF im SAP-typischen Tabellenformat (5-stellige Positionsnummern mit führenden Nullen, z.B. "00010"). Der Kopfbereich enthält Bestellnummer, Datum, Bearbeiter-Kontakt und eine explizit beschriftete Kundennummer ("Unsere Kundennummer bei Ihnen: ..."). Jede Produktposition erstreckt sich über 2-3 Zeilen: Zeile 1 enthält die Händler-Artikelnummer, Mengen und Preise; Zeile 2 die Produktbeschreibung mit eingebetteter Hersteller-Artikelnummer nach "Art. "; Zeile 3 (optional) eine Angebots-Referenz. Bestellungen sind meist kurz (wenige Positionen). Seite 2 enthält nur Grußformel und Unterschrift.

---

## Erkannte Besonderheiten

### Zeilen-Filterung
- [ ] Bestellkopf-Zeilen vorhanden: Nein (Header steht außerhalb der Tabelle)
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Gesamter Auftragswert: ..."
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja (identisch mit Gesamt)
- [x] AGB-Text nach Produktzeilen (Zahlungsbedingungen, Lieferbedingungen, Ursprungsland-Hinweis) — KEIN Produkt
- [x] Seite 2 ist reine Unterschriftsseite ohne Produkte

### Artikelnummern-Zuordnung
- **Hersteller-Artikelnummer (article_number):** In der Produktbeschreibung (Zeile 2) als Text nach "Art. " bis zum nächsten Sonderzeichen (Ø, Leerzeichen+Dimension). Beispiel: "Diamantschleifinstrument rund Art. 801HP 016 Ø 1,60mm" → article_number = "801HP 016"
- **Händler-Artikelnummer (dealer_article_number):** Erste Zahl in Zeile 1 der Spalte "Artikel / Bezeichnung". Numerisch 7-stellig, z.B. "5682519".
- **Besondere Muster:** 5-stellige SAP-Positionsnummern ("00010", "00020", ...) dürfen NICHT mit Artikelnummern verwechselt werden.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | — | SAP-Positionsnummer, nicht extrahieren |
| Artikel / Bezeichnung | dealer_article_number + description + article_number | Mehrzeilig: Zeile 1 = Händler-Nr, Zeile 2 = Beschreibung + Hersteller-Nr |
| Menge | quantity | Ganzzahl |
| Einheit | unit | z.B. "ST" (Stück) |
| Preis p.E. | unit_price | Deutsches Kommaformat |
| Nettowert (EUR) | total_price | Deutsches Kommaformat |

### Kundennummer
- **Position:** Im Kopfbereich, eindeutig beschriftet als "Unsere Kundennummer bei Ihnen:"
- **Format:** Numerisch, 6-stellig
- **Beispiel:** "Unsere Kundennummer bei Ihnen: 108606" → customer_number: "108606"

### Mengenbehandlung
- **Einheit im Dokument:** "ST" (für Stück) — wird zu "Stueck" normalisiert
- **Verpackungseinheiten:** Keine Besonderheiten
- **Besonderheiten:** Menge ist immer eine einfache Ganzzahl

### Mehrzeilige Positionen
- [x] Mehrzeilig: Ja — 2 bis 3 Zeilen pro Position
- **Muster:**
  - Zeile 1: [Pos.] [Händler-Art.Nr] [Menge] [Einheit] [Preis p.E.] [Nettowert]
  - Zeile 2: Produktbeschreibung mit eingebetteter Hersteller-Artikelnummer nach "Art. "
  - Zeile 3 (optional): Angebots-Referenz (z.B. "Angebot: AB 2009499 vom 11.09.2017")
- **Beispiel:**
  ```
  00010  5682519                  20  ST  1,96  39,20
         Diamantschleifinstrument rund Art. 801HP 016 Ø 1,60mm
         Angebot: AB 2009499 vom 11.09.2017
  ```

### Sonstige Besonderheiten
- Bestellnummern haben SAP-Format mit 10 Stellen (z.B. "4502869583")
- Bearbeiter-Kontakt (Name, Tel, E-Mail) im Kopfbereich
- Liefertermin explizit genannt — in notes aufnehmen
- AGB-Verweis auf https://www.karlstorz.com/de/de/supplier.htm
- VOB-Hinweis (für Dienstleistungen) — nicht relevant für Artikel-Extraktion

---

## Beispiel-Dokument

- **Dateiname:** 4502869583_Bestellung.pdf
- **Anzahl Positionen:** 1 echte Produktzeile (kleiner Testauftrag)
- **Seiten:** 2 (nur Seite 1 hat Produktdaten)
- **Auffälligkeiten:** Mehrzeilige Positionsstruktur mit eingebetteter Hersteller-Artikelnummer in der Beschreibung

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN - Jede Bestellposition besteht aus 2-3 Zeilen:
   - Zeile 1: [Pos. 5-stellig] [Händler-Art.Nr] [Menge] [Einheit] [Preis p.E.] [Nettowert]
   - Zeile 2: Produktbeschreibung mit eingebetteter Hersteller-Artikelnummer nach "Art. "
   - Zeile 3 (optional): Angebots-Referenz (z.B. "Angebot: AB 2009499 vom 11.09.2017") → als Notiz zur Position, KEIN eigenes line_item
   Alle Zeilen einer Position gehören zusammen.

   Beispiel aus dem Dokument:
   Zeile 1: "00010  5682519  20  ST  1,96  39,20"
   Zeile 2: "Diamantschleifinstrument rund Art. 801HP 016 Ø 1,60mm"
   Zeile 3: "Angebot: AB 2009499 vom 11.09.2017"
   → dealer_article_number: "5682519"
   → article_number: "801HP 016"
   → description: "Diamantschleifinstrument rund Art. 801HP 016 Ø 1,60mm"
   → quantity: 20
   → unit: "Stueck"
   → unit_price: 1.96
   → total_price: 39.20

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Zeile 1 der Spalte "Artikel / Bezeichnung": erste Zahl = HÄNDLER-Artikelnummer → "dealer_article_number"
   - HERSTELLER-Artikelnummer: in Zeile 2 der Text unmittelbar nach "Art. " bis zum nächsten Sonderzeichen (Ø, /, Leerzeichen + Dimension) → "article_number"
   - Beispiel: "...rund Art. 801HP 016 Ø 1,60mm" → article_number: "801HP 016"
   - ACHTUNG: Die 5-stelligen Positions-Nummern (00010, 00020...) in Spalte "Pos." sind KEINE Artikelnummern

3. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte:
   - "Gesamter Auftragswert: ..." → Summenzeile, MUSS aus line_items AUSGESCHLOSSEN werden
   - Reiner AGB-Text nach den Produktzeilen (Zahlungsbedingungen, Lieferbedingungen etc.) → KEIN Produkt
   - Seite 2 enthält nur Grußformel und Unterschrift → KEINE Produkte

4. KUNDENNUMMER:
   - Steht im Kopfbereich als "Unsere Kundennummer bei Ihnen: [Nummer]"
   - Beispiel: "Unsere Kundennummer bei Ihnen: 108606" → customer_number: "108606"

5. BESTELLDATEN:
   - Bestellnummer: "Bestell-Nr. 4502869583" → order_number: "4502869583"
   - Bestelldatum: "Datum: 13.04.2026"
   - Liefertermin ("Liefertermin: 23.04.2026") in "notes" aufnehmen
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-15 | Erstmalige Erstellung | Dealer wurde automatisch angelegt nach Re-Extraktion von Bestellung 4502869583 (Stopwords-Fix) |
