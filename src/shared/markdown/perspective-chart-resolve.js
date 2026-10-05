// 4T-002019 (Epic 3E-000192): Diagramm zu einer Datentabelle — Auflösung des
// Tabellen-Namens in einem Dokument-Text.
//
// Schwester-Modul des Kerns perspective-chart.js und Blatt der Familie: Es lädt
// kein Modul der eigenen Familie und wird ausschließlich vom Kern geladen
// (Import-Graph Kern -> hier). Prozess-neutral: kein DOM, kein Electron, kein
// Datei-Zugriff. Der Dokument-Text kommt von außen; welcher Stand das ist (der
// geschriebene, auch ungespeicherte, oder der eines anderen Dokuments),
// entscheidet der Aufrufer.
//
// **Der Name einer Datentabelle ist ihr Block-Anker**, in zwei Formen
// (4T-002072): die Kopf-Angabe `table: Name` im Zaun, seither die Form, die das
// Programm schreibt, und die ältere Zeile `^name` unmittelbar unter dem Zaun,
// die weiter gilt (Entscheidung des Product Owners vom 2026-10-03). Welche Form
// eine Kennung trägt, sagt die Heimat (`traegerById`); der Kopf-Name braucht
// deshalb keine Bereichs-Regel. Gebaut wird aus den vorhandenen Bausteinen statt
// aus eigenen Fassungen: die Anker aus `extractBlockAnchors`
// (src/shared/block-anchors.js), die Zaun-Regel aus ihrer Heimat
// `fence-level.js` (Entwicklungsrichtlinien, Kapitel 1, «Erkennungen haben
// eine Heimat»; bewacht durch test/unit/zaun-kopien.test.js).
//
// **Die Bereichs-Regel** folgt dem Einbettungs-Schnitt (`extractBlockByAnchor`
// in src/main/index/embed.js, der im Hauptprozess liegt und deshalb Vorbild,
// nicht Baustein ist): Steht die Anker-Zeile allein, gehört sie zum Block
// davor; Leerzeilen dazwischen trennen nicht. Endet der Block davor mit der
// Schluss-Zeile eines Zauns, ist er dieser Code-Block, sonst ein anderes
// Konstrukt. Steht der Anker am Ende einer Inhalts-Zeile, gehört er zu deren
// Block. Die Unterscheidung «anderer Art» hängt damit allein an der Zeile vor
// dem Anker und nicht daran, welchen Bereich ein Anker unter einer
// gewöhnlichen Markdown-Tabelle heute erfasst.
//
// 4T-002072, Nachbesserung F8: Ein UTF-8-BOM am Anfang des Textes fällt vor der
// Auflösung weg; der Text eines anderen Dokuments kommt roh von der Platte.
'use strict';

const { ankerZeileAllein, extractBlockAnchors } = require('../block-anchors.js');
const { frontmatterBodyStart } = require('./link-scan.js');
const { zaunOeffnung, schliesstZaun } = require('./fence-level.js');
const { parsePerspectiveDatatable } = require('./perspective-datatable.js');
const { findUnescapedPipes } = require('./table-edit.js');

const DATATABLE_FENCE = 'perspective-datatable';
const PERSPECTIVE_TABLE_FENCE = 'perspective-table';

// Die Code-Blöcke der obersten Ebene als Zeilen-Bereiche (0-basiert): Öffner-
// und Schluss-Zeile samt Sprache. Ein nicht geschlossener Block reicht bis zum
// Textende und hat keine Schluss-Zeile.
function scanFences(lines, start) {
  const fences = [];
  let offen = null;
  for (let i = start; i < lines.length; i++) {
    if (offen) {
      if (schliesstZaun(lines[i], offen.oeffnung)) {
        fences.push({ open: offen.open, close: i, sprache: offen.oeffnung.sprache });
        offen = null;
      }
      continue;
    }
    const oeffnung = zaunOeffnung(lines[i]);
    if (oeffnung) offen = { open: i, oeffnung };
  }
  if (offen) fences.push({ open: offen.open, close: null, sprache: offen.oeffnung.sprache });
  return fences;
}

