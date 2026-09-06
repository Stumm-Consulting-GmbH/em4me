// 4T-001351 (Epic 3E-000170): Der Lösch-Weg des Bereichs-Panels am ECHTEN
// Handler.
//
// Der tragende Test ist der über den Fehlschlag. Entscheidung E2 des Epics
// (Product Owner, 2026-09-01) verlangt den Papierkorb OHNE stillen Rückfall:
// Steht er nicht zur Verfügung, wird gemeldet und **nicht** ersatzweise
// endgültig gelöscht. Ein Test, der nur den Erfolgsfall prüft, sähe genau das
// nicht — er wäre auch dann grün, wenn der Handler bei einem Fehlschlag
// heimlich `fs.unlink` nachschöbe. Deshalb liegt die Datei hier in jedem
// Fehlerfall nach dem Aufruf noch auf der Platte, und genau das wird gemessen.
//
// Der Papierkorb selbst ist gestubbt; sein Ergebnis im Betriebssystem ist
// nicht automatisiert prüfbar und gehört auf die manuelle Ebene (Prüf-Block
// des Tasks).
import { afterEach, describe, expect, it } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerAreasIpc } = require('../../src/main/ipc/areas.js');

const tempOrdner = [];

afterEach(async () => {
  while (tempOrdner.length) {
    const dir = tempOrdner.pop();
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function bereich() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'em4me-loeschen-'));
  tempOrdner.push(dir);
  const wurzel = path.join(dir, 'bereich');
  await fsp.mkdir(wurzel);
  await fsp.mkdir(path.join(dir, 'daneben'));
  await fsp.writeFile(path.join(wurzel, 'Notiz.md'), '# Notiz\n', 'utf8');
  await fsp.writeFile(path.join(wurzel, 'Bild.png'), 'kein Dokument', 'utf8');
  await fsp.writeFile(path.join(dir, 'daneben', 'Fremd.md'), '# Fremd\n', 'utf8');
  return { dir, wurzel };
}

// Papierkorb-Stub: merkt sich die Aufrufe und kann einen Fehlschlag spielen.
function baueShell(fehler) {
  const aufrufe = [];
  return {
    aufrufe,
    shell: {
      trashItem: async (p) => {
        aufrufe.push(p);
        if (fehler) throw new Error(fehler);
      },
    },
  };
}

function registriere(rootPath, shell) {
  const handler = new Map();
  registerAreasIpc((kanal, fn) => handler.set(kanal, fn), {
    dialog: {},
    shell,
    senderWindow: () => ({}),
    areaOfWindow: () => (rootPath ? { rootPath, name: path.basename(rootPath) } : null),
    tForWindow: (_w, key) => key,
    appRegistry: {},
    openAreaPath: (p) => ({ ok: true, rootPath: p }),
    closeAreaApp: async () => ({ ok: true }),
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    getStore: () => null,
    workspacesState: [],
    setWorkspacesState: () => {},
    workspacesChanged: () => {},
    resolveAreaStartPage: async () => null,
    writeAreaStartPage: async () => ({ ok: true }),
    startPageRelative: () => null,
  });
  return handler;
}

