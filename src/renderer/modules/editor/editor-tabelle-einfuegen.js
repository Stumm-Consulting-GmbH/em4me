// 4T-002554 (Epic 3E-000389): Einfügen aus einer Tabellenkalkulation als
// Pipe-Tabelle, dazu «Als reinen Text einfügen» und «Als Tabelle einfügen».
//
// Ein Ausführungs-Weg für Strg+V (editor-paste.js), das Kontextmenü «Einfügen»
// (editor-context-menu.js) und die beiden Registry-Kommandos
// (EDITOR_COMMAND_FUNCTIONS in editor-keymaps.js). Erkennung, Zerlegung und Bau
// der Tabelle liegen im reinen Kern src/shared/markdown/zellbereich.js.
//
// Rückgängig in zwei Schritten (Entscheidung T2 des Epics): Erst landet der
// reine Text als eigener Verlaufs-Schritt, dann die Umwandlung als zweiter;
// ein Strg+Z führt damit auf den reinen Text. Beide Transaktionen tragen
// `isolateHistory`, damit sie weder miteinander noch mit vorherigem Tippen zu
// einem Schritt verschmelzen (Vorbild chart-commands.js).
'use strict';

import { isolateHistory } from '@codemirror/commands';
import { api } from '../app/api.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { positionInsideCode } from '../live/live-shared.js';
import { detectFrontmatterLines } from '../live/live-marker-fields.js';
// Tabellen-Erkennung der Zeile aus dem Blatt-Modul, nicht aus
// editor-table-tools.js: Jenes lädt views.js statisch und zöge dieses Modul in
// die Import-Zyklen-Komponente des Renderers (Ordner-Import-Wächter). Ein
// Perspective-Block ist ein Code-Zaun und fällt schon unter positionInsideCode.
import { isTableContextLine } from './editor-code-zeile.js';
import {
  alsBlockEinsetzen,
  alsPipeTabelle,
  hatTabellenForm,
  waehleTrennzeichen,
  zellbereichAus,
} from '../../../shared/markdown/zellbereich.js';

export const TABELLEN_ERWEITERUNG = 'table-tools';

// Statusleisten-Hinweis über einen Laufzeit-Import (Muster editor-format.js):
// ein statischer Bezug auf views.js zöge dieses Modul in die große
// Import-Zyklen-Komponente. Ein Fehlschlag bleibt folgenlos, der Hinweis ist
// Beiwerk.
function zeigeHinweis(schluessel, opts) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, opts))
    .catch(() => {});
}

// Darf an der Auswahl eine Tabelle entstehen? Nicht im Lese-Zustand, nicht bei
// Mehrfach-Auswahl, nicht in Code-Bereichen, nicht im Kopf-Block und nicht in
// einer bestehenden Tabelle. Die Erweiterung prüft der Aufrufer, weil das
// Kommando «Als Tabelle einfügen» im Aus-Zustand ohnehin gefiltert ist.
export function tabelleErlaubtAn(view) {
  const st = view.state;
  if (st.readOnly) return false;
  if (st.selection.ranges.length !== 1) return false;
  const { from, to } = st.selection.main;
  if (positionInsideCode(st, from) || positionInsideCode(st, to)) return false;
  const kopf = detectFrontmatterLines(st.doc);
  if (kopf && st.doc.lineAt(from).number <= kopf.toLine) return false;
  return !isTableContextLine(st, st.doc.lineAt(from)) && !isTableContextLine(st, st.doc.lineAt(to));
}

// Zeilen des Zellbereichs aus Text- und Tabellen-Form, wenn Strg+V oder das
// Kontextmenü hier umwandeln: Erweiterung an, Ort erlaubt, Schwelle erfüllt.
export function zellbereichZumEinfuegen(view, text, html) {
  if (!isExtensionActive(TABELLEN_ERWEITERUNG)) return null;
  if (!tabelleErlaubtAn(view)) return null;
  return zellbereichAus({ text, html });
}

