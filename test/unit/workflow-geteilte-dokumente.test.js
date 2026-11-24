// 4T-002689 (Epic 3E-000415, Story 4S-001215): Die Text-Befehle der Workflows
// an einem in Teile zerlegten Dokument, auf dem Weg über die Platte
// (src/main/workflows/workflow-platten-schreibweg.js, angebunden in
// workflow-content-steps.js).
//
// **Am echten Dateisystem** über eine Wegwerf-Wurzel, weil das Zusammenspiel
// von Teil-Dateien, Zuordnungs-Zeile, Katalog in der Begleitdatei und
// Zusammensetzen der Gegenstand ist; die Schwellen sind die echten (1 MB für
// ein Dokument, 0,7 MB für eine Tabellen-Datei), weil `teilungsOptionen` sie
// aus dem Text ableitet und keine kleinere annimmt.
//
// **Der Beleg aus Punkt 1 des Tasks** ist der erste Block: Am Stand vor dem Bau
// (2026-11-14) hängte `append` an das Ende des ersten Teils (Stelle 40 von 67,
// vor der Überschrift des zweiten Teils bei 46), `insert` endete mit
// `headingUnknown`, `replace` mit `textNotFound`. Der Block bleibt als
// Regressionstest stehen.
//
// **Der Wächter «gleich lesen, gleich schreiben»** fährt `file:save` aus
// src/main/ipc/files.js über seine Registrier-Funktion, wie es die Prüfdateien
// des Speicher-Kanals tun (Muster `db-kartei-speicher-pruefung.test.js`).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const {
  createPlattenSchreibweg,
} = require('../../src/main/workflows/workflow-platten-schreibweg.js');
const {
  writePartLine,
  readPartLine,
  PART_SEP,
  PART_INFIX,
} = require('../../src/shared/document-parts.js');
const {
  readStateForSave,
  writeDocumentParts,
  mddPathFor,
} = require('../../src/main/documents/document-parts-io.js');
const {
  planeZerlegung,
  DOKUMENT_SCHWELLE,
  ABLAGE_SCHWELLE,
  byteLength,
} = require('../../src/shared/document-split.js');
const { teilungsOptionen } = require('../../src/main/documents/teilungs-optionen.js');
const { emptyContainer, serializeContainer } = require('../../src/main/documents/mdd-store.js');
const selbstSchreib = require('../../src/main/documents/self-write.js');
const { registerFilesIpc } = require('../../src/main/ipc/files.js');
const {
  createWorkflowEventChecker,
  ENTPRELL_MS,
} = require('../../src/main/checks/workflow-event-check.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');
const {
  createWorkflowBlockQueries,
} = require('../../src/main/workflows/workflow-block-queries.js');
const {
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');

let tmpDirs = [];

afterEach(() => {
  selbstSchreib._laufLeeren();
  selbstSchreib._leeren();
  vi.useRealTimers();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const teilName = (grund, n) => `${grund}${PART_SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;
const lies = (p) => fs.readFileSync(p, 'utf8');

function wegwerfWurzel() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-teile-'));
  tmpDirs.push(root);
  return root;
}

// Legt ein geteiltes Dokument aus Rümpfen an (Rumpf 0 ist die Kopf-Datei) und
// eine leere Begleitdatei, damit der Katalog geschrieben werden kann.
function legeGeteilt(root, grund, rumpfe, ordner = '') {
  const dir = path.join(root, ordner);
  fs.mkdirSync(dir, { recursive: true });
  const kopf = path.join(dir, `${grund}.md`);
  rumpfe.forEach((rumpf, i) => {
    const name = i === 0 ? `${grund}.md` : `${teilName(grund, i + 1)}.md`;
    fs.writeFileSync(
      path.join(dir, name),
      writePartLine(rumpf, { index: i + 1, base: grund }).text,
    );
  });
  fs.writeFileSync(mddPathFor(kopf), serializeContainer(emptyContainer()));
  return kopf;
}

// Legt ein Dokument an und zerlegt es so, wie das Speichern von Hand es täte.
async function legeZerlegt(dir, grund, text) {
  fs.mkdirSync(dir, { recursive: true });
  const kopf = path.join(dir, `${grund}.md`);
  fs.writeFileSync(mddPathFor(kopf), serializeContainer(emptyContainer()));
  const teilung = teilungsOptionen(text);
  const plan = planeZerlegung({ text, base: grund, schwelle: teilung.schwelle, ...teilung });
  expect(plan.geteilt).toBe(true);
  expect((await writeDocumentParts(kopf, plan.teile)).ok).toBe(true);
  return kopf;
}

// Abschnitte mit Überschrift erster Ebene, zusammen etwa `bytes` groß.
function abschnitte(marke, bytes) {
  const zeilen = [];
  for (let i = 0, laenge = 0; laenge < bytes - 1100; i++) {
    const kopf = `# ${marke} ${i}`;
    zeilen.push(kopf, 'x'.repeat(1000));
    laenge += kopf.length + 1002;
  }
  return `${zeilen.join('\n')}\n`;
}

// Eine Tabellen-Datei der Datenbank mit `anzahl` Datensätzen zu rund 1 KB.
function tabelle(anzahl) {
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: name', '    - name: text', '---'];
  zeilen.push('', '```perspective-records');
  for (let i = 1; i <= anzahl; i++) {
    zeilen.push(`|- id="r-${String(i).padStart(5, '0')}"`, `| Name ${i}`, `| ${'x'.repeat(1000)}`);
  }
  zeilen.push('```', '');
  return zeilen.join('\n');
}

// Alle Dateien eines Ordners mit Inhalt, nach Name geordnet.
function bestand(dir) {
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => [name, lies(path.join(dir, name))]);
}

