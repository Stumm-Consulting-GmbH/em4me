// 4T-002648 (Epic 3E-000416): Die Tabelle der Erklärungen je Kanal und die
// Übergangs-Liste «noch nicht erklärt» (Lösungsansatz der Aufgabe, Punkte 1
// und 2; Konzept-Stufe 4T-002645, T3).
//
// **Wozu.** Alle Endpunkte werden an einer Stelle angemeldet (`registriere` in
// `src/main/main.js`). Ein Kanal lässt sich dort nur noch anmelden, wenn er hier
// erklärt ist oder in der Übergangs-Liste steht (`assertRegistrable`). Damit
// entsteht kein neuer Endpunkt mehr, ohne dass jemand gesagt hat, ob er einen
// Pfad nimmt. Die Erklärungen sind die Grundlage der Prüfung: Seit Teil 2 hält
// `channel-guard.js` die Aufrufe der Kanäle mit Pfad-Erklärung gegen die
// geschützten Ordner, und mit Stufe 2 kommt die Prüfung gegen das Buch der
// Freigaben hinzu (Review-Befund Z4 vom 2026-11-22: der Satz beschrieb Teil 1).
//
// **Form einer Erklärung.** Entweder `NO_PATH`: Der Kanal nimmt aus dem Fenster
// keinen Pfad, keinen Ordner, keinen Datei- oder Ordnernamen und keinen
// Schlüssel des Einstellungs-Speichers. Oder `{ kind: 'paths', params: [...] }`
// mit einem Eintrag je Pfad-Angabe:
//   - `at`: wo die Angabe im Aufruf steht. Die Zahl ist die Stelle des
//     Arguments nach dem Ereignis (0 ist das erste), dahinter mit Punkt das
//     Feld innerhalb eines Objekts; `[]` steht für jedes Element einer Liste,
//     etwa `2[].name`.
//   - `form`: `path` (absoluter Pfad einer Datei), `folder` (absoluter Pfad
//     eines Ordners) oder `name` (ein Namens-Teil, den der Hauptprozess unter
//     einen anderen Ort setzt, siehe `under`).
//   - `under` (nur bei `name`): `{ at, parent }` nennt die Angabe, unter die der
//     Name kommt (`parent: true`: unter ihren Eltern-Ordner); `{ binding }`
//     nennt die Bindung des Fensters, etwa das Regal.
//   - `scope`: `read`, `write`, `create`, `list` oder `bind`; dieselben Werte wie
//     der Umfang im Buch der Freigaben, dazu `list` und `bind` aus T3.
//   - `optional`: Die Angabe darf fehlen (`undefined`, `null` oder leer); der
//     Handler bildet dann selbst einen Namen oder nimmt einen anderen Weg.
//   - `grants`: welche Arten von Freigabe genügen (`area`, `folder`, `file`;
//     die Arten des Buchs). Im Zweifel die engere Menge: Ein Ziel aus einem
//     Datei-Dialog genügt nur als einzelne Datei (T7).
// Oder `{ kind: 'keys', params: [...] }` (4T-002650): Der Kanal nimmt keinen
// Pfad, aber eine Kennung, die der Hauptprozess selbst gegen eine eigene
// Tabelle hält. Je Angabe:
//   - `at`: wie oben.
//   - `form`: `settingKey` (ein Schlüssel des Einstellungs-Speichers; das
//     Schreiben prüft die Tabelle `src/main/app/settings-classes.js`, das Lesen
//     bleibt dem Fenster nach Anforderung 4S-001212 offen) oder `extensionId`
//     (die Kennung eines Add-ons; der Handler nimmt sie nur aus dem letzten
//     Scan und bildet jeden Pfad selbst, `src/main/extensions/extension-packages.js`).
//   - `scope`: `read` oder `write`.
// Eine eigene Art und keine weitere `form` unter `paths`, weil die Prüfung der
// geschützten Ordner (`channel-guard.js`) jede Angabe einer `paths`-Erklärung
// als Pfad auflöst; Erklärungen der Art `keys` lässt sie unberührt, sie weist
// dadurch nichts anders ab als vorher.
//
// **Herkunft der Einträge.** Erklärt sind die 21 schreibenden Endpunkte der
// Aufgabe (Lösungsansatz, Punkt 3), jeder am Quelltext des Handlers
// nachgelesen, und die Kanäle, die die Erhebung vom 2026-11-13
// (`Projektmanagement/Aufgaben/Anlagen/4T-002645/2026-11-13-Erhebung-Endpunkte.md`,
// Stand `685ecf867`) als «kein Pfad, kein Schlüssel» (G0) führt; die
// Kanal-Gruppen haben sich seither nur in `workflows.js` und
// `workflow-armed.js` geändert, ohne einen dieser Kanäle zu berühren. Ein
// G0-Kanal steht dennoch in der Übergangs-Liste: `journals:setAreaConfig`
// nimmt ein Ordner- und Namens-Schema, aus dem der Hauptprozess später Pfade
// bildet (engere Lesart). Alle übrigen angemeldeten Kanäle stehen in der
// Übergangs-Liste, je mit ihrer Einstufung aus der Erhebung (`new`: dort
// nicht einzeln erhoben). Die Liste darf nur kürzer werden; Stufe 2 leert und
// entfernt sie. Einmalige Ausnahme: Beim Zusammenbau des Funktions-Release am
// 2026-11-25 kamen drei neue Kanäle des Zuges 3E-000410 hinzu (Obergrenze im
// Prüffall von 156 auf 159); ihre Erklärung gehört zu Stufe 2 (3E-000417).
//
// **Aufbau: ein Einstieg, die Einträge in Teilen je Kanal-Gruppe.** Die
// Einträge stehen in `src/main/ipc/channel-declarations/`, ein Teil je
// Kanal-Gruppe, also je Modul unter `src/main/ipc/`, das seine Kanäle über
// `registriere` anmeldet; Gruppen derselben Datei-Familie teilen einen Teil
// (`areas.js` mit `area-copy.js` und `area-features.js`, die vier
// `presentation-*.js`). Ein neuer Eintrag gehört in den Teil der Gruppe, die
// den Kanal anmeldet; jeder Teil nennt seine Gruppen in `GROUPS`, und der
// Prüffall hält fest, dass er nur deren Kanäle trägt. Anlass des Schnitts war
// das Datei-Größen-Budget: Die eine Tabelle stand mit 484 von 500 Code-Zeilen
// vor den Erklärungen der Einstellungs- und Add-on-Kanäle.
//
// **Warum ein Unterordner.** 26 Teile flach unter `src/main/ipc/` lägen neben
// den Modulen der Kanal-Gruppen und sähen aus wie solche; der eigene Ordner
// beantwortet die Zuständigkeits-Frage mit einem Satz (Entwicklungsrichtlinien,
// Kapitel 1, «Feature-Ordner nach Fachlichkeit»). Die Teile holen ihre
// Schreib-Hilfen aus `declaration-form.js` im selben Ordner, nicht von hier,
// damit kein Import-Zyklus über die Ordner-Grenze entsteht. Dieses Modul ist
// keine bloße Fassade: Es setzt die Teile zusammen, prüft die Form jeder
// Erklärung und wirft beim Laden, wenn ein Kanal in zwei Teilen steht oder in
// einem Teil zugleich erklärt und «noch nicht erklärt» ist.
//
// Electron-frei; eigener Zustand: keiner.
'use strict';

