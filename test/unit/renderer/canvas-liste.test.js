// @vitest-environment jsdom
// 4T-001769 (Epic 3E-000290): Die Karten-Liste einer Canvas-Fläche und ihre
// Kopplung an die Fläche (Story 4S-000948).
//
// **Geprüft wird gegen die echte Ansicht, nicht gegen eine Attrappe.** Die
// Kopplung ist der Gegenstand dieses Tasks; eine nachgebaute Ansichts-Instanz
// bewiese allein, dass das Panel die nachgebaute Schnittstelle bedient. Die
// Einbettung wird deshalb wie in `canvas-pane.test.js` mit einem gestellten
// Fenster-Zustand verdrahtet (`initCanvasPane`), und darüber laufen Fläche,
// Auswahl und Ausschnitt real.
//
// Gestellt sind nur die drei Funktionen der Ansichts-Ebene, die außerhalb
// dieses Vorgangs liegen: der Moduswechsel, der Statusleisten-Hinweis und das
// Schreiben einer Einstellung.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

// Das Grundgerüst des Stubs kennt weder das Panel noch den Container der
// Fläche; beide kommen hier dazu, bevor app-state.js seine Element-Verweise
// baut (das geschieht beim ersten getPaneEls, also nach diesem Einschub).
for (const pane of document.querySelectorAll('.pane-group')) {
  pane.innerHTML = `
    <section class="sidebar-section sidebar-canvaslist">
      <div class="canvas-liste-status"></div>
      <div class="canvas-liste"></div>
    </section>
    <div class="pane-canvas"></div>`;
}

// jsdom kennt scrollIntoView nicht. Das Panel hält die gewählte Zeile sichtbar;
// für die geprüfte Kopplung ist das ohne Belang.
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

const { applyCanvasListVisibility } =
  await import('../../../src/renderer/modules/panels/panel-canvas-liste.js');
const { destroyCanvas, initCanvasPane, renderCanvas } =
  await import('../../../src/renderer/modules/canvas/canvas-pane.js');
const { getPaneEls, state } = await import('../../../src/renderer/modules/app/app-state.js');

const FENCE = (rumpf) => '```perspective-canvas\n' + rumpf + '\n```';
// Eine Fläche mit allen drei Element-Arten und einer Verbindung. Die
// Reihenfolge in der Fence ist die Stapel-Reihenfolge (G3) und damit die
// erwartete Reihenfolge der Liste.
const RUMPF = [
  '!karte k1 x=0 y=0 b=200 h=100',
  '# Erste Karte',
  '!form f1 x=300 y=0 b=80 h=80 art=oval',
  'Ein Oval',
  '!karte k2 x=0 y=300 b=200 h=100',
  '# Zweite Karte',
  '!linie l1 k1 -> k2',
  'hängt zusammen',
  '!gruppe g1 x=-20 y=-20 b=600 h=600',
  'Alles zusammen',
].join('\n');

let tab;

// Baut Spalte 0 mit offener Canvas-Ansicht und eingeblendetem Panel.
function baueSpalte(inhalt = FENCE(RUMPF), opts = {}) {
  wechsel.length = 0;
  hinweise.length = 0;
  destroyCanvas(0);
  tab = { viewMode: opts.viewMode || 'canvas', content: inhalt, path: 'F.md', ...opts };
  const els = getPaneEls(0);
  els.canvasEl.innerHTML = '';
  initCanvasPane({
    getPaneEls: () => els,
    aktivesDokument: () => tab,
    istAenderbar: () => opts.aenderbar !== false,
    schreibeDokument: () => true,
  });
  state.canvasList.visibleByPane[0] = true;
  renderCanvas(0);
  // Außerhalb der Canvas-Ansicht zeichnet die Fläche nicht und meldet deshalb
  // auch nichts; das Panel zeichnet dann über seinen eigenen Weg.
  applyCanvasListVisibility(0);
  return els;
}

function zeilen() {
  return [...getPaneEls(0).canvasListList.querySelectorAll('.canvas-liste-eintrag')];
}

function zeile(id) {
  return getPaneEls(0).canvasListList.querySelector(
    `.canvas-liste-eintrag[data-canvas-id="${id}"]`,
  );
}

function statusText() {
  return getPaneEls(0).canvasListStatus.textContent;
}

function karteAufDerFlaeche(id) {
  return getPaneEls(0).canvasEl.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
}

beforeEach(() => {
  state.canvasList.visibleByPane[0] = false;
  state.canvasList.visibleByPane[1] = false;
});

