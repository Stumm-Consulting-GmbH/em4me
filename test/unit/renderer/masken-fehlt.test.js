// @vitest-environment jsdom
// 4T-002333 (Epic 3E-000264, Entscheidung F2 Option A, T4): Der Handgriff «Im
// Tabellen-Dokument zeigen» der Einzel-Maske.
//
// Geprüft am Modul selbst mit hereingereichtem Reiter-Weg und Sprung, beide
// aufgefangen statt ausgeführt: wann der Knopf erscheint und was sein Klick
// anfordert. Dass die Maske ihn in ihrer Leiste zeigt und die Zeile danach im
// Blick steht, prüft der Ablauf-Fall DB-03 (`datenbank-tabelle.spec.js`).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = async () => ({ ok: true, json: async () => de });

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { erzeugeDokumentHandgriff, datensatzFehlt, maskenSitzung } =
  await import('../../../src/renderer/modules/database/masken-fehlt.js');
const { MODUS_BEARBEITEN, MODUS_LESEN } =
  await import('../../../src/renderer/modules/database/masken-felder.js');

const LIBRARY = '/raum/Library.md';

let geoeffnet;
let gesprungen;
let handgriff;
let fensterZustand;

beforeEach(() => {
  geoeffnet = [];
  gesprungen = [];
  fensterZustand = { activePaneIndex: 1 };
  handgriff = erzeugeDokumentHandgriff({
    openInPane: async (spalte, pfade) => {
      geoeffnet.push([spalte, pfade]);
      return 0;
    },
    scrollToAnchorAfterOpen: (spalte, anker) => gesprungen.push([spalte, anker]),
    state: fensterZustand,
  });
});

function seite(teil = {}) {
  return { tabellenPfad: LIBRARY, kennung: 'r-00003', neu: false, modus: MODUS_LESEN, ...teil };
}

function leiste(s) {
  const el = document.createElement('div');
  handgriff.zeichne(el, s);
  return el;
}

const knopf = (el) => el.querySelector('.db-form-show-in-document');

describe('Sichtbarkeit', () => {
  it('im Lesen eines Datensatzes mit Kennung und Tabelle', () => {
    const k = knopf(leiste(seite()));
    expect(k).not.toBe(null);
    expect(k.textContent).toBe('Im Tabellen-Dokument zeigen');
    expect(k.type).toBe('button');
    expect(k.classList.contains('db-form-btn')).toBe(true);
  });

  it('nicht ohne Kennung, nicht ohne Tabelle, nicht bei der Neuanlage', () => {
    expect(knopf(leiste(seite({ kennung: null })))).toBe(null);
    expect(knopf(leiste(seite({ kennung: '' })))).toBe(null);
    expect(knopf(leiste(seite({ tabellenPfad: null })))).toBe(null);
    expect(knopf(leiste(seite({ neu: true })))).toBe(null);
  });

  it('nicht im Bearbeiten', () => {
    expect(knopf(leiste(seite({ modus: MODUS_BEARBEITEN })))).toBe(null);
  });
});

describe('Klick', () => {
  it('öffnet die Kopf-Datei in der aktiven Spalte und springt mit der Kennung', async () => {
    knopf(leiste(seite())).click();
    await vi.waitFor(() => expect(gesprungen).toHaveLength(1));
    expect(geoeffnet).toEqual([[1, [LIBRARY]]]);
    // Gesprungen wird in der Spalte, in der die Datei tatsächlich offen ist.
    expect(gesprungen).toEqual([[0, 'r-00003']]);
  });

  it('der Klick nimmt den Gegenstand beim Zeichnen, nicht den späteren Zustand', async () => {
    const s = seite();
    const k = knopf(leiste(s));
    s.kennung = 'r-00099';
    k.click();
    await vi.waitFor(() => expect(gesprungen).toHaveLength(1));
    expect(gesprungen[0][1]).toBe('r-00003');
  });

  it('liefert der Reiter-Weg keine Spalte, gilt die aktive', async () => {
    const ohneSpalte = erzeugeDokumentHandgriff({
      openInPane: async () => undefined,
      scrollToAnchorAfterOpen: (spalte, anker) => gesprungen.push([spalte, anker]),
      state: fensterZustand,
    });
    await ohneSpalte.zeige(LIBRARY, 'r-00001');
    expect(gesprungen).toEqual([[1, 'r-00001']]);
  });
});

