// 4T-001990 (Epic 3E-000188): Erkennung des portablen Betriebs.
//
// Läuft das Programm portabel, gehört das gesamte Nutzerdaten-Verzeichnis in
// den Daten-Ordner neben der portablen Programmdatei statt ins Benutzerprofil.
//
// 4T-002222: Die portable Fassung ist eine einzelne Programmdatei (EXE), nie
// ein Archiv (Anordnung des Product Owners vom 2026-10-10). Ihr Start-Rahmen
// setzt `PORTABLE_EXECUTABLE_DIR` auf den Ordner der EXE (Messung vom
// 2026-09-28 in 4T-001844, Ergebnisse A2 und B2); daran wird der portable
// Betrieb erkannt, und der Daten-Ordner entsteht beim ersten Start neben der
// EXE. Das Entpacken des Programms in den Temp-Ordner von Windows beim Start
// bleibt eine Grenze des Start-Rahmens, die der Product Owner hingenommen hat.
//
// BEGRIFFS-GRENZE. «Portabel» heißt im Code bereits der portable EXPORT eines
// Dokuments (`src/shared/canvas/canvas-portabel.js`): eine Datei, die ihre
// Bezüge mitnimmt. Mit ihm hat dieses Modul nichts zu tun. Hier geht es allein
// um den portablen BETRIEB des Programms — wo es seine eigenen Daten ablegt —,
// und alle Namen sprechen deshalb vom Betrieb.
//
// Erkennungs-Regel, in dieser Reihenfolge:
//   1. Ist die Test-Umlenkung `SCG_TEST_USER_DATA` gesetzt, gilt «nicht
//      portabel»; die Umlenkung in main.js bleibt allein wirksam.
//   2. Läuft das Programm nicht gepackt (Start aus den Quellen), gilt «nicht
//      portabel». Neben der Programmdatei von Electron liegt dort ohnehin kein
//      Daten-Ordner, die Regel soll aber nicht davon abhängen.
//   3. Ist `PORTABLE_EXECUTABLE_DIR` gesetzt (Start der portablen EXE), gilt
//      «portabel»; der Daten-Ordner liegt neben der EXE und wird bei Bedarf
//      angelegt. Ausgenommen ist die zweite Ausprägung für den Prüfstand
//      (4T-001335): Sie ist ebenfalls eine portable EXE, legt ihre Daten aber
//      wie bei jedem Release zuvor unter eigener Identität im Benutzerprofil ab.
//   4. Sonst: Liegt neben der Programmdatei ein VERZEICHNIS namens `Data`,
//      gilt «portabel». Eine gleichnamige Datei zählt nicht.
//
// Die Beschreibbarkeit wird mit einer Probe-Datei IM Daten-Ordner geprüft, die
// sofort wieder entfernt wird. `fs.access` taugt dafür nicht: Unter Windows
// prüft es allein das Schreibschutz-Attribut und weder die Zugriffsrechte noch
// einen schreibgeschützten Datenträger.
//
// Electron-frei und ohne Lade-Zeit-Seiteneffekte (Muster
// user-data-migration.js): Pfade und Datei-Zugriff kommen als Argumente
// herein, damit die Unit-Prüfung denselben Weg misst wie der Programmstart.
//
// 4T-001991 (Epic 3E-000188): Dazu kommen zwei Pfad-Bildungen gegen Spuren
// außerhalb des Daten-Ordners, gemessen am gebauten Programm am 2026-09-28:
//   - `temporaerOrdnerPfad`: Im portablen, beschreibbaren Betrieb legt main.js
//     den temporären Ordner des Prozesses in den Daten-Ordner. Was die
//     Laufzeit-Umgebung und der Anzeige-Prozess eines Fensters vorübergehend
//     anlegen, entsteht dann dort statt im Temp-Ordner des Benutzerprofils.
//   - `programmSymbolPfad`: Das Programm-Symbol wird aus der unverpackten
//     Ablage neben dem Programm-Archiv gereicht. Aus dem Archiv heraus kopiert
//     die Laufzeit-Umgebung es bei jedem Start in den Temp-Ordner, und die
//     Kopie bleibt dort liegen. Diese Pfad-Bildung gilt in JEDER Fassung, weil
//     die Kopie auch die installierte Fassung trifft.
//
// 4T-001991 (Epic 3E-000188): Dazu kommt die Hülle der Datei-Dialoge
// (`umhuelleDateiDialoge`). Bestätigt der Anwender einen Datei-Dialog von
// Windows, trägt Windows die gewählte Datei und ihren Ordner in die Listen
// zuletzt benutzter Dateien ein: Verknüpfungen unter `%APPDATA%\Microsoft\
// Windows\Recent`, dazu Einträge in der Registrierung (Messung am gebauten
// Programm vom 2026-09-28). Die Eigenschaft `dontAddToRecent` der vier
// Dialog-Funktionen von Electron unterdrückt das; die Hülle ergänzt sie.
//
// 4T-001991 (Epic 3E-000188): Dieselbe Hülle bestimmt auch den Ordner, in dem
// ein Datei-Dialog öffnet. Windows merkt sich je Programm den zuletzt besuchten
// Ordner in der Registrierung; das lässt sich nicht abstellen und ist als
// Ausnahme hingenommen (Entscheidung des Product Owners vom 2026-09-29). Das
// Programm selbst merkt sich den Ordner nur im Arbeitsspeicher, solange es
// läuft, und liest das von Windows Gemerkte nie: Die Hülle gibt jedem Dialog
// einen absoluten `defaultPath` mit, bei dem Electron 33 den Startordner
// verbindlich setzt. Gespeichert wird davon nichts.
'use strict';