describe('Karten-Liste: Anzeige der Fläche (AK2, AK7)', () => {
  it('führt alle Elemente der gezeigten Fläche in Fence-Reihenfolge', () => {
    baueSpalte();
    expect(zeilen().map((z) => z.dataset.canvasId)).toEqual(['k1', 'f1', 'k2', 'g1']);
    // Die Art steht als Klasse an der Zeile — daran hängt die farbige Marke,
    // an der sich Karte, Form und Gruppe unterscheiden lassen (AK2 der Story).
    expect(zeile('k1').classList.contains('canvas-liste-karte')).toBe(true);
    expect(zeile('f1').classList.contains('canvas-liste-form')).toBe(true);
    expect(zeile('g1').classList.contains('canvas-liste-gruppe')).toBe(true);
    // Ohne geladenen Katalog liefert `t` den Schlüssel; geprüft ist damit die
    // Wahl der Mehrzahl-Zeile, und die Zahl selbst steckt in der Liste darüber.
    expect(statusText()).toBe('canvas.liste.elemente');
    baueSpalte(FENCE('!karte k1 x=0 y=0 b=100 h=50\n# Allein'));
    expect(statusText()).toBe('canvas.liste.element');
  });

  it('zeigt unter jeder Karte ihre Verbindungen mit Gegenstelle und Richtung', () => {
    baueSpalte();
    const liste = getPaneEls(0).canvasListList;
    const verbindungen = [...liste.querySelectorAll('.canvas-liste-verbindung')];
    // Die Verbindung hängt an beiden Karten — einmal ausgehend, einmal
    // eingehend — und steht jeweils unmittelbar unter ihrer Zeile.
    expect(verbindungen).toHaveLength(2);
    expect(verbindungen[0].previousElementSibling.dataset.canvasId).toBe('k1');
    expect(verbindungen[0].title).toBe('canvas.liste.verbindungZu');
    expect(verbindungen[1].previousElementSibling.dataset.canvasId).toBe('k2');
    expect(verbindungen[1].title).toBe('canvas.liste.verbindungVon');
    expect(verbindungen[0].querySelector('.canvas-liste-pfeil').textContent).toBe('→');
  });

  it('ohne Fläche und bei leerer Fläche steht ein eigener Hinweis statt einer Liste', () => {
    baueSpalte('# Nur ein Dokument, ohne Fläche.');
    expect(zeilen()).toHaveLength(0);
    expect(statusText()).toBe('canvas.keineFence');
    baueSpalte(FENCE(''));
    expect(zeilen()).toHaveLength(0);
    expect(statusText()).toBe('canvas.liste.leer');
  });

  it('eine Verweis-Karte nennt ihr Ziel neben ihrer Beschriftung', () => {
    baueSpalte(FENCE('!karte k1 x=0 y=0 b=100 h=50 doc="Import.md#Zielbild"\n# Mit Verweis'));
    expect(zeile('k1').querySelector('.canvas-liste-text').textContent).toBe('Mit Verweis');
    expect(zeile('k1').querySelector('.canvas-liste-ziel').textContent).toBe('Import.md#Zielbild');
  });
});

