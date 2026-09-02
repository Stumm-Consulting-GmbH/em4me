// @vitest-environment jsdom
// 4T-001308 (Epic 3E-000235): Nachlauf-Schaltflaeche am Zeilenende eines
// Kontextmenue-Eintrags.
//
// Sie traegt eine zweite Handlung am selben Eintrag (im Mitglieder-Menue einer
// Reiter-Gruppe das Schliessen einer Datei). Zwei Eigenschaften machen sie
// brauchbar, und beide sind hier geprueft: Sie loest die Haupt-Aktion des
// Eintrags NICHT aus, und sie laesst das Menue offen, damit mehrere Griffe
// hintereinander moeglich bleiben.
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

// Reihenfolge der Importe ist hier nicht beliebig: Die Menue-Helfer stehen in
// einem Modul-Kreis mit den Reiter-Menues, die sich beim Laden als
// Schliess-Haken anmelden. Wer die Helfer zuerst laedt, betritt den Kreis an
// der falschen Stelle und trifft ihre noch nicht angelegte Haken-Liste.
const { contextMenu } = await import('../../../src/renderer/modules/app/app-state.js');
const { appendContextMenuItem } =
  await import('../../../src/renderer/modules/dialogs/context-menu-utils.js');

function eintragBauen(item) {
  contextMenu.innerHTML = '';
  contextMenu.hidden = false;
  appendContextMenuItem(contextMenu, item);
  return contextMenu.querySelector('.context-menu-item');
}

describe('Nachlauf-Schaltflaeche im Kontextmenue (4T-001308)', () => {
  beforeEach(() => {
    contextMenu.innerHTML = '';
    contextMenu.hidden = true;
  });

  it('erscheint als eigene Schaltflaeche mit Beschriftung und Merkzettel', () => {
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      action: () => {},
      trailing: { text: '×', tooltip: 'Diesen Reiter schließen', action: () => {} },
    });
    const knopf = eintrag.querySelector('.context-menu-trailing');
    expect(knopf).toBeTruthy();
    expect(knopf.tagName).toBe('BUTTON');
    expect(knopf.textContent).toBe('×');
    expect(knopf.title).toBe('Diesen Reiter schließen');
    // Ueber die Tastatur erreichbar und benannt: ein <button> ist von sich aus
    // fokussierbar, die Beschriftung kommt aus dem Merkzettel.
    expect(knopf.getAttribute('aria-label')).toBe('Diesen Reiter schließen');
    expect(eintrag.classList.contains('context-menu-item-trailing')).toBe(true);
  });

  it('loest beim Klick nur die eigene Handlung aus, nicht die des Eintrags', () => {
    const gerufen = [];
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      action: () => gerufen.push('eintrag'),
      trailing: { action: () => gerufen.push('nachlauf') },
    });
    eintrag.querySelector('.context-menu-trailing').click();
    expect(gerufen).toEqual(['nachlauf']);
  });

  it('laesst das Menue offen, damit mehrere Griffe moeglich bleiben', () => {
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      action: () => {},
      trailing: { action: () => {} },
    });
    eintrag.querySelector('.context-menu-trailing').click();
    expect(contextMenu.hidden).toBe(false);
  });

  it('der uebrige Teil des Eintrags loest weiterhin die Haupt-Aktion aus', () => {
    const gerufen = [];
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      action: () => gerufen.push('eintrag'),
      trailing: { action: () => gerufen.push('nachlauf') },
    });
    eintrag.click();
    expect(gerufen).toEqual(['eintrag']);
    // Die Haupt-Aktion schliesst das Menue wie bisher.
    expect(contextMenu.hidden).toBe(true);
  });

  it('bleibt ohne Nachlauf-Angabe unveraendert', () => {
    const eintrag = eintragBauen({ label: 'Notiz.md', action: () => {} });
    expect(eintrag.querySelector('.context-menu-trailing')).toBeNull();
    expect(eintrag.classList.contains('context-menu-item-trailing')).toBe(false);
  });

  it('ignoriert eine Nachlauf-Angabe ohne Handlung, statt einen toten Knopf zu bauen', () => {
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      action: () => {},
      trailing: { text: '×' },
    });
    expect(eintrag.querySelector('.context-menu-trailing')).toBeNull();
  });

  it('vertraegt sich mit der Haekchen-Spalte, die das Mitglieder-Menue nutzt', () => {
    const eintrag = eintragBauen({
      label: 'Notiz.md',
      checked: true,
      action: () => {},
      trailing: { action: () => {} },
    });
    expect(eintrag.querySelector('.context-menu-check').textContent).toBe('✓');
    expect(eintrag.querySelector('.context-menu-trailing')).toBeTruthy();
    // Reihenfolge im Eintrag: Haekchen zuerst, Nachlauf zuletzt.
    expect(eintrag.firstElementChild.className).toBe('context-menu-check');
    expect(eintrag.lastElementChild.className).toBe('context-menu-trailing');
  });
});
