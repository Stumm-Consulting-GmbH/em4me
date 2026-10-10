// 4T-001990 (Epic 3E-000188): Erkennung des portablen Betriebs und die im
// portablen Betrieb abgeschaltete Übernahme aus dem Benutzerprofil.
//
// Geprüft wird gegen echte Temp-Ordner, wo das Dateisystem die Aussage trägt
// (Daten-Ordner vorhanden, fehlt, ist eine Datei), und mit einem gestellten
// Datei-Zugriff nur dort, wo sich die Lage unter Windows nicht zuverlässig
// herstellen lässt: Ein Verzeichnis mit Schreibschutz-Attribut nimmt dort
// weiterhin neue Dateien an, und genau deshalb prüft das Modul mit einer
// Probe-Datei statt mit `fs.access`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DATEN_ORDNER_NAME,
  MELDUNG_TITEL_SCHLUESSEL,
  MELDUNG_TEXT_SCHLUESSEL,
  ermittlePortablenBetrieb,
  meldungsSprache,
  TEMP_ORDNER_NAME,
  temporaerOrdnerPfad,
  programmSymbolPfad,
  NICHT_IN_ZULETZT_BENUTZT,
  umhuelleDateiDialoge,
  startOrdnerDerDialoge,
} from '../../src/main/app/portabler-betrieb.js';
import { migrateSettingsFromPreviousName } from '../../src/main/app/settings-store.js';
import { PRODUKTIV_PROFIL } from '../../src/main/app/user-data-migration.js';

const temps = [];
function mkTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-portabel-'));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (temps.length) {
    const dir = temps.pop();
    await fsp
      .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      .catch(() => {
        // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
      });
  }
});

// Ein Programm-Ordner wie nach dem Entpacken: die Programmdatei und, je nach
// Fall, daneben der Daten-Ordner.
function programmOrdner({ daten = 'verzeichnis' } = {}) {
  const wurzel = mkTemp();
  const programmPfad = path.join(wurzel, 'EM4me.exe');
  fs.writeFileSync(programmPfad, '');
  const datenOrdner = path.join(wurzel, DATEN_ORDNER_NAME);
  if (daten === 'verzeichnis') fs.mkdirSync(datenOrdner);
  if (daten === 'datei') fs.writeFileSync(datenOrdner, 'keine Ablage');
  return { wurzel, programmPfad, datenOrdner };
}

// Datei-Zugriff, der jeden Aufruf mitschreibt und einzelne Funktionen
// ersetzen lässt; alles Übrige geht an das echte Dateisystem.
function protokollierterZugriff(ersatz = {}) {
  const aufrufe = [];
  const zugriff = {};
  for (const name of ['statSync', 'openSync', 'closeSync', 'unlinkSync', 'mkdirSync']) {
    zugriff[name] = (...args) => {
      aufrufe.push({ name, args });
      return (ersatz[name] || fs[name])(...args);
    };
  }
  return { zugriff, aufrufe };
}

