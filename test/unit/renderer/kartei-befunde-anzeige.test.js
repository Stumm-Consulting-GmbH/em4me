// @vitest-environment jsdom
// 4T-002404 (Epic 3E-000266, F3 A; Story 4S-001126, AK1, AK6): Die Anzeige der
// Befunde einer Karteikarte nach dem Speichern — der Satz der Statusleiste, der
// Hinweis je Feld im Eigenschafts-Bereich, die Markierung der Dateikopf-Zeile
// und ihr Wegfall nach dem Beheben, dazu der Aus-Zustand der Erweiterung
// «Datenbank».
//
// Gemessen wird die ANZEIGE aus einem gegebenen Ergebnis des Speicherns; die
// Prüfung selbst prüft `db-kartei-speicher-pruefung.test.js`, den Weg durch die
// laufende Anwendung der Ablauf-Fall `DB-KAS-01`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));

const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const lebenszyklus =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');
const anzeige = await import('../../../src/renderer/modules/database/karteikarte-befunde.js');
const { applyFrontmatterLine } = await import('../../../src/renderer/modules/frontmatter-line.js');

const PFAD = 'C:\\Bereich\\Autoren\\Umberto Eco.md';

// Zwei Befunde in der Gestalt der Prüfung im Haupt-Prozess.
const TYP = {
  code: 'konsistenzTypVerletzt',
  tabelle: 'Authors',
  feld: 'born',
  felder: null,
  wert: 'unbekannt',
  zieltabelle: null,
  kennungen: null,
};
const DUBLETTE = {
  code: 'konsistenzSchluesselDoppelt',
  tabelle: 'Authors',
  feld: null,
  felder: ['name'],
  wert: 'Umberto Eco',
  zieltabelle: null,
  kennungen: ['r-00003', 'r-00004'],
};

// Felder des Eigenschafts-Bereichs in der Gestalt von `buildPropertyFieldDom`.
function felder(...namen) {
  const behaelter = document.createElement('div');
  behaelter.className = 'properties-fields';
  for (const name of namen) {
    const feld = document.createElement('div');
    feld.className = 'properties-field';
    const kopf = document.createElement('div');
    kopf.className = 'properties-field-head';
    const eingabe = document.createElement('input');
    eingabe.className = 'properties-field-key';
    eingabe.value = name;
    kopf.appendChild(eingabe);
    feld.appendChild(kopf);
    behaelter.appendChild(feld);
  }
  return behaelter;
}

// Die gezeichnete Dateikopf-Zeile, wie die Pipeline sie liefert.
function gezeichnet() {
  const container = document.createElement('article');
  container.innerHTML =
    '<div class="frontmatter-block"><button type="button" class="frontmatter-header">' +
    '<span class="frontmatter-label">Properties</span>' +
    '<span class="frontmatter-count" data-fm-count="3"></span></button><pre></pre></div>';
  return container;
}

function hinweisVon(behaelter, name) {
  const feld = [...behaelter.querySelectorAll('.properties-field')].find(
    (f) => f.querySelector('.properties-field-key').value === name,
  );
  return feld.querySelector('.properties-field-kartei-hint');
}

beforeEach(async () => {
  await lebenszyklus.applyExtensionsState([], { persist: false });
  anzeige.verwirfKarteiBefunde(PFAD);
});

describe('Anzeige der Befunde einer Karteikarte (4T-002404, F3 A)', () => {
  it('meldet die Zahl der Befunde und ob sie sich geändert haben', () => {
    expect(anzeige.uebernimmKarteiBefunde(PFAD, [TYP])).toEqual({ anzahl: 1, geaendert: true });
    expect(anzeige.uebernimmKarteiBefunde(PFAD, [TYP])).toEqual({ anzahl: 1, geaendert: false });
    expect(anzeige.karteiBefundMeldung(1)).toBe(de['database.card.savedFindingsOne']);
    expect(anzeige.karteiBefundMeldung(2)).toContain('2 Befunde');
  });

  it('zeichnet den Hinweis an den betroffenen Feldern, und nur dort', () => {
    anzeige.uebernimmKarteiBefunde(PFAD, [TYP, DUBLETTE]);
    const behaelter = felder('name', 'born', 'notiz');
    anzeige.zeichneKarteiFeldHinweise(behaelter, PFAD);
    expect(hinweisVon(behaelter, 'born').title).toContain('«unbekannt»');
    expect(hinweisVon(behaelter, 'name').title).toContain('«Umberto Eco»');
    expect(hinweisVon(behaelter, 'notiz')).toBeNull();
  });

  it('markiert die Dateikopf-Zeile beim Zeichnen mit dem Pfad, nicht ohne ihn', () => {
    anzeige.uebernimmKarteiBefunde(PFAD, [TYP]);
    const mitPfad = gezeichnet();
    applyFrontmatterLine(mitPfad, PFAD);
    const marke = mitPfad.querySelector('.frontmatter-kartei-befunde');
    expect(marke.dataset.karteiBefunde).toBe('1');
    expect(marke.title).toContain(de['database.card.findingsTitle']);
    // Die Interaktion der Zeile bleibt: die lokalisierte Feldanzahl steht.
    expect(mitPfad.querySelector('.frontmatter-count').textContent).toContain('3');
    // Das Block-Widget des Live-Modus ruft ohne Pfad und bleibt unmarkiert.
    const ohnePfad = gezeichnet();
    applyFrontmatterLine(ohnePfad);
    expect(ohnePfad.querySelector('.frontmatter-kartei-befunde')).toBeNull();
  });

  it('nimmt Hinweis und Markierung nach dem Beheben zurück', () => {
    anzeige.uebernimmKarteiBefunde(PFAD, [TYP]);
    const behaelter = felder('born');
    const container = gezeichnet();
    anzeige.zeichneKarteiFeldHinweise(behaelter, PFAD);
    anzeige.markiereKarteiDateikopf(container, PFAD);
    expect(hinweisVon(behaelter, 'born')).not.toBeNull();
    // Erneutes Speichern mit regelkonformem Dateikopf: leere Liste.
    expect(anzeige.uebernimmKarteiBefunde(PFAD, [])).toEqual({ anzahl: 0, geaendert: true });
    anzeige.zeichneKarteiFeldHinweise(behaelter, PFAD);
    anzeige.markiereKarteiDateikopf(container, PFAD);
    expect(hinweisVon(behaelter, 'born')).toBeNull();
    expect(container.querySelector('.frontmatter-kartei-befunde')).toBeNull();
  });

  it('zeigt im Aus-Zustand der Erweiterung «Datenbank» nichts', async () => {
    anzeige.uebernimmKarteiBefunde(PFAD, [TYP]);
    await lebenszyklus.applyExtensionsState(['database'], { persist: false });
    const behaelter = felder('born');
    const container = gezeichnet();
    applyFrontmatterLine(container, PFAD);
    anzeige.zeichneKarteiFeldHinweise(behaelter, PFAD);
    expect(anzeige.karteiBefundeVon(PFAD)).toEqual([]);
    expect(hinweisVon(behaelter, 'born')).toBeNull();
    expect(container.querySelector('.frontmatter-kartei-befunde')).toBeNull();
    expect(anzeige.uebernimmKarteiBefunde(PFAD, [TYP]).anzahl).toBe(0);
  });
});
