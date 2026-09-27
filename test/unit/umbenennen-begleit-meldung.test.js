// 4T-001789 (Epic 3E-000255): Der Weg der Meldung zum Anwender (AK14).
//
// Der Kanal des Umbenennens überschrieb bis zu diesem Vorgang JEDEN Fehlschlag
// einer Einzeldatei mit der Pauschal-Kennung 'partial'. Die Oberfläche machte
// daraus «0 von 1 Dateien umbenannt» — eine Stückzahl ohne Grund, aus der der
// Anwender nicht ablesen kann, was zu tun ist. Die drei Kennungen des
// Mitziehens müssen deshalb unverändert durchkommen, samt den Pfaden, aus denen
// die Meldung ihre Dateinamen zieht.
//
// Geprüft wird am ECHTEN Handler mit einer gestellten Umbenenn-Strecke: Der
// Gegenstand ist die Weitergabe der Kennung und nicht das Bewegen von Dateien,
// das die Prüfgruppe begleit-dateien-mitziehen abdeckt.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerRenameIpc } = require('../../src/main/ipc/rename.js');
const subpages = require('../../src/shared/subpages.js');

let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-meldung-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

// Registriert die Umbenennen-Kanäle mit einer Umbenenn-Strecke, die genau das
// Ergebnis liefert, das der Prüffall untersuchen will.
function registriere(ergebnisDerBewegung) {
  const handler = new Map();
  registerRenameIpc((kanal, fn) => handler.set(kanal, fn), {
    senderWindow: () => ({}),
    subpages,
    isMarkdownPath: (p) => /\.(md|markdown|mdown|mkd)$/i.test(p),
    // Die gestellte Strecke bewegt die Datei im Erfolgsfall wirklich; der
    // Nachlauf des Kanals liest sie danach, und ein Nicht-Bewegen erzeugte
    // einen Lesefehler, der mit dem Gegenstand nichts zu tun hat.
    renameSingleFile: async (von, nach) => {
      if (ergebnisDerBewegung.ok) fs.renameSync(von, nach);
      return ergebnisDerBewegung;
    },
    sendBookStateForDirs: async () => {},
    renamesFromPairs: (paare) => paare,
    applyLinkUpdatesForRename: async () => ({ updated: [], failed: [] }),
    computeLinkUpdatePreview: async () => [],
    broadcast: () => {},
  });
  return handler;
}

async function benenneUm(ergebnisDerBewegung, root) {
  const alt = path.join(root, 'Kunden.md');
  fs.writeFileSync(alt, '# Kunden\n', 'utf8');
  const handler = registriere(ergebnisDerBewegung);
  return handler.get('file:rename')({}, { oldPath: alt, newBasename: 'Kundschaft' });
}

describe('file:rename reicht die Begleit-Kennungen durch (AK14)', () => {
  it('meldet den gescheiterten Mitzug als eigene Kennung statt als Stückzahl', async () => {
    const root = makeRoot();

    const ergebnis = await benenneUm(
      { ok: false, code: 'companion', error: 'EPERM: gehalten' },
      root,
    );

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.code).toBe('companion');
    expect(ergebnis.error).toBe('EPERM: gehalten');
    // Die Zahlen bleiben erhalten; sie tragen die Meldung nicht mehr allein.
    expect(ergebnis.renamedCount).toBe(0);
    expect(ergebnis.totalCount).toBe(1);
    expect(ergebnis.failedPath).toBe(path.join(root, 'Kunden.md'));
  });

  it('reicht den Pfad der bereits vorhandenen Beleg-Datei mit', async () => {
    const root = makeRoot();
    const belegAmZiel = path.join(root, 'Kundschaft.mddl');

    const ergebnis = await benenneUm(
      { ok: false, code: 'companion-exists', companionPath: belegAmZiel },
      root,
    );

    expect(ergebnis.code).toBe('companion-exists');
    // Aus diesem Pfad zieht die Meldung den Dateinamen des Platzhalters.
    expect(ergebnis.companionPath).toBe(belegAmZiel);
  });

  it('reicht bei gescheiterter Rücknahme beide Pfade der Hauptdatei mit', async () => {
    const root = makeRoot();
    const alt = path.join(root, 'Kunden.md');
    const neu = path.join(root, 'Kundschaft.md');

    const ergebnis = await benenneUm(
      { ok: false, code: 'companion-rollback', error: 'EPERM: gehalten', from: alt, to: neu },
      root,
    );

    expect(ergebnis.code).toBe('companion-rollback');
    expect(ergebnis.from).toBe(alt);
    expect(ergebnis.to).toBe(neu);
  });

  it('lässt jeden anderen Fehlschlag unverändert als Teilfehler stehen', async () => {
    const root = makeRoot();

    const ergebnis = await benenneUm({ ok: false, error: 'EACCES: kein Zugriff' }, root);

    expect(ergebnis.code).toBe('partial');
    expect(ergebnis.error).toBe('EACCES: kein Zugriff');
    expect(ergebnis.companionPath).toBeUndefined();
    expect(ergebnis.from).toBeUndefined();
  });

  it('meldet den Erfolgsfall unverändert', async () => {
    const root = makeRoot();

    const ergebnis = await benenneUm({ ok: true, bookDir: null }, root);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.path).toBe(path.join(root, 'Kundschaft.md'));
    expect(ergebnis.renamedCount).toBe(1);
  });
});
