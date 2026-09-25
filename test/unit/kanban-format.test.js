// 4T-001846 (Epic 3E-000110): Unit-Tests des Tafel-Format-Kerns — Erkennung,
// Zerlegung, unangetastete Reste, byte-treuer Rundlauf, Fehler-Semantik und
// Prozess-Neutralität. Die Text-Operationen prüft kanban-operationen.test.js.
//
// Die Rundlauf-Proben sind der Kern dieser Datei: AK5 der Aufgabe und AK6 der
// Story 4S-000971 verlangen Byte-Gleichheit, nicht Modell-Gleichheit. Geprüft
// wird deshalb an Eingaben, die eine Normalform-Ausgabe **nicht** trifft —
// CRLF, gemischte Zeilenenden, fehlender Schluss-Umbruch, fremde Kopf-Schlüssel,
// das Leerzeilen-Muster des Vorbilds und der Code-Zaun im `%%`-Kommentar.
//
// Die Beispiel-Tafeln unter test/fixtures/kanban/ bilden die Struktur der
// echten Tafeln des Product Owners nach (Leerzeilen-Muster, fett gesetztes
// Erledigt-Kennzeichen, Archiv nach der Trennlinie, Einstellungs-Block mit
// Code-Zaun und JSON-Zeile, Kopf-Werte `list` und `board`, Tafel nur aus dem
// Kopf); ihre Inhalte sind erfunden.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  KANBAN_KOPF_SCHLUESSEL,
  ARCHIV_TRENNER,
  istTafelDokument,
  leseTafel,
  schreibeTafel,
  tafelUmfang,
} from '../../src/shared/kanban/kanban-core.js';
import { findPercentCommentRanges } from '../../src/shared/markdown/plugins/comments.js';
import { findCalendarValues } from '../../src/shared/calendar/calendar-core.js';

function fixture(name) {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/kanban/${name}`, import.meta.url)),
    'utf8',
  );
}

const TAFEL = fixture('beispiel-tafel.md');
const LEER = fixture('leere-tafel.md');
const OHNE_KENNZEICHEN = fixture('fremde-kopf-schlüssel.md');
// 4T-001902: Vorbild-Termine, Limits, Kalender-Wert und fremdes Archiv in der
// am Quelltext des Vorbilds belegten Grammatik; Inhalte erfunden.
const STUFE2 = fixture('tafel-stufe-2.md');

function rundlauf(text) {
  return schreibeTafel(leseTafel(text));
}

describe('kanban-core — Erkennung am Kopf-Kennzeichen (AK1)', () => {
  it('erkennt eine Tafel am Vorhandensein des Schlüssels, nicht an seinem Wert', () => {
    // F1: Belegt sind beide Werte des Bestands — `list` und `board`.
    expect(istTafelDokument(TAFEL)).toBe(true);
    expect(istTafelDokument(LEER)).toBe(true);
    expect(leseTafel(TAFEL).kennzeichen).toBe('list');
    expect(leseTafel(LEER).kennzeichen).toBe('board');
  });

  it('erkennt ein Dokument ohne den Schlüssel nicht', () => {
    expect(istTafelDokument(OHNE_KENNZEICHEN)).toBe(false);
    const model = leseTafel(OHNE_KENNZEICHEN);
    expect(model.istTafel).toBe(false);
    expect(model.befunde.map((b) => b.code)).toEqual(['keinKennzeichen']);
  });

  it('erkennt ein Dokument ganz ohne Kopf nicht', () => {
    const model = leseTafel('## Planung\n\n- [ ] Eine Aufgabe\n');
    expect(model.istTafel).toBe(false);
    expect(model.befunde.map((b) => b.code)).toEqual(['keinKopf']);
  });

  it('meldet einen unlesbaren Kopf als Befund statt abzustürzen', () => {
    const text = `---\n${KANBAN_KOPF_SCHLUESSEL}: [unbalanciert\n---\n\n## Planung\n`;
    const model = leseTafel(text);
    expect(model.istTafel).toBe(false);
    expect(model.befunde.map((b) => b.code)).toEqual(['kopfUnlesbar']);
    // Nichts geht verloren: Der Rückweg bleibt byte-gleich.
    expect(schreibeTafel(model)).toBe(text);
  });

  it('nimmt eine leere Zeichenkette und null ohne Absturz entgegen', () => {
    for (const eingabe of ['', null, undefined]) {
      const model = leseTafel(eingabe);
      expect(model.istTafel).toBe(false);
      expect(schreibeTafel(model)).toBe('');
    }
  });
});

