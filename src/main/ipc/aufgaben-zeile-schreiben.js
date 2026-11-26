// 4T-002813 (Epic 3E-000444): Der Rumpf des Kanals `task:applyLineEdit`, das
// zeilen-genaue Rückschreiben einer Aufgaben-Zeile auf die Platte. Aufrufer
// sind die Aufgaben-Abfrage (Abhaken, Verschieben, Bearbeiten an einem Treffer
// ohne offenes Fenster) und der Befehl `complete-task` eines Workflows, der
// über denselben Weg im Fenster abhakt.
//
// **Zwei Wege, getrennt an der Zuordnungs-Zeile der genannten Datei.**
//   - Eine gewöhnliche Datei geht den bisherigen Weg unverändert: roh lesen,
//     zeilen-genau ersetzen, roh schreiben. Zeilenenden und Byte-Order-Zeichen
//     bleiben byte-genau erhalten.
//   - Eine Datei eines in Teile zerlegten Dokuments meint das ganze Dokument.
//     Der Weg löst auf die Kopf-Datei auf (`kopfPfadVon`), liest den
//     zusammengesetzten Stand samt Sperre bei fehlenden Teilen (`liesStand`),
//     rechnet die Zeile in diesen Stand um, ersetzt dort und schreibt die Teile
//     wie der Schreibweg der Text-Befehle (`schreibeDokumentTeile`). Bis
//     hierher las der Kanal allein die genannte Datei: Das Abhaken aus einem
//     Workflow kam mit dem Kopf-Pfad und der Zeile des ganzen Dokuments und
//     fand eine Aufgabe in einem späteren Teil nie; das Abhaken aus der
//     Abfrage traf den Folgeteil zwar, führte die Historie aber unter seinem
//     Pfad statt unter dem der Kopf-Datei.
//
// **Die Zeile.** Ein Treffer der Abfrage trägt den Pfad der Datei, in der der
// Index die Aufgabe fand, und die Zeile in ihr (Dateikopf mitgezählt). Mit dem
// Pfad der Kopf-Datei ist die Zeile bereits die des zusammengesetzten Stands,
// weil die Kopf-Datei unverändert an dessen Anfang steht. Mit dem Pfad eines
// Folgeteils wird umgerechnet (`zeileImGanzen`): Zeilen vor dem Beginn seines
// Rumpfs im zusammengesetzten Stand, aus den Teil-Grenzen des Lese-Wegs, plus
// die Zeile im Teil abzüglich seines Dateikopfs, der im zusammengesetzten
// Stand fehlt. Lässt sich nicht umrechnen, geht die Zeile als 0 weiter; dann
// sucht der Kern den Text eindeutig im ganzen Dokument und meldet sonst den
// Konflikt, statt eine geratene Zeile zu treffen.
//
// **Grenze.** Kopf-Datei und Teile liegen innerhalb der Wurzel, die der
// Aufrufer nennt (Bereichs-Wurzel, ohne Bereich der Ordner der Datei, wie beim
// Index der Abfrage). Geprüft wird mit den Bausteinen des Schreibwegs, vor dem
// Lesen, nach dem Lesen und vor dem Schreiben jedes Teils.
//
// **Ohne Schreib-Marke**, wie bisher: Die Begründung steht über dem Kanal in
// `index-views.js`.
//
// **Meldung an die Fenster der Kopf-Datei.** Beobachtet wird in einem Fenster
// allein die Kopf-Datei. Schreibt der Weg nur einen Folgeteil, meldet die
// Beobachtung deshalb nichts, und ein dort sauber geöffnetes Dokument bliebe
// auf dem alten Stand. Der Weg meldet die Änderung dann selbst unter dem Pfad
// der Kopf-Datei (`deps.meldeDateiAenderung`, Datei-Beobachtung), wie der
// Schreibweg der Text-Befehle seit 4T-002812. Wurde die Kopf-Datei
// geschrieben, meldet die Beobachtung selbst, und eine zweite Meldung bleibt
// aus.
//
// **Ein unverändert geöffnetes Fenster folgt sofort** (Zweitblick des Epics,
// Runde 1, Befund 1): Der Eintrag der Puffer-Overlay-Schicht übernimmt den
// geschriebenen Stand (`folgePlattenStand`), damit ein nachfolgender Leser,
// etwa der nächste Schritt eines Workflows, nicht bis zum Nachladen im Fenster
// den Stand vor dem Schreiben sieht.
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { computeLineReplacement } = require('../documents/task-line-edit.js');
const { readPartLine } = require('../../shared/document-parts');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { folgePlattenStand } = require('../index/overlay.js');
const {
  kopfPfadVon,
  liesStand,
  schreibeDokumentTeile,
} = require('../workflows/workflow-platten-schreibweg.js');

// Byte-Order-Zeichen in Escape-Form (kein unsichtbares Zeichen im Quelltext).
const BOM_RE = new RegExp('^\\uFEFF');

function fehlerText(err) {
  return err && err.message ? err.message : String(err);
}

