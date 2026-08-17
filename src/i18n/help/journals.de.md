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

Beim Anlegen entstehen die Ordner-Kette, der gefüllte Vorlagen-Inhalt (ohne Vorlage ein leerer Eintrag) und die Datums-Eigenschaften im Frontmatter: Tages-Journale erhalten das Datum (`journal-date`), mehrtägige Perioden Start und Ende (`journal-start-date`, `journal-end-date`); die Feldnamen sind pro Journal einstellbar und stehen der Perspective-Abfrage zur Verfügung. Datums-Platzhalter der Vorlage werden am Perioden-Start ausgewertet — `{{date}}` liefert im Eintrag das Perioden-Datum, nicht den Anlage-Zeitpunkt. Ein Abbruch eines Vorlagen-Dialogs bricht das Anlegen ab; es entsteht keine Datei.

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

Im Journal-Eintrag zeigt er die aktuelle Periode groß (mit Zusatz-Zeile wie «Diese Woche» bei der aktuellen Periode), darüber die übergeordneten Perioden desselben Regals (Monat, Quartal, Jahr — soweit als Journal vorhanden; Lücken werden ausgelassen) und Pfeile zur vorigen und nächsten Periode. Klicks öffnen die Einträge und legen fehlende an; an den Datums-Grenzen des Journals endet die Navigation. Direkt hier auf der Handbuch-Seite zeigt derselbe Block den Hinweis für Dokumente außerhalb eines Journals:

```perspective-journal-nav
```

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