function liegtImZaun(fences, idx) {
  return fences.some((f) => idx >= f.open && (f.close === null || idx <= f.close));
}

// Eine Zeile einer gewöhnlichen Markdown-Tabelle trägt einen unmaskierten
// senkrechten Strich; die Strich-Erkennung kommt aus dem Bearbeitungs-Kern der
// Pipe-Tabellen. `isTableLine` von dort taugt hier nicht, weil sie den Strich
// am Zeilenende verlangt und eine Zeile mit Anker am Ende ihn nicht trägt. Die
// Unterscheidung wirkt allein auf das Feld `kind`, nie auf den Grund.
function istTabellenZeile(line) {
  return findUnescapedPipes(String(line)).length > 0;
}

// Sucht die Tabelle mit dem Namen `name` im Dokument-Text. Ergebnis:
//   { status: 'found', model, openLine, closeLine }   Datentabelle, fehlerfrei
//   { status: 'missing' }                              Name kommt nicht vor
//   { status: 'other-kind', kind }                     'pipe-table',
//                        'perspective-table', 'code-block' oder 'other'
//   { status: 'invalid', model, errors }               Datentabelle mit
//                        mindestens einem Eintrag im Feld `errors`
// openLine und closeLine sind 1-basiert (Zaun-Zeilen der Tabelle); closeLine ist
// null, wenn der Zaun einer Tabelle mit Kopf-Namen nicht geschlossen ist.
function resolveTableInDocument(documentText, name) {
  const text = String(documentText == null ? '' : documentText).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const anker = extractBlockAnchors(text);
  const zeile = anker.lineById.get(String(name));
  if (zeile == null) return { status: 'missing' };
  // 4T-002072: Der Kopf-Name trägt seinen Zaun selbst; geparst wird der Rumpf
  // zwischen Öffner- und Schluss-Zeile (offen: bis zum Textende).
  const traeger = anker.traegerById.get(String(name));
  if (traeger.art === 'datentabelle') {
    const bis = traeger.zaunBis == null ? lines.length : traeger.zaunBis - 1;
    const model = parsePerspectiveDatatable(lines.slice(traeger.zaunVon, bis).join('\n'));
    if (model.errors.length > 0) return { status: 'invalid', model, errors: model.errors };
    return { status: 'found', model, openLine: traeger.zaunVon, closeLine: traeger.zaunBis };
  }
  const idx = zeile - 1;
  const fences = scanFences(lines, frontmatterBodyStart(lines));
  // Ein Anker, der nach der Zaun-Regel innerhalb eines Code-Blocks steht, ist
  // Text des Blocks und benennt nichts.
  if (liegtImZaun(fences, idx)) return { status: 'missing' };

  if (ankerZeileAllein(lines[idx]) !== String(name)) {
    return { status: 'other-kind', kind: istTabellenZeile(lines[idx]) ? 'pipe-table' : 'other' };
  }
  let davor = idx - 1;
  while (davor >= 0 && lines[davor].trim() === '') davor--;
  if (davor < 0) return { status: 'other-kind', kind: 'other' };

  const fence = fences.find((f) => f.close === davor);
  if (!fence) {
    return { status: 'other-kind', kind: istTabellenZeile(lines[davor]) ? 'pipe-table' : 'other' };
  }
  if (fence.sprache === PERSPECTIVE_TABLE_FENCE)
    return { status: 'other-kind', kind: 'perspective-table' };
  if (fence.sprache !== DATATABLE_FENCE) return { status: 'other-kind', kind: 'code-block' };

  const model = parsePerspectiveDatatable(lines.slice(fence.open + 1, fence.close).join('\n'));
  if (model.errors.length > 0) return { status: 'invalid', model, errors: model.errors };
  return { status: 'found', model, openLine: fence.open + 1, closeLine: fence.close + 1 };
}

module.exports = {
  resolveTableInDocument,
};
