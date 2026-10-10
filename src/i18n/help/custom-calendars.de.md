# Kalender-Systeme

Frei definierbare Zeitrechnungen für Fantasie-Welten und besondere Anwendungsfälle: Jeder Bereich kann eigene Kalender-Blöcke führen, deren Kalender völlig anders aufgebaut sein dürfen als der gewohnte Standard-Kalender — mit eigenen Monats-Längen, Schalt-Regeln, Wochen-Zyklen und Epochen. Die Funktion gehört zur Erweiterung «Kalender-Systeme» und gilt nur im Bereichs-Kontext: Ohne geöffneten Bereich sind die Einstellungs-Sektion und das Einfüge-Kommando inaktiv.

## Konzept

### Blöcke

Ein Block ist eine in sich geschlossene Zeit-Welt mit einem Namen und beliebig vielen Kalendern. Kalender desselben Blocks laufen parallel, sind einander zuordenbar und lassen sich ineinander umrechnen. Verschiedene Blöcke haben bewusst nichts miteinander zu tun — zwischen ihnen gibt es weder Umrechnung noch Vergleichbarkeit.

### Kalender und Ebenen

Ein Kalender besteht aus einer geordneten Liste von Ebenen, kleinste zuerst (etwa Sekunde → Minute → Stunde → Tag → Monat → Jahr), gruppiert in benannte Ebenen-Bereiche (im Standard-Vorbild «Zeit» und «Datum»). Jede Ebene beschreibt ihr Verhältnis zur nächst-kleineren mit einem von fünf Beziehungs-Typen:

- **Fester Faktor** — eine feste Anzahl kleinerer Einheiten, etwa 60 Sekunden je Minute.
- **Längen-Tabelle** — Einheiten mit individuellen Längen, etwa drei Monate mit 30, 30 und 35 Tagen; die Zeilen-Namen der Tabelle sind zugleich die Positions-Namen (Monats-Namen).
- **Schalt-Regel** — bestimmt die Schaltjahre wahlweise **nach Teilbarkeit**, mit Zyklus-Regeln nach dem Muster «Schaltung alle 4, außer alle 100, außer alle 400», oder **nach Muster**: eine Länge des Zyklus in Jahren und die Plätze der Schaltjahre darin, gezählt ab 1 — etwa 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 bei einem Zyklus von 30 Jahren. In beiden Fällen gehören die verlängerte Einheit und die Verlängerung dazu.
- **Eigenständiger Zyklus** — das Wochen-Muster: Ein Zyklus fester Länge läuft über Monats- und Jahresgrenzen hinweg, verankert an einem Referenz-Datum, optional mit Nummerierungs-Regel (die Zyklus-Nummer richtet sich nach dem Jahr, in dem der maßgebliche Tag des Zyklus liegt).
- **Gruppierung** — eine rein rechnerische Zusammenfassung, etwa Quartale aus je drei Monaten.

### Epochen

Jeder Kalender hat genau eine offene Vergangenheits-Epoche (sie zählt rückwärts), beliebig viele geschlossene Zwischen-Epochen und eine offene Zukunfts-Epoche. Die Grenzen schließen nahtlos aneinander an und liegen auf einem Datum ohne Zeit-Anteil; die Jahres-Zählung startet in jeder Epoche bei 1, ein Jahr 0 gibt es nicht. Eine Epochen-Grenze darf mitten im Jahr liegen — das Jahr 1 der neuen Epoche ist dann ein Teiljahr.

### Umrechnung über die Block-Achse

Jeder Block besitzt eine neutrale Zeit-Achse. Jeder Kalender wird über einen Anker (der Kalender-Zeitpunkt, der auf dem Achsen-Nullpunkt liegt) und eine Skala (die Dauer seiner kleinsten Einheit in Achsen-Einheiten, als Bruch aus Zähler und Nenner) auf diese Achse abgebildet. Umrechnungen zwischen Kalendern laufen immer über die Block-Achse und runden deterministisch auf die kleinste Ebene des Ziel-Kalenders ab; ablesen lässt sich das Ergebnis mit dem Kommando «Datum umrechnen» (Abschnitt gleichen Namens).

