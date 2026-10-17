// @vitest-environment jsdom
// 4T-002282 (Epic 3E-000348): Unit-Tests des Dialogs «Gestaltung dieser
// Präsentation…» (AK3 bis AK5) — Schreibweg in den Kopf mit Byte-Vergleich,
// fremden Schlüsseln und Kommentaren, Zustände des Modals, ein
// Rückgängig-Schritt an einem Editor-Zustand mit Historie, «Als Theme
// speichern…» und «Theme-Werte in die Datei übernehmen».
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import {
  kopfUnveraendert,
  leseKopfGestaltung,
  schreibeThemeInKopf,
  textAenderung,
  themeKopfWert,
} from '../../../src/renderer/modules/presentation/presentation-gestaltung-kopf.js';
import {
  NAMENS_TEXTE,
  oeffneGestaltungsDialog,
  themeAusDialog,
  werteUebernehmenKopfWert,
  zeigeGestaltungsDialog,
} from '../../../src/renderer/modules/presentation/presentation-gestaltung-dialog.js';
import {
  FOLIEN_THEMES,
  themeAufloesen,
} from '../../../src/shared/presentation/presentation-themes.js';
import { normalisiereThemesZustand } from '../../../src/shared/presentation/presentation-eigene-themes.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const t = (key) => key;

// Ein Kopf mit fremden Schlüsseln, Kommentaren und eigener Schreibweise; der
// Rumpf trägt ein `---`, das kein Kopf ist.
const KOPF = [
  '---',
  '# Kopf-Kommentar bleibt',
  'marp: true',
  'title:   "Vortrag"   # Titel mit Kommentar',
  'tags: [a, b]',
  'paginate: true',
  '---',
  '',
  '# Erste Folie',
  '',
  '---',
  '',
  '# Zweite Folie',
  '',
].join('\n');

const FIRMA = { id: 'f1', name: 'Firma', basis: 'dark', slots: { accent: '#c0392b' } };

// Ein Editor-Zustand mit Historie, wie ihn die Spalte trägt.
function editor(text) {
  let state = EditorState.create({ doc: text, extensions: [history()] });
  const view = {
    get state() {
      return state;
    },
    dispatch: vi.fn((spec) => {
      state = state.update(spec).state;
    }),
  };
  const rueckgaengig = () =>
    undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
  return { view, rueckgaengig, text: () => state.doc.toString() };
}

// Teile der Kopf-Zeilen außer denen des Schlüssels `theme`.
const ohneTheme = (text) => {
  const ende = text.indexOf('\n---', 3);
  const kopf = text.slice(0, ende).split('\n');
  const aus = [];
  let imTheme = false;
  for (const zeile of kopf) {
    if (/^theme:/.test(zeile)) {
      imTheme = true;
      continue;
    }
    if (imTheme && /^\s/.test(zeile)) continue;
    imTheme = false;
    aus.push(zeile);
  }
  return aus.join('\n') + text.slice(ende);
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Kopf lesen (4T-002282, AK3)', () => {
  it('ohne theme: Vorgabe light, keine eigenen Werte', () => {
    expect(leseKopfGestaltung(KOPF)).toEqual({
      ok: true,
      vorhanden: false,
      themeName: 'light',
      eigene: {},
      extra: {},
    });
  });

  it('Name, Block mit Namen und Block ohne Namen', () => {
    expect(leseKopfGestaltung('---\ntheme: Firma\n---\n').themeName).toBe('Firma');
    const block = leseKopfGestaltung(
      '---\ntheme:\n  name: dark\n  accent: "#ff0000"\n  background: url(x)\n  muster: 1\n---\n',
    );
    expect(block.themeName).toBe('dark');
    expect(block.eigene).toEqual({ accent: '#ff0000' });
    // Ungültiges und Unbekanntes bleibt stehen, wird aber nicht gezeigt.
    expect(block.extra).toEqual({ background: 'url(x)', muster: 1 });
    expect(leseKopfGestaltung('---\ntheme:\n  text: "#111111"\n---\n').themeName).toBe('light');
  });

  it('ein defekter Kopf wird erkannt', () => {
    expect(leseKopfGestaltung('---\ntheme: [\n---\n').ok).toBe(false);
  });
});

