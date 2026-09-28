// @vitest-environment jsdom
// 4T-001727 (Epic 3E-000305): Die Fenster-Seite der Erinnerung in allen
// Fenstern — Herkunfts-Angabe, Räumen nach einer Bearbeitung in einem anderen
// Fenster, verweigerter Anspruch ohne Fehlermeldung, Rückgabe nach
// gescheitertem Schreiben und das Nachholen des offenen Stands.
//
// Der Hauptprozess ist über die gemeinsame Attrappe (api-stub.js) ersetzt;
// seine Antworten stellt der Test über window-Felder. Die Schreib-Kette selbst
// (toggleTaskFromQuery, writeTaskHitLine) ist durch einen Zähler ersetzt: Geprüft wird hier, OB
// geschrieben wird, nicht wie — das Wie deckt der Ablauf-Fall mit der
// Quelldatei (test/e2e/funktionen/erinnerungen-alle-fenster.spec.js).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const schreibvorgaenge = [];
const hinweise = [];
let schreibErgebnis = true;

vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => ({ 'reminders.dialog.origin': 'Herkunft: {name}' })[key] || key,
}));
vi.mock('../../../src/renderer/modules/task-query-actions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  toggleTaskFromQuery: async (hit) => {
    schreibvorgaenge.push(hit);
    return schreibErgebnis;
  },
  writeTaskHitLine: async (hit, neu) => {
    schreibvorgaenge.push({ ...hit, neu });
    return schreibErgebnis;
  },
}));
vi.mock('../../../src/renderer/modules/views/views.js', async (importOriginal) => ({
  ...(await importOriginal()),
  showStatusbarHint: (key, opts) => hinweise.push({ key, opts }),
}));
// Datei-Link: Geprüft wird, WO geöffnet wird (dieses Fenster oder ein anderes),
// nicht das Öffnen selbst.
const geoeffnet = [];
vi.mock('../../../src/renderer/modules/tabs/tabs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  activatePane: () => {},
  openInPane: async (pane, pfade) => {
    geoeffnet.push(...pfade);
    return pane;
  },
}));
vi.mock('../../../src/renderer/modules/views/anchor-navigation.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scrollToLineAfterOpen: (pane, zeile) => geoeffnet.push(`Zeile ${zeile}`),
}));

document.body.insertAdjacentHTML(
  'beforeend',
  `<div id="reminders-modal" hidden>
     <div class="bookmark-modal-backdrop"></div>
     <h2 id="reminders-modal-title"></h2>
     <ul id="reminders-modal-list"></ul>
     <button id="btn-reminders-close"></button>
   </div>`,
);

const eintrag = (key, extra = {}) => ({
  key,
  root: 'C:/Projekte',
  origin: 'Projekte',
  instant: '2020-01-01T08:00',
  date: '2020-01-01',
  time: '08:00',
  path: 'C:/Projekte/aufgaben.md',
  line: 1,
  taskText: `- [ ] ${key}`,
  description: key,
  ...extra,
});

// Vor dem Import: Ein anderes Fenster hat «alt» bereits bearbeitet, und der
// Hauptprozess liefert beim Nachholen noch den Stand von eben — die Räum-Meldung
// hat die Nachhol-Antwort überholt.
window.__remindersOffen = { catchUp: true, items: [eintrag('alt'), eintrag('nachgeholt')] };

const reminders = await import('../../../src/renderer/modules/reminders.js');
const { editorActivity } = await import('../../../src/renderer/modules/app/app-state.js');

const modal = () => document.getElementById('reminders-modal');
const zeilen = () => [...document.querySelectorAll('#reminders-modal-list li')];
const warte = () => new Promise((r) => setTimeout(r, 0));

