// S-09 (4T-000185): i18n-Synchronitaets-Waechter als Unit-Test. Bindet
// scripts/check-i18n.js ein und schlaegt fehl, sobald die fuenf
// Sprachdateien auseinanderlaufen (fehlende/ueberzaehlige Keys, leere
// Werte, abweichende {placeholder}-Mengen). Laeuft in `npm test` und
// damit ueber den pre-commit-Hook bei jedem Commit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkI18n, LANGS } from '../../scripts/check-i18n.js';
import { zusammensetzen, serialisiere } from '../../scripts/i18n-fragmente.js';
import { produktnamenIn } from './produktnamen-helfer.js';
import { schreibeSprachdatei } from '../../src/shared/locale-file.js';

// menu.js zieht electron (Menu) im Modul-Kopf — fuer den reinen
// tForLocale-Dict-Lookup genuegt ein leerer Mock.
vi.mock('electron', () => ({ Menu: { buildFromTemplate: () => ({}) } }));
const { tForLocale, loadDict, clearDictCache } = await import('../../src/main/menu/menu.js');

// 4T-001607 (Epic 3E-000278): Beide Bestands-Lesungen liegen im Modulkopf, wo
// das Prueffall-Zeitlimit sie nicht bemisst (Lese-Ort-Regel der
// Zuordnungs-Messung, Schwelle 100 Pfade im Prueffall-Rumpf). Seit der
// Zerlegung sind es je Lauf rund 195 Dateien statt fuenf: Die Quelle ist nicht
// mehr eine Sprachdatei je Sprache, sondern 39 Fragmente je Sprache. Gemessen
// wird damit derselbe Bestand wie zuvor, nur aus seiner versionierten Form.
const SYNCHRONITAET = checkI18n();
const FRAGMENT_KATALOGE = new Map(LANGS.map((lang) => [lang, zusammensetzen(lang)]));

describe('i18n-Synchronitaet (S-09)', () => {
  it('alle fuenf Sprachfassungen sind schluesselgleich, ohne leere Werte, Platzhalter konsistent', () => {
    // Gemessen wird der Fragment-Bestand unter src/i18n/fragments/, die
    // versionierte Quelle — nicht das Erzeugnis src/i18n/<code>.json.
    // Bei Fehlschlag die konkreten Probleme in der Assertion-Meldung zeigen.
    expect(SYNCHRONITAET.errors, SYNCHRONITAET.errors.join('\n')).toEqual([]);
    expect(SYNCHRONITAET.ok).toBe(true);
    expect(LANGS).toHaveLength(5);
    expect(SYNCHRONITAET.keyCount).toBeGreaterThan(300);
  });
});

