// 4T-001524 (Epic 3E-000169): Prüffälle der Ersetzen-Strecke im Hauptprozess.
//
// Geprüft wird an der realen Konstellation und nicht am bequemeren Einzelfall
// (Auflage der Aufgaben-Klasse K3): mehrere Dateien in einem echten
// Bereichs-Ordner, die Fundstellen aus einem echten Suchlauf statt aus der
// Hand, die echte Dokument-Historie statt eines Doppels, abgeschaltete
// Historisierung als Normalfall und ein teilweise fehlschlagendes Schreiben.
//
// Der Grund für diesen Aufwand ist die Zusicherung selbst: Hier schreibt die
// Anwendung viele fremde Dateien auf einmal. Ein Prüffall, der die Sicherung
// nur behauptet, statt sie in der .mdd nachzuschlagen, wäre wertlos.
//
// Setup-Muster wie area-search.test.js (Temp-Verzeichnis je Fall, Aufräumen im
// afterEach). Alle Module kommen über createRequire aus EINEM Modul-Graphen:
// Vitest führt für 'import' und 'require' getrennte Instanzen, und der Vorrat
// der Suche ist Modul-Zustand — über zwei Instanzen fände die Ersetzen-Strecke
// ihren Bezugs-Stand nie.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { sucheImBereich, gibBereichsVorratFrei } = require('../../src/main/area/area-search.js');
const { createAreaReplace } = require('../../src/main/area/area-replace.js');
const { createMddHistory } = require('../../src/main/documents/mdd-history.js');
const mddStore = require('../../src/main/documents/mdd-store.js');
const { writePartLine } = require('../../src/shared/document-parts.js');
const { setBufferOverlay, clearAllBufferOverlays } = require('../../src/main/backlinks.js');

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-ersetzen-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function lies(p) {
  return fs.readFileSync(p, 'utf8');
}

function mddPfad(p) {
  return p.replace(/\.md$/, '.mdd');
}

// Die echte Historie, ohne Electron: die Fenster kommen als Argumente herein
// (siehe Kopf von mdd-history.js), und der Einstellungs-Speicher ist ein
// schlichter Getter. `historieAn` schaltet die App-Ebene der Drei-Ebenen-
// Auflösung; ab Werk ist sie AUS, und genau das ist der interessante Fall.
function historieFuer(root, historieAn) {
  const store = {
    get: (schluessel, vorgabe) => (schluessel === 'historyEnabled' ? historieAn : vorgabe),
  };
  return createMddHistory({
    getStore: () => store,
    areaOfWindow: () => ({ rootPath: root }),
    readAreaHistoryDefault: async () => undefined,
  });
}

function streckeFuer(root, optionen = {}) {
  const historie = historieFuer(root, !!optionen.historieAn);
  const { ersetzeImBereich } = createAreaReplace({
    resolveHistoryFor: historie.resolveHistoryFor,
    recordMddOnSave: optionen.recordMddOnSave || historie.recordMddOnSave,
  });
  return ersetzeImBereich;
}

// Ein echter Suchlauf, dessen Treffer nach Datei gebündelt werden — genau die
// Form, die der Renderer schickt. Die Offsets stammen damit aus derselben
// Quelle wie im Betrieb und nicht aus einer Nachrechnung im Prüffall.
async function auswahl(root, muster = 'Notiz', flags = 'gm') {
  const ergebnis = await sucheImBereich(root, { muster, flags, generation: 1 });
  const nachPfad = new Map();
  for (const treffer of ergebnis.treffer) {
    const pfad = treffer.sprung.kennung;
    if (!nachPfad.has(pfad)) nachPfad.set(pfad, { pfad, offsets: [] });
    nachPfad.get(pfad).offsets.push(treffer.sprung.offset);
  }
  return nachPfad;
}

