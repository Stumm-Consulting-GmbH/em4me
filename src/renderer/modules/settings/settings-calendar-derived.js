// 4T-0747 (Epic 3E-0138): Editor einer abgeleiteten Zeitrechnung samt
// Nullpunkt-Auswahl und Spannen-Text.
'use strict';

import {
  STANDARD_CALENDAR_ID,
  normalizeCalendarConfig,
  standardCalendar,
} from '../../../shared/calendar/calendar-config.js';
import {
  convertInBlock,
  formatTuple,
  parseCanonical,
  spanTiers,
  spanUnits,
} from '../../../shared/calendar/calendar-core.js';
import { t } from '../../i18n.js';
import { showCalendarPicker } from '../calendar/calendar-picker.js';
import {
  calSysBaseDateLevels,
  calSysDateLevels,
  calSysDerivedProbe,
  calSysIdFromName,
  calSysInt,
  calSysSyncSegs,
  calSysZeroValue,
  calendarPersistForm,
} from './settings-calendar-model.js';
import { buildCalSysSegRow } from './settings-calendar-parts.js';
import { renderActiveSection } from './settings-mount.js';
import { buildSettingsRow } from './settings-shared.js';

// Detailansicht eines Blocks: Kalender-Editoren, „Kalender hinzufügen",
// Vorlage-Knopf und „Block schließen" (Muster Journal-Regal-Detail).
// 4T-0747 (Epic 3E-0138): Kurz-Editor einer abgeleiteten Zeitrechnung.
// Bearbeitbar sind nur Name, Bezug, Nullpunkt, Gliederungs-Tiefe und die
// beiden Richtungs-Kürzel; alles Übrige erbt sie phasenverschoben vom Bezug.
export function buildDerivedCalendarEditor(container, block, calDraft, calIdx) {
  const group = document.createElement('div');
  group.className = 'settings-calsys-cal';
  const head = document.createElement('div');
  head.className = 'settings-journals-journal-head';
  const title = document.createElement('h5');
  title.className = 'settings-journals-journal-title';
  const titleText = () =>
    `${String(calDraft.name || '').trim() || t('settings.calendar.calUntitled')} · ${t(
      'settings.calendar.derivedSuffix',
    )}`;
  title.textContent = titleText();
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = `settings-calsys-cal-remove-${calIdx}`;
  removeBtn.className = 'btn settings-calsys-cal-remove';
  removeBtn.textContent = t('settings.calendar.calRemove');
  removeBtn.addEventListener('click', () => {
    block.calendars.splice(calIdx, 1);
    renderActiveSection();
  });
  head.append(title, removeBtn);
  group.appendChild(head);

  const hint = document.createElement('p');
  hint.className = 'settings-row-hint settings-calsys-invalid';
  hint.id = `settings-calsys-cal-invalid-${calIdx}`;
  const previewOut = document.createElement('p');
  previewOut.className = 'settings-row-hint settings-calsys-preview';
  previewOut.id = `settings-calsys-preview-${calIdx}`;

  // Vorschau: kanonischer Wert, Namens-Form, Zeitspanne in der gewählten
  // Tiefe und der entsprechende Zeitpunkt der Bezugs-Zeitrechnung.
  const refresh = () => {
    const probe = calSysDerivedProbe(block, calDraft);
    const normalized = probe ? probe.calendars.find((c) => c.id === 'probe-cal') || null : null;
    hint.hidden = !!normalized;
    hint.textContent = normalized ? '' : t('settings.calendar.derivedInvalidHint');
    if (!normalized) {
      previewOut.textContent = t('settings.calendar.previewUnavailable');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    const parsed = parseCanonical(normalized, calDraft.previewInput);
    if (!parsed.ok) {
      previewOut.textContent = t('settings.calendar.previewInvalidValue');
      previewOut.classList.add('settings-calsys-preview-error');
      return;
    }
    previewOut.classList.remove('settings-calsys-preview-error');
    const lines = [
      t('settings.calendar.derivedPreviewCanonical').replace(
        '{value}',
        formatTuple(normalized, parsed.tuple) || '',
      ),
    ];
    const span = calSysSpanText(normalized, parsed.tuple, calDraft.derived.depth);
    if (span) lines.push(t('settings.calendar.derivedPreviewSpan').replace('{span}', span));
    const baseCal = probe.calendars.find((c) => c.id === 'probe-base');
    if (baseCal) {
      const back = convertInBlock(probe, 'probe-cal', parsed.tuple, 'probe-base');
      if (back.ok) {
        lines.push(
          t('settings.calendar.derivedPreviewBase')
            .replace('{name}', baseCal.name)
            .replace('{value}', formatTuple(baseCal, back.tuple) || ''),
        );
      }
    }
    previewOut.textContent = lines.join(' · ');
  };

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `settings-calsys-cal-name-${calIdx}`;
  nameInput.className = 'settings-input';
  nameInput.value = calDraft.name;
  nameInput.addEventListener('input', () => {
    calDraft.name = nameInput.value;
    title.textContent = titleText();
  });
  group.appendChild(buildSettingsRow('settings.calendar.calNameLabel', nameInput));
  group.appendChild(hint);

  // Bezugs-Auswahl: eigenständige Kalender des Blocks plus die eingebaute
  // Standard-Zeitrechnung. Ableitungen stehen nicht zur Wahl (keine Ketten).
  const baseSelect = document.createElement('select');
  baseSelect.id = `settings-calsys-derived-base-${calIdx}`;
  baseSelect.className = 'settings-select';
  const addOption = (value, label) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    baseSelect.appendChild(opt);
  };
  addOption('', t('settings.calendar.derivedBaseNone'));
  addOption(STANDARD_CALENDAR_ID, t('settings.calendar.derivedBaseStandard'));
  block.calendars.forEach((other) => {
    if (other.derived || other === calDraft) return;
    // Ein noch nicht angewendeter Kalender bekommt seine Kennung jetzt,
    // damit der Verweis stabil bleibt (beim Anwenden bleibt sie stehen).
    if (!String(other.id || '').trim()) {
      const taken = new Set(block.calendars.map((c) => c.id).filter(Boolean));
      other.id = calSysIdFromName(other.name, 'kalender', taken);
    }
    addOption(other.id, String(other.name || '').trim() || t('settings.calendar.calUntitled'));
  });
  baseSelect.value = calDraft.derived.fromId || '';
  baseSelect.addEventListener('change', () => {
    calDraft.derived.fromId = baseSelect.value;
    const levels = calSysBaseDateLevels(block, baseSelect.value);
    calDraft.derived.zeroSegs = calSysSyncSegs(calDraft.derived.zeroSegs, levels.length);
    calDraft.derived.depth = '';
    // Beispiel-Wert auf den Nullpunkt setzen: die Vorschau startet gueltig
    // statt mit einer roten Meldung.
    calDraft.previewInput = calSysZeroValue(levels.length);
    renderActiveSection();
  });
  group.appendChild(buildSettingsRow('settings.calendar.derivedBase', baseSelect));

  // Nullpunkt in der Notation des Bezugs (volle Tages-Grenze).
  const baseLevels = calSysBaseDateLevels(block, calDraft.derived.fromId);
  calDraft.derived.zeroSegs = calSysSyncSegs(calDraft.derived.zeroSegs, baseLevels.length);
  if (baseLevels.length > 0) {
    buildCalSysSegRow(
      group,
      'settings.calendar.derivedZero',
      `settings-calsys-derived-zero-${calIdx}`,
      calDraft.derived.zeroSegs,
      baseLevels,
      refresh,
    );
    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.id = `settings-calsys-derived-pick-${calIdx}`;
    pickBtn.className = 'btn settings-calsys-row-add';
    pickBtn.textContent = t('settings.calendar.derivedZeroPick');
    pickBtn.addEventListener('click', async () => {
      const picked = await calSysPickZero(block, calDraft, pickBtn);
      if (!picked) return;
      calDraft.derived.zeroSegs = picked;
      renderActiveSection();
    });
    group.appendChild(pickBtn);
  }

  // Gliederungs-Tiefe: die Tiefen der Bezugs-Zeitrechnung, benannt nach
  // ihren Einheiten (gröbste zuerst gelesen, wie sie später erscheinen).
  const probe = calSysDerivedProbe(block, calDraft);
  const normalized = probe ? probe.calendars.find((c) => c.id === 'probe-cal') || null : null;
  if (normalized) {
    const depthSelect = document.createElement('select');
    depthSelect.id = `settings-calsys-derived-depth-${calIdx}`;
    depthSelect.className = 'settings-select';
    const units = spanUnits(normalized) || [];
    units.forEach((_, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = units
        .slice(0, i + 1)
        .map((u) => u.name)
        .reverse()
        .join(', ');
      depthSelect.appendChild(opt);
    });
    const depthValue = calSysInt(calDraft.derived.depth);
    depthSelect.value = String(
      depthValue !== null && depthValue >= 0 && depthValue < units.length
        ? depthValue
        : units.length - 1,
    );
    depthSelect.addEventListener('change', () => {
      calDraft.derived.depth = depthSelect.value;
      refresh();
    });
    group.appendChild(buildSettingsRow('settings.calendar.derivedDepth', depthSelect));
  }

  const beforeInput = document.createElement('input');
  beforeInput.type = 'text';
  beforeInput.id = `settings-calsys-derived-before-${calIdx}`;
  beforeInput.className = 'settings-input';
  beforeInput.value = calDraft.derived.labelBefore;
  beforeInput.addEventListener('input', () => {
    calDraft.derived.labelBefore = beforeInput.value;
    refresh();
  });
  group.appendChild(buildSettingsRow('settings.calendar.derivedLabelBefore', beforeInput));

  const afterInput = document.createElement('input');
  afterInput.type = 'text';
  afterInput.id = `settings-calsys-derived-after-${calIdx}`;
  afterInput.className = 'settings-input';
  afterInput.value = calDraft.derived.labelAfter;
  afterInput.addEventListener('input', () => {
    calDraft.derived.labelAfter = afterInput.value;
    refresh();
  });
  group.appendChild(buildSettingsRow('settings.calendar.derivedLabelAfter', afterInput));

  const previewHeading = document.createElement('h4');
  previewHeading.className = 'settings-export-group-title';
  previewHeading.textContent = t('settings.calendar.previewGroup');
  group.appendChild(previewHeading);
  const previewInput = document.createElement('input');
  previewInput.type = 'text';
  previewInput.id = `settings-calsys-preview-input-${calIdx}`;
  previewInput.className = 'settings-input';
  previewInput.value = calDraft.previewInput || '';
  previewInput.addEventListener('input', () => {
    calDraft.previewInput = previewInput.value;
    refresh();
  });
  group.appendChild(buildSettingsRow('settings.calendar.previewInput', previewInput));
  group.appendChild(previewOut);

  refresh();
  container.appendChild(group);
}