function fehler(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

describe('Erkennung des portablen Betriebs (4T-001990)', () => {
  it('heißt der Daten-Ordner «Data»', () => {
    // Entscheidung des Product Owners vom 2026-09-28; der Name ist für den
    // Anwender sichtbar, weil die portable Programmdatei ihn neben sich anlegt.
    expect(DATEN_ORDNER_NAME).toBe('Data');
  });

  it('erkennt den Daten-Ordner neben der gepackten Programmdatei', () => {
    const { programmPfad, datenOrdner } = programmOrdner();

    const ergebnis = ermittlePortablenBetrieb({ programmPfad, gepackt: true });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: true });
  });

  it('hinterlässt nach der Schreib-Probe nichts im Daten-Ordner', () => {
    const { programmPfad, datenOrdner } = programmOrdner();
    const { zugriff, aufrufe } = protokollierterZugriff();

    ermittlePortablenBetrieb({ programmPfad, gepackt: true, dateisystem: zugriff });

    expect(fs.readdirSync(datenOrdner)).toEqual([]);
    // Die Probe liegt IM Daten-Ordner und wird nur angelegt, wenn ihr Name
    // frei ist ('wx'): Eine gleichnamige Datei des Anwenders bliebe unberührt.
    const anlegen = aufrufe.find((a) => a.name === 'openSync');
    expect(path.dirname(anlegen.args[0])).toBe(datenOrdner);
    expect(anlegen.args[1]).toBe('wx');
    expect(aufrufe.filter((a) => a.name === 'unlinkSync')).toHaveLength(1);
  });

  it('gilt ohne Daten-Ordner als nicht portabel', () => {
    const { programmPfad, wurzel } = programmOrdner({ daten: 'fehlt' });

    const ergebnis = ermittlePortablenBetrieb({ programmPfad, gepackt: true });

    expect(ergebnis).toEqual({ portabel: false, datenOrdner: null, beschreibbar: null });
    expect(fs.readdirSync(wurzel)).toEqual(['EM4me.exe']);
  });

  it('zählt eine gleichnamige Datei nicht als Daten-Ordner', () => {
    const { programmPfad, datenOrdner } = programmOrdner({ daten: 'datei' });

    const ergebnis = ermittlePortablenBetrieb({ programmPfad, gepackt: true });

    expect(ergebnis.portabel).toBe(false);
    expect(fs.readFileSync(datenOrdner, 'utf8')).toBe('keine Ablage');
  });

  it('meldet einen nicht beschreibbaren Daten-Ordner, ohne etwas anzulegen', () => {
    const { programmPfad, datenOrdner } = programmOrdner();
    const { zugriff, aufrufe } = protokollierterZugriff({
      openSync: () => {
        throw fehler('EROFS');
      },
    });

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      dateisystem: zugriff,
    });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: false });
    // Scheitert die Probe, entsteht nichts, und es gibt nichts zu entfernen.
    expect(aufrufe.some((a) => a.name === 'unlinkSync')).toBe(false);
    expect(fs.readdirSync(datenOrdner)).toEqual([]);
  });

  it('weicht bei unklarem Befund am Daten-Ordner nicht ins Benutzerprofil aus', () => {
    // Scheitert schon das Nachsehen, ohne dass sicher nichts dort liegt, gilt
    // der Ort als portabel und nicht beschreibbar: Das Programm meldet sich
    // und beendet, statt still ins Benutzerprofil zu schreiben.
    const { programmPfad, datenOrdner } = programmOrdner();
    const { zugriff, aufrufe } = protokollierterZugriff({
      statSync: () => {
        throw fehler('EPERM');
      },
    });

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      dateisystem: zugriff,
    });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: false });
    expect(aufrufe.some((a) => a.name === 'openSync')).toBe(false);
  });

  it('lässt der Test-Umlenkung den Vorrang, auch wenn der Daten-Ordner da ist', () => {
    const { programmPfad, datenOrdner } = programmOrdner();
    const { zugriff, aufrufe } = protokollierterZugriff();

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      testUmlenkung: path.join(os.tmpdir(), 'em4me-e2e-profil'),
      dateisystem: zugriff,
    });

    expect(ergebnis.portabel).toBe(false);
    // Es wird nicht einmal nachgesehen: Die Test-Umlenkung entscheidet allein.
    expect(aufrufe).toEqual([]);
    expect(fs.readdirSync(datenOrdner)).toEqual([]);
  });

  it('erkennt einen Start aus den Quellen nie als portabel', () => {
    const { programmPfad } = programmOrdner();
    const { zugriff, aufrufe } = protokollierterZugriff();

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: false,
      dateisystem: zugriff,
    });

    expect(ergebnis.portabel).toBe(false);
    expect(aufrufe).toEqual([]);
  });

  it('liefert ein eingefrorenes Ergebnis', () => {
    const { programmPfad } = programmOrdner();
    expect(Object.isFrozen(ermittlePortablenBetrieb({ programmPfad, gepackt: true }))).toBe(true);
    expect(Object.isFrozen(ermittlePortablenBetrieb({ programmPfad, gepackt: false }))).toBe(true);
  });

  it('bricht laut ab, wenn der Pfad der Programmdatei fehlt', () => {
    expect(() => ermittlePortablenBetrieb({ programmPfad: '', gepackt: true })).toThrow(TypeError);
    expect(() => ermittlePortablenBetrieb({ gepackt: true })).toThrow(TypeError);
  });
});

