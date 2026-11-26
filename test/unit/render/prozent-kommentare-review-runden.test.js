// 4T-002802: Fälle aus den Runden des Sicherheits-Reviews und des Zweitblicks
// zu 3E-000434, geschnitten aus prozent-kommentare.test.js (Zeilen-Budget).
// Jeder Fall hält einen Weg fest, auf dem ein privater Kommentar sichtbar
// wurde, solange die Erkennung Code-Blöcke, Behälter oder Roh-Blöcke selbst
// gliederte; seit 4T-002802 entscheidet allein der Zerleger der Anzeige über
// das ganze Dokument, und die Fälle bleiben als Regressionsschutz stehen.
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import {
  stripPercentComments,
  findPercentCommentRanges,
  kommentarImCode,
} from '../../../src/shared/markdown/plugins.js';
import { MAX_ERGAENZTE_ZELLEN } from '../../../src/shared/markdown/plugins/comments-codefrage.js';

afterEach(() => {
  configureExtensions([]);
});

const GEHEIM = 'GEHEIMVERMERK';
const K = `%%${GEHEIM}%%`;

// Wo steht der Kommentar-Text in der Ausgabe der Anzeige?
function lageInAnzeige(html) {
  if (!html.includes(GEHEIM)) return 'verborgen';
  const ohneCode = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
  return ohneCode.includes(GEHEIM) ? 'TEXT' : 'Code';
}

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
];

// 4T-002802: Ein eingerückter Code-Block ist Code wie jeder andere; ein Marker
// darin bleibt wörtlich, wie die Anzeige ihn zeigt. Die beiden Fälle standen in
// Runde 3 mit der umgekehrten Erwartung, solange eingerückte Code-Blöcke
// bewusst nicht geschützt waren.
const EINGERUECKT = [
  [
    'Eingerückter Code-Block mit Zaun als erster Zeile',
    `Text\n\n    ${Z3}\n    a ${K} \`x\`\n    ${Z3}\n`,
  ],
  [
    'Eingerückter Code-Block mit Zaun direkt nach einem Code-Block',
    `${Z3}\ny\n${Z3}\n    ${Z3}\n    a ${K} \`x\`\n`,
  ],
  ['Eingerückter Code-Block nach einer Leerzeile', `Text\n\n    a ${K} b\n\nDanach.\n`],
  ['Eingerückter Code-Block mit Tabulator', `Text\n\n\ta ${K} b\n`],
  ['Eingerückter Code-Block im Zitat', `> Text\n>\n>     a ${K} b\n`],
];

describe('Private Kommentare und eingerückte Code-Blöcke (4T-002802)', () => {
  it.each(EINGERUECKT)('%s', (_name, doc) => {
    expect(lageInAnzeige(renderMarkdown(doc, 'de', { frontmatterBlock: false }))).toBe('Code');
    expect(stripPercentComments(doc)).toBe(doc);
    expect(convertMarkdownPortable(doc)).toContain(K);
  });

  it('Gegenprobe: vier Leerzeichen in einem Absatz sind kein Code-Block', () => {
    const doc = `Text\n    a ${K} b\n`;
    expect(lageInAnzeige(renderMarkdown(doc, 'de', { frontmatterBlock: false }))).toBe('verborgen');
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
  });

  it('ein Kommentar, der die Leerzeile vor einem eingerückten Block erst schafft, legt nichts frei', () => {
    // Ohne den Kommentar steht vor dem eingerückten Block eine leere Zeile; die
    // Anzeige sieht danach Code, die Erkennung beurteilt die Marker im Block
    // erst nach dem Entfernen des Kommentars davor.
    const doc = `Text\n%%x%%\n    a ${K} b\n`;
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(lageInAnzeige(html)).not.toBe('TEXT');
    expect(convertMarkdownPortable(doc).includes(GEHEIM)).toBe(lageInAnzeige(html) === 'Code');
  });
});