const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeLocale } = require('../../shared/locales');

// Name des Daten-Ordners neben der Programmdatei (Entscheidung des Product
// Owners vom 2026-09-28). Er ist für den Anwender sichtbar und gilt in allen
// Sprachfassungen; deshalb steht er genau hier und nirgends sonst als Literal.
const DATEN_ORDNER_NAME = 'Data';

// 4T-001991 (Epic 3E-000188): Name des temporären Ordners im Daten-Ordner.
const TEMP_ORDNER_NAME = 'Temp';

// 4T-001991: Name des Programm-Archivs und seiner unverpackten Ablage
// (Konvention von Electron und electron-builder; die Liste `asarUnpack` der
// Bau-Konfiguration legt fest, welche Dateien dort liegen).
const ARCHIV_NAME = 'app.asar';
const UNVERPACKT_NAME = 'app.asar.unpacked';

// 4T-001991: Eigenschaft der Datei-Dialoge von Electron, mit der Windows die
// gewählte Datei nicht in die Listen zuletzt benutzter Dateien einträgt.
const NICHT_IN_ZULETZT_BENUTZT = 'dontAddToRecent';

// 4T-001991: Die vier Datei-Dialoge von Electron und je ihre Ersatz-Optionen,
// wörtlich aus Electron 33 (lib/browser/api/dialog.ts, `openDialog` und
// `saveDialog`): `fehlend` gilt, wenn gar keine Optionen kommen,
// `eigenschaften`, wenn die Optionen kein Feld `properties` tragen. Die Hülle
// setzt dieselben Werte ein und ergänzt nur die eine Eigenschaft; sonst
// verlöre ein Öffnen-Dialog ohne `properties` seine Voreinstellung
// `openFile`.
const DATEI_DIALOGE = Object.freeze({
  showOpenDialog: { fehlend: { title: 'Open' }, eigenschaften: ['openFile'] },
  showOpenDialogSync: { fehlend: { title: 'Open' }, eigenschaften: ['openFile'] },
  showSaveDialog: { fehlend: { title: 'Save' }, eigenschaften: [] },
  showSaveDialogSync: { fehlend: { title: 'Save' }, eigenschaften: [] },
});

// Übersetzungs-Schlüssel der Meldung am nicht beschreibbaren Ort.
const MELDUNG_TITEL_SCHLUESSEL = 'app.portableNotWritableTitle';
const MELDUNG_TEXT_SCHLUESSEL = 'app.portableNotWritableMessage';

// Fehler-Codes, die sicher «hier liegt nichts» bedeuten. Jeder andere Fehler
// beim Nachsehen heißt «unbekannt» und wird vorsichtig behandelt (siehe
// pruefeDatenOrdner).
const NICHT_VORHANDEN = new Set(['ENOENT', 'ENOTDIR']);

