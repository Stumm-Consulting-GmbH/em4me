// 4T-000479 (Epic 3E-000089): %%-Kommentare — Scanner, Strip und Render-Pfade.
//
// Deckt die code-bewusste Vorverarbeitung (stripPercentComments /
// findPercentCommentRanges in plugins.js) sowie die Anbindung in
// renderMarkdown und convertMarkdownPortable (markdown.js) ab: privater
// Text zwischen %%-Markern verschwindet aus jeder gerenderten Ansicht und
// jedem Export, bleibt aber im Quelltext; %% in Code-Bloecken und Code-
// Spans bleibt Literal; \%% ist ein Escape; unpaariges %% wirkt bis EOF;
// der Strip ist zeilentreu (data-source-line).
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import {
  stripPercentComments,
  findPercentCommentRanges,
  setzeCodeFrage,
  kommentarImCode,
} from '../../../src/shared/markdown/plugins.js';
import {
  MAX_CODE_FRAGEN_JE_ABSATZ,
  MAX_ABSATZ_LAENGE,
  CODE_FRAGE_PLATZHALTER,
} from '../../../src/shared/markdown/plugins/comments.js';

// Standard-Zustand nach jedem Test: alle Erweiterungen an (Kommentare aktiv).
afterEach(() => {
  configureExtensions([]);
});

