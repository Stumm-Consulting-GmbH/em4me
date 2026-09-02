// IPC-Kanal-Gruppe Dateien: Oeffnen-Dialog, Lesen, Link-Aufloesung,
// Existenz- und Zeitstempel-Abfragen, Ende der Beobachtung sowie die beiden
// Schreib-Wege (Speichern und Speichern unter).
//
// Auszug aus main.js, 4T-000999 (Epic 3E-000196). Kanal-Gruppe: file:*.
//
// Eigener Zustand: keiner. Electron-Werte kommen ueber das Deps-Objekt, damit
// das Modul zur Lade-Zeit ohne Electron ladbar bleibt.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('../area/area-path');
const selbstSchreib = require('../documents/self-write');
// 4T-001290 (Epic 3E-000224): Zusammensetzen geteilter Dokumente beim Lesen.
// 4T-001291: Zerlegen beim Schreiben.
const {
  readAssembledDocument,
  readStateForSave,
  writeDocumentParts,
  rejoinDocument,
} = require('../documents/document-parts-io');
const { planeZerlegung, ueberSchwelle, DOKUMENT_SCHWELLE } = require('../../shared/document-split');
const { assembleParts } = require('../../shared/document-assembly');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Datei-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {(p: string) => boolean} deps.isMddPath Erkennung der Markdown-Data-Dateien.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Endungs-Pruefung.
 * @param {Function} deps.watchFile Beobachtung anlegen.
 * @param {Function} deps.unwatchFile Beobachtung freigeben.
 * @param {Function} deps.resolveHistoryFor Aufloesung der Historisierungs-Schaltung.
 * @param {Function} deps.recordMddExternalOnOpen Hash-Abgleich beim Oeffnen.
 * @param {Function} deps.readPreviousTextFor Datei-Stand vor dem Ueberschreiben.
 * @param {Function} deps.recordMddOnSave Protokollierung einer Speicherung.
 * @param {object} deps.saveGuard Stand-Pruefung vor dem Ueberschreiben.
 * @param {(filePath: string) => void} deps.pushRecent Eintrag in die Zuletzt-Liste.
 */
