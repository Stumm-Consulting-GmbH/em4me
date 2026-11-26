// 4T-002647 (Epic 3E-000416): Die eine Prüf-Funktion «darf dieses Fenster
// diesen Pfad lesen oder schreiben» (Konzept-Stufe 4T-002645, T2 und T14).
//
// **Ablauf, jeder Schritt weist im Zweifel ab:**
//   1. Text prüfen: Namens-Regeln der Plattform (`checkNameRules`).
//   2. Auflösen (`path.resolve`) und am Text gegen die Freigaben des Fensters
//      halten, gegen die gewählte (`chosenRoot`) ODER die aufgelöste Form der
//      Wurzel (`root`), dazu am Text gegen die geschützten Ordner. Erst ein
//      Pfad, der am Text in einer Freigabe liegt, erreicht die Platte: Schon
//      die Auflösung eines Netz-Pfads ist eine Verbindung zum fremden Rechner
//      (Entwicklungsrichtlinien, Kapitel 6; T19).
//   3. Verknüpfungen bis zum tiefsten vorhandenen Vorfahren folgen
//      (`realpath`) und den echten Ort allein gegen die aufgelöste Wurzel
//      `root` halten. Die Wurzel wird dabei nicht neu aufgelöst; wurde sie
//      gegen eine Verknüpfung nach außen ausgetauscht, liegt das Ziel nicht
//      mehr in ihr. Die gewählte Form zählt hier nicht, sonst wäre ein
//      Verzeichnis-Knoten in ihr ein Weg nach außen.
//   4. Geschützte Ordner prüfen, Text und echter Ort gegen die einmal
//      aufgelöste Liste (`resolveList` in `protected-folders.js`); auch wenn
//      eine Freigabe den Ordner enthält.
//
// **Warum nach dem Muster von `workflow-area-path.js` gebaut und nicht dieses
// aufgerufen:** Jenes prüft relative Schritt-Pfade gegen eine einzige Wurzel
// und gibt den Text-Pfad zurück. Hier kommen absolute Pfade gegen mehrere
// Freigaben mit Umfang und Inhaber, und zurück geht der echte Ort, damit der
// Zugriff danach an dem Ort geschieht, der geprüft wurde. Übernommen sind die
// Innerhalb-Prüfung `isInsideArea` (`src/main/area/area-path.js`, Schreibung
// nach `pathCompareKey`) und die Suche nach dem tiefsten vorhandenen Vorfahren.
// **Schärfer als das Vorbild:** Endet die Suche an einem Eintrag, den es gibt,
// dessen Ziel aber fehlt (Verknüpfung ohne Ziel), wird abgewiesen. Das Vorbild
// stiege dort zum Eltern-Ordner auf und hielte den Pfad für innerhalb, obwohl
// ein Schreib-Zugriff der Verknüpfung nach außen folgen würde (gemessen am
// 2026-11-21 unter Windows: `realpath` meldet ENOENT, `lstat` sieht den Knoten).
//
// `fs.promises.realpath` löst unter Windows auch Kurznamen (`EINSEH~1`), die
// Schreibung zum Namen auf der Platte und ein zugeordnetes Netz-Laufwerk zum
// Netz-Pfad auf (gemessen am 2026-11-21); `fs.realpathSync` ohne `.native`
// tut das nicht und ist deshalb nicht der Weg.
//
// **Bekannte Grenzen:** Zwischen Prüfung und Zugriff kann ein anderer Prozess
// einen Ordner durch eine Verknüpfung ersetzen; der Aufrufer greift deshalb
// über den zurückgegebenen echten Ort zu. Harte Verknüpfungen auf Dateien
// sind am Pfad nicht erkennbar (4T-001062, T11).
//
// Electron-frei; eigener Zustand: keiner. Der Datei-Zugriff (`realpath`,
// `lstat`) ist als Parameter einsetzbar, damit Fehler beim Auflösen prüfbar sind.
'use strict';

