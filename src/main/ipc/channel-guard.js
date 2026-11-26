// 4T-002648 (Epic 3E-000416): Die Prüfung an der Anmelde-Stelle, Teil 2
// (AK2): Die erklärten Schreib-Kanäle weisen ein Ziel in einem geschützten
// Ordner ab, bevor ihr Handler läuft (Lösungsansatz der Aufgabe, Punkt 3;
// Konzept-Stufe 4T-002645, T3, T14 und T16).
//
// **Was geprüft wird.** Für jeden Kanal mit einer Erklärung `{ kind: 'paths' }`
// in `channel-declarations.js` löst die Prüfung die erklärten Angaben aus den
// Argumenten, setzt Namen unter ihre Basis (`under`), folgt Verknüpfungen bis
// zum tiefsten vorhandenen Vorfahren (`realLocation`) und hält Text und echten
// Ort gegen die aufgelöste Liste der geschützten Ordner, mit dem erklärten
// Umfang. Bei einem Namen wird auch seine Basis geprüft, weil der Handler dort
// anlegt, und zwar auch dann, wenn ein freiwilliger Name fehlt. Nur diese
// Prüfung: Gegen das Buch der Freigaben wird erst in Stufe 2 geprüft, und
// die Argumente erreichen den Handler unverändert. Alle übrigen Kanäle
// bekommen ihren Handler ungeprüft zurück.
//
// **Im Zweifel abweisend.** Eine erklärte Angabe, die fehlt oder den falschen
// Typ hat (außer einer als `optional` erklärten, die fehlen darf), eine
// Verknüpfung ohne Ziel, ein Fehler beim Auflösen und eine Liste, die sich nicht
// auflösen ließ, weisen ab. Ist die Liste beim ersten Aufruf noch nicht fertig,
// wartet die Prüfung auf sie; der Start wartet nicht.
//
// **Die Abweisung sieht aus wie ein gewöhnlicher Fehler des Kanals** (T16;
// erhoben an den 21 Handlern am 2026-11-21). 19 Kanäle melden einen Fehler als
// `{ ok: false, error: <Text> }`; die Abweisung ist dort
// `{ ok: false, error: 'guard:<Grund>' }`. Die beiden Folien-Ausgaben
// `presentationPptx:export` und `presentationImages:export` melden
// `{ ok: false, fehler: { folie, grund } }`; dort ist sie
// `{ ok: false, fehler: { folie: null, grund: 'guard:<Grund>' } }`, und das
// Fenster zeigt für den unbekannten Grund seinen Text «unbekannt». Die
// Vorsilbe `guard:` macht die Abweisung erkennbar. Je Abweisung schreibt der
// Hauptprozess eine Warnung mit Kanal und Grund, ohne Pfad und ohne Inhalt.
//
// **Umfänge aus T3.** Die Liste der geschützten Ordner kennt `read`, `write`
// und `create`. Eine Erklärung mit `list` wird wie `read` geprüft, eine mit
// `bind` wie die Bindung eines Bereichs mit allen drei Umfängen
// (`AREA_SCOPE` in `grants/binding-grants.js`): Ein Ordner, der als Quelle
// gebunden wird, darf nicht in einem Ort liegen, der einen davon sperrt
// (4T-002649, Vorlagen- und Workflow-Ordner).
//
// Electron-frei; eigener Zustand nur in der Instanz.
'use strict';

const path = require('node:path');
const fsPromises = require('node:fs/promises');
const { declarationOf } = require('./channel-declarations');
const { realLocation } = require('../grants/path-check');
const { asListSource, findProtectedPlace, isResolvedList } = require('../grants/protected-folders');

// Kanäle, deren Fehler-Rückgabe die Form `{ ok: false, fehler: { folie, grund } }` hat.
const FEHLER_FORM_CHANNELS = Object.freeze([
  'presentationPptx:export',
  'presentationImages:export',
]);

const REASONS = Object.freeze([
  'protectedFolder',
  'invalidArgument',
  'danglingLink',
  'resolveFailed',
  'protectedListUnavailable',
]);

