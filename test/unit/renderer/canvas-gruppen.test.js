// @vitest-environment jsdom
// 4T-001702 (Epic 3E-000288): Prüffälle der Gruppen auf der Canvas-Fläche —
// Zeichnung von Rahmen, Tönung und Beschriftung, die Durchlässigkeit des
// Innenraums, das Verschieben **samt Mitgliedern**, Größe-Ändern ohne
// Verschiebung, Löschen ohne Mitglieder-Verlust, Anlegen ganz hinten über
// beide Wege, Leiste, Kontextmenü, die vier Stapel-Befehle und der
// Nur-Ansicht-Zustand.
//
// Geprüft wird an der zusammengesetzten Ansicht (`createCanvasView`) und nicht
// an der Bedienung allein: Der Gegenstand ist die Handlung des Nutzers, und die
// beginnt an einem gezeichneten Element. Der Schreibweg endet hier an einem
// Rückruf-Doppel — die Einbettung in das Dokument prüft canvas-pane.test.js,
// die reine Mitgliedschafts-Rechnung canvas-geometrie.test.js.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt
// (Muster canvas-formen.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasFlaechenTitel, parseCanvasFence } from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Die Gruppe g1 spannt -200..200 waagerecht und -150..150 senkrecht. Darin
// liegen die Karte k1 und die Form s1 **vollständig**, die Karte k2 liegt weit
// draußen; die Verbindung e1 hängt an beiden Karten. Diese Aufstellung ist der
// Prüfstein des ganzen Tasks: Ohne das Element draußen fiele jede Aussage über
// die Mitgliedschaft zufällig grün aus.
const RUMPF = [
  '!gruppe g1 x=-200 y=-150 b=400 h=300 farbe=blau',
  'Ausgangslage',
  '',
  '!karte k1 x=-150 y=-100 b=200 h=100',
  'Drinnen',
  '',
  '!karte k2 x=400 y=-100 b=200 h=100',
  'Draußen',
  '',
  '!form s1 x=-150 y=20 b=180 h=120 art=oval',
  'Auch drinnen',
  '',
  '!linie e1 k1 -> k2',
].join('\n');

function flaechenAus(rumpf) {
  const model = parseCanvasFence(rumpf);
  return [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, nummer: 1, rumpf }];
}

function baueAnsicht(rumpf = RUMPF, { aenderbar = true } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const menue = { offen: false, eintraege: [] };
  const zustand = { aenderbar };
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
    istAenderbar: () => zustand.aenderbar,
    beiAenderung: (daten) => {
      geschrieben.push(daten);
      return true;
    },
    zeigeKontextmenue: ({ eintraege }) => {
      Object.assign(menue, { offen: true, eintraege });
    },
    schliesseKontextmenue: () => {
      menue.offen = false;
    },
    kontextmenueOffen: () => menue.offen,
  });
  const buehne = container.querySelector('.canvas-buehne');
  // Die Bühne hat in jsdom kein Layout; ein Sichtfenster wird deshalb gestellt.
  buehne.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    right: 800,
    bottom: 400,
  });
  view.setFlaechen(flaechenAus(rumpf), {});
  // Ausgangslage ohne Einpassung: So sind Klick-Punkt und Flächen-Koordinate
  // dieselbe Zahl, und die Erwartungen bleiben lesbar.
  view.reset();
  return { container, view, buehne, geschrieben, menue, zustand };
}

const gruppeMit = (c, id) => c.querySelector(`.canvas-gruppe[data-canvas-id="${id}"]`);
const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const formMit = (c, id) => c.querySelector(`.canvas-form[data-canvas-id="${id}"]`);
const rahmen = (c, id) => gruppeMit(c, id).querySelector('.canvas-gruppe-rahmen');
const treffer = (c, id) => gruppeMit(c, id).querySelector('.canvas-gruppe-treffer');
const gruppenText = (c, id) => gruppeMit(c, id).querySelector('.canvas-gruppe-text');
const leiste = (c) => c.querySelector('.canvas-gruppe-leiste');
const eingabe = (c) => c.querySelector('.canvas-gruppe-eingabe');
// Die Abfolge der Element-Ebene. Gefiltert auf die Elemente selbst: In
// derselben Ebene liegen auch Leisten und Eingaben, und die tragen die Kennung
// ihres Elements.
const ebenenFolge = (c) =>
  [...c.querySelector('.canvas-karten').children]
    .filter((el) =>
      ['canvas-karte', 'canvas-form', 'canvas-gruppe'].some((k) => el.classList.contains(k)),
    )
    .map((el) => el.dataset.canvasId);

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key, opts = {}) =>
  new window.KeyboardEvent('keydown', { bubbles: true, key, ...opts });

