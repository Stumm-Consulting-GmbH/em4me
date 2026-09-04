// 4T-001406 und 4T-001407 (Epic 3E-000244): Unit-Tests der Journal-Nachpflege —
// die nur ergaenzende Frontmatter-Regel und die Zuordnung eines vorhandenen
// Datei-Bestands zu den Perioden eines Journals.
import { describe, it, expect } from 'vitest';
import {
  ergaenzeJournalProperties,
  ordneEintraegeZu,
} from '../../src/shared/journal-nachpflege.js';
import { isoDateToMs, resolveEntryPath, periodOf } from '../../src/shared/journal-core.js';

const ms = (iso) => isoDateToMs(iso);

// Tages-Journal nach dem belegten PO-Muster (Jahres-Unterordner).
const TAEGLICH = {
  id: 'tag',
  name: 'Tag',
  granularity: 'day',
  folderPattern: 'Journal/{{date::yyyy}}',
  namePattern: '{{date}}',
  startDate: null,
  endDate: null,
};

// Pfad der Periode eines Journals, aus demselben Kern wie die Anwendung.
const pfad = (journal, iso) =>
  resolveEntryPath(journal, periodOf(ms(iso), journal.granularity)).relPath;

describe('ergaenzeJournalProperties — ergänzt, ohne zu übersteuern', () => {
  const props = {
    journal: 'Wochenbuch',
    'journal-date': '2026-07-06',
    'journal-start-date': '2026-07-06',
    'journal-end-date': '2026-07-12',
  };

  it('ein Eintrag ohne Frontmatter bekommt alle vier Eigenschaften', () => {
    const { geaendert, text } = ergaenzeJournalProperties('# KW 28\n', props);
    expect(geaendert).toBe(true);
    expect(text).toContain('journal: Wochenbuch');
    expect(text).toContain('journal-date: 2026-07-06');
    expect(text).toContain('journal-start-date: 2026-07-06');
    expect(text).toContain('journal-end-date: 2026-07-12');
    expect(text).toContain('# KW 28');
  });

  it('ergänzt genau die fehlenden Eigenschaften', () => {
    const quelle = '---\njournal-date: 2026-07-06\n---\n\nInhalt\n';
    const { geaendert, text } = ergaenzeJournalProperties(quelle, props);
    expect(geaendert).toBe(true);
    expect(text).toContain('journal-start-date: 2026-07-06');
    expect(text).toContain('journal: Wochenbuch');
    expect(text).toContain('Inhalt');
  });

  // Der Unterschied zum Anlage-Weg (AE2 des Epics): dort übersteuert die
  // Anwendung, hier bleibt der Wert des Anwenders stehen.
  it('ein abweichender vorhandener Wert bleibt unverändert', () => {
    const quelle = '---\njournal-date: 1999-01-01\n---\nBody\n';
    const { geaendert, text } = ergaenzeJournalProperties(quelle, props);
    expect(geaendert).toBe(true);
    expect(text).toContain('journal-date: 1999-01-01');
    expect(text).not.toContain('journal-date: 2026-07-06');
  });

  it('ein vollständiger Eintrag wird nicht geschrieben', () => {
    const quelle =
      '---\njournal: Wochenbuch\njournal-date: 2026-07-06\n' +
      'journal-start-date: 2026-07-06\njournal-end-date: 2026-07-12\n---\nBody\n';
    const { geaendert, text } = ergaenzeJournalProperties(quelle, props);
    expect(geaendert).toBe(false);
    expect(text).toBe(quelle);
  });

  it('fremde Frontmatter-Felder und der Body bleiben erhalten', () => {
    const quelle = '---\ntags:\n  - Tagebuch\ncreated: 2025-03-09\n---\n\n# Titel\n\nText.\n';
    const { text } = ergaenzeJournalProperties(quelle, props);
    expect(text).toContain('tags:');
    expect(text).toContain('- Tagebuch');
    expect(text).toContain('created:');
    expect(text).toContain('# Titel');
    expect(text).toContain('Text.');
  });

  it('defektes Frontmatter lässt den Text unverändert', () => {
    const quelle = '---\ntags: [unvollstaendig\n---\nBody\n';
    const { geaendert, text } = ergaenzeJournalProperties(quelle, props);
    expect(geaendert).toBe(false);
    expect(text).toBe(quelle);
  });

  it('ohne Eigenschaften gibt es nichts zu tun', () => {
    const quelle = '---\ntags: [x]\n---\nBody\n';
    expect(ergaenzeJournalProperties(quelle, {}).geaendert).toBe(false);
    expect(ergaenzeJournalProperties(quelle, null).geaendert).toBe(false);
  });
});

