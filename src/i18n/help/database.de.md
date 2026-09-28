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
| `lastId` | Hochwasserstand: die höchste je vergebene Nummer der Tabelle. Die nächste Kennung entsteht aus ihm und nicht aus dem Bestand, damit die Nummer eines gelöschten Datensatzes kein zweites Mal vergeben wird |
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

## Anzeige der Datensätze

In der Lese-Ansicht und im Änderungs-Modus erscheint der Block als Tabelle mit den Spalten der Definition. Jeder Wert wird nach dem Typ seiner Spalte dargestellt: Zahlen rechtsbündig und mit den erklärten Nachkommastellen, Wahrheitswerte als Haken, mehrzeilige Werte mit ihren Umbrüchen. Passt ein Wert nicht zu seinem Typ, zeigt die Zelle ihren ursprünglichen Text und wird farblich gekennzeichnet, statt ersetzt zu werden.

Ab **2000 Datensätzen** zeigt die Anzeige einen Ausschnitt und schreibt darunter, wovon er einer ist. Das ist ein Fenster und keine stille Kappung: Sie sehen, dass mehr da ist. Die Grenze ist gemessen und nicht gesetzt — bis dahin erscheint die Tabelle ohne merkliche Wartezeit.

Beim **portablen Export** steht die Tabelle dagegen vollständig, ohne Fenster. Eine Datei, die Sie weitergeben, darf nichts verschweigen: Der Empfänger hat die Anwendung nicht und sähe nicht, dass etwas fehlt.

Bearbeitet werden Datensätze nicht in dieser Ansicht, sondern in ihrer **Maske**, die der nächste Abschnitt beschreibt; die Schaltfläche am Anfang jeder Zeile öffnet sie. Die Tabellen-Datei ist technische Ablage — sie bleibt von Hand lesbar und im Notfall auch von Hand korrigierbar, aber im Regelbetrieb arbeiten Sie nicht in ihr.

## Datensätze in der Maske bearbeiten

Jeder Datensatz hat eine **Maske**: eine eigene Seite, die seine Felder in der Reihenfolge der Definition untereinander zeigt, jedes mit seiner Beschriftung. Die Anwendung erzeugt sie aus der Definition der Tabelle, zu bauen ist nichts. In der Maske legen Sie Datensätze an, ändern und löschen sie.

### Öffnen und neu anlegen

Einen bestehenden Datensatz öffnet die Schaltfläche **«Datensatz öffnen»** am Anfang seiner Zeile, vor der Schaltfläche der Änderungsbelege, in der Lese-Ansicht wie in der Live-Ansicht. Mit der Tastatur führt die Pfeiltaste nach links von der Beleg-Schaltfläche zu ihr.

Einen neuen Datensatz legen drei Wege an:

- die Schaltfläche **«Neuer Datensatz»** unter jeder Tabelle, auch unter einer leeren,
- die Schaltfläche **«Neuer Datensatz»** in der Zeile jeder Tabelle in der Übersicht der Datenbank,
- das Kommando **«Neuer Datensatz in der aktiven Tabelle»** in der Kommando-Palette. Es wirkt auf die Tabellen-Datei im aktiven Reiter; ist dort keine offen, sagt die Statuszeile das.

Die Maske öffnet als eigener Reiter, dessen Titel Datei und Datensatz nennt. Es gibt sie einmal je Fenster: Öffnen Sie einen anderen Datensatz, zeigt derselbe Reiter ihn. Ist die laufende Bearbeitung noch nicht gespeichert, fragt die Maske vorher, ob sie verworfen werden soll.

Ein neuer Datensatz bekommt seine interne Kennung schon beim Öffnen der Maske: Sie steht im Kopf, und der Hochwasserstand `lastId` der Tabelle ist bereits fortgeschrieben. Die Felder stehen leer da, und in die Datei kommt der Datensatz erst mit dem ersten Speichern.

### Lesen und bearbeiten

Die Maske öffnet **lesend**. Die Werte stehen als Text da, ein Wahrheitswert als Haken, und ein Pflichtfeld ist als solches gekennzeichnet. Im Kopf stehen die Aktionen **«Bearbeiten»**, **«Löschen»** und **«Belege»**; die letzte öffnet die Änderungsbelege des Datensatzes.

**«Bearbeiten»** macht aus jedem Feld eine Eingabe in der Form seines Typs:

