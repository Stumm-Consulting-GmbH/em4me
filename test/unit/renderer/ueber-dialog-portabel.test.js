// @vitest-environment jsdom
// 4T-001993 (Epic 3E-000188): Die Zeile zur portablen Fassung im Dialog «Über
// EM4me», am echten Modul des Dialogs (src/renderer/modules/dialogs/dialogs.js)
// und am echten Markup aus src/renderer/index.html.
//
// **Warum hier und nicht im Ablauf-Fall.** Die Ablauf-Suite startet die
// Anwendung aus den Quellen und mit Test-Umlenkung; dort gilt stets «nicht
// portabel», und die sichtbare Seite ist dort nicht erreichbar. Einen Schalter,
// der den portablen Betrieb im Testlauf vortäuscht, gibt es bewusst nicht. Die
// sichtbare Seite prüft deshalb dieser Fall mit eingeschobener Auskunft des
// Hauptprozesses; das Fehlen der Zeile am gestarteten Programm prüft
// test/e2e/funktionen/ueber-dialog.spec.js (UD-01), die Wirkung des Knopfs am
// gebauten Programm der Nachweis des Tasks.
//
// jsdom kennt die Gestaltungs-Regeln nicht. Geprüft wird deshalb das Attribut
// `hidden` am Block: Ein Element mit verborgenem Vorfahren ist weder sichtbar
// noch per Tastatur erreichbar, und genau diese Zusage trägt das Markup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.resolve(HERE, '..', '..', '..', 'src', 'renderer', 'index.html');

// Das Markup des Dialogs aus dem echten Fenster-Dokument. Gelesen im Modulkopf
// (Regel «Bestands-Lesungen gehören in den Modulkopf», test/README.md).
const fenster = new DOMParser().parseFromString(fs.readFileSync(INDEX_HTML, 'utf8'), 'text/html');
const dialogMarkup = fenster.querySelector('#about-modal').outerHTML;
document.body.innerHTML = dialogMarkup;

// Auskunft und Öffnen des Hauptprozesses, je Fall eingeschoben.
let auskunft = null;
const oeffneDatenOrdner = vi.fn(async () => ({ ok: true }));

vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {
    getVersion: async () => '9.9.9.9',
    getPortablerBetrieb: async () => {
      if (auskunft instanceof Error) throw auskunft;
      return auskunft;
    },
    oeffneDatenOrdner: (...args) => oeffneDatenOrdner(...args),
  },
  $: (sel) => document.querySelector(sel),
}));
vi.mock('../../../src/renderer/modules/app/app-state.js', () => ({
  aboutModal: document.querySelector('#about-modal'),
  aboutVersionEl: document.querySelector('#about-version'),
  aliasModal: null,
}));

const dialogs = await import('../../../src/renderer/modules/dialogs/dialogs.js');

const block = () => document.querySelector('#about-portable');
const pfad = () => document.querySelector('#about-portable-path');
const knopf = () => document.querySelector('#btn-about-portable-open');
const DATEN_ORDNER = 'D:\\Programme\\EM4me\\Data';

// Das Modul hält die Dialog-Elemente über app-state.js fest; der Ausgangszustand
// wird deshalb je Fall am selben Knoten zurückgesetzt, statt das Markup neu
// einzusetzen.
beforeEach(() => {
  document.querySelector('#about-modal').hidden = true;
  block().hidden = true;
  pfad().textContent = '';
  oeffneDatenOrdner.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Über-Dialog: Markup der Zeile zur portablen Fassung (4T-001993)', () => {
  // Gelesen am unberührten Fenster-Dokument, nicht am Prüf-Stand.
  const echt = (sel) => fenster.querySelector(sel);

  it('trägt Zeile, Pfad und Knopf im Dialog, im Ausgangszustand verborgen', () => {
    // 4T-001993 (AK4): Ohne Auskunft des Hauptprozesses ist nichts davon zu
    // sehen — die installierte Fassung zeigt den Dialog unverändert.
    const b = echt('#about-portable');
    expect(b).not.toBeNull();
    expect(b.closest('#about-modal')).not.toBeNull();
    expect(b.hasAttribute('hidden')).toBe(true);
    expect(b.contains(echt('#about-portable-path'))).toBe(true);
    expect(b.contains(echt('#btn-about-portable-open'))).toBe(true);
  });

  it('führt die Texte über die beiden Übersetzungs-Schlüssel', () => {
    // 4T-001993 (AK5)
    const schluessel = [...echt('#about-portable').querySelectorAll('[data-i18n]')].map((el) =>
      el.getAttribute('data-i18n'),
    );
    expect(schluessel).toEqual(['about.portableDataLabel', 'about.portableOpenDataFolder']);
  });
});