// --- 4T-001407 (Epic 3E-000244): Zuordnung des Bestands zu den Perioden -------------

describe('ordneEintraegeZu — Datei-Bestand auf Perioden abbilden', () => {
  // Fester Bezugs-Zeitpunkt: die Zuordnung läuft von "heute" aus rückwärts,
  // und ein wandernder Bezug machte den Fall vom Kalendertag abhängig.
  const opts = { aroundMs: ms('2026-07-09') };

  it('ordnet vorhandene Einträge ihren Perioden zu, älteste zuerst', () => {
    const pfade = [
      pfad(TAEGLICH, '2026-07-09'),
      pfad(TAEGLICH, '2025-01-02'),
      pfad(TAEGLICH, '2026-03-15'),
    ];
    const { treffer, uebergangen } = ordneEintraegeZu(TAEGLICH, pfade, opts);
    expect(treffer.map((t) => t.period.key)).toEqual(['2025-01-02', '2026-03-15', '2026-07-09']);
    expect(uebergangen).toEqual([]);
  });

  it('fremde Dateien im selben Ordner bleiben übrig statt zu stören', () => {
    const pfade = [
      pfad(TAEGLICH, '2026-07-09'),
      'Journal/2026/Notizen.md',
      'Journal/Lesezeichen.md',
    ];
    const { treffer, uebergangen } = ordneEintraegeZu(TAEGLICH, pfade, opts);
    expect(treffer).toHaveLength(1);
    expect(uebergangen.sort()).toEqual(['Journal/2026/Notizen.md', 'Journal/Lesezeichen.md']);
  });

  it('findet auch Einträge jenseits des Suchfensters von findPeriodForPath', () => {
    // findPeriodForPath sucht bei Tages-Journalen rund drei Jahre zurück; die
    // Zuordnung läuft, bis jede Datei zugeordnet ist, und erreicht deshalb auch
    // einen zehn Jahre alten Eintrag.
    const pfade = [pfad(TAEGLICH, '2016-05-04')];
    const { treffer } = ordneEintraegeZu(TAEGLICH, pfade, opts);
    expect(treffer.map((t) => t.period.key)).toEqual(['2016-05-04']);
  });

  it('achtet die Grenzen des Journals', () => {
    const begrenzt = { ...TAEGLICH, startDate: '2026-01-01' };
    const pfade = [pfad(TAEGLICH, '2026-07-09'), pfad(TAEGLICH, '2025-06-01')];
    const { treffer, uebergangen } = ordneEintraegeZu(begrenzt, pfade, opts);
    expect(treffer.map((t) => t.period.key)).toEqual(['2026-07-09']);
    expect(uebergangen).toEqual([pfad(TAEGLICH, '2025-06-01')]);
  });

  it('funktioniert für mehrtägige Granularitäten', () => {
    const woechentlich = {
      ...TAEGLICH,
      id: 'woche',
      granularity: 'week',
      namePattern: '{{date::kkkk-KWww}}',
    };
    const pfade = [pfad(woechentlich, '2026-07-09'), pfad(woechentlich, '2026-01-05')];
    const { treffer } = ordneEintraegeZu(woechentlich, pfade, opts);
    expect(treffer.map((t) => t.period.key)).toEqual(['2026-W02', '2026-W28']);
  });

  it('Backslash-Pfade und abweichende Schreibweise werden erkannt', () => {
    const { treffer } = ordneEintraegeZu(TAEGLICH, ['Journal\\2026\\2026-07-09.md'], opts);
    expect(treffer).toHaveLength(1);
    expect(treffer[0].relPath).toBe('Journal\\2026\\2026-07-09.md');
  });

  it('leere und defekte Eingaben liefern leere Ergebnisse', () => {
    expect(ordneEintraegeZu(TAEGLICH, [], opts)).toEqual({ treffer: [], uebergangen: [] });
    expect(ordneEintraegeZu(TAEGLICH, null, opts)).toEqual({ treffer: [], uebergangen: [] });
    expect(ordneEintraegeZu(null, ['Journal/2026/2026-07-09.md'], opts).treffer).toEqual([]);
  });
});