| Typ | Eingabe |
| --- | --- |
| `string`, `link`, `record` | einzeilige Texteingabe, beim `record` mit Wertehilfe |
| `multiline` | mehrzeilige Texteingabe |
| `number`, `date`, `time` | Eingabe für Zahl, Datum oder Uhrzeit |
| `boolean` | Kontrollkästchen |

Ein Wert, der nicht zu seinem Typ passt, bekommt stattdessen die einfache Texteingabe, damit Sie sehen und berichtigen können, was in der Datei steht; eine Zahleneingabe verwürfe ihn sonst stillschweigend.

**«Speichern»** schreibt die Änderung und kehrt ins Lesen zurück, **«Verwerfen»** kehrt ohne zu schreiben zum gelesenen Stand zurück. Geschrieben werden allein die Felder, die Sie geändert haben. Haben Sie nichts geändert, gibt es nichts zu speichern, und die Statuszeile sagt das.

Ist ein Datensatz nach der Bedingung seiner Tabelle nicht bearbeitbar, fehlen **«Bearbeiten»** und **«Löschen»**, und ein Satz in der Maske nennt den Grund, mit dem Meldungstext der Bedingung, wenn sie einen hat.

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

Beim nächsten Öffnen zeigt die Maske den Text der Datei. Im Kopf steht dann, aus welcher Datei die Maske stammt, und der Handgriff entfällt; die Übersicht der Datenbank nennt die Datei in der Spalte **«Maske»**. Wird die Datei gelöscht, zeigt die Maske wieder die erzeugte Fassung.

**Gelesen wird allein der Feld-Platzhalter.** Ein Feld, das die Datei nicht nennt, zeigt die Maske nicht, und beim Speichern bleibt es unberührt; eine Neuanlage füllt nur die genannten Felder. Ein anderer Platzhalter und ein Feld-Name, den die Tabelle nicht kennt, bleiben als Text stehen und werden gemeldet, wie im Abschnitt «Fehlerhafte Angaben» beschrieben.

## Speichern durch die Anwendung

Angelegt, geändert und gelöscht werden Datensätze in der Maske, die der Abschnitt oben beschreibt. Sie speichert über einen Weg der Anwendung, der für jede Änderung an Datensätzen derselbe ist; was dieser Abschnitt beschreibt, gilt deshalb für jede von ihnen.

Jede Änderung läuft durch einen Weg, der sie vor dem Schreiben prüft. Ein Wert, der nicht zum Typ seines Feldes passt, wird ebenso abgewiesen wie ein leeres Feld, das einen Wert verlangt. In beiden Fällen wird nichts geschrieben.

Dazu kommen die Regeln aus der Definition der Tabelle, die in den Abschnitten oben beschrieben sind. Eine Änderung wird auch abgewiesen, wenn

- danach ein **fachlicher Schlüssel** doppelt vergeben wäre,
- ein **Verweis** keinen oder mehr als einen Datensatz trifft oder seine Ziel-Tabelle fehlt,
- ein Datensatz gelöscht werden soll, auf den noch **verwiesen** wird,
- ein Wert oder ein Datensatz eine **Prüfregel** verletzt,
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

In der Lese-Ansicht und in der Live-Ansicht trägt jede Datensatz-Zeile an ihrem Anfang eine Schaltfläche **«Änderungsbelege anzeigen»**. Ein Klick darauf öffnet die Seite **«Änderungsbelege»** als eigenen Reiter. Ohne Maus führt der Tabulator in die Tabelle, die Pfeiltasten wechseln die Zeile, Pos1 und Ende führen zur ersten und zur letzten, und die Eingabe- oder die Leertaste öffnet die Seite.

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

## Sperren

Arbeiten mehrere Personen im selben Datenbank-Bereich, etwa auf einem gemeinsamen Netzlaufwerk, sorgt eine Sperre dafür, dass nicht zwei gleichzeitig denselben Datensatz bearbeiten.

### Was gesperrt wird und wann

Gesperrt wird der einzelne **Datensatz**, und zwar in dem Augenblick, in dem seine Bearbeitung beginnt. Freigegeben wird er, sobald die Bearbeitung endet, beim Speichern ebenso wie beim Verwerfen. Das bloße Ansehen sperrt nichts: Eine Liste mit hunderten Datensätzen sperrte sonst mit jedem Blick alle auf einmal.

