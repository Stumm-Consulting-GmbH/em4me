# Journale

Journale sind Serien periodischer Dokumente in einem Bereich: pro Journal eine **Granularität** (Tag, Woche, Monat, Quartal oder Jahr), ein **Ordner-** und ein **Namens-Schema** aus Datums-Platzhaltern, optional eine Vorlage und automatische Datums-Eigenschaften im Frontmatter. **Regale** gruppieren mehrere Journale, etwa Tag bis Jahr eines Tagebuchs. Einträge werden geöffnet oder beim ersten Zugriff angelegt — über die Kommandos, das Kalender-Panel oder den Navigations-Block.

Journale existieren nur im Bereichs-Kontext: Die Konfiguration liegt in der Bereichsdatei, alle Pfade sind relativ zur Bereichs-Wurzel. Ohne Bereich melden Kommandos und Panel einen Hinweis. Die Funktionalität ist als Erweiterung «Journale» schaltbar (Einstellungen → Erweiterungen).

## Journale und Regale definieren

Einstellungen → Journale zeigt die Regale des Bereichs; «Öffnen» an einem Regal führt zu dessen Journalen, «Regal schließen» zurück zur Übersicht (die Zeile «Ohne Regal» sammelt Journale ohne Zuordnung). Pro Journal:

- **Name** und optional ein **Regal**.
- **Granularität**: Tag, Woche, Monat, Quartal oder Jahr.
- **Ordner-Schema** und **Namens-Schema**: Literale plus Datums-Platzhalter der Vorlagen (`{{date::…}}`), ausgewertet am Perioden-Start. Eine Live-Vorschau zeigt den Beispiel-Pfad der heutigen Periode.
- **Vorlage** (optional) aus dem Vorlagen-Ordner; beim Anlegen läuft die volle Platzhalter-Auswertung inklusive Dialogen.
- **Start-/End-Datum** (optional): davor bzw. danach entstehen keine Einträge, die Navigation endet dort.
- **Feldnamen** der automatischen Datums-Eigenschaften.

Beispiel eines Wochen-Journals mit Jahres-Unterordnern:

| Feld | Wert |
| --- | --- |
| Granularität | Woche |
| Ordner-Schema | `Tagebuch/{{date::yyyy}}` |
| Namens-Schema | `{{date::kkkk-KWww}}` |

Der Eintrag der Kalenderwoche 28 von 2026 liegt damit unter `Tagebuch/2026/2026-KW28.md`. Für Kalenderwochen stehen zwei zusätzliche Format-Token bereit: `ww` (ISO-Kalenderwoche, zweistellig) und `kkkk` (KW-Jahr, das am Jahreswechsel vom Kalenderjahr abweichen kann); Großbuchstaben wie `KW` bleiben Literal. Für Quartale liefert das Token `q` die Quartals-Nummer (1–4), etwa `{{date::yyyy-Qq}}` → `2026-Q3`.

Ein geändertes Schema benennt bestehende Dateien nicht um; Kalender-Punkte und Eintrags-Erkennung folgen dem neuen Schema. Bestehende periodische Dateien passen automatisch, wenn Ordner- und Namens-Schema identisch zu ihnen konfiguriert werden.

## Einträge öffnen und anlegen

- **Heutiger Journal-Eintrag** (Menü Datei → Weitere Datei-Funktionen): öffnet den heutigen Eintrag eines Tages-Journals bzw. legt ihn an; bei mehreren Tages-Journalen mit Auswahl.
- **Journal-Eintrag für Datum…** (Menü Datei → Weitere Datei-Funktionen): fragt ein Datum (JJJJ-MM-TT) und das Journal ab; die Periode ist die des Datums in der Granularität des Journals.
- **Offene Aufgaben in den aktuellen Journal-Eintrag übertragen** (Menü Datei → Weitere Datei-Funktionen): öffnet bzw. legt den Eintrag der laufenden Periode an und überträgt die offenen Aufgaben des letzten Eintrags hinein; siehe Abschnitt „Offene Aufgaben übertragen“.

