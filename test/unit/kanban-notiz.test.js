// 4T-001956 (Epic 3E-000319): Prüffälle des Format-Kerns von «Notiz aus Karte
// erzeugen…» — Titel und Marker des Kartentextes, der Titel als Dateiname,
// Zielordner und Vorlage aus den Einstellungen der Tafel samt Rückfällen und die
// Text-Operation «Kartentext durch Verweis ersetzen» mit Byte-Vergleich der
// übrigen Datei.
import { describe, it, expect } from 'vitest';
import { leseTafel } from '../../src/shared/kanban/kanban-core.js';
import { segmentValidationError } from '../../src/shared/subpages.js';
import {
  zerlegeKartentext,
  verweiseAlsText,
  dateinameAusTitel,
  notizPfad,
  verweisAufNotiz,
  zielordnerAus,
  vorlageAus,
  findeVorlage,
  kartentextMitVerweis,
  ersetzeKartentextDurchVerweis,
} from '../../src/shared/kanban/kanban-notiz.js';

const KOPF = '---\nkanban-plugin: board\n---\n';

// Die erste Karte einer Tafel mit genau dieser Karten-Zeile.
function karteAus(zeile) {
  const model = leseTafel([KOPF, '## Offen', '', zeile, ''].join('\n'));
  return model.spalten[0].karten[0];
}

// --- Titel und Marker -----------------------------------------------------------------

describe('Titel und Marker des Kartentextes', () => {
  it('ohne Marker ist der Kartentext der Titel', () => {
    expect(zerlegeKartentext(karteAus('- [ ] Angebot schreiben'))).toEqual({
      titel: 'Angebot schreiben',
      marker: [],
    });
  });

  it('Aufgaben-Marker am Zeilenende gehören nicht zum Titel und nicht zu den Markern des Textes', () => {
    const k = karteAus(
      '- [ ] Angebot schreiben ⏫ 🔁 every week 📅 2026-10-01 ⏰ 2026-09-30 09:00',
    );
    expect(zerlegeKartentext(k)).toEqual({ titel: 'Angebot schreiben', marker: [] });
  });

  it('Tags und Vorbild-Termin werden herausgenommen und bleiben in ihrer Reihenfolge', () => {
    const k = karteAus('- [ ] Einkauf #haus planen @{2026-10-01} @@{09:30} #wichtig');
    expect(zerlegeKartentext(k)).toEqual({
      titel: 'Einkauf planen',
      marker: ['#haus', '@{2026-10-01}', '@@{09:30}', '#wichtig'],
    });
  });

  it('ein Aufgaben-Marker hinter einem Tag wird als Marker erkannt, an seiner Stelle', () => {
    const k = karteAus('- [ ] Plan 📅 2026-01-01 #tag');
    expect(zerlegeKartentext(k)).toEqual({ titel: 'Plan', marker: ['📅 2026-01-01', '#tag'] });
  });

  it('Grenze: ein Termin-Marker mitten im Text, gefolgt von Text, bleibt Text', () => {
    const k = karteAus('- [ ] Plan 📅 2026-01-01 weiter');
    expect(zerlegeKartentext(k).titel).toBe('Plan 📅 2026-01-01 weiter');
  });

  it('Wiki-Verweise gehen mit ihrem Anzeige-Text in den Titel ein', () => {
    expect(verweiseAlsText('[[Ziel|Anzeige]] und [[Ordner/Name.md#Abschnitt]]')).toBe(
      'Anzeige und Ordner/Name',
    );
    expect(verweiseAlsText('[[@team:Protokoll]] ![[Bild.png|200]] [[#Nur Anker]]')).toBe(
      'Protokoll Bild.png Nur Anker',
    );
    const k = karteAus('- [ ] Mit [[Kunde A|Kunde]] telefonieren #anruf');
    expect(zerlegeKartentext(k)).toEqual({ titel: 'Mit Kunde telefonieren', marker: ['#anruf'] });
  });

  it('ein Tag in Code, eine Adresse und ein maskiertes \\# sind keine Marker', () => {
    const k = karteAus('- [ ] Lies `#code` auf https://x.de/#frag und \\#kein');
    expect(zerlegeKartentext(k).marker).toEqual([]);
  });

  it('eine Karte nur aus Markern hat einen leeren Titel', () => {
    expect(zerlegeKartentext(karteAus('- [ ] #nur @{2026-10-01} ⏫')).titel).toBe('');
    expect(zerlegeKartentext(null)).toEqual({ titel: '', marker: [] });
  });
});

