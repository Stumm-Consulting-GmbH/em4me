// @vitest-environment jsdom
// 4T-001893 (Epic 3E-000324): Prüffälle «Suche in der Mindmap-Ansicht» — der
// Suchraum der Karte hinter der Suchleiste (Story 4S-000996, Weg A: Markieren
// und Hinspringen, Entscheidung des Product Owners vom 2026-09-23).
//
// **Der bestätigte Fall** (4T-001888): Die Suchleiste zählte in der
// Mindmap-Ansicht die Treffer der dort ausgeblendeten Lese-Ansicht, und in der
// Karte war nichts zu sehen. Die Fälle unten halten fest, dass die Zahl der
// Leiste jetzt die Treffer-Knoten der Karte nennt und dass genau diese Knoten
// hervorgehoben und angesprungen werden.
//
// **Zwei Teile.** Der erste misst das Modul gegen eine echte Zeichnung
// (createMindmapView mit einem Baum des Kerns); der zweite misst die Weiche der
// Suchleiste — Zähler, Beschriftung, F3, Beenden — gegen dieselbe Zeichnung.
// Den Zugang zur Karte, den sonst mindmap-pane.js hereinreicht, stellt der
// Test selbst, damit keine Preload-Brücke nötig ist. Die Übersetzung liest die
// gebaute deutsche Sprachdatei, damit Zähler und Hinweise im Wortlaut messbar
// sind.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';
import { mindmapAusDokument } from '../../../src/shared/mindmap-core.js';
import { md } from '../../../src/shared/markdown/markdown.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DE = JSON.parse(readFileSync(path.join(dir, '../../../src/i18n/de.json'), 'utf8'));
const tStub = (key) => DE[key] ?? key;

vi.mock('../../../src/renderer/i18n.js', async (original) => ({
  ...(await original()),
  t: (key) => DE[key] ?? key,
}));

