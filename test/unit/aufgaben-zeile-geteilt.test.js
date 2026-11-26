// 4T-002813 (Epic 3E-000444): Das Abhaken einer Aufgabe ohne offenes Fenster
// trifft auch spätere Teile eines in Teile zerlegten Dokuments. Geprüft wird
// der Kanal `task:applyLineEdit` (src/main/ipc/index-views.js, Rumpf in
// src/main/ipc/aufgaben-zeile-schreiben.js) am echten Dateisystem: Eine Datei
// eines geteilten Dokuments meint das ganze Dokument, gelesen, gegengeprüft
// und geschrieben wie beim Schreibweg der Text-Befehle, die Historie unter der
// Kopf-Datei; eine gewöhnliche Datei bleibt byte-genau auf dem bisherigen Weg.
// Schreibt der Kanal nur einen Folgeteil, meldet er die Änderung selbst unter
// dem Pfad der Kopf-Datei, und das Abhaken durch `complete-task` in einem
// Folgeteil löst den Auslöser «Aufgabe erledigt» nicht selbst aus (Nacharbeit).
//
// Doppelte Aufgaben-Texte sind Absicht: Der Kern sucht bei einer nicht
// passenden Zeile den Text eindeutig im ganzen Dokument. Steht er zweimal da,
// endet eine falsch umgerechnete Zeile im Konflikt, statt zufällig zu treffen.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backlinks = require('../../src/main/backlinks.js');
const { registerIndexViewsIpc } = require('../../src/main/ipc/index-views.js');
const { parseFile } = require('../../src/main/index/parse.js');
const { writePartLine, PART_SEP, PART_INFIX } = require('../../src/shared/document-parts.js');
const { readStateForSave, mddPathFor } = require('../../src/main/documents/document-parts-io.js');
const { emptyContainer, serializeContainer } = require('../../src/main/documents/mdd-store.js');
const {
  createWorkflowMaintenanceSteps,
} = require('../../src/main/workflows/workflow-maintenance-steps.js');
const selbstSchreib = require('../../src/main/documents/self-write.js');
const {
  attachAufgabenUmgebung,
  meldePlatte,
  _spiegelLeeren,
} = require('../../src/main/index/aufgaben-erledigt.js');
const { abonniereWorkflowEreignisse } = require('../../src/main/checks/workflow-event-check.js');

let tmpDirs = [];

afterEach(() => {
  selbstSchreib._laufLeeren();
  selbstSchreib._leeren();
  _spiegelLeeren();
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
const teilPfad = (root, grund, n) => path.join(root, `${teilName(grund, n)}.md`);

function wegwerfWurzel() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zeile-geteilt-'));
  tmpDirs.push(root);
  return root;
}

// Legt ein geteiltes Dokument an; `rumpfe[i]` ist der Rumpf von Teil i+1, ein
// `null` lässt den Teil aus. Dazu eine leere Begleitdatei (Vorbild
// workflow-geteilte-schreibziel.test.js).
function legeGeteilt(root, grund, rumpfe, base = grund) {
  const kopf = path.join(root, `${grund}.md`);
  rumpfe.forEach((rumpf, i) => {
    if (rumpf === null) return;
    const name = i === 0 ? `${grund}.md` : `${teilName(grund, i + 1)}.md`;
    const teilBase = i === 0 ? grund : base;
    fs.writeFileSync(
      path.join(root, name),
      writePartLine(rumpf, { index: i + 1, base: teilBase }).text,
    );
  });
  fs.writeFileSync(mddPathFor(kopf), serializeContainer(emptyContainer()));
  return kopf;
}

// Alle Dateien eines Ordners mit Inhalt, nach Name geordnet.
function bestand(dir) {
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => [name, lies(path.join(dir, name))]);
}

// Die Zeile einer Aufgabe, wie der Index sie für die Abfrage führt.
function indexZeile(datei, text, nr = 0) {
  return parseFile(datei).tasks.filter((t) => t.text === text)[nr].zeile;
}

const OWNER = { id: 'fenster' };

