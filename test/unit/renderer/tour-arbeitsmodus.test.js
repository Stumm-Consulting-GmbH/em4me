// @vitest-environment jsdom
// 4T-001881 (Epic 3E-000185, Story 4S-000992): Das Bedienelement der
// Tour-Station «Arbeitsmodus»
// (src/renderer/modules/tour/tour-arbeitsmodus.js).
//
// Prüfgegenstand ist die Stelle, an der sich diese Karte von jeder anderen
// unterscheidet: Sie trägt eine Wahl, die SOFORT wirkt — ohne Entwurf, ohne
// «Anwenden» und ohne die Tour zu beenden. Geprüft werden die drei
// Schaltflächen, die Vorwahl aus dem laufenden Schalter-Stand (beim ersten
// Start «Einsteiger», später der wirkliche Stand), die sofortige Wirkung eines
// Klicks und der Fall «Angepasst».
//
// jsdom-Umgebung mit api-Stub vor dem dynamischen Import, weil api.js
// `window.api` beim Laden festhält (Muster tour-erststart.test.js). Die
// Beschriftungen erscheinen hier als i18n-Schlüssel — der Katalog wird per
// fetch geladen, das es in jsdom nicht gibt —, gemessen wird deshalb am
// Zustand der Schaltflächen und nicht am Satzbau. Den Text in der Sprache der
// Oberfläche weist der Ablauf-Fall an der gestarteten Anwendung nach.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './api-stub.js';
import { disabledIdsForModeLevel } from '../../../src/shared/extensions/extensions-core.js';

const { baueArbeitsmodusWahl } =
  await import('../../../src/renderer/modules/tour/tour-arbeitsmodus.js');
const lifecycle = await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

const MODI = ['beginner', 'advanced', 'full'];

function knopf(el, level) {
  return el.querySelector(`#tour-mode-${level}`);
}

function gewaehlt(el) {
  return MODI.filter((level) => knopf(el, level).getAttribute('aria-pressed') === 'true');
}

function standZeile(el) {
  return el.querySelector('.tour-modes-state').textContent;
}

// Den asynchronen Klick-Handler zu Ende laufen lassen: Er wartet auf das
// Anwenden, und dieses wartet auf die Persistenz-Zusage des Stubs. Ein
// Zeitgeber-Durchlauf räumt beide Ketten ab; eine feste Zahl von
// Mikrotask-Runden hinge dagegen an der Zahl der await-Schritte im Modul.
function nachKlick() {
  return new Promise((fertig) => setTimeout(fertig, 0));
}

beforeEach(() => {
  lifecycle.resetExtensionStateForTests();
});

afterEach(() => {
  document.querySelectorAll('.tour-modes').forEach((el) => el.remove());
});

describe('Tour-Station Arbeitsmodus: Aufbau und Vorwahl (4T-001881)', () => {
  it('AK14: die Karte trägt die drei Modi zur Wahl', () => {
    const el = baueArbeitsmodusWahl();
    for (const level of MODI) {
      expect(knopf(el, level), `Modus ${level} fehlt`).toBeTruthy();
      expect(knopf(el, level).dataset.modeLevel).toBe(level);
      expect(knopf(el, level).querySelector('.tour-mode-name').textContent).toBe(
        `settings.extensions.mode.name.${level}`,
      );
    }
  });

  it('AK7: beim ersten Start ist «Einsteiger» vorgewählt', async () => {
    // Der Start-Modus hat den Einsteiger-Satz gesetzt, bevor die Tour anläuft;
    // die Karte liest ihn und wählt ihn damit vor.
    await lifecycle.applyExtensionsState(disabledIdsForModeLevel('beginner'), { persist: false });
    const el = baueArbeitsmodusWahl();
    expect(gewaehlt(el)).toEqual(['beginner']);
    expect(standZeile(el)).toBe('settings.extensions.mode.active');
  });

  it('AK24: eine später aufgerufene Tour zeigt den wirklichen Stand', () => {
    // Bestands-Einrichtung: nichts abgeschaltet, also der volle Modus. Die
    // Karte stellt ihn NICHT auf Einsteiger zurück.
    const el = baueArbeitsmodusWahl();
    expect(gewaehlt(el)).toEqual(['full']);
    expect(lifecycle.getDisabledExtensionIds()).toEqual([]);
  });

  it('AK11: ein angepasster Stand wählt keinen Modus vor', async () => {
    await lifecycle.applyExtensionsState(['katex'], { persist: false });
    const el = baueArbeitsmodusWahl();
    expect(gewaehlt(el)).toEqual([]);
    expect(standZeile(el)).toBe('settings.extensions.mode.custom');
  });
});

describe('Tour-Station Arbeitsmodus: Wirkung einer Wahl (4T-001881)', () => {
  it('AK9: der Klick wirkt sofort und ohne Anwenden-Schritt', async () => {
    const el = baueArbeitsmodusWahl();
    expect(gewaehlt(el)).toEqual(['full']);
    knopf(el, 'beginner').click();
    await nachKlick();
    expect([...lifecycle.getDisabledExtensionIds()].sort()).toEqual(
      [...disabledIdsForModeLevel('beginner')].sort(),
    );
    expect(lifecycle.isExtensionActive('katex')).toBe(false);
    expect(gewaehlt(el)).toEqual(['beginner']);
  });

  it('AK16/AK26: ohne Klick bleibt der Stand, wie er war', () => {
    // Die übersprungene Station und die abgebrochene Tour laufen auf
    // denselben Fall hinaus: Der Aufbau der Karte allein ändert nichts.
    const vorher = lifecycle.getDisabledExtensionIds();
    baueArbeitsmodusWahl();
    expect(lifecycle.getDisabledExtensionIds()).toEqual(vorher);
  });

  it('AK27: dieselbe Wahl ein zweites Mal ändert nichts', async () => {
    const el = baueArbeitsmodusWahl();
    knopf(el, 'advanced').click();
    await nachKlick();
    const nachErstem = [...lifecycle.getDisabledExtensionIds()];
    knopf(el, 'advanced').click();
    await nachKlick();
    expect(lifecycle.getDisabledExtensionIds()).toEqual(nachErstem);
    expect(gewaehlt(el)).toEqual(['advanced']);
  });
});