describe('Block schreiben (AK3): übrige Kopf-Schlüssel und Kommentare byte-gleich', () => {
  it('ohne eigene Werte steht theme: <Name>', () => {
    expect(themeKopfWert('dark', {})).toBe('dark');
    const neu = schreibeThemeInKopf(KOPF, 'dark');
    expect(neu).toContain('\ntheme: dark\n');
    expect(ohneTheme(neu)).toBe(KOPF);
  });

  it('mit eigenen Werten: name: und nur die eigenen Werte, in Slot-Reihenfolge', () => {
    const wert = themeKopfWert('Firma', { accent: '#00ff00', background: '#000000' });
    expect(wert).toEqual({ name: 'Firma', background: '#000000', accent: '#00ff00' });
    const neu = schreibeThemeInKopf(KOPF, wert);
    expect(ohneTheme(neu)).toBe(KOPF);
    expect(leseKopfGestaltung(neu)).toMatchObject({
      themeName: 'Firma',
      eigene: { background: '#000000', accent: '#00ff00' },
    });
    // Der Rumpf ist unberührt.
    expect(neu.slice(neu.indexOf('# Erste Folie'))).toBe(KOPF.slice(KOPF.indexOf('# Erste Folie')));
  });

  it('ersetzt einen bestehenden Eintrag an seiner Stelle und lässt CRLF stehen', () => {
    const crlf = '---\r\nmarp: true # an\r\ntheme: light\r\nsize: 4:3\r\n---\r\n\r\n# A\r\n';
    const neu = schreibeThemeInKopf(crlf, 'dark');
    expect(neu).toBe('---\r\nmarp: true # an\r\ntheme: dark\r\nsize: 4:3\r\n---\r\n\r\n# A\r\n');
  });

  it('ersetzt einen Block mitten im Kopf; Kommentar-Zeile und Folge-Schlüssel bleiben byte-gleich', () => {
    const alt = [
      '---',
      'title:  x',
      'theme:',
      '  name: dark',
      '  accent: "#ff0000"',
      '',
      '# Kommentar zum Folge-Schlüssel',
      'size:   4:3',
      '---',
      'Rumpf',
    ].join('\n');
    const alsName = schreibeThemeInKopf(alt, 'light');
    expect(alsName).toBe(
      [
        '---',
        'title:  x',
        'theme: light',
        '',
        '# Kommentar zum Folge-Schlüssel',
        'size:   4:3',
        '---',
        'Rumpf',
      ].join('\n'),
    );
    const zurueck = schreibeThemeInKopf(alsName, { name: 'dark', text: '#010101' });
    expect(leseKopfGestaltung(zurueck)).toMatchObject({
      themeName: 'dark',
      eigene: { text: '#010101' },
    });
    expect(zurueck.startsWith('---\ntitle:  x\ntheme:\n')).toBe(true);
    expect(zurueck.endsWith('\n\n# Kommentar zum Folge-Schlüssel\nsize:   4:3\n---\nRumpf')).toBe(
      true,
    );
  });

  it('unverändert heißt: nicht schreiben, auch kein theme: light in einen Kopf ohne Eintrag', () => {
    expect(kopfUnveraendert(leseKopfGestaltung(KOPF), 'light')).toBe(true);
    expect(kopfUnveraendert(leseKopfGestaltung(KOPF), 'dark')).toBe(false);
    const gelesen = leseKopfGestaltung('---\ntheme:\n  name: dark\n  accent: "#ff0000"\n---\n');
    expect(kopfUnveraendert(gelesen, { name: 'dark', accent: '#ff0000' })).toBe(true);
  });

  it('textAenderung liefert genau eine Ersetzung', () => {
    expect(textAenderung('abcXdef', 'abcYYdef')).toEqual({ from: 3, to: 4, insert: 'YY' });
    expect(textAenderung('gleich', 'gleich')).toBeNull();
    const neu = schreibeThemeInKopf(KOPF, 'dark');
    const a = textAenderung(KOPF, neu);
    expect(KOPF.slice(0, a.from) + a.insert + KOPF.slice(a.to)).toBe(neu);
  });
});