// Trägt die Zwischenablage die Tabellen-Form einer Tabellenkalkulation mit
// Text? Dann ist sie kein Anlagen-Fall, auch wenn sie ein Bild der Zellen
// mitliefert (Excel tut das, gemessen am 2026-11-05), sondern Text: Ohne
// Umwandlung bleibt es beim reinen Text.
export function istTabellenAblage(text, html) {
  return !!text && hatTabellenForm(html);
}

// Setzt reinen Text an die Hauptauswahl, als eigener Verlaufs-Schritt; nur für
// die Tabelle, die tabelleErlaubtAn ohnehin auf eine Auswahl beschränkt.
function setzeText(view, text, isolieren) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
    ...(isolieren ? { annotations: isolateHistory.of('full') } : {}),
  });
  return from;
}

// 4T-002557: Reiner Text an jede Auswahl, wie vor 4T-002554 über
// replaceSelection, weil sonst bei mehreren Schreibmarken nur die Hauptmarke
// die Einfügung bekäme.
function setzeTextAnJedeAuswahl(view, text) {
  view.dispatch({
    ...view.state.replaceSelection(text),
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
}

// Fügt den Text ein und wandelt ihn im zweiten Schritt in die Tabelle.
export function fuegeAlsTabelleEin(view, text, zeilen) {
  // Zeilenenden wie im Editor, damit die Länge des eingesetzten Texts stimmt.
  const rein = String(text).replace(/\r\n?/g, '\n');
  const von = setzeText(view, rein, true);
  const r = alsBlockEinsetzen(
    view.state.doc.toString(),
    von,
    von + rein.length,
    alsPipeTabelle(zeilen),
  );
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.insert },
    selection: { anchor: r.cursor },
    scrollIntoView: true,
    userEvent: 'input.paste',
    annotations: isolateHistory.of('full'),
  });
  zeigeHinweis('tableTools.pastedAsTable', { duration: 4000 });
  return true;
}

// Kommando «Als reinen Text einfügen» (Kern): die Zwischenablage unverändert,
// ohne Link, Anlage oder Tabelle — derselbe Inhalt wie Strg+Umschalt+V.
export function fuegeReinenTextEin(view) {
  if (!view || view.state.readOnly) return false;
  const text = typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '';
  if (text) setzeTextAnJedeAuswahl(view, String(text).replace(/\r\n?/g, '\n'));
  view.focus();
  return true;
}

// Kontextmenü «Einfügen»: derselbe Zweig wie Strg+V, gelesen über die Brücke.
export function fuegeAusKontextmenueEin(view) {
  const text = typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '';
  if (text) {
    const html = typeof api.clipboardReadHTML === 'function' ? api.clipboardReadHTML() : '';
    const zeilen = zellbereichZumEinfuegen(view, text, html);
    if (zeilen) fuegeAlsTabelleEin(view, text, zeilen);
    else setzeTextAnJedeAuswahl(view, String(text).replace(/\r\n?/g, '\n'));
  }
  view.focus();
}

// Kommando «Als Tabelle einfügen» (Erweiterung table-tools): wandelt
// Tabulator- oder Semikolon-Text auch ohne Tabellen-Form um; Trennzeichen ist
// das häufigere der beiden, die Schwelle dieselbe ohne HTML-Bedingung.
export function fuegeTextAlsTabelleEin(view) {
  if (!view) return false;
  const text = typeof api.clipboardReadText === 'function' ? api.clipboardReadText() : '';
  const zeilen =
    text && tabelleErlaubtAn(view)
      ? zellbereichAus({ text }, { tabellenForm: false, trennzeichen: waehleTrennzeichen(text) })
      : null;
  if (!zeilen) {
    zeigeHinweis('tableTools.pasteAsTableNone', { error: true, duration: 3000 });
    return false;
  }
  fuegeAlsTabelleEin(view, text, zeilen);
  view.focus();
  return true;
}
