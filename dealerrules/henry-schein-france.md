# Händler-Dokumentation: HENRY SCHEIN FRANCE

> Erstellt am: 2026-04-15
> Zuletzt aktualisiert: 2026-04-15
> Erstellt von: Claude (/dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | HENRY SCHEIN FRANCE |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | henryschein.fr |
| **Bekannte Absender** | (noch nicht dokumentiert) |
| **Sprache der Bestellungen** | FR (Französisch, teils Englisch-Headings) |
| **Region / Land** | Frankreich |

---

## Bestellformat-Beschreibung

Henry Schein France sendet Bestellungen als PDF mit tabellarischem Aufbau. Die Tabelle hat sechs Spalten: SUPPLIER ITEM CODE, QUANTITY, UNIT PRICE, DISCOUNT, NET PRICE EUR und HSF ITEM CODE. Jede Bestellposition erstreckt sich über zwei Zeilen: In der oberen Zeile stehen die beiden Artikelnummern, die Produktbeschreibung (teils mit eingeschobenem Herstellernamen wie "BEGO") und ganz rechts der HSF-Code; in der zweiten Zeile folgen Menge, Einheit "UNITE", Einzelpreis, eventueller Rabatt-Prozentsatz und Nettopreis. Im Seitenkopf steht ein französischer Hinweisblock zur Lieferplattform ("MERCI DE NOUS CONFIRMER..."), der keine Produktdaten enthält; am Ende der Bestellung stehen Summenzeilen ("Amount Order HT", "VAT"). Der Händler ist unter "Invoice to" im Seitenfuß erkennbar.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Ja — französischer Hinweisblock "MERCI DE NOUS CONFIRMER CETTE COMMANDE ET DE PRENDRE RDV POUR LA LIVRAISON VIA LA PLATEFORME..." (keine Produktzeile, nur Prozess-Info).
- [x] Bestellfuß-Zeilen vorhanden: Ja — Summenzeilen "Amount Order HT: EURO ..." und "VAT: FR ...".
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein als eigene Zeile — Rabatt erscheint als zusätzliche Spalte in der Preis-Zeile der jeweiligen Position.
- [ ] Zwischensummen-Zeilen vorhanden: Nein.

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Erste Spalte der Tabelle: "SUPPLIER ITEM CODE". Rein numerisch, typ. 4–5 Stellen (z.B. `46014`, `54923`, `50270`).
- **Händler-Artikelnummer (dealer_article_number):** Letzte Spalte der Tabelle: "HSF ITEM CODE". Format `XXX-XXXX` (z.B. `878-4641`, `897-8387`, `880-8264`).
- **Besondere Muster:** Die Hersteller-Artikelnummer kann zusätzlich innerhalb der Beschreibungszeile nochmals auftauchen (z.B. "STERIBIM PLUS **54923** BEGO", "WIRON LIGHT (1 KG) **50270**"). Diese Wiederholung ist zu ignorieren — maßgeblich ist ausschließlich der Wert aus der ersten Spalte.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| SUPPLIER ITEM CODE | article_number | Erste Spalte |
| [Beschreibungstext] | description | Zwischen SUPPLIER ITEM CODE und HSF ITEM CODE, ggf. inklusive "BEGO"-Hinweis vor dem HSF-Code |
| HSF ITEM CODE | dealer_article_number | Letzte Spalte, Format `XXX-XXXX` |
| QUANTITY | quantity | In Zeile 2 der Position |
| UNITE | unit | Normalisieren zu `Stueck` |
| UNIT PRICE | unit_price | In Zeile 2 |
| DISCOUNT | (nicht gemappt) | Optional vorhanden; beeinflusst NET PRICE |
| NET PRICE EUR | total_price | In Zeile 2, nach optionalem Rabatt |

### Kundennummer

- **Position:** Kopfbereich, Feld "No Client:"
- **Format:** Alphanumerisch — im Beispiel leer.
- **Beispiel:** (nicht befüllt im vorliegenden Beispiel — Regel dennoch hinterlegt)

### Mengenbehandlung

- **Einheit im Dokument:** "UNITE" (Französisch für "Stück/Einheit")
- **Verpackungseinheiten:** Keine besonderen Packungsumrechnungen erkennbar.
- **Besonderheiten:** Menge und Einheit stehen in der ZWEITEN Zeile der jeweiligen Position, nicht in derselben Zeile wie Artikelnummer und Beschreibung.

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** Zeile 1 = `[SUPPLIER ITEM CODE]  [Beschreibung]  [ggf. "BEGO"]  [HSF ITEM CODE]`; Zeile 2 = `[QUANTITY]  UNITE  [UNIT PRICE]  [optional: DISCOUNT %]  [NET PRICE]`.
- **Beispiel:**
  ```
  46014  ALOX / KOROX 250 MICRONS BOITE 8KG BEGO 878-4641
  1  UNITE  25.16  25.16
  ```
  Mit Rabatt:
  ```
  14550  BUSE 1.2MM KOROX 250/KOROX 110 REF 13425 BEGO 880-8264
  1  UNITE  183.89  25.00  137.92
  ```

### Sonstige Besonderheiten

- Bestelldatum und Bestellnummer stehen im Kopfbereich: "Order Date: 17-02-26", "Order No HSF: 267839" / "Order No: 267839".
- Der Händler identifiziert sich nicht im Kopf der ersten Seite, sondern unten unter "Invoice to: HENRY SCHEIN FRANCE, 2-4 Rue de la Flottière, 37304 Joue-les-Tours".

---

## Beispiel-Dokument

- **Dateiname:** PO_267839 BEGO.pdf
- **Anzahl Positionen:** 36 echte Produktzeilen (über 5 Seiten verteilt)
- **Auffälligkeiten:**
  - 1 Hinweisblock pro Seite (französisch), muss gefiltert werden.
  - 2 Summenzeilen am Ende (Amount Order HT, VAT), müssen gefiltert werden.
  - Einige Beschreibungen wiederholen die Hersteller-Artikelnummer inline (z.B. "54923" in "STERIBIM PLUS 54923 BEGO"). Nicht doppelt erfassen.
  - Manche Positionen enthalten einen zusätzlichen DISCOUNT-Wert zwischen UNIT PRICE und NET PRICE.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG:
   - Spalte "SUPPLIER ITEM CODE" (erste Spalte) = HERSTELLER-Artikelnummer → "article_number"
   - Spalte "HSF ITEM CODE" (letzte Spalte) = HÄNDLER-Artikelnummer → "dealer_article_number"

   Beispiele:
   SUPPLIER ITEM CODE "46014", HSF ITEM CODE "878-4641"
   → article_number: "46014", dealer_article_number: "878-4641"

   SUPPLIER ITEM CODE "54923", HSF ITEM CODE "897-8387"
   → article_number: "54923", dealer_article_number: "897-8387"

2. MEHRZEILIGE POSITIONEN - Jede Position besteht aus ZWEI Zeilen:
   - Zeile 1: [SUPPLIER ITEM CODE]  [Beschreibung]  [ggf. BEGO-Hinweis]  [HSF ITEM CODE]
   - Zeile 2: [Menge]  UNITE  [Einzelpreis]  [ggf. Rabatt]  [Nettopreis]

   Beispiel ohne Rabatt:
   "46014  ALOX / KOROX 250 MICRONS BOITE 8KG BEGO 878-4641"
   "1  UNITE  25.16  25.16"
   → article_number: "46014", dealer_article_number: "878-4641"
   → description: "ALOX / KOROX 250 MICRONS BOITE 8KG"
   → quantity: 1, unit: "Stueck", unit_price: 25.16, total_price: 25.16

   Beispiel mit Rabatt:
   "14550  BUSE 1.2MM KOROX 250/KOROX 110 REF 13425 BEGO 880-8264"
   "1  UNITE  183.89  25.00  137.92"
   → unit_price: 183.89, total_price: 137.92

3. ZEILEN FILTERN - KEINE Produkte, MÜSSEN AUSGESCHLOSSEN werden:
   - Hinweisblock am Anfang: "MERCI DE NOUS CONFIRMER CETTE COMMANDE ET DE
     PRENDRE RDV POUR LA LIVRAISON VIA LA PLATEFORME..." → AUSSCHLIESSEN
   - Summenzeilen am Ende: "Amount Order HT: EURO ...", "VAT: FR ..." → AUSSCHLIESSEN

4. BESTELLDATEN:
   - Bestellnummer: "Order No HSF: 267839" → order_number: "267839"
   - Bestelldatum: "Order Date: 17-02-26"

5. KUNDENNUMMER:
   - Steht unter "No Client:" im Kopfbereich.
   - Im Beispiel leer — wenn befüllt, diesen Wert als customer_number verwenden.

6. BESONDERHEITEN - Artikelnummer ggf. in Beschreibung wiederholt:
   - Bei einigen Positionen erscheint die Hersteller-Artikelnummer nochmals
     mitten in der Beschreibungszeile (z.B. "STERIBIM PLUS 54923 BEGO").
   - Diese Wiederholung ignorieren — ausschließlich den Wert aus Spalte
     "SUPPLIER ITEM CODE" als article_number verwenden.
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-15 | Erstmalige Erstellung | Analyse von PO_267839 BEGO.pdf über /dealerrule |