describe('Das Modal (AK3): Theme-Wahl und Zeilen', () => {
  function oeffne(ctx) {
    const versprechen = zeigeGestaltungsDialog({ t, katalog: [FIRMA], eigene: {}, ...ctx });
    const modal = document.body.querySelector('.folien-gestaltung-modal');
    return { versprechen, modal, q: (sel) => modal.querySelector(sel) };
  }

  it('zeigt mitgelieferte und eigene Themes, gewählt ist das Theme im Kopf', async () => {
    const { versprechen, q, modal } = oeffne({ themeName: 'firma' });
    const wahl = q('[data-teil="theme"]');
    expect([...wahl.options].map((o) => o.value)).toEqual(['light', 'dark', 'accent', 'Firma']);
    expect(wahl.value).toBe('Firma');
    // Die Zeilen folgen dem gewählten eigenen Theme.
    const text = modal.querySelector(
      '.folien-gestaltung-zeile[data-slot="accent"] [data-teil="text"]',
    );
    expect(text.value).toBe('#c0392b');
    expect(q('[data-aktion="werteUebernehmen"]').disabled).toBe(false);
    q('[data-aktion="abbrechen"]').click();
    expect(await versprechen).toBeNull();
    expect(document.body.querySelector('.folien-gestaltung-modal')).toBeNull();
  });

  it('ein unbekannter Name bleibt wählbar; «Theme-Werte übernehmen» nur bei eigenem Theme', async () => {
    const { versprechen, q } = oeffne({ themeName: 'gaia' });
    const wahl = q('[data-teil="theme"]');
    expect(wahl.value).toBe('gaia');
    expect(wahl.selectedOptions[0].textContent).toBe('presentation.gestaltung.unbekannt');
    expect(q('[data-aktion="werteUebernehmen"]').disabled).toBe(true);
    q('[data-aktion="ok"]').click();
    expect(await versprechen).toEqual({ aktion: 'ok', themeName: 'gaia', eigene: {} });
  });

  it('OK liefert Theme-Wahl und eigene Werte; Escape bricht ab', async () => {
    const erst = oeffne({ themeName: 'light', eigene: { text: '#222222' } });
    const wahl = erst.q('[data-teil="theme"]');
    wahl.value = 'dark';
    wahl.dispatchEvent(new Event('change'));
    erst.q('[data-aktion="ok"]').click();
    expect(await erst.versprechen).toEqual({
      aktion: 'ok',
      themeName: 'dark',
      eigene: { text: '#222222' },
    });
    const zweit = oeffne({ themeName: 'light' });
    zweit.modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await zweit.versprechen).toBeNull();
  });
});

describe('Am Bedienweg: ein Rückgängig-Schritt (AK3)', () => {
  const zugang = (view, ergebnis, mehr = {}) => ({
    t,
    view,
    aenderbar: true,
    eigeneThemes: () => [FIRMA],
    speichereThemes: vi.fn(async () => true),
    frageName: vi.fn(async () => null),
    hinweis: vi.fn(),
    zeigeDialog: vi.fn(async () => ergebnis),
    ...mehr,
  });

  it('OK schreibt den Block als eine Transaktion, Rückgängig nimmt ihn in einem Schritt zurück', async () => {
    const e = editor(KOPF);
    const z = zugang(e.view, {
      aktion: 'ok',
      themeName: 'dark',
      eigene: { background: '#101010' },
    });
    expect(await oeffneGestaltungsDialog(z)).toBe(true);
    expect(e.view.dispatch).toHaveBeenCalledTimes(1);
    expect(e.view.dispatch.mock.calls[0][0].userEvent).toBe('input');
    expect(leseKopfGestaltung(e.text())).toMatchObject({
      themeName: 'dark',
      eigene: { background: '#101010' },
    });
    expect(ohneTheme(e.text())).toBe(KOPF);
    expect(e.rueckgaengig()).toBe(true);
    expect(e.text()).toBe(KOPF);
  });

  it('ohne Änderung wird nichts geschrieben; Abbruch ebenso', async () => {
    const e = editor(KOPF);
    expect(
      await oeffneGestaltungsDialog(
        zugang(e.view, { aktion: 'ok', themeName: 'light', eigene: {} }),
      ),
    ).toBe(false);
    expect(await oeffneGestaltungsDialog(zugang(e.view, null))).toBe(false);
    expect(e.view.dispatch).not.toHaveBeenCalled();
  });

  it('nicht änderbar oder defekter Kopf: Hinweis, kein Dialog', async () => {
    const e = editor(KOPF);
    const z = zugang(e.view, null, { aenderbar: false });
    expect(await oeffneGestaltungsDialog(z)).toBe(false);
    expect(z.hinweis).toHaveBeenCalledWith('presentation.gestaltung.nurAenderbar');
    expect(z.zeigeDialog).not.toHaveBeenCalled();
    const defekt = editor('---\ntheme: [\n---\n');
    const z2 = zugang(defekt.view, null);
    expect(await oeffneGestaltungsDialog(z2)).toBe(false);
    expect(z2.hinweis).toHaveBeenCalledWith('presentation.gestaltung.kopfDefekt');
  });

  it('hat sich das Dokument während des Dialogs geändert, wird verworfen', async () => {
    const e = editor(KOPF);
    const z = zugang(e.view, null);
    z.zeigeDialog = vi.fn(async () => {
      e.view.dispatch({ changes: { from: e.text().length, insert: 'neu' } });
      return { aktion: 'ok', themeName: 'dark', eigene: {} };
    });
    expect(await oeffneGestaltungsDialog(z)).toBe(false);
    expect(z.hinweis).toHaveBeenCalledWith('presentation.gestaltung.verworfen');
    expect(e.text()).toBe(`${KOPF}neu`);
  });
});

