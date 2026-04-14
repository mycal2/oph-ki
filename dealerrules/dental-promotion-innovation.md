# Händler-Dokumentation: DENTAL PROMOTION & INNOVATION

> Erstellt am: 2026-03-25
> Zuletzt aktualisiert: 2026-03-25
> Erstellt von: Claude (ohne Beispieldokument)

---

## Händler-Profil

| Feld | Wert |
|------|------|
| **Name** | DENTAL PROMOTION & INNOVATION |
| **Format-Typ** | pdf_table |
| **Bekannte Domains** | — |
| **Bekannte Absender** | — |
| **Sprache der Bestellungen** | FR |
| **Region / Land** | Frankreich |

---

## Bestellformat-Beschreibung

Der Händler sendet tabellarische Bestellungen, bei denen jede Produktposition über zwei Zeilen verteilt ist. Die erste Zeile enthält die Händler-Artikelnummer, Beschreibung und Menge. Die zweite Zeile enthält die Hersteller-Artikelnummer mit dem Präfix "VREF:". Zusätzlich gibt es drei Nicht-Produkt-Zeilen: eine Kopfzeile (95.001), eine Fußzeile (95.002) und eine Promo-/Textzeile ("T").

---

## Erkannte Besonderheiten

### Zeilen-Filterung

- [x] Bestellkopf-Zeilen vorhanden: Ja — Händler-Art.Nr "95.001", immer erste Position
- [x] Bestellfuß-Zeilen vorhanden: Ja — Händler-Art.Nr "95.002", immer letzte Position
- [x] Promo-/Rabatt-Zeilen vorhanden: Ja — Händler-Art.Nr "T", kein Produkt
- [ ] Zwischensummen-Zeilen vorhanden: Nein

### Artikelnummern-Zuordnung

- **Hersteller-Artikelnummer (article_number):** Steht in der Folgezeile nach dem Kürzel "VREF:". Nur der Wert nach "VREF:" wird übernommen.
- **Händler-Artikelnummer (dealer_article_number):** Steht in der Artikelspalte der ersten Zeile jeder Position.
- **Besondere Muster:** VREF:-Präfix in der zweiten Zeile, mehrzeilige Darstellung.

### Spalten-Zuordnung

| Spalte im Dokument | Ziel-Feld | Anmerkung |
|---------------------|-----------|-----------|
| Article / Art.Nr | dealer_article_number | Händler-eigene Artikelnummer |
| Beschreibung | description | Produktbeschreibung |
| Menge / Qté | quantity | Bestellmenge |
| VREF:-Zeile | article_number | Hersteller-Artikelnummer (ohne "VREF:"-Präfix) |

### Kundennummer

- **Position:** Nicht spezifiziert
- **Format:** Nicht spezifiziert
- **Beispiel:** —

### Mengenbehandlung

- **Einheit im Dokument:** Vermutlich "Pcs." (französischer Kontext)
- **Verpackungseinheiten:** Nicht bekannt
- **Besonderheiten:** Keine bekannt

### Mehrzeilige Positionen

- [x] Mehrzeilig: Ja
- **Muster:** Zeile 1: Händler-Art.Nr + Beschreibung + Menge, Zeile 2: VREF:Hersteller-Art.Nr
- **Beispiel:**
  ```
  142.1EM4122765  Vita Enamic Universal, 2M2-Ht, Em-14, 5 Pcs.  2
  VREF:EN1EM4122765
  → dealer_article_number: "142.1EM4122765"
  → article_number: "EN1EM4122765"
  → description: "Vita Enamic Universal, 2M2-Ht, Em-14, 5 Pcs."
  → quantity: 2
  ```

### Sonstige Besonderheiten

- Hint wurde OHNE Beispieldokument erstellt — sollte mit der ersten echten Bestellung verifiziert werden.

---

## Beispiel-Dokument

Kein Beispieldokument analysiert. Hint basiert auf der mündlichen Beschreibung des Benutzers.

---

## Extraktions-Hint (Copy-Paste)

Der folgende Text ist der aktuelle Extraction Hint, der im Dealer-Profil hinterlegt werden soll:

```
WICHTIG - Regeln für diesen Händler (MÜSSEN befolgt werden):

1. ZEILEN FILTERN - Folgende Zeilen sind KEINE Produkte und MÜSSEN aus line_items AUSGESCHLOSSEN werden:
   - Zeile mit Händler-Art.Nr "95.001" (Bestellkopf-Zeile, erste Position)
   - Zeile mit Händler-Art.Nr "95.002" (Bestellfuß-Zeile, letzte Position)
   - Zeile mit Händler-Art.Nr "T" (Promo- oder Hinweis-Zeile, kein Produkt)
   Nur echte Produktzeilen mit gültigen Artikelnummern in line_items aufnehmen.

2. ARTIKELNUMMERN-ZUORDNUNG:
   - Die Artikel-Spalte enthält die HÄNDLER-Artikelnummer → "dealer_article_number"
   - Die HERSTELLER-Artikelnummer steht in der FOLGEZEILE nach dem Kürzel "VREF:" → "article_number"
   - Den Präfix "VREF:" selbst NICHT in "article_number" übernehmen, nur den Wert danach.

   Beispiel-Muster:
   [Händler-Art.Nr]  [Beschreibung]  [Menge]
   VREF:[Hersteller-Art.Nr]
   → dealer_article_number: "[Händler-Art.Nr]"
   → article_number: "[Hersteller-Art.Nr ohne VREF:]"
   → description: "[Beschreibung aus Zeile 1]"
   → quantity: [Menge aus Zeile 1]

3. MEHRZEILIGE POSITIONEN:
   - Jede Bestellposition besteht aus ZWEI Zeilen:
     Zeile 1: Händler-Artikelnummer, Beschreibung, Menge (und ggf. Preis)
     Zeile 2: VREF:[Hersteller-Artikelnummer]
   - Beide Zeilen gehören zur GLEICHEN Bestellposition.
   - Die VREF:-Zeile enthält KEIN neues Produkt — sie ergänzt nur die Artikelnummer der vorherigen Zeile.
```

---

## Änderungshistorie

| Datum | Änderung | Grund |
|-------|----------|-------|
| 2026-03-25 | Erstmalige Erstellung | Test — ohne Beispieldokument erstellt, Verifizierung mit echter Bestellung ausstehend |
