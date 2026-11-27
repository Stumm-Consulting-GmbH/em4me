// @vitest-environment jsdom
// 4T-002797 (Epic 3E-000449): Der HTML-Export trägt keinen Quelltext eines
// Blocks mehr in unsichtbaren Angaben mit.
//
// Geprüft wird an den Blöcken, wie die Pipeline sie zeichnet (Datentabelle,
// Ereignis-Liste, Journal-Zeitleiste, Skript, Abfrage) und, wo erst die
// Ansicht die Angabe setzt (Diagramm, Datensatz-Block, Dashboard, Mermaid), am
// nachgebildeten Element:
//   - kein Attribut aus QUELLTEXT_ANGABEN und kein privater Kommentar in der
//     Datei, die übrigen Klassen und Angaben bleiben;
//   - die Datei sieht gleich aus: Keine Regel der echten Stilblätter und keine
//     Regel der Datei selbst nennt eine dieser Angaben, und je Element treffen
//     vor und nach dem Entfernen dieselben Regeln;
//   - die Datei funktioniert gleich: Sie enthält kein Programm, das eine
//     Angabe lesen könnte.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

vi.mock('../../../src/renderer/modules/views/print-preparation.js', () => ({
  withPrintPreparation: async () => ({ ok: true }),
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: () => {},
}));
vi.mock('../../../src/renderer/i18n.js', async () => {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const de = JSON.parse(
    fsMod.readFileSync(pathMod.resolve('src/i18n/fragments/de/document.json'), 'utf8'),
  );
  return { t: (k) => (k in de ? de[k] : k), intlLocale: () => 'de' };
});
vi.mock('../../../src/renderer/modules/app/api.js', () => ({ api: {} }));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  state: { activePaneIndex: 0 },
  getPaneEls: () => ({ content: null, renderedHtml: null }),
  tabDisplayName: () => 'B',
  withDialog: (fn) => fn(),
}));

const { QUELLTEXT_ANGABEN, EXPORT_REGELN, erfasseHtmlExport } =
  await import('../../../src/renderer/modules/views/html-export.js');
const { renderMarkdown } = await import('../../../src/shared/markdown/markdown.js');

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;
const zaun = (art, rumpf) => '```' + art + '\n' + rumpf + '\n```\n';

// Blöcke, deren Quelltext-Angabe die Pipeline setzt. `schonOhne`: Seit
// Epic 3E-000447 entfernt bereits die Anzeige den Kommentar aus dem Rumpf dieses
// Blocks; die Angabe trägt ihn dann nicht, muss im Export aber ebenso fehlen.
const GERENDERT = [
  {
    art: 'Datentabelle',
    angabe: 'data-dt-source',
    text: zaun('perspective-datatable', `columns: Name:text, Wert:number\n| Anna ${K} | 3 |`),
  },
  {
    art: 'Ereignis-Liste',
    angabe: 'data-ev-source',
    text: zaun('perspective-events', `| 2020-01-01 | | Start ${K} | projekt | | | | | |`),
  },
  {
    art: 'Journal-Zeitleiste',
    angabe: 'data-jt-source',
    schonOhne: true,
    text: zaun('perspective-journal-timeline', `modus: woche\n${K}`),
  },
  {
    art: 'Skript',
    angabe: 'data-script-source',
    text: zaun('perspective-script', `// ${K}\nreturn 1;`),
  },
  {
    art: 'Abfrage',
    angabe: 'data-fm-query',
    schonOhne: true,
    text: zaun('perspective-query', `FROM "a" ${K}`),
  },
];

// Blöcke, deren Quelltext-Angabe erst die Ansicht setzt; nachgebildet mit
// Klasse und Angabe, wie Ansicht oder Pipeline sie schreiben.
const NACHGEBILDET = [
  { art: 'Diagramm', html: `<div class="perspective-chart" data-chart-source="t ${K}"></div>` },
  { art: 'Datensatz-Block', html: `<div class="pr-block" data-rec-source="r ${K}"></div>` },
  { art: 'Dashboard', html: `<div class="db-kachel" data-db-query="q ${K}"></div>` },
  { art: 'Mermaid', html: `<div class="mermaid-block" data-source="graph TD ${K}"></div>` },
  { art: 'Ereignis-Abfrage', html: `<div class="pev-aggregation" data-ev-query="q ${K}"></div>` },
];

