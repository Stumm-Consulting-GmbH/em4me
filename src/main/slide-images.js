// 4T-002292 (Epic 3E-000349): Bild je Folie über ein Render-Fenster ohne
// Bildschirm (Entscheidung B1 des Product Owners vom 2026-10-17: unsichtbares
// Render-Fenster). Die PowerPoint-Datei und der Bilder-Export der Stufe 3
// zeigen jede Folie als PNG in doppelter Entwurfsgröße; dieses Modul wandelt
// die eigenständigen Folien-Dokumente aus `baueFolienDokument`
// (src/renderer/modules/views/folien-export.js) in diese Bilder.
//
// **Warum diese Form** (Nachweis an der realen Konstellation, Sonde vom
// 2026-10-17 unter Tests/4T-002292/, Lösungs-Kapitel des Tasks):
//
// - Das Fenster zeichnet ohne Bildschirm (`webPreferences.offscreen: true`).
//   Ein bloß verborgenes Fenster blieb unter Windows und Linux sporadisch
//   hängen, auch mit `backgroundThrottling: false` und
//   `paintWhenInitiallyHidden`; ohne Bildschirm gab es keinen Ausfall.
// - Die doppelte Auflösung kommt aus dem Debugger-Protokoll
//   (`Emulation.setDeviceMetricsOverride`, `Page.captureScreenshot`), nicht
//   aus dem Zoom: Der Zoom gilt in Chromium je Adresse, wirkt auf jedes andere
//   Fenster derselben Adresse und bleibt im Profil gespeichert.
// - Das Dokument wird nicht als Datei geschrieben, sondern über ein eigenes
//   Schema aus dem Speicher geliefert. Die Antwort trägt die Inhalts-Regel
//   des Fensters, weil das Dokument selbst keine trägt; das Dokument bleibt
//   unverändert. Die Seite hat weder Skript noch Preload; die Fertig-Bedingung
//   läuft über `executeJavaScript`.
//
// **Lebenszyklus:** je Export-Auftrag genau ein Fenster, die Folien
// nacheinander. Das Fenster wird in jedem Ausgang zerstört (Erfolg, Fehler,
// Zeitüberschreitung, Abbruch). Es entsteht hier und nicht in der
// Fenster-Verwaltung und fehlt deshalb in Fenster-Liste, Sitzungs-Persistenz
// und Fenster-Zählung von selbst.
//
// Zur Lade-Zeit electron-frei: Electron-Klassen und Uhr kommen über das
// Deps-Objekt (Muster praesentation-fenster.js), damit die Prüfdatei das
// Modul mit Attrappen messen kann.
'use strict';

const crypto = require('node:crypto');
const { FOLIE_MAX_ZEICHEN } = require('./praesentation-fenster');

/** Das Schema des Ladewegs; nur für den Export registriert. */
const BILD_SCHEMA = 'em4me-folie';

/** Host-Teil der Adressen: `em4me-folie://folie/<Auftrag>/<Folien-Nummer>`. */
const BILD_HOST = 'folie';

/** Vorgabe der Skalierung: doppelte Entwurfsgröße (2560 × 1440 bei 16:9). */
const BILD_SKALIERUNG = 2;

/** Vorgabe des Zeitbudgets je Folie, von Ladebeginn bis zum fertigen Bild. */
const ZEITBUDGET_MS = 10000;

/**
 * Die Inhalts-Regel der Folien-Seite: Bilder und Schriften nur als
 * Daten-Adresse (wie Anzeige- und Publikums-Fenster), eingebettete Stile,
 * sonst nichts, auch kein Skript.
 */
const INHALTS_REGEL =
  "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";

/**
 * Fertig-Bedingung der Seite, zweistufig: Schriften, jedes Bild decodiert,
 * zwei Zeichen-Durchläufe, danach erneut die Schriften und ein dritter
 * Durchlauf. Unter Linux fehlten in einem von elf Sonden-Läufen Zeichen der
 * Formel nach der einstufigen Bedingung; Schriften, die erst das Layout des
 * ersten Durchlaufs anfordert, fängt die zweite Stufe.
 */
const FERTIG_SKRIPT = `(async () => {
  const durchlauf = () => new Promise((fertig) => requestAnimationFrame(() => fertig()));
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (bild) => bild.decode().catch(() => null)));
  await durchlauf();
  await durchlauf();
  await document.fonts.ready;
  await durchlauf();
  return true;
})()`;