// 4T-002222: Die portable Fassung ist eine einzelne EXE (Anordnung des Product
// Owners vom 2026-10-10). Ihr Start-Rahmen nennt den Ordner der EXE in
// PORTABLE_EXECUTABLE_DIR; der Daten-Ordner gehört dorthin und entsteht beim
// ersten Start. Die Programmdatei selbst liegt dabei im Temp-Ordner, in den
// der Start-Rahmen entpackt; neben ihr liegt kein Daten-Ordner.
describe('Erkennung der portablen EXE (4T-002222)', () => {
  function exeLage({ daten = 'fehlt' } = {}) {
    const exeOrdner = mkTemp();
    fs.writeFileSync(path.join(exeOrdner, 'EM4me-1.147.0-Portable.exe'), '');
    const datenOrdner = path.join(exeOrdner, DATEN_ORDNER_NAME);
    if (daten === 'verzeichnis') fs.mkdirSync(datenOrdner);
    const entpackt = mkTemp();
    const programmPfad = path.join(entpackt, 'EM4me.exe');
    fs.writeFileSync(programmPfad, '');
    return { exeOrdner, datenOrdner, programmPfad, entpackt };
  }

  it('legt beim ersten Start den Daten-Ordner neben der EXE an und läuft portabel', () => {
    const { exeOrdner, datenOrdner, programmPfad, entpackt } = exeLage();

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      portableExeOrdner: exeOrdner,
    });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: true });
    expect(fs.statSync(datenOrdner).isDirectory()).toBe(true);
    expect(fs.readdirSync(datenOrdner)).toEqual([]);
    // Im Entpack-Ordner des Start-Rahmens entsteht nichts.
    expect(fs.readdirSync(entpackt)).toEqual(['EM4me.exe']);
  });

  it('nimmt einen vorhandenen Daten-Ordner neben der EXE', () => {
    const { exeOrdner, datenOrdner, programmPfad } = exeLage({ daten: 'verzeichnis' });
    fs.writeFileSync(path.join(datenOrdner, 'config.json'), '{}');

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      portableExeOrdner: exeOrdner,
    });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: true });
    expect(fs.readdirSync(datenOrdner)).toEqual(['config.json']);
  });

  it('meldet den Ort als nicht beschreibbar, wenn der Daten-Ordner nicht angelegt werden kann', () => {
    const { exeOrdner, datenOrdner, programmPfad } = exeLage();
    const { zugriff } = protokollierterZugriff({
      mkdirSync: () => {
        throw fehler('EROFS');
      },
    });

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      portableExeOrdner: exeOrdner,
      dateisystem: zugriff,
    });

    expect(ergebnis).toEqual({ portabel: true, datenOrdner, beschreibbar: false });
    expect(fs.existsSync(datenOrdner)).toBe(false);
  });

  it('lässt der Test-Umlenkung und dem Start aus den Quellen den Vorrang', () => {
    const { exeOrdner, datenOrdner, programmPfad } = exeLage();

    expect(
      ermittlePortablenBetrieb({
        programmPfad,
        gepackt: true,
        testUmlenkung: mkTemp(),
        portableExeOrdner: exeOrdner,
      }).portabel,
    ).toBe(false);
    expect(
      ermittlePortablenBetrieb({ programmPfad, gepackt: false, portableExeOrdner: exeOrdner })
        .portabel,
    ).toBe(false);
    expect(fs.existsSync(datenOrdner)).toBe(false);
  });

  it('behandelt die zweite Ausprägung für den Prüfstand wie bisher als nicht portabel', () => {
    const { exeOrdner, datenOrdner, programmPfad } = exeLage();

    const ergebnis = ermittlePortablenBetrieb({
      programmPfad,
      gepackt: true,
      portableExeOrdner: exeOrdner,
      zweiteAuspraegung: true,
    });

    expect(ergebnis.portabel).toBe(false);
    expect(fs.existsSync(datenOrdner)).toBe(false);
  });
});

describe('Sprache der Meldung am nicht beschreibbaren Ort (4T-001990)', () => {
  it('folgt der ersten bevorzugten Sprache des Betriebssystems', () => {
    expect(meldungsSprache(['de-DE', 'en-US'])).toBe('de');
    expect(meldungsSprache(['fr-CA'])).toBe('fr');
    expect(meldungsSprache(['it'])).toBe('it');
  });

  it('fällt auf Englisch zurück, wenn das Programm die Sprache nicht mitbringt', () => {
    expect(meldungsSprache(['fi-FI', 'de-DE'])).toBe('en');
    expect(meldungsSprache([])).toBe('en');
  });

  it('bricht laut ab, wenn keine Liste kommt', () => {
    expect(() => meldungsSprache(undefined)).toThrow(TypeError);
  });

  it('nennt die Übersetzungs-Schlüssel im Namensraum app', () => {
    expect(MELDUNG_TITEL_SCHLUESSEL).toBe('app.portableNotWritableTitle');
    expect(MELDUNG_TEXT_SCHLUESSEL).toBe('app.portableNotWritableMessage');
  });
});

