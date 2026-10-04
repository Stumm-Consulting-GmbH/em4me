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

Die volle Form besteht aus **Klauseln**: zuerst optional der Ausgabe-Typ (`LIST` oder `TABLE`), danach in beliebiger Reihenfolge je höchstens einmal `FROM` (Quellen), `WHERE` (Bedingung), `GROUP BY` (Gruppierung), `HAVING` (Bedingung über die Gruppe), `SORT` (Sortierung), `LIMIT` (Begrenzung), `COLUMNS` (Spalten-Layout der Liste) und `DISPLAY` (Darstellungsform). Zeilenumbrüche zählen wie Leerzeichen; Schlüsselwörter sind unabhängig von der Groß-/Kleinschreibung.

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

**Gruppierung (`GROUP BY`):** `GROUP BY ausdruck, …` gliedert die Task-Ausgabe unter Gruppen-Überschriften; jeder weitere Ausdruck erzeugt eine Verschachtelungs-Ebene, und Treffer ohne Wert bilden die letzte Gruppe. Gruppierung, Aggregate und die Bedingung über die Gruppe gelten auf allen Ebenen; sie beschreibt der Abschnitt «Gruppierung und Aggregation».

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

## Datensatz-Ebene (`RECORDS`)

Der Scope-Zusatz `RECORDS` direkt hinter `LIST` bzw. `TABLE` wertet die Abfrage über die **Datensätze** von Datenbank-Tabellen aus (Seite [Datenbank](database.md)). Treffer sind einzelne Datensätze: Jeder erscheint mit seiner Anzeige-Form, ohne sie mit seiner internen Kennung, und ein Klick öffnet seine **Maske** statt der Tabellen-Datei.

````markdown
```perspective-query
TABLE RECORDS autor, seiten
FROM "Bücher"
WHERE seiten > 500
SORT autor
```
````

- **Quelle**: `FROM` nennt die Tabelle als Zeichenkette, beim Namen ihrer Datei ohne Endung und ohne Rücksicht auf die Schreibung (`"Bücher"`) oder als Pfad relativ zur Bereichs-Wurzel samt Endung (`"Archiv/Bücher.md"`), wie die Angabe `table` einer Verweis-Spalte. Mehrere Tabellen verbinden `OR`, `AND`, Klammern und `-` wie gewohnt. Mindestens eine Tabelle oder eine Hierarchie (Abschnitt «Hierarchien» unten) muss ohne Verneinung genannt sein; Schlagwort, Wiki-Link, `outgoing(…)` und der leere Wiki-Link ergeben auf dieser Ebene eine Fehlermeldung. Eine Tabelle, die es nicht gibt, liefert keine Treffer. Eine Tabelle, deren Datei im Vorlagen-Ordner liegt, liefert ebenfalls keine, außer `FROM` nennt sie über ihren Pfad durch diesen Ordner, etwa `"Vorlagen/Bücher.md"`; ihr Name allein genügt dafür nicht (Abschnitt «Quellen»).
- **Felder und Werte**: Nackte Namen sind die Felder der Tabelle, ohne Rücksicht auf die Schreibung. Jeder Wert hat den Typ seiner Spalte, Bedingung und Sortierung behandeln Zahlen also als Zahlen und Daten chronologisch; ein Wahrheitswert wird mit `feld = "true"` bzw. `feld = "false"` geprüft. Passt ein Zell-Inhalt nicht zu seinem Typ, gilt der Wert als fehlend. Ein Name, den die Tabelle nicht führt, bleibt leer und greift nicht auf das Frontmatter der Tabellen-Datei zurück.
- **Eigene Angaben**: `record.id` ist die interne Kennung des Datensatzes, `record.table` der Name seiner Tabelle; beide gehen einem Feld vor, das wörtlich so heißt. `file.*` meint die Tabellen-Datei, `this.` die Träger-Datei der Abfrage.
- **Tabellen**: `TABLE RECORDS …` zeigt den Treffer in der ersten Spalte «Datensatz»; `WITHOUT ID` steht nach `RECORDS`. Spalten-Titel ist der Alias, sonst die Beschriftung des Feldes in der eingestellten Programmsprache nach der Rückfall-Kette der Seite [Datenbank](database.md), sonst der Ausdruck selbst, etwa bei einem Pfad.
- **Verweis-Werte**: Ein Verweis-Feld zeigt die Anzeige-Form seines Ziels, ohne sie dessen Kennung, und ein Klick öffnet die Maske des Ziels. Ein leerer Verweis und einer ins Leere bleiben eine leere Zelle.
- **Ordnung**: Ohne `SORT` stehen die Treffer nach ihrer Anzeige-Form ohne Rücksicht auf die Schreibung, bei gleicher Anzeige-Form nach der Kennung und Datensätze ohne Anzeige-Form am Ende.
- **Zwei Klick-Ziele**: Ein Datensatz im Ergebnis einer Abfrage öffnet die Maske, ein Verweis im Fließtext wie `[[Bücher#^r-00042]]` dagegen die Tabellen-Datei an der Zeile des Datensatzes. Die Maske zeigt den gespeicherten Stand.
- **Ungespeicherter Stand**: Änderungen an einer geöffneten Tabelle gehen sofort in das Ergebnis ein, ohne Speichern.
- **Nicht auf dieser Ebene**: `bold()` in einer Spalte oder in einem Ausdruck von `GROUP BY` ergibt eine Fehlermeldung, weil ein Datenbank-Wert keine Auszeichnung trägt; in Bedingung und Sortierung bleibt es erlaubt. `HIDE`, `SHOW` und `SHORT` gelten nur für `LIST TASKS` und melden sich hier wie auf der Datei- und der Block-Ebene.
- **Leeres Ergebnis und abgeschaltete Datenbank**: Ohne Treffer steht «Kein Datensatz entspricht dieser Abfrage». Ist die Erweiterung «Datenbank» ausgeschaltet, bleibt die Liste leer, darüber steht ein Hinweis, und eine Fehlermeldung erscheint nicht.

