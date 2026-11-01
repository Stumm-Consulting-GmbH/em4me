// @vitest-environment jsdom
// 4T-002361 (Epic 3E-000371, Entscheidung F3): Der Einstellungs-Bereich
// «Kalender-Systeme» nennt über der Liste die Zahl der Zeitrechnungen, die
// diese Programmfassung nicht darstellen kann, und vergibt beim Anwenden keine
// Kennung, die eine solche Zeitrechnung in der Bereichsdatei schon belegt.
import { describe, it, expect, afterEach, vi } from 'vitest';
import './api-stub.js';
import de from '../../../src/i18n/de.json';

global.fetch = vi.fn(async () => ({ ok: true, json: async () => de }));
const i18n = await import('../../../src/renderer/i18n.js');
await i18n.loadTranslations('de');

const { readCalendarFromConfig } =
  await import('../../../src/renderer/modules/settings/settings-calendar-model.js');
const { renderCalendarSection, applyCalendarSection } =
  await import('../../../src/renderer/modules/settings/settings-calendar-section.js');

// Antwort des Lese-Handlers, wie sie der Hauptprozess liefert.
async function geladen(antwort) {
  window.api.calendarGetConfig = vi.fn(async () => ({
    ok: true,
    hasArea: true,
    areaName: 'Welt',
    config: { blocks: [{ id: 'welt', name: 'Welt', calendars: [] }] },
    ...antwort,
  }));
  const { draft, snapshot } = await readCalendarFromConfig();
  return { calendar: draft, calendarSnapshot: snapshot };
}

function zeichne(entwurf) {
  document.body.innerHTML = '';
  renderCalendarSection(document.body, entwurf);
  return document.getElementById('settings-calsys-hidden');
}

afterEach(() => {
  delete window.api.calendarGetConfig;
  delete window.api.calendarSetAreaConfig;
  document.body.innerHTML = '';
});

describe('Hinweis auf nicht darstellbare Zeitrechnungen (4T-002361)', () => {
  it('zeigt bei mehreren die Mehrzahl über der Block-Liste', async () => {
    const zeile = zeichne(await geladen({ hiddenCalendars: 3 }));
    expect(zeile.textContent).toBe(
      'Dieser Bereich enthält 3 Zeitrechnungen, die diese Programmfassung nicht darstellen kann. Sie bleiben in der Bereichsdatei erhalten.',
    );
    // Über der Liste: vor der Gruppen-Überschrift der Blöcke.
    const ueberschrift = document.querySelector('.settings-export-group-title');
    expect(
      zeile.compareDocumentPosition(ueberschrift) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('zeigt bei einer die Einzahl', async () => {
    const zeile = zeichne(await geladen({ hiddenCalendars: 1 }));
    expect(zeile.textContent).toBe(
      'Dieser Bereich enthält eine Zeitrechnung, die diese Programmfassung nicht darstellen kann. Sie bleibt in der Bereichsdatei erhalten.',
    );
  });

  it('zeigt nichts ohne solche Zeitrechnungen und bei einer Antwort ohne Zahl', async () => {
    expect(zeichne(await geladen({ hiddenCalendars: 0 }))).toBeNull();
    expect(zeichne(await geladen({}))).toBeNull();
  });

  it('vergibt beim Anwenden keine Kennung, die eine verborgene Zeitrechnung belegt', async () => {
    const entwurf = await geladen({
      hiddenCalendars: 1,
      reservedIds: { blocks: [], calendars: { welt: ['mondjahr'] } },
    });
    const block = entwurf.calendar.blocks[0];
    block.calendars.push({
      id: '',
      name: 'Mondjahr',
      derived: {
        fromId: '@standard',
        zeroSegs: ['2000', '1', '1'],
        depth: '',
        labelBefore: '',
        labelAfter: '',
      },
    });
    window.api.calendarSetAreaConfig = vi.fn(async () => ({ ok: true }));
    window.api.calendarConfirmDependents = vi.fn(async () => true);
    await applyCalendarSection(entwurf);
    expect(block.calendars[0].id).toBe('mondjahr-2');
    expect(window.api.calendarSetAreaConfig).toHaveBeenCalledTimes(1);
  });
});
