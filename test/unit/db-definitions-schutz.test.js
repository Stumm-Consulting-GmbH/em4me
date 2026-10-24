// 4T-002310 (Epic 3E-000263, F3 A, S5, S6): Prüffälle des Schutzes der
// Definition und seines Einbaus in den Speicher-Kanal.
//
// Die Prüfung läuft an der realen Konstellation: Die Rechte kommen über die
// Rechte-Funktion der Verdrahtung (`erzeugeRechteFuer`) aus einem gelesenen
// Steckbrief, nicht aus einer vorgefertigten Erlaubnis-Menge. Der Speicher-Kanal
// wird mit einem echten Datei-Ordner und dem echten Schreibweg geprüft.
//
// Dazu der Beleg der Sitzungs-Entscheidung, dass die Zeilen- und
// Frontmatter-Kanäle (`task:applyLineEdit`, `events:applyFrontmatterEdit`) den
// Behälter `db-table` nicht verändern: geprüft an den Modulen, die sie zum
// Rechnen des neuen Inhalts benutzen.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  erzeugeDefinitionsSchutz,
  vergleicheDefinition,
  abweisungsText,
} = require('../../src/main/database/definitions-schutz.js');
const { erzeugeRechteFuer } = require('../../src/main/database/record-regel-berechtigung.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const { computeLineReplacement } = require('../../src/main/documents/task-line-edit.js');
const {
  writeFrontmatter,
  extractFrontmatter,
} = require('../../src/shared/markdown/frontmatter.js');
const DE = require('../../src/i18n/fragments/de/database.json');

const TABELLE = [
  '---',
  'title: Library',
  'db-table:',
  '  name: Library',
  '  fields:',
  '    - name: title',
  '      type: string',
  '      label: Title',
  '    - name: pages',
  '      type: number',
  '      label: Pages',
  '  key: title',
  '---',
  '',
  '# Library',
  '',
  'Ein Satz im Prosa-Teil.',
  '',
  '- [ ] Bestand prüfen',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Solaris',
  '| 224',
  '```',
  '',
].join('\n');

const STECKBRIEF = [
  '---',
  'db-database:',
  '  name: Library',
  '  roles:',
  '    librarian: all',
  '    assistant:',
  '      Library: [update]',
  '      Loans: [create, update, delete, define]',
  '    verwalter:',
  '      all: [define]',
  '  defaultRole: assistant',
  '  users:',
  '    anna: librarian',
  '    vera: verwalter',
  '---',
  '',
  '# Library Database',
  '',
].join('\n');

const WURZEL = path.resolve('/db');
const KOPF = path.join(WURZEL, 'Library.md');
const LOANS = path.join(WURZEL, 'Loans.md');
const DATENBANK = path.join(WURZEL, 'Library Database.md');

function fakeFs(dateien) {
  return {
    async stat(p) {
      if (!(p in dateien)) throw new Error('ENOENT');
      return { mtimeMs: 1, size: Buffer.byteLength(dateien[p], 'utf8') };
    },
    async readFile(p) {
      if (!(p in dateien)) throw new Error('ENOENT');
      return dateien[p];
    },
  };
}

// Der Schutz mit der Rechte-Funktion der Verdrahtung über einer festen Sicht.
// `benutzer` trifft die Zuordnung `users`; ohne Treffer gilt die Vorgabe-Rolle.
function schutzMit({
  benutzer = 'max',
  steckbrief = STECKBRIEF,
  status = 'ready',
  aktiv = true,
  zaehler = null,
} = {}) {
  const marken = [
    [KOPF, ['table']],
    [LOANS, ['table']],
  ];
  const dateien = { [KOPF]: TABELLE, [LOANS]: '---\ndb-table:\n---\n' };
  if (steckbrief !== null) {
    marken.push([DATENBANK, ['database']]);
    dateien[DATENBANK] = steckbrief;
  }
  const rechteFuer = erzeugeRechteFuer({
    tabellenSicht: () => ({ status: 'ready', sicht: { dbKindsPerFile: new Map(marken) } }),
    fsp: fakeFs(dateien),
    herkunft: () => ({ benutzer, rechner: 'pc' }),
  });
  return erzeugeDefinitionsSchutz({
    tabellenSicht: () => ({ status, meta: status === 'ready' ? { wurzel: WURZEL } : null }),
    rechteFuer: async (...args) => {
      if (zaehler) zaehler.n += 1;
      return rechteFuer(...args);
    },
    erweiterungAktiv: () => aktiv,
  });
}

const ersetze = (text, alt, neu) => {
  expect(text).toContain(alt);
  return text.replace(alt, neu);
};

describe('Definitions-Schutz: was als Änderung der Definition zählt (4T-002310)', () => {
  it('lässt eine Änderung allein im Datensatz-Block frei, ohne die Rechte zu lesen (4T-002310)', async () => {
    const zaehler = { n: 0 };
    const neu = ersetze(TABELLE, '| 224', '| 225');
    const urteil = await schutzMit({ zaehler })({ pfad: KOPF, alterText: TABELLE, neuerText: neu });
    expect(urteil).toEqual({ abgewiesen: false, lage: 'unveraendert' });
    expect(zaehler.n).toBe(0);
  });

  it('lässt eine Änderung allein im Prosa-Teil frei (4T-002310)', async () => {
    const neu = ersetze(TABELLE, 'Ein Satz', 'Ein geänderter Satz');
    const urteil = await schutzMit()({ pfad: KOPF, alterText: TABELLE, neuerText: neu });
    expect(urteil).toEqual({ abgewiesen: false, lage: 'unveraendert' });
  });

  it('zählt Umformatierung und Reihenfolge der Schlüssel nicht als Änderung (4T-002310)', async () => {
    const umgestellt = [
      '---',
      'db-table:',
      '  key: "title"',
      '  fields:',
      '    - { type: string, name: title, label: Title }',
      '    - label: Pages',
      '      name: pages',
      '      type: number',
      '  name: Library',
      'title: Library',
      'tags: [neu]',
      '---',
    ].join('\n');
    const neu = umgestellt + TABELLE.slice(TABELLE.indexOf('\n---\n') + 4);
    expect(vergleicheDefinition(TABELLE, neu)).toMatchObject({
      tabelle: true,
      tabelleGeaendert: false,
    });
    const urteil = await schutzMit()({ pfad: KOPF, alterText: TABELLE, neuerText: neu });
    expect(urteil.abgewiesen).toBe(false);
  });

  it('lässt eine Änderung allein am Hochwasserstand lastId frei (4T-002310)', async () => {
    const mit3 = TABELLE.replace('  key: title\n', '  key: title\n  lastId: 3\n');
    const mit4 = mit3.replace('lastId: 3', 'lastId: 4');
    expect(mit3).not.toBe(TABELLE);
    for (const [alt, neu] of [
      [mit3, mit4],
      [TABELLE, mit4],
      [mit4, TABELLE],
    ]) {
      const urteil = await schutzMit()({ pfad: KOPF, alterText: alt, neuerText: neu });
      expect(urteil).toEqual({ abgewiesen: false, lage: 'unveraendert' });
    }
    // Gegenprobe: Hochwasserstand und Beschriftung zusammen sind eine Änderung.
    const beides = mit4.replace('label: Pages', 'label: Seiten');
    expect(vergleicheDefinition(mit3, beides).tabelleGeaendert).toBe(true);
  });

  it('übergeht ein BOM am Anfang des gespeicherten Stands (4T-002310)', () => {
    expect(vergleicheDefinition('\uFEFF' + TABELLE, TABELLE).tabelleGeaendert).toBe(false);
  });

  it('zählt die Reihenfolge der Felder als Änderung, weil sie die Spalten bestimmt (4T-002310)', () => {
    const neu = TABELLE.replace(
      '    - name: title\n      type: string\n      label: Title\n    - name: pages\n      type: number\n      label: Pages\n',
      '    - name: pages\n      type: number\n      label: Pages\n    - name: title\n      type: string\n      label: Title\n',
    );
    expect(neu).not.toBe(TABELLE);
    expect(vergleicheDefinition(TABELLE, neu).tabelleGeaendert).toBe(true);
  });

  it('zählt eine Angabe, die der Parser nicht kennt, als Änderung (4T-002310)', () => {
    const neu = ersetze(TABELLE, '  key: title\n', '  key: title\n  valuesFrom: Loans\n');
    expect(vergleicheDefinition(TABELLE, neu).tabelleGeaendert).toBe(true);
  });

  it('zählt das Entfernen der Marke und ein unlesbares Frontmatter als Änderung (4T-002310)', () => {
    const ohneMarke = TABELLE.replace(/db-table:[\s\S]*?\n---\n/, 'other: 1\n---\n');
    expect(vergleicheDefinition(TABELLE, ohneMarke)).toMatchObject({
      tabelle: true,
      tabelleGeaendert: true,
    });
    const kaputt = ersetze(TABELLE, '      label: Pages', '      label: [Pages');
    expect(vergleicheDefinition(TABELLE, kaputt).tabelleGeaendert).toBe(true);
  });
});

describe('Definitions-Schutz: Abweisung und Erlaubnis (4T-002310)', () => {
  const umbenannt = TABELLE.replace('label: Pages', 'label: Number of pages');

  it('weist ein umbenanntes Feld ohne define mit Tabelle und Rolle ab (4T-002310)', async () => {
    const urteil = await schutzMit()({ pfad: KOPF, alterText: TABELLE, neuerText: umbenannt });
    expect(urteil).toEqual({
      abgewiesen: true,
      code: 'defineNichtErlaubt',
      art: 'tabelle',
      tabelle: 'Library',
      rolle: 'assistant',
    });
  });

  it('lässt dieselbe Änderung mit define frei (4T-002310)', async () => {
    for (const benutzer of ['anna', 'vera']) {
      const urteil = await schutzMit({ benutzer })({
        pfad: KOPF,
        alterText: TABELLE,
        neuerText: umbenannt,
      });
      expect(urteil).toEqual({ abgewiesen: false, lage: 'erlaubt' });
    }
    const loans = await schutzMit()({
      pfad: LOANS,
      alterText: '---\ndb-table:\n---\n',
      neuerText: '---\ndb-table:\n  fields:\n    - name: book\n---\n',
    });
    expect(loans).toEqual({ abgewiesen: false, lage: 'erlaubt' });
  });

  it('verlangt beim Steckbrief define an allen Tabellen (4T-002310)', async () => {
    const neu = ersetze(STECKBRIEF, '  name: Library', '  name: Bibliothek');
    const assistent = await schutzMit()({ pfad: DATENBANK, alterText: STECKBRIEF, neuerText: neu });
    expect(assistent).toEqual({
      abgewiesen: true,
      code: 'defineNichtErlaubt',
      art: 'steckbrief',
      tabelle: 'Library',
      rolle: 'assistant',
    });
    for (const benutzer of ['anna', 'vera']) {
      const frei = await schutzMit({ benutzer })({
        pfad: DATENBANK,
        alterText: STECKBRIEF,
        neuerText: neu,
      });
      expect(frei.abgewiesen).toBe(false);
    }
    // Eine Rolle mit define an genau einer der beiden Tabellen genügt nicht.
    const halb = STECKBRIEF.replace('Library: [update]', 'Library: [define]').replace(
      'Loans: [create, update, delete, define]',
      'Loans: [update]',
    );
    const urteil = await schutzMit({ steckbrief: halb })({
      pfad: DATENBANK,
      alterText: halb,
      neuerText: halb.replace('  name: Library', '  name: Bibliothek'),
    });
    expect(urteil).toMatchObject({ abgewiesen: true, art: 'steckbrief', tabelle: 'Loans' });
  });

  it('prüft Masken-Dateien, Abfrage-Dateien und gewöhnliche Dokumente nicht (4T-002310)', async () => {
    const zaehler = { n: 0 };
    const schutz = schutzMit({ zaehler });
    const faelle = [
      ['---\ndb-form:\n  table: Library\n---\n# A\n', '---\ndb-form:\n  table: Loans\n---\n# B\n'],
      ['---\ndb-query:\n---\n# A\n', '---\ndb-query:\n  form: X\n---\n# B\n'],
      ['# Notiz\n', '# Notiz geändert\n'],
      [null, '---\ntitle: neu\n---\n'],
    ];
    for (const [alt, neu] of faelle) {
      const urteil = await schutz({
        pfad: path.join(WURZEL, 'X.md'),
        alterText: alt,
        neuerText: neu,
      });
      expect(urteil).toEqual({ abgewiesen: false, lage: 'keineDefinition' });
    }
    expect(zaehler.n).toBe(0);
  });

  it('lässt ohne Rollen und ohne Steckbrief alles frei (4T-002310)', async () => {
    const ohneRollen = '---\ndb-database:\n  name: Library\n---\n';
    for (const steckbrief of [ohneRollen, null]) {
      const urteil = await schutzMit({ steckbrief })({
        pfad: KOPF,
        alterText: TABELLE,
        neuerText: umbenannt,
      });
      expect(urteil).toEqual({ abgewiesen: false, lage: 'keineRolle' });
    }
  });

  it('weist bei nicht bestimmbaren Rechten mit Grund ab (4T-002310)', async () => {
    for (const status of ['indexing', 'oversized', 'unavailable']) {
      const urteil = await schutzMit({ status })({
        pfad: KOPF,
        alterText: TABELLE,
        neuerText: umbenannt,
      });
      expect(urteil).toEqual({
        abgewiesen: true,
        code: 'defineRechteNichtBestimmbar',
        art: 'tabelle',
        tabelle: 'Library',
        grund: status,
      });
    }
    const kaputt = await schutzMit({ steckbrief: '---\ndb-database: [\n---\n' })({
      pfad: KOPF,
      alterText: TABELLE,
      neuerText: umbenannt,
    });
    expect(kaputt).toMatchObject({ abgewiesen: true, grund: 'steckbriefFehlerhaft' });
  });

  it('behandelt eine neue Tabellen-Datei als Anlegen einer Definition (4T-002310)', async () => {
    const neuPfad = path.join(WURZEL, 'Authors.md');
    const text = '---\ndb-table:\n  fields:\n    - name: name\n---\n';
    expect(await schutzMit()({ pfad: neuPfad, alterText: null, neuerText: text })).toMatchObject({
      abgewiesen: true,
      code: 'defineNichtErlaubt',
      tabelle: 'Authors',
    });
    // Eine Rolle mit define an allen Tabellen darf auch eine, die der Index noch nicht kennt.
    expect(
      await schutzMit({ benutzer: 'vera' })({ pfad: neuPfad, alterText: null, neuerText: text }),
    ).toEqual({ abgewiesen: false, lage: 'erlaubt' });
    expect(
      await schutzMit({ steckbrief: null })({ pfad: neuPfad, alterText: '', neuerText: text }),
    ).toEqual({ abgewiesen: false, lage: 'keineRolle' });
  });

  it('prüft im Aus-Zustand der Erweiterung nichts (4T-002310)', async () => {
    const zaehler = { n: 0 };
    const urteil = await schutzMit({ aktiv: false, zaehler })({
      pfad: KOPF,
      alterText: TABELLE,
      neuerText: umbenannt,
    });
    expect(urteil).toEqual({ abgewiesen: false, lage: 'ausgeschaltet' });
    expect(zaehler.n).toBe(0);
  });

  it('setzt Rolle und Tabelle in den Satz der Meldung ein (4T-002310)', () => {
    const t = (k) => DE[k];
    const text = abweisungsText(
      { code: 'defineNichtErlaubt', art: 'tabelle', tabelle: 'Library', rolle: 'assi$&' },
      t,
    );
    expect(text).toContain('«assi$&»');
    expect(text).toContain('«Library»');
    expect(
      abweisungsText(
        { code: 'defineNichtErlaubt', art: 'steckbrief', tabelle: 'Loans', rolle: 'r' },
        t,
      ),
    ).toBe(
      DE['database.schutz.defineSteckbrief'].replace('{rolle}', 'r').replace('{tabelle}', 'Loans'),
    );
    expect(abweisungsText({ code: 'defineRechteNichtBestimmbar', tabelle: null }, t)).toBe(
      DE['database.schutz.defineRechteNichtBestimmbar'],
    );
  });

  it('verlangt Sicht und Rechte-Funktion (4T-002310)', () => {
    expect(() => erzeugeDefinitionsSchutz({ rechteFuer: async () => ({}) })).toThrow(TypeError);
  });
});

// --- Der Speicher-Kanal -------------------------------------------------------------------

let tmpDirs = [];
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function speicherKanal(definitionsSchutz) {
  const handlers = kanaele(definitionsSchutz, null);
  return (pfad, text) => handlers.get('file:save')({ sender: { id: 1 } }, pfad, text, {});
}

// «Speichern unter» mit einem Dialog, der das Ziel `ziel` wählt.
function speichernUnter(definitionsSchutz, ziel) {
  const handlers = kanaele(definitionsSchutz, ziel);
  return (text) => handlers.get('file:saveAs')({ sender: { id: 1 } }, ziel, text);
}

function kanaele(definitionsSchutz, ziel) {
  const handlers = new Map();
  registerFilesIpc((k, fn) => handlers.set(k, fn), {
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: ziel }) },
    senderWindow: () => ({ id: 1 }),
    areaOfWindow: () => null,
    tForWindow: (_win, k) => DE[k] || k,
    isMddPath: () => false,
    isMarkdownPath: (p) => /\.md$/i.test(p),
    watchFile: () => {},
    unwatchFile: () => {},
    resolveHistoryFor: async () => ({ effective: false }),
    recordMddExternalOnOpen: async () => {},
    readPreviousTextFor: async () => null,
    recordMddOnSave: async () => {},
    saveGuard: { istKonflikt: () => false },
    pushRecent: () => {},
    getStore: () => null,
    readAreaLinks: async () => [],
    definitionsSchutz,
  });
  return handlers;
}

