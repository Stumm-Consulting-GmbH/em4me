// @vitest-environment jsdom
// 4T-002190 (Epic 3E-000353): Wächter über die Vorlese-Texte des
// Fenster-Gerüsts. Dreizehn Elemente in src/renderer/index.html trugen einen
// festen `aria-label` in einer Sprache («Edit», «Ansicht», «Replace All» …)
// ohne Übersetzungs-Merkmal; nach dem Sprachwechsel las ein Bildschirmleser
// sie weiter in dieser Sprache vor (Story 4S-000655, AK1 und AK7). Der Weg zur
// Übersetzung ist `data-i18n-aria-label`, das applyTranslations beim Start
// und bei jedem Sprachwechsel über das ganze Dokument auswertet. Dieser Fall
// meldet jedes künftige Element, das den festen Text ohne Merkmal mitbringt,
// und jeden Schlüssel, den der Sprachkatalog nicht kennt.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Bestands-Lesungen im Modulkopf (Regel «Bestands-Lesungen gehören in den
// Modulkopf», test/README.md).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HERE, '..', '..', '..');
const INDEX_HTML = fs.readFileSync(path.join(WURZEL, 'src', 'renderer', 'index.html'), 'utf8');
// Der Katalog aus den Fragmenten, der Quelle der Sprachdateien; das
// zusammengesetzte Erzeugnis entsteht erst beim Bau. Die Gleichheit der
// Schlüssel über alle fünf Sprachen hält scripts/check-i18n.js.
const FRAGMENT_DIR = path.join(WURZEL, 'src', 'i18n', 'fragments', 'de');
const DE_KATALOG = Object.assign(
  {},
  ...fs
    .readdirSync(FRAGMENT_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(FRAGMENT_DIR, name), 'utf8'))),
);

// Beschreibung eines Elements für die Befund-Meldung: Tag, Kennung oder
// Klasse und der feste Vorlese-Text.
function beschreibe(el) {
  const name = el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(/\s+/)[0]}` : '';
  return `<${el.tagName.toLowerCase()}${name}> aria-label="${el.getAttribute('aria-label')}"`;
}

// Elemente mit festem Vorlese-Text ohne Übersetzungs-Merkmal. Ein leerer
// `aria-label=""` ist ein Platzhalter, den der Code zur Laufzeit füllt, und
// trägt keinen Text in einer Sprache.
function ohneMerkmal(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('[aria-label]:not([data-i18n-aria-label])')]
    .filter((el) => el.getAttribute('aria-label').trim() !== '')
    .map(beschreibe);
}

function unbekannteSchluessel(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('[data-i18n-aria-label]')]
    .map((el) => el.getAttribute('data-i18n-aria-label'))
    .filter((key) => typeof DE_KATALOG[key] !== 'string' || DE_KATALOG[key] === '');
}

describe('Vorlese-Texte des Fenster-Gerüsts (4T-002190)', () => {
  it('jedes Element mit festem Vorlese-Text trägt ein Übersetzungs-Merkmal', () => {
    expect(ohneMerkmal(INDEX_HTML)).toEqual([]);
  });

  it('jeder Schlüssel eines Vorlese-Texts steht im Sprachkatalog', () => {
    expect(unbekannteSchluessel(INDEX_HTML)).toEqual([]);
  });

  // Rot-Probe des Wächters selbst: Ein Element ohne Merkmal muss er melden,
  // ein Platzhalter und ein übersetztes Element nicht.
  it('meldet ein Element ohne Merkmal und lässt Platzhalter und übersetzte Elemente durch', () => {
    const probe =
      '<div id="probe" role="group" aria-label="Ansicht"></div>' +
      '<button aria-label=""></button>' +
      '<button data-i18n-aria-label="menu.view.edit" aria-label="Edit"></button>' +
      '<button data-i18n-aria-label="gibt.es.nicht" aria-label="X"></button>';
    expect(ohneMerkmal(probe)).toEqual(['<div#probe> aria-label="Ansicht"']);
    expect(unbekannteSchluessel(probe)).toEqual(['gibt.es.nicht']);
  });
});
