// 4T-0207 (Epic 3E-0015): Unit-Tests der Kommando-Registry
// (src/shared/commands.js) — Registry-Invarianten, Binding-Normalisierung,
// Merge-Logik, Anzeige-/CodeMirror-Konvertierung und Timestamp-Format.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  FIXED_BINDINGS,
  normalizeBinding,
  eventToBinding,
  isShiftSymbolEvent,
  stripShiftFromBinding,
  mergeBindings,
  effectiveMenuAccelerators,
  bindingToDisplayString,
  acceleratorToCmKey,
  isBindingCapturable,
  findBindingConflict,
  findDuplicateBindings,
  formatTimestamp,
} from '../../src/shared/commands.js';

const I18N_DIR = path.resolve(__dirname, '..', '..', 'src', 'i18n');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

describe('Registry-Invarianten', () => {
  it('Kommando-IDs sind eindeutig und folgen dem Namespace-Muster', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      // 4T-0379: Ziffern im Namen erlaubt (z.B. paragraph.heading1).
      expect(id).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
    }
  });

  it('Default-Bindings sind paarweise kollisionsfrei (normalisiert)', () => {
    const seen = new Map();
    for (const cmd of COMMANDS) {
      for (const binding of cmd.defaultBindings) {
        const normalized = normalizeBinding(binding);
        expect(normalized, `${cmd.id}: ${binding}`).toBeTruthy();
        expect(
          seen.has(normalized),
          `Kollision ${cmd.id} vs. ${seen.get(normalized)} auf ${normalized}`,
        ).toBe(false);
        seen.set(normalized, cmd.id);
      }
    }
  });

  it('defaultBindings ist immer ein Array der Laenge 0 oder 1', () => {
    for (const cmd of COMMANDS) {
      expect(Array.isArray(cmd.defaultBindings), cmd.id).toBe(true);
      expect(cmd.defaultBindings.length, cmd.id).toBeLessThanOrEqual(1);
    }
  });

  it('categoryKey stammt aus dem Fuenfer-Set der Hilfe-Gruppen', () => {
    for (const cmd of COMMANDS) {
      expect(COMMAND_CATEGORIES, cmd.id).toContain(cmd.categoryKey);
    }
  });

  it('labelKey, descKey und categoryKey existieren in allen fuenf Sprachdateien', () => {
    const dicts = Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8')),
      ]),
    );
    for (const cmd of COMMANDS) {
      const keys = [cmd.labelKey, cmd.categoryKey];
      if (cmd.descKey) keys.push(cmd.descKey);
      for (const key of keys) {
        for (const lang of LANGS) {
          expect(dicts[lang][key], `${lang}.json fehlt ${key} (${cmd.id})`).toBeTruthy();
        }
      }
    }
  });

  // 4T-0378/4T-0379 (Epic 3E-0071): editorScoped umfasst neben den Fold-
  // Kommandos die Zeichen-Format-, Link-, Absatz- und Einfüge-Kommandos
  // (wirken als CodeMirror-Keymap im Editor). 4T-0590 (Epic 3E-0109):
  // plus die zwölf Tabellen-Operationen des Kontextmenü-Untermenüs.
  // 4T-0599 (Epic 3E-0112): plus die beiden Listen-Verschiebe-Kommandos.
  it('editorScoped-Kommandos sind Fold, Format/Link, Absatz, Einfügen, Tabelle und Liste', () => {
    const scoped = COMMANDS.filter((c) => c.editorScoped)
      .map((c) => c.id)
      .sort();
    expect(scoped).toEqual([
      'editor.fold',
      'editor.foldAll',
      'editor.unfold',
      'editor.unfoldAll',
      'format.bold',
      'format.clear',
      'format.code',
      'format.comment',
      'format.highlight',
      'format.italic',
      'format.math',
      'format.strikethrough',
      'insert.callout',
      'insert.codeBlock',
      'insert.footnote',
      'insert.horizontalRule',
      'insert.table',
      'link.insertExternal',
      'link.insertWiki',
      'list.moveDown',
      'list.moveUp',
      'list.selectSubtree',
      'paragraph.bulletList',
      'paragraph.heading1',
      'paragraph.heading2',
      'paragraph.heading3',
      'paragraph.heading4',
      'paragraph.heading5',
      'paragraph.heading6',
      'paragraph.noHeading',
      'paragraph.orderedList',
      'paragraph.quote',
      'paragraph.taskList',
      'table.alignCenter',
      'table.alignLeft',
      'table.alignRight',
      'table.colDelete',
      'table.colInsert',
      'table.colLeft',
      'table.colRight',
      'table.rowDelete',
      'table.rowDown',
      'table.rowInsert',
      'table.rowUp',
      'table.transpose',
    ]);
  });
});

