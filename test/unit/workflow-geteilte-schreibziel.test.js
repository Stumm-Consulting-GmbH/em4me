// 4T-002812 (Epic 3E-000444, AK5): Das Schreibziel eines Text-Befehls an
// einem in Teile zerlegten Dokument. Maßgeblich ist der Stand unter der
// Kopf-Datei, unter der ein Fenster ein geteiltes Dokument führt und meldet.
// Hält es das Dokument unverändert, schreibt der Befehl die Datei, auch mit
// einem Folgeteil als Ziel. Schreibt er dabei nur Folgeteile, bleibt die
// Kopf-Datei und damit ihre Beobachtung still; die Fenster bekommen die
// Meldung deshalb vom Schreibweg (src/main/workflows/workflow-platten-schreibweg.js),
// unter dem Pfad der Kopf-Datei.
//
// Eigene Datei statt eines weiteren Blocks in workflow-geteilte-dokumente.test.js,
// weil jene sonst ihr Zeilen-Budget überschritte. Die Helfer zum Anlegen des
// geteilten Dokuments folgen ihr (am echten Dateisystem, Wegwerf-Wurzel).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createWorkflowContentSteps,
} = require('../../src/main/workflows/workflow-content-steps.js');
const { writePartLine, PART_SEP, PART_INFIX } = require('../../src/shared/document-parts.js');
const { readStateForSave, mddPathFor } = require('../../src/main/documents/document-parts-io.js');
const { emptyContainer, serializeContainer } = require('../../src/main/documents/mdd-store.js');
const selbstSchreib = require('../../src/main/documents/self-write.js');

let tmpDirs = [];

