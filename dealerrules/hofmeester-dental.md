# Händler-Dokumentation: Hofmeester Dental

> Erstellt am: 2026-03-31
> Zuletzt aktualisiert: 2026-03-31
> Erstellt von: Claude (Dealer Rule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Hofmeester Dental |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | hofmeester.nl |
| **Bekannte Absender** | purchase@hofmeester.nl, purchaseorders@hofmeester.nl |
| **Sprache der Bestellungen** | EN |
| **Region / Land** | Niederlande |

---

## Bestellformat-Beschreibung

Hofmeester Dental sendet Bestellungen als einseitiges PDF mit dem Titel "Purchase order HXXXXXX". Die Tabelle hat 5 Spalten: "Quantity", "Item code" (Hersteller-Artikelnummer), "Item description", "Our code" (Hofmeester-interne Nummer) und "Manufacturer code" (verkürzte/alternative Codes — wird ignoriert). Jede Position steht in einer einzigen Zeile. Die Kundennummer steht im Kopfbereich unter "Our customer code:". Die Bestellnummer folgt auf "Purchase order" im Titel.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Nein
- [x] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] Zwischensummen-Zeilen vorhanden: Nein

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Spalte "Item code" (Spalte 2). Lange alphanumerische Codes (z.B. "210033L104021", "5700110104190", "8202807").
- **Händler-Artikelnummer (dealer_article_number):** Spalte "Our code" (Spalte 4). Numerische Codes, 6-stellig (z.B. "301420", "048020", "162222").
- **Besondere Muster:** Spalte "Manufacturer code" (Spalte 5) enthält verkürzte/alternative Codes (z.B. "HP HM33L/021", "100HP", "FG 868G014") — wird NICHT als article_number verwendet. Diese Spalte kann auch leer sein.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Quantity | quantity | Ganzzahl |
| Item code | article_number | Hersteller-Artikelnummer (Meisinger) |
| Item description | description | Produktbeschreibung |
| Our code | dealer_article_number | Hofmeester-interne Nummer |
| Manufacturer code | — | IGNORIEREN — verkürzte/alternative Codes |

### Kundennummer

- **Position:** Kopfbereich unter "Our customer code:"
- **Format:** Numerisch, 6-stellig
- **Beispiel:** "202004"
- **Hinweis:** "C1732" oben rechts ist eine interne Referenz, NICHT die Kundennummer.

### Mengenbehandlung

- Mengen als Ganzzahlen in Spalte "Quantity" (z.B. 1, 2, 3, 5, 10, 30, 40)
- Keine Besonderheiten

### Mehrzeilige Positionen

- [x] Mehrzeilig: Nein — jede Position steht in einer Zeile

### Sonstige Besonderheiten

- Bestellnummer: "Purchase order H831777" → "H831777"
- Bestelldatum: "Order date: 03/30/2026" im Format MM/DD/YYYY
- Spalte "Manufacturer code" kann leer sein (z.B. bei Our code 328816) — kein Fehler
- Bestellung ist typischerweise einseitig

---

## Beispiel-Dokument

- **Dateiname:** Inkooporder H831777.pdf
- **Anzahl Positionen:** 17 Produktzeilen
- **Auffälligkeiten:** Alle Zeilen sind echte Produktzeilen. Spalte "Manufacturer code" bei einer Position leer (Our code 328816). "Item code" enthält Codes unterschiedlicher Länge (7-15 Zeichen).

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   - Spalte "Item code" (Spalte 2) enthält die HERSTELLER-Artikelnummer → "article_number"
   - Spalte "Our code" (Spalte 4) enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Spalte "Manufacturer code" (Spalte 5) IGNORIEREN — diese enthält verkürzte/alternative Codes
     und ist NICHT die primäre Hersteller-Artikelnummer.

   Beispiel aus dem Dokument:
   30  210033L104021  500 104 171007 021 (HP HM33L)  301420  HP HM33L/021
   → article_number: "210033L104021"
   → dealer_article_number: "301420"
   → description: "500 104 171007 021 (HP HM33L)"
   → quantity: 30

   Weiteres Beispiel:
   1  8202807  2807 (HP BURSTAND)  048020  2807
   → article_number: "8202807"
   → dealer_article_number: "048020"
   → description: "2807 (HP BURSTAND)"
   → quantity: 1

2. SPALTEN-MAPPING:
   - Spalte 1 "Quantity" = quantity
   - Spalte 2 "Item code" = article_number (Hersteller-Artikelnummer)
   - Spalte 3 "Item description" = description
   - Spalte 4 "Our code" = dealer_article_number (Hofmeester-interne Nummer)
   - Spalte 5 "Manufacturer code" = IGNORIEREN

3. BESTELLDATEN:
   - Bestellnummer: "Purchase order H831777" → order_number: "H831777"
   - Bestelldatum: "Order date: 03/30/2026" → order_date: "03/30/2026"
   - Kundennummer: "Our customer code: 202004" → customer_number: "202004"
   - "C1732" oben rechts ist eine interne Referenz, NICHT die Kundennummer → ignorieren

4. BESONDERHEITEN:
   - Spalte "Manufacturer code" kann leer sein (z.B. Zeile mit Our code 328816) — das ist kein Fehler
   - Alle Zeilen in der Tabelle sind echte Produktzeilen, keine Header/Footer-Zeilen zum Filtern
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-03-31 | Erstmalige Erstellung | Neue Händler-Anbindung Hofmeester Dental |
