# Eigenschafts-Profile

Eigenschafts-Profile definieren Eigenschafts-Felder zentral für einen Bereich: pro Feld ein Name, ein Typ, optional ein fester Wertebereich (Einfach- oder Mehrfach-Auswahl) und ein Vorgabe-Wert. Profile können voneinander erben (Abschnitt «Vererbung»). Der Properties-Editor und das Block-Eigenschaften-Panel schlagen die definierten Felder vor, bedienen Wertebereiche als Auswahl-Listen und übernehmen den Typ aus der Definition. Profile existieren nur im Bereichs-Kontext: Die Konfiguration liegt in der Bereichsdatei (Einstellungen → Eigenschafts-Profile), die Profile selbst sind normale Markdown-Dateien. Die Funktionalität ist als Erweiterung «Eigenschafts-Profile» schaltbar (Einstellungen → Erweiterungen); ohne Konfiguration oder bei ausgeschalteter Erweiterung verhalten sich beide Editoren wie gewohnt (Typ-Inferenz und Standard-Vorschläge).

## Profil-Dateien und Definitions-Format

Ein Profil ist eine Markdown-Datei im konfigurierten Profil-Ordner; der Profil-Name ist der Dateiname ohne Endung. Die Feld-Definitionen stehen im Frontmatter unter dem Schlüssel `fields`, der Datei-Inhalt darunter ist freie Beschreibung:

```yaml
---
fields:
  - name: status
    values: [offen, in Arbeit, erledigt]
    default: offen
  - name: budget
    type: number
  - name: themen
    type: multistring
    values: [Projekt, Person, Ort]
  - name: fällig
    type: date
---
```

Attribute pro Definition:

| Attribut | Bedeutung |
| --- | --- |
| `name` | Feldname (Pflicht, pro Profil eindeutig) |
| `type` | `string`, `multistring`, `number`, `boolean`, `date`, `multiline`, `link` (Verweis auf eine Datei) oder `time` (Uhrzeit); ohne Angabe `string` |
| `values` | optional: fester Wertebereich als Werte-Liste (für `string`, `multistring`, `number` und `date`) |
| `multiple` | optional: mehrere Werte — der Wert ist eine Liste. Gilt für jeden Typ außer `boolean` und `multiline`; nur beim Textfeld wechselt der Typ dabei auf `multistring`, sonst bleibt der Typ-Name stehen (ein Verweis-Feld mit mehreren Zielen ist `link` mit `multiple`) |
| `default` | optional: Vorbelegung beim Anlegen des Felds über den Editor |
| `valuesFrom` | optional: Quelle des Wertevorrats mit `note` (Pfad einer Werte-Notiz) und/oder `query` (Abfrage), siehe «Wertevorräte»; zusammen mit `values` gilt `values` |
| `options` | optional: typ-eigene Angaben als Unterobjekt, siehe Tabelle unten |
| `fields` | optional: verschachtelte Kind-Definitionen nach demselben Schema, vorgesehen für strukturierte Typen |

Ein `multistring`-Feld mit `values` ist automatisch eine Mehrfach-Auswahl. **Der Feldname ist die einzige Pflichtangabe**: Jede andere Angabe ist optional, und bestehende Profil-Dateien bleiben unverändert gültig. Verschachtelte `fields` sind bereits Teil des Formats, werden aber erst mit den strukturierten Typen ausgewertet (Abschnitt «Grenzen»). Defekte Einzel-Definitionen (etwa ein unbekannter Typ oder ein doppelter Feldname) setzen nur sich selbst aus; die übrigen Definitionen des Profils bleiben wirksam. Die Profil-Liste der Einstellungen zeigt die Hinweise ausgeschrieben unter dem jeweiligen Profil — mit der betroffenen Definition, der fehlerhaften Angabe und dem, was an ihrer Stelle erwartet wurde, bei Kind-Definitionen mit dem Pfad zum Eltern-Feld — und öffnet die Profil-Datei per Klick.

