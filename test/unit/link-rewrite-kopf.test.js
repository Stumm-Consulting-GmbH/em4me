// 4T-002503 (Epic 3E-000403): Unit-Tests des Kopf-Block-Anteils im Umschreibe-Kern
// (src/shared/link-rewrite-kopf.js), gefahren über die öffentliche Schnittstelle
// computeLinkRewrites wie in link-rewrite.test.js. Die Blöcke standen bis zum
// Budget-Schnitt dort; Schnitt nach Fachlichkeit wie beim Modul selbst.
import { describe, it, expect } from 'vitest';
import { computeLinkRewrites } from '../../src/shared/link-rewrite.js';
// Der Index-Parser als Gegenprobe der einen Kopf-Block-Regel.
import { parseContent } from '../../src/main/index/parse.js';
// YAML-Gültigkeit nach dem Nachzug (Befund B2).
import yaml from 'js-yaml';

// Baut einen Rename-Eintrag (wie in link-rewrite.test.js).
function rename(oldBase, newBase, dir = '/root') {
  return { oldBase, newBase, oldAbs: `${dir}/${oldBase}.md`, newAbs: `${dir}/${newBase}.md` };
}

// Kurzform: einen Content gegen eine Rename-Liste umschreiben.
function rewrite(content, renames, contextPath = '/root/Quelle.md') {
  return computeLinkRewrites(content, { renames, contextPath });
}

const lines = (...ls) => ls.join('\n');

// 4T-002503 (Epic 3E-000403): Wiki-Verweise im Kopf-Block ziehen nach — in
// Zeichenketten-Werten der obersten Ebene und in Zeichenketten-Einträgen von
// Listen der obersten Ebene, mit derselben Regel wie die Erfassung im Index
// (kopfVerweisFunde aus link-scan.js). Der bestehende Fall «laesst
// Frontmatter-Inhalte unveraendert» in link-rewrite.test.js bleibt gültig: Werte ohne Wiki-Klammern
// sind kein Verweis.
describe('link-rewrite — Verweise im Kopf-Block (4T-002503)', () => {
  const r = [rename('Alt', 'Neu')];

  it('Einzel-Wert, Liste, Anzeige-Text und Anker ziehen nach; hits nennen die Kopf-Zeile', () => {
    const vorher = lines(
      '---',
      'projekt: "[[Alt]]"',
      'bezug:',
      '  - "[[Alt|Anzeige]]"',
      "  - '[[Alt#^block]]'",
      '---',
      '[[Alt]]',
    );
    const res = rewrite(vorher, r);
    expect(res.newContent).toBe(
      lines(
        '---',
        'projekt: "[[Neu]]"',
        'bezug:',
        '  - "[[Neu|Anzeige]]"',
        "  - '[[Neu#^block]]'",
        '---',
        '[[Neu]]',
      ),
    );
    expect(res.hits.map((h) => h.zeile)).toEqual([2, 4, 5, 7]);
    expect(res.hits[0]).toEqual({ zeile: 2, alt: '[[Alt]]', neu: '[[Neu]]', typ: 'wiki' });
  });

  it('Kommentare, Schlüssel, Werte ohne Verweis und verschachtelte Strukturen bleiben stehen', () => {
    const vorher = lines(
      '---',
      '# Kommentar mit [[Alt]]',
      'titel: Alt',
      'projekt: "[[Alt]]" # auch hier [[Alt]]',
      'gruppe:',
      '  kind: "[[Alt]]"',
      'liste:',
      '  - ["[[Alt]]"]',
      '  - name: "[[Alt]]"',
      '---',
      'Text.',
    );
    expect(rewrite(vorher, r).newContent).toBe(
      vorher.replace('projekt: "[[Alt]]"', 'projekt: "[[Neu]]"'),
    );
  });

  it('ungültiger Kopf-Block: nicht umgeschrieben, Körper zieht nach, kein Abbruch', () => {
    const vorher = lines('---', 'projekt: "[[Alt]]', 'x: : :', '---', '[[Alt]]');
    let res;
    expect(() => {
      res = rewrite(vorher, r);
    }).not.toThrow();
    expect(res.newContent).toBe(lines('---', 'projekt: "[[Alt]]', 'x: : :', '---', '[[Neu]]'));
  });

  it('Verweis hinter einer YAML-Escape-Folge bleibt stehen (nicht byte-genau ersetzbar)', () => {
    // "\x74" ist in YAML ein 't': Der Wert lautet [[Alt]], die Zeile nicht.
    const vorher = lines('---', String.raw`projekt: "[[Al\x74]]"`, '---', '');
    expect(rewrite(vorher, r).changed).toBe(false);
  });

  it('Puffer eines offenen Dokuments (LF) und Datei (CRLF, BOM) ergeben denselben Nachzug', () => {
    // Der Renderer zieht ungespeicherte Puffer mit demselben Kern nach
    // (views/link-update.js, handleLinkUpdateApplied). Beide Wege müssen den
    // Kopf-Block gleich behandeln, sonst überschriebe das nächste Speichern den
    // nachgezogenen Datei-Stand.
    const puffer = lines('---', 'projekt: "[[Alt]]"', '---', 'Text [[Alt]].', '');
    const datei = '\uFEFF' + puffer.split('\n').join('\r\n');
    const ausPuffer = rewrite(puffer, r);
    const ausDatei = rewrite(datei, r);
    expect(ausPuffer.newContent).toBe(
      lines('---', 'projekt: "[[Neu]]"', '---', 'Text [[Neu]].', ''),
    );
    expect(ausDatei.newContent).toBe('\uFEFF' + ausPuffer.newContent.split('\n').join('\r\n'));
    expect(ausDatei.hits).toEqual(ausPuffer.hits);
  });

  it('der Nachzug trifft genau die Kopf-Block-Verweise, die der Index erfasst', () => {
    const text = lines(
      '---',
      'a: "[[Alt]]"',
      'b:',
      '  - "[[Alt|X]]"',
      '  - 3',
      '  - ["[[Alt]]"]',
      'c: { d: "[[Alt]]" }',
      '# [[Alt]]',
      '---',
      '',
    );
    const index = parseContent('/root/Quelle.md', text)
      .hits.filter((h) => h.zielBasename === 'Alt')
      .map((h) => h.zeile);
    expect(index).toEqual([2, 4]);
    expect(rewrite(text, r).hits.map((h) => h.zeile)).toEqual(index);
  });
});

