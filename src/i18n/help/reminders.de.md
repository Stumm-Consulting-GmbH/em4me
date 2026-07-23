# Erinnerungen

Eine Erinnerung meldet sich zu einem selbst gewählten Zeitpunkt und holt eine Aufgabe wieder in den Blick. Sie hängt am Erinnerungs-Marker ⏰ einer Aufgaben-Zeile und ist damit vom Fälligkeits-Termin 📅 getrennt: Der Fälligkeits-Termin nennt den Sach-Termin (wann etwas fertig sein soll), der Erinnerungs-Marker den Melde-Zeitpunkt (wann die App daran erinnert). Erinnerungen sind eine schaltbare Erweiterung und setzen auf den [Aufgaben-Listen](tasks.md) auf.

## Marker und Eingabe-Wege

Der Marker steht wie die übrigen Task-Marker am Zeilenende:

```
⏰ JJJJ-MM-TT [HH:MM]
```

Der Uhrzeit-Anteil ist optional. Fehlt er, meldet sich die Erinnerung zur eingestellten Standard-Uhrzeit (siehe Einstellungen).

```markdown
- [ ] Steuererklärung abgeben ⏰ 2099-04-14
- [ ] Rückruf Kunde ⏰ 2099-04-14 09:30
```

- [ ] Steuererklärung abgeben ⏰ 2099-04-14
- [ ] Rückruf Kunde ⏰ 2099-04-14 09:30

Für die Eingabe gibt es mehrere Wege:

- **Kommando „Erinnerung setzen"** (Standard `Strg+Alt+R`): öffnet auf einer Aufgaben-Zeile den Datums- und Uhrzeit-Picker und schreibt den Marker.
- **Auto-Vervollständigung**: Auf einer Aufgaben-Zeile schlägt der Eintrag „Erinnerung…" den Marker vor und öffnet denselben Picker.
- **Aufgaben-Bearbeitungs-Dialog**: Die Erinnerungs-Zeile des Dialogs setzt oder ändert den Marker zusammen mit den übrigen Feldern.
- **Klick auf den Wert**: Ein Klick auf den ⏰-Wert bzw. das ⏰-Abzeichen öffnet den vorbelegten Picker.

## Benachrichtigungs-Dialog

Ist eine Erinnerung fällig, meldet sie ein Dialog mit der Beschreibung der Aufgabe und einem Link zur Quelldatei. Drei Wege stehen offen:

- **Erledigt**: schaltet die Aufgabe über die konfigurierte Status-Kette weiter. Trägt die Aufgabe eine Wiederholungs-Regel, entsteht die Folge-Instanz, und der ⏰-Marker wandert mit verschobenem Zeitpunkt in diese Instanz.
- **Später erinnern**: verschiebt den Melde-Zeitpunkt. Zur Wahl stehen die konfigurierten Snooze-Optionen (Standard 10 Minuten, 1 Stunde, 4 Stunden, 1 Tag, 1 Woche) sowie eine freie Datums-Wahl. Der neue Zeitpunkt wird direkt in den Marker der Quelldatei geschrieben.
- **Wegklicken** (Schließen oder Escape): schaltet diese Erinnerung bis zum nächsten App-Start stumm. Die Aufgabe selbst bleibt unverändert.

## Nur bei laufender App

Erinnerungen melden sich **ausschließlich, solange die App läuft und der Bereich geöffnet ist**. Es gibt keinen Hintergrund-Dienst und keine Meldung bei geschlossener App. Ist die App zum Melde-Zeitpunkt nicht offen, verfällt trotzdem nichts: Beim nächsten Start sammelt ein **Nachhol-Dialog** alle in der Zwischenzeit fällig gewordenen Erinnerungen und zeigt sie gemeinsam an, mit denselben Aktionen wie im normalen Dialog. Außerhalb eines geöffneten Bereichs findet keine Überwachung statt.

Bei geöffnetem Bereich prüft die App die Marker aller Bereichs-Dateien laufend (im 30-Sekunden-Takt über den Bereichs-Index). Optional lässt sich eine **System-Benachrichtigung** zuschalten, die zusätzlich zum Dialog erscheint, wenn das Fenster nicht im Vordergrund steht; ein Klick darauf holt die App nach vorn.

## Erinnerungs-Liste

Ein Sidebar-Panel listet alle Erinnerungen des Bereichs, gruppiert nach **Überfällig**, **Heute**, **Morgen** und **Später**. Das Panel öffnet sich über das Wecker-Symbol in der Statusleiste oder über Ansicht → Panels → Erinnerungen.

- Pro Eintrag gibt es die Direkt-Aktionen **Erledigt** und **Später**.
- Ein Klick auf einen Eintrag öffnet die Quelldatei an der zugehörigen Zeile.
- Die Gruppe **Überfällig** führt auch stummgeschaltete Erinnerungen und bietet dort **Erneut auslösen** an.

## Einstellungen und Erweiterung

Der Einstellungs-Bereich **Erinnerungen** (Datei → Einstellungen…) steuert:

- **Standard-Uhrzeit**: Melde-Uhrzeit für Marker ohne Uhrzeit-Anteil (Standard 09:00).
- **Snooze-Optionen**: die Liste der Verschiebe-Angebote im Dialog und in der Liste.
- **System-Benachrichtigung**: schaltet die zusätzliche Meldung bei nicht im Vordergrund stehendem Fenster ein oder aus.

Erinnerungen sind eine schaltbare **Erweiterung** mit einer Abhängigkeit zur Erweiterung **Aufgaben**: Ist „Aufgaben" ausgeschaltet, sind auch die Erinnerungen inaktiv. Mehr dazu auf der Seite [Erweiterungen](extensions.md).