// Umfang der Erklärung -> Umfänge der Liste der geschützten Ordner.
const LIST_SCOPES = Object.freeze({
  read: Object.freeze(['read']),
  write: Object.freeze(['write']),
  create: Object.freeze(['create']),
  list: Object.freeze(['read']),
  bind: Object.freeze(['read', 'write', 'create']),
});

class GuardRejection extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function isAbsent(value) {
  return value === undefined || value === null || value === '';
}

// Die Werte an einer Stelle `at` (siehe channel-declarations.js); `[]`
// verzweigt in jedes Element einer Liste.
function valuesAt(args, at) {
  let current = [args];
  for (const [i, token] of at.split('.').entries()) {
    const list = token.endsWith('[]');
    const key = list ? token.slice(0, -2) : token;
    const next = [];
    for (const holder of current) {
      if (i > 0 && (holder === null || typeof holder !== 'object')) {
        throw new GuardRejection('invalidArgument');
      }
      const value = i === 0 ? holder[Number(key)] : holder[key];
      if (!list) next.push(value);
      else if (Array.isArray(value)) next.push(...value);
      else throw new GuardRejection('invalidArgument');
    }
    current = next;
  }
  return current;
}

/**
 * Baut die Prüfung der Anmelde-Stelle.
 *
 * @param {object} deps
 * @param {Function|Promise<object>|object} deps.protectedFolders Quelle der
 *   aufgelösten Liste aus `createListSource` (je Aufruf gefragt, ermittelt nach
 *   einem Scheitern neu), die Liste aus `resolveList` oder das Versprechen darauf.
 * @param {(event: object) => string|null} deps.areaRootOf Bereichs-Wurzel des
 *   anfragenden Fensters (`areaRootForEvent` in main.js); trägt Namen unter
 *   einer Bindung, etwa unter dem Regal.
 * @param {(...args: unknown[]) => void} [deps.warn] Protokoll-Weg.
 * @param {{realpath: Function, lstat: Function}} [deps.fileSystem]
 * @returns {{wrap: (channel: string, fn: Function) => Function, checkTarget: Function}}
 */
