// 4T-002277 (Epic 3E-000348): Unit-Tests des Format-Kerns der Stufe 2 -
// Angaben je Folie in Marp-Schreibweise (Geltung mit und ohne `_`, Deutung
// der Schluessel, Befunde), nicht gedeutete Directives und `fit`, Trennung an
// Ueberschriften (`headingDivider`), Aufdeck-Listen, Notizen-Modell und der
// Theme-Block ohne Namen.
//
// Die Beispiel-Datei `marp-angaben-je-folie.md` unter test/fixtures/presentation/
// ist ein synthetischer Nachbau nach der Marp-Dokumentation (Kapitel 4 und 11
// der Referenz-Analyse Marp) mit Angaben in allen drei Geltungen; ihre Inhalte
// sind erfunden. Die Markdown-Instanz wird hereingereicht wie im Preload.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lesePraesentation as lesePraesentationRoh } from '../../src/shared/presentation/presentation-core.js';
import {
  istSteuerKommentar,
  ueberschriftenTrennung,
  gestaltungJeFolie,
} from '../../src/shared/presentation/presentation-folien-schluessel.js';
import {
  FOLIEN_THEMES,
  themeAufloesen,
} from '../../src/shared/presentation/presentation-themes.js';
import { md } from '../../src/shared/markdown/markdown.js';

const ANGABEN = readFileSync(
  fileURLToPath(new URL('../fixtures/presentation/marp-angaben-je-folie.md', import.meta.url)),
  'utf8',
);

const KOPF = '---\npresentation: true\n---\n';

function lies(text, optionen = {}) {
  return lesePraesentationRoh(text, { md, ...optionen });
}

const g = (model) => model.folien.map((f) => f.gestaltung);
const codes = (model) => model.befunde.map((b) => b.code);

describe('Angaben je Folie — Geltung (AK1)', () => {
  it('laesst eine Angabe mit `_` nur auf ihrer Folie wirken', () => {
    const model = lies(
      `${KOPF}# A\n\n---\n\n<!-- _backgroundColor: #c0392b -->\n# B\n\n---\n\n# C\n`,
    );
    expect(g(model).map((x) => x.slots.background)).toEqual(['#ffffff', '#c0392b', '#ffffff']);
  });

  it('laesst eine Angabe ohne `_` ab ihrer Folie fuer alle folgenden wirken', () => {
    const model = lies(`${KOPF}# A\n\n---\n\n<!-- color: #333333 -->\n# B\n\n---\n\n# C\n`);
    expect(g(model).map((x) => x.slots.text)).toEqual(['#1f1f1f', '#333333', '#333333']);
  });

  it('wechselt mit `theme` ab dieser Folie und mit `_theme` nur fuer diese', () => {
    const text = `${KOPF}# A\n\n---\n\n<!-- theme: dark -->\n# B\n\n---\n\n<!-- _theme: accent -->\n# C\n\n---\n\n# D\n`;
    expect(g(lies(text)).map((x) => x.theme)).toEqual(['light', 'dark', 'accent', 'dark']);
    expect(g(lies(text))[2].slots).toEqual({ ...FOLIEN_THEMES.accent });
    expect(g(lies(text))[2].syntax).toBe('dark');
  });

  it('laesst eine eigene `_`-Angabe die laufende Angabe auf der Folie uebersteuern', () => {
    const text = `${KOPF}<!-- footer: Lauf -->\n<!-- _footer: nur hier -->\n# A\n\n---\n\n# B\n`;
    expect(g(lies(text)).map((x) => x.footer)).toEqual(['nur hier', 'Lauf']);
  });

  it('haelt Slot-Angaben aus Kommentaren ueber einen Theme-Wechsel hinweg', () => {
    const text = `${KOPF}<!-- accent: #c0392b -->\n# A\n\n---\n\n<!-- theme: dark -->\n# B\n`;
    expect(g(lies(text)).map((x) => [x.theme, x.slots.accent])).toEqual([
      ['light', '#c0392b'],
      ['dark', '#c0392b'],
    ]);
  });

  it('beginnt die Kette am Dateikopf', () => {
    const text =
      '---\npresentation: true\ntheme:\n  name: dark\n  accent: "#00ff00"\nheader: Kopf\npaginate: true\n---\n# A\n';
    const [x] = g(lies(text));
    expect(x).toMatchObject({ theme: 'dark', header: 'Kopf', footer: null, seitenzahl: 'zeigen' });
    expect(x.slots.accent).toBe('#00ff00');
  });

  it('wertet `headingDivider` global mit dem letzten Wert aus', () => {
    // Kopf 1, Kommentar auf der letzten Folie 2: Es gilt 2 fuer den ganzen Satz.
    const text =
      '---\npresentation: true\nheadingDivider: 1\n---\n# A\n\n## B\n\n<!-- headingDivider: 2 -->\n';
    expect(lies(text).folien.map((f) => f.vonZeile)).toEqual([5, 7]);
  });

  it('laesst die Listen-Form von `headingDivider` ohne Wirkung und ohne Befund', () => {
    const text = '---\npresentation: true\nheadingDivider: [1, 3]\n---\n# A\n\n# B\n';
    const model = lies(text);
    expect(model.folien.length).toBe(1);
    expect(codes(model)).toEqual([]);
    const imKommentar = lies(`${KOPF}<!-- headingDivider: [1, 3] -->\n# A\n\n# B\n`);
    expect(imKommentar.folien.length).toBe(1);
  });
});