function welt({ historie = false, puffer = {} } = {}) {
  const root = wegwerfWurzel();
  const historien = [];
  const schritte = createWorkflowContentSteps({
    windows: new Map(),
    backlinks: {
      bufferTextFor: (p) => (Object.prototype.hasOwnProperty.call(puffer, p) ? puffer[p] : null),
      bufferOwnerFor: () => null,
    },
    resolveHistoryFor: async () => ({ effective: historie }),
    recordMddOnSave: async (_owner, p, vorher, nachher) => historien.push({ p, vorher, nachher }),
    bufferRequests: { request: async () => ({ ok: false, code: 'bufferUnavailable' }) },
  });
  const ctx = {
    root,
    owner: {},
    event: { sender: { id: 1 } },
    workflowAbs: path.join(root, 'Workflows', 'Ablauf.md'),
  };
  const lauf = (keyword, args, extra = {}) =>
    selbstSchreib.imWorkflowLauf(() =>
      schritte.runContentStep(ctx, {
        line: 3,
        keyword,
        args,
        source: null,
        position: null,
        ...extra,
      }),
    );
  const gesamt = async (kopf) => (await readStateForSave(kopf)).text;
  return { root, lauf, gesamt, historien, edit: (rel, e) => schritte.runContentEdit(ctx, rel, e) };
}

const VORLAGE = (text) => ({ source: { kind: 'template', text } });
const ZWEITEILIG = ['# Eins\nA\n', '# Zwei\n## Ende\nalt-2\n'];