const NICHT_PORTABEL = Object.freeze({ portabel: false, datenOrdner: null, beschreibbar: null });

// Sieht nach, was unter dem Pfad des Daten-Ordners liegt: 'verzeichnis',
// 'fehlt' (nichts oder etwas anderes als ein Verzeichnis) oder 'unbekannt'.
//
// 'unbekannt' entsteht, wenn das Nachsehen selbst scheitert, ohne dass sicher
// ist, dass dort nichts liegt. Der Aufrufer behandelt das wie einen vorhandenen,
// aber nicht beschreibbaren Daten-Ordner: Die Zusage der portablen Fassung ist,
// nirgends sonst zu schreiben, und ein stilles Ausweichen ins Benutzerprofil
// bräche sie gerade in dem Fall, den niemand bemerkt.
function pruefeDatenOrdner(datenOrdner, fs) {
  let info;
  try {
    info = fs.statSync(datenOrdner);
  } catch (err) {
    return err && NICHT_VORHANDEN.has(err.code) ? 'fehlt' : 'unbekannt';
  }
  return info.isDirectory() ? 'verzeichnis' : 'fehlt';
}

// Schreib-Probe im Daten-Ordner: eine leere Datei mit eindeutigem Namen
// anlegen und sofort wieder entfernen.
//
// Angelegt wird mit dem Kennzeichen 'wx', also nur, wenn der Name noch frei
// ist; eine zufällig gleichnamige Datei des Anwenders bleibt damit unberührt.
// Scheitert das Anlegen, ist nichts entstanden, und das Ergebnis ist «nicht
// beschreibbar».
function istBeschreibbar(datenOrdner, fs) {
  const probe = path.join(
    datenOrdner,
    `.em4me-schreibprobe-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let fd;
  try {
    fd = fs.openSync(probe, 'wx');
  } catch {
    // Genau das ist die Aussage der Probe: Hier darf das Programm nicht
    // schreiben. Angelegt wurde dabei nichts.
    return false;
  }
  // Ab hier ist der Ort nachweislich beschreibbar. Ein Fehler beim Schließen
  // oder Entfernen ändert daran nichts und darf den Programmstart nicht
  // abbrechen; er wird mit dem Pfad gemeldet, damit ein Rest auffindbar ist.
  try {
    fs.closeSync(fd);
  } catch (err) {
    console.warn(`Schreib-Probe im Daten-Ordner nicht geschlossen (${probe}):`, err);
  }
  try {
    fs.unlinkSync(probe);
  } catch (err) {
    console.warn(`Schreib-Probe im Daten-Ordner nicht entfernt (${probe}):`, err);
  }
  return true;
}

/**
 * Stellt fest, ob das Programm portabel läuft, und prüft dann den Daten-Ordner.
 *
 * Das Ergebnis ist eingefroren: main.js ermittelt es einmal vor dem
 * Einzel-Instanz-Schutz und reicht es weiter, statt es an mehreren Stellen neu
 * zu berechnen.
 *
 * @param {object} eingaben
 * @param {string} eingaben.programmPfad Pfad der laufenden Programmdatei
 *   (`process.execPath`).
 * @param {boolean} eingaben.gepackt Läuft das Programm gepackt (`app.isPackaged`)?
 * @param {string|undefined} eingaben.testUmlenkung Wert von `SCG_TEST_USER_DATA`.
 * @param {string|undefined} [eingaben.portableExeOrdner] Wert von
 *   `PORTABLE_EXECUTABLE_DIR`, gesetzt vom Start-Rahmen der portablen EXE.
 * @param {boolean} [eingaben.zweiteAuspraegung] Läuft die zweite Ausprägung
 *   für den Prüfstand? Dann zählt `portableExeOrdner` nicht.
 * @param {object} [eingaben.dateisystem] Datei-Zugriff mit `statSync`,
 *   `openSync`, `closeSync` und `unlinkSync`; ohne Angabe `node:fs`.
 * @returns {Readonly<{portabel: boolean, datenOrdner: string|null, beschreibbar: boolean|null}>}
 *   Nicht portabel: `datenOrdner` und `beschreibbar` sind `null` (nicht
 *   geprüft). Portabel: der absolute Pfad des Daten-Ordners und das Ergebnis
 *   der Schreib-Probe.
 */
function ermittlePortablenBetrieb({
  programmPfad,
  gepackt,
  testUmlenkung,
  portableExeOrdner,
  zweiteAuspraegung = false,
  dateisystem = nodeFs,
}) {
  if (testUmlenkung) return NICHT_PORTABEL;
  if (!gepackt) return NICHT_PORTABEL;
  if (typeof programmPfad !== 'string' || programmPfad === '') {
    throw new TypeError('ermittlePortablenBetrieb: programmPfad fehlt.');
  }
  // 4T-002222: Die portable Fassung ist eine einzelne Programmdatei
  // (Anordnung des Product Owners vom 2026-10-10, im Wortlaut: «Das muss
  // immer eine EXE-Datei sein.»). Ihr Start-Rahmen entpackt das Programm in den
  // Temp-Ordner von Windows und nennt in `PORTABLE_EXECUTABLE_DIR` den Ordner,
  // in dem die EXE selbst liegt. Ist er gesetzt, läuft das Programm portabel,
  // und der Daten-Ordner gehört neben die EXE; beim ersten Start legt das
  // Programm ihn dort an. Scheitert das Anlegen, gilt der Ort als nicht
  // beschreibbar (Meldung und Beenden, wie beim vorhandenen Ordner). Die
  // zweite Ausprägung für den Prüfstand ist ebenfalls eine portable EXE,
  // behält aber ihren Ort im Benutzerprofil (eigene Identität, 4T-001335).
  if (!zweiteAuspraegung && typeof portableExeOrdner === 'string' && portableExeOrdner !== '') {
    const neben = path.join(path.resolve(portableExeOrdner), DATEN_ORDNER_NAME);
    let lageNeben = pruefeDatenOrdner(neben, dateisystem);
    if (lageNeben === 'fehlt') {
      try {
        dateisystem.mkdirSync(neben, { recursive: true });
        lageNeben = pruefeDatenOrdner(neben, dateisystem);
      } catch {
        return Object.freeze({ portabel: true, datenOrdner: neben, beschreibbar: false });
      }
    }
    const beschreibbarNeben = lageNeben === 'verzeichnis' && istBeschreibbar(neben, dateisystem);
    return Object.freeze({ portabel: true, datenOrdner: neben, beschreibbar: beschreibbarNeben });
  }
  const datenOrdner = path.join(path.dirname(path.resolve(programmPfad)), DATEN_ORDNER_NAME);
  const lage = pruefeDatenOrdner(datenOrdner, dateisystem);
  if (lage === 'fehlt') return NICHT_PORTABEL;
  const beschreibbar = lage === 'verzeichnis' && istBeschreibbar(datenOrdner, dateisystem);
  return Object.freeze({ portabel: true, datenOrdner, beschreibbar });
}

/**
 * Sprache der Meldung am nicht beschreibbaren Ort: die erste bevorzugte
 * Sprache des Betriebssystems, sofern das Programm sie mitbringt, sonst
 * Englisch. Die Spracheinstellung des Programms steht im Einstellungs-Speicher,
 * und der wird in diesem Fall bewusst nicht geladen.
 *
 * @param {string[]} bevorzugteSprachen Liste aus
 *   `app.getPreferredSystemLanguages()`, bevorzugte zuerst.
 * @returns {string} Mitgelieferter Sprach-Code.
 */
function meldungsSprache(bevorzugteSprachen) {
  if (!Array.isArray(bevorzugteSprachen)) {
    throw new TypeError('meldungsSprache: bevorzugteSprachen ist keine Liste.');
  }
  return normalizeLocale(bevorzugteSprachen[0]);
}

/**
 * 4T-001991 (Epic 3E-000188): Pfad des temporären Ordners im Daten-Ordner.
 *
 * Reine Pfad-Bildung; angelegt wird der Ordner in main.js, und nur im
 * portablen, beschreibbaren Betrieb.
 *
 * @param {string} datenOrdner Absoluter Pfad des Daten-Ordners.
 * @returns {string} Absoluter Pfad `<Daten-Ordner>\Temp`.
 */
function temporaerOrdnerPfad(datenOrdner) {
  if (typeof datenOrdner !== 'string' || datenOrdner === '') {
    throw new TypeError('temporaerOrdnerPfad: datenOrdner fehlt.');
  }
  if (!path.isAbsolute(datenOrdner)) {
    throw new TypeError(`temporaerOrdnerPfad: datenOrdner ist nicht absolut (${datenOrdner}).`);
  }
  return path.join(datenOrdner, TEMP_ORDNER_NAME);
}

/**
 * 4T-001991 (Epic 3E-000188): Pfad des Programm-Symbols für die
 * Laufzeit-Umgebung (Fenster-Option `icon`).
 *
 * Im gepackten Programm liegt der Symbol-Ordner im Programm-Archiv
 * (`…\resources\app.asar\src\assets`). Gebildet wird dann derselbe Pfad in der
 * unverpackten Ablage (`…\resources\app.asar.unpacked\src\assets`), in die die
 * Bau-Konfiguration beide Symbol-Dateien legt. Aus den Quellen enthält der
 * Pfad kein Archiv und bleibt unverändert. Erkannt wird am Pfad-Abschnitt,
 * nicht an einem Merker, weil allein der Pfad sagt, ob die Datei im Archiv
 * liegt.
 *
 * @param {string} assetsOrdner Absoluter Pfad des Ordners `src/assets`, wie
 *   ihn der Aufrufer aus seinem `__dirname` bildet.
 * @param {string} plattform `process.platform`; Linux nimmt das PNG, alle
 *   anderen das ICO (macOS ignoriert die Option ohnehin).
 * @returns {string} Absoluter Pfad der Symbol-Datei.
 */
function programmSymbolPfad(assetsOrdner, plattform) {
  if (typeof assetsOrdner !== 'string' || assetsOrdner === '') {
    throw new TypeError('programmSymbolPfad: assetsOrdner fehlt.');
  }
  const datei = plattform === 'linux' ? 'icon.png' : 'icon.ico';
  const abschnitte = path.resolve(assetsOrdner).split(path.sep);
  const ort = abschnitte.lastIndexOf(ARCHIV_NAME);
  if (ort !== -1) abschnitte[ort] = UNVERPACKT_NAME;
  return path.join(abschnitte.join(path.sep), datei);
}

// 4T-001991: Vorgabe-Pfad eines Datei-Dialogs. Ohne Vorgabe des Aufrufers gilt
// der Ausgangs-Ordner (gemerkter Ordner oder Start-Ordner); ein bloßer
// Dateiname ohne Ordner wird mit ihm zu einem absoluten Pfad verbunden. Jeder
// andere Wert bleibt, wie er ist: ein absoluter Pfad gilt ohnehin verbindlich,
// und was Electron zurückweist, soll der Aufrufer wie ohne Hülle sehen.
function vorgabePfad(vorgabe, ausgangsOrdner) {
  if (vorgabe == null || vorgabe === '') return ausgangsOrdner;
  if (typeof vorgabe !== 'string' || path.isAbsolute(vorgabe)) return vorgabe;
  return path.basename(vorgabe) === vorgabe ? path.join(ausgangsOrdner, vorgabe) : vorgabe;
}

// 4T-001991: Optionen eines Datei-Dialogs mit der Eigenschaft
// `dontAddToRecent` und dem Vorgabe-Pfad. Die Optionen des Aufrufers werden nie
// verändert, sondern kopiert. Was Electron selbst zurückweist (Optionen, die
// kein Objekt sind; `properties`, das keine Liste ist), reicht die Hülle
// unverändert durch, damit der Aufrufer denselben Fehler sieht wie ohne Hülle.
function vorbereiteteOptionen(optionen, ersatz, ausgangsOrdner) {
  if (optionen == null) {
    return {
      ...ersatz.fehlend,
      defaultPath: ausgangsOrdner,
      properties: [...ersatz.eigenschaften, NICHT_IN_ZULETZT_BENUTZT],
    };
  }
  if (typeof optionen !== 'object') return optionen;
  const { properties } = optionen;
  if (properties !== undefined && !Array.isArray(properties)) return optionen;
  const liste = properties === undefined ? ersatz.eigenschaften : properties;
  return {
    ...optionen,
    defaultPath: vorgabePfad(optionen.defaultPath, ausgangsOrdner),
    properties: liste.includes(NICHT_IN_ZULETZT_BENUTZT)
      ? liste
      : [...liste, NICHT_IN_ZULETZT_BENUTZT],
  };
}

// 4T-001991: Ordner der bestätigten Wahl aus der Rückgabe eines Datei-Dialogs,
// oder null bei Abbruch. Formen wie in Electron 33: `showOpenDialog` liefert
// `{ canceled, filePaths }`, `showOpenDialogSync` die Liste oder `undefined`,
// `showSaveDialog` `{ canceled, filePath }`, `showSaveDialogSync` den Pfad oder
// eine leere Zeichenkette. Bei der Ordner-Wahl (`openDirectory`, unter Windows
// vorrangig vor `openFile`) ist das Gewählte selbst der Ordner, sonst der
// Ordner der (ersten) gewählten Datei.
function gewaehlterOrdner(rueckgabe, optionen) {
  let gewaehlt = rueckgabe;
  if (rueckgabe && typeof rueckgabe === 'object' && !Array.isArray(rueckgabe)) {
    if (rueckgabe.canceled !== false) return null;
    gewaehlt = rueckgabe.filePaths !== undefined ? rueckgabe.filePaths : rueckgabe.filePath;
  }
  if (Array.isArray(gewaehlt)) gewaehlt = gewaehlt[0];
  if (typeof gewaehlt !== 'string' || !path.isAbsolute(gewaehlt)) return null;
  const properties = optionen && typeof optionen === 'object' ? optionen.properties : undefined;
  const ordnerWahl = Array.isArray(properties) && properties.includes('openDirectory');
  return ordnerWahl ? gewaehlt : path.dirname(gewaehlt);
}

// 4T-001991: Ist der Pfad ein vorhandenes Verzeichnis? Jeder Fehler beim
// Nachsehen heißt «nein»; dann öffnet der Dialog im Start-Ordner.
function istVerzeichnis(ordner, fs) {
  try {
    return fs.statSync(ordner).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 4T-001991 (Epic 3E-000188): Hüllen der vier Datei-Dialoge, die jedem Aufruf
 * die Eigenschaft `dontAddToRecent` ergänzen und ihn sonst unverändert an das
 * Original weiterreichen, samt Rückgabe (Zusage oder Wert).
 *
 * Beide Aufruf-Formen von Electron werden bedient, mit derselben Regel wie in
 * Electron 33: Ist das erste Argument leer oder ein Fenster, stehen die
 * Optionen an zweiter Stelle, sonst an erster.
 *
 * Dazu der Ordner, in dem der Dialog öffnet: Bringt der Aufrufer keinen
 * `defaultPath` mit, setzt die Hülle den zuletzt besuchten Ordner, solange er
 * noch als Verzeichnis vorhanden ist, sonst den Start-Ordner; ein bloßer
 * Dateiname wird mit demselben Ordner verbunden. Nach einer bestätigten Wahl
 * merkt sich die Hülle deren Ordner, bei Abbruch nicht. Gemerkt wird ein Ordner
 * für alle vier Dialoge, allein im Arbeitsspeicher dieser Hülle.
 *
 * Reine Funktion: Das Dialog-Objekt wird nicht verändert; das Einsetzen der
 * Hüllen ist Sache des Aufrufers (main.js, nur im portablen, beschreibbaren
 * Betrieb).
 *
 * @param {object} dialogObjekt Objekt mit den vier Funktionen
 *   `showOpenDialog`, `showOpenDialogSync`, `showSaveDialog` und
 *   `showSaveDialogSync` (`require('electron').dialog`).
 * @param {(wert: unknown) => boolean} istFenster Erkennt ein Fenster als
 *   erstes Argument (in main.js `instanceof BaseWindow`).
 * @param {object} ort
 * @param {string} ort.startOrdner Absoluter Pfad, in dem der Dialog öffnet,
 *   solange kein Ordner gemerkt ist (in main.js der Ordner «Dokumente»).
 * @param {object} [ort.dateisystem] Datei-Zugriff mit `statSync` für die
 *   Prüfung, ob der gemerkte Ordner noch vorhanden ist; ohne Angabe `node:fs`.
 * @returns {Readonly<Record<string, Function>>} Die vier Hüllen unter den
 *   Namen der Originale.
 */
/**
 * Start-Ordner der Datei-Dialoge: der Ordner «Dokumente» des Anwenders, und
 * wenn das Betriebssystem ihn nicht liefert, der Rückfall-Ordner.
 *
 * Die Laufzeit-Umgebung wirft, wenn ein Ordner des Anwenders nicht zu
 * ermitteln ist (etwa «Dokumente» auf ein nicht erreichbares Netzlaufwerk
 * umgeleitet). Die portable Fassung läuft auf fremden Rechnern; ein solcher
 * Rechner darf ihren Start nicht verhindern.
 *
 * @param {() => string} holeDokumente Liefert den Ordner «Dokumente» (in
 *   main.js `app.getPath('documents')`); darf werfen.
 * @param {string} rueckfall Absoluter Pfad für den Fall, dass der Ordner
 *   nicht zu ermitteln ist (in main.js der Ordner des Programms).
 * @returns {string} Absoluter Pfad des Start-Ordners.
 */
function startOrdnerDerDialoge(holeDokumente, rueckfall) {
  try {
    const ordner = holeDokumente();
    if (typeof ordner === 'string' && path.isAbsolute(ordner)) return ordner;
  } catch (err) {
    console.warn(
      'Ordner «Dokumente» nicht ermittelbar, Datei-Dialoge beginnen im Rückfall-Ordner:',
      err && err.message ? err.message : err,
    );
  }
  return rueckfall;
}

function umhuelleDateiDialoge(
  dialogObjekt,
  istFenster,
  { startOrdner, dateisystem = nodeFs } = {},
) {
  if (dialogObjekt == null || typeof dialogObjekt !== 'object') {
    throw new TypeError('umhuelleDateiDialoge: dialogObjekt fehlt.');
  }
  if (typeof istFenster !== 'function') {
    throw new TypeError('umhuelleDateiDialoge: istFenster ist keine Funktion.');
  }
  if (typeof startOrdner !== 'string' || !path.isAbsolute(startOrdner)) {
    throw new TypeError(
      `umhuelleDateiDialoge: startOrdner ist kein absoluter Pfad (${startOrdner}).`,
    );
  }
  let gemerkterOrdner = null;
  const ausgangsOrdner = () =>
    gemerkterOrdner && istVerzeichnis(gemerkterOrdner, dateisystem) ? gemerkterOrdner : startOrdner;
  const merke = (rueckgabe, optionen) => {
    const ordner = gewaehlterOrdner(rueckgabe, optionen);
    if (ordner) gemerkterOrdner = ordner;
    return rueckgabe;
  };
  const huellen = {};
  for (const [name, ersatz] of Object.entries(DATEI_DIALOGE)) {
    const original = dialogObjekt[name];
    if (typeof original !== 'function') {
      throw new TypeError(`umhuelleDateiDialoge: dialogObjekt.${name} ist keine Funktion.`);
    }
    huellen[name] = function dateiDialogOhneZuletztBenutzt(erstes, zweites) {
      const mitFenster = !erstes || istFenster(erstes);
      const optionen = vorbereiteteOptionen(
        mitFenster ? zweites : erstes,
        ersatz,
        ausgangsOrdner(),
      );
      const rueckgabe = mitFenster
        ? original.call(dialogObjekt, erstes, optionen)
        : original.call(dialogObjekt, optionen);
      return rueckgabe && typeof rueckgabe.then === 'function'
        ? rueckgabe.then((wert) => merke(wert, optionen))
        : merke(rueckgabe, optionen);
    };
  }
  return Object.freeze(huellen);
}

module.exports = {
  DATEN_ORDNER_NAME,
  TEMP_ORDNER_NAME,
  NICHT_IN_ZULETZT_BENUTZT,
  MELDUNG_TITEL_SCHLUESSEL,
  MELDUNG_TEXT_SCHLUESSEL,
  ermittlePortablenBetrieb,
  meldungsSprache,
  temporaerOrdnerPfad,
  programmSymbolPfad,
  umhuelleDateiDialoge,
  startOrdnerDerDialoge,
};
