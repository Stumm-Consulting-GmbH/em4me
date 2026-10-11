// @vitest-environment jsdom
// 4T-002161 (Epic 3E-000149): Prueffaelle der Folien-Darstellung - Theme-Slots
// als Variablen an der Folie, Geometrie 16:9 und 4:3 samt Skalierung bei
// gegebener Spaltengroesse, die `bg`-Schreibweise nach Marp mit Zweiteilung,
// der Weg der Hintergrund-Bilder durch die Render-Pipeline, Seitenzahl, Kopf-
// und Fusszeile, die Ueberlauf-Markierung und die Hinweis-Zeile der Flaeche.
//
// jsdom misst nicht: Spaltengroesse und Inhaltshoehe werden je Fall ueber
// `clientWidth`/`clientHeight`/`scrollHeight` am Element gestellt. Die
// Render-Pipeline ist die echte (`renderMarkdown` aus src/shared), ausser in
// den Bild-Faellen: Dort steht eine Attrappe des Bild-Aufloesers, die wie die
// Preload-Seite aus der Adresse eine `data:`-Adresse macht und eine fehlende
// Datei ohne Quelle laesst.
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import markdownModul, { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';
import {
  bgAngabe,
  hintergrundAnordnung,
  hintergrundBilderZiehen,
} from '../../../src/shared/presentation/presentation-darstellung.js';
import { FOLIEN_THEMES } from '../../../src/shared/presentation/presentation-themes.js';
import { COLOR_SLOTS } from '../../../src/shared/color-schemes.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));

vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/i18n.js', () => ({
  t: (key) => de[key] ?? key,
}));

window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
  lesePraesentation: null,
};

const {
  baueFolie,
  beobachteBuehne,
  passeFolieEin,
  pruefeUeberlauf,
  zeichneFolie,
  UEBERLAUF_ZUSTAND,
} = await import('../../../src/renderer/modules/presentation/presentation-folie.js');
const { initPresentationPane, renderPresentation } =
  await import('../../../src/renderer/modules/presentation/presentation-pane.js');

// Die echte Pipeline, wie die Flaeche sie hereinreicht.
const echt = (markdown) => renderMarkdown(markdown, 'de', { frontmatterBlock: false });

// Attrappe des Bild-Aufloesers: Die Pipeline rendert, danach wird `src` wie im
// Preload ersetzt; `fehlt.png` steht fuer eine fehlende Datei (ohne Quelle).
const aufloeser = vi.fn((markdown) =>
  echt(markdown).replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (_m, vor, src, nach) =>
    src === 'fehlt.png'
      ? `<img${vor}${nach}>`
      : `<img${vor}data-src-original="${src}" src="data:image/png;base64,QUJD"${nach}>`,
  ),
);

const teil = (huelle, klasse) => huelle.querySelector(`.${klasse}`);
const slideVon = (huelle) => teil(huelle, 'presentation-slide');

function zeichne(quelltext, kopf = {}, { index = 0, render = aufloeser } = {}) {
  const huelle = baueFolie();
  document.body.append(huelle);
  const ergebnis = zeichneFolie(huelle, { folie: { quelltext }, index, kopf, render });
  return { huelle, slide: slideVon(huelle), ergebnis };
}

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  aufloeser.mockClear();
});

describe('Theme-Slots an der Folie (AK1, AK4, AK5)', () => {
  it('setzt jeden Slot des gewaehlten Themes als --slide-<slot> an die Folie', () => {
    const { slide, ergebnis } = zeichne('# Titel', { theme: 'dark' });
    expect(ergebnis.name).toBe('dark');
    expect(slide.dataset.theme).toBe('dark');
    for (const [slot, wert] of Object.entries(FOLIEN_THEMES.dark)) {
      expect(slide.style.getPropertyValue(`--slide-${slot}`)).toBe(wert);
    }
  });

  it('ohne Angabe gilt light; die Uebersteuerung im Block wirkt nur auf ihren Slot', () => {
    expect(slideVon(zeichne('x').huelle).dataset.theme).toBe('light');
    const { slide } = zeichne('x', { theme: { name: 'dark', accent: '#c0392b' } });
    expect(slide.style.getPropertyValue('--slide-accent')).toBe('#c0392b');
    expect(slide.style.getPropertyValue('--slide-background')).toBe(FOLIEN_THEMES.dark.background);
  });

  it('ein unbekanntes Theme zeigt die Folie in light und liefert den Befund', () => {
    const { slide, ergebnis, huelle } = zeichne('# Inhalt', { theme: 'gaia' });
    expect(slide.dataset.theme).toBe('light');
    expect(ergebnis.befunde).toEqual([{ code: 'themeUnbekannt', detail: 'gaia' }]);
    // Nie eine leere Folie.
    expect(teil(huelle, 'praesentation-folie').textContent.trim()).toBe('Inhalt');
  });
});