// 4T-002503 (Befunde B1 und B2 des Reviews): Der Nachzug trifft die Zeile des
// Werts, nie einen Kommentar oder verschachtelten Eintrag davor, und setzt den
// neuen Namen in der Schreibweise des umgebenden YAML-Skalars ein.
describe('link-rewrite — Kopf-Block: Wert-Zeile und YAML-Maskierung (4T-002503)', () => {
  const r = [rename('Alt', 'Neu')];
  const kopf = (text) => text.split('\n').slice(1, text.split('\n').indexOf('---', 1)).join('\n');
  const yamlDaten = (text) => yaml.load(kopf(text), { schema: yaml.JSON_SCHEMA });

  it('B1: Kommentar hinter dem Schlüssel bleibt, der Listen-Eintrag zieht nach', () => {
    const vorher = lines('---', 'bezug: # vorher [[Alt]]', '  - "[[Alt]]"', '---', '');
    expect(rewrite(vorher, r).newContent).toBe(
      lines('---', 'bezug: # vorher [[Alt]]', '  - "[[Neu]]"', '---', ''),
    );
  });

  it('B1: auskommentierter Eintrag bleibt, der echte zieht nach', () => {
    const vorher = lines('---', 'personen:', '  # - "[[Anna]]"', '  - "[[Anna]]"', '---', '');
    expect(rewrite(vorher, [rename('Anna', 'Anne')]).newContent).toBe(
      lines('---', 'personen:', '  # - "[[Anna]]"', '  - "[[Anne]]"', '---', ''),
    );
  });

  it('B1: gemischte Liste — der verschachtelte Eintrag bleibt, der Zeichenketten-Eintrag zieht nach', () => {
    const vorher = lines('---', 'liste:', '  - ziel: "[[Alt]]"', '  - "[[Alt]]"', '---', '');
    expect(rewrite(vorher, r).newContent).toBe(
      lines('---', 'liste:', '  - ziel: "[[Alt]]"', '  - "[[Neu]]"', '---', ''),
    );
  });

  it("B2: Name mit ' in einfachen Anführungszeichen ergibt gültiges YAML mit dem Ziel", () => {
    const vorher = lines('---', "projekt: '[[Alt]]'", 'liste:', "  - '[[Alt|A]]'", '---', '');
    const res = rewrite(vorher, [rename('Alt', "O'Neill")]);
    expect(res.newContent).toBe(
      lines('---', "projekt: '[[O''Neill]]'", 'liste:', "  - '[[O''Neill|A]]'", '---', ''),
    );
    expect(yamlDaten(res.newContent)).toEqual({
      projekt: "[[O'Neill]]",
      liste: ["[[O'Neill|A]]"],
    });
  });

  it('B2: Name mit Anführungszeichen und Rückstrich in doppelten Anführungszeichen ergibt gültiges YAML', () => {
    const vorher = lines('---', 'projekt: "[[Alt]]"', 'flow: ["[[Alt#K]]"]', '---', '');
    const neu = String.raw`Der "Plan" a\b`;
    expect(neu).toContain('\\');
    const res = rewrite(vorher, [rename('Alt', neu)]);
    expect(yamlDaten(res.newContent)).toEqual({
      projekt: `[[${neu}]]`,
      flow: [`[[${neu}#K]]`],
    });
  });

  it('B2: Wert ohne Anführungszeichen bekommt den Namen unverändert; der Körper ebenso', () => {
    const vorher = lines('---', 'projekt: siehe [[Alt]]', '---', '[[Alt]]');
    expect(rewrite(vorher, [rename('Alt', "O'Neill")]).newContent).toBe(
      lines('---', "projekt: siehe [[O'Neill]]", '---', "[[O'Neill]]"),
    );
  });
});

