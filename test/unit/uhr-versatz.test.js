// 4T-002064 (Epic 3E-000156): Prüffälle des Wanduhr-Wächters.
//
// Drei Teile: die Angabe der Verschiebung, das Verhalten der verschobenen Uhr
// samt ihrer Wechselwirkung mit den gestellten Uhren von Vitest, und die
// Rot-Probe am realen Aufbau — ein Kind-Lauf von Vitest über einen bewusst
// wanduhr-abhängigen Beispiel-Fall, einmal ohne und einmal mit Verschiebung.
//
// Die Datei läuft selbst in beiden Läufen der vollen Gates, also auch unter
// verschobener Uhr. Ist die Uhr beim Start schon verschoben, prüft sie die
// vorgefundene Verschiebung; sonst richtet sie für die Dauer der Datei eine
// eigene ein und baut sie danach wieder ab.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  versatzInMs,
  verschobeneUhr,
  installiere,
  installiereAusUmgebung,
  setzeUhrVersatzAus,
  zustand,
  echteZeit,
  UHR_VARIABLE,
} from '../uhr-versatz.js';
import { PROZESS_ZEITLIMIT, AUFRAEUM_ZEITLIMIT } from '../zeitlimits.js';

// 4T-000944: Die Rot-Probe startet zwei reale Vitest-Läufe.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = 24 * 60 * 60 * 1000;

describe('Angabe der Verschiebung', () => {
  const bezug = Date.UTC(2026, 9, 2, 12, 0, 0);

  it('liest Jahre, Monate, Wochen und Tage kalender-genau', () => {
    expect(versatzInMs('P1D', bezug)).toBe(TAG);
    expect(versatzInMs('P1W', bezug)).toBe(7 * TAG);
    expect(versatzInMs('P1M', bezug)).toBe(31 * TAG); // Oktober hat 31 Tage
    expect(versatzInMs('P1Y', bezug)).toBe(365 * TAG);
    expect(versatzInMs('P5Y', bezug)).toBe((5 * 365 + 1) * TAG); // 2028 ist ein Schaltjahr
    expect(versatzInMs('P1Y2M3D', bezug)).toBe(
      Date.UTC(2027, 11, 5, 12, 0, 0) - bezug, // 2026-10-02 + 1 J, 2 M, 3 T
    );
    expect(versatzInMs('-P8D', bezug)).toBe(-8 * TAG);
  });

  it('nimmt fehlende und leere Angaben als keine Verschiebung', () => {
    expect(versatzInMs(undefined, bezug)).toBe(0);
    expect(versatzInMs('', bezug)).toBe(0);
    expect(versatzInMs('  ', bezug)).toBe(0);
  });

  it('weist eine unlesbare Angabe ab, statt still unverschoben zu laufen', () => {
    for (const falsch of ['P', '1Y', 'P1H', 'PT1H', 'p1y', '+P1Y', 'P1.5Y', 'ein Jahr']) {
      expect(() => versatzInMs(falsch, bezug), falsch).toThrow(UHR_VARIABLE);
    }
  });
});

