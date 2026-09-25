# Kanban-Tafel

Eine **Kanban-Tafel** ordnet die Aufgaben **eines** Dokuments räumlich an: Jede benannte Liste des Dokuments steht als **Spalte** nebeneinander, jede Aufgaben-Zeile darin als **Karte**. Wer eine Karte von einer Spalte in die nächste zieht, verschiebt damit ihre Zeile im Dokument — die Tafel ist eine Arbeitsfläche und keine Auswertung.

Die Tafel ist eine **weitere Ansicht desselben Dokuments** und kein eigenes Dateiformat. Alles, was auf ihr steht, steht als gewöhnliches Markdown in der Datei; die übrigen Ansichten zeigen dieselben Überschriften und Aufgaben-Listen wie zuvor, und der Wechsel zwischen ihnen ändert nichts am Text.

## Woran eine Tafel erkannt wird

Am **Kopf-Kennzeichen** `kanban-plugin` im Kopfbereich des Dokuments:

```markdown
---
kanban-plugin: board
---
```

Erkannt wird das **Vorhandensein** des Schlüssels, nicht sein Wert: `board`, `list` oder etwas anderes — jedes Dokument mit diesem Schlüssel ist eine Tafel, und der vorgefundene Wert bleibt unverändert stehen. Ein Dokument ohne den Schlüssel ist keine Tafel, auch wenn es Überschriften und Aufgaben-Listen trägt.

## Die Erweiterung „Kanban"

