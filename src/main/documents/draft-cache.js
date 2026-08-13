// Entwurfs-Zwischenspeicher (4T-0368, Epic 3E-0068): Datei-I/O der nie
// gespeicherten Unbenannt-Tabs unter <userData>/drafts samt Manifest und der
// Serialisierung der Schreibvorgaenge.
//
// Auszug aus main.js, 4T-0998 (Epic 3E-0196). Die reine Zuordnungs- und
// Manifest-Logik liegt unveraendert in draft-store.js; hier bleibt alles, was
// Platte und Reihenfolge betrifft.
//
// Ablauf: Der Renderer sammelt die Unbenannt-Tabs mit Inhalt beim Schliessen
// ein (drafts:save), hier landen sie als Inhalts-Dateien <id>.md plus
// manifest.json. Beim Start werden sie den wiederhergestellten Fenstern
// zugeteilt (draft-store.js) und ueber window:initialState als Unbenannt-Tabs
// wiederhergestellt; der Ordner wird danach geleert. Kein periodisches
// Sichern (PO: kein Absturz-Schutz).
//
// Eigentuemer-Zustand dieses Moduls:
//   draftWriteChain : Serialisierung der Schreibvorgaenge. Beim Multi-Fenster-
//                     Quit koennen mehrere Renderer ihr drafts:save quasi-
//                     gleichzeitig schicken; die Kette verhindert eine
//                     Read-modify-write-Race auf dem Manifest.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { normalizeManifest, findOrphans } = require('./draft-store');

/**
 * Baut die Entwurfs-Ablage.
 *
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {() => string} deps.getUserDataDir Nutzerdaten-Verzeichnis der App.
 * @returns {object} Ablage-API samt der Schreib-Kette dieses Moduls.
 */