const letztesModell = (geschrieben) => parseCanvasFence(geschrieben[geschrieben.length - 1].rumpf);
const elementAus = (geschrieben, id) =>
  letztesModell(geschrieben).elemente.find((el) => el.id === id);
const lageAus = (geschrieben, id) => {
  const el = elementAus(geschrieben, id);
  return { x: el.x, y: el.y, b: el.b, h: el.h };
};
const kennungen = (menue) => menue.eintraege.filter((e) => !e.separator).map((e) => e.dataId);
const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();
const untermenue = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).submenu;

// Ein Zug mit Maus-Ereignissen; die Schwelle des Klicks liegt bei 3 Pixeln.
function ziehe(ziel, x, y, dx, dy) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: x, clientY: y }));
  window.dispatchEvent(maus('mousemove', { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(maus('mouseup', { clientX: x + dx, clientY: y + dy }));
}

function klick(ziel, x = 0, y = 0) {
  ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: x, clientY: y }));
  window.dispatchEvent(maus('mouseup', { clientX: x, clientY: y }));
}

describe('Canvas-Gruppen: Zeichnung des Rahmens (4T-001702, AK1 von 4S-000931)', () => {
  it('zeichnet die Gruppe als positionierte Hülle mit SVG darin', () => {
    const { container } = baueAnsicht();
    const huelle = gruppeMit(container, 'g1');
    expect(huelle).not.toBeNull();
    expect(huelle.style.left).toBe('-200px');
    expect(huelle.style.top).toBe('-150px');
    expect(huelle.style.width).toBe('400px');
    expect(huelle.style.height).toBe('300px');
    const svg = huelle.querySelector('.canvas-gruppe-svg');
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('300');
  });

  it('der Rahmen ist ein Rechteck, eingerückt um die halbe Strichstärke', () => {
    const { container } = baueAnsicht();
    const el = rahmen(container, 'g1');
    expect(el.tagName.toLowerCase()).toBe('rect');
    expect(el.getAttribute('x')).toBe('1');
    expect(el.getAttribute('width')).toBe('398');
  });

  it('unter dem sichtbaren Rahmen liegt ein breiter, unsichtbarer Treffer-Rahmen', () => {
    // Ohne ihn müsste der Anwender einen zwei Einheiten breiten Strich
    // treffen; das gelingt niemandem (Muster des Treffer-Pfades der Linien).
    const { container } = baueAnsicht();
    const el = treffer(container, 'g1');
    expect(Number(el.getAttribute('stroke-width'))).toBeGreaterThan(10);
    // Er steht **vor** dem sichtbaren Rahmen im Baum und verdeckt ihn nicht.
    expect(el.nextElementSibling.classList.contains('canvas-gruppe-rahmen')).toBe(true);
  });

  it('die Beschriftung steht als einfacher Text oben links im Rahmen', () => {
    const { container } = baueAnsicht();
    const text = gruppenText(container, 'g1');
    // Klartext ohne Markdown-Rendern — das bleibt der Unterschied zur Karte,
    // die hier ein <p> bekäme.
    expect(text.textContent).toBe('Ausgangslage');
    expect(text.innerHTML).not.toContain('<p>');
    expect(text.style.left === '' || text.style.left === '0px').toBe(true);
  });

  it('eine Gruppe ohne Beschriftung bekommt kein leeres Textfeld', () => {
    const { container } = baueAnsicht('!gruppe g1 x=0 y=0 b=300 h=200');
    expect(gruppenText(container, 'g1')).toBeNull();
  });

  it('zählt die Gruppen und führt sie in der gemeinsamen Element-Ebene', () => {
    const { container, view } = baueAnsicht();
    expect(view.getStats().gruppen).toBe(1);
    // Die Reihenfolge der Fence ist die Reihenfolge im Baum (G3): Die Gruppe
    // steht als erstes Element und liegt damit hinten.
    expect(ebenenFolge(container)).toEqual(['g1', 'k1', 'k2', 's1']);
    expect(view.getStats().stapel).toEqual(['g1', 'k1', 'k2', 's1']);
  });
});

