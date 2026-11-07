// 4T-002462 (Epic 3E-000367, Story 4S-001145): Das Ereignis «Aufgabe erledigt»
// (`task-done`), erkannt in src/main/index/aufgaben-erledigt.js aus zwei
// Ständen je Datei: dem Puffer-Stand (Klick auf das Kästchen, Abhaken im
// ungespeicherten Stand) und dem Platten-Stand des Index-Beobachters (getipptes
// `[x]` beim Speichern, Änderung von außen, Abhaken in der Abfrage ohne
// geöffneten Reiter).
//
// Drei Blöcke: der Vergleich zweier Stände als reine Funktion; die Wege am
// echten Bereichs-Index eines Temp-Ordners, dessen Beobachter geschlossen ist
// und dessen Meldungen über `onWatcherChange` nachgestellt werden (Muster
// index-rundruf.test.js), mit der echten Puffer-Overlay-Schicht; und die
// Lieferung an den echten Ereignis-Prüfer samt Filter `in "Datei"` und
// Lauf-Marke (documents/self-write.js).
//
// Pfade entstehen über `node:path`, damit die Prüfdatei unter Windows und Linux
// gilt.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const path = require('node:path');
const backlinks = require('../../src/main/backlinks.js');
const store = require('../../src/main/index/store.js');
const { onWatcherChange } = require('../../src/main/index/build.js');
const {
  attachAufgabenUmgebung,
  aufgabenZustaende,
  erledigtWechsel,
  meldePufferEnde,
  meldePlatte,
  _spiegelLeeren,
} = require('../../src/main/index/aufgaben-erledigt.js');
const { buildTaskEnv } = require('../../src/main/index/task-env.js');
const {
  abonniereWorkflowEreignisse,
  createWorkflowEventChecker,
} = require('../../src/main/checks/workflow-event-check.js');
const {
  istLaufSchreibvorgang,
  merkeLaufAufgabe,
  merkeLaufStand,
  _laufLeeren,
} = require('../../src/main/documents/self-write.js');
const { definitionsPruefsumme } = require('../../src/main/workflows/workflow-definition-hash.js');

const ENV = buildTaskEnv({});