### Verknüpfung über Verweis-Felder

Ein **Pfad** über ein Verweis-Feld liest die Felder des Datensatzes, auf den es zeigt: In einer Ausleihe ist `buch.titel` der Titel des verwiesenen Buches, und `buch.verlag.ort` geht eine Stufe weiter in eine dritte Tabelle. Pfade wirken in Spalten, in `WHERE` und in `SORT`:

````markdown
```perspective-query
TABLE RECORDS buch.titel AS "Titel", buch.autor AS "Autor", rückgabe
FROM "Ausleihen"
WHERE buch.seiten > 300
SORT buch.titel
```
````

- Ein Feld, das wörtlich wie der Pfad heißt, etwa `buch.titel`, geht vor.
- Ein leerer Verweis, einer ins Leere und einer, dessen Schlüssel-Wert auf mehrere Datensätze passt, ergeben einen leeren Wert; beim mehrdeutigen steht zusätzlich ein Hinweis über dem Ergebnis. Ein Pfad über ein Feld, das kein Verweis ist, bleibt ebenso leer.
- Endet ein Pfad auf einem Verweis-Feld, zeigt die Zelle wieder einen Verweis, der die Maske öffnet.

Die **Gegenrichtung** braucht keine eigene Schreibweise. Welche Ausleihen auf ein Buch zeigen, sagt eine Bedingung auf dem Verweis-Feld:

````markdown
```perspective-query
LIST RECORDS FROM "Ausleihen" WHERE buch = "r-00005"
```
````

Verglichen wird so, wie eine Verweis-Zelle gelesen wird: Eine Kennung trifft in beiden Schreibweisen (`r-5` und `r-00005`), jeder andere Text wird mit dem einteiligen fachlichen Schlüssel des Ziels verglichen, Zeichen für Zeichen. Die Anzeige-Form zählt dabei nur, wenn sie zugleich der Schlüssel ist. `!=`, `IN` und `NOT IN` folgen derselben Regel, und `SORT` nach einem Verweis-Feld ordnet nach der Anzeige-Form des Ziels.

### Hierarchien (`ancestors`, `descendants`)

Zwei Quellen sammeln Datensätze über **beliebig viele Stufen** eines Verweis-Feldes, etwa die Mitarbeitenden einer Organisation über das Feld `chef`:

````markdown
```perspective-query
LIST RECORDS FROM descendants([[Team#^r-00001]], chef) WHERE seit > 2015
```
````