const ADRESS_PFAD =
  /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([1-9]\d{0,5})$/;

/**
 * Die Privilegien des Schemas für `protocol.registerSchemesAsPrivileged`.
 * Electron nimmt diesen Aufruf nur einmal und nur vor dem ready-Ereignis an;
 * kommt ein weiteres Schema hinzu, gehört es in dieselbe Liste.
 *
 * @returns {Array<{scheme: string, privileges: object}>}
 */
function bildSchemaPrivilegien() {
  return [
    {
      scheme: BILD_SCHEMA,
      privileges: { standard: true, secure: true, supportFetchAPI: false },
    },
  ];
}

/**
 * Die Optionen des Render-Fensters: ohne Bildschirm, ohne Rahmen, ohne
 * Preload, ohne Node, mit Sandbox.
 *
 * @param {{breite: number, hoehe: number}} folie die erste Folie (Entwurfsgröße).
 * @returns {object}
 */
function renderOptionen({ breite, hoehe }) {
  return {
    show: false,
    frame: false,
    width: breite,
    height: hoehe,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  };
}

/**
 * Prüft die Folien eines Auftrags: nicht leer, je ein HTML-Dokument in der
 * Größen-Grenze des Publikums-Fensters und eine ganzzahlige Entwurfsgröße.
 *
 * @param {unknown} folien
 * @returns {Array<{html: string, breite: number, hoehe: number}>|null}
 */
function pruefeFolien(folien) {
  if (!Array.isArray(folien) || folien.length === 0) return null;
  const geprueft = [];
  for (const folie of folien) {
    if (!folie || typeof folie !== 'object') return null;
    const { html, breite, hoehe } = folie;
    if (typeof html !== 'string' || html.length > FOLIE_MAX_ZEICHEN) return null;
    if (!Number.isInteger(breite) || breite < 1 || !Number.isInteger(hoehe) || hoehe < 1) {
      return null;
    }
    geprueft.push({ html, breite, hoehe });
  }
  return geprueft;
}

/**
 * Breite und Höhe eines PNG aus dem Kopf-Abschnitt (IHDR), ohne Bild-Bibliothek.
 *
 * @param {Buffer} png
 * @returns {{breite: number, hoehe: number}|null} null, wenn es kein PNG ist.
 */
