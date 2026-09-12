# Eigene Oberflächen-Sprache

Die Oberfläche steht in fünf mitgelieferten Sprachen bereit. Wer eine sechste braucht — eine Regionalsprache, eine Sprache, die sonst kein Programm bedient, oder schlicht die eigene Wortwahl im eigenen Fachgebiet —, übersetzt sie selbst. Der Weg hat drei Schritte: **Vorlage herunterladen**, **im eigenen Editor übersetzen**, **einspielen**. Danach steht die eigene Sprache in der Sprach-Auswahl der Statusleiste neben den mitgelieferten. Alle Wege stehen im Menü Datei → Eigene Sprache: „Vorlage herunterladen…", „Einspielen…", „Entfernen…" und „Aktualisieren…".

Die Bedien-Wege gehören zur Erweiterung „Eigene Oberflächen-Sprache" ([Erweiterungen](extensions.md)); im Aus-Zustand entfällt das Untermenü. Eine bereits eingespielte Sprache bleibt davon unberührt: Sie wird weiter geladen und bleibt eingestellt. Der Aus-Zustand nimmt einen Weg, nie eine Sprache.

## Die Vorlage herunterladen

„Datei → Eigene Sprache → Vorlage herunterladen…" schreibt den vollständigen Text-Bestand der Anwendung in eine JSON-Datei; der gewohnte Speichern-Dialog fragt nach Ort und Namen. Die Vorlage trägt **immer Englisch**, unabhängig von der eingestellten Sprache: Englisch ist die Bezugs-Fassung, gegen die eine Übersetzung später gemessen wird.

Die Datei ist ein flaches Verzeichnis aus Schlüsseln und Texten. Ganz oben stehen zwei leere Einträge, mit denen sich die Sprache benennt; darunter folgt Eintrag für Eintrag der englische Bestand:

```json
{
  "@@locale": "",
  "@@name": "",
  "toolbar.open": "Open",
  "view.source": "Source",
  "view.split": "Split",
  …
}
```

Links steht der Schlüssel, rechts der Text. **Übersetzt wird ausschließlich rechts.** Die Schlüssel bleiben unverändert — an ihnen findet die Anwendung ihre Texte wieder.

Wie die Datei heißt, ist dagegen ohne Bedeutung. Sie darf beim Kopieren, beim zweiten Herunterladen oder beim Umbenennen jeden Namen annehmen; welche Sprache sie trägt, steht **in** ihr und nicht in ihrem Namen.

## Im eigenen Editor übersetzen

Die Datei ist gewöhnliches JSON und lässt sich in jedem Editor bearbeiten, der Text in UTF-8 speichert. Vier Dinge sind dabei zu beachten.

### Die Sprache benennen

Die beiden Einträge ganz oben sind leer, damit sie als Aufforderung erkennbar sind:

- `@@locale` ist das **Kürzel** der Sprache: zwei oder drei Buchstaben, wahlweise mit einem Schrift- oder Regions-Zusatz, also etwa `nds` oder `nds-DE`. Geprüft wird die Form, nicht die Existenz — wer eine Sprache übersetzt, die keine Norm führt, soll sie trotzdem benennen können. Ein Kürzel einer mitgelieferten Sprache ist nicht zulässig: Eine eigene Sprache tritt **neben** die mitgelieferten, sie ersetzt keine.
- `@@name` ist der **Anzeige-Name**, so wie er in der Sprach-Auswahl erscheinen soll, höchstens 40 Zeichen. Üblich ist der Name der Sprache in der Sprache selbst.

### Platzhalter

Manche Texte tragen Platzhalter in geschweiften Klammern, etwa `{name}` oder `{n}`. Die Anwendung setzt dort zur Laufzeit einen Wert ein — einen Datei-Namen, eine Anzahl. Platzhalter werden **unverändert übernommen**: dieselbe Schreibweise, derselbe Bestand. Ihre **Stellung im Satz** ist dagegen frei, denn kein Satzbau gleicht dem anderen.

### Auszeichnung

