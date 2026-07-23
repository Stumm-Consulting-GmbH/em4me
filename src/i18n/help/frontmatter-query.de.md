# Perspective-Abfrage

Die Perspective-Abfrage bettet eine **dynamische, klickbare Datei-Liste oder -Tabelle** direkt ins Dokument ein. Ein Code-Block mit dem Sprach-Tag `perspective-query` enthält eine Abfrage über Frontmatter-Eigenschaften und Datei-Felder; gerendert erscheint an dieser Stelle das Ergebnis über alle Dateien des Suchraums. Jeder Treffer ist anklickbar und öffnet die Zieldatei. Das Ergebnis hält sich mit dem Datei-Bestand aktuell.

So werden aus Eigenschaften navigierbare Übersichten: eine Themen-Startseite, die alle zugehörigen Dateien auflistet, bleibt ohne Handarbeit auf dem aktuellen Stand.

## Aufbau einer Abfrage

Die einfachste Form ist eine nackte Bedingung; sie liefert die alphabetische Treffer-Liste:

````markdown
```perspective-query
bereich = "Privat"
```
````

Die volle Form besteht aus **Klauseln**: zuerst optional der Ausgabe-Typ (`LIST` oder `TABLE`), danach in beliebiger Reihenfolge je höchstens einmal `FROM` (Quellen), `WHERE` (Bedingung), `SORT` (Sortierung), `LIMIT` (Begrenzung) und `COLUMNS` (Spalten-Layout der Liste). Zeilenumbrüche zählen wie Leerzeichen; Schlüsselwörter sind unabhängig von der Groß-/Kleinschreibung.

````markdown
```perspective-query
TABLE status AS "Status", file.mtime
FROM "Projekte" AND #aktiv
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```
````

Eine nackte Bedingung ohne Klausel-Schlüsselwort wird wie `LIST WHERE bedingung` gelesen; bestehende Abfragen funktionieren unverändert. Feldnamen, die wie Klausel-Schlüsselwörter heißen (etwa `limit`), bleiben in dieser Kurzform nutzbar.

## Ausgabe-Typen

- **`LIST`** — klickbare Datei-Liste (Standard). Ein optionaler Ausdruck dahinter (`LIST status WHERE …`) erscheint als gedämpfter Zusatz hinter jedem Treffer.
- **`TABLE spalte [AS "Titel"], …`** — Tabelle mit frei definierbaren Spalten aus Feldern oder Ausdrücken. Ohne Alias dient der Ausdruck selbst als Spalten-Titel. Die erste Spalte ist der klickbare Datei-Link; `TABLE WITHOUT ID …` blendet sie aus. Listen-Werte erscheinen kommagetrennt, Datums-Werte im ISO-Format, Link-Werte bleiben klickbar.

## Block-Ebene (`BLOCKS`)

Der Scope-Zusatz `BLOCKS` direkt hinter `LIST` bzw. `TABLE` wertet die Abfrage über **Block-Eigenschaften** aus — die Eigenschaften pro Block-Anker von der Seite [Block-Eigenschaften](block-properties.md). Treffer sind dann Blöcke statt Dateien: Jeder Treffer erscheint als klickbares Ziel der Form `Datei#^anker`; der Klick öffnet die Datei und springt zum Block.

````markdown
```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```
````

- **Feld-Auflösung**: Nackte Feldnamen treffen zuerst die Block-Eigenschaften und fallen sonst auf die Frontmatter-Eigenschaften der Träger-Datei zurück — ein Block «erbt» seinen Datei-Kontext. `file.*`-Felder und `FROM`-Quellen beziehen sich unverändert auf die Träger-Datei.
- **`updated`**: Zeitpunkt der letzten Änderung der Block-Eigenschaften, als Datums-Wert für Vergleiche und Sortierung (sofern der Block keine eigene Eigenschaft `updated` trägt).
- **Tabellen**: `TABLE BLOCKS spalte, …` zeigt in der ersten Spalte das klickbare Block-Ziel; `WITHOUT ID` steht nach `BLOCKS`. Weitere Spalten kommen typisch aus Block-Eigenschaften.
- **Treffer-Menge**: Es zählen nur Blöcke, deren Anker im Dokument steht; verwaiste Einträge (Eigenschaften ohne Anker im Text) sind kein Treffer. Dokumente ohne Block-Eigenschaften liefern schlicht keine Treffer.

````markdown
```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Projekte"
WHERE prio > 2
```
````

## Task-Ebene (`TASKS`)

