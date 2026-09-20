// IPC-Kanal-Gruppe Einbettungen: die Aufloesung eines Wiki-Embed-Ziels und
// das Lesen seines Inhalts (embed:read, embed:resolveTarget, embed:readImage).
//
// 4T-001486 (Epic 3E-000199) aus src/main/ipc/index-views.js geschnitten. Der
// Anlass war das Groessen-Budget: Die Kanal-Gruppe der Index-Sichten stand mit
// 498 Zeilen knapp darunter und waere mit dem dreistufigen Aufloesungs-Weg auf
// 614 gewachsen. Der Schnitt ist aber nicht bloss die billigere Antwort auf
// eine Ratsche — er liegt fachlich richtig: Die Einbettung BENUTZT den
// Bereichs-Index (dritte Stufe), sie ist keine Sicht auf ihn.
//
// Eigener Zustand: keiner; Index, Unterseiten-Logik und Inhalts-Leser kommen
// als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { resolveContainedEmbedPath, containmentWurzel } = require('../documents/embed-path');
// 4T-001485 (Epic 3E-000199): dieselbe Grenz-Semantik wie das Containment.
const { isInsideArea } = require('../area/area-path.js');

// 4T-001486 (Epic 3E-000199): Groessen-Limit und MIME-Zuordnung der
// Bild-Einbettung. Beide stammen aus dem bisherigen synchronen Weg im Preload
// (P-03, 4T-000176) und wandern mit, damit der neue Weg nicht schwaecher ist
// als der alte.
const MAX_EMBED_IMAGE_BYTES = 20 * 1024 * 1024;
const EMBED_IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

function mimeForImageExt(ext) {
  return EMBED_IMAGE_MIME[ext] || 'application/octet-stream';
}

/**
 * Registriert die Kanaele der Wiki-Einbettungen.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {(event: object) => string|null} deps.areaRootForEvent Bereichs-Wurzel der Anfrage.
 * @param {object} deps.backlinks Bereichs-Index samt seiner Sichten.
 * @param {object} deps.subpages Unterseiten-Namens-Logik.
 * @param {object} deps.embedInhalt Inhalt einer Einbettung, Puffer vor Platte.
 * @param {number} deps.MAX_EMBED_BYTES Groessen-Limit fuer Markdown-Embeds.
 */
