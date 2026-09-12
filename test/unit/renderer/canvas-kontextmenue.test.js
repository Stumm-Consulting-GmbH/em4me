// @vitest-environment jsdom
// 4T-001683 (Epic 3E-000287): Prüffälle des Kontextmenüs der Canvas-Fläche —
// der dritte Bedienort neben Doppelklick und Kommando-Palette (Anordnung des
// Product Owners vom 2026-09-10: «Zusätzlich zum Doppelklick und der
// Kommando-Palette sollen die Funktionalitäten auch über die rechte Maustaste
// verfügbar sein»).
//
// Geprüft wird an der zusammengesetzten Ansicht und gegen eine Menü-Attrappe:
// Das Bauen des Menüs liegt beim Fenster (app-init.js über die gemeinsamen
// Helfer), hier gehört die Frage her, WELCHE Einträge eine Zeiger-Stelle
// ergibt und WAS ihr Auslösen bewirkt.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt
// (Muster canvas-bedienung.test.js).
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

const RUMPF = [
  '!karte k1 x=-320 y=-140 b=260 h=120',
  'Erste',
  '',
  '!karte k2 x=40 y=-140 b=260 h=120',
  'Zweite',
  '',
  '!linie e1 k1 -> k2',
].join('\n');

function flaechenAus(rumpf) {
  const model = parseCanvasFence(rumpf);
  return [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, nummer: 1, rumpf }];
}

function baueAnsicht(rumpf = RUMPF) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  // Menü-Attrappe: Sie merkt sich die letzte Aufforderung und ihren Zustand.
  // Das echte Menü lebt im gemeinsamen Element des Fensters; hier zählt allein,
  // was die Fläche hineinreicht.
  const menue = { offen: false, x: 0, y: 0, eintraege: [], geschlossen: 0 };
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
    beiAenderung: (daten) => {
      geschrieben.push(daten);
      return true;
    },
    zeigeKontextmenue: ({ x, y, eintraege }) => {
      Object.assign(menue, { offen: true, x, y, eintraege });
    },
    schliesseKontextmenue: () => {
      menue.offen = false;
      menue.geschlossen += 1;
    },
    kontextmenueOffen: () => menue.offen,
  });
  const buehne = container.querySelector('.canvas-buehne');
  buehne.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    right: 800,
    bottom: 400,
  });
  view.setFlaechen(flaechenAus(rumpf), {});
  // Ohne Einpassung sind Klick-Punkt und Flächen-Koordinate dieselbe Zahl.
  view.reset();
  return { container, view, buehne, geschrieben, menue };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const eingabe = (c) => c.querySelector('.canvas-karte-eingabe');
const flaeche = (c) => c.querySelector('.canvas-view');
const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });

// Rechtsklick, wie ihn der Browser liefert: erst die Maustaste, dann das
// Kontextmenü-Ereignis.
function rechtsklick(ziel, x = 0, y = 0) {
  ziel.dispatchEvent(maus('mousedown', { button: 2, clientX: x, clientY: y }));
  const ereignis = maus('contextmenu', { button: 2, clientX: x, clientY: y, cancelable: true });
  ziel.dispatchEvent(ereignis);
  return ereignis;
}

const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();
const kennungen = (menue) => menue.eintraege.map((e) => e.dataId);

const letzterRumpf = (geschrieben) => geschrieben[geschrieben.length - 1].rumpf;
const kartenIds = (geschrieben) =>
  parseCanvasFence(letzterRumpf(geschrieben))
    .elemente.filter((el) => el.art === 'karte')
    .map((el) => el.id);

