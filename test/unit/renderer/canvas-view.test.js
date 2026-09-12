// @vitest-environment jsdom
// 4T-001653 (Epic 3E-000287): Prüffälle des Canvas-Renderers — die beiden
// Ebenen und ihre gemeinsame Verschiebung, Karten an Lage und Größe, der
// gerenderte Karten-Inhalt, die Verbindungen, Navigation und Hinweise.
//
// Die Komponente ist bewusst abhängigkeitsfrei (t und renderMarkdown
// injiziert), deshalb ohne window.api-Stub prüfbar; der t-Stub liest die
// echte de.json, damit ein fehlender Schlüssel im Test auffällt.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasFlaechenTitel, parseCanvasFence } from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const de = JSON.parse(readFileSync(path.join(wurzel, 'src/i18n/de.json'), 'utf8'));
const tStub = (key) => de[key] ?? key;

const RUMPF = [
  '!karte k1 x=-320 y=-140 b=260 h=120',
  '## Ausgangslage',
  '',
  'Der Import liest heute nur eine Quelle.',
  '',
  '!karte k2 x=40 y=-140 b=260 h=120',
  'Zielbild',
  '',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'ergibt',
  '',
  '!linie e2 k2 -- k1',
].join('\n');

function baueAnsicht(rumpf = RUMPF, opts = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown: (text) => `<p>${text}</p>`,
    ...opts.options,
  });
  const rumpfe = rumpf === null ? [] : Array.isArray(rumpf) ? rumpf : [rumpf];
  view.setFlaechen(flaechenAus(rumpfe), opts.setModel || {});
  return { container, view };
}

// 4T-001677: Die Ansicht bekommt eine Liste von Flächen; eine einzelne ist
// der Normalfall der meisten Prüffälle.
function flaechenAus(rumpfe) {
  return rumpfe.map((r, i) => {
    const model = parseCanvasFence(r);
    return { model, titel: canvasFlaechenTitel(model), startZeile: i * 100 + 1, nummer: i + 1 };
  });
}

const karten = (c) => c.querySelectorAll('.canvas-karte');
const linien = (c) => c.querySelectorAll('.canvas-linie');
const pfade = (c) => c.querySelectorAll('.canvas-linie-pfad');

