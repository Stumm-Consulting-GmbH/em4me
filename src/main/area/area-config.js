// Konfigurations-Sektionen der Bereichsdatei (Area_Settings.mdda): die acht
// strukturgleichen Leser samt der beiden Aufloeser fuer Anlagen und Vorlagen.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Alle Leser teilen denselben
// Migrations-Lese-Pfad (readAreaSettingsRaw zieht eine vorhandene Alt-Datei
// .mddb still auf .mdda) und dieselbe Fehler-Regel: eine fehlende oder defekte
// Bereichsdatei wirkt wie "nicht konfiguriert" und wird nie ueberschrieben.
//
// Eigener Zustand: keiner. Die Factory-Form traegt die Naehte nach main.js.
// Die Bausteine aus src/main/documents/ (Container-Format, Selbst-Schreib-
// Merker, Anlagen- und Vorlagen-Kern) kommen bewusst als Deps und nicht per
// Require: documents/ importiert seinerseits aus area/ (templates.js ->
// area-path.js), und ein Require hier ergaebe einen Ordner-Zyklus
// (Entwicklungsrichtlinien §1).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { readAreaSettingsRaw } = require('./area-migration');

/**
 * Baut die Leser und Aufloeser der Bereichs-Konfiguration.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {() => object|null} deps.getStore Settings-Store (erst nach loadStore da).
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {Function} deps.markSelfWriting Eigenen Schreibvorgang merken.
 * @param {object} deps.mddStore Container-Format der Markdown-Data-Dateien.
 * @param {object} deps.attachmentPath Ablage-Kern der Anlagen.
 * @param {Function} deps.resolveTemplatesConfig Aufloesung der Vorlagen-Konfiguration.
 * @returns {object} Die elf Zugriffs-Funktionen unter ihren bisherigen Namen.
 */
