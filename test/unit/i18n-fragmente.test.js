// 4T-001605 (Epic 3E-000278): Wächter über die Zerlegung der Sprachdateien in
// Fragmente.
//
// Der Gegenstand ist eine ZUSAGE, keine Datei: Die 195 Fragment-Dateien sagen
// zusammen genau dasselbe wie die fünf Sprachdateien, aus denen sie entstanden
// sind — Schlüssel für Schlüssel, Wert für Wert, ohne Dublette und ohne
// Verlust. Solange die zusammengesetzten Dateien noch versioniert sind, ist die
// Prüfung ein Vergleich gegen den Bestand; nach der Umstellung des Bau-Schritts
// bleibt sie der Nachweis, dass die Zerlegung wiederholbar ist.
//
// Zusätzlich geprüft wird die MECHANIK des Laders an einem Wegwerf-Bestand:
// falsches Fragment, Dublette, fehlende Datei, Nicht-Zeichenkette, unbekannter
// Namensraum. Ein Wächter, der nur den grünen Fall kennt, ist eingerichtet und
// nicht nachweislich scharf (Fehlerklasse L11) — die Gegenproben belegen, dass
// er einen Verstoß auch wirklich findet.
//
// Lese-Ort-Regel (4T-001632): Diese Datei liest über 200 Bestands-Dateien. Alle
// Lesungen des Repositoriums stehen deshalb im MODULKOPF, wo `testTimeout` sie
// nicht bemisst; in den Prüffällen wird nur noch verglichen.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAGMENTE_WURZEL,
  LOCALE_CODES,
  ladeManifest,
  fragmentFuer,
  fragmentDateien,
  zusammensetzen,
  serialisiere,
} from '../../scripts/i18n-fragmente.js';
import { zerlegen } from '../../scripts/i18n-zerlegen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HERE, '..', '..');
const I18N_DIR = path.join(WURZEL, 'src', 'i18n');

// --- Bestands-Lesung, Modulkopf --------------------------------------------

const MANIFEST = ladeManifest();
const FRAGMENT_NAMEN = MANIFEST.fragmente.map((f) => f.name);

const SPRACH_TEXTE = new Map(
  LOCALE_CODES.map((code) => [code, fs.readFileSync(path.join(I18N_DIR, `${code}.json`), 'utf8')]),
);
const SPRACH_DICTS = new Map([...SPRACH_TEXTE].map(([code, text]) => [code, JSON.parse(text)]));

// Schlüssel → Position in de.json. Trägt die Reihenfolge-Prüfung (AK5).
const DE_POSITION = new Map(Object.keys(SPRACH_DICTS.get('de')).map((k, i) => [k, i]));

// `${code}/${name}` → Text bzw. Wörterbuch der Fragment-Datei.
const FRAGMENT_TEXTE = new Map();
for (const code of LOCALE_CODES) {
  for (const name of FRAGMENT_NAMEN) {
    const datei = path.join(FRAGMENTE_WURZEL, code, `${name}.json`);
    FRAGMENT_TEXTE.set(`${code}/${name}`, fs.readFileSync(datei, 'utf8'));
  }
}
const FRAGMENT_DICTS = new Map(
  [...FRAGMENT_TEXTE].map(([schluessel, text]) => [schluessel, JSON.parse(text)]),
);

// Der Lader über den echten Bestand, einmal je Sprache.
const ZUSAMMENGESETZT = new Map(LOCALE_CODES.map((code) => [code, zusammensetzen(code)]));

// Die Datei-Liste je Sprache (liest die Zuordnungs-Tafel).
const DATEI_LISTEN = new Map(LOCALE_CODES.map((code) => [code, fragmentDateien(code)]));

// --- Wegwerf-Bestand für die Mechanik-Gegenproben ---------------------------

/**
 * Legt einen Mini-Fragment-Bestand im Temp-Ordner an.
 *
 * @param {object} manifest Inhalt der manifest.json.
 * @param {Object<string,object>} dateien `<name>` → Inhalt von `<code>/<name>.json`.
 * @returns {string} Wurzel des Wegwerf-Bestands.
 */
