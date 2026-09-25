// @vitest-environment jsdom
// 4T-001907 (Epic 3E-000318): Prüffälle «Karten suchen und filtern», Bedien-
// Hälfte — die Strg+F-Weiche, das Filter-Feld im Kopf der Tafel, das
// Ausblenden, der Zähler «Treffer/Gesamt», der Hinweis bei null Treffern,
// Escape, der Erhalt über eine Neu-Zeichnung, das unveränderte Dokument, das
// nicht änderbare Dokument und die Tasten der Karten im Feld (Story 4S-000983).
//
// **Gemessen wird an der Einbettung** (Muster kanban-archivieren.test.js): Das
// Feld überlebt die Zeichnung nur im Zusammenspiel aus Einbettung, Zeichnung und
// Suche. Der Editor der Spalte ist eine Attrappe, die jeden Schreibvorgang
// mitschreibt — hier muss die Liste leer bleiben. Die Übersetzung ist
// nachgestellt und liest die gebaute deutsche Sprachdatei, damit Zähler und
// Hinweis im Wortlaut messbar sind.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { KARTE_KLASSE } from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const DE = JSON.parse(lies('src/i18n/de.json'));

const { showStatusbarHint } = vi.hoisted(() => ({ showStatusbarHint: vi.fn() }));
vi.mock('../../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => DE[key] ?? key,
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({ showStatusbarHint }));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  configureTaskMarkers: () => {},
  configureTaskStates: () => {},
};
const { initKanbanPane, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');
const { beendeTafelSuche, oeffneTafelSuche, VERBORGEN_KLASSE } =
  await import('../../../src/renderer/modules/kanban/kanban-suche.js');

const KOPF = '---\nkanban-plugin: board\n---\n';
const TAFEL = [
  KOPF,
  '## Offen (2)',
  '',
  '- [ ] Angebot schreiben #kunde',
  '\tMit Preisliste für die Messe',
  '- [ ] Rechnung prüfen',
  '- [ ] Termin vereinbaren',
  '',
  '## Erledigt',
  '',
  '- [x] Messestand gebucht',
  '',
].join('\n');

function baueSpalte(text = TAFEL, optionen = {}) {
  const tab = { content: text, viewMode: optionen.viewMode || 'kanban', path: 'C:/Tafel.md' };
  const zustand = { tab };
  const container = document.createElement('section');
  document.body.appendChild(container);
  const protokoll = { schreibvorgaenge: [], rueckgaengig: 0, status: 0 };
  initKanbanPane({
    getPaneEls: () => ({ kanbanEl: container }),
    aktivesDokument: () => zustand.tab,
    istAenderbar: () => optionen.aenderbar !== false,
    schreibeDokument: (_i, daten) => {
      protokoll.schreibvorgaenge.push(daten);
      return true;
    },
    statusUmschalten: () => {
      protokoll.status += 1;
      return true;
    },
    rueckgaengig: () => {
      protokoll.rueckgaengig += 1;
      return true;
    },
    zeigeKontextmenue: () => {},
    schliesseKontextmenue: () => {},
  });
  renderKanban(0);
  return { tab, zustand, container, protokoll };
}

const feld = (c) => c.querySelector('input.kanban-filter');
const leiste = (c) => c.querySelector('div.kanban-filter-leiste');
const hinweis = (c) => c.querySelector('p.kanban-filter-leer');
const karten = (c) => [...c.querySelectorAll(`.${KARTE_KLASSE}`)];
const sichtbar = (c) =>
  karten(c)
    .filter((el) => !el.classList.contains(VERBORGEN_KLASSE))
    .map((el) => el.textContent.trim());
const zaehler = (c) => [...c.querySelectorAll('.kanban-spalte-zaehler')].map((z) => z.textContent);

function tippe(c, text) {
  feld(c).value = text;
  feld(c).dispatchEvent(new window.Event('input', { bubbles: true }));
}

function taste(el, key, zusatz = {}) {
  const ereignis = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...zusatz,
  });
  el.dispatchEvent(ereignis);
  return ereignis;
}

function waehle(karteEl) {
  karteEl.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  showStatusbarHint.mockReset();
});