describe('Private Kommentare nach Zaun-Zeilen, die nur die Anzeige richtig einordnet (Sicherheits-Review Runde 3)', () => {
  it.each(ZAUN_ZEILEN)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });

  it('ein Zaun ohne Vorspann am Zeilenanfang bleibt Code, entschieden von der Anzeige', () => {
    // Auch den einfachen Code-Block erkennt die Erkennung nicht selbst; die
    // Anzeige entscheidet (seit Weg (a) nach Runde 5, seit 4T-002802 für das
    // ganze Dokument in einer Zerlegung).
    let n = 0;
    const doc = `${Z3}\nx 50 %% Rabatt\n${Z3}\n\nText ${K} weiter\n`;
    const bereiche = findPercentCommentRanges(doc, {
      imCode: (text, leit, optionen) => {
        n++;
        return kommentarImCode(text, leit, false, optionen);
      },
    });
    expect(n).toBeGreaterThan(0);
    expect(bereiche.length).toBe(1);
    expect(renderMarkdown(doc, 'de')).toContain('50 %% Rabatt');
    expect(renderMarkdown(doc, 'de')).not.toContain(GEHEIM);
  });

  it('kein Rueckweg: nach einem Code-Block im Listenpunkt entscheidet die Anzeige bis zum Dokument-Ende', () => {
    // Weg (a) nach Runde 5: Jeder Rueckweg in die eigene Gliederung liess sich
    // an einem Block taeuschen, den die Code-Frage nicht sieht. Seit 4T-002802
    // gibt es keine eigene Gliederung mehr; das Ergebnis muss bis zum Ende
    // stimmen, und jeder Kommentar kostet nur den Abschnitt um ihn
    // (Variante B).
    let zeichen = 0;
    const teile = [`- a\n  ${Z3}\n  x 50 %% Rabatt\n  ${Z3}`];
    for (let i = 0; i < 400; i++) teile.push(`Absatz ${i} mit \`Code\` und ${K} danach.`);
    const doc = `${teile.join('\n\n')}\n\nEnde sichtbar.\n`;
    const bereiche = findPercentCommentRanges(doc, {
      imCode: (text, leit, optionen) => {
        zeichen += text.length;
        return kommentarImCode(text, leit, false, optionen);
      },
    });
    expect(bereiche.length).toBe(400);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    // Drei Zerlegungen des ganzen Dokuments (die erste und beide
    // Schluss-Prüfungen) und je Kommentar ein Abschnitt aus wenigen Absätzen.
    expect(zeichen).toBeLessThanOrEqual(6 * doc.length);
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

// Sicherheits-Review zu 3E-000434, Runde 6: dieselben Behälter mit einer
// Leerzeile vor dem Code-Block oder zwischen Begriff und Erklärung. Mit Weg (a)
// eine benannte Grenze, seit 4T-002802 geschlossen, weil die Anzeige über das
// ganze Dokument entscheidet.
const RUNDE_6 = [
  [
    'Container, Leerzeile vor dem Zaun',
    `::: note\n\n${Z3}\nx 50 %% Rabatt\n:::\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Container mit Einleitung vor dem Zaun',
    `::: note\n\nEinleitung\n${Z3}\nx 50 %% Rabatt\n:::\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
  [
    'Definitionsliste, Leerzeile zwischen Begriff und Erklärung',
    `Begriff\n\n: Erklärung\n\n  ${Z3}\n  x 50 %% Rabatt\n\nText ${K} weiter\n`,
    /50 %% Rabatt/,
  ],
];

// 4T-002801, aufgegangen in 4T-002802: Ein einzelnes Wagenrücklauf-Zeichen ist
// für den Zerleger ein Zeilenende; die Erkennung liest es ebenso.
const ZEILENENDE_CR = [
  [
    'Schluss-Zeile eines Code-Blocks, Text hinter dem Wagenrücklauf',
    `~~~\nx\n~~~\rText ${K} weiter\n`,
    null,
  ],
  [
    'Datei durchgehend mit Wagenrücklauf, Code-Block mit Tilden',
    `Anfang\r\r~~~\rx 50 %% Rabatt\r~~~\r\rText ${K} weiter\r`,
    /50 %% Rabatt/,
  ],
  [
    'gemischte Zeilenenden, Code-Stück über ein Wagenrücklauf-Zeichen',
    `Text \`a\rb\` und ${K} weiter\r\nEnde\n`,
    null,
  ],
];

describe('Private Kommentare in Behältern mit Leerzeile (Sicherheits-Review Runde 6)', () => {
  it.each(RUNDE_6)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });
});

describe('Private Kommentare bei einzelnem Wagenrücklauf-Zeichen als Zeilenende (4T-002801)', () => {
  it.each(ZEILENENDE_CR)('%s', (_name, doc, imCodeWoertlich) => {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(html).not.toContain(GEHEIM);
    if (imCodeWoertlich) expect(html).toMatch(imCodeWoertlich);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });

  it('das Entfernen behält jedes Zeilenende in seiner Form', () => {
    const doc = `a %%x\ry\r\nz%% b\r`;
    expect(stripPercentComments(doc)).toBe('a \r\r\n b\r');
  });

  it('die Bereiche bleiben Stellen des übergebenen Textes', () => {
    const doc = `~~~\rx\r~~~\rText ${K} weiter`;
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche.length).toBe(1);
    expect(doc.slice(bereiche[0].from, bereiche[0].to)).toBe(K);
  });
});

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