describe('Definitions-Schutz im Speicher-Kanal (4T-002310)', () => {
  function aufbau() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-defschutz-'));
    tmpDirs.push(dir);
    const datei = path.join(dir, 'Library.md');
    fs.writeFileSync(datei, TABELLE, 'utf8');
    return datei;
  }

  it('schreibt bei Abweisung nichts und meldet den Satz mit Rolle und Tabelle (4T-002310)', async () => {
    const datei = aufbau();
    const speichere = speicherKanal(schutzMit());
    const antwort = await speichere(
      datei,
      TABELLE.replace('label: Pages', 'label: Number of pages'),
    );
    expect(antwort.ok).toBe(false);
    expect(antwort.code).toBe('defineNichtErlaubt');
    expect(antwort.error).toContain('«assistant»');
    expect(antwort.error).toContain('«Library»');
    expect(fs.readFileSync(datei, 'utf8')).toBe(TABELLE);
  });

  it('speichert eine Änderung allein im Prosa-Teil wie bisher (4T-002310)', async () => {
    const datei = aufbau();
    const neu = TABELLE.replace('Ein Satz', 'Ein anderer Satz');
    const antwort = await speicherKanal(schutzMit())(datei, neu);
    expect(antwort.ok).toBe(true);
    expect(fs.readFileSync(datei, 'utf8')).toBe(neu);
  });

  it('übergibt Pfad, gespeicherten und neuen Stand an den Schutz (4T-002310)', async () => {
    const datei = aufbau();
    const aufrufe = [];
    const speichere = speicherKanal(async (auftrag) => {
      aufrufe.push(auftrag);
      return { abgewiesen: false, lage: 'unveraendert' };
    });
    await speichere(datei, `${TABELLE}\r\nNachtrag`);
    expect(aufrufe).toEqual([
      {
        pfad: path.resolve(datei),
        bereichsWurzel: null,
        alterText: TABELLE,
        neuerText: `${TABELLE}\nNachtrag`,
      },
    ]);
  });
});

