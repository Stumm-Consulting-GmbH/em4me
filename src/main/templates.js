// 4T-0424 (Epic 3E-0080): Vorlagen-Quellen — Auflösung des wirksamen
// Vorlagen-Ordners (Bereich vor global), Normalisierung der Konfigurations-
// Werte aus Bereichsdatei bzw. App-Einstellungen und die Pfad-Sicherung der
// Lese-Zugriffe (kein Ausbruch aus dem Vorlagen-Ordner).
//
// Electron-frei und rein (unit-testbar, Vorbild area-path.js); den Datei-
// Zugriff (Ordner-Scan, Vorlagen-Lesen) übernimmt main.js. Die Ordner-Regeln
// (4T-0427) docken später an derselben Konfigurations-Struktur an.
'use strict';

const path = require('node:path');
const { isInsideArea, isSamePath, normalizeForCompare } = require('./area-path');
const { toLogicalName } = require('../shared/subpages');

// Normalisiert eine Vorlagen-Konfiguration (templates-Sektion der Bereichs-
// datei bzw. globale Einstellungs-Werte) auf { folder, rules }. Tolerant nach
// dem Fehler-Isolations-Muster der Bereichsdatei: defekte oder fehlende Teile
// fallen auf null bzw. leer, nie auf einen Wurf. null = keine Konfiguration.
function normalizeTemplatesConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const folder =
    typeof value.folder === 'string' && value.folder.trim() !== '' ? value.folder.trim() : null;
  const rules = [];
  if (Array.isArray(value.rules)) {
    for (const r of value.rules) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const ruleFolder = typeof r.folder === 'string' ? r.folder.trim() : null;
      const template = typeof r.template === 'string' ? r.template.trim() : '';
      // Leeres folder ('') ist als Wurzel-Regel erlaubt; ohne Vorlage ist
      // die Regel wirkungslos und entfällt.
      if (ruleFolder === null || template === '') continue;
      rules.push({ folder: ruleFolder, template });
    }
  }
  if (folder === null && rules.length === 0) return null;
  return { folder, rules };
}

// Die eine Auflösung der Vorlagen-Quelle eines Fensters (Architektur-
// entscheidung 2 des Epics): Die Bereichs-Konfiguration übersteuert die
// globale VOLLSTÄNDIG (keine Misch-Auflösung) — liegt eine Bereichs-Sektion
// vor, zählen ausschließlich deren Ordner und Regeln. Ohne Bereich oder ohne
// Bereichs-Sektion greift die globale Konfiguration aus den App-Einstellungen.
//
// Bereichs-Ordner sind relativ zur Bereichs-Wurzel notiert (absolute Angaben
// werden toleriert, path.resolve deckt beide Formen ab); der globale Ordner
// ist absolut. Liefert { source: 'area'|'global'|'none', folder, rules,
// baseDir } — folder absolut oder null (nicht konfiguriert), baseDir ist die
// Auflösungs-Basis der Regel-Ordner (Bereichs-Wurzel bzw. null für global).
function resolveTemplatesConfig({ areaRootPath, areaConfig, globalConfig }) {
  const area = normalizeTemplatesConfig(areaConfig);
  if (area && typeof areaRootPath === 'string' && areaRootPath !== '') {
    return {
      source: 'area',
      folder: area.folder ? path.resolve(areaRootPath, area.folder) : null,
      rules: area.rules,
      baseDir: path.resolve(areaRootPath),
    };
  }
  const global = normalizeTemplatesConfig(globalConfig);
  if (global) {
    return {
      source: 'global',
      folder: global.folder ? path.resolve(global.folder) : null,
      rules: global.rules,
      baseDir: null,
    };
  }
  return { source: 'none', folder: null, rules: [], baseDir: null };
}

// Absoluter Pfad einer Vorlage aus dem aufgelösten Ordner plus relativem
// Pfad. null bei Ausbruch ('..'-Segmente, absolute Angaben außerhalb) oder
// wenn das Ziel der Ordner selbst wäre — Auflistung und Lesen bleiben
// innerhalb des konfigurierten Vorlagen-Ordners (Sicherheits-Rahmen).
function resolveTemplateFile(folder, relPath) {
  if (typeof folder !== 'string' || folder === '') return null;
  if (typeof relPath !== 'string' || relPath.trim() === '') return null;
  const abs = path.resolve(folder, relPath);
  if (!isInsideArea(folder, abs) || isSamePath(folder, abs)) return null;
  return abs;
}

// Anzeige-Eintrag einer Vorlagen-Datei aus ihrem Pfad relativ zum Vorlagen-
// Ordner: name ist der logische Datei-Titel (Unterseiten-Trennzeichen U+2215
// als '/', ohne Markdown-Endung), group der Unterordner-Pfad ('' für die
// Wurzel; '/'-Trenner) als Gruppierung im Auswahl-Popup.
function templateEntryFromRelPath(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  const group = idx >= 0 ? norm.slice(0, idx) : '';
  const base = idx >= 0 ? norm.slice(idx + 1) : norm;
  const name = toLogicalName(base.replace(/\.(md|markdown|mdown|mkd)$/i, ''));
  return { relPath: norm, group, name };
}

// Sortierung der Auswahl-Liste: Wurzel-Einträge zuerst, dann Gruppen
// alphabetisch; innerhalb einer Gruppe nach Anzeige-Name. Locale-bewusst und
// numerisch (Muster sortedAreaListing); relPath als deterministischer
// Tiebreaker bei gleichem Anzeige-Namen.
function sortedTemplateEntries(entries) {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...(entries || [])].sort((a, b) => {
    if (a.group !== b.group) {
      if (a.group === '') return -1;
      if (b.group === '') return 1;
      const byGroup = collator.compare(a.group, b.group);
      if (byGroup !== 0) return byGroup;
    }
    return collator.compare(a.name, b.name) || collator.compare(a.relPath, b.relPath);
  });
}

// 4T-0427 (Epic 3E-0080): Ordner-Regel-Auflösung für eine neu angelegte
// Datei. Regel-Modell { folder, template }: folder relativ zur Auflösungs-
// Basis (Bereichs-Wurzel; '' = Wurzel-Regel) bzw. absolut bei globaler
// Konfiguration (relative globale Einträge sind wirkungslos, es gibt keine
// Basis); template ist der Pfad relativ zum Vorlagen-Ordner. Der TIEFSTE
// passende Ordner gewinnt (Unterordner zählen zum Treffer); Dateien im
// Vorlagen-Ordner selbst sind grundsätzlich ausgenommen (Epic-Entscheidung 3).
// Liefert den template-Eintrag der Gewinner-Regel oder null.
function matchFolderRule({ filePath, rules, baseDir, templatesFolder }) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const absolute = path.resolve(filePath);
  if (templatesFolder && isInsideArea(templatesFolder, absolute)) return null;
  let bestTemplate = null;
  let bestLen = -1;
  for (const rule of rules || []) {
    if (!rule || typeof rule.template !== 'string' || rule.template === '') continue;
    let folderAbs;
    if (typeof baseDir === 'string' && baseDir !== '') {
      folderAbs = path.resolve(baseDir, rule.folder || '.');
    } else if (typeof rule.folder === 'string' && path.isAbsolute(rule.folder)) {
      folderAbs = path.resolve(rule.folder);
    } else {
      continue;
    }
    if (!isInsideArea(folderAbs, absolute)) continue;
    const len = (normalizeForCompare(folderAbs) || '').length;
    if (len > bestLen) {
      bestTemplate = rule.template;
      bestLen = len;
    }
  }
  return bestTemplate;
}

module.exports = {
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
};