describe('Canvas-Kontextmenü: Rechtsklick auf den Hintergrund (4T-001683)', () => {
  it('zeigt genau einen Eintrag, an der Stelle des Zeigers', () => {
    const { buehne, menue } = baueAnsicht();
    rechtsklick(buehne, 120, 60);
    expect(menue.offen).toBe(true);
    expect(kennungen(menue)).toEqual(['canvas-add-card']);
    expect(menue).toMatchObject({ x: 120, y: 60 });
  });

  it('die Beschriftung ist die des bestehenden Kommandos', () => {
    // Zwei Namen für dieselbe Handlung wären zwei Funktionen im Kopf des
    // Anwenders; der Schlüssel ist deshalb derselbe wie in Menü und Palette.
    const { buehne, menue } = baueAnsicht();
    rechtsklick(buehne, 0, 0);
    expect(menue.eintraege[0].label).toBe(de['command.canvas.addCard']);
  });

  it('das Auslösen legt die Karte an der Klick-Stelle an', () => {
    const { buehne, menue, geschrieben } = baueAnsicht();
    rechtsklick(buehne, 100, 40);
    loese(menue, 'canvas-add-card');
    const neu = parseCanvasFence(letzterRumpf(geschrieben)).elemente.find((el) => el.id === 'k3');
    // Mittig unter dem Klick-Punkt, wie beim Doppelklick.
    expect(neu).toMatchObject({ x: -20, y: -20 });
  });

  it('der Rechtsklick allein schreibt nichts', () => {
    const { buehne, geschrieben } = baueAnsicht();
    rechtsklick(buehne, 100, 40);
    expect(geschrieben).toHaveLength(0);
  });

  it('das voreingestellte Menü des Fensters bleibt aus', () => {
    const { buehne } = baueAnsicht();
    expect(rechtsklick(buehne, 0, 0).defaultPrevented).toBe(true);
  });
});

describe('Canvas-Kontextmenü: Rechtsklick auf eine Karte (4T-001683)', () => {
  it('wählt die Karte und zeigt ihre beiden Einträge', () => {
    const { container, view, menue } = baueAnsicht();
    rechtsklick(karteMit(container, 'k2'), 50, 50);
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    expect(kennungen(menue)).toEqual(['canvas-card-edit', 'canvas-card-delete']);
  });

  it('die Beschriftungen stehen im Katalog', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    expect(menue.eintraege.map((e) => e.label)).toEqual([
      de['canvas.karteBearbeiten'],
      de['canvas.karteLoeschen'],
    ]);
  });

  it('«Text bearbeiten» öffnet die Rohtext-Eingabe, wie es der Doppelklick tut', () => {
    const { container, menue } = baueAnsicht();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    loese(menue, 'canvas-card-edit');
    expect(eingabe(container)).not.toBeNull();
    expect(eingabe(container).value).toBe('Erste\n');
  });

  it('«Karte löschen» entfernt sie samt ihrer Verbindungen, wie es Entf tut', () => {
    const { container, menue, geschrieben } = baueAnsicht();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    loese(menue, 'canvas-card-delete');
    expect(kartenIds(geschrieben)).toEqual(['k2']);
    expect(parseCanvasFence(letzterRumpf(geschrieben)).errors).toEqual([]);
  });

  it('der Rechtsklick startet kein Ziehen — weder der Karte noch der Fläche', () => {
    // Sonst hinge die Karte nach dem Menü am Zeiger, ohne dass jemand sie
    // angefasst hätte.
    const { container, view, geschrieben } = baueAnsicht();
    const vorher = view.getStats();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 300, clientY: 300 }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {}));
    expect(karteMit(container, 'k1').style.left).toBe('-320px');
    expect(view.getStats()).toMatchObject({ tx: vorher.tx, ty: vorher.ty });
    expect(geschrieben).toHaveLength(0);
  });
});

