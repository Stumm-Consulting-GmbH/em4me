// 4T-002838: private Kommentare in Sonder-Blöcken mit eigener Sprache. Die
// Block-Regel paart ohne Code-Frage, reicht nie über den Rumpf hinaus und
// lässt die eigenen %%-Zeilen des Mermaid-Diagramms stehen.
import { describe, it, expect, afterEach } from 'vitest';
// Die Pipeline zuerst: Sie meldet die Code-Frage der Kommentar-Regel an.
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../../src/shared/markdown/markdown.js';
import {
  stripBlockComments,
  blockCommentRanges,
  ereignisRumpf,
  sonderRumpfOhneKommentare,
  SONDER_SPRACHEN,
} from '../../../src/shared/markdown/plugins/comments-block.js';
import { parsePerspectiveEvents } from '../../../src/shared/events/events-fence.js';
import { collectMermaidSources } from '../../../src/shared/mermaid-fence.js';

describe('4T-002838: Block-Regel für private Kommentare', () => {
  it('entfernt einen Kommentar in einer Zeile', () => {
    expect(stripBlockComments('a %%geheim%% b\n')).toBe('a  b\n');
  });

  it('entfernt einen Kommentar über Zeilen zeilentreu', () => {
    expect(stripBlockComments('a %%x\ny\nz%% b\nc\n')).toBe('a \n\n b\nc\n');
  });

  it('blendet bei unpaarigem Marker den Rest des Rumpfs aus', () => {
    const r = blockCommentRanges('a\n%%offen\nb\n');
    expect(r).toEqual([{ from: 2, to: 12, closed: false }]);
    expect(stripBlockComments('a\n%%offen\nb\n')).toBe('a\n\n\n');
  });

  it('lässt einen maskierten Marker als %% stehen', () => {
    expect(stripBlockComments('50 \\%% Anteil\n')).toBe('50 %% Anteil\n');
  });

  it('kennt keinen Code: Backticks schützen nicht', () => {
    expect(stripBlockComments('`a %%x%% b`\n')).toBe('`a  b`\n');
  });

  it('mit maskeBehalten bleibt die Maskierung stehen', () => {
    expect(stripBlockComments('50 \\%% Anteil %%x%%\n', { maskeBehalten: true })).toBe(
      '50 \\%% Anteil \n',
    );
  });

  it('lässt einen Rumpf ohne Marker unverändert', () => {
    const t = 'x | y\n\\n\n';
    expect(stripBlockComments(t)).toBe(t);
  });
});

describe('4T-002838: Mermaid-Diagramm', () => {
  const M = { mermaid: true };

  it('lässt Steuer-Anweisung und Mermaid-Kommentarzeilen stehen', () => {
    const t =
      "%%{init: {'theme':'dark'}}%%\ngraph TD\n  %% Mermaid-Kommentar\n  A-->B\n%% noch einer\n";
    expect(stripBlockComments(t, M)).toBe(t);
  });

  it('entfernt einen privaten Kommentar mitten in der Zeile', () => {
    expect(stripBlockComments('graph TD\n  A-->B %%geheim%%\n', M)).toBe('graph TD\n  A-->B \n');
  });

  it('entfernt einen privaten Kommentar über mehrere Zeilen', () => {
    const t = 'graph TD\n  A-->B %%geheim\n  C-->D\n  ende%%\n  E-->F\n';
    expect(stripBlockComments(t, M)).toBe('graph TD\n  A-->B \n\n\n  E-->F\n');
  });

  it('eine Kommentarzeile mit zweitem Marker ist ein privater Kommentar', () => {
    expect(stripBlockComments('%%geheim%% A-->B\n', M)).toBe(' A-->B\n');
  });

  it('Steuer-Anweisung über mehrere Zeilen bleibt', () => {
    const t = "%%{\n  init: {'theme':'forest'}\n}%%\ngraph TD\n  A-->B %%x%%\n";
    expect(stripBlockComments(t, M)).toBe(
      "%%{\n  init: {'theme':'forest'}\n}%%\ngraph TD\n  A-->B \n",
    );
  });

  it('ohne Mermaid-Option paaren zwei Kommentarzeilen', () => {
    expect(stripBlockComments('%% a\nB\n%% c\n')).toBe('\n\n c\n');
  });
});

