// 4T-000424 (Epic 3E-000080): Vorlagen-Quellen — Auflösung des wirksamen
// Vorlagen-Ordners (Bereich vor global), Normalisierung der Konfigurations-
// Werte aus Bereichsdatei bzw. App-Einstellungen und die Pfad-Sicherung der
// Lese-Zugriffe (kein Ausbruch aus dem Vorlagen-Ordner).
//
// Electron-frei und rein (unit-testbar, Vorbild area-path.js); den Datei-
// Zugriff (Ordner-Scan, Vorlagen-Lesen) übernimmt main.js. Die Ordner-Regeln
// (4T-000427) docken später an derselben Konfigurations-Struktur an.
'use strict';

const path = require('node:path');
const { isInsideArea, isSamePath, normalizeForCompare } = require('../area/area-path');
const { toLogicalName } = require('../../shared/subpages');

// 4T-001456 (Epic 3E-000190): Schlüssel der eigenen Quelle in der Kette.
// Ein fester Wert statt null, damit jeder Eintrag der Auswahl-Liste einen
// Schlüssel trägt und die Kanäle keinen Sonderfall führen müssen.
const EIGENE_QUELLE = '';

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

// Die Auflösung der Vorlagen-Quellen eines Fensters.
//
// **Ursprünglich eine einzige Quelle** (Architekturentscheidung 2 des Epics
// 3E-000080): Die Bereichs-Konfiguration übersteuerte die globale vollständig,
// pro Fenster war genau ein Vorlagen-Ordner wirksam, «keine Misch-Auflösung».
//
// **Seit 4T-001456 (Epic 3E-000190) eine geordnete KETTE** (Architektur-
// entscheidung 4 jenes Epics, Entscheidung des Product Owners vom 2026-09-05):
// der eigene Ordner zuerst, danach je verknüpftem Bereich mit gesetztem Opt-in
// dessen Vorlagen-Ordner. Die Zusage «genau ein Ordner» ist damit nicht
// bewahrt, sondern ERSETZT durch «eine geordnete Kette sichtbar benannter
// Quellen»: Die Vorhersagbarkeit, um derer willen sie gegeben wurde, trägt
// jetzt die sichtbare Herkunft je Eintrag plus die konfigurierte Reihenfolge.
//
// Was sich NICHT geändert hat: Die Übersteuerung der globalen Konfiguration
// durch die Bereichs-Sektion, die Herkunft der Regeln (sie gehören dem eigenen
// Bereich; ein verknüpfter Bereich steuert Vorlagen bei, keine Ordner-Regeln)
// und die Einschließung des Lese-Zugriffs — sie gilt jetzt je Quelle.
//
// Bereichs-Ordner sind relativ zur Bereichs-Wurzel notiert (absolute Angaben
// werden toleriert, path.resolve deckt beide Formen ab); der globale Ordner
// ist absolut. Liefert { source: 'area'|'global'|'none', folder, rules,
// baseDir, sources } — `folder` ist unverändert der EIGENE Ordner (absolut
// oder null), `baseDir` die Auflösungs-Basis der Regel-Ordner, und `sources`
// die ganze Kette als { key, folder, prefix, name }. Der Schlüssel `key` ist
// das, was die Kanäle durchreichen; `prefix` ist null für die eigene Quelle.
//
// `linkedSources` reicht der Aufrufer fertig herein — die Ordner der
// verknüpften Bereiche stehen in DEREN Bereichsdateien und sind nur mit
// Datei-Zugriff zu ermitteln, der hier nicht hingehört (area-config.js).
function resolveTemplatesConfig({ areaRootPath, areaConfig, globalConfig, linkedSources }) {
  const area = normalizeTemplatesConfig(areaConfig);
  if (area && typeof areaRootPath === 'string' && areaRootPath !== '') {
    const eigener = area.folder ? path.resolve(areaRootPath, area.folder) : null;
    return {
      source: 'area',
      folder: eigener,
      rules: area.rules,
      baseDir: path.resolve(areaRootPath),
      sources: kette(eigener, linkedSources),
    };
  }
  const global = normalizeTemplatesConfig(globalConfig);
  if (global) {
    const globalerOrdner = global.folder ? path.resolve(global.folder) : null;
    // Ohne Bereichs-Sektion gibt es keine Verknüpfungen, die zählen könnten:
    // Die Kette ist dann die globale Quelle allein.
    return {
      source: 'global',
      folder: globalerOrdner,
      rules: global.rules,
      baseDir: null,
      sources: kette(globalerOrdner, null),
    };
  }
  return { source: 'none', folder: null, rules: [], baseDir: null, sources: [] };
}

// Baut die geordnete Kette: der eigene Ordner zuerst, danach die verknüpften
// in der Reihenfolge ihrer Einträge. Ein Eintrag ohne Ordner entfällt — ein
// verknüpfter Bereich ohne eigene Vorlagen steuert nichts bei, und ein leerer
// Kettenglied-Platz wäre für jeden Aufrufer nur eine Fallunterscheidung mehr.
function kette(eigenerOrdner, linkedSources) {
  const sources = [];
  if (eigenerOrdner)
    sources.push({ key: EIGENE_QUELLE, folder: eigenerOrdner, prefix: null, name: null });
  for (const quelle of linkedSources || []) {
    if (!quelle || typeof quelle.folder !== 'string' || quelle.folder === '') continue;
    if (!quelle.prefix) continue;
    sources.push({
      key: quelle.prefix,
      folder: path.resolve(quelle.folder),
      prefix: quelle.prefix,
      name: quelle.name || null,
    });
  }
  return sources;
}

/**
 * Sucht eine Quelle der Kette an ihrem Schlüssel.
 *
 * Ohne Schlüssel gilt die ERSTE Quelle — das ist der Rückfall für Aufrufer aus
 * der Zeit vor der Kette (etwa eine Ordner-Regel ohne Qualifizierung) und
 * zugleich die Vorrang-Regel bei Namensgleichheit.
 *
 * @param {Array} sources Kette aus resolveTemplatesConfig.
 * @param {*} key Schlüssel der gesuchten Quelle.
 * @returns {object|null} Die Quelle oder null.
 */
function findTemplateSource(sources, key) {
  const liste = sources || [];
  if (liste.length === 0) return null;
  if (key === undefined || key === null || key === '') return liste[0];
  return liste.find((q) => q.key === key) || null;
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

// 4T-000427 (Epic 3E-000080): Ordner-Regel-Auflösung für eine neu angelegte
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
  EIGENE_QUELLE,
  normalizeTemplatesConfig,
  resolveTemplatesConfig,
  findTemplateSource,
  resolveTemplateFile,
  templateEntryFromRelPath,
  sortedTemplateEntries,
  matchFolderRule,
};