describe('kanban-core — Zerlegung in Spalten und Karten (AK2, AK3)', () => {
  const model = leseTafel(TAFEL);

  it('liest die Spalten in Dokument-Reihenfolge mit ihrem Titel', () => {
    expect(model.spalten.map((s) => s.titel)).toEqual(['Planung', 'Umsetzung', 'Leer', 'Fertig']);
    expect(model.befunde).toEqual([]);
    expect(tafelUmfang(model)).toEqual({ spalten: 4, karten: 4, abgehakt: 1, befunde: 0 });
  });

  it('liest das Erledigt-Kennzeichen strukturell samt seinem Wortlaut', () => {
    // E-A: erkannt wird die fett gesetzte Wortgruppe, nicht das Wort «Complete».
    // Der Wortlaut des Vorbilds steht in seiner Sprache und wird mitgeführt.
    expect(model.spalten.map((s) => s.erledigt)).toEqual([false, false, false, true]);
    expect(model.spalten[3].erledigtWortlaut).toBe('Fertiggestellt');
  });

  it('liest Karten mit Text und Status in Zeilen-Reihenfolge', () => {
    expect(model.spalten[0].karten.map((k) => k.text)).toEqual([
      '[[N1 🔄 2026-01-05 Erste Beispiel-Notiz]]',
      '[[N2 ✅ 2026-01-06 Zweite Beispiel-Notiz]]',
    ]);
    expect(model.spalten[1].karten.map((k) => k.status)).toEqual([' ', '/']);
    expect(model.spalten[1].karten.map((k) => k.abgehakt)).toEqual([false, true]);
  });

  it('ordnet eingerückte Folgezeilen der Karte zu und macht keine Karte daraus', () => {
    const karte = model.spalten[1].karten[0];
    expect(karte.text).toBe('Dritte Beispiel-Aufgabe');
    expect(karte.folgeZeilen.length).toBe(2);
    expect(karte.letzteZeile).toBe(karte.zeile + 2);
    expect(model.spalten[1].karten.length).toBe(2);
  });

  it('erkennt ein Erledigt-Zeichen mitten im Verweis-Text nicht als Termin', () => {
    // Pflicht-Testfall des Format-Befunds: Das Zeichen samt Datum steht
    // INNERHALB eines Wiki-Verweises und ist deshalb kein Erledigt-Datum.
    const karte = model.spalten[0].karten[1];
    expect(karte.aufgabe.done).toBeNull();
    expect(karte.aufgabe.segments).toEqual([]);
  });

  it('führt eine leere Spalte als Spalte ohne Karten', () => {
    expect(model.spalten[2].karten).toEqual([]);
    expect(model.spalten[2].erledigt).toBe(false);
  });

  it('liest eine Tafel nur aus dem Kopf als gültige leere Tafel (F3)', () => {
    const leer = leseTafel(LEER);
    expect(leer.istTafel).toBe(true);
    expect(leer.befunde).toEqual([]);
    expect(tafelUmfang(leer)).toEqual({ spalten: 0, karten: 0, abgehakt: 0, befunde: 0 });
    expect(leer.archiv).toBeNull();
    expect(leer.einstellungen).toBeNull();
  });
});