function createDraftCache(deps) {
  const { getUserDataDir } = deps;

  let draftWriteChain = Promise.resolve();

  function draftsDir() {
    return path.join(getUserDataDir(), 'drafts');
  }

  function draftManifestPath() {
    return path.join(draftsDir(), 'manifest.json');
  }

  async function readDraftManifest() {
    try {
      return normalizeManifest(JSON.parse(await fs.readFile(draftManifestPath(), 'utf8')));
    } catch {
      return [];
    }
  }

  // Liest Manifest und Inhalte; raeumt verwaiste Inhalts-Dateien (ohne
  // Manifest-Eintrag) und uebergeht Manifest-Eintraege ohne Datei. Ergebnis:
  // geordnete Entwuerfe [{ id, area, content, tabSettings, order }].
  async function readAllDrafts() {
    const manifest = await readDraftManifest();
    let fileIds;
    try {
      const names = await fs.readdir(draftsDir());
      fileIds = names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3));
    } catch {
      // Ordner existiert nicht → keine Entwuerfe.
      return [];
    }

    const { orphanFiles } = findOrphans(manifest, fileIds);
    for (const id of orphanFiles) {
      try {
        await fs.unlink(path.join(draftsDir(), `${id}.md`));
      } catch {
        /* ignorieren */
      }
    }

    const fileIdSet = new Set(fileIds);
    const drafts = [];
    for (const e of manifest) {
      if (!fileIdSet.has(e.id)) continue; // Manifest-Eintrag ohne Datei
      try {
        const content = await fs.readFile(path.join(draftsDir(), `${e.id}.md`), 'utf8');
        drafts.push({
          id: e.id,
          area: e.area,
          // 4T-0539 (Epic 3E-0098): Arbeitsbereichs-Zuordnung des Entwurfs.
          workspaceId: e.workspaceId,
          content,
          tabSettings: e.tabSettings,
          order: e.order,
        });
      } catch {
        /* nicht lesbar → ueberspringen */
      }
    }
    drafts.sort((a, b) => a.order - b.order);
    return drafts;
  }

  // Haengt die Entwuerfe eines Fensters additiv an. `entries` vom Renderer:
  // [{ content, tabSettings, order }]. `areaRootPath` ist der Bereich der
  // sendenden App (autoritativ aus der App-Registry) oder null. Additiv, weil
  // beim Multi-Fenster-Quit jedes Fenster einzeln schreibt.
  // 4T-0539 (Epic 3E-0098): `workspaceId` ist die Arbeitsbereichs-Zuordnung
  // der sendenden App (ebenfalls autoritativ aus der Registry) oder null.
  async function appendDrafts(entries, areaRootPath, workspaceId) {
    const list = Array.isArray(entries)
      ? entries.filter((e) => e && typeof e.content === 'string' && e.content.trim() !== '')
      : [];
    if (list.length === 0) return;
    await fs.mkdir(draftsDir(), { recursive: true });

    const manifest = await readDraftManifest();
    const base = manifest.length;
    const savedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const id = crypto.randomUUID();
      await fs.writeFile(path.join(draftsDir(), `${id}.md`), entry.content, 'utf8');
      manifest.push({
        id,
        area: areaRootPath || null,
        workspaceId: workspaceId || null,
        order: base + (Number.isFinite(entry.order) ? entry.order : i),
        tabSettings:
          entry.tabSettings && typeof entry.tabSettings === 'object' ? entry.tabSettings : {},
        savedAt,
      });
    }
    await fs.writeFile(draftManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  }

  // Leert den Speicher vollstaendig (nach der Uebergabe an die Fenster beim
  // Start). Die neue Sitzung fuellt ihn beim naechsten App-Ende frisch, sodass
  // der neue Stand den alten ersetzt, ohne dass additive Multi-Fenster-Schreib-
  // vorgaenge innerhalb einer Quit-Runde kollidieren.
  async function clearDrafts() {
    try {
      await fs.rm(draftsDir(), { recursive: true, force: true });
    } catch {
      /* ignorieren */
    }
  }

  // 4T-0539 (Epic 3E-0098): selektiver Entferner — nur die uebergebenen
  // Entwuerfe verschwinden (Manifest-Rewrite plus Inhalts-Dateien); liegende
  // Arbeitsbereichs-Entwuerfe geschlossener Arbeitsbereiche ueberleben den
  // Start. Ein leer gewordenes Manifest raeumt den Ordner komplett.
  async function removeDraftsByIds(ids) {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    const manifest = await readDraftManifest();
    const remaining = manifest.filter((e) => !idSet.has(e.id));
    if (remaining.length === 0) {
      await clearDrafts();
      return;
    }
    for (const id of idSet) {
      try {
        await fs.rm(path.join(draftsDir(), `${id}.md`), { force: true });
      } catch {
        /* ignorieren */
      }
    }
    await fs.writeFile(draftManifestPath(), JSON.stringify(remaining, null, 2), 'utf8');
  }

  // 4T-0539: Entwuerfe eines geloeschten Arbeitsbereichs wandern in den
  // globalen Topf (workspaceId loesen, nichts geht verloren; Degradierungs-
  // Logik aus Workshop-Punkt 4).
  async function retagDraftsToGlobal(workspaceId) {
    if (!workspaceId) return;
    const manifest = await readDraftManifest();
    let changed = false;
    for (const e of manifest) {
      if (e.workspaceId === workspaceId) {
        e.workspaceId = null;
        changed = true;
      }
    }
    if (!changed) return;
    await fs.mkdir(draftsDir(), { recursive: true });
    await fs.writeFile(draftManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  }

  // Wandelt interne Entwuerfe in das Renderer-Payload (Inhalt + tabSettings, nach
  // order sortiert). Der Renderer oeffnet sie als Unbenannt-Tabs.
  function draftsToPayload(drafts) {
    return [...drafts]
      .sort((a, b) => a.order - b.order)
      .map((d) => ({ content: d.content, tabSettings: d.tabSettings || {} }));
  }

  /**
   * Haengt einen Schreibvorgang an die Serialisierungs-Kette. 4T-0998: Zugang
   * fuer die IPC-Handler, die frueher die Ketten-Variable selbst fortschrieben.
   *
   * @param {() => Promise<any>} fn Der auszufuehrende Schreibvorgang.
   * @returns {Promise<void>} Die neue Kette (auf sie wartet drafts:save).
   */
  function enqueueDraftWrite(fn) {
    draftWriteChain = draftWriteChain.then(() => fn()).catch(() => {});
    return draftWriteChain;
  }

  /**
   * Wartet auf den Abschluss der laufenden Schreibvorgaenge. Das Oeffnen eines
   * Arbeitsbereichs braucht das, damit ein gerade abgeschlossenes Schliessen
   * seine Entwuerfe fertig persistiert hat.
   *
   * @returns {Promise<void>} Erfuellt, sobald die Kette leer ist.
   */
  function awaitDraftWrites() {
    return draftWriteChain;
  }

  return {
    readAllDrafts,
    appendDrafts,
    removeDraftsByIds,
    retagDraftsToGlobal,
    draftsToPayload,
    enqueueDraftWrite,
    awaitDraftWrites,
  };
}

module.exports = { createDraftCache };