function auftrag(zusatz = {}) {
  return { muster: 'Notiz', flags: 'gm', ersetzung: 'Merk', ...zusatz };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAllBufferOverlays();
  gibBereichsVorratFrei();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Aufraeumen ist bestes Bemuehen */
    }
  }
  tmpDirs = [];
});

describe('Bereichsweites Ersetzen: Auftrag und Wirkung', () => {
  it('ersetzt ausschliesslich an den uebergebenen Fundstellen', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\nzweite Notiz\ndritte Notiz hier\n');
    const gefunden = (await auswahl(root)).get(ziel);
    expect(gefunden.offsets).toHaveLength(3);

    const ersetzeImBereich = streckeFuer(root);
    // Bewusst nur der erste und der dritte Fund: Der mittlere belegt, dass die
    // Auswahl wirkt und nicht doch alle Treffer ersetzt werden.
    const ergebnis = await ersetzeImBereich(
      root,
      auftrag({ dateien: [{ pfad: ziel, offsets: [gefunden.offsets[0], gefunden.offsets[2]] }] }),
    );

    expect(ergebnis.geaendert).toEqual([{ pfad: ziel, anzahl: 2 }]);
    expect(ergebnis.fehlgeschlagen).toEqual([]);
    expect(ergebnis.veraendert).toEqual([]);
    expect(lies(ziel)).toBe('Merk eins\nzweite Notiz\ndritte Merk hier\n');
  });

  it('ersetzt ueber mehrere Dateien hinweg', async () => {
    const root = makeRoot();
    const alpha = write(root, 'alpha.md', 'Notiz eins\n');
    const beta = write(root, 'unter/beta.md', 'zweite Notiz\nund noch eine Notiz\n');
    const gefunden = await auswahl(root);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.geaendert).toEqual(
      expect.arrayContaining([
        { pfad: alpha, anzahl: 1 },
        { pfad: beta, anzahl: 2 },
      ]),
    );
    expect(lies(alpha)).toBe('Merk eins\n');
    expect(lies(beta)).toBe('zweite Merk\nund noch eine Merk\n');
  });

  it('wertet Rueckverweise im Regex-Modus aus wie die Dokument-Suche', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'A-Notiz und B-Notiz\n');
    const gefunden = await auswahl(root, '(\\w+)-Notiz');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, {
      muster: '(\\w+)-Notiz',
      flags: 'gm',
      ersetzung: 'Notiz-$1',
      regexModus: true,
      dateien: [...gefunden.values()],
    });

    expect(ergebnis.geaendert).toEqual([{ pfad: ziel, anzahl: 2 }]);
    expect(lies(ziel)).toBe('Notiz-A und Notiz-B\n');
  });

  it('nimmt den Ersetzungs-Text ohne Regex-Modus woertlich', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'A-Notiz\n');
    const gefunden = await auswahl(root, '(\\w+)-Notiz');

    const ersetzeImBereich = streckeFuer(root);
    await ersetzeImBereich(root, {
      muster: '(\\w+)-Notiz',
      flags: 'gm',
      ersetzung: 'Notiz-$1',
      regexModus: false,
      dateien: [...gefunden.values()],
    });

    expect(lies(ziel)).toBe('Notiz-$1\n');
  });
});

