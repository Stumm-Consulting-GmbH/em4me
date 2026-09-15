// IPC-Kanal-Gruppe Index-Sichten: die Read-only-Views auf den Bereichs-Index
// (Rueckverweise, Tags, Frontmatter-Abfrage, Ereignisse, Graph, Kennzahlen,
// Skript-Daten, Puffer-Overlay), das zeilen- und feldgenaue Rueckschreiben aus
// Abfrage- und Ereignis-Ansicht, die Bereichs-Suche, die Autocomplete- und
// Linter-Quellen. Die Wiki-Einbettungen sind mit 4T-001486 nach
// src/main/ipc/embeds.js gezogen.
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: backlinks:*,
// wikiLink:*, tags:request, frontmatterQuery:run, task:applyLineEdit,
// events:*, graph:edges, areaStats:collect, areaSearch:*, areaReplace:run,
// index:overlay,
// perspectiveScript:data, autocomplete:*, linter:resolveWikiTargets.
//
// Eigener Zustand: keiner; der Index und der Suchraum gehoeren ihren Modulen
// und kommen als Deps.
'use strict';

const fs = require('node:fs/promises');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { isExtensionEnabled } = require('../../shared/extensions/extensions-core');
const { createTaskStatusTypeResolver } = require('../../shared/markdown/plugins.js');
const { computeLineReplacement } = require('../documents/task-line-edit.js');
const { createAreaReplace } = require('../area/area-replace.js');
// 4T-001531 (Epic 3E-000175): Die Fundstellen einer Tag-Umbenennung. Sie
// braucht jede Datei des Bereichs und laeuft deshalb hier, nicht im Renderer.
const { ermittleUmbenennung } = require('../area/tag-rename.js');
const { normalizeProfilesConfig, DEFAULT_ASSIGN_FIELD } = require('../../shared/property-profiles');
const { EVENT_PROFILE_NAME } = require('../../shared/events/events-core.js');
const { writeFrontmatter, extractFrontmatter } = require('../../shared/markdown/frontmatter');
// 4T-001261 (Epic 3E-000272): Der Fremd-Aenderungs-Schutz hat eine Heimat, und
// zwar dieselbe wie der des Speicher-Wegs.
const { istFeldKonflikt } = require('../documents/save-guard.js');

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
 * @param {Function} deps.collectAreaStats Kennzahlen-Erhebung des Bereichs.
 * @param {Function} deps.sucheImBereich Volltext-Suche ueber den Bereich.
 * @param {Function} deps.gibBereichsVorratFrei Speicher-Vorrat der Suche freigeben.
 * @param {Function} deps.readAreaProfilesConfig Profil-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.resolveAreaStartPage Start-Seite des Bereichs als absoluter Pfad.
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
    collectAreaStats,
    sucheImBereich,
    gibBereichsVorratFrei,
    readAreaProfilesConfig,
    resolveAreaStartPage,
    resolveHistoryFor,
    readPreviousTextFor,
    recordMddOnSave,
  } = deps;
  // 4T-000999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  // 4T-001524 (Epic 3E-000169): Die Ersetzen-Strecke braucht die Historie und
  // steht deshalb hier statt als freie Funktion. Gebaut wird sie einmal bei der
  // Registrierung, weil ihre Abhaengigkeiten dann bereits feststehen.
  const { ersetzeImBereich } = createAreaReplace({ resolveHistoryFor, recordMddOnSave });

  // 4T-000015: Backlinks-Anfrage einer Pane. Registriert den Owner
  // (webContents + Pane) auf der Wurzel der angefragten Datei und liefert
  // das aktuelle Status-Payload. Der Renderer macht beim Tab-Wechsel
  // passend zu einem 'request' immer auch ein 'release' fuer die vorher
  // angefragte Datei.
  // B-01 (4T-000175): Owner-Key statt blindem Refcount — Mehrfach-Requests
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
    // 4T-000347 (Epic 3E-000062): dieselbe bereichsbewusste Wurzel wie beim Request,
    // sonst gibt release in Bereichs-Apps den falschen Owner frei (Leak).
    const root = backlinks.rootForActiveFile(filePath, areaRootForEvent(event));
    if (root) backlinks.releaseRoot(root, `${event.sender.id}:${paneIdx}`);
    return { ok: true };
  });

  // B-13 (4T-000175): Klick-Fallback ueber den Index, wenn das dokument-
  // relative Ziel nicht existiert (analog zum Alias-Fallback).
  handle('wikiLink:resolveInIndex', (event, params) => {
    const filePath = params && params.filePath;
    const basename = params && params.basename;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.resolveWikiTargetInIndex(filePath, basename, areaRoot);
  });

  // 4T-000056 (Epic 3E-000011): Tag-System. Liefert die Tag-Liste der Wurzel
  // (mit Counts) und optional die Datei-Liste fuer einen Filter-Tag.
  // Aehnlich backlinks:request, aber ohne Refcount/Soft-Timer-Mechanik:
  // Tags sind ein Read-only-View und triggern keinen Index-Aufbau.
  handle('tags:request', (event, params) => {
    const filePath = params && params.filePath;
    const filterTag = params && params.filterTag;
    // B-18 (4T-000187): Tag-Sidebar stoesst den Index-Aufbau selbst an —
    // vorher entstand der Index nur ueber das Backlinks-Panel, ohne das
    // die Tag-Sektion dauerhaft 'unavailable' meldete.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.tagsFor(filePath, filterTag, areaRoot);
  });

  // 4T-000354 (Epic 3E-000065): Frontmatter-Abfrage (perspective-query). Read-only-
  // View wie tags:request: stoesst den Index bei Bedarf an, wertet die Query im
  // Main gegen die Properties-Maps aus und liefert die Datei-Liste plus Status.
  handle('frontmatterQuery:run', (event, params) => {
    const filePath = params && params.filePath;
    const query = params && typeof params.query === 'string' ? params.query : '';
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    // 4T-000502 (Epic 3E-000096): Task-Umgebung fuer den TASKS-Scope aus dem
    // Store — Erweiterungs-Gate, Global Filter und Status-Typ-Aufloesung
    // (pro Lauf frisch gelesen; Settings-Aenderungen wirken damit sofort).
    const tasksConfig = store ? store.get('tasksConfig') : null;
    const taskEnv = {
      enabled: isExtensionEnabled('tasks', store ? store.get('extensions.disabled') : []),
      globalFilter:
        tasksConfig && typeof tasksConfig.globalFilter === 'string'
          ? tasksConfig.globalFilter.trim()
          : '',
      // 4T-000505 (Epic 3E-000096): globale Abfrage (implizite FROM-/WHERE-
      // Vorgabe aus den Einstellungen) fuer alle TASKS-Blöcke.
      globalQuery:
        tasksConfig && typeof tasksConfig.globalQuery === 'string'
          ? tasksConfig.globalQuery.trim()
          : '',
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
    };
    return backlinks.frontmatterQueryFor(filePath, query, areaRoot, taskEnv, params && params.lang);
  });

  // 4T-000504 (Epic 3E-000096): Rueckschreiben aus der Abfrage-Ansicht in NICHT
  // im aufrufenden Fenster geoeffnete Quelldateien (offene Tabs aktualisiert
  // der Renderer ueber den Editor-Zustand, nicht ueber die Platte). Muster
  // des Link-Updates (3E-000062): Roh-Stand lesen (EOL/BOM bleiben erhalten),
  // zeilen-genau ersetzen, Historie wie beim regulaeren Speichern. BEWUSST
  // ohne markSelfWriting: in anderen Fenstern offene Tabs sollen den
  // definierten file:changed-Weg gehen (nicht-dirty -> stiller Reload,
  // dirty -> Konflikt-Dialog). Konflikt auf Zeilen-Ebene (Zeile veraendert
  // oder verschwunden) meldet { ok:false, reason } statt blind zu schreiben.
  //
  // 4T-001504 (Epic 3E-000296): Der Vermerk oben ist fuer den Fall «anderes
  // Fenster» geschrieben. Am 2026-09-08 sind alle drei Konstellationen
  // geprueft worden, und er traegt in jeder:
  //   - Zieldokument in KEINEM Fenster geoeffnet: entsteht gar nicht, weil
  //     die Beobachtung ausschliesslich ueber den Lese-Kanal file:read
  //     angelegt wird und mit ihrem letzten Besitzer endet.
  //   - Im AUFRUFENDEN Fenster: erreichbar nur als inaktiver, sauberer Reiter
  //     — stiller Reload, kein Konflikt-Dialog, weil der Dialog an tab.dirty
  //     haengt und ein dirty Reiter den Schreibweg nach der Weg-Regel der
  //     Aufrufer gar nicht erreicht.
  //   - In einem ANDEREN Fenster: stiller Reload, wenn der Reiter sauber ist,
  //     Konflikt-Dialog, wenn er geaendert ist.
  // Ein fall-abhaengiges markSelfWriting gibt es hier nicht: Die
  // Unterdrueckung sitzt pro DATEIPFAD und nicht pro Fenster
  // (documents/self-write.js gegen documents/file-watching.js); ein Eintrag
  // an dieser Stelle naehme die Meldung ALLEN Besitzern weg, auch den anderen
  // Fenstern. Bewacht von RB-01 bis RB-03 in
  // test/e2e/funktionen/rueckschreib-beobachtung.spec.js und von
  // test/unit/beobachtungs-anlage.test.js (Anlage-Stelle samt Negativ-Probe).
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
      await ersetzeDateiOderWirf(filePath, result.newContent);
      if (recordHistory) {
        const newTextNorm = result.newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true, line: result.line };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000515 (Epic 3E-000092): Ereignis-Aggregation — Treffer-Dateien mit
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

  // 4T-000515 (Epic 3E-000092): Inline-Rueckschreiben der Aggregation in NICHT
  // im aufrufenden Fenster geoeffnete Quell-Dateien (offene Tabs schreibt
  // der Renderer ueber den Editor-Zustand). Muster task:applyLineEdit:
  // Roh-Stand lesen (EOL/BOM bleiben erhalten), Mehrfeld-Update ueber
  // writeFrontmatter, Historie wie beim regulaeren Speichern, BEWUSST ohne
  // markSelfWriting (offene Tabs anderer Fenster gehen den file:changed-
  // Weg).
  //
  // 4T-001504 (Epic 3E-000296): Die drei am 2026-09-08 geprueften
  // Konstellationen und der Grund, warum die Unterdrueckung nicht
  // fall-abhaengig zu setzen waere, stehen vollstaendig bei
  // task:applyLineEdit — der Weg dieser Stelle ist derselbe, und eine zweite
  // Fassung derselben Begruendung waere der Doppel-Mechanismus, den der
  // Vermerk zu 4T-001261 unten schon einmal benennt. Bewacht von denselben
  // Faellen: RB-01 bis RB-03 in
  // test/e2e/funktionen/rueckschreib-beobachtung.spec.js und
  // test/unit/beobachtungs-anlage.test.js.
  //
  // 4T-001261 (Epic 3E-000272): Die Konflikt-Erkennung vergleicht den INHALT
  // statt des Zeitstempels — die gelesenen Frontmatter-Werte, nicht die ganze
  // Datei. Begruendung und Vergleichsform wohnen bei der Pruefung selbst
  // (documents/save-guard.js), damit beide Schreibwege EINEN Ort haben; eine
  // zweite Begruendung hier waere der Doppel-Mechanismus, den dieser Vorgang
  // gerade behebt. `expectedFields` bleibt optional.
  handle('events:applyFrontmatterEdit', async (event, params) => {
    const BOM_RE = new RegExp('^\\uFEFF');
    const filePath = params && typeof params.filePath === 'string' ? params.filePath : '';
    if (!filePath) return { ok: false, error: 'no path' };
    try {
      await fs.stat(filePath);
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
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
    // 4T-001261: Der Vergleich sitzt HIER und nicht vor dem Lesen, weil er den
    // geparsten Stand braucht. Geprueft wird je Feld, das der Schnappschuss
    // gelesen hat; ein Feld, das seither hinzugekommen ist, ist kein Konflikt,
    // weil die Operation es nicht anfasst.
    const erwarteteFelder =
      params && params.expectedFields && typeof params.expectedFields === 'object'
        ? params.expectedFields
        : null;
    if (istFeldKonflikt(fm.data, erwarteteFelder)) return { ok: false, reason: 'conflict' };
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
      await ersetzeDateiOderWirf(filePath, newContent);
      if (recordHistory) {
        const newTextNorm = newContent.replace(BOM_RE, '').replace(/\r\n/g, '\n');
        await recordMddOnSave(owner, filePath, previousText, newTextNorm);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000453 (Epic 3E-000084): Graph-Daten fuer Bereichs-Graph-Tab und Datei-
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

  // 4T-000619 (Epic 3E-000117): Kennzahlen des geoeffneten Bereichs fuer die
  // Statistik-Seite. Read-only-View wie graph:edges, aber mit ergaenzendem
  // Ordner-Scan; ohne Bereich gibt es keinen abgegrenzten Datei-Raum und
  // damit den Status 'unavailable'. Der Status-Typ-Aufloeser wird pro Lauf
  // frisch gebaut (Muster frontmatterQuery:run), damit geaenderte
  // Aufgaben-Zustaende sofort wirken.
  // 4T-001516 (Epic 3E-000172): Die Start-Seite loest DIESER Handler auf und
  // reicht sie als Option weiter; die Erhebung selbst liest die Bereichsdatei
  // nicht. Eine Festlegung, die ins Leere zeigt, kommt gar nicht erst an —
  // sie steht ohnehin in keinem Index.
  handle('areaStats:collect', async (event) => {
    const areaRoot = areaRootForEvent(event);
    let startPage = null;
    if (areaRoot && typeof resolveAreaStartPage === 'function') {
      const treffer = await resolveAreaStartPage(areaRoot);
      if (treffer && !treffer.missing) startPage = treffer.path;
    }
    return collectAreaStats(areaRoot, {
      statusTypeOf: createTaskStatusTypeResolver(store ? store.get('taskStates') : null),
      startPage,
    });
  });

  // 4T-000615 (Epic 3E-000116): Bereichs-Suchlauf. Der Renderer schickt den
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

  // 4T-001524 (Epic 3E-000169): Bereichsweites Ersetzen. Der Renderer schickt
  // dasselbe Muster wie beim Suchlauf, den Ersetzungs-Text und die Offsets der
  // AUSGEWAEHLTEN Fundstellen; Lesen, Sichern und Schreiben liegen hier.
  //
  // Ohne geoeffneten Bereich gibt es keine Grenze, an der sich ein Ziel pruefen
  // liesse. Der Kanal liefert dann kein leeres Ergebnis wie der Suchlauf,
  // sondern jede angefragte Datei mit ihrem Grund: Eine stille Null waere von
  // «nichts zu tun» nicht zu unterscheiden, und der Anwender haette gerade
  // hunderte Ersetzungen ausgeloest.
  handle('areaReplace:run', async (event, params) => {
    const dateien = params && Array.isArray(params.dateien) ? params.dateien : [];
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) {
      return {
        geaendert: [],
        veraendert: [],
        fehlgeschlagen: dateien
          .filter((d) => d && typeof d.pfad === 'string' && d.pfad)
          .map((d) => ({ pfad: d.pfad, grund: 'keinBereich' })),
      };
    }
    return ersetzeImBereich(areaRoot, {
      muster: params && params.muster,
      flags: params && params.flags,
      ersetzung: params && params.ersetzung,
      regexModus: params && params.regexModus,
      // 4T-001531 (Epic 3E-000175): Bei einer Tag-Umbenennung reisen die beiden
      // Namen mit; ohne sie bleibt der Frontmatter-Anteil jedes Ziels leer und
      // der Kanal verhaelt sich Zeichen fuer Zeichen wie zuvor.
      tag: params && params.tag,
      dateien,
      owner: senderWindow(event),
    });
  });

  // 4T-001531 (Epic 3E-000175): Die Fundstellen einer Tag-Umbenennung ueber den
  // Bereich. Anders als der Suchlauf bekommt dieser Kanal kein Muster, sondern
  // die beiden Namen: Was ein Tag ist, entscheidet die gemeinsame Erkennung
  // (`shared/tag-erkennung.js`) und nicht ein Ausdruck, den der Renderer baut.
  // Ohne geoeffneten Bereich gibt es nichts zu durchsuchen.
  handle('tagRename:scan', async (event, params) => {
    const leer = { treffer: [], gruppen: [], abgeschnitten: false, vorratModus: 'leer', kinder: 0 };
    const areaRoot = areaRootForEvent(event);
    if (!areaRoot) return leer;
    return ermittleUmbenennung(areaRoot, {
      alt: params && params.alt,
      neu: params && params.neu,
      aktiv: params && params.aktiv,
    });
  });

  // 4T-000935 (Befund B-08): Puffer-Overlay des Index — ein Kanal fuer Setzen
  // und Zuruecknehmen (content === null loescht). Begruendung der Schicht am
  // Overlay in backlinks.js.
  handle('index:overlay', (event, params) => {
    const filePath = params && params.filePath;
    const content = params && params.content;
    if (content === null) return backlinks.clearBufferOverlay(filePath);
    return backlinks.setBufferOverlay(filePath, content);
  });

  // 4T-000413 (Epic 3E-000078): Daten-Snapshot fuer Skript-Bloecke
  // (perspective-script). Read-only-View wie frontmatterQuery:run; die
  // Auswertung uebernimmt das Skript in der Renderer-Sandbox, der Main
  // liefert nur den Suchraum (pages/blocks) als Snapshot.
  handle('perspectiveScript:data', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.scriptDataFor(filePath, areaRoot);
  });

  // 4T-000057 (Epic 3E-000011): Autocomplete-Suggestions fuer drei Quellen:
  // Wiki-Link-Ziele ([[), Heading-/Block-Anker ([[Datei#, [[Datei#^),
  // Tags (#). Pro Trigger ein IPC, weil die Quellen unterschiedliche
  // Eingabe-Parameter brauchen.
  handle('autocomplete:wikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    // B-18 (4T-000187): Autocomplete-Bedarf baut den Index bei Bedarf auf.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.wikiLinkAutocompleteSuggestions(filePath, areaRoot);
  });
  // 4T-001748 (Epic 3E-000289): Bild-Ziele fuer das Bild-Feld der Canvas-Karte.
  // Eigener Kanal neben dem Wiki-Kanal, weil er eine andere Quelle liest
  // (assetNameMap statt files/aliasMap) und eine andere Frage beantwortet;
  // Aufbau-bei-Bedarf, Bereichs-Grenze und Antwort-Form sind die des Nachbarn.
  handle('autocomplete:imageTargets', (event, params) => {
    const filePath = params && params.filePath;
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.bildAutocompleteSuggestions(filePath, areaRoot);
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
  // 4T-000020: Linter-Lookup fuer broken-wiki-link. Batch-Endpunkt: pro Lint-
  // Lauf ein Roundtrip mit allen Basenames des Dokuments. Antwort siehe
  // existingWikiTargets in backlinks.js (status + Liste der gefundenen).
  // Triggert keinen Index-Aufbau; falls kein Index vorliegt, wird 'unavailable'
  // zurueckgegeben und der Linter unterdrueckt die Regel.
  handle('linter:resolveWikiTargets', (event, params) => {
    const filePath = params && params.filePath;
    const basenames = params && Array.isArray(params.basenames) ? params.basenames : [];
    // B-18 (4T-000187): Linter-Bedarf baut den Index bei Bedarf auf; bis er
    // ready ist, unterdrueckt der 'indexing'-Status die Regel wie bisher.
    const areaRoot = areaRootForEvent(event);
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:demand`, areaRoot);
    return backlinks.existingWikiTargets(filePath, basenames, areaRoot);
  });

  // 4T-000050 (Epic 3E-000010): Wiki-Link-Klick mit Alias-Fallback. Wird vom
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
}

module.exports = { registerIndexViewsIpc };