function pngMasse(png) {
  const SIGNATUR = '89504e470d0a1a0a';
  if (!Buffer.isBuffer(png) || png.length < 24) return null;
  if (png.subarray(0, 8).toString('hex') !== SIGNATUR) return null;
  if (png.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { breite: png.readUInt32BE(16), hoehe: png.readUInt32BE(20) };
}

/**
 * Ein Fehler des Exports, der die Folie nennt (1-basiert).
 *
 * @param {'zeitbudget'|'abbruch'|'laden'|'aufnahme'|'masse'|'prozess'} grund
 * @param {number} folie Folien-Nummer, 1-basiert.
 * @param {string} [zusatz]
 * @param {unknown} [ursache]
 * @returns {Error & {grund: string, folie: number}}
 */
function folienFehler(grund, folie, zusatz, ursache) {
  const text = `Folie ${folie}: ${grund}${zusatz ? ` (${zusatz})` : ''}`;
  const fehler = ursache === undefined ? new Error(text) : new Error(text, { cause: ursache });
  fehler.grund = grund;
  fehler.folie = folie;
  return fehler;
}

/**
 * Baut den Erzeuger der Folien-Bilder.
 *
 * @param {object} deps
 * @param {Function} deps.BrowserWindow Electron-Klasse.
 * @param {object} deps.protocol Electron-Modul `protocol` (handle).
 * @param {Function} [deps.Response] Antwort-Klasse; Vorgabe die der Laufzeit.
 * @param {() => number} [deps.jetzt] Uhr in Millisekunden.
 * @param {Function} [deps.setTimer] Vorgabe setTimeout.
 * @param {Function} [deps.clearTimer] Vorgabe clearTimeout.
 * @param {{info: Function, warn: Function, error: Function}} [deps.logger] Vorgabe console.
 * @returns {{registriereBildSchema: Function, erzeugeFolienBilder: Function, offeneAuftraege: Function}}
 */
function createFolienBilder(deps) {
  const {
    BrowserWindow,
    protocol,
    Response = globalThis.Response,
    jetzt = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    logger = console,
  } = deps;

  // Auftrags-Kennung -> geprüfte Folien; nur während eines laufenden Exports.
  const auftraege = new Map();
  let registriert = false;

  function nichtGefunden() {
    return new Response('', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  /**
   * Beantwortet eine Anfrage an das Schema: das HTML der angeforderten Folie
   * des laufenden Auftrags mit der Inhalts-Regel, sonst 404.
   *
   * @param {{url: string, method?: string}} anfrage
   * @returns {Response}
   */
  function beantworte(anfrage) {
    let adresse;
    try {
      adresse = new URL(anfrage.url);
    } catch {
      // Eine unlesbare Adresse ist keine Folie; die Antwort ist 404.
      return nichtGefunden();
    }
    const methode = anfrage.method || 'GET';
    const treffer = ADRESS_PFAD.exec(adresse.pathname);
    if (methode !== 'GET' || adresse.host !== BILD_HOST || adresse.search || !treffer) {
      return nichtGefunden();
    }
    const folien = auftraege.get(treffer[1]);
    const folie = folien ? folien[Number(treffer[2]) - 1] : undefined;
    if (!folie) return nichtGefunden();
    return new Response(folie.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': INHALTS_REGEL,
        'Cache-Control': 'no-store',
      },
    });
  }

  /** Registriert den Ladeweg; einmal nach dem ready-Ereignis. */
  function registriereBildSchema() {
    if (registriert) throw new Error(`Schema ${BILD_SCHEMA} ist schon registriert`);
    protocol.handle(BILD_SCHEMA, beantworte);
    registriert = true;
  }

  // Eine Folien-Arbeit gegen Zeitbudget, Abbruch-Signal und Ausfall des
  // Anzeige-Prozesses. Die verlorene Arbeit läuft weiter, bis das Fenster
  // zerstört ist; ihr spätes Ergebnis oder ihr später Fehler wird verworfen.
  function mitBudget(arbeit, { ms, nr, abbruch, stoerung }) {
    return new Promise((erfuellt, verworfen) => {
      let erledigt = false;
      let timer = null;
      const beiAbbruch = () => ende(verworfen, folienFehler('abbruch', nr));
      function ende(weiter, wert) {
        if (erledigt) return;
        erledigt = true;
        clearTimer(timer);
        stoerung.melde = null;
        if (abbruch) abbruch.removeEventListener('abort', beiAbbruch);
        weiter(wert);
      }
      if (abbruch && abbruch.aborted) {
        beiAbbruch();
        return;
      }
      timer = setTimer(() => ende(verworfen, folienFehler('zeitbudget', nr, `${ms} ms`)), ms);
      if (abbruch) abbruch.addEventListener('abort', beiAbbruch, { once: true });
      stoerung.melde = (grund) => ende(verworfen, folienFehler('prozess', nr, grund));
      arbeit().then(
        (wert) => ende(erfuellt, wert),
        (fehler) => ende(verworfen, fehler),
      );
    });
  }

  // Eine Folie: Laden, Skalierung setzen, Fertig-Bedingung, Aufnahme, Maße.
  async function nimmFolieAuf(win, sitzung, { kennung, nr, folie, skalierung }) {
    const wc = win.webContents;
    const [breite, hoehe] = win.getContentSize();
    if (breite !== folie.breite || hoehe !== folie.hoehe) {
      win.setContentSize(folie.breite, folie.hoehe);
    }
    try {
      await wc.loadURL(`${BILD_SCHEMA}://${BILD_HOST}/${kennung}/${nr}`);
    } catch (fehler) {
      throw folienFehler('laden', nr, fehler && fehler.code, fehler);
    }
    // Angehängt erst nach dem ersten Laden, wie in der Sonde gemessen.
    if (!sitzung.angehaengt) {
      wc.debugger.attach('1.3');
      sitzung.angehaengt = true;
    }
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: folie.breite,
      height: folie.hoehe,
      deviceScaleFactor: skalierung,
      mobile: false,
    });
    await wc.executeJavaScript(FERTIG_SKRIPT);
    const antwort = await wc.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    if (!antwort || typeof antwort.data !== 'string') throw folienFehler('aufnahme', nr);
    const png = Buffer.from(antwort.data, 'base64');
    const masse = pngMasse(png);
    const sollBreite = folie.breite * skalierung;
    const sollHoehe = folie.hoehe * skalierung;
    if (!masse || masse.breite !== sollBreite || masse.hoehe !== sollHoehe) {
      const ist = masse ? `${masse.breite}x${masse.hoehe}` : 'kein PNG';
      throw folienFehler('masse', nr, `${ist} statt ${sollBreite}x${sollHoehe}`);
    }
    return png;
  }

  /**
   * Erzeugt je Folie ein PNG, in der Reihenfolge der Folien. Ein Fehler bei
   * einer Folie beendet den ganzen Auftrag; Teil-Ergebnisse gibt es nicht.
   *
   * @param {object} auftrag
   * @param {Array<{html: string, breite: number, hoehe: number}>} auftrag.folien
   *   die Dokumente aus `baueFolienDokument`.
   * @param {number} [auftrag.skalierung] Vorgabe 2.
   * @param {number} [auftrag.zeitbudgetMs] je Folie, Vorgabe 10 000.
   * @param {AbortSignal} [auftrag.abbruch] bricht den Auftrag ab.
   * @returns {Promise<Buffer[]>} wirft einen Fehler mit `folie` (1-basiert) und `grund`.
   */
  async function erzeugeFolienBilder(auftrag) {
    const {
      folien,
      skalierung = BILD_SKALIERUNG,
      zeitbudgetMs = ZEITBUDGET_MS,
      abbruch,
    } = auftrag || {};
    const geprueft = pruefeFolien(folien);
    if (!geprueft) throw new TypeError('Folien-Bilder: ungültige Folien');
    if (!Number.isInteger(skalierung) || skalierung < 1 || skalierung > 4) {
      throw new TypeError('Folien-Bilder: ungültige Skalierung');
    }
    if (!Number.isFinite(zeitbudgetMs) || zeitbudgetMs <= 0) {
      throw new TypeError('Folien-Bilder: ungültiges Zeitbudget');
    }
    if (abbruch != null && typeof abbruch.addEventListener !== 'function') {
      throw new TypeError('Folien-Bilder: ungültiges Abbruch-Signal');
    }
    if (!registriert) throw new Error(`Folien-Bilder: Schema ${BILD_SCHEMA} nicht registriert`);

    const kennung = crypto.randomUUID();
    const beginn = jetzt();
    const dauern = [];
    const stoerung = { melde: null };
    const sitzung = { angehaengt: false };
    auftraege.set(kennung, geprueft);
    const win = new BrowserWindow(renderOptionen(geprueft[0]));
    try {
      win.removeMenu();
      const wc = win.webContents;
      // Navigation gesperrt: kein window.open, keine Navigation aus der Seite.
      // Das Laden über loadURL löst will-navigate nicht aus.
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (ereignis) => ereignis.preventDefault());
      wc.on('render-process-gone', (_ereignis, details) => {
        if (stoerung.melde) stoerung.melde(details && details.reason);
      });
      const bilder = [];
      for (let i = 0; i < geprueft.length; i += 1) {
        const nr = i + 1;
        const start = jetzt();
        const angaben = { kennung, nr, folie: geprueft[i], skalierung };
        bilder.push(
          await mitBudget(() => nimmFolieAuf(win, sitzung, angaben), {
            ms: zeitbudgetMs,
            nr,
            abbruch,
            stoerung,
          }),
        );
        dauern.push(jetzt() - start);
      }
      logger.info(
        `Folien-Bilder: ${bilder.length} Folien in ${jetzt() - beginn} ms (je Folie ${dauern.join(', ')} ms)`,
      );
      return bilder;
    } catch (fehler) {
      logger.error(`Folien-Bilder: Export nach ${jetzt() - beginn} ms abgebrochen`, fehler);
      throw fehler;
    } finally {
      auftraege.delete(kennung);
      if (sitzung.angehaengt && !win.isDestroyed()) {
        try {
          win.webContents.debugger.detach();
        } catch (fehler) {
          // Der Debugger hängt nach einem Ausfall des Anzeige-Prozesses nicht
          // mehr; das Fenster wird gleich danach ohnehin zerstört.
          logger.warn('Folien-Bilder: Debugger nicht gelöst', fehler);
        }
      }
      if (!win.isDestroyed()) win.destroy();
    }
  }

  /** Zahl der laufenden Aufträge (für Prüfungen). */
  function offeneAuftraege() {
    return auftraege.size;
  }

  return { registriereBildSchema, erzeugeFolienBilder, offeneAuftraege };
}

module.exports = {
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
};