- `descendants(ziel, feld, …)` liefert alle Datensätze, die über die genannten Felder direkt oder über Zwischenstufen auf das Ziel zeigen; `ancestors(ziel, feld, …)` die Gegenrichtung, also die Kette der Datensätze, auf die das Ziel zeigt, bis nach oben.
- **Ziel** ist ein Datensatz-Verweis in der Schreibweise des Fließtexts. Die Tabelle steht beim Namen oder als Pfad, auch ohne Endung; hinter `#` folgt die Kennung, mit oder ohne `^` und auch in der Kurzform, oder der Wert des einteiligen fachlichen Schlüssels, etwa `[[Team#Clara]]`. Ein Alias hinter `|` zählt nicht.
- **Felder**: ein oder mehrere Verweis-Felder, durch Komma getrennt, etwa `vater, mutter`; ein Name mit Leerzeichen steht in Anführungszeichen. Die Hierarchie folgt allen genannten Feldern, auch über Tabellen-Grenzen.
- Das **Ziel selbst gehört nicht** zum Ergebnis, und jeder Datensatz steht darin höchstens einmal. Eine Tiefen-Grenze gibt es nicht. Bilden die Verweise einen Kreis, endet die Suche trotzdem, und über dem Ergebnis steht ein Hinweis statt einer Fehlermeldung.
- Die Menge wirkt wie jede Quelle: `WHERE`, `SORT`, `LIMIT` und Spalten gelten, `AND "Tabelle"` begrenzt sie auf eine Tabelle, `-` schließt sie aus. Allein genannt ist eine Hierarchie eine vollständige Quelle; nur verneint ergibt sie eine Fehlermeldung, weil sie dann keine Tabelle begrenzt.
- Ein Ziel, das es nicht gibt, liefert keine Treffer. Passt der Schlüssel-Wert des Ziels auf mehrere Datensätze, bleibt das Ergebnis leer, und über ihm steht der Hinweis auf den mehrdeutigen Verweis.
- Beide Quellen gibt es nur auf der Datensatz-Ebene; auf den übrigen Ebenen ergeben sie eine Fehlermeldung.

Als eingerückten Baum zeigt eine Hierarchie die Angabe `DISPLAY tree BY feld` (Abschnitt «Darstellungsform»).

## Quellen (`FROM`)

`FROM` grenzt den Treffer-Raum ein, bevor die Bedingung geprüft wird:

| Quelle | Bedeutung |
|---|---|
| `"Ordner/Unterordner"` | Dateien in diesem Ordner (relativ zur Abfrage-Wurzel), einschließlich Unterordnern |
| `#tag` | Dateien mit diesem Schlagwort; trifft auch Unter-Schlagwörter wie `#tag/unter` |
| `[[Datei]]` | Dateien, die auf `Datei` verlinken |
| `outgoing([[Datei]])` | Dateien, auf die `Datei` verlinkt |
| `[[]]` | Dateien, die auf die Träger-Datei verlinken (Abschnitt «Selbstbezug») |
| `outgoing([[]])` | Dateien, auf die die Träger-Datei verlinkt |
| `descendants([[Tabelle#^r-00001]], feld)` | Datensätze, die über `feld` auf den Ziel-Datensatz zeigen, über alle Stufen (nur Datensatz-Ebene, Abschnitt «Hierarchien») |
| `ancestors([[Tabelle#^r-00001]], feld)` | Datensätze, auf die der Ziel-Datensatz über `feld` zeigt, über alle Stufen (nur Datensatz-Ebene) |

Auf der Datensatz-Ebene nennt eine Zeichenkette statt eines Ordners eine Tabelle (Abschnitt «Datensatz-Ebene»).

**Vorlagen sind kein Treffer.** Was im Vorlagen-Ordner der Seite [Vorlagen](templates.md) liegt, samt Unterordnern, erscheint auf keiner Ebene im Ergebnis: weder die Datei noch ihre Blöcke und Aufgaben noch die Datensätze einer Tabelle darin. Nennt `FROM` den Vorlagen-Ordner oder einen seiner Unterordner ausdrücklich, zeigt die Abfrage genau den Inhalt des genannten Ordners: `FROM "Vorlagen"` alle Vorlagen, `FROM "Projekte" OR "Vorlagen"` die Projekte und die Vorlagen. Keine Nennung sind ein übergeordneter Ordner wie die Bereichs-Wurzel `""`, ein verneinter Ordner wie `-"Vorlagen"`, ein Schlagwort und ein Verweis. Ist die Erweiterung «Vorlagen» ausgeschaltet, entfällt der Ausschluss.

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
| `file.day` | Datum aus dem ISO-Präfix des Namens (`2026-04-18 Besprechung`), sonst leer |
| `file.folder`, `file.path` | Ordner bzw. Pfad, relativ zur Abfrage-Wurzel |
| `file.ext` | Datei-Endung |
| `file.size` | Größe in Bytes |
| `file.ctime`, `file.mtime` | Anlage- bzw. Änderungs-Zeitpunkt |
| `file.tags`, `file.aliases` | Schlagwörter und Aliasse als Listen |
| `file.inlinks`, `file.outlinks` | Dateien, die hierher verlinken bzw. verlinkte Dateien |
| `file.link` | die Datei selbst als klickbarer Link (für Tabellen-Spalten) |

