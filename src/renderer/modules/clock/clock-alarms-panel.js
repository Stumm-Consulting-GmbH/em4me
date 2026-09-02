// 4T-000637 (Epic 3E-000069): Wecker der Uhr-Erweiterung im Renderer.
//
// Drei Aufgaben, bewusst getrennt vom Uhr-Panel selbst (clock-panel.js baut
// nur noch den Rumpf des Wecker-Modus hier ein):
// - Liste der Wecker im Panel: Aktiv-Schalter, Uhrzeit, Bezeichnung und
//   Wiederholung je Zeile, Zeilen-Menue zum Bearbeiten und Loeschen.
// - Anlege- und Bearbeiten-Dialog (#alarm-modal, Muster showTabGroupDialog).
//   Die Uhrzeit kommt ueber den vorhandenen Picker mit Ziffern-Segmenten;
//   ein Freitextfeld gaebe es hier nicht (PO-Vorgabe Eingabe-Komfort).
// - Meldung faelliger Wecker (#alarm-due-modal) mit Bestaetigen und
//   Schlummern, dazu die System-Benachrichtigung bei nicht fokussiertem
//   Fenster.
//
// Der Melde-Weg ist bewusst NICHT der der Erinnerungen: jener haengt an
// Datei, Zeile und Task-Marker (Erledigt togglet den Task, Spaeter schreibt
// in die Quelldatei). Ein Wecker hat weder Datei noch Bereich.
//
// Die Faelligkeits-Pruefung liegt im Main (alarm-check.js) und laeuft
// unabhaengig vom Panel weiter, auch wenn die Uhr einen anderen Modus zeigt
// oder das Panel geschlossen ist.
'use strict';

import { api, $ } from '../app/api.js';
import { t } from '../../i18n.js';
import { showDateTimePicker } from '../calendar/date-picker.js';
import { appendContextMenuItem, placeContextMenuAt } from '../dialogs/context-menu-utils.js';
import { contextMenu } from '../app/app-state.js';
import {
  ALARM_REPEATS,
  CLOCK_ALARMS_KEY,
  DEFAULT_SNOOZE_MINUTES,
  MAX_LABEL_LENGTH,
  WEEKDAY_COUNT,
  nextAlarmId,
  normalizeAlarms,
} from '../../../shared/clock/clock-alarms.js';

// Zugriff auf die Uhr-Optionen (Schlummer-Dauer) wird zur Laufzeit von
// clock-panel.js angehaengt. Bewusst kein Import von dort: clock-panel.js
// zieht dieses Modul fuer den Wecker-Modus, ein Rueck-Import waere ein
// Zyklus (Muster attachSidebarLayoutPersistence in sidebar-layout.js).
let clockOptionsFn = () => ({ snoozeMinutes: DEFAULT_SNOOZE_MINUTES });

export function attachClockOptions(fn) {
  if (typeof fn === 'function') clockOptionsFn = fn;
}

// --- Zustand ------------------------------------------------------------------------
// Laufzeit-Wahrheit des Fensters; bis initAlarmsFromStore gelaufen ist gilt
// die leere Liste.
let alarms = [];

export function getAlarms() {
  return alarms.map((a) => ({ ...a }));
}

export async function initAlarmsFromStore() {
  let stored;
  try {
    stored = await api.getSetting(CLOCK_ALARMS_KEY);
  } catch {
    stored = null;
  }
  alarms = normalizeAlarms(stored);
  return getAlarms();
}

// Liste setzen — normalisiert, benachrichtigt die Panels und persistiert.
// persist:false fuer den Empfang des Fenster-Broadcasts, damit der Store
// nicht doppelt geschrieben wird (Muster setClockOptions).
export async function setAlarms(next, opts = {}) {
  const normalized = normalizeAlarms(next);
  if (JSON.stringify(normalized) === JSON.stringify(alarms)) return getAlarms();
  alarms = normalized;
  document.dispatchEvent(new CustomEvent('scg:clock-alarms-changed'));
  if (opts.persist !== false) await api.setSetting(CLOCK_ALARMS_KEY, normalized);
  return getAlarms();
}

// --- Beschriftungen -----------------------------------------------------------------

