// 4T-0372 (Epic 3E-0069): Bereich „Uhr" der Einstellungs-Seite
// (erweiterungs-gebunden über settingsSections der Erweiterung clock;
// dynamische Registrierung nach dem Muster format-toolbar-settings.js).
//
// Vier Blöcke: „Anzeige" schaltet die Bestandteile (analoge Uhr, digitale
// Uhr, Datum, Kalenderwoche), die drei Folge-Blöcke konfigurieren jeweils
// einen davon und erscheinen nur, wenn ihr Bestandteil eingeschaltet ist
// (kein Rauschen durch wirkungslose Optionen). Entwurf-/Anwenden-Logik wie
// der Bereich „Panel-Reihenfolge"; die Wirkung übernimmt setClockOptions
// (clock-panel.js), das die Panels neu aufbaut, den Timer-Takt nachzieht
// und an alle Fenster broadcastet.
'use strict';

import { t } from '../../i18n.js';
import { refreshSettingsButtons } from './settings-mount.js';
import { registerSettingsSection } from './settings-page.js';
import { getClockOptions, setClockOptions } from '../clock/clock-panel.js';
import {
  ANALOG_SIZES,
  DATE_FORMATS,
  DIAL_STYLES,
  HOUR_FORMATS,
  SECOND_MOTIONS,
  normalizeClockOptions,
} from '../../../shared/clock/clock-options.js';
// 4T-0637 (Epic 3E-0069): Grenzen und Klemmung der Schlummer-Dauer.
import {
  SNOOZE_MAX_MINUTES,
  SNOOZE_MIN_MINUTES,
  normalizeSnoozeMinutes,
} from '../../../shared/clock/clock-alarms.js';

// Auswahl-Werte auf ihre i18n-Keys. Reihenfolge der Optionen im Select
// folgt der Reihenfolge im Optionen-Modell (erste Position = Default).
const SIZE_KEYS = {
  small: 'settings.clock.size.small',
  medium: 'settings.clock.size.medium',
  large: 'settings.clock.size.large',
};
const DIAL_KEYS = {
  numbers: 'settings.clock.dial.numbers',
  quarters: 'settings.clock.dial.quarters',
  ticks: 'settings.clock.dial.ticks',
  plain: 'settings.clock.dial.plain',
};
const MOTION_KEYS = {
  step: 'settings.clock.motion.step',
  sweep: 'settings.clock.motion.sweep',
};
const HOUR_KEYS = {
  24: 'settings.clock.hourFormat.h24',
  12: 'settings.clock.hourFormat.h12',
};
const DATE_KEYS = {
  long: 'settings.clock.dateFormat.long',
  medium: 'settings.clock.dateFormat.medium',
  short: 'settings.clock.dateFormat.short',
  iso: 'settings.clock.dateFormat.iso',
};

// Entwurf lazy anlegen (Muster ensureDraft in panel-order-settings.js).
function ensureDraft(draft) {
  if (!draft.clock) draft.clock = getClockOptions();
  return draft.clock;
}

// Referenzen des zuletzt gerenderten Bereichs: eine Options-Änderung aus
// einem anderen Fenster (Broadcast) zieht den offenen Entwurf auf den
// neuen Ist-Stand nach (Muster panel-order-settings.js).
let lastDraft = null;
let lastBody = null;
let lastRerender = null;

document.addEventListener('scg:clock-options-changed', () => {
  if (!lastDraft || !lastDraft.clock) return;
  lastDraft.clock = getClockOptions();
  if (lastBody && lastBody.isConnected && typeof lastRerender === 'function') lastRerender();
  refreshSettingsButtons();
});

function subhead(labelKey) {
  const el = document.createElement('div');
  el.className = 'settings-subhead';
  el.textContent = t(labelKey);
  return el;
}

function row(labelKey, inputEl) {
  const el = document.createElement('div');
  el.className = 'settings-row';
  const label = document.createElement('label');
  label.htmlFor = inputEl.id;
  label.textContent = t(labelKey);
  el.append(label, inputEl);
  return el;
}

function checkboxRow(id, labelKey, checked, onChange) {
  const input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  input.checked = checked === true;
  input.addEventListener('change', () => onChange(input.checked));
  return row(labelKey, input);
}

function selectRow(id, labelKey, values, keyMap, current, onChange) {
  const select = document.createElement('select');
  select.id = id;
  select.className = 'settings-input';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = t(keyMap[value]);
    select.appendChild(option);
  }
  select.value = String(current);
  select.addEventListener('change', () => onChange(select.value));
  return row(labelKey, select);
}