function umbrueche(text) {
  let n = 0;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

/**
 * Rechnet die Zeile einer genannten Datei in die Zeile des zusammengesetzten
 * Stands um (Kopf oben, Abschnitt «Die Zeile»).
 *
 * @param {object} stand Stand aus `liesStand` mit `headPath`, `teile`, `grenzen`, `text`.
 * @param {string} pfad genannte Datei.
 * @param {number} zeile Zeile in der genannten Datei, ab 1.
 * @returns {number} Zeile im zusammengesetzten Stand, 0 wenn nicht umrechenbar.
 */
function zeileImGanzen(stand, pfad, zeile) {
  if (pathCompareKey(pfad) === pathCompareKey(stand.headPath)) return zeile;
  const k = stand.teile.findIndex((t) => pathCompareKey(t.pfad) === pathCompareKey(pfad));
  const beginn = k >= 1 ? stand.grenzen[k - 1] : undefined;
  const n = zeile | 0;
  if (typeof beginn !== 'number' || n < 1) return 0;
  const inhalt = stand.teile[k].content;
  const kopfZeilen = umbrueche(inhalt.slice(0, extractFrontmatter(inhalt).endOffset));
  if (n <= kopfZeilen) return 0;
  return umbrueche(stand.text.slice(0, beginn)) + n - kopfZeilen;
}

/**
 * Baut den Rumpf des Kanals.
 *
 * @param {object} deps
 * @param {Function} deps.resolveHistoryFor Auflösung der Historisierungs-Schaltung.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Überschreiben.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 * @param {(pfad: string) => number} [deps.meldeDateiAenderung] Meldung einer
 *   Änderung an die Fenster, die den Pfad beobachten (Abschnitt «Meldung an die
 *   Fenster der Kopf-Datei»).
 * @returns {{schreibeAufgabenZeile: Function}}
 */
function createAufgabenZeileSchreiben({
  resolveHistoryFor,
  readPreviousTextFor,
  recordMddOnSave,
  meldeDateiAenderung,
}) {
  // Der bisherige Weg einer gewöhnlichen Datei, unverändert (4T-000504).
  async function schreibeRoh(owner, filePath, raw, params) {
    const result = computeLineReplacement(raw, params);
    if (!result.ok) return { ok: false, reason: result.reason };
    try {
      const recordHistory = (await resolveHistoryFor(owner, filePath, result.newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      await ersetzeDateiOderWirf(filePath, result.newContent);
      const newTextNorm = result.newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
      if (recordHistory) await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      folgePlattenStand(filePath, newTextNorm);
      return { ok: true, line: result.line };
    } catch (err) {
      return { ok: false, error: fehlerText(err) };
    }
  }

  // Der Weg eines geteilten Dokuments (Kopf oben). Fehlschläge des Lesens
  // kommen als `error` mit dem Code des Schreibwegs (`outsideArea`,
  // `partsMissing`, `targetMissing`); das Fenster zeigt dafür den Hinweis
  // «nicht geschrieben», wie bei jedem anderen Schreibfehler.
  async function schreibeGeteilt(owner, root, filePath, params) {
    const aufgeloest = await kopfPfadVon(root, filePath, filePath);
    if (!aufgeloest.ok) return { ok: false, error: aufgeloest.code };
    const stand = await liesStand(root, { abs: aufgeloest.kopf });
    if (!stand.ok) return { ok: false, error: stand.code };
    const result = computeLineReplacement(stand.text, {
      ...params,
      line: zeileImGanzen(stand, filePath, params.line),
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    // Unter dem Pfad der Kopf-Datei, wie beim Speichern von Hand.
    const kopf = stand.headPath || aufgeloest.kopf;
    const neu = result.newContent;
    try {
      const recordHistory = (await resolveHistoryFor(owner, kopf, neu)).effective;
      const ctx = { root, owner };
      const geschrieben = await schreibeDokumentTeile(ctx, stand, kopf, neu, recordHistory, {
        recordMddOnSave,
      });
      if (recordHistory) await recordMddOnSave(owner, kopf, stand.text, geschrieben.text);
      if (!geschrieben.kopfGeschrieben && typeof meldeDateiAenderung === 'function') {
        meldeDateiAenderung(kopf);
      }
      folgePlattenStand(kopf, geschrieben.text);
      return { ok: true, line: result.line };
    } catch (err) {
      if (err && err.grenze) return { ok: false, error: 'outsideArea' };
      return { ok: false, error: fehlerText(err) };
    }
  }

  /**
   * Schreibt eine Aufgaben-Zeile zurück.
   *
   * @param {object} owner Fenster des Absenders (Historie).
   * @param {string|null} root Wurzel der Grenze für ein geteiltes Dokument.
   * @param {object} params Kanal-Parameter `filePath`, `line`, `expectedText`,
   *   `newText`, `insert`.
   * @returns {Promise<object>} `{ ok: true, line }` mit der Zeile im geschriebenen
   *   Stand, bei einem geteilten Dokument im zusammengesetzten; `{ ok: false,
   *   reason }` bei einem Konflikt der Zeile; sonst `{ ok: false, error }`.
   */
  async function schreibeAufgabenZeile(owner, root, params) {
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: fehlerText(err) };
    }
    const kern = {
      line: params.line,
      expectedText: params.expectedText,
      newText: params.newText,
      insert: params.insert,
    };
    const geteilt = readPartLine(raw.replace(BOM_RE, '').replace(/\r\n/g, '\n'));
    if (!geteilt) return schreibeRoh(owner, filePath, raw, kern);
    return schreibeGeteilt(owner, root, filePath, kern);
  }

  return { schreibeAufgabenZeile };
}

module.exports = { createAufgabenZeileSchreiben, zeileImGanzen };