describe('normalizeBinding', () => {
  it('bringt Modifier in die fixe Reihenfolge Ctrl+Alt+Shift', () => {
    expect(normalizeBinding('Shift+Alt+CmdOrCtrl+K')).toBe('Ctrl+Alt+Shift+K');
    expect(normalizeBinding('CmdOrCtrl+Shift+I')).toBe('Ctrl+Shift+I');
  });

  it('normalisiert Buchstaben auf Grossschreibung', () => {
    expect(normalizeBinding('ctrl+d')).toBe('Ctrl+D');
  });

  it('behandelt Sonderzeichen-Tasten (+, -, ;, [, ])', () => {
    expect(normalizeBinding('CmdOrCtrl+Plus')).toBe('Ctrl+Plus');
    expect(normalizeBinding('CmdOrCtrl+-')).toBe('Ctrl+-');
    expect(normalizeBinding('CmdOrCtrl+;')).toBe('Ctrl+;');
    expect(normalizeBinding('CmdOrCtrl+Shift+[')).toBe('Ctrl+Shift+[');
    expect(normalizeBinding('CmdOrCtrl+Alt+]')).toBe('Ctrl+Alt+]');
    // Literales '+' am Ende ('Ctrl++') wird als Plus-Taste gelesen.
    expect(normalizeBinding('Ctrl++')).toBe('Ctrl+Plus');
  });

  it('kanonisiert benannte Tasten und F-Tasten', () => {
    expect(normalizeBinding('f3')).toBe('F3');
    expect(normalizeBinding('Shift+F3')).toBe('Shift+F3');
    expect(normalizeBinding('CmdOrCtrl+Alt+Right')).toBe('Ctrl+Alt+Right');
    expect(normalizeBinding('Esc')).toBe('Escape');
    expect(normalizeBinding('Return')).toBe('Enter');
  });

  it('liefert null fuer leere oder Modifier-only-Eintraege', () => {
    expect(normalizeBinding('')).toBeNull();
    expect(normalizeBinding(null)).toBeNull();
    expect(normalizeBinding('Ctrl+Shift')).toBeNull();
  });
});

