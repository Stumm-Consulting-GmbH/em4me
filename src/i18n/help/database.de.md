# Datenbank

Eine Markdown-Datei kann erklären, dass sie eine **Datenbank-Tabelle** ist, und benennen, welche Felder diese Tabelle hat. Die Definition steht im Frontmatter derselben Datei, die auch die Datensätze trägt; damit ist die Tabelle in einer Datei vollständig und übersteht jede Datei-Operation, auch das Umbenennen und Verschieben außerhalb der Anwendung.

Abgrenzung: Die [Perspective Datatable](datatable.md) ist eine typisierte Tabelle **innerhalb eines Dokuments** für kleine, rechenbare Bestände, die Datenbank-Tabelle dagegen eine benannte Tabelle **mit eigener Datei**, auf deren Datensätze aus anderen Dateien verwiesen wird.

Das Definitions-Format ist dasselbe wie bei den [Eigenschafts-Profilen](property-profiles.md): dieselben Angaben je Feld, dieselbe weiche Linie bei Fehlern. Eine Tabellen-Definition ist trotzdem **kein** Eigenschafts-Profil, und eine Tabellen-Datei erscheint nicht in der Profil-Liste der Einstellungen.

## Die Tabellen-Datei

Der Behälter `db-table` im Frontmatter weist die Datei als Tabelle aus und trägt unter `fields` je einen Eintrag pro Spalte:

```yaml
---
db-table:
  fields:
    - name: titel
      type: string
      label: Titel
      required: true
      options:
        maxLength: 120
    - name: seiten
      type: number
      options:
        decimals: 0
    - name: status
      type: string
      values: [verfügbar, ausgeliehen, vermisst]
      default: verfügbar
    - name: autor
      type: record
      options:
        table: Autoren
  key: titel
  display: titel
  lastId: 42
---
```

Schon die **Anwesenheit** des Schlüssels macht die Datei zur Tabelle, unabhängig davon, ob sein Inhalt brauchbar ist. Eine Tabelle mit einem Tippfehler in der Definition verschwindet also nicht still aus der Datenbank, sondern bleibt eine Tabelle, die einen Fehler meldet.

## Angaben je Spalte

| Angabe | Bedeutung |
| --- | --- |
| `name` | **Pflicht.** Der technische Name der Spalte. Er bleibt sprachneutral, weil er in Verweisen und in der Reihenfolge der Datensätze steht |
| `type` | einer der acht Spalten-Typen unten; ohne Angabe gilt `string` |
| `label` | die Beschriftung für die Anzeige, als Text oder als Zuordnung von Sprache zu Text |
| `required` | `true`, wenn die Spalte einen Wert verlangt |
| `values` | fester Wertebereich als Liste |
| `default` | Vorgabe-Wert der Spalte |
| `options` | typ-eigene Angaben, siehe unten |

Der Name ist die **einzige Pflichtangabe**; jede andere Angabe ist einzeln weglassbar.

## Spalten-Typen

| Typ | Bedeutung |
| --- | --- |
| `string` | Text, der Vorgabe-Typ |
| `multiline` | mehrzeiliger Text |
| `number` | Zahl |
| `boolean` | Wahr/Falsch |
| `date` | Datum |
| `time` | Uhrzeit |
| `link` | Verweis auf eine **Datei** |
| `record` | Verweis auf einen **Datensatz** einer anderen Tabelle |

Der Datensatz-Verweis ist der Typ, über den zwei Tabellen in Beziehung treten: Ein `link` zeigt auf eine Datei, ein Datensatz ist aber keine Datei, sondern eine Zeile in einer Tabelle.

**Ein Zwischenstand gilt für beide Verweis-Typen.** Die Anzeige zeigt den Wert einer Spalte vom Typ `link` oder `record` als Text und löst den Verweis nicht auf; er ist dort also nicht anklickbar. Die Auflösung kommt mit einem späteren Ausbau. Unberührt davon ist der Verweis auf einen einzelnen Datensatz, der im Fließtext geschrieben wird und weiter unten einen eigenen Abschnitt hat.

**Drei Dinge sind in einer Tabellen-Spalte ausgeschlossen**, und die Meldung nennt jeweils den Grund statt nur der Tatsache:

- **berechnete Felder** (`formula`, `lookup`) — eine Tabelle trägt keine berechneten Spalten; gerechnet wird in Abfragen über die Daten.
- **strukturierte Werte** (`object`, `objectlist`) — was ein Objekt in einer Zelle ausdrückt, drückt sonst eine abhängige Tabelle über eine Beziehung aus.
- **mehrwertige Spalten** (`multistring` als Typ, `multiple: true` an einem anderen Typ) — eine Mehrfach-Spalte ist eine Beziehung, die sich als Spalte tarnt.

Als Angaben eines **Dokument-Feldes** bleiben alle drei unverändert zulässig; ausgeschlossen sind sie allein in einer Tabellen-Spalte.

## Typ-eigene Angaben

Das Unterobjekt `options` trägt die Angaben, die nur für einen bestimmten Typ gelten. Es sind dieselben wie bei den [Eigenschafts-Profilen](property-profiles.md), erweitert um eine Angabe, die es nur an einer Spalte gibt:

| Typ | Angabe | Bedeutung |
| --- | --- | --- |
| `string` | `maxLength` | Höchstlänge in Zeichen. Ein längerer Wert wird gemeldet und **nicht gekürzt** |
| `number` | `decimals` | erwartete Nachkommastellen, null bis zehn. Ein Wert mit mehr Stellen wird gemeldet und **nicht gerundet** |
| `record` | `table` | Name der Tabelle, auf die der Datensatz-Verweis zeigt |

Höchstlänge und Nachkommastellen stehen im geteilten Angaben-Vorrat und gelten deshalb genauso für gewöhnliche Dokument-Eigenschaften. Beide sind ein **Hinweis am Feld** und ändern den gespeicherten Wert nie.

## Beziehungen zwischen Tabellen

Eine Spalte vom Typ `record` ist eine **Verweis-Spalte**. Ihre Angabe `table` nennt die Ziel-Tabelle mit dem Namen ihrer Datei ohne Endung, ohne Rücksicht auf Groß- und Kleinschreibung, und jede Zelle der Spalte zeigt auf einen Datensatz dieser Tabelle:

```yaml
- name: autor
  type: record
  options:
    table: Autoren
```

In der Zelle darf zweierlei stehen:

- die **Kennung** des Ziels, auch in der Kurzform: `r-00007` und `r-7` zeigen auf denselben Datensatz;
- der **Wert des fachlichen Schlüssels** des Ziels, wenn dieser aus einem einzigen Feld besteht, etwa `Umberto Eco`. Verglichen wird Zeichen für Zeichen, wie beim Schlüssel selbst.

Ein Text in der Form einer Kennung wird immer als Kennung gelesen. Die Schreibweise `[[Autoren#^r-00007]]` des Verweises im Fließtext gehört nicht in die Zelle; dort gilt sie als gewöhnlicher Schlüssel-Wert. Eine leere Zelle ist kein Verweis und wird nicht geprüft; ob sie gefüllt sein muss, sagt `required`.

**Beim Speichern durch die Anwendung wird jeder Verweis geprüft und als Kennung geschrieben.** Die Ziel-Tabelle muss es im Bereich geben, und der Zell-Inhalt muss genau einen Datensatz treffen, der nach der Änderung besteht; ein in derselben Änderung angelegter zählt mit, ein in ihr gelöschter nicht. Trifft er keinen oder mehrere, wird die Änderung abgewiesen. Über den Schlüssel-Wert lässt sich nur auflösen, wenn die Ziel-Tabelle einen einteiligen fachlichen Schlüssel hat; bei einem mehrteiligen ist die Kennung der einzige Weg. Was aufgelöst ist, schreibt die Anwendung als aufgefüllte Kennung in die Zelle, gleich ob dort der Schlüssel-Wert oder die Kurzform stand; ändert sich später der Schlüssel-Wert des Ziels, bleibt der Verweis gültig. Ein Datensatz darf auch auf sich selbst verweisen.

**Ein Datensatz, auf den noch verwiesen wird, lässt sich nicht löschen.** Das gilt für jede Verweis-Spalte des Bereichs, die auf seine Tabelle zeigt, auch für eine in derselben Tabelle, und für Verweise über die Kennung ebenso wie über den Wert eines einteiligen Schlüssels. Die Meldung nennt die verweisende Tabelle, ihre Verweis-Spalten, die Zahl der verweisenden Datensätze und den ersten von ihnen. Die Anwendung löscht nichts mit und leert keinen Verweis. Wer einen Kopf mit seinen Positionen löschen will, löscht beide in **einer** Änderung; ebenso zählt ein Verweis nicht mehr, den dieselbe Änderung auf ein anderes Ziel oder auf leer setzt. Ein Verweis im Fließtext, etwa `[[Autoren#^r-00007]]`, schützt dagegen nicht: Er darf brechen wie ein Verweis auf eine gelöschte Datei.

Beide Prüfungen brauchen die Übersicht über die Tabellen des Bereichs. Sind die Tabellen noch nicht vollständig eingelesen, weist die Anwendung eine Änderung ab, die einen Verweis setzt oder einen Datensatz löscht, und bittet in der Meldung, es gleich noch einmal zu versuchen.

Ausgewertet werden Beziehungen mit einer Datensatz-Abfrage: Ein Pfad wie `autor.name` liest das Feld des verwiesenen Datensatzes, eine Bedingung auf dem Verweis-Feld findet die Gegenrichtung, und `ancestors(…)` und `descendants(…)` folgen Verweisen über beliebig viele Stufen. Wie viele Datensätze auf einen Datensatz zeigen, zählt eine gruppierte Abfrage wie `TABLE RECORDS count() FROM "Ausleihen" GROUP BY buch`. Die Seite [Perspective-Abfrage](frontmatter-query.md) beschreibt beides in den Abschnitten «Datensatz-Ebene» und «Gruppierung und Aggregation».

## Beschriftung in mehreren Sprachen

Die Beschriftung steht am Schlüssel `label`, entweder als einfacher Text oder als Zuordnung von Sprache zu Text:

```yaml
- name: titel
  label:
    de: Titel
    en: Title
    fr: Titre
```

Der Feld-**Name** bleibt davon unberührt: Wäre er übersetzbar, fiele eine weitergegebene Datenbank beim ersten Sprachwechsel auseinander. Ist eine Zuordnung in sich defekt, entfällt die ganze Beschriftung und die Anzeige fällt auf den technischen Namen zurück, statt einige Sprachen zu zeigen und andere still verschwinden zu lassen.

## Datensatz-Kennung, fachlicher Schlüssel und Anzeige-Form

Jeder Datensatz trägt eine **interne Kennung** der Form `r-00042`: das Kennzeichen `r-` für Record und eine Nummer mit mindestens fünf Stellen. Die Breite ist eine Mindest-Breite und keine Grenze; nach `r-99999` folgt `r-100000`. Gelesen werden beide Schreibweisen, `r-42` und `r-00042` bezeichnen denselben Datensatz.

Ein Verweis auf einen Datensatz nennt die Tabelle und die Kennung, geschrieben wie ein Block-Anker: `[[Personen#^r-00042]]`. Was ein solcher Verweis bewirkt und wann er gilt, steht weiter unten im Abschnitt zur Auffindbarkeit.

Drei Angaben der Definition gehören dazu:

| Angabe | Bedeutung |
| --- | --- |
| `lastId` | Hochwasserstand: die höchste je vergebene Nummer der Tabelle. Die nächste Kennung liegt über ihm und über der höchsten Kennung im Bestand, damit die Nummer eines gelöschten Datensatzes kein zweites Mal vergeben wird und auch ohne oder mit zu niedrigem Hochwasserstand keine Kennung doppelt |
| `key` | der fachliche Schlüssel: ein Feld-Name oder eine Liste von Feld-Namen. Optional, weil eine Bewegungs- oder Messwert-Tabelle keinen sinnvollen menschenlesbaren Schlüssel hat |
| `display` | das Feld, mit dem ein Datensatz bezeichnet wird. Ohne Angabe gilt ein einteiliger fachlicher Schlüssel, ohne beides die interne Kennung |

Nennt der fachliche Schlüssel ein Feld, das die Definition nicht kennt, entfällt der **ganze** Schlüssel: Ein halber Schlüssel wäre eine falsche Eindeutigkeits-Zusage.

**Beim Speichern durch die Anwendung bleibt der fachliche Schlüssel eindeutig.** Die Anwendung prüft ihn gegen alle Datensätze der Tabelle, auch die in ihren Folge-Dateien, und weist eine Änderung ab, nach der zwei Datensätze denselben Schlüssel trügen; geschrieben wird dann nichts. Die Meldung unterscheidet drei Lagen:

- Derselbe Schlüssel steht **zweimal in derselben Änderung**.
- Der Schlüssel ist **bereits an einen Datensatz vergeben**. Die Meldung nennt ihn mit Kennung und Anzeige-Form.
- Der Schlüssel ist **im Bestand bereits mehrfach vergeben**. Dann ist zuerst der Bestand zu bereinigen; die Meldung nennt die Datensätze, die ihn tragen.

Ein mehrteiliger Schlüssel gilt erst als doppelt, wenn alle seine Teile übereinstimmen. Ist ein Teil leer, wird der Schlüssel nicht geprüft; ob das Feld gefüllt sein muss, sagt die Angabe `required`. Verglichen wird Zeichen für Zeichen: `Müller` und `MÜLLER` sind zwei verschiedene Schlüssel, und ein führendes Leerzeichen zählt mit. Eine Änderung, die den Schlüssel eines Datensatzes nicht verändert, prüft ihn nicht; ein Datensatz aus einer vorgefundenen Dublette bleibt so in seinen übrigen Feldern änderbar. Löschen und Neuanlegen desselben Schlüssels in einer Änderung ist zulässig, ebenso der Tausch der Schlüssel zweier Datensätze.

## Die Datensätze in der Datei

Die Datensätze stehen im Körper derselben Datei, in einem eigenen Block:

````markdown
```perspective-records
|- id="r-00001"
| Der Name der Rose
| 640
| verfügbar
|- id="r-00002"
| Das Foucaultsche Pendel
| 880
| ausgeliehen
```
````

Die Regeln sind knapp gehalten, weil die Datei technische Ablage ist:

