# Testkonventionen

Zentrales Konventionen-Dokument für die automatisierten Tests.
Die projekt-lokale `CLAUDE.md` führt nur die Pflicht-Gates und verweist
für alle Details hierher; die übergreifenden
Entwicklungsrichtlinien
führen die Teststrategie ebenfalls nur als Kernsätze mit Verweis auf
dieses Dokument.

## Ordnerstruktur

```
test/
├── unit/        Vitest: Unit- und Snapshot-Tests (Node, Electron-frei)
│   ├── markdown/  Tests der Markdown-Verarbeitung
│   ├── render/    Tests und Snapshots der Render-Pipeline
│   └── renderer/  Tests der Renderer-Module
├── e2e/         Playwright: End-to-End-Tests gegen die echte App
│   ├── helpers/     gemeinsame Helpers (App-Start, Selektoren, Datei-Warten)
│   ├── smoke/       Smoke-Suite über die Kernabläufe
│   ├── funktionen/  Funktions-Specs je Bereich
│   ├── regression/  Regressions-Specs zu behobenen Fehlern
│   └── perf/        Laufzeit-Messungen
└── fixtures/    statisches Test-Material (Unterordner siehe fixtures/README.md)
```

Bewusst `test/` (Singular, klein): der gitignorierte Top-Level-Ordner
`Tests/` (manuelles Test-Material pro Task, eigener Abschnitt unten)
bleibt unberührt; auf case-insensitivem NTFS wäre `tests/` mit `Tests/`
kollidiert.

## Manuelles Test-Material im Ordner `Tests/`

Alle manuell verwendeten Test-Markdown-Dateien liegen im Top-Level-Ordner
`Tests/`. Er ist per `.gitignore` ausgeschlossen, das Material gehört
nicht ins Repositorium und ist clone-lokal. Zur Abgrenzung gegen die
übrigen Top-Level-Ordner ausserhalb der Versionskontrolle: `dist/` und
`releases/` gehören zum Bau und tragen ihre Regeln in der
Release-Strecke,
Kapitel 4; die Regeln der übrigen ignorierten Ordner stehen im
PM-README.
Der Ordner für abgelöstes Material ist hier bewusst nicht namentlich genannt:
Diese Datei geht in den öffentlichen Quellcode-Export, und die Namen der
privaten Arbeitsablagen gehören nicht hinein (Wächter-Befund der Auslieferung
1.108.0).

**Namens-Konvention pro Task:**

- **Eine Test-Datei:** `Tests/test-4t-<id>.md`. Beispiel:
  `Tests/test-4t-0061.md`.
- **Mehrere Test-Dateien:** Unterordner `Tests/test-4t-<id>/` mit den
  zusammengehörigen Dateien. Beispiele im Bestand: `Tests/test-4t-0050/`,
  `Tests/test-4t-0054/`, `Tests/test-4t-0055/`, `Tests/test-4t-0056/`.
- Pro Code-Task entsteht die Datei oder der Unterordner **vor** der
  Test-Aufforderung an den Product Owner. Inhalt: Markdown-Beispiele, die
  die Akzeptanz-Smoke-Tests aus dem Plan abdecken.

**Material für Sicht-Prüfungen muss deutlich sichtbar sein.**
Test-Material ist Teil der Prüf-Schnittstelle. Ein technisch korrektes,
aber praktisch unsichtbares Artefakt (etwa ein 1×1-Pixel-Bild) erzeugt
einen Falsch-Befund und kostet eine Iterationsrunde. Bilder, Farben und
Layout-Beispiele deshalb kräftig und groß genug anlegen, bei Delegation
an Subagenten die Sichtbarkeit ausdrücklich vorgeben. Bei einer Meldung
„wird nicht angezeigt" zuerst automatisiert klären, ob das Produkt oder
das Material die Ursache ist.

### Einen neuen Stand neben der eigenen Arbeit prüfen

**Der Weg ist die zweite Ausprägung.** Sie ist dieselbe Anwendung mit einer
eigenen Identität und deshalb neben der produktiv genutzten lauffähig: eigenes
Nutzerdaten-Verzeichnis, eigener Einzel-Instanz-Lock, eigener Eintrag in der
Taskleiste. Gebaut wird sie mit

```bash
npm run build:pruefstand
```

Das Ergebnis liegt als `EM4me-Pruefstand-<version>-Portable.exe` in `dist/` und
wird per Doppelklick gestartet; eine laufende produktive Anwendung stört das
nicht, und es braucht keine Umgebungsvariable und keine bestimmte Shell.
Erkennbar ist sie an drei Stellen: am Fenstertitel `EM4me (Pruefstand)`, am
blauen statt goldenen Symbol und am eigenen Eintrag der Taskleiste. Innerhalb
der zweiten Ausprägung wirkt der Einzel-Instanz-Schutz unverändert — ein
zweiter Start reicht sein Datei-Argument an das laufende Fenster weiter.

Sie ist **kein Release-Artefakt**: Sie wandert nicht ins Versions-Archiv, wird
nicht ausgeliefert, und ausgeliefert wird ausschließlich die produktive
Ausprägung.

**Zwei Einschränkungen, die zum Weg gehören:**

1. **Die Einrichtung ist zunächst leer.** Keine Einstellungen, keine Bereiche,
   keine wiederhergestellte Sitzung; die Sprache ist die Auslieferungs-Vorgabe
   (Englisch). Wer den eigenen Stand sehen will, richtet ihn einmal ein; das
   Verzeichnis bleibt zwischen zwei Starts erhalten. Die einmalige Übernahme
   der produktiven Einrichtung beim ersten Start ist als eigener Vorgang
   angelegt und noch nicht gebaut.
2. **Die Inhalte sind nicht getrennt.** Bereiche und Dokumente liegen im
   Dateisystem, und die Bereichs-Konfiguration liegt im Bereichs-Ordner
   selbst; beide Instanzen schreiben in dieselben Dateien, wenn sie denselben
   Bereich öffnen. Deshalb gilt die **Bereichs-Kopie** als Arbeitsweise
   (Entscheidung des Product Owners vom 2026-09-01): den zu prüfenden Bereich
   vor dem Start kopieren und in der zweiten Ausprägung allein die Kopie
   binden. Gegen Datenschäden durch einen ungeprüften Stand schützt nichts
   anderes — die Trennung der Ausprägungen erfasst die **Einrichtung**, nicht
   den **Inhalt**.

**Der Weg mit Bordmitteln bleibt daneben bestehen**, denn er trägt den
Release-Smoke-Test: Die installationsfreie Programmdatei startet mit der
Umgebungsvariablen `SCG_TEST_USER_DATA` auf ein eigenes Verzeichnis und
bekommt damit ebenfalls ein eigenes Nutzerdaten-Verzeichnis und einen eigenen
Lock, weil die Umleitung in `src/main/main.js` vor dem Lock steht.

```powershell
$env:SCG_TEST_USER_DATA = "$env:LOCALAPPDATA\EM4me-Pruefstand-Bordmittel"
& "C:\Pfad\zu\EM4me-<version>-Portable.exe"
```

Für **manuelles Arbeiten** ist er der schlechtere der beiden Wege, und zwar
aus einem Grund, den die zweite Ausprägung eigens vermeidet: Dieselbe Variable
setzt die Testlauf-Kennung, das Fenster erscheint deshalb ohne Fokus und wird
nie von selbst in den Vordergrund geholt. Bedienbar ist es vollständig, es
kommt nur nicht nach vorn. Dazu gilt die Variable nur für die Shell, in der
sie gesetzt wurde; ein Doppelklick im Explorer startet ohne sie und landet in
der laufenden produktiven Instanz. Der Smoke-Test der Release-Strecke
(Kapitel 5) benutzt denselben Mechanismus aus Sicht der Sitzung;
Prozess-Messung und Aufräumen stehen dort und werden hier nicht wiederholt.

### Einen blockierten Anzeige-Prozess prüfen: die Blockade-Hilfe

**Zwei Erkennungs-Merkmale, bevor der Verdacht auf das Programm fällt.** Bei
der Test-Iteration zu 1.120.0 blieb der Hinweis «Fenster antwortet nicht» über
zwei Minuten aus, und der Verdacht fiel zuerst auf das Programm; die Ursache
lag in der Entwickler-Konsole, die den eingetippten Befehl `while(true){}`
noch nicht ausgeführt hatte (zweites Return nötig) und eingefügten Code bis
zur einmaligen Eingabe von `allow pasting` verweigert. Ein wirklich
blockierter Anzeige-Prozess **friert die Oberfläche ein**: kein Scrollen,
kein Reiter-Wechsel, kein Tippen im Editor. Und `while(true){}` **liefert nie
ein Ergebnis**, weshalb die Konsole eine laufende und eine nicht ausgeführte
Eingabe gleich darstellt — ein Bildschirmfoto der Konsole unterscheidet die
beiden Fälle nicht. Wer prüft, prüft die Oberfläche, nicht die Konsole.

**Die Blockade-Hilfe setzt die Blockade von außen und liefert einen Beleg**
statt einer Beobachtung (seit dem 2026-09-03, Windows):

```bash
node scripts/blockade-probe.js --exe "releases\EM4me-<version>-Portable.exe" --bestaetigen
```

Ohne `--exe` läuft der Entwicklungs-Stand (`electron .`, Renderer vorher mit
`npm run build:renderer` gebaut). Das Werkzeug startet die Anwendung mit
eigenem Nutzerdaten-Verzeichnis (Profil-Vorbelegung aus der einen Quelle,
deutsche Oberfläche) und `--remote-debugging-port`, setzt über das
Remote-Debugging-Protokoll `while(true){}` im Anzeige-Prozess ohne Zeitlimit
(das die Schleife sonst nach einer Millisekunde abbräche), prüft mit einer
zweiten Auswertung, dass der Prozess wirklich steht, schickt dem Hauptfenster
`WM_CLOSE` (der Weg des X) und wartet auf den Hinweis-Dialog (Windows-Klasse
`#32770` im eigenen Prozessbaum). Mit `--bestaetigen` löst es die erste
Schaltfläche «Trotzdem schließen» über `WM_COMMAND` aus, sonst wartet es auf
den Tester. Der Beleg unter `test-berichte/blockade-probe-<zeitstempel>.json`
trägt die Zeitpunkte Start, Fenster sichtbar, Blockade gesetzt,
Schließen-Befehl, Hinweis-Dialog, Bestätigung, Dialog geschlossen und Fenster
geschlossen; gemessen am 2026-09-03 erscheint der Dialog nach 20,3 bis 20,7 s.
Beendet wird nur der eigene Prozessbaum, nie pauschal nach Prozessname. Was das
Werkzeug am 2026-09-03 zutage brachte — das Fenster bleibt nach «Trotzdem
schließen» stehen —, ist als eigener Vorgang im Pflege-Gefäß der
Fehlerbehebung verortet.

## Linux-Prüfumgebung im Container

Die Prüfung der Linux-Artefakte braucht eine echte Desktop-Sitzung; sie entsteht als
Docker-Container-Paar und ist Wegwerf-Material. **Aufbau, Zugang, Prüf-Material und
Abriss stehen in den Konzept-Dokumenten des Projekts, nicht hier** — die Umgebung ist
Infrastruktur der Plattform-Auslieferung und kein Prüf-Detail dieser Suite.

Was sie für die Prüfung bedeutet: Sie deckt Starter-Eintrag, Datei-Zuordnung, Dialoge und
Fensterverhalten ab. Zwei Dinge sind in ihr mangels dbus und Desktop-Portal **nicht
entscheidbar** und gehören als benannte Grenzen in die Release-Hinweise statt als Befund:
ob die Anwendung die Hell/Dunkel-Vorgabe des Systems übernimmt, und ob eine Erinnerung
zusätzlich als System-Benachrichtigung erscheint. Ebenso wenig deckt sie das Verhalten
anderer Arbeitsumgebungen ab; ein Nachweis gilt für die Konstellation, in der er geführt
wurde.

## Namenskonventionen

- `*.test.js` — Vitest (Unit-/Snapshot-Tests) unter `test/unit/`.
  **ESM-Syntax** (`import`), weil Vitest 4 ESM-only ist; Vitest
  transformiert die Testdateien unabhängig vom CommonJS-Modultyp des
  Projekts. CJS-Module der App lassen sich per Named-Import laden.
- `*.spec.js` — Playwright (E2E) unter `test/e2e/`. CommonJS-Syntax
  (`require`), konsistent mit der App; Playwright lädt CJS nativ.
- Dateiname nennt das Testobjekt bzw. Szenario: `callouts.test.js`,
  `smoke/modi.spec.js`.
- E2E-Szenarien tragen stabile IDs (`SM-01` …) im `describe`-Titel;
  die Abdeckungs-Matrix referenziert diese IDs.

## Kommandos