describe('stripPercentComments (4T-000479)', () => {
  it('entfernt einen Inline-Kommentar inklusive Marker', () => {
    expect(stripPercentComments('a %%privat%% b')).toBe('a  b');
  });

  it('entfernt einen mehrzeiligen Kommentar zeilentreu (Newlines bleiben)', () => {
    const src = 'A\n%%c1\nc2%%\nB';
    const out = stripPercentComments(src);
    expect(out).toBe('A\n\n\nB');
    // Zeilentreue: gleiche Zeilenzahl vor und nach dem Strip.
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });

  it('unpaariges oeffnendes %% wirkt bis zum Dokument-Ende', () => {
    expect(stripPercentComments('vor %%rest bis ende')).toBe('vor ');
  });

  it('Escape \\%% bleibt Literal (einzeln)', () => {
    const src = 'ein \\%% mitten im Text';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('Escape \\%% bleibt Literal (beide Marker eines Paars escapet)', () => {
    const src = '\\%%kein Kommentar\\%%';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('%% in einem Inline-Code-Span bleibt Literal', () => {
    const single = 'Text `%%literal%%` danach';
    expect(stripPercentComments(single)).toBe(single);
    const doubled = 'Text ``%%literal%%`` danach';
    expect(stripPercentComments(doubled)).toBe(doubled);
  });

  it('%% in einem Fenced-Code-Block bleibt Literal (Backtick und Tilde)', () => {
    const backtick = '```\n%%literal%%\n```';
    expect(stripPercentComments(backtick)).toBe(backtick);
    const tilde = '~~~\n%%literal%%\n~~~';
    expect(stripPercentComments(tilde)).toBe(tilde);
  });

  it('nicht geschlossener Fence schuetzt %% bis zum Dokument-Ende', () => {
    const src = '```\n%%literal%% bleibt';
    expect(stripPercentComments(src)).toBe(src);
  });

  it('leerer Kommentar %%%% wird vollstaendig entfernt', () => {
    expect(stripPercentComments('a %%%% b')).toBe('a  b');
  });

  it('ein einzelnes % bleibt unberuehrt', () => {
    expect(stripPercentComments('50% Rabatt heute')).toBe('50% Rabatt heute');
  });
});

describe('findPercentCommentRanges (4T-000479)', () => {
  it('liefert from/to inklusive der Marker fuer einen Inline-Kommentar', () => {
    // 'a %%x%% b' — Marker beginnt bei Offset 2, schliessende %% bei 5,
    // to = 5 + 2 = 7 (exklusive obere Grenze).
    expect(findPercentCommentRanges('a %%x%% b')).toEqual([{ from: 2, to: 7, closed: true }]);
  });

  it('unpaariges %% endet bei der Text-Laenge', () => {
    const src = 'vor %%rest';
    expect(findPercentCommentRanges(src)).toEqual([{ from: 4, to: src.length, closed: false }]);
  });

  it('erkennt mehrere getrennte Kommentare', () => {
    // '%%a%% x %%b%%' — zwei Paare.
    expect(findPercentCommentRanges('%%a%% x %%b%%')).toEqual([
      { from: 0, to: 5, closed: true },
      { from: 8, to: 13, closed: true },
    ]);
  });

  // 4T-000533: closed-Flag als Grundlage des Linter-Hinweises auf unpaarige
  // Marker. Ein Dokument, das exakt mit dem schliessenden %% endet, ist
  // geschlossen (to == Textlaenge reicht als Unpaarig-Kriterium NICHT);
  // ein Escape am Text-Ende schliesst nicht.
  it('closed-Flag: Schliesser am Text-Ende zaehlt als geschlossen', () => {
    expect(findPercentCommentRanges('a %%x%%')).toEqual([{ from: 2, to: 7, closed: true }]);
  });

  it('closed-Flag: Escape am Text-Ende schliesst nicht', () => {
    const src = 'a %%x \\%%';
    expect(findPercentCommentRanges(src)).toEqual([{ from: 2, to: src.length, closed: false }]);
  });
});

describe('renderMarkdown mit %%-Kommentaren (4T-000479)', () => {
  it('Kommentar-Inhalt erscheint nicht im HTML', () => {
    const html = renderMarkdown('Sichtbar %%geheim privat%% Text', 'de');
    expect(html).not.toContain('geheim');
    expect(html).toContain('Sichtbar');
    expect(html).toContain('Text');
  });

  it('Escape \\%% erscheint als woertliches %%', () => {
    const html = renderMarkdown('Woertlich \\%% hier', 'de');
    expect(html).toContain('%%');
  });

  it('%% in einem Code-Block erscheint als Literal', () => {
    const html = renderMarkdown('```\n%%literal%%\n```', 'de');
    expect(html).toContain('%%literal%%');
  });

  it('data-source-line einer Ueberschrift NACH einem mehrzeiligen Kommentar bleibt zeilentreu', () => {
    // Ueberschrift steht im Gesamt-Quelltext auf Zeile 8; der zeilentreue
    // Strip haelt data-source-line auf 8 (Scroll-Sync, Checkbox-Toggle).
    const src = 'Zeile1\n\n%%\nk1\nk2\n%%\n\n# Titel';
    const html = renderMarkdown(src, 'de');
    expect(html).toContain('data-source-line="8"');
    expect(html).not.toContain('k1');
  });
});

describe('convertMarkdownPortable mit %%-Kommentaren (4T-000479)', () => {
  it('Kommentare fehlen im Export, Code-Fence-Inhalt bleibt erhalten', () => {
    const src = 'Sichtbar %%privat export%% Text\n\n```\n%%literal%%\n```\n';
    const out = convertMarkdownPortable(src);
    expect(out).not.toContain('privat export');
    expect(out).toContain('%%literal%%');
    expect(out).toContain('Sichtbar');
  });

  it('bei einem Dokument ohne Kommentare veraendert die Erweiterung den Text nicht (Alt-Verhalten)', () => {
    // Byte-Vergleich zwischen aktiver und deaktivierter Kommentar-
    // Erweiterung: ohne %%-Marker ist der Strip ein No-Op, die Ausgabe
    // bleibt identisch zum Stand vor der Funktion.
    const doc = 'Nur Text ohne Kommentar.\n\nZweiter Absatz.\n';
    configureExtensions([]);
    const withExt = convertMarkdownPortable(doc);
    configureExtensions(['comments']);
    const withoutExt = convertMarkdownPortable(doc);
    expect(withExt).toBe(withoutExt);
  });
});

// ---------------------------------------------------------------------------
// 4T-002792 (Epic 3E-000434): Ueber Code im Fliesstext entscheidet die Anzeige.
//
// Bis 1.160.0 hielt der Scanner alles zwischen einem Backtick und dem
// naechsten gleich langen Backtick-Lauf im ganzen restlichen Dokument fuer
// Code und beachtete einen Rueckstrich vor dem Backtick nicht. Stand ein
// einzelner Backtick vor und einer nach einem privaten Kommentar, blieb der
// Kommentar stehen und erschien in Anzeige und Export. Die Faelle unten sind
// die 27 gemessenen Konstellationen der Klaerung (4T-002791); «Code» heisst,
// die Anzeige zeigt die Stelle als Code und der Marker bleibt woertlich.
const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;

// Wo steht der Kommentar-Text in der Ausgabe der Anzeige?
function lageInAnzeige(html) {
  if (!html.includes(GEHEIM)) return 'verborgen';
  const ohneCode = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
  return ohneCode.includes(GEHEIM) ? 'TEXT' : 'Code';
}

const KONSTELLATIONEN = [
  // [Name, Dokument, Soll]
  [
    'a Backticks in zwei anderen Absätzen (gemeldeter Fall 2)',
    `Die Taste \` liegt oben links.\n\nPreis vereinbart. ${K} Ende.\n\nDas Zeichen \` heißt Gravis.\n`,
    'verborgen',
  ],
  [
    'b wie a, beide Backticks maskiert (gemeldeter Fall 3)',
    `Die Taste \\\` liegt oben links.\n\nPreis vereinbart. ${K} Ende.\n\nDas Zeichen \\\` heißt Gravis.\n`,
    'verborgen',
  ],
  [
    'c selber Absatz, eine Zeile (gemeldeter Fall 4, echtes Code-Stück)',
    `Taste \` gedrückt, ${K} dann Taste \` losgelassen.\n`,
    'Code',
  ],
  [
    'd selber Absatz, drei Zeilen ohne Leerzeile (echtes Code-Stück)',
    `Taste \` oben\nPreis ${K} Ende\nZeichen \` hier\n`,
    'Code',
  ],
  [
    'e Überschrift dazwischen, keine Leerzeile',
    `Taste \` oben\n# Titel ${K}\nZeichen \` hier\n`,
    'verborgen',
  ],
  ['f drei Listenpunkte', `- Taste \`\n- Preis ${K}\n- Zeichen \`\n`, 'verborgen'],
  [
    'g drei Zellen einer Tabellen-Zeile',
    `| A | B | C |\n|---|---|---|\n| Taste \` | ${K} | Zeichen \` |\n`,
    'verborgen',
  ],
  [
    'h drei Tabellen-Zeilen untereinander',
    `| A |\n|---|\n| Taste \` |\n| ${K} |\n| Zeichen \` |\n`,
    'verborgen',
  ],
  ['i Zitat unterbricht den Absatz', `Taste \` oben\n> Zitat ${K} und \` Zeichen\n`, 'verborgen'],
  ['j Trennlinie dazwischen', `Taste \` oben\n***\n${K} Zeichen \` hier\n`, 'verborgen'],
  [
    'k Code-Block dazwischen',
    `Taste \` oben\n\`\`\`\ncode\n\`\`\`\n${K} Zeichen \` hier\n`,
    'verborgen',
  ],
  [
    'l Überschrift mit Backtick, Kommentar in der Folgezeile',
    `# Taste \`\nPreis ${K} Zeichen \`\n`,
    'verborgen',
  ],
  [
    'm doppelte Backticks einzeln, getrennte Absätze',
    `Lauf \`\` hier\n\nPreis ${K} Ende\n\nLauf \`\` dort\n`,
    'verborgen',
  ],
  ['n zwei Rückstriche vor dem Backtick (echter Beginn)', `Pfad \\\\\` x ${K} y \` Ende\n`, 'Code'],
  [
    'o Code-Stück endet auf Rückstrich, Kommentar danach',
    `Pfad \`a\\\` ${K} und \`b\` Ende\n`,
    'verborgen',
  ],
  [
    'q Backtick in zwei Formeln, Kommentar dazwischen',
    `Formel $a \` b$ und ${K} sowie $c \` d$ Ende\n`,
    'verborgen',
  ],
  [
    'r Backtick in zwei Wiki-Verweisen, Kommentar dazwischen',
    `Siehe [[Seite\`eins]] ${K} und [[Seite\`zwei]]\n`,
    'verborgen',
  ],
  [
    's Backtick in zwei Markierungen, Kommentar dazwischen (für die Anzeige ein Code-Stück)',
    `Text ==a \` b== ${K} ==c \` d== Ende\n`,
    'Code',
  ],
  ['t nur ein Backtick davor, keiner danach', `Taste \` oben\n\nPreis ${K} Ende\n`, 'verborgen'],
  [
    'u eingerückte Code-Blöcke mit Backtick, Leerzeilen dazwischen',
    `    code \`\n\nPreis ${K} Ende\n\n    code \`\n`,
    'verborgen',
  ],
  [
    'v Folgezeile, die mit Doppelpunkt beginnt',
    `Begriff \`\n: Erklärung ${K} mit \`\n`,
    'verborgen',
  ],
  ['w Fußnoten-Zeile', `Text[^1] \` hier\n[^1]: Note ${K} mit \`\n`, 'verborgen'],
  [
    'x zwei Kommentare in einer Zeile, Code-Stück dazwischen',
    `Anfang ${K} Mitte \`code\` und ${K} Ende\n`,
    'verborgen',
  ],
  [
    'y mehrzeiliger Kommentar endet vor einem Code-Stück, das einen Marker zeigt',
    `Anfang %%privat\nnoch privat ${GEHEIM}%% danach \`a %% b\` Ende\n`,
    'verborgen',
  ],
  [
    'z Code-Stück mit Senkrechtstrich im Fließtext, Kommentar darin',
    `Befehl \`a | ${K} b\` Ende\n`,
    'Code',
  ],
  [
    'A Fortsetzungs-Absatz in einer Liste, echtes Code-Stück',
    `- Punkt\n\n    Weiter \`a ${K} b\` Ende\n`,
    'Code',
  ],
  [
    'B Tabellen-Zelle mit echtem Code-Stück',
    `| A | B |\n|---|---|\n| x | \`a ${K} b\` |\n`,
    'Code',
  ],
];

describe('Private Kommentare und Code: die Anzeige entscheidet (4T-002792)', () => {
  it.each(KONSTELLATIONEN)('%s', (_name, doc, soll) => {
    // Scanner: Der Kommentar-Text ist entfernt oder steht woertlich da.
    const bereinigt = stripPercentComments(doc);
    expect(bereinigt.includes(GEHEIM)).toBe(soll === 'Code');
    // Anzeige: nie als gewoehnlicher Text.
    expect(lageInAnzeige(renderMarkdown(doc, 'de', { frontmatterBlock: false }))).toBe(soll);
    // Export «Speichern als portables Markdown» folgt der Anzeige.
    expect(convertMarkdownPortable(doc).includes(GEHEIM)).toBe(soll === 'Code');
  });

  it('Text zwischen zwei woertlich gezeigten Markern bleibt stehen', () => {
    const doc = `Der Marker \`%%\` beginnt, ${GEHEIM} steht hier offen, \`%%\` endet.\n`;
    expect(stripPercentComments(doc)).toBe(doc);
    expect(renderMarkdown(doc, 'de')).toContain(GEHEIM);
  });

  it('ein Dokument mit Portable-Kennzeichnung fragt die portable Fassung der Anzeige', () => {
    const kopf = '<!-- perspective-portable -->\n\n';
    const fall2 = KONSTELLATIONEN[0][1];
    const wiki = KONSTELLATIONEN.find((k) => k[0].startsWith('r '))[1];
    expect(lageInAnzeige(renderMarkdown(kopf + fall2, 'de'))).toBe('verborgen');
    expect(lageInAnzeige(renderMarkdown(kopf + wiki, 'de'))).not.toBe('TEXT');
  });

  it('der Schalt-Zustand zaehlt: mit ausgeschalteter Formel ist der Backtick darin gewoehnlicher Text', () => {
    const formel = KONSTELLATIONEN.find((k) => k[0].startsWith('q '))[1];
    expect(lageInAnzeige(renderMarkdown(formel, 'de'))).toBe('verborgen');
    configureExtensions(['katex']);
    // Ohne Formel bilden die beiden Backticks ein Code-Stueck; der Kommentar
    // steht darin woertlich, aber nie als gewoehnlicher Text.
    expect(lageInAnzeige(renderMarkdown(formel, 'de'))).toBe('Code');
    configureExtensions([]);
    expect(lageInAnzeige(renderMarkdown(formel, 'de'))).toBe('verborgen');
  });
});

// Sicherheits-Review zu 3E-000434, Befund 3: Roh-Bloecke der Anzeige, die ueber
// Leerzeilen reichen (Roh-HTML in der portablen Fassung, Formel-Block `$$`).
// Darin ist ein Marker nie Code, auch nicht zwischen zwei Backticks hinter
// einer Leerzeile und nicht hinter einer Zaun-Zeile.
const PORTABEL = '<!-- perspective-portable -->\n\n';
const ROH_BLOECKE = [
  // [Name, Dokument, Soll: 'verborgen' oder 'Code']
  [
    'pre-Block mit Leerzeile, Kommentar zwischen zwei Backticks (Befund 3)',
    `${PORTABEL}<pre>\nx\n\n\`a ${K} c\` d\n</pre>\n`,
    'verborgen',
  ],
  [
    'textarea-Block beginnt mit Leerzeile',
    `${PORTABEL}<textarea>\n\n\`b ${K} c\`\n</textarea>\n`,
    'verborgen',
  ],
  ['HTML-Kommentar über eine Leerzeile', `${PORTABEL}<!--\n\n\`a ${K} \`\n-->\n`, 'verborgen'],
  [
    // Im Listenpunkt endet der Roh-Block der Anzeige an der Leerzeile; der
    // Scanner nimmt den Block an, die Code-Frage entscheidet.
    'pre-Block im Listenpunkt endet an der Leerzeile, das Code-Stück dahinter ist echt',
    `${PORTABEL}- <pre>\n  x\n\n  \`a ${K} c\`\n  </pre>\n`,
    'Code',
  ],
  [
    'Zaun-Zeilen in einem pre-Block',
    `${PORTABEL}<pre>\n\`\`\`\n${K}\n\`\`\`\n</pre>\n`,
    'verborgen',
  ],
  [
    'Zaun-Zeilen in einem div-Block',
    `${PORTABEL}<div>\n\`\`\`\n${K}\n\`\`\`\n</div>\n`,
    'verborgen',
  ],
  ['Formel-Block mit Leerzeile', `x\n\n$$\na\n\n\`c ${K} d\` e\n$$\n`, 'verborgen'],
  [
    'Formel-Block mit Leerzeile, Kommentar über zwei Zeilen',
    `$$\na\n\n\`c %%${GEHEIM}\n${GEHEIM}%% d\` e\n$$\n`,
    'verborgen',
  ],
  ['Zaun-Zeilen in einem Formel-Block', `$$\n\`\`\`\n${K}\n\`\`\`\n$$\n`, 'verborgen'],
  // Gegenproben: echter Code bleibt woertlich.
  [
    'ohne Portable-Kennzeichnung ist pre gewöhnlicher Text, das Code-Stück echt',
    `<pre>\nx\n\n\`a ${K} c\` d\n</pre>\n`,
    'Code',
  ],
  [
    'ohne Portable-Kennzeichnung ist der Zaun nach pre ein echter Code-Block',
    `<pre>\n\`\`\`\n${K}\n\`\`\`\n</pre>\n`,
    'Code',
  ],
  [
    'nach dem Schluss des pre-Blocks gilt das Code-Stück wieder',
    `${PORTABEL}<pre>\nx\n</pre>\n\n\`a ${K} c\` d\n`,
    'Code',
  ],
  [
    'nach dem Schluss des Formel-Blocks gilt der Zaun wieder',
    `$$\na\n$$\n\n\`\`\`\n${K}\n\`\`\`\n`,
    'Code',
  ],
  [
    'ein Schluss-Tag in einem Kommentar schließt den pre-Block nicht',
    `${PORTABEL}<pre>\nx %%</pre>%%\n\n\`a ${K} c\` d\n</pre>\n`,
    'verborgen',
  ],
];

// Stellen, an denen die eigene Block-Gliederung des Scanners nicht sicher ist
// (Zweitblick zu 3E-000434, Runde 3, Befunde 1 und 2; Sicherheits-Review,
// Runde 2, Befund 1): Ein angenommener Roh-Block, den die Anzeige nicht hat,
// oder eine Zeile, die erst ohne ihren Kommentar einen Block beginnt. Ein
// echter Code-Block dahinter bleibt Code, der private Kommentar danach
// verborgen. Am Stand vor der Behebung war jeder Fall offen.
const UNSICHERE_GLIEDERUNG = [
  [
    'Zeile mit Inline-Tag am Anfang, danach ein Code-Block',
    `${PORTABEL}<span>Hinweis</span> zum Beispiel:\n\`\`\`\nx %% y\n\`\`\`\nDavor ${K} Ende.\n`,
  ],
  [
    'Formel-Block endet mit dem Zitat, danach ein Code-Block',
    `> $$\n> x\n\n\`\`\`\na %%\n\`\`\`\n\nText ${K} weiter\n`,
  ],
  [
    'Formel-Block endet mit dem Zitat, danach ein Code-Block mit Tilden',
    `> $$\n> x\n\n~~~\na %%\n~~~\n\nText ${K} weiter\n`,
  ],
  [
    'Formel-Zeichen in einem eingerückten Code-Block, danach ein Code-Block',
    `    $$\n\n\`\`\`\na %%\n\`\`\`\n\nText ${K} weiter\n`,
  ],
  [
    'Formel-Block endet mit dem Listenpunkt, danach ein Code-Block',
    `- $$\n  x\nweiter\n\n\`\`\`\na %%\n\`\`\`\n\nText ${K} weiter\n`,
  ],
  [
    'pre ohne Schluss im Listenpunkt, danach ein Code-Block',
    `${PORTABEL}- <pre>\n  x\n\n\`\`\`\na %%\n\`\`\`\n\nText ${K} weiter\n`,
  ],
  [
    'Kommentar vor einem Code-Zaun am Zeilenanfang',
    `%%c%%\`\`\`\nx %% y\n\`\`\`\nDavor ${K} Ende.\n`,
  ],
];

describe('Private Kommentare hinter einer unsicheren Block-Gliederung (Review-Runden vom 2026-11-22)', () => {
  it.each(UNSICHERE_GLIEDERUNG)('%s', (_name, doc) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    expect(/<code[^>]*>[^<]*(a|x) %%/.test(html)).toBe(true);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });

  it('Kommentar vor einem pre-Block am Zeilenanfang', () => {
    const doc = `${PORTABEL}%%c%%<pre>\nx\n\n\`a ${K} c\` d\n</pre>\n`;
    expect(renderMarkdown(doc, 'de', { frontmatterBlock: false })).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });
});

// Zaun-Zeilen, die nur die Anzeige richtig einordnet (Sicherheits-Review zu
// 3E-000434, Runde 3, Befunde 1 bis 3): Der Scanner erkannte jede Zeile mit
// drei Backticks oder Tilden und hoechstens drei Leerzeichen als Code-Block,
// auch mit einem Backtick im Info-Text oder in einem Listenpunkt, und keine mit
// Zitat- oder Listen-Vorspann. Je Fall: Der private Kommentar danach ist
// verborgen, der Marker im echten Code-Block bleibt woertlich. Am Stand vor der
// Behebung war jeder Fall offen, auch am Integrationsstand.
const Z3 = '```';
const ZAUN_ZEILEN = [
  [
    'Backtick im Info-Text eines Backtick-Zauns',
    `${Z3}a${Z3} ist Code\n\nText ${K} weiter\n`,
    /<code>a<\/code>/,
  ],
  [
    'Code-Block im Listenpunkt endet mit dem Listenpunkt',
    `- a\n  ${Z3}\n  x 50 %% Rabatt\n- b\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Schluss-Zeile im Listenpunkt tiefer eingerueckt',
    `- a\n\n  ${Z3}\n  x 50 %% Rabatt\n       ${Z3}\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Tilden-Zaun im Zitat, ohne Backtick im Dokument',
    `> ~~~\n> 50 %% Rabatt\n> ~~~\n\nVertraulich: ${K} Ende\n`,
    /50 %% Rabatt/,
  ],
  [
    'Tilden-Zaun im Listenpunkt',
    `- ~~~\n  50 %% Rabatt\n  ~~~\n\nVertraulich: ${K} Ende\n`,
    /50 %% Rabatt/,
  ],
  [
    'Backtick-Zaun im verschachtelten Listenpunkt',
    `1. a\n    - b\n\n      ${Z3}\n      50 %% Rabatt\n      ${Z3}\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Eingerueckter Code-Block mit Zaun als erster Zeile',
    `Text\n\n    ${Z3}\n    a ${K} \`x\`\n    ${Z3}\n`,
    null,
  ],
  [
    'Eingerueckter Code-Block mit Zaun direkt nach einem Code-Block',
    `${Z3}\ny\n${Z3}\n    ${Z3}\n    a ${K} \`x\`\n`,
    null,
  ],
];

describe('Private Kommentare nach Zaun-Zeilen, die nur die Anzeige richtig einordnet (Sicherheits-Review Runde 3)', () => {
  it.each(ZAUN_ZEILEN)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });

  it('ein Zaun ohne Vorspann am Zeilenanfang bleibt Code, entschieden von der Anzeige', () => {
    // Weg (a) nach Runde 5: Auch den einfachen Code-Block erkennt der Scanner
    // nicht mehr selbst; ab der Zaun-Zeile fragt er die Anzeige.
    let n = 0;
    const doc = `${Z3}\nx 50 %% Rabatt\n${Z3}\n\nText ${K} weiter\n`;
    const bereiche = findPercentCommentRanges(doc, {
      imCode: (s) => {
        n++;
        return kommentarImCode(s);
      },
    });
    expect(n).toBeGreaterThan(0);
    expect(bereiche.length).toBe(1);
    expect(renderMarkdown(doc, 'de')).toContain('50 %% Rabatt');
    expect(renderMarkdown(doc, 'de')).not.toContain(GEHEIM);
  });

  it('kein Rueckweg: nach einem Code-Block im Listenpunkt entscheidet die Anzeige bis zum Dokument-Ende', () => {
    // Weg (a) nach Runde 5: Jeder Rueckweg in die eigene Gliederung liess sich
    // an einem Block taeuschen, den die Code-Frage nicht sieht. Jeder spaetere
    // Marker legt deshalb das Stueck ab dem Listenpunkt vor; das Ergebnis muss
    // bis zum Ende stimmen.
    let n = 0;
    const teile = [`- a\n  ${Z3}\n  x 50 %% Rabatt\n  ${Z3}`];
    for (let i = 0; i < 400; i++) teile.push(`Absatz ${i} mit \`Code\` und ${K} danach.`);
    const doc = `${teile.join('\n\n')}\n\nEnde sichtbar.\n`;
    const bereiche = findPercentCommentRanges(doc, {
      imCode: (s) => {
        n++;
        return kommentarImCode(s);
      },
    });
    expect(bereiche.length).toBe(400);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    // Je Absatz eine Rueckfrage, der Marker allein.
    expect(n).toBeLessThanOrEqual(400 + 2);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('50 %% Rabatt');
    expect(html).toContain('Ende sichtbar.');
  });

  it('kein Rueckweg, solange die Anzeige einen Code-Block mit Leerzeile noch offen hat', () => {
    // Nach dem Zitat-Zaun ist der Scanner im Zweifel; der Tilden-Block folgt
    // ohne Leerzeile, die Zeile «c» ohne Einrueckung nach einer Leerzeile liegt
    // fuer die Anzeige noch in ihm, der Rueckweg darf dort nicht greifen.
    const doc = `> ~~~\n> 50 %% a\n> ~~~\n~~~~\nb\n\nc 50 %% d\n\ne\n~~~~\n\nText ${K} weiter\n`;
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('c 50 %% d');
    expect(html).toContain('50 %% a');
  });
});

// Sicherheits-Review zu 3E-000434, Runde 4: ein Roh-Block, den erst das
// Entfernen eines Kommentars sichtbar macht, sperrt den Rueckweg aus dem
// Zweifel; ein eingerueckter Listen-Marker ist ein Behaelter.
const RUNDE_4 = [
  [
    'verdeckter Roh-Block-Anfang <pre> im Zweifel (portable Fassung)',
    `<!-- perspective-portable -->\n- a\n  ~~~\n  x\n  ~~~\n%%c%%<pre>\n\nL\n\n${Z3}\n${K}\n${Z3}\n</pre>\n`,
    null,
  ],
  [
    'verdeckter Formel-Block-Anfang im Zweifel',
    `- a\n  ~~~\n  x\n  ~~~\n%%c%%$$\n\nL\n\n${Z3}\n${K}\n${Z3}\n$$\n\nEnde\n`,
    null,
  ],
  [
    'Code-Block in einem um ein Leerzeichen eingerueckten Listenpunkt',
    ` - a\n   ${Z3}\n   x 50 %% Rabatt\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Code-Block in einem um drei Leerzeichen eingerueckten nummerierten Listenpunkt (Regressions-Fall)',
    `   1. a\n      ~~~\n      x 50 %% Rabatt\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
];

describe('Private Kommentare nach verdeckten Roh-Blöcken und eingerückten Listen-Markern (Sicherheits-Review Runde 4)', () => {
  it.each(RUNDE_4)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });
});