- Eine Zeile, die in **Spalte 0** mit `|-` beginnt, eröffnet einen Datensatz. Dahinter steht seine interne Kennung.
- Eine Zeile, die in Spalte 0 mit `| ` beginnt, eröffnet eine Zelle. Jede weitere Zeile gehört zur laufenden Zelle, ein Wert darf also mehrzeilig sein.
- Es gibt **keine Kopfzeile**. Die Zellen stehen der Reihe nach für die Felder der Definition; die Reihenfolge dort ist der Vertrag.
- Nur Spalte 0 zählt. Eine eingerückte Zeile ist immer Inhalt, auch wenn sie wie ein Marker aussieht.
- Soll eine Zeile selbst mit `|` oder `!` beginnen, wird ihr ein Rückstrich vorangestellt: `\| so beginnt ein Wert mit einem Strich`.

**Es geht nie ein Zeichen verloren.** Hat ein Datensatz zu wenige Zellen, bleiben die übrigen Felder leer; hat er zu viele, bleiben die überzähligen unangetastet stehen. Beides wird gemeldet, aber nichts wird stillschweigend weggeschrieben — das ist der eine Fehler, den ein Datenspeicher nicht machen darf.

## Prüfregeln

Eine Prüfregel legt fest, welche Werte eine Tabelle annimmt. Sie steht in der Definition, an einem von zwei Orten je nach Reichweite:

- **`check` am Eintrag einer Spalte** prüft den einen Wert dieser Spalte.
- **`checks` auf der oberen Ebene des Behälters** ist eine Liste von Bedingungen über mehrere Felder eines Datensatzes.

```yaml
db-table:
  fields:
    - name: plz
      check: '/^\d{4}$/'
    - name: menge
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: Höchstens 100 Stück je Position.
    - name: beginn
      type: date
    - name: ende
      type: date
  checks:
    - rule: ende >= beginn
      message: Das Ende liegt vor dem Beginn.
```

Eine Regel ist ein Text oder ein Objekt `{ rule, message }` mit einem eigenen Meldungstext; am Feld darf auch eine Liste aus beiden Formen stehen. Der Text einer Feld-Regel hat eine von drei Formen:

- Ein **regulärer Ausdruck** steht zwischen Schrägstrichen, dahinter optional Flags, etwa `/^\d{4}$/` oder `/^[a-z]+$/i`. Die Flags `g` und `y` sind ausgeschlossen. Ein Schrägstrich im Muster braucht keinen Rückstrich, weil das Muster bis zum letzten Schrägstrich reicht.
- Ein **einzelnes Wort** ist der Name einer mitgelieferten Regel. Heute kennt die Anwendung noch keine; ein unbekannter Name entfällt mit einem Hinweis.
- **Jeder andere Text** ist eine Bedingung der Abfrage-Sprache, in der der eigene Wert `value` heißt, etwa `value > 0 AND value <= 100`. Ein anderes Feld darf sie nicht nennen; eine Bedingung über mehrere Felder gehört unter `checks`.

Eine Regel unter `checks` ist immer eine Bedingung der Abfrage-Sprache. Sie nennt die Felder mit ihren Namen, ohne Rücksicht auf Groß- und Kleinschreibung.

Verglichen wird wie in jeder Abfrage: eine Zahl als Zahl, ein Datum und eine Uhrzeit chronologisch, auch gegen ein Datum der Form `date(2026-01-01)`, ein Text ohne Rücksicht auf Groß- und Kleinschreibung.

**Eine Falle ist zu kennen.** Die Abfrage-Sprache kennt die Wörter `true`, `false` und `null` nicht; sie liest sie als Feld-Namen, und die Regel entfällt mit einem Hinweis. Ein Wahrheitswert wird mit `value` allein oder mit `NOT value` geprüft, unter `checks` mit dem Feld-Namen allein oder mit `NOT` davor. Ob ein Feld gefüllt ist, sagt `required` und keine Prüfregel.

**Einen leeren Wert prüft keine Feld-Regel**, ebenso wenig einen Wert, der nicht zu seinem Typ passt; den meldet schon die Typ-Prüfung. Die Ausnahme ist der Wahrheitswert: Seine leere Zelle bedeutet «nein», und `value` verlangt deshalb einen gesetzten Haken. Eine Regel unter `checks` wird dagegen immer geprüft; ein Vergleich mit einem leeren Feld ist dann nicht erfüllt. Eine Regel, die sich nicht auswerten lässt, etwa wegen einer Division durch null, gilt als verletzt.

**Beim Speichern durch die Anwendung wirken die Regeln hart.** Geprüft wird der Datensatz, wie er nach der Änderung dastünde, mit allen seinen Feldern und nicht nur den geänderten. Verletzt er eine Regel, wird die Änderung abgewiesen. Die Meldung nennt bei einer Feld-Regel das Feld, den Wert und die Regel, bei einer Regel unter `checks` den Datensatz und die Regel, und sie hängt den Meldungstext an, wenn die Regel einen hat. Das Löschen prüft keine Regel.

**Beim Lesen wirken sie weich.** Ein Wert, der eine Feld-Regel verletzt, wird in der Anzeige gekennzeichnet wie ein Wert, der nicht zu seinem Typ passt; die Zelle zeigt ihren Text unverändert, der Datensatz bleibt sichtbar, und an der Datei ändert sich nichts. Ebenso gekennzeichnet ist eine leere Zelle eines Feldes mit `required`. Regeln unter `checks` wirken beim Lesen nicht, weil sie keine einzelne Zelle haben, die sich kennzeichnen ließe.

## Bedingte Bearbeitbarkeit

Die Angabe `editable` auf der oberen Ebene des Behälters legt fest, unter welcher Bedingung ein Datensatz noch bearbeitet werden darf, etwa damit eine gebuchte Rechnung unverändert bleibt:

```yaml
db-table:
  fields:
    - name: status
      values: [offen, gebucht]
  editable:
    rule: status != "gebucht"
    message: Eine gebuchte Rechnung wird nicht mehr geändert.
```

Die Bedingung ist ein Ausdruck der Abfrage-Sprache über die Feld-Namen der Tabelle, als Text oder als Objekt `{ rule, message }` mit einem eigenen Meldungstext. Eine Tabelle hat genau eine Bedingung; wer mehrere braucht, verknüpft sie im Ausdruck.

Beim Speichern durch die Anwendung gilt:

- Die Bedingung gilt für das **Ändern und das Löschen** eines Datensatzes. Das **Anlegen** bleibt immer frei.
- Gemessen wird am **gespeicherten** Stand des Datensatzes vor der Änderung, nicht an den neuen Werten. Wer den Status in derselben Änderung selbst zurücksetzt, ist deshalb noch gesperrt.
- Ist die Bedingung nicht erfüllt, wird die Änderung abgewiesen. Die Meldung nennt den Datensatz und die Bedingung und hängt den Meldungstext an.
- Eine Bedingung, die sich nicht auswerten lässt, sperrt.
- Eine unbrauchbare Angabe entfällt mit einem Hinweis, und die Tabelle bleibt bearbeitbar.

Ohne die Angabe ist jeder Datensatz bearbeitbar.

**Dieselbe Angabe am Feld.** Ein einzelnes Feld trägt `editable` in seinem eigenen Eintrag und ist dann nur unter dieser Bedingung änderbar; der Datensatz bleibt sichtbar und in seinen übrigen Feldern bearbeitbar:

```yaml
db-table:
  fields:
    - name: buch
      type: record
      editable: false
    - name: frist
      type: date
      editable: NOT erledigt
    - name: erledigt
      type: boolean
```

- Die Bedingung hat dieselbe Form wie an der Tabelle, als Text oder als Objekt `{ rule, message }`, und darf jedes Feld der Tabelle nennen. `false` sperrt das Feld fest, `true` gibt es ausdrücklich frei; beide Wörter gelten nur am Feld, nicht an der Tabelle.
- Sie gilt allein für das **Ändern**. Beim Anlegen ist jedes Feld frei, und das Löschen berührt sie nicht. Gemessen wird wie an der Tabelle am gespeicherten Stand vor der Änderung.
- Ändert ein Speichern den Wert eines gesperrten Feldes, wird es abgewiesen; die Meldung nennt Feld, Datensatz und Regel, bei der festen Sperre die Regel «false». Ein unveränderter Wert in einem gesperrten Feld ist kein Fehler. Ist schon der Datensatz nach der Bedingung der Tabelle gesperrt, steht allein dessen Meldung.
- Beim Bearbeiten in der Maske und in einer Zeile der Listen-Maske bleibt ein gesperrtes Feld lesend, und ein Tooltip sagt, dass es nach der Bedingung der Definition zurzeit nicht änderbar ist. Ist die Bedingung nach einem Speichern erfüllt, ist das Feld beim nächsten Bearbeiten frei.
- Eine unbrauchbare Bedingung entfällt mit einem Hinweis, und das Feld bleibt bearbeitbar.

Bearbeitbarkeit und Berechtigung wirken zusammen und sind doch zweierlei: `editable` hängt am Datensatz und gilt für jeden, die Berechtigung hängt an der Rolle (Abschnitt «Berechtigungen»).

## Anzeige der Datensätze

In der Lese-Ansicht und im Änderungs-Modus erscheint der Block als Tabelle mit den Spalten der Definition. Jeder Wert wird nach dem Typ seiner Spalte dargestellt: Zahlen rechtsbündig und mit den erklärten Nachkommastellen, Wahrheitswerte als Haken, mehrzeilige Werte mit ihren Umbrüchen. Passt ein Wert nicht zu seinem Typ, zeigt die Zelle ihren ursprünglichen Text und wird farblich gekennzeichnet, statt ersetzt zu werden.

Ab **2000 Datensätzen** zeigt die Anzeige einen Ausschnitt und schreibt darunter, wovon er einer ist. Das ist ein Fenster und keine stille Kappung: Sie sehen, dass mehr da ist. Die Grenze ist gemessen und nicht gesetzt — bis dahin erscheint die Tabelle ohne merkliche Wartezeit.

Beim **portablen Export** steht die Tabelle dagegen vollständig, ohne Fenster. Eine Datei, die Sie weitergeben, darf nichts verschweigen: Der Empfänger hat die Anwendung nicht und sähe nicht, dass etwas fehlt.

Bearbeitet werden Datensätze nicht in dieser Ansicht, sondern in ihrer **Maske**, die der nächste Abschnitt beschreibt; die Schaltfläche am Anfang jeder Zeile öffnet sie. Die Tabellen-Datei ist technische Ablage — sie bleibt von Hand lesbar und im Notfall auch von Hand korrigierbar, aber im Regelbetrieb arbeiten Sie nicht in ihr.

## Datensätze in der Maske bearbeiten

Jeder Datensatz hat eine **Maske**: eine eigene Seite, die seine Felder in der Reihenfolge der Definition untereinander zeigt, jedes mit seiner Beschriftung. Die Anwendung erzeugt sie aus der Definition der Tabelle, zu bauen ist nichts. In der Maske legen Sie Datensätze an, ändern und löschen sie.

### Öffnen und neu anlegen

Einen bestehenden Datensatz öffnet die Schaltfläche **«Datensatz öffnen»** am Anfang seiner Zeile, vor der Schaltfläche der Änderungsbelege, in der Lese-Ansicht wie in der Live-Ansicht. Mit der Tastatur führt die Pfeiltaste nach links von der Beleg-Schaltfläche zu ihr.

Aus dem Ergebnis einer Datensatz-Abfrage öffnet ein Klick auf einen Datensatz oder auf einen Verweis die Maske ebenso (Seite [Perspective-Abfrage](frontmatter-query.md)). Sie zeigt dabei den gespeicherten Stand, auch wenn die Abfrage einen ungespeicherten anzeigt. In einer Listen-Maske öffnet der Klick die Maske, die sie nennt (Abschnitt «Listen-Maske»). Ebenso öffnen ein Verweis auf einen Datensatz im Text eines Dokuments (Abschnitt «Verweis auf einen einzelnen Datensatz») und ein Datensatz-Treffer der Suche über den Bereich (Abschnitt «Auffindbarkeit: Suche und Verweise») die Maske.

Einen neuen Datensatz legen drei Wege an:

- die Schaltfläche **«Neuer Datensatz»** unter jeder Tabelle, auch unter einer leeren,
- die Schaltfläche **«Neuer Datensatz»** in der Zeile jeder Tabelle in der Übersicht der Datenbank,
- das Kommando **«Neuer Datensatz in der aktiven Tabelle»** in der Kommando-Palette. Es wirkt auf das aktive Dokument, wenn es eine Tabellen-Datei ist; ist es keine, sagt die Statuszeile das.

Die Maske öffnet als eigene Ansicht, deren Titel Datei und Datensatz nennt. Es gibt sie einmal je Fenster: Öffnen Sie einen anderen Datensatz, zeigt dieselbe Ansicht ihn. Ist die laufende Bearbeitung noch nicht gespeichert, fragt die Maske vorher, ob sie verworfen werden soll.

Ein neuer Datensatz bekommt seine interne Kennung schon beim Öffnen der Maske: Sie steht im Kopf, und der Hochwasserstand `lastId` der Tabelle ist bereits fortgeschrieben. Die Felder stehen leer da, und in die Datei kommt der Datensatz erst mit dem ersten Speichern.

### Lesen und bearbeiten

Die Maske öffnet **lesend**. Die Werte stehen als Text da, ein Wahrheitswert als Haken, und ein Pflichtfeld ist als solches gekennzeichnet. Im Kopf stehen die Aktionen **«Bearbeiten»**, **«Löschen»** und **«Belege»**; die letzte öffnet die Änderungsbelege des Datensatzes.

Dahinter steht der Handgriff **«Im Tabellen-Dokument zeigen»**. Er öffnet die Tabellen-Datei und bringt die Zeile des Datensatzes in den Blick, auch wenn er in einer Folge-Datei steht: In der Lese-Ansicht rollt die Anzeige zu seiner Zeile, sofern er unter den 2000 Datensätzen ist, die sie zeigt; in der Live- und der Quellcode-Ansicht steht die Schreibmarke auf ihr. Bei einer Neuanlage fehlt der Handgriff, weil der Datensatz noch nicht in der Datei steht.

**«Bearbeiten»** macht aus jedem Feld eine Eingabe in der Form seines Typs:

| Typ | Eingabe |
| --- | --- |
| `string`, `link`, `record` | einzeilige Texteingabe, beim `record` mit Wertehilfe |
| `multiline` | mehrzeilige Texteingabe |
| `number`, `date`, `time` | Eingabe für Zahl, Datum oder Uhrzeit |
| `boolean` | Kontrollkästchen |

Ein Wert, der nicht zu seinem Typ passt, bekommt stattdessen die einfache Texteingabe, damit Sie sehen und berichtigen können, was in der Datei steht; eine Zahleneingabe verwürfe ihn sonst stillschweigend.

