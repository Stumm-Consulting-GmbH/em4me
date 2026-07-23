# Eigenschafts-Profile

Eigenschafts-Profile definieren Eigenschafts-Felder zentral für einen Bereich: pro Feld ein Name, ein Typ, optional ein fester Wertebereich (Einfach- oder Mehrfach-Auswahl) und ein Vorgabe-Wert. Der Properties-Editor und das Block-Eigenschaften-Panel schlagen die definierten Felder vor, bedienen Wertebereiche als Auswahl-Listen und übernehmen den Typ aus der Definition. Profile existieren nur im Bereichs-Kontext: Die Konfiguration liegt in der Bereichsdatei (Einstellungen → Eigenschafts-Profile), die Profile selbst sind normale Markdown-Dateien. Die Funktionalität ist als Erweiterung «Eigenschafts-Profile» schaltbar (Einstellungen → Erweiterungen); ohne Konfiguration oder bei ausgeschalteter Erweiterung verhalten sich beide Editoren wie gewohnt (Typ-Inferenz und Standard-Vorschläge).

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
| `multiple` | optional, nur mit `values`: Mehrfach-Auswahl — der Wert ist eine Liste, der Typ `multistring` |
| `default` | optional: Vorbelegung beim Anlegen des Felds über den Editor |

Ein `multistring`-Feld mit `values` ist automatisch eine Mehrfach-Auswahl. Defekte Einzel-Definitionen (etwa ein unbekannter Typ, ein doppelter Feldname oder `multiple` ohne `values`) setzen nur sich selbst aus; die übrigen Definitionen des Profils bleiben wirksam. Die Profil-Liste der Einstellungen zeigt solche Hinweise pro Profil und öffnet die Profil-Datei per Klick.

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

## Internes Profil

Neben den Profil-Dateien des Ordners gibt es das **interne Profil `Ereignis`** der Erweiterung [Ereignisse](events.md). Es steht automatisch in der Profil-Auflösung und in der Profil-Liste der Einstellungen (dort als internes Profil gekennzeichnet), definiert die acht `event-*`-Felder und ist weder änderbar noch löschbar; als Standard-Profil steht es nicht zur Wahl. Es wirkt auch ohne konfigurierten Profil-Ordner, mit dem Standard-Zuordnungs-Feld `class`; bei einer gleichnamigen Profil-Datei hat das interne Profil Vorrang. Mit deaktivierter Ereignis-Erweiterung verschwindet es aus Auflösung und Liste.

## Konflikt-Regeln

Für eine Datei gilt die Vereinigung aller Definitionen aus den zugeordneten Profilen plus dem Standard-Profil. Definiert mehr als ein Profil denselben Feldnamen, gilt deterministisch:

1. Ein **zugeordnetes Profil** gewinnt vor dem **Standard-Profil**.
2. Unter mehreren zugeordneten Profilen gewinnt das in der Zuordnungs-Liste **zuerst genannte**.

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

- Das Umbenennen einer Profil-Datei ändert die Zuordnungs-Werte in den Dokumenten nicht; sie zeigen dann auf ein nicht vorhandenes Profil (die Einstellungen markieren ein fehlendes Standard-Profil).
- Profile liegen direkt im Profil-Ordner; Unterordner werden nicht einbezogen.
- Die Definitionen wirken in den beiden Eigenschafts-Editoren; berechnete oder aus anderen Dateien abgeleitete Feld-Typen sind nicht Teil der Profile.