// 4T-001607 (Epic 3E-000278): Der Waechter am kuenstlichen Bestand. Der Fall
// oben belegt, dass er beim gesunden Bestand schweigt; erst diese Faelle
// belegen, dass er ueberhaupt etwas findet (Fehlerklasse L11 — ein Waechter,
// der nur eingerichtet und nie ausgeloest wurde, ist nicht nachweislich
// scharf). Gebaut wird ein vollstaendiger Mini-Bestand: LANGS sind fest die
// fuenf Codes, ein Ordner-Satz mit nur zwei Sprachen fiele allein deshalb
// durch und belegte nichts.
describe('i18n-Waechter am kuenstlichen Bestand (4T-001607)', () => {
  let wurzel;

  // Zwei Fragmente, damit die Schnitt-Aussage etwas zu vergleichen hat.
  const TAFEL = {
    fragmente: [
      { name: 'menu', praefixe: ['menu'] },
      { name: 'dialog', praefixe: ['dialog'] },
    ],
  };
  const GRUND = {
    menu: { 'menu.file.title': 'Datei' },
    dialog: { 'dialog.hint': 'Noch {anzahl} offen' },
  };

  /** Legt den Mini-Bestand an; `aendere` darf ihn je Sprache verbiegen. */
  const lege = (aendere = () => {}) => {
    fs.writeFileSync(path.join(wurzel, 'manifest.json'), serialisiere(TAFEL));
    for (const lang of LANGS) {
      const ordner = path.join(wurzel, lang);
      fs.mkdirSync(ordner, { recursive: true });
      const inhalt = JSON.parse(JSON.stringify(GRUND));
      aendere(lang, inhalt, ordner);
      for (const [name, werte] of Object.entries(inhalt)) {
        if (werte === null) continue; // null heisst: Fragment weglassen
        fs.writeFileSync(path.join(ordner, `${name}.json`), serialisiere(werte));
      }
    }
    return checkI18n(wurzel);
  };

  beforeEach(() => {
    wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-i18n-'));
  });

  afterEach(() => {
    fs.rmSync(wurzel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('schweigt beim gesunden Mini-Bestand (Gegenprobe)', () => {
    const result = lege();
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.keyCount).toBe(2);
  });

  it('meldet einen Schluessel, den eine Sprache nicht fuehrt', () => {
    const result = lege((lang, inhalt) => {
      if (lang === 'fr') delete inhalt.menu['menu.file.title'];
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('fr: Key fehlt: menu.file.title');
  });

  it('meldet einen leeren Wert', () => {
    const result = lege((lang, inhalt) => {
      if (lang === 'es') inhalt.menu['menu.file.title'] = '   ';
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('es: leerer oder nicht-String-Wert: menu.file.title');
  });

  it('meldet einen abweichenden Platzhalter', () => {
    const result = lege((lang, inhalt) => {
      if (lang === 'it') inhalt.dialog['dialog.hint'] = 'Ancora {numero} aperti';
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'it: Platzhalter-Abweichung bei dialog.hint (fehlt: {anzahl}) (zu viel: {numero})',
    );
  });

  // AK2: Der Schnitt selbst. Am zusammengesetzten Erzeugnis war er nicht
  // messbar — dort ist nur noch zu sehen, welche Schluessel es gibt, nicht
  // aus welcher Datei sie kamen.
  it('meldet ein Fragment, das in einer Sprache fehlt (AK2)', () => {
    const result = lege((lang, inhalt) => {
      if (lang === 'en') inhalt.dialog = null;
    });
    expect(result.ok).toBe(false);
    const schnitt = result.errors.filter((e) => e.includes('nicht gleich geschnitten'));
    expect(schnitt).toHaveLength(1);
    expect(schnitt[0]).toContain('en:');
    expect(schnitt[0]).toContain('dialog');
  });

  it('meldet ein Fragment, das die Zuordnungs-Tafel nicht kennt (AK2)', () => {
    const result = lege((lang, inhalt, ordner) => {
      if (lang === 'de') fs.writeFileSync(path.join(ordner, 'veraltet.json'), serialisiere({}));
    });
    expect(result.ok).toBe(false);
    const schnitt = result.errors.filter((e) => e.includes('nicht gleich geschnitten'));
    expect(schnitt).toHaveLength(1);
    expect(schnitt[0]).toContain('de:');
    expect(schnitt[0]).toContain('veraltet');
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
// 4T-001377: Liste und Erkennung liegen im geteilten Helfer, weil dieselbe
// Regel auch Handbuch-Seiten und README trifft (hilfetext-stil.test.js). Die
// Suche als reine Funktion, damit derselbe Code den Bestand prueft und im Fall
// darunter an einem konstruierten Woerterbuch belegt, dass er einen Verstoss
// auch wirklich findet — sonst waere der Waechter nur eingerichtet und nicht
// nachweislich scharf (Fehlerklasse L11).
describe('Keine Datei-Manager-Produktnamen in den Sprachdateien (4T-001279)', () => {
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
    // 4T-001607 (Epic 3E-000278): Gegenstand ist der BESTAND, also die
    // versionierten Fragmente — nicht das Erzeugnis src/i18n/<code>.json, das
    // erst der Bau schreibt. Der frühere Pfad war zudem cwd-relativ und maß
    // damit, von wo der Lauf gestartet wurde. Gelesen wird im Modulkopf.
    const funde = [];
    for (const lang of LANGS) {
      const { dict, fehler } = FRAGMENT_KATALOGE.get(lang);
      expect(fehler, fehler.join('\n')).toEqual([]);
      funde.push(...produktnamenIn(dict, `fragments/${lang}`));
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

// 4T-001594 (Epic 3E-000129): Der Lade-Weg des Hauptprozesses versorgt Menüs
// und Dialoge des Betriebssystems. Er ist der Weg, an dem ein Irrtum unsichtbar
// bliebe: Eine Sprache, die im Anzeige-Prozess wirkt, aber nicht im Menü, sieht
// auf den ersten Blick richtig aus.
// Der Sprach-Ordner kommt ueber die Injektions-Naht von loadDict herein: Im
// Testlauf liefert `require('electron')` nicht die Electron-API, sondern den
// Pfad der ausfuehrbaren Datei, `app.getPath` waere also gar nicht erreichbar.
// Alle uebrigen Aufrufer der Anwendung gehen den Weg ohne dieses Argument.
describe('Hauptprozess lädt eine eingespielte eigene Sprache (4T-001594)', () => {
  let sprachOrdner;

  const lege = (code, name, werte) =>
    fs.writeFileSync(
      path.join(sprachOrdner, `${code}.json`),
      schreibeSprachdatei(code, name, werte),
    );

  beforeEach(() => {
    sprachOrdner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-profil-'));
    // Der Zwischenspeicher lebt im Modul und damit über die Fälle hinweg.
    clearDictCache();
  });

  afterEach(() => {
    clearDictCache();
    try {
      fs.rmSync(sprachOrdner, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  });

  it('liefert den Katalog der eigenen Sprache statt der Rückfall-Sprache', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': '&Datei', 'dialog.filterAll': 'All Dateien' });
    const dict = loadDict('custom:nds', sprachOrdner);
    expect(dict['menu.file.title']).toBe('&Datei');
    // Der Zwischenspeicher trägt die Kennung; die Dialog-Texte des
    // Betriebssystems finden die Sprache danach ohne den Ordner.
    expect(tForLocale('custom:nds', 'dialog.filterAll')).toBe('All Dateien');
  });

  it('fällt auf Englisch zurück, wenn die Datei fehlt oder unbrauchbar ist (AK5, AK6)', () => {
    expect(loadDict('custom:abc', sprachOrdner)).toBe(loadDict('en'));
    fs.writeFileSync(path.join(sprachOrdner, 'kaputt.json'), '{ kein JSON');
    expect(loadDict('custom:kaputt', sprachOrdner)).toBe(loadDict('en'));
    // Der Rückfall wird NICHT zwischengespeichert: Wird die Datei später
    // eingespielt, greift die Sprache beim nächsten Menü-Aufbau von selbst.
    lege('abc', 'Später', { 'menu.file.title': '&Later' });
    expect(loadDict('custom:abc', sprachOrdner)['menu.file.title']).toBe('&Later');
  });

  it('clearDictCache lässt eine ersetzte Sprache ohne Neustart wirken (AK4)', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': '&Datei' });
    expect(loadDict('custom:nds', sprachOrdner)['menu.file.title']).toBe('&Datei');
    lege('nds', 'Plattdüütsch', { 'menu.file.title': '&Dateien' });
    // Ohne Verwerfen zeigten Menüs und Dialoge bis zum Neustart den alten Stand.
    expect(loadDict('custom:nds', sprachOrdner)['menu.file.title']).toBe('&Datei');
    clearDictCache('custom:nds');
    expect(loadDict('custom:nds', sprachOrdner)['menu.file.title']).toBe('&Dateien');
  });

  // 4T-001595 (Epic 3E-000129): Rückfall je Schlüssel auf Englisch, hier im
  // Hauptprozess — dem Weg, der Menüs und Betriebssystem-Dialoge versorgt. Der
  // Sprach-Ordner kommt wie oben über die Injektions-Naht von loadDict; danach
  // findet `tForLocale` die Sprache über den Zwischenspeicher ohne ihn.
  it('füllt einen fehlenden Schlüssel aus der englischen Fassung auf (AK1, AK2)', () => {
    lege('nds', 'Plattdüütsch', { 'dialog.filterAll': 'All Dateien' });
    loadDict('custom:nds', sprachOrdner);
    // Was die eigene Sprache kennt, kommt aus ihr.
    expect(tForLocale('custom:nds', 'dialog.filterAll')).toBe('All Dateien');
    // Was sie nicht kennt, kommt aus der englischen Fassung statt als roher
    // Schlüssel-Name. Erwartet wird der Text aus der Sprachdatei, nicht aus der
    // Tastatur — der Wortlaut darf sich ändern, die Aussage nicht.
    expect(tForLocale('custom:nds', 'open.dialogTitle')).toBe(loadDict('en')['open.dialogTitle']);
    // AK2: Der Schlüssel-Name bleibt der Notnagel für einen Schlüssel, den auch
    // Englisch nicht kennt — ein Programmfehler und keine Anwender-Lage.
    expect(tForLocale('custom:nds', 'gibt.es.nirgends')).toBe('gibt.es.nirgends');
  });

  it('rührt die mitgelieferten Fassungen nicht an (AK8)', () => {
    lege('nds', 'Plattdüütsch', { 'menu.file.title': '&Datei' });
    loadDict('custom:nds', sprachOrdner);
    expect(loadDict('de')['menu.view.commandPalette']).toBe('Kommando-Palette');
    expect(loadDict('en')['menu.view.commandPalette']).toBe('Command palette');
    // Eine unbekannte Angabe ohne Präfix bleibt der alte Weg: Rückfall.
    expect(loadDict('xx')).toBe(loadDict('en'));
  });
});

// 4T-001595 (Nachtrag, Epic 3E-000129): Der Hauptprozess löst Katalog-Schlüssel
// an genau EINER Stelle auf, in menu-dict.js (tForLocale). Der Menü-Aufbau in
// menu.js hatte eine eigene Auflösung `dict[k] != null ? dict[k] : k` — ohne
// die Rückfall-Kette je Schlüssel —, und der Product Owner sah in seiner
// eigenen Sprache den rohen Schlüssel eines neuen Menü-Eintrags. Die
// Konzept-Stufe hatte drei Implementierungen gezählt; es waren vier. Dieser
// Wächter behauptet eine ABWESENHEIT: Außer menu-dict.js greift keine Datei
// des Hauptprozesses selbst in einen Katalog, damit die Kette nie wieder an
// einer Stelle vorbeiläuft, die niemand gezählt hat.
// Die Lesung des Hauptprozesses liegt im Modulkopf, wo das Prüffall-Zeitlimit
// sie nicht bemisst (Lese-Ort-Regel der Zuordnungs-Messung); die Prüfdatei
// steht dafür im Ausschnitt der Klasse Ä5.
const HAUPTPROZESS_WURZEL = path.resolve('src/main');
const HAUPTPROZESS_QUELLEN = new Map();
(function sammle(ordner) {
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) sammle(voll);
    else if (eintrag.name.endsWith('.js')) {
      HAUPTPROZESS_QUELLEN.set(path.relative(process.cwd(), voll), fs.readFileSync(voll, 'utf8'));
    }
  }
})(HAUPTPROZESS_WURZEL);

describe('Hauptprozess löst Katalog-Schlüssel nur in menu-dict.js auf (4T-001595)', () => {
  it('keine eigene Auflösung `dict[...] ?? key` außerhalb von menu-dict.js', () => {
    // Muster einer Hand-Auflösung: ein Katalog-Zugriff, dem ein Rückfall auf
    // den Schlüssel selbst folgt (`!= null ?`, `??`, `||`).
    const muster = /\bdict\[[^\]]+\]\s*(!=\s*null\s*\?|\?\?|\|\|)/;
    const treffer = [...HAUPTPROZESS_QUELLEN]
      .filter(([rel]) => path.basename(rel) !== 'menu-dict.js')
      .filter(([, quelle]) => muster.test(quelle))
      .map(([rel]) => rel);
    expect(treffer).toEqual([]);
  });

  it('der Menü-Aufbau ruft tForLocale statt eines eigenen Nachschlags', () => {
    const quelle = HAUPTPROZESS_QUELLEN.get(path.join('src', 'main', 'menu', 'menu.js'));
    expect(quelle).toMatch(/const t = \(k\) => tForLocale\(locale, k\);/);
  });

  it('tForLocale liefert dem Menü den englischen Text, wenn die eigene Sprache den Schlüssel nicht kennt', () => {
    // Derselbe Fall wie am Bild des Product Owners: Sprachdatei aus einer
    // älteren Vorlage, neuer Menü-Eintrag noch unbekannt.
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-menue-'));
    try {
      fs.writeFileSync(
        path.join(ordner, 'nds.json'),
        schreibeSprachdatei('nds', 'Plattdüütsch', { 'menu.file.removeLocale': 'Wegdoon…' }),
      );
      clearDictCache();
      loadDict('custom:nds', ordner);
      expect(tForLocale('custom:nds', 'menu.file.removeLocale')).toBe('Wegdoon…');
      expect(tForLocale('custom:nds', 'menu.file.updateLocale')).toBe(
        loadDict('en')['menu.file.updateLocale'],
      );
    } finally {
      clearDictCache();
      fs.rmSync(ordner, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
});
