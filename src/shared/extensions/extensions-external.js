// 4T-0299 (Epic 3E-0053): Externe Erweiterungen — Manifest-Modell,
// API-Versionierung und Store-Schlüssel.
//
// Prozessneutral (CJS, reine Daten und reine Funktionen, kein Electron,
// kein DOM): Main (Verzeichnis-Scan validiert Manifeste), Preload
// (Markdown-Plugin-Loader) und Renderer (Host, Einstellungs-Bereich)
// lesen dasselbe Modul — Muster src/shared/extensions/extensions.js.
//
// Manifest-Schema (manifest.json im Verzeichnis
// <userData>/extensions/<id>/):
//   id             Pflicht. Stabile Kennung (kebab-case), muss dem
//                  Verzeichnisnamen entsprechen (Pfad-Bindung: der Main
//                  baut Pfade ausschliesslich aus validierten IDs).
//   name           Pflicht. Anzeigename (Klartext, kein i18n-Key —
//                  Uebersetzungen liefert die Erweiterung selbst ueber
//                  die API, der Name identifiziert das Paket).
//   version        Pflicht. Paket-Version: ein bis drei durch Punkte
//                  getrennte Zahlen (major[.minor[.patch]], siehe
//                  VERSION_RE — 4T-0924: die frueher hier genannte Form
//                  major.minor[.patch] las sich, als sei die zweite
//                  Stelle Pflicht); die
//                  Vertrauens-Bestaetigung gilt je Erweiterung UND
//                  Version — ein Versions-Wechsel erfordert erneute
//                  Bestaetigung.
//   apiVersion     Pflicht. API-Version, gegen die die Erweiterung
//                  gebaut ist (major[.minor[.patch]]). Kompatibel, wenn
//                  Major mit EXTENSION_API_VERSION uebereinstimmt und
//                  die deklarierte Minor nicht neuer als die der App ist.
//   entry          Optional. UI-Einstiegspunkt: ES-Modul (schlichter
//                  Dateiname, kein Pfad), das der Renderer per
//                  dynamischem import() laedt; default-Export mit
//                  activate(ctx) und optional deactivate().
//   markdownPlugin Optional. Render-Beitrag: CommonJS-artige Datei
//                  (module.exports = function (md) { ... }), die der
//                  Preload per node:vm in einem leeren Sandbox-Kontext
//                  evaluiert und in beide markdown-it-Instanzen
//                  einbaut (Spike-Ergebnis in 4T-0298).
//   description    Optional. Kurzbeschreibung (Klartext) fuer den
//                  Einstellungs-Bereich.
// Mindestens eines von entry/markdownPlugin ist Pflicht.
'use strict';

// Version der Erweiterungs-API v1. Stabilitäts-Zusage: Signaturen der in
// der Handbuch-Seite dokumentierten API-Oberfläche bleiben innerhalb
// derselben Major-Version stabil; alles nicht Dokumentierte ist
// ausdrücklich nicht-öffentlich und kann sich jederzeit ändern.
//
// 1.1.0 (4T-0825, Epic 3E-0103): Render-Andockpunkt getRenderRoot und
// onRenderUpdated. Reiner Zugewinn, deshalb ein Minor-Schritt — Pakete mit
// apiVersion "1.0" bleiben gültig, ein Paket mit "1.1" wird von einer
// älteren App nie geladen (siehe isApiVersionCompatible).
const EXTENSION_API_VERSION = '1.1.0';

// Store-Schlüssel (electron-store, Punkt-Pfade nesten):
//   enabled  Liste der vom Nutzer aktivierten externen IDs. Bewusst
//            invers zur internen Disabled-Liste: neu erkannte externe
//            Erweiterungen sind deaktiviert (Vertrauensmodell), der
//            Default ist die leere Liste.
//   trusted  { id: version } — je Erweiterung die Version, für die der
//            Warn-Dialog bestätigt wurde. Eigener Schlüssel getrennt von
//            enabled: Deaktivieren nimmt die Bestätigung nicht zurück
//            (erneutes Aktivieren derselben Version fragt nicht erneut),
//            ein Versions-Wechsel dagegen schon.
//   lastError  { id: fehlertext } — letzter Lade-/Hook-Fehler für die
//            Anzeige im Einstellungs-Bereich (überlebt den Neustart,
//            damit eine automatisch deaktivierte Erweiterung ihren
//            Grund behält).
const EXTERNAL_ENABLED_KEY = 'extensionsExternal.enabled';
const EXTERNAL_TRUSTED_KEY = 'extensionsExternal.trusted';
const EXTERNAL_ERRORS_KEY = 'extensionsExternal.lastError';

const ID_RE = /^[a-z][a-z0-9-]*$/;
// Einstiegs-Dateien: schlichter Dateiname mit .js-Endung, keine
// Pfad-Trenner, kein Aufstieg — der Main baut daraus Pfade.
const ENTRY_FILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.js$/;
const VERSION_RE = /^\d+(\.\d+){0,2}$/;

