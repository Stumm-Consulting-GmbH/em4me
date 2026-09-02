// 4T-000344 (Epic 3E-000062): Unit-Tests fuer den Link-Rewrite-Kern
// (src/shared/link-rewrite.js). Fixture-Matrix ueber alle Link-Formen, die
// Maskierungs-/Frontmatter-Ausschluesse, relative Formen (gueltig bleibend vs.
// brechend), Kaskade, %-Kodierung, EOL-/BOM-Erhalt und Idempotenz.
import { describe, it, expect } from 'vitest';
import { computeLinkRewrites } from '../../src/shared/link-rewrite.js';
import { SUBPAGE_SEP, toLogicalName } from '../../src/shared/subpages.js';

const SEP = SUBPAGE_SEP;

// Baut einen Rename-Eintrag. oldBase/newBase sind logische U+2215-Basenames
// ohne Endung; die absoluten Pfade werden daraus im Ordner `dir` abgeleitet.
function rename(oldBase, newBase, dir = '/root') {
  return { oldBase, newBase, oldAbs: `${dir}/${oldBase}.md`, newAbs: `${dir}/${newBase}.md` };
}

// Kurzform: einen Content gegen eine Rename-Liste umschreiben. contextPath
// default eine nicht mit-umbenannte Quelldatei im selben Ordner.
function rewrite(content, renames, contextPath = '/root/Quelle.md') {
  return computeLinkRewrites(content, { renames, contextPath });
}

const lines = (...ls) => ls.join('\n');

describe('link-rewrite — Wiki-Link-Formen', () => {
  const r = [rename('Alt', 'Neu')];

  it('schreibt einfachen Wiki-Link um', () => {
    const res = rewrite('siehe [[Alt]] hier', r);
    expect(res.changed).toBe(true);
    expect(res.newContent).toBe('siehe [[Neu]] hier');
  });

  it('erhaelt das Pipe-Label', () => {
    expect(rewrite('[[Alt|Mein Label]]', r).newContent).toBe('[[Neu|Mein Label]]');
  });

  it('erhaelt Heading- und Block-Anker', () => {
    expect(rewrite('[[Alt#abschnitt]]', r).newContent).toBe('[[Neu#abschnitt]]');
    expect(rewrite('[[Alt#^block1]]', r).newContent).toBe('[[Neu#^block1]]');
  });

  it('erhaelt Anker und Label zusammen', () => {
    expect(rewrite('[[Alt#abschnitt|Label]]', r).newContent).toBe('[[Neu#abschnitt|Label]]');
  });

  it('behandelt Embeds wie Wiki-Links und markiert den Typ', () => {
    const res = rewrite('![[Alt]]', r);
    expect(res.newContent).toBe('![[Neu]]');
    expect(res.hits[0].typ).toBe('wiki-embed');
  });

  it('erhaelt die escapte Pipe in Tabellen-Zellen', () => {
    expect(rewrite('| [[Alt\\|Label]] |', r).newContent).toBe('| [[Neu\\|Label]] |');
  });

  it('vergleicht case-insensitiv und schreibt in der neuen Schreibweise', () => {
    expect(rewrite('[[alt]]', r).newContent).toBe('[[Neu]]');
    expect(rewrite('[[ALT]]', r).newContent).toBe('[[Neu]]');
  });

  it('trifft mehrere Vorkommen pro Zeile', () => {
    expect(rewrite('[[Alt]] und [[Alt]]', r).newContent).toBe('[[Neu]] und [[Neu]]');
  });

  it('erhaelt umgebenden Whitespace im Ziel', () => {
    expect(rewrite('[[ Alt ]]', r).newContent).toBe('[[ Neu ]]');
  });
});

describe('link-rewrite — Slash-Unterseiten', () => {
  it('schreibt die Slash-Schreibweise einer umbenannten Unterseite um', () => {
    const r = [rename(`Eltern${SEP}Kind`, `Eltern${SEP}NeuKind`)];
    expect(rewrite('[[Eltern/Kind]]', r).newContent).toBe('[[Eltern/NeuKind]]');
  });

  it('schreibt den Eltern-Namen einer Kaskade in Slash-Zielen mit um', () => {
    const r = [rename('Eltern', 'NeuEltern'), rename(`Eltern${SEP}Kind`, `NeuEltern${SEP}Kind`)];
    expect(rewrite('[[Eltern]] / [[Eltern/Kind]]', r).newContent).toBe(
      '[[NeuEltern]] / [[NeuEltern/Kind]]',
    );
  });
});

