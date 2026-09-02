// @vitest-environment jsdom
// 4T-001341 (Epic 3E-000238): Ansicht beim Wechsel in den Bearbeiten-Modus.
//
// Bis 4T-001341 führte der Stift aus der Lese-Ansicht fest in die geteilte
// Ansicht; wer überwiegend in der Live-Ansicht arbeitet, schaltete danach jedes
// Mal von Hand weiter. Geprüft werden hier die Entscheidung (prozessneutral)
// und der Aufbau der Einstellung; dass der Stift tatsächlich in die gewählte
// Ansicht führt, misst die E2E-Ebene — die Lehre aus 4T-001339, wo eine grüne
// Unit-Prüfung eine wirkungslose Funktion deckte.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './api-stub.js';

import {
  DEFAULT_EDIT_VIEW_MODE,
  EDIT_VIEW_MODES,
  VIEW_MODES,
  zielAnsichtDesAenderungsmodus,
} from '../../../src/renderer/modules/views/view-modes.js';

const settingsPage = await import('../../../src/renderer/modules/settings/settings-page.js');
const systemPages = await import('../../../src/renderer/modules/app/system-pages.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');

// Muster aus settings-page.test.js: onOpen baut den Entwurf, mount das DOM.
function mountBehaviorSection() {
  const pageDef = systemPages.systemPageById(settingsPage.SETTINGS_PAGE_ID);
  pageDef.onOpen();
  const container = document.createElement('div');
  document.body.appendChild(container);
  pageDef.mount(container);
  container.querySelector('.settings-nav-entry[data-section-id="behavior"]').click();
  return container;
}

afterEach(() => {
  state.editViewMode = DEFAULT_EDIT_VIEW_MODE;
  document.body.innerHTML = '';
});

describe('Ziel-Ansicht des Bearbeiten-Modus (4T-001341)', () => {
  it('gibt jede der drei Bearbeitungs-Ansichten unveraendert zurueck', () => {
    for (const modus of EDIT_VIEW_MODES) {
      expect(zielAnsichtDesAenderungsmodus(modus)).toBe(modus);
    }
  });

  it('faellt ohne Einstellung auf die bisherige Verdrahtung zurueck', () => {
    // AK2: Ein Bestandsprofil ohne die Einstellung verhaelt sich unveraendert.
    expect(zielAnsichtDesAenderungsmodus(undefined)).toBe('split');
    expect(zielAnsichtDesAenderungsmodus(null)).toBe('split');
    expect(zielAnsichtDesAenderungsmodus('')).toBe('split');
  });

  it('faellt bei einem Modus zurueck, in dem nicht bearbeitet wird', () => {
    // Die Lese-Ansicht ist der Ausgangspunkt des Wechsels, die Karte kein
    // Editor-Modus; beide waeren als Ziel sinnlos.
    expect(zielAnsichtDesAenderungsmodus('rendered')).toBe('split');
    expect(zielAnsichtDesAenderungsmodus('mindmap')).toBe('split');
    expect(zielAnsichtDesAenderungsmodus('unsinn')).toBe('split');
  });

  it('die Ziel-Liste bleibt eine Teilmenge der bekannten Modi', () => {
    for (const modus of EDIT_VIEW_MODES) expect(VIEW_MODES).toContain(modus);
    expect(EDIT_VIEW_MODES).not.toContain('rendered');
    expect(EDIT_VIEW_MODES).not.toContain('mindmap');
    expect(EDIT_VIEW_MODES).toContain(DEFAULT_EDIT_VIEW_MODE);
  });
});

describe('Einstellung im Bereich Verhalten (4T-001341)', () => {
  it('steht als Auswahlliste mit genau den drei Bearbeitungs-Ansichten', () => {
    const container = mountBehaviorSection();
    const select = container.querySelector('#settings-edit-view-mode');
    expect(select, 'Auswahlliste fehlt im Verhaltens-Bereich').not.toBeNull();
    expect([...select.options].map((o) => o.value)).toEqual(EDIT_VIEW_MODES);
  });

  it('steht neben der Oeffnen-Ansicht und traegt eine eigene Beschriftung', () => {
    const container = mountBehaviorSection();
    const oeffnen = container.querySelector('#settings-default-view-mode');
    const wechsel = container.querySelector('#settings-edit-view-mode');
    // Die beiden Einstellungen gehoeren zusammen und stehen deshalb
    // unmittelbar beieinander; ihre Beschriftungen unterscheiden sie.
    expect(oeffnen.closest('.settings-row').nextElementSibling).toBe(
      wechsel.closest('.settings-row'),
    );
    const beschriftung = (el) => el.closest('.settings-row').textContent.trim();
    expect(beschriftung(wechsel)).not.toBe(beschriftung(oeffnen));
    expect(beschriftung(wechsel)).not.toBe('');
  });

  it('ist mit dem Laufzeit-Wert vorbelegt', () => {
    state.editViewMode = 'live';
    const container = mountBehaviorSection();
    expect(container.querySelector('#settings-edit-view-mode').value).toBe('live');
  });

  it('ist ohne gespeicherten Wert mit der Voreinstellung vorbelegt', () => {
    const container = mountBehaviorSection();
    expect(container.querySelector('#settings-edit-view-mode').value).toBe(DEFAULT_EDIT_VIEW_MODE);
  });
});

describe('Keine feste Verdrahtung mehr im Wechsel (4T-001341)', () => {
  it('toggleEditMode setzt die Ansicht nicht mehr auf einen festen Wert', () => {
    // Der Regressions-Wächter des Befunds: Vor 4T-001341 stand hier
    // `tab.viewMode = 'split'`. Ein Rückfall darauf wäre unsichtbar, solange
    // die Voreinstellung ebenfalls „geteilt" ist — genau die Lage, in der ein
    // Fehler still in die Auslieferung geht.
    const quelle = readFileSync(path.join(wurzel, 'src/renderer/modules/views/views.js'), 'utf8');
    const abschnitt = quelle.slice(quelle.indexOf('export function toggleEditMode'));
    expect(abschnitt).toContain('zielAnsichtDesAenderungsmodus');
    expect(abschnitt).not.toMatch(/tab\.viewMode = 'split'/);
  });

  it('Handbuch- und System-Seiten bleiben vom Wechsel ausgenommen', () => {
    // AK7: Der Ausstieg steht **vor** der Ansichts-Wahl und bleibt es. Stünde
    // er dahinter, setzte die neue Einstellung auf einer Handbuch-Seite eine
    // Ansicht, die der Stift dort gar nicht anbieten darf.
    const quelle = readFileSync(path.join(wurzel, 'src/renderer/modules/views/views.js'), 'utf8');
    const abschnitt = quelle.slice(quelle.indexOf('export function toggleEditMode'));
    const ausstieg = abschnitt.indexOf('tab.manualPage || tab.systemPage');
    const wahl = abschnitt.indexOf('zielAnsichtDesAenderungsmodus');
    expect(ausstieg).toBeGreaterThan(-1);
    expect(ausstieg).toBeLessThan(wahl);
  });
});