function registerEmbedsIpc(handle, deps) {
  const { areaRootForEvent, backlinks, subpages, embedInhalt, MAX_EMBED_BYTES } = deps;
  /**
   * 4T-001486 (Epic 3E-000199, Entscheidung E3): Der dreistufige Weg zum Ziel
   * einer Einbettung, fuer JEDE Art.
   *
   * Bis dahin lief er allein fuer Markdown, eingebaut im Handler embed:read;
   * PDF- und sonstige Ziele gingen ueber file:resolveLink — eine Stufe,
   * pfad-relativ, ohne Index und **ohne Containment**. Herausgeloest, damit
   * alle Arten dieselben Stufen und dieselbe Grenze bekommen.
   *
   * Die drei Stufen:
   *   1. dokument-relativ, mit Containment auf die Bereichs-Wurzel
   *   2. Unterseiten-Schreibweise ('/' -> U+2215) im selben Ordner
   *   3. Namens-Suche im Bereichs-Index (seit 4T-001494 auch fuer
   *      Nicht-Markdown-Dateien)
   *
   * @returns {Promise<{ok: true, abs: string}|{ok: false, error: string}>}
   */
  async function loeseEmbedZiel(event, basePath, embedPathRoh, kind) {
    let embedPath = embedPathRoh;
    // 4T-000337 (Epic 3E-000061): relative Unterseiten-Embeds ('![[/Name]]',
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
    // B-02 (4T-000307): Containment plus Endungs-Whitelist, bevor gelesen
    // wird — fremder Embed-Pfad gilt als nicht vertrauenswuerdig
    // (Entwicklungsrichtlinien §6). 4T-001485: Die Grenze ist die
    // Bereichs-Wurzel; enthaelt der gebundene Bereich den Dokument-Ordner
    // nicht, faellt sie auf den Dokument-Ordner zurueck.
    const areaRoot = areaRootForEvent(event);
    const guard = resolveContainedEmbedPath(basePath, embedPath, areaRoot, kind);
    if (!guard.ok) return { ok: false, error: guard.error };
    const abs = guard.abs;

    try {
      await fs.access(abs);
      return { ok: true, abs };
    } catch {
      /* Stufe 2 und 3 folgen */
    }

    // Stufe 2 — deterministisch ohne Index: Unterseiten liegen konventionell
    // im Ordner des Dokuments, '/' wird zu U+2215.
    if (/[/\\]/.test(String(embedPath))) {
      const translated = subpages.toFileBasename(String(embedPath).replace(/\\/g, '/'));
      const g2 = resolveContainedEmbedPath(basePath, translated, areaRoot, kind);
      if (g2.ok) {
        try {
          await fs.access(g2.abs);
          return { ok: true, abs: g2.abs };
        } catch {
          /* weiter zur Namens-Suche */
        }
      }
    }

    // Stufe 3 — Namens-Suche im Index (B-13). Der Kandidat muss dieselbe
    // Grenze einhalten wie Stufe 1; ohne diese Pruefung waere die Namens-
    // Suche das Loch in der Wand daneben.
    backlinks.ensureIndexForDemand(basePath, `${event.sender.id}:demand`, areaRoot);
    const logical = String(embedPath)
      .replace(/\.(md|markdown|mdown|mkd)$/i, '')
      .replace(/\\/g, '/')
      .replace(/^(\.\.?\/)+/, '');
    const idx = backlinks.resolveWikiTargetInIndex(basePath, logical, areaRoot);
    if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
      const wurzel = containmentWurzel(path.dirname(path.resolve(basePath)), areaRoot);
      const contained = idx.candidates.find((c) => isInsideArea(wurzel, c));
      // Die Endungs-Regel der Art gilt auch fuer einen Index-Treffer: Sonst
      // brachte '![[bild]]' ueber die Namens-Suche eine beliebige Datei ins
      // Bild-Element.
      if (contained) {
        const g3 = resolveContainedEmbedPath(
          basePath,
          path.relative(path.dirname(basePath), contained),
          areaRoot,
          kind,
        );
        if (g3.ok) return { ok: true, abs: contained };
        return { ok: false, error: g3.error };
      }
    }
    // Nichts gefunden: den dokument-relativen Pfad melden, damit der
    // Fehl-Hinweis das Ziel nennt, das der Anwender geschrieben hat.
    return { ok: false, error: 'not found', abs };
  }

  // 4T-001486 (Epic 3E-000199): Ziel-Pfad einer Nicht-Markdown-Einbettung.
  // Loest PDF- und sonstige Ziele ueber dieselben drei Stufen auf wie eine
  // Markdown-Einbettung; vorher lief das ueber file:resolveLink, das nichts
  // als path.resolve macht und keine Grenze kennt.
  handle('embed:resolveTarget', async (event, params) => {
    const basePath = params && params.basePath;
    const embedPath = params && params.embedPath;
    const kind = params && params.kind === 'pdf' ? 'pdf' : 'other';
    if (typeof basePath !== 'string' || typeof embedPath !== 'string') {
      return { ok: false, error: 'missing params' };
    }
    const ziel = await loeseEmbedZiel(event, basePath, embedPath, kind);
    if (!ziel.ok) return { ok: false, error: ziel.error };
    return { ok: true, path: ziel.abs };
  });

  // 4T-001486 (Epic 3E-000199): Inhalt einer Bild-Einbettung als Daten-Adresse.
  //
  // Warum die Daten und nicht der Pfad: Die Inhalts-Sicherheits-Regel der
  // Anwendung erlaubt Bild-Quellen nur aus 'self' und 'data:' — eine
  // file://-Adresse laedt der Anzeige-Prozess nicht. Der PDF-Zweig kommt mit
  // file:// aus, weil ein <embed> keine Bild-Quelle ist.
  //
  // Endungs-Whitelist und Groessen-Limit stammen aus dem bisherigen synchronen
  // Weg (P-03/4T-000176) und wandern mit, damit der neue Weg nicht schwaecher
  // ist als der alte.
  handle('embed:readImage', async (event, params) => {
    const basePath = params && params.basePath;
    const embedPath = params && params.embedPath;
    if (typeof basePath !== 'string' || typeof embedPath !== 'string') {
      return { ok: false, error: 'missing params' };
    }
    const ziel = await loeseEmbedZiel(event, basePath, embedPath, 'image');
    if (!ziel.ok) return { ok: false, error: ziel.error };
    try {
      const stat = await fs.stat(ziel.abs);
      if (stat.size > MAX_EMBED_IMAGE_BYTES) return { ok: false, error: 'too large' };
      const daten = await fs.readFile(ziel.abs);
      const ext = path.extname(ziel.abs).slice(1).toLowerCase();
      return {
        ok: true,
        path: ziel.abs,
        dataUrl: `data:${mimeForImageExt(ext)};base64,${daten.toString('base64')}`,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000055 (Epic 3E-000011): Wiki-Embed-Datei lesen. Liest die Ziel-Datei
  // und extrahiert ggf. Heading-Snippet oder Block-Element gemaess Anker.
  // Wird vom Renderer fuer Markdown-Embeds aufgerufen (![[Datei]] /
  // ![[Datei#Heading]] / ![[Datei#^id]]).
  handle('embed:read', async (event, params) => {
    const basePath = params && params.basePath;
    const embedPath = params && params.embedPath;
    const anchor = params && params.anchor;
    // 4T-001486 (Epic 3E-000199): dieselben drei Stufen wie jede andere
    // Einbettungs-Art, herausgeloest nach loeseEmbedZiel.
    const ziel = await loeseEmbedZiel(event, basePath, embedPath, 'md');
    // 4T-000948 (Befund E-01): Ein NICHT gefundenes Ziel ist hier noch kein
    // Abbruch — die Datei kann als ungespeicherter Stand im Puffer liegen,
    // und den liest liesEmbedInhalt weiter unten. Ein Containment- oder
    // Endungs-Verstoss dagegen bricht ab; er liefert bewusst kein abs.
    if (!ziel.ok && !ziel.abs) return { ok: false, error: ziel.error };
    const abs = ziel.abs;
    try {
      // 4T-000948 (Befund E-01): geschriebener Stand vor Platten-Stand (Wahl und
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

  // 4T-001805 (Epic 3E-000292): Ziele einer Canvas-Flaeche als Pfade, wie sie
  // das offene Format JSON Canvas verlangt.
  //
  // **Warum hier und nicht in einem eigenen Kanal-Modul.** Der dreistufige
  // Aufloeser dieser Gruppe ist genau das, was gebraucht wird; er ist eine
  // Schliessung in registerEmbedsIpc und nirgends exportiert. Ein zweiter
  // Aufloeser daneben waere die zweite Stelle, an der ueber dieselbe Frage
  // verschieden entschieden wird — der Fall, den 4T-001486 gerade beseitigt
  // hat.
  //
  // **Der Kanal gibt keinen absoluten Pfad heraus und liest keine Datei.** Er
  // antwortet mit dem Pfad RELATIV zur Bereichs-Wurzel; liegt das Dokument in
  // keinem Bereich, gilt der Ordner des Dokuments als Bezug. Beides ist genau
  // die Grenze, die `containmentWurzel` ohnehin zieht — die Antwort kann damit
  // nie ueber die Containment-Grenze hinauszeigen.
  //
  // Ein Ziel, das sich nicht aufloesen laesst, bekommt KEINEN Eintrag. Der
  // Uebersetzungs-Kern zaehlt es dann als Posten und schreibt das Ziel so, wie
  // es auf der Karte steht (Entscheidung F1 vom 2026-09-19).
  handle('canvas:loeseAustauschZiele', async (event, params) => {
    const basePath = params && params.basePath;
    const roh = params && Array.isArray(params.ziele) ? params.ziele : [];
    if (typeof basePath !== 'string' || basePath === '') {
      return { ok: false, error: 'missing params' };
    }
    const areaRoot = areaRootForEvent(event);
    const wurzel = containmentWurzel(path.dirname(path.resolve(basePath)), areaRoot);
    const treffer = [];
    for (const eintrag of roh) {
      const pfad = eintrag && typeof eintrag.pfad === 'string' ? eintrag.pfad : '';
      if (pfad === '') continue;
      // Die Art bestimmt allein die Endungs-Regel des Auflösers. 'other' fuer
      // das Bild aus demselben Grund wie beim Oeffnen einer Bild-Karte
      // (4T-001748): Die Endung hat der Kern der Flaeche bereits geprueft, und
      // der Satz 'image' des Auflösers fuehrt kein 'ico'.
      const kind = eintrag && eintrag.art === 'bild' ? 'other' : 'md';
      const ziel = await loeseEmbedZiel(event, basePath, pfad, kind);
      if (!ziel.ok || !ziel.abs) continue;
      const rel = path.relative(wurzel, ziel.abs);
      // Ein Ergebnis ausserhalb der Grenze gibt es nach dem Containment des
      // Auflösers nicht; die Pruefung bleibt trotzdem stehen, weil ein Pfad,
      // der mit '..' beginnt, in der fremden Datei nichts zu suchen haette.
      if (rel === '' || rel.startsWith('..')) continue;
      treffer.push({ pfad, datei: rel.split('\\').join('/') });
    }
    return { ok: true, treffer };
  });
}

module.exports = { registerEmbedsIpc };
