# Portable Fassung

EM4me gibt es als installierte und als portable Fassung. Die portable Fassung wird nicht installiert: Sie ist eine einzelne Programmdatei, die Sie von einem beliebigen Ort aus starten, und sie legt alles, was sie speichert, in einen Ordner neben sich. So lässt sie sich auf einem Stick mitnehmen und auf einem anderen Rechner benutzen, ohne dort etwas einzurichten. Die portable Fassung wird für Windows ausgeliefert; unter Linux legt EM4me seine Daten im Benutzerprofil ab.

## Starten

Die portable Fassung ist die Programmdatei `EM4me-<Version>-Portable.exe`. Legen Sie sie an einen Ort, an dem Sie schreiben dürfen, etwa in einen eigenen Ordner in Ihren Dokumenten oder auf einen Stick, und starten Sie sie dort.

Nichts wird installiert: Es entsteht weder ein Eintrag in der Programmliste von Windows noch eine Zuordnung von Dateiendungen zu EM4me.

## Der Daten-Ordner

Beim ersten Start legt EM4me neben der Programmdatei den Ordner `Data` an. Er nimmt alles auf, was EM4me speichert: Einstellungen, Sitzung, Entwürfe, eigene Oberflächen-Sprachen, externe Erweiterungen und vorübergehende Dateien. Liegt der Ordner schon dort, verwendet EM4me ihn weiter.

**Löschen oder benennen Sie den Ordner `Data` deshalb nicht um.** Fehlt er beim Start, legt EM4me ihn neu und leer an und beginnt wie beim ersten Start; was im bisherigen Ordner lag, verwendet es dann nicht.

Mitnehmen heißt: die Programmdatei zusammen mit dem Ordner `Data` kopieren, am einfachsten den Ordner, in dem beide liegen, etwa auf einen Stick oder auf einen anderen Rechner. Einstellungen und Sitzung kommen damit mit.

## Wo die Daten liegen

„Hilfe → Über…“ zeigt in der portablen Fassung die Zeile „Portable Fassung – Ihre Daten liegen in:“ mit dem vollständigen Pfad des Ordners `Data`. Die Schaltfläche „Daten-Ordner öffnen“ darunter öffnet ihn im Dateimanager. In der installierten Fassung fehlen Zeile und Schaltfläche.

## Der erste Start

Die portable Fassung übernimmt nichts vom Rechner, auf dem sie läuft. Ihr erster Start beginnt mit den Voreinstellungen, auch wenn auf demselben Rechner die installierte Fassung eingerichtet ist: Deren Einstellungen, Zuletzt-Listen und Bereiche liest die portable Fassung nicht. Es ist der erste Start einer neuen Einrichtung — die Produkt-Tour läuft an, und EM4me beginnt im Arbeitsmodus Einsteiger ([Erweiterungen](extensions.md)).

### Die eigene Einrichtung mitnehmen

Wer seine Einrichtung aus der installierten Fassung weiterverwenden will, nimmt sie über eine Austausch-Datei mit:

1. In der **installierten** Fassung „Datei → Einstellungen → Exportieren…“ wählen, die gewünschten Datenarten auswählen und die Datei speichern, zum Beispiel direkt auf dem Stick.
2. In der **portablen** Fassung „Datei → Einstellungen → Importieren…“ wählen, die Datei wählen, die Vorschau lesen und „Übernehmen“ wählen.

Beide Wege gehören zur Erweiterung „Export und Import der eigenen Einstellungen“, die erst im Arbeitsmodus Voll eingeschaltet ist. In der frisch gestarteten portablen Fassung fehlt das Untermenü deshalb zunächst; eingeschaltet wird es unter „Datei → Einstellungen… → Erweiterungen“, mit dem Arbeitsmodus Voll oder mit dem einzelnen Schalter der Erweiterung. Dasselbe gilt in der installierten Fassung, wenn dort ein kleinerer Arbeitsmodus eingestellt ist.

Was die Datei mitnimmt und was nicht, steht auf der Seite [Einstellungen exportieren und importieren](setup-exchange.md). Eigene Oberflächen-Sprachen und externe Erweiterungs-Pakete gehören nicht dazu: Eine eigene Sprache wird in der portablen Fassung erneut eingespielt ([Eigene Oberflächen-Sprache](custom-locale.md)), ein Erweiterungs-Paket in ihr Erweiterungs-Verzeichnis kopiert ([Erweiterungen erstellen](extensions-dev.md)).

