// 4T-002348 (Epic 3E-000184): Die fünf Inhalts- und Dateikopf-Bearbeitungen
// der Workflows an einem Text (Story 4S-001103).
//
// **Eine Regel für Datei und Puffer.** Der Hauptprozess wendet sie auf den
// Stand der Platte an, das Fenster auf den ungespeicherten Stand im Editor
// (Weiche zum Editor-Puffer, A3). Zwei Fassungen derselben Einfüge-Regel
// liefen bei der nächsten Änderung auseinander; deshalb steht sie hier,
// prozess-neutral im Kern-Ordner.
//
// **Erhalten bleiben** ein Byte-Order-Zeichen am Anfang und die Zeilenenden
// der Datei: Eingefügter Text bekommt die Zeilenenden der Datei, der übrige
// Text bleibt Zeichen für Zeichen, wie er war.
//
// Die Einfüge-Regeln (Plan des Tasks, Punkt 2, mit den Entscheidungen des
// Product Owners vom 2026-10-22 und 2026-10-23):
//   - `append`: ans Ende; fehlt dort der Zeilenumbruch, wird einer vorangestellt,
//     und der eingefügte Inhalt endet mit einem Zeilenumbruch.
//   - `insert … at-start`: nach dem Dateikopf, weil ein Text davor den Dateikopf
//     zerstörte; ohne Dateikopf an Zeile 1.
//   - `insert … under`: direkt unter der Überschrift, vor dem bisherigen Inhalt
//     (E5); gesucht nach der Regel von `from-section` (O3).
//   - `replace`: wörtlich, Groß- und Kleinschreibung beachtet, jedes Vorkommen
//     über den ganzen Text einschließlich Dateikopf; kein Vorkommen ist ein
//     Fehlschlag (E3).
//   - `setProperty`, `removeProperty`: über `writeFrontmatter`, das Reihenfolge
//     und Schreibweise der übrigen Eigenschaften erhält; eine fehlende
//     Eigenschaft zu entfernen gelingt ohne Änderung (E3).
//
// Ergebnis ohne Sprache: `{ ok: true, text, changed }` oder `{ ok: false, code }`.
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const { extractFrontmatter, writeFrontmatter } = require('../markdown/frontmatter.js');
const { headingSections } = require('../markdown/heading-sections.js');
const { githubLikeSlug } = require('../markdown/slug.js');
const { frontmatterLineCount } = require('./workflow-document.js');

const BOM = '\uFEFF';

/** Die Bearbeitungs-Arten, die `applyContentEdit` kennt. */
const EDIT_OPS = Object.freeze(['append', 'insert', 'replace', 'setProperty', 'removeProperty']);

const hat = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

function fehlschlag(code) {
  return { ok: false, code };
}

// Eingefügter Inhalt mit den Zeilenenden der Datei und abschließendem Umbruch.
function einfuegeBlock(text, eol) {
  const zeilen = String(text).replace(/\r\n?/g, '\n');
  if (zeilen === '') return '';
  const mitEnde = zeilen.endsWith('\n') ? zeilen : `${zeilen}\n`;
  return eol === '\n' ? mitEnde : mitEnde.replace(/\n/g, eol);
}

// Fügt `block` an `offset` ein; steht davor kein Zeilenumbruch, kommt einer davor.
function setzeEin(text, offset, block, eol) {
  const davor = text.slice(0, offset);
  const trenner = offset > 0 && !davor.endsWith('\n') ? eol : '';
  return davor + trenner + block + text.slice(offset);
}

// Anfangs-Positionen aller Zeilen eines Texts (Zeilen getrennt an `\n`).
function zeilenAnfaenge(text) {
  const anfaenge = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') anfaenge.push(i + 1);
  return anfaenge;
}

function einfuegenUnter(text, heading, block, eol) {
  const zeilen = text.split(/\r?\n/);
  const kopf = extractFrontmatter(text);
  const gesucht = githubLikeSlug(heading);
  const treffer = headingSections(zeilen, frontmatterLineCount(kopf.raw)).filter(
    (s) => s.slug === gesucht,
  );
  if (treffer.length === 0) return fehlschlag('headingUnknown');
  if (treffer.length > 1) return fehlschlag('headingAmbiguous');
  const anfaenge = zeilenAnfaenge(text);
  const naechste = treffer[0].start + 1;
  const offset = naechste < anfaenge.length ? anfaenge[naechste] : text.length;
  return { ok: true, text: setzeEin(text, offset, block, eol) };
}

