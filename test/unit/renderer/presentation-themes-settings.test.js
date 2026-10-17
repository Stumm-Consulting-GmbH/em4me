// @vitest-environment jsdom
// 4T-002282 (Epic 3E-000348): Unit-Tests des Einstellungs-Abschnitts
// «Folien-Themes» (AK1, AK2) — Registrierung an der Erweiterung, Verwaltung
// mit Neu aus Vorlage, Duplizieren, Umbenennen und Löschen nach der
// Namens-Regel, Slot-Zeilen mit Vorschau-Folie, die live mitgeht, und
// Speichern über den Schlüssel `presentationThemes`.
//
// Muster: kanban-settings.test.js (api-Stub vor dem Import, Abschnitt aus der
// Registry der Seite).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const modul =
  await import('../../../src/renderer/modules/settings/presentation-themes-settings.js');
const { eigeneThemes, setzeEigeneThemes } =
  await import('../../../src/renderer/modules/presentation/presentation-themes-stand.js');
const { internalExtensions } = await import('../../../src/shared/extensions/extensions.js');
const { FOLIEN_THEMES } = await import('../../../src/shared/presentation/presentation-themes.js');
const { normalisiereThemesZustand } =
  await import('../../../src/shared/presentation/presentation-eigene-themes.js');

const abschnitt = () =>
  settingsPage.allSettingsSections().find((s) => s.id === 'presentationThemes');

function zeichne(draft) {
  const container = document.createElement('div');
  abschnitt().render(container, draft);
  return container;
}

const FIRMA = { id: 'f1', name: 'Firma', basis: 'dark', slots: { accent: '#c0392b' } };

beforeEach(() => {
  setzeEigeneThemes({ custom: [] });
  window.api.setSetting = vi.fn(async () => {});
});

describe('Abschnitt «Folien-Themes»: Registrierung (4T-002282, AK1)', () => {
  it('ist registriert und trägt Titel, Prüfung, Übernehmen und «geändert»', () => {
    const s = abschnitt();
    expect(s).toBeTruthy();
    expect(s.titleKey).toBe('presentation.themes.titel');
    for (const haken of ['render', 'validate', 'apply', 'dirty']) {
      expect(typeof s[haken], haken).toBe('function');
    }
  });

  it('hängt an der Erweiterung presentation und steht damit im Block «Erweiterungen (intern)»', () => {
    const traeger = internalExtensions().filter((m) =>
      (m.settingsSections || []).includes('presentationThemes'),
    );
    expect(traeger.map((m) => m.id)).toEqual(['presentation']);
  });
});

describe('Verwaltung (AK1)', () => {
  it('ohne eigene Themes: Hinweis und «Neu» aus der Vorlage', () => {
    const draft = {};
    let c = zeichne(draft);
    expect(c.textContent).toContain('presentation.themes.keine');
    expect(c.querySelector('#settings-folien-theme-duplizieren')).toBeNull();
    c.querySelector('#settings-folien-theme-vorlage').value = 'dark';
    c.querySelector('#settings-folien-theme-neu').click();
    const liste = draft.presentationThemes.zustand.custom;
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      name: 'presentation.themes.neuerName',
      basis: 'dark',
      slots: {},
    });
    expect(draft.presentationThemes.aktivId).toBe(liste[0].id);
    expect(abschnitt().dirty(draft)).toBe(true);
    // Ein zweites «Neu» bekommt einen freien Namen.
    c = zeichne(draft);
    c.querySelector('#settings-folien-theme-neu').click();
    expect(liste.map((x) => x.name)).toEqual([
      'presentation.themes.neuerName',
      'presentation.themes.neuerName 2',
    ]);
  });

  it('zeigt den gespeicherten Katalog; Duplizieren und Löschen', () => {
    setzeEigeneThemes({ custom: [FIRMA] });
    const draft = {};
    let c = zeichne(draft);
    expect(c.querySelector('#settings-folien-theme-auswahl').value).toBe('f1');
    expect(c.querySelector('#settings-folien-theme-name').value).toBe('Firma');
    expect(abschnitt().dirty(draft)).toBe(false);
    c.querySelector('#settings-folien-theme-duplizieren').click();
    const liste = draft.presentationThemes.zustand.custom;
    expect(liste).toHaveLength(2);
    expect(liste[1]).toMatchObject({
      name: 'Firma presentation.themes.kopieZusatz',
      basis: 'dark',
      slots: { accent: '#c0392b' },
    });
    expect(draft.presentationThemes.aktivId).toBe(liste[1].id);
    c = zeichne(draft);
    c.querySelector('#settings-folien-theme-loeschen').click();
    expect(draft.presentationThemes.zustand.custom.map((x) => x.name)).toEqual(['Firma']);
  });

  it('Umbenennen nach der Namens-Regel: Befund sofort und beim Anwenden', () => {
    setzeEigeneThemes({
      custom: [FIRMA, { id: 'f2', name: 'Vortrag', basis: 'light', slots: {} }],
    });
    const draft = {};
    const c = zeichne(draft);
    const name = c.querySelector('#settings-folien-theme-name');
    const fehler = c.querySelector('.folien-themes-fehler');
    for (const [eingabe, befund] of [
      ['', 'presentation.themes.nameLeer'],
      ['Accent', 'presentation.themes.nameMitgeliefert'],
      [' vortrag ', 'presentation.themes.nameVergeben'],
    ]) {
      name.value = eingabe;
      name.dispatchEvent(new Event('input'));
      expect(fehler.hidden, eingabe).toBe(false);
      expect(fehler.textContent).toBe(befund);
      expect(abschnitt().validate(draft)).toContain(befund);
    }
    // Marp-Namen sind erlaubt (Entscheidung D2).
    name.value = 'gaia';
    name.dispatchEvent(new Event('input'));
    expect(fehler.hidden).toBe(true);
    expect(abschnitt().validate(draft)).toBeNull();
    expect(draft.presentationThemes.zustand.custom[0].name).toBe('gaia');
  });
});