### Typ-eigene Optionen

Das Unterobjekt `options` trägt die Angaben, die nur für einen bestimmten Typ gelten:

| Typ | Angabe | Bedeutung |
| --- | --- | --- |
| `number` | `step`, `min`, `max` | Schrittweite und Grenzen des Zahlenfelds |
| `date` | `shift` | Verschiebung in Tagen; sie belegt ein **leeres** Feld beim ersten Anklicken vor, ein vorhandenes Datum bleibt unangetastet |
| `link` | `restrictTo`, `display`, `sort` | Ordner-Pfad (oder Liste), auf den die Vorschläge eingegrenzt werden; Frontmatter-Feld des Ziels als Anzeige-Name; Reihenfolge `name` oder `path` |
| Auswahl-Feld | `control: cycle` | Die Einfach-Auswahl wird ein Knopf, der beim Klick zum nächsten Wert schaltet; der gespeicherte Wert bleibt derselbe wie ohne die Option |

Eine unbekannte oder unpassend belegte Angabe entfällt einzeln mit einem Hinweis; das Feld und die übrigen Angaben bleiben wirksam. Eine Option, die für einen späteren Typ gedacht ist, darf also schon dastehen, ohne Schaden anzurichten.

## Wertevorräte

Der zulässige Wertevorrat eines Auswahl-Feldes hat drei mögliche Quellen: die feste Liste `values`, eine **Werte-Notiz** oder eine **Abfrage**. `values` und `valuesFrom` schließen einander aus; stehen beide da, gilt `values`, und die Profil-Liste der Einstellungen meldet den Widerspruch.

```yaml
---
fields:
  - name: ort
    valuesFrom:
      note: 90 Organisation/Werte/Orte.md
  - name: projekt
    type: link
    valuesFrom:
      query: WHERE art = "projekt"
---
```

Eine **Werte-Notiz** ist eine gewöhnliche Notiz mit einem Wert je Zeile; ihr Pfad ist bereichs-relativ. Leerzeilen und Randleerraum entfallen, ein Metadaten-Block der Notiz gehört nicht zum Vorrat. Sie wird wie eine Profil-Datei nachgezogen: Eine Änderung wirkt ohne Neustart, auch wenn sie von außen kommt. Damit ist der Wertevorrat gewöhnlicher Inhalt, den man verlinken, kommentieren und weitergeben kann.

Eine **Abfrage** liefert die Werte aus dem Bestand — die Namen ihrer Treffer. Sie wird erst ausgewertet, wenn ein Feld ihren Vorrat wirklich braucht, und bis zur nächsten Bestands-Änderung gemerkt; vorab über den Gesamtbestand wird nichts gerechnet. Ein Dokument ohne Abfrage-Feld kostet dadurch keine Auswertung.

Fehlt eine Quelle, ist sie leer oder nicht auswertbar, dann **bleibt das Feld bedienbar**: Der Vorrat ist leer, ein Hinweis steht am Feld, und eigene Werte sind wie überall möglich.

## Zuordnung und Standard-Profil

Dokumente ordnen sich über ein Frontmatter-Feld zu; der Feldname ist pro Bereich einstellbar (Standard `class`). Der Wert ist ein Profil-Name oder eine Liste mehrerer Profil-Namen:

```yaml
---
class:
  - Projekt
  - Person
---
```

Zusätzlich kann ein **Standard-Profil** gewählt werden: Seine Definitionen gelten für alle Dateien des Bereichs, auch ohne Zuordnungs-Feld. Profil-Namen matchen unabhängig von Groß- und Kleinschreibung.

Ein Dokument findet sein Profil außerdem über ein **Schlagwort** oder seinen **Ordner**, ohne dass in ihm ein Zuordnungs-Feld stehen muss. Diese Bindungen gehören zum Bereich und werden unter Einstellungen → Eigenschafts-Profile eingerichtet: je Zeile ein Profil, seine Schlagworte und seine Ordner-Pfade.