describe('«Als Theme speichern…» (AK4)', () => {
  it('prüft den Namen, legt das Theme aus Basis und eigenen Werten an und schreibt theme: <Name>', async () => {
    const e = editor(KOPF);
    const speichereThemes = vi.fn(async () => true);
    let validate;
    const frageName = vi.fn(async (opts) => {
      validate = opts.validate;
      return 'Vortrag';
    });
    const ok = await oeffneGestaltungsDialog({
      t,
      view: e.view,
      aenderbar: true,
      eigeneThemes: () => [FIRMA],
      speichereThemes,
      frageName,
      hinweis: vi.fn(),
      zeigeDialog: async () => ({
        aktion: 'alsTheme',
        themeName: 'Firma',
        eigene: { text: '#fafafa' },
      }),
    });
    expect(ok).toBe(true);
    // Die Namens-Regel im Namens-Dialog.
    expect(validate('')).toBe(NAMENS_TEXTE.nameLeer);
    expect(validate('Dark')).toBe(NAMENS_TEXTE.nameMitgeliefert);
    expect(validate(' firma ')).toBe(NAMENS_TEXTE.nameVergeben);
    expect(validate('Vortrag')).toBeNull();
    // Gespeichert: der normalisierte Zustand mit dem neuen Theme.
    const zustand = speichereThemes.mock.calls[0][0];
    expect(zustand).toEqual(normalisiereThemesZustand(zustand));
    const neu = zustand.custom.find((x) => x.name === 'Vortrag');
    expect(neu).toMatchObject({ basis: 'dark', slots: { accent: '#c0392b', text: '#fafafa' } });
    expect(zustand.custom.map((x) => x.name)).toEqual(['Firma', 'Vortrag']);
    // Der Kopf trägt den Namen und sonst nichts Neues.
    expect(e.text()).toContain('\ntheme: Vortrag\n');
    expect(ohneTheme(e.text())).toBe(KOPF);
    expect(e.rueckgaengig()).toBe(true);
    expect(e.text()).toBe(KOPF);
  });

  it('Abbruch des Namens-Dialogs oder Speicher-Fehler schreiben nichts', async () => {
    const e = editor(KOPF);
    const basis = {
      t,
      view: e.view,
      aenderbar: true,
      eigeneThemes: () => [],
      hinweis: vi.fn(),
      zeigeDialog: async () => ({ aktion: 'alsTheme', themeName: 'light', eigene: {} }),
    };
    expect(
      await oeffneGestaltungsDialog({
        ...basis,
        speichereThemes: vi.fn(async () => true),
        frageName: async () => null,
      }),
    ).toBe(false);
    expect(
      await oeffneGestaltungsDialog({
        ...basis,
        speichereThemes: vi.fn(async () => false),
        frageName: async () => 'Neu',
      }),
    ).toBe(false);
    expect(e.view.dispatch).not.toHaveBeenCalled();
  });

  it('themeAusDialog speichert nur die Abweichungen von der Basis', () => {
    const neu = themeAusDialog('X', 'light', { accent: FOLIEN_THEMES.light.accent }, [], 'id');
    expect(neu).toEqual({ id: 'id', name: 'X', basis: 'light', slots: {} });
  });
});