describe('Beleg und Regression: Text-Befehle im zweiteiligen Dokument (AK1, AK3)', () => {
  it('append landet am Ende des Dokuments, also im letzten Teil; der erste Teil bleibt unberührt', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ZWEITEILIG);
    const kopfVorher = lies(kopf);
    const res = await w.lauf('append', ['Notizen.md'], VORLAGE('- neu'));
    expect(res).toEqual({ ok: true, effect: { kind: 'edited', paths: [kopf], via: 'disk' } });
    const text = await w.gesamt(kopf);
    expect(text.endsWith('alt-2\n- neu\n')).toBe(true);
    expect(text.indexOf('- neu')).toBeGreaterThan(text.indexOf('# Zwei'));
    expect(lies(kopf)).toBe(kopfVorher);
  });

  it('insert und replace finden ihre Stelle im zweiten Teil', async () => {
    const w = welt();
    legeGeteilt(w.root, 'Notizen', ZWEITEILIG);
    const eingefuegt = await w.lauf('insert', ['Notizen.md'], {
      ...VORLAGE('- eingefügt'),
      position: { kind: 'under', heading: 'Ende' },
    });
    const ersetzt = await w.lauf('replace', ['Notizen.md', 'alt-2', 'neu-2']);
    expect([eingefuegt.ok, ersetzt.ok]).toEqual([true, true]);
    const zweiter = lies(path.join(w.root, `${teilName('Notizen', 2)}.md`));
    expect(zweiter).toContain('## Ende\n- eingefügt\nneu-2\n');
    expect(readPartLine(zweiter)).toEqual(expect.objectContaining({ index: 2, base: 'Notizen' }));
  });

  it('set-property schreibt in den Dateikopf der Kopf-Datei; der zweite Teil bleibt', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ZWEITEILIG);
    const zweiterPfad = path.join(w.root, `${teilName('Notizen', 2)}.md`);
    const zweiterVorher = lies(zweiterPfad);
    expect((await w.lauf('set-property', ['Notizen.md', 'status', 'erledigt'])).ok).toBe(true);
    expect(lies(kopf)).toMatch(/^---\n(?:.*\n)*status: erledigt\n(?:.*\n)*---\n# Eins\n/);
    expect(readPartLine(lies(kopf))).toEqual(expect.objectContaining({ index: 1 }));
    expect(lies(zweiterPfad)).toBe(zweiterVorher);
  });

  it('add-tag, remove-tag und remove-property wirken am Dateikopf, die Zuordnung bleibt', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ['---\nalt: 1\n---\n# Eins\n', '# Zwei\n']);
    expect((await w.lauf('add-tag', ['Notizen.md', 'probe'])).ok).toBe(true);
    expect(lies(kopf)).toContain('probe');
    expect((await w.lauf('remove-tag', ['Notizen.md', 'probe'])).ok).toBe(true);
    expect((await w.lauf('remove-property', ['Notizen.md', 'alt'])).ok).toBe(true);
    expect(lies(kopf)).not.toMatch(/probe|alt: 1/);
    expect(readPartLine(lies(kopf))).toEqual(expect.objectContaining({ index: 1 }));
    expect(await w.gesamt(kopf)).toMatch(/# Eins\n# Zwei\n$/);
  });

  it('ein Folgeteil als Ziel meint das ganze Dokument', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ZWEITEILIG);
    const res = await w.lauf('replace', [`${teilName('Notizen', 2)}.md`, 'A\n', 'A neu\n']);
    expect(res.effect.paths).toEqual([kopf]);
    expect(await w.gesamt(kopf)).toContain('# Eins\nA neu\n# Zwei');
  });

  it('db-query … into mit under ersetzt über runContentEdit den Abschnitt im zweiten Teil', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ['# Eins\n', '## Liste\nalt\n## Danach\nbleibt\n']);
    const edit = { op: 'replaceSection', heading: 'Liste', text: '| a |\n' };
    expect((await w.edit('Notizen.md', edit)).ok).toBe(true);
    expect(await w.gesamt(kopf)).toMatch(/## Liste\n\n?\| a \|\n\n?## Danach\nbleibt\n$/);
  });

  // Zweitblick, Runde 1, Befund 2: Die Quelle wird als ganzes Dokument gelesen.
  it('append from-file mit geteilter Quelle übernimmt den ganzen Text ohne Zuordnungs-Zeile', async () => {
    const w = welt();
    legeGeteilt(w.root, 'Quelle', ['---\ntitel: Q\n---\nQ-eins\n', 'Q-zwei\n']);
    fs.writeFileSync(path.join(w.root, 'Ziel.md'), '# Ziel\n');
    const res = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'file', path: `${teilName('Quelle', 2)}.md` },
    });
    expect(res.ok).toBe(true);
    const ziel = lies(path.join(w.root, 'Ziel.md'));
    expect(ziel).toBe('# Ziel\n---\ntitel: Q\n---\nQ-eins\nQ-zwei\n');
    expect(ziel).not.toContain('doc-part');
  });

  it('fehlt ein Teil der Quelle, hält der Schritt an und schreibt nichts', async () => {
    const w = welt();
    legeGeteilt(w.root, 'Quelle', ['Q-eins\n', 'Q-zwei\n', 'Q-drei\n']);
    fs.rmSync(path.join(w.root, `${teilName('Quelle', 2)}.md`));
    fs.writeFileSync(path.join(w.root, 'Ziel.md'), '# Ziel\n');
    const res = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'file', path: 'Quelle.md' },
    });
    expect(res).toEqual({
      ok: false,
      code: 'partsMissing',
      detail: { path: 'Quelle.md', teile: '2' },
    });
    expect(lies(path.join(w.root, 'Ziel.md'))).toBe('# Ziel\n');
  });

  // Zweitblick, Runde 2, Befund 1: Eine ungeteilte Quelle kommt wortgleich an,
  // auch ihr Dateikopf; vor der Behebung gab ihn die Bereinigung über die
  // YAML-Bibliothek neu aus oder ließ ihn ganz fallen.
  it.each([
    ['leerem Dateikopf', '---\n---\nQ-Text\n'],
    ['Kommentar im Dateikopf', '---\n# nur ein Kommentar\n---\nQ-Text\n'],
    ['gefülltem Dateikopf', '---\ntitel:   Q   # Notiz\nliste:\n  -   a\n---\nQ-Text\n'],
  ])('ungeteilte Quelle mit %s kommt byte-gleich an', async (_n, quelle) => {
    const w = welt();
    fs.writeFileSync(path.join(w.root, 'Quelle.md'), quelle);
    fs.writeFileSync(path.join(w.root, 'Ziel.md'), '# Ziel\n');
    const res = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'file', path: 'Quelle.md' },
    });
    expect(res.ok).toBe(true);
    expect(lies(path.join(w.root, 'Ziel.md'))).toBe(`# Ziel\n${quelle}`);
  });

  // Beleg der offenen Stelle (Kapitel «Lösung»): Bei einer GETEILTEN Quelle gibt
  // das Entfernen der Zuordnungs-Zeile den übrigen Dateikopf neu aus; Leerraum
  // und Listen-Einrückung werden normalisiert, ein Kommentar am Zeilenende bleibt.
  it('geteilte Quelle: der übrige Dateikopf kommt normalisiert an (offene Stelle)', async () => {
    const w = welt();
    // Die Kopf-Datei von Hand, damit ihr Dateikopf nicht schon beim Anlegen
    // normalisiert ist.
    const kopf = legeGeteilt(w.root, 'Quelle', ['Q-eins\n', 'Q-zwei\n']);
    const handschrift = '---\ntitel:   Q   # Notiz\nliste:\n  -   a\ndoc-part: v1|1|Quelle\n---\n';
    fs.writeFileSync(kopf, `${handschrift}Q-eins\n`);
    fs.writeFileSync(path.join(w.root, 'Ziel.md'), '# Ziel\n');
    const quelle = { source: { kind: 'file', path: 'Quelle.md' } };
    expect((await w.lauf('append', ['Ziel.md'], quelle)).ok).toBe(true);
    expect(lies(path.join(w.root, 'Ziel.md'))).toBe(
      '# Ziel\n---\ntitel: Q # Notiz\nliste:\n  - a\n---\nQ-eins\nQ-zwei\n',
    );
  });

  // Zweitblick, Runde 2, Befund 3: Hält ein Fenster die geteilte Quelle mit
  // ungespeichertem Stand, gilt dieser; der Index kennt ihn nur unter dem Pfad
  // der Kopf-Datei, genannt wird der Folgeteil.
  it('geteilte Quelle mit ungespeichertem Stand im Fenster: der Stand des Fensters gilt', async () => {
    const puffer = {};
    const w = welt({ puffer });
    const kopf = legeGeteilt(w.root, 'Quelle', ['Q-eins\n', 'Q-zwei\n']);
    puffer[kopf] = '---\ndoc-part: v1|1|Quelle\n---\nQ-eins\nQ-zwei\nungespeichert\n';
    fs.writeFileSync(path.join(w.root, 'Ziel.md'), '# Ziel\n');
    const res = await w.lauf('append', ['Ziel.md'], {
      source: { kind: 'file', path: `${teilName('Quelle', 2)}.md` },
    });
    expect(res.ok).toBe(true);
    expect(lies(path.join(w.root, 'Ziel.md'))).toBe('# Ziel\nQ-eins\nQ-zwei\nungespeichert\n');
  });
});