describe('link-rewrite — relative Markdown-Links', () => {
  const r = [rename('Alt', 'Neu')];

  it('schreibt ein einfaches relatives Ziel um', () => {
    expect(rewrite('[Text](Alt.md)', r).newContent).toBe('[Text](Neu.md)');
  });

  it('erhaelt das fuehrende ./', () => {
    expect(rewrite('[Text](./Alt.md)', r).newContent).toBe('[Text](./Neu.md)');
  });

  it('erhaelt den Anker', () => {
    expect(rewrite('[Text](Alt.md#abschnitt)', r).newContent).toBe('[Text](Neu.md#abschnitt)');
  });

  it('ersetzt nur den Basename in einem Unterordner-Ziel', () => {
    const rr = [rename('Alt', 'Neu', '/root/sub')];
    expect(rewrite('[Text](sub/Alt.md)', rr).newContent).toBe('[Text](sub/Neu.md)');
  });

  it('loest ../ gegen das Quell-Verzeichnis auf', () => {
    const rr = [rename('Alt', 'Neu', '/root')];
    const res = computeLinkRewrites('[Text](../Alt.md)', {
      renames: rr,
      contextPath: '/root/sub/Quelle.md',
    });
    expect(res.newContent).toBe('[Text](../Neu.md)');
  });

  it('erhaelt die %-Kodierung', () => {
    const rr = [rename('Mein Alt', 'Mein Neu')];
    expect(rewrite('[Text](Mein%20Alt.md)', rr).newContent).toBe('[Text](Mein%20Neu.md)');
  });

  it('stellt ein klammerloses Ziel bei neuem Namen mit Leerzeichen auf die <…>-Form um', () => {
    // 4T-000476 (Epic 3E-000088): ein unkodiertes Leerzeichen waere kein gueltiges
    // CommonMark-Ziel; die Destination wandert daher in spitze Klammern.
    const rr = [rename('Alt', 'Neu Datei')];
    expect(rewrite('[Text](Alt.md)', rr).newContent).toBe('[Text](<Neu Datei.md>)');
  });
});

// 4T-000476 (Epic 3E-000088): CommonMark-Destination in spitzen Klammern
// ([Text](<Mein Ziel.md>)). <…>-Ziele erlauben Leerzeichen nativ und werden roh
// ersetzt (Klammern und Anker bleiben stehen); ein klammerloses Ziel, dem die
// Umbenennung ein Leerzeichen einbringt, wird auf die <…>-Form umgestellt.
describe('link-rewrite — <…>-Destination (4T-000476)', () => {
  it('ersetzt ein Blank-Ziel in <…>-Form roh und behaelt die Klammern', () => {
    const rr = [rename('Meine Alte', 'Neue Datei')];
    expect(rewrite('[Text](<Meine Alte.md>)', rr).newContent).toBe('[Text](<Neue Datei.md>)');
  });

  it('erhaelt den Anker in der <…>-Form', () => {
    const rr = [rename('Alt', 'Neu')];
    expect(rewrite('[Text](<Alt.md#kap>)', rr).newContent).toBe('[Text](<Neu.md#kap>)');
  });

  it('stellt ein klammerloses Ziel mit Anker um und zieht den Anker in die Klammern', () => {
    const rr = [rename('Alt', 'Neu Datei')];
    expect(rewrite('[Text](Alt.md#kap)', rr).newContent).toBe('[Text](<Neu Datei.md#kap>)');
  });

  it('behaelt das Verzeichnis-Praefix in der umgestellten Destination', () => {
    const rr = [rename('Alt', 'Neu Datei', '/root/sub')];
    expect(rewrite('[Text](sub/Alt.md)', rr).newContent).toBe('[Text](<sub/Neu Datei.md>)');
  });
});