// Zeitspanne eines Werts als Text in der gewählten Tiefe; Bestandteile der
// Länge null entfallen, die Richtung trägt das Kürzel der Ableitung.
function calSysSpanText(cal, tuple, depthRaw) {
  const result = spanTiers(cal, tuple);
  if (!result || result.tiers.length === 0) return '';
  const depth = calSysInt(String(depthRaw || '').trim());
  const idx =
    depth !== null && depth >= 0 && depth < result.tiers.length ? depth : result.tiers.length - 1;
  const items = result.tiers[idx];
  const shown = items.filter((u) => u.count > 0);
  const text = (shown.length > 0 ? shown : items.slice(-1))
    .map((u) => `${u.count} ${u.name}`)
    .join(', ');
  if (result.direction !== 'before') return text;
  const label = cal.epochs[0].abbr || cal.epochs[0].name || '';
  return label === '' ? text : `${text} ${label}`;
}

// Nullpunkt über den vorhandenen Picker wählen: Er läuft auf einer Probe-
// Konfiguration, die nur die Bezugs-Zeitrechnung enthält, und liefert die
// Datums-Segmente des gewählten Zeitpunkts.
async function calSysPickZero(block, calDraft, anchorEl) {
  const fromId = String(calDraft.derived.fromId || '').trim();
  if (fromId === '') return null;
  let raw;
  if (fromId === STANDARD_CALENDAR_ID) {
    raw = standardCalendar();
  } else {
    const base = block.calendars.find((c) => !c.derived && c.id === fromId);
    raw = base ? calendarPersistForm(base) : null;
  }
  if (!raw) return null;
  const config = normalizeCalendarConfig({ blocks: [{ id: 'probe', calendars: [raw] }] });
  if (!config) return null;
  const cal = config.blocks[0].calendars[0];
  const rect = anchorEl.getBoundingClientRect();
  const segs = calDraft.derived.zeroSegs.map((s) => calSysInt(s));
  // Zeit-Segmente in Minimal-Stellung ergänzen (Tupel: größte Ebene zuerst).
  const timeStarts = cal.levels
    .slice(0, cal.levels.length - segs.length)
    .map((l) => l.start)
    .reverse();
  const value =
    segs.length > 0 && segs.every((s) => s !== null)
      ? formatTuple(cal, segs.concat(timeStarts)) || ''
      : '';
  const picked = await showCalendarPicker({
    config,
    calendarName: cal.name,
    value,
    x: rect.left,
    y: rect.bottom,
  });
  if (!picked || !Array.isArray(picked.tuple)) return null;
  const dateCount = calSysDateLevels(cal.levels).length;
  return picked.tuple.slice(0, dateCount).map(String);
}