**«Speichern»** schreibt die Änderung und kehrt ins Lesen zurück, **«Verwerfen»** kehrt ohne zu schreiben zum gelesenen Stand zurück. Geschrieben werden allein die Felder, die Sie geändert haben. Haben Sie nichts geändert, gibt es nichts zu speichern, und die Statuszeile sagt das.

Ist ein Datensatz nach der Bedingung seiner Tabelle nicht bearbeitbar, fehlen **«Bearbeiten»** und **«Löschen»**, und ein Satz in der Maske nennt den Grund, mit dem Meldungstext der Bedingung, wenn sie einen hat. Erlaubt Ihre Rolle das Ändern nicht, fehlt «Bearbeiten», und der Satz nennt die Rolle; erlaubt sie das Löschen nicht, fehlt «Löschen» (Abschnitt «Berechtigungen»).

### Verweis-Felder und Wertehilfe

Ein Feld vom Typ `record` zeigt beim Lesen die Anzeige-Form seines Ziels und dessen Kennung, etwa `Umberto Eco (r-00007)`, auch wenn in der Datei die Kurzform `r-7` steht. Trifft der Wert keinen Datensatz der Ziel-Tabelle eindeutig, sagt ein Hinweis am Feld das.

Beim Bearbeiten bietet das Feld eine **Wertehilfe** an: eine Liste der Datensätze der Ziel-Tabelle, je mit Anzeige-Form und Kennung. Tippen grenzt die Liste ein, eine Auswahl trägt die Kennung ein, und die Escape-Taste schließt die Liste. Passen mehr als fünfzig Einträge, sagt die Liste, wie viele weitere es gibt.

Auswählen müssen Sie nicht. Eine von Hand eingetragene Kurzform der Kennung oder ein Wert des einteiligen fachlichen Schlüssels bleibt stehen, und beim Speichern schreibt die Anwendung an seine Stelle die aufgefüllte Kennung, wie im Abschnitt «Beziehungen zwischen Tabellen» beschrieben. Nennt die Definition keine Ziel-Tabelle oder gibt es sie nicht, lässt sich das Feld nur lesen.

### Meldungen und Änderungen durch andere

Weist die Anwendung eine Änderung ab, wird nichts geschrieben; die Maske bleibt im Bearbeiten, und Ihre Eingaben bleiben stehen. Jede Meldung steht dort, wo sie hingehört. Betrifft sie ein Feld, steht sie an ihm, das Feld ist markiert, und das erste betroffene Feld bekommt den Fokus. Eine verletzte Regel unter `checks` markiert alle ihre Felder und steht im Kopf der Maske, ebenso jede Meldung, die keinem Feld gehört, etwa die des Lösch-Schutzes.

Schon beim Lesen kennzeichnet die Maske einen Wert, der nicht zu seinem Typ passt, eine Feld-Regel verletzt oder als Pflichtwert fehlt, mit einer Meldung am Feld.

Hat jemand den Datensatz geändert, seit die Maske ihn gelesen hat, etwa von Hand in der Tabellen-Datei, speichert die Anwendung zunächst nicht. Die Maske zeigt dann den Block **«Der Datensatz wurde inzwischen geändert»** mit zwei Wegen:

- **«Neu laden»** verwirft Ihre Bearbeitung und zeigt den vorgefundenen Stand.
- **«Trotzdem speichern»** schreibt Ihre Fassung. Den vorgefundenen Unterschied hält ein Änderungsbeleg der Art **Von außen geändert** fest, sodass nichts unbemerkt verschwindet.

Auch der zweite Weg prüft alle Regeln der Tabelle; eine Regel lässt sich mit ihm nicht umgehen.

### Löschen

**«Löschen»** fragt zuerst zurück: **«Soll dieser Datensatz gelöscht werden?»** Mit **«Ja, löschen»** wird er gelöscht, und die Maske schließt sich; **«Nein»** lässt alles stehen. Ein Datensatz, auf den noch eine Verweis-Spalte zeigt, lässt sich auch hier nicht löschen. Welche Datensätze auf ihn verweisen, zeigt vorab der Verwendungsnachweis weiter unten.

### Die Maske als Datei

Die erzeugte Maske lässt sich gestalten. Der Handgriff **«Maske als Datei speichern»** im Kopf der Maske schreibt sie als gewöhnliches Dokument neben die Tabellen-Datei, unter deren Namen mit dem Zusatz ` Form`, zu `Kunden.md` also `Kunden Form.md`. Eine vorhandene Datei dieses Namens wird nie überschrieben. Die neue Datei beginnt mit der erzeugten Fassung:

```markdown
---
title: Kunden Form
db-form:
  table: Kunden
---

# Kunden

**Name:** {{field:Name}}

**Menge:** {{field:Menge}}
```

Der Behälter `db-form` nennt die Tabelle, und je Feld steht ein **Feld-Platzhalter** `{{field:<Name>}}` im Text. Um die Platzhalter herum ist alles gewöhnliches Markdown: Eine Überschrift zwischen zwei Feldern oder ein erklärender Satz erscheint in der Maske so, wie er in der Datei steht. Ein Rückstrich vor den geschweiften Klammern macht einen Platzhalter zu gewöhnlichem Text.

**Zwei Bedeutungen von `table`.** Im Frontmatter der Datenbank, im Behälter `db-form` wie in der Angabe `options.table` einer Verweis-Spalte, nennt `table` eine Datenbank-Tabelle. In einem Block der [Perspective Datatable](datatable.md) gibt die Zeile `table:` dagegen dieser Datentabelle selbst einen Namen, unter dem Diagramme und Verweise sie erreichen. Gleich ist allein das Wort: Eine Datentabelle ist keine Datenbank-Tabelle.

Beim nächsten Öffnen zeigt die Maske den Text der Datei. Im Kopf steht dann, aus welcher Datei die Maske stammt, und der Handgriff entfällt; die Übersicht der Datenbank nennt die Datei in der Spalte **«Maske»**. Wird die Datei gelöscht, zeigt die Maske wieder die erzeugte Fassung.

**Gezeigt wird, was die Datei nennt.** Ein Feld, das die Datei nicht nennt, zeigt die Maske nicht, und beim Speichern bleibt es unberührt; eine Neuanlage füllt nur die genannten Felder. Ein Platzhalter, der weder Feld- noch Wert-Platzhalter ist, und ein Feld-Name, den die Tabelle nicht kennt, bleiben als Text stehen und werden gemeldet, wie im Abschnitt «Fehlerhafte Angaben» beschrieben.

Der **Wert-Platzhalter** `{{value:<Ausdruck>}}` zeigt einen Wert, den die Maske aus den Feldern des gezeigten Datensatzes rechnet, etwa `{{value:menge * preis}}` für den Betrag einer Position oder `{{value:lent + dur(14 days)}}` für das Datum vierzehn Tage nach dem Feld `lent`. Der Ausdruck ist einer der [Abfrage-Sprache](frontmatter-query.md), wie in einer Prüfregel: Felder nennt er mit ihrem Namen, ein Datums-Feld rechnet als Datum, und es gelten dieselben Rechenarten und Funktionen. Der Wert erscheint wie in einer Tabellen-Abfrage, eine Zahl etwa als `7.5`, ein Datum als `2026-10-15`, eine Dauer als `10d` und ein Wahrheitswert als `true` oder `false`. Beim Bearbeiten rechnet die Maske ihn mit jeder Eingabe neu, ohne dass gespeichert wird. Gespeichert wird der Wert selbst nie; er ist kein Feld des Datensatzes.

Ergibt der Ausdruck für einen Datensatz keinen Wert, etwa weil ein Feld leer ist, bleibt die Stelle leer und ist markiert; ein Tooltip sagt das, und gemeldet wird nichts. Ein ungültiger Ausdruck, etwa mit einem Tippfehler, lässt die Stelle ebenso leer und wird mit seiner Zeile im Kopf der Maske gemeldet; die übrige Maske bleibt bedienbar.

**Der Wert steht im Satz**, wenn der Platzhalter innerhalb einer Textzeile steht: `Fällig am {{value:lent + dur(14 days)}}` zeigt «Fällig am 2026-10-15» in einer Zeile. Steht der Platzhalter allein auf seiner Zeile, bekommt der Wert eine eigene Zeile. Ein Feld-Platzhalter steht immer auf eigener Zeile.

**Bedingte Bereiche.** Ein Abschnitt zwischen den Markern `{{when:<Bedingung>}}` und `{{end}}` erscheint nur, wenn die Bedingung zutrifft. Beide Marker stehen allein auf ihrer Zeile; ein Bereich umfasst damit ganze Absätze, Überschriften, Tabellen, Listen und die Platzhalter darin, nie halbe Zeilen. Die Bedingung ist ein Ausdruck der [Abfrage-Sprache](frontmatter-query.md) über die Felder des gezeigten Datensatzes, wie eine Prüfregel: `{{when:onloan}}` zeigt den Abschnitt bei einem verliehenen Buch, `{{when:pages > 500}}` bei einem dicken. Bereiche dürfen ineinander liegen; ein innerer erscheint nur, wenn auch der äußere erscheint. Beim Bearbeiten erscheint und verschwindet ein Bereich mit jeder Eingabe, ohne Speichern; im Lesen gilt der gespeicherte Stand.

```markdown
**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

**Loan note:** {{field:loanNote}}
{{end}}
```

**Die Bedingung wirkt allein auf die Anzeige, nie auf den Wert.** Ein Feld in einem verborgenen Bereich behält seinen Inhalt und wird mitgespeichert; die Bedingung nimmt es weder vom Speichern noch von den Prüfregeln aus. Weist eine Regel ein solches Feld ab, steht die Meldung im Kopf der Maske und nennt das Feld; der Bereich bleibt verborgen. Einen Sonst-Zweig und Schleifen gibt es nicht: Ein Gegenfall entsteht als zweiter Bereich mit der verneinten Bedingung, etwa `{{when:NOT onloan}}`. Ein Rückstrich vor den Klammern macht auch einen Marker zu gewöhnlichem Text.

**Verweis-Pfade.** Wert-Platzhalter und Bedingung lesen über ein Verweis-Feld auch die Felder des verwiesenen Datensatzes: In einer Maske der Ausleihen zeigt `{{value:book.title}}` den Titel des ausgeliehenen Buchs, und `{{when:book.onloan}}` zeigt einen Abschnitt, solange das Buch als verliehen markiert ist. Vor dem Punkt steht das Verweis-Feld, dahinter ein Feld der Ziel-Tabelle. Einen solchen Pfad rechnet die Anwendung nach einer kurzen Verzögerung, und bis zur Antwort bleibt der vorige Wert stehen; beim Bearbeiten folgt er jeder Eingabe, auch der Wahl eines anderen Verweises, ohne Speichern. Ist der Verweis leer oder trifft er keinen Datensatz, bleibt die Stelle leer und markiert, ohne Meldung, und ein Bereich bleibt verborgen. Nennt der Pfad kein Verweis-Feld der Tabelle oder kein Feld der Ziel-Tabelle, bleibt die Stelle ebenso leer, und die Maske meldet ihn mit seiner Zeile im Kopf.

**Positionen.** Der Platzhalter `{{list:<Abfrage-Datei>}}` zeigt in der Maske die Datensätze einer anderen Tabelle, die auf den gezeigten verweisen, und speichert sie mit ihm zusammen; der Abschnitt «Positionen in der Maske» beschreibt ihn.

**Masken-Datei und Vorlage.** Eine Masken-Datei sieht aus wie eine [Vorlage](templates.md), weil beide ihre Platzhalter in doppelten geschweiften Klammern schreiben, und tut doch etwas anderes. Eine Vorlage wird einmal angewendet: `{{date}}` wird beim Anlegen einer Datei durch das Datum ersetzt, danach steht dort Text. Eine Masken-Datei wird nie angewendet: `{{field:Name}}` und `{{value:menge * preis}}` löst die Maske bei jeder Anzeige gegen den gezeigten Datensatz auf, und die Datei behält ihre Platzhalter. Eine Masken-Datei gehört deshalb neben ihre Tabelle und nicht in den Vorlagen-Ordner.

### Nach dem Neustart

Ist die Sitzungs-Wiederherstellung eingeschaltet (Hilfe → Sitzung wiederherstellen) und die Maske beim Beenden geöffnet, kehrt sie beim nächsten Start zurück: an ihre Stelle unter den geöffneten Dokumenten ihrer Spalte, mit demselben Datensatz in derselben Masken-Datei. War sie in ihrer Spalte das gezeigte Dokument, ist sie es wieder. Eine noch nicht gespeicherte Neuanlage kehrt nicht zurück. Der Weg für «Zurück» beginnt nach dem Neustart neu.

**Fehlt der Datensatz inzwischen**, etwa weil er zwischen Beenden und Neustart gelöscht wurde, verschwindet die Maske nicht. Sie zeigt den Hinweis, dass der Datensatz in seiner Tabelle nicht mehr vorhanden ist und die Maske geöffnet bleibt, bis Sie sie schließen, und trägt im Kopf den Handgriff **«Tabelle öffnen»**, der die Tabellen-Datei öffnet.

**Ist die Datenbank beim Start abgeschaltet**, kehrt die Maske nicht zurück, ihr Eintrag geht aber nicht verloren: Er ruht und bleibt auch über weitere Neustarts erhalten. Nach dem Einschalten kehrt die Maske mit dem nächsten Start an ihre Stelle zurück. Trug ihre Spalte nichts als die Maske, kehrt sie in die verbleibende Spalte zurück, hinter deren Dokumente.

### Mehrere Masken und die Standard-Maske

Eine Tabelle kann mehrere Masken-Dateien haben, etwa eine ausführliche und eine knappe. Welche beim Öffnen eines Datensatzes erscheint, die **Standard-Maske**, legt die Angabe `form` in der Tabellen-Definition fest, mit dem Namen der Masken-Datei ohne Endung, wie das Ziel eines Wiki-Links:

```yaml
db-table:
  form: Kunden Form
  fields:
    - name: Name
      type: string
```

Ohne die Angabe gilt die erste Masken-Datei der Tabelle nach Pfad, und gibt es keine, die erzeugte Maske; eine einzelne Masken-Datei wirkt also ohne jede Angabe. Die übrigen Masken-Dateien bleiben Masken der Tabelle: Ein Link aus einer Maske führt in sie, wie der nächste Abschnitt beschreibt.

In der Übersicht der Datenbank nennt die Spalte **«Maske»** die Standard-Maske jeder Tabelle und dahinter die Zahl der weiteren Masken-Dateien, etwa «+1 weitere». Wird die Standard-Maske gelöscht oder umbenannt, ohne dass die Angabe nachgezogen wird, meldet die Übersicht das, und es gilt wieder die Regel ohne Angabe.