describe('Verschobene Uhr an einem eigenen Ziel-Objekt', () => {
  const versatz = 400 * TAG;

  it('verschiebt allein den argumentlosen Aufruf', () => {
    const Uhr = verschobeneUhr(Date, versatz);
    const echt = Date.now();
    expect(Math.abs(Uhr.now() - echt - versatz)).toBeLessThan(1000);
    expect(Math.abs(new Uhr().getTime() - echt - versatz)).toBeLessThan(1000);
    expect(new Uhr('2026-10-01T14:00:00Z').toISOString()).toBe('2026-10-01T14:00:00.000Z');
    expect(new Uhr(2026, 9, 1).getFullYear()).toBe(2026);
    expect(new Uhr(0).getTime()).toBe(0);
    expect(Uhr.UTC(2026, 0, 1)).toBe(Date.UTC(2026, 0, 1));
    expect(Uhr.parse('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('liefert echte Datums-Objekte und als Funktion gerufen eine Zeichenkette', () => {
    const Uhr = verschobeneUhr(Date, versatz);
    const d = new Uhr();
    expect(d).toBeInstanceOf(Date);
    expect(d).toBeInstanceOf(Uhr);
    expect(Object.prototype.toString.call(d)).toBe('[object Date]');
    expect(typeof Uhr()).toBe('string');
    expect(new Date(Uhr()).getUTCFullYear()).toBe(new Date(Date.now() + versatz).getUTCFullYear());
  });

  it('lässt Dauern unverändert, weil die Uhr weiterläuft', async () => {
    const Uhr = verschobeneUhr(Date, versatz);
    const a = Uhr.now();
    const echtA = Date.now();
    await new Promise((r) => setTimeout(r, 30));
    const dauer = Uhr.now() - a;
    // Die vier Ablesungen liegen nicht im selben Augenblick; daher die
    // Toleranz von wenigen Millisekunden statt Gleichheit.
    expect(Math.abs(dauer - (Date.now() - echtA))).toBeLessThanOrEqual(5);
    expect(dauer).toBeGreaterThanOrEqual(25);
  });

  it('nimmt beim Zurückschreiben des echten Konstruktors den verschobenen und baut sich ab', () => {
    const ziel = { Date };
    const z = installiere(ziel, versatz);
    expect(ziel.Date).toBe(z.uhr);
    expect(installiere(ziel, 1)).toBe(z); // kein zweites Verschieben
    const fremd = function Attrappe() {};
    ziel.Date = fremd;
    expect(ziel.Date).toBe(fremd);
    ziel.Date = Date;
    expect(ziel.Date).toBe(z.uhr);
    z.entferne();
    expect(ziel.Date).toBe(Date);
    expect(zustand(ziel)).toBeNull();
  });

  it('setzt die Verschiebung nur mit Grund aus', () => {
    const ziel = { Date };
    installiere(ziel, versatz);
    expect(() => setzeUhrVersatzAus('', ziel)).toThrow(/Grund/);
    expect(setzeUhrVersatzAus('vergleicht die Uhr mit Datei-Zeiten', ziel)).toBe(true);
    expect(ziel.Date).toBe(Date);
    expect(setzeUhrVersatzAus('vergleicht die Uhr mit Datei-Zeiten', ziel)).toBe(false);
  });

  it('richtet aus der Umgebung nur bei gesetzter Variable etwas ein', () => {
    const ohne = { Date };
    expect(installiereAusUmgebung({}, ohne)).toBeNull();
    expect(installiereAusUmgebung({ [UHR_VARIABLE]: '' }, ohne)).toBeNull();
    expect(ohne.Date).toBe(Date);
    const mit = { Date };
    const z = installiereAusUmgebung({ [UHR_VARIABLE]: 'P1D' }, mit);
    expect(z.versatzMs).toBe(versatzInMs('P1D', z.echt.now()));
    expect(() => installiereAusUmgebung({ [UHR_VARIABLE]: 'kaputt' }, { Date })).toThrow();
  });
});

describe('Wechselwirkung mit den gestellten Uhren von Vitest', () => {
  let eigene = null;
  let versatz = 0;

  beforeAll(() => {
    // Unter dem Wächter-Lauf ist die Uhr schon verschoben; sonst eine eigene.
    if (!zustand()) eigene = installiere(globalThis, versatzInMs('P1Y', Date.now()));
    versatz = zustand().versatzMs;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    if (eigene) eigene.entferne();
  });

  const abweichung = () => Math.abs(Date.now() - echteZeit() - versatz);

  it('verschiebt Date.now() und new Date() um den Versatz', () => {
    expect(versatz).not.toBe(0);
    expect(abweichung()).toBeLessThan(1000);
    expect(Math.abs(new Date().getTime() - echteZeit() - versatz)).toBeLessThan(1000);
  });

  it('gibt einer gestellten Uhr Vorrang und gilt nach useRealTimers wieder', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T09:00:00'));
    expect(new Date().toISOString()).toBe(new Date('2026-09-24T09:00:00').toISOString());
    expect(Date.now()).toBe(new Date('2026-09-24T09:00:00').getTime());
    vi.useRealTimers();
    expect(abweichung()).toBeLessThan(1000);
  });

  it('startet useFakeTimers ohne gestellten Zeitpunkt an der verschobenen Uhr', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    expect(Math.abs(Date.now() - echteZeit() - versatz)).toBeLessThan(1000);
    vi.useRealTimers();
    expect(abweichung()).toBeLessThan(1000);
  });

  it('gilt auch nach setSystemTime ohne useFakeTimers wieder verschoben', () => {
    vi.setSystemTime(new Date('2026-09-24T09:00:00'));
    expect(new Date().getTime()).toBe(new Date('2026-09-24T09:00:00').getTime());
    vi.useRealTimers();
    expect(abweichung()).toBeLessThan(1000);
  });
});

