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
| `type` | `string`, `multistring`, `number`, `boolean`, `date` oder `multiline`; ohne Angabe `string` |
| `values` | optional: fester Wertebereich als Werte-Liste (für `string`, `multistring`, `number` und `date`) |
| `multiple` | optional: Mehrfach-Auswahl — der Wert ist eine Liste, der Typ `multistring`; ein fester Wertebereich ist nicht mehr Voraussetzung |
| `default` | optional: Vorbelegung beim Anlegen des Felds über den Editor |
| `valuesFrom` | optional: Quelle des Wertevorrats mit `note` (Pfad einer Werte-Notiz) und/oder `query` (Abfrage); zusammen mit `values` gilt `values` |
| `options` | optional: typ-eigene Angaben als Unterobjekt, vorgesehen für kommende Typen |
| `fields` | optional: verschachtelte Kind-Definitionen nach demselben Schema, vorgesehen für strukturierte Typen |

Ein `multistring`-Feld mit `values` ist automatisch eine Mehrfach-Auswahl. **Der Feldname ist die einzige Pflichtangabe**: Jede andere Angabe ist optional, und bestehende Profil-Dateien bleiben unverändert gültig. `valuesFrom`, `options` und verschachtelte `fields` sind bereits Teil des Formats, werden in dieser Version aber noch nicht ausgewertet (Abschnitt «Grenzen»). Defekte Einzel-Definitionen (etwa ein unbekannter Typ oder ein doppelter Feldname) setzen nur sich selbst aus; die übrigen Definitionen des Profils bleiben wirksam. Die Profil-Liste der Einstellungen zeigt die Hinweise ausgeschrieben unter dem jeweiligen Profil — mit der betroffenen Definition, der fehlerhaften Angabe und dem, was an ihrer Stelle erwartet wurde, bei Kind-Definitionen mit dem Pfad zum Eltern-Feld — und öffnet die Profil-Datei per Klick.

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

Für eine Datei gilt die Vereinigung aller Definitionen aus den zugeordneten Profilen samt ihren Eltern-Ketten plus dem Standard-Profil mit seiner Kette. Die Auflösung ist **eine** geordnete Folge: je zugeordnetem Profil in Nennungs-Reihenfolge erst die eigenen Felder, dann die seiner Eltern-Kette von unten nach oben, danach dasselbe für das Standard-Profil; jedes Profil wird genau einmal verarbeitet. Definiert mehr als ein Profil denselben Feldnamen, gilt deterministisch:

1. Ein **zugeordnetes Profil** gewinnt vor dem **Standard-Profil**.
2. Unter mehreren zugeordneten Profilen gewinnt das in der Zuordnungs-Liste **zuerst genannte**.
3. Innerhalb einer Kette gewinnt das **erbende Profil** vor seinen Eltern; ein eigenes Feld überschreibt so das gleichnamige geerbte.

Ein Beispiel mit vier Profilen: `Alle` (Feld `tags`), `Projekt` (erbt von `Alle`; Felder `phase`, `status`), `Artikel` (erbt von `Projekt`, schließt `status` aus; eigene Felder `phase`, `autor`) und `Sitzung` (Felder `status`, `ort`). Ein Dokument mit `class: [Artikel, Sitzung]` und Standard-Profil `Alle` erhält `phase` und `autor` aus `Artikel`, `tags` über die Kette aus `Alle`, `status` und `ort` aus `Sitzung` — der Ausschluss in `Artikel` wirkt nur in dessen Kette, über `Sitzung` kommt `status` dennoch an.

## Wirkung in den Editoren

Die Definitionen wirken im Properties-Editor und identisch im Block-Eigenschaften-Panel; Blöcke einer Datei erben die Auflösung ihrer Datei.

- **Feld-Vorschläge**: «Eigenschaft hinzufügen» zeigt zuerst die definierten, noch nicht gesetzten Felder (mit dem Profil-Namen als Kennzeichnung), danach die üblichen Vorschläge; am Ende bleibt «Eigenes Feld» der freie Weg. Die Auswahl legt das Feld mit Definitions-Typ und Vorgabe-Wert an.
- **Auswahl-Listen**: Felder mit Wertebereich bieten die definierten Werte als Auswahl-Liste (Einfach-Auswahl) bzw. als Eingabe-Vorschläge der Chips-Leiste (Mehrfach-Auswahl); «Eigener Wert…» erlaubt weiterhin freie Eingaben.
- **Typ-Vorgabe**: Definierte Felder zeigen den Definitions-Typ, der Typ-Wechsler ist gesperrt und nennt das Profil. Weicht der vorhandene Wert vom Typ ab, bleibt der Wechsler frei, damit der Wert auf den Definitions-Typ umgestellt werden kann.
- Definierte Felder tragen eine dezente Markierung am Feldnamen; der Tooltip nennt das Profil.

## Komplett-Übernahme aller Felder

Das Vorschlags-Menü von «Eigenschaft hinzufügen» ist nach Profilen gruppiert: unter jedem **Profil-Namen** stehen eingerückt dessen noch nicht gesetzte Felder, darunter die profillosen Standard-Vorschläge unter «Weitere Felder». Ein Klick auf den **Profil-Namen** selbst ergänzt alle noch fehlenden Felder dieses Profils in einem Schritt; ein Klick auf ein einzelnes Feld übernimmt weiterhin nur dieses.

Die Übernahme ist bewusst additiv:

- Nur **fehlende** Felder werden angelegt; vorhandene Werte und die Feld-Reihenfolge bleiben unangetastet, es entstehen keine Duplikate.
- Ein Feld mit Vorgabe-Wert erhält diesen Wert; ein Feld ohne Vorgabe wird typgerecht leer angelegt: Text, Datum und Liste bleiben leer, eine Zahl startet bei `0`, ein Wahrheitswert bei «falsch». Die Inhalte pflegt man anschließend wie gewohnt.
- Im Dokument-Frontmatter erscheinen die leeren Felder als reiner Schlüssel ohne Wert (`feld:`).

Die gesamte Ergänzung ist ein einziger Schritt und lässt sich mit einem Rückgängig vollständig zurücknehmen. Sie gilt im Properties-Editor wie im Block-Eigenschaften-Panel und entfällt mit der ausgeschalteten Erweiterung «Eigenschafts-Profile».

## Weiche Validierung

Abweichungen blockieren nie und ändern nie den Wert: Ein Wert außerhalb des Wertebereichs oder ein Wert, der nicht zum definierten Typ passt, erzeugt lediglich ein Hinweis-Symbol am Feld; der Tooltip nennt den Grund. Markdown und Frontmatter bleiben frei editierbar — auch direkt im Quelltext.

## Grenzen

- Das Format sieht typ-eigene Optionen (`options`), Wertevorrats-Quellen (`valuesFrom`) und verschachtelte Kind-Definitionen bereits vor; ausgewertet werden sie in dieser Version noch nicht. Eine solche Angabe ist kein Fehler, sie bleibt bis zum Ausbau ohne Wirkung.
- Das Umbenennen einer Profil-Datei ändert die Zuordnungs-Werte in den Dokumenten nicht; sie zeigen dann auf ein nicht vorhandenes Profil (die Einstellungen markieren ein fehlendes Standard-Profil).
- Profile liegen direkt im Profil-Ordner; Unterordner werden nicht einbezogen.
- Die Definitionen wirken in den beiden Eigenschafts-Editoren; berechnete oder aus anderen Dateien abgeleitete Feld-Typen sind nicht Teil der Profile.
