// @vitest-environment jsdom
// 4T-001771 (Epic 3E-000290): Das Filter-Feld über der Karten-Liste und die
// Strg+F-Weiche der Canvas-Ansicht (Story 4S-000950).
//
// **Geprüft wird gegen die echte Kette**, wie in `canvas-liste.test.js` und
// `canvas-liste-tasten.test.js` und aus demselben Grund: Gegenstand ist das
// Zusammenspiel von Filter-Feld, Liste, Auswahl und Ausschnitt der Fläche. Eine
// nachgebaute Ansicht bewiese allein, dass das Panel die nachgebaute
// Schnittstelle bedient.
//
// Gestellt sind nur die drei Funktionen der Ansichts-Ebene, die außerhalb
// dieses Vorgangs liegen: der Moduswechsel, der Statusleisten-Hinweis und das
// Schreiben einer Einstellung.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import './api-stub.js';

// Die Weiche öffnet das Panel über den gemeinsamen Panel-Weg, und der meldet am
// Ende den Menü-Zustand an den Hauptprozess. Der Stub kennt diesen Kanal nicht;
// ohne ihn bricht das Versprechen des Öffnens ab, bevor der Fokus gesetzt ist.
window.api.reportMenuState = () => {};

// Das Grundgerüst trägt hier **zusätzlich das Filter-Feld**; ohne es bliebe die
// Liste ungefiltert, und genau dieser Rückfall ist der Grund, warum die beiden
// älteren Prüfdateien ohne Anpassung weiterlaufen.
for (const pane of document.querySelectorAll('.pane-group')) {
  pane.innerHTML = `
    <section class="sidebar-section sidebar-canvaslist">
      <input type="search" class="canvas-liste-filter" />
      <div class="canvas-liste-status"></div>
      <div class="canvas-liste"></div>
    </section>
    <div class="pane-canvas"></div>`;
}

Element.prototype.scrollIntoView = () => {};

const wechsel = [];
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', async (echtLaden) => {
  const echt = await echtLaden();
  return {
    ...echt,
    setViewMode: (modus) => wechsel.push(modus),
    showStatusbarHint: (schluessel) => hinweise.push(schluessel),
    persistSetting: async () => true,
  };
});

const { applyCanvasListVisibility, oeffneCanvasSuche } =
  await import('../../../src/renderer/modules/panels/panel-canvas-liste.js');
const { destroyCanvas, initCanvasPane, renderCanvas } =
  await import('../../../src/renderer/modules/canvas/canvas-pane.js');
const { getPaneEls, state } = await import('../../../src/renderer/modules/app/app-state.js');

const FENCE = (rumpf) => '```perspective-canvas\n' + rumpf + '\n```';
// Eine Fläche mit allen durchsuchten Feldern: Karten-Text, Verweis-Ziel,
// Bild-Name, Form- und Gruppen-Beschriftung und eine beschriftete Verbindung.
const RUMPF = [
  '!karte k1 x=0 y=0 b=200 h=100',
  '# Erste Karte',
  '!form f1 x=300 y=0 b=80 h=80 art=oval',
  'Ein Oval',
  '!karte k2 x=0 y=300 b=200 h=100',
  '# Zweite Karte',
  '!linie l1 k1 -> k2',
  'Zusammenhang',
  // Mit **eigener** Beschriftung neben dem Verweis: Ohne sie steht das Ziel
  // bereits als Text der Zeile (die Vorschau der Karte fällt darauf zurück),
  // und die Zeile trüge das Ziel gar nicht zweimal.
  '!karte k3 x=600 y=0 b=200 h=100 doc="Import.md#Zielbild"',
  '# Verweis nach nebenan',
  '!gruppe g1 x=-20 y=-20 b=900 h=900',
  'Alles zusammen',
].join('\n');

let tab;

function baueSpalte(inhalt = FENCE(RUMPF), opts = {}) {
  wechsel.length = 0;
  hinweise.length = 0;
  destroyCanvas(0);
  tab = { viewMode: opts.viewMode || 'canvas', content: inhalt, path: 'F.md', ...opts };
  const els = getPaneEls(0);
  els.canvasEl.innerHTML = '';
  els.canvasListFilter.value = '';
  initCanvasPane({
    getPaneEls: () => els,
    aktivesDokument: () => tab,
    istAenderbar: () => opts.aenderbar !== false,
    schreibeDokument: () => true,
  });
  state.canvasList.visibleByPane[0] = true;
  renderCanvas(0);
  applyCanvasListVisibility(0);
  return els;
}