function legeWegwerfBestand(manifest, dateien = {}) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-fragmente-'));
  fs.writeFileSync(path.join(wurzel, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const ordner = path.join(wurzel, 'de');
  fs.mkdirSync(ordner, { recursive: true });
  for (const [name, inhalt] of Object.entries(dateien)) {
    fs.writeFileSync(
      path.join(ordner, `${name}.json`),
      typeof inhalt === 'string' ? inhalt : `${JSON.stringify(inhalt, null, 2)}\n`,
    );
  }
  return wurzel;
}

function raeumeAuf(wurzel) {
  try {
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Letzter Ausweg: Temp-Rest bleibt liegen; unkritisch.
  }
}

// --- AK1/AK2: kein Schlüssel und kein Wert geht verloren ---------------------

describe('Fragmente sagen dasselbe wie die Sprachdatei (AK1, AK2)', () => {
  for (const code of LOCALE_CODES) {
    it(`${code}: die Vereinigung aller Fragment-Schlüssel ist die Schlüssel-Menge von ${code}.json`, () => {
      const { dict, fehler } = ZUSAMMENGESETZT.get(code);
      expect(fehler, fehler.join('\n')).toEqual([]);
      const erwartet = Object.keys(SPRACH_DICTS.get(code)).sort();
      expect(Object.keys(dict).sort()).toEqual(erwartet);
    });

    it(`${code}: jeder Wert steht unverändert im Fragment`, () => {
      const { dict } = ZUSAMMENGESETZT.get(code);
      const original = SPRACH_DICTS.get(code);
      const abweichungen = Object.keys(original).filter((k) => dict[k] !== original[k]);
      expect(abweichungen, `abweichende Werte:\n${abweichungen.join('\n')}`).toEqual([]);
    });

    it(`${code}: die Schnittmenge je Fragment-Paar ist leer`, () => {
      // Ein Schlüssel, der in zwei Fragmenten steht, hätte zwei Wahrheiten —
      // welche gewinnt, hinge an der Reihenfolge der Zuordnungs-Tafel.
      const herkunft = new Map();
      const dubletten = [];
      for (const name of FRAGMENT_NAMEN) {
        for (const schluessel of Object.keys(FRAGMENT_DICTS.get(`${code}/${name}`))) {
          const vorher = herkunft.get(schluessel);
          if (vorher != null) dubletten.push(`${schluessel}: ${vorher} und ${name}`);
          else herkunft.set(schluessel, name);
        }
      }
      expect(dubletten, dubletten.join('\n')).toEqual([]);
    });
  }
});

// --- AK3: der Schnitt selbst -------------------------------------------------

describe('Der Schnitt trennt die großen Namensräume auf (AK3)', () => {
  // Die Obergrenze ist beim Rebase auf 1.132.0 von 40 auf 45 gehoben worden:
  // Das Release bringt den obersten Namensraum «canvas» mit, und ein neuer
  // oberster Namensraum des Produkts fuegt genau ein Fragment hinzu — das
  // Fenster wehrt Zersplitterung in Klein-Fragmente ab, nicht das Wachstum des
  // Produkts. Der Korridor bleibt eng genug, um eine Zerlegung je Schluessel
  // zu melden.
  it('führt zwischen 30 und 45 Fragmente', () => {
    expect(FRAGMENT_NAMEN.length).toBeGreaterThanOrEqual(30);
    expect(FRAGMENT_NAMEN.length).toBeLessThanOrEqual(45);
  });

  it('«help» steht nicht als ein Fragment, sondern in vier geschnittenen', () => {
    // Der Hilfe-Katalog trägt allein über 780 Schlüssel; als ein Fragment wäre
    // er die Datei, an der wieder jede Sitzung hinge.
    expect(FRAGMENT_NAMEN).not.toContain('help');
    for (const name of [
      'help-feature',
      'help-feature-name',
      'help-feature-access',
      'help-shortcut',
    ])
      expect(FRAGMENT_NAMEN).toContain(name);
  });

  it('«settings» behält nur die eigenen Schlüssel, die Unter-Namensräume liegen bei ihrer Fachlichkeit', () => {
    // Die Einstellungen eines Bereichs gehören zu ihrem Bereich, nicht in einen
    // gemeinsamen Einstellungs-Topf: settings.calendar.* ändert sich mit dem
    // Kalender und mit nichts sonst.
    expect(FRAGMENT_NAMEN).toContain('settings');
    const kalenderSchluessel = Object.keys(SPRACH_DICTS.get('de')).filter((k) =>
      k.startsWith('settings.calendar.'),
    );
    expect(kalenderSchluessel.length).toBeGreaterThan(0);
    for (const schluessel of kalenderSchluessel)
      expect(fragmentFuer(schluessel, MANIFEST), schluessel).toBe('calendar');
    // Gegenprobe an der Punkt-Grenze: Was unmittelbar zu den Einstellungen
    // gehört, bleibt dort.
    expect(fragmentFuer('settings.title', MANIFEST)).toBe('settings');
  });

  it('führt ein Fragment «common» für das, was überall gebraucht wird', () => {
    expect(FRAGMENT_NAMEN).toContain('common');
    expect(Object.keys(FRAGMENT_DICTS.get('de/common')).length).toBeGreaterThan(0);
  });

  it('kein Fragment ist leer', () => {
    const leere = FRAGMENT_NAMEN.filter(
      (name) => Object.keys(FRAGMENT_DICTS.get(`de/${name}`)).length === 0,
    );
    expect(leere).toEqual([]);
  });
});

// --- AK4: Gleichlauf über die fünf Sprachen ----------------------------------

describe('Die fünf Sprachen sind fragment-gleich (AK4)', () => {
  it('jede Sprache führt dieselben Fragment-Dateien', () => {
    for (const code of LOCALE_CODES) {
      const vorhanden = fs
        .readdirSync(path.join(FRAGMENTE_WURZEL, code))
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.slice(0, -'.json'.length))
        .sort();
      expect(vorhanden, code).toEqual([...FRAGMENT_NAMEN].sort());
      expect(DATEI_LISTEN.get(code).map((p) => path.basename(p, '.json'))).toEqual(FRAGMENT_NAMEN);
    }
  });

  it('je Fragment tragen alle fünf Sprachen dieselbe Schlüssel-Menge', () => {
    for (const name of FRAGMENT_NAMEN) {
      const leit = Object.keys(FRAGMENT_DICTS.get(`de/${name}`)).sort();
      for (const code of LOCALE_CODES) {
        expect(
          Object.keys(FRAGMENT_DICTS.get(`${code}/${name}`)).sort(),
          `${code}/${name}`,
        ).toEqual(leit);
      }
    }
  });

  it('die Zuordnungs-Tafel liegt genau einmal, nicht je Sprache', () => {
    // Eine Tafel je Sprache wären fünf Wahrheiten über denselben Schnitt.
    expect(fs.existsSync(path.join(FRAGMENTE_WURZEL, 'manifest.json'))).toBe(true);
    for (const code of LOCALE_CODES)
      expect(fs.existsSync(path.join(FRAGMENTE_WURZEL, code, 'manifest.json')), code).toBe(false);
  });
});

