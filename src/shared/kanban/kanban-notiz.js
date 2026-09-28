// 4T-001956 (Epic 3E-000319): Der Format-Kern von «Notiz aus Karte erzeugen…»
// — Titel aus dem Kartentext, Dateiname, Zielordner, Vorlagen-Angabe und die
// Text-Operation «Kartentext durch Verweis ersetzen».
//
// Prozessneutral wie der übrige Kern: reine Funktionen, kein DOM, kein
// Electron, kein Datei-Zugriff. Ob ein Ordner existiert, eine Vorlage
// auffindbar ist oder eine Datei entsteht, entscheidet die Bedienung im
// Anzeige-Prozess; hier steht nur, was sich aus Text und Angaben ableiten lässt.
//
// **Was ein Marker der Karte ist.** Drei Arten, jede aus der Erkennung des
// Bestands und nicht aus einer zweiten Regel:
//   - die Aufgaben-Marker am Zeilenende (Termine, Priorität, Wiederholung,
//     Erinnerung), die der Aufgaben-Kern ohnehin als Segmente neben dem Text
//     führt (`parseTaskLine`);
//   - die Tags, gefunden wie in Index, Lese-Ansicht und Tafel
//     (`src/shared/tag-erkennung.js`);
//   - der Termin in der Schreibweise des Vorbild-Werkzeugs (`@{…}`, `@@{…}`),
//     dessen Spannen der Tafel-Kern je Karte schon liest.
// Ein Aufgaben-Marker, der erst hinter einem Tag oder Vorbild-Termin steht, ist
// für den Aufgaben-Kern Text; er wird nach dem Herausnehmen jener Spannen noch
// einmal gelesen und damit ebenfalls als Marker erkannt. Ein Marker mitten im
// Text, hinter dem gewöhnlicher Text folgt, bleibt dagegen Text (Grenze,
// Entscheidung der steuernden Sitzung vom 2026-09-27).
'use strict';

const { leseTafel } = require('./kanban-core.js');
const { aendereKarte, holeSpalte, holeKarte } = require('./kanban-operationen.js');
const { parseMarkerSegments } = require('../tasks/task-markers.js');
const { TAG_RE, isValidTag, istInAdresse, maskiereFuerTagScan } = require('../tag-erkennung.js');
const { splitAreaLink } = require('../area-link-syntax.js');
const { segmentValidationError, toFileBasename } = require('../subpages.js');

const MD_ENDUNG_RE = /\.(md|markdown|mdown|mkd)$/i;
const VERWEIS_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

// --- Kartentext zerlegen -----------------------------------------------------------

// Länge des Zeilen-Kopfs vor dem Kartentext: Einzug, Aufzählungszeichen,
// Kästchen und der Abstand dahinter.
function kopfLaenge(aufgabe) {
  const { indent, bullet, bulletGap, statusChar, statusGap } = aufgabe;
  return `${indent}${bullet}${bulletGap}[${statusChar}]${statusGap}`.length;
}

// Die Tag-Spannen eines Textes, von links nach rechts.
function tagSpannen(text) {
  const maskiert = maskiereFuerTagScan(text);
  const re = new RegExp(TAG_RE.source, TAG_RE.flags);
  const spannen = [];
  let m;
  while ((m = re.exec(maskiert)) !== null) {
    if (istInAdresse(maskiert, m.index) || !isValidTag(m[1])) continue;
    // Ein maskiertes `\#name` ist ein wörtliches Zeichen und kein Tag.
    if (m.index > 0 && text.charAt(m.index - 1) === '\\') continue;
    spannen.push({ von: m.index, bis: m.index + 1 + m[1].length });
  }
  return spannen;
}

// Die Spannen des Vorbild-Termins im Kartentext. Der Tafel-Kern misst sie in
// der ganzen Zeile; hier zählen sie ab dem Beginn des Kartentextes.
function vorbildSpannen(karte, beginn, laenge) {
  const termin = karte.vorbildTermin;
  if (!termin || !Array.isArray(termin.spannen)) return [];
  return termin.spannen
    .map(({ von, bis }) => ({ von: von - beginn, bis: bis - beginn }))
    .filter(({ von, bis }) => von >= 0 && bis <= laenge);
}

/**
 * Der Anzeige-Text der Wiki-Verweise: ein Alias, sonst das Ziel ohne
 * Bereichs-Kürzel, Anker und Markdown-Endung. Eine Einbettung trägt hinter dem
 * Strich eine Größe und keinen Alias.
 *
 * @param {string} text
 * @returns {string}
 */
function verweiseAlsText(text) {
  return String(text).replace(VERWEIS_RE, (_ganz, ausruf, inneres) => {
    const strich = inneres.indexOf('|');
    const alias = strich >= 0 ? inneres.slice(strich + 1).trim() : '';
    if (!ausruf && alias) return alias;
    const roh = (strich >= 0 ? inneres.slice(0, strich) : inneres).trim();
    const { prefix, target } = splitAreaLink(roh);
    const ziel = prefix ? target : roh;
    const raute = ziel.indexOf('#');
    const name = raute >= 0 ? ziel.slice(0, raute) : ziel;
    return (name || (raute >= 0 ? ziel.slice(raute + 1) : '')).replace(MD_ENDUNG_RE, '').trim();
  });
}

