// @vitest-environment jsdom
// 4T-001991 (Epic 3E-000188): Die Bedienwege der Wörterbuch-Pflege in der
// portablen Fassung, am echten Modul des Editor-Kontextmenüs
// (src/renderer/modules/editor/editor-context-menu.js) und am echten Bereich
// «Rechtschreibprüfung» der Einstellungs-Seite (settings-draft.js,
// settings-small-sections.js).
//
// Entscheidung des Product Owners vom 2026-09-28: «Zum Wörterbuch hinzufügen»
// entfällt in der portablen Fassung, weil die Aufnahme das Wort auch in das
// Wörterbuch des Windows-Benutzers schreibt; dasselbe gilt für das Entfernen
// eines eigenen Worts. Die Korrektur-Vorschläge und die Liste der eigenen
// Wörter bleiben. Die installierte Fassung bleibt unverändert.
//
// **Warum hier und nicht im Ablauf-Fall.** Die Ablauf-Suite startet die
// Anwendung aus den Quellen und mit Test-Umlenkung; dort gilt stets «nicht
// portabel». Einen Schalter, der den portablen Betrieb im Testlauf vortäuscht,
// gibt es bewusst nicht. Die Auskunft des Hauptprozesses wird hier deshalb über
// die Brücke eingeschoben; die Wirkung am gebauten Programm belegt die Messung
// des Tasks. Die Vorschlags-Daten des Hauptprozesses stellt der Fall über
// `handleSpellcheckContext` nach, den Weg, auf dem sie auch im Programm
// ankommen.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { EditorState } from '@codemirror/state';
// 4T-002214: Das Menü-Modul und die drei Module der Einstellungs-Seite einmal
// statisch laden. Ihre Übersetzung fällt damit in die Sammel-Phase der Datei,
// die keine Haken-Grenze kennt; die Gruppen laden sie danach nur noch frisch
// aus (resetModules plus Import), und das bleibt im Haken unter der Grenze,
// auch unter der Last der ganzen Suite. Die Grenze selbst bleibt unverändert.
// Die Auskunft über den portablen Betrieb fragt das Menü erst beim ersten
// Rechtsklick; das statische Laden löst sie nicht aus.
import '../../../src/renderer/modules/editor/editor-context-menu.js';
import '../../../src/renderer/modules/settings/settings-draft.js';
import '../../../src/renderer/modules/settings/settings-shared.js';
import '../../../src/renderer/modules/settings/settings-small-sections.js';

// Das gemeinsame Menü-Element des Fensters (#context-menu) legt api-stub.js
// mit dem übrigen Fenster-Gerüst an; app-state.js greift es beim Laden.

const PORTABEL = { portabel: true, datenOrdner: 'D:\\Programme\\EM4me\\Data' };
const NICHT_PORTABEL = { portabel: false, datenOrdner: null };
const VORSCHLAEGE = ['Probe', 'Proben'];

// Die Auskunft wird im Modul des Menüs einmal je Fenster behalten. Jede
// Gruppe lädt es deshalb frisch, mit der Auskunft, die sie prüft.
async function ladeMenue(auskunft) {
  vi.resetModules();
  window.api.getPortablerBetrieb = vi.fn(async () => {
    if (auskunft instanceof Error) throw auskunft;
    return auskunft;
  });
  return import('../../../src/renderer/modules/editor/editor-context-menu.js');
}

function neueAnsicht() {
  return {
    state: EditorState.create({ doc: 'Ein Probwort steht hier.' }),
    posAtCoords: () => null,
    dispatch: () => {},
    focus: () => {},
  };
}

const menue = () => document.querySelector('#context-menu');
const eintrag = (id) => menue().querySelector(`[data-menu-id="${id}"]`);

// Rechtsklick auf ein falsch geschriebenes Wort: erst das DOM-Ereignis, dann
// die Meldung des Hauptprozesses mit Wort und Vorschlägen.
async function rechtsklickAufTippfehler(modul, view = neueAnsicht()) {
  modul.showEditorContextMenu({ target: null, clientX: 10, clientY: 10 }, view);
  await modul.handleSpellcheckContext({ word: 'Probwort', suggestions: VORSCHLAEGE });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Editor-Kontextmenü im portablen Betrieb (4T-001991)', () => {
  let modul;
  beforeAll(async () => {
    modul = await ladeMenue(PORTABEL);
  });

  it('bietet «Zum Wörterbuch hinzufügen» nicht an, die Vorschläge bleiben', async () => {
    await rechtsklickAufTippfehler(modul);
    expect(menue().hidden).toBe(false);
    expect(eintrag('spell-add-to-dictionary')).toBeNull();
    for (const v of VORSCHLAEGE) expect(eintrag(`spell-suggestion-${v}`)).not.toBeNull();
  });

  it('lässt keinen Trenner zwischen den Vorschlägen und dem Rest des Menüs verwaisen', async () => {
    // Ohne Aufnahme-Eintrag endet die Sektion mit dem letzten Vorschlag; es
    // folgt genau der eine Trenner zwischen zwei Sektionen.
    await rechtsklickAufTippfehler(modul);
    const kinder = [...menue().children];
    const letzter = kinder.findIndex(
      (k) => k.dataset.menuId === `spell-suggestion-${VORSCHLAEGE.at(-1)}`,
    );
    expect(kinder[letzter + 1].classList.contains('context-menu-separator')).toBe(true);
    expect(kinder[letzter + 2].classList.contains('context-menu-separator')).toBe(false);
  });

  it('fragt den Hauptprozess einmal je Fenster, nicht je Rechtsklick', async () => {
    await rechtsklickAufTippfehler(modul);
    await rechtsklickAufTippfehler(modul);
    expect(window.api.getPortablerBetrieb).toHaveBeenCalledTimes(1);
  });
});

