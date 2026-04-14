# Händler-Dokumentation (Dealer Hints)

Dieses Verzeichnis enthält die Dokumentation aller Händler-spezifischen Extraktionsregeln.

## Zweck

Jede Markdown-Datei dokumentiert die Besonderheiten eines Händlers für die KI-basierte Bestelldatenextraktion. Die Dokumentation dient als Referenz für das Team und enthält den aktuellen Extraction Hint, der im Händler-Profil hinterlegt ist.

## Dateistruktur

- `TEMPLATE.md` — Vorlage für neue Händler-Dokumentationen
- `[dealer-name].md` — Dokumentation pro Händler (z.B. `dental-promotion-innovation.md`)

## Neue Dokumentation erstellen

Verwende den `/dealerrule` Skill in Claude Code:

```bash
# In Claude Code:
/dealerrule [Händlername] - [Beschreibung der Besonderheiten]
```

Der Skill analysiert optional ein Beispiel-Bestelldokument und erstellt sowohl den Extraction Hint (für das Dealer-Profil) als auch die Dokumentation in diesem Ordner.

## Namenskonvention

Dateien werden nach dem Händlernamen benannt, in Kleinbuchstaben mit Bindestrichen:
- `henry-schein.md`
- `dental-promotion-innovation.md`
- `zahn-discount24.md`