/**
 * Zerlegt den Text einer Karte in ihren Titel und ihre Marker.
 *
 * @param {object} karte Karte aus `leseTafel` (mit `aufgabe`, `roh`,
 *   `vorbildTermin`).
 * @returns {{titel: string, marker: string[]}} `titel` ist der Kartentext ohne
 *   Marker, Wiki-Verweise durch ihren Anzeige-Text ersetzt, Leerraum
 *   zusammengefasst; `marker` sind die Marker **innerhalb** des Kartentextes in
 *   ihrer Reihenfolge. Die Aufgaben-Marker am Zeilenende stehen nicht darin:
 *   Sie gehören der Zeile und bleiben beim Ersetzen des Textes ohnehin stehen.
 */
function zerlegeKartentext(karte) {
  const aufgabe = karte && karte.aufgabe;
  if (!aufgabe) return { titel: '', marker: [] };
  const text = aufgabe.description;
  const spannen = [...vorbildSpannen(karte, kopfLaenge(aufgabe), text.length), ...tagSpannen(text)]
    .sort((a, b) => a.von - b.von)
    .filter((s, i, liste) => i === 0 || s.von >= liste[i - 1].bis);

  // Der Rest ohne die Spannen, mit der Herkunft jedes Zeichens, damit die
  // danach gefundenen Aufgaben-Marker ihre Stelle im Kartentext behalten.
  let rest = '';
  const herkunft = [];
  let pos = 0;
  for (const { von, bis } of [...spannen, { von: text.length, bis: text.length }]) {
    for (let i = pos; i < von; i++) {
      rest += text[i];
      herkunft.push(i);
    }
    pos = bis;
  }
  const gelesen = parseMarkerSegments(rest);
  const marker = spannen.map(({ von, bis }) => ({ von, text: text.slice(von, bis).trim() }));
  let stelle = gelesen.description.length;
  for (const segment of gelesen.segments) {
    marker.push({ von: herkunft[stelle], text: segment.raw.trim() });
    stelle += segment.raw.length;
  }
  marker.sort((a, b) => a.von - b.von);
  const titel = verweiseAlsText(gelesen.description).replace(/\s+/g, ' ').trim();
  return { titel, marker: marker.map((m) => m.text).filter((m) => m !== '') };
}

// --- Dateiname -----------------------------------------------------------------------

/**
 * Der Titel als Dateiname in logischer Schreibweise.
 *
 * Die Bereinigung ist neu und folgt den Zeichen-Regeln von
 * `segmentValidationError`: Schrägstriche beider Richtungen und das
 * Unterseiten-Trennzeichen werden `_` — es entsteht **keine** Unterseite
 * (Entscheidung der steuernden Sitzung vom 2026-09-27) —, ebenso die unter
 * Windows verbotenen Zeichen; Steuerzeichen werden Leerraum, Punkte und
 * Leerraum am Rand fallen weg. Besteht das Ergebnis die Prüfung nicht, ist es
 * leer: Dann fragt die Bedienung nach dem Namen.
 *
 * @param {string} titel
 * @returns {string}
 */
