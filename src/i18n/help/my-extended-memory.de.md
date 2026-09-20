# My Extended Memory

Wer länger mit dieser Anwendung arbeitet, sammelt Gefäße an: [Bereiche](apps-windows.md) für Projekte, [Bücher](books.md) für längere Texte, Bücherregale für ganze Sammlungen, dazu die eingerichteten [Arbeitsbereiche](apps-windows.md). Sie liegen verstreut auf der Platte, auf Sticks und auf Netzlaufwerken, und keine Ansicht der Anwendung zeigt sie gemeinsam — jede Ansicht gilt dem, was gerade geöffnet ist.

**My Extended Memory ist diese gemeinsame Sicht.** Die Seite öffnet sich über „Ansicht → My Extended Memory" oder über die Kommando-Palette als eigener Reiter; sie ist nicht änderbar. In vier Abschnitten — Arbeitsbereiche, Bereiche, Bücher, Bücherregale — steht je Gefäß eine Zeile mit seinem Namen, seinem Ort und ein paar Kennzahlen.

## Was die Seite zeigt — und was sie nicht tut

**Die Seite zeigt, was Sie selbst eingetragen haben.** Sie durchsucht keine Laufwerke, sie findet nichts von allein, und sie erhebt keinen Anspruch auf Vollständigkeit. Ein Bereich, den Sie nie eingetragen haben, fehlt hier, auch wenn Sie gestern darin gearbeitet haben.

Das ist Absicht und keine Lücke. Eine Suche über alle angeschlossenen Laufwerke dauerte lange, fände nebenbei Ordner, die niemanden etwas angehen, und hinge an der Frage, welche Laufwerke gerade angeschlossen sind. Die Liste, die Sie selbst führen, ist dagegen kurz, verlässlich und Ihre eigene Ordnung. Der Hinweis oben auf der Seite sagt das dauerhaft, auch wenn die Liste längst gefüllt ist.

## Ein Gefäß eintragen

„Gefäß eintragen…" klappt einen Block mit Vorschlägen auf.

**Vorgeschlagen werden die zuletzt geöffneten Gefäße** — Bereiche, Bücher und Bücherregale aus den Zuletzt-Listen — **und die eingerichteten Arbeitsbereiche**, gruppiert nach Art. Was bereits in der Liste steht, erscheint nicht mehr im Vorschlag. „Eintragen" neben einem Vorschlag nimmt ihn auf.

**„Ordner wählen…" ist der vollständige Weg** und steht immer da, auch wenn es gerade nichts vorzuschlagen gibt. Der gewohnte Ordner-Dialog fragt nach dem Ordner des Gefäßes; die Art bestimmt die Anwendung selbst, in der Reihenfolge **Bücherregal, Buch, Bereich**: Trägt der Ordner die Begleitdatei eines Bücherregals, ist es ein Bücherregal; trägt er die eines Buches, ist es ein Buch; sonst ist es ein Bereich.

Drei Fälle führen zu einer Meldung statt zu einem Eintrag:

- Der Ordner ist **gerade nicht erreichbar** — ein abgezogener Stick, ein nicht verbundenes Netzlaufwerk. Eingetragen wird nur, was beim Eintragen lesbar ist; die Art lässt sich sonst nicht bestimmen.
- Der gewählte Pfad zeigt auf eine **Datei** statt auf einen Ordner.
- Das Gefäß **steht bereits** in der Liste. Ein zweiter Eintrag desselben Ordners entsteht nicht.

## Einen Eintrag entfernen

„Entfernen" nimmt die Zeile aus der Liste — **und sonst nichts**. Der Ordner, seine Dateien und seine Begleitdateien bleiben unangetastet; auch der Arbeitsbereich bleibt eingerichtet. Entfernt wird der Eintrag, nicht das Gefäß. Eintragen lässt es sich jederzeit wieder.

## Die Kennzahlen

Je Zeile stehen ein Stand-Zeitstempel und eine kurze Auswahl: beim Bereich die Zahl der Markdown-Dateien, beim Buch die Zahl der Kapitel, beim Bücherregal die Zahl der Bücher, dazu jeweils der belegte Speicher.

**Die Zahlen werden nicht laufend nachgeführt.** Erhoben werden sie beim Eintragen des Gefäßes und danach nur, wenn Sie es verlangen: „Neu erheben" liest das Gefäß erneut und setzt den Stand neu. Deshalb steht der Stand an jeder Zeile — er sagt, auf welchen Zeitpunkt sich die Zahlen beziehen. Wer eine Woche in einem Bereich gearbeitet hat, sieht hier zunächst die Zahlen von vorletzter Woche; ein Klick bringt sie auf den heutigen Stand.

Der **Arbeitsbereich** hat keine Kennzahlen und keinen Erhebungs-Knopf: Er ist kein Ordner, sondern eine Zusammenstellung. Was er zusammenstellt, steht in seiner Zeile und in der Detail-Sicht: die Gefäße, an die er gebunden ist, die Zahl seiner Fenster und die Zahl der darin **geöffneten Dokumente**.

**Gezählt werden geöffnete Dokumente, nicht Dateien in einem Ordner.** Die Zahl sagt, wie viele Markdown-Dokumente der Arbeitsbereich in seinen Fenstern aufgeschlagen hat; gezählt wird je Fenster. Unbenannte Reiter, Handbuch- und System-Seiten und andere Dateiarten zählen nicht mit. Beide Zahlen stammen aus der Ablage des Arbeitsbereichs und stehen deshalb für einen geschlossenen genauso da wie für einen geöffneten; eine Null ist dabei eine gezählte Null wie jede andere.

### Ein Gefäß, das gerade nicht erreichbar ist