In der Maske beginnt die Bearbeitung mit **«Bearbeiten»** oder mit **«Löschen»**, das die Sperre schon vor seiner Rückfrage nimmt. Sie endet mit dem Speichern, mit **«Verwerfen»**, mit **«Neu laden»**, mit dem Abbruch der Lösch-Rückfrage, beim Wechsel zu einem anderen Datensatz und beim Schließen des Reiters der Maske. Weist die Anwendung ein Speichern ab, bleibt die Sperre bestehen, weil die Bearbeitung weiterläuft. Das Öffnen der Maske und eine Neuanlage sperren nichts.

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

## Konsistenz-Prüfung

Beim Speichern durch die Anwendung wird jede Änderung geprüft. Was auf anderem Weg in die Dateien kommt, etwa von Hand im Editor, prüft dabei niemand, und manche Regeln wirken beim Lesen gar nicht. Die **Konsistenz-Prüfung** sieht deshalb den ganzen Bestand durch und sagt, wo er den Regeln der Datenbank widerspricht.

Sie steht in der Übersicht der Datenbank: **«Konsistenz prüfen»** im Kopf prüft alle Tabellen, **«Prüfen»** in der Zeile einer Tabelle nur diese. Alle Tabellen prüft auch das Kommando **«Konsistenz der Datenbank prüfen»** in der Kommando-Palette; es öffnet dazu die Übersicht.

Das Ergebnis steht im Abschnitt **«Konsistenz-Prüfung»** der Übersicht: die Dauer, je Tabelle die Zahl ihrer Datensätze und Befunde und darunter die Befunde mit Tabelle, Datensatz, Feld und einem Satz im Klartext. Ein Klick auf den Datensatz öffnet seine Maske. Die Liste zeigt höchstens die ersten 500 Befunde und sagt dann, wie viele es insgesamt sind.

Gefunden werden:

- ein fachlicher Schlüssel, der mehrfach vergeben ist, mit einem Befund je beteiligtem Datensatz, und eine Kennung, die mehr als einmal in der Tabelle steht;
- ein Verweis, der keinen Datensatz trifft, der mehrere trifft oder der über einen Schlüssel-Wert auf eine Tabelle mit mehrteiligem Schlüssel zeigt, und eine Verweis-Spalte, deren Ziel-Tabelle fehlt oder nicht angegeben ist;
- ein Wert, der nicht zu seinem Typ passt, eine Feld-Regel verletzt oder als Pflichtwert fehlt, und ein Datensatz, der eine Regel unter `checks` verletzt;
- ein Datensatz mit mehr oder weniger Zellen, als die Tabelle Felder hat;
- in einer Masken-Datei ein unbekanntes Feld, ein unbekannter Platzhalter oder eine unbekannte Tabelle;
- eine Tabelle, deren Definition sich nicht lesen lässt; ihre Datensätze bleiben dann ungeprüft, und die Prüfung geht bei den übrigen Tabellen weiter.

**Die Prüfung ändert nichts.** Sie liest nur, und eine Funktion, die Befunde von selbst aufräumt, gibt es bewusst nicht: Welcher von zwei Datensätzen mit demselben Schlüssel der richtige ist, entscheiden Sie in der Maske. Das Ergebnis bleibt stehen, solange die Übersicht offen ist; nach einer Berichtigung prüfen Sie erneut.

Die Prüfung ist schnell: Bei einigen tausend Datensätzen dauert sie einige Dutzend Millisekunden. Ist der Index des Bereichs noch im Aufbau, sagt sie das und bittet, es gleich noch einmal zu versuchen.

## Verwendungsnachweis

Der **Verwendungsnachweis** sagt, wer eine Tabelle oder einen Datensatz benutzt. Gelesen wird erst, wenn Sie danach fragen, und geändert wird nichts.

**Für eine Tabelle** steht in ihrer Zeile der Übersicht die Aktion **«Verwendung»**. Sie nennt unter «Verwendet von» die Tabellen, die mit einer Verweis-Spalte auf diese Tabelle zeigen, je mit den Namen dieser Spalten, und die Masken-Dateien der Tabelle. Benutzt sie niemand, steht dort «Nicht verwendet».

**Für einen Datensatz** steht im Kopf seiner Maske, solange sie liest, die Aktion **«Verwendet von»**. Sie listet die Datensätze, die auf ihn verweisen, je mit Tabelle, Feld, Anzeige-Form und Kennung; ein Klick öffnet die Maske des verweisenden Datensatzes. Bei einer Neuanlage fehlt die Aktion, weil auf einen noch nicht gespeicherten Datensatz niemand verweisen kann.

