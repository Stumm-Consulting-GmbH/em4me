// @vitest-environment jsdom
// 4T-001850 (Epic 3E-000110): Prüffälle des Verschiebens per Maus — Karten
// innerhalb und zwischen Spalten, Spalten untereinander, Einfüge-Marke,
// Abbruch, Rand-Rollen und das Abhaken beim Hineinziehen.
//
// **Gemessen wird an der Einbettung, nicht am Zieh-Modul allein.** Die Zusagen
// dieses Vorgangs — die Wirkung im Dokument-Text (AK1 bis AK3, AK9, AK10), ein
// einziger Rückgängig-Schritt bei Zug plus Abhaken (AK8) und der Statuswechsel
// über die Kette der Anwendung (AK7) — hängen am Zusammenspiel aus Zug,
// Schreibweg und Format-Kern. Der Editor der Spalte ist dieselbe Attrappe wie
// in `kanban-bedienung.test.js`: Sie wendet den Zeilen-Bereich wirklich an,
// damit der geschriebene Text messbar und die **Zahl** der Anwendungen die Zahl
// der Transaktionen ist.
//
// **Die Status-Kette läuft ECHT.** `statusAufText` ist im Programm wie hier die
// Funktion aus `task-states.js`; eine Attrappe könnte die Zusage nicht tragen,
// dass eine auf der Tafel hineingezogene Aufgabe genauso behandelt wird wie
// eine im Text angeklickte.
//
// **jsdom rechnet kein Layout**, alle Rechtecke wären null. Die Prüffälle legen
// deshalb eine künstliche, aber vollständig bestimmte Geometrie über den
// gezeichneten Baum: vier Spalten zu 300 Pixeln Breite, Karten zu 60 Pixeln
// Höhe. Die Rechnung selbst ist eigens geprüft (`test/unit/zieh-geometrie.test.js`);
// hier wird gemessen, was die Tafel daraus macht.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { KARTE_KLASSE, SPALTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';
import {
  MARKE_KLASSE,
  QUELLE_KLASSE,
  ZIEHT_KLASSE,
  spaltenNummerNachZug,
} from '../../../src/renderer/modules/kanban/kanban-ziehen.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
// Die echte Status-Kette samt Augmenter der Erweiterung «Aufgaben», gestellt
// wie im Programm (Muster des Pflichtfalls in kanban-bedienung.test.js).
await import('./api-stub.js');
const tasks = await import('../../../src/renderer/modules/tasks.js');
const taskStates = await import('../../../src/renderer/modules/task-states.js');
const { buildRecurrenceInstance } = await import('../../../src/shared/tasks/task-recurrence.js');
tasks.applyTasksConfig(null);
taskStates.applyTaskStates(taskStates.resolveStoredTaskStates(null));
taskStates.setStatusToggleAugmenter(tasks.taskToggleAugmenter);
// Wie `initTasks()` im Programm: Ohne den Wiederholungs-Builder entstünde
// keine Folge-Instanz, und der Fall unten prüfte gegen eine halbe Kette.
tasks.setRecurrenceInstanceBuilder((model) =>
  buildRecurrenceInstance(model, { completionDate: tasks.todayIsoDate(), autoCreated: false }),
);

const KOPF = '---\nkanban-plugin: board\n---\n';

// Spalte 0 «Offen» (2 Karten, die erste mit Folgezeile), Spalte 1 «Laeuft»
// (1 Karte), Spalte 2 «Fertig» (hakt ab, 1 abgehakte Karte), Spalte 3 «Leer».
const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte',
  '\tEine eingerückte Folgezeile',
  '- [ ] Zweite Karte 📅 2099-01-01',
  '',
  '## Laeuft',
  '',
  '- [ ] Dritte Karte',
  '',
  '## Fertig',
  '',
  '**Complete**',
  '- [x] Vierte Karte',
  '',
  '## Leer',
  '',
  '',
].join('\n');

const SPALTEN_BREITE = 300;
const KARTEN_HOEHE = 60;

function baueSpalte(text, optionen = {}) {
  const tab = { content: text, viewMode: 'kanban', path: 'C:/Notizen/Tafel.md', editMode: true };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [] };
  // Die Historie der Spalte als Attrappe, wie in `kanban-bedienung.test.js`:
  // ein Stapel voller Dokument-Stände. Damit ist der Text nach einem
  // Rückgängig-Schritt byte-genau messbar (4T-001896, AK3).
  const zurueck = [];
  initKanbanPane({
    rueckgaengig: () => {
      if (zurueck.length === 0) return false;
      tab.content = zurueck.pop();
      renderKanban(0);
      legeAus(container);
      return true;
    },
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => tab,
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_paneIdx, { vonZeile, bisZeile, text: neu }) => {
      protokoll.schreibvorgaenge.push({ vonZeile, bisZeile, text: neu });
      zurueck.push(tab.content);
      const zeilen = tab.content.split('\n');
      tab.content = [
        ...zeilen.slice(0, vonZeile - 1),
        ...neu.split('\n'),
        ...zeilen.slice(bisZeile),
      ].join('\n');
      return true;
    },
    // Der Weg des Kästchen-Klicks: dieselbe Kette, aber als eigener
    // Schreibvorgang — so ist er im Programm verdrahtet (4T-001849).
    statusUmschalten: (_paneIdx, zeilenNummer) => {
      const ergebnis = taskStates.statusToggleAufText(tab.content, zeilenNummer);
      if (!ergebnis) return false;
      tab.content = ergebnis.text;
      return true;
    },
    statusAufText: (inhalt, zeilenNummer) => taskStates.statusToggleAufText(inhalt, zeilenNummer),
    zeigeKontextmenue: () => {},
    schliesseKontextmenue: () => {},
  });
  renderKanban(0);
  legeAus(container);
  return { tab, container, protokoll };
}