### Zwischen Masken wechseln

Ein Link im Text einer Masken-Datei, als Wiki-Link wie `[[Kunden Kurz]]` oder als Markdown-Link, wirkt in der Maske nach seinem Ziel:

- Ist das Ziel eine **andere Masken-Datei derselben Tabelle**, zeigt die Maske denselben Datensatz in dieser Maske.
- Ist das Ziel die **Masken-Datei einer anderen Tabelle**, sagt ein Satz unter dem Kopf, dass dafür ein Datensatz fehlt; geöffnet und angelegt wird nichts.
- Ist das Ziel ein **Datensatz**, als Wiki-Link wie `[[Kunden#^r-00002]]`, zeigt die Maske diesen Datensatz in der Standard-Maske seiner Tabelle. Trifft der Verweis keinen Datensatz eindeutig, öffnet er die Tabellen-Datei; ein Markdown-Link auf eine Tabellen-Datei öffnet sie als Dokument.
- **Jeder andere Link** öffnet sein Dokument, wie überall in der Anwendung.

Ein gefülltes **Verweis-Feld** ist im Lesen anklickbar: Ein Klick öffnet den verwiesenen Datensatz in der Standard-Maske seiner Tabelle. Trifft der Wert keinen Datensatz, sagt das ein Satz unter dem Kopf, und die Maske bleibt, wo sie ist. Ein leeres Verweis-Feld ist nicht anklickbar, und im Bearbeiten bleibt das Feld die Eingabe mit Wertehilfe.

Jeder Wechsel über einen Link, ein Verweis-Feld, einen Datensatz-Verweis im Text oder «Verwendet von» merkt sich den Datensatz, von dem er kam. **«Zurück»** über der Überschrift im Kopf führt zu ihm in seiner Maske zurück, auch über mehrere Schritte; ohne vorigen Schritt erscheint die Schaltfläche nicht. Öffnen Sie einen Datensatz von außen, etwa aus seiner Zeile oder aus der Übersicht, beginnt der Weg neu, und das Schließen der Maske beendet ihn. Ist die Bearbeitung nicht gespeichert, fragt die Maske vor jedem Wechsel, auch vor «Zurück»: **«Verwerfen»** wechselt, **«Weiter bearbeiten»** bleibt mit allen Eingaben stehen.

## Speichern durch die Anwendung

Angelegt, geändert und gelöscht werden Datensätze in der Maske, die der Abschnitt oben beschreibt. Sie speichert über einen Weg der Anwendung, der für jede Änderung an Datensätzen derselbe ist; was dieser Abschnitt beschreibt, gilt deshalb für jede von ihnen.

Jede Änderung läuft durch einen Weg, der sie vor dem Schreiben prüft. Ein Wert, der nicht zum Typ seines Feldes passt, wird ebenso abgewiesen wie ein leeres Feld, das einen Wert verlangt. In beiden Fällen wird nichts geschrieben.

Dazu kommen die Regeln aus der Definition der Tabelle, die in den Abschnitten oben beschrieben sind. Eine Änderung wird auch abgewiesen, wenn

- die eigene **Rolle** die Operation an der Tabelle nicht erlaubt (Abschnitt «Berechtigungen»),
- danach ein **fachlicher Schlüssel** doppelt vergeben wäre,
- ein **Verweis** keinen oder mehr als einen Datensatz trifft oder seine Ziel-Tabelle fehlt,
- ein Datensatz gelöscht werden soll, auf den noch **verwiesen** wird,
- ein Wert oder ein Datensatz eine **Prüfregel** verletzt,
- ein **Feld** geändert wird, das nach seiner eigenen Bedingung gesperrt ist,
- ein Datensatz nach der Bedingung seiner Tabelle **nicht bearbeitbar** ist oder
- die Tabellen des Bereichs **noch nicht vollständig eingelesen** sind und die Änderung einen Verweis setzt oder einen Datensatz löscht.

Die Gründe aus diesen Regeln meldet die Anwendung gesammelt, nicht nur den ersten.

**Ein Speichervorgang wirkt ganz oder gar nicht**, auch wenn er mehrere Tabellen und mehrere Dateien berührt: Danach stehen entweder alle seine Änderungen da oder keine. Seine Änderungsbelege schreibt er im selben Vorgang, und alle Belege eines Vorgangs tragen dieselbe **Vorgangs-Kennung**.

Bevor die neuen Fassungen der Dateien wirksam werden, schreibt die Anwendung sie auf den Datenträger durch. Ein Stromausfall oder eine abreißende Netzverbindung hinterlässt deshalb keinen halben Vorgang. (Unter Linux gilt das mit einer Einschränkung: Dort schreibt die Anwendung die Ordner-Einträge nicht eigens durch, sodass ein Stromausfall genau im Augenblick des Speicherns den Vorgang bis zum nächsten Öffnen des Bereichs liegen lassen kann.) Das kostet Zeit: Ein Speichervorgang dauert auf einer lokalen Platte etwa eine Zehntelsekunde, auf einem Netzlaufwerk eine Viertel- bis eine halbe Sekunde.

Wer gleichzeitig liest, während ein Speichervorgang läuft, kann einen Zwischenstand sehen, etwa den Kopf einer Rechnung ohne ihre Positionen. Das ist ein bekannter und bewusst hingenommener Fall.

Bleibt ein Speichervorgang durch einen Absturz liegen, schreibt die Anwendung ihn beim nächsten Speichern in diesem Bereich oder beim Öffnen des Bereichs zu Ende. Bis dahin nehmen die betroffenen Tabellen keine Änderungen an und sagen das in einer Meldung. Verloren geht dabei nichts.

## Änderungsbelege

Wer einen Datensatz über die Anwendung anlegt, ändert oder löscht, hinterlässt eine Spur: Neben der Tabellen-Datei führt die Anwendung eine zweite Datei, in der jede dieser Änderungen als **Änderungsbeleg** steht. Sie beantwortet die Frage, wer wann welches Feld von welchem auf welchen Wert geändert hat.

### Was sie sind und wo sie liegen

Zur Tabellen-Datei `Kunden.md` gehört die Datei `Kunden.mddl` im selben Ordner. Die Anwendung legt sie an und schreibt sie fort; Sie brauchen dafür nichts zu tun, und Sie sollen an ihr nichts tun.

Fünf Eigenschaften sind zu kennen:

- Sie **erscheint in keiner Dateiliste** der Anwendung und lässt sich nicht als Dokument öffnen. Sie ist technische Ablage neben der Tabelle.
- Sie wird **nur fortgeschrieben** und nie umgeschrieben. Ein geschriebener Beleg bleibt Zeichen für Zeichen stehen; der einzige Vorgang, der an ihm rührt, ist die Verdichtung weiter unten.
- Sie **zieht mit**, wenn Sie die Tabellen-Datei in der Anwendung umbenennen oder verschieben, und geht beim Löschen mit ihr in den Papierkorb des Betriebssystems. Von dort holen Sie beide gemeinsam zurück.
- Wer sie **von Hand ändert oder löscht**, verliert die Spur unwiederbringlich. Es gibt keine zweite Ablage, aus der sie sich wiederherstellen ließe.
- Alle Belege eines Speichervorgangs tragen **dieselbe Vorgangs-Kennung**. So bleibt in der Datei erkennbar, dass mehrere Änderungen zusammengehören, etwa der Kopf einer Rechnung und ihre Positionen.

### Die Ansicht am Datensatz

In der Lese-Ansicht und in der Live-Ansicht trägt jede Datensatz-Zeile an ihrem Anfang eine Schaltfläche **«Änderungsbelege anzeigen»**. Ein Klick darauf öffnet die Seite **«Änderungsbelege»** als eigene Ansicht. Ohne Maus führt der Tabulator in die Tabelle, die Pfeiltasten wechseln die Zeile, Pos1 und Ende führen zur ersten und zur letzten, und die Eingabe- oder die Leertaste öffnet die Seite.

Die Seite zeigt die Belege des Datensatzes, den **jüngsten zuerst**. Je Beleg stehen der Zeitpunkt in Ihrer Zeitzone, die Art (**Angelegt**, **Geändert**, **Gelöscht**), der Benutzer, der Rechner und je berührtem Feld der Wert **Vorher** und **Nachher**. Ein fehlender Wert steht als «nicht vorhanden» da, ein leerer als «leer»; beides ist nicht dasselbe.

Zwei Arten sind eigens gekennzeichnet:

- **Von außen geändert** heißt, dass die Anwendung beim nächsten eigenen Schreibvorgang einen Unterschied vorgefunden hat, den sie nicht selbst verursacht hat. Ein Urheber ist dann nicht bekannt, und der Beleg sagt das.
- **Zusammengefasst** heißt, dass die Verdichtung eine Spanne mehrerer Änderungen zu einem Beleg zusammengezogen hat. Er nennt, wie viele Änderungen er ersetzt, seit wann die Spanne reicht und welche Arten in ihr lagen.

Bricht die Spur, sagt die Seite es an der Stelle, an der es auffällt. Dafür gibt es zwei Lagen. Der vorherige Wert eines Feldes **weicht ab**, dann schließt der Beleg nicht an seinen Vorgänger an. Oder ein Beleg ist **nicht lesbar**, dann ist unbekannt, was er geändert hat, und die Prüfung setzt hinter ihm neu an. Ist die ganze Datei nicht lesbar, meldet die Seite auch das und lässt ihren Inhalt unberührt.

Die Seite **liest nur**, geändert wird in ihr nichts; die Schaltfläche «Aktualisieren» holt den Stand neu. Bei sehr vielen Belegen zeigt sie einen Ausschnitt und schreibt darüber, wovon er einer ist.

### Die Verdichtung

Eine Beleg-Datei wächst mit jeder Änderung. Damit sie nicht unbegrenzt wächst, fasst die Anwendung ab einer Doppelschwelle die ältesten Belege viel geänderter Datensätze zusammen, statt sie zu löschen. Ohne eigene Angabe gelten **0,7 MB** für die ganze Datei und **200 Belege je Datensatz**.

Beide Grenzen lassen sich je Tabelle setzen, im Frontmatter der Tabellen-Datei unter der Angabe `changeLog`:

```yaml
---
db-table:
  fields:
    - name: titel
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` ist die Größe der Beleg-Datei in Byte, `maxPerRecord` die Zahl der Belege je Datensatz. Das Wort `unlimited` schaltet die jeweilige Grenze ab. Jede Angabe steht für sich, eine weggelassene behält ihre Vorgabe, und eine unbrauchbare wird als Fehlerlage gemeldet, worauf ebenfalls die Vorgabe gilt.

**Die Verdichtung hat einen Preis.** Ein zusammengefasster Beleg sagt, von welchem auf welchen Wert eine Spanne geführt hat, wie viele Änderungen sie ersetzt und ob ein Anlegen oder ein Löschen darin lag. Er sagt nicht mehr, wer wann was einzeln geändert hat; dieser Teil der Spur ist danach fort. Eine Zusage gilt dabei ohne Ausnahme: Über einen Beleg der Art **Von außen geändert** wird nie hinweg zusammengefasst. Er beendet die Spanne und bleibt unverändert stehen.

### Die Grenze, ehrlich benannt

Eine Änderung, die Sie von Hand im Editor an der Tabellen-Datei vornehmen, erzeugt **keinen** Beleg. Die Anwendung sieht sie nicht in dem Augenblick, in dem sie geschieht.

Was sie stattdessen tut: Beim nächsten eigenen Schreibvorgang vergleicht sie den vorgefundenen Stand mit dem erwarteten. Weicht er ab, speichert sie die neue Änderung zunächst nicht, damit die aktuelle Fassung angesehen werden kann; wird sie danach dennoch gespeichert, hält ein Beleg der Art **Von außen geändert** den Unterschied fest. Nichts verschwindet damit unbemerkt. Zeitpunkt und Urheber dieser Änderung nennt der Beleg jedoch nicht, weil beides nicht bekannt ist.

**Die Berechtigung schützt auf diesem Weg allein die Definition.** Speichern Sie im Editor der Anwendung eine geänderte Definition, prüft die Anwendung Ihre Rolle (Abschnitt «Berechtigungen»). Eine Änderung am Datensatz-Block prüft sie dort dagegen weder gegen die Rolle noch gegen die Regeln der Tabelle, und mit einem anderen Editor greift keine der beiden Prüfungen.

## Sperren

Eine Sperre sorgt dafür, dass ein Datensatz nicht an zwei Stellen zugleich bearbeitet wird, etwa in zwei Fenstern der Anwendung. Sperren und Änderungsbelege sind so angelegt, dass sie den gemeinsamen Zugriff mehrerer Personen vorbereiten; dieser kommt mit EM4us, der künftigen Server-Komponente. EM4me selbst ist ein Werkzeug für eine Person, die allein und lokal arbeitet. Der Betrieb mehrerer Rechner in einem Bereich auf einem Netzlaufwerk ist nicht zugesichert.

### Was gesperrt wird und wann

Gesperrt wird der einzelne **Datensatz**, und zwar in dem Augenblick, in dem seine Bearbeitung beginnt. Freigegeben wird er, sobald die Bearbeitung endet, beim Speichern ebenso wie beim Verwerfen. Das bloße Ansehen sperrt nichts: Eine Liste mit hunderten Datensätzen sperrte sonst mit jedem Blick alle auf einmal.

In der Maske beginnt die Bearbeitung mit **«Bearbeiten»** oder mit **«Löschen»**, das die Sperre schon vor seiner Rückfrage nimmt. Sie endet mit dem Speichern, mit **«Verwerfen»**, mit **«Neu laden»**, mit dem Abbruch der Lösch-Rückfrage, beim Wechsel zu einem anderen Datensatz und beim Schließen der Maske. Weist die Anwendung ein Speichern ab, bleibt die Sperre bestehen, weil die Bearbeitung weiterläuft. Das Öffnen der Maske und eine Neuanlage sperren nichts. In einer Listen-Maske beginnt die Bearbeitung einer Zeile mit «Bearbeiten», dem Doppelklick oder «Löschen» und endet mit «Speichern», «Abbrechen», der Antwort auf die Lösch-Rückfrage und spätestens, wenn das Dokument geschlossen, die Ansicht gewechselt oder ein anderes geöffnetes Dokument gezeigt wird; eine neue Zeile sperrt nichts. Eine Zeile im Positions-Bereich einer Maske hält ihre Sperre bis zum Speichern oder Verwerfen der Maske.

Wird die **Definition einer Tabelle** geändert, ist für diese Zeit die Definition gesperrt, weil eine Änderung an den Spalten alle Datensätze der Tabelle berührt.

