// 4T-002945 (Epic 3E-000452): Prüffälle des Schalters «Rückrufe des nächsten
// Bilds sofort» (test/bild-rueckrufe.js) und der Gegenprobe ohne die
// Layout-Funktionen an Text-Bereichen (test/browser-nachbildung.js).
//
// Zwei Teile: der Schalter an einem eigenen Ziel-Objekt, und der reale Aufbau.
// Der reale Aufbau ist die Nachstellung des roten Laufs vom 2026-11-21 mit
// seiner Gegenprobe: Je ein Kind-Lauf von Vitest über zwei echte Prüfdateien
// des Bestands, mit nachgestellter Last (`EM4ME_BILD_RUECKRUFE=sofort`) und
// der echten Vorbereitungs-Datei.
//   - ohne die Layout-Funktionen: rot, mit dem Fehlertext des roten Laufs;
//   - mit den Layout-Funktionen (der gelieferte Stand): grün.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ERSTER_GRIFF,
  RUECKRUF_VARIABLE,
  RUECKRUFE_SOFORT,
  installiereAusUmgebung,
  rueckrufeSofort,
  sindSofort,
} from '../bild-rueckrufe.js';
import { FORM_VARIABLE, FORM_OHNE, ergaenzeAusUmgebung } from '../browser-nachbildung.js';
import { UHR_VARIABLE } from '../uhr-versatz.js';
import { BUDGET_VARIABLE } from '../zerlege-budget.js';
import { PROZESS_ZEITLIMIT, AUFRAEUM_ZEITLIMIT } from '../zeitlimits.js';

// Der reale Aufbau startet zwei Vitest-Läufe.
vi.setConfig({ testTimeout: PROZESS_ZEITLIMIT, hookTimeout: AUFRAEUM_ZEITLIMIT });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Ein Ziel mit einer nachgebildeten Bild-Folge: Rückrufe laufen erst, wenn der
// Fall `bild()` aufruft.
function neuesZiel() {
  const wartend = new Map();
  let naechste = 0;
  return {
    queueMicrotask,
    performance,
    requestAnimationFrame(rueckruf) {
      wartend.set(++naechste, rueckruf);
      return naechste;
    },
    cancelAnimationFrame(griff) {
      wartend.delete(griff);
    },
    bild() {
      for (const [griff, rueckruf] of [...wartend]) {
        wartend.delete(griff);
        rueckruf(0);
      }
    },
    wartendeBilder: () => wartend.size,
  };
}
const kleinstSchritt = () => new Promise((weiter) => queueMicrotask(weiter));