// Die Übernahme beim ersten Start liest ein Vorgänger- oder das produktive
// Profil. Im portablen Betrieb darf sie das nie — weder in der Rebrand-Kette
// noch in der zweiten Ausprägung (Entscheidung des Product Owners vom
// 2026-09-28, Weg A der Vorlage 2).
describe('Keine Übernahme im portablen Betrieb (4T-001990)', () => {
  // Legt ein vollständiges Profil an: Einstellungen, Entwürfe, Erweiterungen.
  function profil(appData, name) {
    const root = path.join(appData, name);
    fs.mkdirSync(path.join(root, 'drafts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'extensions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ quelle: name }));
    fs.writeFileSync(path.join(root, 'drafts', 'entwurf.md'), '# Entwurf');
    return root;
  }

  // Jeder Zugriff der Übernahme läuft über diese vier Funktionen.
  function beobachteZugriffe() {
    return ['access', 'cp', 'mkdir', 'readFile'].map((name) => vi.spyOn(fsp, name));
  }

  function beruehrt(spione, wurzel) {
    return spione.some((spion) =>
      spion.mock.calls.some((args) => String(args[0]).startsWith(wurzel)),
    );
  }

  for (const [fall, auspraegung] of [
    ['Rebrand-Kette', null],
    ['zweite Ausprägung', 'Pruefstand'],
  ]) {
    it(`liest und kopiert nichts aus dem Benutzerprofil (${fall})`, async () => {
      const appData = mkTemp();
      profil(appData, 'Perspective Markdown++');
      profil(appData, PRODUKTIV_PROFIL);
      const { datenOrdner } = programmOrdner();
      const spione = beobachteZugriffe();

      await migrateSettingsFromPreviousName({
        appDataDir: appData,
        userDataDir: datenOrdner,
        auspraegung,
        portabel: true,
      });

      expect(beruehrt(spione, appData)).toBe(false);
      expect(beruehrt(spione, datenOrdner)).toBe(false);
      expect(fs.readdirSync(datenOrdner)).toEqual([]);
    });
  }

  it('übernimmt außerhalb des portablen Betriebs weiterhin (Gegenprobe)', async () => {
    // Ohne diese Gegenprobe bewiese der Fall oben nur, dass die Beobachtung
    // nichts sieht.
    const appData = mkTemp();
    const quelle = profil(appData, 'Perspective Markdown++');
    const userData = path.join(mkTemp(), 'EM4me');
    const spione = beobachteZugriffe();
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await migrateSettingsFromPreviousName({
      appDataDir: appData,
      userDataDir: userData,
      auspraegung: null,
      portabel: false,
    });

    expect(beruehrt(spione, quelle)).toBe(true);
    expect(fs.existsSync(path.join(userData, 'config.json'))).toBe(true);
  });
});

// 4T-001991 (Epic 3E-000188): Pfad-Bildungen gegen Spuren außerhalb des
// Daten-Ordners. Die Pfade werden mit `path.join` gebildet, damit die Fälle
// auf jeder Plattform dieselbe Aussage messen.
describe('portabler Betrieb: temporärer Ordner im Daten-Ordner', () => {
  it('legt den temporären Ordner unter dem festen Namen in den Daten-Ordner', () => {
    const datenOrdner = path.join(os.tmpdir(), 'EM4me', DATEN_ORDNER_NAME);
    expect(TEMP_ORDNER_NAME).toBe('Temp');
    expect(temporaerOrdnerPfad(datenOrdner)).toBe(path.join(datenOrdner, 'Temp'));
  });

  it('bildet nur einen Pfad und legt nichts an', () => {
    const datenOrdner = path.join(mkTemp(), DATEN_ORDNER_NAME);
    temporaerOrdnerPfad(datenOrdner);
    expect(fs.existsSync(datenOrdner)).toBe(false);
  });

  it('weist einen fehlenden oder relativen Daten-Ordner ab', () => {
    expect(() => temporaerOrdnerPfad('')).toThrow(TypeError);
    expect(() => temporaerOrdnerPfad(undefined)).toThrow(TypeError);
    expect(() => temporaerOrdnerPfad(path.join('relativ', DATEN_ORDNER_NAME))).toThrow(TypeError);
  });
});

describe('Programm-Symbol außerhalb des Programm-Archivs', () => {
  const programm = path.join(os.tmpdir(), 'EM4me', 'resources');

  it('zeigt im gepackten Programm auf die unverpackte Ablage', () => {
    const imArchiv = path.join(programm, 'app.asar', 'src', 'assets');
    expect(programmSymbolPfad(imArchiv, 'win32')).toBe(
      path.join(programm, 'app.asar.unpacked', 'src', 'assets', 'icon.ico'),
    );
    expect(programmSymbolPfad(imArchiv, 'linux')).toBe(
      path.join(programm, 'app.asar.unpacked', 'src', 'assets', 'icon.png'),
    );
  });

  it('lässt den Pfad aus den Quellen unverändert', () => {
    const quellen = path.join(os.tmpdir(), 'EM4me-Quellen', 'src', 'assets');
    expect(programmSymbolPfad(quellen, 'win32')).toBe(path.join(quellen, 'icon.ico'));
    expect(programmSymbolPfad(quellen, 'linux')).toBe(path.join(quellen, 'icon.png'));
  });

  it('erkennt das Archiv nur als ganzen Pfad-Abschnitt', () => {
    const aehnlich = path.join(os.tmpdir(), 'app.asar-Kopie', 'src', 'assets');
    expect(programmSymbolPfad(aehnlich, 'win32')).toBe(path.join(aehnlich, 'icon.ico'));
    const schonUnverpackt = path.join(programm, 'app.asar.unpacked', 'src', 'assets');
    expect(programmSymbolPfad(schonUnverpackt, 'win32')).toBe(
      path.join(schonUnverpackt, 'icon.ico'),
    );
  });

  it('weist einen fehlenden Symbol-Ordner ab', () => {
    expect(() => programmSymbolPfad('', 'win32')).toThrow(TypeError);
  });
});

