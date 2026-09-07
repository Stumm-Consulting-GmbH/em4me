// 4T-001499 (Epic 3E-000174): Unit-Matrix der Trefferlage des schnellen
// Datei-Oeffnens (src/shared/datei-oeffnen-auswahl.js).
//
// Geprueft wird, was dieses Modul selbst entscheidet: die Abbildung des
// Quell-Status auf die vier Anzeige-Zustaende und die Fehler-Festigkeit der
// Beschaffung. Filter und Reihenfolge gehoeren `waehleWikiZiele` und haben ihre
// eigene Matrix in `wiki-vorschlaege.test.js`; hier stehen nur die Faelle, die
// belegen, dass die geteilte Regel tatsaechlich zur Anwendung kommt — sonst
// pruefte diese Datei fremdes Verhalten mit und meldete beim naechsten
// Feinschliff dort einen Fehlschlag hier.
import { describe, it, expect } from 'vitest';
import {
  OEFFNEN_TREFFER_LIMIT,
  ZUSTAND,
  trefferlage,
  holeQuellAntwort,
} from '../../src/shared/datei-oeffnen-auswahl.js';

// Vorschlaege im Format der Namens-Quelle (views.js:93). Die Aenderungszeiten
// sind absichtlich nicht in Namens-Reihenfolge, damit eine Sortierung nach Zeit
// von einer nach Alphabet unterscheidbar ist.
const VORSCHLAEGE = [
  { name: 'Alt-Protokoll', kind: 'file', detail: '/archiv', mtimeMs: 100 },
  { name: 'Protokoll', kind: 'file', detail: '/notizen', mtimeMs: 300 },
  { name: 'Zwischenstand', kind: 'file', detail: '/notizen', mtimeMs: 200 },
];

const bereit = (suggestions = VORSCHLAEGE) => ({ status: 'ready', suggestions });

describe('trefferlage — Zustand der Quelle', () => {
  it('meldet «aufbau», solange der Index baut', () => {
    const lage = trefferlage({ status: 'indexing', suggestions: [] }, '');
    expect(lage.zustand).toBe(ZUSTAND.aufbau);
    expect(lage.treffer).toEqual([]);
  });

  it('meldet «nichtVerfuegbar» bei nicht verfuegbarer Quelle', () => {
    expect(trefferlage({ status: 'unavailable', suggestions: [] }, '').zustand).toBe(
      ZUSTAND.nichtVerfuegbar,
    );
  });

  it('meldet «nichtVerfuegbar» bei fehlender oder unverstaendlicher Antwort', () => {
    expect(trefferlage(null, '').zustand).toBe(ZUSTAND.nichtVerfuegbar);
    expect(trefferlage(undefined, '').zustand).toBe(ZUSTAND.nichtVerfuegbar);
    expect(trefferlage({}, '').zustand).toBe(ZUSTAND.nichtVerfuegbar);
  });

  it('unterscheidet «leer» von «aufbau» — der Kern der Fallunterscheidung', () => {
    // Beides ergibt eine leere Liste; fuer den Anwender sind es zwei Auskuenfte.
    expect(trefferlage(bereit(), 'gibtesnicht').zustand).toBe(ZUSTAND.leer);
    expect(trefferlage({ status: 'indexing', suggestions: [] }, 'gibtesnicht').zustand).toBe(
      ZUSTAND.aufbau,
    );
  });

  it('meldet «treffer», sobald mindestens einer passt', () => {
    const lage = trefferlage(bereit(), 'protokoll');
    expect(lage.zustand).toBe(ZUSTAND.treffer);
    expect(lage.treffer.length).toBeGreaterThan(0);
  });

  it('eine bereite Quelle ohne jede Datei ist «leer», nicht «nichtVerfuegbar»', () => {
    // Ein frisch angelegter, leerer Bereich: Die Quelle antwortet, sie hat nur
    // nichts zu bieten. Das ist kein Ausfall.
    expect(trefferlage(bereit([]), '').zustand).toBe(ZUSTAND.leer);
  });
});