// Wochentags-Kuerzel in ISO-Reihenfolge (0 = Montag), lokalisiert ueber die
// Laufzeit statt ueber eigene i18n-Keys: Intl kennt die Kuerzel bereits in
// allen fuenf Sprachen.
function weekdayShortNames(lang) {
  const out = [];
  // 2099-06-15 ist ein Montag; von dort sieben Tage weiter.
  const base = new Date(2099, 5, 15);
  for (let i = 0; i < WEEKDAY_COUNT; i++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    try {
      out.push(new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(day));
    } catch {
      out.push(new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day));
    }
  }
  return out;
}

// Zweite Zeile eines Listen-Eintrags: Bezeichnung und Wiederholung.
function alarmSubtitle(alarm, lang) {
  const parts = [];
  if (alarm.label) parts.push(alarm.label);
  if (alarm.repeat === 'weekdays') {
    const names = weekdayShortNames(lang);
    parts.push(alarm.days.map((d) => names[d]).join(', '));
  } else {
    parts.push(t(`clock.alarm.repeat.${alarm.repeat}`));
  }
  return parts.join(' · ');
}

// --- Panel-Liste ---------------------------------------------------------------------

// Baut den Wecker-Modus in den Panel-Rumpf. Wird von clock-panel.js beim
// Panel-Aufbau gerufen (Modus-Wechsel, Sprach-Wechsel, Options-Aenderung).
export function buildAlarmsView(body, lang) {
  const list = document.createElement('div');
  list.className = 'alarm-list';
  if (alarms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'clock-placeholder';
    empty.textContent = t('clock.alarm.empty');
    list.appendChild(empty);
  }
  for (const alarm of alarms) {
    list.appendChild(buildAlarmRow(alarm, lang));
  }
  body.appendChild(list);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'alarm-add-btn';
  add.textContent = t('clock.alarm.add');
  add.addEventListener('click', () => {
    void addAlarm();
  });
  body.appendChild(add);
}

function buildAlarmRow(alarm, lang) {
  const row = document.createElement('div');
  row.className = 'alarm-row' + (alarm.enabled ? '' : ' disabled');
  row.dataset.alarmId = alarm.id;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'alarm-toggle' + (alarm.enabled ? ' on' : '');
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', alarm.enabled ? 'true' : 'false');
  toggle.setAttribute('aria-label', t('clock.alarm.toggle'));
  toggle.title = t('clock.alarm.toggle');
  toggle.addEventListener('click', () => {
    void setAlarms(alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: !a.enabled } : a)));
  });
  row.appendChild(toggle);

  const main = document.createElement('div');
  main.className = 'alarm-row-main';
  const time = document.createElement('div');
  time.className = 'alarm-row-time';
  time.textContent = alarm.time;
  const sub = document.createElement('div');
  sub.className = 'alarm-row-sub';
  sub.textContent = alarmSubtitle(alarm, lang);
  sub.title = sub.textContent;
  main.appendChild(time);
  main.appendChild(sub);
  // Klick auf die Zeile oeffnet den Bearbeiten-Dialog (der Schalter davor
  // faengt seinen eigenen Klick ab).
  main.addEventListener('click', () => {
    void editAlarm(alarm.id);
  });
  row.appendChild(main);

  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'alarm-row-menu';
  menu.setAttribute('aria-label', t('clock.alarm.rowMenu'));
  menu.title = t('clock.alarm.rowMenu');
  menu.textContent = '⋯';
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    showRowMenu(alarm.id, e.clientX, e.clientY);
  });
  row.appendChild(menu);
  return row;
}

function showRowMenu(id, x, y) {
  contextMenu.innerHTML = '';
  appendContextMenuItem(contextMenu, {
    key: 'clock.alarm.edit',
    action: () => {
      void editAlarm(id);
    },
  });
  appendContextMenuItem(contextMenu, {
    key: 'clock.alarm.delete',
    action: () => {
      void setAlarms(alarms.filter((a) => a.id !== id));
    },
  });
  placeContextMenuAt(contextMenu, x, y);
}

// --- Anlegen und Bearbeiten ------------------------------------------------------

async function addAlarm() {
  const result = await showAlarmDialog(null);
  if (!result) return;
  await setAlarms([...alarms, { ...result, id: nextAlarmId(alarms) }]);
}