function setzeRechteck(el, left, top, width, height) {
  el.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  });
}

/** Legt die künstliche Geometrie über den gezeichneten Baum. */
function legeAus(container) {
  const streifen = container.querySelector('.kanban-spalten');
  const spalten = [...container.querySelectorAll(`.${SPALTE_KLASSE}`)];
  if (streifen) setzeRechteck(streifen, 0, 0, SPALTEN_BREITE * spalten.length, 400);
  spalten.forEach((spalte, i) => {
    const links = i * SPALTEN_BREITE;
    setzeRechteck(spalte, links, 0, SPALTEN_BREITE, 400);
    const liste = spalte.querySelector('.kanban-spalte-karten');
    if (liste) setzeRechteck(liste, links + 10, 40, SPALTEN_BREITE - 20, 360);
    [...spalte.querySelectorAll(`.${KARTE_KLASSE}`)].forEach((karte, j) => {
      setzeRechteck(karte, links + 10, 40 + j * KARTEN_HOEHE, SPALTEN_BREITE - 20, KARTEN_HOEHE);
    });
  });
}

function karteIn(container, spalte, nr) {
  return container.querySelector(
    `.${SPALTE_KLASSE}[data-spalte="${spalte}"] .${KARTE_KLASSE}[data-karte="${nr}"]`,
  );
}

function kopfVon(container, spalte) {
  return container.querySelector(`.${SPALTE_KLASSE}[data-spalte="${spalte}"] .kanban-spalte-kopf`);
}

/** Punkt über der Lücke VOR der Karte `nr` der Spalte `spalte`. */
function vorKarte(spalte, nr) {
  return { x: spalte * SPALTEN_BREITE + 150, y: 40 + nr * KARTEN_HOEHE + 5 };
}

/** Punkt unter der letzten Karte einer Spalte — «ganz ans Ende». */
function ansEnde(spalte) {
  return { x: spalte * SPALTEN_BREITE + 150, y: 390 };
}

function maus(art, el, punkt, zusatz = {}) {
  const ziel = el || window;
  ziel.dispatchEvent(
    new window.MouseEvent(art, {
      bubbles: true,
      clientX: punkt.x,
      clientY: punkt.y,
      button: 0,
      ...zusatz,
    }),
  );
}

function tasteMit(el, key, zusatz) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...zusatz }));
}

/**
 * Ein vollständiger Zug: drücken, weit genug bewegen, loslassen.
 *
 * Die Bewegung läuft in zwei Schritten, damit der erste die Schwelle
 * überschreitet und der zweite auf dem Ziel steht.
 */