describe('Definitions-Schutz in «Speichern unter» (4T-002310)', () => {
  function ordner() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-defschutz-unter-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('prüft eine bestehende Zieldatei gegen ihren gespeicherten Stand (4T-002310)', async () => {
    const ziel = path.join(ordner(), 'Library.md');
    fs.writeFileSync(ziel, TABELLE, 'utf8');
    const geaendert = TABELLE.replace('label: Pages', 'label: Number of pages');
    const antwort = await speichernUnter(schutzMit(), ziel)(geaendert);
    expect(antwort).toMatchObject({ ok: false, code: 'defineNichtErlaubt' });
    expect(antwort.error).toContain('«assistant»');
    expect(antwort.error).toContain('«Library»');
    expect(fs.readFileSync(ziel, 'utf8')).toBe(TABELLE);
    // Allein der Prosa-Teil geändert: frei.
    const prosa = TABELLE.replace('Ein Satz', 'Ein anderer Satz');
    expect(await speichernUnter(schutzMit(), ziel)(prosa)).toEqual({ ok: true, path: ziel });
    expect(fs.readFileSync(ziel, 'utf8')).toBe(prosa);
  });

  it('verlangt define für eine neue Datei mit Definition in einer Datenbank mit Rollen (4T-002310)', async () => {
    const dir = ordner();
    const neu = path.join(dir, 'Authors.md');
    const text = '---\ndb-table:\n  fields:\n    - name: name\n---\n';
    const antwort = await speichernUnter(schutzMit(), neu)(text);
    expect(antwort).toMatchObject({ ok: false, code: 'defineNichtErlaubt' });
    expect(antwort.error).toContain('«Authors»');
    expect(fs.existsSync(neu)).toBe(false);
    // Mit define an allen Tabellen und ohne Definition im Text: frei.
    expect(await speichernUnter(schutzMit({ benutzer: 'vera' }), neu)(text)).toMatchObject({
      ok: true,
    });
    const notiz = path.join(dir, 'Notiz.md');
    expect(await speichernUnter(schutzMit(), notiz)('# Notiz\n')).toMatchObject({ ok: true });
  });
});