const NO_PATH = Object.freeze({ kind: 'noPath' });
const FORMS = Object.freeze(['path', 'folder', 'name']);
const SCOPES = Object.freeze(['read', 'write', 'create', 'list', 'bind']);
const GRANT_KINDS = Object.freeze(['area', 'folder', 'file']);
// 4T-002650: Angaben der Art `keys` und ihr Umfang.
const KEY_FORMS = Object.freeze(['settingKey', 'extensionId']);
const KEY_SCOPES = Object.freeze(['read', 'write']);
const AT_RE = /^\d+(?:\.[A-Za-z_]\w*(?:\[\])?)*$|^\d+\[\](?:\.[A-Za-z_]\w*)+$/;

/**
 * Die Teile, in der Reihenfolge der Anmeldung in `src/main/main.js`. Jeder Teil
 * trägt `GROUPS` und höchstens vier Listen: `NO_PATH_CHANNELS` (Kanäle ohne
 * Pfad und ohne Schlüssel, Erhebung: G0), `WRITE_DECLARATIONS` (die
 * schreibenden Endpunkte ohne durchgehende Grenze, Aufgabe, Punkt 3),
 * `KEY_DECLARATIONS` (Kanäle mit einer Kennung der Art `keys`, 4T-002650) und
 * `NOT_YET_DECLARED` (Übergangs-Liste «noch nicht erklärt»: Kanal und
 * Einstufung der Erhebung).
 */