// --- Dateiname ---------------------------------------------------------------------------

describe('Titel als Dateiname', () => {
  it('Schrägstriche und verbotene Zeichen werden zu _, es entsteht keine Unterseite', () => {
    expect(dateinameAusTitel('Termin 10:30 / Plan')).toBe('Termin 10_30 _ Plan');
    expect(dateinameAusTitel('a\\b∕c<d>e"f|g?h*i')).toBe('a_b_c_d_e_f_g_h_i');
  });

  it('Steuerzeichen, Leerraum und Punkte am Rand fallen weg', () => {
    expect(dateinameAusTitel('  ..Notiz\tzum\u0007Tag.  ')).toBe('Notiz zum Tag');
  });

  it('leer oder unbrauchbar ergibt den leeren Namen', () => {
    expect(dateinameAusTitel('')).toBe('');
    expect(dateinameAusTitel(' ... ')).toBe('');
    expect(dateinameAusTitel(null)).toBe('');
  });

  it('jedes nicht leere Ergebnis besteht die Namens-Prüfung der Unterseiten', () => {
    const proben = ['a/b', 'x:y', '.versteckt', 'ende.', 'Ä ö ü ß', '"Zitat"', 'a∕b', 'C:\\x', '?'];
    for (const probe of proben) {
      const name = dateinameAusTitel(probe);
      if (name !== '') expect(segmentValidationError(name), probe).toBeNull();
    }
  });

  it('Pfad und Verweis der Notiz', () => {
    expect(notizPfad('C:\\Bereich\\Notizen', 'Plan')).toBe('C:\\Bereich\\Notizen\\Plan.md');
    expect(notizPfad('/home/a/', 'Plan.md')).toBe('/home/a/Plan.md');
    expect(notizPfad('/home/a', 'A/B')).toBe('/home/a/A∕B.md');
    expect(verweisAufNotiz(' Plan ')).toBe('[[Plan]]');
  });
});

// --- Zielordner und Vorlage ---------------------------------------------------------------

describe('Zielordner aus der Einstellung der Tafel', () => {
  const W = 'C:\\Bereich';
  const T = 'C:\\Bereich\\Projekte';

  it('ohne Einstellung der Ordner der Tafel', () => {
    expect(zielordnerAus(null, { bereichsWurzel: W, tafelOrdner: T })).toEqual({
      ordner: T,
      eingestellt: false,
    });
    expect(zielordnerAus('  ', { tafelOrdner: T }).ordner).toBe(T);
  });

  it('mit Bereich relativ zur Wurzel, `/` ist die Wurzel', () => {
    expect(zielordnerAus('/', { bereichsWurzel: W, tafelOrdner: T })).toEqual({
      ordner: W,
      eingestellt: true,
    });
    expect(zielordnerAus('Notizen/Karten', { bereichsWurzel: W, tafelOrdner: T }).ordner).toBe(
      'C:\\Bereich\\Notizen\\Karten',
    );
    expect(zielordnerAus('/Notizen', { bereichsWurzel: '/home/b', tafelOrdner: null }).ordner).toBe(
      '/home/b/Notizen',
    );
  });

  it('ohne Bereich relativ zum Ordner der Tafel, auch mit ..', () => {
    expect(zielordnerAus('../Notizen', { tafelOrdner: T }).ordner).toBe('C:\\Bereich\\Notizen');
    expect(zielordnerAus('./a/./b', { tafelOrdner: '/h/t' }).ordner).toBe('/h/t/a/b');
  });

  it('außerhalb des Bereichs und ohne Basis wird kein Ordner geliefert', () => {
    expect(zielordnerAus('../x', { bereichsWurzel: W, tafelOrdner: T })).toEqual({
      ordner: null,
      eingestellt: true,
      grund: 'ausserhalb',
    });
    expect(zielordnerAus('a', {})).toEqual({ ordner: null, eingestellt: true, grund: 'ohneBasis' });
  });

  it('die Wurzel eines Laufwerks bleibt ein Pfad', () => {
    expect(zielordnerAus('/', { tafelOrdner: 'C:\\' }).ordner).toBe('C:\\');
  });
});