Es **bleibt in der Liste**, mit dem Kennzeichen „nicht erreichbar" und mit den zuletzt bekannten Zahlen samt ihrem alten Stand. Ein Stick, der im Schreibtisch liegt, ist kein Grund, den Eintrag zu verlieren — die Zahlen von damals sind immer noch die Auskunft, die Sie haben. „Öffnen" und „Neu erheben" sind in dieser Zeile ohne Wirkung und deshalb ausgegraut; „Details" und „Entfernen" gehen weiter.

### Ein Bereich, der nicht geöffnet ist

Bei ihm bleiben drei Kennzahlen leer: **Tags, Aufgaben und die Dateien ohne eingehenden Verweis**. Sie kommen nicht aus dem Zählen von Dateien, sondern aus dem Verzeichnis, das die Anwendung für einen geöffneten Bereich aufbaut — und dieses Verzeichnis gibt es nur, solange der Bereich offen ist. Die Zeile sagt das mit dem Vermerk „ohne Index-Kennzahlen; Bereich öffnen und neu erheben".

Ein Verzeichnis wird für diese Seite **nicht** eigens aufgebaut. Das kostete bei jedem eingetragenen Bereich einen vollständigen Durchgang und machte aus einer Übersicht einen Rechenlauf. Öffnen Sie den Bereich und erheben Sie danach neu, stehen alle Zahlen da.

## Die Detail-Sicht

„Details" klappt unter der Zeile eine Tabelle auf, die zeigt, was das jeweilige Gefäß hergibt:

| Art | Kennzahlen |
|---|---|
| Bereich | Markdown-Dateien, andere Dateien, Ordner, belegter Speicher, Tags, Aufgaben, Dateien ohne eingehenden Verweis |
| Buch | Kapitel, Markdown-Dateien, belegter Speicher, zugehöriges Bücherregal |
| Bücherregal | Bücher, davon nicht auffindbar, Markdown-Dateien, belegter Speicher |
| Arbeitsbereich | Bereich, Buch, Bücherregal, Fenster, geöffnete Dokumente, zuletzt genutzt |

**Zwei Arten von Leere, zwei Zeichen.** „nicht verfügbar" heißt: Diese Zahl hat niemand erhoben — etwa die Tags eines nicht geöffneten Bereichs. Der Gedankenstrich heißt: Diesen Gegenstand gibt es hier gar nicht — etwa das Buch eines Arbeitsbereichs, der keines führt. **Eine Null steht nie für beides**; sie ist immer eine gezählte Null, und ein Bereich ohne Unterordner zeigt sie zu Recht.

Beim **Buch** nennt die Zeile „Bücherregal" nur ein Regal, das selbst eingetragen ist. Liegt das Buch in einem Regal, das hier nicht steht, sagt die Tabelle, dass es keinem eingetragenen Regal zugeordnet ist — statt eine Zuordnung zu behaupten, die diese Seite nicht kennt.

### Öffnen und der Weg zur Bereichs-Statistik

**„Öffnen" an der Zeile** öffnet das Gefäß auf dem gewohnten Weg: Bereich, Buch und Bücherregal nach den üblichen Regeln, der Arbeitsbereich als Wechsel in ihn. Einen zweiten Öffnen-Knopf hat die Detail-Sicht nicht; der Knopf steht unmittelbar darüber.

**Beim Bereich kommt „Bereichs-Statistik öffnen" hinzu.** Die ausführliche [Bereichs-Statistik](apps-windows.md) gilt immer dem Bereich **dieses** Fensters — deshalb muss der Bereich zuerst der geöffnete sein. Ist er es bereits, öffnet sich die Statistik sofort. Sonst wird der Bereich geöffnet, und wo er landet, hängt davon ab, was gerade läuft: Übernimmt ihn dieses Fenster, folgt die Statistik hier. Kommt er in ein anderes Fenster — weil dort bereits eine Bereichs-Applikation läuft oder weil ein neues Fenster entsteht —, sagt ein Hinweis genau das: Die Bereichs-Statistik steht dort im Ansichtsmenü. Ein Sprung hier zeigte sonst die Zahlen eines fremden Bereichs.

## Die eigene Einrichtung ausgeben und einlesen

Oben auf der Seite stehen „Einrichtung ausgeben…" und „Einrichtung einlesen…". Sie führen auf denselben Weg wie „Datei → Einstellungen → Exportieren…" und „Importieren…"; alles Weitere — Auswahl der Datenarten, Vorschau, Bericht — steht auf der Seite [Einstellungen exportieren und importieren](setup-exchange.md).

Der Zugang steht hier, weil beide dieselbe Frage bedienen: Was habe ich mir eingerichtet, und wie nehme ich es mit? Ist die Erweiterung „Export und Import der eigenen Einstellungen" ausgeschaltet, entfällt der Block.

**Die eingetragene Gefäß-Liste selbst geht dabei nie mit.** Sie besteht aus absoluten Pfaden dieses Rechners, die auf einem anderen ins Leere zeigen — wie die eingerichteten Arbeitsbereiche und die Zuletzt-Listen gehört sie zu dem, was an die Maschine gebunden bleibt.

## Abschalten

Die Funktion ist als [Erweiterung](extensions.md) „My Extended Memory" abschaltbar. Im Aus-Zustand entfallen der Menü-Eintrag und das Kommando in der Palette; ein bereits geöffneter Reiter bleibt stehen, bis Sie ihn schließen.

**Die eingetragene Liste bleibt erhalten.** Das Abschalten nimmt den Zugang, nicht die Daten: Nach dem Einschalten steht die Liste unverändert wieder da, mit allen Einträgen und ihren zuletzt erhobenen Zahlen.