// --- Die Zeilen- und Frontmatter-Kanäle bleiben außen vor ----------------------------------

describe('Zeilen- und Frontmatter-Kanäle verändern den Behälter db-table nicht (4T-002310)', () => {
  it('task:applyLineEdit: das Abhaken einer Aufgabe lässt die Definition gleich (4T-002310)', () => {
    const zeile = TABELLE.split('\n').indexOf('- [ ] Bestand prüfen') + 1;
    const ergebnis = computeLineReplacement(TABELLE, {
      line: zeile,
      expectedText: '- [ ] Bestand prüfen',
      newText: '- [x] Bestand prüfen',
    });
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.newContent).not.toBe(TABELLE);
    expect(vergleicheDefinition(TABELLE, ergebnis.newContent).tabelleGeaendert).toBe(false);
  });

  it('events:applyFrontmatterEdit: Angaben neben dem Behälter lassen ihn gleich (4T-002310)', () => {
    // Derselbe Weg wie der Kanal: gelesene Angaben übernehmen, Aktualisierungen setzen.
    const newData = { ...extractFrontmatter(TABELLE).data, date: '2026-10-18', title: 'Bücher' };
    const geschrieben = writeFrontmatter(TABELLE, newData);
    expect(geschrieben.ok).toBe(true);
    expect(geschrieben.text).toContain('date: 2026-10-18');
    expect(vergleicheDefinition(TABELLE, geschrieben.text)).toMatchObject({
      tabelle: true,
      tabelleGeaendert: false,
    });
  });
});