## Pflege in den Einstellungen

Der Einstellungs-Bereich «Kalender-Systeme» zeigt die Blöcke des geöffneten Bereichs in zwei Stufen: Die Übersicht verwaltet die Blöcke (anlegen, umbenennen, öffnen, entfernen), die Detail-Ansicht eines Blocks zeigt seine Kalender als Formulare mit Editoren für Ebenen, Epochen, Zyklen, Gruppierungen und die Block-Achse.

- Das Aufklapp-Menü **«Vorlage einfügen …»** legt eine fertig ausgefüllte Zeitrechnung aus den mitgelieferten Vorlagen an (Abschnitt «Mitgelieferte Vorlagen»). Wer ohne Vorlage beginnt, legt mit **«Kalender hinzufügen»** eine leere Zeitrechnung an.
- **Mehrzahl:** Neben dem Namen jeder Ebene steht das Feld «Mehrzahl», ebenso am Zyklus («Zyklus-Name (Mehrzahl)») und an jeder Gruppierung («Gruppierungs-Name (Mehrzahl)»). Eine Zeitspanne zeigt bei genau einer Einheit die Einzahl, sonst die Mehrzahl, etwa «1 Monat, 2 Wochen, 4 Tage»; ohne Mehrzahl gilt immer die Einzahl.
- **«Kürzel der Epoche immer schreiben»:** Das Kontrollkästchen am Ende der Gruppe «Epochen» schreibt das Kürzel auch in der jüngsten Epoche in den Wert. Das ist sinnvoll, wenn später weitere Epochen hinzukommen: Bereits gespeicherte Werte behalten dann ihre Bedeutung. Ein Wert der jüngsten Epoche meint mit und ohne Kürzel denselben Tag. Was beim Nachtragen einer Epoche mit Werten ohne Kürzel geschieht, beschreibt der Abschnitt «Eine Epoche nachtragen».
- Die **Live-Vorschau** zeigt einen frei wählbaren Beispiel-Wert kanonisch und mit Namen; solange eine Definition unvollständig ist, meldet der Editor das als Hinweis (weiche Validierung), erst das Anwenden prüft hart.
- Die Definitionen werden in der Bereichsdatei gespeichert (Datei `Area_Settings.mdda`) und gelten für alle Fenster des Bereichs.

Die Bearbeitung ist bewusst nie gesperrt: Struktur-Änderungen an bereits benutzten Kalendern sind erlaubt. Werte im Dokument, die dadurch ungültig werden, bleiben unverändert erhalten und werden sichtbar markiert.

### Eine Epoche nachtragen

Ein Wert der jüngsten Epoche steht ohne Kürzel im Dokument, und ein Wert ohne Kürzel wird immer als Wert der jüngsten Epoche gelesen. Bekommt eine Zeitrechnung eine neue jüngste Epoche, würden gespeicherte Werte der bisher jüngsten deshalb einen anderen Tag bezeichnen oder ungültig werden. Gibt es im Bereich solche Werte, fragt das Programm beim Anwenden nach, bevor es speichert, und nennt ihre Zahl:

- **«Werte sichern und anwenden»** speichert die Änderung und schreibt jeden betroffenen Wert so um, dass er denselben Tag bezeichnet wie bisher. Ein Wert vor dem Beginn der neuen Epoche bekommt das Kürzel der bisherigen: Aus `@{Kalendername: 30-06-01}` wird `@{Kalendername: 30-06-01 AZ}`. Ein Wert ab dem Beginn der neuen Epoche bekommt deren Jahreszahl: Beginnt sie im Jahr 31 der bisherigen, wird aus `@{Kalendername: 32-01-15}` der Wert `@{Kalendername: 2-01-15}`. Das gilt auch für einen Wert, der schon das Kürzel der bisherigen Epoche trägt und sonst ungültig würde.
- **«Ohne Sichern anwenden»** speichert die Änderung und lässt die Werte, wie sie sind.
- **«Abbrechen»** lässt Einstellungen und Dokumente unverändert.

