// 4T-002024 (Epic 3E-000192): Die Kommandos «Diagramm zu dieser Tabelle
// einfügen» (`chart.insert`) und «Diagramm bearbeiten» (`chart.edit`).
//
// **Ablauf beider Kommandos:** eine offene Zell-Eingabe der Datentabelle
// übernehmen lassen; Tabelle bzw. Block über die Lage der Spalte bestimmen
// (charts/chart-lage.js: Klick-Lage vor Schreibmarke); die Tabelle lesen und
// prüfen, ob zu ihr ein Diagramm entstehen kann — sonst **Meldung statt
// Dialog** mit dem Grund (Entwicklungsrichtlinien, Kapitel 3, «Keine stillen
// Fehlschläge»; Ausführungs-Entscheidung 5 des Tasks); den Dialog öffnen; beim
// Bestätigen über die Änderungs-Listen des Schreib-Kerns in **einer**
// Transaktion schreiben, damit ein Rückgängig-Schritt Namens-Zeile und Block
// zusammen zurücknimmt. 4T-002072: Die Namens-Zeile ist bei einer Tabelle
// ohne Namen die neue erste Kopf-Zeile `table: tabelle-N` im Block; die Liste
// trägt dann zwei Änderungen, angewandt in derselben einen Transaktion.
//
// **Die Stelle des Blocks wird mitgeführt** (Auflage des Schreib-Kerns,
// Durchsicht K4): Vor dem ersten Warten merkt das Kommando die Stelle im Zustand
// des Editors (`merkeOffen`); jede Transaktion bildet sie ab, und beim
// Bestätigen wird die Zeile aus der abgebildeten Stelle genommen, nie aus der
// gemerkten. Ist der Block dabei gelöscht worden oder beginnt an der Stelle
// keiner mehr, wird nichts geschrieben, und die Meldung zu
// `changed-meanwhile` erscheint; ebenso, wenn der Inhalt vom Stand beim
// Öffnen abweicht (Prüfung im Schreib-Kern).
//
// **Keine Auswahl in der Transaktion:** Die Schreibmarke bleibt, wo sie war;
// im Live-Modus bleibt die Tabelle als Gitter stehen, und das neue Diagramm
// wird gezeichnet (Entscheidung «Gitter bleibt»). Nach dem Einfügen ist das
// neue Diagramm im Live-Modus ausgewählt (Entscheidung C2 der Sitzung).
//
// **Das andere Dokument** eines Diagramms wird nur gelesen, über den Kanal der
// Diagramme (`api.readChartTableDocument`); geschrieben wird allein der Block
// im eigenen Dokument.
'use strict';

import { isolateHistory } from '@codemirror/commands';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { paneEditors } from '../editor/editor.js';
import { cancelPendingPreviewUpdate } from '../editor/editor-preview.js';
import { renderPaneContent } from '../views/pane-render.js';
import { activeTabOfPane } from '../views/pane-lookup.js';
import { showStatusbarHint } from '../views/views.js';
import { focusOpenChartDialog, openChartDialog } from './chart-dialog.js';
import { hinweisText } from './chart-hint.js';
import { lageFuer, merkeOffen, offenFuer, setzeLage, vergissOffen } from './chart-lage.js';
import {
  buildEditChanges,
  buildInsertChanges,
  findChartBlockAtLine,
  findDatatableAtLine,
} from '../../../shared/charts/chart-edit.js';
import {
  buildChartOffer,
  chartSpecFromForm,
  chartUnavailableReason,
  editFormFromSpec,
  insertFormDefaults,
} from '../../../shared/charts/chart-form.js';
import { parseChartSpec, parseTableRef } from '../../../shared/markdown/perspective-chart.js';
import { resolveTableInDocument } from '../../../shared/markdown/perspective-chart-resolve.js';
import { parsePerspectiveDatatable } from '../../../shared/markdown/perspective-datatable.js';

/** Anzeige-Dauer einer Meldung in Millisekunden. */
export const MELDUNG_MS = 4000;

// Gründe des Formular- und des Schreib-Kerns -> Satz mit dem Grund.
const GRUND_SATZ = {
  'table-invalid': 'chart.command.reason.tableInvalid',
  'no-number-column': 'chart.command.reason.noNumberColumn',
  'no-series': 'chart.command.reason.noSeries',
  'table-unclosed': 'chart.command.reason.tableUnclosed',
  'chart-unclosed': 'chart.command.reason.chartUnclosed',
  'name-not-unique': 'chart.command.reason.nameNotUnique',
  'name-unresolved': 'chart.command.reason.nameUnresolved',
};

// Status der Auflösung des Tabellen-Namens -> Grund des Hinweises am Diagramm.
const AUFLOESUNG_GRUND = {
  missing: 'table-missing',
  'other-kind': 'table-other-kind',
  invalid: 'table-invalid',
};