describe('Schalter: Rückrufe des nächsten Bilds sofort', () => {
  it('ein Rückruf läuft im nächsten Kleinst-Schritt, ohne dass ein Bild kommt', async () => {
    const ziel = neuesZiel();
    rueckrufeSofort(ziel);
    expect(sindSofort(ziel)).toBe(true);
    let gelaufen = 0;
    ziel.requestAnimationFrame(() => gelaufen++);
    expect(gelaufen).toBe(0);
    await kleinstSchritt();
    expect(gelaufen).toBe(1);
    expect(ziel.wartendeBilder()).toBe(0);
  });

  it('ein abgebrochener Rückruf läuft nicht', async () => {
    const ziel = neuesZiel();
    rueckrufeSofort(ziel);
    let gelaufen = 0;
    const griff = ziel.requestAnimationFrame(() => gelaufen++);
    ziel.cancelAnimationFrame(griff);
    await kleinstSchritt();
    expect(gelaufen).toBe(0);
  });

  // Die Editor-Bibliothek liest einen Griff unter null als «nichts
  // angefordert»: Sie forderte dann bei jedem Anstoß erneut an und bräche nie
  // ab (Befund des Zweitblicks an der ersten Fassung).
  it('die Griffe sind positiv und überschneiden sich nicht mit denen der Nachbildung', () => {
    const ziel = neuesZiel();
    const fremd = ziel.requestAnimationFrame(() => {});
    rueckrufeSofort(ziel);
    const erster = ziel.requestAnimationFrame(() => {});
    const zweiter = ziel.requestAnimationFrame(() => {});
    expect(erster).toBe(ERSTER_GRIFF);
    expect(zweiter).toBe(ERSTER_GRIFF + 1);
    expect(fremd).toBeLessThan(ERSTER_GRIFF);
  });

  it('ein Griff der Nachbildung wird an ihr abgebrochen, auch bei eingeschaltetem Schalter', () => {
    const ziel = neuesZiel();
    let gelaufen = 0;
    const fremd = ziel.requestAnimationFrame(() => gelaufen++);
    rueckrufeSofort(ziel);
    expect(ziel.wartendeBilder()).toBe(1);
    ziel.cancelAnimationFrame(fremd);
    expect(ziel.wartendeBilder()).toBe(0);
    ziel.bild();
    expect(gelaufen).toBe(0);
  });

  it('eine Kette von Rückrufen geht nach zwanzig Gliedern an die gewöhnliche Bild-Folge', async () => {
    const ziel = neuesZiel();
    rueckrufeSofort(ziel);
    let glieder = 0;
    const weiter = () => {
      glieder++;
      ziel.requestAnimationFrame(weiter);
    };
    ziel.requestAnimationFrame(weiter);
    for (let i = 0; i < 60; i++) await kleinstSchritt();
    // Die Kette hält nach zwanzig Gliedern an und wartet auf ein Bild, statt
    // den Lauf anzuhalten. (Die erste Fassung zählte die Verschachtelung, die
    // es bei Kleinst-Schritten nicht gibt, und lief hier endlos.)
    expect(glieder).toBe(20);
    expect(ziel.wartendeBilder()).toBe(1);
    // Das Bild führt die Kette weiter: das eine Glied, das auf das Bild
    // gewartet hat, und danach wieder zwanzig sofort.
    ziel.bild();
    for (let i = 0; i < 60; i++) await kleinstSchritt();
    expect(glieder).toBe(41);
    expect(ziel.wartendeBilder()).toBe(1);
  });

  it('abschalten stellt die Funktionen des Ziels wieder her; ein zweites Einschalten ändert nichts', () => {
    const ziel = neuesZiel();
    const echt = ziel.requestAnimationFrame;
    const ab = rueckrufeSofort(ziel);
    const sofort = ziel.requestAnimationFrame;
    rueckrufeSofort(ziel)();
    expect(ziel.requestAnimationFrame).toBe(sofort);
    ab();
    expect(ziel.requestAnimationFrame).toBe(echt);
    expect(sindSofort(ziel)).toBe(false);
  });

  it('aus der Umgebung: ohne Angabe nichts, «sofort» schaltet ein, anderes bricht ab', () => {
    const ziel = neuesZiel();
    expect(installiereAusUmgebung({}, ziel)).toBe(false);
    expect(installiereAusUmgebung({ [RUECKRUF_VARIABLE]: '' }, ziel)).toBe(false);
    expect(sindSofort(ziel)).toBe(false);
    expect(installiereAusUmgebung({ [RUECKRUF_VARIABLE]: RUECKRUFE_SOFORT }, ziel)).toBe(true);
    expect(sindSofort(ziel)).toBe(true);
    expect(() => installiereAusUmgebung({ [RUECKRUF_VARIABLE]: 'ja' }, neuesZiel())).toThrow(
      /keine bekannte Angabe/,
    );
    // Ohne Browser-Nachbildung gibt es die Funktion nicht.
    expect(installiereAusUmgebung({ [RUECKRUF_VARIABLE]: RUECKRUFE_SOFORT }, {})).toBe(false);
  });
});