function ziehe(el, nach, optionen = {}) {
  const start = { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  start.x = r.left + r.width / 2;
  start.y = r.top + r.height / 2;
  maus('mousedown', el, start);
  maus('mousemove', window, { x: start.x + 20, y: start.y + 20 });
  maus('mousemove', window, nach);
  if (optionen.abbrechen) {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return;
  }
  maus('mouseup', window, nach);
}

function textZeilen(tab) {
  return tab.content.split('\n');
}

/** Der Text-Block einer Spalte, von ihrer Überschrift bis zur nächsten. */
function spaltenBlock(tab, titel) {
  const ohneCr = tab.content.replace(/\r/g, '');
  return (ohneCr.split(`## ${titel}`)[1] || '').split('\n## ')[0];
}

/** Die Karten-Zeilen einer Spalte in ihrer Reihenfolge im Dokument. */
function kartenZeilen(tab, titel) {
  return spaltenBlock(tab, titel)
    .split('\n')
    .filter((z) => z.startsWith('- ['));
}

function kartenTexte(container, spalte) {
  return [
    ...container.querySelectorAll(
      `.${SPALTE_KLASSE}[data-spalte="${spalte}"] .${KARTE_KLASSE} .kanban-karte-inhalt`,
    ),
  ].map((el) => el.textContent.trim());
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// --- Karten ziehen ----------------------------------------------------------------

describe('Karte innerhalb ihrer Spalte ziehen (AK1)', () => {
  it('AK1: die zweite Karte wandert vor die erste', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 1), vorKarte(0, 0));
    expect(protokoll.schreibvorgaenge, 'ein Zug, eine Transaktion').toHaveLength(1);
    const zeilen = textZeilen(tab).filter((z) => z.startsWith('- ['));
    expect(zeilen[0]).toContain('Zweite Karte');
    expect(zeilen[1]).toBe('- [ ] Erste Karte');
    expect(kartenTexte(container, 0)[0]).toContain('Zweite Karte');
  });

  it('AK9: die eingerueckten Folgezeilen wandern mit', () => {
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 0), ansEnde(1));
    expect(tab.content).toContain('## Laeuft\n\n- [ ] Dritte Karte\n- [ ] Erste Karte\n\tEine');
    expect(tab.content).not.toContain('## Offen\n\n- [ ] Erste Karte');
  });

  it('Ziel gleich Ausgang erzeugt keinen Schreibvorgang', () => {
    // Beide Nachbar-Stellen der eigenen Karte meinen ihren eigenen Platz; ein
    // Schreibvorgang dort wäre ein Rückgängig-Schritt ohne Wirkung.
    for (const punkt of [vorKarte(0, 0), vorKarte(0, 1)]) {
      document.body.innerHTML = '';
      const { container, tab, protokoll } = baueSpalte(TAFEL);
      const vorher = tab.content;
      ziehe(karteIn(container, 0, 0), punkt);
      expect(protokoll.schreibvorgaenge).toHaveLength(0);
      expect(tab.content).toBe(vorher);
    }
  });
});

describe('Karte in eine andere Spalte ziehen (AK2, AK10)', () => {
  it('AK2: sie landet an der gewaehlten Position', () => {
    const { container, tab } = baueSpalte(TAFEL);
    // Spalte 1 hat eine Karte; vor sie gezogen heisst Position 0.
    ziehe(karteIn(container, 0, 1), vorKarte(1, 0));
    expect(tab.content).toContain('## Laeuft\n\n- [ ] Zweite Karte 📅 2099-01-01\n- [ ] Dritte');
  });

  it('AK10: die leere Spalte nimmt eine Karte auf', () => {
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 0), ansEnde(3));
    expect(tab.content).toContain('## Leer\n\n- [ ] Erste Karte\n');
    expect(kartenTexte(container, 3)[0]).toContain('Erste Karte');
  });

  it('4T-001905 AK5: eine volle Spalte nimmt die Karte trotzdem auf — Hinweis, keine Sperre', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL.replace('## Laeuft', '## Laeuft (1)'));
    ziehe(karteIn(container, 0, 1), ansEnde(1));
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).toContain('## Laeuft (1)\n\n- [ ] Dritte Karte\n- [ ] Zweite Karte');
    const spalte = container.querySelector(`.${SPALTE_KLASSE}[data-spalte="1"]`);
    expect(spalte.querySelector('.kanban-spalte-zaehler').textContent).toBe('2/1');
    expect(spalte.classList.contains('kanban-spalte-ueberschritten')).toBe(true);
  });

  it('AK10: die Spalte, die danach leer ist, bleibt eine gueltige Spalte', () => {
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 1, 0), ansEnde(0));
    legeAus(container);
    expect(tab.content).toContain('## Laeuft');
    expect(kartenTexte(container, 1)).toHaveLength(0);
    // Und aus ihr heraus lässt sich nichts mehr ziehen, ohne dass etwas bricht.
    expect(container.querySelector(`.${SPALTE_KLASSE}[data-spalte="1"]`)).not.toBeNull();
  });

  it('die verschobene Karte ist danach gewaehlt', () => {
    // Die Wiederherstellung nach der Zeichnung findet eine Karte über ihre
    // Zeilen-Nummer wieder; nach einem Zug ist das eine andere Karte.
    const { container } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 1), vorKarte(1, 0));
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    expect(gewaehlt).not.toBeNull();
    expect(gewaehlt.textContent).toContain('Zweite Karte');
    expect(gewaehlt.dataset.spalte).toBe('1');
  });
});

// --- Spalten ziehen ---------------------------------------------------------------

