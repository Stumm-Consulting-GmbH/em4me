// 4T-002307 (Epic 3E-000263, F1 A, S1 bis S3, S6): Die Rollen im Steckbrief
// der Datenbank, ausgelegt samt Hinweisen.
//
// **Träger der Berechtigung ist die Rolle** (E12.2), ein benannter Satz von
// Erlaubnissen in der Definition, und nicht der Anmeldename. Entscheidung des
// Product Owners vom 2026-10-17 (F1 Option A): Im Steckbrief-Behälter
// `db-database` ordnet der Schlüssel `roles` je Rolle entweder das Wort `all`
// oder eine Zuordnung von Tabellen-Name zu einer Liste der Operationen zu.
//
//   roles:
//     librarian: all
//     assistant:
//       Library: [update]
//       Loans: [create, update, delete]
//
// **Vier Operationen je Tabelle** (E12.3, S2): `create`, `update` und `delete`
// tragen dieselben Wörter wie die Handgriffe der Listen-Maske
// (`LIST_HANDGRIFFE` in `list-angaben.js`) und die Arten des Änderungsbelegs;
// `define` ist die vierte, die Trennung zwischen dem Pflegen von Daten und dem
// Ändern des Schemas. Das Wort `all` hat drei Lagen: als Wert einer Rolle alle
// vier Operationen an allen Tabellen, als Tabellen-Name alle Tabellen, als
// Eintrag einer Liste alle vier Operationen. Operationen und `all` werden wie
// die Handgriffe der Listen-Maske ohne Rücksicht auf die Schreibung gelesen;
// Rollen-Namen gelten wie geschrieben (S2).
//
// **Weich nach E22, mit benannter Folge** (S3): Eine unbrauchbare Angabe meldet
// sich als Hinweis des Steckbriefs, und die betroffene Rolle gilt als nicht
// gesetzt, sie fehlt in der Auslegung. Eine halb ausgelegte Rolle gibt es
// nicht: Wer einer Rolle weniger zugestände, als der Autor meinte, prüfte
// später gegen eine Erlaubnis, die niemand geschrieben hat.
//
// **Ob eine Tabelle bekannt ist, weiß allein der Katalog.** Die Auslegung hier
// liest ein Dokument und kennt die Tabellen der Datenbank nicht, wie der
// Steckbrief selbst. Den Abgleich gegen die Tabellen-Namen führt
// `pruefeRollenGegenTabellen`; aufgerufen wird sie von der Stelle, die die
// Namen kennt (`katalogUeberblick` und die Konsistenz-Prüfung über den
// Katalog). Verglichen wird ohne Rücksicht auf die Schreibung, wie der Katalog
// eine Tabelle über ihren Namen findet (`tabellenDefinition`).
//
// **Zuordnung und Vorgabe-Rolle** (4T-002308, F2 A, S3): `users` ordnet je
// Anmeldename den Namen einer Rolle zu, `defaultRole` nennt die Rolle, die ein
// nicht zugeordneter Anmeldename bekommt. Beide legt `legeRollenAus` mit aus;
// eine Angabe in falscher Form meldet sich und gilt als nicht gesetzt. Ob die
// genannte Rolle existiert, prüft `pruefeZuordnung`, erst nach dem Abgleich
// gegen die Tabellen, weil eine Rolle dort noch entfallen kann. Rollen-Namen
// und Anmeldenamen gelten exakt wie geschrieben, ohne Umwandlung der
// Schreibung, denn der Anmeldename wird später wörtlich mit dem der Herkunft
// verglichen.
//
// Blatt-Modul innerhalb der Datenbank: Es lädt allein `behaelter.js`,
// `table-hinweise.js` und `beschriftung.js`, alle drei Blätter.
//
// Prozess-neutral (kein Electron, kein DOM).
'use strict';

const { DB_DATABASE_KEY } = require('./behaelter.js');
const { baueHinweis } = require('./table-hinweise.js');
const { istEinfachesObjekt } = require('./beschriftung.js');

// Die vier Operationen, in der Reihenfolge, in der die Auslegung sie führt.
const ROLLEN_OPERATIONEN = Object.freeze(['create', 'update', 'delete', 'define']);

// Das Wort für «alles» in allen drei Lagen.
const ROLLEN_ALLE = 'all';