Gesichert wird jede Textstelle mit einem betroffenen Wert in den Markdown-Dokumenten des Bereichs und in den Dokument-Notizen, auch auf Canvas-Karten, in Kanban-Tafeln und in Code-Abschnitten. Vor der Änderung eines Dokuments legt das Programm dessen bisherigen Stand in der Dokument-Historie ab; ein geöffnetes Dokument mit ungespeicherten Änderungen bekommt die Änderung in seinen ungespeicherten Stand und ist erst mit dem Speichern gesichert; der Bericht kennzeichnet es. Dokument-Notizen haben keine Historie.

Am Ende nennt ein Bericht je Dokument die Zahl der gesicherten Werte und getrennt die Dokumente, die nicht geändert werden konnten: geteilte Dokumente, Dokumente, die in einem anderen Fenster mit ungespeicherten Änderungen geöffnet sind, und Dokumente, die sich seit der Zählung geändert haben. Dort sind die Werte von Hand zu berichtigen. Frühere Stände in der Dokument-Historie bleiben, wie sie gespeichert wurden.

In einem sehr großen Bereich, dessen Text die Bereichs-Suche nicht vorhält, kann das Programm die Werte weder zählen noch sichern; die Rückfrage sagt das und bietet nur «Anwenden» und «Abbrechen».

Wer von vornherein mit weiteren Epochen rechnet, schaltet «Kürzel der Epoche immer schreiben» ein: Dann trägt jeder neue Wert sein Kürzel, und zu sichern bleiben nur Werte ab dem Beginn der neuen Epoche.

## Mitgelieferte Vorlagen

Das Aufklapp-Menü **«Vorlage einfügen …»** in der Detail-Ansicht eines Blocks bietet die mitgelieferten Kalender in dieser Reihenfolge an:

1. Gregorianischer Kalender
2. Julianischer Kalender
3. Hidschri-Kalender (tabellarisch)
4. Indischer Nationalkalender
5. Buddhistischer Kalender
6. Äthiopischer Kalender
7. Koptischer Kalender
8. Japanischer Kalender
9. Minguo-Kalender

Die Auswahl legt die Zeitrechnung sofort im geöffneten Block an, fertig ausgefüllt und ohne weitere Eingabe; danach steht das Menü wieder auf seinem ersten Eintrag. Die Zeitrechnung trägt den Namen aus dem Menü; ist er im Bereich schon vergeben, bekommt sie eine angehängte Zahl, etwa «Gregorianischer Kalender 2». Gespeichert wird sie wie jede Änderung dieser Sektion mit **«Anwenden»**.

Jede Vorlage bringt die Zeit-Ebenen Sekunde, Minute und Stunde, eine Sieben-Tage-Woche und für ihre Einheiten Einzahl und Mehrzahl mit. Der gregorianische Kalender zeigt dazu alle Beziehungs-Typen in einer Definition: zwölf Monate, Schalt-Regel, Wochen-Zyklus, Quartale und Halbjahre. Alle Vorlagen liegen auf derselben Tages-Achse: Zeitrechnungen aus Vorlagen rechnen im selben Block ohne weitere Angabe ineinander um.

### Was eine angelegte Vorlage ist

Eine angelegte Vorlage ist eine gewöhnliche Zeitrechnung des Bereichs. Sie lässt sich danach wie jede andere bearbeiten, umbenennen, ergänzen und löschen; die Vorlage ist der Ausgangspunkt, keine dauerhafte Bindung. Eine Programm-Aktualisierung erreicht eine bereits angelegte Zeitrechnung deshalb nicht.

Die übrigen Datums-Funktionen der Anwendung bleiben gregorianisch: Aufgaben-Marker, Journale, Abfrage-Vergleiche und Datentabellen-Typen kennen keine eigenen Zeitrechnungen.

### Lesarten und Grenzen