describe('Bereichsweites Ersetzen: die Bereichs-Grenze', () => {
  it('weist ein Ziel ausserhalb der Wurzel ab, statt es zu ueberspringen', async () => {
    const root = makeRoot();
    write(root, 'alpha.md', 'Notiz eins\n');
    await auswahl(root);
    // Die fremde Datei liegt in einem eigenen Temp-Ordner, nicht im Bereich.
    const fremd = makeRoot();
    const fremdDatei = write(fremd, 'fremd.md', 'Notiz auswaerts\n');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(
      root,
      auftrag({ dateien: [{ pfad: fremdDatei, offsets: [0] }] }),
    );

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: fremdDatei, grund: 'ausserhalb' }]);
    expect(ergebnis.geaendert).toEqual([]);
    expect(lies(fremdDatei)).toBe('Notiz auswaerts\n');
  });

  it('laesst sich von einem Praefix-Nachbarn nicht taeuschen', async () => {
    const root = makeRoot();
    write(root, 'alpha.md', 'Notiz eins\n');
    await auswahl(root);
    // Gleicher Anfang, anderer Ordner — der klassische Ausrutscher einer
    // Grenz-Pruefung ueber startsWith ohne Trenner.
    const nachbar = `${root}2`;
    fs.mkdirSync(nachbar, { recursive: true });
    tmpDirs.push(nachbar);
    const nachbarDatei = path.join(nachbar, 'alpha.md');
    fs.writeFileSync(nachbarDatei, 'Notiz nebenan\n', 'utf8');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(
      root,
      auftrag({ dateien: [{ pfad: nachbarDatei, offsets: [0] }] }),
    );

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: nachbarDatei, grund: 'ausserhalb' }]);
    expect(lies(nachbarDatei)).toBe('Notiz nebenan\n');
  });
});

describe('Bereichsweites Ersetzen: die Zwangs-Sicherung (E3)', () => {
  it('legt den Vor-Stand in die Historie, auch bei ABGESCHALTETER Historisierung', async () => {
    const root = makeRoot();
    const vorher = 'Notiz eins\nzweite Notiz\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);
    expect(fs.existsSync(mddPfad(ziel))).toBe(false);

    // historieAn: false — der Werks-Zustand der Anwendung.
    const ersetzeImBereich = streckeFuer(root, { historieAn: false });
    await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    const behaelter = mddStore.parseContainer(lies(mddPfad(ziel)));
    expect(behaelter.ok).toBe(true);
    // Der Anker traegt den Stand VOR dem Ersetzen — daraus ist die Fassung
    // wiederherstellbar, und nur deshalb ist der Vorgang umkehrbar.
    expect(behaelter.container.history.anchors[0].text).toBe(vorher);
    expect(lies(ziel)).toBe('Merk eins\nzweite Merk\n');
  });

  it('schreibt die Datei NICHT, wenn die Sicherung fehlschlaegt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = makeRoot();
    const vorher = 'Notiz eins\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);
    // Eine defekte Begleitdatei ist der reale Anlass: Die Historie setzt die
    // Protokollierung fuer dieses Dokument aus, statt sie zu ueberschreiben —
    // und damit gibt es keinen Ort, an dem der Vor-Stand landen koennte.
    fs.writeFileSync(mddPfad(ziel), 'kein Container, sondern Buchstabensalat', 'utf8');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.geaendert).toEqual([]);
    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'sicherung', detail: 'defekt' }]);
    expect(lies(ziel)).toBe(vorher);
  });

  it('haelt bei abgewiesener Sicherung auch dann an, wenn die Historie nur schweigt', async () => {
    const root = makeRoot();
    const vorher = 'Notiz eins\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);

    // Eine Historie, die ohne Fehler nichts tut: Genau diesen Fall kann die
    // Strecke ohne Rueckmeldung nicht von Erfolg unterscheiden, und genau
    // dafuer sagt recordMddOnSave seit 4T-001524, ob es etwas getan hat.
    const ersetzeImBereich = streckeFuer(root, {
      recordMddOnSave: async () => ({ ok: false, grund: 'ausgesetzt' }),
    });
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.fehlgeschlagen).toEqual([
      { pfad: ziel, grund: 'sicherung', detail: 'ausgesetzt' },
    ]);
    expect(lies(ziel)).toBe(vorher);
  });

  it('protokolliert bei EINGESCHALTETER Historisierung zusaetzlich den Schritt', async () => {
    const root = makeRoot();
    const vorher = 'Notiz eins\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);

    const ersetzeImBereich = streckeFuer(root, { historieAn: true });
    await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    const behaelter = mddStore.parseContainer(lies(mddPfad(ziel)));
    expect(behaelter.ok).toBe(true);
    expect(behaelter.container.history.anchors[0].text).toBe(vorher);
    // Ein Paket, nicht zwei: Die Sicherung vor dem Schreiben und der regulaere
    // Eintrag danach ergeben zusammen denselben Verlauf wie ein Speichern.
    expect(behaelter.container.history.packets).toHaveLength(1);
  });
});