// Der Kanal mit Attrappen für Historie und Fenster; Wurzel ist der Bereich.
function kanal(root) {
  const handlers = new Map();
  const deps = {
    senderWindow: () => OWNER,
    areaOfWindow: () => null,
    areaRootForEvent: () => root,
    getStore: () => null,
    backlinks,
    collectAreaStats: () => null,
    sucheImBereich: () => null,
    gibBereichsVorratFrei: () => {},
    readAreaProfilesConfig: () => null,
    resolveAreaStartPage: () => null,
    resolveHistoryFor: vi.fn(async () => ({ effective: true })),
    readPreviousTextFor: async (p) => lies(p),
    recordMddOnSave: vi.fn(async () => {}),
    meldeDateiAenderung: vi.fn(() => 1),
  };
  registerIndexViewsIpc((name, fn) => handlers.set(name, fn), deps);
  const fn = handlers.get('task:applyLineEdit');
  return { deps, schreibe: (params) => fn({ sender: { id: 1 } }, params) };
}

const abgehakt = (text) => text.replace('- [ ]', '- [x]');
const BROT = '- [ ] Brot kaufen';

describe('task:applyLineEdit an einem geteilten Dokument (4T-002813)', () => {
  it('(a) Abhaken aus der Abfrage in einem Folgeteil, mit dem Pfad des Folgeteils', async () => {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, `# Zwei\nText\n${BROT}\n`]);
    const teil2 = teilPfad(root, 'Doku', 2);
    const kopfVorher = lies(kopf);
    const ganzVorher = (await readStateForSave(kopf)).text;
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: teil2,
      line: indexZeile(teil2, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: true });
    expect(lies(teil2)).toContain(`Text\n${abgehakt(BROT)}\n`);
    expect(lies(kopf)).toBe(kopfVorher);
    // Die Historie unter der Kopf-Datei, mit dem ganzen Dokument davor und danach.
    const ganzNachher = (await readStateForSave(kopf)).text;
    expect(k.deps.resolveHistoryFor).toHaveBeenCalledWith(OWNER, kopf, ganzNachher);
    expect(k.deps.recordMddOnSave).toHaveBeenCalledTimes(1);
    expect(k.deps.recordMddOnSave).toHaveBeenCalledWith(OWNER, kopf, ganzVorher, ganzNachher);
    // Nur der Folgeteil geschrieben: Die Meldung an die Fenster trägt den Kopf-Pfad.
    expect(k.deps.meldeDateiAenderung).toHaveBeenCalledTimes(1);
    expect(k.deps.meldeDateiAenderung).toHaveBeenCalledWith(kopf);
  });

  it('(b) complete-task in einem Folgeteil, mit dem Kopf-Pfad und der Zeile des Ganzen', async () => {
    const root = wegwerfWurzel();
    const MILCH = '- [ ] Milch holen';
    const kopf = legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, `# Zwei\n${MILCH}\n`]);
    const teil2 = teilPfad(root, 'Doku', 2);
    const kopfVorher = lies(kopf);
    const ganzVorher = (await readStateForSave(kopf)).text;
    const ctx = { root, owner: {}, event: { sender: { id: 1 } }, backlinks };
    const schritt = await createWorkflowMaintenanceSteps({ backlinks }).runMaintenanceStep(ctx, {
      line: 1,
      blockLine: 1,
      keyword: 'complete-task',
      args: ['Doku.md', 'Milch'],
    });
    expect(schritt).toMatchObject({ ok: true, window: { action: 'completeTask', path: kopf } });
    // Ohne Fenster schreibt der Handgriff über den Kanal (toggleTaskFromQuery).
    const { path: pfad, line, taskText } = schritt.window;
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: pfad,
      line,
      expectedText: taskText,
      newText: abgehakt(taskText),
    });
    expect(res).toMatchObject({ ok: true, line });
    expect(lies(teil2)).toContain(abgehakt(MILCH));
    expect(lies(kopf)).toBe(kopfVorher);
    const ganzNachher = (await readStateForSave(kopf)).text;
    expect(k.deps.recordMddOnSave).toHaveBeenCalledWith(OWNER, kopf, ganzVorher, ganzNachher);
    expect(k.deps.meldeDateiAenderung).toHaveBeenCalledTimes(1);
    expect(k.deps.meldeDateiAenderung).toHaveBeenCalledWith(kopf);
  });

  it('(c) eine Aufgabe in der Kopf-Datei, derselbe Text auch im Folgeteil', async () => {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, `# Zwei\n${BROT}\n`]);
    const teil2 = teilPfad(root, 'Doku', 2);
    const teil2Vorher = lies(teil2);
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: kopf,
      line: indexZeile(kopf, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: true });
    expect(lies(kopf)).toContain(`# Eins\n${abgehakt(BROT)}\n`);
    expect(lies(teil2)).toBe(teil2Vorher);
    expect(k.deps.recordMddOnSave.mock.calls[0][1]).toBe(kopf);
    // Die Kopf-Datei geschrieben: Ihre Beobachtung meldet selbst.
    expect(k.deps.meldeDateiAenderung).not.toHaveBeenCalled();
  });

  it('(d) eine gewöhnliche Datei mit CRLF und Byte-Order-Zeichen bleibt byte-genau', async () => {
    const root = wegwerfWurzel();
    const datei = path.join(root, 'Einfach.md');
    const bom = '\uFEFF';
    fs.writeFileSync(datei, `${bom}# Titel\r\n${BROT}\r\n- [ ] Rest\r\n`, 'utf8');
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: datei,
      line: indexZeile(datei, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: true, line: 2 });
    expect(lies(datei)).toBe(`${bom}# Titel\r\n${abgehakt(BROT)}\r\n- [ ] Rest\r\n`);
    expect(k.deps.recordMddOnSave.mock.calls[0][1]).toBe(datei);
    expect(k.deps.meldeDateiAenderung).not.toHaveBeenCalled();
  });

  it('(e) ein abweichender erwarteter Text ergibt den Konflikt, nichts wird geschrieben', async () => {
    const root = wegwerfWurzel();
    legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, `# Zwei\n${BROT}\n`]);
    const teil2 = teilPfad(root, 'Doku', 2);
    const vorher = bestand(root);
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: teil2,
      line: indexZeile(teil2, BROT),
      expectedText: '- [ ] Käse holen',
      newText: '- [x] Käse holen',
    });
    expect(res).toEqual({ ok: false, reason: 'missing' });
    expect(bestand(root)).toEqual(vorher);
    expect(k.deps.recordMddOnSave).not.toHaveBeenCalled();
    expect(k.deps.meldeDateiAenderung).not.toHaveBeenCalled();
  });

  it('(f) fehlt ein Teil, wird nichts geschrieben', async () => {
    const root = wegwerfWurzel();
    legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, null, `# Drei\n${BROT}\n`]);
    const teil3 = teilPfad(root, 'Doku', 3);
    const vorher = bestand(root);
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: teil3,
      line: indexZeile(teil3, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: false, error: 'partsMissing' });
    expect(bestand(root)).toEqual(vorher);
    expect(k.deps.recordMddOnSave).not.toHaveBeenCalled();
  });
});

