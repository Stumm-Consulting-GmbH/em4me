'use strict';

// 4T-0512 (Epic 3E-0092): Renderer-seitige Lokalisierung und Rechen-Anzeige
// des Ereignis-Fence. Die Tabellen-Struktur kommt vollständig aus der
// Pipeline (perspective-events.js); dieses Modul füllt die Texte, die
// Platzhalter oder Rechnung brauchen: Struktur-Fehler ({line}/{detail}),
// Zeilen-Limit ({total}), Hinweis-Tooltips und vor allem die Differenz-
// Spalte (Staffelung, Meilensteine, Wiederkehr-Countdown, Dauer) — sie
// rechnet gegen den Container-Stichtag data-ev-today aus dem Render-Lauf.
// Placeholder-freie Texte (Spalten-Köpfe, Kategorie-Badges, Formular)
// laufen über data-i18n und applyTranslations. Modus-agnostisch: derselbe
// Aufruf läuft in Render-Pane, Reading und im Live-Block-Widget.

import { t } from '../../i18n.js';
import { isExtensionActive } from '../extensions/extension-lifecycle.js';
import {
  localTodayIso,
  composeDiffLines,
  composeSpanText,
  composeMilestoneText,
  composeCountdownText,
} from '../../../shared/markdown/perspective-events.js';
import {
  eventDiff,
  spanDiff,
  eventMilestones,
  nextOccurrence,
} from '../../../shared/events/events-core.js';

// Struktur-Fehler-Codes des Parsers (src/shared/events/events-fence.js) auf
// i18n-Keys abgebildet; unbekannte Codes behalten den sprachneutralen
// Fallback-Text aus der Pipeline (Code + Zeile).
const ERROR_KEYS = {
  badLine: 'events.error.badLine',
  unknownDirective: 'events.error.unknownDirective',
  duplicateDirective: 'events.error.duplicateDirective',
  badFilter: 'events.error.badFilter',
  tooManyCells: 'events.error.tooManyCells',
  queryWithEntries: 'events.error.queryWithEntries',
};

export function applyPerspectiveEventsIfPresent(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const errorItems = container.querySelectorAll(
    '.perspective-events .pev-error-item[data-ev-code]',
  );
  for (const el of errorItems) {
    const key = ERROR_KEYS[el.dataset.evCode];
    if (!key) continue;
    el.textContent = t(key)
      .replace('{line}', el.dataset.evLine || '')
      .replace('{detail}', el.dataset.evDetail || '');
  }
  for (const el of container.querySelectorAll('.perspective-events .pev-limit[data-ev-total]')) {
    el.textContent = t('events.rowLimit').replace('{total}', el.dataset.evTotal || '');
  }
  const roots =
    container.classList && container.classList.contains('perspective-events')
      ? [container]
      : container.querySelectorAll('.perspective-events');
  for (const ev of roots) {
    const today = ev.dataset.evToday || localTodayIso();
    // Datums-Picker-Knöpfe nur bei aktiver Picker-Erweiterung (Laufzeit-
    // Prüfung statt harter Abhängigkeit, Muster autocomplete).
    const pickVisible = isExtensionActive('date-picker');
    for (const btn of ev.querySelectorAll('.pev-form-pick')) btn.hidden = !pickVisible;
    for (const hint of ev.querySelectorAll('.pev-hint[data-ev-hint]')) {
      hint.title = t(`events.hint.${hint.dataset.evHint}`);
    }
    for (const td of ev.querySelectorAll('td.pev-diff')) fillDiffCell(td, today);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Differenz-Zelle: Richtung, gefilterte Staffelungs-Zeilen, Meilenstein-
// Badges und Wiederkehr-Countdown. Aufbau über DOM-Knoten (textContent),
// damit kein Nutzer-Text als HTML interpretiert wird. Idempotent: der
// Inhalt wird pro Lauf vollständig ersetzt.
function fillDiffCell(td, today) {
  const date = td.dataset.evDate || '';
  const end = td.dataset.evEnd || '';
  const recurring = td.dataset.evRecurring === 'x';
  td.textContent = '';
  const diff = eventDiff(date, today);
  const milestones = diff.valid ? eventMilestones(date, today) : [];
  if (diff.valid) {
    const dirKey =
      diff.direction === 'past'
        ? 'events.diff.past'
        : diff.direction === 'future'
          ? 'events.diff.future'
          : 'events.diff.today';
    td.appendChild(el('div', 'pev-diff-dir', t(dirKey)));
    if (diff.direction !== 'today') {
      for (const line of composeDiffLines(diff, t)) {
        td.appendChild(el('div', 'pev-diff-line', line));
      }
    }
    for (const m of milestones) {
      td.appendChild(el('span', 'pev-milestone-badge', `★ ${composeMilestoneText(m, t)}`));
    }
    if (recurring) {
      const occ = nextOccurrence(date, today);
      if (occ) {
        td.appendChild(
          el(
            'div',
            'pev-countdown',
            `${t('events.recurring.label')}: ${composeCountdownText(occ, t)}`,
          ),
        );
      }
    }
  }
  const tr = td.closest('tr');
  if (!tr) return;
  tr.classList.toggle('pev-milestone-row', milestones.length > 0);
  // Dauer-Angabe in der Ende-Zelle (kompakte Spannen-Differenz).
  const endTd = tr.querySelector('td.pev-end');
  if (!endTd) return;
  const existing = endTd.querySelector('.pev-span');
  if (existing) existing.remove();
  if (date && end) {
    const span = spanDiff(date, end);
    if (span.valid && !span.invalidOrder) {
      endTd.appendChild(
        el('div', 'pev-span', `${t('events.span.label')}: ${composeSpanText(span, t)}`),
      );
    }
  }
}
