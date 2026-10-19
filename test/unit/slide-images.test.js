// 4T-002292 (Epic 3E-000349): Der Erzeuger der Folien-Bilder
// (src/main/slide-images.js), Bild je Folie über ein Render-Fenster ohne
// Bildschirm.
//
// Gemessen am echten Modul mit einer Electron-Attrappe (Muster
// praesentation-fenster.test.js): BrowserWindow hält Optionen, Größe und
// Aufrufe fest; webContents führt eine Ablauf-Spur über Laden,
// Debugger-Befehle und Fertig-Skript; die Aufnahme liefert ein PNG in der
// Größe, die die Emulation verlangt. Zeitgeber kommen über das Deps-Objekt,
// damit das Zeitbudget ohne echte Wartezeit geprüft wird. Die Verdrahtung in
// main.js ist im Unit-Kontext nicht ladbar (Electron) und wird gegen den
// QUELLTEXT geprüft.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createFolienBilder,
  bildSchemaPrivilegien,
  renderOptionen,
  pruefeFolien,
  pngMasse,
  BILD_SCHEMA,
  BILD_SKALIERUNG,
  ZEITBUDGET_MS,
  INHALTS_REGEL,
  FERTIG_SKRIPT,
} = require('../../src/main/slide-images.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quelle = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');
const MODUL_QUELLE = quelle('src', 'main', 'slide-images.js');
const MAIN_QUELLE = quelle('src', 'main', 'main.js');

// Ein PNG-Kopf mit Signatur und IHDR; mehr liest das Modul nicht.
function png(breite, hoehe) {
  const kopf = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(kopf, 0);
  kopf.writeUInt32BE(13, 8);
  kopf.write('IHDR', 12, 'latin1');
  kopf.writeUInt32BE(breite, 16);
  kopf.writeUInt32BE(hoehe, 20);
  return kopf;
}

// Ein Ereignis-Träger nach Art von EventEmitter, knapp.
function traeger(ziel) {
  ziel.zuhoerer = new Map();
  ziel.on = vi.fn((name, fn) => {
    if (!ziel.zuhoerer.has(name)) ziel.zuhoerer.set(name, []);
    ziel.zuhoerer.get(name).push(fn);
    return ziel;
  });
  ziel.feuere = (name, ...args) => {
    for (const fn of [...(ziel.zuhoerer.get(name) || [])]) fn(...args);
  };
  return ziel;
}

const nie = () => new Promise(() => {});

// verhalten: { laden, fertig, aufnahme } je als Funktion (nr) => Promise.
function attrappe(verhalten = {}) {
  const erzeugt = [];
  const spur = [];
  const anfragen = [];
  const handler = new Map();
  const protocol = { handle: vi.fn((schema, fn) => handler.set(schema, fn)) };

  class BrowserWindow {
    constructor(optionen) {
      this.optionen = optionen;
      this.tot = false;
      this.groesse = [optionen.width, optionen.height];
      this.removeMenu = vi.fn();
      this.getContentSize = () => [...this.groesse];
      this.setContentSize = vi.fn((b, h) => {
        this.groesse = [b, h];
      });
      this.destroy = vi.fn(() => {
        this.tot = true;
      });
      this.close = vi.fn();
      let nr = 0;
      let emulation = null;
      const wc = traeger({});
      wc.setWindowOpenHandler = vi.fn((fn) => {
        wc.oeffnenHandler = fn;
      });
      wc.loadURL = vi.fn(async (adresse) => {
        nr += 1;
        spur.push(`laden ${nr}`);
        // Die Seite fragt ihr Dokument über das Schema an.
        const fn = handler.get(BILD_SCHEMA);
        if (fn) anfragen.push({ adresse, antwort: fn({ url: adresse, method: 'GET' }) });
        if (verhalten.laden) await verhalten.laden(nr);
      });
      wc.executeJavaScript = vi.fn(async (skript) => {
        spur.push(`fertig ${nr}`);
        expect(skript).toBe(FERTIG_SKRIPT);
        if (verhalten.fertig) await verhalten.fertig(nr);
        return true;
      });
      wc.debugger = {
        attach: vi.fn(() => spur.push('anhängen')),
        detach: vi.fn(() => spur.push('lösen')),
        sendCommand: vi.fn(async (befehl, werte) => {
          if (befehl === 'Emulation.setDeviceMetricsOverride') {
            emulation = werte;
            spur.push(`emulation ${werte.width}x${werte.height}@${werte.deviceScaleFactor}`);
            return {};
          }
          if (befehl === 'Page.captureScreenshot') {
            spur.push(`aufnahme ${nr}`);
            if (verhalten.aufnahme) return verhalten.aufnahme(nr, werte);
            const b = emulation.width * emulation.deviceScaleFactor;
            const h = emulation.height * emulation.deviceScaleFactor;
            return { data: png(b, h).toString('base64') };
          }
          throw new Error(`unbekannter Befehl ${befehl}`);
        }),
      };
      this.webContents = wc;
      erzeugt.push(this);
    }
    isDestroyed() {
      return this.tot;
    }
  }

  const timer = [];
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const bilder = createFolienBilder({
    BrowserWindow,
    protocol,
    logger,
    setTimer: (fn, ms) => {
      timer.push({ fn, ms });
      return timer.length;
    },
    clearTimer: vi.fn(),
  });
  bilder.registriereBildSchema();
  const schema = (url, method = 'GET') => handler.get(BILD_SCHEMA)({ url, method });
  return { bilder, erzeugt, spur, anfragen, protocol, schema, timer, logger };
}

