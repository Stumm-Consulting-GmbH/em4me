// 4T-001592 (Story 4S-000905, Epic 3E-000129): Wächter über die Sprach-Vorlage.
//
// Gemessen wird die ausgegebene Datei gegen die englische Fassung, aus der sie
// entsteht: vollständiger Schlüssel-Bestand, flache Struktur, Zeichenketten als
// Werte, unveränderte Platzhalter. Das sind genau die vier Eigenschaften, die
// der Einspiel-Weg später prüft (4T-001593) — eine Vorlage, die sie verletzt,
// wäre vom eigenen Programm nicht wieder annehmbar.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocaleTemplate, META_LOCALE, META_NAME } from '../../src/shared/locale-file.js';
import { FALLBACK_LOCALE } from '../../src/shared/locales.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EN = JSON.parse(
  fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', `${FALLBACK_LOCALE}.json`), 'utf8'),
);

const VORLAGE = buildLocaleTemplate(EN);
const GELESEN = JSON.parse(VORLAGE);

// Platzhalter-Muster wie in scripts/check-i18n.js:17 — dieselbe Regel, mit der
// die mitgelieferten Fassungen gemessen werden.
function platzhalter(wert) {
  const found = new Set();
  for (const m of String(wert).matchAll(/\{([a-zA-Z0-9_]+)\}/g)) found.add(m[1]);
  return found;
}

// 4T-001593 (Anordnung des Product Owners vom 2026-09-09): Die Vorlage trägt
// seither zwei Metadaten-Felder ganz oben, mit denen der Übersetzer seine
// Sprache benennt. Sie sind keine Übersetzungs-Schlüssel; die Fälle unten
// messen den Katalog-Anteil deshalb ohne sie.
const OHNE_META = Object.keys(GELESEN).filter((k) => k !== META_LOCALE && k !== META_NAME);

describe('Sprach-Vorlage (4T-001592)', () => {
  it('ist gültiges JSON und trägt den vollständigen Schlüssel-Bestand', () => {
    expect(OHNE_META.length).toBe(Object.keys(EN).length);
    expect(OHNE_META).toEqual(Object.keys(EN));
  });

  it('führt die beiden Metadaten-Felder leer und an erster Stelle', () => {
    // Leer heisst «hier gehört etwas hin»; ein Beispiel-Wert bliebe stehen,
    // und dann hiesse jede eingespielte Sprache gleich.
    expect(Object.keys(GELESEN).slice(0, 2)).toEqual([META_LOCALE, META_NAME]);
    expect(GELESEN[META_LOCALE]).toBe('');
    expect(GELESEN[META_NAME]).toBe('');
  });

  it('ist flach: kein verschachteltes Objekt, kein Feld, kein null', () => {
    for (const [key, wert] of Object.entries(GELESEN)) {
      expect(typeof wert, `${key} ist keine Zeichenkette`).toBe('string');
    }
  });

  it('lässt jeden Platzhalter unverändert', () => {
    for (const [key, wert] of Object.entries(EN)) {
      expect([...platzhalter(GELESEN[key])].sort(), `Platzhalter von ${key}`).toEqual(
        [...platzhalter(wert)].sort(),
      );
    }
  });

  it('behält die Schlüssel-Reihenfolge der Quelle bei', () => {
    // Trägt den Datei-Vergleich zweier Vorlagen-Stände: Bei stabiler
    // Reihenfolge zeigt ein Diff die echten Änderungen und nicht die
    // Umsortierung.
    expect(OHNE_META).toStrictEqual(Object.keys(EN));
  });

  it('ist eingerückt und endet mit einem Zeilenumbruch', () => {
    expect(VORLAGE.endsWith('\n')).toBe(true);
    expect(VORLAGE.split('\n')[1].startsWith('  "')).toBe(true);
    // Eine Zeile je Schlüssel plus die beiden Metadaten-Zeilen, die beiden
    // Klammer-Zeilen und die Schluss-Leerzeile: Wer die Datei im eigenen
    // Editor bearbeitet, sieht jeden Eintrag einzeln.
    expect(VORLAGE.split('\n').length).toBe(Object.keys(EN).length + 5);
  });

  it('trägt die Ausgangssprache der Anwendung, nicht die Anzeige-Sprache', () => {
    // Englisch ist zugleich die Rückfall-Sprache (4T-001595): Was der
    // Übersetzer vor sich hat, ist genau der Text, der bei einer Lücke seiner
    // Datei stehen bliebe. Gegenprobe an einem Schlüssel, dessen deutsche und
    // englische Fassung sich unterscheiden.
    const de = JSON.parse(
      fs.readFileSync(path.resolve(HERE, '..', '..', 'src', 'i18n', 'de.json'), 'utf8'),
    );
    const abweichend = Object.keys(EN).find((k) => de[k] && de[k] !== EN[k]);
    expect(abweichend, 'kein abweichender Schlüssel gefunden').toBeTruthy();
    expect(GELESEN[abweichend]).toBe(EN[abweichend]);
    expect(GELESEN[abweichend]).not.toBe(de[abweichend]);
  });

  it('führt die neuen Bedien- und Meldungs-Schlüssel selbst mit', () => {
    // Selbstbezüglichkeit als Prüfung: Die Vorlage enthält auch die Texte des
    // Weges, über den sie entstanden ist — sonst bliebe ausgerechnet dieser
    // Weg in einer eigenen Sprache unübersetzt.
    for (const key of [
      'menu.file.exportLocaleTemplate',
      'locales.template.saveDialogTitle',
      'locales.template.done',
      'locales.template.failed',
      'dialog.filterJson',
    ]) {
      expect(GELESEN[key], `${key} fehlt in der Vorlage`).toBeTruthy();
    }
  });
});
