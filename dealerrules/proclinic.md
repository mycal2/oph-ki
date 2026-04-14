# Händler-Dokumentation: Proclinic S.A.U.

> Erstellt am: 2026-03-31
> Zuletzt aktualisiert: 2026-03-31
> Erstellt von: Claude (Dealer Rule Skill)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Proclinic S.A.U. |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | proclinic.es |
| **Sprache der Bestellungen** | ES / EN (zweisprachig) |
| **Region / Land** | Spanien |

---

## Bestellformat-Beschreibung

Proclinic sendet Bestellungen als PDF mit dem Titel "PEDIDO Nº" (Bestellnummer) und zweisprachigen Spaltenköpfen (Spanisch / Englisch). Jede Bestellposition erstreckt sich über **zwei Zeilen**: Die erste Zeile enthält die Händler-Artikelnummer in der Spalte "Artículo", die Produktbeschreibung in "Descripción" und die Menge in "Cantidad". Die zweite Zeile beginnt mit dem festen Text "SU ART." in der "Artículo"-Spalte und enthält die Hersteller-Artikelnummer in der "Descripción"-Spalte. Die Hersteller-Artikelnummern können Leerzeichen enthalten, die entfernt werden müssen (z.B. "20 00071 104 023" → "2000071104023"). Die Kundennummer steht im Kopfbereich unter "Código:".

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Nein
- [x] Promo-/Rabatt-Zeilen vorhanden: Nein
- [x] "SU ART."-Hilfszeilen: Ja — zweite Zeile jeder Position beginnt mit "SU ART." in der Artículo-Spalte. Diese Zeilen sind KEINE eigenständigen Positionen, sondern Teil der vorherigen Position.

### Artikelnummern-Zuordnung

- **Händler-Artikelnummer (dealer_article_number):** Spalte "Artículo" in Zeile 1. Format: alphanumerisch (z.B. "H101314", "CH8014", "H14054"). Leerzeichen entfernen.
- **Hersteller-Artikelnummer (article_number):** Spalte "Descripción" in Zeile 2 (der "SU ART."-Zeile). Enthält häufig Leerzeichen die entfernt werden müssen.
- **Besondere Muster:** Zeile 2 ist immer erkennbar durch "SU ART." in der Artículo-Spalte.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Artículo / Item (Zeile 1) | dealer_article_number | Leerzeichen entfernen |
| Descripción / Description (Zeile 1) | description | Produktbeschreibung |
| Cantidad / Quantity (Zeile 1) | quantity | Ganzzahl |
| F.Entrega / Delivery date (Zeile 1) | — | Lieferdatum, kein Standardfeld |
| Artículo / Item (Zeile 2) | — | Immer "SU ART.", Filterkriterium |
| Descripción / Description (Zeile 2) | article_number | Leerzeichen entfernen |

### Kundennummer

- **Position:** Kopfbereich unter "Código:"
- **Format:** Numerisch, 4-stellig
- **Beispiel:** "1436"

### Mengenbehandlung

- Menge steht in Spalte "Cantidad" / "Quantity" in Zeile 1 der jeweiligen Position
- Einheit im Dokument: Ganzzahl ohne Einheitenbezeichnung (die "5u" in der Beschreibung ist Teil des Produktnamens, nicht die Bestellmenge)

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja — 2 Zeilen pro Position
- **Muster:** Zeile 1: Artículo (Händler-Art.Nr.) + Descripción (Beschreibung) + Cantidad (Menge). Zeile 2: "SU ART." + Hersteller-Art.Nr.
- **Beispiel:**
  ```
  H101314   FRESA CARBURO PM H71.023 5u MEISINGER   1   04.09.2025
  SU ART.   20 00071 104 023
  ```

### Sonstige Besonderheiten

- Bestellnummer steht im Kopfbereich unter "PEDIDO Nº" / "Purchase order:" (z.B. "4500319076")
- Bestelldatum unter "Fecha pedido:" im Format DD.MM.YYYY (z.B. "28.07.2025")

---

## Beispiel-Dokument

- **Dateiname:** Pedido Proclinic Nº 4500319076.pdf
- **Anzahl Positionen:** 7 echte Produktzeilen
- **Auffälligkeiten:** 7 "SU ART."-Hilfszeilen, die nicht als Positionen extrahiert werden dürfen. Mehrere Hersteller-Artikelnummern mit Leerzeichen (z.B. "20 00071 104 023", "63 00731 104 005").

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN - Jede Position besteht aus ZWEI Zeilen:
   - Zeile 1: "Artículo" = Händler-Artikelnummer, "Descripción" = Beschreibung, "Cantidad" = Menge
   - Zeile 2: "Artículo" = "SU ART." (fester Text), "Descripción" = Hersteller-Artikelnummer
   Beide Zeilen gehören zur GLEICHEN Position. "SU ART."-Zeilen NICHT als eigene line_items extrahieren.

   Beispiel aus dem Dokument:
   H101314   FRESA CARBURO PM H71.023 5u MEISINGER   1
   SU ART.   20 00071 104 023
   → dealer_article_number: "H101314"
   → article_number: "2000071104023"
   → description: "FRESA CARBURO PM H71.023 5u MEISINGER"
   → quantity: 1

2. ARTIKELNUMMERN - Leerzeichen aus BEIDEN Artikelnummern entfernen:
   - Spalte "Artículo" Zeile 1 → dealer_article_number (Leerzeichen entfernen)
   - Spalte "Descripción" Zeile 2 → article_number (Leerzeichen entfernen)
     Beispiele: "20 00071 104 023" → "2000071104023"
                "63 00731 104 005" → "6300731104005"
                "20 00002 104 018" → "2000002104018"
   Nummern ohne Leerzeichen (z.B. "60KB652104000") bleiben unverändert.

3. BESTELLDATEN:
   - Bestellnummer: unter "PEDIDO Nº" / "Purchase order:" → order_number (z.B. "4500319076")
   - Bestelldatum: unter "Fecha pedido:" im Format DD.MM.YYYY → order_date (z.B. "28.07.2025")
   - Kundennummer: unter "Código:" → customer_number (z.B. "1436")
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-03-31 | Erstmalige Erstellung | Neue Händler-Anbindung Proclinic |