describe('Bereichsweites Ersetzen: veraenderte und unerreichbare Dateien', () => {
  it('schreibt eine seit der Vorschau geaenderte Datei nicht, sondern meldet sie', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\n');
    const gefunden = await auswahl(root);
    // Fremd-Aenderung zwischen Vorschau und Ausfuehrung.
    const dazwischen = 'Ganz andere Zeile, Notiz weiter hinten\n';
    fs.writeFileSync(ziel, dazwischen, 'utf8');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.veraendert).toEqual([ziel]);
    expect(ergebnis.geaendert).toEqual([]);
    expect(lies(ziel)).toBe(dazwischen);
  });

  it('meldet eine offene Datei mit ungespeicherten Aenderungen eigens', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\n');
    // Der Editor meldet den Puffer-Stand jedes geaenderten Reiters; die Suche
    // findet darin und nicht auf der Platte.
    setBufferOverlay(ziel, 'Notiz eins\nnoch nicht gespeicherte Notiz\n');
    const gefunden = await auswahl(root);
    expect(gefunden.get(ziel).offsets).toHaveLength(2);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'offen' }]);
    expect(lies(ziel)).toBe('Notiz eins\n');
  });

  it('ruehrt ein geteiltes Dokument nicht an', async () => {
    const root = makeRoot();
    const geschrieben = writePartLine('Notiz im Kopfteil\n', { index: 1, base: 'Doku' });
    expect(geschrieben.ok).toBe(true);
    const ziel = write(root, 'Doku.md', geschrieben.text);
    const gefunden = await auswahl(root);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'geteilt' }]);
    expect(lies(ziel)).toBe(geschrieben.text);
  });

  it('schreibt ohne Bezugs-Stand nicht', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\n');
    const gefunden = await auswahl(root);
    // Die Suchleiste wurde geschlossen: Der Vorrat ist weg, und mit ihm der
    // Stand, in dem die Offsets gelten.
    gibBereichsVorratFrei(root);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'keinVorrat' }]);
    expect(lies(ziel)).toBe('Notiz eins\n');
  });
});

describe('Bereichsweites Ersetzen: Datei-Form und Leerlauf', () => {
  it('erhaelt BOM und Windows-Zeilenenden', async () => {
    const root = makeRoot();
    const vorher = '﻿Notiz eins\r\nzweite Notiz\r\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);

    const ersetzeImBereich = streckeFuer(root);
    await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(lies(ziel)).toBe('﻿Merk eins\r\nzweite Merk\r\n');
  });

  it('schreibt gar nicht, wenn das Ergebnis dem Bestand gleicht', async () => {
    const root = makeRoot();
    const vorher = 'Notiz eins\n';
    const ziel = write(root, 'alpha.md', vorher);
    const gefunden = await auswahl(root);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(
      root,
      auftrag({ ersetzung: 'Notiz', dateien: [...gefunden.values()] }),
    );

    expect(ergebnis.geaendert).toEqual([]);
    expect(ergebnis.fehlgeschlagen).toEqual([]);
    expect(lies(ziel)).toBe(vorher);
    // Die fehlende Begleitdatei ist der Beleg: Waere der Schreibweg betreten
    // worden, haette die Zwangs-Sicherung sie angelegt.
    expect(fs.existsSync(mddPfad(ziel))).toBe(false);
  });

  it('meldet ein unbrauchbares Muster fuer jede angefragte Datei', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\n');

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(root, {
      muster: '(unvollstaendig',
      flags: 'gm',
      ersetzung: 'Merk',
      dateien: [{ pfad: ziel, offsets: [0] }],
    });

    expect(ergebnis.fehlgeschlagen).toHaveLength(1);
    expect(ergebnis.fehlgeschlagen[0].grund).toBe('muster');
    expect(lies(ziel)).toBe('Notiz eins\n');
  });

  it('weist einen Offset ab, an dem kein Fund steht', async () => {
    const root = makeRoot();
    const ziel = write(root, 'alpha.md', 'Notiz eins\n');
    await auswahl(root);

    const ersetzeImBereich = streckeFuer(root);
    const ergebnis = await ersetzeImBereich(
      root,
      // Offset 3 liegt mitten im Wort und ist kein Treffer-Beginn.
      auftrag({ dateien: [{ pfad: ziel, offsets: [3] }] }),
    );

    expect(ergebnis.fehlgeschlagen).toEqual([{ pfad: ziel, grund: 'offsetUngueltig' }]);
    expect(lies(ziel)).toBe('Notiz eins\n');
  });
});