Beim Anlegen entstehen die Ordner-Kette, der gefüllte Vorlagen-Inhalt (ohne Vorlage ein leerer Eintrag) und die Journal-Eigenschaften im Frontmatter. Ein Eintrag trägt **vier** Eigenschaften, unabhängig von seiner Granularität: den Namen des Journals (`journal`), das Perioden-Datum (`journal-date`), den Perioden-Start (`journal-start-date`) und das Perioden-Ende (`journal-end-date`). Das Perioden-Datum ist stets der **Beginn** der Periode; bei Tages-Einträgen stimmen deshalb alle drei Datums-Angaben überein. Die Feldnamen sind pro Journal einstellbar und stehen der Perspective-Abfrage zur Verfügung — weil jeder Eintrag denselben Satz trägt, braucht eine Abfrage nicht nach Granularität zu unterscheiden. Datums-Platzhalter der Vorlage werden am Perioden-Start ausgewertet — `{{date}}` liefert im Eintrag das Perioden-Datum, nicht den Anlage-Zeitpunkt. Ein Abbruch eines Vorlagen-Dialogs bricht das Anlegen ab; es entsteht keine Datei.

Ein **bereits bestehender** Eintrag wird nachgepflegt, wenn ihm Eigenschaften fehlen — etwa weil er aus einer anderen Anwendung stammt oder von Hand angelegt wurde. Das geschieht auf zwei Wegen. Beim **Öffnen** über Kommando, Kalender oder Navigations-Block werden fehlende Eigenschaften stillschweigend ergänzt; ist der Eintrag bereits vollständig, bleibt die Datei unberührt. Das Kommando **Journal-Eigenschaften nachtragen…** holt denselben Stand für alle vorhandenen Einträge eines Journals auf einmal; es nennt vorher die Zahl der geprüften Einträge und verlangt eine Bestätigung.

Anlegen und Nachpflegen verhalten sich dabei bewusst verschieden: Beim **Anlegen** setzt die Anwendung die Eigenschaften und übersteuert gleichnamige Felder der Vorlage. Beim **Nachpflegen** wird nur ergänzt, was fehlt; ein vorhandener Wert bleibt stehen, auch wenn er von der Periode abweicht — er kann eine bewusste Korrektur sein. Fremde Felder und der übrige Inhalt bleiben in beiden Fällen unangetastet, und ein beschädigtes Frontmatter wird nicht angefasst.

## Offene Aufgaben übertragen

Die Anwendung überträgt die offenen Aufgaben des letzten vorhandenen Eintrags eines Journals in den Eintrag der laufenden Periode: bei einem Tages-Journal in den heutigen, bei einem Wochen-Journal in den der laufenden Woche. Das gilt für Journale jeder Granularität, auch wenn der letzte Eintrag Tage zurückliegt. Quelle ist immer der jüngste frühere Eintrag desselben Journals; Einträge in der Zukunft zählen nicht.

**Einstellungen.** Im Editor eines Journals unter Einstellungen → Journale stehen in der Gruppe «Offene Aufgaben übertragen» drei Einstellungen:

- **Beim Anlegen des Eintrags selbsttätig übertragen** (in der Vorgabe aus): Ist der Schalter an, wird übertragen, sobald der Eintrag der laufenden Periode neu angelegt wird, gleich auf welchem Weg: über die Kommandos, das Kalender-Panel, den Navigations- oder den Timeline-Block oder das Datum einer Karte der Kanban-Tafel. Beim bloßen Öffnen eines bestehenden Eintrags und beim Anlegen eines Eintrags für eine andere Periode geschieht nichts.
- **Im alten Eintrag**: «als übertragen kennzeichnen» (Vorgabe) setzt die übertragene Aufgabe dort auf den Status «Übertragen» (`- [»] …`, Seite [Aufgaben-Listen](tasks.md)); «entfernen» löscht sie dort.
- **Nur aus Abschnitt** (in der Vorgabe leer): der Text einer Überschrift. Ist das Feld gefüllt, werden nur die Aufgaben unter dieser Überschrift und ihren Unter-Überschriften übertragen; ist es leer, alle offenen Aufgaben des Eintrags.

**Befehl von Hand.** **Offene Aufgaben in den aktuellen Journal-Eintrag übertragen** (Menü Datei → Weitere Datei-Funktionen, auch in der Kommando-Palette) überträgt jederzeit in den Eintrag der laufenden Periode, auch wenn der Schalter aus ist, und auch in einen Eintrag, der schon besteht; fehlt der Eintrag, wird er angelegt. Bei mehreren Journalen fragt der Befehl, welches gemeint ist. Ein zweiter Aufruf überträgt nichts doppelt, weil die übertragenen Aufgaben im alten Eintrag gekennzeichnet oder entfernt sind.