describe('link-rewrite — nicht angetastete Stellen', () => {
  const r = [rename('Alt', 'Neu')];

  it('laesst Links in Fenced-Code-Bloecken unveraendert', () => {
    const input = lines('```', '[[Alt]]', '[Text](Alt.md)', '```');
    const res = rewrite(input, r);
    expect(res.changed).toBe(false);
    expect(res.newContent).toBe(input);
  });

  it('laesst Links in Inline-Code unveraendert', () => {
    const input = 'Beispiel `[[Alt]]` im Text';
    expect(rewrite(input, r).changed).toBe(false);
  });

  it('laesst Frontmatter-Inhalte unveraendert, schreibt aber den Body um', () => {
    const input = lines('---', 'aliases: Alt', 'title: Alt', '---', '[[Alt]]');
    const res = rewrite(input, r);
    expect(res.newContent).toBe(lines('---', 'aliases: Alt', 'title: Alt', '---', '[[Neu]]'));
  });

  it('ignoriert Teil-String-Kollisionen', () => {
    expect(rewrite('[[Alt-2]] [[AltBeta]]', r).changed).toBe(false);
  });

  it('laesst reine Anker und externe Ziele in Ruhe', () => {
    expect(rewrite('[[#abschnitt]]', r).changed).toBe(false);
    expect(rewrite('[Text](https://example.org/Alt.md)', r).changed).toBe(false);
  });

  it('ignoriert nicht umbenannte Ziele', () => {
    expect(rewrite('[[Bestand]] [Text](Bestand.md)', r).changed).toBe(false);
  });
});

describe('link-rewrite — relative Unterseiten-Formen', () => {
  it('laesst [[..]] eines mit-umbenannten Nachfahren unveraendert', () => {
    // Eltern -> NeuEltern (Kaskade); die Unterseite Eltern/Kind wird zu
    // NeuEltern/Kind und ist selbst die Kontext-Datei. [[..]] zeigt weiter auf
    // die (mit-umbenannte) Elternseite und bleibt gueltig.
    const r = [rename('Eltern', 'NeuEltern'), rename(`Eltern${SEP}Kind`, `NeuEltern${SEP}Kind`)];
    const res = computeLinkRewrites('siehe [[..]]', {
      renames: r,
      contextPath: `/root/NeuEltern${SEP}Kind.md`,
    });
    expect(res.changed).toBe(false);
  });

  it('schreibt eine brechende relative Form auf die absolute Slash-Form um', () => {
    // Nur die Unterseite X/Kind wird zu X/NeuKind umbenannt; X selbst bleibt.
    // [[/Kind]] in X zeigt danach ins Leere und wird absolut aufgeloest.
    const r = [rename(`X${SEP}Kind`, `X${SEP}NeuKind`)];
    const res = computeLinkRewrites('[[/Kind]]', { renames: r, contextPath: '/root/X.md' });
    expect(res.changed).toBe(true);
    expect(res.newContent).toBe(`[[${toLogicalName(`X${SEP}NeuKind`)}]]`);
    expect(res.newContent).toBe('[[X/NeuKind]]');
  });

  it('laesst eine relative Form auf ein nicht umbenanntes Ziel unveraendert', () => {
    const r = [rename('Anderes', 'NeuAnderes')];
    const res = computeLinkRewrites('[[/Kind]]', { renames: r, contextPath: '/root/X.md' });
    expect(res.changed).toBe(false);
  });
});

describe('link-rewrite — Kaskade, Idempotenz, EOL/BOM', () => {
  it('wendet mehrere Rename-Paare in einem Lauf an', () => {
    const r = [rename('Alt', 'Neu'), rename('Beta', 'Gamma')];
    expect(rewrite('[[Alt]] und [Text](Beta.md)', r).newContent).toBe(
      '[[Neu]] und [Text](Gamma.md)',
    );
  });

  it('ist idempotent (zweiter Lauf aendert nichts)', () => {
    const r = [rename('Alt', 'Neu')];
    const input = lines('[[Alt]]', '[Text](Alt.md)', '[[Alt|L]]');
    const first = rewrite(input, r);
    expect(first.changed).toBe(true);
    const second = rewrite(first.newContent, r);
    expect(second.changed).toBe(false);
    expect(second.newContent).toBe(first.newContent);
  });

  it('erhaelt CRLF-Zeilenenden', () => {
    const r = [rename('Alt', 'Neu')];
    const input = '[[Alt]]\r\nzweite Zeile\r\n[[Alt]]';
    const res = rewrite(input, r);
    expect(res.newContent).toBe('[[Neu]]\r\nzweite Zeile\r\n[[Neu]]');
  });

  it('erhaelt ein fuehrendes BOM', () => {
    const r = [rename('Alt', 'Neu')];
    const BOM = String.fromCharCode(0xfeff);
    const res = rewrite(BOM + '[[Alt]]', r);
    expect(res.newContent).toBe(BOM + '[[Neu]]');
    expect(res.newContent.charCodeAt(0)).toBe(0xfeff);
  });
});