describe('kanban-core — Archiv und Einstellungs-Block als Reste (AK4)', () => {
  const model = leseTafel(TAFEL);
  const zeilen = TAFEL.split('\n');

  it('erkennt das Archiv als Abschnitt hinter der Trennlinie', () => {
    expect(model.archiv).not.toBeNull();
    expect(zeilen[model.archiv.trennerZeile]).toBe(ARCHIV_TRENNER);
    // Die Archiv-Überschrift steht in der Sprache des Vorbilds und wird nicht
    // gegen ein englisches Wort geprüft.
    expect(zeilen.slice(model.archiv.trennerZeile).some((z) => z === '## Archiv')).toBe(true);
  });

  it('zählt die Archiv-Überschrift nicht als Spalte', () => {
    expect(model.spalten.map((s) => s.titel)).not.toContain('Archiv');
  });

  it('erkennt den Einstellungs-Block samt seiner JSON-Zeile', () => {
    expect(model.einstellungen.geschlossen).toBe(true);
    expect(zeilen[model.einstellungen.vonZeile]).toBe('%% kanban:settings');
    expect(zeilen[model.einstellungen.bisZeile]).toBe('%%');
    expect(JSON.parse(zeilen[model.einstellungen.jsonZeile])['list-collapse']).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it('meldet einen nicht geschlossenen Block als Befund, ohne etwas zu verwerfen', () => {
    const text = TAFEL.slice(0, TAFEL.length - 2);
    const offen = leseTafel(text);
    expect(offen.befunde.map((b) => b.code)).toEqual(['einstellungsBlockOffen']);
    expect(schreibeTafel(offen)).toBe(text);
  });
});

describe('kanban-core — Code-Zaun innerhalb eines %%-Kommentars (AK10)', () => {
  it('behandelt den Einstellungs-Block samt Zaun als genau einen Kommentar', () => {
    // Der Bestands-Test, der hier fehlte: Der Erhalt des Blocks hängt daran,
    // dass der Scanner den Code-Zaun im Inneren nicht als Zaun liest.
    const bereiche = findPercentCommentRanges(TAFEL).filter((b) =>
      TAFEL.slice(b.from, b.to).includes('kanban:settings'),
    );
    expect(bereiche.length).toBe(1);
    const inhalt = TAFEL.slice(bereiche[0].from, bereiche[0].to);
    expect(bereiche[0].closed).toBe(true);
    expect(inhalt.startsWith('%% kanban:settings')).toBe(true);
    expect(inhalt.endsWith('%%')).toBe(true);
    expect((inhalt.match(/```/g) || []).length).toBe(2);
    expect(inhalt).toContain('"list-collapse"');
  });

  it('findet den Block auch bei einem weiteren Kommentar im Dokument', () => {
    const text = TAFEL.replace('## Planung', '%% eine private Notiz %%\n\n## Planung');
    const model = leseTafel(text);
    expect(model.einstellungen).not.toBeNull();
    expect(model.einstellungen.jsonZeile).not.toBeNull();
    expect(model.spalten.map((s) => s.titel)).toEqual(['Planung', 'Umsetzung', 'Leer', 'Fertig']);
    expect(schreibeTafel(model)).toBe(text);
  });
});

describe('kanban-core — Rundlauf ist byte-gleich (AK5)', () => {
  it('schreibt die Beispiel-Tafel zeichengenau zurück', () => {
    expect(rundlauf(TAFEL)).toBe(TAFEL);
    expect(rundlauf(LEER)).toBe(LEER);
  });

  it('erhält die Zeilenenden-Konvention einer CRLF-Quelle', () => {
    const crlf = TAFEL.split('\n').join('\r\n');
    expect(rundlauf(crlf)).toBe(crlf);
    const model = leseTafel(crlf);
    expect(model.zeilenende).toBe('\r\n');
    expect(model.spalten.map((s) => s.titel)).toEqual(['Planung', 'Umsetzung', 'Leer', 'Fertig']);
    expect(model.spalten[3].erledigtWortlaut).toBe('Fertiggestellt');
    expect(model.spalten[1].karten[0].folgeZeilen.length).toBe(2);
  });

  it('erhält gemischte Zeilenenden Zeile für Zeile', () => {
    const gemischt = TAFEL.split('\n')
      .map((z, i) => (i % 2 === 0 ? z + '\r' : z))
      .join('\n');
    expect(rundlauf(gemischt)).toBe(gemischt);
  });

  it('erhält einen fehlenden und einen vorhandenen Schluss-Umbruch', () => {
    expect(TAFEL.endsWith('\n')).toBe(false);
    expect(rundlauf(TAFEL)).toBe(TAFEL);
    expect(rundlauf(TAFEL + '\n')).toBe(TAFEL + '\n');
    expect(rundlauf(TAFEL + '\n\n\n')).toBe(TAFEL + '\n\n\n');
  });

  it('erhält fremde Kopf-Schlüssel und das Leerzeilen-Muster', () => {
    const model = leseTafel(TAFEL);
    expect(schreibeTafel(model)).toContain('created: 2026-01-02T08:15');
    expect(schreibeTafel(model)).toContain('updated: 2026-01-09T17:40');
    // Drei Leerzeilen unter einer leeren Spalte, zwei unter einer gefüllten.
    expect(schreibeTafel(model)).toContain('## Leer\n\n\n\n## Fertig');
  });

  it('erhält eine Tafel mit abweichender Überschriften-Ebene', () => {
    const text = TAFEL.split('\n')
      .map((z) => (z.startsWith('## ') ? '#' + z : z))
      .join('\n');
    const model = leseTafel(text);
    expect(model.spalten.map((s) => s.titel)).toEqual(['Planung', 'Umsetzung', 'Leer', 'Fertig']);
    expect(schreibeTafel(model)).toBe(text);
  });
});

describe('kanban-core — defekte und ungewöhnliche Eingaben sind Befunde (AK8)', () => {
  const faelle = [
    ['ohne Kopf', '## Planung\n', 'keinKopf'],
    ['unlesbarer Kopf', '---\nkanban-plugin: [\n---\n\n## A\n', 'kopfUnlesbar'],
    ['Kopf ohne Kennzeichen', '---\ntitel: X\n---\n\n## A\n', 'keinKennzeichen'],
  ];
  for (const [name, text, code] of faelle) {
    it(`meldet ${name} als Befund und schreibt byte-gleich zurück`, () => {
      const model = leseTafel(text);
      expect(model.befunde.map((b) => b.code)).toContain(code);
      expect(schreibeTafel(model)).toBe(text);
    });
  }

  it('macht aus einer Überschrift im Code-Zaun keine Spalte', () => {
    const text = TAFEL.replace(
      '- [ ] Dritte Beispiel-Aufgabe',
      '```\n## Keine Spalte\n```\n\n- [ ] Dritte Beispiel-Aufgabe',
    );
    const model = leseTafel(text);
    expect(model.spalten.map((s) => s.titel)).toEqual(['Planung', 'Umsetzung', 'Leer', 'Fertig']);
    expect(schreibeTafel(model)).toBe(text);
  });

  it('nimmt eine fette Zeile mitten in der Spalte nicht für ein Kennzeichen', () => {
    const text = TAFEL.replace(
      '- [/] Vierte Beispiel-Aufgabe',
      '**Zwischenüberschrift**\n\n- [/] Vierte Beispiel-Aufgabe',
    );
    const model = leseTafel(text);
    expect(model.spalten[1].erledigt).toBe(false);
    expect(schreibeTafel(model)).toBe(text);
  });

  it('nimmt eine Trennlinie ohne folgende Überschrift nicht für ein Archiv', () => {
    const text = '---\nkanban-plugin: list\n---\n\n## Planung\n\n- [ ] Eine\n\n***\n\nText\n';
    const model = leseTafel(text);
    expect(model.archiv).toBeNull();
    expect(model.spalten.length).toBe(1);
    expect(schreibeTafel(model)).toBe(text);
  });
});

// --- Stufe 2 (4T-001902): Vorbild-Termin, Limit, Archiv-Karten ----------------

describe('kanban-core — Vorbild-Termin einer Karte (4T-001902 AK2, AK10)', () => {
  const model = leseTafel(STUFE2);
  const planung = model.spalten[0].karten;

  it('liest Datum, Uhrzeit und Spannen samt führendem Leerzeichen', () => {
    const karte = planung[0];
    const zeile = karte.roh;
    expect(karte.vorbildTermin).toMatchObject({
      datum: '2026-10-01',
      uhrzeit: '14:00',
      lesbar: true,
      befund: null,
    });
    const teile = karte.vorbildTermin.spannen.map(({ von, bis }) => zeile.slice(von, bis));
    expect(teile).toEqual([' @{2026-10-01}', ' @@{14:00}']);
  });

  it('liest ein Datum ohne Uhrzeit und ein Datum am Anfang des Texts', () => {
    expect(planung[1].vorbildTermin).toMatchObject({ datum: '2026-10-02', uhrzeit: null });
    const vorn = model.spalten[1].karten[1];
    expect(vorn.vorbildTermin.datum).toBe('2026-10-08');
    const { von, bis } = vorn.vorbildTermin.spannen[0];
    expect(vorn.roh.slice(von, bis)).toBe(' @{2026-10-08}');
  });

  it('meldet ein ungültiges Datum und ein fremdes Format als unlesbar', () => {
    expect(planung[3].vorbildTermin).toMatchObject({
      lesbar: false,
      datum: null,
      befund: { code: 'terminUnlesbar', detail: '2026-13-40' },
    });
    expect(planung[4].vorbildTermin.befund).toEqual({
      code: 'terminUnlesbar',
      detail: '01.10.2026',
    });
    expect(planung[6].vorbildTermin.befund).toEqual({ code: 'terminUnlesbar', detail: '25:00' });
  });

  it('meldet eine Uhrzeit ohne Datum als eigenen Befund', () => {
    expect(planung[5].vorbildTermin).toMatchObject({
      lesbar: false,
      befund: { code: 'uhrzeitOhneDatum', detail: '09:30' },
    });
    expect(planung[5].vorbildTermin.spannen.length).toBe(1);
  });

  it('deutet die Verknüpfungs-Form nicht und liest keine Folgezeile', () => {
    // Die Folgezeile trägt ein `@{…}`; gelesen wird nur die erste Zeile.
    expect(planung[7].vorbildTermin).toBeNull();
    expect(planung[7].folgeZeilen.length).toBe(1);
  });

  it('verlangt Leerraum oder Zeilenanfang vor dem Auslöser', () => {
    const text =
      '---\nkanban-plugin: board\n---\n\n## A\n\n- [ ] mail@{2026-10-01} `@{2026-10-02}`\n';
    expect(leseTafel(text).spalten[0].karten[0].vorbildTermin).toBeNull();
  });

  it('lässt Tafel und Karten-Text unberührt', () => {
    expect(planung[0].text).toBe('Angebot prüfen #kunde @{2026-10-01} @@{14:00}');
    expect(model.befunde).toEqual([]);
  });
});

describe('kanban-core — Vorbild-Termin und Kalender-Wert (4T-001902 AK11)', () => {
  const karte = leseTafel(STUFE2).spalten[0].karten[2];

  it('liest den Vorbild-Termin und lässt den Kalender-Wert stehen', () => {
    expect(karte.vorbildTermin).toMatchObject({ datum: '2026-10-01', uhrzeit: '14:00' });
    const teile = karte.vorbildTermin.spannen.map(({ von, bis }) => karte.roh.slice(von, bis));
    expect(teile).toEqual([' @{2026-10-01}', ' @@{14:00}']);
    expect(teile.join('')).not.toContain('Termine');
  });

  it('liest im Kalender genau den Kalender-Wert und weder Datum noch Uhrzeit', () => {
    const werte = findCalendarValues(karte.roh);
    expect(werte.map((w) => [w.name, w.value])).toEqual([['Termine', '2026-10-01']]);
  });

  it('macht aus einem Kalender-Wert allein keinen Vorbild-Termin', () => {
    const text = '---\nkanban-plugin: board\n---\n\n## A\n\n- [ ] Nur @{Termine: 2026-10-01}\n';
    expect(leseTafel(text).spalten[0].karten[0].vorbildTermin).toBeNull();
  });
});

describe('kanban-core — Limit einer Spalte (4T-001902 AK3)', () => {
  const spalten = leseTafel(STUFE2).spalten;

  it('liest die Zahl in Klammern am Titel-Ende mit und ohne Leerzeichen', () => {
    expect(spalten.map((s) => [s.limit, s.titelOhneLimit])).toEqual([
      [3, 'Planung'],
      [2, 'In Arbeit'],
      [null, 'Später (bald)'],
      [null, 'Fertig (0)'],
    ]);
    expect(spalten[0].titel).toBe('Planung (3)');
  });

  it('nimmt eine Nicht-Zahl und eine 0 nie für ein Limit', () => {
    expect(spalten[2].titelOhneLimit).toBe(spalten[2].titel);
    expect(spalten[3].titelOhneLimit).toBe(spalten[3].titel);
  });

  it('verlangt die Klammer am Ende und nur Ziffern darin', () => {
    const titel = ['Mitte (3) danach', 'Minus (-2)', 'Bruch (2.5)', 'Leer ()'];
    const text = '---\nkanban-plugin: board\n---\n\n' + titel.map((t) => `## ${t}\n\n`).join('');
    const gelesen = leseTafel(text).spalten;
    expect(gelesen.map((s) => s.limit)).toEqual([null, null, null, null]);
    expect(gelesen.map((s) => s.titelOhneLimit)).toEqual(titel);
  });
});

describe('kanban-core — Archiv-Karten (4T-001902)', () => {
  const archiv = leseTafel(STUFE2).archiv;

  it('liest Überschrift und Karten des fremden Archivs samt Folgezeilen', () => {
    expect(archiv.ueberschrift).toBe('Archive');
    expect(archiv.karten.map((k) => k.text)).toEqual([
      '2026-09-20 09:00 Alte Karte #intern',
      'Zweite alte Karte',
    ]);
    expect(archiv.karten[1].folgeZeilen.length).toBe(1);
  });

  it('zählt die Prosa-Zeile im Archiv nicht als Karte', () => {
    expect(archiv.karten.length).toBe(2);
  });
});

describe('kanban-core — Rundlauf der Stufe-2-Tafel ist byte-gleich (4T-001902 AK4)', () => {
  it('schreibt LF, CRLF und fehlenden Schluss-Umbruch zeichengenau zurück', () => {
    // Die CRLF-Fassung entsteht hier und liegt nicht als eigene Datei vor:
    // `.gitattributes` erzwingt LF für jede Text-Datei des Repositoriums.
    const crlf = STUFE2.split('\n').join('\r\n');
    for (const text of [STUFE2, crlf, STUFE2.trimEnd(), crlf.trimEnd()]) {
      expect(rundlauf(text)).toBe(text);
    }
    const model = leseTafel(crlf);
    expect(model.spalten[0].limit).toBe(3);
    expect(model.spalten[0].karten[0].vorbildTermin.uhrzeit).toBe('14:00');
    expect(model.archiv.karten.length).toBe(2);
  });
});

describe('kanban-core — Prozess-Neutralität (AK9)', () => {
  it('läuft in reiner Node-Umgebung ohne DOM und ohne Electron', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(leseTafel('').spalten).toEqual([]);
  });

  it('lädt weder Electron noch ein Renderer-Modul und greift nicht auf Dateien zu', () => {
    const erwartet = {
      'kanban-core.js': [
        '../markdown/frontmatter.js',
        '../tasks/task-markers.js',
        '../markdown/plugins/comments.js',
        // 4T-001913: die Zaun-Regel aus ihrer Heimat, abhängigkeitsfrei.
        '../markdown/fence-level.js',
      ],
      'kanban-einstellungen.js': ['./kanban-core.js'],
      'kanban-archiv.js': ['./kanban-core.js', './kanban-operationen.js'],
      'kanban-operationen.js': [
        './kanban-core.js',
        './kanban-einstellungen.js',
        '../tasks/task-markers.js',
      ],
    };
    for (const [datei, liste] of Object.entries(erwartet)) {
      const quelle = readFileSync(
        fileURLToPath(new URL(`../../src/shared/kanban/${datei}`, import.meta.url)),
        'utf8',
      );
      const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
      expect(importe, datei).toEqual(liste);
    }
  });
});
