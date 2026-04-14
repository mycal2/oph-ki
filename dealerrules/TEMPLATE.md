# Händler-Dokumentation: [DEALER_NAME]

> Erstellt am: [YYYY-MM-DD]
> Zuletzt aktualisiert: [YYYY-MM-DD]
> Erstellt von: [NAME]

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | [Vollständiger Händlername] |
| **Format-Typ** | [pdf_table / excel / email_text / mixed] |
| **Bekannte Domains** | [domain1.com, domain2.com] |
| **Bekannte Absender** | [email1@domain.com] |
| **Sprache der Bestellungen** | [DE / EN / FR / etc.] |
| **Region / Land** | [z.B. Frankreich, DACH, etc.] |

---

## Bestellformat-Beschreibung

[Freitext-Beschreibung des Bestellformats in 3-5 Sätzen. Wie sehen die Bestellungen typischerweise aus? Welches Dateiformat wird verwendet? Gibt es Besonderheiten im Layout?]

---

## Erkannte Besonderheiten

### Zeilen-Filterung
[Gibt es Zeilen, die wie Bestellpositionen aussehen, aber keine sind? Bestellkopf/-fuß als Tabellenzeilen, Promo-Hinweise, Zwischensummen, etc.]

- [ ] Bestellkopf-Zeilen vorhanden: [Ja/Nein — wenn ja, Art.Nr / Muster beschreiben]
- [ ] Bestellfuß-Zeilen vorhanden: [Ja/Nein — wenn ja, Art.Nr / Muster beschreiben]
- [ ] Promo-/Rabatt-Zeilen vorhanden: [Ja/Nein — wenn ja, Muster beschreiben]
- [ ] Zwischensummen-Zeilen vorhanden: [Ja/Nein — wenn ja, Muster beschreiben]

### Artikelnummern-Zuordnung
[Wie sind Hersteller- und Händler-Artikelnummern im Dokument angeordnet?]

- **Hersteller-Artikelnummer (article_number):** [Wo steht sie? Welches Format? Welcher Spaltenname?]
- **Händler-Artikelnummer (dealer_article_number):** [Wo steht sie? Welches Format? Existiert sie überhaupt?]
- **Besondere Muster:** [z.B. VREF:-Prefix, mehrzeilige Darstellung, etc.]

### Spalten-Zuordnung
[Welche Spalten enthält das Dokument und wie mappen sie auf die Standard-Felder?]

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| [Spaltenname] | [canonical_field] | [optional] |
| [Spaltenname] | [canonical_field] | [optional] |

### Kundennummer
[Wo steht die Kundennummer? Hat sie ein besonderes Format?]

- **Position:** [z.B. im Kopfbereich, in einer bestimmten Zelle, im E-Mail-Betreff]
- **Format:** [z.B. numerisch, alphanumerisch, mit Prefix]
- **Beispiel:** [z.B. "KD-12345"]

### Mengenbehandlung
[Gibt es Besonderheiten bei der Mengenangabe?]

- **Einheit im Dokument:** [z.B. "Pcs.", "Stk", "EA"]
- **Verpackungseinheiten:** [z.B. "1 Karton = 10 Stück" — relevant für Umrechnung?]
- **Besonderheiten:** [z.B. Menge steht in einer ungewöhnlichen Spalte]

### Mehrzeilige Positionen
[Erstreckt sich eine Bestellposition über mehrere Zeilen?]

- [ ] Mehrzeilig: [Ja/Nein]
- **Muster:** [z.B. "Zeile 1: Art.Nr + Beschreibung + Menge, Zeile 2: VREF:Herstellernummer"]
- **Beispiel:**
  ```
  [Exakte Zeilen aus dem Dokument einfügen]
  ```

### Sonstige Besonderheiten
[Alles andere, was für die Extraktion relevant ist]

---

## Beispiel-Dokument

[Kurze Beschreibung des Beispieldokuments, das zur Erstellung der Hints analysiert wurde]

- **Dateiname:** [z.B. "Bestellung_2024_03_15.pdf"]
- **Anzahl Positionen:** [z.B. 12 echte Produktzeilen]
- **Auffälligkeiten:** [z.B. "3 Nicht-Produkt-Zeilen die gefiltert werden müssen"]

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt ist bzw. hinterlegt werden soll:

```
[HINT_TEXT_HIER_EINFÜGEN]
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| [YYYY-MM-DD] | Erstmalige Erstellung | [Grund / Ticket] |