const feld = () => getPaneEls(0).canvasListFilter;
const liste = () => getPaneEls(0).canvasListList;
const zeilen = () => [...liste().querySelectorAll('[data-canvas-id]')];
const kennungen = () => zeilen().map((z) => z.dataset.canvasId);
const statusText = () => getPaneEls(0).canvasListStatus.textContent;
const marken = () => [...liste().querySelectorAll('mark.canvas-liste-treffer')];

// Der Weg des Anwenders: tippen. Das Ereignis `input` ist dasselbe, das der
// Browser nach jedem Anschlag schickt.
function tippe(text) {
  feld().value = text;
  feld().dispatchEvent(new window.Event('input', { bubbles: true }));
}

function taste(key, ziel = document.activeElement || document.body) {
  const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ziel.dispatchEvent(ev);
  return ev;
}

const gleich = () => new Promise((fertig) => setTimeout(fertig, 0));

beforeEach(() => {
  state.canvasList.visibleByPane[0] = false;
  state.canvasList.visibleByPane[1] = false;
});

describe('Filter-Feld: Einengen und Leeren (AK3, AK9)', () => {
  it('eine Eingabe engt die Liste ein, das Leeren zeigt wieder alles', () => {
    baueSpalte();
    expect(kennungen()).toEqual(['k1', 'l1', 'f1', 'k2', 'l1', 'k3', 'g1']);
    tippe('zweite');
    expect(kennungen()).toEqual(['k2', 'l1']);
    tippe('');
    expect(kennungen()).toEqual(['k1', 'l1', 'f1', 'k2', 'l1', 'k3', 'g1']);
  });

  it('durchsucht Text, Verweis-Ziel und Beschriftungen ohne Rücksicht auf die Schreibung', () => {
    baueSpalte();
    tippe('OVAL');
    expect(kennungen()).toEqual(['f1']);
    tippe('zielbild');
    expect(kennungen()).toEqual(['k3']);
    tippe('alles');
    expect(kennungen()).toEqual(['g1']);
    // Trifft allein die Beschriftung der Verbindung, bleiben beide Karten als
    // ihre Träger stehen.
    tippe('zusammenhang');
    expect(kennungen()).toEqual(['k1', 'l1', 'k2', 'l1']);
  });

  it('der Statustext zählt die Treffer und sagt, wenn es keine gibt', () => {
    baueSpalte();
    // Ohne geladenen Katalog liefert `t` den Schlüssel; geprüft ist damit die
    // Wahl der Zeile, die Zahl steckt in der Liste daneben.
    expect(statusText()).toBe('canvas.liste.elemente');
    tippe('zweite');
    expect(statusText()).toBe('canvas.liste.einTreffer');
    tippe('karte');
    expect(statusText()).toBe('canvas.liste.treffer');
    tippe('gibt es nicht');
    expect(statusText()).toBe('canvas.liste.keinTreffer');
    // AK9: ein eigener Hinweis statt einer wortlos leeren Liste.
    expect(zeilen()).toHaveLength(0);
    expect(getPaneEls(0).canvasListStatus.classList.contains('empty')).toBe(true);
  });
});

describe('Filter-Feld: Hervorhebung der Fundstelle (AK4)', () => {
  it('hebt die Fundstelle im Zeilen-Text hervor und lässt den Rest stehen', () => {
    baueSpalte();
    tippe('rste');
    const zeile = zeilen()[0];
    expect(zeile.dataset.canvasId).toBe('k1');
    expect(zeile.querySelector('.canvas-liste-text').textContent).toBe('Erste Karte');
    const fund = zeile.querySelector('mark.canvas-liste-treffer');
    expect(fund.textContent).toBe('rste');
    // Vor und hinter der Marke steht der übrige Text — die Zeile bleibt lesbar.
    expect(fund.previousSibling.textContent).toBe('E');
    expect(fund.nextSibling.textContent).toBe(' Karte');
  });

  it('hebt auch im Verweis-Ziel und in der Beschriftung einer Verbindung hervor', () => {
    baueSpalte();
    tippe('zielbild');
    expect(marken()).toHaveLength(1);
    expect(marken()[0].closest('.canvas-liste-ziel')).not.toBeNull();
    tippe('zusammen');
    // Die Verbindungs-Zeile steht zweimal in der Liste — unter jeder ihrer
    // beiden Karten —, dazu die Gruppe mit ihrer eigenen Beschriftung. Die
    // Marke trägt die **ursprüngliche** Schreibung und nicht die der Eingabe:
    // Hervorgehoben wird der gefundene Text, nicht der gesuchte.
    expect(marken().map((m) => m.textContent)).toEqual(['Zusammen', 'Zusammen', 'zusammen']);
  });

  it('ohne Filter gibt es keine Marke', () => {
    baueSpalte();
    expect(marken()).toHaveLength(0);
    tippe('karte');
    expect(marken().length).toBeGreaterThan(0);
    tippe('');
    expect(marken()).toHaveLength(0);
  });
});