**Wo die Aufgaben landen.** Jede Aufgabe kommt im neuen Eintrag unter die Überschrift, unter der sie im alten stand, ans Ende dieses Abschnitts. Gleichnamig heißt gleicher Text, ohne Rücksicht auf Groß- und Kleinschreibung und auf die Ebene der Überschrift; gibt es die Überschrift im neuen Eintrag mehrfach, gilt die erste. Fehlt sie dort, wird sie mit den Aufgaben am Ende des Eintrags angelegt. Aufgaben, die im alten Eintrag vor der ersten Überschrift standen, kommen ans Ende des neuen. Die Reihenfolge bleibt erhalten.

**Unterpunkte.** Eine Aufgabe zieht mit allem um, was eingerückt direkt unter ihr steht, bis zur nächsten Leerzeile: offene und erledigte Unteraufgaben, deren Unterpunkte und Notiz-Zeilen. Was nach einer Leerzeile eingerückt weitergeht, gehört nicht mehr dazu und bleibt im alten Eintrag. Bei «als übertragen kennzeichnen» wird im alten Eintrag jede Aufgaben-Zeile des umgezogenen Blocks gekennzeichnet, auch eine erledigte Unteraufgabe; bei «entfernen» fällt der ganze Block weg. Eine offene Aufgabe unter einer erledigten oder abgebrochenen, über der keine offene steht, zieht allein um und steht im neuen Eintrag ausgerückt.

**Was als offen zählt.** Aufgaben, deren Status vom Typ Offen, In Arbeit oder Wartend ist (Seite [Aufgaben-Listen](tasks.md), Abschnitt „Eigene Status, Typ und Folge-Symbol“); ein Kästchen mit einem Zeichen, für das kein Status eingerichtet ist, zählt ebenfalls als offen. Erledigte und abgebrochene Aufgaben und Zeilen vom Typ Keine Aufgabe bleiben, wo sie sind. Eine als «Übertragen» gekennzeichnete Zeile wird nie erneut übertragen, auch wenn dieser Status abgeschaltet ist. Kästchen in Code-Blöcken, Zitaten und Tabellen sind keine Aufgaben und bleiben stehen. Ein gesetzter Global Filter gilt auch hier.

Beispiel mit «als übertragen kennzeichnen». Der alte Eintrag vorher:

```markdown
## Arbeit
- [ ] Angebot schreiben
  - [x] Zahlen holen
  - [ ] Text entwerfen
- [x] Rechnung prüfen

## Privat
- [ ] Fahrrad zur Werkstatt
```

Der neue Eintrag, aus der Vorlage angelegt:

```markdown
## Arbeit

## Privat
```

Der neue Eintrag nach dem Übertrag:

```markdown
## Arbeit

- [ ] Angebot schreiben
  - [x] Zahlen holen
  - [ ] Text entwerfen

## Privat

- [ ] Fahrrad zur Werkstatt
```

Der alte Eintrag nach dem Übertrag:

```markdown
## Arbeit
- [»] Angebot schreiben
  - [»] Zahlen holen
  - [»] Text entwerfen
- [x] Rechnung prüfen

## Privat
- [»] Fahrrad zur Werkstatt
```

Mit «entfernen» stünden im alten Eintrag danach nur noch die beiden Überschriften und «Rechnung prüfen».

**Festlegungen im Einzelnen.**