describe('4T-001727: Erinnerung in allen Fenstern — Fenster-Seite', () => {
  beforeEach(() => {
    editorActivity.lastDocEditAt = 0;
    schreibvorgaenge.length = 0;
    hinweise.length = 0;
    schreibErgebnis = true;
    window.__remindersClaim = null;
  });

  it('holt beim Start den offenen Stand nach, ohne eine bereits geräumte Meldung', async () => {
    window.__remindersHandledHandler({ keys: ['alt'] });
    reminders.initReminders();
    await warte();
    await warte();
    expect(modal().hidden).toBe(false);
    expect(zeilen().map((li) => li.querySelector('.reminders-item-desc').textContent)).toEqual([
      'nachgeholt',
    ]);
    // Die Nachhol-Kennung trägt die Überschrift «Verpasste Erinnerungen».
    expect(document.getElementById('reminders-modal-title').textContent).toBe(
      'reminders.dialog.catchUpTitle',
    );
  });

  it('nennt die Herkunft jedes Eintrags', async () => {
    window.__remindersDueHandler({ items: [eintrag('zweite', { origin: 'Privat' })] });
    await warte();
    await warte();
    const texte = zeilen().map((li) => li.querySelector('.reminders-item-origin').textContent);
    expect(texte.sort()).toEqual(['Herkunft: Privat', 'Herkunft: Projekte']);
  });

  it('räumt einen Eintrag, den ein anderes Fenster bearbeitet hat, und schließt den Dialog mit dem letzten', () => {
    window.__remindersHandledHandler({ keys: ['zweite'] });
    expect(zeilen()).toHaveLength(1);
    expect(modal().hidden).toBe(false);
    window.__remindersHandledHandler({ keys: ['nachgeholt'] });
    expect(modal().hidden).toBe(true);
  });

  it('verweigerter Anspruch: kein Schreiben, keine Fehlermeldung, der Eintrag verschwindet', async () => {
    window.__remindersClaim = () => ({ granted: false });
    window.__remindersDueHandler({ items: [eintrag('umkaempft')] });
    await warte();
    await warte();
    expect(modal().hidden).toBe(false);
    zeilen()[0].querySelector('button').click();
    await warte();
    await warte();
    expect(schreibvorgaenge).toHaveLength(0);
    expect(hinweise).toHaveLength(0);
    expect(modal().hidden).toBe(true);
  });

  it('gewährter Anspruch: genau ein Schreibvorgang mit der Herkunfts-Datei', async () => {
    const ansprueche = [];
    window.__remindersClaim = (entry) => {
      ansprueche.push(entry);
      return { granted: true };
    };
    window.__remindersDueHandler({ items: [eintrag('meins')] });
    await warte();
    await warte();
    zeilen()[0].querySelector('button').click();
    await warte();
    await warte();
    expect(ansprueche).toEqual([{ root: 'C:/Projekte', key: 'meins' }]);
    expect(schreibvorgaenge).toEqual([
      { path: 'C:/Projekte/aufgaben.md', line: 1, taskText: '- [ ] meins' },
    ]);
    expect(modal().hidden).toBe(true);
  });

  it('gescheitertes Schreiben gibt den Anspruch zurück und räumt den Eintrag nicht selbst', async () => {
    const rueckgaben = [];
    const bisher = window.api.remindersRelease;
    window.api.remindersRelease = async (entry) => {
      rueckgaben.push(entry);
      return { released: true };
    };
    try {
      schreibErgebnis = false;
      window.__remindersDueHandler({ items: [eintrag('konflikt')] });
      await warte();
      await warte();
      zeilen()[0].querySelector('button').click();
      await warte();
      await warte();
      expect(rueckgaben).toEqual([{ root: 'C:/Projekte', key: 'konflikt' }]);
      // Die erneute Zustellung des Hauptprozesses hält den Eintrag; das Fenster
      // entfernt ihn nicht auf eigene Faust.
      expect(zeilen()).toHaveLength(1);
    } finally {
      window.api.remindersRelease = bisher;
      window.__remindersHandledHandler({ keys: ['konflikt'] });
    }
  });

  it('eine erneute Zustellung hebt den Räum-Vermerk auf', async () => {
    window.__remindersHandledHandler({ keys: ['wieder'] });
    window.__remindersDueHandler({ items: [eintrag('wieder')] });
    await warte();
    await warte();
    expect(zeilen()).toHaveLength(1);
    window.__remindersHandledHandler({ keys: ['wieder'] });
    expect(modal().hidden).toBe(true);
  });
});

describe('4T-001727: Datei-Link öffnet im Fenster des Herkunfts-Bereichs', () => {
  beforeEach(() => {
    geoeffnet.length = 0;
    hinweise.length = 0;
    window.__remindersOpenSource = null;
  });

  async function klickeLink(key) {
    window.__remindersDueHandler({ items: [eintrag(key, { line: 7 })] });
    await warte();
    await warte();
    zeilen()
      .find((li) => li.querySelector('.reminders-item-desc').textContent === key)
      .querySelector('.reminders-item-file')
      .click();
    await warte();
    await warte();
    window.__remindersHandledHandler({ keys: [key] });
  }

  it('fremdes Fenster: fragt mit Herkunft an und öffnet selbst nichts', async () => {
    const anfragen = [];
    window.__remindersOpenSource = (ziel) => {
      anfragen.push(ziel);
      return { ok: true, hier: false };
    };
    await klickeLink('fremd');
    expect(anfragen).toEqual([{ root: 'C:/Projekte', path: 'C:/Projekte/aufgaben.md', line: 7 }]);
    expect(geoeffnet).toEqual([]);
    expect(hinweise).toEqual([]);
  });

  it('Fenster des Herkunfts-Bereichs: öffnet wie bisher selbst an der Zeile', async () => {
    window.__remindersOpenSource = () => ({ ok: true, hier: true });
    await klickeLink('eigen');
    expect(geoeffnet).toEqual(['C:/Projekte/aufgaben.md', 'Zeile 7']);
  });

  it('Auftrag an ein eben geöffnetes Fenster wartet das Ende der Initialisierung ab', async () => {
    window.__remindersOpenSourceHandler({ path: 'C:/Projekte/aufgaben.md', line: 3 });
    await warte();
    expect(geoeffnet).toEqual([]);
    await reminders.oeffneWartendeQuellen();
    expect(geoeffnet).toEqual(['C:/Projekte/aufgaben.md', 'Zeile 3']);
    // Danach öffnet ein Auftrag sofort.
    window.__remindersOpenSourceHandler({ path: 'C:/Projekte/b.md', line: 1 });
    await warte();
    expect(geoeffnet.slice(2)).toEqual(['C:/Projekte/b.md', 'Zeile 1']);
  });
});

