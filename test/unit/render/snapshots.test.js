// 4T-0194: Snapshot-Tests der Markdown-Render-Pipeline.
//
// Jede Fixture unter test/fixtures/render/ wird durch renderMarkdown
// geschickt und das HTML als Vitest-Snapshot eingefroren — das praezise
// Regressionsnetz fuer das Markdown-Erweiterungs-Epic 3E-0017.
// Snapshots sind maschinenunabhaengig: renderMarkdown arbeitet ohne
// Pfad-Aufloesung (die fs-nahe Bild-Einbettung liegt im Preload) und die
// Pipeline erzeugt keine Zufalls-IDs. Snapshot-Updates sind ein bewusster
// Schritt mit Diff-Review (test/README.md, Abschnitt Snapshots).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderMarkdown,
  convertMarkdownPortable,
  setCalendarConfig,
} from '../../../src/shared/markdown/markdown.js';
import { extractFrontmatter, writeFrontmatter } from '../../../src/shared/markdown/frontmatter.js';
// 4T-0546 (Epic 3E-0097): Demo-Konfiguration für die Kalender-Wert-Fixture.
import { normalizeCalendarConfig } from '../../../src/shared/calendar-core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '..', '..', 'fixtures', 'render');

// 4T-0512 (Epic 3E-0092): fester Stichtag für die zeitabhängigen Teile des
// Ereignis-Fence (Container-Attribut data-ev-today, Staffelungs-Texte im
// Portable-Export) — sonst kippten die Snapshots täglich. Mittag lokal,
// damit der Kalendertag in jeder Zeitzone stabil bleibt; die übrigen
// Fixtures lesen keine Uhr.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
  // 4T-0546 (Epic 3E-0097): deterministische Kalender-Konfiguration für
  // kalender-werte.md (Fantasie-Kalender „Dreimond" mit Namens-Listen,
  // Schalt-Regel und Epochen — dieselbe Struktur wie in calendar-core.test.js).
  setCalendarConfig(
    normalizeCalendarConfig({
      blocks: [
        {
          id: 'welt',
          name: 'Welt',
          calendars: [
            {
              id: 'dreimond',
              name: 'Dreimond',
              levels: [
                { id: 'tag', name: 'Tag', section: 'Datum', start: 1 },
                {
                  id: 'monat',
                  name: 'Monat',
                  section: 'Datum',
                  start: 1,
                  names: ['Frühmond', 'Mittmond', 'Spätmond'],
                  rel: { type: 'lengths', table: [30, 30, 35] },
                },
                {
                  id: 'jahr',
                  name: 'Jahr',
                  section: 'Datum',
                  start: 1,
                  rel: { type: 'leap', count: 3, rules: [{ cycle: 5 }], targetIndex: 2, extra: 2 },
                },
              ],
              epochs: [
                { name: 'Erste Zeit', abbr: 'EZ', start: null },
                { name: 'Zweite Zeit', abbr: 'ZZ', start: [1, 1, 1] },
                { name: 'Dritte Zeit', abbr: 'DZ', start: [500, 2, 10] },
              ],
            },
            // 4T-0748 (Epic 3E-0138): abgeleitete Zeitrechnungen — einmal auf
            // die eingebaute Standard-Zeitrechnung (Einheiten-Namen aus der
            // i18n samt Mehrzahl) und einmal auf den Fantasie-Kalender
            // (Namen der Definition, weil dort keine Mehrzahl bekannt ist).
            {
              id: 'projekt',
              name: 'Projekt',
              derivedFrom: '@standard',
              zero: [2026, 1, 1],
              labelBefore: 'vor Start',
              labelAfter: 'nach Start',
            },
            {
              id: 'mondzaehlung',
              name: 'Mondzählung',
              derivedFrom: 'dreimond',
              zero: [500, 2, 10],
              labelBefore: 'davor',
              labelAfter: 'danach',
            },
          ],
        },
      ],
    }),
  );
});
afterAll(() => {
  vi.useRealTimers();
  setCalendarConfig(null);
});

const fixtures = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