// Setzt Werte über Teilen und Verbinden ein (kein `replace` mit Mustern wie `$&`).
function fuelle(vorlage, werte) {
  let out = String(vorlage);
  for (const [platz, wert] of Object.entries(werte)) {
    out = out.split(`{${platz}}`).join(String(wert));
  }
  return out;
}

function melde(text) {
  showStatusbarHint(null, { error: true, duration: MELDUNG_MS, text });
}

// «Lässt sich nicht einfügen/bearbeiten» samt Grund-Satz.
function meldeGrund(modus, grundSatz) {
  const vorlage = t(modus === 'edit' ? 'chart.command.cannotEdit' : 'chart.command.cannotInsert');
  melde(fuelle(vorlage, { reason: grundSatz }));
}

function meldeKernGrund(modus, grund) {
  if (!GRUND_SATZ[grund]) {
    // no-datatable, no-chart, changed-meanwhile: An der abgebildeten Stelle
    // steht nicht mehr der Block, zu dem der Dialog offen war.
    melde(t('chart.command.changedMeanwhile'));
    return;
  }
  meldeGrund(modus, t(GRUND_SATZ[grund]));
}

// Eine offene Zell-Eingabe der Datentabelle übernimmt ihr Editor beim
// Fokus-Verlust, einen Takt später (perspective-datatable-editor.js,
// `onRootBlur`). Gewartet wird immer: Ein Klick in das Kontextmenü hat den
// Fokus schon vor dem Aufruf genommen, und die Übernahme steht dann noch aus.
// Ohne das Warten schriebe sie während des offenen Dialogs, und das Bestätigen
// endete in `changed-meanwhile`.
async function uebernimmZellEingabe() {
  const aktiv = document.activeElement;
  if (aktiv && aktiv.classList && aktiv.classList.contains('pdt-cell-input')) aktiv.blur();
  await new Promise((weiter) => setTimeout(weiter, 0));
}

function vergiss(view) {
  if (offenFuer(view) !== null) view.dispatch({ effects: vergissOffen.of(null) });
}

// Die Zeile an der mitgeführten Stelle, wenn dort noch ein Block dieser Art
// beginnt; sonst null.
function zeileBeimBestaetigen(view, finde) {
  const pos = offenFuer(view);
  if (pos === null) return null;
  const zeile = view.state.doc.lineAt(pos).number;
  const block = finde(view.state.doc.toString(), zeile);
  return block && block.openLine === zeile ? zeile : null;
}

// Nach dem Schreiben: Die geteilte Ansicht baut sofort neu auf, statt auf die
// Tipp-Verzögerung zu warten, und die verzögerte zweite Runde entfällt (Muster
// `writeBody` in query/perspective-datatable-editor.js). Der Live-Modus baut
// seine Widgets über die Änderung des Dokuments selbst neu.
function baueNeu(idx, tab) {
  if (tab.viewMode !== 'split') return;
  renderPaneContent(idx);
  cancelPendingPreviewUpdate(idx);
}

// Fokus nach dem Einfügen in der geteilten Ansicht: die erste Zelle des neu
// gebauten Gitters, gesucht über die Öffner-Zeile der Tabelle in der Spalte,
// die den Editor trägt.
function fokussiereGitter(view, zeile) {
  const gruppe = view.dom.closest('.pane-group');
  const koerper = gruppe && gruppe.querySelector('.pane-rendered .markdown-body');
  if (!koerper) return;
  for (const gitter of koerper.querySelectorAll('.perspective-datatable')) {
    if (Number(gitter.dataset.dtLineStart) !== zeile) continue;
    const zelle = gitter.querySelector('td.pdt-cell[tabindex]');
    if (zelle) zelle.focus();
    return;
  }
}

// Steht nach dem Dialog noch, was beim Öffnen galt? Während der Dialog offen
// ist, laufen die Kürzel der Anwendung weiter: Strg+E schaltet Bearbeiten aus,
// ein Reiter-Wechsel per Tastatur tauscht das Dokument. Alle Reiter einer
// Spalte teilen einen Editor, und bei gleichem Inhalt ersetzt der Wechsel den
// Text nicht; die mitgeführte Stelle bemerkte ihn deshalb nicht, und das
// Bestätigen schriebe in das andere Dokument. Liefert den Schlüssel der
// Meldung oder null.
function schreibHindernis(k) {
  if (paneEditors[k.idx] !== k.view || activeTabOfPane(state.panes, k.idx) !== k.tab) {
    return 'chart.command.changedMeanwhile';
  }
  return k.view.state.readOnly ? 'chart.command.notEditable' : null;
}