function einfuegen(text, edit, eol) {
  const block = einfuegeBlock(edit.text, eol);
  const position = edit.position || {};
  if (position.kind === 'under') {
    if (block === '') {
      const probe = einfuegenUnter(text, String(position.heading), '', eol);
      return probe.ok ? { ok: true, text } : probe;
    }
    return einfuegenUnter(text, String(position.heading), block, eol);
  }
  if (position.kind !== 'atStart') return fehlschlag('invalidStep');
  if (block === '') return { ok: true, text };
  const kopf = extractFrontmatter(text);
  return { ok: true, text: setzeEin(text, kopf.raw === null ? 0 : kopf.endOffset, block, eol) };
}

function anhaengen(text, edit, eol) {
  const block = einfuegeBlock(edit.text, eol);
  if (block === '') return { ok: true, text };
  return { ok: true, text: setzeEin(text, text.length, block, eol) };
}

function ersetzen(text, edit) {
  const suche = String(edit.search == null ? '' : edit.search);
  if (suche === '') return fehlschlag('invalidStep');
  const teile = text.split(suche);
  if (teile.length < 2) return fehlschlag('textNotFound');
  return { ok: true, text: teile.join(String(edit.replacement == null ? '' : edit.replacement)) };
}

function eigenschaftSetzen(text, edit) {
  const kopf = extractFrontmatter(text);
  if (kopf.parseError) return fehlschlag('frontmatterInvalid');
  const daten = kopf.data || {};
  const schluessel = String(edit.key);
  if (hat(daten, schluessel) && JSON.stringify(daten[schluessel]) === JSON.stringify(edit.value)) {
    return { ok: true, text };
  }
  const leer = edit.value === '';
  const geschrieben = writeFrontmatter(
    text,
    { ...daten, [schluessel]: edit.value },
    leer ? { emptyStubKeys: [schluessel] } : {},
  );
  return geschrieben.ok ? { ok: true, text: geschrieben.text } : fehlschlag('frontmatterInvalid');
}

function eigenschaftEntfernen(text, edit) {
  const kopf = extractFrontmatter(text);
  if (kopf.parseError) return fehlschlag('frontmatterInvalid');
  const schluessel = String(edit.key);
  if (!kopf.data || !hat(kopf.data, schluessel)) return { ok: true, text };
  const rest = { ...kopf.data };
  delete rest[schluessel];
  const geschrieben = writeFrontmatter(text, rest);
  return geschrieben.ok ? { ok: true, text: geschrieben.text } : fehlschlag('frontmatterInvalid');
}

/**
 * Wendet eine Inhalts- oder Dateikopf-Bearbeitung auf einen Text an.
 *
 * @param {string} text Inhalt der Datei oder des Puffers (auch mit
 *   Byte-Order-Zeichen und CRLF-Zeilenenden).
 * @param {{op: string, text?: string, position?: {kind: 'atStart'}|{kind: 'under', heading: string},
 *   search?: string, replacement?: string, key?: string, value?: (string|number)}} edit
 *   `append` und `insert` mit fertigem `text`; `replace` mit `search` und
 *   `replacement`; `setProperty` mit `key` und `value`; `removeProperty` mit `key`.
 * @returns {{ok: true, text: string, changed: boolean}|{ok: false, code: string}}
 *   Codes: `invalidStep`, `headingUnknown`, `headingAmbiguous`, `textNotFound`,
 *   `frontmatterInvalid`.
 */
function applyContentEdit(text, edit) {
  const quelle = String(text == null ? '' : text);
  if (!edit || typeof edit !== 'object' || !EDIT_OPS.includes(edit.op)) {
    return fehlschlag('invalidStep');
  }
  const mitBom = quelle.startsWith(BOM);
  const rumpf = mitBom ? quelle.slice(1) : quelle;
  const eol = rumpf.includes('\r\n') ? '\r\n' : '\n';
  let ergebnis;
  if (edit.op === 'append') ergebnis = anhaengen(rumpf, edit, eol);
  else if (edit.op === 'insert') ergebnis = einfuegen(rumpf, edit, eol);
  else if (edit.op === 'replace') ergebnis = ersetzen(rumpf, edit);
  else if (edit.op === 'setProperty') ergebnis = eigenschaftSetzen(rumpf, edit);
  else ergebnis = eigenschaftEntfernen(rumpf, edit);
  if (!ergebnis.ok) return ergebnis;
  const neu = (mitBom ? BOM : '') + ergebnis.text;
  return { ok: true, text: neu, changed: neu !== quelle };
}

module.exports = { EDIT_OPS, applyContentEdit };