describe('Angaben je Folie — Deutung und Befunde (AK2)', () => {
  it('deutet die Hintergrund- und Farb-Schluessel von Marp auf ihre Slots', () => {
    const text = `${KOPF}<!-- _backgroundImage: linear-gradient(red, blue) -->\n<!-- _color: white -->\n# A\n\n---\n\n<!-- _backgroundColor: '#123456' -->\n# B\n`;
    const [a, b] = g(lies(text));
    expect(a.slots.background).toBe('linear-gradient(red, blue)');
    expect(a.slots.text).toBe('white');
    expect(b.slots.background).toBe('#123456');
  });

  it('deutet die sieben Slot-Namen selbst', () => {
    const angaben = [
      '_background: #010101',
      '_text: #020202',
      '_heading: #030303',
      '_accent: #c0392b',
      '_font: Georgia, serif',
      '_header-footer: #040404',
      '_page-number: #050505',
    ];
    const text = `${KOPF}${angaben.map((a) => `<!-- ${a} -->`).join('\n')}\n# A\n`;
    expect(g(lies(text))[0].slots).toEqual({
      background: '#010101',
      text: '#020202',
      heading: '#030303',
      accent: '#c0392b',
      font: 'Georgia, serif',
      'header-footer': '#040404',
      'page-number': '#050505',
    });
  });

  it('deutet `header` und `footer`, auch als leere Angabe', () => {
    const text =
      "---\npresentation: true\nfooter: Fuss\n---\n<!-- header: Kopf -->\n# A\n\n---\n\n<!-- _footer: '' -->\n# B\n";
    expect(g(lies(text)).map((x) => [x.header, x.footer])).toEqual([
      ['Kopf', 'Fuss'],
      ['Kopf', ''],
    ]);
  });

  it('deutet `paginate` mit true, false, hold und skip samt Zaehlung', () => {
    const folie = (angabe) => `<!-- _paginate: ${angabe} -->\n# F\n`;
    const text = `${KOPF}<!-- paginate: true -->\n# A\n\n---\n\n${folie('false')}\n---\n\n${folie('hold')}\n---\n\n${folie('skip')}\n---\n\n# E\n`;
    expect(g(lies(text)).map((x) => [x.seitenzahl, x.seite])).toEqual([
      ['zeigen', 1],
      ['aus', 2],
      ['halten', 2],
      ['ueberspringen', 2],
      ['zeigen', 3],
    ]);
  });

  it('meldet einen ungueltigen Wert mit Zeile und laesst den geltenden Wert stehen', () => {
    const text = `${KOPF}<!-- accent: #c0392b -->\n# A\n\n---\n\n<!-- _accent: url(x.png) -->\n<!-- _paginate: vielleicht -->\n# B\n`;
    const model = lies(text);
    expect(g(model)[1].slots.accent).toBe('#c0392b');
    expect(g(model)[1].seitenzahl).toBe('aus');
    expect(model.befunde).toEqual([
      { code: 'folieWertUngueltig', zeile: 9, detail: 'accent' },
      { code: 'folieWertUngueltig', zeile: 10, detail: 'paginate' },
    ]);
  });

  it('meldet einen unbekannten Theme-Namen je Folie und laesst das geltende Theme stehen', () => {
    const text = `${KOPF}<!-- theme: dark -->\n# A\n\n---\n\n<!-- _theme: gaia -->\n# B\n`;
    const model = lies(text);
    expect(g(model).map((x) => x.theme)).toEqual(['dark', 'dark']);
    expect(model.befunde).toEqual([{ code: 'folieThemeUnbekannt', zeile: 9, detail: 'gaia' }]);
  });

  it('meldet einen ungueltigen Wert von `headingDivider`', () => {
    const model = lies(`${KOPF}<!-- headingDivider: 9 -->\n# A\n\n# B\n`);
    expect(model.folien.length).toBe(1);
    expect(model.befunde).toEqual([{ code: 'headingDividerUngueltig', zeile: 4, detail: '"9"' }]);
  });
});

