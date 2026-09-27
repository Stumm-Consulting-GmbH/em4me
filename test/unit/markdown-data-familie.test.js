// 4T-001789 (Epic 3E-000255): Die Endungen der Markdown-Data-Familie an einer
// Stelle (AK1 und AK12).
//
// Zwei Gegenstände, die zusammengehören. Der erste ist das gemeinsame Modul
// selbst: Erkennt es die Beleg-Endung, und bildet es den Pfad einer
// Begleit-Datei richtig? Der zweite ist die Frage, ob das Modul auch die eine
// Quelle GEBLIEBEN ist — ein Modul, neben dem drei alte Kopien weiterleben,
// hat nichts gewonnen. Der Wächter unten liest deshalb den Quelltext der drei
// Stellen, die bis zu diesem Vorgang je eine eigene Liste führten.
//
// Diese Prüfgruppe liest ausschließlich Quelltext und Modul-Code; sie sieht
// kein Bedienelement. Die Wirkung der Abweisung beim Öffnen einer Datei der
// Familie prüft die Anwendung im Betrieb, hier geht es allein um die Frage,
// wo die Endungs-Liste steht.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MDD_EXT,
  MDDA_EXT,
  MDDB_EXT,
  MDDL_EXT,
  MARKDOWN_DATA_EXTS,
  extensionOf,
  isMarkdownDataPath,
  companionPathFor,
} from '../../src/shared/markdown-data-family.js';
import { createMddHistory } from '../../src/main/documents/mdd-history.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Die drei Stellen, die vor diesem Vorgang je eine eigene Endungs-Liste
// führten: die Erkennung des Hauptprozesses, die Bereichs-Statistik und die
// Öffnen-Abweisung der Oberfläche.
const FRUEHERE_KOPIEN = [
  'src/main/documents/mdd-history.js',
  'src/main/area/area-stats.js',
  'src/renderer/modules/tabs/tabs.js',
];

function quelltext(relativ) {
  return fs.readFileSync(path.join(WURZEL, relativ.split('/').join(path.sep)), 'utf8');
}

describe('markdown-data-family: die Endungen der Familie (AK1)', () => {
  it('führt genau die vier Endungen der Familie', () => {
    expect(MARKDOWN_DATA_EXTS).toEqual(['.mdd', '.mdda', '.mddb', '.mddl']);
    expect([MDD_EXT, MDDA_EXT, MDDB_EXT, MDDL_EXT]).toEqual(MARKDOWN_DATA_EXTS);
  });

  it('erkennt die Beleg-Datei und die drei älteren Endungen', () => {
    expect(isMarkdownDataPath('C:/Bereich/Tabelle.mddl')).toBe(true);
    expect(isMarkdownDataPath('/home/x/Tabelle.mdd')).toBe(true);
    expect(isMarkdownDataPath('/home/x/Area_Settings.mdda')).toBe(true);
    expect(isMarkdownDataPath('/home/x/Area_Settings.mddb')).toBe(true);
    // Gross-Klein-Schreibung der Endung ist unerheblich (wie path.extname
    // plus toLowerCase im abgelösten Bestand).
    expect(isMarkdownDataPath('/home/x/Tabelle.MDDL')).toBe(true);
  });

  it('erkennt ein Dokument NICHT als Datei der Familie', () => {
    expect(isMarkdownDataPath('/home/x/Notiz.md')).toBe(false);
    expect(isMarkdownDataPath('/home/x/Notiz.markdown')).toBe(false);
    expect(isMarkdownDataPath('/home/x/Bild.png')).toBe(false);
    expect(isMarkdownDataPath('/home/x/ohne-endung')).toBe(false);
    expect(isMarkdownDataPath('')).toBe(false);
    expect(isMarkdownDataPath(null)).toBe(false);
    // Eine versteckte Datei namens '.mddl' trägt keine Endung, sondern einen
    // Namen — dieselbe Sonderregel wie path.extname.
    expect(isMarkdownDataPath('/home/x/.mddl')).toBe(false);
  });

  it('liefert die Endung kleingeschrieben und mit Punkt', () => {
    expect(extensionOf('/home/x/Tabelle.MDDL')).toBe('.mddl');
    expect(extensionOf('C:\\Bereich\\Tabelle.mdd')).toBe('.mdd');
    expect(extensionOf('/home/x/kein.punkt.hier.md')).toBe('.md');
    expect(extensionOf('/home/x/ohne')).toBe('');
    expect(extensionOf('')).toBe('');
  });

  it('bildet den Pfad einer Begleit-Datei im selben Ordner', () => {
    expect(companionPathFor('/home/x/Tabelle.md', MDDL_EXT)).toBe('/home/x/Tabelle.mddl');
    expect(companionPathFor('C:\\Bereich\\Tabelle.md', MDD_EXT)).toBe('C:\\Bereich\\Tabelle.mdd');
    // Punkte im Namen gehören zum Basisnamen; nur die letzte Endung weicht.
    expect(companionPathFor('/home/x/Kunden.2026.md', MDDL_EXT)).toBe('/home/x/Kunden.2026.mddl');
    // Ohne Endung wird angehängt statt ersetzt.
    expect(companionPathFor('/home/x/Tabelle', MDDL_EXT)).toBe('/home/x/Tabelle.mddl');
  });
});