Ein Teil der Texte trägt Markdown-Auszeichnung, weil er im Handbuch in einer Tabelle erscheint: ein Wort in Code-Schrift, seltener ein Link oder eine Hervorhebung. Die Regel dafür lautet: Ein übersetzter Text darf genau die **Arten** von Auszeichnung führen, die das Original an **demselben** Eintrag führt — nicht dieselbe Anzahl. Wo das Original einen Code-Span hat, dürfen es zwei sein; wo es keinen Link hat, kommt keiner hinein. Und ein Link zeigt auf ein gewöhnliches Ziel: `http`, `https`, `mailto` oder ein Ziel innerhalb des Handbuchs.

### Unvollständig ist erlaubt

Eine Übersetzung muss nicht fertig sein, um zu wirken. Es genügt, dass die Datei mindestens einen bekannten Eintrag trägt; alles Übrige darf englisch bleiben und wird später ergänzt. Was fehlt, erscheint auf Englisch — siehe den Abschnitt „Was noch nicht übersetzt ist".

## Einspielen und Prüfung

„Datei → Eigene Sprache → Einspielen…" fragt nach der Datei. Geprüft wird, **bevor** etwas abgelegt wird: Größe und Aufbau, dann jeder Eintrag auf einen Text als Wert, auf unveränderte Platzhalter, auf zulässige Auszeichnung und zulässige Link-Ziele, dazu die beiden Benennungs-Felder.

Zwei Zusicherungen gelten dabei:

- **Eine Abweisung nennt den Eintrag**, an dem sie hängt, samt Grund — etwa dass die Platzhalter eines bestimmten Schlüssels von denen des Originals abweichen. Damit ist die Stelle im Editor auffindbar, statt die ganze Datei durchsehen zu müssen.
- **Nichts wird halb übernommen.** Findet die Prüfung einen Verstoß, bleibt der bisherige Bestand unangetastet; es entsteht keine Sprache, die zur Hälfte aus der Datei und zur Hälfte aus dem Nichts besteht.

Geht die Prüfung durch, nennt die Rückmeldung den Namen der Sprache und die Zahl der übernommenen Einträge. Schlüssel, die die Anwendung nicht kennt — Reste einer älteren Vorlage —, werden übersprungen und in derselben Rückmeldung gezählt.

Ist eine eigene Sprache mit demselben Kürzel bereits eingespielt, **fragt die Anwendung vorher nach**; Abbrechen ist die Vorgabe. Beim Ersetzen wird die zuvor eingespielte Fassung überschrieben, die Datei, aus der sie stammt, bleibt unberührt.

## Die eigene Sprache auswählen

Gewählt wird sie wie jede andere: über die Sprach-Auswahl in der Statusleiste ([Ansichten und Darstellung](views-display.md)). Eigene Sprachen stehen dort in einer eigenen Gruppe „Eigene Sprachen" unter den mitgelieferten, mit dem Namen aus `@@name`.

Die Wahl wirkt sofort und überall: im Fenster, in den Menüs und in den Dialogen des Betriebssystems, und zwar in allen offenen Fenstern. Sie bleibt über den Neustart hinaus bestehen — die eigene Sprache ist eine Einstellung wie jede andere.

Ist die Sprachdatei einmal nicht auffindbar, bleibt die Einstellung trotzdem stehen: Die Oberfläche zeigt Englisch, und ein Hinweis sagt, welche eigene Sprache fehlt. Kommt die Datei zurück, greift die Sprache ohne weiteres Zutun wieder.

## Was noch nicht übersetzt ist

Fehlt ein Eintrag in der eigenen Sprachdatei, zeigt die Anwendung den **englischen** Text — Eintrag für Eintrag, nicht seiten- oder dialogweise. Das ist beabsichtigt und kein Fehler: Eine halb übersetzte Oberfläche ist von Anfang an benutzbar, und die Arbeit lässt sich in Etappen erledigen.

Wer also seine eigene Sprache eingestellt hat und daneben englische Beschriftungen sieht, sieht die **Lücken seiner Übersetzung** und keinen Programmfehler. Sie schließen sich, sobald die betreffenden Einträge in der Datei stehen und diese erneut eingespielt ist.