describe('Vorlage aus der Einstellung der Tafel', () => {
  const LISTE = [
    { relPath: 'Karten\\Notiz.md', name: 'Notiz', group: 'Karten' },
    { relPath: 'Karten/Notiz.md', name: 'Notiz', group: 'Karten', sourceKey: 'team' },
  ];

  it('Pfad und @kuerzel:Pfad', () => {
    expect(vorlageAus('Karten/Notiz.md')).toEqual({ relPath: 'Karten/Notiz.md', sourceKey: null });
    expect(vorlageAus('@team:Karten/Notiz.md')).toEqual({
      relPath: 'Karten/Notiz.md',
      sourceKey: 'team',
    });
    expect(vorlageAus('')).toBeNull();
    expect(vorlageAus(null)).toBeNull();
  });

  it('der Eintrag der Liste wird unabhängig von der Trenner-Richtung gefunden', () => {
    expect(findeVorlage(LISTE, vorlageAus('Karten/Notiz.md'))).toBe(LISTE[0]);
    expect(findeVorlage(LISTE, vorlageAus('@team:Karten/Notiz.md'))).toBe(LISTE[1]);
    expect(findeVorlage(LISTE, vorlageAus('@fremd:Karten/Notiz.md'))).toBeNull();
    expect(findeVorlage(LISTE, vorlageAus('Fehlt.md'))).toBeNull();
  });
});

// --- Text-Operation ---------------------------------------------------------------------

describe('Kartentext durch Verweis ersetzen', () => {
  const zeilen = [
    KOPF,
    '## Offen',
    '',
    '- [ ] Einkauf #haus planen @{2026-10-01} ⏫ 📅 2026-10-02',
    '\t- Folgezeile mit #tag',
    '\tnoch eine',
    '- [x] Zweite',
    '',
    '## Fertig',
    '',
    '- [ ] Dritte',
    '',
    '%% kanban:settings',
    '```',
    '{"new-note-folder":"/"}',
    '```',
    '%%',
    '',
  ];

  function erwartet(ende) {
    const neu = [...zeilen];
    neu[3] = '- [ ] [[Einkauf planen]] #haus @{2026-10-01} ⏫ 📅 2026-10-02';
    return neu.join(ende);
  }

  it('LF: nur die Karten-Zeile ändert sich, Marker bleiben in Reihenfolge, Folgezeilen und Rest byte-gleich', () => {
    const text = zeilen.join('\n');
    const r = ersetzeKartentextDurchVerweis(text, {
      spalte: 0,
      karte: 0,
      verweis: '[[Einkauf planen]]',
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(erwartet('\n'));
  });

  it('CRLF: das Zeilenende der Quelle bleibt überall erhalten', () => {
    const text = zeilen.join('\r\n');
    const r = ersetzeKartentextDurchVerweis(text, {
      spalte: 0,
      karte: 0,
      verweis: '[[Einkauf planen]]',
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(erwartet('\r\n'));
    expect(r.text.split('\r\n')).toHaveLength(zeilen.length);
  });

  it('eine Karte ohne Marker trägt danach allein den Verweis', () => {
    const text = zeilen.join('\n');
    const r = ersetzeKartentextDurchVerweis(text, { spalte: 1, karte: 0, verweis: '[[Dritte]]' });
    expect(r.text).toBe(text.replace('- [ ] Dritte', '- [ ] [[Dritte]]'));
  });

  it('der neue Kartentext ist Verweis plus Marker', () => {
    const k = karteAus('- [ ] Plan 📅 2026-01-01 #tag');
    expect(kartentextMitVerweis(k, '[[Plan]]')).toBe('[[Plan]] 📅 2026-01-01 #tag');
  });

  it('Befunde statt Ausnahmen', () => {
    const text = zeilen.join('\n');
    expect(ersetzeKartentextDurchVerweis('kein Tafel-Dokument', {}).befund.code).toBe(
      'keinTafelDokument',
    );
    expect(
      ersetzeKartentextDurchVerweis(text, { spalte: 9, karte: 0, verweis: '[[x]]' }).befund.code,
    ).toBe('unbekannteSpalte');
    expect(
      ersetzeKartentextDurchVerweis(text, { spalte: 0, karte: 9, verweis: '[[x]]' }).befund.code,
    ).toBe('unbekannteKarte');
    expect(ersetzeKartentextDurchVerweis(text, { spalte: 0, karte: 0, verweis: ' ' }).ok).toBe(
      false,
    );
  });
});
