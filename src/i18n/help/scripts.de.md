# Skript-Blöcke

Ein Code-Block mit dem Sprach-Tag `perspective-script` führt **JavaScript** aus und bettet das Ergebnis in das gerenderte Dokument ein. Skripte lesen die Daten des Suchraums (Dateien mit Frontmatter- und Datei-Feldern, Block-Eigenschaften) über die **pq-API** und geben Listen, Tabellen, Elemente oder Markdown aus. Damit sind freie Auswertungen möglich, die über die deklarative [Perspective-Abfrage](frontmatter-query.md) hinausgehen — etwa rekursive Strukturen oder berechnete Übersichten.

Die Beispiele dieser Seite sind bewusst als Code-Blöcke gesetzt; die Handbuch-Seite selbst führt keine Skripte aus.

## Aktivierung und Vertrauensmodell

Die Skript-Ausführung ist standardmäßig **ausgeschaltet**. Ohne Aktivierung zeigt ein Skript-Block seinen Quelltext mit einem Hinweis-Banner; es entsteht keine Ausführungs-Umgebung.

Eingeschaltet wird sie unter **Einstellungen → Verhalten → Skript-Blöcke ausführen**. Die Aktivierung ist eine bewusste Vertrauens-Entscheidung: Skripte stammen aus den geöffneten Dokumenten. Nur aktivieren, wenn die eigenen Dokumente vertrauenswürdig sind. Das Umschalten wirkt sofort in allen Fenstern, ohne Neustart.

## Laufzeit-Grenzen

Skripte laufen **eingehegt** in einer isolierten Sandbox, nie im Kontext der App:

- **Kein Datei-Zugriff, kein Netz-Zugriff, keine Modul-Importe.** Die Sandbox hat keinen Zugriff auf das Dateisystem, auf App-Schnittstellen oder auf externe Adressen.
- **Kein Zugriff auf das Dokument-DOM.** Skripte schreiben nie direkt in die Anzeige; die Ausgabe läuft als strukturierte Beschreibung über die pq-API und wird kontrolliert übersetzt (erlaubt sind Struktur- und Text-Elemente, Attribute `class`, `title` sowie `colspan`/`rowspan` an Zellen).
- **Rein lesend.** Die pq-API liefert einen Daten-Schnappschuss; Dateien und Metadaten lassen sich aus Skripten nicht verändern.
- **Zeit-Limit.** Ein Lauf wird nach 5 Sekunden abgebrochen; der Block zeigt dann einen Abbruch-Hinweis. Die Blöcke eines Fensters laufen nacheinander: ein Langläufer verzögert nachfolgende Blöcke nur bis zu seinem Abbruch, und die App bleibt währenddessen bedienbar.
- **Ausgabe-Deckel.** Sehr große Ausgaben werden gekürzt und mit einem Hinweis versehen.

## Grundgerüst

Das Skript ist der Inhalt des Code-Blocks; `pq` steht als einziges vordefiniertes Objekt bereit. Ausgegeben wird, was über die Ausgabe-Funktionen gemeldet wird; der Rückgabewert des Skripts selbst wird nicht angezeigt. Gibt das Skript ein Promise zurück, wartet der Block auf dessen Abschluss.

````markdown
```perspective-script
pq.out('Ergebnis: ' + (6 * 7));
```
````

## Daten lesen

Alle Daten-Funktionen sind rein lesend und arbeiten auf einem Schnappschuss des Index zum Start des Laufs. Ändert sich der Datei-Bestand, läuft der Block automatisch neu.

- `pq.pages([quelle])` — alle Dateien des Suchraums als Seiten-Objekte, optional gefiltert über eine Quelle.
- `pq.current()` — das Seiten-Objekt des eigenen Dokuments (oder `null`).
- `pq.file(ref)` — eine Seite über absoluten Pfad, wurzel-relativen Pfad oder logischen Namen (unabhängig von Groß-/Kleinschreibung); `null`, wenn nichts passt.
- `pq.blocks([quelle])` — die Block-Eigenschaften des Suchraums (siehe [Block-Eigenschaften](block-properties.md)); nur aktive Anker zählen.
- `pq.indexStatus` — Status der Datenlage (`ready`; ohne durchsuchbare Basis `none`).
- `pq.version` — Versionsnummer der pq-API (aktuell `1`).

### Seiten-Objekte

Ein Seiten-Objekt trägt die **Frontmatter-Felder flach** (Feldnamen kleingeschrieben, z. B. `seite.status`) plus das Objekt `file` mit den impliziten Datei-Feldern:

| Feld | Inhalt |
|---|---|
| `file.name` | logischer Name (Dateiname ohne Endung) |
| `file.folder` | Ordner relativ zur Suchraum-Wurzel (`''` an der Wurzel) |
| `file.path` | wurzel-relativer Pfad |
| `file.absPath` | absoluter Pfad (Identität für `pq.link` und `pq.file`) |
| `file.ext` | Datei-Endung (klein, ohne Punkt) |
| `file.size` | Größe in Bytes |
| `file.ctimeMs`, `file.mtimeMs` | Anlage-/Änderungszeit in Millisekunden |
| `file.tags` | Tags der Datei |
| `file.aliases` | Aliase aus dem Frontmatter |
| `file.inlinks`, `file.outlinks` | ein- bzw. ausgehende Verweise, je `{ path, name }` |

