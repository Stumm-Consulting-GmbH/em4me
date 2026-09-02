// Listen- und Aufgaben-Zweig des Lezer-Passes: Listen-Zeilen-Decorations,
// Aufgaben-Marker samt erweiterten Status-Zeichen und die Marker-Badges.
// 4T-000996 (Epic 3E-000196): aus dem Lezer-Pass herausgelöst, damit beide
// Module unter dem Datei-Budget bleiben. Rumpf unverändert übernommen; der
// Zweig endete schon vorher mit einem Rücksprung, deshalb kehrt der Aufrufer
// nach dem Aufruf unbedingt zurück.
'use strict';

import { Decoration } from '@codemirror/view';

import {
  getTaskMarkersConfig,
  taskMarkerBadgeSpec,
  taskStatusType,
} from '../../../shared/markdown/plugins.js';
import { parseTaskLine, isTaskLine } from '../../../shared/tasks/task-markers.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import { activeTaskStateMap, getLiveTaskMarkerRe } from '../task-states.js';
import {
  liveListBulletLineDeco,
  liveListNumberLineDeco,
  liveTaskMarkerDecoAt,
} from './live-deco.js';
import { nodeInsideCode } from './live-shared.js';
import { TaskMarkerBadgeWidget } from './live-widget-inline.js';

