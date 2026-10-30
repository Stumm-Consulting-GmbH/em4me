// 4T-002423 (Epic 3E-000366, Entscheidung 2f, Story 4S-001134): Die Meldungen
// eines Laufs — `notify` und das Ende eines nicht gelungenen Laufs — je
// Herkunft des Laufs.
//
// **Start von Hand:** allein der Hinweis in der Statusleiste wie in der ersten
// Ausbaustufe (`notify` vier Sekunden, der Abbruch-Hinweis sechs).
//
// **Lauf nach Zeitplan** (Herkunft `schedule` oder `catch-up`; ein nachgeholter
// Lauf ist ein Lauf nach Zeitplan): derselbe Hinweis und zusätzlich eine
// Benachrichtigung des Betriebssystems über den vorhandenen Kanal
// `notify:system` (Brücke `systemNotify`, src/main/ipc/reminders.js), für jedes
// `notify` und für jeden Fehlschlag (`failed`), Letzteres unabhängig davon, ob
// der Workflow ein `notify` enthält, mit dem Text des Abbruch-Hinweises aus A1.
// Ob sie erscheint, entscheidet der Kanal: nur, wenn kein Fenster der
// Anwendung den Fokus hat, und je Meldung einmal. Deshalb trägt jede Meldung
// die Art `workflow` und einen eigenen Schlüssel.
//
// Titel der Benachrichtigung ist der Name des gestarteten Workflows, Text der
// Inhalt von `notify` bzw. der Abbruch-Hinweis. Ein `stop` ist kein
// Fehlschlag und bleibt beim Hinweis.
//
// Eigener Zustand: der Zähler für die Schlüssel der Meldungen.
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { showStatusbarHint } from '../views/views.js';
import { istZeitplanLauf } from './workflow-lauf-stand.js';
import { abbruchText, einsetzen } from './workflow-lauf-texte.js';

// Anzeige-Dauer der Hinweise: `notify` wie ein gewöhnlicher Hinweis, der
// Abbruch länger, weil Name, Zeile und Grund zu lesen sind.
export const NOTIFY_MS = 4000;
export const ABBRUCH_MS = 6000;

let zaehler = 0;

// Fordert die Benachrichtigung des Betriebssystems an. Ein Fehler der Brücke
// geht in die Konsole; der Hinweis in der Statusleiste steht ohnehin.
function anBetriebssystem(titel, text) {
  if (typeof api.systemNotify !== 'function') return;
  zaehler += 1;
  const key = `workflow:${Date.now()}:${zaehler}`;
  const anfrage = {
    title: String(titel || ''),
    body: String(text || ''),
    meldung: { art: 'workflow', keys: [key] },
  };
  try {
    Promise.resolve(api.systemNotify(anfrage)).catch((err) => {
      console.warn('[Workflows] Benachrichtigung fehlgeschlagen:', err && err.message);
    });
  } catch (err) {
    console.warn('[Workflows] Benachrichtigung fehlgeschlagen:', err && err.message);
  }
}

/**
 * Meldet ein `notify` des Laufs.
 *
 * @param {string} text Inhalt von `notify`.
 * @param {{name: string, herkunft: string}} lauf Name des gestarteten Workflows und Herkunft.
 */
export function meldeNotify(text, { name, herkunft }) {
  const hinweis = einsetzen(t('workflow.lauf.hinweis'), { text });
  showStatusbarHint('workflow.lauf.hinweis', { text: hinweis, error: false, duration: NOTIFY_MS });
  if (istZeitplanLauf(herkunft)) anBetriebssystem(name, text);
}

/**
 * Meldet das Ende eines nicht gelungenen Laufs (`failed` oder `stopped`).
 *
 * @param {{status: string, workflow: string}} ergebnis Ergebnis wie im Ablauf-Kern.
 * @param {string} herkunft Herkunft des Laufs.
 */
export function meldeEnde(ergebnis, herkunft) {
  const stop = ergebnis.status === 'stopped';
  const key = stop ? 'workflow.lauf.beendet' : 'workflow.lauf.abgebrochen';
  const text = abbruchText(ergebnis);
  showStatusbarHint(key, { text, error: !stop, duration: ABBRUCH_MS });
  if (ergebnis.status === 'failed' && istZeitplanLauf(herkunft)) {
    anBetriebssystem(ergebnis.workflow, text);
  }
}
