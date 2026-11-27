// @vitest-environment jsdom
// 4T-002863 (Epic 3E-000449): Eine Erinnerung ohne eigene Beschreibung zeigt in
// Erinnerungs-Dialog, System-Benachrichtigung und Seitenleiste «Erinnerungen»
// die Zeile ohne privaten Kommentar, nie die rohe. Der Weg ist der echte bis
// zur Oberfläche: Einlesen über `parseContent` des Index, Sammeln über
// `collectReminders`, Zeichnen über das Dialog-Modul und `renderRemindersPanel`.
// Der Hauptprozess ist über die gemeinsame Attrappe (api-stub.js) ersetzt.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import './api-stub.js';

const require_ = createRequire(import.meta.url);
const { parseContent } = require_('../../../src/main/index/parse.js');
const { collectReminders } = require_('../../../src/shared/reminders.js');

const GEHEIM = 'GEHEIMVERMERK';
const QUELLE = 'C:/Bereich/Aufgaben.md';

// Seitenleiste in Fenster 0, bevor das Modul lädt: getPaneEls merkt sich die
// Elemente beim ersten Zugriff.
const pane0 = document.querySelector('.pane-group[data-pane="0"]');
pane0.innerHTML = `
  <section class="sidebar-section sidebar-reminders">
    <div class="reminders-status" hidden></div>
    <div class="reminders-groups"></div>
  </section>
`;
document.body.insertAdjacentHTML(
  'beforeend',
  `<div id="reminders-modal" hidden>
     <div class="bookmark-modal-backdrop"></div>
     <h2 id="reminders-modal-title"></h2>
     <ul id="reminders-modal-list"></ul>
     <button id="btn-reminders-close"></button>
   </div>`,
);

const benachrichtigungen = [];
window.api.getSetting = async (key) =>
  key === 'remindersConfig' ? { systemNotification: true } : undefined;
window.api.remindersSystemNotify = async (nachricht) => {
  benachrichtigungen.push(nachricht);
  return true;
};

const reminders = await import('../../../src/renderer/modules/reminders.js');
const { renderRemindersPanel } = await import('../../../src/renderer/modules/reminders-panel.js');
const { editorActivity, state } = await import('../../../src/renderer/modules/app/app-state.js');

const warte = () => new Promise((r) => setTimeout(r, 0));

// Die Erinnerung, wie der Hauptprozess sie aus dem Index sammelt.
function erinnerung() {
  const parsed = parseContent(
    QUELLE,
    `# Aufgaben\n\n- [ ] ⏰ 2020-01-01 08:00 %%${GEHEIM}: Nummer 0123%%\n`,
  );
  const zeilen = parsed.tasks.map((tl) => ({ path: QUELLE, ...tl }));
  const env = { globalFilter: '', statusTypeOf: () => 'TODO', defaultTime: '09:00' };
  const [item] = collectReminders(zeilen, env);
  return { ...item, root: 'C:/Bereich', origin: 'Bereich' };
}

describe('Erinnerung ohne Beschreibung mit privatem Kommentar (4T-002863)', () => {
  let item;

  beforeAll(() => {
    item = erinnerung();
    // Vorbedingung: Die rohe Zeile trägt den Kommentar, die Beschreibung ist leer.
    expect(item.taskText).toContain(GEHEIM);
    expect(item.description).toBe('');
  });

  it('Dialog und System-Benachrichtigung zeigen den Kommentar nicht', async () => {
    editorActivity.lastDocEditAt = 0;
    const fokus = document.hasFocus;
    document.hasFocus = () => false;
    try {
      reminders.initReminders();
      window.__remindersDueHandler({ items: [item] });
      await warte();
      await warte();
      const texte = [...document.querySelectorAll('#reminders-modal-list .reminders-item-desc')];
      expect(texte).toHaveLength(1);
      expect(texte[0].textContent).toContain('2020-01-01');
      expect(texte[0].textContent).not.toContain(GEHEIM);
      expect(benachrichtigungen).toHaveLength(1);
      expect(benachrichtigungen[0].body).not.toContain(GEHEIM);
    } finally {
      document.hasFocus = fokus;
    }
  });

  it('die Seitenleiste «Erinnerungen» zeigt den Kommentar nicht', async () => {
    state.areaPath = 'C:/Bereich';
    window.api.remindersList = async () => ({
      ready: true,
      nowLocal: '2020-01-02T09:00',
      items: [item],
    });
    await renderRemindersPanel(0);
    const texte = [...pane0.querySelectorAll('.reminders-groups .reminders-item-desc')];
    expect(texte).toHaveLength(1);
    expect(texte[0].textContent).toContain('2020-01-01');
    expect(texte[0].textContent).not.toContain(GEHEIM);
  });
});
