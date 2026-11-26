// 4T-002650 (Epic 3E-000416): Die Erlaubnisse der externen Add-ons im
// Hauptprozess: Bestätigung, Einschalten und letzter Fehler.
//
// **Wozu.** Bis hierher zeigte der Hauptprozess die Warn-Bestätigung eines
// fremden Add-ons, gespeichert und geprüft wurde sie aber im Fenster, und den
// Code eines Pakets lieferte der Hauptprozess ohne Prüfung aus (Konzept-Stufe
// 4T-002645, Befund 7, Nachweis N10). Jetzt schreibt allein der Hauptprozess
// die drei Schlüssel, und jede Prüfung der Bestätigung läuft über
// `trustHolds`; das Fenster kann sie über den allgemeinen Einstellungs-Weg
// nicht mehr setzen (Klasse 2 in `app/settings-classes.js`).
//
// **Die eine Prüfung.** `trustHolds` beantwortet, ob die gespeicherte
// Bestätigung für das vorliegende Paket gilt. Sie trägt die Bestätigung,
// das Einschalten, die Auslieferung von Code und Einstiegs-Adresse und den
// Status für die Anzeige. Der Datei-Zugriff für Add-ons (Epic 3E-000213)
// bindet die Bestätigung zusätzlich an den Inhalt des Pakets; er erweitert
// dafür diese Funktion und `recordTrust`, nicht ihre Aufrufer.
//
// **Format im Speicher unverändert.** `extensionsExternal.trusted` bleibt
// `{ id: version }`, `extensionsExternal.enabled` eine Liste von Kennungen,
// `extensionsExternal.lastError` `{ id: text }`. Bestehende Einträge gelten
// deshalb beim ersten Start der neuen Fassung weiter, ohne Nachfrage.
//
// **Mitgeliefert.** Ein mitgeliefertes Add-on braucht keine Bestätigung
// (Anforderung 4S-001205). Mitgelieferte Pakete gibt es im Bestand noch nicht;
// `isBundledPackage` antwortet deshalb immer mit `false` und ist die Stelle,
// an der die Erkennung später ansetzt.
//
// Electron-frei; eigener Zustand: keiner. Der Speicher kommt als Parameter.
'use strict';

const {
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ERRORS_KEY,
  EXTENSION_ID_RE,
  normalizeEnabledIds,
  normalizeTrustedMap,
  normalizeErrorMap,
} = require('../../shared/extensions/extensions-external');

// Höchstlänge des gespeicherten Fehlertexts; der Text kommt aus dem Fenster.
const MAX_ERROR_TEXT = 500;

/**
 * Ist das eine gültige Kennung eines Add-ons?
 *
 * @param {*} id
 * @returns {boolean}
 */
function isExtensionId(id) {
  return typeof id === 'string' && EXTENSION_ID_RE.test(id);
}

/**
 * Die drei Erlaubnis-Schlüssel aus dem Speicher, in bereinigter Form.
 *
 * @param {{get: (key: string) => *}|null} store Einstellungs-Speicher.
 * @returns {{enabled: string[], trusted: Object<string, string>, errors: Object<string, string>}}
 */
function readPermissions(store) {
  return {
    enabled: normalizeEnabledIds(store ? store.get(EXTERNAL_ENABLED_KEY) : undefined),
    trusted: normalizeTrustedMap(store ? store.get(EXTERNAL_TRUSTED_KEY) : undefined),
    errors: normalizeErrorMap(store ? store.get(EXTERNAL_ERRORS_KEY) : undefined),
  };
}

/**
 * Gilt die gespeicherte Bestätigung für dieses Paket? Die eine Stelle der
 * Prüfung; heute gebunden an Kennung und Version.
 *
 * @param {Object<string, string>} trusted Bestätigungen aus `readPermissions`.
 * @param {{id: string, version: string}} pkg Paket aus dem letzten Scan.
 * @returns {boolean}
 */