// Die Hinweis-Codes der Rollen. Die Konsistenz-Prüfung erkennt an ihnen, welche
// Hinweise des Steckbriefs sie als Befund führt.
const ROLLEN_HINWEISE = Object.freeze([
  'roles',
  'roleShape',
  'roleTableShape',
  'roleOperation',
  'roleTable',
]);

// Codes, deren Hinweis eine Tabelle nennt (im Feld `key`, siehe unten).
const MIT_TABELLE = new Set(['roleTableShape', 'roleOperation', 'roleTable']);

// 4T-002308: Die Hinweis-Codes der Zuordnung und der Vorgabe-Rolle. Die drei
// ersten entstehen beim Lesen, die zwei letzten in `pruefeZuordnung`.
const ZUORDNUNG_HINWEISE = Object.freeze([
  'users',
  'userShape',
  'defaultRoleShape',
  'defaultRoleUnknown',
  'userRoleUnknown',
]);

// Ein Wort aus der Datei, getrimmt und klein, wie die Handgriffe der
// Listen-Maske; ein Eintrag anderen Typs als Text, damit der Hinweis ihn nennt.
function wortVon(eintrag) {
  return (typeof eintrag === 'string' ? eintrag : String(eintrag)).trim().toLowerCase();
}

function istAlle(roh) {
  return typeof roh === 'string' && wortVon(roh) === ROLLEN_ALLE;
}

