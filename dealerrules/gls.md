# Händler-Dokumentation: GLS Logistik GmbH & Co. Dental Handel KG

> Erstellt am: 2026-04-14
> Zuletzt aktualisiert: 2026-04-14
> Erstellt von: Claude (via /dealerrule)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | GLS Logistik GmbH & Co. Dental Handel KG |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | gls-dental.de |
| **Bekannte Absender** | j.eckert@gls-dental.de, Avis@gls-dental.de |
| **Sprache der Bestellungen** | DE |
| **Region / Land** | Deutschland (Kassel) |

---

## Bestellformat-Beschreibung

GLS sendet Bestellungen als PDF im Tabellenformat. Jede Bestellung hat einen Kopfbereich mit Empfänger (Hersteller), GLS-Kundennummer, Sachbearbeiter und Bestellnummer. Die Produkttabelle hat 6 Spalten: Pos., Ihre Artikelnr., Menge, Beschreibung, EK-Preis, Unsere Artikelnr. Zwischen dem Tabellenkopf und der ersten Produktzeile steht eine Lieferhinweis-Zeile. Bei mehrseitigen Bestellungen wird der Tabellenkopf auf jeder Seite wiederholt. Am Ende der letzten Seite stehen Firmendaten und rechtliche Hinweise.

---

## Erkannte Besonderheiten

### Zeilen-Filterung
Eine Lieferhinweis-Zeile ("Liefern Sie bitte an unseren Betriebsbereich: GLS Richard-Roosen-Str. 10 34123 KASSEL") steht im Tabellenbereich zwischen Header und erster Produktzeile.

- [x] Bestellkopf-Zeilen vorhanden: Nein (nicht als Tabellenzeile)
- [x] Bestellfuß-Zeilen vorhanden: Nein (Firmendaten stehen außerhalb der Tabelle)
- [ ] Promo-/Rabatt-Zeilen vorhanden: Nein
- [ ] Zwischensummen-Zeilen vorhanden: Nein
- [x] Lieferhinweis-Zeile im Tabellenbereich: Ja — "Liefern Sie bitte an unseren Betriebsbereich: ..."

### Artikelnummern-Zuordnung
Die Spaltenbezeichnungen sind aus GLS-Perspektive geschrieben, was für den Hersteller kontraintuitiv ist.

- **Hersteller-Artikelnummer (article_number):** Spalte "Ihre Artikelnr." (2. Spalte). Variable Formate: numerisch (z.B. "2000001204018"), alphanumerisch (z.B. "20001SQ205012", "82BS540GEL"), kurz (z.B. "7402638").
- **Händler-Artikelnummer (dealer_article_number):** Spalte "Unsere Artikelnr." (letzte Spalte). Kürzere numerische Codes, z.B. "79857", "236921", "05701".
- **Besondere Muster:** Keine mehrzeiligen Muster. Die Bezeichnungen "Ihre" / "Unsere" sind aus GLS-Sicht: "Ihre" = die des Herstellers, "Unsere" = die von GLS.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Pos. | — | Positionsnummer, nicht extrahieren |
| Ihre Artikelnr. | article_number | Hersteller-Artikelnummer |
| Menge | quantity | Ganzzahl |
| Beschreibung | description | Enthält oft Verpackungsinfos (z.B. "5St") |
| EK-Preis | unit_price | Einkaufspreis, deutsches Kommaformat |
| Unsere Artikelnr. | dealer_article_number | GLS-eigene Artikelnummer |

### Kundennummer
- **Position:** Im Kopfbereich der ersten Seite, als "GLS Kdnr.: [Nummer]"
- **Format:** Numerisch, 6-stellig
- **Beispiel:** "GLS Kdnr.: 101606" → customer_number: "101606"