// 4T-002802: Die E-Mail-Erkennung in spitzen Klammern nimmt `%` und Backticks
// im lokalen Teil an, das Zeichen der Kennung aber nicht. Ohne Treue-Prüfung
// las die Rückfrage einen Marker in der Adresse als Code, die Anzeige zeigte ihn
// außerhalb von Code, und der Text bis zum nächsten Marker blieb stehen.
describe('Treue der Kennung: E-Mail in spitzen Klammern (4T-002802)', () => {
  it('ein Marker in der Adresse: ab ihm gilt die sichere Seite', () => {
    // Variante B: Zerlegen Kennung und Marker den Absatz verschieden und ist
    // Code beteiligt, ist der Marker unsicher, und ab ihm ist alles privat.
    const doc = `Mail <a\`%%x@y.de> ${GEHEIM} %%\` Ende`;
    const auf = doc.indexOf('%%');
    expect(findPercentCommentRanges(doc)).toEqual([{ from: auf, to: doc.length, closed: false }]);
    expect(renderMarkdown(doc, 'de')).not.toContain(GEHEIM);
    expect(convertMarkdownPortable(doc)).not.toContain(GEHEIM);
  });

  it('kein stehen gebliebener Marker liegt außerhalb von Code', () => {
    const doc = 'Mail <a`%%x@y.de> und `code` %%Rest%% Ende';
    const html = renderMarkdown(doc, 'de');
    const ohneCode = html.replace(/<code[\s\S]*?<\/code>/g, '');
    expect(ohneCode).not.toContain('%%');
  });

  it('dieselbe Adresse ohne Backtick bleibt eine Adresse, der Kommentar darin verschwindet', () => {
    const html = renderMarkdown(`A <b%%${GEHEIM}%%c@d.de> B`, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('mailto:bc@d.de');
  });
});

// Bezugs-Rechnung: Sie fragt nach jedem Kommentar das ganze Dokument, weil die
// Antwort der Anzeige keine Neustart-Stellen nennt.
function bezug(doc) {
  return findPercentCommentRanges(doc, {
    imCode: (text, leit, optionen) => {
      const antwort = kommentarImCode(text, leit, false, optionen);
      return antwort && !Array.isArray(antwort) ? { ...antwort, bloecke: [] } : antwort;
    },
  });
}

// Erkennung genau wie die Bezugs-Rechnung, und kein Kommentar-Text als
// gewöhnlicher Text in Anzeige und portablem Export.
function wieBezug(doc) {
  const bereiche = findPercentCommentRanges(doc);
  expect(bereiche).toEqual(bezug(doc));
  expect(lageInAnzeige(renderMarkdown(doc, 'de', { frontmatterBlock: false }))).not.toBe('TEXT');
  // Der portable Export behält einen Marker in Code; gemessen an seiner Anzeige.
  expect(lageInAnzeige(renderMarkdown(convertMarkdownPortable(doc), 'de'))).not.toBe('TEXT');
  return bereiche;
}

// Zählt, wie oft das ganze Dokument gefragt wird (4T-002837: aus
// vorlagenLaengen und ganzeFragen zusammengelegt).
function ganzeFragen(doc) {
  const laengen = [];
  const bereiche = findPercentCommentRanges(doc, {
    imCode: (text, leit, optionen) => {
      laengen.push(text.length);
      return kommentarImCode(text, leit, false, optionen);
    },
  });
  return { bereiche, ganze: laengen.filter((l) => l > doc.length / 2).length };
}

// 4T-002802, Variante B: Nach jedem Kommentar fragt die Erkennung die Anzeige
// für den Abschnitt um ihn neu, statt eine eigene Regel zu entscheiden zu
// lassen, ob das Entfernen etwas ändert. Die Fälle stammen aus Runde 1 des
// Sicherheits-Reviews und des Zweitblicks und aus der Umsetzung.
describe('Variante B: Abschnitt statt eigener Regel, Schluss-Prüfung in beiden Richtungen (4T-002802)', () => {
  // Kein Kommentar-Text als gewöhnlicher Text und kein stehen gebliebener
  // Marker außerhalb von Code, in Anzeige und portablem Export.
  function dicht(doc) {
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(lageInAnzeige(html)).not.toBe('TEXT');
    const ohneCode = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '');
    expect(ohneCode).not.toContain('%%');
    expect(lageInAnzeige(convertMarkdownPortable(doc))).not.toBe('TEXT');
  }

  it('S1: ein Verweis mit Backtick in der Adresse, den erst das Entfernen eines Kommentars auflöst', () => {
    // Ohne den Kommentar endet die Adresse vor ` w`, der Verweis scheitert,
    // und ab dem Backtick in der Adresse beginnt ein Code-Stück, das den
    // nächsten Marker wörtlich hält. Bis Runde 1 übersprang eine eigene Regel
    // das neue Fragen, die Paarung verschob sich, und der Text blieb stehen.
    const doc = `x [a](u\`v%%)%% w %%c z\` ${K} Ende\n`;
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche.map((b) => doc.slice(b.from, b.to))).toEqual(['%%)%%', K]);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    dicht(doc);
    expect(stripPercentComments(doc)).not.toContain(GEHEIM);
  });

  it('ein Kommentar, dessen Entfernen einen Zaun zusammensetzt: der Marker darin bleibt wörtlich, der spätere Kommentar geschlossen', () => {
    // Zwei Backticks vor und einer nach dem Kommentar ergeben nach dem
    // Entfernen einen Zaun. Die Gegenprobe der zweiten Richtung trennt die
    // Backticks mit der Kennung wieder; die Nachprüfung mit dem eigenen
    // Kommentar verhindert, dass daraus die sichere Seite wird.
    const doc = `\`\`%%a%%\`\nx 50 %% Rabatt\n\`\`\`\n\nText ${K} Ende\n`;
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche.map((b) => doc.slice(b.from, b.to))).toEqual(['%%a%%', K]);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('50 %% Rabatt');
    expect(html).toContain('Ende');
    dicht(doc);
  });

  it('eine Verweis-Definition, die erst das Entfernen eines Kommentars bildet, nimmt die Folgezeile als Titel', () => {
    // Definitionen wirken im ganzen Dokument; steht `]:` im Kommentar oder im
    // Abschnitt, fragt die Erkennung das ganze Dokument.
    const doc = `[x]%%c%%: /url '\n\`a ${K} b\` '\n\nEnde\n`;
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche.map((b) => doc.slice(b.from, b.to))).toEqual(['%%c%%', K]);
    dicht(doc);
  });

  it('Z1: Läuft der Aufwand mitten im Durchgang ab, beginnt die sichere Seite am ersten wörtlich gelassenen Marker', () => {
    // Ein einziger großer Absatz: Nach jedem Kommentar ist der Abschnitt das
    // ganze Dokument, und der Aufwand reicht nicht für alle 60. Der Marker im
    // Code-Stück davor ist erst nach der Schluss-Prüfung geprüft.
    const teile = ['`a %% b`', 'x'.repeat(200000)];
    for (let i = 0; i < 60; i++) teile.push(`\`k\` %%c${i}%% weiter`);
    const doc = `${teile.join('\n')}\nEnde \`k\``;
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche).toEqual([{ from: doc.indexOf('%%'), to: doc.length, closed: false }]);
  });

  it('S2: jede Frage verlangt die Gliederung beider Fassungen; Ergebnis und Gegenprobe stimmen', () => {
    // Die Anzeige erhält bei jeder Frage beide Fassungen; ein Absatz, den sie
    // verschieden zerlegt und in dem Code beteiligt ist, macht seine Marker
    // unsicher (Fall E-Mail-Adresse oben). Die zweite Richtung der
    // Schluss-Prüfung fragt die öffnenden Marker im fertigen Text.
    const fragen = [];
    const doc = `Absatz mit \`code\` und ${K}.\n\n\`a %% b\` und %%zwei%% Ende\n`;
    const bereiche = findPercentCommentRanges(doc, {
      imCode: (text, leit, optionen) => {
        fragen.push(optionen);
        return kommentarImCode(text, leit, false, optionen);
      },
    });
    expect(bereiche.map((b) => doc.slice(b.from, b.to))).toEqual([K, '%%zwei%%']);
    expect(fragen.every((o) => o && o.gliederung === true)).toBe(true);
    dicht(doc);
  });

  // Zweitblick Runde 2, Befund 1: Ein Dokument aus einer einzigen langen Liste,
  // einem langen Zitat oder einer langen Tabelle. Ein Listen-Eintrag, seit
  // 4T-002837 auch ein Block in einem obersten Zitat und eine Zeile einer
  // obersten Tabelle, beginnt frisch; nach jedem Kommentar wird nur der
  // Abschnitt um ihn gefragt, nicht das ganze Dokument.
  for (const [name, zeile, vorspann] of [
    ['einer langen Liste', (t) => `- ${t}`, []],
    ['einem langen Zitat', (t) => `> ${t}\n>`, []],
    ['einer langen Tabelle', (t) => `| ${t} | x |`, ['| Kopf | Wert |', '|---|---|']],
  ]) {
    it(`Befund 1: in ${name} fragt nach jedem Kommentar nur den Abschnitt`, () => {
      const teile = ['# Titel', '', ...vorspann];
      for (let i = 0; i < 40; i++)
        teile.push(zeile(`Eintrag ${i} mit \`Code-Stück\` und %%Notiz ${i}%% danach`));
      const doc = `${teile.join('\n')}\n\nEnde ${K}\n`;
      const { bereiche, ganze } = ganzeFragen(doc);
      expect(bereiche).toHaveLength(41);
      expect(bereiche.every((b) => b.closed)).toBe(true);
      expect(bereiche.slice(0, 40).every((b, i) => doc.startsWith(`%%Notiz ${i}%%`, b.from))).toBe(
        true,
      );
      // Ganz gefragt werden nur das Dokument zu Beginn und die Gegenprobe.
      expect(ganze).toBeLessThanOrEqual(2);
      expect(bereiche).toEqual(bezug(doc));
      dicht(doc);
    });
  }

  it('Befund 2: Öffnet das Entfernen eines Kommentars einen Zaun über den Abschnitt hinaus, wird der Abschnitt bis zum ganzen Dokument verdoppelt', () => {
    // Zwei Backticks vor und einer nach dem Kommentar ergeben einen Zaun, der
    // bis zum Dokument-Ende offen bleibt. Der Abschnitt nach dem Kommentar
    // reicht nur bis zum zweiten Block danach; die Block-Anfänge darin weichen
    // ab, also wird verdoppelt. Der spätere Marker liegt danach in Code und
    // bleibt wörtlich; ohne das Verdoppeln hielte die Erkennung ihn für einen
    // Kommentar, und die Schluss-Prüfung ginge ab ihm auf die sichere Seite.
    const doc = [
      'Absatz eins.',
      '',
      'Absatz zwei.',
      '',
      '``%%x%%`',
      'Text drei.',
      '',
      'Absatz vier.',
      '',
      'Absatz fünf.',
      '',
      'Absatz sechs.',
      '',
      `Schluss ${K} Ende`,
      '',
    ].join('\n');
    const bereiche = findPercentCommentRanges(doc);
    expect(bereiche).toEqual([
      { from: doc.indexOf('%%x%%'), to: doc.indexOf('%%x%%') + 5, closed: true },
    ]);
    const html = renderMarkdown(stripPercentComments(doc), 'de');
    expect(lageInAnzeige(html)).toBe('Code');
    // Der portable Export behält den Marker im offenen Zaun; die Anzeige des
    // Exports zeigt ihn als Code.
    expect(lageInAnzeige(renderMarkdown(convertMarkdownPortable(doc), 'de'))).toBe('Code');
  });
});