## Wenn EM4me nicht schreiben kann

Kann EM4me den Ordner `Data` neben der Programmdatei nicht anlegen oder darin nicht schreiben, etwa auf einem schreibgeschützten Stick oder in einem geschützten Ordner des Systems, meldet es das beim Start mit „EM4me kann nicht starten“ und beendet sich. Es legt dann nirgends etwas ab, auch nicht ersatzweise im Benutzerprofil. Die Meldung erscheint in der Sprache des Betriebssystems, weil die Einstellungen in diesem Augenblick noch nicht gelesen sind.

Abhilfe: Legen Sie die Programmdatei an einen Ort, an dem Sie schreiben dürfen, zum Beispiel in Ihre Dokumente oder auf einen beschreibbaren Stick, und starten Sie sie dort.

## Was die portable Fassung auf dem Rechner hinterlässt

Die portable Fassung wird nicht installiert. Alles, was EM4me speichert, liegt im Ordner `Data` neben der Programmdatei: Einstellungen, Sitzung, Entwürfe und auch vorübergehende Dateien. Nehmen Sie die Programmdatei mit dem Ordner `Data` mit, etwa auf einem Stick, nehmen Sie alles mit.

**Was die Programmdatei beim Start tut.** Die Programmdatei entpackt beim Start das eigentliche Programm in den temporären Ordner von Windows und startet es von dort; beim Beenden entfernt sie es wieder. Wird EM4me hart beendet, etwa über den Task-Manager, kann diese Kopie dort liegen bleiben. Das ist eine Eigenschaft dieser Lieferform und betrifft nur das Programm selbst, nie Ihre Daten.

Ihre Dokumente liegen, wo Sie sie ablegen. Im Ordner eines Bereichs, den Sie öffnen, legt EM4me wie gewohnt seine Bereichs-Dateien an.

**Was Windows festhält.** Windows führt über jedes Programm eigene Aufzeichnungen; EM4me kann das nicht abstellen. Daran lässt sich ablesen, dass EM4me auf dem Rechner lief, von welchem Ort es gestartet wurde und welche Ordner Sie in seinen Datei-Dialogen besucht haben. Dazu gehören zum Beispiel der Anzeige-Name des Programms, die gemerkten Ordner-Ansichten und der zuletzt besuchte Ordner des Datei-Dialogs, ein Zwischenspeicher der Grafik und die Änderungszeit zweier Dateien der Rechtschreibung. Die Aufzählung ist nicht vollständig. Inhalte Ihrer Dokumente und die Namen Ihrer Dateien stehen in keiner der gemessenen Aufzeichnungen.

**Was EM4me dafür tut.** Die portable Fassung trägt nichts in die Liste zuletzt verwendeter Dateien ein, merkt sich den zuletzt besuchten Ordner nur, solange sie läuft, und nimmt keine Wörter ins Wörterbuch auf; die Rechtschreibprüfung selbst arbeitet wie gewohnt.

## Was in der portablen Fassung anders ist

Zwei Dinge verhalten sich in der portablen Fassung bewusst anders als in der installierten, weil sie sonst außerhalb des Ordners `Data` schreiben oder lesen würden:

- **Wörterbuch.** Die Rechtschreibprüfung markiert und schlägt vor wie in der installierten Fassung. Wörter lassen sich aber nicht ins Wörterbuch aufnehmen: Das Kontextmenü des Editors bietet „Zum Wörterbuch hinzufügen“ nicht an, und unter „Einstellungen → Rechtschreibprüfung“ fehlt das Entfernen einzelner Wörter. Beides schriebe in das Wörterbuch des Windows-Benutzers, also auf den Rechner statt in den Ordner `Data`. Mehr zur Prüfung auf der Seite [Werkzeuge](tools.md), Abschnitt „Rechtschreibprüfung“.
- **Datei-Dialoge.** Nach dem Start beginnen die Dialoge zum Öffnen und Speichern im Ordner „Dokumente“, sofern der Vorgang nicht selbst einen Ort vorschlägt. Den zuletzt besuchten Ordner merkt sich EM4me nur, solange das Programm läuft; nach dem Beenden ist er vergessen, und der nächste Start beginnt wieder in „Dokumente“. Was Windows sich selbst über diese Dialoge merkt, liest EM4me nicht.

Die Listen zuletzt geöffneter Dateien und Bereiche innerhalb von EM4me gibt es weiterhin; sie liegen im Ordner `Data`.
