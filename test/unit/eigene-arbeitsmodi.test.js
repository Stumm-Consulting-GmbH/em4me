// 4T-001882 (Epic 3E-000185, Story 4S-000993): Das Datenmodell der eigenen
// Arbeitsmodi — Säuberung der Ablage, der Schalter-Stand beim Anwenden und der
// Abgleich gegen die aktuelle Registry.
//
// Geprüft wird hier ausschließlich die reine Ableitung ohne Oberfläche; was
// der Anwender davon sieht, steht in test/unit/renderer/settings-extensions.test.js
// (Bedienung im Entwurf) und in test/e2e/funktionen/arbeitsmodi.spec.js
// (AM-06 bis AM-08 an der gestarteten Anwendung).
import { describe, it, expect } from 'vitest';
import {
  EXTENSION_MODES_KEY,
  disabledIdsForExtensionMode,
  extensionModeById,
  extensionModeByName,
  matchingExtensionMode,
  normalizeExtensionModeList,
  sanitizeExtensionMode,
} from '../../src/shared/extensions/extension-modes.js';
import {
  disabledIdsForModeLevel,
  effectiveDisabledSet,
  normalizeDisabledIds,
} from '../../src/shared/extensions/extensions-core.js';
import { allExtensions } from '../../src/shared/extensions/extensions.js';

const modus = (id, name, disabled) => ({ id, name, disabled });

describe('Ablage der eigenen Arbeitsmodi (4T-001882)', () => {
  it('liegt im globalen Speicher neben dem Schalter-Stand', () => {
    // Die Ablage-Entscheidung ist gegenständlich und nicht bloß Prosa: derselbe
    // Namensraum wie `extensions.disabled`, also global und nicht an einen
    // Bereich gebunden (AK7 der Story).
    expect(EXTENSION_MODES_KEY).toBe('extensions.modes');
  });

  it('AK6/AK18: trimmt den Namen, behält Umlaute und Sonderzeichen, weist Leeres ab', () => {
    expect(sanitizeExtensionMode({ id: 'a', name: '  Schreiben  ', disabled: [] }).name).toBe(
      'Schreiben',
    );
    expect(sanitizeExtensionMode({ id: 'a', name: 'Prüfen & Ordnen (2)', disabled: [] }).name).toBe(
      'Prüfen & Ordnen (2)',
    );
    expect(sanitizeExtensionMode({ id: 'a', name: '   ', disabled: [] })).toBeNull();
    expect(sanitizeExtensionMode({ id: 'a', name: '', disabled: [] })).toBeNull();
    expect(sanitizeExtensionMode({ id: '', name: 'X', disabled: [] })).toBeNull();
    expect(sanitizeExtensionMode(null)).toBeNull();
  });

  it('säubert die Liste: defekte Einträge und doppelte Kennungen entfallen', () => {
    const liste = normalizeExtensionModeList([
      modus('a', 'Eins', ['katex', 'katex', 7, '']),
      modus('a', 'Doppelte Kennung', []),
      { name: 'ohne Kennung' },
      'Unsinn',
      modus('b', 'Zwei', 'keine Liste'),
    ]);
    expect(liste.map((m) => m.id)).toEqual(['a', 'b']);
    expect(liste[0].disabled).toEqual(['katex']);
    expect(liste[1].disabled).toEqual([]);
    expect(normalizeExtensionModeList('keine Liste')).toEqual([]);
  });

  it('AK8: eine unbekannte Kennung bleibt in der Ablage und entfällt erst beim Anwenden', () => {
    const gespeichert = normalizeExtensionModeList([
      modus('a', 'Alt', ['katex', 'gibt-es-nicht-mehr']),
    ]);
    // In der Ablage steht sie weiter — sie kehrt mit ihrer Erweiterung zurück.
    expect(gespeichert[0].disabled).toContain('gibt-es-nicht-mehr');
    // Beim Anwenden entfällt sie, und der Modus bleibt anwendbar.
    expect(disabledIdsForExtensionMode(gespeichert[0])).toEqual(['katex']);
  });

  it('AK18: der leere und der volle Modus sind beide zulässig', () => {
    const leer = modus('a', 'Alles an', []);
    const voll = modus('b', 'Alles aus', disabledIdsForModeLevel('beginner'));
    expect(disabledIdsForExtensionMode(leer)).toEqual([]);
    expect(disabledIdsForExtensionMode(voll)).toEqual(disabledIdsForModeLevel('beginner'));
  });

  it('AK17: ein mitgebrachter Modus mit unzulässiger Zusammenstellung wird nicht umgeschrieben', () => {
    // Grundlage abgeschaltet, Abhängige darin eingeschaltet: Der Modus nennt
    // allein die Grundlage, und das Anwenden schreibt genau das.
    const mitgebracht = modus('a', 'Fremd', ['property-profiles']);
    const stand = disabledIdsForExtensionMode(mitgebracht);
    expect(stand).toEqual(['property-profiles']);
    // Die Abhängige wirkt als abgeschaltet — abgeleitet, nicht gespeichert.
    const wirksam = effectiveDisabledSet(stand);
    expect(wirksam.has('events')).toBe(true);
    expect(mitgebracht.disabled).toEqual(['property-profiles']);
  });

  it('AK15: ein Modus trägt ausschließlich Kennungen der internen Registry', () => {
    const bekannt = new Set(allExtensions().map((m) => m.id));
    const mitFremdem = modus('a', 'Gemischt', ['katex', 'fremde-erweiterung']);
    for (const id of disabledIdsForExtensionMode(mitFremdem)) {
      expect(bekannt.has(id), id).toBe(true);
    }
  });
});

