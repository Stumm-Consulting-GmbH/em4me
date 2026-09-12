// 4T-000391 (Epic 3E-000129): Wächter über die zentrale Sprachliste
// (src/shared/locales.js). Er misst zweierlei: die Struktur der Liste selbst
// und ihre Deckungsgleichheit mit dem, was tatsächlich ausgeliefert wird —
// Sprachdatei und Handbuch-Fassungen je Code. Der zweite Teil trägt die
// eigentliche Zusage: Vor diesem Modul stand die Fünfer-Liste vierfach im
// Code, und eine vergessene Kopie fiel erst zur Laufzeit auf.
//
// Die Kopplung an die Sprachen der Produkt-Webseite misst
// test/unit/webseiten-sprachen.test.js. Sie steht dort und nicht hier, weil
// sie ein internes Bau-Skript liest und damit nicht in den öffentlichen
// Quellcode-Export gehört (Wächter test/unit/quellcode-export-listen.js).
//
// Bewusst NICHT geprüft wird, dass die Liste genau fünf Einträge hat. Eine
// solche Zahl müsste bei jeder neuen Sprache mitgezogen werden und wäre damit
// die sechste Kopie in Prüfform (Muster der zählungs-freien Wächter).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCALES,
  LOCALE_CODES,
  FALLBACK_LOCALE,
  CUSTOM_PREFIX,
  isLocale,
  normalizeLocale,
  localeLabel,
  isCustomLocale,
  customLocaleCode,
  customLocaleId,
} from '../../src/shared/locales.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HERE, '..', '..');
const I18N_DIR = path.join(WURZEL, 'src', 'i18n');
// 4T-001607 (Epic 3E-000278): die versionierte Quelle der Sprachfassungen.
const FRAGMENTE_DIR = path.join(I18N_DIR, 'fragments');