describe('Ergänzung der Text-Bereiche aus der Umgebung', () => {
  const ziel = () => ({ Range: class {} });

  it('ohne Angabe ergänzt sie beide Funktionen, mit «ohne» keine', () => {
    const a = ziel();
    expect(ergaenzeAusUmgebung({}, a)).toEqual(['getClientRects', 'getBoundingClientRect']);
    expect(new a.Range().getClientRects()).toEqual([]);
    expect(new a.Range().getBoundingClientRect()).toMatchObject({ width: 0, height: 0 });
    const b = ziel();
    expect(ergaenzeAusUmgebung({ [FORM_VARIABLE]: '' }, b)).toHaveLength(2);
    const c = ziel();
    expect(ergaenzeAusUmgebung({ [FORM_VARIABLE]: FORM_OHNE }, c)).toEqual([]);
    expect(c.Range.prototype.getClientRects).toBeUndefined();
  });

  it('eine unbekannte Angabe bricht ab', () => {
    expect(() => ergaenzeAusUmgebung({ [FORM_VARIABLE]: 'voll' }, ziel())).toThrow(
      /keine bekannte Angabe/,
    );
  });
});

describe('realer Aufbau: nachgestellte Last an zwei Prüfdateien des Bestands', () => {
  // Zwei der fünf Prüfdateien, die die Funktionen unter nachgestellter Last im
  // Mess-Schritt des Editors abfragen (Messung vom 2026-11-26: 8 und 4 Fehler
  // ohne die Funktionen).
  const PRUEFDATEIEN = [
    'test/unit/renderer/listen-nummerierung.test.js',
    'test/unit/renderer/diagramm-kommandos.test.js',
  ];
  let ordner;

  beforeAll(() => {
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-bild-rueckrufe-'));
    const pfad = (rel) =>
      path
        .join(WURZEL, ...rel.split('/'))
        .split(path.sep)
        .join('/');
    fs.writeFileSync(
      path.join(ordner, 'vitest.config.mjs'),
      `export default { test: { root: ${JSON.stringify(pfad('.'))}, include: ${JSON.stringify(
        PRUEFDATEIEN,
      )}, setupFiles: [${JSON.stringify(pfad('test/zeitgrenze-je-fall.js'))}] } };\n`,
    );
  });
  afterAll(() => {
    if (ordner) fs.rmSync(ordner, { recursive: true, force: true });
  });

  function kindLauf(form) {
    const env = { ...process.env, [RUECKRUF_VARIABLE]: RUECKRUFE_SOFORT };
    // Die Kind-Läufe tragen allein die zwei Schalter dieses Falls: Läuft die
    // Suite selbst unter einem anderen Mess-Schalter (verschobene Uhr,
    // erschöpftes Zerlege-Budget, Zeitgeber-Spur), erben sie ihn nicht.
    for (const name of [FORM_VARIABLE, UHR_VARIABLE, BUDGET_VARIABLE, 'EM4ME_ZEITGEBER_SPUR'])
      delete env[name];
    if (form) env[FORM_VARIABLE] = form;
    const lauf = spawnSync(
      process.execPath,
      [
        path.join(WURZEL, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        '--config',
        path.join(ordner, 'vitest.config.mjs'),
        '--reporter=dot',
      ],
      { cwd: WURZEL, encoding: 'utf8', env },
    );
    return { status: lauf.status, ausgabe: `${lauf.stdout}\n${lauf.stderr}` };
  }

  it('ohne die Layout-Funktionen ist der Lauf rot, mit dem Fehler des roten Laufs, obwohl kein Fall scheitert', () => {
    const { status, ausgabe } = kindLauf(FORM_OHNE);
    expect(status, ausgabe).toBe(1);
    expect(ausgabe).toMatch(/getClientRects is not a function/);
    expect(ausgabe).not.toMatch(/\d+ failed/);
  });

  it('mit den Layout-Funktionen ist der Lauf grün', () => {
    const { status, ausgabe } = kindLauf(null);
    expect(status, ausgabe).toBe(0);
    expect(ausgabe).not.toMatch(/Unhandled/);
  });
});