const FOLIE_16_9 = { html: '<!doctype html><p>A</p>', breite: 1280, hoehe: 720 };
const FOLIE_4_3 = { html: '<!doctype html><p>B</p>', breite: 960, hoehe: 720 };

// Lässt die laufenden Mikro-Aufgaben und eine Runde der Ereignis-Schleife durch.
const ruhe = () => new Promise((r) => setImmediate(r));

// Erwartet den Ausgang eines Auftrags als Fehler und gibt ihn zurück.
async function fehlerVon(versprechen) {
  try {
    await versprechen;
  } catch (fehler) {
    return fehler;
  }
  throw new Error('Auftrag endete ohne Fehler');
}

describe('Fenster-Optionen und Navigations-Sperre (AK5)', () => {
  it('ohne Bildschirm, unsichtbar, ohne Rahmen, Sandbox, kein Node, kein Preload', () => {
    const o = renderOptionen(FOLIE_16_9);
    expect(o).toMatchObject({ show: false, frame: false, width: 1280, height: 720 });
    expect(o.webPreferences).toMatchObject({
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    });
    expect(o.webPreferences).not.toHaveProperty('preload');
  });

  it('ein Fenster je Auftrag, in Entwurfsgröße, ohne Menü', async () => {
    const { bilder, erzeugt } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9, FOLIE_16_9] });
    expect(erzeugt).toHaveLength(1);
    expect(erzeugt[0].optionen.webPreferences.offscreen).toBe(true);
    expect(erzeugt[0].removeMenu).toHaveBeenCalled();
    expect(erzeugt[0].getContentSize()).toEqual([1280, 720]);
  });

  it('window.open abgewiesen, Navigation aus der Seite abgewiesen', async () => {
    const { bilder, erzeugt } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] });
    const wc = erzeugt[0].webContents;
    expect(wc.oeffnenHandler({ url: 'https://example.org' })).toEqual({ action: 'deny' });
    const ereignis = { preventDefault: vi.fn() };
    wc.feuere('will-navigate', ereignis, 'https://example.org');
    expect(ereignis.preventDefault).toHaveBeenCalled();
  });

  it('nicht in Fenster-Liste, Persistenz und Zählung: kein Bezug zur Fenster-Verwaltung', () => {
    expect(MODUL_QUELLE).not.toMatch(/require\([^)]*window-manager/);
    expect(MODUL_QUELLE).not.toMatch(/require\([^)]*window-persistence/);
    expect(MODUL_QUELLE).not.toMatch(/\bwindows\.set\(|appRegistry|persistAllWindows/);
  });
});

