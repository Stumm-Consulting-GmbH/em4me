// 4T-001586 (Story 4S-000904, Epic 3E-000160): Modell und Format der
// Austausch-Datei — Schreiben und Lesen in einem Modul.
//
// Das Format ist die einzige Zusicherung dieses Epics nach außen: Sobald die
// erste Datei den Rechner des Anwenders verlässt, ist sie eine Schnittstelle,
// die spätere Programm-Fassungen noch lesen müssen. Deshalb liegt das
// Struktur-Wissen an genau einer Stelle und nicht verteilt über Ausgabe- und
// Einlese-Weg.
//
// Form nach Zug-Entscheidung Z1 vom 2026-09-08: eine Markdown-Datei mit
// Frontmatter für die Kopfdaten und je Datenart ein Fence-Block.
//
//     ---
//     em4me: "settings"
//     formatVersion: 1
//     created: "2026-09-08T10:43:12Z"
//     origin:
//       program: "EM4me"
//       version: "1.130.0"
//     ---
//
//     ## Farbschemas
//
//     ```json em4me:colorSchemes
//     { … }
//     ```
//
// Prozessneutral nach den Entwicklungsrichtlinien, Kapitel 1: kein Datei-Zugriff,
// kein Electron, kein DOM. Ausgabe und Einlesen liegen nicht im selben Prozess —
// die globalen Werte hält allein der Hauptprozess (Befund B1 der Konzept-Stufe,
// `src/main/app/settings-store.js:115-176`) —, ein an eine Seite gebundenes
// Modul müsste auf der anderen nachgebaut werden.
//
// Das Modul kennt Abschnitte mit Namen und Inhalt, nicht deren Bedeutung: Welche
// Datenarten es gibt, entscheidet der Aufrufer (4T-001587), nicht das Format.
'use strict';

const yaml = require('js-yaml');
const { extractFrontmatter } = require('./markdown/frontmatter');

// Der Schlüssel, der eine Datei als unsere ausweist, und zugleich Träger ihrer
// Art. Zwei Aufgaben in einem Feld: Er schützt vor der beliebigen Markdown-Datei,
// die im Öffnen-Dialog gewählt wird, und benennt die Art, sodass eine zweite
// Austausch-Art später keine Format-Änderung braucht.
const MARKER_KEY = 'em4me';

// Fassung des FORMATS, nicht des Programms — sie beginnt bei 1 und steigt
// seltener, weil sich das Format seltener ändert als die Anwendung.
const FORMAT_VERSION = 1;

// Erstes Wort des Info-Strings, damit jeder Markdown-Leser den Inhalt als JSON
// einfärbt; der Name der Datenart folgt als zweites Wort hinter der Marke. Ein
// eigener Sprach-Name je Datenart hätte die Einfärbung gekostet und die
// Fence-Sprachen der Anwendung um einen Eintrag je Datenart wachsen lassen.
const FENCE_LANGUAGE = 'json';
const NAME_MARKER = 'em4me:';

// Punkte sind zugelassen, weil Einstellungs-Schlüssel sie führen
// (`templates.folder`, `panelToggle.order`, `extensions.disabled`); Leerzeichen
// nicht, weil der Name im Info-String eines Fence-Blocks steht.
const SECTION_NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;

/**
 * Zeitpunkt in der Konvention des Projekts: UTC ISO-8601, sekundengenau.
 *
 * @param {Date|number|string} wert
 * @returns {string|null} Normalisierter Zeitpunkt oder null bei unbrauchbarer Angabe.
 */
