// 4T-002204 (Epic 3E-000338): Beschriftete Zellen und Zeilen des
// Kalender-Formulars als eigenes Modul — Zahlen-Zelle, Namens-Zelle, Eingabe
// der Mehrzahl und Segment-Zeile.
//
// Herausgezogen aus settings-calendar-parts.js, damit die Eingaben der
// Schalt-Ebene (settings-calendar-leap.js, ihrerseits aus parts geschnitten,
// weil dessen Zeilen-Budget mit dem Feld der Durchläufe überschritten war)
// die Zahlen-Zelle nutzen können, ohne einen Import-Zyklus zwischen parts und
// leap zu bilden. Die Bausteine hängen allein am Übersetzungs-Katalog und
// an keinem Entwurf; parts, leap, der Kalender-Editor und der Editor der
// Ableitung importieren sie von hier.
'use strict';

import { t } from '../../i18n.js';

// Beschriftete Zahlen-Eingabe (kompakte Inline-Zelle der Editor-Zeilen).
export function buildCalSysNumCell(labelText, id, value, width, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-calsys-numcell';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = id;
  input.className = 'settings-input settings-calsys-num';
  if (width) input.style.width = `${width}px`;
  input.value = value == null ? '' : String(value);
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(span, input);
  return wrap;
}

// 4T-001863 (Epic 3E-000307): Beschriftete Namens-Zelle (Ebene, Zyklus,
// Gruppierung) — die Beschriftung steht sichtbar über dem Feld, das
// umschließende label verknüpft beide für Bildschirmleser.
export function buildCalSysNameCell(labelKey, input) {
  const cell = document.createElement('label');
  cell.className = 'settings-calsys-numcell settings-calsys-level-name';
  const label = document.createElement('span');
  label.textContent = t(labelKey);
  cell.append(label, input);
  return cell;
}

// 4T-001863 (Epic 3E-000307): Eingabe der Mehrzahl eines Namens (Ebene, Zyklus,
// Gruppierung). Der Kurzhinweis erklärt den Unterschied zur Einzahl; leer
// bleibt die Einzahl auch bei mehreren Einheiten stehen. Beschriftet wird sie
// über buildCalSysNameCell, an allen drei Stellen ohne Platzhalter.
export function buildCalSysPluralInput(id, entry, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'settings-input';
  input.title = t('settings.calendar.namePluralHint');
  input.value = entry.namePlural || '';
  input.addEventListener('input', () => {
    entry.namePlural = input.value;
    onChange();
  });
  return input;
}

// Segment-Eingaben (ein Zahlen-Feld je Ebene, beschriftet mit Ebenen-Namen).
export function buildCalSysSegRow(container, labelKey, idBase, segs, levelsForLabels, onChange) {
  const row = document.createElement('div');
  row.className = 'settings-row settings-calsys-segrow';
  const label = document.createElement('label');
  label.textContent = t(labelKey);
  const cells = document.createElement('div');
  cells.className = 'settings-calsys-segcells';
  levelsForLabels.forEach((level, i) => {
    cells.appendChild(
      buildCalSysNumCell(String(level.name || level.id), `${idBase}-${i}`, segs[i], 70, (v) => {
        segs[i] = v;
        onChange();
      }),
    );
  });
  row.append(label, cells);
  container.appendChild(row);
}
