// IPC-Kanal-Gruppe Index-Sichten: die Read-only-Views auf den Bereichs-Index
// (Rueckverweise, Tags, Frontmatter-Abfrage, Ereignisse, Graph, Kennzahlen,
// Skript-Daten, Puffer-Overlay), das zeilen- und feldgenaue Rueckschreiben aus
// Abfrage- und Ereignis-Ansicht, die Bereichs-Suche, die Autocomplete- und
// Linter-Quellen sowie das Lesen einer Wiki-Einbettung.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: backlinks:*,
// wikiLink:*, tags:request, frontmatterQuery:run, task:applyLineEdit,
// events:*, graph:edges, areaStats:collect, areaSearch:*, index:overlay,
// perspectiveScript:data, autocomplete:*, linter:resolveWikiTargets,
// embed:read.
//
// Eigener Zustand: keiner; der Index und der Suchraum gehoeren ihren Modulen
// und kommen als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { resolveContainedEmbedPath } = require('../documents/embed-path');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');
const { computeLineReplacement } = require('../documents/task-line-edit.js');
const { normalizeProfilesConfig, DEFAULT_ASSIGN_FIELD } = require('../../shared/property-profiles');
const { EVENT_PROFILE_NAME } = require('../../shared/events/events-core.js');
const { writeFrontmatter, extractFrontmatter } = require('../../shared/markdown/frontmatter');

/**
 * Registriert die Kanaele der Index-Sichten, der Bereichs-Suche und der Embeds.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(event: object) => string|null} deps.areaRootForEvent Bereichs-Wurzel der Anfrage.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {object} deps.backlinks Bereichs-Index samt seiner Sichten.
 * @param {object} deps.subpages Unterseiten-Namens-Logik.
 * @param {object} deps.embedInhalt Inhalt einer Einbettung, Puffer vor Platte.
 * @param {Function} deps.collectAreaStats Kennzahlen-Erhebung des Bereichs.
 * @param {Function} deps.sucheImBereich Volltext-Suche ueber den Bereich.
 * @param {Function} deps.gibBereichsVorratFrei Speicher-Vorrat der Suche freigeben.
 * @param {number} deps.MAX_EMBED_BYTES Groessen-Limit fuer Markdown-Embeds.
 * @param {Function} deps.readAreaProfilesConfig Profil-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.resolveHistoryFor Aufloesung der Historisierungs-Schaltung.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Ueberschreiben.
 * @param {Function} deps.recordMddOnSave Historien-Paket beim Speichern schreiben.
 */