describe('area:trashFile (4T-001351)', () => {
  it('reicht die Datei an den Papierkorb des Betriebssystems', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis).toEqual({ ok: true, path: ziel });
    expect(aufrufe).toEqual([path.resolve(ziel)]);
  });

  it('loescht bei fehlendem Papierkorb NICHT ersatzweise endgueltig (E2)', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell('kein Papierkorb auf diesem Laufwerk');
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.error).toContain('kein Papierkorb');
    // Der eigentliche Nachweis: Der Papierkorb wurde versucht, und die Datei
    // liegt danach unveraendert da. Ein Rueckfall auf endgueltiges Loeschen
    // haette sie hier entfernt.
    expect(aufrufe).toHaveLength(1);
    expect(fs.existsSync(ziel)).toBe(true);
    expect(await fsp.readFile(ziel, 'utf8')).toBe('# Notiz\n');
  });

  it('meldet einen sonstigen Fehlschlag und laesst die Datei stehen', async () => {
    const { wurzel } = await bereich();
    const { shell } = baueShell('EBUSY: resource busy or locked');
    const handler = registriere(wurzel, shell);
    const ziel = path.join(wurzel, 'Notiz.md');

    const ergebnis = await handler.get('area:trashFile')({}, ziel);

    expect(ergebnis.ok).toBe(false);
    expect(fs.existsSync(ziel)).toBe(true);
  });

  it('weist einen Pfad ausserhalb des Bereichs ab, ohne den Papierkorb zu rufen', async () => {
    const { dir, wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const fremd = path.join(dir, 'daneben', 'Fremd.md');

    const ergebnis = await handler.get('area:trashFile')({}, fremd);

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(aufrufe).toEqual([]);
    expect(fs.existsSync(fremd)).toBe(true);
  });

  it('weist einen Ausbruch ueber .. ab', async () => {
    const { dir, wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);
    const fremd = path.join(wurzel, '..', 'daneben', 'Fremd.md');

    const ergebnis = await handler.get('area:trashFile')({}, fremd);

    expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    expect(aufrufe).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'daneben', 'Fremd.md'))).toBe(true);
  });

  it('weist eine Datei ab, die kein Dokument ist', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);

    const ergebnis = await handler.get('area:trashFile')({}, path.join(wurzel, 'Bild.png'));

    expect(ergebnis).toEqual({ ok: false, error: 'not a document' });
    expect(aufrufe).toEqual([]);
  });

  it('loescht ohne Bereich nichts', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(null, shell);

    const ergebnis = await handler.get('area:trashFile')({}, path.join(wurzel, 'Notiz.md'));

    expect(ergebnis).toEqual({ ok: false, error: 'no area' });
    expect(aufrufe).toEqual([]);
  });

  it('weist leere und untypisierte Angaben ab', async () => {
    const { wurzel } = await bereich();
    const { shell, aufrufe } = baueShell(null);
    const handler = registriere(wurzel, shell);

    for (const eingabe of ['', null, undefined, 42]) {
      const ergebnis = await handler.get('area:trashFile')({}, eingabe);
      expect(ergebnis).toEqual({ ok: false, error: 'outside-area' });
    }
    expect(aufrufe).toEqual([]);
  });
});

// Der Handler kennt genau EINEN Loesch-Aufruf. Das ist keine Stil-Frage,
// sondern die Bauart, die E2 traegt: Solange `shell.trashItem` die einzige
// Stelle ist, KANN kein Fehlschlag auf endgueltiges Loeschen ausweichen. Der
// Wächter liest den Quelltext, weil ein Verhaltens-Test einen kuenftig
// eingebauten Rueckfall nur in genau der Konstellation faende, die er
// zufaellig spielt.
describe('Bauart des Lösch-Wegs (4T-001351)', () => {
  it('src/main/ipc/areas.js kennt keinen endgueltigen Loesch-Aufruf', () => {
    const roh = fs.readFileSync(path.join(process.cwd(), 'src', 'main', 'ipc', 'areas.js'), 'utf8');
    // Kommentare heraus, bevor gemessen wird: Der Kopf des Handlers ERKLAERT,
    // dass es keinen fs.unlink-Zweig gibt, und eine Suche ueber den rohen Text
    // fände genau diese Erklärung. Geprüft wird der Code, nicht die Prosa.
    const quelle = roh
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((zeile) => !zeile.trim().startsWith('//'))
      .join('\n');
    expect(quelle).toContain('shell.trashItem');
    for (const verboten of ['fs.unlink', 'fs.rm(', 'rmSync', 'unlinkSync']) {
      expect(quelle.includes(verboten), `unerwarteter Loesch-Aufruf: ${verboten}`).toBe(false);
    }
  });
});
