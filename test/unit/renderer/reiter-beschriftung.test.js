// @vitest-environment jsdom
// 4T-001724 (Epic 3E-000304): Die eine Quelle der Reiter-Beschriftung,
// `tabDisplayName` in app-state.js. Aus ihr lesen Reiterleiste,
// Reiter-Gruppenmenue und Fenstertitel; geprueft wird deshalb die Quelle und
// nicht dreimal dasselbe an drei Anzeigen (die Gleichheit der Anzeigen belegt
// der E2E-Anteil in test/e2e/funktionen/reiter-beschriftung.spec.js).
//
// Gegenstand sind die Faelle, die eine Anzeige-Pruefung nicht oder nur schwer
// erreicht: jede Markdown-Endung samt Schreibweise (AK4), die fremde Endung
// (AK5), der Rueckfall bei einem Namen aus reiner Endung (AK6) und der Reiter
// ohne Pfad. Die Nachbar-Module sind nicht gemockt, weil app-state.js mit dem
// api-Stub und dem DOM-Geruest der Nachbar-Pruefdateien vollstaendig laedt.
import { describe, it, expect } from 'vitest';
import './api-stub.js';

const { tabDisplayName } = await import('../../../src/renderer/modules/app/app-state.js');

// Ein Reiter mit Pfad; der api-Stub bildet `basename` ueber den Pfad-Trenner.
const reiter = (pfad) => ({ path: pfad });

describe('Reiter-Beschriftung: Markdown-Endung (4T-001724)', () => {
  it('AK1/AK4: jede Markdown-Endung faellt, unabhaengig von der Schreibweise', () => {
    expect(tabDisplayName(reiter('C:/notizen/Konzept.md'))).toBe('Konzept');
    expect(tabDisplayName(reiter('C:/notizen/Konzept.MD'))).toBe('Konzept');
    expect(tabDisplayName(reiter('C:/notizen/Konzept.Md'))).toBe('Konzept');
    expect(tabDisplayName(reiter('C:/notizen/Konzept.markdown'))).toBe('Konzept');
    expect(tabDisplayName(reiter('C:/notizen/Konzept.mdown'))).toBe('Konzept');
    expect(tabDisplayName(reiter('C:/notizen/Konzept.mkd'))).toBe('Konzept');
  });

  it('AK5: eine fremde Endung bleibt stehen', () => {
    expect(tabDisplayName(reiter('C:/notizen/Liste.txt'))).toBe('Liste.txt');
    expect(tabDisplayName(reiter('C:/notizen/Notiz.mdx'))).toBe('Notiz.mdx');
    // Nur die echte Endung faellt, kein gleichlautender Namensteil.
    expect(tabDisplayName(reiter('C:/notizen/archiv.md.bak'))).toBe('archiv.md.bak');
    expect(tabDisplayName(reiter('C:/notizen/Projekt 2.1 Plan.md'))).toBe('Projekt 2.1 Plan');
  });

  it('AK6: ein Name aus reiner Endung faellt auf den vollen Basisnamen zurueck', () => {
    // Ohne den Rueckfall stuende ein Reiter ganz ohne Beschriftung da.
    expect(tabDisplayName(reiter('C:/notizen/.md'))).toBe('.md');
    expect(tabDisplayName(reiter('C:/notizen/.markdown'))).toBe('.markdown');
  });

  it('das Unterseiten-Trennzeichen bleibt unberuehrt', () => {
    // Anders als die Titelzeile uebersetzt die Beschriftung es NICHT in die
    // Slash-Form; gekuerzt wird allein die Endung.
    expect(tabDisplayName(reiter('C:/notizen/Prozess∕Entwurf.md'))).toBe('Prozess∕Entwurf');
  });

  it('ein Reiter ohne Pfad bleibt beim Unbenannt-Stamm samt Index', () => {
    // Ohne geladenes Woerterbuch liefert t() den Schluessel zurueck; gemessen
    // wird hier die unveraenderte Form und nicht die Uebersetzung.
    expect(tabDisplayName({ untitledIndex: 2 })).toBe('save.untitled 2');
    expect(tabDisplayName({})).toBe('save.untitled');
    expect(tabDisplayName(null)).toBe('');
  });
});
