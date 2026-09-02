// 4T-000644 (Epic 3E-000127): Alterungs-Schutz der geführten Produkt-Tour.
//
// Die Stationen-Folge (src/renderer/modules/tour/tour-stationen.js) ist die
// führende Quelle; ihre beiden Bezüge nach außen sind statisch prüfbar und
// werden hier in **beide Richtungen** gehalten (Muster demo-area.test.js):
//
//   Anker-Seite  Jeder in einer Station genannte Anker existiert als
//                `data-tour`-Attribut in index.html, und jedes `data-tour`-
//                Attribut in index.html gehört zu einer Station. Ohne die
//                Rückrichtung bliebe ein verwaister Anker unbemerkt stehen,
//                nachdem seine Station entfallen ist.
//   Text-Seite   Zu jeder Station existieren `tour.<id>.title` und
//                `tour.<id>.text` in allen fünf Sprachdateien, dazu die vier
//                Bedien-Texte. Der i18n-Wächter kann das prinzipiell nicht
//                sehen: Er vergleicht die Sprachdateien nur untereinander,
//                nie gegen die Stationen-Folge.
//
// Gelesen wird index.html als **Text** (Muster panel-access.test.js), nicht
// über ein DOM: Die Prüfung soll an der ausgelieferten Datei hängen und nicht
// an einer Parser-Bibliothek. Die Stationen-Datei selbst wird importiert, weil
// sie bewusst ohne DOM-Zugriff und ohne Seiteneffekt gebaut ist.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_STATIONEN } from '../../src/renderer/modules/tour/tour-stationen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
const I18N_DIR = path.join(ROOT, 'src', 'i18n');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];
const DICTS = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8')),
  ]),
);

// Alle Anker-Werte, die index.html real trägt. Bewusst über das Attribut und
// nicht über eine Element-Liste: Wandert ein Ziel im Markup, bleibt der Anker
// derselbe — genau das ist der Zweck des eigenen Attributs.
const HTML_ANKER = [...INDEX_HTML.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1]);

// Ein Schlüssel gilt als vorhanden, wenn er in JEDER Sprachdatei als nicht
// leere Zeichenkette steht. Ein leerer Wert wäre in der Oberfläche ein leeres
// Popover und damit schlimmer als ein fehlender Schlüssel, den der Rückfall
// wenigstens als Bezeichner sichtbar macht.
function fehlendeSprachen(key) {
  return LANGS.filter((lang) => {
    const wert = DICTS[lang][key];
    return typeof wert !== 'string' || wert.trim().length === 0;
  });
}

describe('Tour-Stationen: Folge und Identität (4T-000644)', () => {
  it('führt genau zehn Stationen mit eindeutigen IDs', () => {
    expect(Array.isArray(TOUR_STATIONEN)).toBe(true);
    expect(TOUR_STATIONEN.length).toBe(10);
    const ids = TOUR_STATIONEN.map((s) => s.id);
    expect(new Set(ids).size, `doppelte Stations-ID: ${ids.join(', ')}`).toBe(ids.length);
    for (const station of TOUR_STATIONEN) {
      expect(typeof station.id, `Stations-ID keine Zeichenkette: ${station.id}`).toBe('string');
      expect(station.id.length, 'leere Stations-ID').toBeGreaterThan(0);
      // `anker` ist Pflichtfeld: null steht für die bewusst ankerlose Karte,
      // `undefined` dagegen für ein vergessenes Feld. Der Unterschied ist die
      // ganze Aussage des Feldes und wird deshalb geprüft.
      expect(
        station.anker === null || typeof station.anker === 'string',
        `Station ${station.id}: anker muss ein String oder null sein`,
      ).toBe(true);
      if (typeof station.anker === 'string')
        expect(station.anker.length, `Station ${station.id}: leerer Anker`).toBeGreaterThan(0);
    }
  });
});

describe('Tour-Stationen: Anker gegen index.html, beide Richtungen (4T-000644)', () => {
  it('jeder genannte Anker existiert als data-tour-Attribut in index.html', () => {
    const fehlend = TOUR_STATIONEN.filter(
      (s) => typeof s.anker === 'string' && !HTML_ANKER.includes(s.anker),
    ).map((s) => `${s.id} -> data-tour="${s.anker}"`);
    expect(
      fehlend,
      `Anker ohne Ziel in src/renderer/index.html: ${fehlend.join(', ')}. Die Station ` +
        'fiele zur Laufzeit stillschweigend auf die ankerlose Karte zurück.',
    ).toEqual([]);
  });

  it('jedes data-tour-Attribut in index.html gehört zu einer Station', () => {
    const bekannt = new Set(
      TOUR_STATIONEN.map((s) => s.anker).filter((a) => typeof a === 'string'),
    );
    const verwaist = HTML_ANKER.filter((a) => !bekannt.has(a));
    expect(verwaist, `Verwaiste data-tour-Anker in index.html: ${verwaist.join(', ')}`).toEqual([]);
  });

  it('kein Anker steht doppelt im Markup', () => {
    // Zwei Elemente mit demselben Anker wären nicht entscheidbar: querySelector
    // nimmt das erste, und welches das ist, hängt an der Markup-Reihenfolge.
    const doppelt = HTML_ANKER.filter((a, i) => HTML_ANKER.indexOf(a) !== i);
    expect(doppelt, `data-tour mehrfach vergeben: ${[...new Set(doppelt)].join(', ')}`).toEqual([]);
  });
});

describe('Tour-Stationen: Texte in allen fünf Sprachen (4T-000644)', () => {
  it('zu jeder Station existieren title und text in allen fünf Sprachdateien', () => {
    const fehlend = [];
    for (const station of TOUR_STATIONEN)
      for (const suffix of ['title', 'text']) {
        const key = `tour.${station.id}.${suffix}`;
        const luecken = fehlendeSprachen(key);
        if (luecken.length) fehlend.push(`${key} fehlt in: ${luecken.join(', ')}`);
      }
    expect(fehlend, fehlend.join('\n')).toEqual([]);
  });

  it('die vier Bedien-Texte der Tour existieren in allen fünf Sprachdateien', () => {
    const fehlend = [];
    for (const key of ['tour.next', 'tour.prev', 'tour.done', 'tour.progress']) {
      const luecken = fehlendeSprachen(key);
      if (luecken.length) fehlend.push(`${key} fehlt in: ${luecken.join(', ')}`);
    }
    expect(fehlend, fehlend.join('\n')).toEqual([]);
  });

  it('kein verwaister tour.*-Schlüssel in de.json', () => {
    // Rückrichtung der Text-Seite: Entfällt eine Station, sollen ihre Texte
    // mit ihr gehen statt als toter Bestand in fünf Dateien liegen zu bleiben.
    const erlaubt = new Set(['tour.next', 'tour.prev', 'tour.done', 'tour.progress']);
    for (const station of TOUR_STATIONEN) {
      erlaubt.add(`tour.${station.id}.title`);
      erlaubt.add(`tour.${station.id}.text`);
    }
    const verwaist = Object.keys(DICTS.de).filter((k) => k.startsWith('tour.') && !erlaubt.has(k));
    expect(verwaist, `tour.*-Schlüssel ohne Station: ${verwaist.join(', ')}`).toEqual([]);
  });
});
