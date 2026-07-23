// 4T-0331 (Epic 3E-0060): Unit-Tests für den Kern der Dokument-Historie
// (src/main/mdd-store.js): Container-Roundtrip mit unbekannten Sektionen,
// Paket-Bildung (Coalescing über injizierte Uhr), Hash-Abgleich mit
// external-Paketen, Anker-Kadenz und Revisions-Rekonstruktion.
import { describe, it, expect } from 'vitest';
import {
  ANCHOR_EVERY,
  hashText,
  isoSeconds,
  emptyContainer,
  parseContainer,
  serializeContainer,
  reconstructRevision,
  lastRecordedState,
  recordExternalIfNeeded,
  recordSave,
  getNote,
  setNote,
  getBlockData,
  getAllBlockData,
  blockAnchorIdsWithData,
  setBlockData,
  renameBlockAnchor,
  MDDA_FILENAME,
  LEGACY_MDDB_FILENAME,
  emptySettingsContainer,
  parseSettingsContainer,
  resolveHistoryEnabled,
} from '../../src/main/mdd-store.js';

const MIN = 60_000;
const OPTS = { maxPacketMs: 5 * MIN, inactivityMs: 2 * MIN };
const T0 = Date.UTC(2026, 6, 3, 12, 0, 0);

// Hilfe: Speicher-Schritt mit fortgeschriebenem openPacket-Zustand.
function save(container, state, previousText, newText, nowMs) {
  const r = recordSave(container, { previousText, newText, nowMs, openPacket: state, ...OPTS });
  return r.openPacket;
}

describe('Container parse/serialize (4T-0331)', () => {
  it('Roundtrip erhält unbekannte Sektionen (Vorwärts-Kompatibilität)', () => {
    const c = emptyContainer();
    // Beliebige künftige Sektion, die dieses Schema noch nicht kennt: bleibt
    // beim Serialisieren/Parsen erhalten. `notes` ist seit 4T-0358 real und
    // hat eigene Tests weiter unten.
    c.futureSection = [{ ts: '2026-07-03T12:00:00Z', value: 42 }];
    const raw = serializeContainer(c);
    const parsed = parseContainer(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.container.futureSection).toEqual(c.futureSection);
    expect(parsed.container.schemaVersion).toBe(1);
  });

  it('weist defekte Container ab, ohne zu werfen', () => {
    expect(parseContainer('kein json').ok).toBe(false);
    expect(parseContainer('[]').ok).toBe(false);
    expect(parseContainer('{"schemaVersion":99,"history":{"anchors":[],"packets":[]}}').ok).toBe(
      false,
    );
    expect(parseContainer('{"schemaVersion":1}').ok).toBe(false);
  });
});

describe('recordSave: erster Anker und Pakete (4T-0331)', () => {
  it('erste Speicherung legt Anker (Ausgangsstand) plus Paket an', () => {
    const c = emptyContainer();
    save(c, null, 'alt\nText', 'neu\nText', T0);
    expect(c.history.anchors).toHaveLength(1);
    expect(c.history.anchors[0].baseSeq).toBe(0);
    expect(c.history.anchors[0].text).toBe('alt\nText');
    expect(c.history.packets).toHaveLength(1);
    expect(c.history.packets[0].trigger).toBe('edit');
    expect(c.history.packets[0].ts).toBe('2026-07-03T12:00:00Z');
    expect(reconstructRevision(c.history, 0)).toBe('neu\nText');
    expect(reconstructRevision(c.history, -1)).toBe('alt\nText');
  });

  it('neue Datei (previousText null) startet mit leerem Ausgangsstand', () => {
    const c = emptyContainer();
    save(c, null, null, 'Inhalt', T0);
    expect(c.history.anchors[0].text).toBe('');
    expect(reconstructRevision(c.history, 0)).toBe('Inhalt');
  });

  it('Speichern ohne Änderung erzeugt kein Paket', () => {
    const c = emptyContainer();
    const s1 = save(c, null, 'a', 'b', T0);
    save(c, s1, 'b', 'b', T0 + 10_000);
    expect(c.history.packets).toHaveLength(1);
  });
});