describe('Geometrie und Skalierung (AK2)', () => {
  it('16:9 hat die Entwurfsgroesse 1280 x 720, 4:3 die Groesse 960 x 720', () => {
    const breit = zeichne('x').slide;
    expect(breit.dataset.size).toBe('16:9');
    expect([breit.style.width, breit.style.height]).toEqual(['1280px', '720px']);
    const schmal = zeichne('x', { size: '4:3' }).slide;
    expect(schmal.dataset.size).toBe('4:3');
    expect([schmal.style.width, schmal.style.height]).toEqual(['960px', '720px']);
  });

  function buehneMit(huelle, breite, hoehe) {
    const buehne = document.createElement('div');
    buehne.append(huelle);
    Object.defineProperty(buehne, 'clientWidth', { configurable: true, value: breite });
    Object.defineProperty(buehne, 'clientHeight', { configurable: true, value: hoehe });
    return buehne;
  }

  it('passt die Folie gleichmaessig in die Spalte ein, mit 24px Rand ringsum', () => {
    const { huelle, slide } = zeichne('x');
    const buehne = buehneMit(huelle, 688, 900);
    expect(passeFolieEin(buehne)).toBe(0.5);
    expect(slide.style.transform).toBe('scale(0.5)');
    expect([huelle.style.width, huelle.style.height]).toEqual(['640px', '360px']);
  });

  it('4:3 wird mit seiner eigenen Geometrie eingepasst', () => {
    const { huelle, slide } = zeichne('x', { size: '4:3' });
    const buehne = buehneMit(huelle, 2000, 408);
    expect(passeFolieEin(buehne)).toBe(0.5);
    expect([huelle.style.width, huelle.style.height]).toEqual(['480px', '360px']);
    expect(slide.style.transform).toBe('scale(0.5)');
  });

  it('eine verborgene Spalte (Groesse 0) laesst die letzte Einpassung stehen', () => {
    const { huelle, slide } = zeichne('x');
    passeFolieEin(buehneMit(huelle, 688, 900));
    expect(passeFolieEin(buehneMit(huelle, 0, 0))).toBeNull();
    expect(slide.style.transform).toBe('scale(0.5)');
  });

  it('folgt der Spaltengroesse ueber den ResizeObserver', () => {
    const beobachter = [];
    const vorher = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(rueckruf) {
        this.rueckruf = rueckruf;
        beobachter.push(this);
      }
      observe(el) {
        this.el = el;
      }
    };
    try {
      const { huelle, slide } = zeichne('x');
      const buehne = buehneMit(huelle, 688, 900);
      beobachteBuehne(buehne);
      expect(beobachter).toHaveLength(1);
      expect(beobachter[0].el).toBe(buehne);
      Object.defineProperty(buehne, 'clientWidth', { configurable: true, value: 1328 });
      beobachter[0].rueckruf([]);
      expect(slide.style.transform).toBe('scale(1)');
      // Ein zweites Anhaengen an dieselbe Buehne beobachtet nicht doppelt.
      beobachteBuehne(buehne);
      expect(beobachter).toHaveLength(1);
    } finally {
      globalThis.ResizeObserver = vorher;
    }
  });
});

