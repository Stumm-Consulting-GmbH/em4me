// 4T-0581/4T-0582 (Epic 3E-0107): Rechtschreibprüfung.
//
// Der Prüfer selbst gehört dem Betriebssystem und lässt sich im Testlauf nicht
// nachstellen; geprüft werden deshalb die reinen Helfer und die drei
// Festlegungen, deren stille Rücknahme das Verhalten unbemerkt umkehren würde:
//
//   1. Es wird NIE eine Prüfsprache gesetzt. Jeder
//      setSpellCheckerLanguages-Aufruf stößt den Download eines Wörterbuchs
//      aus dem Netz an (gemessen am 2026-08-02 an Electron 33), auch mit der
//      Systemsprache als Argument. Architekturentscheidung 6 des Epics.
//   2. webPreferences.spellcheck steht fest auf true. Ein mit false erzeugtes
//      WebContents lässt sich später durch nichts mehr zum Prüfen bewegen,
//      auch nicht durch setSpellCheckerEnabled(true) (ebenfalls gemessen).
//      Der Schalter sitzt deshalb am Content-Attribut der Editor-Fläche.
//   3. showEditorContextMenu bricht das DOM-Ereignis NICHT mit preventDefault
//      ab. Ein Abbruch unterdrückt das context-menu-Ereignis des
//      Main-Prozesses und damit die einzige Quelle der Korrektur-Vorschläge.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 4T-1328: Bestands-Leser ans benannte Limit (Riss im Linux-Container 2026-08-31).
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';
import {
  SPELLCHECK_EXTENSION_ID,
  SPELLCHECK_KEY,
  normalizeDictionaryWords,
  normalizeSpellcheckSetting,
  spellcheckAttributeValue,
} from '../../src/shared/spellcheck.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'src');
const lies = (...teile) => fs.readFileSync(path.join(SRC, ...teile), 'utf8');

describe('Schalter-Auflösung (4T-0581)', () => {
  it('prüft nur bei gesetztem Schalter UND aktiver Erweiterung', () => {
    expect(spellcheckAttributeValue(true, true)).toBe('true');
    expect(spellcheckAttributeValue(true, false)).toBe('false');
    expect(spellcheckAttributeValue(false, true)).toBe('false');
    expect(spellcheckAttributeValue(false, false)).toBe('false');
  });

  it('liefert immer einen der beiden Attribut-Werte, auch bei Unfug', () => {
    // CodeMirror setzt am Inhalts-Element von Haus aus spellcheck="false";
    // ein undefined statt 'false' würde die Voreinstellung durchreichen und
    // wäre nicht mehr vom An-Zustand unterscheidbar.
    expect(spellcheckAttributeValue(undefined, undefined)).toBe('false');
    expect(spellcheckAttributeValue('true', 1)).toBe('false');
  });

  it('normalisiert den Store-Wert zu einem echten Schalter (Default aus)', () => {
    expect(normalizeSpellcheckSetting(true)).toBe(true);
    expect(normalizeSpellcheckSetting(false)).toBe(false);
    expect(normalizeSpellcheckSetting(undefined)).toBe(false);
    expect(normalizeSpellcheckSetting(null)).toBe(false);
    expect(normalizeSpellcheckSetting('true')).toBe(false);
    expect(normalizeSpellcheckSetting(1)).toBe(false);
  });
});

describe('Wörterbuch-Liste (4T-0582)', () => {
  it('trimmt, entdoppelt und sortiert gebietsschema-unabhängig', () => {
    expect(normalizeDictionaryWords(['Zeta', ' Alpha ', 'Alpha', 'beta'])).toEqual([
      'Alpha',
      'Zeta',
      'beta',
    ]);
  });

  it('verwirft alles, was kein nicht-leeres Wort ist', () => {
    expect(normalizeDictionaryWords(['ok', '', '   ', null, 7, undefined, {}])).toEqual(['ok']);
  });

  it('liefert bei fehlender oder defekter Eingabe die leere Liste', () => {
    expect(normalizeDictionaryWords(undefined)).toEqual([]);
    expect(normalizeDictionaryWords(null)).toEqual([]);
    expect(normalizeDictionaryWords('Wort')).toEqual([]);
  });
});

