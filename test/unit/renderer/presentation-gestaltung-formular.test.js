// @vitest-environment jsdom
// 4T-002282 (Epic 3E-000348): Unit-Tests des gemeinsamen Formulars der sieben
// Folien-Slots (AK2, AK6) in beiden Rahmen — Entwurf des Theme-Editors und
// Modal des Dialogs «Gestaltung dieser Präsentation…» — und des Nachweises,
// dass beide Oberflächen dasselbe Modul nutzen.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FARB_SLOTS,
  SCHRIFT_VORSCHLAEGE,
  alsFarbwaehlerWert,
  baueGestaltungsFormular,
} from '../../../src/renderer/modules/presentation/presentation-gestaltung-formular.js';
import {
  FOLIEN_SLOTS,
  FOLIEN_THEMES,
  slotWertPruefen,
} from '../../../src/shared/presentation/presentation-themes.js';

const t = (key) => key;
const zeile = (formular, slot) =>
  formular.element.querySelector(`.folien-gestaltung-zeile[data-slot="${slot}"]`);
const teil = (formular, slot, name) => zeile(formular, slot).querySelector(`[data-teil="${name}"]`);

function tippe(el, wert) {
  el.value = wert;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Formular der Folien-Slots: Aufbau (4T-002282, AK2)', () => {
  it('zeigt die sieben Slots in fester Reihenfolge, Farbwähler bei den Farb-Slots, Vorschläge bei der Schrift', () => {
    const f = baueGestaltungsFormular({ t, rahmen: 'entwurf', grund: FOLIEN_THEMES.light });
    const slots = [...f.element.querySelectorAll('.folien-gestaltung-zeile')].map(
      (z) => z.dataset.slot,
    );
    expect(slots).toEqual([...FOLIEN_SLOTS]);
    for (const slot of FARB_SLOTS) expect(teil(f, slot, 'farbe'), slot).toBeTruthy();
    expect(teil(f, 'font', 'farbe')).toBeNull();
    const liste = f.element.querySelector(`#${teil(f, 'font', 'text').getAttribute('list')}`);
    expect([...liste.querySelectorAll('option')].map((o) => o.value)).toEqual([
      ...SCHRIFT_VORSCHLAEGE,
    ]);
    expect(zeile(f, 'accent').querySelector('label').textContent).toBe('presentation.slot.accent');
  });

  it('jeder Schrift-Vorschlag besteht die Wert-Prüfung', () => {
    for (const v of SCHRIFT_VORSCHLAEGE) expect(slotWertPruefen(v), v).toBe(v);
  });

  it('Farbwähler-Werte: #rrggbb und #rgb, sonst keiner', () => {
    expect(alsFarbwaehlerWert('#ABCDEF')).toBe('#abcdef');
    expect(alsFarbwaehlerWert('#fa0')).toBe('#ffaa00');
    expect(alsFarbwaehlerWert('red')).toBeNull();
    expect(alsFarbwaehlerWert('rgb(1,2,3)')).toBeNull();
  });
});

describe('Formular im Rahmen «entwurf» (Theme-Editor, AK2)', () => {
  it('zeigt die Werte der Basis, darüber die Abweichungen', () => {
    const f = baueGestaltungsFormular({
      t,
      rahmen: 'entwurf',
      grund: FOLIEN_THEMES.dark,
      eigene: { accent: '#c0392b' },
    });
    expect(teil(f, 'background', 'text').value).toBe(FOLIEN_THEMES.dark.background);
    expect(teil(f, 'accent', 'text').value).toBe('#c0392b');
    expect(teil(f, 'accent', 'farbe').value).toBe('#c0392b');
    expect(f.eigeneWerte()).toEqual({ accent: '#c0392b' });
    expect(f.wirksam()).toEqual({ ...FOLIEN_THEMES.dark, accent: '#c0392b' });
    // Kein Wahl-Element im Entwurf.
    expect(teil(f, 'accent', 'wahl')).toBeNull();
  });

  it('eine Eingabe wird zur Abweichung und meldet sich; Zurücksetzen nimmt sie zurück', () => {
    const melde = vi.fn();
    const f = baueGestaltungsFormular({
      t,
      rahmen: 'entwurf',
      grund: FOLIEN_THEMES.light,
      beiAenderung: melde,
    });
    tippe(teil(f, 'heading', 'text'), '#123456');
    expect(melde).toHaveBeenLastCalledWith({ heading: '#123456' });
    tippe(teil(f, 'text', 'farbe'), '#00ff00');
    expect(f.eigeneWerte()).toEqual({ text: '#00ff00', heading: '#123456' });
    zeile(f, 'heading').querySelector('[data-aktion="zuruecksetzen"]').click();
    expect(f.eigeneWerte()).toEqual({ text: '#00ff00' });
    expect(teil(f, 'heading', 'text').value).toBe(FOLIEN_THEMES.light.heading);
    expect(melde).toHaveBeenLastCalledWith({ text: '#00ff00' });
  });

  it('ein ungültiger Wert wird markiert und nicht übernommen', () => {
    const f = baueGestaltungsFormular({ t, rahmen: 'entwurf', grund: FOLIEN_THEMES.light });
    tippe(teil(f, 'background', 'text'), 'url(http://x)');
    expect(zeile(f, 'background').classList.contains('folien-gestaltung-ungueltig')).toBe(true);
    expect(teil(f, 'background', 'text').getAttribute('aria-invalid')).toBe('true');
    expect(f.eigeneWerte()).toEqual({});
    expect(f.ungueltige()).toEqual(['background']);
    expect(f.wirksam().background).toBe(FOLIEN_THEMES.light.background);
  });

  it('nur lesend: ohne Zurücksetzen und ohne Eingabe', () => {
    const f = baueGestaltungsFormular({
      t,
      rahmen: 'entwurf',
      grund: FOLIEN_THEMES.light,
      nurLesen: true,
    });
    expect(f.element.querySelector('[data-aktion="zuruecksetzen"]')).toBeNull();
    expect(teil(f, 'font', 'text').readOnly).toBe(true);
  });
});

