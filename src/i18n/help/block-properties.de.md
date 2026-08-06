# Block-Eigenschaften

Was das Frontmatter für das ganze Dokument leistet, leisten Block-Eigenschaften für einzelne Blöcke: strukturierte, typisierte Schlüssel-Wert-Daten, etwa ein Besprechungsstatus je Absatz oder ein Termin je Aufgabenpunkt. Träger ist der **Block-Anker**; gespeichert werden die Daten in der **Begleitdatei** des Dokuments (Markdown-Data, `.mdd`), derselben Datei, die auch die [Dokument-Historie](history.md) und die [Dokument-Notizen](notes.md) trägt. Der Dokument-Text selbst bleibt unberührt.

## Der Block-Anker als Träger

Ein Block-Anker ist eine frei wählbare Kennung am Ende eines Blocks:

```markdown
Dieser Absatz trägt einen Anker. ^besprechung-1
```

In der gerenderten Ansicht ist der Anker unsichtbar; er macht den Block ansprechbar. Erlaubt sind Buchstaben (auch Umlaute), Ziffern, Bindestrich und Unterstrich. Die Eigenschaften hängen an dieser Kennung: Solange der Anker im Text steht, gehören die Daten zu diesem Block, unabhängig davon, wohin der Block innerhalb des Dokuments verschoben wird.

## Das Panel Block-Eigenschaften

Das Panel „Block-Eigenschaften" wird wie jedes Sidebar-Panel geschaltet: über das Menü Ansicht → Sidebar → Panels → Block-Eigenschaften, das Klammern-Symbol in der Statusbar oder ein selbst vergebenes Tastenkürzel (ab Werk ist keines belegt). Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md).

Das Panel **folgt dem Cursor**: Es zeigt die Eigenschaften des Blocks, in dem der Cursor steht. Die Kopfzeile nennt den aktiven Anker und bietet ein Auswahlfeld aller Anker der Datei zum Springen; Anker mit Eigenschaften sind darin markiert. Steht der Cursor in einem Block **ohne** Anker, bietet das Panel „Anker anlegen" an und schreibt eine kurze, in der Datei eindeutige Zufalls-Kennung an das Blockende.

Die Eigenschafts-Zeilen arbeiten wie im Properties-Panel des Dokuments: Jede Zeile hat einen frei wählbaren Schlüssel, einen Typ (Text, Liste, Zahl, Wahr/Falsch, Datum, mehrzeilig) und ein passendes Wert-Feld. Beim Schlüssel schlägt das Panel die im Dokument bereits verwendeten Block-Schlüssel vor. Gespeichert wird **automatisch** kurz nach der Eingabe; der Dokument-Tab wird dabei nicht als geändert markiert, denn die Daten liegen in der Begleitdatei, nicht im Text. In Lese-Ansichten zeigt das Panel die Daten nur an.

## Anker umbenennen

Das Stift-Symbol neben dem Anker-Auswahlfeld benennt den aktiven Anker um. Dabei ziehen der Anker im Text, der Daten-Eintrag in der Begleitdatei und die eingehenden Verweise **innerhalb desselben Dokuments** synchron mit:

```markdown
Siehe den ersten Punkt: [[#^besprechung-1]]
```

Verweise aus anderen Dateien werden nicht angepasst; wer dateiübergreifend verweist, benennt mit Bedacht um.

## Verwaiste Daten

Verschwindet ein Anker aus dem Text, gehen die Eigenschaften **nicht verloren**: Sie bleiben in der Begleitdatei erhalten und erscheinen im Panel im Abschnitt „Verwaiste Daten". Von dort lassen sie sich einem vorhandenen Anker ohne Daten zuordnen oder endgültig löschen. Trägt eine Datei denselben Anker mehrfach, zählt das erste Vorkommen; das Panel weist auf das Duplikat hin.

## Sichtbarkeit am Block

Blöcke mit Eigenschaften tragen in der gerenderten Ansicht und im Live-Modus einen dezenten Indikator am Blockende. Wer mit der Maus darauf zeigt, sieht die Schlüssel-Wert-Liste; ein Klick öffnet das Panel mit diesem Anker. Im PDF-Export erscheint der Indikator nicht.

## Bezug auf Blöcke

Auf einen Block mit Anker lässt sich aus demselben oder aus anderen Dokumenten verweisen; der Klick springt zum Block:

```markdown
[[Protokoll#^besprechung-1]]
```

Die Seite [Verlinkung](linking.md) beschreibt die Verweis-Syntax im Detail. Über die [Perspective-Abfrage](frontmatter-query.md) lassen sich Blöcke zudem nach ihren Eigenschaften abfragen (Scope-Zusatz `BLOCKS`).

## Speicherort und Grenzen

Die Eigenschaften liegen in einer eigenen Sektion der `.mdd`-Begleitdatei und reisen mit, wenn Dokument und Begleitdatei zusammen kopiert oder verschoben werden; das **Umbenennen innerhalb der App** nimmt die Begleitdatei automatisch mit. Der Anker ist die alleinige Identität: Ändert sich der Block-Inhalt, bleiben die Daten dem Anker zugeordnet.

Zwei Grenzen sind zu kennen. Andere Markdown-Programme kennen die Kopplung an die Begleitdatei nicht: Wird der Text außerhalb der App umgebaut und verschwinden dabei Anker, laufen die betroffenen Daten in den Verwaisten-Abschnitt (nichts geht still verloren). Und wird ein Block in eine **andere Datei** verschoben, wandern seine Eigenschaften nicht automatisch mit, denn die Begleitdatei ist dokument-gebunden; in der Ziel-Datei werden sie neu angelegt, in der Quell-Datei bleiben sie als verwaiste Daten zum Aufräumen zurück.