function dateinameAusTitel(titel) {
  const name = String(titel == null ? '' : titel)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[/\\∕<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  return segmentValidationError(name) ? '' : name;
}

/**
 * Pfad der Datei, die aus einem logischen Namen in einem Ordner entsteht —
 * dieselbe Form wie beim Anlegen aus einer Vorlage: Unterseiten-Trennzeichen
 * im Dateinamen, `.md` angehängt, sofern der Name keine Markdown-Endung trägt.
 *
 * @param {string} ordner
 * @param {string} name logischer Name.
 * @returns {string}
 */
function notizPfad(ordner, name) {
  const basis = toFileBasename(String(name).trim());
  const datei = MD_ENDUNG_RE.test(basis) ? basis : `${basis}.md`;
  const trenner = String(ordner).includes('\\') ? '\\' : '/';
  return String(ordner).replace(/[\\/]+$/, '') + trenner + datei;
}

/** Der Verweis, den die Karte auf die Notiz bekommt. */
function verweisAufNotiz(name) {
  return `[[${String(name).trim()}]]`;
}

// --- Zielordner und Vorlage ------------------------------------------------------------

/**
 * Löst die Einstellung «Zielordner» einer Tafel auf.
 *
 * Gespeichert ist sie relativ (Entscheidung der Sitzung in 4T-001955): zur
 * Bereichs-Wurzel, ohne Bereich zum Ordner der Tafel; `/` ist die Basis
 * selbst. Mit Bereich darf der Ordner die Wurzel nicht verlassen.
 *
 * @param {string|null} einstellung
 * @param {{bereichsWurzel?: string|null, tafelOrdner?: string|null}} basis
 * @returns {{ordner: string|null, eingestellt: boolean, grund?: string}}
 *   `eingestellt` sagt, ob der Ordner aus der Einstellung stammt (dann prüft
 *   die Bedienung, ob es ihn gibt); `grund` bei `ordner: null`.
 */
function zielordnerAus(einstellung, basis = {}) {
  const tafelOrdner = basis.tafelOrdner || null;
  const wurzel = basis.bereichsWurzel || null;
  const wert = typeof einstellung === 'string' ? einstellung.trim() : '';
  if (wert === '') return { ordner: tafelOrdner, eingestellt: false };
  const start = wurzel || tafelOrdner;
  if (!start) return { ordner: null, eingestellt: true, grund: 'ohneBasis' };
  const trenner = start.includes('\\') ? '\\' : '/';
  const teile = start.replace(/[\\/]+$/, '').split(/[\\/]/);
  const tiefe = teile.length;
  for (const teil of wert.split(/[\\/]+/)) {
    if (teil === '' || teil === '.') continue;
    if (teil === '..') {
      if (teile.length <= 1 || (wurzel && teile.length <= tiefe)) {
        return { ordner: null, eingestellt: true, grund: 'ausserhalb' };
      }
      teile.pop();
    } else {
      teile.push(teil);
    }
  }
  const ordner = teile.length === 1 ? teile[0] + trenner : teile.join(trenner);
  return { ordner, eingestellt: true };
}

/**
 * Liest die Einstellung «Vorlage» einer Tafel: ein Pfad in der Vorlagen-Quelle,
 * bei einer verknüpften Quelle `@kuerzel:Pfad`.
 *
 * @param {string|null} einstellung
 * @returns {{relPath: string, sourceKey: string|null}|null}
 */
function vorlageAus(einstellung) {
  const wert = typeof einstellung === 'string' ? einstellung.trim() : '';
  if (wert === '') return null;
  const treffer = /^@([^:/\\]+):(.+)$/.exec(wert);
  const pfad = (treffer ? treffer[2] : wert).replace(/\\/g, '/').replace(/^\/+/, '');
  if (pfad === '') return null;
  return { relPath: pfad, sourceKey: treffer ? treffer[1] : null };
}

/**
 * Der Eintrag der Vorlagen-Liste zu einer Angabe aus `vorlageAus`, oder null.
 *
 * @param {Array<{relPath: string, sourceKey?: string}>} liste
 * @param {{relPath: string, sourceKey: string|null}} angabe
 * @returns {object|null}
 */
function findeVorlage(liste, angabe) {
  if (!angabe || !Array.isArray(liste)) return null;
  return (
    liste.find(
      (e) =>
        e &&
        typeof e.relPath === 'string' &&
        e.relPath.replace(/\\/g, '/') === angabe.relPath &&
        (e.sourceKey || null) === angabe.sourceKey,
    ) || null
  );
}

// --- Text-Operation ---------------------------------------------------------------------

/**
 * Der neue Text einer Karte: der Verweis an Stelle des Titels, dahinter die
 * Marker des Kartentextes in ihrer Reihenfolge.
 *
 * @param {object} karte Karte aus `leseTafel`.
 * @param {string} verweis z. B. `[[Titel]]`.
 * @returns {string}
 */
function kartentextMitVerweis(karte, verweis) {
  const { marker } = zerlegeKartentext(karte);
  return [verweis, ...marker].join(' ');
}

/**
 * Ersetzt den Text einer Karte durch den Verweis auf ihre Notiz. Die Marker
 * des Kartentextes bleiben in ihrer Reihenfolge dahinter, die Aufgaben-Marker
 * am Zeilenende und die Folgezeilen unverändert; alles Übrige der Datei bleibt
 * byte-gleich (`aendereKarte`).
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, verweis: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function ersetzeKartentextDurchVerweis(text, angaben = {}) {
  const model = leseTafel(text);
  if (!model.istTafel) return { ok: false, befund: { code: 'keinTafelDokument', detail: '' } };
  const spalte = holeSpalte(model, angaben.spalte);
  if (!spalte) return { ok: false, befund: { code: 'unbekannteSpalte', detail: '' } };
  const karte = holeKarte(spalte, angaben.karte);
  if (!karte) return { ok: false, befund: { code: 'unbekannteKarte', detail: '' } };
  if (typeof angaben.verweis !== 'string' || angaben.verweis.trim() === '') {
    return { ok: false, befund: { code: 'ungueltigerKartenText', detail: '' } };
  }
  return aendereKarte(text, {
    spalte: angaben.spalte,
    karte: angaben.karte,
    kartenText: kartentextMitVerweis(karte, angaben.verweis.trim()),
  });
}

module.exports = {
  zerlegeKartentext,
  verweiseAlsText,
  dateinameAusTitel,
  notizPfad,
  verweisAufNotiz,
  zielordnerAus,
  vorlageAus,
  findeVorlage,
  kartentextMitVerweis,
  ersetzeKartentextDurchVerweis,
};