describe('Spalte ziehen (AK3)', () => {
  it('AK3: die Spalte wandert samt ihren Karten', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    // Spalte 1 an den Anfang: Punkt links der Mitte der ersten Spalte.
    ziehe(kopfVon(container, 1), { x: 20, y: 200 });
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    const titel = textZeilen(tab).filter((z) => z.startsWith('## '));
    expect(titel).toEqual(['## Laeuft', '## Offen', '## Fertig', '## Leer']);
    expect(tab.content).toContain('## Laeuft\n\n- [ ] Dritte Karte');
  });

  it('AK3: der Karten-Zaehler der gezogenen Spalte stimmt danach', () => {
    const { container } = baueSpalte(TAFEL);
    ziehe(kopfVon(container, 1), { x: 20, y: 200 });
    const zaehler = [...container.querySelectorAll('.kanban-spalte-zaehler')].map(
      (el) => el.textContent,
    );
    expect(zaehler).toEqual(['1', '2', '1', '0']);
  });

  it('die Spalte an ihren eigenen Platz gezogen schreibt nichts', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    ziehe(kopfVon(container, 1), { x: SPALTEN_BREITE + 20, y: 200 });
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('eine gewaehlte Karte bleibt nach dem Spalten-Zug dieselbe Karte', () => {
    const { container } = baueSpalte(TAFEL);
    karteIn(container, 1, 0).dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    ziehe(kopfVon(container, 1), { x: 20, y: 200 });
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    expect(gewaehlt.textContent).toContain('Dritte Karte');
    expect(gewaehlt.dataset.spalte).toBe('0');
  });

  it('die Umrechnung der Spalten-Nummer deckt beide Richtungen', () => {
    // Nach vorn gezogen: alles dazwischen rückt eine Stelle nach hinten.
    expect(spaltenNummerNachZug(3, 3, 0)).toBe(0);
    expect(spaltenNummerNachZug(0, 3, 0)).toBe(1);
    expect(spaltenNummerNachZug(4, 3, 0)).toBe(4);
    // Nach hinten gezogen: alles dazwischen rückt eine Stelle nach vorn.
    expect(spaltenNummerNachZug(0, 0, 2)).toBe(2);
    expect(spaltenNummerNachZug(2, 0, 2)).toBe(1);
    expect(spaltenNummerNachZug(3, 0, 2)).toBe(3);
  });
});

// --- Einfüge-Marke, Abbruch, Schwelle --------------------------------------------

describe('Einfuege-Marke und Abbruch (AK4, AK5)', () => {
  it('AK4: waehrend des Zuges steht eine Marke, danach nicht mehr', () => {
    const { container } = baueSpalte(TAFEL);
    const karte = karteIn(container, 0, 1);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 10, y: r.top + 10 });
    maus('mousemove', window, { x: r.left + 40, y: r.top + 40 });
    maus('mousemove', window, vorKarte(1, 0));
    const marke = container.querySelector(`.${MARKE_KLASSE}`);
    expect(marke, 'die Marke zeigt die Ziel-Position').not.toBeNull();
    expect(marke.getAttribute('aria-hidden')).toBe('true');
    // Sie liegt an der Oberkante der Karte, vor die abgelegt würde.
    expect(marke.style.left).toBe(`${SPALTEN_BREITE + 10}px`);
    expect(container.classList.contains(ZIEHT_KLASSE)).toBe(true);
    expect(karte.classList.contains(QUELLE_KLASSE)).toBe(true);
    maus('mouseup', window, vorKarte(1, 0));
    expect(container.querySelector(`.${MARKE_KLASSE}`)).toBeNull();
    expect(container.classList.contains(ZIEHT_KLASSE)).toBe(false);
  });

  it('AK5: Escape bricht ab, das Dokument bleibt unveraendert', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    ziehe(karteIn(container, 0, 1), vorKarte(1, 0), { abbrechen: true });
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
    expect(container.querySelector(`.${MARKE_KLASSE}`)).toBeNull();
    // Und der nachfolgende Loslass-Griff schreibt auch nichts mehr.
    maus('mouseup', window, vorKarte(1, 0));
    expect(tab.content).toBe(vorher);
  });

  it('AK5: Loslassen ausserhalb jeder Spalte laesst alles stehen', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    ziehe(karteIn(container, 0, 1), { x: 5000, y: 200 });
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('AK5: der Verlust des Fensters bricht den Zug ab', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    const karte = karteIn(container, 0, 1);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 10, y: r.top + 10 });
    maus('mousemove', window, vorKarte(1, 0));
    window.dispatchEvent(new window.Event('blur'));
    maus('mouseup', window, vorKarte(1, 0));
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });
});

describe('Ein Klick ohne Bewegung bleibt ein Klick', () => {
  it('der Klick auf das Kaestchen schaltet weiterhin den Status', () => {
    const { container, tab } = baueSpalte(TAFEL);
    const karte = karteIn(container, 0, 0);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 5, y: r.top + 5 });
    maus('mouseup', window, { x: r.left + 5, y: r.top + 5 });
    karte
      .querySelector('.kanban-karte-kasten')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(tab.content).toContain('- [x] Erste Karte');
  });

  it('eine Bewegung unterhalb der Schwelle bleibt ein Klick', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    const vorher = tab.content;
    const karte = karteIn(container, 0, 1);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 5, y: r.top + 5 });
    maus('mousemove', window, { x: r.left + 6, y: r.top + 6 });
    expect(container.querySelector(`.${MARKE_KLASSE}`), 'kein Zug begonnen').toBeNull();
    maus('mouseup', window, { x: r.left + 6, y: r.top + 6 });
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('nach einem echten Zug wird der folgende Klick geschluckt', () => {
    // Sonst schaltete ein Zug, der auf einem Kästchen endet, zusätzlich den
    // Status der Karte, über der losgelassen wurde.
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 1), vorKarte(1, 0));
    const stand = tab.content;
    legeAus(container);
    karteIn(container, 1, 0)
      .querySelector('.kanban-karte-kasten')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(tab.content).toBe(stand);
  });
});