// Befund der Abnahme vom 2026-09-24: Stammt die Erinnerung aus dem
// ungespeicherten Editor eines anderen Fensters, schreibt DIESES Fenster nicht
// auf die Platte, sondern der Hauptprozess übergibt den Auftrag an jenes Fenster.
describe('4T-001727: Bearbeitung im Fenster mit dem ungespeicherten Stand', () => {
  beforeEach(() => {
    editorActivity.lastDocEditAt = 0;
    schreibvorgaenge.length = 0;
    hinweise.length = 0;
    schreibErgebnis = true;
    window.__remindersClaim = null;
    window.__remindersEdit = null;
  });

  it('übernimmt ein anderes Fenster, schreibt dieses nichts und räumt den Eintrag', async () => {
    const auftraege = [];
    window.__remindersEdit = (auftrag) => {
      auftraege.push(auftrag);
      return { delegiert: true };
    };
    window.__remindersDueHandler({ items: [eintrag('puffer', { line: 19 })] });
    await warte();
    await warte();
    zeilen()
      .find((li) => li.querySelector('.reminders-item-desc').textContent === 'puffer')
      .querySelector('button')
      .click();
    await warte();
    await warte();
    expect(auftraege).toEqual([
      {
        item: {
          key: 'puffer',
          root: 'C:/Projekte',
          path: 'C:/Projekte/aufgaben.md',
          line: 19,
          taskText: '- [ ] puffer',
        },
        bearbeitung: { art: 'erledigt' },
      },
    ]);
    expect(schreibvorgaenge).toEqual([]);
    expect(hinweise).toEqual([]);
    expect(modal().hidden).toBe(true);
  });

  it('ohne fremden Stand schreibt dieses Fenster wie bisher selbst', async () => {
    window.__remindersEdit = () => ({ delegiert: false });
    window.__remindersDueHandler({ items: [eintrag('selbst')] });
    await warte();
    await warte();
    zeilen()
      .find((li) => li.querySelector('.reminders-item-desc').textContent === 'selbst')
      .querySelector('button')
      .click();
    await warte();
    await warte();
    expect(schreibvorgaenge).toEqual([
      { path: 'C:/Projekte/aufgaben.md', line: 1, taskText: '- [ ] selbst' },
    ]);
  });

  it('Auftrag «Erledigt» aus dem Hauptprozess: schreibt hier ohne erneuten Anspruch', async () => {
    const ansprueche = [];
    window.__remindersClaim = (entry) => {
      ansprueche.push(entry);
      return { granted: true };
    };
    window.__remindersEditHandler({
      item: eintrag('auftrag', { line: 4 }),
      bearbeitung: { art: 'erledigt' },
    });
    await warte();
    await warte();
    expect(ansprueche).toEqual([]);
    expect(schreibvorgaenge).toEqual([
      { path: 'C:/Projekte/aufgaben.md', line: 4, taskText: '- [ ] auftrag' },
    ]);
  });

  it('Auftrag «Später erinnern»: setzt den neuen Zeitpunkt in die Zeile', async () => {
    window.__remindersEditHandler({
      item: eintrag('spaeter', { taskText: '- [ ] spaeter ⏰ 2020-01-01 08:00' }),
      bearbeitung: { art: 'aufschub', wert: { date: '2020-01-02', time: '09:30' } },
    });
    await warte();
    await warte();
    expect(schreibvorgaenge).toHaveLength(1);
    expect(schreibvorgaenge[0].neu).toBe('- [ ] spaeter ⏰ 2020-01-02 09:30');
  });

  it('scheitert der Auftrag, geht der Anspruch zurück; ein unbekannter Auftrag bleibt ohne Wirkung', async () => {
    const rueckgaben = [];
    const bisher = window.api.remindersRelease;
    window.api.remindersRelease = async (entry) => {
      rueckgaben.push(entry);
      return { released: true };
    };
    try {
      schreibErgebnis = false;
      window.__remindersEditHandler({ item: eintrag('klemmt'), bearbeitung: { art: 'erledigt' } });
      await warte();
      await warte();
      expect(rueckgaben).toEqual([{ root: 'C:/Projekte', key: 'klemmt' }]);
      rueckgaben.length = 0;
      schreibvorgaenge.length = 0;
      window.__remindersEditHandler({ item: eintrag('x'), bearbeitung: { art: 'loeschen' } });
      window.__remindersEditHandler(null);
      await warte();
      await warte();
      expect(schreibvorgaenge).toEqual([]);
    } finally {
      window.api.remindersRelease = bisher;
    }
  });
});