describe('Editor-Kontextmenü außerhalb des portablen Betriebs (4T-001991)', () => {
  let modul;
  beforeAll(async () => {
    modul = await ladeMenue(NICHT_PORTABEL);
  });

  it('bietet «Zum Wörterbuch hinzufügen» wie bisher an, unter den Vorschlägen', async () => {
    await rechtsklickAufTippfehler(modul);
    const hinzufuegen = eintrag('spell-add-to-dictionary');
    expect(hinzufuegen).not.toBeNull();
    for (const v of VORSCHLAEGE) expect(eintrag(`spell-suggestion-${v}`)).not.toBeNull();
    // Reihenfolge wie bisher: Vorschläge, Trenner, Aufnahme.
    const vorher = hinzufuegen.previousElementSibling;
    expect(vorher.classList.contains('context-menu-separator')).toBe(true);
    expect(vorher.previousElementSibling.dataset.menuId).toBe(
      `spell-suggestion-${VORSCHLAEGE.at(-1)}`,
    );
  });

  it('reicht das Wort beim Klick an den Hauptprozess', async () => {
    const aufnehmen = vi.spyOn(window.api, 'spellcheckAddWord');
    await rechtsklickAufTippfehler(modul);
    eintrag('spell-add-to-dictionary').click();
    expect(aufnehmen).toHaveBeenCalledWith('Probwort');
  });

  it('deckt ein inzwischen geschlossenes Menü nicht wieder auf', async () => {
    const view = neueAnsicht();
    modul.showEditorContextMenu({ target: null, clientX: 10, clientY: 10 }, view);
    menue().hidden = true;
    await modul.handleSpellcheckContext({ word: 'Probwort', suggestions: VORSCHLAEGE });
    expect(menue().hidden).toBe(true);
  });
});

describe('Editor-Kontextmenü bei gestörter Auskunft (4T-001991)', () => {
  it('blendet die Aufnahme aus und fragt beim nächsten Rechtsklick neu', async () => {
    const modul = await ladeMenue(new Error('Brücke nicht erreichbar'));
    await rechtsklickAufTippfehler(modul);
    expect(eintrag('spell-add-to-dictionary')).toBeNull();
    expect(eintrag(`spell-suggestion-${VORSCHLAEGE[0]}`)).not.toBeNull();
    await rechtsklickAufTippfehler(modul);
    expect(window.api.getPortablerBetrieb).toHaveBeenCalledTimes(2);
  });

  it('blendet die Aufnahme bei einer unerwarteten Auskunft aus', async () => {
    for (const antwort of [null, undefined, {}, { portabel: 'nein' }]) {
      const modul = await ladeMenue(antwort);
      await rechtsklickAufTippfehler(modul);
      expect(eintrag('spell-add-to-dictionary'), JSON.stringify(antwort)).toBeNull();
    }
  });
});

// --- Einstellungen → Rechtschreibprüfung ------------------------------------

const warte = () => new Promise((r) => setTimeout(r, 0));

async function eigeneWoerterMit(auskunft) {
  vi.resetModules();
  window.api.getPortablerBetrieb = vi.fn(async () => auskunft);
  window.api.spellcheckListWords = async () => ['Alpha', 'Beta'];
  const draftModul = await import('../../../src/renderer/modules/settings/settings-draft.js');
  const { pageState } = await import('../../../src/renderer/modules/settings/settings-shared.js');
  const { renderSpellcheckSection } =
    await import('../../../src/renderer/modules/settings/settings-small-sections.js');
  draftModul.resetPageState();
  await warte();
  const container = document.createElement('div');
  renderSpellcheckSection(container, pageState.draft);
  return container;
}

const woerter = (c) =>
  [...c.querySelectorAll('.settings-spellcheck-word span')].map((s) => s.textContent);
const knoepfe = (c) => [...c.querySelectorAll('.settings-spellcheck-word button')];

describe('Einstellungen, eigene Wörter (4T-001991)', () => {
  it('zeigt im portablen Betrieb die Liste ohne Knöpfe zum Entfernen', async () => {
    const c = await eigeneWoerterMit(PORTABEL);
    expect(woerter(c)).toEqual(['Alpha', 'Beta']);
    expect(knoepfe(c)).toEqual([]);
  });

  it('zeigt außerhalb des portablen Betriebs je Wort den Knopf wie bisher', async () => {
    const c = await eigeneWoerterMit(NICHT_PORTABEL);
    expect(woerter(c)).toEqual(['Alpha', 'Beta']);
    expect(knoepfe(c).map((k) => k.dataset.word)).toEqual(['Alpha', 'Beta']);
  });

  it('zeigt bei einer unerwarteten Auskunft keinen Knopf', async () => {
    const c = await eigeneWoerterMit({});
    expect(woerter(c)).toEqual(['Alpha', 'Beta']);
    expect(knoepfe(c)).toEqual([]);
  });
});