// major[.minor[.patch]] -> { major, minor, patch } | null.
function parseVersion(value) {
  if (typeof value !== 'string' || !VERSION_RE.test(value)) return null;
  const [major = 0, minor = 0, patch = 0] = value.split('.').map((n) => parseInt(n, 10));
  return { major, minor, patch };
}

// Kompatibilität der deklarierten apiVersion gegen die App-API: gleiche
// Major-Version, deklarierte Minor nicht neuer als die der App (eine
// Erweiterung gegen API 1.2 braucht Funktionen, die eine App mit API 1.0
// nicht hat; umgekehrt ist 1.0 auf einer 1.2-App gültig).
function isApiVersionCompatible(declared, appVersion = EXTENSION_API_VERSION) {
  const dec = parseVersion(declared);
  const app = parseVersion(appVersion);
  if (!dec || !app) return false;
  return dec.major === app.major && dec.minor <= app.minor;
}

// Validiert ein Manifest-Objekt gegen das Schema. dirName (optional)
// erzwingt die ID-Verzeichnis-Bindung. Liefert eine Liste von
// Fehler-Strings (leer = gültig); die Texte sind Diagnose-Details für
// Log und Fehler-Anzeige, die umgebende Meldung ist lokalisiert.
function validateExternalManifest(manifest, dirName) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest.json ist kein Objekt'];
  }
  if (typeof manifest.id !== 'string' || !ID_RE.test(manifest.id)) {
    errors.push(`id fehlt oder ist ungültig (erwartet kebab-case): ${String(manifest.id)}`);
  } else if (typeof dirName === 'string' && manifest.id !== dirName) {
    errors.push(`id "${manifest.id}" entspricht nicht dem Verzeichnisnamen "${dirName}"`);
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    errors.push('name fehlt');
  }
  if (parseVersion(manifest.version) === null) {
    errors.push(`version fehlt oder ist ungültig: ${String(manifest.version)}`);
  }
  if (parseVersion(manifest.apiVersion) === null) {
    errors.push(`apiVersion fehlt oder ist ungültig: ${String(manifest.apiVersion)}`);
  }
  for (const field of ['entry', 'markdownPlugin']) {
    const value = manifest[field];
    if (value !== undefined && (typeof value !== 'string' || !ENTRY_FILE_RE.test(value))) {
      errors.push(`${field} ist kein schlichter .js-Dateiname: ${String(value)}`);
    }
  }
  if (manifest.entry === undefined && manifest.markdownPlugin === undefined) {
    errors.push('entry oder markdownPlugin ist Pflicht');
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    errors.push('description ist kein String');
  }
  return errors;
}

// --- Persistierte Zustände normalisieren -------------------------------------------
// Robust gegen defekte Store-Werte (Muster normalizeDisabledIds): kein
// Registry-Abgleich möglich, weil externe IDs dynamisch sind — es zählt
// nur die Form.
function normalizeEnabledIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function normalizeTrustedMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, version] of Object.entries(raw)) {
    if (!ID_RE.test(id) || parseVersion(version) === null) continue;
    out[id] = version;
  }
  return out;
}

function normalizeErrorMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, message] of Object.entries(raw)) {
    if (!ID_RE.test(id) || typeof message !== 'string' || message === '') continue;
    out[id] = message;
  }
  return out;
}

// --- Laufzeit-Status ---------------------------------------------------------------
// Ein Scan-Eintrag { ok, manifest } plus persistierter Zustand ergibt den
// Anzeige- und Lade-Status:
//   'invalid'      Manifest defekt — wird nie geladen.
//   'incompatible' apiVersion passt nicht — wird nie geladen.
//   'error'        letzter Lade-Versuch schlug fehl — deaktiviert, Fehltext.
//   'inactive'     gültig, aber nicht aktiviert (Default neuer Pakete).
//   'confirm'      aktiviert, aber die installierte Version ist nicht
//                  bestätigt (Erst-Aktivierung läuft nie hierüber, wohl
//                  aber ein Versions-Wechsel einer aktiven Erweiterung) —
//                  wird bis zur erneuten Bestätigung nicht geladen.
//   'active'       aktiviert und bestätigt — wird geladen.
function externalExtensionStatus(entry, enabledIds, trustedMap, errorMap = {}) {
  if (!entry || entry.ok === false) return 'invalid';
  const m = entry.manifest;
  if (!isApiVersionCompatible(m.apiVersion)) return 'incompatible';
  if (errorMap[m.id]) return 'error';
  if (!enabledIds.includes(m.id)) return 'inactive';
  if (trustedMap[m.id] !== m.version) return 'confirm';
  return 'active';
}

module.exports = {
  EXTENSION_API_VERSION,
  EXTERNAL_ENABLED_KEY,
  EXTERNAL_TRUSTED_KEY,
  EXTERNAL_ERRORS_KEY,
  parseVersion,
  isApiVersionCompatible,
  validateExternalManifest,
  normalizeEnabledIds,
  normalizeTrustedMap,
  normalizeErrorMap,
  externalExtensionStatus,
};
