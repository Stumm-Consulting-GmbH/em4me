// S-09 (4T-0185): i18n-Synchronitaets-Waechter als Unit-Test. Bindet
// scripts/check-i18n.js ein und schlaegt fehl, sobald die fuenf
// Sprachdateien auseinanderlaufen (fehlende/ueberzaehlige Keys, leere
// Werte, abweichende {placeholder}-Mengen). Laeuft in `npm test` und
// damit ueber den pre-commit-Hook bei jedem Commit.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { checkI18n, LANGS } from '../../scripts/check-i18n.js';

// menu.js zieht electron (Menu) im Modul-Kopf — fuer den reinen
// tForLocale-Dict-Lookup genuegt ein leerer Mock.
vi.mock('electron', () => ({ Menu: { buildFromTemplate: () => ({}) } }));
const { tForLocale } = await import('../../src/main/menu/menu.js');

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

describe('Bereitschaft des Woerterbuchs (4T-1044)', () => {
  // Anlass: Beim Start des gepackten Baus trifft die Anzeige-Info des Main
  // ein, bevor loadTranslations durch ist. t() liefert dann den Schluessel
  // unveraendert zurueck; im Fenstertitel stand dadurch kurz
  // "EM4me (window.title.workspace)". Der Fix fragt vor dem Bauen des
  // Titel-Suffix nach, ob das Woerterbuch da ist. Geprueft wird hier die
  // Aussage, auf der er steht.
  it('meldet vor dem Laden "nicht bereit" und danach "bereit"', async () => {
    const i18n = await import('../../src/renderer/i18n.js');
    expect(i18n.hatUebersetzungen()).toBe(false);
    // Gegenprobe zum zurueckgezogenen Nebenbefund der Diagnose: t() gibt den
    // Schluessel zurueck, meldet ihn im Vor-Lade-Zustand aber NICHT als
    // Konsolen-Fehler — meldeFehlendenSchluessel schweigt bei leerem
    // Woerterbuch (Guard aus 4T-0900).
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(i18n.t('window.title.workspace')).toBe('window.title.workspace');
    expect(fehler).not.toHaveBeenCalled();
    fehler.mockRestore();

    const dict = JSON.parse(
      fs.readFileSync(new URL('../../src/i18n/de.json', import.meta.url), 'utf8'),
    );
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => dict }));
    // loadTranslations setzt zusaetzlich das lang-Attribut des Dokuments; diese
    // Datei laeuft in der Node-Umgebung, deshalb ein minimales Stellvertreter-
    // Objekt statt einer jsdom-Umgebung fuer die ganze Datei.
    vi.stubGlobal('document', { documentElement: {} });
    await i18n.loadTranslations('de');
    vi.unstubAllGlobals();
    expect(i18n.hatUebersetzungen()).toBe(true);
    expect(i18n.t('window.title.workspace')).toBe('Arbeitsbereich {name}');
  });
});

describe('Main-seitige Lokalisierung (M-09, M-10 / 4T-0185)', () => {
  it('tForLocale liefert Dialog- und Menue-Strings lokalisiert', () => {
    expect(tForLocale('en', 'open.dialogTitle')).toBe('Open Markdown file');
    expect(tForLocale('en', 'dialog.filterAll')).toBe('All files');
    // 4T-0927: Stand des Menue-Labels statt der frueheren DevTools-Probe —
    // deren Schluessel ist mit dem Menueeintrag entfallen.
    expect(tForLocale('en', 'menu.view.commandPalette')).toBe('Command palette');
    expect(tForLocale('de', 'open.dialogTitle')).toBe('Markdown-Datei öffnen');
    expect(tForLocale('de', 'menu.view.commandPalette')).toBe('Kommando-Palette');
    // Fallback: unbekannte Locale faellt auf Englisch zurueck.
    expect(tForLocale('xx', 'dialog.filterAll')).toBe('All files');
  });
});