// 4T-002503 (Befunde C1, C2 und C3 des Reviews): Rückfall für Formen, die die
// Struktur-Regel nicht trifft; Anführungszeichen nur am Wert-Anfang; Einfassen
// eines Werts ohne Anführungszeichen, wenn der neue Name es verlangt.
describe('link-rewrite — Kopf-Block: Rückfall, Wert-Anfang und Einfassen (4T-002503)', () => {
  const r = [rename('Alt', 'Neu')];
  const kopf = (text) => text.split('\n').slice(1, text.split('\n').indexOf('---', 1)).join('\n');
  const yamlDaten = (text) => yaml.load(kopf(text), { schema: yaml.JSON_SCHEMA });

  it('C1 a: Flow-Liste über mehrere Zeilen zieht nach, der Kommentar dahinter bleibt', () => {
    const vorher = lines(
      '---',
      'bezug: [',
      '  "[[Alt]]", # Kommentar [[Alt]]',
      "  '[[Alt|A]]'",
      ']',
      '---',
      '',
    );
    const res = rewrite(vorher, r);
    expect(res.newContent).toBe(
      lines('---', 'bezug: [', '  "[[Neu]]", # Kommentar [[Alt]]', "  '[[Neu|A]]'", ']', '---', ''),
    );
    expect(yamlDaten(res.newContent)).toEqual({ bezug: ['[[Neu]]', '[[Neu|A]]'] });
  });

  it('C1 a: Flow-Liste mit `[` erst auf der Folgezeile zieht nach', () => {
    const vorher = lines('---', 'bezug:', '  ["[[Alt]]",', '   "[[Alt#K]]"]', '---', '');
    expect(rewrite(vorher, r).newContent).toBe(
      lines('---', 'bezug:', '  ["[[Neu]]",', '   "[[Neu#K]]"]', '---', ''),
    );
  });

  it('C1 b: Block-Skalar als Listen-Eintrag zieht nach, der verschachtelte Eintrag davor bleibt', () => {
    const vorher = lines(
      '---',
      'notizen:',
      '  - ziel: "[[Alt]]"',
      '  - |',
      "    Peter's [[Alt]]: dazu",
      '---',
      '',
    );
    const res = rewrite(vorher, [rename('Alt', 'a: b')]);
    // Im Block-Skalar ist alles Text: weder Maskierung noch Einfassen.
    expect(res.newContent).toBe(
      lines(
        '---',
        'notizen:',
        '  - ziel: "[[Alt]]"',
        '  - |',
        "    Peter's [[a: b]]: dazu",
        '---',
        '',
      ),
    );
    expect(yamlDaten(res.newContent).notizen[1]).toBe("Peter's [[a: b]]: dazu\n");
  });

  it("C2: `'` mitten im Wert ist Text — umbenannt nach O'Neill ohne Maskierung, gültiges YAML", () => {
    const vorher = lines(
      '---',
      "projekt: Peter's [[Alt]]",
      'liste:',
      "  - Peter's [[Alt]]",
      '---',
      '',
    );
    const res = rewrite(vorher, [rename('Alt', "O'Neill")]);
    expect(res.newContent).toBe(
      lines('---', "projekt: Peter's [[O'Neill]]", 'liste:', "  - Peter's [[O'Neill]]", '---', ''),
    );
    expect(yamlDaten(res.newContent)).toEqual({
      projekt: "Peter's [[O'Neill]]",
      liste: ["Peter's [[O'Neill]]"],
    });
  });

  it('C3: neuer Name mit `: ` fasst den Wert ohne Anführungszeichen in doppelte ein', () => {
    const vorher = lines(
      '---',
      'projekt: siehe [[Alt]] und "x" # Kommentar',
      'liste:',
      '  - siehe [[Alt]]',
      'flow: [a, "[[Alt]]"]',
      '---',
      '',
    );
    const res = rewrite(vorher, [rename('Alt', 'a: b')]);
    expect(res.newContent).toBe(
      lines(
        '---',
        'projekt: "siehe [[a: b]] und \\"x\\"" # Kommentar',
        'liste:',
        '  - "siehe [[a: b]]"',
        'flow: [a, "[[a: b]]"]',
        '---',
        '',
      ),
    );
    expect(yamlDaten(res.newContent).projekt).toBe('siehe [[a: b]] und "x"');
    expect(yamlDaten(res.newContent).liste).toEqual(['siehe [[a: b]]']);
  });

  it('C3: ohne `: ` oder ` #` im neuen Namen bleibt der Wert ohne Anführungszeichen', () => {
    const vorher = lines('---', 'projekt: siehe [[Alt]]', '---', '');
    expect(rewrite(vorher, [rename('Alt', 'a:b#c')]).newContent).toBe(
      lines('---', 'projekt: siehe [[a:b#c]]', '---', ''),
    );
    // Gegenprobe: ` #` würde den Rest als Kommentar abschneiden, also einfassen.
    const mitKommentarZeichen = rewrite(vorher, [rename('Alt', 'a #b')]).newContent;
    expect(mitKommentarZeichen).toBe(lines('---', 'projekt: "siehe [[a #b]]"', '---', ''));
    expect(yamlDaten(mitKommentarZeichen).projekt).toBe('siehe [[a #b]]');
  });

  it('C3: mehrzeiliger Wert ohne Anführungszeichen wird nicht beschädigt, der Verweis bleibt', () => {
    const vorher = lines('---', 'projekt: siehe [[Alt]]', '  und weiter', '---', '');
    const res = rewrite(vorher, [rename('Alt', 'a: b')]);
    expect(res.newContent).toBe(vorher);
    expect(() => yamlDaten(res.newContent)).not.toThrow();
  });

  // 4T-002503 (Befund D1 des Reviews): Der Rückfall lässt verschachtelte Einträge
  // samt ihren Folgezeilen aus; umgeschrieben wird allein der echte Eintrag.
  it('D1: Block-Skalar im verschachtelten Eintrag bleibt, der echte `- |` zieht nach', () => {
    const vorher = lines(
      '---',
      'notizen:',
      '  - meta: |',
      '      [[X]]',
      '  - |',
      '    [[X]]',
      '---',
      '',
    );
    const res = rewrite(vorher, [rename('X', 'Z')]);
    expect(res.newContent).toBe(
      lines('---', 'notizen:', '  - meta: |', '      [[X]]', '  - |', '    [[Z]]', '---', ''),
    );
    expect(yamlDaten(res.newContent)).toEqual({ notizen: [{ meta: '[[X]]\n' }, '[[Z]]\n'] });
  });

  it('D1: verschachtelte Flow-Liste `- ["[[X]]"]` bleibt, der Eintrag danach zieht nach', () => {
    const vorher = lines('---', 'liste:', '  - ["[[X]]"]', '  - "[[X]]"', '---', '');
    const res = rewrite(vorher, [rename('X', 'Z')]);
    expect(res.newContent).toBe(lines('---', 'liste:', '  - ["[[X]]"]', '  - "[[Z]]"', '---', ''));
  });

  it('D1: mehrzeilige verschachtelte Flow-Liste bleibt, der `- |` dahinter zieht nach', () => {
    const vorher = lines(
      '---',
      'liste:',
      '  - ["[[X]]",',
      '     "[[X]]"]',
      '  - |',
      '    [[X]]',
      '---',
      '',
    );
    const res = rewrite(vorher, [rename('X', 'Z')]);
    expect(res.newContent).toBe(vorher.replace('    [[X]]', '    [[Z]]'));
    expect(yamlDaten(res.newContent).liste).toEqual([['[[X]]', '[[X]]'], '[[Z]]\n']);
  });
});