// Zweitblick, Runde 1, Befund 1: Ein Fenster führt ein geteiltes Dokument unter
// dem Pfad der Kopf-Datei. Der gestellte Index kennt den Besitzer deshalb nur
// unter diesem Pfad; ein Folgeteil als Ziel muss ihn trotzdem finden.
describe('Folgeteil als Ziel und ungespeicherter Stand im Fenster', () => {
  function weiche(besitzer) {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Notizen', ZWEITEILIG);
    const anfragen = [];
    const andere = { isDestroyed: () => false };
    const schritte = createWorkflowContentSteps({
      windows: new Map([[7, andere]]),
      backlinks: {
        bufferTextFor: () => null,
        bufferOwnerFor: (p) => (p === kopf ? besitzer : null),
      },
      resolveHistoryFor: async () => ({ effective: false }),
      recordMddOnSave: async () => {},
      bufferRequests: {
        request: async (fenster, pfad, edit) => {
          anfragen.push({ fenster, pfad, edit });
          return { ok: true, changed: true };
        },
      },
    });
    const ctx = { root, owner: {}, event: { sender: { id: 1 } }, workflowAbs: kopf };
    const vorher = bestand(root);
    const lauf = () =>
      schritte.runContentStep(ctx, {
        line: 2,
        keyword: 'replace',
        args: [`${teilName('Notizen', 2)}.md`, 'alt-2', 'neu-2'],
        source: null,
        position: null,
      });
    return { root, kopf, anfragen, andere, vorher, lauf };
  }
  const EDIT = { op: 'replace', search: 'alt-2', replacement: 'neu-2' };

  it('eigenes Fenster: Handgriff an den Puffer mit dem Pfad der Kopf-Datei, Platte unberührt', async () => {
    const w = weiche(1);
    expect(await w.lauf()).toEqual({
      ok: true,
      window: { action: 'editOwnBuffer', path: w.kopf, edit: EDIT },
    });
    expect(bestand(w.root)).toEqual(w.vorher);
  });

  it('fremdes Fenster: Auftrag dorthin mit dem Pfad der Kopf-Datei, Platte unberührt', async () => {
    const w = weiche(7);
    const res = await w.lauf();
    expect(res).toEqual({
      ok: true,
      effect: { kind: 'edited', paths: [w.kopf], via: 'otherBuffer' },
    });
    expect(w.anfragen).toEqual([{ fenster: w.andere, pfad: w.kopf, edit: EDIT }]);
    expect(bestand(w.root)).toEqual(w.vorher);
  });

  it('ohne Besitzer: auf die Platte, die Stelle im zweiten Teil', async () => {
    const w = weiche(null);
    const res = await w.lauf();
    expect(res.effect).toEqual({ kind: 'edited', paths: [w.kopf], via: 'disk' });
    expect(lies(path.join(w.root, `${teilName('Notizen', 2)}.md`))).toContain('neu-2');
    expect(w.anfragen).toEqual([]);
  });
});

describe('Fehlender Teil: der Lauf hält an und schreibt nichts (AK4)', () => {
  it('partsMissing mit Pfad und Position, kein Byte geändert', async () => {
    const w = welt();
    legeGeteilt(w.root, 'Notizen', ['# Eins\n', '# Zwei\n', '# Drei\n']);
    fs.rmSync(path.join(w.root, `${teilName('Notizen', 2)}.md`));
    const vorher = bestand(w.root);
    const res = await w.lauf('append', ['Notizen.md'], VORLAGE('- neu'));
    expect(res).toEqual({
      ok: false,
      code: 'partsMissing',
      detail: { path: 'Notizen.md', teile: '2' },
    });
    expect(bestand(w.root)).toEqual(vorher);
    expect(w.historien).toEqual([]);
  });
});