// --- AK5: die Textform jeder Fragment-Datei ----------------------------------

describe('Jede Fragment-Datei ist flach, zeilenweise und in de-Reihenfolge (AK5)', () => {
  it('Zeile 1 ist «{», die letzte «}», dazwischen genau ein Schlüssel je Zeile', () => {
    const befunde = [];
    for (const [schluessel, text] of FRAGMENT_TEXTE) {
      const dict = FRAGMENT_DICTS.get(schluessel);
      if (text.includes('\r')) befunde.push(`${schluessel}: enthält CR (kein reines LF)`);
      if (!text.endsWith('}\n')) befunde.push(`${schluessel}: kein abschließender Zeilenumbruch`);
      const zeilen = text.slice(0, -1).split('\n');
      if (zeilen[0] !== '{') befunde.push(`${schluessel}: Zeile 1 ist nicht «{»`);
      if (zeilen[zeilen.length - 1] !== '}')
        befunde.push(`${schluessel}: letzte Zeile ist nicht «}»`);
      const inhalt = zeilen.slice(1, -1);
      if (inhalt.length !== Object.keys(dict).length) {
        befunde.push(
          `${schluessel}: ${inhalt.length} Inhalts-Zeilen für ${Object.keys(dict).length} Schlüssel`,
        );
      }
      for (const zeile of inhalt) {
        if (!/^ {2}"(?:[^"\\]|\\.)*": /.test(zeile)) befunde.push(`${schluessel}: «${zeile}»`);
      }
    }
    expect(befunde, befunde.join('\n')).toEqual([]);
  });

  it('alle Werte sind Zeichenketten', () => {
    const befunde = [];
    for (const [schluessel, dict] of FRAGMENT_DICTS) {
      for (const [key, wert] of Object.entries(dict))
        if (typeof wert !== 'string') befunde.push(`${schluessel} / ${key}`);
    }
    expect(befunde, befunde.join('\n')).toEqual([]);
  });

  it('die Schlüssel-Reihenfolge folgt in allen fünf Sprachen der von de.json', () => {
    // Der eigentliche Gewinn gegenüber einem bloßen Aufteilen: Wer zwei
    // Sprachfassungen eines Fragments nebeneinander legt, sieht dieselbe Zeile
    // am selben Ort.
    const befunde = [];
    for (const [schluessel, dict] of FRAGMENT_DICTS) {
      const positionen = Object.keys(dict).map((k) => DE_POSITION.get(k));
      for (let i = 1; i < positionen.length; i += 1) {
        if (!(positionen[i - 1] < positionen[i])) {
          befunde.push(`${schluessel}: Schlüssel ${i} steht in de.json vor seinem Vorgänger`);
          break;
        }
      }
    }
    expect(befunde, befunde.join('\n')).toEqual([]);
  });
});

