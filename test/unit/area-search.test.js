// 4T-000615 (Epic 3E-000116): Unit-Tests des Bereichs-Suchraums im Hauptprozess.
// Fixture-Verzeichnis mit Markdown-Dateien, Erwartungswerte von Hand am
// Fixture nachgerechnet. Setup-Muster wie area-stats.test.js (Temp-
// Verzeichnis je Fall, Aufraeumen im afterEach).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  konfiguriereBereichsSuche,
  sucheImBereich,
  gibBereichsVorratFrei,
  CACHE_SCHEMA_VERSION,
} from '../../src/main/area/area-search.js';
import { createRequire } from 'node:module';

// 4T-000949: Die Puffer-Schicht wird ueber DIESELBE Modul-Instanz gesetzt, die
// area-search.js benutzt. Vitest fuehrt fuer 'import' und 'require' getrennte
// Instanzen desselben Moduls; ein Overlay, das ueber den ESM-Import gesetzt
// wird, saehe das Modul unter Test nicht. Im Hauptprozess gibt es nur den
// CommonJS-Cache und damit eine Instanz — diese Naht ist reine Testumgebung.
const { setBufferOverlay, clearAllBufferOverlays } = createRequire(import.meta.url)(
  '../../src/main/backlinks.js',
);

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-suche-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Legt einen Bereich mit vier Markdown-Dateien plus Ablenkung an.
function fixture() {
  const root = makeRoot();
  write(root, 'alpha.md', 'Erste Zeile mit Treffer\nzweite Zeile ohne\ndritte mit Treffer hier');
  write(root, 'unter/beta.md', 'nur eine Zeile mit Treffer');
  write(root, 'unter/gamma.md', 'keine Fundstelle in dieser Datei');
  write(root, 'zeta.md', 'Treffer ganz am Anfang');
  // Ablenkung: Nicht-Markdown und ignorierter Ordner duerfen nicht erscheinen.
  write(root, 'notiz.txt', 'Treffer in einer Textdatei');
  write(root, 'node_modules/paket.md', 'Treffer in node_modules');
  write(root, '.versteckt/geheim.md', 'Treffer im Punkt-Ordner');
  return root;
}

function cacheDirFuer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-suche-cache-'));
  tmpDirs.push(dir);
  return dir;
}

async function suche(root, optionen = {}) {
  return sucheImBereich(root, { muster: 'Treffer', flags: 'gm', generation: 1, ...optionen });
}

afterEach(() => {
  clearAllBufferOverlays();
  gibBereichsVorratFrei();
  konfiguriereBereichsSuche({});
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Aufraeumen ist bestes Bemuehen */
    }
  }
  tmpDirs = [];
});