### Quellen

Der optionale Parameter `quelle` filtert wie die Quellen-Auswahl der Abfrage, in vereinfachter Form:

- `'#tag'` — Dateien mit dem Tag, inklusive Hierarchie (`#projekt` trifft auch `projekt/alpha`).
- `'[[Name]]'` — Dateien, die auf das Ziel verweisen (ausgehender Link).
- `'Ordner'` bzw. `'Ordner/Unterordner'` — Dateien unterhalb des Ordner-Pfads.

### Block-Eigenschaften

`pq.blocks()` liefert je Eintrag `{ file: { path, absPath, name }, anchor, values, updatedMs }`; `values` sind die Eigenschafts-Werte des Blocks. Der Quellen-Filter wirkt über die Träger-Datei.

## Ausgeben

Ausgabe-Funktionen melden Inhalt an den Block (in Aufruf-Reihenfolge):

- `pq.out(...inhalte)` — gibt Werte, Bau-Knoten oder Arrays davon aus; einfache Werte werden Text.
- `pq.list(einträge)` — Aufzählungsliste. Ein Eintrag ist Inhalt oder `{ content, children }` für Baum-Strukturen (beliebig verschachtelbar).
- `pq.table(kopf, zeilen)` — Tabelle; `kopf` ist ein Array von Zell-Inhalten, `zeilen` ein Array von Zeilen-Arrays.

Bau-Funktionen erzeugen Knoten **ohne** eigene Ausgabe; sie werden als Inhalt in `pq.out`, Listen-Einträgen und Tabellen-Zellen verwendet:

- `pq.el(tag, inhalt, attribute)` — ein Element aus der erlaubten Element-Liste (z. B. `p`, `span`, `strong`, `code`, `ul`, `table`, `h1`–`h6`); nicht erlaubte Elemente und Attribute werden verworfen.
- `pq.link(ziel, anzeige, anker)` — klickbarer interner Verweis. `ziel` ist ein Seiten-, `file`- oder Block-Objekt oder ein Pfad/Name; Block-Ziele springen automatisch zum Anker. Ohne `anzeige` erscheint der logische Name.
- `pq.md(text)` — Markdown über die normale Render-Pipeline (Betonung, Listen, Links usw.); eingebettete Abfrage- und Skript-Blöcke werden dabei nicht ausgeführt.

## Helfer

- `pq.date(wert)` — Datum aus ISO-artigen Strings (`2026-07-09`, `2026-07-09 14:30`), Millisekunden oder Datums-Objekten; lokal interpretiert, `null` bei Unlesbarem.
- `pq.dur(text)` — Dauer in Millisekunden aus Einheiten-Ausdrücken wie `'7 days'` oder `'1h 30min'` (Einheiten wie im `dur(…)`-Literal der Abfrage; Monate/Jahre als 30/365-Tage-Näherung).
- `pq.sort(liste, selektor, absteigend)` — sortierte Kopie; `selektor` ist eine Funktion oder ein Feld-Pfad wie `'file.name'`. Vergleich typ-gerecht: Datum chronologisch, Zahl numerisch, sonst Text ohne Groß-/Klein-Unterscheidung.

## Beispiel: rekursiver Link-Baum

Ausgehend vom eigenen Dokument entsteht ein Baum über die ausgehenden Verweise; jedes Ziel ist klickbar, bereits besuchte Seiten werden nicht wiederholt:

````markdown
```perspective-script
function baum(seite, gesehen) {
  return {
    content: pq.link(seite),
    children: seite.file.outlinks
      .map(function (l) { return pq.file(l.path); })
      .filter(function (p) { return p && gesehen.indexOf(p.file.absPath) < 0; })
      .map(function (p) { return baum(p, gesehen.concat([p.file.absPath])); }),
  };
}
var start = pq.current();
pq.list([baum(start, [start.file.absPath])]);
```
````

## Beispiel: Tabelle über eine Tag-Quelle

````markdown
```perspective-script
var seiten = pq.sort(pq.pages('#projekt'), 'prio');
pq.table(['Datei', 'Prio'], seiten.map(function (p) {
  return [pq.link(p), p.prio];
}));
```
````

## Fehler und Abbruch

Ein Syntax- oder Laufzeit-Fehler erscheint lokalisiert am Block, mit der Original-Meldung des Skripts und, soweit ermittelbar, der Skript-Zeile. Ein Lauf über dem Zeit-Limit wird abgebrochen und als Abbruch angezeigt. Skripte laufen strikt: Zuweisungen an nicht deklarierte Variablen sind Fehler.

## Export

Der PDF-Export druckt den sichtbaren Stand: bei aktiver Einstellung das Skript-Ergebnis (der Export wartet laufende Skripte ab), sonst die Quelltext-Darstellung. Beim Weitergeben als Markdown-Datei bleibt der Skript-Block unverändert Quelltext; ob er beim Empfänger ausgeführt wird, entscheidet dessen Einstellung.
