// 4T-001277 (Epic 3E-000232, Befund B3): Kurzform-Verweise von einer Unterseite aus.
//
// **Der Befund.** Auf der Demo-Seite `Milky Way∕Sun` sind [[/Earth]] und
// [[/Mars]] unter Linux als unaufgeloest markiert, obwohl die Ziel-Dateien
// vorliegen; unter Windows loesen sie auf. Auf derselben Seite loesen der
// Eltern-Verweis [[..]] und der gewoehnliche Verweis [[Light Speed]] auch unter
// Linux auf.
//
// **Warum eine eigene Datei.** Der 4T-000336-Block in backlinks.test.js prueft
// [[/Name]] bereits und ist unter Linux gruen — dort traegt die **aktive** Datei
// aber keinen Unterseiten-Trenner (`Prozess-A.md` verweist auf
// `Prozess-A∕Entwurf.md`). Im Befund ist die aktive Datei selbst schon eine
// Unterseite, und der Verweis zeigt auf die dritte Ebene. Diese Datei haelt die
// Diagnose-Leiter dieses Befunds zusammen, statt sie in eine Datei zu draengen,
// die ihr Zeilen-Budget bereits ausschoepft.
//
// **Der Aufbau ist eine Leiter, kein Testfall-Haufen.** Jede Stufe schaltet
// genau einen Unterschied zwischen dem gruenen Prueffall und dem roten Befund
// zu. Welche Stufe zuerst rot wird, benennt die Ursache — der Sinn der
// Konstruktion ist, dass ein roter Lauf die **Stelle** meldet und nicht nur den
// Fehler. Stand 2026-08-29 sind die Stufen 1 bis 3 unter Linux belegt gruen;
// damit sind Namens-Index und Kurzform-Expansion als Ursache ausgeschieden.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backlinksFor,
  existingWikiTargets,
  releaseRoot,
  resolveWikiTargetInIndex,
  rootForActiveFile,
} from '../../src/main/backlinks.js';
import { DEMO_SOURCE_DIR, copyDirRecursive } from '../../src/main/area/demo-area.js';

const SEP = '∕'; // U+2215 DIVISION SLASH — der Unterseiten-Trenner im Dateinamen.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(HERE, '..', '..', 'src', 'demo');

// --- Setup/Teardown (Muster backlinks.test.js) ------------------------------

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-kf-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Baut den Index auf und wartet den asynchronen Aufbau ab. `areaRoot` schaltet
// die Bereichs-Wurzel zu (unbegrenzte Scan-Tiefe und Warmstart-Cache) — genau
// der Zustand, in dem der Befund beobachtet wurde.
async function indexFor(activeFile, ownerKey, areaRoot) {
  let result = backlinksFor(activeFile, ownerKey, areaRoot);
  openRoots.add(rootForActiveFile(activeFile, areaRoot));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile, ownerKey, areaRoot);
  }
  return result;
}

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) releaseRoot(root);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Der Beleg-Bestand in kleinster Form: drei Ebenen, die aktive Datei in der
// Mitte, dazu die beiden Verweis-Formen, die im Befund aufloesen.
function dreiEbenen() {
  const root = makeRoot();
  write(root, 'Milky Way.md', '# Milky Way\n');
  const sonne = write(
    root,
    `Milky Way${SEP}Sun.md`,
    'Planet: [[/Earth]]\nZurueck: [[..]]\nSiehe [[Light Speed]].\n',
  );
  const erde = write(root, `Milky Way${SEP}Sun${SEP}Earth.md`, '# Earth\n');
  write(root, 'Light Speed.md', '# Light Speed\n');
  return { root, sonne, erde };
}

// --- Die Leiter -------------------------------------------------------------