describe('Canvas-Kontextmenü: Rohtext-Eingabe und Schließen (4T-001683)', () => {
  it('in der offenen Eingabe bleibt das Standard-Verhalten der Textfläche', () => {
    // Dort erwartet der Anwender Ausschneiden, Kopieren und Einfügen; ein
    // eigenes Menü nähme sie ihm.
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    const ereignis = rechtsklick(eingabe(container), 10, 10);
    expect(menue.offen).toBe(false);
    expect(ereignis.defaultPrevented).toBe(false);
    expect(eingabe(container)).not.toBeNull();
  });

  it('ein Rechtsklick daneben übernimmt eine offene Eingabe', () => {
    // Wie der Klick auf den Hintergrund: Der Rechtsklick ist der Beginn einer
    // anderen Handlung, und ein halb offenes Textfeld darunter wäre unklar.
    const { container, buehne, geschrieben } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick', { clientX: 0, clientY: 0 }));
    eingabe(container).value = 'Umgeschrieben';
    rechtsklick(buehne, 200, 100);
    expect(eingabe(container)).toBeNull();
    expect(geschrieben).toHaveLength(1);
  });

  it('Escape schließt das offene Menü und hebt nicht zugleich die Auswahl auf', () => {
    // Die Karten-Bedienung hält Escape auf der Fläche an; ohne diesen Vorrang
    // käme ein offenes Menü nie an die Escape-Kaskade des Fensters.
    const { container, view, menue } = baueAnsicht();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    flaeche(container).dispatchEvent(
      new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    expect(menue.geschlossen).toBe(1);
    expect(view.getStats().gewaehlteKarte).toBe('k1');
  });

  it('ohne offenes Menü bleibt Escape die Aufhebung der Auswahl', () => {
    const { container, view, menue } = baueAnsicht();
    rechtsklick(karteMit(container, 'k1'), 0, 0);
    menue.offen = false; // Klick außerhalb hat es geschlossen.
    flaeche(container).dispatchEvent(
      new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    expect(menue.geschlossen).toBe(0);
    expect(view.getStats().gewaehlteKarte).toBeNull();
  });

  it('nach dem Auflösen der Ansicht hört niemand mehr zu', () => {
    const { container, buehne, view, menue } = baueAnsicht();
    view.destroy();
    buehne.dispatchEvent(maus('contextmenu', { button: 2, cancelable: true }));
    expect(menue.offen).toBe(false);
    expect(container.querySelector('.canvas-view')).toBeNull();
  });
});

describe('Canvas-Kontextmenü: Bauweise und Bedienort (4T-001683)', () => {
  it('das Modul bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise E4 wie die beiden Nachbarn: weder api noch i18n noch
    // app-state, und ausdrücklich nicht die Menü-Helfer des Fensters — ein
    // Import von dort zöge den Canvas-Ordner in den grossen Datei-Zyklus des
    // Renderers, den der Ordner-Import-Wächter als Ratsche eingefroren hat.
    const quelle = lies('src/renderer/modules/canvas/canvas-kontextmenue.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege).toEqual([]);
    expect(quelle).not.toMatch(/context-menu-utils/);
  });

  it('gebaut wird über das gemeinsame Menü des Fensters', () => {
    // Damit gelten dessen Schließ-Wege ohne eigenes Zutun: Klick außerhalb und
    // die Escape-Kaskade in app-input-bindings.js.
    const init = lies('src/renderer/modules/app-init.js');
    expect(init).toContain('zeigeKontextmenue: (paneIdx, { x, y, eintraege })');
    expect(init).toContain('showContextMenuItems(eintraege, x, y)');
    expect(init).toContain('schliesseKontextmenue: () => hideContextMenu()');
    const helfer = lies('src/renderer/modules/dialogs/context-menu-utils.js');
    expect(helfer).toContain('export function showContextMenuItems');
    const bindungen = lies('src/renderer/modules/app/app-input-bindings.js');
    expect(bindungen).toContain('hideContextMenu()');
  });

  it('die Einträge je Ziel-Art stehen an einer Stelle beisammen', () => {
    // 4T-001655 hängt die Verbindungen als dritte Art daneben; die Stelle ist
    // eigens dafür benannt, damit der Ereignis-Weg dabei unberührt bleibt.
    const quelle = lies('src/renderer/modules/canvas/canvas-kontextmenue.js');
    expect(quelle).toContain('function eintraegeFuer');
    expect(quelle).toContain('function hintergrundEintraege');
    expect(quelle).toContain('function kartenEintraege');
  });

  it('die Texte des Menüs stehen in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of ['canvas.karteBearbeiten', 'canvas.karteLoeschen']) {
        expect(katalog[key], `Schlüssel ${key} fehlt in ${sprache}.json`).toBeTruthy();
      }
    }
  });

  it('das Menü ruft die Handlungen der Bedienung und baut sie nicht nach', () => {
    // Ein zweiter Weg in dieselbe Wirkung wäre ein zweiter Ort, an dem sie
    // auseinanderlaufen kann.
    const quelle = lies('src/renderer/modules/canvas/canvas-kontextmenue.js');
    for (const griff of ['karteAnlegen', 'bearbeiteKarte', 'loescheKarte', 'waehleKarte']) {
      expect(quelle).toContain(`bedienung.${griff}`);
    }
    expect(quelle).not.toContain('serializeCanvasFence');
  });
});

describe('Canvas-Kontextmenü: ohne Injektion (4T-001683)', () => {
  it('ohne Menü-Zugang bleibt der Rechtsklick folgenlos statt zu scheitern', () => {
    // Der Stand der reinen Zeichnungs-Prüffälle: eine Fläche ohne Einbettung.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = createCanvasView(container, { t: tStub });
    view.setFlaechen(flaechenAus(RUMPF), {});
    const buehne = container.querySelector('.canvas-buehne');
    expect(() => rechtsklick(buehne, 10, 10)).not.toThrow();
    expect(() =>
      flaeche(container).dispatchEvent(
        new window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      ),
    ).not.toThrow();
    view.destroy();
  });
});
