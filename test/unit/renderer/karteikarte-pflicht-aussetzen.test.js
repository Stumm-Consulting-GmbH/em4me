// @vitest-environment jsdom
// 4T-002545 (Epic 3E-000368, Nachzug aus der Gegenlese-Runde): «Neue
// Karteikarte» legt ein leeres Feld-Gerüst an und fordert deshalb die Ausnahme
// von der Pflicht-Prüfung ausdrücklich an (`pflichtAussetzen: true`); «Als
// Karteikarte aufnehmen» fordert sie nicht an. Ohne die Angabe wiese die
// Schreib-Schnittstelle «Neue Karteikarte» bei jeder Tabelle mit Pflicht-Feld ab.
//
// Gemessen an der gesendeten Anweisung: Der Kanal `databaseAuftrag` schreibt
// mit. Ersetzt sind der Namens-Dialog (er wartete sonst auf eine Eingabe), die
// Statuszeile, der Datenbank-Überblick und das Tor der Erweiterung; Muster der
// Attrappen nach `umbenennen-pfad-weg.test.js`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

vi.mock('../../../src/renderer/modules/dialogs/dialogs.js', () => ({
  showNameInputDialog: vi.fn(async () => 'Solaris'),
}));
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: vi.fn(),
}));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));
vi.mock('../../../src/renderer/modules/database/datenbank-bereich.js', () => ({
  datenbankAuskunft: async () => ({ tabellen: [] }),
  verwirfDatenbankAuskunft: () => {},
}));

const { neueKarteikarte, nimmAlsKarteikarteAuf } =
  await import('../../../src/renderer/modules/database/karteikarte-anlegen.js');

const TABELLE = 'C:/Bereich/Bücher/Bücher.md';
const auftraege = [];

beforeEach(() => {
  auftraege.length = 0;
  window.api.databaseAuftrag = async ({ auftrag }) => {
    auftraege.push(auftrag);
    return { ok: true };
  };
});

describe('Ausnahme von der Pflicht-Prüfung beim Anlegen einer Karteikarte (4T-002545)', () => {
  it('«Neue Karteikarte» fordert die Ausnahme ausdrücklich an', async () => {
    expect(await neueKarteikarte(TABELLE)).toBe(true);
    expect(auftraege).toHaveLength(1);
    expect(auftraege[0].anweisungen).toEqual([
      { tabelle: TABELLE, art: 'create', karteikarte: { name: 'Solaris' }, pflichtAussetzen: true },
    ]);
  });

  it('«Als Karteikarte aufnehmen» fordert sie nicht an', async () => {
    const dokument = 'C:/Bereich/Bücher/Solaris.md';
    expect(await nimmAlsKarteikarteAuf(TABELLE, dokument)).toBe(true);
    expect(auftraege).toHaveLength(1);
    const [anweisung] = auftraege[0].anweisungen;
    expect(anweisung).toEqual({
      tabelle: TABELLE,
      art: 'create',
      karteikarte: { aufnehmen: dokument },
    });
    expect('pflichtAussetzen' in anweisung).toBe(false);
  });
});