// Ein Index-Stand aus Markdown-Zeilen, so wie parse.js ihn führt.
function stand(...zeilen) {
  return zeilen
    .map((text, i) => ({ zeile: i + 1, text, heading: null }))
    .filter((t) => /^\s*[-*+]\s+\[/.test(t.text));
}

function wechselZwischen(alt, neu, geister = []) {
  return erledigtWechsel(aufgabenZustaende(alt, ENV), aufgabenZustaende(neu, ENV), geister);
}

describe('Vergleich zweier Stände einer Datei (erledigtWechsel)', () => {
  it('offen auf erledigt ist genau ein Wechsel, mit der Beschreibung als Text', () => {
    const { wechsel } = wechselZwischen(
      stand('# Plan', '- [ ] Bericht schreiben', '- [ ] Anrufen'),
      stand('# Plan', '- [x] Bericht schreiben ✅ 2026-10-31', '- [ ] Anrufen'),
    );
    expect(wechsel).toEqual([{ beschreibung: 'Bericht schreiben', erledigt: true, zeile: 2 }]);
  });

  it('Zurücksetzen, unveränderte und neu als erledigt angelegte Zeilen ergeben nichts', () => {
    expect(wechselZwischen(stand('- [x] A ✅ 2026-10-30'), stand('- [ ] A')).wechsel).toEqual([]);
    expect(
      wechselZwischen(stand('- [x] A', '- [ ] B'), stand('- [x] A', '- [ ] B')).wechsel,
    ).toEqual([]);
    expect(wechselZwischen(stand('- [ ] A'), stand('- [ ] A', '- [x] Neu')).wechsel).toEqual([]);
  });

  it('abgebrochen ist nicht erledigt; von abgebrochen auf erledigt ist ein Wechsel', () => {
    expect(wechselZwischen(stand('- [ ] A'), stand('- [-] A ❌ 2026-10-31')).wechsel).toEqual([]);
    expect(wechselZwischen(stand('- [-] A'), stand('- [x] A')).wechsel).toHaveLength(1);
  });

  it('gleichzeitige Text-Änderung: umformuliert und abgehakt bleibt ein Wechsel', () => {
    const { wechsel } = wechselZwischen(
      stand('- [ ] Bericht schreiben', '- [ ] Anrufen'),
      stand('- [x] Bericht abschicken', '- [ ] Anrufen'),
    );
    expect(wechsel.map((w) => w.beschreibung)).toEqual(['Bericht abschicken']);
    // Umformulieren allein ist keiner.
    expect(wechselZwischen(stand('- [ ] A'), stand('- [ ] B')).wechsel).toEqual([]);
  });

  it('Wiederholung: Die neue offene Instanz neben der erledigten Zeile ändert nichts am einen Wechsel', () => {
    for (const neu of [
      stand('- [ ] Gießen 🔁 every day', '- [x] Gießen 🔁 every day ✅ 2026-10-31'),
      stand('- [x] Gießen 🔁 every day ✅ 2026-10-31', '- [ ] Gießen 🔁 every day'),
    ]) {
      expect(wechselZwischen(stand('- [ ] Gießen 🔁 every day'), neu).wechsel).toHaveLength(1);
    }
  });

  it('Text-Änderung an einer schon erledigten Zeile ist kein Wechsel (4S-001145 AK2)', () => {
    expect(
      wechselZwischen(stand('- [x] A ✅ 2026-10-30', '- [ ] B'), stand('- [x] A neu', '- [ ] B'))
        .wechsel,
    ).toEqual([]);
  });

  it('drei Zeilen in einem Speichervorgang abgehakt: drei Wechsel mit je ihrem Text (4S-001145 AK4)', () => {
    const { wechsel } = wechselZwischen(
      stand('- [ ] Eins', '- [ ] Zwei', '- [ ] Drei', '- [ ] Vier'),
      stand('- [x] Eins', '- [x] Zwei', '- [x] Drei', '- [ ] Vier'),
    );
    expect(wechsel.map((w) => w.beschreibung)).toEqual(['Eins', 'Zwei', 'Drei']);
  });

  it('zwei gleich lautende Zeilen, eine abgehakt: ein Wechsel', () => {
    const { wechsel } = wechselZwischen(stand('- [ ] A', '- [ ] A'), stand('- [ ] A', '- [x] A'));
    expect(wechsel).toHaveLength(1);
  });

  it('Geist: Das Zwischenstück `- [] A` beim Tippen verliert die Zeile nicht', () => {
    const schritt1 = wechselZwischen(stand('- [ ] A'), stand('- [] A'));
    expect(schritt1.wechsel).toEqual([]);
    expect(schritt1.geister).toEqual([{ beschreibung: 'A', zeile: 1 }]);
    const schritt2 = wechselZwischen(stand('- [] A'), stand('- [x] A'), schritt1.geister);
    expect(schritt2.wechsel).toHaveLength(1);
    expect(schritt2.geister).toEqual([]);
    // Taucht sie offen wieder auf, verbraucht sie den Geist.
    expect(wechselZwischen(stand('- [] A'), stand('- [ ] A'), schritt1.geister).geister).toEqual(
      [],
    );
  });

  it('Status-Einstellung und Global Filter der Aufgaben-Umgebung gelten', () => {
    const eigene = buildTaskEnv({
      taskStates: { states: [{ symbol: '!', name: 'Fertig', type: 'DONE', next: ' ' }] },
      tasksConfig: { globalFilter: '#aufgabe' },
    });
    const zustaende = aufgabenZustaende(stand('- [!] A #aufgabe', '- [x] B'), eigene);
    expect(zustaende.map((z) => z.beschreibung)).toEqual(['A #aufgabe']);
    expect(zustaende[0].erledigt).toBe(eigene.statusTypeOf('!') === 'DONE');
  });
});

// --- Wege am echten Bereichs-Index ------------------------------------------------

const BESITZER = 'pruef:1';
let wurzel;
let eintrag;
let meldungen;
let abmelden;

async function bereichMitIndex() {
  const w = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'task-done-')));
  fs.writeFileSync(path.join(w, 'Wochenplan.md'), '# Woche\n\n- [ ] Probe-Aufgabe\n', 'utf8');
  fs.writeFileSync(path.join(w, 'Anderes.md'), '- [ ] Fremd\n', 'utf8');
  backlinks.ensureAreaIndex(w, BESITZER);
  const schluessel = path.resolve(w);
  for (let i = 0; i < 500 && store.indexes.get(schluessel)?.status !== 'ready'; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const e = store.indexes.get(schluessel);
  expect(e && e.status).toBe('ready');
  if (e.watcher) await e.watcher.close();
  e.watcher = null;
  return { w, e };
}