describe('Formular im Rahmen «dialog» (Gestaltung dieser Präsentation, AK3)', () => {
  it('jede Zeile trägt «wie Theme (Wert)» oder «eigener Wert»', () => {
    const f = baueGestaltungsFormular({
      t: (key) => (key === 'presentation.gestaltung.wieTheme' ? 'wie Theme ({wert})' : key),
      rahmen: 'dialog',
      grund: FOLIEN_THEMES.accent,
      eigene: { background: '#000000' },
    });
    const wahlHg = teil(f, 'background', 'wahl');
    const wahlText = teil(f, 'text', 'wahl');
    expect(wahlHg.value).toBe('eigen');
    expect(wahlText.value).toBe('theme');
    expect(wahlText.options[0].textContent).toBe(`wie Theme (${FOLIEN_THEMES.accent.text})`);
    expect(zeile(f, 'text').dataset.zustand).toBe('theme');
    expect(zeile(f, 'background').dataset.zustand).toBe('eigen');
  });

  it('eine Eingabe stellt auf «eigener Wert», Zurücksetzen und die Wahl auf «wie Theme»', () => {
    const f = baueGestaltungsFormular({ t, rahmen: 'dialog', grund: FOLIEN_THEMES.light });
    tippe(teil(f, 'accent', 'text'), '#ff0000');
    expect(teil(f, 'accent', 'wahl').value).toBe('eigen');
    expect(f.eigeneWerte()).toEqual({ accent: '#ff0000' });
    zeile(f, 'accent').querySelector('[data-aktion="zuruecksetzen"]').click();
    expect(teil(f, 'accent', 'wahl').value).toBe('theme');
    expect(f.eigeneWerte()).toEqual({});
    const wahl = teil(f, 'font', 'wahl');
    wahl.value = 'eigen';
    wahl.dispatchEvent(new Event('change'));
    // Die Wahl übernimmt den Wert des Themes als Ausgangspunkt.
    expect(f.eigeneWerte()).toEqual({ font: FOLIEN_THEMES.light.font });
    wahl.value = 'theme';
    wahl.dispatchEvent(new Event('change'));
    expect(f.eigeneWerte()).toEqual({});
  });

  it('ein anderes Theme als Grund ändert die Klammer, nicht die eigenen Werte', () => {
    const f = baueGestaltungsFormular({
      t,
      rahmen: 'dialog',
      grund: FOLIEN_THEMES.light,
      eigene: { accent: '#ff0000' },
    });
    f.setzeGrund(FOLIEN_THEMES.dark);
    expect(teil(f, 'background', 'text').value).toBe(FOLIEN_THEMES.dark.background);
    expect(f.eigeneWerte()).toEqual({ accent: '#ff0000' });
    f.setzeEigene({ text: '#eeeeee' });
    expect(f.eigeneWerte()).toEqual({ text: '#eeeeee' });
  });
});

describe('Ein Formular-Modul für beide Oberflächen (AK6)', () => {
  const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

  it('Theme-Editor und Dialog bauen ihre Zeilen mit demselben Modul', () => {
    const editor = lies('src/renderer/modules/settings/presentation-themes-settings.js');
    const dialog = lies('src/renderer/modules/presentation/presentation-gestaltung-dialog.js');
    for (const quelle of [editor, dialog]) {
      expect(quelle).toMatch(
        /import \{ baueGestaltungsFormular \} from '[^']*presentation-gestaltung-formular\.js'/,
      );
    }
    expect(editor).toContain("rahmen: 'entwurf'");
    expect(dialog).toContain("rahmen: 'dialog'");
  });
});