### Wenn ein Datensatz schon gesperrt ist

Die Anwendung überschreibt nie stillschweigend. Sie meldet, **wer** den Datensatz hält, **an welchem Rechner** und **seit wann**, und lässt Ihnen zwei Wege: den Datensatz **nur lesen** oder die Sperre **brechen**.

In der Maske erscheint dieser Bescheid als Block **«Der Datensatz ist gesperrt»**, und die Maske bleibt im Lesen. **«Nur lesen»** schließt den Block. **«Sperre brechen»** steht erst da, wenn die Frist unten abgelaufen ist, und führt nach dem Bruch unmittelbar ins Bearbeiten; hat sich die Sperre inzwischen geändert, wird der Bruch abgewiesen, und der Block zeigt die neu gelesenen Angaben.

Brechen lässt sich eine fremde Sperre erst, wenn sie **älter als vier Stunden** ist. Die Frist ist mit Absicht grob: Die Uhren zweier Rechner dürfen auseinanderlaufen, ohne dass eine laufende Bearbeitung als verwaist erscheint. Auch nach Ablauf der Frist entfernt die Anwendung eine fremde Sperre nie von selbst. Sie bietet den Bruch nur an, und Sie entscheiden. Wessen Sperre gebrochen wurde, erfährt das, sobald die eigene Bearbeitung endet.

**Halter unbekannt.** Liegt eine Sperre vor, die keinen Halter nennt, etwa weil sie beim Anlegen unvollständig geschrieben wurde, sagt der Block genau das, statt Angaben zu erfinden. Auch dann können Sie den Datensatz nur lesen, und brechen lässt sich die Sperre erst nach Ablauf derselben Frist.

Bearbeitet ein **anderes Fenster** dieser Anwendung den Datensatz, sagt der Block auch das. Dort gibt es allein «Nur lesen», weil sich die Sperre eines eigenen Fensters nicht brechen lässt.

### Nach einem Absturz

Bleibt nach einem Absturz der Anwendung eine **eigene** Sperre zurück, steht sie Ihnen nicht im Weg: Die Anwendung erkennt, dass die Sperre von diesem Rechner stammt und das Programm, das sie hielt, nicht mehr läuft, und übernimmt sie ohne Rückfrage. Hält dagegen ein zweites Fenster der Anwendung den Datensatz, gilt er dort als gesperrt wie für jeden anderen.

### Was die Sperre nicht leistet

Eine Sperre ist eine Verabredung unter den Anwendungen, die in diesem Bereich arbeiten, und keine Eigenschaft der Datei. Wer die Tabellen-Datei von Hand im Editor ändert, sieht keine Sperre. Deshalb prüft die Anwendung bei **jedem** Speichern zusätzlich, ob der Datensatz noch so dasteht, wie sie ihn gelesen hat, auch wenn sie die Sperre hält.

### Der Sperr-Ordner

Die Sperren liegen als kleine Dateien in einem Ordner in der Wurzel des Bereichs, in der Vorgabe `.area-locks`. Er entsteht mit der ersten Sperre, und die Anwendung führt ihn: Er erscheint in keiner Dateiliste, nicht in der Suche und nicht in der Statistik. Anders als die Änderungsbelege hält er nichts Bleibendes fest. Arbeitet niemand, ist er leer und darf fehlen. Während eines Speichervorgangs legt die Anwendung dort zusätzlich ein kleines Protokoll des Vorgangs ab, das mit seinem Ende wieder verschwindet; bleibt der Vorgang durch einen Absturz liegen, bleibt das Protokoll stehen, bis die Anwendung den Vorgang zu Ende geschrieben hat. Löschen Sie nichts daraus von Hand, solange jemand arbeitet oder ein Protokoll darin liegt.

Den **Namen des Ordners** ändern Sie unter **Datei → Einstellungen… → Aktueller Bereich → Datenbank** im Feld **«Name des Sperr-Ordners»**. Dabei gilt:

- Der Name gilt **für den Bereich** und damit für alle, die in ihm arbeiten. Er liegt in der Bereichsdatei und reist mit dem Bereichs-Ordner.
- Der Name **muss mit einem Punkt beginnen**, weil die Anwendung genau daran erkennt, dass ein Ordner nicht in Index, Suche und Statistik gehört. Unzulässig sind außerdem Pfad-Trenner, unter Windows verbotene Zeichen und reservierte Gerätenamen wie `CON`, und unter dem Namen darf in der Bereichs-Wurzel noch nichts anderes liegen.
- Die Änderung benennt den bestehenden Ordner um, statt einen zweiten anzulegen. Sie gelingt nur, **solange niemand einen Datensatz in Bearbeitung hat**. Andernfalls nennt die Meldung, wer gerade arbeitet, und es bleibt alles, wie es war.

## Berechtigungen

**Die Berechtigung verhindert Fehlbedienung, nicht Missbrauch.** Sie ist eine Arbeits-Vereinbarung wie die Sperre und keine Zusicherung von Vertraulichkeit. Ein Leserecht gibt es nicht: Wer die Dateien des Bereichs lesen kann, liest sie mit jedem Editor und kann sie dort auch ändern, ohne dass eine Rolle gefragt wird. Durchsetzen lässt sich allein die Grenze des Betriebssystems, also wer auf den Ordner zugreifen darf.

Innerhalb der Anwendung legt die Berechtigung fest, wer was ändern darf. Der Steckbrief führt dafür benannte **Rollen**, und jede Rolle sagt je Tabelle, welche Handgriffe erlaubt sind. Die wichtigste Trennung ist die zwischen dem Pflegen der Daten und dem Ändern der Definition: Wer eine gelieferte Datenbank als Daten-Pfleger bedient, soll ihr Schema nicht versehentlich ändern. Das hilft schon, wenn nur eine Person mit der Datenbank arbeitet.

### Rollen im Steckbrief

Die Rollen stehen unter `roles` im Behälter `db-database`, daneben die Vorgabe-Rolle und die Zuordnung von Anmeldenamen:

```yaml
db-database:
  name: Bibliothek
  roles:
    bibliothekar: all
    aushilfe:
      Bücher: [update]
      Ausleihen: [create, update, delete]
  defaultRole: aushilfe
  users:
    mstumm: bibliothekar
```

Je Rolle steht entweder das Wort `all` oder eine Zuordnung von Tabellen-Namen zu einer Liste der erlaubten Operationen:

| Operation | Bedeutung |
| --- | --- |
| `create` | Datensätze anlegen |
| `update` | Datensätze ändern |
| `delete` | Datensätze löschen |
| `define` | die Definition der Tabelle ändern |

Das Wort `all` gilt in drei Lagen: als Wert einer Rolle für alle vier Operationen an allen Tabellen, als Tabellen-Name für alle Tabellen und als Eintrag einer Liste für alle vier Operationen. Eine Tabelle, die eine Rolle nicht nennt, erlaubt ihr nichts, ebenso eine leere Liste. Operationen und Tabellen-Namen gelten ohne Rücksicht auf Groß- und Kleinschreibung, Rollen-Namen so, wie sie geschrieben sind.

**Ohne `roles` ist alles erlaubt**, wie in einer Datenbank ohne Berechtigung. Die Übersicht der Datenbank zeigt im Steckbrief-Block den Abschnitt **«Rollen»** mit einer Zeile je Rolle und ihren Erlaubnissen je Tabelle. Nennt eine Rolle eine Tabelle, die es nicht gibt, oder eine unbekannte Operation, gilt die ganze Rolle als nicht gesetzt; die Übersicht nennt jeden ihrer Fehler unter den Fehlerlagen.

### Welche Rolle gilt

Unter `users` ordnet der Steckbrief Anmeldenamen eine Rolle zu, und `defaultRole` nennt die **Vorgabe-Rolle** für alle übrigen. Maßgeblich ist der Anmeldename, unter dem Sie am Betriebssystem angemeldet sind, derselbe, den die Änderungsbelege als Benutzer nennen. Er wird Zeichen für Zeichen verglichen: `MStumm` und `mstumm` sind zwei Namen. Eine Pflege-Oberfläche gibt es nicht; die Zuordnung wird von Hand im Steckbrief gepflegt wie die Definition.

Es gilt die erste zutreffende Regel:

1. Ohne Rollen ist alles erlaubt.
2. Steht Ihr Anmeldename unter `users`, gilt die ihm zugeordnete Rolle.
3. Sonst gilt die Vorgabe-Rolle.
4. Ohne Vorgabe-Rolle ist alles erlaubt.

Welche Rolle für Sie gilt, zeigt die Übersicht in der Zeile **«Eigene Rolle»**, mit dem Anmeldenamen wörtlich: die zugeordnete Rolle, die Vorgabe-Rolle oder «alles erlaubt (keine Zuordnung)». Wer eine Zuordnung einträgt, übernimmt den Namen am sichersten von dort. Nennt `users` oder `defaultRole` eine Rolle, die es nicht gibt, gilt diese Angabe als nicht gesetzt und wird ebenfalls gemeldet.

### Geprüft beim Schreiben

Jede Änderung an Datensätzen läuft durch den Weg, den der Abschnitt «Speichern durch die Anwendung» beschreibt, und dort prüft die Anwendung zuerst die Rolle, je Datensatz mit Tabelle und Operation. Fehlt die Erlaubnis, wird der ganze Vorgang abgewiesen, und die Meldung nennt Rolle, Tabelle und Handgriff. Auch das Beginnen eines neuen Datensatzes verlangt `create`: Ohne diese Erlaubnis weist die Anwendung die Neuanlage ab, etwa beim Kommando «Neuer Datensatz in der aktiven Tabelle», und die Statuszeile nennt den Grund. Lassen sich die Berechtigungen nicht feststellen, weil die Tabellen des Bereichs noch nicht vollständig eingelesen sind oder der Steckbrief nicht lesbar ist, wird ebenfalls nichts geschrieben, und die Meldung bittet, es gleich noch einmal zu versuchen.

### Geprüft beim Speichern der Definition

Die Definition ist der Behälter `db-table` einer Tabellen-Datei und der Steckbrief `db-database`. Ändert das Speichern einer Datei ihre Definition, verlangt die Anwendung `define`: an dieser Tabelle für eine Tabellen-Datei, an allen Tabellen für den Steckbrief. Das gilt beim Speichern im Editor, bei **«Speichern unter…»** auf eine bestehende oder eine neue Datei und beim bereichsweiten Ersetzen. Fehlt die Erlaubnis, wird nichts geschrieben. Beim Speichern erscheint der Fehler-Dialog **«Schreibfehler»** mit einem Satz, der Rolle und Tabelle nennt, und der Text bleibt ungespeichert im Editor; das bereichsweite Ersetzen führt die Datei im Bericht unter **«Nicht ersetzt»**.

Frei bleibt, was die Definition nicht berührt: der Datensatz-Block und der übrige Text der Datei, ebenso Masken- und Abfrage-Dateien. Eine andere Einrückung oder eine andere Reihenfolge der Angaben zählt nicht als Änderung, die Reihenfolge der Felder dagegen schon, weil sie die Spalten bestimmt. Den Hochwasserstand `lastId` schreibt die Anwendung selbst fort; er zählt nie als Änderung.

### In Masken und Übersicht

Die Masken bieten nur an, was Ihre Rolle erlaubt; wer eine Maske gestaltet, schreibt dafür nichts in sie hinein.

- In der **Einzel-Maske** fehlt ohne `update` die Aktion «Bearbeiten», die Felder bleiben lesend, und ein Satz nennt die Rolle, die Datensätze dieser Tabelle nicht ändern darf. Ohne `delete` fehlt «Löschen».
- Ohne `create` fehlt die Schaltfläche **«Neuer Datensatz»** unter der Tabelle und in der Zeile der Tabelle in der Übersicht.
- Eine **Listen-Maske** und ein Positions-Bereich bieten nur die Handgriffe an, die `allow` und die Rolle gemeinsam erlauben. Erlaubt `allow` das Ändern und die Rolle nicht, nennt ein Tooltip der Zeile die Rolle; eine Zeile, der kein Handgriff bleibt, erscheint gedämpft.
- Die **Übersicht** nennt unter jeder Tabelle die Erlaubnisse Ihrer Rolle, etwa «Erlaubnisse: anlegen, ändern», sofern der Steckbrief Rollen trägt.

Die Masken zeigen, entschieden wird beim Schreiben: Wer einen Handgriff auf anderem Weg auslöst, wird an der Prüfung oben abgewiesen.

### Sich nicht selbst aussperren

Wer den Steckbrief so ändert, dass die eigene Rolle nicht an allen Tabellen `define` hat, kann ihn danach in der Anwendung nicht mehr ändern, auch nicht zurück. Das ist die beabsichtigte Trennung, trifft aber im Einbenutzer-Betrieb Sie selbst. Drei Wege führen zurück: Sie öffnen die Datei des Steckbriefs mit einem anderen Editor und entfernen oder berichtigen dort die Rollen-Angaben. Sie schalten die Erweiterung «Datenbank» ab, berichtigen den Steckbrief in der Anwendung und schalten sie wieder ein; abgeschaltet prüft das Speichern keine Rolle (Abschnitt «Die Datenbank abschalten»). Oder Sie ordnen, bevor Sie Rollen einschränken, Ihren eigenen Anmeldenamen unter `users` einer Rolle mit `define` an allen Tabellen zu, etwa einer Rolle mit `all`.

### Weitergabe und Anmeldenamen in der Datei

Die Rollen sind Teil der Definition und reisen mit dem Steckbrief. Die Zuordnung unter `users` steht in derselben Datei: Die Anmeldenamen sind dort für jeden lesbar, der die Datei öffnen kann, und eine Kopie des Ordners nimmt sie mit. Eine Weitergabe, die die Zuordnung auslässt, bietet die Anwendung nicht; wer einen Bereich weitergibt, entfernt die Zuordnung vorher, wenn sie nicht mitgehen soll. Beim Empfänger trifft eine Zuordnung nur, wenn sein Anmeldename wörtlich übereinstimmt; sonst gilt für ihn die Vorgabe-Rolle oder, ohne sie, alles erlaubt.

## Konsistenz-Prüfung

Beim Speichern durch die Anwendung wird jede Änderung geprüft. Was auf anderem Weg in die Dateien kommt, etwa von Hand im Editor, prüft dabei niemand, und manche Regeln wirken beim Lesen gar nicht. Die **Konsistenz-Prüfung** sieht deshalb den ganzen Bestand durch und sagt, wo er den Regeln der Datenbank widerspricht.