- **Hidschri-Kalender (tabellarisch)** — bildet die tabellarische Lesart ab: zwölf Monate abwechselnd mit 30 und 29 Tagen, im Schaltjahr hat der zwölfte Monat (Dhu l-Hiddscha) 30 Tage; Schaltjahre sind die Jahre 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 und 29 jedes Zyklus von 30 Jahren, gezählt ab der bürgerlichen Epoche. Diese Rechnung gilt für jedes Jahr gleich. Das religiös gelebte Datum richtet sich dagegen nach der Sichtung der Mondsichel und kann um einen Tag, selten um zwei abweichen. Die Tage beginnen um Mitternacht, nicht bei Sonnenuntergang.
- **Buddhistischer Kalender** — die buddhistische Jahreszählung, wie sie in Thailand gilt: gregorianische Monate und Schaltjahre, die Jahreszahl um 543 höher als die gregorianische. Bis 1940 begann das thailändische Jahr am 1. April; die Vorlage rechnet durchgehend mit dem Jahresbeginn am 1. Januar und zeigt deshalb vor 1941 von Januar bis März ein um eins höheres Jahr als im damaligen Gebrauch, ab April dasselbe.
- **Indischer Nationalkalender** und **Minguo-Kalender** — beide rechnen auch vor ihrer Einführung (Indischer Nationalkalender 1957, Minguo-Kalender 1912) rückwärts weiter. Für diese Zeit sind sie in den Quellen nicht als gültig belegt; vor 1912 nennen die Quellen Monat und Tag oft nach dem Mondkalender.
- **Japanischer Kalender** — gregorianische Monate und Schaltjahre mit den Ären Meiji (ab 23. Oktober 1868), Taishō (ab 30. Juli 1912), Shōwa (ab 25. Dezember 1926), Heisei (ab 8. Januar 1989) und Reiwa (ab 1. Mai 2019); das Jahr 1 einer Ära läuft von ihrem Beginn bis zum 31. Dezember. Davor zählt die Epoche «vor Meiji» rückwärts; ältere Ären fehlen, weil sie auf dem Mondkalender beruhen. Vor 1873 galt in Japan der Mondkalender: Daten vor 1873 sind deshalb rückgerechnet gregorianisch und weichen in Monat und Tag, mitunter auch im Jahr vom historischen Gebrauch ab. Die Vorlage schreibt die Ära immer mit (Kontrollkästchen «Kürzel der Epoche immer schreiben» eingeschaltet): Der 30. September 2026 steht als `8-09-30 Reiwa` im Dokument.

### Eine neue japanische Ära nachtragen

Beginnt in Japan eine neue Ära, nimmt die nächste Programm-Version nach ihrer Bekanntgabe sie in die Vorlage «Japanischer Kalender» auf. Eine bereits angelegte Zeitrechnung erreicht das nicht; dort wird die Ära von Hand nachgetragen:

1. In den Einstellungen die Sektion «Kalender-Systeme» aufrufen und den Block mit **«Öffnen»** öffnen.
2. In der japanischen Zeitrechnung unter «Epochen» **«Epoche hinzufügen»** wählen.
3. In der neuen, letzten Epoche unter **«Name»** und **«Kürzel»** jeweils den Namen der Ära eintragen und unter **«Beginn»** ihren ersten Tag nach dem gregorianischen Kalender.
4. **«Anwenden»** wählen.

Weil die Vorlage das Kürzel der Ära immer schreibt, behalten bereits gespeicherte Werte vor dem Beginn der neuen Ära dabei ihre Bedeutung: `8-09-30 Reiwa` bleibt der 30. September 2026. Ein Wert ab dem Beginn der neuen Ära, der noch in der bisherigen gezählt ist, würde ungültig; das Programm fragt beim Anwenden nach und rechnet ihn auf Wunsch in die Jahreszählung der neuen Ära um (Abschnitt «Eine Epoche nachtragen»).

## Werte im Dokument

Ein Kalender-Wert steht in kanonischer Form im Quelltext:

```text
@{Kalendername: Jahr-Monat-Tag}
@{Kalendername: Jahr-Monat-Tag Epochen-Kürzel}
@{Kalendername: Jahr-Monat-Tag Stunde:Minute:Sekunde}
```

Der erste Doppelpunkt trennt den Kalender-Namen vom Wert. Die Datums-Segmente stehen groß nach klein; das Epochen-Kürzel entfällt in der jüngsten Epoche, sofern an der Zeitrechnung nicht «Kürzel der Epoche immer schreiben» eingeschaltet ist, der Zeit-Teil entfällt, wenn alle Zeit-Segmente auf ihrem Minimum stehen. In gerenderter Ansicht, Live-Modus und Portable-Export erscheint der Wert als Badge mit den Namen aus der Definition (etwa Monats-Namen und Epochen-Kürzel).

Ist der genannte Kalender im Bereich nicht definiert oder der Wert ungültig, bleibt der Quelltext unverändert und der Wert wird sichtbar markiert — wie dieses Beispiel, dessen Kalender es auf dieser Handbuch-Seite nicht gibt:

@{Beispiel-Kalender: 500-2-09 ZZ}

In Code-Blöcken und Code-Spans bleibt die Syntax unangetastet: `@{Beispiel-Kalender: 500-2-09 ZZ}`.

## Einfügen und Bearbeiten

- **Einfügen:** Das Kommando «Kalender-Datum einfügen» (Kommando-Palette; Kürzel belegbar) öffnet den Picker und fügt den gewählten Zeitpunkt kanonisch am Cursor ein. Es ist aktiv, sobald der geöffnete Bereich mindestens einen Kalender definiert.
- **Bearbeiten:** Werte sind im Quelltext- und Live-Modus klickbar; der Klick öffnet den Picker mit dem Wert vorbelegt, Übernehmen ersetzt ihn an Ort und Stelle in einem einzigen Undo-Schritt. Auf der Zeile mit dem Cursor öffnet **Strg-Klick** den Picker, während der einfache Klick dort den Cursor setzt.

## Picker

Der Picker für benutzerdefinierte Kalender arbeitet analog zum Standard-Datums-Picker:

- Kopf-Auswahlen für **Block**, **Kalender** und **Epoche** (Auswahlen mit nur einem Eintrag entfallen). Ein Kalender-Wechsel rechnet den gewählten Zeitpunkt um; ein Block-Wechsel springt zum Anker des Ziel-Kalenders.
- Das **Gitter** entsteht aus der Ebenen-Struktur: Mit definiertem Wochen-Zyklus als Spalten-Gitter (Zyklus-Länge = Spalten-Zahl, Positions-Namen als Kopf, Nummern-Spalte bei Nummerierungs-Regel), ohne Zyklus als fortlaufende Tages-Liste der Einheit.
- **Navigation:** Die äußeren Pfeil-Knöpfe schieben die größte Einheit (das Jahr), die inneren die Gitter-Einheit (den Monat); Pfeiltasten navigieren tage-weise, Enter übernimmt, Escape bricht ab. **«Zum Anker»** springt zum Referenz-Zeitpunkt des Kalenders.
- **Zeit-Ebenen** erscheinen als einzeln stellbare Segmente mit Pfeil- und Ziffern-Eingabe — ungültige Werte sind konstruktionsbedingt nicht eingebbar.

### Umrechnungs-Anzeige

Unterhalb des Gitters zeigt der Picker den gewählten Zeitpunkt in allen Parallel-Kalendern des Blocks. Ein Klick auf eine Entsprechung wechselt den aktiven Kalender dorthin. Kalender verschiedener Blöcke sind bewusst nicht umrechenbar.

## Datum umrechnen

Das Kommando «Datum umrechnen» zeigt, welchem Zeitpunkt in den anderen Kalendern eines Blocks ein Datum entspricht. Es steht in der Kommando-Palette und im Kontextmenü des Editors; ein Kürzel ist unter Datei → Einstellungen… → Tastenkürzel belegbar. Es ist aktiv, sobald der geöffnete Bereich mindestens einen Kalender definiert, auch in der Lese-Ansicht.

