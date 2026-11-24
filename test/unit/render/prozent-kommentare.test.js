// 4T-000479 (Epic 3E-000089): %%-Kommentare — Scanner, Strip und Render-Pfade.
//
// Deckt die code-bewusste Vorverarbeitung (stripPercentComments /
// findPercentCommentRanges in plugins.js) sowie die Anbindung in
// renderMarkdown und convertMarkdownPortable (markdown.js) ab: privater
// Text zwischen %%-Markern verschwindet aus jeder gerenderten Ansicht und
// jedem Export, bleibt aber im Quelltext; %% in Code-Bloecken und Code-
// Spans bleibt Literal; \%% ist ein Escape; unpaariges %% wirkt bis EOF;
// der Strip ist zeilentreu (data-source-line).
//
// 4T-002802: Ob ein Marker in Code liegt, entscheidet allein der Zerleger der
// Anzeige über das ganze Dokument; die Fälle aller Runden des
// Sicherheits-Reviews zu 3E-000434 bleiben als Prüffälle stehen, die Fälle zum
// inneren Ablauf prüfen den Vertrag der Code-Frage (Text mit Kennungen und
// Leit-Zeichen, Antwort als Feld der Nummern in Code).
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
import { MAX_LAENGE, MAX_AUFWAND_ZEICHEN } from '../../../src/shared/markdown/plugins/comments.js';

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
const Z3 = '```';

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

