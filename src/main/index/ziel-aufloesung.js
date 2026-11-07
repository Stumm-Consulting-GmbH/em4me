// 4T-002517 (Epic 3E-000402): Der dreistufige Weg vom geschriebenen Ziel zu
// einer Datei, gemeinsam für die Einbettung (`loeseEmbedZiel` in
// src/main/ipc/embeds.js) und die Kachel mit Abfrage-Datei (`abfrageDatei` in
// src/main/index/dashboard-quellen.js). Bis hierher stand er zweimal, und die
// Kopie aus 4T-002510 trug eine `// OFFEN:`-Markierung, die genau das benannte.
//
// Die drei Stufen:
//   1. dokument-relativ, mit Grenzprüfung auf die Bereichs-Wurzel
//      (`resolveContainedEmbedPath`), samt Endungs-Regel der Art
//   2. Unterseiten-Schreibweise ('/' -> U+2215) im selben Ordner
//   3. Namens-Suche im Bereichs-Index; der Treffer muss dieselbe Grenze
//      einhalten wie Stufe 1, sonst wäre die Namens-Suche das Loch in der Wand
//      daneben
//
// **Verhalten byte-gleich zu beiden Vorgängern** (Entscheidung der Sitzung vom
// 2026-11-03). Die Kopie der Kachel wich an vier Stellen ab; jede ist hier eine
// benannte Angabe statt einer stillen Vereinheitlichung, damit keiner der beiden
// Aufrufer sein Verhalten ändert:
//   - `pufferText`: In Stufe 1 zählt ein ungespeicherter Stand im Puffer als
//     vorhanden (Kachel). Die Einbettung liest den Puffer erst danach über den
//     gemeldeten Pfad des Fehlschlags.
//   - `relativStetsMarkdown`: Ein relatives Unterseiten-Ziel ist stets ein
//     Markdown-Dokument; abgeschnitten wird nur `.md`, angehängt immer `.md`
//     (Kachel). Die Einbettung behält eine andere Endung des Ziels.
//   - `trefferNurMarkdown`: Ein Treffer der Namens-Suche gilt nur mit
//     Markdown-Endung, ein anderer zählt als nicht gefunden (Kachel). Die
//     Einbettung prüft ihn über die Endungs-Regel ihrer Art und meldet deren
//     Grund.
//   - `vorNamensSuche`: Anstoß vor Stufe 3 (Einbettung: Bedarf am Index
//     anmelden). Die Kachel meldet ihn schon an ihrem Kanal an.
//
// Prozess-neutral gegenüber Electron: Index und Unterseiten-Logik kommen als
// Angaben, damit Prüffälle sie stellen können wie bei der Einbettung. Liest
// keine Datei, prüft nur ihr Vorhandensein.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { resolveContainedEmbedPath, containmentWurzel } = require('../documents/embed-path.js');
const { isInsideArea } = require('../area/area-path.js');
const {
  isAreaLinkTarget,
  EMBED_GRUND_VERKNUEPFTER_BEREICH,
} = require('../../shared/area-link-syntax.js');

const MD_ENDUNG_RE = /\.(md|markdown|mdown|mkd)$/i;

/**
 * Ohne Endung ist ein Markdown-Dokument gemeint, wie im Render-Plugin; der
 * Eltern-Verweis `..` bleibt, wie er ist, der Auflöser expandiert ihn.
 *
 * Eine Stelle für alle Kanäle, die ein Dokument über seinen Namen erreichen:
 * die Einbettung (4T-002023) und die Kachel mit Abfrage-Datei. Maßgeblich ist
 * die Regel der Einbettung; die frühere Kopie der Kachel kannte die Ausnahme
 * für `..` nicht, brauchte sie aber auch nie, weil die Kachel relative Ziele
 * vorher abzweigt (Review-Runde 1 von 3E-000402, Befund A1).
 *
 * @param {string} ziel Das geschriebene Ziel.
 * @returns {string} Das Ziel, ohne Endung mit `.md`.
 */
function mitMarkdownEndung(ziel) {
  return /\.[a-z0-9]{1,8}$/i.test(ziel) || /^\.\.\/?$/.test(ziel) ? ziel : `${ziel}.md`;
}