## Nach einer neuen Programmfassung

Eine Anwendung, die wächst, bringt Texte hinzu, die eine früher übersetzte Datei nicht kennen kann. Die eigene Sprache altert dadurch, und die Anwendung sagt es: Ein Hinweis in der Statusleiste nennt den Namen der Sprache und die **Zahl der fehlenden Einträge**. Er erscheint einmal je Stand — derselbe Stand meldet sich nicht erneut, eine geänderte Zahl oder eine andere Programmfassung dagegen schon.

„Datei → Eigene Sprache → Aktualisieren…" liefert das Mittel dazu. Der Weg speichert die eigene Sprachdatei auf dem Stand der laufenden Fassung: Benennung und eigene Übersetzungen bleiben, die fehlenden Einträge stehen an ihrer Stelle auf Englisch. Übersetzen Sie, was noch englisch ist, und spielen Sie die Datei wieder ein. Der Unterschied zur Vorlage ist allein die Quelle — hier die eigene Sprache statt Englisch.

Ein Dialog stellt die eingespielten Sprachen zur Auswahl, auch wenn es nur eine ist; das ist unabhängig davon, welche gerade eingestellt ist. Die Rückmeldung nennt, wie viele Einträge in der gespeicherten Datei noch englisch sind. Ist gar keine eigene Sprache eingespielt, sagt das ein Hinweis statt eines leeren Dialogs.

## Entfernen

„Datei → Eigene Sprache → Entfernen…" stellt die eingespielten Sprachen mit ihrem Namen zur Auswahl; Abbrechen ist die Vorgabe. Gelöscht wird die Sprachdatei im Benutzerprofil — die Datei, aus der sie eingespielt wurde, bleibt liegen, wo sie liegt.

Ist die entfernte Sprache gerade eingestellt, wechselt die Oberfläche auf Englisch. Das ist der Unterschied zur fehlenden Datei oben: Wer eine Sprache selbst wegnimmt, soll nicht bei jedem Start an sie erinnert werden.

## Wo die Sprachdatei liegt

Beim Einspielen legt die Anwendung eine Kopie im **Benutzerprofil** ab, im Ordner `locales` neben ihren übrigen Daten. Daraus folgen drei Zusicherungen:

- Die eigene Sprache **überdauert eine Neuinstallation** des Programms; sie liegt außerhalb des Programm-Verzeichnisses.
- Es wird **nichts in das Programm-Verzeichnis geschrieben**. Der Weg verlangt damit keine erhöhten Rechte und funktioniert auch dort, wo das Programm-Verzeichnis schreibgeschützt ist.
- Die abgelegte Datei ist **dieselbe Art Datei** wie die eingespielte: Sie trägt ihre Benennung weiter und heißt nach dem Sprach-Kürzel. Wer sie sichern oder weitergeben will, kopiert sie.

Gelesen wird die Datei bei jedem Start erneut und dabei erneut geprüft — der Ordner ist mit einem Editor erreichbar, und geprüft wird deshalb nicht nur beim Einspielen.

## Was die Funktion nicht leistet

Drei Grenzen gehören dazu, damit die Erwartung stimmt:

- **Das Handbuch bleibt in den fünf mitgelieferten Sprachen.** Übersetzt wird die Oberfläche, nicht die Dokumentation; bei eingestellter eigener Sprache erscheinen die Handbuch-Seiten auf Englisch.
- **Es gibt keine Übersetzungs-Hilfe.** Die Anwendung schlägt nichts vor, übersetzt nichts selbst und prüft keine Sprachrichtigkeit. Sie prüft die **Form** einer Datei, nicht ihren Inhalt.
- **Es gibt keinen Austausch-Ort.** Fertige Sprachen lassen sich nicht aus einer Sammelstelle beziehen. Eine Sprachdatei ist eine gewöhnliche Datei und geht den Weg jeder anderen: per Datenträger, als Anhang, über einen geteilten Ordner.