describe('Ablauf je Folie (AK3)', () => {
  it('Laden, Skalierung, Fertig-Skript, Aufnahme, in der Reihenfolge der Folien', async () => {
    const { bilder, spur } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9] });
    expect(spur).toEqual([
      'laden 1',
      'anhängen',
      'emulation 1280x720@2',
      'fertig 1',
      'aufnahme 1',
      'laden 2',
      'emulation 1280x720@2',
      'fertig 2',
      'aufnahme 2',
      'lösen',
    ]);
  });

  it('die Fertig-Bedingung wartet zweistufig auf Schriften, Bilder und Zeichen-Durchläufe', () => {
    const schritte = FERTIG_SKRIPT.match(
      /document\.fonts\.ready|bild\.decode\(\)|await durchlauf\(\)/g,
    );
    expect(schritte).toEqual([
      'document.fonts.ready',
      'bild.decode()',
      'await durchlauf()',
      'await durchlauf()',
      'document.fonts.ready',
      'await durchlauf()',
    ]);
    expect(FERTIG_SKRIPT).toContain('requestAnimationFrame');
  });

  it('die Aufnahme bleibt im Bildausschnitt, als PNG', async () => {
    const { bilder, erzeugt } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] });
    const aufruf = erzeugt[0].webContents.debugger.sendCommand.mock.calls.find(
      ([befehl]) => befehl === 'Page.captureScreenshot',
    );
    expect(aufruf[1]).toEqual({ format: 'png', captureBeyondViewport: false });
  });

  it('eine Folie in anderer Größe setzt die Fenster-Größe neu', async () => {
    const { bilder, erzeugt } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_4_3] });
    expect(erzeugt[0].setContentSize).toHaveBeenCalledWith(960, 720);
    expect(erzeugt[0].setContentSize).not.toHaveBeenCalledWith(1280, 720);
  });
});

describe('Bild-Maße je Format (AK2)', () => {
  it('16:9 ergibt 2560 × 1440, 4:3 ergibt 1920 × 1440 Pixel', async () => {
    const { bilder } = attrappe();
    const [breit] = await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] });
    const [schmal] = await bilder.erzeugeFolienBilder({ folien: [FOLIE_4_3] });
    expect(pngMasse(breit)).toEqual({ breite: 2560, hoehe: 1440 });
    expect(pngMasse(schmal)).toEqual({ breite: 1920, hoehe: 1440 });
    expect(BILD_SKALIERUNG).toBe(2);
  });

  it('abweichende Maße beenden den Auftrag mit der Folien-Nummer', async () => {
    const { bilder, erzeugt } = attrappe({
      aufnahme: (nr) => ({
        data: png(nr === 2 ? 1280 : 2560, nr === 2 ? 720 : 1440).toString('base64'),
      }),
    });
    const fehler = await fehlerVon(
      bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9, FOLIE_16_9] }),
    );
    expect(fehler).toMatchObject({ grund: 'masse', folie: 2 });
    expect(fehler.message).toContain('1280x720 statt 2560x1440');
    expect(erzeugt[0].isDestroyed()).toBe(true);
  });

  it('eine Aufnahme ohne PNG ist ein Fehler, kein Bild', async () => {
    const { bilder } = attrappe({ aufnahme: () => ({ data: 'kein-png' }) });
    const fehler = await fehlerVon(bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] }));
    expect(fehler).toMatchObject({ grund: 'masse', folie: 1 });
  });

  it('pngMasse liest den Kopf und weist anderes ab', () => {
    expect(pngMasse(png(3, 4))).toEqual({ breite: 3, hoehe: 4 });
    expect(pngMasse(Buffer.from('GIF89a-und-noch-mehr-Bytes'))).toBe(null);
    expect(pngMasse('kein Puffer')).toBe(null);
  });
});