describe('Angaben je Folie — erkannt, aber nicht gedeutet (AK3)', () => {
  it('fuehrt die uebrigen Directives und `fit` nicht als Notiz und ohne Wirkung', () => {
    const angaben = [
      'style: section { color: red; }',
      'lang: de',
      'math: katex',
      'class: lead',
      '_class: invert',
      'backgroundPosition: center',
      'backgroundRepeat: no-repeat',
      'backgroundSize: cover',
      'fit',
    ];
    const text = `${KOPF}${angaben.map((a) => `<!-- ${a} -->`).join('\n')}\n# A\n`;
    const model = lies(text);
    const [folie] = model.folien;
    expect(folie.notizen).toEqual([]);
    expect(folie.steuerKommentare).toEqual(angaben);
    expect(folie.gestaltung.slots).toEqual({ ...FOLIEN_THEMES.light });
    expect(model.befunde).toEqual([]);
    for (const a of angaben) expect(istSteuerKommentar(a), a).toBe(true);
  });

  it('laesst eine gewoehnliche Notiz mit Doppelpunkt eine Notiz', () => {
    expect(istSteuerKommentar('Hinweis: langsam sprechen')).toBe(false);
    expect(istSteuerKommentar('fit bleiben')).toBe(false);
  });
});

describe('Trennung an Ueberschriften (AK4)', () => {
  const HD = (n) => `---\npresentation: true\nheadingDivider: ${n}\n---\n`;

  it('trennt vor Ueberschriften der Ebene 1 bis N, nicht tiefer', () => {
    const text = `${HD(2)}# A\n\n## B\n\n### C\n\n## D\n`;
    const model = lies(text);
    expect(model.folien.map((f) => [f.vonZeile, f.bisZeile])).toEqual([
      [5, 6],
      [7, 10],
      [11, 12],
    ]);
    expect(model.folien[1].quelltext).toBe('## B\n\n### C\n');
  });

  it('trennt zusaetzlich zu `---` und nicht doppelt nach einem Trenner', () => {
    const text = `${HD(1)}Vorspann\n\n# A\n\n---\n\n# B\n`;
    const model = lies(text);
    expect(model.folien.map((f) => f.quelltext.trim())).toEqual(['Vorspann', '# A', '# B']);
  });

  it('trennt nicht, wenn die Ueberschrift die erste Inhalts-Zeile ist, auch hinter Kommentaren', () => {
    const text = `${HD(1)}<!-- _class: lead -->\n<!-- Notiz -->\n\n# A\n`;
    const model = lies(text);
    expect(model.folien.length).toBe(1);
    expect(model.folien[0].steuerKommentare).toEqual(['_class: lead']);
  });

  it('trennt nicht an Ueberschriften im Code-Zaun und in Kommentaren', () => {
    const text = `${HD(1)}# A\n\n\`\`\`\n# kein\n\`\`\`\n\n<!--\n# keine\n-->\n%% \n# auch keine\n%%\n`;
    expect(lies(text).folien.length).toBe(1);
  });

  it('trennt auch an einer Setext-Ueberschrift und haelt die Zeilen zeilentreu', () => {
    const text = `${HD(1)}Text\n\nTitel\n=====\n\nmehr\n`;
    const model = lies(text);
    expect(model.folien.map((f) => [f.vonZeile, f.bisZeile])).toEqual([
      [5, 6],
      [7, 11],
    ]);
    expect(model.folien[1].quelltext).toBe('Titel\n=====\n\nmehr\n');
  });

  it('liefert die Ebene ueber die Hilfsfunktion, letzter Wert zaehlt', () => {
    const befunde = [];
    const steuer = [
      { inhalt: 'headingDivider: 3', zeile: 5 },
      { inhalt: 'paginate: true', zeile: 6 },
    ];
    expect(ueberschriftenTrennung(1, 2, steuer, befunde)).toBe(3);
    expect(ueberschriftenTrennung(undefined, 1, [], befunde)).toBe(0);
    expect(befunde).toEqual([]);
  });
});