describe('Canvas-Gruppen: Farbe und Tönung (AK5 von 4S-000931, F5)', () => {
  it('Rand deckend, Fläche getönt — beide über die Variable der Reiter-Gruppe', () => {
    const { container } = baueAnsicht();
    const el = rahmen(container, 'g1');
    expect(el.style.stroke).toBe('var(--tab-group-blue)');
    expect(el.style.fill).toBe('var(--tab-group-blue)');
    // Die Tönung selbst macht das Stilblatt über die Deckkraft der Fläche;
    // die Zeichnung setzt sie nicht, sonst stünde der Wert an zwei Orten.
    expect(el.style.fillOpacity).toBe('');
    expect(lies('src/renderer/styles/canvas.css')).toMatch(
      /\.canvas-gruppe-rahmen \{[^}]*fill-opacity: 0\.12;/,
    );
  });

  it('ohne Angabe bleibt die Standardfarbe des Stilblatts stehen', () => {
    const { container } = baueAnsicht('!gruppe g1 x=0 y=0 b=300 h=200');
    const el = rahmen(container, 'g1');
    expect(el.style.stroke).toBe('');
    expect(el.style.fill).toBe('');
  });

  it('ein unbekannter Farbname fällt auf die Standardfarbe zurück und bleibt Befund', () => {
    const { container, view } = baueAnsicht('!gruppe g1 x=0 y=0 b=300 h=200 farbe=beige');
    expect(rahmen(container, 'g1').style.stroke).toBe('');
    expect(view.getStats().befunde).toBe(1);
  });

  it('das Stilblatt setzt keinen eigenen Farbwert für die Gruppen', () => {
    // Gegenprobe zur Zusage «Farben ausschließlich aus Theme-Variablen»: Im
    // Gruppen-Abschnitt steht kein Hex-Wert. Der Schatten der Leiste bleibt
    // ausgenommen — er ist kein Farbwert der Gruppe, sondern dieselbe
    // schwarze Deckkraft, die jede Leiste der Fläche trägt.
    const css = lies('src/renderer/styles/canvas.css');
    const abschnitt = css.slice(css.indexOf('=== Gruppen (4T-001702'));
    const gruppenTeil = abschnitt.slice(0, abschnitt.indexOf('/* Hinweis-Zeile'));
    expect(gruppenTeil).toContain('stroke: var(--border-strong)');
    expect(gruppenTeil).toContain('fill-opacity');
    expect(gruppenTeil).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('Canvas-Gruppen: der Innenraum bleibt durchlässig (AK16 von 4S-000931)', () => {
  it('Hülle und getönte Fläche fangen keinen Zeiger, der Rand fängt ihn', () => {
    // Die Zusage steht zur Hälfte im Stilblatt; ohne sie wäre eine nach vorn
    // geholte Gruppe ein Deckel über ihrem eigenen Inhalt.
    const css = lies('src/renderer/styles/canvas.css');
    expect(css).toMatch(/\.canvas-gruppe \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.canvas-gruppe-rahmen \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\.canvas-gruppe-treffer \{[^}]*pointer-events: stroke;/);
    expect(css).toMatch(/\.canvas-gruppe-text \{[^}]*pointer-events: all;/);
  });

  it('ein Klick auf eine Karte in der Gruppe wählt die Karte, nicht die Gruppe', () => {
    const { container, view } = baueAnsicht();
    klick(karteMit(container, 'k1'), 0, 0);
    expect(view.getStats().gewaehlteKarte).toBe('k1');
    expect(view.getStats().gewaehlteGruppe).toBeNull();
  });

  it('ein Doppelklick mitten in der Gruppe legt eine Karte an', () => {
    // Der Innenraum gilt als Hintergrund der Fläche: Was dort geschieht, geht
    // die Gruppe nichts an (B1 bleibt unberührt).
    const { view, buehne, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    expect(geschrieben).toHaveLength(1);
    expect(view.getStats().karten).toBe(3);
  });
});

describe('Canvas-Gruppen: Auswahl (V3, vier Arten)', () => {
  it('ein Klick auf den Rand wählt die Gruppe und hebt jede andere Wahl auf', () => {
    const { container, view } = baueAnsicht();
    klick(karteMit(container, 'k1'), 0, 0);
    klick(treffer(container, 'g1'), 0, 0);
    const stats = view.getStats();
    expect(stats.gewaehlteGruppe).toBe('g1');
    expect(stats.gewaehlteKarte).toBeNull();
    expect(stats.gewaehlteForm).toBeNull();
    expect(gruppeMit(container, 'g1').getAttribute('aria-selected')).toBe('true');
  });

  it('die Beschriftung ist der zweite Griff', () => {
    const { container, view } = baueAnsicht();
    klick(gruppenText(container, 'g1'), 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBe('g1');
  });

  it('die Wahl einer Karte und die einer Form heben die Gruppe wieder auf', () => {
    const { container, view } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    klick(karteMit(container, 'k1'), 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBeNull();
    klick(treffer(container, 'g1'), 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBe('g1');
    klick(formMit(container, 's1').querySelector('.canvas-form-flaeche'), 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBeNull();
    expect(view.getStats().gewaehlteForm).toBe('s1');
  });

  it('ein Klick auf den Hintergrund hebt die Wahl der Gruppe auf', () => {
    const { container, view, buehne } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    klick(buehne, 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBeNull();
  });

  it('Escape hebt allein die Auswahl auf und schreibt nichts', () => {
    const { container, view, geschrieben } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    container.querySelector('.canvas-view').dispatchEvent(taste('Escape'));
    expect(view.getStats().gewaehlteGruppe).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Gruppen: Verschieben nimmt die Mitglieder mit (AK8 von 4S-000931, F4)', () => {
  it('verschiebt Gruppe, Karte und Form um dieselbe Differenz — in EINEM Schritt', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe(treffer(container, 'g1'), 0, 0, 60, 40);
    // Ein Schreib-Vorgang für den ganzen Zug: Das Rückgängig-Machen nimmt ihn
    // in einem Schritt zurück, samt aller mitgewanderten Mitglieder.
    expect(geschrieben).toHaveLength(1);
    expect(lageAus(geschrieben, 'g1')).toMatchObject({ x: -140, y: -110 });
    expect(lageAus(geschrieben, 'k1')).toMatchObject({ x: -90, y: -60 });
    expect(lageAus(geschrieben, 's1')).toMatchObject({ x: -90, y: 60 });
  });

  it('lässt ein herausragendes Element stehen', () => {
    // Die Gegenprobe, ohne die jede Aussage über die Mitgliedschaft zufällig
    // grün ausfiele: k2 liegt draußen und bleibt, wo es ist.
    const { container, geschrieben } = baueAnsicht();
    ziehe(treffer(container, 'g1'), 0, 0, 60, 40);
    expect(lageAus(geschrieben, 'k2')).toMatchObject({ x: 400, y: -100 });
  });

  it('die Anordnung der Mitglieder zueinander bleibt erhalten', () => {
    const { container, geschrieben } = baueAnsicht();
    const vorher = { x: -150 - -150, y: 20 - -100 };
    ziehe(treffer(container, 'g1'), 0, 0, 37, -23);
    const k1 = lageAus(geschrieben, 'k1');
    const s1 = lageAus(geschrieben, 's1');
    expect({ x: s1.x - k1.x, y: s1.y - k1.y }).toEqual(vorher);
  });

  it('die Mitgliedschaft wird zum Zug-Beginn bestimmt, nicht unterwegs', () => {
    // Sonst verlöre die Gruppe ihre Mitglieder in dem Augenblick, in dem sie
    // mit ihnen den eigenen Rahmen verlässt: Ein Zug über 500 Einheiten legt
    // die alte Lage der Karte weit hinter den neuen Rahmen.
    const { container, geschrieben } = baueAnsicht();
    ziehe(treffer(container, 'g1'), 0, 0, 500, 0);
    expect(lageAus(geschrieben, 'g1')).toMatchObject({ x: 300 });
    expect(lageAus(geschrieben, 'k1')).toMatchObject({ x: 350 });
  });

  it('während des Zuges wandern die Hüllen mit, geschrieben wird erst am Ende', () => {
    const { container, geschrieben } = baueAnsicht();
    const ziel = treffer(container, 'g1');
    ziel.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(maus('mousemove', { clientX: 50, clientY: 20 }));
    expect(gruppeMit(container, 'g1').style.left).toBe('-150px');
    expect(karteMit(container, 'k1').style.left).toBe('-100px');
    expect(geschrieben).toHaveLength(0);
    window.dispatchEvent(maus('mouseup', { clientX: 50, clientY: 20 }));
    expect(geschrieben).toHaveLength(1);
  });

  it('ein Klick unter der Schwelle schreibt nichts', () => {
    const { container, geschrieben } = baueAnsicht();
    ziehe(treffer(container, 'g1'), 0, 0, 1, 1);
    expect(geschrieben).toHaveLength(0);
  });

  it('eine Gruppe ohne Mitglieder lässt sich ebenso verschieben (AK11)', () => {
    const { container, geschrieben } = baueAnsicht('!gruppe g1 x=0 y=0 b=300 h=200');
    ziehe(treffer(container, 'g1'), 0, 0, 30, 30);
    expect(geschrieben).toHaveLength(1);
    expect(lageAus(geschrieben, 'g1')).toMatchObject({ x: 30, y: 30 });
  });
});

describe('Canvas-Gruppen: Größe ändern und Löschen (AK9/AK10 von 4S-000931)', () => {
  const griff = (c, id) => gruppeMit(c, id).querySelector('.canvas-gruppe-griff');

  it('das Ändern der Größe verschiebt kein Element', () => {
    const { container, geschrieben } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    ziehe(griff(container, 'g1'), 0, 0, 80, 60);
    expect(lageAus(geschrieben, 'g1')).toMatchObject({ x: -200, y: -150, b: 480, h: 360 });
    expect(lageAus(geschrieben, 'k1')).toMatchObject({ x: -150, y: -100 });
    expect(lageAus(geschrieben, 's1')).toMatchObject({ x: -150, y: 20 });
  });

  it('Entf löscht die Gruppe; ihre Mitglieder bleiben an ihrem Platz', () => {
    const { container, geschrieben } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    const modell = letztesModell(geschrieben);
    expect(modell.elemente.map((el) => el.id)).toEqual(['k1', 'k2', 's1', 'e1']);
    expect(lageAus(geschrieben, 'k1')).toMatchObject({ x: -150, y: -100 });
    expect(lageAus(geschrieben, 's1')).toMatchObject({ x: -150, y: 20 });
    // Und die Verbindung zwischen den Karten bleibt ebenfalls stehen.
    expect(modell.errors).toEqual([]);
  });
});

describe('Canvas-Gruppen: Anlegen ganz hinten über beide Wege (AK2/AK3/AK15)', () => {
  it('das Kommando legt die Gruppe in der Mitte des Ausschnitts an', () => {
    const { view, geschrieben } = baueAnsicht();
    expect(view.gruppeAnlegen()).toBe(true);
    const neu = elementAus(geschrieben, 'g2');
    // Mitte des gestellten Sichtfensters (800 × 400) bei Zoom 1 und ohne
    // Verschiebung: 400/200; die Gruppe liegt mittig darunter.
    expect(neu.x).toBe(400 - neu.b / 2);
    expect(neu.y).toBe(200 - neu.h / 2);
  });

  it('das Kontextmenü der Fläche legt sie an der Klick-Stelle an', () => {
    const { buehne, menue, geschrieben } = baueAnsicht();
    buehne.dispatchEvent(maus('contextmenu', { button: 2, clientX: 120, clientY: 60 }));
    expect(kennungen(menue)).toEqual(['canvas-add-card', 'canvas-add-shape', 'canvas-add-group']);
    loese(menue, 'canvas-add-group');
    const neu = elementAus(geschrieben, 'g2');
    expect(neu.x).toBe(120 - neu.b / 2);
    expect(neu.y).toBe(60 - neu.h / 2);
  });

  it('die neue Gruppe entsteht ganz hinten und ist gewählt', () => {
    // Sie verdeckt damit nichts (AK15). Wo «ganz hinten» in der Liste ist,
    // entscheidet der Kern und nicht die Bedienung.
    const { container, view, geschrieben } = baueAnsicht();
    view.gruppeAnlegen();
    expect(letztesModell(geschrieben).elemente[0].id).toBe('g2');
    expect(ebenenFolge(container)).toEqual(['g2', 'g1', 'k1', 'k2', 's1']);
    expect(view.getStats().gewaehlteGruppe).toBe('g2');
  });

  it('eine neue Gruppe trägt keine Farb-Angabe — die Abwesenheit ist die Vorgabe', () => {
    const { view, geschrieben } = baueAnsicht();
    view.gruppeAnlegen();
    expect(geschrieben[0].rumpf).toMatch(/!gruppe g2 x=-?\d+ y=-?\d+ b=\d+ h=\d+$/m);
  });

  it('auf einer leeren Fläche lässt sich ebenso eine anlegen (AK1)', () => {
    const { view, geschrieben } = baueAnsicht('');
    expect(view.gruppeAnlegen()).toBe(true);
    expect(elementAus(geschrieben, 'g1')).toBeTruthy();
  });
});

describe('Canvas-Gruppen: Leiste an der gewählten Gruppe (AK4/AK5 von 4S-000931)', () => {
  function waehleGruppe(container) {
    klick(treffer(container, 'g1'), 0, 0);
  }

  it('erscheint erst mit der Auswahl, über der Oberkante', () => {
    const { container } = baueAnsicht();
    expect(leiste(container)).toBeNull();
    waehleGruppe(container);
    const el = leiste(container);
    expect(el).not.toBeNull();
    // Waagerecht mittig über der Gruppe: -200 + 400/2 = 0.
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('-156px');
  });

  it('führt acht Farben und den Weg zurück zur Standardfarbe', () => {
    const { container } = baueAnsicht();
    waehleGruppe(container);
    const knoepfe = [...leiste(container).querySelectorAll('.canvas-gruppe-farbe')];
    expect(knoepfe).toHaveLength(9);
    expect(knoepfe[8].classList.contains('canvas-gruppe-farbe-keine')).toBe(true);
    // Keine Füllungs-Wahl: Die Fläche ist immer die Tönung der Farbe (F5).
    expect(leiste(container).querySelectorAll('.canvas-gruppe-farben')).toHaveLength(1);
  });

  it('markiert die gesetzte Farbe', () => {
    const { container } = baueAnsicht();
    waehleGruppe(container);
    const aktiv = [...leiste(container).querySelectorAll('.canvas-gruppe-farbe-aktiv')];
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].dataset.farbe).toBe('blau');
  });

  it('ein Klick auf eine Farbe schreibt sie und zeichnet sofort neu', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleGruppe(container);
    leiste(container)
      .querySelector('.canvas-gruppe-farbe[data-farbe="grün"]')
      .dispatchEvent(maus('click'));
    expect(elementAus(geschrieben, 'g1').farbe).toBe('grün');
    expect(rahmen(container, 'g1').style.stroke).toBe('var(--tab-group-green)');
  });

  it('«Standardfarbe» streicht die Angabe, statt einen Wert zu erfinden', () => {
    const { container, geschrieben } = baueAnsicht();
    waehleGruppe(container);
    leiste(container).querySelector('.canvas-gruppe-farbe-keine').dispatchEvent(maus('click'));
    expect(elementAus(geschrieben, 'g1').farbe).toBeUndefined();
    expect(geschrieben[0].rumpf).not.toContain('farbe=');
  });

  it('die Beschriftungen der Leiste stehen im Katalog', () => {
    const { container } = baueAnsicht();
    waehleGruppe(container);
    for (const el of leiste(container).querySelectorAll('button')) {
      expect(el.title, el.className).toBeTruthy();
      expect(el.title.startsWith('canvas.'), el.title).toBe(false);
    }
  });
});

describe('Canvas-Gruppen: Beschriftung als Rohtext (AK4/AK17 von 4S-000931)', () => {
  it('der Doppelklick öffnet den Rohtext oben in der Gruppe', () => {
    const { container } = baueAnsicht();
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    const feld = eingabe(container);
    expect(feld).not.toBeNull();
    // Der Rohtext, wie ihn der Parser liefert — samt der Trennzeile zum
    // nächsten Element. Genau das steht in der Datei, und genau das soll der
    // Anwender bearbeiten.
    expect(feld.value).toBe('Ausgangslage\n');
    expect(feld.style.left).toBe('-200px');
    expect(feld.style.top).toBe('-150px');
    // Nur der obere Streifen: Eine Eingabe über die ganze Gruppe verdeckte
    // deren Inhalt und damit den Zusammenhang der Beschriftung.
    expect(Number.parseInt(feld.style.height, 10)).toBeLessThan(300);
  });

  it('der Doppelklick auf den Rand öffnet sie ebenso', () => {
    const { container } = baueAnsicht();
    treffer(container, 'g1').dispatchEvent(maus('dblclick'));
    expect(eingabe(container)).not.toBeNull();
  });

  it('der Klick daneben übernimmt', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = 'Zweite Ausbaustufe';
    klick(buehne, 0, 0);
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(elementAus(geschrieben, 'g1').inhalt).toBe('Zweite Ausbaustufe');
    expect(gruppenText(container, 'g1').textContent).toBe('Zweite Ausbaustufe');
  });

  it('Escape verwirft und lässt das Dokument unberührt', () => {
    const { container, geschrieben } = baueAnsicht();
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = 'verworfen';
    eingabe(container).dispatchEvent(taste('Escape'));
    expect(eingabe(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
    expect(gruppenText(container, 'g1').textContent).toBe('Ausgangslage');
  });

  it('eine geleerte Beschriftung verschwindet auch aus dem Bild', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = '';
    klick(buehne, 0, 0);
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(geschrieben).toHaveLength(1);
    expect(gruppenText(container, 'g1')).toBeNull();
  });

  it('Sonderzeichen überstehen den Rundlauf (AK17)', async () => {
    const { container, buehne, geschrieben } = baueAnsicht();
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    eingabe(container).value = 'Größe & Maß — 50 % «fertig»';
    klick(buehne, 0, 0);
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(elementAus(geschrieben, 'g1').inhalt).toBe('Größe & Maß — 50 % «fertig»');
  });
});

describe('Canvas-Gruppen: das Kontextmenü der Gruppe (B6)', () => {
  function rechtsklick(container) {
    treffer(container, 'g1').dispatchEvent(
      maus('contextmenu', { button: 2, clientX: 0, clientY: 0 }),
    );
  }

  it('wählt die Gruppe und führt ihre Handlungen samt Stapel-Block', () => {
    const { container, view, menue } = baueAnsicht();
    rechtsklick(container);
    expect(view.getStats().gewaehlteGruppe).toBe('g1');
    expect(kennungen(menue)).toEqual([
      'canvas-group-color',
      'canvas-group-label',
      'canvas-group-delete',
      'canvas-stack-ganzNachVorn',
      'canvas-stack-eineStufeVor',
      'canvas-stack-eineStufeZurueck',
      'canvas-stack-ganzNachHinten',
    ]);
  });

  it('das Farb-Untermenü bietet acht Farben und die Standardfarbe', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(container);
    expect(untermenue(menue, 'canvas-group-color')).toHaveLength(9);
  });

  it('die Einträge rufen dieselbe Wirkung wie die Leiste', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(container);
    untermenue(menue, 'canvas-group-color')
      .find((e) => e.dataId === 'canvas-group-color-lila')
      .action();
    expect(elementAus(geschrieben, 'g1').farbe).toBe('lila');
    rechtsklick(container);
    loese(menue, 'canvas-group-label');
    expect(eingabe(container)).not.toBeNull();
    eingabe(container).dispatchEvent(taste('Escape'));
    rechtsklick(container);
    loese(menue, 'canvas-group-delete');
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual([
      'k1',
      'k2',
      's1',
      'e1',
    ]);
  });

  it('ein Rechtsklick auf eine Karte in der Gruppe meint die Karte', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('contextmenu', { button: 2 }));
    expect(kennungen(menue)[0]).toBe('canvas-card-edit');
  });

  it('die Beschriftungen stehen in allen fünf Sprachfassungen', () => {
    const schluessel = [
      'canvas.gruppeEinfuegen',
      'canvas.gruppeFarbe',
      'canvas.gruppeFarbeName',
      'canvas.gruppeStandardfarbe',
      'canvas.gruppeBeschriftung',
      'canvas.gruppeLoeschen',
      'command.canvas.addGroup',
    ];
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of schluessel) {
        expect(texte[key], `${key} fehlt in ${sprache}.json`).toBeTruthy();
      }
    }
  });
});

describe('Canvas-Gruppen: die vier Stapel-Befehle greifen (Story 4S-000932)', () => {
  it('eine gewählte Gruppe lässt sich nach vorn und wieder nach hinten holen', () => {
    const { container, view, geschrieben } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    expect(view.gewaehltesElement()).toBe('g1');
    expect(view.verschiebeImStapel('ganzNachVorn')).toBe(true);
    // Die Gruppe landet an der Stelle des bisher vordersten **Stapel**-
    // Elements; die Verbindung dahinter behält ihren Platz in der Datei, denn
    // sie liegt in einer eigenen Ebene und ist nicht umordnbar.
    expect(letztesModell(geschrieben).elemente.map((el) => el.id)).toEqual([
      'k1',
      'k2',
      's1',
      'g1',
      'e1',
    ]);
    expect(ebenenFolge(container)).toEqual(['k1', 'k2', 's1', 'g1']);
    expect(view.verschiebeImStapel('ganzNachHinten')).toBe(true);
    expect(ebenenFolge(container)).toEqual(['g1', 'k1', 'k2', 's1']);
  });

  it('die Stufen-Befehle bewegen sie um je einen Platz', () => {
    const { container, view } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    view.verschiebeImStapel('eineStufeVor');
    expect(ebenenFolge(container)).toEqual(['k1', 'g1', 'k2', 's1']);
    view.verschiebeImStapel('eineStufeZurueck');
    expect(ebenenFolge(container)).toEqual(['g1', 'k1', 'k2', 's1']);
  });

  it('am Ende des Stapels meldet der Befehl «nichts geändert»', () => {
    const { container, view, geschrieben } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    expect(view.verschiebeImStapel('ganzNachHinten')).toBe(false);
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().gruppen).toBe(1);
  });
});

describe('Canvas-Gruppen: keine Verbindung an einer Gruppe (Abgrenzung des Epics)', () => {
  it('die gewählte Gruppe bekommt keine Anschluss-Griffe', () => {
    const { container } = baueAnsicht();
    klick(treffer(container, 'g1'), 0, 0);
    expect(gruppeMit(container, 'g1').querySelector('.canvas-anschluss')).toBeNull();
    expect(container.querySelectorAll('.canvas-anschluss')).toHaveLength(0);
  });

  it('ein Zug vom Anschluss-Griff einer Karte endet nicht an der Gruppe', () => {
    // Der Zug endet bei 300/-120 — weit innerhalb der Gruppe, aber auf keiner
    // Karte. Eine Verbindung endet an einer Karte und nie an einer Gruppe.
    const { container, view, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(
      maus('mousedown', { button: 0, clientX: 0, clientY: 0 }),
    );
    // Den Zug der Karte beenden, bevor der Zug der Verbindung beginnt: Sonst
    // liefen zwei Handlungen zugleich, und gemessen würde die falsche.
    window.dispatchEvent(maus('mouseup', { clientX: 0, clientY: 0 }));
    const griff = container.querySelector('.canvas-anschluss-rechts');
    griff.dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(maus('mousemove', { clientX: 180, clientY: -120 }));
    window.dispatchEvent(maus('mouseup', { clientX: 180, clientY: -120 }));
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().linien).toBe(1);
  });
});

describe('Canvas-Gruppen: nur ansehbar im nicht änderbaren Dokument (E3, AK14)', () => {
  it('zeichnet die Gruppe samt Beschriftung, aber keinen Griff', () => {
    const { container } = baueAnsicht(RUMPF, { aenderbar: false });
    expect(gruppeMit(container, 'g1')).not.toBeNull();
    expect(gruppenText(container, 'g1')).not.toBeNull();
    expect(container.querySelectorAll('.canvas-gruppe-griff')).toHaveLength(0);
  });

  it('die Auswahl bleibt, die Leiste entsteht nicht', () => {
    const { container, view } = baueAnsicht(RUMPF, { aenderbar: false });
    klick(treffer(container, 'g1'), 0, 0);
    expect(view.getStats().gewaehlteGruppe).toBe('g1');
    expect(leiste(container)).toBeNull();
  });

  it('weder Zug noch Doppelklick noch Entf schreiben etwas', () => {
    const { container, geschrieben } = baueAnsicht(RUMPF, { aenderbar: false });
    ziehe(treffer(container, 'g1'), 0, 0, 60, 40);
    gruppenText(container, 'g1').dispatchEvent(maus('dblclick'));
    expect(eingabe(container)).toBeNull();
    container.querySelector('.canvas-view').dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    // Und die Karte in der Gruppe steht ebenfalls unverändert da.
    expect(karteMit(container, 'k1').style.left).toBe('-150px');
  });

  it('weder Anlegen noch Kontextmenü bieten etwas an', () => {
    const { container, view, buehne, menue, geschrieben } = baueAnsicht(RUMPF, {
      aenderbar: false,
    });
    expect(view.gruppeAnlegen()).toBe(false);
    buehne.dispatchEvent(maus('contextmenu', { button: 2, clientX: 0, clientY: 0 }));
    expect(menue.offen).toBe(false);
    treffer(container, 'g1').dispatchEvent(maus('contextmenu', { button: 2 }));
    expect(menue.offen).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('nach dem Moduswechsel kommen Griff und Leiste zurück', () => {
    const { container, view, zustand } = baueAnsicht(RUMPF, { aenderbar: false });
    zustand.aenderbar = true;
    view.setFlaechen(flaechenAus(RUMPF), {});
    klick(treffer(container, 'g1'), 0, 0);
    expect(container.querySelectorAll('.canvas-gruppe-griff')).toHaveLength(1);
    expect(leiste(container)).not.toBeNull();
  });
});

describe('Canvas-Gruppen: Bauweise der neuen Module (E4)', () => {
  it('bleiben frei von Renderer-Zustand', () => {
    // Dieselbe Ratsche wie bei den Formen: Ein Import von `app-state` zöge den
    // Canvas-Ordner in den großen Datei-Zyklus des Renderers.
    for (const datei of [
      'src/renderer/modules/canvas/canvas-gruppen.js',
      'src/renderer/modules/canvas/canvas-gruppen-bedienung.js',
    ]) {
      const quelle = lies(datei);
      expect(quelle, datei).not.toMatch(/from '.*app-state/);
      expect(quelle, datei).not.toMatch(/from '.*\/api\.js'/);
      expect(quelle, datei).not.toMatch(/from '.*i18n\.js'/);
    }
  });

  it('die Mitgliedschaft und die Modell-Änderungen laufen über den geteilten Bereich', () => {
    // Weder eine zweite Rechteck-Rechnung in der Bedienung noch eine eigene
    // Mitglieder-Liste im Modell: Das Rechteck ist die Aussage (G6).
    const quelle = lies('src/renderer/modules/canvas/canvas-gruppen-bedienung.js');
    expect(quelle).toContain("from '../../../shared/canvas/canvas-elemente.js'");
    expect(quelle).toContain('gruppenMitglieder');
    expect(quelle).not.toMatch(/mitglieder:\s*\[\s*['"]/);
  });
});