// Zweitblick Runde 3 zu 4T-002802: Eine Neustart-Stelle muss für sich gelesen
// wieder so beginnen wie im ganzen Dokument. Eine Folgezeile eines Zitats darf
// vor `>` vier und mehr Leerzeichen tragen und gehört trotzdem zum Zitat; für
// sich gelesen wäre sie ein eingerückter Code-Block. Am 2026-11-22 wurden Blöcke
// in Zitaten deshalb auf Entscheidung der Steuerung als Neustart-Stellen
// herausgenommen; seit 4T-002837 zählen sie wieder, aber nur, wenn ihre Zeile
// für sich gelesen als Zitat beginnt (höchstens drei Leerzeichen vor `>`).
// Gemessen wird gegen die Bezugs-Rechnung, die nach jedem Kommentar das ganze
// Dokument fragt.
describe('Neustart-Stellen in Listen und Zitaten (Zweitblick Runde 3, 4T-002802, 4T-002837)', () => {
  it('Befund 1: eine Zitat-Folgezeile mit vier Leerzeichen vor `>` ist keine Neustart-Stelle', () => {
    const doc = [
      '> Start',
      '>',
      '    > Vor',
      '    >',
      '    > Text %%c%% `a',
      `> %% b\` e ${K}`,
      '>',
      '> Nach',
      '>',
      '> Ende',
      '',
    ].join('\n');
    const bereiche = wieBezug(doc);
    expect(bereiche.map((b) => doc.slice(b.from, b.to))).toEqual(['%%c%%', K]);
    expect(bereiche.every((b) => b.closed)).toBe(true);
  });

  it('dasselbe mit Tabulator vor `>`', () => {
    const doc = [
      '> Start',
      '>',
      '\t> Vor',
      '\t>',
      '\t> Text %%c%% `a',
      `> %% b\` e ${K}`,
      '>',
      '> Ende',
      '',
    ].join('\n');
    expect(wieBezug(doc).map((b) => doc.slice(b.from, b.to))).toEqual(['%%c%%', K]);
  });

  it('Befund 2: Öffnet das Entfernen eines Kommentars in einem Zitat einen Zaun, bleibt der spätere Marker Code', () => {
    // Zwei Backticks vor und einer nach dem Kommentar ergeben einen Zaun, der
    // bis zum Ende des Zitats offen bleibt; der spätere Marker liegt danach in
    // Code und bleibt wörtlich.
    const doc = [
      '> Absatz eins.',
      '>',
      '> Absatz zwei.',
      '>',
      '> ``%%x%%`',
      '> Text drei.',
      '>',
      '> Absatz vier.',
      '>',
      '> Absatz fünf.',
      '>',
      `> Schluss ${K} Ende`,
      '',
    ].join('\n');
    expect(wieBezug(doc).map((b) => doc.slice(b.from, b.to))).toEqual(['%%x%%']);
    expect(lageInAnzeige(renderMarkdown(stripPercentComments(doc), 'de'))).toBe('Code');
  });

  it('Befund 2: Ein Kommentar über eine Eintrags-Grenze ändert die folgenden Einträge einer Liste', () => {
    // Das Entfernen macht aus der Zeile nach dem Kommentar eine Leerzeile; die
    // Liste endet, und ein Zaun im eingerückten Rest beginnt neu.
    const doc = [
      '- eins',
      '- zwei %%c',
      '- drei',
      '%% ```',
      '- vier `a',
      `- fünf %% b\` ${K}`,
      '- sechs',
      '- sieben',
      '',
    ].join('\n');
    wieBezug(doc);
  });

  it('Gegenprobe: Einträge oberster Listen mit höchstens drei Leerzeichen bleiben Neustart-Stellen', () => {
    // Zweitblick der gezielten Nachprüfung: Fiele die Prüfung der Anfangs-Zeile
    // zu streng aus, würde nach jedem Kommentar wieder das ganze Dokument
    // gefragt. Eine lange Liste mit eingerückten Einträgen fragt deshalb nur das
    // Dokument zu Beginn und die Gegenprobe ganz, auch mit Windows-Zeilenenden
    // und mit leeren Eintrags-Zeilen.
    for (const vor of ['', ' ', '   ']) {
      for (const [ende, leer] of [
        ['\n', false],
        ['\r\n', false],
        ['\r\n', true],
      ]) {
        const teile = ['# Titel', ''];
        for (let i = 0; i < 40; i++) {
          const inhalt = `Eintrag ${i} mit \`Code-Stück\` und %%Notiz ${i}%% danach`;
          if (leer) teile.push(`${vor}-`, `${vor}  ${inhalt}`);
          else teile.push(`${vor}- ${inhalt}`);
        }
        const doc = `${teile.join(ende)}${ende}${ende}Ende ${K}${ende}`;
        const { bereiche, ganze } = ganzeFragen(doc);
        expect(bereiche).toHaveLength(41);
        expect(bereiche.every((b) => b.closed)).toBe(true);
        expect(ganze).toBeLessThanOrEqual(2);
      }
    }
  });

  it('Gegenprobe: Zitate mit höchstens drei Leerzeichen vor `>` werden genau wie die Bezugs-Rechnung erkannt', () => {
    for (const vor of ['', ' ', '   ']) {
      const doc = [
        `${vor}> eins %%a%% \`x\``,
        `${vor}>`,
        `${vor}> zwei %%b%%`,
        `${vor}>`,
        `${vor}> drei ${K}`,
        '',
      ].join('\n');
      expect(wieBezug(doc)).toHaveLength(3);
      const liste = [
        `${vor}- eins %%a%% \`x\``,
        `${vor}- zwei %%b%%`,
        `${vor}- drei ${K}`,
        '',
      ].join('\n');
      expect(wieBezug(liste)).toHaveLength(3);
    }
  });
});