describe('Hintergrund-Angaben nach Marp: Grammatik (AK6)', () => {
  it.each([
    ['bg', { groesse: 'cover', seite: null, breite: '50%', vertikal: false }],
    ['bg cover', { groesse: 'cover', seite: null, breite: '50%', vertikal: false }],
    ['bg contain', { groesse: 'contain', seite: null, breite: '50%', vertikal: false }],
    ['bg fit', { groesse: 'contain', seite: null, breite: '50%', vertikal: false }],
    ['bg auto', { groesse: 'auto', seite: null, breite: '50%', vertikal: false }],
    ['bg 50%', { groesse: '50%', seite: null, breite: '50%', vertikal: false }],
    ['bg left', { groesse: 'cover', seite: 'left', breite: '50%', vertikal: false }],
    ['bg right:33%', { groesse: 'cover', seite: 'right', breite: '33%', vertikal: false }],
    ['bg left:40% contain', { groesse: 'contain', seite: 'left', breite: '40%', vertikal: false }],
    ['bg vertical', { groesse: 'cover', seite: null, breite: '50%', vertikal: true }],
    ['bg blur sepia', { groesse: 'cover', seite: null, breite: '50%', vertikal: false }],
    ['bg right:100%', { groesse: 'cover', seite: 'right', breite: '50%', vertikal: false }],
  ])('%s', (alt, erwartet) => {
    expect(bgAngabe(alt)).toEqual(erwartet);
  });

  it.each([['Bild'], ['bgx'], ['Ein bg Bild'], ['']])('%j ist kein Hintergrund', (alt) => {
    expect(bgAngabe(alt)).toBeNull();
  });

  it('zieht Hintergrund-Bilder aus dem Quelltext, die Zeilen-Zaehlung bleibt', () => {
    const quelle = [
      '# Titel',
      '![bg left:40%](a.png)',
      'Text mit ![Bild](b.png) und ![bg](c.png "Titel")',
      '```',
      '![bg](im-zaun.png)',
      '```',
      'Code `![bg](in-spanne.png)` bleibt',
    ].join('\n');
    const r = hintergrundBilderZiehen(quelle);
    expect(r.bilder.map((b) => b.markdown)).toEqual([
      '![bg left:40%](a.png)',
      '![bg](c.png "Titel")',
    ]);
    expect(r.bilder[0].angabe.seite).toBe('left');
    expect(r.quelltext.split('\n')).toEqual([
      '# Titel',
      '',
      'Text mit ![Bild](b.png) und ',
      '```',
      '![bg](im-zaun.png)',
      '```',
      'Code `![bg](in-spanne.png)` bleibt',
    ]);
  });

  it('die Anordnung folgt dem ersten Bild mit Seite; ohne Seite ganzflaechig', () => {
    const angaben = (alts) => alts.map((alt) => ({ angabe: bgAngabe(alt) }));
    expect(hintergrundAnordnung(angaben(['bg', 'bg right:30%']))).toEqual({
      seite: 'right',
      breite: '30%',
      vertikal: false,
    });
    expect(hintergrundAnordnung(angaben(['bg vertical', 'bg'])).seite).toBeNull();
    expect(hintergrundAnordnung([]).seite).toBeNull();
  });
});