describe('Canvas-Renderer: Aufbau der beiden Ebenen (4T-001653)', () => {
  it('AK1: legt Bühne, SVG-Ebene und Karten-Ebene an', () => {
    const { container } = baueAnsicht();
    expect(container.querySelector('.canvas-view')).not.toBeNull();
    expect(container.querySelector('.canvas-buehne')).not.toBeNull();
    expect(container.querySelector('.canvas-svg .canvas-viewport')).not.toBeNull();
    expect(container.querySelector('.canvas-karten')).not.toBeNull();
  });

  it('AK2: zeichnet je Karte ein HTML-Element und keine SVG-Beschriftung', () => {
    // Genau hier verlässt die Canvas ihre beiden Vorbilder (Entscheidung E4):
    // Ein SVG-Textelement könnte den Karten-Inhalt weder rendern noch scrollen.
    const { container } = baueAnsicht();
    expect(karten(container)).toHaveLength(2);
    expect(container.querySelectorAll('.canvas-karten text')).toHaveLength(0);
  });

  it('AK2: die Karte steht an ihrer Lage und in ihrer Größe', () => {
    const { container } = baueAnsicht();
    const erste = karten(container)[0];
    expect(erste.style.left).toBe('-320px');
    expect(erste.style.top).toBe('-140px');
    expect(erste.style.width).toBe('260px');
    expect(erste.style.height).toBe('120px');
  });

  it('AK2: der Karten-Inhalt kommt aus dem injizierten Markdown-Render', () => {
    const render = vi.fn((text) => `<p>${text}</p>`);
    const { container } = baueAnsicht(RUMPF, {
      options: { renderMarkdown: render },
      setModel: { pfad: 'Notizen/Fläche.md' },
    });
    expect(render).toHaveBeenCalledTimes(2);
    // Der Dokument-Pfad wird gereicht, damit Bilder in der Karte auflösen.
    expect(render.mock.calls[0][1]).toBe('Notizen/Fläche.md');
    expect(container.querySelector('.canvas-karte-inhalt').innerHTML).toContain(
      'Der Import liest heute nur eine Quelle.',
    );
  });

  it('AK2: der Karten-Inhalt durchläuft den Schritt-Satz des erzeugten Teilbaums', () => {
    // Wächter 4T-001130: Ohne ihn bliebe in der Karte alles inert, was die
    // Render-Pipeline erst befüllt oder bedienbar macht — ein Mermaid-Block
    // bliebe Code, eine Abfrage bliebe leer.
    const nachRender = vi.fn();
    const { container } = baueAnsicht(RUMPF, {
      options: { nachRender },
      setModel: { pfad: 'Fläche.md' },
    });
    expect(nachRender).toHaveBeenCalledTimes(2);
    expect(nachRender.mock.calls[0][0]).toBe(container.querySelector('.canvas-karte-inhalt'));
    expect(nachRender.mock.calls[0][1]).toBe('Fläche.md');
  });

  it('AK2: der Inhalts-Container trägt die Typografie der Lese-Ansicht', () => {
    const { container } = baueAnsicht();
    const inhalt = container.querySelector('.canvas-karte-inhalt');
    expect(inhalt.classList.contains('markdown-body')).toBe(true);
  });

  it('AK3: die Karten-Größe folgt der Angabe und nicht der Inhalts-Länge', () => {
    // Leitplanke 3: Eine Karte wächst nie selbsttätig; gescrollt wird in ihr.
    const lang = ['!karte k1 x=0 y=0 b=120 h=60', ...Array(50).fill('Eine lange Zeile.')].join(
      '\n',
    );
    const { container } = baueAnsicht(lang);
    const karte = karten(container)[0];
    expect(karte.style.width).toBe('120px');
    expect(karte.style.height).toBe('60px');
  });

  it('AK3: das Stilblatt lässt den Karten-Inhalt scrollen', () => {
    // jsdom rechnet kein Layout; geprüft wird die Regel, die es im Programm tut.
    const css = readFileSync(path.join(wurzel, 'src/renderer/styles/canvas.css'), 'utf8');
    const regel = /\.canvas-karte-inhalt \{([^}]*)\}/.exec(css);
    expect(regel, 'Regel .canvas-karte-inhalt nicht gefunden').not.toBeNull();
    expect(regel[1]).toMatch(/overflow:\s*auto/);
  });

  it('eine defekte Größen-Angabe bleibt sichtbar statt zu verschwinden', () => {
    // Die Fehler-Semantik des Kerns verlangt, dass ein defektes Element die
    // Anzeige stören darf — nicht, dass es unauffindbar wird.
    const { container } = baueAnsicht('!karte k1 x=0 y=0 b=nichts h=nichts\nText');
    const karte = karten(container)[0];
    expect(Number.parseInt(karte.style.width, 10)).toBeGreaterThan(0);
    expect(Number.parseInt(karte.style.height, 10)).toBeGreaterThan(0);
  });
});

describe('Canvas-Renderer: Verbindungen (4T-001653)', () => {
  it('AK4: zeichnet je Verbindung eine Gruppe mit ihrem Pfad', () => {
    const { container } = baueAnsicht();
    expect(linien(container)).toHaveLength(2);
    expect(pfade(container)).toHaveLength(2);
  });

  it('AK4: nur die gerichtete Verbindung bekommt eine Pfeilspitze', () => {
    const { container } = baueAnsicht();
    expect(container.querySelectorAll('.canvas-linie-spitze')).toHaveLength(1);
  });

  it('AK4: die Verbindung folgt ihrer Karte', () => {
    const vorher = baueAnsicht();
    const pfadVorher = pfade(vorher.container)[0].getAttribute('d');
    const verschoben = RUMPF.replace('x=40 y=-140', 'x=40 y=300');
    const nachher = baueAnsicht(verschoben);
    expect(pfade(nachher.container)[0].getAttribute('d')).not.toBe(pfadVorher);
  });

  it('AK4: eine Verbindung ins Leere wird nicht gezeichnet und wirft nicht', () => {
    // Der Kern meldet sie als Befund und behält sie; die Zeichnung lässt sie
    // aus, weil ihr ein Ende fehlt. Verloren geht sie dadurch nicht.
    const { container } = baueAnsicht('!karte k1 x=0 y=0 b=100 h=50\nA\n\n!linie e1 k1 -> weg');
    expect(pfade(container)).toHaveLength(0);
    expect(karten(container)).toHaveLength(1);
  });

  it('die Verbindungen liegen unter den Karten', () => {
    // Sie sind Beziehung und nicht Inhalt: Eine Linie darf nie über einem
    // Karten-Text liegen.
    const { container } = baueAnsicht();
    const buehne = container.querySelector('.canvas-buehne');
    const kinder = [...buehne.children].map((el) => el.getAttribute('class'));
    expect(kinder.indexOf('canvas-svg')).toBeLessThan(kinder.indexOf('canvas-karten'));
  });

  it('die Reihenfolge in der Fence ist die Stapel-Reihenfolge (G3)', () => {
    const { container } = baueAnsicht();
    const ids = [...karten(container)].map((el) => el.dataset.canvasId);
    expect(ids).toEqual(['k1', 'k2']);
  });
});

