// 4T-002163 (Epic 3E-000149): Prüffälle des Befehls «Neue Präsentation»
// (Story 4S-001055) — der Startinhalt mit Kennzeichen, Steuer-Schlüsseln und
// drei Beispiel-Folien, darunter eine mit Sprecher-Notiz, in jeder der fünf
// Sprachen; das Anlegen über den Weg von «Datei → Neu» mit der
// Präsentations-Ansicht; der Bedienweg über Menü, Palette und Erweiterung,
// unabhängig vom Vorlagen-Ordner.
//
// Gemessen wird am Dokument-Text über den echten Format-Kern mit der
// Markdown-Instanz der Anwendung (wie im Preload). Der Menü-Baum wird am
// gebauten Baum geprüft (Muster kanban-anlegen.test.js), weil sich nur dort
// zeigt, dass mit der abgeschalteten Erweiterung auch das Untermenü entfällt.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import markdownModul from '../../../src/shared/markdown/markdown.js';
import { lesePraesentation } from '../../../src/shared/presentation/presentation-core.js';
import { hintergrundBilderZiehen } from '../../../src/shared/presentation/presentation-darstellung.js';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import { extensionById } from '../../../src/shared/extensions/extensions.js';
import { disabledCommandIdSet } from '../../../src/shared/extensions/extensions-core.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const cjs = createRequire(import.meta.url);
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const KATALOG = Object.fromEntries(
  SPRACHEN.map((code) => [code, JSON.parse(lies(`src/i18n/${code}.json`))]),
);
const DE = KATALOG.de;

vi.mock('../../../src/renderer/i18n.js', async () => {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const de = JSON.parse(fsMod.readFileSync(pathMod.resolve('src/i18n/de.json'), 'utf8'));
  return { t: (k) => (k in de ? de[k] : k) };
});
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const { legeNeuePraesentationAn, praesentationStartInhalt } =
  await import('../../../src/renderer/modules/presentation/presentation-anlegen.js');

const lese = (text) => lesePraesentation(text, { kommentareAktiv: true, md: markdownModul.md });

describe('Startinhalt (AK2, AK3)', () => {
  const text = praesentationStartInhalt();
  const modell = lese(text);

  it('trägt das Kennzeichen der Anwendung und die Steuer-Schlüssel eines gewöhnlichen Foliensatzes', () => {
    expect(text.startsWith('---\npresentation: true\n')).toBe(true);
    expect(modell.istPraesentation).toBe(true);
    expect(modell.kennzeichen).toBe('presentation');
    expect(modell.kopf.theme).toBe('light');
    expect(modell.kopf.paginate).toBe(true);
    expect(modell.befunde.filter((b) => b.code !== 'keinKopf')).toEqual([]);
  });

  it('hat drei Beispiel-Folien: Titel, Liste mit Notiz, Zweiteilung in Worten', () => {
    expect(modell.folien).toHaveLength(3);
    const [titel, liste, zweiteilung] = modell.folien;
    expect(titel.quelltext).toContain(`# ${DE['presentation.vorlage.titel']}`);
    expect(liste.quelltext).toContain(`- ${DE['presentation.vorlage.punkt1']}`);
    expect(liste.notizen).toEqual([DE['presentation.vorlage.notiz']]);
    // Die Notiz steht nicht im Quelltext der Folie.
    expect(liste.quelltext).not.toContain(DE['presentation.vorlage.notiz']);
    expect(zweiteilung.quelltext).toContain('`![bg left](bild.png)`');
    // In der Code-Spanne ist die Schreibweise Text und kein Hintergrund.
    expect(hintergrundBilderZiehen(zweiteilung.quelltext).bilder).toEqual([]);
    expect(zweiteilung.quelltext).not.toMatch(/\{bg\}|\{links\}/);
  });

  it('AK4: erscheint in jeder der fünf Sprachen in dieser Sprache', () => {
    for (const code of SPRACHEN) {
      const k = KATALOG[code];
      const t = (key) => (key in k ? k[key] : key);
      const inhalt = praesentationStartInhalt(t);
      const m = lese(inhalt);
      expect(m.istPraesentation, code).toBe(true);
      expect(m.folien, code).toHaveLength(3);
      for (const key of [
        'presentation.vorlage.titel',
        'presentation.vorlage.untertitel',
        'presentation.vorlage.listeTitel',
        'presentation.vorlage.punkt1',
        'presentation.vorlage.punkt2',
        'presentation.vorlage.punkt3',
        'presentation.vorlage.zweiteilungTitel',
      ]) {
        expect(k[key], `${code} ${key}`).toBeTruthy();
        expect(inhalt, `${code} ${key}`).toContain(k[key]);
      }
      expect(m.folien[1].notizen, code).toEqual([k['presentation.vorlage.notiz']]);
      // Die Platzhalter sind ersetzt, die Code-Spannen stehen.
      expect(inhalt, code).not.toMatch(/\{bg\}|\{links\}/);
      expect(inhalt, code).toContain('`![bg](bild.png)`');
    }
  });
});

