// @vitest-environment jsdom
// 4T-002191 (Epic 3E-000353), Teil 1: Hinweis in der Pflege, solange Anker und
// Maßstab einer Zeitrechnung leer sind und der Block eine weitere enthält
// (Entscheidung des Product Owners vom 2026-10-10, Weg A′).
//
// Ohne Anker und Maßstab setzt das Einlesen die Ausgangswerte (Minimal-Tupel,
// 1 zu 1); zwei so angelegte Zeitrechnungen beginnen am selben Punkt der
// Block-Achse, und eine Umrechnung zwischen ihnen sieht aus wie jede andere.
// Leere Felder sind der einzige Zustand, der sich sicher von einer bewussten
// Angabe und einer eingefügten Vorlage unterscheidet: Eingelesene und
// eingefügte Zeitrechnungen tragen ihren Anker ausdrücklich. Der Hinweis ändert
// an der Rechnung nichts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { CALENDAR_TEMPLATES } from '../../../src/shared/calendar/calendar-templates.js';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');
const { t } = i18n;

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

const seitenStand = () => settingsPage.settingsPageStateForTests();

function gregorianisch() {
  const definition = CALENDAR_TEMPLATES.find((e) => e.id === 'gregorian').create(t);
  return { id: 'gregor', ...definition, name: 'Gregor' };
}

// Seiten-Lebenszyklus wie beim echten Öffnen (Muster 4T-002098).
function mountPage() {
  document.body.innerHTML = '';
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  return container;
}

// Gewartet wird auf den Zustand, nie auf eine Frist: Der Entwurf meldet
// selbst, wann die Kalender-Konfiguration da ist.
async function warteAufKalender() {
  for (let i = 0; i < 100; i += 1) {
    const draft = seitenStand().draft;
    if (draft && draft.calendar) return draft;
    await Promise.resolve();
  }
  throw new Error('Die Kalender-Konfiguration ist nicht im Entwurf angekommen.');
}

// Einstellungen öffnen, «Kalender-Systeme» wählen und den Block «Welt»
// öffnen; die Definitionen kommen so, wie sie der Hauptprozess liefert.
async function oeffneBlock(definitionen) {
  state.areaPath = 'C:/tmp/Welt';
  const config = normalizeCalendarConfig({
    blocks: [{ id: 'welt', name: 'Welt', calendars: definitionen }],
  });
  window.api.calendarGetConfig = vi.fn(async () => ({ hasArea: true, areaName: 'Welt', config }));
  const container = mountPage();
  await warteAufKalender();
  container.querySelector('.settings-nav-entry[data-section-id="calendarSystems"]').click();
  container.querySelector('#settings-calsys-block-open-0').click();
  return container;
}

const hinweis = (container, idx) => container.querySelector(`#settings-calsys-axis-unset-${idx}`);

const hinweisText = (name) => t('settings.calendar.axisUnsetHint').replace('{name}', name);

function eingabe(container, id, wert) {
  const feld = container.querySelector(`#${id}`);
  feld.value = wert;
  feld.dispatchEvent(new Event('input'));
}

afterEach(async () => {
  state.areaPath = null;
  delete window.api.calendarGetConfig;
  await lifecycle.applyExtensionsState([], { persist: false });
});

describe('4T-002191: Hinweis bei leeren Anker- und Maßstab-Feldern', () => {
  it('4T-002191: eine neu angelegte Zeitrechnung neben einer weiteren zeigt den Hinweis mit deren Namen', async () => {
    const container = await oeffneBlock([gregorianisch()]);
    container.querySelector('#settings-calsys-cal-add').click();
    const neu = hinweis(container, 1);
    expect(neu).not.toBeNull();
    expect(neu.hidden).toBe(false);
    expect(neu.textContent).toBe(hinweisText('Gregor'));
    // Die eingelesene Zeitrechnung trägt ihren Anker ausdrücklich: kein Hinweis.
    expect(hinweis(container, 0).hidden).toBe(true);
  });

  it('4T-002191: der Hinweis verschwindet, sobald ein Feld etwas enthält, auch die Ausgangswerte', async () => {
    const container = await oeffneBlock([gregorianisch()]);
    container.querySelector('#settings-calsys-cal-add').click();
    // Die neue Zeitrechnung hat eine Ebene, der Anker damit ein Feld.
    eingabe(container, 'settings-calsys-anchor-1-0', '1');
    expect(hinweis(container, 1).hidden).toBe(true);
    eingabe(container, 'settings-calsys-anchor-1-0', '');
    expect(hinweis(container, 1).hidden).toBe(false);
    eingabe(container, 'settings-calsys-scale-num-1', '1');
    expect(hinweis(container, 1).hidden).toBe(true);
    eingabe(container, 'settings-calsys-scale-num-1', '');
    eingabe(container, 'settings-calsys-scale-den-1', '1');
    expect(hinweis(container, 1).hidden).toBe(true);
    eingabe(container, 'settings-calsys-scale-den-1', ' ');
    expect(hinweis(container, 1).hidden).toBe(false);
  });

  it('4T-002191: eine einzelne Zeitrechnung im Block zeigt keinen Hinweis', async () => {
    const container = await oeffneBlock([]);
    container.querySelector('#settings-calsys-cal-add').click();
    expect(hinweis(container, 0).hidden).toBe(true);
    // Mit der zweiten neu angelegten zeigen beide den Hinweis auf die andere.
    container.querySelector('#settings-calsys-cal-add').click();
    eingabe(container, 'settings-calsys-cal-name-1', 'Zweite');
    expect(hinweis(container, 0).hidden).toBe(false);
    expect(hinweis(container, 1).hidden).toBe(false);
    expect(hinweis(container, 1).textContent).toBe(hinweisText(t('settings.calendar.calUntitled')));
  });

  it('4T-002191: eine eingefügte Vorlage zeigt keinen Hinweis, auch neben einer weiteren', async () => {
    const container = await oeffneBlock([gregorianisch()]);
    for (const id of ['japanese', 'julian']) {
      const menue = container.querySelector('#settings-calsys-cal-template');
      menue.value = id;
      menue.dispatchEvent(new Event('change'));
    }
    const kalender = seitenStand().draft.calendar.blocks[0].calendars;
    expect(kalender).toHaveLength(3);
    for (const idx of [0, 1, 2]) expect(hinweis(container, idx).hidden).toBe(true);
  });

  it('4T-002191: ohne die Erweiterung «Kalender-Systeme» gibt es weder Bereich noch Hinweis', async () => {
    // Nicht-Vakuitäts-Probe: eingeschaltet erscheint der Hinweis.
    const an = await oeffneBlock([gregorianisch()]);
    an.querySelector('#settings-calsys-cal-add').click();
    expect(hinweis(an, 1).hidden).toBe(false);
    await lifecycle.applyExtensionsState(['custom-calendars'], { persist: false });
    const aus = mountPage();
    await warteAufKalender();
    expect(aus.querySelector('.settings-nav-entry[data-section-id="calendarSystems"]')).toBeNull();
    expect(aus.querySelector('[id^="settings-calsys-axis-unset-"]')).toBeNull();
  });
});