Sie steht in der Übersicht der Datenbank: **«Konsistenz prüfen»** im Kopf prüft alle Tabellen, **«Prüfen»** in der Zeile einer Tabelle nur diese. Alle Tabellen prüft auch das Kommando **«Konsistenz der Datenbank prüfen»** in der Kommando-Palette; es öffnet dazu die Übersicht.

Das Ergebnis steht im Abschnitt **«Konsistenz-Prüfung»** der Übersicht: die Dauer, je Tabelle die Zahl ihrer Datensätze und Befunde und darunter die Befunde mit Tabelle, Datensatz, Feld und einem Satz im Klartext. Ein Klick auf den Datensatz öffnet seine Maske. Die Liste zeigt höchstens die ersten 500 Befunde und sagt dann, wie viele es insgesamt sind.

Gefunden werden:

- ein fachlicher Schlüssel, der mehrfach vergeben ist, mit einem Befund je beteiligtem Datensatz, und eine Kennung, die mehr als einmal in der Tabelle steht;
- ein Verweis, der keinen Datensatz trifft, der mehrere trifft oder der über einen Schlüssel-Wert auf eine Tabelle mit mehrteiligem Schlüssel zeigt, und eine Verweis-Spalte, deren Ziel-Tabelle fehlt oder nicht angegeben ist;
- ein Wert, der nicht zu seinem Typ passt, eine Feld-Regel verletzt oder als Pflichtwert fehlt, und ein Datensatz, der eine Regel unter `checks` verletzt;
- ein Datensatz mit mehr oder weniger Zellen, als die Tabelle Felder hat;
- in einer Masken-Datei ein unbekanntes Feld, ein unbekannter Platzhalter, ein ungültiger Ausdruck eines Wert-Platzhalters, ein Marker eines bedingten Bereichs ohne Gegenstück, eine ungültige Bedingung oder eine unbekannte Tabelle, und in einer Tabellen-Definition eine Angabe `form`, die keine Masken-Datei dieser Tabelle nennt;
- in einer Masken-Datei außerdem ein Pfad, der kein Verweis-Feld oder kein Feld der Ziel-Tabelle nennt, und ein Positions-Bereich, dessen Abfrage-Datei fehlt oder nicht `editable: true` trägt, dessen Positionen kein oder kein eindeutiges Verweis-Feld auf die Tabelle der Maske haben oder dessen Abfrage sich nicht um die Beziehung ergänzen lässt;
- in einer Abfrage-Datei eine unbrauchbare Angabe im Behälter `db-query`, ein unbekannter Handgriff in `allow` und eine Angabe `form`, die keine Masken-Datei der Datenbank nennt; ein solcher Befund nennt in der Spalte «Quelle» die Datei statt einer Tabelle;
- bei der Prüfung aller Tabellen im Steckbrief eine unbrauchbare Angabe unter `roles`, `defaultRole` oder `users`, etwa eine Rolle mit unbekannter Tabelle oder Operation oder eine Zuordnung auf eine Rolle, die es nicht gibt; den Grund nennt die Übersicht unter den Fehlerlagen;
- als Hinweis eine Tabelle, die Datensätze trägt, aber keinen oder einen zu niedrigen Hochwasserstand `lastId`; die nächste Neuanlage zieht dann über die höchste vorhandene Kennung und hebt ihn an;
- eine Tabelle, deren Definition sich nicht lesen lässt; ihre Datensätze bleiben dann ungeprüft, und die Prüfung geht bei den übrigen Tabellen weiter.

**Die Prüfung ändert nichts.** Sie liest nur, und eine Funktion, die Befunde von selbst aufräumt, gibt es bewusst nicht: Welcher von zwei Datensätzen mit demselben Schlüssel der richtige ist, entscheiden Sie in der Maske. Das Ergebnis bleibt stehen, solange die Übersicht offen ist; nach einer Berichtigung prüfen Sie erneut.

Die Prüfung ist schnell: Bei einigen tausend Datensätzen dauert sie einige Dutzend Millisekunden. Ist der Index des Bereichs noch im Aufbau, sagt sie das und bittet, es gleich noch einmal zu versuchen.

## Verwendungsnachweis

Der **Verwendungsnachweis** sagt, wer eine Tabelle oder einen Datensatz benutzt. Gelesen wird erst, wenn Sie danach fragen, und geändert wird nichts.

**Für eine Tabelle** steht in ihrer Zeile der Übersicht die Aktion **«Verwendung»**. Sie nennt unter «Verwendet von» die Tabellen, die mit einer Verweis-Spalte auf diese Tabelle zeigen, je mit den Namen dieser Spalten, und die Masken-Dateien der Tabelle. Benutzt sie niemand, steht dort «Nicht verwendet».

**Für einen Datensatz** steht im Kopf seiner Maske, solange sie liest, die Aktion **«Verwendet von»**. Sie listet die Datensätze, die auf ihn verweisen, je mit Tabelle, Feld, Anzeige-Form und Kennung; ein Klick öffnet die Maske des verweisenden Datensatzes, und «Zurück» führt zum gezeigten Datensatz zurück. Bei einer Neuanlage fehlt die Aktion, weil auf einen noch nicht gespeicherten Datensatz niemand verweisen kann.

**Die Liste am Datensatz ist die Vorschau des Lösch-Schutzes.** Sie sucht genau so wie die Prüfung beim Löschen, auch über die Kurzform der Kennung, über den Wert eines einteiligen Schlüssels und in den Folge-Dateien einer Tabelle. Steht ein Datensatz darin, lässt sich der gezeigte nicht löschen. Ein Datensatz, der auf sich selbst verweist, erscheint nicht, weil er sein eigenes Löschen nicht verhindert. Wie beim Lösch-Schutz zählt allein die Verweis-Spalte; ein Verweis im Fließtext, etwa `[[Kunden#^r-00001]]`, ist keine Verwendung.

## Auffindbarkeit: Suche und Verweise

Die Suche über den **Bereich** findet Datensätze als eigene Treffer. Im Panel «Suchergebnisse» steht hinter den Gruppen der Dokumente je Tabelle eine eigene Gruppe mit dem Namen der Tabelle und dem Zusatz «Datensätze». Jede Zeile nennt den Datensatz mit seiner Anzeige-Form und das Feld, in dem der Suchbegriff steht, und zeigt dessen Wert mit markiertem Fund. Ein Klick öffnet den Datensatz in der Standard-Maske seiner Tabelle. Durchsucht werden die Feld-Werte aller Dateien einer Tabelle, auch ihrer Folge-Dateien, und bei einer geöffneten Tabelle ihr noch nicht gespeicherter Stand. Die Zahl über der Liste zählt Dokument- und Datensatz-Treffer zusammen. Ist die Ersetzen-Zeile geöffnet, entfallen die Datensatz-Gruppen, weil das Ersetzen über den Bereich nicht in Datensätze schreibt.

Der Datensatz-Block selbst liegt dagegen nicht im Volltext-Suchraum: Ein Suchbegriff, der nur in den Datensätzen einer Tabellen-Datei steht, liefert keinen Treffer bei diesem Dokument, sondern allein die Datensatz-Treffer. Der erklärende Text über dem Datenblock bleibt als Dokument durchsuchbar, und ein Treffer dahinter führt weiterhin an die richtige Stelle. Der Grund liegt nicht in der Tabelle, sondern im Bereich: Der Suchraum hält die Texte aller Markdown-Dateien im Speicher und trägt dafür eine Obergrenze über den **ganzen** Bereich. Schon ein paar Tabellen mit einigen Megabyte reißen sie, und von da an liest jede Suche wieder von der Platte, auch die über jedes gewöhnliche Dokument. Die Datensätze im Suchraum kosteten also nicht sich selbst, sondern den ganzen Bereich seine Geschwindigkeit.

Daneben führen drei Wege zu Datensätzen:

- **Im geöffneten Dokument suchen.** Wer die Tabellen-Datei vor sich hat und darin sucht (Standard `Strg+F`), sucht im Text vor sich und findet seine Datensätze unverändert. Die Grenze oben betrifft allein die Suche über den Bereich.
- **Eine Datensatz-Abfrage stellen.** Ein Block `perspective-query` mit `LIST RECORDS` oder `TABLE RECORDS` findet Datensätze nach ihren Feldern, etwa alle Bücher eines Autors; die Seite [Perspective-Abfrage](frontmatter-query.md) beschreibt sie. Eine Abfrage, die man öfter braucht, lässt sich als Abfrage-Datei ablegen (Abschnitt «Abfrage-Dateien»).
- **Gezielt auf einen Datensatz verweisen**, wie im nächsten Abschnitt beschrieben.

### Verweis auf einen einzelnen Datensatz

Ein Verweis nennt die Tabelle und die interne Kennung, geschrieben wie ein Block-Anker:

```markdown
[[Personen#^r-00042]]
```

**Zwei weitere Schreibweisen** gelten ebenso: die Kurzform der Kennung, `[[Personen#^r-42]]`, und die Anzeige-Form des Datensatzes, `[[Personen#^Anna Muster]]`. Eine Anzeige-Form im Verweis besteht aus Buchstaben, Ziffern, Leerzeichen und den Zeichen Unterstrich, Bindestrich, Punkt, Apostroph, Komma und runde Klammern; mit einem anderen Zeichen, etwa `&`, löst sie nicht auf. Verglichen wird ohne führende und folgende Leerzeichen, aber mit Rücksicht auf Groß- und Kleinschreibung. Die Anwendung schreibt den Verweis nicht um: Gespeichert wird, was geschrieben steht.

**Aufgelöst wird in einer festen Reihenfolge.** Trägt die Tabellen-Datei einen Block-Anker mit genau diesem Namen, gilt der Verweis ihm, und der Linter weist darauf hin, dass der Block-Anker einen Datensatz verdeckt; ebenso führt der Klick zu einer Überschrift gleichen Namens. Sonst gilt zuerst die Kennung, lang oder kurz, danach die Anzeige-Form. Tragen mehrere Datensätze dieselbe Anzeige-Form, gilt der Verweis trotzdem, der Linter markiert ihn als mehrdeutigen Datensatz-Namen, und der Klick öffnet die Tabellen-Datei; eindeutig wird er über die Kennung.

**Die Vorschlagsliste hilft beim Schreiben.** Nach `[[Tabelle#^` bietet sie hinter den Block-Ankern der Datei die Datensätze der Tabelle an, je mit ihrer Anzeige-Form und dem Zusatz «Datensatz», zusammen höchstens 30 Einträge. Tippen grenzt die Liste über Anzeige-Form und Kennung ein, und die Auswahl schreibt die lange Kennung, etwa `[[Personen#^r-00042]]`.

Der Verweis **gilt**, wenn die genannte Tabelle diesen Datensatz führt, und er ist gebrochen, wenn sie ihn nicht führt. Er verhält sich damit wie jeder andere Verweis der Anwendung. Er gilt auch dann, wenn der Datensatz nicht in der ersten Datei der Tabelle steht, sondern in einer ihrer Folge-Dateien: Für den Schreibenden ist die Tabelle eine, und ihre Verteilung auf Dateien geht ihn nichts an.

Geprüft wird gegen den **gespeicherten** Stand der Tabelle, wie bei jedem anderen Anker auch. Ein Verweis auf einen Datensatz, der eben angelegt und noch nicht gespeichert wurde, gilt deshalb noch nicht, und eine geänderte Anzeige-Form löst erst nach dem Speichern auf.

Ob ein Verweis gilt, zeigt der [Markdown-Linter](tools.md): Ein gebrochenes Ziel bekommt im Editor, also in der Quellcode-, der geteilten und der Live-Ansicht, eine gewellte Unterstreichung. Die reine Lese-Ansicht stellt Gültigkeit nicht dar; dort sehen gültige und gebrochene Verweise gleich aus.

**Ein Klick öffnet die Maske des Datensatzes**, in der Standard-Maske seiner Tabelle. Zur Zeile in der Tabellen-Datei führt der Handgriff **«Im Tabellen-Dokument zeigen»** im Kopf der Maske (Abschnitt «Lesen und bearbeiten»). Trifft ein Verweis keinen Datensatz eindeutig, öffnet der Klick die Tabellen-Datei. Außerhalb eines geöffneten Bereichs öffnet der Klick die Tabellen-Datei und bringt die Zeile des Datensatzes in den Blick. Im Ergebnis einer Datensatz-Abfrage öffnet ein Klick auf einen Datensatz ebenso dessen Maske.

**Ein Verweis im Text hält den Datensatz nicht fest.** Wird der Datensatz gelöscht, bricht der Verweis wie jeder andere Verweis der Anwendung, und der Linter zeigt es. Den Lösch-Schutz trägt allein die Verweis-Spalte (Abschnitt «Verwendungsnachweis»).

## Abfrage-Dateien

Eine Abfrage, die man öfter braucht, bekommt ein eigenes Dokument: Trägt es im Frontmatter die Marke `db-query` und im Text genau einen Abfrage-Block, ist es eine **Abfrage-Datei**. Der übrige Text beschreibt die Abfrage und erscheint wie in jedem Dokument.

````markdown
---
db-query:
mindestseiten: 500
---

# Dicke Bücher

Bücher mit mehr als `mindestseiten` Seiten, die dicksten zuerst.

```perspective-query
TABLE RECORDS autor, seiten FROM "Bücher" WHERE seiten > this.mindestseiten SORT seiten DESC
```
````

- **Die Marke genügt.** Erkannt wird die Datei an der Marke allein, `db-query:` ohne Wert genügt; ihre Tabelle nennt die Abfrage selbst in `FROM`. Die Abfrage darf jede Ebene ansprechen, Dateien ebenso wie Datensätze. Mit den Angaben `editable`, `form` und `allow` im Behälter wird die Datei zur Listen-Maske, die der nächste Abschnitt beschreibt.
- **Öffnen und Einbetten.** Geöffnet zeigt die Datei ihr Ergebnis wie jedes Dokument mit einem Abfrage-Block. Ein anderes Dokument bettet sie mit `![[Dicke Bücher]]` ein und zeigt dasselbe Ergebnis, denn `this.` meint dabei die Abfrage-Datei und nicht das einbettende Dokument. Eine Abfrage, die Werte des einbettenden Dokuments liest, gibt es deshalb nicht.
- **Anlegen.** Ein eigenes Kommando gibt es dafür nicht: Eine Abfrage-Datei entsteht von Hand oder aus einer eigenen [Vorlage](templates.md).
- **Ohne die Marke** bleibt ein Dokument mit Abfrage-Block eine Abfrage im Fließtext und erscheint nicht in der Übersicht.
- **In der Übersicht** der Datenbank steht jede Abfrage-Datei im Abschnitt «Abfragen» (Abschnitt «Der Bereich als Datenbank»); keinen oder mehrere Abfrage-Blöcke meldet sie unter den Fehlerlagen (Abschnitt «Fehlerhafte Angaben»).