describe('Filter-Feld: Tasten (AK5, AK6)', () => {
  it('die Eingabetaste wählt den ersten Treffer aus und rückt ihn in den Ausschnitt', () => {
    const els = baueSpalte();
    const buehne = () => els.canvasEl.querySelector('.canvas-karten').style.transform;
    const vorher = buehne();
    tippe('zweite');
    taste('Enter', feld());
    // Auf der Fläche gewählt, in der Liste hervorgehoben, Fokus in der Liste.
    expect(els.canvasEl.querySelector('.canvas-karte[data-canvas-id="k2"]').className).toContain(
      'canvas-karte-gewaehlt',
    );
    expect(document.activeElement.dataset.canvasId).toBe('k2');
    const nachher = buehne();
    expect(nachher).not.toBe(vorher);
    // Die Vergrößerung bleibt unverändert — gerückt wird, nicht eingepasst.
    const massstab = (wert) => /scale\(([-\d.]+)\)/.exec(wert)[1];
    expect(massstab(nachher)).toBe(massstab(vorher));
  });

  it('nach dem Sprung wandern die Pfeiltasten durch die übrigen Treffer', () => {
    baueSpalte();
    tippe('karte');
    expect(kennungen()).toEqual(['k1', 'l1', 'k2', 'l1']);
    taste('Enter', feld());
    expect(document.activeElement.dataset.canvasId).toBe('k1');
    // Ab hier greifen die Tasten der Liste; sie wandern über die gefilterten
    // Zeilen und nehmen die Auswahl auf der Fläche mit.
    taste('ArrowDown');
    expect(document.activeElement.dataset.canvasId).toBe('l1');
    taste('ArrowDown');
    expect(document.activeElement.dataset.canvasId).toBe('k2');
    expect(liste().querySelector('.selected').dataset.canvasId).toBe('k2');
  });

  it('die Eingabetaste springt zum gewählten Treffer, wenn er unter ihnen steht', () => {
    baueSpalte();
    tippe('karte');
    taste('Enter', feld());
    taste('ArrowDown');
    taste('ArrowDown');
    expect(liste().querySelector('.selected').dataset.canvasId).toBe('k2');
    // Zurück ins Feld, weiter tippen: Die gewählte Karte bleibt unter den
    // Treffern, und die Eingabetaste wirft den Anwender nicht an den Anfang.
    tippe('zweite karte');
    taste('Enter', feld());
    expect(document.activeElement.dataset.canvasId).toBe('k2');
  });

  it('Pfeil ab wandert aus dem Feld in die Liste', () => {
    baueSpalte();
    feld().focus();
    tippe('oval');
    taste('ArrowDown', feld());
    expect(document.activeElement.dataset.canvasId).toBe('f1');
  });

  it('Escape leert das Feld und gibt den Fokus an die Liste, ohne auszuwählen', () => {
    baueSpalte();
    tippe('oval');
    expect(kennungen()).toEqual(['f1']);
    const ev = taste('Escape', feld());
    expect(feld().value).toBe('');
    expect(kennungen()).toEqual(['k1', 'l1', 'f1', 'k2', 'l1', 'k3', 'g1']);
    // Ohne vorherige Auswahl steht der Fokus auf der ersten Zeile; gewählt ist
    // weiterhin nichts, und der Ausschnitt der Fläche ist nicht gewandert.
    expect(document.activeElement.dataset.canvasId).toBe('k1');
    expect(liste().querySelector('.selected')).toBeNull();
    // Angehalten, damit die Escape-Kaskade des Fensters nicht zusätzlich etwas
    // schließt, was der Anwender nicht gemeint hat.
    expect(ev.defaultPrevented).toBe(true);
  });

  it('bei leerem Feld bleibt Escape unangetastet', () => {
    baueSpalte();
    const ev = taste('Escape', feld());
    expect(ev.defaultPrevented).toBe(false);
  });

  it('die Tasten der Liste greifen im Feld nicht', () => {
    baueSpalte();
    tippe('zweite');
    // Entfernen im Filter-Feld löscht Text und nicht die Karte; die Fläche
    // bleibt unberührt (Fortschreibung von AK11 aus 4T-001770).
    taste('Delete', feld());
    expect(tab.content).toBe(FENCE(RUMPF));
    expect(kennungen()).toEqual(['k2', 'l1']);
  });
});

