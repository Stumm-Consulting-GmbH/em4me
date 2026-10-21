// @vitest-environment jsdom
// 4T-002205 (Epic 3E-000338), Nachtrag vom 2026-10-10: Spalten-Köpfe des
// Wochen-Gitters der Eingabe-Hilfe bei einer Namens-Liste mit unbenannter
// Position. Seit 4T-002205 steht ein unbenannter Eintrag als null im Modell;
// nach Entscheidung A7 des Epics zeigt eine benannte Position ihren Namen und
// eine unbenannte ihre Zahl, auch mitten in der Liste. Der Kopf blieb dort
// zuvor leer. Die Regel im Rechenkern prüft test/unit/kalender-namens-listen.test.js.
//
// Die Übersetzung ist eine Attrappe, die den Schlüssel zurückgibt; geprüft
// werden allein die Spalten-Köpfe, die aus den Namen der Zeitrechnung stammen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { normalizeCalendarConfig } from '../../../src/shared/calendar/calendar-config.js';
import { createGregorianTemplate } from '../../../src/shared/calendar/calendar-template.js';

vi.mock('../../../src/renderer/i18n.js', async (importOriginal) => ({
  ...(await importOriginal()),
  t: (key) => key,
}));

const { showCalendarPicker } =
  await import('../../../src/renderer/modules/calendar/calendar-picker.js');

const WOCHENTAGE = createGregorianTemplate().cycles.find((cy) => cy.id === 'week').names;

// Gregorianische Vorlage mit eigener Liste der Wochentags-Namen, eingelesen
// wie im Programm (die Liste wird dabei auf sieben Positionen gebracht).
function konfiguration(names) {
  const def = createGregorianTemplate();
  def.cycles[0].names = names;
  return normalizeCalendarConfig({ blocks: [{ id: 'welt', calendars: [def] }] });
}

// Öffnet die Eingabe-Hilfe, liest die Spalten-Köpfe des Wochen-Gitters (ohne
// die Ecke der Wochen-Nummern) und schließt sie wieder.
async function spaltenKoepfe(names) {
  const config = konfiguration(names);
  const ergebnis = showCalendarPicker({ config, value: '2026-10-10' });
  const koepfe = [
    ...document.querySelectorAll('#calendar-picker-grid .calendar-head:not(.calendar-week-col)'),
  ].map((el) => el.textContent);
  document.getElementById('calendar-picker-cancel').click();
  expect(await ergebnis).toBeNull();
  return koepfe;
}

// Die Eingabe-Hilfe hängt ihr Fenster einmalig an und behält es; es bleibt
// deshalb stehen, alles andere wird vor jedem Fall entfernt.
beforeEach(() => {
  for (const el of [...document.body.children]) {
    if (el.id !== 'calendar-picker-popup') el.remove();
  }
});

describe('Wochen-Gitter der Eingabe-Hilfe mit unbenannter Position (4T-002205, AK1)', () => {
  it('sechs Namen für sieben Positionen: die siebte Spalte zeigt «7», die übrigen ihre Namen', async () => {
    expect(await spaltenKoepfe(WOCHENTAGE.slice(0, 6))).toEqual([...WOCHENTAGE.slice(0, 6), '7']);
  });

  it('unbenannte Position mitten in der Liste zeigt ihre Zahl, die Nachbarn ihre Namen', async () => {
    const names = WOCHENTAGE.map((n, i) => (i === 2 ? '' : n));
    expect(await spaltenKoepfe(names)).toEqual(WOCHENTAGE.map((n, i) => (i === 2 ? '3' : n)));
  });

  it('Schutz-Fall: volle Liste zeigt alle Namen, ohne Liste stehen die Zahlen 1 bis 7', async () => {
    expect(await spaltenKoepfe(WOCHENTAGE.slice())).toEqual(WOCHENTAGE);
    expect(await spaltenKoepfe(undefined)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });
});