describe('Lauf-Marke von complete-task in einem Folgeteil (4T-002813, Nacharbeit)', () => {
  // Die Meldung des Beobachters für eine Datei nachstellen (Vorbild
  // workflow-task-done.test.js): Aufgaben-Zeilen davor und danach.
  async function beobachte(datei, vorher) {
    const meldungen = [];
    const abmelden = abonniereWorkflowEreignisse((m) => {
      if (m.type === 'task-done') meldungen.push(m);
    });
    try {
      await meldePlatte(path.dirname(datei), datei, vorher, parseFile(datei).tasks);
    } finally {
      abmelden();
    }
    return meldungen;
  }

  it('(h) das Abhaken im Folgeteil löst «Aufgabe erledigt» nicht selbst aus', async () => {
    attachAufgabenUmgebung(null);
    const root = wegwerfWurzel();
    const MILCH = '- [ ] Milch holen';
    const rumpfe = [`# Eins\n${BROT}\n`, `# Zwei\n${MILCH}\n`, `# Drei\n${BROT}\n`];
    legeGeteilt(root, 'Doku', rumpfe);
    const teil2 = teilPfad(root, 'Doku', 2);
    const teil3 = teilPfad(root, 'Doku', 3);
    const vorher2 = parseFile(teil2).tasks;
    const ctx = { root, owner: {}, event: { sender: { id: 1 } }, backlinks };
    const schritt = await createWorkflowMaintenanceSteps({ backlinks }).runMaintenanceStep(ctx, {
      line: 1,
      blockLine: 1,
      keyword: 'complete-task',
      args: ['Doku.md', 'Milch'],
    });
    expect(schritt).toMatchObject({ ok: true, window: { action: 'completeTask' } });
    const { path: pfad, line, taskText } = schritt.window;
    const res = await kanal(root).schreibe({
      filePath: pfad,
      line,
      expectedText: taskText,
      newText: abgehakt(taskText),
    });
    expect(res).toMatchObject({ ok: true });
    expect(lies(teil2)).toContain(abgehakt(MILCH));
    // Die Meldung des Folgeteils gehört zum Lauf, ebenso seine Datei-Meldung.
    expect(await beobachte(teil2, vorher2)).toEqual([]);
    expect(await selbstSchreib.istLaufSchreibvorgang({ type: 'file-changed', path: teil2 })).toBe(
      true,
    );
    // Ein Folgeteil ohne die Aufgabe trägt keine Marke: Eine Änderung von Hand meldet.
    expect(selbstSchreib.hatLaufMarke(teil3)).toBe(false);
    const vorher3 = parseFile(teil3).tasks;
    fs.writeFileSync(teil3, lies(teil3).replace(BROT, abgehakt(BROT)));
    const fremd = await beobachte(teil3, vorher3);
    expect(fremd.map((m) => [m.path, m.task])).toEqual([[teil3, 'Brot kaufen']]);
  });
});