- **Schlagwort**: Es zählt gleichermaßen aus dem Metadaten-Block (`tags`) und aus dem Text (`#schlagwort`) — für die Zuordnung ist ein Schlagwort ein Schlagwort. Auch eine noch ungespeicherte Änderung wirkt sofort.
- **Ordner**: Ein gebundener Pfad schließt seine Unterordner ein, damit eine spätere Unterteilung nicht nachgepflegt werden muss. Verglichen wird der bereichs-relative Pfad an ganzen Ordner-Namen; «10 Projekte Archiv» fällt also nicht unter «10 Projekte».

## Vererbung

Ein Profil kann die Definitionen eines anderen erben. Der Metadaten-Block der Profil-Datei nennt dafür neben `fields` höchstens ein Eltern-Profil und optional auszuschließende Feldnamen:

```yaml
---
extends: Projekt
exclude: [status]
fields:
  - name: phase
  - name: autor
---
```

- `extends` nennt das Eltern-Profil; Ketten über mehrere Ebenen sind möglich, mehr als ein Eltern-Profil gibt es nicht.
- `exclude` schließt geerbte Felder aus. Der Ausschluss wirkt in der Vererbungs-Kette, in der er steht, nicht für das ganze Dokument.
- Ein eigenes Feld gleichen Namens überschreibt das geerbte vollständig.

Ein Zyklus in der Eltern-Beziehung oder ein nicht vorhandenes Eltern-Profil beendet nur die betroffene Kette und erzeugt einen Hinweis in der Profil-Liste der Einstellungen; die Auflösung läuft weiter.

## Internes Profil

Neben den Profil-Dateien des Ordners gibt es das **interne Profil `Ereignis`** der Erweiterung [Ereignisse](events.md). Es steht automatisch in der Profil-Auflösung und in der Profil-Liste der Einstellungen (dort als internes Profil gekennzeichnet), definiert die acht `event-*`-Felder und ist weder änderbar noch löschbar; als Standard-Profil steht es nicht zur Wahl. Es wirkt auch ohne konfigurierten Profil-Ordner, mit dem Standard-Zuordnungs-Feld `class`; bei einer gleichnamigen Profil-Datei hat das interne Profil Vorrang. Mit deaktivierter Ereignis-Erweiterung verschwindet es aus Auflösung und Liste.

## Konflikt-Regeln

Für eine Datei gilt die Vereinigung aller Definitionen aus allen Profilen, die sie erreichen. Die Auflösung ist **eine** geordnete Folge in vier Stufen, von der ausdrücklichsten zur allgemeinsten Aussage:

1. das **Zuordnungs-Feld** des Dokuments, in Nennungs-Reihenfolge
2. ein **Schlagwort** des Dokuments
3. der **Ordner** des Dokuments
4. das **Standard-Profil** des Bereichs

Je erreichtem Profil laufen erst seine eigenen Felder, dann die seiner Eltern-Kette von unten nach oben; jedes Profil wird über alle Stufen hinweg genau einmal verarbeitet. Definiert mehr als ein Profil denselben Feldnamen, gilt deterministisch:

1. Der **erste Treffer der Folge** gewinnt — ein Weg weiter oben schlägt jeden weiter unten.
2. Unter mehreren Profilen derselben Stufe gewinnt das **zuerst genannte** (Zuordnungs-Liste bzw. Reihenfolge der Bindungen).
3. Innerhalb einer Kette gewinnt das **erbende Profil** vor seinen Eltern; ein eigenes Feld überschreibt so das gleichnamige geerbte.

Die Wege **ergänzen einander, sie ersetzen sich nicht**: Ein Dokument mit Zuordnungs-Feld und passendem Ordner trägt die Felder aus beiden. Ein Weg, der auf ein bereits erreichtes Profil zeigt, fügt nichts hinzu — das ergibt sich aus «jedes Profil genau einmal» und braucht keine eigene Regel. Und ein Widerspruch zwischen Schlagwort und Ordner ist keiner: Die Ordnung entscheidet, es gibt weder Rückfrage noch Warnung.

