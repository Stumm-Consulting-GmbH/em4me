// 4T-002072 (Epic 3E-000192): Der Ausschnitt einer Einbettung `![[Datei#^id]]`
// aus dem Text des Ziel-Dokuments (extractEmbedSnippet in
// src/main/index/embed.js). Geprüft wird, dass die Einbettung ihre Kennung über
// die Heimat src/shared/block-anchors.js findet: den Namen aus der Kopf-Angabe
// `table:` einer Datentabelle, die Zeile `^name` unter ihr, und dieselbe Regel
// wie der Index — erstes Vorkommen außerhalb von Code-Blöcken und Frontmatter,
// Groß- und Kleinschreibung zählen. Den Weg des Anwenders in der Anzeige geht
// die Ablauf-Prüfdatei der Block-Kennungen. Nachbesserung nach der Durchsicht:
// der Ausschnitt ohne die Zeile `table:` (F2) und ein BOM am Textanfang (F8).
import { describe, it, expect } from 'vitest';
import { extractEmbedSnippet } from '../../src/main/index/embed.js';

const Z = '`'.repeat(3);

const TABELLE_MIT_KOPF = [
  `${Z}perspective-datatable`,
  'table: Umsatz',
  'columns: Monat:text, Betrag:number',
  '| Januar | 100 |',
  Z,
];
// Nachbesserung F2: Der Ausschnitt trägt die Zeile `table:` nicht, sonst trüge
// die eingebettete Kopie den Namen als `id`. Alles andere bleibt Byte für Byte.
const AUSSCHNITT = TABELLE_MIT_KOPF.filter((z) => z !== 'table: Umsatz');

describe('embed-ausschnitt: Name in der Kopf-Angabe einer Datentabelle', () => {
  it('bettet den ganzen Zaun ohne die Zeile table: ein', () => {
    const text = ['# Kopf', '', 'Davor.', '', ...TABELLE_MIT_KOPF, '', 'Danach.', ''].join('\n');
    expect(extractEmbedSnippet(text, '^Umsatz')).toBe(AUSSCHNITT.join('\n'));
  });

  it('bettet einen offenen Zaun bis zum Textende ein', () => {
    const offen = TABELLE_MIT_KOPF.slice(0, -1);
    const text = ['Davor.', '', ...offen].join('\n');
    expect(extractEmbedSnippet(text, '^Umsatz')).toBe(AUSSCHNITT.slice(0, -1).join('\n'));
  });

  it('findet den Namen auch hinter einer Leerzeile im Kopf und im Tilden-Zaun', () => {
    const tabelle = ['~~~perspective-datatable', '', '  TABLE:  Umsatz', '| 1 |', '~~~'];
    expect(extractEmbedSnippet(['Davor.', '', ...tabelle].join('\n'), '^Umsatz')).toBe(
      ['~~~perspective-datatable', '', '| 1 |', '~~~'].join('\n'),
    );
  });

  // Nachbesserung F8: Ein UTF-8-BOM am Textanfang störte die Suche, wenn die
  // Tabelle, das Frontmatter oder die Überschrift in Zeile 1 stand.
  it('ein BOM am Textanfang stört nicht: Tabelle, Frontmatter und Überschrift in Zeile 1', () => {
    const BOM = '\uFEFF';
    expect(extractEmbedSnippet(BOM + TABELLE_MIT_KOPF.join('\n'), '^Umsatz')).toBe(
      AUSSCHNITT.join('\n'),
    );
    const vorspann = BOM + ['---', 'notiz: ^ziel', '---', '', 'Text.'].join('\n');
    expect(extractEmbedSnippet(vorspann, '^ziel')).toBe(null);
    expect(extractEmbedSnippet(BOM + '# Kopf\n\nText.\n', 'Kopf')).toBe('# Kopf\n\nText.\n');
  });

  it('Groß- und Kleinschreibung zählen: ^umsatz findet table: Umsatz nicht', () => {
    const text = ['Davor.', '', ...TABELLE_MIT_KOPF, ''].join('\n');
    expect(extractEmbedSnippet(text, '^umsatz')).toBe(null);
  });

  it('ein Name in einem Zitat ist keine Kennung', () => {
    const text = TABELLE_MIT_KOPF.map((z) => '> ' + z).join('\n');
    expect(extractEmbedSnippet(text, '^Umsatz')).toBe(null);
  });
});

describe('embed-ausschnitt: Zeile ^name unter der Datentabelle (Bestand)', () => {
  // Charakterisierung: Die alte Form bettet den Zaun ein, die Anker-Zeile
  // selbst gehört nicht zum Ausschnitt.
  it('bettet den Zaun ohne die Anker-Zeile ein', () => {
    const tabelle = [`${Z}perspective-datatable`, 'columns: A:number', '| 1 |', Z];
    const text = ['Davor.', '', ...tabelle, '^umsatz', '', 'Danach.'].join('\n');
    expect(extractEmbedSnippet(text, '^umsatz')).toBe(tabelle.join('\n'));
  });
});

describe('embed-ausschnitt: dieselbe Regel wie der Index', () => {
  // Bis 4T-002072 fand die Einbettung das erste Vorkommen im ganzen Text,
  // auch in einem Code-Beispiel; dann bettete sie den Code-Block ein.
  it('ein Anker in einem Code-Beispiel davor zählt nicht, eingebettet wird der echte Block', () => {
    const text = [
      'So schreibt man einen Anker:',
      '',
      `${Z}markdown`,
      'Absatz ^ziel',
      Z,
      '',
      'Der echte Absatz. ^ziel',
      '',
    ].join('\n');
    expect(extractEmbedSnippet(text, '^ziel')).toBe('Der echte Absatz.');
  });

  it('ein Anker im Frontmatter zählt nicht', () => {
    const text = ['---', 'notiz: siehe ^ziel', '---', '', 'Text.'].join('\n');
    expect(extractEmbedSnippet(text, '^ziel')).toBe(null);
  });

  it('der Anker am Ende eines Absatzes wird abgestreift, die übrigen Zeilen bleiben', () => {
    const text = ['Erste Zeile', 'zweite Zeile ^absatz', '', 'Anderes.'].join('\n');
    expect(extractEmbedSnippet(text, '^absatz')).toBe('Erste Zeile\nzweite Zeile');
  });

  it('eine Anker-Zeile unter einem Code-Block bettet den Code-Block ein', () => {
    const code = [`${Z}js`, 'const a = 1;', Z];
    const text = ['Davor.', '', ...code, '^code', '', 'Danach.'].join('\n');
    expect(extractEmbedSnippet(text, '^code')).toBe(code.join('\n'));
  });
});