// --- Abhaken beim Hineinziehen ---------------------------------------------------

describe('Abhaken beim Hineinziehen (AK6 bis AK8)', () => {
  it('AK6/AK8: die Karte ist danach abgehakt — in EINER Transaktion', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 0), ansEnde(2));
    expect(protokoll.schreibvorgaenge, 'Verschieben und Abhaken: ein Schritt').toHaveLength(1);
    const zeile = textZeilen(tab).find((z) => z.includes('Erste Karte'));
    expect(zeile.startsWith('- [x] ')).toBe(true);
    // Sie steht in der Erledigt-Spalte und hat ihre Folgezeile behalten.
    expect(tab.content).toMatch(
      /\*\*Complete\*\*\n- \[x\] Vierte Karte\n- \[x\] Erste Karte[^\n]*\n\tEine eingerückte Folgezeile/,
    );
  });

  it('AK7: die Kette setzt das Automatik-Datum, wie beim Klick im Text', () => {
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 0, 0), ansEnde(2));
    const heute = tasks.todayIsoDate();
    expect(textZeilen(tab).find((z) => z.includes('Erste Karte'))).toContain(`✅ ${heute}`);
  });

  it('AK6: das Herausziehen nimmt die Abhakung zurueck', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 2, 0), ansEnde(1));
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    const zeile = textZeilen(tab).find((z) => z.includes('Vierte Karte'));
    expect(zeile.startsWith('- [ ] ')).toBe(true);
    // Das Automatik-Datum wird so zurückgenommen, wie es die Lese-Ansicht beim
    // Zurückklicken tut — hier trug die Karte keines, also entsteht keines.
    expect(zeile).not.toContain('✅');
    expect(tab.content).toContain('## Laeuft\n\n- [ ] Dritte Karte\n- [ ] Vierte Karte');
  });

  it('eine bereits abgehakte Karte wird beim Hineinziehen nicht umgeschaltet', () => {
    // Sonst nähme die Kette die Abhakung gerade dann zurück, wenn der Anwender
    // sie setzen wollte.
    const { container, tab } = baueSpalte(TAFEL);
    ziehe(karteIn(container, 2, 0), vorKarte(2, 0));
    expect(tab.content).toContain('- [x] Vierte Karte');
  });

  it('zwischen zwei gewoehnlichen Spalten bleibt der Status stehen', () => {
    // Story 4S-000976, AK6: Nur das Herausziehen aus einer Spalte, die abhakt,
    // nimmt die Abhakung zurück — nicht jedes Umsortieren.
    const abgehakt = TAFEL.replace('- [ ] Dritte Karte', '- [x] Dritte Karte');
    const { container, tab } = baueSpalte(abgehakt);
    ziehe(karteIn(container, 1, 0), ansEnde(0));
    expect(tab.content).toContain('- [x] Dritte Karte');
  });

  it('eine wiederholende Aufgabe erzeugt ihre Folge-Instanz — und zwar dort, wo sie herkam', () => {
    // Umgeschrieben mit 4T-001896: Die Kette setzt die nächste Instanz
    // unmittelbar neben die abgeschlossene Zeile, also in die Spalte, in die
    // gezogen wurde. Der dritte Schritt der zusammengesetzten Operation holt
    // sie von dort in die Quell-Spalte zurück (Entscheidung des Product Owners
    // vom 2026-09-22); die Prüffälle dazu stehen im Block darunter.
    const mitWiederholung = TAFEL.replace(
      '- [ ] Erste Karte',
      '- [ ] Erste Karte 🔁 every day 📅 2026-01-01',
    );
    const { container, tab } = baueSpalte(mitWiederholung);
    ziehe(karteIn(container, 0, 0), ansEnde(2));
    const zeilen = textZeilen(tab).filter((z) => z.includes('Erste Karte'));
    expect(zeilen, 'die abgeschlossene Zeile und ihre Folge-Instanz').toHaveLength(2);
    expect(zeilen.filter((z) => z.startsWith('- [ ] '))).toHaveLength(1);
    // Die abgeschlossene Zeile steht in der Erledigt-Spalte, die offene Instanz
    // mit dem fortgeschriebenen Termin in der Spalte, aus der gezogen wurde.
    expect(kartenZeilen(tab, 'Fertig')).toEqual([
      '- [x] Vierte Karte',
      expect.stringMatching(/^- \[x\] Erste Karte .*📅 2026-01-01/),
    ]);
    expect(kartenZeilen(tab, 'Offen')[0]).toMatch(/^- \[ \] Erste Karte .*📅 2026-01-02/);
  });
});