// --- Anzeige und Export je Block -------------------------------------------------
//
// Je Block ein Dokument mit privaten Kommentaren (GEHEIM-…) und dasselbe
// Dokument, in dem sie von Hand zeilentreu entfernt sind. Die Anzeige beider
// muss im sichtbaren Text gleich sein, der Export darf keinen Kommentar
// tragen, und eine Steuer-Anweisung des Blocks bleibt stehen. Mit
// ausgeschalteter Erweiterung «comments» bleibt der Kommentar wie bisher.
const Z = '```';
const doc = (...zeilen) => zeilen.join('\n') + '\n';
const sichtbar = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const anzeige = (d) => renderMarkdown(d, 'de', { frontmatterBlock: false });
const exportText = (d) => convertMarkdownPortable(d, true, 'de');
const DB_KOPF = ['---', 'db-table:', '  fields:', '    - name: name', '    - name: ort'];
const DB = [...DB_KOPF, '  display: name', '---', '', Z + 'perspective-records'];

const BLOECKE = {
  'Perspective Table': {
    mit: doc(
      Z + 'perspective-table',
      '{|',
      '|+ Titel %%GEHEIM-1%%',
      '|-',
      '| Zelle %%GEHEIM-2%%',
      '| b',
      '|}',
      Z,
    ),
    ohne: doc(Z + 'perspective-table', '{|', '|+ Titel ', '|-', '| Zelle ', '| b', '|}', Z),
    steuer: /<td[^>]*>\s*b\s*<\/td>/,
  },
  Datensatz: {
    mit: doc(...DB, '|- id="r-00001"', '| Anna %%GEHEIM-1', 'weiter%%', '| Basel', Z),
    ohne: doc(...DB, '|- id="r-00001"', '| Anna ', '', '| Basel', Z),
    steuer: /Basel/,
  },
  'Ereignis-Block': {
    mit: doc(
      Z + 'perspective-events',
      'view: table',
      '| 2020-01-01 | 2020-06-30 | Start %%GEHEIM-1%% | projekt | Notiz %%GEHEIM-2%% | | | | |',
      '%%GEHEIM-3%%',
      Z,
    ),
    ohne: doc(
      Z + 'perspective-events',
      'view: table',
      '| 2020-01-01 | 2020-06-30 | Start  | projekt | Notiz  | | | | |',
      '',
      Z,
    ),
    steuer: /Projekt/i,
  },
  Dashboard: {
    mit: doc(
      '# D',
      '',
      Z + 'perspective-dashboard',
      '!zeile',
      '!kachel kennzahl titel="Anzahl %%GEHEIM-1%%"',
      'LIST',
      '!kachel text',
      'Hallo %%GEHEIM-2%% `a %%b%%`',
      Z,
    ),
    ohne: doc(
      '# D',
      '',
      Z + 'perspective-dashboard',
      '!zeile',
      '!kachel kennzahl titel="Anzahl "',
      'LIST',
      '!kachel text',
      'Hallo  `a %%b%%`',
      Z,
    ),
    steuer: /!kachel kennzahl/,
  },
  Diagramm: {
    mit: doc(
      '| a | b |',
      '|---|---|',
      '| x | 1 |',
      '^t',
      '',
      Z + 'perspective-chart',
      'table: ^t',
      'title: Umsatz %%GEHEIM-1%%',
      Z,
    ),
    ohne: doc(
      '| a | b |',
      '|---|---|',
      '| x | 1 |',
      '^t',
      '',
      Z + 'perspective-chart',
      'table: ^t',
      'title: Umsatz ',
      Z,
    ),
    steuer: /table: \^t/,
  },
  Zeitleiste: {
    mit: doc('# Z', '', Z + 'perspective-journal-timeline', 'mode: month', '%%GEHEIM-1%%', Z),
    ohne: doc('# Z', '', Z + 'perspective-journal-timeline', 'mode: month', '', Z),
    steuer: /mode: month/,
  },
  'Mermaid-Diagramm': {
    mit: doc(
      Z + 'mermaid',
      "%%{init: {'theme':'dark'}}%%",
      'graph TD',
      '  %% Mermaid-Kommentar',
      '  A[Angebot %%GEHEIM-1%%]-->B %%GEHEIM-2',
      '  C-->D',
      '  ende%%',
      Z,
    ),
    ohne: doc(
      Z + 'mermaid',
      "%%{init: {'theme':'dark'}}%%",
      'graph TD',
      '  %% Mermaid-Kommentar',
      '  A[Angebot ]-->B ',
      '',
      '',
      Z,
    ),
    steuer: /%%\{init/,
  },
  Abfrage: {
    mit: doc('# Q', '', Z + 'perspective-query', 'TABLE datei AS "Titel %%GEHEIM-1%%"', Z),
    ohne: doc('# Q', '', Z + 'perspective-query', 'TABLE datei AS "Titel "', Z),
    steuer: /TABLE datei/,
  },
};

describe('4T-002838: Anzeige und Export je Sonder-Block', () => {
  afterEach(() => configureExtensions([]));

  for (const [name, b] of Object.entries(BLOECKE)) {
    it(`${name}: die Anzeige zeigt keinen Kommentar und gleicht dem bereinigten Dokument`, () => {
      const html = anzeige(b.mit);
      expect(sichtbar(html)).not.toMatch(/GEHEIM/);
      expect(sichtbar(html)).toBe(sichtbar(anzeige(b.ohne)));
    });

    it(`${name}: der Export trägt keinen Kommentar, die Steuer-Anweisung bleibt`, () => {
      const text = exportText(b.mit);
      expect(text).not.toMatch(/GEHEIM/);
      expect(text).toMatch(b.steuer);
    });

    it(`${name}: mit ausgeschalteter Erweiterung «comments» bleibt der Kommentar`, () => {
      configureExtensions(['comments']);
      expect(exportText(b.mit)).toMatch(/GEHEIM/);
    });
  }

  it('Datensatz, Abfrage, Zeitleiste und Dashboard: auch die Attribute sind bereinigt', () => {
    for (const n of ['Datensatz', 'Abfrage', 'Zeitleiste', 'Dashboard']) {
      expect(anzeige(BLOECKE[n].mit)).not.toMatch(/GEHEIM/);
    }
  });

  it('Mermaid-Diagramm: das Bild im Export entsteht aus dem bereinigten Text', () => {
    const quellen = collectMermaidSources(exportText(BLOECKE['Mermaid-Diagramm'].mit));
    expect(quellen).toHaveLength(1);
    expect(quellen[0]).not.toMatch(/GEHEIM/);
    expect(quellen[0]).toContain(
      "%%{init: {'theme':'dark'}}%%\ngraph TD\n  %% Mermaid-Kommentar\n",
    );
  });

  it('Mermaid-Diagramm: der Text für das Bild in der Anzeige ist bereinigt', () => {
    const code = anzeige(BLOECKE['Mermaid-Diagramm'].mit).match(
      /<code class="[^"]*\blanguage-mermaid\b[^"]*">([\s\S]*?)<\/code>/,
    );
    expect(code).not.toBeNull();
    expect(code[1]).not.toMatch(/GEHEIM/);
    expect(code[1]).toMatch(/%% Mermaid-Kommentar/);
  });

  // Auflage der Steuerung vom 2026-11-24: Ein mehrzeiliger privater Kommentar,
  // der am Zeilenanfang beginnt, wird als Mermaid-Kommentarzeile gelesen. Die
  // erste Zeile bleibt stehen, und der schließende Marker öffnet einen neuen
  // Kommentar bis zum Ende des Rumpfs. Ändert sich das, fällt es hier auf.
  it('Mermaid-Diagramm: Grenze, ein mehrzeiliger Kommentar am Zeilenanfang', () => {
    const t = 'graph TD\n%% GEHEIM-A\n  A-->B\n  ende %%\n  C-->D\n';
    expect(stripBlockComments(t, { mermaid: true })).toBe(
      'graph TD\n%% GEHEIM-A\n  A-->B\n  ende \n\n',
    );
  });

  // Frage 3, Option A: Ein Kommentar gilt je Zelle. Ein Marker-Paar über eine
  // Zellgrenze bildet keinen Kommentar, jede Zelle bleibt bestehen, und der
  // unpaarige Marker blendet nur den Rest seiner eigenen Zelle aus. Eine Zelle
  // beginnt in der Perspective Table mit `|` am Zeilenanfang.
  it('Perspective Table: ein Kommentar reicht nie über seine Zelle hinaus', () => {
    const d = doc(Z + 'perspective-table', '{|', '|-', '| a %%x', '| y%% z', '| b', '|}', Z);
    for (const html of [anzeige(d), exportText(d)]) {
      expect(html.match(/<td/g)).toHaveLength(3);
      expect(sichtbar(html)).not.toMatch(/x|z/);
      expect(sichtbar(html)).toMatch(/a\s*y\s*b/);
    }
  });

  it('Perspective Table: ein Code-Block in der Zelle bleibt wörtlich', () => {
    const d = doc(
      Z + 'perspective-table',
      '{|',
      '|-',
      '| ~~~js',
      'x = "%%bleibt%%"',
      '~~~',
      '| b %%GEHEIM-1%%',
      '|}',
      Z,
    );
    for (const html of [anzeige(d), exportText(d)]) {
      expect(html).not.toMatch(/GEHEIM/);
      expect(html).toMatch(/%%bleibt%%/);
    }
  });

  // Zweitblick Runde 1, Befund 1: Ein Kommentar über mehrere Zeilen ohne
  // Eintrag verschwindet als Ganzes; seine Zeilen erscheinen nicht als
  // unlesbare Zeile im Fehler-Hinweis des Blocks.
  it('Ereignis-Block: Kommentar über zwei Zeilen ohne Eintrag erscheint nirgends', () => {
    const rumpf = 'view: table\n%%GEHEIM-1\nGEHEIM-2%%\n| 2020-01-01 | | Start | | | | | | |\n';
    const bereinigt = ereignisRumpf(rumpf);
    expect(bereinigt).toBe('view: table\n\n\n| 2020-01-01 | | Start | | | | | | |\n');
    expect(parsePerspectiveEvents(bereinigt).errors).toEqual([]);
    const d = doc(Z + 'perspective-events', ...rumpf.trimEnd().split('\n'), Z);
    // Der rohe Rumpf reist als Attribut für den Abgleich mit dem Dokument mit
    // (bekannte, geführte Lücke); sichtbar ist der Kommentar nicht.
    expect(sichtbar(anzeige(d))).not.toMatch(/GEHEIM/);
    expect(exportText(d)).not.toMatch(/GEHEIM/);
  });

  it('Ereignis-Block: ein offener Kommentar reicht über folgende Einträge bis zum Schluss', () => {
    const rumpf = [
      'view: table',
      '%%GEHEIM-1',
      '| 2020-01-01 | | GEHEIM-2 | | | | | | |',
      'GEHEIM-3%%',
      '| 2020-02-01 | | Sichtbar | | | | | | |',
      '',
    ].join('\n');
    const bereinigt = ereignisRumpf(rumpf);
    expect(bereinigt).not.toMatch(/GEHEIM/);
    expect(bereinigt.split('\n')).toHaveLength(rumpf.split('\n').length);
    const modell = parsePerspectiveEvents(bereinigt);
    expect(modell.errors).toEqual([]);
    expect(modell.entries.map((e) => e.text)).toEqual(['Sichtbar']);
  });

  // Zweitblick Runde 2: Der offene Zustand wird je Zeile gezählt. Eine Zeile
  // mit zwei Markern schließt und öffnet ihn wieder, eine mit maskiertem
  // Marker lässt ihn unverändert.
  it('Ereignis-Block: Zeilen mit gerader Marker-Zahl lassen den Kommentar offen', () => {
    const rumpf = [
      'view: table',
      '%%GEHEIM-1',
      'GEHEIM-2 %% offen %% GEHEIM-3',
      'GEHEIM-6 \\%% maskiert',
      '| 2020-01-01 | | GEHEIM-4 | | | | | | |',
      'GEHEIM-5%%',
      '| 2020-02-01 | | Sichtbar | | | | | | |',
      '',
    ].join('\n');
    const bereinigt = ereignisRumpf(rumpf);
    expect(bereinigt).not.toMatch(/GEHEIM/);
    expect(bereinigt).toContain(' offen ');
    expect(bereinigt.split('\n')).toHaveLength(rumpf.split('\n').length);
    expect(parsePerspectiveEvents(bereinigt).entries.map((e) => e.text)).toEqual(['Sichtbar']);
  });

  it('Perspective Table: ein maskierter Marker bleibt als %% stehen', () => {
    const d = doc(Z + 'perspective-table', '{|', '|-', '| 50 \\%% Anteil', '|}', Z);
    for (const html of [anzeige(d), exportText(d)]) {
      expect(sichtbar(html)).toMatch(/50 %% Anteil/);
    }
  });
});

// Frage 4 an die Steuerung, Option A (2026-11-24, nach dem Sicherheits-Review):
// Der Workflow-Block ist ausgenommen. Seine Ausführung liest den rohen Text der
// Datei; zeigte die Anzeige einen privaten Kommentar nicht, könnte ein Befehl
// zwischen zwei Markern unsichtbar mitlaufen. Anzeige und Export zeigen ihn
// deshalb wörtlich.
describe('4T-002838: Workflow-Block bleibt wörtlich', () => {
  afterEach(() => configureExtensions([]));
  const d = doc('# W', '', Z + 'workflow', '# %%', 'move "Projekt.md" "Archiv/"', '# %%', Z);

  it('hat keine Block-Regel', () => {
    expect(SONDER_SPRACHEN).not.toContain('workflow');
    expect(sonderRumpfOhneKommentare('workflow', '# %%\nmove a b\n# %%\n', () => true)).toBe(
      '# %%\nmove a b\n# %%\n',
    );
  });

  it('die Anzeige zeigt den Befehl zwischen zwei Markern', () => {
    const html = anzeige(d);
    expect(sichtbar(html)).toMatch(/move/);
    expect(sichtbar(html)).toMatch(/Archiv/);
    expect(html.match(/%%/g)).toHaveLength(2);
  });

  it('der Export trägt den Befehl und beide Marker', () => {
    const text = exportText(d);
    expect(text).toMatch(/move/);
    expect(text.match(/%%/g)).toHaveLength(2);
  });

  it('auch im Zitat bleibt der Workflow-Block im Export wörtlich', () => {
    const z = doc('> ' + Z + 'workflow', '> # %%', '> move a b', '> # %%', '> ' + Z);
    expect(exportText(z)).toContain(z);
  });
});

// Der Export ist Markdown-Text und wandelt nur Blöcke der obersten Ebene in
// HTML. Ein Block in einem Zitat oder Listen-Eintrag bleibt Text und wird
// trotzdem bereinigt, mit dem Zerleger der Anzeige; Vorspann und Zeilenzahl
// bleiben.
describe('4T-002838: Sonder-Blöcke unterhalb der obersten Ebene', () => {
  afterEach(() => configureExtensions([]));
  const ohneKennzeichen = (t) => t.replace('<!-- perspective-portable -->\n\n', '');

  const FAELLE = {
    'Abfrage im Zitat': [
      doc('> ' + Z + 'perspective-query', '> schritt %%GEHEIM-1%%', '> ' + Z),
      doc('> ' + Z + 'perspective-query', '> schritt ', '> ' + Z),
    ],
    'Mermaid-Diagramm im Zitat': [
      doc(
        '> ' + Z + 'mermaid',
        '> graph TD',
        '>   %% Mermaid-Kommentar',
        '>   A-->B %%GEHEIM-1%%',
        '> ' + Z,
      ),
      doc('> ' + Z + 'mermaid', '> graph TD', '>   %% Mermaid-Kommentar', '>   A-->B ', '> ' + Z),
    ],
    'Perspective Table im Zitat, Kommentar über Zeilen der Zelle': [
      doc(
        '> ' + Z + 'perspective-table',
        '> {|',
        '> |-',
        '> | a %%GEHEIM-1',
        '> weiter',
        '> | b',
        '> |}',
        '> ' + Z,
      ),
      doc(
        '> ' + Z + 'perspective-table',
        '> {|',
        '> |-',
        '> | a ',
        '> ',
        '> | b',
        '> |}',
        '> ' + Z,
      ),
    ],
    'Abfrage im Listen-Eintrag': [
      doc('- x', '', '  ' + Z + 'perspective-query', '  schritt %%GEHEIM-1%%', '  ' + Z),
      doc('- x', '', '  ' + Z + 'perspective-query', '  schritt ', '  ' + Z),
    ],
    'Abfrage im Listen-Eintrag mit Tabulator': [
      doc('-\t' + Z + 'perspective-query', '\t\tschritt %%GEHEIM-1%%', '\t' + Z),
      doc('-\t' + Z + 'perspective-query', '\t\tschritt ', '\t' + Z),
    ],
  };

  for (const [name, [mit, ohne]] of Object.entries(FAELLE)) {
    it(`${name}: Export bereinigt, Vorspann und Zeilen bleiben`, () => {
      expect(ohneKennzeichen(exportText(mit))).toBe(ohne);
    });

    it(`${name}: Anzeige ohne Kommentar`, () => {
      expect(anzeige(mit)).not.toMatch(/GEHEIM/);
    });
  }

  it('Zitat mit Wagenrücklauf und Zeilenvorschub: Zeilenenden bleiben', () => {
    const mit = ['> ' + Z + 'perspective-query', '> schritt %%GEHEIM-1%%', '> ' + Z, ''].join(
      '\r\n',
    );
    expect(ohneKennzeichen(exportText(mit))).toBe(
      ['> ' + Z + 'perspective-query', '> schritt ', '> ' + Z, ''].join('\r\n'),
    );
  });

  // Zweitblick Runde 1, Befund 4: Ein Dokument mit einzelnem Wagenrücklauf als
  // Zeilenende; der Zerleger zählt `\r` als Zeilenende wie `\n`.
  it('Zitat mit einzelnem Wagenrücklauf als Zeilenende: Kommentar entfernt, Enden bleiben', () => {
    const mit = ['> ' + Z + 'perspective-chart', '> title: T %%GEHEIM-1%%', '> ' + Z, ''].join(
      '\r',
    );
    expect(ohneKennzeichen(exportText(mit))).toBe(
      ['> ' + Z + 'perspective-chart', '> title: T ', '> ' + Z, ''].join('\r'),
    );
  });

  // Zweitblick Runde 1, Befund 2: Der Export schreibt den Rumpf als Markdown
  // zurück; ein maskierter Marker muss dort maskiert bleiben, sonst liest ein
  // erneutes Zeichnen ihn als Kommentar und blendet den Rest aus.
  it('maskierter Marker im Rumpf mit Block-Regel bleibt im Export maskiert', () => {
    const mit = doc(
      '> ' + Z + 'perspective-chart',
      '> title: 50 \\%% Anteil %%GEHEIM-1%%',
      '> x: a',
      '> ' + Z,
    );
    const aus = exportText(mit);
    expect(aus).not.toMatch(/GEHEIM/);
    expect(ohneKennzeichen(aus)).toBe(
      doc('> ' + Z + 'perspective-chart', '> title: 50 \\%% Anteil ', '> x: a', '> ' + Z),
    );
    // Stabil: Ein zweiter Export ändert nichts mehr, die Zeile «x: a» bleibt.
    expect(ohneKennzeichen(exportText(ohneKennzeichen(aus)))).toBe(ohneKennzeichen(aus));
  });

  it('Block ohne Schluss-Zaun: der Rumpf bis zum Dokument-Ende ist bereinigt', () => {
    const mit = [Z + 'perspective-query', 'a', 'schritt %%GEHEIM-1%%'].join('\n');
    expect(ohneKennzeichen(exportText(mit))).toBe(
      [Z + 'perspective-query', 'a', 'schritt '].join('\n'),
    );
  });

  it('mit ausgeschalteter Erweiterung «comments» bleibt der Block im Zitat unverändert', () => {
    configureExtensions(['comments']);
    const [mit] = FAELLE['Abfrage im Zitat'];
    expect(exportText(mit)).toMatch(/GEHEIM-1/);
  });

  it('Anzeige eines portabel gekennzeichneten Dokuments ist bereinigt', () => {
    const d = doc(
      '<!-- perspective-portable -->',
      '',
      Z + 'perspective-query',
      'schritt %%GEHEIM-1%%',
      Z,
      '',
      Z + 'perspective-chart',
      'title: T %%GEHEIM-2%%',
      Z,
    );
    expect(anzeige(d)).not.toMatch(/GEHEIM/);
  });
});