describe('Lauf-Marke an jedem geschriebenen Teil (AK5)', () => {
  it('der geänderte und der neue Teil tragen die Lauf-Marke, keiner die Selbst-Schreib-Marke', async () => {
    const w = welt();
    legeGeteilt(w.root, 'Lang', ['# Eins\n', abschnitte('Zwei', DOKUMENT_SCHWELLE - 3000)]);
    const zweiter = path.join(w.root, `${teilName('Lang', 2)}.md`);
    const dritter = path.join(w.root, `${teilName('Lang', 3)}.md`);
    const zweiterVorher = lies(zweiter);
    const res = await w.lauf('append', ['Lang.md'], VORLAGE(abschnitte('Drei', 30000)));
    expect(res.ok).toBe(true);
    expect(lies(zweiter)).not.toBe(zweiterVorher);
    for (const [typ, p] of [
      ['file-changed', zweiter],
      ['file-created', dritter],
    ]) {
      expect(await selbstSchreib.istLaufSchreibvorgang({ type: typ, path: p })).toBe(true);
      expect(selbstSchreib._hat(p)).toBe(false);
    }
  });

  it('der Ereignis-Prüfer stellt für die geschriebenen Teile nichts zu, für eine fremde Änderung schon', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Notizen', ['# Eins\nalt\n', '# Zwei\nalt\n'], 'Eingang');
    const zweiter = path.join(w.root, 'Eingang', `${teilName('Notizen', 2)}.md`);
    const wf = path.join(w.root, 'Workflows', 'Wache.md');
    const wfText = [
      '---',
      'workflow: true',
      'name: Wache',
      'trigger: event',
      'event: file-changed in "Eingang"',
      '---',
      '',
      '```workflow',
      'notify "Lauf"',
      '```',
      '',
    ].join('\n');
    const zugestellt = [];
    const pruefer = createWorkflowEventChecker({
      areas: () => [{ root: w.root }],
      workflowFiles: () => ({
        status: 'ready',
        dateien: [{ absPath: wf, relPath: 'Workflows/Wache.md' }],
      }),
      readText: async () => wfText,
      readRunState: async () => ({
        stand: {
          runs: 0,
          lastRun: null,
          armed: { at: '2026-11-14T08:00:00Z', hash: definitionsPruefsumme(wfText) },
          nextDue: null,
          skipped: null,
        },
        defekt: false,
      }),
      enabled: () => true,
      deliver: (nutzlast) => zugestellt.push(...nutzlast.items),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      istLaufSchreibvorgang: selbstSchreib.istLaufSchreibvorgang,
    });
    const wartet = async () => {
      await pruefer.idle();
      await vi.advanceTimersByTimeAsync(ENTPRELL_MS * 2);
      await pruefer.idle();
    };
    try {
      // Die Ersetzung trifft beide Teile; geschrieben werden Kopf-Datei und Folgeteil.
      expect((await w.lauf('replace', ['Eingang/Notizen.md', 'alt', 'neu'])).ok).toBe(true);
      pruefer.report({ type: 'file-changed', path: kopf });
      pruefer.report({ type: 'file-changed', path: zweiter });
      await wartet();
      expect(zugestellt).toEqual([]);
      // Gegenprobe: eine Änderung von außen am zweiten Teil löst aus.
      fs.writeFileSync(zweiter, `${lies(zweiter)}von außen\n`);
      pruefer.report({ type: 'file-changed', path: zweiter });
      await wartet();
      // Unbeansprucht kommt dieselbe Fälligkeit im Warte-Takt erneut; gezählt
      // werden deshalb die verschiedenen Fälligkeiten.
      const faellig = [...new Map(zugestellt.map((i) => [i.key, i.event.file])).values()];
      expect(faellig).toEqual([zweiter]);
    } finally {
      pruefer.stop();
    }
  });
});

describe('Geteilte Tabellen-Datei über 0,7 MB (AK3)', () => {
  it('append am Ende, insert und replace in einem späteren Teil, set-property an der Kopf-Datei', async () => {
    const w = welt();
    const kopf = await legeZerlegt(w.root, 'Daten', tabelle(800));
    const teile = fs.readdirSync(w.root).filter((n) => n.endsWith('.md'));
    expect(teile.length).toBeGreaterThan(1);
    const angehaengt = await w.lauf('append', ['Daten.md'], VORLAGE('## Anhang\nNachsatz'));
    expect(angehaengt.ok).toBe(true);
    const eingefuegt = await w.lauf('insert', ['Daten.md'], {
      ...VORLAGE('- eingefügt'),
      position: { kind: 'under', heading: 'Anhang' },
    });
    expect(eingefuegt.ok).toBe(true);
    expect((await w.lauf('replace', ['Daten.md', '| Name 790\n', '| Neu 790\n'])).ok).toBe(true);
    expect((await w.lauf('set-property', ['Daten.md', 'notiz', 'ja'])).ok).toBe(true);
    const text = await w.gesamt(kopf);
    expect(text.endsWith('```\n## Anhang\n- eingefügt\nNachsatz\n')).toBe(true);
    expect(lies(kopf)).not.toContain('Nachsatz');
    expect(text).toContain('| Neu 790\n');
    expect(lies(kopf)).toContain('notiz: ja');
    expect(lies(kopf)).not.toContain('| Neu 790');
  });
});

describe('Erstes Überschreiten der Schwelle (AK8)', () => {
  it('ein gewöhnliches Dokument wird ungeteilt geschrieben, ohne Halt', async () => {
    const w = welt();
    const pfad = path.join(w.root, 'Gross.md');
    fs.writeFileSync(pfad, abschnitte('Teil', DOKUMENT_SCHWELLE - 5000));
    expect(byteLength(lies(pfad))).toBeLessThan(DOKUMENT_SCHWELLE);
    const res = await w.lauf('append', ['Gross.md'], VORLAGE(`# Anhang\n${'y'.repeat(20000)}`));
    expect(res.ok).toBe(true);
    expect(byteLength(lies(pfad))).toBeGreaterThan(DOKUMENT_SCHWELLE);
    expect(readPartLine(lies(pfad))).toBeNull();
    expect(fs.readdirSync(w.root)).toEqual(['Gross.md']);
  });

  it('eine Tabellen-Datei wird geteilt wie beim Speichern von Hand', async () => {
    const w = welt();
    const pfad = path.join(w.root, 'Daten.md');
    fs.writeFileSync(pfad, tabelle(680));
    expect(byteLength(lies(pfad))).toBeLessThan(ABLAGE_SCHWELLE);
    const res = await w.lauf('replace', ['Daten.md', '| Name 1\n', `| ${'z'.repeat(60000)}\n`]);
    expect(res.ok).toBe(true);
    expect(readPartLine(lies(pfad))).toEqual(expect.objectContaining({ index: 1, base: 'Daten' }));
    expect(fs.existsSync(path.join(w.root, `${teilName('Daten', 2)}.md`))).toBe(true);
  });
});

