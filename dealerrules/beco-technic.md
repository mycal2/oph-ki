# Händler-Dokumentation: Beco Technic GmbH

> Erstellt am: 2026-04-21
> Zuletzt aktualisiert: 2026-04-21
> Erstellt von: Claude (Dealer Rule Generator)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | Beco Technic GmbH |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | beco-technic.com |
| **Bekannte Absender** | y.liedtke@beco-technic.com |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Geesthacht) |

---

## Bestellformat-Beschreibung

Beco Technic sendet PDF-Bestellungen mit einer klar strukturierten Tabelle. Spalten: Pos, Artikel, Menge, Einzelpreis EUR, %, Gesamtpreis EUR. Die "Pos"-Spalte bleibt leer. Jede Bestellposition erstreckt sich über 4 Zeilen in der Spalte "Artikel": Händler-Artikelnummer (fett), "Ihre Referenz: [Herstellernummer]", Beschreibung, Liefertermin. Die zweite Seite enthält nur Versand- und Zahlungsinformationen sowie eine Grußformel — keine weiteren Produkte.

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Nein
- [x] Bestellfuß-Zeilen vorhanden: Ja — Versandart, Zahlung, Freitext-Anweisungen, Grußformel auf Seite 2
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [ ] Zwischensummen-Zeilen vorhanden: Nein

Zusätzlich: Jede Position endet mit "Liefertermin: Sobald als möglich." — diese Zeile muss ignoriert werden.

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht in Zeile 2 jeder Position nach "Ihre Referenz:". Formate variieren: rein numerisch (z.B. "1000001104040"), alphanumerisch (z.B. "35452RF104080").
- **Händler-Artikelnummer (dealer_article_number):** Fett gedruckte Nummer in Zeile 1 jeder Position (z.B. "212966", "2128792"). Immer rein numerisch.
- **Besondere Muster:** Mehrzeilige Darstellung — Händler-Artikelnummer und Hersteller-Artikelnummer stehen auf verschiedenen Zeilen, verbunden durch "Ihre Referenz:".

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Artikel (Zeile 1, fett) | dealer_article_number | Händler-eigene Nummer |
| Artikel (Zeile 2, "Ihre Referenz:") | article_number | Hersteller-Artikelnummer |
| Artikel (Zeile 3) | description | Produktbeschreibung |
| Menge | quantity + unit | z.B. "5 Stück" |
| Einzelpreis EUR | unit_price | Dezimalformat mit Komma |
| Gesamtpreis EUR | total_price | Dezimalformat mit Komma |

### Kundennummer

- **Position:** Im Bestellkopf, rechte Spalte, nach dem Label "Kundennummer"
- **Format:** Rein numerisch, 6 Stellen
- **Beispiel:** "100702"
- **Achtung:** "Lieferant 792160" ist NICHT die Kundennummer — das ist Meisinger's Lieferanten-ID bei Beco Technic.

### Mengenbehandlung

- **Einheit im Dokument:** "Stück"
- **Verpackungseinheiten:** Keine besonderen Verpackungseinheiten — direkte Stückmengen
- **Besonderheiten:** Keine

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** 4 Zeilen pro Position (Händler-Art.Nr, Ihre Referenz, Beschreibung, Liefertermin)
- **Beispiel:**
  ```
  212966                                          5 Stück  1,770  8,85
  Ihre Referenz: 1000001104040
  Kugelfräser Type 1 ohne Loch Kopf Ø 4,0 mm
  Liefertermin: Sobald als möglich.
  ```

### Sonstige Besonderheiten

- Seite 2 enthält ausschließlich Fußzeilen-Inhalte: Versandart, Zahlungsbedingungen, Lieferanweisungen ("Keine Restmengen nachliefern..."), Grußformel. Keine Produkte.
- Betreuer-Kontaktdaten im Kopf (Yannick Liedtke, +49 4152 809629) — nicht extraktionsrelevant.

---

## Beispiel-Dokument

- **Dateiname:** BESTELLUNG_90802333.pdf
- **Anzahl Positionen:** 6 echte Produktzeilen
- **Auffälligkeiten:** Seite 2 nur Footer. "Liefertermin:"-Zeilen nach jeder Position müssen gefiltert werden.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. MEHRZEILIGE POSITIONEN:
   Jede Bestellposition besteht aus 4 Zeilen in der Spalte "Artikel":
   Zeile 1: Händler-Artikelnummer (fett gedruckt)
   Zeile 2: "Ihre Referenz: [Hersteller-Artikelnummer]"
   Zeile 3: Produktbeschreibung
   Zeile 4: "Liefertermin: Sobald als möglich." → IGNORIEREN
   Alle 4 Zeilen gehören zur GLEICHEN Position.

   Beispiel aus dem Dokument:
   212966                                          5 Stück  1,770  8,85
   Ihre Referenz: 1000001104040
   Kugelfräser Type 1 ohne Loch Kopf Ø 4,0 mm
   Liefertermin: Sobald als möglich.
   → dealer_article_number: "212966"
   → article_number: "1000001104040"
   → description: "Kugelfräser Type 1 ohne Loch Kopf Ø 4,0 mm"
   → quantity: 5
   → unit: "Stueck"
   → unit_price: 1.77
   → total_price: 8.85

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Die fett gedruckte Nummer in Zeile 1 = HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die Nummer nach "Ihre Referenz:" in Zeile 2 = HERSTELLER-Artikelnummer → "article_number"
   Weiteres Beispiel: dealer_article_number "213105" → article_number "35452RF104080"

3. ZEILEN FILTERN - Folgende Inhalte sind KEINE Produkte:
   - Zeilen die mit "Liefertermin:" beginnen → AUSSCHLIESSEN
   - Zeilen mit "Versandart", "Zahlung", "Keine Restmengen nachliefern",
     "Bitte drucken Sie", "Mit freundlichen Grüßen" → AUSSCHLIESSEN

4. KUNDENNUMMER:
   - Die Kundennummer steht im Bestellkopf nach dem Label "Kundennummer"
   - Beispiel: "100702"
   - NICHT "Lieferant 792160" verwenden — das ist unsere eigene Lieferantennummer

5. BESTELLDATEN:
   - Bestellnummer steht nach "Nr" im Kopfbereich (z.B. "90802333")
   - Bestelldatum steht nach "vom" im Kopfbereich (z.B. "15.04.2026")
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-21 | Erstmalige Erstellung | Neue Bestellung von Beco Technic analysiert (BESTELLUNG_90802333.pdf) |