async function gibtEs(abs) {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

// Relatives Unterseiten-Ziel ('/Name', '..') gegen den Basename des eigenen
// Dokuments; Ergebnis ist die U+2215-Form mit Endung, oder null.
function expandiereRelativ(basePath, ziel, subpages, stetsMarkdown) {
  const ownBase = path.basename(String(basePath || '')).replace(MD_ENDUNG_RE, '');
  if (stetsMarkdown) {
    const expanded = subpages.expandRelativeTarget(ownBase, ziel.replace(/\.md$/i, ''));
    return expanded ? `${expanded}.md` : null;
  }
  const extMatch = ziel.match(/\.[a-z0-9]{1,8}$/i);
  const ext = extMatch ? extMatch[0] : '';
  const noExt = ext ? ziel.slice(0, -ext.length) : ziel;
  const expanded = subpages.expandRelativeTarget(ownBase, noExt);
  return expanded ? expanded + (ext || '.md') : null;
}

/**
 * Löst ein geschriebenes Ziel über die drei Stufen auf.
 *
 * @param {object} p Parameter.
 * @param {string} p.basePath Pfad des Dokuments, in dem das Ziel steht.
 * @param {string} p.ziel Das Ziel, wie der Aufrufer es vorbereitet hat.
 * @param {string|null} p.areaRoot Bereichs-Wurzel des Fensters.
 * @param {string} [p.kind] Art für die Endungs-Regel (`md`, `image`, `pdf`, `other`).
 * @param {object} p.subpages Unterseiten-Logik (`isRelativeTarget`,
 *   `expandRelativeTarget`, `toFileBasename`).
 * @param {Function} p.resolveWikiTargetInIndex Namens-Suche im Bereichs-Index.
 * @param {Function} [p.vorNamensSuche] Anstoß vor Stufe 3.
 * @param {Function} [p.pufferText] Puffer-Stand eines Pfads oder null (Stufe 1).
 * @param {boolean} [p.relativStetsMarkdown] Siehe Kopf des Moduls.
 * @param {boolean} [p.trefferNurMarkdown] Siehe Kopf des Moduls.
 * @returns {Promise<{ok: true, abs: string}
 *   |{ok: false, error: string, abs?: string, indexBereit?: boolean}>}
 */
async function loeseZielDreistufig(p) {
  const { basePath, areaRoot, subpages } = p;
  const kind = p.kind || 'md';
  // 4T-002092: Ein Ziel in einem verknüpften Bereich ('@kürzel:Datei') wird
  // nicht aufgelöst; der Grund reist bis zum Hinweis, ohne Pfad, damit kein
  // Aufrufer danach noch zu lesen versucht.
  if (isAreaLinkTarget(p.ziel)) return { ok: false, error: EMBED_GRUND_VERKNUEPFTER_BEREICH };
  let ziel = p.ziel;
  if (typeof ziel === 'string' && subpages.isRelativeTarget(ziel)) {
    ziel = expandiereRelativ(basePath, ziel, subpages, !!p.relativStetsMarkdown);
    if (!ziel) return { ok: false, error: 'not found' };
  }
  // B-02 (4T-000307): Grenze und Endungs-Regel, bevor irgendetwas gelesen wird —
  // ein fremdes Ziel gilt als nicht vertrauenswürdig (Entwicklungsrichtlinien,
  // Kapitel 6).
  const guard = resolveContainedEmbedPath(basePath, ziel, areaRoot, kind);
  if (!guard.ok) return { ok: false, error: guard.error };
  const abs = guard.abs;
  if ((await gibtEs(abs)) || (p.pufferText && p.pufferText(abs) !== null)) {
    return { ok: true, abs };
  }

  // Stufe 2 — deterministisch ohne Index: Unterseiten liegen konventionell im
  // Ordner des Dokuments, '/' wird zu U+2215.
  if (/[/\\]/.test(String(ziel))) {
    const translated = subpages.toFileBasename(String(ziel).replace(/\\/g, '/'));
    const g2 = resolveContainedEmbedPath(basePath, translated, areaRoot, kind);
    if (g2.ok && (await gibtEs(g2.abs))) return { ok: true, abs: g2.abs };
  }

  // Stufe 3 — Namens-Suche im Index (B-13), mit derselben Grenze wie Stufe 1.
  if (p.vorNamensSuche) p.vorNamensSuche();
  const logical = String(ziel)
    .replace(MD_ENDUNG_RE, '')
    .replace(/\\/g, '/')
    .replace(/^(\.\.?\/)+/, '');
  const idx = p.resolveWikiTargetInIndex(basePath, logical, areaRoot);
  if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
    const wurzel = containmentWurzel(path.dirname(path.resolve(basePath)), areaRoot);
    const contained = idx.candidates.find((c) => isInsideArea(wurzel, c));
    if (contained && p.trefferNurMarkdown) {
      if (MD_ENDUNG_RE.test(contained)) return { ok: true, abs: contained };
    } else if (contained) {
      // Die Endungs-Regel der Art gilt auch für einen Index-Treffer: Sonst
      // brächte '![[bild]]' über die Namens-Suche eine beliebige Datei ins
      // Bild-Element.
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
  // Nichts gefunden: den dokument-relativen Pfad melden (der Fehl-Hinweis nennt
  // das geschriebene Ziel, und ein Puffer-Stand dort bleibt lesbar), dazu, ob
  // die Namens-Suche schon greifen konnte (4T-002023).
  return { ok: false, error: 'not found', abs, indexBereit: !!(idx && idx.status === 'ready') };
}

module.exports = { loeseZielDreistufig, mitMarkdownEndung };
