// 4T-000344 (Epic 3E-000062): Rewrite-Kern fuer Umbenennungen. Schreibt eingehende
// Links auf den neuen Ziel-Namen um: Wiki-Links (inkl. Embeds, Anker, Pipe-
// Label, Slash-Unterseiten) und relative Markdown-Links.
//
// 4T-000847 (Epic 3E-000147): Ein Rename-Paar darf zugleich das Verzeichnis
// wechseln (physisches Verschieben einer Kapitel-Datei). Wiki-Links lösen über
// den Namen auf und bleiben davon unberührt; ein relatives Markdown-Ziel wird
// dann als GANZER Pfad neu geschrieben, weil sein Verzeichnis-Anteil sonst ins
// Leere zeigte. Bleibt das Verzeichnis gleich (reines Umbenennen), entscheidet
// unverändert der bisherige Weg über den Basename.
//
// Rein string-basiert und Electron-frei;
// die einzigen Abhaengigkeiten sind src/shared/subpages.js
// (Namens-Logik) und die gemeinsame Erkennungs-Quelle link-scan.js. Die Pfad-
// Aufloesung relativer Markdown-Ziele ist als reine '/'-String-Operation
// gekapselt (kein node:path), damit der Kern in Main und Renderer gleichermassen
// laeuft; der Aufrufer uebergibt absolute Pfade vorab '/'-normalisiert.
//
// Grundsatz (Epic-Architekturentscheidung): Der Index liefert nur Kandidaten-
// Dateien, der eigentliche Edit wird hier pro Datei frisch geparst. Ein
// veralteter Index ist damit schlimmstenfalls eine uebersehene Datei, nie ein
// korrumpierter Edit. Erkennungs-Regeln (Regexe, Inline-Code-Maskierung,
// Frontmatter-Ausschluss, Fence-Tracking, NFC-/Case-Normalisierung) sind
// deckungsgleich mit dem Backlinks-Index, weil beide aus link-scan.js lesen.
'use strict';

const {
  toFileBasename,
  toLogicalName,
  isRelativeTarget,
  expandRelativeTarget,
} = require('./subpages.js');
const {
  MD_EXT_RE,
  FENCE_RE,
  createWikiLinkRegex,
  createMdLinkRegex,
  mdLinkTargetFromMatch,
  normalizeNameKey,
  maskInlineCode,
  frontmatterBodyStart,
} = require('./markdown/link-scan.js');

// --- Pfad-Helfer (reine '/'-String-Operationen, kein node:path) -------------

// Separator auf '/' vereinheitlichen. Die absoluten Pfade kommen vom Aufrufer
// bereits absolut; hier wird nur der Backslash uebersetzt.
function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

// Letztes Pfad-Segment (Dateiname inkl. Endung).
function posixBasename(p) {
  const s = toPosix(p);
  const idx = s.lastIndexOf('/');
  return idx < 0 ? s : s.slice(idx + 1);
}

// Verzeichnis-Teil (alles vor dem letzten '/').
function posixDirname(p) {
  const s = toPosix(p);
  const idx = s.lastIndexOf('/');
  return idx < 0 ? '' : s.slice(0, idx);
}

// Loest ein relatives Ziel gegen ein Basis-Verzeichnis auf und liefert einen
// normalisierten absoluten '/'-Pfad mit aufgeloesten '.'/'..'-Segmenten. Ein
// fuehrendes '/' (POSIX-Wurzel) bleibt erhalten; Windows-Pfade (C:/...) tragen
// keines. Beide Seiten des spaeteren Vergleichs laufen durch dieselbe
// Normalisierung, sodass das absolute Format egal ist, solange es konsistent ist.
function posixResolve(baseDir, relTarget) {
  const rel = toPosix(relTarget);
  const source = rel.startsWith('/') ? rel : toPosix(baseDir) + '/' + rel;
  const leadingSlash = source.startsWith('/');
  const segs = [];
  for (const part of source.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segs.length > 0) segs.pop();
      continue;
    }
    segs.push(part);
  }
  return (leadingSlash ? '/' : '') + segs.join('/');
}

