// 4T-000758 (Epic 3E-000142): Kern der Suche über mehrere Texte hinweg.
//
// Geprüft werden die Zusagen, auf die sich Trefferliste und Sprung später
// verlassen: Reihenfolge über Gruppen, Kontext-Ausschnitt samt der Offsets
// INNERHALB des Ausschnitts (die Anzeige hebt darüber hervor, ohne erneut
// zu suchen), die beiden Obergrenzen und die Absicherung gegen
// Null-Breiten-Treffer.
import { describe, it, expect } from 'vitest';
import {
  sucheInTexten,
  MAX_TREFFER_JE_GRUPPE,
  KONTEXT_ZEICHEN,
} from '../../src/shared/search-scope.js';

// Muster der Dokument-Suche (buildRegex erzeugt 'gm' bzw. 'gmi').
const rx = (muster, flags = 'gm') => new RegExp(muster, flags);

describe('sucheInTexten (4T-000758)', () => {
  it('liefert Treffer in Eintrags-Reihenfolge und zählt je Gruppe', () => {
    const eintraege = [
      {
        gruppe: 'templates',
        titel: 'Vorlagen',
        text: 'Vorlagen sind Dateien.\nEine Vorlage mehr.',
      },
      { gruppe: 'journals', titel: 'Journale', text: 'Optional eine Vorlage.' },
    ];
    const { treffer, gruppen, abgeschnitten } = sucheInTexten(eintraege, rx('Vorlage', 'gmi'));

    expect(treffer).toHaveLength(3);
    expect(treffer.map((t) => t.gruppe)).toEqual(['templates', 'templates', 'journals']);
    expect(gruppen).toEqual([
      { gruppe: 'templates', titel: 'Vorlagen', anzahl: 2 },
      { gruppe: 'journals', titel: 'Journale', anzahl: 1 },
    ]);
    expect(abgeschnitten).toBe(false);
  });

  it('rechnet Offset in Zeile und Spalte um', () => {
    const text = 'Zeile null\nZeile eins\nHier steht Vorlage drin';
    const { treffer } = sucheInTexten([{ gruppe: 'g', titel: 'G', text }], rx('Vorlage'));

    expect(treffer).toHaveLength(1);
    expect(treffer[0].sprung.zeile).toBe(2);
    expect(treffer[0].sprung.spalte).toBe('Hier steht '.length);
    expect(treffer[0].sprung.offset).toBe(text.indexOf('Vorlage'));
  });

  it('markiert den Treffer im Kontext-Ausschnitt über die mitgelieferten Offsets', () => {
    const fuellerLinks = 'a'.repeat(200);
    const fuellerRechts = 'b'.repeat(200);
    const text = `${fuellerLinks} Treffer ${fuellerRechts}`;
    const { treffer } = sucheInTexten([{ gruppe: 'g', titel: 'G', text }], rx('Treffer'));

    const t = treffer[0];
    expect(t.ausschnitt.slice(t.von, t.bis)).toBe('Treffer');
    // Beidseitig gekürzt, also mit Ellipse an beiden Enden.
    expect(t.ausschnitt.startsWith('…')).toBe(true);
    expect(t.ausschnitt.endsWith('…')).toBe(true);
    expect(t.ausschnitt.length).toBeLessThan(2 * KONTEXT_ZEICHEN + 40);
  });

  it('setzt keine Ellipse, wenn die Zeile vollständig im Ausschnitt liegt', () => {
    const { treffer } = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text: 'Kurz mit Treffer.' }],
      rx('Treffer'),
    );
    const t = treffer[0];
    expect(t.ausschnitt).toBe('Kurz mit Treffer.');
    expect(t.ausschnitt.slice(t.von, t.bis)).toBe('Treffer');
  });

  it('trifft am Zeilen-Anfang und am Zeilen-Ende korrekt', () => {
    const lang = 'x'.repeat(200);
    const amAnfang = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text: `Treffer ${lang}` }],
      rx('Treffer'),
    ).treffer[0];
    expect(amAnfang.ausschnitt.slice(amAnfang.von, amAnfang.bis)).toBe('Treffer');
    expect(amAnfang.ausschnitt.startsWith('…')).toBe(false);

    const amEnde = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text: `${lang} Treffer` }],
      rx('Treffer'),
    ).treffer[0];
    expect(amEnde.ausschnitt.slice(amEnde.von, amEnde.bis)).toBe('Treffer');
    expect(amEnde.ausschnitt.endsWith('…')).toBe(false);
  });

  it('schneidet den Ausschnitt nie in den Treffer hinein', () => {
    // Treffer länger als das Kontext-Fenster: der Fund bleibt vollständig.
    const wort = 'W'.repeat(3 * KONTEXT_ZEICHEN);
    const { treffer } = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text: `davor ${wort} danach` }],
      rx('W+'),
    );
    const t = treffer[0];
    expect(t.ausschnitt.slice(t.von, t.bis)).toBe(wort);
  });

  it('beendet die Suche bei Null-Breiten-Mustern', () => {
    const { treffer } = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text: 'eins\nzwei\ndrei' }],
      rx('^'),
    );
    // Kein Aufhängen und kein Treffer der Länge null.
    expect(treffer).toEqual([]);
  });

  it('hält die Grenze je Gruppe ein und meldet das Abschneiden', () => {
    const text = 'x '.repeat(MAX_TREFFER_JE_GRUPPE + 50);
    const { treffer, abgeschnitten, gruppen } = sucheInTexten(
      [{ gruppe: 'g', titel: 'G', text }],
      rx('x'),
    );
    expect(treffer).toHaveLength(MAX_TREFFER_JE_GRUPPE);
    expect(gruppen[0].anzahl).toBe(MAX_TREFFER_JE_GRUPPE);
    expect(abgeschnitten).toBe(true);
  });

  it('hält die Gesamt-Grenze über mehrere Gruppen ein', () => {
    const eintraege = [
      { gruppe: 'a', titel: 'A', text: 'x x x x x' },
      { gruppe: 'b', titel: 'B', text: 'x x x x x' },
    ];
    const { treffer, abgeschnitten } = sucheInTexten(eintraege, rx('x'), { gesamt: 7 });
    expect(treffer).toHaveLength(7);
    expect(abgeschnitten).toBe(true);
  });

  it('übernimmt Quelle und Sprung-Kennung unverändert', () => {
    const { treffer } = sucheInTexten(
      [
        {
          gruppe: 'appearance',
          titel: 'Darstellung',
          text: 'Editor-Schriftart',
          quelle: 'settings',
          kennung: 'settings-editor-font',
        },
      ],
      rx('Schrift'),
    );
    expect(treffer[0].quelle).toBe('settings');
    expect(treffer[0].sprung.kennung).toBe('settings-editor-font');
    expect(treffer[0].gruppeTitel).toBe('Darstellung');
  });

  it('verträgt leere und unbrauchbare Eingaben', () => {
    expect(sucheInTexten([], rx('x')).treffer).toEqual([]);
    expect(sucheInTexten(null, rx('x')).treffer).toEqual([]);
    expect(sucheInTexten([{ gruppe: '', titel: '', text: 'x' }], rx('x')).treffer).toEqual([]);
    expect(sucheInTexten([{ gruppe: 'g', titel: 'G' }], rx('x')).treffer).toEqual([]);
    expect(sucheInTexten([{ gruppe: 'g', titel: 'G', text: '' }], rx('x')).treffer).toEqual([]);
  });

  it('sucht mit demselben Ausdruck mehrfach ohne Zustands-Rest', () => {
    const regex = rx('Vorlage', 'gmi');
    const eintraege = [{ gruppe: 'g', titel: 'G', text: 'Vorlage und Vorlage' }];
    const erster = sucheInTexten(eintraege, regex).treffer.length;
    const zweiter = sucheInTexten(eintraege, regex).treffer.length;
    expect(erster).toBe(2);
    expect(zweiter).toBe(2);
  });
});
