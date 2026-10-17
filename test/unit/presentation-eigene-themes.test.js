// 4T-002281 (Epic 3E-000348): Unit-Tests der eigenen Folien-Themes —
// Speicherform und Normalisierung (AK1), Namens-Regel samt Marp-Namen (AK2),
// Auflösung mit eigenem Katalog und Rückfall (AK3) und die Übersteuerungs-
// Kette Basis, eigene Abweichungen, Block im Kopf, Angaben je Folie (AK4).
//
// Die Markdown-Instanz wird hereingereicht wie im Preload; der Katalog kommt
// über die Option `eigeneThemes`, wie ihn die Fläche aus dem Stand des
// Fensters reicht.
import { describe, it, expect } from 'vitest';
import {
  PRESENTATION_THEMES_KEY,
  NAMENS_BEFUNDE,
  leererThemesZustand,
  themeNameVergleich,
  themeNamePruefen,
  themeAbweichungen,
  themeEintragBereinigen,
  normalisiereThemesZustand,
} from '../../src/shared/presentation/presentation-eigene-themes.js';
import {
  FOLIEN_THEMES,
  FOLIEN_THEME_SYNTAX,
  themeAufloesen,
} from '../../src/shared/presentation/presentation-themes.js';
import { lesePraesentation } from '../../src/shared/presentation/presentation-core.js';
import { md } from '../../src/shared/markdown/markdown.js';

const FIRMA = { id: 't1', name: 'Firma', basis: 'dark', slots: { accent: '#c0392b' } };
const KATALOG = [FIRMA, { id: 't2', name: 'gaia', basis: 'accent', slots: {} }];

