// 4T-001991 (Epic 3E-000188): Wächter gegen die Rückkehr zweier Ursachen von
// Spuren außerhalb des Daten-Ordners, gemessen am gebauten Programm am
// 2026-09-28.
//
// 1. Eine PowerShell, gleich wofür gestartet, schreibt bei jedem Aufruf
//    Prüf-Skripte in den Temp-Ordner und Profil-Daten unter %LOCALAPPDATA%.
//    Der Haupt-Prozess startet deshalb keine; die Abfrage der Netzlaufwerke
//    fragt Windows direkt (src/main/documents/network-paths.js).
// 2. Das Programm-Symbol wird aus der unverpackten Ablage gereicht; aus dem
//    Programm-Archiv heraus kopiert Electron es bei jedem Start in den
//    Temp-Ordner. Die Pfad-Bildung prüft test/unit/portabler-betrieb.test.js;
//    hier steht, dass die Bau-Konfiguration beide Symbol-Dateien auch
//    tatsächlich unverpackt ablegt — ohne den Eintrag zeigte der Pfad ins Leere.
// 3. Jeder bestätigte Datei-Dialog trug Datei und Ordner in die Listen zuletzt
//    benutzter Dateien von Windows ein. Im portablen Betrieb ersetzt main.js
//    die vier Datei-Dialoge am dialog-Objekt durch Hüllen mit der Eigenschaft
//    `dontAddToRecent`. Das erreicht eine Aufruf-Stelle nur, wenn sie die
//    Funktion erst beim Aufruf vom Objekt liest; eine beim Laden entnommene
//    Funktion bliebe das Original (Sonde am echten Electron 33 vom
//    2026-09-28). Hier steht, dass keine Stelle unter src/main sie so entnimmt
//    und dass main.js die Hüllen im portablen Block einsetzt, mit dem Ordner
//    «Dokumente» als Start-Ordner der Dialoge (die Hülle öffnet sie nie in dem
//    Ordner, den Windows sich gemerkt hat). Die Hülle selbst prüft
//    test/unit/portabler-betrieb.test.js.
//
// Bestands-Lesungen im Modulkopf (test/README.md, «Bestands-Lesungen gehören
// in den Modulkopf»).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
const MAIN = path.join(WURZEL, 'src', 'main');

function sammle(ordner) {
  const dateien = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) dateien.push(...sammle(voll));
    else if (/\.(c|m)?js$/.test(eintrag.name)) dateien.push(voll);
  }
  return dateien;
}

const MAIN_DATEIEN = sammle(MAIN).map((voll) => ({
  rel: path.relative(WURZEL, voll).split(path.sep).join('/'),
  text: fs.readFileSync(voll, 'utf8'),
}));
const PAKET = JSON.parse(fs.readFileSync(path.join(WURZEL, 'package.json'), 'utf8'));