| Kommando | Zweck |
|---|---|
| `npm test` | Vitest-Lauf (Unit/Snapshot). Pflicht-Gate zentral in der Merge-Queue vor jeder Integration nach `main`, im Umfang der Änderungsklasse; lokal vor dem Abliefern eines Branches gute Praxis. |
| `npm run test:watch` | Vitest-Watch-Modus; `.only` ist hier erlaubt (`--allowOnly`). |
| `npm run test:e2e` | Playwright-E2E-Lauf; baut vorher das Renderer-Bundle (`pretest:e2e`). Umfang pro Task nach Änderungsklasse (Abschnitt „Änderungsklassen und Prüf-Ausschnitt"), Voll-Suite im Release-Sammeltask. |
| `npm run build:renderer` | Baut das Renderer-Bundle. Vorbedingung jedes direkten Playwright-Aufrufs und eigenes Gate für Renderer-Importe (Abschnitt „E2E-Praxis"). |
| `node scripts/test-kennzahlen.js` | Schreibt die Zahl der Prüffälle beider Suiten nach `test/lauf-kennzahlen.json`, ermittelt aus deren Auflistung ohne Ausführung (rund eine Minute). Läuft als letzter Schritt der Release-Vorbereitung mit; von Hand jederzeit möglich, weil kein Test-Lauf vorausgehen muss. |

**Die Kennzahl hängt an keinem Lauf.** Sie entsteht seit 4T-000831 aus der Auflistung beider Werkzeuge (`vitest list`, `playwright test --list`) und nicht mehr aus den Maschinen-Berichten eines Voll-Laufs. Damit ist gleichgültig, welcher Lauf zuletzt gefahren ist und mit welchem Reporter; die JSON-Berichte unter `test-berichte/` dürfen von jedem Teillauf überschrieben werden. Zuvor galt das Gegenteil, und daraus entstand ein Zielkonflikt mit der Wiederhol-Regel: Der isolierte Nachweis eines Flakes zerstörte den Bericht, aus dem die Kennzahl entstehen sollte. **Davon unberührt ist der Beleg eines roten Laufs** (4T-000934): Er hat einen anderen Zweck als die Kennzahl, nämlich die Diagnose eines Fehlschlags, und liegt deshalb als eigene Kopie unter `test-berichte/rot/` statt die Überschreib-Freiheit des Normalfalls einzuschränken (siehe „Belege roter Gate-Läufe" im Abschnitt „Rote Läufe einordnen").

### Drei Regeln zum Umgang mit Läufen in der Release-Strecke

Sie hängen zusammen und sind aus einem Vorfall entstanden, bei dem die E2E-Voll-Suite in einer Release-Strecke zweimal lief, ohne dass der zweite Lauf einen zusätzlichen Nachweis brachte.

1. **Die E2E-Voll-Suite läuft pro Release genau einmal**, als Pflicht-Gate vor Build und Tag (Festlegung des Product Owners vom 2026-07-29). Sie kostet rund eine halbe Stunde; ein zweiter Lauf ohne Erkenntnisgewinn verstößt gegen den Effizienz-Maßstab des Projekts. Ein Lauf allein für die Kennzahl kommt nicht in Betracht und ist seit 4T-000831 auch nicht mehr denkbar: Die Kennzahl entsteht ohne Lauf.
2. **Der Fortschritt eines Laufs im Hintergrund ist an seiner Ausgabe nicht ablesbar.** Wird die Ausgabe in eine Datei geleitet statt auf ein Terminal, puffert Node sie blockweise; bei der Größenordnung einer Voll-Suite bleibt die Datei bis zum Ende leer. Das gilt unabhängig vom Reporter, gemessen an je einem Lauf mit `line` und mit der Konfigurations-Voreinstellung. Wer währenddessen wissen muss, wie es steht, zählt die Unterordner in `test-results/`: Sie entstehen je fehlgeschlagenem Fall. Der Rückschluss auf die Zahl der bereits gelaufenen Fälle ist damit nicht möglich, wohl aber die Antwort auf die Frage, die in der Praxis zählt — ob der Lauf gerade reihenweise scheitert. Dasselbe gilt für den Gate-Weg: `node scripts/gate-lauf.js test` puffert vollständig, die Ausgabe-Datei bleibt bis zum Schluss bei null Byte, und genau das sieht aus wie ein entgleister Lauf. **Was stattdessen trägt, ist die Prozess-Liste:** `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` zeigt den Gate-Lauf, den `npm test`-Wrapper und die Vitest-Worker mit ihrer Startzeit; laufen Worker, läuft die Suite. Und das Budget dazu: Eine volle Suite braucht auf SC-026 gut sieben Minuten, ein Budget von fünf Minuten ist zu knapp und erzeugt eine Fehl-Meldung (Befund vom 2026-08-28, aus dem Koordinations-Register hierher verankert).
3. **Ein laufender Suite-Lauf wird nicht per Prozess-Abbruch gestoppt.** Er läuft durch, oder der Abbruch wird verifiziert, bevor er als erledigt gemeldet wird. Ein halber Abbruch ist der schlechteste Zustand: Die volle Laufzeit fällt trotzdem an, und das Beenden der Prozesse mitten im Lauf erzeugt rote Fälle, die es ohne den Eingriff nicht gäbe. Sie sind von echten Befunden nicht zu unterscheiden und kosten die nächste Diagnose-Runde.

## Stabilitätsregeln

1. **Tests sind unabhängig und deterministisch.** Kein Test hängt von
   Reihenfolge oder Hinterlassenschaften anderer Tests ab.
2. **Keine harten Sleeps.** Playwright-Auto-Waiting bzw. `expect`-Polling
   verwenden; bei debounce-abhängigen Abläufen auf das sichtbare Ergebnis
   warten, nicht auf Timer.
3. **Nie das echte Nutzer-Profil anfassen.** E2E-Läufe starten die App
   immer über den Helper `test/e2e/helpers/app.js`, der ein frisches
   Temp-Profil setzt (`SCG_TEST_USER_DATA`, Hook in `src/main/main.js`).
   Der Hook wirkt vor dem Single-Instance-Lock, damit Test-Instanzen
   nicht mit einer laufenden echten App kollidieren.
4. **Keine Produktivdaten.** Fixtures liegen unter `test/fixtures/`,
   veränderliche Arbeitskopien in Temp-Verzeichnissen.
5. **`.only`-Schutz.** `allowOnly: false` (Vitest) und `forbidOnly: true`
   (Playwright) lassen Läufe mit vergessenen Fokus-Markern fehlschlagen,
   damit kein Gate-Lauf mit einer Teil-Suite grün wird.
6. **Ein Worker für E2E.** Electron-Instanzen werden nicht parallelisiert
   (`workers: 1`); `retries: 0` macht Flakiness sichtbar statt sie zu
   maskieren. Stabilitätskriterium: drei Läufe in Folge grün.
7. **Diagnose-Artefakte nur im Fehlerfall.** Screenshot und Trace landen
   unter `test-results/` (gitignored); im autonomen Umsetzungs-Modus sind
   sie das primäre Diagnose-Mittel.
8. **Zählende und listende Specs bei neuen Bereichen, Sektionen und
   Panels nachziehen.** Mehrere Specs prüfen den vollständigen Bestand
   und werden rot, bis sie mitgewachsen sind. Alle betroffenen Stellen
   gehören in den Umsetzungs-Commit (Zählwert, ID-Liste, Kommentar mit
   Task-ID), sonst kippt die Voll-Suite erst im Release-Gate:
   - **Neuer Einstellungs-Bereich:** ES-05
     (`test/e2e/funktionen/einstellungen-seite.spec.js`, Bereichs-
     navigation) und der Unit-Test der Bereichs-Registry
     (`test/unit/renderer/settings-page.test.js`, Reihenfolge der
     Bereichs-IDs).
   - **Neue bereichsgebundene Sektion** (`group: 'area'`, siehe
     Oberflächen-Leitlinien der Entwicklungsrichtlinien): ES-13 zählt
     die Sektionen der Navigations-Gruppe „Aktueller Bereich".
   - **Neues Sidebar-Panel:** vier E2E-Fälle, zusätzlich zum
     Paritäts-Wächter `test/unit/panel-access.test.js`. SL-01
     (`test/e2e/funktionen/sidebar-layout.spec.js`, Default-Reihenfolge;
     neue Panels landen als eigener Slot am Ende) und ES-10 (Anzahl der
     Panel-Zeilen im Einstellungs-Bereich Sidebar), dazu SV-03
     (`test/e2e/funktionen/sidebar-varianten.spec.js`, Panel-Gesamtzahl
     nach dem Normalisieren einer alten Variante, in `count` und
     `unique`) und FA-06
     (`test/e2e/funktionen/bearbeitung-und-ansicht.spec.js`,
     Breiten-Grenze der zentrierten Schaltergruppe). Die Rechnung hinter
     FA-06 in einem Satz: Ein zusätzlicher Statusleisten-Knopf
     verbreitert die linke Zone um 32 Pixel (28 Pixel Knopf plus 4 Pixel
     Abstand), und weil die Seitenspalten des Statusleisten-Rasters nie
     unter ihren Inhalt schrumpfen, steigt die Fensterbreite, ab der die
     Gruppe mittig steht, um das Doppelte, also um 64 Pixel je Knopf;
     das Prüf-Fenster des Falls muss deshalb mitwachsen. SV-03 und FA-06
     sind am 2026-09-17 ergänzt (4T-001774), nachdem beide in einer
     Release-Abnahme rot wurden und von dieser Liste bis dahin nicht
     erfasst waren. Zwei Anlage-Fallen dazu: Die Section-Klasse des Panels muss exakt
     `sidebar-<Panel-ID>` heißen, weil SL-01 die Panel-ID aus ihr
     ableitet; und ein Panel ohne Dokument-Bezug darf nicht an
     `isAllEmpty()` hängen, sonst ist es im Empty-State nicht
     einblendbar.
9. **Datums-Bezug injizieren.** Tests und Fixtures, die „heute" berühren
   (Überfälligkeit, Score, Datum-Komfort-Filter), arbeiten mit
   injiziertem Referenz-Datum bzw. stabilen Fixture-Daten (weit
   vergangen wie 2020, weit zukünftig wie 2099), nie mit dem
   Kalendertag des Laufs.
10. **Ein teurer Prüf-Fall trägt ein Zeitlimit, und dessen Wert steht
    zentral** (4T-000944). Teuer ist ein Fall aus drei belegten Gründen:
    Er **startet einen realen Prozess** (git, node, npm), er **liest den
    vollen Repositoriums-Bestand**, oder er **baut ein Erzeugnis**
    komplett (Webseite, Handbuch). Alle drei sprengen das
    voreingestellte Limit von 5 Sekunden, sobald die Maschine unter Last
    steht; ein grüner Lauf auf einer ruhigen Maschine ist dann Zufall
    und kein Nachweis. Gemessen liegt der teuerste Fall von
    `quellcode-export` schon **isoliert** bei 6,0 Sekunden, der von
    `verlauf-erzeugen` bei 4,2.

    Die Werte stehen in [zeitlimits.js](zeitlimits.js), je Auslöser unter
    einem sprechenden Namen (`PROZESS_ZEITLIMIT`, `BESTAND_ZEITLIMIT`,
    `BAU_ZEITLIMIT`, `SCHWER_ZEITLIMIT`, `VOLLBAU_ZEITLIMIT`,
    `AUFRAEUM_ZEITLIMIT`); eine nackte Zahl an einem Fall gibt es nicht
    mehr. **Eine Prüfdatei, die reale Prozesse startet, setzt ihr Limit
    datei-weit** über `vi.setConfig({ testTimeout: …, hookTimeout: … })`
    am Dateikopf, nicht je Fall: Ein neu angelegter Fall erbt es dann,
    statt es zu vergessen, und genau daran ist die punktuelle Pflege
    zwischen dem 2026-08-06 und dem 2026-08-18 viermal gescheitert. Wo
    nur einzelne Fälle teuer sind, etwa in einer Datei mit einem
    bestandslesenden unter siebzig günstigen, bleibt das Limit am Fall.

    Durchgesetzt wird das von `scripts/lint-test-zeitlimits.js`
    (eingebunden über `test-zeitlimits.test.js` und damit in `npm test`):
    Er meldet eine prozess-startende Prüfdatei ohne datei-weites Limit,
    jede nackte Zahl und jede dateilokal definierte Konstante. Das
    bestandslesende Muster erkennt er bewusst nicht, weil es kein
    sicheres Merkmal im Quelltext hat; dort trägt der Name der Konstante
    die Aussage. Das globale Zeitlimit der Suite (`vitest.config.mjs`)
    bleibt bewusst niedrig, damit ein echter Hänger nicht in einem
    pauschal hohen Wert untergeht.
11. **Automatik-Verhalten am realen minimalen Nutzungspfad prüfen.**
    Soll etwas „automatisch beim X" geschehen, löst der Test genau X
    aus und nichts weiter. Stellt er zusätzlich den internen Auslöser
    her (ein Panel öffnen, das den Index ohnehin anfordert), grünt er,
    obwohl das Auto-Verhalten fehlt. Die Lücke findet dann erst der
    manuelle Test. Interne Trigger kommen nur dazu, wenn sie selbst
    Teil des geprüften Pfads sind, und dann in einem eigenen Schritt.
12. **Wer nach dem Warten liest, wartet auf den Inhalt.** Eine Datei
    entsteht vor ihrem Inhalt. Eine Warte-Bedingung auf `fs.existsSync`
    endet im Moment der Anlage; das folgende Lesen fällt unter Last in
    die Lücke und liefert einen leeren oder halben Stand. Bei Text ist
    das ein Vergleichs-Fehler, bei JSON ein Parse-Abbruch, und beides
    tritt nur lastabhängig auf, also als Flake im Voll-Lauf. Die
    Warte-Bedingung liefert deshalb den Inhalt selbst; die Helfer
    `warteAufText` und `warteAufJson` in
    [e2e/helpers/dateien.js](e2e/helpers/dateien.js) kapseln das
    einschließlich der null-Rückgabe für die Poll-Bedingung. Eine
    Existenz-Prüfung allein bleibt richtig, wenn der Test die Datei
    danach nicht liest oder gerade ihre Unverändertheit prüft.

    **Eine Rückmeldung der Oberfläche belegt nicht den Abschluss einer
    Kaskade** (4T-000874). Wirkt eine Aktion auf mehrere Dateien, meldet
    der Main jede einzeln (`file:renamed`), und die Oberfläche zieht
    schon beim ersten Ereignis nach: Der Reiter-Titel steht, während die
    Nachfahren noch wandern. Wer danach mit `expect(fs.existsSync(…))`
    liest statt mit `expect.poll`, prüft einen Zwischenstand. Das
    Zeitfenster ist klein und der Fehler damit latent — er kippte erst,
    als 4T-000847 die Umbenennen-Strecke um den Kapitel-Baum-Nachzug
    erweiterte und jede Einzel-Umbenennung dadurch länger brauchte.
    **Merkregel:** Warte auf das, was die Aktion bewirken soll, nicht
    auf das erste Zeichen, dass sie begonnen hat.

    **Ein Poll ist keine Zustands-Bedingung, nur weil er keine Pause ist**
    (4T-001496, Register-Klasse L10 in ihrer Ausprägung U4). Der Vorfall vom
    2026-09-06 hat diese Regel **dem Buchstaben nach befolgt** — kein Timeout,
    kein Zeitlimit, sondern ein Poll — und ist trotzdem gerissen: Die Bedingung
    brach ab, sobald die Vorschlagsliste **überhaupt** etwas zeigte, und prüfte
    den Inhalt erst danach. Der geschriebene Stand erreicht den Hauptprozess
    verzögert; unter Last lag der erste Treffer noch davor, und der Fall maß den
    Stand von vorher. Er war dreimal isoliert grün und fiel im
    Epic-Abschluss-Lauf neben fünf weiteren Specs durch. **Unzulässig ist
    deshalb nicht nur die Zeit, sondern auch das Ereignis:** Gewartet wird auf
    den erwarteten Zustand, nie auf dessen Vorboten. «Die Liste zeigt etwas» ist
    ein Vorbote, «die Liste zeigt das Erwartete» ist der Zustand.

    **Und der Zustand ist die Bedienbarkeit, nicht das Vorhandensein**
    (4T-001555, gemeinsam mit dem Fall oben geschärft; Register-Klasse `L11`).
    Beide Vorgänge zeigen auf dieselbe unscharfe Kante dieser Regel: Dort war
    das Ereignis der Vorbote des Zustands, hier ist es das Aufgelöst-Sein eines
    Elements. Vier Vorfälle in vier Wochen (`VL-09` dreimal, `BP-05` einmal)
    liefen in ihr 30-Sekunden-Limit, **obwohl der Locator aufgelöst hatte** —
    Playwright benannte das gefundene Element ausdrücklich und wartete danach
    vergeblich auf die Klick- beziehungsweise Eingabe-Bereitschaft. Keine
    inhaltliche Erwartung war verletzt; die Fälle scheiterten vor ihrer
    eigentlichen Prüfung, und isoliert waren sie jedes Mal sofort grün.

    **Was daraus folgt, ist eng und nicht flächig.** Playwright wartet bei
    `click` und `fill` von sich aus auf Bedienbarkeit; eine fehlende
    ausdrückliche Bedingung ist der **Normalfall** und kein Mangel. Gemessen am
    2026-09-08: 547 von 1284 Element-Zugriffen der Suite haben keine, verteilt
    auf 89 von 123 Prüfdateien. Wer daraus eine flächige Maßnahme ableitet,
    ändert drei Viertel der Suite, um vier belegte Stellen zu treffen.
    Entschieden ist deshalb (Product Owner, 2026-09-08) der enge Weg: An den
    Stellen, an denen das eingebaute Warten **belegt** gerissen ist, wird
    bedient, bis die Wirkung eintritt — `bedieneBis` und `fuelleBis` in
    [e2e/helpers/eingabe.js](e2e/helpers/eingabe.js), dieselbe Form wie
    `pressUntil` in Regel 13. An allen anderen Stellen nicht.

    **Die Wiedervorlage ist benannt:** Tritt dieselbe Klasse ein drittes Mal an
    einer **neuen** Stelle auf, ist das der Anlass, am Gegenstand zu suchen —
    also in der Anwendung zu prüfen, ob ein Oberflächen-Teil seine
    Bedienbarkeit zu spät meldet. Das wäre die einzige Richtung, die auch dem
    Anwender nützt.

    **Wo der Zustand mehr als eine Größe hat, werden alle geprüft.** Der Helfer
    `test/e2e/helpers/suche.js` wartet auf die Trefferliste der Suche und liest
    dafür zwei Seiten: die Status-Zeile, die die abgeschlossene Suche meldet, und
    die Zähler der aufgeklappten Gruppen, die sagen, wie viele Einträge sichtbar
    sein müssen. Die Status-Zahl allein genügt **nicht** — eine eingeklappte
    Gruppe zeigt ihre Treffer nicht, und der Vergleich lief prompt ins Zeitlimit,
    während die Suche längst fertig war (gemessen am 2026-09-07).

    **Kein Wächter, und das ist gemessen begründet.** Zwei Erhebungen über den
    E2E-Bestand am 2026-09-07: 493 Poll-Bedingungen, davon 56 auf Nicht-Leere und
    26 mit nachfolgender Inhaltsprüfung — von Hand beurteilt blieben **zwei**
    echte Fundstellen. Die übrigen sind Tasten-Retries («drücke Strg+, bis die
    Seite offen ist»), bei denen die Nicht-Leere der Zustand **ist**. Ein
    Wächter mit dieser Trefferquote würde umgangen statt beachtet (die Erfahrung
    aus 4T-001084); beide Fundstellen sind auf den gemeinsamen Helfer
    umgestellt.

    **Eine feste Pause ist nie die Bedingung, auf die man wartet**
    (4T-001086). Das gilt auch für Zwischenschritte, die nur aufräumen
    sollen: `keyboard.press('Escape')` gefolgt von
    `waitForTimeout(300)` sieht harmlos aus, ist aber eine geratene
    Zahl. Reicht sie unter Last nicht, steht das Kontextmenü beim
    nächsten Rechtsklick noch offen, der Klick trifft **das Menü statt
    die Zeile**, und ein Poll, der danach zählt, bekommt dauerhaft den
    alten Stand — er läuft in sein Zeitlimit, obwohl die geprüfte
    Wirkung längst eingetreten ist. Richtig ist die Zustands-Bedingung:
    `await expect(page.locator('#context-menu')).toBeHidden()` (Muster
    aus `tab-gruppen.spec.js` und `4t-0315.spec.js`).

    Das ist der **dritte** Rennfall an derselben Stelle nach 4T-000875
    (zweiter Rechtsklick traf das offene Menü) und 4T-000874
    (Escape-Vorlauf ergänzt), und deshalb steht er hier als Regel statt
    als Einzelfix. Belegt am 2026-08-19 durch Nachstellen: Unter einer
    zweiten, parallel laufenden Electron-Instanz war der Fall zwei von
    drei Läufen rot; mit der Zustands-Bedingung drei von drei grün, bei
    unverändert anliegender Last (Spec-Laufzeit 45 Prozent über der
    lastfreien Messung). **Diagnose-Hinweis:** Ein Fall, der isoliert
    grün und im Voll-Lauf rot ist, muss kein Flake sein — «isoliert»
    heißt oft nur «diese Spec allein», nicht «ohne Fremdlast». Wer die
    Last nachstellt, unterscheidet beides.

    **Ein Lastversuch setzt eine ruhige Maschine voraus** (4T-001476). Er
    stellt die gesuchte Nebenläufigkeit **zusätzlich** her; liegt schon
    Fremdlast an, misst er beides zugleich und trennt nichts mehr. Die
    Folge für die Aussagekraft ist beidseitig und wiegt schwerer als die
    Laufzeit: Ein **roter** Lauf belegt dann nichts Bestimmtes — er kann
    den gesuchten Flake zeigen, die Zeitgrenze der überlasteten Maschine
    oder beides —, und ein **grüner** belegt wenig, weil niemand weiß,
    wieviel Last überhaupt anlag. Beide Fälle sehen aus wie eine
    gelungene Messung; das ist der eigentliche Schaden.

    Belegt am 2026-09-05 (`4T-001410`): drei Lastversuche in Folge neben
    zwei arbeitenden Nachbar-Sitzungen desselben Rechners — 2,2 Minuten
    grün, 5,2 Minuten dreifach rot, 3,3 Minuten zweifach rot. Rot wurden
    Fälle **ohne** Bezug zum untersuchten Fehlerbild, und der untersuchte
    Fall selbst scheiterte an einem Test-Timeout statt an seiner
    Zusicherung. Auf der freien Maschine war er seriell 18 von 18 grün.

    **Der Handgriff davor:** Der Gate-Weg (`node scripts/gate-lauf.js …`)
    meldet vor dem ersten Gate, wenn fremde Electron-Instanzen laufen.
    Die Meldung ist eine Warnung und keine Sperre — wer die Fremdlast
    absichtlich herstellt, tut genau das, wozu diese Regel auffordert.
13. **Ein Tastendruck wird wiederholt, bis seine Wirkung eintritt.** Ein
    einzelner `keyboard.press` kann ins Leere gehen, weil das Fenster
    den Fokus noch nicht hat oder der Renderer seinen Listener erst
    anhängt. Wer danach nur auf die Wirkung wartet, läuft in die
    Zeitgrenze und meldet einen roten Fall, der isoliert verlässlich
    grün ist — die teuerste Sorte Flake, weil sie erst im Voll-Lauf vor
    einem Release auffällt und dort einen isolierten Nachlauf samt
    Einzelfall-Bewertung erzwingt. Die Helfer `pressUntil` und
    `pressUntilVisible` in [e2e/helpers/eingabe.js](e2e/helpers/eingabe.js)
    drücken, bis die Bedingung erfüllt ist. Zeigt sich die Wirkung als
    Klasse statt als neues Element, wird sie in den Locator gezogen
    (`page.locator('#btn.is-marked')`). **Voraussetzung ist ein
    idempotentes Kommando**: Ein zweiter Druck darf den ersten nicht
    zurücknehmen und nichts doppeln; das ist am Kommando zu prüfen,
    bevor der Helfer dort eingesetzt wird. Für einen Umschalter gilt die
    Regel nicht — dort bleibt der einzelne Druck richtig, und die
    Stabilität muss anders hergestellt werden.
14. **Der Prüffall eines privaten Werkzeugs braucht zwei Zuordnungen.**
    Maßgeblich ist nicht, wo das Werkzeug liegt, sondern ob seine
    Dateien veröffentlicht werden: Sobald ein Test eine Datei **lädt
    oder liest**, die die Positivliste des Exports nicht freigibt,
    gehört er erstens in die `testAusnahmen` von
    `scripts/quellcode-export-liste.json`, weil `test/` als ganzer
    Ordner veröffentlicht wird und der Prüffall im Ziel ohne seine
    Datei ankäme — die öffentliche Suite würde erst beim nächsten
    Quellcode-Export rot. Zweitens gehört er in den Prüf-Ausschnitt
    seiner Änderungsklasse in `scripts/aenderungsklassen.json` oder,
    wenn ihm keine zuzuordnen ist, in deren Ausnahme-Liste; der
    Vollständigkeits-Meta-Test bricht sonst im Queue-Gate ab. Beide
    Einträge gehören in den Commit, der die Testdatei anlegt.

    Zwei belegte Fälle: ein Werkzeug unter `scripts/`, das der Test
    als Modul lädt (der Regelfall, aus dem die Regel entstand), und der
    Wächter über die Dashboard-Sicht, der `Projektmanagement/dashboard.html`
    liest — ein privates Werkzeug außerhalb von `scripts/`, dauerhaft
    über die Sperrliste von der Veröffentlichung ausgenommen. Beide
    findet die Prüfung in `quellcode-export.test.js`; sie erkennt
    geladene Module und genannte Pfade des Bestands, nicht aber einen
    Pfad, der erst zur Laufzeit entsteht. Wer so einen baut, trägt die
    Zuordnung selbst nach.
15. **Ab zwei Fenstern wird das Ziel-Fenster benannt, nicht abgezählt.**
    `BrowserWindow.getAllWindows()` liefert **nicht** die
    Erzeugungsreihenfolge, sondern die Z-Order: Im Diagnose-Lauf zu
    4T-000873 stand das zuletzt geöffnete Fenster an Position 0. Der
    verbreitete Helfer `getAllWindows()[0]` trifft damit ab zwei
    Fenstern das falsche Ziel (dort unkritisch, solange eine Spec nur
    ein Fenster öffnet). Wer in einer Mehr-Fenster-Spec etwas an ein
    bestimmtes Fenster schickt, wählt es über ein Merkmal aus — etwa
    `getAllWindows().find((w) => w.getTitle().includes(teil))`, siehe
    `sendeAnFenster` in `funktionen/regal.spec.js`.
16. **Der Ansichts-Modus ist Teil des Szenarios, nicht seine Kulisse.**
    Betrifft ein gemeldeter Befund eine Funktion, die es in mehreren
    Ansichts-Modi gibt (Quelltext, Geteilt, Live, Gerendert), fährt der
    Regressionstest **alle** einschlägigen Modi und nicht den einen, den
    die Session zufällig gewählt hat. Anlass ist B-10 (4T-000904): Ein
    Fix schloss den Weg über den verzögerten Such-Neuaufbau, während
    dieselbe Doc-Änderung im geteilten Modus zusätzlich über die
    Render-Pipeline der Vorschau lief. Der Test prüfte nur den
    Quelltext-Modus, war grün, und der Product Owner sah den Fehler in
    der Test-Iteration unverändert. Nennt die Meldung den Modus nicht,
    ist das kein Freibrief für eine stille Wahl: dann gilt die
    Vollständigkeit, oder der Modus wird erfragt.

17. **Ein Selektor ohne Spalten-Qualifizierung misst die erste Spalte.**
    In Zwei-Spalten-Szenarien immer über `SEL.pane(idx)` qualifizieren;
    ein unqualifizierter Treffer sieht die zweite Spalte nie und misst
    still die falsche. Im Probelauf zu 4T-000899 kostete das beinahe eine
    PO-Entscheidungsrunde über ein Verhalten, das es nicht gibt: Der
    vermeintliche Befund war ein Spalten-Verwechsler des Tests. Gilt
    auch für Panel-Sichtbarkeit, die an Schlüsseln **je Spalte** hängt
    (`visibleColumn0`/`visibleColumn1`).

18. **Eine eigene `settings`-Vorbelegung in `launchApp` ersetzt die
    Standard-Vorbelegung vollständig.** Die Sprach-Festlegung aus
    4T-000751 gehört dann mit hinein, sonst startet die App englisch und
    sprachabhängige Erwartungen brechen (Fund aus 4T-000899, Stufe A).
    Nicht ersetzt wird der **Zustands-Anteil** — die Erststart-Merker wie
    `tourSeen`: Er kommt seit dem 2026-09-03 für jedes App-startende
    Werkzeug aus der einen Quelle `scripts/profil-vorbelegung.js` und liegt
    unter jeder Vorbelegung (allein `settings: null` bleibt der echte
    Erststart). Wer ein Konstrukt mit Erststart-Wirkung baut, ergänzt den
    Merker dort und nirgends sonst; der Wächter
    `test/unit/profil-vorbelegung.test.js` meldet jede Stelle, die die
    Anwendung mit `SCG_TEST_USER_DATA` startet, ohne das Modul zu laden
    (Anlass: Auslieferung 1.114.0, neun von neun Motiven am Tour-Overlay).

19. **Brückenfunktionen am Modulkopf brauchen die gemeinsame
    Attrappe.** Wer einen Preload-Zugriff aus einer Funktion an den
    Modulkopf zieht, ergänzt `test/unit/renderer/api-stub.js`; sonst
    brechen Unit-Dateien schon am Import statt an einer Erwartung
    (Fund aus 4T-000635: drei Test-Dateien auf einmal).

20. **Positions-Regeln von Tab-Gruppen an Gruppen mit mindestens zwei
    Mitgliedern prüfen.** `insertTabNextTo`/`moveTabNextTo`
    (`tab-groups.js`) setzen `tab.groupId` immer aus dem
    Herkunfts-Reiter; wer eine Positions-Regel testet, stellt die
    Herkunft bewusst **vor** ein weiteres Gruppen-Mitglied (Muster
    TG-13), weil Ein-Element-Gruppen Positions-Fehler maskieren
    (aus 3E-000130/v0.87.0).

21. **Was eine Zusicherung abschaltet, um ihren Fall herzustellen, gehört
    als eigener Fall wieder herein.** Schaltet ein Test eine
    Umgebungs-Eigenschaft ab, damit die geprüfte Lage überhaupt
    entsteht, deckt er genau den Zustand nicht ab, in dem diese
    Eigenschaft wirkt — und das ist im Alltag oft der häufigere. Anlass
    ist 4T-000945: Alle Fälle des Konflikt-Schutzes schalteten die
    Datei-Beobachtung stumm, weil sie sonst den Nachlade-Dialog
    ausgelöst hätte und der Speicher-Weg nie erreicht worden wäre. Der
    Product Owner testete den lokalen Fall mit meldender Beobachtung,
    also den Weg, über den die Zusage der Story im Alltag meistens
    läuft, und traf dort auf eine Lücke, die keine Zusicherung berührte.
    Die Regel gilt für jeden Schalter dieser Art: Beobachtung,
    Netzwerk-Erreichbarkeit, Erweiterungs-Zustand, Berechtigungen.

18. **Eine Zusicherung geht den Weg des Anwenders, nicht den der
    Schicht.** Wo eine Funktion über mehrere Stationen läuft (Datenquelle
    → Auslöser → Anzeige), prüft ein Fall, der eine Station unmittelbar
    aufruft, genau die Strecken nicht, auf denen der Fehler meistens
    sitzt. Zweimal am 2026-08-10 belegt: Bei 4T-000945 wies ein Fall nach,
    dass die Sicherung **entsteht**, nicht dass der Anwender an sie
    **herankommt**; bei 4T-000950 rief ein Fall die Tag-Schicht unmittelbar
    auf und war grün, während das Panel beim Product Owner leer blieb,
    weil niemand es neu zeichnen ließ. In beiden Fällen war die
    Datenquelle bereits richtig und die Zusicherung trotzdem wertlos.
    Praktisch heißt das: Panel-Inhalt statt Rückgabewert, sichtbarer
    Dialog statt Handler-Aufruf, geöffnete Seite statt erzeugtem Text.
    Ein Fall auf Schicht-Ebene ist als **Ergänzung** nützlich, nie als
    Ersatz.
19. **Ein Negativbeispiel darf nie ein Name sein, der einmal gültig
    werden kann.** Wer prüft, dass ein *unbekannter* Wert abgewiesen
    wird — ein Typ, ein Modus, ein Schlüssel —, wählt dafür einen Namen,
    den es nie geben wird: `gibtsnicht`. Ein plausibel klingender Name
    ist die Falle, denn er ist genau das, was beim nächsten Ausbau
    hinzukommt. Der Prüffall wird dann **nicht rot, sondern
    gegenstandslos**: Er läuft weiter, misst aber nicht mehr, was er
    messen sollte, und fällt erst auf, wenn eine ganz andere Zusicherung
    daneben kippt.

    Dreimal am 2026-08-25 belegt, alle beim Typ-Ausbau der
    Eigenschafts-Profile (4T-001183 bis 4T-001185): Drei Unit-Fälle und der
    E2E-Fall PP-11 hatten `lookup` als Beispiel für einen unbekannten Typ
    gewählt — also ausgerechnet den Namen des Typs, der in derselben
    Stufe hinzukam. Alle vier wurden auf `gibtsnicht` umgestellt, der
    Prüf-Gegenstand blieb unverändert. **Ein maschineller Wächter ist
    bewusst nicht vorgesehen:** Er müsste erkennen, welche Zeichenkette
    in einem Prüffall die Rolle des Negativbeispiels spielt, und das hat
    kein sicheres Merkmal im Quelltext. Die Regel trägt der Name.
20. **Ein Umschalter wird nie auf Verdacht bedient.** Wer einen Zustand
    herstellen will, den ein Umschalter trägt — Panel ein, Modus an,
    Bereich aufgeklappt —, prüft vorher **den Schalt-Zustand**, nicht das
    gerenderte Ergebnis. Meldet ein Element den Zustand (`aria-pressed`,
    `aria-expanded`, eine Zustands-Klasse), ist das die Bezugsgröße; nur
    wenn keines ihn meldet, bleibt das Ergebnis der letzte Ausweg, und
    dann mit Warte-Semantik statt Momentaufnahme. Der Grund ist die
    Lücke: Der Umschalter im Produkt entscheidet am Zustand, ein
    `isVisible()` im Prüffall an einer Momentaufnahme des DOM. Solange
    das Rendern dem Zustand hinterherläuft, sehen beide etwas
    Verschiedenes — und der Klick, der einschalten sollte, schaltet
    **aus**.

    Belegt am 2026-08-25 (4T-001190): Der Helfer `showBookPanel` klickte im
    frisch geöffneten zweiten Fenster auf ein Panel, das laut Zustand
    schon an war und nur noch nicht gezeichnet. Der Fall BU-09 wurde
    dadurch reproduzierbar rot und blockierte eine Release-Vorbereitung.
    Die Falle wächst mit dem Produkt: Der Helfer stammte aus der Zeit mit
    genau einem Fenster, und erst das Applikations-Modell des Buches
    (4T-000871) brachte das zweite, dessen Sidebar später rendert. **Ein
    maschineller Wächter ist nicht vorgesehen** — ob ein Ausdruck eine
    Momentaufnahme ist, hat kein sicheres Merkmal im Quelltext (dieselbe
    Lage wie bei Regel 19).
22. **Ein Wächter-Marker ist kein gewöhnliches Wort der Sprache, die er
    durchsucht — und er hat einmal nachweislich angeschlagen** (4T-001085).
    Der Index-Wächter des Web-Handbuchs suchte die durchgereichte
    MathML-Fassung einer Formel über das nackte Wort `annotation` im
    rohen Suchindex. Das traf am 2026-08-18 einen gewöhnlichen englischen
    Satz («… in the list annotation …») und färbte den Lauf rot, während
    der Text, der die Ursache nennt, nicht zu sehen war; und es hätte den
    Leck selbst nie gefunden, weil das Tag-Strippen des Index-Textes den
    Tag-Namen ohnehin entfernt. Ein Marker, der nie anschlägt, ist
    schlimmer als einer, der zu oft anschlägt. Deshalb: Der Marker misst
    ein Merkmal des Gegenstands (hier die TeX-Quelle, die im Index nur aus
    dem Markdown-Beispiel und nie aus der Annotation stammen darf), die
    Gegenprobe führt den Fall an der reinen Funktion herbei, und der
    Bestandsfall hält fest, dass der Gegenstand im Bestand vorkommt, damit
    der Marker nicht ins Leere prüft.

23. **Eine Prüf-Vorlage wird an ihrem Gegenstand gehalten, nicht an der
    Erinnerung** (4T-001263, Register-Klasse L10 in ihrer zweiten Ausprägung).
    Zwei Vorfälle vom 2026-08-28 teilten die Annahme «der Gegenstand ist so
    gebaut, wie die Vorlage ihn baut»: Ein Werkzeug suchte das Eltern-Feld
    eines Epics im Singular, alle 230 Epic-Dateien führen den Plural, und 92
    grüne Fälle sagten nichts, weil keiner den realen Bestand berührte; ein
    Hygiene-Wächter suchte Absätze, das Register führt Listenpunkte, dreizehn
    Einträge blieben zwanzig Tage ungeprüft. Drei Regeln folgen daraus.
    **Bestandsfall:** Ein Werkzeug, das einen realen Bestand auswertet, trägt
    mindestens einen Prüffall gegen diesen Bestand. Der Wächter
    `test/unit/bestandsfall.test.js` verlangt das für jedes Werkzeug unter
    `scripts/`, das den PM- oder den Anforderungs-Parser selbst lädt; der
    Bestandsfall darf über eine Fassade laufen, die das Werkzeug mitfährt
    (der Bestandsfall des PM-Linters deckt seine Regelgruppen-Module). Eine
    Ratsche nennt die Lücken mit Grund und darf nur schrumpfen. **Positiv-Kontrolle:** Aus dem
    Schweigen eines Wächters wird nichts gefolgert, bevor er einmal
    nachweislich gefeuert hat, an einem eingebauten Verstoß oder am echten
    Fall; liegt der Gegenstand außerhalb des Repositoriums, ist die
    Positiv-Kontrolle der Ersatz für den Bestandsfall. **Grundgesamtheit:**
    Jede Erhebung über einen Bestand nennt ihre Grundgesamtheit — wie viele
    Dateien gesehen, wie viele gezählt —, damit ein stilles Wegfiltern
    auffällt; der dritte Beleg war eine Erhebung, die 892 von 1255 Dateien
    sah, weil Git Pfade mit Umlauten quotiert. Wo eine Vorlage ein Schema
    nachbildet, liest sie es aus der kanonischen Quelle (`scripts/pm-parse.js`)
    statt es abzuschreiben.

24. **Ein E2E-Lauf misst nie ein veraltetes Renderer-Bündel** (4T-001481 und
    4T-001475, Register-Klasse L9). Die Prüffälle starten die Anwendung gegen
    das erzeugte `src/renderer/renderer.bundle.js` und nicht gegen die
    Quellmodule. Gebaut wird es vom npm-Hook `pretest:e2e`, und der greift bei
    `npm run test:e2e` und damit beim Gate-Weg — **nicht** aber bei einem
    direkten `npx playwright test <datei>`, also genau bei der freien
    Entwicklungs-Iteration, die der Pflicht-Zugang offen lässt (4T-001191).
    Bis hierher war diese Falle lautlos: Der Lauf sah grün aus, gleich wie alt
    sein Gegenstand war. Zwei Vorfälle vom 2026-09-05 belegen sie —
    `4T-001478` meldete acht grüne Fälle, die den geänderten Code nie berührt
    hatten, und `4T-001410` verbrannte rund fünfzehn Minuten und zwei
    Hypothesen an einem Diagnose-Protokoll, das leer blieb, weil der
    instrumentierte Quelltext gar nicht lief.

    **Durchgesetzt wird die Regel am Tor, nicht im Gedächtnis.**
    `scripts/bundle-frische.js` vergleicht die Änderungszeit des Bündels mit
    der jüngsten Quelle unter `src/renderer/` und `src/shared/` (Erzeugtes wie
    `mermaid.bundle.js`, `hljs-themes.css`, `katex/` und `driverjs/` zählt
    nicht mit, ebenso wenig die nur vom Main-Prozess gelesene
    `src/shared/build-info.json`). Der Helfer `test/e2e/helpers/app.js` ruft ihn
    in `launchApp` vor `electron.launch` und **bricht ab**, statt zu warnen:
    Eine Warnung stünde in der Ausgabe eines Laufs, den man erst am Ende liest,
    und wäre damit dieselbe Prosa-Regel, die der Vorfall bereits gerissen hat.
    Dass die Prüfung am Start hängt und nicht am Modulkopf, ist Absicht: Eine
    Auflistung (`playwright test --list`) lädt jede Prüfdatei, startet aber
    keine Anwendung, und aus ihr gewinnt `scripts/test-kennzahlen.js` die
    Kennzahl «Automatische Prüfungen» — ein Wächter im Modulkopf hätte sie
    eingefroren wie seinerzeit der Pflicht-Zugang (4T-001322). Ein
    **fehlendes** Bündel gilt wie ein veraltetes. Der Wächter **baut nicht** und
    schreibt nichts (E7/E8); die Meldung nennt beide Wege zum frischen Stand,
    `node scripts/gate-lauf.js e2e` und `npm run build:renderer`. Über den
    Gate-Weg bleibt er still, weil dessen `pre`-Kette unmittelbar davor gebaut
    hat — eine Sonderbehandlung für ihn gibt es nicht.

25. **Eine Messung, deren Fehlschlag wie ihr Ergebnis aussieht, braucht eine
    Gegenprobe** (4T-001495, Register-Klasse L10 in ihrer ersten Ausprägung
    U1 «Annahme über Messort und Messgerät»). Sechs der sechzehn Vorfälle der
    Klasse liegen nicht am Gegenstand, sondern am **Prüfmittel**: Es maß im
    falschen Fenster, nahm einen Wert mit Platzhaltern wörtlich, zählte fremde
    Schreibvorgänge als eigene oder traf mit seinem Zeitfenster neben die
    Anzeigedauer. Drei Gegenproben haben diese Fälle gefangen; sie standen
    bisher je im Text ihres Vorgangs und in keiner Regel:

    - **Gleiche Messwerte an verschiedenen Gegenständen sind ein Messfehler,
      kein Fund.** Belegt an drei Dateien mit identischer Zeichenzahl
      (4T-001228) und sechs Journalen mit identisch null Einträgen
      (4T-001266).
    - **Vor jeder Ursachen-Hypothese zu einem einmaligen Fehlschlag steht seine
      Wiederholung.** Vier Läufe gingen in falsche Richtungen, bevor jemand
      fragte, ob der Fehler reproduzierbar ist — er war es nicht (4T-001267).
    - **Eine Messung trennt Abwesenheit von Leere.** Ein Ausdruck, dessen
      negatives Ergebnis zwei Ursachen haben kann (Gegenstand fehlt, oder
      Gegenstand ist leer), unterscheidet nicht, sondern behauptet (4T-001267).

    Dazu gilt die **Positiv-Kontrolle** aus Regel 23 hier genauso: Aus dem
    Schweigen eines Prüfmittels wird nichts gefolgert, bevor es einmal
    nachweislich gefeuert hat. **Der jüngste Beleg stammt aus der Messung zu
    4T-001497:** Dort trat dieselbe Falle in **sechs** Gestalten auf — ein
    Hüllen-Objekt statt der gelesenen Karte, nicht startende Prozesse, ein von
    der Projekt-Konfiguration überstimmter Reporter, ein Text-Scan, der die
    `exclude`-Liste als Treffer las, ein stiller `catch` und die fehlende
    Zugangs-Marke. Alle sechs sagen «nichts gefunden», und **keines ist vom
    echten Negativ-Ergebnis zu unterscheiden**. Belastbar wurde die Messung
    erst durch zwei Kontrollfälle mit von Hand vorbestimmtem Ergebnis.

26. **Eine neue Lesart eines bekannten Wertes braucht die Fall-Liste des
    Wertes, nicht eine neue** (4T-001495, Register-Klasse L10 in ihrer
    Ausprägung U5). Wer eine zweite Stelle baut, die denselben Wert auswertet,
    erbt dessen Formen-Vielfalt — beim Ziel-Teil eines Wiki-Links etwa Anker,
    Alias, Unterseiten-Form und Endung — und prüft doch nur die Formen, die ihm
    gerade einfallen. Belegt am 2026-09-06: Der Klick-Weg trennt den Anker ab,
    bevor er auflöst; eine neu gebaute Beurteilung des Linters tat es nicht und
    suchte eine Datei namens `Zielnotiz#Kapitel Zwei`. Ergebnis war eine Marke
    an einem Verweis, den derselbe Klick öffnet. Gefunden hat das kein Lauf,
    sondern ein Handgriff an der gebauten Programmdatei: Weder die sieben
    Unit-Fälle der neuen Funktion noch ihre beiden E2E-Fälle führten je einen
    Anker — geprüft war er anderswo sehr wohl, im Render-Pfad, in der
    Auflösung, im Klick-Weg, nur nicht dort, wo die zweite Lesart entstand.

    **Abgrenzung zu Regel 23:** Dort teilen Prüfstand und Werkzeug eine falsche
    Vorstellung vom Bestand, und der Bestandsfall fängt es. Hier laufen zwei
    Lesarten desselben Wertes im Code auseinander, und ein Bestandsfall der
    neuen Stelle meldete nichts, solange die seltene Form im Bestand nicht
    vorkommt. Die Fall-Liste gehört deshalb an den **Wert**, nicht an die
    Stelle.

    **Gemessen statt angenommen: Änderungszeiten tragen, ein Inhalts-Hash wäre
    hier der falsche Weg.** Ein Inhalts-Vergleich bräuchte einen Stempel der
    Bau-Eingänge, also eine Schreib-Wirkung, die der Wächter nicht haben darf.
    Der Zweifel gegen die Zeitstempel — nach einem `git checkout` springen sie —
    trägt in die entlastende Richtung: Gemessen am 2026-09-06 schreibt
    `git checkout` nur die Dateien neu, deren Inhalt sich unterscheidet, und
    fasst das ungetrackte Bündel nie an. Ein Zeit-Sprung heißt also geänderter
    Inhalt und damit ein wirklich veraltetes Bündel. Bleibt der
    Hin-und-Zurück-Wechsel, nach dem der Inhalt wieder der des Baus ist: Er
    kostet einen überflüssigen Bau von Sekunden. Der Irrtum geht damit immer auf
    den Fehlalarm und nie auf den stillen Durchlass — dieselbe Richtung wie beim
    Produkt-Code-Wächter und beim Pflicht-Zugang.

27. **Vor dem Weiten einer Toleranz wird der Normalwert gemessen** (4T-001554,
    Entscheidung des Product Owners vom 2026-09-08). Ein Prüffall, der absolute
    Bildschirm-Positionen vergleicht, misst die Schrift-Umgebung mit; reißt er,
    ist die naheliegende Erklärung eine zu enge Toleranz. Sie ist nur dann
    richtig, wenn der Fall **nahe** an seiner Grenze arbeitet — und das ist eine
    Messung, keine Vermutung.

    **Der Prüfsatz lautet: Wie weit liegt der Normalwert unter der Grenze, und
    um welchen Faktor lag der Fehlschlag darüber?** Ein Fehlschlag im Bereich
    der Grenze ist Umgebungs-Streuung, und eine abgeleitete Toleranz hilft. Ein
    Fehlschlag um eine **Größenordnung** darüber ist kein Toleranz-Problem,
    sondern ein anderer Zustand; eine geweitete Toleranz verdeckt ihn dann nur.

    Belegt am 2026-09-08 an `ZU-01` («die Schreibmarke folgt dem Klick auch in
    der eingerückten Fortsetzung»): Toleranz 8 px, gemessener Normalwert
    **1,59 px**, die beiden Vorfälle vom 2026-09-01 bei **16,98 px** (Windows)
    und **18,44 px** (Linux) — also beim Zehnfachen des Normalwerts und rund
    zwei Zeichenbreiten daneben. Der Fall arbeitet nicht an seiner Grenze; die
    Toleranz war nie das Problem, und sie bleibt deshalb unverändert. Zwei
    Vorfälle auf zwei Plattformen mit demselben Fingerabdruck sagen etwas über
    den **Zustand** im Moment des Klicks, nicht über die Schrift-Umgebung.

    **Die Zahl kostet einen Lauf.** Der Messwert entsteht, indem der Fall
    einzeln mit ausgegebener Größe statt bloßer Zusicherung gefahren wird —
    Sekunden, gegen die Alternative, eine Toleranz auf Verdacht zu weiten und
    damit die Aussagekraft des Falls dauerhaft zu senken.

28. **Die Prüf-Breite steht zentral im Start-Helfer, und sie wird als
    Inhalts-Größe gesetzt** (4T-001579, Epic 3E-000283). `launchApp` in
    `test/e2e/helpers/app.js` setzt einmal zentral eine Prüf-Breite von
    **1600 px** Inhaltsbreite bei unveränderter Höhe von **800**. Grund: Ein
    Prüffall, der eine Schaltfläche der Statusleiste anklickt, prüfte in einer
    schmalen Lage deren **Zusammenklappen** statt seiner eigenen Sache — die
    Leiste faltet ihre Elemente seit diesem Epic in zwei Pull-up-Menüs, sobald
    der Platz nicht reicht. Betroffen waren rund zehn Prüfdateien über fünf
    Elemente hinweg, und die Menge wächst mit jeder weiteren Schaltfläche;
    einzeln nachgezogen wäre sie bei der nächsten erneut fällig. **Wer eine
    schmale Lage _prüfen_ will, setzt die Fenster-Grenzen im Prüffall selbst**
    (so `FT-05`, `KP-04` und die `SF`-Fälle).

    **Gesetzt wird die Inhalts-Größe (`win.setContentSize`), nie das
    Fenster-Rechteck mit Position (`win.setBounds` mit `x`/`y`).** Das
    Rechteck **verschiebt** das Fenster, und die Verschiebung hat am
    2026-09-14 in einer Messreihe über eine ganze Prüfdatei **4 von 6 Läufen**
    zum Fehlschlag gebracht — «Execution context was destroyed» im
    Haupt-Prozess-Aufruf, also ohne verletzte Erwartung; **ohne** Verschiebung
    waren es **3 von 3 grün** (ebenso 3 von 3 grün ohne jede Größen-Setzung).
    Die Inhalts-Größe rührt die Position nicht an und trifft die gemessene
    Breite zudem genauer, weil der Fenster-Rahmen nicht mitzählt. Die Regel
    bindet **jeden** künftigen Helfer, der ein Fenster für einen Lauf
    einrichtet. Ist der Bildschirm schmaler als 1600, klemmt das
    Fenster-System die Breite; dort gilt dieselbe Lage wie vor der Ergänzung.

    Die Messreihe und die Begründung der Breite stehen im Lösungs-Kapitel von
    4T-001579, Abschnitt zur Prüf-Breite und beim roten Fall `MEM-06`; der
    Kommentar im Helfer trägt sie in Kurzform.

## E2E-Praxis

Wiederkehrende Stolperstellen der Playwright-Suite. Jede hat mindestens
eine Debug-Runde gekostet.

- **Ein Aufruf, der sein eigenes Fenster schließt, wird nicht erwartet.**
  `await page.evaluate(() => window.api.…close())` scheitert mit «Target
  page, context or browser has been closed», weil die Seite verschwindet,
  bevor sie antworten kann; der Fehlschlag sieht aus wie ein Produktfehler
  und ist doch nur die Mechanik. Der Aufruf wird deshalb aus dem evaluate
  heraus verzögert ausgelöst (`setTimeout(() => …, 0)`), und das Ergebnis
  wird am Fenster-Bestand gemessen statt am Rückgabewert. Anlass ist der
  Regressionsfall zum Regal-Zustand (RG-10); dieselbe Stelle trifft jeden
  Weg, der eine Applikation von innen beendet.
- **Bundle-Bezug.** Die Specs starten die App gegen das gebaute
  `src/renderer/renderer.bundle.js`, nicht gegen die ESM-Quellmodule.
  `npm run test:e2e` baut es über den `pretest:e2e`-Hook mit; ein
  direkter `npx playwright test <spec>` überspringt den Hook (npm führt
  `pre*`-Hooks nur bei `npm run <script>` aus) und misst ein veraltetes
  Bundle. Vor direkten Playwright-Aufrufen deshalb
  `npm run build:renderer`. Symptom: der Main-Anteil einer Änderung
  greift, die Renderer-Anzeige fehlt (neue CSS-Klasse oder DOM-Struktur
  wird nicht gefunden). **Seit 4T-001481 hängt das nicht mehr am
  Gedächtnis:** `test/e2e/helpers/app.js` prüft die Frische über
  `scripts/bundle-frische.js` und bricht ab, bevor die Anwendung startet
  (Stabilitätsregel 24). Der Hinweis hier bleibt
  trotzdem stehen — er nennt das Symptom, das der Wächter jetzt vorweg
  abfängt, und gilt unverändert für jeden anderen Weg, der die Anwendung
  ohne den Helfer startet.
- **Der Renderer-Bau ist ein eigenes Gate.** Vitest löst fehlende
  Named-Exports lax zu `undefined` auf, esbuild bricht hart ab („No
  matching export"). Ein falsch gezogener Import läuft deshalb durch
  `npm test` grün und fällt erst beim Bundle-Bau. Nach neuen
  Renderer-Modulen und Import-Umbauten `npm run build:renderer` laufen
  lassen und die Ausgabe **ungekürzt** lesen; Import-Quellen vorab am
  Export prüfen statt aus dem Gedächtnis schreiben.
- **Editor-Selektoren mit `.pane-source` qualifizieren.** Das
  Notiz-Panel legt immer eine zweite, unsichtbare CodeMirror-Instanz an,
  im DOM **vor** dem Haupt-Editor. Generische `.cm-*`-Selektoren treffen
  dann die Notiz-Instanz (scrollt nie, `scrollTop` bleibt 0) oder
  brechen im Playwright-Strict-Mode an zwei Treffern. Muster:
  `SEL.editorContent0`. Der App-Code ist nicht betroffen, er arbeitet
  auf der konkreten EditorView.
- **Menü-Inspektion über einen setMenu-Interceptor.**
  `Menu.getApplicationMenu()` ist leer, weil Menüs pro Fenster über
  `win.setMenu(...)` gesetzt werden (Muster in
  `test/e2e/funktionen/arbeitsbereiche.spec.js`). Dazu: IPC-Aufrufe, die
  das eigene Fenster schließen, fire-and-forget testen, weil das Fenster
  vor der Antwort schließt und ein `await` hängt; `menu:*`-Ereignisse an
  frisch erzeugte Fenster gepollt senden, weil die Listener sich erst am
  Ende des asynchronen Renderer-`init()` registrieren.
- **Nach dem Anwenden von Einstellungen auf den Dirty-Reset warten.**
  Der Klick auf `#btn-settings-apply` startet eine asynchrone Kette
  (Apply-Hooks, Persistenz, Events), auf die Playwright nicht wartet.
  Oberflächen, die ihren Datenstand einmalig beim Öffnen bauen (etwa die
  Kommando-Palette), zeigen bei sofortigem Öffnen den alten Stand; der
  Fehler ist zeitabhängig und isoliert schwer reproduzierbar.
  Warte-Anker:
  `await expect(page.locator('#btn-settings-apply')).toBeDisabled()`.
- **Specs mit Ansicht-Toggles schließen erzwungen.** Die
  Editor-Ansicht-Toggles (Gliederung, Zeilennummern, Zeilenumbruch)
  schreiben beim Umschalten ins Frontmatter der aktiven Datei und machen
  sie änderungsbedürftig. Specs, die sie auch indirekt auslösen (über
  platzierte Kommando-Buttons oder Makros), beenden mit
  `closeApp(app, userData, { force: true })`, sonst hängt der Lauf am
  Speichern-Dialog.
- **Neuer Reiter startet im Bearbeiten-Modus.** Eine geöffnete Datei
  steht im Lese-Modus, ein frisch angelegter Reiter dagegen bereits im
  Bearbeiten-Modus. Ein reflexhafter Klick auf den Modus-Umschalter
  macht den neuen Reiter read-only, und die folgenden Tipp-Schritte
  laufen ins Leere.
- **`expect.poll` braucht einen async-Callback, sobald er liest.** Wer
  im Callback eine Eigenschaft des Ergebnisses einer async-Funktion
  liest, muss `await`en: `(f()).length` auf einem Promise ist
  `undefined`, die Bedingung wird nie wahr, und der Fall läuft
  kommentarlos in den Timeout.

## Konsolen-Fehler scheitern lassen

Jeder Konsolen-Eintrag vom Typ `error` und jede unbehandelte Ausnahme des Renderers (`pageerror`) lässt den betroffenen End-zu-End-Fall scheitern. Die Beobachtung sitzt zentral in [helpers/app.js](e2e/helpers/app.js) und braucht in der einzelnen Spec **kein Zutun**: `launchApp` hängt den Zuhörer an das `window`-Ereignis der Anwendung, `closeApp` wertet aus.

Drei Eigenschaften, die beim Ändern zu erhalten sind:

- **Der Zuhörer steht vor `firstWindow()`.** Wird er erst danach registriert, entgehen ihm sämtliche Meldungen der Start-Phase — also der Phase, in der Initialisierungs-Fehler entstehen. Genau das war der Zustand bis 4T-000901: Ein während des Starts gemeldeter Fehler ließ den damaligen Smoke-Fall grün.
- **Warnungen bleiben außen vor.** Nur `error`. Das Rauschen der Warnungen würde den Wächter entwerten.
- **Die Auswertung verdeckt keinen echten Fehlschlag.** Ist der Fall bereits aus eigenem Grund rot, wird die Konsolen-Meldung nur als Anmerkung angehängt statt geworfen; ein Wurf aus dem `finally`-Block hätte sonst die ursprüngliche Diagnose überschrieben.

**Geduldete Meldungen** stehen in [konsolen-ausnahmen.json](konsolen-ausnahmen.json), je Eintrag mit Teilstring, Grund und Datum. Ein Eintrag entsteht nur, wenn der Fall die Meldung **absichtlich** erzeugt (etwa ein Sicherheits-Fall, der einen Pfad bewusst nicht auflöst) oder sie von außen kommt; ein echter Fehler der Anwendung wird behoben, nicht geduldet. Das Feld `spec` bindet den Eintrag an eine Datei und ist der Regelfall: Ohne diese Bindung gölte eine Ausnahme wie `ERR_FILE_NOT_FOUND` projektweit und verdeckte gleichartige Meldungen anderswo.

## Rote Läufe einordnen

**Teststufen, E2E-Budget und Defekt-Klassen** (Kurzfassung; kanonisch im Konzept Test-Strategie und Qualitätssicherung): Die Prüfung folgt vier Stufen — Funktionstest je Task, Integrationstest je Task (Ä-Ausschnitt plus benannte Wechselwirkungen), Epic-Abschluss-Test als kumulierter Ausschnitt, Release-Abnahme; Eintritts-Kriterium jeder Stufe ist die grüne darunter. Der E2E-Voll-Lauf ist ausschließlich die Release-Abnahme und läuft **genau einmal je Release**; eine Wiederholung braucht die dokumentierte Freigabe des Product Owners, und beim zweiten unerwarteten Befund am Abnahme-Gate gilt Halt und Entscheidungsvorlage statt eines weiteren Laufs. Der Gate-Weg sagt das selbst: `node scripts/gate-lauf.js e2e` warnt seit dem 2026-09-03 vor einem Voll-Lauf außerhalb einer belegten Release-Sperre und bricht bewusst nicht ab, weil eine freigegebene Wiederholung legitim ist. Ein roter Fall ist zunächst ein unklassifizierter Befund: erst die Diagnose-Leiter unten, dann die Einstufung als **Produktfehler** (blockiert die Abnahme; Fix plus Regressionstest, Nachweis über gezielte Specs plus Smoke), **Testfehler** (Test-Fix als Vorgang im Test-Pflege-Gefäß) oder **Flake** (isoliert grün; Eintrag in die Quarantäne-Liste [flake-quarantäne.json](flake-quarantäne.json), blockiert keine Abnahme und löst keinen Voll-Lauf aus). **Ein Eintrag trägt die Pflichtfelder `spec`, `fall`, `datum` und `status`; das Feld `status` nimmt genau einen von drei Werten: `beobachtet`, `befoerdert` (dann mit dem Testfehler-Vorgang im Feld `vorgang`) oder `behoben`.** Prosa zum Sonderfall — die Bedingung einer späteren Beförderung, eine offene Umgebungs-Frage — steht im Feld `vermerk`, nie im Status: Maschinell gelesen wird allein der Status, und drei Sätze an seiner Stelle haben die Qualitäts-Kennzahl vom 2026-08-19 bis zum 2026-09-03 um zwei beobachtete Einträge zu niedrig gemeldet. Der Wächter `test/unit/flake-quarantaene.test.js` hält Wertebereich und Pflichtfelder fest, und die Qualitäts-Zählung meldet Wiederholungen je **Fall-Kennung** (das Kürzel vor dem Trenner, nicht der ganze Fall-Text), damit derselbe Fall in zwei Schreibweisen nicht als zwei Fälle durchgeht. Aus der Quarantäne-Liste wird wiederholt Auffälliges zum Testfehler-Vorgang befördert und lange Unauffälliges gestrichen; **angesehen wird sie als Schritt 6 der Sammeltask-Checkliste** (Release-Strecke, gemeinsam mit dem Fehlerklassen-Register), nicht nach einer Regel an dieser Stelle.

- **Den Beleg sichern, bevor wiederholt wird** (4T-000934, Vorfall vom
  2026-08-08). Die Ausgabe eines Gate-Laufs wird **ungefiltert** gelesen; wo
  eine Filterung bequem ist, wird die volle Ausgabe zusätzlich in eine Datei
  geleitet (`… > lauf.log 2>&1`, danach hineinsehen). Nach einem roten Lauf
  wird der Beleg gesichert, **bevor** ein Wiederholungslauf startet: Jeder
  Folgelauf überschreibt den Maschinen-Bericht unter `test-berichte/`, und
  danach ist weder der betroffene Fall noch sein Fehlerbild feststellbar. Ein
  roter Lauf ohne Beleg ist **kein Flake**, sondern ein verlorener Befund; er
  wird als solcher benannt statt stillschweigend als Flake behandelt, denn ein
  Quarantäne-Eintrag ohne benennbaren Fall ist wertlos. Anlass war genau
  dieser Ablauf: gefilterte Ausgabe, blinder Wiederholungslauf, überschriebener
  Bericht, Ursache endgültig weg. Diese Sorgfalt nimmt `scripts/gate-lauf.js`
  ab (siehe „Belege roter Gate-Läufe" unten), und zwar nicht mehr nur der
  Merge-Queue: Ein einzelner Lauf geht seit 4T-001087 über seinen
  Kommandozeilen-Zugang `node scripts/gate-lauf.js <gate>` (oder `alle` für die
  volle Liste), der dasselbe Kommando fährt wie das gleichnamige Gate der
  Integration, dessen Rückgabewert unverändert weiterreicht und den Beleg
  ebenso ablegt. Seit dem 2026-08-20 ist dieser Zugang **Pflicht** für jeden
  Lauf, dessen Ergebnis ein Befund sein kann — Suite-, Bau- und
  Abnahme-Läufe, deren Ausgang berichtet wird oder eine Entscheidung trägt;
  hand-gepipete `npm test`/`vitest`/`playwright`-Aufrufe entfallen dort, weil
  jede Pipe eine Kürzung und damit einen Beleg-Verlust riskiert (Anlass:
  BS-06-Beleg-Verlust vom 2026-08-19 durch `tail -40` **trotz** bestehender
  Beleg-Pflicht — der Weg existierte, die Pflicht fehlte). Eine gekürzte
  Betrachtung der Ausgabe ist zulässig, **nachdem** der ungekürzte Beleg
  liegt; genau das garantiert der Zugang. Frei bleibt die schnelle
  Entwicklungs-Iteration an einzelnen Prüfdateien, solange ihr Ausgang nicht
  berichtet wird.

  **Seit dem 2026-08-30 ist die Pflicht maschinell gedeckt** (4T-001191): Der
  Pflicht-Zugang ist nicht mehr die vorgeschriebene, sondern die **einzige**
  Möglichkeit, einen Voll-Lauf zu starten. Beide Test-Konfigurationen rufen
  `scripts/gate-zugang.js` als `globalSetup`; es weist einen Voll-Lauf ohne die
  Zugangs-Marke ab, die allein `gate-lauf.js` setzt — und damit beide
  Pflicht-Zugänge, weil die Merge-Queue ihre Gates aus demselben Modul bezieht.
  `npm test` und `npx vitest run` enden dadurch mit einer Meldung statt mit
  einem Lauf, `npx playwright test` ebenso. **Die Grenze zur freien Iteration
  liegt am Argument** (Entscheidung des Product Owners vom 2026-08-29): Ein
  Aufruf mit konkretem Datei- oder Muster-Argument ist Iteration und läuft
  unverändert durch, ein Aufruf ohne solches Argument ist ein Voll-Lauf und
  verlangt den Zugang. Anlass war die Zählung der Klasse L3, die nach dem
  Maßnahme-Datum vier Wiederholungen auswies: Die Ursache war nicht die
  fehlende Regel, sondern die fehlende Deckung. **Warum die Sperre in der
  Test-Konfiguration sitzt und nicht in `package.json`:** Diese Datei gehört
  zur Release-Isolation und wäre außerhalb einer Release-Strecke nicht
  integrierbar; der Product Owner hat am 2026-08-30 deshalb den Ort verlegt,
  nicht das Prinzip. Der gewählte Ort deckt zudem mehr, weil auch der direkte
  Aufruf des Test-Programms an ihm vorbei müsste.

- **Der Rückgabewert gehört dem Werkzeug, nicht der Kommandozeile** (4T-001178,
  Vorfall vom 2026-08-24; seit 4T-001165 für **beide** Pflicht-Zugänge). Der
  Zugang reicht den Rückgabewert unverfälscht weiter, aber nur bis zum Rand
  seines eigenen Prozesses. Wer ihn in eine Shell-Kette hängt, deren letztes
  Glied den Status bestimmt, bekommt den Wert dieses letzten Glieds: `node
  scripts/gate-lauf.js e2e > lauf.log 2>&1; echo "EXITCODE: $?"` meldet 0,
  während das Gate 1 lieferte und sich selbst korrekt als rot gemeldet hat. Ein
  roter Abnahme-Lauf wird so als grün berichtet, und auffallen kann es nur noch
  beim Lesen der Kennzahlen im Bericht. Für eine Pipe gilt dasselbe, und dort
  kommt der Beleg-Verlust hinzu. **Ein Aufruf eines Pflicht-Zugangs steht
  deshalb allein**, besonders im Hintergrund, wo allein der Prozess-Status
  zurückkommt; die Ausgabe wird danach gelesen und nicht im selben Kommando
  quittiert. Anlass war die dritte Wiederholung der Klasse L3 binnen eines
  Tages, diesmal an der Verkettung statt an der Pipe: Die Maßnahme 4T-001116
  deckte den Beleg, nicht den Rückgabewert.

  **Die Regel gilt für zwei Werkzeuge, nicht nur für den Gate-Zugang** (seit
  dem 2026-08-29, Entscheidung des Product Owners in 4T-001165). Die Grenze
  verläuft nicht am Gate-Zugang, sondern an der Eigenschaft «der Rückgabewert
  trägt ein Urteil»; davon gibt es zwei:

  | Werkzeug | Sein Rückgabewert sagt |
  |---|---|
  | `node scripts/gate-lauf.js <gate>` | ob das Gate grün war |
  | `node scripts/merge-queue.js <branch>` | ob integriert wurde |

  Anlass war der vierte Vorfall der Klasse L3 am 2026-08-29, der erste an der
  Queue: Ein Wiederhol-Skript rief `node scripts/merge-queue.js <zweig> | grep
  -vE …` **innerhalb einer if-Bedingung** auf, bekam den erfolgreichen
  Rückgabewert von `grep` und meldete «ERFOLG», während in derselben Ausgabe
  «FEHLGESCHLAGEN — Queue belegt» stand.

  **Zwei Maßnahmen decken die Regel seither maschinell** (4T-001165), und sie
  ersetzen einander nicht:

  1. **Die Frühwarnung weist die Pipe ab.** `scripts/mandat-fruehwarnung.js`
     stoppt jedes Shell-Kommando, in dem einem der beiden Pflicht-Zugänge eine
     Pipe folgt — auch innerhalb einer `if`-Bedingung, weil genau das die Form
     des Vorfalls war. Bewusst eng: Andere Kommandos mit Pipe bleiben
     unberührt, und die **Datei-Umleitung bleibt frei**, weil sie den
     Rückgabewert erhält.
  2. **Der Lauf schließt mit seinem Urteil ab.** Die **letzte** Zeile beider
     Werkzeuge lautet `<werkzeug>: ERGEBNIS GRUEN|ROT — … (Rueckgabewert <n>).`
     und steht hinter dem Beleg-Pfad bzw. hinter dem Start-Hinweis des nächsten
     Vorgangs. Sie kommt auch im grünen Fall, denn eine Zeile, die nur bei
     Fehlern käme, wäre bei ihrem Fehlen nicht von einem Abbruch zu
     unterscheiden. Der Rückgabewert bleibt unverändert; die Zeile nennt ihn.

  Damit überlebt das Urteil jede Kürzung, die das Ende erhält: `… > lauf.log
  2>&1`, danach die letzte Zeile lesen, ist der vollständige Weg.

- **Belege roter Gate-Läufe** (4T-000934, seit 4T-001087 auch für den Einzel-Lauf).
  Bricht ein Gate ab, gleich ob in der Merge-Queue oder über den
  Kommandozeilen-Zugang,
  legt `scripts/gate-lauf.js` den Beleg selbsttätig unter
  `test-berichte/rot/<Zeitstempel>-<branch>-<gate>.*` ab und die
  Fehlermeldung nennt den Pfad: die **volle** Konsolen-Ausgabe als `.log`
  (die Meldung selbst bleibt auf die letzten 25 Zeilen gekürzt) und beim
  Testsuite-Gate zusätzlich die Kopie von `test-berichte/unit.json`. Ein
  grüner Lauf sichert nichts, die jüngsten zehn Belege bleiben liegen, und
  ein Fehlschlag der Sicherung verdrängt nie die Meldung des eigentlichen
  Fehlschlags.

  **Für E2E-Läufe gilt das seit 4T-001099 ebenso, aber nur über den Zugang:**
  `node scripts/gate-lauf.js e2e` sichert im roten Fall zusätzlich den Bericht
  `test-berichte/e2e.json` **und die Artefakte** aus `test-results/`, also
  Traces und Bildschirmfotos, als Ordner `…-artefakte`. Das ist nötig, weil
  Playwright `test-results/` **zu Beginn jedes Laufs leert**: Ohne die Kopie
  ist der Trace eines roten Falls beim nächsten Lauf weg, und genau das ist am
  2026-08-19 passiert, als der Beleg für 4T-001086 gebraucht wurde. Wer E2E
  direkt über `npm run test:e2e` fährt, bekommt die Sicherung nicht — für die
  Release-Abnahme ist deshalb der Zugang der vorgesehene Aufruf. Die Queue
  fährt weiterhin **kein** E2E-Gate, und `alle` schließt es nicht ein.

- **Null fehlgeschlagene Tests, trotzdem rot: zuerst den Rechner ansehen.**
  Meldet ein Lauf eine rote Suite, während der Bericht `numFailedTests: 0`
  ausweist, ist kein Test gefallen, sondern ein Hook ins Zeitlimit gelaufen,
  fast immer ein `afterAll`, das Wegwerf-Verzeichnisse löscht. Dafür gibt es
  genau zwei Ursachen, und sie sehen gleich aus:
  1. **Fremdlast auf dem Rechner.** Ein zweiter Suite- oder Bau-Lauf, auch aus
     einem anderen Clone. Prüfen mit
     `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'vitest|playwright' }`;
     die Ausgabe nennt über `CommandLine` auch den Clone. Ist ein fremder Lauf
     aktiv: **warten, nicht wiederholen.** Ein zweiter Lauf unter derselben Last
     scheitert genauso und kostet die Zeit ein zweites Mal. Die Regel dazu steht
     in den Entwicklungsrichtlinien,
     Abschnitt 11.
  2. **Gewachsene eigene Aufräum-Last.** Die Test-Datei hat Fälle bekommen, die
     je eine eigene Wegwerf-Umgebung bauen; dann reicht das voreingestellte
     Zeitlimit nicht mehr, und der Hook braucht ein eigenes (Muster
     `AUFRAEUM_ZEITLIMIT` in `merge-queue.test.js`, `BAU_ZEITLIMIT` in
     `web-inhalte.test.js`). Erkennbar daran, dass der Fehlschlag auch ohne
     Fremdlast auftritt.

  In **keinem** der beiden Fälle gehört der Lauf in die Flake-Quarantäne: Kein
  Test flackert, sondern eine Rahmenbedingung fehlt. Belegt am 2026-08-07 mit
  beiden Ursachen am selben Tag.

- **Erst isoliert nachprüfen, dann bewerten.** Einzelne Fehlschläge der
  E2E-Voll-Suite sind häufig Last-Flakiness der parallelen Ausführung.
  Diagnose-Leiter: (a) die ganze Spec-Datei erneut fahren, (b) den
  Einzeltest über `<spec>:<zeile>`. Isoliert grün heißt Flakiness und
  kein Befund; manche Specs sind auf Datei-Ebene flaky und als
  Einzeltest stabil grün.
- **Isoliert rot heißt nicht automatisch Regression.** Bestands-Tests,
  die das alte, schwächere Verhalten prüfen, brechen nach einer
  Verschärfung legitim; dann wird der Test auf das neue Verhalten
  gehoben. Ob ein Fehlschlag vorbestehend ist, klärt die Gegenprobe
  gegen den Vorgänger-Stand: die eigenen geänderten Quellen per
  `git checkout <baseline> -- <dateien>` zurücksetzen,
  `npm run build:renderer`, den Einzeltest erneut fahren, danach
  `git checkout HEAD -- <dateien>` und neu bauen. Ein Worktree als
  Baseline scheitert unter Windows an der Modul-Auflösung des Bundlers;
  der In-Place-Revert ist der zuverlässige Weg.
- **Die Datei-Parallelität der Unit-Suite nicht hochsetzen.**
  `vitest.config.mjs` begrenzt sie bewusst (`maxWorkers: 4`,
  `minWorkers: 1`). Ohne Limit startet Vitest CPU-viele Fork-Worker; die
  entstehende CPU- und I/O-Last ließ den I/O-intensiven
  Backlinks-Cap-Test sein Zeitbudget reißen und schwere jsdom-Dateien am
  Worker-Start scheitern, bei zugleich längerer Gesamtlaufzeit. Bei
  Flakiness eher niedriger prüfen. Diagnose: einzelne Dateien mit
  `npx vitest run <datei>`, die Suite seriell mit
  `npx vitest run --no-file-parallelism`.
- **Die teuren Bau-Fälle laufen als eigene Gruppe nach allen anderen, seriell**
  (seit dem 2026-09-03, Weg B der Entscheidung des Product Owners). Ein
  absolutes Zeitlimit skaliert nicht mit einer wachsenden Suite: Jede neue
  Prüfdatei erhöht die Last für alle übrigen, und ein Bau-Fall, der isoliert
  weit unter seiner Grenze liegt, riss sie im Voll-Lauf durch Verdrängung —
  sieben Vorfälle seit dem 2026-07-25, jeder einzeln durch Anheben behandelt,
  zuletzt am 2026-08-30 ausgelöst durch zwei neue Prüfdateien mit zusammen
  217 ms Rechenzeit (Fehlerklasse L8). `vitest.config.mjs` führt deshalb
  zwei Projekte mit Gruppen-Reihenfolge: `leicht` (alle übrigen Dateien,
  parallel wie bisher) und `bau` (die Liste `TEURE_BAU_DATEIEN`, seriell,
  nach dem ersten Projekt). Die absoluten Grenzen aus `test/zeitlimits.js`
  bleiben unverändert scharf; sie messen jetzt wieder den Fall und nicht die
  Nachbarn. Wer einen Fall mit `BAU_ZEITLIMIT` oder `VOLLBAU_ZEITLIMIT`
  anlegt, trägt seine Datei in die Liste ein — der Wächter in
  `test/unit/test-zeitlimits.test.js` hält beide Seiten gegeneinander. Der
  Rückfall, falls die Mehrlaufzeit einmal ein Viertel übersteigt, ist Weg D
  (Nebenläufigkeit deckeln); gemessen am 2026-09-03 auf SC-027.
- **Den Rückgabewert eines Gate-Laufs nicht durch eine Pipe schicken.**
  Begründung und Vorgehen stehen in den
  Entwicklungsrichtlinien,
  Abschnitt „Arbeits-Umgebung: bekannte Fallen".

## Mutationsprobe: trägt der Prüffall, was er behauptet?

Ein grüner Prüffall beweist nicht, dass er seinen Gegenstand misst — er kann
auch an ihm vorbeigehen. Die **Mutationsprobe** beantwortet das: Der geprüfte
Code wird gezielt verschlechtert, und der Fall muss fallen. Bleibt er grün,
prüft er etwas anderes als angenommen.

Sie ist im Projekt gelebte Praxis (`journal-perioden.test.js`,
`journal-nav-einordnung.test.js`, `versions-texte-umlaute.test.js`) und lohnt
überall dort, wo ein Fall eine **Regel** absichert statt eines Ergebnisses. Zwei
belegte Funde: Ein Prüffall über 14 Monate blieb grün, als die Kalender-Rechnung
durch eine Division ersetzt wurde (der Fehler häuft sich an und kippt erst ab 34
Monaten, `4T-001489`); und ein Adress-Schutz ließ sich zu weit fassen, ohne dass
ein Fall es merkte, bis die Gegenprobe dazukam (`4T-001529`).

**Wo die Probe eine Falle hat:** Sie verändert eine Quelldatei auf Zeit. Bricht
das Werkzeug dazwischen ab, bleibt die Mutation stehen — und ein zweiter Lauf
liest sie als Original ein. Am 2026-09-07 hat das in `4T-001530` die Erweiterung
eines Moduls gekostet, weil der Rückweg dann über `git checkout --` führte und
der auf den **Commit-Stand** zurücksetzt, nicht auf den Stand vor der Mutation.
Daraus zwei Regeln:

- **Die Wiederherstellung gehört in ein `finally`,** nicht ans Ende des Laufs.
- **Vor der Probe committen** oder den Stand ausserhalb des Repositoriums
  sichern. `git checkout --` ist kein Rückweg für uncommittete Arbeit, sondern
  ein Werkzeug, das sie verwirft.

## Der Aufbau eines Prüffalls ist nicht sein Gegenstand

Die Mutationsprobe oben fragt, ob ein Fall seinen Gegenstand misst. Dieser
Abschnitt fragt das Gegenstück: ob er ihn im richtigen **Ausgangs-Zustand**
misst. Die Regel dazu lautet:

> **Der Aufbau eines Prüffalls darf nicht den Weg nehmen, den der Fall prüft.**

**Ein Zustand, den der Prüffall in seinem Aufbau herstellt, ist damit nicht
geprüft, sondern vorausgesetzt.** Solange der Aufbau einen anderen Weg nimmt als
die geprüfte Funktion, ist das unschädlich. Nimmt er denselben, prüft der Fall
die Funktion gegen sich selbst — und ist grün, gerade weil sie falsch ist.

**Der belegte Fall** (`4T-001533`, Abnahme von `3E-000175`): Die Vorschau der
Tag-Umbenennung blieb unsichtbar, sobald ein anderer Reiter der Sidebar-Gruppe
vorn stand. Sechs Prüffälle deckten den Bedienweg ab, vier E2E und zwei Unit,
und **keiner** fand es: Alle sechs starteten mit geschlossenem Panel und
schalteten es über dieselbe Funktion ein, die den Reiter dabei aktiviert. Sie
stellten den Zustand her, in dem der Fehler nicht auftritt. Gefunden hat ihn der
Product Owner am gebauten Programm.

**Der Nachbarfall aus derselben Woche** (`4T-001534`) zeigt die andere Hälfte:
Der Regressionstest, der den Fehler künftig bewachen sollte, stellte seine
Ausgangslage mit einem Klick auf den Statusbar-Schalter her — aber ein Schalter
schaltet, er öffnet nicht, und so schloss der Klick das Panel. Der Fall
scheiterte an seiner eigenen Ausgangslage, ohne die Zusicherung je zu erreichen.
Das ist der gutartige Ausgang: Er war rot und fiel am Gate auf. Der erste Fall
war grün.

Drei Handgriffe, die das abdecken:

- **Den Ausgangs-Zustand als Bedingung schreiben, nicht als Nebenwirkung.** Wer
  ihn herstellt, prüft danach, dass er hergestellt ist — Zusicherung im Aufbau,
  nicht Vertrauen in die Handlung. Der Helfer `bedieneBis` (`4T-001555`) ist
  dafür gemacht: bedienen, bis die Wirkung eintritt, statt einmal zu klicken und
  auf sie zu warten.
- **Den Aufbau über einen anderen Weg führen als die Prüfung.** Wo das nicht
  geht, gehört der abweichende Ausgangs-Zustand in einen **eigenen** Fall.
- **Wo ein Bedienweg an einem Bestands-Zustand hängt, reicht der Erst-Start
  nicht.** «Frisch gestartet» ist der Zustand des ersten Tages; der Alltag jedes
  Anwenders sieht anders aus.

Eingeordnet im Fehlerklassen-Register als eigener Untertyp von `L10` (Der
Prüffall stellt den Zustand her, den er prüfen will), getrennt vom benachbarten
Untertyp der erfundenen Gegenstands-Form, dessen Gegenmittel ein anderes ist:
gegen den realen Bestand prüfen statt gegen eine Miniatur.

## Setup-/Teardown-Vorlage für Temp-Verzeichnis-Tests

Windows-robust: Datei-Handles können kurz nach dem Schließen noch
gesperrt sein, deshalb Aufräumen mit Retries und try/catch.

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { beforeEach, afterEach } = require('vitest');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-test-'));
});

afterEach(() => {
  // Erst Modul-Ressourcen schließen (Watcher etc.), dann aufräumen.
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
  }
});
```

## Gates: pre-commit-Hook und Merge-Queue

Die Prüfungen sind auf zwei Ebenen verteilt: schnelle Gates lokal pro
Commit, die Suite einmal zentral vor der Integration. **Wie viel davon
läuft, hängt am geänderten Datei-Bestand** und nicht an der Absicht des
Vorgangs (Abschnitt „Änderungsklassen und Prüf-Ausschnitt").

**Prüfschritt bei der Einführung eines Wächters oder Registrier-Zwangs**
(seit dem 2026-09-03, Ergebnis der L12-Analyse). Ein neuer Zwang wirkt an
jedem Tor, das seinen Gegenstand durchläuft, und der einführende Vorgang
durchläuft selten alle. Zwei von drei Vorfällen der Register-Klasse L12 nach
dem 2026-08-30 stammen aus derselben Einführung, dem Zugangs-Wächter: Der
Quellcode-Export brach ab, weil das neue Modul nicht auf der Positivliste
stand, und die Release-Vorbereitung meldete «unplausibel wenige Fälle», weil
der Wächter eine Auflistung (`vitest list`) für einen Lauf hielt. Deshalb
beantwortet jeder Vorgang, der einen Wächter, einen Registrier-Zwang oder
eine Zugangs-Sperre einführt, vor dem Abschluss die **Tore-Frage** und hält
die Antwort im Lösungs-Kapitel fest: *Welche Tore laufen künftig durch diese
Prüfung, und durchläuft der einführende Vorgang jedes davon?* Die Tore sind
(1) der pre-commit-Hook, (2) der Prüf-Ausschnitt jeder Klasse — die
Zuordnung gemessen, siehe oben —, (3) die Voll-Suite, (4) der Quellcode-Export
samt der exportierten Suite im öffentlichen Repositorium, (5) die
Release-Vorbereitung mit ihren eigenen Aufrufen (Kennzahl, Bau), (6) das
Linux-Gate im Container, (7) die Auslieferung mit ihren Werkzeugen. Ein Tor,
das der Vorgang nicht selbst durchläuft, wird benannt und einmal ausdrücklich
gefahren oder als offen an den nächsten Durchlauf übergeben. Das ist ein
Prosa-Prüfschritt (Register-Klasse L7, als solcher benannt): Welche Tore ein
Zwang berührt, ist Beurteilung; maschinell ist allein die Zuordnungs-Messung.

**Lokal, pro Commit.** Der versionierte Hook unter `.githooks/pre-commit`
führt nacheinander `npm run format:check` (Prettier), `npm run lint`
(ESLint), den PM-Linter und seit dem 2026-09-03 die gedrosselte
Zuordnungs-Messung der gestagten Prüfdateien (`scripts/zuordnung-pruefen.js`,
Abschnitt «Änderungsklassen und Prüf-Ausschnitt») aus und verweigert den
Commit, sobald ein Schritt rot ist. Einmalige Aktivierung pro Klon:

```bash
git config core.hooksPath .githooks
```

Format-Check und Lint messen den **gesamten Arbeitsbaum**: unfertige,
noch nicht gestagte Arbeit eines Folge-Tasks blockiert damit auch den
Commit eines fertigen Tasks. Der PM-Linter misst dagegen den
**Git-Index** (`PM_LINT_SOURCE=index`), also den Commit-Stand; jeder
einzelne Commit muss deshalb für sich regelkonform sein.

**Zwei nicht blockierende Hinweise laufen davor** (PO-Staffelung vom
2026-08-20, erweitert am 2026-08-26): die Rückstands-Warnung
(`scripts/frische.js --warnung-pm`) und seit 4T-001194 der
Datei-Größen-Hinweis (`scripts/lint-datei-groessen.js --warnung`). Beide
melden auf stderr und enden immer mit 0; der Commit läuft weiter.
Der Größen-Hinweis misst wie das Gate den **Arbeitsbaum** — genau deshalb
darf er nicht sperren, denn er kann über Zeilen sprechen, die gar nicht in
den Commit wandern. Verbindlich bleibt das Gate der Merge-Queue, das den
Wächter seit demselben Vorgang auch im Prüf-Ausschnitt der budgetierten
Änderungsklassen fährt. Kosten des Hinweises: rund 165 ms gegenüber knapp
16 s für den ganzen Hook.

**Zentral, pro Integration.** Das Testsuite-Gate der Merge-Queue läuft am
Integrationsstand, zusammen mit Format-Check und Lint; erst bei Grün
erreicht ein Branch `main`. Sein Umfang folgt seit dem 2026-08-14 der
Änderungsklasse (Absatz „Stand der Umsetzung"). Ein
lokaler Lauf vor dem Abliefern eines Branches bleibt gute Praxis, das
Pflicht-Gate ist der Queue-Lauf. Bewusst ist die Suite nicht mehr Teil
des Hooks: Sie kostet pro Commit zu viel Zeit, und am Integrationsstand
ist ihre Aussage stärker als am Arbeitsbaum einer einzelnen Sitzung.

**Produkt-Code-Wächter der Queue** (4T-000860, Release-Isolation): Vor der
Gate-Strecke, unmittelbar nach dem Rebase, weist die Queue jeden Branch
ab, dessen Diff gegen den Integrationsstand `src/**`, `package.json` oder
`package-lock.json` berührt und der nicht mit `--release` integriert;
ein nicht ermittelbarer Diff wird abgewiesen statt durchgelassen (fail
closed). Produkt-Code erreicht `main` damit ausschließlich über die
Release-Strecke (Zug-Zweig mit Epic-Zweigen darunter, Konzept „Verteiltes Arbeitsmodell"). Das
zweite Netz ist der **Vollständigkeits-Abgleich** der Release-Vorbereitung
(4T-000861): Vor ihrem ersten Schritt müssen die Vorgangs-Kennungen jedes
Commits mit Produkt-Code-Anteil seit dem letzten Release-Tag im
Änderungsprotokoll-Block der Ziel-Version stehen (Ausnahmen: der
Release-Commit selbst und Commits, deren Produkt-Anteil allein
`src/shared/build-info.json` ist). Beide Wächter sind unit-getestet
(`test/unit/merge-queue.test.js`, `test/unit/release-vorbereitung.test.js`),
jeweils samt nachgestelltem 0.103.0-Fall.

Die E2E-Suite bleibt außerhalb beider Gates (Laufzeit); welche Specs pro
Task laufen, bestimmt ebenfalls die Änderungsklasse, im Release-Sammeltask
die Voll-Suite.

**Größenordnung der Stufen** (gemessen am 2026-07-25 auf dem
Arbeitsplatz-Rechner, 32 logische Kerne, unter leichter Fremdlast und
**seriell**, also ohne einen zweiten Suite-Lauf daneben; die
Streuung liegt lastbedingt bei rund 15 Prozent): pre-commit-Hook rund
15 s, davon rund 14,6 s auf Format und Lint und 0,6 s auf den PM-Linter;
Queue-Gates rund 87 s, davon rund 73 s Testsuite; Renderer-Bau rund 3 s;
E2E-Smoke-Suite rund 24 s; E2E-Voll-Suite rund 28 min bei 480 Fällen. Die
Zahlen ordnen die Hebel: Vier Testdateien (Merge-Queue, Web-Inhalte,
Quellcode-Export, Web-Handbuch) tragen 84 Prozent der Rechenzeit der
Unit-Suite, weil sie Wegwerf-Repositorien anlegen bzw. die Webseite
vollständig bauen; der gesamte Anwendungs-Code samt Render-Snapshots
kostet zusammen weniger als drei Sekunden. Eine Abstufung zahlt sich in
der Unit-Suite deshalb genau dann aus, wenn die Klasse diese vier
Werkzeug-Wächter auslässt.

**Diese Werte gelten für Windows** (4T-001540). Sie sind auf der Haupt-Plattform
gemessen und nicht auf die zweite übertragbar. Gemessen am 2026-09-08 an zwei
Voll-Läufen desselben Standes — je 331 Prüfdateien und 6063 Fälle, Windows gegen
Linux-Container:

- **In der Summe ist der Unterschied klein:** 210 s gegen 260 s über alle Fälle,
  Faktor **1,24**. Der Anwendungs-Code läuft auf beiden Plattformen gleich
  schnell.
- **Je Fall ist er dramatisch, aber nur für eine Gruppe:** Die Prüffälle, die den
  **Bestand als Ganzes lesen**, liegen im Container beim **20- bis 35-Fachen**
  ihres Windows-Wertes — `anforderungen` 35,7×, `ordner-import-zyklen` 33,1×,
  `konflikt-marker-bestand` 26,5×, `doku-landkarte` 26,3×, `pm-dokumente` 24,6×.
  Die Ursache liegt an der Brücke zum Windows-Laufwerk: Ein Datei-Zugriff kostet
  dort ein Vielfaches, unabhängig von der gelesenen Menge.
- **Die Zeitgrenzen halten dabei komfortabel.** Der höchste gemessene
  Auslastungsgrad ist **22 Prozent** (`pm-dokumente`, 19,8 s gegen 90 s); alle
  übrigen liegen darunter. Kein Fall **ohne** eigene Zeitgrenzen-Konstante kommt
  im Container über 2,5 s und damit in die Nähe der Voreinstellung von 5 s.

**Wer eine Zahl dieser Tabelle für den Container braucht, rechnet nicht mit dem
Summen-Faktor.** Er gilt für die Suite als Ganzes; für einen einzelnen
bestandslesenden Fall ist er um mehr als eine Größenordnung zu klein.

**Die Zeitgrenzen bleiben plattform-einheitlich — mit einer benannten Schwelle**
(Entscheidung des Product Owners vom 2026-09-08 zu `4T-001540`). Drei Wege
standen zur Wahl: Grenzen je Plattform, eine Grenze am teuersten Prüfstand, oder
die Kosten senken, indem das Unit-Gate wie das E2E-Gate aus einer Kopie im
Container-Dateisystem liefe. Entschieden ist **keiner davon**, sondern das
Beobachten: Eine Regel-Änderung ohne belegten Anlass wäre selbst ein Fehler.

**Berichtigung vom 2026-09-09 (`4T-001632`):** Der Satz «die Erhebung hat die
vermutete Lücke widerlegt» stand hier bis dahin ohne Einschränkung und trug
weiter, als die Messung reicht. Jene Erhebung misst je Prüffall den Abstand zu
**der Grenze, die er trägt**, und sieht damit ausschließlich Fälle **mit**
benannter Grenze. Die drei Fälle, die am 2026-09-08 das Integrationstor
schlossen, trugen keine und kamen in ihr nicht vor. Der Widerlegungs-Satz gilt
für die gemessene Menge und nicht darüber hinaus.

**Die Wiedervorlage ist eine Zahl und kein Gefühl:** Überschreitet ein Prüffall
im Container **50 Prozent** seiner Zeitgrenze, ist das der Anlass, die Kosten
anzugehen — also das Unit-Gate aus der Kopie zu fahren, statt die Grenze erneut
zu heben. Gemessen wird bei der nächsten Plattform-Erhebung; bei der Entscheidung
lag der höchste Wert bei 22 Prozent.

**Die Schwelle ist am 2026-09-20 überschritten, und der entschiedene Weg ist
gefahren** (`4T-001837`). In der Release-Strecke des Zuges zur sechsten
Canvas-Stufe wurde das Unit-Gate im Container am selben Stand dreimal rot,
zuletzt zweimal ausschließlich durch Zeitüberschreitungen in den vier
Bau-Prüfdateien des Webseiten-Baus (`web-inhalte`, `web-kennzahlen`,
`web-handbuch`, `web-roadmap`), je Lauf in anderen Fällen und der letzte Lauf
ohne jede Parallel-Last. Die Höchstwerte lagen bei 31 bis 54 s gegen eine
Zeitgrenze von 30 s, also zwischen 103 und 181 Prozent; unter Windows war
dieselbe Suite am selben Stand vollständig grün. Ausgelöst hat das Wachstum die
maschinenlesbare Dokumentations-Fassung, mit der der Webseiten-Bau seit demselben
Tag zusätzlich die Markdown-Fassung aller Handbuch-Seiten je Sprache erzeugt.

**Umgesetzt ist genau das, was der Absatz oben vorschreibt, und nichts darüber
hinaus:** Das Unit-Gate fährt seit dem 2026-09-20 aus der Kopie im
Container-Dateisystem (Abschnitt «Das Kommando» weiter unten), und die Werte in
[`zeitlimits.js`](zeitlimits.js) sind unverändert geblieben. Die Zeitgrenzen
bleiben damit plattform-einheitlich und auf der Haupt-Plattform so scharf, wie
sie waren.

**Die Wirkung, gemessen am selben Tag und am selben Stand:** Der Lauf brauchte
2 min 59 s Wanduhr, davon 92 s für die Kopie und 72 s für das Gate, gegen rund
17 Minuten über die Brücke; grün waren 8509 von 8519 Fällen bei zehn
übersprungenen und keinem roten. Die vier Bau-Prüfdateien liegen aus der Kopie
bei 4 bis 6 Prozent ihrer Zeitgrenze statt bei 103 bis 181, und der teuerste
Fall des gesamten Laufs brauchte 2,1 Sekunden.

**Warum die Kosten und nicht die Grenze:** Eine erneute Anhebung verlöre weiter
an Schärfe auf der Haupt-Plattform. `pm-dokumente` dürfte auf Windows heute
schon das Hundertfache seiner 0,8 s brauchen, bevor etwas auffällt — dieser
Preis ist mit der Anhebung vom 2026-08-31 bezahlt und soll nicht wachsen.

**Die Schwelle gilt für Fälle mit benannter Grenze, und für die anderen gilt
nicht etwa eine zweite** (`4T-001632`, Reichweite geklärt am 2026-09-09). Für
einen Fall ohne benannte Grenze ließe sich zwar gegen die Vitest-Voreinstellung
von 5000 ms rechnen — das Ergebnis wäre aber für jeden Fall, der im Modulkopf
liest, bedeutungslos: Sein Prüffall ist schnell, die Marke bliebe bei null
Prozent, und die Lesung, um die es geht, käme in der Rechnung nicht vor. Diese
Fälle deckt deshalb die Lese-Ort-Regel unten, nicht eine zweite Schwelle mit
anderer Bezugsgröße. **Eine Schwelle, ein Bezug.**

### Bestands-Lesungen gehören in den Modulkopf

**Die Regel** (Entscheidung des Product Owners vom 2026-09-09 zu `4T-001632`,
Wege A' und D): Wer in einer Prüfdatei einen Baum des Repositoriums liest —
`src/`, `test/`, `Projektmanagement/`, `web/`, `scripts/`, `docs/` —, tut das im
**Modulkopf**. Wer ihn stattdessen im Rumpf eines Prüffalls liest, gibt der
Datei ein benanntes Zeitlimit aus [`zeitlimits.js`](zeitlimits.js), in aller
Regel `BESTAND_ZEITLIMIT`, datei-weit über `vi.setConfig`.

**Warum der Ort und nicht die Menge.** `testTimeout` bemisst den **Rumpf eines
Prüffalls**, sonst nichts. Die Erhebung vom 2026-09-09 hat alle 343
Unit-Prüfdateien vermessen und den Unterschied an zwei Fällen sichtbar gemacht,
die weiter nicht auseinanderliegen könnten:

| Prüfdatei | Bestandslesungen | davon im Prüffall | teuerster Fall |
|---|---|---|---|
| `roadmap-zuordnung` | 1831 | **0** (Modulkopf) | 3 ms |
| `save-guard-aufrufer` | 231 | **231** (verzögert im ersten Fall) | riss die 5000 ms |

Die Datei mit der **achtfachen** Lesemenge ist die ungefährliche. Wer nach
Lesemenge sortiert, ordnet die Gefahr falsch — und wer allen bestandslesenden
Dateien pauschal ein Limit gäbe, erzeugte Vertrauen ohne Deckung, weil es dort,
wo im Modulkopf gelesen wird, nichts bemisst.

**Der Wächter** ist `scripts/lese-ort-regel.js`, gefahren von
`scripts/zuordnung-pruefen.js` auf derselben Messung, die die Zuordnung prüft,
und damit im pre-commit-Hook für jede gestagte Prüfdatei. Er meldet eine Datei,
die **im Prüffall** mindestens 100 Bestands-Pfade liest und kein benanntes
Zeitlimit trägt. Die Marke setzt [`phase-marke.js`](phase-marke.js) zur
Laufzeit; gemessen statt am Quelltext geprüft, weil `save-guard-aufrufer` seinen
Baum hinter einer Hilfsfunktion liest und eine Quelltext-Regel ausgerechnet
diesen Anlassfall nicht fände.

**Die Schwelle 100 ist abgelesen, nicht gesetzt.** In der Verteilung der 343
Prüfdateien liegt zwischen 50 und 99 Bestandslesungen **keine einzige** Datei:
240 lesen gar nichts, 51 lesen ein bis neun Pfade, 13 lesen zehn bis 49 — und
dann kommt eine Lücke, hinter der die 39 Dateien stehen, die über einen Baum
laufen. Verschiebt eine spätere Erhebung diese Lücke, wandert die Zahl mit; sie
steht deshalb an einer Stelle in `scripts/lese-ort-regel.js` und hier.

### Änderungsklassen und Prüf-Ausschnitt

Die Klassen sind ausschließlich am geänderten Datei-Bestand definiert.
Sie sind unabhängig von den Aufgaben-Klassen K1 bis K4 der
[CLAUDE.md](../CLAUDE.md), die die Bearbeitungstiefe eines Vorgangs
steuern: Ein mechanischer Vorgang kann Ä7 auslösen (Umbenennung in einem
`src/shared`-Modul nach vorliegender Tabelle), ein Grundsatz-Vorgang Ä1
(Entscheidungsvorlage, die nur eine Markdown-Datei ändert).

| Klasse | Datei-Muster | Ausschnitt der Unit-Suite | E2E |
|---|---|---|---|
| **Ä1 Dokumentation** | `Projektmanagement/**`, `docs/**`, `*.md` in der Wurzel außer `CHANGELOG.md`, `test/README.md`, `web/roadmap-zuordnung.json` | PM-Wächter (`pm-dokumente`, `ueberblick-aggregate`, `roadmap-zuordnung`, `dashboard-sicht`) plus `quellcode-export` und `doku-pfade`; kein Format, kein Lint | keine |
| **Ä2 Auslieferungs-Texte** | `CHANGELOG.md`, `docs/öffentlich/**`, `web/inhalte/versionen/**` | Ä1 plus `web-inhalte` | keine |
| **Ä3 Sprachdateien und Katalog** | `src/i18n/**`, `test/abdeckungs-matrix.json` | Katalog-Gruppe: `i18n`, `abdeckungs-matrix`, `manual-pages`, `manual-generated`, `hilfetext-stil`, `rueckverweis-webseite`, `bildmarke`, `panel-access`, `command-placement`, `commands`, `menu-accelerator`, `register-paare`, `color-schemes`, `web-handbuch`, `web-handbuch-funktionen`, `web-mermaid`, dazu die drei Renderer-Wächter `frontmatter-query-view`, `graph-view`, `perspective-script-view`, dazu `doku-pfade`; Format wegen JSON | Smoke plus `regression/4t-0185.spec.js`; bei `src/i18n/help/**` zusätzlich `funktionen/handbuch.spec.js` |
| **Ä4 Renderer-Modul** | `src/renderer/**` ohne `index.html` | Import-Graph-Ausschnitt des geänderten Moduls plus `test/unit/renderer/**`, `spellcheck`, `save-guard-aufrufer`, `panel-access`, `script-sandbox-runtime`, `color-schemes`, `doku-pfade`, `datei-groessen`, `plattform-erosion`; Format und Lint | Smoke plus die Funktions-Specs des berührten Bereichs |
| **Ä5 Main, Preload und Bau** | `src/main/**`, `scripts/build-*.js`, `package.json` (Feld `build`), `build/**` | Import-Graph-Ausschnitt plus `archive-build`, `build-version`, `auffang-ebene-main`, `spellcheck`, `bildmarke`, `release-hinweise`, `doku-pfade`, `datei-groessen`, `plattform-erosion`; Format und Lint | Smoke plus EXE-Smoke-Test |
| **Ä6 Werkzeuge und Webseite** | `scripts/**` außer `build-*`, `web/**` außer `roadmap-zuordnung.json` und `inhalte/versionen/**` | Werkzeug- und Web-Wächter der berührten Familie plus `quellcode-export` (Positivliste), `doku-pfade` und `datei-groessen`; Format und Lint | keine |
| **Ä7 Geteilte Kern-Module** | `src/shared/**`, `src/renderer/index.html`, `src/demo/**` | **Voll-Suite unverändert** | Smoke plus alle Specs der berührten Funktionsbereiche |
| **Ä8 Geänderte Prüffälle** | `test/unit/**/*.test.js`, `test/e2e/**/*.spec.js` | der geänderte Prüffall selbst plus `datei-groessen`, `aenderungsklassen` und `quellcode-export-listen`; Format und Lint | keine über die geänderte Spec hinaus |

**Warum die Auslassungen tragen.** Für Ä1 folgt es aus den
Ignore-Dateien: `.prettierignore` schließt `*.md` und
`Projektmanagement/` aus, `eslint.config.js` ignoriert
`Projektmanagement/` und prüft ohnehin kein Markdown; kein Werkzeug- und
kein Modul-Test liest eine PM-Datei. Für Ä4 und Ä5 gilt die Gegenrichtung:
`scripts/build-web.js` bindet aus der Anwendung nur `src/shared`-Module
ein, weshalb die teuren Web- und Release-Wächter von einer reinen
Renderer- oder Main-Änderung nicht kippen können. Ä7 lässt nichts aus, und
genau das ist die Abgrenzung: Über `build-web.js` schlägt eine Änderung an
`markdown.js`, `manual-pages.js`, `manual-generated.js` oder `commands.js`
bis in die Web-Wächter durch, `index.html` ist die Grundlage der
Paritäts-Wächter und `src/demo/**` die des Manifest-Wächters. Bei Ä3 ist
die Auslassung auf E2E-Seite bewusst unvollständig: Einzelne Specs prüfen
auf lokalisierte Texte, deshalb bleibt dort eine E2E-Pflicht.

**Die Tabelle nennt die fachlich begründeten Kern-Wächter je Klasse; die
gemessenen Nachzüge stehen in der Karte** (seit dem 2026-09-03, Ergebnis
des ersten vollen Messdurchgangs von `scripts/zuordnung-pruefen.js`: 80
Zuordnungen waren enger als die Messung). Nachgezogen wurden in der Karte
unter anderem die jsdom-Render-Wächter, die `src/i18n/de.json` als Daten
lesen (Ä3), die Struktur-Wächter, die Renderer-Module und Stil-Dateien als
Text lesen (Ä4), die Werkzeug-Wächter mit einer JSON-Eingabe unter
`scripts/` (Ä6) und die Wächter, die den Prüf-Bestand selbst lesen (Ä8).
Wo eine Prüfdatei Pfade einer Klasse liest und dort **bewusst** nicht im
Ausschnitt steht, trägt die Karte das Feld `bewusstAusserhalb` mit dem
Grund je Klasse — der Export-Wächter kopiert den Baum, der Queue-Wächter
kopiert Skripte als Fixture, die Web-Bau-Wächter lesen kopierte
Stil-Dateien ohne Prüf-Aussage und aus `package.json` allein die
Versions-Nummer, der Kennungs-Wächter sucht Kommentare im Quelltext. Das
Werkzeug meldet diese Lagen als Hinweis, damit sie sichtbar bleiben, und
jede neue Abweichung als Befund. Wer die Tabelle liest, liest den Kern;
wer wissen will, was eine Klasse tatsächlich fährt, liest die Karte.

**Warum in Ä8 drei Wächter stehen und nicht einer** (seit dem 2026-09-01).
Die Klasse trägt zwei verschiedene Lagen unter einem Muster: eine
**geänderte** Prüfdatei und eine **hinzugefügte**. Für die geänderte gilt
„ein Prüffall prüft sich selbst"; für die hinzugefügte gilt das nicht, denn
sie löst zwei Wächter aus, die eine Änderung an ihr selbst nie auslösen
könnte — die Zuordnung in der Klassen-Karte (`aenderungsklassen`) und den
Eintrag in den Test-Ausnahmen des Quellcode-Exports
(`quellcode-export-listen`). Die Auswahl **sieht** den Unterschied nicht,
weil ihre Eingabe `git diff --name-only` ist und keinen Datei-Status trägt;
deshalb laufen beide Wächter fest mit, statt den Status zu lesen.

Der Preis ist bewusst klein gehalten: zusammen rund **zwei Sekunden**.
Möglich wurde das durch einen Schnitt — die reinen Listen-Prüfungen des
Export-Wächters liegen seither in
`test/unit/quellcode-export-listen.test.js` (0,57 s), während
`test/unit/quellcode-export.test.js` mit seinen echten Wegwerf-Repositorien
rund 32 Sekunden braucht und in Ä8 nichts zu suchen hat.

Ohne die Ergänzung integrierte die Merge-Queue einen Zweig grün, der den
Integrationsstand rot hinterlässt: gemessen fünf so exponierte Commits in
60 Tagen (250 Commits fügten eine Prüfdatei hinzu, bei fünf davon zog keine
Nachbar-Änderung die Wächter mit). Ein **Rückfall** auf die vollen Gates
wäre das falsche Mittel gewesen, weil er die häufige Lage „Code-Änderung
samt Regressionstest" mitträfe und der Abstufung vom 2026-08-14 ihren
Gewinn nähme.

**Drei Buchführungs-Wächter laufen in jedem Ausschnitt** (seit dem
2026-09-03). `aenderungsklassen`, `abdeckungs-matrix` und `datei-groessen`
prüfen nicht die geänderte Fachlichkeit, sondern die Buchführung über den
Bestand: die Zuordnung jeder Prüfdatei in der Klassen-Karte, den Eintrag
jedes Katalog-Schlüssels in der Abdeckungs-Matrix und die
Datei-Größen-Budgets. Genau deshalb liegen sie regelmäßig außerhalb des
Ausschnitts, den der Änderungs-Umfang auswählt — und ein Verstoß fiel
viermal nicht beim Verursacher auf, sondern im nächsten Voll-Lauf: zweimal
in einer fremden Sitzung (2026-08-20), zweimal auf der Release-Strecke der
verursachenden Sitzung (2026-08-23, je rund eine Stunde). Die Gruppe steht
in der Karte (Feld `immerImAusschnitt`), und die Auswahl mischt sie nach
der Klassen-Vereinigung und nach der Leer-Prüfung ein. Damit greift sie an
beiden Enden, im Queue-Lauf wie im lokalen Gate-Weg, weil beide dieselbe
Auswahl fahren. Die Tabelle oben nennt die drei weiterhin dort, wo eine
Klasse sie aus eigenem Grund braucht; die Gruppe ist die Heimat der
klassen-unabhängigen Regel, und die Vereinigung dedupliziert. Preis: rund
eine halbe Sekunde Prüfzeit (gemessen am 2026-09-03: 22 Fälle in 426 ms).

**Die Zuordnung eines Wächters wird gemessen, nicht geraten** (seit dem
2026-09-03, Ergebnis der L12-Analyse). Sechs Vorfälle in elf Tagen hatten zu
fünf Sechsteln dieselbe Bauform: Die Zuordnung eines Wächters — sein
Ausschnitt oder seine Ausnahme — nannte eine engere Eingabe als die, die er
tatsächlich liest, und die Auswahl fuhr ihn in Klassen nicht, deren
Änderungen er sieht. Gemessen am 2026-09-03 mit dem Lese-Hook
`scripts/eingaben-spur.js`: Der Karten-Wächter liest den ganzen Test-Baum
(247 Dateien), nicht nur die Karte; der Größen-Wächter alle vier
Budget-Wurzeln (`src` 435, `test` 410, `scripts` 141, `web` 13); der
Anforderungs-Wächter 752 Dateien unter `Projektmanagement/`, obwohl er als
Werkzeug-Wächter geführt war. Deshalb gilt bei jeder neuen oder geänderten
Zuordnung: einmal mit dem Hook laufen lassen und die Wurzel-Ordner der Spur
gegen die Klassen-Muster halten, in deren Ausschnitt der Wächter steht — was
er liest, muss ihn auslösen. Der Aufruf steht im Kopf des Hooks; er braucht
`--pool=forks` und, weil er an einer einzelnen Prüfdatei läuft, keine
Zugangs-Marke. Der sechste Vorfall passte nicht in die Bauform: Der
Zugangs-Wächter hielt eine Auflistung für einen Lauf, ein Fehler der
Einführung, nicht der Zuordnung — dafür steht der Prüfschritt im Abschnitt
«Gates».

**Seit dem 2026-09-03 prüft das ein Werkzeug, nicht die Aufmerksamkeit**
(Entscheidung des Product Owners, PM-Pflege-Welle 4). Die Messregel oben
hing an dem, der eine Zuordnung schreibt, und prüfte nur die eine, die
gerade entstand; der Bestand, dessen Eingaben sich mit jedem Umbau
verschieben, blieb ungemessen. `node scripts/zuordnung-pruefen.js` misst je
Unit-Prüfdatei die gelesenen Pfade (Lese-Hook mit `FS_SPUR_NUR_WORKER=1`,
also allein der Prüf-Prozess) und hält sie gegen die Karte: In jeder
Klasse, deren Muster ein gelesener Pfad trifft, muss die Prüfdatei im
Ausschnitt stehen — oder die Klasse deckt sie anders (Voll-Suite, feste
Wächter-Gruppe, Selbst-Klasse, Modul-Graph über die statische
Import-Kette — seit dem 2026-09-07 dieselbe Kette, die auch die Gate-Auswahl
benutzt, siehe unten). Alles andere ist ein **Befund**: eine Zuordnung, die enger
ist als die Messung, die Bauform der fünf Fälle. Die Gegenrichtung, ein
Ausschnitts-Eintrag ohne gemessene Eingabe der Klasse, ist ein **Hinweis**,
weil sie Prüfzeit kostet und keine Deckung. Drei Zuschnitts-Entscheidungen:
**prüfen statt herleiten**, damit die Begründungen der Karte stehen bleiben;
**gedrosselt** im pre-commit-Hook für die gestagten Prüfdateien mit
Inhalts-Hash je Datei im unversionierten Messstand
`.git/em4me-zuordnung-messstand.json` (rund anderthalb Sekunden je Messung,
eine bereits gemessene Fassung kostet nichts); und ein **voller Durchgang**
(`--alle --bericht test-berichte/zuordnung-messung.json`) als dritter
Sichtungs-Punkt in Schritt 6 der Release-Strecke, weil ein Umbau an
Quell-Modulen die Eingaben einer ungeänderten Prüfdatei verschiebt. Außerhalb
bleiben, was kein Datei-Zugriff zeigt (Require-Kette der
Test-Konfigurationen, Umgebungsvariablen, Wegwerf-Repositorien) und die
E2E-Specs, deren Messung ein laufendes Programm bräuchte. Die fünf Fälle aus
der L12-Analyse sind als Regressions-Fälle in
`test/unit/zuordnung-pruefen.test.js` am Stand vor ihrer Behebung
nachgestellt.

**Struktur-Schnitte nehmen die Regression- und Perf-Specs des berührten
Reviers mit** (Erkenntnis der Release-Abnahme vom 2026-08-13). Verschiebt
ein Vorgang Code, statt ihn zu ändern — Datei-Schnitt, Modul-Umzug,
Umbenennung —, dann gehören zum Prüf-Ausschnitt seiner Klasse zusätzlich
die Specs unter `test/e2e/regression/` und `test/e2e/perf/`, die das
berührte Revier betreffen. Die E2E-Spalte der Tabelle nennt Smoke- und
Funktions-Specs, weil die den geänderten Fall prüfen; ein Struktur-Schnitt
ändert aber gerade keinen Fall, sondern dessen Umgebung, und die beiden
Ordner halten als einzige fest, was in dieser Umgebung schon einmal
schiefgegangen ist. Anlass: Beim Konsolidierungs-Release umfassten die
Task-Ausschnitte durchgängig Smoke- und Funktions-Specs, die beiden Ordner
aber nie; zwei echte Befunde wurden dadurch erst am E2E-Voll-Lauf der
Abnahme sichtbar, beide in Revieren, die geschnitten worden waren.

Die Regel steht bewusst nur hier und nicht in der Klassen-Karte: Ob ein
Vorgang ein Struktur-Schnitt ist, ist eine Eigenschaft des Vorgangs und
nicht seines Datei-Bestands, und die Karte kennt allein Muster. Sie steuert
damit die Läufe, die eine Sitzung selbst startet, sowie den Zuschnitt, den
ein Epic seinen Tasks vorgibt.

**Diese Prüfungen laufen unabhängig vom Änderungs-Umfang**, jede aus
eigenem Grund:

1. **PM-Linter** (0,6 s). Billiger als die Buchführung über sein
   Auslassen; seine Eingabe ist faktisch in jedem Vorgang berührt, weil
   die Commit-Disziplin Status-Wechsel und Eltern-Listen in denselben
   Commit legt; und er prüft bestandsweite Invarianten, die eine einzelne
   geänderte Datei kippen kann.
2. **Überblick-Aggregate** (`ueberblick-aggregate.test.js`). Die
   Merge-Queue erzeugt die Aggregate am Integrationsstand selbst neu; der
   geprüfte Stand entsteht erst dort und ist im abgelieferten Branch gar
   nicht enthalten.
3. **Roadmap-Zuordnung** (`roadmap-zuordnung.test.js`). Eine Anlage ohne
   festgehaltene Antwort ist ein belegter, wiederkehrender Fehlerfall.

**Rückfall auf die vollen Gates**, sobald eines davon zutrifft: Der
Änderungs-Umfang lässt sich nicht ermitteln; mindestens eine geänderte
Datei passt auf kein Muster; die Klassen-Karte selbst,
`scripts/merge-queue.js`, die Gate-Definition `scripts/gate-lauf.js`, die
Auswahl-Funktion `scripts/gate-auswahl.js`,
eine Test-Konfiguration oder eine Ignore-Datei ist geändert; der Lauf ist
eine Release-Integration (`--release`). Ergänzend gilt fail-closed: eine
Ausnahme in der Auswahl, eine unlesbare Karte und ein leeres
Auswahl-Ergebnis führen ebenfalls auf die vollen Gates, nie auf weniger.
Unter `test/` fallen Konfiguration, Helfer und Fixtures zurück, weil sie
auf fremde Prüffälle wirken, deren Auswahl daraus nicht ableitbar ist; ein
geänderter Prüffall selbst ist seit dem 2026-08-14 die Klasse Ä8 und läuft
als sein eigener Ausschnitt. Die frühere Regel, die jede Änderung unter
`test/` zurückfallen ließ, traf mit 137 von 248 Rückfällen der Erhebung
genau den Vorgang, den die Konvention vorschreibt, nämlich Code-Änderung
samt Regressionstest (Entscheidung des Product Owners vom 2026-08-14).

Ebenso zurück fällt eine Änderung unter `addon_examples/`. Die
Beispiel-Erweiterung geht nicht in die Anwendung ein, ist aber zugleich
Eingabe des Paket-Scan-Tests, des Render-Plugin-Tests und der E2E-Spec der
externen Erweiterungen sowie Gegenstand der Export-Positivliste. Eine
eigene Klasse hätte für einen selten geänderten Pfad drei Ausschnitte zu
pflegen; der benannte Rückfall ist hier das günstigere Mittel und macht
sichtbar, was sonst still geschähe.

**Mehrere Klassen: die Vereinigung der Ausschnitte** (Entscheidung des
Product Owners vom 2026-07-25). Berührt ein Änderungs-Umfang mehrere
Klassen, läuft die Summe ihrer Prüf-Ausschnitte, weder der Ausschnitt
einer einzelnen Klasse noch pauschal die vollen Gates. Zwei Gründe: Die
Ausschnitte sind nicht ineinander enthalten, weshalb eine „strengste
Klasse" eine geforderte Prüfung fallen ließe. Ein Branch mit
`CHANGELOG.md` (Ä2) und einem Renderer-Modul (Ä4) verlöre nach einer
Rangfolge den Wächter `web-inhalte`, obwohl dieser `CHANGELOG.md` liest.
Und weil die Commit-Disziplin den Status-Wechsel in denselben Commit legt
wie die Umsetzung und die Merge-Queue ihren Aggregat-Commit hinzufügt,
trägt fast jeder Code-Branch zusätzlich Ä1; die Lesart „bei mehreren
Klassen immer volle Gates" beschränkte den Gewinn damit auf reine
Dokumentations-Branches. Ist Ä7 beteiligt, läuft die Voll-Suite, weil das
der Ausschnitt dieser Klasse ist. Gegen die klassenübergreifende
Wechselwirkung, gegen die eine Vereinigung nichts ausrichtet, stehen die
benannten Rückfall-Fälle oben und der turnusmäßige Voll-Lauf.

**Turnusmäßiger Voll-Lauf**, unabhängig von der Klasse: vor jedem Release,
das ohnehin die strengste Stufe fährt, und beim ersten Integrationslauf
eines Arbeitstages. Der zweite Punkt kostet höchstens 87 s je Tag und
fängt die Fälle, in denen die Klassen-Zuordnung still veraltet ist. Das
Release-Gate selbst bleibt unverändert Pflicht: vor Build und Tag ist die
vollständige Suite (Unit, Snapshot und E2E-Voll-Suite) grün. **Seine
einzige Ausnahme:** Berührt der Änderungs-Umfang seit dem vorangegangenen
Release-Tag keine Datei unter `src/` außer `src/shared/build-info.json`,
genügen Smoke-Suite und EXE-Smoke-Test, weil die E2E-Voll-Suite gegen
unveränderte Anwendungs-Dateien läuft und kein anderes Ergebnis liefern
kann als beim vorangegangenen Release.

**Kein nachträglicher Voll-Lauf nach einem roten Ausschnitt.** Ein roter
Ausschnitt ist ein Befund und wird behoben; der darauf folgende Lauf ist
ohnehin fällig. Für den Wiederhol-Umfang nach einem punktuellen Fix gilt
die Wiederhol-Regel des Konzepts Test-Strategie und
Qualitätssicherung,
Kapitel 2.

**Lokale Läufe.** `npx vitest related <geänderte Dateien>` gibt schnelle
Rückmeldung (je nach Modul 8 bis 27 s statt rund 73 s), taugt aber **nicht
als Nachweis**: Die Auswahl folgt dem Modul-Graphen, und die
Daten-Kopplungen stehen dort nicht drin. Belegt an zwei Proben —
`vitest related src/i18n/de.json` und `vitest related <PM-Datei>` wählen
**null** Testdateien aus, obwohl mehr als ein Dutzend Wächter genau diese
Dateien lesen. Auch `vitest related src/shared/markdown/markdown.js`
findet die drei Web-Wächter nicht, die das Modul über `build-web.js`
laden. Der Nachweis bleibt der Queue-Lauf.

**Stand der Umsetzung: scharf seit dem 2026-08-14.** Die Karte aus
Pfad-Mustern liegt als `scripts/aenderungsklassen.json` und ist die
maschinenlesbare Fassung der Tabelle oben; `scripts/gate-auswahl.js` wertet
sie als reine Funktion aus, ohne Git- und ohne Dateisystem-Zugriff; der
Meta-Test `test/unit/aenderungsklassen.test.js` hält die Karte in beide
Richtungen gegen den realen Bestand, also jede Testdatei einem Ausschnitt
zugeordnet oder mit Begründung ausgenommen und jeder versionierte Pfad auf
mindestens einem Muster. Die Merge-Queue **wählt** danach ihren
Gate-Umfang: Format und Lint laufen nur, wenn die Klasse sie verlangt,
statt der vollen Suite läuft der Ausschnitt, und Klassen mit Modul-Graph
hängen einen zusätzlichen `vitest related`-Lauf an. Der Modul-Graph grenzt
dabei innerhalb einer Klasse weiter ein und ist nie alleinige Grundlage.
Das Protokoll nennt den **tatsächlich ausgeführten** Umfang, damit ein
grüner Teil-Lauf nicht als grüner Voll-Lauf gelesen werden kann.

**Seit dem 2026-09-07 kommt bei diesen Klassen die statische Import-Kette
hinzu** (`scripts/import-kette.js`): Der Ausschnitt nimmt zusätzlich die
Prüfdateien auf, die eine geänderte Datei über ihre Import-Kette erreichen.
Anlass ist eine gemessene Lücke: `vitest related` folgt **keiner
`require`-Kante**, und da `scripts/` CommonJS ist, ist das dort der
Normalfall. Am 2026-09-07 galten dadurch **78 der 321 Prüfdateien** — 24 %
des Bestands, 1031 Paare aus Prüfdatei und Quellpfad — über die Kette als
gedeckt, ohne bei einer Änderung ihres Gegenstands je zu laufen; die
Zuordnungs-Prüfung sagte «gedeckt», wo der Lauf nichts fand. Die Ursache ist
**nicht** auf `createRequire` beschränkt, wie zunächst vermutet: Nur 11 der
78 benutzen es überhaupt, und es genügt eine `require`-Kante irgendwo in der
Kette.

Der Product Owner hat am 2026-09-07 entschieden, den **Lauf an die Erkennung**
anzugleichen statt umgekehrt: Die Gegenrichtung hätte nur die Buchführung
berichtigt — die 78 Prüfdateien liefen weiterhin nicht. Preis, ebenfalls
gemessen: je geändertem Quellpfad zusätzlich im Median 4, im Mittel 7,7 und
höchstens 25 Prüfdateien, dazu rund eine Sekunde für die Ketten-Bildung je
Auswahl. Der `vitest related`-Lauf bleibt **daneben** bestehen und wird nicht
ersetzt: Er findet, was Vite auflöst und eine Textanalyse nicht sieht. Beide
Richtungen derselben Kante — die Zuordnungs-Prüfung fragt vorwärts, die
Gate-Auswahl rückwärts — liegen seither in **einem** Modul, weil ihr
Auseinanderlaufen der Befund war.

Entschieden wurde die Scharfschaltung auf einer Auswertung aller 439
Integrations-Vorgänge seit Beginn des Schattenbetriebs: kein einziger
unbekannter Pfad, und die erkannten Klassen entsprachen dem realen
Änderungs-Umfang (4T-000744).

**Not-Aus.** `node scripts/merge-queue.js <branch> --volle-gates` erzwingt
Format, Lint und die vollständige Suite ohne Code-Änderung und ohne
Kenntnis der Karte; dieselbe Wirkung hat die Umgebungsvariable
`EM4ME_VOLLE_GATES=1`, mit der ein Clone sie dauerhaft setzen kann. Er ist
die Rückfallebene, falls die Auswahl im Betrieb auffällig wird.

**Turnusmäßiger Voll-Lauf.** Der erste Integrationslauf eines
Kalendertages fährt unabhängig von der Klasse die vollen Gates; ebenso
jede Release-Integration (`--release`). Verglichen werden Kalendertage und
nicht Datei-Zeiten gegen die Uhr, weil ein mtime-Vergleich gegen
`Date.now()` unter Windows nachweislich brüchig ist (Befund aus 4T-000729).
Der Vermerk liegt unversioniert im `.git`-Verzeichnis des
Integrations-Clones; ist er nicht lesbar, gilt der Voll-Lauf als fällig.

## Prüf-Umfang je Plattform

**Diese Festlegung und die Änderungsklassen oben gehören zusammen gelesen.** Die Klasse beantwortet, **welcher Ausschnitt** der Suite ein Vorgang braucht; dieser Abschnitt beantwortet, **auf welcher Plattform** er läuft. Beide Fragen sind unabhängig: Ein Ä1-Vorgang bleibt Ä1, gleich wo er geprüft wird.

Festgelegt am 2026-08-28 durch den Product Owner (Vorgang 4T-001251), auf der Grundlage **gemessener** Werte aus dem ersten Linux-Betrieb und nicht aus Schätzungen.

### Die vier Größen

1. **Haupt-Plattform ist Windows.** Sie trägt die **vollständige** Suite ohne Ausnahme. Jede Prüfung, die irgendwo läuft, läuft hier.
2. **Je weiterer freigegebener Plattform läuft der vollständige Ausschnitt**, also Unit-Suite **und** E2E-Suite. Die Beschränkung auf die Unit-Suite ist ausdrücklich **verworfen**: Alle drei Produkt-Befunde des ersten Linux-Laufs am 2026-08-28 lagen in der E2E-Suite, keiner in der Unit-Suite. Wer dort kürzt, prüft genau den Teil, der ohnehin plattformneutral ist.
3. **Der manuelle Test bleibt für Windows die Regel und findet auf weiteren Plattformen nur bei Anlass statt — und was ein Anlass ist, sagt ein benannter Auslöser-Katalog, nicht das Ermessen der Release-Sitzung** (Entscheidung des Product Owners vom 2026-09-03, Weg 3 aus `4T-001382`; bis dahin stand hier ein Prosa-Urteil, dem die Release-Strecke mit «eine Strecke je ausgelieferter Bezugs-Form» widersprach, und bei `1.125.1` entschied die Anordnung des Product Owners statt des Regelwerks). Ein Anlass liegt vor, sobald **einer** der folgenden Auslöser zutrifft: **(a)** Bau-Ziele und Bau-Konfiguration (`build/**`, `scripts/build-*.js`); **(b)** Datei-Zuordnung (Dateitypen, Protokoll-Registrierung); **(c)** Desktop-Einbindung (Menü- und Start-Einträge, Icons, Autostart); **(d)** Pfad- und Dateisystem-Verhalten des Haupt-Prozesses (plattformgebundene Zweige unter `src/main/**`, Groß-/Kleinschreibung, Symlinks, Berechtigungen); **(e)** jede Änderung am `build`-Block der `package.json`; dazu **(f)** ein Befund des automatisierten Laufs auf der Plattform, der eine Sicht-Prüfung braucht. Trifft keiner zu, genügt die Windows-Strecke, und der Sammeltask hält das mit dem geprüften Katalog fest («kein Auslöser, a bis f geprüft»). Fünf der sechs Auslöser sind am Release-Diff erkennbar; eine maschinelle Stütze ist deshalb möglich und bewusst noch nicht gebaut — erst wenn sich der Katalog an zwei Releases bewährt hat, lohnt ein Werkzeug, das die Auslöser aus dem Diff vorschlägt, und (f) bleibt ohnehin ein Urteil. Grund: Der gründliche manuelle Durchgang vom 2026-08-26 fand drei Befunde und **keinen** der drei, die die automatisierte Suite zwei Tage später fand. Beide Prüf-Arten sehen Verschiedenes; die manuelle ist die teurere und gehört dorthin, wo sie allein etwas leisten kann.
4. **Ausgelöst wird der Lauf von jedem Release mit Produkt-Code-Anteil.** Ein Release ohne ihn kann die Plattform nicht brechen und löst deshalb keinen Lauf aus.

### Wie eine Plattform in die Menge kommt und sie verlässt

Die Festlegung spricht bewusst von **freigegebenen Plattformen** und nicht von Windows und Linux: Eine Plattform tritt mit ihrer **ersten Auslieferung** ein und mit ihrer **Zurückstellung** aus, beides durch Entscheidung des Product Owners im Zielbild. Damit trägt der Abschnitt eine dritte Plattform, ohne umgeschrieben zu werden, und schrumpft von selbst, solange macOS zurückgestellt ist.

### Das Kommando

```bash
node scripts/test-linux-docker.js e2e
```

Gate-Namen (`format:check`, `lint`, `test`, `e2e`, `alle`) werden unverändert an `scripts/gate-lauf.js` im Container durchgereicht; es fällt dort dasselbe Kommando wie auf der Haupt-Plattform. `--nur <muster>` fährt einen einzelnen Fall und ist der Diagnose-Weg, wenn ein roter Fall nach der Leiter unten isoliert nachzuprüfen ist. Voraussetzung ist Docker; ein Kaltstart von Docker Desktop braucht mehrere Minuten, bevor der Dienst antwortet.

**Woher der Lauf seine Dateien liest, ist nicht überall dasselbe** (seit dem 2026-08-31, Vorgang zum Rechner-Unterschied weiter unten):

- Das **E2E-Gate** (`e2e`), das **Unit-Gate** (`test`) und das **Sammel-Gate** (`alle`) laufen aus einer **Kopie im Container-Dateisystem**. Sie entsteht je Lauf neu, ohne `node_modules`, `releases`, `dist`, `test-results` und `playwright-report`, mit dem Git-Verzeichnis; `node_modules` hängt als dasselbe Volume auch unter dem Pfad der Kopie. Bevor ein Gate startet, prüft der Lauf die Kopie auf die Bäume, die seine Wächter lesen, also `src`, `test`, `scripts`, `docs`, `web`, `Projektmanagement` und das Git-Verzeichnis, und bricht ab, statt gegen einen halben Baum zu prüfen. Nach dem Lauf wandert der Maschinen-Bericht jedes Gates zurück in den Arbeitsbaum, für `test` und `alle` also `test-berichte/unit.json` und für `e2e` die Datei `test-berichte/e2e.json`, dazu die Rot-Belege, auch nach einem roten Lauf.
- **Das Unit-Gate ist erst seit dem 2026-09-20 dabei** (`4T-001837`). Bis dahin blieb es auf dem Arbeitsbaum, weil seine Bestands-Wächter ihn samt Git-Verzeichnis nur einmal lesen und eine Kopie dort kein Gewinn gewesen wäre. Diese Rechnung hat das Wachstum des Webseiten-Baus gekippt: Seine vier Bau-Prüfdateien rissen im Container ihre Zeitgrenze, während dieselbe Suite unter Windows grün blieb. Damit war die Schwelle des Absatzes «Die Zeitgrenzen bleiben plattform-einheitlich» erreicht, und dessen Antwort darauf ist genau dieser Weg.
- **Das Sammel-Gate steht aus einem eigenen Grund dabei.** Es fällt im Container als ein einziger Aufruf und hat deshalb genau einen Arbeitsordner; stünde es nicht in der Menge, liefe das Unit-Gate wieder über die Brücke, sobald jemand die Release-Abnahme mit `alle` fährt statt mit `test`. Format und Lint messen denselben Datei-Bestand, gleich aus welchem Baum sie ihn lesen.
- **Einzeln gefahren bleiben `format:check` und `lint` auf dem Arbeitsbaum.** Sie lesen wenig und gewönnen nichts, und eine Kopie für sie allein wäre teurer als der Lauf.
- `--ohne-kopie` stellt den alten Weg her, für alle Gates gleichermaßen. Er ist der schnellere, wenn **ein einzelner** Fall nachzuprüfen ist, weil die Kopie dann teurer wäre als der Fall selbst, und er ist der Ausweg, falls die Kopie einmal nicht trägt.

Wer die Aufteilung ändert, ändert den Prüfstand einer Release-Abnahme; `test/unit/test-linux-docker.test.js` hält sie deshalb fest.

### Gemessene Größenordnungen (2026-08-28, SC-027 Slot B)

**Alle Werte dieses Abschnitts stammen aus seriell gefahrenen Läufen** — einer
nach dem anderen, ohne dass eine zweite Suite gleichzeitig lief. Wer daraus ein
Budget für einen **parallel** gefahrenen Lauf bildet, rechnet zu knapp; die
Einzelheiten stehen im Absatz «Parallel gefahrene Plattform-Läufe» unten
(`4T-001519`).

| Lauf | Windows | Linux im Container | Verhältnis |
|---|---|---|---|
| Unit-Suite | rund 73 s | rund 4 min | rund 3× |
| E2E-Voll-Suite | 27,5 min | 38,6 min | 1,4× |
| Ein Bestands-Wächter über 1348 Objekte | 4,4 s | über 30 s | rund 7× |

**Parallel gefahrene Plattform-Läufe kosten mehr, als die Werte oben erwarten
lassen** (`4T-001519`, eine Beobachtung vom 2026-09-06, **keine Messreihe**).
Die Entwicklungsrichtlinien empfehlen, die beiden Plattform-Läufe eines Zuges
gleichzeitig zu fahren. In der Release-Strecke zu `1.129.0` hat das Zeit
gekostet statt sie zu sparen: 70 Minuten Wanduhr gegen rund 52 Minuten, die
dieselben vier Läufe seriell gebraucht hätten. Die E2E-Suite unter Windows lief
mit 60,9 statt 27,5 Minuten, also mit Faktor 2,2.

**Der Mechanismus ist von der Messgenauigkeit unabhängig:** Eine E2E-Suite
startet je Prüffall eine vollständige Anwendung; zwei davon auf derselben
Maschine konkurrieren um Kerne und Plattenzugriff, und der Linux-Lauf zahlt
zusätzlich über die Container-Brücke. Der Engpass ist nach diesem Abschnitt
ohnehin das Dateisystem — also genau die Größe, die sich schlecht teilen lässt.
Im selben Lauf trat zudem der bekannte Wackler `BS-06` zum vierten Mal auf, und
alle vier Beobachtungen liegen in Läufen mit belegter oder plausibler Fremdlast.

**Was noch offen ist:** Ob die Empfehlung zum Parallel-Fahren bleibt, geändert
oder gestrichen wird, entscheidet der Product Owner nach einer Messreihe über
mindestens zwei Release-Strecken; bis dahin gilt sie unverändert. Festgehalten
ist hier allein die **Betriebsart der Werte** — und die ist unabhängig vom
Ausgang jener Entscheidung.

**Der Engpass ist das Dateisystem, nicht die Rechenleistung.** Der Container arbeitet über die Brücke zum Windows-Laufwerk; was viele Dateien liest, zahlt dort ein Vielfaches, während reine Rechenarbeit kaum teurer wird. Wer unter Linux eine Zeitgrenze reißen sieht, prüft deshalb zuerst, ob der Fall den Bestand liest — und hebt dann das **benannte** Limit aus `test/zeitlimits.js`, statt eine Zahl an den Fall zu schreiben.

### Der Rechner-Unterschied und der Weg um die Brücke (2026-08-31, SC-026 Slot A)

Die Größenordnungen oben stammen von SC-027; auf SC-026 wiegt die Brücke
deutlich schwerer. Gemessen am 2026-08-31 in der Release-Strecke zu 1.123.0:

| Messung | über die Brücke | im Container-Dateisystem | Verhältnis |
|---|---|---|---|
| 300 Dateien schreiben | 3113 ms | 6 ms | rund 500× |
| E2E, je Prüffall | 16 s | 1,6 s | rund 10× |
| E2E-Voll-Suite, 644 Fälle | rund 172 min (hochgerechnet; ein Lauf wurde bei 141 min abgebrochen) | 24,2 min | rund 7× |

**Die Unit-Suite ist davon nicht betroffen:** 4:43 min über die Brücke und
damit auf dem Niveau von SC-027. Der Verlust trifft allein die E2E-Suite, weil
dort je Fall eine vollständige Anwendung startet und jeder Start hunderte
kleine Dateien liest, während die Unit-Suite ihre Module einmal lädt und dann
rechnet.

**Nicht die Ursache sind Synchronisations-Dienst und Virenschutz.** Der
Projektordner liegt in einem Synology-Verzeichnis, doch Windows-seitig schreibt
es sich dort so schnell wie im Temp-Ordner (102 gegen 103 ms für 300 Dateien),
und der Dienst zeigte im Messfenster null Datei-Operationen bei 2,7 Prozent
Maschinen-Last. Wer eine Container-Verlangsamung untersucht, misst deshalb
zuerst die Brücke und nicht die Prozessliste: Die **kumulierte** Prozessor-Zeit
eines Dienstes summiert seine gesamte Lebensdauer und sagt über die aktuelle
Last nichts aus. Genau diese Verwechslung hat am 2026-08-31 vier Läufe und rund
acht Stunden gekostet.

**Der Ausweg** ist eine Kopie des Quellbaums ins Container-Dateisystem vor dem
E2E-Lauf, rund 75 Sekunden samt Git-Verzeichnis, mit anschließendem
Zurückschreiben der Berichte in den Arbeitsbaum. Das Unit-Gate bleibt auf dem
Arbeitsbaum, weil die Bestands-Wächter ihn samt Git-Verzeichnis lesen.

**Seit dem 2026-08-31 ist dieser Weg die Vorgabe des Kommandos** und kein
Handgriff mehr (`scripts/test-linux-docker.js`, Abschnitt „Das Kommando" oben).
Damit hängt er an einem Wächter statt an einer Anleitung, und niemand muss ihn
je Release nachbauen. Wer den alten Weg braucht, nimmt `--ohne-kopie`.

**Gemessen am gekapselten Weg**, erster vollständiger Lauf am 2026-08-31 auf
SC-026 über `node scripts/test-linux-docker.js test e2e`:

| Abschnitt | Zeit | Bemerkung |
|---|---|---|
| Vorlauf | 1 min 41 s | Abhängigkeiten, Anzeige-Vorbereitung und Kopie zusammen |
| davon die Kopie | 61 s | einzeln gemessen; jeder Lauf nennt den Wert im Protokoll |
| Unit-Gate, auf dem Arbeitsbaum | 5 min 22 s | 4891 Fälle; dieser Lauf war rot (fehlende Register-Einträge der neuen Prüfdatei), die Laufzeit ist davon unberührt |
| E2E-Gate, aus der Kopie | **20 min 48 s** | 644 Fälle, keiner unerwartet |
| gesamt | 27 min 53 s | |

**Der Vergleichswert des alten Wegs auf demselben Rechner** steht in der
Tabelle darüber: rund 172 Minuten hochgerechnet, ein Lauf bei 141 Minuten
abgebrochen. Beide Zahlen sind Messungen desselben Tages an derselben Suite.

**Die Kopier-Dauer steht bewusst im Protokoll jedes Laufs** und nicht nur hier.
Sie hängt an der Zahl der Dateien und am Rechner, und beide wachsen; ohne die
laufende Zahl fiele erst auf, dass die Kopie teurer geworden ist, wenn sie mehr
kostet als sie spart.

#### Die Deutung vom 2026-08-31 und ihre Korrektur

**Diese Deutung ist am 2026-09-01 widerlegt worden**; sie steht hier, weil sie
die Ursachensuche bis dahin geleitet hat und ihre Fehlerquelle lehrreich ist.
Gemessen wurde am 2026-08-31 derselbe Lesevorgang über dieselben 698 Dateien,
dreimal hintereinander im selben Container-Lauf:

| Durchlauf | Stamm-Rechner | Zweitrechner |
|---|---|---|
| 1 (kalt) | 10,571 s | 10,454 s |
| 2 | 10,642 s | **1,255 s** |
| 3 | 10,828 s | **1,351 s** |

**Gelesen wurde das so:** Der erste Durchlauf ist praktisch identisch, Hardware
und Protokoll scheiden damit aus, und der Unterschied liegt allein darin, dass
der Zweitrechner die Folgezugriffe aus dem Zwischenspeicher bedient und der
Stamm-Rechner nicht.

**Die Messreihe vom 2026-09-01 hat das widerlegt** (`4T-001331`, Zahlen unten):
Auf **beiden** Rechnern greift die Zwischenspeicherung nicht, und der
Zweitrechner ist schon im **kalten** Durchlauf rund zehnmal schneller. Der
zweite und dritte Wert seiner Spalte oben (1,255 und 1,351 s) sind seine
normalen Werte, nicht seine warmen; sein erster Wert von 10,454 s trug einen
einmaligen Anteil, den das damalige Verfahren in den ersten Durchlauf zog.
Auf dem Stamm-Rechner fiel derselbe Anteil nicht auf, weil dort jeder Durchlauf
in dieser Größenordnung liegt.

**Die Lehre für künftige Messungen** steht in den drei Festlegungen des
Verfahrens weiter unten, besonders in der zweiten: Was einmalig anfällt (das
Durchlaufen der Verzeichnisse, das Aufbauen von Verbindungen), gehört **vor**
die Messung. Sonst trägt der erste Durchlauf einen Anteil, den die weiteren
nicht haben, und die Differenz sieht wie ein Zwischenspeicher-Effekt aus. Hier
hat das eine ganze Ursachensuche in die falsche Richtung gelenkt: Sieben
Hypothesen wurden gegen eine Frage geprüft, die sich so nicht stellte.

**Sieben Erklärungen sind geprüft und widerlegt**, jeweils gemessen: Prozessor-
leistung und Speicher, der Synchronisations-Dienst, der Ort im Ordnerbaum, die
WSL-Fassung samt Kernel, die Mount-Einstellungen, die Docker-Fassung und die
Ausschluss-Listen des Virenschutzes. WSL und Docker wurden dabei auf den Stand
des Zweitrechners gebracht (2.7.12 / Kernel 6.18.33, Docker 29.7.2), ohne jede
Wirkung auf die Messung. Wer hier weitersucht, braucht diese Wege nicht erneut zu
gehen; die Einzelheiten stehen im zugehörigen Vorgang.

**Vor jeder weiteren Ursachen-Aussage steht eine wiederholbare Messreihe.** Die
Werte oben streuen erheblich (6,1 bis 10,8 Sekunden für denselben Vorgang), und
in einem Fall zeigte sich ein Abfall, in anderen nicht. Eine Einzelmessung trägt
hier keine Schlussfolgerung.

#### Das Messverfahren (`scripts/mess-bruecke.js`)

Seit dem 2026-09-01 (`4T-001331`) steht die Messreihe als Werkzeug zur Verfügung
statt als Handgriff-Folge. Sie liest eine feste Datei-Menge mehrfach
hintereinander, fährt mehrere Läufe und weist die Streuung aus:

```bash
node scripts/mess-bruecke.js
```

Vorgabe sind fünf Minuten für drei Läufe à drei Durchläufe über `src/`;
`--laeufe` und `--durchlaeufe` ändern den Umfang, `--json` gibt die Rohdaten.
Der Bericht ist der Beleg und nennt Rechner, Stand, Umgebung samt
Einhänge-Optionen und Streuung, damit zwei Rechner ohne Zusatzwissen
vergleichbar sind. **Er muss auf einer ruhigen Maschine entstehen**, weil eine
Messung unter Fremdlast nichts belegt (Parallelitäts-Regel der
Entwicklungsrichtlinien, Kapitel 11). Das gilt hier **in beide Richtungen**:
Die Leerung des Zwischenspeichers wirkt auf die ganze WSL-Maschine und damit
über Clone-Grenzen hinweg, eine gleichzeitig laufende Suite desselben Rechners
würde also nicht nur die Messung stören, sondern auch von ihr gestört.

Drei Festlegungen tragen das Ergebnis. **Der Zwischenspeicher wird vor jedem
Lauf geleert**, weil er in der WSL-Maschine lebt und einen Container überdauert;
ohne Leerung startete der zweite Lauf bereits warm. **Die Datei-Liste entsteht
vor der Messung**, damit das Durchlaufen der Verzeichnisse nicht in den ersten
Durchlauf fällt. **Metadaten und Inhalt werden getrennt gemessen**, weil beide
unabhängig voneinander zwischengespeichert werden können.

**Die Gegenprobe ist Teil des Verfahrens** (`--gegenprobe`): Sie misst dieselbe
Menge im Container-Dateisystem, wo die Zwischenspeicherung erwiesenermaßen
greift. Ohne sie wäre «greift nicht» nicht von «das Verfahren sieht es nicht» zu
unterscheiden. Ihre Aussage liegt im absoluten Wert und nicht im Kalt-Warm-
Faktor, weil das Anlegen der Kopie wärmt, was danach gemessen wird.

#### Die Reihen vom 2026-09-01 auf beiden Rechnern

Je fünf Läufe à drei Durchläufe über `src/` (SC-026: 699 Dateien, 13,6 MB;
SC-027: 698 Dateien, 13,4 MB — der Unterschied ist ein Bau-Artefakt), ruhige
Maschine, Leerung vor jedem Lauf, beide auf demselben Stand `f893bb7d`:

| Reihe | SC-026 (Median) | Streuung | SC-027 (Median) | Streuung | Verhältnis |
|---|---|---|---|---|---|
| Metadaten, kalt | 7996 ms | 6,3 % | 708 ms | 2,9 % | 11,3× |
| Metadaten, warm | 7472 ms | 14,0 % | 720 ms | 5,2 % | 10,4× |
| Inhalt, kalt | 8465 ms | 8,6 % | 1119 ms | 8,0 % | 7,6× |
| Inhalt, warm | 8890 ms | 15,9 % | 1075 ms | 4,5 % | 8,3× |

**Zwei Befunde, und beide widersprechen der Deutung vom 2026-08-31.**

**Erstens: Die Zwischenspeicherung greift auf keinem der beiden Rechner.** Ein
wiederholter Zugriff ist auf SC-026 um den Faktor 1,07 und 0,95, auf SC-027 um
0,98 und 1,04 billiger als der erste — also auf beiden gar nicht. Dass das
Verfahren einen greifenden Zwischenspeicher sehr wohl sieht, belegt die
Gegenprobe: dieselben Dateien im Container-Dateisystem, mit demselben Code
gelesen, kosten **1 ms** (Metadaten) und **8 ms** (Inhalt) statt Sekunden.

**Zweitens: Der Rechner-Unterschied liegt in der Grundgeschwindigkeit der
Brücke.** SC-027 ist schon im kalten Durchlauf rund acht- bis elfmal schneller.
Auf einen einzelnen Datei-Zugriff gerechnet sind das **12,1 ms gegen 1,6 ms**.
Das erklärt die Laufzeit der E2E-Suite (38 Minuten gegen mehrere Stunden)
vollständig und ohne jede Annahme über Zwischenspeicher, denn die Suite startet
je Prüffall eine Anwendung, die immer dieselben Dateien einzeln liest. Die
Unit-Suite bleibt unberührt, weil sie den Bestand nur einmal liest (4:43 gegen
rund 4 Minuten).

**Nebenbefund:** Der Zwischenspeicher wird auf beiden Rechnern gefüllt und
danach nicht mehr angefasst — er wächst im kalten Durchlauf und bleibt über die
warmen auf das Kilobyte genau stehen, ohne dass die Zeit fällt. Das passt zum
Einhänge-Modus, nicht zu einem Rechner-Unterschied.

**Auch die Streuung unterscheidet die Rechner:** SC-026 streut mit 6,3 bis
15,9 Prozent deutlich stärker als SC-027 mit 2,9 bis 8,0. Unerklärt, aber
festgehalten, weil eine spätere Erklärung des Geschwindigkeits-Unterschieds
auch dazu passen sollte.

**Die Einhängung ist auf beiden Rechnern identisch:** 9p mit `cache=0x5`,
`noatime`, `msize=65536`, `access=client`, `trans=fd`. Der zuletzt verbliebene
Umgebungs-Kandidat ist damit ebenfalls erledigt.

**Neun geprüfte Erklärungen**, keine trägt den Unterschied: die sieben vom
2026-08-31 (Prozessorleistung und Speicher, Synchronisations-Dienst, Ordner-Ort,
WSL-Fassung samt Kernel, Mount-Einstellungen, Docker-Fassung,
Virenschutz-Ausschlüsse), dazu die NTFS-Fortschreibung der letzten Zugriffszeit
(`DisableLastAccess = 2` auf beiden) und eine abweichende WSL-Konfigurationsdatei
(auf beiden nicht vorhanden). Die Einzelheiten stehen im zugehörigen Vorgang.

### Beide Läufe gleichzeitig auf einem Rechner

Gemessen am 2026-08-28 in der realen Release-Konstellation: Der Windows-Lauf bleibt bei 27,5 min, der Linux-Lauf steigt von 38,6 auf 44,5 min (+15 %). **Kein Fehlschlag war der Last zuzuschreiben** — der Linux-Lauf riss unter Last exakt dieselben drei Fälle wie lastfrei, und die vier Prüfdateien, die den am 2026-08-07 belegten Versagens-Mechanismus tragen, liefen 3 von 3 grün. Nacheinander kosten beide Läufe rund 67 Minuten, gleichzeitig 44,5.

**Die Anordnung vom 2026-08-07 ist am 2026-08-31 vom Product Owner geschärft worden:** Die beiden **Plattform-Läufe eines Releases** (Windows-Suite und Linux-Container-Suite über denselben Stand) laufen **parallel** — genau die oben gemessene Konstellation, und die Zahlen sind ihre Grundlage. Alles Übrige der Anordnung gilt unverändert, insbesondere nie zwei Läufe derselben Plattform und kein Bau parallel zu einer Suite; der Wortlaut steht in den Entwicklungsrichtlinien, Kapitel 11. Anlass: Beim Release 1.123.0 verlängerte die serielle Lesart die Strecke um Stunden.

### Benannte Auslassungen

Eine Prüfung, die auf einer Plattform **gegenstandslos** ist, wird ausdrücklich ausgenommen und nennt ihren Grund am Prüffall; sie bleibt weder stillschweigend rot noch läuft sie stillschweigend ins Leere. Der Bestand am 2026-08-28 unter Linux:

| Ausgenommen | Grund |
|---|---|
| Anlage-Zeitpunkt einer Datei (3 Fälle) | über die Windows-Schicht gesetzt; die Anwendung führt dort dieselbe bewusste Lücke |
| gemapptes Netzlaufwerk (2 Fälle) | Laufwerksbuchstaben gibt es dort nicht; die Anwendung führt dieselbe bewusste Lücke |
| Schreibweisen-Zweitsuche (1 Fall) | prüft die case-insensitive Suche |
| echter Browser-Lauf (2 Fälle) | braucht einen installierten Browser, den das Abbild nicht mitbringt |

Dazu zwei Zusicherungen, die **auf Windows begrenzt** statt ausgenommen sind, weil sie dort eine Aussage haben und anderswo keine: der Ausbruch über den Rückwärts-Schrägstrich und der Außen-Pfad in Windows-Schreibweise. Beide haben eine Schwester-Zeile, die in Wirts-Schreibweise überall prüft.

**Wo die Auslassung nach außen erscheint:** Die Release-Hinweise nennen je Plattform, was geprüft wurde und was nicht (`docs/release-notes-template.md`, Abschnitt «System-Anforderungen»). Eine stillschweigende Nicht-Prüfung liest sich später wie eine vollständige Abdeckung.

## Snapshots der Render-Pipeline

Die Markdown-Fixtures unter `test/fixtures/render/` werden in
`test/unit/render/snapshots.test.js` durch `renderMarkdown` geschickt
und als Vitest-Snapshots eingefroren
(`test/unit/render/__snapshots__/`). Regeln:

- **Eine Fixture pro Konstrukt-Familie**; neue Markdown-Konstrukte
  bekommen eine eigene Fixture im selben Ordner —
  der Spec nimmt alle `.md`-Dateien automatisch auf.
- **Snapshot-Updates sind ein bewusster Schritt**: nie blind
  `vitest -u` laufen lassen; zuerst den Diff des Snapshots lesen und
  prüfen, ob die Änderung gewollt ist (eigene Code-Änderung oder
  legitimes Library-Update) — sonst ist es eine Regression.
- **Maschinenunabhängigkeit**: `renderMarkdown` arbeitet ohne
  Pfad-Auflösung (Bild-Einbettung liegt im Preload), die Snapshots
  dürfen keine absoluten Pfade enthalten.
- **DOM-abhängige Pfade** (P-02-Block-Sanitizer mit DOMParser) testet
  `sanitizer-dom.test.js` mit `@vitest-environment jsdom`; in purem
  Node fällt der Sanitizer auf Voll-Escaping zurück, weshalb die
  Node-Snapshots der Portable-Fixtures escaptes Tabellen-HTML zeigen —
  das ist erwartet und stabil.
- **Mermaid** wird nur als Container gesnapshottet (`language-mermaid`-
  Code-Block); das SVG entsteht erst im Renderer und schwankt
  versionsabhängig.

## Abdeckungs-Matrix

`test/abdeckungs-matrix.json` ordnet jedem Eintrag des Funktions-Katalogs
(`help.feature.*` und `help.shortcut.*` aus der deutschen Sprachfassung — seit
0.29.0 die Quelle der generierten Handbuch-Funktions-Seite; seit `3E-000278`
liegen sie in den Fragmenten `src/i18n/fragments/de/help-feature.json` und
`help-shortcut.json`, das Erzeugnis `src/i18n/de.json` entsteht beim Bau) eine Testart
und Testdateien zu. Der Meta-Test
`test/unit/abdeckungs-matrix.test.js` erzwingt das in `npm test` (und
damit im Testsuite-Gate): ein neuer Katalog-Eintrag ohne Matrix-Pflege
bricht den Lauf. Die Vollständigkeit der Handbuch-Seiten selbst sichert
zusätzlich `test/unit/manual-pages.test.js` (alle fünf Sprachfassungen
pro Registry-Seite, Titel-Keys, keine verwaisten Dateien); den Text-Stil
sichert `test/unit/hilfetext-stil.test.js` (keine Fremdprodukt-Verweise
und keine Versions-Historie in Handbuch-Seiten und Katalog-Texten,
Stil-Regeln aus den Entwicklungsrichtlinien,
Kapitel 13).

**Feld `sichtbarkeit` an Unit- und Snapshot-Einträgen** (seit dem
2026-09-03, Regel in den Entwicklungsrichtlinien, Kapitel 10): Ein Unit-
oder Snapshot-Fall liest Quelltext oder Markup und sieht nicht, ob ein
Bedienelement in der realen Anordnung sichtbar ist. Deshalb trägt jeder
Eintrag mit Testart `unit` oder `snapshot` das Feld `sichtbarkeit` in
einer von drei Formen: eine Liste rendernder E2E-Specs (`test/e2e/…`),
die das Bedienelement sichtbar machen; `entfällt: <Grund>`, wenn kein
dauerhaft sichtbares Bedienelement betroffen ist (Markdown-Konstrukt,
Abfrage-Ausgabe, Kommando ohne eigenes Element, Eintrag im nativen
Anwendungsmenü); oder `offen: <Grund>` für die Altbestand-Lücke der
Sichtung vom 2026-09-03. Der Meta-Test erzwingt das Feld, prüft die
Existenz der Specs und deckelt die `offen:`-Einträge auf ihren Stand —
ein neues Bedienelement bringt seinen E2E-Fall mit, ein weiterer
`offen:`-Eintrag ist kein Weg. Wer ein Element ohne eigenen Katalog-Key
einführt, hält dieselbe Regel über den Kopf-Kommentar seiner Prüfgruppe
ein: Struktur-Prüfungen nennen den Fall, der die Wirkung nachweist.

**Regressionstest-Pflicht pro Bugfix:** Jeder behobene Fehler erhält einen Regressionstest auf der passenden Ebene (Unit, Snapshot oder E2E), nach Möglichkeit zuerst als fehlschlagender Test, dann der Fix; die Befund- bzw. Task-ID steht als Kommentar am Test. **Szenario-Treue bei gemeldeten Befunden** (Retrospektive vom 2026-08-05): Der Regressionstest eines vom Product Owner oder aus dem Feld gemeldeten Befunds stellt den **gemeldeten Ablauf** nach (Fenster-, Sitzungs- und Daten-Lage der Meldung), nicht das Minimal-Szenario der diagnostizierten Ursache; die Diagnose bestimmt den Fix, die Meldung bestimmt den Test. Gegenüber dem Product Owner heißt ein gemeldeter Befund erst «behoben», wenn sein Ablauf nachgestellt grün ist; davor lautet die Rückmeldung «Fix umgesetzt, Nachweis im nachgestellten Szenario». Anlass: Ein Restore-Fix bestand das Minimal-Szenario (eine App, kleines Profil) und fiel am realen Mehr-Fenster-Profil durch.

**E2E-Fall pro neuem Bedien-Weg über eine Prozess-Brücke** (seit dem 2026-09-14, Anlass `4T-001747`, Fehlerklasse `L10`/`U3`): Ein Bedien-Weg, der auf dem Weg zur Wirkung eine **Prozess-Brücke**, eine **Fokus-Führung** oder eine **zurückgestellte Neu-Übergabe** passiert, bekommt seinen E2E-Fall an der gestarteten Anwendung, **bevor** der Product Owner zum Testen aufgefordert wird — nicht erst, nachdem er einen Befund gemeldet hat. Grund: In jsdom ist jede dieser drei Nahtstellen durch einen gestellten Nachbarn ersetzt, und ein Prüffall, der den Nachbarn selbst stellt, prüft seine eigene Annahme mit. Das ist keine neue Stufe, sondern die Anwendung des Eintritts-Kriteriums aus Stufe 1 der Teststrategie («eine gezielte E2E-Spec dort, wo das Kriterium ausschließlich end-zu-end beobachtbar ist») auf einen benannten Fall-Typ. Belegt: Drei Abnahme-Befunde an der Verweis-Karte der Canvas-Stufe 3 lagen an genau diesen drei Nahtstellen, alle jsdom-Fälle waren grün, und der nachgereichte E2E-Fall ist ohne die Behebung in drei von vier Fällen rot. **Kein Wächter** — welcher Weg eine Brücke passiert, ist eine Aussage über den Bau und nicht über eine Datei-Menge; die Regel hängt am Prüf-Block des Tasks, in dem der Bedien-Weg entsteht.

**Test-Pflege-Schritt pro Epic:** Jedes Epic mit Code-Änderungen erweitert die Suite um seine neuen Funktionen (Feature-Tests plus Snapshot-Fixtures); ein Feature gilt erst mit Test als fertig. Technisch abgesichert durch den Vollständigkeits-Meta-Test: neue `help.feature.*`-/`help.shortcut.*`-Keys ohne Eintrag in `test/abdeckungs-matrix.json` lassen `npm test` fehlschlagen.

**Falle des Stil-Wächters:** Sein Muster für Versions-Historie trifft
jede dreistufige Nummer der Form `\d.\d+.\d{1,3}`, und es prüft
zeilenweise ohne Ausnahme für Code-Blöcke. Nummern-Beispiele in
Handbuch- und Katalog-Texten (Gliederungs-Nummerierung, Listen-Tiefe)
bleiben deshalb **zweistufig** (`1`, `1.1`, `1.2`); tiefere Strukturen
werden verbal beschrieben. Ein Beispiel wie `(1, 1.1, 2.3.1)` lässt die
Suite fehlschlagen, auch innerhalb eines Code-Blocks.

**Der Eintrag gehört in den Commit seines Schlüssels.** Der Meta-Test
misst den **gesamten** Bestand, und der pre-commit-Hook prüft **jeden
Commit einzeln** gegen den Index. Ein Commit, der einen neuen
`help.feature.*`- oder `help.shortcut.*`-Schlüssel einführt, ohne den
Matrix-Eintrag mitzubringen, ist deshalb für sich rot — auch wenn der
Bestand zwei Commits später wieder stimmt. Das trifft besonders den
üblichen Zuschnitt, bei dem das Kommando in einem Umsetzungs-Task
entsteht und der Funktions-Katalog erst im Hilfe- und Handbuch-Task
folgt: Der Schlüssel bringt seinen Matrix-Eintrag mit, unabhängig
davon, welcher Task ihn fachlich verantwortet. Aufgefallen ist das an
einem Kommando-Schlüssel, dessen Eintrag für den nachfolgenden
Hilfe-Task vorgemerkt war.

**Pflege bei neuen Funktionen**:

1. Neue `help.*`-Keys anlegen (Konvention in den
   Entwicklungsrichtlinien,
   Kapitel 13).
2. Tests schreiben (E2E in `test/e2e/funktionen/`, Unit/Snapshot nach
   Lage) und in der Matrix eintragen: `key`, fortlaufende `id`
   (`F-…`/`S-…`), `testart` (`e2e`/`unit`/`snapshot`), `tests`
   (Pfade relativ zum Repo-Root), optional `hinweis`.
3. Nur wenn ein Kürzel ein reiner Menü-Accelerator ist (Playwright
   erreicht das native Menü nicht): `testart: "ipc"` mit dem getesteten
   IPC-Kanal in der `begruendung`. Nur wenn etwas prinzipiell nicht
   automatisierbar ist (OS-Dialoge, native Menüleiste, OS-Fenster-
   Geometrie): `testart: "manuell"` mit substanzieller `begruendung` —
   solche Punkte gehören in die Gesamtabnahme-Checkliste.

Die E2E-Funktions-Suite liegt unter `test/e2e/funktionen/` (eine Spec
pro Funktionsgruppe); `describe`-Titel tragen die Matrix-IDs.

## PM-Dokument-Linter

`scripts/lint-pm-dokumente.js` prüft die Projektmanagement-Dokumente gegen die
PM-Konventionen (Dateiname und Identität, Frontmatter, Metadaten-Schema,
Body-Kapitel, Hierarchie und Bidirektionalität, Überblick-Konsistenz, Notation
der Eltern-Listen, Verweis-Disziplin). Eingebunden über
`test/unit/pm-dokumente.test.js`, läuft er in `npm test` und damit im
Testsuite-Gate der Merge-Queue; zusätzlich fährt ihn der pre-commit-Hook
direkt gegen den Git-Index. Die Parse-Logik teilt er sich mit
`scripts/verify-dashboard.js` über das Modul `scripts/pm-parse.js`. Bekannte
Altbestand-Funde sind in `scripts/pm-lint-baseline.json` grandfathered; neue
oder geänderte Dokumente, die eine Regel verletzen, stehen nicht in der Baseline
und lassen den Lauf fehlschlagen. Je Regelgruppe belegt eine Negativ-Probe im
Test, dass die Regel anschlägt. Die Fälle der Hierarchie-Gruppe (E1/E2,
E4 sowie das Regel-Paar E5/E6 um den Bearbeitungs-Zustand eines Bündels) liegen
seit 4T-001104 in `test/unit/pm-hierarchie.test.js`, weil die Sammel-Datei am
800-Zeilen-Budget stand; der Schnitt folgt der Modul-Naht des Linters aus
4T-000973.
