// @vitest-environment jsdom
// 4T-002351 (Epic 3E-000184): Die Prüfung vor dem Laufen auf der Seite des
// Fensters und die Texte ihrer Befunde
// (src/renderer/modules/workflows/workflow-pruefung.js).
//
// Zwei Aufgaben: Die Prüfung liefert denselben Befund wie der Kern (AK2), und
// jeder Befund-Code, den der Kern erzeugt, hat einen Text (AK6). Der zweite
// Teil ist ein Durchlauf-Wächter (Entwicklungsrichtlinien, Kapitel 1, «Register
// mit Spiegel-Ort»): Die Codes stehen als Literale in fünf Modulen und sind
// statisch nicht zuverlässig lesbar; deshalb erzeugt ein Korpus fehlerhafter
// Dateien jeden Code, und eine untere Schranke hält fest, dass der Korpus
// nicht still schrumpft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import en from '../../../src/i18n/en.json';
import fr from '../../../src/i18n/fr.json';
import es from '../../../src/i18n/es.json';
import it_ from '../../../src/i18n/it.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
// Der Schalt-Zustand als Attrappe: `templates` lässt sich für den Befund
// «Vorlagen sind ausgeschaltet» abschalten.
const aus = new Set();
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => !aus.has(id),
}));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const {
  befundSchluessel,
  befundText,
  befundZeile,
  kopfAussage,
  pruefeWorkflow,
  registriereRueckfragen,
  rueckfragenZuruecksetzen,
} = await import('../../../src/renderer/modules/workflows/workflow-pruefung.js');
const { analyzeWorkflow, templateInputs, templateRefs } =
  await import('../../../src/shared/workflows/workflow-core.js');
const { createDbLookup } = await import('../../../src/shared/workflows/workflow-db-lookup.js');

const KOPF = ['---', 'workflow: true', 'name: Probe', '---', ''];
const datei = (...zeilen) => [...KOPF, '```workflow', ...zeilen, '```', ''].join('\n');

afterEach(() => {
  rueckfragenZuruecksetzen();
  aus.clear();
});

describe('pruefeWorkflow', () => {
  it('liefert dasselbe Ergebnis wie der Kern (AK2)', () => {
    const text = datei('fliege "Mond.md"', 'notify "x"');
    expect(pruefeWorkflow(text)).toEqual(
      analyzeWorkflow(text, { templatesEnabled: true, isKnownCommand: expect.any(Function) }),
    );
    expect(pruefeWorkflow(text).findings).toEqual([
      { code: 'unknownCommand', line: 7, blockLine: 1, column: 1, detail: { keyword: 'fliege' } },
    ]);
  });

  it('kennt die Kommandos der Registry ohne Registrierung', () => {
    expect(pruefeWorkflow(datei('command view.toggleEdit')).ok).toBe(true);
    expect(pruefeWorkflow(datei('command view.gibtEsNicht')).findings[0].code).toBe(
      'commandUnknown',
    );
  });

  it('prüft Makro und Workflow erst mit registrierter Rückfrage', () => {
    const text = datei('macro "M"', 'workflow "W"');
    expect(pruefeWorkflow(text).ok).toBe(true);
    registriereRueckfragen({ isKnownMacro: () => false, isKnownWorkflow: (n) => n === 'W' });
    expect(pruefeWorkflow(text).findings.map((b) => b.code)).toEqual(['macroUnknown']);
  });

  it('übernimmt nur Funktionen unter den drei bekannten Namen', () => {
    registriereRueckfragen({ isKnownMacro: 'nein', fremd: () => false });
    expect(pruefeWorkflow(datei('macro "M"')).ok).toBe(true);
  });

  it('folgt dem Schalter der Vorlagen', () => {
    const text = datei('create "a.md" from-template "v.md"');
    expect(pruefeWorkflow(text).ok).toBe(true);
    aus.add('templates');
    expect(pruefeWorkflow(text).findings.map((b) => b.code)).toEqual(['templatesDisabled']);
  });
});

