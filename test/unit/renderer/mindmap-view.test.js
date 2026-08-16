// @vitest-environment jsdom
// 4T-1046 (Epic 3E-0151): Unit-Tests des Mindmap-Renderers — SVG-Struktur
// (Knoten, Kanten, Anfasser, Notiz-Marker), Klappen einzeln und rekursiv,
// Sprung zur Quellzeile, Notiz-Popover, Linienführung, Ast-Farben,
// Leer-Hinweis, Kapp-Hinweis und das Abmelden der Fenster-Listener.
//
// Die Komponente ist bewusst abhängigkeitsfrei (t und onJumpToLine
// injiziert), deshalb ohne window.api-Stub testbar; der t-Stub liest die
// echte de.json, damit ein fehlender Schlüssel im Test auffällt.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mindmapAusDokument } from '../../../src/shared/mindmap-core.js';
import { md } from '../../../src/shared/markdown/markdown.js';
import { createMindmapView } from '../../../src/renderer/modules/mindmap/mindmap-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const de = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const QUELLE = [
  '# Wurzel',
  '',
  'Ein Absatz als Notiz.',
  '',
  '## Ast eins',
  '',
  '- Blatt A',
  '- Blatt B',
  '',
  '## Ast zwei',
  '',
  '- Blatt C',
  '',
].join('\n');

function baumAus(text = QUELLE) {
  return mindmapAusDokument(text, md, { wurzelTitel: 'Datei' });
}

function baueAnsicht(text = QUELLE, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = createMindmapView(container, { t: tStub, ...options });
  const { root, gekappt } = baumAus(text);
  view.setTree(root, { gekappt, ...(options.setTree || {}) });
  return { container, view };
}

const knotenGruppen = (c) => c.querySelectorAll('.mindmap-knoten-gruppe');
const kanten = (c) => c.querySelectorAll('.mindmap-kante');

