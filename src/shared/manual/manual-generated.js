// 4T-000716 (Epic 3E-000137): Geteilte Erzeugung der generierten Handbuch-Seiten.
//
// Prozessneutrales CommonJS-Modul (Muster src/shared/manual/manual-pages.js): reine
// Daten und reine Funktionen ohne DOM- und ohne Electron-Abhängigkeit, damit
// die Funktions- und die Tastenkürzel-Seite in App und Web-Bau aus einer
// Quelle entstehen statt in zwei Fassungen zu leben. Die Erzeugung liegt zuvor
// im Renderer (manual.js über autocomplete-help.js); dieser Schnitt ist
// verhaltensneutral, das erzeugte Markdown bleibt Zeichen für Zeichen gleich.
//
// Die veränderlichen Anteile kommen als Parameter herein: eine
// Übersetzungs-Funktion `t` (Verhalten wie die Renderer-t: reiner Schlüssel-
// Nachschlag, keine Platzhalter-Interpolation), die wirksamen Bindings (App:
// gemergte Nutzer-Overrides; Web: Default-Bindings der Registry) und die Menge
// deaktivierter Kommandos (App: aus den Erweiterungen; Web: leer). So bleibt
// das Modul frei von Laufzeit-Zustand.
'use strict';

// COMMANDS liefert die Kommando-Reihenfolge, bindingToDisplayString den
// deutschen Anzeige-String eines Bindings (Muster wie zuvor im Renderer).
// 4T-000993: Die Anzeige-Konvertierung liegt in command-bindings.js.
const { COMMANDS } = require('../commands/commands.js');
const { bindingToDisplayString } = require('../commands/command-bindings.js');

// Die Gruppen-Tabelle liegt seit 4T-001075 in ihrem eigenen Modul (Registry,
// waechst mit jedem Katalog-Eintrag); sie wird hier gebraucht und zugleich
// weiter exportiert, damit die Importeure eine Anlaufstelle behalten.
const { HELP_FEATURE_GROUPS } = require('./manual-feature-groups.js');

// Statische Rest-Liste der bewusst nicht konfigurierbaren Bindings (Esc-
// Kaskade, Alt-Menü, Tab-Indent, Maus, Such-Enter), hinter den aus der
// Registry erzeugten Zeilen.
const STATIC_HELP_SHORTCUTS = [
  { keys: ['Strg+Mausrad'], descKey: 'help.shortcut.zoomWheel' },
  { keys: ['Tab', 'Umschalt+Tab'], descKey: 'help.shortcut.tabIndent' },
  { keys: ['Mittlere Maustaste'], descKey: 'help.shortcut.middleClickClose' },
  { keys: ['Enter', 'Umschalt+Enter'], descKey: 'help.shortcut.searchNavEnter' },
  // K-16 (4T-000191): "Alle ersetzen" im Ersetzen-Feld.
  { keys: ['Umschalt+Enter', 'Alt+Enter'], descKey: 'help.shortcut.replaceAll' },
  { keys: ['Esc'], descKey: 'help.shortcut.escape' },
  { keys: ['Alt'], descKey: 'help.shortcut.menuBar' },
];

// Tasten-Lokalisierung: Tastennamen sehen je Sprache anders aus ("Strg" vs.
// "Ctrl", "Umschalt" vs. "Shift"). Die deutschen Anzeige-Tokens werden über
// i18n-Keys übersetzt, mit dem deutschen Token als Rückfall.
const KEY_LABEL_KEY = {
  Strg: 'help.key.ctrl',
  Umschalt: 'help.key.shift',
  Alt: 'help.key.alt',
  Tab: 'help.key.tab',
  Enter: 'help.key.enter',
  Esc: 'help.key.esc',
  'Mittlere Maustaste': 'help.key.middleClick',
  // 4T-000027: Mausrad als eigene "Taste" fuer den Zoom-per-Mausrad-Shortcut.
  Mausrad: 'help.key.mouseWheel',
  // 4T-000850 (Epic 3E-000147): Bild-Tasten der Leseführung. Die deutschen
  // Anzeige-Tokens liefert DISPLAY_KEY_MAP in src/shared/commands/commands.js; ohne
  // Eintrag hier blieben sie in allen Sprachen deutsch stehen.
  'Bild auf': 'help.key.pageUp',
  'Bild ab': 'help.key.pageDown',
};

function localizeKey(token, t) {
  const key = KEY_LABEL_KEY[token];
  if (!key) return token;
  const translated = t(key);
  return translated === key ? token : translated;
}

// Helfer für den "+"-Split der Anzeige-Tokens ("Strg+E" -> ["Strg", "E"],
// "Strg++" -> ["Strg", "+"], das zweite Plus ist Inhalt, nicht Trenner).
function splitShortcutKeys(k) {
  if (k.endsWith('+') && k.length >= 2 && k[k.length - 2] === '+') {
    const head = k.slice(0, -1); // "Strg+"
    const headTokens = head.split('+').filter((s) => s !== '');
    return [...headTokens, '+'];
  }
  return k.split('+');
}