describe('Canvas-Renderer: Navigation (4T-001653)', () => {
  it('AK5: beide Ebenen tragen dieselbe Verschiebung und Vergrößerung', () => {
    const { container, view } = baueAnsicht();
    view.fit();
    const { scale, tx, ty } = view.getStats();
    expect(container.querySelector('.canvas-viewport').getAttribute('transform')).toBe(
      `translate(${tx} ${ty}) scale(${scale})`,
    );
    expect(container.querySelector('.canvas-karten').style.transform).toBe(
      `translate(${tx}px, ${ty}px) scale(${scale})`,
    );
  });

  it('AK5: Ziehen auf dem Hintergrund verschiebt die Fläche', () => {
    const { container, view } = baueAnsicht();
    const vorher = view.getStats();
    const buehne = container.querySelector('.canvas-buehne');
    buehne.dispatchEvent(
      new window.MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }),
    );
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 140, clientY: 130 }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {}));
    const nachher = view.getStats();
    expect(nachher.tx - vorher.tx).toBe(40);
    expect(nachher.ty - vorher.ty).toBe(30);
  });

  it('AK5: Ziehen auf einer Karte verschiebt die Fläche nicht', () => {
    // Sonst ließe sich in der Karte weder Text markieren noch scrollen — und
    // ab 4T-001654 wäre das Ziehen der Karte selbst nicht mehr davon zu
    // unterscheiden.
    const { container, view } = baueAnsicht();
    const vorher = view.getStats();
    karten(container)[0].dispatchEvent(
      new window.MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100, bubbles: true }),
    );
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new window.MouseEvent('mouseup', {}));
    expect(view.getStats().tx).toBe(vorher.tx);
  });

  it('AK5: das Rad zoomt die Fläche', () => {
    const { container, view } = baueAnsicht();
    const vorher = view.getStats().scale;
    container
      .querySelector('.canvas-buehne')
      .dispatchEvent(new window.WheelEvent('wheel', { deltaY: -240, bubbles: true }));
    expect(view.getStats().scale).toBeGreaterThan(vorher);
  });

  it('AK5: Einpassen setzt Verschiebung und Vergrößerung neu', () => {
    const { view } = baueAnsicht();
    view.reset();
    expect(view.getStats()).toMatchObject({ scale: 1, tx: 0, ty: 0 });
    view.fit();
    // Die Fläche liegt um den Ursprung; ohne Verschiebung wäre sie nur zur
    // Hälfte sichtbar.
    expect(view.getStats().tx).not.toBe(0);
  });

  it('AK5: eine Live-Aktualisierung behält den gewählten Ausschnitt', () => {
    const { view } = baueAnsicht();
    view.reset();
    view.fit();
    const vorher = view.getStats();
    view.setFlaechen(flaechenAus([`${RUMPF}\n\n!karte k3 x=500 y=500 b=100 h=50\nNeu`]));
    const nachher = view.getStats();
    expect(nachher.karten).toBe(3);
    expect(nachher.scale).toBe(vorher.scale);
    expect(nachher.tx).toBe(vorher.tx);
  });

  it('meldet Karten, Verbindungen und Befunde', () => {
    const { view } = baueAnsicht();
    expect(view.getStats()).toMatchObject({ karten: 2, linien: 2, befunde: 0 });
  });
});