function registerIndexViewsIpc(handle, deps) {
  const {
    senderWindow,
    areaOfWindow,
    areaRootForEvent,
    getStore,
    backlinks,
    subpages,
    embedInhalt,
    collectAreaStats,
    sucheImBereich,
    gibBereichsVorratFrei,
    MAX_EMBED_BYTES,
    readAreaProfilesConfig,
    resolveHistoryFor,
    readPreviousTextFor,
    recordMddOnSave,
  } = deps;
  // 4T-0999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  // 4T-0015: Backlinks-Anfrage einer Pane. Registriert den Owner
  // (webContents + Pane) auf der Wurzel der angefragten Datei und liefert
  // das aktuelle Status-Payload. Der Renderer macht beim Tab-Wechsel
  // passend zu einem 'request' immer auch ein 'release' fuer die vorher
  // angefragte Datei.
  // B-01 (4T-0175): Owner-Key statt blindem Refcount — Mehrfach-Requests
  // desselben Owners (Editor-Sync, Invalidate-Refresh) leaken nicht mehr.
  handle('backlinks:request', (event, params) => {
    const filePath = params && params.filePath;
    const paneIdx = params && Number.isInteger(params.paneIdx) ? params.paneIdx : 0;
    return backlinks.backlinksFor(
      filePath,
      `${event.sender.id}:${paneIdx}`,
      areaRootForEvent(event),
    );
  });
  handle('backlinks:release', (event, params) => {
    const filePath = params && params.filePath;
    const paneIdx = params && Number.isInteger(params.paneIdx) ? params.paneIdx : 0;
    // 4T-0347 (Epic 3E-0062): dieselbe bereichsbewusste Wurzel wie beim Request,
    // sonst gibt release in Bereichs-Apps den falschen Owner frei (Leak).
    const root = backlinks.rootForActiveFile(filePath, areaRootForEvent(event));
    if (root) backlinks.releaseRoot(root, `${event.sender.id}:${paneIdx}`);
    return { ok: true };
  });

  // B-13 (4T-0175): Klick-Fallback ueber den Index, wenn das dokument-
  // relative Ziel nicht existiert (analog zum Alias-Fallback).
  handle('wikiLink:resolveInIndex', (event, params) => {
    const filePath = params && params.filePath;
    const basename = params && params.basename;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.resolveWikiTargetInIndex(filePath, basename, areaRoot);
  });

  // 4T-0056 (Epic 3E-0011): Tag-System. Liefert die Tag-Liste der Wurzel
  // (mit Counts) und optional die Datei-Liste fuer einen Filter-Tag.
  // Aehnlich backlinks:request, aber ohne Refcount/Soft-Timer-Mechanik:
  // Tags sind ein Read-only-View und triggern keinen Index-Aufbau.
  handle('tags:request', (event, params) => {
    const filePath = params && params.filePath;
    const filterTag = params && params.filterTag;
    // B-18 (4T-0187): Tag-Sidebar stoesst den Index-Aufbau selbst an —
    // vorher entstand der Index nur ueber das Backlinks-Panel, ohne das
    // die Tag-Sektion dauerhaft 'unavailable' meldete.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.tagsFor(filePath, filterTag, areaRoot);
  });

  // 4T-0354 (Epic 3E-0065): Frontmatter-Abfrage (perspective-query). Read-only-
  // View wie tags:request: stoesst den Index bei Bedarf an, wertet die Query im
  // Main gegen die Properties-Maps aus und liefert die Datei-Liste plus Status.
  handle('frontmatterQuery:run', (event, params) => {
    const filePath = params && params.filePath;
    const query = params && typeof params.query === 'string' ? params.query : '';
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    // 4T-0502 (Epic 3E-0096): Task-Umgebung fuer den TASKS-Scope aus dem
    // Store — Erweiterungs-Gate, Global Filter und Status-Typ-Aufloesung
    // (pro Lauf frisch gelesen; Settings-Aenderungen wirken damit sofort).
    const tasksConfig = store ? store.get('tasksConfig') : null;
    const taskEnv = {
      enabled: isExtensionEnabled('tasks', store ? store.get('extensions.disabled') : []),
      globalFilter:
        tasksConfig && typeof tasksConfig.globalFilter === 'string'
          ? tasksConfig.globalFilter.trim()
          : '',
      // 4T-0505 (Epic 3E-0096): globale Abfrage (implizite FROM-/WHERE-
      // Vorgabe aus den Einstellungen) fuer alle TASKS-Blöcke.
      globalQuery:
        tasksConfig && typeof tasksConfig.globalQuery === 'string'
          ? tasksConfig.globalQuery.trim()
          : '',
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
    };
    return backlinks.frontmatterQueryFor(filePath, query, areaRoot, taskEnv, params && params.lang);
  });

  // 4T-0504 (Epic 3E-0096): Rueckschreiben aus der Abfrage-Ansicht in NICHT
  // im aufrufenden Fenster geoeffnete Quelldateien (offene Tabs aktualisiert
  // der Renderer ueber den Editor-Zustand, nicht ueber die Platte). Muster
  // des Link-Updates (3E-0062): Roh-Stand lesen (EOL/BOM bleiben erhalten),
  // zeilen-genau ersetzen, Historie wie beim regulaeren Speichern. BEWUSST
  // ohne markSelfWriting: in anderen Fenstern offene Tabs sollen den
  // definierten file:changed-Weg gehen (nicht-dirty -> stiller Reload,
  // dirty -> Konflikt-Dialog). Konflikt auf Zeilen-Ebene (Zeile veraendert
  // oder verschwunden) meldet { ok:false, reason } statt blind zu schreiben.
  handle('task:applyLineEdit', async (event, params) => {
    // BOM-Strip wie file:read (Escape-Form, kein unsichtbares Literal, M-04).
    const BOM_RE = new RegExp('^\\uFEFF');
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const result = computeLineReplacement(raw, {
      line: params && params.line,
      expectedText: params && params.expectedText,
      newText: params ? params.newText : null,
      insert: params ? params.insert : null,
    });
    if (!result.ok) return { ok: false, reason: result.reason };
    try {
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, filePath, result.newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      await fs.writeFile(filePath, result.newContent, { encoding: 'utf8' });
      if (recordHistory) {
        const newTextNorm = result.newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true, line: result.line };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0515 (Epic 3E-0092): Ereignis-Aggregation — Treffer-Dateien mit
  // event-*-Feldern aus dem Bereichs-Index (Grundmenge = Zuordnungs-Feld
  // nennt das interne Ereignis-Profil; optionale FROM/WHERE-Verfeinerung).
  // Gate auf die Erweiterung "events" (transitiv ueber property-profiles).
  handle('events:query', async (event, query) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { status: 'unavailable' };
    if (!isExtensionEnabled('events', store ? store.get('extensions.disabled') : [])) {
      return { status: 'disabled' };
    }
    const config = normalizeProfilesConfig(await readAreaProfilesConfig(area.rootPath));
    const assignField = (config && config.assignField) || DEFAULT_ASSIGN_FIELD;
    return backlinks.eventsForQuery(area.rootPath, query, area.rootPath, {
      assignField,
      profileName: EVENT_PROFILE_NAME,
    });
  });

  // 4T-0515 (Epic 3E-0092): Inline-Rueckschreiben der Aggregation in NICHT
  // im aufrufenden Fenster geoeffnete Quell-Dateien (offene Tabs schreibt
  // der Renderer ueber den Editor-Zustand). Muster task:applyLineEdit:
  // Roh-Stand lesen (EOL/BOM bleiben erhalten), Mehrfeld-Update ueber
  // writeFrontmatter, Historie wie beim regulaeren Speichern, BEWUSST ohne
  // markSelfWriting (offene Tabs anderer Fenster gehen den file:changed-
  // Weg). Konflikt-Erkennung ueber mtimeMs des Aggregations-Snapshots:
  // hat sich die Datei seither veraendert, wird nicht blind geschrieben.
  handle('events:applyFrontmatterEdit', async (event, params) => {
    const BOM_RE = new RegExp('^\\uFEFF');
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const expectedMtime = params && Number(params.expectedMtimeMs);
    if (Number.isFinite(expectedMtime) && expectedMtime > 0 && stat.mtimeMs !== expectedMtime) {
      return { ok: false, reason: 'conflict' };
    }
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const hadBom = BOM_RE.test(raw);
    const text = hadBom ? raw.replace(BOM_RE, '') : raw;
    const fm = extractFrontmatter(text);
    if (fm.parseError) return { ok: false, reason: 'yaml' };
    const newData = { ...(fm.data || {}) };
    const updates =
      params && params.updates && typeof params.updates === 'object' ? params.updates : {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof key !== 'string' || key === '') continue;
      // Leere Werte raeumen den Schluessel (sauberes Frontmatter statt
      // leerer Reste); alles andere wird typgerecht gesetzt.
      if (value === null || value === undefined || value === '') delete newData[key];
      else newData[key] = value;
    }
    const written = writeFrontmatter(text, newData);
    if (!written.ok) return { ok: false, error: written.error };
    const newContent = (hadBom ? '\uFEFF' : '') + written.text;
    try {
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, filePath, newContent)).effective;
      const previousText = recordHistory ? await readPreviousTextFor(filePath) : null;
      await fs.writeFile(filePath, newContent, { encoding: 'utf8' });
      if (recordHistory) {
        const newTextNorm = newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-0453 (Epic 3E-0084): Graph-Daten fuer Bereichs-Graph-Tab und Datei-
  // Graph-Panel (Knoten plus gerichtete Link-Kanten des Suchraums). Read-only-
  // View wie tags:request; der Bereichs-Fall kommt ohne aktive Datei aus (den
  // Bereichs-Index haelt der area:<appId>-Owner seit dem Bereichs-Oeffnen).
  handle('graph:edges', (event, params) => {
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : null;
    const areaRoot = areaRootForEvent(event);
    if (filePath) {
      backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    }
    return backlinks.graphFor(filePath, areaRoot);
  });

  // 4T-0619 (Epic 3E-0117): Kennzahlen des geoeffneten Bereichs fuer die
  // Statistik-Seite. Read-only-View wie graph:edges, aber mit ergaenzendem
  // Ordner-Scan; ohne Bereich gibt es keinen abgegrenzten Datei-Raum und
  // damit den Status 'unavailable'. Der Status-Typ-Aufloeser wird pro Lauf
  // frisch gebaut (Muster frontmatterQuery:run), damit geaenderte
  // Aufgaben-Zustaende sofort wirken.
  handle('areaStats:collect', async (event) => {
    const areaRoot = areaRootForEvent(event);
    return collectAreaStats(areaRoot, {
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
    });
  });

  // 4T-0615 (Epic 3E-0116): Bereichs-Suchlauf. Der Renderer schickt den
  // fertigen Regex-Quelltext samt Flags (eine Auslegung von Gross-/
  // Kleinschreibung und Regex-Modus, nicht zwei) und den wurzel-relativen
  // Pfad der aktiven Datei, deren Treffer er selbst aus dem Editor-Stand
  // beisteuert. Ohne geoeffneten Bereich liefert der Kanal ein leeres
  // Ergebnis, statt auf einen Ordner-Scan auszuweichen.
  handle('areaSearch:run', async (event, params) => {
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) {
      return {
        treffer: [],
        gruppen: [],
        abgeschnitten: false,
        generation: (params && params.generation) || 0,
        vorratModus: 'leer',
      };
    }
    return sucheImBereich(areaRoot, {
      muster: params && params.muster,
      flags: params && params.flags,
      aktiv: params && params.aktiv,
      anker: params && params.anker,
      generation: params && params.generation,
    });
  });

  // Gibt den Speicher-Vorrat frei (Suchleiste geschlossen, Bereich
  // gewechselt). Der Cache bleibt bestehen; er ist der Zweck des naechsten
  // Starts.
  handle('areaSearch:release', (event) => {
    const areaRoot = areaRootForEvent(event);
    gibBereichsVorratFrei(areaRoot || null);
    return true;
  });

  // 4T-0935 (Befund B-08): Puffer-Overlay des Index — ein Kanal fuer Setzen
  // und Zuruecknehmen (content === null loescht). Begruendung der Schicht am
  // Overlay in backlinks.js.
  handle('index:overlay', (event, params) => {
    const filePath = params && params.filePath;
    const content = params && params.content;
    if (content === null) return backlinks.clearBufferOverlay(filePath);
    return backlinks.setBufferOverlay(filePath, content);
  });

  // 4T-0413 (Epic 3E-0078): Daten-Snapshot fuer Skript-Bloecke
  // (perspective-script). Read-only-View wie frontmatterQuery:run; die
  // Auswertung uebernimmt das Skript in der Renderer-Sandbox, der Main
  // liefert nur den Suchraum (pages/blocks) als Snapshot.
  handle('perspectiveScript:data', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.scriptDataFor(filePath, areaRoot);
  });

  // 4T-0057 (Epic 3E-0011): Autocomplete-Suggestions fuer drei Quellen:
  // Wiki-Link-Ziele ([[), Heading-/Block-Anker ([[Datei#, [[Datei#^),
  // Tags (#). Pro Trigger ein IPC, weil die Quellen unterschiedliche
  // Eingabe-Parameter brauchen.
  handle('autocomplete:wikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    // B-18 (4T-0187): Autocomplete-Bedarf baut den Index bei Bedarf auf.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.wikiLinkAutocompleteSuggestions(filePath, areaRoot);
  });
  handle('autocomplete:anchors', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    const basename = params && params.basename;
    const anchorType = params && params.anchorType;
    return backlinks.anchorAutocompleteSuggestions(filePath, basename, anchorType, areaRoot);
  });
  handle('autocomplete:tags', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.tagAutocompleteSuggestions(filePath, areaRoot);
  });

  // 4T-0020: Linter-Lookup fuer broken-wiki-link. Batch-Endpunkt: pro Lint-
  // Lauf ein Roundtrip mit allen Basenames des Dokuments. Antwort siehe
  // existingWikiTargets in backlinks.js (status + Liste der gefundenen).
  // Triggert keinen Index-Aufbau; falls kein Index vorliegt, wird 'unavailable'
  // zurueckgegeben und der Linter unterdrueckt die Regel.
  handle('linter:resolveWikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    const basenames = params && Array.isArray(params.basenames) ? params.basenames : [];
    // B-18 (4T-0187): Linter-Bedarf baut den Index bei Bedarf auf; bis er
    // ready ist, unterdrueckt der 'indexing'-Status die Regel wie bisher.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.existingWikiTargets(filePath, basenames, areaRoot);
  });

  // 4T-0050 (Epic 3E-0010): Wiki-Link-Klick mit Alias-Fallback. Wird vom
  // Renderer aufgerufen, wenn die direkte Datei (Basename.md relativ zum
  // aktiven Dokument) nicht existiert. Liefert die Liste der Dateien, die
  // den Basename als Alias im Frontmatter fuehren. Bei eindeutigem Treffer
  // oeffnet der Renderer direkt, bei mehrdeutigem zeigt er einen Auswahl-
  // Dialog.
  handle('wikiLink:resolveByAlias', (event, params) => {
    const filePath = params && params.filePath;
    const basename = params && params.basename;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.resolveWikiTargetByAlias(filePath, basename, areaRoot);
  });

  // 4T-0055 (Epic 3E-0011): Wiki-Embed-Datei lesen. Liest die Ziel-Datei
  // und extrahiert ggf. Heading-Snippet oder Block-Element gemaess Anker.
  // Wird vom Renderer fuer Markdown-Embeds aufgerufen (![[Datei]] /
  // ![[Datei#Heading]] / ![[Datei#^id]]).
  handle('embed:read', async (event, params) => {
    const basePath = params && params.basePath;
    let embedPath = params && params.embedPath;
    const anchor = params && params.anchor;
    // 4T-0337 (Epic 3E-0061): relative Unterseiten-Embeds ('![[/Name]]',
    // '![[..]]') gegen den Basename der Basis-Datei expandieren; Ergebnis
    // ist die U+2215-Form im selben Ordner.
    if (typeof embedPath === 'string' && subpages.isRelativeTarget(embedPath)) {
      const extMatch = embedPath.match(/\.[a-z0-9]{1,8}$/i);
      const ext = extMatch ? extMatch[0] : '';
      const noExt = ext ? embedPath.slice(0, -ext.length) : embedPath;
      const ownBase = path
        .basename(String(basePath || ''))
        .replace(/\.(md|markdown|mdown|mkd)$/i, '');
      const expanded = subpages.expandRelativeTarget(ownBase, noExt);
      if (!expanded) return { ok: false, error: 'not found' };
      embedPath = expanded + (ext || '.md');
    }
    // B-02 (4T-0307): Containment auf den Dokument-Ordner-Teilbaum plus
    // Markdown-Extension-Whitelist, bevor gelesen wird — fremder Embed-Pfad
    // gilt als nicht vertrauenswuerdig (Entwicklungsrichtlinien §6).
    const guard = resolveContainedEmbedPath(basePath, embedPath);
    if (!guard.ok) {
      return { ok: false, error: guard.error };
    }
    let abs = guard.abs;
    // 4T-0337: Unterseiten-/Suchraum-Fallback wie im Klick-Pfad (B-13),
    // wenn die dokument-relative Datei fehlt. Kandidaten muessen im
    // Dokument-Ordner-Teilbaum liegen (B-02-Containment bleibt gewahrt).
    try {
      await fs.access(abs);
    } catch {
      // Deterministischer Versuch ohne Index: Unterseiten liegen
      // konventionell im Ordner des Dokuments — '/' -> U+2215 uebersetzen.
      let found = false;
      if (/[/\\]/.test(String(embedPath))) {
        const translated = subpages.toFileBasename(String(embedPath).replace(/\\/g, '/'));
        const g2 = resolveContainedEmbedPath(basePath, translated);
        if (g2.ok) {
          try {
            await fs.access(g2.abs);
            abs = g2.abs;
            found = true;
          } catch {
            /* weiter zum Index-Fallback */
          }
        }
      }
      if (!found) {
        const areaRoot = areaRootForEvent(event);
        backlinks.ensureIndexForDemand(basePath, `${event.sender.id}:demand`, areaRoot);
        const logical = String(embedPath)
          .replace(/\.(md|markdown|mdown|mkd)$/i, '')
          .replace(/\\/g, '/')
          .replace(/^(\.\.?\/)+/, '');
        const idx = backlinks.resolveWikiTargetInIndex(basePath, logical, areaRoot);
        if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
          const dir = path.dirname(path.resolve(basePath));
          const contained = idx.candidates.find((c) => c.startsWith(dir + path.sep));
          if (contained) abs = contained;
        }
      }
    }
    try {
      // 4T-0948 (Befund E-01): geschriebener Stand vor Platten-Stand (Wahl und
      // Groessen-Limit in embed-content.js). Erst hier, weil der Ziel-Pfad nach
      // Containment-Pruefung und Unterseiten-Rueckfall feststeht.
      const puffer = backlinks.bufferTextFor(abs);
      const gelesen = await embedInhalt.liesEmbedInhalt(abs, puffer, MAX_EMBED_BYTES);
      if (!gelesen.ok) return { ok: false, error: gelesen.error };
      let snippet = gelesen.content;
      if (anchor) {
        snippet = backlinks.extractEmbedSnippet(gelesen.content, anchor);
        if (snippet == null) return { ok: false, error: 'anchor not found', path: abs };
      }
      return {
        ok: true,
        path: abs,
        displayPath: path.basename(abs),
        content: snippet,
      };
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      return { ok: false, error: msg };
    }
  });
}

module.exports = { registerIndexViewsIpc };