function registerFilesIpc(handle, deps) {
  const {
    dialog,
    senderWindow,
    areaOfWindow,
    tForWindow,
    isMddPath,
    isMarkdownPath,
    watchFile,
    unwatchFile,
    resolveHistoryFor,
    recordMddExternalOnOpen,
    readPreviousTextFor,
    recordMddOnSave,
    saveGuard,
    pushRecent,
  } = deps;

  handle('file:openDialog', async (event) => {
    const owner = senderWindow(event);
    // 4T-000323 (Epic 3E-000058): in Bereichs-Apps startet der Dialog im Bereich;
    // die Vorbelegung allein ist keine Grenze — nach der Auswahl wird geprueft
    // und ausserhalb liegende Auswahl mit Meldung abgewiesen.
    const area = areaOfWindow(owner);
    // M-09 (4T-000185): Titel und Filter-Namen lokalisiert (vorher
    // hartkodiert deutsch in allen Sprachen).
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'open.dialogTitle'),
      defaultPath: area ? area.rootPath : undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: tForWindow(owner, 'dialog.filterMarkdown'),
          extensions: ['md', 'markdown', 'mdown', 'mkd'],
        },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];
    if (area) {
      const rejected = result.filePaths.filter((p) => !isInsideArea(area.rootPath, p));
      if (rejected.length > 0) {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'area.outsideTitle'),
          message: tForWindow(owner, 'area.outsideOpenMessage'),
          detail: rejected.join('\n'),
          buttons: ['OK'],
        });
      }
      return result.filePaths.filter((p) => isInsideArea(area.rootPath, p));
    }
    return result.filePaths;
  });

  handle('file:read', async (event, filePath) => {
    // W-01 (4T-000309): defensiver Typ-Guard und {ok,error}-Rueckgabe statt
    // Exception ueber die IPC-Grenze (Entwicklungsrichtlinien §3).
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'invalid path' };
    }
    // 4T-000331 (Epic 3E-000060): Markdown-Data-Dateien (.mdd/.mdda/.mddb) sind keine
    // Dokumente — Direkt-Oeffnen wird abgelehnt. Autoritative zweite Linie
    // hinter dem Renderer-Hinweis in openInPane.
    if (isMddPath(filePath)) {
      return { ok: false, error: 'mdd-file' };
    }
    // 4T-000323 (Epic 3E-000058): harte Bereichs-Grenze als zweite Linie hinter
    // den UI-Pfaden — Bereichs-Apps lesen keine Dateien ausserhalb des
    // Bereichs, egal ueber welchen Weg der Pfad hereinkommt.
    const ownerArea = areaOfWindow(senderWindow(event));
    if (ownerArea && !isInsideArea(ownerArea.rootPath, filePath)) {
      return { ok: false, error: 'outside-area' };
    }
    try {
      const absolute = path.resolve(filePath);
      const raw = await fs.readFile(absolute, 'utf8');
      // M-04 (4T-000173): UTF-8-BOM entfernen. markdown-it normalisiert kein
      // BOM — ein '# Heading' in Zeile 1 wuerde nicht als Heading erkannt,
      // und die Frontmatter-Erkennung ('---' an Zeilenanfang) schluege fehl.
      // 4T-000069 (Epic 3E-000012): Zeilenenden auf LF normalisieren, damit der
      // Lese-Pfad symmetrisch zu file:save ist (das ebenfalls CRLF zu LF
      // konvertiert). Hintergrund: CodeMirror normalisiert beim
      // EditorState.create() intern auf LF, und der dirty-Flag-Vergleich
      // gegen tab.originalContent schlug bei CRLF-Dateien sonst sofort an —
      // selbst ohne User-Aenderung wurde der Tab als geaendert markiert.
      const content = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
      // 4T-001290 (Epic 3E-000224): Ist das Dokument geteilt, wird es HIER zu
      // einem Dokument zusammengesetzt. Dies ist die einzige Lese-Stelle der
      // Anwendung; alles dahinter — Editor, Historie, Beobachtung, Suche —
      // sieht deshalb nur ein vollstaendiges Dokument und muss von Teilen
      // nichts wissen. Genau das ist die zugesicherte Unsichtbarkeit. Ein
      // ungeteiltes Dokument nimmt den schnellen Weg und kostet nichts.
      const doc = await readAssembledDocument(absolute, content, { markSelfWriting });
      if (!doc.ok) {
        return { ok: false, error: doc.error };
      }
      // Wurde ein FOLGETEIL geoeffnet, ist der Pfad der der Kopf-Datei: Ein
      // Reiter auf einem Bruchstueck waere das Gegenteil der Zusicherung.
      const docPath = doc.path;
      const docText = doc.text;
      // Kein pushRecent hier — file:read deckt auch passive Pfade ab
      // (Sitzungs-Restore, Auto-Reload). Aktives Oeffnen meldet sich separat
      // ueber recent:push aus dem Renderer.
      watchFile(docPath, event.sender.id);
      // 4T-000331 (Epic 3E-000060): Hash-Abgleich beim Oeffnen — Fremd-
      // Aenderungen landen sofort als external-Paket in der .mdd.
      // Fire-and-forget: das Oeffnen wartet nicht auf die Historie.
      const readOwner = senderWindow(event);
      void (async () => {
        const resolved = await resolveHistoryFor(readOwner, docPath, docText);
        if (resolved.effective) await recordMddExternalOnOpen(readOwner, docPath, docText);
      })();
      // 4T-001292: Fehlt ein Teil, oeffnet das Dokument NUR LESEND und nennt die
      // fehlenden Positionen. Der Anwender sieht damit, dass er ein
      // unvollstaendiges Dokument vor sich hat, statt es fuer ein kuerzeres zu
      // halten; Speichern sperrt zusaetzlich der Schreib-Weg selbst.
      const fehlend = Array.isArray(doc.fehlend) ? doc.fehlend : [];
      return {
        ok: true,
        path: docPath,
        content: docText,
        nurLesen: fehlend.length > 0 ? 'partsMissing' : undefined,
        fehlend: fehlend.length > 0 ? fehlend : undefined,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  handle('file:resolveLink', async (_event, basePath, target) => {
    // M-05 (4T-000173): defensive Behandlung. decodeURI wirft bei '%' im
    // Link (URIError), path.dirname(null) bei pfadlosem Tab (TypeError);
    // beides liess den Klick mit unhandled rejection verpuffen. Muster
    // analog zum Schwester-Handler embed:read: validieren, try/catch,
    // bei Fehler null.
    if (!basePath || typeof basePath !== 'string') return null;
    if (!target || typeof target !== 'string') return null;
    if (/^[a-z]+:\/\//i.test(target)) return null;
    try {
      const decoded = decodeURI(target.split('#')[0]);
      if (!decoded) return null;
      return path.resolve(path.dirname(basePath), decoded);
    } catch {
      return null;
    }
  });

  handle('file:isMarkdown', (_event, p) => isMarkdownPath(p));

  handle('file:exists', async (_event, p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  });

  // 4T-000604 (Epic 3E-000113): Dateisystem-Zeitstempel für die Automatik der
  // created/updated-Frontmatter-Felder. fs.stat gibt es nur im Main, der
  // Speicher-Hook läuft im Renderer. birthtimeMs ist auf manchen Dateisystemen
  // 0 oder fehlt; dann dient ctimeMs als Näherung, und der Aufrufer fällt
  // notfalls auf den Speicherzeitpunkt zurück.
  handle('file:getTimes', async (_event, p) => {
    try {
      const st = await fs.stat(p);
      return { birthtimeMs: st.birthtimeMs || st.ctimeMs || 0, mtimeMs: st.mtimeMs || 0 };
    } catch {
      return null;
    }
  });

  handle('file:unwatch', async (event, p) => {
    await unwatchFile(p, event.sender.id);
  });

  // Datei speichern (Inhalt nach UTF-8/LF, kein BOM). Markiert den Pfad als
  // Eigen-Schreibvorgang, damit der Watcher nicht meldet.
  // 4T-000945 (Story 4S-000786): opts = { expected, force }. Die beiden Angaben
  // sind unabhaengig und lassen sich kombinieren:
  //   `expected` — Stand, den der Aufrufer zuletzt gelesen oder geschrieben
  //     hat. Weicht die Datei davon ab, wird NICHT geschrieben, sondern der
  //     Konflikt gemeldet. Fehlt die Angabe, bleibt das Verhalten unveraendert;
  //     das haelt Aufrufer entkoppelt, die keinen Stand fuehren.
  //   `force` — beim Schreiben die ueberschriebene Fassung sichern, auch bei
  //     abgeschalteter Historie.
  // Beides zusammen ist der vorentschiedene Fall: Der Anwender hat im
  // Nachlade-Dialog «eigene behalten» gewaehlt; dann wird gegen genau den
  // Stand geprueft, gegen den er entschieden hat, und dabei gesichert.
  handle('file:save', async (event, filePath, content, opts) => {
    // W-02 (4T-000309): Typ-Guard und {ok,error}-Rueckgabe statt throw ueber die
    // IPC-Grenze (Entwicklungsrichtlinien §3).
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'file:save ohne Pfad aufgerufen' };
    }
    try {
      const absolute = path.resolve(filePath);
      const normalized = String(content || '').replace(/\r\n/g, '\n');
      const expected = opts && typeof opts.expected === 'string' ? opts.expected : null;
      const force = !!(opts && opts.force);
      // 4T-000331 (Epic 3E-000060): Basis fuer das Aenderungsprotokoll VOR dem
      // Ueberschreiben lesen (nur bei aktiver Historisierung; Aufloesung
      // Datei > Bereich > App aus 4T-000332).
      const owner = senderWindow(event);
      const recordHistory = (await resolveHistoryFor(owner, absolute, normalized)).effective;
      // Ein Lesevorgang deckt alle Zwecke ab: Aenderungsprotokoll,
      // Konflikt-Pruefung, Sicherung der ueberschriebenen Fassung und seit
      // 4T-001291 (Epic 3E-000224) den Bestand der Teile eines geteilten Dokuments.
      //
      // Er laeuft jetzt IMMER, nicht mehr nur bei einem der drei ersten
      // Gruende: Ob ein Dokument geteilt ist, steht in seiner Datei, und wer
      // das nicht liest, schriebe den zusammengesetzten Text in die Kopf-Datei
      // und liesse die Folgeteile daneben liegen. Der Regelfall kostet dadurch
      // nichts Zusaetzliches — ohne Zuordnungs-Zeile kehrt der Lese-Weg sofort
      // zurueck, ohne Verzeichnis-Durchlauf und ohne Begleitdatei.
      const stand = await readStateForSave(absolute);
      // Laesst sich der Stand nicht lesen, obwohl er geprueft werden soll,
      // wird nicht blind geschrieben (eine fehlende Datei ist Neuanlage).
      if (!stand.ok && expected !== null && stand.code !== 'ENOENT') {
        return { ok: false, error: stand.error };
      }
      const previousText = stand.ok ? stand.text : null;
      // 4T-001292 (Epic 3E-000224): Fehlt ein Teil, wird NICHT geschrieben. Ein
      // Schreiben aus dem unvollstaendigen Puffer verloere den fehlenden Teil
      // endgueltig, und ein nur verspaetet eintreffender Teil (Synchronisation)
      // ergaebe hinterher einen Mischtext. Die Sperre sitzt hier im
      // Haupt-Prozess als zweite Linie hinter dem Nur-Lese-Zustand des Reiters:
      // Auch ein Aufrufer, der davon nichts weiss, kommt nicht daran vorbei.
      if (stand.ok && stand.fehlend && stand.fehlend.length > 0) {
        return { ok: false, reason: 'partsMissing', fehlend: stand.fehlend };
      }
      // Bei einem geteilten Dokument ist der Vergleichsstand der
      // ZUSAMMENGESETZTE Stand aller Teile. Gegen die Kopf-Datei allein
      // verglichen meldete jedes Speichern einen Konflikt, den es nicht gibt.
      // Ohne `expected` meldet istKonflikt nie einen Konflikt; der reine
      // force-Aufruf nach dem Dialog laeuft deshalb ungeprueft durch.
      if (saveGuard.istKonflikt(previousText, expected)) {
        return { ok: false, reason: 'conflict' };
      }
      const zielPfad = stand.ok && stand.headPath ? stand.headPath : absolute;
      const plan = planeZerlegung({
        text: normalized,
        base: stand.ok ? stand.basisName : path.parse(absolute).name,
        schwelle: DOKUMENT_SCHWELLE,
        bestand: stand.ok && stand.geteilt ? stand.teile : [],
      });
      if (plan.ok === false) return { ok: false, error: plan.error };

      let geschriebenerText = normalized;
      if (plan.geteilt) {
        // Zwei Auflagen zur Sichtbarkeit: Das ERSTE Teilen einer Datei, die dem
        // Anwender gehoert, wird angekuendigt, mit «nur lesen» als Ausweg.
        // Weitere Teile kommen still dazu, weil er die Teilung dann bereits
        // angenommen hat (Entscheidung des Product Owners vom 2026-08-31).
        if (plan.neuGeteilt) {
          // Im Hintergrund wird NICHT gefragt und nicht geteilt. Ein Fenster,
          // das ungefragt aufspringt, waehrend der Anwender in einer anderen
          // Datei tippt, waere ein Uebergriff — dieselbe Ueberlegung, aus der
          // das Hintergrund-Speichern schon den Konflikt-Dialog unterlaesst
          // (performAutoSave in views.js). Nichts geht verloren: Der Reiter
          // bleibt geaendert, und beim Speichern von Hand kommt die Frage.
          if (opts && opts.hintergrund) return { ok: false, reason: 'splitPending' };
          const wahl = await frageTeilung(owner, absolute);
          if (wahl !== 'split') return { ok: false, reason: 'readOnly' };
        }
        // Beruehrt das Schreiben mehr als eine Datei, wird der alte
        // Gesamt-Stand vorher in die Historie gelegt — auch bei abgeschalteter
        // Historisierung. Es gibt keine Reihenfolge, die zwei Dateien atomar
        // schreibt; die Sicherung macht aus einer nicht umkehrbaren Lage eine
        // umkehrbare, genau wie beim erzwungenen Ueberschreiben (AK6).
        const mehrDateien = plan.teile.filter((t) => t.geaendert).length > 1;
        if (mehrDateien && !recordHistory && previousText !== null) {
          await recordMddOnSave(owner, zielPfad, previousText, previousText);
        }
        const res = await writeDocumentParts(zielPfad, plan.teile, { markSelfWriting });
        if (!res.ok) return { ok: false, error: res.error };
        // Der geschriebene Stand ist nicht der Puffer: Beim ersten Teilen
        // bekommt die Kopf-Datei ihre Zuordnungs-Zeile, das Dokument ist also
        // um diese Zeile laenger. Der Aufrufer muss den Stand uebernehmen,
        // sonst meldet das naechste Speichern einen Konflikt gegen sich selbst.
        geschriebenerText = assembleParts(
          plan.teile.map((t) => ({ index: t.index, content: t.text })),
        ).text;
      } else {
        markSelfWriting(zielPfad, normalized);
        await fs.writeFile(zielPfad, normalized, { encoding: 'utf8' });
      }
      // Beim erzwungenen Schreiben wird die ueberschriebene fremde Fassung
      // auch dann in die Historie gelegt, wenn diese abgeschaltet ist (ab Werk
      // ist sie das). Ohne .mdd legt recordSave einen Anker mit genau diesem
      // Stand an; die Fassung ist damit ueber die Historien-Ansicht abrufbar,
      // und aus einer Entscheidung unter Druck wird eine umkehrbare.
      if (recordHistory || force) {
        await recordMddOnSave(owner, zielPfad, previousText, geschriebenerText);
      }
      // `gesichert` sagt dem Aufrufer, ob wirklich eine fremde Fassung
      // ueberschrieben und dabei weggelegt wurde. Nur dann ist der Hinweis
      // auf die Historie wahr; bei unveraenderter Datei waere er eine
      // Behauptung ohne Gegenstand.
      const gesichert = force && previousText !== null && previousText !== normalized;
      return {
        ok: true,
        path: zielPfad,
        gesichert,
        geteilt: !!plan.geteilt,
        // Der tatsaechlich geschriebene Gesamt-Stand, wenn er vom Puffer
        // abweicht; sonst nichts, damit der Regelfall nichts uebertraegt.
        content: geschriebenerText === normalized ? undefined : geschriebenerText,
        // Hinweis fuer die Statusleiste: Das Dokument ist ueber der Schwelle,
        // hat aber keine Ueberschrift der obersten zwei Ebenen, an der sich
        // schneiden liesse (AK3, O5). Es bleibt ungeteilt.
        hinweis: plan.grund === 'kein-schnittpunkt' ? 'kein-schnittpunkt' : undefined,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-001293 (Epic 3E-000224): Die Teile eines Dokuments wieder vereinen.
  // Ausschliesslich auf ausdrueckliche Aktion des Anwenders (O9); es gibt
  // keinen Weg hierher, den nicht er selbst ausloest.
  handle('parts:rejoin', async (event, filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: 'parts:rejoin ohne Pfad aufgerufen' };
    }
    const ownerArea = areaOfWindow(senderWindow(event));
    if (ownerArea && !isInsideArea(ownerArea.rootPath, filePath)) {
      return { ok: false, error: 'outside-area' };
    }
    const absolute = path.resolve(filePath);
    const stand = await readStateForSave(absolute);
    if (!stand.ok) return { ok: false, error: stand.error, code: stand.code };
    if (!stand.geteilt) return { ok: false, code: 'not-split' };
    if (stand.fehlend && stand.fehlend.length > 0) {
      return { ok: false, code: 'parts-missing', fehlend: stand.fehlend };
    }
    const anzahl = stand.teile.length - 1;
    // Der Befehl loescht Dateien und wird deshalb immer bestaetigt. Liegt das
    // Ergebnis ueber der Schwelle, kommt die Warnung hinzu, die AK4 verlangt —
    // und ihr eigentlicher Inhalt ist nicht die Groesse, sondern die Folge:
    // Der Schreib-Weg teilt das Dokument beim naechsten Speichern sofort
    // wieder. Ohne diesen Satz waere der Befehl fuer den Anwender wirkungslos
    // und unerklaerlich.
    const zuGross = ueberSchwelle(stand.text, DOKUMENT_SCHWELLE);
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const antwort = await dialog.showMessageBox(owner || undefined, {
      type: zuGross ? 'warning' : 'question',
      title: t('rejoin.title'),
      message: t('rejoin.message').replace('{n}', String(anzahl)),
      detail: zuGross ? t('rejoin.detailTooLarge') : t('rejoin.detail'),
      buttons: [t('rejoin.confirm'), t('rejoin.cancel')],
      defaultId: zuGross ? 1 : 0,
      cancelId: 1,
      noLink: true,
    });
    if (antwort.response !== 0) return { ok: false, code: 'canceled' };
    return rejoinDocument(absolute, { markSelfWriting });
  });

  // Ankuendigung des ersten Teilens (4T-001291, Auflage aus dem Epic).
  // Liefert 'split' oder 'readOnly'; Abbruch und Escape fallen bewusst auf
  // 'readOnly', weil die zurueckhaltende Antwort keine Dateien anlegt.
  async function frageTeilung(owner, filePath) {
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'info',
      title: t('split.announceTitle'),
      message: t('split.announceMessage'),
      detail: `${filePath}\n\n${t('split.announceDetail')}`,
      buttons: [t('split.btnSplit'), t('split.btnReadOnly')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0 ? 'split' : 'readOnly';
  }

  // Speichern unter: OS-Dialog, dann schreiben. Returnt den gewaehlten Pfad
  // oder null, wenn der Nutzer abgebrochen hat.
  handle('file:saveAs', async (event, suggestedPath, content) => {
    const owner = senderWindow(event);
    // 4T-000323 (Epic 3E-000058): in Bereichs-Apps liegt die Vorbelegung im
    // Bereich; ein Ziel ausserhalb wird gemeldet und der Dialog erneut
    // geoeffnet (harte Grenze auch beim Speichern).
    const area = areaOfWindow(owner);
    // Wenn der Tab keinen Pfad hat, lokalisierten "Unbenannt"-Stamm plus .md
    // als Default vorschlagen (z.B. "Unbenannt.md" auf Deutsch).
    let defaultPath = suggestedPath || `${tForWindow(owner, 'save.untitled')}.md`;
    if (area) {
      if (!suggestedPath) {
        defaultPath = path.join(area.rootPath, `${tForWindow(owner, 'save.untitled')}.md`);
      } else if (!isInsideArea(area.rootPath, suggestedPath)) {
        defaultPath = path.join(area.rootPath, path.basename(suggestedPath));
      }
    }
    for (;;) {
      const dlgResult = await dialog.showSaveDialog(owner || undefined, {
        title: tForWindow(owner, 'save.saveAsTitle'),
        defaultPath,
        // M-09 (4T-000185): Filter-Namen lokalisiert.
        filters: [
          {
            name: tForWindow(owner, 'dialog.filterMarkdown'),
            extensions: ['md', 'markdown', 'mdown', 'mkd'],
          },
          { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
        ],
      });
      // W-03 (4T-000309): Abbruch als {ok:false, canceled} statt null; Schreib-
      // fehler als {ok:false, error} statt throw (Entwicklungsrichtlinien §3).
      if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };
      const absolute = path.resolve(dlgResult.filePath);
      if (area && !isInsideArea(area.rootPath, absolute)) {
        await dialog.showMessageBox(owner || undefined, {
          type: 'warning',
          title: tForWindow(owner, 'area.outsideTitle'),
          message: tForWindow(owner, 'area.outsideSaveMessage'),
          detail: absolute,
          buttons: ['OK'],
        });
        defaultPath = path.join(area.rootPath, path.basename(absolute));
        continue;
      }
      try {
        const normalized = String(content || '').replace(/\r\n/g, '\n');
        // 4T-000331 (Epic 3E-000060): Protokoll-Basis vor dem Ueberschreiben.
        const recordHistory = (await resolveHistoryFor(owner, absolute, normalized)).effective;
        const previousText = recordHistory ? await readPreviousTextFor(absolute) : null;
        markSelfWriting(absolute, normalized);
        await fs.writeFile(absolute, normalized, { encoding: 'utf8' });
        if (recordHistory) {
          await recordMddOnSave(owner, absolute, previousText, normalized);
        }
        pushRecent(absolute);
        return { ok: true, path: absolute };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }
  });
}

module.exports = { registerFilesIpc };