Ein Beispiel mit vier Profilen: `Alle` (Feld `tags`), `Projekt` (erbt von `Alle`; Felder `phase`, `status`), `Artikel` (erbt von `Projekt`, schließt `status` aus; eigene Felder `phase`, `autor`) und `Sitzung` (Felder `status`, `ort`). Ein Dokument mit `class: [Artikel, Sitzung]` und Standard-Profil `Alle` erhält `phase` und `autor` aus `Artikel`, `tags` über die Kette aus `Alle`, `status` und `ort` aus `Sitzung` — der Ausschluss in `Artikel` wirkt nur in dessen Kette, über `Sitzung` kommt `status` dennoch an.

## Profil-Symbol am Dokument

Ein Profil kann ein **Symbol** führen — ein einzelnes Zeichen, üblicherweise ein Emoji, im Metadaten-Block der Profil-Datei:

```yaml
---
icon: 📅
fields:
  - name: ort
---
```

Der Kopf der Eigenschaften-Sektion zeigt das Symbol des Profils, das für das Dokument **zuerst** aufgelöst wurde; der Tooltip nennt dessen Namen und die Stufe, über die es gefunden wurde. Das ist der eigentliche Zweck: Sobald Schlagwort und Ordner mitbestimmen, kann ein Dokument Felder tragen, von denen in ihm selbst nichts steht — das Symbol beantwortet dann die Frage, warum.

Ohne Profil oder ohne Symbol erscheint nichts; ein Platzhalter entsteht nicht. Eine Angabe aus mehr als einem Zeichen entfällt mit Hinweis, das Profil bleibt wirksam.

## Wirkung in den Editoren

Die Definitionen wirken im Properties-Editor und identisch im Block-Eigenschaften-Panel; Blöcke einer Datei erben die Auflösung ihrer Datei.

- **Feld-Vorschläge**: «Eigenschaft hinzufügen» zeigt zuerst die definierten, noch nicht gesetzten Felder (mit dem Profil-Namen als Kennzeichnung), danach die üblichen Vorschläge; am Ende bleibt «Eigenes Feld» der freie Weg. Die Auswahl legt das Feld mit Definitions-Typ und Vorgabe-Wert an.
- **Auswahl-Listen**: Felder mit Wertebereich bieten die definierten Werte als Auswahl-Liste (Einfach-Auswahl) bzw. als Eingabe-Vorschläge der Chips-Leiste (Mehrfach-Auswahl); «Eigener Wert…» erlaubt weiterhin freie Eingaben.
- **Typ-Vorgabe**: Definierte Felder zeigen den Definitions-Typ, der Typ-Wechsler ist gesperrt und nennt das Profil. Weicht der vorhandene Wert vom Typ ab, bleibt der Wechsler frei, damit der Wert auf den Definitions-Typ umgestellt werden kann.
- **Verweis-Felder** bieten die Ziele des Bereichs als Vervollständigung, markieren ein nicht vorhandenes Ziel und öffnen es über den Pfeil — denselben Weg wie ein Klick auf einen Wiki-Link. Mit `multiple` tragen sie mehrere Ziele in der Chips-Leiste.
- **Uhrzeit-Felder** nutzen das Zeit-Bedienelement; der Wert steht im Metadaten-Block in Anführungszeichen, weil `09:30` sonst als Zahl gelesen würde.
- Definierte Felder tragen eine dezente Markierung am Feldnamen; der Tooltip nennt das Profil.

## Komplett-Übernahme aller Felder

Das Vorschlags-Menü von «Eigenschaft hinzufügen» ist nach Profilen gruppiert: unter jedem **Profil-Namen** stehen eingerückt dessen noch nicht gesetzte Felder, darunter die profillosen Standard-Vorschläge unter «Weitere Felder». Ein Klick auf den **Profil-Namen** selbst ergänzt alle noch fehlenden Felder dieses Profils in einem Schritt; ein Klick auf ein einzelnes Feld übernimmt weiterhin nur dieses.