describe('recordSave: Coalescing über die zwei Zeitparameter (4T-0331)', () => {
  it('Folge-Speicherungen im Fenster mergen in ein Paket', () => {
    const c = emptyContainer();
    let s = save(c, null, 'a', 'a\nb', T0);
    s = save(c, s, 'a\nb', 'a\nb\nc', T0 + 60_000);
    save(c, s, 'a\nb\nc', 'a\nb\nc\nd', T0 + 110_000);
    expect(c.history.packets).toHaveLength(1);
    expect(c.history.packets[0].tsEnd).toBe('2026-07-03T12:01:50Z');
    expect(reconstructRevision(c.history, 0)).toBe('a\nb\nc\nd');
  });

  it('Inaktivitäts-Schluss beendet das Paket (> 2 Minuten Pause)', () => {
    const c = emptyContainer();
    const s = save(c, null, 'a', 'a\nb', T0);
    save(c, s, 'a\nb', 'a\nb\nc', T0 + 2 * MIN + 1000);
    expect(c.history.packets).toHaveLength(2);
  });

  it('maximale Paket-Dauer beendet das Paket (> 5 Minuten seit Beginn)', () => {
    const c = emptyContainer();
    let s = save(c, null, 'a', 'a\nb', T0);
    // Alle 90 s eine Speicherung: Inaktivität nie überschritten, Dauer schon.
    for (let i = 1; i <= 4; i++) {
      s = save(c, s, null, `a\nb\n${i}`, T0 + i * 90_000);
    }
    expect(c.history.packets.length).toBeGreaterThan(1);
    const lastSeq = c.history.packets.length - 1;
    expect(reconstructRevision(c.history, lastSeq)).toBe('a\nb\n4');
  });

  it('Rückkehr zum Basis-Stand im Fenster entfernt das leere Paket', () => {
    const c = emptyContainer();
    const s = save(c, null, 'a', 'a\nb', T0);
    save(c, s, 'a\nb', 'a', T0 + 30_000);
    expect(c.history.packets).toHaveLength(0);
    // Historie bleibt konsistent: Ausgangsstand rekonstruierbar.
    expect(reconstructRevision(c.history, -1)).toBe('a');
  });
});

describe('Hash-Abgleich und external-Pakete (4T-0331)', () => {
  it('Fremd-Änderung vor dem Speichern erzeugt ein external-Paket', () => {
    const c = emptyContainer();
    const s = save(c, null, 'a', 'a\nb', T0);
    // Datei wurde außerhalb geändert: previousText passt nicht zu 'a\nb'.
    save(c, s, 'FREMD\na\nb', 'FREMD\na\nb\nc', T0 + 30_000);
    expect(c.history.packets).toHaveLength(3);
    expect(c.history.packets[1].trigger).toBe('external');
    expect(reconstructRevision(c.history, 1)).toBe('FREMD\na\nb');
    expect(reconstructRevision(c.history, 2)).toBe('FREMD\na\nb\nc');
  });

  it('recordExternalIfNeeded ist idempotent bei passendem Stand', () => {
    const c = emptyContainer();
    save(c, null, 'a', 'a\nb', T0);
    expect(recordExternalIfNeeded(c, 'a\nb', T0 + 1000)).toBe(false);
    expect(recordExternalIfNeeded(c, 'a\nEXTERN', T0 + 2000)).toBe(true);
    expect(c.history.packets[1].trigger).toBe('external');
    expect(lastRecordedState(c.history).hash).toBe(hashText('a\nEXTERN'));
  });
});