describe('Bereichs-Suchraum', () => {
  it('findet Treffer ueber mehrere Dateien, nach Datei gruppiert', async () => {
    const root = fixture();
    const res = await suche(root);
    // alpha.md 2, unter/beta.md 1, zeta.md 1 = 4 Treffer in 3 Gruppen.
    expect(res.treffer).toHaveLength(4);
    expect(res.gruppen).toHaveLength(3);
    expect(res.gruppen.map((g) => g.gruppe)).toEqual(['alpha.md', 'unter/beta.md', 'zeta.md']);
    expect(res.gruppen.map((g) => g.anzahl)).toEqual([2, 1, 1]);
  });

  it('uebergeht Nicht-Markdown, node_modules und Punkt-Ordner', async () => {
    const root = fixture();
    const res = await suche(root);
    const gruppen = res.gruppen.map((g) => g.gruppe);
    expect(gruppen.some((g) => g.includes('node_modules'))).toBe(false);
    expect(gruppen.some((g) => g.includes('.versteckt'))).toBe(false);
    expect(gruppen.some((g) => g.endsWith('.txt'))).toBe(false);
  });

  it('liefert Zeile, Spalte, Ausschnitt und den absoluten Pfad als Sprung-Kennung', async () => {
    const root = fixture();
    const res = await suche(root);
    const zweiter = res.treffer.find((t) => t.gruppe === 'alpha.md' && t.sprung.zeile === 2);
    expect(zweiter).toBeTruthy();
    // 'dritte mit ' sind elf Zeichen, der Fund beginnt also an Spalte 11.
    expect(zweiter.sprung.spalte).toBe(11);
    expect(zweiter.sprung.kennung).toBe(path.join(root, 'alpha.md'));
    expect(zweiter.ausschnitt).toContain('Treffer');
    // Die Offsets zeigen auf den Fund INNERHALB des Ausschnitts.
    expect(zweiter.ausschnitt.slice(zweiter.von, zweiter.bis)).toBe('Treffer');
  });

  it('nutzt den wurzel-relativen Pfad ohne Endung als Anzeige-Titel', async () => {
    const root = fixture();
    const res = await suche(root);
    const gruppe = res.gruppen.find((g) => g.gruppe === 'unter/beta.md');
    expect(gruppe.titel).toBe('unter/beta');
  });

  it('stellt die offene Datei mit ihrem Editor-Stand an die erste Stelle', async () => {
    const root = fixture();
    const res = await suche(root, {
      aktiv: { pfad: path.join(root, 'unter/beta.md'), text: 'Treffer, Treffer und Treffer' },
    });
    // Die offene Datei steht vorn, ihr Platten-Stand (ein Treffer) ist durch
    // den Editor-Stand (drei Treffer) ersetzt.
    expect(res.gruppen.map((g) => g.gruppe)).toEqual(['unter/beta.md', 'alpha.md', 'zeta.md']);
    expect(res.gruppen[0].anzahl).toBe(3);
    expect(res.treffer).toHaveLength(6);
    expect(res.treffer[0].gruppe).toBe('unter/beta.md');
  });

  it('nimmt die offene Datei nur einmal auf, nie doppelt', async () => {
    const root = fixture();
    const res = await suche(root, {
      aktiv: { pfad: path.join(root, 'alpha.md'), text: 'genau ein Treffer' },
    });
    const alpha = res.gruppen.filter((g) => g.gruppe === 'alpha.md');
    expect(alpha).toHaveLength(1);
    expect(alpha[0].anzahl).toBe(1);
  });

  it('laesst die Anker-Datei die Liste anfuehren, auch wenn eine andere offen ist', async () => {
    const root = fixture();
    // Die Suche wurde in zeta.md geoeffnet (Anker), der Anwender ist danach
    // in alpha.md gesprungen (aktiv). Die Reihenfolge muss beim Anker bleiben,
    // sonst zaehlt der Zaehler nur innerhalb der angesprungenen Datei.
    const res = await suche(root, {
      anker: path.join(root, 'zeta.md'),
      aktiv: { pfad: path.join(root, 'alpha.md'), text: 'ein Treffer nur' },
    });
    expect(res.gruppen.map((g) => g.gruppe)).toEqual(['zeta.md', 'alpha.md', 'unter/beta.md']);
    // Der Editor-Stand der aktiven Datei gilt trotzdem: ein Treffer statt zwei.
    expect(res.gruppen.find((g) => g.gruppe === 'alpha.md').anzahl).toBe(1);
  });

  it('bleibt ueber mehrere Laeufe bei derselben Reihenfolge', async () => {
    const root = fixture();
    const anker = path.join(root, 'unter/beta.md');
    const erste = await suche(root, { anker, aktiv: { pfad: anker, text: 'Treffer' } });
    // Zweiter Lauf, nachdem der Anwender in eine andere Datei gesprungen ist.
    const zweite = await suche(root, {
      anker,
      aktiv: { pfad: path.join(root, 'zeta.md'), text: 'Treffer' },
      generation: 2,
    });
    expect(zweite.gruppen.map((g) => g.gruppe)).toEqual(erste.gruppen.map((g) => g.gruppe));
    expect(zweite.gruppen[0].gruppe).toBe('unter/beta.md');
  });

  it('behandelt eine offene Datei ausserhalb des Bereichs als nicht zugehoerig', async () => {
    const root = fixture();
    const fremd = makeRoot();
    const res = await suche(root, {
      aktiv: { pfad: path.join(fremd, 'fremd.md'), text: 'Treffer Treffer' },
    });
    // Die fremde Datei erscheint nicht, der Bereich bleibt vollstaendig.
    expect(res.gruppen.map((g) => g.gruppe)).toEqual(['alpha.md', 'unter/beta.md', 'zeta.md']);
    expect(res.treffer).toHaveLength(4);
  });

  it('liefert ein leeres Ergebnis ohne Wurzel und ohne Muster', async () => {
    const root = fixture();
    expect((await sucheImBereich(null, { muster: 'Treffer' })).treffer).toHaveLength(0);
    expect((await sucheImBereich(root, { muster: '' })).treffer).toHaveLength(0);
  });

  it('faengt ein ungueltiges Regex-Muster ab, statt zu werfen', async () => {
    const root = fixture();
    const res = await sucheImBereich(root, { muster: '(', flags: 'gm', generation: 1 });
    expect(res.treffer).toHaveLength(0);
    expect(res.vorratModus).toBe('leer');
  });

  it('gibt die Generation des Aufrufs unveraendert zurueck', async () => {
    const root = fixture();
    const res = await suche(root, { generation: 42 });
    expect(res.generation).toBe(42);
  });

  it('verwirft einen ueberholten Aufbau, wenn eine juengere Generation laeuft', async () => {
    const root = fixture();
    const alt = sucheImBereich(root, { muster: 'Treffer', flags: 'gm', generation: 1 });
    const neu = sucheImBereich(root, { muster: 'Treffer', flags: 'gm', generation: 2 });
    const [altRes, neuRes] = await Promise.all([alt, neu]);
    // Der aeltere Lauf erkennt die juengere Generation und liefert nichts an.
    expect(altRes.vorratModus).toBe('ueberholt');
    expect(neuRes.treffer).toHaveLength(4);
  });

  it('beachtet Gross- und Kleinschreibung ueber die uebergebenen Flags', async () => {
    const root = makeRoot();
    write(root, 'a.md', 'Treffer und treffer');
    expect((await suche(root, { flags: 'gm' })).treffer).toHaveLength(1);
    expect((await suche(root, { flags: 'gmi', generation: 2 })).treffer).toHaveLength(2);
  });
});