// Die Rot-Probe am realen Aufbau. Der Beispiel-Fall trägt die Bauart des
// Vorfalls vom 2026-10-01: ein fester Termin als Literal, bewertet von
// Anwendungs-Code, der die Wanduhr selbst liest (`isDueOverdue` ohne
// Bezugs-Zeit). Der Termin liegt dreißig Tage nach dem echten Heute; ohne
// Verschiebung ist der Fall grün, mit einem Jahr Verschiebung rot. Die
// Vorbereitungs-Datei ist die echte der Unit-Suite.
describe('Rot-Probe: ein wanduhr-abhängiger Beispiel-Fall', () => {
  let ordner;

  beforeAll(() => {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-uhr-probe-'));
    const termin = new Date(echteZeit() + 30 * TAG);
    const zwei = (n) => String(n).padStart(2, '0');
    const literal = `${termin.getFullYear()}-${zwei(termin.getMonth() + 1)}-${zwei(termin.getDate())}`;
    const aufgaben = path.join(WURZEL, 'src', 'shared', 'markdown', 'plugins', 'tasks.js');
    const vorbereitung = path.join(WURZEL, 'test', 'zeitgrenze-je-fall.js');
    fs.writeFileSync(
      path.join(ordner, 'beispiel.test.mjs'),
      [
        "import { it, expect } from 'vitest';",
        "import { createRequire } from 'node:module';",
        'const require = createRequire(import.meta.url);',
        `const { isDueOverdue } = require(${JSON.stringify(aufgaben)});`,
        `it('Termin ${literal} ist noch nicht überfällig', () => {`,
        `  expect(isDueOverdue({ date: '${literal}' })).toBe(false);`,
        '});',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(ordner, 'vitest.config.mjs'),
      `export default { test: { include: ['*.test.mjs'], setupFiles: [${JSON.stringify(
        vorbereitung.split(path.sep).join('/'),
      )}] } };\n`,
    );
  });
  afterAll(() => {
    if (ordner) fs.rmSync(ordner, { recursive: true, force: true });
  });

  function kindLauf(versatzAngabe) {
    const env = { ...process.env };
    delete env[UHR_VARIABLE];
    if (versatzAngabe) env[UHR_VARIABLE] = versatzAngabe;
    return spawnSync(
      process.execPath,
      [
        path.join(WURZEL, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        '--root',
        ordner,
        '--config',
        path.join(ordner, 'vitest.config.mjs'),
        '--reporter=dot',
      ],
      { cwd: ordner, encoding: 'utf8', env },
    );
  }

  it('ist ohne Verschiebung grün und mit einem Jahr Verschiebung rot', () => {
    const ohne = kindLauf(null);
    expect(ohne.status, `${ohne.stdout}\n${ohne.stderr}`).toBe(0);
    const mit = kindLauf('P1Y');
    expect(mit.status, `${mit.stdout}\n${mit.stderr}`).toBe(1);
    expect(`${mit.stdout}${mit.stderr}`).toMatch(/1 failed/);
  });
});