describe('Anlegen (AK1, AK5)', () => {
  it('legt über den Weg von «Datei → Neu» an und öffnet in der Präsentations-Ansicht', () => {
    const neu = vi.fn();
    expect(legeNeuePraesentationAn(neu)).toBe(true);
    expect(neu).toHaveBeenCalledTimes(1);
    const [optionen] = neu.mock.calls[0];
    expect(optionen.viewMode).toBe('presentation');
    expect(optionen.inhalt).toBe(praesentationStartInhalt());
  });

  it('jede Anlage bekommt einen frischen Text ohne Bindung an den Befehl', () => {
    const texte = [];
    legeNeuePraesentationAn(({ inhalt }) => texte.push(inhalt));
    legeNeuePraesentationAn(({ inhalt }) => texte.push(inhalt));
    expect(texte[0]).toBe(texte[1]);
    expect(typeof texte[0]).toBe('string');
  });

  it('ohne Weg zu einem neuen Dokument: nichts und false', () => {
    expect(legeNeuePraesentationAn(undefined)).toBe(false);
  });

  it('AK6: unabhängig vom Vorlagen-Ordner und der Erweiterung «Vorlagen»', () => {
    const quelle = lies('src/renderer/modules/presentation/presentation-anlegen.js');
    expect(quelle).not.toMatch(/import [^;]*templat/i);
    expect(extensionById('templates')?.commands || []).not.toContain('presentation.new');
    const cmd = COMMANDS.find((c) => c.id === 'presentation.new');
    expect(cmd.availability).toBe('immer');
    expect(isAvailable(cmd.availability, availabilityContext({}))).toBe(true);
  });
});

describe('Bedienweg (AK1, AK7)', () => {
  const cmd = COMMANDS.find((c) => c.id === 'presentation.new');

  it('Registry: im Menü und in der Palette, ohne Kürzel, eigener Katalog-Text', () => {
    expect(cmd).toBeTruthy();
    expect(cmd.menu).toBe(true);
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.labelKey).toBe('menu.view.presentationNew');
    expect(cmd.descKey).toBe('help.shortcut.presentationNew');
    for (const code of SPRACHEN) {
      expect(KATALOG[code]['menu.view.presentationNew'], code).toBeTruthy();
      expect(KATALOG[code]['help.shortcut.presentationNew'], code).toBeTruthy();
    }
    // 4T-002165: ohne Auslassungspunkte, weil der Befehl nach nichts fragt
    // (Entscheidung der Sitzung vom 2026-10-09, Vorbild "Neue Kanban-Tafel").
    expect(DE['menu.view.presentationNew']).toBe('Neue Präsentation');
  });

  it('Brücke, Menü-Bindung und Dispatcher rufen denselben Weg', () => {
    expect(lies('src/main/preload.js')).toContain(
      "onMenuPresentationNew: (cb) => ipcRenderer.on('menu:presentationNew', () => cb())",
    );
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuPresentationNew(() => legeNeuePraesentationAn(newUntitledTab))',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      "'presentation.new': () => legeNeuePraesentationAn(newUntitledTab)",
    );
  });

  it('gehört zur Erweiterung presentation und entfällt in ihrem Aus-Zustand', () => {
    expect(extensionById('presentation').commands).toContain('presentation.new');
    expect(disabledCommandIdSet(['presentation']).has('presentation.new')).toBe(true);
    expect(disabledCommandIdSet(['templates']).has('presentation.new')).toBe(false);
  });
});

// --- Der gebaute Baum --------------------------------------------------------------

const electronPfad = cjs.resolve('electron');
cjs.cache[electronPfad] = {
  id: electronPfad,
  filename: electronPfad,
  loaded: true,
  exports: { Menu: { buildFromTemplate: (template) => template } },
};
const { buildMenu, tForLocale } = cjs('../../../src/main/menu/menu.js');

function baueAnsichtsMenue(disabledCommands, zustand = {}) {
  const template = buildMenu(
    null,
    { locale: 'de', viewMode: 'rendered', hasActiveTab: true, disabledCommands, ...zustand },
    null,
  );
  const editLabel = tForLocale('de', 'menu.view.edit');
  const ansicht = template.find(
    (top) => Array.isArray(top.submenu) && top.submenu.some((i) => i && i.label === editLabel),
  );
  return ansicht ? ansicht.submenu : [];
}

const labels = (items) => items.map((i) => (i.type === 'separator' ? '—' : i.label));

describe('Präsentation: das gebaute Untermenü', () => {
  const UNTERMENUE = tForLocale('de', 'menu.view.presentationMenu');

  it('«Neue Präsentation» steht zuerst, abgesetzt von der Vorführung, und ist ohne Präsentation wählbar', () => {
    const ansicht = baueAnsichtsMenue([]);
    const eintrag = ansicht.find((i) => i.label === UNTERMENUE);
    expect(eintrag, 'Untermenü «Präsentation» fehlt').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([
      tForLocale('de', 'menu.view.presentationNew'),
      '—',
      tForLocale('de', 'menu.view.presentationStart'),
    ]);
    expect(eintrag.submenu[0].enabled).toBe(true);
  });

  it('der Modus-Eintrag heißt «Folien» und steht vor dem Untermenü', () => {
    const ansicht = baueAnsichtsMenue([]);
    expect(tForLocale('de', 'menu.view.presentation')).toBe('Folien');
    const iModus = ansicht.findIndex((i) => i.label === 'Folien');
    const iUnter = ansicht.findIndex((i) => i.label === UNTERMENUE);
    expect(iModus).toBeGreaterThan(-1);
    expect(iModus).toBeLessThan(iUnter);
  });

  it('im Aus-Zustand der Erweiterung entfällt das ganze Untermenü', () => {
    const aus = [...disabledCommandIdSet(['presentation'])];
    const ansicht = baueAnsichtsMenue(aus);
    expect(ansicht.find((i) => i.label === UNTERMENUE)).toBeUndefined();
  });
});