**Die Liste am Datensatz ist die Vorschau des Lösch-Schutzes.** Sie sucht genau so wie die Prüfung beim Löschen, auch über die Kurzform der Kennung, über den Wert eines einteiligen Schlüssels und in den Folge-Dateien einer Tabelle. Steht ein Datensatz darin, lässt sich der gezeigte nicht löschen. Ein Datensatz, der auf sich selbst verweist, erscheint nicht, weil er sein eigenes Löschen nicht verhindert. Wie beim Lösch-Schutz zählt allein die Verweis-Spalte; ein Verweis im Fließtext, etwa `[[Kunden#^r-00001]]`, ist keine Verwendung.

## Auffindbarkeit: Suche und Verweise

Die Suche über den **Bereich** nimmt ein Tabellen-Dokument ohne seine Datensätze auf. Der erklärende Text über dem Datenblock bleibt durchsuchbar, ein Treffer dahinter führt weiterhin an die richtige Stelle, und die Datensätze selbst werden über diesen Weg nicht gefunden.

Der Grund liegt nicht in der Tabelle, sondern im Bereich: Der Suchraum hält die Texte aller Markdown-Dateien im Speicher und trägt dafür eine Obergrenze über den **ganzen** Bereich. Schon ein paar Tabellen mit einigen Megabyte reißen sie, und von da an liest jede Suche wieder von der Platte, auch die über jedes gewöhnliche Dokument. Die Datensätze im Suchraum kosteten also nicht sich selbst, sondern den ganzen Bereich seine Geschwindigkeit.

**Das ist ein Zwischenstand.** Bis Datensätze eine eigene Treffer-Art bekommen, sind sie über die Bereichs-Suche nicht auffindbar. Zwei Wege führen trotzdem zu ihnen:

- **Im geöffneten Dokument suchen.** Wer die Tabellen-Datei vor sich hat und darin sucht (Standard `Strg+F`), sucht im Text vor sich und findet seine Datensätze unverändert. Die Grenze oben betrifft allein die Suche über den Bereich.
- **Gezielt auf einen Datensatz verweisen**, wie im nächsten Abschnitt beschrieben.

### Verweis auf einen einzelnen Datensatz

Ein Verweis nennt die Tabelle und die interne Kennung, geschrieben wie ein Block-Anker:

```markdown
[[Personen#^r-00042]]
```

Der Verweis **gilt**, wenn die genannte Tabelle diesen Datensatz führt, und er ist gebrochen, wenn sie ihn nicht führt. Er verhält sich damit wie jeder andere Verweis der Anwendung. Er gilt auch dann, wenn der Datensatz nicht in der ersten Datei der Tabelle steht, sondern in einer ihrer Folge-Dateien: Für den Schreibenden ist die Tabelle eine, und ihre Verteilung auf Dateien geht ihn nichts an.

Geprüft wird gegen den **gespeicherten** Stand der Tabelle, wie bei jedem anderen Anker auch. Ein Verweis auf einen Datensatz, der eben angelegt und noch nicht gespeichert wurde, gilt deshalb noch nicht.

Ob ein Verweis gilt, zeigt der [Markdown-Linter](tools.md): Ein gebrochenes Ziel bekommt im Editor, also in der Quellcode-, der geteilten und der Live-Ansicht, eine gewellte Unterstreichung. Die reine Lese-Ansicht stellt Gültigkeit nicht dar; dort sehen gültige und gebrochene Verweise gleich aus.

Ein Klick öffnet die Tabellen-Datei. Auf den einzelnen Datensatz springt er noch nicht.

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

Jede dieser Angaben fehlt für sich, und keine ist Voraussetzung für die Tabellen: Jede Tabelle trägt ihre Definition selbst und bleibt auch ohne Steckbrief vollständig deutbar.

## Der Bereich als Datenbank

Sobald ein Dokument im Bestand eines Bereichs den Steckbrief trägt, führt die Anwendung diesen Bereich als **Datenbank-Bereich**. Sie erklären ihn nicht eigens dazu: Der Steckbrief ist die Erklärung. Damit steht die Aussage an einer Stelle statt an zweien, die einander widersprechen könnten.