describe('Über-Dialog: sichtbar nur im portablen Betrieb (4T-001993)', () => {
  it('zeigt im portablen Betrieb die Zeile mit dem Pfad und den Knopf', async () => {
    // 4T-001993 (AK2)
    auskunft = { portabel: true, datenOrdner: DATEN_ORDNER };
    await dialogs.showAbout();
    expect(document.querySelector('#about-modal').hidden).toBe(false);
    expect(block().hidden).toBe(false);
    expect(pfad().textContent).toBe(DATEN_ORDNER);
    expect(knopf().closest('[hidden]')).toBeNull();
  });

  it('bleibt außerhalb des portablen Betriebs verborgen', async () => {
    // 4T-001993 (AK4): installierte Fassung, Start aus den Quellen, Testlauf.
    auskunft = { portabel: false, datenOrdner: null };
    await dialogs.showAbout();
    expect(document.querySelector('#about-modal').hidden).toBe(false);
    expect(block().hidden).toBe(true);
    expect(pfad().textContent).toBe('');
    expect(knopf().closest('[hidden]')).toBe(block());
  });

  it('bleibt bei einer gestörten oder unerwarteten Auskunft verborgen', async () => {
    // 4T-001993: Eine gestörte Auskunft behauptet keinen Ort.
    for (const antwort of [
      new Error('Brücke nicht erreichbar'),
      null,
      undefined,
      {},
      { portabel: true },
      { portabel: true, datenOrdner: 42 },
      { portabel: 'ja', datenOrdner: DATEN_ORDNER },
    ]) {
      auskunft = antwort;
      await dialogs.showAbout();
      expect(block().hidden, JSON.stringify(String(antwort))).toBe(true);
    }
  });

  it('nimmt eine spätere «nicht portabel»-Auskunft zurück', async () => {
    // 4T-001993: Die Zeile folgt bei jedem Öffnen der aktuellen Auskunft und
    // bleibt nicht aus einem früheren Öffnen stehen.
    auskunft = { portabel: true, datenOrdner: DATEN_ORDNER };
    await dialogs.showAbout();
    auskunft = { portabel: false, datenOrdner: null };
    await dialogs.showAbout();
    expect(block().hidden).toBe(true);
    expect(pfad().textContent).toBe('');
  });
});

describe('Über-Dialog: Knopf «Daten-Ordner öffnen» (4T-001993)', () => {
  it('ruft das Öffnen ohne jeden Wert auf, auch wenn er ein Ereignis bekommt', async () => {
    // 4T-001993 (AK3): Welcher Ordner aufgeht, bestimmt allein der
    // Hauptprozess; der Anzeige-Prozess reicht keinen Pfad weiter.
    await dialogs.oeffneDatenOrdner(new Event('click'));
    expect(oeffneDatenOrdner).toHaveBeenCalledTimes(1);
    expect(oeffneDatenOrdner.mock.calls[0]).toEqual([]);
  });

  it('fängt einen Fehlschlag ab, statt ihn weiterzuwerfen', async () => {
    // 4T-001993: Ein Klick darf keine unbehandelte Ablehnung hinterlassen.
    oeffneDatenOrdner.mockImplementationOnce(async () => {
      throw new Error('kaputt');
    });
    expect(await dialogs.oeffneDatenOrdner()).toEqual({ ok: false, error: 'kaputt' });
  });
});
