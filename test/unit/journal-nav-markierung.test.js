// @vitest-environment jsdom
// 4T-001491 (Epic 3E-000276): Die Existenz-Abfrage hinter der Markierung
// vorhandener Einträge im Journal-Navigations-Block.
//
// **Warum diese Fragen hier stehen und nicht am gebauten Programm.** Zwei
// Akzeptanzkriterien betreffen nicht die Darstellung, sondern das Verhalten der
// Abfrage: die Zahl der Aufrufe je Block-Aufbau (AK6) und der Fehlschlag (AK5).
// Beides waere am Ablauf-Prueffall nur ueber eine umhuellte `window.api`
// messbar — und die ist aus der contextBridge eingefroren, am 2026-09-07
// gemessen. Die Darstellung selbst prueft `journal-markierung.spec.js`.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const aufrufe = [];
let antwort = null;
let wirft = false;

vi.mock('../../src/renderer/i18n.js', () => ({ getLanguage: () => 'de', t: (k) => k }));
vi.mock('../../src/renderer/modules/calendar/journal-pfad-pruefung.js', () => ({
  pruefeBlockPfad: () => null,
  zeigeBlockFehler: () => {},
}));
vi.mock('../../src/renderer/modules/app/api.js', () => ({
  api: {
    journalsEntriesExist: async (relPaths) => {
      aufrufe.push(relPaths);
      if (wirft) throw new Error('IPC weg');
      return antwort;
    },
  },
}));

const { ladeVorhandene } = await import('../../src/renderer/modules/calendar/journal-nav-view.js');
const { periodOf } = await import('../../src/shared/journal-core.js');

// Zwei Journale desselben Regals mit verschiedenen Ablage-Mustern.
const TAG = {
  id: 'tag',
  granularity: 'day',
  folderPattern: 'Journal',
  namePattern: '{{date}}',
};
const TAG_ZWEIT = {
  id: 'tag2',
  granularity: 'day',
  folderPattern: 'Zweitablage',
  namePattern: '{{date}}',
};

const ms = (iso) => new Date(`${iso}T12:00:00`).getTime();
const ziel = (journal, iso) => ({ journal, period: periodOf(ms(iso), journal.granularity) });

beforeEach(() => {
  aufrufe.length = 0;
  antwort = null;
  wirft = false;
});

describe('ladeVorhandene — Existenz-Abfrage des Navigations-Blocks (4T-001491)', () => {
  it('fragt alle Ziele in EINEM Aufruf ab, nicht eines je Periode (AK6)', () => {
    // Der gemessene Wert, auf dem die Entscheidung gegen einen
    // Zwischenspeicher beruht: Ein Block-Aufbau kostet genau einen Aufruf,
    // gleich wie viele Perioden er zeigt.
    const ziele = [
      ziel(TAG, '2026-09-05'),
      ziel(TAG, '2026-09-06'),
      ziel(TAG, '2026-09-07'),
      ziel(TAG, '2026-09-08'),
      ziel(TAG, '2026-09-09'),
      ziel(TAG, '2026-09-10'),
    ];
    antwort = { ok: true, exists: {} };
    return ladeVorhandene(ziele).then(() => {
      expect(aufrufe).toHaveLength(1);
      expect(aufrufe[0]).toHaveLength(6);
    });
  });

  it('markiert nur die Perioden, deren Eintrag es gibt (AK1 und AK2)', async () => {
    const vorgestern = ziel(TAG, '2026-09-05');
    const gestern = ziel(TAG, '2026-09-06');
    const heute = ziel(TAG, '2026-09-07');
    antwort = {
      ok: true,
      exists: { 'Journal/2026-09-05.md': true, 'Journal/2026-09-07.md': true },
    };
    const vorhanden = await ladeVorhandene([vorgestern, gestern, heute]);
    expect([...vorhanden].sort()).toEqual(['tag|2026-09-05', 'tag|2026-09-07']);
    expect(vorhanden.has('tag|2026-09-06')).toBe(false);
  });

  it('haelt zwei Journale derselben Periode auseinander', async () => {
    // Der Schluessel traegt das Journal, nicht nur die Periode: Zwei Journale
    // desselben Regals koennen denselben Tag fuehren und dabei auf
    // verschiedene Dateien zeigen. Ohne das Journal im Schluessel bekaeme das
    // zweite die Markierung des ersten.
    antwort = { ok: true, exists: { 'Journal/2026-09-07.md': true } };
    const vorhanden = await ladeVorhandene([
      ziel(TAG, '2026-09-07'),
      ziel(TAG_ZWEIT, '2026-09-07'),
    ]);
    expect(vorhanden.has('tag|2026-09-07')).toBe(true);
    expect(vorhanden.has('tag2|2026-09-07')).toBe(false);
  });

  it('liefert bei fehlgeschlagener Abfrage die leere Menge (AK5)', async () => {
    // Ein Punkt, der eine Datei behauptet, die es nicht gibt, waere schlimmer
    // als gar keiner: Er verspricht ein Oeffnen und legt in Wahrheit an.
    wirft = true;
    expect([...(await ladeVorhandene([ziel(TAG, '2026-09-07')]))]).toEqual([]);
    wirft = false;
    antwort = { ok: false };
    expect([...(await ladeVorhandene([ziel(TAG, '2026-09-07')]))]).toEqual([]);
    antwort = null;
    expect([...(await ladeVorhandene([ziel(TAG, '2026-09-07')]))]).toEqual([]);
  });

  it('spart den Aufruf, wenn es nichts zu fragen gibt', async () => {
    expect([...(await ladeVorhandene([]))]).toEqual([]);
    expect(aufrufe).toHaveLength(0);
  });
});