Der Scope-Zusatz `TASKS` direkt hinter `LIST` bzw. `TABLE` wertet die Abfrage über die **Aufgaben** des Suchraums aus (Checkbox-Zeilen gemäß der Seite [Aufgaben-Listen](tasks.md); der Global Filter der Erweiterung gilt auch hier). Treffer sind einzelne Task-Zeilen mit Status-Box, Beschreibung, Marker-Badges und Datei-Herkunft; der Klick auf die Beschreibung öffnet die Quelldatei an der Zeile. Die Status-Box, der Verschiebe-Knopf und der Bearbeiten-Knopf schreiben direkt in die Quelldatei zurück — Details auf der Aufgaben-Seite.

````markdown
```perspective-query
LIST TASKS
FROM "Projekte"
WHERE status.type = "TODO" AND due <= date(eow)
```
````

Nackte Feldnamen treffen zuerst die festen Task-Felder und fallen sonst auf die Frontmatter-Eigenschaften der Träger-Datei zurück; `file.*`-Felder und `FROM`-Quellen beziehen sich unverändert auf die Träger-Datei.

| Feld | Inhalt |
|---|---|
| `due`, `scheduled`, `start` | manuelle Termine als Datums-Werte (fehlend oder ungültig: leer) |
| `created`, `done`, `cancelled` | Automatik-Daten als Datums-Werte |
| `due.set`, `due.invalid`, … | je Termin-Feld: Marker vorhanden bzw. kalendarisch ungültig (`"true"`/`"false"`) |
| `happens` | frühester Wert aus fällig, geplant und Start |
| `priority`, `priority.rank` | Prioritäts-Stufe als Name bzw. als Rang-Zahl (0 = höchste) |
| `status`, `status.type` | Status-Zeichen bzw. Status-Typ (`TODO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `NON_TASK`) |
| `description`, `heading`, `tags` | Beschreibungs-Text, Überschrift der umgebenden Sektion, Schlagwörter der Zeile |
| `recurrence` | Wiederholungs-Regel als Text |
| `id`, `dependson`, `id.set`, `id.duplicate` | Aufgaben-ID, Vorgänger-Liste, „hat ID", „ID mehrfach vergeben" |
| `blocked`, `blocking` | blockiert durch offene Vorgänger bzw. blockiert andere (`WHERE blocked = "true"`) |
| `urgency` | Dringlichkeits-Score (Formel auf der Aufgaben-Seite) |
| `line` | Zeilennummer in der Quelldatei |

Boolesche Task-Felder filtern über den String-Vergleich (`blocked = "true"`), wie boolesche Frontmatter-Werte.

**Datums-Komfort:** Die `date(...)`-Literale kennen zusätzlich zu `today`, `now` und festen Daten die relativen Wörter `tomorrow`, `yesterday` sowie die Perioden-Grenzen `sow`/`eow` (Wochen-Start Montag bzw. Wochen-Ende), `som`/`eom` (Monat) und `soy`/`eoy` (Jahr). Start-Wörter stehen für 00:00 des Tages, End-Wörter für das Tages-Ende — `due <= date(eow)` schließt den Sonntag vollständig ein.

**Sortierung:** Ohne `SORT` ordnet die Task-Liste nach Status-Typ (Laufendes zuerst, Erledigtes und Verworfenes ans Ende), dann Dringlichkeit absteigend, Fälligkeit, Priorität und Pfad. `SORT` (etwa `SORT urgency DESC` oder `SORT due`) übersteuert diese Vorgabe.

**Gruppierung (`GROUP BY`):** `GROUP BY ausdruck, …` gliedert die Task-Ausgabe unter Gruppen-Überschriften; jeder weitere Ausdruck erzeugt eine Verschachtelungs-Ebene. Treffer ohne Wert bilden die letzte Gruppe. Die Klausel gilt in dieser Form nur für `LIST TASKS`.

````markdown
```perspective-query
LIST TASKS GROUP BY heading, priority
```
````

**Layout (`HIDE`/`SHOW`/`SHORT`):** `HIDE element, …` blendet Ausgabe-Bausteine aus, `SHOW` blendet standardmäßig verborgene ein, `SHORT` zeigt Marker-Badges nur als Symbol (voller Wert am Tooltip). Elemente: die sechs Termin-Arten, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink` (Datei-Herkunft), `count` (Treffer-Zähler), `urgency` (Score-Badge, nur über `SHOW`), `edit` und `postpone` (die beiden Aktions-Knöpfe).

````markdown
```perspective-query
LIST TASKS SHOW urgency HIDE backlink, created SHORT
```
````

**Globale Abfrage:** Der Einstellungs-Bereich **Aufgaben** kann `FROM`-/`WHERE`-Anteile hinterlegen, die jeder `TASKS`-Abfrage implizit vorangestellt werden (etwa ein Ordner- oder Status-Filter für den ganzen Bereich). Eine fehlerhafte globale Abfrage meldet sich am Fence mit eigenem Hinweis.

## Quellen (`FROM`)

`FROM` grenzt den Treffer-Raum ein, bevor die Bedingung geprüft wird:

| Quelle | Bedeutung |
|---|---|
| `"Ordner/Unterordner"` | Dateien in diesem Ordner (relativ zur Abfrage-Wurzel), einschließlich Unterordnern |
| `#tag` | Dateien mit diesem Schlagwort; trifft auch Unter-Schlagwörter wie `#tag/unter` |
| `[[Datei]]` | Dateien, die auf `Datei` verlinken |
| `outgoing([[Datei]])` | Dateien, auf die `Datei` verlinkt |

Quellen sind mit `AND`, `OR`, Klammern und dem Negations-Präfix `-` kombinierbar:

````markdown
```perspective-query
FROM ("Projekte" OR #wichtig) AND -#archiv
```
````

## Bedingungen (`WHERE`)

| Kategorie | Syntax | Bedeutung |
|---|---|---|
| Vergleich | `feld = "wert"`, `feld != "wert"` | gleich, ungleich (ohne Beachtung der Schreibung) |
| Ordnung | `feld < wert`, `<=`, `>`, `>=` | typ-gerecht: Zahl numerisch, Datum chronologisch, Text alphabetisch |
| Menge | `feld IN ("a", "b")`, `feld NOT IN (…)` | entspricht einem bzw. keinem der Werte |
| Logik | `AND`, `OR`, `NOT` | Und, Oder, Nicht (Präzedenz: `NOT` vor `AND` vor `OR`) |
| Gruppierung | `( … )` | Klammern fassen Teilausdrücke zusammen |
| Funktion | `contains(tags, "rot")` | Funktions-Aufrufe sind als Bedingung erlaubt |

Werte-Semantik: Ein skalares Feld wird direkt verglichen; bei einem **Listen-Feld** (z.B. `tags`) prüft `=` die Mitgliedschaft und `IN` eine nicht-leere Schnittmenge. Bei **fehlendem Feld** sind `=` und `IN` falsch, `!=` und `NOT IN` wahr. Nur Felder der obersten Frontmatter-Ebene sind abfragbar; Zahlen-Werte werden bei Ordnungs-Vergleichen numerisch verglichen (`10` liegt über `5`).

## Felder

Neben den Frontmatter-Eigenschaften (nackter Name, z.B. `status`) stehen implizite Datei-Felder unter dem Namensraum `file.` bereit:

| Feld | Inhalt |
|---|---|
| `file.name` | logischer Dateiname (ohne Endung) |
| `file.folder`, `file.path` | Ordner bzw. Pfad, relativ zur Abfrage-Wurzel |
| `file.ext` | Datei-Endung |
| `file.size` | Größe in Bytes |
| `file.ctime`, `file.mtime` | Anlage- bzw. Änderungs-Zeitpunkt |
| `file.tags`, `file.aliases` | Schlagwörter und Aliasse als Listen |
| `file.inlinks`, `file.outlinks` | Dateien, die hierher verlinken bzw. verlinkte Dateien |
| `file.link` | die Datei selbst als klickbarer Link (für Tabellen-Spalten) |

## Literale und Rechnen

- **Zahlen** stehen ohne Anführungszeichen (`prio > 2`), **Zeichenketten** in doppelten oder einfachen Anführungszeichen.
- **Datum**: `date(today)` (Tagesbeginn), `date(now)` (Jetzt), `date(2026-12-31)` oder mit Uhrzeit `date(2026-12-31 14:30)`.
- **Dauer**: `dur(7 days)`, `dur(1 day 2 hours)`, kurz `dur(2w)`. Einheiten: `s`, `min`, `h`, `d`, `w`, `mo`, `y` samt Langformen; ein Monat zählt als 30, ein Jahr als 365 Tage.
- **Arithmetik**: `+`, `-`, `*`, `/` mit Punkt-vor-Strich; Datum ± Dauer ergibt ein Datum, Datum − Datum eine Dauer. Zwischen Feldnamen brauchen die Rechenzeichen Leerzeichen (`a - 1`, nicht `a-1` — Letzteres ist ein Feldname).

Typisches Muster — «in den letzten 7 Tagen geändert»:

````markdown
```perspective-query
WHERE file.mtime >= date(today) - dur(7 days)
```
````

## Funktionen

| Funktion | Beispiel | Bedeutung |
|---|---|---|
| `contains(x, w)` | `contains(titel, "Plan")` | Teiltext in Zeichenkette bzw. Element in Liste (schreibungs-genau) |
| `icontains(x, w)` | `icontains(titel, "plan")` | wie `contains`, ohne Beachtung der Schreibung |
| `length(x)` | `length(tags) > 2` | Länge einer Zeichenkette oder Liste |
| `lower(s)`, `upper(s)` | `lower(status) = "offen"` | Klein- bzw. Großschreibung |
| `startswith(s, p)`, `endswith(s, p)` | `startswith(file.name, "Projekt")` | Anfang bzw. Ende einer Zeichenkette |
| `default(x, d)` | `default(prio, 0) > 2` | Ersatzwert, wenn das Feld fehlt |
| `choice(b, a, c)` | `choice(prio > 5, "hoch", "normal")` | Wenn-dann-sonst |
| `number(x)`, `string(x)` | `number(wert) * 2` | Umwandlung in Zahl bzw. Text |
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | Datum formatieren (Token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q`) |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(werte) = 6` | Aggregate über Zahlen-Listen |

Eine unbekannte Funktion oder eine falsche Argument-Anzahl zeigt einen Fehlerhinweis am Block.

## Sortierung und Limit

`SORT feld [ASC|DESC], feld2 …` sortiert das Ergebnis mehrstufig und typ-gerecht (Zahl numerisch, Datum chronologisch, Text alphabetisch nach Sprachregeln); fehlende Werte stehen unabhängig von der Richtung am Ende. Ohne `SORT` bleibt die alphabetische Ordnung. `LIMIT n` begrenzt das Ergebnis nach der Sortierung.

## Mehrspaltige Listen

`COLUMNS n` (1 bis 8) lässt die Ergebnis-Liste über mehrere Spalten fließen — reine Darstellung, keine Daten-Änderung. Bei `TABLE` wird `COLUMNS` ignoriert und als Hinweis am Block gemeldet.

````markdown
```perspective-query
LIST FROM #lesezeichen COLUMNS 3
```
````

## Anzeige und Interaktion

- **Klickbare Treffer**: Jeder Treffer erscheint mit seinem logischen Dateinamen; der volle Pfad steht im Tooltip. Ein Klick öffnet die Zieldatei in einem Tab, genau wie ein Wiki-Link — auch in Tabellen-Zellen mit Link-Werten.
- **Live-Aktualisierung**: Neue, geänderte und gelöschte Dateien schlagen ohne manuelles Neuladen auf sichtbare Ergebnisse durch, sobald der Index sie erfasst hat.
- **Leeres Ergebnis**: Trifft die Abfrage keine Datei, erscheint ein kurzer Hinweis statt einer leeren Fläche.
- **Ungültige Abfrage**: Ein Syntaxfehler zeigt einen Fehlerhinweis mit der Position statt eines Ergebnisses.

Die drei Ansichten Gerendert, Geteilt und Live zeigen dasselbe Ergebnis. In der reinen Quelltext-Ansicht bleibt der Block als Code sichtbar.

## Suchraum

Der Suchraum ist derselbe wie beim Datei-Index:

- **Mit aktivem Bereich** umfasst er den gesamten Bereich; Link-Bezüge (`FROM [[…]]`, `file.inlinks`) sind dort vollständig.
- **Ohne Bereich** umfasst er den Ordner der Datei plus zwei Unterebenen.

Dateien außerhalb des Suchraums erscheinen nicht im Ergebnis. Eine noch nicht gespeicherte Datei hat keinen Suchraum; die Abfrage zeigt dann einen Hinweis, dass sie erst nach dem Speichern verfügbar ist.

## Export

- **PDF-Export**: Das Ergebnis wird als statischer Stand des Render-Zeitpunkts gedruckt, einschließlich Tabellen- und Spalten-Layout. Die Einträge erscheinen als Text; anklickbar sind sie im PDF nicht.
- **Portables Markdown**: Der Export lässt den `perspective-query`-Block unverändert als Quelltext stehen. Beim erneuten Öffnen in diesem Programm wird er wieder dynamisch ausgewertet; andere Markdown-Programme zeigen ihn als Code-Block.

Für freie Auswertungen jenseits der Klausel-Sprache — etwa rekursive Strukturen oder berechnete Übersichten — stehen die [Skript-Blöcke](scripts.md) bereit; ihre pq-API nutzt dasselbe Feld- und Block-Modell wie die Abfrage.