// Zeichenketten-Literale mit dem Namen einer PowerShell (Windows PowerShell
// und PowerShell 7). Kommentare nennen sie erlaubterweise, deshalb zählen
// allein Literale — dort stünde der Programmname eines Starts.
const POWERSHELL_LITERAL = /(['"`])[^'"`\n]*\b(powershell|pwsh)(\.exe)?\b[^'"`\n]*\1/i;

describe('Wächter: keine Spuren durch gestartete Fremd-Programme (4T-001991)', () => {
  it('liest den Haupt-Prozess vollständig', () => {
    // Gegenprobe gegen einen leeren Durchlauf: Ein falscher Pfad liefe sonst
    // grün, ohne etwas zu prüfen.
    expect(MAIN_DATEIEN.length).toBeGreaterThan(100);
    expect(MAIN_DATEIEN.some((d) => d.rel === 'src/main/documents/network-paths.js')).toBe(true);
  });

  it('startet unter src/main nirgends eine PowerShell', () => {
    const treffer = [];
    for (const { rel, text } of MAIN_DATEIEN) {
      text.split('\n').forEach((zeile, i) => {
        if (/^\s*(\/\/|\*)/.test(zeile)) return;
        if (POWERSHELL_LITERAL.test(zeile)) treffer.push(`${rel}:${i + 1}: ${zeile.trim()}`);
      });
    }
    expect(treffer).toEqual([]);
  });

  it('erkennt ein PowerShell-Literal (Gegenprobe des Musters)', () => {
    expect(POWERSHELL_LITERAL.test("execFile('powershell', ['-NoProfile'])")).toBe(true);
    expect(POWERSHELL_LITERAL.test('spawn("pwsh.exe")')).toBe(true);
    expect(POWERSHELL_LITERAL.test('// fragt Windows direkt statt ueber PowerShell')).toBe(false);
  });

  it('startet für die Netzlaufwerks-Abfrage keinen Prozess', () => {
    const modul = MAIN_DATEIEN.find((d) => d.rel === 'src/main/documents/network-paths.js');
    expect(modul.text).not.toMatch(/require\(\s*['"](node:)?child_process['"]\s*\)/);
  });
});

// Die vier Datei-Dialoge von Electron. Zulässig ist ein Name allein als
// Methoden-Aufruf `<Objekt>.<Name>(`: Dann liest der Aufruf die Funktion zur
// Laufzeit vom Objekt und trifft die Hülle. Jede andere Nennung im Code —
// Entnahme per Zerlegung, Zuweisung, `.bind`, Zugriff über eine Zeichenkette —
// hielte das Original fest und ist ein Befund.
const DATEI_DIALOG_NAME =
  /\b(showOpenDialog|showOpenDialogSync|showSaveDialog|showSaveDialogSync)\b/g;
const DATEI_DIALOG_AUFRUF =
  /\.\s*(showOpenDialog|showOpenDialogSync|showSaveDialog|showSaveDialogSync)\s*\(/g;
// Eine Kopie des ganzen Objekts nimmt die Funktionen beim Kopieren mit.
const DIALOG_KOPIE = /(\.\.\.\s*dialog\b|Object\.assign\(\s*\{\s*\}\s*,\s*dialog\b)/;

// Liefert je Code-Zeile die Nennungen der Datei-Dialoge, die kein
// Methoden-Aufruf sind, und die Anzahl der Methoden-Aufrufe. Reine
// Kommentar-Zeilen und angehängte Kommentare zählen nicht mit.
function pruefeDialogNennungen(rel, text) {
  const befunde = [];
  let aufrufe = 0;
  text.split('\n').forEach((roh, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(roh)) return;
    const zeile = roh.replace(/\s\/\/.*$/, '');
    const namen = (zeile.match(DATEI_DIALOG_NAME) || []).length;
    const methodenAufrufe = (zeile.match(DATEI_DIALOG_AUFRUF) || []).length;
    aufrufe += methodenAufrufe;
    if (namen > methodenAufrufe || DIALOG_KOPIE.test(zeile)) {
      befunde.push(`${rel}:${i + 1}: ${roh.trim()}`);
    }
  });
  return { befunde, aufrufe };
}

// Die Heimat der Hülle nennt die vier Namen als Tabelle; sie wird abgeleitet,
// nicht als Pfad gepflegt.
const HUELLEN_HEIMAT = MAIN_DATEIEN.filter((d) => /function umhuelleDateiDialoge\(/.test(d.text));

describe('Wächter: Datei-Dialoge erreichen die Hülle (4T-001991)', () => {
  it('findet genau eine Heimat der Hülle', () => {
    expect(HUELLEN_HEIMAT.map((d) => d.rel)).toEqual(['src/main/app/portabler-betrieb.js']);
  });

  it('entnimmt unter src/main keine Dialog-Funktion an der Hülle vorbei', () => {
    const befunde = [];
    let aufrufe = 0;
    const dateien = new Set();
    for (const datei of MAIN_DATEIEN) {
      if (HUELLEN_HEIMAT.includes(datei)) continue;
      const ergebnis = pruefeDialogNennungen(datei.rel, datei.text);
      befunde.push(...ergebnis.befunde);
      aufrufe += ergebnis.aufrufe;
      if (ergebnis.aufrufe > 0) dateien.add(datei.rel);
    }
    expect(befunde).toEqual([]);
    // Untere Schranke gegen einen still leeren Durchlauf: Am 2026-09-28 rufen
    // zwölf Module die Datei-Dialoge an neunzehn Stellen.
    expect(aufrufe).toBeGreaterThanOrEqual(15);
    expect(dateien.size).toBeGreaterThanOrEqual(10);
  });

  it('erkennt eine Entnahme an der Hülle vorbei (Gegenprobe des Musters)', () => {
    const befundeIn = (code) => pruefeDialogNennungen('probe.js', code).befunde;
    expect(befundeIn('const r = await dialog.showOpenDialog(owner || undefined, {});')).toEqual([]);
    expect(befundeIn('const r = dialog.showSaveDialogSync({}); // showOpenDialog')).toEqual([]);
    expect(befundeIn('// dialog.showOpenDialog wird hier nicht gerufen')).toEqual([]);
    expect(befundeIn("const { showOpenDialog } = require('electron').dialog;")).toHaveLength(1);
    expect(befundeIn('const oeffne = dialog.showOpenDialog;')).toHaveLength(1);
    expect(befundeIn('const oeffne = dialog.showSaveDialog.bind(dialog);')).toHaveLength(1);
    expect(befundeIn("dialog['showOpenDialogSync'](win, {});")).toHaveLength(1);
    expect(befundeIn('const kopie = { ...dialog };')).toHaveLength(1);
    expect(befundeIn('const kopie = Object.assign({}, dialog);')).toHaveLength(1);
  });

  it('setzt die Hüllen in main.js im portablen, beschreibbaren Block ein', () => {
    const main = MAIN_DATEIEN.find((d) => d.rel === 'src/main/main.js').text;
    const block = main.match(
      /\nif \(portablerBetrieb\.portabel && portablerBetrieb\.beschreibbar\) \{\n([\s\S]*?)\n\}\n/,
    );
    expect(block).not.toBeNull();
    // Leerraum frei, weil Prettier den Aufruf je nach Länge umbricht.
    expect(block[1]).toMatch(
      /Object\.assign\(\s*dialog,\s*umhuelleDateiDialoge\(dialog, \(x\) => x instanceof BaseWindow, \{\s*startOrdner: startOrdnerDerDialoge\(\s*\(\) => app\.getPath\('documents'\),\s*path\.dirname\(process\.execPath\),?\s*\),?\s*\}\),?\s*\);/,
    );
    // Außerhalb dieses Blocks wird nichts ersetzt: installierte Fassung, Start
    // aus den Quellen und Testlauf bleiben beim Original.
    expect(main.split('umhuelleDateiDialoge(dialog').length - 1).toBe(1);
  });
});

describe('Wächter: Programm-Symbol unverpackt (4T-001991)', () => {
  it('legt beide Symbol-Dateien außerhalb des Programm-Archivs ab', () => {
    expect(PAKET.build.asarUnpack).toEqual(
      expect.arrayContaining(['src/assets/icon.ico', 'src/assets/icon.png']),
    );
  });

  it('reicht das Fenster-Symbol über die Pfad-Bildung außerhalb des Archivs', () => {
    const fenster = MAIN_DATEIEN.find((d) => d.rel === 'src/main/window-manager.js');
    expect(fenster.text).toMatch(/icon:\s*iconPfad\b/);
    expect(fenster.text).toMatch(/const iconPfad = programmSymbolPfad\(/);
  });
});
