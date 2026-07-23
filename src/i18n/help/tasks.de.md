# Aufgaben-Listen

Task-Listen sind Listen-Einträge mit einer Status-Box. Neben den Standard-Zuständen (offen, erledigt) gibt es erweiterte Status mit eigenem Zeichen, Glyph und Farbe sowie Task-Marker für Termine, Priorität und Wiederholung am Zeilenende.

## Standard-Status

```markdown
- [ ] offene Aufgabe
- [x] erledigte Aufgabe
```

- [ ] offene Aufgabe
- [x] erledigte Aufgabe

In bearbeitbaren Dateien schließt ein Klick auf die Checkbox die Aufgabe ab bzw. öffnet sie wieder — in der Lese-Ansicht und im Live-Modus. Im schreibgeschützten Handbuch ist der Klick ohne Wirkung.

## Erweiterte Status

Sechs vorbelegte Status; das Zeichen steht zwischen den eckigen Klammern:

```markdown
- [/] in Arbeit
- [-] abgebrochen
- [>] delegiert
- [?] Frage
- [!] wichtig
- [*] markiert
```

- [/] in Arbeit
- [-] abgebrochen
- [>] delegiert
- [?] Frage
- [!] wichtig
- [*] markiert

Jeder Status rendert als farbige Box mit Glyph. Ein Klick auf die Status-Box schaltet auf das **Folge-Symbol** des Status weiter (Standard: Abschließen mit `[x]`); so lassen sich Ketten wie „offen → in Arbeit → erledigt" konfigurieren.

## Eigene Status, Typ und Folge-Symbol

Der Bereich **Task-Status** der Einstellungs-Seite (Datei → Einstellungen…) verwaltet das Set: vorbelegte Status lassen sich deaktivieren oder umfärben, eigene Status mit frei gewähltem Zeichen, Bezeichnung und Farbe kommen dazu. Nicht erlaubt sind Leerzeichen, `x`, `X`, eckige Klammern und der Backslash; doppelt belegte Zeichen meldet eine Warnung.

Jeder Status trägt zusätzlich einen **Typ** und ein **Folge-Symbol**:

- **Typ** bestimmt die Bedeutung des Status: Offen, In Arbeit, Wartend, Erledigt, Abgebrochen oder Keine Aufgabe. Nur der Wechsel auf einen Status vom Typ **Erledigt** setzt das Erledigt-Datum und löst die Wiederholung aus; der Typ **Abgebrochen** setzt das Abgebrochen-Datum. Zeilen mit dem Typ **Keine Aufgabe** gelten nicht als Aufgaben. Die Zuordnung ist frei — auch ein Zeichen wie `*` darf den Typ Erledigt tragen.
- **Folge-Symbol** bestimmt, welches Zeichen der Klick auf die Status-Box als Nächstes setzt. Die Basis-Zustände sind fest: `[ ]` wird zu `[x]`, `[x]` wird zu `[ ]`.

## Task-Marker: Termine

Termine stehen als Symbol-Marker mit Datum `JJJJ-MM-TT` am Zeilenende und erscheinen in allen Ansichten als Badge:

```markdown
- [ ] Bericht abgeben 📅 2099-03-31
- [ ] Vorbereitung ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Längst fällig 📅 2020-01-01
```

- [ ] Bericht abgeben 📅 2099-03-31
- [ ] Vorbereitung ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Längst fällig 📅 2020-01-01

Manuell gesetzt werden **fällig** (`📅`), **geplant** (`⏳`) und **Start** (`🛫`). Automatisch entstehen **erstellt** (`➕`), **erledigt** (`✅`) und **abgebrochen** (`❌`) — siehe Automatik-Daten. Überfällige Fälligkeits-Termine sind rot hervorgehoben; kalendarisch ungültige Werte (etwa ein 30. Februar) bleiben erhalten und sind als ungültig markiert.

Hinter dem Datum ist optional eine **Uhrzeit** `HH:mm` erlaubt:

```markdown
- [ ] Zahnarzt-Termin 📅 2099-03-31 14:30
```

- [ ] Zahnarzt-Termin 📅 2099-03-31 14:30

Die Uhrzeit ist eine eigene Format-Erweiterung dieser App; andere Markdown-Programme mit demselben Marker-Format erwarten hinter dem Datum keine Uhrzeit. Zeilen ohne Uhrzeit sind vollständig austauschbar.