describe('Hintergrund und Zweiteilung an der Folie (AK6)', () => {
  const bilderIn = (slide) => [...slide.querySelectorAll('.presentation-slide-bg img')];

  it('ein Hintergrund-Bild durchlaeuft die Render-Pipeline samt Bild-Aufloeser', () => {
    const { slide, huelle } = zeichne('# Titel\n\n![bg](bild.png)');
    expect(aufloeser).toHaveBeenCalledWith('![bg](bild.png)');
    const [img] = bilderIn(slide);
    expect(img.getAttribute('src')).toBe('data:image/png;base64,QUJD');
    expect(img.getAttribute('data-src-original')).toBe('bild.png');
    expect(img.classList).toContain('presentation-bg-bild--cover');
    expect(slide.classList).toContain('presentation-slide--hintergrund');
    // Der Inhalt zeigt das Bild nicht noch einmal.
    expect(teil(huelle, 'praesentation-folie').querySelector('img')).toBeNull();
    // Kein Weg ueber ein Stil-Attribut mit Bild-Adresse.
    expect(huelle.querySelectorAll('[style*="url("]')).toHaveLength(0);
  });

  it.each([
    ['![bg contain](b.png)', 'presentation-bg-bild--contain', ''],
    ['![bg fit](b.png)', 'presentation-bg-bild--contain', ''],
    ['![bg auto](b.png)', 'presentation-bg-bild--auto', ''],
    ['![bg 60%](b.png)', 'presentation-bg-bild--prozent', '60%'],
  ])('%s setzt die Groesse', (zeile, klasse, breite) => {
    const [img] = bilderIn(zeichne(zeile).slide);
    expect(img.classList).toContain(klasse);
    expect(img.style.width).toBe(breite);
  });

  it('bg left:40% teilt die Folie: Bildspalte links 40 %, Inhalt rechts daneben', () => {
    const { slide, huelle } = zeichne('![bg left:40%](b.png)\n\n# Rechts');
    expect(slide.classList).toContain('presentation-slide--geteilt-left');
    expect(teil(huelle, 'presentation-slide-bg').style.width).toBe('40%');
    const bereich = teil(huelle, 'presentation-slide-inhalt');
    expect(bereich.style.left).toBe('40%');
    expect(bereich.style.right).toBe('');
    expect(teil(huelle, 'praesentation-folie').textContent.trim()).toBe('Rechts');
  });

  it('bg right ohne Breite teilt zur Haelfte, Bild rechts', () => {
    const { slide, huelle } = zeichne('# Links\n\n![bg right](b.png)');
    expect(slide.classList).toContain('presentation-slide--geteilt-right');
    expect(teil(huelle, 'presentation-slide-bg').style.width).toBe('50%');
    expect(teil(huelle, 'presentation-slide-inhalt').style.right).toBe('50%');
  });

  it('mehrere Bilder stehen gleichmaessig nebeneinander, mit vertical uebereinander', () => {
    const neben = zeichne('![bg](a.png)\n![bg](b.png)').slide;
    expect(neben.querySelectorAll('.presentation-bg-zelle')).toHaveLength(2);
    expect(neben.querySelector('.presentation-slide-bg').classList).not.toContain('is-vertikal');
    const ueber = zeichne('![bg vertical](a.png)\n![bg](b.png)').slide;
    expect(ueber.querySelector('.presentation-slide-bg').classList).toContain('is-vertikal');
  });

  it('ein Bild ohne Quelle (fehlende Datei) entfaellt ohne Fehler', () => {
    const { slide, huelle } = zeichne('# Titel\n\n![bg](fehlt.png)');
    expect(bilderIn(slide)).toHaveLength(0);
    expect(slide.classList).not.toContain('presentation-slide--hintergrund');
    expect(teil(huelle, 'praesentation-folie').textContent.trim()).toBe('Titel');
  });

  it('ein neues Zeichnen raeumt Teilung und Bilder der vorigen Folie', () => {
    const huelle = baueFolie();
    zeichneFolie(huelle, {
      folie: { quelltext: '![bg left](a.png)' },
      index: 0,
      render: aufloeser,
    });
    zeichneFolie(huelle, { folie: { quelltext: '# Ohne' }, index: 1, render: aufloeser });
    const slide = slideVon(huelle);
    // Uebrig bleibt allein der Farbsatz des Themes (Befund vom 2026-10-10).
    expect(slide.className).toBe('presentation-slide presentation-slide--syntax-light');
    expect(teil(huelle, 'presentation-slide-inhalt').style.left).toBe('');
    expect(bilderIn(slide)).toHaveLength(0);
  });
});

