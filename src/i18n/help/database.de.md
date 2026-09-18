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

## Anzeige der Datensätze

In der Lese-Ansicht und im Änderungs-Modus erscheint der Block als Tabelle mit den Spalten der Definition. Jeder Wert wird nach dem Typ seiner Spalte dargestellt: Zahlen rechtsbündig und mit den erklärten Nachkommastellen, Wahrheitswerte als Haken, mehrzeilige Werte mit ihren Umbrüchen. Passt ein Wert nicht zu seinem Typ, zeigt die Zelle ihren ursprünglichen Text und wird farblich gekennzeichnet, statt ersetzt zu werden.

Ab **2000 Datensätzen** zeigt die Anzeige einen Ausschnitt und schreibt darunter, wovon er einer ist. Das ist ein Fenster und keine stille Kappung: Sie sehen, dass mehr da ist. Die Grenze ist gemessen und nicht gesetzt — bis dahin erscheint die Tabelle ohne merkliche Wartezeit.

Beim **portablen Export** steht die Tabelle dagegen vollständig, ohne Fenster. Eine Datei, die Sie weitergeben, darf nichts verschweigen: Der Empfänger hat die Anwendung nicht und sähe nicht, dass etwas fehlt.

Bearbeitet werden Datensätze in dieser Ansicht nicht. Die Tabellen-Datei ist technische Ablage — sie bleibt von Hand lesbar und im Notfall auch von Hand korrigierbar, aber im Regelbetrieb arbeiten Sie nicht in ihr.

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

**Die Übersicht der Datenbank-Objekte** beantwortet an einer Stelle, was in diesem Bereich liegt: den Steckbrief mit Name und Beschreibung, die Tabellen je mit der Zahl ihrer Felder und die Fehlerlagen aus dem Einlesen der Definitionen, im Klartext statt als Code. Sie öffnet als eigener Reiter und ist eine reine Lese-Ansicht; bearbeitet wird in ihr nichts. Drei Wege führen zu ihr:

- **Ansicht → Übersicht der Datenbank**,
- das **Kontextmenü des Bereichs-Panels**,
- die **Kommando-Palette**.

In einem Bereich ohne Datenbank wird keiner dieser Wege angeboten.

**Der Einstellungs-Abschnitt «Datenbank»** steht in der Navigations-Gruppe «Aktueller Bereich» (Datei → Einstellungen… → Aktueller Bereich → Datenbank). Er zeigt dieselbe Auskunft in Kurzform, also Name und Beschreibung der Datenbank, die Zahl ihrer Tabellen und die Zahl der Fehlerlagen, und trägt eine Option: **«Übersicht beim Öffnen des Bereichs zeigen»**. Ist sie gesetzt, öffnet sich die Übersicht von selbst, sobald der Bereich gebunden wird. Die Option liegt in der Bereichsdatei und reist mit dem Bereichs-Ordner.

## Fehlerhafte Angaben

Für die ganze Definition gilt die weiche Linie des Hauses: Eine defekte **Einzel-Angabe** entfällt und wird gemeldet, der Eintrag bleibt wirksam; ein defekter **Eintrag** entfällt, die übrigen Spalten bleiben. Die Meldung benennt die Stelle, also die betroffene Spalte, die fehlerhafte Angabe und das, was an ihrer Stelle erwartet wurde.

Die eine Ausnahme ist der **Typ**: Ein Typ außerhalb des Satzes oben lässt den ganzen Eintrag entfallen, weil eine Spalte ohne deutbaren Typ keine Spalte ist.

Eine Angabe, welche die Anwendung nicht kennt, entfällt einzeln mit einem Hinweis und richtet keinen Schaden an.

## Die Datenbank abschalten

Die gesamte Datenbank ist eine [interne Erweiterung](extensions.md) mit dem Namen «Datenbank» in der Kategorie Werkzeuge und lässt sich mit einem Schalter abschalten. Sie setzt die [Eigenschafts-Profile](property-profiles.md) voraus, weil die Gestalt einer Tabellen-Definition über ein internes Profil beschrieben und geprüft wird; wird die Grundlage abgeschaltet, schaltet das die Datenbank mit ab.

Im Aus-Zustand gilt:

- Der **Datensatz-Block bleibt ein gewöhnlicher Code-Block**, in der Lese-Ansicht, im Änderungs-Modus und im portablen Export. Sein Inhalt bleibt lesbar; abgeschaltet ist die Darstellung als Tabelle, nicht die Angabe.
- **Übersicht und Einstellungs-Abschnitt entfallen**, samt den Zugängen im Ansichtsmenü, im Kontextmenü des Bereichs-Panels und in der Kommando-Palette. Eine bereits geöffnete Übersicht bleibt stehen, bis Sie sie schließen, wie jede andere System-Seite.
- Ein **Verweis auf einen einzelnen Datensatz** wird nicht mehr als gebrochen markiert. Ohne Definitionen gibt es nichts, wogegen er zu prüfen wäre, und eine Warnung ohne Prüfung wäre eine Behauptung.
- Die **Suche über den Bereich bleibt unverändert**. Datensätze bleiben aus dem Volltext ausgenommen, weil diese Grenze an der Tabellen-Datei hängt und nicht am Schalter; der Abschnitt «Auffindbarkeit» oben gilt also weiter.

**Die Dateien bleiben unangetastet.** Das Abschalten nimmt die Auslegung, nicht die Daten: Kein Zeichen wird geändert, und das Einschalten bringt alles zurück. Der Bereichs-Index wird dabei einmal neu aufgebaut; in großen Beständen dauert das einen Moment.