## Selbstbezug (`this.`)

Das Präfix `this.` bezieht sich auf die **Träger-Datei** der Abfrage, also auf das Dokument, in dem der Block steht, statt auf die jeweilige Treffer-Datei. Es gilt für Datei-Felder und Frontmatter-Eigenschaften gleichermaßen: `this.X` ist das, was `X` in der Träger-Datei ergäbe.

````markdown
```perspective-query
LIST WHERE bereich = this.bereich AND file.path != this.file.path
```
````

- **Gleiche Bedeutung in allen Ebenen**: Auch in `BLOCKS`-, `TASKS`- und `RECORDS`-Abfragen meint `this.` die Träger-Datei des Blocks, nie den einzelnen Block, die Task-Zeile oder den Datensatz.
- **Vorrang**: Die `this.`-Regel greift vor einer gleichnamigen Frontmatter-Eigenschaft, genau wie der Namensraum `file.`.
- **Ohne Träger-Datei**: Lässt sie sich nicht auflösen, ergibt jeder `this.`-Zugriff einen leeren Wert; ein nacktes `this` ohne Punkt bleibt wie jeder unbekannte Feldname leer.

Als **Quelle** meint der leere Wiki-Link dieselbe Datei: `FROM [[]]` sammelt die Dateien, die auf sie verlinken, `FROM outgoing([[]])` die Gegenrichtung. Die Träger-Datei ist dabei nie ihr eigener Treffer; ohne auflösbare Träger-Datei bleibt die Menge leer, statt zu allen Dateien zu werden.

## Literale und Rechnen