// Der Kontext eines Aufrufs: Editor und geöffnetes Dokument der Spalte.
function kontext(paneIdx) {
  const idx = Number.isInteger(paneIdx) ? paneIdx : state.activePaneIndex;
  const view = paneEditors[idx];
  const tab = activeTabOfPane(state.panes, idx);
  return view && tab ? { idx, view, tab } : null;
}

// Ein Dialog zur Zeit (die Felder des Dialogs tragen feste Kennungen). Ein
// zweiter Aufruf, während einer läuft, öffnet keinen zweiten Dialog und meldet
// nichts; steht der Dialog schon, holt er ihn nach vorn (Fokus auf sein erstes
// Feld), statt still zu enden.
let laeuft = false;

async function mitSperre(arbeit) {
  if (laeuft) {
    focusOpenChartDialog();
    return;
  }
  laeuft = true;
  try {
    await arbeit();
  } finally {
    laeuft = false;
  }
}

// --- Einfügen ------------------------------------------------------------------

async function einfuegen(k) {
  const { idx, view, tab } = k;
  const lage = lageFuer(view, tab);
  if (!lage.inDatentabelle) {
    melde(t('chart.command.noTable'));
    return;
  }
  const tabelle = findDatatableAtLine(view.state.doc.toString(), lage.zeile);
  if (!tabelle) {
    melde(t('chart.command.noTable'));
    return;
  }
  if (tabelle.closeLine === null) {
    meldeGrund('insert', t(GRUND_SATZ['table-unclosed']));
    return;
  }
  const model = parsePerspectiveDatatable(tabelle.body);
  const grund = chartUnavailableReason(model);
  if (grund) {
    meldeGrund('insert', t(GRUND_SATZ[grund]));
    return;
  }
  const offer = buildChartOffer(model);
  view.dispatch({ effects: merkeOffen.of({ pos: view.state.doc.line(lage.zeile).from }) });
  try {
    const erg = await openChartDialog({
      modus: 'insert',
      offer,
      form: insertFormDefaults(offer),
      t,
      anker: tab.viewMode === 'live' ? view.contentDOM : undefined,
    });
    if (!erg || !erg.ok) return;
    const hindernis = schreibHindernis(k);
    if (hindernis) {
      melde(t(hindernis));
      return;
    }
    const zeile = zeileBeimBestaetigen(view, findDatatableAtLine);
    if (zeile === null) {
      melde(t('chart.command.changedMeanwhile'));
      return;
    }
    const r = buildInsertChanges(
      view.state.doc.toString(),
      zeile,
      chartSpecFromForm(erg.form),
      tabelle.body,
    );
    if (!r.ok) {
      meldeKernGrund('insert', r.grund);
      return;
    }
    // 4T-002072: Der Öffner des neuen Blocks kommt aus dem Schreib-Kern, als
    // Stelle im neuen Text — die Liste kann vor dem Block die neue Kopf-Zeile
    // der Tabelle tragen. Effekte einer Transaktion mit Änderungen beziehen
    // sich auf den neuen Text.
    const effekte = [vergissOffen.of(null)];
    if (tab.viewMode === 'live') {
      effekte.push(setzeLage.of({ art: 'diagramm', pos: r.blockFrom, modus: 'live' }));
    }
    view.dispatch({
      changes: r.changes,
      userEvent: 'input',
      annotations: isolateHistory.of('full'),
      effects: effekte,
    });
    baueNeu(idx, tab);
    if (tab.viewMode === 'split') fokussiereGitter(view, zeile);
  } finally {
    vergiss(view);
  }
}

// --- Bearbeiten ----------------------------------------------------------------

// Der Text des Dokuments, das die genannte Tabelle trägt, oder der Satz, warum
// er nicht vorliegt.
async function tabellenDokument(ref, eigenerText, tab) {
  if (ref.kind === 'same') return { text: eigenerText };
  let antwort = null;
  try {
    antwort = await api.readChartTableDocument(tab.path || '', ref.file);
  } catch (err) {
    console.warn('chart-commands: anderes Dokument nicht lesbar:', err);
  }
  if (antwort && antwort.ok === true && typeof antwort.content === 'string') {
    return { text: antwort.content };
  }
  // Das Verzeichnis war noch nicht bereit: «noch nicht gefunden» statt
  // «fehlt» (Risiko des Umsetzungsplans, Abschnitt 10).
  if (antwort && antwort.indexBereit === false) {
    return { satz: fuelle(t('chart.command.reason.indexNotReady'), { file: ref.file }) };
  }
  return {
    satz: hinweisText(
      { reason: 'document-missing', detail: ref.file, file: ref.file, tableName: ref.name },
      t,
    ),
  };
}