- **Ungespeicherte Änderungen:** Hat der alte oder der neue Eintrag in irgendeinem Fenster ungespeicherte Änderungen, wird nichts übertragen, und die Statusleiste nennt den Eintrag. Beim selbsttätigen Übertrag entsteht der neue Eintrag dann ohne die Aufgaben; nach dem Speichern holt der Befehl von Hand den Übertrag nach.
- **Ausgeschaltete Funktionen:** Ist die Erweiterung «Aufgaben» aus, wird nichts übertragen, weil dann nichts als Aufgabe gilt; der Befehl sagt es in der Statusleiste. Ist die Erweiterung «Journale» aus, entfallen Befehl und Einstellungen, und es wird nichts übertragen.
- **Nur der letzte Eintrag:** Quelle ist genau der jüngste frühere Eintrag. Was in noch älteren Einträgen offen blieb, bleibt dort.
- **Aufgabe steht schon da:** Bringt die Vorlage eine Aufgabe jeden Tag mit und steht dieselbe Aufgabe im alten Eintrag noch offen, kommt sie nicht ein zweites Mal in den neuen; im alten wird sie trotzdem gekennzeichnet oder entfernt. Das gilt nur, wenn die Zeile Zeichen für Zeichen gleich ist, unter derselben Überschrift steht und im alten Eintrag nichts unter ihr steht. Hat sie dort Unterpunkte bekommen, zieht sie mit ihnen um und steht dann zweimal im neuen Eintrag.
- **Abschnitt nicht gefunden:** Nennt «Nur aus Abschnitt» eine Überschrift, die der alte Eintrag nicht hat, wird nichts übertragen, und die Statusleiste sagt es, auch beim selbsttätigen Übertrag.
- **Meldungen:** Nach einem Übertrag nennt die Statusleiste die Zahl der Aufgaben und den Eintrag, aus dem sie kamen. Dass es keinen früheren Eintrag oder keine offenen Aufgaben gibt, meldet nur der Befehl von Hand.
- **Nummerierte Listen und leere Überschriften:** Eine Aufgabe aus einer nummerierten Liste behält ihre Nummer; nichts wird neu gezählt. Bleibt im alten Eintrag nach «entfernen» eine Überschrift ohne Inhalt zurück, bleibt sie stehen.
- **Grenzen:** höchstens 500 Aufgaben je Übertrag, Einträge bis 5 MB und höchstens 20 000 Markdown-Dateien in den Ordnern des Journals; darüber wird nichts übertragen, und die Statusleiste sagt es.
- **Rückweg:** Einen eigenen Rückgängig-Befehl gibt es nicht. Beide Einträge bekommen einen Eintrag in ihrer [Dokument-Historie](history.md), wo sie für das Dokument eingeschaltet ist; bei «als übertragen kennzeichnen» öffnet ein Klick auf das Kästchen die Aufgabe im alten Eintrag wieder.
- **Kein Verweis:** Die gekennzeichnete Zeile im alten Eintrag bekommt keinen Verweis auf den neuen Eintrag.

## Kalender-Panel

Das Kalender-Panel (Statusbar-Symbol Kalender) zeigt die Monatsansicht des Bereichs:

- Wochentags-Kopf mit **Montag-Start**, links die **ISO-Kalenderwochen-Spalte**.
- **Punkte** markieren Tage mit vorhandenem Tages-Eintrag; **Heute** ist hervorgehoben.
- Klick auf einen **Tag** öffnet bzw. legt den Tages-Eintrag an, Klick auf die **KW-Zelle** den Wochen-Eintrag; bei mehreren passenden Journalen erscheint eine Auswahl.
- Die Kopf-Auswahl filtert auf **alle Journale**, ein **Regal** oder ein **einzelnes Journal**; Pfeile blättern den Monat, der Heute-Knopf springt zurück.

## Navigations-Block

Der Navigations-Block steht als Code-Block im Eintrag, typischerweise über die Journal-Vorlage:

````markdown
```perspective-journal-nav
```
````

Im Journal-Eintrag zeigt er die aktuelle Periode groß (darunter die zeitliche Einordnung: «Heute» oder «Diese Woche» bei der laufenden Periode, sonst der Abstand zu ihr — «gestern», «vor 3 Wochen», «in 2 Jahren», stets in der Einheit der Periode), darüber die übergeordneten Perioden desselben Regals (Monat, Quartal, Jahr — soweit als Journal vorhanden; Lücken werden ausgelassen) und Pfeile zur vorigen und nächsten Periode. Klicks öffnen die Einträge und legen fehlende an; an den Datums-Grenzen des Journals endet die Navigation. **Die beiden Pfeile blättern dabei im selben Reiter:** Der bisherige Eintrag weicht dem neuen, und der Reiter behält Ansichts-Modus, Änderungs-Modus, Vergrößerung, Gruppe und Position. Trägt er ungespeicherte Änderungen, erscheint dieselbe Rückfrage wie beim Schließen; ist der Nachbar-Eintrag schon offen, wird sein Reiter aktiviert. Die Verweise auf die übergeordneten Perioden öffnen dagegen einen eigenen Reiter, weil sie die Ebene wechseln statt zu blättern. **Neben jedem Pfeil steht der Name seiner Ziel-Periode**, damit sichtbar ist, wohin er führt; wird der Block schmal, weicht dieser Name und die Schaltfläche bleibt. **Ein Punkt unter einer Periode heißt: diesen Eintrag gibt es schon** — dieselbe Markierung wie im Kalender-Panel und in der Zeitleiste. Sie steht an allen Perioden des Blocks, also auch an den übergeordneten und an den beiden Nachbarn; wo sie fehlt, legt der Klick den Eintrag neu an. Direkt hier auf der Handbuch-Seite zeigt derselbe Block den Hinweis für Dokumente außerhalb eines Journals:

