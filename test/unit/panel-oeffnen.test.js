// @vitest-environment jsdom
// 4T-001641 (Epic 3E-000297): Wächter über den einen Weg ins Panel.
//
// `4S-000402` sagt zu: «Wird ein Panel einer Reiter-Gruppe eingeblendet, wird
// zugleich sein Reiter aktiv.» Gemessen am 2026-09-09 hielten alle 16
// Toggle-Wege die Zusage und drei von sechs Öffner-Wegen nicht — die Regel
// stand sechsfach im Bestand und war nirgends bewacht: Keine einzige Prüfdatei
// nannte `ensurePanelTabActive`.
//
// **Warum dieser Wächter schmal sein darf.** Der Umbau hat die Regel ins
// Modell gezogen (`oeffnePanel` in sidebar-layout.js). Danach genügt eine
// Prüfung über den Bestand, die zwei Sätze verlangt und keine Ausnahme-Liste
// für die Verdrahtungs-Schicht braucht:
//
//   1. `visibleByPane` setzt niemand ausser den registrierten Toggle-Wegen und
//      den Lade-Funktionen des Sitzungs-Starts.
//   2. `ensurePanelTabActive` ruft niemand ausser diesen Toggle-Wegen und
//      `oeffnePanel` selbst.
//
// Beide Listen sind keine gepflegten Ausnahmen, sondern gegen den Bestand
// geprüft: Sie müssen genau die 16 registrierten Panels abdecken (dritter
// Prüffall), sonst wäre die Liste eine Hintertür statt einer Zusicherung.
//
// Dazu kommt der Satz, der die Falle des Modells schliesst (dritter Abschnitt):
// Ein Panel, das über `oeffnePanel` geöffnet wird, führt `getPreference` in
// seiner Registrierung. Ohne das Feld schaltet `oeffnePanel` bewusst nicht,
// sondern aktiviert nur den Reiter — das wäre still das halbe Verhalten.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Muster panel-access.test.js: Das Modell wird importiert (fuer die 16er-Menge
// der Panel-IDs), und dafuer braucht der Renderer-Basis-Export sein window.
import './renderer/api-stub.js';
import { BESTAND_ZEITLIMIT } from '../zeitlimits.js';

// Diese Prüfung liest einen Baum des Repositoriums (Regel «Bestands-Lesungen
// gehören in den Modulkopf», test/README.md).
vi.setConfig({ testTimeout: BESTAND_ZEITLIMIT });