// --- Die Folge-Instanz einer Wiederholung (4T-001896) ------------------------------

// Spalte 0 «Offen» mit drei Karten, die mittlere wiederholt sich; Spalte 1
// «Fertig» hakt ab und trägt eine Karte; Spalte 2 «Leer».
const WIEDERHOLEND = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Vorher',
  '- [ ] Waesche 🔁 every day 📅 2026-01-01',
  '- [ ] Nachher',
  '',
  '## Fertig',
  '',
  '**Complete**',
  '- [x] Alte Karte',
  '',
  '## Leer',
  '',
  '',
].join('\n');

// Spalte 0 «Fertig» hakt ab und trägt neben einer abgehakten Karte eine offene,
// wiederholende: der Fall «innerhalb einer abhakenden Spalte umsortieren».
const IN_ABHAKENDER_SPALTE = [
  KOPF,
  '## Fertig',
  '',
  '**Complete**',
  '- [x] Alte Karte',
  '- [ ] Waesche 🔁 every day 📅 2026-01-01',
  '',
  '## Offen',
  '',
  '- [ ] Irgendwas',
  '',
].join('\n');

/** Führt einen Lauf mit einem bestimmten Wert der Einstellung aus. */
function mitEinstellung(wert, lauf) {
  tasks.applyTasksConfig({ recurrenceInsert: wert });
  try {
    lauf();
  } finally {
    tasks.applyTasksConfig(null);
  }
}

describe('Folge-Instanz in die Quell-Spalte (4T-001896)', () => {
  it('AK1/AK2: die Instanz steht in der Quell-Spalte am alten Platz, die Ziel-Spalte bleibt erledigt', () => {
    const { container, tab, protokoll } = baueSpalte(WIEDERHOLEND);
    ziehe(karteIn(container, 0, 1), ansEnde(1));
    expect(protokoll.schreibvorgaenge, 'Verschieben, Abhaken, Versetzen: ein Schritt').toHaveLength(
      1,
    );
    // AK1: genau die Stelle, an der die gezogene Karte vorher stand.
    expect(kartenZeilen(tab, 'Offen')).toEqual([
      '- [ ] Vorher',
      expect.stringMatching(/^- \[ \] Waesche .*📅 2026-01-02/),
      '- [ ] Nachher',
    ]);
    // AK2: die abgehakte Karte an der Ablege-Position, keine offene Instanz.
    expect(kartenZeilen(tab, 'Fertig')).toEqual([
      '- [x] Alte Karte',
      expect.stringMatching(/^- \[x\] Waesche .*📅 2026-01-01/),
    ]);
    expect(spaltenBlock(tab, 'Fertig')).not.toContain('- [ ] ');
  });

  it('AK1: die Kette setzt das Automatik-Datum an der abgeschlossenen Zeile, nicht an der Instanz', () => {
    const { container, tab } = baueSpalte(WIEDERHOLEND);
    ziehe(karteIn(container, 0, 1), ansEnde(1));
    const heute = tasks.todayIsoDate();
    expect(kartenZeilen(tab, 'Fertig')[1]).toContain(`✅ ${heute}`);
    expect(kartenZeilen(tab, 'Offen')[1]).not.toContain('✅');
  });

  it('AK3: ein Rueckgaengig stellt den Ausgangs-Text zeichengenau her', () => {
    const { container, tab, protokoll } = baueSpalte(WIEDERHOLEND);
    const ausgang = tab.content;
    ziehe(karteIn(container, 0, 1), ansEnde(1));
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(tab.content).not.toBe(ausgang);
    tasteMit(container, 'z', { ctrlKey: true });
    expect(tab.content, 'ein Schreibvorgang, ein Rueckgaengig-Schritt').toBe(ausgang);
  });

  it('AK4: beide Werte der Einstellung «oberhalb / unterhalb» fuehren zum selben Ergebnis', () => {
    const ergebnisse = [];
    for (const wert of ['above', 'below']) {
      mitEinstellung(wert, () => {
        document.body.innerHTML = '';
        const { container, tab, protokoll } = baueSpalte(WIEDERHOLEND);
        ziehe(karteIn(container, 0, 1), ansEnde(1));
        expect(protokoll.schreibvorgaenge, wert).toHaveLength(1);
        ergebnisse.push(tab.content);
      });
    }
    expect(ergebnisse[0], 'die Instanz landet unabhaengig von der Einstellung dort').toBe(
      ergebnisse[1],
    );
    expect(ergebnisse[0].split('## Fertig')[0]).toMatch(/- \[ \] Waesche .*📅 2026-01-02/);
  });

  it('AK5: beim Umsortieren innerhalb einer abhakenden Spalte bleibt die Instanz dort — am alten Index', () => {
    const { container, tab, protokoll } = baueSpalte(IN_ABHAKENDER_SPALTE);
    // Die offene, wiederholende Karte vor die abgehakte ziehen: Quell- und
    // Ziel-Spalte sind dieselbe.
    ziehe(karteIn(container, 0, 1), vorKarte(0, 0));
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(kartenZeilen(tab, 'Fertig')).toEqual([
      expect.stringMatching(/^- \[x\] Waesche .*📅 2026-01-01/),
      expect.stringMatching(/^- \[ \] Waesche .*📅 2026-01-02/),
      '- [x] Alte Karte',
    ]);
  });

  it('AK4/AK5: auch in derselben Spalte tragen beide Werte der Einstellung dasselbe Ergebnis', () => {
    const ergebnisse = [];
    for (const wert of ['above', 'below']) {
      mitEinstellung(wert, () => {
        document.body.innerHTML = '';
        const { container, tab } = baueSpalte(IN_ABHAKENDER_SPALTE);
        ziehe(karteIn(container, 0, 1), vorKarte(0, 0));
        expect(kartenZeilen(tab, 'Fertig')[1], wert).toMatch(/^- \[ \] Waesche .*📅 2026-01-02/);
        ergebnisse.push(tab.content);
      });
    }
    expect(ergebnisse[0]).toBe(ergebnisse[1]);
  });

  it('AK6: eine Karte ohne Wiederholung wird nur abgehakt, nichts wird versetzt', () => {
    const { container, tab, protokoll } = baueSpalte(WIEDERHOLEND);
    ziehe(karteIn(container, 0, 0), ansEnde(1));
    expect(protokoll.schreibvorgaenge).toHaveLength(1);
    expect(kartenZeilen(tab, 'Offen')).toEqual([
      expect.stringMatching(/^- \[ \] Waesche /),
      '- [ ] Nachher',
    ]);
    expect(kartenZeilen(tab, 'Fertig')).toEqual([
      '- [x] Alte Karte',
      expect.stringMatching(/^- \[x\] Vorher/),
    ]);
  });

  it('AK8: in einem Dokument mit Wagenruecklauf traegt auch die versetzte Instanz ihn', () => {
    const crlf = WIEDERHOLEND.replace(/\n/g, '\r\n');
    const { container, tab } = baueSpalte(crlf);
    ziehe(karteIn(container, 0, 1), ansEnde(1));
    const zeilen = tab.content.split('\n').slice(0, -1);
    expect(
      zeilen.every((z) => z.endsWith('\r')),
      'keine Zeile ohne Wagenruecklauf',
    ).toBe(true);
    expect(tab.content).not.toMatch(/[^\r]\n/);
    expect(kartenZeilen(tab, 'Offen')[1]).toMatch(/^- \[ \] Waesche .*📅 2026-01-02/);
  });
});