function normalizeTimestamp(wert) {
  const datum = wert instanceof Date ? wert : new Date(wert);
  const zeit = datum.getTime();
  if (!Number.isFinite(zeit)) return null;
  return datum.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Kopfdaten der Herkunft. Ein nicht ermittelbarer Wert wird WEGGELASSEN statt
 * als null geschrieben — nach dem Muster von `mdd-herkunft.js`, damit der Leser
 * einen Fall hat statt zweier. Bewusst Programm und Fassung statt Benutzer und
 * Rechner: Die Datei ist zur Weitergabe gedacht (Kalender-System von Bereich zu
 * Bereich, 4T-001590) und soll keine Personen-Angabe mitführen.
 *
 * @param {{program?: string, version?: string}|null|undefined} origin
 * @returns {{program?: string, version?: string}}
 */
function originFields(origin) {
  const felder = {};
  if (!origin || typeof origin !== 'object') return felder;
  if (typeof origin.program === 'string' && origin.program !== '') {
    felder.program = origin.program;
  }
  if (typeof origin.version === 'string' && origin.version !== '') {
    felder.version = origin.version;
  }
  return felder;
}

/**
 * Länge des Zauns für einen Block-Inhalt. Der Regelfall sind drei Rückstriche;
 * enthält der Inhalt selbst eine Zaun-Zeile, wächst der äußere Zaun darüber
 * hinaus. Bei JSON-Ausgabe kann das nicht vorkommen (Zeilenumbrüche in
 * Zeichenketten sind escaped), die Absicherung kostet aber nichts und hält das
 * Modell auch für später nicht-JSON-artige Inhalte tragfähig.
 *
 * @param {string} inhalt
 * @returns {number}
 */
function fenceLength(inhalt) {
  let laengste = 0;
  for (const zeile of String(inhalt).split('\n')) {
    const treffer = zeile.match(/^(`{3,})/);
    if (treffer && treffer[1].length > laengste) laengste = treffer[1].length;
  }
  return Math.max(3, laengste + 1);
}

/**
 * Schreibt eine Austausch-Datei.
 *
 * @param {object} eingabe
 * @param {string} eingabe.kind Art der Datei, steht im Marker-Feld.
 * @param {Array<{name: string, title?: string, value: *}>} eingabe.sections
 *   Abschnitte in der Reihenfolge, in der sie in der Datei erscheinen sollen.
 * @param {Date|number|string} [eingabe.created] Zeitpunkt der Ausgabe.
 * @param {{program?: string, version?: string}} [eingabe.origin] Herkunft.
 * @param {number} [eingabe.formatVersion] Format-Fassung; Vorgabe FORMAT_VERSION.
 * @returns {{ok: true, text: string}|{ok: false, error: string, section?: string}}
 *   Fehler werden gemeldet, nicht geworfen ({ok,error}-Muster der bestehenden
 *   Datei-Wege, `src/main/ipc/files.js:73-125`).
 */
function writeExchangeFile(eingabe) {
  const { kind, sections, created, origin, formatVersion } = eingabe || {};
  if (typeof kind !== 'string' || kind.trim() === '') {
    return { ok: false, error: 'invalid-kind' };
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return { ok: false, error: 'no-sections' };
  }
  const zeitpunkt = normalizeTimestamp(created === undefined ? new Date() : created);
  if (zeitpunkt === null) return { ok: false, error: 'invalid-created' };

  const kopf = {
    [MARKER_KEY]: kind.trim(),
    formatVersion:
      Number.isInteger(formatVersion) && formatVersion > 0 ? formatVersion : FORMAT_VERSION,
    created: zeitpunkt,
  };
  const herkunft = originFields(origin);
  if (Object.keys(herkunft).length > 0) kopf.origin = herkunft;

  const gesehen = new Set();
  const bloecke = [];
  for (const abschnitt of sections) {
    const name = abschnitt && typeof abschnitt.name === 'string' ? abschnitt.name : '';
    if (!SECTION_NAME_RE.test(name)) {
      return { ok: false, error: 'invalid-section-name', section: name };
    }
    if (gesehen.has(name)) return { ok: false, error: 'duplicate-section', section: name };
    gesehen.add(name);

    let inhalt;
    try {
      inhalt = JSON.stringify(abschnitt.value, null, 2);
    } catch {
      // Zyklischer Wert: der Aufrufer bekommt den Namen und kann ihn benennen.
      return { ok: false, error: 'unserializable-section', section: name };
    }
    if (inhalt === undefined) {
      return { ok: false, error: 'unserializable-section', section: name };
    }
    const zaun = '`'.repeat(fenceLength(inhalt));
    const titel =
      typeof abschnitt.title === 'string' && abschnitt.title !== '' ? abschnitt.title : name;
    // Die Überschrift ist Beiwerk für den Leser: In der gerenderten Ansicht ist
    // der Info-String unsichtbar, ohne sie stünde dort ein Stapel unbenannter
    // Blöcke. Gelesen wird sie nie — den Namen trägt allein der Info-String.
    bloecke.push(
      `## ${titel}\n\n${zaun}${FENCE_LANGUAGE} ${NAME_MARKER}${name}\n${inhalt}\n${zaun}`,
    );
  }

  const frontmatter = yaml.dump(kopf, {
    lineWidth: -1,
    noRefs: true,
    // Erzwungene Anführungszeichen halten den Rundlauf der Kopfdaten dicht: eine
    // Fassung wie "1.130" käme sonst als Zahl zurück statt als Zeichenkette.
    forceQuotes: true,
    quotingType: '"',
  });
  return { ok: true, text: `---\n${frontmatter}---\n\n${bloecke.join('\n\n')}\n` };
}

/**
 * Liest den Rumpf einer Austausch-Datei in benannte Abschnitte.
 *
 * @param {string} body Text nach dem Frontmatter.
 * @returns {{ok: true, sections: Array<{name: string, value: *}>}|{ok: false, error: string, section?: string}}
 */
function parseSections(body) {
  const zeilen = String(body).split(/\r?\n/);
  const sections = [];
  const gesehen = new Set();
  for (let i = 0; i < zeilen.length; i += 1) {
    const auf = zeilen[i].match(/^(`{3,})(.*)$/);
    if (!auf) continue;
    const zaunLaenge = auf[1].length;
    const info = auf[2].trim().split(/\s+/).filter(Boolean);
    const inhalt = [];
    let geschlossen = false;
    let j = i + 1;
    for (; j < zeilen.length; j += 1) {
      if (new RegExp(`^\`{${zaunLaenge},}\\s*$`).test(zeilen[j])) {
        geschlossen = true;
        break;
      }
      inhalt.push(zeilen[j]);
    }
    if (!geschlossen) return { ok: false, error: 'unterminated-fence' };
    i = j;

    // Ein Block ohne unsere Marke ist keine Datenart. Er wird nicht still
    // übergangen, sondern gemeldet: Ein stiller Teil-Import ist nach
    // Zug-Entscheidung Z3 ausgeschlossen, und eine von Hand gelöschte Marke
    // wäre genau das.
    if (info[0] !== FENCE_LANGUAGE || !info[1] || !info[1].startsWith(NAME_MARKER)) {
      return { ok: false, error: 'unmarked-fence' };
    }
    const name = info[1].slice(NAME_MARKER.length);
    if (!SECTION_NAME_RE.test(name)) {
      return { ok: false, error: 'invalid-section-name', section: name };
    }
    if (gesehen.has(name)) return { ok: false, error: 'duplicate-section', section: name };
    gesehen.add(name);

    let value;
    try {
      value = JSON.parse(inhalt.join('\n'));
    } catch {
      return { ok: false, error: 'invalid-section-content', section: name };
    }
    sections.push({ name, value });
  }
  return { ok: true, sections };
}

/**
 * Liest eine Austausch-Datei.
 *
 * Unbekannte Abschnitte gehen nicht verloren: Sie stehen in `sections` wie alle
 * anderen und zusätzlich mit Namen in `unknownSections`. Das ist die Grundlage,
 * auf der 4T-001588 die ältere Fassung meldet statt sie abzuweisen — dasselbe
 * Muster, mit dem der Container der Bereichsdatei unbekannte Sektionen
 * überleben lässt (Befund B2, `src/main/area/area-config.js:53-383`).
 *
 * Eine `formatVersion` über der eigenen wird nicht abgewiesen, sondern
 * zurückgegeben; ob sie tragbar ist, entscheidet der Aufrufer.
 *
 * @param {string} text Inhalt der Datei.
 * @param {{knownSections?: string[]}} [optionen] Namen, die der Aufrufer kennt.
 * @returns {{ok: true, kind: string, formatVersion: number, created: string|null,
 *   origin: {program?: string, version?: string},
 *   sections: Array<{name: string, value: *}>, unknownSections: string[]}
 *   |{ok: false, error: string, section?: string}}
 */
function readExchangeFile(text, optionen) {
  const fm = extractFrontmatter(String(text == null ? '' : text));
  if (fm.parseError) return { ok: false, error: 'invalid-frontmatter' };
  if (!fm.data) return { ok: false, error: 'no-frontmatter' };

  const kind = fm.data[MARKER_KEY];
  if (typeof kind !== 'string' || kind.trim() === '') {
    return { ok: false, error: 'not-an-exchange-file' };
  }
  const formatVersion = fm.data.formatVersion;
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    return { ok: false, error: 'invalid-format-version' };
  }

  const geparst = parseSections(fm.body);
  if (!geparst.ok) return geparst;

  const bekannt = new Set(
    optionen && Array.isArray(optionen.knownSections) ? optionen.knownSections : [],
  );
  const unknownSections =
    bekannt.size === 0
      ? []
      : geparst.sections.filter((s) => !bekannt.has(s.name)).map((s) => s.name);

  return {
    ok: true,
    kind: kind.trim(),
    formatVersion,
    created: typeof fm.data.created === 'string' ? fm.data.created : null,
    origin: originFields(fm.data.origin),
    sections: geparst.sections,
    unknownSections,
  };
}

module.exports = {
  MARKER_KEY,
  FORMAT_VERSION,
  FENCE_LANGUAGE,
  NAME_MARKER,
  writeExchangeFile,
  readExchangeFile,
};