describe('isMddPath delegiert an das gemeinsame Modul (AK1)', () => {
  // Die Erkennung des Hauptprozesses ist der älteste Verbraucher; an ihr
  // hängen Bereichs-Beobachter und Direkt-Öffnen. Ihr Name und ihre Signatur
  // bleiben, damit die Verdrahtung unberührt bleibt.
  const { isMddPath } = createMddHistory({
    getStore: () => null,
    areaOfWindow: () => null,
    readAreaHistoryDefault: async () => undefined,
  });

  it('schließt eine Beleg-Datei ein', () => {
    expect(isMddPath('/home/x/Tabelle.mddl')).toBe(true);
  });

  it('erkennt die drei älteren Endungen unverändert', () => {
    expect(isMddPath('/home/x/Tabelle.mdd')).toBe(true);
    expect(isMddPath('/home/x/Area_Settings.mdda')).toBe(true);
    expect(isMddPath('/home/x/Area_Settings.mddb')).toBe(true);
  });

  it('lässt ein Dokument durch', () => {
    expect(isMddPath('/home/x/Notiz.md')).toBe(false);
    expect(isMddPath('')).toBe(false);
  });
});

describe('Wächter: keine zweite Endungs-Liste der Familie (AK12)', () => {
  // Beide Richtungen, wie es die Entwicklungsrichtlinien für ein Register mit
  // Spiegel-Ort verlangen: Jede der drei Stellen bezieht die Liste von der
  // Quelle (positiv), und keine führt noch eine eigene (negativ). Ohne die
  // negative Richtung bliebe eine vergessene Kopie unentdeckt — sie meldet
  // sich nicht, sie verhält sich nur anders.

  // Eine Endung als Zeichenketten-Literal, also eine eigene Liste im Code.
  // Ein Vorkommen in einem Kommentar trägt keine Anführungszeichen und ist
  // ausdrücklich erlaubt: Der Kommentar erklärt, der Code entscheidet.
  const LITERAL = /['"]\.mdd[a-z]?['"]/;
  // Die Alternativ-Form eines regulären Ausdrucks über die Familie.
  const ALTERNATIVE = '(mdd|';

  it.each(FRUEHERE_KOPIEN)('%s bezieht die Endungen aus dem gemeinsamen Modul', (relativ) => {
    expect(quelltext(relativ)).toContain('markdown-data-family');
  });

  it.each(FRUEHERE_KOPIEN)('%s führt keine eigene Endungs-Liste mehr', (relativ) => {
    const text = quelltext(relativ);
    expect(text).not.toMatch(LITERAL);
    expect(text).not.toContain(ALTERNATIVE);
  });

  it('prüft eine nicht leere Menge von Stellen', () => {
    // Untere Plausibilitäts-Schranke: Ein Wächter, dessen Menge leer läuft,
    // ist grün, ohne etwas geprüft zu haben.
    expect(FRUEHERE_KOPIEN.length).toBe(3);
    for (const relativ of FRUEHERE_KOPIEN) {
      expect(fs.existsSync(path.join(WURZEL, relativ.split('/').join(path.sep)))).toBe(true);
    }
  });
});