// --- Der Statuswechsel als Text-Rechnung -------------------------------------------

describe('statusToggleAufText: dieselbe Kette ohne eigenen Schreibvorgang', () => {
  it('schaltet genau die benannte Zeile und laesst die uebrigen stehen', () => {
    const ergebnis = taskStates.statusToggleAufText('Kopf\n- [ ] Eine Aufgabe\nFuss', 2);
    const zeilen = ergebnis.text.split('\n');
    expect(zeilen[0]).toBe('Kopf');
    expect(zeilen[1].startsWith('- [x] Eine Aufgabe')).toBe(true);
    expect(zeilen[zeilen.length - 1]).toBe('Fuss');
  });

  it('CRLF bleibt CRLF — auch an der erzeugten Folge-Instanz', () => {
    // Die Wiederholungs-Instanz erbt das Zeilenende ihrer Quelle, wie es auch
    // der Format-Kern der Tafel tut; sonst mischte die erste Abhakung an einer
    // CRLF-Datei beide Formen.
    const crlf = '- [ ] A 🔁 every day 📅 2026-01-01\r\n- [ ] B\r\n';
    const ergebnis = taskStates.statusToggleAufText(crlf, 1);
    const zeilen = ergebnis.text.split('\n');
    expect(zeilen[0].endsWith('\r')).toBe(true);
    expect(zeilen[1].endsWith('\r')).toBe(true);
    expect(zeilen[1]).toContain('- [x] A');
    expect(zeilen[2]).toBe('- [ ] B\r');
  });

  it('eine Zeile ohne Aufgabe und eine Zeile ausserhalb ergeben nichts', () => {
    // Kein Rückfall auf eine Vermutung: Wo nichts zu schalten ist, bleibt der
    // Text, wie er war, und der Aufrufer verschiebt allein.
    expect(taskStates.statusToggleAufText('Nur Text', 1)).toBeNull();
    expect(taskStates.statusToggleAufText('- [ ] A', 7)).toBeNull();
    expect(taskStates.statusToggleAufText('- [ ] A', Number.NaN)).toBeNull();
  });
});

// --- Nicht änderbar und Rand-Rollen ------------------------------------------------