describe('Mindmap-Renderer: Struktur (4T-1046)', () => {
  it('AK1: zeichnet je sichtbarem Knoten eine Gruppe und je Kante einen Pfad', () => {
    const { container } = baueAnsicht();
    // Wurzel, zwei Äste, drei Blätter.
    expect(knotenGruppen(container)).toHaveLength(6);
    expect(kanten(container)).toHaveLength(5);
  });

  it('AK1: die Knoten stehen an den Stellen, die der Kern gerechnet hat', () => {
    const { container } = baueAnsicht();
    const erste = knotenGruppen(container)[0];
    expect(erste.getAttribute('transform')).toMatch(/^translate\(-?\d/);
  });

  it('AK3: nur ein Knoten mit Notizen trägt den Notiz-Marker', () => {
    const { container } = baueAnsicht();
    const marker = container.querySelectorAll('.mindmap-notiz-marker');
    expect(marker).toHaveLength(1);
  });

  it('ein Knoten mit Kindern trägt einen Anfasser, ein Blatt nicht', () => {
    const { container } = baueAnsicht();
    // Wurzel und zwei Äste haben Kinder, die drei Blätter nicht.
    expect(container.querySelectorAll('.mindmap-anfasser')).toHaveLength(3);
  });

  it('AK14: die Hinweis-Texte kommen aus den Übersetzungs-Schlüsseln', () => {
    const { container } = baueAnsicht('');
    const hinweis = container.querySelector('.mindmap-hinweis');
    expect(hinweis.hidden).toBe(false);
    expect(hinweis.textContent).toBe(de['mindmap.empty']);
    expect(hinweis.textContent).not.toContain('mindmap.');
  });
});

describe('Mindmap-Renderer: Klappen (4T-1046)', () => {
  it('AK6: ein Klick auf den Anfasser klappt den Teilbaum ein', () => {
    const { container, view } = baueAnsicht();
    const vorher = knotenGruppen(container).length;
    const anfasser = container.querySelectorAll('.mindmap-anfasser')[1];
    anfasser.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(knotenGruppen(container).length).toBeLessThan(vorher);
    expect(view.getStats().eingeklappt).toBe(1);
  });

  it('AK6: ein zweiter Klick klappt wieder aus', () => {
    const { container, view } = baueAnsicht();
    const vorher = knotenGruppen(container).length;
    const klick = () =>
      container
        .querySelectorAll('.mindmap-anfasser')[1]
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    klick();
    klick();
    expect(knotenGruppen(container).length).toBe(vorher);
    expect(view.getStats().eingeklappt).toBe(0);
  });

  it('AK6: mit Steuerungstaste wirkt der Klick rekursiv', () => {
    const { container, view } = baueAnsicht();
    const wurzelAnfasser = container.querySelectorAll('.mindmap-anfasser')[0];
    wurzelAnfasser.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    // Wurzel plus beide Äste sind eingeklappt, nicht nur die Wurzel.
    expect(view.getStats().eingeklappt).toBe(3);
    expect(knotenGruppen(container)).toHaveLength(1);
  });

  it('AK10: der Klapp-Zustand überlebt eine Neu-Übergabe des Baums', () => {
    const { container, view } = baueAnsicht();
    container
      .querySelectorAll('.mindmap-anfasser')[1]
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const nachKlappen = knotenGruppen(container).length;
    // Live-Aktualisierung: derselbe Text, frisch geparst.
    const { root, gekappt } = baumAus();
    view.setTree(root, { gekappt });
    expect(knotenGruppen(container).length).toBe(nachKlappen);
  });

  it('AK10: der Klapp-Zustand steht nur im Speicher, nicht am Baum-Eingang', () => {
    const { container } = baueAnsicht();
    container
      .querySelectorAll('.mindmap-anfasser')[1]
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // Ein frisch gebauter Baum weiß nichts von der Klappung.
    const { root } = baumAus();
    const alle = [];
    (function lauf(k) {
      alle.push(k);
      (k.kinder || []).forEach(lauf);
    })(root);
    expect(alle.some((k) => k.eingeklappt)).toBe(false);
  });
});

describe('Mindmap-Renderer: Bedienung (4T-1046)', () => {
  it('AK8: ein Klick auf den Titel meldet die Quellzeile', () => {
    const onJumpToLine = vi.fn();
    const { container } = baueAnsicht(QUELLE, { onJumpToLine });
    const titel = container.querySelectorAll('.mindmap-titel-springbar')[1];
    titel.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(onJumpToLine).toHaveBeenCalledTimes(1);
    // «## Ast eins» steht in Zeile 4 (nullbasiert).
    expect(onJumpToLine).toHaveBeenCalledWith(4);
  });

  it('AK3: ein Klick auf den Notiz-Marker öffnet das Popover mit dem Text', () => {
    const { container } = baueAnsicht();
    const popover = container.querySelector('.mindmap-popover');
    expect(popover.hidden).toBe(true);
    container
      .querySelector('.mindmap-notiz-marker')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(popover.hidden).toBe(false);
    expect(popover.textContent).toContain('Ein Absatz als Notiz.');
  });

  it('AK3: das Popover verändert die Zahl der Knoten nicht', () => {
    const { container } = baueAnsicht();
    const vorher = knotenGruppen(container).length;
    container
      .querySelector('.mindmap-notiz-marker')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(knotenGruppen(container).length).toBe(vorher);
  });

  it('AK7: Zoomen ändert die Transformation des Viewports', () => {
    const { container } = baueAnsicht();
    const viewport = container.querySelector('.mindmap-viewport');
    const vorher = viewport.getAttribute('transform');
    container
      .querySelector('.mindmap-svg')
      .dispatchEvent(new window.WheelEvent('wheel', { deltaY: -240, bubbles: true }));
    expect(viewport.getAttribute('transform')).not.toBe(vorher);
    expect(viewport.getAttribute('transform')).toMatch(/scale\(/);
  });

  it('AK9: eine Neu-Übergabe behält Zoom und Verschiebung', () => {
    const { container, view } = baueAnsicht();
    const viewport = container.querySelector('.mindmap-viewport');
    container
      .querySelector('.mindmap-svg')
      .dispatchEvent(new window.WheelEvent('wheel', { deltaY: -240, bubbles: true }));
    const nachZoom = viewport.getAttribute('transform');
    const { root, gekappt } = baumAus();
    view.setTree(root, { gekappt });
    expect(viewport.getAttribute('transform')).toBe(nachZoom);
  });
});

describe('Mindmap-Renderer: Darstellungs-Optionen (4T-1046)', () => {
  it('AK4: die Linienführung schaltet zwischen Kurve und Gerade', () => {
    const geschwungen = baueAnsicht(QUELLE, {
      setTree: { darstellung: { linienfuehrung: 'geschwungen' } },
    });
    expect(kanten(geschwungen.container)[0].getAttribute('d')).toContain('C');

    const gerade = baueAnsicht(QUELLE, {
      setTree: { darstellung: { linienfuehrung: 'gerade' } },
    });
    expect(kanten(gerade.container)[0].getAttribute('d')).toContain('L');
    expect(kanten(gerade.container)[0].getAttribute('d')).not.toContain('C');
  });

  it('AK5: Hauptäste bekommen verschiedene Farbnummern', () => {
    const { container } = baueAnsicht();
    const gruppen = [...knotenGruppen(container)];
    const farben = gruppen.map((g) => g.getAttribute('data-mindmap-farbe'));
    // Wurzel trägt 0, die beiden Äste zwei verschiedene Nummern.
    expect(farben[0]).toBe('0');
    expect(new Set(farben.filter((f) => f !== '0')).size).toBeGreaterThan(1);
  });

  it('AK5: ab der Einfrier-Ebene erbt der Teilbaum die Farbe seines Astes', () => {
    const { container } = baueAnsicht(QUELLE, {
      setTree: { darstellung: { farbEinfrierEbene: 1 } },
    });
    const gruppen = [...knotenGruppen(container)];
    const ast = gruppen.find((g) => g.textContent.includes('Ast eins'));
    const blatt = gruppen.find((g) => g.textContent.includes('Blatt A'));
    expect(blatt.getAttribute('data-mindmap-farbe')).toBe(ast.getAttribute('data-mindmap-farbe'));
  });

  it('die anfangs ausgeklappte Tiefe klappt tiefere Knoten zu', () => {
    const { container } = baueAnsicht(QUELLE, { setTree: { anfangsTiefe: 1 } });
    // Wurzel plus die beiden Äste; deren Blätter bleiben verborgen.
    expect(knotenGruppen(container)).toHaveLength(3);
  });
});

describe('Mindmap-Renderer: Wurzel-Lagen (4T-1049)', () => {
  const mitLage = (layout, text = QUELLE, options = {}) =>
    baueAnsicht(text, { ...options, setTree: { darstellung: { layout }, ...options.setTree } });

  const LAGEN = ['links', 'mitte', 'rechts', 'oben', 'unten'];

  // Breite eines Knotens, so wie die Zeichnung sie kennt: Der Unterstrich
  // läuft von 0 bis zur Knotenbreite.
  const knotenBreite = (gruppe) =>
    Number(gruppe.querySelector('.mindmap-unterstrich').getAttribute('x2'));

  it('AK6: der Knotentext bleibt in jeder Lage waagerecht', () => {
    for (const lage of LAGEN) {
      const { container } = mitLage(lage);
      for (const gruppe of knotenGruppen(container)) {
        expect(gruppe.getAttribute('transform'), `Lage ${lage}`).not.toContain('rotate');
      }
      for (const titel of container.querySelectorAll('.mindmap-titel')) {
        expect(titel.getAttribute('transform'), `Lage ${lage}`).toBeNull();
      }
    }
  });

  it('AK1: der Anfasser sitzt in jeder Lage am Ast-Ende', () => {
    const anfasserVon = (lage) => {
      const { container } = mitLage(lage);
      const gruppe = knotenGruppen(container)[0]; // Wurzel, sie hat Kinder
      const el = gruppe.querySelector('.mindmap-anfasser');
      return {
        cx: Number(el.getAttribute('cx')),
        cy: Number(el.getAttribute('cy')),
        breite: knotenBreite(gruppe),
      };
    };

    const links = anfasserVon('links');
    expect(links.cx).toBeCloseTo(links.breite, 5); // Wuchs nach rechts

    const rechts = anfasserVon('rechts');
    expect(rechts.cx).toBe(0); // Wuchs nach links

    const oben = anfasserVon('oben');
    expect(oben.cx).toBeCloseTo(oben.breite / 2, 5);
    expect(oben.cy).toBeGreaterThan(0); // Kanten gehen nach unten ab

    const unten = anfasserVon('unten');
    expect(unten.cx).toBeCloseTo(unten.breite / 2, 5);
    expect(unten.cy).toBeLessThan(0); // Kanten gehen nach oben ab
  });

  it('AK6: bei Wuchs nach links steht der Text am rechten Knotenrand', () => {
    const { container } = mitLage('rechts');
    const titel = container.querySelector('.mindmap-titel');
    expect(titel.getAttribute('text-anchor')).toBe('end');
    // Und das Notiz-Symbol spiegelt mit: es steht links vom Text.
    const marker = container.querySelector('.mindmap-notiz-marker');
    const x = Number(/translate\((-?[\d.]+)/.exec(marker.getAttribute('transform'))[1]);
    expect(x).toBeLessThan(0);
  });

  it('AK5: die Wahl zwischen gerade und geschwungen bleibt in jeder Lage wirksam', () => {
    for (const lage of LAGEN) {
      const geschwungen = baueAnsicht(QUELLE, {
        setTree: { darstellung: { layout: lage, linienfuehrung: 'geschwungen' } },
      });
      expect(kanten(geschwungen.container)[0].getAttribute('d'), `Lage ${lage}`).toContain('C');

      const gerade = baueAnsicht(QUELLE, {
        setTree: { darstellung: { layout: lage, linienfuehrung: 'gerade' } },
      });
      const d = kanten(gerade.container)[0].getAttribute('d');
      expect(d, `Lage ${lage}`).toContain('L');
      expect(d, `Lage ${lage}`).not.toContain('C');
    }
  });

  it('AK5: die Kurve wird gedreht, nicht anders geformt', () => {
    // Waagerecht liegen beide Anfasspunkte auf der halben Breite, senkrecht
    // auf der halben Höhe. Geprüft wird die Form der Kurven-Angabe.
    const pfad = (lage) => kanten(mitLage(lage).container)[0].getAttribute('d');
    const zahlen = (d) => d.match(/-?[\d.]+/g).map(Number);

    const waagerecht = zahlen(pfad('links')); // x1 y1 cx1 cy1 cx2 cy2 x2 y2
    expect(waagerecht[2]).toBeCloseTo(waagerecht[4], 5); // beide Anfasser auf x-Mitte
    expect(waagerecht[3]).toBeCloseTo(waagerecht[1], 5);

    const senkrecht = zahlen(pfad('oben'));
    expect(senkrecht[3]).toBeCloseTo(senkrecht[5], 5); // beide Anfasser auf y-Mitte
    expect(senkrecht[2]).toBeCloseTo(senkrecht[0], 5);
  });

  it('AK9: ein Lage-Wechsel an der offenen Karte behält den Klapp-Zustand', () => {
    const { container, view } = mitLage('links');
    container
      .querySelectorAll('.mindmap-anfasser')[1]
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const nachKlappen = knotenGruppen(container).length;
    expect(view.getStats().eingeklappt).toBe(1);

    // Nur die Lage wechselt, der Baum bleibt derselbe.
    view.setTree(baumAus().root, { darstellung: { layout: 'mitte' } });
    expect(view.getStats().eingeklappt).toBe(1);
    expect(knotenGruppen(container).length).toBe(nachKlappen);
  });

  it('AK4: Klappen, Sprung und Notiz-Popover wirken auch in gedrehter Lage', () => {
    const onJumpToLine = vi.fn();
    const { container, view } = mitLage('unten', QUELLE, { onJumpToLine });

    container
      .querySelectorAll('.mindmap-titel-springbar')[1]
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(onJumpToLine).toHaveBeenCalledWith(4);

    container
      .querySelector('.mindmap-notiz-marker')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(container.querySelector('.mindmap-popover').hidden).toBe(false);

    container
      .querySelectorAll('.mindmap-anfasser')[1]
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(view.getStats().eingeklappt).toBe(1);
  });

  it('AK1: mittig stehen Äste auf beiden Seiten der Wurzel', () => {
    const { container } = mitLage('mitte');
    const lage = (g) => Number(/translate\((-?[\d.]+)/.exec(g.getAttribute('transform'))[1]);
    const gruppen = [...knotenGruppen(container)];
    const wurzel = lage(gruppen[0]);
    expect(gruppen.some((g) => lage(g) < wurzel)).toBe(true);
    expect(gruppen.some((g) => lage(g) > wurzel)).toBe(true);
  });
});

describe('Mindmap-Renderer: Ränder und Aufräumen (4T-1046)', () => {
  it('AK11: ein Dokument ohne Struktur zeigt den Leer-Hinweis', () => {
    const { container } = baueAnsicht('Nur ein Absatz.\n');
    expect(container.querySelector('.mindmap-hinweis').hidden).toBe(false);
  });

  it('AK13: ein gekappter Baum meldet die Kappung im Hinweis', () => {
    const zeilen = [];
    for (let i = 0; i < 3100; i++) zeilen.push(`- Punkt ${i}`);
    const { container } = baueAnsicht(zeilen.join('\n'));
    const hinweis = container.querySelector('.mindmap-hinweis');
    expect(hinweis.hidden).toBe(false);
    expect(hinweis.textContent).toContain('3000');
  });

  it('destroy meldet die Fenster-Listener ab und räumt das DOM', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const abmelden = vi.spyOn(window, 'removeEventListener');
    const view = createMindmapView(container, { t: tStub });
    view.setTree(baumAus().root, {});
    view.destroy();
    expect(container.querySelector('.mindmap-view')).toBeNull();
    const abgemeldet = abmelden.mock.calls.map((c) => c[0]);
    expect(abgemeldet).toContain('mousemove');
    expect(abgemeldet).toContain('mouseup');
    abmelden.mockRestore();
  });

  it('AK6 (4T-1054): der Notiz-Marker ist ein Zettel-Symbol mit Schreiblinien', () => {
    const { container } = baueAnsicht();
    const marker = container.querySelector('.mindmap-notiz-marker');
    expect(marker.tagName.toLowerCase()).toBe('g');
    expect(marker.querySelector('.mindmap-notiz-blatt')).not.toBeNull();
    expect(marker.querySelectorAll('.mindmap-notiz-strich')).toHaveLength(3);
  });

  it('das Notiz-Symbol steht hinter dem Text, nicht davor', () => {
    // Zweite Test-Iteration: Vor dem Text lag es auf der Unterstreichung.
    const { container } = baueAnsicht();
    const marker = container.querySelector('.mindmap-notiz-marker');
    const x = Number(/translate\((-?[\d.]+)/.exec(marker.getAttribute('transform'))[1]);
    expect(x).toBeGreaterThan(0);
  });

  it('AK6 (4T-1054): die Trefferflaeche misst mindestens 16 Pixel', () => {
    const { container } = baueAnsicht();
    const treffer = container.querySelector('.mindmap-notiz-treffer');
    expect(Number(treffer.getAttribute('width'))).toBeGreaterThanOrEqual(16);
    expect(Number(treffer.getAttribute('height'))).toBeGreaterThanOrEqual(16);
  });

  it('setTree ohne Baum zeigt den Leer-Hinweis statt zu brechen', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = createMindmapView(container, { t: tStub });
    view.setTree(null, {});
    expect(container.querySelector('.mindmap-hinweis').hidden).toBe(false);
    expect(view.getStats().sichtbareKnoten).toBe(0);
  });
});