const PARTS = {
  windows: require('./channel-declarations/windows'),
  settings: require('./channel-declarations/settings'),
  files: require('./channel-declarations/files'),
  history: require('./channel-declarations/history'),
  dialogs: require('./channel-declarations/dialogs'),
  rename: require('./channel-declarations/rename'),
  areas: require('./channel-declarations/areas'),
  attachments: require('./channel-declarations/attachments'),
  books: require('./channel-declarations/books'),
  shelves: require('./channel-declarations/shelves'),
  'index-views': require('./channel-declarations/index-views'),
  embeds: require('./channel-declarations/embeds'),
  dashboard: require('./channel-declarations/dashboard'),
  reminders: require('./channel-declarations/reminders'),
  templates: require('./channel-declarations/templates'),
  workflows: require('./channel-declarations/workflows'),
  profiles: require('./channel-declarations/profiles'),
  database: require('./channel-declarations/database'),
  extensions: require('./channel-declarations/extensions'),
  help: require('./channel-declarations/help'),
  exchange: require('./channel-declarations/exchange'),
  locales: require('./channel-declarations/locales'),
  memory: require('./channel-declarations/memory'),
  'canvas-import': require('./channel-declarations/canvas-import'),
  presentation: require('./channel-declarations/presentation'),
  'lese-positionen': require('./channel-declarations/lese-positionen'),
};

function checkParam(channel, p, ats) {
  const where = `Kanal-Erklärung ${channel}`;
  if (!p || typeof p.at !== 'string' || !AT_RE.test(p.at)) throw new TypeError(`${where}: at?`);
  if (!FORMS.includes(p.form)) throw new TypeError(`${where}: form ${String(p.form)}?`);
  if (!SCOPES.includes(p.scope)) throw new TypeError(`${where}: scope ${String(p.scope)}?`);
  if (
    !Array.isArray(p.grants) ||
    p.grants.length === 0 ||
    !p.grants.every((g) => GRANT_KINDS.includes(g))
  ) {
    throw new TypeError(`${where}: grants?`);
  }
  if (p.optional !== undefined && typeof p.optional !== 'boolean') {
    throw new TypeError(`${where}: optional?`);
  }
  if (p.form === 'name') {
    const u = p.under;
    const ok =
      u && (typeof u.binding === 'string' || (typeof u.at === 'string' && ats.includes(u.at)));
    if (!ok) throw new TypeError(`${where}: name ohne under`);
  } else if (p.under !== undefined) {
    throw new TypeError(`${where}: under nur bei name`);
  }
}

// 4T-002650: Erklärung der Art `keys`; nur `at`, `form` und `scope`.
function freezeKeyDeclaration(channel, decl) {
  const where = `Kanal-Erklärung ${channel}`;
  if (!decl || decl.kind !== 'keys' || !Array.isArray(decl.params) || decl.params.length === 0) {
    throw new TypeError(`${where}: Form?`);
  }
  for (const p of decl.params) {
    if (!p || typeof p.at !== 'string' || !AT_RE.test(p.at)) throw new TypeError(`${where}: at?`);
    if (!KEY_FORMS.includes(p.form)) throw new TypeError(`${where}: form ${String(p.form)}?`);
    if (!KEY_SCOPES.includes(p.scope)) throw new TypeError(`${where}: scope ${String(p.scope)}?`);
    const extra = Object.keys(p).filter((k) => !['at', 'form', 'scope'].includes(k));
    if (extra.length > 0) throw new TypeError(`${where}: ${extra.join(', ')}?`);
  }
  return Object.freeze({
    kind: 'keys',
    params: Object.freeze(decl.params.map((p) => Object.freeze({ ...p }))),
  });
}

function freezeDeclaration(channel, decl) {
  if (decl === NO_PATH) return NO_PATH;
  if (!decl || decl.kind !== 'paths' || !Array.isArray(decl.params) || decl.params.length === 0) {
    throw new TypeError(`Kanal-Erklärung ${channel}: Form?`);
  }
  const ats = decl.params.map((p) => p && p.at);
  for (const p of decl.params) checkParam(channel, p, ats);
  return Object.freeze({
    kind: 'paths',
    params: Object.freeze(
      decl.params.map((p) =>
        Object.freeze({
          ...p,
          grants: Object.freeze([...p.grants]),
          ...(p.under ? { under: Object.freeze({ ...p.under }) } : {}),
        }),
      ),
    ),
  });
}