function createChannelGuard(deps) {
  const { protectedFolders, areaRootOf, warn = console.warn, fileSystem = fsPromises } = deps || {};
  if (protectedFolders == null || typeof areaRootOf !== 'function') {
    throw new TypeError('Channel guard: protectedFolders and areaRootOf required.');
  }
  // Je Aufruf gefragt (4T-002922): Eine beim Start gescheiterte Ermittlung
  // sperrt nicht mehr bis zum Neustart, die Quelle versucht sie neu.
  const listSource = asListSource(protectedFolders);

  function rejection(channel, reason) {
    const grund = `guard:${reason}`;
    return FEHLER_FORM_CHANNELS.includes(channel)
      ? { ok: false, fehler: { folie: null, grund } }
      : { ok: false, error: grund };
  }

  // Ziele eines Aufrufs: je Angabe der aufgelöste Pfad samt Umfang.
  function targetsOf(decl, event, args) {
    const byAt = new Map(decl.params.map((p) => [p.at, p]));
    const memo = new Map();

    function single(p) {
      const values = valuesAt(args, p.at);
      if (values.length !== 1) throw new GuardRejection('invalidArgument');
      return values[0];
    }

    // Der Ordner, unter den ein Name kommt.
    function baseOf(p) {
      const under = p.under;
      if (under.binding) {
        const root = areaRootOf(event);
        if (typeof root !== 'string' || root === '') throw new GuardRejection('invalidArgument');
        return path.resolve(root);
      }
      const q = byAt.get(under.at);
      const target = pathOf(q);
      // Fehlt ein freiwilliger Name, legt der Handler unter dessen Basis an.
      const base = target === null ? baseOf(q) : target;
      return under.parent ? path.dirname(base) : base;
    }

    // Der Pfad einer Angabe, die genau einen Wert hat; `null`, wenn sie fehlen darf und fehlt.
    function pathOf(p) {
      if (memo.has(p.at)) return memo.get(p.at);
      const value = single(p);
      let result;
      if (isAbsent(value) && p.optional) result = null;
      else if (typeof value !== 'string' || value === '')
        throw new GuardRejection('invalidArgument');
      else result = p.form === 'name' ? path.join(baseOf(p), value) : path.resolve(value);
      memo.set(p.at, result);
      return result;
    }

    const targets = [];
    for (const p of decl.params) {
      for (const value of valuesAt(args, p.at)) {
        if (isAbsent(value) && p.optional) {
          // Review-Befund S1 vom 2026-11-22: Fehlt ein freiwilliger Name, legt
          // der Handler unter dessen Basis an (etwa eine Anlage mit erzeugtem
          // Namen); die Basis wird deshalb mit dem Umfang des Namens geprüft.
          if (p.form === 'name') targets.push({ path: baseOf(p), scope: p.scope });
          continue;
        }
        if (typeof value !== 'string' || value === '') throw new GuardRejection('invalidArgument');
        if (p.form === 'name') {
          const base = baseOf(p);
          targets.push(
            { path: base, scope: p.scope },
            { path: path.join(base, value), scope: p.scope },
          );
        } else {
          targets.push({ path: path.resolve(value), scope: p.scope });
        }
      }
    }
    return targets;
  }

  async function checkTargets(targetsFn) {
    let list;
    try {
      list = await listSource();
    } catch {
      throw new GuardRejection('protectedListUnavailable');
    }
    if (!isResolvedList(list)) throw new GuardRejection('protectedListUnavailable');
    for (const target of targetsFn()) {
      let real;
      try {
        real = await realLocation(target.path, fileSystem);
      } catch (err) {
        throw new GuardRejection(
          err && err.checkCode === 'danglingLink' ? 'danglingLink' : 'resolveFailed',
        );
      }
      for (const scope of LIST_SCOPES[target.scope]) {
        if (findProtectedPlace([target.path, real], list, scope)) {
          throw new GuardRejection('protectedFolder');
        }
      }
    }
  }

  async function check(decl, event, args) {
    await checkTargets(() => targetsOf(decl, event, args));
  }

  /**
   * Prüft ein Ziel, das der Handler erst selbst errechnet (Review-Befund S1
   * vom 2026-11-22): etwa den Ordner einer Anlage, den die Anlagen-Einstellung
   * neben den Ordner des Dokuments legen kann. Dieselbe Prüfung wie an der
   * Anmelde-Stelle, mit derselben Form der Abweisung und derselben Warnung.
   *
   * @param {string} channel Kanal, dessen Handler fragt.
   * @param {string} targetPath Errechnetes Ziel.
   * @param {'read'|'write'|'create'|'list'|'bind'} scope
   * @returns {Promise<object|null>} `null`, wenn das Ziel frei ist, sonst die Abweisung.
   */
  async function checkTarget(channel, targetPath, scope) {
    try {
      if (typeof targetPath !== 'string' || targetPath === '' || !LIST_SCOPES[scope]) {
        throw new GuardRejection('invalidArgument');
      }
      await checkTargets(() => [{ path: path.resolve(targetPath), scope }]);
      return null;
    } catch (err) {
      const reason = err instanceof GuardRejection ? err.reason : 'resolveFailed';
      warn(`Kanal ${channel} abgewiesen:`, reason);
      return rejection(channel, reason);
    }
  }

  /**
   * Der Handler, den die Anmelde-Stelle anmeldet: für einen Kanal mit
   * erklärten Pfad-Angaben die geprüfte Fassung, sonst der Handler selbst.
   *
   * @param {string} channel
   * @param {Function} fn Handler `(event, ...args)`.
   * @returns {Function}
   */
  function wrap(channel, fn) {
    const decl = declarationOf(channel);
    if (!decl || decl.kind !== 'paths') return fn;
    return async (event, ...args) => {
      try {
        await check(decl, event, args);
      } catch (err) {
        const reason = err instanceof GuardRejection ? err.reason : 'resolveFailed';
        warn(`Kanal ${channel} abgewiesen:`, reason);
        return rejection(channel, reason);
      }
      return fn(event, ...args);
    };
  }

  return { wrap, checkTarget };
}

module.exports = { FEHLER_FORM_CHANNELS, REASONS, createChannelGuard };