Der Dialog bietet die Auswahlen **«Block»** (nur bei mehreren Blöcken) und **«Kalender»**, das Feld **«Datum»** für einen Wert in kanonischer Schreibweise ohne Kalender-Namen (Abschnitt «Werte im Dokument») und den Knopf **«Wählen …»**, der den Picker öffnet. Darunter nennt die Liste **«Entspricht»** für jeden weiteren Kalender des Blocks eine Zeile «Name: Wert». Ein Klick oder Enter auf eine Zeile macht deren Kalender zum Ausgangspunkt; so lässt sich in jede Richtung umrechnen. Vorbelegt ist der Dialog mit der Auswahl im Text: Berührt sie einen Kalender-Wert oder steht der Cursor darin, mit dessen Kalender und Wert. Ist einzeiliger Text ohne Kalender-Wert ausgewählt, gilt er als Wert in kanonischer Schreibweise im ersten Kalender des Bereichs, in dem er gültig ist; ist er in keinem gültig, steht er im ersten Kalender mit der Meldung «Kein gültiges Datum dieses Kalenders.». Andere Schreibweisen wie «3.10.2026» deutet der Dialog nicht.

Jede Zeile mit Ergebnis trägt die Tasten **«Kopieren»** und **«Einfügen»**; beide übernehmen die Entsprechung als Kalender-Wert mit Namen, `@{Name: Wert}`, so wie «Kalender-Datum einfügen» ihn schreibt. «Kopieren» legt ihn in die Zwischenablage; der Dialog bleibt offen, und die Taste zeigt kurz «Kopiert». «Einfügen» schreibt ihn in einem einzigen Undo-Schritt in das Dokument und schließt den Dialog: Eine Auswahl wird ersetzt, und steht der Cursor ohne Auswahl in einem Kalender-Wert, kommt die Entsprechung dahinter. Das ist nur möglich, wenn der Dialog aus einem Dokument im Bearbeiten-Modus geöffnet wurde; sonst ist die Taste deaktiviert und nennt im Kurzhinweis den Grund. «Kopieren» geht immer. Von selbst ändert der Dialog nichts am Dokument, erst «Einfügen» schreibt. So wird ein Datum durch seine Entsprechung ersetzt: den Kalender-Wert ganz oder ein Datum als Text auswählen, «Datum umrechnen» aufrufen und an der gewünschten Zeile «Einfügen» wählen.

Wo es kein Ergebnis gibt, steht eine Auskunft statt eines Werts:

- Ein Datum, das es im gewählten Kalender nicht gibt, meldet «Kein gültiges Datum dieses Kalenders.»; die Liste entfällt dann.
- Kann ein Kalender den Zeitpunkt nicht darstellen, lautet seine Zeile «Name: außerhalb des darstellbaren Bereichs».
- Hat der Block nur einen Kalender, sagt der Dialog, dass ein zweiter fehlt.

Umgerechnet wird nur innerhalb eines Blocks; daran erinnert die Hinweis-Zeile des Dialogs. Kalender, die ineinander umgerechnet werden sollen, gehören deshalb in denselben Block. Eine Zeitrechnung lässt sich nicht in einen anderen Block verschieben: Sie wird im Ziel-Block neu angelegt oder dort als Vorlage eingefügt. Das Ergebnis ist so gut wie Anker und Skala der beteiligten Kalender: Die mitgelieferten Vorlagen liegen von sich aus auf derselben Tages-Achse, bei selbst angelegten Kalendern legt die Gruppe «Block-Achse (Umrechnung)» in den Einstellungen ihre Lage fest.

## Abgeleitete Zeitrechnungen

Eine abgeleitete Zeitrechnung zählt ab einem selbst gesetzten Nullpunkt: wie lange es noch bis zu einem Termin dauert oder wie lange ein Ereignis her ist. Sie braucht keine eigene Definition, sondern nur eine Bezugs-Zeitrechnung und einen Nullpunkt.

