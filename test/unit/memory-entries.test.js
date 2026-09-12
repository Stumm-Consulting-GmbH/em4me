// 4T-001598 (Epic 3E-000191, Story 4S-000906): Prüffälle der Listen-Logik der
// eingetragenen Gefäße.
//
// Geprüft wird gegen einen nachgestellten Speicher (Muster storeDouble aus
// test/unit/exchange-export.test.js), weil genau das die Zusicherung trägt:
// Anlegen, Auslesen und Entfernen müssen ein Neu-Laden überdauern (AK1, AK2).
// Dazu die Dedup über die normalisierte Pfad-Form (AK3), der Vorschlag ohne
// bereits eingetragene Gefäße (AK5) und der Eintrag mit nicht erreichbarem
// Pfad, der stehen bleibt und nicht wirft (AK7).
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isFilesystemCaseInsensitive } from '../../src/shared/platform.js';
import {
  addMemoryEntry,
  buildSuggestions,
  memoryKeyForPath,
  memoryKeyForWorkspace,
  normalizeMemoryEntries,
  removeMemoryEntry,
  sortMemoryEntries,
} from '../../src/main/memory/memory-entries.js';

// Ein nachgestellter Speicher in der Form, die electron-store liefert: get/set
// über den Schlüssel, der Inhalt überlebt als Feld. `neuLaden` stellt den
// Neustart nach: ein frischer Speicher über denselben rohen Daten.
function storeDouble(inhalt = {}) {
  return {
    daten: { ...inhalt },
    get(schluessel) {
      return this.daten[schluessel];
    },
    set(schluessel, wert) {
      this.daten[schluessel] = wert;
    },
    neuLaden() {
      return storeDouble(this.daten);
    },
  };
}

// Ein Ordner-Eintrag, wie ihn der Kanal memory:addPath baut.
function ordnerEintrag(kind, p, name) {
  return { kind, key: memoryKeyForPath(p), path: p, workspaceId: null, name };
}

const BEREICH = path.resolve('C:/Notizen/Privat');
const BUCH = path.resolve('C:/Notizen/Handbuch');
const REGAL = path.resolve('C:/Notizen/Bibliothek');

