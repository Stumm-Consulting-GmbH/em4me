// 4T-001986 (Epic 3E-000332): Die Zeile, mit der ein Datensatz im Text einer
// Tabelle beginnt, als Sprung-Ziel eines Datensatz-Verweises.
//
// Die tragende Zusage ist der Gleichlauf mit der Gültigkeit: Gesprungen wird
// nur dorthin, wo der Verweis auch als gültig gilt. Deshalb prüft diese Datei
// die Gegenrichtungen (Code-Beispiel, fremder Zaun, maskierte Zeile, Kurzform)
// ebenso ausführlich wie den Treffer.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { findeDatensatzZeile } = require_('../../src/shared/database/record-anchor.js');
const { assembleParts } = require_('../../src/shared/document-assembly.js');

const KOPF_FM = ['---', 'db-table:', '  fields:', '    - name: Kürzel', '    - name: Titel', '---'];

function tabelle(rumpf, { schliessen = true, vor = [], nach = [] } = {}) {
  return [
    ...KOPF_FM,
    '',
    '# Kunden',
    ...vor,
    '',
    '```perspective-records',
    ...rumpf,
    ...(schliessen ? ['```'] : []),
    ...nach,
    '',
  ].join('\n');
}

// Die 1-basierte Zeile, auf der ein bestimmter Zeilentext steht.
function zeileVon(text, inhalt) {
  return text.split('\n').indexOf(inhalt) + 1;
}

const SAETZE = ['|- id="r-00041"', '| K-41', '| Anna', '|- id="r-00042"', '| K-42', '| Bert'];

describe('findeDatensatzZeile — Treffer (AK1, AK2)', () => {
  it('findet die Datensatz-Zeile in der Kopf-Datei', () => {
    const text = tabelle(SAETZE);
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(zeileVon(text, '|- id="r-00042"'));
    expect(findeDatensatzZeile(text, 'r-00041')).toBe(zeileVon(text, '|- id="r-00041"'));
  });

  it('findet einen Datensatz aus dem Folge-Teil im zusammengesetzten Text (AK4 der Story)', () => {
    const kopf = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: Kürzel',
      '    - name: Titel',
      'doc-part: v1|1|Kunden',
      '---',
      '',
      '```perspective-records',
      ...SAETZE,
      '',
    ].join('\n');
    const folge = [
      '---',
      'doc-part: v1|2|Kunden',
      'db-fields: Kürzel, Titel',
      '---',
      '|- id="r-00043"',
      '| K-43',
      '| Cara',
      '```',
      '',
    ].join('\n');
    const { text } = assembleParts([
      { index: 1, content: kopf },
      { index: 2, content: folge },
    ]);
    // Das Frontmatter des Folge-Teils steht nicht im Editor-Text.
    expect(text).not.toContain('doc-part: v1|2|Kunden');
    expect(findeDatensatzZeile(text, 'r-00043')).toBe(zeileVon(text, '|- id="r-00043"'));
    expect(findeDatensatzZeile(text, 'r-00041')).toBe(zeileVon(text, '|- id="r-00041"'));
  });

  it('findet die Zeile auch mit weiteren Angaben am Marker', () => {
    const text = tabelle(['|- id="r-00042" x="y"', '| K-42']);
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(zeileVon(text, '|- id="r-00042" x="y"'));
  });

  it('findet einen Datensatz im nicht geschlossenen Zaun bis zum Textende', () => {
    const text = tabelle(SAETZE, { schliessen: false });
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(zeileVon(text, '|- id="r-00042"'));
  });

  it('nimmt Leerraum um die Kennung des Verweises hin', () => {
    const text = tabelle(SAETZE);
    expect(findeDatensatzZeile(text, '  r-00042 ')).toBe(zeileVon(text, '|- id="r-00042"'));
  });
});

describe('findeDatensatzZeile — kein Ziel (AK4)', () => {
  it('eine maskierte Zeile in einer Zelle ist keine Datensatz-Zeile', () => {
    const text = tabelle(['|- id="r-00041"', '| Zitat:', '\\|- id="r-00042"']);
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(0);
  });

  it('dieselbe Zeile in einem Zaun `text` trifft nicht', () => {
    const text = tabelle(SAETZE.slice(0, 3), {
      vor: ['', '```text', '|- id="r-00042"', '```'],
    });
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(0);
  });

  it('dieselbe Zeile nach dem schließenden Zaun trifft nicht', () => {
    const text = tabelle(SAETZE.slice(0, 3), { nach: ['', '|- id="r-00042"'] });
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(0);
  });

  it('ein zweiter Datensatz-Block zählt nicht, wie für die Gültigkeit', () => {
    const text = tabelle(SAETZE.slice(0, 3), {
      nach: ['', '```perspective-records', '|- id="r-00042"', '| K-42', '```'],
    });
    expect(findeDatensatzZeile(text, 'r-00041')).toBe(zeileVon(text, '|- id="r-00041"'));
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(0);
  });

  it('eine Datei ohne Tabellen-Marke liefert 0 (AK7 der Story, Code-Beispiel)', () => {
    const text = [
      '---',
      'tags: notiz',
      '---',
      '',
      '```perspective-records',
      ...SAETZE,
      '```',
      '',
    ].join('\n');
    expect(findeDatensatzZeile(text, 'r-00042')).toBe(0);
  });

  it('eine unbekannte Kennung und die Kurzform liefern 0', () => {
    const text = tabelle(SAETZE);
    expect(findeDatensatzZeile(text, 'r-09999')).toBe(0);
    // Derselbe Vergleich wie bei der Gültigkeit: Die Kurzform gilt dort heute
    // nicht, und der Sprung folgt ihr (Befund im Epic, nicht hier zu lösen).
    expect(findeDatensatzZeile(text, 'r-42')).toBe(0);
  });

  it('bleibt bei leeren und fremden Eingaben ohne Ausnahme bei 0', () => {
    expect(findeDatensatzZeile('', 'r-00042')).toBe(0);
    expect(findeDatensatzZeile(null, 'r-00042')).toBe(0);
    expect(findeDatensatzZeile(tabelle(SAETZE), '')).toBe(0);
    expect(findeDatensatzZeile(tabelle(SAETZE), null)).toBe(0);
  });
});