### Anlegen

Im Einstellungs-Bereich «Kalender-Systeme» legt der Knopf **«Abgeleitete Zeitrechnung hinzufügen»** ein kurzes Formular an:

- **Bezugs-Zeitrechnung** — ein Kalender desselben Blocks oder die mitgelieferte Standard-Zeitrechnung. Wer nur einen Termin herunterzählen will, braucht damit keinen eigenen Kalender.
- **Nullpunkt (Tag 1)** — das Datum in der Notation des Bezugs, wahlweise über den Picker gewählt; es liegt immer auf einem vollen Tag.
- **Gliederungs-Tiefe** — wie fein die Zeitspanne gegliedert wird, von der kleinsten Einheit allein bis hinauf zu den Jahren.
- **Richtungs-Kürzel** — zwei kurze Wörter für die Zeit vor und nach dem Nullpunkt.

Editoren für Ebenen, Zyklen, Gruppierungen und Epochen gibt es hier nicht, weil nichts davon überschreibbar ist.

### Was geerbt wird

Die Ableitung übernimmt die Einheiten ihres Bezugs und verschiebt deren Grenzen auf den Nullpunkt. Liegt dieser auf einem 23., beginnt jeder abgeleitete Monat am 23. und jedes abgeleitete Jahr am selben Tag; die Wochen beginnen am Wochentag des Nullpunkts. Jede Einheit behält damit die Länge, die sie im Bezug hat, und ein Schalttag fällt von selbst in das richtige Jahr. Die Namen wandern mit: Beginnt die Zählung im Juli, heißt der erste Monat weiterhin Juli. Liegt der Nullpunkt auf einem Tag, den nicht jeder Monat hat, rückt die Grenze auf den letzten vorhandenen Tag.

### Werte im Dokument

Der Wert zählt in beide Richtungen vom Nullpunkt weg: gröbere Einheiten als vollständige Anzahl ab 0, die kleinste als Ordnungszahl ab 1. Vor dem Nullpunkt gilt dieselbe Form mit dem Richtungs-Kürzel.

```text
@{Zeitrechnung: 0-0-1}            der Nullpunkt selbst
@{Zeitrechnung: 0-1-18}           ein Monat und siebzehn Tage danach
@{Zeitrechnung: 0-0-15 vor GL}    fünfzehn Tage davor
```

Angezeigt wird daraus die Zeitspanne in der gewählten Tiefe, ohne Bestandteile der Länge null, etwa «1 Monat, 2 Wochen, 4 Tage». Der Kurzhinweis nennt zusätzlich den kanonischen Wert und den entsprechenden Zeitpunkt der Bezugs-Zeitrechnung. Steht die Ableitung auf der Standard-Zeitrechnung, erscheinen die Einheiten in Ein- und Mehrzahl; bei selbst definierten Kalendern gilt dafür das Feld «Mehrzahl» der jeweiligen Einheit, ohne Mehrzahl steht immer die Einzahl.

### Picker

Der Picker einer abgeleiteten Zeitrechnung zeigt das Gitter ihres Bezugs: Gewählt wird ein gewöhnliches Datum, eingefügt die Zählung. **«Zum Anker»** springt auf den Nullpunkt.

### Änderungen an der Bezugs-Zeitrechnung

Ein Wert ist eine Koordinate seiner Zeitrechnung. Ändert sich die Bezugs-Zeitrechnung, verschieben sich deshalb auch die Werte ihrer Ableitungen. Der Editor weist dauerhaft auf bestehende Ableitungen hin und verlangt beim Anwenden eine Bestätigung; eine Zeitrechnung mit Ableitungen lässt sich nicht löschen, solange diese bestehen. Reine Benennungen — Namen und Mehrzahl von Ebenen, Zyklen und Gruppierungen sowie Monats- und Wochentags-Namen — verschieben keinen Wert und verlangen keine Bestätigung.