describe('Abgleich eines Schalter-Stands gegen die eigenen Modi (4T-001882)', () => {
  it('erkennt den passenden Modus, sonst null', () => {
    const modi = [modus('a', 'Fokus', ['katex', 'mermaid']), modus('b', 'Ordnen', [])];
    expect(matchingExtensionMode(['mermaid', 'katex'], modi).id).toBe('a');
    expect(matchingExtensionMode([], modi).id).toBe('b');
    expect(matchingExtensionMode(['katex'], modi)).toBeNull();
    expect(matchingExtensionMode([], [])).toBeNull();
  });

  it('AK19: wiederholtes Anwenden desselben Modus ändert den Stand nicht', () => {
    const eigener = modus('a', 'Fokus', ['katex', 'mermaid']);
    const erst = disabledIdsForExtensionMode(eigener);
    const zweit = disabledIdsForExtensionMode(eigener);
    expect(zweit).toEqual(erst);
    expect(matchingExtensionMode(zweit, [eigener]).id).toBe('a');
  });

  it('AK8: ein Modus mit entfallener Kennung gilt nach seinem Anwenden als aktiv', () => {
    const veraltet = modus('a', 'Alt', ['katex', 'gibt-es-nicht-mehr']);
    const stand = disabledIdsForExtensionMode(veraltet);
    expect(matchingExtensionMode(stand, [veraltet]).id).toBe('a');
  });

  it('AK9: eine hinzugekommene Erweiterung bleibt beim Anwenden eingeschaltet', () => {
    // Nachgestellt über eine übergebene Registry-Liste: Der Modus ist zu einer
    // Zeit entstanden, als es «neuling» noch nicht gab.
    const alt = allExtensions().slice(0, 3);
    const neu = [...alt, { id: 'neuling', dependencies: [], modeLevel: 'full' }];
    const gespeichert = modus('a', 'Alt', [alt[0].id]);
    const stand = disabledIdsForExtensionMode(gespeichert, neu);
    expect(stand).toEqual([alt[0].id]);
    expect(normalizeDisabledIds(stand, neu)).not.toContain('neuling');
  });

  it('AK3: auch bei vielen gespeicherten Modi bleibt die Zuordnung eindeutig', () => {
    const viele = Array.from({ length: 50 }, (_, i) => modus(`m${i}`, `Modus ${i}`, ['katex']));
    viele.push(modus('ziel', 'Ziel', ['mermaid']));
    expect(normalizeExtensionModeList(viele)).toHaveLength(51);
    expect(matchingExtensionMode(['mermaid'], viele).id).toBe('ziel');
    // Bei mehreren gleichen Sätzen gewinnt der erste — die Liste ist geordnet.
    expect(matchingExtensionMode(['katex'], viele).id).toBe('m0');
  });

  it('findet einen Modus über Kennung und über Namen', () => {
    const modi = [modus('a', 'Fokus', []), modus('b', 'Ordnen', [])];
    expect(extensionModeById(modi, 'b').name).toBe('Ordnen');
    expect(extensionModeById(modi, 'x')).toBeNull();
    expect(extensionModeByName(modi, '  Fokus  ').id).toBe('a');
    expect(extensionModeByName(modi, 'fokus')).toBeNull();
    expect(extensionModeByName(modi, '   ')).toBeNull();
  });
});
