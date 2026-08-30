// 4T-1312 (Epic 3E-0235): Rechnung des hängenden Einzugs umgebrochener Zeilen.
//
// Die Rechnung liegt prozessneutral, damit sie ohne Editor prüfbar ist; die
// Darstellung im Editor prüft der E2E-Fall ZU-01.
import { describe, it, expect } from 'vitest';
import { EINZUG_HOECHSTENS, haengenderEinzug } from '../../src/shared/haengender-einzug.js';

describe('haengenderEinzug: Listen (4T-1312)', () => {
  it('Aufzählung: hinter der Marke', () => {
    // '- ' sind zwei Zeichen.
    expect(haengenderEinzug('- Text')).toBe(2);
    expect(haengenderEinzug('* Text')).toBe(2);
    expect(haengenderEinzug('+ Text')).toBe(2);
  });

  it('Aufzählung mit mehreren Leerzeichen hinter der Marke', () => {
    expect(haengenderEinzug('-   Text')).toBe(4);
  });

  it('nummerierte Liste: hinter Nummer und Trennzeichen', () => {
    expect(haengenderEinzug('1. Text')).toBe(3);
    expect(haengenderEinzug('1) Text')).toBe(3);
  });

  it('mehrstellige Nummern rücken weiter ein', () => {
    expect(haengenderEinzug('12. Text')).toBe(4);
    expect(haengenderEinzug('123. Text')).toBe(5);
  });

  it('Aufgaben-Zeile: hinter dem Kästchen, nicht hinter der Marke', () => {
    // '- [ ] ' sind sechs Zeichen; die Fortsetzung steht unter dem Text.
    expect(haengenderEinzug('- [ ] Text')).toBe(6);
    expect(haengenderEinzug('- [x] Text')).toBe(6);
    expect(haengenderEinzug('- [X] Text')).toBe(6);
  });

  it('verschachtelte Listen folgen ihrer Ebene', () => {
    expect(haengenderEinzug('  - Text')).toBe(4);
    expect(haengenderEinzug('    - Text')).toBe(6);
    expect(haengenderEinzug('  1. Text')).toBe(5);
  });

  it('Tabulatoren zählen mit ihrer vollen Breite', () => {
    expect(haengenderEinzug('\t- Text')).toBe(6);
    expect(haengenderEinzug('- \tText')).toBe(6);
    expect(haengenderEinzug('\t- Text', { tabBreite: 2 })).toBe(4);
  });
});

describe('haengenderEinzug: übrige Zeilen (4T-1312)', () => {
  it('eine Zeile ohne Einzug und ohne Marke bekommt keinen Einzug', () => {
    expect(haengenderEinzug('Ein gewöhnlicher Absatz.')).toBe(0);
    expect(haengenderEinzug('# Überschrift')).toBe(0);
    expect(haengenderEinzug('')).toBe(0);
  });

  it('eine eingerückte Fortsetzungs-Zeile behält ihren eigenen Einzug', () => {
    expect(haengenderEinzug('    Fortsetzung eines Eintrags')).toBe(4);
  });

  it('eine leere oder nur aus Leerraum bestehende Zeile bekommt keinen Einzug', () => {
    expect(haengenderEinzug('   ')).toBe(0);
    expect(haengenderEinzug('\t\t')).toBe(0);
  });

  it('ein Gedankenstrich ohne folgendes Leerzeichen ist keine Liste', () => {
    expect(haengenderEinzug('-Text')).toBe(0);
    expect(haengenderEinzug('1.Text')).toBe(0);
  });

  it('eine Trennlinie ist keine Liste', () => {
    expect(haengenderEinzug('---')).toBe(0);
  });

  it('verträgt fehlende Eingabe', () => {
    expect(haengenderEinzug(null)).toBe(0);
    expect(haengenderEinzug(undefined)).toBe(0);
  });
});

describe('haengenderEinzug: Obergrenze (4T-1312)', () => {
  it('wächst nicht über die Obergrenze hinaus', () => {
    const tief = ' '.repeat(100) + '- Text';
    expect(haengenderEinzug(tief)).toBe(EINZUG_HOECHSTENS);
  });

  it('die Obergrenze ist einstellbar', () => {
    expect(haengenderEinzug('        - Text', { hoechstens: 5 })).toBe(5);
  });
});
