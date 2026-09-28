// @vitest-environment jsdom
// 4T-001955 (Epic 3E-000319): Unit-Tests des Einstellungs-Abschnitts
// «Kanban-Tafel» — Registrierung, Aufbau mit den fünf globalen Vorgaben,
// Entwurf und «geändert», Übernehmen über denselben Speicher wie die
// Menü-Häkchen.
//
// Muster: settings-page.test.js (api-Stub vor dem Import, Abschnitt aus der
// Registry der Seite).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
await import('../../../src/renderer/modules/settings/kanban-settings.js');
const { kanbanAnzeigeStand, uebernimmKanbanAnzeige } =
  await import('../../../src/renderer/modules/kanban/kanban-anzeige-schalter.js');
const { KANBAN_VORGABEN, normalisiereKanbanAnzeige } =
  await import('../../../src/shared/kanban-anzeige.js');

const abschnitt = () => settingsPage.settingsSections().find((s) => s.id === 'kanban');

function zeichne(draft = {}) {
  const container = document.createElement('div');
  abschnitt().render(container, draft);
  return { container, draft };
}

beforeEach(() => {
  // Der Stand der Schalter ist Modul-Zustand; jeder Fall beginnt bei den Vorgaben.
  for (const v of KANBAN_VORGABEN) uebernimmKanbanAnzeige(v.schluessel, v.vorgabe);
  window.api.setSetting = vi.fn(async () => {});
});

describe('Abschnitt «Kanban-Tafel» der Einstellungen (4T-001955, AK1)', () => {
  it('ist registriert und trägt Titel, Aufbau, Übernehmen und «geändert»', () => {
    const s = abschnitt();
    expect(s).toBeTruthy();
    expect(s.titleKey).toBe('settings.kanban.title');
    expect(typeof s.render).toBe('function');
    expect(typeof s.apply).toBe('function');
    expect(typeof s.dirty).toBe('function');
  });

  it('zeigt die fünf globalen Vorgaben mit ihren gespeicherten Werten', () => {
    uebernimmKanbanAnzeige('kanban.tagsAmFuss', true);
    const { container } = zeichne();
    const zeilen = [...container.querySelectorAll('.settings-row')];
    expect(zeilen.map((z) => z.querySelector('label').textContent)).toEqual([
      'settings.kanban.tagsAmFuss',
      'settings.kanban.terminRelativ',
      'settings.kanban.archivZeitstempel',
      'settings.kanban.archivObergrenze',
      'settings.kanban.datumTagesnotiz',
    ]);
    const felder = zeilen.map((z) => z.querySelector('input'));
    expect(felder.map((f) => f.type)).toEqual([
      'checkbox',
      'checkbox',
      'checkbox',
      'number',
      'checkbox',
    ]);
    expect(felder[0].checked).toBe(true);
    expect(felder[1].checked).toBe(false);
    expect(felder[2].checked).toBe(true);
    expect(felder[3].value).toBe('100');
    expect(felder[4].checked).toBe(false);
  });

  it('eine Änderung macht den Entwurf «geändert»; Übernehmen schreibt nur sie', async () => {
    const { container, draft } = zeichne();
    expect(abschnitt().dirty(draft)).toBe(false);
    const felder = [...container.querySelectorAll('input')];
    felder[4].checked = true;
    felder[4].dispatchEvent(new window.Event('change'));
    felder[3].value = '0';
    felder[3].dispatchEvent(new window.Event('change'));
    expect(abschnitt().dirty(draft)).toBe(true);

    await abschnitt().apply(draft);
    expect(window.api.setSetting.mock.calls).toEqual([
      ['kanban.archivObergrenze', 0],
      ['kanban.datumTagesnotiz', true],
    ]);
    // Derselbe Speicher wie die Menü-Häkchen: der laufende Stand zieht nach.
    expect(kanbanAnzeigeStand()['kanban.datumTagesnotiz']).toBe(true);
    expect(kanbanAnzeigeStand()['kanban.archivObergrenze']).toBe(0);
    expect(abschnitt().dirty(draft)).toBe(false);
  });

  it('eine unbrauchbare Zahl fällt auf die Vorgabe zurück', () => {
    const { container, draft } = zeichne();
    const zahl = container.querySelector('input[type="number"]');
    zahl.value = 'abc';
    zahl.dispatchEvent(new window.Event('change'));
    expect(normalisiereKanbanAnzeige(draft.kanban)['kanban.archivObergrenze']).toBe(100);
    expect(abschnitt().dirty(draft)).toBe(false);
  });

  it('ohne Aufbau ist nichts geändert und Übernehmen schreibt nichts', async () => {
    const draft = {};
    expect(abschnitt().dirty(draft)).toBe(false);
    await abschnitt().apply(draft);
    expect(window.api.setSetting).not.toHaveBeenCalled();
  });
});