describe('Code-Frage der Erkennung (4T-002792, neu gefasst mit 4T-002802)', () => {
  // Zählt die Zerlegungen und die vorgelegten Zeichen.
  function zaehlend() {
    const z = { n: 0, zeichen: 0 };
    z.frage = (text, leit, optionen) => {
      z.n++;
      z.zeichen += text.length;
      return kommentarImCode(text, leit, false, optionen);
    };
    return z;
  }
  // Kennung des Markers n zum Leit-Zeichen, wie die Erkennung sie setzt.
  const kennung = (leit, n) =>
    leit + String.fromCharCode(0xe100 + (n >> 12)) + String.fromCharCode(0xe900 + (n & 4095));
  const LEIT = '';

  it('ohne Backtick, Tilde und Einrückung gibt es keine Rückfrage', () => {
    const z = zaehlend();
    findPercentCommentRanges(`Text ohne Backtick ${K} Ende.\n\nNoch ${K} einer.`, {
      imCode: z.frage,
    });
    expect(z.n).toBe(0);
  });

  it('Backticks in anderen Absätzen: eine Zerlegung und die Gegenprobe der Kommentare', () => {
    // Variante B (4T-002802): Die Schluss-Prüfung fragt auch in der zweiten
    // Richtung, ob ein öffnender Marker in der Anzeige außerhalb von Code liegt.
    const z = zaehlend();
    const bereiche = findPercentCommentRanges(KONSTELLATIONEN[0][1], { imCode: z.frage });
    expect(bereiche.length).toBe(1);
    expect(z.n).toBe(2);
  });

  it('im echten Code-Stück: eine Zerlegung und die Schluss-Prüfung', () => {
    const z = zaehlend();
    const bereiche = findPercentCommentRanges(KONSTELLATIONEN[2][1], { imCode: z.frage });
    expect(bereiche).toEqual([]);
    expect(z.n).toBe(2);
  });

  it('die Code-Frage nennt die Nummern der Kennungen in Code, in jeder Art von Code', () => {
    const k = (n) => kennung(LEIT, n);
    const text =
      `\`a ${k(0)}\` und ${k(1)} frei\n\n` +
      `\`\`\`\n${k(2)}\n\`\`\`\n\n` +
      `    ${k(3)} eingerückt\n\n` +
      `~~~\n${k(4)}\n~~~\n\nzum Schluss ${k(5)}\n`;
    expect(new Set(kommentarImCode(text, LEIT))).toEqual(new Set([0, 2, 3, 4]));
    expect(kommentarImCode('ohne Kennung `a`', LEIT)).toEqual([]);
  });

  it('die Code-Frage bleibt ohne Antwort bei einer Eingabe falscher Art', () => {
    expect(kommentarImCode(42, LEIT)).toBeNull();
    expect(kommentarImCode('`a`', 7)).toBeNull();
    expect(kommentarImCode('`a`', 'zwei')).toBeNull();
    expect(kommentarImCode('x'.repeat(MAX_LAENGE * 1.5 + 1), LEIT)).toBeNull();
  });

  it('ohne Code-Frage ist ab dem ersten Marker alles privat, sobald das Dokument Code tragen kann (sichere Seite)', () => {
    setzeCodeFrage(null);
    try {
      expect(stripPercentComments('Text `%%literal%%` danach')).toBe('Text `');
      // Ohne Backtick, Tilde und Einrückung gibt es keinen Code und nichts Unklares.
      expect(stripPercentComments('a %%x%% b')).toBe('a  b');
      expect(stripPercentComments('```\n%%literal%%\n```')).toBe('```\n\n');
      // Vier Leerzeichen können einen Code-Block beginnen: ab dem ersten Marker privat.
      expect(stripPercentComments('a %%x%% b\n\n    %%c%%')).toBe('a \n\n');
    } finally {
      // Der Neuaufbau der Instanzen meldet die Code-Frage wieder an.
      configureExtensions(['comments']);
      configureExtensions([]);
    }
    expect(stripPercentComments('Text `%%literal%%` danach')).toBe('Text `%%literal%%` danach');
  });

  // Befund 1 des Sicherheits-Reviews zu 3E-000434: Eine Ausweich-Regel, die den
  // Marker bloss als Kommentar-Beginn nimmt, verschiebt die Paarung, wenn er in
  // Wahrheit in einem Code-Stück liegt; der echte Kommentar dahinter bliebe
  // stehen. Je Ausweich-Bedingung ein Fall mit einem einzelnen Marker im
  // Code-Stück und einem echten Kommentar danach.
  describe('die sichere Seite legt keinen Kommentar frei', () => {
    const dokument = `Schreibe \`%%\` davor. %%${GEHEIM}%% Ende.`;

    it('Gegenprobe: mit Code-Frage bleibt der Marker im Code-Stück, der Kommentar ist entfernt', () => {
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

    it('Code-Frage, die abbricht', () => {
      const wirft = () => {
        throw new Error('Zerleger nicht erreichbar');
      };
      expect(stripPercentComments(dokument, { imCode: wirft })).not.toContain(GEHEIM);
    });

    it('Code-Frage mit einer Antwort falscher Art', () => {
      expect(stripPercentComments(dokument, { imCode: () => true })).not.toContain(GEHEIM);
    });

    it('jedes mögliche Leit-Zeichen kommt im Dokument schon vor', () => {
      let alle = '';
      for (let c = 0xe000; c < 0xe100; c++) alle += String.fromCharCode(c);
      const z = zaehlend();
      const aus = stripPercentComments(`${alle} ${dokument}`, { imCode: z.frage });
      expect(z.n).toBe(0);
      expect(aus).not.toContain(GEHEIM);
    });

    it('Dokument über der Längen-Grenze', () => {
      const z = zaehlend();
      const aus = stripPercentComments(`${dokument} ${'x'.repeat(MAX_LAENGE)}`, {
        imCode: z.frage,
      });
      expect(z.n).toBe(0);
      expect(aus).not.toContain(GEHEIM);
    });

    it('Aufwand des Aufrufs erschöpft', () => {
      // Jeder Kommentar über ein Zeilenende kann die Gliederung ändern und
      // kostet eine Zerlegung des ganzen Dokuments.
      const fuell = 'x'.repeat(200000);
      const teile = [fuell];
      for (let i = 0; i < 60; i++) teile.push(`\`k\` %%c${i}\nweiter%%`);
      const aus = stripPercentComments(`${teile.join('\n')}\n${dokument}`);
      expect(aus).not.toContain(GEHEIM);
    });
  });

  it('Aufwands-Grenze: über dem Aufwand eines Aufrufs ist ab dem offenen Marker alles privat', () => {
    // Ein einziger Absatz: Nach jedem Kommentar ist der Abschnitt das ganze
    // Dokument (Variante B, 4T-002802).
    const z = zaehlend();
    const fuell = 'x'.repeat(200000);
    const teile = [fuell];
    for (let i = 0; i < 60; i++) teile.push(`\`k\` %%c${i}%% weiter`);
    const doc = `${teile.join('\n')}\nEnde \`k\``;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(z.zeichen).toBeLessThanOrEqual(MAX_AUFWAND_ZEICHEN);
    expect(z.n).toBeGreaterThan(1);
    expect(z.n).toBeLessThan(60);
    const letzter = bereiche.at(-1);
    expect(letzter.closed).toBe(false);
    expect(letzter.to).toBe(doc.length);
    expect(doc.slice(letzter.from)).toContain('Ende');
  });

  it('eine große Tabelle voller Marker in Code-Stücken braucht eine Zerlegung und die beiden Schluss-Prüfungen', () => {
    // Nachbesserung zu 4T-002792: Bisher kostete jeder Marker eine Rückfrage,
    // und über 256 Markern verschwand der Rest des Dokuments.
    const z = zaehlend();
    const zeilen = ['| Nr | Syntax |', '|---|---|'];
    for (let i = 0; i < 600; i++) zeilen.push(`| ${i} | \`%%\` oder \`a %%b%% c\` |`);
    const doc = `${zeilen.join('\n')}\n\nDanach ${K} Ende.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(z.n).toBe(3);
    expect(bereiche.length).toBe(1);
    expect(doc.slice(bereiche[0].from, bereiche[0].to)).toBe(K);
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('Danach');
    expect(html).not.toContain(GEHEIM);
  });

  it('ein echter Kommentar am Ende einer solchen Tabelle', () => {
    const z = zaehlend();
    const zeilen = ['| Nr | Syntax |', '|---|---|'];
    for (let i = 0; i < 600; i++) zeilen.push(`| ${i} | \`a %%b%% c\` |`);
    zeilen.push(`| Ende | ${K} und \`%%\` |`);
    const doc = `${zeilen.join('\n')}\n\nDanach.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(1);
    expect(doc.slice(bereiche[0].from, bereiche[0].to)).toBe(K);
    expect(z.n).toBeLessThanOrEqual(4);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Danach');
  });

  it('eine gemischte Tabelle (je Zeile ein Marker in Code und ein Kommentar) kostet höchstens eine Zerlegung je Zeile', () => {
    // Zweitblick zu 3E-000434, Runde 3, Befund 3: Ab etwa 30 Zeilen war früher
    // die Grenze erreicht und der Rest des Dokuments verschwand.
    const z = zaehlend();
    const zeilen = ['| a | b |', '|---|---|'];
    for (let i = 0; i < 60; i++) zeilen.push(`| \`%%\` | %%${GEHEIM}${i}%% |`);
    const doc = `${zeilen.join('\n')}\n\nDanach sichtbar.\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(60);
    expect(bereiche.every((b) => b.closed)).toBe(true);
    expect(z.n).toBeLessThanOrEqual(60 + 2);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).toContain('Danach sichtbar.');
  });

  it('eine große Tabelle: Marker in ihren Code-Stücken bleiben wörtlich', () => {
    // Belegt an der Funktions-Seite des Handbuchs (Linux-Lauf vom 2026-11-21):
    // Unter einer Längen-Grenze von 20.000 Zeichen galten die Marker als
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

  it('ein Dokument mit 10.000 Zeilen kostet zwei Zerlegungen des ganzen Dokuments und kleine Abschnitte', () => {
    // Der Aufwand ist über die vorgelegten Zeichen belegt, nicht über die
    // Wanduhr. Variante B (4T-002802): Nach jedem Kommentar fragt die
    // Erkennung nur den Abschnitt um ihn neu.
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
    expect(z.zeichen).toBeLessThanOrEqual(3 * doc.length);
  });

  it('das große Mess-Dokument (40 Code-Blöcke, 120 Kommentare) braucht drei Zerlegungen und kleine Abschnitte', () => {
    // AK5 von 4T-002802 misst die Zeit mit dem Mess-Skript; hier steht der
    // Aufwand in vorgelegten Zeichen, unabhängig von der Last des Prüfrechners:
    // die erste Zerlegung, beide Schluss-Prüfungen und je Kommentar ein
    // Abschnitt (Variante B).
    const z = zaehlend();
    const teile = [];
    for (let i = 0; i < 40; i++) {
      teile.push(`## Abschnitt ${i}`, `Text mit \`code\` und ${K} weiter.`);
      teile.push(`${Z3}js\nconst a = '50 %% Rabatt';\n${Z3}`);
      teile.push(`- Punkt mit %%privat ${i}%% und \`x\``, `> Zitat %%vertraulich%% Ende`);
    }
    const doc = `${teile.join('\n\n')}\n`;
    const bereiche = findPercentCommentRanges(doc, { imCode: z.frage });
    expect(bereiche.length).toBe(120);
    expect(z.zeichen).toBeLessThanOrEqual(5 * doc.length);
    const html = renderMarkdown(doc, 'de');
    expect(html).not.toContain(GEHEIM);
    expect(html).not.toContain('privat');
    expect(html).toContain('50 %% Rabatt');
  });

  it('ein Kommentar, der erst nach seinem Entfernen ein Code-Stück schließt, wird neu entschieden', () => {
    // Die Schluss-Prüfung: Ein Marker, der vor dem Entfernen eines späteren
    // Kommentars in Code lag, danach aber nicht mehr, wird Kommentar-Beginn.
    const doc = `a \`b %%x%% c %%${GEHEIM}\` d%% e \`f\`\n`;
    const html = renderMarkdown(doc, 'de', { frontmatterBlock: false });
    expect(lageInAnzeige(html)).not.toBe('TEXT');
    expect(convertMarkdownPortable(doc).includes(GEHEIM)).toBe(lageInAnzeige(html) === 'Code');
  });

  it('Einstellungs-Block einer Tafel samt Zaun bleibt ein Kommentar, auch nach einer Karte mit einzelnem Backtick', () => {
    const tafel = '- Karte ` eins\n\n%% kanban:settings\n```\n{"a":1}\n```\n%%\n';
    const bereiche = findPercentCommentRanges(tafel);
    expect(bereiche.length).toBe(1);
    expect(bereiche[0].closed).toBe(true);
  });
});