function checkPart(name, part) {
  const where = `Kanal-Teil ${name}`;
  const {
    GROUPS,
    NO_PATH_CHANNELS = [],
    WRITE_DECLARATIONS = {},
    KEY_DECLARATIONS = {},
    NOT_YET_DECLARED = [],
  } = part;
  if (!Array.isArray(GROUPS) || GROUPS.length === 0) throw new TypeError(`${where}: GROUPS?`);
  if (!Array.isArray(NO_PATH_CHANNELS)) throw new TypeError(`${where}: NO_PATH_CHANNELS?`);
  if (!WRITE_DECLARATIONS || typeof WRITE_DECLARATIONS !== 'object') {
    throw new TypeError(`${where}: WRITE_DECLARATIONS?`);
  }
  if (!KEY_DECLARATIONS || typeof KEY_DECLARATIONS !== 'object') {
    throw new TypeError(`${where}: KEY_DECLARATIONS?`);
  }
  const pairs = Array.isArray(NOT_YET_DECLARED) && NOT_YET_DECLARED.every(Array.isArray);
  if (!pairs) throw new TypeError(`${where}: NOT_YET_DECLARED?`);
  return { NO_PATH_CHANNELS, WRITE_DECLARATIONS, KEY_DECLARATIONS, NOT_YET_DECLARED };
}

// Setzt die Teile zusammen. Jeder Kanal hat genau einen Teil; steht er in einem
// zweiten, wirft das Laden, ebenso bei einem doppelten Eintrag im selben Teil
// und bei einem Kanal, der im selben Teil erklärt und «noch nicht erklärt» ist.
function buildDeclarations(parts) {
  const map = new Map();
  const notYet = new Map();
  const seen = new Map(); // Kanal -> { part, declared }
  const take = (channel, part, declared) => {
    const before = seen.get(channel);
    if (before && before.part !== part) {
      throw new TypeError(`Kanal ${channel}: in zwei Teilen (${before.part}, ${part})`);
    }
    if (before && before.declared !== declared) {
      throw new TypeError(`Kanal ${channel}: erklärt und zugleich «noch nicht erklärt»`);
    }
    if (before) throw new TypeError(`Kanal-Erklärung ${channel}: doppelt`);
    seen.set(channel, { part, declared });
  };
  for (const [name, raw] of Object.entries(parts)) {
    const part = checkPart(name, raw);
    for (const channel of part.NO_PATH_CHANNELS) {
      take(channel, name, true);
      map.set(channel, NO_PATH);
    }
    for (const [channel, decl] of Object.entries(part.WRITE_DECLARATIONS)) {
      take(channel, name, true);
      map.set(channel, freezeDeclaration(channel, decl));
    }
    for (const [channel, decl] of Object.entries(part.KEY_DECLARATIONS)) {
      take(channel, name, true);
      map.set(channel, freezeKeyDeclaration(channel, decl));
    }
    for (const [channel, grade] of part.NOT_YET_DECLARED) {
      take(channel, name, false);
      notYet.set(channel, grade);
    }
  }
  return { map, notYet };
}

const BUILT = buildDeclarations(PARTS);

/**
 * Alle Erklärungen: Kanal -> `NO_PATH`, `{ kind: 'paths', params }` oder
 * `{ kind: 'keys', params }`.
 */
const DECLARATIONS = BUILT.map;

/**
 * Übergangs-Liste «noch nicht erklärt»: Kanal und Einstufung der Erhebung.
 * Sie darf nur kürzer werden (Obergrenze im Prüffall; einmalige Erhöhung am
 * 2026-11-25, siehe Kopf dieser Datei).
 */
const NOT_YET_DECLARED = BUILT.notYet;

/**
 * Die Erklärung eines Kanals, `null`, wenn er (noch) keine hat.
 *
 * @param {string} channel
 * @returns {Readonly<object>|null}
 */
function declarationOf(channel) {
  return DECLARATIONS.get(channel) || null;
}

/**
 * Darf der Kanal angemeldet werden? Wirft, wenn er weder erklärt ist noch in
 * der Übergangs-Liste steht; die Anmelde-Stelle ruft das vor jeder Anmeldung.
 *
 * @param {string} channel
 * @returns {Readonly<object>|null} Die Erklärung oder `null` (Übergangs-Liste).
 * @throws {Error} bei einem Kanal ohne Erklärung.
 */
function assertRegistrable(channel) {
  const decl = DECLARATIONS.get(channel);
  if (decl) return decl;
  if (NOT_YET_DECLARED.has(channel)) return null;
  throw new Error(
    `Kanal ${String(channel)} ohne Erklärung: im Teil seiner Kanal-Gruppe unter src/main/ipc/channel-declarations/ eintragen.`,
  );
}

module.exports = {
  NO_PATH,
  SCOPES,
  GRANT_KINDS,
  KEY_FORMS,
  DECLARATIONS,
  NOT_YET_DECLARED,
  declarationOf,
  assertRegistrable,
};