// 4T-000083: Listen-Items. BulletList und OrderedList enthalten
// ListItem-Children. Pro ListItem wird die erste Zeile mit
// cm-live-list-bullet bzw. cm-live-list-number versehen; Marker
// bleibt sichtbar wie im Source-Modus (Entscheidung Punkt 4 der
// Tabelle vom 2026-05-24). Task-Listen werden per Pattern erkannt
// (Lezer-Markdown in der aktuellen lang-markdown-Konfiguration
// liefert keine Task/TaskMarker-Knoten); `[ ]`/`[x]` wird per
// Mark-Decoration ausgeblendet und per CSS-::before als Checkbox-
// Symbol gerendert. Mousedown-Handler toggelt den Marker im Doc.
export function runListItemPass(ctx, node) {
  const { state, ranges, activeLines, frontmatterEndLine } = ctx;
  if (nodeInsideCode(node)) return;
  const itemLine = state.doc.lineAt(node.from);
  if (itemLine.number <= frontmatterEndLine) return;
  const parent = node.node.parent;
  const isOrdered = parent && parent.name === 'OrderedList';
  ranges.push((isOrdered ? liveListNumberLineDeco : liveListBulletLineDeco).range(itemLine.from));
  const itemText = state.doc.sliceString(itemLine.from, itemLine.to);
  // 4T-000204: Pattern enthaelt zusaetzlich die aktivierten
  // Status-Zeichen (Settings-gesteuert, Regex wird bei jeder
  // Aenderung in task-states.js neu gebaut).
  const taskMatch = itemText.match(getLiveTaskMarkerRe());
  if (taskMatch) {
    const markerFrom = itemLine.from + taskMatch[1].length;
    const markerTo = markerFrom + 3;
    const markerChar = taskMatch[2][1];
    const checked = markerChar === 'x' || markerChar === 'X';
    // 4T-000293: erweiterte Status-Zeichen nur bei aktiver
    // task-states-Erweiterung als Box rendern; deaktiviert
    // bleibt `[/]` roher Text (Basis `[ ]`/`[x]` ist Kern).
    if (markerChar !== ' ' && !checked && !isExtensionActive('task-states')) return;
    if (!activeLines.has(itemLine.number)) {
      const stateDef = markerChar !== ' ' && !checked ? activeTaskStateMap().get(markerChar) : null;
      ranges.push(
        liveTaskMarkerDecoAt(
          markerFrom,
          checked,
          stateDef
            ? {
                state: { char: markerChar, color: stateDef.color, label: stateDef.label },
              }
            : undefined,
        ).range(markerFrom, markerTo),
      );
      // 4T-000498 (Epic 3E-000090): Task-Marker-Badges am Zeilenende
      // (Paritaet zum Render-Pane: gleiche Spec-Quelle, gleiche
      // Guards — Erweiterung aktiv, kein NON_TASK-Status, Global
      // Filter). Cursor auf der Zeile zeigt den Roh-Text
      // (activeLines-Guard dieser umgebenden Verzweigung).
      if (isExtensionActive('tasks')) {
        const stateType = markerChar !== ' ' && !checked ? taskStatusType(markerChar) : null;
        const cfg = getTaskMarkersConfig();
        const isTask =
          stateType !== 'NON_TASK' &&
          (cfg.globalFilter === '' || isTaskLine(itemText, cfg.globalFilter));
        const model = isTask ? parseTaskLine(itemText) : null;
        if (model && model.segments.length > 0) {
          const totalLen = model.segments.reduce((n, s) => n + s.raw.length, 0);
          const segStartOffset = itemText.length - model.trailing.length - totalLen;
          let segFrom = itemLine.from + segStartOffset;
          for (const seg of model.segments) {
            const segTo = segFrom + seg.raw.length;
            const spec = taskMarkerBadgeSpec(seg, cfg.labels);
            // 4T-000937 (Befund B-09): Jedes Badge mit Datums-Wert ist
            // klickbar — clickRange traegt den Doc-Bereich des
            // Werts, der dateValuePlugin-Handler oeffnet den
            // vorbelegten Picker (Ersetzen an Ort und Stelle).
            // Bis dahin galt das allein fuer ⏰ (4T-000528), weil nur
            // die Erinnerung Gegenstand jenes Vorgangs war; die
            // sechs Termin-Marker sahen gleich aus und reagierten
            // nicht. Die Erinnerung braucht zusaetzlich ihre eigene
            // Erweiterung, die uebrigen haengen an «Aufgaben», ohne
            // die es hier ohnehin keine Badges gaebe.
            let clickRange = null;
            const istDatumsSegment =
              seg.kind === 'date' || (seg.kind === 'reminder' && isExtensionActive('reminders'));
            if (
              istDatumsSegment &&
              seg.value &&
              !seg.value.invalid &&
              isExtensionActive('date-picker')
            ) {
              const vm = seg.raw.match(/(\d{4}-\d{2}-\d{2}(?:[ \t]+\d{2}:\d{2})?)$/);
              if (vm) clickRange = { from: segTo - vm[1].length, to: segTo };
            }
            ranges.push(
              Decoration.replace({
                widget: new TaskMarkerBadgeWidget(spec.cls, spec.title, spec.text, clickRange),
              }).range(segFrom, segTo),
            );
            segFrom = segTo;
          }
          // Ausblende-Option: erstes Klartext-Vorkommen des
          // Filter-Strings im Beschreibungs-Bereich verbergen
          // (samt einem angrenzenden Leerzeichen, Semantik von
          // stripGlobalFilter).
          if (cfg.hideGlobalFilter && cfg.globalFilter !== '') {
            const idx = itemText.indexOf(cfg.globalFilter);
            if (idx >= 0 && idx + cfg.globalFilter.length <= segStartOffset) {
              let hideFrom = idx;
              let hideTo = idx + cfg.globalFilter.length;
              if (itemText[hideTo] === ' ') hideTo++;
              else if (hideFrom > 0 && itemText[hideFrom - 1] === ' ') hideFrom--;
              ranges.push(
                Decoration.replace({}).range(itemLine.from + hideFrom, itemLine.from + hideTo),
              );
            }
          }
        } else if (model && cfg.hideGlobalFilter && cfg.globalFilter !== '') {
          // Task-Zeile ohne Marker: die Ausblende-Option gilt
          // trotzdem.
          const idx = itemText.indexOf(cfg.globalFilter);
          if (idx >= 0) {
            let hideFrom = idx;
            let hideTo = idx + cfg.globalFilter.length;
            if (itemText[hideTo] === ' ') hideTo++;
            else if (hideFrom > 0 && itemText[hideFrom - 1] === ' ') hideFrom--;
            ranges.push(
              Decoration.replace({}).range(itemLine.from + hideFrom, itemLine.from + hideTo),
            );
          }
        }
      }
    }
  }
  return;
}