describe('Zeitbudget, Fehler und Abbruch (AK4)', () => {
  it('Vorgabe zehn Sekunden je Folie', async () => {
    const { bilder, timer } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9] });
    expect(ZEITBUDGET_MS).toBe(10000);
    expect(timer.map((t) => t.ms)).toEqual([10000, 10000]);
  });

  it('Überschreitung beendet den Auftrag mit der Folien-Nummer, Fenster geschlossen', async () => {
    const { bilder, erzeugt, timer, logger } = attrappe({
      fertig: (nr) => (nr === 3 ? nie() : undefined),
    });
    const lauf = fehlerVon(
      bilder.erzeugeFolienBilder({
        folien: [FOLIE_16_9, FOLIE_16_9, FOLIE_16_9],
        zeitbudgetMs: 500,
      }),
    );
    await ruhe();
    expect(timer).toHaveLength(3);
    expect(timer[2].ms).toBe(500);
    timer[2].fn();
    const fehler = await lauf;
    expect(fehler).toMatchObject({ grund: 'zeitbudget', folie: 3 });
    expect(fehler.message).toMatch(/^Folie 3: zeitbudget/);
    expect(erzeugt[0].isDestroyed()).toBe(true);
    expect(erzeugt[0].webContents.debugger.detach).toHaveBeenCalled();
    expect(bilder.offeneAuftraege()).toBe(0);
    expect(logger.error).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('ein Ladefehler nennt die Folie, keine Teil-Ergebnisse', async () => {
    const { bilder, erzeugt } = attrappe({
      laden: async (nr) => {
        if (nr === 2) throw Object.assign(new Error('nicht geladen'), { code: 'ERR_FAILED' });
      },
    });
    const fehler = await fehlerVon(
      bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9] }),
    );
    expect(fehler).toMatchObject({ grund: 'laden', folie: 2 });
    expect(fehler.message).toContain('ERR_FAILED');
    expect(fehler.cause.message).toBe('nicht geladen');
    expect(erzeugt[0].isDestroyed()).toBe(true);
  });

  it('das Abbruch-Signal beendet den laufenden Auftrag, Fenster geschlossen', async () => {
    const { bilder, erzeugt } = attrappe({ fertig: () => nie() });
    const steuerung = new AbortController();
    const lauf = fehlerVon(
      bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9], abbruch: steuerung.signal }),
    );
    await ruhe();
    steuerung.abort();
    const fehler = await lauf;
    expect(fehler).toMatchObject({ grund: 'abbruch', folie: 1 });
    expect(erzeugt[0].isDestroyed()).toBe(true);
    expect(bilder.offeneAuftraege()).toBe(0);
  });

  it('ein schon abgebrochenes Signal lädt keine Folie', async () => {
    const { bilder, erzeugt, spur } = attrappe();
    const steuerung = new AbortController();
    steuerung.abort();
    const fehler = await fehlerVon(
      bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9], abbruch: steuerung.signal }),
    );
    expect(fehler).toMatchObject({ grund: 'abbruch', folie: 1 });
    expect(spur).toEqual([]);
    expect(erzeugt[0].isDestroyed()).toBe(true);
  });

  it('ein Ausfall des Anzeige-Prozesses beendet den Auftrag mit der Folien-Nummer', async () => {
    const { bilder, erzeugt } = attrappe({ fertig: () => nie() });
    const lauf = fehlerVon(bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] }));
    await ruhe();
    erzeugt[0].webContents.feuere('render-process-gone', {}, { reason: 'crashed' });
    const fehler = await lauf;
    expect(fehler).toMatchObject({ grund: 'prozess', folie: 1 });
    expect(fehler.message).toContain('crashed');
    expect(erzeugt[0].isDestroyed()).toBe(true);
  });

  it('Erfolg: Fenster geschlossen, Debugger gelöst, ein Info-Eintrag mit Dauer je Folie', async () => {
    const { bilder, erzeugt, logger } = attrappe();
    const ergebnis = await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_16_9] });
    expect(ergebnis).toHaveLength(2);
    expect(ergebnis.every((b) => Buffer.isBuffer(b))).toBe(true);
    expect(erzeugt[0].isDestroyed()).toBe(true);
    expect(erzeugt[0].webContents.debugger.detach).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toMatch(/^Folien-Bilder: 2 Folien in \d+ ms \(je Folie/);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('ungültige Aufträge brechen laut ab, ohne Fenster', async () => {
    const { bilder, erzeugt } = attrappe();
    for (const auftrag of [
      undefined,
      { folien: [] },
      { folien: [{ html: 1, breite: 1280, hoehe: 720 }] },
      { folien: [{ ...FOLIE_16_9, breite: 12.5 }] },
      { folien: [FOLIE_16_9], skalierung: 0 },
      { folien: [FOLIE_16_9], zeitbudgetMs: -1 },
      { folien: [FOLIE_16_9], abbruch: {} },
    ]) {
      await expect(bilder.erzeugeFolienBilder(auftrag)).rejects.toThrow(TypeError);
    }
    expect(erzeugt).toHaveLength(0);
  });

  it('pruefeFolien übernimmt nur die bekannten Felder', () => {
    expect(pruefeFolien([{ ...FOLIE_16_9, fremd: 1 }])).toEqual([FOLIE_16_9]);
    expect(pruefeFolien('x')).toBe(null);
  });
});