function trustHolds(trusted, pkg) {
  if (!pkg || !isExtensionId(pkg.id) || typeof pkg.version !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(trusted, pkg.id) && trusted[pkg.id] === pkg.version;
}

/**
 * Ist das Paket mitgeliefert? Im Bestand gibt es noch keine mitgelieferten
 * Pakete (Anforderung 4S-001205); die Antwort ist deshalb immer `false`.
 *
 * @param {{id: string, version: string, dir?: string}} _pkg
 * @returns {boolean}
 */
function isBundledPackage(_pkg) {
  return false;
}

/**
 * Darf der Hauptprozess Code und Einstiegs-Adresse des Pakets ausliefern?
 * Nur wenn es eingeschaltet und bestätigt oder mitgeliefert ist.
 *
 * @param {ReturnType<typeof readPermissions>} perms
 * @param {{id: string, version: string}} pkg
 * @param {boolean} bundled Ergebnis von `isBundledPackage`.
 * @returns {boolean}
 */
function mayDeliver(perms, pkg, bundled) {
  if (!pkg || !perms.enabled.includes(pkg.id)) return false;
  return bundled === true || trustHolds(perms.trusted, pkg);
}

/**
 * Scan-Einträge für das Fenster: je gültigem Paket, ob die Bestätigung gilt
 * und ob es mitgeliefert ist; die Einstiegs-Adresse nur, wenn `mayDeliver`.
 *
 * @param {object[]} entries Ergebnis von `scanExtensionsRoot`.
 * @param {ReturnType<typeof readPermissions>} perms
 * @param {(pkg: object) => boolean} isBundled
 * @returns {object[]}
 */
function entriesForWindow(entries, perms, isBundled) {
  return entries.map((entry) => {
    if (!entry || entry.ok !== true) return entry;
    const pkg = { id: entry.manifest.id, version: entry.manifest.version, dir: entry.dir };
    const bundled = isBundled(pkg) === true;
    return {
      ...entry,
      bundled,
      trusted: bundled || trustHolds(perms.trusted, pkg),
      entryUrl: mayDeliver(perms, pkg, bundled) ? entry.entryUrl : null,
    };
  });
}

/**
 * Speichert die Bestätigung für dieses Paket (nach «Ja» im Dialog).
 *
 * @param {{get: Function, set: Function}} store
 * @param {{id: string, version: string}} pkg
 */
function recordTrust(store, pkg) {
  const trusted = readPermissions(store).trusted;
  store.set(EXTERNAL_TRUSTED_KEY, { ...trusted, [pkg.id]: pkg.version });
}

/**
 * Schaltet ein Add-on ein oder aus. Einschalten nimmt den letzten Fehler
 * zurück. Die Prüfung der Bestätigung liegt beim Aufrufer.
 *
 * @param {{get: Function, set: Function}} store
 * @param {string} id
 * @param {boolean} on
 * @returns {string[]} Die neue Liste der eingeschalteten Kennungen.
 */
function setEnabled(store, id, on) {
  const perms = readPermissions(store);
  if (on && Object.prototype.hasOwnProperty.call(perms.errors, id)) {
    const errors = { ...perms.errors };
    delete errors[id];
    store.set(EXTERNAL_ERRORS_KEY, errors);
  }
  const without = perms.enabled.filter((x) => x !== id);
  const enabled = on ? [...without, id] : without;
  store.set(EXTERNAL_ENABLED_KEY, enabled);
  return enabled;
}

/**
 * Kürzt einen Fehlertext auf die gespeicherte Höchstlänge.
 *
 * @param {string} text
 * @returns {string}
 */
function limitErrorText(text) {
  return text.length > MAX_ERROR_TEXT ? text.slice(0, MAX_ERROR_TEXT) : text;
}

/**
 * Hält den letzten Fehler eines Add-ons fest und schaltet es aus.
 *
 * @param {{get: Function, set: Function}} store
 * @param {string} id
 * @param {string} text Nicht leerer Fehlertext aus dem Fenster.
 * @returns {string[]} Die neue Liste der eingeschalteten Kennungen.
 */
function recordError(store, id, text) {
  const errors = readPermissions(store).errors;
  store.set(EXTERNAL_ERRORS_KEY, { ...errors, [id]: limitErrorText(text) });
  return setEnabled(store, id, false);
}

/**
 * Entfernt alle Erlaubnisse eines Add-ons (nach dem Entfernen seines Ordners).
 *
 * @param {{get: Function, set: Function}} store
 * @param {string} id
 * @returns {string[]} Die neue Liste der eingeschalteten Kennungen.
 */
function forgetPackage(store, id) {
  const perms = readPermissions(store);
  if (Object.prototype.hasOwnProperty.call(perms.trusted, id)) {
    const trusted = { ...perms.trusted };
    delete trusted[id];
    store.set(EXTERNAL_TRUSTED_KEY, trusted);
  }
  if (Object.prototype.hasOwnProperty.call(perms.errors, id)) {
    const errors = { ...perms.errors };
    delete errors[id];
    store.set(EXTERNAL_ERRORS_KEY, errors);
  }
  return setEnabled(store, id, false);
}

module.exports = {
  MAX_ERROR_TEXT,
  isExtensionId,
  readPermissions,
  trustHolds,
  isBundledPackage,
  mayDeliver,
  entriesForWindow,
  recordTrust,
  setEnabled,
  limitErrorText,
  recordError,
  forgetPackage,
};