describe('Render-Pipeline-Snapshots (Viewer-Pfad)', () => {
  for (const name of fixtures) {
    it(`rendert ${name} stabil`, () => {
      const src = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
      const html = renderMarkdown(src, 'de');
      expect(html).toMatchSnapshot();
    });
  }

  it('Determinismus: drei Laeufe identisch (Stichprobe)', () => {
    const src = fs.readFileSync(path.join(FIXTURE_DIR, 'commonmark-basis.md'), 'utf8');
    const a = renderMarkdown(src, 'de');
    const b = renderMarkdown(src, 'de');
    const c = renderMarkdown(src, 'de');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('leere Datei rendert leer; Nur-Frontmatter rendert genau den Frontmatter-Block (4T-0282)', () => {
    expect(renderMarkdown('', 'de')).toBe('');
    const onlyFm = renderMarkdown('---\ntitel: x\n---\n', 'de');
    expect(onlyFm).toContain('frontmatter-block');
    expect(onlyFm).toContain('titel');
    // Kein Body-HTML hinter dem Block.
    expect(onlyFm.trimEnd().endsWith('</div>')).toBe(true);
  });

  it('sehr lange Zeile rendert ohne Fehler', () => {
    const long = 'Wort '.repeat(20000);
    const html = renderMarkdown(long, 'de');
    expect(html.startsWith('<p')).toBe(true);
  });
});

describe('Portable-Export-Snapshots', () => {
  it('konvertiert Perspective-Tabellen und erhaelt Frontmatter (K-01)', () => {
    const src = fs.readFileSync(path.join(FIXTURE_DIR, 'perspective-tabellen.md'), 'utf8');
    const withFm = `---\ntitel: Export\n---\n\n${src}`;
    expect(convertMarkdownPortable(withFm, true)).toMatchSnapshot();
  });

  it('konvertiert Perspective-Datatables zu statischen Tabellen (4T-0418)', () => {
    const src = fs.readFileSync(path.join(FIXTURE_DIR, 'datentabelle.md'), 'utf8');
    const out = convertMarkdownPortable(src, true);
    expect(out).toMatchSnapshot();
    // Struktur-fehlerhafte Fences bleiben unveraendert im Export.
    expect(out).toContain('columns: A:zahl');
  });

  // 4T-0512 (Epic 3E-0092): Art 1 wird zur statischen Tabelle (Staffelung
  // zum eingefrorenen Stichtag, lokalisierte Labels aus de.json); der
  // Fehler-Fence und die Aggregations-Art (query:) bleiben unveraendert.
  it('konvertiert Ereignis-Blöcke zu statischen Tabellen (4T-0512)', () => {
    const src = fs.readFileSync(path.join(FIXTURE_DIR, 'ereignisse.md'), 'utf8');
    const out = convertMarkdownPortable(src, true, 'de');
    expect(out).toMatchSnapshot();
    expect(out).toContain('spalten: kaputt');
    expect(out).toContain('query: FROM "Personen"');
    expect(out).toContain('Zeitdifferenz');
  });

  it('mark- und Footnote-Rendering des Portable-Renderers (Inline-Styles)', () => {
    const portable =
      '<!-- perspective-portable -->\n\nText ==markiert== mit Fussnote[^a].\n\n[^a]: Definition.\n';
    expect(renderMarkdown(portable, 'de')).toMatchSnapshot();
  });

  // 4T-0498 (Epic 3E-0090): Task-Marker-Badges im Portable-Export tragen
  // vollstaendige Inline-Styles (Muster Status-Box); der Portable-HTML-Pfad
  // laeuft ueber renderMarkdown mit vorangestelltem perspective-portable-
  // Marker. Stabile Datums-Werte (2020 ueberfaellig, 2099 nie) machen den
  // Snapshot zeitunabhaengig.
  it('konvertiert Task-Marker zu Badges mit Inline-Styles (4T-0498)', () => {
    const src = fs.readFileSync(path.join(FIXTURE_DIR, 'task-marker.md'), 'utf8');
    const portable = `<!-- perspective-portable -->\n\n${src}`;
    const html = renderMarkdown(portable, 'de');
    expect(html).toMatchSnapshot();
    // Badge-Span mit Inline-Styles (kein CSS-Klassen-Rueckfall im Export).
    // In purem Node faellt der Sanitizer auf Escaping zurueck, daher die
    // Klassen als Text (nicht das rohe class="…"-Attribut) pruefen.
    expect(html).toContain('task-marker task-marker-date task-marker-due');
    expect(html).toContain('border-radius:0.7em');
    // Ueberfaelliger Faellig-Termin (2020) traegt die Fehler-Randfarbe.
    expect(html).toContain('task-marker-overdue');
    expect(html).toContain('border-color:#dc3545');
  });

  // 4T-0596 (Epic 3E-0111): Inline-Berechnungen werden beim Export als
  // selbsttragende Ergebnis-Spans eingebrannt; Fehler-Konstrukte bleiben
  // roh und rendern in der Portable-Ansicht das Fehlerbild.
  it('brennt Inline-Berechnungen als Ergebnis-Spans ein (4T-0596)', () => {
    const src =
      'Summe {= 2+3*4 =} und Datum {= date(2026-01-01) + dur(30d) =}.\n\n' +
      'Fehler bleibt roh: {= 2+ =}, Code bleibt roh: `{= 1+1 =}`.\n';
    const out = convertMarkdownPortable(src, true);
    expect(out).toMatchSnapshot();
    expect(out).toContain('title="2+3*4">14</span>');
    expect(out).toContain('{= 2+ =}');
    expect(out).toContain('`{= 1+1 =}`');
  });
});

describe('Frontmatter-API (extractFrontmatter / writeFrontmatter)', () => {
  it('CRLF-Frontmatter wird erkannt', () => {
    const fm = extractFrontmatter('---\r\ntitel: crlf\r\n---\r\nBody\r\n');
    expect(fm.raw).not.toBeNull();
    expect(fm.data).toEqual({ titel: 'crlf' });
  });

  it('`...`-Ende schliesst den Block', () => {
    const fm = extractFrontmatter('---\ntitel: punkte\n...\nBody\n');
    expect(fm.raw).not.toBeNull();
    expect(fm.data).toEqual({ titel: 'punkte' });
  });

  it('defektes YAML liefert parseError, Body bleibt intakt', () => {
    const fm = extractFrontmatter('---\ntitel: [kaputt\n---\nBody\n');
    expect(fm.parseError).toBeTruthy();
    expect(fm.data).toBeNull();
    expect(fm.body).toContain('Body');
  });

  it('einzelnes `---` ohne Schluss ist kein Frontmatter', () => {
    const fm = extractFrontmatter('---\nnur eine Trennlinie als Anfang');
    expect(fm.raw).toBeNull();
  });

  it('writeFrontmatter-Roundtrip erhaelt Kommentare und ergaenzt Felder', () => {
    const src = '---\n# Kommentar bleibt\ntitel: alt\n---\nBody\n';
    const result = writeFrontmatter(src, { titel: 'neu', extra: 'dazu' });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('# Kommentar bleibt');
    expect(result.text).toContain('titel: neu');
    expect(result.text).toContain('extra: dazu');
    expect(result.text).toContain('Body');
    const re = extractFrontmatter(result.text);
    expect(re.data).toMatchObject({ titel: 'neu', extra: 'dazu' });
  });

  it('writeFrontmatter baut bei defektem YAML neu auf (Schreibschutz liegt im Properties-Editor)', () => {
    // Dokumentiertes IST-Verhalten: die Funktion selbst ersetzt einen
    // unparsebaren Block durch sauberes YAML; der R5-02-Schutz (kein
    // Schreiben ueber defektem Frontmatter) sitzt im Renderer-Pfad, der
    // bei parseError gar nicht erst speichert (Add-Button deaktiviert).
    const src = '---\ntitel: [kaputt\n---\nBody\n';
    const result = writeFrontmatter(src, { titel: 'neu' });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('titel: neu');
    expect(result.text).toContain('Body');
  });
});