function inhalt(html) {
  const el = document.createElement('div');
  el.className = 'markdown-body';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

async function exportiere(quelle) {
  const { html } = await erfasseHtmlExport({
    quelle,
    alsElement: false,
    titel: 'T',
    leseKatexStile: async () => '',
  });
  return html;
}

// Die echten Stilblätter der Anwendung in Lade-Reihenfolge, ohne KaTeX und
// ohne Erzeugnisse, die fehlen können.
function stilblaetterDerAnwendung() {
  const indexHtml = fs.readFileSync(path.join(WURZEL, 'src/renderer/index.html'), 'utf8');
  const aus = [];
  for (const [, p] of indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    const datei = path.join(WURZEL, 'src/renderer', p);
    if (p.startsWith('katex/') || !fs.existsSync(datei)) continue;
    aus.push({ pfad: p, text: fs.readFileSync(datei, 'utf8') });
  }
  return aus;
}

// Alle Selektoren eines Stilblatts, auch in @media, @supports und @layer.
function selektorenAus(regeln, aus) {
  for (const regel of Array.from(regeln || [])) {
    if (regel.selectorText) aus.push(regel.selectorText);
    if (regel.cssRules) selektorenAus(regel.cssRules, aus);
  }
  return aus;
}

function trifft(el, selektor) {
  try {
    return el.matches(selektor);
  } catch {
    // Pseudo-Elemente und Selektoren, die jsdom nicht kennt, tragen nichts bei.
    return false;
  }
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('HTML-Export ohne Quelltext-Angaben', () => {
  for (const fall of GERENDERT) {
    it(`${fall.art}: Angabe und Kommentar fehlen, die Klassen bleiben`, async () => {
      const quelle = inhalt(renderMarkdown(fall.text, 'de'));
      // Vorbedingung: Die Anzeige trägt die Angabe, mit dem Kommentar, wo sie
      // ihn nicht schon selbst entfernt.
      const traeger = quelle.querySelector(`[${fall.angabe}]`);
      expect(traeger, fall.angabe).not.toBeNull();
      if (fall.schonOhne) expect(traeger.getAttribute(fall.angabe)).not.toContain(GEHEIM);
      else expect(traeger.getAttribute(fall.angabe)).toContain(GEHEIM);
      const klasse = traeger.className;

      // Die Datei trägt den Kommentar nicht über das hinaus, was die Anzeige
      // sichtbar zeigt. Bei der Datentabelle ist das nichts; die Ereignis-Liste
      // zeigt einen Kommentar im Titel bislang sichtbar (Gegenstand von
      // 4T-002838), die Datei zeigt ihn dann ebenso, aber nur dort.
      const sichtbar = quelle.textContent.split(GEHEIM).length - 1;
      if (fall.art === 'Datentabelle') expect(sichtbar).toBe(0);
      const html = await exportiere(quelle);
      expect(html.split(GEHEIM).length - 1).toBe(sichtbar);
      expect(html).not.toContain(`${fall.angabe}=`);
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain(`class="${klasse}"`);
    });
  }

  for (const fall of NACHGEBILDET) {
    it(`${fall.art}: Angabe und Kommentar fehlen, die Klasse bleibt`, async () => {
      const quelle = inhalt(fall.html);
      const klasse = quelle.firstElementChild.className;
      const html = await exportiere(quelle);
      expect(html).not.toContain(GEHEIM);
      expect(html).toContain(`class="${klasse}"`);
    });
  }

  it('andere Angaben der Blöcke bleiben stehen', async () => {
    const quelle = inhalt(
      `<div class="perspective-datatable" data-dt-index="0" data-source-line="1" ` +
        `data-dt-source="x"></div>`,
    );
    const html = await exportiere(quelle);
    expect(html).toContain('data-dt-index="0"');
    expect(html).toContain('data-source-line="1"');
    expect(html).not.toContain('data-dt-source');
  });

  it('jede entfernte Angabe ist in der Liste, keine darüber hinaus', () => {
    expect([...QUELLTEXT_ANGABEN].sort()).toEqual(
      [
        'data-chart-source',
        'data-db-query',
        'data-dt-source',
        'data-ev-query',
        'data-ev-source',
        'data-fm-query',
        'data-jt-source',
        'data-rec-source',
        'data-script-source',
        'data-source',
      ].sort(),
    );
  });
});

describe('HTML-Export ohne Quelltext-Angaben: Aussehen unverändert', () => {
  const nennt = (selektor, angabe) =>
    new RegExp(`\\[\\s*${angabe.replace(/-/g, '\\-')}\\s*(?:[~|^$*]?=|\\])`).test(selektor);

  it('keine Regel der Anwendung und keine Regel der Datei nennt eine Angabe', () => {
    const blaetter = stilblaetterDerAnwendung();
    expect(blaetter.length).toBeGreaterThan(15);
    const treffer = [];
    for (const { pfad, text } of blaetter) {
      const el = document.createElement('style');
      el.textContent = text;
      document.head.appendChild(el);
      for (const sel of selektorenAus(el.sheet.cssRules, [])) {
        for (const angabe of QUELLTEXT_ANGABEN)
          if (nennt(sel, angabe)) treffer.push(`${pfad}: ${sel}`);
      }
      // Gegenprobe ohne Zerleger: auch kein Treffer im Text ohne Kommentare.
      const ohneKommentare = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const angabe of QUELLTEXT_ANGABEN) {
        if (nennt(ohneKommentare, angabe)) treffer.push(`${pfad}: Text nennt ${angabe}`);
      }
    }
    for (const angabe of QUELLTEXT_ANGABEN) {
      if (nennt(EXPORT_REGELN, angabe)) treffer.push(`EXPORT_REGELN: ${angabe}`);
    }
    expect(treffer).toEqual([]);
  });

  it('je Element treffen vor und nach dem Entfernen dieselben Regeln', () => {
    const selektoren = [];
    for (const { text } of stilblaetterDerAnwendung()) {
      const el = document.createElement('style');
      el.textContent = text;
      document.head.appendChild(el);
      selektorenAus(el.sheet.cssRules, selektoren);
    }
    expect(selektoren.length).toBeGreaterThan(500);

    // Beide Fassungen stehen je in einem eigenen Behälter an gleicher Stelle,
    // damit Geschwister-Regeln für beide gleich greifen.
    const html =
      GERENDERT.map((f) => renderMarkdown(f.text, 'de')).join('\n') +
      NACHGEBILDET.map((f) => f.html).join('\n');
    const fassung = () => {
      const behaelter = document.createElement('div');
      document.body.appendChild(behaelter);
      const el = document.createElement('div');
      el.className = 'markdown-body';
      el.innerHTML = html;
      behaelter.appendChild(el);
      return el;
    };
    const vorher = fassung();
    const nachher = fassung();
    for (const el of nachher.querySelectorAll('*')) {
      for (const angabe of QUELLTEXT_ANGABEN) el.removeAttribute(angabe);
    }
    // Kein Attribut trägt danach noch den Kommentar.
    const angaben = [...nachher.querySelectorAll('*')].flatMap((el) =>
      Array.from(el.attributes).map((a) => a.value),
    );
    expect(angaben.filter((w) => w.includes(GEHEIM))).toEqual([]);

    const a = [vorher, ...vorher.querySelectorAll('*')];
    const b = [nachher, ...nachher.querySelectorAll('*')];
    expect(b.length).toBe(a.length);
    const abweichend = [];
    for (let i = 0; i < a.length; i += 1) {
      const va = selektoren.filter((s) => trifft(a[i], s)).join('\n');
      const vb = selektoren.filter((s) => trifft(b[i], s)).join('\n');
      if (va !== vb) abweichend.push(a[i].outerHTML.slice(0, 80));
    }
    expect(abweichend).toEqual([]);
  });
});