describe('Karten-Liste: Kopplung an die Auswahl (AK5, AK6, AK8)', () => {
  it('eine Auswahl auf der Fläche ist in der Liste hervorgehoben', () => {
    baueSpalte();
    expect(zeilen().some((z) => z.classList.contains('selected'))).toBe(false);
    // Der echte Weg der Fläche: ein Klick auf die Karte wählt sie aus und
    // meldet den Wechsel — ohne das Dokument anzufassen.
    karteAufDerFlaeche('k2').dispatchEvent(
      new window.MouseEvent('mousedown', { bubbles: true, button: 0 }),
    );
    expect(zeile('k2').classList.contains('selected')).toBe(true);
    expect(zeile('k2').getAttribute('aria-selected')).toBe('true');
    expect(zeile('k1').classList.contains('selected')).toBe(false);
  });

  it('eine Auswahl in der Liste ist auf der Fläche hervorgehoben', () => {
    baueSpalte();
    zeile('k2').click();
    expect(karteAufDerFlaeche('k2').classList.contains('canvas-karte-gewaehlt')).toBe(true);
    expect(karteAufDerFlaeche('k1').classList.contains('canvas-karte-gewaehlt')).toBe(false);
    // Und das Panel führt keinen zweiten Zustand daneben: Die Hervorhebung in
    // der Liste ist das Abbild der einen Auswahl der Fläche.
    expect(zeile('k2').classList.contains('selected')).toBe(true);
  });

  it('wählt auch Form, Gruppe und Verbindung über dieselbe eine Auswahl', () => {
    baueSpalte();
    zeile('f1').click();
    expect(zeile('f1').classList.contains('selected')).toBe(true);
    zeile('g1').click();
    expect(zeile('g1').classList.contains('selected')).toBe(true);
    // Genau ein Element ist gewählt (V3): Die Gruppe hat die Form abgelöst.
    expect(zeile('f1').classList.contains('selected')).toBe(false);
    // Und die Verbindung unter der Karte greift auf denselben Weg: Sie ist
    // gewählt, die Gruppe hat abgegeben.
    getPaneEls(0).canvasListList.querySelector('.canvas-liste-verbindung').click();
    expect(
      getPaneEls(0)
        .canvasEl.querySelector('.canvas-linie[data-canvas-id="l1"]')
        .getAttribute('class'),
    ).toContain('canvas-linie-gewaehlt');
    expect(zeile('g1').classList.contains('selected')).toBe(false);
  });

  it('rückt das gewählte Element zentriert in den Ausschnitt, ohne den Zoom zu ändern', () => {
    const els = baueSpalte();
    const ansicht = els.canvasEl;
    // Die Vergrößerung vor und nach der Wahl lesen: Sie muss unverändert
    // bleiben (AK6) — ein Einpassen skalierte die Fläche neu.
    const vorher = ansicht.querySelector('.canvas-karten').style.transform;
    zeile('k2').click();
    const nachher = ansicht.querySelector('.canvas-karten').style.transform;
    expect(nachher).not.toBe(vorher);
    const massstab = (wert) => /scale\(([-\d.]+)\)/.exec(wert)[1];
    expect(massstab(nachher)).toBe(massstab(vorher));
    // Der Mittelpunkt der Karte (100 | 350) liegt danach in der Mitte des
    // Ausschnitts; in jsdom misst die Bühne 0 × 0, die Mitte ist also 0 | 0.
    const skala = Number(massstab(nachher));
    const [, tx, ty] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(nachher);
    expect(Number(tx)).toBeCloseTo(-100 * skala, 5);
    expect(Number(ty)).toBeCloseTo(-350 * skala, 5);
  });

  it('das Bestätigen führt in die Canvas-Ansicht, wenn das Dokument dort nicht steht', () => {
    baueSpalte(FENCE(RUMPF), { viewMode: 'rendered' });
    // Die Liste steht auch außerhalb der Ansicht; erst das Bestätigen führt
    // dorthin (E9 gibt sie frei, weil das Dokument eine Fläche trägt).
    expect(zeilen()).toHaveLength(4);
    zeile('k1').click();
    expect(wechsel).toEqual(['canvas']);
    expect(hinweise).toHaveLength(0);
  });

  it('gibt E9 die Ansicht nicht frei, geschieht nichts — und es wird gesagt, warum', () => {
    // Eine System-Seite kennt keine Ansichts-Modi; die Canvas-Ansicht ist dort
    // nicht verfügbar (Muster der Guards der Canvas-Kommandos).
    baueSpalte(FENCE(RUMPF), { viewMode: 'rendered', systemPage: 'einstellungen' });
    zeile('k1').click();
    expect(wechsel).toHaveLength(0);
    expect(hinweise).toEqual(['canvas.liste.keinWechsel']);
  });
});

describe('Karten-Liste: Nur-Ansicht und Aktualisierung (AK9, AK11)', () => {
  it('im nicht änderbaren Dokument zeigt und wählt die Liste, ohne zu schreiben', () => {
    const els = baueSpalte(FENCE(RUMPF), { aenderbar: false });
    expect(els.canvasListSection.classList.contains('nur-ansicht')).toBe(true);
    zeile('k1').click();
    // Auswählen fasst das Dokument nicht an und bleibt deshalb erlaubt
    // (Fortschreibung von E3 vom 2026-09-10).
    expect(zeile('k1').classList.contains('selected')).toBe(true);
    expect(tab.content).toBe(FENCE(RUMPF));
    // Und die Fläche bietet dort keine schreibende Handlung an: Der Griff für
    // die Größen-Änderung entsteht gar nicht erst.
    expect(karteAufDerFlaeche('k1').querySelector('.canvas-karte-griff')).toBeNull();
  });

  it('eine Änderung auf der Fläche erscheint ohne erneutes Öffnen', () => {
    baueSpalte();
    expect(zeilen()).toHaveLength(4);
    tab.content = FENCE(RUMPF + '\n!karte k3 x=700 y=700 b=100 h=50\n# Dritte Karte');
    renderCanvas(0);
    expect(zeilen().map((z) => z.dataset.canvasId)).toEqual(['k1', 'f1', 'k2', 'g1', 'k3']);
    expect(zeile('k3').querySelector('.canvas-liste-text').textContent).toBe('Dritte Karte');
  });

  it('die Liste wechselt mit der gezeigten Fläche', () => {
    const zweite = FENCE('!karte z1 x=0 y=0 b=100 h=50\n# Andere Fläche');
    const els = baueSpalte(FENCE(RUMPF) + '\n\nDazwischen\n\n' + zweite);
    expect(zeilen().map((z) => z.dataset.canvasId)).toEqual(['k1', 'f1', 'k2', 'g1']);
    // Der zweite Reiter der Flächen-Leiste; sein Klick wechselt die gezeigte
    // Fläche, ohne das Dokument anzufassen (E10).
    els.canvasEl.querySelectorAll('.canvas-reiter')[1].click();
    expect(zeilen().map((z) => z.dataset.canvasId)).toEqual(['z1']);
  });
});