// 4T-000847 (Epic 3E-000147): Ein Rename-Paar darf zugleich das Verzeichnis
// wechseln — das physische Verschieben einer Kapitel-Datei innerhalb ihres
// Buch-Ordners. Ein relatives Markdown-Ziel wird dann als ganzer Pfad neu
// geschrieben (neue relative Lage von der verweisenden Datei aus), weil das
// Ersetzen des Basenames allein den Verzeichnis-Anteil stehen ließe und der
// Link danach ins Leere zeigte.
describe('link-rewrite — Verzeichnis-Wechsel des Ziels (4T-000847)', () => {
  // Verschiebe-Eintrag: derselbe Basename, anderes Verzeichnis.
  function move(base, vonOrdner, nachOrdner) {
    return {
      oldBase: base,
      newBase: base,
      oldAbs: `${vonOrdner}/${base}.md`,
      newAbs: `${nachOrdner}/${base}.md`,
    };
  }

  it('führt ein Ziel nach, das in einen Unterordner wandert', () => {
    const r = [move('Kapitel', '/root', '/root/Teil1')];
    expect(rewrite('[Text](Kapitel.md)', r).newContent).toBe('[Text](Teil1/Kapitel.md)');
  });

  it('führt ein Ziel nach, das aus einem Unterordner herauswandert', () => {
    const r = [move('Kapitel', '/root/Teil1', '/root')];
    expect(rewrite('[Text](Teil1/Kapitel.md)', r).newContent).toBe('[Text](Kapitel.md)');
  });

  it('führt ein Ziel nach, das zwischen zwei Unterordnern wandert', () => {
    const r = [move('Kapitel', '/root/Teil1', '/root/Teil2')];
    expect(rewrite('[Text](Teil1/Kapitel.md)', r).newContent).toBe('[Text](Teil2/Kapitel.md)');
  });

  it('rechnet den neuen Pfad von der verweisenden Datei aus, nicht von der Wurzel', () => {
    // Die dritte Datei liegt selbst in Teil1 und verweist ohne Ordner-Anteil;
    // nach der Bewegung braucht sie den Weg über die Ebene darüber.
    const r = [move('Kapitel', '/root/Teil1', '/root/Teil2')];
    const res = computeLinkRewrites('[Text](Kapitel.md)', {
      renames: r,
      contextPath: '/root/Teil1/Quelle.md',
    });
    expect(res.newContent).toBe('[Text](../Teil2/Kapitel.md)');
  });

  it('führt auch eine bestehende ../-Form auf die neue Lage nach', () => {
    const r = [move('Kapitel', '/root', '/root/Teil2')];
    const res = computeLinkRewrites('[Text](../Kapitel.md)', {
      renames: r,
      contextPath: '/root/Teil1/Quelle.md',
    });
    expect(res.newContent).toBe('[Text](../Teil2/Kapitel.md)');
  });

  it('erhält den Anker über den Verzeichnis-Wechsel', () => {
    const r = [move('Kapitel', '/root/Teil1', '/root/Teil2')];
    expect(rewrite('[Text](Teil1/Kapitel.md#kap)', r).newContent).toBe(
      '[Text](Teil2/Kapitel.md#kap)',
    );
  });

  it('erhält die %-Kodierung des Ziels', () => {
    const r = [move('Mein Kapitel', '/root', '/root/Teil1')];
    expect(rewrite('[Text](Mein%20Kapitel.md)', r).newContent).toBe(
      '[Text](Teil1/Mein%20Kapitel.md)',
    );
  });

  it('stellt auf die <…>-Form um, wenn der neue Ordner ein Leerzeichen einbringt', () => {
    const r = [move('Kapitel', '/root', '/root/Teil 1')];
    expect(rewrite('[Text](Kapitel.md)', r).newContent).toBe('[Text](<Teil 1/Kapitel.md>)');
    // Der Anker wandert dabei mit in die Klammern (Regel 4T-000476).
    expect(rewrite('[Text](Kapitel.md#kap)', r).newContent).toBe('[Text](<Teil 1/Kapitel.md#kap>)');
  });

  it('ersetzt ein <…>-Ziel roh und behält die Klammern', () => {
    const r = [move('Mein Kapitel', '/root', '/root/Teil 1')];
    expect(rewrite('[Text](<Mein Kapitel.md>)', r).newContent).toBe(
      '[Text](<Teil 1/Mein Kapitel.md>)',
    );
  });

  it('trägt Umbenennen und Verschieben in einem Schritt', () => {
    const r = [
      { oldBase: 'Alt', newBase: 'Neu', oldAbs: '/root/Alt.md', newAbs: '/root/T1/Neu.md' },
    ];
    expect(rewrite('[Text](Alt.md)', r).newContent).toBe('[Text](T1/Neu.md)');
  });

  it('lässt Wiki-Links vom Verschieben unberührt (sie lösen über den Namen auf)', () => {
    const r = [move('Kapitel', '/root', '/root/Teil1')];
    // Der Wiki-Zweig trifft den unveränderten Basename und setzt ihn erneut:
    // der Text bleibt Zeichen für Zeichen derselbe. Genau deshalb hält der
    // Main-Prozess Dateien ohne echte Text-Änderung vom Schreiben fern.
    expect(rewrite('[[Kapitel]]', r).newContent).toBe('[[Kapitel]]');
  });

  it('lässt ein wurzel-verankertes Ziel in seiner Form', () => {
    // '/…' ist keine relative Angabe; aus ihr eine relative zu machen wäre
    // eine Umdeutung. Der Basename bleibt gleich, der Text also unverändert.
    const r = [move('Kapitel', '/root', '/root/Teil1')];
    expect(rewrite('[Text](/root/Kapitel.md)', r).newContent).toBe('[Text](/root/Kapitel.md)');
  });

  it('reines Umbenennen bleibt unverändert: nur der Basename wird ersetzt', () => {
    // Nachweis, dass der Bestands-Weg unangetastet ist — dieselben Fälle wie
    // in der Markdown-Gruppe oben, hier gegen die neue Weiche gehalten.
    expect(rewrite('[Text](Alt.md)', [rename('Alt', 'Neu')]).newContent).toBe('[Text](Neu.md)');
    expect(rewrite('[Text](./Alt.md)', [rename('Alt', 'Neu')]).newContent).toBe('[Text](./Neu.md)');
    expect(rewrite('[Text](sub/Alt.md)', [rename('Alt', 'Neu', '/root/sub')]).newContent).toBe(
      '[Text](sub/Neu.md)',
    );
    const res = computeLinkRewrites('[Text](../Alt.md)', {
      renames: [rename('Alt', 'Neu', '/root')],
      contextPath: '/root/sub/Quelle.md',
    });
    expect(res.newContent).toBe('[Text](../Neu.md)');
    expect(rewrite('[Text](Alt.md)', [rename('Alt', 'Neu Datei')]).newContent).toBe(
      '[Text](<Neu Datei.md>)',
    );
  });
});

describe('link-rewrite — hits und Randfaelle', () => {
  it('liefert pro Ersetzung zeile/alt/neu/typ', () => {
    const r = [rename('Alt', 'Neu')];
    const res = rewrite(lines('Zeile eins', 'link [[Alt|L]] hier'), r);
    expect(res.hits).toEqual([{ zeile: 2, alt: '[[Alt|L]]', neu: '[[Neu|L]]', typ: 'wiki' }]);
  });

  it('gibt bei leerer Rename-Liste oder leerem Content nichts zurueck', () => {
    expect(rewrite('[[Alt]]', []).changed).toBe(false);
    expect(computeLinkRewrites('', { renames: [rename('Alt', 'Neu')] }).changed).toBe(false);
  });
});