describe('Filter-Feld: Nur-Ansicht und Klapp-Zustand (AK10)', () => {
  it('im nicht änderbaren Dokument filtert und springt die Suche unverändert', () => {
    const els = baueSpalte(FENCE(RUMPF), { aenderbar: false });
    expect(els.canvasListSection.classList.contains('nur-ansicht')).toBe(true);
    tippe('zweite');
    expect(kennungen()).toEqual(['k2', 'l1']);
    taste('Enter', feld());
    expect(liste().querySelector('.selected').dataset.canvasId).toBe('k2');
    // Gesucht wird gelesen, nicht geschrieben.
    expect(tab.content).toBe(FENCE(RUMPF));
  });

  it('ein laufender Filter klappt die Karten auf, damit kein Treffer verborgen bleibt', () => {
    baueSpalte();
    // Die Verbindungen von k1 zuklappen: ihr Griff sitzt in der Zeile.
    liste().querySelector('[data-canvas-id="k1"] .canvas-liste-klapp').click();
    expect(kennungen()).toEqual(['k1', 'f1', 'k2', 'l1', 'k3', 'g1']);
    tippe('zusammenhang');
    expect(kennungen()).toEqual(['k1', 'l1', 'k2', 'l1']);
    // Nach dem Leeren steht der gemerkte Klapp-Zustand wieder.
    tippe('');
    expect(kennungen()).toEqual(['k1', 'f1', 'k2', 'l1', 'k3', 'g1']);
  });
});

describe('Strg+F-Weiche der Canvas-Ansicht (AK7, AK8, AK11, AK13)', () => {
  it('übernimmt in der Canvas-Ansicht, blendet das Panel ein und setzt den Fokus', async () => {
    baueSpalte();
    // Der Ausgangspunkt der Probe: Das Panel ist ausgeblendet, wie bei einem
    // Anwender, der die Liste noch nie geöffnet hat.
    state.canvasList.visibleByPane[0] = false;
    applyCanvasListVisibility(0);
    expect(getPaneEls(0).canvasListSection.hidden).toBe(true);
    expect(oeffneCanvasSuche(0)).toBe(true);
    await gleich();
    expect(state.canvasList.visibleByPane[0]).toBe(true);
    expect(getPaneEls(0).canvasListSection.hidden).toBe(false);
    expect(document.activeElement).toBe(feld());
  });

  it('bei offenem Panel setzt sie nur den Fokus', async () => {
    baueSpalte();
    expect(oeffneCanvasSuche(0)).toBe(true);
    await gleich();
    expect(state.canvasList.visibleByPane[0]).toBe(true);
    expect(document.activeElement).toBe(feld());
  });

  it('greift in jeder anderen Ansicht nicht — dort bleibt die Suchleiste der Weg', async () => {
    for (const modus of ['rendered', 'source', 'split', 'live']) {
      baueSpalte(FENCE(RUMPF), { viewMode: modus });
      expect(oeffneCanvasSuche(0)).toBe(false);
    }
    // Und ohne Fläche im Dokument ebenso wenig, auch wenn der Modus passt:
    // ohne Fläche gibt es die Canvas-Ansicht nicht (E9), und mit ihr die
    // Erweiterung im Aus-Zustand (AK11).
    baueSpalte('# Nur ein Dokument, ohne Fläche.', { viewMode: 'rendered' });
    expect(oeffneCanvasSuche(0)).toBe(false);
    await gleich();
  });

  it('der Dispatcher öffnet die Suchleiste genau dann, wenn die Fläche nicht übernimmt', () => {
    // Quelltext-Wächter nach dem Muster von `kommando-dispatcher.test.js`: Die
    // eine Zeile im Handler `search.open` ist die ganze Weiche, und sie darf
    // nicht zu zwei Wegen auseinanderfallen.
    const quelle = readFileSync('src/renderer/modules/app/app-commands.js', 'utf8');
    expect(quelle).toContain('if (!oeffneCanvasSuche(state.activePaneIndex)) openSearchBar();');
    // AK8: Der Ersetzen-Weg und die übrigen Such-Kommandos sind nicht berührt.
    expect(quelle).toContain('openSearchBar({ replaceMode: true })');
  });

  it('die Suche selbst ist unberührt: kein Canvas-Zweig, kein vierter Lieferant', () => {
    // AK13 und die benannte Grenze des Tasks. Geprüft am Quelltext, weil die
    // Zusage gerade lautet, dass dort nichts steht.
    for (const datei of ['search.js', 'search-run.js', 'search-jump.js']) {
      const quelle = readFileSync('src/renderer/modules/search/' + datei, 'utf8');
      expect(quelle.toLowerCase()).not.toContain('canvas');
    }
    const lauf = readFileSync('src/renderer/modules/search/search-run.js', 'utf8');
    expect(lauf).toContain('export function registriereLieferant');
  });
});