describe('Bereichsweites Ersetzen: die reale Konstellation', () => {
  // Der Fall, um den es dem Epic geht: mehrere Dateien, abgeschaltete
  // Historisierung, und eine Datei, deren Schreibvorgang scheitert. Er haelt
  // alle drei Zusicherungen zugleich fest — der Lauf geht weiter, der
  // Fehlschlag erscheint im Ergebnis, und die gescheiterte Datei bleibt
  // unveraendert.
  it('fuehrt den Lauf fort, wenn das Schreiben einer Datei fehlschlaegt', async () => {
    const root = makeRoot();
    const alpha = write(root, 'alpha.md', 'Notiz eins\n');
    const beta = write(root, 'beta.md', 'zweite Notiz\n');
    const gamma = write(root, 'gamma.md', 'dritte Notiz\n');
    const gefunden = await auswahl(root);

    // Der Schreibweg ersetzt ueber eine Schattenkopie samt Umbenennen; hier
    // scheitert genau das Umbenennen der einen Datei — ein realer Fall auf
    // Netz-Freigaben und bei Virenscannern. ENOSPC wird nicht wiederholt.
    const echtesUmbenennen = fsp.rename;
    vi.spyOn(fsp, 'rename').mockImplementation(async (von, nach) => {
      if (String(nach).endsWith(`${path.sep}gamma.md`)) {
        const fehler = new Error('kein Platz');
        fehler.code = 'ENOSPC';
        throw fehler;
      }
      return echtesUmbenennen(von, nach);
    });

    const ersetzeImBereich = streckeFuer(root, { historieAn: false });
    const ergebnis = await ersetzeImBereich(root, auftrag({ dateien: [...gefunden.values()] }));

    expect(ergebnis.geaendert).toEqual(
      expect.arrayContaining([
        { pfad: alpha, anzahl: 1 },
        { pfad: beta, anzahl: 1 },
      ]),
    );
    expect(ergebnis.geaendert).toHaveLength(2);
    expect(ergebnis.fehlgeschlagen).toHaveLength(1);
    expect(ergebnis.fehlgeschlagen[0].pfad).toBe(gamma);
    expect(ergebnis.fehlgeschlagen[0].grund).toBe('schreiben');

    expect(lies(alpha)).toBe('Merk eins\n');
    expect(lies(beta)).toBe('zweite Merk\n');
    expect(lies(gamma)).toBe('dritte Notiz\n');
    // Auch die beiden gelungenen Dateien tragen ihren Vor-Stand — bei
    // abgeschalteter Historisierung.
    for (const [pfad, vorher] of [
      [alpha, 'Notiz eins\n'],
      [beta, 'zweite Notiz\n'],
    ]) {
      const behaelter = mddStore.parseContainer(lies(mddPfad(pfad)));
      expect(behaelter.ok).toBe(true);
      expect(behaelter.container.history.anchors[0].text).toBe(vorher);
    }
  });
});
