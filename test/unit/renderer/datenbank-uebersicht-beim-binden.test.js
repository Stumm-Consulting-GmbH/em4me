// @vitest-environment jsdom
// 4T-001759 (Epic 3E-000253, AK6): Die Option «Übersicht beim Öffnen des
// Bereichs zeigen» und ihre Wirkung beim Binden.
//
// Vier Lagen, und drei davon dürfen NICHTS öffnen — genau daran hängt, ob die
// Option eine Zusage ist oder eine Zumutung: Wer sie nicht gesetzt hat, bekommt
// keinen Reiter; wer keine Datenbank führt, ebenso wenig; und solange der Index
// einer eben geöffneten Wurzel noch aufgebaut wird, ist «keine Datenbank» keine
// Auskunft über den Bestand, sondern der Stand der Arbeit — die Seite bliebe
// sonst zu Unrecht zu.
//
// Der vierte Fall ist der Nachzug: Sobald der Index sich meldet, wird die Frage
// erneut gestellt. Gemessen wird dabei ausdrücklich auch, dass es bei EINEM
// Reiter bleibt und dass der Nachzug nach der ersten bereiten Antwort endet.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

for (const paneIdx of [0, 1]) {
  document.querySelector(`.pane-group[data-pane="${paneIdx}"]`).innerHTML = `
    <div class="tabbar"></div>
    <div class="content view-split">
      <section class="pane pane-source"><div class="pane-source-editor"></div></section>
      <section class="pane pane-rendered"><article class="markdown-body"></article></section>
      <section class="pane pane-system"></section>
      <section class="pane pane-mindmap"></section>
    </div>
  `;
}
document.body.insertAdjacentHTML(
  'beforeend',
  '<button id="btn-wrap"></button><button id="btn-numbers"></button>',
);

let antwort = null;
let konfig = null;
let ueberblickRufe = 0;
const meldungen = [];
window.api.databaseOverview = async () => {
  ueberblickRufe += 1;
  return antwort;
};
window.api.getAreaDatabaseConfig = async () => konfig;
window.api.onBacklinksInvalidated = (cb) => meldungen.push(cb);
window.api.reportMenuState = () => {};
window.api.reportPanes = () => {};