const path = require('node:path');
const fsPromises = require('node:fs/promises');
const { isInsideArea, isSamePath } = require('../area/area-path');
const { SCOPES, OWNER_PROGRAM } = require('./grant-book');
const { findProtectedPlace, isResolvedList } = require('./protected-folders');
const { isWindowsDeviceName } = require('../../shared/windows-geraetenamen');

// Die reservierten Gerätenamen von Windows liest die Prüfung aus ihrer Heimat
// `src/shared/windows-geraetenamen.js` (Review-Befund Z2 vom 2026-11-22).
const FORBIDDEN_WIN_RE = /[<>"|?*]/;
const TRAILING_RE = /[. ]$/;

const NAME_CODES = Object.freeze([
  'emptyPath',
  'nullChar',
  'devicePrefix',
  'notAbsolute',
  'dataStream',
  'dotSegment',
  'forbiddenChar',
  'deviceName',
  'trailingDotOrSpace',
]);
const CHECK_CODES = Object.freeze([
  ...NAME_CODES,
  'noGrant',
  'scopeNotCovered',
  'linkOutside',
  'danglingLink',
  'protectedFolder',
  'resolveFailed',
]);

function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) <= 0x1f) return true;
  return false;
}

function checkSegmentWindows(seg) {
  if (seg === '.' || seg === '..') return 'dotSegment';
  if (FORBIDDEN_WIN_RE.test(seg) || hasControlChar(seg)) return 'forbiddenChar';
  if (isWindowsDeviceName(seg)) return 'deviceName';
  if (TRAILING_RE.test(seg)) return 'trailingDotOrSpace';
  return null;
}