afterEach(() => {
  selbstSchreib._laufLeeren();
  selbstSchreib._leeren();
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wf-ziel-'));
  tmpDirs.push(root);
  return root;
}

// Legt ein geteiltes Dokument aus Rümpfen an (Rumpf 0 ist die Kopf-Datei) und
// eine leere Begleitdatei, damit der Katalog geschrieben werden kann.
function legeGeteilt(root, grund, rumpfe) {
  const kopf = path.join(root, `${grund}.md`);
  rumpfe.forEach((rumpf, i) => {
    const name = i === 0 ? `${grund}.md` : `${teilName(grund, i + 1)}.md`;
    fs.writeFileSync(
      path.join(root, name),
      writePartLine(rumpf, { index: i + 1, base: grund }).text,
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

const VORLAGE = (text) => ({ source: { kind: 'template', text } });
const ZWEITEILIG = ['# Eins\nA\n', '# Zwei\n## Ende\nalt-2\n'];

describe('Geteiltes Dokument: Schreibziel nach dem Merkmal «ungespeichert» (4T-002812)', () => {
  const index = require('../../src/main/backlinks.js');
  const { createFileWatching } = require('../../src/main/documents/file-watching.js');
  const { setPlatformForTests } = require('../../src/shared/platform.js');
  afterEach(() => index.clearAllBufferOverlays());

  function merkmalWelt() {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Notizen', ZWEITEILIG);
    const gemeldet = [];
    const anfragen = [];
    const schritte = createWorkflowContentSteps({
      windows: new Map([[7, { isDestroyed: () => false }]]),
      backlinks: index,
      resolveHistoryFor: async () => ({ effective: false }),
      recordMddOnSave: async () => {},
      bufferRequests: {
        request: async (_fenster, pfad) => {
          anfragen.push(pfad);
          return { ok: true, changed: true };
        },
      },
      meldeDateiAenderung: (p) => {
        gemeldet.push(p);
        return 1;
      },
    });
    const ctx = { root, owner: {}, event: { sender: { id: 1 } }, workflowAbs: kopf };
    const lauf = (keyword, args, extra = {}) =>
      selbstSchreib.imWorkflowLauf(() =>
        schritte.runContentStep(ctx, {
          line: 2,
          keyword,
          args,
          source: null,
          position: null,
          ...extra,
        }),
      );
    const zweiter = path.join(root, `${teilName('Notizen', 2)}.md`);
    return { root, kopf, zweiter, gemeldet, anfragen, lauf };
  }
  const FOLGETEIL_ERSETZEN = [`${teilName('Notizen', 2)}.md`, 'alt-2', 'neu-2'];

  it('AK5: unverändert unter der Kopf-Datei, Ziel ein Folgeteil: die Datei wird geschrieben', async () => {
    const w = merkmalWelt();
    const stand = (await readStateForSave(w.kopf)).text;
    index.setBufferOverlay(w.kopf, stand, 1, false);
    const res = await w.lauf('replace', FOLGETEIL_ERSETZEN);
    expect(res).toEqual({ ok: true, effect: { kind: 'edited', paths: [w.kopf], via: 'disk' } });
    expect(lies(w.zweiter)).toContain('neu-2');
    // Ein anderes Fenster mit unverändertem Stand zieht den Auftrag ebenso wenig an.
    index.setBufferOverlay(w.kopf, (await readStateForSave(w.kopf)).text, 7, false);
    expect((await w.lauf('replace', ['Notizen.md', 'neu-2', 'neu-3'])).effect.via).toBe('disk');
    expect(lies(w.zweiter)).toContain('neu-3');
    expect(w.anfragen).toEqual([]);
  });

  it('AK5: geändert unter der Kopf-Datei: der Stand im Fenster gilt, die Platte bleibt', async () => {
    const w = merkmalWelt();
    const stand = (await readStateForSave(w.kopf)).text;
    const vorher = bestand(w.root);
    index.setBufferOverlay(w.kopf, `${stand}getippt\n`, 1, true);
    expect(await w.lauf('replace', FOLGETEIL_ERSETZEN)).toEqual({
      ok: true,
      window: {
        action: 'editOwnBuffer',
        path: w.kopf,
        edit: { op: 'replace', search: 'alt-2', replacement: 'neu-2' },
      },
    });
    index.setBufferOverlay(w.kopf, `${stand}getippt\n`, 7, true);
    expect((await w.lauf('replace', FOLGETEIL_ERSETZEN)).effect.via).toBe('otherBuffer');
    expect(w.anfragen).toEqual([w.kopf]);
    expect(bestand(w.root)).toEqual(vorher);
  });

  it('AK5: nur ein Folgeteil geschrieben: die Fenster bekommen die Meldung unter dem Kopf-Pfad', async () => {
    const w = merkmalWelt();
    const kopfVorher = lies(w.kopf);
    expect((await w.lauf('append', ['Notizen.md'], VORLAGE('- neu'))).effect.via).toBe('disk');
    expect(lies(w.kopf)).toBe(kopfVorher);
    expect(w.gemeldet).toEqual([w.kopf]);
  });

  it('die Kopf-Datei geschrieben: keine eigene Meldung, die Beobachtung der Kopf-Datei meldet', async () => {
    const w = merkmalWelt();
    expect((await w.lauf('set-property', ['Notizen.md', 'status', 'erledigt'])).ok).toBe(true);
    expect(w.gemeldet).toEqual([]);
  });

  it('die Datei-Beobachtung meldet file:changed an ihre Fenster, unter dem Pfad der Beobachtung', async () => {
    const root = wegwerfWurzel();
    const kopf = legeGeteilt(root, 'Notizen', ZWEITEILIG);
    const post = [];
    const fenster = (id) => ({
      isDestroyed: () => false,
      webContents: { send: (kanal, daten) => post.push({ an: id, kanal, daten }) },
    });
    const windows = new Map([
      [3, fenster(3)],
      [4, fenster(4)],
    ]);
    const beobachtung = createFileWatching({ windows: () => windows });
    try {
      expect(beobachtung.meldeDateiAenderung(kopf)).toBe(0);
      beobachtung.watchFile(kopf, 3);
      expect(beobachtung.meldeDateiAenderung(kopf)).toBe(1);
      expect(post).toEqual([{ an: 3, kanal: 'file:changed', daten: kopf }]);
      // Abweichende Schreibweise unter Windows: gemeldet wird der Pfad der Beobachtung.
      setPlatformForTests('win32');
      expect(beobachtung.meldeDateiAenderung(kopf.toUpperCase())).toBe(1);
      expect(post[1]).toEqual({ an: 3, kanal: 'file:changed', daten: kopf });
      setPlatformForTests('linux');
      expect(beobachtung.meldeDateiAenderung(kopf.toUpperCase())).toBe(0);
    } finally {
      setPlatformForTests(undefined);
      await beobachtung.unwatchAll();
    }
  });
});

// 4T-002814 (Epic 3E-000444): Die Quelle «aus einem Abschnitt» liest das ganze
// Workflow-Dokument, auch wenn es geteilt ist. Bis dahin las sie allein die
// Kopf-Datei, und ein Abschnitt in einem späteren Teil fehlte (`sectionUnknown`).
describe('Quelle «aus einem Abschnitt» aus einer geteilten Workflow-Datei (4T-002814)', () => {
  const { sectionBody } = require('../../src/shared/workflows/workflow-core.js');
  const KOPF_RUMPF =
    '---\nworkflow: true\n---\n# Ablauf\n\n```workflow\nappend "Ziel.md" from-section "Eintrag"\n```\n';
  const TEIL_RUMPF = '## Eintrag\n\n- aus Teil 2\n';

  function quellenWelt({ wurzel, ordner, puffer = {} } = {}) {
    const root = wurzel || wegwerfWurzel();
    const dir = ordner || root;
    const backlinks = {
      bufferTextFor: (p) => (Object.prototype.hasOwnProperty.call(puffer, p) ? puffer[p] : null),
      bufferOwnerFor: () => null,
    };
    const schritte = createWorkflowContentSteps({
      backlinks,
      resolveHistoryFor: async () => ({ effective: false }),
      readPreviousTextFor: async () => null,
      recordMddOnSave: async () => {},
    });
    fs.writeFileSync(path.join(root, 'Ziel.md'), '');
    const lauf = (workflowAbs) =>
      schritte.runContentStep(
        { root, owner: {}, event: { sender: { id: 1 } }, workflowAbs, backlinks },
        {
          line: 2,
          keyword: 'append',
          args: ['Ziel.md'],
          source: { kind: 'section', name: 'Eintrag' },
          position: null,
        },
      );
    return { root, dir, puffer, lauf, ziel: () => lies(path.join(root, 'Ziel.md')) };
  }

  it('AK1: der Abschnitt steht im zweiten Teil und wird eingesetzt', async () => {
    const w = quellenWelt();
    const kopf = legeGeteilt(w.root, 'Ablauf', [KOPF_RUMPF, TEIL_RUMPF]);
    const res = await w.lauf(kopf);
    expect(res.ok).toBe(true);
    expect(w.ziel()).toContain('- aus Teil 2');
  });

  it('AK1: Workflow-Datei außerhalb des Bereichs, Teile in ihrem eigenen Ordner', async () => {
    const draussen = wegwerfWurzel();
    const w = quellenWelt();
    const kopf = legeGeteilt(draussen, 'Ablauf', [KOPF_RUMPF, TEIL_RUMPF]);
    expect((await w.lauf(kopf)).ok).toBe(true);
    expect(w.ziel()).toContain('- aus Teil 2');
  });

  it('AK1: fehlt ein mittlerer Teil, hält der Schritt mit partsMissing an', async () => {
    const w = quellenWelt();
    const kopf = legeGeteilt(w.root, 'Ablauf', [KOPF_RUMPF, '## Mitte\nm\n', TEIL_RUMPF]);
    fs.rmSync(path.join(w.root, `${teilName('Ablauf', 2)}.md`));
    expect((await w.lauf(kopf)).code).toBe('partsMissing');
    expect(w.ziel()).toBe('');
  });

  it('AK2: ungeteilte Workflow-Datei, der Abschnitt kommt zeichengleich an', async () => {
    const w = quellenWelt();
    const roh =
      '﻿---\r\nworkflow: true\r\n---\r\n## Eintrag\r\n\r\n- Zeile mit Leerraum  \r\n\t- eingerückt\r\n\r\n## Danach\r\nx\r\n';
    const datei = path.join(w.root, 'Ablauf.md');
    fs.writeFileSync(datei, roh);
    expect((await w.lauf(datei)).ok).toBe(true);
    const erwartet = sectionBody(roh, 'Eintrag').text;
    expect(erwartet).toBe('- Zeile mit Leerraum  \n\t- eingerückt');
    expect(w.ziel()).toContain(erwartet);
    expect(lies(datei)).toBe(roh);
  });

  it('AK2: ungespeicherter Stand der Workflow-Datei im Fenster geht der Platte vor', async () => {
    const root = wegwerfWurzel();
    const datei = path.join(root, 'Ablauf.md');
    fs.writeFileSync(datei, '## Eintrag\n\n- von der Platte\n');
    const w = quellenWelt({
      wurzel: root,
      puffer: { [datei]: '## Eintrag\n\n- aus dem Fenster\n' },
    });
    expect((await w.lauf(datei)).ok).toBe(true);
    expect(w.ziel()).toContain('- aus dem Fenster');
    expect(w.ziel()).not.toContain('- von der Platte');
  });
});
