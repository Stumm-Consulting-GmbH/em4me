// 4T-001439 (Story 4S-000869, Epic 3E-000231): Herkunft im Änderungspaket.
//
// Die Angabe ist eine **Feststellung** darüber, wer wann was geändert hat. Zwei
// Eigenschaften machen sie brauchbar oder unbrauchbar, und beide werden hier
// geprüft: Sie darf nie erfunden werden, und sie darf nie nachträglich anders
// lauten als zum Zeitpunkt der Änderung.
import { describe, it, expect } from 'vitest';
import {
  emptyContainer,
  recordSave,
  serializeContainer,
  parseContainer,
} from '../../src/main/documents/mdd-store.js';

const ANNA = { benutzer: 'anna', rechner: 'SC-026' };
const BERND = { benutzer: 'bernd', rechner: 'SC-027' };

// Weit außerhalb jedes Zusammenfass-Fensters, damit ein Aufruf sicher ein
// eigenes Paket erzeugt.
const WEIT = 60 * 60 * 1000;

function speichern(container, { vorher, neu, nowMs, herkunft, openPacket = null }) {
  return recordSave(container, {
    previousText: vorher,
    newText: neu,
    nowMs,
    openPacket,
    herkunft,
    maxPacketMs: 5 * 60 * 1000,
    inactivityMs: 2 * 60 * 1000,
  });
}

describe('mdd-herkunft: die Angaben im Paket', () => {
  // AK1
  it('schreibt Benutzer und Rechner in ein neu entstehendes Paket', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'alt\n', neu: 'neu\n', nowMs: 1000, herkunft: ANNA });

    const paket = c.history.packets.at(-1);
    expect(paket.benutzer).toBe('anna');
    expect(paket.rechner).toBe('SC-026');
    // Getrennt, nicht zusammengesetzt.
    expect(JSON.stringify(paket)).not.toContain('anna@SC-026');
  });

  it('haelt die Angaben ueber Serialisieren und Lesen hinweg', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'alt\n', neu: 'neu\n', nowMs: 1000, herkunft: ANNA });

    const gelesen = parseContainer(serializeContainer(c));

    expect(gelesen.ok).toBe(true);
    expect(gelesen.container.history.packets.at(-1)).toMatchObject(ANNA);
  });

  // AK3 der Story-Ebene, hier als Format-Zusage: keine neue Schema-Version.
  // Eine abweichende Nummer laesst den Leser die GANZE Historie verwerfen —
  // aeltere Programmfassungen koennten die Begleitdatei dann nicht mehr lesen.
  it('erhoeht die Schema-Version nicht', () => {
    const c = emptyContainer();
    const vorher = c.schemaVersion;
    speichern(c, { vorher: 'alt\n', neu: 'neu\n', nowMs: 1000, herkunft: ANNA });
    expect(c.schemaVersion).toBe(vorher);
  });
});

// AK3 des Tasks: nicht ermittelbare Angaben werden weggelassen, nicht als null
// geschrieben. Ein Paket ohne Auskunft sieht damit genauso aus wie eines aus
// der Zeit vor diesem Epic.
describe('mdd-herkunft: fehlende Angaben', () => {
  it('laesst die Felder weg, wenn nichts ermittelbar war', () => {
    const c = emptyContainer();
    speichern(c, {
      vorher: 'alt\n',
      neu: 'neu\n',
      nowMs: 1000,
      herkunft: { benutzer: null, rechner: null },
    });

    const paket = c.history.packets.at(-1);
    expect('benutzer' in paket).toBe(false);
    expect('rechner' in paket).toBe(false);
  });

  it('laesst die Felder weg, wenn gar keine Herkunft uebergeben wurde', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'alt\n', neu: 'neu\n', nowMs: 1000, herkunft: undefined });

    const paket = c.history.packets.at(-1);
    expect('benutzer' in paket).toBe(false);
    expect('rechner' in paket).toBe(false);
  });

  it('nimmt die eine Angabe auf, wenn nur die andere fehlt', () => {
    const c = emptyContainer();
    speichern(c, {
      vorher: 'alt\n',
      neu: 'neu\n',
      nowMs: 1000,
      herkunft: { benutzer: null, rechner: 'SC-026' },
    });

    const paket = c.history.packets.at(-1);
    expect('benutzer' in paket).toBe(false);
    expect(paket.rechner).toBe('SC-026');
  });
});

// AK2: Bestehende Einträge bleiben unverändert. Das ist der Fall, der auf
// **jeden** vorhandenen Bestand zutrifft.
describe('mdd-herkunft: Bestand ohne die Angaben', () => {
  it('liest eine Historie ohne Herkunft ohne Fehler', () => {
    const alt = {
      schemaVersion: 1,
      history: {
        anchors: [{ ts: '2026-01-01T10:00:00Z', baseSeq: 0, text: 'alt\n', hash: 'x' }],
        packets: [
          {
            ts: '2026-01-01T10:01:00Z',
            tsEnd: '2026-01-01T10:01:00Z',
            trigger: 'edit',
            ops: [],
            hashAfter: 'y',
          },
        ],
      },
    };

    const gelesen = parseContainer(JSON.stringify(alt));

    expect(gelesen.ok).toBe(true);
    expect(gelesen.container.history.packets[0].benutzer).toBeUndefined();
  });

  it('laesst vorhandene Pakete beim naechsten Speichern unberuehrt', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: undefined });
    const altesPaket = { ...c.history.packets.at(-1) };

    speichern(c, { vorher: 'b\n', neu: 'c\n', nowMs: 1000 + WEIT, herkunft: ANNA });

    expect(c.history.packets[0]).toEqual(altesPaket);
    expect(c.history.packets.at(-1).benutzer).toBe('anna');
  });
});

