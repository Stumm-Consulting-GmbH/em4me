// @vitest-environment jsdom
// 4T-001770 (Epic 3E-000290): Die Bedienung der Canvas-Fläche ohne Maus aus der
// Karten-Liste heraus (Story 4S-000949).
//
// **Geprüft wird gegen die echte Kette**, wie schon in `canvas-liste.test.js`
// und aus demselben Grund: Gegenstand dieses Tasks ist gerade das
// Zusammenspiel von Panel, Einbettung, Ansicht, Bedienung und Kontextmenü. Eine
// nachgebaute Ansicht bewiese allein, dass das Panel die nachgebaute
// Schnittstelle bedient.
//
// Das Dokument wird hier zusätzlich **wirklich geschrieben**: Der gestellte
// Schreibweg ersetzt den Zeilen-Bereich im Text, wie es der Editor täte. Ohne
// das ließe sich weder das Löschen noch die neue Verbindung an ihrem Ergebnis
// prüfen, sondern nur an dem, was die Fläche vorhatte.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

for (const pane of document.querySelectorAll('.pane-group')) {
  pane.innerHTML = `
    <section class="sidebar-section sidebar-canvaslist">
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

const { applyCanvasListVisibility, starteCanvasVerbindung } =
  await import('../../../src/renderer/modules/panels/panel-canvas-liste.js');
const { destroyCanvas, initCanvasPane, renderCanvas } =
  await import('../../../src/renderer/modules/canvas/canvas-pane.js');
const { getPaneEls, state } = await import('../../../src/renderer/modules/app/app-state.js');

const FENCE = (rumpf) => '```perspective-canvas\n' + rumpf + '\n```';
// Eine Fläche mit allen drei Element-Arten und einer Verbindung; die
// Reihenfolge der Fence ist die erwartete Reihenfolge der Liste (G3).
const RUMPF = [
  '!karte k1 x=0 y=0 b=200 h=100',
  '# Erste Karte',
  '!form f1 x=300 y=0 b=80 h=80 art=oval',
  'Ein Oval',
  '!karte k2 x=0 y=300 b=200 h=100',
  '# Zweite Karte',
  '!linie l1 k1 -> k2',
  'haengt zusammen',
  '!gruppe g1 x=-20 y=-20 b=600 h=600',
  'Alles zusammen',
].join('\n');

let tab;
let menues;
let schreibvorgaenge;

// Der gestellte Schreibweg des Editors: Er ersetzt den Zeilen-Bereich im
// Dokument-Text, wie es die Transaktion der Spalte täte.
function schreibeDokument(paneIdx, { vonZeile, bisZeile, text }) {
  const zeilen = tab.content.split('\n');
  zeilen.splice(vonZeile - 1, bisZeile - vonZeile + 1, ...text.split('\n'));
  tab.content = zeilen.join('\n');
  schreibvorgaenge.push(text);
  return true;
}

function baueSpalte(inhalt = FENCE(RUMPF), opts = {}) {
  wechsel.length = 0;
  hinweise.length = 0;
  menues = [];
  schreibvorgaenge = [];
  destroyCanvas(0);
  tab = { viewMode: opts.viewMode || 'canvas', content: inhalt, path: 'F.md', ...opts };
  const els = getPaneEls(0);
  els.canvasEl.innerHTML = '';
  initCanvasPane({
    getPaneEls: () => els,
    aktivesDokument: () => tab,
    istAenderbar: () => opts.aenderbar !== false,
    schreibeDokument,
    zeigeKontextmenue: (paneIdx, daten) => menues.push(daten),
    schliesseKontextmenue: () => {},
    kontextmenueOffen: () => false,
  });
  state.canvasList.visibleByPane[0] = true;
  renderCanvas(0);
  applyCanvasListVisibility(0);
  return els;
}

const liste = () => getPaneEls(0).canvasListList;
const zeilen = () => [...liste().querySelectorAll('[data-canvas-id]')];
const kennungen = () => zeilen().map((z) => z.dataset.canvasId);
const zeile = (id) => liste().querySelector(`[data-canvas-id="${id}"]`);
const statusText = () => getPaneEls(0).canvasListStatus.textContent;
const gewaehltInListe = () => {
  const el = liste().querySelector('.selected');
  return el ? el.dataset.canvasId : null;
};
const eintraege = (menue) => menue.eintraege.filter((e) => !e.separator).map((e) => e.dataId);

// Ein Tastendruck dort, wo der Fokus gerade steht — der Weg des Anwenders.
function taste(key, opts = {}) {
  const ziel = document.activeElement || document.body;
  ziel.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

// Ein Durchlauf der Ereignis-Schleife. Nötig, wo die Kette über ein
// Versprechen läuft: der Statusleisten-Hinweis der Einbettung (Laufzeit-Import)
// und das Öffnen des Panels vor der Ziel-Wahl.
const gleich = () => new Promise((fertig) => setTimeout(fertig, 0));

function fokusKennung() {
  const el = document.activeElement;
  return el && el.dataset ? el.dataset.canvasId || null : null;
}

// Der Einstieg mit der Tastatur: erste Zeile anklicken, danach läuft alles
// über Tasten. Der Klick steht für das, was der Anwender mit Tab oder Maus
// tut — er bringt den Fokus in die Liste.
function beginneBei(id) {
  zeile(id).click();
  return fokusKennung();
}

beforeEach(() => {
  state.canvasList.visibleByPane[0] = false;
  state.canvasList.visibleByPane[1] = false;
});

describe('Karten-Liste: Wandern mit den Tasten (AK1, AK8, AK11, AK13)', () => {
  it('Pfeiltasten wandern Zeile für Zeile, die Auswahl wandert auf der Fläche mit', () => {
    baueSpalte();
    expect(beginneBei('k1')).toBe('k1');
    // Die Reihenfolge schließt die Verbindungs-Zeilen ein: Sie stehen unter
    // ihrer Karte und sind mit den Pfeiltasten erreichbar (F2, F3).
    expect(kennungen()).toEqual(['k1', 'l1', 'f1', 'k2', 'l1', 'g1']);
    taste('ArrowDown');
    expect(fokusKennung()).toBe('l1');
    expect(gewaehltInListe()).toBe('l1');
    taste('ArrowDown');
    expect(fokusKennung()).toBe('f1');
    // Und die Fläche folgt: Die Form ist dort gewählt, die Karte nicht mehr.
    const flaeche = getPaneEls(0).canvasEl;
    expect(
      flaeche.querySelector('.canvas-form[data-canvas-id="f1"]').getAttribute('class'),
    ).toContain('canvas-form-gewaehlt');
    expect(
      flaeche
        .querySelector('.canvas-karte[data-canvas-id="k1"]')
        .classList.contains('canvas-karte-gewaehlt'),
    ).toBe(false);
    taste('ArrowUp');
    expect(fokusKennung()).toBe('l1');
  });

  it('auf der zweiten Zeile derselben Verbindung bleibt der Fokus dort stehen', () => {
    // Die Verbindung steht zweimal in der Liste — unter jeder ihrer Karten.
    // Ohne die Stelle als Anschrift spränge der Fokus nach dem Zeichnen auf
    // die erste der beiden zurück.
    baueSpalte();
    beginneBei('k2');
    taste('ArrowDown');
    expect(zeilen().indexOf(document.activeElement)).toBe(4);
    expect(fokusKennung()).toBe('l1');
  });

  it('Pos1 und Ende springen an Anfang und Ende', () => {
    baueSpalte();
    beginneBei('f1');
    taste('End');
    expect(fokusKennung()).toBe('g1');
    taste('Home');
    expect(fokusKennung()).toBe('k1');
  });

  it('Escape hebt die Auswahl auf; der Fokus bleibt in der Liste', () => {
    baueSpalte();
    beginneBei('k2');
    expect(gewaehltInListe()).toBe('k2');
    taste('Escape');
    expect(gewaehltInListe()).toBe(null);
    expect(fokusKennung()).toBe('k2');
    expect(
      getPaneEls(0)
        .canvasEl.querySelector('.canvas-karte[data-canvas-id="k2"]')
        .classList.contains('canvas-karte-gewaehlt'),
    ).toBe(false);
  });

  it('außerhalb der Liste greifen die Tasten nicht', () => {
    baueSpalte();
    beginneBei('k1');
    const vorher = kennungen().indexOf('k1');
    // Derselbe Tastendruck auf der Fläche: Sie hat ihre eigene Bedeutung für
    // Entf und Escape, und die Liste mischt sich nicht ein (AK11).
    getPaneEls(0)
      .canvasEl.querySelector('.canvas-karte[data-canvas-id="k1"]')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(zeilen().indexOf(document.activeElement)).toBe(vorher);
  });

  it('die Liste trägt Listen-Rollen und je Zeile einen sprechenden Namen', () => {
    baueSpalte();
    expect(liste().getAttribute('role')).toBe('listbox');
    for (const z of zeilen()) expect(z.getAttribute('role')).toBe('option');
    // Ohne geladenen Katalog liefert `t` den Schlüssel; der Name ist damit die
    // Art plus die Beschriftung der Zeile.
    expect(zeile('k1').getAttribute('aria-label')).toBe('canvas.liste.karte: Erste Karte');
    expect(zeile('l1').getAttribute('aria-label')).toBe('canvas.liste.verbindungZu');
  });
});

describe('Karten-Liste: Bearbeiten und Löschen (AK2, AK3, AK9)', () => {
  it('die Eingabetaste öffnet die Rohtext-Eingabe jeder Element-Art', () => {
    const els = baueSpalte();
    const offen = (wahl) => els.canvasEl.querySelector(wahl);
    beginneBei('k1');
    taste('Enter');
    expect(offen('.canvas-karte-eingabe').value).toBe('# Erste Karte');
    taste('Escape');
    beginneBei('f1');
    taste('Enter');
    expect(offen('.canvas-form-eingabe').value).toBe('Ein Oval');
    taste('Escape');
    beginneBei('g1');
    taste('Enter');
    expect(offen('.canvas-gruppe-eingabe').value).toBe('Alles zusammen');
    taste('Escape');
    beginneBei('l1');
    taste('Enter');
    expect(offen('.canvas-linie-eingabe').value).toBe('haengt zusammen');
  });

  it('nach dem Bestätigen der Eingabe steht der Fokus wieder in der Liste', async () => {
    const els = baueSpalte();
    beginneBei('k1');
    taste('Enter');
    const eingabe = els.canvasEl.querySelector('.canvas-karte-eingabe');
    eingabe.value = '# Frisch benannt';
    eingabe.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    // Der Rückweg wartet einen Zyklus: Die Übernahme holt den Fokus zuerst auf
    // die Fläche, und erst danach gehört er wieder der Liste.
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(fokusKennung()).toBe('k1');
    expect(tab.content).toContain('# Frisch benannt');
    // Eine Handlung, eine Übernahme — und damit ein Rückgängig-Schritt (AK9).
    expect(schreibvorgaenge).toHaveLength(1);
  });

  it('die Entfernen-Taste löscht die Karte samt ihrer Verbindungen', () => {
    baueSpalte();
    beginneBei('k1');
    taste('Delete');
    expect(kennungen()).toEqual(['f1', 'k2', 'g1']);
    // Die Lösch-Regel des Kerns nimmt die Verbindung mit; sie hätte sonst nur
    // noch ein Ende.
    expect(tab.content).not.toContain('!linie l1');
    expect(schreibvorgaenge).toHaveLength(1);
    // Der Fokus geht an die Stelle, an der die Zeile stand — dort steht jetzt
    // die nächste.
    expect(fokusKennung()).toBe('f1');
  });

  it('die Entfernen-Taste löscht ebenso eine Verbindung allein', () => {
    baueSpalte();
    beginneBei('k1');
    taste('ArrowDown');
    taste('Delete');
    expect(kennungen()).toEqual(['k1', 'f1', 'k2', 'g1']);
    expect(tab.content).toContain('!karte k1');
  });
});

describe('Karten-Liste: das Kontextmenü per Taste (AK4, AK5)', () => {
  it('die Menü-Taste öffnet für das gewählte Element das bestehende Menü', () => {
    baueSpalte();
    beginneBei('k1');
    taste('ContextMenu');
    expect(menues).toHaveLength(1);
    // Genau die Einträge des Rechtsklicks auf diese Karte — eine zweite
    // Handlungs-Liste entsteht nicht (B6, F3).
    expect(eintraege(menues[0])).toEqual([
      'canvas-card-edit',
      'canvas-card-delete',
      'canvas-card-connect',
      'canvas-card-link-set',
      'canvas-card-image-set',
      'canvas-stack-ganzNachVorn',
      'canvas-stack-eineStufeVor',
      'canvas-stack-eineStufeZurueck',
      'canvas-stack-ganzNachHinten',
    ]);
  });

  it('Umschalt+F10 tut dasselbe, und jede Art bekommt ihre eigenen Einträge', () => {
    baueSpalte();
    beginneBei('f1');
    taste('F10', { shiftKey: true });
    expect(eintraege(menues[0])).toContain('canvas-shape-label');
    beginneBei('l1');
    taste('ContextMenu');
    expect(eintraege(menues[1])).toEqual([
      'canvas-line-direction',
      'canvas-line-reverse',
      'canvas-line-label',
      'canvas-line-delete',
    ]);
  });

  it('ohne gewähltes Element öffnet sie das Menü der Fläche, und es legt mittig an', () => {
    const els = baueSpalte();
    // Der Fokus steht auf dem Status-Bereich des Panels, nicht auf einer Zeile.
    els.canvasListStatus.tabIndex = -1;
    els.canvasListStatus.focus();
    taste('ContextMenu');
    expect(eintraege(menues[0])).toEqual([
      'canvas-add-card',
      'canvas-add-shape',
      'canvas-add-group',
      'canvas-add-link-card',
      'canvas-add-image-card',
    ]);
    // Die Lage-Regel ohne Zeiger: mittig auf die Mitte des sichtbaren
    // Ausschnitts, und keine zweite Regel daneben. Wo diese Mitte liegt, sagt
    // die gemeinsame Verschiebung der Ebene; in jsdom misst die Bühne 0 × 0.
    const verschiebung = els.canvasEl.querySelector('.canvas-karten').style.transform;
    const [, tx, ty] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(verschiebung);
    const skala = Number(/scale\(([-\d.]+)\)/.exec(verschiebung)[1]);
    menues[0].eintraege.find((e) => e.dataId === 'canvas-add-card').action();
    const mitte = (wert) => Math.round(-Number(wert) / skala);
    expect(tab.content).toContain(`!karte k3 x=${mitte(tx) - 120} y=${mitte(ty) - 60} b=240 h=120`);
  });
});

describe('Karten-Liste: Ziel-Wahl einer neuen Verbindung (AK6, AK7)', () => {
  // Der Weg des Anwenders: Kontextmenü an der Karte, Eintrag «Verbindung
  // anlegen…». Er öffnet das Panel, falls es zu ist — deshalb der Durchlauf.
  async function starteUeberMenue() {
    beginneBei('k1');
    taste('ContextMenu');
    menues[menues.length - 1].eintraege.find((e) => e.dataId === 'canvas-card-connect').action();
    await gleich();
  }

  it('die Ziel-Wahl läuft von der Karte über die Gegenstelle zur Verbindung', async () => {
    baueSpalte();
    await starteUeberMenue();
    // Sie ist erkennbar: Die Liste sagt, was sie will, und trägt es als
    // Zustand (AK7).
    expect(statusText()).toBe('canvas.liste.zielWahl');
    expect(getPaneEls(0).canvasListSection.classList.contains('ziel-wahl')).toBe(true);
    // Gewählt wird unter den Karten, und die Ausgangs-Karte ist keine: Die
    // erste Gegenstelle steht sofort bereit.
    expect(fokusKennung()).toBe('k2');
    taste('Enter');
    expect(getPaneEls(0).canvasListSection.classList.contains('ziel-wahl')).toBe(false);
    // Zwei Verbindungen zwischen k1 und k2: die alte und die neue.
    expect(tab.content).toContain('!linie e1 k1 -> k2');
    expect(schreibvorgaenge).toHaveLength(1);
  });

  it('die übrigen Tasten der Liste ruhen, solange die Wahl läuft', async () => {
    baueSpalte();
    await starteUeberMenue();
    const vorher = menues.length;
    taste('Delete');
    taste('ContextMenu');
    expect(menues).toHaveLength(vorher);
    expect(schreibvorgaenge).toHaveLength(0);
    expect(kennungen()).toContain('k2');
    taste('Escape');
  });

  it('Escape bricht ab und stellt den Stand davor wieder her', async () => {
    baueSpalte();
    await starteUeberMenue();
    taste('Escape');
    expect(getPaneEls(0).canvasListSection.classList.contains('ziel-wahl')).toBe(false);
    expect(statusText()).toBe('canvas.liste.elemente');
    // Der Stand davor: die Ausgangs-Karte ist wieder gewählt, geschrieben
    // wurde nichts.
    expect(gewaehltInListe()).toBe('k1');
    expect(fokusKennung()).toBe('k1');
    expect(schreibvorgaenge).toHaveLength(0);
  });

  it('das Kommando startet die Wahl an der gewählten Karte und sagt, wenn es nicht geht', async () => {
    baueSpalte();
    // Ohne gewählte Karte gibt es keinen Ausgangspunkt — und es wird gesagt.
    await starteCanvasVerbindung(0);
    expect(hinweise).toEqual(['canvas.liste.keineKarte']);
    beginneBei('k1');
    await starteCanvasVerbindung(0);
    expect(getPaneEls(0).canvasListSection.classList.contains('ziel-wahl')).toBe(true);
    // Ein Klick auf eine Karten-Zeile bestätigt ebenso wie die Eingabetaste.
    zeile('k2').click();
    expect(tab.content).toContain('!linie e1 k1 -> k2');
  });

  it('ohne zweite Karte entsteht keine Wahl, und es wird gesagt', async () => {
    baueSpalte(FENCE('!karte k1 x=0 y=0 b=100 h=50\n# Allein'));
    beginneBei('k1');
    await starteCanvasVerbindung(0);
    expect(hinweise).toEqual(['canvas.liste.keinZiel']);
    expect(getPaneEls(0).canvasListSection.classList.contains('ziel-wahl')).toBe(false);
  });
});

describe('Karten-Liste: nicht änderbares Dokument (AK10)', () => {
  it('wandern und wählen bleiben, bearbeiten, löschen und das Menü nicht', async () => {
    const els = baueSpalte(FENCE(RUMPF), { aenderbar: false });
    beginneBei('k1');
    taste('ArrowDown');
    expect(fokusKennung()).toBe('l1');
    taste('Enter');
    expect(els.canvasEl.querySelector('.canvas-linie-eingabe')).toBeNull();
    taste('Delete');
    expect(kennungen()).toEqual(['k1', 'l1', 'f1', 'k2', 'l1', 'g1']);
    taste('ContextMenu');
    // Das Kontextmenü bleibt ohne Einträge und erscheint deshalb gar nicht (E3).
    expect(menues).toHaveLength(0);
    expect(schreibvorgaenge).toHaveLength(0);
    // Ein stiller Fehlschlag ist keine der drei Tasten: Sie laufen über den
    // gemeinsamen Eintritt `anDerFlaeche`, der den Anzeige-Modus sagt. Dessen
    // Hinweis geht über den Laufzeit-Import der Einbettung und ist **hier**
    // nicht messbar (dieser Prüffall lädt views.js echt, damit das Panel seine
    // übrigen Wege hat, und der Laufzeit-Import trifft dann dieselbe echte
    // Fassung); gemessen wird er in `canvas-pane.test.js`. Der eigene Hinweis
    // des Panels läuft dagegen über den festen Import und steht hier:
    await starteCanvasVerbindung(0);
    expect(hinweise).toEqual(['canvas.nurLesbar']);
  });
});
