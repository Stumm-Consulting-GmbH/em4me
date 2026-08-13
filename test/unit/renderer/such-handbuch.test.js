// @vitest-environment jsdom
// 4T-0758 (Epic 3E-0142): Handbuch als Lieferant durchsuchbarer Texte.
//
// Geprüft wird, was die Suche über das ganze Handbuch braucht: alle Seiten
// der Registry (auch die generierten, die kein Gegenstück auf der Platte
// haben), die Bindung des Vorrats an die Sprache und ein Verhalten ohne
// Absturz, wenn der Sammel-Abruf scheitert.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';
import { MANUAL_PAGES } from '../../../src/shared/manual/manual-pages.js';

// Der Sammel-Abruf wird pro Test gestellt; api.js bindet dasselbe Objekt,
// das der Stub an window haengt.
let abrufe = [];
let antwort = (locale) =>
  MANUAL_PAGES.filter((p) => p.source === 'bundled').map((p) => ({
    id: p.id,
    text: `Inhalt von ${p.id} in ${locale}`,
  }));

window.api.getAllManualPages = async (locale) => {
  abrufe.push(locale);
  return antwort(locale);
};

const { handbuchEintraege, verwirfHandbuchVorrat } =
  await import('../../../src/renderer/modules/search/search-manual.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

describe('such-handbuch (4T-0758)', () => {
  beforeEach(() => {
    abrufe = [];
    verwirfHandbuchVorrat();
    state.language = 'de';
  });

  it('liefert jede Seite der Registry, auch die generierten', async () => {
    const eintraege = await handbuchEintraege();
    const ids = eintraege.map((e) => e.gruppe);

    for (const page of MANUAL_PAGES) {
      expect(ids, `Seite fehlt: ${page.id}`).toContain(page.id);
    }
    // Die beiden generierten Seiten kommen nicht über den IPC, sondern aus
    // den Generatoren; ihr Text darf deshalb nicht leer sein.
    for (const id of ['functions', 'shortcuts']) {
      const eintrag = eintraege.find((e) => e.gruppe === id);
      expect(eintrag.text.length, `generierte Seite leer: ${id}`).toBeGreaterThan(0);
    }
  });

  it('behält die Reihenfolge der Registry bei', async () => {
    const eintraege = await handbuchEintraege();
    expect(eintraege.map((e) => e.gruppe)).toEqual(MANUAL_PAGES.map((p) => p.id));
  });

  it('trägt Titel und Herkunft für die Trefferliste', async () => {
    const eintraege = await handbuchEintraege();
    for (const e of eintraege) {
      expect(e.quelle).toBe('manual');
      expect(typeof e.titel).toBe('string');
      expect(e.titel.length).toBeGreaterThan(0);
    }
  });

  it('holt die Datei-Inhalte nur einmal je Sprache', async () => {
    await handbuchEintraege();
    await handbuchEintraege();
    expect(abrufe).toEqual(['de']);
  });

  it('holt nach einem Sprachwechsel neu', async () => {
    await handbuchEintraege();
    state.language = 'fr';
    const eintraege = await handbuchEintraege();
    expect(abrufe).toEqual(['de', 'fr']);
    const erste = eintraege.find((e) => e.gruppe === 'overview');
    expect(erste.text).toContain('in fr');
  });

  it('erzeugt die generierten Seiten bei jedem Lauf neu', async () => {
    // Sie hängen an Tastenkürzel-Overrides und geschalteten Erweiterungen;
    // ein gehaltener Vorrat müsste dafür invalidiert werden. Stattdessen
    // entstehen sie jedes Mal frisch, deshalb darf der zweite Lauf sie
    // auch ohne IPC-Abruf liefern.
    await handbuchEintraege();
    const zweite = await handbuchEintraege();
    expect(abrufe).toEqual(['de']);
    expect(zweite.find((e) => e.gruppe === 'shortcuts').text.length).toBeGreaterThan(0);
  });

  it('liefert bei gescheitertem Abruf wenigstens die generierten Seiten', async () => {
    antwort = () => {
      throw new Error('IPC kaputt');
    };
    const eintraege = await handbuchEintraege();
    expect(eintraege.map((e) => e.gruppe)).toEqual(['functions', 'shortcuts']);

    // Der Fehlschlag darf sich nicht als leerer Vorrat festsetzen.
    antwort = (locale) =>
      MANUAL_PAGES.filter((p) => p.source === 'bundled').map((p) => ({
        id: p.id,
        text: `Inhalt von ${p.id} in ${locale}`,
      }));
    const danach = await handbuchEintraege();
    expect(danach.length).toBe(MANUAL_PAGES.length);
  });
});