describe('Aufdeck-Listen (AK5)', () => {
  it('kennzeichnet `*` und `1)` als Aufdeck-Schritte, `-`, `+` und `1.` nicht', () => {
    const text = `${KOPF}- a\n\n+ b\n\n1. c\n\n* d\n* e\n\n1) f\n`;
    const [folie] = lies(text).folien;
    expect(folie.aufdeckSchritte).toEqual({
      zahl: 3,
      punkte: [
        { zeile: 10, punkt: 3, schritt: 1 },
        { zeile: 11, punkt: 4, schritt: 2 },
        { zeile: 13, punkt: 5, schritt: 3 },
      ],
    });
  });

  it('nimmt verschachtelte Punkte in Dokument-Reihenfolge auf', () => {
    const text = `${KOPF}* a\n  - b\n  * c\n* d\n`;
    const [folie] = lies(text).folien;
    expect(folie.aufdeckSchritte.punkte.map((p) => [p.punkt, p.schritt])).toEqual([
      [0, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('zaehlt je Folie und nicht im Code-Zaun', () => {
    const text = `${KOPF}* a\n\n---\n\n\`\`\`\n* kein\n\`\`\`\n\n* b\n* c\n`;
    expect(lies(text).folien.map((f) => f.aufdeckSchritte.zahl)).toEqual([1, 2]);
  });
});

describe('Theme-Block ohne Namen (AK6)', () => {
  it('baut einen Block ohne `name:` im Kopf auf `light` auf und uebersteuert dessen Slots', () => {
    const model = lies('---\npresentation: true\ntheme:\n  accent: "#c0392b"\n---\n# A\n');
    expect(model.kopf.theme).toEqual({ accent: '#c0392b' });
    expect(codes(model)).toEqual([]);
    const [x] = g(model);
    expect(x.theme).toBe('light');
    expect(x.slots).toEqual({ ...FOLIEN_THEMES.light, accent: '#c0392b' });
  });

  it('loest den Block ohne Namen auch in `themeAufloesen` auf `light` auf', () => {
    const theme = themeAufloesen({ accent: '#c0392b' });
    expect(theme.name).toBe('light');
    expect(theme.slots.accent).toBe('#c0392b');
    expect(theme.befunde).toEqual([]);
  });
});

describe('Notizen-Modell (AK7)', () => {
  it('fuehrt Notizen in Reihenfolge, mit Herkunft und als Markdown-Text', () => {
    const text = `${KOPF}# A\n%% **erste** %%\n<!-- zweite mit *Betonung* -->\nText %% dritte %% und <!-- vierte -->\n`;
    const [folie] = lies(text).folien;
    expect(folie.notizen).toEqual([
      { text: '**erste**', herkunft: 'prozent' },
      { text: 'zweite mit *Betonung*', herkunft: 'html' },
      { text: 'dritte', herkunft: 'prozent' },
      { text: 'vierte', herkunft: 'html' },
    ]);
  });
});

describe('Nachbau mit Angaben je Folie (4T-002277)', () => {
  it('liest die Beispiel-Datei mit allen drei Geltungen', () => {
    const model = lies(ANGABEN);
    expect(model.folien.length).toBe(6);
    expect(
      g(model).map((x) => [x.theme, x.slots.background, x.footer, x.seitenzahl, x.seite]),
    ).toEqual([
      ['light', '#ffffff', null, 'aus', 1],
      ['light', '#c0392b', null, 'zeigen', 2],
      ['dark', '#1e1e1e', 'Ab hier dunkel', 'zeigen', 3],
      ['dark', '#1e1e1e', 'Ab hier dunkel', 'ueberspringen', 3],
      ['accent', FOLIEN_THEMES.accent.background, 'Ab hier dunkel', 'zeigen', 4],
      ['dark', '#1e1e1e', 'Ab hier dunkel', 'zeigen', 5],
    ]);
    // Die lokale Textfarbe gilt auch ueber den Theme-Wechsel der Folie 5.
    expect(g(model)[4].slots.text).toBe('#eeeeee');
    expect(model.folien.map((f) => f.aufdeckSchritte.zahl)).toEqual([0, 3, 2, 0, 0, 0]);
    expect(model.folien.map((f) => f.notizen.map((n) => n.herkunft))).toEqual([
      ['html'],
      ['prozent', 'html'],
      [],
      [],
      [],
      [],
    ]);
    expect(codes(model)).toEqual(['folieWertUngueltig', 'folieThemeUnbekannt']);
    for (const folie of model.folien) {
      expect(folie.quelltext).not.toContain('<!--');
      expect(folie.notizen.map((n) => n.text)).not.toContain('fit');
    }
  });

  it('loest die Gestaltung ohne Steuer-Kommentare auf den Kopf auf', () => {
    const befunde = [];
    const [x] = gestaltungJeFolie({ theme: 'dark', paginate: true }, [[]], befunde);
    expect(x).toMatchObject({ theme: 'dark', seitenzahl: 'zeigen', seite: 1, header: null });
    expect(befunde).toEqual([]);
  });
});
