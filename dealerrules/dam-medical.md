# Händler-Dokumentation: Dam Medical B.V.

> Erstellt am: 2026-04-22
> Zuletzt aktualisiert: 2026-04-22
> Erstellt von: Claude (Dealer Rule Generator)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Dam Medical B.V. |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | dammedical.nl |
| **Bekannte Absender** | info@dammedical.nl |
| **Sprache der Bestellungen** | EN (mit vereinzelten niederländischen Begriffen) |
| **Region / Land** | Niederlande (Boxtel, Noord-Brabant) |

---

## Bestellformat-Beschreibung

Dam Medical sendet PDF-Bestellungen mit einer einfachen Tabelle. Spalten: Article, Description, Quantity, Price, %, Amount. Die Besonderheit ist, dass die "Article"-Spalte Dam Medicals eigene 15-stellige Referenznummern enthält — keine Meisinger-Herstellernummern. Dieselbe Referenznummer kann für verschiedene Produktvarianten verwendet werden (z.B. unterschiedliche Größen). Es gibt keine separate Händler-Artikelnummer. Die Packungsangabe ist in der Beschreibung eingebettet ("/5pcs", "/2pcs", "/pc"), nicht in einer eigenen Spalte.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [ ] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Ja — "Total excl. vat", "Total vat", "Total"
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Ja — "Total excl. vat"

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Spalte "Article" enthält Dam Medicals eigene Referenznummern (15-stellig, z.B. "500104001001021"). Diese werden als article_number extrahiert, damit der Artikelstamm die Zuordnung zur Meisinger-Herstellernummer übernehmen kann (OPH-40).
- **Händler-Artikelnummer (dealer_article_number):** Existiert nicht in diesem Format.
- **Besondere Muster:** Dieselbe Referenznummer kann für verschiedene Größen/Varianten verwendet werden (z.B. "330104409297021" für sowohl size 014 als auch size 021).

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Article | article_number | Dam Medical Referenznummer (15-stellig) |
| Description | description | Enthält auch Packungsangabe ("/5pcs") |
| Quantity | quantity | Anzahl Packungen |
| Price | unit_price | Dezimalformat mit Komma |
| Amount | total_price | Dezimalformat mit Komma |
| % | — | Rabatt-Spalte, immer leer |

### Kundennummer

- **Position:** Nicht im Dokument enthalten
- **Format:** —
- **Beispiel:** —
- **Achtung:** Die Meisinger-Kundennummer für Dam Medical muss separat konfiguriert werden.

### Mengenbehandlung

- **Einheit im Dokument:** Eingebettet in der Beschreibung ("/5pcs", "/2pcs", "/pc")
- **Verpackungseinheiten:** "/5pcs" = Packung à 5 Stück, "/2pcs" = Packung à 2 Stück, "/pc" = Einzelstück
- **Besonderheiten:** Quantity-Spalte enthält die Anzahl der Packungen, nicht die Einzelstückzahl.

### Mehrzeilige Positionen

- [ ] Mehrzeilig: Nein
- Jede Position ist einzeilig.

### Sonstige Besonderheiten

- Bestellungen auf Englisch mit vereinzelten niederländischen Begriffen ("Duitsland" = Deutschland).
- Empfänger ist immer Hager & Meisinger GmbH, Hanssemannstr.10, 41468 Neuss.
- Firmendaten im Footer: CoC 01108331, IBAN NL69 RABO 0115 7624 93, VAT 814530448B01.

---

## Beispiel-Dokument

- **Dateiname:** Dam_Medical_B.V._Bestelling_926160158.pdf
- **Anzahl Positionen:** 7 echte Produktzeilen
- **Auffälligkeiten:** Referenznummer "330104409297021" erscheint doppelt für zwei verschiedene Größen (014 und 021). Keine Kundennummer im Dokument. Packungsangabe in der Beschreibung eingebettet.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   Die Spalte "Article" enthält Dam Medicals eigene Referenznummern für Meisinger-Produkte — keine Meisinger-Herstellernummern. Diese Nummern als "article_number" extrahieren, damit der Artikelstamm sie zuordnen kann. Es gibt KEINE "dealer_article_number" in diesem Format.

   Beispiele aus dem Dokument:
   500104001001021 | HM21 Carbide Tungsten burs size 021 /5pcs | 3 | 14,65 | 43,95
   → article_number: "500104001001021"
   → description: "HM21 Carbide Tungsten burs size 021 /5pcs"
   → quantity: 3 → unit_price: 14.65 → total_price: 43.95

   330104409297021 | 166RF steel surgical cutter size 014 /2pcs | 4 | 14,52 | 58,08
   → article_number: "330104409297021"
   → description: "166RF steel surgical cutter size 014 /2pcs"
   → quantity: 4

2. SPALTEN-MAPPING:
   - "Article" = article_number
   - "Description" = description
   - "Quantity" = quantity
   - "Price" = unit_price
   - "Amount" = total_price
   - Spalte "%" (Rabatt) ist leer → ignorieren

3. ZEILEN FILTERN - Folgende Zeilen am Dokumentende NICHT als Produkte extrahieren:
   - "Total excl. vat" (Nettosumme)
   - "Total vat" (Mehrwertsteuer)
   - "Total" (Gesamtbetrag)

4. MENGEN-BEHANDLUNG:
   Die Packungsangabe steht in der Beschreibung, NICHT in einer separaten Spalte.
   "/5pcs" = Packung à 5 Stück, "/2pcs" = Packung à 2 Stück, "/pc" = Einzelstück.
   Die Spalte "Quantity" = Anzahl der Packungen → als unit: "Packung" extrahieren.
   Beispiel: "HM1 Carbide Tungsten burs size 006 /5pcs" | Quantity: 3 → quantity: 3, unit: "Packung"

5. BESTELLDATEN:
   - Bestellnummer steht nach "Order" im Kopfbereich → order_number (z.B. "926160158")
   - Bestelldatum steht nach "Order date" im Format DD-MM-YYYY → order_date (z.B. "15-04-2026")

6. KUNDENNUMMER:
   Die Kundennummer (Meisinger-Kundennummer für Dam Medical) ist NICHT im Dokument enthalten. Feld leer lassen.

7. BESONDERHEITEN:
   - Sprache: Englisch mit vereinzelten niederländischen Begriffen ("Duitsland" = Deutschland)
   - Sender: Dam Medical B.V., Staarten 23 A, 5281 PK Boxtel, Niederlande
   - Empfänger: Hager & Meisinger GmbH, Hanssemannstr.10, 41468 Neuss
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-22 | Erstmalige Erstellung | Neue Bestellung von Dam Medical analysiert (926160158.pdf) |
