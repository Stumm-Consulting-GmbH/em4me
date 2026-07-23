// S-09 (4T-0185): i18n-Synchronitaets-Waechter als Unit-Test. Bindet
// scripts/check-i18n.js ein und schlaegt fehl, sobald die fuenf
// Sprachdateien auseinanderlaufen (fehlende/ueberzaehlige Keys, leere
// Werte, abweichende {placeholder}-Mengen). Laeuft in `npm test` und
// damit ueber den pre-commit-Hook bei jedem Commit.
import { describe, it, expect, vi } from 'vitest';
import { checkI18n, LANGS } from '../../scripts/check-i18n.js';

// menu.js zieht electron (Menu) im Modul-Kopf — fuer den reinen
// tForLocale-Dict-Lookup genuegt ein leerer Mock.
vi.mock('electron', () => ({ Menu: { buildFromTemplate: () => ({}) } }));
const { tForLocale } = await import('../../src/main/menu.js');

describe('i18n-Synchronitaet (S-09)', () => {
  it('alle fuenf Sprachdateien sind schluesselgleich, ohne leere Werte, Platzhalter konsistent', () => {
    const result = checkI18n();
    // Bei Fehlschlag die konkreten Probleme in der Assertion-Meldung zeigen.
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(LANGS).toHaveLength(5);
    expect(result.keyCount).toBeGreaterThan(300);
  });
});

describe('Main-seitige Lokalisierung (M-09, M-10 / 4T-0185)', () => {
  it('tForLocale liefert Open-Dialog- und DevTools-Strings lokalisiert', () => {
    expect(tForLocale('en', 'open.dialogTitle')).toBe('Open Markdown file');
    expect(tForLocale('en', 'dialog.filterAll')).toBe('All files');
    expect(tForLocale('en', 'menu.view.devTools')).toBe('Developer tools');
    expect(tForLocale('de', 'open.dialogTitle')).toBe('Markdown-Datei öffnen');
    expect(tForLocale('de', 'menu.view.devTools')).toBe('Entwickler-Tools');
    // Fallback: unbekannte Locale faellt auf Englisch zurueck.
    expect(tForLocale('xx', 'dialog.filterAll')).toBe('All files');
  });
});