Vom Sach-Termin abzugrenzen ist der Melde-Marker ⏰, der zum genannten Zeitpunkt eine Erinnerung auslöst; er ist auf der Seite [Erinnerungen](reminders.md) beschrieben.

## Task-Marker: Priorität

Sechs Stufen; „normal" hat kein Symbol und liegt zwischen mittel und niedrig:

```markdown
- [ ] Höchste 🔺
- [ ] Hoch ⏫
- [ ] Mittel 🔼
- [ ] Normal (ohne Marker)
- [ ] Niedrig 🔽
- [ ] Niedrigste ⏬
```

- [ ] Höchste 🔺
- [ ] Hoch ⏫
- [ ] Mittel 🔼
- [ ] Normal (ohne Marker)
- [ ] Niedrig 🔽
- [ ] Niedrigste ⏬

## Task-Marker: Wiederholung

Eine Wiederholungs-Regel steht hinter `🔁` und erzeugt beim Abschluss der Aufgabe automatisch die nächste Instanz — mit fortgeschriebenen Terminen, offenem Status und gemäß Einstellung oberhalb (Standard) oder unterhalb der erledigten Zeile:

```markdown
- [ ] Wochenplanung 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Müll rausbringen 🔁 every 3 days when done 📅 2099-03-05
- [ ] Miete prüfen 🔁 every month on the last 📅 2099-03-31
```

- [ ] Wochenplanung 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Müll rausbringen 🔁 every 3 days when done 📅 2099-03-05
- [ ] Miete prüfen 🔁 every month on the last 📅 2099-03-31

Regel-Formen: `every day`, `every 3 days`, `every weekday`, `every week`, `every week on Sunday` (auch mehrere Wochentage), `every 2 weeks`, `every month`, `every month on the 15th`, `every month on the last`, `every 6 months`, `every year`. Der Zusatz `when done` rechnet ab dem tatsächlichen Abschluss statt ab dem Soll-Termin.

Verhalten im Detail: Rechen-Basis ist der Fälligkeits-Termin, ersatzweise geplant, ersatzweise Start — mindestens ein Termin-Feld ist Voraussetzung. Tragen mehrere Felder Termine, bleiben ihre Abstände erhalten; Uhrzeiten werden unverändert übernommen. Monats-Regeln überspringen Monate ohne den Ziel-Tag (ein 31. fällt also nie auf den 30.). Ein Enddatum oder eine Begrenzung der Vorkommen gibt es nicht; unverständliche Regeln bleiben ohne Wirkung.

## Automatik-Daten

Beim Statuswechsel schreibt die App Datums-Marker in die Zeile — jeder der drei Automatiken lässt sich im Einstellungs-Bereich **Aufgaben** einzeln abschalten:

- **Erledigt** (`✅`): beim Wechsel auf einen Status vom Typ Erledigt; der Wechsel zurück entfernt das Datum wieder.
- **Abgebrochen** (`❌`): analog beim Typ Abgebrochen.
- **Erstellt** (`➕`): beim Umwandeln einer Zeile in eine Aufgabe über das Kommando „Aufgabenliste" (standardmäßig aus).

Die Automatik schreibt nur das Datum ohne Uhrzeit.

## Global Filter

Der **Global Filter** (Einstellungs-Bereich **Aufgaben**) entscheidet, welche Checkbox-Zeilen als Aufgaben gelten: Nur Zeilen, die den Filter-Text enthalten (etwa `#task`), erhalten Badges und Automatik-Daten; bei leerem Filter zählt jede Checkbox-Zeile. Optional wird der Filter-Text in den Anzeigen ausgeblendet.

## ID und Abhängigkeiten

Eine Aufgabe kann eine **ID** (`🆔`) tragen und über **Vorgänger-Bezüge** (`⛔` mit einer oder mehreren IDs) von anderen Aufgaben abhängen — Ende-Anfang-Beziehungen:

```markdown
- [ ] Fundament gießen 🆔 abc12 📅 2099-04-01
- [ ] Wände mauern ⛔ abc12
```

- [ ] Fundament gießen 🆔 abc12 📅 2099-04-01
- [ ] Wände mauern ⛔ abc12

Eine Aufgabe gilt als **blockiert**, solange mindestens ein Vorgänger noch offen ist (Status-Typen Offen, In Arbeit oder Wartend auf beiden Seiten); erledigte oder abgebrochene Vorgänger blockieren nicht. Blockierte Treffer der Task-Abfrage tragen eine dezente `⛔`-Kennzeichnung; die Felder `blocked`, `blocking` und `id.set` filtern danach (siehe Task-Ebene der Seite [Abfrage-Listen](frontmatter-query.md)).