```perspective-journal-nav
```

Beide Journal-Blöcke, dieser und die Zeitleiste weiter unten, prüfen zudem, ob sie sich auf den angezeigten Eintrag beziehen. Trifft das nicht zu, oder ist der Eintrag nicht mehr vorhanden, erscheint statt der Anzeige eine Fehlermeldung: Eine falsche Perioden-Angabe wäre nicht als falsch erkennbar und wird deshalb unterdrückt.

Im PDF- und Portable-Export erscheint statt des Blocks die statische Perioden-Beschriftung ohne Anlage-Links.

## Timeline-Block

Der Timeline-Block zeigt die Perioden-Übersicht als Kalender im Eintrag. Er kennt vier Modi:

````markdown
```perspective-journal-timeline
mode: month
```
````

| Modus | Darstellung |
|---|---|
| `week` | die Woche des Eintrags als eine Zeile |
| `month` | ein Monatskalender |
| `quarter` | drei Monatskalender nebeneinander |
| `year` | zwölf Monatskalender als Jahres-Raster |

`calendar` ist die gleichwertige Schreibweise für `year` (sie stammt aus übernommenen Beständen). Fehlt die Angabe `mode`, gilt `month`. Ein unbekannter Wert erscheint als Hinweis im Block, damit ein Tippfehler nicht unbemerkt bleibt.

**Aufbau.** Links steht die Kalenderwochen-Spalte, oben der Wochentags-Kopf ab Montag. Tage mit vorhandenem Eintrag tragen einen Punkt, der heutige Tag ist hervorgehoben. In der Kopfzeile stehen die Perioden oberhalb der Kalender-Ebene, und die Ebene des Modus ist hervorgehoben: der Wochen-Modus hebt die Kalenderwoche hervor, der Monats-Modus den Monat, der Quartals-Modus das Quartal, der Jahres-Modus das Jahr.

**Klicken.** Jedes Element führt in seine Periode: der Tag in den Tages-Eintrag, die Kalenderwoche in den Wochen-Eintrag, der Monatsname und die Kopf-Beschriftungen in ihre jeweilige Periode. Fehlende Einträge werden dabei angelegt. Maßgeblich sind die Journale des Regals, zu dem der Eintrag gehört; gibt es dort kein Journal einer Ebene, ist die Beschriftung reine Anzeige. Außerhalb der Datums-Grenzen eines Journals entsteht kein Eintrag.

Welche Periode der Block zeigt, richtet sich nach dem Eintrag, in dem er steht, nicht nach dem heutigen Tag: In der Wochennotiz einer vergangenen Woche zeigt `month` den Monat dieser Woche.

Wie der Navigations-Block erscheint auch dieser Block außerhalb eines Journal-Eintrags als Hinweis:

```perspective-journal-timeline
mode: week
```

Im PDF-Export wird der Kalender gedruckt, wie er auf dem Bildschirm steht. Im Portable-Export wird er zu einer Tabelle je Monat, mit einem Punkt an Tagen mit Eintrag und ohne Anlage-Links.

## Wochen-Regeln

Wochen folgen fest ISO 8601: Die Woche beginnt am Montag, und die erste Kalenderwoche eines Jahres ist die Woche mit dem ersten Donnerstag. Das KW-Jahr (`kkkk`) kann deshalb am Jahreswechsel vom Kalenderjahr (`yyyy`) abweichen — der 1. Januar 2021 gehört zum Beispiel zur KW 53 des KW-Jahres 2020.