function createAreaConfig(deps) {
  const { getStore, areaOfWindow, markSelfWriting, mddStore, attachmentPath } = deps;
  const { resolveTemplatesConfig } = deps;

  // 4T-0332: Bereichs-Default aus der Bereichsdatei Area_Settings.mdda im
  // Bereichs-Wurzelordner. undefined = kein Default gesetzt (erben); eine
  // defekte Bereichsdatei wirkt wie nicht gesetzt (und wird nie ueberschrieben,
  // der Schreib-Pfad in history:setAreaDefault lehnt dann ab). 4T-0352 (Epic
  // 3E-0064): das Lesen migriert eine vorhandene Alt-Datei .mddb still auf .mdda.
  async function readAreaHistoryDefault(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    const value = parsed.container.settings.history;
    return typeof value === 'boolean' ? value : undefined;
  }

  // 4T-0424 (Epic 3E-0080): templates-Sektion der Bereichsdatei lesen.
  // undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
  // nicht konfiguriert; die Normalisierung uebernimmt resolveTemplatesConfig).
  // Das Lesen laeuft ueber denselben Migrations-Pfad wie der Historien-Default.
  async function readAreaTemplatesConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.templates;
  }

  // 4T-0787 (Epic 3E-0125): attachments-Sektion der Bereichsdatei lesen.
  // undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt; das wirkt wie
  // "Wie allgemein" und faellt damit auf die globale Einstellung zurueck.
  // Gleicher Migrations-Lese-Pfad wie templates-Sektion und Historien-Default.
  async function readAreaAttachmentsConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.attachments;
  }

  // 4T-0787: wirksame Anlagen-Konfiguration eines Fensters. Die Bereichs-Sektion
  // uebersteuert die globale; fehlt sie oder traegt sie keine Form, gilt die
  // globale ("Wie allgemein"). Der zentrale Bereichs-Ordner ist nur mit
  // gebundenem Bereich sinnvoll und wird ohne ihn verworfen, damit eine aus einem
  // anderen Fenster stammende Einstellung hier nicht ins Leere laeuft.
  async function resolveAttachmentsConfig(area) {
    const store = getStore();
    const global = {
      form: store ? store.get('attachments.form') : null,
      ordnername: store ? store.get('attachments.folder') : null,
    };
    let wirksam = global;
    if (area) {
      const bereich = await readAreaAttachmentsConfig(area.rootPath);
      if (bereich && typeof bereich.form === 'string' && bereich.form !== '') {
        wirksam = { form: bereich.form, ordnername: bereich.ordnername || global.ordnername };
      }
    }
    const normalisiert = attachmentPath.normalisiereAnlagenKonfig(wirksam);
    if (!area && normalisiert.form === 'bereich') {
      return { form: attachmentPath.STANDARD_FORM, ordnername: normalisiert.ordnername };
    }
    return normalisiert;
  }

  // 4T-0787 (Epic 3E-0125): Dateiname einer mitgebrachten Anlage. Der Renderer
  // darf den Namen vorgeben (File.name der Zwischenablage bzw. des Ziehens);
  // faellt er aus, dient der Basisname des Quell-Pfads als Rueckfall. Liefert
  // null, wenn beides unbrauchbar ist — dann erzeugt der Aufrufer einen Namen.
  function bereinigterQuellName(vorschlag, quellPfad) {
    return (
      attachmentPath.bereinigeDateinamen(vorschlag) ||
      attachmentPath.bereinigeDateinamen(quellPfad) ||
      null
    );
  }

  // 4T-0431 (Epic 3E-0081): journals-Sektion der Bereichsdatei lesen.
  // undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
  // nicht konfiguriert; die Normalisierung uebernimmt normalizeJournalsConfig).
  // Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
  // eine defekte Bereichsdatei setzt nur die Journal-Funktion aus.
  async function readAreaJournalsConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.journals;
  }

  // 4T-0446 (Epic 3E-0083): propertyProfiles-Sektion der Bereichsdatei lesen.
  // undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
  // nicht konfiguriert; die Normalisierung übernimmt normalizeProfilesConfig).
  // Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
  // eine defekte Bereichsdatei setzt nur die Profil-Funktion aus.
  async function readAreaProfilesConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.propertyProfiles;
  }

  // 4T-0543 (Epic 3E-0097): calendarSystems-Sektion der Bereichsdatei lesen.
  // undefined = keine Sektion oder Bereichsdatei fehlt/ist defekt (wirkt wie
  // nicht konfiguriert; die Normalisierung uebernimmt normalizeCalendarConfig).
  // Gleicher Migrations-Lese-Pfad wie Historien-Default und templates-Sektion;
  // eine defekte Bereichsdatei setzt nur die Kalender-Funktion aus.
  async function readAreaCalendarConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.calendarSystems;
  }

  // 4T-0625 (Epic 3E-0119): sidebarLayouts-Sektion der Bereichsdatei lesen
  // (Bereichs-Varianten der Sidebar). undefined = keine Sektion oder
  // Bereichsdatei fehlt/ist defekt (wirkt wie keine Bereichs-Varianten);
  // die Normalisierung übernimmt normalizeSidebarVariantList.
  async function readAreaSidebarVariantsConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.sidebarLayouts;
  }

  // 4T-0611 (Epic 3E-0115): bookmarks-Sektion der Bereichsdatei lesen
  // (Bereichs-Lesezeichen). undefined = keine Sektion oder Bereichsdatei
  // fehlt/ist defekt (wirkt wie keine Bereichs-Lesezeichen); die
  // Sanitisierung uebernimmt normalizeBookmarksTree. Gleicher Migrations-
  // Lese-Pfad wie die uebrigen Sektionen.
  async function readAreaBookmarksConfig(rootPath) {
    const raw = await readAreaSettingsRaw({
      mddaPath: path.join(rootPath, mddStore.MDDA_FILENAME),
      mddbPath: path.join(rootPath, mddStore.LEGACY_MDDB_FILENAME),
      readFile: (p) => fs.readFile(p, 'utf8'),
      rename: (from, to) => fs.rename(from, to),
      markSelfWriting,
    });
    if (raw === undefined) return undefined;
    const parsed = mddStore.parseSettingsContainer(raw);
    if (!parsed.ok) return undefined;
    return parsed.container.settings.bookmarks;
  }

  // 4T-0424: wirksame Vorlagen-Konfiguration eines Fensters. Bereichs-Sektion
  // (falls das Fenster einen Bereich hat) uebersteuert die globalen
  // Einstellungs-Werte vollstaendig; Details in src/main/documents/templates.js.
  async function resolveTemplatesForWindow(win) {
    const store = getStore();
    const area = areaOfWindow(win);
    const areaConfig = area ? await readAreaTemplatesConfig(area.rootPath) : undefined;
    return resolveTemplatesConfig({
      areaRootPath: area ? area.rootPath : null,
      areaConfig,
      globalConfig: {
        folder: store ? store.get('templates.folder') : null,
        rules: store ? store.get('templates.rules') : null,
      },
    });
  }

  return {
    readAreaHistoryDefault,
    readAreaTemplatesConfig,
    readAreaAttachmentsConfig,
    resolveAttachmentsConfig,
    bereinigterQuellName,
    readAreaJournalsConfig,
    readAreaProfilesConfig,
    readAreaCalendarConfig,
    readAreaSidebarVariantsConfig,
    readAreaBookmarksConfig,
    resolveTemplatesForWindow,
  };
}

module.exports = { createAreaConfig };
