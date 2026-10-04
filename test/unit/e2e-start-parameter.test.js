// 4T-002068 (Epic 3E-000161): Prüffälle der Start-Parameter der
// Ablauf-Prüfungen (`test/e2e/helpers/start-parameter.js`).
//
// Der Helfer entscheidet, ob `launchApp` den Quellstand oder eine gebaute
// Programmdatei startet. Geprüft wird hier die Ableitung allein, ohne Electron:
// Ohne die Variable müssen die Start-Optionen genau die bisherigen sein, mit
// ihr entfallen das Quellstand-Argument und die Frische-Prüfung, das eigene
// Profil je Prüf-Instanz bleibt.
//
// Eingabe dieser Prüfdatei: der Helfer selbst.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  startParameter,
  programmdateiAusUmgebung,
  PROGRAMMDATEI_VARIABLE,
} = require('../e2e/helpers/start-parameter.js');

const APP_ROOT = path.resolve('C:/projekt');
const USER_DATA = path.resolve('C:/temp/profil');

let ordner;
let programmdatei;

beforeAll(() => {
  ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-startparameter-'));
  programmdatei = path.join(ordner, 'EM4me.exe');
  fs.writeFileSync(programmdatei, '');
});

afterAll(() => {
  fs.rmSync(ordner, { recursive: true, force: true });
});

describe('Variablen-Name', () => {
  it('folgt dem Präfix der Projekt-Variablen', () => {
    expect(PROGRAMMDATEI_VARIABLE).toBe('EM4ME_PROGRAMMDATEI');
  });
});

describe('programmdateiAusUmgebung', () => {
  it('liefert null ohne Variable, bei leerem Wert und bei bloßen Leerzeichen', () => {
    expect(programmdateiAusUmgebung({})).toBeNull();
    expect(programmdateiAusUmgebung({ EM4ME_PROGRAMMDATEI: '' })).toBeNull();
    expect(programmdateiAusUmgebung({ EM4ME_PROGRAMMDATEI: '   ' })).toBeNull();
  });

  it('liefert den gesetzten Pfad ohne umgebende Leerzeichen', () => {
    expect(programmdateiAusUmgebung({ EM4ME_PROGRAMMDATEI: ' C:\\x\\EM4me.exe ' })).toBe(
      'C:\\x\\EM4me.exe',
    );
  });
});

describe('startParameter ohne Variable: Quellstand wie bisher', () => {
  it('startet mit `.` voran im Projekt-Ordner, mit eigenem Profil und Frische-Prüfung', () => {
    const env = { PATH: 'p', ANDERES: 'a' };
    const e = startParameter({
      env,
      appRoot: APP_ROOT,
      userData: USER_DATA,
      zusatzArgumente: ['doc.md'],
    });
    expect(e.launch).toEqual({
      args: ['.', 'doc.md'],
      cwd: APP_ROOT,
      env: { PATH: 'p', ANDERES: 'a', SCG_TEST_USER_DATA: USER_DATA },
    });
    expect(e.launch).not.toHaveProperty('executablePath');
    expect(e.buendelPruefen).toBe(true);
    expect(e.programmdatei).toBeNull();
  });

  it('behandelt einen leeren Wert wie eine fehlende Variable', () => {
    const e = startParameter({
      env: { EM4ME_PROGRAMMDATEI: '' },
      appRoot: APP_ROOT,
      userData: USER_DATA,
    });
    expect(e.launch.args).toEqual(['.']);
    expect(e.buendelPruefen).toBe(true);
  });

  it('ändert die übergebene Umgebung nicht', () => {
    const env = { PATH: 'p' };
    startParameter({ env, appRoot: APP_ROOT, userData: USER_DATA });
    expect(env).toEqual({ PATH: 'p' });
  });
});

describe('startParameter mit Variable: gebaute Programmdatei', () => {
  it('startet die Programmdatei ohne `.` und ohne Frische-Prüfung, mit eigenem Profil', () => {
    const e = startParameter({
      env: { EM4ME_PROGRAMMDATEI: programmdatei, PATH: 'p' },
      appRoot: APP_ROOT,
      userData: USER_DATA,
      zusatzArgumente: ['doc.md'],
    });
    expect(e.launch.executablePath).toBe(programmdatei);
    expect(e.launch.args).toEqual(['doc.md']);
    expect(e.launch.cwd).toBe(path.dirname(programmdatei));
    expect(e.launch.env.SCG_TEST_USER_DATA).toBe(USER_DATA);
    expect(e.launch.env.PATH).toBe('p');
    expect(e.buendelPruefen).toBe(false);
    expect(e.programmdatei).toBe(programmdatei);
  });

  it('weist einen relativen Pfad ab', () => {
    expect(() =>
      startParameter({
        env: { EM4ME_PROGRAMMDATEI: 'dist/win-unpacked/EM4me.exe' },
        appRoot: APP_ROOT,
        userData: USER_DATA,
      }),
    ).toThrow(/absoluten Pfad/);
  });

  it('weist einen Pfad ohne Datei ab', () => {
    expect(() =>
      startParameter({
        env: { EM4ME_PROGRAMMDATEI: path.join(ordner, 'fehlt.exe') },
        appRoot: APP_ROOT,
        userData: USER_DATA,
      }),
    ).toThrow(/keine Datei/);
    expect(() =>
      startParameter({
        env: { EM4ME_PROGRAMMDATEI: ordner },
        appRoot: APP_ROOT,
        userData: USER_DATA,
      }),
    ).toThrow(/keine Datei/);
  });
});
