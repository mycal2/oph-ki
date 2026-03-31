# Händler-Dokumentation: Dentalair Consumables B.V.

> Erstellt am: 2026-03-31
> Zuletzt aktualisiert: 2026-03-31
> Erstellt von: Claude (Dealer Rule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Dentalair Consumables B.V. |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | dentalair.nl |
| **Bekannte Absender** | inkoop@dentalair.nl, consumables@dentalair.nl |
| **Sprache der Bestellungen** | NL / EN (zweisprachig) |
| **Region / Land** | Niederlande |

---

## Bestellformat-Beschreibung

Dentalair sendet Bestellungen als mehrseitiges PDF mit dem Titel "PURCHASE ORDER". Die Tabelle hat 5 Spalten: "Your partnumber" (Meisinger-Artikelnummer), "Quantity", "Size/Qty", "Our partnumber" (Dentalair-interne Nummer) und "Description". Jede Position steht in einer einzigen Zeile. Mengen werden im niederländischen Format mit Komma als Dezimaltrennzeichen angegeben (z.B. "1,00"). Die Bestellnummer steht prominent unter "Purchase order:" im Kopfbereich. Der Lieferanten-Code unter "Supplier:" ist die interne Meisinger-Lieferantennummer bei Dentalair.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Nein
- [x] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Nein

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Spalte "Your partnumber" (Spalte 1). Aus Dentalairs Sicht ist "Your" = Meisinger (der Hersteller). Format: lange numerische Codes (z.B. "330205424364013") oder kurze alphanumerische Codes (z.B. "5901").
- **Händler-Artikelnummer (dealer_article_number):** Spalte "Our partnumber" (Spalte 4). Dentalairs interne Artikelnummer im Format XXXX-XXXX-XX (z.B. "2350-0015-33").
- **Besondere Muster:** Die Benennung "Your/Our" ist aus Händlersicht — "Your" = Hersteller, "Our" = Händler.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Your partnumber | article_number | Hersteller-Artikelnummer (Meisinger) |
| Quantity | quantity | Dezimalkomma (z.B. "1,00" → 1) |
| Size/Qty | — | Meist leer, ignorieren |
| Our partnumber | dealer_article_number | Dentalair-interne Nummer |
| Description | description | Produktbeschreibung |

### Kundennummer

- **Position:** Im Kopfbereich unter "Supplier:" steht die Lieferantennummer (200840) — das ist Dentalairs interne Nummer für Meisinger, KEINE Kundennummer.
- **Kundennummer:** Nicht explizit vorhanden im Dokument. Der Code "411C" oben links könnte eine interne Referenz sein, ist aber unzuverlässig.

### Mengenbehandlung

- Mengen im niederländischen Format: Dezimalkomma statt Dezimalpunkt (z.B. "1,00", "3,00", "26,00")
- Extraktion soll die Menge als Ganzzahl erfassen (1,00 → 1)

### Mehrzeilige Positionen

- [x] Mehrzeilig: Nein — jede Position steht in einer Zeile

### Sonstige Besonderheiten

- Bestellnummer unter "Purchase order:" (z.B. "2026451893")
- Datum im Format D-M-YYYY (z.B. "25-3-2026")
- Bestellung kann mehrere Seiten umfassen; alle Seiten gehören zur gleichen Bestellung

---

## Beispiel-Dokument

- **Dateiname:** 2026451893.pdf
- **Anzahl Positionen:** 36 Produktzeilen (über 2 Seiten)
- **Auffälligkeiten:** Keine Nicht-Produkt-Zeilen. Mengen mit Dezimalkomma. "Your partnumber" enthält teils sehr lange numerische Codes (bis 15-stellig) und teils kurze alphanumerische Codes.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   - Spalte "Your partnumber" (Spalte 1) enthält die HERSTELLER-Artikelnummer → "article_number"
     ("Your" bedeutet aus Händlersicht: deine = Meisinger-Artikelnummer)
   - Spalte "Our partnumber" (Spalte 4) enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
     ("Our" bedeutet aus Händlersicht: unsere = Dentalair-interne Nummer)

   Beispiel aus dem Dokument:
   330205424364013  1,00  [leer]  2350-0015-33  BENEX PILOTBOOR A2001 013
   → article_number: "330205424364013"
   → dealer_article_number: "2350-0015-33"
   → description: "BENEX PILOTBOOR A2001 013"
   → quantity: 1

   Weiteres Beispiel (kurze Artikelnummer):
   5901  1,00  [leer]  2350-0016-09  ZIRKON FG DIAMOND KIT 5901
   → article_number: "5901"
   → dealer_article_number: "2350-0016-09"

2. SPALTEN-MAPPING:
   - Spalte 1 "Your partnumber" = article_number
   - Spalte 2 "Quantity" = quantity (Dezimalkomma: "1,00" → 1, "26,00" → 26)
   - Spalte 3 "Size/Qty" = ignorieren (meist leer)
   - Spalte 4 "Our partnumber" = dealer_article_number
   - Spalte 5 "Description" = description

3. BESTELLDATEN:
   - Bestellnummer: unter "Purchase order:" → order_number (z.B. "2026451893")
   - Bestelldatum: unter "Date:" im Format D-M-YYYY → order_date (z.B. "25-3-2026")
   - "Supplier: 200840" ist Dentalairs interne Lieferantennummer, NICHT die Kundennummer → ignorieren
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-03-31 | Erstmalige Erstellung | Neue Händler-Anbindung Dentalair |
