// 4T-002510 (Epic 3E-000402): IPC-Kanal-Gruppe des Dashboards —
// `dashboard:filterWerte` und `dashboard:abfrageDatei`, dazu die Prüfung der
// Werte, die der Kanal `frontmatterQuery:run` seither als `params` annimmt.
//
// **Jeder Endpunkt ist eine Stelle der Prozess-Grenze** (Entwicklungsrichtlinien,
// Kapitel 6): Der Hauptprozess prüft Typ und Umfang jedes Parameters selbst und
// liest nichts, bevor der Pfad des aufrufenden Dokuments innerhalb der Grenze
// liegt. Die Grenze ist die des Fensters: die Bereichs-Wurzel, ohne gebundenen
// Bereich der Ordner des Dokuments (`containmentWurzel`, dieselbe Regel wie bei
// der Einbettung). Eine Abweisung trägt keinen Inhalt.
//
// **Aktiv nur bei eingeschaltetem Schalter `dashboard`.** Im Aus-Zustand
// erscheint der Block als Quelltext (Konzept-Stufe 4T-002506, Abschnitt 3.5),
// also fragt ihn niemand an; ein Aufruf dennoch wird abgewiesen.
//
// Eigener Zustand: keiner; Index und Einstellungs-Speicher kommen als Deps.
'use strict';

const path = require('node:path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { DASHBOARD_EXTENSION_ID } = require('../../shared/dashboard/dashboard-core.js');
const { isInsideArea } = require('../area/area-path.js');
const { filterWerte, abfrageDatei } = require('../index/dashboard-quellen.js');

// Grenzen gegen einen fehlgeformten Aufruf; kein echter Wert reicht an sie heran.
const MAX_PFAD_LAENGE = 4096;
const MAX_NAME_LAENGE = 200;
// Grenzen der Filter-Werte am Abfrage-Kanal (Konzept-Stufe, Abschnitt 3.4).
const MAX_PARAMS = 20;
const MAX_PARAM_WERT = 500;

// Antwort jeder Abweisung: ohne Pfad, ohne Inhalt, ohne Hinweis auf den Grund
// jenseits des Codes.
const ABGEWIESEN = Object.freeze({ ok: false, code: 'abgewiesen' });

function istText(wert, max) {
  return typeof wert === 'string' && wert.trim() !== '' && wert.length <= max;
}

function istEinfachesObjekt(wert) {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false;
  const proto = Object.getPrototypeOf(wert);
  return proto === Object.prototype || proto === null;
}

/**
 * Prüft die Werte der Filter, die eine Abfrage als Platzhalter bindet.
 *
 * Gültig ist ein einfaches Objekt mit höchstens 20 Namen, je Wert eine
 * Zeichenkette bis 500 Zeichen oder `null` («alle»). Fehlen die Werte ganz
 * (`undefined`), ist das gültig: Eine Abfrage ohne Dashboard trägt keine.
 *
 * @param {unknown} werte Die `params` des Aufrufs.
 * @returns {boolean} true, wenn die Werte unverändert weitergereicht werden dürfen.
 */
function pruefeAbfrageParams(werte) {
  if (werte === undefined) return true;
  if (!istEinfachesObjekt(werte)) return false;
  const namen = Object.keys(werte);
  if (namen.length > MAX_PARAMS) return false;
  return namen.every((n) => {
    const v = werte[n];
    return v === null || (typeof v === 'string' && v.length <= MAX_PARAM_WERT);
  });
}

/**
 * Ist der Schalter `dashboard` an? Seit 4T-002513 steht die Erweiterung im
 * Manifest, und die Registry trägt den Schalter allein; die Zusatz-Prüfung der
 * rohen Liste aus der Zeit davor ist zurückgebaut.
 *
 * @param {object|null} store Einstellungs-Speicher.
 * @returns {boolean}
 */
function dashboardAn(store) {
  const aus = store ? store.get('extensions.disabled') : [];
  return isExtensionEnabled(DASHBOARD_EXTENSION_ID, aus);
}

/**
 * Liegt der Dokument-Pfad innerhalb der Grenze des Fensters?
 *
 * @param {string} filePath Absoluter Pfad des aufrufenden Dokuments.
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters.
 * @returns {boolean}
 */
function imBereich(filePath, areaRoot) {
  if (!path.isAbsolute(filePath)) return false;
  // Ohne gebundenen Bereich ist das Dokument selbst der Bezug, und die Grenze
  // seines Ziels ist sein Ordner (`containmentWurzel` im Auflöser).
  if (typeof areaRoot !== 'string' || !areaRoot) return true;
  return isInsideArea(areaRoot, filePath);
}

/**
 * Registriert die Kanäle des Dashboards.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(event: object) => string|null} deps.areaRootForEvent Bereichs-Wurzel der Anfrage.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher.
 * @param {object} deps.backlinks Bereichs-Index samt seiner Sichten.
 * @param {Function} deps.resolveQueryTemplatesFolder Vorlagen-Ordner, den eine Abfrage ausschließt.
 * @param {number} deps.MAX_EMBED_BYTES Größen-Grenze des Lesens eines Dokuments.
 */
function registerDashboardIpc(handle, deps) {
  const {
    senderWindow,
    areaRootForEvent,
    getStore,
    backlinks,
    resolveQueryTemplatesFolder,
    MAX_EMBED_BYTES,
  } = deps;

  // Gemeinsame Vorprüfung beider Kanäle: Schalter, Pfad-Form, Grenze.
  function vorpruefung(event, filePath) {
    if (!dashboardAn(getStore())) return null;
    if (!istText(filePath, MAX_PFAD_LAENGE)) return null;
    const areaRoot = areaRootForEvent(event);
    if (!imBereich(filePath, areaRoot)) return null;
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return { areaRoot };
  }

  // Die im Bereich vergebenen Werte einer Kopf-Eigenschaft (Story 4S-001186).
  // Antwort { status, values, wurzel? } oder die Abweisung.
  handle('dashboard:filterWerte', async (event, params) => {
    const filePath = params && params.filePath;
    const eigenschaft = params && params.eigenschaft;
    if (!istText(eigenschaft, MAX_NAME_LAENGE)) return ABGEWIESEN;
    const ok = vorpruefung(event, filePath);
    if (!ok) return ABGEWIESEN;
    const templatesFolder = await resolveQueryTemplatesFolder(senderWindow(event));
    return filterWerte(filePath, eigenschaft, ok.areaRoot, templatesFolder);
  });

  // Ziel einer Kachel mit Abfrage-Datei (Story 4S-001183). Antwort
  // { ok: true, pfad, abfrage, quelle } oder { ok: false, code, name } mit
  // einem der fünf Codes aus dashboard-quellen.js, oder die Abweisung.
  handle('dashboard:abfrageDatei', async (event, params) => {
    const basePath = params && params.basePath;
    const ziel = params && params.ziel;
    if (!istText(ziel, MAX_PFAD_LAENGE)) return ABGEWIESEN;
    const ok = vorpruefung(event, basePath);
    if (!ok) return ABGEWIESEN;
    return abfrageDatei({ basePath, ziel, areaRoot: ok.areaRoot, maxBytes: MAX_EMBED_BYTES });
  });
}

module.exports = {
  registerDashboardIpc,
  pruefeAbfrageParams,
  dashboardAn,
  imBereich,
  MAX_PARAMS,
  MAX_PARAM_WERT,
};