Ein Datenbank-Bereich bekommt zwei Dinge, die ein gewöhnlicher Bereich nicht hat.

**Die Übersicht der Datenbank-Objekte** beantwortet an einer Stelle, was in diesem Bereich liegt: den Steckbrief mit Name und Beschreibung, die Tabellen je mit der Zahl ihrer Felder und die Fehlerlagen aus dem Einlesen der Definitionen, im Klartext statt als Code. Sie öffnet als eigener Reiter, und in ihr selbst wird nichts bearbeitet; ihre Aktionen führen in die Maske und in die Prüfungen. Drei Wege führen zu ihr:

- **Ansicht → Übersicht der Datenbank**,
- das **Kontextmenü des Bereichs-Panels**,
- die **Kommando-Palette**.

In einem Bereich ohne Datenbank wird keiner dieser Wege angeboten.

In der Tabellen-Liste nennt die Spalte **«Maske»** die Masken-Datei einer Tabelle und bleibt bei der erzeugten Maske leer. Dazu trägt die Übersicht vier Aktionen: **«Konsistenz prüfen»** im Kopf für alle Tabellen und in der Zeile jeder Tabelle **«Neuer Datensatz»**, **«Prüfen»** und **«Verwendung»**. Was sie tun, beschreiben die Abschnitte «Datensätze in der Maske bearbeiten», «Konsistenz-Prüfung» und «Verwendungsnachweis». Unter den Fehlerlagen stehen auch die Hinweise zu Masken-Dateien, benannt nach der Datei.

**Der Einstellungs-Abschnitt «Datenbank»** steht in der Navigations-Gruppe «Aktueller Bereich» (Datei → Einstellungen… → Aktueller Bereich → Datenbank; bei geöffnetem Buch heißt die Gruppe **Aktuelles Buch**, bei geöffnetem Bücherregal **Aktuelles Bücherregal**). Er zeigt dieselbe Auskunft in Kurzform, also Name und Beschreibung der Datenbank, die Zahl ihrer Tabellen und die Zahl der Fehlerlagen, und trägt eine Option: **«Übersicht beim Öffnen des Bereichs zeigen»**. Ist sie gesetzt, öffnet sich die Übersicht von selbst, sobald der Bereich gebunden wird. Die Option liegt in der Bereichsdatei und reist mit dem Bereichs-Ordner. Dazu kommt das Feld **«Name des Sperr-Ordners»**; es ist im Abschnitt «Sperren» beschrieben.

Dazu führt die Anwendung in der Wurzel des Bereichs die kleine Datei `Area_Database.mdda`. Sie trägt den Zählerstand der Vorgangs-Kennungen, erscheint in keiner Dateiliste und reist mit dem Bereichs-Ordner; an ihr ist nichts zu tun. Fehlt sie, gewinnt die Anwendung den Stand aus den Änderungsbelegen zurück.

## Fehlerhafte Angaben

Für die ganze Definition gilt die weiche Linie des Hauses: Eine defekte **Einzel-Angabe** entfällt und wird gemeldet, der Eintrag bleibt wirksam; ein defekter **Eintrag** entfällt, die übrigen Spalten bleiben. Die Meldung benennt die Stelle, also die betroffene Spalte, die fehlerhafte Angabe und das, was an ihrer Stelle erwartet wurde.

Die eine Ausnahme ist der **Typ**: Ein Typ außerhalb des Satzes oben lässt den ganzen Eintrag entfallen, weil eine Spalte ohne deutbaren Typ keine Spalte ist.

Eine Angabe, welche die Anwendung nicht kennt, entfällt einzeln mit einem Hinweis und richtet keinen Schaden an.

Für die Angabe `changeLog` der Änderungsbelege gelten drei eigene Fehlerlagen. Ist `changeLog` selbst kein Objekt, entfallen die eigenen Grenzen dieser Tabelle, und es gelten die Vorgaben der Anwendung. Ist `maxBytes` oder `maxPerRecord` weder eine ganze Zahl über null noch das Wort `unlimited`, entfällt die einzelne Angabe, und ihre Vorgabe gilt. Gemeldet wird jede dieser Lagen; still übergangen wird keine.