describe('Bereichs-Suchraum, Cache', () => {
  it('legt den Cache im konfigurierten Verzeichnis an und nutzt ihn beim zweiten Lauf', async () => {
    const root = fixture();
    const cacheDir = cacheDirFuer();
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDir });

    await suche(root);
    const dateien = fs.readdirSync(cacheDir);
    expect(dateien).toHaveLength(1);
    const container = JSON.parse(fs.readFileSync(path.join(cacheDir, dateien[0]), 'utf8'));
    expect(container.v).toBe(CACHE_SCHEMA_VERSION);
    expect(container.dateien).toHaveLength(4);

    // Zweiter Lauf mit freigegebenem Vorrat: Die Texte kommen aus dem Cache,
    // das Ergebnis bleibt identisch.
    gibBereichsVorratFrei(root);
    const res = await suche(root, { generation: 2 });
    expect(res.treffer).toHaveLength(4);
  });

  it('liest eine geaenderte Datei neu und uebernimmt ihren neuen Stand', async () => {
    const root = fixture();
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDirFuer() });
    await suche(root);

    gibBereichsVorratFrei(root);
    // Groesse aendert sich mit, damit der Abgleich unabhaengig von der
    // Zeitstempel-Aufloesung des Dateisystems greift.
    write(root, 'unter/gamma.md', 'jetzt mit Treffer und noch einem Treffer darin');
    const res = await suche(root, { generation: 2 });
    const gamma = res.gruppen.find((g) => g.gruppe === 'unter/gamma.md');
    expect(gamma).toBeTruthy();
    expect(gamma.anzahl).toBe(2);
  });

  it('nimmt eine geloeschte Datei aus dem Ergebnis', async () => {
    const root = fixture();
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDirFuer() });
    await suche(root);

    gibBereichsVorratFrei(root);
    fs.rmSync(path.join(root, 'zeta.md'));
    const res = await suche(root, { generation: 2 });
    expect(res.gruppen.map((g) => g.gruppe)).toEqual(['alpha.md', 'unter/beta.md']);
  });

  it('baut bei defektem und bei versionsfremdem Cache still neu auf', async () => {
    const root = fixture();
    const cacheDir = cacheDirFuer();
    konfiguriereBereichsSuche({ cacheVerzeichnis: cacheDir });
    await suche(root);
    const datei = path.join(cacheDir, fs.readdirSync(cacheDir)[0]);

    fs.writeFileSync(datei, '{ kein gueltiges JSON', 'utf8');
    gibBereichsVorratFrei(root);
    expect((await suche(root, { generation: 2 })).treffer).toHaveLength(4);

    fs.writeFileSync(datei, JSON.stringify({ v: 999, dateien: [] }), 'utf8');
    gibBereichsVorratFrei(root);
    expect((await suche(root, { generation: 3 })).treffer).toHaveLength(4);
  });

  it('sucht ohne konfiguriertes Cache-Verzeichnis unveraendert weiter', async () => {
    const root = fixture();
    konfiguriereBereichsSuche({});
    const res = await suche(root);
    expect(res.treffer).toHaveLength(4);
    expect(res.vorratModus).toBe('vorrat');
  });
});