describe('Seitenzahl, Kopf- und Fusszeile (4S-001052)', () => {
  it('paginate: true zeigt die laufende Nummer, ohne oder mit false keine', () => {
    const an = zeichne('x', { paginate: true }, { index: 2 }).huelle;
    expect(teil(an, 'presentation-slide-nummer').hidden).toBe(false);
    expect(teil(an, 'presentation-slide-nummer').textContent).toBe('3');
    for (const kopf of [{}, { paginate: false }]) {
      const aus = zeichne('x', kopf).huelle;
      expect(teil(aus, 'presentation-slide-nummer').hidden).toBe(true);
      expect(teil(aus, 'presentation-slide-nummer').textContent).toBe('');
    }
  });

  it('header und footer erscheinen mit gerendertem Inline-Markdown', () => {
    const { huelle } = zeichne(
      'x',
      { header: 'Vortrag **2026**', footer: '[Quelle](https://example.org) `v1`' },
      { render: echt },
    );
    const kopf = teil(huelle, 'presentation-slide-kopf');
    expect(kopf.hidden).toBe(false);
    expect(kopf.querySelector('strong').textContent).toBe('2026');
    expect(kopf.querySelector('p')).toBeNull();
    const fuss = teil(huelle, 'presentation-slide-fuss');
    expect(fuss.querySelector('a').getAttribute('href')).toBe('https://example.org');
    expect(fuss.querySelector('code').textContent).toBe('v1');
  });

  it('ohne Schluessel oder mit leerem Wert erscheint keine Zeile', () => {
    for (const kopf of [{}, { header: '', footer: '   ' }]) {
      const { huelle } = zeichne('x', kopf, { render: echt });
      expect(teil(huelle, 'presentation-slide-kopf').hidden).toBe(true);
      expect(teil(huelle, 'presentation-slide-fuss').hidden).toBe(true);
    }
  });

  it('ein Text ohne Absatz (etwa eine Ueberschrift) steht als Text', () => {
    const { huelle } = zeichne('x', { header: '# Kein Titel' }, { render: echt });
    expect(teil(huelle, 'presentation-slide-kopf').textContent).toBe('# Kein Titel');
  });
});

