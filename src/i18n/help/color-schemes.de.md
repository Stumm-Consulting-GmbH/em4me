# Farbschemas

Ein Farbschema legt die Farben der App fest: die Oberfläche (Hintergründe, Text, Akzent, Leisten, Tabs) und den gerenderten Inhalt (Überschriften, Links, Zitate, Code, Tabellen). Die Farben laufen über eine kuratierte Liste benannter Farb-Slots, die die Theme-Farben speisen. Je Modus ist ein Schema aktiv; der Hell/Dunkel-Umschalter (Statusbar-Icon, Ansicht → Theme) wechselt zwischen dem Hell- und dem Dunkel-Schema.

## Slots und Gruppen

Ein Slot ist eine benannte Farbe, kein direkter Zugriff auf interne Details. Die Slots sind in fünf Gruppen geordnet: Flächen (Hintergrund, Fläche, gedämpfte Fläche, Werkzeugleiste), Text (Haupttext, gedämpfter Text), Akzent und Rahmen (Akzent, Akzent-Text, Rahmen, kräftiger Rahmen), Tabs (Tab-Leiste, aktiver Tab) und Inhalt (Code-Hintergrund, Warnfarbe). Der gerenderte Inhalt folgt den Oberflächen-Slots mit: Links tragen den Akzent, Überschriften den Haupttext, die Überschriften-Linie und die Tabellen-Rahmen den Rahmen, der Zitat-Balken den kräftigen Rahmen.

## Schemas pflegen

Die Schema-Verwaltung öffnet unter Einstellungen → Farbschemas.

- **Modus-Zuordnung:** Oben wird je Modus ein aktives Schema gewählt (Schema für Hell, Schema für Dunkel).
- **Mitgelieferte Schemas** sind unveränderlich und dienen als Vorlage: Standard Hell und Dunkel, Kontrastreich Hell und Dunkel, Sepia sowie vier weitere Paare mit je einer hellen und einer dunklen Fassung — Stahlblau (kühl), Waldgrün (gedämpftes Grün), Bernstein (warm) und Graphit (neutral-grau).
- **Eigenes Schema:** „Neu aus Vorlage" oder „Duplizieren" legt eine bearbeitbare Kopie an. Ein eigenes Schema lässt sich umbenennen und löschen; beim Löschen des aktiven Schemas fällt der Modus auf das voreingestellte Schema zurück.
- **Slot-Editor:** Je Slot ein Farbwähler; „Zurücksetzen" stellt den Vorlage-Wert wieder her. Änderungen wirken sofort in der ganzen App (Live-Vorschau), nach dem Anwenden auch in weiteren Fenstern.

Der Editor bearbeitet immer das aktive Schema des Modus, in dem die App gerade läuft: im hellen Modus das Hell-Schema, im dunklen Modus das Dunkel-Schema. Um das Schema des jeweils anderen Modus anzupassen, schaltet man die App zuerst über das Theme-Icon in der Statusbar (oder Ansicht → Theme) auf diesen Modus um. So wirkt jede Farbänderung sofort in genau dem Modus, für den sie gilt (Live-Vorschau).

## Kontrast und Grenzen

Die Lesbarkeit eigener Schemas liegt in der eigenen Hand: Eine automatische Kontrast-Prüfung gibt es nicht. Die Live-Vorschau zeigt die Wirkung sofort, und „Zurücksetzen" je Slot führt zu einem Vorlage-Wert zurück. Wenige Farben bleiben bewusst außerhalb der Slots: die Farben der Tab-Gruppen und die Syntax-Hervorhebung der Code-Blöcke folgen weiter dem Theme. Der PDF-Export bleibt hell und übernimmt die Farben des aktiven Hell-Schemas.