Für die Prüfregeln und die Bedingung der Bearbeitbarkeit gilt dieselbe weiche Linie, Regel für Regel. Eine unbrauchbare Regel unter `check` oder `checks` entfällt einzeln, und die übrigen Regeln, das Feld und die Tabelle bleiben; gemeldet werden ein Eintrag, der weder Text noch ein Objekt mit `rule` ist, ein ungültiger regulärer Ausdruck, ein ungültiger Ausdruck, eine Feld-Regel mit einem anderen Bezug als `value`, ein unbekannter Regel-Name und eine Regel unter `checks`, die ein unbekanntes Feld nennt. Ist `checks` keine Liste, entfallen alle Regeln unter `checks`. Eine unbrauchbare Angabe `editable` entfällt ebenso, und die Tabelle bleibt bearbeitbar. Ein Meldungstext, der sich nicht auslegen lässt, entfällt für sich allein; seine Regel oder Bedingung prüft weiter.

Für Masken-Dateien gilt dieselbe weiche Linie. Nennt der Behälter `db-form` keine Tabelle oder eine, die es in der Datenbank nicht gibt, bleibt die Datei ein gewöhnliches Dokument. Gibt es für eine Tabelle mehrere Masken-Dateien, gilt die erste nach Pfad, und die übrigen werden nicht verwendet. Diese drei Lagen stehen unter den Fehlerlagen der Übersicht. Ein Platzhalter, der kein Feld-Platzhalter ist, und ein Feld-Name, den die Tabelle nicht kennt, bleiben als Text stehen; sie meldet die Maske mit ihrer Zeile in ihrem Kopf, und die Konsistenz-Prüfung führt sie als Befund.

## Die Datenbank abschalten

Die gesamte Datenbank ist eine [interne Erweiterung](extensions.md) mit dem Namen «Datenbank» in der Kategorie Werkzeuge und lässt sich mit einem Schalter abschalten. Sie setzt die [Eigenschafts-Profile](property-profiles.md) voraus, weil die Gestalt einer Tabellen-Definition über ein internes Profil beschrieben und geprüft wird; solange die Datenbank eingeschaltet ist, lässt sich diese Grundlage deshalb nicht abschalten.

Im Aus-Zustand gilt:

- Der **Datensatz-Block bleibt ein gewöhnlicher Code-Block**, in der Lese-Ansicht, im Änderungs-Modus und im portablen Export. Sein Inhalt bleibt lesbar; abgeschaltet ist die Darstellung als Tabelle, nicht die Angabe.
- **Übersicht und Einstellungs-Abschnitt entfallen**, samt den Zugängen im Ansichtsmenü, im Kontextmenü des Bereichs-Panels und in der Kommando-Palette. Eine bereits geöffnete Übersicht bleibt stehen, bis Sie sie schließen, wie jede andere System-Seite.
- Mit dem Datensatz-Block entfallen seine Schaltflächen **«Datensatz öffnen»** und **«Neuer Datensatz»**, mit der Übersicht ihre Aktionen **«Konsistenz prüfen»**, **«Prüfen»** und **«Verwendung»**, und die Kommandos **«Neuer Datensatz in der aktiven Tabelle»** und **«Konsistenz der Datenbank prüfen»** verschwinden aus der Kommando-Palette. Damit ist auch die **Maske** nicht mehr erreichbar, und die Anwendung liefert ihr, der Konsistenz-Prüfung und dem Verwendungsnachweis keine Daten mehr.
- Ein **Verweis auf einen einzelnen Datensatz** wird nicht mehr als gebrochen markiert. Ohne Definitionen gibt es nichts, wogegen er zu prüfen wäre, und eine Warnung ohne Prüfung wäre eine Behauptung.
- Die **Suche über den Bereich bleibt unverändert**. Datensätze bleiben aus dem Volltext ausgenommen, weil diese Grenze an der Tabellen-Datei hängt und nicht am Schalter; der Abschnitt «Auffindbarkeit» oben gilt also weiter.
- **Geschrieben wird nicht.** Die Anwendung legt keine Datensätze an, ändert und löscht keine, nimmt keine Sperre und erzeugt keinen Änderungsbeleg; auch einen liegengebliebenen Speichervorgang schreibt sie in diesem Zustand nicht zu Ende.

**Die Dateien bleiben unangetastet.** Das Abschalten nimmt die Auslegung, nicht die Daten: Kein Zeichen wird geändert, und das Einschalten bringt alles zurück. Der Bereichs-Index wird dabei einmal neu aufgebaut; in großen Beständen dauert das einen Moment.