describe('Texte der Prüf-Anzeige', () => {
  it('nennt die Zeile im Dokument und den Grund (O9)', () => {
    const [b] = pruefeWorkflow(datei('notify "a"', 'wait x')).findings;
    expect(befundZeile(b)).toBe('Zeile 8: Keine gültige Zahl');
  });

  it('nennt einen Befund der ganzen Datei ohne Zeile', () => {
    expect(befundZeile({ code: 'noBlock', line: null, detail: {} })).toBe(
      'Kein workflow-Block in der Datei',
    );
  });

  // 4T-002544 (AK4): der Schalter der Erweiterung «Datenbank» geht in die Prüfung.
  it('meldet Datenbank-Befehle bei ausgeschalteter Datenbank', () => {
    expect(pruefeWorkflow(datei('db-check')).findings).toEqual([]);
    aus.add('database');
    expect(befundZeile(pruefeWorkflow(datei('db-check')).findings[0])).toBe(
      'Zeile 7: Datenbank ist ausgeschaltet',
    );
  });

  it('übersetzt Tabelle, Feld und Ziel der Datenbank-Befehle', () => {
    expect(
      befundText({ code: 'fieldUnknown', detail: { field: 'seiten', table: 'Library' } }),
    ).toBe("Feld unbekannt: Die Tabelle 'Library' hat kein Feld 'seiten'");
    expect(befundText({ code: 'missingOption', detail: { group: 'target' } })).toBe(
      'Pflicht-Option fehlt: Ziel-Datei (into)',
    );
    expect(befundText({ code: 'argumentType', detail: { expected: 'table' } })).toBe(
      'Falsche Art der Angabe; erwartet: Tabelle',
    );
  });

  it('übersetzt Argument-Art und Options-Gruppe', () => {
    expect(befundText({ code: 'argumentType', detail: { expected: 'path' } })).toBe(
      'Falsche Art der Angabe; erwartet: Pfad',
    );
    expect(befundText({ code: 'missingOption', detail: { group: 'source' } })).toBe(
      'Pflicht-Option fehlt: Quelle (Vorlage, Datei oder Abschnitt)',
    );
  });

  it('unterscheidet absoluten Pfad und Weg aus dem Bereich', () => {
    expect(befundText({ code: 'pathOutsideArea', detail: { kind: 'absolute' } })).toBe(
      'Absoluter Pfad; erlaubt sind nur Pfade im Bereich',
    );
    expect(befundText({ code: 'pathOutsideArea', detail: { kind: 'parent' } })).toBe(
      'Der Pfad führt aus dem Bereich hinaus',
    );
  });

  it('nennt bei der späteren Stufe Schlüsselwort oder Platzhalter', () => {
    expect(befundText({ code: 'laterStage', detail: { keyword: 'delete', stage: 2 } })).toBe(
      "'delete' gibt es erst in einer späteren Ausbaustufe (Stufe 2)",
    );
    expect(befundText({ code: 'laterStage', detail: { placeholder: 'clipboard', stage: 2 } })).toBe(
      "'clipboard' gibt es erst in einer späteren Ausbaustufe (Stufe 2)",
    );
  });

  it('meldet einen Code ohne Text laut und zeigt den Code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(befundText({ code: 'gibtEsNicht', detail: {} })).toBe('gibtEsNicht');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gibtEsNicht'));
    warn.mockRestore();
  });

  it('sagt «bereit» oder den ersten Befund mit «(+N weitere)» (E5)', () => {
    expect(kopfAussage(pruefeWorkflow(datei('notify "x"')), 6)).toEqual({
      ok: true,
      text: 'bereit',
      liste: [],
    });
    const a = kopfAussage(pruefeWorkflow(datei('fliege "a"', 'wait x', 'open')), 6);
    expect(a.ok).toBe(false);
    expect(a.text).toBe("Zeile 7: Unbekannter Befehl 'fliege' (+2 weitere)");
    expect(a.liste).toHaveLength(3);
  });

  it('zeigt den Hinweis auf mehrere Blöcke nur über seinem Block (E3)', () => {
    const text = [...KOPF, '```workflow', 'notify "a"', '```', '```workflow', '```', ''].join('\n');
    const analyse = pruefeWorkflow(text);
    expect(kopfAussage(analyse, 6).text).toBe(
      'Zeile 6: 2 workflow-Blöcke; erlaubt ist genau einer',
    );
    expect(kopfAussage(analyse, 9).text).toBe(
      'Zeile 9: 2 workflow-Blöcke; erlaubt ist genau einer',
    );
  });
});