describe('Speicherform und Normalisierung (AK1)', () => {
  it('der Schlüssel heißt presentationThemes, der leere Zustand { custom: [] }', () => {
    expect(PRESENTATION_THEMES_KEY).toBe('presentationThemes');
    expect(leererThemesZustand()).toEqual({ custom: [] });
  });

  it('ein gültiger Eintrag bleibt mit Basis und Abweichungen erhalten', () => {
    expect(normalisiereThemesZustand({ custom: [FIRMA] })).toEqual({ custom: [FIRMA] });
  });

  it('jede andere Form ergibt den leeren Zustand', () => {
    for (const roh of [undefined, null, 'x', 3, [], { custom: 'x' }, { andere: [] }]) {
      expect(normalisiereThemesZustand(roh)).toEqual({ custom: [] });
    }
  });

  it('Einträge ohne Kennung, ohne gültigen Namen oder mit unbekannter Basis fallen weg', () => {
    const roh = {
      custom: [
        { name: 'Ohne Kennung', basis: 'light' },
        { id: '  ', name: 'Leere Kennung', basis: 'light' },
        { id: 'a', name: '   ', basis: 'light' },
        { id: 'b', name: 'Dunkel', basis: 'sepia' },
        { id: 'c', name: 'Ohne Basis' },
        { id: 'd', name: 'light', basis: 'dark' },
        'kein Objekt',
        null,
        { id: 'e', name: '  Gültig  ', basis: 'light' },
      ],
    };
    expect(normalisiereThemesZustand(roh).custom).toEqual([
      { id: 'e', name: 'Gültig', basis: 'light', slots: {} },
    ]);
  });

  it('ungültige Werte und unbekannte Slots fallen weg, gültige werden getrimmt', () => {
    const theme = themeEintragBereinigen({
      id: 'x',
      name: 'Prüfung',
      basis: 'light',
      slots: {
        accent: '  #123456 ',
        background: 'url(http://example.org/a.png)',
        text: '#000; color: red',
        unbekannt: '#ffffff',
        heading: 42,
      },
    });
    expect(theme.slots).toEqual({ accent: '#123456', heading: '42' });
  });

  it('gespeichert werden nur Abweichungen von der Basis', () => {
    const voll = { ...FOLIEN_THEMES.dark, accent: '#c0392b' };
    expect(themeAbweichungen('dark', voll)).toEqual({ accent: '#c0392b' });
    expect(
      themeEintragBereinigen({ id: 'x', name: 'X', basis: 'dark', slots: voll }).slots,
    ).toEqual({ accent: '#c0392b' });
    expect(themeAbweichungen('sepia', voll)).toEqual({});
    expect(themeAbweichungen('dark', null)).toEqual({});
  });

  it('doppelte Kennungen und Namen ohne Rücksicht auf Groß- und Kleinschreibung: der erste bleibt', () => {
    const roh = {
      custom: [
        { id: 'a', name: 'Firma', basis: 'light' },
        { id: 'a', name: 'Andere', basis: 'light' },
        { id: 'b', name: ' FIRMA ', basis: 'dark' },
        { id: 'c', name: 'Zweite', basis: 'dark' },
      ],
    };
    expect(normalisiereThemesZustand(roh).custom.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('die Normalisierung ist idempotent und verändert die Eingabe nicht', () => {
    const roh = { custom: [{ ...FIRMA, slots: { ...FIRMA.slots, text: 'url(x)' } }] };
    const kopie = JSON.parse(JSON.stringify(roh));
    const einmal = normalisiereThemesZustand(roh);
    expect(normalisiereThemesZustand(einmal)).toEqual(einmal);
    expect(roh).toEqual(kopie);
  });
});

describe('Namens-Regel (AK2)', () => {
  it('ein leerer Name ist ungültig', () => {
    for (const name of ['', '   ', undefined, null, 7]) {
      expect(themeNamePruefen(name, [])).toBe(NAMENS_BEFUNDE.leer);
    }
  });

  it('die Namen der mitgelieferten Themes sind vergeben, auch in anderer Schreibung', () => {
    for (const name of ['light', 'dark', 'accent', ' Light ', 'DARK', 'Accent']) {
      expect(themeNamePruefen(name, [])).toBe(NAMENS_BEFUNDE.mitgeliefert);
    }
  });

  it('Marp-Namen sind erlaubt (Entscheidung D2, Option (a))', () => {
    for (const name of ['default', 'gaia', 'uncover']) {
      expect(themeNamePruefen(name, [])).toBeNull();
    }
  });

  it('ein Name ist eindeutig ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(themeNamePruefen('firma', KATALOG)).toBe(NAMENS_BEFUNDE.vergeben);
    expect(themeNamePruefen('  FIRMA ', KATALOG)).toBe(NAMENS_BEFUNDE.vergeben);
    expect(themeNamePruefen('Firma 2', KATALOG)).toBeNull();
  });

  it('beim Umbenennen zählt der eigene Name nicht als vergeben', () => {
    expect(themeNamePruefen('FIRMA', KATALOG, 't1')).toBeNull();
    expect(themeNamePruefen('Gaia', KATALOG, 't1')).toBe(NAMENS_BEFUNDE.vergeben);
  });

  it('die Vergleichs-Form ist getrimmt und klein geschrieben', () => {
    expect(themeNameVergleich('  Firma ')).toBe('firma');
    expect(themeNameVergleich(undefined)).toBe('');
  });
});

describe('Auflösung mit eigenem Katalog (AK3)', () => {
  it('ein eigenes Theme ergibt die Slots seiner Basis mit seinen Abweichungen', () => {
    const r = themeAufloesen('Firma', { eigene: KATALOG });
    expect(r.befunde).toEqual([]);
    expect(r.name).toBe('Firma');
    expect(r.basis).toBe('dark');
    expect(r.slots).toEqual({ ...FOLIEN_THEMES.dark, accent: '#c0392b' });
    expect(r.syntax).toBe(FOLIEN_THEME_SYNTAX.dark);
  });

  it('der Katalog wirkt auch als Zustand { custom } und mit Leerraum im Namen', () => {
    const r = themeAufloesen('  Firma ', { eigene: { custom: KATALOG } });
    expect(r.name).toBe('Firma');
    expect(r.befunde).toEqual([]);
  });

  it('ein Marp-Name wird als eigenes Theme aufgelöst', () => {
    const r = themeAufloesen('gaia', { eigene: KATALOG });
    expect(r.slots).toEqual(FOLIEN_THEMES.accent);
    expect(r.syntax).toBe(FOLIEN_THEME_SYNTAX.accent);
  });

  it('mitgelieferte Themes gehen vor; ohne Katalog bleibt alles wie in der Stufe 1', () => {
    const verdeckt = [{ id: 'z', name: 'dark', basis: 'light', slots: { text: '#ff0000' } }];
    expect(themeAufloesen('dark', { eigene: verdeckt }).slots).toEqual(FOLIEN_THEMES.dark);
    expect(themeAufloesen('Firma').befunde).toEqual([{ code: 'themeUnbekannt', detail: 'Firma' }]);
  });

  it('ein unbekannter Name fällt mit Befund auf light zurück', () => {
    const r = themeAufloesen('Unbekannt', { eigene: KATALOG });
    expect(r.name).toBe('light');
    expect(r.slots).toEqual(FOLIEN_THEMES.light);
    expect(r.befunde).toEqual([{ code: 'themeUnbekannt', detail: 'Unbekannt' }]);
  });

  it('ein Katalog-Eintrag mit unbekannter Basis oder ungültigem Wert wird abgefangen', () => {
    const roh = [
      { id: 'a', name: 'Kaputt', basis: 'sepia' },
      { id: 'b', name: 'Halb', basis: 'light', slots: { accent: 'url(x)', text: '#010101' } },
    ];
    expect(themeAufloesen('Kaputt', { eigene: roh }).befunde[0].code).toBe('themeUnbekannt');
    expect(themeAufloesen('Halb', { eigene: roh }).slots).toEqual({
      ...FOLIEN_THEMES.light,
      text: '#010101',
    });
  });
});

describe('Übersteuerungs-Kette (AK4)', () => {
  it('ein Block mit name: <eigenes Theme> baut auf dem eigenen Theme auf', () => {
    const r = themeAufloesen({ name: 'Firma', heading: '#00ff00' }, { eigene: KATALOG });
    expect(r.befunde).toEqual([]);
    expect(r.name).toBe('Firma');
    expect(r.slots).toEqual({ ...FOLIEN_THEMES.dark, accent: '#c0392b', heading: '#00ff00' });
  });

  it('der Block übersteuert auch die eigenen Abweichungen', () => {
    const r = themeAufloesen({ name: 'Firma', accent: '#111111' }, { eigene: KATALOG });
    expect(r.slots.accent).toBe('#111111');
  });

  const kette = [
    '---',
    'presentation: true',
    'theme:',
    '  name: Firma',
    '  heading: "#00ff00"',
    '---',
    '# Eins',
    '',
    '---',
    '',
    '<!-- _text: "#0000ff" -->',
    '# Zwei',
    '',
    '---',
    '',
    '# Drei',
    '',
    '---',
    '',
    '<!-- theme: gaia -->',
    '# Vier',
  ].join('\n');

  it('Basis, eigene Abweichungen, Block im Kopf und Angaben je Folie greifen der Reihe nach', () => {
    const model = lesePraesentation(kette, { md, eigeneThemes: KATALOG });
    const g = model.folien.map((f) => f.gestaltung);
    expect(model.befunde.map((b) => b.code)).not.toContain('folieThemeUnbekannt');
    expect(g[0].theme).toBe('Firma');
    expect(g[0].syntax).toBe(FOLIEN_THEME_SYNTAX.dark);
    expect(g[0].slots).toEqual({ ...FOLIEN_THEMES.dark, accent: '#c0392b', heading: '#00ff00' });
    expect(g[1].slots).toEqual({ ...g[0].slots, text: '#0000ff' });
    expect(g[2].slots).toEqual(g[0].slots);
    // Ein Theme-Wechsel per Kommentar erreicht auch eigene Themes.
    expect(g[3].theme).toBe('gaia');
    expect(g[3].slots).toEqual(FOLIEN_THEMES.accent);
  });

  it('ohne Katalog fällt derselbe Satz auf light zurück und nennt den Wechsel unbekannt', () => {
    const model = lesePraesentation(kette, { md });
    const g = model.folien.map((f) => f.gestaltung);
    expect(g[0].theme).toBe('light');
    expect(g[0].slots.heading).toBe('#00ff00');
    expect(model.befunde.map((b) => b.code)).toContain('folieThemeUnbekannt');
  });
});