// 4T-000949 (Befund E-02, Story 4S-000787): Der geschriebene Stand eines offenen
// Dokuments, das nicht das aktive ist. Der Renderer schickt nur den Stand der
// aktiven Datei mit; jedes andere offene Dokument kam bis hierher von der
// Platte. Gemessen wird gegen die Puffer-Overlay-Schicht des Hauptprozesses.
describe('Bereichs-Suche: geschriebener Stand nicht-aktiver Dokumente', () => {
  it('findet Puffer-Text und findet Platten-Text derselben Datei nicht mehr', async () => {
    const root = makeRoot();
    write(root, 'start.md', 'Ohne Fundstelle');
    write(root, 'zweite.md', 'Hier steht Quittenbrot');

    // Anker: Der Platten-Stand ist auffindbar, solange kein Puffer vorliegt.
    const vorher = await sucheImBereich(root, {
      muster: 'Quittenbrot',
      flags: 'gm',
      generation: 1,
    });
    expect(vorher.gruppen.map((g) => g.gruppe)).toEqual(['zweite.md']);

    // Geschriebener, nicht gespeicherter Stand — ohne 'aktiv', denn genau das
    // ist der Fall: Die geaenderte Datei ist nicht die aktive.
    setBufferOverlay(path.join(root, 'zweite.md'), 'Jetzt steht hier Holunderblues');

    gibBereichsVorratFrei(root);
    const neu = await sucheImBereich(root, {
      muster: 'Holunderblues',
      flags: 'gm',
      generation: 2,
    });
    expect(neu.gruppen.map((g) => g.gruppe)).toEqual(['zweite.md']);

    gibBereichsVorratFrei(root);
    const alt = await sucheImBereich(root, { muster: 'Quittenbrot', flags: 'gm', generation: 3 });
    expect(alt.gruppen).toEqual([]);
    // Die Platte ist unberuehrt geblieben.
    expect(fs.readFileSync(path.join(root, 'zweite.md'), 'utf8')).toContain('Quittenbrot');
  });
});