// 4T-002802, vom Auftraggeber am 2026-11-24 gemeldet: Eigenschaften-Kopf,
// danach genau eine Leerzeile und direkt ein Code-Block, weiter unten eine
// Listenzeile mit Kommentar. In 1.161.1 und 1.161.2 hielt die Erkennung den
// ersten Kommentar für offen: Der Editor meldete «Unpaariger Kommentar-Marker»,
// Anzeige und Export blendeten alles ab dem Kommentar aus. Ursache war die
// Zeilen-Suche am Text-Anfang, der im Editor und im Export erst hinter dem
// Kopf beginnt, also mit der Leerzeile. Die Varianten ohne und mit zwei
// Leerzeilen stehen als Nachbarn mit.
describe('Eigenschaften-Kopf mit Code-Block und Kommentar in einer Listenzeile (4T-002802)', () => {
  const kopf = '---\ntitel: Journal\ntags: [woche]\n---\n';
  const rumpf =
    '```perspective-journal-nav\nzurueck: [[KW47]]\nvor: [[KW49]]\n```\n\n' +
    '# Woche\n\n' +
    '- x Wochen und x Tage %% (jeden Donnerstag ist Wochenwechsel) %%\n' +
    '- zweite Zeile %% noch privat %%\n\n' +
    'Schlusstext sichtbar.\n';

  for (const leer of [0, 1, 2]) {
    const nachKopf = '\n'.repeat(leer) + rumpf;
    const doc = kopf + nachKopf;

    it(`${leer} Leerzeile(n): Editor-Sicht hinter dem Kopf findet zwei geschlossene Kommentare`, () => {
      // computeCommentRanges im Editor legt den Text ab der Zeile nach dem Kopf vor.
      const bereiche = findPercentCommentRanges(nachKopf);
      expect(bereiche.length).toBe(2);
      expect(bereiche.every((b) => b.closed)).toBe(true);
      expect(nachKopf.slice(bereiche[0].from, bereiche[0].to)).toBe(
        '%% (jeden Donnerstag ist Wochenwechsel) %%',
      );
    });

    it(`${leer} Leerzeile(n): ganzes Dokument findet zwei geschlossene Kommentare`, () => {
      const bereiche = findPercentCommentRanges(doc);
      expect(bereiche.length).toBe(2);
      expect(bereiche.every((b) => b.closed)).toBe(true);
    });

    it(`${leer} Leerzeile(n): Lese-Ansicht verbirgt nur die Kommentare`, () => {
      const html = renderMarkdown(doc, 'de');
      expect(html).toContain('x Wochen und x Tage');
      expect(html).toContain('zweite Zeile');
      expect(html).toContain('Schlusstext sichtbar.');
      expect(html).not.toContain('Donnerstag');
      expect(html).not.toContain('noch privat');
    });

    it(`${leer} Leerzeile(n): portabler Export verbirgt nur die Kommentare`, () => {
      const out = convertMarkdownPortable(doc);
      expect(out.startsWith(kopf)).toBe(true);
      expect(out).toContain('x Wochen und x Tage');
      expect(out).toContain('Schlusstext sichtbar.');
      expect(out).not.toContain('Donnerstag');
      expect(out).not.toContain('noch privat');
    });
  }
});