- **Zahlen** stehen ohne Anführungszeichen (`prio > 2`), **Zeichenketten** in doppelten oder einfachen Anführungszeichen.
- **Datum**: `date(today)` (Tagesbeginn), `date(now)` (Jetzt), `date(2026-12-31)` oder mit Uhrzeit `date(2026-12-31 14:30)`.
- **Dauer**: `dur(7 days)`, `dur(1 day 2 hours)`, kurz `dur(2w)`. Einheiten: `s`, `min`, `h`, `d`, `w`, `mo`, `y` samt Langformen; ein Monat zählt als 30, ein Jahr als 365 Tage.
- **Arithmetik**: `+`, `-`, `*`, `/` mit Punkt-vor-Strich; Datum ± Dauer ergibt ein Datum, Datum − Datum eine Dauer. Zwischen Feldnamen brauchen die Rechenzeichen Leerzeichen (`a - 1`, nicht `a-1` — Letzteres ist ein Feldname).
- **Text-Verkettung**: Geht `+` nicht numerisch auf und ist eine Seite eine Zeichenkette, verbindet es die Anzeige-Formen beider Seiten; so entstehen zusammengesetzte Spalten wie `file.day + " — " + status`. Rein numerische Additionen bleiben numerisch (`5 + "3"` ergibt 8), ein fehlender Wert bleibt fehlend und lässt die Zelle leer.

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
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | Datum formatieren (Token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` sowie `MMMM`/`MMM`, `EEEE`/`EEE` für Monats- und Wochentagsnamen in der eingestellten Programmsprache und `d`, `M` ohne führende Null; eckige Klammern schützen wörtlichen Text: `"[Woche] ww"`) |
| `days(x)` | `days(date(today) - file.day)` | Dauer als Zahl ganzer Tage; gerundet, damit eine Zeitumstellung nicht um einen Tag verschiebt |
| `numberformat(x[, n])` | `numberformat(betrag, 2)` | Zahl lokalisiert darstellen: ohne zweites Argument nach Sprach-Vorgabe, sonst mit genau n Nachkommastellen |
| `currencyformat(x[, w])` | `currencyformat(betrag, "CHF")` | Betrag lokalisiert darstellen: ohne Angabe in Euro, bei unbekanntem Währungs-Code die unformatierte Zahl |
| `infolder(l, "Ordner")` | `length(infolder(file.inlinks, "Projekte")) = 0` | Teilliste der Link-Werte, deren Ziel im Ordner oder darunter liegt |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(werte) = 6` | Aggregate über Zahlen-Listen; über einer Gruppe fassen sie die Werte aller ihrer Treffer zusammen (Abschnitt «Gruppierung und Aggregation») |
| `count(x)` | `count(tags) > 2` | Zahl der vorhandenen Werte: bei einer Liste ihre Elemente, bei einem Einzelwert 1, ohne Wert 0; `count()` ohne Feld zählt die Treffer einer Gruppe |
| `bold(x)` | `bold(status)` | Wert hervorgehoben darstellen (Abschnitt «Hervorhebung») |

Eine unbekannte Funktion oder eine falsche Argument-Anzahl zeigt einen Fehlerhinweis am Block.

**Sprache der Formatierer:** `dateformat`, `numberformat` und `currencyformat` folgen der in den Einstellungen gewählten Programmsprache, nicht der Sprache des Betriebssystems. Wo kein Dokument dahintersteht, etwa in berechneten Datentabellen-Spalten und in Inline-Berechnungen, bleibt es bei der Sprache der Umgebung.

## Hervorhebung

`bold(wert)` stellt einen Wert hervorgehoben dar, in Tabellen-Zellen, im Zusatzfeld der Liste und im Wert einer Gruppe gleichermaßen. Die Auszeichnung übersteht die Verkettung: `bold` darf auch nur einen **Teil** eines zusammengesetzten Ausdrucks einfassen, der Rest bleibt normal.

````markdown
```perspective-query
TABLE bold(status) AS "Status", file.mtime
```
````

Zell-Inhalte werten kein Markdown aus: Ein Sternchen im Text erscheint unverändert wörtlich, und eine Hervorhebung entsteht ausschließlich über diesen Aufruf. Vergleich, Sortierung und Gruppierung arbeiten auf dem reinen Text und verhalten sich damit exakt wie ohne Auszeichnung; ein fehlender Wert bleibt leer, statt eine leere Hervorhebung zu erzeugen.

## Beispiel: der letzte Kontakt

Die Bausteine dieser Seite ergeben zusammen eine Übersicht, die auf einer Personen-Notiz zeigt, wann diese Person zuletzt in einer datierten Notiz vorkam und wie lange das her ist:

````markdown
```perspective-query
TABLE WITHOUT ID file.link AS "Notiz",
  file.day + " — " + bold(days(date(today) - file.day) + " Tage") AS "Letzter Kontakt"
FROM [[]]
SORT file.day DESC
LIMIT 1
```
````

`FROM [[]]` sammelt die Notizen, die auf diese Datei verlinken. `file.day` liest deren Datum aus dem Dateinamen, `date(today) - file.day` ergibt die Dauer bis heute und `days(…)` die Zahl ganzer Tage. Das Pluszeichen setzt Datum, Trennstrich und Tages-Zahl zu einer Zelle zusammen, `bold(…)` hebt den Abstand hervor: «2026-04-18 — **48 Tage**». Notizen ohne Datum im Namen sortieren unabhängig von der Richtung ans Ende und verdrängen den Treffer nicht.

## Sortierung und Limit

`SORT feld [ASC|DESC], feld2 …` sortiert das Ergebnis mehrstufig und typ-gerecht (Zahl numerisch, Datum chronologisch, Text alphabetisch nach Sprachregeln); fehlende Werte stehen unabhängig von der Richtung am Ende. Ohne `SORT` bleibt die alphabetische Ordnung; Aufgaben und Datensätze ordnen nach der Vorgabe ihres Abschnitts. `LIMIT n` begrenzt das Ergebnis nach der Sortierung. In einer gruppierten Tabelle ordnen und begrenzen `SORT` und `LIMIT` die Gruppen statt der Treffer (Abschnitt «Gruppierung und Aggregation»).

## Gruppierung und Aggregation (`GROUP BY`, `HAVING`)

`GROUP BY ausdruck, …` fasst die Treffer nach dem Wert eines Ausdrucks zu Gruppen zusammen, auf jeder Ebene: bei Dateien, Blöcken, Aufgaben und Datensätzen. Jeder weitere Ausdruck bildet eine Stufe unter der vorigen. Die Gruppen stehen nach ihrem Wert geordnet, Treffer ohne Wert zuletzt in der Gruppe «(ohne Wert)». Ein Listen-Wert wie `file.tags` bildet eine Gruppe je Kombination, `[rot, blau]` und `[blau, rot]` also zwei; nach einzelnen Listen-Elementen wird nicht aufgeteilt. Ein Verweis-Feld der Datensatz-Ebene gruppiert nach dem Datensatz, auf den es zeigt: Zwei Bücher gleichen Titels ergeben zwei Gruppen, jede zeigt die Anzeige-Form ihres Buches, und ein Klick auf sie öffnet dessen Maske.

- **Liste**: `LIST … GROUP BY …` zeigt je Gruppe eine Überschrift und darunter ihre Treffer, jede Stufe eine Ebene tiefer eingerückt. Ein Treffer erscheint und reagiert auf den Klick wie in der Liste ohne Gruppierung.
- **Tabelle**: `TABLE … GROUP BY …` zeigt je Gruppe eine Zeile, bei mehreren Stufen je Gruppe der untersten Stufe; einzelne Treffer erscheinen nicht. Vorn steht je Ausdruck von `GROUP BY` eine Spalte mit dem Gruppen-Wert, an der Stelle der Spalte «Datei» bzw. «Datensatz». Ihr Titel ist auf der Datensatz-Ebene die Beschriftung des Feldes, sonst der Ausdruck selbst; `WITHOUT ID` blendet diese Spalten aus. Die übrigen Spalten zeigen Werte über der Gruppe.

````markdown
```perspective-query
TABLE RECORDS count() AS "Bücher", sum(seiten) AS "Seiten"
FROM "Bücher"
GROUP BY autor
HAVING count() > 1
SORT count() DESC, autor
```
````

**Zeile oder Gruppe.** Eine Aggregat-Funktion bekommt ihre Bedeutung aus der Stelle, an der sie steht. **Aggregat-Stellen** sind die Spalten und `SORT` einer gruppierten Tabelle sowie `HAVING`; dort rechnet sie über alle Treffer der Gruppe. Überall sonst rechnet sie über den Wert des einzelnen Treffers, also in `WHERE`, in den Ausdrücken von `GROUP BY`, in den Spalten einer Tabelle ohne `GROUP BY`, im Zusatzfeld der Liste und in `SORT` einer gruppierten Liste. Drei Beispiele:

| Abfrage | Bedeutung |
|---|---|
| `TABLE sum(werte)` | je Datei die Summe ihrer Liste `werte` (Zeile) |
| `TABLE sum(werte) GROUP BY status` | je Status die Summe aller Werte aller Dateien mit diesem Status (Gruppe) |
| `LIST GROUP BY status HAVING count() > 2` | nur die Status mit mehr als zwei Dateien, darunter ihre Dateien (Bedingung über die Gruppe) |

**Über der Gruppe** zählt `count()` die Treffer und `count(x)` die Treffer, bei denen `x` einen Wert hat. `sum`, `average`, `min` und `max` fassen die Werte aller Treffer zusammen, eine Liste mit allen ihren Elementen; `min` und `max` nehmen dort auch Datums-Werte und liefern dann ein Datum. Über Aggregaten darf gerechnet werden, etwa `sum(seiten) / count()`. Das Aggregat über die Liste eines einzelnen Treffers ist an einer Aggregat-Stelle nicht erreichbar. In der Aggregat-Zeile der [Perspective Datatable](datatable.md) heißt der Durchschnitt `avg`, in der Abfrage `average`.

**Erlaubt an einer Aggregat-Stelle** sind ein Ausdruck, der einem Ausdruck von `GROUP BY` gleicht (die Schreibung der Feld-Namen zählt dabei nicht), Literale, Aggregate und jede Rechnung oder Funktion über ihnen, etwa `upper(autor) + ": " + count()`. Eine Fehlermeldung ergeben dagegen:

- ein anderes Feld in einer Spalte oder in `SORT` einer gruppierten Tabelle, auch ein Selbstbezug mit `this.`; die Meldung nennt die Spalte und verweist auf `LIST`, das die einzelnen Treffer zeigt;
- ein anderes Feld in `HAVING`; die Meldung nennt das Feld und verweist auf `WHERE`, das die einzelnen Treffer filtert;
- ein Aggregat in einem Aggregat, etwa `sum(count(x))`;
- `count()` ohne Feld an einer Zeilen-Stelle, etwa in `WHERE` oder in einer Tabelle ohne `GROUP BY`;
- `HAVING` ohne `GROUP BY`.

**Bedingung über die Gruppe (`HAVING`).** `HAVING` prüft die Gruppen wie `WHERE` die Treffer: Es ist ein Wahrheits-Ausdruck wie nach `WHERE`, steht nur zusammen mit `GROUP BY` an beliebiger Stelle der Klauseln und wirkt in Liste und Tabelle. Bei mehreren Stufen prüft es die Gruppen der untersten Stufe. Eine Gruppe darüber, unter der keine Untergruppe bleibt, entfällt, und die übrigen behalten nur die Treffer ihrer verbliebenen Untergruppen.

**Reihenfolge.** In der gruppierten Tabelle filtert `WHERE` die Treffer, danach entstehen die Gruppen, `HAVING` prüft sie, `SORT` ordnet sie (ohne `SORT` nach ihrem Wert), und `LIMIT` begrenzt die Zahl der Zeilen. Bei mehreren Stufen ordnet `SORT` die Gruppen jeder Stufe untereinander. In der gruppierten Liste ordnen und begrenzen `SORT` und `LIMIT` dagegen die Treffer, bevor die Gruppen entstehen, und `HAVING` wirkt danach; die Gruppen selbst stehen dort nach ihrem Wert geordnet.

**Grenzen.** Eine Tabelle ohne `GROUP BY` rechnet je Treffer; eine Gesamtsumme über alle Treffer ohne Gruppierung gibt es nicht. `HIDE`, `SHOW` und `SHORT` bleiben der Aufgaben-Liste vorbehalten. Der Baum (`DISPLAY tree`) passt zu keiner gruppierten Abfrage. Als Quelle eines Wertevorrats oder Sammel-Feldes liefert eine gruppierte Abfrage dieselben Treffer wie ohne Gruppierung (Seite [Eigenschafts-Profile](property-profiles.md)).

## Mehrspaltige Listen

`COLUMNS n` (1 bis 8) lässt die Ergebnis-Liste über mehrere Spalten fließen — reine Darstellung, keine Daten-Änderung. Bei `TABLE` wird `COLUMNS` ignoriert und als Hinweis am Block gemeldet.

````markdown
```perspective-query
LIST FROM #lesezeichen COLUMNS 3
```
````

## Darstellungsform (`DISPLAY`)

Die Angabe `DISPLAY` mit dem Namen einer Form wählt, in welcher Form das Ergebnis erscheint. Sie ist eine Klausel wie die übrigen und steht üblicherweise am Ende; ohne sie erscheint das Ergebnis als Liste oder Tabelle, je nach Ausgabe-Typ. Liste und Tabelle selbst wählen `LIST` und `TABLE`, nicht `DISPLAY`; `DISPLAY list` und `DISPLAY table` gelten deshalb als unbekannte Formen.

````markdown
```perspective-query
LIST RECORDS FROM "Team" DISPLAY tree BY chef
```
````

Wählbar ist der **Baum** (`DISPLAY tree BY feld`). Er zeigt die Datensätze einer Datensatz-Abfrage eingerückt entlang des genannten Verweis-Feldes:

- Ein Datensatz hängt unter dem Datensatz, auf den sein Feld zeigt, wenn dieser im Ergebnis steht. Sonst ist er eine **Wurzel** und steht ganz links: ohne Verweis, mit einem Verweis ins Leere oder auf einen Datensatz, den die Bedingung herausfiltert. Bei `descendants(…)` sind deshalb die dem Ziel direkt unterstellten Datensätze die Wurzeln, weil das Ziel selbst nicht zum Ergebnis gehört.
- Wurzeln und Geschwister stehen in der Reihenfolge des Ergebnisses, die `SORT` bestimmt.
- Jeder Datensatz erscheint genau einmal, auch wenn die Verweise einen Kreis bilden. Ein Kreis ohne Wurzel folgt hinter den übrigen Wurzeln und beginnt mit seinem ersten Datensatz in der Reihenfolge des Ergebnisses.
- Es wirkt allein das Feld nach `BY`. Führt eine Tabelle zwei Eltern-Felder wie Vater und Mutter, folgt der Baum dem genannten; welche Datensätze im Ergebnis stehen, bestimmt weiter die Quelle.
- Ein Knoten zeigt die Anzeige-Form wie ein Listen-Eintrag, bei `LIST` mit dem Zusatzfeld dahinter; bei `TABLE` zeigt der Baum keine Spalten. Ein Klick öffnet die Maske.
- Tiefer als 32 Ebenen wird nicht weiter eingerückt; tiefere Knoten stehen vollständig auf der 32. Ebene.

**Rückfall**: Ist eine Form unbekannt oder passt sie nicht zur Abfrage, erscheint das Ergebnis ohne sie, also als Liste oder Tabelle, darüber ein Hinweis mit dem Namen der Form und keine Fehlermeldung. Der Baum passt nur auf der Datensatz-Ebene und nur mit einem Feld nach `BY`, das bei mindestens einer Tabelle des Ergebnisses ein Verweis-Feld ist. Zu einer gruppierten Abfrage passt er nie; dann erscheint die gruppierte Ausgabe mit dem Hinweis. Ein leeres Ergebnis zeigt seinen Leer-Hinweis und keine Form. Fehlt nach `DISPLAY` der Name der Form oder nach `BY` das Feld, ist die Abfrage ungültig.

## Anzeige und Interaktion

- **Klickbare Treffer**: Jeder Treffer erscheint mit seinem logischen Dateinamen; der volle Pfad steht im Tooltip. Ein Klick öffnet die Zieldatei in einem Tab, genau wie ein Wiki-Link — auch in Tabellen-Zellen mit Link-Werten. Auf der Datensatz-Ebene heißt ein Treffer nach seiner Anzeige-Form, und ein Klick öffnet seine Maske.
- **Live-Aktualisierung**: Neue, geänderte und gelöschte Dateien schlagen ohne manuelles Neuladen auf sichtbare Ergebnisse durch, sobald der Index sie erfasst hat.
- **Leeres Ergebnis**: Trifft die Abfrage keine Datei und keinen Datensatz, erscheint ein kurzer Hinweis statt einer leeren Fläche.
- **Ungültige Abfrage**: Ein Syntaxfehler zeigt einen Fehlerhinweis mit der Position statt eines Ergebnisses.

Die drei Ansichten Gerendert, Geteilt und Live zeigen dasselbe Ergebnis. In der reinen Quelltext-Ansicht bleibt der Block als Code sichtbar.

## Suchraum

Der Suchraum ist derselbe wie beim Datei-Index:

- **Mit aktivem Bereich** umfasst er den gesamten Bereich; Link-Bezüge (`FROM [[…]]`, `file.inlinks`) sind dort vollständig.
- **Ohne Bereich** umfasst er den Ordner der Datei plus zwei Unterebenen.

Dateien außerhalb des Suchraums erscheinen nicht im Ergebnis, ebenso wenig, was im Vorlagen-Ordner liegt, außer die Abfrage nennt ihn (Abschnitt «Quellen»). Eine noch nicht gespeicherte Datei hat keinen Suchraum; die Abfrage zeigt dann einen Hinweis, dass sie erst nach dem Speichern verfügbar ist. Ungespeicherte Änderungen an einer geöffneten Datei, auch an einer Datenbank-Tabelle, gehen dagegen sofort in das Ergebnis ein; dafür muss nichts gespeichert werden.

## Export

- **PDF-Export**: Das Ergebnis wird als statischer Stand des Render-Zeitpunkts gedruckt, einschließlich Tabellen- und Spalten-Layout. Die Einträge erscheinen als Text; anklickbar sind sie im PDF nicht.
- **Portables Markdown**: Der Export lässt den `perspective-query`-Block unverändert als Quelltext stehen. Beim erneuten Öffnen in diesem Programm wird er wieder dynamisch ausgewertet; andere Markdown-Programme zeigen ihn als Code-Block.

Für freie Auswertungen jenseits der Klausel-Sprache — etwa rekursive Strukturen oder berechnete Übersichten — stehen die [Skript-Blöcke](scripts.md) bereit; ihre pq-API nutzt dasselbe Feld- und Block-Modell wie die Abfrage.