// Eine Eigenschaft als eigene setzen, auch bei einem Namen wie `__proto__`:
// Rollen- und Tabellen-Namen kommen aus der Datei des Anwenders.
function setze(ziel, name, wert) {
  Object.defineProperty(ziel, name, {
    value: wert,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Ein Hinweis an einer Rolle. `name` ist die Rolle; `key` ist bei den Hinweisen
// an einer Tabelle der Tabellen-Name, weil er der Schlüssel ist, unter dem die
// unbrauchbare Angabe steht (Muster `listAngabeUnbekannt`); `wert` ist die
// unbekannte Operation. Der Satz setzt alle drei ein (`hinweisSatz`).
function rollenHinweis(code, rolle, { tabelle, wert, expected } = {}) {
  const hinweis = baueHinweis(code, -1, rolle, expected);
  if (tabelle !== undefined) hinweis.key = tabelle;
  if (wert !== undefined) hinweis.wert = wert;
  return hinweis;
}

// Die Operationen an einer Tabelle: `all` oder eine Liste. Liefert die Liste in
// der Reihenfolge von ROLLEN_OPERATIONEN ohne Doppel, oder null, wenn die
// Angabe unbrauchbar ist. Jede unbekannte Operation meldet sich einzeln, damit
// der Autor alle Fehler einer Rolle auf einmal sieht.
function legeOperationenAus(roh, rolle, tabelle, hints) {
  if (istAlle(roh)) return [...ROLLEN_OPERATIONEN];
  if (!Array.isArray(roh)) {
    hints.push(rollenHinweis('roleTableShape', rolle, { tabelle }));
    return null;
  }
  const gesetzt = new Set();
  let brauchbar = true;
  for (const eintrag of roh) {
    const wort = wortVon(eintrag);
    if (wort === ROLLEN_ALLE) ROLLEN_OPERATIONEN.forEach((op) => gesetzt.add(op));
    else if (ROLLEN_OPERATIONEN.includes(wort)) gesetzt.add(wort);
    else {
      brauchbar = false;
      const wert = typeof eintrag === 'string' ? eintrag.trim() : String(eintrag);
      const expected = [...ROLLEN_OPERATIONEN];
      hints.push(rollenHinweis('roleOperation', rolle, { tabelle, wert, expected }));
    }
  }
  return brauchbar ? ROLLEN_OPERATIONEN.filter((op) => gesetzt.has(op)) : null;
}

// Eine Rolle: `all` oder eine Zuordnung von Tabelle zu Operationen. Liefert den
// Eintrag der Auslegung oder null, wenn die Rolle als nicht gesetzt gilt; die
// übrigen Tabellen der Rolle werden dennoch gelesen und melden sich.
function legeRolleAus(rolle, roh, hints) {
  if (istAlle(roh)) return { alle: true, operationen: {}, alleTabellen: null };
  if (!istEinfachesObjekt(roh)) {
    hints.push(rollenHinweis('roleShape', rolle));
    return null;
  }
  const eintrag = { alle: false, operationen: {}, alleTabellen: null };
  let brauchbar = true;
  for (const tabelle of Object.keys(roh)) {
    const ops = legeOperationenAus(roh[tabelle], rolle, tabelle, hints);
    if (ops === null) brauchbar = false;
    else if (wortVon(tabelle) !== ROLLEN_ALLE) setze(eintrag.operationen, tabelle, ops);
    // Zwei Schreibungen von `all` vereinigen sich, statt einander zu ersetzen.
    else {
      const bisher = eintrag.alleTabellen || [];
      eintrag.alleTabellen = ROLLEN_OPERATIONEN.filter((op) => [...bisher, ...ops].includes(op));
    }
  }
  return brauchbar ? eintrag : null;
}

// 4T-002308: Die Angabe `defaultRole`. Liefert den Rollen-Namen oder null; ein
// Wert, der kein Text ist, meldet sich und gilt als nicht gesetzt.
function legeVorgabeAus(behaelter, hints) {
  const roh = behaelter.defaultRole;
  if (roh === undefined || roh === null || roh === '') return null;
  if (typeof roh === 'string') return roh;
  hints.push(baueHinweis('defaultRoleShape', -1, null));
  return null;
}

// 4T-002308: Die Angabe `users`. Liefert die Zuordnung Anmeldename -> Rolle;
// eine Zuordnung, deren Wert kein Text ist, meldet sich und fehlt, die übrigen
// gelten.
function legeZuordnungAus(behaelter, hints) {
  const users = {};
  const roh = behaelter.users;
  if (roh === undefined || roh === null || roh === '') return users;
  if (!istEinfachesObjekt(roh)) {
    hints.push(baueHinweis('users', -1, null));
    return users;
  }
  for (const name of Object.keys(roh)) {
    if (typeof roh[name] === 'string' && roh[name] !== '') setze(users, name, roh[name]);
    else hints.push(baueHinweis('userShape', -1, name));
  }
  return users;
}

/**
 * Legt die Angaben `roles`, `defaultRole` und `users` des Steckbrief-Behälters aus.
 *
 * Ohne `roles`, oder mit einer leeren Angabe, ist `rollen` ein leeres Objekt
 * und ohne Hinweis: Eine Datenbank ohne Rollen verhält sich wie bisher (E12.5).
 * Hinweis-Codes: `roles` (die Angabe ist kein Objekt, keine Rolle gilt),
 * `roleShape` (eine Rolle ist weder `all` noch eine Zuordnung), `roleTableShape`
 * (an einer Tabelle steht weder eine Liste noch `all`) und `roleOperation`
 * (eine unbekannte Operation); in den drei letzten Fällen fehlt die Rolle.
 * Seit 4T-002308 dazu `defaultRoleShape` (`defaultRole` ist kein Text), `users`
 * (`users` ist kein Objekt) und `userShape` (der Wert einer Zuordnung ist kein
 * Text, `name` der Anmeldename); die betroffene Angabe gilt als nicht gesetzt.
 *
 * @param {object|null} behaelter Der Behälter `db-database`.
 * @param {Array<object>} [hints] Die Hinweis-Liste, an die angehängt wird.
 * @returns {{rollen: Object<string, {alle: boolean, operationen: Object<string,
 *   string[]>, alleTabellen: string[]|null}>, defaultRole: string|null,
 *   users: Object<string, string>, hints: Array<object>}}
 */
function legeRollenAus(behaelter, hints = []) {
  const rollen = {};
  if (!istEinfachesObjekt(behaelter)) return { rollen, defaultRole: null, users: {}, hints };
  const roh = behaelter.roles;
  if (istEinfachesObjekt(roh)) {
    for (const rolle of Object.keys(roh)) {
      const eintrag = legeRolleAus(rolle, roh[rolle], hints);
      if (eintrag !== null) setze(rollen, rolle, eintrag);
    }
  } else if (roh !== undefined && roh !== null && roh !== '') {
    hints.push(baueHinweis('roles', -1, null));
  }
  const defaultRole = legeVorgabeAus(behaelter, hints);
  const users = legeZuordnungAus(behaelter, hints);
  return { rollen, defaultRole, users, hints };
}

/**
 * Prüft Vorgabe-Rolle und Zuordnung gegen die endgültigen Rollen (4T-002308,
 * S3), also nach dem Abgleich gegen die Tabellen.
 *
 * Nennt `defaultRole` eine Rolle, die es nicht gibt, entsteht der Hinweis
 * `defaultRoleUnknown` (`name` die Rolle, `expected` die vorhandenen Rollen),
 * und es gilt keine Vorgabe-Rolle; nennt eine Zuordnung eine solche Rolle,
 * entsteht `userRoleUnknown` (`name` der Anmeldename, `wert` die Rolle), und
 * die Zuordnung fehlt. Verglichen wird exakt, wie Rollen-Namen geschrieben
 * sind (S2).
 *
 * @param {object} p Parameter.
 * @param {object} p.rollen Die geprüften Rollen.
 * @param {string|null} p.defaultRole Die Vorgabe-Rolle aus `legeRollenAus`.
 * @param {Object<string, string>} p.users Die Zuordnung aus `legeRollenAus`.
 * @returns {{defaultRole: string|null, users: Object<string, string>, hints: Array<object>}}
 */
function pruefeZuordnung({ rollen, defaultRole, users }) {
  const quelle = rollen || {};
  const vorhanden = (name) => Object.prototype.hasOwnProperty.call(quelle, name);
  const hints = [];
  let vorgabe = typeof defaultRole === 'string' && defaultRole !== '' ? defaultRole : null;
  if (vorgabe !== null && !vorhanden(vorgabe)) {
    hints.push(baueHinweis('defaultRoleUnknown', -1, vorgabe, Object.keys(quelle)));
    vorgabe = null;
  }
  const geprueft = {};
  for (const name of Object.keys(users || {})) {
    const rolle = users[name];
    if (vorhanden(rolle)) setze(geprueft, name, rolle);
    else hints.push(rollenHinweis('userRoleUnknown', name, { wert: rolle }));
  }
  return { defaultRole: vorgabe, users: geprueft, hints };
}

/**
 * Rollen, Vorgabe-Rolle und Zuordnung eines Steckbriefs, vollständig geprüft:
 * Auslegung, Abgleich gegen die Tabellen und Prüfung der Zuordnung, in dieser
 * Reihenfolge (4T-002308). Die eine Stelle, die Katalog, Konsistenz-Prüfung und
 * Auflösung der eigenen Rolle gemeinsam nutzen.
 *
 * @param {object|null} data Das Frontmatter-Objekt des Steckbrief-Dokuments.
 * @param {string[]} tabellenNamen Die Namen der Tabellen der Datenbank.
 * @returns {{rollen: object, defaultRole: string|null, users: Object<string, string>,
 *   leseHinweise: Array<object>, pruefHinweise: Array<object>}} `leseHinweise`
 *   entstehen beim Lesen (dieselben wie im Steckbrief), `pruefHinweise` erst im
 *   Abgleich gegen Tabellen und Rollen.
 */
function pruefeSteckbriefRollen(data, tabellenNamen) {
  const behaelter = istEinfachesObjekt(data) ? data[DB_DATABASE_KEY] : null;
  const gelesen = legeRollenAus(behaelter);
  const tabellen = pruefeRollenGegenTabellen(gelesen.rollen, tabellenNamen, genannteTabellen(data));
  const zuordnung = pruefeZuordnung({
    rollen: tabellen.rollen,
    defaultRole: gelesen.defaultRole,
    users: gelesen.users,
  });
  return {
    rollen: tabellen.rollen,
    defaultRole: zuordnung.defaultRole,
    users: zuordnung.users,
    leseHinweise: gelesen.hints,
    pruefHinweise: [...tabellen.hints, ...zuordnung.hints],
  };
}

/**
 * Die Tabellen, die jede Rolle der Datei nennt, ohne das Wort `all` — auch für
 * eine Rolle, die beim Lesen als nicht gesetzt gilt. Der Abgleich gegen die
 * Tabellen meldet ihre unbekannte Tabelle damit ebenso, und der Autor sieht
 * alle Fehler einer Rolle auf einmal statt einen nach dem anderen.
 *
 * @param {object|null} data Das Frontmatter-Objekt des Steckbrief-Dokuments.
 * @returns {Object<string, string[]>} Je Rolle die genannten Tabellen-Namen.
 */
function genannteTabellen(data) {
  const behaelter = istEinfachesObjekt(data) ? data[DB_DATABASE_KEY] : null;
  const roh = istEinfachesObjekt(behaelter) ? behaelter.roles : null;
  const genannt = {};
  if (!istEinfachesObjekt(roh)) return genannt;
  for (const rolle of Object.keys(roh)) {
    if (!istEinfachesObjekt(roh[rolle])) continue;
    const tabellen = Object.keys(roh[rolle]).filter((t) => wortVon(t) !== ROLLEN_ALLE);
    setze(genannt, rolle, tabellen);
  }
  return genannt;
}

/**
 * Hält die ausgelegten Rollen gegen die Tabellen der Datenbank.
 *
 * Eine Rolle, die eine unbekannte Tabelle nennt, gilt als nicht gesetzt und
 * fehlt im Ergebnis; je unbekannter Tabelle entsteht ein Hinweis `roleTable`
 * mit den vorhandenen Tabellen-Namen als Erwartung. `all` als Wert und als
 * Tabellen-Name braucht keinen Abgleich. Ohne `genannt` werden die Tabellen
 * der ausgelegten Rollen geprüft; mit `genannt` (aus `genannteTabellen`)
 * auch die der Rollen, die beim Lesen schon entfallen sind.
 *
 * @param {object} rollen Die Rollen aus `legeRollenAus`.
 * @param {string[]} tabellenNamen Die Namen der Tabellen der Datenbank.
 * @param {Object<string, string[]>|null} [genannt] Je Rolle die genannten Tabellen.
 * @returns {{rollen: object, hints: Array<object>}}
 */
function pruefeRollenGegenTabellen(rollen, tabellenNamen, genannt = null) {
  const namen = Array.isArray(tabellenNamen) ? tabellenNamen : [];
  const bekannt = new Set(namen.map((n) => String(n).toLowerCase()));
  const quelle = rollen || {};
  const jeRolle = genannt || {};
  if (!genannt)
    for (const rolle of Object.keys(quelle))
      setze(jeRolle, rolle, Object.keys(quelle[rolle].operationen || {}));
  const verworfen = new Set();
  const hints = [];
  for (const rolle of Object.keys(jeRolle)) {
    for (const tabelle of jeRolle[rolle].filter((t) => !bekannt.has(t.toLowerCase()))) {
      hints.push(rollenHinweis('roleTable', rolle, { tabelle, expected: [...namen] }));
      verworfen.add(rolle);
    }
  }
  const geprueft = {};
  for (const rolle of Object.keys(quelle))
    if (!verworfen.has(rolle)) setze(geprueft, rolle, quelle[rolle]);
  return { rollen: geprueft, hints };
}

/**
 * Die Hinweise der Rollen eines Steckbriefs als Angaben für Befunde der
 * Konsistenz-Prüfung: dieselbe Auslegung und derselbe Abgleich wie in der
 * Übersicht, damit beide auf dieselbe Frage dieselbe Antwort geben.
 *
 * @param {object|null} data Das Frontmatter-Objekt des Steckbrief-Dokuments.
 * @param {string[]} tabellenNamen Die Namen der Tabellen der Datenbank.
 * @param {string} datei Pfad des Steckbrief-Dokuments.
 * @returns {Array<{datei: string, wert: string, zieltabelle: string|null}>}
 *   `wert` ist die Rolle oder, bei einer Zuordnung, der Anmeldename; bei einem
 *   Hinweis an der ganzen Angabe (`roles`, `users`, `defaultRoleShape`) die
 *   Angabe selbst. Seit 4T-002308 mit den Hinweisen der Zuordnung.
 */
function rollenBefundAngaben(data, tabellenNamen, datei) {
  const geprueft = pruefeSteckbriefRollen(data, tabellenNamen);
  const hints = [...geprueft.leseHinweise, ...geprueft.pruefHinweise];
  return hints.map((h) => ({
    datei,
    wert: h.name || h.key || 'roles',
    zieltabelle: MIT_TABELLE.has(h.code) ? h.key : null,
  }));
}

module.exports = {
  ROLLEN_OPERATIONEN,
  ROLLEN_ALLE,
  ROLLEN_HINWEISE,
  ZUORDNUNG_HINWEISE,
  genannteTabellen,
  legeRollenAus,
  pruefeRollenGegenTabellen,
  pruefeSteckbriefRollen,
  pruefeZuordnung,
  rollenBefundAngaben,
};
