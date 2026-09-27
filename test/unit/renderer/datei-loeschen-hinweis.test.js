// 4T-001800 (Epic 3E-000255): Was die Oberfläche aus dem Ergebnis des
// Lösch-Kanals macht.
//
// Der Fall, auf den es ankommt, ist der halbe Erfolg: Die Tabellen-Datei liegt
// im Papierkorb, ihre Änderungsbelege nicht. Der Kanal meldet das als
// `ok: true` mit `companionLeft` — und genau deshalb fiele es ohne Prüfung
// niemandem auf: Ein Weg, der nur `ok` liest, zeigte die Erfolgs-Meldung und
// verschwiege den Rest. Gemessen wird also, dass die Oberfläche STATT der
// Erfolgs-Meldung den eigenen Hinweis zeigt, und dass er den Dateinamen ohne
// seinen Ordner nennt.
//
// Die vier Nachbar-Module sind ersetzt: Reiter-Schließen, Rückfrage und
// Statusleiste haben eigene Prüfungen, und der Gegenstand hier ist allein die
// Auswertung der Antwort.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let bestaetigt;
let ergebnis;
const hinweise = [];
const rueckfragen = [];
const geloescht = [];

vi.mock('../../../src/renderer/i18n.js', () => ({
  // Der Platzhalter bleibt sichtbar, damit der eingesetzte Name messbar ist.
  t: (key) => (key === 'areaPanel.deleteCompanionLeft' ? 'Belege liegen als {name}' : key),
}));

vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (key, opts = {}) =>
    hinweise.push({
      key,
      text: opts.text,
      error: !!opts.error,
      duration: opts.duration,
    }),
}));

vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    areaConfirmTrashFile: async (name, pfad) => {
      rueckfragen.push({ name, pfad });
      return bestaetigt;
    },
    areaTrashFile: async (pfad) => {
      geloescht.push(pfad);
      return ergebnis;
    },
  },
}));

vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  // Keine offenen Reiter: Das Schließen ist nicht der Gegenstand dieser Datei.
  state: { panes: [{ tabs: [] }] },
  withDialog: (fn) => fn(),
}));

vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  closeTab: async () => true,
}));

const { trashFileAtPath } = await import('../../../src/renderer/modules/views/file-trash.js');

const ZIEL = 'C:\\Bereich\\Tabellen\\Kunden.md';

beforeEach(() => {
  hinweise.length = 0;
  rueckfragen.length = 0;
  geloescht.length = 0;
  bestaetigt = true;
  ergebnis = { ok: true, path: ZIEL };
});

describe('trashFileAtPath — Auswertung der Antwort (4T-001800)', () => {
  it('meldet die liegen gebliebenen Änderungsbelege STATT des Erfolgs (AK4)', async () => {
    ergebnis = { ok: true, path: ZIEL, companionLeft: ['C:\\Bereich\\Tabellen\\Kunden.mddl'] };

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise).toHaveLength(1);
    const hinweis = hinweise[0];
    expect(hinweis.key).toBe('areaPanel.deleteCompanionLeft');
    // Der Name ohne Ordner, und der Ordner ausdrücklich nicht dabei.
    expect(hinweis.text).toBe('Belege liegen als Kunden.mddl');
    expect(hinweis.text).not.toContain('Bereich');
    // Fehler-Stil und länger sichtbar als die Erfolgs-Meldung (3000 ms).
    expect(hinweis.error).toBe(true);
    expect(hinweis.duration).toBeGreaterThan(3000);
  });

  it('nennt auch bei einem Pfad mit Schrägstrichen nur den Dateinamen', async () => {
    ergebnis = { ok: true, path: ZIEL, companionLeft: ['/home/a/Bereich/Kunden.mddl'] };

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise[0].text).toBe('Belege liegen als Kunden.mddl');
  });

  it('nennt mehrere liegen gebliebene Dateien alle', async () => {
    // Heute gibt es genau eine Pflicht-Art. Der Fall hält fest, dass eine
    // zweite nicht stillschweigend aus der Meldung fällt.
    ergebnis = {
      ok: true,
      path: ZIEL,
      companionLeft: ['C:\\Bereich\\Kunden.mddl', 'C:\\Bereich\\Kunden.mddx'],
    };

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise[0].text).toBe('Belege liegen als Kunden.mddl, Kunden.mddx');
  });

  it('meldet den Erfolg unverändert, wenn nichts liegen geblieben ist', async () => {
    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise).toEqual([
      { key: 'areaPanel.deleteDone', text: undefined, error: false, duration: 3000 },
    ]);
  });

  it('behandelt ein leeres companionLeft wie den reinen Erfolg', async () => {
    // Gegenprobe gegen eine Prüfung auf das Vorhandensein des Feldes statt auf
    // seinen Inhalt: Eine leere Liste ist kein Befund.
    ergebnis = { ok: true, path: ZIEL, companionLeft: [] };

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise.map((h) => h.key)).toEqual(['areaPanel.deleteDone']);
  });

  it('meldet den Fehlschlag des Löschens unverändert als Fehler', async () => {
    ergebnis = { ok: false, error: 'kein Papierkorb auf diesem Laufwerk' };

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(hinweise.map((h) => h.key)).toEqual(['areaPanel.deleteFailed']);
    expect(hinweise[0].error).toBe(true);
  });

  it('gibt den Pfad mit in die Rückfrage und löscht erst nach der Zustimmung', async () => {
    await trashFileAtPath(ZIEL, 'Kunden.md');
    expect(rueckfragen).toEqual([{ name: 'Kunden.md', pfad: ZIEL }]);
    expect(geloescht).toEqual([ZIEL]);

    bestaetigt = false;
    hinweise.length = 0;
    geloescht.length = 0;
    await trashFileAtPath(ZIEL, 'Kunden.md');
    expect(geloescht).toEqual([]);
    expect(hinweise).toEqual([]);
  });
});
