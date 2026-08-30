# Perspective Datatable

Die Perspective Datatable ist eine **typisierte Datentabelle mit Rechenfunktionen**: Spalten haben feste Wertetypen, Zellen nehmen nur typ-gerechte Werte an, Aggregat-Zeilen rechnen live, berechnete Spalten werten Ausdrücke pro Zeile aus. Bearbeitet wird direkt im gerenderten Grid; alle Daten stehen als Klartext im Dokument.

Abgrenzung: Die [Perspective Table](perspective-table.md) zielt auf reichhaltige Text-Inhalte (mehrzeilige Block-Zellen, Spans, Status-Hervorhebung). Die Datatable zielt auf **strukturierte, rechenbare Daten** — kleine Bestände wie Ausgaben, Zeiterfassung oder Inventarlisten. Die Datentabelle gehört zu den [internen Erweiterungen](extensions.md) und lässt sich dort deaktivieren; deaktiviert bleibt der Block ein regulärer Code-Block.

## Aufbau des Blocks

Ein Code-Block mit dem Sprach-Tag `perspective-datatable` enthält Kopf-Direktiven und Datenzeilen:

````markdown
```perspective-datatable
columns: Name:text, Datum:date, Betrag:number(2), Erledigt:boolean
aggregate: Betrag:sum+avg, Erledigt:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```
````

Gerendert erscheint das Grid mit Kopfzeile, Typ-Symbolen und Aggregat-Zeile:

```perspective-datatable
columns: Name:text, Datum:date, Betrag:number(2), Erledigt:boolean
aggregate: Betrag:sum+avg, Erledigt:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```

- **`columns:`** (Pflicht) deklariert die Spalten als `Name:typ`, kommagetrennt. Spaltennamen dürfen Leerzeichen enthalten.
- **`aggregate:`** (optional) ordnet Spalten Aggregat-Funktionen zu, mehrere je Spalte mit `+` kombiniert.
- **`types:`** (optional) schaltet die Typangabe unter den Überschriften: `shown` oder `hidden`. Ohne die Zeile erscheint sie.
- **Datenzeilen** stehen in Pipe-Notation (`| … | … |`), eine Zeile pro Datensatz. Ein `|` im Text wird als `\|` geschrieben.


### Eigene Überschrift je Spalte

Die Spalten-Kennung ist zugleich die Überschrift. Sie muss kurz und ohne Trennzeichen bleiben, weil Aggregate und berechnete Spalten sie als Namen ansprechen. Wer eine sprechende Überschrift will, schreibt sie in doppelten Anführungszeichen hinter die Kennung:

```
columns: Betrag:number(2), Gesamt "Gesamt (brutto, in €)":number(2) = Betrag * 2
```

Der Anzeigetext darf beliebige Zeichen tragen, auch Leerzeichen, Komma, Doppelpunkt und Gleichheitszeichen; ein Anführungszeichen darin wird verdoppelt geschrieben. Angesprochen wird die Spalte weiterhin nur über ihre Kennung, und sie bleibt am Spaltenkopf als Merkzettel erreichbar.

## Spalten-Typen und Formate

| Typ | Speicherform | Beispiel |
|---|---|---|
| `text` | freier Text | `Anna` |
| `number` | Punkt-Dezimal | `12.5`, `-3` |
| `date` | `JJJJ-MM-TT` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (wahr) oder leer (falsch) | `x` |

`number` kennt ein optionales Anzeige-Format: `Betrag:number(2)` zeigt zwei Dezimalstellen. Anzeige und Speicherform bleiben bewusst identisch lesbar (keine Locale-Umformatung); leere Zellen sind bei allen Typen gültig. Ein Wert, der nicht zum Spalten-Typ passt, wird als **Fehler-Zelle** markiert — der Text bleibt erhalten, ein Tooltip erklärt das erwartete Format, und der Wert fließt nicht in Aggregate ein.

## Aggregate

Verfügbare Funktionen je Spalten-Typ:

| Funktion | Bedeutung | Erlaubt auf |
|---|---|---|
| `sum` | Summe | `number` |
| `avg` | Durchschnitt (gerundet auf das Spalten-Format) | `number` |
| `min` / `max` | kleinster/größter Wert | `number`, `date`, `time` |
| `count` | Anzahl nicht-leerer Zellen (bei `boolean`: Anzahl der wahren) | alle Typen |

Leere und fehlerhafte Zellen fließen nicht ein. Die Aggregat-Zeile erscheint unter den Daten und rechnet bei jeder Änderung neu; bei gefilterter Ansicht rechnet sie über die sichtbaren Zeilen.

## Berechnete Spalten

Eine Spalte mit `= ausdruck` hinter dem Typ berechnet ihren Wert pro Zeile aus anderen Spalten:

```perspective-datatable
columns: Artikel:text, Preis:number(2), Menge:number, Gesamt:number(2) = Preis * Menge
aggregate: Gesamt:sum
| Stift | 1.20 | 10 |
| Block | 3.50 | 4 |
```

- Die Ausdrucks-Sprache ist dieselbe wie in der [Perspective-Abfrage](frontmatter-query.md): Arithmetik, Vergleiche, `choice(…)`, `default(…)`, Text-Funktionen und mehr.
- Spaltennamen im Ausdruck verweisen auf die Werte der jeweiligen Zeile; auch andere berechnete Spalten sind in beliebiger Deklarations-Reihenfolge nutzbar (die Auswertung löst die Abhängigkeiten auf). Kreis-Bezüge werden als Struktur-Fehler gemeldet.
- Das Ergebnis muss zum deklarierten Spalten-Typ passen, sonst zeigt die Zelle einen Fehler.
- Berechnete Werte stehen **nie im Quelltext** — sie werden immer frisch gerechnet und haben deshalb keine Datenzelle in den Pipe-Zeilen. Aggregate über berechnete Spalten rechnen auf den berechneten Werten.

## Bearbeiten im Grid

In der **geteilten Ansicht** und im **Live-Modus** ist das Grid direkt bearbeitbar; die Lese-Ansicht und Handbuch-Seiten zeigen es schreibgeschützt. Jede Übernahme schreibt in den Code-Block im Quelltext zurück — das Dokument wird regulär ungespeichert, Rückgängig/Wiederherstellen funktionieren wie gewohnt.

- **Zelle bearbeiten**: Klick auf die Zelle (oder `Enter`/`F2` bei Zell-Fokus) öffnet ein typ-gerechtes Eingabefeld. `Enter` oder Fokus-Verlust übernimmt, `Esc` verwirft, `Tab`/`Umschalt+Tab` übernimmt und springt zur nächsten bzw. vorherigen Zelle.
- **Typ-Zwang**: Ein Wert, der nicht zum Spalten-Typ passt, wird abgewiesen (Hinweis in der Statusbar); die Zelle bleibt zur Korrektur geöffnet.
- **Boolean**: Klick auf die Zelle (oder Leertaste) schaltet den Wert direkt um.
- **Zeilen**: Der Knopf unter der Tabelle fügt eine Zeile am Daten-Ende an; das ×-Symbol am Zeilenanfang löscht die Zeile.
- Zellen berechneter Spalten sind nicht bearbeitbar; Eingaben in ihren Eingangs-Spalten aktualisieren sie sofort.
- Eine Tabelle mit Struktur-Fehlern (siehe unten) ist im Grid nicht bearbeitbar, bis der Fehler im Quelltext behoben ist.

## Sortieren und Filtern (Ansicht)

Sortieren und Filtern wirken **nur auf die Ansicht** — der Quelltext bleibt unverändert, nichts wird gespeichert oder exportiert; nach dem erneuten Öffnen der Datei ist die Ansicht neutral.

- **Sortieren**: Klick auf den Spaltenkopf sortiert typ-gerecht aufsteigend, der zweite Klick absteigend, der dritte hebt die Sortierung auf. Fehlende Werte sortieren ans Ende.
- **Filtern**: Der Umschalter am rechten Tabellen-Rand blendet die Filter-Zeile ein: Text-Spalten filtern per Enthaltensuche, Boolean-Spalten per Dreifach-Umschalter (alle/ja/nein). Ein Zusatz zeigt „n von m Zeilen"; die Aggregat-Zeile rechnet über die sichtbaren Zeilen.
- Bearbeiten bleibt in sortierter und gefilterter Ansicht möglich und trifft immer die richtige Quelltext-Zeile.

## Fehler

- **Struktur-Fehler** (unbekannter Typ, doppelte Spaltennamen, abweichende Zellen-Anzahl, ungültige Ausdrücke) erscheinen als Liste über dem Grid mit Zeilennummer im Block.
- **Zell-Fehler** (Wert passt nicht zum Typ) markieren nur die betroffene Zelle; der Text bleibt erhalten.

## Export

Der Portable-Export und der PDF-Export geben die Tabelle als statische Tabelle in Dokument-Reihenfolge aus — mit allen Zeilen, den gerechneten Werten der berechneten Spalten und der Aggregat-Zeile, ohne Interaktivität.

## Grenzen

Ab 1000 Datenzeilen zeigt das Grid nur Kopfbereich und Aggregate mit einem Hinweis; die Aggregate rechnen weiterhin über alle Zeilen. Sehr große Bestände gehören in ein dediziertes Daten-Werkzeug.