// Pipe-Zeichen für Tabellen-Zellen escapen: vorhandene \|-Escapes der Quell-
// Strings zuerst neutralisieren, dann einheitlich neu escapen, sonst würde ein
// bereits escaptes Pipe doppelt maskiert.
function escapeTableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

// Tastenkürzel-Zeilen aus der Kommando-Registry mit den wirksamen Bindings
// plus statischer Rest-Liste. Kommandos ohne descKey und deaktivierte
// Kommandos entfallen; Einträge mit gleichem descKey bündeln in eine Zeile.
function buildHelpShortcutRows({ effectiveBindings, disabledCommandIds }) {
  // 4T-000294: Kommandos effektiv deaktivierter Erweiterungen erscheinen
  // nicht (die generierte Handbuch-Seite zeigt keine toten Kuerzel).
  const disabled = disabledCommandIds || new Set();
  const rows = [];
  const rowByDescKey = new Map();
  for (const cmd of COMMANDS) {
    if (!cmd.descKey) continue;
    if (disabled.has(cmd.id)) continue;
    const bindings = effectiveBindings[cmd.id] || [];
    if (bindings.length === 0) continue;
    let row = rowByDescKey.get(cmd.descKey);
    if (!row) {
      row = { keys: [], descKey: cmd.descKey };
      rowByDescKey.set(cmd.descKey, row);
      rows.push(row);
    }
    for (const binding of bindings) {
      const display = bindingToDisplayString(binding);
      if (display && !row.keys.includes(display)) row.keys.push(display);
    }
  }
  return [...rows, ...STATIC_HELP_SHORTCUTS];
}

// Funktions-Seite: H2 pro Gruppe aus HELP_FEATURE_GROUPS, darunter eine
// dreispaltige Pipe-Tabelle (Funktion, Beschreibung, Zugang).
//
// 4T-000941: Anders als die Tastenkürzel-Seite LÄSST die Funktions-Seite nichts
// weg, wenn eine Erweiterung abgeschaltet ist, sondern kennzeichnet die Zeile
// (Entscheidung des Product Owners vom 2026-08-10). Begründung: Wer eine
// vermisste Funktion sucht, braucht gerade dann ihre Beschreibung und den Weg
// zum Wiedereinschalten; ein Weglassen nähme ihm beides. Ohne übergebene Menge
// erscheint der Katalog unverändert — so nutzt ihn der Web-Bau.
function generateFunctionsPage(t, opts = {}) {
  const abgeschaltet = opts.disabledFeatureKeys || new Set();
  const lines = [];
  lines.push(`# ${t('manual.page.functions.title')}`);
  lines.push('');
  lines.push(t('manual.functions.intro'));
  lines.push('');
  for (const group of HELP_FEATURE_GROUPS) {
    lines.push(`## ${t(group.groupKey)}`);
    lines.push('');
    lines.push(
      `| ${t('manual.functions.colFunction')} | ${t('manual.functions.colDescription')} | ${t('manual.functions.colAccess')} |`,
    );
    lines.push('|---|---|---|');
    for (const featureKey of group.features) {
      const name = featureKey.replace('help.feature.', '');
      const nameCell = escapeTableCell(t(`help.featureName.${name}`));
      let descCell = escapeTableCell(t(featureKey));
      const accessCell = escapeTableCell(t(`help.featureAccess.${name}`));
      // Die Marke steht als Text in der Beschreibungs-Spalte, nicht als
      // Formatierung: Ein Ausgrauen traegt in einer Markdown-Tabelle nicht.
      if (abgeschaltet.has(featureKey)) {
        descCell = `**${escapeTableCell(t('manual.functions.disabledMark'))}** ${descCell}`;
      }
      lines.push(`| **${nameCell}** | ${descCell} | ${accessCell} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Tastenkürzel-Seite: Registry-Zeilen mit den wirksamen Bindings plus
// statische Rest-Liste. Tasten erscheinen als Inline-Code, lokalisiert über
// localizeKey.
function generateShortcutsPage({ t, effectiveBindings, disabledCommandIds }) {
  const lines = [];
  lines.push(`# ${t('manual.page.shortcuts.title')}`);
  lines.push('');
  lines.push(t('help.shortcutsConfigurableNote'));
  lines.push('');
  lines.push(`| ${t('manual.shortcuts.colKeys')} | ${t('manual.shortcuts.colDescription')} |`);
  lines.push('|---|---|');
  for (const row of buildHelpShortcutRows({ effectiveBindings, disabledCommandIds })) {
    const keys = row.keys
      .map(
        (k) =>
          '`' +
          splitShortcutKeys(k)
            .map((token) => localizeKey(token, t))
            .join('+') +
          '`',
      )
      .join(' / ');
    lines.push(`| ${keys} | ${escapeTableCell(t(row.descKey))} |`);
  }
  return lines.join('\n');
}

module.exports = {
  HELP_FEATURE_GROUPS,
  STATIC_HELP_SHORTCUTS,
  KEY_LABEL_KEY,
  escapeTableCell,
  splitShortcutKeys,
  localizeKey,
  buildHelpShortcutRows,
  generateFunctionsPage,
  generateShortcutsPage,
};