describe('Canvas-Renderer: Hinweise und Aufräumen (4T-001653)', () => {
  it('ohne Modell bleibt die Fläche leer und der Hinweis steht', () => {
    const { container } = baueAnsicht(null, { setModel: { hinweis: 'canvas.keineFence' } });
    expect(karten(container)).toHaveLength(0);
    const hinweis = container.querySelector('.canvas-hinweis');
    expect(hinweis.hidden).toBe(false);
    expect(hinweis.textContent).toBe(de['canvas.keineFence']);
  });

  it('der Hinweis-Text kommt aus dem Übersetzungs-Schlüssel samt Platzhalter', () => {
    const { container } = baueAnsicht(RUMPF, {
      setModel: { hinweis: 'canvas.befunde', hinweisWerte: { count: 3 } },
    });
    expect(container.querySelector('.canvas-hinweis').textContent).toBe(
      de['canvas.befunde'].replace('{count}', '3'),
    );
  });

  it('ohne Hinweis bleibt die Zeile verborgen', () => {
    const { container } = baueAnsicht();
    expect(container.querySelector('.canvas-hinweis').hidden).toBe(true);
  });

  it('ein Render-Fehler leert die Fläche nicht, sondern zeigt den Klartext', () => {
    const { container } = baueAnsicht(RUMPF, {
      options: {
        renderMarkdown: () => {
          throw new Error('kaputt');
        },
      },
    });
    expect(karten(container)).toHaveLength(2);
    expect(container.querySelector('.canvas-karte-inhalt').textContent).toContain('Ausgangslage');
  });

  it('destroy meldet die Fenster-Listener ab und entfernt das DOM', () => {
    // Ohne das überlebte jede geschlossene Ansicht als Leck im Fenster —
    // der belegte Befund der Mindmap-Ansicht.
    const abmelden = vi.spyOn(window, 'removeEventListener');
    const { container, view } = baueAnsicht();
    view.destroy();
    expect(container.querySelector('.canvas-view')).toBeNull();
    const arten = abmelden.mock.calls.map((c) => c[0]);
    expect(arten).toContain('mousemove');
    expect(arten).toContain('mouseup');
    abmelden.mockRestore();
  });
});

describe('Canvas-Renderer: Farben nur aus dem Theme (4T-001653, AK6)', () => {
  const quelle = readFileSync(
    path.join(wurzel, 'src/renderer/modules/canvas/canvas-view.js'),
    'utf8',
  );

  it('die Komponente setzt keinen Farbwert', () => {
    // Hexcode, rgb()/hsl() und die benannten Farben sind allesamt Werte; die
    // Komponente vergibt nur Klassen, die Zuordnung steht im Stilblatt.
    const farbmuster = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:red|blue|green|black|white)\b/;
    const funde = quelle
      .split('\n')
      .filter((z) => farbmuster.test(z))
      .filter((z) => !z.trimStart().startsWith('//') && !z.trimStart().startsWith('*'));
    expect(funde, `Farbwerte in canvas-view.js:\n${funde.join('\n')}`).toEqual([]);
  });

  it('das Stilblatt bezieht seine Farben aus Theme-Variablen', () => {
    const css = readFileSync(path.join(wurzel, 'src/renderer/styles/canvas.css'), 'utf8');
    for (const regel of ['.canvas-karte', '.canvas-linie-pfad', '.canvas-hinweis']) {
      const block = new RegExp(`\\${regel} \\{([^}]*)\\}`).exec(css);
      expect(block, `Regel ${regel} nicht gefunden`).not.toBeNull();
      expect(block[1], `${regel} ohne Theme-Variable`).toMatch(/var\(--/);
    }
  });
});