describe('eventToBinding', () => {
  const ev = (key, mods = {}) => ({
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
  });

  it('bildet keydown-Events auf das kanonische Format ab', () => {
    expect(eventToBinding(ev('d', { ctrl: true }))).toBe('Ctrl+D');
    expect(eventToBinding(ev('I', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+I');
    expect(eventToBinding(ev('Tab', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+Tab');
    expect(eventToBinding(ev('F3'))).toBe('F3');
    expect(eventToBinding(ev('ArrowRight', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+Right');
  });

  it('matcht das Ergebnis von normalizeBinding fuer alle Default-Bindings mit Buchstaben-Taste', () => {
    // Kern-Invariante des Dispatchers: Event-Form und Accelerator-Form
    // landen im selben Map-Key.
    expect(eventToBinding(ev('s', { ctrl: true }))).toBe(normalizeBinding('CmdOrCtrl+S'));
    expect(eventToBinding(ev('S', { ctrl: true, shift: true }))).toBe(
      normalizeBinding('CmdOrCtrl+Shift+S'),
    );
    expect(eventToBinding(ev('+', { ctrl: true }))).toBe(normalizeBinding('CmdOrCtrl+Plus'));
    expect(eventToBinding(ev('-', { ctrl: true }))).toBe(normalizeBinding('CmdOrCtrl+-'));
    expect(eventToBinding(ev(',', { ctrl: true }))).toBe(normalizeBinding('CmdOrCtrl+,'));
    expect(eventToBinding(ev(';', { ctrl: true }))).toBe(normalizeBinding('CmdOrCtrl+;'));
  });

  it('liefert null bei reinen Modifier-Druecken', () => {
    expect(eventToBinding(ev('Control', { ctrl: true }))).toBeNull();
    expect(eventToBinding(ev('Shift', { shift: true }))).toBeNull();
    expect(eventToBinding(ev('AltGraph', { ctrl: true, alt: true }))).toBeNull();
  });

  it('Meta zaehlt als Ctrl (bisheriges ctrl||meta-Verhalten)', () => {
    expect(eventToBinding(ev('w', { meta: true }))).toBe('Ctrl+W');
  });

  it('Shift-Symbol-Toleranz: englisches Layout erreicht Strg+Plus via Shift', () => {
    const e = ev('+', { ctrl: true, shift: true });
    expect(eventToBinding(e)).toBe('Ctrl+Shift+Plus');
    expect(isShiftSymbolEvent(e)).toBe(true);
    expect(stripShiftFromBinding('Ctrl+Shift+Plus')).toBe('Ctrl+Plus');
    // Buchstaben und Ziffern sind KEINE Toleranz-Kandidaten.
    expect(isShiftSymbolEvent(ev('W', { ctrl: true, shift: true }))).toBe(false);
    expect(isShiftSymbolEvent(ev('1', { ctrl: true, shift: true }))).toBe(false);
  });
});

describe('mergeBindings', () => {
  it('ohne Overrides gelten exakt die Registry-Defaults', () => {
    const merged = mergeBindings(null);
    for (const cmd of COMMANDS) {
      expect(merged[cmd.id]).toEqual(cmd.defaultBindings);
    }
  });

  it('Override ersetzt das Default-Binding', () => {
    const merged = mergeBindings({ 'search.open': 'CmdOrCtrl+Shift+7' });
    expect(merged['search.open']).toEqual(['CmdOrCtrl+Shift+7']);
    expect(merged['search.openReplace']).toEqual(['CmdOrCtrl+H']);
  });

  it('leerer String entbindet das Kommando', () => {
    const merged = mergeBindings({ 'file.save': '' });
    expect(merged['file.save']).toEqual([]);
  });

  it('unbekannte Kommando-IDs und Nicht-String-Werte werden ignoriert', () => {
    const merged = mergeBindings({
      'gibt.esNicht': 'CmdOrCtrl+X',
      'file.save': 42,
      'file.open': null,
    });
    expect(merged['gibt.esNicht']).toBeUndefined();
    expect(merged['file.save']).toEqual(['CmdOrCtrl+S']);
    expect(merged['file.open']).toEqual(['CmdOrCtrl+O']);
  });
});

describe('effectiveMenuAccelerators', () => {
  it('liefert genau die Menue-Kommandos, Overrides inklusive', () => {
    const accs = effectiveMenuAccelerators({
      'file.save': 'CmdOrCtrl+Alt+S',
      'view.toggleEdit': '',
    });
    expect(accs['file.save']).toBe('CmdOrCtrl+Alt+S');
    expect(accs['view.toggleEdit']).toBe('');
    expect(accs['file.newTab']).toBe('CmdOrCtrl+N');
    // Binding-lose Menue-Kommandos liefern leeren String.
    expect(accs['view.toggleScrollSync']).toBe('');
    // Nicht-Menue-Kommandos tauchen nicht auf.
    expect(accs['search.open']).toBeUndefined();
    expect(accs['tab.close']).toBeUndefined();
  });
});

describe('bindingToDisplayString', () => {
  it('uebersetzt in die deutschen Anzeige-Tokens der Hilfe-Pipeline', () => {
    expect(bindingToDisplayString('CmdOrCtrl+Shift+I')).toBe('Strg+Umschalt+I');
    expect(bindingToDisplayString('CmdOrCtrl+Plus')).toBe('Strg++');
    expect(bindingToDisplayString('CmdOrCtrl+-')).toBe('Strg+-');
    expect(bindingToDisplayString('CmdOrCtrl+Alt+Right')).toBe('Strg+Alt+→');
    expect(bindingToDisplayString('Shift+F3')).toBe('Umschalt+F3');
    expect(bindingToDisplayString('F1')).toBe('F1');
    expect(bindingToDisplayString('')).toBe('');
  });
});

describe('acceleratorToCmKey', () => {
  it('uebersetzt in CodeMirror-Keymap-Syntax', () => {
    expect(acceleratorToCmKey('CmdOrCtrl+Shift+[')).toBe('Ctrl-Shift-[');
    expect(acceleratorToCmKey('CmdOrCtrl+Alt+]')).toBe('Ctrl-Alt-]');
    expect(acceleratorToCmKey('CmdOrCtrl+Shift+D')).toBe('Ctrl-Shift-d');
    expect(acceleratorToCmKey('CmdOrCtrl+Alt+Right')).toBe('Ctrl-Alt-ArrowRight');
    expect(acceleratorToCmKey('')).toBeNull();
  });
});

// --- 4T-0208: Capture-Regeln und Konflikt-Erkennung ---------------------------

describe('isBindingCapturable (Sperr-Regel)', () => {
  it('Strg- oder Alt-Kombinationen sind zulaessig', () => {
    expect(isBindingCapturable('Ctrl+K')).toBe(true);
    expect(isBindingCapturable('Ctrl+Shift+K')).toBe(true);
    expect(isBindingCapturable('Alt+K')).toBe(true);
    expect(isBindingCapturable('Ctrl+Alt+Right')).toBe(true);
  });

  it('F-Tasten sind auch ohne Strg/Alt zulaessig (Praezedenz F3/Umschalt+F3)', () => {
    expect(isBindingCapturable('F3')).toBe(true);
    expect(isBindingCapturable('Shift+F5')).toBe(true);
  });

  it('modifierlose Zeichen-Tasten und Umschalt-only sind gesperrt', () => {
    expect(isBindingCapturable('K')).toBe(false);
    expect(isBindingCapturable('Shift+K')).toBe(false);
    expect(isBindingCapturable('Tab')).toBe(false);
    expect(isBindingCapturable('Escape')).toBe(false);
    expect(isBindingCapturable('Enter')).toBe(false);
    expect(isBindingCapturable('')).toBe(false);
  });

  it('alle Registry-Defaults bestehen die Sperr-Regel', () => {
    for (const cmd of COMMANDS) {
      for (const binding of cmd.defaultBindings) {
        expect(isBindingCapturable(binding), `${cmd.id}: ${binding}`).toBe(true);
      }
    }
  });
});

describe('findBindingConflict', () => {
  const draft = () => {
    const d = {};
    for (const cmd of COMMANDS) {
      d[cmd.id] = cmd.defaultBindings.length > 0 ? cmd.defaultBindings[0] : '';
    }
    return d;
  };

  it('freie Kombination liefert null', () => {
    expect(findBindingConflict(draft(), 'search.open', 'Ctrl+Alt+F')).toBeNull();
  });

  it('Konflikt mit Default eines anderen Kommandos wird erkannt (normalisiert)', () => {
    const conflict = findBindingConflict(draft(), 'search.openReplace', 'Ctrl+F');
    expect(conflict).toEqual({ type: 'command', commandId: 'search.open' });
  });

  it('Konflikt mit Override-Stand des Drafts wird erkannt', () => {
    const d = draft();
    d['search.open'] = 'Ctrl+Alt+9';
    expect(findBindingConflict(d, 'zoom.in', 'CmdOrCtrl+Alt+9')).toEqual({
      type: 'command',
      commandId: 'search.open',
    });
    // Die alte Default-Kombination von search.open ist jetzt frei.
    expect(findBindingConflict(d, 'zoom.in', 'Ctrl+F')).toBeNull();
  });

  it('Selbst-Zuweisung ist kein Konflikt', () => {
    expect(findBindingConflict(draft(), 'search.open', 'CmdOrCtrl+F')).toBeNull();
  });

  it('entbundene Kommandos (leerer String) kollidieren nicht', () => {
    const d = draft();
    d['search.open'] = '';
    expect(findBindingConflict(d, 'zoom.in', 'Ctrl+F')).toBeNull();
  });

  it('fixe Bindings sind Konflikte vom Typ fixed', () => {
    expect(findBindingConflict(draft(), 'search.open', 'Tab')).toEqual({
      type: 'fixed',
      descKey: 'help.shortcut.tabIndent',
    });
    expect(findBindingConflict(draft(), 'search.open', 'Shift+Enter')).toEqual({
      type: 'fixed',
      descKey: 'help.shortcut.searchNavEnter',
    });
    expect(findBindingConflict(draft(), 'search.open', 'Alt+Enter')).toEqual({
      type: 'fixed',
      descKey: 'help.shortcut.replaceAll',
    });
  });

  it('FIXED_BINDINGS-descKeys existieren in allen fuenf Sprachdateien', () => {
    const dicts = Object.fromEntries(
      LANGS.map((lang) => [
        lang,
        JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8')),
      ]),
    );
    for (const fixed of FIXED_BINDINGS) {
      for (const lang of LANGS) {
        expect(dicts[lang][fixed.descKey], `${lang}: ${fixed.descKey}`).toBeTruthy();
      }
    }
  });

  it('Ueberschreiben-Semantik: anderes Kommando freiraeumen loest den Konflikt', () => {
    const d = draft();
    // Draft-Merge wie im Settings-Dialog: search.openReplace soll Ctrl+F
    // erhalten, search.open wird freigeraeumt.
    d['search.open'] = '';
    d['search.openReplace'] = 'Ctrl+F';
    expect(findBindingConflict(d, 'search.openReplace', 'Ctrl+F')).toBeNull();
    expect(findBindingConflict(d, 'tab.close', 'Ctrl+F')).toEqual({
      type: 'command',
      commandId: 'search.openReplace',
    });
  });
});

// 4T-0211 (Hotfix 0.28.1): Apply-Sicherheitsnetz gegen doppelt vergebene
// Bindings — der Einzel-Reset konnte den Default auf eine inzwischen
// anderweitig belegte Kombination zuruecksetzen (Nutzer-Befund aus der
// Gesamtabnahme 0.28.0: AutoSave auf Strg+N, Neu freigeraeumt, Reset
// bei Neu erzeugte Strg+N doppelt).
describe('findDuplicateBindings', () => {
  const draft = () => {
    const d = {};
    for (const cmd of COMMANDS) {
      d[cmd.id] = cmd.defaultBindings.length > 0 ? cmd.defaultBindings[0] : '';
    }
    return d;
  };

  it('Default-Draft ist duplikatfrei', () => {
    expect(findDuplicateBindings(draft())).toEqual([]);
  });

  it('erkennt das Reset-Duplikat aus dem Nutzer-Befund (normalisiert)', () => {
    const d = draft();
    // Ueberschreiben hatte Neu freigeraeumt, AutoSave traegt Strg+N;
    // der Reset setzte Neu wieder auf den Default zurueck.
    d['file.toggleAutoSave'] = 'Ctrl+N';
    d['file.newTab'] = 'CmdOrCtrl+N';
    const duplicates = findDuplicateBindings(d);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].binding).toBe('Ctrl+N');
    expect(duplicates[0].commandIds.sort()).toEqual(['file.newTab', 'file.toggleAutoSave']);
  });

  it('entbundene Kommandos und unbekannte IDs zaehlen nicht', () => {
    const d = draft();
    d['file.newTab'] = '';
    d['gibt.esNicht'] = 'CmdOrCtrl+O';
    expect(findDuplicateBindings(d)).toEqual([]);
  });
});

describe('formatTimestamp', () => {
  it('liefert Lokalzeit als yyyy-mm-dd hh:mm mit fuehrenden Nullen', () => {
    expect(formatTimestamp(new Date(2026, 5, 3, 7, 5))).toBe('2026-06-03 07:05');
    expect(formatTimestamp(new Date(2026, 11, 24, 23, 59))).toBe('2026-12-24 23:59');
  });

  it('Format-Regex deckt das Ergebnis ab', () => {
    expect(formatTimestamp(new Date())).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
