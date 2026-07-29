# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung an [Semantic Versioning](https://semver.org/lang/de/). Ab Version
0.42.0 trägt die Block-Überschrift eine vierte Stelle (`X.Y.Z.N`): N ist die
Commit-Anzahl zum Release-Commit und macht den Stand eindeutig einordenbar; die
dreiteilige SemVer-Version (Git-Tag, EXE-Dateinamen, `package.json`) bleibt
maßgeblich.

## [0.100.0.1061] - 2026-07-29 — Anlagen einfügen

Epic 3E-0125: Eine Datei, die zu einem Dokument gehört, muss nicht mehr von
Hand gespeichert und verlinkt werden. Wer sie einfügt oder in das Dokument
zieht, bekommt beides in einem Schritt: Die Datei wird an einem einstellbaren
Ort abgelegt, und im Text entsteht der passende Verweis. Damit ist der
Roadmap-Eintrag „Anlagen einfügen" eingelöst, der bisher nur das Ziehen
versprochen hatte.

### Neu

- **Anlagen ablegen und verlinken** (4T-0787, 4T-0642, 4T-0789): `Strg+V` fügt
  eine Datei oder ein Bild aus der Zwischenablage ein; alternativ lässt sich
  eine Datei aus dem Dateimanager auf die Editor-Fläche oder die Render-Ansicht
  ziehen. Bilder erhalten einen Bild-Verweis, andere Dateien einen Link, jeweils
  in Standard-Markdown-Syntax und damit unabhängig von abschaltbaren
  Erweiterungen. Der Ablegeort entscheidet über das Ergebnis: Auf den beiden
  Dokument-Flächen entsteht eine Anlage, auf Reiterleiste und Seitenbereich wird
  die Datei wie bisher geöffnet. Ein Einfügen oder Ziehen ist ein einzelner
  Rückgängig-Schritt.
- **Vier Ablage-Formen, einstellbar** (4T-0791): neben dem Dokument, fester
  Unterordner, Ordner mit dem Namen des Dokuments (Voreinstellung) und, bei
  geöffnetem Arbeitsbereich, ein zentraler Ordner des Bereichs. Die Einstellung
  gibt es global und je Bereich; die Bereichs-Einstellung übersteuert die
  globale und lässt sich mit „Wie allgemein" wieder abgeben. Ein vorhandener
  Dateiname wird nie überschrieben, sondern um einen Zähler ergänzt; Anlagen
  ohne eigenen Namen werden nach Dokument und Zeitpunkt benannt.
- **Anlagen aus dem Dokument heraus öffnen** (4T-0790): Ein Klick auf den
  Verweis öffnet die Anlage im zuständigen Programm des Betriebssystems, bei
  eingebetteten Bildern in der Render-Ansicht per einfachem Klick und im Editor
  per Doppelklick, damit der einfache Klick dort weiter die Schreibmarke setzt.
  Geöffnet werden nur Ziele innerhalb des Arbeitsbereichs beziehungsweise des
  Dokument-Ordners; bei Dateien, die beim Öffnen Programmcode ausführen können,
  erscheint zuvor eine Rückfrage mit Namen und vollständigem Pfad.

### Geändert

- **Bilder eines Arbeitsbereichs sind bereichsweit sichtbar** (4T-0788): Die
  Auflösung relativer Bild-Pfade endet bei geöffnetem Bereich an dessen Wurzel
  statt am Ordner der Datei. Erst dadurch ist ein zentraler Anlagen-Ordner
  nutzbar, denn ein Dokument in einem Unterordner verweist mit `../` in ihn
  hinein. Die Prüfung bleibt in ihrer Härte unverändert, sie bekommt nur eine
  andere Wurzel, und zwar dieselbe, die die Anwendung überall sonst als
  Arbeitsraum-Grenze durchsetzt. Ohne geöffneten Bereich gilt weiterhin der
  Ordner der Datei.

### Behoben

- **Klick auf einen eingebetteten Wiki-Embed einer sonstigen Datei** (4T-0790):
  Der Klick war wirkungslos, weil der zugrunde liegende Kanal ausschließlich
  Netz-Adressen durchließ und eine lokale Datei still verwarf. Er nutzt jetzt
  denselben Weg wie die übrigen Anlagen und unterliegt denselben beiden
  Grenzen.

### Dokumentation

- **Neue Handbuch-Seite „Anlagen"** in fünf Sprachen (4T-0792), verlinkt von der
  Überblicksseite, dazu zwei neue Einträge im Funktions-Katalog (30 neue
  Übersetzungs-Schlüssel). Die Seite „Bilder" ist in allen fünf Fassungen
  berichtigt: Ihre Aussage zur Auflösungs-Grenze galt nach der Änderung oben
  nicht mehr. Die Demo-Area lädt auf ihrer Anlagen-Seite dazu ein, das Ablegen
  selbst auszuprobieren.

## [0.99.0.1041] - 2026-07-29 — Bereichs-Suche

Epic 3E-0116: Ein geöffneter Bereich wird zum Suchraum. `Strg+F` in einer
seiner Dateien durchsucht nicht mehr nur diese Datei, sondern alle
Markdown-Dateien des Bereichs; die Treffer erscheinen nach Dateien gruppiert
im vorhandenen Suchergebnis-Panel. Damit ist die zweite Hälfte des
Roadmap-Eintrags „Arbeitsbereiche durchsuchen" eingelöst, dessen erste Hälfte
die Bereichs-Statistik in 0.98.0 gebracht hat.

### Neu

- **Bereichsweite Volltext-Suche** (4T-0616): Der Suchbereich folgt weiter dem
  Reiter, in dem gesucht wird — neu kommt der Fall „Datei in einem geöffneten
  Bereich" hinzu, der den ganzen Bereich umfasst. Welcher Bereich gilt, steht
  links in der Suchleiste. Die Trefferliste ist nach Dateien gruppiert, `F3`
  läuft über die Datei-Grenze weiter, ein Klick öffnet die Zieldatei an der
  Fundstelle. Kein eigenes Panel und kein zweites Kommando: Die Funktion nutzt
  die Trefferliste, die mit 0.95.0 für Handbuch und Einstellungen entstanden
  ist, als dritten Lieferanten.
- **Die offene Datei führt die Liste an, mit ihrem ungespeicherten Stand**
  (4T-0616): Was gerade im Editor steht, wird gefunden, auch vor dem Speichern;
  für die übrigen Dateien gilt der Stand auf der Festplatte. Die Datei, in der
  die Suche geöffnet wurde, bleibt für die Dauer der Such-Sitzung an erster
  Stelle, damit die Liste über Sprünge hinweg stehen bleibt und der Zähler über
  alle Treffer des Bereichs läuft.
- **Suchraum im Hauptprozess** (4T-0615): neues Modul `area-search.js` mit
  Verzeichnis-Scan nach den Regeln des Bereichs-Index, Speicher-Vorrat für die
  Dauer der geöffneten Suchleiste und einem Cache je Bereich im
  Nutzerdaten-Verzeichnis. Der Cache liegt bewusst nicht im Bereich des
  Anwenders: Er verdoppelte dort den Text-Bestand und liefe durch jede
  Ordner-Synchronisierung mit. Ein Byte-Deckel schaltet sehr große Bereiche auf
  gedrosseltes Direkt-Lesen um, was die Statuszeile ausweist.

### Geändert

- **Die Markierung im Dokument bleibt** (4T-0616): Der Bereichs-Raum ersetzt
  die gewohnten Marken im Text nicht, er ergänzt sie um die Liste. Im
  Bearbeiten-Modus setzt der Decorations-Weg die Treffer, in der Lese-Ansicht
  der bekannte Marken-Weg.
- **Ersetzen bleibt an das Dokument gebunden** (4T-0616): `Strg+H` schaltet den
  Suchbereich auf die aktive Datei zurück. Ohne das wäre Suchen und Ersetzen
  gesperrt, solange ein Bereich offen ist.

### i18n

- Vier neue Schlüssel je Sprache für Suchbereichs-Anzeige, Datei-Zähler und den
  Hinweis bei sehr großen Bereichen, dazu der Funktions-Katalog-Eintrag zur
  Bereichs-Suche (drei Schlüssel je Sprache). Berichtigt wurden die vier
  Bestands-Schlüssel, die die Suchräume abschließend aufzählten und durch den
  neuen Fall unvollständig geworden wären. Alles in fünf Sprachen.

### Dokumentation

- **Handbuch-Seite Werkzeuge** (4T-0617): Der Abschnitt „Suche in Handbuch und
  Einstellungen" ist zu „Wo gesucht wird" umgebaut, mit einer vierzeiligen
  Tabelle der Suchräume und zwei Unterabschnitten zum Bereich und zu Handbuch
  und Einstellungen. Neu ist die Abgrenzung gegenüber der Perspective-Abfrage:
  Sie filtert Eigenschaften, die Suche findet Text. Fünf Sprachfassungen.
- **Demo-Area** (4T-0617): Die Willkommensseite weist auf die Bereichs-Suche
  hin, mit zwei Suchbegriffen, die in der Demo-Area mehrfach vorkommen.

## [0.98.0.1032] - 2026-07-28 — Bereichs-Statistik

Epic 3E-0117: Für den geöffneten Bereich lässt sich eine Kennzahlen-Seite als
eigener, nicht änderbarer Reiter öffnen. Sie beantwortet Fragen, die bisher nur
über den Datei-Explorer und Handarbeit zu beantworten waren: Wie viel liegt in
diesem Bereich, wie oft sind Eigenschaften und Tags in Gebrauch, wie viele
Aufgaben stehen offen, und welche Dateien fallen aus dem Rahmen.

### Neu

- **Bereichs-Statistik als eigener Reiter** (4T-0620): Zugang über Ansicht →
  Bereichs-Statistik, das Kontextmenü des Bereichs-Panels und das Kommando
  `stats.openArea` (ohne Standard-Kürzel, über die Einstellungen belegbar).
  Sechs Abschnitte: Dateien und Speicher, Eigenschaften, Tags, Begleitdateien,
  Inhalte und Auffälligkeiten. Die Häufigkeits-Tabellen sind nach Name oder
  Anzahl sortierbar und zeigen zunächst 25 Zeilen; die Dateinamen der drei
  Top-Listen öffnen die Datei per Klick. Eine Instanz pro Fenster, erneutes
  Öffnen aktiviert den bestehenden Reiter und erhebt neu.
- **Kennzahlen-Erhebung im Hauptprozess** (4T-0619): `statsFor` im Bereichs-
  Index liefert alles, was der Index ohnehin führt (Markdown-Zahlen, Tags,
  Eigenschaften, Aufgaben nach Zustand, Verweise, Aliase, Datei-Zeiten); das
  neue Modul `src/main/area-stats.js` ergänzt per Ordner-Scan, was der Index
  nicht kennt (Ordner-Anzahl, Nicht-Markdown-Dateien nach Bildern, PDF und
  Sonstigem, `.mdd`- und `.mdda`-Begleitdateien) und führt beides zusammen.
  Der Scan läuft asynchron in Häppchen und nur auf Anforderung; die Zahlen
  tragen einen Stand-Zeitstempel.
- **Erweiterung „Bereichs-Statistik"** (4T-0620): abschaltbar in den
  Einstellungen unter „Werkzeuge"; im Aus-Zustand entfallen Kommando,
  Menü-Eintrag und Kontextmenü-Eintrag.

### Geändert

- **Kontextmenü des Bereichs-Panels trägt zwei unabhängige Einträge**
  (4T-0620): Bereichs-Graph und Bereichs-Statistik erscheinen je nach Zustand
  ihrer eigenen Erweiterung; bisher hing das Menü an genau einer.

### Dokumentation

- **Hilfe-Inhalte erweitert** (4T-0620, 4T-0621): 54 neue Übersetzungs-Schlüssel
  in je fünf Sprachen (50 für die Seite selbst, dazu Menü-Eintrag,
  Kommando-Beschreibung, Katalog-Name und Zugang), ein neuer Eintrag im
  Funktions-Katalog in der Navigations-Gruppe und der neue Abschnitt
  „Bereichs-Statistik" auf der Handbuch-Seite „Applikationen, Fenster und
  Bereiche" in fünf Fassungen.

### Tests

- Neun Unit-Fälle für die Erhebung gegen ein nachgerechnetes Fixture-Verzeichnis
  und drei für die Erweiterungs-Registrierung, sechs neue E2E-Fälle (BS-01 bis
  BS-06), dazu zwei Einträge in der Abdeckungs-Matrix (S-118, F-245).

## [0.97.0.1021] - 2026-07-28 — Unterseiten umbenennen und lösen

Epic 3E-0128: Beim Umbenennen einer Unterseite ist nur noch ihr eigener
Namensteil im Zugriff, und eine Unterseite lässt sich als benannte Handlung von
ihrer übergeordneten Seite lösen. Beides schließt die Fuge zwischen den Epics
3E-0061 (Unterseiten samt Umbenennungs-Kaskade) und 3E-0108 (Titelzeile).

### Neu

- **Unterseite von der übergeordneten Seite lösen** (4T-0774): Neues Kommando
  `file.detachSubpage` im Datei-Menü, in der Kommando-Palette und im
  Tab-Kontextmenü einer Unterseite. Ein Dialog nennt vorab das Ziel und die
  Anzahl der eigenen Unterseiten, die mitwandern; der Ziel-Name ist änderbar,
  falls auf der Zielebene bereits eine Datei so heißt. Verweise werden über den
  bestehenden Weg des Umbenennens nachgeführt, samt Vorschau und Bericht. Das
  Kommando hat kein Standard-Kürzel und ist über die Einstellungen belegbar.
- **Schalter „Vollständigen Namen ändern"** im Umbenennen-Dialog (4T-0646): Er
  erscheint nur bei einer Unterseite, ist standardmäßig aus und gibt die
  übergeordneten Namensteile frei. Im eingeschalteten Zustand zeigt und
  akzeptiert das Feld die logische Schrägstrich-Schreibweise.

### Geändert

- **Titelzeile beschränkt sich bei Unterseiten auf das eigene Segment**
  (4T-0646): Der übergeordnete Anteil steht gedämpft und unveränderlich vor dem
  editierbaren Segment; ein Schrägstrich wird dort abgelehnt. Bisher war der
  ganze Name editierbar, und eine Änderung am Eltern-Anteil ließ die Unterseite
  samt eigenen Nachfahren still ihren Ast verlassen. An einer Seite ohne
  übergeordnete Seite macht ein Schrägstrich sie unverändert zur Unterseite.
- **Namens-Zerlegung an einer Stelle** (4T-0646): `splitDisplayTitle` in
  `src/shared/subpages.js` trennt Eltern-Anteil und eigenes Segment; Titelzeile
  und Umbenennen-Dialog ziehen ihre Grenze aus derselben Funktion. Der
  Namens-Eingabe-Dialog kennt dafür zwei neue, generische Möglichkeiten: einen
  Umschalt-Haken je Kontrollkästchen und die Checkbox-Werte in der Prüfung.

### Dokumentation

- **Hilfe-Inhalte erweitert** (4T-0775): Vier neue Übersetzungs-Schlüssel für
  den Funktions-Katalog und die Kommando-Beschreibung in je fünf Sprachen, zwei
  überarbeitete Katalog-Einträge (Titelzeile, Datei umbenennen), das neue
  Handbuch-Kapitel „Lösen" auf der Seite „Unterseiten" und ein nachgezogener
  Titelzeilen-Abschnitt auf der Seite „Werkzeuge", jeweils in fünf Fassungen.
  Die Demo-Area nennt im Kapitel „Subpages" beide Änderungen.

### Tests

- Sechs Unit-Fälle für die Namens-Zerlegung, drei neue E2E-Fälle zur Titelzeile
  (TZ-09, TZ-10), zwei zum Vollname-Schalter (US-07) und drei zum Lösen (US-08),
  dazu zwei Einträge in der Abdeckungs-Matrix.

## [0.96.0.1011] - 2026-07-28 — Reiter-Gruppen erweitern

Epic 3E-0158: Reiter lassen sich in Mengen bewegen statt nur einzeln, und eine
zugeklappte Gruppe bleibt bedienbar, auch wenn der aktive Reiter in ihr liegt.
Beides sind Reibungspunkte im täglichen Gebrauch der vorhandenen Gruppen-
Funktion, keine neuen Bausteine.

### Neu

- **Mehrfach-Auswahl in der Reiterleiste** (4T-0765): Strg und Klick nimmt
  einzelne Reiter auf und wieder heraus, Umschalt und Klick wählt die Spanne ab
  dem aktiven Reiter. Ausgewählte Reiter sind farbig hinterlegt, sobald die
  Auswahl mindestens zwei Mitglieder hat. Das Modell liegt als reines Modul in
  `src/renderer/modules/tab-selection.js`; die Auswahl gehört zur einzelnen
  Leiste und wird nicht persistiert.
- **Mengen-Operationen auf Gruppen** (4T-0766): Die Auswahl tritt in einem
  Schritt einer Gruppe bei, wechselt die Gruppe oder verlässt sie, über das
  Kontextmenü und über das Ziehen auf den Gruppen-Kopf. Sie hängt sich in
  Streifen-Reihenfolge ans Ende des Gruppen-Blocks; beim Austritt steht sie
  unmittelbar dahinter. Drei neue Mengen-Helfer im Gruppen-Modell halten dabei
  die Zusammenhangs-Invariante.
- **Aufklapp-Menü beim Überfahren einer zugeklappten Gruppe** (4T-0768): Zeigen
  auf den Kopf listet nach kurzer Verzögerung die Reiter der Gruppe, ein Klick
  wechselt zur Datei, ohne aufzuklappen. Der aktive Reiter ist markiert,
  ungespeicherte Dateien tragen ihren Änderungs-Punkt.

### Geändert

- **Zuklappen mit aktivem Reiter darin** (4T-0767): Die Sichtbarkeits-Garantie
  des aktiven Reiters aus 0.58.0 ist entfallen. Eine zugeklappte Gruppe darf den
  aktiven Reiter enthalten; er bleibt aktiv, sein Inhalt bleibt im Fenster, und
  der Gruppen-Kopf trägt die Aktiv-Kennzeichnung. Eine Aktivierung von außen
  (Wiki-Link, Kommando-Palette, Reiter-Wechsel per Tastatur) klappt die Gruppe
  nicht mehr auf; der Zustand der Leiste ändert sich damit nie von selbst. Die
  drei Helfer der alten Regel sind entfernt statt stillgelegt.
- **Kontextmenü des Reiters** (4T-0766): Die drei Gruppen-Einträge tragen bei
  einer Mehrfach-Auswahl die Mehrzahl-Beschriftung und wirken auf die Menge.
  Einträge, die genau eine Datei meinen (Umbenennen, Lesezeichen, Fenster-
  Transfer), und der Mittelklick zum Schließen bleiben beim angeklickten Reiter.

### Dokumentation

- **Hilfe und Handbuch** (4T-0769): drei neue Funktions-Katalog-Schlüssel für
  die Mehrfach-Auswahl in fünf Sprachen, überarbeiteter Katalog-Eintrag zu den
  Tab-Gruppen und die Handbuch-Seite „Applikationen, Fenster, Reiter" in allen
  fünf Fassungen (neuer Abschnitt zur Mehrfach-Auswahl, umgeschriebener
  Klapp-Absatz, Absatz zum Aufklapp-Menü).

### Tests

- Sieben neue E2E-Fälle TG-16 bis TG-22 in `test/e2e/funktionen/tab-gruppen.spec.js`,
  ein neues Unit-Modul `test/unit/renderer/tab-selection.test.js` mit 14 Fällen
  und acht neue Fälle zu den Mengen-Operationen im Gruppen-Modell. TG-03 und die
  Modell-Tests der alten Klapp-Regel sind auf das neue Verhalten umgeschrieben.

## [0.95.0.998] - 2026-07-27 — Suche in Handbuch und Einstellungen

Epic 3E-0142: Die Suche greift jetzt auch dort, wo nachgeschlagen wird. Der
Suchbereich folgt dem aktiven Reiter und schließt die drei Bereiche gegeneinander
aus: im Dokument wie bisher, in einer Handbuch-Seite über alle Handbuch-Seiten,
in den Einstellungen über alle Bereiche.

### Neu

- **Suchraum-Kern** (`src/shared/such-raum.js`, 4T-0758): prozess-neutrale
  Trefferstruktur mit Gruppe, Sprung-Angabe, Kontext-Ausschnitt und den Offsets
  des Fundes innerhalb dieses Ausschnitts, dazu zwei Obergrenzen (gesamt und je
  Gruppe) mit Meldung, wenn eine davon greift.
- **Handbuch als Such-Quelle** (4T-0758): neuer Sammel-IPC
  `help:getAllManualPages` liefert alle gebündelten Seiten einer Sprache in einem
  Zug; die beiden generierten Seiten entstehen bei jedem Lauf frisch und brauchen
  deshalb keine Invalidierung.
- **Sidebar-Panel «Suchergebnisse»** (4T-0759): gruppierte Trefferliste mit
  Trefferzahl je Gruppe, Auswahl per Maus und Pfeiltasten, vollständige
  Paritäts-Zugänge (Statusbar-Schalter, Ansichtsmenü, Toggle-Kommando).
- **Suchraum nach Reiter-Typ samt Sprung und Grenz-Durchlauf** (4T-0760):
  Zähler über den ganzen Raum, eigenes Scope-Label, Sprung öffnet die Zielseite
  ohne Duplikat, F3 läuft über Seiten- und Bereichsgrenzen.
- **Einstellungen als zweite Such-Quelle** (4T-0761): die durchsuchbaren Texte
  entstehen, indem jeder Bereich einmal in einen abgekoppelten Container
  gerendert wird — dieselbe Funktion wie die Anzeige, deshalb ohne Möglichkeit
  zu divergieren. Der Sprung aktiviert den Bereich und hebt die Zeile hervor,
  ein laufender Entwurf bleibt unberührt.

### Geändert

- Die Dokument-Suche bleibt im Verhalten unverändert; ein Handbuch-Reiter in der
  Quelltext-Ansicht durchsucht weiterhin genau diese eine Seite.
- Ersetzen bleibt in beiden neuen Räumen abgeschaltet (Handbuch und
  Einstellungen sind schreibgeschützt); der vorhandene Weg trug das ohne
  Erweiterung.
- Der Entwurfs-Aufbau der Einstellungs-Seite ist als eigene Funktion aus
  `resetPageState` herausgelöst (verhaltensneutral), damit die Such-Ernte einen
  Wegwerf-Entwurf bauen kann, ohne einen offenen Entwurf anzutasten.

### Dokumentation

- Funktions-Katalog um `help.feature.searchScopes` samt Kurzname und Zugang
  erweitert (drei Schlüssel in fünf Sprachen), Handbuch-Seite «Werkzeuge» um den
  Abschnitt «Suche in Handbuch und Einstellungen» in fünf Sprachfassungen,
  einschließlich der Abgrenzung zur Kommando-Palette (4T-0762).
- i18n: zwölf neue Schlüssel in fünf Sprachen (Panel-Titel, Schalter, Trefferzahl
  mit Platzhaltern, drei Leerzustände, Kürzungs-Hinweis, Menü-Label,
  Kommando-Beschreibung, zwei Scope-Label).

### Tests

- Neue Unit-Suiten zum Suchraum-Kern (zwölf Fälle) und zum Handbuch-Lieferanten
  (sieben Fälle mit gestelltem IPC).
- Neue E2E-Specs: SH-01 bis SH-05 (Handbuch-Suche), SE-01 bis SE-03
  (Einstellungs-Suche), SP-01 und SP-02 (Panel), dazu HB-12 für den Sammel-IPC.
- Bestands-Wächter nachgezogen: Paritäts-Wächter (15 Panels), SL-01, ES-10 und
  der Default-Layout-Unit-Test.

## [0.94.0.987] - 2026-07-27 — Gantt-Ansicht für Ereignisse

Epic 3E-0150 (Ereignisse als Gantt-Diagramm): Der Ereignis-Block bekommt als sechste Ansicht ein Gantt-Diagramm. Ereignisse mit Ende erscheinen als Balken auf einer gemeinsamen Zeitachse, Ereignisse ohne Ende als Raute, und die Vorgänger-/Nachfolger-Verknüpfungen werden als Linien sichtbar. Das Datenmodell bleibt unverändert: Die Ansicht zeigt, was das interne Ereignis-Profil ohnehin trägt.

### Neu

- **Gantt als sechste Ansicht des Ereignis-Blocks** (4T-0722): Der Ansichts-Umschalter und die gespeicherte `view:`-Direktive kennen den Wert `gantt`. Je Ereignis entsteht eine Zeile aus Label-Spalte und Zeit-Fläche, sortiert nach Zeitpunkt; ein Eintrag mit gültigem Ende wird zum Balken über seine Dauer, jeder andere zur Raute an seinem Zeitpunkt, beide in der Farbe ihrer Kategorie. Eine senkrechte Linie markiert den heutigen Tag, gestrichelte Linien verbinden Vorgänger und Nachfolger vom Balken-Ende zum nächsten Balken-Anfang. Die Gliederung der Achse ergibt sich aus der Spanne der angezeigten Ereignisse: bis 62 Tage in Tagen, bis 730 Tage in Wochen, darüber in Monaten, mit Grenzen auf Wochen- beziehungsweise Monats-Raster. Wiederkehrende Ereignisse stehen an ihrem nächsten Vorkommen und tragen das Zeichen ↻, damit ein Geburtstag aus den Sechzigern die Achse nicht über Jahrzehnte aufzieht; ein vorhandenes Ende wandert um dieselbe Jahres-Zahl mit, sodass die Dauer erhalten bleibt. Neben dem Namen zeigen ★ einen erreichten Zeit-Meilenstein und ⛓ die Zahl der Verknüpfungen. Gespeicherte Filter wirken wie in den übrigen Ansichten, und ein Klick auf Balken oder Raute springt zur Tabellen-Zeile mit ihren Bearbeiten-Aktionen. Balken lassen sich bewusst nicht ziehen; Zeitpunkte ändert weiterhin die Tabelle.

### Dokumentation

- **Handbuch, Funktions-Katalog und Demo-Umgebung** (4T-0723): Die Handbuch-Seite „Ereignisse" hat in allen fünf Sprachen einen Abschnitt „Gantt" mit selbst-demonstrierendem Block; die Ansichts-Aufzählung und die Einleitung derselben Seite sind mitgezogen. Der Funktions-Katalog nennt das Gantt-Diagramm in der bestehenden Ereignis-Beschreibung statt in einem zweiten Eintrag, weil er die Ansichten dort bündelt. Die Demo-Umgebung zeigt die Ansicht in „Events and Journals" mit zwei verketteten Balken und einer Raute. Zwei neue i18n-Schlüssel je Sprache aus diesem Epic.

## [0.93.0.978] - 2026-07-27 — Auslieferungs-Voreinstellungen und Monatskalender

Epic 3E-0146 (Voreinstellungs- und Uhr-Bündel): Die Anwendung startet im Auslieferungszustand englisch und in Bernstein, und die Uhr kann zusätzlich als Monatskalender dienen. Beide Voreinstellungen treffen ausschließlich frisch eingerichtete Installationen; ein bestehender Stand behält Sprache und Farbschema.

### Neu

- **Monatskalender in der Uhr** (4T-0752): Das Uhr-Panel hat einen fünften Modus. Er zeigt einen Monat als Gitter mit Wochentags-Kopf, hervorgehobenem heutigem Tag und abschaltbarer Kalenderwochen-Spalte (Einstellungen → Uhr → Kalender). Einfache Pfeile blättern einen Monat, doppelte ein Jahr, „Heute" kehrt zum laufenden Monat zurück, und ein Klick auf die Monats-Bezeichnung öffnet die Jahres-Eingabe als vier Ziffern-Stellen mit Pfeiltasten, Stellen-Wechsel und Direkteingabe; ein ungültiges Jahr ist dabei nicht eingebbar. Die Untergrenze liegt bei Jahr 100, weil zweistellige Jahre in der Datums-Rechnung auf 1900 + Jahr abgebildet würden. Die Tage sind reine Anzeige: Der Kalender dient dem Nachschlagen und führt nicht in Journale oder Termine. Der angezeigte Monat gilt je Sidebar-Spalte; der Modus taktet minütlich mit und zeichnet allein beim Tages-Wechsel neu, damit ein über Mitternacht offenes Panel nicht den falschen Tag als heute zeigt.

### Geändert

- **Englisch als Auslieferungs-Sprache** (4T-0751): Eine frisch eingerichtete Installation startet mit englischer Oberfläche, statt die Sprache aus dem Betriebssystem abzuleiten. Ein bestehender Stand behält seine bisherige Ableitung, weil sein gespeicherter Wert den neuen Vorgabewert überstimmt.
- **Bernstein als Auslieferungs-Farbschema** (4T-0751): Voreingestellt sind Bernstein Hell und Bernstein Dunkel; derselbe Wert dient als Rückfall, wenn ein gespeicherter Schema-Verweis unbekannt ist oder nicht zur Hell-Dunkel-Lage passt. Damit eine bestehende Installation nicht mitwandert, schreibt die Anwendung beim ersten Start ohne gespeicherten Schema-Stand die bisherigen Standard-Schemas fest, sobald sie Spuren früherer Nutzung findet; geschrieben wird in jedem Fall, sodass der Schritt genau einmal läuft und eine frische Installation beim zweiten Start nicht nachträglich als Bestand gilt.
- **Ein Monatsgitter für drei Stellen** (4T-0752): Kalender-Panel der Journale, Datums-Eingabe und der neue Uhr-Kalender bauen ihr Gitter über ein gemeinsames Modul statt über drei eigene Schleifen. Die Darstellung der beiden bestehenden Stellen bleibt unverändert.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0753): ein neuer Katalog-Eintrag „Monatskalender" mit Beschreibung, Kurzname und Zugang sowie ein neuer Abschnitt auf der Handbuch-Seite „Werkzeuge", beides in allen fünf Sprachen; insgesamt 14 neue i18n-Schlüssel je Sprache aus diesem Epic. Berichtigt ist außerdem die Handbuch-Aussage zum Rückfall beim Löschen eines eigenen Farbschemas: Er zeigt auf das voreingestellte Schema. Die Demo-Umgebung bleibt unverändert, weil sie Dokument-Inhalte zeigt und kein Sidebar-Panel ohne Dokument-Bezug.

## [0.92.0.969] - 2026-07-26 — Zeitrechnungen mit eigenem Nullpunkt

Epic 3E-0138 (Zeitrechnung mit Bezugs-Kalender und Zeitspannen): Eine Zeitrechnung kann sich jetzt auf eine bestehende stützen und nur noch ihren eigenen Nullpunkt angeben. Ihre Werte erscheinen als gestaffelte Zeitspanne ab diesem Punkt, in beide Richtungen und in wählbarer Tiefe. Als Bezug dient ein Kalender desselben Blocks oder die eingebaute Standard-Zeitrechnung, sodass ein Countdown auf einen Termin ohne eigenen Kalender auskommt.

### Neu

- **Abgeleitete Zeitrechnungen im Kern** (4T-0746): Eine Ableitung speichert Bezug, Nullpunkt und Gliederungs-Tiefe statt einer Abschrift und wird beim Laden aufgelöst, unabhängig von der Reihenfolge der Definitionen. Sie entsteht als **Phasenverschiebung** ihres Bezugs: Die Grenzen der Einheiten liegen auf dem Nullpunkt und seinen Wiederkehr-Punkten, die Namens-Listen wandern mit, und ein Nullpunkt jenseits des kürzesten Monats wird auf dessen letzten Tag geklemmt. Damit erbt jede Einheit die Länge ihres Vorbilds, und der Schalttag fällt von selbst in das richtige Jahr; die naive Neu-Verankerung driftet dagegen messbar um einen Tag je Schaltjahr. Neu sind außerdem die Staffelungs-Funktion über Ebenen, Zyklen und Gruppierungen sowie `convertBetween` und `baseCalendarOf` für die Umrechnung zu einem Bezug, der nicht im Block steht.
- **Anlage über die Einstellungen** (4T-0747): Der Bereich „Kalender-Systeme" hat den Knopf „Abgeleitete Zeitrechnung hinzufügen" und ein kurzes Formular mit Bezugs-Auswahl, Nullpunkt (wahlweise über den Picker), Gliederungs-Tiefe und den beiden Richtungs-Kürzeln; Ebenen-, Zyklus-, Gruppen- und Epochen-Editoren entfallen, weil nichts davon überschreibbar ist. Die Live-Vorschau zeigt kanonischen Wert, Zeitspanne und den entsprechenden Zeitpunkt der Bezugs-Zeitrechnung.
- **Zeitspanne im Dokument** (4T-0748): Werte einer abgeleiteten Zeitrechnung erscheinen in Render-Pane, Live-Modus und Portable-Export als gestaffelte Zeitspanne ohne Bestandteile der Länge null; der Kurzhinweis nennt zusätzlich den kanonischen Wert und das Bezugs-Datum. Steht die Ableitung auf der Standard-Zeitrechnung, erscheinen die Einheiten in Ein- und Mehrzahl.
- **Picker in Bezugs-Notation** (4T-0748): Für eine Ableitung zeigt der Picker das Gitter ihres Bezugs; gewählt wird ein gewöhnliches Datum, eingefügt die Zählung. „Zum Anker" springt dabei auf den Nullpunkt.
- **Schutz bestehender Zählungen** (4T-0747): Der Editor einer Zeitrechnung mit Ableitungen weist dauerhaft auf sie hin und verlangt beim Anwenden einer wirksamen Änderung eine Bestätigung; das Löschen ist gesperrt, solange Ableitungen bestehen. Anzeige-Name und Epochen des Bezugs lösen keine Meldung aus, weil sie in einer Ableitung nicht durchschlagen.

### Geändert

- **Ablage der Kalender-Sektion behält die kurze Form** (4T-0747): Der Schreibweg der Bereichsdatei legte bisher ausschließlich die normalisierte Konfiguration ab. Für eine Ableitung wäre das die aufgelöste Abschrift ihres Bezugs gewesen, womit die Verbindung beim nächsten Laden verloren wäre. Eigenständige Kalender werden weiterhin normalisiert abgelegt, Ableitungen in ihrer kurzen Form aus Bezug und Nullpunkt.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0749): ein neuer Katalog-Eintrag „Abgeleitete Zeitrechnungen" mit Beschreibung, Kurzname und Zugang sowie ein neuer Abschnitt auf der Handbuch-Seite „Kalender-Systeme", beides in allen fünf Sprachen; insgesamt 31 neue i18n-Schlüssel aus diesem Epic. Die Demo-Umgebung bleibt unverändert, weil eine abgeleitete Zeitrechnung wie die Kalender-Systeme selbst eine Bereichs-Konfiguration braucht, die eine mitgelieferte Datei nicht mitbringen kann.

## [0.91.0.926] - 2026-07-24 — Bereichs-Lesezeichen

Epic 3E-0115 (Bereichs-Lesezeichen): Das Lesezeichen-Panel ist zweigeteilt. Neben den allgemeinen Lesezeichen führt es Bereichs-Lesezeichen, die zum gerade geöffneten Bereich gehören, in dessen `Area_Settings.mdda` gespeichert sind und ihre Ziele wurzel-relativ ablegen, sodass ein Verschieben des Bereichs-Ordners sie nicht bricht. Aus den Test-Runden kamen zwei davon unabhängige Bestands-Lücken hinzu, die im selben Epic behoben sind.

### Neu

- **Bereichs-Lesezeichen im geteilten Panel** (4T-0611, 4T-0612): Das Lesezeichen-Panel ist in zwei Abschnitte zerlegt, „Bereichs-Lesezeichen" und „Lesezeichen". Der Bereichs-Abschnitt und die Abschnitts-Köpfe erscheinen nur bei geöffnetem Bereich; ohne Bereich bleibt das gewohnte Ein-Abschnitts-Bild. Bereichs-Lesezeichen liegen in der Bereichs-Datei `Area_Settings.mdda` (Sektion `settings.bookmarks`) und speichern ihre Ziele wurzel-relativ zur Bereichs-Wurzel, sodass ein Verschieben des Bereichs-Ordners die Lesezeichen nicht bricht; Ziele außerhalb des Bereichs werden abgelehnt. Das prozess-neutrale `src/shared/bookmark-tree.js` und die IPC-Brücken (`bookmarks:getConfig`/`bookmarks:setAreaConfig`) tragen die Relativierung und die Grenz-Prüfung.
- **Anlegen und Umwandeln** (4T-0612): Bei geöffnetem Bereich und einer Datei innerhalb erscheint bei `Strg+D` ein Ziel-Wahl-Menü „Allgemeines Lesezeichen" / „Bereichs-Lesezeichen", oben bei der Menüleiste verankert; außerhalb oder ohne Bereich wird ohne Nachfrage allgemein angelegt. Zusätzlich legen das Kontextmenü der Datei-Zeile im Bereichs-Panel und das Tab-Kontextmenü ein Bereichs-Lesezeichen direkt an. Ein bestehendes Lesezeichen lässt sich über sein Kontextmenü in beide Richtungen umwandeln, auch ein Ordner mit seinem Unterbaum; ein Ziel außerhalb des Bereichs lehnt den ganzen Vorgang ab.
- **Reihenfolge, Rename-Nachzug und Mehr-Fenster-Abgleich** (4T-0612): Eine Einstellung „Bereichs-Lesezeichen oben" im Bereich „Verhalten" bestimmt, ob der Bereichs-Abschnitt über oder unter den allgemeinen Lesezeichen steht; sie ist standardmäßig an und wirkt sofort. Drag-and-Drop ordnet strikt innerhalb eines Abschnitts, ohne Wechsel über die Grenze. Das Umbenennen von Dateien und Ordnern innerhalb des Bereichs zieht die relativen Ziele nach, und mehrere Fenster gleichen ihre Bereichs-Lesezeichen über den Broadcast `bookmarks:changed` ab.

### Behoben

- **Allgemeine Lesezeichen glichen sich nicht zwischen Fenstern ab** (4T-0612): Der globale Lesezeichen-Baum wird über `settings:set` im Einstellungs-Store abgelegt, dessen Broadcast an andere Fenster den Schlüssel `bookmarksTree` bisher nicht mitführte. Ein in einem Fenster gesetztes allgemeines Lesezeichen erschien deshalb in anderen offenen Fenstern nicht. Der `settings:set`-Handler sendet den neuen Baum jetzt als `bookmarksTree:changed` an die übrigen Fenster, die ihn übernehmen und den allgemeinen Abschnitt neu zeichnen. Bestands-Lücke, durch das zweigeteilte Panel sichtbar geworden.
- **Bereichs-Panel baute seine Ordner-Liste sporadisch doppelt** (4T-0612): `renderAreaPanel` leerte den Baum-Container früh, hängte die Zeilen aber über mehrere `await`-Punkte hinweg an. Zwei überlappende Läufe derselben Pane beim Fenster-Start, Bereichs-Wechsel-Push und Start-Sequenz, bauten so beide ihre Zeilen an, und die Ordner-Struktur erschien doppelt. Der Aufbau läuft jetzt atomar: Jeder Lauf baut Baum und Dateiliste in ein losgelöstes `DocumentFragment` und setzt es nach einer Token-Prüfung in einem Zug ein, ein überholter Lauf verwirft sein Ergebnis. Latente Renn-Bedingung seit Einführung des Bereichs-Panels.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0613): vier neue i18n-Keys in allen fünf Sprachen (der Katalog-Eintrag „Bereichs-Lesezeichen" mit Beschreibung, Kurzname und Zugang in der Gruppe Navigation sowie der Titel der neuen Handbuch-Seite) und eine neue Handbuch-Seite „Lesezeichen" in fünf Sprachfassungen, die allgemeine und bereichsgebundene Lesezeichen erklärt und in der Überblicksseite verlinkt ist. Die Demo-Umgebung bleibt unverändert, weil Bereichs-Lesezeichen ein reines Bedien-Feature der Oberfläche ohne Dokument-Syntax sind.

## [0.90.0.914] - 2026-07-24 — Das Handbuch im Web

Epic 3E-0137 (Handbuch im Web): Das vollständige App-Handbuch erscheint zusätzlich als statische Web-Fassung auf der Produkt-Webseite unter `/manual/` (Englisch an der Wurzel, DE/FR/ES/IT als Sprach-Ordner), in allen fünf Sprachen und über dieselbe Markdown-Pipeline gerendert wie in der Anwendung. Die App-Seite bleibt unverändert; der Web-Bau erzeugt die Fassung bei jedem `npm run web:build` mit.

### Neu

- **Web-Fassung des Handbuchs** (4T-0714, 4T-0715): Der Web-Generator (`scripts/build-web.js`) rendert jede gebündelte Handbuch-Seite in fünf Sprachen über dieselbe Pipeline wie die Anwendung (`renderMarkdown` aus `src/shared/markdown/markdown.js`) und legt sie unter dem einheitlichen Segment `manual` ab: Englisch als `/manual/<id>/`, die übrigen Sprachen als `/de|fr|es|it/manual/<id>/`, die Überblicksseite als `/manual/`. Der Viewer-Stil wird bauzeitlich aus `src/renderer/styles.css` gewonnen (ein Quellbestand, keine gepflegte Kopie), sodass die Seiten aussehen wie in der App, inklusive KaTeX-Formeln als statisches HTML. Interne `<id>.md`-Verweise werden registry-validiert auf die Web-Adresse der Zielseite umgeschrieben; ein unbekanntes Ziel bricht den Bau ab. Die Handbuch-Vorlage trägt eine Seitenleiste mit allen Seiten in Registry-Reihenfolge, ein Inhaltsverzeichnis je Seite aus den H2/H3-Überschriften und ein Vor-/Zurück-Blättern; Menü und Fußbereich der Webseite führen den Zugang „Handbuch". `hreflang`-Block, Sprachwechsler und Seitenkarte tragen die Handbuch-Adressen vollständig.
- **Generierte Seiten im Web-Bau** (4T-0716): Die zwei generierten Handbuch-Seiten (Funktions-Tabelle und Tastenkürzel) entstehen beim Web-Bau aus denselben Datenquellen wie in der App über das neue geteilte Modul `src/shared/manual-generated.js`. Der Web-Bau ruft es mit den Default-Bindings aus `src/shared/commands.js` und allen Erweiterungen aktiv auf; illustrative Wiki-Link-Beispiele der Funktions-Seite werden im statischen Web zu nicht verweisendem Text neutralisiert. Die Seitenkarte trägt jetzt alle Handbuch-Adressen (gebündelte und generierte Seiten je Sprache).
- **Mermaid-Diagramme als vorab gerendertes SVG** (4T-0717): `scripts/web-mermaid.js` rendert jeden `language-mermaid`-Block des Handbuchs bauzeitlich über einen einmaligen Playwright/Chromium-Lauf zu Inline-SVG, je Diagramm in einer hellen und einer dunklen Fassung; die Sichtbarkeit steuert CSS über die vorhandenen Theme-Variablen `--shot-light`/`--shot-dark`. Auf den ausgelieferten Seiten läuft kein Mermaid-Client-Skript. Der Diagramm-Quelltext bleibt in einem Aufklapper erhalten. Fehlt der Browser, bricht der Bau mit Installations-Hinweis ab.
- **Volltext-Suche im Web-Handbuch** (4T-0718): Der Bau erzeugt je Sprache einen Suchindex (`<lang>/manual/manual-suchindex.json`) aus dem gerenderten HTML, mit Seiten-Titel, Abschnitts-Ankern und Klartext. Ein eigenes Client-Skript (`web/statisch/manual-search.js`, keine fremde Bibliothek) blendet ein Suchfeld in die Seitenleiste, lädt den Index erst bei Nutzung und sucht tokenbasiert und akzent-normalisiert (NFD, kombinierende Zeichen entfernt); die Trefferliste zeigt Seite, Abschnitt und Text-Schnipsel und führt per Klick auf die Fundstelle. Ohne Skript bleibt das Handbuch über die Seitenleiste voll navigierbar.

### Geändert

- **Erzeugung der Funktions- und Tastenkürzel-Seite in ein geteiltes Modul ausgelagert** (4T-0716): `src/renderer/modules/manual.js` und `autocomplete-help.js` beziehen die beiden Seiten jetzt aus dem prozess-neutralen `src/shared/manual-generated.js` und reichen die Laufzeit-Werte (Nutzer-Hotkeys, deaktivierte Erweiterungen) hinein. Für die Anwendung ist das ein reines Refactoring ohne Verhaltensänderung; das erzeugte Markdown ist Zeichen für Zeichen dasselbe.
- **Web-Generator: Leerung des Ausgabe-Ordners gehärtet** (4T-0716): `baueWebseite` leert jetzt den Inhalt von `web/ergebnis`, statt den Ordner selbst zu entfernen und neu anzulegen. Ein offenes Handle auf dem Ordner (Explorer, Vorschau-Server) ließ das bisherige Vorgehen unter Windows mit `EBUSY` scheitern.

## [0.89.0.885] - 2026-07-23 — Die Sidebar am Rand einklappen

Epic 3E-0141 (Sidebar-Spalten am Rand ein- und ausklappen): Die linke und die rechte Sidebar-Spalte lassen sich als Ganzes einklappen, über ein Symbol am inneren Rand jeder Spalte; das Ausklappen stellt die vorherige Panel-Sichtbarkeit verlustfrei wieder her. Dazu wird die Umstellung der Projektlizenz von MIT auf Apache 2.0 nachgetragen, die seit ihrer Einführung noch in keinem Versions-Block vermerkt war.

### Neu

- **Sidebar-Spalten als Ganzes einklappen** (4T-0697, 4T-0698): Ein Klick auf das Symbol in der obersten Kopfzeile am inneren Rand klappt die ganze Spalte ein; eine eingeklappte Spalte bleibt als schmaler Strich am Fensterrand stehen, der beim Überfahren das Symbol zeigt und auf Klick wieder ausklappt. Der Kollaps legt sich als eigener Zustand über die Panel-Sichtbarkeiten, statt sie abzuschalten, sodass das Ausklappen exakt den vorherigen Stand wiederherstellt. Linke und rechte Spalte schalten unabhängig, in der geteilten Ansicht jede Editor-Spalte für sich; der Zustand wird global gespeichert und gilt beim nächsten Start weiter. Zusätzlich zum Rand-Symbol steht die Funktion als zwei direkte Einträge im Ansichtsmenü und als zwei belegbare Kommandos in der Kommando-Palette bereit. Sie ist als interne Erweiterung „Sidebar-Spalten einklappen" abschaltbar; im Aus-Zustand verschwinden Symbol und Kommandos, und ein gespeicherter Kollaps-Zustand wird aufgehoben.

### Geändert

- **Quellcode erstmals öffentlich** (4T-0562, Epic 3E-0101): Der Quellcode-Stand dieses Release ist seit dem 2026-07-23 öffentlich auf [github.com/Stumm-Consulting-GmbH/em4me](https://github.com/Stumm-Consulting-GmbH/em4me) verfügbar — je Release ein Commit samt Tag, dazu der Release-Eintrag mit den Prüfsummen der ausgelieferten Programme als zweiter Anker des Herkunfts-Nachweises. Veröffentlicht wird ausschließlich der kuratierte Export über die Positivliste; das interne Repositorium bleibt privat. Nachgetragen am Tag der Public-Umstellung.
- **Projektlizenz auf Apache 2.0** (4T-0558): Das Repositorium steht jetzt unter der Apache-Lizenz 2.0 statt unter der MIT-Lizenz, mit der Stumm-Consulting GmbH als Rechteinhaberin. Eine neue `NOTICE`-Datei liegt im Repo-Root, und die gebauten Programm-Dateien tragen den entsprechenden Copyright-Vermerk. Nutzung, Modifikation, Verbreitung und kommerzielle Weiterverwendung bleiben erlaubt; die Apache-Lizenz ergänzt eine ausdrückliche Patentlizenz und verlangt bei Weitergabe den Erhalt von Lizenztext, `NOTICE` und Änderungsvermerken. Markenrechte am Produktnamen bleiben ausgenommen. Die Umstellung war seit ihrer Einführung in keinem Versions-Block vermerkt und wird hier nachgetragen.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0699): fünf neue i18n-Keys in allen fünf Sprachen (der Katalog-Eintrag „Sidebar-Spalten einklappen" mit Beschreibung, Kurzname und Zugang sowie zwei Tastenkürzel-Beschreibungen für die belegbaren Kommandos), und die Handbuch-Seite „Sidebar" in fünf Sprachen um einen Abschnitt zum Ein- und Ausklappen der Spalten ergänzt. Die Demo-Umgebung bleibt unverändert, weil das Ein- und Ausklappen eine reine Bedien-Funktion der Oberfläche ohne Dokument-Syntax ist.

## [0.88.0.846] - 2026-07-22 — Die Uhr in drei Größen

Epic 3E-0139 (Digitale Uhr in mehreren Größen): Die Größen-Einstellung des Uhr-Panels bemisst jetzt Zifferblatt und Schrift gemeinsam. Aus der Test-Runde kam ein zweiter, davon unabhängiger Befund am Sidebar-Höhen-System, der im selben Epic behoben ist.

### Geändert

- **Größen-Stufe bemisst auch die digitale Anzeige** (4T-0679): Bisher wirkte die Einstellung nur auf das Zifferblatt, während Uhrzeit, Datumszeile und Kalenderwoche feste Schriftgrößen trugen. Jetzt folgen alle drei Zeilen der Stufe und behalten dabei ihr Größenverhältnis. Die kleine Stufe entspricht exakt dem bisherigen Schriftbild; mittel und groß kommen darüber dazu. Wer die Standard-Stufe „mittel" nutzt, bekommt damit eine größere Uhrzeit als zuvor — bewusste Festlegung, weil die Idee genau darauf zielt.
- **Größen-Auswahl im Block „Anzeige"** (4T-0679): Sie stand unter „Analoge Uhr" und war damit für jeden unsichtbar, der die Uhr ohne Zifferblatt betreibt. Jetzt steht sie hinter den vier Sichtbarkeits-Schaltern und gilt auch für die reine Digitalanzeige.
- **Überbreite Zeilen werden beschnitten statt umgebrochen** (4T-0679): Passt eine Zeile nicht in die Sidebar-Spalte, ragt sie über beide Ränder hinaus und wird dort gekappt; die Mitte bleibt lesbar. Die große Stufe ist damit ausdrücklich für eine breit gezogene Spalte gedacht und nicht an der Mindestbreite bemessen.
- **Unterstes Sidebar-Panel folgt seinem Inhalt** (4T-0682): Der Höhen-Griff steuert immer das Panel darüber, das unterste hat also keinen. Bisher bekam es beim Ziehen eines beliebigen anderen Griffs trotzdem eine feste Höhe mit und stand danach dauerhaft auf dieser Höhe, ohne jede Möglichkeit, sie zu ändern; es rollte, obwohl darunter Platz frei war. Jetzt läuft es immer auf automatischer Höhe, und beim Ziehen entsteht für es kein gespeicherter Wert mehr. Ein Rollbalken erscheint dort nur noch, wenn der Platz für den Inhalt wirklich nicht reicht.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0680): Die Uhr-Beschreibung nennt die Größen-Stufe jetzt als eigene Aussage statt als Teil der Zifferblatt-Aufzählung. Der Katalog-Text zu den Panel-Höhen behauptete, die Höhe **jedes** Panels sei am Griff einstellbar; er nennt jetzt die tatsächliche Regel samt untersten Panel. Neuer Abschnitt „Größe" auf der Handbuch-Seite zu den Werkzeugen und ein ergänzter Absatz auf der Sidebar-Seite, beides in allen fünf Sprachen.

## [0.87.0.832] - 2026-07-22 — Reiter neben ihrer Herkunft

Epic 3E-0130 (Tab-Position von Folge-Ansichten): Ein Reiter, der aus einem anderen heraus entsteht, öffnet sich nicht mehr am Ende der Leiste, sondern unmittelbar rechts neben seiner Herkunft.

### Geändert

- **Position neuer Reiter** (4T-0648): Jeder Klick im Inhalt eines Dokuments — Wiki-Link, Treffer einer Abfrage, Ereignis-Quelle, Journal-Navigation, Diagramm-Link — öffnet das Ziel unmittelbar rechts neben dem Reiter, aus dem geklickt wurde. Öffnet ein Aufruf mehrere Dateien, stehen sie in ihrer Reihenfolge dahinter. Öffnungen ohne Herkunft (Datei-Dialog, Kommando-Palette, Lesezeichen, Panels, Handbuch, Einstellungen) hängen unverändert ans Ende der Leiste, und eine bereits offene Datei wird weiterhin nur aktiviert, ohne die Reihenfolge zu ändern.
- **Verhalten in Reiter-Gruppen** (4T-0648): Bisher trat eine so geöffnete Datei der Gruppe am **Gruppen-Ende** bei. Bei mehr als einem Mitglied lag sie damit weit von ihrer Herkunft entfernt. Jetzt tritt sie derselben Gruppe an ihrer Position neben der Herkunft bei; der Gruppen-Block bleibt dabei zusammenhängend. Die Positions-Regel gilt unabhängig davon, ob die Erweiterung „Tab-Gruppen" eingeschaltet ist.
- **Dokument-Historie neben ihrem Dokument** (4T-0648): Ihr Reiter erscheint neben dem Reiter des Dokuments, zu dem sie gehört, und wandert mit, sobald sie für ein anderes Dokument geöffnet wird. Ist das Dokument nicht in derselben Spalte offen, bleibt es beim bisherigen Verhalten.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0676): ein neuer Katalog-Eintrag „Position neuer Tabs" mit Beschreibung, Kurzname und Zugang in fünf Sprachen, dazu zwei nachgezogene Bestands-Einträge (Tab-Gruppen, Historien-Ansicht). Die Handbuch-Seite „Applikationen, Fenster und Bereiche" hat in fünf Sprachen einen neuen Abschnitt „Position neuer Tabs" bekommen; die Seiten zu den Tab-Gruppen und zur Dokument-Historie sind nachgezogen.

## [0.86.0.819] - 2026-07-21 — Listen als Gliederung

Epic 3E-0112 (Listen-Outliner): Listen lassen sich strukturell bearbeiten statt nur zeilenweise. Aus dem Epic mit ursprünglich vier Tasks sind neun geworden; vier davon entstanden erst in den Test-Runden des Product Owners, weil sich zeigte, dass mehrere Annahmen über das Verhalten von Markdown-Listen nicht zutrafen.

### Neu

- **Listenpunkte samt Unterpunkten verschieben** (4T-0599): `Alt+↑` und `Alt+↓` bewegen einen Punkt mit allem, was darunter hängt. Der Sprung geht immer über den ganzen Nachbar-Ast, die Ebene bleibt unverändert; ohne Nachbar in der Richtung passiert nichts. Außerhalb von Listen verschieben die Kürzel weiterhin die einzelne Zeile. Jede Operation ist ein Rückgängig-Schritt.
- **Ein- und Ausrücken nimmt den Teilbaum mit** (4T-0599, 4T-0661): `Tab` und `Umschalt+Tab` verschieben den Punkt samt Unterpunkten, mit Cursor in einer Zeile ebenso wie bei einer Markierung über mehrere.
- **Teilbaum auswählen**: neues Kommando (Kommando-Palette), markiert einen Punkt mit allem, was darunter hängt — Grundlage zum Kopieren oder Ausschneiden ganzer Äste.
- **Automatische Nummerierung** (4T-0655): Nummerierte Listen zählen im Quelltext von selbst durch, sobald in ihnen gearbeitet wird, nicht nur nach den Struktur-Kommandos. Die Startnummer einer Liste bleibt erhalten. Korrektur und Bearbeitung bilden einen Rückgängig-Schritt; das bloße Öffnen einer Datei ändert nichts.
- **Listen-Ausstieg** (4T-0600): Die Eingabetaste auf einem leeren Punkt der obersten Ebene beendet die Liste, statt eine Leerzeile und einen weiteren leeren Punkt zu hinterlassen.
- **Tabulator außerhalb von Listen einstellbar** (4T-0656): Neuer Schalter im Bereich „Verhalten". Standardmäßig fügt die Taste dort eine Einrückung ein; abgeschaltet wandert der Eingabefokus weiter wie bisher.

### Geändert

- **Eine Leerzeile trennt zwei nummerierte Listen** (4T-0660): Die zweite Liste beginnt wieder bei ihrer eigenen Nummer, in der Anzeige wie im Quelltext. Das weicht **bewusst von der Standard-Interpretation ab**, in der eine Leerzeile eine Liste nur weitläufig fortsetzt und die Zählung über sie hinweg durchläuft. Ein so geschriebenes Dokument sieht in anderen Markdown-Programmen deshalb anders aus, ebenso im portablen Export, der Markdown ausliefert. Wer das nicht will, schaltet die Erweiterung ab.
- **Einrück-Tiefe folgt der Struktur** (4T-0660, 4T-0661): Eingerückt wird auf die Inhalts-Spalte des Punktes darüber statt um eine feste Schrittweite, und nur dort, wo es einen solchen Punkt gibt.
- **Neue schaltbare Erweiterung „Listen-Struktur"** (Bereich „Erweiterungen"): bündelt die Struktur-Kommandos, die automatische Nummerierung, den Listen-Ausstieg und die Leerzeilen-Trennung. Abgeschaltet verhält sich die Anwendung wie zuvor.

### Behoben

- **Einrücken nummerierter Listen blieb ohne Wirkung auf die Anzeige** (4T-0660): Bislang rückte die Anwendung pauschal um zwei Zeichen ein. Unter einem nummerierten Punkt reicht das nicht: Ein Unterpunkt gilt erst ab der Inhalts-Spalte des Elternpunkts als Unterpunkt, unter `1. ` also ab drei Zeichen, unter `10. ` ab vier. Der Quelltext sah eingerückt aus, die Anzeige zeigte die Liste flach. Ein Bestandsfehler seit Einführung der Tab-Einrückung.
- **Ausrücken zerriss die verbleibende Untergliederung** (4T-0661): Beim Ausrücken eines Punktes aus einer Untergliederung blieben seine ehemaligen Geschwister mit ihrer alten Nummer zurück. Da eine geordnete Liste einen Absatz nur unterbrechen kann, wenn sie mit 1 beginnt, zog die Anzeige die Zeile als Fortsetzungstext in den Punkt darüber und stellte beides einzeilig dar.

### Dokumentation

- **Funktions-Katalog und Handbuch** (4T-0601): drei neue Katalog-Einträge (Listen-Struktur, automatische Nummerierung, Fortsetzen und Beenden) mit je Beschreibung, Kurzname und Zugang in fünf Sprachen, dazu ein überarbeiteter Eintrag zur Listen-Einrückung. Der Listen-Abschnitt der Handbuch-Grundlagen ist in fünf Sprachen um drei Unterabschnitte gewachsen; dabei wurde eine falsche Aussage zur Einrück-Tiefe korrigiert. Die Demo-Area zeigt eine korrekt verschachtelte nummerierte Liste.

## [0.85.1.807] - 2026-07-20 — Bearbeitungs-Fehler und Doku-Nachzug

Hotfix zum Epic 3E-0126 (Rebranding auf EM4me): Er liefert einen nutzersichtbaren Fehler nach, der bei der Untersuchung eines instabilen Testfalls sichtbar wurde, sowie den Nachzug des neuen Produktnamens in den lebenden Projekt-Dokumenten. Beide Vorgänge entstanden nach der Auslieferung der 0.85.0 (Tasks 4T-0653 und 4T-0652).

### Behoben

- **Zeilen-Bearbeitung verlor ihr Eingabefeld** (4T-0653): In der geteilten Ansicht plant jede Dokument-Änderung einen verzögerten Neuaufbau der Vorschau, der deren Inhalt vollständig ersetzt. Das Bestätigen einer Ereignis-Zeile schreibt in den Block, ändert also das Dokument, und löste damit selbst den Aufbau aus, der kurz darauf zuschlug: Wer binnen dieser Frist die nächste Zeile zur Bearbeitung öffnete, verlor sie mitsamt der bereits getippten Eingabe. Der Aufbau war dabei überflüssig, weil das Rückschreiben die Vorschau bereits selbst aktualisiert. Er wird jetzt abbestellt; zusätzlich wird ein geplanter Aufbau aufgeschoben, solange eine Zeilen- oder Zellen-Bearbeitung offen ist. Das betrifft Ereignis-Tabellen und Datentabellen gleichermaßen. Ein neuer Testfall sichert das Verhalten ab.

### Dokumentation

- **Lebende Projekt-Dokumente auf EM4me nachgezogen** (4T-0652): technische Architektur-Sicht, Entwicklungsrichtlinien, Roadmap, Analysen des eigenen Vorgehens und die Referenz-Analysen. Historische Spur bleibt unverändert: abgeschlossene Vorgänge, ältere Änderungsprotokoll-Einträge und Versions-Chroniken nennen weiterhin den zeitgenössischen Namen. Neu ist ein Erkenntnis-Eintrag, der die Lehren aus drei Umbenennungen festhält.

## [0.85.0.804] - 2026-07-20 — Rebranding auf EM4me

Epic 3E-0126 (Rebranding auf EM4me): Das Produkt heißt jetzt **EM4me**, mit eigener Bildmarke und dem Claim „extended memory for me". Der Name ordnet das Werkzeug in eine Familie ein, zu der auch eine geplante Server-Komponente gehört. Es ist die dritte Umbenennung; sie folgt dem Zuschnitt der vorigen und lässt bestehende Installationen vollständig weiterarbeiten. Umgesetzt in drei Umsetzungs-Tasks (4T-0649, 4T-0643, 4T-0650).

### Geändert

- **Produktname durchgängig auf EM4me** (4T-0643): Fenstertitel, leerer Zustand, Über-Dialog und Menüs in allen fünf Sprachen, dazu Programm-Metadaten, Installations- und Verknüpfungs-Namen. Die erzeugten Programm-Dateien heißen `EM4me-<version>-Setup.exe` und `EM4me-<version>-Portable.exe`. **Bewusst unverändert** bleiben zwei technische Kennungen: die Anwendungs-Kennung (ein Wechsel würde die neue Installation neben die alte setzen statt an ihre Stelle) und die Registrierungs-Kennung der Datei-Zuordnung (ein Wechsel würde bestehende Zuordnungen ins Leere laufen lassen).
- **Neue Bildmarke, gestaffelt ausgespielt** (4T-0649): Ein goldenes Plättchen mit großer Vier, umgeben von den Buchstaben E, M, m und e. Weil die Buchstaben bei 16 Pixeln zu Grau zerfallen, führt das Anwendungs-Symbol in den kleinen Stufen eine Kompaktmarke, die allein die Ziffer zeigt und die Buchstaben auf Punkte reduziert; ab 48 Pixeln erscheint die vollständige Marke. Titelleiste und Taskleiste bekommen damit ein lesbares Symbol, Desktop-Verknüpfung und Datei-Eigenschaften die volle Marke. Das Logo erscheint zusätzlich im Über-Dialog und im Handbuch-Kopf. Die frühere Bildmarke beruhte auf fremdem Material; die neue ist Eigengestaltung, die Fremd-Attribution entfällt.
- **Marken-Claim** (4T-0643): „extended memory for me" steht unter dem Produktnamen im leeren Zustand, im Über-Dialog und unter dem Logo im Handbuch. Er lautet in allen Sprachen gleich, weil er als Auflösung des Namens Bestandteil der Marke ist.

### Behoben

- **Nutzerdaten gingen bei einer Umbenennung teilweise verloren** (4T-0643): Der Ordner für Nutzerdaten hängt am Produktnamen, weshalb jede Umbenennung auf einem leeren Profil startet. Die vorhandene Übernahme kopierte allein die Einstellungs-Datei. Nicht mitgenommen wurden die Entwürfe nie gespeicherter Tabs und die installierten externen Erweiterungen — beides Bestände, die es beim vorigen Rebranding noch nicht gab. Die Übernahme deckt jetzt alle drei ab; die Quell-Daten bleiben unangetastet liegen.

### i18n und Handbuch

- **Dokumentation und Handbuch nachgezogen** (4T-0650): Projektbeschreibung, Projekt-Konventionen und Release-Vorlage tragen den neuen Namen; im Handbuch der Begrüßungssatz der Überblicksseite und ein Halbsatz auf der Seite „Perspective Table", je in allen fünf Sprachen. Das mitgelieferte Beispiel-PDF der Demo-Umgebung wurde neu erzeugt, weil es den Namen im eingebetteten Text führte. Ein neuer i18n-Schlüssel für den Claim in fünf Sprachen; der Schlüssel der bisherigen Icon-Herkunft und die Autoren-Zeile des Über-Dialogs sind entfallen.
- **Die Funktionsnamen rund um „Perspective" bleiben unverändert**: Perspective Table, Perspective Datatable und Perspective-Abfrage behalten ihren Namen, ebenso die gleichlautenden Code-Block-Namen der Markdown-Syntax. Sie sind Bestandteil bestehender Dokumente; eine Umbenennung würde sie brechen. Produktname und Funktionsname sind ab dieser Version verschiedene Dinge.

## [0.84.0.796] - 2026-07-20 — Uhr-Ausbau und Bedien-Themen

Epic 3E-0069 (Uhr-Ausbau, Panel-Darstellung und Fehlerbehebungen): Die mit dem Uhr-Kern begonnene Erweiterung wird zur vollständigen Zeit-Werkzeug-Sammlung mit Wecker, Timer und Stoppuhr. Dazu drei unabhängige Bedien-Themen aus dem Ideen-Backlog: umschaltbare Panel-Überschriften, ein behobener Schreibschutz-Fehler im Lesemodus und ein neuer Schreib-Trigger für die Datumseingabe. Umgesetzt in sechs Umsetzungs-Tasks (4T-0636 bis 4T-0641) plus Hilfe- und Handbuch-Task (4T-0373).

### Neu

- **Modus-Umschaltung im Uhr-Panel** (4T-0636): Eine Leiste aus vier Icon-Tasten über dem Panel-Inhalt schaltet zwischen Uhr, Wecker, Timer und Stoppuhr um. Die Wahl gilt je Sidebar-Spalte und überlebt den Neustart; links die Uhr und rechts der Timer sind damit gleichzeitig möglich. Der Anzeige-Takt läuft nur noch, wenn eine sichtbare Spalte tatsächlich die Uhr zeigt.
- **Wecker** (4T-0637): Beliebig viele Wecker mit Uhrzeit, Bezeichnung und Wiederhol-Muster (einmalig, täglich oder an gewählten Wochentagen), jeder einzeln scharf schaltbar. Die Uhrzeit kommt über eine Ziffern-Auswahl, eine ungültige Eingabe ist damit unmöglich. Ein fälliger Wecker meldet sich mit Dialog und lässt sich bestätigen oder um eine einstellbare Dauer schlummern; bei nicht aktivem Fenster kommt eine System-Benachrichtigung dazu. Die Fälligkeit prüft ein eigener Takt im Hauptprozess, unabhängig davon, ob das Panel offen ist. Ein verstrichener Weckzeitpunkt wird bewusst nicht nachgeholt.
- **Timer und Stoppuhr** (4T-0638): Beliebig viele rückwärts laufende Timer mit Restzeit und Fortschrittsbalken; drei Schnellwahl-Knöpfe starten sofort, eigene Dauern kommen über eine Steuerung für Stunden, Minuten und Sekunden. Die Restzeit wird aus Zeitstempeln gerechnet statt heruntergezählt und bleibt deshalb über Hintergrund, Ruhezustand und Neustart hinweg korrekt. Ein abgelaufener Timer meldet sich auf die Sekunde genau, weil der Prüfer einen gezielten Weckruf auf den nächsten Ablauf setzt statt zu pollen. Die Stoppuhr misst vorwärts, mit Hundertsteln, Pause und Rundenzeiten.
- **Panel-Überschriften wahlweise als Symbol** (4T-0639): Ein Schalter im Bereich „Sidebar" ersetzt die Text-Überschriften der Panels durch ihr jeweiliges Symbol, in den Sektions-Köpfen wie in den Reitern gruppierter Panels. Das Symbol stammt aus dem zugehörigen Statusbar-Schalter, ist also konstruktionsbedingt dasselbe; der Panel-Name bleibt als Kurzhinweis und für Screenreader erhalten.

### Geändert

- **Schreib-Trigger der Datumseingabe** (4T-0641): Die Zeichenfolge ist jetzt `;;` statt zweier Backslashes. Die bisherige Wahl kollidierte mit der Bedeutung des Backslash als Escape-Zeichen, denn `\\` ist die Schreibweise für einen literalen Backslash. Zusätzlich greift der Trigger nun in den Zellen der Perspective-Tabellen: Sie sind technisch Fenced-Code, für den Nutzer aber Tabellen mit Inhaltszellen. In gewöhnlichen Code-Blöcken, Formeln und im Frontmatter bleibt er ausgeschlossen.

### Behoben

- **Zeilenumbruch im Lesemodus setzte eine Listen-Nummer** (4T-0640): Die Eingabetaste am Ende einer nummerierten Liste erzeugte im reinen Lesemodus eine neue Zeile mit der nächsten Nummer und markierte das Dokument als geändert. Ursache war die eingekaufte Markdown-Tastenbelegung, deren Enter- und Backspace-Kommandos den Schreibschutz als einzige nicht prüfen. Eine Schreibschutz-Wache mit höchster Präzedenz fängt die schreibenden Tasten jetzt ab, solange der Schutz gilt; im Bearbeiten-Modus arbeitet die Listen-Fortsetzung unverändert.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0373): drei neue Funktions-Katalog-Einträge (Abdeckungs-Matrix F-149 bis F-151), ein neuer Handbuch-Abschnitt „Uhr, Wecker, Timer und Stoppuhr" auf der Seite „Werkzeuge" samt Unterabschnitten zu Weckern, Timer und Stoppuhr sowie zur Grenze „meldet nur bei laufender App", dazu ein Abschnitt „Überschriften als Symbol" auf der Seite „Sidebar" — jeweils in allen fünf Sprachen. Rund 60 neue i18n-Keys pro Sprache (Modus-Beschriftungen, Wecker- und Timer-Bedienung, Einstellungs-Labels, drei Katalog-Trios).

## [0.83.0.782] - 2026-07-19 — Darstellungs-Bündel

Epic 3E-0106 (Darstellungs-Bündel: Tab-Ecken, zentrierte Ansicht-Schalter, aktive Zeile und Farbschema-Vorlagen) aus dem Ideen-Backlog vom 2026-07-14 und 2026-07-15: Vier kleine Darstellungs-Themen in einem Release. Zwei neue Schalter im Bereich „Darstellung", eine ruhigere Anordnung der Statusleiste und acht zusätzliche Farbschema-Vorlagen. Umgesetzt in vier Umsetzungs-Tasks (4T-0575 bis 4T-0578) plus Hilfe- und Handbuch-Task (4T-0579).

### Neu

- **Abgerundete Tab-Ecken** (4T-0575): Dokument-Reiter und Tab-Gruppen-Köpfe stehen wahlweise eckig oder mit abgerundeten oberen Ecken. Im abgerundeten Zustand ersetzt ein schmaler Abstand die senkrechte Trennlinie, sodass die Reiter als einzelne Flächen lesbar bleiben; Aktiv-Kennung, Gruppen-Farbstreifen und Drop-Indikatoren bleiben unverändert. Schalter im Bereich „Darstellung" (Vorgabe aus), mit Live-Vorschau und sofortiger Wirkung in allen offenen Fenstern.
- **Hervorhebung der aktiven Zeile** (4T-0577): Die Zeile mit dem Cursor wird im Bearbeiten-Modus dezent hinterlegt, im Quelltext- wie im Live-Modus und samt Zeilennummern-Spalte. In der reinen Lese-Ansicht bleibt sie unmarkiert, weil dort kein Cursor steht. Die Tönung ist halbtransparent und liegt damit über jedem Farbschema; Auswahl, Suchtreffer und Linter-Markierungen bleiben darüber sichtbar. Schalter im Bereich „Darstellung" (Vorgabe an).
- **Vier neue Farbschema-Paare** (4T-0578): Stahlblau (kühl), Waldgrün (gedämpftes Grün), Bernstein (warm) und Graphit (neutral-grau), jeweils in einer hellen und einer dunklen Fassung. Wie die bisherigen Vorlagen sind sie unveränderlich und dienen als Kopier-Grundlage für eigene Schemas. Bei Bernstein ist die Warnfarbe der Linter-Markierung ins Rot verschoben, weil sie sonst mit dem bernsteinfarbenen Akzent verschmelzen würde.

### Geändert

- **Zentrierte Editor- und Ansicht-Schalter** (4T-0576): Die drei Editor-Ansicht-Schalter (Gliederung, Zeilennummern, Zeilenumbruch) und die vier Ansichts-Schalter (Live, Quellcode, Geteilt, Gerendert) bilden eine gemeinsame Gruppe in der Mitte der Statusleiste. Die Leiste ist dafür in drei Zonen geteilt; die Gruppe sitzt in der Fenster-Mitte und nicht in der Mitte des freien Platzes. Bei schmalen Fenstern weicht sie aus, statt von den Panel-Buttons überlagert zu werden. Bedienung, Tastenkürzel und die Reihenfolge der Panel-Buttons bleiben unverändert.
- **Akzentlinie der aktiven Spalte** (4T-0575): Die Linie am oberen Rand der Reiter-Leiste war bisher größtenteils von den Reitern verdeckt und nur in den Randbereichen zu sehen. Sie läuft jetzt durchgehend über die volle Breite, in beiden Ecken-Formen.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0579): zwei neue Funktions-Katalog-Einträge (Abdeckungs-Matrix F-146 und F-147), ein neuer Handbuch-Abschnitt „Form der Reiter" auf der Seite „Applikationen, Fenster und Bereiche" und die aktualisierte Vorlagen-Aufzählung auf der Seite „Farbschemas", jeweils in allen fünf Sprachen. Zehn neue i18n-Keys pro Sprache (zwei Katalog-Trios, zwei Einstellungs-Labels, acht Schema-Namen).

### Intern

- Beide neuen Schalter reisen als Felder im vorhandenen Darstellungs-Entwurf mit und nutzen dessen Mechanik für Live-Vorschau, Abbrechen-Revert, Änderungs-Erkennung und Mehrfenster-Verteilung. Sichtbar werden sie über je eine Klasse am Wurzel-Element; die Geometrie liegt vollständig im Stylesheet. In der Verteilung an andere Fenster reisen sie bewusst als echte Wahrheitswerte, weil der Empfänger unbestimmte Felder überspringt und ein Abschalten sonst nicht ankäme.
- Die Zeilen-Hervorhebung nutzt die Standard-Erweiterungen des Editors, dauerhaft eingebunden statt in einem Umschalt-Fach: Der Schalter gilt anwendungsweit und müsste sonst bei jeder Änderung über alle offenen Spalten nachgezogen werden. Der Editor bringt für die aktive Zeile eine eigene Theme-Farbe mit, die den vorhandenen Zurücksetzer bei gleicher Regel-Stärke geschlagen hat; beide Regeln sind deshalb als Vorrang-Regeln notiert, wie die Auswahl-Regel daneben.
- Die Statusleiste ist ein Drei-Spalten-Raster, dessen Seitenspalten nicht unter ihren Inhalt schrumpfen. Die naheliegende Formel mit frei schrumpfenden Seiten wurde verworfen, nachdem die Messung bei 900 Pixel Fensterbreite 118 Pixel Überlappung mit der Mittel-Zone zeigte. Die Sortier-Funktion der Panel-Buttons kommt ohne Anker-Button aus.
- Neuer Wächter über alle mitgelieferten Farbschemas: eindeutige Kennungen, gültige Basis, vorhandene Übersetzung, bekannte Slots, gültige Farbwerte und acht Kontrast-Paare nach der Kontrast-Formel der Web-Richtlinien. Die Mindestwerte wurden nach einer Messung des Bestands gewählt, sodass sie die vorhandenen Vorlagen halten und künftige Vorlagen mit unlesbaren Paarungen abfangen.
- Test-Härtung an zwei Bestandstests: Sie prüften die sichtbare Wirkung des Anwendens und beendeten die Anwendung dann hart, während der Schreibvorgang in den Einstellungs-Speicher noch lief. Beide warten jetzt auf das Schließen der Einstellungs-Seite, das erst nach allen Schreibvorgängen erfolgt.
- Neue Tests: ES-14 (Ecken-Form), ES-15 (aktive Zeile) und FA-06 (gemessene Zentrierung der Schalter-Gruppe) sowie erweiterte Unit-Blöcke im Einstellungs- und Farbschema-Modul.

## [0.82.0.775] - 2026-07-19 — Eingabe-Automatiken

Epic 3E-0113 (Eingabe-Automatiken: Link-Einfügen in die Auswahl und automatischer Erstellungs- und Änderungszeitpunkt): Zwei Automatiken nehmen wiederkehrende Handgriffe ab. Eine Adresse aus der Zwischenablage wird beim Einfügen über markiertem Text zu einem Link, und zwei Frontmatter-Felder pflegen sich beim Speichern selbst aus den Dateisystem-Zeitstempeln. Umgesetzt in zwei Umsetzungs-Tasks (4T-0603, 4T-0604) plus Hilfe- und Handbuch-Task (4T-0605).

### Neu

- **Link-Einfügen in die Auswahl** (4T-0603): Ist Text markiert und die Zwischenablage enthält eine einzelne Adresse, entsteht beim Einfügen ein Link aus Auswahl und Adresse, statt die Auswahl zu ersetzen. Adressen mit Leerzeichen oder Klammern werden in die spitze Schreibweise gesetzt, `www.`-Adressen erhalten das `https://`-Präfix. Ohne Auswahl, bei nicht eindeutig als Adresse erkennbarem Zwischenablage-Inhalt und in Quelltext-Bereichen bleibt es beim normalen Einfügen; `Strg+Umschalt+V` fügt immer unverändert ein. Ein Rückgängig-Schritt nimmt die Umwandlung vollständig zurück. Schalter im Bereich „Verhalten" (Vorgabe an), wirksam im Haupt- und im Notiz-Editor.
- **Erstellungs- und Änderungszeitpunkt** (4T-0604): Zwei Frontmatter-Felder lassen sich beim Speichern automatisch pflegen, der Erstellungszeitpunkt aus der Erstellungszeit der Datei und der Änderungszeitpunkt aus dem Speicherzeitpunkt. Beide Felder sind unabhängig zuschaltbar, ihre Namen frei wählbar, das Format wahlweise nur Datum oder Datum und Uhrzeit in lokaler Zeit. Ein vorhandener Erstellungszeitpunkt wird nie überschrieben; fehlende Felder entstehen nur mit der Anlage-Option, sonst bleibt das Dokument byte-identisch. Wirkt beim Speichern, beim Speichern unter und beim automatischen Speichern; Cursor und Scrollposition bleiben erhalten, weil nur der Frontmatter-Kopf ersetzt wird.
- **Erweiterung „Erstellungs- und Änderungszeitpunkt"** (4T-0604): Die Automatik ist als Werkzeug-Erweiterung schaltbar; ihr Einstellungs-Bereich „Zeitstempel" erscheint nur bei aktiver Erweiterung. Im Aus-Zustand bleiben Dokumente beim Speichern unverändert.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0605): zwei neue Funktions-Katalog-Einträge (Abdeckungs-Matrix F-144 und F-145) sowie je ein neuer Abschnitt auf den Handbuch-Seiten „Vernetzung" (Adresse in eine Auswahl einfügen) und „Frontmatter und Properties" (Erstellungs- und Änderungszeitpunkt), jeweils in allen fünf Sprachen. Achtzehn neue i18n-Keys pro Sprache (zwei Katalog-Trios, zehn Keys des Bereichs „Zeitstempel", zwei Keys des Verhalten-Schalters). Die Demo-Area blieb bewusst unverändert: beide Funktionen sind Verhaltens-Automatiken ohne eigene Syntax, die ein statisches Dokument nicht zeigen kann.

### Intern

- Neues Shared-Modul `frontmatter-timestamps.js` (prozess-neutral, ohne Electron- und DOM-Abhängigkeit): Zeitstempel-Formatierung und die vollständige Regel-Logik für beide Felder. Die Anlage-Option gilt ausschließlich für fehlende Felder, ein vorhandenes leeres Feld wird unabhängig davon gefüllt; ein bereits aktueller Wert meldet „keine Änderung" und verhindert damit einen Speicher-Kreislauf. Der Frontmatter-Round-Trip (`extractFrontmatter`/`writeFrontmatter`) bleibt unverändert und erhält Kommentare und Feld-Reihenfolge.
- Neue IPC-Brücke `file:getTimes` (Main) und `getFileTimes` (Preload) für `birthtime`/`mtime`, weil `fs.stat` nur im Main verfügbar ist. Fehlt die Erstellungszeit, fällt der Erstellungszeitpunkt auf den Speicherzeitpunkt zurück.
- Der Paste-Handler des Markdown-Sprachpakets (`pasteURLAsLink`) ist an beiden Editor-Zuständen abgeschaltet. Er ist standardmäßig aktiv und hätte die eigene Umwandlung überschattet, samt Verlust von spitzer Schreibweise, Schalter und Code-Schutz. `insertExternalLink` wurde um ein optionales Ziel-Argument erweitert, `detectPasteUrl` ist neu. Da das Einfüge-Ereignis den Umschalt-Zustand nicht trägt, merkt sich ein Tasten-Zweig des Handlers, ob `Strg+Umschalt+V` gedrückt wurde.
- Neue Test-Substanz: Unit-Suite `frontmatter-timestamps.test.js` (Regel-Matrix aus Feld vorhanden, leer und fehlend gegen die Anlage-Option, beide Formate, Einmaligkeit des Erstellungszeitpunkts, Fallback ohne Erstellungszeit, defektes YAML, eigene Feldnamen), erweiterte `markdown-format.test.js` (Adress-Erkennung und Link-Erzeugung inklusive spitzer Ziele) sowie die neue E2E-Suite `eingabe-automatiken.spec.js` mit zehn Tests (EA-01 bis EA-07 zum Einfügen, EA-08 bis EA-10 zum Speicher-Pfad samt Aus-Zustand der Erweiterung).

## [0.81.0.769] - 2026-07-18 — Inline-Berechnungen

Epic 3E-0111 (Inline-Berechnungen: Rechenausdrücke im Fließtext) aus dem Ideen-Backlog vom 2026-07-15: An jeder Stelle im Fließtext lassen sich zwischen den Markern `{=` und `=}` Rechenausdrücke eingeben; die gerenderte Ansicht, der Live-Modus und die Exporte zeigen das Ergebnis, der Quelltext behält den Ausdruck. Die Auswertung nutzt die vorhandene Ausdrucks-Sprache der Perspective-Abfrage, es entsteht keine zweite Formel-Sprache. Umgesetzt in zwei Umsetzungs-Tasks (4T-0595, 4T-0596) plus Hilfe- und Handbuch-Task (4T-0597).

### Neu

- **Inline-Berechnungen** (4T-0595): Ein Rechenausdruck zwischen `{=` und `=}` wird im Render-Pane, im Live-Modus und in den Exporten durch sein formatiertes Ergebnis ersetzt; der Roh-Ausdruck erscheint als Tooltip. Gerechnet wird mit der Ausdrucks-Sprache der Perspective-Abfrage: Zahlen, Klammern und Punkt-vor-Strich, Vergleiche und Logik, Zeichenketten samt Verkettung, Datums- und Dauer-Werte (`date(...)`, `dur(...)`, Datum ± Dauer, Datum − Datum) sowie der Funktions-Katalog (`number`, `string`, `lower`, `upper`, `length`, `startswith`, `endswith`, `contains`, `default`, `choice`, `dateformat`, `sum`, `min`, `max`, `average`). Ein nicht auswertbarer Ausdruck zeigt ein dezentes Fehler-Zeichen mit lokalisiertem Hinweis im Tooltip, ohne den Quelltext zu verändern. Feld-Zugriffe (z.B. `file.name`) werden in dieser Stufe bewusst nicht ausgewertet, sondern als eigener Fehler gemeldet. `\{=` ergibt ein wörtliches `{=` im Fließtext.
- **Modus-Parität und Export** (4T-0596): Im Live-Modus zeigt jede Zeile außerhalb der Cursor-Zeile das Ergebnis als Widget; die Cursor-Zeile deckt den Roh-Ausdruck zum Bearbeiten auf, und ein Klick auf ein Ergebnis-Widget setzt den Cursor hinein. Im Quelltext-Modus ist das Konstrukt dezent eingefärbt (keine Ersetzung). Der Portable-Export brennt das Ergebnis als selbsttragenden Span ein (sichtbar auch in anderen Markdown-Programmen), der PDF-Export folgt der gerenderten Ansicht; fehlerhafte Ausdrücke bleiben im Export als Quelltext erhalten.
- **Erweiterung „Inline-Berechnungen"** (4T-0595): Das Konstrukt ist als Render-Erweiterung schaltbar; im Aus-Zustand bleiben die Marker in allen Ansichten und Exporten gewöhnlicher Fließtext.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0597): ein neuer Funktions-Katalog-Eintrag „Inline-Berechnungen" (Abdeckungs-Matrix F-143) und ein neuer selbst-demonstrierender Abschnitt auf der Handbuch-Seite „Inline-Konstrukte" (Syntax, Operator- und Funktions-Übersicht, Fehlerbild, Escape) in allen fünf Sprachen. Sieben neue i18n-Keys pro Sprache (Katalog-Trio plus vier Fehler-Meldungen); die Demo-Datei „02 Extended Syntax" zeigt das Konstrukt zusätzlich in der mitgelieferten Demo-Area.

### Intern

- Neues Shared-Modul `inline-calc.js` (prozess-neutral, ohne Electron- und markdown.js-Abhängigkeit, damit renderer-bundle-tauglich): Marker-Scanner mit Escape- und String-Literal-Behandlung, kontext-freie Auswertung über die Query-Ausdrucks-Engine (`parseExpression`/`evaluateExpression`/`formatValue`, keine Änderung an der Engine), markdown-it-Inline-Regel mit Viewer- und Portable-Render-Zweig sowie der Portable-Export-Konverter. Live-Widget und Quelltext-Einfärbung im Renderer teilen sich denselben Spannen-Scanner mit der Render-Pipeline (Paritäts-Garantie). Die Syntax `{= … =}` wurde vorab empirisch gegen die bestehende Pipeline verifiziert (keine Kollision mit Critic Markup, markdown-it-attrs, Highlight, Nummerierungs- oder Kommentar-Markern).
- Neue Test-Substanz: die neue Unit-Suite `inline-calc.test.js` (Marker-Grammatik mit Grenzfällen, kontext-freie Auswertung inklusive Datums- und Dauer-Arithmetik, vier Fehler-Klassen, Render-Integration mit attrs-/Critic-Abgrenzung), eine Snapshot-Fixture, die erweiterte Portable-Export-Suite und die neue E2E-Suite `inline-berechnungen.spec.js` mit vier Tests (IB-01 bis IB-04: Render-Ergebnis mit Tooltip und Fehlerbild, Quelltext-Einfärbung, Live-Widget mit Cursor-Aufdecken und Klick ins Konstrukt, Erweiterung aus).

## [0.80.0.763] - 2026-07-18 — Tabellen-Kontextmenü

Epic 3E-0109 (Tabellen-Kontextmenü: Bearbeitungs-Funktionen für beide Tabellenarten) aus dem Ideen-Backlog vom 2026-07-15: Das Editor-Kontextmenü erhält ein Untermenü „Tabelle", das nur erscheint, wenn der Cursor in einer Tabelle steht, und einen einheitlichen Operationen-Satz für beide Tabellenarten anbietet — Spalten-Ausrichtung, Zeilen und Spalten verschieben, einfügen und löschen sowie Transponieren; alle Operationen sind Registry-Kommandos und damit auch über die Kommando-Palette erreichbar und mit Kürzeln belegbar. Umgesetzt in drei Umsetzungs-Tasks (4T-0589 bis 4T-0591) plus Hilfe- und Handbuch-Task (4T-0592).

### Neu

- **Untermenü „Tabelle" im Editor-Kontextmenü** (4T-0590): Neue Menü-Gruppe zwischen „Einfügen" und der Zwischenablage, sichtbar nur mit Cursor in einer Tabelle (außerhalb entfällt sie samt Trenner). Zwölf Operationen in vier Blöcken: Ausrichtung links/zentriert/rechts (mit Häkchen für die Ist-Ausrichtung der Cursor-Spalte), Zeile nach oben/unten verschieben, unterhalb einfügen und löschen, Spalte nach links/rechts verschieben, rechts einfügen und löschen, Transponieren. Jede Operation ist eine einzelne Editor-Transaktion und damit ein Undo-Schritt; der Cursor folgt seiner Zelle. Nicht mögliche Ziele erscheinen gedimmt (Kopf-/Trennzeile, Ränder, letzte Spalte); die Ausführung erkennt am Cursor-Kontext die Tabellenart und delegiert an das passende Backend (ein Operationen-Satz, zwei Backends — Architekturentscheidung des Epics). In der Kommando-Palette sind die zwölf `table`-Kommandos außerhalb von Tabellen gedimmt.
- **Pipe-Tabellen-Backend** (4T-0589): Neues Tabellen-Modell liest die ganze Tabelle am Cursor (Kopf, Ausrichtungs-Zeile, Datenzeilen) und schreibt nach jeder Operation formatiert zurück — Rand-Pipe-Form, Spalten mit Leerzeichen auf die längste Zelle ausgerichtet, Ausrichtungs-Marker in voller Spaltenbreite. Randlose Tabellen werden dabei bewusst auf die Rand-Pipe-Form normalisiert, eine fehlende Trenn-Zeile wird ergänzt, ungleiche Zellen-Anzahlen werden aufgefüllt; escapte Pipes bleiben erhalten. Kopf- und Trennzeile sind gegen Verschieben und Löschen geschützt, die letzte Spalte gegen Löschen (Statusbar-Hinweis bei Ausführung über Palette oder Kürzel); Transponieren macht die Kopfzeile zur ersten Spalte und setzt die Ausrichtungen zurück.
- **Perspective-Table-Backend** (4T-0591): Derselbe Operationen-Satz wirkt im `perspective-table`-Block. Zeilen-Operationen arbeiten auf den `|-`-Abschnitten und sind immer möglich — der Roh-Text der Zellen samt Attributen, Status-Klassen und mehrzeiligen Inhalten bleibt byte-genau erhalten. Spalten-Operationen und Transponieren bewegen ganze Zell-Blöcke und sind nur ohne `colspan`/`rowspan` verfügbar; mit Spans lehnt die Operation mit einem erklärenden Statusbar-Hinweis ab statt still falsch umzubauen (Architekturentscheidung des Epics). Die Ausrichtungs-Einträge setzen die Spalten-Default-Ausrichtung im `cols`-Attribut der `{|`-Zeile (Spalten ohne Vorgabe erhalten den Platzhalter `-`); `align`-Attribute einzelner Zellen bleiben unberührt.
- **Erweiterung „Tabellen-Werkzeuge"** (4T-0590): Das Untermenü samt der zwölf Kommandos ist als Werkzeug-Erweiterung schaltbar; im Aus-Zustand verschwinden Menü-Gruppe, Paletten-Einträge und Kürzel-Wirkung (Kommando-Filterung), der Tabellen-Editor-Komfort (Tab/Enter) bleibt unberührt.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0592): ein neuer Funktions-Katalog-Eintrag „Tabellen-Werkzeuge" (Abdeckungs-Matrix F-142) und zwölf Kommando-Beschreibungen (S-099 bis S-110); vier erweiterte Handbuch-Seiten in allen fünf Sprachen (Editor-Kontextmenü mit neuem Abschnitt „Untermenü Tabelle", Perspective Table mit neuem Abschnitt „Bearbeiten über das Kontextmenü", Verweis-Sätze in Markdown-Basis und Werkzeuge). 31 neue i18n-Keys pro Sprache (Untermenü-Titel, zwölf Kommando-Labels, zwölf Kürzel-Beschreibungen, Katalog-Trio, drei Statusbar-Hinweise); Demo-Area ohne Ergänzungsbedarf (keine neue Markdown-Syntax, die Demo-Datei „03 Tables" zeigt beide Tabellenarten).

### Intern

- Neues Shared-Modul `table-edit.js` (Pipe-Voll-Parser, reine Operationen, Serialisierer, High-Level-Einstieg); die reinen Text-Helfer der Pipe-Tabellen (`findUnescapedPipes`, `parseTableCells` u. a.) sind aus dem Editor-Modul dorthin gewandert und werden re-exportiert. Neues Shared-Modul `perspective-table-edit.js` (zeilenbasierter Struktur-Scan, Zell-Block-Operationen, `cols`-Schreiblogik); die reinen Syntax-Helfer der Perspective Table (Zell-Attribute, Status-Klassen, Header-Attribute) liegen jetzt im abhängigkeitsfreien Modul `perspective-table-syntax.js`, damit das Bearbeitungs-Modul sie ohne den Render-Bezug nutzen kann (Render-Verhalten unverändert). Neues Renderer-Modul `editor-table-tools.js` als Laufzeit-Backend (Kontext-Erkennung Pipe-Bereich bzw. Fence über den Syntaxbaum, eine Transaktion pro Operation).
- Neue Test-Substanz: 58 neue Unit-Tests (Pipe-Modell mit Round-Trip-Idempotenz und Kanten-Matrix, Perspective-Scan und -Operationen mit Span-Ablehnung, Erweiterungs-Kommando-Filterung) und die neue E2E-Suite `tabellen-kontextmenue.spec.js` mit sieben Tests (TK-01 bis TK-07: Sichtbarkeit und Dimmung, Zeile verschieben mit Ein-Schritt-Undo, Ausrichtung mit Häkchen, Erweiterung aus, Palette inklusive Dimmung, Perspective-Zeilen-Operation, Span-Ablehnung mit Hinweis).

## [0.79.0.756] - 2026-07-18 — Titelzeile

Epic 3E-0108 (Dateiname als Titelzeile: anzeigen und direkt umbenennen) aus dem Ideen-Backlog vom 2026-07-15: Über der ersten Dokument-Zeile steht der Dateiname ohne Endung als „Zeile 0" in Überschrift-Optik — ohne Zeilennummer, scroll-fest, in allen vier Ansichten — und lässt sich dort per Klick direkt überschreiben; das Bestätigen benennt die Datei über den bestehenden Umbenennen-Mechanismus um. Umgesetzt in zwei Umsetzungs-Tasks (4T-0585, 4T-0586) plus Hilfe- und Handbuch-Task (4T-0587).

### Neu

- **Titelzeile** (4T-0585): Pro Editor-Spalte erscheint der Dateiname ohne Endung als kompakte Titelzeile in Überschrift-1-Optik über dem Dokument — ohne Zeilennummer, scroll-fest (im Quelltext als fester Kopf über dem Editor, in der Lese-Ansicht haftend am oberen Rand der zentrierten Inhalts-Spalte) und in jedem Ansichts-Modus genau einmal (in der Geteilt-Ansicht über der Quelltext-Spalte). Unterseiten zeigen ihren vollen logischen Namen in Schrägstrich-Schreibweise, unbenannte Dokumente den Unbenannt-Platzhalter; Handbuch- und System-Seiten bleiben ohne Titelzeile, ebenso Fokus-Modus und PDF-Export. Tab-Wechsel, Öffnen, Speichern unter und externes Umbenennen aktualisieren den Titel automatisch; Zeilennummern, Historie, Suche und alle Text-Operationen bleiben unberührt (die Zeile ist kein Bestandteil des Editor-Texts).
- **Direkt-Umbenennen über die Titelzeile** (4T-0586): Ein Klick auf den Titel (oder Enter/F2 auf der fokussierten Zeile) macht ihn editierbar; Enter oder Fokusverlust bestätigt, Esc verwirft, unveränderter Text beendet still. Das Bestätigen benennt die Datei über den bestehenden gehärteten Umbenennen-Pfad um — Links werden gemäß der Einstellung „Links in anderen Dateien anpassen" aktualisiert, die Begleitdatei wandert mit, eine Seite mit Unterseiten nimmt ihren Unterseiten-Baum mit; ungespeicherte Änderungen werden vorab gespeichert, der Änderungs-Zustand des Tabs bleibt unberührt. Ungültige Namen und Namens-Kollisionen erscheinen als Hinweis direkt an der Titelzeile (kein Dialog), die Datei bleibt dann unverändert. Bei unbenannten Dokumenten stößt das Bestätigen „Speichern unter" mit dem eingegebenen Namen als Vorbelegung an; der Umbenennen-Dialog mit Vorschau und Bericht bleibt unverändert bestehen. Die Titelzeile ist unabhängig vom Edit-Modus editierbar — Umbenennen ist eine Datei-, keine Inhalts-Operation.
- **Erweiterung „Titelzeile"** (4T-0585): Die Zeile ist als Werkzeug-Erweiterung schaltbar; im Aus-Zustand verschwindet sie vollständig (bisheriges Bild ohne Titelzeile), Dateiname und Umbenennen bleiben über Tab-Titel, Fenster-Titel und den Dialog erreichbar.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0587): ein neuer Funktions-Katalog-Eintrag „Titelzeile" (Abdeckungs-Matrix F-141) und ein neuer Abschnitt „Titelzeile" auf der Handbuch-Seite „Werkzeuge" (Anzeige, Direkt-Umbenennen, Erweiterung) in allen fünf Sprachen. Fünf neue i18n-Keys pro Sprache (Katalog-Trio, zwei Tooltips); Demo-Area ohne Ergänzungsbedarf (keine neue Markdown-Syntax).

### Intern

- Titelzeile als eigenes DOM-Element außerhalb des CodeMirror-Dokuments (Architekturentscheidung des Epics; H1-Optik ist reines CSS), je Spalte eine Instanz nach dem data-host-Muster des Unterseiten-Breadcrumbs; Sichtbarkeits-Hook im zentralen Per-Pane-Sync (Muster Format-Toolbar). Namens-Kern `displayTitleFromBasename` als neue reine Funktion in `src/shared/subpages.js` (Endungs-Behandlung deckungsgleich mit dem Umbenennen-Fluss); die Umbenennen-Logik selbst ist unverändert und wird nur aufgerufen. „Speichern unter" akzeptiert eine optionale Dateinamens-Vorbelegung (Bereichs-Apps lösen sie gegen den Bereichs-Root auf).
- Neue Test-Substanz: vier neue Unit-Tests (Anzeige-Titel-Ableitung) und die neue E2E-Suite `titelzeile.spec.js` mit acht Tests (TZ-01 bis TZ-08: Sichtbarkeit je Ansichts-Modus mit genau einer Instanz, System-Tabs ohne Titelzeile, Erweiterung aus, Umbenennen mit Link-Update/Begleitdatei/Kaskade, Kollisions-Hinweis, Escape/Fokusverlust, Validierungs-Hinweis, Unbenannt-Platzhalter).

## [0.78.0.750] - 2026-07-17 — Format-Toolbar

Epic 3E-0114 (Format-Toolbar im Edit-Modus) aus dem Ideen-Backlog vom 2026-07-15: Oberhalb des Editors erscheint im Edit-Modus eine Schaltflächen-Leiste für die häufigen Bearbeitungs-Funktionen — Zeichen-Formate, Überschriften, Listen, Zitat, Links und Tabellen-Einfügen über ein Zeilen-mal-Spalten-Raster; außerhalb des Edit-Modus ist sie unsichtbar, die Belegung ist konfigurierbar. Umgesetzt in zwei Umsetzungs-Tasks (4T-0607, 4T-0608) plus Hilfe- und Handbuch-Task (4T-0609).

### Neu

- **Format-Toolbar** (4T-0607): Leiste pro Editor-Spalte oberhalb des Editors, sichtbar genau dann, wenn der aktive Tab im Edit-Modus steht und die Ansicht einen Editor zeigt (Quellcode-, Geteilt- und Live-Ansicht); in der Lese-Ansicht, auf Handbuch-/System-Seiten und im Fokus-Modus unsichtbar. Jede Schaltfläche löst ihr Registry-Kommando über den bestehenden Ausführungs-Pfad aus (dieselben Kommandos wie Kontextmenü, Kürzel und Palette); ein Klick in die Leiste der zweiten Spalte aktiviert diese zugleich. Kuratierte Standard-Belegung in Trenner-Gruppen: Fett, Kursiv, Durchgestrichen, Hervorheben, Code | Überschrift-Menü (Ebenen 1–6 plus „Keine Überschrift" als Dropdown mit Zustands-Häkchen) | Aufzählung, nummerierte Liste, Aufgaben-Liste | Zitat | Wiki-Link, externer Link | Tabelle. Gedrückte Schaltflächen zeigen den Zustand an der Cursor-Position (Absatz-Zustände über die Cursor-Zeile, Zeichen-Formate über die Selektion; gedrückt heißt: erneuter Klick entfernt das Format), Tooltips zeigen Kommando-Name und aktuell wirksames Kürzel. Bei schmalen Editor-Spalten wandern die hinteren Einträge in ein Mehr-Menü mit Icons, Zustands-Häkchen und Überschrift-Untermenü.
- **Tabellen-Raster-Picker** (4T-0608): Der Tabellen-Button öffnet ein 8×8-Hover-Raster nach Textverarbeitungs-Vorbild — Überstreichen markiert Zeilen mal Spalten mit Live-Beschriftung („3 × 4", Zeilen inklusive Kopfzeile), Klick fügt die leere Pipe-Tabelle am Cursor ein (Cursor in der ersten Kopfzelle, Rückgängig entfernt sie in einem Schritt). Der Picker öffnet auch aus dem Überlauf-Mehr-Menü; an allen anderen Zugängen (Kontextmenü, Palette, Kürzel) fügt das Tabellen-Kommando unverändert seine kompakte 2×2-Schablone ein.
- **Konfigurierbare Belegung** (4T-0608): Neuer Einstellungs-Bereich „Format-Toolbar" pflegt die Belegung als Liste — Einträge umsortieren, bearbeiten, entfernen; neue Kommandos über den Drei-Schritt-Dialog der Kommando-Platzierung (Kommando-Filter-Suche, Icon aus dem kuratierten Set, optionaler Anzeigename); Trenner und das Überschrift-Menü als eigene Eintrags-Typen (Überschrift-Menü höchstens einmal); „Auf Standard zurücksetzen". Änderungen wirken nach Anwenden sofort in allen Fenstern und überleben den Neustart; Einträge deaktivierter Erweiterungen erscheinen nicht in der Leiste, bleiben aber konfiguriert.
- **Erweiterung „Format-Toolbar"** (4T-0607): Die Leiste ist als Werkzeug-Erweiterung schaltbar; im Aus-Zustand verschwindet sie vollständig (heutiges Bild ohne Leiste) und der Einstellungs-Bereich ist ausgeblendet, die Belegungs-Konfiguration bleibt gespeichert.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0609): ein neuer Funktions-Katalog-Eintrag „Format-Toolbar" (Abdeckungs-Matrix F-140) und die neue Handbuch-Seite „Format-Toolbar" in allen fünf Sprachen (Sichtbarkeit, Standard-Belegung mit Zustands-Anzeige, Überschrift-Menü, Tabellen-Raster, Überlauf, Belegungs-Pflege, Abgrenzung zu Statusbar-Buttons und Kommando-Palette, Aus-Zustand) samt Überblicks-Link. 17 neue i18n-Keys pro Sprache (Katalog-Trio, Leisten-Texte, Einstellungs-Bereich, Dialog-Titel, Seiten-Titel); Demo-Area ohne Ergänzungsbedarf (keine neue Markdown-Syntax).

### Intern

- Nachnutzung des Eintrag-Datenmodells der Kommando-Platzierung (`normalizePlacementEntry`): eigenes Shared-Modell `src/shared/format-toolbar.js` mit den Spezial-Typen Trenner und Überschrift-Menü, defensiver Normalisierung (defekte Konfiguration fällt auf die Standard-Belegung zurück, bewusst leere Liste bleibt leer) und Sichtbarkeits-Kern; Persistenz unter dem Store-Key `formatToolbar` mit Multi-Window-Broadcast (Muster `commandPlacement`). Elf neue Format-Icons im kuratierten Icon-Set (auch in den Anlage-Dialogen der Kommando-Platzierung wählbar).
- Neue reine Kerne in `markdown-format.js`: `detectInlineFormats` (aktive Zeichen-Formate an der Selektion, deckungsgleich zur Toggle-Wirkung; DRY-Refactoring der Marker-Erkennung aus `applyInlineFormat`) und `pipeTableTemplate`/`insertTableOfSize` (Raster-Geometrie; die 2×2-Schablone des Tabellen-Kommandos delegiert an dieselbe Quelle).
- Neue Test-Substanz: 20 neue Unit-Tests (Belegungs-Modell mit Registry-/Icon-Wächter, Inline-Format-Zustand, Raster-Geometrie inklusive Ein-Schritt-Undo-Wächter) und die neue E2E-Suite `format-toolbar.spec.js` mit neun Tests (FT-01 bis FT-09: Sichtbarkeit je Modus/Edit-Zustand, Format-Kommando mit Gedrückt-Zustand, Absatz-Zustand, Überschrift-Menü, Überlauf, Erweiterung aus, Raster-Picker, Belegungs-Pflege, Persistenz); ES-05 auf 16 Navigations-Einträge.

## [0.77.0.744] - 2026-07-17 — Sidebar-Varianten

Epic 3E-0119 (Sidebar-Varianten: benannte Sidebar-Anordnungen global und je Bereich) aus dem Ideen-Backlog vom 2026-07-15: Die Sidebar-Anordnung lässt sich beliebig oft als benannte Variante speichern und wechseln — global im Einstellungs-Store und bereichsgebunden in der Bereichsdatei, mit Verwaltungs-Zugang in den Einstellungen und einem Untermenü im Ansichtsmenü. Umgesetzt in drei Umsetzungs-Tasks (4T-0624 bis 4T-0626) plus Hilfe- und Handbuch-Task (4T-0627) und einem Bugfix-Task (4T-0634).

### Neu

- **Sidebar-Varianten** (4T-0624): Die aktuelle Sidebar-Anordnung lässt sich als benannte Variante speichern — samt der Panel-Sichtbarkeit beider Spalten, also dem kompletten Aufbau (PO-Entscheidung). Anwenden ersetzt die aktuelle Anordnung sofort; spätere Umbauten ändern die Variante nicht, „Überschreiben" ist der explizite Rückweg. Die Verwaltung (Anwenden, Umbenennen, Überschreiben, Löschen plus „Aktuelle Anordnung als Variante speichern …") liegt im Einstellungs-Bereich „Sidebar", Abschnitt Varianten, und wirkt sofort. Zwei neue Registry-Kommandos: „Aktuelle Anordnung speichern …" (Namens-Dialog; Speichern unter vorhandenem Namen aktualisiert diese Variante) und „Sidebar-Variante anwenden …" (filterbares Auswahl-Popup); beide ohne Standard-Kürzel belegbar. Alte Varianten überleben Panel-Zu- und -Abgänge: das Anwenden normalisiert gegen die aktuelle Panel-Menge, kein Panel geht verloren.
- **Bereichs-Varianten** (4T-0625): Varianten mit Ablage in der Bereichsdatei des geöffneten Bereichs (neue Sektion nach dem etablierten Muster; fremde Sektionen bleiben beim Schreiben erhalten, eine defekte Bereichsdatei wird nie überschrieben). Sie wandern mit dem Bereichs-Ordner und erscheinen nur bei geöffnetem Bereich; ihre Verwaltung samt eigenem Speichern-Knopf liegt in der eigenen Einstellungs-Sektion „Sidebar-Varianten" der Navigations-Gruppe „Aktueller Bereich", in Auswahl-Popup und Menü sind sie als eigene Gruppe „Bereich <Name>" von den globalen Varianten getrennt; Namens-Kollisionen zwischen beiden Geltungsbereichen sind erlaubt. Beim Speichern über Menü oder Kommando wählt eine Option im Dialog das Ziel (global oder Bereich); mehrere Fenster desselben Bereichs sehen Änderungen sofort konsistent.
- **Ansichtsmenü-Untermenü „Sidebar-Anordnungen"** (4T-0626): Neues Untermenü direkt beim Panel-Untermenü mit „Standard-Anordnung" (stellt die mitgelieferte Verteilung wieder her — erstmals auch außerhalb der Einstellungen erreichbar), den globalen Varianten, der Bereichs-Gruppe (nur bei geöffnetem Bereich, Gruppen-Kopf mit Bereichs-Namen) und „Aktuelle Anordnung speichern …". Klick wendet die Variante an; Varianten-Änderungen und Bereichs-Wechsel aktualisieren das Menü ohne Neustart.

### Behoben

- **Panel-Höhen-Resize folgt der Maus** (4T-0634, PO-Befund): Beim Ziehen des Höhen-Griffs folgte das Panel der Maus nicht 1:1 (der Flex-Algorithmus staucht fixierte Höhen bei voller Sidebar zurück), und Nachbar-Panels änderten ihre Höhe mit. Jetzt gelten fixierte Höhen exakt, beim Drag-Start werden die übrigen sichtbaren Blöcke der Seite auf ihrer Ist-Höhe eingefroren: nur das gezogene Panel folgt der Maus, die Nachbarn bleiben stehen. Übersteigt die Höhen-Summe den Platz, kappt die Sidebar unten; Verkleinern oder der Doppelklick-Reset (unverändert: automatische Höhe) holt die Blöcke zurück.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0627): ein neuer Funktions-Katalog-Eintrag „Sidebar-Varianten" (Abdeckungs-Matrix F-139) und zwei Kommando-Beschreibungen (S-097/S-098); die Handbuch-Seite „Sidebar" erhält das Kapitel „Varianten" (Speichern, Anwenden, Verwalten, Bereichs-Varianten, Menü-Zugang, Abgrenzung zu den Arbeitsbereichen) in allen fünf Sprachen. 30 neue i18n-Keys pro Sprache (Einstellungs-Abschnitt und Bereichs-Sektion, Dialoge, Auswahl-Popup, Menü-Einträge, Kommando-Labels, Katalog).

### Intern

- Erweiterungs-Prüfschritt (Architekturentscheidung des Epics): Kern statt Erweiterung — die Varianten verwalten den Kern-Zustand Sidebar-Layout, analog zur Kern-Entscheidung bei den Farbschemas. Geteiltes Datenmodell mit defensiver Struktur-Sanitisierung in `src/shared/sidebar-variants.js` (prozess-neutral; unbekannte Panel-IDs bleiben im Snapshot erhalten, erst das Anwenden normalisiert); globale Liste unter `sidebar.layoutVariants` mit Multi-Window-Broadcast, Bereichs-Liste als mdda-Sektion `sidebarLayouts` mit get/set-Handlern nach dem Profil-Muster; Menü über den bestehenden Meldeweg (neues Menü-State-Feld mit Provider-Injektion gegen Modul-Zyklen); Roh-Sichtbarkeits-Zugriff `panelRawVisible` auf Spalten-Parameter verallgemeinert.
- Neue Test-Substanz: 14 neue Unit-Tests (Varianten-Sanitisierung, mdda-Sektions-Roundtrip, Menü-State-Normalisierung) und die neue E2E-Spec `sidebar-varianten.spec.js` mit fünf Tests (SV-01 bis SV-05: Speichern/Anwenden inkl. Sichtbarkeit, Lebenszyklus mit Namens-Validierung, Normalisierung alter Varianten und Neustart, Bereichsdatei mit Sektions-Erhalt, Ansichtsmenü per setMenu-Interceptor) plus Regressionstest SL-11 zum Höhen-Resize (vor dem Fix nachweislich rot).

## [0.76.0.735] - 2026-07-17 — Kommando-Platzierung

Epic 3E-0094 (Kommando-Platzierung: konfigurierbare Kommando-Zugänge und Makros) aus dem Ideen-Programm 2026-07 (I-23, Konzept-Workshop vom 2026-07-10): Kommandos aus der zentralen Registry lassen sich als dauerhafte eigene Zugänge platzieren — Statusbar-Buttons, eine Ausblende-Liste für Standard-Buttons, eine nutzerdefinierte Kontextmenü-Sektion und Makros als Kommando-Sequenzen, gebündelt in der schaltbaren Erweiterung „Kommando-Platzierung". Umgesetzt in drei Umsetzungs-Tasks (4T-0520 bis 4T-0522) plus Hilfe- und Handbuch-Task (4T-0523).

### Neu

- **Statusbar-Kommando-Buttons** (4T-0520): Eigene Buttons erscheinen als eigenes Segment in der Statusleiste; die Anlage läuft im Drei-Schritt-Flow (Kommando per Filter-Suche, Icon aus einem kuratierten internen Set mit 30 Symbolen, optionaler Anzeigename). Der Tooltip zeigt Anzeigename plus Original-Kommando; Umordnen, Bearbeiten und Entfernen laufen über den neuen Einstellungs-Bereich „Kommando-Platzierung". Bei Platzmangel wandern überzählige Buttons von rechts in ein Mehr-Menü am Segment-Ende (automatisch bei Fenster-Verkleinerung nachgeführt).
- **Standard-Buttons ausblendbar** (4T-0520): Jedes Standard-Element der Statusleiste (Panel-Schalter, Editor-Schalter, Ansichts-Buttons, rechte Seite) lässt sich einzeln über die Render-Logik ausblenden — nur die Hinweis-Zeile bleibt als einziger Warn-Kanal immer sichtbar. Ausgeblendete Funktionen bleiben über Menü, Kommandos und Kürzel erreichbar; ein Zurücksetzen-Knopf stellt die Standard-Statusleiste wieder her.
- **Nutzerdefinierte Kontextmenü-Sektion** (4T-0521): Eigene Kommando-Einträge (gleiches Eintrag-Modell wie die Buttons, eigene Reihenfolge) erscheinen als Sektion am Ende des Editor-Kontextmenüs in Quelltext- und Live-Modus, mit Icon und Anzeigename. Im aktuellen Kontext nicht ausführbare Einträge sind deaktiviert statt versteckt; die Sektion gilt für den Haupt-Editor, das Notiz-Feld bleibt unverändert.
- **Makros** (4T-0522): Kommando-Sequenzen mit Name, Icon und geordneten Schritten — „Kommando ausführen" und „Verzögerung" (null bis zehn Sekunden) —, strikt sequenziell ausgeführt. Ein fehlschlagender oder im Kontext nicht ausführbarer Schritt bricht mit einem Statusbar-Hinweis (Makro-Name, Schritt-Nummer) ab; Makro-in-Makro ist mit begrenzter Aufruf-Kette möglich, Auto-Start gibt es bewusst nicht. Jedes Makro ist als reguläres Kommando registriert und damit ohne Sonderbehandlung in der Kommando-Palette findbar, mit einem Kürzel belegbar und selbst platzierbar; der Schritt-Editor mit Testlauf-Knopf liegt im gemeinsamen Einstellungs-Bereich.
- **Erweiterung „Kommando-Platzierung"** (4T-0520): Alle vier Funktionen bündeln sich in einer schaltbaren Werkzeug-Erweiterung mit gemeinsamem Einstellungs-Bereich (Statusbar-Liste, Kontextmenü-Liste, Makro-Editor, Ausblende-Liste). Im Aus-Zustand zeigt die App die Standard-Statusleiste ohne eigene Zugänge, die Makro-Kommandos sind abgemeldet; die Konfiguration bleibt gespeichert und kehrt mit dem Einschalten zurück.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0523): vier neue Funktions-Katalog-Einträge (Statusbar-Kommando-Buttons, Statusbar-Ausblende-Liste, Eigene Kontextmenü-Einträge, Makros; Abdeckungs-Matrix F-135 bis F-138) und die neue Handbuch-Seite „Kommando-Platzierung" in allen fünf Sprachen (Statusbar-Buttons, Ausblenden, Kontextmenü, Makros, Abgrenzung zur Kommando-Palette, Aus-Zustand); die Werkzeuge-Seite verweist im Palette-Abschnitt umgekehrt auf die neue Seite. 53 neue i18n-Keys pro Sprache (Erweiterung, Einstellungs-Bereich, Dialoge, Abbruch-Hinweise, Katalog, Seiten-Titel).

### Intern

- Gemeinsames Eintrag-Datenmodell (Kommando-ID, Icon, Anzeigename; Reihenfolge als Listen-Position) mit defensiver Normalisierung in `src/shared/command-placement.js`, Multi-Window-Broadcast nach dem Muster der Panel-Reihenfolge; kuratiertes Icon-Set als prozess-neutrales Modul; Makro-Ausführungs-Kern als reine, injizierbar getestete Funktion (`src/shared/macro-runner.js`); die dynamische Kommando-Registrierung akzeptiert neben `ext.` jetzt den Makro-Namensraum `macro.`.
- Neue Test-Substanz: 32 neue Unit-Tests (Datenmodell-Normalisierung, Hide-Ziel-Wächter gegen `index.html`/Katalog, Sichtbarkeits-Kern der Kontextmenü-Sektion, Makro-Runner inkl. Rekursions-Schutz, `macro.`-Namensraum, Erweiterungs-Registrierung) und die neue E2E-Spec `kommando-platzierung.spec.js` mit neun Tests (KP-01 bis KP-09: Button-Ausführung, Drei-Schritt-Anlage, Hide/Reset, Überlauf-Mehr-Menü, Aus-Zustand, Kontextmenü-Sektion inkl. Live-Modus, Makro-Ausführung mit Abbruch, Makro-Editor mit Testlauf und Palette-Findbarkeit); ES-05 auf 15 Navigations-Einträge gehoben.

## [0.75.0.728] - 2026-07-17 — Editor-Ansicht pro Dokument

Epic 3E-0105 (Voreinstellung der Editor-Ansicht-Schalter) aus dem PO-Auftrag vom 2026-07-13: Die drei Editor-Ansicht-Schalter (Gliederung, Zeilennummern, Zeilenumbruch) werden dokument-gebunden im YAML-Frontmatter gespeichert und reisen mit der Datei; eine globale Voreinstellung legt den Standard für Dateien ohne eigene Angabe fest. Umgesetzt im Umsetzungs-Task 4T-0572 plus Hilfe- und Handbuch-Task 4T-0573.

### Neu

- **Editor-Ansicht pro Dokument im Frontmatter** (4T-0572): Die drei Schalter werden über die Frontmatter-Schlüssel `fold-gutter`, `line-numbers` und `word-wrap` pro Dokument gespeichert (nur echtes `true`/`false` wirkt) und bleiben damit beim Kopieren oder Öffnen auf einem anderen Rechner erhalten. Das Umschalten über Statusbar oder Ansichtsmenü schreibt den neuen Wert direkt in das Frontmatter der aktiven Datei und macht sie änderungsbedürftig (bewusste PO-Entscheidung, „Weg A", konsistent zum Frontmatter-Schalter der Überschriften-Nummerierung); frontmatter-lose Dokumente erhalten dabei einen Block. Sonderfälle: In Handbuch-Tabs, bei fehlenden Dateien und bei fehlerhaftem YAML (Statusbar-Hinweis) wirkt der Schalter flüchtig für die Sitzung; in Unbenannt-Tabs ebenfalls, beim ersten Speichern werden von der Voreinstellung abweichende Werte ins Frontmatter der neuen Datei übernommen.
- **Globale Voreinstellung der Editor-Ansicht** (4T-0572): Drei neue Schalter im Einstellungs-Bereich „Darstellung" (Gliederung, Zeilennummern, Zeilenumbruch) legen den Standard für Dokumente ohne Frontmatter-Angabe fest; Auflösung in der Reihenfolge Frontmatter vor Voreinstellung vor eingebautem Standard. Die Startwerte entsprechen dem bisherigen Verhalten (Gliederung an, Zeilennummern an, Umbruch aus); die Voreinstellung wirkt beim Öffnen bzw. Erstellen von Tabs.

### Geändert

- **Pfad-basierte Ansichts-Persistenz abgelöst** (4T-0572): Die frühere Speicherung der drei Schalter pro Datei-Pfad im App-Settings-Store (`app.fileSettings`, gedeckelt auf 500 Einträge, nicht portabel) ist ersatzlos entfernt; bestehende Einträge werden beim Start gelöscht, nicht konvertiert (PO-Entscheidung — eine Konvertierung würde ungefragt fremde Dateien ändern). Ohne aktiven Tab zeigen Statusbar-Buttons und Menü-Häkchen jetzt die globale Voreinstellung statt hartkodierter Standardwerte.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0573): ein neuer Funktions-Katalog-Eintrag „Editor-Ansicht pro Dokument" (Abdeckungs-Matrix F-134) und drei neue Kommando-Einträge für die bisher beschreibungslosen Toggle-Kommandos (S-094 bis S-096, ohne Default-Kürzel über Einstellungen belegbar); der Katalog-Text des Gliederungs-Foldings ist von „pro Tab" auf „pro Dokument" umgestellt. Die Handbuch-Seite „Frontmatter und Properties" erhält die neue Sektion „Editor-Ansicht pro Dokument" (Schlüssel, Ebenen-Auflösung, Änderungs-Verhalten beim Umschalten, Sonderfälle) in allen fünf Sprachen; die Demo-Seite „Properties and Profiles" zeigt die Schlüssel als Beispiel. Zehn neue i18n-Keys pro Sprache (drei Einstellungs-Labels, ein Statusbar-Hinweis, drei Katalog- und drei Kürzel-Texte).

### Intern

- Erweiterungs-Prüfschritt (im Hilfe-Task dokumentiert): Kern-Funktion des Editors, kein Erweiterungs-Schalter (Architekturentscheidung des Epics); Demo-Area-Prüfschritt: Beispiel-Sektion ohne Live-Schlüssel ergänzt, damit sich Demo-Dateien beim Öffnen nicht unerwartet anders verhalten.
- Neue Test-Substanz: 13 neue Unit-Tests (`editor-ansicht-voreinstellung.test.js`: Ebenen-Auflösung inkl. Nicht-Boolean- und Parse-Fehler-Fällen, Frontmatter-Schreiben mit Schlüssel-Erhalt, Idempotenz und CRLF-Schutz); FA-02 um den Weg-A-Nachweis erweitert plus neuer E2E-Test „Frontmatter-Schlüssel steuern die Editor-Ansicht beim Öffnen" mit eigener Fixture; der obsolete Test der abgelösten Pfad-Persistenz (R4-13) entfiel.

## [0.74.0.723] - 2026-07-17 — Panel-Zugänge

Epic 3E-0104 (Panel-Zugänge in Menü und Statusbar vereinheitlichen) aus dem PO-Auftrag vom 2026-07-13: Die Ein-/Ausblende-Zugänge aller 13 Sidebar-Panels erscheinen an beiden Bedienorten deckungsgleich — als Untermenü im Ansichtsmenü und als Button-Leiste in der Statusbar, beide in identischer, frei einstellbarer Reihenfolge. Umgesetzt in drei Umsetzungs-Tasks (4T-0567 bis 4T-0569) plus Hilfe- und Handbuch-Task (4T-0570).

### Neu

- **Panel-Untermenü im Ansichtsmenü** (4T-0568): Die bisher elf einzeln gelisteten Panel-Toggles sind durch das Untermenü „Panels" mit allen 13 Panels ersetzt; das Ansichtsmenü wird dadurch deutlich kürzer. Bereich und Kalender erscheinen erstmals im Menü, Häkchen-Zustände und Kürzel bleiben erhalten, deaktivierte Erweiterungs-Panels entfallen wie bisher. Die Editor-Toggles (Gliederung, Zeilennummern, Zeilenumbruch) bleiben unverändert im Hauptmenü.
- **Statusbar-Buttons für Unterseiten und Datei-Graph** (4T-0567): Die zwei bisher button-losen Panels haben eigene Statusbar-Buttons; Bereich und Kalender erhalten Registry-Kommandos und sind damit auch über die Kommando-Palette und ein belegbares Kürzel erreichbar. Jedes der 13 Panels hat jetzt beide Zugänge.
- **Einstellungs-Bereich „Panel-Reihenfolge"** (4T-0569): Die gemeinsame Reihenfolge der Panel-Zugänge ist über Hoch/Runter-Schaltflächen frei sortierbar (Zurücksetzen-Knopf inklusive) und wirkt gleichzeitig auf Untermenü und Statusbar-Leiste, sofort in allen Fenstern und über Neustarts hinweg. Auslieferungs-Reihenfolge ist die thematisch gruppierte Sidebar-Standard-Anordnung.

### Geändert

- **Statusbar-Leiste dynamisch angeordnet** (4T-0568): Die Panel-Buttons folgen der eingestellten Reihenfolge statt einer festen DOM-Reihenfolge; die Editor-Toggles bleiben als eigenes Segment am Ende. Menü und Statusbar lesen dieselbe Reihenfolge-Quelle (neues prozess-neutrales Panel-Zugangs-Modell in `src/shared/`).

### Behoben

- **Vier Menü-Häkchen waren dauerhaft leer** (4T-0568): Die Häkchen von Notizen, Block-Eigenschaften, Datei-Graph und Erinnerungen im Ansichtsmenü spiegelten den Panel-Zustand nie (die Flags fielen bei der Menü-State-Normalisierung unter den Tisch); mit der Umstellung auf die gemeldete Panel-Liste zeigen alle 13 Häkchen den echten Zustand.
- **Unterseiten-Zugang ignorierte die Erweiterung** (4T-0567): Menüeintrag und Palette boten Unterseiten auch bei deaktivierter Vernetzungs-Erweiterung an, obwohl das Panel gesperrt war; das Zugangs-Gate deckt sich jetzt mit der Panel-Sichtbarkeit.
- **Toter Erinnerungen-Button** (4T-0568): Bei deaktivierter Erinnerungs-Erweiterung blieb der Statusbar-Button als einziges gebundenes Element sichtbar; er folgt jetzt dem Erweiterungs-Gate wie alle anderen.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0570): ein neuer Funktions-Katalog-Eintrag „Reihenfolge der Panel-Zugänge" (Abdeckungs-Matrix F-133) und zwei neue Kommando-Einträge (Bereichs-/Kalender-Panel, S-092/S-093); die 13 Panel-Zugangstexte des Katalogs nennen den neuen Untermenü-Pfad. Sieben Handbuch-Seiten in allen fünf Sprachen umgestellt (Sidebar-Seite inklusive einstellbarer Reihenfolge; Bereich, Notizen, Block-Eigenschaften, Datei-Graph, Erinnerungen, Unterseiten mit ihren neuen Zugängen). 16 neue i18n-Keys pro Sprache (Untermenü-Titel, Button-Tooltips, Einstellungs-Bereich, Katalog- und Kürzel-Texte).

### Intern

- Neues prozess-neutrales Panel-Zugangs-Modell `src/shared/panel-access.js` als Single Source of Truth (IDs, Titel, Button, Kommando, Erweiterungs-Gate, Default-Reihenfolge) samt Reihenfolge-Normalisierung; Renderer meldet dem Main die geordnete Panel-Liste, der Main baut daraus das Untermenü.
- Paritäts-Konvention für Sidebar-Panels in CLAUDE.md verankert und durch den Wächter `test/unit/panel-access.test.js` technisch erzwungen (Button und Kommando-Zugang pro Panel, ID-Deckung mit der Renderer-Registry, Gate-Deckung mit den Erweiterungs-Kommandolisten).
- Erweiterungs-Prüfschritt (im Hilfe-Task dokumentiert): Die Zugangs-Vereinheitlichung ist Kern (Bedien-Grundgerüst), keine schaltbare Erweiterung; die Erweiterungs-Gates der einzelnen Panels bleiben bestehen. Demo-Area-Prüfschritt: keine Ergänzung nötig (reines Bedien-Thema).
- Neue Test-Substanz: 13 neue Unit-Tests (Paritäts-Wächter, Reihenfolge-Normalisierung, Menü-State-Panel-Liste), neue E2E-Suite `panel-zugänge.spec.js` (PZ-01 bis PZ-05: Untermenü-Struktur per setMenu-Interceptor, Statusbar-Reihenfolge, zentraler Toggle-Kanal, Erweiterungs-Gate an beiden Orten, Sortier-UI mit Persistenz); ES-05 auf die neue Einstellungs-Sektion nachgezogen.

## [0.73.0.714] - 2026-07-16 — Oberflächen-Bündel

Epic 3E-0102 (Oberflächen-Bündel: Sidebar-Anordnung, Titelleisten-Farbe, Gruppen-Öffnen, Demo-Bereich) aus PO-Aufträgen vom 2026-07-12 und 2026-07-16: vier Oberflächen- und Einstiegs-Verbesserungen als Sammel-Release. Umgesetzt in vier Umsetzungs-Tasks (4T-0563, 4T-0630 bis 4T-0632) plus Hilfe- und Handbuch-Task (4T-0564) und einem Bugfix aus der Release-Test-Iteration (4T-0633).

### Neu

- **Titelleisten-Farbe der Arbeitsbereiche** (4T-0630): Fenster eines geöffneten Arbeitsbereichs tragen dessen Paletten-Farbe in der nativen Fenster-Titelleiste, im hellen Theme kräftig, im dunklen pastellig, jeweils mit lesbarer Titel-Textfarbe. Die Färbung folgt dem vollen Lebenszyklus (Öffnen inklusive Sitzungs-Restore ohne Nachflackern, Farbwechsel in der Verwaltung, Löschen bzw. Degradieren, Theme-Wechsel, „Tab in neues Fenster") und entfällt mit dem Ausschalten der Erweiterung „Arbeitsbereiche". Technisch über die Windows-11-DWM-Fenster-Attribute per Direkt-Aufruf; auf Systemen ohne diese Attribute bleibt die Standard-Titelleiste (stiller Fallback, höchstens ein Log-Eintrag).
- **Folge-Dateien in der Tab-Gruppe** (4T-0631): Öffnet ein Klick im Inhalt eines gruppierten Dokuments eine weitere Datei (Wiki-/Datei-Links samt Alias-Auflösung, Abfrage-Treffer, Aufgaben-Bearbeiten, Ereignis-Zeilen und Verknüpfungs-Popup, Embed-Kopf-Link, Journal-Navigations-Block — in Render- und Live-Modus), tritt der neue Tab am Gruppen-Ende derselben Gruppe bei und wird aktiviert. Öffnungen außerhalb des Dokument-Inhalts (Datei-Liste, Panels, Lesezeichen, Palette, Dialoge, Kalender-Panel, Journal-Kommandos) bleiben ungruppiert; bereits offene Ziel-Dateien werden wie bisher nur aktiviert. Umgesetzt als explizites Erbe-Flag der Aufrufer statt einer Pauschal-Heuristik.
- **Demo-Area** (4T-0632): „Datei → Demo-Area erstellen…" (auch als Palette-Kommando) kopiert eine mitgelieferte, ausschließlich englischsprachige Beispiel-Sammlung in einen leeren Ordner und öffnet ihn direkt als Bereich: zwölf selbst-demonstrierende Markdown-Seiten (Grundlagen, erweiterte Syntax, Tabellen, Vernetzung, Properties, Aufgaben/Erinnerungen, Ereignisse/Journale, Abfragen mit echten Treffern über den Demo-Bestand, Diagramme/Formeln, Anlagen, Vorlagen), eine Beispiel-Vorlage sowie Bild- und PDF-Anlage. Nicht-leere Zielordner werden mit Hinweis abgelehnt, es wird niemals überschrieben. Sprachumfang und Name „Demo-Area" sind PO-Entscheidungen vom 2026-07-16.

### Geändert

- **Standard-Anordnung der Sidebar** (4T-0563): Der Standard-Ausgangszustand ist nicht mehr „alle Panels links, keine Gruppen", sondern die vom PO vorgegebene Verteilung auf beide Seiten mit thematischen Reiter-Gruppen: links Lesezeichen+Bereich, Inhaltsverzeichnis+Unterseiten+Datei-Graph und Kalender+Erinnerungen, rechts Notizen (einzeln), Properties+Tags+Block-Eigenschaften und Outgoing-Links+Backlinks. Gilt für die frische Installation und „Auf Standard-Anordnung zurücksetzen"; bestehende gespeicherte Layouts bleiben unangetastet. Das Unterseiten-Panel ist dabei in die kanonische Panel-Reihenfolge aufgenommen (fehlte zuvor); nicht in der Struktur genannte Erweiterungs-Panels werden weiterhin robust links angehängt.

### Behoben

- **Arbeitsbereichs-Dialog: „Umbenennen und Farbe…" war verdeckt** (4T-0633, PO-Befund der Release-Test-Iteration, Defekt seit der Einführung des Verwaltungs-Dialogs): Der aus „Arbeitsbereiche verwalten…" geöffnete Namens-und-Farb-Dialog erschien unter dem Verwaltungs-Dialog (gleiche Stapel-Ebene, späterer DOM-Knoten gewann) und war erst nach dessen Schließen erreichbar; er liegt jetzt als Zweit-Ebenen-Dialog immer oben. Mit Regressionstest (WS-06).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0564): ein neuer Funktions-Katalog-Eintrag (Demo-Area, Abdeckungs-Matrix F-132, samt Kommando-Eintrag S-091) und drei erweiterte Katalog-Texte (Arbeitsbereiche, Tab-Gruppen, Sidebar-Anordnung); die Handbuch-Seite „Applikationen, Fenster und Bereiche" beschreibt Titelleisten-Farbe, Folge-Dateien und Demo-Area, die Sidebar-Seite die neue Standard-Anordnung (die veraltete harte Panel-Aufzählung ist durch eine neutrale Formulierung ersetzt). Acht neue i18n-Keys pro Sprache (Demo-Area: Menü, Dialog, Hinweis, Katalog), alles in allen fünf Sprachfassungen.

### Intern

- Erweiterungs-Prüfschritt (im Epic): Die Demo-Area ist als schaltbare Erweiterung `demo-area` registriert (im Aus-Zustand entfallen Menüpunkt und Palette-Kommando; erstellte Demo-Ordner sind gewöhnliche Bereiche und bleiben unberührt). Die Titelleisten-Färbung gehört zur bestehenden Erweiterung „Arbeitsbereiche", das Gruppen-Öffnen zum Kern der Tab-Gruppen, die Sidebar-Standard-Anordnung ist reiner Ausgangszustand.
- Neue Runtime-Dependency **koffi** (FFI-Aufruf der DWM-Fenster-Attribute ohne C++-Toolchain; Begründung nach Dependency-Politik als Epic-Architekturentscheidung); Packaging mit asar-Entpackung des win32-x64-Prebuilds und files-Filter gegen die Nicht-Laufzeit-Bestandteile. Neues electron-freies Main-Modul `caption-color.js`; die geteilte Tab-Gruppen-Palette führt jetzt auch Dark- und Text-Farbwerte als Main-lesbare Konstanten.
- Neuer verbindlicher CLAUDE.md-Prüfschritt „Demo-Area" pro Epic mit nutzersichtbaren Funktionen; technisch abgesichert durch den Manifest-Wächter (Datei-Manifest gegen den realen Demo-Bestand).
- Neue Test-Substanz: 31 neue Unit-Tests (Titelleisten-Farb-Logik mit injiziertem FFI-Fake und Paletten-Vollständigkeit, Gruppen-Einfüge-Helfer, Demo-Manifest und Erstell-Logik, Erweiterungs-Filter), neue E2E-Suite `demo-area.spec.js` (DA-01 bis DA-05) und vier neue Tab-Gruppen-Fälle (TG-09 bis TG-12); die Sidebar-Suiten (SL-01/07/08, ES-10) sind semantisch auf den neuen Standard umgestellt, eine Regressions-Spec seitenneutral nachgezogen.

## [0.72.0.706] - 2026-07-16 — Einstellungs-Seite

Epic 3E-0100 (Einstellungs-Seite: Speicher-Status und Bereichs-Gliederung) aus zwei Ideen-Backlog-Einträgen des PO vom 2026-07-11 und 2026-07-12 (Tages-Ideen). Zwei Bedienbarkeits-Verbesserungen der Einstellungs-Seite: Die Schaltflächen „Anwenden" und „OK" zeigen über ihre Hervorhebung, ob es ungesicherte Änderungen gibt, und die bisher flache Bereichs-Navigation gliedert sich in app-weite und bereichsgebundene Sektionen. Umgesetzt in zwei Umsetzungs-Tasks (4T-0554, 4T-0555) plus Hilfe- und Handbuch-Task (4T-0556).

### Geändert

- **Speicher-Status der Schaltflächen** (4T-0554): „Anwenden" und „OK" tragen die blaue Primary-Hervorhebung nur noch bei ungesicherten Änderungen; ohne Änderungen ist „Anwenden" deaktiviert, „OK" bleibt immer klickbar und schließt die Seite. Die Erkennung ist bereichsübergreifend: Jeder Einstellungs-Bereich meldet über einen neuen dirty-Hook der Bereichs-Registry, ob ein Anwenden etwas persistieren würde; Vergleichs-Basis sind die vorhandenen pro-Bereich-Snapshots bzw. der Laufzeit-Zustand. Der Status aktualisiert sich live bei jeder Wert-Änderung, auch aus Picker-Popups und OS-Ordner-Dialogen; nach Anwenden ist der gespeicherte Stand der neue Referenzpunkt.
- **Zwei-Gruppen-Navigation der Bereiche** (4T-0555): Die bisher flache Bereichs-Navigation gliedert sich in zwei Gruppen mit Überschriften: „Allgemein" (app-weit gültig) und „Aktueller Bereich" (nur bei geöffnetem Bereich sichtbar; ohne Bereich entfällt die Gruppe vollständig, bereichsgebundene Sektionen sind dann nicht erreichbar). Unter „Aktueller Bereich" stehen Journale, Kalender-Systeme und Eigenschafts-Profile sowie die abgespaltenen Bereichs-Teile der bisherigen Misch-Bereiche: der Bereichs-Default der Dokument-Historie (bisher im Bereich „Verhalten") und die Bereichs-Konfiguration der Vorlagen (bisher im Bereich „Vorlagen") sind jetzt eigene Einträge „Dokument-Historie" und „Vorlagen" dieser Gruppe. Beim Binden eines Bereichs an ein offenes Einstellungs-Fenster erscheint die Gruppe sofort und die bereichsgebundenen Entwürfe laden für den neuen Bereich; dynamisch registrierte Sektionen landen ohne Angabe unter „Allgemein".

### Behoben

- **Verlorene Darstellungs-Schalter direkt nach dem Öffnen** (4T-0554): Ein Anwenden oder OK unmittelbar nach dem Öffnen der Seite, bevor die Darstellungs-Werte aus dem Store geladen waren, verlor Änderungen an den drei Darstellungs-Schaltern (Frontmatter anzeigen, dauerhaft ausklappen, Notiz-Vorschau) still; die Schalter werden jetzt unabhängig vom Lade-Zustand angewendet.

### i18n und Handbuch

- **Hilfe-Inhalte aktualisiert** (4T-0556): kein neuer Funktions-Katalog-Eintrag und keine neue Handbuch-Seite; die Katalog-Beschreibung der Einstellungs-Seite (Abdeckungs-Matrix F-027) beschreibt jetzt Zwei-Gruppen-Navigation und Speicher-Status, die Handbuch-Seiten „Dokument-Historie" und „Vorlagen" nennen die neuen Orte des Bereichs-Defaults bzw. der Bereichs-Konfiguration, alles in allen fünf Sprachfassungen. Zwei neue i18n-Keys pro Sprache (die Gruppen-Titel `settings.navGroup.general` und `settings.navGroup.area`).

### Intern

- Erweiterungs-Prüfschritt (im Epic): Die Bedienbarkeit der Einstellungs-Seite ist Kern-Funktion, keine schaltbare Erweiterung (kein eigenständiges Markdown-Konstrukt). Die abgespaltene Bereichs-Sektion der Vorlagen hängt mit an der Erweiterung „Vorlagen".
- Der Kontrakt der Einstellungs-Bereichs-Registry wurde um die optionalen Hooks `dirty` (meldet ungesicherte Änderungen für den Speicher-Status) und `group` (Zuordnung zu „Allgemein" oder „Aktueller Bereich") erweitert.
- Neue Test-Substanz: sieben neue Unit-Tests (Speicher-Status, Gruppierung), neue E2E-Tests ES-12 (Button-Zyklus) und ES-13 (Bereichs-Gruppe mit gebundenem Bereich); KS-02 ist semantisch neu (ohne Bereich kein Navigations-Eintrag statt Hinweis-Text), ES-05, ES-10 und VL-10 an die Gruppierung angepasst.

## [0.71.0.701] - 2026-07-16 — Kalender-Systeme

Epic 3E-0097 (Flexible Kalender-Systeme) aus dem Ideen-Programm 2026-07 (Eintrag I-25). Bereiche erhalten frei definierbare Zeitrechnungen für Fantasie-Kalender und reale Nicht-West-Kalender: unabhängige Blöcke mit parallelen, ineinander umrechenbaren Kalendern aus Ebenen, Epochen und Zyklen, gepflegt in den Bereichs-Einstellungen, mit eigener Wert-Syntax im Dokument und generischem Picker. Die Standard-Funktionen (Aufgaben-Marker, Journale, Abfragen, Datentabellen) bleiben bewusst rein gregorianisch. Umgesetzt in fünf Umsetzungs-Tasks (4T-0542 bis 4T-0546) plus Hilfe- und Handbuch-Task (4T-0547) nach dem Konzept-Workshop 4T-0535.

### Neu

- **Kalender-Kern mit linearer Rechen-Achse** (4T-0542): prozess-neutrales Definitions-Modell — Kalender als geordnete Ebenen-Liste (kleinste zuerst) mit benannten Ebenen-Bereichen und fünf Beziehungs-Typen (fester Faktor, Längen-Tabelle mit Positions-Namen, Schalt-Regel als geschachtelte Zyklen mit verlängerter Einheit, eigenständiger Zyklus mit Anker und Nummerierungs-Regel, abgeleitete Gruppierung); Epochen offen/geschlossen/offen mit nahtlosen Grenzen auf Datums-Ebene, Zählung ab 1 ohne Jahr 0, Grenzen auch mitten im Jahr. Die Achsen-Arithmetik rechnet in BigInt exakt (Tupel ↔ Achse verlustfrei, geschlossene Formeln über den Schalt-Zyklus); die Umrechnung zwischen Parallel-Kalendern läuft über eine affine Block-Achse (Anker plus Skala als Bruch) mit einer einzigen deterministischen Abrundung. Der gregorianische Kalender ist als Tragfähigkeits-Testfall und mitgelieferte Vorlage vollständig mit diesen fünf Typen abgebildet.
- **Bereichs-Ablage und Einstellungs-Sektion** (4T-0543, 4T-0544): Die Definitionen leben als Sektion `calendarSystems` der Bereichsdatei (Fehler-Isolation nach dem Journal-Muster, Broadcast an alle Fenster). Der neue Einstellungs-Bereich „Kalender-Systeme" pflegt sie zweistufig (Übersicht = Blöcke, Detail = Kalender-Formulare) mit typ-spezifischen Editoren für Ebenen (inklusive Umsortieren), Epochen (konstruktiv nahtlos: nur Beginn-Daten, Ende = nächster Beginn), Zyklen, Gruppierungen und Block-Achse; Segment-Eingaben als beschriftete Zahlen-Felder je Ebene. Der Knopf „Standard-Kalender als Vorlage einfügen" erzeugt die vollständige gregorianische Definition, die Live-Vorschau zeigt einen frei wählbaren Beispiel-Wert kanonisch und mit Namen; weiche Validierung im Entwurf, harte beim Anwenden (inklusive bereichsweiter Namens-Eindeutigkeit). Bearbeitung bewusst ohne Sperre: ungültig gewordene Dokument-Werte werden markiert, nie verändert.
- **Picker für benutzerdefinierte Kalender** (4T-0545): cursor-verankertes Popup mit Block-, Kalender- und Epochen-Wahl (Auswahlen mit nur einem Eintrag entfallen), generischem Gitter aus der Ebenen-Struktur (Zyklus-Länge = Spalten-Zahl mit Positions-Namen und Nummern-Spalte, sonst fortlaufende Tages-Liste; Rand-Tage der Nachbar-Einheiten anwählbar), Navigation über Gitter- und größte Einheit, generischen Zeit-Segmenten (ungültige Werte konstruktionsbedingt nicht eingebbar) und „Zum Anker"-Sprung. Die Umrechnungs-Anzeige zeigt den gewählten Zeitpunkt in allen Parallel-Kalendern des Blocks; ein Klick wechselt den aktiven Kalender dorthin. Ein Kalender-Wechsel rechnet die Auswahl um, ein Block-Wechsel springt bewusst zum Anker (Blöcke sind nicht umrechenbar).
- **Wert-Syntax im Dokument** (4T-0546): Inline-Form `@{Kalendername: Wert}` mit numerisch-kanonischem Wert (Segmente groß nach klein, optionales Epochen-Kürzel, optionaler Zeit-Teil); die Kollisions-Prüfung gegen die bestehende Syntax-Landschaft bestätigte das Zeichen-Gespann ohne Anpassung. Werte erscheinen in gerenderter Ansicht, Live-Modus und Portable-Export als Badge mit der Namens-Formatierung des Kalenders; unbekannte Kalender und ungültige Werte werden sichtbar markiert und bleiben unverändert erhalten, Code-Kontexte bleiben literal. Werte sind im Quelltext- und Live-Modus klickbar (vorbelegter Picker, Ersetzen an Ort und Stelle in einem Undo-Schritt); das umbelegbare Kommando „Kalender-Datum einfügen" (Palette, aktiv bei Bereich mit mindestens einem Kalender) fügt den kanonischen Wert am Cursor ein.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0547): ein neuer Funktions-Katalog-Eintrag (Kalender-Systeme, Abdeckungs-Matrix F-131) und eine neue Handbuch-Seite „Kalender-Systeme" (Konzept, Einstellungs-Pflege, Wert-Syntax mit selbst-demonstrierender Ungültig-Markierung, Picker und Umrechnung) in allen fünf Sprachfassungen, verlinkt aus der Überblicksseite. Insgesamt 116 neue i18n-Keys pro Sprache im Epic (98 Einstellungs-, 10 Picker-, vier Kommando- und Erweiterungs-, vier Katalog- und Titel-Keys).

### Intern

- Erweiterungs-Prüfschritt (im Epic): Kalender-Systeme sind als schaltbare Erweiterung `custom-calendars` registriert, bewusst ohne Abhängigkeit zur Datums- und Uhrzeit-Eingabe (Popup-Bausteine nur auf Code-Ebene wiederverwendet). Im Aus-Zustand bleiben `@{…}`-Werte unangetasteter Klartext, Kommando und Einstellungs-Sektion entfallen, die Bereichs-Ablage bleibt erhalten.
- Prozess-neutraler Kern `src/shared/calendar-core.js` (Normalisierung mit Fehler-Isolation, Achsen-Arithmetik, Gültigkeits-Prüfung, kanonisches Format/Parsen, Block-Umrechnung, Wert-Erkennung als gemeinsame Quelle, gregorianische Vorlage). Die Render-Pipeline läuft im Preload-Kontext; die Kalender-Konfiguration wird deshalb doppelt gehalten (Preload über die Brücke `calendarConfigureRender`, Renderer im Modul `calendar-config.js`) und bei Start, Bereichs-Wechsel und Konfigurations-Broadcast synchronisiert.
- Neue Test-Substanz: Unit-Suite `calendar-core.test.js` (Gegenprobe der gregorianischen Vorlage gegen den Format-Kern, Roundtrip-Identität, Fantasie-Kalender, BigInt-Extremwerte, Umrechnungs-Determinismus), Snapshot-Fixture `kalender-werte.md`, extensions-aus-Fall, E2E-Suite `kalender-systeme.spec.js` (KS-01 bis KS-04: Einstellungs-Durchlauf mit Vorlage und Persistenz, Hinweis ohne Bereich, Live-Badge mit Klick-Bearbeitung, Einfüge-Kommando; Matrix F-131/S-090).

## [0.70.0.691] - 2026-07-15 — Arbeitsbereiche

Epic 3E-0098 (Arbeitsbereiche) aus dem Ideen-Programm 2026-07 (Eintrag I-26). Benannte Arbeitsbereiche machen die logischen Applikationen dauerhaft: Ein Arbeitsbereich speichert eine Applikation samt aller Fenster, Tabs, Tab-Gruppen, Bereichs-Bindung und ungespeicherter Entwürfe unter einem Namen, hält sich beim Arbeiten automatisch aktuell und stellt beim Öffnen exakt den letzten Stand wieder her. Umgesetzt in drei Umsetzungs-Tasks (4T-0537 bis 4T-0539) plus Hilfe- und Handbuch-Task (4T-0540), mit einer Zwischen-Sichtung des PO während der Umsetzung.

### Neu

- **Arbeitsbereiche mit vollem Lebenszyklus** (4T-0537, 4T-0538): „Als Arbeitsbereich speichern…" benennt die laufende Applikation samt aller Fenster, „Neuer Arbeitsbereich…" startet leer; Öffnen stellt alle Fenster mit Geometrie, Panes, Tabs samt Ansichts-Einstellungen, Tab-Gruppen und Bereichs-Bindung am letzten Stand her, erneutes Öffnen fokussiert statt zu duplizieren; Schließen (Kommando oder letztes Fenster) friert den Stand ein, ungespeicherte Änderungen laufen über den bestehenden Speichern-Dialog; Umbenennen und Farbkennung (Acht-Farben-Palette der Tab-Gruppen) jederzeit; Löschen entfernt nach Bestätigung nur die Ablage und degradiert einen offenen Arbeitsbereich zur unbenannten Applikation. Ein geöffneter Arbeitsbereich aktualisiert seine Ablage laufend automatisch; die Sitzungs-Wiederherstellung bringt zusätzlich alle beim Beenden offenen Arbeitsbereiche zurück (additiv im neuen Store-Schlüssel `workspaces`, ohne Migration).
- **Untermenü, Verwaltungs-Dialog und Fenster-Titel** (4T-0538): Untermenü „Datei → Arbeitsbereiche" mit der Liste aller Arbeitsbereiche (der Farbpunkt zeigt den Zustand: gefüllt = geöffnet, Ring = geschlossen; Klick öffnet bzw. fokussiert) und den vier Aktionen, auch als umbelegbare Kommandos in der Palette (mit Verfügbarkeits-Dimmung); Verwaltungs-Dialog mit Farbpunkt, Zustand, Zeitpunkt des letzten Öffnens und den Aktionen Öffnen, Umbenennen und Farbe, Löschen; der Fenster-Titel zeigt den Arbeitsbereichs-Namen an der Stelle der App-Nummer, bei gebundenem Bereich kombiniert (`(Arbeitsbereich Alpha, Bereich Notizen, Fenster 2)`).
- **Vier-Block-Gliederung des Datei-Menüs** (4T-0538): Der obere Menü-Abschnitt ist dauerhaft in vier Blöcke gegliedert — Dateien, Bereiche, Applikation, Arbeitsbereiche; „Neue Applikation" steht als eigener Mini-Block, „Zuletzt geöffnete Bereiche" rückt zu den Bereichen.
- **Unbenannt-Entwürfe im Arbeitsbereich** (4T-0539): Ungespeicherte Unbenannt-Tabs gehören zum Arbeitsbereichs-Zustand; sie wandern beim Schließen ohne Nachfrage in die Ablage, bleiben beim normalen App-Start liegen und kehren erst mit dem Öffnen ihres Arbeitsbereichs zurück. Beim Löschen eines Arbeitsbereichs gehen seine Entwürfe verlustfrei in den allgemeinen Entwurfs-Zwischenspeicher über.

### Behoben

- **Erweiterungs-Schaltung in der Fenster-Startphase** (4T-0539): Ein Erweiterungs-Schalt-Broadcast, der ein Fenster während seiner Initialisierung erreichte, ging in diesem Fenster endgültig verloren; solche Wechsel werden jetzt gemerkt und am Ende der Initialisierung angewendet.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0540): ein neuer Funktions-Katalog-Eintrag (Arbeitsbereiche, Abdeckungs-Matrix F-130) und vier Kommando-Beschreibungen; die Handbuch-Seite „Applikationen, Fenster und Bereiche" erhält in allen fünf Sprachfassungen den Abschnitt „Arbeitsbereiche" mit dem Abgrenzungs-Absatz Bereich (Ordner-Arbeitsraum) versus Arbeitsbereich (benannte Fenster-Sammlung), die erweiterte Titel-Systematik-Tabelle und die Grenzfälle. 31 neue i18n-Keys pro Sprache (sechs Menü-, ein Titel-, 16 Dialog- und Bestätigungs-Keys, sieben Katalog- und Kommando-Keys, ein generischer Dialog-Key).

### Intern

- Erweiterungs-Prüfschritt (im Epic): Arbeitsbereiche sind als schaltbare Erweiterung `workspaces` registriert, ohne Abhängigkeiten. Im Aus-Zustand verschwinden Untermenü-Block, Kommandos, Verwaltungs-Dialog und der Arbeitsbereichs-Teil des Fenster-Titels; Ablagen und laufende Persistenz offener Arbeitsbereiche bleiben unangetastet.
- Ablage im Store-Schlüssel `workspaces` neben `apps` mit defensiver Normalisierung (`session-schema.js`); beide Schlüssel werden in einem einzigen Schreibvorgang persistiert, damit der Wechsel einer Applikation zwischen ihnen (benennen, degradieren) nie einen doppelten oder verlorenen Eintrag hinterlässt. Die Acht-Farben-Palette der Tab-Gruppen liegt jetzt als gemeinsame Konstante in `src/shared/tab-group-colors.js` (Renderer und Main); die Farbpunkt-Icons des Untermenüs entstehen als gezeichnete Bitmaps im Main-Prozess.
- Neue Test-Substanz: Unit-Erweiterungen für Ablage-Normalisierung, Registry-Zuordnung, Menü-State, Titel-Systematik, Entwurfs-Zuordnung und Kommando-Filterung; E2E-Suite `arbeitsbereiche.spec.js` (WS-01 bis WS-05: Speichern und Neustart-Restore, Einfrieren und Fokus statt Duplikat, Entwurfs-Mitnahme, Degradierung beim Löschen, Erweiterungs-Aus-Zustand).

## [0.69.0.685] - 2026-07-15 — Ereignisse

Epic 3E-0092 (Ereignisse) aus dem Ideen-Programm 2026-07 (Eintrag I-21). Termine, Geburtstage, Jahrestage und Projekt-Daten leben direkt im Dokument: als eingebetteter `perspective-events`-Block mit eigenen Datenzeilen oder als Aggregation über Frontmatter-Eigenschaften aus den Dateien des Bereichs, auf Basis eines festen internen Eigenschafts-Profils „Ereignis". Umgesetzt in sieben Umsetzungs-Tasks (4T-0511 bis 4T-0517) plus Hilfe- und Handbuch-Task (4T-0518), mit zwei Zwischen-Sichtungen des PO während der Umsetzung.

### Neu

- **Ereignis-Block mit Tabelle und Pflege** (4T-0511, 4T-0512): Code-Block `perspective-events` mit neun-spaltigen Datenzeilen; die gerenderte Tabelle zeigt Kategorie-Badges (acht feste Kategorien mit Farbzuordnung) und die Zeitdifferenz zum heutigen Tag in vier Staffelungen (Jahre, Monate, Wochen, Tage, kalender-genau), dazu Meilensteine (1000er-Tage, 100er-Wochen/-Monate, volle Jahre, Jubiläums-Jahre), Jahres-Wiederkehr mit Countdown und Spannen-Dauer. Anlage über die Formularzeile mit Kalender-Picker, Bearbeiten, Duplizieren (ohne Verknüpfungen) und Löschen mit Bestätigung, direkt in geteilter Ansicht, Live-Modus und Lese-Ansicht, je Übernahme ein Undo-Schritt. Einfüge-Kommando „Ereignis-Block einfügen" über die Kommando-Palette.
- **Sortierung, Filter und gespeicherte Filter** (4T-0513): Kopf-Klick-Sortierung (Zeitpunkt, Ende, Ereignis, Kategorie; Standard Zeitpunkt absteigend), Filter-Leiste mit Text-Suche, Kategorie-Auswahl, Zeitraum-Presets und den Flags „nur mit Notizen"/„nur wiederkehrend"/„nur mit Zeitspanne"; benannte Filter werden als `filter:`-Direktiven im Block gespeichert und über die Leiste angewendet.
- **Vier Zusatz-Ansichten** (4T-0514): Umschalter über dem Block (schreibt die `view:`-Direktive) zwischen Tabelle, Dashboard (anstehende Ereignisse, Meilensteine, Kategorie-Verteilung), Monats- und Wochen-Kalender mit Heute-Markierung und Navigation sowie Timeline; ein Klick auf ein Ereignis springt zur Tabellen-Zeile.
- **Aggregation über Frontmatter** (4T-0515): eine `query:`-Direktive sammelt die Ereignisse aus den Bereichs-Dateien mit Ereignis-Profil; die Klausel-Sprache der Perspective-Abfrage verfeinert die Auswahl, der Datei-Titel dient als Fallback für den Ereignis-Text. Bearbeitungen schreiben ins Frontmatter der Quell-Dateien zurück (auch nicht geöffneter, mit Konflikt-Schutz), ein Zeilen-Klick öffnet die Quelle; Anlegen und Löschen bleiben den Quell-Dateien vorbehalten.
- **Verknüpfungen** (4T-0516): Ereignisse verketten sich als Vorgänger/Nachfolger, im Block über automatisch vergebene Kennungen, in der Aggregation als Datei-Verweise mit Gegenrichtungs-Pflege. Verknüpfungs-Indikator mit Popup (Suche, Umschalter, Sprung zum Ziel), Lösch-Bereinigung beider Seiten, verwaiste Verweise als weicher Hinweis.
- **Internes Profil in der Profil-Maschinerie** (4T-0517): das Profil „Ereignis" (acht `event-*`-Felder) steht automatisch in der Profil-Auflösung und in der Profil-Liste der Einstellungen, gekennzeichnet als internes Profil, ohne Öffnen-/Lösch-Affordanzen und nicht als Standard-Profil wählbar; es wirkt auch ohne konfigurierten Profil-Ordner (Zuordnungs-Feld-Default `class`).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0518): drei neue Funktions-Katalog-Einträge (Ereignis-Verwaltung, Ereignis-Aggregation, Ereignis-Verknüpfungen; Abdeckungs-Matrix F-127 bis F-129) und eine neue Handbuch-Seite „Ereignisse" (selbst-demonstrierend mit Live-Beispielen) in allen fünf Sprachfassungen, verlinkt aus der Überblicksseite; die Seite „Eigenschafts-Profile" erhält den Abschnitt „Internes Profil". Insgesamt 147 neue i18n-Keys pro Sprache im Epic (134 Funktions- und Erweiterungs-Keys, ein Kommando-, ein Einstellungs-Key, elf Katalog- und Titel-Keys).

### Intern

- Erweiterungs-Prüfschritt (im Epic): Ereignisse sind als schaltbare Erweiterung `events` registriert, mit Abhängigkeit zur Erweiterung „Eigenschafts-Profile" (erster Abhängigkeits-Fall der Werkzeug-Kategorie): deren Deaktivierung nimmt die Ereignis-Verwaltung transitiv mit (gesperrter Schalter mit Hinweis). Im Aus-Zustand bleibt der Block ein neutraler Code-Block, das Kommando ist gefiltert, das interne Profil verschwindet aus Auflösung und Liste.
- Prozess-neutraler Kern `src/shared/events-core.js` (internes Profil, Rechen-Kern mit Stichtag-Parameter, Fence-Datenformat mit verlustfreiem Round-Trip, Filter/Sortierung, Ansichts-Datenaufbereitung, Verknüpfungs-Logik) und HTML-Builder `src/shared/markdown/perspective-events.js` (Viewer und Portable). Portable-Export: eingebettete Blöcke werden statische Tabellen mit fertigen Texten in der Export-Sprache, Aggregations-Blöcke bleiben Code-Block.
- Neue Test-Substanz: Unit-Suiten `events-core.test.js`, `perspective-events.test.js` und `events-aggregation.test.js`, Erweiterungs- und Registry-Tests (Kaskade, Aus-Zustand beider Richtungen), E2E-Suite `ereignisse.spec.js` (EV-01 bis EV-13) plus Einstellungs-Wege in `erweiterungen.spec.js` (EW-04) und `eigenschafts-profile.spec.js` (PP-10), Snapshot-Fixtures mit eingefrorener System-Zeit.

## [0.68.0.670] - 2026-07-13 — Farbschemas

Epic 3E-0086 (Farbschemas) aus dem Ideen-Programm 2026-07 (Eintrag I-13). Die Farben der App werden einstellbar: ein Farbschema ist ein benanntes Set von Farbwerten über eine kuratierte Liste benannter Farb-Slots, die die bestehenden Theme-Variablen speisen. Je Modus (hell, dunkel) ist ein Schema aktiv; eigene Schemas entstehen als Kopie mitgelieferter, unveränderlicher Vorlagen. Umgesetzt in drei Umsetzungs-Tasks (4T-0464 bis 4T-0466) plus Hilfe- und Handbuch-Task (4T-0467).

### Neu

- **Farbschemas über kuratierte Slots** (4T-0464, 4T-0465): 14 benannte Farb-Slots in fünf Gruppen (Flächen, Text, Akzent und Rahmen, Tabs, Inhalt) speisen die Theme-Variablen; der gerenderte Inhalt folgt automatisch mit (Links tragen den Akzent, Überschriften den Haupttext, Zitat-Balken den kräftigen Rahmen). Je Modus ist ein Schema aktiv, der bestehende Hell/Dunkel-Umschalter wechselt zwischen beiden. Änderungen wirken sofort in allen Fenstern. Ohne eigenes Schema bleibt das Erscheinungsbild unverändert.
- **Einstellungs-Bereich „Farbschemas"** (4T-0466): Modus-Zuordnung (Schema für Hell, Schema für Dunkel), Verwaltung (Neu aus Vorlage, Duplizieren, Umbenennen, Löschen mit Rückfall auf Standard) und ein gruppierter Slot-Editor mit nativen Farbwählern und „Zurücksetzen" je Slot. Die Änderungen wirken als Live-Vorschau; die mitgelieferten Schemas (Standard Hell, Standard Dunkel, Kontrastreich Hell, Kontrastreich Dunkel, Sepia) sind unveränderlich und dienen als Vorlage.

### Geändert

- **PDF-Export folgt dem aktiven Hell-Schema** (4T-0465): Der PDF-Druck bleibt hell und übernimmt jetzt die Farben des aktiven Hell-Schemas statt einer festen Light-Palette; eigene helle Schemas werden farbtreu gedruckt, dunkle Schemas gehen nie ins PDF. Der Portable-Export bleibt themen-neutrales Markdown.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0467): ein neuer Funktions-Katalog-Eintrag (Farbschemas, Abdeckungs-Matrix F-126) und eine neue Handbuch-Seite „Farbschemas" (Slot-Modell, Pflege, Modus-Zuordnung, Kontrast-Grenzen) in allen fünf Sprachfassungen. 44 neue i18n-Keys pro Sprache (40 Bereichs-, Slot- und Schema-Keys plus vier Katalog- und Titel-Keys); zusätzlich erklärt ein Hinweis im Einstellungs-Bereich die Modus-Kopplung des Editors, die Handbuch-Seite führt sie ausführlicher aus.

### Intern

- Erweiterungs-Prüfschritt (im Epic): Farbschemas sind Kern, keine schaltbare Erweiterung. Farben sind gestalterische Grundfunktion wie der bestehende Hell/Dunkel-Schalter; ein sinnvoller Aus-Zustand existiert nicht (aus entspräche dem Standard-Schema).
- Prozess-neutrales Slot- und Schema-Modul `src/shared/color-schemes.js` (kuratierte Slot-Liste, Basis-Paletten, Schema-Verwaltung, Variablen-Berechnung) mit Drift-Wächter gegen styles.css. Die Renderer-Anwendung `src/renderer/modules/color-schemes.js` setzt die abweichenden Slot-Variablen inline am Wurzel-Element und wendet sie bei jedem Hell/Dunkel-Wechsel neu an (Inline-Variablen übersteuern beide Theme-Blöcke). Neue Test-Substanz: Unit-Tests für Modell und Anwendung, E2E-Suite `farbschemas.spec.js` (FS-01 und FS-02); der Einstellungs-Bereichs-Wächter auf den neuen Bereich nachgezogen.

## [0.67.0.659] - 2026-07-12 — Gliederungs-Nummerierung

Epic 3E-0087 (Gliederungs-Nummerierung) aus dem Ideen-Programm 2026-07 (Eintrag I-07). Überschriften lassen sich automatisch mit hierarchischen Nummern (1, 1.1, 1.2 und so weiter) versehen; die Nummern erscheinen im Render-Pane, im Live-Modus, in der Gliederung und in den Exporten, der Quelltext bleibt Standard-Markdown. Umgesetzt in drei Umsetzungs-Tasks (4T-0469 bis 4T-0471) plus Hilfe- und Handbuch-Task (4T-0472).

### Neu

- **Automatische Überschriften-Nummerierung** (4T-0469, 4T-0470): berechnete Nummern als Anzeige-Präfix. Gesteuert auf drei Ebenen mit Vorrang Überschrift vor Dokument vor global. Ausgenommene Überschriften zählen nicht mit, übersprungene Ebenen zählen als eins, der Escape `\{-}` bleibt Literal. Die Nummern erscheinen konsistent in Render-Pane, Live-Modus, Gliederung und PDF-Export; die Marker `{-}`/`{+}` verschwinden aus jeder Ansicht und jedem Export, ohne dass Nummern in den Portable-Export eingebrannt werden.
- **Einstellung, Frontmatter und Marker** (4T-0471): der Einstellungs-Bereich „Überschriften-Nummerierung" (Schalter plus Start-Ebene H1 oder H2) schaltet die Nummerierung global; der Frontmatter-Schlüssel `numbered-headings: true/false` übersteuert sie pro Dokument; die Zeilenende-Marker `{-}` (ausnehmen) und `{+}` (einbeziehen) wirken pro Überschrift. Änderungen wirken sofort in allen Fenstern.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0472): ein neuer Funktions-Katalog-Eintrag (Überschriften-Nummerierung, Abdeckungs-Matrix F-125) und ein neuer Abschnitt „Automatische Nummerierung" auf der Handbuch-Seite „Markdown-Basis" in allen fünf Sprachfassungen. Neun neue i18n-Keys pro Sprache (drei Katalog-, sechs Einstellungs-Keys).

### Intern

- Erweiterungs-Prüfschritt (im Epic): Die Nummerierung ist als schaltbare Render-Erweiterung `heading-numbering` registriert; im Aus-Zustand entfallen Nummern und Marker-Entfernung, die Marker bleiben Literal-Text.
- Prozess-neutraler Nummerierungs-Kern `src/shared/heading-numbers.js` (Zähl-Logik, Marker-Erkennung, Wirksamkeits-Auflösung), eingehängt als core-Ruler in der Render-Pipeline (vor markdown-it-anchor und markdown-it-attrs, damit die Slugs stabil bleiben) und eigenständig in Live-Modus und Gliederungs-Ansicht (viewport-unabhängige Zählung aus der foldStructure).
- Neue Test-Substanz: Unit-Tests für den Kern (`heading-numbers.test.js`, 22 Fälle) und die Render-Anbindung (`gliederungs-nummerierung.test.js`, 15 Fälle), E2E-Suite `gliederungs-nummerierung.spec.js` (GN-01 bis GN-04), Snapshot-Fixture; der Einstellungs-Bereichs-Wächter auf den neuen Bereich nachgezogen.

## [0.66.0.653] - 2026-07-11 — Erinnerungen

Epic 3E-0095 (Erinnerungen) aus dem Ideen-Programm 2026-07 (Eintrag I-24). Aufgaben-Zeilen tragen einen **Erinnerungs-Marker** `⏰ <Datum> [<Uhrzeit>]` als Melde-Zeitpunkt (abgegrenzt vom Fälligkeits-Termin 📅). Bei laufender App mit geöffnetem Bereich überwacht ein Prüfer alle Bereichs-Dateien und meldet fällige Erinnerungen in einem Dialog mit „Erledigt" und „Später erinnern"; verpasste Fälligkeiten sammelt ein Nachhol-Dialog beim Start. Umgesetzt in vier Umsetzungs-Tasks (4T-0525 bis 4T-0528) plus Hilfe- und Handbuch-Task (4T-0529).

### Neu

- **Erinnerungs-Marker** (4T-0525): `⏰ <Datum> [<Uhrzeit>]` als eigener Task-Marker mit verlustfreiem Round-Trip; ohne Uhrzeit-Anteil meldet der Anker zur einstellbaren Standard-Uhrzeit (Standard 09:00). Beim Abschluss einer wiederkehrenden Aufgabe wandert der Marker mit verschobenem Zeitpunkt in die Folge-Instanz. Ein 30-Sekunden-Prüfer im Hauptprozess überwacht den Bereichs-Index (nur bei laufender App mit geöffnetem Bereich).
- **Benachrichtigungen mit Snooze** (4T-0526): fällige Erinnerungen erscheinen als Dialog mit Beschreibung und Datei-Link. „Erledigt" schaltet die Aufgabe über die Status-Kette weiter; „Später erinnern" verschiebt den Melde-Zeitpunkt (Optionen 10 Minuten, 1 Stunde, 4 Stunden, 1 Tag, 1 Woche oder freie Datums-Wahl) und schreibt ihn direkt in den Marker der Quelldatei. Wegklicken schaltet bis zum App-Neustart stumm. Beim App-Start sammelt ein Nachhol-Dialog alle verpassten Fälligkeiten. Eine zuschaltbare **System-Benachrichtigung** erscheint zusätzlich, wenn das Fenster nicht im Vordergrund steht (erste Nutzung nativer Benachrichtigungen).
- **Erinnerungs-Liste** (4T-0527): ein Sidebar-Panel (Wecker-Symbol in der Statusleiste, Ansicht → Erinnerungen) bündelt alle Erinnerungen des Bereichs, gruppiert nach Überfällig, Heute, Morgen und Später. Direkt-Aktionen Erledigt und Später pro Eintrag; die Überfällig-Gruppe führt auch stummgeschaltete Erinnerungen und bietet „Erneut auslösen"; ein Klick öffnet die Quelldatei an der Zeile.
- **Eingabe-Wege und Erweiterung** (4T-0528): Kommando „Erinnerung setzen" (Standard `Strg+Alt+R`, umbelegbar), Auto-Vervollständigungs-Eintrag „Erinnerung…", eine Erinnerungs-Zeile im Aufgaben-Bearbeitungs-Dialog und ein Klick auf den bestehenden ⏰-Wert öffnen jeweils den Datums-Picker. Der Einstellungs-Bereich „Erinnerungen" steuert Standard-Uhrzeit, Snooze-Optionen und System-Benachrichtigung. Erinnerungen sind eine schaltbare Erweiterung mit Abhängigkeit zur Erweiterung „Aufgaben".

### Behoben

- Das Snooze-Kontextmenü öffnete hinter dem Erinnerungs-Dialog (z-index-Konflikt) und war aus dem Dialog nicht anklickbar. Kontextmenüs erscheinen nun über Dialogen und Popups.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0529): drei neue Funktions-Katalog-Einträge (Erinnerungs-Marker, Benachrichtigungen, Erinnerungs-Liste; Abdeckungs-Matrix F-122 bis F-124) und zwei Kommando-Einträge (S-083, S-084). Neue Handbuch-Seite „Erinnerungen" in allen fünf Sprachfassungen, verlinkt aus der Überblicksseite und der Aufgaben-Seite, mit einem eigenen Abschnitt zur Grenze „nur bei laufender App". Insgesamt rund 60 neue i18n-Keys pro Sprache.

### Intern

- Erweiterungs-Prüfschritt (im Epic): Erinnerungen sind als schaltbare Werkzeug-Erweiterung `reminders` mit Abhängigkeit `['tasks']` registriert (zweiter Nutzer der Abhängigkeits-Mechanik nach `wiki-embeds`); im Aus-Zustand entfallen Überwachung, Panel und Kommandos.
- Prozess-neutraler Erinnerungs-Kern `src/shared/reminders.js` (Fälligkeit, Gruppen, Snooze; injizierte Bezugszeitpunkte) und Main-Prüfer `src/main/reminder-check.js`. Die Anker stecken in den vorhandenen Roh-Task-Zeilen des Index (neue Lese-API `areaTaskLines`), daher kein Cache-Schema-Bump. Das Nachholen kommt ohne „letzter Lauf"-Persistenz aus.
- Neue Test-Substanz: E2E-Suite `erinnerungen.spec.js` (ER-01 bis ER-07), Unit-Tests für Marker (`setReminder`, Recurrence-Mitwandern), Erinnerungs-Kern (`reminders-kern.test.js`), Prüfer (`reminder-check.test.js`) und die Index-Lese-API; Sidebar- und Einstellungs-Wächter auf 13 Panels bzw. Bereiche nachgezogen.

## [0.65.0.646] - 2026-07-11 — Profil-Komplett-Übernahme

Epic 3E-0093 (Profil-Komplett-Übernahme) aus dem Ideen-Programm 2026-07 (Eintrag I-22). Die Eigenschafts-Profile erhalten eine **Komplett-Übernahme**: Alle noch fehlenden Felder eines Profils lassen sich in einem Schritt zu einem Dokument oder Block ergänzen, statt sie einzeln aus dem Vorschlags-Menü zu übernehmen. Umgesetzt in einem Umsetzungs-Task plus Hilfe- und Handbuch-Task (4T-0491, 4T-0492).

### Neu

- **Komplett-Übernahme der Profil-Felder** (4T-0491): Das Vorschlags-Menü des Hinzufügen-Knopfes ist nach Profilen gruppiert; ein Klick auf den Profil-Namen ergänzt alle noch fehlenden Felder dieses Profils mit ihrem Vorgabe-Wert, sonst typgerecht leer (Zahl `0`, Wahrheitswert `falsch`, Text, Datum und Liste leer, im Dokument-Frontmatter als reiner Schlüssel `feld:`); vorhandene Werte und die Feld-Reihenfolge bleiben unangetastet, und es entstehen keine Duplikate. Die gesamte Ergänzung ist ein einziger Undo-Schritt. Die Funktion gilt gleichermaßen im Properties-Editor und im Block-Eigenschaften-Panel und entfällt mit der ausgeschalteten Erweiterung „Eigenschafts-Profile".

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0492): ein neuer Funktions-Katalog-Eintrag „Komplett-Übernahme der Profil-Felder" (drei Keys, Abdeckungs-Matrix F-121) sowie zwei neue Menü-Labels. Die Handbuch-Seite „Eigenschafts-Profile" erhält den Abschnitt „Komplett-Übernahme aller Felder" in allen fünf Sprachfassungen. Insgesamt fünf neue i18n-Keys pro Sprache (drei Katalog-Keys plus zwei Menü-Labels), 25 neue Übersetzungen über fünf Sprachen.

### Intern

- Erweiterungs-Prüfschritt (im Epic): keine neue Erweiterung; die Funktion ist Teil von „Eigenschafts-Profile" und entfällt im Aus-Zustand mit dem profil-gestützten Vorschlags-Menü. Die Feld-Map-Erzeugung (`buildProfileFillMap`, `profileSuggestGroups`, `emptyValueForType`) liegt prozess-neutral in `property-profiles.js`.
- Die Mehrfeld-Schreib-API `writeFrontmatter` erhielt einen opt-in-Parameter `emptyStubKeys`, der neu ergänzte Leer-Felder als bare YAML-Schlüssel schreibt (`null` plus `nullStr`), ohne die Leer-Feld-Churn-Vermeidung aus 4T-0069 anzutasten (empirisch verifiziert). Die Dokument-Übernahme setzt die Editor-Änderung als isolierte Undo-Einheit, damit ein Undo nicht über die Ergänzung hinaus zurückläuft.
- Neue Test-Substanz: E2E PP-08 (Properties-Editor, ein Undo-Schritt) und PP-09 (Block-Panel, `.mdd`) in `eigenschafts-profile.spec.js`, Unit-Tests für `buildProfileFillMap`, `profileSuggestGroups` und `emptyValueForType` (`property-profiles.test.js`) sowie für den `emptyStubKeys`-Schreibpfad (`markdown-pipeline.test.js`); Abdeckungs-Matrix um F-121 erweitert.

## [0.64.0.643] - 2026-07-11 — Aufgaben-Abfragen und Komfort

Epic 3E-0096 (Aufgaben-Ausbau Stufe 2: Abfragen und Komfort) aus dem Ideen-Programm 2026-07 (Eintrag I-19), zweite und abschließende Stufe des Aufgaben-Ausbaus. Sie macht Task-Zeilen abfragbar und die Treffer zur Arbeitsfläche: Der neue **`TASKS`-Scope der Perspective-Abfrage** (`LIST TASKS`, `TABLE TASKS`) filtert und sortiert über Task-Felder (Termine, Priorität, Status-Typ, Tags, Dringlichkeit, Abhängigkeiten) mit relativen Datums-Literalen und mehrstufiger **Gruppierung**; aus den Treffern lassen sich Status **umschalten**, Termine **verschieben** und ein **Bearbeitungs-Dialog** öffnen, auch in nicht geöffnete Dateien. Ein **Dringlichkeits-Score** sortiert Task-Listen ohne Handarbeit, eine **Auto-Vervollständigung** auf Task-Zeilen und der Dialog (`Strg+Alt+A`) setzen Marker ohne Symbol-Kenntnis, und **Abhängigkeiten** mit eindeutigen IDs kennzeichnen blockierte Aufgaben. Umgesetzt in sieben Umsetzungs-Tasks plus Hilfe-/Handbuch-Task (4T-0502 bis 4T-0509).

### Neu

- **`TASKS`-Scope der Perspective-Abfrage** (4T-0502): Der Ausgabe-Zusatz `TASKS` (`LIST TASKS …`, `TABLE TASKS …`) liefert Task-Zeilen statt Dateien als klickbare Treffer mit modusbewusstem Sprung zur Quell-Zeile. Der Evaluator kennt feste Task-Felder — die sechs Termine (`due`, `scheduled`, `start`, `created`, `done`, `cancelled` mit optionaler Uhrzeit), `happens` (frühestes aus Start/geplant/fällig), `priority` und `priority.rank`, `status` und `status.type`, `description`, `heading`, `tags`, `recurrence`, `id`, `dependson` sowie die Zusatz-Felder `<feld>.set`/`<feld>.invalid` — filter- und sortierbar über die bestehenden Vergleichs- und Booleschen Operatoren. Die `date(…)`-Literale akzeptieren neu die relativen Wörter `tomorrow`, `yesterday` und die Perioden-Grenzen `sow`/`eow`/`som`/`eom`/`soy`/`eoy` (Woche ab Montag; Start-Wörter 00:00, End-Wörter das Tages-Ende), sodass alle Komfort-Datumsfilter als gewöhnliche Vergleiche ausdrückbar sind. Die Treffer aktualisieren sich mit dem Index; im Aus-Zustand der Erweiterung „Aufgaben" meldet der Scope einen lokalisierten Hinweis statt einer stillen Leer-Liste.
- **Gruppierung und Task-Layout-Optionen** (4T-0503): Die Abfrage-Sprache erhält die Klausel `GROUP BY ausdruck (, ausdruck)*` für mehrstufige, verschachtelte Gruppen-Überschriften (in dieser Stufe für den `TASKS`-Scope aktiv, außerhalb mit lokalisiertem Hinweis). Für Task-Listen steuern `HIDE element` und `SHOW element` die Sichtbarkeit einzelner Marker-Elemente (Termin-Arten, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink`, `count`, `urgency`, `edit`, `postpone`), `SHORT` schaltet einen Kurz-Modus (nur Symbole, voller Wert am Tooltip), und ein Treffer-**Zähler** erscheint standardmäßig. Gruppen-Reihenfolge und Ausgabe sind deterministisch und identisch in Render-Pane und Live-Modus.
- **Rückschreiben aus Abfrage-Treffern** (4T-0504): Jeder Task-Treffer ist Arbeitsfläche. Die **klickbare Status-Box** folgt der konfigurierten Toggling-Kette inklusive Automatik-Daten und Wiederholungs-Instanz; ein **Verschiebe-Menü** setzt den maßgeblichen Termin auf „morgen", „eine Woche später" oder einen frei über den Picker gewählten Tag (überfällige Termine ab heute, sonst ab dem bestehenden Termin, die Uhrzeit bleibt); ein **Bearbeiten-Knopf** öffnet den Dialog auf der Treffer-Zeile. Geschrieben wird zeilen-genau, byte-treu und mit **Konflikt-Schutz** (kein Blind-Schreiben bei verschobener oder verschwundener Zeile), auch in **nicht geöffnete Dateien** über den Main-Prozess; offene Tabs ziehen über den Editor-Zustand nach.
- **Dringlichkeits-Score und globale Abfrage** (4T-0505): Ein rein funktionaler Score gewichtet Fälligkeit (gleitend nach Überfälligkeit), Priorität, Geplant-heute-Bonus und Start-in-der-Zukunft-Abwertung auf Tages-Basis (Uhrzeit ohne Score-Einfluss). Der `TASKS`-Scope sortiert ohne `SORT` standardmäßig nach Status-Typ, Dringlichkeit, Fälligkeit, Priorität und Pfad; das Feld `urgency` ist filter- und sortierbar und über `SHOW urgency` als Badge einblendbar. Eine **globale Abfrage** (Einstellung im Bereich „Aufgaben") stellt FROM-/WHERE-Anteile implizit jeder `TASKS`-Abfrage voran und unterscheidet im Fehlerfall global von lokal.
- **Task-Bearbeitungs-Dialog** (4T-0506): Ein Dialog mit Feldern für Beschreibung, Status (aus der `task-states`-Konfiguration), Priorität, Wiederholungs-Regel (nicht-blockierender Validierungs-Hinweis), die drei manuellen Termine (Wert-Anzeige, Wählen-Knopf **ausschließlich über den Picker**, Entfernen-Knopf), die Anzeige der Automatik-Daten und die Abhängigkeits-Felder. Er bearbeitet auf einer Task-Zeile und legt auf einer leeren Zeile an, jede Anwendung ein Undo-Schritt über den verlustfreien Marker-Round-Trip. Zugänge: Registry-Kommando `task.editDialog` mit Standard-Kürzel `Strg+Alt+A` (umbelegbar), das Einfügen-Submenü des Editor-Kontextmenüs und der Bearbeiten-Knopf der Abfrage-Treffer.
- **Auto-Vervollständigung auf Task-Zeilen** (4T-0507): Eine dritte Vervollständigungs-Quelle (neben Wiki-Links und Tags) schlägt auf Task-Zeilen Termine (öffnen den Picker), Prioritäts-Stufen, Wiederholungs-Vorlagen und Status-Wechsel vor und setzt den Marker in kanonischer Form am Zeilenende in einer Transaktion. **Mindest-Tipplänge** und **Vorschlagszahl** sind als Zahl-Steuerungen im Bereich „Aufgaben" einstellbar; die Quelle ist nur bei aktiven Erweiterungen „Auto-Vervollständigung" und „Aufgaben" aktiv und respektiert den Global Filter.

### Geändert

- **Abhängigkeiten mit IDs und Blockiert-Filtern** (4T-0508): Die ID- und Vorgänger-Marker (🆔/⛔), die bislang nur tolerant gelesen und erhalten wurden, tragen jetzt Semantik. IDs werden auf Wunsch automatisch vergeben, mit **Eindeutigkeits-Prüfung** über den Bereich; eine Aufgabe gilt als blockiert, wenn sie mindestens einen offenen Vorgänger hat. Der `TASKS`-Scope kennt die Felder `blocked`, `blocking`, `id.set` („hat ID") und `id.duplicate` (Vergleich als String, etwa `WHERE blocked = "true"`), und die Treffer-Darstellung kennzeichnet blockierte Aufgaben und mehrfach vergebene IDs dezent mit Badge und Tooltip. Der Bearbeitungs-Dialog erhält Felder für **Vorgänger** und **Nachfolger** mit Task-Suche über den Bereich; ein Nachfolger-Eintrag schreibt den Vorgänger-Marker auf die Ziel-Zeile.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0509): sechs neue Funktions-Katalog-Einträge „Task-Abfragen", „Aktionen in Task-Treffern", „Task-Bearbeitungs-Dialog", „Auto-Vervollständigung für Aufgaben", „Task-Abhängigkeiten" und „Dringlichkeits-Score" (je drei Keys, Abdeckungs-Matrix F-115 bis F-120) sowie die Kürzel-Beschreibung des Dialog-Kommandos (S-082, bereits mit 4T-0506 angelegt). Die Handbuch-Seite „Perspective-Abfrage" erhält den Abschnitt „Task-Ebene (`TASKS`)" (Scope, Task-Feld-Tabelle, relative Datums-Literale, Default-Sortierung, `GROUP BY`, `HIDE`/`SHOW`/`SHORT`, globale Abfrage), die Seite „Aufgaben-Listen" vier neue Abschnitte (Bearbeitungs-Dialog, Auto-Vervollständigung, Task-Abfragen und Rückschreiben, Dringlichkeits-Score) plus die auf die volle Abhängigkeits-Semantik umgeschriebene Beschreibung, jeweils in allen fünf Sprachfassungen. Insgesamt 72 neue i18n-Keys pro Sprache (54 aus den Umsetzungs-Tasks plus 18 Katalog-Keys), 360 neue Übersetzungen über fünf Sprachen.

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Der gesamte Umfang hängt an der bestehenden internen Erweiterung „Aufgaben"; im Aus-Zustand entfallen der `TASKS`-Scope (lokalisierter Hinweis), das Dialog-Kommando samt Palette- und Kontextmenü-Eintrag und die Auto-Vervollständigung. Der Score, die Gruppierung und die Abhängigkeits-Logik liegen prozess-neutral im Marker-Kern bzw. der Abfrage-Auswertung.
- Der `TASKS`-Scope läuft über den bereichsweiten Index (neue `tasksPerFile`-Map in `parseContent`, Cache-Schema-Version auf 3 gehoben) und wertet Abhängigkeiten zweiphasig aus (erst alle Task-Zeilen des Bereichs parsen, dann Flags über die Gesamt-Menge, dann filtern), sodass Blockiert-Filter über Datei-Grenzen stimmen. Der zeilen-genaue Schreib-Kern (`computeLineReplacement`) erhält EOL-Stil und BOM byte-genau.
- Neue Test-Substanz: die E2E-Suite `aufgaben-abfrage.spec.js` (TQ-01 bis TQ-09) sowie die Unit-Suiten `task-line-edit.test.js`, `task-query-actions.test.js`, `task-autocomplete.test.js`, `task-dialog.test.js`, `task-status-type-resolver.test.js` und die erweiterten Suiten `perspective-query.test.js`, `perspective-query-eval.test.js`, `perspective-query-index.test.js`, `task-markers.test.js` und `frontmatter-query-view.test.js`; Abdeckungs-Matrix um F-115 bis F-120 erweitert.

## [0.63.0.630] - 2026-07-10 — Datums- und Uhrzeit-Eingabe

Epic 3E-0091 (Datums- und Uhrzeit-Eingabe) aus dem Ideen-Programm 2026-07 (Eintrag I-20). Ein cursor-verankertes **Picker-Popup** fügt Datum und Uhrzeit über eine Kalender-Monatsansicht und eine daneben liegende Uhrzeit-Eingabe ein; Datum und Uhrzeit sind einzeln zuschaltbar, drei Registry-Kommandos mit umbelegbaren Standard-Kürzeln decken die Kombination sowie die Nur-Datum- und Nur-Uhrzeit-Variante ab. Im Editor (Quelltext- und Live-Modus) sind eingefügte oder von Hand getippte Werte in den drei Formaten **klickbar** und öffnen den Picker mit vorbelegtem Wert. Der Umfang ist als interne Erweiterung „Datums- und Uhrzeit-Eingabe" schaltbar. Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0486 bis 4T-0489).

### Neu

- **Datums-/Uhrzeit-Picker und Einfüge-Kommandos** (4T-0486): neues Renderer-Modul (`src/renderer/modules/date-picker.js`) öffnet ein an der Cursor-Position verankertes Popup mit Kalender-Monatsansicht (Montag-Start, ISO-Kalenderwochen-Spalte, Heute-Knopf, Monats-Navigation) und einer digitalen Uhrzeit-Steuerung: vier einzeln einstellbare Stellen (Stunden und Minuten je Zehner und Einer), bedienbar per Klick auf die Stelle, Pfeil-Buttons bzw. Pfeiltasten mit Umlauf und Ziffern-Direkteingabe mit Weiterrücken, dazu ein Jetzt-Knopf; ungültige Uhrzeiten sind konstruktionsbedingt nicht eingebbar. Datum und Uhrzeit sind einzeln zuschaltbar, mindestens ein Teil bleibt aktiv. Volle Tastatur-Bedienung: Pfeile ±1 Tag/±1 Woche, Bild-auf/ab ±Monat, Enter übernimmt, Esc bricht ab, ein Klick außerhalb verwirft. Drei Registry-Kommandos mit umbelegbaren Standard-Kürzeln (`Strg+Alt+T` Datum und Uhrzeit, `Strg+Alt+D` nur Datum, `Strg+Alt+U` nur Uhrzeit) fügen an der Cursor-Position ein, auch im Notiz-Feld, in den Formaten `2026-07-10`, `14:30` und `2026-07-10 14:30` (identisch mit den Termin-Markern der Aufgaben-Listen). Zusätzlicher Schreib-Trigger: zwei Backslashes (`\\`) im Editor öffnen den kombinierten Picker (Übernehmen ersetzt sie, Esc lässt sie stehen); kein Trigger in Code, Formeln oder Frontmatter.
- **Klickbare Datums-Werte im Editor** (4T-0487): Werte in den drei Formaten werden im Editor (Quelltext- und Live-Modus, im Edit-Modus) dezent gepunktet unterstrichen; ein Klick öffnet den Picker mit Wert und Schaltern vorbelegt, das Übernehmen ersetzt exakt den Wert an Ort und Stelle in einem einzigen Undo-Schritt. Auch von Hand getippte format-gleiche Werte sind klickbar. Nicht klickbar: Code, Formeln, Frontmatter, die aktive Cursor-Zeile, Wiki-Link-Ziele und die Termin-Marker-Badges der Aufgaben-Listen; in read-only Ansichten gibt es keine Dekoration.
- **Erweiterung „Datums- und Uhrzeit-Eingabe"**: neue interne Erweiterung (`date-picker`, Kategorie Werkzeuge). Im Aus-Zustand entfallen Kommandos, Schreib-Trigger und Klick-Dekoration; die Werte bleiben normaler Text.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0488): neuer Funktions-Katalog-Eintrag „Datums- und Uhrzeit-Eingabe" (Gruppe Bearbeiten, Abdeckungs-Matrix F-114) samt drei Shortcut-Beschreibungen; die Handbuch-Seite „Werkzeuge" erhält den Abschnitt „Datums- und Uhrzeit-Eingabe". Insgesamt 14 neue i18n-Keys pro Sprache (70 neue Übersetzungen über fünf Sprachen).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Der Umfang ist als interne Erweiterung `date-picker` (Kategorie Werkzeuge) schaltbar; im Aus-Zustand entfallen die drei Kommandos, der Backslash-Trigger und die Klick-Dekoration, format-gleiche Werte bleiben reiner Text. Der Format-Kern (`formatDateMs`) und das Muster für klickbare Inline-Widgets im Live-Modus werden nachgenutzt.
- Neue Test-Substanz: 25 Unit-Tests des Picker-Moduls (Wert-Parsing und -Komposition, Datums-/Monats-Arithmetik, Trigger-Ausschluss-Kontexte, Muster-Erkennung mit Task-Schwanz-Abgrenzung, Manifest- und Registry-Prüfung, Popup-Ablauf und Uhrzeit-Segment-Klemmung mit injiziertem Referenz-Datum) sowie die E2E-Suite `datums-picker.spec.js` (DP-01 bis DP-10: Öffnen per Kürzel und Backslash-Trigger, Einfügen in den drei Formaten, Abbruch-Verhalten, Klick-Reaktivierung mit Vorbelegung und Ersetzen an Ort und Stelle in Quelltext- und Live-Modus, Ausschluss-Kontexte, Aus-Zustand der Erweiterung). Abdeckungs-Matrix um den Funktions-Eintrag F-114 und die Shortcut-Einträge S-079 bis S-081 erweitert.

## [0.62.0.623] - 2026-07-10 — Task-Fundament

Epic 3E-0090 (Aufgaben-Ausbau Stufe 1: Task-Fundament) aus dem Ideen-Programm 2026-07 (Eintrag I-19). Erste von zwei Stufen des Aufgaben-Ausbaus: Task-Zeilen tragen **Symbol-Marker am Zeilenende** für Termine, Priorität und Wiederholung, die erweiterten Task-Status erhalten **Typ und Folge-Symbol** mit Ketten-Klick, und die neue interne Erweiterung **„Aufgaben"** bündelt Marker-Darstellung, Automatik-Daten, Wiederholung beim Abschluss und einen Global Filter. Der Datei-Bestand im Marker-Format funktioniert ohne Konvertierung, der Round-Trip ist verlustfrei. PO-Entscheidungen aus dem Konzept-Workshop vom 2026-07-10 (Querschnitte A bis D): Symbol-Marker als eigenes Format mit optionaler Uhrzeit-Erweiterung, neue Erweiterung „Aufgaben" plus Status-Typen-Ausbau in `task-states`, nur der Übergang auf einen Erledigt-Typ setzt das Erledigt-Datum und löst die Wiederholung aus, Zwei-Stufen-Staffelung (die Abfrage- und Komfort-Stufe folgt im Epic 3E-0096). Umgesetzt in vier Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0496 bis 4T-0501).

### Neu

- **Task-Marker-Kern** (4T-0496): neues prozess-neutrales Shared-Modul parst und serialisiert die Symbol-Marker am Zeilenende von Checkbox-Zeilen: Termine (fällig 📅, geplant ⏳, Start 🛫; automatisch erstellt ➕, erledigt ✅, abgebrochen ❌) mit festem Datum `JJJJ-MM-TT` und optionaler Uhrzeit `HH:mm` (eigene Format-Erweiterung), sechs Prioritäts-Stufen (🔺⏫🔼🔽⏬, „normal" ohne Marker) und eine Wiederholungs-Regel hinter 🔁. Der Round-Trip ist verlustfrei: Marker-Reihenfolge, Symbol-Varianten und unbekannte Marker bleiben byte-identisch erhalten, ID- und Abhängigkeits-Marker (🆔/⛔) werden gelesen und erhalten (ihre Funktion folgt in Stufe 2), ungültige Datums-Werte bleiben stehen und werden markiert.
- **Erweiterung „Aufgaben"** (4T-0498): neue interne Erweiterung (`tasks`, Kategorie Werkzeuge) mit eigenem Einstellungs-Bereich. Die Marker erscheinen in Render-Pane, Live-Modus und Portable-Export als Badges (überfällige Fälligkeit rot, ungültige Werte durchgestrichen). Ein **Global Filter** entscheidet über einen konfigurierbaren Filter-Text, welche Checkbox-Zeilen als Aufgaben gelten (leer = alle), optional wird der Filter-Text in den Anzeigen ausgeblendet. Drei einzeln schaltbare **Automatik-Daten** schreiben das Erledigt- bzw. Abgebrochen-Datum beim Statuswechsel (und entfernen es auf dem Rückweg) sowie das Erstellt-Datum beim Aufgabenlisten-Kommando. Die Einfüge-Position der Wiederholungs-Instanz ist einstellbar. Im Aus-Zustand bleiben alle Marker reiner Text.
- **Wiederholung beim Abschluss** (4T-0499): Der Abschluss einer wiederkehrenden Aufgabe erzeugt die nächste Instanz. Die Regel hinter 🔁 kennt die Formen every day, every N days, every weekday, every week (mit Wochentags-Liste), every month (am Tag N oder am Letzten) und every year, dazu den Zusatz when done (Rechnung ab dem Abschluss statt dem Soll-Termin). Rechen-Basis ist fällig vor geplant vor Start; die relativen Abstände mehrerer Datumsfelder bleiben erhalten, Uhrzeiten wandern mit, Monats- und Jahres-Zyklen ohne den Ziel-Tag werden übersprungen. Die neue Instanz entsteht oberhalb (Standard) oder unterhalb der erledigten Zeile, in einer Undo-Transaktion mit dem Status-Wechsel.

### Geändert

- **Status-Typen und Toggling-Kette** (4T-0497): Jeder Task-Status trägt jetzt einen Typ (Offen, In Arbeit, Wartend, Erledigt, Abgebrochen, Keine Aufgabe) und ein Folge-Symbol. Der Klick auf eine Status-Box folgt jetzt der konfigurierten Kette, statt hart auf `[x]` abzuschließen; die Basis-Zustände `[ ]` und `[x]` bleiben als feste Umschaltung erhalten. Nur der Übergang auf den Typ Erledigt setzt das Erledigt-Datum und löst die Wiederholung aus. Der Einstellungs-Bereich warnt vor doppelt belegten Zeichen. Bestands-Konfigurationen verhalten sich unverändert (Migration mit Folge-Symbol `x`); ohne eigene Ketten-Konfiguration bleibt das bisherige Verhalten (Klick schließt ab) erhalten.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0500): zwei neue Funktions-Katalog-Einträge „Task-Marker" und „Global Filter" (je drei Keys, Abdeckungs-Matrix), der bestehende Katalog-Text der erweiterten Task-Status auf die neue Ketten-Semantik aktualisiert. Die Handbuch-Seite „Aufgaben-Listen" ist in allen fünf Sprachfassungen umfassend erweitert (Marker-Syntax selbst-demonstrierend, Typ und Folge-Symbol, Wiederholungs-Regeln, Automatik-Daten, Global Filter, ID und Abhängigkeiten). Insgesamt 41 neue i18n-Keys pro Sprache (Marker-Namen, Prioritäts-Stufen, Status-Typen, Einstellungs-Bereich, Erweiterungs-Bündel und Katalog), 205 neue Übersetzungen über fünf Sprachen; ein bestehender Katalog-Key (erweiterte Task-Status) inhaltlich angepasst.

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Der neue Umfang ist als interne Erweiterung `tasks` (Kategorie Werkzeuge) schaltbar, der Status-Typen-Ausbau sitzt in der bestehenden `task-states`; im Aus-Zustand bleiben Marker reiner Text und es wird nichts automatisch geschrieben. Bewusst ohne Registry-Abhängigkeit auf `task-states`: Marker und Automatik funktionieren auch mit den Basis-Checkboxen, die Status-Ketten der erweiterten Zeichen kommen bei aktivem `task-states` dazu. Als gebündelte Erweiterung mit eigenen `extension.tasks.*`-Keys registriert.
- Marker-Kern als prozess-neutrales, DOM-freies Shared-Modul (`src/shared/task-markers.js`, direkt unit-testbar); Round-Trip-Tests gegen reale Beispiel-Zeilen des Datei-Bestands sichern die Format-Treue.
- Neue Test-Substanz: Unit-Suiten `task-markers.test.js` (Marker-Parsing und verlustfreie Serialisierung), `task-recurrence.test.js` (Regel-Formen, when-done, Abstands-Erhalt, Monats-Überspringen), `task-state-chain.test.js` (Ketten-Toggle und Migration), `renderer/tasks.test.js` und `renderer/task-states.test.js` (Darstellung, Automatik, Aus-Zustand nach Muster `extensions-aus`) sowie E2E-Suite `aufgaben.spec.js` und Snapshot-/E2E-Fixtures (`render/task-marker.md`, `funktionen/aufgaben.md`).

## [0.61.0.616] - 2026-07-10 — Linter-Hinweis auf unpaarige `%%`-Kommentar-Marker

Nachauslieferungs-Task 4T-0533 im Epic 3E-0089 (Komfort-Bündel). Anlass war der Doku-Befund nach dem `%%`-Kommentar-Release 0.60.0 (4T-0532): Ein unpaarig öffnendes `%%` wirkt bis zum Dokument-Ende und blendet den restlichen Text still aus jeder Ansicht und jedem Export aus, ohne bisher im Editor sichtbar zu sein. Der Linter erhält deshalb eine siebte Regel, die genau dieses öffnende `%%` markiert.

### Neu

- **Linter-Regel „Unpaariger Kommentar-Marker"** (4T-0533): Die siebte Linter-Regel markiert das öffnende `%%` eines Kommentars, der bis zum Dokument-Ende nicht wieder geschlossen wird, mit einer dezenten Wellenlinie im Editor; der Hover-Tooltip erklärt, dass der Text bis zum Dokument-Ende in keiner Ansicht und keinem Export erscheint, und nennt die beiden Auswege (Kommentar mit `%%` schließen oder den Marker als `\%%` escapen). Die Regel greift nur bei aktiver Kommentar-Erweiterung; die Bereichs-Ermittlung nutzt den gemeinsamen Kommentar-Scanner (kein zweiter Parser).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert**: 2 neue i18n-Keys (`linter.unpairedCommentMarker.short` und `.tooltip`) in allen fünf Sprachen, insgesamt 10 neue Übersetzungen. Die Funktions-Katalog-Beschreibung des Linters nennt jetzt sieben statt sechs Mängel und ergänzt die unpaarigen Kommentar-Marker, die Handbuch-Seite „Werkzeuge" führt die neue Regel als Tabellen-Zeile, jeweils in allen fünf Sprachfassungen.

## [0.60.0.613] - 2026-07-10 — Komfort-Bündel: `%%`-Kommentare und Kommando-Palette

Epic 3E-0089 (Komfort-Bündel) aus dem Ideen-Programm 2026-07 (Einträge I-10 und I-11). Zwei Komfort-Funktionen als gemeinsames Release: **`%%`-Kommentare** blenden privaten Text aus jeder gerenderten Ansicht und jedem Export aus, ohne ihn aus dem Quelltext zu entfernen; die **Kommando-Palette** öffnet ein filterbares Popup aller Registry-Kommandos für den schnellen Zugriff per Tastatur. Festlegungen: Kommentare sind an keiner Ausgabe beteiligt (alle Ansichten, alle Exporte; PO-Bestätigung vom 2026-07-08) und als interne Erweiterung `comments` schaltbar; die Palette ist Kern (Erweiterungs-Prüfschritt vom 2026-07-10) und setzt auf der bestehenden Kommando-Registry auf (keine zweite Kommando-Liste). Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0479 bis 4T-0482).

### Neu

- **`%%`-Kommentare** (4T-0479): Text zwischen `%%`-Markern ist ein privater Kommentar. Er bleibt im Quelltext erhalten, erscheint aber in keiner gerenderten Ansicht (Gerendert, Live, Reading, PDF) und keinem Portable-Export. Kommentare wirken innerhalb einer Zeile und über mehrere Zeilen; in Code-Blöcken und Code-Spans bleibt `%%` gewöhnlicher Text, `\%%` schreibt ein wörtliches `%%`, ein unpaarig öffnendes `%%` wirkt bis zum Dokument-Ende. Die Entfernung ist zeilentreu, sodass die Scroll-Synchronisation korrekt bleibt. Der Editor färbt Kommentar-Bereiche dezent ein (Quelltext- und Live-Modus); im Live-Modus sind Kommentare auf inaktiven Zeilen ausgeblendet, ein vollständig auskommentierter Block (etwa eine Tabelle) wird nicht als Widget gerendert.
- **Kommando-Palette** (4T-0480): neues Registry-Kommando „Kommando-Palette" (Standard `Strg+K`, umbelegbar; Menü Ansicht → Kommando-Palette) öffnet ein filterbares Popup aller Kommandos. Ein Teilstring-Filter über die lokalisierten Namen grenzt die Liste ein, Pfeiltasten navigieren, Enter oder Klick führt aus, Esc schließt. Die Liste zeigt die belegten Kürzel inklusive eigener Umbelegungen; im aktuellen Kontext nicht verfügbare Kommandos erscheinen gedimmt, Kommandos abgeschalteter Erweiterungen erscheinen gar nicht. Die Filter-Logik liegt als wiederverwendbares Shared-Modul vor.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0481): neuer Funktions-Katalog-Eintrag „Kommentare" (Abdeckungs-Matrix F-111), 3 Katalog-Keys pro Sprache; die Kommando-Palette bringt 5 weitere i18n-Keys pro Sprache (Menü-Eintrag, Popup-Titel, Filter-Platzhalter, Leer-Hinweis, Kürzel-Beschreibung). Insgesamt 40 neue Übersetzungen (8 Keys × 5 Sprachen). Das Handbuch erhält das Kapitel „Kommentare" auf der Seite „Inline-Konstrukte" und das Kapitel „Kommando-Palette" auf der Seite „Werkzeuge" (Intro von fünf auf sechs Helfer erweitert), jeweils in allen fünf Sprachfassungen.

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die `%%`-Kommentare sind als interne Erweiterung `comments` (Kategorie Rendering) schaltbar; im Aus-Zustand bleibt `%%` in allen Ansichten und Exporten Literal (kein Strippen, keine Editor-Einfärbung, keine Live-Ausblendung), abgesichert per Aus-Zustand-Test. Die Kommando-Palette ist bewusst Kern (Bedien-Infrastruktur ohne Markdown-Charakter, zählt nur bestehende Registry-Kommandos auf); Kommandos abgeschalteter Erweiterungen filtert die vorhandene Dispatcher-Logik aus.
- Kommentar-Entfernung als code-bewusste Quelltext-Vorverarbeitung an den zwei Chokepoints `renderMarkdown` (Viewer, Portable-Anzeige, PDF, Reading, Live-Block-Widgets) und `convertMarkdownPortable` (exportierter Datei-Text); derselbe Bereichs-Finder speist Editor-Einfärbung und Live-Ausblendung, eine Quelle für garantierte Parität. Die Filter-Logik der Palette liegt als eigenständiges, DOM-freies Shared-Modul vor (direkt unit-testbar, für spätere Kommando-Platzierung wiederverwendbar).
- Neue Test-Substanz: `%%`-Kommentare mit 19 Unit-Tests (`prozent-kommentare.test.js`), 2 Snapshot-Fixtures (`kommentare.md`, `kommentare-portable.md`) und E2E-Suite `prozent-kommentare.spec.js` (PK-01 bis PK-03); Kommando-Palette mit 14 Unit-Tests des Filter-Moduls (`command-palette-filter.test.js`) und E2E-Suite `kommando-palette.spec.js` (KP-01 bis KP-05: Öffnen per Kürzel und Menü, Teilstring-Filter, Pfeil-Navigation mit Enter-Ausführung, Esc, gedimmte nicht verfügbare Kommandos).

## [0.59.0.609] - 2026-07-10 — Fix- und Konsistenz-Bündel: Blanks in Links, Panel-Höhen und Undo-Härtung

Epic 3E-0088 (Fix- und Konsistenz-Bündel) aus dem Ideen-Programm 2026-07 (Einträge I-15, I-05 und I-18 sowie ein Undo-Befund aus der Datentabellen-Umsetzung). Vier kleine PO-Anliegen als gemeinsames Release: Der Datei-Menüpunkt „Zuletzt" heißt jetzt „Zuletzt geöffnete Dateien"; Markdown- und Bild-Links akzeptieren Dateinamen mit Leerzeichen über die CommonMark-Schreibweise in spitzen Klammern; die gestapelten Sidebar-Panels erhalten manuell einstellbare Höhen über einen Zieh-Griff zwischen den Sektionen, und Lesezeichen sowie Inhaltsverzeichnis tauschen ihre Standard-Reihenfolge; ein Undo nach einem Checkbox- oder Status-Box-Klick im Gerenderten nimmt genau diesen Toggle zurück statt das Dokument zu leeren. PO-Entscheidungen vom 2026-07-10: Die Panel-Bestandsaufnahme widerlegte die vermutete vertikale Zentrierung (alle Panels stehen oben-bündig), daher Zieh-Griffe für die Panel-Höhen statt einer festen CSS-Vereinheitlichung; alle vier Anliegen sind Kern und nicht als Erweiterung schaltbar, weil ein Aus-Zustand jeweils dem Fehler-Zustand vor der Korrektur entspräche. Umgesetzt in fünf Umsetzungs-Tasks (4T-0474 bis 4T-0476, 4T-0484 und 4T-0531) plus Hilfe-/Handbuch-Task und Sammeltask (4T-0477 und 4T-0478).

### Neu

- **Manuell einstellbare Panel-Höhen** (4T-0475): Zwischen zwei gestapelten Sidebar-Panels liegt ein horizontaler Zieh-Griff; die Höhe des darüberliegenden Panels ist per Maus einstellbar und wird analog zur Sidebar-Breite persistiert, ein Doppelklick auf den Griff stellt die automatische Höhe wieder her. Das bisherige Layout bleibt Default bis zum ersten Ziehen. Grundlage war die Panel-Bestandsaufnahme mit Hardcopys für den PO: Sie widerlegte die vermutete vertikale Zentrierung (alle Panels oben-bündig); die reale Uneinheitlichkeit waren zwei Höhen-Klassen (Listen-Panels wachsen auf die volle Resthöhe, die übrigen stehen mit natürlicher Höhe).
- **Leerzeichen in Dateinamen bei Markdown- und Bild-Links** (4T-0476): Markdown- und Bild-Links akzeptieren das Ziel zusätzlich zur `%20`-Kodierung in der CommonMark-Schreibweise mit spitzen Klammern (`[Text](<Meine Notiz.md>)`, `![Alt](<Bild 01.png>)`). Damit erfassen jetzt auch der Backlinks-Index, das Outgoing-Links-Panel, der Bereichs-Linter und das Link-Update beim Umbenennen solche Ziele. Wiki-Links trugen Leerzeichen schon immer nativ.

### Geändert

- **Menüpunkt „Zuletzt geöffnete Dateien"** (4T-0474): Der Datei-Menüpunkt „Zuletzt" ist in „Zuletzt geöffnete Dateien" umbenannt (englisch „Recent Files", entsprechend in Französisch, Spanisch und Italienisch); der Zugangs-Text im Funktions-Katalog ist nachgezogen.
- **Standard-Reihenfolge von Lesezeichen und Inhaltsverzeichnis getauscht** (4T-0475): Im Default steht Lesezeichen jetzt vorn, das Inhaltsverzeichnis rückt an die frühere Lesezeichen-Position. Bestehende, selbst angepasste Sidebar-Layouts bleiben unverändert; nur die Werks-Anordnung ändert sich.

### Behoben

- **Klick auf `<…>`-Link im Live-Modus** (4T-0476): Ein Klick auf einen Markdown-Link in spitze-Klammern-Schreibweise lief im Live-Modus ins Leere; er öffnet jetzt das Ziel. Das Link-Update beim Umbenennen erzeugt für neue Namen mit Leerzeichen automatisch die `<…>`-Form, bereits `%`-kodierte Ziele behalten ihre Schreibweise.
- **Undo nach Checkbox- oder Status-Box-Klick** (4T-0484): Ein `Strg+Z` direkt nach einem Checkbox- oder Status-Box-Klick im Gerenderten leerte das gesamte Dokument, weil die Toggle-Änderung in der Editor-Historie mit dem initialen Setzen des Dokument-Inhalts verschmolz; jetzt nimmt das Undo genau den Toggle zurück. Dieselbe Härtung gilt für den Task-Toggle im Live-Modus, „Anker anlegen" und das Anker-Umbenennen im Block-Eigenschaften-Panel sowie Suchen-Ersetzen; Regressionstest 4t-0484 mit drei Fällen.
- **Panel-Sichtbarkeit beim Start** (4T-0531): Ein als sichtbar gespeichertes Kalender-, Block-Eigenschaften-, Datei-Graph-, Bereichs- oder Unterseiten-Panel blieb nach dem App-Start verborgen, bis sein Schalter einmal betätigt wurde. Die Wiederherstellung wendet die Sichtbarkeit jetzt generisch über die Panel-Registry an; künftige Panels sind automatisch abgedeckt (PO-Auftrag aus der Test-Iteration, Nebenbefund der Panel-Bestandsaufnahme).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0477): neuer Funktions-Katalog-Eintrag „Panel-Höhen" (Abdeckungs-Matrix F-110), 3 neue i18n-Keys pro Sprache; der Katalog-Eintrag „Links" nennt zusätzlich die Leerzeichen-Schreibweisen, und der Menü-Text ändert bestehende Werte in fünf Sprachen. Die Handbuch-Seite „Verlinkung" erhält den Abschnitt „Dateinamen mit Leerzeichen", die Seite „Sidebar" den Abschnitt „Panel-Höhen" samt der auf elf Panels und die neue Reihenfolge aktualisierten Panel-Aufzählung, jeweils in allen fünf Sprachfassungen.

## [0.58.0.600] - 2026-07-10 — Tab-Gruppen: benannte, farbige Gruppen im Tab-Streifen

Epic 3E-0085 (Tab-Gruppen) aus dem Ideen-Programm 2026-07. Tabs lassen sich wie im Browser zu **benannten, farbigen Gruppen** zusammenfassen: Die Mitglieder stehen zusammenhängend hinter einem farbigen Gruppen-Kopf im Tab-Streifen, ihre Reiter tragen eine Unterstreichung in der Gruppen-Farbe; ein Klick auf den Kopf klappt die Gruppe zu und auf. Die Verwaltung läuft über Tab- und Kopf-Kontextmenü sowie die bestehende Tab-Zieh-Mechanik; Name, Farbe, Mitglieder und Klapp-Zustand überleben die Sitzungs-Wiederherstellung. PO-Entscheidungen vom 2026-07-08: Browser-Muster als Leitbild, feste Acht-Farben-Palette (theme-abgestimmt, keine freie Farbwahl in v1), Gruppen als Anzeige-Struktur des Tab-Streifens (das Tab-Modell bleibt führend). Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0459 bis 4T-0463).

### Neu

- **Gruppen-Modell und Sitzungs-Persistenz** (4T-0459): Gruppen-Datenmodell je Tab-Leiste (Name, Farbe aus der Acht-Farben-Palette, Mitglieder über eine Gruppen-Kennung am Tab, Klapp-Zustand) mit reinen, unit-getesteten Invarianten-Helfern: Mitglieder liegen immer zusammenhängend, leere Gruppen entfallen, Tab-Operationen (schließen, verschieben, neu, Leisten-Wechsel) erhalten die Invarianten. Die Sitzung speichert Gruppen additiv und stellt sie beim Start wieder her; ältere Sitzungs-Stände ohne Gruppen laden unverändert.
- **Tab-Streifen-UI mit Klappen und Ziehen** (4T-0460): Gruppen-Kopf mit Name auf Farbfläche vor dem ersten Mitglied, farbige Unterstreichung der Mitglieder-Reiter (der aktive Reiter übernimmt die Gruppen-Farbe), zugeklappt bleibt nur der Kopf mit Mitglieder-Zahl sichtbar. Kanten-Fälle bewusst festgelegt: Beim Zuklappen wechselt ein betroffener aktiver Tab zum nächsten sichtbaren Tab (gibt es keinen, bleibt die Gruppe offen); das Aktivieren eines verborgenen Mitglieds — etwa beim Datei-Öffnen — klappt die Gruppe auf; nach dem Schließen des letzten sichtbaren Tabs wird notfalls ein Tab einer zugeklappten Gruppe aktiviert und die Gruppe geöffnet. Ziehen mit Gruppen-Semantik: Ablegen strikt im Block-Inneren oder auf dem Kopf = Beitritt, Herausziehen aus dem Block = Austritt, die eigene Gruppe hält ihren Tab auch an den Block-Rändern; das Ziehen des Kopfs verschiebt die ganze Gruppe, fremde Blöcke werden nie gespalten. Die Palette ist auf helles und dunkles Theme abgestimmt (Light kräftig, Dark pastellig).
- **Kontextmenü-Verwaltung mit Namens- und Farb-Dialog** (4T-0461): Tab-Kontextmenü mit „Neue Gruppe mit diesem Tab", „Zu Gruppe hinzufügen" (Untermenü der Gruppen der Leiste) und „Aus Gruppe entfernen"; Kopf-Kontextmenü mit „Umbenennen und Farbe…", „Gruppe auflösen" (Tabs bleiben offen) und „Gruppe schließen" (alle Mitglieder mit den üblichen Speichern-Dialogen; ein Abbruch stoppt den Vorgang). Der Neue-Gruppe-Fluss legt die Gruppe mit Standard-Name („Gruppe n") und nächster freier Palette-Farbe an und öffnet direkt den Dialog mit Namens-Feld und Acht-Farben-Auswahl.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0462): neuer Funktions-Katalog-Eintrag „Tab-Gruppen" (Abdeckungs-Matrix F-109); die Handbuch-Seite „Applikationen, Fenster und Bereiche" erhält in allen fünf Sprachfassungen den Abschnitt „Tab-Gruppen" (Anlegen, Befüllen per Menü und Ziehen, Klappen, Verwalten, Leisten-Bindung, Sitzungs-Verhalten, Abschaltbarkeit). Insgesamt 23 neue i18n-Keys pro Sprache über das Epic (Menü-Einträge, Dialog, Farb-Namen, Kopf-Tooltip, Katalog).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Tab-Gruppen sind als interne Erweiterung `tab-groups` (Kategorie Werkzeuge) schaltbar; im Aus-Zustand rendert der Streifen flach und die Gruppen-Menüpunkte entfallen, Modell und Sitzungs-Daten bleiben erhalten (das Wieder-Einschalten stellt die Gruppen unverändert zurück); Kommandos gibt es keine.
- Sitzungs-Schema additiv erweitert (Gruppen-Liste pro Leiste, Gruppen-Index pro Tab, ausgedrückt auf den persistierten Tabs); gruppen-freie Sitzungen erzeugen exakt das bisherige Schema, defekte Persistenz-Werte werden beim Laden verworfen und der Zusammenhang wird repariert.
- Neue Test-Substanz: E2E-Funktions-Suite `tab-gruppen.spec.js` (TG-01 bis TG-08: Menü-Flüsse, Klappen mit Aktivierungs-Wechsel, Drop auf den Kopf, Sitzungs-Wiederherstellung inklusive Klapp-Zustand, Aus-/An-Zustand der Erweiterung) und Unit-Suite `renderer/tab-groups.test.js` (30 Tests: Invarianten, Einfüge-Semantik, Klapp-Helfer, Block-Verschiebung, Normalisierung, Snapshot-Roundtrip, Erweiterungs-Registrierung).

## [0.57.0.591] - 2026-07-10 — Graphenansicht: Link-Graph als Bereichs-Tab und Datei-Panel

Epic 3E-0084 (Graphenansicht) aus dem Ideen-Programm 2026-07. Die Link-Beziehungen der Markdown-Dateien werden als **interaktiver Graph** sichtbar: jede Datei ein Knoten, jeder Link eine gerichtete Kante mit Pfeil vom verlinkenden zum verlinkten Dokument, beidseitige Verlinkung als Doppel-Pfeil. Zwei Formen auf demselben Kern und Renderer: der **Bereichs-Graph** als eigener read-only Tab über alle Dateien des Bereichs und der **Datei-Graph** als Sidebar-Panel für das Umfeld der aktiven Datei mit Tiefe 1 bis 5. PO-Entscheidungen vom 2026-07-08: zweigeteilter Ort (Tab plus Panel), Eigenbau ohne neue Dependency (SVG plus iteratives Kraft-Layout mit deterministischem Start), nur Markdown-Dateien als Knoten, Datenbasis ist der bestehende Bereichs-Link-Index. Umgesetzt in vier Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0453 bis 4T-0458).

### Neu

- **Graph-Kern** (4T-0453): prozessneutrales Shared-Modul mit Knoten-/Kanten-Modell aus dem Link-Index (Dedup, Doppel-Pfeil-Verschmelzung gegenläufiger Link-Paare), Tiefen-Expansion per Breitensuche (Tiefe 1 bis 5, Richtungen eingehend/ausgehend/beide, zyklenfest, induzierter Teilgraph) und deterministischem Kraft-Layout: Start-Positionen aus einem Hash der Datei-Pfade statt Zufall, gleicher Graph sieht reproduzierbar gleich aus; beim Aktualisieren starten Bestands-Knoten an ihrer bisherigen Position (inkrementelles Nachfedern), die Abstoßung läuft über ein räumliches Gitter statt O(n²). Daten liefert der neue IPC-Endpunkt `graph:edges` aus dem Link-Graph-Cache des Bereichs-Index.
- **Graph-Renderer mit Interaktion** (4T-0454): SVG-Komponente mit Knoten (Kreis plus Titel-Label), gerichteten Kanten mit Pfeilspitzen und Doppel-Pfeilen, Theme-konformen Farben (hell/dunkel) und hervorgehobener aktiver Datei. Zoom über das Mausrad um den Zeiger, Verschieben der Fläche, Knoten einzeln ziehbar (Position bleibt für die Sitzungs-Dauer, auch über Aktualisierungen), Hover hebt Knoten samt direkten Nachbarn und beteiligten Kanten hervor (Rest gedimmt), Klick öffnet die Datei bzw. springt zum offenen Tab; Tooltip mit Pfad bei Namens-Duplikaten. Ober-Grenze: ab 1500 Knoten rendert der Graph die am stärksten vernetzten plus lokalisierten Hinweis.
- **Bereichs-Graph als Tab** (4T-0455): read-only System-Seite mit Titel „Graph: <Bereichs-Name>", ein Tab pro Fenster (erneutes Öffnen aktiviert den bestehenden). Steuerleiste mit Richtungs-Filter, Datei-Zähler und Neu-Anordnen-Knopf. Der Richtungs-Filter wirkt relativ zur aktiven Datei des Fensters: „Eingehend"/„Ausgehend" zeigen den von dort in beliebiger Tiefe erreichbaren Teilgraph; ohne aktive Datei bleibt der volle Graph mit Hinweis. Zugang über Ansicht → Bereichs-Graph (Registry-Kommando, Kürzel belegbar; ohne Bereich deaktiviert) und über das neue Kontextmenü des Bereichs-Panels. Index-Änderungen laden debounced nach, bestehende Knoten behalten ihre Position.
- **Datei-Graph als Sidebar-Panel** (4T-0456): zwölftes Sidebar-Panel (links/rechts andockbar, Reiter-Gruppen-fähig) mit Tiefe 1 bis 5 und Richtungs-Filter im Panel-Kopf (Sitzungs-Zustand je Spalte). Das Panel folgt der aktiven Datei beim Tab-Wechsel; Dateien ohne Link-Beziehungen zeigen den Einzel-Knoten mit Hinweis; außerhalb eines Bereichs arbeitet das Panel über den Best-Effort-Suchraum der Ordner-Wurzel mit dezentem Hinweis. Zugang über Ansicht → Datei-Graph (Registry-Kommando, Kürzel belegbar).

### Behoben

- **Tab-Wechsel zwischen zwei System-Seiten** (PO-Befund der Release-Test-Iteration, unter 4T-0455): Teilten sich zwei System-Tabs eine Spalte (z.B. Bereichs-Graph und Einstellungen), zeigte der Tab-Wechsel die jeweils andere Seite weiter an — der Mount-Guard der System-Seiten prüfte den geteilten Container nicht auf Besitz. Bestands-Problem, das erst mit der zweiten koexistierenden System-Seite sichtbar wurde (Einstellungen und Historie waren gemeinsam ebenso betroffen); mit Regressionstest.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0457): zwei neue Funktions-Katalog-Einträge „Bereichs-Graph" und „Datei-Graph" (Abdeckungs-Matrix F-107/F-108, Kürzel-Einträge S-076/S-077); neue Handbuch-Seite „Graphenansicht" (beide Formen, Bedienung mit Zoom/Pan/Ziehen, Pfeil-Semantik inklusive Doppel-Pfeil, Tiefe und Richtung, Grenzen) in allen fünf Sprachfassungen; Überblicks-Links ergänzt. Insgesamt 30 neue i18n-Keys pro Sprache über das Epic (Menü, Steuerleisten, Hinweise, Katalog, Erweiterung, Seiten-Titel).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Graphenansicht ist als interne Erweiterung `graph-view` (Kategorie Vernetzung) schaltbar; im Aus-Zustand entfallen beide Kommandos, das Panel und der Kontextmenü-Eintrag des Bereichs-Panels. Bewusst ohne Registry-Abhängigkeit auf die Wiki-Link-Erweiterung (der Link-Graph wertet Wiki- und Markdown-Links aus dem Kern-Link-Index aus).
- System-Seiten-Registry um optionale dynamische Tab-Titel erweitert (`title()`-Funktion; der Bereichs-Graph trägt so den Bereichs-Namen im Tab).
- Wächter-Pflege: Sidebar-Default-Reihenfolge (SL-01) und Panel-Zeilen der Layout-Konfiguration (ES-10) um das Datei-Graph-Panel erweitert.
- Neue Test-Substanz: E2E-Funktions-Suite `graphenansicht.spec.js` (GA-01 bis GA-06: Öffnen mit Klick-Navigation, Richtungs-Filter, Tab-Wiederverwendung, Hinweis ohne Bereich, Kontextmenü, Panel mit Tiefe/Richtung/Datei-Folge), Unit-Suiten `graph-core.test.js` (Modell, Expansion, Ober-Grenze, Layout-Determinismus, Erweiterungs-Filterung), `graph-index.test.js` (Kanten-Lieferung aus dem Link-Index) und `renderer/graph-view.test.js` (SVG-Struktur, Hover, Klick-vs.-Drag, Positions-Erhalt).

## [0.56.0.582] - 2026-07-09 — Eigenschafts-Profile: zentrale Feld-Definitionen mit Wertebereichen

Epic 3E-0083 (Eigenschafts-Profile) aus dem Ideen-Programm 2026-07. Eigenschaften lassen sich zentral definieren: Ein **Profil** ist eine normale Markdown-Datei im Profil-Ordner des Bereichs, deren Frontmatter pro Feld Name, Typ, optional einen festen Wertebereich (Einfach- oder Mehrfach-Auswahl) und einen Vorgabe-Wert festlegt. Dokumente ordnen sich über ein Frontmatter-Feld zu (Default `class`, pro Bereich umbenennbar); ein **Bereichs-Standard-Profil** gilt für alle Dateien. Properties-Editor und Block-Eigenschaften-Panel schlagen die definierten Felder vor, bedienen Wertebereiche als Auswahl-Listen, übernehmen den Typ aus der Definition und zeigen bei Abweichungen einen weichen Hinweis statt einer Blockade. PO-Entscheidungen vom 2026-07-08: Profile als Markdown-Dateien plus Bereichs-Standard-Profil, Zuordnungs-Feld `class`, Typ/Wertebereich/Default in v1 (Lookup- und Formel-Typen vertagt), weiche Validierung, Geltung für Dokument- UND Block-Eigenschaften (Einlösung der Vormerkung aus dem Block-Metadaten-Konzept). Umgesetzt in fünf Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0446 bis 4T-0452).

### Neu

- **Profil-Modell und Bereichs-Konfiguration** (4T-0446): neue optionale `propertyProfiles`-Sektion der Bereichsdatei `Area_Settings.mdda` (Profil-Ordner, Zuordnungs-Feldname, Standard-Profil) nach dem Fehler-Isolations-Muster; Profil-Datei-Format mit `fields`-Liste im Frontmatter (Name, Typ `string`/`multistring`/`number`/`boolean`/`date`/`multiline`, Werte-Liste, Mehrfach-Auswahl, Default). Weiche Validierung auch hier: defekte Einzel-Definitionen (unbekannter Typ, Duplikat-Feldname, `multiple` ohne `values`) setzen nur sich selbst aus und werden als Hinweis gesammelt; ein unpassender Default entfällt, das Feld bleibt. Lese-/Schreib-IPC mit Broadcast für die sofortige Aktualisierung der Editoren.
- **Definitions-Auflösung pro Datei und Block** (4T-0447): Vereinigung der Definitionen aus den zugeordneten Profilen (Frontmatter-Reihenfolge) plus Standard-Profil mit deterministischen Konflikt-Regeln — zugeordnetes Profil vor Standard-Profil, unter Zugeordneten gewinnt das zuerst genannte; Profil- und Feldnamen matchen case-insensitiv. Blöcke einer Datei erben die Datei-Auflösung. Der Profil-Katalog liest die Profil-Dateien mit mtime-validiertem Cache pro Datei: Profil-Änderungen wirken ohne Neustart, auch bei externen Edits; die Editoren liefern die Zuordnung aus dem Live-Frontmatter (ungespeicherte Änderungen am Zuordnungs-Feld wirken sofort).
- **Properties-Editor-Anbindung** (4T-0448): „Eigenschaft hinzufügen" öffnet bei konfigurierten Profilen ein Vorschlags-Menü — zuerst die definierten, noch nicht gesetzten Felder (mit Profil-Kennzeichnung), danach die bisherigen Standard-Vorschläge, am Ende „Eigenes Feld"; die Auswahl legt das Feld mit Definitions-Typ und Default an. Wertebereichs-Felder rendern als Auswahl-Liste („Eigener Wert…" bleibt der freie Weg) bzw. als Chips-Leiste mit Werte-Vorschlägen; definierte Felder zeigen den Definitions-Typ (Typ-Wechsler gesperrt, Tooltip nennt das Profil) und eine dezente Kennzeichnung. Typ-Abweichung oder Wert außerhalb des Bereichs erzeugen ein Hinweis-Symbol mit lokalisiertem Tooltip — keine Blockade, keine Wert-Änderung; bei Typ-Abweichung bleibt der Wechsler frei, damit der Wert per Koerzierung auf den Definitions-Typ gebracht werden kann. Ohne Konfiguration bleibt das Verhalten exakt wie bisher.
- **Block-Panel-Anbindung** (4T-0449): identisches Verhalten im Block-Eigenschaften-Panel (Vorschlags-Menü, Auswahl-Listen, Typ-Vorgabe, Hinweise) über dieselbe gemeinsame Logik — ein Verhalten, zwei Oberflächen. Die bestehenden Vorschläge aus den im Dokument verwendeten Block-Schlüsseln bleiben und rangieren hinter den Definitions-Feldern (Menü und Schlüssel-Vorschlagsliste).
- **Einstellungs-Bereich „Eigenschafts-Profile"** (4T-0450): Profil-Ordner (wurzel-relativ, mit OS-Ordner-Auswahl), Zuordnungs-Feldname und Standard-Profil (Auswahl aus den erkannten Profilen); darunter die Profil-Liste mit Definitions-Anzahl und Validierungs-Hinweisen (Tooltip mit Einzel-Hinweisen inklusive YAML-Fehler), „Aktualisieren"-Button und Klick-Pfad in die Profil-Datei. Persistiert in der Bereichsdatei; Änderungen wirken sofort, ohne Neustart.

### Geändert

- **Listen-Felder: Direkt-Übernahme und keine Duplikate** (PO-Befunde der Release-Test-Iteration, unter 4T-0448): Die Übernahme eines Werts aus der Vorschlagsliste einer Mehrfach-Auswahl wird in beiden Eigenschafts-Editoren direkt zum Chip (ohne zusätzliches Enter; eigene Werte laufen weiter über Enter), und die Chips-Leiste der Listen-Felder übernimmt denselben Wert nicht mehr doppelt (bestehende Duplikate in Dateien bleiben unangetastet).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0451): neuer Funktions-Katalog-Eintrag „Eigenschafts-Profile" (Abdeckungs-Matrix F-106); neue Handbuch-Seite „Eigenschafts-Profile" (Profil-Dateien und Definitions-Format mit Beispiel-Frontmatter, Zuordnung und Standard-Profil, Konflikt-Regeln, Wirkung in beiden Editoren, weiche Validierung, Grenzen) in allen fünf Sprachfassungen; Überblicks-Links ergänzt. Insgesamt 43 neue i18n-Keys pro Sprache über das Epic (Editor-Texte, Einstellungs-Bereich mit elf Hinweis-Codes, Katalog, Seiten-Titel).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Eigenschafts-Profile sind als interne Erweiterung `property-profiles` (Kategorie Werkzeuge) schaltbar; im Aus-Zustand verhalten sich beide Editoren exakt wie ohne Konfiguration, der Einstellungs-Bereich ist ausgeblendet; Kommandos gibt es keine.
- Wächter-Pflege: Bereichs-Anzahl der Einstellungs-Navigation (ES-05) und der Registry-Reihenfolge-Test der Einstellungs-Seite um den Bereich „Eigenschafts-Profile" erweitert.
- Neue Test-Substanz: E2E-Funktions-Suite `eigenschafts-profile.spec.js` (PP-01 bis PP-06: Vorschlags-Menü mit Profil-Badges und Default-Anlage, Auswahl-Liste mit Persistenz, weicher Hinweis bei Wert außerhalb, unverändertes Verhalten ohne Konfiguration, Block-Panel mit `.mdd`-Persistenz, Einstellungs-Bereich mit Fehler-Hinweis und Klick-Pfad, Aus-Zustand der Erweiterung), Unit-Suiten `property-profiles.test.js` (36 Tests: Format, weiche Validierung, Auflösungs- und Editor-Logik, Registry-Eintrag) und `profile-catalog.test.js` (7 Tests: Katalog mit mtime-validiertem Cache).

## [0.55.0.574] - 2026-07-09 — Journale: periodische Dokumente mit Kalender-Panel und Navigations-Block

Epic 3E-0081 (Journale) aus dem Ideen-Programm 2026-07. Ein **Journal** ist eine definierte Serie periodischer Dokumente einer Granularität (Tag, Woche, Monat, Quartal, Jahr) mit Ordner- und Namens-Schema aus Datums-Platzhaltern, optionaler Vorlage und automatischen Frontmatter-Datums-Properties; **Regale** gruppieren mehrere Journale. Einträge werden über zwei Registry-Kommandos, das neue Kalender-Panel oder den Navigations-Block geöffnet bzw. beim ersten Zugriff angelegt. PO-Entscheidungen vom 2026-07-08: fünf Granularitäten mit Regalen, Kalender-Panel und Navigations-Block, Journale nur pro Bereich, Wochen fest nach ISO 8601; Nummerierung, Auto-Anlage und Dekorationen vertagt. Der Anlage-Pfad koppelt an die Vorlagen-Infrastruktur aus 0.54.0. Umgesetzt in sechs Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0431 bis 4T-0438).

### Neu

- **Journal-Modell und Bereichs-Konfiguration** (4T-0431): neue optionale `journals`-Sektion der Bereichsdatei `Area_Settings.mdda` (Regale plus Journal-Definitionen: Name, Regal, Granularität, Ordner-/Namens-Schema, Vorlage, Start-/End-Datum, Property-Feldnamen) nach dem Fehler-Isolations-Muster: defekte Einzel-Einträge entfallen, eine defekte Sektion setzt nur die Journal-Funktion aus. Lese-/Schreib-IPC mit Broadcast für die sofortige Aktualisierung von Panel und Kommandos.
- **Perioden-Kern mit ISO-KW-Rechnung** (4T-0432): prozess-neutrales Shared-Modul für Perioden-Arithmetik (Tag/Woche/Monat/Quartal/Jahr, fest nach ISO 8601 mit Montag-Start und Donnerstags-Regel), Schema-Auflösung der Eintrags-Pfade über die Vorlagen-Engine (nur Datums-Platzhalter; Pfad-Sicherung gegen Ausbrüche) und Eintrags-Ermittlung. Der gemeinsame Format-Kern kennt drei neue kuratierte Token `ww` (ISO-Kalenderwoche), `kkkk` (KW-Jahr) und `q` (Quartals-Nummer) — sie stehen damit auch der `dateformat`-Funktion der Abfrage-Sprache und den Datums-Platzhaltern der Vorlagen zur Verfügung (z.B. `kkkk-KWww` → `2026-KW28`, `yyyy-Qq` → `2026-Q3`).
- **Journal-Kommandos und Anlage-Pfad** (4T-0433): „Heutiger Journal-Eintrag" und „Journal-Eintrag für Datum…" (Menü Datei, ohne Bereich deaktiviert; per Einstellungen mit Kürzeln belegbar; Auswahl-Popup bei mehreren Journalen, Datums-Dialog mit Vorbelegung). Der eine gemeinsame Öffnen-/Anlage-Pfad: existierende Einträge öffnen, fehlende entstehen mit Ordner-Kette, gefüllter Journal-Vorlage (volle Platzhalter-Engine inklusive Dialog-Kette; Datums-Platzhalter am Perioden-Start ausgewertet, `{{date}}` liefert das Perioden-Datum) und automatischen Datums-Properties (Tages-Journale nur Datum, mehrtägige Perioden Start und Ende; Feldnamen pro Journal). Dialog-Abbruch erzeugt keine Datei; die Journal-Vorlage übersteuert Ordner-Regeln; Start-/End-Datum kappen Anlage und Navigation.
- **Kalender-Panel** (4T-0434): elftes Sidebar-Panel (links/rechts andockbar, Statusbar-Toggle) mit Monatsansicht: Wochentags-Kopf mit Montag-Start, ISO-KW-Spalte, Punkte an Tagen mit vorhandenem Eintrag, Heute-Hervorhebung, Monats-Blättern und Heute-Knopf, Filter über Regale und Journale. Tag-Klick öffnet bzw. legt den Tages-Eintrag an, KW-Klick den Wochen-Eintrag; die Existenz-Punkte lädt ein Batch-Abruf pro sichtbarem Monat (begrenzter Scan, kein Voll-Index).
- **Journal-Navigations-Block** (4T-0435): neuer Fence `perspective-journal-nav` zeigt im Journal-Eintrag die aktuelle Periode groß (mit Zusatz-Zeile bei der aktuellen Periode), die übergeordneten Perioden desselben Regals (Lücken werden ausgelassen) und Pfeile zu voriger/nächster Periode; Klicks öffnen bzw. legen an. Kontext-Ermittlung über den Pfad-Abgleich mit der Schema-Auflösung (keine Pfad-Heuristik); identisch in Render-Pane, Live-Modus und Reading; der PDF-Export wartet die Befüllung ab, der Portable-Export ersetzt den Fence durch die statische Perioden-Beschriftung. Außerhalb eines Journal-Eintrags erscheint ein Hinweis.
- **Einstellungs-Bereich „Journale"** (4T-0436): zweistufige Navigation (PO-Befund der Test-Iteration) — die Übersicht zeigt die Regale (anlegen, umbenennen mit Nachzug der Zuordnungen, löschen, Journal-Zähler); „Öffnen" an einem Regal führt zur Detailansicht mit den Journal-Editor-Formularen genau dieses Regals (plus Zeile „Ohne Regal"), „Regal schließen" zurück. Formulare mit Live-Vorschau des aufgelösten Beispiel-Pfads, Format-Prüfung über die Vorlagen-Engine, Vorlagen-Auswahl aus dem Vorlagen-Ordner, Warnung bei Schema-Änderung bestehender Journale (Dateien werden nicht umbenannt) und Datums-/Reihenfolge-Validierung. Änderungen wirken sofort, ohne Neustart.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0437): drei neue Funktions-Katalog-Einträge „Journale", „Kalender-Panel" und „Journal-Navigation" (Abdeckungs-Matrix F-103 bis F-105, Kürzel-Einträge S-074/S-075); neue Handbuch-Seite „Journale" (Modell, Schemata mit KW-Jahres-Ordner-Beispiel, Kalender-Panel, Navigations-Block mit selbst-demonstrierendem Live-Block, ISO-Wochen-Regeln, Migrations-Hinweis für bestehende periodische Bestände) in allen fünf Sprachfassungen; Überblicks-Links ergänzt; die Format-Token-Listen der Seiten „Vorlagen" und „Perspective-Abfrage" nennen die neuen Token `ww`/`kkkk`. Insgesamt 88 neue i18n-Keys pro Sprache über das Epic (Kommandos, Dialoge, Hinweise, Kalender, Navigations-Block, Einstellungs-Bereich, Katalog, Seiten-Titel).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Journale sind als interne Erweiterung `journals` (Kategorie Werkzeuge) schaltbar; im Aus-Zustand entfallen beide Kommandos, das Kalender-Panel und der Einstellungs-Bereich, der Navigations-Fence fällt auf den regulären Code-Block zurück. Bewusst ohne Registry-Abhängigkeit auf die Vorlagen-Erweiterung (Daten- statt Kommando-Kopplung).
- Wächter-Pflege: Sidebar-Default-Reihenfolge (SL-01), Panel-Zeilen der Layout-Konfiguration (ES-10), Bereichs-Anzahl der Einstellungs-Navigation (ES-05) und der Registry-Reihenfolge-Test der Einstellungs-Seite um Kalender-Panel bzw. Journale-Bereich erweitert.
- Neue Test-Substanz: E2E-Funktions-Suite `journale.spec.js` (JR-01 bis JR-07: Kommandos mit Vorlage und Properties, Wiederöffnen ohne Doppel-Anwendung, Datums-Grenzen, Kalender-Panel mit Punkten und KW-Klick, Navigations-Block mit Eltern-Sprung, Einstellungs-Weg mit sofortiger Wirkung), Unit-Suiten `journal-core.test.js` (Modell-Normalisierung) und `journal-perioden.test.js` (ISO-KW-Grenzfälle, Schema-Auflösung, Kontext-Ermittlung, Monats-Gitter, Property-Injektion, Export-Ersetzung), Snapshot-Fixture `journal-nav.md`.

## [0.54.0.564] - 2026-07-09 — Vorlagen: Platzhalter-Engine, Anwendungs-Kommandos und Ordner-Regeln

Epic 3E-0080 (Vorlagen) aus dem Ideen-Programm 2026-07. Vorlagen sind gewöhnliche Markdown-Dateien in konfigurierbaren Vorlagen-Ordnern (pro Bereich in der Bereichsdatei, App-global als Fallback; Bereichs-Werte übersteuern vollständig). Beim Anwenden wertet eine Platzhalter-Engine kuratierte Platzhalter aus — Datum/Zeit mit Offset und Format, Titel und Ordner der Zieldatei, Eingabe- und Auswahl-Dialoge, Zwischenablage, Cursor-Ziel. PO-Entscheidungen: kuratierte Platzhalter statt freiem JavaScript (Skript-Stufe vertagt), Datums-Arithmetik und Formate über den Typ-Kern der Query-Sprache (keine zweite Datums-Bibliothek), Ordner-Regeln in v1, Vorlagen-Hotkeys vertagt. Umgesetzt in fünf Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0424 bis 4T-0430).

### Neu

- **Vorlagen-Quellen und Datenpfad** (4T-0424): Auflösung des wirksamen Vorlagen-Ordners (Bereichs-Konfiguration übersteuert die globale vollständig; Bereichs-Ordner wurzel-relativ mit Toleranz für absolute Pfade), Vorlagen-Liste inklusive Unterordnern (frisch pro Aufruf, kein Watcher/Cache) und abgesicherter Lese-Pfad (Pfad-Normalisierung gegen `..`-Ausbrüche, Zugriffe nur innerhalb des Vorlagen-Ordners).
- **Platzhalter-Engine** (4T-0425): prozess-neutrales Shared-Modul mit Zwei-Phasen-Schnittstelle (analysieren, dann füllen — interaktive Platzhalter beantwortet der Aufrufer per Dialog). Platzhalter-Satz v1: `{{date}}`/`{{time}}` mit Offset (Dauer-Einheiten der Query-Sprache) und Format (`dateformat`-Token), `{{title}}`, `{{folder}}`, `{{prompt:Frage[:Default]}}`, `{{select:Frage:a,b,…}}`, `{{clipboard}}`, `{{cursor}}`/`{{cursor:n}}` (nummerierte Ziel-Marker), Escape `\{{`. Identische Fragen werden nur einmal erhoben; Fehler brechen strukturiert mit Code und Position ab (keine halb gefüllte Datei).
- **Anwendungs-Kommandos und Dialoge** (4T-0426): „Neue Datei aus Vorlage" (Menü Datei; filterbares Auswahl-Popup mit Unterordner-Gruppen und Pfeiltasten-Navigation, Dateiname mit Unterseiten-Schreibweise, sequenzielle Dialog-Kette, Datei entsteht gefüllt, Cursor springt auf das erste Ziel) und „Vorlage einfügen" (Editor-Kontextmenü → Einfügen; eine Editor-Transaktion, Undo in einem Schritt). Zielordner ist der Ordner der aktiven Datei bzw. die Bereichs-Wurzel; ohne beides fragt ein Ordner-Dialog nach dem Ziel (Befund der Release-Test-Iteration). Abbruch irgendeines Dialogs bricht das gesamte Anwenden ab; beide Kommandos sind über die Einstellungen mit Kürzeln belegbar.
- **Ordner-Regeln** (4T-0427): Zuordnung Zielordner → Vorlage; neue Dateien über die App (Bereichs-Panel, Unterseiten-Anlage) erhalten automatisch die Vorlage samt Dialog-Kette und Cursor-Sprung. Tiefster Treffer gewinnt (leerer Ordner-Eintrag = Wurzel-Regel), der Vorlagen-Ordner ist ausgenommen, der explizite Vorlagen-Weg hat Vorrang; Dialog-Abbruch legt die Datei leer an (mit Hinweis). Extern angelegte Dateien durchlaufen den Trigger nicht (dokumentierte Grenze).
- **Einstellungs-Bereich „Vorlagen"** (4T-0428): globaler Vorlagen-Ordner (mit OS-Ordner-Auswahl) und globale Regel-Tabelle; bei Bereichs-Fenstern zusätzlich die Bereichs-Konfiguration (Schalter, Ordner wurzel-relativ, eigene Regel-Tabelle), gespeichert in einer neuen optionalen `templates`-Sektion der Bereichsdatei `Area_Settings.mdda` (Fehler-Isolations-Muster; Datei entsteht erst beim ersten Setzen, defekte Datei wird nie überschrieben). Änderungen wirken sofort, ohne Neustart.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0429): zwei neue Funktions-Katalog-Einträge „Vorlagen" und „Ordner-Regeln" (Abdeckungs-Matrix F-101/F-102, Kürzel-Einträge S-072/S-073); neue Handbuch-Seite „Vorlagen" mit Vorlagen-Ordner samt Bereichs-Übersteuerung, beiden Anwendungs-Wegen, vollständiger Platzhalter-Referenz mit Beispielen und Ordner-Regeln samt Grenzen, in allen fünf Sprachfassungen; Überblicks-Links ergänzt. Insgesamt 56 neue i18n-Keys pro Sprache über das Epic (Kommandos, Dialoge, Hinweise, Fehlertexte, Einstellungs-Bereich, Katalog, Seiten-Titel).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Vorlagen sind als interne Erweiterung `templates` (Kategorie Werkzeuge) schaltbar; im Aus-Zustand entfallen beide Kommandos, der Einstellungs-Bereich und der Ordner-Regel-Trigger. Die Ordner-Regeln sind Teil derselben Erweiterung (kein eigener Schalter).
- Wiederverwendung des Query-Ausdruck-Kerns: Der Dauer-Parser (`parseDurationContent`) und der Format-Kern (`formatDateMs`) wurden aus der Query-Sprache extrahiert und exportiert; das dur-Literal und die `dateformat`-Funktion nutzen dieselben Kerne weiter (Extraktions-Refactoring ohne Verhaltens-Änderung).
- Neue Test-Substanz: E2E-Funktions-Suite `vorlagen.spec.js` (VL-01 bis VL-10: Dialog-Kette, Abbruch-Semantik, Ein-Schritt-Undo, Ordner-Regeln, Einstellungs-Wege inklusive Bereichs-Übersteuerung), Unit-Suiten `template-engine.test.js` (23 Tests) und `templates.test.js` (20 Tests, Quellen-Auflösung und Tiefster-Treffer-Regel).

## [0.53.0.556] - 2026-07-09 — Perspective Query: Skript-Blöcke mit Sandbox-API

Epic 3E-0078 (Perspective Query: Skript-Blöcke mit Sandbox-API) aus dem Ideen-Programm 2026-07, dritte und letzte Stufe des Query-Ausbaus. Ein neuer Fence-Typ `perspective-script` führt JavaScript aus Dokumenten aus und bettet das Ergebnis ins gerenderte Dokument ein; die lesende `pq`-API erschließt dieselben Index-Daten wie die Perspective-Abfrage (Dateien, Frontmatter, Block-Eigenschaften). Sicherheits-Modell „eingehegt statt Voll-Zugriff" (PO-Festlegung 2026-07-08): isolierte Sandbox ohne Datei-, Netz- und App-Zugriff plus Default-aus-Einstellung mit Warntext. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0412 bis 4T-0416).

### Neu

- **Skript-Sandbox-Laufzeit** (4T-0412): Der Fence `perspective-script` rendert als Platzhalter; die Ausführung übernimmt pro Block eine frische, isolierte Sandbox (`iframe sandbox="allow-scripts"` ohne `allow-same-origin`, eigenes Trägerdokument mit strikter CSP `default-src 'none'` — kein Netz, kein Datei-Nachladen, kein Parent-DOM, kein Preload). Das Nutzer-Skript läuft in einem Worker-Thread der Sandbox, ohne `window` und `document`; die Läufe eines Fensters sind serialisiert — ein Endlos-Skript blockiert weder die App noch nachfolgende Blöcke und wird beim Zeit-Limit zuverlässig terminiert (Befund aus der Release-Test-Iteration). Kommunikation ausschließlich über ein Schema-geprüftes postMessage-/MessagePort-Protokoll; Zeit-Limit 5 Sekunden mit lokalisiertem Abbruch-Hinweis, Fehler erscheinen mit Original-Meldung und Skript-Zeile am Block. Parität Render/Reading/Live; Idle-Barriere für den PDF-Export. Sicherheits-Nachweise als Tests verankert (Isolation, Netz-Sperre, Endlos-Skript ohne Renderer-Blockade und ohne Mitreißen von Nachbar-Blöcken).
- **Lesende pq-Daten-API und kontrollierte Ausgabe** (4T-0413): `pq.pages([quelle])`, `pq.current()`, `pq.file(ref)` und `pq.blocks([quelle])` liefern einen Daten-Snapshot des Suchraums (Frontmatter-Felder flach plus `file.*` inklusive `inlinks`/`outlinks`; Quellen-Filter `#tag`, `[[Name]]`, Ordner-Präfix); Helfer `pq.date`/`pq.dur`/`pq.sort` kompatibel zum Typ-System der Abfrage-Sprache. Ausgabe über `pq.out`/`pq.list` (verschachtelbar)/`pq.table` plus Bau-Funktionen `pq.el`/`pq.link`/`pq.md`; der Renderer übersetzt die serialisierte Beschreibung über eine Element-Whitelist in DOM (keine rohe HTML-Injektion, Ausgabe-Deckel), interne Links samt Block-Anker-Sprung laufen über den bestehenden Klick-Pfad. Index-Änderungen starten sichtbare Blöcke automatisch neu. Der Referenz-Fall des PO (rekursiver Link-Baum über `outlinks` mit klickbaren Zielen) ist als E2E-Test verankert.
- **Einstellung „Skript-Blöcke ausführen"** (4T-0414): Default aus, mit dauerhaft sichtbarem Warntext im Bereich Verhalten (Vertrauensmodell: Skripte stammen aus Dokumenten). Ohne Aktivierung zeigt der Block seinen Quelltext mit Hinweis-Banner, nachweislich ohne Sandbox-Instanz; das Umschalten wirkt sofort in allen Fenstern (Settings-Broadcast). PDF-Export druckt bei aktiver Einstellung das Skript-Ergebnis (Export wartet laufende Skripte ab), sonst die Quelltext-Darstellung; der Portable-Export lässt den Fence unverändert als Quelltext.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0415): neuer Funktions-Katalog-Eintrag „Skript-Blöcke" (Abdeckungs-Matrix F-100); neue Handbuch-Seite „Skript-Blöcke" mit Aktivierung/Vertrauensmodell, Laufzeit-Grenzen und vollständiger pq-API-Referenz samt Referenz-Beispielen in allen fünf Sprachfassungen (Beispiele bewusst als Code-Blöcke, die Seite führt keine Skripte aus); Überblicks-Links und Querverweis von der Seite „Perspective-Abfrage". Insgesamt 16 neue i18n-Keys pro Sprache (Laufzeit-Status und Fehler, Einstellung mit Warntext, Banner, Katalog und Seiten-Titel).

### Intern

- Erweiterungs-Prüfschritt dokumentiert (im Epic): Die Default-aus-Einstellung ersetzt für dieses Epic das interne Erweiterungs-Modell; der Fence bleibt Kern-Konstrukt, die Ausführung hängt allein an der Einstellung.
- Neue Test-Substanz: E2E-Funktions-Suite `skript-bloecke.spec.js` (SK-01 bis SK-08 inklusive Sicherheits- und Timeout-Nachweisen), Laufzeit-Unit-Suite gegen das Sandbox-Trägerdokument, Whitelist-Übersetzer-Suite (jsdom), Index-Integrations-Suite des Daten-Snapshots, Snapshot-Fixture `perspective-script.md`.

## [0.52.0.550] - 2026-07-09 — Perspective Query: Abfragen auf Block-Ebene

Epic 3E-0077 (Perspective Query: Block-Ebene) aus dem Ideen-Programm 2026-07, zweite von drei Stufen des Query-Ausbaus. Die Perspective-Abfrage wertet jetzt auch die Block-Metadaten aus den `.mdd`-Begleitdateien aus: der Scope-Zusatz `BLOCKS` am Ausgabe-Typ liefert Blöcke statt Dateien als Treffer, dargestellt als klickbare `Datei#^anker`-Ziele mit Anker-Sprung. Damit ist die im Block-Metadaten-Konzept verankerte Pflicht-Dimension „auswertbar analog zur Frontmatter-Ebene" eingelöst. Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0408 bis 4T-0411).

### Neu

- **Block-Daten im Abfrage-Index** (4T-0408): Der Datei-Index liest beim Aufbau pro Markdown-Datei die `blockData`-Sektion der `.mdd`-Begleitdatei mit (Substring-Vorprüfung erspart den JSON-Parse großer History-Container ohne Block-Daten; defekte `.mdd` setzen nur die Block-Ebene der einen Datei aus). Da die `.mdd` außerhalb des Markdown-Watchers liegt, invalidiert jede Panel-Änderung über den `blockData:changed`-Schreibpfad zusätzlich den Block-Anteil des Index — sichtbare Abfragen aktualisieren sich ohne Neustart. Bewusst ohne Aufnahme in `Area_Cache.mdda`: der komplette Zusatz-Pass kostet auch im pessimistischen Szenario (2000 Dateien, 300 `.mdd` à 100 KB) nur rund 0,36 s einmalig pro Index-Aufbau (Messung im Task dokumentiert).
- **BLOCKS-Scope in Sprache und Ausgabe** (4T-0409): `LIST BLOCKS …` und `TABLE BLOCKS …` (vor `WITHOUT ID`) schalten die Abfrage auf die Block-Ebene um; alle Klauseln (`FROM`, `WHERE`, `SORT`, `LIMIT`, `COLUMNS`) wirken unverändert. Nackte Feldnamen treffen zuerst die Block-Eigenschaften und fallen auf das Frontmatter der Träger-Datei zurück (der Block „erbt" seinen Datei-Kontext); `updated` steht als Datums-Meta-Feld für Vergleiche und Sortierung bereit, `file.*` und `FROM` bleiben die Träger-Datei. Treffer erscheinen in Liste und Tabellen-Ziel-Spalte als `Datei#^anker`; der Klick öffnet die Datei und springt modusbewusst zum Block. Nur aktive Anker zählen — verwaiste Einträge (Eigenschaften ohne Anker im Text) sind kein Treffer; Dokumente ohne Block-Daten liefern schlicht keine Treffer.

### Behoben

- **Klick auf Abfrage-Treffer im Live-Modus** (4T-0409): Klicks auf Treffer der Perspective-Abfrage im Live-Modus waren seit ihrer Einführung wirkungslos — die Treffer liegen dort in einem Block-Widget, dessen `ignoreEvent()` alle Events an den zentralen Editor-Klick-Handlern vorbeiführt. Der Klick-Pfad hängt jetzt direkt am Widget-Container (Muster des Frontmatter-Widgets) und öffnet die Zieldatei samt Anker-Sprung; Regressionstest BQ-03.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0410): neuer Funktions-Katalog-Eintrag „Block-Abfrage" (3 neue i18n-Keys in fünf Sprachen, Gruppe hinter dem Abfrage-Cluster, Abdeckungs-Matrix F-099); Handbuch-Seite „Perspective-Abfrage" um die Sektion „Block-Ebene (BLOCKS)" erweitert (Syntax, Feld-Auflösung mit Frontmatter-Rückfall, `updated`, Tabellen-Form, Verwaisten-Regel) in allen fünf Sprachfassungen; Querverweis von der Seite „Block-Eigenschaften" auf die Abfrage-Seite.

### Intern

- **Test-Ausbau**: neue Unit-Suite `block-data-index.test.js` (Lese-Pfad, Normalisierung, Fehler-Isolation), Parser-/Eval-/Index-Suiten um den BLOCKS-Scope erweitert (u.a. Verwaisten-Filter und Invalidierungs-Test), View-Suite um `data-fm-anchor`, Snapshot-Fixture mit BLOCKS-Beispielen, neue E2E-Spec `block-abfrage.spec.js` (BQ-01 Treffer und Anker-Sprung, BQ-02 Panel-Änderung invalidiert die sichtbare Liste, BQ-03 Live-Parität und Klick).
- **Versions-Bump** 0.51.0 → 0.52.0 ([package.json](package.json)).

## [0.51.0.545] - 2026-07-09 — Perspective Datatable: typisierte Datentabelle mit Rechenfunktionen

Epic 3E-0079 (Perspective Datatable) aus dem Ideen-Programm 2026-07. Ein neuer Fence-Typ `perspective-datatable` bringt eine typisierte Datentabelle in Markdown-Dokumente: Spalten mit festen Wertetypen und optionalem Anzeige-Format, live rechnende Aggregat-Zeile, berechnete Spalten über die Ausdrucks-Sprache der Perspective-Abfrage, Bearbeitung direkt im gerenderten Grid mit Typ-Zwang sowie Ansichts-Sortierung und Filter-Zeile. Alle Daten stehen als Klartext im Dokument (PO-Entscheidung A); umgesetzt in fünf Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0417 bis 4T-0423).

### Neu

- **Datentabellen-Format und Parser** (4T-0417): Fence `perspective-datatable` mit Kopf-Direktiven `columns:` (Typ-Satz `text`/`number`/`date`/`time`/`boolean`, Anzeige-Format `number(n)`, berechnete Spalten als `= ausdruck`) und `aggregate:` (je Spalte kombinierbar per `+`), darunter Datenzeilen in Pipe-Notation mit `\|`-Escape. Prozess-neutraler Parser mit typ-geparsten Zell-Werten und strukturierten, lokalisierten Fehlern (Rohtext bleibt bei Fehler-Zellen erhalten, kein Datenverlust); kanonischer Serialisierer mit stabiler Spalten-Ausrichtung als Grundlage des Grid-Rückschreibens. Die Datentabelle ist eine schaltbare interne Erweiterung (Einstellungen → Erweiterungen); deaktiviert bleibt der Block ein regulärer Code-Block (PO-Festlegung aus der Test-Iteration).
- **Grid-Rendering mit Aggregat-Zeile** (4T-0418): Grid mit Typ-Symbolen im Kopf, typ-gerechter Ausrichtung, read-only Boolean-Checkboxen und markierten Fehler-Zellen (lokalisierter Tooltip); Aggregat-Zeile mit `sum`/`avg`/`min`/`max`/`count` (typ-gerecht, leere und fehlerhafte Zellen ausgenommen, `avg` rundet auf das Spalten-Format). Identisches Grid in gerenderter Ansicht, Lese-Ansicht und Live-Block-Widget; Portable-Export als statische HTML-Tabelle mit Aggregat-Fußzeile, PDF-Export über den gerenderten Stand. Bewusste Ober-Grenze: ab 1000 Zeilen nur Kopf und Aggregate mit Hinweis.
- **Grid-Editor mit Typ-Zwang** (4T-0419): Zell-Bearbeitung direkt im Grid (Klick bzw. Enter/F2 bei Zell-Fokus; native Datums-/Zeit-Felder, Esc verwirft, Enter oder Fokus-Verlust übernimmt, Tab springt zur nächsten Zelle), ungültige Werte werden mit Hinweis abgewiesen; Boolean toggelt direkt per Klick. Zeile hinzufügen am Daten-Ende, Zeile löschen am Zeilenanfang. Jede Übernahme schreibt den kanonischen Fence-Body über den normalen Editor-Weg zurück (Dirty-Flag, Undo/Redo; mehrere Tabellen pro Dokument eindeutig über Fence-Index plus Quelltext-Abgleich); editierbar in geteilter Ansicht und Live-Modus, Lese-Ansicht und Handbuch bleiben read-only.
- **Ansichts-Sortierung und Filter-Zeile** (4T-0420): Spaltenkopf-Klick sortiert typ-gerecht (aufsteigend, absteigend, aufgehoben; fehlende Werte ans Ende); einblendbare Filter-Zeile mit Enthaltensuche pro Spalte und Dreifach-Umschalter für Boolean, „n von m Zeilen"-Ausweis und gefilterten Aggregaten. Reiner Ansichts-Zustand pro Tab: nicht persistiert, nicht exportiert, der Quelltext bleibt byte-identisch; Bearbeiten in sortierter oder gefilterter Ansicht trifft die richtigen Zeilen.
- **Berechnete Spalten** (4T-0421): Spalten-Formeln (`Gesamt:number = Preis * Menge`) werten pro Zeile über den Ausdrucks-Evaluator der Perspective-Abfrage aus (identischer Funktions-Katalog, gleiches Typ-System); Ergebnis-Typ gemäß Deklaration, Typ-Abweichungen als Fehler-Zelle. Formeln dürfen auf Daten-Spalten und andere berechnete Spalten in beliebiger Deklarations-Reihenfolge verweisen (die Auswertung löst die Abhängigkeiten auf; Kreis-Bezüge werden als Struktur-Fehler gemeldet); Ergebnisse werden nie persistiert, fließen aber in Aggregate, Sortierung, Filter und Export ein und aktualisieren live bei Eingaben.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0422): neue Handbuch-Seite „Perspective Datatable" in fünf Sprachen (Format-Referenz, Aggregate, berechnete Spalten, Grid-Bedienung, Ansichts-Funktionen, Export und Grenzen; zwei selbst-demonstrierende Live-Beispiele) mit Registry-Eintrag und Überblicks-Link; drei neue Funktions-Katalog-Einträge (Konstrukt, Grid-Bearbeitung, Sortierung/Filter) samt Abdeckungs-Matrix F-096 bis F-098. Insgesamt 89 neue i18n-Keys in fünf Sprachen (43 UI-Keys der Tabelle plus 45 Katalog-Keys und der Seiten-Titel).

### Intern

- **Ausdrucks-Einstieg im Query-Parser**: `parseExpression` parst einen einzelnen Wert-Ausdruck mit der bestehenden Abfrage-Mechanik (interne Option, keine Code-Verdopplung) — Grundlage der Spalten-Formeln.
- **Undo-Härtung des Rückschreibens**: Grid-Übernahmen dispatchen mit `userEvent`-Annotation; ohne sie verschmolz die programmatische Transaktion in der Editor-Historie mit dem initialen Doc-Set, und ein Undo hätte das ganze Dokument geleert.
- **Test-Ausbau**: neue Unit-Suite `perspective-datatable.test.js` (50 Fälle: Parser, Serialisierer-Roundtrip, Aggregate, Vergleicher/Filter, Formeln, Fence-Suche), Snapshot-Fixture `datentabelle.md` (Viewer- und Portable-Pfad), neue E2E-Spec `datentabelle.spec.js` (DT-01 bis DT-11: Rendering, Aggregate, Live-Parität, Zell-Eingabe mit Rückschreib-Kontrolle und Undo, Boolean-Toggle, Zeilen-Aktionen mit zwei Tabellen, Read-only-Lese-Ansicht, Live-Bearbeitung, Sortier-Zyklus, Filter mit Tab-Wechsel, berechnete Spalten live).
- **Erweiterungs-Prüfschritt verankert** ([CLAUDE.md](CLAUDE.md)): pro Epic wird geprüft, ob neue Funktionalität als interne Erweiterung aktivierbar/deaktivierbar angeboten werden soll; die Entscheidung wird im Epic bzw. Task dokumentiert (PO-Festlegung 2026-07-09).
- **Versions-Bump** 0.50.0 → 0.51.0 ([package.json](package.json)).

## [0.50.0.536] - 2026-07-08 — Render-Darstellung: Mehrspalten-Block und einstellbare Inhalts-Breite

Epic 3E-0072 (Render-Darstellung: Mehrspaltigkeit und Inhalts-Breite) aus dem Ideen-Programm 2026-07, letztes Feature-Epic vor der Konsolidierung. Zwei Darstellungs-Erweiterungen der gerenderten Ansicht: Ein Mehrspalten-Block setzt eingeschlossene Inhalte zwei- bis fünfspaltig (reines Markdown mit Block-Markern und optionalem Spalten-Umbruch), und die genutzte Inhalts-Breite ist als freier Prozent-Wert einstellbar und löst die feste 920-px-Begrenzung ab. Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0382 bis 4T-0385).

### Neu

- **Mehrspalten-Block** (4T-0382): Container `::: columns <n>` … `:::` setzt den eingeschlossenen Inhalt mehrspaltig (gültig sind 2 bis 5 Spalten); der Text fließt automatisch und ausgeglichen über CSS-Spalten, eine `+++`-Zeile erzwingt den Spaltenwechsel. Ungültige Spaltenzahlen (fehlend, 1, mehr als 5, nicht numerisch) fallen auf die neutrale Container-Box zurück; außerhalb eines Spalten-Blocks bleibt `+++` wirkungslos. Parität: die Lese-Ansicht nutzt denselben Render-Pfad, der Live-Modus zeigt den Block in neutraler Container-Optik mit editierbaren Marker-Zeilen, der PDF-Export druckt die Spalten mit, der portable Export trägt Inline-Styles. Der Block gehört zur Erweiterung „Custom Containers" und schaltet mit ihr.
- **Inhalts-Breite in Prozent** (4T-0383): neues Feld „Inhalts-Breite (%)" im Einstellungs-Bereich Darstellung (20 bis 100, Standard 80) mit Live-Vorschau; wirkt sofort auf gerenderte und geteilte Ansicht aller Fenster und übersteht den Neustart. Werte unter 100 bleiben zentriert; der PDF-Export nutzt unabhängig davon die volle Druckbreite. Werte außerhalb des Bereichs werden auf die Grenzen geklemmt.

### Geändert

- **Feste 920-px-Breite abgelöst** (4T-0383): Die gerenderte Ansicht begrenzte den Inhalt bisher fest auf 920 px zentriert; jetzt steuert der Prozent-Wert eine CSS-Variable. Der neue Standard-Look ist 80 Prozent der Ansichts-Breite (PO-Festlegung); der bisherige Pixel-Look ist über den Prozent-Wert nicht exakt abbildbar.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0384): Handbuch-Seite „Blöcke" um die selbst-demonstrierende Sektion „Mehrspalten-Block" erweitert (fünf Sprachen, mit lebendem Beispiel, Rückfall-Verhalten und dokumentierten Grenzen); zwei neue Funktions-Katalog-Einträge „Mehrspalten-Block" (Gruppe Bearbeitung) und „Inhalts-Breite" (Gruppe Ansicht) samt Abdeckungs-Matrix F-094/F-095. Die Inhalts-Breite wird bewusst nur über den Katalog dokumentiert (PO-Entscheidung; Muster der übrigen Darstellungs-Einstellungen). Insgesamt 7 neue i18n-Keys in fünf Sprachen.

### Intern

- **Test-Ausbau**: Snapshot-Fixtures `columns.md`/`columns-portable.md`, Unit-Parsing-Matrix und Render-Fälle der Spalten (markdown-pipeline), E2E-Spec `mehrspalten.spec.js` (MC-01 bis MC-03: Spaltenzahl-Klassen, Rückfall, Lese-Ansicht-Parität), Einstellungs-E2E ES-11 (Default 80, Klemmen, reale Breiten-Wirkung, Neustart-Persistenz) plus Clamp-/Variablen-Unit-Suite der Einstellungs-Seite.
- **Versions-Bump** 0.49.0 → 0.50.0 ([package.json](package.json)).

## [0.49.0.530] - 2026-07-08 — Block-Metadaten: strukturierte Eigenschaften pro Block-Anker

Epic 3E-0067 (Block-Metadaten: strukturierte Daten pro Block-Anker) aus dem Ideen-Programm 2026-07. Was das Frontmatter für das ganze Dokument leistet, gibt es jetzt pro Block: typisierte Schlüssel-Wert-Eigenschaften, verankert am Block-Anker `^id` und gespeichert in der `.mdd`-Begleitdatei (eigene Sektion neben Historie und Notizen), gepflegt über ein neues Sidebar-Panel mit Cursor-Folge und sichtbar über einen dezenten Indikator am Block. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0363 bis 4T-0367) auf Basis des PO-freigegebenen Konzepts (4T-0362).

### Neu

- **Block-Metadaten in der Begleitdatei** (4T-0363): neue optionale `.mdd`-Sektion `blockData` mit 0 bis n Schlüssel-Wert-Einträgen pro Block-Anker und Zeitstempel je Anker; Fehler-Isolation nach dem Muster der Notizen-Sektion (eine defekte Sektion setzt nur die Block-Metadaten aus, nie Historie oder Notizen). Lese-/Schreib-/Umbenennen-IPC mit Mehrfenster-Broadcast; die Block-Anker-Erkennung liegt jetzt in einer gemeinsamen, prozess-neutralen Quelle (`src/shared/block-anchors.js`) für Backlinks-Index und Panel.
- **Panel „Block-Eigenschaften"** (4T-0364): neues Sidebar-Panel direkt neben den Dokument-Properties, das dem Cursor folgt und die Eigenschaften des Blocks unter dem Cursor zeigt. Typisierte Eigenschafts-Zeilen wie im Properties-Editor (Text, Liste, Zahl, Wahr/Falsch, Datum, mehrzeilig), freie Schlüssel mit Vorschlägen aus dem Dokument-Bestand, automatisches Speichern ohne Tab-Dirty. Kopfzeile mit Anker-Dropdown, „Anker anlegen" (kurze Zufalls-ID) für Blöcke ohne Anker und Umbenennen-Kommando, das Text-Anker, `.mdd`-Schlüssel und eingehende Verweise im selben Dokument synchron mitzieht. Verwaiste Daten (Anker aus dem Text verschwunden) bleiben erhalten und lassen sich im Panel zuordnen oder löschen; Duplikat-Anker zeigen einen Hinweis. Zugang über Ansicht → Block-Eigenschaften und Statusbar-Symbol; read-only in Lese-Ansichten.
- **Indikator am Block** (4T-0365): Blöcke mit Metadaten tragen im Gerenderten und im Live-Modus einen dezenten Marker am Blockende; Hover zeigt die Schlüssel-Wert-Liste, Klick öffnet das Panel mit dem Anker als Kontext. Änderungen (auch aus anderen Fenstern) ziehen live nach; im PDF-Export und im portablen Export erscheint der Indikator nicht. Eine eigene Abfrage-Syntax über Block-Metadaten ist bewusst nicht Teil dieses Releases (per Konzept-Entscheidung dem Query-Ausbau vorbehalten).

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0366): neue Handbuch-Seite „Block-Eigenschaften" in fünf Sprachen (Anker als Träger, Panel-Pflege, Umbenennen, verwaiste Daten, Indikator, Speicherort und Grenzen) samt Überblicks-Link; Funktions-Katalog-Eintrag „Block-Metadaten" in der Begleitdatei-Gruppe hinter der Dokument-Notiz (Abdeckungs-Matrix F-093). Insgesamt 21 neue i18n-Keys in fünf Sprachen (Panel-Texte, Menü-Eintrag, Kommando-Beschreibung, Katalog- und Seiten-Titel-Keys).

### Intern

- **Neue Module**: `src/shared/block-anchors.js` (gemeinsame Anker-Quelle: Regex, Extraktion mit Fence-/Frontmatter-Ausschluss, Duplikate, Absatz-Zuordnung, Verweis-Umschreibung, ID-Generierung), `src/renderer/modules/block-props-panel.js` (Panel) und `src/renderer/modules/block-meta-indicator.js` (Indikator als Render-Nachverarbeitung plus Live-Modus-Dekoration).
- **Test-Ausbau**: Unit-Suiten `block-anchors.test.js` und `mdd-store`-Erweiterung (Sektions-Zugriff, Koexistenz-Roundtrip, Verwaisten-/Duplikat-Fälle), E2E-Spec `block-eigenschaften.spec.js` (BP-01 bis BP-06: Panel, Anker anlegen mit Persistenz, Verwaisten-Anzeige, Indikator im Render-Pane, Broadcast-Nachzug, Live-Widget); Sidebar-Wächter SL-01/ES-10 auf zehn Panels nachgezogen.
- **Versions-Bump** 0.48.0 → 0.49.0 ([package.json](package.json)).

## [0.48.0.525] - 2026-07-08 — Perspective Query: Klausel-Sprache, Datei-Felder und Tabellen

Epic 3E-0076 (Perspective Query: Sprache, Felder und Tabelle), erste von drei Stufen des Query-Ausbaus aus dem Ideen-Programm 2026-07. Die Perspective-Abfrage (`perspective-query`-Fence) wächst von der reinen Frontmatter-Filter-Liste zur vollwertigen Abfrage-Sprache mit Quellen-Auswahl, impliziten Datei-Feldern, Funktions-Katalog, Sortierung, Tabellen-Ausgabe und Mehrspalten-Layout; bestehende Abfragen bleiben unverändert gültig. Umgesetzt in fünf Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0401 bis 4T-0407).

### Neu

- **Abfrage-Grammatik 2.0** (4T-0401): Klausel-Sprache mit `LIST` (optionales Zusatzfeld) bzw. `TABLE` als Ausgabe-Typ und je höchstens einmal `FROM`, `WHERE`, `SORT`, `LIMIT`, `COLUMNS` in freier Reihenfolge. Die Ausdrucks-Ebene kennt jetzt Ordnungs-Vergleiche (`<`, `<=`, `>`, `>=`), Arithmetik mit Punkt-vor-Strich, Funktions-Aufrufe, Zahl-Literale sowie Datums- und Dauer-Literale (`date(today)`, `date(2026-12-31)`, `dur(7 days)`; Monat/Jahr als fixe 30/365-Tage-Näherung). Eine nackte Bedingung ohne Klausel wird weiter als `LIST WHERE …` gelesen; Feldnamen wie `limit` bleiben in der Kurzform nutzbar. 21 neue lokalisierte Syntaxfehler-Texte (u.a. Klausel-Duplikate, Datums-/Dauer-Validierung), auch die bisherigen Parser-Codes zeigen jetzt eigene Texte statt des generischen Fallbacks.
- **Feld-Auflösung und Typ-System** (4T-0402): implizite Datei-Felder unter `file.` (name, folder, path, ext, link, size, ctime, mtime, tags, aliases, inlinks, outlinks), Typ-System mit typ-gerechten Vergleichen (Zahl numerisch, auch als Zahl-String; Datum chronologisch inkl. ISO-Strings; Text case-insensitiv), Datum-±-Dauer-Rechnung und ein kuratierter Funktions-Katalog (`contains`, `icontains`, `length`, `lower`, `upper`, `startswith`, `endswith`, `default`, `choice`, `number`, `string`, `dateformat`, `sum`, `min`, `max`, `average`). `FROM`-Quellen: Ordner, Schlagwörter (hierarchisch), `[[Datei]]` und `outgoing([[Datei]])`, kombinierbar mit `AND`/`OR`/Klammern/`-`. Unbekannte Funktionen und falsche Stelligkeit erscheinen als lokalisierter Fehler am Fence.
- **Sortierung und Limit** (4T-0403): `SORT feld [ASC|DESC], …` sortiert mehrstufig und typ-gerecht (Text locale-bewusst); fehlende Werte sortieren unabhängig von der Richtung ans Ende, letzter Tiebreaker ist der Datei-Pfad (deterministisch bei Live-Updates). `LIMIT n` schneidet nach der Sortierung; ohne `SORT` bleibt die alphabetische Ordnung.
- **Tabellen-Ausgabe** (4T-0404): `TABLE spalte [AS "Titel"], …` rendert eine Tabelle mit klickbarer Datei-Spalte (per `WITHOUT ID` abschaltbar) und Zellen aus Feldern oder Ausdrücken; ohne Alias dient der Ausdrucks-Quelltext als Kopfzeile. Listen kommagetrennt, Daten im ISO-Format, Link-Werte klickbar; identisches DOM in Render-Pane, Reading und Live-Widget. Das optionale LIST-Zusatzfeld erscheint als gedämpfter Anhang hinter jedem Treffer.
- **Mehrspalten-Layout** (4T-0405): `COLUMNS n` (1 bis 8) lässt Ergebnis-Listen über CSS-Spalten fließen; bei `TABLE` wird `COLUMNS` ignoriert und als lokalisierter Hinweis am Fence gemeldet.

### i18n und Handbuch

- **Hilfe-Inhalte erweitert** (4T-0406): Die Funktion heißt für den Nutzer jetzt **«Perspective-Abfrage»** (Titel-, Kurzname- und Überblicks-Keys in fünf Sprachen umbenannt; Seiten-ID und Dateinamen unverändert). Die Handbuch-Seite ist in allen fünf Sprachen zum vollständigen Sprach-Nachschlagewerk ausgebaut (Klauseln, Quellen, Felder, Literale, Funktions-Tabelle mit Beispielen, Sortierung, Mehrspalten). Drei neue Katalog-Einträge (Abfrage-Quellen, Abfrage-Tabelle, Abfrage-Sortierung und Mehrspaltigkeit) samt Abdeckungs-Matrix F-090 bis F-092. Insgesamt 34 neue i18n-Keys in fünf Sprachen (Fehler-/Hinweis-Texte, Tabellen-Spalte, Katalog-Einträge).

### Intern

- **Modul-Schnitt**: `src/shared/frontmatter-query.js` umbenannt nach `perspective-query.js` (Parser); neues Schwester-Modul `perspective-query-eval.js` (Typ-System, Funktions-Katalog, Auswertung, Ergebnis-Pipeline). Der Backlinks-Index trägt jetzt Datei-Zeiten (Anlage/Änderung) und einen lazy gebauten, bei Index-Änderungen invalidierten Link-Graphen für `file.inlinks`/`file.outlinks` und `FROM`-Link-Quellen.
- **Test-Ausbau**: Parser-, Evaluator-, Pipeline- und Index-Integrations-Suiten (rund 100 neue Unit-Fälle in `perspective-query*.test.js`), jsdom-Suite der Tabellen-Bau-Funktion, E2E-Specs FQ-03 (Tabelle mit Sortierung) und FQ-04 (Mehrspalten-Layout und COLUMNS-Hinweis), Snapshot-Fixture um Klausel- und COLUMNS-Fences erweitert.
- **Versions-Bump** 0.47.0 → 0.48.0 ([package.json](package.json)).

## [0.47.0.516] - 2026-07-08 — Entwurfs-Zwischenspeicher: neue Dokumente überleben das Beenden

Epic 3E-0068 (Entwurfs-Zwischenspeicher für ungespeicherte neue Dokumente). Nie gespeicherte Dokumente (Unbenannt-Tabs) gehen beim Beenden der App nicht mehr durch einen Speichern-Dialog verloren: Ihre Inhalte werden zwischengespeichert und beim nächsten Start wieder als Unbenannt-Tabs geöffnet, unabhängig von der Sitzungs-Wiederherstellung und per Einstellung abschaltbar. Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0368 bis 4T-0371).

### Neu

- **Entwurfs-Zwischenspeicher** (4T-0368): Beim Beenden der App oder eines Fensters wandern Unbenannt-Tabs mit Inhalt ohne Dialog in einen Zwischenspeicher unter dem Benutzerprofil (`userData/drafts`, je Entwurf eine Datei plus Manifest) und werden beim nächsten Start wieder als geänderte Unbenannt-Tabs geöffnet. Die Wiederherstellung ist bereichs-treu (ein Entwurf kehrt in seine Ursprungs-Applikation zurück, sonst verlustfrei in das erste bereichslose Fenster) und unabhängig von der Sitzungs-Wiederherstellung. Reguläres Speichern oder einzelnes Verwerfen räumt den Entwurf aus dem Speicher; leere Unbenannt-Tabs hinterlassen keine Reste.
- **Einstellung „Ungespeicherte neue Dokumente beim Beenden behalten"** (4T-0369): neuer Schalter im Bereich „Verhalten" der Einstellungs-Seite (Standard an), der den Zwischenspeicher steuert. Wirkt sofort und übersteht den Neustart.

### Geändert

- **Dialog-Verhalten beim App-Ende** (4T-0369): Bei aktivem Zwischenspeicher erscheint beim Beenden kein Speichern/Verwerfen-Dialog mehr für Unbenannt-Tabs; sie werden ohne Nachfrage gesichert. Dirty bestehende Dateien behalten ihren Speichern-Dialog, und das einzelne Schließen eines Unbenannt-Tabs (Strg+W) fragt weiterhin nach. Bei ausgeschalteter Einstellung bleibt das bisherige Verhalten vollständig erhalten.

### Intern

- **Neues Modul** `src/main/draft-store.js` (reine, unit-getestete Manifest-, Zuordnungs- und Aufräum-Logik); Datei-I/O unter `userData/drafts`, IPC `drafts:save` und `window:initialState`-Erweiterung in `src/main/main.js`; Einsammeln und Wiederherstellen im Renderer.
- **Test-Ausbau**: `draft-store.test.js` (12 Unit-Fälle) und E2E-Spec `entwurfs-zwischenspeicher.spec.js` (DR-01 bis DR-04: Roundtrip Beenden/Neustart, mehrere Entwürfe, Einstellung aus, bestehende Datei behält Dialog); Abdeckungs-Matrix-Eintrag F-089.
- **Versions-Bump** 0.46.0 → 0.47.0 ([package.json](package.json)).

### i18n

- **Neue Keys** in allen fünf Sprachen: die Einstellung (`settings.keepUnsavedDrafts.label`/`.hint`) und der Funktions-Katalog-Eintrag `unsavedDrafts` (Beschreibung, Kurzname, Zugang). Die Handbuch-Seite „Applikationen, Fenster und Bereiche" ist um den Abschnitt „Ungespeicherte Entwürfe" erweitert.

## [0.46.0.498] - 2026-07-08 — Dokument-Notizen: eine Notiz je Dokument

Epic 3E-0066 (Dokument-Notizen in der Markdown-Data-Datei). Zu jedem Dokument lässt sich eine einzelne Notiz führen, getrennt vom Dokument-Inhalt und in der `.mdd`-Begleitdatei gespeichert (eigene Sektion `notes` neben der Historie). Gepflegt wird sie in einem eigenen, editierbaren Sidebar-Panel mit umschaltbarer Vorschau, den Formatier-Funktionen des Haupt-Editors und automatischem Speichern; anders als die Historie ohne Revisionen und Wiederherstellung. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0358 bis 4T-0361, inklusive der Nachforderung 4T-0398).

### Neu

- **Notiz-Sektion in der `.mdd`** (4T-0358): Der Markdown-Data-Container trägt neben der Historie eine optionale Sektion `notes` mit einer einzelnen Notiz je Dokument (`{ text, updated }`, Zeitstempel UTC-sekundengenau). Der Lese-/Schreib-Pfad legt die Begleitdatei bei der ersten Notiz auch ohne bestehende `.mdd` an, überschreibt den Stand ersatzlos (bewusst keine Historie) und lässt Historie und Notiz unabhängig koexistieren; eine defekte Begleitdatei setzt nur die Notiz aus, nie die Historie. Ein Broadcast hält Panels desselben Dokuments in anderen Fenstern aktuell.
- **Notizen-Panel** (4T-0359): ein neues, editierbares Sidebar-Panel zeigt die Notiz der aktiven Datei. Ein Umschalter im Panel-Kopf wechselt zwischen Bearbeiten und gerenderter Vorschau; der Startzustand folgt der neuen Einstellung „Notiz-Vorschau standardmäßig anzeigen" (Bereich Darstellung, ab Werk an). Gespeichert wird implizit (kurz nach dem Tippen sowie bei Fokus-Verlust, Datei-Wechsel und Fenster-Schließen), ohne Speichern-Schaltfläche und ohne Dirty-Marker am Tab. Ein unbenanntes Dokument und eine beschädigte Begleitdatei zeigen einen Hinweis statt eines Eingabefelds; bei Bearbeitung desselben Dokuments in mehreren Fenstern zieht eine fremde Änderung still nach, ein eigener ungespeicherter Stand löst einen Konflikt-Hinweis aus. Zugang über Menü Ansicht → Notizen, ein Statusbar-Symbol und das belegbare Kommando `view.toggleNotes`.
- **Formatieren im Notiz-Feld** (4T-0398): Das Notiz-Feld trägt das Rechtsklick-Kontextmenü und die Formatierungs-Kürzel des Haupt-Editors (Fett `Strg + B`, Kursiv `Strg + I`, Zeitstempel `Strg + Umschalt + D` sowie die übrigen belegbaren Format-, Absatz- und Einfüge-Aktionen). Das Zeitstempel-Kürzel trifft jetzt den fokussierten Editor, also auch das Notiz-Feld.

### Intern

- **Neue Module**: `src/main/mdd-store.js` um `getNote`/`setNote` erweitert; Renderer-Module `src/renderer/modules/notes-panel.js` und `src/renderer/modules/notes-sync.js` (reine, unit-getestete Konflikt-Entscheidung); Notiz-Editor-Factory `createNotesEditorState` in `src/renderer/modules/editor.js` (schlanke Editor-Instanz, die das view-generische Editor-Kontextmenü und die Format-Keymap wiederverwendet). Panel-Registrierung, Panel-Reihenfolge und Datei-Wechsel-Hook wie bei den bestehenden Panels.
- **Test-Ausbau**: neue Unit-Fälle in `mdd-store.test.js` und `notes-sync.test.js`; E2E-Specs `notizen-datenpfad.spec.js` (NT-01 bis NT-03) und `notizen-panel.spec.js` (NP-01 bis NP-05); Abdeckungs-Matrix-Einträge S-070 und F-088. Der Handbuch-Linter-Test (HB-09) prüft die gebündelten Seiten jetzt dynamisch aus der Seiten-Registry statt aus einer festen Liste und deckt damit alle Themen-Seiten in fünf Sprachen ab.
- **Versions-Bump** 0.45.0 → 0.46.0 ([package.json](package.json)).

### i18n

- **Neue Keys** in allen fünf Sprachen: die Panel-Texte (`notes.*`: Titel, Umschalter, Platzhalter und Hinweise), der Menü-Eintrag `menu.view.notes`, das Kürzel `help.shortcut.toggleNotes`, die Einstellung `settings.notesPreviewByDefault` sowie der Funktions-Katalog-Eintrag `documentNotes` (Beschreibung, Kurzname, Zugang).
- **Handbuch** (4T-0360): neue Themen-Seite „Dokument-Notizen" (Panel und Zugang, Schreiben und Vorschau, Formatieren wie im Editor, automatisches Speichern, Speicherort und Abgrenzung zur Historie, mehrere Fenster) in fünf Sprachfassungen; Verweis in der Überblicksseite, Panel-Liste der Sidebar-Seite ergänzt, bidirektionale Abgrenzung auf der Historien-Seite. Die Handbuch-Linter-Prüfliste zieht nun automatisch aus der Seiten-Registry.

## [0.45.0.489] - 2026-07-07 — Frontmatter-Abfrage: dynamische Datei-Listen im Dokument

Epic 3E-0065 (Frontmatter-Abfrage: dynamische Datei-Listen im Dokument). Ein Code-Block mit dem Sprach-Tag `perspective-query` bettet eine boolesche Filter-Abfrage über Frontmatter-Felder ein; gerendert erscheint an dieser Stelle eine dynamische, klickbare Liste aller passenden Dateien des Suchraums, die sich mit dem Index aktuell hält. Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0354 bis 4T-0357).

### Neu

- **Abfrage-Syntax und Properties-Index** (4T-0354): Der Fenced-Code-Block mit Sprach-Tag `perspective-query` nimmt einen logischen Ausdruck über Frontmatter-Felder auf: Wert-Gleichheit und -Ungleichheit (`=`, `!=`), Mengen-Operatoren (`IN`, `NOT IN`), Verknüpfungen (`AND`, `OR`, `NOT`) und Klammern, mit Präzedenz `NOT` vor `AND` vor `OR`. Feldnamen und Werte werden ohne Beachtung der Groß-/Kleinschreibung verglichen, Listen-Felder als Mitgliedschaft beziehungsweise Schnittmenge. Der Link-Index trägt dazu die Frontmatter-Properties jeder Datei und beantwortet die Abfragen über den gesamten Suchraum. Parser und Evaluator liegen prozess-neutral in `src/shared/` und werten ausschließlich über einen eigenen AST-Evaluator aus.
- **Dynamische Datei-Liste** (4T-0355): Der Abfrage-Block rendert in allen Ansichten (Gerendert, Geteilt, Live) als alphabetisch sortierte, klickbare Liste; ein Klick öffnet die Zieldatei wie ein Wiki-Link. Neue, geänderte und gelöschte Dateien schlagen ohne manuelles Neuladen auf sichtbare Listen durch (Live-Aktualisierung über die Index-Invalidierung). Leeres Ergebnis, Syntaxfehler mit Positionsangabe und die Index-Zustände (Aufbau, kein Suchraum, zu groß) zeigen lokalisierte Hinweise. Der PDF-Export druckt den statischen Stand des Render-Zeitpunkts; der Portable-Markdown-Export lässt den Abfrage-Block als Quelltext stehen.

### Geändert

- **Cache-Format `Area_Cache.mdda`**: trägt zusätzlich die Frontmatter-Properties pro Datei. Eine eigene Cache-Schema-Version erzwingt den einmaligen Neuaufbau des Bereichs-Caches, ohne die Dokument-Historie oder die Einstellungs-Container zu berühren; Warmstart und Kaltstart liefern identische Abfrage-Ergebnisse.

### Intern

- **Neue Module**: `src/shared/frontmatter-query.js` (Parser und Evaluator, unit-testbar) und `src/renderer/modules/frontmatter-query-view.js` (Listen-Aufbau, asynchroner Resolver, Live-Refresh über die Index-Invalidierung, Idle-Barriere für den PDF-Export).
- **Test-Ausbau**: neue Unit-Matrizen `frontmatter-query.test.js` und `frontmatter-query-view.test.js`, E2E-Spec `frontmatter-abfrage.spec.js` (FQ-01, FQ-02), Abdeckungs-Matrix-Eintrag F-087. Die Vitest-Datei-Parallelität ist auf `maxWorkers: 4` begrenzt, was den Testlauf auf Systemen mit vielen Prozessorkernen stabiler und schneller macht.
- **Versions-Bump** 0.44.0 → 0.45.0 ([package.json](package.json)).

### i18n

- **Neue Keys** in allen fünf Sprachen: die Status- und Syntaxfehler-Hinweise der Abfrage (`query.*`) sowie der Funktions-Katalog-Eintrag `frontmatterQuery` (Beschreibung, Kurzname, Zugang).
- **Handbuch** (4T-0356): neue Themen-Seite „Frontmatter-Abfrage" (Syntax, Operatoren, Werte-Semantik, Anzeige und Interaktion, Suchraum, Export) in fünf Sprachfassungen; Verweis in der Überblicksseite.

## [0.44.0.482] - 2026-07-06 — Editor-Kontextmenü mit Formatierungs-Funktionen

Epic 3E-0071 (Editor-Kontextmenü mit Formatierungs-Funktionen). Ein Rechtsklick im Editor öffnet ein Kontextmenü, das Link-, Format-, Absatz- und Einfüge-Aktionen sowie die Befehle der Zwischenablage direkt am Text zugänglich macht. Die Format-Aktionen entstehen als Kommandos der zentralen Registry und sind damit zugleich per Tastenkürzel bedienbar. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0377 bis 4T-0381).

### Neu

- **Editor-Kontextmenü** (4T-0377): Rechtsklick im Editor (Quelltext- und Live-Modus) öffnet ein Kontextmenü über die bestehende Menü-Infrastruktur. Der Zwischenablage-Block (Ausschneiden, Kopieren, Einfügen, Alles auswählen) trägt korrekte Aktiv-Zustände; im schreibgeschützten Editor bleiben nur Kopieren und Alles auswählen.
- **Zeichen-Formate** (4T-0378): Fett, Kursiv, Durchgestrichen, Hervorheben, Quelltext, Mathe und Kommentar als Umschalter auf die Markierung, das Wort unter dem Cursor oder ein leeres Marker-Paar, dazu „Formatierung entfernen". Fett und Kursiv tragen die Standard-Kürzel Strg+B und Strg+I, die übrigen sind über die Einstellungen belegbar. Ebenso Wiki-Link und externer Link. Innerhalb eines Wiki-Link-Ziels und von Inline-Quelltext greifen die Format-Aktionen bewusst nicht.
- **Absatz-Aktionen** (4T-0379): Aufzählung, nummerierte Liste, Aufgabenliste, Überschrift 1 bis 6, Keine Überschrift und Zitat als zeilenweise Umschalter; ein Häkchen im Absatz-Untermenü zeigt den aktiven Zustand der Cursor-Zeile.
- **Einfügen** (4T-0379): Schablonen für Fußnote (mit fortlaufender Nummer und Definition am Dokument-Ende), Tabelle, Hinweisblock, horizontale Linie und Quelltext-Block, jeweils mit sinnvoller Cursor-Endposition.

### Intern

- **Neue Module**: `src/shared/markdown-format.js` (Toggle-Kern, Zustands-Erkennung und Einfüge-Schablonen, unit-testbar), `src/shared/editor-menu.js` (Zwischenablage-Zustandslogik), `src/renderer/modules/editor-context-menu.js` und `src/renderer/modules/editor-format.js`; Zwischenablage-Zugriff über eine schmale Electron-Brücke im Preload. Die Format-Aktionen sind editorScoped-Kommandos der zentralen Registry.
- **Test-Ausbau**: neue Unit-Matrizen `markdown-format.test.js` und `editor-menu.test.js`, E2E-Specs `editor-kontextmenue.spec.js` (EK-01 bis EK-05) und `editor-format.spec.js` (EF-01 bis EF-08); Abdeckungs-Matrix-Einträge S-044 bis S-069 und F-086.
- **Versions-Bump** 0.43.0 → 0.44.0 ([package.json](package.json)).

### i18n

- **Neue Keys** in allen fünf Sprachen: Kontextmenü- und Zwischenablage-Labels, 26 Format-, Absatz- und Einfüge-Kommandonamen mit Kürzel-Beschreibungen, zwei Submenü-Titel und der Funktions-Katalog-Eintrag `editorContextMenu`.
- **Handbuch** (4T-0380): neue Themen-Seite „Editor-Kontextmenü" (Aufbau, Selektions-Semantik, Umschalter mit Häkchen, Schutz in Links und Quelltext, Read-only) in fünf Sprachfassungen; Verweis in der Überblicksseite.

## [0.43.0.477] - 2026-07-06 — Link-Update beim Umbenennen und bereichsweiter Index

Epic 3E-0062 (Link-Update beim Umbenennen und persistenter Bereichs-Index). Beim Umbenennen einer Datei werden eingehende Verweise aus anderen Dateien automatisch mit angepasst; der Link-Index arbeitet in einem Bereich jetzt über den gesamten Bereich und wird in einer Cache-Datei persistiert. Umgesetzt in fünf Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0344 bis 4T-0350).

### Neu

- **Link-Update beim Umbenennen** (4T-0345, 4T-0346): Beim Umbenennen einer Datei werden eingehende Wiki-Links, Embeds und relative Markdown-Links aus anderen Dateien auf den neuen Namen umgeschrieben, bei der Kaskade auch die Verweise auf jede mit-umbenannte Unterseite. Ein Kontrollkästchen im Umbenennen-Dialog steuert es pro Vorgang, eine optionale Vorschau zeigt die betroffenen Dateien mit Fundstellen-Anzahl vorab, ein Bericht fasst umbenannte, angepasste und nicht anpassbare Dateien danach zusammen. Unverändert offene Dokumente ziehen nach; ein Dokument mit ungespeicherten Änderungen erhält den Fix im Editor als eigenen Rückgängig-Schritt, auf der Festplatte nur auf dem zuletzt gespeicherten Stand. Bei aktivierter Dokument-Historie ist jede Anpassung als Revision nachvollziehbar und zurücknehmbar.
- **Zwei Einstellungen** (4T-0346) im Einstellungs-Bereich „Verhalten" unter „Links beim Umbenennen": die Vorbelegung des Link-Updates (an/aus) und der Vorschau (an/aus), beide im Auslieferungszustand aktiv.
- **Bereichsweiter Link-Index** (4T-0347): In einer Bereichs-Applikation umfassen Backlinks, Tags, Autovervollständigung und Linter den gesamten Bereich statt nur des Ordners der aktiven Datei plus zwei Ebenen. Backlinks- und Tag-Panel zeigen die Quelldatei zweizeilig (Dateiname, darunter der Ordner relativ zur Bereichs-Wurzel), sodass gleichnamige Dateien aus verschiedenen Ordnern unterscheidbar sind.
- **Index-Persistenz** (4T-0348): Der Bereichs-Index wird beim Öffnen des Bereichs aufgebaut und in der Datei `Area_Cache.mdda` im Bereichs-Wurzelordner zwischengespeichert; beim erneuten Öffnen werden unveränderte Dateien über Prüfdaten (mtime, Größe) übernommen statt neu gelesen. Die Cache-Datei ist reiner Zwischenspeicher, erscheint nicht im Bereichs-Panel und kann gefahrlos gelöscht werden.

### Geändert

- **Umbenennen**: Die bisherige Eigenschaft, dass Wiki-Links anderer Dateien beim Umbenennen nicht umgeschrieben werden, gilt nicht mehr; das Umschreiben ist jetzt die Standard-Vorbelegung, abschaltbar pro Vorgang und per Einstellung.

### Intern

- **Neue Module**: `src/shared/link-rewrite.js` (Rewrite-Kern, unit-testbar) und die gemeinsame Erkennungsquelle `src/shared/markdown/link-scan.js` (4T-0344), damit Index, Linter und Rewrite dieselben Stellen als Link erkennen; Renderer-Helfer `src/renderer/modules/path-format.js` für die bereichsrelative Ordner-Anzeige.
- **Test-Ausbau**: neue E2E-Specs `link-update.spec.js` (LU-01 bis LU-08) und `bereichs-index-cache.spec.js` (BIC-01); neues Unit-Modul `link-index-cache.test.js`; Backlinks- und Bereichs-Panel-Tests erweitert; Abdeckungs-Matrix-Eintrag F-085.
- **Versions-Bump** 0.42.1 → 0.43.0 ([package.json](package.json)).

### i18n

- **20 neue Keys** in allen fünf Sprachen (Umbenennen-Dialog-Kontrollkästchen, Vorschau- und Bericht-Dialog, zwei Einstellungen unter „Links beim Umbenennen", Funktions-Katalog-Eintrag `renameLinkUpdate`).
- **Handbuch** (4T-0349): die Umbenennen-Sektion der Seite „Unterseiten" um das Link-Update erweitert, die Seite „Applikationen, Fenster und Bereiche" um den Abschnitt „Suchraum und Index" (bereichsweiter Suchraum, Cache-Datei) ergänzt, jeweils in fünf Sprachfassungen.

## [0.42.1.466] - 2026-07-05 — Hotfix: Build-Nummer-Guard

Hotfix zu Epic 3E-0070 (4T-0396). Kein nutzersichtbares App-Verhalten geändert; die Korrektur betrifft nur den Build-Prozess.

### Behoben

- **Build-Nummer-Guard erlaubt den Vor-Commit-Build**: Der Guard verlangte bisher, dass die Build-Nummer exakt der Commit-Anzahl des HEAD entspricht, was erst nach dem Release-Commit zutrifft. Er akzeptiert jetzt auch die um eins höhere Nummer, die den kommenden Release-Commit vorwegnimmt. Damit lässt sich die Test-EXE mit voller Versionsnummer schon vor dem Commit bauen, der Release-Ablauf ist wieder Nummer setzen, bauen, testen, committen, taggen. Echte Nachzügler-Commits (Abstand größer als eins) brechen den Build weiterhin ab.

## [0.42.0.465] - 2026-07-05 — Render-Fix, Build-Nummer und Bereichsdatei-Endung mdda

Gemeinsames Release der Epics 3E-0063 (Render-Aktualisierung aus der Quelltext-Ansicht), 3E-0070 (erweiterte Versionsnummer) und 3E-0064 (Bereichsdatei-Endung mddb auf mdda). Die Versionsnummer erhält eine vierte Stelle `.465`, die Commit-Anzahl zum Release-Commit; sie erscheint im About-Modal, in der CHANGELOG-Überschrift, in den Release-Notes und in den Windows-Datei-Eigenschaften der EXE. Git-Tag, EXE-Dateinamen und die `version` in `package.json` bleiben dreiteilig.

### Neu

- **Vierstellige Versionsnummer** (3E-0070): Die Versionsnummer trägt als vierte Stelle die laufende Commit-Anzahl zum Release-Commit (`X.Y.Z.N`). Sie macht jeden Release-Stand eindeutig und chronologisch einordenbar. Die Nummer wird beim Release über `scripts/set-build-number.js` gesetzt, in einer versionierten Build-Info-Datei abgelegt und über die Windows-FileVersion in die EXE übernommen.

### Behoben

- **Quelltext-Änderungen im Wechsel zur gerenderten Ansicht** (3E-0063): In der reinen Quelltext-Ansicht eingegebene Änderungen wurden beim Wechsel in die gerenderte Ansicht nicht angezeigt, weil der Moduswechsel das Render-Pane nicht neu aufbaute. Der Wechsel in die Ansichten „Gerendert" und „Geteilt" rendert jetzt den aktuellen Stand.

### Geändert

- **Bereichsdatei-Endung `.mdda`** (3E-0064): Die Bereichsdatei heißt jetzt `Area_Settings.mdda` („Markdown Data Area") statt `Area_Settings.mddb`. Bestehende Bereiche werden beim Öffnen still migriert, indem die alte Datei einmalig umbenannt wird; die dreistufige Historisierungs-Schaltung wirkt vor und nach der Migration unverändert.

### i18n

- Beschreibung des Historisierungs-Schalters (`help.feature.historyControl`) und die Handbuch-Seite „Dokument-Historie" (fünf Sprachen) nennen den neuen Bereichsdatei-Namen.

## [0.41.0] - 2026-07-03 — Unterseiten und Datei-Umbenennen

Epic 3E-0061 (Unterseiten: logische Seiten-Hierarchie und Datei-Umbenennen). Seiten können **Unterseiten in beliebiger Tiefe** haben, als logische Hierarchie unabhängig von der Ordnerstruktur: Träger ist der Dateiname mit dem Trennzeichen `∕` (Unicode U+2215), in Links wird der normale Schrägstrich geschrieben. Dazu kommen relative Unterseiten-Links, ein Anlage-Kommando, Breadcrumb und Unterseiten-Sektion sowie **Datei umbenennen** als neue Grundfunktion mit Kaskade über Unterseiten-Bäume. Umgesetzt in sechs Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0336 bis 4T-0343).

### Neu

- **Unterseiten mit U+2215-Namens-Konvention** (4T-0336): `Prozess-A∕Entwurf.md` ist die Unterseite `Entwurf` von `Prozess-A`, beliebig tief schachtelbar und unabhängig davon, in welchem Ordner des Suchraums die Datei liegt. In Wiki-Links gilt die Schrägstrich-Schreibweise `[[Prozess-A/Entwurf]]`; die bestehende Ordner-Pfad-Auflösung hat Vorrang, Konflikte meldet der Linter als mehrdeutig. Gleichnamige Unterseiten unter verschiedenen Seiten kollidieren nicht.
- **Relative Unterseiten-Links** (4T-0336): `[[/Entwurf]]` verweist auf die Unterseite der aktuellen Seite, `[[..]]` auf die Elternseite; beide funktionieren ohne Kenntnis des eigenen Seiten-Namens (Grundlage für künftige Vorlagen).
- **Parität über alle Konsumenten** (4T-0337): Autocomplete schlägt Unterseiten in Schrägstrich-Schreibweise vor (nach `[[/` die der aktuellen Seite), Wiki-Embeds `![[Prozess-A/Entwurf]]` und `![[/Entwurf]]` betten Unterseiten ein, Outgoing-Panel und Live-Modus lösen identisch zum Klick-Pfad auf.
- **Unterseite anlegen** (4T-0338): „Datei → Neue Unterseite…" fragt den Namen ab (mit Validierung), legt die Datei im Ordner der aktiven Datei an und öffnet sie als Tab; das Trennzeichen muss nie getippt werden. Existiert die Unterseite, wird sie geöffnet statt überschrieben.
- **Datei umbenennen** (4T-0339): neue Grundfunktion über „Datei → Umbenennen…" und das Tab-Kontextmenü. Offene Tabs (in allen Fenstern), Lesezeichen, die Zuletzt-geöffnet-Liste, die Sitzungs-Wiederherstellung und die Historien-Begleitdatei `.mdd` ziehen mit; Namens-Kollisionen werden vor der Umbenennung abgelehnt.
- **Umbenennen-Kaskade** (4T-0340): eine Seite mit Unterseiten nimmt beim Umbenennen ihren gesamten Unterseiten-Baum mit (der Dialog nennt die Anzahl vorab); eine Unterseite ändert nur ihr eigenes Namens-Segment. Kollisionen werden über alle Ziele geprüft, bevor die erste Datei umbenannt wird; Teilfehler stoppen die Kaskade mit Bericht. Wiki-Links aus anderen Dateien werden nicht umgeschrieben, gebrochene Ziele zeigt der Linter.
- **Breadcrumb und Unterseiten-Sektion** (4T-0341): über dem Dokument (Lese-, Geteilt- und Live-Ansicht) zeigt ein Breadcrumb die Eltern-Kette der aktiven Unterseite mit klickbaren Ebenen, fehlende Zwischen-Ebenen gekennzeichnet; die neue Sidebar-Sektion „Unterseiten" (Ansicht → Unterseiten) listet die direkten Unterseiten der aktiven Datei.
- **Hilfe und Handbuch** (4T-0342): neue Handbuch-Seite „Unterseiten" in allen fünf Sprachfassungen mit expliziter Verankerung des Trennzeichens `∕` (U+2215, zum Kopieren); Funktions-Katalog um vier Einträge erweitert, Überblicksseiten nachgezogen.

### Geändert

- **Linter**: neue Regel „Mehrdeutiges Wiki-Link-Ziel", wenn ein Ziel sowohl als Ordner-Pfad als auch als Unterseite existiert.
- **Wiki-Link-Klick-Fallback**: der Index-Fallback nutzt die volle logische Ziel-Form (Pfad- und Unterseiten-Match) statt nur des Datei-Namens.

### Intern

- **Neues Modul** `src/shared/subpages.js` (Namens-Logik: Übersetzung Slash-Form ↔ U+2215-Form, Segmente, Eltern-Kette, Expansion relativer Ziele, Namens-Validierung); generischer Namens-Eingabe-Dialog im Renderer (Unterseite anlegen, Umbenennen).
- **Test-Ausbau**: neue E2E-Spec `unterseiten.spec.js` (US-01 bis US-06); neues Unit-Modul `subpages.test.js` plus sieben Unterseiten-Tests in `backlinks.test.js`; Snapshot-Fixtures `unterseiten-links.md` und `unterseiten-embeds.md`; Abdeckungs-Matrix-Einträge F-081 bis F-084 und S-041 bis S-043.
- **Versions-Bump** 0.40.0 → 0.41.0 ([package.json](package.json)).

### i18n

- **63 neue Keys** in allen fünf Sprachen (Menüpunkte, Namens-Dialog, Validierungs- und Fehlertexte, Linter-Regel, Unterseiten-Sektion, Funktions-Katalog-Einträge `subpages`/`subpageCreate`/`renameFile`/`subpagesNavigation`, Handbuch-Seiten-Titel).
- **Neue Handbuch-Seite** `subpages` in fünf Sprachfassungen; Überblicksseiten in allen fünf Sprachfassungen nachgezogen.

## [0.40.0] - 2026-07-03 — Dokument-Historie

Epic 3E-0060 (Dokument-Historie: Änderungsprotokoll in Markdown-Data-Dateien). Die App protokolliert Änderungen eines Dokuments auf Wunsch als **Revisions-Historie** in einer Begleitdatei `<name>.mdd` („Markdown-Data") neben dem Dokument: zeilenbasierte Änderungspakete mit Zeitstempeln, Hash-Absicherung und Anker-Snapshots, geschaltet auf drei Ebenen (App, Bereich, Dokument), sichtbar in der Statusbar und auswertbar in einer Historien-Ansicht mit Versions-Vergleich und Wiederherstellen. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe-/Handbuch-Task und Sammeltask (4T-0331 bis 4T-0335).

### Neu

- **Änderungsprotokoll in Markdown-Data-Dateien** (4T-0331): bei aktiver Historisierung entsteht neben dem Dokument die Begleitdatei `<name>.mdd` (JSON-Container mit versioniertem Schema, offen für spätere Inhalte). Aufeinanderfolgende Speicherungen werden über zwei Zeitfenster zu Änderungspaketen zusammengefasst (maximale Paket-Dauer, Vorgabe 5 Minuten; Inaktivitäts-Schluss, Vorgabe 2 Minuten); jedes Paket trägt UTC-Zeitstempel, Auslöser und den Hash des Nachher-Stands, in Abständen sichern Anker-Snapshots volle Zwischenstände. Außerhalb der App vorgenommene Änderungen werden beim Öffnen und vor jedem Speichern am Hash erkannt und als eigenes Paket („extern") nachgetragen, die Historie bricht nicht. Eine defekte `.mdd` wird nie überschrieben; die Protokollierung pausiert mit Statusbar-Hinweis.
- **Historisierung auf drei Ebenen** (4T-0332): Dokument (YAML-Eigenschaft `history` im Frontmatter) schlägt Bereich (Bereichsdatei `Area_Settings.mddb` im Bereichs-Wurzelordner) schlägt App-Einstellung (Einstellungen → Verhalten, ab Werk aus); nicht gesetzte Ebenen erben. Die Bereichsdatei entsteht erst beim ersten Setzen des Bereichs-Defaults. Abschalten pausiert nur, vorhandene Historie bleibt erhalten und wird beim Wiedereinschalten lückenlos fortgesetzt.
- **Statusbar-Anzeige** (4T-0332): neues Uhr-Symbol mit drei Zuständen (aktiv, pausiert, inaktiv) und Herkunfts-Tooltip (Datei-, Bereichs- oder App-Einstellung); das Klick-Menü öffnet die Historien-Ansicht und setzt den Dokument-Schalter (aktivieren, deaktivieren, Erbwert), geschrieben als Frontmatter-Round-Trip in den Editor.
- **Historien-Ansicht mit Vergleich und Wiederherstellen** (4T-0333): „Ansicht → Dokument-Historie" (Registry-Kommando `history.open`, ohne Default-Kürzel) öffnet die Revisionsliste als schreibgeschützten Tab: Zeitpunkt, Auslöser und Änderungsumfang (+/− Zeilen) pro Revision, Ausgangsstand und aktueller Stand eingeschlossen. Jede Revision ist einsehbar, zwei Stände sind zeilenweise vergleichbar (Hunk-Darstellung mit Kontext und Auslassungs-Markern), und ein alter Stand lässt sich in den Editor zurückholen; das Speichern erzeugt dann eine neue Revision, Historie wird nie gelöscht.
- **Hilfe und Handbuch** (4T-0334): neue Handbuch-Seite „Dokument-Historie" in allen fünf Sprachfassungen (Konzept, Begleitdatei, drei Ebenen, Änderungspakete, Statusbar, Historien-Ansicht); Funktions-Katalog um drei Einträge erweitert, Überblicksseiten nachgezogen.

### Geändert

- **Markdown-Data-Dateien sind keine Dokumente**: `.mdd`/`.mddb` lassen sich nicht als Tab öffnen (lokalisierter Hinweis statt Lesefehler); Bereichs-Panel, Suche und Backlinks-Index ignorieren sie.

### Intern

- **Neue Module**: `src/shared/line-diff.js` (zeilenbasierter LCS-Diff mit Anwendung, Umfangs-Zählung und Hunk-Darstellung, ohne neue Dependency), `src/main/mdd-store.js` (Container-Format, Paket-Bildung, Anker, Hashes, Drei-Ebenen-Auflösung), `src/renderer/modules/history-status.js` (Statusbar) und `src/renderer/modules/history-page.js` (Historien-Ansicht).
- **Test-Ausbau**: neue E2E-Spec `dokument-historie.spec.js` (DH-01 bis DH-08); neue Unit-Module `line-diff.test.js` (inklusive deterministischem Property-Test) und `mdd-store.test.js`; Abdeckungs-Matrix-Einträge F-078 bis F-080 und S-040.
- **Versions-Bump** 0.39.0 → 0.40.0 ([package.json](package.json)).

### i18n

- **50 neue Keys** in allen fünf Sprachen (Statusbar-Zustände und -Menü, Einstellungs-Gruppe Dokument-Historie, Historien-Ansicht, Menüpunkt, Hinweise, Funktions-Katalog-Einträge `history`/`historyControl`/`historyView`, Handbuch-Seiten-Titel).
- **Neue Handbuch-Seite** `history` in fünf Sprachfassungen; Überblicksseiten in allen fünf Sprachfassungen nachgezogen.

## [0.39.0] - 2026-07-03 — Applikationen und Bereiche

Drei Epics mit gemeinsamem Release: 3E-0057 (Logische Applikationen und Mehrfachstart), 3E-0058 (Bereichs-Konzept) und 3E-0059 (Bereichs-Panel). Das Programm kann jetzt mehrfach gestartet werden — jeder weitere Start legt eine **logische Applikation** als eigenständigen Arbeitskontext an (Weg-B-Architektur: ein Prozess, der Single-Instance-Lock bleibt). Eine Applikation kann an einen **Bereich** gebunden werden (ein Ordner samt Unterordnern als ausschließlicher Arbeitsraum mit harten Grenzen), und ein neues **Sidebar-Panel** zeigt den Bereich als Ordnerstruktur mit Dateiliste. Umgesetzt in neun Umsetzungs-Tasks plus drei Hilfe-/Handbuch-Tasks und Sammeltask (4T-0318 bis 4T-0330).

### Neu

- **Mehrfachstart und logische Applikationen** (4T-0318, 4T-0319): jeder weitere Start der EXE (oder „Datei → Neue Applikation") legt eine neue logische Applikation mit eigenen Fenstern und eigener Fenster-Nummerierung an. Der Fenstertitel zeigt gestuft nur so viel wie nötig: `(Fenster 2)` bei mehreren Fenstern einer Applikation, `(App 2)` bei mehreren Applikationen, kombiniert `(App 2, Fenster 3)`; Nummern rücken beim Schließen lückenlos nach. Das Tab-Kontextmenü nennt Ziel-Fenster bei mehreren Applikationen mit App-Kontext.
- **Sitzungs-Wiederherstellung über Applikationen** (4T-0320): die Sitzung persistiert seither die App-Struktur (Applikationen → Fenster → Panes, inklusive Bereichs-Bindung); Bestands-Sitzungen im alten Format werden verlustfrei als eine Applikation übernommen.
- **Bereiche** (4T-0322, 4T-0323): „Datei → Bereich öffnen…" bindet eine Applikation an einen Ordner (inklusive Unterordner) als ausschließlichen Arbeitsraum; der Titel zeigt `(Bereich <Name>)` statt der App-Nummer. Hat die Applikation bereits eine geöffnete Datei, entsteht automatisch eine neue Applikation; derselbe Bereich läuft nie doppelt (Sprung in das laufende Fenster). Die Grenzen sind hart: Öffnen-Dialog, Zuletzt-geöffnet-Liste, Speichern unter, Drag & Drop und alle internen Öffnen-Pfade bleiben im Bereich; Explorer-Doppelklicks landen immer in einer Applikation ohne Bereich. „Bereich schließen" schließt alle Fenster der Bereichs-Applikation mit den üblichen Speichern-Nachfragen.
- **Außen-Link-Warnung** (4T-0324): Links auf Ziele außerhalb des Bereichs werden in allen Ansichten mit einer Warn-Unterstreichung markiert (Tooltip mit dem vollen Ziel-Pfad); der Klick öffnet nicht und meldet den Grund in der Statusbar. Eingebettete Bilder von außerhalb werden weiterhin gerendert (die Grenze gilt für das Öffnen, nicht für das Rendern).
- **Zuletzt geöffnete Bereiche** (4T-0325): eigenes Datei-Menü-Submenü für den schnellen Wiedereinstieg (jüngste zuerst, maximal zehn, voller Pfad als Tooltip, „Liste löschen" mit Bestätigung); ein Eintrag öffnet den Bereich mit den üblichen Regeln, fehlende Ordner werden gemeldet und ausgetragen.
- **Bereichs-Panel** (4T-0327, 4T-0328): siebtes Sidebar-Panel (links/rechts andockbar, Statusbar-Ordner-Icon als Schalter) mit Ordnerbaum oben und der Markdown-Dateiliste des ausgewählten Ordners darunter; Einfachklick öffnet als Tab, alle Einträge zeigen den vollen Pfad als Tooltip. Externe Änderungen erscheinen automatisch (Verzeichnis-Watcher, debounced); der „+"-Knopf legt eine neue Markdown-Datei im ausgewählten Ordner an und öffnet sie. In einer frisch geöffneten, leeren Bereichs-Applikation ist das Panel automatisch sichtbar.
- **Handbuch-Seite „Applikationen, Fenster und Bereiche"** (4T-0321, 4T-0326, 4T-0329): neue Themen-Seite in allen fünf Sprachfassungen (Ebenen-Modell, Mehrfachstart, Titel-Systematik, Bereiche mit harten Grenzen, Bereichs-Panel, zuletzt geöffnete Bereiche); Funktions-Katalog um vier Einträge erweitert, Sidebar-Seite auf sieben Panels nachgezogen.

### Geändert

- **Fenstertitel-Systematik**: der bisherige Suffix `(Fenster N)` ist seither app-lokal und wird bei mehreren Applikationen um `App N` bzw. den Bereichsnamen ergänzt; bei einer Applikation mit einem Fenster bleibt der Titel unverändert ohne Suffix.
- **Explorer-/CLI-Routing**: per „Öffnen mit"/Doppelklick übergebene Dateien landen in der zuletzt fokussierten Applikation ohne Bereich; laufen nur Bereichs-Applikationen, entsteht dafür automatisch eine neue bereichslose Applikation.
- **Menü-Labels eindeutiger benannt** (PO-Testbefund aus 4T-0330): „Neu" → „Neue Datei" und „Öffnen…" → „Datei öffnen…" im Datei-Menü (alle fünf Sprachen), zur klaren Unterscheidung von „Neue Applikation" und „Bereich öffnen…"; die Zugangs-Angaben des Funktions-Katalogs und die README ziehen nach.
- **Panel-Schalter gelten auch ohne offene Datei** (PO-Testbefund aus 4T-0330): das Bereichs-Panel und die Lesezeichen-Sektion wurden im Empty-State erzwungen eingeblendet, am Statusbar-Schalter vorbei — der Bereichs-Schalter ließ sich nicht ausschalten, und eine ausgeschaltete Lesezeichen-Sektion erschien trotzdem. Beide respektieren jetzt auch im Empty-State den Schalter (die Lesezeichen-Auto-Anzeige beim ersten angelegten Bookmark bleibt, weil sie den Schalter mit setzt). Regressionstests `test/e2e/regression/4t-0330.spec.js`.
- **Migration ohne Verhaltensänderung**: ohne Nutzung der neuen Funktionen verhält sich die App wie 0.38.1 (ein Start = eine Applikation, kein Bereich, unveränderte Titel bei einem Fenster); die Sitzung wird beim ersten Start einmalig in das App-Schema überführt.

### Behoben

- **Beenden direkt nach dem Öffnen eines frischen Fensters** (Nebenbefund aus 4T-0320): der Close-Bestätigungs-Listener des Renderers wurde erst spät registriert — ein Quit unmittelbar nach dem Fenster-Öffnen konnte die Schließen-Anfrage verlieren, das Fenster schloss nie und das Beenden hing. Die Registrierung läuft jetzt synchron beim Modul-Laden.
- **Portable-EXE beim Mehrfachstart** (EXE-Test-Befunde aus 4T-0330): der Portable-Launcher entpackte bei jedem Start in denselben build-deterministischen Temp-Ordner und löschte ihn nach dem Beenden seines Kind-Prozesses — der Zweitstart (der sich wegen des Single-Instance-Locks sofort beendet) riss damit die entpackten App-Dateien unter der laufenden ersten Instanz weg, deren neue Fenster die Sprachdateien nicht mehr laden konnten (roher Titel-Key, halb-initialisierte Fenster). Die Portable-Konfiguration nutzt jetzt pro Start ein eigenes Entpack-Verzeichnis (`portable.unpackDirName: true`); zusätzlich setzt der Renderer den Fenstertitel nach dem Laden der Übersetzungen erneut, damit ein früher DisplayInfo-Push nie einen rohen Key im Titel hinterlässt.

### Intern

- **Neue Module**: `src/main/app-registry.js` (logische Applikationen, Nummerierung), `src/main/session-schema.js` (App-Sitzungs-Schema mit Migration), `src/main/area-path.js` (Bereichs-Pfad-Logik: Innerhalb-Prüfung, Zuletzt-Liste, Listing-Sortierung, Namens-Validierung), `src/renderer/modules/window-title.js` (Titel-Suffix), `src/renderer/modules/area.js` (Renderer-Grenz-Vorprüfung, Ziel-Resolver, Außen-Link-Marker) und `src/renderer/modules/area-panel.js` (Bereichs-Panel); Bereichs-Watcher pro Bereichs-App im Main.
- **Test-Ausbau**: neue E2E-Specs `logische-apps.spec.js` (LA-01 bis LA-03), `bereiche.spec.js` (BE-01 bis BE-09) und `bereichs-panel.spec.js` (BP-01 bis BP-03); neue Unit-Module `app-registry.test.js`, `session-schema.test.js`, `area-path.test.js` und `renderer/area.test.js` plus Titel-Suffix-Tests; Abdeckungs-Matrix-Einträge F-074 bis F-077 und S-037 bis S-039.
- **Versions-Bump** 0.38.1 → 0.39.0 ([package.json](package.json)).

### i18n

- **43 neue Keys** in allen fünf Sprachen (Titel-Systematik, Menü-Einträge für Applikation und Bereiche, Bereichs-Dialoge und -Meldungen, Linter-Tooltip der Außen-Link-Warnung, Zuletzt-geöffnete-Bereiche, Bereichs-Panel samt Neue-Datei-Pfad, Funktions-Katalog-Einträge `multiApp`/`area`/`recentAreas`/`areaPanel`, Handbuch-Seiten-Titel).
- **Neue Handbuch-Seite** `apps-windows` in fünf Sprachfassungen; Überblicks- und Sidebar-Seiten in allen fünf Sprachfassungen nachgezogen; Funktions-Katalog-Eintrag `multiWindow` auf die neue Titel-Systematik aktualisiert.

## [0.38.1] - 2026-07-03 — Fehlerbehebung Tab-Kontextmenü

Epic 3E-0056 (Fehlerbehebungen: Tab-Kontextmenü am Fensterrand und Multi-Window-Sitzung): Bugfix-Release zu einem vom Product Owner gemeldeten Altbestand-Fehler. Der zweite gemeldete Punkt (Sitzungs-Wiederherstellung bei sequenziellem Fenster-Schließen) wurde nach Rückfrage ohne Code-Änderung verworfen — Datei → Beenden sichert bereits alle Fenster; die README stellt das jetzt klar (4T-0316, verworfen). Umgesetzt in 4T-0315 (Fix) und 4T-0317 (Release).

### Behoben

- **Tab-Kontextmenü-Submenü am Fensterrand** (4T-0315): die Submenüs „Verschieben in" / „Kopieren in" öffneten stur rechts vom Menü-Eintrag und lagen bei Tabs nahe dem rechten Fensterrand außerhalb des Fensters — ein Tab ließ sich von dort nicht in ein anderes Fenster verschieben. Die Submenüs messen jetzt beim Öffnen und weichen bei Platzmangel nach links aus; bei Überlauf nach unten werden sie vertikal geklemmt. Regressionstest `test/e2e/regression/4t-0315.spec.js`.

### Geändert

- **README-Klarstellung zur Multi-Fenster-Sitzung** (4T-0316, verworfen): die Sektion „Multi-Window und Sitzung" dokumentiert jetzt, dass Datei → Beenden die komplette Multi-Fenster-Sitzung sichert, während beim einzelnen Schließen aller Fenster nur das zuletzt geschlossene wiederhergestellt wird (bewusst beibehaltenes Verhalten, Product-Owner-Entscheidung).
- **Versions-Bump** 0.38.0 → 0.38.1 ([package.json](package.json)).

## [0.38.0] - 2026-07-03 — PDF-Export-Erweiterungen

Epic 3E-0055 (PDF-Export-Erweiterungen): zwei Erweiterungs-Wünsche des Product Owners zum frisch ausgelieferten PDF-Export — der Export folgt jetzt der aktiven Ansicht (die Quelltext-Ansicht druckt das Roh-Markdown, inklusive Zeilennummern gemäß Tab-Einstellung), und ein neuer Darstellungs-Schalter hält das Frontmatter dauerhaft ausgeklappt, was damit auch im PDF wirkt. Umgesetzt in zwei Umsetzungs-Tasks plus Handbuch- und Sammeltask: 4T-0311 (Quelltext-Export), 4T-0312 (Frontmatter ausgeklappt), 4T-0313 (Hilfe/Handbuch), 4T-0314 (Release).

### Neu

- **Quelltext-Ansicht im PDF-Export** (4T-0311): der Export folgt der aktiven Ansicht — die Quelltext-Ansicht druckt das Roh-Markdown mit Syntax-Hervorhebung (highlight.js-Markdown-Grammatik, immer hell), inklusive Zeilennummern, wenn sie im Tab eingeschaltet sind; lange Zeilen brechen weich um, nur die erste Druckzeile trägt die Nummer. Gerendert, Geteilt und Live drucken wie bisher das formatierte Dokument. Technisch über einen dedizierten Print-Block aus dem Dokumenttext, weil der virtualisierte Editor (nur sichtbare Zeilen im DOM) nicht druckbar ist.
- **Frontmatter dauerhaft ausgeklappt** (4T-0312): neuer Schalter „Frontmatter ausgeklappt anzeigen" im Bereich Darstellung (Default aus, nur wirksam bei aktiver Frontmatter-Anzeige) — hält das Klartext-YAML in der gerenderten Ansicht und im Live-Modus dauerhaft offen und druckt es damit auch im PDF vollständig mit (ohne die Höhen-Grenze der Hover-Darstellung). Bei inaktivem Schalter bleibt die bisherige Hover-/Pin-Mechanik unverändert.

### Geändert

- **Migration ohne Verhaltensänderung**: ohne Nutzung der neuen Funktionen verhält sich die App exakt wie 0.37.0 (Frontmatter-Schalter startet aus; der Export aus Gerendert/Geteilt/Live ist unverändert, nur die Quelltext-Ansicht druckt jetzt Quelltext statt des gerenderten Inhalts).
- **Handbuch** (4T-0313): Seite „Werkzeuge" (PDF-Export je Ansicht) und Seite „Frontmatter und Properties" (Ausklapp-Schalter) in allen fünf Sprachfassungen nachgezogen; Funktions-Katalog-Einträge aktualisiert.

### Intern

- **Quelltext-Print-Block** (neues Modul `src/renderer/modules/pdf-source-print.js`): hljs-Hervorhebung mit zeilenweisem Split (zeilenübergreifende Spans werden pro Zeile balanciert geschlossen und wieder geöffnet), Zeilennummern als Grid-Spalte in der Breite der größten Nummer; Frontmatter-Ausklappen rein CSS-getragen über eine Root-Klasse (Setting `render.frontmatterExpanded` mit Multi-Window-Broadcast, ohne Re-Render). Architektur.md fortgeschrieben.
- **Test-Ausbau**: neue E2E-Prüfungen PD-07/PD-08 (Quelltext-Export, Print-Layout-DOM-Spike) und FM-03 (Ausklapp-Schalter inkl. Live-Widget und Print-Zustand); neues Unit-Modul `pdf-source-print.test.js`; Abdeckungs-Matrix-Hinweise F-069/F-073 nachgezogen.
- **Versions-Bump** 0.37.0 → 0.38.0 ([package.json](package.json)).

### i18n

- Ein neuer Key in allen fünf Sprachen (`settings.showFrontmatterExpanded`); Funktions-Katalog-Einträge `help.feature.exportPdf` und `help.feature.frontmatterDisplay` sowie die Handbuch-Seiten „Werkzeuge" und „Frontmatter und Properties" in allen fünf Sprachfassungen aktualisiert.

## [0.37.0] - 2026-07-03 — PDF-Export

Epic 3E-0054 (PDF-Export): Der seit dem ersten Anlauf zurückgestellte PDF-Export (4T-0024) ist umgesetzt — „Datei → Als PDF exportieren…" (Standard Strg+Umschalt+P) druckt den gerenderten Inhalt des aktiven Tabs in eine PDF-Datei, immer hell, unabhängig von Theme und Ansichts-Modus. Die Variante B+ (Theme-Variablen-Override) bestand den Spike gegen alle drei dokumentierten Fehlerbilder des ersten Anlaufs; Seitenformat, Ausrichtung und Ränder konfiguriert der neue Einstellungs-Bereich „Export". Umgesetzt in zwei Umsetzungs-Tasks plus Handbuch- und Sammeltask: 4T-0303 (Export-Kern), 4T-0304 (Export-Einstellungen), 4T-0305 (Hilfe/Handbuch), 4T-0306 (Release).

### Neu

- **PDF-Export** (4T-0303): Menüpunkt „Datei → Als PDF exportieren…" direkt nach „Speichern unter…" plus Registry-Kommando mit Standard-Kürzel Strg+Umschalt+P (umbelegbar). Save-Dialog mit sinnvollem Default-Namen (`<basename>.pdf` neben der Quelldatei; bei pfadlosen Tabs der Anzeigename im Home-Verzeichnis). Gedruckt wird immer der gerenderte Inhalt des aktiven Panes — Quelltext- und Live-Modus wechseln für den Druck intern auf die gerenderte Ansicht und stellen den Modus danach wieder her. Statusbar-Feedback für Erfolg und Fehler; Abbruch im Dialog bleibt still. Handbuch-Tabs sind exportierbar, der Einstellungs-Tab ist ausgenommen (Menüpunkt deaktiviert).
- **Immer helles PDF nach Variante B+** (4T-0303): für die Druckdauer werden die CSS-Theme-Variablen per JS auf die Light-Werte gesetzt, `data-theme` auf hell gezwungen und Mermaid-Diagramme hell neu gerendert (bleiben Vektorgrafik); KaTeX-Formeln, Code-Hervorhebung, Callouts, Custom Containers und Perspective-Tabellen erscheinen wie in der Vorschau. Seitenumbruch-Regeln halten Code-Blöcke, Tabellen, Diagramme, Formeln, Callouts und Embeds nach Möglichkeit zusammen; Überschriften stehen nicht allein am Seitenende.
- **Einstellungs-Bereich „Export"** (4T-0304): achter Bereich der Einstellungs-Seite (hinter „Verhalten") mit Seitenformat (A4 Default; zusätzlich A3, A5, Letter, Legal), Ausrichtung (Hochformat Default, Querformat) und Rändern (schmal/normal/breit, entspricht etwa 1/2/3 cm; normal Default). Normale Entwurf-/Anwenden-Logik; die Werte wirken auf den nächsten Export, gelten in allen Fenstern und überleben Neustarts; ungültige oder fehlende Werte fallen auf die Defaults zurück.

### Geändert

- **Migration ohne Verhaltensänderung**: ohne Export-Aufruf verhält sich die App exakt wie 0.36.0; die Export-Einstellungen starten mit den Defaults A4/Hochformat/normal.
- **Handbuch-Seite „Werkzeuge"** (4T-0305): neue Sektion „PDF-Export" in allen fünf Sprachfassungen; Funktions-Katalog um den Eintrag PDF-Export in der Datei-Gruppe ergänzt (die generierten Funktions- und Tastenkürzel-Seiten ziehen automatisch nach).

### Intern

- **Spike gegen die Fehlerbilder des ersten Anlaufs** (4T-0303): E2E-verprobt vor dem Commitment — Dark-Theme-Reste (Farb-Marker-Analyse der entpackten PDF-Content-Streams), Nur-erste-Seite (Seitenzahl-Prüfung plus Layout-Reset-Checks) und sichtbares Source-Pane (eigenständige Versteck-Selektoren statt der früheren Kollision). Dabei viertes Fehlerbild gefunden und behoben: Chromium malt die Fenster-Hintergrundfarbe als Seiten-Grund unter die Druckränder (im Dark-Theme ein dunkler Rahmen um jede Seite); der Druck-Endpunkt stellt sie für die Druckdauer auf Weiß.
- **Architektur**: IPC in zwei Endpunkten (`pdf:chooseTarget` vor dem Print-Zustand, `pdf:print` mit Store-Werten), Options-Mapping electron-frei in `src/shared/pdf-options.js` (gemeinsame Quelle für Main und Einstellungs-Bereich, unit-getestet), Print-Regeln am `printing`-Klassen-Hook mit generischer Streuner-Regel gegen Body-Level-Fremd-DOM und deterministischem Druck des aktiven Panes, Mermaid-Queue-Barriere als Nachfolger des früheren Promise-Syncs. Architektur.md um die Sektion „PDF-Export" fortgeschrieben.
- **Test-Ausbau**: neue E2E-Spec `pdf-export.spec.js` (PD-01 bis PD-06: Dark-Export mehrseitig ohne Dark-Füllfarben, Abbruch, Fehlerpfad, Modus-Wiederherstellung, Print-Layout-Regeln, Export-Einstellungen mit Querformat; Save-Dialog im Test gestubbt), neue Unit-Tests `pdf-options.test.js`, ES-05 auf acht Bereiche angepasst, Abdeckungs-Matrix-Einträge F-073 und S-036.
- **Versions-Bump** 0.36.0 → 0.37.0 ([package.json](package.json)).

### i18n

- 20 neue Keys in allen fünf Sprachen: Export-Pfad (`menu.file.exportPdf`, `pdf.*`, `dialog.filterPdf` — 6 Keys), Einstellungs-Bereich (`settings.export.*` — 10 Keys), Funktions-Katalog (`help.feature.exportPdf`, `help.featureName.exportPdf`, `help.featureAccess.exportPdf`) und Tastenkürzel-Beschreibung (`help.shortcut.exportPdf`).
- Handbuch-Seite „Werkzeuge" in allen fünf Sprachfassungen um die Sektion „PDF-Export" erweitert.

## [0.36.0] - 2026-07-02 — Externe Erweiterungen

Epic 3E-0053 (Externe Erweiterungen): Die App lädt jetzt von Nutzern installierte Erweiterungs-Pakete, die über die neue, versionierte Erweiterungs-API v1 Rendering und Oberfläche erweitern — mit explizitem Vertrauens-Ablauf (Warn-Dialog je Erweiterung und Version, keine Sandbox als bewusste Product-Owner-Entscheidung), Fehler-Isolation mit automatischer Deaktivierung, eigenem Verwaltungs-Bereich in den Einstellungen und einer ausführlichen Entwickler-Handbuch-Seite in fünf Sprachen. Ohne installierte Pakete verhält sich die App exakt wie zuvor. Umgesetzt in drei Umsetzungs-Tasks plus Handbuch- und Sammeltask: 4T-0299 (API v1), 4T-0298 (Lade- und Vertrauensmodell), 4T-0300 (Verwaltungs-Bereich), 4T-0301 (Entwickler-Handbuch), 4T-0302 (Release).

### Neu

- **Externe Erweiterungs-Pakete** (4T-0298): Installation durch Ablegen eines Paket-Ordners (`manifest.json` plus Code-Dateien) im Erweiterungs-Verzeichnis des Nutzerprofils; Erkennung beim Start, per Broadcast und über die Aktualisieren-Aktion. Ungültige Manifeste werden mit Diagnose-Details gelistet und nie geladen.
- **Vertrauens-Ablauf** (4T-0298): neu erkannte Pakete sind deaktiviert; die Aktivierung verlangt einen deutlichen Warn-Dialog (fremder Code, voller Zugriff auf Dokumente und App, keine Sandbox; Abbrechen ist Default). Die Bestätigung wird je Erweiterung und Version gespeichert — ein Versions-Wechsel erfordert eine erneute Bestätigung, Deaktivieren nimmt sie nicht zurück.
- **Erweiterungs-API v1** (4T-0299): versionierte, dokumentierte Oberfläche mit sechs Beitrags-Arten — markdown-it-Plugin (wirkt in Anzeige und portablem Export), Sidebar-Panel (voll integriert in Layout, Drag-and-Drop und Persistenz), Kommando mit optionalem Standard-Kürzel (umbelegbar im Tastenkürzel-Editor), eigener Einstellungs-Bereich, Lese-Zugriff auf Theme-Variablen/Theme/Sprache sowie eigene Übersetzungen mit Fallback auf die Standard-Sprache der Erweiterung; dazu ein Persistenz-Namensraum je Erweiterung. Semantische `apiVersion`-Prüfung: inkompatible Pakete werden nie geladen und klar gekennzeichnet.
- **Fehler-Isolation** (4T-0298): eine beim Laden werfende Erweiterung wird vollständig zurückgerollt, automatisch deaktiviert und mit persistiertem Fehlertext angezeigt; werfende Markdown-Plugins fliegen isoliert aus dem Pipeline-Aufbau; Laufzeit-Fehler in Kommandos oder Panels brechen die App nicht ab.
- **Einstellungs-Bereich „Erweiterungen (extern)"** (4T-0300): siebter Bereich der Einstellungs-Seite, klar getrennt vom internen Bereich — Liste mit Name, Version, Beschreibung, Herkunfts-Pfad und Status (Aktiv, Nicht aktiviert, Bestätigung nötig, Fehler mit Fehlertext, Ungültiges Manifest, Inkompatible API-Version); Aktionen Aktivieren (mit Warn-Dialog), Deaktivieren, Entfernen (löscht das Verzeichnis nach eigener Bestätigung), Aktualisieren und „Ordner öffnen". Aktionen wirken sofort, unabhängig von Anwenden/OK.
- **Handbuch-Seite „Erweiterungen erstellen"** (4T-0301): ausführliche Entwickler-Seite in fünf Sprachen — Paket-Aufbau, Manifest-Referenz, komplette ctx-Referenz der API v1 mit Code-Beispielen je Beitrags-Art, Installations- und Vertrauens-Ablauf, Versionierungs-Regeln mit Stabilitäts-Zusage, Fehler-Diagnose, Qualitäts-Hinweise und unmissverständlicher Sicherheits-Hinweis; die Referenz-Erweiterung dient als lauffähige Vorlage.

### Geändert

- **Migration ohne Verhaltensänderung**: ohne installierte externe Erweiterungen verhält sich die App exakt wie 0.35.0 (leere Enabled-Liste als Default; die komplette Bestands-Testsuite läuft unverändert auf dem Default-Zustand).
- **Bestehende Handbuch-Seite „Erweiterungen"**: neue Sektion „Externe Erweiterungen" mit Querverweis auf die Entwickler-Seite (fünf Sprachen).

### Intern

- **Ausführungs-Spike und zweigeteilte Ausführung** (4T-0298): UI-Einstiegspunkte laden als ES-Module per dynamischem `import()` ihrer file://-URL im Renderer (CSP `script-src 'self'` erlaubt file→file-Modul-Importe, eval/blob bleiben blockiert); Markdown-Plugins evaluiert der Preload per `node:vm` in leerem Sandbox-Kontext (kein require/process — „kein Node-API-Zugriff" technisch eingehalten, mit Lade-Timeout). Main-seitiger Verzeichnis-Scan mit ID-Whitelist (der Renderer reicht nie Pfade herein, Muster des Handbuch-Seiten-Loaders); Vertrauens-Persistenz in eigenen Store-Schlüsseln (`extensionsExternal.enabled`/`.trusted`/`.lastError`) mit invertiertem Default gegenüber `extensions.disabled`.
- **Host und Registry-Anschluss** (4T-0299): neue Module `src/shared/extensions-external.js` (Manifest-Modell, API-Versionierung, Status-Logik), `src/renderer/modules/extension-host.js` (ctx-Fassade, Aktivierungs-Zustandsmaschine, Rollback-Tracker) und `src/main/extension-packages.js`/`extension-loader.js`; dynamische Registrierung an der Erweiterungs-Registry (Herkunft `external`, ID-Kollisionsschutz), dynamische Kommandos im `ext.`-Namensraum, Erweiterungs-Übersetzungen als i18n-Zusatz-Tabellen. Referenz-Erweiterung `beispiel` plus absichtlich defekte und inkompatible Test-Pakete als Fixtures. Architektur.md fortgeschrieben.
- **Test-Ausbau**: neue E2E-Spec `erweiterungen-extern.spec.js` (EX-01 bis EX-04: Laden und Wirken, keine Ausführung ohne Aktivierung, Fehler-Isolation, Verwaltungs-Bereich; Helper installiert Fixture-Pakete ins Temp-Profil); neue Unit-Tests `extensions-external.test.js`, `extension-packages.test.js`, `commands-dynamic.test.js`, `markdown-external-plugins.test.js`, `extension-host.test.js` und `settings-extensions-external.test.js`; ES-05 auf sieben Bereiche angepasst; Abdeckungs-Matrix-Eintrag F-072.
- **Versions-Bump** 0.35.0 → 0.36.0 ([package.json](package.json)).

### i18n

- 30 neue Keys in allen fünf Sprachen: Warn- und Entfernen-Dialog (`extensions.external.*`, 10 Keys), Einstellungs-Bereich (`settings.extensionsExternal.*`, 16 Keys), Funktions-Katalog (`help.feature.extensionsExternal`, `help.featureName.extensionsExternal`, `help.featureAccess.extensionsExternal`) und Handbuch-Seitentitel (`manual.page.extensionsDev.title`).
- Neue Handbuch-Seite „Erweiterungen erstellen" in allen fünf Sprachfassungen, verlinkt von der Überblicksseite und der Seite „Erweiterungen".

## [0.35.0] - 2026-07-02 — Interne Erweiterungen

Epic 3E-0052 (Interne Erweiterungen): Die App erhält ein Erweiterungs-System — 27 Bestands-Funktionen sind jetzt interne Erweiterungen und lassen sich im neuen Einstellungs-Bereich „Erweiterungen" einzeln ein- und ausschalten, mit deklarierten Abhängigkeiten, dynamischen erweiterungs-eigenen Einstellungs-Bereichen und vollständigem Daten-Erhalt. Der Default bleibt alles eingeschaltet; ohne eigene Konfiguration verhält sich die App exakt wie zuvor. Dieselbe Registry, derselbe Lebenszyklus und dieselben Hook-Punkte sind die Grundlage des externen Erweiterungs-Systems (3E-0053). Umgesetzt in vier Umsetzungs-Tasks plus Hilfe- und Sammeltask: 4T-0292 (Registry und Lebenszyklus), 4T-0293 (Render-Erweiterungen), 4T-0294 (Vernetzung und Werkzeuge), 4T-0295 (Einstellungs-Bereiche), 4T-0296 (Hilfe/Handbuch), 4T-0297 (Release).

### Neu

- **Einstellungs-Bereich „Erweiterungen"** (4T-0295): sechster Bereich der Einstellungs-Seite mit allen 27 internen Erweiterungen in drei Kategorien (Rendering, Vernetzung, Werkzeuge), je Zeile Schalter, Name und Kurzbeschreibung; Wirkung bei Anwenden/OK — sofort, ohne Neustart, in allen Fenstern und Modi (Render-Pane, Live-Modus, Portable-Export).
- **18 schaltbare Render-Erweiterungen** (4T-0293): Callouts, Custom Containers, Highlight, Fußnoten, Emoji-Shortcodes, Abkürzungen, Bild-Größen und Bildunterschriften, Definitionslisten, Line Blocks, Typografie (Tief-/Hochstellen, Unterstreichen), Attribute (Spans, Überschrift-IDs), Spoiler, Critic Markup, erweiterte Task-Status, Perspective-Tabellen, KaTeX-Formeln, Mermaid-Diagramme und Syntax-Highlighting. Abgeschaltete Syntax erscheint als Klartext bzw. Standard-Markdown, kein Fehler-Rendering.
- **9 schaltbare Vernetzungs- und Werkzeug-Erweiterungen** (4T-0294): Wiki-Links (mit Ankern, Block-Ankern und den Panels für ausgehende Links und Backlinks), Wiki-Embeds, Tags und Autocomplete sowie Markdown-Linter, Lesezeichen, Fokus-Modus mit Typewriter-Scroll, Wort-Statistik und Code-Copy-Button. Abschalten nimmt Panels, Statusbar-Buttons, Menü-Einträge und Tastenkürzel sauber mit; ohne Konsumenten entsteht keine Index-Last.
- **Abhängigkeits-Kopplung** (4T-0292, 4T-0295): abhängige Erweiterungen deaktivieren sich deklarativ mit (Wiki-Embeds mit Wiki-Links); der Bereich zeigt den Hinweis „Über Abhängigkeit deaktiviert", der eigene Schalter der abhängigen Erweiterung bleibt erhalten und greift beim Wiedereinschalten der Grundlage.
- **Erweiterungs-eigene Einstellungs-Bereiche** (4T-0295): im Manifest deklarierte Bereiche erscheinen nur bei aktiver Erweiterung in der Bereichsnavigation; erster Anwendungsfall ist der Bereich Task-Status als Bereich der Task-Status-Erweiterung. Verschwindet der gerade offene Bereich, fällt die Seite auf den Bereich „Erweiterungen" zurück; persistierte Werte bleiben erhalten.
- **Daten-Erhalt beim Abschalten**: Lesezeichen-Baum, Task-Status-Definitionen, Panel-Sichtbarkeiten, eigene Tastenkürzel und Fokus-/Typewriter-Präferenzen bleiben gespeichert und kehren beim Einschalten zurück.

### Geändert

- **Migration ohne Verhaltensänderung** (4T-0292): Default ist die leere Disabled-Liste (`extensions.disabled`), alle Erweiterungen eingeschaltet; bestehende Einstellungen bleiben gültig, der Default-Zustand rendert byte-identisch zum Stand vor dem Umbau (Snapshot-Suite unverändert).

### Behoben

- **Statusbar-Icon-Buttons ignorierten das hidden-Attribut** (4T-0295): die Icon-Button-Regel überstimmte mit `display:inline-flex` die Browser-`[hidden]`-Regel; beim Ausblenden der Buttons deaktivierter Erweiterungen aufgefallen und mit einer expliziten `[hidden]`-Regel behoben (Regressionstest EW-03).

### Intern

- **Erweiterungs-Registry und Lebenszyklus** (4T-0292): neues Shared-Modul `src/shared/extensions.js` (deklaratives Manifest-Modell mit ID, Kategorie, i18n-Keys, Abhängigkeiten, Kommando- und Bereichs-Zuordnung; Validierung inklusive Zyklen-Erkennung; Kern-Abgrenzung technisch: Unregistriertes ist immer aktiv) und Renderer-Lebenszyklus-Modul `extension-lifecycle.js` (Zustand, Laufzeit-Hooks im attach-Muster, Broadcast-Empfang). Pipeline-Aufbau in `markdown.js` parametrisiert: Umschalten baut beide markdown-it-Instanzen (Viewer und Portable) mit dem aktiven Plugin-Satz neu auf; Kommando-Filterung wirkt auf Dispatcher, Editor-Keymap, Menü, Tastenkürzel-Editor und die generierte Tastenkürzel-Seite. Architektur.md fortgeschrieben.
- **Test-Ausbau**: neue E2E-Spec `erweiterungen.spec.js` (EW-01 bis EW-03: Schalten mit Sofort-Wirkung und Persistenz, dynamischer Bereich mit Rückfall, UI-Konsistenz); neue Unit-Tests `extensions.test.js`, `extension-lifecycle.test.js`, `settings-extensions.test.js`, `mermaid-aus.test.js` und `extensions-aus.test.js` (pro Erweiterung genau ein Aus-Zustand-Test gemäß Epic-Test-Pragmatik; die Voll-Suite läuft weiter mit dem Default alles an); Abdeckungs-Matrix-Eintrag F-071.
- **Versions-Bump** 0.34.0 → 0.35.0 ([package.json](package.json)).

### i18n

- Zwanzig neue Keys in allen fünf Sprachen: Einstellungs-Bereich (`settings.extensions.*`, 6 Keys), Namen und Beschreibungen der gebündelten Erweiterungen (`extension.*`, 10 Keys), Funktions-Katalog (`help.feature.extensions`, `help.featureName.extensions`, `help.featureAccess.extensions`) und Handbuch-Seitentitel (`manual.page.extensions.title`); die übrigen Erweiterungen referenzieren ihre bestehenden Katalog-Keys ohne Duplikate (4T-0293 bis 4T-0296).
- Neue Handbuch-Themen-Seite „Erweiterungen" (Konzept und Kern-Abgrenzung, Schalten, Wirkung des Aus-Zustands, Abhängigkeiten, Daten-Erhalt) in allen fünf Sprachfassungen, verlinkt von der Überblicksseite (4T-0296).

## [0.34.0] - 2026-07-02 — Dynamische Sidebar

Epic 3E-0051 (Dynamische Sidebar): Die Sidebar ist frei anordenbar — jede Spalte hat eine Sidebar-Fläche links und rechts, jedes der sechs Panels (Inhaltsverzeichnis, Properties, Tags, Outgoing-Links, Backlinks, Lesezeichen) kann auf beiden Seiten in wählbarer Reihenfolge stehen, mehrere Panels bündeln sich an einer Position als Reiter-Gruppe. Konfiguration per Drag-and-Drop direkt in der Sidebar und über den neuen Einstellungs-Bereich „Sidebar"; die Anordnung gilt global für die App, die Sichtbarkeit bleibt pro Spalte schaltbar. Umgesetzt in drei Umsetzungs-Tasks plus Hilfe- und Sammeltask: 4T-0287 (Registry und Layout-Modell), 4T-0288 (Rendering-Umbau), 4T-0289 (Konfiguration), 4T-0290 (Hilfe/Handbuch), 4T-0291 (Release).

### Neu

- **Zwei Sidebars je Spalte** (4T-0288): links und rechts vom Inhalt je ein Sidebar-Container mit eigenem Splitter; ein Container erscheint nur, wenn dort mindestens ein Panel in dieser Spalte sichtbar ist. Beide Seiten haben eigene, unabhängig ziehbare und persistierte Breiten (180 bis 500 Pixel, je Seite gemeinsam für beide Spalten).
- **Freie Anordnung der Panels** (4T-0287, 4T-0288): Seite und Reihenfolge jedes Panels sind frei wählbar; das Layout ist eine globale Einstellung und wirkt in allen Spalten und Fenstern. Die Sichtbarkeit je Panel bleibt wie bisher pro Spalte schaltbar (Statusbar, Menü, Kürzel unverändert).
- **Reiter-Gruppen** (4T-0288): mehrere Panels an derselben Position teilen sich den Platz als Gruppe mit Reiterleiste; sichtbar ist das aktive Panel, der aktive Reiter wird gemerkt. Das Einblenden eines gruppierten Panels aktiviert dessen Reiter.
- **Drag-and-Drop-Konfiguration** (4T-0289): Panel-Titel (bei Gruppen die Reiter) sind ziehbar — oberes/unteres Drittel eines Panels sortiert davor/dahinter, die Mitte bildet eine Gruppe, die Freifläche einer Sidebar hängt an; beim Ziehen erscheint auf einer leeren Seite ein schmaler Ablage-Streifen. Ziel-Zonen sind farblich markiert, Esc bricht ab, Änderungen wirken sofort in allen Fenstern.
- **Einstellungs-Bereich „Sidebar"** (4T-0289): fünfter Bereich der Einstellungs-Seite (erster Nutzer des Bereichs-Registry-Andockpunkts aus 0.32.0) mit beiden Seiten als Listen, Aktionen zum Verschieben, Seitenwechsel, Gruppieren, Lösen und Auflösen sowie Zurücksetzen auf die Standard-Anordnung; Wirkung bei Anwenden/OK gemäß Entwurfs-Logik der Seite.

### Geändert

- **Migration ohne Funktionsverlust** (4T-0287): das Default-Layout entspricht exakt dem bisherigen Zustand (alle sechs Panels links in bisheriger Reihenfolge, keine Gruppen); bestehende Sichtbarkeits-Einstellungen bleiben gültig, die bisherige gemeinsame Sidebar-Breite wird als Startbreite der linken Seite übernommen. Nutzer ohne eigene Anordnung erleben keine Änderung.

### Intern

- **Panel-Registry und Layout-Modell** (4T-0287): neues Modul `sidebar-layout.js` (Panel-Definitionen der sechs Bestands-Panels, reine Layout-Operationen, Persistenz, Breiten-Migration) — zugleich Andockpunkt für spätere Erweiterungs-Panels; Rendering per DOM-Umhängen der bestehenden Panel-Strukturen (Selektoren und Event-Bindungen der Panel-Module bleiben unberührt); Multi-Window-Broadcast über den `settings:set`-Kanal; neues Modul `sidebar-settings.js` (Einstellungs-Bereich). Architektur.md fortgeschrieben.
- **Test-Ausbau**: neue E2E-Spec `sidebar-layout.spec.js` (SL-01 bis SL-09: Default-Layout und Migration, Panels rechts, Reihenfolge, Reiter-Gruppen, Toggles pro Spalte, unabhängige Breiten, Drag-and-Drop mit Ziel-Zonen, Fenster-Broadcast), `einstellungen-seite.spec.js` um ES-10 erweitert; neuer Unit-Test `sidebar-layout.test.js` (Modell, Validierung, Operationen, Migration); Abdeckungs-Matrix-Eintrag F-070; Stabilitäts-Fix: explizite Timeouts an zwei lastabhängigen Backlinks-Unit-Tests.
- **Versions-Bump** 0.33.0 → 0.34.0 ([package.json](package.json)).

### i18n

- Siebzehn neue Keys in allen fünf Sprachen: Einstellungs-Bereich (`settings.sidebar.*`, 13 Keys), Funktions-Katalog (`help.feature.sidebarLayout`, `help.featureName.sidebarLayout`, `help.featureAccess.sidebarLayout`) und Handbuch-Seitentitel (`manual.page.sidebar.title`) (4T-0289, 4T-0290).
- Neue Handbuch-Themen-Seite „Sidebar" (Panels ein-/ausblenden, Anordnung, Reiter-Gruppen, Breiten) in allen fünf Sprachfassungen, verlinkt von der Überblicksseite (4T-0290).

## [0.33.0] - 2026-07-02 — Frontmatter-Anzeige im Gerenderten

Epic 3E-0050 (YAML-Anzeige im Gerenderten): Der YAML-Frontmatter-Block ist im Gerenderten nicht länger unsichtbar — er erscheint als dezente, zusammengeklappte Zeile mit Feldanzahl, die beim Überfahren als Klartext-YAML aufklappt und per Klick feststellbar ist, mit Parität in Render-Pane und Live-Modus und einem Einstellungs-Schalter (Default an). Umgesetzt in drei Umsetzungs-Tasks plus Hilfe- und Sammeltask: 4T-0282 (Render-Pane), 4T-0283 (Live-Modus), 4T-0284 (Einstellungs-Schalter), 4T-0285 (Hilfe/Handbuch), 4T-0286 (Release).

### Neu

- **Frontmatter-Zeile im Gerenderten** (4T-0282): Dokumente mit YAML-Frontmatter zeigen am Anfang der gerenderten Ansicht (geteilte Ansicht, reine Render-Ansicht, Lese-Modus) eine dezente, zusammengeklappte Zeile mit Feldanzahl. Überfahren mit der Maus klappt das Klartext-YAML auf (originalgetreu inklusive Kommentaren, mit YAML-Syntax-Färbung), Wegbewegen klappt mit kurzer Verzögerung zu, ein Klick stellt die Zeile fest. Tastatur-Bedienung über Fokus plus Enter/Leertaste; bei YAML-Parse-Fehlern erscheint der Roh-Text ohne Feldanzahl. Die Zeile ist reine Anzeige, der Editor bleibt die Properties-Sidebar. Markdown-Embeds zeigen weiterhin nur den Inhalt der eingebetteten Datei; der Portable-Export bleibt unverändert (Frontmatter als Text am Dateianfang, bewusste Nicht-Änderung).
- **Frontmatter-Block-Widget im Live-Modus** (4T-0283): Im Live-Modus ersetzt dieselbe Zeile die YAML-Quelltext-Zeilen, solange der Cursor außerhalb steht — identisches Markup und Verhalten wie im Render-Pane (eine Erzeugungs-Quelle in der Pipeline). Cursor-Eintritt per Pfeiltasten oder Klick in das aufgeklappte YAML wechselt zum editierbaren Quelltext mit der bekannten Zeilen-Hinterlegung, Verlassen klappt wieder zusammen. Der frisch geöffnete Tab zeigt die Zeile auch dann, wenn der Cursor initial am Dokumentanfang steht.
- **Einstellungs-Schalter für die Frontmatter-Anzeige** (4T-0284): Neue Checkbox „Frontmatter im Gerenderten anzeigen" im Bereich Darstellung der Einstellungs-Seite (Default eingeschaltet, auch für Bestands-Nutzer). Folgt der Entwurf-/OK-/Anwenden-Logik, wirkt nach Anwenden sofort in allen Panes, Modi und Fenstern und persistiert über Neustarts.

### Behoben

- **Scroll-Sync-Versatz bei Frontmatter-Dokumenten** (4T-0282): Bei Dokumenten mit Frontmatter zählten die Quell-Zeilen-Anker des Gerenderten ab Body-Anfang statt ab Dokument-Anfang — die Scroll-Synchronisation der geteilten Ansicht und der Checkbox-Toggle aus dem Render-Pane trafen die um die Frontmatter-Länge falsche Editor-Zeile. Die Zeilen-Zuordnung rechnet den Frontmatter-Versatz jetzt ein; mit Regressionstest.

### Intern

- **Schalter-Infrastruktur** (4T-0283/4T-0284): neues Renderer-Modul `frontmatter-display.js` (Zustand, Store-Init, Anwenden mit Cache-Invalidierung und Live-Rebuild); Pipeline-Konfiguration nach dem Muster der Task-Status (`configureFrontmatterDisplay` in beiden Instanzen, Multi-Window-Broadcast über den `settings:set`-Kanal).
- **Test-Ausbau**: neue E2E-Spec `frontmatter-anzeige.spec.js` (FM-01/FM-02: Zeile, Pin, Zeilen-Anker, Live-Maskierung und Demaskierung, Paritäts-Markup), `einstellungen-seite.spec.js` um ES-09 (Schalter-Roundtrip, Neustart-Persistenz) erweitert; neue Unit-Tests `frontmatter-anzeige.test.js` (Markup, Escaping, Zeilen-Offset-Regression) und `frontmatter-display.test.js` (Default-Logik); Snapshot-Fixture `frontmatter-anzeige.md` (erweitert aus `frontmatter-ausschluss.md`); Abdeckungs-Matrix-Eintrag F-069.
- **Versions-Bump** 0.32.0 → 0.33.0 ([package.json](package.json)).

### i18n

- Sieben neue Keys in allen fünf Sprachen: Frontmatter-Zeile (`frontmatter.line.label`, `frontmatter.line.fieldCount`, `frontmatter.line.fieldCountOne`), Einstellungs-Schalter (`settings.showFrontmatter`) und Funktions-Katalog (`help.feature.frontmatterDisplay`, `help.featureName.frontmatterDisplay`, `help.featureAccess.frontmatterDisplay`); `help.feature.frontmatter` vom Render-Ausschluss auf den neuen Ist-Stand umformuliert (4T-0285).
- Handbuch-Seite „Frontmatter und Properties" um die Sektion „Anzeige im Gerenderten" erweitert, in allen fünf Sprachfassungen (4T-0285).

## [0.32.0] - 2026-07-02 — Einstellungen als Seite

Epic 3E-0049 (Einstellungen als Seite): Der modale Einstellungs-Dialog ist durch eine vollwertige Einstellungs-Seite im Tab-System ersetzt — links eine Bereichsnavigation, rechts der gewählte Bereich, mit der bewährten Entwurf-/OK-/Anwenden-Logik. Die Seite ist zugleich Infrastruktur für kommende Einstellungs-Bereiche (YAML-Anzeige, Erweiterungen, Export). Umgesetzt in drei Umsetzungs-Tasks plus Hilfe- und Sammeltask: 4T-0277 (Tab-Infrastruktur), 4T-0278 (Registry und Layout), 4T-0279 (Migration und Ablösung), 4T-0280 (Hilfe/Handbuch), 4T-0281 (Release).

### Neu

- **Einstellungs-Seite im Tab-System** (4T-0277, 4T-0278): Datei → Einstellungen… bzw. `Strg+,` öffnet die Einstellungen als eigenen Tab in voller Programmgröße — mit Bereichsnavigation links (Darstellung, Verhalten, Task-Status, Tastenkürzel) und dem gewählten Bereich rechts; die Tastenkürzel-Tabelle hat damit erstmals ausreichend Platz. Maximal eine Seite pro Fenster (erneutes Öffnen aktiviert den bestehenden Tab), verschiebbar in die zweite Spalte und in andere Fenster, ohne Sitzungs-Persistenz. Bereichswechsel erhält den Entwurf; Validierungsfehler markieren den Bereich in der Navigation und blockieren Anwenden/OK seitenweit.
- **Entwurfs-Semantik wie im bisherigen Dialog** (4T-0279): Snapshot beim Öffnen, Live-Vorschau der Darstellungs-Werte, Persistierung erst bei Anwenden/OK — neu gilt zusätzlich: Schließen des Tabs ohne Anwenden (Tab-X, `Strg+W`) wirkt als Abbrechen und verwirft die Vorschau. Alle vier Bereiche verhalten sich funktional identisch zu den früheren Dialog-Sektionen (Live-Vorschau, Task-Status-Validierung, Tastenkürzel-Capture mit Konflikt-Erkennung und Gesamt-Reset, Mehrfenster-Broadcast).

### Geändert

- **Zugänge zeigen auf die Seite** (4T-0277): Kommando `Strg+,` (umbelegbar) und der Menü-Eintrag Datei → Einstellungen… öffnen die Seite statt des Modals. Für den Einstellungs-Tab sind Bearbeiten, Speichern, Export und die Ansichts-Modi deaktiviert (Statusbar, Menü und Tastatur konsistent); Esc schließt den Tab bewusst nicht mehr (kein Modal).

### Entfernt

- **Modaler Einstellungs-Dialog** (4T-0279): Dialog-Markup, Styles, Bindings und der Esc-Kaskaden-Eintrag sind restlos zurückgebaut; es gibt keine Übergangs-Koexistenz.

### Behoben

- **Menü ignorierte Read-only-Tabs** (4T-0277): Der Renderer meldete seit 0.29.0 für Handbuch-Tabs den Read-only-Stand an den Hauptprozess, der Menü-Aufbau reichte das Feld aber nicht durch — die Menü-Einträge Speichern, Speichern unter und Bearbeiten blieben bei aktivem Handbuch-Tab fälschlich anklickbar (der Klick war wirkungslos). Jetzt durchgereicht und deaktiviert; mit Regressionstest.

### Intern

- **System-Seiten-Infrastruktur** (4T-0277, 4T-0278): generischer Tab-Typ für interaktive Seiten mit eigenem DOM (`system-pages.js`: Registry, Einfach-Instanz, Mount-Tracking, onOpen/onClose-Lebenszyklus), verallgemeinert aus dem Handbuch-Muster. Die Bereichs-Registry der Einstellungs-Seite nimmt dynamische Bereiche auf — der Andockpunkt für die kommenden Epics (YAML-Anzeige, Erweiterungen, Export-Einstellungen).
- **Modul-Schnitt bereinigt** (4T-0279): der Doppel-Zweck von `settings-search.js` ist aufgelöst — die Einstellungs-Logik lebt in `settings-page.js`, die Such-/Ersetzen-Implementierung im umbenannten Modul `search.js`; Menü-State-Normalisierung electron-frei in `menu-state.js` (unit-testbar).
- **Versions-Bump** 0.31.0 → 0.32.0 ([package.json](package.json)).

### i18n

- Zwei Katalog-Texte auf die Seite umgestellt (`help.feature.settings` beschreibt Bereichsnavigation und Entwurfs-Semantik, `help.feature.viewModes` verweist auf den Bereich „Verhalten") und die Handbuch-Seite „Aufgaben-Listen" angepasst (Bereich statt Sektion), jeweils in allen fünf Sprachen (4T-0280); keine neuen Keys nötig.

## [0.31.0] - 2026-07-02 — Entwicklungsrichtlinien und Code-Audit

Reines Qualitäts-Release ohne sichtbare Funktionsänderung. Epic 3E-0048 (Entwicklungsrichtlinien und Code-Audit): verbindliche Entwicklungsrichtlinien geschaffen und maschinell durchgesetzt (ESLint, Prettier, erweiterte pre-commit-Gates), die Architektur-Doku auf den Ist-Stand gebracht und den gesamten Bestandscode dagegen auditiert. Der Audit fand drei Sicherheits-/Datenverlust-Blocker und rund zwanzig weitere Befunde, die über vier thematisch gebündelte Korrektur-Tasks behoben wurden. Umgesetzt in fünf Umsetzungs-Tasks plus vier Korrektur-Tasks und Sammeltask: 4T-0272 (Architektur-Doku), 4T-0273 (Richtlinien), 4T-0274 (ESLint/Prettier), 4T-0275 (Audit), 4T-0307 bis 4T-0310 (Korrekturen), 4T-0276 (Release).

### Behoben

- **Attribut-Injection im Portable-Export** (4T-0307): Ein einfach-gequoteter HTML-Attributwert mit eingebettetem `"` konnte im Portable-Export aus seinem Attribut ausbrechen und einen Event-Handler einschleusen (`<a title='x" onmouseover="…'>`). Der Inline-Sanitizer escapt den Wert jetzt beim Wiedereinbau.
- **Datei-Einbettung ohne Grenzen** (4T-0307): Der Handler für Markdown-Embeds (`![[Datei]]`) löste Pfade ohne Containment auf und konnte per `../`-Kette beliebige lokale Dateien lesen. Jetzt mit Beschränkung auf den Dokument-Ordner-Teilbaum, Markdown-Endungs-Whitelist und Größen-Limit.
- **Datenverlust beim Tab-Transfer und Session-Restore** (4T-0308): Ein ungespeicherter Tab, der bei nicht lesbarer Zieldatei in ein anderes Fenster verschoben wurde, verlor seinen Inhalt in beiden Fenstern; er bleibt jetzt als „fehlend"-markierter Tab erhalten. Der Transfer auf einen bereits ungespeicherten Ziel-Tab fragt per Konflikt-Dialog statt still zu überschreiben. Nicht lesbare Dateien bei der Sitzungswiederherstellung werden nicht mehr still verworfen (bleiben als fehlend-Tab, Statusbar-Hinweis), und eine Sidebar-Eingabe geht beim schnellen Tab-Schließen nicht mehr verloren.
- **Fehlerbehandlung und Nutzer-Feedback** (4T-0309): Datei-Lese-/Schreib-Fehler laufen über ein einheitliches Ergebnis-Objekt statt als Exception über die IPC-Grenze; ein Datei-Watcher-Fehler kann den Hauptprozess nicht mehr abbrechen; ein fehlerhafter Backlinks-Index wird nicht mehr als gültig behandelt (verhinderte falsche „defekter Wiki-Link"-Markierungen); Outgoing-Link-Klicks auf fehlende Ziele, fehlgeschlagene Bookmark-Persistenz und Diagramm-Fehler beim Theme-Wechsel geben jetzt sichtbares Feedback bzw. werden protokolliert.

### Intern

- **Entwicklungsrichtlinien** (4T-0273): neues Konzept-Dokument `Projektmanagement/Dokumentation/Konzepte/Entwicklungsrichtlinien.md` (Prozess- und Modul-Schnitt, Code-Style, Fehlerbehandlung, Logging, Performance, Sicherheit, Dependency-Politik) mit verbindlicher Verankerung in der CLAUDE.md; maschinell prüfbare Regeln gekennzeichnet.
- **ESLint und Prettier** (4T-0274): flat-config-ESLint (umgebungsgetrennt für Main/Preload/Renderer/Skripte/Tests) und Prettier neu eingeführt, npm-Skripte `lint`/`format`/`format:check`, der pre-commit-Hook führt jetzt Format-Check und Lint vor `npm test` aus. Der gesamte Bestand ist einmalig durchformatiert; der Lint-Stand ist grün ohne dauerhafte Baseline.
- **Architektur-Doku aktualisiert** (4T-0272): `Architektur.md` vom Stand v0.20.0 auf den Ist-Stand fortgeschrieben (Renderer-Modul-Schnitt, Markdown-Pipeline, Registries, Sicherheits- und Qualitäts-Kapitel).
- **Voll-Audit des Bestandscodes** (4T-0275): alle Module unter `src/` und `scripts/` gegen die Richtlinien geprüft, Befund-Katalog mit Schwereklassen, vier gebündelte Korrektur-Tasks abgeleitet. Größere Modul-Zerlegungen bewusst zurückgestellt (dem Product Owner als eigenes Vorhaben vorgelegt).
- **Code-Bereinigung** (4T-0310): rund 270 ungenutzte Import-/Deklarations-Reste des mechanischen Renderer-Modul-Schnitts entfernt, zwei tote Exporte beseitigt, Registry-Kopien (Heading-Slug, Callout-Typen) auf die gemeinsame Quelle umgestellt, kleinere Performance-Redundanzen (Voll-Text-Cache in der Suche, Regex-Kompilierung, doppelter Tabbar-Render) behoben, veraltete Kommentare und tote Fallback-Literale bereinigt. `no-unused-vars`, `no-useless-escape` und `no-useless-assignment` stehen jetzt als Fehler.
- **Versions-Bump** 0.30.0 → 0.31.0 ([package.json](package.json)).

## [0.30.0] - 2026-06-15 — Rebranding auf Perspective Markdown++

Epic 3E-0047 (Rebranding auf Perspective Markdown++): Produktname und die proprietäre Tabellen-Funktion werden durchgängig vom Firmenkürzel „SCG" auf die eigenständige Marke umgestellt. Umsetzung in 4T-0247, Release in 4T-0248.

### Geändert

- **Produktname „SCG Markdown" → „Perspective Markdown++"** (4T-0247): Fenstertitel, Über-Dialog, Empty-State, Installer (Startmenü- und Desktop-Verknüpfung, Datei-Assoziations-Dialog) und Handbuch-Einstieg tragen den neuen Namen. In der Build-Konfiguration: `package.json` `name` → `perspective-markdown`, `productName` → `Perspective Markdown++`, `appId` → `net.stumm.perspective-markdown`; die EXE-Dateinamen lauten `Perspective Markdown++-<version>-Setup.exe` und `-Portable.exe`. Bestehende Einstellungen übernimmt der erste Start aus dem alten Profilpfad (Migrationskette `Markdown Viewer` → `SCG Markdown` → `Perspective Markdown++`); die alten Profilverzeichnisse bleiben defensiv erhalten.
- **Tabellen-Funktion „SCG-Table" → „Perspective Table"** (4T-0247): durchgängig umbenannt, einschließlich Fence-Sprach-Tag (` ```perspective-table `), CSS-Klassen, interner Code-Bezeichner, i18n-Schlüssel und der fünfsprachigen Handbuch-Seite „Perspective Table". Der interne `scg`-Namespace ohne Bezug zur Tabelle (Folding-Gutter, DOM-Events) bleibt unverändert.

### Entfernt

- **Alte SCG-Syntaxmarken ohne Abwärtskompatibilität** (4T-0247): Das alte Fence-Tag ` ```scg-table ` und der alte Portable-Marker `<!-- scg-portable -->` werden nicht mehr erkannt. Bestehende Dokumente mit alter Tabellen-Syntax und ältere Portable-Exporte rendern nicht mehr als Tabelle und sind neu zu erzeugen (bewusster harter Schnitt).

### i18n

- Tabellen-Schlüssel umbenannt (`help.feature.scgTable`/`…Extended` → `help.feature.perspectiveTable`/`…Extended`, `help.featureName.scgTable*`, `help.featureAccess.scgTable*`, `manual.page.scgTable.title` → `…perspectiveTable…`) samt Werten in allen fünf Sprachen; `empty.title` auf „Perspective Markdown++".

## [0.29.2] - 2026-06-12 — Hotfix Versions-Historie in Hilfetexten

Hotfix zum Epic 3E-0042 (Hilfe-Ausbau: Funktions-Tabelle und Handbuch), zweiter Befund aus der Gesamtabnahme; Task 4T-0220.

### Geändert

- **Versions-Historie aus den Hilfetexten entfernt** (4T-0220): Angaben der Form „Ab Version 0.13.0 lassen sich …" und „Erweiterungen, die in Version 0.14.0 dazugekommen sind" (Handbuch-Seite SCG Table, vier Stellen in je fünf Sprachen, inklusive Rückbezug „wie bisher") sind gestrichen; die Kapitel beschreiben die Funktion direkt. Im README sind die „seit 0.x"-Annotationen aus den Funktionsbeschreibungen entfernt (elf Stellen); die Versions-Chronik im Status-Kapitel bleibt als bewusste Release-Geschichte erhalten, ebenso CHANGELOG und Release-Notes als genuin versionsbezogene Dokumente.

## [0.29.1] - 2026-06-12 — Hotfix Fremdprodukt-Verweise

Hotfix zum Epic 3E-0042 (Hilfe-Ausbau: Funktions-Tabelle und Handbuch), Befund aus der Gesamtabnahme 0.29.0; Task 4T-0219.

### Geändert

- **Fremdprodukt-Verweise aus den nutzer-sichtbaren Texten entfernt** (4T-0219): Handbuch-Seiten, Funktions-Katalog und README beschreiben alle Konstrukte jetzt aus sich heraus, ohne Herkunfts- und Stil-Attributionen (zuvor z.B. „Pandoc-Single-Caret", „Obsidian-Muster", „MediaWiki-nah", „GFM-Kern") und ohne Fremdprodukt-Beispiellisten in Interop-Aussagen (jetzt neutral „andere Markdown-Programme"); Demo-Links in Beispielen zeigen auf example.org, die Abkürzungs-Demo nutzt `HTML` statt `GFM`. Betroffen: acht Handbuch-Seiten und vier Katalog-Keys in je fünf Sprachen sowie das README. Bewusst unverändert: CommonMark als Spezifikations-Name, die eingesetzten Engines (KaTeX, Mermaid, highlight.js, markdown-it), Syntax-Eigennamen (Critic Markup, Setext, YAML), die Emoji-Referenz (GitHub-Emoji-Set als Datenbasis samt Link auf die Shortcode-Liste, Festlegung aus dem Epic-Auftrag) und die Lizenz-Credits.

## [0.29.0] - 2026-06-12 — Handbuch im Tab-System

Epic 3E-0042 (Hilfe-Ausbau: Funktions-Tabelle und Handbuch): Das Hilfe-Popup ist vollständig durch ein Handbuch im Tab-System ersetzt. `F1` bzw. Hilfe → Hilfe öffnet eine Überblicksseite als read-only Tab; von dort führen Links auf generierte Seiten (Funktions-Tabelle, Tastenkürzel) und Themen-Seiten mit Syntax-Beispielen in fünf Sprachen, die SCG-Table-Doku ist als Handbuch-Seite integriert. Umgesetzt in fünf Umsetzungs-Tasks plus Konventions- und Sammeltask: 4T-0213 (Infrastruktur), 4T-0212 (generierte Seiten), 4T-0214/4T-0215 (Inhalte und Übersetzungen), 4T-0216 (Umschaltung und Rückbau), 4T-0218 (Pflege-Konvention), 4T-0217 (Release).

### Neu

- **Handbuch im Tab-System** (4T-0213, 4T-0214, 4T-0215): Hilfe-Seiten öffnen als eigene schreibgeschützte Tabs in voller Programmgröße — mit allen vier Ansichten (Gerendert, Geteilt, Quellcode, Live), Outline-Sidebar als Kapitel-Navigation, Volltextsuche, Zoom und Theme; verschiebbar in die zweite Spalte und damit neben der eigenen Arbeit nutzbar. Zwölf gebündelte Seiten in fünf Sprachen: Überblick (Wegweiser), Markdown-Basis, Block- und Inline-Konstrukte, Aufgaben-Listen, Bilder, Mathematik und Diagramme, Vernetzung, Frontmatter und Properties, Werkzeuge, SCG Table sowie eine kuratierte Emoji-Referenz (74 Codes in sechs Kategorien plus Link auf das vollständige GitHub-Set). Syntax-Kapitel sind selbst-demonstrierend (Code-Block plus gerendertes Konstrukt direkt darunter, in der geteilten Ansicht nebeneinander); interne Links öffnen die Ziel-Seite als Tab bzw. aktivieren sie (keine Duplikate), Sprachwechsel wechselt offene Seiten samt Tab-Titel sofort mit. Handbuch-Tabs sind strikt read-only (Stift deaktiviert, Speichern wirkungslos, Task-Klicks inert), tauchen nicht in Sitzung, Auto-Save oder „Zuletzt geöffnet" auf und lassen sich in andere Fenster verschieben oder kopieren.
- **Generierte Funktions-Tabelle** (4T-0212): die Handbuch-Seite „Funktionen" entsteht zur Laufzeit aus dem Funktions-Katalog als dreispaltige Tabelle (Funktion, Beschreibung, Zugang) in den fünf bekannten Gruppen — statt der bisherigen Bullet-Listen bei 68 Einträgen deutlich besser scanbar. Die Zugang-Spalte nennt Menüpfade, Statusbar-Elemente oder Syntax; umbelegbare Kürzel sind als Standard-Belegung gekennzeichnet („Standard …"), die aktuell wirksamen Kürzel zeigt die Tastenkürzel-Seite.
- **Generierte Tastenkürzel-Seite** (4T-0212): entsteht wie der bisherige Reiter aus der Kommando-Registry, zeigt also automatisch die aktuell konfigurierten Bindings inklusive eigener Umbelegungen — und generiert sich bei Binding-Änderungen über die Einstellungen sofort neu.

### Geändert

- **`F1` und Hilfe → Hilfe öffnen die Handbuch-Überblicksseite** (4T-0216): das Kommando `help.open` behält Binding und Menüplatz, wechselt nur sein Ziel; im leeren App-Zustand verlässt die Hilfe damit den Leer-Zustand (öffnet einen Tab). Die Shortcut-Beschreibung heißt jetzt „Handbuch öffnen".
- **SCG-Table-Doku als Handbuch-Seite** (4T-0216): der bisherige Modal-Reiter und sein Lade-Sonderweg (`help:getScgTableContent`) entfallen; die fünfsprachige Doku lebt unverändert als Seite im Handbuch, geladen über den generischen Seiten-Loader. Drei Katalog-Texte verweisen statt auf den „Hilfe-Tab" auf die Handbuch-Seite.
- **Funktions-Beschreibungen gestrafft** (4T-0212): Kürzel- und Menüpfad-Nennungen sind aus 25 Katalog-Beschreibungen in die Zugang-Spalte gewandert (keine Redundanz); die KaTeX-Beschreibung trägt ihre `$…$`-Syntax jetzt in Code-Spans.

### Entfernt

- **Hilfe-Modal** (4T-0216): Dialog-DOM, Styles, Renderer-Logik (Modal-Öffnen/Schließen, Tab-Wechsel, Listen-Render), Esc-Kaskaden-Eintrag und der SCG-Lade-IPC sind restlos zurückgebaut (netto −282 Zeilen); die Katalog-Quellen (`HELP_FEATURE_GROUPS`, Registry-Shortcut-Zeilen, Tasten-Lokalisierung) leben als Generator-Quellen weiter.

### Hilfe und Handbuch

- Neuer Katalog-Eintrag „Handbuch" (Gruppe Allgemein) mit Matrix-Eintrag F-068; die Pflege-Konvention in der CLAUDE.md ist auf die neue Architektur umgeschrieben und um den verbindlichen Handbuch-Prüfschritt erweitert: jedes Epic mit nutzersichtbaren Funktionen pflegt die Themen-Seiten in allen fünf Sprachen im selben Epic (4T-0218).

### i18n

- 159 neue Keys je Sprache (DE/EN/FR/ES/IT): 67 Kurznamen (`help.featureName.*`) und 67 Zugänge (`help.featureAccess.*`) für die Funktions-Tabelle, 14 Seiten-Titel (`manual.page.*`), Funktions-Seiten-Intro und Spaltenköpfe, Read-only-Tooltip und Lade-Fehlertext sowie der Katalog-Eintrag „Handbuch"; 7 ausschließlich Modal-gebundene Keys entfernt. Alle fünf Dateien schlüsselgleich (607 Keys, Wächter grün). Dazu 55 gebündelte Handbuch-Seiten-Dateien (11 Seiten × 5 Sprachen) unter `src/i18n/help/`.

### Intern

- Neue gemeinsame Seiten-Registry [src/shared/manual-pages.js](src/shared/manual-pages.js) (Main-Loader-Whitelist und Renderer aus einer Quelle) mit generischem IPC `help:getManualPage` (Locale-Sanitizing, Fallback Englisch); Handbuch-Logik im neuen Renderer-Modul [src/renderer/modules/manual.js](src/renderer/modules/manual.js) (Öffnen mit Einfach-Instanz, Generatoren, Link-Resolver im gemeinsamen `activateLink`-Pfad für Render-Pane und Live-Modus, Sprachwechsel-Reload).
- Neuer Vollständigkeits-Wächter [test/unit/manual-pages.test.js](test/unit/manual-pages.test.js) (jede gebündelte Seite in fünf Sprachen, Titel-Keys vorhanden, keine verwaisten Dateien) und neue E2E-Spec [test/e2e/funktionen/handbuch.spec.js](test/e2e/funktionen/handbuch.spec.js) (HB-01 bis HB-10: Öffnen, Einfach-Instanz, Read-only-Verhalten, vier View-Modi, interne Navigation, generierte Seiten inklusive Binding-Spiegelung, alle 60 Seiten-Fassungen linter-sauber, Sprachfassungen); Smoke-Test SM-07 auf den Handbuch-Einstieg umgebaut. Suite jetzt 166 Unit-/Snapshot-Tests und 83 E2E-Tests.
- **Versions-Bump** 0.28.1 → 0.29.0 ([package.json](package.json)).

## [0.28.1] - 2026-06-12 — Hotfix Tastenkürzel-Reset

Hotfix zum Epic 3E-0015 (Konfigurierbare Tastenkürzel), Befund aus der Gesamtabnahme 0.28.0; Task 4T-0211.

### Behoben

- **Einzel-Reset konnte ein doppelt vergebenes Tastenkürzel erzeugen** (4T-0211): Wurde ein Default per „Überschreiben" an ein anderes Kommando vergeben (z.B. „Automatisch speichern" auf `Strg+N`, „Neu" freigeräumt), setzte der ⟲-Reset des freigeräumten Kommandos seinen Default ohne Konfliktprüfung zurück — dieselbe Kombination stand danach an zwei Zeilen. Der Reset läuft jetzt durch dieselbe Konflikt-Logik wie das Capture (Inline-Warnung mit „Überschreiben"/„Abbrechen"); zusätzlich validiert Anwenden/OK den gesamten Entwurf als Sicherheitsnetz und blockiert doppelt vergebene Bindings mit lokalisiertem Hinweis (1 neuer i18n-Key je Sprache, 455 synchron). Regressionstests: Unit-Tests für die Duplikat-Erkennung, E2E-Test HK-06 mit der Original-Klickfolge (Suite jetzt 163 Unit-/Snapshot- und 73 E2E-Tests).

## [0.28.0] - 2026-06-12 — Konfigurierbare Tastenkürzel

Epic 3E-0015 (Konfigurierbare Tastenkürzel): alle Tastenkürzel der App laufen über eine zentrale Kommando-Registry statt hart kodierter Bindings und sind in den Einstellungen frei konfigurierbar, mit Hotkey-Capture, Konflikt-Erkennung und Reset. Dazu kommt das neue Kommando „Timestamp einfügen". Umgesetzt in zwei Umsetzungs-Tasks plus Hilfe-Dialog- und Sammeltask: 4T-0207 (Registry und Migration), 4T-0208 (Settings-UI), 4T-0209 (Hilfe), 4T-0210 (Release).

### Neu

- **Konfigurierbare Tastenkürzel** (4T-0208): neue Settings-Sektion „Tastenkürzel" mit allen Kommandos in den fünf Hilfe-Gruppen. Klick auf „Ändern" erfasst die nächste Tastenkombination (Modifier-Zwischenstand, Esc bricht ab, Tab wird als Taste erfasst); Konflikte mit anderen Kommandos werden erkannt und sind per „Überschreiben" auflösbar (das andere Kommando verliert sein Binding), fest belegte Kombinationen (Tab-Indent, Such-Enter, Esc) sind nur abbrechbar; Kombinationen ohne Strg/Alt sind außer F-Tasten gesperrt (würden das Tippen kapern). Bindings lassen sich entfernen („—"), pro Kommando oder gesamt zurücksetzen; Änderungen greifen erst mit Anwenden/OK, wirken dann sofort in Menü, Tastatur-Dispatcher, Editor-Keymap und allen offenen Fenstern und überleben den Neustart (Store-Key `hotkeys`, nur Abweichungen vom Default; Bestands-Profile bleiben unverändert).
- **Kommando „Timestamp einfügen"** (4T-0207): `Strg+Umschalt+D` (Default, umbelegbar) fügt den aktuellen Lokalzeit-Zeitstempel im Format `jjjj-mm-tt hh:mm` an der Cursor-Position ein; eine aktive Markierung wird ersetzt. Aktiv in den editierbaren Ansichten (Quellcode/Geteilt/Live im Edit-Modus), im Reading-Modus bewusst wirkungslos.

### Geändert

- **Hotkey-Architektur auf zentrale Kommando-Registry** (4T-0207): 44 Kommandos (inkl. sieben binding-loser Menü-Kommandos wie AutoSave oder Scroll-Sync, die damit bindbar werden) liegen als reine Daten in [src/shared/commands.js](src/shared/commands.js); Menü-Accelerators, Renderer-Tastatur-Dispatcher (O(1)-Map-Lookup statt verstreuter Vergleiche), CodeMirror-Fold-Keymap und Hilfe-Tabelle lesen dieselbe Quelle. Der Hilfe-Tab „Tastenkürzel" wird aus der Registry mit den aktuell konfigurierten Bindings generiert (statischer Rest für Esc/Alt/Tab-Indent/Maus/Such-Enter steht jetzt am Tabellen-Ende); der Renderer-Fallback deckt neu auch `Strg+;` (Properties) ab. Drei undokumentierte Nebeneffekte toleranter Tasten-Guards entfallen durch exaktes Modifier-Matching: `Strg+Umschalt+W` schließt nicht mehr den Tab, `Strg+Alt+Tab` wechselt nicht mehr den Tab, `Strg+F3` springt nicht mehr zum Treffer (die dokumentierten Kürzel wirken unverändert; die frei gewordenen Kombinationen sind bindbar).

### Hilfe-Dialog

- Zwei neue Funktions-Einträge — „Zeitstempel einfügen" (Gruppe Bearbeitung) und „Tastenkürzel konfigurierbar" (Gruppe Allgemein) — plus eine Hinweis-Zeile oberhalb der Tastenkürzel-Tabelle, dass sie die aktuell konfigurierten Bindings zeigt; Abdeckungs-Matrix um S-035, F-066 und F-067 ergänzt (4T-0209). Neue Shortcut-Zeile `Strg+Umschalt+D` (Timestamp).

### i18n

- 34 neue Keys je Sprache (DE/EN/FR/ES/IT): 17 Kommando-Labels (`command.*`) und `help.shortcut.insertTimestamp` aus 4T-0207, 13 Settings-Strings (`settings.hotkeys.*`) aus 4T-0208, 3 Hilfe-Keys aus 4T-0209; alle fünf Dateien schlüsselgleich (454 Keys, Wächter grün).

### Intern

- Neuer Store-Key `hotkeys` (ein flaches Objekt `{ kommandoId: accelerator }`; bewusst kein Punkt-Pfad pro Kommando, weil electron-store Punkte verschachtelt) mit Broadcast `hotkeys:changed` an alle Fenster und Menü-Rebuild.
- Neue Unit-Suite [test/unit/commands.test.js](test/unit/commands.test.js) (Registry-Invarianten, Normalisierung, Merge-Logik, Capture-Sperr-Regel, Konflikt-Erkennung, Timestamp-Format) und neue E2E-Spec [test/e2e/funktionen/hotkeys.spec.js](test/e2e/funktionen/hotkeys.spec.js) (HK-01 bis HK-05: Rebinding, Konflikte, Reset, Persistenz über Neustart, Draft-Verwurf) plus Timestamp-Test FB-07; bestehende Suite als Regressionsnetz der Migration unverändert grün. Suite jetzt 160 Unit-/Snapshot-Tests und 72 E2E-Tests.
- **Versions-Bump** 0.27.0 → 0.28.0 ([package.json](package.json)).

## [0.27.0] - 2026-06-12 — Markdown-Erweiterungen

Epic 3E-0017 (Markdown-Erweiterungs-Review): Nach dem Entscheidungs-Workshop vom 2026-06-11 zieht die App 15 im Standard-Ökosystem (Pandoc, Obsidian, GFM, populäre markdown-it-Plugins) etablierte Markdown-Konstrukte plus konfigurierbare Task-Status nach. Jedes Konstrukt wirkt in Render-Pane, Live-Modus und Portable-Export (Paritäts-Checkliste) und ist per Snapshot-Fixture eingefroren. Umgesetzt in acht Umsetzungs-Tasks plus Hilfe-Dialog- und Sammeltask: 4T-0197 bis 4T-0204, 4T-0205 (Hilfe), 4T-0206 (Release).

### Neu

- **Emoji-Shortcodes und Abbreviations** (4T-0197): `:smile:`/`:+1:` rendern als Unicode-Emoji (GitHub-kompatibles full-Set; Emoticon-Kurzformen wie `:)` bleiben bewusst Text); Abkürzungs-Definitionen `*[HTML]: Langtext` erzeugen gepunktet unterstrichene Vorkommen mit Tooltip, im Live-Modus mit Hover-Tooltip.
- **Implicit Figures und Bild-Größen** (4T-0198): Ein allein im Absatz stehendes Bild wird zur `<figure>` mit dem alt-Text als zentrierter Caption (alt-Text bleibt erhalten); `![Alt](bild.png =300x200)` setzt Breite/Höhe als HTML-Attribute (auch `=300x`/`=x200`); Kombination ergibt eine größen-annotierte Figure. Wiki-Embeds behalten ihre eigene Darstellung.
- **Definition Lists und Line Blocks** (4T-0199): Pandoc-Definitionslisten (`Begriff` + `: Definition`, auch `~`-Marker, mehrere Definitionen pro Begriff) rendern als `<dl>`; Line Blocks (`| Zeile`) erhalten Zeilenumbrüche und führende Leerzeichen (Adressen, Gedichte) über ein eigenes Block-Plugin. Beide erscheinen im Live-Modus als gerenderte Block-Widgets.
- **Custom Containers** (4T-0200): `::: typ … :::`-Blöcke (Pandoc/markdown-it-container); die zehn bekannten Callout-Typen rendern in identischer Callout-Optik (gemeinsame Render-Helper, gleiche Icons/Farben/lokalisierte Titel, Override-Titel möglich), unbekannte Namen als neutrale Box mit `container-<slug>`-Klasse; Verschachtelung über längere Marker.
- **Subscript, Superscript und Unterstreichen** (4T-0201): `H~2~O` tiefgestellt, `x^^2^^` hochgestellt (Doppel-Caret als bewusste Abweichung von Pandoc, weil das einzelne `^` durch Fußnoten und Block-Anker belegt ist; eigenes Plugin mit mark-Mechanik), `++Text++` unterstrichen; Fußnoten, Block-Anker und `~~Strikethrough~~` nachweislich unverändert.
- **Bracketed Spans und Heading-Attribute** (4T-0202): `# Titel {#eigene-id}` setzt die explizite DOM-ID (gewinnt gegen den automatischen Anker-Slug; `[[#eigene-id]]`-Sprünge funktionieren), `[Text]{.klasse #id}` erzeugt Spans; aus Sicherheitsgründen sind ausschließlich `id` und `class` erlaubt (`style`/`onclick` u.a. werden verworfen). Outline-Titel erscheinen ohne `{…}`-Rest.
- **Spoiler und Critic Markup** (4T-0203): `||verborgener Text||` rendert verdeckt und deckt per Hover/Tastatur-Fokus auf (CSS-only; in Pipe-Tabellen-Zellen funktioniert der Spoiler mit `\|`-escapten Pipes — unescapte trennt der Tabellen-Parser GFM-konform als Zellen-Grenzen; im Portable-Export hilft Text-Selektion); Critic Markup mit allen fünf Formen `{++neu++}`, `{--alt--}`, `{~~alt~>neu~~}`, `{==markiert==}`, `{>>Kommentar<<}` als eigene Plugins, koexistent mit `==Highlight==` und `~~Strikethrough~~`.
- **Erweiterte Task-Status mit Einstellungs-Verwaltung** (4T-0204): Sechs vorbelegte Status (`[/]` In Arbeit, `[-]` Abgebrochen, `[>]` Delegiert, `[?]` Frage, `[!]` Wichtig, `[*]` Markiert) rendern als farbige Status-Boxen mit dem Marker-Zeichen als Glyph und lokalisiertem Tooltip; neue Settings-Sektion „Task-Status" (aktivieren/deaktivieren, Farben ändern, eigene Status mit Zeichen, Farbe und Bezeichnung anlegen, Validierung gegen ungültige oder doppelte Zeichen); Klick auf eine Status-Box schließt die Aufgabe ab (`[x]`), `[ ]`/`[x]` bleiben unverändert; Änderungen wirken sofort in allen Fenstern (Broadcast) und überleben den Neustart (electron-store).

### Geändert

- **Tag-Erkennung**: `#wort` innerhalb von `{…}`-Attribut-Blöcken ist eine ID-Angabe und kein Tag mehr (konsistent in Render-Pane, Tag-Index und Live-Modus; 4T-0202).
- **Bild-Höhen**: explizite `height`-Attribute (Bild-Größen-Syntax) setzen sich gegen das pauschale `height: auto` der responsiven Bild-Regel durch (4T-0198).

### Hilfe-Dialog

- 13 neue Funktions-Einträge in der Gruppe „Bearbeitung" (ein Eintrag pro Konstrukt-Familie, `help.feature.emoji` bis `help.feature.taskStates`), in allen fünf Sprachen; Abdeckungs-Matrix um F-053 bis F-065 ergänzt (4T-0205). Keine neuen Tastenkürzel.

### i18n

- 27 neue Keys je Sprache (DE/EN/FR/ES/IT): 13 Hilfe-Einträge (`help.feature.*`), 8 Settings-Strings (`settings.taskStates.*`) und 6 Status-Labels (`taskState.*.label`); alle fünf Dateien schlüsselgleich (420 Keys, Wächter grün).

### Intern

- Neue Dependencies: `markdown-it-emoji`, `markdown-it-abbr`, `markdown-it-imsize`, `markdown-it-implicit-figures`, `markdown-it-deflist`, `markdown-it-container`, `markdown-it-sub`, `markdown-it-ins`, `markdown-it-attrs`, `markdown-it-bracketed-spans`. Eigene Plugins für Superscript, Spoiler, Critic Markup, Line Blocks, Custom Containers und Task-Status in [src/shared/markdown/plugins.js](src/shared/markdown/plugins.js); gemeinsamer, kommentierter Erweiterungs-Block in [src/shared/markdown/markdown.js](src/shared/markdown/markdown.js) hält die Plugin-Reihenfolge für Viewer- und Portable-Instanz identisch.
- Plugin-Wahl Bild-Größen: `markdown-it-imsize` statt `@mdit/plugin-img-size` — dessen exports-Map löst unter Electrons Node 20 per `require()` auf den ESM-Build auf (`ERR_REQUIRE_ESM`, Preload-Abbruch); der E2E-Smoke hat den Befund gefangen (4T-0198).
- Neue Snapshot-Fixtures für alle Konstrukt-Familien (emoji, abbreviations, implicit-figures, image-size, definition-lists, line-blocks, custom-containers inkl. Portable-Variante, sub-sup-ins, attributes-spans, spoiler, critic-markup, task-states); neuer E2E-Spec `test/e2e/funktionen/task-states.spec.js` (TS-01 bis TS-04). Suite jetzt 123 Unit-/Snapshot-Tests und 65 E2E-Tests.
- **Versions-Bump** 0.26.0 → 0.27.0 ([package.json](package.json)).

## [0.26.0] - 2026-06-11 — Test-Vollausbau

Fünftes und letztes Epic des Review-Programms: Epic 3E-0041 baut die Test-Abdeckung von der Schutz-Suite (0.22.0) auf den vollen Funktionsumfang aus. Keine Funktionsänderung an der App; jede im Hilfe-Dialog beschriebene Funktion ist jetzt durch automatisierte Tests abgedeckt oder trägt eine begründete manuelle Ausnahme. Umgesetzt in drei Tasks plus Sammeltask: 4T-0193 (Unit Renderer), 4T-0194 (Snapshots), 4T-0195 (E2E-Funktions-Suite und Abdeckungs-Matrix), 4T-0196 (Release).

### Intern

- **Snapshot-Tests der Render-Pipeline** (4T-0194): 14 Konstrukt-Fixtures unter `test/fixtures/render/` frieren das Render-Verhalten aller unterstützten Markdown-Konstrukte als Vitest-Snapshots ein (CommonMark, GFM, Wiki-Links/-Embeds, Tags, Callouts, Highlight, Footnotes, KaTeX, Mermaid-Container, SCG-Tabellen, Frontmatter, Grenz- und Sicherheits-Fälle); dazu Portable-Export-Snapshots, Frontmatter-API-Tests und Sicherheits-Tests des P-02-Sanitizers mit echtem DOMParser (neue devDependency jsdom). Das ist das Regressionsnetz für das Markdown-Erweiterungs-Epic 3E-0017.
- **Unit-Tests der Renderer-Module** (4T-0193): 34 Tests über Tabellen-Zell-Logik, Word-Count-Statistik, Caches, Fold-Struktur, Outgoing-Extraktion, Snippets, Anker-Normalisierung, Zeilen-Mapping, Pane-Snapshot-Logik, Bookmark-Tree-Helfer, Such-Regex und Shortcut-Labels — ohne Änderungen am Produktiv-Code.
- **E2E-Funktions-Suite und Abdeckungs-Matrix** (4T-0195): 22 neue Funktions-Tests unter `test/e2e/funktionen/` (Bearbeitung, Ansicht, Navigation, Datei/Sitzung, Hotkey-Durchläufe). `test/abdeckungs-matrix.json` ordnet allen 86 Hilfe-Dialog-Einträgen (52 Funktionen, 34 Kürzel) Testart und Testdateien zu; ein Vollständigkeits-Meta-Test erzwingt die Pflege in `npm test` — neue Hilfe-Einträge ohne Matrix-Eintrag brechen den Commit. Menü-Accelerator-Kürzel sind über ihre IPC-Pfade getestet und als solche markiert; sieben begründete manuelle Prüfpunkte (OS-Dialoge, native Menüleiste u.a.) sind deklariert statt ausgelassen.
- **Test-Bilanz**: 110 Unit-/Snapshot-Tests (~7 s) und 61 E2E-Tests (~2,6 min), dreifach stabil; die Smoke-Suite bleibt der schnelle Pflicht-Lauf pro Commit.
- **Test-Konventionen verankert**: neuer CLAUDE.md-Abschnitt „Automatisierte Tests" (Pflicht-Gates pro Commit/Task/Release, Regressionstest-Pflicht pro Bugfix, Test-Pflege-Schritt pro Epic, Paritäts-Checkliste für neue Render-Funktionen); `test/README.md` um Snapshot-Politik und Matrix-Pflege erweitert.
- **Versions-Bump** 0.25.0 → 0.26.0 ([package.json](package.json)).

## [0.25.0] - 2026-06-11 — Konsistenz-Lücken geschlossen

Viertes Epic des Review-Programms: Epic 3E-0040 schließt die im Gesamt-Code-Review vom 2026-06-10 belegten Konsistenz-Lücken im bestehenden Funktionsumfang — Features, die an einer Stelle wirkten und an einer vergleichbaren fehlten, hartkodierte UI-Strings, verschluckte Fehlzustände, Export-Brüche und Doku-Abweichungen. Umgesetzt in sieben Tasks plus Sammeltask: 4T-0185 bis 4T-0191, 4T-0192 (Release).

### Geändert

- **Modus-Konsistenz Live/Render/Reading** (4T-0186): Anker- und Zeilen-Sprünge wirken jetzt in jedem Ansichts-Modus — In-Dokument-Anker springen im Live-/Quellcode-Modus zur Heading- bzw. Block-Anker-Zeile im Editor (mit markdown-it-anchor-konformer Slug-Deduplizierung), Backlink-/Bookmark-/Outgoing-Sprünge scrollen im Reading-Modus das Render-Pane zur Zielstelle, Anker-Nachläufe folgen der tatsächlichen Ziel-Spalte, der Outline-Klick trifft bei gleichnamigen Überschriften das richtige Vorkommen, und das Outgoing-Panel übergibt Anker normalisiert. Feature-Parität: Tags sind im Live-Modus klickbar (filtern die Tag-Sidebar; `#…` innerhalb von `[[…]]` zählt dabei wie im Render-Pfad nicht als Tag), Task-Checkboxen sind im Reading-Modus klickbar und toggeln den Quelltext, Live-Block-Widgets erhalten Copy-Buttons, übersetzte Callout-Titel und SCG-Sortierung, einzeiliges `$$x$$` rendert auch im Live-Modus, der Callout-Pre-Pass folgt den markdown-it-Regeln (kein Pflicht-Leerzeichen nach `>`, maximal drei Spaces Einrückung), Theme-Wechsel färbt Live-Mermaid-Widgets sofort um, der aktive Such-Treffer klappt Block-Widgets auf, Frontmatter-Zeilen bleiben in allen Live-Pässen undekoriert, und der Tabellen-Editor-Komfort (Tab/Enter) funktioniert auch in randlosen GFM-Tabellen.
- **Backlinks-/Tag-Index entkoppelt** (4T-0187): Der Index entsteht jetzt bei jedem Bedarf (Tag-Sidebar, Wiki-/Tag-Autocomplete, Linter, Alias-Klick) — vorher ausschließlich über das standardmäßig ausgeblendete Backlinks-Panel, ohne das vier beworbene Features still funktionslos blieben. Die Tag-Sidebar aktualisiert sich bei Index-Updates mit, und nach Index-Fertigstellung läuft der Linter nach.
- **Portabler Export rundlauffähig** (4T-0189): Der `scg-portable`-Marker steht jetzt nach dem YAML-Frontmatter statt davor — Exporte beginnen wieder mit `---` in Zeile 1 (GitHub/Obsidian parsen das YAML, die Properties-Sidebar füllt sich beim Wiederöffnen); Alt-Exporte werden weiterhin erkannt. KaTeX-Formeln in SCG-Zellen bleiben beim Export als Formel-Quelltext erhalten statt als stylesheet-abhängiges HTML.
- **Sprachwechsel wirkt überall** (4T-0185): Ein Sprachwechsel erreicht jetzt alle offenen Fenster sofort (vorher nur das auslösende).

### Behoben

- **Hartkodiert deutsche UI-Stellen** (4T-0185): Open-Dialog-Titel und Datei-Filter, der Entwickler-Tools-Menüpunkt, Mermaid-Lade-/Fehlertexte im Live-Widget und im Render-Pane sowie das Backlinks-Zeilen-Label erscheinen jetzt in der gewählten Sprache; der Lesezeichen-Tooltip nennt seinen Hotkey.
- **Nutzer-Feedback und Sidebar-Lücken** (4T-0187): Fehlgeschlagenes Datei-Öffnen zeigt einen Statusbar-Hinweis; Other-Embeds auf fehlende Dateien nutzen die Broken-Darstellung; ein fehlgeschlagener SCG-Hilfe-Tab zeigt einen Fehlertext statt leer zu bleiben; Watcher-Fehler des Index führen zu einem sichtbaren Status mit Backoff statt einer stillen Scan-Schleife; unlesbare Ordner werden gezählt und im Panel gemeldet; das Bookmark-Kontextmenü bleibt im Fenster; das erste Bookmark erscheint in beiden Spalten; Session-Restore aktiviert nach gelöschten Dateien den richtigen Tab; Inline-Edit fokussiert die auslösende Spalte; Properties-/Tags-Statusbar-Toggles folgen dem Spalten-Wechsel; das Tag-Autocomplete öffnet nicht mehr beim ersten `#` einer Überschrift.
- **Visuelle Konsistenz und Zugänglichkeit** (4T-0188): Dark-Theme-Overrides für Mermaid-Fehler im Render-Pane, Such-Fehlerfarben und Properties-Pillen; Drag-Ziel-Tönungen über die Theme-Variable; Fokus-Indikator für das Multistring-Feld; das Bookmark-Move-Modal setzt initialen Fokus und ist per Tastatur bedienbar; CodeMirror-Tooltips liegen nicht mehr unter der Suchleiste; irreführende `role="tree"`-Zusagen ohne Tastatur-Pattern entfernt.

### Doku

- **README** (4T-0190): Menü-Kapitel vollständig auf den realen Stand (Lesezeichen merken, Exportieren, Einstellungen, Bearbeiten, Fokus-Modus, Typewriter-Scroll, Entwickler-Tools), neuer Abschnitt „Editor-Komfort" (Linter mit sechs Regeln, Fokus-Modus, Typewriter-Scroll, Zoom, Schriftarten, Tabellen-Komfort), Statusbar-Beschreibung ohne fiktive „Mitte" und mit Zoom-Indikator, Tastenkürzel-Tabelle um foldAll/unfoldAll, „Alle ersetzen" und den Tabellen-Zellsprung ergänzt; CLAUDE.md nennt die drei Hilfe-Tabs und die Notes-Ablage in `releases/`.
- **Hilfe-Dialog** (4T-0191): Vier veraltete Funktions-Texte korrigiert (Edit-Modus inkl. Live, View-Modus pro Tab, Linter mit sechs Regeln, Settings-Sektion „Verhalten"), Tag-Klickbarkeit dokumentiert, KaTeX-Export-Hinweis in den fünf SCG-Table-Hilfedateien; F12 bleibt als Debug-Werkzeug bewusst undokumentiert.

### i18n

- 15 neue Keys je Sprache (DE/EN/FR/ES/IT) über die drei Tasks (u.a. `open.dialogTitle`, `dialog.filter*`, `menu.view.devTools`, `mermaid.syntaxError`, `live.mermaid.*`, `backlinks.line`, `backlinks.watchError`, `backlinks.skippedDirs`, `tags.watchError`, `open.failedHint`, `help.scgTable.loadError`, `help.shortcut.foldAll`, `help.shortcut.replaceAll`); 7 geänderte Hilfe-/Tooltip-Keys je Sprache; alle fünf Dateien schlüsselgleich (393 Keys), abgesichert durch den neuen Wächter `scripts/check-i18n.js` als Unit-Test in `npm test`.

### Intern

- **Versions-Bump** 0.24.0 → 0.25.0 ([package.json](package.json)).
- Neue Regressionstests: Sprachwechsel-Broadcast über zwei Fenster, Main-seitige Lokalisierung, Anker-Sprung im Live-Modus, Task-Toggle im Reading-Modus, Tag-Klick im Live-Modus, Tag-Sidebar ohne Backlinks-Panel, Statusbar-Hinweis bei fehlgeschlagenem Öffnen; neue Unit-Tests für den Portable-Export (7) und die i18n-Synchronität. Suite jetzt 42 Unit- und 39 E2E-Tests.

## [0.24.0] - 2026-06-11 — Optimierung und Modularisierung

Drittes Epic des Review-Programms: Epic 3E-0039 setzt die Optimierungs-Befunde des Gesamt-Code-Reviews vom 2026-06-10 um und macht die Code-Struktur für den Test-Vollausbau (0.26.0) testbar: Renderer und Markdown-Pipeline sind modularisiert, die Performance-Hotspots behoben, der Backlinks-Index läuft asynchron, die EXE ist deutlich kleiner und tote Code-Pfade sind bereinigt. Umgesetzt in fünf Tasks plus Sammeltask: 4T-0179 bis 4T-0183, 4T-0184 (Release).

### Geändert

- **Renderer modularisiert** (4T-0179): Die 10.406-Zeilen-Datei `renderer.js` ist in 16 ES-Module unter `src/renderer/modules/` zerlegt (größtes Modul 1.168 Zeilen, Entry 23 Zeilen); die Markdown-Pipeline (markdown-it-Konfiguration, eigene Plugins, Frontmatter, SCG-Tabellen) ist aus `preload.js` in Electron-freie Module unter `src/shared/markdown/` extrahiert und damit ohne Electron unit-testbar, `preload.js` ist auf eine 264-Zeilen-Bridge geschrumpft. Zwei deklarierte Logik-Änderungen: die dreifach divergierte Render-Nachverarbeitung ist zu `applyRenderPipeline` vereinheitlicht (der stellenweise fehlende Such-Refresh ist der gewollte Fix), und `getPaneEls` ist memoisiert (vorher rund 30 DOM-Queries pro Aufruf bei jedem Tastendruck).
- **Renderer-Performance** (4T-0180): Alle 14 Performance-Befunde des Reviews behoben. Kernpunkte: genau eine Voll-Text-Serialisierung pro Dokument-Version statt bis zu sechs pro Tastendruck (geteilter WeakMap-Cache für Marker-Felder, Live-Pässe, Linter und Dirty-Vergleich); ein Render-Skip-Cache entkoppelt die Tab-Wechsel-Kaskade (eine statt zwei bis drei vollständige markdown-it-Durchläufe, die jeweils andere Spalte wird gar nicht mehr neu gerendert, Mermaid-Flackern entfällt; Tab-Wechsel auf einer 5.200-Zeilen-Fixture von 815/688 ms auf 536/455 ms, rund −34 %); Fold-Struktur in O(n) statt O(n²); Word-Count-, Linter-, Persistenz-, Scroll-Sync-, Tag- und Bookmark-Pfade mit Caches bzw. Debounces entlastet. Spürbare Nebeneffekte: die Split-Vorschau rendert bei großen Dokumenten seltener (adaptiver Debounce), eingebettete PDFs laden beim Tippen nicht mehr neu.
- **Backlinks-Index asynchron** (4T-0181): Der Index-Aufbau läuft in Batches mit Yield statt synchron (der Main-Prozess fror bei großen Suchräumen für die gesamte Scan-Dauer ein, B-14); Status `indexing` wird an die Panels gemeldet und beim Fertigwerden per Broadcast aufgelöst. Datenstruktur-Optimierungen: inverse Namens-Map für die Wiki-Link-Auflösung, Tag-Anzeige-Namen und Datei-Größen-Kappung im Index.
- **EXE deutlich kleiner** (4T-0182): Mermaid und die CodeMirror-Pakete sind reine Bundle-Zeit-Abhängigkeiten und wandern nach devDependencies; die asar schrumpft von rund 74 MB auf 17,7 MB (−76 %), die Portable-EXE von 95,7 MB auf 81,7 MB. Das Renderer-Bundle wird minifiziert ausgeliefert.

### Behoben

- **Build-Schutz vor EXE-Überschreiben** (4T-0182): `npm run build` bricht ab, wenn der Release-Tag der Zielversion bereits existiert. Das verhindert die wiederholt aufgetretene Falle, dass ein Build mit vergessenem Versions-Bump die offiziellen EXEs der Vorgängerversion in `releases/` überschreibt. Außerdem kopiert der Build die Release-Notes der Version mit nach `releases/`, und `archive-build.js` ist testbar geschnitten (eigene Unit-Tests).
- **Uninstaller-Registry** (4T-0182): Der Uninstaller entfernt nur noch den eigenen Registry-Value statt eines ganzen Keys (X-04); fremde Werte unter demselben Key bleiben unangetastet.
- **Sichtbarkeit kleiner UI-Reaktionen** (4T-0183): Sortierbare SCG-Tabellen-Header zeigen beim Überfahren jetzt sichtbares Hover-Feedback (vorher wirkungslos, weil dieselbe Farbe wie der Grundzustand gesetzt wurde); Outgoing-Links-Snippets zentrieren das Textfenster um den Link (vorher zeigten lange Zeilen den Link nicht); Klicks auf Embed-Links laufen nicht mehr doppelt durch die Link-Verarbeitung.

### Intern

- **Tote Code-Pfade und Duplikate bereinigt** (4T-0183): Alle zwölf Bereinigungs-Befunde des Reviews umgesetzt (ungenutzte Exporte in Main und Backlinks, redundante Verzweigung der Anker-Bildung, irreführende Kommentare, tote CSS-Selektoren, doppelte CSS-Definition, toter Such-Zweig, Fence-Erkennung der Outgoing-Extraktion mit Marker-Merken). Zusätzlich ist [Knip](https://knip.dev/) als manueller Qualitäts-Check eingerichtet (`npm run knip`, Konfiguration versioniert); der Einrichtungs-Lauf fand vier weitere tote Exporte (entfernt), eine ungenutzte devDependency (`@codemirror/search`, entfernt) und zwei nicht deklarierte Direkt-Importe (`@lezer/highlight`, `@lezer/markdown`, nachdeklariert); der Abschluss-Lauf ist ohne Befund.
- **Performance-Mess-Suite**: vier neue E2E-Tests (P-01 bis P-04) mit einer 5.200-Zeilen-Fixture messen Tab-Wechsel-Dauer und Live-Tippen, beweisen den Render-Skip über Knoten-Identität und prüfen den Fold-Gutter auf der großen Datei. Die Suite umfasst jetzt 33 Unit- und 33 E2E-Tests.
- **Versions-Bump** 0.23.0 → 0.24.0 ([package.json](package.json)).

## [0.23.0] - 2026-06-11 — Fehlerbehebung aus dem Code-Review

Reines Bugfix-Release. Zweites Epic des Review-Programms: Epic 3E-0038 behebt alle Fehler-Befunde des Gesamt-Code-Reviews vom 2026-06-10, darunter sieben verifizierte Datenverlust- bzw. Crash-Bugs. Alle Befunde wurden vor dem Fix am aktuellen Code re-verifiziert und bestätigt; pro bestätigtem Fix gibt es, wo automatisierbar, einen Regressionstest (15 neue E2E-Tests, 9 neue Unit-Tests). Umgesetzt in acht Fix-Tasks plus Sammeltask: 4T-0170 bis 4T-0177, 4T-0178 (Release).

### Behoben

- **Tab- und Fenster-Management** (4T-0170): Der Tab-Transfer aus einem anderen Fenster überschrieb still den Inhalt des gerade aktiven Tabs, wenn die Zieldatei als Hintergrund-Tab offen war (R4-01). Ein Unbenannt-Tab verschwand samt Inhalt beim Verschieben in eine Pane mit einem weiteren Unbenannt-Tab (R4-02). „In neues Fenster verschieben" verlor ungespeicherte Inhalte und Unbenannt-Tabs komplett; der Transfer läuft jetzt über den Buffer-tragenden Payload-Mechanismus, und transferierte Unbenannt-Inhalte behalten ihren Dirty-Schutz (R4-03). Tab-Drags tragen eine Fenster-Kennung, Drops aus fremden Fenstern werden verworfen (R4-04). „Speichern unter" entwatcht den alten Pfad nur noch, wenn ihn kein anderer Tab mehr nutzt (M-14), und schließt Duplikat-Tabs desselben Zielpfads (R4-11). Auto-Reload überschreibt keine Eingaben mehr, die während des Datei-Lesens getippt wurden (Konflikt-Dialog statt stiller Ersetzung, R4-08).
- **Suchen und Ersetzen** (4T-0171): Ersetzen nach zwischenzeitlichem Tippen nutzte veraltete Treffer-Offsets und korrumpierte Text an falschen Positionen; Doc-Änderungen invalidieren jetzt die Treffer, und jeder Replace verifiziert den Treffer-Text vor dem Eingriff (R5-01). Der Such-Debounce überlebte das Schließen der Leiste (nachlaufende Highlights, R5-04). Die Reading-Suche zählte unsichtbare KaTeX-MathML-Treffer doppelt (R5-05) und ließ Mermaid-Beschriftungen durch `<mark>`-Einfügung in SVG verschwinden (R5-06). Die Ersetzen-Bedienelemente sind außerhalb von Quellcode-Ansicht + Bearbeiten-Modus jetzt sichtbar deaktiviert statt still funktionslos (R5-09).
- **Properties-Editor und Frontmatter** (4T-0172): Bei defektem YAML ersetzte „Feld hinzufügen" das gesamte Frontmatter; der Add-Button ist bei Parse-Fehler deaktiviert und kein Save-Pfad schreibt mehr über defektes YAML (R5-02). Eine Eingabe ging verloren, wenn innerhalb des Speicher-Debounce der Tab gewechselt wurde; pending Saves werden jetzt vor dem Felder-Austausch geflusht und schreiben den richtigen Tab (R5-03). Doppelte Eigenschafts-Namen werden markiert und nicht mehr still zusammengelegt (R5-10).
- **Main-Prozess** (4T-0173): Nach einem abgebrochenen Beenden fiel die Sitzungs-Persistenz dauerhaft aus (M-01). Dateien aus einer zweiten Instanz gingen während der Startphase verloren (M-02) und relative Pfade wurden gegen das falsche Arbeitsverzeichnis aufgelöst (M-03). UTF-8-BOM-Dateien brachen Heading und Frontmatter in Zeile 1 (M-04, auch im Backlinks-Index). `file:resolveLink` warf bei `%` im Link und pfadlosem Tab (M-05). Schließen mit minimiertem Fenster überschrieb die gespeicherte Fenster-Größe (M-07). `&` in Dateinamen wurde im Recent-Menü als Mnemonic verschluckt (M-12). Nach einem Renderer-Reload (F12/Strg+R) blieb das Fenster dauerhaft leer (M-13). Der Auto-Save-Schutz unterdrückt externe Änderungen nur noch, wenn der Datei-Stand dem eigenen Schreiben entspricht (Inhalts-Hash statt 1,5-s-Blindfenster, M-15). Tab-/Pane-Änderungen erreichen den Sitzungs-Store jetzt debounced auch ohne Fenster-Bewegung (M-16).
- **Render-Pipeline, Live-Modus und Editor** (4T-0174): Ein mehrzeiliges Markdown-Bild machte den Live-Modus durch eine Exception-Dauerschleife unbenutzbar (R1-01). Block-Widgets fehlten nach dem asynchronen Parser-Nachlauf in großen Dateien (R1-02). Alle Mermaid-Renderläufe sind jetzt über eine gemeinsame Queue serialisiert (R1-03, R2-04), und ein fehlgeschlagener Mermaid-Import blockiert nicht mehr die ganze Sitzung (R1-04). Ein literales `%` in einem Embed-Bildnamen brach den kompletten Voll-Render ab (P-01). Die Split-Vorschau hat jetzt einen Debounce pro Pane (R2-01). Links in Markdown-Embeds lösen gegen die Embed-Datei auf statt gegen den Pane-Tab (R2-02). Der Dialog-Schutz für Auto-Save ist reentrant (R2-03). `file:///`-URLs für PDF-/Datei-Embeds sind gegen `#`, `?`, `%` und Leerzeichen im Namen gefestigt (R2-07). Der Markdown-Linter prüft gegen den vollständig geparsten Syntax-Baum und verwirft veraltete Läufe über Doc-Identität (R2-08, R2-09). Der Tabellen-Ausstieg per Enter erzeugt mitten im Dokument eine echte leere Absatzzeile (R2-06). Das Outline-Aktiv-Highlight verrutscht nicht mehr bei Embeds mit Überschriften (R3-04). Ein Fehler in der Renderer-Initialisierung lässt das Fenster nicht mehr stumm hängen (R3-07).
- **Backlinks-/Tag-Index** (4T-0175): Das Referenz-Zählen war asymmetrisch und das Index-Teardown lief nie (Owner-Modell pro Fenster + Pane, B-01); Fenster-Schließen gibt seine Indexe jetzt frei (B-02). Initial-Scan und Watcher nutzen dieselben Ignore-Regeln, `node_modules` und Punkt-Ordner bleiben draußen (B-03, B-12). Wiki-Link-Auflösung, Linter und Klick-Pfad entscheiden einheitlich case-insensitiv und Unicode-normalisiert (B-04, B-23). `%20`-kodierte Markdown-Links erzeugen Backlinks (B-05). Block-Anker auf eigener Zeile werden indexiert (B-06). Links in Inline-Code erzeugen keine falschen Backlinks (B-07), `[[#Anker]]` ist kein Tag mehr (B-08), escapte Pipes in Tabellen-Wiki-Links funktionieren (B-09). Der Anker-Index folgt dem Renderer bei Slug-Duplikaten, Setext-Überschriften und Links in Überschriften (B-10). Ein Lesefehler beim Datei-Update löscht keine Index-Daten mehr (B-11). Pfad-Ziele wie `[[sub/Datei]]` werden aufgelöst, und der Klick-Pfad hat einen Suchraum-Fallback über den Index (B-13).
- **Sicherheits-Härtung des Render-Pfads** (4T-0176): Rohes HTML im Portable-Modus läuft durch eine enge Tag-/Attribut-Whitelist (eigene Export-Tabellen rendern, eingeschleustes UI-/Spoofing-HTML nicht, P-02). Der Bild-Resolver bettet nur noch Bilder aus dem Dokument-Ordner ein (Containment, Bild-Extension-Whitelist, 20-MB-Limit, P-03). Wiki-Links mit `javascript:`-/`data:`-Schema werden nicht mehr als Links gerendert (P-07). `will-navigate` ist als Defense-in-Depth-Sperre blockiert (M-17).
- **UI-Details** (4T-0177): Die CSS-Variable `--bg-muted` war an fünf Stellen verwendet, aber nie definiert (S-01); der Tastatur-Fokus im Alias-Dialog war dadurch komplett unsichtbar und hat jetzt eine Akzent-Outline (S-02). Properties-Add-Button und Tags-Filter der zweiten Spalte waren nie verkabelt (R4-05). Strg+Umschalt+F löst nicht mehr zusätzlich die Suche aus (M-06). Schriftart-Änderungen aus einem anderen Fenster überleben jetzt ein „Abbrechen" im offenen Einstellungs-Dialog (R5-08).

### Intern

- **Versions-Bump** 0.22.0 → 0.23.0 ([package.json](package.json)).
- 3 neue i18n-Keys je Sprache (DE/EN/FR/ES/IT): `search.replaceDisabledHint`, `properties.addDisabledParseError`, `properties.duplicateKeys`; alle fünf Dateien schlüsselgleich (378 Keys).
- Test-Helper gehärtet: `launchApp` wartet auf den Modul-Load des Renderers, `closeApp` mit Force-Option für Tests mit absichtlich ungespeicherten Inhalten.

## [0.22.0] - 2026-06-11 — Test-Fundament

Reines Qualitäts-Release ohne sichtbare Funktionsänderungen. Erstes Epic des Review-Programms aus dem Gesamt-Code-Review vom 2026-06-10 (fünf Epics, 0.22.0 bis 0.26.0): Epic 3E-0037 baut die automatisierte Test-Infrastruktur auf, die als Sicherheitsnetz für die Folge-Epics (Fehlerbehebung, Modularisierung, Lückenschließung, Test-Vollausbau) dient. Umgesetzt in drei Tasks plus Sammeltask: 4T-0166 (Infrastruktur), 4T-0167 (E2E-Smoke-Suite), 4T-0168 (Unit-Tests Main-Logik), 4T-0169 (Release).

### Neu

- **Test-Infrastruktur** (4T-0166): Vitest 4 für Unit-/Snapshot-Tests (`npm test`, `npm run test:watch`), Playwright mit Electron-Treiber für End-to-End-Tests gegen die echte App (`npm run test:e2e`, baut vorab das Renderer-Bundle). Neue Ordnerstruktur `test/unit/`, `test/e2e/`, `test/fixtures/` (versioniert, getrennt vom gitignorierten manuellen `Tests/`-Ordner) und `test/README.md` als zentrales Testkonventionen-Dokument. Der Playwright-Electron-Spike lief mit Electron 33 auf Anhieb; der WebdriverIO-Fallback wurde nicht gebraucht.
- **Versionierter pre-commit-Hook** (4T-0166): `.githooks/pre-commit` führt `npm test` aus und verweigert den Commit bei rotem Ergebnis (Aktivierung pro Klon: `git config core.hooksPath .githooks`). `.only`-Schutz auf beiden Ebenen (`allowOnly: false` in Vitest, `forbidOnly: true` in Playwright), damit der Hook nie mit einer fokussierten Teil-Suite grün wird.
- **E2E-Smoke-Suite SM-01 bis SM-09** (4T-0167): neun Szenarien über die Kernabläufe (Start/Fenster, Datei öffnen und rendern, Modi-Wechsel, Editieren und Speichern, Tabs, Suche, Hilfe-Dialog, Theme-Toggle, Session-Restore) mit stabilen Szenario-IDs, zentralen Selektor-Konstanten und gemeinsamen App-Start-Helpers; Laufzeit rund 23 Sekunden, Diagnose-Artefakte (Screenshot, Trace) nur im Fehlerfall.
- **Unit-Tests für Main-Prozess-Logik** (4T-0168): elf Tests für `src/shared/callouts.js` (Typen-Katalog, Icon-Wrapper) und `src/main/backlinks.js` über die öffentliche API mit Temp-Verzeichnis-Fixtures: Wiki-Link-Varianten, Markdown-Links, Embeds, Frontmatter-Aliases und -Tags, Tag-Counts mit Maskierungs-Ausschlüssen, Heading-/Block-Anker, Scan-Tiefe (Wurzel + 2 Ebenen) und Caps-Verhalten (oversized ab 2001 Dateien).

### Intern

- **userData-Test-Hook in `main.js`** (4T-0166): Die Umgebungsvariable `SCG_TEST_USER_DATA` setzt früh `app.setPath('userData', …)`, bewusst vor dem Single-Instance-Lock. E2E-Läufe verwenden damit ein isoliertes Temp-Profil pro Lauf, berühren nie das echte Nutzer-Profil unter `%APPDATA%` und kollidieren nicht mit einer parallel laufenden App-Instanz. Einzige Code-Änderung an der App in diesem Release.
- **.gitignore**: Playwright-Artefakt-Ordner `test-results/` und `playwright-report/` ergänzt.
- **Versions-Bump** 0.21.0 → 0.22.0 ([package.json](package.json)).

## [0.21.0] - 2026-06-08 — Loslösung von GitHub

Erstes Release nach der Ablösung von GitHub als Code-Host. Für die laufende Entwicklung trägt künftig allein das lokale Git die Versionskontrolle. Epic 3E-0031 entfernt die einzige funktionale GitHub-Laufzeitbindung der App (die Auto-Update-Erkennung), macht Build- und Release-Prozess GitHub-frei, bereinigt die GitHub-Bezüge der lebenden Dokumentation und kappt den Git-Remote. Umgesetzt in fünf Tasks: 4T-0143 (Auto-Update-Ausbau), 4T-0144 (Build- und Release-Prozess), 4T-0145 (Doku-Bereinigung), 4T-0142 (Remote-Kappung) und Abschluss-Sammeltask 4T-0146.

### Entfernt

- **Auto-Update-Funktion vollständig** (4T-0143): Der Menüpunkt „Hilfe → Auf Updates prüfen…", der automatische Hintergrund-Check (45 Sekunden nach Start, danach alle 24 Stunden), die drei Update-Dialoge (Update verfügbar, kein Update, Fehler), der Hilfe-Dialog-Funktionseintrag, der IPC-Handler `update:check` und der Datei-Logger wurden entfernt. Die Dependency `electron-updater` ist aus `package.json` raus. Hintergrund: Ohne GitHub-Release gibt es keinen Server mehr, gegen den die Prüfung laufen könnte; stehengelassener Code würde nur in API-Fehler und tote Links laufen. Der persistierte Store-Key `update.skippedVersion` bleibt bei bestehenden Installationen als harmloser verwaister Wert liegen.

### Geändert

- **Code-Hosting auf lokal umgestellt** (4T-0142): Der Git-Remote `origin` wurde gekappt; die Versionskontrolle läuft künftig rein lokal über Git.
- **Build- und Release-Prozess GitHub-frei** (4T-0144): `electron-builder` erzeugt kein `latest.yml` und keine Blockmaps mehr (`publish: null` statt GitHub-Provider-Block), `scripts/archive-build.js` verschiebt nur noch die Setup- und Portable-EXE nach `releases/`, und der Release läuft über einen lokalen `git tag` ohne `git push` und ohne `gh release create`. Release-Notes-Vorlage und der Release-Prozess in `CLAUDE.md` sind auf den lokalen Ablauf umgeschrieben.
- **GitHub-Bezüge der lebenden Dokumentation bereinigt** (4T-0145): Die beiden aktiven Issue-Links in der `CLAUDE.md` wurden in reinen Text umgewandelt. Inhaltliche GitHub-Begriffe (GitHub Flavored Markdown, highlight.js-Palette) und historische CHANGELOG-Einträge bleiben unverändert.
- **Versions-Bump** 0.20.0 → 0.21.0 ([package.json](package.json)).

### i18n

- 12 Keys je Sprache (DE/EN/FR/ES/IT) entfernt (4T-0143): `menu.help.checkForUpdates`, die zehn `update.*`-Keys (Dialog-Titel, -Texte, Buttons, Status- und Fehlermeldungen) und `help.feature.updateCheck`. Alle fünf Sprachdateien bleiben schlüsselgleich (je 375 Keys).

## [0.20.0] - 2026-05-24 — Inline Live Preview

Feature-Release. Fünftes Etappenziel aus dem Meta-Plan „Obsidian-Parity-Roadmap" (sieben Sub-Epics, 0.16.0 bis 1.0.0) und strukturell die tiefgreifendste Erweiterung der Reihe: der Editor selbst rendert Markdown jetzt im Live-Modus, sodass der Wechsel zwischen Quellcode-Pane und Render-Pane nicht mehr nötig ist, wenn man im natürlichen Lesebild schreiben will. Epic 3E-0014 umgesetzt in zehn Tasks plus einem während der View-Modus-Tests entdeckten Persistenz-Fix: 4T-0080 Architektur-Spike, 4T-0081 Inline-Markup, 4T-0082 Inline-Links, 4T-0083 Block-Markup ohne Callouts, 4T-0087 Callouts mit preload-Refactor, 4T-0084 Bilder/Math/Embeds, 4T-0088 Tabellen und Fenced-Code mit Cache, 4T-0089 Mermaid mit Theme-Hook, 4T-0085 View-Modus-Integration, 4T-0090 Per-Datei-Persistenz für Tab-Settings und Abschluss-Sammeltask 4T-0086.

### Neu

- **Inline Live Preview als vierter View-Modus** (4T-0080 bis 4T-0085): Vierter Ansichts-Modus „Live" neben Gerendert, Geteilt und Quellcode. Im Live-Modus rendert CodeMirror Markdown direkt im Editor: fett, kursiv, durchgestrichen, hervorgehoben, Inline-Code, Links und Wiki-Links als formatierte Anker, Headings groß, Listen mit Bullets oder Nummern, Task-Listen mit Klick-Toggle, Blockquotes mit Einrückung und Akzent-Balken, horizontale Trennlinien, Callouts als Box, Tabellen und Fenced-Code als gerendertes Widget, KaTeX-Inline und -Block, Bilder, Wiki-Embeds und Mermaid-Diagramme. Cursor-bewusste Demaskierung: in der Zeile, in der der Cursor steht, bleibt die Markdown-Quelle sichtbar; alle anderen Zeilen zeigen das gerenderte Bild. Source-Modus bleibt unverändert für Power-Use erhalten.
- **Statusbar-Button, Menü und Hotkey für Live** (4T-0085): Vier View-Buttons in der Statusbar in der Reihenfolge `[Live]` `[Quellcode]` `[Split]` `[Gerendert]` (Live-Button mit Lucide `wand-2`-Icon). Vierter Radio-Eintrag „Live" im Ansicht-Menü nach „Quellcode". Hotkey `Strg+4` parallel zur bestehenden Reihe `Strg+1`/`+2`/`+3`. Häkchen-Synchronisation über den bestehenden View-Mode-Broadcast.
- **Settings-Default für die Standard-Ansicht neuer Tabs** (4T-0085): Neue Sektion „Verhalten" im Einstellungs-Dialog mit Dropdown „Standard-Ansicht für neue Tabs" (vier Optionen Gerendert/Geteilt/Quellcode/Live). Wird beim `Strg+N` und beim ersten Öffnen einer Datei ohne persistierten Tab-Stand angewendet. Persistiert als `app.defaultViewMode`. Default bleibt „Gerendert" für bestehende Sessions ohne Anpassung.
- **Per-Datei-Persistenz für Wrap/Numbers/Folding** (4T-0090): Zeilenumbruch, Zeilennummern und Gliederungsspur überleben jetzt Tab-Schließen-und-Wiederöffnen sowie App-Neustart mit deaktivierter Sitzungswiederherstellung. Map von absolutem Pfad auf die drei Booleans, persistiert als eigener Store-Key `app.fileSettings`, getrennt vom `windows`-Store. Greift damit unabhängig vom Sitzungs-Wiederherstellungs-Flag. Der View-Modus wird bewusst nicht pro Datei persistiert; beim Wiederöffnen greift der Settings-Default „Standard-Ansicht für neue Tabs". Der Bug bestand für alle drei Settings, war bei Numbers und Folding aber unsichtbar, weil ihre Defaults (`true`) dem üblichen Nutzerverhalten entsprechen.
- **Hilfe-Dialog erweitert** (4T-0085): Neuer Funktions-Eintrag in der Gruppe „Ansicht" beschreibt den Live-Modus inklusive der Cursor-bewussten Demaskierung. Neuer Tastenkürzel-Eintrag für `Strg+4`. Bestehender Funktions-Eintrag zu den View-Modi auf vier Ansichten aktualisiert.

### Geändert

- **Versions-Bump** 0.19.0 → 0.20.0 ([package.json](package.json)).
- **Spike-Code entfernt** (4T-0085): Der globale `livePreviewActive`-State, der Debug-Hotkey `Strg+Umschalt+P` und der `[Spike 4T-0080]`-Konsolenlog aus der Architektur-Spike-Phase wurden vollständig entfernt. Der Live-Modus wird jetzt pro Tab über `tab.viewMode === 'live'` rekonfiguriert.
- **Edit-Modus beim View-Wechsel** (4T-0085): Live verhält sich beim Wechsel analog zu Source und Split — Edit-Modus wird nicht automatisch eingeschaltet. Nur der Wechsel zu Gerendert deaktiviert ihn zwingend. So bleibt die Entscheidung „bearbeiten" beim Nutzer.
- **Statusbar-Lücke zwischen Bookmark-Stern und Folding-Gutter-Icon** (4T-0085): Kleine optische Trennung (8 px) zwischen den beiden visuell zusammenhanglosen Icons, damit die Statusbar-Icon-Reihe leichter zu lesen ist.
- **preload-Refactor**: `CALLOUT_TYPES` von `src/main/preload.js` nach `src/shared/callouts.js` ausgelagert (4T-0087). Damit teilen Preload (Render-Pane) und Renderer (Live-Modus) eine einzige Quelle der Wahrheit für die zehn Callout-Typen und ihre Default-Titel-i18n-Keys.
- **Lezer-Markdown-Extensions**: Das CodeMirror-Markdown-Sprachpaket bekommt jetzt die `Table`-Extension aus `@lezer/markdown` explizit mitgegeben (4T-0088). Ohne sie erkennt der Lezer-AST Pipe-Tabellen nicht als Block-Konstrukt, der Live-Modus konnte dann keine Tabellen-Widgets bauen.
- **Mermaid-Render-Pipeline** (4T-0089): `mermaid.run`-Aufrufe werden im Live-Modus über eine modul-lokale Promise-Queue serialisiert. Hintergrund war ein globaler Counter-State in Mermaid v11: parallele Aufrufe vermischten Diagramm-Output oder warfen Phantom-Syntax-Fehler. Theme-Wechsel triggert über einen `liveRebuildEffect`-Dispatch pro Pane-View einen Re-Render aller Mermaid-Widgets mit neuem Theme im Cache-Key.

### Behoben

- **Tab-Settings überlebten Tab-Schließen-und-Wiederöffnen nicht** (4T-0090): Wer eine Datei öffnete, den Zeilenumbruch einschaltete, den Tab schloss und die Datei wieder öffnete, fand den Zeilenumbruch wieder aus. Ursache: `closeTab` führte keinen Per-Datei-Cache der Tab-Settings. Fix wie unter „Neu" beschrieben.
- **Mermaid-Bomb-SVG landete im Cache** (4T-0089): Im Live-Modus rendert Mermaid mit `suppressErrors:false`, sodass Syntax-Fehler einen Throw auslösen und in einer eigenen `cm-live-mermaid-error`-Box mit Quelltext landen. Vorher rendert Mermaid sein internes Bomb-SVG in den Container, das wurde im Widget-Cache zwischengespeichert und triggerte zusätzlich einen SVG-Render-Bug (`translate(undefined, NaN)`).
- **Cursor-in-Widget bei Mermaid** (4T-0089): Klick in ein Mermaid-Widget setzt den Cursor jetzt zuverlässig auf den Anfang der Quell-Zeile, nicht ins SVG hinein. Realisiert über `ignoreEvent` und `_destroyed`-Flag der Widget-Klasse.

### i18n

- 10 neue JSON-Keys über fünf Sprachen (DE/EN/FR/ES/IT), alle in 4T-0085: `view.live` (Statusbar-Tooltip), `menu.view.live` (Menü-Eintrag), `help.feature.livePreview` (Funktions-Eintrag), `help.shortcut.livePreview` (Tastenkürzel-Eintrag), `settings.behavior` (Settings-Sektions-Header) und `settings.defaultViewMode.label` plus die vier Dropdown-Optionen `.rendered`/`.split`/`.source`/`.live`.
- Update an `help.feature.viewModes` in allen fünf Sprachen: erwähnt jetzt vier Ansichten statt drei.
- Live-Übersetzungen: Live (DE/EN/IT), Direct (FR), En vivo (ES).

## [0.19.0] - 2026-05-22 — Reading- und Sidebar-Komfort

Feature-Release. Viertes Etappenziel aus dem Meta-Plan „Obsidian-Parity-Roadmap" (sieben Sub-Epics, 0.16.0 bis 1.0.0). Epic 3E-0013 bündelt fünf Komfort-Verbesserungen, die in Summe einen wahrnehmbaren UX-Schub geben: 4T-0071 Code-Block Copy-Button, 4T-0072 Word Count in der Statusbar, 4T-0073 Outgoing-Links-Sidebar plus Hotkey-Umzug, 4T-0074 Tabellen-Editor-Komfort, sowie das in drei Stufen umgesetzte Lesezeichen-System aus 4T-0075 (Basis), 4T-0078 (Ordner-Operationen) und 4T-0079 (Drag-and-Drop). Dazu 4T-0076 Hilfe-Dialog-Erweiterung und Abschluss-Sammeltask 4T-0077.

### Neu

- **Code-Block Copy-Button** (4T-0071): Jeder Fenced-Code-Block im Render-Pane bekommt einen Copy-Button rechts oben (Default unsichtbar, sichtbar bei Hover). Klick kopiert den Code-Inhalt vollständig in die Zwischenablage, kurzes visuelles „Kopiert"-Feedback mit Check-Symbol und Akzentfarbe. Wirkt für alle `<pre>`-Blöcke (mit und ohne Sprach-Tag, Highlight-Blöcke, SCG-Tabellen-Quelltexte) sowie rekursiv in Wiki-Embeds. Inline-Code und Mermaid-Blöcke (werden zu SVG) sind bewusst ausgeschlossen. `@media print` blendet den Button aus.
- **Word Count in der Statusbar** (4T-0072): Neue Statusbar-Anzeige zeigt Wörter, Zeichen und Lesezeit (200 wpm) der aktiven Datei. Bei Editor-Selektion wechselt die Anzeige auf die Auswahl. Klick öffnet einen Detail-Dialog mit Wörtern, Zeichen mit/ohne Leerzeichen, Lesezeit, Absätzen, Sätzen und Headings je Ebene (H1 bis H6). Frontmatter, Fenced-Code-Blöcke, Inline-Code und KaTeX-Math (Inline und Display) werden nicht mitgezählt. Live-Update mit 150 ms Debounce, Selektions-Wechsel synchron. Zahlen-Formatierung folgt der aktiven UI-Sprache via `Intl.NumberFormat` (DE `1.234`, EN `1,234`, FR `1 234`).
- **Outgoing-Links-Sidebar** (4T-0073): Dritte Sidebar-Sektion zwischen Tags und Backlinks zeigt alle Wiki-Links, Markdown-Links und Wiki-Embeds der aktiven Datei in Dokument-Reihenfolge. Pro Eintrag: Type-Badge (W/M/E), Ziel inklusive Heading- oder Block-Anker, Zeile und Snippet. Klick öffnet das Ziel über die bestehende Wiki-Link-Auflösung (inklusive Alias-Fallback und Anker-Sprung). Externe `http(s)://`-Links, `mailto:`, `tel:`, In-Page-Anker `#…` und Markdown-Image-Syntax `![alt](…)` werden ausgespart. Toggle über Statusbar-Icon (Lucide `external-link`), Menüpunkt „Ansicht → Outgoing-Links" oder neuer Hotkey `Strg+Umschalt+O`.
- **Tabellen-Editor-Komfort** (4T-0074): In klassischen Pipe-Tabellen springen `Tab` und `Umschalt+Tab` zwischen Zellen einer Zeile oder zur nächsten/vorherigen Tabellenzeile. `Tab` am Ende der letzten Zelle der letzten Tabellenzeile erzeugt eine neue Tabellenzeile mit derselben Spaltenanzahl. `Enter` am Zeilenende einer Tabellenzeile erzeugt ebenfalls eine neue Zeile; zweimal `Enter` in einer leeren Tabellenzeile verlässt die Tabelle. Escape-Pipes (`\|`) werden über Backslash-Count erkannt und nicht als Zell-Trenner gewertet. Konflikt-Reihenfolge mit dem Listen-Indent aus 4T-0016: Tabellen-Kontext greift zuerst, dann Liste, dann Default-Tab. In Fenced-Code-Blöcken (auch SCG-Tabellen) bleibt der Default-Tab.
- **Lesezeichen-Sidebar** (4T-0075 Basis, 4T-0078 Ordner-Operationen, 4T-0079 Drag-and-Drop): Persistente Lesezeichen auf Datei-Ebene mit Browser-Style verschachtelten Ordnern. `Strg+D` merkt die aktive Datei; mit selektiertem Ordner landet sie darin, mit selektiertem Bookmark auf gleicher Ebene daneben, sonst im Root. Rechtsklick-Kontextmenü mit „Neuer Ordner / Neuer Unterordner / Umbenennen / In Ordner verschieben … / Entfernen"; nicht-leere Ordner zeigen einen Bestätigungs-Dialog mit Anzahl der enthaltenen Bookmarks und Unterordner. Inline-Edit für Namen mit Enter/Esc/Blur-Verhalten. Modal-Picker für „In Ordner verschieben" mit Zyklus-Schutz (gesperrte Ziele ausgegraut). Drag-and-Drop für freie Sortierung: drei Drop-Zonen pro Knoten (oberes Drittel davor, mittleres in den Folder hinein, unteres dahinter), Bookmarks haben nur zwei Zonen. Visueller Indikator pro Zone (Akzent-Strich oder Rahmen), Esc bricht den Drag-Vorgang ab. Persistenz via `electron-store` mit Folder-First-Insert-Logik und einmaliger Migration bestehender Daten. Statusbar-Stern (Lucide `star`) toggelt die Sektion und zeigt mit ausgefüllter Variante an, dass die aktive Datei als Bookmark vorkommt. Hotkey-Toggle `Strg+Umschalt+L`. Im leeren App-Zustand bleibt die Sektion sichtbar, sobald mindestens ein Bookmark existiert, damit gemerkte Dateien direkt beim App-Start erreichbar sind; Tabbar, Source-Pane und Render-Pane werden in dem Zustand über die Klasse `.is-empty-with-bookmarks` ausgeblendet.
- **Hilfe-Dialog erweitert** (4T-0076): Fünf neue Funktions-Einträge in den Gruppen Bearbeitung (Tabellen-Editor-Komfort, Code-Block Copy-Button), Ansicht (Word Count) und Navigation (Outgoing-Links, Lesezeichen). Drei neue Tastenkürzel-Einträge (`Strg+D` für Lesezeichen merken, `Strg+Umschalt+O` für Outgoing-Links, `Strg+Umschalt+L` für Lesezeichen-Toggle) plus aktualisierter Inhaltsverzeichnis-Eintrag auf `Strg+Umschalt+I`.

### Geändert

- **Versions-Bump** 0.18.0 → 0.19.0 ([package.json](package.json)).
- **Inhaltsverzeichnis-Hotkey umgezogen** (4T-0073): Von `Strg+Umschalt+O` auf `Strg+Umschalt+I` (I für „Inhalt" / „Index"). Damit wird `Strg+Umschalt+O` für das neue Outgoing-Links-Panel frei. Angepasst in `src/main/menu.js`, `src/renderer/renderer.js` (Renderer-Keydown-Listener und `HELP_SHORTCUTS`) sowie in den `outline.toggleTitle`-Tooltips aller fünf Sprachen.
- **Bookmark-Tree-Persistenz-Key umgezogen** (4T-0079): Der Lesezeichen-Baum wandert vom Setting-Key `bookmarks` (Array) auf den eigenen Key `bookmarksTree`. Hintergrund war ein Key-Konflikt in `electron-store`: das Schreiben von `bookmarks` als Array hat das parallel verwendete Object-Format `bookmarks.visibleColumn0/1/sortMigrationDone` überschrieben, sodass die Sichtbarkeits-Preference nach App-Neustart verloren ging. Bestehende Daten unter `bookmarks` werden beim ersten Laden auf den neuen Key migriert; der alte Key wird auf `null` gesetzt.
- **Render-Sort der Bookmark-Liste entfernt** (4T-0079): Damit Drag-and-Drop die manuelle Reihenfolge frei bestimmen kann, wird im Render kein Folder-First-Sort mehr erzwungen. Daten-Reihenfolge ist die Quelle der Wahrheit. Der Folder-First-Default wird über die Insert-Funktionen (neue Ordner ans Ende der Folder-Gruppe, neue Bookmarks ans Ende der File-Gruppe) und eine einmalige Migration bestehender Daten gesichert (Migration via Setting `bookmarks.sortMigrationDone`).
- **Empty-State-Logik** (4T-0075): `updateEmptyState` lässt den Pane-Container im leeren Zustand sichtbar, wenn mindestens ein Bookmark vorhanden ist, und blendet über die neue CSS-Klasse `.is-empty-with-bookmarks` Tabbar, Source-Pane, Render-Pane und Inner-Splitter aus. Andere Sidebar-Sektionen (Outline, Backlinks, Properties, Tags, Outgoing-Links) werden im Empty-State zwangsweise unsichtbar geschaltet, weil sie ohne aktive Datei eh keinen sinnvollen Inhalt zeigen. Die persistierten Sichtbarkeits-Preferences bleiben dabei unverändert und greifen wieder, sobald ein Tab geöffnet ist.

### Behoben

- **Persistenz der Lesezeichen-Sektions-Sichtbarkeit** (4T-0079): Statusbar-Stern und Sektions-Zustand sind jetzt persistent über App-Neustart. Ursache war der oben unter „Geändert" beschriebene Key-Konflikt in `electron-store` — der Fix bringt die Persistenz zum funktionieren.
- **Datei-Drag-and-Drop wieder funktionsfähig** (4T-0079): Der DnD-Handler für die Lesezeichen-Sortierung hatte `preventDefault()` und `stopPropagation()` unbedingt aufgerufen, ohne zuerst zu prüfen, ob ein interner Bookmark-Drag aktiv ist. Damit blockierte er den App-globalen `window.drop`-Handler, der `.md`-Dateien aus dem Explorer übernimmt. Fix: Source-Check zuerst, bei externem Datei-Drag laufen die Event-Methoden nicht.

### i18n

- 70+ neue JSON-Keys über fünf Sprachen (DE/EN/FR/ES/IT): drei pro Sprache für den Code-Copy-Button, 14 pro Sprache für Word Count (Statusbar plus Detail-Dialog inkl. Heading-pro-Ebene-Template), 10 pro Sprache für Outgoing-Links (Sektions-Texte, Type-Badges, Zeilen-Label, Hotkey), 12 pro Sprache für Lesezeichen (Sektion, Toast-Templates, Kontext-Menü, Modals, Hotkeys), fünf pro Sprache für die neuen Hilfe-Dialog-Einträge. Plus aktualisierter `outline.toggleTitle` für den geänderten Hotkey und Update an `menu.view.outline`.

## [0.18.0] - 2026-05-21 — Markdown-Syntax-Erweiterungen und Scroll-Sync

Feature-Release. Drittes Etappenziel aus dem Meta-Plan „Obsidian-Parity-Roadmap" (sieben Sub-Epics, 0.16.0 bis 1.0.0). Epic 3E-0012 umgesetzt in zehn Tasks: 4T-0061 Callouts, 4T-0062 Highlight, 4T-0063 Footnotes, 4T-0064 Block-Embed-Erweiterung, 4T-0067 Wiki-Link-Pipe-Escape-Fix, 4T-0068 Embed-Linter-Präzisierung, 4T-0069 CRLF-Dirty-Fix, 4T-0070 Scroll-Synchronisation, 4T-0065 Hilfe-Dialog und Abschluss-Sammeltask 4T-0066.

### Neu

- **Callouts** (4T-0061): Obsidian-Style Block-Hinweisboxen mit `> [!type] Titel` als erste Zeile eines Blockquote-Blocks. Zehn Whitelist-Typen (`note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `example`, `quote`) mit eigenem Lucide-Icon, theme-konformer Akzentfarbe und Default-Titel in fünf Sprachen. Klappbare Varianten via `+` (default offen) oder `-` (default eingeklappt), realisiert über native `<details>`/`<summary>` ohne JavaScript. Unbekannte Typen werden als normaler Blockquote gerendert; der Markdown-Linter markiert den unbekannten Typ-Slug mit Wellenlinie und Hover-Tooltip. Eigener Editor-Marker (`cm-callout-marker`) hebt das `[!type][+-]?`-Pattern im Source-Pane farblich ab.
- **Highlight** (4T-0062): Pandoc- und Obsidian-Konvention `==Text==` rendert als `<mark>`-Element mit gelbem Hintergrund. Im Dunkelmodus gedämpfter Gelbton für lesbaren Kontrast. Escape `\==` bleibt Klartext. Kein Konflikt mit `==` innerhalb von KaTeX-Math-Blöcken, weil das KaTeX-Plugin im Inline-Ruler vorausgeht. Eigener Editor-Marker (`cm-mark-marker`) hebt den Inhalt zwischen den Delimitern im Source-Pane gelb hinterlegt ab.
- **Footnotes** (4T-0063): Fußnoten als `[^id]`-Verweis im Fließtext mit `[^id]: Definition` am Datei-Ende sowie Inline-Variante `^[Direkt-Text]`. Im Render erscheinen hochgestellte Zahlen mit Anchor-Link; am Datei-Ende sammelt die `markdown-it-footnote`-Library die Definitionen in einer `<section class="footnotes">` mit Backlink-Pfeilen. Theme-konformer Trenner und Accent-Farbe für Verweise. Eigener Editor-Marker (`cm-footnote-marker`) hebt klassische und Inline-Footnotes im Source-Pane ab.
- **Block-Embed-Erweiterung** (4T-0064): Nachzieher aus 0.17.0. Bei `![[Datei#^id]]` wird jetzt das vollständige umschließende Block-Konstrukt eingebettet — mehrzeilige Listen-Items inkl. Sub-Listen, Fenced-Code-Blöcke, Tabellen-Zeilen, mehrzeilige Blockquotes, Paragraphs. Vorher wurde nur die Marker-Zeile zurückgegeben. Realisiert über AST-basierte Block-Range-Erkennung mit markdown-it im Main-Prozess (Container-Tokens haben Vorrang vor inneren Paragraphen). Marker `^id` darf auch auf einer eigenen Zeile nach einem Fenced-Code-Block stehen — der Algorithmus mappt einen „Marker-only"-Paragraph auf den direkt vorhergehenden Container zurück.
- **Scroll-Synchronisation in der geteilten Ansicht** (4T-0070): Beim Scrollen im Source-Pane folgt das Render-Pane inhaltlich, und umgekehrt. Anchor-basiert über ein neues `sourceLineMapperPlugin`, das jedem Block-Open-Token im Render-DOM ein `data-source-line`-Attribut aus `token.map[0]` mitgibt. Damit landet beim „Akzeptanzkriterien"-Heading in beiden Panes tatsächlich derselbe Anker oben (statt prozentual zu driften). Pro Tab umschaltbar über ein neues Statusbar-Icon (Lucide `arrow-down-up`) oder über `Ansicht → Scroll-Synchronisation`. Default „aus" für neue Tabs, Zustand pro Tab in der Sitzungswiederherstellung erhalten.
- **Hilfe-Dialog erweitert** (4T-0065): Drei neue Funktions-Einträge in der Gruppe Bearbeitung (Callouts, Highlight, Footnotes), ein neuer Eintrag in der Gruppe Ansicht (Scroll-Synchronisation). Aktualisierter Wiki-Embed-Eintrag in der Gruppe Navigation erwähnt die vollständige Block-Range bei Block-Ankern.

### Geändert

- **Versions-Bump** 0.17.1 → 0.18.0 ([package.json](package.json)).
- **Neue Dependencies**: `markdown-it-mark@^4.0.0` für Highlight, `markdown-it-footnote@^4.0.0` für Footnotes. Beide MIT, klein, gepflegt.
- **`file:read` normalisiert CRLF → LF beim Lesen** (4T-0069): die App nutzt LF als kanonisches Format. Symmetrisch zur bestehenden Normalisierung in `file:save` (war schon vorher LF-only beim Schreiben). Damit ist die Pipeline konsistent, CodeMirrors interne LF-Normalisierung führt nicht mehr zu Phantom-dirty-Flags bei CRLF-Dateien. Bestehende CRLF-Dateien werden beim ersten echten Speichern zu LF — das passierte schon vor 4T-0069, nur war der dirty-Flag inkorrekt zu früh aktiv.
- **`writeFrontmatter` mit Leer-Äquivalenz** (4T-0069): `null`, `undefined`, `''` und `[]` werden im Frontmatter-Diff als äquivalent behandelt, damit der Initial-Auto-Save aus der Properties-Sidebar leere YAML-Werte (`Tätigkeit:`, `aliases:`) nicht auf leeren String mit Anführungszeichen (`Tätigkeit: ""`) umschreibt. Zusätzlich erhält die Funktion jetzt die EOL-Konvention der Quelle (CRLF vs. LF) und die Anzahl der Leerzeilen zwischen Frontmatter und Body.
- **`sourceLineMapperPlugin`** (4T-0070): markdown-it-Core-Ruler-Pass, der jedem Block-Open-Token ein `data-source-line`-Attribut für die Scroll-Sync mitgibt. Greift nur in der `md`-Instanz (Render-Pane), nicht in `mdPortable`.

### Behoben

- **Wiki-Link mit escaptem Pipe in Tabellen-Zellen** (4T-0067): In Markdown-Tabellen-Zellen muss der Pipe als `\|` escaped werden, damit der Tabellen-Parser ihn nicht als Spaltentrenner liest. Der Wiki-Link-Linter und die Wiki-Link-/Wiki-Embed-Parser im Preload haben den so escapten Pipe bisher als Teil des Targets gewertet — z.B. landete bei `[[Datei\|Label]]` das Backslash am Target-Ende, der Backlinks-Lookup schlug fehl, der Link wurde fälschlich als broken markiert. Fix: nach `indexOf('|')` wird der End-Backslash mit `replace(/\\$/, '')` abgeschnitten. Symmetrisch in renderer.js und preload.js.
- **Embed-Linter ignoriert `!`-Embeds** (4T-0068): Der Wiki-Link-Linter-Regex prüfte nicht auf den `!`-Präfix und behandelte Embeds wie Wiki-Links. Bild-, PDF- und Other-Embeds wurden konsequent als broken markiert, weil das Backlinks-Index nur Markdown-Dateien kennt. Fix: Negative-Lookbehind `(?<!!)` im `LINT_WIKI_RE`-Regex schließt Embeds aus. Eine eigene broken-embed-Regel bleibt offen für das 1.0.0-Konsolidierungs-Epic.
- **CRLF-Datei beim Öffnen nicht mehr als dirty markiert** (4T-0069): Beim Doppelklick-Öffnen einer CRLF-Datei mit sichtbarer Properties-Sidebar wurde der Tab sofort als geändert markiert, obwohl der Nutzer nichts angefasst hat. Drei kombinierende Ursachen, alle gefixt: `file:read` normalisiert jetzt symmetrisch zu `file:save`; `writeFrontmatter` ist CRLF-aware; Leer-Äquivalenz im YAML-Diff verhindert das `Tätigkeit: ""`-Pattern beim Initial-Auto-Save.
- **Doppelter Trenner unter dem Footnote-Block** (4T-0063): `markdown-it-footnote` rendert per Default ein `<hr class="footnotes-sep">` vor der Footnote-Section. Zusammen mit dem eigenen `border-top` auf `.footnotes` ergab das zwei Trenner direkt übereinander. Fix: `hr.footnotes-sep { display: none }` im Render-Pane und im Portable-Export-Pfad das `<hr>` ebenfalls weglassen.

### i18n

- 19 neue JSON-Keys über fünf Sprachen (DE/EN/FR/ES/IT): zehn Default-Titel für die Callout-Typen (`callout.<type>.title`), zwei für den Linter-Hinweis bei unbekanntem Callout-Typ (`linter.unknownCalloutType.short` und `.tooltip`), drei für die Scroll-Synchronisation (`statusbar.scrollSync.on`/`.off`, `menu.view.scrollSync`), vier neue Hilfe-Funktions-Einträge (`help.feature.callouts`, `.highlight`, `.footnotes`, `.scrollSync`).
- Update an `help.feature.wikiEmbeds` in allen fünf Sprachen: erwähnt die vollständige Block-Range bei Block-Ankern.

## [0.17.1] - 2026-05-20 — Tag-Parser-Hotfix

Bugfix-Release. Direkt nach Auslieferung von 0.17.0 wurden im Praxis-Einsatz mehrere Klassen von Fehlpositiven in der Tag-Sidebar sichtbar: Hex-Farbcodes, reine Zahlen, Markdown-Anker-Link-Ziele und CSS-/HTML-Selektor-Beispiele in Inline-Code wurden als Tag indexiert. Umgesetzt als Hotfix-Task 4T-0060 im Epic 3E-0011.

### Behoben

- **Hex-Farbcodes werden nicht mehr als Tag indexiert** (4T-0060): 3-, 4-, 6- und 8-stellige reine Hex-Sequenzen (`#fff`, `#ffff`, `#ffffff`, `#ffffffff`) werden vom Tag-Parser verworfen. Schließt CSS-Farb-Notationen wie `#c0392b`, `#ff7b72`, `#ffeeee` aus dem Tag-Index aus.
- **Reine Zahlen sind keine Tags mehr** (4T-0060): Tag-Texte ohne mindestens einen Buchstaben werden verworfen. Schließt Issue-Referenzen (`#16444`), Fußnoten (`#2`) und Zeilennummern (`#31999`) aus. Verhalten ist konsistent zur Obsidian-Konvention.
- **Markdown-Anker-Link-Ziele werden nicht mehr als Tag indexiert** (4T-0060): Ein zusätzlicher negativer Look-behind `(?<!\]\()` im Tag-Pattern schließt `[Text](#anker)`-Notationen aus. Bisher wurden alle solchen Vorkommen vom zeilenweisen Index-Parser fälschlich als Tag erfasst, weil der Look-behind das `(` als nicht-Wort-Zeichen passieren ließ.
- **Inline-Code-Tags werden nicht mehr als Tag indexiert** (4T-0060): Inline-Code-Spans mit Single- und Doppel-Backticks (`` `#btn-open` `` und `` `` `#help-modal` `` ``) werden vor dem Tag-Match aus der Zeile maskiert. Im Render-Pane übernahm markdown-it den Schutz, im Backlinks-Index fehlte er bisher. Betraf besonders PM-Doku-Dateien mit CSS-/HTML-Selektor-Beispielen.
- **Gleiche Filter im Render-Pane** (4T-0060): Der `tagsPlugin` in [src/main/preload.js](src/main/preload.js) wendet die drei Tag-Filter (Buchstabe, Hex, Markdown-Anker) ebenfalls an. Inline-Code ist im Render-Pane ohnehin durch markdown-it abgedeckt.

### Konvention zur Tag-Erkennung

Ab 0.17.1 gilt:

- Ein Tag muss mindestens einen Buchstaben enthalten.
- Tags dürfen keine reinen Hex-Farbcodes sein.
- Inline-Code (`` `#…` ``, `` `` `#…` `` ``) und Markdown-Anker-Link-Ziele (`[Text](#…)`) sind keine Tags.
- Tags im freien Fließtext bleiben erkennbar (Obsidian-Konvention): „Die Sektion #section beschreibt das" erzeugt weiterhin den Tag `#section`.

## [0.17.0] - 2026-05-20 — Wiki-Link-Ausbau und Tag-System

Feature-Release. Zweites Etappenziel aus dem Meta-Plan „Obsidian-Parity-Roadmap" (sieben Sub-Epics, 0.16.0 bis 1.0.0). Epic 3E-0011 umgesetzt in den Tasks 4T-0054 (Wiki-Link-Anker und Linter), 4T-0055 (Wiki-Embeds), 4T-0056 (Tag-System), 4T-0057 (Autocomplete), 4T-0058 (Hilfe-Dialog) und Abschluss-Sammeltask 4T-0059.

### Neu

- **Wiki-Link-Heading- und Block-Anker** (4T-0054): `[[Datei#Heading]]` springt zum Heading der Ziel-Datei, `[[Datei#^id]]` zum benannten Block-Anker. Block-Anker werden mit der Syntax `^id` am Ende einer Zeile gesetzt und auf den umschließenden Block (Absatz, Listen-Eintrag, Tabellen-Zeile, Code-Block) registriert. Der Markdown-Linter aus 4T-0020 prüft beide Anker-Arten und markiert defekte Ziele mit einem eigenen Hinweistext. Backlinks erfassen Anker-Bezüge ohne sie aufzulösen, das Sprung-Verhalten passiert beim Klick im Render-Pane oder im Editor-Modus.
- **Wiki-Embeds `![[…]]`** (4T-0055): Eingebettete Inhalte direkt im Render-Pane. Drei Embed-Typen werden unterstützt:
  - **Bilder** (PNG, JPG, GIF, SVG, WebP) als inline `<img>` mit Größen-Modifikator `|breite` oder `|breitexhoehe`.
  - **Markdown-Dateien** als gerenderter Block. Anker (`![[Datei#Heading]]`, `![[Datei#^id]]`) blenden gezielt Teilausschnitte ein, sonst die ganze Datei.
  - **PDFs** als interaktiver Viewer (PDF.js) mit Blätter-Steuerung und Zoom.
  Embed-Tiefe ist auf zwei Ebenen begrenzt, um Endlos-Schleifen zu verhindern. Nicht gefundene Ziele zeigen einen Platzhalter mit Fehlerhinweis.
- **Tag-System** (4T-0056): `#projekt/x` im Fließtext und das Frontmatter-Feld `tags:` werden als Tags erkannt. Tag-Klick im Render-Pane öffnet eine vorgefilterte Suche. Neue **Tag-Sidebar** als vierte Sektion neben Inhaltsverzeichnis, Backlinks und Properties: Liste aller Tags im Suchraum mit Häufigkeitszahl, Filter-Eingabe, Klick filtert die Tag-Trefferliste pro Datei. Toggle über `Ansicht → Tags`, Statusbar-Icon oder `Strg+Umschalt+T`. Tag-Index wird im Main-Prozess gepflegt und über den File-Watcher live aktualisiert.
- **Autocomplete-Framework** (4T-0057): Dropdown-Vorschläge beim Tippen im Editor.
  - `[` schlägt Dateinamen und Aliases aus dem Backlinks-Suchraum vor.
  - `[[Datei#` schlägt Heading-Anker der Ziel-Datei vor, `[[Datei#^` Block-IDs.
  - `#` im Fließtext schlägt Tags vor (mit Hierarchie und Häufigkeits-Sortierung), Heading-Marker am Zeilenanfang werden ausgeschlossen.
  Sortierung: Prefix-Treffer zuerst, dann Häufigkeit oder Datei-vor-Alias, dann alphabetisch. Vorschlagsliste auf 30 Einträge begrenzt. Pfeil-Tasten navigieren, Enter/Tab wählt, Esc schließt.
- **Hilfe-Dialog erweitert** ([4T-0058): Fünf neue Funktions-Einträge (Block-Anker, Autocomplete in der Gruppe Bearbeitung; Wiki-Link-Anker, Wiki-Embeds, Tags in der Gruppe Navigation) und ein neuer Tastenkürzel-Eintrag für `Strg+Umschalt+T`. In allen fünf Sprachen.

### Geändert

- **Versions-Bump** 0.16.0 → 0.17.0 ([package.json](package.json)).
- **Neue Dependency**: `@codemirror/autocomplete@^6.20.2` für das Autocomplete-Framework.
- **Wiki-Link-Parser** in [src/main/preload.js](src/main/preload.js): erkennt zusätzlich Heading- und Block-Anker (`#Heading`, `#^id`). Tokenisierung trennt Pfad, Anker und Label sauber. Neuer `blockAnchorsPlugin` für `^id` am Zeilenende, neuer `wikiEmbedsPlugin` für `![[…]]`, neuer `tagsPlugin` für `#tag`.
- **Backlinks-Index** ([src/main/backlinks.js](src/main/backlinks.js)): `parseFile` liefert jetzt `{ hits, aliases, headings, blockIds, tags }`. Neue Maps `anchorsPerFile`, `tagsPerFile` und inverse `tagMap` pro Wurzel; Watcher pflegt sie bei add/change/unlink. Drei neue Lookup-Funktionen für das Autocomplete (Wiki-Targets, Anker, Tags).
- **Markdown-Linter aus 4T-0020**: prüft zusätzlich Wiki-Link-Anker-Ziele (Heading-Slugs und Block-IDs der Ziel-Datei).
- **Tag-Sidebar mit Token-basierter Race-Abwehr**: bei mehrfachen parallelen Render-Triggern (Tab-Wechsel, Toggle, Auto-Reload, IPC-Antwort) wird nur das jeweils letzte Render-Ergebnis übernommen.

### Behoben

- **Race in der Tag-Sidebar-Render-Pipeline** (4T-0056): bei mehrfachen parallelen Triggern wurden Tags doppelt bis vierfach gerendert. Ursache: async-Render zwischen Container-leeren und Listen-Anhängen. Fix: Token-basierte Validierung im async-Pfad, IPC-Antworten verworfen, wenn der Render-Token zwischenzeitlich gewechselt hat.
- **Pseudo-Hierarchie-Einrückung in der Tag-Sidebar** (4T-0056): Tags mit `/` wurden visuell als verschachtelte Liste eingerückt, was bei mehreren Top-Level-Tags zu uneinheitlichen ersten Tags führte. Fix: flache Darstellung, Hierarchie nur über den Tag-Text sichtbar.

### i18n

- ~30 neue JSON-Keys über die fünf Sprachen (DE, EN, FR, ES, IT):
  - Embeds: `embed.notFound`, `embed.depthExceeded`.
  - Linter: `linter.brokenWikiAnchor.short`, `linter.brokenWikiAnchor.tooltip`; `linter.brokenWikiLink.tooltip` aktualisiert.
  - Tag-Sidebar: `menu.view.tags`, `tags.title`, `tags.toggle`, `tags.toggleTitle`, `tags.filterPlaceholder`, `tags.empty`, `tags.noMatch`, `tags.unavailable`, `tags.indexing`, `tags.oversized`, `tags.back`, `tags.noFiles`.
  - Autocomplete: `autocomplete.detail.file`, `autocomplete.detail.alias`, `autocomplete.detail.heading`, `autocomplete.detail.blockId`, `autocomplete.detail.tag`.
  - Hilfe-Dialog: `help.feature.blockAnchors`, `help.feature.autocomplete`, `help.feature.wikiLinkAnchors`, `help.feature.wikiEmbeds`, `help.feature.tags`, `help.shortcut.toggleTags`.

## [0.16.0] - 2026-05-20 — Frontmatter, Aliases und Properties

Feature-Release. Erstes Etappenziel aus dem Meta-Plan „Obsidian-Parity-Roadmap" (sieben Sub-Epics, 0.16.0 bis 1.0.0). Epic 3E-0010 umgesetzt in den Tasks 4T-0049 (Frontmatter-Erkennung), 4T-0050 (Aliases-Auflösung), 4T-0051 (Properties-Sidebar), 4T-0052 (Hilfe-Dialog) und Abschluss-Sammeltask 4T-0053.

### Neu

- **YAML-Frontmatter-Erkennung** (4T-0049): Der `---`-Block am Datei-Anfang wird als Metadaten erkannt und nicht mehr als horizontale Trennlinie gerendert. Im Source-Pane ist der Block dezent bläulich unterlegt. Sonderfälle (keine Frontmatter, unvollständiger Block, ungültiges YAML, `---` mitten im Dokument) verhalten sich robust ohne Crash. Der Markdown-Linter aus 4T-0020 prüft Frontmatter-Zeilen nicht mehr auf Markdown-Regeln.
- **Aliases-Auflösung in Wiki-Links und Backlinks** (4T-0050): `aliases:`-Einträge im Frontmatter machen eine Datei unter mehreren Namen per `[[Alias]]` verlinkbar. Case-insensitiver Lookup über eine inverse Alias-Map. Backlinks-Sidebar findet Quellen auch über Aliases und kennzeichnet Treffer mit einem dezenten „via Alias"-Tag. Bei mehrdeutigen Aliases (mehrere Dateien führen denselben Alias) erscheint ein Disambiguation-Dialog mit Datei-Name und Verzeichnis zur Auswahl. Der Markdown-Linter zählt Alias-Treffer als gültige Wiki-Links.
- **Properties-Sidebar** (4T-0051): Dritte Sidebar-Sektion neben Inhaltsverzeichnis und Backlinks. Live-editierbare Frontmatter-Felder mit Typ-Inferenz (Text, Liste, Datum, Zahl, Wahr/Falsch, Mehrzeilig). Verschachtelte YAML-Strukturen werden read-only mit JSON-Vorschau angezeigt. Round-Trip-Schreiben über die `yaml`-Library (Eemeli): unveränderte Felder bleiben byte-genau, Kommentare und Schlüsselreihenfolge erhalten. Live-Save folgt dem globalen Auto-Save-Setting: bei Auto-Save aus wird der Tab dirty markiert und mit Strg+S manuell gespeichert; bei Auto-Save an läuft der 2-Sekunden-Timer wie bei Editor-Änderungen. Toggle über Menü `Ansicht → Properties`, Statusbar-Icon oder Hotkey `Strg+;`. Multistring-Pillen mit Enter/Komma-Hinzufügen und Backspace-Entfernen. Persistenz pro Spalte. Konzept-Iteration: ursprünglich als modaler Dialog geplant, im Test-Feedback auf Sidebar-Sektion umgestellt.
- **Hilfe-Dialog erweitert** (4T-0052): Drei neue Funktions-Einträge (Frontmatter, Properties, Aliases) und ein neuer Tastenkürzel-Eintrag für `Strg+;`. In allen fünf Sprachen.

### Geändert

- **Versions-Bump** 0.15.0 → 0.16.0 ([package.json](package.json)).
- **Neue Dependencies**: `js-yaml@^4.1.1` für das Lesen, `yaml@^2.9.0` (Eemeli) für Round-Trip-Schreiben. `js-yaml` war transitiv schon vorhanden, jetzt direkt gepflegt.
- **Backlinks-Index** ([src/main/backlinks.js](src/main/backlinks.js)): `parseFile` liefert jetzt `{ hits, aliases }`. Wiki- und Markdown-Link-Scan überspringt Frontmatter-Zeilen, damit YAML-Inhalte nicht als ausgehende Links indexiert werden. Neue `aliasesPerFile`-Map und inverse `aliasMap` pro Wurzel; Watcher pflegt beide bei add/change/unlink.
- **Markdown-Linter aus 4T-0020**: drei Regel-Pfade (bareUrl, emptyLink, brokenWikiLink) überspringen Frontmatter-Zeilen. Wiki-Links auf gültige Aliases werden nicht mehr als broken markiert.

### Behoben

- **Race in der Properties-Sidebar-Render-Pipeline** (4T-0051): bei mehrfachen parallelen Triggern (Initial-Load, Tab-Wechsel, Toggle, View-Mode-Wechsel, Auto-Reload) wurden Properties doppelt bis vierfach gerendert. Ursache war ein `await` zwischen Container-leeren und Feld-Anhängen. Fix: `renderProperties` synchron, weil `api.getFrontmatter` im Preload als sync exposed ist.
- **Auto-Save-Inkonsistenz in der Properties-Sidebar** (4T-0051): Property-Änderung schrieb sofort auf Disk, auch wenn Auto-Save global ausgeschaltet war. Fix: Save-Pfad nutzt jetzt `scheduleAutoSave()` analog zum Editor.
- **Fehlendes Menü-Häkchen für Properties** (4T-0051): `getMenuState` in [src/main/main.js](src/main/main.js) reichte `propertiesVisible` nicht durch. Fix: Feld in die Liste der durchgereichten Menü-State-Felder ergänzt.

### i18n

- ~30 neue JSON-Keys über die fünf Sprachen (DE, EN, FR, ES, IT):
  - Alias-Disambiguation-Dialog: `alias.dialogTitle`, `alias.dialogDescription`, `alias.cancel`.
  - Backlinks: `backlinks.viaAlias`.
  - Properties-Sidebar: `menu.view.properties`, `properties.title`, `properties.toggle`, `properties.toggleTitle`, `properties.empty`, `properties.parseError`, `properties.writeError`, `properties.addField`, `properties.deleteField`, `properties.readonlyHint`, `properties.multistringPlaceholder`, sieben Typ-Labels (`properties.type.string` etc.).
  - Hilfe-Dialog: `help.feature.frontmatter`, `help.feature.properties`, `help.feature.aliases`, `help.shortcut.toggleProperties`.

## [0.15.0] - 2026-05-19 — SCG Table: Sortierung, Status-Hervorhebung und Spalten-Default

Feature-Release. Schließt das SCG-Table-Funktionspaket ab mit drei häufig genutzten Erweiterungen aus dem MediaWiki-Umfeld. Umgesetzt als Epic 3E-0009 in den Tasks 4T-0044 (Status-Hervorhebung), 4T-0045 (Spalten-Default), 4T-0046 (Sortierbare Tabellen), 4T-0047 (Hilfe-Tab) und Abschluss-Sammeltask 4T-0048.

### Neu

- **Status-Hervorhebung in SCG-Tabellen** (4T-0044): Semantische Klassen `error`, `warn`, `ok`, `info`, `neutral` über Punkt-Notation am Zell-/Zeilen-Marker (`|.error Inhalt`, `|-.warn`). Zell-Status gewinnt gegen Zeilen-Status. Whitelist verhindert beliebige CSS-Klassen. Light- und Dark-Theme-Farben mit WCAG-AA-Kontrast. Im portablen Export als Inline-Style.
- **Spalten-Default-Ausrichtung** (4T-0045): `{|+cols="left right right"` in der Tabellen-Header-Zeile setzt eine Default-Ausrichtung pro Spalte. Zell-`align`-Attribut aus Stufe 2 überschreibt. Bei `colspan` wird kein Default angewendet. Mismatch-tolerant (fehlende/überzählige Werte).
- **Sortierbare Tabellen** (4T-0046): `{|+sortable` aktiviert Klick-Sortierung pro Spalte. Drei Zustände zyklisch (aufsteigend → absteigend → reset). Sort-Heuristik: numerisch zuerst (`Number()`), sonst lexikographisch mit Locale (`localeCompare`, korrekt für Umlaute und ähnliches). Mehrzeilige Zellen werden nach der ersten Zeile sortiert. Sort-Indikator-Icons im Lucide-Stil. Bei `colspan`/`rowspan` automatisch deaktiviert. Im portablen Export nicht enthalten (kein JavaScript in fremden Renderern).
- **Hilfe-Tab um die drei Funktionen erweitert** (4T-0047): Neue Sektion „Sortierung, Status-Hervorhebung und Spalten-Default" mit Beispielen. Funktions-Eintrag `help.feature.scgTableExtended` in der Gruppe „Bearbeitung". Ausblick-Block durch „Stand der Funktionen" ersetzt (Funktionsumfang abgeschlossen).

### Geändert

- **Versions-Bump** 0.14.0 → 0.15.0 ([package.json](package.json)).
- **Parser-Erweiterung** in `parseScgTableBlock` ([src/main/preload.js](src/main/preload.js)): Tabellen-Header-Attribute (`+cols=`, `+sortable`) und Status-Klassen-Suffix (`.error` etc.) werden zusätzlich erkannt. Reihenfolge: Marker → Status → Attribute → Inhalt.
- **CSS-Erweiterung** ([src/renderer/styles.css](src/renderer/styles.css)): Status-Klassen für Light- und Dark-Theme, Hover-Effekt und Sort-Indikator-Styling für sortierbare Header.

### i18n

- 1 neuer JSON-Key (`help.feature.scgTableExtended`) in allen fünf Sprachen.
- Hilfe-Markdown-Dateien (`src/i18n/help/scg-table.{de,en,fr,es,it}.md`) um die Sortierung-Status-Spalten-Default-Sektion erweitert; Ausblick-Block durch „Stand der Funktionen" ersetzt.

## [0.14.0] - 2026-05-19 — SCG Table: Verschachtelung und HTML-Export

Feature-Release. Erweitert SCG-Tabellen (eingeführt in 3E-0006, Spans/Ausrichtung in 3E-0007) um Verschachtelung bis drei Ebenen tief und einen HTML-Konverter für externe Markdown-Renderer. Umgesetzt als Epic 3E-0008 in den Tasks 4T-0040 (Verschachtelung), 4T-0041 (HTML-Konverter), 4T-0042 (Hilfe-Tab) und Abschluss-Sammeltask 4T-0043.

### Neu

- **Verschachtelte SCG-Tabellen** (4T-0040): Eine Zelle kann selbst eine SCG-Tabelle enthalten, bis zu drei Ebenen tief. CommonMark-konforme Fence-Längen-Regel (jede äußere Fence mindestens eine Backtick mehr als die nächste innere). Rekursionstiefen-Counter mit Limit 3 schützt vor pathologischen Eingaben; ab der vierten Ebene fällt die innerste Tabelle auf Code-Block-Render zurück. **Bonus-Wirkung**: Fence-Tracking im Parser repariert latent eine Stufe-1-Schwäche, bei der ein Code-Block in einer Zelle mit scg-table-ähnlichen Markern zerrissen wurde.
- **HTML-Export „Datei → Exportieren → Portables Markdown…"** (4T-0041): Konvertiert SCG-Tabellen in einer `.md`-Datei zu inline HTML-Tabellen, sodass sie auch in fremden Markdown-Renderern (GitHub-Vorschau, VS Code, andere Editoren) als echte Tabellen erscheinen. Save-As-Dialog mit Vorbelegung `<basename>-portable.md`. HTML-Output ist HTML5-konform: `colspan`/`rowspan`/`scope` als Attribute, Ausrichtung als `style="text-align: …; vertical-align: …"`, `<caption>` für Tabellen-Beschriftung. Inline-Formatierung in Zellen wird über eine zweite markdown-it-Instanz (`html: true`) zu HTML konvertiert. Original-Datei bleibt unverändert.
- **Marker `<!-- scg-portable -->`** für die Viewer-Anzeige der exportierten Datei: der Konverter fügt den Marker am Datei-Anfang ein, der Viewer erkennt ihn und schaltet die Datei in einen HTML-fähigen Render-Modus. Damit rendert die exportierte Datei auch im eigenen Viewer als Tabelle. Reguläre `.md`-Dateien rendern unverändert mit `html: false` — kein Sicherheitsrisiko-Anstieg.
- **Hilfe-Tab um Sektion „Verschachtelte Tabellen und HTML-Export" erweitert** (4T-0042): Fence-Längen-Tabelle, gerendetes Verschachtelungs-Beispiel, Bedienungs-Beschreibung des Konverters, Marker-Mechanismus mit Sicherheits-Hinweis. In allen fünf Sprachen.
- **Funktions-Eintrag im Hilfe-Dialog** (4T-0042, Scope-Erweiterung im Test): neuer Eintrag `help.feature.exportPortable` in der Gruppe „Datei und Sitzung" mit Querverweis auf den SCG-Table-Tab.

### Geändert

- **Versions-Bump** 0.13.0 → 0.14.0 ([package.json](package.json)).
- **Parser-Refactoring**: `parseScgTableBlock` als gemeinsame Hilfsfunktion für Viewer-Renderer und HTML-Konverter aus [src/main/preload.js](src/main/preload.js) extrahiert.
- **Zweite md-Instanz `mdPortable`** mit `html: true` für den HTML-Konverter-Pfad und für die Anzeige von Dateien mit `<!-- scg-portable -->`-Marker.
- **Datei-Menü** um Submenü „Exportieren → Portables Markdown…" erweitert ([src/main/menu.js](src/main/menu.js)).

### i18n

- 3 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT):
  - `menu.file.export` (Submenü-Label) und `menu.file.exportPortable` (Eintrag-Label) je Sprache.
  - `help.feature.exportPortable` (Funktions-Eintrag im Hilfe-Dialog) je Sprache.
- Hilfe-Markdown-Dateien (`src/i18n/help/scg-table.{de,en,fr,es,it}.md`) um die Verschachtelung-und-HTML-Export-Sektion erweitert.

## [0.13.0] - 2026-05-19 — SCG Table: Spans, Ausrichtung und Accessibility

Feature-Release. Erweitert SCG-Tabellen (eingeführt in 3E-0006) um Zell-Attribute für Layout-Steuerung. Umgesetzt als Epic 3E-0007 in den Tasks 4T-0037 (Parser- und Renderer-Erweiterung), 4T-0038 (Hilfe-Tab erweitert) und Abschluss-Sammeltask 4T-0039.

### Neu

- **Zell-Attribute in SCG-Tabellen** (4T-0037): `colspan`, `rowspan`, `align` (`left`/`center`/`right`) und `valign` (`top`/`middle`/`bottom`) als Whitelist-Attribute am Zellenanfang (`| attr="val" attr="val" | Inhalt`). Strikte Wert-Validierung; freie `style="…"`-, `class="…"`- oder `onclick="…"`-Attribute werden stillschweigend ignoriert (kein XSS-Risiko aus dem Quelltext). `align`/`valign` werden auf CSS-Klassen (`.align-*`/`.valign-*`) gemappt, nicht auf das deprecated HTML4-`align`-Attribut, damit die CSS-Hoheit beim App-Stylesheet bleibt.
- **Accessibility-Verbesserung für Header-Zellen** (4T-0037): `<th>` in der Header-Zeile bekommt automatisch `scope="col"`, `<th>` als Zeilen-Header (`!` am Anfang einer Datenzeile) bekommt `scope="row"`. Damit verbinden Screen-Reader Datenzellen mit ihren Headern.
- **Hilfe-Tab um Spans-und-Ausrichtung-Sektion erweitert** (4T-0038): Neue Sektion „Spans und Ausrichtung" im Tab „SCG Table" mit Übersichts-Tabelle der vier Attribute, Beispiel „Aufwandsschätzung" mit gerenderter Tabelle, Tipps-Subblock und Accessibility-Hinweis. In allen fünf Sprachen.

### Geändert

- **Versions-Bump** 0.12.0 → 0.13.0 ([package.json](package.json)).
- **CSS-Klassen** `.scg-table .align-{left|center|right}` und `.valign-{top|middle|bottom}` in [src/renderer/styles.css](src/renderer/styles.css).

### i18n

- Keine neuen i18n-JSON-Keys. Die Hilfe-Inhalte sind als Markdown-Dateien organisiert (`src/i18n/help/scg-table.{de,en,fr,es,it}.md`); diese wurden um die Spans-und-Ausrichtung-Sektion erweitert.

## [0.12.0] - 2026-05-19 — SCG Table: mehrzeilige Block-Zellen in Tabellen

Feature-Release, der eine Markdown-Erweiterung für Tabellen mit mehrzeiligen Block-Zellen einführt. Umgesetzt als Epic 3E-0006 in den Tasks 4T-0034 (Parser und Renderer), 4T-0036 (Hilfe-Tab mit ausführlicher Doku) und Abschluss-Sammeltask 4T-0035. Stufe 1 des Epics; `colspan`/`rowspan`/Ausrichtung und ein HTML-Konverter für externe Renderer folgen in späteren Folge-Epics.

### Neu

- **SCG-Tabellen mit mehrzeiligen Block-Zellen** (4T-0034): Markdown-Pipe-Tabellen sind zeilenbasiert und können keine geschachtelten Listen, mehrere Absätze oder Code-Blöcke in einer Zelle abbilden. SCG-Tabellen schließen diese Lücke über einen Fenced-Code-Block mit Sprach-Tag `scg-table`. Inhalt zwischen `{|` und `|}` wird als HTML-Tabelle gerendert; in fremden Markdown-Renderern bleibt der Block als lesbarer Code-Block sichtbar (Graceful Degradation). Syntax orientiert sich an MediaWiki: `{|` öffnet, `|}` schließt, `|-` trennt Zeilen, `|` startet eine Datenzelle, `!` eine Header-Zelle, `|+` setzt eine Caption. Zelleninhalt wird rekursiv durch markdown-it gerendert, sodass Listen (auch geschachtelt), nummerierte Listen, Codeblöcke (mit Vier-Backtick-Außenfence), Inline-Formatierung, Wiki-Links und Bilder in Zellen funktionieren. Integration über Override von `md.renderer.rules.fence` in `preload.js` mit Delegation an den Default-Renderer für alle anderen Sprach-Tags, sodass Code-Highlighting unangetastet bleibt.
- **Hilfe-Tab „SCG Table"** (4T-0036): Dritter Tab im Hilfe-Dialog neben „Funktionen" und „Tastenkürzel". Inhalt pro Sprache als Markdown-Datei in `src/i18n/help/scg-table.<locale>.md`, asynchron vom Main geladen und durch dieselbe markdown-it-Instanz wie der Viewer-Inhalt gerendert. Die Hilfe demonstriert sich selbst, weil die Beispiele echte scg-table-Blöcke enthalten, die der scg-table-Renderer verarbeitet. Inhalt: Einleitung, Syntax-Übersicht, Minimal- und erweitertes Beispiel mit Code-Block in der Zelle, fünf Tipps (`|-`-Pflicht zwischen Zeilen prominent als erster Punkt), Portabilitäts-Hinweis, Stufen-Ausblick. Lazy-Loading mit Locale-Cache; Sprachwechsel triggert Reload, wenn der Tab sichtbar ist.
- **Hilfe-Dialog um den scg-table-Eintrag erweitert** (4T-0035): `help.feature.scgTable` in der Gruppe „Bearbeitung" mit Querverweis auf den ausführlichen Hilfe-Tab.

### Geändert

- **Versions-Bump** 0.11.0 → 0.12.0 ([package.json](package.json)).
- **CSS-Anpassungen für `.scg-table`** ([src/renderer/styles.css](src/renderer/styles.css)): Caption-Styling mit kursivem Text und gedämpfter Farbe, `vertical-align: top` für Block-Zellen, Margin-Reset für umschließendes `<p>` aus dem Block-Render (damit einzelne Absätze in Zellen keine sichtbaren Abstände an Zellrändern verursachen).

### i18n

- 2 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT):
  - `help.tabScgTable` (Tab-Label, Eigenname „SCG Table" in allen Sprachen) je Sprache.
  - `help.feature.scgTable` (kurzer Funktions-Eintrag in der Gruppe „Bearbeitung") je Sprache.
- 5 neue Markdown-Inhaltsdateien (`src/i18n/help/scg-table.{de,en,fr,es,it}.md`) mit dem ausführlichen Hilfe-Tab-Inhalt.

## [0.11.0] - 2026-05-19 — Theme-Wahl, Statusbar-Icons und Update-Erkennung

Feature-Release, das die App um drei eigenständige Komfort-Verbesserungen erweitert. Umgesetzt als Epic 3E-0005 in den Tasks 4T-0030 (Theme-Umschalter), 4T-0031 (Statusbar-Icons) und 4T-0029 (Update-Erkennung), inklusive Abschluss-Sammeltask 4T-0033. Der Auto-Install-Pfad (4T-0032) wurde wegen SmartScreen-Risiken bei unsigniertem Installer zurückgestellt, bis ein Code-Signing-Zertifikat vorliegt.

### Neu

- **Theme-Umschalter Hell / Dunkel / System** (4T-0030): Drei-Wege-Wahl statt der bisherigen rein systemgesteuerten Theme-Logik. Auswahl an zwei Stellen: Menü `Ansicht → Theme` mit drei Radio-Items und ein Statusbar-Icon (Sonne / Mond / Monitor) zwischen Edit-Stift und Sprach-Wahl, das per Klick zyklisch Hell → Dunkel → System → Hell durchschaltet. Persistenz in `electron-store` (Schlüssel `themePref`, Default `system`), sodass die Wahl App-Neustarts überlebt. Multi-Window-Sync über zwei Broadcast-Kanäle: Statusbar-Icon und Menü-Radio bleiben in allen Fenstern synchron. Mermaid-Diagramme und Syntax-Highlighting passen sich beim Theme-Wechsel ohne Reload an. Native System-Dialoge folgen über `nativeTheme.themeSource` ebenfalls dem gewählten Theme.
- **Statusbar-Buttons als Icons** (4T-0031): Die acht Wort-Buttons unten links (Inhalt, Backlinks, Gliederung, Nummern, Umbruch, Quellcode, Geteilt, Gerendert) werden durch Inline-SVG-Icons aus [Lucide](https://lucide.dev) (ISC-Lizenz) ersetzt. Konzept-Phase mit visuellem Mockup für die Icon-Auswahl unter Projektmanagement/Mockups/4T-0031-icon-mockup.html. Finale Auswahl: `list-tree`, `link-2`, `chevrons-down-up`, `list-ordered`, `wrap-text`, `code`, `columns-2`, `eye`. Keine NPM-Dependency, kein Runtime-CDN, kein Netzwerk-Zugriff. Tooltips bei Hover und `aria-label`-Beschriftungen für Screen-Reader sind in allen fünf Sprachen lokalisiert (`data-i18n-aria-label`-Erweiterung in `i18n.js`). Statusbar-Reihe links unten ist dadurch deutlich schmaler, rechte Statusbar-Sektion bekommt entsprechend mehr Platz.
- **Update-Erkennung mit Link zur GitHub-Release-Seite** (4T-0029): Die App prüft im Hintergrund auf neue Versionen, **erstmaliger Check 45 Sekunden nach App-Start**, danach alle 24 Stunden. Manueller Trigger über Menü `Hilfe → Auf Updates prüfen…`. Bei verfügbarem Update öffnet sich ein Dialog mit drei Optionen: „Zum Download öffnen" (öffnet die GitHub-Release-Seite im Standard-Browser), „Später erinnern" und „Diese Version überspringen" (persistiert in `electron-store` unter `update.skippedVersion`; manueller Check ignoriert die Skip-Liste). Setup- und Portable-EXE werden einheitlich behandelt — kein automatischer Download, keine automatische Installation. Beim Hintergrund-Check stille Fehler-Behandlung; beim manuellen Check Fehler-Dialog mit Heuristik für Netzwerk-Fehler. Diagnose-Logger schreibt nach `%APPDATA%/SCG Markdown/logs/update.log`.
- **Hilfe-Dialog um den Update-Eintrag erweitert** (4T-0033): `help.feature.updateCheck` in der Gruppe „Allgemein". Der bestehende `help.feature.theme`-Eintrag wurde inhaltlich auf die Drei-Wege-Wahl angepasst.

### Geändert

- **Versions-Bump** 0.10.0 → 0.11.0 ([package.json](package.json)).
- **Build-Pipeline um electron-updater-Assets erweitert** ([scripts/archive-build.js](scripts/archive-build.js)): `latest.yml` und die Setup-Blockmap landen nach jedem Build neben den EXEs in `releases/`, damit der Release-Prozess sie als GitHub-Asset hochladen kann. Die SemVer-Regex im Archive-Script unterstützt jetzt Pre-Release-Suffixe (`-rc1`, `-dev.0`, `-alpha.5` etc.).
- **`publish`-Block in `package.json.build`** mit Provider `github` aktiviert die `latest.yml`-Erzeugung von `electron-builder`.
- **`electron-updater@6.8.3`** als neue Production-Dependency.

### Behoben

- **Sidebar-Sektionen lassen sich wieder unabhängig ein-/ausblenden** (Pre-existing-Bugfix aus 4T-0014/4T-0015, Commit `8f7da17`): Die CSS-Regel `.sidebar-section { display: flex; }` überschrieb seit der Einführung von Outline und Backlinks die User-Agent-Default `[hidden] { display: none; }` (gleiche Spezifität, spätere Quellreihenfolge gewinnt). Eine spezifischere Regel `.sidebar-section[hidden] { display: none; }` stellt das erwartete Verhalten wieder her. Aufgefallen während des Tests von 4T-0031.

### Zurückgestellt

- **Auto-Download und Auto-Installation des Updates** (4T-0032): Ursprünglich Teil des Update-Tasks; wegen SmartScreen-Risiken bei unsigniertem Setup-Installer (Auto-Install kann je nach Windows-Version, Sicherheitsstufe und Hash-Reputation stillschweigend zulassen, mit Warnung zulassen oder vollständig blockieren) in einen eigenen, zurückgestellten Task ausgelagert. Voraussetzung für den Wiederanlauf: Code-Signing-Zertifikat (OV oder EV) für die Setup-EXE. Die in 4T-0029 etablierte Infrastruktur (electron-updater, GitHub-Provider, `latest.yml`, Dialog-Struktur) wird dort nahtlos weiterverwendet.

### i18n

- 24 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT):
  - Theme-Umschalter: 7 Keys (`menu.view.theme/Light/Dark/System`, `statusbar.theme.tooltipLight/Dark/System`) je Sprache.
  - Update-Erkennung: 11 Keys (`menu.help.checkForUpdates`, `update.dialogTitle/Text`, `update.btnOpenRelease/RemindLater/SkipVersion`, `update.statusUpToDateTitle/Message`, `update.errorTitle/Offline/Generic`) je Sprache.
  - Sammeltask: 2 Keys (`help.feature.updateCheck`, `about.lucide`) je Sprache.
  - Plus inhaltliche Anpassung von `help.feature.theme` (Drei-Wege-Wahl statt automatische Kopplung).

## [0.10.0] - 2026-05-19 — Render-Lift: Syntax-Highlighting, KaTeX-Mathematik und Mermaid-Diagramme

Feature-Release, das den Render-Pane auf das Niveau hebt, das Nutzer von GitHub und ähnlichen Tools kennen. Umgesetzt als Epic 3E-0004 in den Tasks 4T-0023 (Syntax-Highlighting), 4T-0022 (KaTeX) und 4T-0021 (Mermaid), inklusive Abschluss-Sammeltask 4T-0028.

### Neu

- **Syntax-Highlighting für Code-Blöcke im Render-Pane** (4T-0023): Fenced-Code-Blöcke mit Sprach-Tag werden im Render-Pane farbig dargestellt. `highlight.js` in der Core-Variante mit kuratierter Sprachliste (JavaScript, TypeScript, Python, Java, C#, C++, Go, Rust, Bash, SQL, JSON, YAML, XML, CSS, Markdown, Plaintext, plus die üblichen Alias-Tags). GitHub-Light- und Dark-Theme werden über ein generiertes Stylesheet (`scripts/build-hljs-themes.js` → `src/renderer/hljs-themes.css`) parallel geladen und über das `data-theme`-Attribut am `<html>` ohne Re-Render umgeschaltet. Unbekannte Sprach-Tags fallen still auf einen Plain-Block zurück, ohne Fehlermeldung. Inline-Code bleibt unangetastet.
- **KaTeX-Mathematik im Render-Pane** (4T-0022): Mathematische Formeln werden mit KaTeX gesetzt — Inline `$…$` und Block `$$…$$`. `@vscode/markdown-it-katex` als markdown-it-Plugin sorgt dafür, dass Dollar-Beträge im Fließtext (`Das kostet $5 bis $10`) durch die Whitespace-Heuristik unverändert bleiben. Backslash-Escape `\$` ebenfalls. Syntaxfehler in Formeln erscheinen rot inline, ohne den Render-Pane abzuschießen. KaTeX-CSS und 20 woff2-Schnitte werden per `scripts/build-katex-assets.js` aus `node_modules/katex` nach `src/renderer/katex/` kopiert, mit Filter auf woff2 (Chromium unterstützt das nativ; woff und ttf wären nur unnötiger Ballast im Bundle).
- **Mermaid-Diagramme im Render-Pane** (4T-0021): Fenced-Code-Blöcke mit Sprach-Tag `mermaid` werden als SVG-Diagramme gerendert (Flowchart, Sequence, Gantt, Class und weitere Mermaid-Typen). Mermaid sitzt in einem separaten esbuild-Bundle (`scripts/build-mermaid.js` → `src/renderer/mermaid.bundle.js`, ~3 MB minified) und wird per dynamischem `import()` lazy geladen — Dokumente ohne Mermaid-Blöcke holen den Bundle gar nicht erst. Theme-Wechsel zur Laufzeit rendert alle vorhandenen Diagramme in der neuen Palette neu. Cache-Schicht (FNV-1a-Hash pro Quelltext+Theme) verhindert teure Re-Renders beim Live-Tippen. Syntax-Fehler werden in einem dezenten eigenen Fehler-Block mit Quelltext und Meldung dargestellt, ohne dass Mermaid-DOM-Leftovers am `<body>` hängen bleiben.
- **Hilfe-Dialog um drei neue Feature-Einträge erweitert** (4T-0028): `help.feature.codeHighlight`, `help.feature.katex`, `help.feature.mermaid` in der Gruppe „Ansicht". Keine neuen Tastenkürzel im Release.

### Geändert

- **Versions-Bump** 0.9.0 → 0.10.0 ([package.json](package.json)).
- **markdown-it-Pipeline im Preload erweitert** (4T-0021/22/23): `highlight.js/lib/core` mit selektiver Sprach-Registrierung als `highlight`-Callback in markdown-it, `@vscode/markdown-it-katex` als zusätzliches Plugin. Bei unbekannten Sprach-Tags schreibt der Highlight-Callback weiterhin die `language-<tag>`-Klasse mit, damit das Renderer-seitige Post-Processing (Mermaid) den Block zuverlässig per Klassennamen findet.
- **Renderer-Build-Pipeline um drei Pre-Steps erweitert** ([scripts/build-renderer.js](scripts/build-renderer.js)): vor dem Haupt-Bundle baut esbuild jetzt die hljs-Themes, KaTeX-Assets und den Mermaid-Bundle.

### Zurückgestellt

- **PDF-Export** (4T-0024): Der ursprünglich für 0.10.0 vorgesehene PDF-Export per `webContents.printToPDF` wurde während der Umsetzung zurückgestellt. Theme- und Container-Konflikte im Print-Modus konnten innerhalb des Releases nicht zufriedenstellend gelöst werden. Der Code-Stand wurde vollständig zurückgebaut; der Versuch ist im Task mit Problemen, Teil-Lösungen und drei Wiederanlauf-Varianten (A, B, B+) ausführlich dokumentiert. Das Feature kommt in einem späteren Release zurück.

### i18n

- 15 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT): drei neue Feature-Einträge für den Hilfe-Dialog (`help.feature.codeHighlight`, `help.feature.katex`, `help.feature.mermaid`) je Sprache.

## [0.9.0] - 2026-05-18 — Editor-UX und -Komfort: Listen-Indent, Zoom, Schriftart, Fokus-Modus und Markdown-Linter

Feature-Release, das im Alltag spürbare Verbesserungen am Schreib- und Leseerlebnis bündelt. Umgesetzt als Epic 3E-0003 in den Tasks 4T-0016 bis 4T-0020, inklusive Abschluss-Sammeltask 4T-0027. Der Hilfe-Dialog ist in diesem Release strukturell überarbeitet, weil die kumulierte Funktions- und Tastenkürzel-Liste über die Releases hinweg unübersichtlich geworden war.

### Neu

- **Tab und Umschalt+Tab in Markdown-Listen** (4T-0016): Rückt Listenelemente eine Ebene ein bzw. aus, in zwei Leerzeichen pro Stufe. Erkannt werden ungeordnete (`-`, `*`, `+`), geordnete (`1.`) und Task-Listen (`- [ ]` / `- [x]`); geordnete Listen werden beim Einrücken auf `1.` zurückgesetzt, ungeordnete und Task-Listen behalten ihren Marker. Mehrzeilen-Selektion wird in einer Transaktion ausgeführt (`Strg+Z` macht die Operation als Ganzes rückgängig). In Code-Blöcken und außerhalb von Listen bleibt das CodeMirror-Default-Tab-Verhalten erhalten.
- **Zoom pro Tab** (4T-0017): `Strg + +`, `Strg + -`, `Strg + 0` und `Strg + Mausrad` zoomen den Inhalt des aktiven Tabs in 10-%-Schritten zwischen 50 % und 300 %. Der Faktor wirkt nur auf Editor- und Render-Pane (UI bleibt unverändert) und wird pro Tab gehalten, sodass mehrere Tabs unterschiedliche Zooms zeigen können. Indikator rechts in der Statusbar bei Abweichung von 100 %, Klick darauf setzt zurück. Beim Tab-Transfer in ein anderes Fenster wandert der Zoom mit. Sitzungswiederherstellung startet bewusst bei 100 %.
- **Einstellungen-Dialog mit konfigurierbarer Schriftart und -größe** (4T-0018): Neuer modaler Dialog `Datei → Einstellungen` (auch `Strg + ,`) mit Sektion „Darstellung". Editor- und Render-Schriftart sowie -größe sind getrennt einstellbar. Schriftart als kombiniertes Auswahl- und Freitext-Feld mit kuratierten Windows-Vorschlägen (Editor monospace: Consolas, Cascadia Code, Cascadia Mono, JetBrains Mono, Fira Code, Source Code Pro, Courier New; Render proportional: Segoe UI, Calibri, Arial, Helvetica, Georgia, Times New Roman, Verdana). Schriftgröße 8 bis 32, Default 14 (Editor) / 15 (Render). Live-Vorschau im Dialog, OK / Anwenden / Abbrechen. Werte persistent und über Multi-Window-Broadcast in allen offenen Fenstern aktiv. Code-Blöcke im Render-Pane nutzen die Editor-Schriftart für konsistente Darstellung.
- **Fokus-Modus** (4T-0019): `Strg + Umschalt + F` oder `Ansicht → Fokus-Modus` blendet Tab-Leisten, Statusbar und Sidebar-Panels aus für ablenkungsfreies Schreiben. Editor- und Render-Pane bleiben sichtbar, die native Menüleiste ist über Alt erreichbar. Esc verlässt den Modus, sofern kein Overlay mit Vorrang offen ist (Regex-Hilfe, Suchbar, Modale, Kontextmenü). Persistent, wirkt pro Fenster.
- **Typewriter-Scroll** (4T-0019): `Ansicht → Typewriter-Scroll` hält die Cursor-Zeile im Editor vertikal zentriert, sobald der Cursor bewegt wird. Wirkt nur im Edit-Modus, nur im Editor-Pane. Persistent, global.
- **Markdown-Linter-Light** (4T-0020): Vier feste Regeln markieren typische Mängel im Editor als dezente Wellen-Unterstreichung — bare URLs (ohne Markdown-Link-Syntax), leere Link-Texte (`[](url)`), fehlende Alt-Texte (`![](pfad)`) und Wiki-Links, deren Ziel im Suchraum aus 0.8.0 nicht gefunden wird. Hover zeigt lokalisierte Erklärung. Code-Blöcke, Inline-Code, Markdown-Links und Autolinks sind korrekt ausgenommen. Regel 4 (Wiki-Link-Ziel) greift nur, wenn der Backlinks-Index der Pane aktiv ist (Backlinks-Panel mindestens einmal geöffnet).
- **Bearbeiten-Toggle im Ansicht-Menü** (4T-0019, Test-Feedback): `Ansicht → Bearbeiten` mit Häkchen und Accelerator `Strg + E`. Notwendig, weil der bisherige Toolbar-Button im Fokus-Modus ausgeblendet ist; Modus bleibt damit auch dort jederzeit erreichbar.
- **Hilfe-Dialog mit zwei Reitern und gruppierten Funktionen** (4T-0027): Funktionen und Tastenkürzel sind in zwei Tabs getrennt; Funktionen gliedern sich in fünf Gruppen (Datei und Sitzung, Bearbeitung, Ansicht, Navigation, Allgemein). Beim Öffnen ist der Funktionen-Tab aktiv.

### Geändert

- **Editor- und Render-Pane nutzen CSS-Variablen für Schrift** (4T-0018): Neue `:root`-Variablen `--editor-font-family`, `--editor-font-size`, `--render-font-family`, `--render-font-size` ersetzen die vorher fix gesetzten Werte. UI-Elemente (Tabbar, Statusbar, Sidebar, Menü, Dialoge) bleiben auf `--font-ui` und reagieren nicht auf die Schriftart-Einstellung.
- **`Strg + E` ist jetzt Menü-Accelerator** (4T-0019): Der bisherige Renderer-only-Tastenkürzel-Handler entfällt; das Routing läuft über den neuen Menü-Eintrag „Bearbeiten". Funktionsverhalten unverändert.
- **CodeMirror-Tooltips theme-konform** (4T-0020): `.cm-tooltip` erhält explizit theme-konformen Hintergrund, Border und Schatten (vorher war der Default-Hintergrund im Dark-Theme zu hell und der Tooltip-Text schwer lesbar).

### Behoben

- (keine separaten Bug-Fixes in 0.9.0)

### i18n

- Insgesamt rund 65 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT): Statusbar-Zoom-Indikator, Settings-Dialog-Inhalte und Buttons, Menü-Einträge für Bearbeiten / Fokus-Modus / Typewriter-Scroll / Einstellungen, Linter-Regel-Beschreibungen (Kurzform und Tooltip mit Platzhalter `{target}` für Regel 4), Hilfe-Dialog-Tabs (`help.tabFeatures`, `help.tabShortcuts`), Hilfe-Funktionsgruppen (`help.group.*`), neue Feature- und Shortcut-Einträge für die 0.9.0-Funktionen sowie ein neues Tastenlabel `help.key.mouseWheel`.

## [0.8.0] - 2026-05-18 — Strukturnavigation: Folding, Inhaltsverzeichnis und Backlinks

Großes Feature-Release rund um die Strukturnavigation langer Markdown-Dokumente und ihre Vernetzung untereinander. Umgesetzt als Epic 3E-0002 in den Tasks 4T-0013, 4T-0014 und 4T-0015, inklusive Abschluss-Sammeltask 4T-0026.

### Neu

- **Heading- und Block-Folding mit Hierarchie-Spuren im Quellcode** (4T-0013): Eigener Gutter am linken Rand des Quellcode-Pane mit einer 10-px-Spur pro tatsächlich vorkommender Heading-Ebene und Block-Verschachtelungstiefe. Auf der Start-Zeile sitzt ein klickbarer Pfeil (`⌄` offen, `›` zugeklappt); darunter zeigt eine senkrechte Linie die Reichweite der Region. Faltbar sind ATX- und Setext-Überschriften sowie mehrzeilige Listen, Blockquotes, Fenced-Code-Blöcke, HTML-Blöcke und Tabellen. Tastenkürzel `Strg+Umschalt+[` (Einklappen) und `Strg+Umschalt+]` (Entfalten) wirken am Cursor und funktionieren auch bei ausgeblendeter Spalte. Die Spurenanzahl wächst dynamisch mit der Datei mit; die Folding-Region selbst kommt aus dem CodeMirror-Markdown-Sprachpaket.
- **Statusbar-Button und Menüpunkt „Gliederung"** (4T-0013): pro Tab umschaltbar, persistent. Default ist eingeblendet.
- **Inhaltsverzeichnis-Sidebar pro Spalte** (4T-0014): linke Sidebar mit klickbarem Heading-Baum, der die Heading-Stufen 1 bis 6 als Einrückung abbildet. Klick auf den Heading-Text setzt den Cursor in die zugehörige Zeile und entfaltet die Region falls nötig; im Render-Modus scrollt der Render-Pane zum Anker. Klick auf den Falt-Indikator links davon toggelt nur das Folding, ohne den Cursor zu bewegen. Die aktuell sichtbare Sektion wird optisch hervorgehoben — im Edit/Geteilt-Modus folgt sie der Cursor-Zeile, im Render-Modus dem obersten vollständig sichtbaren Heading. Toggle per Statusbar-Button „Inhalt", Menüpunkt `Ansicht → Inhaltsverzeichnis` oder `Strg+Umschalt+O`. Default versteckt; einmal eingeblendet bleibt der Status pro Spalte persistent.
- **Backlinks-Sidebar pro Spalte** (4T-0015): zweite Sektion in der linken Sidebar, zeigt eingehende `[[Wiki-Links]]` und relative Markdown-Links auf die aktive Datei, gruppiert pro Quelldatei mit Zeile, optionalem Anker und Text-Snippet. Suchraum ist der Ordner der aktiven Datei plus zwei zusätzliche Unterordner-Ebenen; Watcher per `chokidar` hält den Index live, neue Links erscheinen innerhalb weniger Sekunden ohne Zutun. Klick auf einen Treffer öffnet die Quelldatei (oder aktiviert den existierenden Tab, wenn schon offen) und setzt den Cursor auf die Trefferzeile. Hard-Cap bei mehr als 2000 Markdown-Dateien oder 50 MB Gesamtgröße im Suchraum, mit lokalisiertem Hinweis. Toggle per Statusbar-Button „Backlinks", Menüpunkt `Ansicht → Backlinks` oder `Strg+Umschalt+B`. Default versteckt, Status pro Spalte persistent.
- **Hilfe-Dialog** (4T-0026): vier neue Funktions-Einträge (Heading-/Block-Folding, Inhaltsverzeichnis, Backlinks, dokument-interne Anker-Links) und vier neue Tastenkürzel (Strg+Umschalt+`[`/`]`/`O`/`B`).

### Geändert

- **Ansicht-Menü neu sortiert** (4T-0014, 4T-0026): Im Block unter den View-Modi steht nun in dieser Reihenfolge Inhaltsverzeichnis, Backlinks, Gliederung, Zeilennummern, Zeilenumbruch. Statusbar-Toggles links der View-Modi folgen derselben Reihenfolge: Inhalt, Backlinks, Gliederung, Nummern, Umbruch.
- **Sidebar-Sichtbarkeit ist gemeinsame Logik** (4T-0014, 4T-0015): Sobald mindestens eine der beiden Sektionen (Inhaltsverzeichnis oder Backlinks) eingeblendet ist, erscheint die Sidebar inklusive Splitter. Sind beide aus, verschwindet die Spalte komplett und der Editor-/Render-Bereich nutzt die volle Spaltenbreite.

### Behoben

- **Anker-Links innerhalb eines Dokuments im Render-Pane** (4T-0014, Seiteneffekt der Einbindung von `markdown-it-anchor`): Links der Form `[Text](#abschnitt)` haben seit Release 0.1 nicht gescrollt, weil markdown-it ohne entsprechendes Plugin keine IDs auf `<h1>..<h6>` setzte. Mit der neuen Plugin-Einbindung bekommen Headings ab 0.8.0 GitHub-kompatible Slug-IDs, und Dokument-interne Anker-Links funktionieren erstmals erwartungsgemäß.

### i18n

- Insgesamt rund 35 neue Keys über die fünf unterstützten Sprachen (DE, EN, FR, ES, IT) — Outline- und Backlinks-Panel-Inhalte, Statusbar-Toggle-Labels, Empty-States, Suchpfad-Tooltips, Hilfe-Dialog-Texte.

## [0.7.1] - 2026-05-18 — Fenster-Position und -Größe beim Schließen des letzten Fensters

Bugfix-Release. Die seit 0.4.0 vorgesehene und in 0.6.0 dokumentierte Funktion „Fenster-Position und -Größe merken" hat seit dem Multi-Window-Umbau in 0.5.0 für den Sonderfall „letztes Fenster" nicht mehr funktioniert: SCG Markdown startete immer auf dem Hauptmonitor mit Default-Größe, unabhängig davon, wo das einzige offene Fenster zuletzt geschlossen wurde. Zusätzlich wurde während des Testens ein zweiter Bug aufgedeckt, der die wiederhergestellte Größe auf Multi-Monitor-Setups mit unterschiedlicher DPI-Skalierung um den Skalierungsfaktor verzerrt hat. Beide behoben als Task 4T-0025.

### Behoben

- **Fenster-Position und -Größe des letzten Fensters gehen nicht mehr verloren** (4T-0025): Das Schließen des letzten offenen Fensters überschrieb den persistierten Sitzungsstand mit einer leeren Liste, weil `persistAllWindows()` im `closed`-Handler über die bereits geleerte `windows`-Map iterierte. Beim nächsten Start hatte die App damit keine Bounds mehr und fiel auf die Default-Position (Hauptmonitor, 1200×800) zurück. Fix: die Bounds werden jetzt bereits im `close`-Handler persistiert, solange das Fenster noch in der Map steht und nicht destroyed ist. Der `closed`-Handler überschreibt nur noch dann, wenn nach dem Entfernen noch andere Fenster übrig sind. `before-quit` persistiert ebenfalls nur, wenn beim Quit noch Fenster offen sind. Multi-Window-Verhalten und Quit-via-Menü-Pfad bleiben unverändert.
- **Korrekte Fenstergröße bei Multi-Monitor mit unterschiedlicher DPI-Skalierung** (4T-0025): Im Test der ersten Fix-Iteration zeigte sich, dass die Position zwar korrekt wiederhergestellt wurde, die Größe aber um den DPI-Skalierungsfaktor des Primärmonitors verzerrt erschien (z.B. um Faktor 0,8 bei einem Primärmonitor auf 125% und einem Sekundärmonitor auf 100%). Ursache: ein bekannter Electron-Bug ([electron/electron #10862](https://github.com/electron/electron/issues/10862), [#16444](https://github.com/electron/electron/issues/16444), [#31999](https://github.com/electron/electron/issues/31999)). Werden `x, y, width, height` direkt im `BrowserWindow`-Konstruktor gesetzt oder beim ersten `setBounds()`-Aufruf vor dem Monitor-Wechsel angewendet, interpretiert Electron sie in DIPs des Primär- bzw. Quellmonitors. Beim Restore auf einen Monitor mit abweichender Skalierung erscheint die Größe entsprechend verzerrt. Fix: Fenster mit Default-Optionen erstellen (landet auf Primärmonitor) und danach `win.setBounds()` **zweimal** hintereinander mit den Ziel-Bounds aufrufen. Der erste Aufruf verschiebt das Fenster auf den Zielmonitor und triggert die DPI-Erkennung, der zweite setzt dann mit der korrekten Ziel-DPI. Verifiziert auf einem Setup mit Primärmonitor 125% und Sekundärmonitor 100%.

## [0.7.0] - 2026-05-17 — Tab in bestehendes Fenster verschieben oder kopieren

Punkt-Release mit einer Verbesserung an der Multi-Window-Bedienung: Tabs lassen sich per Rechtsklick nicht mehr nur in ein neues, sondern auch in ein bestehendes anderes Fenster verschieben oder kopieren. Damit Quell- und Zielfenster eindeutig benennbar bleiben, tragen alle Fenster bei mehr als einem offenen Fenster den Suffix `(Fenster N)` im Titel. Umgesetzt als Task 4T-0012.

### Neu

- **Tab in bestehendes Fenster verschieben oder kopieren** (4T-0012): Rechtsklick auf einen Tab bietet bei mehreren offenen Fenstern jetzt die Untermenüs „Verschieben in" und „Kopieren in" mit den Einträgen „Neues Fenster" und jeweils einem Eintrag pro anderem offenen Fenster (Label `Fenster N`, Tooltip mit Dateinamen des dortigen aktiven Tabs, bei mehreren Tabs zusätzlich `(+N weitere)`). Bei nur einem Fenster bleibt die heutige flache Bedienung mit „In neues Fenster verschieben/kopieren" erhalten. Verschieben übergibt den Tab inklusive ungespeichertem Buffer ans Zielfenster und schließt ihn im Quellfenster ohne weiteren Speichern-Dialog; Kopieren lässt den Quell-Tab unverändert.
- **Keine Duplikate beim Transfer** (4T-0012): Wenn die zu verschiebende Datei im Zielfenster bereits in einer beliebigen Pane geöffnet ist, wird dort der bestehende Tab aktiviert statt ein zweiter angelegt. Beim Verschieben wird der Quell-Tab dennoch geschlossen.
- **Fenstertitel mit `(Fenster N)`-Suffix im Mehr-Fenster-Fall** (4T-0012): Sobald mehr als ein Fenster offen ist, hängt jedes Fenster den Suffix `(Fenster N)` an seinen Titel (auch in der Windows-Taskleiste sichtbar). Die Nummerierung 1..N folgt der Erzeugungsreihenfolge, rückt beim Schließen lückenlos nach und entfällt komplett, sobald nur noch ein Fenster offen ist. Damit sind Quell- und Zielfenster im Tab-Kontextmenü und in der Windows-Taskleiste eindeutig benennbar.

### Geändert

- **Hilfe-Dialog** (4T-0012): Beschreibung der Multi-Window-Funktion in allen fünf Sprachen aktualisiert; erwähnt jetzt das Verschieben/Kopieren in bestehende Fenster und die Bedeutung des Titel-Suffixes.

### i18n

- **9 neue Keys** in allen fünf Sprachen (Deutsch, Englisch, Französisch, Spanisch, Italienisch): `window.title.suffix`, `tab.menu.moveToSubmenu`, `tab.menu.copyToSubmenu`, `tab.menu.targetNewWindow`, `tab.menu.targetWindowLabel`, `tab.menu.tooltipMoreTabsSuffix`, `statusbar.targetWindowGone`, `statusbar.targetFileMissing`. Plus aktualisierter Wert für `help.feature.multiWindow`.

### Hinweise zur Migration

- Keine Migration nötig. Sitzung, Recent Files, Sprache und Auto-Save-Toggle aus 0.6.0 werden unverändert übernommen.

## [0.6.0] - 2026-05-16 — Edit-Modus, Statusbar-Layout und SCG-Markdown-Branding

Das größte Update seit dem ersten Release: Der bisherige reine Reader bekommt einen vollwertigen Editor, eine native Menüleiste, eine Statusbar-Bedienung am unteren Rand und einen neuen Namen. Umgesetzt als Epic 3E-0001 mit 11 Tasks im neuen lokalen PM-System.

### Neu

- **Native Menüleiste mit Datei / Ansicht / Hilfe** (4T-0001): Pro Fenster eine eigene Menüleiste, ALT-Mnemonics, Akzeleratoren rechts neben den Einträgen. Strg+N, Strg+O, Strg+S, Strg+Umschalt+S, Strg+1/2/3, F1. Multi-Window-Synchronisation für Toggle-Einträge.
- **CodeMirror-Editor mit Markdown-Syntax-Highlighting** (4T-0003): CodeMirror 6 ersetzt die bisherige `<pre><code>`-Anzeige. Themes für Light und Dark (GitHub-Palette), Zeilennummern und Umbruch als CodeMirror-Compartments. Edit-Modus pro Tab über den Stift in der Statusbar (Strg+E); Klick im Render-Modus wechselt automatisch in Geteilt und aktiviert den Editor.
- **Speichern und Speichern unter** (4T-0004 Phase 1): Strg+S und Strg+Umschalt+S schreiben den Editor-Inhalt nach UTF-8/LF ohne BOM. Ungespeicherte Änderungen markiert ein `•` im Tab- und Fenstertitel. Schließen-Dialog mit Speichern / Verwerfen / Abbrechen pro Tab und beim Fenster-Schluss. Konflikt-Dialog bei externer Änderung mit Dirty-Buffer (Reload vs. eigene Version behalten). File-Watcher wird beim Eigen-Schreiben kurz stummgeschaltet, um Reload-Loops zu vermeiden.
- **Auto-Save** (4T-0004 Phase 2): Opt-in im Datei-Menü. Speichert 2 Sekunden nach der letzten Eingabe oder bei Fenster-Fokusverlust. Tabs ohne Pfad („Unbenannt") werden nicht automatisch gespeichert. 1-Sekunden-Statusbar-Hinweis „Gespeichert" rechts neben dem Edit-Toggle, Schreibfehler werden 3 Sekunden in Rot angezeigt.
- **Recent Files** (4T-0005): Submenü `Datei → Zuletzt` mit 10 Einträgen (vorher Toolbar-Dropdown). Dateiname als Label, voller Pfad als Tooltip, Disambiguator `(Ordner)` bei gleichnamigen Dateien. Klick öffnet die Datei als neuer Tab im aktiven Fenster (analog zu „Öffnen mit" im Explorer). Verwaiste Pfade werden beim Klick aus der Liste entfernt. Eintrag „Liste löschen" mit Bestätigungsdialog.
- **Datei → Neu** (4T-0006): Strg+N öffnet einen leeren „Unbenannt N"-Tab im aktiven Fenster (View „Geteilt", Edit-Modus aktiv). Counter zählt pro Fenster hoch. Beim ersten Speichern öffnet sich Speichern unter.
- **Suchen und Ersetzen im Edit-Modus** (4T-0007): Strg+H im Edit-Modus öffnet einen zweiten Eingabebereich „Ersetzen durch…" mit zwei Buttons (einzelner Treffer / alle Treffer). Backreferences `$1`, `$2`, … im Regex-Modus. „Alle ersetzen" als einzelne CodeMirror-Transaktion, sodass Strg+Z die Aktion als Ganzes rückgängig macht.
- **Stabile Source-Suche** (4T-0007): Die Suche im Quellcode-Pane nutzt jetzt CodeMirror-Decorations via StateField; Treffer-Highlights überleben CM-Re-Renders. Vorher flackerten sie kurz, weil die `<mark>`-DOM-Manipulation vom CM-Editor überschrieben wurde.

### Geändert

- **Statusbar statt Toolbar** (4T-0002): Die Toolbar oben ist komplett entfernt. Quick-Toggles (Nummern, Umbruch, Quellcode, Geteilt, Gerendert) sitzen jetzt in einer Statusbar am unteren Rand. Rechts in der Statusbar: Edit-Toggle (Stift) und Sprach-Selektor. Die Suchleiste blendet sich weiter über die Statusbar ein, mit zusätzlicher Replace-Zeile im Edit-Modus.
- **Sitzungswiederherstellung als Menü-Toggle** (4T-0008): Die Toolbar-Checkbox „Sitzung wiederherstellen" wandert in das Hilfe-Menü als Toggle-Eintrag mit Häkchen. Multi-Window-synchron via `applyMenuToAllWindows` bei jedem `settings:set` mit Key `restoreSession`.
- **Rebranding auf „SCG Markdown"** (4T-0011): App-Name, `productName`, `appId`, NSIS-Display-Strings, Fenster-Titel, Über-Dialog, Empty-State und Dokumentation überall einheitlich auf „SCG Markdown" / `scg-markdown` / `net.stumm.scg-markdown`. Settings-Migration aus `%APPDATA%/Markdown Viewer/config.json` ins neue `%APPDATA%/SCG Markdown/config.json` läuft einmalig beim ersten Start unter neuem Namen. EXE-Dateinamen sind jetzt `SCG Markdown-<version>-Setup.exe` und `-Portable.exe`. Registry-ProgIDs (`MarkdownViewer.md`) bleiben absichtlich gleich, damit Updates aus 0.5.x-Installationen die Datei-Assoziation sauber überschreiben statt eine zweite ProgID anzulegen.
- **Datei → Neu, Öffnen und Recent-Klick** öffnen jetzt einheitlich einen Tab im aktiven Fenster. Die ursprüngliche Konzept-Idee „Neu/Öffnen erzeugen ein neues Fenster" wurde während der Klärung mit dem Nutzer verworfen, weil sie zu Buffer-Verlust und inkonsistentem Verhalten zu „Öffnen mit" im Explorer geführt hätte.
- **Hilfe-Dialog erweitert** (4T-0009): 6 neue Features (Datei-Neu, Edit-Modus, Speichern, Auto-Save, Suchen-Ersetzen, Menüleiste) und 7 neue Tastenkürzel (Strg+N, Strg+S, Strg+Umschalt+S, Strg+E, Strg+1/2/3, Strg+H, Alt). F1 öffnet jetzt das Hilfe-Modal statt den Über-Dialog. Veraltete Wording-Stellen („in der Toolbar") korrigiert auf den neuen Stand.

### Build & Tooling

- **`releases/`-Ordner als Versions-Archiv** (vorher `dist/`): `dist/` ist reiner Build-Output von electron-builder und enthält nur das aktuelle Build samt Zwischenprodukten (`win-unpacked/`, `builder-debug.yml`, `latest.yml`, aktuelle `*.blockmap`). Die fertigen EXEs werden per `postbuild`-Hook (`scripts/archive-build.js`) automatisch nach `releases/` verschoben, wo sich das Versions-Archiv über die Releases hinweg sammelt. Beide Ordner sind weiter gitignored. Ältere EXEs (v0.1.0 bis v0.5.1) wurden migriert.
- **Alte `.blockmap`-Dateien werden automatisch aufgeräumt**: Das `postbuild`-Script entfernt `.blockmap`-Dateien aus früheren Builds, die nicht mehr zur aktuellen Version gehören.
- **esbuild als Renderer-Bundler** (4T-0003): CodeMirror 6 verlangt einen Bundler, weil bare-imports (`@codemirror/state` etc.) nicht direkt im Renderer auflösbar sind. `scripts/build-renderer.js` bundelt `renderer.js` plus alle Imports zu `renderer.bundle.js`. npm-Scripts `start`, `dev`, `build` und die Build-Targets rufen den Bundler vorab.
- **Lokales PM-System**: Epics und Tasks für 0.6.0 wurden in `Projektmanagement/Aufgaben/` als Markdown-Dateien geführt statt als GitHub-Issues. Begründung und Konventionen in der projekt-lokalen `CLAUDE.md` und `Projektmanagement/README.md`. Die bisherigen GitHub-Issues #1 und #2 bleiben als historische Spur erhalten.

### i18n

- **Insgesamt rund 90 neue i18n-Keys** über alle fünf Sprachen (Deutsch, Englisch, Französisch, Spanisch, Italienisch): Menüleisten-Beschriftungen (`menu.*`), Save-Dialog-Texte (`save.*`), Konflikt-Dialog, Recent-Files-Dialoge (`recent.missingFile*`), Hilfe-Modal-Erweiterungen, Replace-Block in der Suchleiste, Statusbar-Hinweise.
- **Tote Keys entfernt**: `toolbar.recent`, `settings.restoreSession`, `recent.empty`, `about.button`, `help.button`, `help.shortcut.about`.
- **Wert-Korrekturen** für `help.feature.restoreSession` und `help.feature.languages`: Wording angepasst auf den neuen Menü- bzw. Statusbar-Stand.

### Hinweise zur Migration

- **Sitzungswiederherstellung, Recent Files, Sprache und Auto-Save-Toggle** aus einer bestehenden 0.5.x-Installation werden beim ersten Start unter dem neuen Namen automatisch übernommen (Settings-Migration in `migrateSettingsFromPreviousName`). Falls die Migration scheitert (z.B. korrupte JSON-Datei), startet die App mit Default-Settings, der alte Pfad bleibt unangetastet.
- **Datei-Assoziation** aus einer 0.5.x-Setup-Installation muss beim Update der Setup-EXE nicht neu konfiguriert werden, weil die Registry-ProgID gleich bleibt.
- **Ungespeicherte „Unbenannt"-Tabs** werden nicht in der Sitzung persistiert. Beim Quit greift der Schließen-Dialog (Speichern / Verwerfen / Abbrechen).
- **GitHub-Repo umbenannt** von `SCG-Markdown-Viewer` zu `SCG-Markdown`. Bestehende Klone und Issue-Links funktionieren über GitHub-Redirects weiter; eine Neusetzung der Origin-URL über `git remote set-url` ist optional, aber sauberer.

## [0.5.1] - 2026-05-14

### Behoben

- **Datei-Argument beim kalten Start ging verloren** (Issue [#2](https://github.com/MatthiasSCG/SCG-Markdown-Viewer/issues/2)): Ein Doppelklick auf eine `.md`-Datei oder „Öffnen mit" im Explorer öffnete bei geschlossener App zwar das Fenster, zeigte aber die angeklickte Datei nicht an. Ursache: der `file:openExternal`-Listener wurde im Renderer erst in `init()` nach mehreren `await`-Punkten registriert. Wenn der Main-Prozess die Nachricht direkt nach `did-finish-load` schickte, kam sie an, bevor der Listener da war, und Electron-IPC puffert nicht. Bei laufender App (warmer Start) trat das Problem nicht auf, weil `app.on('second-instance', ...)` zu einem Zeitpunkt feuert, an dem der Listener längst registriert ist. Fix: Listener jetzt synchron beim Modul-Laden registrieren, gepufferte Dateien nach Abschluss von `init()` öffnen, analog zum bestehenden `window:initialState`-Pattern aus 0.5.0.

## [0.5.0] - 2026-05-14

### Neu

- **Mehrere Fenster gleichzeitig** (Issue [#1](https://github.com/MatthiasSCG/SCG-Markdown-Viewer/issues/1)): Ein Tab lässt sich per Rechtsklick aus dem laufenden Fenster in ein **neues Fenster auslagern** und auf einen anderen Monitor verschieben. Zwei neue Einträge im Tab-Kontextmenü:
  - **„In neues Fenster verschieben"**: Tab schließt im Ursprung, öffnet sich im neuen Fenster.
  - **„In neues Fenster kopieren"**: Tab bleibt im Ursprung, eine Kopie öffnet sich im neuen Fenster. Beide Tabs sind danach unabhängig, werden aber durch den Datei-Watcher synchron neu geladen, wenn die Datei auf der Platte geändert wird.
  Das neue Fenster startet immer als Single-Pane mit dem ausgelagerten Tab und positioniert sich leicht versetzt (+30 px x/y) zum Ursprungsfenster, damit es nicht direkt überdeckt.
- **Sitzungs-Wiederherstellung für alle Fenster**: Bei aktivierter „Sitzung wiederherstellen"-Option werden beim nächsten Start nicht mehr nur die Tabs des einen Fensters, sondern alle beim Beenden offenen Fenster wieder geöffnet — jeweils an ihrer alten Position, mit ihren Tabs, View-Modi und Zeilennummer-/Umbruch-Einstellungen.
- **Single-Instance-Lock bleibt erhalten**: Neue Fenster entstehen ausschließlich aus der App heraus über das Kontextmenü, nicht durch externes Starten der EXE. Eine zweite Instanz mit Datei-Argument (z.B. „Öffnen mit" im Explorer) reicht ihre Datei jetzt an das **zuletzt fokussierte** Fenster der laufenden App weiter.
- **i18n**: drei neue Keys (`tab.moveToNewWindow`, `tab.copyToNewWindow`, `help.feature.multiWindow`) in allen 5 Sprachen.

### Geändert

- **Settings-Struktur**: Der alte Schlüssel `panes` (Tabs eines einzelnen Fensters) wird durch `windows` ersetzt (Liste pro Fenster: Bounds, Maximiert-Status und Panes). Migration aus dem alten Format läuft beim ersten Start automatisch — der alte `panes`-Stand wird zum ersten Fenster, die alten `windowBounds`/`windowMaximized` werden dessen Bounds. Danach gilt nur noch das neue Format.
- **File-Watcher mit Refcounting**: Wenn dieselbe Datei in mehreren Fenstern offen ist, hält der Watcher sie so lange aktiv, bis sie im letzten Fenster geschlossen wird. Vorher hätte das Schließen in einem Fenster die anderen Fenster vom Auto-Reload abgeschnitten.
- **Theme-Broadcast** an alle Fenster, damit ein Wechsel des Windows-System-Themes in allen offenen Fenstern gleichzeitig ankommt.
- **Persistenz-Logik in den Main-Prozess verlagert**: Der Renderer meldet seinen Pane-Stand per IPC; der Main-Prozess führt alle Fenster-Stände zusammen und schreibt sie atomar in die Settings. So überschreiben sich Fenster nicht gegenseitig.
- **Hilfe-Dialog**: Neuer Funktions-Eintrag „Tabs in ein neues Fenster auslagern" zwischen „Tabs/Spalten" und „Ansichten" eingefügt.
- **Lizenz**: Repository auf [MIT-Lizenz](./LICENSE) umgestellt (vorher „All rights reserved" mit `UNLICENSED`-Marker in `package.json`). `LICENSE`-Datei im Repo-Root ergänzt, `package.json` (`license: "MIT"`) und der Lizenz-Abschnitt im README entsprechend angepasst. Der Code darf damit modifiziert, verbreitet und kommerziell weiterverwendet werden, sofern die ursprüngliche Lizenz- und Copyright-Notice erhalten bleibt. Das App-Icon (Markdown Mark) bleibt unverändert unter CC0 1.0.

### Hinweis zur Wiederherstellung

- Beim **Schließen eines einzelnen Fensters** in einer Multi-Fenster-Sitzung verschwindet dieses Fenster aus dem persistierten Sitzungsstand. Beim nächsten Start kommen nur die Fenster wieder, die beim **Quit** der App noch offen waren. Wenn alle Fenster bis auf eines geschlossen werden und dann die App beendet wird, kommt beim Neustart auch nur ein Fenster.

## [0.4.0] - 2026-05-12

### Neu

- **Fenster-Position und -Größe werden gespeichert**: Beim Beenden merkt sich die App x/y/Breite/Höhe sowie den Maximiert-Status; beim nächsten Start öffnet das Fenster wieder an der gleichen Stelle auf dem gleichen Monitor. Für Setups mit mehreren Bildschirmen praktisch, weil die App vorher immer auf dem Hauptmonitor startete. Gespeichert wird live während des Verschiebens und Größenänderns (debounced, 500 ms) sowie beim Maximieren/Wiederherstellen und beim Schließen — so geht die Position auch nach einem unsauberen Beenden nicht verloren.
- **Sicherheitsnetz für abgesteckte Monitore**: Wenn der gespeicherte Fensterbereich beim nächsten Start auf keinem aktiven Display mehr sichtbar ist (z.B. weil ein Monitor abgesteckt oder die Auflösung geändert wurde), fällt die App auf die Standard-Position auf dem Hauptmonitor zurück, statt offscreen zu öffnen.
- **Vollbild-Status wird bewusst nicht persistiert**: damit die App nie überraschend im Vollbild startet.
- **Hilfe-Dialog** (`?`-Button rechts neben „Über“): Modal mit zwei Sektionen — _Funktionen_ als Bullet-Liste (11 Einträge: Dateien öffnen, Tabs/Spalten, Ansichten, Quellcode-Toggles, Suche, Auto-Reload, Sitzungs-Wiederherstellung, Links/Wiki-Links, Theme, Sprachen, Fenster-Status) und _Tastenkürzel_ als zweispaltige Tabelle mit `<kbd>`-Tasten und Beschreibung. Schließbar per `Esc`, OK-Button oder Klick auf den Hintergrund. Tastenbezeichnungen sind ebenfalls lokalisiert (z.B. „Strg“ / „Ctrl“ / „Maj“ / „Mayús“ / „Maiusc“). Bei Sprachwechsel mit offenem Dialog wird der Inhalt automatisch neu gerendert.
- **i18n**: 30 neue Keys für die Hilfe (`help.button`, `help.title`, `help.featuresTitle`, `help.shortcutsTitle`, 11 `help.feature.*`, 10 `help.shortcut.*`, 7 `help.key.*`) in allen 5 Sprachen.

## [0.3.0] - 2026-05-12

### Neu

- **Suchfunktion** in der Vorschau und im Quelltext (`Strg + F` öffnet die Suchleiste am unteren Fensterrand):
  - **Live-Suche** während des Tippens (mit 150 ms Debounce), keine Eingabebestätigung nötig
  - **Regex-Modus** umschaltbar (`.*`-Button): wenn aus, werden Sonderzeichen wörtlich gesucht; wenn an, gelten reguläre Ausdrücke (Flags `gm`, plus `i` ohne Case-Sensitivity)
  - **Groß-/Kleinschreibung** umschaltbar (`Aa`-Button)
  - Beide Optionen werden über Sitzungen hinweg gespeichert (Settings `searchUseRegex` und `searchCaseSensitive`)
  - **Treffer-Zähler** ("3 / 17") sowie roter "Keine Treffer"-Text bei Leertreffer und "Ungültiger regulärer Ausdruck"-Text mit rotem Eingaberahmen bei invalidem Regex
  - **Such-Bereich-Anzeige** links in der Suchleiste ("Suche im Quelltext" / "Suche in der Vorschau"): die Suche arbeitet im sichtbaren Inhalt — im Modus _Gerendert_ in der Vorschau, in den Modi _Quellcode_ und _Geteilt_ im Quelltext (im Split-Modus ist der Quelltext sichtbar und enthält die Markdown-Syntax wie `###`, die in der gerenderten Vorschau gar nicht mehr vorkommt). Modus-Wechsel aktualisiert die Suche automatisch.
  - **Hilfe-Knopf** (`?`) in der Suchleiste öffnet eine kompakte Regex-Kurzreferenz als Popover über dem Knopf: 14 Einträge (`.`, `*`, `+`, `?`, `^`, `$`, `\d`, `\w`, `\s`, `\b`, `[abc]`, `[^abc]`, `a|b`, `\.`) mit Pattern und Erklärung. Schließbar per erneutem Klick, `Esc` oder Klick außerhalb. Die Erklärungstexte werden in allen 5 Sprachen geliefert.
  - **Treffer-Hervorhebung**: alle Treffer gelb (im Dark-Theme dunkelgelb), aktueller Treffer orange — gerendert via `<mark class="mdv-match">`. Treffer-Limit 5000 pro Suche, um den DOM nicht zu sprengen.
  - **Navigation** zum nächsten/vorherigen Treffer per `F3` / `Umschalt+F3`, `Enter` / `Umschalt+Enter` im Eingabefeld oder den Pfeil-Buttons. Aktueller Treffer wird automatisch zentriert in den Viewport gescrollt.
  - **Startposition** beim Öffnen oder neuer Suche: erster Treffer ab aktueller Scroll-Position (nicht Dokumentanfang).
  - **Schließen** der Suche per `Esc` oder Schließen-Button — entfernt alle Hervorhebungen.
  - **Robust gegen DOM-Wechsel**: bei Tab-Wechsel, View-Modus-Wechsel, Auto-Reload geänderter Dateien und Spalten-Wechsel wird die Suche automatisch im neuen Inhalt wiederholt, der bisherige Treffer-Index wird wenn möglich beibehalten.
- **i18n**: 28 neue Keys in allen 5 Sprachen — Suchleisten-Texte (`search.placeholder`, `search.regexTitle`, `search.caseSensitiveTitle`, `search.prevTitle`, `search.nextTitle`, `search.closeTitle`, `search.noResults`, `search.invalidRegex`, `search.scopeSource`, `search.scopeRendered`, `search.scopeTitle`, `search.helpTitle`) und Regex-Kurzreferenz (`search.regexHelpTitle` plus 14 `search.regexHelp.*`-Einträge).
- **i18n-Erweiterung**: `applyTranslations` unterstützt jetzt zusätzlich `data-i18n-placeholder` für Input-Platzhalter.

### Geändert

- **Toolbar-Reihenfolge**: Die Toggle-Buttons "Umbruch" und "Nummern" stehen jetzt links vom View-Modus-Block (Quellcode/Geteilt/Gerendert) statt rechts daneben. Logisch passender, weil die beiden Toggles sich auf die Quellcode-Ansicht beziehen.

### Behoben

- **`.gitignore` schloss `build/` aus**: Dadurch war `build/installer.nsh` (das Custom-NSIS-Skript für die Datei-Assoziations-Page) nie eingechecked, obwohl es in `package.json` referenziert wurde. Lokale Builds funktionierten zufällig, weil die Datei im Working Directory existierte; ein frischer Klone des Repos hätte aber keinen Installer-Build mehr produziert. `build/` ist jetzt nicht mehr in `.gitignore` und `installer.nsh` ist eingechecked.

### Bekannte Einschränkungen

- Treffer-Hervorhebung bleibt innerhalb eines einzelnen Textknotens — Treffer, die HTML-Knoten überspannen (z.B. eine Phrase, die durch ein `<strong>` mittendrin zerschnitten ist), werden in der Vorschau nicht gefunden. Empfehlung: in diesem Fall in den Quelltext-Modus wechseln.
- Im Quelltext mit aktivierten Zeilennummern wird zeilenweise gesucht (jede Zeile ist ein eigener Span). Multiline-Regex mit `\n` oder zeilenübergreifende Muster funktionieren nur ohne Zeilennummern oder im Vorschau-Modus zuverlässig.

## [0.2.0] - 2026-05-10

### Neu

- **Ansichts-Modus pro Tab**: Quellcode/Geteilt/Gerendert wird ab sofort pro geöffneter Datei gespeichert (vorher: pro Spalte). Beim Wechsel zwischen Tabs bleibt der gewählte Modus jeder Datei erhalten. Default für neu geöffnete Tabs ist "Gerendert".
- **Wortumbruch im Quellcode** (Toolbar-Toggle "Umbruch"): pro Tab umschaltbar. Bei aktiviertem Umbruch werden lange Zeilen automatisch umgebrochen, bei deaktiviertem erscheint ein horizontaler Scrollbalken. Default: aus.
- **Zeilennummern im Quellcode** (Toolbar-Toggle "Nummern"): pro Tab umschaltbar. Default: an.
- Toggle-Buttons werden im Modus "Gerendert" automatisch ausgegraut, da sie dort keinen sichtbaren Effekt haben.
- i18n: vier neue Keys (`source.wrap`, `source.wrapTitle`, `source.numbers`, `source.numbersTitle`) in allen 5 Sprachen.

### Behoben

- **Scroll-Position wurde beim Tab-Wechsel überschrieben**: Wenn du in Tab A gescrollt hattest und zu Tab B wechseltest, sprang Tab B's gespeicherte Position auf 0 zurück. Ursache: das DOM-Update beim Tab-Wechsel löste ein scroll-Event aus, dessen Handler den aktuellen scrollTop (gerade auf 0 zurückgesetzt vom Browser) in den **neuen** aktiven Tab schrieb. Behoben durch eine Suppress-Flag, die das Speichern während des Wechsels und der anschließenden Scroll-Wiederherstellung blockiert (zwei `requestAnimationFrame`-Ticks).

### Geändert

- **Persistenz**: pro Tab werden jetzt zusätzlich `viewMode`, `wrapLines` und `showLineNumbers` gespeichert. Migration aus dem alten Format (Pane-`viewMode`) ist eingebaut: der alte Spalten-Modus wird beim ersten Start auf alle Tabs der Spalte übertragen.

### Geändert

- **App-Icon mit heller Plate** statt transparentem Hintergrund: Auf dunklen System-Themes (Taskleiste, Titelleiste) verschwand das ursprüngliche schwarze Logo mit transparentem M↓-Loch fast vollständig. Das neue Icon hat eine weiße abgerundete Plate mit dezentem grauem Border (`#cccccc`), darauf das original Markdown-Mark in schwarz mit weißem M↓ — auf hellen wie auf dunklen Themes klar erkennbar
- `scripts/build-icon.js` umgebaut: extrahiert den Pfad aus dem Original-SVG und packt ihn in ein dynamisch generiertes Wrapper-SVG mit Plate

### Dokumentation

- **Lizenz-Abschnitt im README** ergänzt: persönliches Projekt unter "Alle Rechte vorbehalten" (kein Open Source); Hinweis darauf, dass das Markdown-Mark-Icon (CC0) nicht unter diese Einschränkung fällt

### Geändert

- **Konsequente deutsche Rechtschreibung** in allen UI-Strings, Doku-Dateien (README, CHANGELOG), Kommentaren und User-sichtbaren Installer-Texten: `ae/oe/ue/ss` durch `ä/ö/ü/ß` ersetzt
- Sprachauswahl-Dropdown zeigt die Sprachnamen jetzt in ihrer eigenen Schreibweise: "Français" und "Español" statt "Francais" / "Espanol"

### Neu

- **Über-Dialog**: Toolbar-Button "Über" (ganz rechts) oder `F1` öffnet ein zentrales Modal mit App-Name, Versionsnummer (dynamisch via `app.getVersion()`), Autor-Hinweis und Icon-Credit. Schließbar via Esc, Klick auf den Hintergrund oder OK-Button. In allen 5 Sprachen lokalisiert
- **Optionale Datei-Assoziation im Installer**: Eine zusätzliche Setup-Seite bietet eine Checkbox (Default: aktiviert), die bei Aktivierung `.md`, `.markdown`, `.mdown`, `.mkd` mit dem Viewer verknüpft. Einträge werden unter `HKCU\Software\Classes\` angelegt (pro Benutzer, kein Admin nötig) und beim Deinstallieren automatisch entfernt — aber nur, wenn sie noch auf unsere ProgID zeigen, damit eine inzwischen anders gesetzte Assoziation eines anderen Programms nicht versehentlich mit ausgehebelt wird
- **NSIS Custom-Skript** (`build/installer.nsh`) per `nsis.include` eingebunden: enthält `customHeader`, `preInit`, `customInstall`, `customUnInstall` und die Custom-Page mit `nsDialogs`-Checkbox
- **Zwei-Spalten-Layout**: Tabs können in eine zweite Spalte rechts daneben verschoben werden, jede Spalte mit eigener Tab-Leiste und unabhängigem Inhalt
  - Tab-Drag-&-Drop: Tabs lassen sich innerhalb einer Tabbar umsortieren oder per Drag in die andere Tabbar verschieben (mit Insert-Indikator: linke/rechte Hälfte des Ziel-Tabs)
  - Rechtsklick-Kontextmenü auf Tabs: "Nach rechts verschieben" / "Nach links verschieben" / "Schließen"
  - Tastenkürzel `Strg + Alt + →` und `Strg + Alt + ←` zum Verschieben
  - Mittlere Maustaste auf einen Tab schließt ihn
  - Drag von externen Dateien in eine bestimmte Spalte öffnet sie dort (per Mauspositions-Erkennung)
  - **Cross-Pane-Lookup** beim Klick auf einen Markdown-Link: ist die Zieldatei in einer **anderen** Spalte bereits offen, springt der Viewer dorthin und aktiviert den existierenden Tab (statt ein Duplikat anzulegen)
  - Jede Spalte hat ihren eigenen View-Modus (Quellcode/Geteilt/Gerendert); Toolbar wirkt auf die aktive Spalte
  - Verschiebbarer Outer-Splitter zwischen den Spalten
  - Spalte kollabiert automatisch zurück, sobald ihr letzter Tab geschlossen wird
  - Sitzungs-Wiederherstellung speichert beide Spalten inklusive ihrer Tabs, des aktiven Tabs und des View-Modus (alter `openTabs`-Schlüssel wird als Fallback weiter gelesen)
  - i18n: neue Keys `tab.moveRight` und `tab.moveLeft` in allen 5 Sprachen
- **Wiki-Links unterstützt** (`[[Ziel]]` und `[[Ziel|Anzeigetext]]`): markdown-it-Plugin im Preload, das die Wiki-Syntax in normale Links umwandelt. `.md`-Endung wird automatisch angehängt, wenn das Ziel keine Endung hat. Klick-Verhalten identisch zu Standard-Markdown-Links

### Behoben

- **Drag-&-Drop-Overlay war beim Start permanent sichtbar** (gestrichelter blauer Rahmen über der ganzen App). Ursache: `.drop-overlay { display: flex; }` überschrieb das HTML5-`hidden`-Attribut. Behoben mit zusätzlicher Regel `.drop-overlay[hidden] { display: none; }`
- **Drag-&-Drop-Handling robuster**: Counter-Pattern für dragenter/dragleave (vermeidet Flackern, wenn der Cursor zwischen Kindelementen wechselt) und Filter auf `dataTransfer.types.includes('Files')`, damit Text-Selektion oder andere Drag-Quellen das Overlay nicht auslösen

### Build & Tooling

- **Windows-Build via electron-builder** mit zwei Targets:
  - **NSIS-Installer** (`Markdown Viewer-0.1.0-Setup.exe`): Setup-Assistent mit wählbarem Installationsverzeichnis, Start-Menü- und Desktop-Verknüpfung, sauberer Uninstaller (Pro-Benutzer-Installation)
  - **Portable** (`Markdown Viewer-0.1.0-Portable.exe`): einzelne EXE ohne Installation
- **App-Icon** basierend auf [Markdown Mark](https://github.com/dcurtis/markdown-mark) (CC0)
  - `scripts/build-icon.js`: rendert das SVG zentriert in einen quadratischen Rahmen und erzeugt `icon.ico` (Multi-Size: 16/24/32/48/64/128/256 px) sowie `icon.png` (256 px)
  - Build-Tools: `sharp` (SVG-zu-PNG-Rendering) und `to-ico` (PNG-Bündelung zu ICO)
- BrowserWindow nutzt das Icon im Entwicklungsmodus
- npm-Scripts: `build`, `build:installer`, `build:portable`, `build:icon`
- `asarUnpack` für `src/i18n/**` — i18n-JSON-Dateien bleiben im Build entpackt, damit `fetch()` aus dem Renderer zuverlässig auf sie zugreifen kann

## [0.1.0] - 2026-05-10

### Neu

- Erste lauffähige Version des Markdown-Viewers
- Electron-Projektstruktur (Main-Prozess, Preload, Renderer)
- **Tab-System**: mehrere Markdown-Dateien gleichzeitig geöffnet
- **Drei Ansichten**: Quellcode, Geteilt (mit verschiebbarem Splitter), Gerendert
- **GitHub Flavored Markdown** via `markdown-it` (Tabellen, Strikethrough, Auto-Links, Task-Listen)
- **Bilder mit relativen Pfaden** werden gegen das Basisdokument aufgelöst und als Data-URI eingebettet
- **Drag & Drop** mehrerer Dateien gleichzeitig (mit `webUtils.getPathForFile` für Electron 32+)
- **Datei-Dialog** über Toolbar oder `Strg + O`
- **"Öffnen mit"** aus dem Windows-Explorer (via `process.argv`)
- **Single-Instance**: zweite Instanz reicht ihre Datei an die laufende weiter
- **Liste zuletzt geöffneter Dateien** (max. 15)
- **Auto-Reload** bei externen Datei-Änderungen via `chokidar`
- Tab-Markierung als "fehlend" (durchgestrichen), wenn Datei gelöscht wird
- **Mehrsprachigkeit**: Deutsch, English, Français, Español, Italiano
  - Initiale Sprache aus Windows-Locale, Fallback Englisch
  - Manueller Wechsel über Toolbar
- **Light/Dark-Theme** gekoppelt an Windows-System-Theme (live umgeschaltet)
- **Klickbare Markdown-Links**:
  - `.md`-Links öffnen die Zieldatei in neuem Tab
  - Bereits offene Datei: zum bestehenden Tab springen statt Duplikat
  - `http(s)://`- und `mailto:`-Links im System-Standardprogramm
  - Anker-Links (`#heading`) scrollen innerhalb des Dokuments
- **Sitzungs-Wiederherstellung** als optionale Einstellung (Default an)
- Persistierung der **gewählten Ansicht**, **Sprache** und **Sitzungs-Setting**
- Tastenkürzel: `Strg + O`, `Strg + W`, `Strg + Tab`, `Strg + Shift + Tab`
- Content-Security-Policy aktiv (kein rohes HTML aus Markdown)
- Read-only: keine Bearbeitungsfunktion (gemäß Konzept)

### Projekt-Setup

- Lokales Git-Repository mit `main`-Branch initialisiert
- `.gitignore`, `.gitattributes` (LF-Zeilenenden), `.editorconfig`
- README.md mit vollständigem Konzept
- package.json mit Dependencies und npm-Scripts (`start`, `dev`)