describe('Slot-Zeilen und Vorschau-Folie (AK2)', () => {
  it('eine Eingabe wird zur Abweichung, die Vorschau-Folie geht sofort mit', () => {
    setzeEigeneThemes({ custom: [FIRMA] });
    const draft = {};
    const c = zeichne(draft);
    const slide = c.querySelector('.folien-gestaltung-vorschau .presentation-slide');
    expect(slide).toBeTruthy();
    expect(slide.style.getPropertyValue('--slide-accent')).toBe('#c0392b');
    expect(slide.style.getPropertyValue('--slide-background')).toBe(FOLIEN_THEMES.dark.background);
    expect(c.querySelector('.presentation-slide h1').textContent).toBe(
      'presentation.themes.vorschauTitel',
    );
    const feld = c.querySelector('.folien-gestaltung-zeile[data-slot="accent"] [data-teil="text"]');
    feld.value = '#00aa00';
    feld.dispatchEvent(new Event('input'));
    expect(slide.style.getPropertyValue('--slide-accent')).toBe('#00aa00');
    expect(draft.presentationThemes.zustand.custom[0].slots).toEqual({ accent: '#00aa00' });
    // Zurücksetzen: die Basis gilt wieder, auch in der Vorschau.
    c.querySelector(
      '.folien-gestaltung-zeile[data-slot="accent"] [data-aktion="zuruecksetzen"]',
    ).click();
    expect(slide.style.getPropertyValue('--slide-accent')).toBe(FOLIEN_THEMES.dark.accent);
    expect(draft.presentationThemes.zustand.custom[0].slots).toEqual({});
  });

  it('Anwenden speichert normalisiert unter presentationThemes und zieht den Katalog nach', async () => {
    setzeEigeneThemes({ custom: [FIRMA] });
    const draft = {};
    const c = zeichne(draft);
    const feld = c.querySelector('.folien-gestaltung-zeile[data-slot="text"] [data-teil="text"]');
    feld.value = '#fefefe';
    feld.dispatchEvent(new Event('input'));
    // Ein Wert gleich der Basis ist keine Abweichung.
    const hg = c.querySelector(
      '.folien-gestaltung-zeile[data-slot="background"] [data-teil="text"]',
    );
    hg.value = FOLIEN_THEMES.dark.background;
    hg.dispatchEvent(new Event('input'));
    expect(abschnitt().dirty(draft)).toBe(true);
    await abschnitt().apply(draft);
    const erwartet = normalisiereThemesZustand({
      custom: [{ ...FIRMA, slots: { accent: '#c0392b', text: '#fefefe' } }],
    });
    expect(window.api.setSetting).toHaveBeenCalledWith('presentationThemes', erwartet);
    expect(erwartet.custom[0].slots).toEqual({ text: '#fefefe', accent: '#c0392b' });
    expect(eigeneThemes()).toEqual(erwartet.custom);
    expect(abschnitt().dirty(draft)).toBe(false);
  });

  it('ohne Änderung wird nicht geschrieben', async () => {
    setzeEigeneThemes({ custom: [FIRMA] });
    const draft = {};
    zeichne(draft);
    await abschnitt().apply(draft);
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });

  it('die Suche der Einstellungen findet Beschriftungen des Abschnitts', () => {
    setzeEigeneThemes({ custom: [FIRMA] });
    const c = zeichne({});
    const zeilen = [...c.querySelectorAll('.settings-row, .settings-hint')].map(
      (z) => z.textContent,
    );
    expect(zeilen.some((z) => z.includes('presentation.slot.accent'))).toBe(true);
    expect(zeilen.some((z) => z.includes('presentation.themes.hinweis'))).toBe(true);
  });
});

describe('freierName', () => {
  it('hängt eine Zahl an, bis der Name frei ist', () => {
    expect(modul.freierName('X', [])).toBe('X');
    expect(modul.freierName('X', [{ id: 'a', name: 'x' }])).toBe('X 2');
    expect(modul.freierName('dark', [])).toBe('dark 2');
  });
});