const { createMindmapView } = await import('../../../src/renderer/modules/mindmap/mindmap-view.js');
const suche = await import('../../../src/renderer/modules/mindmap/mindmap-suche.js');
const leiste = await import('../../../src/renderer/modules/search/search.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

// Die Überschrift der Wurzel und der Fließtext darunter tragen das Wort, dazu
// ein Listenpunkt in einem Ast — drei Fundstellen, aber zwei Knoten.
const QUELLE = [
  '# Zitronenfalter',
  '',
  'Der Zitronenfalter fliegt früh im Jahr.',
  '',
  '## Falter im Garten',
  '',
  '- Kohlweißling',
  '- Zitronenfalter am Fenster',
  '',
  '## Andere Tiere',
  '',
  '- Igel',
  '- Amsel',
  '',
  'Die Amsel singt vom Zitronenbaum.',
  '',
].join('\n');

function baueKarte(text = QUELLE, setTree = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ansicht = createMindmapView(container, { t: tStub });
  const { root, gekappt } = mindmapAusDokument(text, md, { wurzelTitel: 'Datei' });
  ansicht.setTree(root, { gekappt, ...setTree });
  const tab = { path: 'C:/woanders/Falter.md', content: text, viewMode: 'mindmap' };
  suche.initMindmapSuche({ lage: (paneIdx) => (paneIdx === 0 ? { ansicht, tab } : null) });
  return { container, ansicht, tab };
}

const muster = (text, gross = false) => leiste.buildRegex(text, false, gross);
const treffer = (c) => [...c.querySelectorAll('.mindmap-treffer')];
const aktuell = (c) => c.querySelector('.mindmap-treffer-aktuell');
const titelVon = (g) => (g ? g.querySelector('.mindmap-titel').textContent : null);
const transform = (c) => c.querySelector('.mindmap-viewport').getAttribute('transform');

// Geräumt wird alles außer der Suchleiste: Sie merkt sich ihre Elemente beim
// ersten Zugriff und bleibt deshalb über alle Fälle stehen.
beforeEach(() => {
  suche.beendeMindmapSuche();
  for (const el of [...document.body.children]) {
    if (!el.querySelector('#search-bar')) el.remove();
  }
});

describe('Treffer der Mindmap ermitteln (4T-001893)', () => {
  it('findet Titel und Notiz-Text, in Zeichen-Reihenfolge, je Knoten einmal', () => {
    const { ansicht } = baueKarte();
    const liste = suche.ermittleMindmapTreffer(ansicht.knotenFuerSuche(), muster('zitronen'));
    const titel = ansicht.knotenFuerSuche();
    const nach = (key) => titel.find((k) => k.schluessel === key).titel;
    expect(liste.map((t) => nach(t.schluessel))).toEqual([
      'Zitronenfalter',
      'Zitronenfalter am Fenster',
      'Andere Tiere',
    ]);
    // Die Wurzel passt im Titel und in der Notiz, der zweite Ast nur in seiner
    // Notiz — der Absatz nach der Liste gehört zur Überschrift darüber.
    expect(liste.map((t) => [t.imTitel, t.inNotiz])).toEqual([
      [true, true],
      [true, false],
      [false, true],
    ]);
  });

  it('folgt dem Groß/Klein-Schalter der Suchleiste', () => {
    const { ansicht } = baueKarte();
    const knoten = ansicht.knotenFuerSuche();
    expect(suche.ermittleMindmapTreffer(knoten, muster('zitronenfalter', false))).toHaveLength(2);
    expect(suche.ermittleMindmapTreffer(knoten, muster('zitronenfalter', true))).toHaveLength(0);
  });

  it('leere Fundstellen eines regulären Ausdrucks zählen nicht', () => {
    const { ansicht } = baueKarte();
    const leer = leiste.buildRegex('^', true, false);
    expect(suche.ermittleMindmapTreffer(ansicht.knotenFuerSuche(), leer)).toEqual([]);
  });

  it('Knoten jenseits der Obergrenze des Kerns zählen nicht', () => {
    const zeilen = [];
    for (let i = 0; i < 3100; i++) zeilen.push(`- Punkt ${i}`);
    baueKarte(zeilen.join('\n'));
    // In der Karte stehen Punkt 0 bis 2998; «Punkt 30» passt dort auf 30 und
    // 300 bis 309. Die gekappten Punkte 3000 bis 3099 bleiben draußen.
    expect(suche.sucheInMindmap(0, muster('Punkt 30')).anzahl).toBe(11);
  });
});

describe('Markieren und Hinspringen (4T-001893)', () => {
  it('hebt alle Treffer-Knoten hervor und springt den ersten an', () => {
    const { container } = baueKarte();
    expect(suche.sucheInMindmap(0, muster('zitronen'))).toEqual({ anzahl: 3, aktuell: 0 });
    expect(treffer(container).map(titelVon)).toEqual([
      'Zitronenfalter',
      'Zitronenfalter am Fenster',
      'Andere Tiere',
    ]);
    expect(titelVon(aktuell(container))).toBe('Zitronenfalter');
    expect(transform(container)).toMatch(/^translate\(/);
  });

  it('ein Treffer allein in der Notiz trägt Kennzeichen und Hinweis', () => {
    const { container } = baueKarte();
    suche.sucheInMindmap(0, muster('zitronenbaum'));
    const [ast] = treffer(container);
    expect(titelVon(ast)).toBe('Andere Tiere');
    expect(ast.classList.contains('mindmap-treffer-notiz')).toBe(true);
    expect(ast.querySelector('.mindmap-treffer-hinweis').textContent).toBe(
      DE['search.mindmapNoteHit'],
    );
  });

  it('weiter und zurück laufen im Kreis', () => {
    const { container } = baueKarte();
    suche.sucheInMindmap(0, muster('zitronen'));
    expect(suche.naechsterMindmapTreffer()).toEqual({ anzahl: 3, aktuell: 1 });
    expect(titelVon(aktuell(container))).toBe('Zitronenfalter am Fenster');
    suche.naechsterMindmapTreffer();
    expect(suche.naechsterMindmapTreffer().aktuell).toBe(0);
    expect(suche.vorigerMindmapTreffer().aktuell).toBe(2);
    expect(titelVon(aktuell(container))).toBe('Andere Tiere');
  });

  it('das Anspringen verschiebt die Karte und lässt den Zoom stehen', () => {
    const { container } = baueKarte();
    const svg = container.querySelector('.mindmap-svg');
    svg.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -300, clientX: 5, clientY: 5 }));
    const zoom = /scale\(([\d.]+)\)/.exec(transform(container))[1];
    suche.sucheInMindmap(0, muster('zitronen'));
    const erst = transform(container);
    suche.naechsterMindmapTreffer();
    expect(transform(container)).not.toBe(erst);
    expect(/scale\(([\d.]+)\)/.exec(transform(container))[1]).toBe(zoom);
  });

  it('ein Treffer im eingeklappten Teilbaum zählt mit und wird beim Anspringen aufgeklappt', () => {
    const { container, ansicht } = baueKarte(QUELLE, { anfangsTiefe: 1 });
    const gezeigt = () =>
      [...container.querySelectorAll('.mindmap-titel')].map((t) => t.textContent);
    expect(gezeigt()).not.toContain('Zitronenfalter am Fenster');
    const eingeklappt = ansicht.getStats().eingeklappt;
    // Die Wurzel ist der erste Treffer; der Listenpunkt im Ast der zweite.
    expect(suche.sucheInMindmap(0, muster('zitronenfalter')).anzahl).toBe(2);
    expect(gezeigt()).not.toContain('Zitronenfalter am Fenster');
    suche.naechsterMindmapTreffer();
    expect(gezeigt()).toContain('Zitronenfalter am Fenster');
    expect(titelVon(aktuell(container))).toBe('Zitronenfalter am Fenster');
    expect(ansicht.getStats().eingeklappt).toBe(eingeklappt - 1);
    // Beim Beenden bleibt der Teilbaum offen — sonst verschwände der Fund.
    suche.beendeMindmapSuche();
    expect(gezeigt()).toContain('Zitronenfalter am Fenster');
  });

  it('das Beenden nimmt alle Hervorhebungen weg; Zoom und Lage bleiben', () => {
    const { container } = baueKarte();
    suche.sucheInMindmap(0, muster('zitronen'));
    const lage = transform(container);
    suche.beendeMindmapSuche();
    expect(treffer(container)).toHaveLength(0);
    expect(container.querySelectorAll('.mindmap-treffer-rahmen')).toHaveLength(0);
    expect(transform(container)).toBe(lage);
    expect(suche.mindmapSuchStand()).toEqual({ anzahl: 0, aktuell: -1 });
    // Weiterschalten ohne laufende Suche bewegt nichts.
    expect(suche.naechsterMindmapTreffer()).toEqual({ anzahl: 0, aktuell: -1 });
  });

  it('eine Neu-Ermittlung im selben Dokument behält den aktuellen Treffer und bewegt nichts', () => {
    const { container } = baueKarte();
    suche.sucheInMindmap(0, muster('zitronen'));
    suche.naechsterMindmapTreffer();
    const lage = transform(container);
    suche.beendeMindmapSuche();
    expect(suche.sucheInMindmap(0, muster('zitronen'), { behalteIndex: true }).aktuell).toBe(1);
    expect(transform(container)).toBe(lage);
  });

  it('nach einer Neu-Zeichnung folgt die Suche dem neuen Baum und meldet es', () => {
    const { ansicht } = baueKarte();
    const gemeldet = vi.fn();
    suche.sucheInMindmap(0, muster('zitronen'), { beiAenderung: gemeldet });
    const neu = mindmapAusDokument(QUELLE.replace('- Igel', '- Zitronenkäfer'), md, {});
    ansicht.setTree(neu.root, {});
    suche.aktualisiereMindmapSuche(0);
    expect(suche.mindmapSuchStand().anzahl).toBe(4);
    expect(gemeldet).toHaveBeenCalledTimes(1);
    // Ein anderer Bereich lässt die Suche unberührt.
    suche.aktualisiereMindmapSuche(1);
    expect(gemeldet).toHaveBeenCalledTimes(1);
  });

  it('ein leerer Baum liefert null Treffer, ohne zu brechen', () => {
    baueKarte('');
    expect(suche.sucheInMindmap(0, muster('zitronen'))).toEqual({ anzahl: 0, aktuell: -1 });
  });

  it('das Dokument bleibt unverändert: Suchen und Weiterschalten schreiben nichts', () => {
    const { ansicht, tab } = baueKarte();
    const vorher = JSON.stringify(ansicht.knotenFuerSuche());
    suche.sucheInMindmap(0, muster('zitronen'));
    suche.naechsterMindmapTreffer();
    suche.vorigerMindmapTreffer();
    suche.beendeMindmapSuche();
    expect(JSON.stringify(ansicht.knotenFuerSuche())).toBe(vorher);
    expect(tab.content).toBe(QUELLE);
  });
});

