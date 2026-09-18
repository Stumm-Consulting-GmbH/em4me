// 4T-001758 (Epic 3E-000253, AK2 und AK3): Unit-Tests der Bereichs-Erkennung —
// woran die Anwendung einen Datenbank-Bereich erkennt, und dass die Frage ohne
// gebundenen Bereich ohne Fehler beantwortbar bleibt.
//
// Geprüft wird an zwei Stellen, weil die Erkennung genau zwei hat: die
// Funktion selbst und ihr Feld im Katalog-Überblick, über das sie den
// Haupt-Prozess verlässt. Eine dritte gibt es nicht, und das ist der
// Gegenstand von AK2.
import { describe, it, expect } from 'vitest';
import {
  createDatabaseCatalogCache,
  istDatenbankBereich,
  katalogUeberblick,
} from '../../src/main/database/table-catalog.js';
import { DB_TABLE_KEY } from '../../src/shared/database/table-definition.js';
import { DB_DATABASE_KEY } from '../../src/shared/database/database-steckbrief.js';

// Nachgestellter Dateizugriff, nur so viel wie der Überblick braucht.
function fakeFs(dateien) {
  return {
    async stat(p) {
      if (!dateien[p]) throw new Error('ENOENT');
      return { mtimeMs: 1, size: Buffer.byteLength(dateien[p], 'utf8') };
    },
    async readFile(p) {
      if (!dateien[p]) throw new Error('ENOENT');
      return dateien[p];
    },
  };
}

// Eine Index-Sicht ist für den Katalog allein die Marken-Zuordnung.
function sichtMit(eintraege) {
  return { dbKindsPerFile: new Map(Object.entries(eintraege)) };
}

const TABELLE = '/db/Personen.md';
const STECKBRIEF = '/db/Datenbank.md';
const PROSA = '/db/Notiz.md';

const DATEIEN = {
  [TABELLE]: `---\n${DB_TABLE_KEY}:\n  fields:\n    - name: nachname\n      type: string\n---\n\nText.\n`,
  [STECKBRIEF]: `---\n${DB_DATABASE_KEY}:\n  name: Mini-CRM\n---\n\nBeschreibung.\n`,
  [PROSA]: '# Notiz\n\nNur Prosa.\n',
};

describe('Bereichs-Art: die Erkennung selbst (AK2, AK3)', () => {
  it('erkennt einen Bereich mit Steckbrief als Datenbank-Bereich', () => {
    expect(istDatenbankBereich(sichtMit({ [STECKBRIEF]: ['database'] }))).toBe(true);
  });

  it('erkennt einen Bereich ohne Steckbrief nicht als Datenbank-Bereich', () => {
    // Tabellen allein genügen nicht: Erkennungs-Merkmal ist nach der
    // Entscheidung des Product Owners vom 2026-09-15 der Steckbrief, und eine
    // Tabellen-Datei kann auch versehentlich in einem Prosa-Bereich liegen.
    expect(istDatenbankBereich(sichtMit({ [TABELLE]: ['table'] }))).toBe(false);
    expect(istDatenbankBereich(sichtMit({}))).toBe(false);
  });

  it('antwortet ohne Sicht mit false statt zu werfen', () => {
    // Der Fall «kein gebundener Bereich» und der Fall «Index noch im Aufbau»
    // enden beide hier; der Status daneben unterscheidet sie.
    expect(istDatenbankBereich(null)).toBe(false);
    expect(istDatenbankBereich(undefined)).toBe(false);
  });

  it('zählt einen defekten Steckbrief mit', () => {
    // Sonst verschwände mit der Bereichs-Art gerade die Anzeige, die dem
    // Anwender den Fehler zeigen müsste.
    const kaputt = { '/db/Kaputt.md': ['database'] };
    expect(istDatenbankBereich(sichtMit(kaputt))).toBe(true);
  });
});

describe('Bereichs-Art: der Weg nach außen (AK2)', () => {
  it('reist als Feld mit dem Katalog-Überblick', async () => {
    const fsp = fakeFs(DATEIEN);
    const cache = createDatabaseCatalogCache();
    const mit = await katalogUeberblick({
      sicht: sichtMit({ [TABELLE]: ['table'], [STECKBRIEF]: ['database'] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(mit.istDatenbankBereich).toBe(true);
    expect(mit.steckbrief.name).toBe('Mini-CRM');

    const ohne = await katalogUeberblick({
      sicht: sichtMit({ [PROSA]: [] }),
      status: 'ready',
      fsp,
      cache,
    });
    expect(ohne.istDatenbankBereich).toBe(false);
  });
});