describe('Gefäß-Liste: anlegen, auslesen, entfernen', () => {
  it('überdauert ein Neu-Laden des Speichers', () => {
    const store = storeDouble({ memoryEntries: [] });
    const eingetragen = addMemoryEntry(
      normalizeMemoryEntries(store.get('memoryEntries')),
      ordnerEintrag('area', BEREICH, 'Privat'),
    );
    expect(eingetragen.ok).toBe(true);
    store.set('memoryEntries', eingetragen.entries);

    const nachNeustart = normalizeMemoryEntries(store.neuLaden().get('memoryEntries'));
    expect(nachNeustart).toHaveLength(1);
    expect(nachNeustart[0].kind).toBe('area');
    expect(nachNeustart[0].name).toBe('Privat');
    expect(nachNeustart[0].path).toBe(BEREICH);
    // Zeitstempel: UTC nach ISO 8601, sekundengenau.
    expect(nachNeustart[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const entfernt = removeMemoryEntry(nachNeustart, nachNeustart[0].key);
    expect(entfernt.removed).toBe(true);
    store.set('memoryEntries', entfernt.entries);
    expect(normalizeMemoryEntries(store.neuLaden().get('memoryEntries'))).toEqual([]);
  });

  it('meldet einen unbekannten Schlüssel als nichts entfernt', () => {
    const bestand = addMemoryEntry([], ordnerEintrag('book', BUCH, 'Handbuch')).entries;
    const ergebnis = removeMemoryEntry(bestand, 'gibt-es-nicht');
    expect(ergebnis.removed).toBe(false);
    expect(ergebnis.entries).toHaveLength(1);
  });

  it('trägt einen Arbeitsbereich über seine Kennung ein', () => {
    const ergebnis = addMemoryEntry([], {
      kind: 'workspace',
      key: memoryKeyForWorkspace('ws-1'),
      path: null,
      workspaceId: 'ws-1',
      name: 'Privat',
    });
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.entry.key).toBe('workspace:ws-1');
    expect(ergebnis.entry.path).toBeNull();
  });

  it('weist einen Eintrag ohne verwertbare Art oder Kennung ab', () => {
    expect(addMemoryEntry([], { kind: 'ordner', key: 'x', path: BEREICH }).error).toBe('invalid');
    expect(addMemoryEntry([], { kind: 'area', key: '', path: BEREICH }).error).toBe('invalid');
    expect(addMemoryEntry([], { kind: 'area', key: 'x', path: null }).error).toBe('invalid');
  });
});

describe('Gefäß-Liste: Dedup über den Pfad', () => {
  it('erzeugt keinen zweiten Eintrag bei anderer Schreibweise', () => {
    const erste = addMemoryEntry([], ordnerEintrag('area', BEREICH, 'Privat'));
    const zweite = addMemoryEntry(
      erste.entries,
      ordnerEintrag('area', 'C:/Notizen/Privat/', 'Privat, anders geschrieben'),
    );
    expect(zweite.ok).toBe(false);
    expect(zweite.error).toBe('duplicate');
    expect(erste.entries).toHaveLength(1);
  });

  it('erzeugt keinen zweiten Eintrag bei anderer Groß-Kleinschreibung', () => {
    // Nur dort, wo das Dateisystem die Schreibung ignoriert — die Dedup folgt
    // der zentralen Plattform-Eigenschaft (shared/platform.js), nicht einer
    // eigenen Annahme.
    if (!isFilesystemCaseInsensitive()) return;
    const erste = addMemoryEntry([], ordnerEintrag('shelf', REGAL, 'Bibliothek'));
    const zweite = addMemoryEntry(
      erste.entries,
      ordnerEintrag('shelf', REGAL.toUpperCase(), 'BIBLIOTHEK'),
    );
    expect(zweite.error).toBe('duplicate');
  });

  it('verwirft Dubletten schon beim Laden der gespeicherten Liste', () => {
    const roh = [
      { kind: 'area', key: memoryKeyForPath(BEREICH), path: BEREICH, name: 'Privat' },
      { kind: 'area', key: memoryKeyForPath(BEREICH), path: BEREICH, name: 'Privat (2)' },
    ];
    const geladen = normalizeMemoryEntries(roh);
    expect(geladen).toHaveLength(1);
    expect(geladen[0].name).toBe('Privat');
  });
});

describe('Gefäß-Liste: nicht erreichbarer Pfad', () => {
  it('bleibt beim Auslesen stehen und wirft nicht', () => {
    const fehlt = path.resolve('Z:/nicht-verbunden/Archiv');
    const store = storeDouble({
      memoryEntries: addMemoryEntry([], ordnerEintrag('area', fehlt, 'Archiv')).entries,
    });
    // Kein Datei-Zugriff in der Listen-Logik: das Lesen ist unabhaengig davon,
    // ob der Ordner gerade existiert.
    expect(() => normalizeMemoryEntries(store.neuLaden().get('memoryEntries'))).not.toThrow();
    const geladen = normalizeMemoryEntries(store.neuLaden().get('memoryEntries'));
    expect(geladen).toHaveLength(1);
    expect(geladen[0].path).toBe(fehlt);
  });
});

describe('Gefäß-Liste: Vorschlag beim Eintragen', () => {
  it('nennt die Verlaufs-Listen und die Arbeitsbereiche ohne die eingetragenen', () => {
    const entries = addMemoryEntry([], ordnerEintrag('book', BUCH, 'Handbuch')).entries;
    const mitArbeitsbereich = addMemoryEntry(entries, {
      kind: 'workspace',
      key: memoryKeyForWorkspace('ws-1'),
      path: null,
      workspaceId: 'ws-1',
      name: 'Privat',
    }).entries;

    const vorschlag = buildSuggestions({
      recentAreas: [BEREICH],
      recentBooks: [BUCH, path.resolve('C:/Notizen/Roman')],
      recentShelves: [REGAL],
      workspaces: [
        { id: 'ws-1', name: 'Privat' },
        { id: 'ws-2', name: 'Arbeit' },
      ],
      entries: mitArbeitsbereich,
    });

    expect(vorschlag.areas.map((v) => v.name)).toEqual(['Privat']);
    // Das eingetragene Buch faellt heraus, das andere bleibt.
    expect(vorschlag.books.map((v) => v.name)).toEqual(['Roman']);
    expect(vorschlag.shelves.map((v) => v.name)).toEqual(['Bibliothek']);
    // Der eingetragene Arbeitsbereich faellt heraus.
    expect(vorschlag.workspaces.map((v) => v.workspaceId)).toEqual(['ws-2']);
  });

  it('kommt mit fehlenden Listen zurecht', () => {
    expect(buildSuggestions()).toEqual({ workspaces: [], areas: [], books: [], shelves: [] });
  });
});

describe('Gefäß-Liste: Anzeige-Reihenfolge', () => {
  it('ordnet nach Art und innerhalb nach Name', () => {
    const liste = [
      { kind: 'shelf', name: 'Bibliothek' },
      { kind: 'area', name: 'Zettel' },
      { kind: 'workspace', name: 'Privat' },
      { kind: 'area', name: 'Archiv' },
      { kind: 'book', name: 'Handbuch' },
    ];
    expect(sortMemoryEntries(liste).map((e) => e.name)).toEqual([
      'Privat',
      'Archiv',
      'Zettel',
      'Handbuch',
      'Bibliothek',
    ]);
  });
});