// 4T-000847 (Epic 3E-000147): Relativer '/'-Pfad von einem Verzeichnis zu einer
// Datei; beide Eingaben sind absolute Pfade in beliebiger Trenner-Schreibweise.
// Reine String-Operation wie die übrigen Helfer hier (kein node:path); die
// gemeinsame Wurzel wird case-insensitiv und NFC-normalisiert bestimmt, weil
// das Dateisystem der App ebenso vergleicht. Ohne gemeinsame Wurzel (etwa ein
// anderes Laufwerk) gibt es keinen relativen Pfad; dann liefert die Funktion
// null und der Aufrufer bleibt beim bisherigen Weg.
function posixRelative(fromDir, toPath) {
  const from = toPosix(fromDir)
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.');
  const to = toPosix(toPath)
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.');
  if (to.length === 0) return null;
  const name = to[to.length - 1];
  const toDir = to.slice(0, -1);
  let shared = 0;
  while (
    shared < from.length &&
    shared < toDir.length &&
    normalizeNameKey(from[shared]) === normalizeNameKey(toDir[shared])
  ) {
    shared++;
  }
  if (shared === 0) return null;
  const up = new Array(from.length - shared).fill('..');
  return [...up, ...toDir.slice(shared), name].join('/');
}

// 4T-000847: Hat die Operation die Datei in ein anderes Verzeichnis bewegt? Nur
// dann greift die Pfad-Nachführung; beim reinen Umbenennen bleibt das
// Verzeichnis gleich und der Bestands-Weg (Basename ersetzen) entscheidet
// unverändert.
function movedToOtherDir(r) {
  return normalizeNameKey(posixDirname(r.oldAbs)) !== normalizeNameKey(posixDirname(r.newAbs));
}

// URI-Dekodierung mit Fallback (wie der Klick-/Index-Pfad): ungueltige Kodierung
// wird unveraendert weitergereicht.
function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

// --- Zeilen-Split mit Offsets -----------------------------------------------

// Zerlegt Text in Zeilen und behaelt pro Zeile den absoluten Start-Offset im
// Text. Die Zeilenenden (LF/CRLF) bleiben im Original erhalten, weil nur Spans
// innerhalb einer Zeile ersetzt werden — das Bewahren der EOL-Konvention
// verhindert, dass eine Datei nach dem Rewrite als komplett veraendert gilt.
function splitLinesWithOffsets(text) {
  const result = [];
  const re = /\r?\n/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    result.push({ text: text.slice(start, m.index), start });
    start = m.index + m[0].length;
  }
  result.push({ text: text.slice(start), start });
  return result;
}

// --- Wiki-Link-Rewrite ------------------------------------------------------

// Bestimmt den neuen Wiki-Ziel-Namen (Slash-Schreibweise) fuer einen Ziel-Core
// oder null, wenn nichts umzuschreiben ist.
function resolveWikiNewName(core, ctx) {
  if (isRelativeTarget(core)) {
    return resolveRelativeWikiNewName(core, ctx);
  }
  // Direkter Name oder Slash-Unterseiten-Form: Slash -> U+2215 (Datei-Basename-
  // Form), Vergleich gegen die alten Basenames der Umbenennungen.
  const asFileBase = toFileBasename(core);
  const r = ctx.renameByOldBase.get(normalizeNameKey(asFileBase));
  if (!r) return null;
  // Wiki-Links schreiben '/', nicht das U+2215-Trennzeichen.
  return toLogicalName(r.newBase);
}

// Relative Unterseiten-Formen ('/Name', '..') konservativ behandeln
// (Architektur-Entscheidung): nur umschreiben, wenn ihre Aufloesung durch die
// Umbenennung bricht. Bleibt die Form gueltig (Kontext und Ziel wurden gemeinsam
// umbenannt), bleibt sie unveraendert, weil die relative Form semantisch
// gewollt ist (Vorlagen-Faehigkeit aus 3E-000061).
function resolveRelativeWikiNewName(core, ctx) {
  // Worauf zeigte der relative Link VOR der Umbenennung (gegen den alten
  // Kontext-Basename)?
  const oldTarget = expandRelativeTarget(ctx.oldContextBase, core);
  if (!oldTarget) return null; // nicht aufloesbar ('..' auf Top-Level)
  const r = ctx.renameByOldBase.get(normalizeNameKey(oldTarget));
  if (!r) return null; // Ziel nicht umbenannt -> relative Form bleibt gueltig
  // Zeigt die relative Form gegen den NEUEN Kontext-Basename weiterhin aufs
  // neue Ziel? Dann bleibt sie gueltig und unveraendert.
  const newTarget = expandRelativeTarget(ctx.newContextBase, core);
  if (newTarget && normalizeNameKey(newTarget) === normalizeNameKey(r.newBase)) {
    return null;
  }
  // Bruch: auf die absolute Slash-Form des neuen Ziels umschreiben.
  return toLogicalName(r.newBase);
}