// --- AK6: Wiederholbarkeit und die eine Textform -----------------------------

describe('Die Zerlegung ist wiederholbar und byte-genau (AK6)', () => {
  it('ein Lauf in einen Wegwerf-Ordner liefert byte-gleiche Dateien wie im Repositorium', () => {
    const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-zerlegen-'));
    try {
      const ergebnis = zerlegen({ ziel });
      expect(ergebnis.summe).toBe(Object.keys(SPRACH_DICTS.get('de')).length);
      expect(ergebnis.dateien.length).toBe(FRAGMENT_NAMEN.length * LOCALE_CODES.length);
      const abweichungen = [];
      for (const [schluessel, text] of FRAGMENT_TEXTE) {
        const [code, name] = schluessel.split('/');
        const frisch = fs.readFileSync(path.join(ziel, code, `${name}.json`), 'utf8');
        if (frisch !== text) abweichungen.push(schluessel);
      }
      expect(abweichungen, abweichungen.join('\n')).toEqual([]);
    } finally {
      raeumeAuf(ziel);
    }
  });

  it('serialisiere reproduziert die fünf zusammengesetzten Dateien byte-genau', () => {
    // Die Zusage, auf der der spätere Gleichheits-Nachweis steht: Prettier-Form
    // und Erzeugnis-Form sind dieselbe Textform.
    for (const [code, text] of SPRACH_TEXTE) {
      expect(serialisiere(JSON.parse(text)), `${code}.json`).toBe(text);
    }
  });

  it('serialisiere schreibt zwei Leerzeichen Einrückung und einen Zeilenumbruch am Ende', () => {
    expect(serialisiere({ 'a.b': 'x' })).toBe('{\n  "a.b": "x"\n}\n');
  });
});

// --- Mechanik des Laders: die Gegenproben ------------------------------------

