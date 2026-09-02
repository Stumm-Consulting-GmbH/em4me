// 4T-000368 (Epic 3E-000068): Entwurfs-Zwischenspeicher — reine, electron- und
// IO-freie Logik. Normalisiert das Draft-Manifest, ordnet die Entwuerfe den
// beim Start wiederhergestellten Applikationen zu (bereichs-treu) und erkennt
// verwaiste Inhalts-Dateien. Der Datei-Zugriff (Ordner <userData>/drafts)
// liegt in main.js; dieses Modul bleibt ohne Electron unit-testbar
// (Muster session-schema.js).
'use strict';

// Defensive Normalisierung eines geladenen Manifests. Nur Eintraege mit
// nicht-leerer String-ID; `area` als nicht-leerer rootPath oder null; `order`
// als Zahl (Default: laufender Index); `tabSettings` als Objekt; `savedAt`
// als String. Beschaedigte oder fremde Eintraege werden verworfen.
// 4T-000539 (Epic 3E-000098): dazu eine optionale `workspaceId` (nicht-leerer
// String oder null) — Bestands-Eintraege ohne Feld bleiben gueltig
// (keine Migration).
function normalizeManifest(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (!e || typeof e !== 'object') continue;
    if (typeof e.id !== 'string' || !e.id) continue;
    const area = typeof e.area === 'string' && e.area ? e.area : null;
    const workspaceId = typeof e.workspaceId === 'string' && e.workspaceId ? e.workspaceId : null;
    const order = Number.isFinite(e.order) ? e.order : i;
    const tabSettings = e.tabSettings && typeof e.tabSettings === 'object' ? e.tabSettings : {};
    const savedAt = typeof e.savedAt === 'string' ? e.savedAt : '';
    result.push({ id: e.id, area, workspaceId, order, tabSettings, savedAt });
  }
  return result;
}

// Verwaiste-Erkennung fuer die Aufraeum-Disziplin beim Start:
//   missingFiles — Manifest-Eintraege ohne zugehoerige Inhalts-Datei
//   orphanFiles  — Inhalts-Dateien (<id>) ohne Manifest-Eintrag
// `manifest` ist die normalisierte Liste, `fileIds` die vorhandenen IDs der
// `<id>.md`-Dateien im Draft-Ordner.
function findOrphans(manifest, fileIds) {
  const manifestIds = new Set(manifest.map((e) => e.id));
  const fileIdSet = new Set(fileIds);
  const missingFiles = manifest.filter((e) => !fileIdSet.has(e.id)).map((e) => e.id);
  const orphanFiles = fileIds.filter((id) => !manifestIds.has(id));
  return { missingFiles, orphanFiles };
}

// Zuordnung der Entwuerfe zu den beim Start wiederhergestellten Applikationen.
//   drafts     — normalisierte Entwuerfe (mit `area` rootPath|null und
//                `workspaceId` string|null, 4T-000539)
//   appTargets — geordnete Ziel-Apps als { rootPath: string|null,
//                workspaceId: string|null } (Index = Applikation)
//   isSamePath — Pfad-Vergleich (injiziert, damit plattform-/electron-frei
//                testbar; main.js reicht das echte `isSamePath`)
// Ergebnis: { byApp, leftover, unassigned }
//   byApp[i]   — Entwuerfe, die Applikation i exakt treffen: Arbeitsbereichs-
//                Entwuerfe ausschliesslich ihren Arbeitsbereich, uebrige
//                bereichs-treu NUR auf Nicht-Arbeitsbereichs-Apps (globale
//                Entwuerfe wandern nicht still in einen Arbeitsbereichs-
//                Zustand, 4T-000539).
//   leftover   — Entwuerfe ohne workspaceId, bereichslos oder mit nicht
//                wiederkehrendem Bereich; der Aufrufer legt sie in die erste
//                bereichslose unbenannte Applikation (verlustfrei,
//                PO-Entscheidung 2026-07-08).
//   unassigned — Arbeitsbereichs-Entwuerfe, deren Arbeitsbereich nicht dabei
//                ist (geschlossen); bleiben im Speicher liegen und kommen
//                erst mit dem Oeffnen ihres Arbeitsbereichs zurueck.
function assignDraftsToApps(drafts, appTargets, isSamePath) {
  const byApp = appTargets.map(() => []);
  const leftover = [];
  const unassigned = [];
  for (const d of drafts) {
    if (d.workspaceId) {
      const idx = appTargets.findIndex((t) => t && t.workspaceId === d.workspaceId);
      if (idx >= 0) byApp[idx].push(d);
      else unassigned.push(d);
      continue;
    }
    if (d.area) {
      const idx = appTargets.findIndex(
        (t) => t && !t.workspaceId && t.rootPath && isSamePath(t.rootPath, d.area),
      );
      if (idx >= 0) {
        byApp[idx].push(d);
        continue;
      }
    }
    leftover.push(d);
  }
  return { byApp, leftover, unassigned };
}

module.exports = { normalizeManifest, findOrphans, assignDraftsToApps };