describe('Schreibweg: Reihenfolge, Sicherung und Historie (AK2)', () => {
  function schreibweg({ historie }) {
    const spur = [];
    const weg = createPlattenSchreibweg({
      resolveHistoryFor: async () => {
        spur.push({ schritt: 'historie?' });
        return { effective: historie };
      },
      recordMddOnSave: async (_owner, p, vorher, nachher) => {
        spur.push({
          schritt: 'historie',
          p,
          gleich: vorher === nachher,
          platte: bestandOhneMdd(p),
        });
      },
    });
    return { spur, weg };
  }
  const bestandOhneMdd = (p) => bestand(path.dirname(p)).filter(([n]) => n.endsWith('.md'));

  // Ein Dokument, dessen letzter Teil durch das Anhängen die Schwelle reißt:
  // Der zweite Teil ändert sich, ein dritter entsteht — zwei Dateien.
  function wachsend(root) {
    return legeGeteilt(root, 'Lang', ['# Eins\n', abschnitte('Zwei', DOKUMENT_SCHWELLE - 3000)]);
  }
  const ANHANG = { op: 'append', text: abschnitte('Drei', 30000) };

  it('ohne Historie: alter Gesamt-Stand gesichert, BEVOR geschrieben wird, danach kein Eintrag', async () => {
    const root = wegwerfWurzel();
    const kopf = wachsend(root);
    const alt = (await readStateForSave(kopf)).text;
    const vorher = bestandOhneMdd(kopf);
    const { spur, weg } = schreibweg({ historie: false });
    const res = await weg.schreibeBearbeitung(
      { owner: {}, root },
      { abs: kopf, rel: 'Lang.md' },
      ANHANG,
    );
    expect(res.ok).toBe(true);
    expect(spur.map((s) => s.schritt)).toEqual(['historie?', 'historie']);
    expect(spur[1]).toMatchObject({ p: kopf, gleich: true, platte: vorher });
    expect(fs.existsSync(path.join(root, `${teilName('Lang', 3)}.md`))).toBe(true);
    expect((await readStateForSave(kopf)).text).toBe(`${alt}${ANHANG.text}`);
  });

  it('mit Historie: genau ein Eintrag NACH dem Schreiben, mit altem und neuem Stand', async () => {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Notizen', ZWEITEILIG);
    const vorher = bestandOhneMdd(kopf);
    const { spur, weg } = schreibweg({ historie: true });
    const edit = { op: 'replace', search: 'alt-2', replacement: 'neu-2' };
    expect((await weg.schreibeBearbeitung({ owner: {}, root }, { abs: kopf }, edit)).ok).toBe(true);
    expect(spur.map((s) => s.schritt)).toEqual(['historie?', 'historie']);
    expect(spur[1].gleich).toBe(false);
    expect(spur[1].platte).not.toEqual(vorher);
  });
});

describe('Wächter: gleich lesen, gleich schreiben wie file:save (AK2)', () => {
  function speicherKanal() {
    const handlers = new Map();
    registerFilesIpc((k, fn) => handlers.set(k, fn), {
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      senderWindow: () => ({ id: 1 }),
      areaOfWindow: () => null,
      tForWindow: (_win, k) => k,
      isMddPath: (p) => /\.mdd$/i.test(p),
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
    });
    return handlers;
  }
  const EREIGNIS = { sender: { id: 1 } };

  const geteilt = (rumpfe) => async (root, ordner) => legeGeteilt(root, 'Doku', rumpfe(), ordner);
  it.each([
    ['eine Stelle im zweiten Teil', geteilt(() => ZWEITEILIG), ['replace', 'alt-2', 'neu-2']],
    [
      'Wachsen über die Schwelle mit neuem Teil',
      geteilt(() => ['# Eins\n', abschnitte('Zwei', DOKUMENT_SCHWELLE - 3000)]),
      ['append'],
    ],
    [
      'geteilte Tabellen-Datei, Stelle in einem späteren Teil',
      (root, ordner) => legeZerlegt(path.join(root, ordner), 'Doku', tabelle(800)),
      ['replace', '| Name 790\n', '| Neu 790\n'],
    ],
  ])('%s: dieselben Teil-Dateien, derselbe Inhalt, derselbe Katalog', async (_n, lege, schritt) => {
    const w = welt();
    const kanal = speicherKanal();
    const a = path.join(w.root, 'A');
    const b = path.join(w.root, 'B');
    const kopfA = await lege(w.root, 'A');
    const kopfB = await lege(w.root, 'B');
    // Lesen: der Workflow-Weg und file:read sehen denselben zusammengesetzten Stand.
    const gelesen = await kanal.get('file:read')(EREIGNIS, kopfB);
    expect(gelesen.content).toBe(await w.gesamt(kopfA));
    const [keyword, ...args] = schritt;
    const extra = keyword === 'append' ? VORLAGE(abschnitte('Drei', 30000)) : {};
    expect((await w.lauf(keyword, ['A/Doku.md', ...args], extra)).ok).toBe(true);
    const neu = await w.gesamt(kopfA);
    const gespeichert = await kanal.get('file:save')(EREIGNIS, kopfB, neu);
    expect(gespeichert.ok).toBe(true);
    expect(bestand(a)).toEqual(bestand(b));
    expect(bestand(a).length).toBeGreaterThan(2);
  });
});