// Datei auf der Platte ändern und die Meldung des Beobachters nachstellen.
function schreibeVonAussen(name, text) {
  const abs = path.join(wurzel, name);
  fs.writeFileSync(abs, text, 'utf8');
  onWatcherChange(eintrag, abs, 'change');
  return abs;
}

// Speichern aus dem Fenster: Platte schreiben, Puffer-Stand zurücknehmen
// (save-export.js), danach die Meldung des Beobachters. Die Rücknahme liest die
// Platte; die zweite Auswertung ersetzt die erste und wird abgewartet.
async function speichere(name, text) {
  const abs = path.join(wurzel, name);
  fs.writeFileSync(abs, text, 'utf8');
  backlinks.clearBufferOverlay(abs);
  await meldePufferEnde(abs);
  onWatcherChange(eintrag, abs, 'change');
  return abs;
}

function tippe(name, text) {
  const abs = path.join(wurzel, name);
  backlinks.setBufferOverlay(abs, text, 7);
  return abs;
}

const ruhe = () => new Promise((r) => setTimeout(r, 30));

// Bereich schließen: Freigabe und Ablauf der Nachlauf-Zeit des Index.
function baueAb() {
  vi.useFakeTimers();
  backlinks.releaseRoot(path.resolve(wurzel), BESITZER);
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
}

