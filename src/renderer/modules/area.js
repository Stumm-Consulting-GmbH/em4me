// 4T-0323 (Epic 3E-0058): Renderer-seitige Bereichs-Vorprüfung.
//
// Freundliche erste Linie der harten Bereichs-Grenze (lokalisierte
// Statusbar-Meldung statt generischem Lesefehler); die autoritative
// Prüfung sitzt main-seitig in src/main/area-path.js (file:read,
// Dialoge, Tab-Transfer). Vergleich normalisiert: Kleinschreibung,
// Backslashes, ohne Trailing-Separatoren.
//
// 4T-0324: dazu die Außen-Link-Warnung — lokale Link-Ziele werden
// doc-relativ aufgelöst (reiner String-Resolver, kein fs) und außerhalb
// liegende Ziele im Render-Pane markiert; die Editor-Marker setzt die
// Linter-Regel outsideAreaLink (editor.js) mit demselben Resolver.
'use strict';

import { t } from '../i18n.js';

import { state } from './app-state.js';

// 4T-0616 (Epic 3E-0116): exportiert, weil die Bereichs-Suche Pfade aus dem
// Hauptprozess mit denen offener Reiter vergleicht. Zwei Normalisierungen
// nebeneinander liefen bei Trenner- oder Schreibweisen-Unterschieden
// auseinander, und der Fehler waere ein still ausbleibender Treffer.
export function normalizeForCompare(p) {
  return String(p)
    .replace(/\//g, '\\')
    .replace(/[\\]+$/, '')
    .toLowerCase();
}

// true, wenn ein Bereich aktiv ist UND der Pfad außerhalb liegt.
export function isOutsideActiveArea(filePath) {
  if (!state.areaPath || !filePath) return false;
  const root = normalizeForCompare(state.areaPath);
  const target = normalizeForCompare(filePath);
  if (root === '' || target === '') return false;
  return !(target === root || target.startsWith(root + '\\'));
}

// 4T-0324: Löst ein lokales Link-Ziel gegen den Pfad des Dokuments auf
// (reiner String-Resolver: `.`/`..`-Segmente, gemischte Trenner, absolute
// Windows-Pfade; URI-Encoding wird dekodiert). null für URLs, Anker und
// leere Ziele.
export function resolveLocalTarget(basePath, target) {
  if (!basePath || !target) return null;
  let file = String(target).split('#')[0];
  if (!file) return null;
  // URL-Schemata (https:, mailto: …) sind keine Datei-Ziele; einbuchstabige
  // "Schemata" sind Windows-Laufwerksbuchstaben und bleiben erlaubt.
  if (/^[a-z]{2,}:/i.test(file)) return null;
  try {
    file = decodeURI(file);
  } catch {
    // Ungültiges Encoding: rohen Wert weiterverwenden.
  }
  file = file.replace(/\//g, '\\');
  let parts;
  if (/^[a-zA-Z]:\\/.test(file)) {
    parts = file.split('\\');
  } else {
    const baseDir = String(basePath).replace(/\//g, '\\').split('\\').slice(0, -1);
    parts = baseDir.concat(file.split('\\'));
  }
  const stack = [];
  for (const seg of parts) {
    if (seg === '.' || (seg === '' && stack.length > 0)) continue;
    if (seg === '..') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('\\');
}

// 4T-0324: markiert im gerenderten DOM alle Links, deren lokales Ziel
// außerhalb des aktiven Bereichs liegt (Warn-Klasse plus Tooltip mit dem
// vollen Ziel-Pfad). Ohne aktiven Bereich ein No-op. Links innerhalb von
// Markdown-Embeds lösen gegen die Embed-Datei auf (data-embed-base).
export function markOutsideAreaLinks(container, basePath) {
  if (!state.areaPath || !container || !basePath) return;
  for (const a of container.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || /^[a-z]{2,}:/i.test(href)) continue;
    const embedBody = a.closest('.wiki-embed-md-body');
    const base = embedBody && embedBody.dataset.embedBase ? embedBody.dataset.embedBase : basePath;
    let target = href;
    if (a.classList.contains('wikilink')) {
      const file = href.split('#')[0];
      if (!file) continue;
      target = /\.[a-z0-9]+$/i.test(file) ? file : `${file}.md`;
    }
    const resolved = resolveLocalTarget(base, target);
    if (resolved && isOutsideActiveArea(resolved)) {
      a.classList.add('outside-area-link');
      a.title = t('linter.outsideAreaLink.tooltip').replace('{target}', resolved);
    }
  }
}
