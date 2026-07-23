# Dokument-Historie

Die Dokument-Historie protokolliert Änderungen eines Markdown-Dokuments als **Revisions-Historie**: Wer ein Dokument über längere Zeit pflegt, sieht, welche Änderungen wann gemacht wurden, kann zwei Stände zeilenweise vergleichen und einen früheren Stand zurückholen. Die Historie liegt in einer **Begleitdatei** neben dem Dokument und reist mit ihm mit, wenn beide Dateien zusammen kopiert oder verschoben werden.

## Markdown-Data-Dateien (.mdd)

Zu einem Dokument `Notizen.md` gehört die Begleitdatei `Notizen.mdd` („Markdown-Data") im selben Ordner. Sie entsteht bei der ersten Speicherung mit aktiver Historisierung und enthält die vollständige Historie: den Ausgangsstand, alle Änderungspakete und in Abständen volle Zwischenstände als Ankerpunkte. Das Format ist lesbarer Klartext (JSON) und bewusst transparent; als Dokument öffnen lässt sich eine `.mdd` nicht.

Dieselbe Begleitdatei nimmt neben der Historie auch die [Dokument-Notiz](notes.md) eines Dokuments auf, in einer eigenen Sektion. Anders als die Historie hat die Notiz aber keine Revisionen und keine Wiederherstellung.

Zwei Punkte sind gut zu wissen:

- Wird das Dokument außerhalb der App **umbenannt oder verschoben**, muss die Begleitdatei von Hand mitgenommen werden, sonst verliert die Historie den Anschluss und beginnt neu.
- In Ordnern, die mit anderen Programmen **synchronisiert, gesichert oder versioniert** werden, wandern die `.mdd`-Dateien mit. Das ist gewollt (die Historie gehört zum Dokument), sollte aber bekannt sein: Die komplette Änderungs-Historie eines Dokuments reist mit der Begleitdatei.

## Einschalten: drei Ebenen

Ab Werk ist die Historisierung **aus**. Sie wird auf drei Ebenen geschaltet; die speziellere Ebene gewinnt, nicht gesetzte Ebenen erben von der nächst-allgemeineren:

| Ebene | Ort | Wirkung |
|---|---|---|
| Dokument | YAML-Eigenschaft `history` im Frontmatter | schlägt Bereich und App |
| Bereich | Bereichsdatei `Area_Settings.mdda` im Bereichs-Wurzelordner | schlägt die App-Einstellung, gilt für alle Dokumente im Bereich |
| App | Einstellungen → Verhalten → Dokument-Historie | Grundeinstellung für alles Übrige |

Die Dokument-Ebene steht im Frontmatter:

```yaml
---
history: true
---
```

`history: false` schaltet ab, eine fehlende Eigenschaft erbt. Am einfachsten setzt das Klick-Menü des Statusbar-Symbols die Eigenschaft (aktivieren, deaktivieren, Erbwert verwenden). Der Bereichs-Default wird im Einstellungs-Eintrag „Dokument-Historie" der Navigations-Gruppe „Aktueller Bereich" gesetzt (nur bei geöffnetem Bereich sichtbar); die Bereichsdatei entsteht erst beim ersten Setzen.

**Abschalten löscht nichts.** Die Protokollierung pausiert nur; die Begleitdatei bleibt erhalten. Beim Wiedereinschalten wird die Lücke als ein zusammengefasstes Paket nachgetragen, die Historie bleibt lückenlos nachvollziehbar.

## Änderungspakete

Damit häufiges Speichern (etwa mit automatischem Speichern) die Historie nicht mit Kleinst-Schritten flutet, fasst die App aufeinanderfolgende Speicherungen zu einem **Änderungspaket** zusammen. Zwei Zeitfenster steuern das (Einstellungen → Verhalten):

- **Maximale Paket-Dauer** (Vorgabe 5 Minuten): Danach beginnt ein neues Paket, auch wenn durchgehend gearbeitet wird.
- **Inaktivitäts-Schluss** (Vorgabe 2 Minuten): Nach einer Pause ohne Änderung beginnt die nächste Speicherung ein neues Paket.

Jedes Paket trägt Zeitstempel und den erkannten Auslöser: **Bearbeitung** (in der App gespeichert) oder **Extern** (die Datei wurde von einem anderen Programm geändert; die App erkennt das beim Öffnen und vor jedem Speichern und trägt die Differenz nach, statt die Historie brechen zu lassen).

## Statusbar

Das Uhr-Symbol in der Statusbar zeigt den Zustand des aktiven Dokuments:

- **Aktiv** (ausgefüllt): Änderungen werden protokolliert.
- **Pausiert** (umrandet): Historisierung ist wirksam aus, eine Begleitdatei existiert.
- **Inaktiv**: Historisierung ist aus, keine Begleitdatei vorhanden.

Der Tooltip nennt zusätzlich, welche Ebene die Einstellung bestimmt (Datei, Bereich oder App). Ein Klick öffnet das Menü mit der Historien-Ansicht und den Schaltern für die Dokument-Ebene.

## Historien-Ansicht

„Ansicht → Dokument-Historie" (oder das Statusbar-Menü) öffnet die Revisionsliste des aktiven Dokuments als eigenen, schreibgeschützten Tab: neueste Revision oben, darunter alle Pakete mit Zeitpunkt, Auslöser und Änderungsumfang (+eingefügte/−entfernte Zeilen), ganz unten der Ausgangsstand. Der Tab liegt unmittelbar rechts neben dem Tab des Dokuments. Pro Fenster gibt es genau eine Historien-Ansicht; wird sie für ein anderes Dokument geöffnet, wandert derselbe Tab neben dessen Tab.

- **Ansehen** zeigt den vollständigen Stand einer Revision unterhalb der Liste.
- **Vergleichen** stellt zwei ausgewählte Stände (Spalten „Von" und „Bis", wahlweise auch gegen den aktuellen Stand) zeilenweise gegenüber: entfernte Zeilen rot, eingefügte grün, dazwischen Auslassungs-Marker für unveränderte Passagen.
- **Wiederherstellen** lädt den gewählten Stand in den Editor-Tab des Dokuments. Das Dokument gilt dann als geändert; erst das Speichern macht die Wiederherstellung wirksam und erzeugt dabei eine **neue** Revision. Frühere Revisionen werden nie gelöscht oder überschrieben.