// Sammelt die Wiki-Link-Ersetzungen einer Zeile. `masked` ist die inline-code-
// maskierte Zeile (laengengleich zu `line`), auf der gematcht wird; ersetzt wird
// an denselben Offsets im Original `line`.
function collectWikiRewrites(line, masked, ctx) {
  const out = [];
  const re = createWikiLinkRegex();
  let m;
  while ((m = re.exec(masked)) !== null) {
    const rawTarget = m[1];
    // Anker abtrennen (erstes '#' im Ziel-Teil).
    const anchorIdx = rawTarget.indexOf('#');
    const namePortion = anchorIdx >= 0 ? rawTarget.slice(0, anchorIdx) : rawTarget;
    // namePortion in fuehrenden Whitespace / Kern / (Tabellen-Backslash + Ws)
    // zerlegen. Der Backlinks-Parser bereinigt den Namen ebenso (trim +
    // trailing '\'); die Zerlegung haelt zusaetzlich die Offsets fest.
    const nm = namePortion.match(/^(\s*)([\s\S]*?)(\\?)(\s*)$/);
    const leadWs = nm[1];
    const core = nm[2];
    if (!core) continue; // reiner Anker [[#x]] oder leer
    const newName = resolveWikiNewName(core, ctx);
    if (newName === null) continue;
    const isEmbed = m.index > 0 && line.charAt(m.index - 1) === '!';
    const spanStart = m.index + 2 + leadWs.length; // nach '[[' plus fuehrender Ws
    const fullStart = isEmbed ? m.index - 1 : m.index;
    const fullEnd = m.index + m[0].length;
    out.push({
      spanStart,
      spanLen: core.length,
      replacement: newName,
      typ: isEmbed ? 'wiki-embed' : 'wiki',
      fullText: line.slice(fullStart, fullEnd),
      fullStart,
    });
  }
  return out;
}

// --- Markdown-Link-Rewrite --------------------------------------------------