describe('Zentrale Sprachliste (4T-000391)', () => {
  it('führt je Eintrag einen Code und ein Endonym, ohne Dublette', () => {
    expect(LOCALES.length).toBeGreaterThan(0);
    for (const eintrag of LOCALES) {
      expect(eintrag.code).toMatch(/^[a-z]{2}$/);
      expect(typeof eintrag.label).toBe('string');
      expect(eintrag.label.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(LOCALE_CODES).size).toBe(LOCALE_CODES.length);
    expect(LOCALE_CODES).toEqual(LOCALES.map((l) => l.code));
  });

  it('die Rückfall-Sprache steht selbst in der Liste', () => {
    expect(isLocale(FALLBACK_LOCALE)).toBe(true);
  });

  it('normalizeLocale schneidet Gebiets-Zusatz ab und fällt sonst zurück', () => {
    expect(normalizeLocale('de')).toBe('de');
    expect(normalizeLocale('DE')).toBe('de');
    expect(normalizeLocale('de-DE')).toBe('de');
    expect(normalizeLocale('de_DE')).toBe('de');
    // Gegenprobe: was nicht in der Liste steht, fällt zurück — auch das,
    // was wie ein gültiger Code aussieht.
    expect(normalizeLocale('zh')).toBe(FALLBACK_LOCALE);
    expect(normalizeLocale('')).toBe(FALLBACK_LOCALE);
    expect(normalizeLocale(null)).toBe(FALLBACK_LOCALE);
    expect(normalizeLocale(undefined)).toBe(FALLBACK_LOCALE);
  });

  it('localeLabel liefert das Endonym, bei Unbekanntem den Code selbst', () => {
    expect(localeLabel(FALLBACK_LOCALE)).toBe(
      LOCALES.find((l) => l.code === FALLBACK_LOCALE).label,
    );
    expect(localeLabel('zh')).toBe('zh');
  });

  // Aktivierungs-Regel des Moduls, gegenständlich gemessen: Ein Code steht
  // erst in der Liste, wenn seine Sprachdatei vorliegt.
  //
  // 4T-001607 (Epic 3E-000278): Gemessen werden die Fragment-Ordner
  // src/i18n/fragments/<code>/ statt der Dateien src/i18n/<code>.json. Jene
  // sind seit 4T-001606 ein unversioniertes Erzeugnis des Baus; an ihnen
  // gemessen sagte dieser Fall nichts über den Bestand aus, sondern nur, ob
  // zuvor jemand gebaut hat — und im frisch geklonten Baum schlüge er fehl,
  // ohne dass etwas fehlte.
  it('zu jedem Code liegt ein brauchbarer Fragment-Ordner in src/i18n/fragments', () => {
    for (const code of LOCALE_CODES) {
      const ordner = path.join(FRAGMENTE_DIR, code);
      expect(fs.existsSync(ordner), `fragments/${code}/ fehlt`).toBe(true);
      const fragmente = fs.readdirSync(ordner).filter((n) => n.endsWith('.json'));
      // Ein leerer Ordner wäre kein Bestand; mindestens ein Fragment steht drin.
      expect(fragmente.length, `fragments/${code}/ ist leer`).toBeGreaterThan(0);
      // Und der Ordner trägt einen brauchbaren Katalog, nicht nur Datei-Namen:
      // ein flaches Objekt mit mindestens einem Schlüssel. Ob die Fragmente
      // zueinander passen, misst der Wächter check-i18n; hier geht es allein um
      // die Aktivierungs-Regel «der Code steht in der Liste, weil es die
      // Sprachfassung gibt».
      const erstes = JSON.parse(fs.readFileSync(path.join(ordner, fragmente[0]), 'utf8'));
      expect(typeof erstes, `fragments/${code}/${fragmente[0]} ist kein Objekt`).toBe('object');
      expect(
        Object.keys(erstes).length,
        `fragments/${code}/${fragmente[0]} ist leer`,
      ).toBeGreaterThan(0);
    }
  });

  it('src/i18n/fragments führt keinen Sprach-Ordner, den die Liste nicht kennt', () => {
    const ordner = fs
      .readdirSync(FRAGMENTE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect([...ordner].sort()).toEqual([...LOCALE_CODES].sort());
  });

  // Der zweite Teil der Aktivierungs-Regel: alle Handbuch-Fassungen. Die
  // Handbuch-Seiten liegen als <seite>.<code>.md in src/i18n/help; geprueft
  // wird, dass jede vorhandene Seite jeden Code der Liste fuehrt.
  it('jede Handbuch-Seite liegt in allen Sprachen der Liste vor', () => {
    const dateien = fs.readdirSync(path.join(I18N_DIR, 'help')).filter((n) => n.endsWith('.md'));
    const seiten = new Set(dateien.map((n) => n.replace(/\.[a-z]{2}\.md$/, '')));
    const fehlend = [];
    for (const seite of seiten) {
      for (const code of LOCALE_CODES) {
        if (!dateien.includes(`${seite}.${code}.md`)) fehlend.push(`${seite}.${code}.md`);
      }
    }
    expect(fehlend).toEqual([]);
  });

  // Der Wächter über die Sprachdateien liest seine Liste aus derselben Quelle;
  // wäre dort eine zweite Kopie, meldete er eine fehlende Datei nicht.
  it('der i18n-Wächter liest dieselbe Liste', async () => {
    const { LANGS } = await import('../../scripts/check-i18n.js');
    expect(LANGS).toEqual(LOCALE_CODES);
  });
});

// 4T-001594 (Epic 3E-000129): Die Kennung einer eingespielten eigenen Sprache.
//
// Das Modul kennt die FORM dieser Kennungen, nicht ihre Liste — die eigenen
// Sprachen kommen zur Laufzeit aus dem Benutzerprofil. Geprüft wird deshalb
// genau die Form und die Trennschärfe gegenüber den mitgelieferten Codes: Eine
// Kennung, die als mitgelieferter Code durchginge, brächte den Rückfall-Weg
// zum Umbiegen auf Englisch, und genau das beseitigt dieser Task.
describe('Kennung einer eigenen Sprache (4T-001594)', () => {
  it('erkennt die Kennung an ihrem Präfix und trennt sie von den mitgelieferten', () => {
    expect(isCustomLocale('custom:nds')).toBe(true);
    expect(isCustomLocale(customLocaleId('nds'))).toBe(true);
    // Kein mitgelieferter Code ist eine eigene Kennung — und keiner enthält
    // den Doppelpunkt, an dem die Trennung hängt.
    for (const code of LOCALE_CODES) {
      expect(isCustomLocale(code), code).toBe(false);
      expect(code).not.toContain(':');
    }
  });

  it('weist alles zurück, was keine Kennung ist', () => {
    // Das nackte Präfix benennt keine Sprache: Der Rest darf nicht leer sein.
    expect(isCustomLocale(CUSTOM_PREFIX)).toBe(false);
    expect(isCustomLocale('')).toBe(false);
    expect(isCustomLocale('nds')).toBe(false);
    expect(isCustomLocale('Custom:nds')).toBe(false);
    expect(isCustomLocale(null)).toBe(false);
    expect(isCustomLocale(undefined)).toBe(false);
    expect(isCustomLocale(42)).toBe(false);
    expect(isCustomLocale({ id: 'custom:nds' })).toBe(false);
  });

  it('zerlegt die Kennung in ihren Code und setzt sie wieder zusammen', () => {
    expect(customLocaleCode('custom:nds')).toBe('nds');
    expect(customLocaleCode('custom:nds-DE')).toBe('nds-DE');
    expect(customLocaleId('nds')).toBe('custom:nds');
    expect(customLocaleCode(customLocaleId('nds-DE'))).toBe('nds-DE');
    // Wo keine Kennung steht, kommt kein Code heraus — und nicht etwa der
    // Eingabewert selbst, der als Datei-Name weiterlaufen könnte.
    expect(customLocaleCode('nds')).toBeNull();
    expect(customLocaleCode(CUSTOM_PREFIX)).toBeNull();
    expect(customLocaleCode(null)).toBeNull();
  });
});