describe('Canvas-Renderer: Reiter mehrerer Flächen (4T-001677)', () => {
  // **Anordnung des Product Owners vom 2026-09-09.** Ein Dokument kann jede
  // Fence beliebig oft enthalten. Ohne Reiter wäre die zweite Fläche im Text
  // vorhanden, aber nur über einen Umweg im Quelltext erreichbar.
  const ZWEITE = '!karte z1 x=0 y=0 b=200 h=100\n# Zweite Fläche\n\nText.';
  const DRITTE = '!karte d1 x=0 y=0 b=200 h=100\nOhne Überschrift.';

  const reiter = (c) => c.querySelectorAll('.canvas-reiter');
  const leiste = (c) => c.querySelector('.canvas-reiterleiste');

  it('AK1: je Fläche ein Reiter, der gewählte ist erkennbar', () => {
    const { container } = baueAnsicht([RUMPF, ZWEITE]);
    expect(reiter(container)).toHaveLength(2);
    expect(reiter(container)[0].classList.contains('canvas-reiter-aktiv')).toBe(true);
    expect(reiter(container)[0].getAttribute('aria-selected')).toBe('true');
    expect(reiter(container)[1].getAttribute('aria-selected')).toBe('false');
  });

  it('AK2: ein Klick wechselt die gezeigte Fläche', () => {
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    expect(container.querySelector('.canvas-karte').dataset.canvasId).toBe('k1');
    reiter(container)[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(view.getStats().gewaehlt).toBe(1);
    expect(container.querySelectorAll('.canvas-karte')).toHaveLength(1);
    expect(container.querySelector('.canvas-karte').dataset.canvasId).toBe('z1');
    expect(reiter(container)[1].classList.contains('canvas-reiter-aktiv')).toBe(true);
  });

  it('AK3: bei genau einer Fläche erscheint keine Leiste', () => {
    // Ein Reiter, der als einziger dasteht, ist kein Zugang, sondern
    // verschenkte Höhe.
    const { container, view } = baueAnsicht(RUMPF);
    expect(leiste(container).hidden).toBe(true);
    expect(view.getStats().reiterSichtbar).toBe(false);
  });

  it('AK4: die Leiste steht innerhalb der Ansicht und über der Bühne', () => {
    // Damit sitzt sie unterhalb der Dokument-Reiterleiste und nur über der
    // Breite des Dokument-Bereichs: .pane-canvas liegt zwischen den beiden
    // Seitenleisten-Containern, die davon unberührt bleiben.
    const { container } = baueAnsicht([RUMPF, ZWEITE]);
    const kinder = [...container.querySelector('.canvas-view').children].map((el) => el.className);
    expect(kinder.indexOf('canvas-reiterleiste')).toBe(0);
    expect(kinder.indexOf('canvas-reiterleiste')).toBeLessThan(kinder.indexOf('canvas-buehne'));
  });

  it('AK5: die Beschriftung kommt aus der ersten Karte, ohne Markdown-Zeichen', () => {
    const { container } = baueAnsicht([RUMPF, ZWEITE]);
    expect(reiter(container)[0].textContent).toBe('Ausgangslage');
    expect(reiter(container)[1].textContent).toBe('Zweite Fläche');
  });

  it('AK5: ohne brauchbaren Text greift die lokalisierte Zählung', () => {
    const { container } = baueAnsicht(['!karte a1 x=0 y=0 b=10 h=10', DRITTE]);
    expect(reiter(container)[0].textContent).toBe(de['canvas.flaecheNummer'].replace('{n}', '1'));
    // Die zweite hat Text, wenn auch keine Überschrift.
    expect(reiter(container)[1].textContent).toBe('Ohne Überschrift.');
  });

  it('AK6: die Wahl überlebt eine Live-Aktualisierung', () => {
    // Ohne das spränge die Ansicht bei jedem Tastendruck auf die erste Fläche
    // zurück — genau dann, wenn der Nutzer an der zweiten arbeitet.
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    reiter(container)[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    view.setFlaechen(flaechenAus([RUMPF, `${ZWEITE}\n\n!karte z2 x=9 y=9 b=9 h=9\nNeu`]));
    expect(view.getStats().gewaehlt).toBe(1);
    expect(view.getStats().karten).toBe(2);
  });

  it('AK6: die Wahl folgt der Fläche, wenn eine davor eingefügt wird', () => {
    // Die Stelle im Dokument ist der Anker; sie wandert mit.
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    reiter(container)[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const gewaehlteFlaeche = flaechenAus([RUMPF, ZWEITE])[1];
    const neu = [
      { ...flaechenAus([DRITTE])[0], startZeile: 1, nummer: 1 },
      { ...flaechenAus([RUMPF])[0], startZeile: 50, nummer: 2 },
      { ...gewaehlteFlaeche, nummer: 3 },
    ];
    view.setFlaechen(neu);
    expect(view.getStats().gewaehlt).toBe(2);
  });

  it('AK7: fällt die gewählte Fläche weg, bleibt die Ansicht nicht leer', () => {
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    reiter(container)[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    view.setFlaechen(flaechenAus([RUMPF]));
    expect(view.getStats().gewaehlt).toBe(0);
    expect(view.getStats().karten).toBeGreaterThan(0);
    expect(leiste(container).hidden).toBe(true);
  });

  it('der Wechsel passt die neue Fläche ein', () => {
    // Jede Fläche hat ihr eigenes Koordinatensystem; der Ausschnitt der
    // vorigen wäre auf der neuen bedeutungslos.
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    view.reset();
    const vorher = view.getStats();
    reiter(container)[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(view.getStats().tx).not.toBe(vorher.tx);
  });

  it('ein Klick auf den bereits gewählten Reiter ändert nichts', () => {
    const { container, view } = baueAnsicht([RUMPF, ZWEITE]);
    const vorher = view.getStats();
    reiter(container)[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(view.getStats()).toEqual(vorher);
  });
});