const seite = await import('../../../src/renderer/modules/database/datenbank-uebersicht-seite.js');
const helfer = await import('../../../src/renderer/modules/database/datenbank-bereich.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { closeTab } = await import('../../../src/renderer/modules/tabs/tabs.js');
// 4T-001761 (Epic 3E-000253): Der Schalt-Zustand kommt über den ECHTEN
// Lebenszyklus und nicht über eine Attrappe (Muster memory-page.test.js).
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

function bereit(istDatenbank = true) {
  return {
    status: 'ready',
    istDatenbankBereich: istDatenbank,
    steckbrief: istDatenbank ? { name: 'Mini-CRM' } : null,
    tabellen: [],
    hints: [],
  };
}

const IM_AUFBAU = {
  status: 'indexing',
  istDatenbankBereich: false,
  steckbrief: null,
  tabellen: [],
  hints: [],
};

// Alle offenen Reiter der Seite schließen, damit jeder Fall bei null anfängt.
async function raeumeAuf() {
  for (let p = state.panes.length - 1; p >= 0; p--) {
    for (let i = state.panes[p].tabs.length - 1; i >= 0; i--) {
      await closeTab(p, i, { skipDirtyCheck: true });
    }
  }
}

// Die Index-Meldung an beide Zuhörer geben und den angestoßenen Ablauf
// auslaufen lassen. Ein Makrotask flusht die ganze Mikrotask-Kette; eine feste
// Zahl von Mikrotask-Runden hinge daran, wie viele `await` unterwegs liegen.
async function meldeIndexUndWarte() {
  for (const cb of meldungen) cb();
  await new Promise((fertig) => setTimeout(fertig, 0));
  await new Promise((fertig) => setTimeout(fertig, 0));
}

function reiterZahl() {
  let zahl = 0;
  for (const pane of state.panes)
    zahl += pane.tabs.filter((t) => t.systemPage === seite.DATENBANK_UEBERSICHT_PAGE_ID).length;
  return zahl;
}

beforeEach(async () => {
  await raeumeAuf();
  helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
  lebenszyklus.resetExtensionStateForTests();
  state.areaPath = 'C:\\Ablage\\Kunden';
  antwort = bereit();
  konfig = { hasArea: true, overviewOnOpen: true };
  ueberblickRufe = 0;
});

describe('Übersicht beim Binden des Bereichs (4T-001759, AK6)', () => {
  it('öffnet die Seite bei gesetzter Option', async () => {
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(true);
  });

  it('öffnet nichts, wenn die Option nicht gesetzt ist', async () => {
    konfig = { hasArea: true, overviewOnOpen: false };
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
  });

  it('öffnet nichts in einem Bereich ohne Datenbank und fragt die Bereichsdatei gar nicht', async () => {
    antwort = bereit(false);
    let konfigRufe = 0;
    window.api.getAreaDatabaseConfig = async () => {
      konfigRufe += 1;
      return konfig;
    };
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    expect(konfigRufe).toBe(0);
    window.api.getAreaDatabaseConfig = async () => konfig;
  });

  it('öffnet nichts ohne gebundenen Bereich', async () => {
    state.areaPath = null;
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    expect(ueberblickRufe).toBe(0);
  });

  it('wartet den Index-Aufbau ab und öffnet erst mit der bereiten Antwort', async () => {
    antwort = IM_AUFBAU;
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    expect(meldungen.length).toBeGreaterThan(0);
    // Der Index meldet sein Fertigwerden; jetzt steht die Antwort.
    antwort = bereit();
    await meldeIndexUndWarte();
    expect(seite.datenbankUebersichtOffen()).toBe(true);
    expect(reiterZahl()).toBe(1);
  });

  it('nimmt nach einer bereiten Antwort keinen weiteren Anlauf', async () => {
    antwort = bereit(false);
    await seite.zeigeUebersichtBeimBinden();
    const vorher = ueberblickRufe;
    await meldeIndexUndWarte();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    // Die Meldung verwirft die gehaltene Auskunft (das ist die Aufgabe des
    // Helfers), löst aber keine neue Anfrage dieser Seite aus.
    expect(ueberblickRufe).toBe(vorher);
  });

  it('öffnet keinen zweiten Reiter, wenn die Seite schon steht', async () => {
    await seite.zeigeUebersichtBeimBinden();
    helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
    await seite.zeigeUebersichtBeimBinden();
    expect(reiterZahl()).toBe(1);
  });
});

// 4T-001761 (Epic 3E-000253, AK4): Die Seite selbst im Aus-Zustand der
// Erweiterung.
//
// Zwei Tore, und beide werden hier gemessen. Das **Wurzel-Tor** in
// `oeffneDatenbankUebersicht` deckt alle vier Zugänge auf einmal ab —
// Ansichtsmenü, Kommando-Palette, Kontextmenü des Bereichs-Panels und diese
// Option. Das **zweite Tor** in `zeigeUebersichtBeimBinden` steht davor, weil
// das Wurzel-Tor allein zwar das Öffnen verhinderte, nicht aber die beiden
// Anfragen davor: Eine abgeschaltete Erweiterung darf bei jedem Binden eines
// Bereichs nichts kosten.
describe('Übersichts-Seite im Aus-Zustand (4T-001761, AK4)', () => {
  it('öffnet nichts und fragt nichts, obwohl die Option gesetzt ist', async () => {
    let konfigRufe = 0;
    window.api.getAreaDatabaseConfig = async () => {
      konfigRufe += 1;
      return konfig;
    };
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    // Weder die Auskunft über den Bestand noch die Bereichs-Konfiguration
    // werden gelesen.
    expect(ueberblickRufe).toBe(0);
    expect(konfigRufe).toBe(0);
    window.api.getAreaDatabaseConfig = async () => konfig;
  });

  it('öffnet die Seite auch auf dem direkten Weg nicht', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    // Der Weg, den Ansichtsmenü, Kommando-Palette und Kontextmenü gemeinsam
    // gehen. Er bleibt wirkungslos, statt einen leeren Reiter zu öffnen.
    seite.oeffneDatenbankUebersicht();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
    expect(reiterZahl()).toBe(0);
  });

  it('entfällt auch transitiv über die Eigenschafts-Profile', async () => {
    await lebenszyklus.applyExtensionsState(['property-profiles'], { persist: false });
    await seite.zeigeUebersichtBeimBinden();
    seite.oeffneDatenbankUebersicht();
    expect(seite.datenbankUebersichtOffen()).toBe(false);
  });

  it('wirkt nach dem Wiedereinschalten unverändert, ohne Zutun des Anwenders', async () => {
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(false);

    // Die Option steht unverändert in der Bereichsdatei; das Abschalten hat
    // sie weder gelöscht noch umgeschrieben (AK6). Beim nächsten Binden wirkt
    // sie wieder (AK7).
    await lebenszyklus.applyExtensionsState([], { persist: false });
    helfer.verwirfDatenbankAuskunft({ bereichsWechsel: true });
    await seite.zeigeUebersichtBeimBinden();
    expect(seite.datenbankUebersichtOffen()).toBe(true);
    expect(reiterZahl()).toBe(1);
  });
});