Die Übernahme ist bewusst additiv:

- Nur **fehlende** Felder werden angelegt; vorhandene Werte und die Feld-Reihenfolge bleiben unangetastet, es entstehen keine Duplikate.
- Ein Feld mit Vorgabe-Wert erhält diesen Wert; ein Feld ohne Vorgabe wird typgerecht leer angelegt: Text, Datum und Liste bleiben leer, eine Zahl startet bei `0`, ein Wahrheitswert bei «falsch». Die Inhalte pflegt man anschließend wie gewohnt.
- Im Dokument-Frontmatter erscheinen die leeren Felder als reiner Schlüssel ohne Wert (`feld:`).

Die gesamte Ergänzung ist ein einziger Schritt und lässt sich mit einem Rückgängig vollständig zurücknehmen. Sie gilt im Properties-Editor wie im Block-Eigenschaften-Panel und entfällt mit der ausgeschalteten Erweiterung «Eigenschafts-Profile».

## Feld-Formular des Dokuments

Die Sektion zeigt oben die Felder, die im Dokument stehen, und darunter den Ausklapp-Bereich **«Alle Felder dieses Dokuments»** mit den Feldern, die die geltenden Profile definieren und das Dokument noch nicht trägt. Beides zusammen ist die vollständige Antwort auf die Frage, was dieses Dokument tragen kann; die Vereinigung wird aufgeteilt und nicht verdoppelt, damit kein Feld zweimal erscheint.

**Herkunft je Feld.** Jedes Feld trägt das Symbol des Profils, aus dem seine Definition stammt; der Tooltip nennt Profil und Weg. Bei einer geerbten Definition ist das dasjenige Profil, in dem sie wirklich steht — nicht das zugeordnete.

**Die Kette der geltenden Profile** steht über den fehlenden Feldern, denn sie beantwortet die Frage, aus der die Felder erst folgen. Je Ebene stehen Symbol, Profil-Name und der Weg, über den das Profil gilt; die Vererbungs-Tiefe wird als **Einrückung** sichtbar. Ab der ersten geerbten Ebene nennt die Zeile «geerbt» statt des Weges — ein geerbtes Profil gilt über denselben Weg wie sein Kind, und dort ist die Vererbung die Aussage, die weiterhilft.

**Übernahme je Ebene.** Neben einer Ebene, auf der Felder fehlen, steht ein Knopf, der genau deren fehlende Felder in einem Zug anlegt: mit typgerechtem Leer-Wert, ohne vorhandene Werte anzurühren und als eine einzige Rückgängig-Einheit — derselbe Weg wie die Komplett-Übernahme. Eine Ebene ohne fehlende Felder trägt keinen Knopf; er verspräche eine Handlung, die nichts tut.

**Ein Feld, das noch nicht im Dokument steht, bleibt draußen, solange es leer ist.** Das Aufklappen allein schreibt also nichts in den Metadaten-Block; erst ein eingetragener Wert oder die Übernahme macht das Feld zu einem Feld des Dokuments.

Bei defektem Metadaten-Block erscheint der Bereich nicht — dort gilt derselbe Hinweis wie für «Eigenschaft hinzufügen». Ohne geltendes Profil und bei ausgeschalteter Erweiterung «Eigenschafts-Profile» erscheint er ebenfalls nicht; ein leerer Bereich oder ein Platzhalter entsteht nie.

**Drei Zugänge** führen zum Formular: der Ausklapp-Bereich selbst, das Kommando «Feld-Formular des Dokuments öffnen» und der Eintrag «Feld-Formular öffnen» im Kontextmenü des Reiters. Die beiden letzten machen die Sektion sichtbar, falls sie verborgen ist, klappen den Bereich auf und rücken ihn in den sichtbaren Ausschnitt; der Kontextmenü-Eintrag meint den angeklickten Reiter und aktiviert ihn zuvor.

