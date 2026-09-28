// 4T-001867 (Epic 3E-000321): Termin-Zeilen des Aufgaben-Dialogs. Aus
// task-dialog.js herausgeschnitten, weil dessen Groessen-Ratsche kein
// Wachstum zulaesst und die drei Zeilen-Arten dasselbe Muster tragen: die
// manuellen Termine (faellig, geplant, Start), die Erinnerung und seit
// diesem Task das Erledigt-Datum — je Beschriftung, Wert-Anzeige,
// Waehlen-Knopf ueber den Datums-Kalender und Entfernen-Knopf. Dazu die
// Vorgabe-Regel des Erledigt-Datums beim Status-Wechsel im offenen Dialog
// und der Text der uebrigen, rein angezeigten Automatik-Daten.
'use strict';

import { t } from '../i18n.js';
import { showDateTimePicker } from './calendar/date-picker.js';
import { taskStatusType } from '../../shared/markdown/plugins.js';

// Automatisch gepflegte Termine. Das Erledigt-Datum erscheint hier nur,
// solange der gewaehlte Status NICHT vom Typ DONE ist (etwa ein bei
// abgeschalteter Automatik stehengebliebenes Datum); bei DONE traegt es
// seine eigene, waehlbare Zeile.
const AUTO_DATE_FIELDS = ['created', 'done', 'cancelled'];

// Anzeige-Text eines Termin-Werts ('—' fuer leer; ungueltige Werte
// erscheinen roh, damit der Nutzer sie im Dialog erkennt und korrigiert).
export function dateValueText(value) {
  if (!value) return '—';
  return value.time ? `${value.date} ${value.time}` : value.date;
}

// Eine Termin-Zeile. getValue liefert den aktuellen Wert des Entwurfs,
// setValue schreibt { date, time } bzw. null zurueck. alwaysTime schaltet
// die Uhrzeit im Kalender immer ein (Erinnerung); sonst nur, wenn der
// vorhandene Wert eine Uhrzeit traegt. field landet als data-field an der
// Zeile (Pruef- und Ablauf-Faelle finden sie darueber).
export function buildDateRow({ labelText, field, getValue, setValue, alwaysTime = false }) {
  const row = document.createElement('div');
  row.className = 'task-dialog-date-row';
  row.dataset.field = field;
  const label = document.createElement('span');
  label.className = 'task-dialog-date-label';
  label.textContent = labelText;
  row.appendChild(label);
  const value = document.createElement('span');
  value.className = 'task-dialog-date-value';
  row.appendChild(value);
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'btn task-dialog-date-btn';
  pick.textContent = t('taskDialog.pickDate');
  row.appendChild(pick);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn task-dialog-date-btn';
  clearBtn.textContent = t('taskDialog.clearDate');
  row.appendChild(clearBtn);
  const refresh = () => {
    value.textContent = dateValueText(getValue());
    clearBtn.hidden = !getValue();
  };
  pick.addEventListener('click', async () => {
    const current = getValue();
    const rect = pick.getBoundingClientRect();
    const picked = await showDateTimePicker({
      x: rect.left,
      y: rect.bottom + 4,
      date: current && !current.invalid ? current.date : undefined,
      time: current && current.time ? current.time : undefined,
      dateEnabled: true,
      timeEnabled: alwaysTime || !!(current && current.time),
    });
    if (!picked || !picked.date) return;
    setValue({ date: picked.date, time: picked.time || null });
    refresh();
  });
  clearBtn.addEventListener('click', () => {
    setValue(null);
    refresh();
  });
  refresh();
  return row;
}

// Vorgabe des Erledigt-Datums, wenn der Status im offenen Dialog von dem der
// Aufgaben-Zeile (fromChar) auf toChar wechselt — dieselbe Semantik wie die
// Automatik des Ketten-Umschalters (tasks.js), gemessen am Status der Zeile,
// nicht am zuvor gewaehlten Eintrag: 'today' (Wechsel auf DONE), 'clear'
// (Rueckweg aus DONE) oder 'keep' (gespeicherter Wert der Zeile; auch jeder
// Wechsel bei abgeschalteter Automatik).
export function doneDatePreset(fromChar, toChar, autoDone) {
  if (!autoDone) return 'keep';
  const fromType = taskStatusType(fromChar);
  const toType = taskStatusType(toChar);
  if (toType === 'DONE' && fromType !== 'DONE') return 'today';
  if (fromType === 'DONE' && toType !== 'DONE') return 'clear';
  return 'keep';
}

// Text der Anzeige-Zeile der Automatik-Daten fuer den gewaehlten Status
// ('' = nichts anzuzeigen, der Absatz entfaellt).
export function autoDatesText(draft, statusChar) {
  const doneHasRow = taskStatusType(statusChar) === 'DONE';
  return AUTO_DATE_FIELDS.filter((f) => draft[f] && !(f === 'done' && doneHasRow))
    .map((f) => `${t(`taskMarker.${f}`)}: ${dateValueText(draft[f])}`)
    .join(' · ');
}