// Ein Korpus, der jeden Befund-Code des Kerns erzeugt. Kommt im Kern ein Code
// hinzu, fällt er hier nicht auf; dafür sorgt der laute Nachschlage-Vorgang zur
// Laufzeit. Fällt ein Fall aus dem Korpus, fängt ihn die untere Schranke.
function korpusCodes() {
  registriereRueckfragen({ isKnownMacro: () => false, isKnownWorkflow: () => false });
  const codes = [];
  const sammle = (findings) => codes.push(...findings.map((b) => ({ ...b })));
  const zeilen = [
    'notify „x"',
    'notify "x',
    'notify a"b"',
    'move "a.md""b.md"',
    '"x"',
    'fliege "x"',
    'delete "a.md"',
    'notify "{{clipboard}}"',
    'open',
    'open "a.md" "b.md"',
    'open x',
    'create "a.md" at-start',
    'create "a.md" from-template "a" from-file "b"',
    'append "a.md"',
    'notify ""',
    'wait x',
    'wait 999999',
    'command x',
    'command macro.x',
    'command view.gibtEsNicht',
    'macro "M"',
    'workflow "W"',
    'workflow "Probe"',
    'notify "{{x"',
    'notify "{{cursor}}"',
    'open ""',
    'open "/a.md"',
    'open "../a.md"',
    'rename "a.md" "x/y"',
  ];
  for (const z of zeilen) sammle(pruefeWorkflow(datei(z)).findings);
  // 4T-002349, E1: zwei Treffer gleichen Namens sind mehrdeutig.
  registriereRueckfragen({ isKnownMacro: () => 2, isKnownWorkflow: () => 2 });
  sammle(pruefeWorkflow(datei('macro "M"', 'workflow "W"')).findings);
  sammle(
    pruefeWorkflow(['---', 'workflow: true', 'trigger: daily', '---', ''].join('\n')).findings,
  );
  sammle(pruefeWorkflow([...KOPF, '```workflow', '```', '```workflow', '```'].join('\n')).findings);
  aus.add('templates');
  sammle(pruefeWorkflow(datei('create "a.md" from-template "v.md"')).findings);
  aus.clear();
  const { steps } = pruefeWorkflow(datei('create "a.md" from-template "v.md"'));
  const { refs } = templateRefs(steps, {}, {});
  sammle(templateInputs(refs, { 'v.md': null }, {}).findings);
  sammle(templateInputs(refs, { 'v.md': '{{offen' }, {}).findings);
  // 4T-002544: die Befunde der Datenbank-Befehle mit der Attrappe der Rückfrage.
  registriereRueckfragen(
    createDbLookup({
      tables: [
        { name: 'T', path: 'T.md', fields: ['a'] },
        { name: 'D', path: 'x/D.md', fields: [] },
        { name: 'D', path: 'y/D.md', fields: [] },
      ],
      queries: [
        { path: 'Q.md', state: 'ok', records: false, grouped: false, table: null },
        { path: 'K.md', state: 'invalid' },
      ],
    }),
  );
  sammle(
    pruefeWorkflow(
      datei(
        'db-create "T"',
        'db-update "T" "r" a="1" a="2" b="3"',
        'db-check "X"',
        'db-check "D"',
        'db-open-list "N.md"',
        'db-open-list "K.md"',
        'db-for-each "Q.md"',
        'end',
        'notify "{{record:a}}"',
        'notify "{{db:T:x}}"',
        'db-query "Q.md"',
        'db-delete "T" ""',
      ),
    ).findings,
  );
  // 4T-002547: Name und Platzhalter der neuen Kennung, Datenbank-Werte vor dem Lauf.
  sammle(
    pruefeWorkflow(
      datei(
        'notify "{{created:neu}}"',
        'db-create "T" a="1" as "neu"',
        'db-create "T" a="2" as "neu"',
        'db-create "T" a="3" as "x y"',
        'workflow "{{created:neu}}"',
      ),
    ).findings,
  );
  aus.add('database');
  sammle(pruefeWorkflow(datei('db-check')).findings);
  aus.clear();
  return codes;
}

describe('Durchlauf-Wächter: jeder Befund-Code hat einen Text (AK6)', () => {
  const befunde = korpusCodes();
  const schluessel = [...new Set(befunde.map((b) => befundSchluessel(b)))].sort();

  it('erzeugt mindestens 35 verschiedene Schlüssel', () => {
    expect(schluessel.length).toBeGreaterThanOrEqual(35);
  });

  // 4T-002544: die elf Befunde der Datenbank-Befehle stehen im Korpus.
  it('erzeugt die Befunde der Datenbank-Befehle', () => {
    for (const code of [
      'pairsMissing',
      'fieldDuplicate',
      'fieldUnknown',
      'tableUnknown',
      'tableAmbiguous',
      'queryFileMissing',
      'queryInvalid',
      'queryNoRecords',
      'recordOutsideLoop',
      'dbPlaceholderInvalid',
      'databaseDisabled',
      // 4T-002547
      'createdNameInvalid',
      'createdNameDuplicate',
      'createdBeforeStep',
      'dbValueNotAllowed',
    ]) {
      expect(schluessel, code).toContain(`workflow.befund.${code}`);
    }
  });

  it.each([
    ['de', de],
    ['en', en],
    ['fr', fr],
    ['es', es],
    ['it', it_],
  ])('jeder Schlüssel steht in der Sprachfassung %s', (_, katalog) => {
    const fehlend = schluessel.filter((k) => typeof katalog[k] !== 'string' || katalog[k] === '');
    expect(fehlend).toEqual([]);
  });

  it('kein Text eines Befunds bleibt ein Code', () => {
    const warn = vi.spyOn(console, 'warn');
    for (const b of befunde) expect(befundText(b)).not.toBe(b.code);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