describe('Ueberlauf-Markierung (AK8)', () => {
  function stelleHoehen(huelle, scroll, client) {
    const artikel = teil(huelle, 'praesentation-folie');
    Object.defineProperty(artikel, 'scrollHeight', { configurable: true, value: scroll });
    Object.defineProperty(artikel, 'clientHeight', { configurable: true, value: client });
  }

  it('markiert die Folie, wenn der Inhalt ueber ihre Hoehe hinauslaeuft', () => {
    const { huelle, slide } = zeichne('# Viel');
    stelleHoehen(huelle, 900, 720);
    expect(pruefeUeberlauf(huelle)).toBe(true);
    expect(slide.classList).toContain(UEBERLAUF_ZUSTAND);
    const marke = teil(huelle, 'presentation-slide-ueberlauf');
    expect(marke.title).toBe(de['presentation.ueberlauf']);
    expect(marke.getAttribute('aria-label')).toBe('Inhalt läuft über die Folie hinaus');
  });

  it('nimmt die Markierung zurueck, wenn der Inhalt passt', () => {
    const { huelle, slide } = zeichne('# Wenig');
    stelleHoehen(huelle, 900, 720);
    pruefeUeberlauf(huelle);
    stelleHoehen(huelle, 720, 720);
    expect(pruefeUeberlauf(huelle)).toBe(false);
    expect(slide.classList).not.toContain(UEBERLAUF_ZUSTAND);
  });

  it('das Stilblatt zeigt die Markierung nur im Zustand und nie in der Vorfuehrung', () => {
    const css = lies('src/renderer/styles/presentation.css').replace(/\r\n/g, '\n');
    expect(css).toMatch(/\.presentation-slide-ueberlauf \{\n {2}display: none;/);
    expect(css).toMatch(
      /\.presentation-slide--ueberlauf \.presentation-slide-ueberlauf \{\n {2}display: block;/,
    );
    expect(css).toMatch(
      /body\.presentation-vorfuehrung \.presentation-slide-ueberlauf \{\n {2}display: none;/,
    );
    // Abgeschnitten wird an der Folie und an ihrem Inhalt.
    expect(css).toMatch(/\.presentation-slide \{[^}]*overflow: hidden;/);
  });
});

describe('Flaeche: Folie und Hinweis-Zeile (AK3, AK5)', () => {
  let container;
  let dokument;

  beforeEach(() => {
    container = document.createElement('section');
    document.body.append(container);
    window.api.renderMarkdown = (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen);
    window.api.lesePraesentation = (text, opts) =>
      lesePraesentation(text, { ...(opts || {}), md: markdownModul.md });
    initPresentationPane({
      getPaneEls: () => ({ presentationEl: container }),
      aktivesDokument: () => dokument,
      schreibmarkenZeile: () => 1,
    });
  });

  const oeffne = (kopfZeilen, rumpf) => {
    dokument = {
      content: ['---', 'presentation: true', ...kopfZeilen, '---', '', ...rumpf].join('\n'),
      viewMode: 'presentation',
      path: 'C:/Notizen/Vortrag.md',
    };
    renderPresentation(0);
    return container;
  };
  const hinweis = () => container.querySelector('.praesentation-hinweise');

  it('zeichnet die Folie mit Theme, Format, Seitenzahl, Kopf und Fuss aus dem Kopf', () => {
    oeffne(
      ['theme: dark', 'size: "4:3"', 'paginate: true', 'header: Kopf', 'footer: _Fuss_'],
      [
        '# Eins',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '$x^2$',
        '',
        '```js',
        'let a = 1;',
        '```',
      ],
    );
    const slide = container.querySelector('.presentation-slide');
    expect(slide.dataset.theme).toBe('dark');
    expect(slide.dataset.size).toBe('4:3');
    expect(container.querySelector('.presentation-slide-nummer').textContent).toBe('1');
    expect(container.querySelector('.presentation-slide-kopf').textContent).toBe('Kopf');
    expect(container.querySelector('.presentation-slide-fuss em').textContent).toBe('Fuss');
    const inhalt = container.querySelector('.praesentation-folie');
    expect(inhalt.querySelector('h1').textContent).toBe('Eins');
    expect(inhalt.querySelector('table')).not.toBeNull();
    expect(inhalt.querySelector('.katex')).not.toBeNull();
    expect(inhalt.querySelector('pre code')).not.toBeNull();
    // Der Kopf erscheint nicht auf der Folie.
    expect(inhalt.textContent).not.toContain('presentation');
    expect(hinweis().hidden).toBe(true);
  });

  it('benennt ein unbekanntes Theme und einen ungueltigen Slot-Wert in der Hinweis-Zeile', () => {
    oeffne(['theme:', '  name: gaia', '  accent: "url(x.png)"', '  farbe: rot'], ['# Eins']);
    expect(hinweis().hidden).toBe(false);
    const text = hinweis().textContent;
    expect(text).toContain('Unbekanntes Theme „gaia“');
    expect(text).toContain('Ungültiger Wert für „accent“');
    expect(text).toContain('Unbekannter Gestaltungs-Wert „farbe“');
    // Rueckfall statt leerer Folie.
    expect(container.querySelector('.presentation-slide').dataset.theme).toBe('light');
    expect(container.querySelector('.praesentation-folie h1')).not.toBeNull();
  });

  it('benennt ein unbekanntes Format und zeigt 16:9', () => {
    oeffne(['size: "5:4"'], ['# Eins']);
    expect(hinweis().textContent).toBe('Unbekanntes Folien-Format „5:4“; gezeigt wird 16:9.');
    expect(container.querySelector('.presentation-slide').dataset.size).toBe('16:9');
  });

  it('zwei Folien mit gleichem Inhalt tragen je ihre eigene Seitenzahl', () => {
    oeffne(['paginate: true'], ['# Gleich', '', '---', '', '# Gleich']);
    expect(container.querySelector('.presentation-slide-nummer').textContent).toBe('1');
    container
      .querySelector('.praesentation-flaeche')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(container.querySelector('.presentation-slide-nummer').textContent).toBe('2');
  });
});

// Befund der Abnahme vom 2026-10-10: Tabellen-Kopf, Code-Bloecke, Rahmen,
// Verweise, Zitate und Linien folgten dem Farbschema der Anwendung (Ansicht)
// bzw. dem erzwungenen hellen Schema (PDF, HTML-Seiten) statt dem Theme der
// Folie. jsdom berechnet color-mix nicht; geprueft werden die Regeln im
// Stilblatt als Text und die Klassen an der Folie.
describe('Inhalts-Farben aus dem Folien-Theme (Befund der Abnahme vom 2026-10-10)', () => {
  const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r\n/g, '\n');
  const praesentation = ohneKommentare(lies('src/renderer/styles/presentation.css'));
  const slideBlock = praesentation.match(/(^|\n)\.presentation-slide \{([^}]*)\}/)[2];
  const gesetzt = new Set(Array.from(slideBlock.matchAll(/(--[a-z0-9-]+):/g), (m) => m[1]));

  // Die Farb-Variablen des Anwendungs-Farbschemas, die eine Inhalts-Regel
  // (Selektor mit .markdown-body, ohne Druck- und Dunkel-Zustand) liest.
  function inhaltsVariablen() {
    const ordner = path.join(wurzel, 'src/renderer/styles');
    const dateien = [
      'src/renderer/styles.css',
      ...readdirSync(ordner)
        .filter((n) => n.endsWith('.css') && n !== 'presentation.css')
        .map((n) => `src/renderer/styles/${n}`),
    ];
    const schema = new Set(COLOR_SLOTS.flatMap((s) => s.vars));
    const aus = new Set();
    for (const datei of dateien) {
      const css = ohneKommentare(lies(datei));
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selektoren = m[1].split(',').map((s) => s.trim());
        const inhalt = selektoren.some(
          (s) =>
            s.includes('.markdown-body') && !s.includes('data-theme') && !s.includes('printing'),
        );
        if (!inhalt) continue;
        for (const v of m[2].matchAll(/var\((--[a-z0-9-]+)/g)) if (schema.has(v[1])) aus.add(v[1]);
      }
    }
    return aus;
  }

  it('jede Farb-Variable, die der gerenderte Inhalt liest, wird an der Folie aus den Slots gesetzt', () => {
    const gelesen = inhaltsVariablen();
    // Die Erhebung muss die Faelle des Befunds enthalten, sonst misst sie nichts.
    for (const v of ['--bg-alt', '--border', '--code-bg', '--accent', '--fg-muted']) {
      expect(gelesen.has(v), v).toBe(true);
    }
    // Ausnahme: die Warnfarbe ist keine Theme-Farbe (Hinweis-Zeilen von Abfragen).
    const ausnahmen = new Set(['--linter-warn']);
    const fehlend = [...gelesen].filter((v) => !ausnahmen.has(v) && !gesetzt.has(v));
    expect(fehlend).toEqual([]);
    // Jede gesetzte Farb-Variable kommt aus den Slots der Folie, nie aus der Oberflaeche.
    for (const v of gelesen) {
      if (ausnahmen.has(v)) continue;
      const wert = slideBlock.match(new RegExp(`${v}: ([^;]+);`))[1];
      expect(wert, v).toMatch(/var\(--slide-[a-z-]+\)/);
      expect(wert, v).not.toMatch(/var\(--(?!slide-)/);
    }
  });

  it('Tabellen-Kopf, Code-Block, Rahmen und Inline-Code mischen die Textfarbe in den Hintergrund', () => {
    const mischung = (v) => slideBlock.match(new RegExp(`${v}: ([^;]+);`))[1];
    const prozent = (v) =>
      Number(
        mischung(v).match(
          /^color-mix\(in srgb, var\(--slide-text\) (\d+)%, var\(--slide-background\)\)$/,
        )[1],
      );
    expect(prozent('--bg-alt')).toBeGreaterThanOrEqual(10);
    expect(prozent('--bg-alt')).toBeLessThanOrEqual(12);
    expect(prozent('--code-bg')).toBeGreaterThanOrEqual(10);
    expect(prozent('--code-bg')).toBeLessThanOrEqual(12);
    expect(prozent('--border')).toBe(22);
    expect(mischung('--accent')).toBe('var(--slide-accent)');
    expect(mischung('--syntax-link')).toBe('var(--slide-accent)');
    expect(praesentation).toMatch(
      /\.presentation-slide \.markdown-body :not\(pre\) > code \{\n {2}background: var\(--slide-code-inline-bg\);/,
    );
    expect(praesentation).toMatch(
      /\.presentation-slide \.markdown-body blockquote \{\n {2}border-left-color: var\(--slide-accent\);/,
    );
  });

  it('die Code-Flaechen haengen am Farbsatz: hell mit der Textfarbe gemischt, dunkel ins Dunkle', () => {
    const satzBlock = (satz) =>
      praesentation.match(
        new RegExp(`\\.presentation-slide\\.presentation-slide--syntax-${satz} \\{([^}]*)\\}`),
      )[1];
    const wert = (block, v) => block.match(new RegExp(`${v}: ([^;]+);`))[1];
    const hell = satzBlock('light');
    expect(wert(hell, '--code-bg')).toBe(
      'color-mix(in srgb, var(--slide-text) 11%, var(--slide-background))',
    );
    expect(wert(hell, '--slide-code-inline-bg')).toBe(
      'color-mix(in srgb, var(--slide-text) 8%, var(--slide-background))',
    );
    const dunkel = satzBlock('dark');
    expect(wert(dunkel, '--code-bg')).toBe(
      'color-mix(in srgb, black 22%, var(--slide-background))',
    );
    expect(wert(dunkel, '--slide-code-inline-bg')).toBe(
      'color-mix(in srgb, black 14%, var(--slide-background))',
    );
  });

  it('data-theme an der Folie meint ihre Helligkeit: light, dark und accent ergeben light, dark, dark', () => {
    const helligkeit = (theme) => zeichne('x', { theme }).slide.dataset.theme;
    expect(helligkeit('light')).toBe('light');
    expect(helligkeit('dark')).toBe('dark');
    expect(helligkeit('accent')).toBe('dark');
    // Rueckfall und Uebersteuerung: die Helligkeit des Basis-Themes.
    expect(helligkeit('gaia')).toBe('light');
    expect(helligkeit({ name: 'accent', background: '#ffffff' })).toBe('dark');
  });

  it('jedes Theme waehlt seinen Farbsatz der Code-Bloecke als Klasse an der Folie', () => {
    const satz = (theme) => {
      const { slide } = zeichne('```js\nlet a = 1;\n```', { theme });
      return ['light', 'dark'].filter((s) =>
        slide.classList.contains(`presentation-slide--syntax-${s}`),
      );
    };
    expect(satz('light')).toEqual(['light']);
    expect(satz('dark')).toEqual(['dark']);
    expect(satz('accent')).toEqual(['dark']);
    expect(satz(undefined)).toEqual(['light']);
    // Ein neues Zeichnen mit anderem Theme tauscht den Satz, statt beide zu tragen.
    const huelle = baueFolie();
    document.body.append(huelle);
    zeichneFolie(huelle, {
      folie: { quelltext: 'x' },
      index: 0,
      kopf: { theme: 'dark' },
      render: echt,
    });
    zeichneFolie(huelle, {
      folie: { quelltext: 'x' },
      index: 0,
      kopf: { theme: 'light' },
      render: echt,
    });
    const slide = slideVon(huelle);
    expect(slide.classList).toContain('presentation-slide--syntax-light');
    expect(slide.classList).not.toContain('presentation-slide--syntax-dark');
  });

  it('die Syntax-Regeln der Folie decken jede Token-Regel der Anwendung ab, je Satz mit eigenen Werten', () => {
    const hljs = ohneKommentare(lies('src/renderer/hljs-themes.css'));
    const hell = hljs.slice(0, hljs.indexOf('[data-theme="dark"] .hljs {'));
    const token = new Set(
      Array.from(hell.matchAll(/:root:not\(\[data-theme="dark"\]\) ([^,{]+?)\s*[,{]/g), (m) =>
        m[1].trim(),
      ),
    );
    expect(token.size).toBeGreaterThan(30);
    for (const t of token) {
      const regel = `.presentation-slide .praesentation-folie.markdown-body ${t}`;
      expect(praesentation.includes(`${regel},`) || praesentation.includes(`${regel} {`), t).toBe(
        true,
      );
    }
    // Beide Saetze belegen dieselben Variablen.
    const satzVars = (satz) =>
      Array.from(
        praesentation
          .match(new RegExp(`\\.presentation-slide--syntax-${satz} \\{([^}]*)\\}`))[1]
          .matchAll(/(--slide-[a-z-]+):/g),
        (m) => m[1],
      );
    expect(satzVars('light').length).toBeGreaterThan(10);
    expect(satzVars('dark')).toEqual(satzVars('light'));
    // Werte: die beiden Saetze aus hljs-themes.css (Grundfarbe als Stichprobe).
    expect(praesentation).toMatch(/--syntax-light \{[^}]*\n {2}--slide-hl-text: #24292e;/);
    expect(praesentation).toMatch(/--syntax-dark \{[^}]*\n {2}--slide-hl-text: #c9d1d9;/);
    // Die Markierung folgt demselben Satz.
    expect(praesentation).toMatch(
      /\.presentation-slide \.praesentation-folie\.markdown-body mark \{\n {2}background: var\(--slide-mark-bg\);\n {2}color: var\(--slide-mark-text\);/,
    );
  });
});