// 4T-002334 (Epic 3E-000264, T5): Der Zustand «Datensatz fehlt». Dass eine
// wiederhergestellte Maske ihn nach dem Löschen des Datensatzes zeigt, prüft der
// Ablauf-Fall DB-SIT-02 (`datenbank-sitzung.spec.js`).
describe('Zustand «Datensatz fehlt» (4T-002334)', () => {
  const fehlt = { status: 'error', code: 'auftragDatensatzUnbekannt' };
  const kopf = (daten, s = seite()) => {
    const el = document.createElement('div');
    handgriff.zeichneFehlt(el, daten, s);
    return el;
  };

  it('erkennt die beiden Codes und nichts sonst', () => {
    expect(datensatzFehlt(fehlt)).toBe(true);
    expect(datensatzFehlt({ status: 'error', code: 'auftragTabelleUnbekannt' })).toBe(true);
    expect(datensatzFehlt({ status: 'error', code: 'auftragDatensatzMehrdeutig' })).toBe(false);
    expect(datensatzFehlt({ status: 'error', code: null })).toBe(false);
    expect(datensatzFehlt({ status: 'unavailable', code: null })).toBe(false);
    expect(datensatzFehlt({ status: 'ready' })).toBe(false);
    expect(datensatzFehlt(null)).toBe(false);
  });

  it('nennt Kennung und Tabelle ohne Endung im Hinweis', () => {
    expect(handgriff.fehltText(fehlt, seite())).toBe(
      'Der Datensatz r-00003 ist in der Tabelle «Library» nicht mehr vorhanden. ' +
        'Die Maske bleibt geöffnet, bis Sie sie schließen.',
    );
    expect(handgriff.fehltText({ status: 'ready' }, seite())).toBe(null);
  });

  it('zeigt «Tabelle öffnen», der Klick öffnet die Kopf-Datei ohne Sprung', async () => {
    const el = kopf(fehlt);
    const k = el.querySelector('.db-form-actions .db-form-open-table');
    expect(k).not.toBe(null);
    expect(k.textContent).toBe('Tabelle öffnen');
    expect(k.type).toBe('button');
    k.click();
    await vi.waitFor(() => expect(geoeffnet).toHaveLength(1));
    expect(geoeffnet).toEqual([[1, [LIBRARY]]]);
    expect(gesprungen).toEqual([]);
  });

  it('bei jeder anderen Lage entsteht keine Leiste', () => {
    expect(kopf({ status: 'ready' }).children).toHaveLength(0);
    expect(kopf({ status: 'unavailable', code: null }).children).toHaveLength(0);
    expect(kopf(null).children).toHaveLength(0);
    expect(kopf(fehlt, seite({ tabellenPfad: null })).children).toHaveLength(0);
  });
});

// 4T-002334 (T1): Eintrag und Öffner der Masken-Seite für das Register der Sitzung.
describe('Sitzungs-Eintrag der Masken-Seite (4T-002334)', () => {
  it('liefert Tabelle, Kennung und Maske, bei der Neuanlage und ohne Kennung nichts', () => {
    const s = seite({ maske: 'Buch-Maske.md' });
    const sitzung = maskenSitzung(s, () => {});
    expect(sitzung.eintrag()).toEqual({
      tabelle: LIBRARY,
      kennung: 'r-00003',
      maske: 'Buch-Maske.md',
    });
    s.maske = null;
    expect(sitzung.eintrag().maske).toBe(null);
    s.neu = true;
    expect(sitzung.eintrag()).toBe(null);
    s.neu = false;
    s.kennung = null;
    expect(sitzung.eintrag()).toBe(null);
  });

  it('der Öffner ruft die Maske mit Tabelle, Kennung und Maske', async () => {
    const aufrufe = [];
    const sitzung = maskenSitzung(seite(), (...args) => aufrufe.push(args));
    await sitzung.oeffne({ tabelle: LIBRARY, kennung: 'r-00003', maske: 'Buch-Maske.md' });
    await sitzung.oeffne({ tabelle: LIBRARY, kennung: 'r-00004', maske: null });
    expect(aufrufe).toEqual([
      [LIBRARY, 'r-00003', { maske: 'Buch-Maske.md' }],
      [LIBRARY, 'r-00004', { maske: null }],
    ]);
  });
});
