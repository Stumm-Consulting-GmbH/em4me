// 4T-0408 (Epic 3E-0077): Lese-Pfad der Block-Daten fuer den Abfrage-Index —
// Extraktion der blockData-Sektion aus dem rohen .mdd-Inhalt (Normalisierung,
// Fehler-Isolation). Die Index-Integration (BLOCKS-Scope, Invalidierung ueber
// updateBlockDataForFile) prueft test/unit/perspective-query-index.test.js
// gegen echte Temp-Verzeichnis-Fixtures.
import { describe, it, expect } from 'vitest';
import { extractBlockEntries } from '../../src/main/backlinks.js';

function mddRaw(sections) {
  return JSON.stringify({
    schemaVersion: 1,
    history: { anchors: [], packets: [] },
    ...sections,
  });
}

describe('extractBlockEntries — Lese-Pfad der blockData-Sektion (4T-0408)', () => {
  it('liefert null ohne blockData-Sektion (Substring-Vorpruefung)', () => {
    expect(extractBlockEntries(mddRaw({}))).toBeNull();
    expect(extractBlockEntries(mddRaw({ notes: { text: 'Notiz' } }))).toBeNull();
    expect(extractBlockEntries('')).toBeNull();
    expect(extractBlockEntries(null)).toBeNull();
  });

  it('liefert normalisierte Eintraege alphabetisch nach Anker', () => {
    const raw = mddRaw({
      blockData: {
        zzz: { values: { Status: 'offen' }, updated: '2026-07-08T09:00:00Z' },
        abc: { values: { prio: 3, fertig: false }, updated: '2026-07-01T10:30:00Z' },
      },
    });
    const entries = extractBlockEntries(raw);
    expect(entries.map((e) => e.anchor)).toEqual(['abc', 'zzz']);
    // Schluessel lowercase (wie Frontmatter-Properties), Werte typ-erhaltend.
    expect(entries[1].values).toEqual({ status: 'offen' });
    expect(entries[0].values).toEqual({ prio: 3, fertig: false });
    // updated (UTC ISO-8601 mit Z) wird zonen-korrekt zu Epoch-ms.
    expect(entries[1].updatedMs).toBe(Date.parse('2026-07-08T09:00:00Z'));
  });

  it('trimmt Strings, entfernt leere Werte und leere Listen', () => {
    const raw = mddRaw({
      blockData: {
        a1: {
          values: { name: '  Alpha  ', leer: '   ', liste: ['x ', '', ' y'], leereListe: [''] },
          updated: '2026-07-08T09:00:00Z',
        },
      },
    });
    const entries = extractBlockEntries(raw);
    expect(entries[0].values).toEqual({ name: 'Alpha', liste: ['x', 'y'] });
  });

  it('fehlender oder defekter updated-Zeitstempel wird null', () => {
    const raw = mddRaw({
      blockData: {
        a1: { values: { k: 'v' } },
        b2: { values: { k: 'v' }, updated: 'kein-datum' },
      },
    });
    const entries = extractBlockEntries(raw);
    expect(entries[0].updatedMs).toBeNull();
    expect(entries[1].updatedMs).toBeNull();
  });

  it('Fehler-Isolation: defekter JSON und defekte Sektion liefern null', () => {
    expect(extractBlockEntries('{ "blockData": kaputt')).toBeNull();
    // parseContainer lehnt fremde schemaVersion ab -> Block-Ebene ausgesetzt.
    expect(
      extractBlockEntries(
        JSON.stringify({ schemaVersion: 99, history: { anchors: [], packets: [] }, blockData: {} }),
      ),
    ).toBeNull();
    // blockData vorhanden, aber kein Objekt -> keine Eintraege (null).
    expect(extractBlockEntries(mddRaw({ blockData: 'defekt' }))).toBeNull();
  });

  it('defekte Einzel-Eintraege werden uebersprungen, intakte bleiben', () => {
    const raw = mddRaw({
      blockData: {
        kaputt: { keineValues: true },
        ok: { values: { k: 'v' }, updated: '2026-07-08T09:00:00Z' },
      },
    });
    const entries = extractBlockEntries(raw);
    expect(entries.map((e) => e.anchor)).toEqual(['ok']);
  });
});