// 4T-001991 (Epic 3E-000188): Hülle der Datei-Dialoge. Gestellt wird ein
// Dialog-Objekt, das jeden Aufruf mitschreibt; ein Fenster ist ein Objekt aus
// der Klasse `GestelltesFenster`, wie in main.js ein `BaseWindow`.
describe('portabler Betrieb: Datei-Dialoge ohne Listen zuletzt benutzter Dateien', () => {
  class GestelltesFenster {}
  const istFenster = (x) => x instanceof GestelltesFenster;
  const NAMEN = ['showOpenDialog', 'showOpenDialogSync', 'showSaveDialog', 'showSaveDialogSync'];

  function gestellterDialog() {
    const aufrufe = [];
    const dialog = {};
    for (const name of NAMEN) {
      dialog[name] = function (...args) {
        aufrufe.push({ name, args, dies: this });
        return name.endsWith('Sync')
          ? { art: 'sync', name }
          : Promise.resolve({ art: 'async', name });
      };
    }
    return { dialog, aufrufe };
  }

  // Start-Ordner der Hülle; er muss absolut sein, aber nicht vorhanden.
  const START = path.resolve('/Start-Ordner-der-Huelle');
  const huelle = (dialog, weiter = {}) =>
    umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START, ...weiter });

  it('heißt die Eigenschaft wie in Electron', () => {
    expect(NICHT_IN_ZULETZT_BENUTZT).toBe('dontAddToRecent');
  });

  it('ergänzt die Eigenschaft in der Form der Aufruf-Stellen (Fenster oder undefined zuerst)', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);

    h.showOpenDialog(undefined, { properties: ['openDirectory'] });

    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].args).toEqual([
      undefined,
      { defaultPath: START, properties: ['openDirectory', 'dontAddToRecent'] },
    ]);
  });

  it('erhält vorhandene Eigenschaften, übrige Optionen und das Objekt des Aufrufers', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);
    const fenster = new GestelltesFenster();
    const filters = [{ name: 'Markdown', extensions: ['md'] }];
    const ablage = path.resolve('/Ablage');
    const optionen = {
      title: 'Titel',
      defaultPath: ablage,
      filters,
      properties: ['openFile', 'multiSelections'],
    };

    h.showOpenDialog(fenster, optionen);

    const [erstes, weiter] = aufrufe[0].args;
    expect(erstes).toBe(fenster);
    expect(weiter).toEqual({
      title: 'Titel',
      defaultPath: ablage,
      filters,
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
    });
    expect(weiter.filters).toBe(filters);
    // Das Objekt des Aufrufers bleibt unverändert; weitergereicht wird eine Kopie.
    expect(optionen.properties).toEqual(['openFile', 'multiSelections']);
    expect(weiter).not.toBe(optionen);
  });

  it('doppelt die Eigenschaft nicht, wenn der Aufrufer sie schon setzt', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);
    const optionen = { properties: ['createDirectory', 'dontAddToRecent'] };

    h.showSaveDialog(undefined, optionen);

    expect(aufrufe[0].args[1].properties).toEqual(['createDirectory', 'dontAddToRecent']);
  });

  it('reicht die Form ohne Fenster mit genau einem Argument weiter', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);
    const ziel = path.resolve('/Ablage/neu.md');

    h.showSaveDialog({ defaultPath: ziel, properties: ['showOverwriteConfirmation'] });

    expect(aufrufe[0].args).toEqual([
      { defaultPath: ziel, properties: ['showOverwriteConfirmation', 'dontAddToRecent'] },
    ]);
  });

  it('behandelt null als erstes Argument wie Electron als fehlendes Fenster', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);

    h.showOpenDialogSync(null, { properties: ['openFile'] });

    expect(aufrufe[0].args).toEqual([
      null,
      { defaultPath: START, properties: ['openFile', 'dontAddToRecent'] },
    ]);
  });

  it('setzt ohne Feld properties die Voreinstellung von Electron und ergänzt die Eigenschaft', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);

    h.showOpenDialog(undefined, { title: 'Öffnen' });
    h.showSaveDialog({ title: 'Speichern' });

    expect(aufrufe[0].args[1]).toEqual({
      title: 'Öffnen',
      defaultPath: START,
      properties: ['openFile', 'dontAddToRecent'],
    });
    expect(aufrufe[1].args[0]).toEqual({
      title: 'Speichern',
      defaultPath: START,
      properties: ['dontAddToRecent'],
    });
  });

  it('setzt bei ganz fehlenden Optionen die Ersatz-Optionen von Electron', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);
    const fenster = new GestelltesFenster();

    h.showOpenDialog(fenster);
    h.showOpenDialogSync();
    h.showSaveDialog(fenster);
    h.showSaveDialogSync();

    const oeffnen = {
      title: 'Open',
      defaultPath: START,
      properties: ['openFile', 'dontAddToRecent'],
    };
    const speichern = { title: 'Save', defaultPath: START, properties: ['dontAddToRecent'] };
    expect(aufrufe.map((a) => a.args)).toEqual([
      [fenster, oeffnen],
      [undefined, oeffnen],
      [fenster, speichern],
      [undefined, speichern],
    ]);
  });

  it('reicht Optionen, die Electron zurückweist, unverändert durch', () => {
    // Der Aufrufer soll denselben Fehler sehen wie ohne Hülle.
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);
    const kaputt = { properties: 'openFile' };

    h.showOpenDialog(undefined, kaputt);

    expect(aufrufe[0].args[1]).toBe(kaputt);
  });

  it('gibt Rückgaben unverändert zurück, synchron wie asynchron', async () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = huelle(dialog);

    expect(h.showOpenDialogSync(undefined, {})).toEqual({
      art: 'sync',
      name: 'showOpenDialogSync',
    });
    expect(h.showSaveDialogSync({})).toEqual({ art: 'sync', name: 'showSaveDialogSync' });
    const zusage = h.showOpenDialog(undefined, {});
    expect(zusage).toBeInstanceOf(Promise);
    await expect(zusage).resolves.toEqual({ art: 'async', name: 'showOpenDialog' });
    await expect(h.showSaveDialog({})).resolves.toEqual({ art: 'async', name: 'showSaveDialog' });
    // Jede Hülle ruft ihr eigenes Original, am Dialog-Objekt als `this`.
    expect(aufrufe.map((a) => a.name)).toEqual([
      'showOpenDialogSync',
      'showSaveDialogSync',
      'showOpenDialog',
      'showSaveDialog',
    ]);
    expect(aufrufe.every((a) => a.dies === dialog)).toBe(true);
  });

  it('verändert das Dialog-Objekt nicht und liefert genau vier eingefrorene Hüllen', () => {
    const { dialog } = gestellterDialog();
    const vorher = { ...dialog };

    const h = huelle(dialog);

    expect(dialog).toEqual(vorher);
    for (const name of NAMEN) expect(dialog[name]).toBe(vorher[name]);
    expect(Object.keys(h).sort()).toEqual([...NAMEN].sort());
    expect(Object.isFrozen(h)).toBe(true);
  });

  it('bricht laut ab, wenn Dialog-Objekt, Funktion, Fenster-Erkennung oder Start-Ordner fehlen', () => {
    const { dialog } = gestellterDialog();
    const ort = { startOrdner: START };
    expect(() => umhuelleDateiDialoge(undefined, istFenster, ort)).toThrow(TypeError);
    expect(() => umhuelleDateiDialoge(dialog, undefined, ort)).toThrow(TypeError);
    const unvollstaendig = { ...dialog, showSaveDialogSync: undefined };
    expect(() => umhuelleDateiDialoge(unvollstaendig, istFenster, ort)).toThrow(
      /showSaveDialogSync/,
    );
    expect(() => umhuelleDateiDialoge(dialog, istFenster)).toThrow(/startOrdner/);
    expect(() => umhuelleDateiDialoge(dialog, istFenster, { startOrdner: 'relativ' })).toThrow(
      /startOrdner/,
    );
  });
});