// Sicherheits-Review zu 3E-000434, Runde 5, und Weg (a) der Steuerung: Ein
// Kommentar ueber ein Zeilenende und jede Zeile mit drei Backticks oder Tilden
// machen den Rest des Dokuments zur Sache der Anzeige, ohne Rueckweg; der
// Scanner kennt keine Behaelter mehr selbst.
const RUNDE_5 = [
  [
    'Kommentar ueber ein Zeilenende verdeckt einen Formel-Block im Zweifel',
    `- a\n  ~~~\n  x\n  ~~~\n%%c%%$$%%d\nd%%\n\nL\n\n${Z3}\nK ${K}\n${Z3}\n$$\n\nEnde\n`,
    null,
  ],
  [
    'Kommentar ueber ein Zeilenende verdeckt <pre> im Zweifel (portable Fassung)',
    `<!-- perspective-portable -->\n- a\n  ~~~\n  x\n  ~~~\n%%c%%<pre>%%d\nd%%\n\nL\n\n${Z3}\nK ${K}\n${Z3}\n</pre>\n`,
    null,
  ],
  [
    'Zaun hinter einem Kommentar, ein zweiter Kommentar reicht ueber das Zeilenende',
    `%%a%%${Z3}%%b\nb%%\nx\n${Z3}\n\nText ${K} weiter\n`,
    null,
  ],
  [
    'Code-Block im Erklaerungsteil einer Definitionsliste',
    `Begriff\n: Erklaerung\n  ${Z3}\n  x 50 %% Rabatt\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Zaun direkt am Marker einer Definitionsliste',
    `Begriff\n: ${Z3}\n  50 %% Rabatt\n  ${Z3}\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Code-Block in einem eigenen Container endet mit dem Container',
    `::: note\n${Z3}\na 50 %% Rabatt\n:::\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
];

describe('Private Kommentare nach Kommentaren über ein Zeilenende und in unbekannten Behältern (Sicherheits-Review Runde 5)', () => {
  it.each(RUNDE_5)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });
});

describe('Private Kommentare in Roh-Blöcken über Leerzeilen (Befund 3 des Sicherheits-Reviews)', () => {
  it.each(ROH_BLOECKE)('%s', (_name, doc, soll) => {
    const sichtbar = soll === 'Code';
    expect(stripPercentComments(doc).includes(GEHEIM)).toBe(sichtbar);
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    if (sichtbar) expect(lageInAnzeige(html)).toBe('Code');
    else expect(html.includes(GEHEIM)).toBe(false);
    expect(convertMarkdownPortable(doc).includes(GEHEIM)).toBe(sichtbar);
  });
});

describe('Code-Frage des Scanners (4T-002792)', () => {
  // Zaehlt die Rueckfragen an den Zerleger der Anzeige.
  function zaehlend() {
    const z = { n: 0 };
    z.frage = (stueck) => {
      z.n++;
      return kommentarImCode(stueck);
    };
    return z;
  }

  it('ohne Backtick im Absatz eines Markers gibt es keine Rueckfrage', () => {
    const z = zaehlend();
    findPercentCommentRanges(`Text ohne Backtick ${K} Ende.\n\nNoch ${K} einer.`, {
      imCode: z.frage,
    });
    expect(z.n).toBe(0);
  });

  it('Backticks in anderen Absaetzen loesen keine Rueckfrage aus', () => {
    const z = zaehlend();
    findPercentCommentRanges(KONSTELLATIONEN[0][1], { imCode: z.frage });
    expect(z.n).toBe(0);
  });

  it('im echten Code-Stueck: der Marker allein, dann alle Marker des Stuecks gemeinsam', () => {
    const z = zaehlend();
    const bereiche = findPercentCommentRanges(KONSTELLATIONEN[2][1], { imCode: z.frage });
    expect(bereiche).toEqual([]);
    expect(z.n).toBe(2);
  });

  it('ohne Code-Frage ist ab einem Marker mit Backticks um sich alles privat (sichere Seite)', () => {
    setzeCodeFrage(null);
    try {
      // Unklar, ob der Marker in Code liegt: Nichts dahinter bleibt stehen.
      expect(stripPercentComments('Text `%%literal%%` danach')).toBe('Text `');
      // Ohne Backtick im Absatz ist nichts unklar.
      expect(stripPercentComments('a %%x%% b')).toBe('a  b');
      // Auch ueber einen Code-Block mit Zaun entscheidet nur die Anzeige
      // (Weg (a) nach Runde 5); ohne sie ist ab dem Marker alles privat.
      expect(stripPercentComments('```\n%%literal%%\n```')).toBe('```\n\n');
    } finally {
      // Der Neuaufbau der Instanzen meldet die Code-Frage wieder an.
      configureExtensions(['comments']);
      configureExtensions([]);
    }
    expect(stripPercentComments('Text `%%literal%%` danach')).toBe('Text `%%literal%%` danach');
  });

  // Befund 1 des Sicherheits-Reviews zu 3E-000434: Eine Ausweich-Regel, die den
  // Marker bloss als Kommentar-Beginn nimmt, verschiebt die Paarung, wenn er in
  // Wahrheit in einem Code-Stueck liegt; der echte Kommentar dahinter bliebe
  // stehen. Je Ausweich-Bedingung ein Fall mit einem einzelnen Marker im
  // Code-Stueck und einem echten Kommentar danach.
  describe('die Ausweich-Regel legt keinen Kommentar frei', () => {
    const dokument = `Schreibe \`%%\` davor. %%${GEHEIM}%% Ende.`;

    it('Gegenprobe: mit Code-Frage bleibt der Marker im Code-Stueck, der Kommentar ist entfernt', () => {
      const aus = stripPercentComments(dokument);
      expect(aus).toContain('`%%`');
      expect(aus).not.toContain(GEHEIM);
      expect(aus).toContain('Ende.');
    });

    it('ohne Code-Frage', () => {
      setzeCodeFrage(null);
      try {
        expect(stripPercentComments(dokument)).not.toContain(GEHEIM);
      } finally {
        configureExtensions(['comments']);
        configureExtensions([]);
      }
    });

    it('Code-Frage ohne Antwort', () => {
      expect(stripPercentComments(dokument, { imCode: () => null })).not.toContain(GEHEIM);
    });

    it('Platzhalter-Zeichen im Absatz', () => {
      const aus = stripPercentComments(`${CODE_FRAGE_PLATZHALTER} ${dokument}`);
      expect(aus).not.toContain(GEHEIM);
    });

    it('Grenze der Rueckfragen je Absatz', () => {
      // Jeder Kommentar hinter einem Code-Stueck kostet eine Rueckfrage.
      const davor = Array.from(
        { length: MAX_CODE_FRAGEN_JE_ABSATZ + 10 },
        (_, i) => `%%c${i}%%`,
      ).join(' ');
      const aus = stripPercentComments(`\`a\` ${davor} ${dokument}`);
      expect(aus).not.toContain(GEHEIM);
    });

    it('Absatz ueber der Laengen-Grenze', () => {
      const aus = stripPercentComments(`${'x'.repeat(MAX_ABSATZ_LAENGE + 10)} ${dokument}`);
      expect(aus).not.toContain(GEHEIM);
    });

    it('Aufwands-Budget des Durchlaufs erschoepft', () => {
      const fuell = 'x'.repeat(10000);
      const teile = [];
      for (let i = 0; i < 40; i++) teile.push(`${fuell} \`k\` %%c${i}%%`);
      const aus = stripPercentComments(`${teile.join(' ')} ${dokument}`);
      expect(aus).not.toContain(GEHEIM);
    });
  });

  it('Aufwands-Grenze: ueber der Zahl der Rueckfragen je Absatz ist ab dem naechsten Marker alles privat', () => {
    const z = zaehlend();
    // Kurze Kommentare zwischen zwei Code-Stuecken: Jeder kostet eine
    // Rueckfrage, und die Zahl greift vor dem Aufwands-Budget.
    const kommentare = Array.from(
      { length: MAX_CODE_FRAGEN_JE_ABSATZ + 10 },
      (_, i) => `%%c${i}%%`,
    ).join(' ');
    const viele = `\`a\` ${kommentare} \`b\``;
    const bereiche = findPercentCommentRanges(viele, { imCode: z.frage });
    expect(z.n).toBe(MAX_CODE_FRAGEN_JE_ABSATZ);
    expect(bereiche.length).toBe(MAX_CODE_FRAGEN_JE_ABSATZ + 1);
    const letzter = bereiche[MAX_CODE_FRAGEN_JE_ABSATZ];
    expect(letzter.closed).toBe(false);
    expect(letzter.to).toBe(viele.length);
  });

  it('eine grosse Tabelle voller Marker in Code-Stuecken braucht eine gemeinsame Rueckfrage', () => {
    // Nachbesserung zu 4T-002792: Bisher kostete jeder Marker eine Rueckfrage,
    // und ueber 256 Markern verschwand der Rest des Dokuments.
    const z = zaehlend();
    const zeilen = ['| Nr | Syntax |', '|---|---|'];
    for (let i = 0; i < 600; i++) zeilen.push(`| ${i} | \`%%\` oder \`a %%b%% c\` |`);
    const doc = `${zeilen.join('\n')}\n\nDanach ${K} Ende.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(z.n).toBe(2);
    expect(bereiche.length).toBe(1);
    expect(doc.slice(bereiche[0].from, bereiche[0].to)).toBe(K);
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('Danach');
    expect(html).not.toContain(GEHEIM);
  });

  it('ein echter Kommentar am Ende einer solchen Tabelle wird per Halbierung gefunden', () => {
    const z = zaehlend();
    const zeilen = ['| Nr | Syntax |', '|---|---|'];
    for (let i = 0; i < 600; i++) zeilen.push(`| ${i} | \`a %%b%% c\` |`);
    zeilen.push(`| Ende | ${K} und \`%%\` |`);
    const doc = `${zeilen.join('\n')}\n\nDanach.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(1);
    expect(doc.slice(bereiche[0].from, bereiche[0].to)).toBe(K);
    // Marker allein, alle gemeinsam, Verdoppeln und Halbieren ueber 1202
    // Marker, danach die Kommentar-Oeffnung allein und der woertliche Marker
    // hinter dem Kommentar allein.
    expect(z.n).toBeLessThanOrEqual(2 + 2 * Math.ceil(Math.log2(1202)) + 2);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Danach');
  });

  it('eine gemischte Tabelle (je Zeile ein Marker in Code und ein Kommentar) kostet drei Rueckfragen je Zeile', () => {
    // Zweitblick zu 3E-000434, Runde 3, Befund 3: Mit der Halbierung von
    // hinten kostete jede Zeile rund log2 der restlichen Marker, ab etwa 30
    // Zeilen war die Grenze erreicht und der Rest des Dokuments verschwand.
    // 60 Zeilen genuegen dafuer; 150 lagen unter Last ueber der Zeitgrenze.
    const z = zaehlend();
    const zeilen = ['| a | b |', '|---|---|'];
    for (let i = 0; i < 60; i++) zeilen.push(`| \`%%\` | %%${GEHEIM}${i}%% |`);
    const doc = `${zeilen.join('\n')}\n\nDanach sichtbar.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(60);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    expect(z.n).toBeLessThanOrEqual(3 * 60 + 1);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Danach sichtbar.');
  });

  it('die Code-Frage mit mehreren Platzhaltern bejaht nur, wenn alle in Code-Stuecken liegen', () => {
    const P = CODE_FRAGE_PLATZHALTER;
    expect(kommentarImCode(`\`a ${P}\` und \`${P} b\``)).toBe(true);
    expect(kommentarImCode(`\`a ${P}\` und ${P} \`b\``)).toBe(false);
    expect(kommentarImCode('ohne Platzhalter `a`')).toBe(false);
  });

  it('eine grosse Tabelle ist ein einziges Absatz-Stueck: Marker in ihren Code-Stuecken bleiben woertlich', () => {
    // Belegt an der Funktions-Seite des Handbuchs (Linux-Lauf vom 2026-11-21):
    // Unter einer Laengen-Grenze von 20.000 Zeichen galten die Marker als
    // Kommentar, und ein einzelner verschluckte den Rest der Seite.
    const zeilen = ['| Funktion | Beschreibung |', '|---|---|'];
    for (let i = 0; i < 400; i++) {
      zeilen.push(
        `| Funktion ${i} | Ein laengerer Beschreibungstext, der die Tabelle fuellt und fuellt. |`,
      );
    }
    zeilen.push('| Kommentare | Syntax `%%Kommentar%%` und ein woertliches `%%` |');
    const doc = `${zeilen.join('\n')}\n\n## Danach\n`;
    expect(doc.length).toBeGreaterThan(20000);
    expect(findPercentCommentRanges(doc)).toEqual([]);
    expect(renderMarkdown(doc, 'de')).toContain('Danach');
  });

  it('Aufwands-Budget: ueber dem Budget eines Durchlaufs ist ab dem naechsten Marker alles privat', () => {
    const z = zaehlend();
    const fuell = 'x'.repeat(10000);
    const teile = [];
    for (let i = 0; i < 40; i++) teile.push(`${fuell} \`k\` %%c${i}%%`);
    const doc = `${teile.join(' ')} \`k\``;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    // Ohne Budget griffe erst die Grenze der Rueckfragen je Absatz.
    expect(z.n).toBeGreaterThan(0);
    expect(z.n).toBeLessThan(40);
    expect(bereiche.at(-1).closed).toBe(false);
    // Der letzte Marker ist nicht mehr gefragt worden und liegt in einem Kommentar.
    const letzter = doc.lastIndexOf('%%');
    expect(bereiche.some((b) => b.from <= letzter && letzter < b.to)).toBe(true);
  });

  it('ein Marker hinter einem Absatz-Stueck ueber der Laengen-Grenze ist unklar: keine Rueckfrage, alles danach privat', () => {
    let fragen = 0;
    const immerCode = () => {
      fragen++;
      return true;
    };
    const marker = Array.from({ length: 60 }, (_, i) => `%%a${i}%%`).join(' ');
    const doc = `${'x'.repeat(MAX_ABSATZ_LAENGE + 10)} \` ${marker} \``;
    const bereiche = findPercentCommentRanges(doc, { imCode: immerCode });
    expect(fragen).toBe(0);
    expect(bereiche.length).toBe(1);
    expect(bereiche[0].closed).toBe(false);
  });

  it('Aufwands-Grenze: ein Absatz ueber der Laengen-Grenze loest keine Rueckfrage aus', () => {
    const z = zaehlend();
    const lang = `${'x'.repeat(MAX_ABSATZ_LAENGE + 10)} \`a ${K} b\``;
    const bereiche = findPercentCommentRanges(lang, { imCode: z.frage });
    expect(z.n).toBe(0);
    expect(bereiche.length).toBe(1);
  });

  it('ein Dokument mit 10.000 Zeilen kommt ohne Rueckfrage an den Zerleger aus', () => {
    // Der Aufwand ist ueber die Zahl der Rueckfragen belegt, nicht ueber die
    // Wanduhr: Kein Marker hat davor einen Backtick im selben Absatz.
    const z = zaehlend();
    const zeilen = [];
    for (let i = 0; i < 10000; i++) {
      if (i % 5 === 4) zeilen.push('');
      else if (i % 50 === 0) zeilen.push(`Zeile ${i} mit ${K} und \`code\` dahinter`);
      else if (i % 37 === 0) zeilen.push(`Zeile ${i} mit einzelnem \` Zeichen`);
      else zeilen.push(`Zeile ${i} gewöhnlicher Text ohne Besonderheit, etwas länger.`);
    }
    const doc = zeilen.join('\n');
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(200);
    expect(z.n).toBe(0);
  });

  it('traegt das Dokument das Platzhalter-Zeichen selbst, ist ab dem Marker alles privat', () => {
    const z = zaehlend();
    const doc = `Zeichen \`${CODE_FRAGE_PLATZHALTER}\` und \`a ${K} b\` Ende`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(z.n).toBe(0);
    expect(bereiche.length).toBe(1);
  });

  it('Einstellungs-Block einer Tafel samt Zaun bleibt ein Kommentar, auch nach einer Karte mit einzelnem Backtick', () => {
    const tafel = '- Karte ` eins\n\n%% kanban:settings\n```\n{"a":1}\n```\n%%\n';
    const bereiche = findPercentCommentRanges(tafel);
    expect(bereiche.length).toBe(1);
    expect(bereiche[0].closed).toBe(true);
  });
});