describe('trefferlage — Anwendung der geteilten Auswahl-Regel', () => {
  it('filtert per Teilzeichenkette, unabhaengig von der Schreibweise', () => {
    const namen = trefferlage(bereit(), 'PROTOKOLL').treffer.map((t) => t.name);
    expect(namen).toContain('Protokoll');
    expect(namen).toContain('Alt-Protokoll');
    expect(namen).not.toContain('Zwischenstand');
  });

  it('leere Eingabe liefert alle Eintraege, zuletzt bearbeitet zuerst', () => {
    const namen = trefferlage(bereit(), '').treffer.map((t) => t.name);
    expect(namen).toEqual(['Protokoll', 'Zwischenstand', 'Alt-Protokoll']);
  });

  it('nimmt Zweitnamen mit und laesst ihre Unterscheidung stehen', () => {
    const mitAlias = [
      { name: 'Protokoll', kind: 'file', detail: '/notizen', mtimeMs: 100 },
      { name: 'Sitzungsnotiz', kind: 'alias', detail: 'Protokoll', mtimeMs: 100 },
    ];
    const treffer = trefferlage(bereit(mitAlias), 'sitzung').treffer;
    expect(treffer).toHaveLength(1);
    expect(treffer[0].kind).toBe('alias');
    // Der Zweitname nennt weiterhin seine Ziel-Datei, sonst waeren zwei gleich
    // aussehende Zeilen in der Liste nicht auseinanderzuhalten.
    expect(treffer[0].detail).toBe('Protokoll');
  });

  it('haelt das Limit ein', () => {
    const viele = Array.from({ length: OEFFNEN_TREFFER_LIMIT + 10 }, (_, i) => ({
      name: `Notiz ${i}`,
      kind: 'file',
      detail: '/notizen',
      mtimeMs: i,
    }));
    expect(trefferlage(bereit(viele), '').treffer).toHaveLength(OEFFNEN_TREFFER_LIMIT);
    // Ein eigenes Limit laesst sich uebergeben.
    expect(trefferlage(bereit(viele), '', 3).treffer).toHaveLength(3);
  });
});

describe('holeQuellAntwort — Beschaffung', () => {
  const api = (antwort) => ({ autocompleteWikiTargets: async () => antwort });

  it('reicht die Antwort der Bruecke durch, damit sie einmal geholt und oft gefiltert wird', async () => {
    const antwort = await holeQuellAntwort(api(bereit()), '/bereich/Datei.md');
    expect(antwort.status).toBe('ready');
    // Dieselbe Antwort traegt beliebig viele Eingaben, ohne erneut zu fragen.
    expect(trefferlage(antwort, 'protokoll').treffer.map((t) => t.name)).toContain('Protokoll');
    expect(trefferlage(antwort, 'zwischen').treffer.map((t) => t.name)).toEqual(['Zwischenstand']);
  });

  it('uebergibt die aktive Datei an die Bruecke', async () => {
    let gesehen = null;
    const merker = {
      autocompleteWikiTargets: async (pfad) => {
        gesehen = pfad;
        return bereit();
      },
    };
    await holeQuellAntwort(merker, '/bereich/Datei.md');
    expect(gesehen).toBe('/bereich/Datei.md');
  });

  // 4T-001514: Ohne aktive Datei wird sehr wohl gefragt — der Haupt-Prozess
  // nimmt dann den geoeffneten Bereich als Namensraum. Die erste Fassung brach
  // hier ab und sperrte damit genau die Lage, fuer die der Zugang gemacht ist:
  // ein frisch geoeffneter Bereich, in dem noch nichts offen ist.
  it('ohne aktive Datei wird trotzdem gefragt — der Bereich traegt den Namensraum', async () => {
    let gefragt = false;
    let gesehen = 'nicht gesetzt';
    const merker = {
      autocompleteWikiTargets: async (pfad) => {
        gefragt = true;
        gesehen = pfad;
        return bereit();
      },
    };
    const antwort = await holeQuellAntwort(merker, null);
    expect(gefragt).toBe(true);
    // Der leere Bezug geht unveraendert durch; die Gegenseite entscheidet.
    expect(gesehen).toBe(null);
    expect(trefferlage(antwort, '').zustand).toBe(ZUSTAND.treffer);
  });

  // Die Gegenprobe: Meldet die Gegenseite dann «nicht verfuegbar» — weil auch
  // kein Bereich offen ist —, traegt der Zustand das.
  it('ohne Datei UND ohne Bereich meldet die Gegenseite die fehlende Quelle', async () => {
    const ohneBeides = {
      autocompleteWikiTargets: async () => ({ status: 'unavailable', suggestions: [] }),
    };
    const antwort = await holeQuellAntwort(ohneBeides, null);
    expect(trefferlage(antwort, '').zustand).toBe(ZUSTAND.nichtVerfuegbar);
  });

  it('ein Wurf der Bruecke wird zur fehlenden Quelle, nicht zur Ausnahme', async () => {
    const kaputt = {
      autocompleteWikiTargets: async () => {
        throw new Error('IPC abgebrochen');
      },
    };
    await expect(holeQuellAntwort(kaputt, '/bereich/Datei.md')).resolves.toEqual({
      status: 'unavailable',
      suggestions: [],
    });
  });

  it('fehlende, unvollstaendige oder stumme Bruecke ergibt eine Ersatz-Antwort', async () => {
    const stumm = { autocompleteWikiTargets: async () => null };
    for (const bruecke of [null, {}, stumm]) {
      const antwort = await holeQuellAntwort(bruecke, '/x.md');
      expect(trefferlage(antwort, '').zustand).toBe(ZUSTAND.nichtVerfuegbar);
    }
  });
});