Die Funktion gehört zu den [internen Erweiterungen](extensions.md) („Tafel-Ansicht (Kanban)"). Ist sie abgeschaltet, entfällt der Ansichts-Modus, die Kommandos für Karte, Spalte und Tafel verschwinden, und mit ihnen das Untermenü **Kanban-Tafel** im Menü **Ansicht**, das ohne seine Einträge nicht leer stehen bleibt. Das Dokument bleibt dabei unverändert lesbar; geschrieben wird im Aus-Zustand nie, Spalten und Karten stehen weiterhin im Text.

Die Tafel setzt die Erweiterung **Aufgaben** voraus, denn eine Karte **ist** eine Aufgaben-Zeile. Ist jene abgeschaltet, ist die Tafel es ebenfalls.

## Eine Tafel anlegen

Zwei Wege, beide im Menü **Ansicht → Kanban-Tafel** und in der Kommando-Palette (Standard `Strg+K`):

| Weg | Wirkung |
| --- | ------- |
| **Neue Kanban-Tafel** | legt ein neues, noch unbenanntes Dokument an, füllt es mit einer Start-Tafel und öffnet es gleich in der Tafel-Ansicht |
| **Leeres Dokument in Kanban-Tafel umwandeln** | schreibt dieselbe Start-Tafel in das geöffnete Dokument |

**Neue Kanban-Tafel** steht immer zur Wahl — es ist der Weg zur ersten Tafel und braucht selbst keine.

**Umwandeln** dagegen steht nur bei einem **leeren** Dokument zur Wahl, das noch keine Tafel ist; sonst bleibt der Eintrag sichtbar und gedämpft stehen. Der Grund ist die Sicherheit des Bestands: Ein Dokument mit Inhalt würde dabei überschrieben. Der Eintrag zieht beim Tippen nach — am ersten Zeichen verliert er seine Grundlage, am letzten gelöschten bekommt er sie zurück. Es setzt außerdem ein änderbares Dokument voraus; fehlt eine der Bedingungen, sagt die Statusleiste das, statt still nichts zu tun.

Die Start-Tafel trägt drei Spalten — **Zu erledigen**, **In Arbeit** und **Erledigt** —, und die letzte ist so eingestellt, dass sie hineingezogene Karten abhakt. Die Titel stehen in der Sprache der Oberfläche; ändern lassen sie sich wie jeder andere Spalten-Titel.

## Die Tafel-Ansicht öffnen

Die Tafel ist der siebte Ansichts-Modus, neben Quellcode, Geteilt, Gerendert, Live, Mindmap und Canvas: **Ansicht → Tafel**, die Schaltfläche in der Statusleiste oder Standard `Strg+7`. Wie bei den übrigen Modi gilt die Wahl je geöffnetem Dokument, nicht für die ganze Anwendung, und sie wird beim nächsten Start wiederhergestellt.

**Der Modus hängt am Dokument.** Wählbar ist er nur, wenn das geöffnete Dokument eine Tafel ist — eine Tafel-Ansicht ohne Tafel zeigte nichts als einen Hinweis. Trägt das Dokument das Kopf-Kennzeichen nicht, bleiben Schaltfläche und Menü-Eintrag **sichtbar und gedämpft** stehen; der Grund steht im Titel der Schaltfläche. Der Weg über Tastenkürzel und Kommando-Palette führt dann nicht hinein und wirft auch nicht aus der aktuellen Ansicht. Entsteht das Kennzeichen im Text oder fällt es weg, zieht der Zugang nach, und ein Dokument, das beim Beenden in der Tafel-Ansicht offen war und inzwischen keine Tafel mehr ist, öffnet in der Lese-Ansicht. Dieselbe Eigenschaft hat die [Canvas-Fläche](canvas.md); die übrigen fünf Modi stehen an jedem Dokument zur Wahl.

## Was die Tafel zeigt

- **Spalten** nebeneinander, jede mit ihrem Titel und der Zahl ihrer Karten; trägt die Spalte eine Obergrenze, zeigt der Zähler beides, etwa `2/3`. Passen sie nicht nebeneinander, rollt der Spalten-Streifen waagerecht; eine lange Spalte rollt für sich senkrecht.
- **Karten** untereinander in der Reihenfolge ihrer Zeilen im Dokument. Der Karten-Text ist **gerendert**: Verweise, Tags, Auszeichnungen und Bilder erscheinen wie in der Lese-Ansicht. Die Tags stehen dabei im Text, wo sie geschrieben sind, oder wahlweise gesammelt am Kartenfuß.
- **Eingerückte Folgezeilen** einer Aufgabe stehen als Zusatz auf ihrer Karte.
- Die **Angaben der Aufgabe** — Termin und Uhrzeit, Priorität, Wiederholung und die übrigen Marker — stehen als Abzeichen unter dem Karten-Text.
- Der **Status** der Aufgabe erscheint als Kästchen auf der Karte, mit dem Zeichen, das im Dokument steht — auch bei einem eigenen Status-Zeichen.
- Eine Spalte, die hineingezogene Karten abhakt, trägt dafür ein Zeichen neben ihrem Karten-Zähler.

Eine Tafel ohne Spalten und eine Spalte ohne Karten sagen das an ihrer Stelle, statt eine leere Fläche zu zeigen. Lässt sich ein Teil der Tafel nicht lesen, steht darüber ein Hinweis-Kasten mit Zeilen-Angabe und einem Satz je Befund; was lesbar war, erscheint weiterhin darunter.

## Karten

| Handlung | Maus | Tastatur | Kontextmenü | Kommando |
| -------- | ---- | -------- | ----------- | -------- |
| Anlegen | Schaltfläche **Karte hinzufügen** am Fuß der Spalte | — | — | **Karte auf der Tafel anlegen** |
| Auswählen | Klick auf die Karte | — | — | — |
| Bearbeiten | Doppelklick auf die Karte | `Eingabe` oder `F2` | **Karte bearbeiten** | — |
| Übernehmen | Klick außerhalb der Karte | `Eingabe` | — | — |
| Verwerfen | — | `Escape` | — | — |
| Status wechseln | Klick auf das Kästchen | `Leertaste` | — | — |
| Termin setzen oder ändern | Klick auf das Termin-Abzeichen | — | **Termin setzen…** | — |
| Termin entfernen | — | — | **Termin entfernen** | — |
| Archivieren | — | — | **Karte archivieren** | **Karte auf der Tafel archivieren** |
| Löschen | — | `Entf` | **Karte löschen** | — |

**Eine neue Karte ist sofort beschriftbar** und entsteht am Fuß der Spalte, in der sie angelegt wurde. Bleibt ihr Text leer, entsteht keine Karte — weder im Dokument noch als Rückgängig-Schritt.

**Bearbeitet wird der rohe Karten-Text**, einzeilig. Wer eine Karte schreibt, schreibt Markdown und soll es dabei sehen. Die Marker der Aufgaben-Zeile — Termin, Uhrzeit, Priorität und Wiederholung — gehören der Zeile und bleiben beim Bearbeiten unangetastet; eingerückte Folgezeilen ebenso. Ein Termin in der Schreibweise des anderen Werkzeugs steht dagegen im Text und wird beim Übernehmen umgeschrieben (siehe «Angaben auf der Karte»). Ein unveränderter Text schreibt nichts in das Dokument.

**Der Status-Wechsel geht denselben Weg wie ein Klick auf das Kästchen in der Lese-Ansicht**, samt Status-Kette, Automatik-Daten und Wiederholung. Eine zweite Status-Logik gibt es nicht.

**Gelöscht wird ohne Rückfrage.** Die Handlung ist ein einziger Rückgängig-Schritt entfernt, und eine Rückfrage bei jeder Karte wäre ein Klick zu viel. Danach wandert die Auswahl auf die nächste Karte der Spalte, sonst auf die vorige.

## Spalten

| Handlung | Maus | Tastatur | Kontextmenü | Kommando |
| -------- | ---- | -------- | ----------- | -------- |
| Anlegen | Schaltfläche **Spalte hinzufügen** am Ende des Streifens | — | — | **Spalte auf der Tafel anlegen** |
| Umbenennen | Doppelklick auf den Spalten-Titel | — | **Spalte umbenennen** | — |
| Übernehmen | Klick außerhalb der Eingabe | `Eingabe` | — | — |
| Verwerfen | — | `Escape` | — | — |
| Obergrenze setzen oder ändern | — | — | **Obergrenze setzen…** | — |
| Obergrenze entfernen | — | — | **Obergrenze entfernen** | — |
| Löschen | — | — | **Spalte löschen** | — |
| Abhaken ein- und ausschalten | — | — | **Hakt hineingezogene Karten ab** (mit Häkchen) | — |

Die Schaltfläche **Spalte hinzufügen** gibt es auch an einer Tafel ohne jede Spalte; sonst gäbe es für die erste Spalte keinen Weg. Bleibt der Titel leer, entsteht keine Spalte.

**Umbenannt wird allein die Überschriften-Zeile** — Einzug, Rauten und Abstand bleiben, eine Obergrenze bleibt in der Schreibweise stehen, in der sie vorgefunden wurde, und die Karten der Spalte bleiben unberührt.

**Beim Löschen wird gefragt, sobald die Spalte Karten trägt.** Eine leere Spalte verschwindet ohne Rückfrage; eine gefüllte nennt in der Rückfrage ihren Titel und ihre Kartenzahl und ist mit **Abbrechen** vorbelegt. Der Grund für den Unterschied: Beim Löschen einer Spalte verschwindet mehr, als die Handlung anzeigt, nämlich auch ihre Karten.

Die beiden Anlege-Kommandos — für die Karte und für die Spalte — und das Archivieren der gewählten Karte liegen im Menü **Ansicht → Kanban-Tafel** und in der Kommando-Palette. Ein Tastenkürzel ist für sie nicht vorbelegt und lässt sich in den Einstellungen vergeben.

## Verschieben mit der Maus

**Eine Karte wird an der Karte gezogen, eine Spalte an ihrem Kopf.** Während des Zuges tritt das Gezogene zurück, und eine Marke zeigt, wo es abgelegt wird. Liegt der Zeiger am Rand, rollt die Fläche unter ihm weiter — der Spalten-Streifen waagerecht, die Karten-Liste senkrecht.

Welche Spalte gemeint ist, entscheidet allein die Waagerechte: Ein Zeiger unterhalb der letzten Karte meint weiterhin diese Spalte.

Der Zug endet mit dem Loslassen. `Escape`, der Verlust des Fensters und das Loslassen außerhalb jeder Spalte brechen ihn ab, ohne das Dokument zu ändern; dasselbe gilt, wenn die Karte wieder auf ihrem eigenen Platz landet. Nach dem Ablegen ist die verschobene Karte gewählt.

Solange eine Karte oder ein Spalten-Titel in Bearbeitung steht, beginnt kein Zug; in einem nicht änderbaren Dokument ebenso wenig. **Ohne Maus lässt sich nicht verschieben**; alle übrigen Handlungen der Tafel sind auch über Tastatur und Menü erreichbar.

## Eine Spalte, die abhakt

Jede Spalte trägt die Einstellung **Hakt hineingezogene Karten ab**, geschaltet über ihr Kontextmenü. Ist sie gesetzt, gilt:

- Eine Karte, die **hinein**gezogen wird und noch offen ist, wird abgehakt.
- Eine abgehakte Karte, die aus einer solchen Spalte **heraus** in eine gewöhnliche gezogen wird, wird wieder geöffnet.
- Ein Umsortieren zwischen zwei gewöhnlichen Spalten lässt den Status unberührt.

Verschieben und Abhaken sind zusammen **eine** Handlung und damit ein einziger Rückgängig-Schritt. Welcher Status dabei gesetzt wird, bestimmt die Status-Kette der Aufgaben, und das Erledigt-Datum entsteht und verschwindet so, wie es in der Lese-Ansicht geschieht.

**Trägt die Karte eine Wiederholungs-Regel**, erzeugt das Abhaken wie überall die nächste Instanz der Aufgabe. Auf der Tafel landet diese **in der Spalte, aus der gezogen wurde**, und dort an der Stelle der alten Karte — nicht in der Erledigt-Spalte. Eine offene Aufgabe in der Erledigt-Spalte wäre genau der Widerspruch, den eine Tafel auflösen soll. Wird innerhalb derselben Spalte umsortiert, bleibt die Instanz dort und rückt an den alten Platz der Karte.

## Angaben auf der Karte

Unter dem Karten-Text steht eine Reihe von **Abzeichen** mit den Angaben der Aufgabe: der Termin samt Uhrzeit, Geplant- und Start-Datum, Priorität, Wiederholung und die übrigen Aufgaben-Marker. Es sind dieselben Abzeichen wie in der Lese-Ansicht, mit derselben Kennzeichnung für überfällige und ungültige Angaben. Eine Karte ohne Angaben trägt keine solche Reihe.

**Termin setzen und entfernen.** Das Kontextmenü einer Karte bietet **Termin setzen…** und, sobald die Karte einen Termin trägt, **Termin entfernen**; ein Klick auf das Termin-Abzeichen führt ebenfalls zum Setzen. Gewählt wird im Datums-Kalender der Aufgaben, wahlweise mit Uhrzeit und vorbelegt mit dem vorhandenen Termin. Geschrieben wird der Termin in der Aufgaben-Schreibweise der Anwendung in die Karten-Zeile:

```markdown
- [ ] Angebot abschicken 📅 2026-10-02 14:00
```

Er erscheint damit auch in der Lese-Ansicht und in den Aufgaben-Abfragen. Jedes Setzen und Entfernen ist ein Rückgängig-Schritt; ändert sich das Dokument, während der Datums-Kalender offen ist, wird die Wahl verworfen und das in der Statusleiste gesagt.

**Relative Anzeige.** Mit dem Schalter **Ansicht → Kanban-Tafel → Termine relativ anzeigen** lesen sich Termin, Geplant- und Start-Datum vom heutigen Tag aus: «heute», «morgen», «in 3 Tagen», «vor 2 Tagen», in der Sprache der Oberfläche und mit angehängter Uhrzeit. Das genaue Datum steht dann im Hinweistext des Abzeichens. Erstellt-, Erledigt- und Abbruch-Datum bleiben absolut, weil sie festhalten, wann etwas geschah. Der Schalter ist ab Werk aus, gilt für alle Tafeln in allen Fenstern und ändert am Dokument nichts.

**Termine in der Schreibweise des anderen Werkzeugs.** Das Tafel-Werkzeug, aus dem das Format stammt, schreibt einen Termin als `@{…}` und eine Uhrzeit als `@@{…}` in die Karten-Zeile. Die Tafel liest beides und zeigt es als Termin-Abzeichen mit gestricheltem Rand; sein Hinweistext nennt die Herkunft. **Beim ersten Bearbeiten der Karte wird ein solcher Termin in die Aufgaben-Schreibweise umgeschrieben** — beim Übernehmen eines geänderten Karten-Texts ebenso wie beim Setzen und Entfernen des Termins. Aus der ersten Zeile wird die zweite:

```markdown
- [ ] Angebot abschicken @{2026-10-02} @@{14:00}
- [ ] Angebot abschicken 📅 2026-10-02 14:00
```

**Das hat einen Preis:** Im anderen Werkzeug erscheint der umgeschriebene Termin danach nur noch als Text der Aufgabe und nicht mehr als Termin der Karte. Wer eine Tafel in beiden Werkzeugen pflegt, sollte das wissen, bevor er eine solche Karte hier bearbeitet. Ohne Bearbeiten wird nichts umgeschrieben: Öffnen, Statuswechsel, Verschieben und Archivieren lassen die Zeile, wie sie ist. Ein Termin dieser Schreibweise, der sich nicht lesen lässt — ein Datum, das es nicht gibt, oder eine Uhrzeit ohne Datum —, bleibt im Karten-Text stehen und erscheint zusätzlich als ungültiges Abzeichen, dessen Hinweistext den Grund nennt. Ein [Kalender-Wert](custom-calendars.md) der Anwendung in derselben Klammer-Form ist kein solcher Termin und bleibt unberührt.

## Tags am Kartenfuß

Tags stehen auf der Karte zunächst dort, wo sie geschrieben sind: im Karten-Text, gerendert wie in der Lese-Ansicht. Mit dem Schalter **Ansicht → Kanban-Tafel → Tags am Kartenfuß** verlassen sie den angezeigten Text und stehen gesammelt in einer eigenen Reihe am Fuß der Karte — auch die Tags aus eingerückten Folgezeilen, jedes einmal und in der Reihenfolge seines Vorkommens. Der Schalter ist ab Werk aus, gilt für alle Tafeln in allen Fenstern und ändert am Dokument nichts: Die Tags bleiben in der Zeile, in der sie stehen.

Ein Klick auf ein Tag der Karte — am Fuß wie im Text — filtert die Tag-Sidebar nach ihm, wie in der Lese-Ansicht; Auswahl und Bearbeitung der Karte bleiben davon unberührt. Während eine Karte bearbeitet wird, ist ihre Tag-Reihe ausgeblendet, weil die Eingabe den rohen Text samt Tags zeigt. Beide Anzeige-Schalter stehen nur in der geöffneten Tafel-Ansicht zur Wahl.

## Obergrenze je Spalte

Eine Spalte kann eine **Obergrenze** tragen: die Zahl der Karten, die sie höchstens aufnehmen soll. Im Dokument steht sie in Klammern am Ende des Spalten-Titels, etwa `## In Arbeit (3)`; auf der Tafel erscheint sie nicht im Titel, sondern im Zähler: `2/3`.

Gesetzt und geändert wird sie über **Obergrenze setzen…** im Kontextmenü des Spalten-Kopfes. Die Eingabe erscheint an der Stelle des Zählers und wird wie ein Spalten-Titel mit `Eingabe` oder einem Klick daneben übernommen und mit `Escape` verworfen. Eine leere Eingabe oder `0` entfernt die Obergrenze, ebenso der Eintrag **Obergrenze entfernen**, den das Menü anbietet, sobald eine gesetzt ist.

**Die Obergrenze sperrt nicht.** Trägt die Spalte mehr Karten, als sie vorsieht, wird ihr Zähler hervorgehoben, und sein Hinweistext sagt «Obergrenze überschritten»; Karten lassen sich trotzdem hineinziehen und anlegen. Die Tafel zeigt, was ist, und überlässt die Entscheidung dem Anwender. Eine von Hand geschriebene `(0)` gilt nicht als Obergrenze und bleibt Teil des Titels.

## Archiv

**Karte archivieren** im Kontextmenü einer Karte, oder das Kommando **Karte auf der Tafel archivieren** für die gewählte Karte, nimmt die Karte samt ihren eingerückten Folgezeilen aus ihrer Spalte und schreibt sie ans Ende des **Archiv-Abschnitts** desselben Dokuments. Vor ihren Text tritt dabei ein Zeitstempel aus Datum und Uhrzeit; ihr Status und ihre übrigen Angaben bleiben, wie sie sind:

```markdown
***

## Archiv

- [x] 2026-09-23 14:05 Anforderung aufnehmen
```

Fehlt der Abschnitt, entsteht er hinter der letzten Spalte, mit der Überschrift, die auch das andere Werkzeug in der Sprache der Oberfläche schreibt; ein vorhandener Abschnitt wird mit seiner Überschrift und seinem Bestand weitergeführt.

**Das Archiv behält die jüngsten 100 Karten.** Kommt eine hinzu, wenn es voll ist, fällt die älteste heraus; ein Archiv, das ein anderes Werkzeug mit mehr Karten hinterlassen hat, wird beim ersten Archivieren auf die jüngsten 100 gekürzt.

**Zurückholen lässt sich eine archivierte Karte auf der Tafel nicht**, denn das Archiv erscheint dort nicht. Das Archivieren ist aber genau ein Rückgängig-Schritt, und im Dokument steht die Karte weiterhin im Klartext. Danach wandert die Auswahl wie beim Löschen auf die nächste Karte der Spalte; ohne gewählte Karte bleibt das Kommando ohne Wirkung.

## Karten suchen und filtern

In der Tafel-Ansicht öffnet das Suchen-Kommando (Standard `Strg+F`) ein **Filter-Feld** über den Spalten statt der Suche im Text. Schon beim Tippen blendet die Tafel jede Karte aus, deren Text den Suchbegriff nicht enthält; die Spalten bleiben stehen, und ihr Zähler zeigt Treffer und Gesamtzahl, etwa `1/3`. Passt keine Karte, sagt das ein Hinweis unter dem Feld.

Durchsucht werden der Text der Karte und ihre eingerückten Folgezeilen, einschließlich der Tags und Termine, die darin stehen; Groß- und Kleinschreibung spielen keine Rolle. Der Suchbegriff wird als eine zusammenhängende Zeichenfolge gesucht: `angebot prüfen` findet «Angebot prüfen», `prüfen angebot` nicht. Es ist dieselbe Regel wie im Filter-Feld der Karten-Liste einer [Canvas-Fläche](canvas.md).

**Das Dokument bleibt unverändert**, denn der Filter blendet nur aus; er wirkt deshalb auch in einem nicht änderbaren Dokument. Eine ausgeblendete Karte bleibt nicht gewählt, damit keine Taste auf eine Karte wirkt, die nicht zu sehen ist. Die Hervorhebung einer überschrittenen Obergrenze bleibt während des Filters stehen, weil sie alle Karten der Spalte zählt.

`Escape` im Feld beendet den Filter und zeigt wieder alle Karten; ebenso der Wechsel in eine andere Ansicht oder zu einem anderen Dokument. Zeichnet sich die Tafel zwischendurch neu, bleiben Suchtext und Eingabe-Fokus erhalten.

## Rückgängig

`Strg+Z` nimmt die letzte Handlung auf der Tafel zurück, `Strg+Y` und `Strg+Umschalt+Z` stellen sie wieder her. Jede Handlung ist genau ein Schritt: eine angelegte Karte, ein geänderter Text, ein Statuswechsel, ein Zug samt dem Abhaken, eine gelöschte Spalte mit allen ihren Karten, ein gesetzter oder entfernter Termin, eine geänderte Obergrenze, eine archivierte Karte. Steht die Eingabe einer Karte oder eines Spalten-Titels offen, gilt `Strg+Z` dort dem getippten Text.

Ändert sich das Dokument zwischendurch an anderer Stelle — etwa, weil dasselbe Dokument daneben im Editor bearbeitet wird —, wird die angefangene Handlung verworfen statt blind geschrieben; die Statusleiste sagt das, und die Tafel zeichnet sich neu.

## Nur ansehen

Die Tafel folgt der Änderbarkeit ihres Dokuments. Steht das Dokument in der reinen Anzeige, ohne eingeschalteten Bearbeiten-Modus, ist die Tafel **nur ansehbar**: keine Schaltflächen, kein Ziehen, keine Eingabe, kein klickbares Kästchen, und das Kontextmenü bleibt ohne Einträge. Auch der Weg über Kommando-Palette und Menü führt nicht daran vorbei; der Fehlschlag wird in der Statusleiste gesagt und nicht verschwiegen. Ansehen, Auswählen, Rollen und das Filtern der Karten bleiben erlaubt, weil sie das Dokument nicht anfassen; ebenso die beiden Anzeige-Schalter. Das Termin-Abzeichen ist hier reine Anzeige.

Der Bearbeiten-Modus gibt die Bedienung frei — Stift in der Statusleiste, Standard `Strg+E`; die Einzelheiten beschreibt die Seite [Ansichten und Darstellung](views-display.md).

## Abgrenzung zur Aufgaben-Abfrage

Tafel und [Aufgaben-Abfrage](tasks.md) zeigen beide Aufgaben und meinen dabei Verschiedenes:

| Frage | Aufgaben-Abfrage | Kanban-Tafel |
| ----- | ---------------- | ------------ |
| Woher kommen die Zeilen? | aus **allen** Dateien des Suchraums | aus **einem** Dokument |
| Woher kommt die Reihenfolge? | aus Filter, Sortierung und Gruppierung der Abfrage | aus der Stelle, an der die Zeile im Dokument steht |
| Was bewirkt das Umstellen? | nichts — die Abfrage rechnet neu | die Zeile wandert im Dokument |
| Was ist das Ergebnis? | eine Sicht auf den Bestand | eine Arbeitsfläche mit eigener Ordnung |

Kurz: Die Abfrage **sammelt** über den Bestand und ordnet nach Regeln; die Tafel **ordnet** die Zeilen eines Dokuments von Hand und merkt sich die Ordnung, weil sie im Text steht. Beides schließt einander nicht aus — die Aufgaben einer Tafel erscheinen in einer Abfrage wie jede andere Aufgaben-Zeile auch.

## Das Speicherformat

Eine Tafel liegt im Klartext in ihrem Dokument. Sie ist damit auch ohne diese Anwendung deutbar, und wer die Datei in einem Text-Werkzeug öffnet, sieht eine gewöhnliche Aufgaben-Liste je Spalte.

### Aufbau

| Teil | Wie er im Dokument steht |
| ---- | ------------------------ |
| Kennzeichen | der Schlüssel `kanban-plugin` im Kopfbereich |
| Spalte | eine **Überschrift** mit dem Titel der Spalte |
| Erledigt-Einstellung | unmittelbar unter der Überschrift eine Zeile aus nichts als einer **fett gesetzten Wortgruppe** |
| Obergrenze | eine Zahl in Klammern am Ende der Überschrift, etwa `## In Arbeit (3)` |
| Karte | eine **Aufgaben-Zeile** unter dieser Überschrift |
| Termin einer Karte | der Termin-Marker `📅` mit Datum und wahlweise Uhrzeit in der Aufgaben-Zeile |
| Zusatz einer Karte | die **eingerückten** Zeilen unmittelbar unter ihrer Aufgaben-Zeile |
| Archiv | alles nach einer Trennlinie aus drei Sternchen: eine Überschrift, darunter die archivierten Karten mit Zeitstempel |
| Einstellungen | ein privater Kommentar zwischen `%%`-Markern am Dateiende |

Ein Beispiel:

```markdown
---
kanban-plugin: board
---

## Zu erledigen

- [ ] Angebot prüfen #einkauf
  Rückfrage an den Einkauf ist offen
- [ ] Termin bestätigen 📅 2026-10-02 14:00


## In Arbeit (2)

- [/] Handbuch-Kapitel schreiben


## Erledigt

**Fertiggestellt**

- [x] Anforderung aufnehmen


***

## Archiv

- [x] 2026-09-01 09:15 Vorlage entwerfen
```

**Die Überschriften-Ebene ist nicht festgelegt.** Geschrieben werden zwei Rauten; gelesen wird jede Ebene, und eine neu angelegte Spalte übernimmt die Ebene der ersten vorhandenen. Eine von Hand geschriebene Tafel wird dadurch nicht abgewiesen.

**Das Erledigt-Kennzeichen ist der fett gesetzte Text selbst**, nicht ein bestimmtes Wort: Es wird an seiner Form erkannt und in der Schreibweise mitgeführt, die in der Datei steht. Legt die Anwendung selbst eine solche Spalte an, schreibt sie zuerst den Wortlaut, der in dieser Tafel bereits vorkommt, und sonst den Wortlaut der eingestellten Oberflächen-Sprache.

**Leerzeilen gehören zur Form:** unter der Überschrift beziehungsweise unter dem Erledigt-Kennzeichen steht eine Leerzeile, vor der nächsten Überschrift stehen zwei. Eine leere Spalte ohne Kennzeichen trägt damit drei Leerzeilen am Stück.

**Das Archiv** steht hinter der letzten Spalte und beginnt mit der Trennlinie; erkannt wird es an ihr, nicht am Wortlaut seiner Überschrift. Jede archivierte Karte trägt vor ihrem Text einen Zeitstempel in der Form `JJJJ-MM-TT HH:mm`.

### Was unangetastet bleibt

**Archiv-Abschnitt und Einstellungs-Block werden auf der Tafel nicht gezeigt.** Der Einstellungs-Block wird nie verändert, der Archiv-Abschnitt allein beim Archivieren einer Karte; sonst stehen beide unverändert in der Datei, und wer eine Tafel öffnet und ohne Änderung wieder schließt, bekommt dieselbe Datei zurück — einschließlich der Zeilenenden, eines fehlenden Schluss-Umbruchs und aller Angaben, die diese Anwendung nicht kennt.

Eine Ausnahme mit gutem Grund: Enthält der Einstellungs-Block die Liste, welche Spalten eingeklappt sind, zieht sie beim Anlegen, Löschen und Verschieben einer Spalte mit. Bliebe sie stehen, hätte das andere Werkzeug danach die falschen Spalten eingeklappt. Alles Übrige im Block bleibt zeichengenau, wie es war.

Geschrieben wird immer nur der Zeilen-Bereich, der sich wirklich ändert — nicht das ganze Dokument. Schreibmarke und Faltungen des Editors bleiben dadurch stehen.

## Verträglichkeit mit anderen Werkzeugen

Das Format stammt aus einem verbreiteten Tafel-Werkzeug für Markdown-Notizen, und die Verträglichkeit mit ihm ist eine ausdrückliche Zusage: Eine dort geschriebene Tafel lässt sich hier öffnen und bearbeiten, und eine hier bearbeitete Tafel lässt sich dort weiterverwenden.

**Was gelesen und erhalten wird:**

- das Kopf-Kennzeichen samt seinem Wert, welcher auch immer es ist,
- Spalten, Karten und ihre eingerückten Folgezeilen,
- die Obergrenze im Spalten-Titel, auch in der Schreibweise ohne Leerzeichen vor der Klammer,
- Termine und Uhrzeiten in der Schreibweise des anderen Werkzeugs, bis zum ersten Bearbeiten ihrer Karte (siehe unten),
- das Erledigt-Kennzeichen in **seiner** Sprache, auch wenn sie nicht die der Oberfläche ist,
- der Archiv-Abschnitt hinter der Trennlinie samt seiner Überschrift und seinen Karten,
- der Einstellungs-Block am Dateiende mit allen Angaben, auch unbekannten,
- alles darüber hinaus, was in der Datei steht: Es reist unverändert mit.

**Was sich beim Bearbeiten ändert:** Ein Termin in der Schreibweise des anderen Werkzeugs wird beim ersten Bearbeiten seiner Karte in die Aufgaben-Schreibweise der Anwendung umgeschrieben (siehe «Angaben auf der Karte»). **Im anderen Werkzeug erscheint er danach nur noch als Text** und nicht mehr als Termin der Karte. Alle übrigen Angaben einer Aufgabe — Termin-Marker, Priorität, Wiederholung, Tags — bleiben in ihrer Zeile und wirken überall sonst weiter, in der Lese-Ansicht und in den Aufgaben-Abfragen.

**Was hier anders geschieht:** Das Archivieren setzt immer einen Zeitstempel und hält das Archiv bei 100 Karten; das andere Werkzeug tut beides nur, wenn es so eingestellt ist. Angaben seines Einstellungs-Blocks, etwa ein anderes Datums-Format oder eine andere Archiv-Grenze, wertet die Tafel nicht aus.

## Grenzen

- **Ein Dokument trägt eine Tafel.** Mehrere Tafeln in einer Datei gibt es nicht; die Spalten des Dokuments sind die Spalten der einen Tafel.
- **Umgewandelt wird nur ein leeres Dokument.** Ein Dokument mit Inhalt wird nicht zur Tafel erklärt, weil dabei Text verloren ginge; wer eine vorhandene Liste überführen will, legt eine Tafel an und zieht den Text selbst hinüber.
- **Verschoben wird mit der Maus.** Eine Tastatur-Geste zum Verschieben von Karten und Spalten gibt es nicht.
- **Eine Karte trägt eine Zeile.** Bearbeitet wird der Text der Aufgaben-Zeile; ihre eingerückten Folgezeilen erscheinen auf der Karte, werden aber im Dokument geändert und nicht auf ihr.
- **Gelesen wird die Vorgabe-Schreibweise des anderen Werkzeugs:** ein Termin in der Form `@{JJJJ-MM-TT}` und eine Uhrzeit in der Form `@@{HH:mm}`, je das erste Vorkommen in der Karten-Zeile. Ein anders eingestelltes Format, ein zweites Vorkommen und die Verweis-Form `@[[…]]` bleiben Text.
- **Aus dem Archiv führt auf der Tafel kein Weg zurück.** Archivierte Karten erscheinen dort nicht und lassen sich nur im Dokument selbst zurückholen; das Archiv hält fest die jüngsten 100 Karten.
- **Einstellungen je Tafel gibt es nicht.** Die beiden Anzeige-Schalter gelten für alle Tafeln; der Einstellungs-Block wird gelesen und erhalten, seine Angaben wirken auf der Tafel aber nicht.
- **Eine Karte ist keine Notiz.** Aus einer Karte entsteht keine eigene Notiz, die Karte zeigt keine Felder oder Bilder einer verlinkten Notiz, und ein Datum auf der Karte öffnet keine Tagesnotiz.
- **Eine Spalte ohne Überschrift gibt es nicht.** Aufgaben-Zeilen, die vor der ersten Überschrift stehen, gehören zu keiner Spalte und erscheinen deshalb nicht auf der Tafel; im Dokument bleiben sie stehen.