describe('Erweiterungs-Registrierung (4T-0581)', () => {
  it('ist als schaltbare Werkzeug-Erweiterung mit eigenem Bereich registriert', () => {
    const manifest = extensionById(SPELLCHECK_EXTENSION_ID);
    expect(manifest).not.toBeNull();
    expect(manifest.category).toBe('tools');
    expect(manifest.settingsSections).toEqual(['spellcheck']);
    // Ohne eigene Registry-Kommandos: die Funktion wirkt über ein
    // Content-Attribut und das Kontextmenü.
    expect(manifest.commands).toBeUndefined();
  });

  it('nutzt die Funktions-Katalog-Keys statt eigener extension.*-Keys', () => {
    const manifest = extensionById(SPELLCHECK_EXTENSION_ID);
    expect(manifest.nameKey).toBe('help.featureName.spellcheck');
    expect(manifest.descKey).toBe('help.feature.spellcheck');
  });
});

describe('Wächter gegen stille Rücknahme (Epic 3E-0107)', () => {
  it(
    'setzt nirgends im Auslieferungs-Code eine Prüfsprache',
    () => {
      const treffer = [];
      const durchlaufen = (ordner) => {
        for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
          const voll = path.join(ordner, eintrag.name);
          if (eintrag.isDirectory()) {
            durchlaufen(voll);
            continue;
          }
          if (!eintrag.name.endsWith('.js')) continue;
          // Die gebauten Bundles sind erzeugter Output der Quellen daneben.
          if (eintrag.name.endsWith('.bundle.js')) continue;
          const text = fs.readFileSync(voll, 'utf8');
          // Der Kommentar im Wächter-Test selbst liegt außerhalb von src/.
          if (text.includes('setSpellCheckerLanguages(')) {
            treffer.push(path.relative(SRC, voll));
          }
        }
      };
      durchlaufen(SRC);
      expect(treffer).toEqual([]);
    },
    BESTAND_ZEITLIMIT,
  );

  it('erzeugt Fenster fest mit spellcheck: true', () => {
    // 4T-0998: createWindow liegt seit dem Main-Schnitt in window-manager.js;
    // der geprüfte Options-Block ist unverändert mitgereist.
    const main = lies('main', 'window-manager.js');
    const start = main.indexOf('webPreferences: {');
    expect(start).toBeGreaterThan(-1);
    // Der Options-Block endet vor dem Konstruktor-Aufruf; er allein zählt,
    // die IPC-Kanalnamen 'spellcheck:…' weiter unten dürfen nicht mitgelesen
    // werden.
    // Kommentarzeilen fallen weg: der Kopf-Kommentar an Ort und Stelle
    // begründet die Festlegung und nennt dabei die verworfene Alternative.
    const block = main
      .slice(start, main.indexOf('new BrowserWindow(options)'))
      .split('\n')
      .filter((zeile) => !zeile.trim().startsWith('//'))
      .join('\n');
    expect(block).toMatch(/spellcheck:\s*true,/);
    // Ein an den Schalter gebundener Wert wäre die Rücknahme der Festlegung:
    // ein mit false erzeugtes WebContents prüft danach nie wieder.
    const werte = [...block.matchAll(/spellcheck:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(werte).toEqual(['true']);
  });

  it('bricht das DOM-Kontextmenü-Ereignis des Editors nicht ab', () => {
    const menu = lies('renderer', 'modules', 'editor', 'editor-context-menu.js');
    const start = menu.indexOf('export function showEditorContextMenu');
    expect(start).toBeGreaterThan(-1);
    const rumpf = menu.slice(start);
    expect(rumpf).not.toContain('preventDefault');
  });

  it(
    'führt den Store-Schlüssel an genau einer Stelle',
    () => {
      expect(SPELLCHECK_KEY).toBe('editor.spellcheck');
      // Main und Renderer lesen ihn aus dem geteilten Modul; ein zweites
      // Literal im Code wäre eine Kopie, die auseinanderlaufen kann.
      const treffer = [];
      const durchlaufen = (ordner) => {
        for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
          const voll = path.join(ordner, eintrag.name);
          if (eintrag.isDirectory()) {
            durchlaufen(voll);
            continue;
          }
          if (!eintrag.name.endsWith('.js') || eintrag.name.endsWith('.bundle.js')) continue;
          if (path.relative(SRC, voll) === path.join('shared', 'spellcheck.js')) continue;
          if (fs.readFileSync(voll, 'utf8').includes("'editor.spellcheck'")) {
            treffer.push(path.relative(SRC, voll));
          }
        }
      };
      durchlaufen(SRC);
      expect(treffer).toEqual([]);
    },
    BESTAND_ZEITLIMIT,
  );
});