describe('Strg+F-Weiche (AK1)', () => {
  it('in der Tafel-Ansicht: Feld im Kopf der Tafel sichtbar und fokussiert', () => {
    const { container } = baueSpalte();
    expect(leiste(container)).toBeNull();
    expect(oeffneTafelSuche(0)).toBe(true);
    expect(leiste(container).hidden).toBe(false);
    expect(document.activeElement).toBe(feld(container));
    // Im Kopf: vor der Tafel, über den Spalten.
    expect(container.firstElementChild).toBe(leiste(container));
    expect(feld(container).placeholder).toBe(DE['kanban.filterPlatzhalter']);
  });

  it('in jeder anderen Ansicht übernimmt die Tafel nicht', () => {
    for (const modus of ['rendered', 'source', 'split', 'live', 'canvas', 'mindmap']) {
      const { container } = baueSpalte(TAFEL, { viewMode: modus });
      expect(oeffneTafelSuche(0)).toBe(false);
      expect(leiste(container)).toBeNull();
    }
  });

  it('der Dispatcher fragt Canvas und Tafel und öffnet sonst die Suchleiste wie zuvor', () => {
    // Quelltext-Wächter nach dem Muster der Canvas-Weiche: Die eine Zeile im
    // Handler `search.open` ist die ganze Weiche.
    const quelle = lies('src/renderer/modules/app/app-commands.js');
    expect(quelle).toContain(
      'if (!oeffneCanvasSuche(idx) && !oeffneTafelSuche(idx)) openSearchBar();',
    );
    expect(quelle).toContain('openSearchBar({ replaceMode: true })');
  });
});

describe('Filtern (AK2 bis AK4, AK6)', () => {
  it('die Eingabe blendet nicht passende Karten sofort aus, die Spalten bleiben', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'MESSE');
    expect(sichtbar(container)).toEqual([
      expect.stringContaining('Angebot schreiben'),
      expect.stringContaining('Messestand gebucht'),
    ]);
    // Ausgeblendet, nicht entfernt.
    expect(karten(container)).toHaveLength(4);
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(2);
    expect(hinweis(container).hidden).toBe(true);
  });

  it('der Zähler zeigt «Treffer/Gesamt»; die Obergrenzen-Hervorhebung misst weiter an allen Karten', () => {
    const { container } = baueSpalte();
    const [offen] = container.querySelectorAll('.kanban-spalte');
    expect(zaehler(container)).toEqual(['3/2', '1']);
    expect(offen.classList.contains('kanban-spalte-ueberschritten')).toBe(true);
    oeffneTafelSuche(0);
    tippe(container, 'rechnung');
    expect(zaehler(container)).toEqual(['1/3', '0/1']);
    expect(offen.classList.contains('kanban-spalte-ueberschritten')).toBe(true);
    const titel = offen.querySelector('.kanban-spalte-zaehler').title;
    expect(titel).toContain('1 von 3 Karten passen zum Filter');
    // Die Obergrenze bleibt im Hinweistext stehen.
    expect(titel).toContain('Obergrenze überschritten');
  });

  it('findet über Tags und Folgezeilen', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, '#kunde');
    expect(sichtbar(container)).toEqual([expect.stringContaining('Angebot')]);
    tippe(container, 'preisliste');
    expect(sichtbar(container)).toEqual([expect.stringContaining('Angebot')]);
  });

  it('null Treffer: vollständige, leere Spalten-Reihe und ein Hinweis', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'gibt es nirgends');
    expect(sichtbar(container)).toEqual([]);
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(2);
    expect(hinweis(container).hidden).toBe(false);
    expect(hinweis(container).textContent).toBe(DE['kanban.filterKeinTreffer']);
    expect(zaehler(container)).toEqual(['0/3', '0/1']);
  });

  it('eine ausgeblendete Karte bleibt nicht gewählt', () => {
    const { container } = baueSpalte();
    waehle(karten(container)[1]);
    oeffneTafelSuche(0);
    tippe(container, 'angebot');
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
  });
});