describe('4T-001277: Kurzform-Verweise von einer Unterseite aus (Befund B3)', () => {
  it('Stufe 1: der Index kennt die Unterseite dritter Ebene unter ihrem vollen Namen', async () => {
    const { sonne, erde } = dreiEbenen();
    await indexFor(sonne);
    // Ausgeschriebene Slash-Form: sie umgeht die Expansion vollstaendig und
    // trifft allein den Aufbau des Namens-Index und die Suche darin.
    expect(resolveWikiTargetInIndex(sonne, 'Milky Way/Sun/Earth').candidates).toEqual([erde]);
  });

  it('Stufe 2: [[/Earth]] loest von der Unterseite aus auf, [[..]] und [[Light Speed]] ebenso', async () => {
    const { sonne } = dreiEbenen();
    await indexFor(sonne);
    const lint = existingWikiTargets(sonne, ['/Earth', '..', 'Light Speed']);
    expect(lint.status).toBe('ready');
    // Die beiden hinteren Formen sind der Kontrast: Sie loesen im Befund auf.
    // Steht [[/Earth]] als einziges nicht in `existing`, ist die Expansion die
    // Stelle; fehlen alle drei, liegt es am Index dieser Wurzel.
    expect(lint.existing).toEqual(['/Earth', '..', 'Light Speed']);
    expect(lint.ambiguous).toEqual([]);
  });

  it('Stufe 3: dasselbe am ausgelieferten Bestand statt am Nachbau', async () => {
    // Nur lesend: `src/demo` wird als gewoehnliche Wurzel indiziert, nicht
    // veraendert, und steht nicht in der Temp-Aufraeumliste des Teardowns.
    const sonne = path.join(DEMO_DIR, `Milky Way${SEP}Sun.md`);
    expect(fs.existsSync(sonne)).toBe(true);
    await indexFor(sonne, 'test:4t-1277-quelle');
    const lint = existingWikiTargets(sonne, ['/Earth', '/Mars', '..', 'Light Speed']);
    expect(lint.status).toBe('ready');
    expect(lint.existing).toEqual(['/Earth', '/Mars', '..', 'Light Speed']);
  });

  it('Stufe 4: derselbe Nachbau als BEREICH geoeffnet, nicht als gewoehnliche Wurzel', async () => {
    // Der Befund entstand in einer Demo-**Area**. Ein Bereich scannt ohne
    // Tiefen-Grenze und legt einen Warmstart-Cache an; beides ist am
    // gewoehnlichen Prueffall der Stufen 1 und 2 nicht beteiligt.
    const { root, sonne } = dreiEbenen();
    await indexFor(sonne, 'test:4t-1277-bereich', root);
    const lint = existingWikiTargets(sonne, ['/Earth', '..', 'Light Speed'], root);
    expect(lint.status).toBe('ready');
    expect(lint.existing).toEqual(['/Earth', '..', 'Light Speed']);
  });

  it('Stufe 5: echte Kopie des ausgelieferten Bestands, als Bereich geoeffnet', async () => {
    // Der Prueffall, der dem Befund am naechsten kommt, ohne die Anwendung zu
    // starten: derselbe Kopier-Weg wie beim Anlegen der Demo-Area (E2E-Fall
    // DA-03), dasselbe Ziel-Verzeichnis-Muster, dieselbe Bereichs-Oeffnung.
    const ziel = makeRoot();
    await copyDirRecursive(DEMO_SOURCE_DIR, ziel);
    const sonne = path.join(ziel, `Milky Way${SEP}Sun.md`);
    // Die Kopie muss den Trenner tragen — ginge er hier verloren, waere das
    // bereits die Ursache und nicht erst die Auflösung.
    expect(fs.existsSync(sonne)).toBe(true);
    const namen = await fsp.readdir(ziel);
    expect(namen).toContain(`Milky Way${SEP}Sun${SEP}Earth.md`);

    await indexFor(sonne, 'test:4t-1277-kopie', ziel);
    const lint = existingWikiTargets(sonne, ['/Earth', '/Mars', '..', 'Light Speed'], ziel);
    expect(lint.status).toBe('ready');
    expect(lint.existing).toEqual(['/Earth', '/Mars', '..', 'Light Speed']);
  });
});