const { DEFAULT_PANEL_ORDER } = await import('../../src/renderer/modules/sidebar-layout.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HERE, '..', '..', 'src', 'renderer', 'modules');

function sammleDateien(dir, out = []) {
  for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) sammleDateien(abs, out);
    else if (eintrag.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

const BESTAND = sammleDateien(WURZEL).map((abs) => ({
  rel: `src/renderer/modules/${path.relative(WURZEL, abs).split(path.sep).join('/')}`,
  text: fs.readFileSync(abs, 'utf8'),
}));

// --- Die beiden erlaubten Gruppen --------------------------------------------
//
// **Gruppe 1: die registrierten Toggle-Wege.** Sie sind der Ort, an dem die
// Sichtbarkeit eines Panels umgeschaltet wird, und sie halten die Zusicherung
// vollständig (`if (next) await ensurePanelTabActive(...)`). Sie werden vom
// Umbau ausdrücklich nicht angefasst — der Befund lag nie bei ihnen.
const TOGGLE_WEGE = new Map([
  ['toggleBookmarksPanel', 'bookmarks'],
  ['toggleAreaPanel', 'area'],
  ['toggleBookPanel', 'book'],
  ['toggleOutlinePanel', 'outline'],
  ['toggleSubpagesPanel', 'subpages'],
  ['toggleFileGraphPanel', 'filegraph'],
  ['toggleSearchResultsPanel', 'searchresults'],
  ['toggleCalendarPanel', 'calendar'],
  ['toggleRemindersPanel', 'reminders'],
  ['toggleClockPanel', 'clock'],
  ['toggleNotesPanel', 'notes'],
  ['togglePropertiesPanel', 'properties'],
  ['toggleTagsPanel', 'tags'],
  ['toggleBlockPropsPanel', 'blockprops'],
  ['toggleOutgoingPanel', 'outgoing'],
  ['toggleBacklinksPanel', 'backlinks'],
]);

// **Gruppe 2: die Lade-Funktionen des Sitzungs-Starts.** Sie stellen den
// persistierten Stand her, bevor die Sidebar zum ersten Mal rendert. Ein
// Reiter ist zu diesem Zeitpunkt nicht zu aktivieren: Es gibt noch keine
// Nutzer-Handlung, auf die er antworten würde, und die spaltenweise Reiter-Wahl
// wird aus ihrem eigenen Setting geladen (initSidebarActiveByColumn).
const LADE_FUNKTIONEN = new Map([
  ['loadBookmarksSettings', 'bookmarks'],
  ['loadAreaPanelSettings', 'area'],
  ['loadBookPanelSettings', 'book'],
  ['loadOutlineSettings', 'outline'],
  ['loadSubpagesSettings', 'subpages'],
  ['loadFileGraphSettings', 'filegraph'],
  ['loadSearchResultsSettings', 'searchresults'],
  ['loadCalendarSettings', 'calendar'],
  ['loadRemindersSettings', 'reminders'],
  ['loadClockSettings', 'clock'],
  ['loadNotesSettings', 'notes'],
  ['loadPropertiesSettings', 'properties'],
  ['loadTagsSettings', 'tags'],
  ['loadBlockPropsSettings', 'blockprops'],
  ['loadOutgoingSettings', 'outgoing'],
  ['loadBacklinksSettings', 'backlinks'],
]);

// Die Heimat der Regel selbst: Dort steht der eine erlaubte Aufruf ausserhalb
// der Toggle-Wege, und dort ist auch `ensurePanelTabActive` definiert.
const MODELL_DATEI = 'src/renderer/modules/sidebar-layout.js';
const MODELL_FUNKTIONEN = new Set(['oeffnePanel', 'ensurePanelTabActive']);

const SETZER = /visibleByPane\s*\[[^\]]*\]\s*=[^=]/;
const AUFRUF = /\bensurePanelTabActive\s*\(/;
const FUNKTIONS_KOPF = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/;

// Befunde über eine gegebene Datei-Menge. Die Menge ist Parameter und nicht
// fest der Bestand, damit die Rückdreh-Proben unten dieselbe Prüfung gegen den
// alten Stand einer Stelle laufen lassen können — sonst bliebe der Nachweis,
// dass sie anschlägt, eine Behauptung (Muster der Negativ-Probe in
// test/unit/command-availability.test.js).
function befunde(dateien) {
  const gefunden = [];
  for (const { rel, text } of dateien) {
    let funktion = '(Modulrumpf)';
    const zeilen = text.split(/\r?\n/);
    zeilen.forEach((zeile, i) => {
      const kopf = zeile.match(FUNKTIONS_KOPF);
      if (kopf) funktion = kopf[1];
      const ort = `${rel}:${i + 1} (${funktion})`;
      if (SETZER.test(zeile)) {
        if (!TOGGLE_WEGE.has(funktion) && !LADE_FUNKTIONEN.has(funktion)) {
          gefunden.push(`${ort}: setzt visibleByPane selbst — dafür ist oeffnePanel da`);
        }
        return;
      }
      if (!AUFRUF.test(zeile)) return;
      if (/^\s*(\/\/|\*|import\b)/.test(zeile)) return;
      const inModell = rel === MODELL_DATEI && MODELL_FUNKTIONEN.has(funktion);
      if (!TOGGLE_WEGE.has(funktion) && !inModell) {
        gefunden.push(`${ort}: ruft ensurePanelTabActive selbst — dafür ist oeffnePanel da`);
      }
    });
  }
  return gefunden;
}

describe('Ein Weg ins Panel (4T-001641)', () => {
  it('niemand ausser Toggle-Wegen und Lade-Funktionen setzt visibleByPane', () => {
    const alle = befunde(BESTAND);
    const setzer = alle.filter((b) => b.includes('setzt visibleByPane'));
    expect(setzer, 'eigener Sichtbarkeits-Weg am Modell vorbei').toEqual([]);
  });

  it('niemand ausser den Toggle-Wegen und oeffnePanel ruft ensurePanelTabActive', () => {
    const alle = befunde(BESTAND);
    const rufer = alle.filter((b) => b.includes('ruft ensurePanelTabActive'));
    expect(rufer, 'eigene Reiter-Aktivierung am Modell vorbei').toEqual([]);
  });

  // Die Menge vor dem Muster: Eine Erlaubnis-Liste, die niemand gegen den
  // Bestand hält, ist eine Hintertür. Beide Gruppen decken genau die 16
  // registrierten Panels ab — je Panel ein Toggle-Weg und eine Lade-Funktion.
  it('beide Gruppen decken genau die 16 registrierten Panels ab', () => {
    expect(DEFAULT_PANEL_ORDER).toHaveLength(16);
    expect([...TOGGLE_WEGE.values()].sort()).toEqual([...DEFAULT_PANEL_ORDER].sort());
    expect([...LADE_FUNKTIONEN.values()].sort()).toEqual([...DEFAULT_PANEL_ORDER].sort());
  });

  // Jede erlaubte Funktion existiert auch wirklich; eine Karteileiche in der
  // Liste wäre eine Erlaubnis für einen Namen, den jemand neu vergeben kann.
  it('jede erlaubte Funktion steht real im Bestand', () => {
    const namen = [...TOGGLE_WEGE.keys(), ...LADE_FUNKTIONEN.keys()];
    const fehlend = namen.filter(
      (name) => !BESTAND.some(({ text }) => new RegExp(`function\\s+${name}\\s*\\(`).test(text)),
    );
    expect(fehlend, 'erlaubte Funktionen ohne Stelle im Bestand').toEqual([]);
  });
});

// --- Die Kopplung an getPreference -------------------------------------------
//
// `oeffnePanel` entscheidet am Schalter des Panels, ob geschaltet werden muss,
// und liest ihn über `getPreference`. Fehlt das Feld, schaltet es bewusst
// nicht — richtig als Verhalten, falsch als Dauerzustand: Der Aufrufer bekäme
// still nur den Reiter und nicht das Panel. Dieser Prüffall macht die Lage
// sichtbar, statt sie einem Konsolen-Hinweis zu überlassen.

// id -> führt die Registrierung getPreference?
function registrierteVorlieben() {
  const karte = new Map();
  for (const { text } of BESTAND) {
    for (const stueck of text.split('registerSidebarPanel(').slice(1)) {
      const block = stueck.split('\n});')[0];
      const id = block.match(/\bid:\s*'([^']+)'/);
      if (id) karte.set(id[1], /\bgetPreference\s*:/.test(block));
    }
  }
  return karte;
}

function oeffnePanelZiele() {
  const ziele = new Set();
  for (const { rel, text } of BESTAND) {
    if (rel === MODELL_DATEI) continue;
    for (const treffer of text.matchAll(/\boeffnePanel\(\s*'([^']+)'/g)) ziele.add(treffer[1]);
  }
  return [...ziele].sort();
}

describe('getPreference ist Pflicht für jedes Öffner-Ziel (4T-001641)', () => {
  it('die Erhebung findet die Öffner-Ziele überhaupt', () => {
    // Gegenprobe zum Suchmuster: Fände es nichts, wäre der Prüffall darunter
    // stumm grün — genau die Bauform, die 4T-001629 als Klasse benannt hat.
    expect(oeffnePanelZiele().length).toBeGreaterThan(0);
  });

  it('jedes über oeffnePanel geöffnete Panel führt getPreference', () => {
    const vorlieben = registrierteVorlieben();
    const ohne = oeffnePanelZiele().filter((id) => vorlieben.get(id) !== true);
    expect(ohne, 'Öffner-Ziele ohne getPreference in ihrer Registrierung').toEqual([]);
  });
});

// --- Rückdreh-Proben (AK5) ---------------------------------------------------
//
// AK5 verlangt den Nachweis, dass der Wächter für jede der drei Stellen
// **einzeln** rot wird und die jeweilige Stelle **benennt**. Er ist hier als
// dauerhafter Prüffall geführt und nicht als einmal geschriebenes Protokoll:
// Ein einmaliger Nachweis veraltet mit der nächsten Änderung; ein Prüffall, der
// die Prüfung gegen den zurückgedrehten Text laufen lässt, wiederholt ihn bei
// jedem Lauf (Muster der Negativ-Probe zu 4T-001638).
//
// Zurückgedreht wird eine KOPIE als Text-Fixture, nie der Bestand. Die drei
// Ausschnitte sind der Wortlaut vom Integrationsstand vor dem Umbau
// (Commit-Stand 2026-09-10), auf die tragende Stelle gekürzt.
const DREI_BEFUNDE = [
  {
    rel: 'src/renderer/modules/bookmarks/bookmarks-edit.js',
    anlass: 'neues Lesezeichen mit Inline-Edit',
    // Der schwerste der drei: Der else-Zweig rief focusInlineEditInput, ohne
    // den Reiter nach vorn zu holen — Tastatur-Fokus in einem unsichtbaren Feld.
    alt: `export async function createNewFolderUI(parentFolderId, paneIdx, section) {
  // Sicherstellen, dass die Sektion sichtbar ist (sonst sieht der Nutzer
  // nichts vom neuen Inline-Edit).
  if (!state.bookmarks.visibleByPane[state.activePaneIndex]) {
    state.bookmarks.visibleByPane[state.activePaneIndex] = true;
    await persistBookmarksSettings();
    applyBookmarksVisibility(state.activePaneIndex);
    if (typeof reportMenuStateNow === 'function') reportMenuStateNow();
  } else {
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  }
  focusInlineEditInput(paneIdx);
}`,
    zeile: 5,
    funktion: 'createNewFolderUI',
  },
  {
    rel: 'src/renderer/modules/views/link-navigation.js',
    anlass: 'Klick auf einen Tag-Link',
    alt: `export async function activateLink(paneIdx, href, isWikilink, baseOverride) {
  if (href.startsWith('#tag:')) {
    const tagName = decodeURIComponent(href.slice(5));
    if (!state.tags.visibleByPane[paneIdx]) {
      state.tags.visibleByPane[paneIdx] = true;
      applyTagsVisibility(paneIdx);
      persistTagsSettings();
    }
    state.tags.filterByPane[paneIdx] = tagName;
    renderTags(paneIdx);
    return;
  }
}`,
    zeile: 5,
    funktion: 'activateLink',
  },
  {
    rel: 'src/renderer/modules/bookmarks/bookmarks-actions.js',
    anlass: 'erstes Lesezeichen eines Abschnitts',
    alt: `export async function addBookmark() {
  // 4T-000075/4T-000612: Beim ersten Lesezeichen eines Abschnitts die Sektion
  // automatisch sichtbar machen, wenn sie noch nicht sichtbar ist.
  if (wasEmpty && !state.bookmarks.visibleByPane[state.activePaneIndex]) {
    state.bookmarks.visibleByPane[state.activePaneIndex] = true;
    await persistBookmarksSettings();
    applyBookmarksVisibility(state.activePaneIndex);
    if (typeof reportMenuStateNow === 'function') reportMenuStateNow();
  } else {
    for (let i = 0; i < state.panes.length; i++) renderBookmarks(i);
  }
}`,
    zeile: 5,
    funktion: 'addBookmark',
  },
];

describe('Rückdreh-Proben: der Wächter benennt jede der drei Stellen (AK5)', () => {
  it('deckt genau die drei gemessenen Stellen ab', () => {
    expect(DREI_BEFUNDE).toHaveLength(3);
    // Und jede von ihnen ist heute behoben: Der reale Bestand der Datei trägt
    // die alte Zeile nicht mehr.
    for (const fall of DREI_BEFUNDE) {
      const datei = BESTAND.find((d) => d.rel === fall.rel);
      expect(datei, `${fall.rel} fehlt im Bestand`).toBeTruthy();
      expect(befunde([datei]), `${fall.rel} trägt noch einen eigenen Weg`).toEqual([]);
    }
  });

  for (const fall of DREI_BEFUNDE) {
    it(`${fall.anlass}: der alte Stand wird erkannt und beim Namen genannt`, () => {
      const gefunden = befunde([{ rel: fall.rel, text: fall.alt }]);
      // Genau ein Befund — die Probe reagiert auf die Ursache und nicht auf
      // einen Nebenumstand.
      expect(gefunden).toHaveLength(1);
      // Und er benennt die Stelle: Datei, Zeile und umgebende Funktion.
      expect(gefunden[0]).toContain(fall.rel);
      expect(gefunden[0]).toContain(`:${fall.zeile} (${fall.funktion})`);
      expect(gefunden[0]).toContain('setzt visibleByPane selbst');
    });
  }

  it('ohne Rückdrehung schweigt sie', () => {
    // Die Gegenprobe zur Probe: Eine Prüfung, die immer rot ist, beweist
    // nichts. Sie ist am unveränderten Bestand grün.
    expect(befunde(BESTAND)).toEqual([]);
  });
});