// AK5: nie nachträglich umschreiben — die tragende Eigenschaft der Angabe.
describe('mdd-herkunft: keine nachträgliche Änderung', () => {
  it('schreibt ein altes Paket bei geaenderter Kennung nicht um', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });

    speichern(c, { vorher: 'b\n', neu: 'c\n', nowMs: 1000 + WEIT, herkunft: BERND });

    expect(c.history.packets[0]).toMatchObject(ANNA);
    expect(c.history.packets[1]).toMatchObject(BERND);
  });

  // Der Fall, der ohne eigene Regel still falsch geworden wäre: Zwei
  // Speicherungen dicht hintereinander werden normalerweise zu einem Paket
  // zusammengefasst. Bei verschiedener Herkunft trüge dieses Paket die Person,
  // die es begonnen hat, während eine andere darin weitergeschrieben hätte.
  it('fasst zwei Speicherungen derselben Herkunft zusammen', () => {
    const c = emptyContainer();
    const erst = speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });
    speichern(c, {
      vorher: 'b\n',
      neu: 'c\n',
      nowMs: 2000,
      herkunft: ANNA,
      openPacket: erst.openPacket,
    });

    expect(c.history.packets).toHaveLength(1);
    expect(c.history.packets[0]).toMatchObject(ANNA);
  });

  it('beginnt bei gewechselter Herkunft ein neues Paket statt weiterzuschreiben', () => {
    const c = emptyContainer();
    const erst = speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });
    speichern(c, {
      vorher: 'b\n',
      neu: 'c\n',
      nowMs: 2000,
      herkunft: BERND,
      openPacket: erst.openPacket,
    });

    expect(c.history.packets).toHaveLength(2);
    expect(c.history.packets[0]).toMatchObject(ANNA);
    expect(c.history.packets[1]).toMatchObject(BERND);
  });

  it('beginnt auch dann ein neues Paket, wenn die Herkunft wegfaellt', () => {
    const c = emptyContainer();
    const erst = speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });
    speichern(c, {
      vorher: 'b\n',
      neu: 'c\n',
      nowMs: 2000,
      herkunft: { benutzer: null, rechner: null },
      openPacket: erst.openPacket,
    });

    expect(c.history.packets).toHaveLength(2);
    expect('benutzer' in c.history.packets[1]).toBe(false);
  });
});

// Ausführungs-Entscheidung dieses Tasks: Wer eine fremde Änderung nur bemerkt,
// hat sie nicht gemacht.
describe('mdd-herkunft: fremd ausgeloeste Pakete', () => {
  it('gibt einem external-Paket keine Herkunft', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });

    // Zweites Speichern, dessen Platten-Stand von aussen abweicht: Das erzeugt
    // ein external-Paket vor dem eigenen.
    speichern(c, { vorher: 'fremd\n', neu: 'c\n', nowMs: 1000 + WEIT, herkunft: BERND });

    const extern = c.history.packets.find((p) => p.trigger === 'external');
    expect(extern).toBeDefined();
    expect('benutzer' in extern).toBe(false);
    expect('rechner' in extern).toBe(false);
  });
});

// AK3 (Anzeige): Die Ansicht kann nur zeigen, was bei ihr ankommt. Geprüft wird
// deshalb die Datenkette bis zur Ansicht — dass das Paket-Feld in der
// Revisions-Liste landet, auch wenn es fehlt.
//
// Bewusst KEIN Snapshot der Historien-Seite: Sie ist eine Systemseite, deren
// Rendern die Reiter- und Seiten-Infrastruktur voraussetzt; ein Snapshot davon
// prüfte überwiegend fremde Mechanik statt der beiden neuen Zellen. Dass die
// Spalten tatsächlich erscheinen, prüft der Product Owner am gebauten Programm.
describe('mdd-herkunft: Weg bis zur Ansicht', () => {
  // Nachbau der Abbildung aus ipc/history.js: Paket -> Revisions-Eintrag.
  function alsRevision(p, i) {
    return {
      seq: i,
      ts: p.ts,
      tsEnd: p.tsEnd,
      trigger: p.trigger,
      benutzer: p.benutzer,
      rechner: p.rechner,
    };
  }

  it('reicht beide Angaben an die Ansicht weiter', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: ANNA });

    const rev = c.history.packets.map(alsRevision).at(-1);

    expect(rev.benutzer).toBe('anna');
    expect(rev.rechner).toBe('SC-026');
  });

  it('liefert undefined statt eines Platzhalters, wo die Angabe fehlt', () => {
    const c = emptyContainer();
    speichern(c, { vorher: 'a\n', neu: 'b\n', nowMs: 1000, herkunft: undefined });

    const rev = c.history.packets.map(alsRevision).at(-1);

    // Die Ansicht macht daraus eine leere Zelle. Ein Platzhalter wie
    // «unbekannt» wäre eine Aussage, die niemand getroffen hat.
    expect(rev.benutzer).toBeUndefined();
    expect(rev.rechner).toBeUndefined();
  });
});