// Sicherheits-Review, Runde 1 (blockierend): Der Grundname der Zuordnungs-Zeile
// ist Dokument-Inhalt. Zeigt er aus dem Ordner der genannten Datei heraus, hält
// jeder Weg mit `outsideArea` an, bevor außerhalb gelesen oder geschrieben wird.
// Jeder Fall legt eine echte Datei AUSSERHALB der Bereichs-Wurzel an und sichert,
// dass sie byte-gleich bleibt und ihr Inhalt nirgends im Bereich landet.
describe('Grenze: Zuordnungs-Zeile mit Pfad-Ausbruch (Sicherheits-Review, Runde 1)', () => {
  const GEHEIM = 'AUSSEN-GEHEIM';
  const AUSSEN_TEXT = `---\nstatus: offen\n---\n# Außen\n${GEHEIM}\n- [ ] Aussen-Aufgabe\n`;

  function lage() {
    const w = welt();
    const aussen = wegwerfWurzel();
    const ziel = path.join(aussen, 'Ziel.md');
    fs.writeFileSync(ziel, AUSSEN_TEXT);
    fs.mkdirSync(path.join(w.root, 'Unter'));
    fs.writeFileSync(path.join(w.root, 'Unter', 'Ziel.md'), AUSSEN_TEXT);
    const ohneEndung = ziel.slice(0, -'.md'.length);
    const basen = {
      'Schrägstrich ../': path.relative(w.root, ohneEndung).split(path.sep).join('/'),
      'Rückstrich ..\\': path.relative(w.root, ohneEndung).split(path.sep).join('\\'),
      'absoluter Pfad': ohneEndung,
      Unterordner: 'Unter/Ziel',
    };
    const notiz = (base) =>
      fs.writeFileSync(
        path.join(w.root, 'Notiz.md'),
        `---\ndoc-part: ${JSON.stringify(`v1|2|${base}`)}\n---\n# Notiz\n`,
      );
    const unberuehrt = () => {
      expect(lies(ziel)).toBe(AUSSEN_TEXT);
      expect(lies(path.join(w.root, 'Unter', 'Ziel.md'))).toBe(AUSSEN_TEXT);
      for (const name of fs.readdirSync(w.root)) {
        const p = path.join(w.root, name);
        if (fs.statSync(p).isFile() && name !== 'Notiz.md') expect(lies(p)).not.toContain(GEHEIM);
      }
    };
    const backlinks = { bufferTextFor: () => null, bufferOwnerFor: () => null };
    const ctx = { root: w.root, owner: {}, event: { sender: { id: 1 } }, backlinks };
    const schritt = (keyword, args) => ({ line: 1, blockLine: 1, keyword, args });
    return {
      w,
      basen,
      notiz,
      unberuehrt,
      ifProperty: () =>
        createWorkflowBlockQueries({ backlinks }).runQueryStep(
          ctx,
          schritt('if-property', ['Notiz.md', 'status', 'offen']),
        ),
      completeTask: () =>
        createWorkflowMaintenanceSteps({ backlinks }).runMaintenanceStep(
          ctx,
          schritt('complete-task', ['Notiz.md', 'Aussen-Aufgabe']),
        ),
    };
  }
  const AUSSERHALB = { ok: false, code: 'outsideArea', detail: { path: 'Notiz.md' } };
  const ARTEN = ['Schrägstrich ../', 'Rückstrich ..\\', 'absoluter Pfad', 'Unterordner'];

  it.each(ARTEN)('append an die Platte hält an (%s)', async (art) => {
    const l = lage();
    l.notiz(l.basen[art]);
    const vorher = lies(path.join(l.w.root, 'Notiz.md'));
    expect(await l.w.lauf('append', ['Notiz.md'], VORLAGE('- neu'))).toEqual(AUSSERHALB);
    expect(lies(path.join(l.w.root, 'Notiz.md'))).toBe(vorher);
    l.unberuehrt();
  });

  it.each(ARTEN)('from-file liest nicht außerhalb (%s)', async (art) => {
    const l = lage();
    l.notiz(l.basen[art]);
    fs.writeFileSync(path.join(l.w.root, 'Ergebnis.md'), '# Ergebnis\n');
    const res = await l.w.lauf('append', ['Ergebnis.md'], {
      source: { kind: 'file', path: 'Notiz.md' },
    });
    expect(res).toEqual(AUSSERHALB);
    expect(lies(path.join(l.w.root, 'Ergebnis.md'))).toBe('# Ergebnis\n');
    l.unberuehrt();
  });

  it.each(ARTEN)('if-property und complete-task lesen nicht außerhalb (%s)', async (art) => {
    const l = lage();
    l.notiz(l.basen[art]);
    expect(await l.ifProperty()).toEqual(AUSSERHALB);
    expect(await l.completeTask()).toEqual(AUSSERHALB);
    l.unberuehrt();
  });

  // 4T-002811, Zweitblick Runde 2: Die Workflows prüfen den Grundnamen mit der
  // gemeinsamen Regel isBlankPartBase. Ein Steuerzeichen im Grundnamen weist
  // nur diese Regel ab; bekäme der Workflow-Weg wieder eine eigene, weitere
  // Fassung, liefe der Schritt bis zum fehlenden Teil statt an der Grenze.
  it('ein Steuerzeichen im Grundnamen hält an der Grenze an (gemeinsame Regel)', async () => {
    const l = lage();
    l.notiz('Ziel\u0007');
    const vorher = lies(path.join(l.w.root, 'Notiz.md'));
    expect(await l.w.lauf('append', ['Notiz.md'], VORLAGE('- neu'))).toEqual(AUSSERHALB);
    expect(lies(path.join(l.w.root, 'Notiz.md'))).toBe(vorher);
    l.unberuehrt();
  });

  // Ein Verweis im Ordner des Dokuments, der aus dem Bereich führt. Unter
  // Windows ohne Entwickler-Modus darf ein Prozess keine Datei-Verweise anlegen;
  // dann entfällt der Fall, die Prüfung des echten Orts deckt ihn trotzdem ab.
  const verweisMoeglich = (() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-verweis-'));
    try {
      fs.writeFileSync(path.join(dir, 'a'), 'a');
      fs.symlinkSync(path.join(dir, 'a'), path.join(dir, 'b'), 'file');
      return true;
    } catch {
      return false;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })();

  // Einordnung: Ohne die Grenz-Prüfung hielte dieser Weg ebenfalls an, aber mit
  // dem Code für fehlende Teile, weil der Lese-Weg der Teile Verweise nicht als
  // Datei zählt; der Fall hält fest, dass der Halt die Grenze nennt und außen
  // nichts berührt wird.
  it.skipIf(!verweisMoeglich)('ein Teil als Verweis nach außen hält an', async () => {
    const l = lage();
    const kopf = legeGeteilt(l.w.root, 'Doku', ['# Eins\n', '# Zwei\n']);
    const teil2 = path.join(l.w.root, `${teilName('Doku', 2)}.md`);
    const aussenTeil = path.join(path.dirname(l.basen['absoluter Pfad']), 'Teil.md');
    fs.writeFileSync(aussenTeil, writePartLine(`# ${GEHEIM}\n`, { index: 2, base: 'Doku' }).text);
    const aussenVorher = lies(aussenTeil);
    fs.rmSync(teil2);
    fs.symlinkSync(aussenTeil, teil2, 'file');
    const res = await l.w.lauf('append', ['Doku.md'], VORLAGE('- neu'));
    expect(res).toMatchObject({ ok: false, code: 'outsideArea' });
    expect(lies(kopf)).not.toContain('- neu');
    expect(fs.lstatSync(teil2).isSymbolicLink()).toBe(true);
    expect(lies(aussenTeil)).toBe(aussenVorher);
  });

  // Gutfall: Punkt, Leerzeichen und Umlaut im Grundnamen sind kein Ausbruch;
  // unter Windows auch nicht eine andere Groß-Klein-Schreibung des Pfads.
  it('ein geteiltes Dokument mit Punkt, Leerzeichen und Umlaut im Namen läuft durch', async () => {
    const w = welt();
    const kopf = legeGeteilt(w.root, 'Bericht v1.2 Ä', ['# Eins\n', '# Zwei\n']);
    const namen = ['Bericht v1.2 Ä.md'];
    if (process.platform === 'win32') namen.push('bericht V1.2 ä.md');
    for (const name of namen) {
      expect(await w.lauf('append', [name], VORLAGE(`- ${name}`))).toMatchObject({ ok: true });
      expect(await w.gesamt(kopf)).toContain(`- ${name}\n`);
    }
  });

  // Sicherheits-Review, Runde 2 (Hinweis 2): Eine fremde Nachbar-Datei mit
  // demselben Namens-Anfang gehört nicht zum Dokument; zeigt sie als Verweis
  // nach außen, hält das gewöhnliche geteilte Dokument daneben nicht an.
  it.skipIf(!verweisMoeglich)(
    'ein fremder Nachbar-Verweis hält das Dokument nicht an',
    async () => {
      const l = lage();
      const kopf = legeGeteilt(l.w.root, 'Doku', ['# Eins\n', '# Zwei\n']);
      const aussen = path.join(path.dirname(l.basen['absoluter Pfad']), 'Nachbar.md');
      fs.writeFileSync(aussen, `# ${GEHEIM}\n`);
      fs.symlinkSync(aussen, path.join(l.w.root, 'Doku.alt.md'), 'file');
      const res = await l.w.lauf('append', ['Doku.md'], VORLAGE('- neu'));
      expect(res).toMatchObject({ ok: true });
      expect(lies(kopf) + lies(path.join(l.w.root, `${teilName('Doku', 2)}.md`))).toContain(
        '- neu',
      );
      expect(lies(aussen)).toBe(`# ${GEHEIM}\n`);
    },
  );

  // Sicherheits-Review, Runde 3: Fehlt eine Kopf-Datei mit Markdown-Endung,
  // bildet der Lese-Weg den Kopf-Pfad mit der Endung des genannten Ziels.
  it.skipIf(!verweisMoeglich)('ein Kopf-Verweis mit der Endung des Ziels hält an', async () => {
    const l = lage();
    const aussen = path.join(path.dirname(l.basen['absoluter Pfad']), 'Kopf.txt');
    fs.writeFileSync(aussen, `# ${GEHEIM}\n`);
    fs.symlinkSync(aussen, path.join(l.w.root, 'Geheim.txt'), 'file');
    const folge = writePartLine('# Zwei\n', { index: 2, base: 'Geheim' }).text;
    fs.writeFileSync(path.join(l.w.root, 'notiz.txt'), folge);
    // Trennkraft: Ohne die Endung des Ziels in der Vorab-Prüfung hielte der Lauf
    // ebenfalls an, aber erst NACH dem Lesen des Verweises. Belegt wird deshalb,
    // dass die Datei hinter dem Verweis nie gelesen wird.
    const lesen = vi.spyOn(require('node:fs/promises'), 'readFile');
    let gelesen;
    let res;
    try {
      res = await l.w.lauf('append', ['notiz.txt'], VORLAGE('- neu'));
      gelesen = lesen.mock.calls.map((c) => path.basename(String(c[0])));
    } finally {
      lesen.mockRestore();
    }
    expect(res).toMatchObject({ ok: false, code: 'outsideArea' });
    expect(gelesen).toContain('notiz.txt');
    expect(gelesen).not.toContain('Geheim.txt');
    expect(lies(aussen)).toBe(`# ${GEHEIM}\n`);
  });
});