function buildInto(body, draft, rerender) {
  const values = draft.clock;
  // Ein Options-Wechsel kann Folge-Blöcke ein- oder ausblenden, deshalb
  // rendert jede Änderung den Bereich neu.
  const set = (patch) => {
    draft.clock = { ...draft.clock, ...patch };
    rerender();
    refreshSettingsButtons();
  };

  const intro = document.createElement('p');
  intro.className = 'settings-row-hint';
  intro.textContent = t('settings.clock.intro');
  body.appendChild(intro);

  body.appendChild(subhead('settings.clock.group.display'));
  body.appendChild(
    checkboxRow('settings-clock-analog', 'settings.clock.showAnalog', values.showAnalog, (v) =>
      set({ showAnalog: v }),
    ),
  );
  body.appendChild(
    checkboxRow('settings-clock-digital', 'settings.clock.showDigital', values.showDigital, (v) =>
      set({ showDigital: v }),
    ),
  );
  body.appendChild(
    checkboxRow('settings-clock-date', 'settings.clock.showDate', values.showDate, (v) =>
      set({ showDate: v }),
    ),
  );
  body.appendChild(
    checkboxRow('settings-clock-week', 'settings.clock.showWeek', values.showWeek, (v) =>
      set({ showWeek: v }),
    ),
  );
  // 4T-0679 (Epic 3E-0139): Die Groessen-Auswahl steht im Block „Anzeige"
  // und nicht mehr unter „Analoge Uhr". Sie bemisst seit diesem Task
  // Zifferblatt UND digitale Anzeige; im Analog-Block waere sie fuer jeden
  // unsichtbar, der die Uhr ohne Zifferblatt betreibt. Platz hinter den vier
  // Sichtbarkeits-Schaltern: erst was angezeigt wird, dann wie gross.
  body.appendChild(
    selectRow(
      'settings-clock-size',
      'settings.clock.size',
      ANALOG_SIZES,
      SIZE_KEYS,
      values.analogSize,
      (v) => set({ analogSize: v }),
    ),
  );

  if (values.showAnalog) {
    body.appendChild(subhead('settings.clock.group.analog'));
    body.appendChild(
      selectRow(
        'settings-clock-dial',
        'settings.clock.dial',
        DIAL_STYLES,
        DIAL_KEYS,
        values.dial,
        (v) => set({ dial: v }),
      ),
    );
    body.appendChild(
      checkboxRow(
        'settings-clock-second-hand',
        'settings.clock.secondHand',
        values.secondHand,
        (v) => set({ secondHand: v }),
      ),
    );
    if (values.secondHand) {
      body.appendChild(
        selectRow(
          'settings-clock-motion',
          'settings.clock.motion',
          SECOND_MOTIONS,
          MOTION_KEYS,
          values.secondMotion,
          (v) => set({ secondMotion: v }),
        ),
      );
    }
  }

  if (values.showDigital) {
    body.appendChild(subhead('settings.clock.group.digital'));
    body.appendChild(
      selectRow(
        'settings-clock-hour-format',
        'settings.clock.hourFormat',
        HOUR_FORMATS,
        HOUR_KEYS,
        values.hourFormat,
        (v) => set({ hourFormat: Number(v) }),
      ),
    );
    body.appendChild(
      checkboxRow('settings-clock-seconds', 'settings.clock.showSeconds', values.showSeconds, (v) =>
        set({ showSeconds: v }),
      ),
    );
  }

  if (values.showDate) {
    body.appendChild(subhead('settings.clock.group.date'));
    body.appendChild(
      selectRow(
        'settings-clock-date-format',
        'settings.clock.dateFormat',
        DATE_FORMATS,
        DATE_KEYS,
        values.dateFormat,
        (v) => set({ dateFormat: v }),
      ),
    );
  }

  // 4T-0637 (Epic 3E-0069): Wecker-Block. Anders als die vier Blöcke darüber
  // hängt er nicht an einem Anzeige-Bestandteil, sondern am Wecker-Modus des
  // Panels und steht deshalb immer.
  // 4T-0752 (Epic 3E-0146): Kalender-Modus. Eigener Block, weil die Option
  // den Monatskalender betrifft und nicht die Uhr-Anzeige; showWeek im Block
  // "Anzeige" steuert weiterhin die Textzeile unter der Uhrzeit.
  body.appendChild(subhead('settings.clock.group.calendar'));
  body.appendChild(
    checkboxRow(
      'settings-clock-calendar-week',
      'settings.clock.showCalendarWeek',
      values.showCalendarWeek,
      (v) => set({ showCalendarWeek: v }),
    ),
  );

  body.appendChild(subhead('settings.clock.group.alarm'));
  const snooze = document.createElement('input');
  snooze.id = 'settings-clock-snooze';
  snooze.className = 'settings-input';
  snooze.type = 'number';
  snooze.min = String(SNOOZE_MIN_MINUTES);
  snooze.max = String(SNOOZE_MAX_MINUTES);
  snooze.step = '1';
  snooze.value = String(values.snoozeMinutes);
  // Zwischenstände beim Tippen (leeres Feld) dürfen den Entwurf nicht auf
  // den Default zurückwerfen; erst ein vollständiger Wert zählt.
  snooze.addEventListener('change', () => {
    if (snooze.value === '') return;
    set({ snoozeMinutes: normalizeSnoozeMinutes(snooze.value) });
  });
  body.appendChild(row('settings.clock.snoozeMinutes', snooze));
}

function renderClockSection(container, draft) {
  ensureDraft(draft);
  const root = document.createElement('div');
  root.className = 'clock-settings';
  container.appendChild(root);
  const rerender = () => {
    root.innerHTML = '';
    buildInto(root, draft, rerender);
  };
  lastDraft = draft;
  lastBody = root;
  lastRerender = rerender;
  rerender();
}

// Persistiert den Entwurf; setClockOptions normalisiert, baut die Panels
// neu auf, zieht den Timer-Takt nach und broadcastet. Danach den Entwurf
// auf den wirksamen Stand ziehen (Muster applyPanelOrderSection).
async function applyClockSection(draft) {
  if (!draft.clock) return;
  await setClockOptions(draft.clock);
  draft.clock = getClockOptions();
}

// Spiegelt applyClockSection: normalisierter Entwurf gegen den wirksamen
// Stand.
function dirtyClockSection(draft) {
  if (!draft.clock) return false;
  return JSON.stringify(normalizeClockOptions(draft.clock)) !== JSON.stringify(getClockOptions());
}

registerSettingsSection({
  id: 'clock',
  titleKey: 'settings.clock.title',
  render: renderClockSection,
  apply: applyClockSection,
  dirty: dirtyClockSection,
});
