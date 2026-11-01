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
// 4T-002405: Abfolge von Sichern, Löschen und Schließen samt offenen Reitern;
// `karteikarte` ist die Antwort des Haupt-Prozesses auf die Frage nach der Art.
const ablauf = [];
const zustand = { panes: [{ tabs: [] }] };
let karteikarte = false;

// 4T-002405: Texte mit Platzhaltern, damit Name und Grund messbar sind; der Satz
// der Datenbank kommt über das Wörterbuch wie im Betrieb.
const TEXTE = {
  'areaPanel.deleteCompanionLeft': 'Belege liegen als {name}',
  'areaPanel.deleteRefused': '{name} nicht gelöscht: {grund}',
  'areaPanel.copyRefused': 'Keine Kopie: {grund}',
  'database.auftrag.regelLoeschenAbhaengige': 'Ein Buch verweist darauf.',
  'database.auftrag.regelNichtErlaubt': 'Anlegen ist nicht erlaubt.',
};

vi.mock('../../../src/renderer/i18n.js', () => ({
  // Der Platzhalter bleibt sichtbar, damit der eingesetzte Name messbar ist.
  t: (key) => TEXTE[key] ?? key,
  currentDictionary: () => TEXTE,
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
      ablauf.push('loeschen');
      return ergebnis;
    },
    areaIstKarteikarte: async () => karteikarte,
    areaCopyFile: async () => ergebnis,
  },
}));

// 4T-002405: Das Sichern offener Reiter vor dem Kopieren ist nicht Gegenstand.
vi.mock('../../../src/renderer/modules/views/file-actions.js', () => ({
  sichereOffeneReiter: async () => {
    ablauf.push('sichern');
    return true;
  },
}));

vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  // Ohne offene Reiter, außer ein Fall legt einen an (4T-002405).
  get state() {
    return zustand;
  },
  withDialog: (fn) => fn(),
}));

vi.mock('../../../src/renderer/modules/tabs/tabs.js', () => ({
  closeTab: async (p, i, optionen = {}) => {
    ablauf.push(optionen.skipDirtyCheck ? 'schliessen-ohne-abfrage' : 'schliessen');
    zustand.panes[p].tabs.splice(i, 1);
    return true;
  },
}));

const { trashFileAtPath } = await import('../../../src/renderer/modules/views/file-trash.js');
const { copyFileAtPath } = await import('../../../src/renderer/modules/views/file-copy.js');

const ZIEL = 'C:\\Bereich\\Tabellen\\Kunden.md';

beforeEach(() => {
  ablauf.length = 0;
  zustand.panes = [{ tabs: [] }];
  karteikarte = false;
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

// 4T-002405 (Epic 3E-000266, F4 A, F5 A): Eine Karteikarte, die die Datenbank
// nicht löschen oder kopieren lässt. Die Kanäle melden das als
// `error: 'database'` mit dem Ergebnis der Schnittstelle in `datenbank`; die
// Oberfläche nennt statt des allgemeinen Fehlschlags den Grund.
const ABGEWIESEN = (naht) => ({
  ok: false,
  error: 'database',
  datenbank: {
    ok: false,
    code: 'auftragPruefBefund',
    lagen: [{ code: 'auftragPruefBefund', naht: { code: naht, tabelle: 'Autoren' } }],
  },
});

describe('Abweisung durch die Datenbank (4T-002405)', () => {
  it('nennt beim Löschen einer verwiesenen Karteikarte Namen und Grund', async () => {
    ergebnis = ABGEWIESEN('regelLoeschenAbhaengige');

    await trashFileAtPath(ZIEL, 'Umberto Eco.md');

    expect(hinweise).toHaveLength(1);
    expect(hinweise[0].key).toBe('areaPanel.deleteRefused');
    expect(hinweise[0].text).toBe('Umberto Eco.md nicht gelöscht: Ein Buch verweist darauf.');
    expect(hinweise[0].error).toBe(true);
    expect(hinweise[0].duration).toBeGreaterThan(5000);
  });

  it('nennt beim Kopieren den Grund der Abweisung', async () => {
    ergebnis = ABGEWIESEN('regelNichtErlaubt');

    await copyFileAtPath(ZIEL, () => {});

    expect(hinweise).toHaveLength(1);
    expect(hinweise[0].key).toBe('areaPanel.copyRefused');
    expect(hinweise[0].text).toBe('Keine Kopie: Anlegen ist nicht erlaubt.');
    expect(hinweise[0].error).toBe(true);
  });

  it('bleibt bei einem Fehlschlag ohne Datenbank beim allgemeinen Hinweis', async () => {
    ergebnis = { ok: false, error: 'EBUSY' };

    await copyFileAtPath(ZIEL, () => {});

    expect(hinweise.map((h) => h.key)).toEqual(['areaPanel.copyFailed']);
  });
});

// 4T-002405 (F4 A, Nacharbeit): Eine Karteikarte wird erst geschlossen, wenn die
// Datenbank das Löschen angenommen hat. Gemessen wird die Abfolge samt Reiter.
describe('Reihenfolge beim Löschen einer Karteikarte (4T-002405)', () => {
  const KARTE = 'C:\\Bereich\\Authors\\Umberto Eco.md';

  beforeEach(() => {
    karteikarte = true;
    zustand.panes = [{ tabs: [{ path: KARTE }] }];
  });

  it('lässt den Reiter bei einer Abweisung offen und nennt den Grund', async () => {
    ergebnis = ABGEWIESEN('regelLoeschenAbhaengige');

    await trashFileAtPath(KARTE, 'Umberto Eco.md');

    expect(ablauf).toEqual(['sichern', 'loeschen']);
    expect(zustand.panes[0].tabs).toEqual([{ path: KARTE }]);
    expect(hinweise.map((h) => h.key)).toEqual(['areaPanel.deleteRefused']);
  });

  it('schließt den Reiter erst nach dem angenommenen Lösch-Auftrag, ohne Abfrage', async () => {
    ergebnis = { ok: true, path: KARTE, datenbank: true };

    await trashFileAtPath(KARTE, 'Umberto Eco.md');

    expect(ablauf).toEqual(['sichern', 'loeschen', 'schliessen-ohne-abfrage']);
    expect(zustand.panes[0].tabs).toEqual([]);
    expect(hinweise.map((h) => h.key)).toEqual(['areaPanel.deleteDone']);
  });

  it('schließt bei einer gewöhnlichen Datei wie bisher zuerst, mit Abfrage', async () => {
    karteikarte = false;
    zustand.panes = [{ tabs: [{ path: ZIEL }] }];

    await trashFileAtPath(ZIEL, 'Kunden.md');

    expect(ablauf).toEqual(['schliessen', 'loeschen']);
  });
});
