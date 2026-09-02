# Teilung großer Dokumente

Sehr große Dokumente teilt die Anwendung beim Speichern in mehrere Dateien auf und setzt sie beim Öffnen wieder zu einem Dokument zusammen. Im Reiter arbeiten Sie wie immer: Sie sehen einen durchgehenden Text, Rückgängig läuft über die Grenzen hinweg, und die Suche findet das Dokument als Ganzes.

Der Grund ist die Bedienbarkeit. Ein Dokument, das über eine bestimmte Größe hinauswächst, macht den Wechsel in den Änderungsmodus zäh. Die Teilung hält die einzelne Datei handlich, ohne Ihnen eine Größengrenze aufzuerlegen.

## Wann geteilt wird

Geteilt wird beim **Speichern**, sobald das Dokument etwa ein Megabyte überschreitet. Das Anzeigen und Lesen ist nie betroffen.

Das erste Teilen eines Dokuments wird angekündigt. Sie können es ablehnen: Dann bleibt die Datei ungeteilt, und der Reiter wird bis zum nächsten Öffnen auf „nur lesen" gestellt. Sind die Teile einmal angelegt, kommen weitere still dazu.

Läuft das automatische Speichern im Hintergrund, wird **nicht** ungefragt geteilt. Der Reiter bleibt so lange geändert stehen, bis Sie einmal von Hand speichern und die Frage beantworten.

## Wo geschnitten wird

Geschnitten wird ausschließlich vor einer **Überschrift der obersten zwei Ebenen**, also vor einer Zeile, die mit einer oder zwei Rauten beginnt:

```markdown
# Erstes Kapitel

Text …

## Ein Abschnitt
```

Damit liegt nie ein Konstrukt über einer Grenze: Kein Code-Block, keine Tabelle, keine Aufzählung und kein Callout wird auseinandergerissen. Überschriften innerhalb eines Code-Blocks oder in einem Zitat zählen nicht als Schnittstelle.

**Findet sich keine solche Überschrift, wird nicht geteilt.** Ein sehr großes Dokument ohne Überschriften bleibt eine einzige Datei; die Statusleiste sagt Ihnen einmal, warum. Der Preis ist bewusst so gewählt: Ein Schnitt an einer beliebigen Stelle träfe mitten in zusammengehörenden Text.

## Wie die Teile heißen

Die erste Datei behält den Namen des Dokuments unverändert. Die Folgeteile tragen denselben Namen mit einem Zusatz:

```text
Reisebericht.md
Reisebericht•part-00002.md
Reisebericht•part-00003.md
```

Das Trennzeichen ist der **Aufzählungspunkt** `•`. Es ist bewusst ein anderes als das der [Unterseiten](subpages.md), die den Bruchstrich `∕` verwenden: Ein Teil ist keine Unterseite, und beide sollen auf den ersten Blick unterscheidbar sein.

Jede Teil-Datei ist eine gewöhnliche Markdown-Datei und für sich lesbar. In ihrem Kopf steht eine technische Zeile, die ihre Zugehörigkeit und ihre Position festhält:

```yaml
doc-part: v1|2|Reisebericht
```

Diese Zeile ist die verbindliche Auskunft darüber, was zusammengehört — nicht der Dateiname. Verschieben Sie eine Teil-Datei in einen anderen Ordner, findet das Dokument sie nicht mehr.

## Was Sie im Programm davon sehen

Wenig, und das ist die Absicht:

- **Reiter und Editor** zeigen ein durchgehendes Dokument.
- **Die Datei-Liste des Bereichs** zeigt nur das Dokument, nicht seine Teile.
- **Die Suche** meldet einen Treffer aus einem hinteren Teil als Treffer des Dokuments; der Sprung öffnet es an der Fundstelle.
- **Umbenennen** nimmt alle Teile mit.
- **Im Kopf der ersten Datei** steht die Zuordnungs-Zeile. Sie ist die sichtbare Spur der Teilung und erscheint auch in den Eigenschaften.

Im Dateimanager Ihres Betriebssystems sehen Sie die Teile weiterhin — sie sind echte Dateien in Ihrem Ordner.

## Wenn ein Teil fehlt

Fehlt beim Öffnen ein Teil, weil er gelöscht, verschoben oder noch nicht synchronisiert wurde, öffnet das Dokument **nur lesend** und nennt die fehlende Position. Speichern ist gesperrt, solange die Lücke besteht: Ein Schreiben aus dem unvollständigen Text würde den fehlenden Teil endgültig verlieren.

Zwei Wege führen heraus. Legen Sie die fehlende Datei zurück, dann ist das Dokument beim nächsten Öffnen wieder vollständig und beschreibbar, ohne dass Sie etwas zurücksetzen müssen. Oder löschen Sie die Begleitdatei `.mdd` des Dokuments, wenn Sie ohne den Teil weiterarbeiten wollen — dort steht das Verzeichnis der Teile, das die Lücke überhaupt sichtbar macht.

Wurde ein Teil außerhalb der Anwendung **geändert**, meldet das Speichern einen Konflikt und überschreibt nichts.

## Teile wieder vereinen

Der Menüpunkt **Datei → Weitere Datei-Funktionen → Teile wieder vereinen…** macht aus den Teilen wieder eine einzelne Datei und löscht die Teil-Dateien. Das geschieht nur auf diese Anforderung hin, nie von selbst.

Ist das vereinte Dokument größer als die Schwelle, warnt der Befehl vorher: Beim nächsten Speichern würde es sofort wieder geteilt. Der Inhalt geht dabei nicht verloren, aber der Befehl bliebe ohne dauerhafte Wirkung.

Fehlt ein Teil, verweigert der Befehl die Arbeit — er würde die übrigen Teile löschen und den Verlust endgültig machen.