// Sammelt die relativen Markdown-Link-Ersetzungen einer Zeile. Ersetzt nur den
// Dateinamen (letztes Pfad-Segment); Verzeichnis-Praefix, Endung, Anker und
// Kodierungsform bleiben, weil eine Umbenennung nur den Basename aendert.
function collectMdRewrites(line, masked, ctx) {
  const out = [];
  const re = createMdLinkRegex();
  let m;
  while ((m = re.exec(masked)) !== null) {
    const { target: linkTarget, anchor, angle } = mdLinkTargetFromMatch(m);
    if (/^[a-z]+:\/\//i.test(linkTarget) || linkTarget.startsWith('//')) continue;
    const resolvedAbs = posixResolve(ctx.contextDir, safeDecode(linkTarget));
    const r = ctx.renameByOldAbs.get(normalizeNameKey(resolvedAbs));
    if (!r) continue;
    // Start des Ziel-Pfades im Match: nach dem Text-Ende '](' bzw. '](<'.
    const targetPos = m.index + m[0].indexOf('](') + 2 + (angle ? 1 : 0);
    const lastSlash = linkTarget.lastIndexOf('/');
    const baseOffsetInTarget = lastSlash >= 0 ? lastSlash + 1 : 0;
    const encodedOldBasename = linkTarget.slice(baseOffsetInTarget);
    const newBasenameRaw = posixBasename(r.newAbs);
    const fullText = line.slice(m.index, m.index + m[0].length);
    // 4T-000847 (Epic 3E-000147): Wechselt die Ziel-Datei das Verzeichnis (das
    // physische Verschieben einer Kapitel-Datei), genügt das Ersetzen des
    // Basenames nicht: der Verzeichnis-Anteil des relativen Ziels zeigte
    // danach ins Leere. Dann wird das GANZE Ziel durch den neuen relativen
    // Pfad von der verweisenden Datei zur neuen Lage ersetzt — die
    // verweisende Datei ist `contextPath` in ihrer NEUEN Lage, sodass eine
    // gemeinsame Bewegung beider Seiten richtig herauskommt.
    //
    // Ausgenommen bleiben wurzel-verankerte Ziele ('/…'): sie sind keine
    // relative Angabe, und aus einer absoluten Form eine relative zu machen
    // wäre eine Umdeutung statt einer Nachführung.
    const moved =
      !linkTarget.startsWith('/') && movedToOtherDir(r)
        ? posixRelative(ctx.contextDir, r.newAbs)
        : null;
    if (moved !== null) {
      // Kodierungs- und Klammer-Form des Originals beibehalten, dieselben
      // Regeln wie unten — nur über das ganze Ziel statt über den Basename.
      const wasEncodedTarget = linkTarget !== safeDecode(linkTarget);
      if (angle) {
        // <…>-Form: Leerzeichen sind nativ erlaubt, Klammern und Anker
        // bleiben stehen.
        out.push({
          spanStart: targetPos,
          spanLen: linkTarget.length,
          replacement: moved,
          typ: 'md',
          fullText,
          fullStart: m.index,
        });
      } else if (!wasEncodedTarget && /\s/.test(moved)) {
        // Bringt die neue Lage ein Leerzeichen in ein bisher klammerloses,
        // unkodiertes Ziel (Ordnername mit Leerzeichen), wandert die ganze
        // Destination in spitze Klammern und der Anker mit (Regel 4T-000476).
        out.push({
          spanStart: targetPos,
          spanLen: linkTarget.length + (anchor ? anchor.length + 1 : 0),
          replacement: `<${moved}${anchor ? '#' + anchor : ''}>`,
          typ: 'md',
          fullText,
          fullStart: m.index,
        });
      } else {
        out.push({
          spanStart: targetPos,
          spanLen: linkTarget.length,
          replacement: wasEncodedTarget ? encodeURI(moved) : moved,
          typ: 'md',
          fullText,
          fullStart: m.index,
        });
      }
      continue;
    }
    // 4T-000476 (Epic 3E-000088): <…>-Form — Leerzeichen sind nativ erlaubt,
    // Basename roh ersetzen, Klammern und Anker bleiben stehen.
    if (angle) {
      out.push({
        spanStart: targetPos + baseOffsetInTarget,
        spanLen: encodedOldBasename.length,
        replacement: newBasenameRaw,
        typ: 'md',
        fullText,
        fullStart: m.index,
      });
      continue;
    }
    const wasEncoded = encodedOldBasename !== safeDecode(encodedOldBasename);
    // 4T-000476 (PO-Entscheidung): führt die Umbenennung Leerzeichen in ein
    // bisher klammerloses, unkodiertes Ziel ein, wird die gesamte Destination
    // auf die <…>-Form umgestellt (ein unkodiertes Leerzeichen wäre kein
    // gültiges CommonMark-Ziel); ein Anker wandert mit in die Klammern.
    // Bereits %-kodierte Ziele behalten ihre Kodierungsform (Zweig unten).
    if (!wasEncoded && /\s/.test(newBasenameRaw)) {
      const prefix = linkTarget.slice(0, baseOffsetInTarget);
      out.push({
        spanStart: targetPos,
        spanLen: linkTarget.length + (anchor ? anchor.length + 1 : 0),
        replacement: `<${prefix}${newBasenameRaw}${anchor ? '#' + anchor : ''}>`,
        typ: 'md',
        fullText,
        fullStart: m.index,
      });
      continue;
    }
    // Kodierungsform des Originals beibehalten: %-kodierte Ziele werden auch
    // bei neuen Leerzeichen weiter kodiert geschrieben. Umlaute u. ä. bleiben
    // bei unkodierten Zielen unkodiert.
    const newBasename = wasEncoded ? encodeURI(newBasenameRaw) : newBasenameRaw;
    out.push({
      spanStart: targetPos + baseOffsetInTarget,
      spanLen: encodedOldBasename.length,
      replacement: newBasename,
      typ: 'md',
      fullText,
      fullStart: m.index,
    });
  }
  return out;
}

// --- Oeffentliche API -------------------------------------------------------

// computeLinkRewrites(content, { renames, contextPath })
//   renames:     Array<{ oldBase, newBase, oldAbs, newAbs }> — logische
//                U+2215-Basenames (ohne Endung) plus absolute Pfade; bei einer
//                Kaskade alle Rename-Paare des Baums.
//   contextPath: absoluter Pfad der bearbeiteten Datei (nach der Umbenennung,
//                falls sie selbst Teil der Kaskade war); '/'-normalisiert.
// Rueckgabe: { changed, newContent, hits: [{ zeile, alt, neu, typ }] }.
function computeLinkRewrites(content, options) {
  const opts = options || {};
  const renames = Array.isArray(opts.renames) ? opts.renames : [];
  const contextPath = opts.contextPath || '';
  if (typeof content !== 'string' || !content || renames.length === 0) {
    return { changed: false, newContent: content, hits: [] };
  }

  // BOM abtrennen und am Ende wieder voranstellen: haelt die Offsets stabil und
  // laesst die Byte-Order-Mark unberuehrt (der Backlinks-Parser strippt sie
  // ebenfalls vor der Verarbeitung).
  // BOM (falls vorhanden) unveraendert uebernehmen, ohne ein unsichtbares
  // BOM-Literal in den Quelltext zu setzen (Lint-Befund M-04): charAt(0) liefert
  // das BOM selbst, wenn charCodeAt es als 0xFEFF erkennt.
  const hasBom = content.charCodeAt(0) === 0xfeff;
  const bom = hasBom ? content.charAt(0) : '';
  const body = hasBom ? content.slice(1) : content;

  const newContextBase = posixBasename(contextPath).replace(MD_EXT_RE, '');
  // Alter Kontext-Basename: die Kontext-Datei kann selbst Teil der Kaskade
  // gewesen sein (dann ihr oldBase), sonst unveraendert.
  const ctxRename = renames.find(
    (r) => normalizeNameKey(toPosix(r.newAbs)) === normalizeNameKey(toPosix(contextPath)),
  );
  const ctx = {
    renameByOldBase: new Map(),
    renameByOldAbs: new Map(),
    oldContextBase: ctxRename ? ctxRename.oldBase : newContextBase,
    newContextBase,
    contextDir: posixDirname(contextPath),
  };
  for (const r of renames) {
    ctx.renameByOldBase.set(normalizeNameKey(r.oldBase), r);
    ctx.renameByOldAbs.set(normalizeNameKey(toPosix(r.oldAbs)), r);
  }

  const lines = splitLinesWithOffsets(body);
  const fmStart = frontmatterBodyStart(lines.map((l) => l.text));
  const reps = [];
  const hits = [];

  let inFence = false;
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    if (i < fmStart) continue; // Frontmatter ausklammern
    const { text: line, start: lineStart } = lines[i];

    // Fenced-Code-Tracking (gleiche Maschine wie der Backlinks-Parser).
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const ch = fenceMatch[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;

    const masked = maskInlineCode(line);
    const lineNum = i + 1;
    const found = collectWikiRewrites(line, masked, ctx).concat(
      collectMdRewrites(line, masked, ctx),
    );
    for (const f of found) {
      reps.push({
        start: lineStart + f.spanStart,
        end: lineStart + f.spanStart + f.spanLen,
        replacement: f.replacement,
      });
      const coreInFull = f.spanStart - f.fullStart;
      const neu =
        f.fullText.slice(0, coreInFull) + f.replacement + f.fullText.slice(coreInFull + f.spanLen);
      hits.push({ zeile: lineNum, alt: f.fullText, neu, typ: f.typ });
    }
  }

  if (reps.length === 0) {
    return { changed: false, newContent: content, hits: [] };
  }
  reps.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const rep of reps) {
    out += body.slice(pos, rep.start) + rep.replacement;
    pos = rep.end;
  }
  out += body.slice(pos);
  return { changed: true, newContent: bom + out, hits };
}

module.exports = { computeLinkRewrites };