describe('«Theme-Werte in die Datei übernehmen» (AK5)', () => {
  it('schreibt die vollständigen Werte des eigenen Themes mit name: seiner Basis', async () => {
    const e = editor(KOPF);
    const ok = await oeffneGestaltungsDialog({
      t,
      view: e.view,
      aenderbar: true,
      eigeneThemes: () => [FIRMA],
      speichereThemes: vi.fn(),
      frageName: vi.fn(),
      hinweis: vi.fn(),
      zeigeDialog: async () => ({ aktion: 'werteUebernehmen', themeName: 'Firma', eigene: {} }),
    });
    expect(ok).toBe(true);
    const gelesen = leseKopfGestaltung(e.text());
    expect(gelesen.themeName).toBe('dark');
    expect(gelesen.eigene).toEqual(themeAufloesen('Firma', { eigene: [FIRMA] }).slots);
    // Ohne das eigene Theme ergibt die Datei dieselben Slots.
    expect(themeAufloesen({ name: 'dark', ...gelesen.eigene }).slots).toEqual(
      themeAufloesen('Firma', { eigene: [FIRMA] }).slots,
    );
    expect(ohneTheme(e.text())).toBe(KOPF);
  });

  it('nur bei einem eigenen Theme; eigene Werte des Dialogs gehen den Theme-Werten vor', () => {
    expect(werteUebernehmenKopfWert('dark', {}, [FIRMA])).toBeNull();
    const wert = werteUebernehmenKopfWert('firma', { text: '#000001' }, [FIRMA]);
    expect(wert.name).toBe('dark');
    expect(wert.text).toBe('#000001');
    expect(wert.accent).toBe('#c0392b');
    expect(Object.keys(wert)).toHaveLength(8);
  });
});

describe('Kommando und Verdrahtung (AK7)', () => {
  const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

  it('Kommando mit Text in fünf Sprachen, verfügbar nur in einer änderbaren Präsentation', () => {
    const kommando = COMMANDS.find((c) => c.id === 'presentation.gestaltung');
    expect(kommando).toMatchObject({
      labelKey: 'menu.view.presentationGestaltung',
      descKey: 'help.shortcut.presentationGestaltung',
      menu: true,
      availability: 'praesentationAenderbar',
    });
    const basis = { hasTab: true, praesentationTab: true, editMode: true };
    expect(isAvailable('praesentationAenderbar', availabilityContext(basis))).toBe(true);
    for (const abweichung of [
      { editMode: false },
      { praesentationTab: false },
      { systemTab: true },
      { manualTab: true },
      { hasTab: false },
    ]) {
      expect(
        isAvailable('praesentationAenderbar', availabilityContext({ ...basis, ...abweichung })),
        JSON.stringify(abweichung),
      ).toBe(false);
    }
    // In jeder Ansicht, nicht nur in der gezeigten Präsentation.
    for (const viewMode of ['source', 'split', 'rendered', 'presentation']) {
      expect(
        isAvailable('praesentationAenderbar', availabilityContext({ ...basis, viewMode })),
      ).toBe(true);
    }
    expect(extensionById('presentation').commands).toContain('presentation.gestaltung');
  });

  it('Menü, Menü-Horcher und Dispatcher sind verdrahtet', () => {
    const menue = lies('src/main/menu/menu.js');
    expect(menue).toMatch(/unless\('presentation\.gestaltung'/);
    expect(menue).toMatch(/send\('menu:presentationGestaltung'\)/);
    const bindungen = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindungen).toMatch(
      /onMenuPresentationGestaltung\(\(\) => oeffneGestaltungDerSpalte\(state\.activePaneIndex\)\)/,
    );
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toMatch(
      /'presentation\.gestaltung': \(\) => oeffneGestaltungDerSpalte\(state\.activePaneIndex\)/,
    );
    const start = lies('src/renderer/modules/presentation/presentation-gestaltung-start.js');
    expect(start).toContain('istPraesentationsModusVerfuegbar(tab)');
    expect(start).toContain('frageName: showNameInputDialog');
  });

  it('Texte des Dialogs und des Abschnitts liegen in allen fünf Sprachen vor (AK8)', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const texte = {
        ...JSON.parse(lies(`src/i18n/fragments/${sprache}/presentation.json`)),
        ...JSON.parse(lies(`src/i18n/fragments/${sprache}/menu.json`)),
        ...JSON.parse(lies(`src/i18n/fragments/${sprache}/help-shortcut.json`)),
      };
      for (const schluessel of [
        'menu.view.presentationGestaltung',
        'help.shortcut.presentationGestaltung',
        'presentation.gestaltung.titel',
        'presentation.gestaltung.wieTheme',
        'presentation.themes.titel',
        ...Object.values(NAMENS_TEXTE),
      ]) {
        expect(typeof texte[schluessel], `${sprache}: ${schluessel}`).toBe('string');
        expect(texte[schluessel].length, `${sprache}: ${schluessel}`).toBeGreaterThan(0);
      }
    }
  });
});
