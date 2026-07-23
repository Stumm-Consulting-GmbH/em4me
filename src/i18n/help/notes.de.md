# Dokument-Notizen

Zu jedem Dokument lässt sich **eine** Notiz führen, getrennt vom Dokument-Inhalt. Sie sammelt Arbeits- und Meta-Wissen zum Dokument (offene Punkte, Kontext, Erinnerungen), das nicht in den Text selbst gehört. Geschrieben wird die Notiz in einem eigenen Sidebar-Panel; gespeichert wird sie in der **Begleitdatei** des Dokuments, derselben `.mdd`-Datei neben dem Dokument, die auch die Historie trägt.

## Das Notizen-Panel

Das Panel „Notizen" wird wie jedes Sidebar-Panel geschaltet: über das Menü Ansicht → Panels → Notizen, das Notizzettel-Symbol in der Statusbar oder ein selbst vergebenes Tastenkürzel (ab Werk ist keines belegt, die Belegung erfolgt in den Einstellungen). Der Schalter wirkt auf die aktive Spalte; Seite, Reihenfolge und Reiter-Gruppen folgen den Regeln der [Sidebar](sidebar.md).

Eine Notiz gehört immer zum aktiven Dokument. Ein noch **unbenanntes** (nie gespeichertes) Dokument hat keinen Ablageort für die Begleitdatei, deshalb zeigt das Panel dann einen Hinweis statt eines Eingabefelds; nach dem ersten Speichern steht die Notiz bereit.

## Schreiben und Vorschau

Das Eingabefeld nimmt Markdown entgegen. Ein Umschalter im Panel-Kopf wechselt zwischen **Bearbeiten** und einer **gerenderten Vorschau** des Notiz-Textes. Die Vorschau ist zu Beginn aktiv; ob ein Panel bearbeitend oder in der Vorschau öffnet, legt die Einstellung „Notiz-Vorschau standardmäßig anzeigen" fest (Einstellungen → Darstellung). Der Umschalter gilt je Spalte und für die laufende Sitzung.

So kann eine Notiz aussehen:

```markdown
- [ ] Rücksprache zu Kapitel drei
- [x] Quellen geprüft

Kontext: **Entwurf**, noch nicht freigegeben.
```

- [ ] Rücksprache zu Kapitel drei
- [x] Quellen geprüft

Kontext: **Entwurf**, noch nicht freigegeben.

## Formatieren wie im Editor

Im Bearbeiten-Feld stehen dieselben Formatier-Hilfen bereit wie im Haupt-Editor: das **Rechtsklick-Kontextmenü** mit den Bereichen Format, Absatz, Einfügen und Zwischenablage sowie die zugehörigen Tastenkürzel (etwa `Strg+B` für fett, `Strg+I` für kursiv oder das Einfügen eines Zeitstempels). Das [Editor-Kontextmenü](context-menu.md) beschreibt diese Funktionen im Detail; sie wirken im Notiz-Feld genauso wie im Dokument.

## Automatisches Speichern

Die Notiz wird **automatisch** gespeichert, ohne Speichern-Schaltfläche: kurz nach dem Tippen sowie beim Verlassen des Feldes, beim Wechsel des Dokuments und beim Schließen des Fensters. Die Notiz ist kein Teil des Dokument-Inhalts, deshalb markiert sie den Dokument-Tab **nicht** als geändert, und das Speichern des Dokuments bleibt von ihr unberührt.

## Speicherort und Abgrenzung zur Historie

Die Notiz liegt in der `.mdd`-Begleitdatei, in einer eigenen Sektion neben der [Dokument-Historie](history.md). Beide reisen mit der Begleitdatei, wenn Dokument und `.mdd` zusammen kopiert oder verschoben werden; das **Umbenennen innerhalb der App** nimmt die Begleitdatei und damit die Notiz automatisch mit.

Anders als die Historie kennt die Notiz **keine Revisionen und keine Wiederherstellung**: Es zählt immer der aktuelle Stand, ein früherer Text wird nicht aufbewahrt. Ist die Begleitdatei beschädigt, wird die Notiz ausgesetzt und das Panel weist darauf hin, statt einen unklaren Stand zu überschreiben.

## Mehrere Fenster

Ist dasselbe Dokument in mehreren Fenstern offen, zieht eine anderswo gespeicherte Notiz hier nach, solange das Feld unverändert ist. Trifft eine fremde Änderung auf einen **eigenen, noch nicht gespeicherten** Stand, weist das Panel darauf hin, dass die Notiz in einem anderen Fenster geändert wurde, und der eigene Text bleibt erhalten, damit nichts unbemerkt überschrieben wird.