IDs bestehen aus Buchstaben, Ziffern, `_` und `-`. Automatisch erzeugte IDs (Dialog oder Auto-Vervollständigung) sind **im Suchraum eindeutig**; manuell doppelt vergebene IDs zeigen ein `⚠`-Badge in den Treffern und sind über das Feld `id.duplicate` auffindbar. In der Folge-Instanz einer Wiederholung sind ID- und Vorgänger-Marker entfernt, damit keine doppelten IDs entstehen.

## Bearbeitungs-Dialog

Das Kommando **Aufgabe bearbeiten…** (Standard `Strg+Alt+A`, auch im Editor-Kontextmenü unter Einfügen und als Stift-Knopf an Abfrage-Treffern) öffnet ein Formular für alle Marker: Beschreibung, Status (aus dem konfigurierten Status-Set), Priorität, Wiederholungs-Regel mit Hinweis bei unverständlicher Form, die drei manuellen Termine über den Datums-Kalender sowie ID, Vorgänger und Nachfolger mit Aufgaben-Suche über den Suchraum. Auf einer Task-Zeile bearbeitet der Dialog, auf einer leeren Zeile legt er eine neue Aufgabe an. Der Wechsel auf einen Status vom Typ Erledigt setzt das Erledigt-Datum gemäß Automatik; ein Nachfolger-Eintrag schreibt den Vorgänger-Bezug auf die Ziel-Zeile (die eigene Aufgabe erhält bei Bedarf automatisch eine ID). Jede Anwendung ist ein einzelner Rückgängig-Schritt.

## Auto-Vervollständigung

Auf Task-Zeilen schlägt die Vervollständigung hinter der Status-Box Marker vor: die drei Termine (öffnen den Datums-Kalender), Priorität, häufige Wiederholungs-Regeln, Status-Wechsel und „ID erzeugen". Die Vorschläge erscheinen ab einer einstellbaren Tipp-Länge (oder sofort mit `Strg+Leertaste`) und ersetzen beim Übernehmen das getippte Wort; Mindest-Tipplänge und Vorschlagszahl stehen im Einstellungs-Bereich **Aufgaben**.

## Task-Abfragen und Rückschreiben

Der Abfrage-Scope `LIST TASKS` (Seite [Abfrage-Listen](frontmatter-query.md), Abschnitt Task-Ebene) listet Aufgaben über den ganzen Suchraum — mit Filtern über alle Marker-Felder, Gruppierung und Layout-Steuerung. Die Treffer sind Arbeitsfläche: Die **Status-Box** schaltet den Status direkt in der Quelldatei weiter (mit Ketten-Toggle, Automatik-Daten und Wiederholung), der **Verschiebe-Knopf** verlegt den maßgeblichen Termin auf morgen, eine Woche später oder ein frei gewähltes Datum (überfällige Termine rechnen ab heute), der **Stift-Knopf** öffnet den Bearbeitungs-Dialog. Geschrieben wird auch in nicht geöffnete Dateien; offene Dokumente werden über den Editor-Zustand aktualisiert und nie überholt, und wenn sich eine Treffer-Zeile zwischenzeitlich geändert hat, erscheint ein Hinweis statt eines blinden Schreibens.

## Dringlichkeits-Score

Der Score macht Task-Listen ohne Handarbeit sortierbar (Standard-Sortierung der Task-Abfrage; als Wert einblendbar über `SHOW urgency`, filter- und sortierbar über das Feld `urgency`). Er ist die Summe aus vier Komponenten:

| Komponente | Wert |
|---|---|
| Fälligkeit | 12,0 ab sieben Tagen überfällig, gleitend fallend bis 2,4 ab vierzehn Tagen in der Zukunft (fällig heute: 8,8); 0 ohne Termin |
| Priorität | Höchste 9,0 · Hoch 6,0 · Mittel 3,9 · Normal 1,95 · Niedrig 0,0 · Niedrigste −1,8 |
| Geplant | +5,0, wenn der Geplant-Termin heute oder früher liegt |
| Start | −3,0, wenn der Start-Termin morgen oder später liegt |

Der Score rechnet auf Tages-Basis; eine Uhrzeit hinter dem Datum hat keinen Einfluss, kalendarisch ungültige Termine zählen wie fehlende.