// Die Weiche der Suchleiste: dieselben Elemente wie index.html, soweit die
// Leiste sie greift.
function baueLeiste() {
  const html = [
    '<div id="search-bar" hidden>',
    '<input id="search-input"><input id="search-replace">',
    '<button id="btn-search-replace"></button><button id="btn-search-replace-all"></button>',
    '<span id="search-count"></span><span id="search-scope"></span>',
    '<button id="btn-search-case"></button><button id="btn-search-regex"></button>',
    '<button id="btn-search-help"></button><button id="btn-search-prev"></button>',
    '<button id="btn-search-next"></button><button id="btn-search-close"></button>',
    '</div>',
    '<div id="regex-help-popover" hidden><dl id="regex-help-list"></dl></div>',
  ].join('');
  const huelle = document.createElement('div');
  huelle.innerHTML = html;
  document.body.appendChild(huelle);
}

function setzeReiter(tab, bereich = null) {
  state.areaPath = bereich;
  state.panes[0].tabs = [tab];
  state.panes[0].activeIndex = 0;
  state.activePaneIndex = 0;
}

describe('Suchleiste in der Mindmap-Ansicht (4T-001893, der bestätigte Fall)', () => {
  let leisteGebaut = false;
  function bereite(bereich) {
    if (!leisteGebaut) {
      baueLeiste();
      leisteGebaut = true;
    }
    const karte = baueKarte();
    setzeReiter(karte.tab, bereich);
    leiste.search.caseSensitive = false;
    leiste.search.useRegex = false;
    leiste.openSearchBar();
    return karte;
  }
  const zaehler = () => document.getElementById('search-count').textContent;

  beforeEach(() => {
    if (leiste.search.visible) leiste.closeSearchBar();
  });

  for (const [lage, bereich] of [
    ['außerhalb eines Bereichs', null],
    ['innerhalb eines geöffneten Bereichs', 'C:/woanders'],
  ]) {
    it(`${lage}: der Zähler nennt die Treffer-Knoten der Karte, F3 springt, Schließen räumt`, () => {
      const { container } = bereite(bereich);
      leiste.search.query = 'zitronenfalter';
      leiste.performSearch();
      expect(leiste.search.scope).toBe('mindmap');
      expect(document.getElementById('search-scope').textContent).toBe(DE['search.scopeMindmap']);
      // Zwei Knoten, obwohl das Wort im Dokument dreimal steht.
      expect(zaehler()).toBe('1 / 2');
      expect(treffer(container)).toHaveLength(2);
      leiste.nextMatch();
      expect(zaehler()).toBe('2 / 2');
      expect(titelVon(aktuell(container))).toBe('Zitronenfalter am Fenster');
      leiste.prevMatch();
      expect(zaehler()).toBe('1 / 2');
      leiste.closeSearchBar();
      expect(treffer(container)).toHaveLength(0);
    });
  }

  it('ohne Fundstelle in der Karte steht «Keine Treffer», keine Zahl', () => {
    const { container } = bereite(null);
    leiste.search.query = 'Maulwurf';
    leiste.performSearch();
    expect(zaehler()).toBe(DE['search.noResults']);
    expect(treffer(container)).toHaveLength(0);
  });

  it('ein Wechsel in eine andere Ansicht beendet die Hervorhebung', () => {
    const { container, tab } = bereite(null);
    leiste.search.query = 'zitronenfalter';
    leiste.performSearch();
    expect(treffer(container)).toHaveLength(2);
    tab.viewMode = 'rendered';
    leiste.refreshSearchIfVisible();
    expect(leiste.search.scope).toBe('rendered');
    expect(treffer(container)).toHaveLength(0);
  });

  it('Ersetzen bleibt in der Karte gesperrt', () => {
    bereite(null);
    expect(document.getElementById('btn-search-replace').disabled).toBe(true);
    expect(document.getElementById('btn-search-replace-all').disabled).toBe(true);
  });
});