describe('Ladeweg über das eigene Schema (AK5)', () => {
  it('Privilegien: Standard-Schema, sicher, ohne Fetch-Zugang', () => {
    expect(bildSchemaPrivilegien()).toEqual([
      {
        scheme: 'em4me-folie',
        privileges: { standard: true, secure: true, supportFetchAPI: false },
      },
    ]);
  });

  it('die Antwort trägt das Dokument unverändert und die Inhalts-Regel', async () => {
    const { bilder, anfragen } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9, FOLIE_4_3] });
    expect(anfragen).toHaveLength(2);
    const [erste, zweite] = anfragen;
    expect(erste.adresse).toMatch(/^em4me-folie:\/\/folie\/[0-9a-f-]{36}\/1$/);
    expect(erste.antwort.status).toBe(200);
    expect(erste.antwort.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(erste.antwort.headers.get('Content-Security-Policy')).toBe(INHALTS_REGEL);
    expect(await erste.antwort.text()).toBe(FOLIE_16_9.html);
    expect(await zweite.antwort.text()).toBe(FOLIE_4_3.html);
  });

  it('die Inhalts-Regel lässt Bilder und Schriften nur als Daten-Adresse zu, kein Skript', () => {
    expect(INHALTS_REGEL).toBe(
      "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'",
    );
    expect(INHALTS_REGEL).not.toMatch(/script-src/);
  });

  it('Unbekanntes und Beendetes ergibt 404', async () => {
    const { bilder, anfragen, schema } = attrappe();
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] });
    const adresse = anfragen[0].adresse;
    const kennung = adresse.split('/')[3];
    // Nach dem Auftrag ist sein Dokument nicht mehr abrufbar.
    expect(schema(adresse).status).toBe(404);
    expect(schema('em4me-folie://folie/00000000-0000-4000-8000-000000000000/1').status).toBe(404);
    expect(schema(`em4me-folie://anderes/${kennung}/1`).status).toBe(404);
    expect(schema('em4me-folie://folie/favicon.ico').status).toBe(404);
    expect(schema('kein url').status).toBe(404);
  });

  it('während des Auftrags: andere Methode, fremde Nummer und Anhang ergeben 404', async () => {
    let schemaVonAussen = null;
    let adresse = null;
    const { bilder, schema, anfragen } = attrappe({
      fertig: () => {
        adresse = anfragen[0].adresse;
        schemaVonAussen = {
          post: schema(adresse, 'POST').status,
          zwei: schema(adresse.replace(/\/1$/, '/2')).status,
          suche: schema(`${adresse}?x=1`).status,
          eins: schema(adresse).status,
        };
      },
    });
    await bilder.erzeugeFolienBilder({ folien: [FOLIE_16_9] });
    expect(schemaVonAussen).toEqual({ post: 404, zwei: 404, suche: 404, eins: 200 });
  });

  it('einmal registriert; ohne Registrierung kein Auftrag', async () => {
    const { bilder, protocol } = attrappe();
    expect(protocol.handle).toHaveBeenCalledTimes(1);
    expect(protocol.handle.mock.calls[0][0]).toBe('em4me-folie');
    expect(() => bilder.registriereBildSchema()).toThrow(/schon registriert/);
    const ohne = createFolienBilder({ BrowserWindow: class {}, protocol: { handle: vi.fn() } });
    await expect(ohne.erzeugeFolienBilder({ folien: [FOLIE_16_9] })).rejects.toThrow(
      /nicht registriert/,
    );
  });
});

describe('Lade-Zeit und Verdrahtung (AK6)', () => {
  it('das Modul lädt ohne Electron: nur Node-Kern und der Fenster-Erzeuger', () => {
    const requires = [...MODUL_QUELLE.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['node:crypto', './praesentation-fenster']);
    expect(MODUL_QUELLE).not.toMatch(/require\(['"]electron['"]\)/);
  });

  it('main.js meldet das Schema vor ready an und registriert den Ladeweg danach', () => {
    expect(MAIN_QUELLE).toMatch(/require\('\.\/slide-images'\)/);
    expect(MAIN_QUELLE).toMatch(
      /protocol\.registerSchemesAsPrivileged\(bildSchemaPrivilegien\(\)\)/,
    );
    expect(MAIN_QUELLE).toMatch(
      /app\.whenReady\(\)\.then\(\(\) => folienBilder\.registriereBildSchema\(\)\)/,
    );
    // Electron nimmt die Privilegien nur einmal an.
    expect(MAIN_QUELLE.match(/registerSchemesAsPrivileged\(/g)).toHaveLength(1);
  });
});
