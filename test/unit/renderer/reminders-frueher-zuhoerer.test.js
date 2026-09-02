// @vitest-environment jsdom
// 4T-000635 (Epic 3E-000161): Regressionstest des Nachhol-Dialogs bei früh
// gebundenem Bereich.
//
// Gemeldeter Ablauf: Bei der Sitzungs-Wiederherstellung mit gebundenem Bereich
// laeuft das Binden parallel zur Renderer-Initialisierung. Der Pruefer im
// Hauptprozess sendet `reminders:due` fire-and-forget; `ipcRenderer.on` puffert
// nicht. War der Zuhoerer noch nicht angemeldet — er stand tief in der
// asynchronen `init()` —, ging die Meldung ersatzlos verloren, ohne Fehler und
// ohne Spur, und der Anwender sah seine ueberfaelligen Erinnerungen nie.
//
// Der Test stellt genau dieses Rennen nach: Die Meldung trifft **vor**
// `initReminders()` ein. Er ist damit szenario-treu zum gemeldeten Ablauf und
// nicht zum bequemeren Minimal-Fall (Meldung nach der Initialisierung).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

document.body.insertAdjacentHTML(
  'beforeend',
  `<div id="reminders-modal" hidden>
     <div class="bookmark-modal-backdrop"></div>
     <h2 id="reminders-modal-title"></h2>
     <ul id="reminders-modal-list"></ul>
     <button id="btn-reminders-close"></button>
   </div>`,
);

// Der Import selbst ist bereits der Kern der Pruefung: Die Anmeldung steht am
// Modulkopf, der Handler existiert also nach dem Laden und vor jeder Init.
const reminders = await import('../../../src/renderer/modules/reminders.js');
const { editorActivity } = await import('../../../src/renderer/modules/app/app-state.js');

const faellig = (key) => ({
  items: [
    {
      key,
      instant: '2020-01-01T08:00',
      taskText: 'Probe',
      description: 'Probe',
      file: 'Aufgaben.md',
      line: 1,
    },
  ],
  catchUp: true,
});

describe('4T-000635: Erinnerungs-Meldung vor der Initialisierung', () => {
  beforeEach(() => {
    // Ohne Tipp-Aktivitaet zeigt scheduleShow sofort statt zu vertagen.
    editorActivity.lastDocEditAt = 0;
    document.getElementById('reminders-modal').hidden = true;
    document.getElementById('reminders-modal-list').innerHTML = '';
  });

  it('der Zuhoerer ist schon nach dem Laden des Moduls angemeldet', () => {
    // Genau hier lag der Fehler: Die Anmeldung geschah erst in initReminders().
    expect(typeof window.__remindersDueHandler).toBe('function');
  });

  it('eine vor der Initialisierung eintreffende Meldung geht nicht verloren', async () => {
    // Meldung VOR initReminders() — der gemeldete Ablauf.
    window.__remindersDueHandler(faellig('vor-init'));
    // Vor der Bindung darf nichts angezeigt werden; die Dialog-Elemente sind
    // zwar im DOM, aber das Modul haelt seine Referenzen noch nicht.
    expect(document.getElementById('reminders-modal').hidden).toBe(true);

    reminders.initReminders();
    await new Promise((r) => setTimeout(r, 0));

    // Nachgezogen: der gepufferte Eintrag ist jetzt sichtbar.
    expect(document.getElementById('reminders-modal').hidden).toBe(false);
    expect(document.getElementById('reminders-modal-list').children.length).toBe(1);
  });

  it('eine nach der Initialisierung eintreffende Meldung wirkt weiterhin sofort', async () => {
    window.__remindersDueHandler(faellig('nach-init'));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('reminders-modal').hidden).toBe(false);
  });
});