// --- Die Rechte aus dem gespeicherten Stand ------------------------------------------------

describe('Definitions-Schutz: die Sicht ohne Puffer (4T-002310)', () => {
  const backlinks = require('../../src/main/backlinks.js');

  it('behält die Marke des Steckbriefs, auch wenn der Puffer ihn unlesbar macht (4T-002310)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-defschutz-index-'));
    tmpDirs.push(root);
    const steckbrief = path.join(root, 'Library Database.md');
    const kopf = path.join(root, 'Library.md');
    fs.writeFileSync(steckbrief, STECKBRIEF, 'utf8');
    fs.writeFileSync(kopf, TABELLE, 'utf8');
    let lage = backlinks.backlinksFor(kopf, undefined, root);
    for (let i = 0; i < 500 && lage.status === 'indexing'; i++) {
      await new Promise((r) => setTimeout(r, 10));
      lage = backlinks.backlinksFor(kopf, undefined, root);
    }
    try {
      backlinks.setBufferOverlay(steckbrief, '---\ndb-database: [\n---\n');
      const mitPuffer = backlinks.datenbankSicht(null, root);
      const ohnePuffer = backlinks.datenbankSicht(null, root, { ohnePuffer: true });
      expect(mitPuffer.status).toBe('ready');
      expect(mitPuffer.sicht.dbKindsPerFile.get(steckbrief) || []).toEqual([]);
      expect(ohnePuffer.sicht.dbKindsPerFile.get(steckbrief)).toEqual(['database']);
      expect(ohnePuffer.meta.wurzel).toBe(mitPuffer.meta.wurzel);
    } finally {
      backlinks.clearAllBufferOverlays();
      backlinks.releaseRoot(backlinks.rootForActiveFile(kopf, root));
    }
  });
});

describe('Definitions-Schutz: die Verdrahtung (4T-002310)', () => {
  const lesen = (rel) => fs.readFileSync(path.join(__dirname, '../../src/main', rel), 'utf8');

  it('baut den Schutz einmal über die Sicht ohne Puffer und reicht ihn beiden Schreibwegen (4T-002310)', () => {
    const verdrahtung = lesen('app/wiring.js');
    expect(verdrahtung.match(/erzeugeDefinitionsSchutz\(/g)).toHaveLength(1);
    expect(verdrahtung).toContain(
      'backlinks.datenbankSicht(pfad, bereichsWurzel, { ohnePuffer: true })',
    );
    expect(verdrahtung).toMatch(/erweiterungAktiv: datenbankAktiv,\n\s*\}\);/);
    expect(verdrahtung).toMatch(/^\s*definitionsSchutz,$/m);
    expect(lesen('ipc/files.js')).toMatch(/^\s*definitionsSchutz,$/m);
    expect(lesen('ipc/index-views.js')).toContain('definitionsSchutz: deps.definitionsSchutz,');
  });
});