describe('Bereichsdatei und Drei-Ebenen-Auflösung (4T-0332)', () => {
  it('Settings-Container: Roundtrip und Ablehnung defekter Formen', () => {
    expect(MDDA_FILENAME).toBe('Area_Settings.mdda');
    expect(LEGACY_MDDB_FILENAME).toBe('Area_Settings.mddb');
    const c = emptySettingsContainer();
    c.settings.history = true;
    const parsed = parseSettingsContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(parsed.container.settings.history).toBe(true);
    expect(parseSettingsContainer('kein json').ok).toBe(false);
    expect(parseSettingsContainer('{"schemaVersion":1}').ok).toBe(false);
    expect(parseSettingsContainer('{"schemaVersion":2,"settings":{}}').ok).toBe(false);
  });

  // 4T-0543 (Epic 3E-0097): calendarSystems-Sektion im Settings-Container —
  // Roundtrip neben bestehenden Sektionen (bestehende bleiben unberührt).
  it('Settings-Container: calendarSystems überlebt den Roundtrip neben anderen Sektionen', () => {
    const c = emptySettingsContainer();
    c.settings.history = true;
    c.settings.journals = { shelves: ['Tagebuch'], journals: [] };
    c.settings.calendarSystems = {
      blocks: [
        {
          id: 'welt',
          name: 'Welt',
          calendars: [
            {
              id: 'mond',
              name: 'Mond',
              levels: [
                { id: 'tag', name: 'Tag', section: 'Datum', start: 1, names: null, rel: null },
              ],
            },
          ],
        },
      ],
    };
    const parsed = parseSettingsContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(parsed.container.settings.calendarSystems).toEqual(c.settings.calendarSystems);
    expect(parsed.container.settings.history).toBe(true);
    expect(parsed.container.settings.journals).toEqual(c.settings.journals);
  });

  // 4T-0625 (Epic 3E-0119): sidebarLayouts-Sektion (Bereichs-Varianten der
  // Sidebar) im Settings-Container — Roundtrip neben bestehenden Sektionen.
  it('Settings-Container: sidebarLayouts überlebt den Roundtrip neben anderen Sektionen', () => {
    const c = emptySettingsContainer();
    c.settings.history = true;
    c.settings.journals = { shelves: ['Tagebuch'], journals: [] };
    c.settings.sidebarLayouts = [
      {
        id: 'v1',
        name: 'Konzeptarbeit',
        layout: { left: [{ panels: ['outline'], active: 'outline' }], right: [] },
        visibility: { outline: [true, false] },
      },
    ];
    const parsed = parseSettingsContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(parsed.container.settings.sidebarLayouts).toEqual(c.settings.sidebarLayouts);
    expect(parsed.container.settings.history).toBe(true);
    expect(parsed.container.settings.journals).toEqual(c.settings.journals);
  });

  it('Datei schlägt Bereich schlägt App, nicht gesetzt heißt erben', () => {
    // Alle acht Kombinationen der drei Ebenen (Datei/Bereich je dreiwertig).
    const r = resolveHistoryEnabled;
    expect(r({ fileValue: true, areaValue: false, appValue: false })).toEqual({
      effective: true,
      source: 'file',
    });
    expect(r({ fileValue: false, areaValue: true, appValue: true })).toEqual({
      effective: false,
      source: 'file',
    });
    expect(r({ fileValue: undefined, areaValue: true, appValue: false })).toEqual({
      effective: true,
      source: 'area',
    });
    expect(r({ fileValue: undefined, areaValue: false, appValue: true })).toEqual({
      effective: false,
      source: 'area',
    });
    expect(r({ fileValue: undefined, areaValue: undefined, appValue: true })).toEqual({
      effective: true,
      source: 'app',
    });
    expect(r({ fileValue: undefined, areaValue: undefined, appValue: false })).toEqual({
      effective: false,
      source: 'app',
    });
    // Nicht-boolesche Werte (z.B. YAML `history: ja` als String) erben.
    expect(r({ fileValue: 'ja', areaValue: undefined, appValue: true }).source).toBe('app');
  });
});