async function editAlarm(id) {
  const current = alarms.find((a) => a.id === id);
  if (!current) return;
  const result = await showAlarmDialog(current);
  if (!result) return;
  await setAlarms(alarms.map((a) => (a.id === id ? { ...a, ...result } : a)));
}

// Dialog fuer Anlegen und Bearbeiten. Ergebnis: { time, label, repeat, days }
// oder null bei Abbruch.
export function showAlarmDialog(existing, lang = 'de') {
  const modal = $('#alarm-modal');
  const titleEl = $('#alarm-modal-title');
  const timeBtn = $('#alarm-time');
  const labelInput = $('#alarm-label');
  const repeatSel = $('#alarm-repeat');
  const daysEl = $('#alarm-days');
  const btnOk = $('#btn-alarm-ok');
  const btnCancel = $('#btn-alarm-cancel');
  if (!modal || !timeBtn || !labelInput || !repeatSel || !daysEl) return Promise.resolve(null);

  return new Promise((resolve) => {
    let time = existing && existing.time ? existing.time : '07:00';
    let days = existing && Array.isArray(existing.days) ? [...existing.days] : [];
    titleEl.textContent = t(
      existing ? 'clock.alarm.dialog.titleEdit' : 'clock.alarm.dialog.titleNew',
    );
    timeBtn.textContent = time;
    timeBtn.setAttribute('aria-label', `${t('clock.alarm.field.time')}: ${time}`);
    labelInput.value = existing && existing.label ? existing.label : '';
    labelInput.placeholder = t('clock.alarm.labelPlaceholder');
    labelInput.maxLength = MAX_LABEL_LENGTH;
    btnOk.textContent = t('dialog.ok');
    btnCancel.textContent = t('dialog.cancel');

    repeatSel.innerHTML = '';
    for (const repeat of ALARM_REPEATS) {
      const opt = document.createElement('option');
      opt.value = repeat;
      opt.textContent = t(`clock.alarm.repeat.${repeat}`);
      repeatSel.appendChild(opt);
    }
    repeatSel.value = existing && existing.repeat ? existing.repeat : ALARM_REPEATS[0];

    // Wochentags-Zeile: sieben Schalter, nur beim passenden Muster sichtbar.
    const names = weekdayShortNames(lang);
    daysEl.innerHTML = '';
    const dayButtons = [];
    for (let i = 0; i < WEEKDAY_COUNT; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'alarm-day' + (days.includes(i) ? ' selected' : '');
      btn.textContent = names[i];
      btn.setAttribute('aria-pressed', days.includes(i) ? 'true' : 'false');
      btn.addEventListener('click', () => {
        const on = !days.includes(i);
        days = on ? [...days, i].sort((a, b) => a - b) : days.filter((d) => d !== i);
        btn.classList.toggle('selected', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        updateOkState();
      });
      dayButtons.push(btn);
      daysEl.appendChild(btn);
    }

    const syncRepeat = () => {
      daysEl.hidden = repeatSel.value !== 'weekdays';
      updateOkState();
    };
    // Ein Wochentags-Wecker ohne gewaehlten Tag wuerde nie feuern; das
    // Bestaetigen bleibt bis zur Auswahl gesperrt.
    function updateOkState() {
      btnOk.disabled = repeatSel.value === 'weekdays' && days.length === 0;
    }

    const onTime = async () => {
      const rect = timeBtn.getBoundingClientRect();
      const picked = await showDateTimePicker({
        x: rect.left,
        y: rect.bottom + 4,
        time,
        dateEnabled: false,
        timeEnabled: true,
      });
      if (!picked || !picked.time) return;
      time = picked.time;
      timeBtn.textContent = time;
      timeBtn.setAttribute('aria-label', `${t('clock.alarm.field.time')}: ${time}`);
    };

    const finish = (value) => {
      modal.hidden = true;
      modal.removeEventListener('keydown', onKeydown, true);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      repeatSel.removeEventListener('change', syncRepeat);
      timeBtn.removeEventListener('click', onTime);
      resolve(value);
    };
    const onOk = () => {
      if (btnOk.disabled) return;
      finish({
        time,
        label: labelInput.value.trim(),
        repeat: repeatSel.value,
        days: repeatSel.value === 'weekdays' ? days : [],
      });
    };
    const onCancel = () => finish(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    const backdrop = modal.querySelector('.bookmark-modal-backdrop');

    modal.addEventListener('keydown', onKeydown, true);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    repeatSel.addEventListener('change', syncRepeat);
    timeBtn.addEventListener('click', onTime);
    syncRepeat();

    modal.hidden = false;
    setTimeout(() => timeBtn.focus(), 0);
  });
}

// --- Faelligkeit ---------------------------------------------------------------------
// Wartende Meldungen (Schluessel -> Eintrag). Mehrere gleichzeitig faellige
// Wecker teilen sich einen Dialog; Bestaetigen und Schlummern wirken auf
// alle angezeigten Eintraege.
const pending = new Map();
let dueDialogOpen = false;

function renderDueList(listEl, lang) {
  listEl.innerHTML = '';
  for (const item of pending.values()) {
    const row = document.createElement('div');
    row.className = 'alarm-due-row';
    const time = document.createElement('div');
    time.className = 'alarm-due-time';
    time.textContent = item.time;
    row.appendChild(time);
    const label = document.createElement('div');
    label.className = 'alarm-due-label';
    label.textContent = item.label || t(`clock.alarm.repeat.${item.repeat}`);
    row.appendChild(label);
    listEl.appendChild(row);
  }
  void lang;
}

function showDueDialog(lang) {
  const modal = $('#alarm-due-modal');
  const listEl = $('#alarm-due-list');
  const btnSnooze = $('#btn-alarm-snooze');
  const btnConfirm = $('#btn-alarm-confirm');
  if (!modal || !listEl || dueDialogOpen) return;
  dueDialogOpen = true;

  const minutes = clockOptionsFn().snoozeMinutes;
  btnSnooze.textContent = t('clock.alarm.due.snooze').replace('{n}', String(minutes));
  btnConfirm.textContent = t('clock.alarm.due.confirm');
  renderDueList(listEl, lang);

  const finish = async (mode) => {
    const keys = [...pending.keys()];
    pending.clear();
    modal.hidden = true;
    dueDialogOpen = false;
    modal.removeEventListener('keydown', onKeydown, true);
    btnSnooze.removeEventListener('click', onSnooze);
    btnConfirm.removeEventListener('click', onConfirm);
    backdrop.removeEventListener('click', onConfirm);
    for (const key of keys) {
      try {
        if (mode === 'snooze') await api.alarmSnooze(key, minutes);
        else await api.alarmConfirm(key);
      } catch (err) {
        console.warn('Wecker-Aktion fehlgeschlagen:', err);
      }
    }
  };
  const onSnooze = () => void finish('snooze');
  const onConfirm = () => void finish('confirm');
  const onKeydown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onConfirm();
    }
  };
  const backdrop = modal.querySelector('.bookmark-modal-backdrop');

  modal.addEventListener('keydown', onKeydown, true);
  btnSnooze.addEventListener('click', onSnooze);
  btnConfirm.addEventListener('click', onConfirm);
  backdrop.addEventListener('click', onConfirm);
  modal.hidden = false;
  setTimeout(() => btnConfirm.focus(), 0);
}

// Zustellung vom Main-Pruefer. Der Dialog erscheint immer; die System-
// Benachrichtigung nur zusaetzlich bei nicht fokussiertem Fenster, sonst
// stuende dieselbe Meldung doppelt auf dem Schirm.
function onAlarmDue(payload, lang) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return;
  for (const item of items) pending.set(item.key, item);
  if (!document.hasFocus() && typeof api.systemNotify === 'function') {
    const first = items[0];
    void api.systemNotify({
      title: t('clock.alarm.due.title'),
      body: first.label ? `${first.time} — ${first.label}` : first.time,
    });
  }
  if (dueDialogOpen) {
    const listEl = $('#alarm-due-list');
    if (listEl) renderDueList(listEl, lang);
    return;
  }
  showDueDialog(lang);
}

// --- Init ----------------------------------------------------------------------------

export function initClockAlarms(getLang) {
  const lang = () => (typeof getLang === 'function' ? getLang() : 'de');
  if (typeof api.onAlarmDue === 'function') {
    api.onAlarmDue((payload) => onAlarmDue(payload, lang()));
  }
  if (typeof api.onClockAlarmsChanged === 'function') {
    api.onClockAlarmsChanged((list) => {
      void setAlarms(list, { persist: false });
    });
  }
}