describe('task:applyLineEdit: Grenze der Wurzel bei geteilten Dokumenten (4T-002813)', () => {
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

  it('(g) ein Folgeteil, dessen Zuordnungs-Zeile aus dem Ordner zeigt, hält an', async () => {
    const root = wegwerfWurzel();
    legeGeteilt(root, 'Doku', [`# Eins\n`, `# Zwei\n${BROT}\n`], '../Fremd');
    const teil2 = teilPfad(root, 'Doku', 2);
    const vorher = bestand(root);
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: teil2,
      line: indexZeile(teil2, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: false, error: 'outsideArea' });
    expect(bestand(root)).toEqual(vorher);
    expect(k.deps.recordMddOnSave).not.toHaveBeenCalled();
  });

  it.skipIf(!verweisMoeglich)('(g) ein Teil als Verweis nach außen hält an', async () => {
    const aussen = wegwerfWurzel();
    const root = path.join(aussen, 'Bereich');
    fs.mkdirSync(root);
    const kopf = legeGeteilt(root, 'Doku', [`# Eins\n${BROT}\n`, `# Zwei\n`]);
    const teil2 = teilPfad(root, 'Doku', 2);
    const aussenTeil = path.join(aussen, 'Teil.md');
    fs.writeFileSync(aussenTeil, writePartLine('# Geheim\n', { index: 2, base: 'Doku' }).text);
    fs.rmSync(teil2);
    fs.symlinkSync(aussenTeil, teil2, 'file');
    const kopfVorher = lies(kopf);
    const aussenVorher = lies(aussenTeil);
    const k = kanal(root);
    const res = await k.schreibe({
      filePath: kopf,
      line: indexZeile(kopf, BROT),
      expectedText: BROT,
      newText: abgehakt(BROT),
    });
    expect(res).toMatchObject({ ok: false, error: 'outsideArea' });
    expect(lies(kopf)).toBe(kopfVorher);
    expect(lies(aussenTeil)).toBe(aussenVorher);
    expect(fs.lstatSync(teil2).isSymbolicLink()).toBe(true);
  });
});