describe('Anker-Kadenz und lange Historien (4T-0331)', () => {
  it(`setzt alle ${ANCHOR_EVERY} finalen Pakete einen Anker und rekonstruiert exakt`, () => {
    const c = emptyContainer();
    let s = null;
    let text = 'Start';
    const staende = [];
    // 45 getrennte Pakete (jede Speicherung > Inaktivitäts-Fenster).
    for (let i = 0; i < 45; i++) {
      const prev = text;
      text = `${text}\nZeile ${i}`;
      s = save(c, s, prev, text, T0 + i * (3 * MIN));
      staende.push(text);
    }
    expect(c.history.packets).toHaveLength(45);
    expect(c.history.anchors.length).toBe(1 + Math.floor(45 / ANCHOR_EVERY));
    for (let i = 0; i < 45; i += 7) {
      expect(reconstructRevision(c.history, i)).toBe(staende[i]);
    }
    expect(reconstructRevision(c.history, 44)).toBe(text);
  });
});

describe('Notizen-Sektion (4T-0358)', () => {
  it('leerer Container hat keine Notiz', () => {
    expect(getNote(emptyContainer())).toBeNull();
  });

  it('setNote setzt { text, updated }, getNote liest es zurück', () => {
    const c = emptyContainer();
    setNote(c, 'Meine **Notiz**', T0);
    expect(c.notes).toEqual({ text: 'Meine **Notiz**', updated: isoSeconds(T0) });
    expect(getNote(c)).toEqual({ text: 'Meine **Notiz**', updated: '2026-07-03T12:00:00Z' });
  });

  it('leerer oder reiner Whitespace-Text entfernt die Sektion', () => {
    const c = emptyContainer();
    setNote(c, 'da', T0);
    expect(getNote(c)).not.toBeNull();
    setNote(c, '   \n  ', T0 + 1000);
    expect('notes' in c).toBe(false);
    expect(getNote(c)).toBeNull();
  });

  it('speichert den Text ungetrimmt (nur die Leer-Prüfung trimmt)', () => {
    const c = emptyContainer();
    setNote(c, '  Rand-Leerzeichen  ', T0);
    expect(getNote(c).text).toBe('  Rand-Leerzeichen  ');
  });

  it('Roundtrip erhält Notiz und Historie gemeinsam', () => {
    const c = emptyContainer();
    save(c, null, 'a', 'a\nb', T0); // Historie füllen
    setNote(c, 'Begleit-Notiz', T0);
    const parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(getNote(parsed.container)).toEqual({ text: 'Begleit-Notiz', updated: isoSeconds(T0) });
    expect(parsed.container.history.packets).toHaveLength(1);
    expect(reconstructRevision(parsed.container.history, 0)).toBe('a\nb');
  });

  it('Notiz und Historie sind entkoppelt', () => {
    const c = emptyContainer();
    setNote(c, 'zuerst Notiz', T0);
    // Historien-Schreiben lässt die Notiz unberührt.
    save(c, null, 'a', 'a\nb', T0 + 1000);
    expect(getNote(c).text).toBe('zuerst Notiz');
    // Notiz-Schreiben lässt die Historie unberührt.
    const historyBefore = JSON.stringify(c.history);
    setNote(c, 'geänderte Notiz', T0 + 2000);
    expect(JSON.stringify(c.history)).toBe(historyBefore);
    expect(getNote(c).text).toBe('geänderte Notiz');
  });

  it('defekte notes-Sektion setzt nur die Notiz aus, nie den Container', () => {
    // parseContainer validiert notes nicht: eine defekte Sektion bleibt als
    // unbekannter Inhalt erhalten, die Historie bleibt gültig, getNote gibt
    // null (tolerant).
    const c = emptyContainer();
    c.notes = 'kaputt'; // kein Objekt
    let parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(getNote(parsed.container)).toBeNull();

    c.notes = { text: 123 }; // text kein String
    parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(getNote(parsed.container)).toBeNull();

    c.notes = []; // Array
    expect(getNote(c)).toBeNull();
  });
});