async function bearbeiten(k) {
  const { idx, view, tab } = k;
  const lage = lageFuer(view, tab);
  if (!lage.diagrammGewaehlt) {
    melde(t('chart.command.noChart'));
    return;
  }
  const text = view.state.doc.toString();
  const block = findChartBlockAtLine(text, lage.zeile);
  if (!block) {
    melde(t('chart.command.noChart'));
    return;
  }
  if (block.closeLine === null) {
    meldeGrund('edit', t(GRUND_SATZ['chart-unclosed']));
    return;
  }
  const spec = parseChartSpec(block.body);
  const ref = parseTableRef(spec.table);
  if (!ref) {
    meldeGrund('edit', hinweisText({ reason: 'table-missing', tableName: null }, t));
    return;
  }
  // Ab hier wird gewartet (Lesen des anderen Dokuments, Dialog): Die Stelle
  // wird vorher gemerkt und durch jede Transaktion mitgeführt.
  view.dispatch({ effects: merkeOffen.of({ pos: view.state.doc.line(lage.zeile).from }) });
  try {
    const quelle = await tabellenDokument(ref, text, tab);
    if (quelle.satz) {
      meldeGrund('edit', quelle.satz);
      return;
    }
    const res = resolveTableInDocument(quelle.text, ref.name);
    if (res.status !== 'found') {
      // `file` beim anderen Dokument: Der Satz nennt dann dieses Dokument.
      const erg = {
        reason: AUFLOESUNG_GRUND[res.status],
        tableName: ref.name,
        file: ref.kind === 'other' ? ref.file : null,
      };
      meldeGrund('edit', hinweisText(erg, t));
      return;
    }
    const grund = chartUnavailableReason(res.model);
    if (grund) {
      meldeGrund('edit', t(GRUND_SATZ[grund]));
      return;
    }
    const offer = buildChartOffer(res.model);
    const erg = await openChartDialog({
      modus: 'edit',
      offer,
      form: editFormFromSpec(offer, spec),
      t,
      tabellenName: ref.name,
      tabellenDokument: ref.kind === 'other' ? ref.file : undefined,
      anker: view.contentDOM,
    });
    if (!erg || !erg.ok) return;
    const hindernis = schreibHindernis(k);
    if (hindernis) {
      melde(t(hindernis));
      return;
    }
    const zeile = zeileBeimBestaetigen(view, findChartBlockAtLine);
    if (zeile === null) {
      melde(t('chart.command.changedMeanwhile'));
      return;
    }
    const r = buildEditChanges(
      view.state.doc.toString(),
      zeile,
      chartSpecFromForm(erg.form, spec),
      block.body,
    );
    if (!r.ok) {
      meldeKernGrund('edit', r.grund);
      return;
    }
    // Unverändert bestätigt: nichts zu schreiben, kein leerer Rückgängig-Schritt.
    if (r.changes.length === 0) return;
    view.dispatch({
      changes: r.changes,
      userEvent: 'input',
      annotations: isolateHistory.of('full'),
      effects: vergissOffen.of(null),
    });
    baueNeu(idx, tab);
  } finally {
    vergiss(view);
  }
}

// --- Einstiege -----------------------------------------------------------------

// Ein Fehler unterwegs endet nicht still (Entwicklungsrichtlinien, Kapitel 3):
// Er wird protokolliert und gemeldet. Aufgeräumt ist dabei schon: Die Stelle
// des offenen Dialogs vergisst `vergiss` im `finally` der Arbeit, die Sperre
// `mitSperre`, und den Dialog schließt er selbst, bevor er sein Ergebnis
// liefert.
async function fuehreAus(arbeit, paneIdx, fehlerSchluessel) {
  await mitSperre(async () => {
    try {
      await uebernimmZellEingabe();
      const k = kontext(paneIdx);
      if (!k) return;
      if (k.view.state.readOnly) {
        melde(t('chart.command.notEditable'));
        return;
      }
      await arbeit(k);
    } catch (err) {
      console.error('chart-commands: Kommando fehlgeschlagen:', err);
      melde(t(fehlerSchluessel));
    }
  });
}

/**
 * «Diagramm zu dieser Tabelle einfügen» an der Lage der Spalte.
 *
 * @param {number} [paneIdx] Spalte; ohne Angabe die aktive.
 * @returns {Promise<void>}
 */
export function runChartInsert(paneIdx) {
  return fuehreAus(einfuegen, paneIdx, 'chart.command.failedInsert');
}

/**
 * «Diagramm bearbeiten» an der Lage der Spalte.
 *
 * @param {number} [paneIdx] Spalte; ohne Angabe die aktive.
 * @returns {Promise<void>}
 */
export function runChartEdit(paneIdx) {
  return fuehreAus(bearbeiten, paneIdx, 'chart.command.failedEdit');
}