function checkWindows(text) {
  const s = text.replace(/\//g, '\\');
  // Langpfad-, Geräte- und NT-Vorsilbe umgehen die Normalisierung von Windows.
  if (s.startsWith('\\\\?\\') || s.startsWith('\\\\.\\') || s.startsWith('\\??\\')) {
    return 'devicePrefix';
  }
  let segments;
  if (/^[A-Za-z]:\\/.test(s)) {
    if (s.indexOf(':', 2) !== -1) return 'dataStream';
    segments = s.slice(3).split('\\');
  } else if (/^\\\\[^\\]+\\[^\\]+/.test(s)) {
    if (s.includes(':')) return 'dataStream';
    segments = s.slice(2).split('\\');
  } else {
    // Auch `\Ordner` (Wurzel des aktuellen Laufwerks) und `C:Ordner` (aktueller
    // Ordner eines Laufwerks): Beide hängen am Prozess-Zustand.
    return s.includes(':') && !/^[A-Za-z]:/.test(s) ? 'dataStream' : 'notAbsolute';
  }
  for (const seg of segments) {
    if (seg === '') continue;
    const code = checkSegmentWindows(seg);
    if (code) return code;
  }
  return null;
}

function checkPosix(text) {
  if (!text.startsWith('/')) return 'notAbsolute';
  for (const seg of text.split('/')) {
    if (seg === '.' || seg === '..') return 'dotSegment';
  }
  return null;
}

/**
 * Namens-Regeln eines absoluten Pfads, rein und mit der Plattform als
 * Parameter, damit die Fälle beider Plattformen überall laufen.
 *
 * Windows: kein Doppelpunkt außer hinter der Laufwerks-Angabe (damit kein
 * alternativer Datenstrom), kein reservierter Gerätename auch mit Endung, kein
 * Punkt oder Leerzeichen am Ende eines Namens-Teils (Windows schneidet beides
 * still ab), keine Geräte- oder Langpfad-Vorsilbe, keine unter Windows
 * verbotenen Zeichen. Alle Plattformen: kein Null-Zeichen, keine Namens-Teile
 * `.` und `..` (abweisend statt wegnormalisiert: Unter Linux folgt `..` hinter
 * einer Verknüpfung deren Ziel, nicht dem Text).
 *
 * @param {unknown} p
 * @param {string} platform `process.platform`-Wert.
 * @returns {string|null} Code aus `NAME_CODES` oder `null`.
 */
function checkNameRules(p, platform) {
  if (typeof p !== 'string' || p === '') return 'emptyPath';
  if (p.includes('\0')) return 'nullChar';
  return platform === 'win32' ? checkWindows(p) : checkPosix(p);
}

function checkError(code) {
  const err = new Error(code);
  err.checkCode = code;
  return err;
}

function isMissing(err) {
  return Boolean(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR');
}

/**
 * Echter Ort von `abs`: der tiefste vorhandene Vorfahre (sich selbst
 * eingeschlossen) nach `realpath`, dahinter die noch nicht bestehenden
 * Namens-Teile. Wirft einen Fehler mit `checkCode: 'danglingLink'`, wenn ein
 * Eintrag besteht, dessen Ziel fehlt; andere Fehler unverändert.
 *
 * 4T-002922: Findet `lstat` einen Eintrag, den `realpath` eben nicht fand,
 * kann er auch zwischen beiden Fragen entstanden sein; beim ersten Start legt
 * der Einstellungs-Speicher die Einstellungs-Datei genau in diesem Moment an.
 * Deshalb wird `realpath` für denselben Ort einmal neu gefragt, und erst wenn
 * er dann weiter fehlt, gilt der Eintrag als Verknüpfung ohne Ziel. Durch
 * lässt das nichts: Gelingt die zweite Frage, ist ihr Ergebnis der echte Ort.
 *
 * @param {string} abs Absoluter, aufgelöster Pfad.
 * @param {{realpath: Function, lstat: Function}} fileSystem
 * @returns {Promise<string>}
 */
async function realLocation(abs, fileSystem) {
  const rest = [];
  let probe = abs;
  let askedAgain = false;
  for (;;) {
    try {
      const real = await fileSystem.realpath(probe);
      return rest.length === 0 ? real : path.join(real, ...rest.reverse());
    } catch (err) {
      if (!isMissing(err)) throw err;
      let exists = true;
      try {
        await fileSystem.lstat(probe);
      } catch (lstatErr) {
        if (!isMissing(lstatErr)) throw lstatErr;
        exists = false;
      }
      if (exists) {
        if (askedAgain) throw checkError('danglingLink');
        askedAgain = true;
        continue;
      }
      const parent = path.dirname(probe);
      if (parent === probe) throw err;
      rest.push(path.basename(probe));
      probe = parent;
      askedAgain = false;
    }
  }
}

function covers(entryKind, root, target) {
  return entryKind === 'file' ? isSamePath(root, target) : isInsideArea(root, target);
}

function rejected(code, p) {
  return { ok: false, code, path: p };
}

function checkScopeAndList(scope, protectedFolders) {
  if (!SCOPES.includes(scope)) throw new TypeError(`Path check: unknown scope ${String(scope)}.`);
  // Ohne aufgelöste Liste fiele der Schutz still weg oder kostete je Aufruf
  // neue Auflösungen; deshalb Vertrag statt Rückfall.
  if (!isResolvedList(protectedFolders)) {
    throw new TypeError('Path check: protectedFolders must come from resolveList.');
  }
}

/**
 * Darf das Fenster diesen Pfad im verlangten Umfang nutzen?
 *
 * @param {object} request
 * @param {{query: Function}} request.book Buch aus `createGrantBook`.
 * @param {number} request.windowId `webContents.id` des anfragenden Fensters.
 * @param {unknown} request.path Der Pfad aus dem Fenster, absolut.
 * @param {'read'|'write'|'create'} request.scope
 * @param {object} request.protectedFolders Aufgelöste Liste aus `resolveList`.
 * @param {string} [request.owner='program'] Nur Einträge dieses Inhabers zählen.
 * @param {string} [request.id] Nur dieser Eintrag zählt (Griff eines Add-ons).
 * @param {string} [request.platform=process.platform] Für die Namens-Regeln.
 * @param {{realpath: Function, lstat: Function}} [request.fileSystem]
 * @returns {Promise<{ok: true, path: string, entry: object}|{ok: false, code: string, path: string|null}>}
 *   Bei `ok` ist `path` der echte Ort, über den zugegriffen wird. Codes: `CHECK_CODES`.
 * @throws {TypeError} bei einer Anfrage außerhalb des Vertrags (Programmfehler, nicht Fenster-Eingabe).
 */
async function checkPath(request) {
  if (!request || typeof request !== 'object') throw new TypeError('Path check: request missing.');
  const {
    book,
    windowId,
    path: p,
    scope,
    protectedFolders,
    owner = OWNER_PROGRAM,
    id,
    platform = process.platform,
    fileSystem = fsPromises,
  } = request;
  checkScopeAndList(scope, protectedFolders);
  const nameCode = checkNameRules(p, platform);
  if (nameCode) return rejected(nameCode, null);
  const abs = path.resolve(p);

  // Schritt 2: nur am Text, noch ohne Platte.
  const byText = book
    .query(windowId, { owner })
    .filter(
      (e) =>
        (id === undefined || e.id === id) &&
        (covers(e.kind, e.chosenRoot, abs) || covers(e.kind, e.root, abs)),
    );
  if (byText.length === 0) return rejected('noGrant', abs);
  const candidates = byText.filter((e) => e.scope.includes(scope));
  if (candidates.length === 0) return rejected('scopeNotCovered', abs);
  if (findProtectedPlace([abs], protectedFolders, scope)) return rejected('protectedFolder', abs);

  // Schritt 3: echter Ort des Ziels allein gegen die aufgelöste Wurzel.
  let real;
  try {
    real = await realLocation(abs, fileSystem);
  } catch (err) {
    return rejected(err && err.checkCode ? err.checkCode : 'resolveFailed', abs);
  }
  const hit = candidates.find((e) => covers(e.kind, e.root, real));
  if (!hit) return rejected('linkOutside', abs);

  // Schritt 4: geschützte Ordner, auch innerhalb einer Freigabe.
  if (findProtectedPlace([abs, real], protectedFolders, scope))
    return rejected('protectedFolder', real);
  return { ok: true, path: real, entry: hit };
}

/**
 * Prüft einen Ort, bevor er als Freigabe ins Buch kommt, und liefert beide
 * Formen der Wurzel. Ein geschützter Ort lässt sich für einen Umfang, den er
 * sperrt, nicht freigeben, also etwa nicht als Bereich binden; ein Ordner, der
 * ihn enthält, schon (V5 a).
 *
 * @param {unknown} p Gewählter Ort (Dialog, Liste, Sitzung).
 * @param {object} options
 * @param {string[]} options.scope Der Umfang, mit dem eingetragen werden soll.
 * @param {object} options.protectedFolders Aufgelöste Liste aus `resolveList`.
 * @param {string} [options.platform=process.platform]
 * @param {{realpath: Function, lstat: Function}} [options.fileSystem]
 * @returns {Promise<{ok: true, root: string, chosenRoot: string}|{ok: false, code: string, path: string|null}>}
 *   `root` ist der Ort nach Auflösung, `chosenRoot` die gewählte Text-Form
 *   nach `path.resolve`; beide gehen so in `grant`.
 */
async function checkRoot(p, options) {
  const o = options || {};
  if (!Array.isArray(o.scope) || o.scope.length === 0) {
    throw new TypeError('Path check: scope of the grant missing.');
  }
  for (const s of o.scope) checkScopeAndList(s, o.protectedFolders);
  const nameCode = checkNameRules(p, o.platform || process.platform);
  if (nameCode) return rejected(nameCode, null);
  const abs = path.resolve(p);
  let real;
  try {
    real = await realLocation(abs, o.fileSystem || fsPromises);
  } catch (err) {
    return rejected(err && err.checkCode ? err.checkCode : 'resolveFailed', abs);
  }
  for (const s of o.scope) {
    if (findProtectedPlace([abs, real], o.protectedFolders, s))
      return rejected('protectedFolder', real);
  }
  return { ok: true, root: real, chosenRoot: abs };
}

module.exports = {
  NAME_CODES,
  CHECK_CODES,
  checkNameRules,
  realLocation,
  checkPath,
  checkRoot,
};
