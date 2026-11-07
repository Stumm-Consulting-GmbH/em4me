// @vitest-environment jsdom
// 4T-002441: Regressionstest zum Abschnitt «Datenbank» der Einstellungs-Seite,
// wenn die Seite geöffnet wird, während der Index des Bereichs noch aufgebaut
// wird.
//
// Der Fehler: Die Seite fragte die Bereichs-Art genau einmal beim Öffnen. Lief
// der Index-Aufbau da noch, lautete die Antwort «keine Datenbank», und der
// Abschnitt fehlte in der Gruppe «Aktueller Bereich», bis die Seite neu
// geöffnet wurde. Gemessen öffnete die Seite 60 bis 115 ms nach dem Binden,
// der Index war 100 bis 220 ms danach bereit; die Reihenfolge war Zufall, und
// das war die Ursache des unbeständigen Ablauf-Falls DB-BER-01.
//
// Die Fälle stellen die Reihenfolge gezielt her, statt auf sie zu warten: Der
// Kanal antwortet zuerst «indexing», danach «ready», und die Fertig-Meldung des
// Index wird von Hand ausgelöst. Der zweite Fall legt die Meldung zwischen die
// beiden Anfragen der Auskunft, der dritte und vierte sichern die Grenzen des
// Nachzugs: kein Nachladen nach einer bereiten Antwort und keines unter einem
// sichtbaren Abschnitt mit Eingaben.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './api-stub.js';

// Antworten des Kanals, je Fall gesetzt; dazu der Zähler der Anfragen.
let ueberblick = null;
let ueberblickRufe = 0;
// Ist `konfigSperre` gesetzt, wartet die Antwort der Bereichsdatei, bis der
// Fall sie freigibt — so fällt die Index-Meldung zwischen die beiden Anfragen.
let konfigSperre = null;
const meldungen = [];
window.api.databaseOverview = async () => {
  ueberblickRufe += 1;
  return ueberblick;
};
window.api.getAreaDatabaseConfig = async () => {
  if (konfigSperre) await konfigSperre;
  return { hasArea: true, overviewOnOpen: false };
};
window.api.onBacklinksInvalidated = (cb) => meldungen.push(cb);

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const settingsShared = await import('../../../src/renderer/modules/settings/settings-shared.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { verwirfDatenbankAuskunft } =
  await import('../../../src/renderer/modules/database/datenbank-bereich.js');

const IM_AUFBAU = Object.freeze({ status: 'indexing', istDatenbankBereich: false });
const DATENBANK_BEREIT = Object.freeze({
  status: 'ready',
  istDatenbankBereich: true,
  steckbrief: { name: 'Mini-CRM' },
  tabellen: [],
  hints: [],
});
const PROSA_BEREIT = Object.freeze({ status: 'ready', istDatenbankBereich: false });

async function abwarten() {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function indexMeldet() {
  for (const cb of meldungen) cb({ wurzel: state.areaPath });
}

async function oeffneSeite() {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

function navIds(container) {
  return [...container.querySelectorAll('[data-nav-group="area"] .settings-nav-entry')].map(
    (b) => b.dataset.sectionId,
  );
}

beforeEach(() => {
  state.areaPath = 'C:/tmp/datenbank-bereich';
  ueberblickRufe = 0;
  konfigSperre = null;
  verwirfDatenbankAuskunft({ bereichsWechsel: true });
});

afterEach(() => {
  state.areaPath = null;
  document.body.innerHTML = '';
  verwirfDatenbankAuskunft({ bereichsWechsel: true });
});

describe('Abschnitt «Datenbank» nach dem Index-Aufbau (4T-002441)', () => {
  it('meldet sich als Hörer der Index-Meldung an', () => {
    // Ohne Anmeldung gäbe es keinen Nachzug; die übrigen Fälle setzen sie voraus.
    expect(meldungen.length).toBeGreaterThan(0);
  });

  it('erscheint nach der Fertig-Meldung, wenn die Seite während des Aufbaus geöffnet wurde', async () => {
    ueberblick = IM_AUFBAU;
    const container = await oeffneSeite();
    await abwarten();
    // Der alte Stand blieb hier stehen: kein Abschnitt, auch nach dem Aufbau.
    expect(navIds(container)).not.toContain('database');

    // Andere Abschnitte tragen ihren Entwurf; der Nachzug darf ihn nicht
    // austauschen.
    const pageState = settingsShared.settingsPageStateForTests();
    const entwurf = pageState.draft;
    const tasten = entwurf.hotkeys;

    ueberblick = DATENBANK_BEREIT;
    indexMeldet();
    await abwarten();
    expect(navIds(container)).toContain('database');
    expect(pageState.draft).toBe(entwurf);
    expect(pageState.draft.hotkeys).toBe(tasten);
  });

  it('erscheint auch, wenn die Fertig-Meldung zwischen die beiden Anfragen der Auskunft fällt', async () => {
    ueberblick = IM_AUFBAU;
    let freigeben;
    konfigSperre = new Promise((r) => {
      freigeben = r;
    });
    const container = await oeffneSeite();
    await abwarten();
    // Die Bereichs-Art ist schon mit «indexing» beantwortet, die Bereichsdatei
    // steht noch aus; es gibt also noch keinen Entwurf, an dem die Meldung das
    // Warten erkennen könnte.
    expect(ueberblickRufe).toBe(1);
    ueberblick = DATENBANK_BEREIT;
    indexMeldet();
    konfigSperre = null;
    freigeben();
    await abwarten();
    expect(navIds(container)).toContain('database');
  });

  it('fragt nach einer bereiten Antwort nicht bei jeder Meldung neu', async () => {
    ueberblick = PROSA_BEREIT;
    const container = await oeffneSeite();
    await abwarten();
    const rufe = ueberblickRufe;
    indexMeldet();
    indexMeldet();
    await abwarten();
    expect(ueberblickRufe).toBe(rufe);
    expect(navIds(container)).not.toContain('database');
  });

  it('lässt einen sichtbaren Abschnitt samt Eingaben stehen', async () => {
    ueberblick = DATENBANK_BEREIT;
    const container = await oeffneSeite();
    await abwarten();
    expect(navIds(container)).toContain('database');
    const pageState = settingsShared.settingsPageStateForTests();
    pageState.draft.database.lockFolderName = '.eigene-sperren';
    const rufe = ueberblickRufe;
    indexMeldet();
    await abwarten();
    expect(ueberblickRufe).toBe(rufe);
    expect(pageState.draft.database.lockFolderName).toBe('.eigene-sperren');
  });
});