describe('Der Lader findet einen Verstoß auch wirklich (Gegenproben)', () => {
  const TAFEL = {
    fragmente: [
      { name: 'alpha', praefixe: ['alpha'] },
      { name: 'beta', praefixe: ['beta'] },
    ],
  };

  it('meldet einen Schlüssel, der im falschen Fragment liegt, samt erwartetem Fragment', () => {
    const wurzel = legeWegwerfBestand(TAFEL, {
      alpha: { 'alpha.eins': 'A', 'beta.zwei': 'B' },
      beta: {},
    });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      expect(fehler.length).toBe(1);
      expect(fehler[0]).toContain('alpha.json');
      expect(fehler[0]).toContain('beta.zwei');
      expect(fehler[0]).toContain('erwartet Fragment «beta»');
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('nennt bei einem unbekannten Namensraum den Weg statt nur den Fehler', () => {
    const wurzel = legeWegwerfBestand(TAFEL, { alpha: { 'gamma.eins': 'G' }, beta: {} });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      expect(fehler.join('\n')).toContain('kein Fragment im Manifest, Namensraum eintragen');
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('meldet einen Schlüssel in zwei Fragmenten und nennt BEIDE Dateien', () => {
    const wurzel = legeWegwerfBestand(TAFEL, {
      alpha: { 'alpha.eins': 'A' },
      beta: { 'alpha.eins': 'A' },
    });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      const dublette = fehler.find((z) => z.includes('steht in zwei Fragmenten'));
      expect(dublette, fehler.join('\n')).toBeDefined();
      expect(dublette).toContain('alpha.json');
      expect(dublette).toContain('beta.json');
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('meldet eine fehlende Fragment-Datei, statt sie still zu überspringen', () => {
    const wurzel = legeWegwerfBestand(TAFEL, { alpha: { 'alpha.eins': 'A' } });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      expect(fehler.length).toBe(1);
      expect(fehler[0]).toContain('beta.json');
      expect(fehler[0]).toContain('nicht lesbar');
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('meldet einen Wert, der keine Zeichenkette ist', () => {
    const wurzel = legeWegwerfBestand(TAFEL, {
      alpha: { 'alpha.eins': 42, 'alpha.zwei': null },
      beta: {},
    });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      expect(fehler.length).toBe(2);
      expect(fehler[0]).toContain('vom Typ number');
      expect(fehler[1]).toContain('vom Typ null');
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('meldet eine nicht parsebare Fragment-Datei, ohne zu werfen', () => {
    const wurzel = legeWegwerfBestand(TAFEL, { alpha: '{ kein JSON', beta: {} });
    try {
      const { fehler } = zusammensetzen('de', { wurzel });
      expect(fehler.length).toBe(1);
      expect(fehler[0]).toContain('nicht parsebar');
    } finally {
      raeumeAuf(wurzel);
    }
  });
});

describe('ladeManifest weist eine kaputte Zuordnungs-Tafel ab', () => {
  const mit = (manifest) => legeWegwerfBestand(manifest);

  it('weist ein doppeltes Präfix ab', () => {
    const wurzel = mit({
      fragmente: [
        { name: 'alpha', praefixe: ['gemein'] },
        { name: 'beta', praefixe: ['gemein'] },
      ],
    });
    try {
      expect(() => ladeManifest(wurzel)).toThrow(/Präfix «gemein» steht in zwei Fragmenten/);
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('weist einen doppelten Fragment-Namen ab', () => {
    const wurzel = mit({
      fragmente: [
        { name: 'alpha', praefixe: ['eins'] },
        { name: 'alpha', praefixe: ['zwei'] },
      ],
    });
    try {
      expect(() => ladeManifest(wurzel)).toThrow(/«alpha» kommt doppelt vor/);
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('weist einen Namen ab, der kein Datei-Name sein kann', () => {
    const wurzel = mit({ fragmente: [{ name: 'Alpha Fragment', praefixe: ['eins'] }] });
    try {
      expect(() => ladeManifest(wurzel)).toThrow(/passt nicht auf/);
    } finally {
      raeumeAuf(wurzel);
    }
  });

  it('weist eine leere Fragment-Liste und ein Fragment ohne Präfix ab', () => {
    const leer = mit({ fragmente: [] });
    const ohne = mit({ fragmente: [{ name: 'alpha', praefixe: [] }] });
    try {
      expect(() => ladeManifest(leer)).toThrow(/leeres Array/);
      expect(() => ladeManifest(ohne)).toThrow(/führt keine Präfixe/);
    } finally {
      raeumeAuf(leer);
      raeumeAuf(ohne);
    }
  });
});

describe('fragmentFuer trennt an der Punkt-Grenze', () => {
  it('nimmt das längste passende Präfix und nicht das erste', () => {
    const manifest = {
      fragmente: [
        { name: 'settings', praefixe: ['settings'] },
        { name: 'calendar', praefixe: ['calendar', 'settings.calendar'] },
      ],
    };
    expect(fragmentFuer('settings.calendar.weekStart', manifest)).toBe('calendar');
    expect(fragmentFuer('settings.title', manifest)).toBe('settings');
    expect(fragmentFuer('settings', manifest)).toBe('settings');
  });

  it('greift nicht über eine Punkt-Grenze hinweg', () => {
    // Ein reiner startsWith-Vergleich zöge «settingsExtra.x» in «settings».
    const manifest = { fragmente: [{ name: 'settings', praefixe: ['settings'] }] };
    expect(fragmentFuer('settingsExtra.x', manifest)).toBeNull();
    expect(fragmentFuer('anderes', manifest)).toBeNull();
  });
});