### Mengenbehandlung
- **Einheit im Dokument:** In der Beschreibung enthalten (z.B. "5St", "2ST", "St")
- **Verpackungseinheiten:** Beschreibung enthält Packungsangaben (z.B. "5St" = 5 Stück pro Packung), Menge in "Menge"-Spalte ist Anzahl Packungen
- **Besonderheiten:** Keine — Menge ist immer eine einfache Ganzzahl

### Mehrzeilige Positionen
- [ ] Mehrzeilig: Nein — alle Positionen sind einzeilig

### Sonstige Besonderheiten
- Bestellnummern haben das Format "EK" + 6-stellige Nummer (z.B. "EK801000")
- Sachbearbeiter-Info im Kopfbereich (Name, Tel, E-Mail)
- Zwei spezielle E-Mail-Adressen für Auftragsbestätigungen (Avis@gls-dental.de) und Produktrückrufe (Product-Recall@gls-dental.de)
- Hinweis zur maximalen Paletten-Packhöhe von 2 Metern

---

## Beispiel-Dokument

- **Dateiname:** EK801000.pdf
- **Anzahl Positionen:** 41 echte Produktzeilen
- **Seiten:** 2
- **Auffälligkeiten:** 1 Lieferhinweis-Zeile im Tabellenbereich die gefiltert werden muss

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ARTIKELNUMMERN-ZUORDNUNG - "Ihre Artikelnr." ist die HERSTELLER-Nummer, NICHT die Händler-Nummer:
   - Spalte "Ihre Artikelnr." (2. Spalte) enthält die HERSTELLER-Artikelnummer → "article_number"
   - Spalte "Unsere Artikelnr." (letzte Spalte) enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   ACHTUNG: Trotz "Ihre" / "Unsere" Benennung gilt aus Sicht des HERSTELLERS:
   "Ihre Artikelnr." = Hersteller-Artikelnummer, "Unsere Artikelnr." = GLS-eigene Nummer.

   Beispiel aus dem Dokument:
   Pos. 1: Ihre Artikelnr. "2000001204018" | Beschreibung "HM Bohrer 1 018 Wst 5St" | Unsere Artikelnr. "79857"
   → article_number: "2000001204018"
   → dealer_article_number: "79857"
   → description: "HM Bohrer 1 018 Wst 5St"
   → quantity: 4
   → unit_price: 12.45

2. SPALTEN-MAPPING - Vollständige Spaltenstruktur:
   - Spalte "Pos." = Positionsnummer (NICHT als Feld extrahieren)
   - Spalte "Ihre Artikelnr." = "article_number" (Hersteller)
   - Spalte "Menge" = "quantity"
   - Spalte "Beschreibung" = "description"
   - Spalte "EK-Preis" = "unit_price"
   - Spalte "Unsere Artikelnr." = "dealer_article_number" (GLS-Nummer)

3. ZEILEN FILTERN - Lieferhinweis-Zeile ist KEIN Produkt:
   - Die Zeile "Liefern Sie bitte an unseren Betriebsbereich: GLS Richard-Roosen-Str. 10 34123 KASSEL" steht zwischen Tabellenkopf und erster Bestellposition
   - MUSS aus line_items AUSGESCHLOSSEN werden
   - Fußzeilen mit Firmendaten (Amtsgericht, Bankverbindung, USt-IdNr.) sind ebenfalls KEINE Produkte

4. KUNDENNUMMER - Steht im Kopfbereich als "GLS Kdnr.":
   - Format: "GLS Kdnr.: [Nummer]"
   - Nur die Nummer extrahieren, ohne Prefix
   - Beispiel: "GLS Kdnr.: 101606" → customer_number: "101606"

5. BESTELLDATEN - Bestellnummer und Datum:
   - Bestellnummer: "Bestellung Nr. EK801000" → order_number: "EK801000"
   - Bestelldatum: "Kassel, 14. April 2026" → nur das Datum extrahieren
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-04-14 | Erstmalige Erstellung | Dealer-Erkennung für GLS-Bestellungen bei Hager & Meisinger |