// 4T-001991 (Epic 3E-000188): Ordner, in dem ein Datei-Dialog öffnet. Das
// Programm merkt sich den zuletzt besuchten Ordner nur im Arbeitsspeicher der
// Hülle und öffnet nie in dem Ordner, den Windows sich gemerkt hat. Gestellt
// wird ein Dialog-Objekt, dessen Antwort der Fall festlegt; die Ordner sind
// echte Temp-Ordner, weil die Hülle ihr Vorhandensein prüft.
describe('portabler Betrieb: Datei-Dialoge öffnen im gemerkten Ordner, nie im von Windows gemerkten', () => {
  const START = path.resolve('/Start-Ordner-der-Huelle');
  const istFenster = () => false;

  // Dialog-Objekt, dessen nächste Antwort je Funktion gesetzt wird.
  function gestellterDialog() {
    const aufrufe = [];
    const antworten = {};
    const dialog = {};
    for (const name of [
      'showOpenDialog',
      'showOpenDialogSync',
      'showSaveDialog',
      'showSaveDialogSync',
    ]) {
      dialog[name] = (...args) => {
        aufrufe.push({ name, optionen: args[args.length - 1] });
        const wert = antworten[name];
        return name.endsWith('Sync') ? wert : Promise.resolve(wert);
      };
    }
    return { dialog, aufrufe, antworten };
  }

  const vorgabe = (aufrufe) => aufrufe[aufrufe.length - 1].optionen.defaultPath;

  it('öffnet ohne Vorgabe-Pfad und ohne gemerkten Ordner im Start-Ordner', async () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });
    h.showSaveDialogSync(undefined, {});

    expect(aufrufe.map((a) => a.optionen.defaultPath)).toEqual([START, START]);
  });

  it('merkt nach bestätigter Datei-Wahl den Ordner der Datei und öffnet dort', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    antworten.showOpenDialog = { canceled: false, filePaths: [path.join(ordner, 'a.md')] };
    await h.showOpenDialog(undefined, { properties: ['openFile'] });
    h.showOpenDialogSync(undefined, { properties: ['openFile'] });

    expect(vorgabe(aufrufe)).toBe(ordner);
  });

  it('merkt bei Mehrfach-Wahl den Ordner der ersten Datei, auch synchron', () => {
    const erster = mkTemp();
    const zweiter = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    antworten.showOpenDialogSync = [path.join(erster, 'a.md'), path.join(zweiter, 'b.md')];
    h.showOpenDialogSync(undefined, { properties: ['openFile', 'multiSelections'] });
    h.showSaveDialogSync(undefined, {});

    expect(vorgabe(aufrufe)).toBe(erster);
  });

  it('merkt bei der Ordner-Wahl den gewählten Ordner selbst', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });
    await h.showOpenDialog(undefined, { properties: ['openFile'] });

    expect(vorgabe(aufrufe)).toBe(ordner);
  });

  it('merkt beim Speichern den Ordner des Ziels, asynchron wie synchron', async () => {
    const erster = mkTemp();
    const zweiter = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    antworten.showSaveDialog = { canceled: false, filePath: path.join(erster, 'neu.md') };
    await h.showSaveDialog(undefined, {});
    h.showOpenDialogSync(undefined, {});
    expect(vorgabe(aufrufe)).toBe(erster);

    antworten.showSaveDialogSync = path.join(zweiter, 'neu.pdf');
    h.showSaveDialogSync({});
    h.showOpenDialogSync(undefined, {});
    expect(vorgabe(aufrufe)).toBe(zweiter);
  });

  it('lässt den gemerkten Ordner nach Abbruch unverändert, in allen vier Formen', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });
    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });

    antworten.showOpenDialog = { canceled: true, filePaths: [] };
    antworten.showOpenDialogSync = undefined;
    antworten.showSaveDialog = { canceled: true, filePath: '' };
    antworten.showSaveDialogSync = '';
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });
    h.showOpenDialogSync(undefined, {});
    await h.showSaveDialog(undefined, {});
    h.showSaveDialogSync(undefined, {});
    h.showOpenDialogSync(undefined, {});

    expect(aufrufe.slice(1).map((a) => a.optionen.defaultPath)).toEqual(Array(5).fill(ordner));
  });

  it('öffnet im Start-Ordner, wenn der gemerkte Ordner nicht mehr vorhanden ist', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });
    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });

    fs.rmSync(ordner, { recursive: true, force: true });
    h.showOpenDialogSync(undefined, {});

    expect(vorgabe(aufrufe)).toBe(START);
  });

  it('fragt den übergebenen Datei-Zugriff, ob der gemerkte Ordner noch da ist', () => {
    const gemerkt = path.resolve('/Gemerkt');
    const gefragt = [];
    const dateisystem = {
      statSync(p) {
        gefragt.push(p);
        return { isDirectory: () => true };
      },
    };
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START, dateisystem });

    antworten.showOpenDialogSync = [gemerkt];
    h.showOpenDialogSync(undefined, { properties: ['openDirectory'] });
    h.showOpenDialogSync(undefined, {});

    expect(vorgabe(aufrufe)).toBe(gemerkt);
    expect(gefragt).toEqual([gemerkt]);
  });

  it('lässt einen absoluten Vorgabe-Pfad unverändert, auch mit gemerktem Ordner', async () => {
    const ordner = mkTemp();
    const ziel = path.resolve('/Ablage/Bericht.pdf');
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    h.showSaveDialogSync(undefined, { defaultPath: ziel });
    expect(vorgabe(aufrufe)).toBe(ziel);

    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });
    h.showOpenDialogSync(undefined, { defaultPath: path.resolve('/Bereich') });
    expect(vorgabe(aufrufe)).toBe(path.resolve('/Bereich'));
  });

  it('verbindet einen bloßen Dateinamen mit dem Start- oder dem gemerkten Ordner', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    h.showSaveDialogSync(undefined, { defaultPath: 'Unbenannt.md' });
    expect(vorgabe(aufrufe)).toBe(path.join(START, 'Unbenannt.md'));

    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h.showOpenDialog(undefined, { properties: ['openDirectory'] });
    await h.showSaveDialog({ defaultPath: 'Unbenannt.md' });
    expect(vorgabe(aufrufe)).toBe(path.join(ordner, 'Unbenannt.md'));
  });

  it('behandelt einen leeren oder ausdrücklich fehlenden Vorgabe-Pfad wie keinen', () => {
    const { dialog, aufrufe } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });

    h.showOpenDialogSync(undefined, { defaultPath: undefined });
    h.showOpenDialogSync(undefined, { defaultPath: '' });

    expect(aufrufe.map((a) => a.optionen.defaultPath)).toEqual([START, START]);
  });

  it('setzt dontAddToRecent in jedem Fall und verändert die Optionen des Aufrufers nie', async () => {
    const ordner = mkTemp();
    const { dialog, aufrufe, antworten } = gestellterDialog();
    const h = umhuelleDateiDialoge(dialog, istFenster, { startOrdner: START });
    const faelle = [
      { properties: ['openDirectory'] },
      { defaultPath: path.resolve('/Ablage'), properties: ['openFile', 'dontAddToRecent'] },
      { defaultPath: 'Unbenannt.md' },
      { defaultPath: '' },
      {},
    ];
    const vorher = structuredClone(faelle);

    antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    for (const optionen of faelle) await h.showOpenDialog(undefined, optionen);
    for (const optionen of faelle) h.showSaveDialogSync(optionen);
    h.showOpenDialogSync();

    expect(faelle).toEqual(vorher);
    for (const { optionen } of aufrufe) {
      expect(optionen.properties).toContain('dontAddToRecent');
      expect(optionen.properties.filter((p) => p === 'dontAddToRecent')).toHaveLength(1);
      expect(path.isAbsolute(optionen.defaultPath)).toBe(true);
    }
    expect(aufrufe).toHaveLength(2 * faelle.length + 1);
  });

  it('merkt je Hülle einen eigenen Ordner, nirgends sonst', async () => {
    // Zwei Hüllen teilen nichts: Der gemerkte Ordner lebt allein im
    // Arbeitsspeicher der Hülle, die main.js einmal je Programmlauf einrichtet.
    const ordner = mkTemp();
    const eins = gestellterDialog();
    const zwei = gestellterDialog();
    const h1 = umhuelleDateiDialoge(eins.dialog, istFenster, { startOrdner: START });
    const h2 = umhuelleDateiDialoge(zwei.dialog, istFenster, { startOrdner: START });

    eins.antworten.showOpenDialog = { canceled: false, filePaths: [ordner] };
    await h1.showOpenDialog(undefined, { properties: ['openDirectory'] });
    h2.showOpenDialogSync(undefined, {});

    expect(vorgabe(zwei.aufrufe)).toBe(START);
  });
});

describe('portabler Betrieb: Start-Ordner der Datei-Dialoge', () => {
  const RUECKFALL = path.resolve(os.tmpdir(), 'em4me-programm-ordner');

  it('nimmt den Ordner «Dokumente», wenn das Betriebssystem ihn liefert', () => {
    const dokumente = path.resolve(os.tmpdir(), 'em4me-dokumente');
    expect(startOrdnerDerDialoge(() => dokumente, RUECKFALL)).toBe(dokumente);
  });

  it('fällt auf den Ordner des Programms zurück, wenn die Auskunft wirft', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ergebnis = startOrdnerDerDialoge(() => {
      throw new Error("Failed to get 'documents' path");
    }, RUECKFALL);
    expect(ergebnis).toBe(RUECKFALL);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('fällt zurück, wenn die Auskunft keinen absoluten Pfad liefert', () => {
    expect(startOrdnerDerDialoge(() => '', RUECKFALL)).toBe(RUECKFALL);
    expect(startOrdnerDerDialoge(() => 'Dokumente', RUECKFALL)).toBe(RUECKFALL);
    expect(startOrdnerDerDialoge(() => undefined, RUECKFALL)).toBe(RUECKFALL);
  });
});
