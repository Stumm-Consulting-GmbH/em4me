// 4T-001335 (Epic 3E-000237): Wächter der zweiten Ausprägung.
//
// Die zweite Ausprägung entsteht ausschließlich aus Bau-Zeit-Überschreibungen;
// es gibt keinen zweiten Konfigurations-Satz, den man lesen könnte. Ihre
// Identität lebt damit in einer Argument-Liste, und ohne Wächter wandert sie
// unbemerkt: Ein geänderter `extraMetadata.name` verlegt das
// Nutzerdaten-Verzeichnis und hebt damit die Trennung auf, die der ganze
// Vorgang herstellt — sichtbar erst daran, dass die zweite Ausprägung die
// produktive Sitzung überschreibt.
//
// Der bestehende Identitäts-Wächter (installer-identitaet.test.js) bleibt
// bewusst unangetastet: Er hält die PRODUKTIVE Identität fest, dieser hier die
// zusätzliche. Beide zusammen sichern die Zusicherung des Epics, dass die
// zweite Ausprägung die produktive nicht anfasst.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const wurzel = path.resolve(__dirname, '..', '..');
const pkg = require('../../package.json');
const { auspraegungsArgumente, AUSPRAEGUNG_PRUEFSTAND } = require('../../scripts/build-app.js');
const { auspraegungsKennzeichnung } = require('../../src/shared/build-version.js');
const { PRODUKTIV_PROFIL } = require('../../src/main/app/user-data-migration.js');

describe('Identität der zweiten Ausprägung (4T-001335)', () => {
  it('setzt genau die fünf erwarteten Überschreibungen', () => {
    expect(auspraegungsArgumente()).toEqual([
      '-c.extraMetadata.name=em4me-pruefstand',
      '-c.extraMetadata.auspraegung=Pruefstand',
      '-c.appId=net.stumm.em4me.pruefstand',
      '-c.productName=EM4me-Pruefstand',
      '-c.win.icon=src/assets/icon-pruefstand.ico',
    ]);
  });

  it('trägt einen anderen Namen als die produktive Ausprägung', () => {
    // Der Name bestimmt den userData-Pfad und damit den Einzel-Instanz-Lock.
    // Wären beide gleich, wäre der ganze Vorgang wirkungslos.
    expect(AUSPRAEGUNG_PRUEFSTAND.name).not.toBe(pkg.name);
    expect(AUSPRAEGUNG_PRUEFSTAND.appId).not.toBe(pkg.build.appId);
    expect(AUSPRAEGUNG_PRUEFSTAND.produktName).not.toBe(pkg.build.productName);
  });

  it('lässt die produktive Identität unangetastet', () => {
    // Keine Überschreibung darf einen der eingefrorenen Werte SETZEN. Geprüft
    // wird der Wert, nicht die Zeichenkette: 'net.stumm.em4me.pruefstand' enthält
    // die produktive appId als Präfix, ohne sie zu setzen.
    const werte = auspraegungsArgumente().map((a) => a.slice(a.indexOf('=') + 1));
    expect(werte).not.toContain(pkg.build.appId);
    expect(werte).not.toContain(pkg.build.productName);
    expect(werte).not.toContain(pkg.name);
  });

  it('nennt ein Symbol, das es auch gibt', () => {
    expect(existsSync(path.join(wurzel, AUSPRAEGUNG_PRUEFSTAND.icon))).toBe(true);
  });

  it('ist über einen eigenen Bau-Aufruf erreichbar, und nur als Portable', () => {
    const skript = pkg.scripts['build:pruefstand'];
    expect(skript).toContain('--pruefstand');
    expect(skript).toContain('portable');
    // Kein nsis-Ziel: Ein zweiter Eintrag in der Programmliste und ein zweiter
    // Satz Datei-Verknüpfungen sind ausdrücklich unerwünscht (Entscheidung des
    // Product Owners vom 2026-09-06).
    expect(skript).not.toContain('nsis');
  });

  it('wandert nicht ins Versions-Archiv', () => {
    // Die zweite Ausprägung ist kein Release-Artefakt. Ein postbuild-Haken
    // würde sie über archive-build.js nach releases/ legen — und von dort wird
    // nie etwas entfernt (PO-Festlegung vom 2026-07-22).
    expect(pkg.scripts['postbuild:pruefstand']).toBeUndefined();
  });

  it('hält ihr Symbol aus dem ausgelieferten Paket heraus', () => {
    expect(pkg.build.files).toContain(`!${AUSPRAEGUNG_PRUEFSTAND.icon}`);
  });

  // 4T-001336: Die Übernahme in die zweite Ausprägung liest aus dem produktiven
  // Profil, dessen Ordnername aus `name` entsteht. Wandert der Name, ohne dass
  // die Konstante folgt, sucht die Übernahme an einem Ort, den es nicht gibt —
  // und die zweite Ausprägung startet stillschweigend leer. Der Fall steht hier
  // und nicht beim Modul-Test der Übernahme, weil er `package.json` liest und
  // damit eine Eingabe der Klasse Ä5 hat.
  it('kennt das produktive Profil unter demselben Namen wie die package.json', () => {
    expect(PRODUKTIV_PROFIL).toBe(pkg.name);
  });
});

describe('Kennzeichnung aus der Bau-Angabe (4T-001335)', () => {
  it('liefert die Kennzeichnung der zweiten Ausprägung', () => {
    expect(auspraegungsKennzeichnung({ auspraegung: 'Pruefstand' })).toBe('Pruefstand');
  });

  it('liefert null, wo das Feld fehlt — der produktive Fall', () => {
    expect(auspraegungsKennzeichnung(pkg)).toBeNull();
    expect(auspraegungsKennzeichnung({})).toBeNull();
    expect(auspraegungsKennzeichnung(null)).toBeNull();
  });

  it('behandelt Leerraum und fremde Typen wie ein fehlendes Feld', () => {
    expect(auspraegungsKennzeichnung({ auspraegung: '   ' })).toBeNull();
    expect(auspraegungsKennzeichnung({ auspraegung: 42 })).toBeNull();
  });

  it('stimmt mit der Angabe des Bau-Wrappers überein', () => {
    // Zwei Stellen, eine Wahrheit: Was der Bau setzt, muss die Anzeige lesen.
    const gesetzt = auspraegungsArgumente()
      .find((a) => a.startsWith('-c.extraMetadata.auspraegung='))
      .split('=')[1];
    expect(auspraegungsKennzeichnung({ auspraegung: gesetzt })).toBe(
      AUSPRAEGUNG_PRUEFSTAND.kennzeichnung,
    );
  });
});
