# Anlagen

Eine Anlage ist eine Datei, die zu einem Dokument gehört: ein Bildschirmfoto, ein Bericht, eine Tabelle. Wer sie einfügt oder in das Dokument zieht, muss sie nicht erst von Hand speichern und verlinken. Die Datei wird abgelegt, und im Text entsteht der passende Verweis.

## Anlage einfügen

Eine Datei oder ein Bild aus der Zwischenablage wird mit `Strg+V` eingefügt. Die Datei landet am eingestellten Ort, und an der Schreibmarke entsteht der Verweis.

Ein Bild erscheint als Bild-Verweis, jede andere Datei als gewöhnlicher Link:

```markdown
![Protokoll_20260729-143022](Protokoll/Protokoll_20260729-143022.png)
[Bericht](Protokoll/Bericht.pdf)
```

`Strg+Umschalt+V` bleibt reines Einfügen und legt nichts ab.

## Anlage hineinziehen

Eine Datei lässt sich auch aus dem Dateimanager in das Dokument ziehen. Wo sie losgelassen wird, entscheidet über das Ergebnis:

| Ablegeort | Ergebnis |
|---|---|
| Editor-Fläche | Anlage, Verweis an der Zeigerposition |
| Render-Ansicht | Anlage, Verweis am Dokument-Ende |
| Reiterleiste, Seitenbereich, leeres Fenster | Die Datei wird geöffnet |

Während des Ziehens sagt die Einblendung, welches der beiden Ergebnisse eintritt. So lässt sich auch eine Markdown-Datei bewusst als Anlage anhängen, statt sie zu öffnen.

Mehrere gleichzeitig gezogene Dateien ergeben mehrere Verweise. Ein Einfügen oder Ziehen ist **ein** Schritt: `Strg+Z` nimmt den Verweis zurück. Die abgelegte Datei bleibt dabei liegen und ist bei Bedarf im Dateimanager zu entfernen.

## Wohin die Datei gelegt wird

Der Ablage-Ort steht in den Einstellungen unter „Anlagen" und lässt sich zusätzlich je Arbeitsbereich abweichend festlegen (Einstellungen → Aktueller Bereich → Anlagen).

| Ablage-Ort | Wohin die Datei kommt |
|---|---|
| Ordner mit dem Namen des Dokuments | in einen Unterordner, der wie das Dokument heißt (Voreinstellung) |
| Fester Unterordner | in einen Unterordner mit dem eingestellten Namen |
| Neben dem Dokument | in denselben Ordner wie das Dokument |
| Zentraler Ordner des Bereichs | in einen Ordner direkt in der Wurzel des Arbeitsbereichs |

Der zentrale Ordner steht nur bei geöffnetem Arbeitsbereich zur Wahl, weil er ohne ihn keinen Bezugspunkt hätte. Der Ordnername gilt für die beiden Formen, die einen brauchen; er ist ein einzelner Name ohne Pfad-Angaben.

Ein bereits vorhandener Dateiname wird nie überschrieben. Stattdessen erhält die neue Datei einen Zähler, also `Bild-2.png` neben `Bild.png`. Anlagen ohne eigenen Namen, etwa ein Bildschirmfoto aus der Zwischenablage, werden nach dem Dokument und dem Zeitpunkt benannt.

Ein Dokument, das noch nie gespeichert wurde, hat keinen Ort, an dem eine Anlage liegen könnte. In diesem Fall erscheint ein Hinweis in der Statusleiste, und es wird nichts abgelegt.

## Anlage öffnen

Ein Verweis auf eine Anlage öffnet sie im zuständigen Programm des Betriebssystems. Bei einem eingebetteten Bild hängt die Geste von der Ansicht ab:

| Ansicht | Geste |
|---|---|
| Lese- und Render-Ansicht | einfacher Klick |
| Bearbeiten- und Live-Ansicht | Doppelklick |

Im Editor bleibt der einfache Klick dem Setzen der Schreibmarke vorbehalten; wer neben einem Bild weiterschreiben will, soll dabei kein fremdes Programm starten.

Geöffnet werden nur Ziele innerhalb des Arbeitsbereichs beziehungsweise, ohne Arbeitsbereich, innerhalb des Dokument-Ordners. Bei Dateien, die beim Öffnen Programmcode ausführen können, erscheint zuerst eine Rückfrage mit Namen und vollständigem Pfad.

## Anlagen und Bereichsgrenzen

Bei geöffnetem Arbeitsbereich sind Bilder aus dem gesamten Bereich sichtbar, auch wenn sie über dem Ordner des Dokuments liegen. Genau das macht den zentralen Anlagen-Ordner nutzbar. Ohne Arbeitsbereich bleibt es beim Ordner des Dokuments samt seiner Unterordner; siehe auch die Seite [Bilder](images.md).