describe('Nicht aenderbares Dokument (AK11)', () => {
  it('AK11: es beginnt gar kein Zug', () => {
    const { container, tab, protokoll } = baueSpalte(TAFEL, { aenderbar: false });
    const vorher = tab.content;
    ziehe(karteIn(container, 0, 1), vorKarte(1, 0));
    expect(container.querySelector(`.${MARKE_KLASSE}`)).toBeNull();
    expect(protokoll.schreibvorgaenge).toHaveLength(0);
    expect(tab.content).toBe(vorher);
  });

  it('AK11: auch die Spalte bleibt stehen', () => {
    const { container, tab } = baueSpalte(TAFEL, { aenderbar: false });
    const vorher = tab.content;
    ziehe(kopfVon(container, 1), { x: 20, y: 200 });
    expect(tab.content).toBe(vorher);
  });
});

describe('Rand-Rollen waehrend des Zuges', () => {
  const takte = () => new Promise((fertig) => setTimeout(fertig, 60));

  it('am rechten Rand rollt der Spalten-Streifen weiter', async () => {
    // Ohne diesen Takt endete jeder Zug am Rand des sichtbaren Ausschnitts:
    // Wer in eine Spalte ziehen will, die gerade nicht zu sehen ist, käme nicht
    // hin. Gemessen wird am echten Auslöser, dem Intervall des Zuges.
    const { container } = baueSpalte(TAFEL);
    const streifen = container.querySelector('.kanban-spalten');
    streifen.scrollLeft = 0;
    const karte = karteIn(container, 0, 0);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 5, y: r.top + 5 });
    maus('mousemove', window, { x: r.left + 40, y: r.top + 40 });
    // An den rechten Rand des Streifens (vier Spalten zu 300).
    maus('mousemove', window, { x: 4 * SPALTEN_BREITE - 2, y: 200 });
    expect(container.classList.contains(ZIEHT_KLASSE)).toBe(true);
    await takte();
    expect(streifen.scrollLeft, 'der Streifen ist nach rechts gerollt').toBeGreaterThan(0);
    maus('mouseup', window, { x: 4 * SPALTEN_BREITE - 2, y: 200 });
    const stand = streifen.scrollLeft;
    await takte();
    expect(streifen.scrollLeft, 'nach dem Loslassen steht der Takt still').toBe(stand);
  });

  it('die Karten-Liste unter dem Zeiger rollt senkrecht', async () => {
    // Verschachtelte Roll-Flächen bekommen jede ihren eigenen Takt: Der
    // Streifen waagerecht, die Liste senkrecht.
    const { container } = baueSpalte(TAFEL);
    const liste = container.querySelector(
      `.${SPALTE_KLASSE}[data-spalte="0"] .kanban-spalte-karten`,
    );
    liste.scrollTop = 0;
    const karte = karteIn(container, 0, 0);
    const r = karte.getBoundingClientRect();
    maus('mousedown', karte, { x: r.left + 5, y: r.top + 5 });
    maus('mousemove', window, { x: r.left + 40, y: r.top + 40 });
    // An den unteren Rand der Karten-Liste (top 40, Höhe 360).
    maus('mousemove', window, { x: 150, y: 398 });
    await takte();
    expect(liste.scrollTop).toBeGreaterThan(0);
    maus('mouseup', window, { x: 150, y: 398 });
  });
});

// --- Bauweise -------------------------------------------------------------------------

describe('Bauweise des Zieh-Moduls (4T-001850)', () => {
  it('es bleibt frei von Renderer-Zustand', () => {
    const quelle = lies('src/renderer/modules/kanban/kanban-ziehen.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege.length).toBeGreaterThan(0);
    for (const bezug of bezuege) {
      expect(bezug, `unerlaubter Import ${bezug}`).toMatch(
        /^(?:\.\.\/\.\.\/\.\.\/shared\/|\.\/kanban-)/,
      );
    }
  });

  it('die Geometrie steht prozessneutral und tafel-unabhaengig daneben', () => {
    // Der Bestand hatte fuer das Ziehen keinen gemeinsamen Baustein; dieser
    // Vorgang legt ihn an, statt die fuenfte Eigenbau-Stelle zu schaffen.
    const geometrie = lies('src/shared/zieh-geometrie.js');
    expect(geometrie).not.toMatch(/kanban/i);
    expect(geometrie).not.toContain('document');
    expect(geometrie).not.toMatch(/require\('(?!\.)/);
  });

  it('der Schreibweg ist der gemeinsame, und der Statuswechsel kommt herein', () => {
    const quelle = lies('src/renderer/modules/kanban/kanban-ziehen.js');
    expect(quelle).toContain('ctx.wendeAn(');
    expect(quelle).not.toContain('setzeKartenStatus');
    const pane = lies('src/renderer/modules/kanban/kanban-pane.js');
    expect(pane).toContain("rufeZugang('statusAufText'");
    const init = lies('src/renderer/modules/app-init.js');
    expect(init).toContain('statusAufText: (text, zeilenNummer) => statusToggleAufText(');
  });
});