**Zwei Bedeutungen von `editable`.** In der Definition einer Tabelle, im Behälter `db-table`, ist `editable` eine Bedingung, die für jeden Datensatz einzeln sagt, ob er noch bearbeitet werden darf (Abschnitt «Bedingte Bearbeitbarkeit»). Im Behälter `db-query` einer Abfrage-Datei ist `editable` ein Ja oder Nein und macht die Datei zur Listen-Maske. Beide wirken zusammen: Eine Listen-Maske bietet die Bearbeitung nur für die Zeilen an, deren Datensatz die Bedingung seiner Tabelle erfüllt.

## Listen-Maske

Eine Abfrage-Datei wird zur **Listen-Maske**, wenn ihr Behälter `db-query` die Angabe `editable: true` trägt. Sie zeigt ihre Datensätze dann als Gitter, in dem sich Zeilen öffnen, ändern, anlegen und löschen lassen; der übrige Text der Datei beschreibt die Liste wie bei jeder Abfrage-Datei.

````markdown
---
db-query:
  editable: true
  form: Ausleihen Form
  allow: [create, update, delete]
---

# Offene Ausleihen

```perspective-query
TABLE RECORDS buch, leser, ausgeliehen, frist FROM "Ausleihen" WHERE NOT erledigt SORT frist
```
````

| Angabe | Bedeutung |
| --- | --- |
| `editable` | `true` macht die Abfrage-Datei zur Listen-Maske. Ohne die Angabe oder mit `false` bleibt sie eine gewöhnliche Abfrage-Datei |
| `form` | der Name der Masken-Datei ohne Endung, die ein Klick auf eine Zeile öffnet. Ohne die Angabe gilt die Standard-Maske der Tabelle |
| `allow` | die erlaubten Handgriffe als Liste aus `create` (anlegen), `update` (ändern) und `delete` (löschen). Ohne die Angabe gilt allein `update`, eine leere Liste erlaubt keinen |

`form` und `allow` wirken nur zusammen mit `editable: true`.

### Ansehen und öffnen

In jeder Ansicht, die das Ergebnis zeigt, also in der Lese-, der geteilten und der Live-Ansicht, steht das Gitter an der Stelle der Ergebnis-Tabelle: dieselben Spalten, vorn die Spalte «Datensatz», darüber eine Zähl-Zeile wie «Zeilen 1 bis 50 von 120». Eine Seite zeigt fest 50 Zeilen; bei mehr Zeilen blättern **«Vor»** und **«Zurück»**.

Ein Klick auf eine Zeile öffnet ihren Datensatz in der Maske, die `form` nennt, sonst in der Standard-Maske seiner Tabelle. Nennt `form` eine Masken-Datei, die es nicht gibt oder die zu einer anderen Tabelle gehört, öffnet der Klick ebenfalls die Standard-Maske, und in der Übersicht steht ein Hinweis unter den Fehlerlagen der Abfrage-Datei. In einer Zeile, die sich bearbeiten lässt, öffnet der einfache Klick auf eine bearbeitbare Zelle die Maske nicht, weil dort der Doppelklick die Bearbeitung beginnt; die Maske öffnen dann die Spalte «Datensatz» und die lesenden Zellen. Trägt die Abfrage `WITHOUT ID`, fehlt die Spalte «Datensatz», und in einer solchen Zeile öffnet nur eine lesende Zelle die Maske. Ein Verweis in einer Zelle öffnet wie überall die Maske seines Ziels.

**Das Ansehen sperrt nichts.** Eine Liste mit hunderten Datensätzen sperrte sonst mit jedem Blick alle; gesperrt wird erst die Zeile, deren Bearbeitung beginnt.

Eine Listen-Maske liest genau eine Tabelle. Bearbeitbar sind allein die Spalten, die genau ein Feld dieser Tabelle nennen; eine gerechnete Spalte, ein Pfad über ein Verweis-Feld und `record.id` bleiben lesend. Lesend bleibt die ganze Liste, wenn sie gruppiert ist oder mit `DISPLAY` eine Darstellungsform wählt: Ein Satz sagt das, und darunter steht die Ausgabe wie in jeder Abfrage. Eine Abfrage über Dateien, Blöcke oder Aufgaben statt über Datensätze und eine Abfrage, deren Treffer aus mehreren Tabellen stammen, zeigen die gewöhnliche Ergebnis-Tabelle.

### Zeilen bearbeiten

Erlaubt `allow` das Ändern, trägt das Gitter am Zeilen-Ende die Spalte **«Aktionen»**. **«Bearbeiten»** dort oder ein Doppelklick in die Zeile beginnt die Bearbeitung: Die Anwendung sperrt den Datensatz, liest seinen frischen Stand aus der Datei und macht aus den bearbeitbaren Zellen Eingaben in der Form ihres Typs, wie in der Maske. **«Speichern»** oder die Eingabetaste schreibt, in einem mehrzeiligen Feld macht Umschalt+Eingabetaste einen Zeilenumbruch; **«Abbrechen»** oder die Escape-Taste verwirft. Wer die Zeile nur verlässt, speichert nicht. Geschrieben wird über denselben Weg wie in der Maske, mit allen Regeln der Tabelle.

Bearbeitet wird eine Zeile zur Zeit: Solange sie offen ist, sind das Blättern und die Handgriffe der übrigen Zeilen gesperrt. Wird das Dokument geschlossen, die Ansicht gewechselt oder ein anderes geöffnetes Dokument gezeigt, endet die Bearbeitung ohne Speichern, und die Sperre wird frei.

Weist die Anwendung die Änderung ab, bleibt die Zeile in Bearbeitung. Betrifft die Meldung ein Feld, steht sie an seiner Zelle; eine Regel über mehrere Felder steht in der Spalte «Aktionen». Hat jemand den Datensatz geändert, seit die Zeile ihn gelesen hat, erscheint unter der Zeile derselbe Block wie in der Maske, mit **«Neu laden»** und **«Trotzdem speichern»**. Hält eine andere Stelle den Datensatz gesperrt, erscheint unter der Zeile der Bescheid aus dem Abschnitt «Sperren». Haben Sie nichts geändert, gibt es nichts zu speichern, und die Zeile kehrt ins Lesen zurück.

Ob ein Datensatz geändert werden darf, sagt die Angabe `editable` seiner Tabelle **je Zeile**: Eine Zeile, deren Datensatz nach dieser Bedingung nicht änderbar ist, erscheint gedämpft, ohne «Bearbeiten» und ohne «Löschen», und ein Tooltip nennt den Grund.

### Anlegen und löschen

Mit `create` in `allow` steht neben der Zähl-Zeile die Schaltfläche **«Neue Zeile»**. Sie setzt oben auf die gezeigte Seite eine leere Zeile, die in der Spalte «Datensatz» «Neu» zeigt, und beginnt dort die Bearbeitung. Der neue Datensatz bekommt seine Kennung wie in der Maske schon jetzt; in die Datei kommt er erst mit **«Speichern»**, und danach steht er dort, wo die Sortierung der Abfrage ihn einordnet, unter Umständen auf einer anderen Seite. **«Abbrechen»** entfernt die Zeile wieder.

Mit `delete` in `allow` trägt jede änderbare Zeile **«Löschen»**. Die Anwendung sperrt den Datensatz und fragt unter der Zeile zurück wie die Maske: **«Ja, löschen»** löscht, und die Liste zeigt danach den Bestand ohne ihn; **«Nein»** lässt alles stehen. Ein Datensatz, auf den noch eine Verweis-Spalte zeigt, lässt sich auch hier nicht löschen: Die Meldung steht unter der Zeile, und die Zeile bleibt.

Ohne `update` fehlen «Bearbeiten» und der Doppelklick, und ein Klick auf jede Zelle öffnet die Maske; «Neue Zeile» und «Löschen» bleiben, soweit `allow` sie erlaubt.

## Positionen in der Maske

Eine Maske kann neben den Feldern ihres Datensatzes die Datensätze einer anderen Tabelle zeigen, die auf ihn verweisen, etwa zu einer Rechnung ihre Positionen oder zu einem Buch seine Ausleihen. Dafür steht in der Masken-Datei der Platzhalter `{{list:<Abfrage-Datei>}}` allein auf seiner Zeile, mit dem Namen einer Listen-Maske ohne Endung:

```markdown
**Titel:** {{field:titel}}

## Ausleihen

{{list:Offene Ausleihen}}
```

Der **Positions-Bereich** zeigt das Gitter dieser Listen-Maske, eingeschränkt auf die Datensätze, deren Verweis-Feld auf den gezeigten Datensatz zeigt. Die Anwendung ergänzt die Abfrage dazu um diese Bedingung; Spalten, Sortierung und übrige Bedingungen der Abfrage-Datei gelten weiter. Hat die Tabelle der Positionen genau ein Verweis-Feld auf die Tabelle der Maske, ist es gemeint; hat sie mehrere, nennt `{{list:<Abfrage-Datei> BY <Verweis-Feld>}}` das gemeinte. Mitten in einer Textzeile bleibt der Platzhalter Text und wird gemeldet.

**Im Lesen der Maske ist der Bereich lesend:** Ein Klick auf eine Zeile öffnet die Position in ihrer Maske. **Im Bearbeiten** bietet der Bereich die Handgriffe, die `allow` der Abfrage-Datei erlaubt, wie die eigenständige Liste. Eine gespeicherte Zeile wird aber nur **vorgemerkt**: Sie zeigt ihren neuen Stand, ein Tooltip sagt «Vorgemerkt; wird mit der Maske gespeichert.», und ihre Sperre bleibt bestehen; eine zum Löschen vorgemerkte Zeile bleibt gekennzeichnet stehen. Eine neue Position bekommt den Verweis auf den gezeigten Datensatz ohne Eingabe, auch wenn dieser selbst gerade neu angelegt wird.

**Gespeichert wird mit der Maske, ganz oder gar nicht.** **«Speichern»** der Maske schreibt den Kopf und alle vorgemerkten Positionen in einem Vorgang. Ist eine Zeile des Bereichs noch in Bearbeitung, wird sie zuerst vorgemerkt; wird sie dabei abgewiesen, speichert die Maske nicht und sagt das. Weist die Anwendung den Vorgang ab, wird nichts geschrieben, und alles bleibt stehen; die Meldung zu einer Position steht im Kopf der Maske und beginnt mit «Position» und ihrer Nummer unter den vorgemerkten Zeilen. Nach dem Speichern sind alle Sperren frei.

**«Verwerfen»** verwirft Kopf und Positionen zusammen und gibt alle Sperren frei. Eine vorgemerkte neue Zeile lässt sich erneut bearbeiten, aber nicht einzeln zurücknehmen; zurück geht sie allein mit «Verwerfen». Vorgemerkte Positionen zählen als ungespeicherte Bearbeitung: Vor einem Wechsel zu einem anderen Datensatz fragt die Maske zurück.

Lässt sich der Bereich nicht aufbauen, steht an seiner Stelle ein Hinweis mit der Zeile der Masken-Datei; die Lagen nennt der Abschnitt «Fehlerhafte Angaben».

## Aufteilung großer Datenbestände

Wächst der Bestand über rund **0,7 MB**, verteilt ihn die Anwendung beim Speichern auf mehrere Dateien nebeneinander und führt sie weiterhin als **eine** Tabelle. Sie öffnen die erste Datei und sehen alle Datensätze; ein Verweis auf einen Datensatz kennt den Unterschied nicht.

Vier Zusagen gelten dabei, und drei davon sagen, was **nicht** geschieht:

- Geschnitten wird nur **zwischen zwei Datensätzen**, nie mitten in einem.
- Ein Datensatz **wandert nie** in eine andere Datei. Neue Datensätze kommen hinten dazu, umverteilt wird nichts — damit bricht kein Verweis auf einen Datensatz.
- Eine **vorgefundene Aufteilung wird nie umgebaut**, auch wenn sie mit einer anderen Schwelle entstanden ist.
- Jede Folge-Datei nennt in ihrem Frontmatter die **Feld-Namen**, damit sie auch für sich allein lesbar bleibt. Diese Liste ist eine Lesehilfe und kein Vertrag: Widerspricht sie der Definition der ersten Datei, gilt die Definition, und der nächste Schreibvorgang bringt die Liste in Ordnung.

Die Mechanik dahinter ist dieselbe wie bei der [Teilung großer Dokumente](document-parts.md); für Tabellen-Dateien gelten nur eine andere Schwelle und eine andere Schnittstelle.

## Steckbrief der Datenbank

Eine Datenbank beschreibt sich selbst im Behälter `db-database` im Frontmatter eines eigenen Dokuments:

```yaml
---
db-database:
  name: Bibliothek
  description: Bestand, Ausleihen und Leser der Hausbibliothek
  schemaVersion: '1.0'
  fallbackLocale: de
---
```

- **`name`** und **`description`** sind Beschriftungen und deshalb ebenfalls als Zuordnung von Sprache zu Text möglich.
- **`schemaVersion`** ist Text und steht in Anführungszeichen. Ohne sie läse YAML `1.0` als Zahl, und aus der Version `1.0` würde beim Lesen die Version `1`.
- **`fallbackLocale`** ist die Sprache, auf die eine Beschriftung zurückfällt, wenn sie die Sprache der Oberfläche nicht führt. Ohne Angabe gilt die erste Sprache, die im Steckbrief selbst vorkommt.
- **`roles`**, **`defaultRole`** und **`users`** führen die Rollen der Datenbank, die Vorgabe-Rolle und die Zuordnung von Anmeldenamen; der Abschnitt «Berechtigungen» beschreibt sie. Ohne sie ist in der Datenbank alles erlaubt.

Jede dieser Angaben fehlt für sich, und keine ist Voraussetzung für die Tabellen: Jede Tabelle trägt ihre Definition selbst und bleibt auch ohne Steckbrief vollständig deutbar.

## Der Bereich als Datenbank

Sobald ein Dokument im Bestand eines Bereichs den Steckbrief trägt, führt die Anwendung diesen Bereich als **Datenbank-Bereich**. Sie erklären ihn nicht eigens dazu: Der Steckbrief ist die Erklärung. Damit steht die Aussage an einer Stelle statt an zweien, die einander widersprechen könnten.

Ein Datenbank-Bereich bekommt zwei Dinge, die ein gewöhnlicher Bereich nicht hat.