## Sicht je Profil als Abfrage

Die Frage «welche Dokumente gehören zu diesem Profil» ist eine Abfrage, und das Kommando **«Profil-Abfrage einfügen»** schreibt sie fertig hin: Es fragt das Profil ab, sofern mehrere in Frage kommen, und fügt an der Cursor-Position einen gewöhnlichen Abfrage-Block ein. Eine eigene Ansicht entsteht nicht — die Ausgabe läuft über die vorhandene Ergebnis-Darstellung der Abfrage-Sprache.

Die erzeugte Abfrage erfasst alle drei ausdrücklichen Zuordnungs-Wege des Profils — das Zuordnungs-Feld, jede Schlagwort-Bindung und jede Ordner-Bindung. Eine Ordner-Bedingung schließt die Unterordner ein, genau wie die Bindung selbst:

````markdown
```perspective-query
LIST
WHERE class = "Projekt"
  OR icontains(file.tags, "projekt")
  OR (file.folder = "10 Projekte" OR startswith(lower(file.folder), "10 projekte/"))
```
````

Zwei Fälle weichen davon ab:

- **Das Standard-Profil des Bereichs** gilt für alles, was keine andere Zuordnung hat. Für es entsteht deshalb eine Abfrage über alle Dokumente des Bereichs statt der Verneinung sämtlicher Bindungen — die wäre lang, undurchsichtig und würde still falsch, sobald eine Bindung hinzukommt.
- **Erbende Profile bleiben außen vor.** Erbt `Kunde` von `Projekt`, so erscheinen Kunde-Dokumente nicht in der Abfrage zu `Projekt`: Sie tragen dessen Felder, sind aber keine Projekte.

Der eingefügte Block ist von da an gewöhnlicher Inhalt — er lässt sich ändern, um Spalten, Sortierung oder Begrenzung erweitern, verschieben und löschen wie jede andere Abfrage. Ein Dokument, das ihn enthält, ist damit zugleich eine gespeicherte Sicht: benennbar, verlinkbar, mit einem Lesezeichen versehbar. Umgekehrt gilt: Die Abfrage bildet die Zuordnung zum **Zeitpunkt der Erzeugung** ab. Kommt später eine Bindung hinzu, zieht der bereits geschriebene Block nicht nach; dann wird er neu erzeugt oder von Hand ergänzt.

Das Kommando entfällt mit der ausgeschalteten Erweiterung «Eigenschafts-Profile».

## Weiche Validierung

Abweichungen blockieren nie und ändern nie den Wert: Ein Wert außerhalb des Wertebereichs oder ein Wert, der nicht zum definierten Typ passt, erzeugt lediglich ein Hinweis-Symbol am Feld; der Tooltip nennt den Grund. Markdown und Frontmatter bleiben frei editierbar — auch direkt im Quelltext.

## Grenzen

- Verschachtelte Kind-Definitionen (`fields`) sind bereits Teil des Formats; ausgewertet werden sie erst mit den strukturierten Typen. Eine solche Angabe ist kein Fehler, sie bleibt bis dahin ohne Wirkung.
- Das Umbenennen einer Profil-Datei ändert die Zuordnungs-Werte in den Dokumenten nicht; sie zeigen dann auf ein nicht vorhandenes Profil (die Einstellungen markieren ein fehlendes Standard-Profil).
- Profile liegen direkt im Profil-Ordner; Unterordner werden nicht einbezogen.
- Die Definitionen wirken in den beiden Eigenschafts-Editoren; berechnete oder aus anderen Dateien abgeleitete Feld-Typen sind noch nicht Teil der Profile.
- Die Bindung eines Profils an eine Lesezeichen-Gruppe und die Zuordnung über eine Abfrage sind bewusst zurückgestellt; Schlagwort und Ordner decken die belegten Fälle ab und bleiben erklärbar.