describe('am echten Bereichs-Index', () => {
  beforeEach(async () => {
    _spiegelLeeren();
    _laufLeeren();
    attachAufgabenUmgebung(null);
    ({ w: wurzel, e: eintrag } = await bereichMitIndex());
    meldungen = [];
    abmelden = abonniereWorkflowEreignisse((m) => {
      if (m.type === 'task-done') meldungen.push(m);
    });
  });

  afterEach(async () => {
    abmelden();
    backlinks.clearAllBufferOverlays();
    baueAb();
    // Der Abbau schreibt den Zwischenspeicher des Bereichs asynchron.
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  describe('Wege, die erledigen (AK2)', () => {
    it('Änderung von außen: genau eine Meldung mit Datei, Aufgaben-Text und Bereich', () => {
      const abs = schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen).toEqual([
        { type: 'task-done', path: abs, task: 'Probe-Aufgabe', root: path.resolve(wurzel) },
      ]);
      // Dieselbe Datei erneut gemeldet, ohne Änderung: nichts mehr.
      onWatcherChange(eintrag, abs, 'change');
      expect(meldungen).toHaveLength(1);
    });

    it('Klick auf das Kästchen: Meldung aus dem Puffer, das Speichern danach meldet nicht noch einmal', async () => {
      const erledigt = '# Woche\n\n- [x] Probe-Aufgabe ✅ 2026-10-31\n';
      const abs = tippe('Wochenplan.md', erledigt);
      expect(meldungen.map((m) => [m.path, m.task])).toEqual([[abs, 'Probe-Aufgabe']]);
      await speichere('Wochenplan.md', erledigt);
      expect(meldungen).toHaveLength(1);
    });

    it('getipptes `[x]` über das Zwischenstück `- []`: eine Meldung, beim Speichern keine zweite', async () => {
      tippe('Wochenplan.md', '# Woche\n\n- [] Probe-Aufgabe\n');
      expect(meldungen).toEqual([]);
      tippe('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen).toHaveLength(1);
      await speichere('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen).toHaveLength(1);
    });

    it('getipptes `[x]`, das der Puffer nie als erledigt sah, meldet sich beim Speichern', async () => {
      tippe('Wochenplan.md', '# Woche\n\n- [] Probe-Aufgabe\n');
      await speichere('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen.map((m) => m.task)).toEqual(['Probe-Aufgabe']);
    });

    it('Verwerfen nimmt den Stand zurück; erneutes Abhaken ist ein neuer Wechsel', async () => {
      const abs = tippe('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      backlinks.clearBufferOverlay(abs);
      await meldePufferEnde(abs);
      expect(meldungen).toHaveLength(1);
      tippe('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen).toHaveLength(2);
    });

    it('Zurücksetzen auf offen und eine reine Text-Änderung melden nichts (AK4)', () => {
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe\n');
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe, umformuliert\n');
      expect(meldungen).toHaveLength(1);
      // Ein erneutes Erledigen nach dem Zurücksetzen ist ein neuer Wechsel.
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe, umformuliert\n');
      expect(meldungen).toHaveLength(2);
    });

    it('kein Nachholen: eine neue Datei mit erledigter Zeile meldet nichts', () => {
      const neu = path.join(wurzel, 'Neu.md');
      fs.writeFileSync(neu, '- [x] Schon fertig\n', 'utf8');
      onWatcherChange(eintrag, neu, 'add');
      expect(meldungen).toEqual([]);
    });

    it('kein Nachholen: Was während der Schließung erledigt wurde, meldet nach dem Öffnen nichts', async () => {
      const abs = tippe('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe\n');
      backlinks.clearBufferOverlay(abs);
      await meldePufferEnde(abs);
      baueAb();
      fs.writeFileSync(abs, '# Woche\n\n- [x] Probe-Aufgabe\n', 'utf8');
      backlinks.ensureAreaIndex(wurzel, BESITZER);
      for (let i = 0; i < 500 && store.indexes.get(path.resolve(wurzel))?.status !== 'ready'; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      eintrag = store.indexes.get(path.resolve(wurzel));
      if (eintrag.watcher) await eintrag.watcher.close();
      eintrag.watcher = null;
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n\nNotiz\n');
      expect(meldungen).toEqual([]);
    });

    it('Ein Puffer-Stand geht der Platte vor: Die Platte wird erst mit seiner Rücknahme wirksam', async () => {
      const abs = tippe('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe\n\nNotiz\n');
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      expect(meldungen).toEqual([]);
      // Neu laden nach der Änderung von außen nimmt den Puffer-Stand zurück.
      backlinks.clearBufferOverlay(abs);
      await meldePufferEnde(abs);
      expect(meldungen).toHaveLength(1);
    });
  });

  describe('Lauf-Marke: Was ein Workflow abhakt, ist ein Lauf-Schreibvorgang (AK4)', () => {
    it('complete-task: Die Meldung trägt die Beschreibung, die die Einmal-Marke erkennt', async () => {
      const abs = path.join(wurzel, 'Wochenplan.md');
      await merkeLaufAufgabe(abs, 'Probe-Aufgabe');
      tippe('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe ✅ 2026-10-31\n');
      expect(meldungen).toHaveLength(1);
      expect(istLaufSchreibvorgang(meldungen[0])).toBe(true);
    });

    it('ein Workflow-Schreibvorgang auf der Platte (Lauf-Stand) meldet kein task-done', async () => {
      const abs = path.join(wurzel, 'Wochenplan.md');
      const text = '# Woche\n\n- [x] Probe-Aufgabe\n';
      merkeLaufStand(abs, text);
      const versprechen = meldePlatte(
        path.resolve(wurzel),
        abs,
        [{ zeile: 3, text: '- [ ] Probe-Aufgabe' }],
        [{ zeile: 3, text: '- [x] Probe-Aufgabe' }],
      );
      fs.writeFileSync(abs, text, 'utf8');
      await versprechen;
      expect(meldungen).toEqual([]);
      // Ein fremder Inhalt danach meldet wieder.
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe\n- [ ] B\n');
      schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [ ] Probe-Aufgabe\n- [x] B\n');
      await ruhe();
      expect(meldungen.map((m) => m.task)).toEqual(['B']);
    });
  });

  // --- Lieferung an den Ereignis-Prüfer ---------------------------------------------

  function workflowText(ereignis) {
    return [
      '---',
      'workflow: true',
      'name: Erledigt-Probe',
      'trigger: event',
      `event: ${ereignis}`,
      '---',
      '',
      '```workflow',
      'notify "{{task}}"',
      '```',
      '',
    ].join('\n');
  }

  function pruefer(ereignis) {
    const wf = path.join(wurzel, 'Workflows', 'Erledigt.md');
    const text = workflowText(ereignis);
    const geliefert = [];
    const p = createWorkflowEventChecker({
      areas: () => [{ root: path.resolve(wurzel) }],
      workflowFiles: () => ({
        status: 'ready',
        dateien: [{ absPath: wf, relPath: 'Workflows/Erledigt.md' }],
      }),
      readText: async () => text,
      readRunState: async () => ({
        stand: {
          runs: 0,
          armed: { at: '2026-10-31T08:00:00Z', hash: definitionsPruefsumme(text) },
        },
        defekt: false,
      }),
      enabled: () => true,
      deliver: (nutzlast) => geliefert.push(...nutzlast.items),
      claimDelivery: () => true,
      releaseDelivery: () => {},
      windowAlive: () => true,
      istLaufSchreibvorgang,
    });
    const ab = abonniereWorkflowEreignisse((m) => p.report(m));
    // Alle Fälligkeiten nacheinander abarbeiten, wie die Fenster es tun.
    async function laeufe() {
      const fertig = new Set();
      for (let runde = 0; runde < 20; runde++) {
        await p.idle();
        const offen = geliefert.filter((i) => !fertig.has(i.key));
        if (offen.length === 0) break;
        for (const item of offen) {
          fertig.add(item.key);
          p.claim(item.key, { root: path.resolve(wurzel), windowId: 1 });
          p.finish(item.key, 1);
        }
      }
      return geliefert;
    }
    return {
      laeufe,
      stop: () => {
        ab();
        p.stop();
      },
    };
  }

  describe('Lieferung an den Ereignis-Prüfer (AK3)', () => {
    it('Filter `in "Wochenplan.md"`: nur Aufgaben dieser Datei, mit Datei und Aufgaben-Text', async () => {
      const welt = pruefer('task-done in "Wochenplan.md"');
      const plan = schreibeVonAussen('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe\n');
      schreibeVonAussen('Anderes.md', '- [x] Fremd\n');
      const laeufe = await welt.laeufe();
      welt.stop();
      expect(laeufe.map((i) => i.event)).toEqual([
        { type: 'task-done', file: plan, from: null, task: 'Probe-Aufgabe' },
      ]);
    });

    it('complete-task eines Laufs löst keinen Lauf aus, das Abhaken von Hand danach schon', async () => {
      const welt = pruefer('task-done');
      const abs = path.join(wurzel, 'Wochenplan.md');
      await merkeLaufAufgabe(abs, 'Probe-Aufgabe');
      tippe('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe ✅ 2026-10-31\n');
      await speichere('Wochenplan.md', '# Woche\n\n- [x] Probe-Aufgabe ✅ 2026-10-31\n');
      expect(await welt.laeufe()).toEqual([]);
      schreibeVonAussen('Anderes.md', '- [x] Fremd\n');
      const laeufe = await welt.laeufe();
      welt.stop();
      expect(laeufe.map((i) => i.event.task)).toEqual(['Fremd']);
    });
  });
});