**Die Übersicht der Datenbank-Objekte** beantwortet an einer Stelle, was in diesem Bereich liegt: den Steckbrief mit Name und Beschreibung, die Tabellen je mit der Zahl ihrer Felder, die Abfrage-Dateien und die Fehlerlagen aus dem Einlesen der Definitionen, im Klartext statt als Code. Sie öffnet als eigene Ansicht, und in ihr selbst wird nichts bearbeitet; ihre Aktionen führen in die Maske und in die Prüfungen. Drei Wege führen zu ihr:

- **Ansicht → Übersicht der Datenbank**,
- das **Kontextmenü des Bereichs-Panels**,
- die **Kommando-Palette**.

In einem Bereich ohne Datenbank wird keiner dieser Wege angeboten.

In der Tabellen-Liste nennt die Spalte **«Maske»** die Masken-Datei einer Tabelle und bleibt bei der erzeugten Maske leer. Dazu trägt die Übersicht vier Aktionen: **«Konsistenz prüfen»** im Kopf für alle Tabellen und in der Zeile jeder Tabelle **«Neuer Datensatz»**, **«Prüfen»** und **«Verwendung»**. Was sie tun, beschreiben die Abschnitte «Datensätze in der Maske bearbeiten», «Konsistenz-Prüfung» und «Verwendungsnachweis». Der Abschnitt **«Abfragen»** nennt jede Abfrage-Datei mit ihrem Namen und ihrem Ort, dem Ordner relativ zur Wurzel des Bereichs, und **«Öffnen»** öffnet sie wie jedes Dokument; führt der Bereich keine, steht dort ein erklärender Satz. Unter den Fehlerlagen stehen auch die Hinweise zu Masken- und Abfrage-Dateien, benannt nach der Datei. Die Spalte **«Art»** des Abschnitts «Abfragen» unterscheidet eine gewöhnliche «Abfrage» von einer «Listen-Maske» und nennt bei dieser die erlaubten Handgriffe; erlaubt sie keinen, steht dort «Listen-Maske, nur lesen». Im Steckbrief-Block nennt die Übersicht außerdem die eigene Rolle, und trägt der Steckbrief Rollen, auch diese mit ihren Erlaubnissen und unter jeder Tabelle die Erlaubnisse der eigenen Rolle (Abschnitt «Berechtigungen»).

**Der Einstellungs-Abschnitt «Datenbank»** steht in der Navigations-Gruppe «Aktueller Bereich» (Datei → Einstellungen… → Aktueller Bereich → Datenbank; bei geöffnetem Buch heißt die Gruppe **Aktuelles Buch**, bei geöffnetem Bücherregal **Aktuelles Bücherregal**). Er zeigt dieselbe Auskunft in Kurzform, also Name und Beschreibung der Datenbank, die Zahl ihrer Tabellen und die Zahl der Fehlerlagen, und trägt eine Option: **«Übersicht beim Öffnen des Bereichs zeigen»**. Ist sie gesetzt, öffnet sich die Übersicht von selbst, sobald der Bereich gebunden wird. Die Option liegt in der Bereichsdatei und reist mit dem Bereichs-Ordner. Dazu kommt das Feld **«Name des Sperr-Ordners»**; es ist im Abschnitt «Sperren» beschrieben.

Dazu führt die Anwendung in der Wurzel des Bereichs die kleine Datei `Area_Database.mdda`. Sie trägt den Zählerstand der Vorgangs-Kennungen, erscheint in keiner Dateiliste und reist mit dem Bereichs-Ordner; an ihr ist nichts zu tun. Fehlt sie, gewinnt die Anwendung den Stand aus den Änderungsbelegen zurück.

## Fehlerhafte Angaben

Für die ganze Definition gilt die weiche Linie des Hauses: Eine defekte **Einzel-Angabe** entfällt und wird gemeldet, der Eintrag bleibt wirksam; ein defekter **Eintrag** entfällt, die übrigen Spalten bleiben. Die Meldung benennt die Stelle, also die betroffene Spalte, die fehlerhafte Angabe und das, was an ihrer Stelle erwartet wurde.

Die eine Ausnahme ist der **Typ**: Ein Typ außerhalb des Satzes oben lässt den ganzen Eintrag entfallen, weil eine Spalte ohne deutbaren Typ keine Spalte ist.

Eine Angabe, welche die Anwendung nicht kennt, entfällt einzeln mit einem Hinweis und richtet keinen Schaden an.

Für die Angabe `changeLog` der Änderungsbelege gelten drei eigene Fehlerlagen. Ist `changeLog` selbst kein Objekt, entfallen die eigenen Grenzen dieser Tabelle, und es gelten die Vorgaben der Anwendung. Ist `maxBytes` oder `maxPerRecord` weder eine ganze Zahl über null noch das Wort `unlimited`, entfällt die einzelne Angabe, und ihre Vorgabe gilt. Gemeldet wird jede dieser Lagen; still übergangen wird keine.

Für die Prüfregeln und die Bedingung der Bearbeitbarkeit gilt dieselbe weiche Linie, Regel für Regel. Eine unbrauchbare Regel unter `check` oder `checks` entfällt einzeln, und die übrigen Regeln, das Feld und die Tabelle bleiben; gemeldet werden ein Eintrag, der weder Text noch ein Objekt mit `rule` ist, ein ungültiger regulärer Ausdruck, ein ungültiger Ausdruck, eine Feld-Regel mit einem anderen Bezug als `value`, ein unbekannter Regel-Name und eine Regel unter `checks`, die ein unbekanntes Feld nennt. Ist `checks` keine Liste, entfallen alle Regeln unter `checks`. Eine unbrauchbare Angabe `editable` entfällt ebenso, und die Tabelle bleibt bearbeitbar. Ein Meldungstext, der sich nicht auslegen lässt, entfällt für sich allein; seine Regel oder Bedingung prüft weiter. Eine unbrauchbare Angabe `editable` an einem Feld entfällt ebenso, und das Feld bleibt bearbeitbar.

Für Masken-Dateien gilt dieselbe weiche Linie. Nennt der Behälter `db-form` keine Tabelle oder eine, die es in der Datenbank nicht gibt, bleibt die Datei ein gewöhnliches Dokument. Beide Lagen stehen unter den Fehlerlagen der Übersicht; mehrere Masken-Dateien einer Tabelle sind dagegen keine Fehlerlage, sondern der Fall des Abschnitts «Mehrere Masken und die Standard-Maske». Ein Platzhalter, der weder Feld- noch Wert-Platzhalter ist, und ein Feld-Name, den die Tabelle nicht kennt, bleiben als Text stehen, und ein Wert-Platzhalter mit ungültigem Ausdruck lässt seine Stelle leer; alle drei meldet die Maske mit ihrer Zeile in ihrem Kopf, und die Konsistenz-Prüfung führt sie als Befund. Ein Marker `{{end}}` ohne offenen Bereich wird übergangen, ein Bereich ohne `{{end}}` zeigt seinen Inhalt wie außerhalb des Bereichs, und ein Bereich mit ungültiger Bedingung bleibt verborgen; auch diese drei meldet die Maske mit ihrer Zeile in ihrem Kopf, und die Konsistenz-Prüfung führt sie als Befund. Ein Marker, der nicht allein auf seiner Zeile steht, ist kein Marker und bleibt als unbekannter Platzhalter Text. Nennt die Angabe `form` der Tabellen-Definition keine Masken-Datei, eine, die es für diese Tabelle nicht gibt, oder die Masken-Datei einer anderen Tabelle, steht ein Hinweis unter den Fehlerlagen der Übersicht, und es gilt die Standard-Maske ohne Angabe; die beiden letzten Lagen führt die Konsistenz-Prüfung zusätzlich als Befund an der Tabelle. Ein Pfad, der kein Verweis-Feld der Tabelle oder kein Feld der Ziel-Tabelle nennt, lässt seine Stelle leer und wird ebenso mit seiner Zeile gemeldet. Für den Positions-Bereich gibt es fünf Lagen: Die genannte Abfrage-Datei gibt es nicht; sie trägt nicht `editable: true`; die Positionen haben kein Verweis-Feld auf die Tabelle der Maske; sie haben mehrere, und `BY` nennt keines davon; oder die Abfrage nennt keine einzelne Tabelle oder lässt sich nicht um die Beziehung ergänzen. Im zweiten Fall bleibt der Bereich lesend, sonst leer; jede Lage steht als Hinweis mit Zeile an der Stelle des Bereichs, und die Konsistenz-Prüfung führt sie als Befund der Masken-Datei.

Für Abfrage-Dateien gilt dieselbe weiche Linie. Trägt ein Dokument mit der Marke `db-query` keinen Abfrage-Block oder mehrere, bleibt es ein gewöhnliches Dokument, und jeder Block darin wird ausgewertet. Die Übersicht führt es trotzdem im Abschnitt «Abfragen» und nennt die Lage unter den Fehlerlagen, benannt nach der Datei. Für die Angaben einer Listen-Maske gilt dieselbe Linie, Angabe für Angabe: Ein `editable`, das kein Wahrheitswert ist, gilt als `false`; ein `form`, das keinen Namen nennt, entfällt; ein `allow`, das weder Handgriff noch Liste ist, fällt auf `update` zurück, und ein unbekanntes Wort darin entfällt allein. `form` oder `allow` ohne `editable: true` wirken nicht, und jede andere Angabe im Behälter wird übergangen. Nennt `form` eine Masken-Datei, die es in der Datenbank nicht gibt oder die zu einer anderen Tabelle als der der Abfrage gehört, öffnet ein Klick auf eine Zeile die Standard-Maske der Tabelle. Jede dieser Lagen steht als Hinweis unter den Fehlerlagen der Übersicht.

Für Rollen, Vorgabe-Rolle und Zuordnung im Steckbrief gilt dieselbe weiche Linie. Eine Rolle mit einer unbekannten Tabelle, einer unbekannten Operation oder einer Angabe an einer Tabelle, die weder `all` noch eine Liste ist, gilt als nicht gesetzt, und jeder ihrer Fehler wird gemeldet. Eine Vorgabe-Rolle oder eine Zuordnung, die keine vorhandene Rolle nennt, gilt ebenso als nicht gesetzt, und es gilt die nächste Regel des Abschnitts «Berechtigungen». Alle diese Lagen stehen unter den Fehlerlagen der Übersicht.

Trägt eine Tabelle Datensätze, aber keinen oder einen zu niedrigen Hochwasserstand `lastId`, vergibt die Anwendung trotzdem keine Kennung doppelt: Eine Neuanlage zieht die nächste Nummer über der höchsten vorhandenen Kennung und schreibt danach den Hochwasserstand fort. Die Konsistenz-Prüfung nennt die Lage als Hinweis.

## Die Datenbank abschalten

Die gesamte Datenbank ist eine [interne Erweiterung](extensions.md) mit dem Namen «Datenbank» in der Kategorie Werkzeuge und lässt sich mit einem Schalter abschalten. Sie setzt die [Eigenschafts-Profile](property-profiles.md) voraus, weil die Gestalt einer Tabellen-Definition über ein internes Profil beschrieben und geprüft wird; solange die Datenbank eingeschaltet ist, lässt sich diese Grundlage deshalb nicht abschalten.

Im Aus-Zustand gilt:

- Der **Datensatz-Block bleibt ein gewöhnlicher Code-Block**, in der Lese-Ansicht, im Änderungs-Modus und im portablen Export. Sein Inhalt bleibt lesbar; abgeschaltet ist die Darstellung als Tabelle, nicht die Angabe.
- **Übersicht und Einstellungs-Abschnitt entfallen**, samt den Zugängen im Ansichtsmenü, im Kontextmenü des Bereichs-Panels und in der Kommando-Palette. Eine bereits geöffnete Übersicht bleibt stehen, bis Sie sie schließen, wie jede andere System-Seite.
- Mit dem Datensatz-Block entfallen seine Schaltflächen **«Datensatz öffnen»** und **«Neuer Datensatz»**, mit der Übersicht ihre Aktionen **«Konsistenz prüfen»**, **«Prüfen»** und **«Verwendung»**, und die Kommandos **«Neuer Datensatz in der aktiven Tabelle»** und **«Konsistenz der Datenbank prüfen»** verschwinden aus der Kommando-Palette. Damit ist auch die **Maske** nicht mehr erreichbar, und die Anwendung liefert ihr, der Konsistenz-Prüfung und dem Verwendungsnachweis keine Daten mehr.
- Eine **Datensatz-Abfrage** liest keine Tabelle mehr: Sie zeigt eine leere Liste mit dem Hinweis, dass die Erweiterung ausgeschaltet ist, und keine Fehlermeldung. Das gilt auch für Pfade über Verweis-Felder, für Hierarchien und für den Baum.
- Eine **Abfrage-Datei** bleibt ein gewöhnliches Dokument: Ihr Abfrage-Block wird weiter ausgewertet, über Datensätze mit der leeren Liste und dem Hinweis wie eben beschrieben, und mit der Übersicht entfällt ihr Abschnitt «Abfragen». Eine Listen-Maske zeigt dabei kein Gitter und bietet keinen Handgriff.
- Ein **Verweis auf einen einzelnen Datensatz** wird nicht mehr als gebrochen markiert. Ohne Definitionen gibt es nichts, wogegen er zu prüfen wäre, und eine Warnung ohne Prüfung wäre eine Behauptung. Ein Klick öffnet die Tabellen-Datei ohne Sprung zur Zeile statt der Maske, und die Vorschlagsliste bietet keine Datensätze an.
- Die **Suche über den Bereich liefert keine Datensatz-Treffer**. Der Datensatz-Block bleibt aus dem Volltext ausgenommen, weil diese Grenze an der Tabellen-Datei hängt und nicht am Schalter; über den Bereich sind Datensätze dann nicht auffindbar.
- Eine beim Beenden geöffnete **Maske** kehrt beim Start nicht zurück. Ihr Eintrag in der Sitzung ruht und bringt sie nach dem Einschalten mit dem nächsten Start zurück (Abschnitt «Nach dem Neustart»).
- **Rollen, Vorgabe-Rolle und Zuordnung** bleiben bloßes Frontmatter des Steckbriefs, ebenso eine Angabe `editable` an einem Feld: Es gibt keine Auflösung und keine Prüfung, auch nicht beim Speichern einer geänderten Definition.
- **Geschrieben wird nicht.** Die Anwendung legt keine Datensätze an, ändert und löscht keine, nimmt keine Sperre und erzeugt keinen Änderungsbeleg; auch einen liegengebliebenen Speichervorgang schreibt sie in diesem Zustand nicht zu Ende.

**Die Dateien bleiben unangetastet.** Das Abschalten nimmt die Auslegung, nicht die Daten: Kein Zeichen wird geändert, und das Einschalten bringt alles zurück. Der Bereichs-Index wird dabei einmal neu aufgebaut; in großen Beständen dauert das einen Moment.