describe('Escape und Ende des Filters (AK5)', () => {
  it('Escape leert das Feld, schließt die Leiste und stellt die ganze Tafel her', () => {
    const { container } = baueSpalte();
    waehle(karten(container)[0]);
    oeffneTafelSuche(0);
    tippe(container, 'angebot');
    const ereignis = taste(feld(container), 'Escape');
    expect(ereignis.defaultPrevented).toBe(true);
    expect(feld(container).value).toBe('');
    expect(leiste(container).hidden).toBe(true);
    expect(sichtbar(container)).toHaveLength(4);
    expect(zaehler(container)).toEqual(['3/2', '1']);
    expect(hinweis(container).hidden).toBe(true);
    // Der Fokus geht an die gewählte Karte zurück, und die Auswahl blieb stehen.
    expect(document.activeElement).toBe(karten(container)[0]);
    expect(karten(container)[0].getAttribute('aria-selected')).toBe('true');
  });

  it('ohne gewählte Karte geht der Fokus an die Tafel', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'x');
    taste(feld(container), 'Escape');
    expect(document.activeElement).toBe(container);
  });

  it('der Wechsel der Ansicht beendet den Filter', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'angebot');
    expect(beendeTafelSuche(0)).toBe(true);
    expect(leiste(container).hidden).toBe(true);
    expect(sichtbar(container)).toHaveLength(4);
    expect(beendeTafelSuche(0)).toBe(false);
  });

  it('der Wechsel des Dokuments beendet den Filter', () => {
    const { container, zustand } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'angebot');
    zustand.tab = {
      content: TAFEL.replace('Termin', 'Treffen'),
      viewMode: 'kanban',
      path: 'C:/B.md',
    };
    renderKanban(0);
    expect(leiste(container).hidden).toBe(true);
    expect(feld(container).value).toBe('');
    expect(sichtbar(container)).toHaveLength(4);
  });
});

describe('Neu-Zeichnung, Dokument und Änderbarkeit (AK7 bis AK9)', () => {
  it('der Filter überlebt die Neu-Zeichnung nach einer Dokument-Änderung, samt Fokus', () => {
    const { tab, container } = baueSpalte();
    oeffneTafelSuche(0);
    tippe(container, 'messe');
    tab.content = TAFEL.replace('- [ ] Termin vereinbaren', '- [ ] Messe planen\n- [ ] Urlaub');
    renderKanban(0);
    expect(karten(container)).toHaveLength(5);
    expect(sichtbar(container)).toEqual([
      expect.stringContaining('Angebot'),
      expect.stringContaining('Messe planen'),
      expect.stringContaining('Messestand'),
    ]);
    expect(zaehler(container)).toEqual(['2/4', '1/1']);
    expect(feld(container).value).toBe('messe');
    expect(document.activeElement).toBe(feld(container));
  });

  it('Suchen und Filtern verändern das Dokument nicht', () => {
    const { tab, container, protokoll } = baueSpalte();
    oeffneTafelSuche(0);
    for (const text of ['a', 'an', 'angebot', '', 'zzz']) tippe(container, text);
    taste(feld(container), 'Escape');
    expect(tab.content).toBe(TAFEL);
    expect(protokoll.schreibvorgaenge).toEqual([]);
  });

  it('die Suche geht auch im nicht änderbaren Dokument', () => {
    const { container } = baueSpalte(TAFEL, { aenderbar: false });
    expect(oeffneTafelSuche(0)).toBe(true);
    tippe(container, 'rechnung');
    expect(sichtbar(container)).toEqual([expect.stringContaining('Rechnung')]);
  });
});

describe('Tasten der Karten im Feld', () => {
  it('Entf, Leertaste, Eingabe, F2 und Strg+Z wirken im Feld nicht auf die gewählte Karte', () => {
    const { container, protokoll } = baueSpalte();
    waehle(karten(container)[0]);
    oeffneTafelSuche(0);
    for (const [key, zusatz] of [
      ['Delete', {}],
      [' ', {}],
      ['Enter', {}],
      ['F2', {}],
      ['z', { ctrlKey: true }],
      ['y', { ctrlKey: true }],
    ]) {
      taste(feld(container), key, zusatz);
    }
    expect(protokoll.schreibvorgaenge).toEqual([]);
    expect(protokoll.status).toBe(0);
    expect(protokoll.rueckgaengig).toBe(0);
    expect(container.querySelector('.kanban-karte-eingabe')).toBeNull();
  });

  it('die übrigen Kürzel der Anwendung erreichen das Fenster weiter', () => {
    const { container } = baueSpalte();
    oeffneTafelSuche(0);
    const angekommen = [];
    const hoerer = (e) => angekommen.push(e.key);
    window.addEventListener('keydown', hoerer);
    taste(feld(container), 's', { ctrlKey: true });
    taste(feld(container), 'f', { ctrlKey: true });
    taste(feld(container), 'a');
    window.removeEventListener('keydown', hoerer);
    expect(angekommen).toEqual(['s', 'f']);
  });

  it('ein Mausdruck ins Feld hebt die Auswahl der Karte nicht auf', () => {
    const { container } = baueSpalte();
    waehle(karten(container)[0]);
    oeffneTafelSuche(0);
    feld(container).dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(karten(container)[0].getAttribute('aria-selected')).toBe('true');
  });
});