describe('Block-Metadaten-Sektion (4T-0363)', () => {
  it('leerer Container hat keine Block-Daten', () => {
    const c = emptyContainer();
    expect(getBlockData(c, 'x')).toBeNull();
    expect(getAllBlockData(c)).toEqual({});
    expect(blockAnchorIdsWithData(c)).toEqual([]);
  });

  it('setBlockData setzt { values, updated }, getBlockData liest es zurück', () => {
    const c = emptyContainer();
    setBlockData(c, 'a1b2c3', { status: 'offen', prio: 3 }, T0);
    expect(c.blockData).toEqual({
      a1b2c3: { values: { status: 'offen', prio: 3 }, updated: isoSeconds(T0) },
    });
    expect(getBlockData(c, 'a1b2c3')).toEqual({
      values: { status: 'offen', prio: 3 },
      updated: '2026-07-03T12:00:00Z',
    });
  });

  it('mehrere Anker koexistieren; getAllBlockData listet nur wohlgeformte', () => {
    const c = emptyContainer();
    setBlockData(c, 'aaa', { k: 'v' }, T0);
    setBlockData(c, 'bbb', { m: 'n' }, T0 + 1000);
    expect(Object.keys(getAllBlockData(c)).sort()).toEqual(['aaa', 'bbb']);
    expect(blockAnchorIdsWithData(c).sort()).toEqual(['aaa', 'bbb']);
  });

  it('leeres values-Objekt entfernt den Anker-Eintrag; leere Sektion fällt weg', () => {
    const c = emptyContainer();
    setBlockData(c, 'aaa', { k: 'v' }, T0);
    setBlockData(c, 'bbb', { m: 'n' }, T0);
    setBlockData(c, 'aaa', {}, T0 + 1000);
    expect(getBlockData(c, 'aaa')).toBeNull();
    expect('aaa' in c.blockData).toBe(false);
    setBlockData(c, 'bbb', {}, T0 + 2000);
    expect('blockData' in c).toBe(false);
  });

  it('renameBlockAnchor verschiebt den Eintrag und setzt updated neu', () => {
    const c = emptyContainer();
    setBlockData(c, 'alt', { k: 'v' }, T0);
    renameBlockAnchor(c, 'alt', 'neu', T0 + 5000);
    expect(getBlockData(c, 'alt')).toBeNull();
    expect(getBlockData(c, 'neu')).toEqual({
      values: { k: 'v' },
      updated: isoSeconds(T0 + 5000),
    });
  });

  it('renameBlockAnchor ohne Quell-Eintrag tut nichts', () => {
    const c = emptyContainer();
    setBlockData(c, 'da', { k: 'v' }, T0);
    renameBlockAnchor(c, 'fehlt', 'ziel', T0);
    expect(getBlockData(c, 'ziel')).toBeNull();
    expect(getBlockData(c, 'da')).not.toBeNull();
  });

  it('Roundtrip erhält Block-Daten, Historie und Notiz gemeinsam', () => {
    const c = emptyContainer();
    save(c, null, 'a', 'a\nb', T0); // Historie füllen
    setNote(c, 'Notiz', T0);
    setBlockData(c, 'blk', { status: 'fertig' }, T0);
    const parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(getBlockData(parsed.container, 'blk')).toEqual({
      values: { status: 'fertig' },
      updated: isoSeconds(T0),
    });
    expect(getNote(parsed.container).text).toBe('Notiz');
    expect(reconstructRevision(parsed.container.history, 0)).toBe('a\nb');
  });

  it('Block-Daten und Historie sind entkoppelt', () => {
    const c = emptyContainer();
    setBlockData(c, 'blk', { k: 'v' }, T0);
    const before = JSON.stringify(c.blockData);
    save(c, null, 'a', 'a\nb', T0 + 1000);
    expect(JSON.stringify(c.blockData)).toBe(before);
  });

  it('defekte blockData-Sektion setzt nur die Block-Daten aus, nie den Container', () => {
    const c = emptyContainer();
    c.blockData = 'kaputt'; // kein Objekt
    let parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(getAllBlockData(parsed.container)).toEqual({});

    // Einzelne defekte Einträge werden übersprungen, wohlgeformte bleiben.
    c.blockData = { gut: { values: { k: 'v' } }, schlecht: { kein: 'values' } };
    parsed = parseContainer(serializeContainer(c));
    expect(parsed.ok).toBe(true);
    expect(Object.keys(getAllBlockData(parsed.container))).toEqual(['gut']);
  });
});