// 4T-002837: Zeilen oberster Tabellen und Blöcke oberster Zitate sind
// Neustart-Stellen. Eine Tabellen-Zeile wird mit vorangestellter Kopf- und
// Trennzeile gefragt; reicht eine Tabelle so weit, dass die Anzeige sie an der
// Obergrenze ergänzter Zellen beendet, zählt keine ihrer Zeilen. Jeder Fall
// wird gegen die Bezugs-Rechnung gemessen.
describe('Private Kommentare in großen Tabellen und Zitaten (4T-002837)', () => {
  const zeilen = (n, bau) => Array.from({ length: n }, (_, i) => bau(i));
  const texte = (doc) => wieBezug(doc).map((b) => doc.slice(b.from, b.to));

  it('eine lange Tabelle und ein langes Zitat werden genau wie die Bezugs-Rechnung erkannt', () => {
    const tabelle = [
      '| A | B | C |',
      '|---|:-:|--:|',
      ...zeilen(120, (i) => `| ${i} %%t${i}%% | \`c%%\` | z %%u${i}%% \`|\` |`),
      '',
      `Ende ${K}`,
      '',
    ].join('\n');
    expect(texte(tabelle)).toHaveLength(241);
    const zitat = [
      ...zeilen(120, (i) => `> ${i} %%z${i}%% \`c%%\` ende\n>`),
      '',
      `Ende ${K}`,
      '',
    ].join('\n');
    expect(texte(zitat)).toHaveLength(121);
  });

  it('ein Kommentar in Kopf- oder Trennzeile: die Zeilen danach werden genau erkannt', () => {
    const rumpf = zeilen(30, (i) => `| ${i} %%r${i}%% | \`x\` |`);
    for (const kopf of [
      ['| Kopf %%k%% | Wert |', '|---|---|'],
      ['| Kopf %%k | Wert |', '|---|---|%% x'],
      ['| Kopf | Wert %%k |', '|---|---|', '| a | b%% |'],
      ['| Kopf | Wert |', '|---|%%k%%---|'],
    ]) {
      const doc = [...kopf, ...rumpf, '', `Ende ${K}`, ''].join('\n');
      expect(wieBezug(doc).length).toBeGreaterThan(0);
    }
  });

  it('ein Kommentar mit `|` oder über mehrere Zeilen ändert die Zellen der Zeile', () => {
    const doc = [
      '| A | B |',
      '|---|---|',
      ...zeilen(20, (i) => `| ${i} | x |`),
      '| a %%x | y%% | `b |',
      '| c | d` %%e |',
      '| f | %% g |',
      '| `h %%i | j` |',
      '| k%% | `l` |',
      ...zeilen(20, (i) => `| ${i} %%n${i}%% | \`x\` |`),
      '',
      `Ende ${K}`,
      '',
    ].join('\n');
    expect(texte(doc)).toContain(K);
  });

  it('Zitate mit Folgezeilen ohne `>` und mit eingerückten Folgezeilen', () => {
    const doc = [
      '> eins %%a%% `x`',
      'faul weiter %%b%% `y',
      '> z` drei',
      '>',
      '>     eingerückt %%c%%',
      '>',
      '    > vier %%d `q',
      '> fünf` d%% %%e%%',
      '>',
      ...zeilen(20, (i) => `> ${i} %%n${i}%% \`x\`\n>`),
      '',
      `Ende ${K}`,
      '',
    ].join('\n');
    expect(texte(doc)).toContain(K);
  });

  it('Obergrenze ergänzter Zellen: eine Tabelle darüber hat keine Neustart-Stellen', () => {
    // Die Anzeige beendet eine Tabelle, sobald sie mehr als MAX_ERGAENZTE_ZELLEN
    // Zellen ergänzt hat; eine Zeile, die für sich gelesen frisch beginnt, läge
    // dann womöglich hinter dem Ende. Gemessen an einer nachgestellten Antwort
    // der Anzeige, weil sie für eine Tabelle dieser Größe mehrere Sekunden
    // braucht: jede Zeile ab der dritten ein Block mit Kopf in Zeile 0.
    const spalten = 40;
    const grenze = Math.floor(MAX_ERGAENZTE_ZELLEN / spalten) - 2;
    const nachgestellt = (text) => {
      const z = text.split('\n');
      const tabelle = z[0].startsWith('|') && /^\|(?:-\|)+$/.test(z[1]);
      const antwort = { code: [], unsicher: [], bloecke: [], koepfe: [], spalten: [] };
      for (let i = 0; i < z.length; i++) {
        if (z[i].trim() === '' || (i > 0 && z[i - 1].trim() !== '' && !(tabelle && i > 1)))
          continue;
        antwort.bloecke.push(i);
        antwort.koepfe.push(tabelle && i > 1 ? 0 : -1);
        antwort.spalten.push(tabelle && i > 1 ? spalten : null);
      }
      return { ...antwort, definitionen: null };
    };
    for (const [n, ueber] of [
      [grenze, false],
      [grenze + 1, true],
    ]) {
      const kopf = ['|' + ' h |'.repeat(spalten), '|' + '-|'.repeat(spalten)];
      const rumpf = zeilen(n, (i) => (i < n - 20 ? `| ${i}` : `| ${i} %%n${i}%% \`c\``));
      const doc = [...kopf, ...rumpf, '', `Ende ${K}`, ''].join('\n');
      const laengen = [];
      const bereiche = findPercentCommentRanges(doc, {
        imCode: (text) => {
          laengen.push(text.length);
          return nachgestellt(text);
        },
      });
      expect(bereiche).toHaveLength(21);
      const ganze = laengen.filter((l) => l > doc.length / 2).length;
      if (ueber) expect(ganze).toBeGreaterThan(20);
      else expect(ganze).toBeLessThanOrEqual(2);
    }
  });

  it('Wächter: die Obergrenze ergänzter Zellen ist die der Anzeige', () => {
    const quelle = readFileSync(
      new URL('../../../node_modules/markdown-it/lib/rules_block/table.mjs', import.meta.url),
      'utf8',
    );
    const treffer = /const MAX_AUTOCOMPLETED_CELLS = (0x[0-9a-f]+|\d+)/i.exec(quelle);
    expect(treffer).not.toBeNull();
    expect(Number(treffer[1])).toBe(MAX_ERGAENZTE_ZELLEN);
  });
});
