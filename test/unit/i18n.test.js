// S-09 (4T-000185): i18n-Synchronitaets-Waechter als Unit-Test. Bindet
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

// 4T-001279 (Epic 3E-000232, Befund B4): Kein Produktname eines Datei-Managers in
// nutzer-sichtbaren Texten.
//
// Anlass: Zwei Katalog-Schluessel nannten den Windows-Datei-Manager beim
// Produktnamen. Unter Linux heisst er anders, und der Anwender findet dort
// nichts unter diesem Namen — der beschriebene Weg stimmte, allein die
// Benennung war falsch. Das Release 1.121.1 hatte im August bereits eine
// Durchsicht genau dieser Art gefahren und diese zwei Schluessel uebersehen:
// **Eine Durchsicht von Hand findet nicht alles**, und deshalb steht hier ein
// Waechter statt einer weiteren Durchsicht.
//
// Die Liste ist bewusst eng: nur Produktnamen von Datei-Managern, in den
// Schreibungen der fuenf Sprachfassungen. Kein Katalog auf Vorrat — eine
// Bindung an eine Plattform darf benannt werden, wo sie besteht (etwa
// «setzt Windows 11 voraus» bei der farbigen Fenster-Titelleiste); falsch ist
// allein, eine plattform-uebergreifende Funktion nach einem Produkt zu
// benennen, das es nur auf einer Plattform gibt.
describe('Keine Datei-Manager-Produktnamen in den Sprachdateien (4T-001279)', () => {
  const VERBOTEN = [
    'Explorer', // Windows, deutsche und englische Fassung
    'Explorateur', // franzoesisch
    'Explorador', // spanisch
    'Esplora risorse', // italienisch
    'Finder', // macOS
    'Nautilus', // GNOME
    'Thunar', // Xfce
    'Dolphin', // KDE
  ];

  // Die Suche als reine Funktion, damit derselbe Code den Bestand prueft und
  // im Fall darunter an einem konstruierten Woerterbuch belegt, dass er einen
  // Verstoss auch wirklich findet. Ohne diesen zweiten Fall waere der Waechter
  // nur eingerichtet und nicht nachweislich scharf (Fehlerklasse L11).
  function produktnamenIn(dict, quelle) {
    const funde = [];
    for (const [key, wert] of Object.entries(dict)) {
      if (typeof wert !== 'string') continue;
      for (const name of VERBOTEN) {
        if (wert.includes(name)) funde.push(`${quelle} / ${key}: "${name}"`);
      }
    }
    return funde;
  }

  it('findet einen Produktnamen, wenn einer dasteht (Gegenprobe der Erkennung)', () => {
    const kuenstlich = {
      'help.feature.beispiel': 'Dateien oeffnen per „Oeffnen mit“ im Explorer.',
      'help.feature.sauber': 'Dateien oeffnen per „Oeffnen mit“ im Dateimanager.',
      'help.feature.plattform': 'Die farbige Titelleiste setzt Windows 11 voraus.',
    };
    const funde = produktnamenIn(kuenstlich, 'test.json');
    // Genau der eine Verstoss — und ausdruecklich NICHT die legitime Nennung
    // einer echten Plattform-Bindung, die kein Datei-Manager-Produktname ist.
    expect(funde).toEqual(['test.json / help.feature.beispiel: "Explorer"']);
  });

  it('nennt den Datei-Manager mit dem Gattungsnamen, nicht mit einem Produktnamen', () => {
    const funde = [];
    for (const lang of LANGS) {
      const dict = JSON.parse(fs.readFileSync(`src/i18n/${lang}.json`, 'utf8'));
      funde.push(...produktnamenIn(dict, `${lang}.json`));
    }
    expect(
      funde,
      `Produktname eines Datei-Managers in nutzer-sichtbarem Text — Gattungsnamen verwenden ` +
        `(Dateimanager, file manager, gestionnaire de fichiers, gestor de archivos, gestore ` +
        `file):\n${funde.join('\n')}`,
    ).toEqual([]);
  });
});

describe('Bereitschaft des Woerterbuchs (4T-001044)', () => {
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
    // Woerterbuch (Guard aus 4T-000900).
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

describe('Main-seitige Lokalisierung (M-09, M-10 / 4T-000185)', () => {
  it('tForLocale liefert Dialog- und Menue-Strings lokalisiert', () => {
    expect(tForLocale('en', 'open.dialogTitle')).toBe('Open Markdown file');
    expect(tForLocale('en', 'dialog.filterAll')).toBe('All files');
    // 4T-000927: Stand des Menue-Labels statt der frueheren DevTools-Probe —
    // deren Schluessel ist mit dem Menueeintrag entfallen.
    expect(tForLocale('en', 'menu.view.commandPalette')).toBe('Command palette');
    expect(tForLocale('de', 'open.dialogTitle')).toBe('Markdown-Datei öffnen');
    expect(tForLocale('de', 'menu.view.commandPalette')).toBe('Kommando-Palette');
    // Fallback: unbekannte Locale faellt auf Englisch zurueck.
    expect(tForLocale('xx', 'dialog.filterAll')).toBe('All files');
  });
});
