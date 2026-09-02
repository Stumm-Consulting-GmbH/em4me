// 4T-000179 (Epic 3E-000039): aus src/main/preload.js extrahiert.
// YAML-Frontmatter: Erkennung/Extraktion (js-yaml) und Round-Trip-Schreiben
// (yaml fuer kommentar-erhaltende Edits). Electron-frei.
'use strict';

// 4T-000049 (Epic 3E-000010): js-yaml fuer YAML-Frontmatter-Parsing. Geparst
// wird mit JSON_SCHEMA (P-06/4T-000183: Kommentar an den Code angeglichen):
// nur JSON-kompatible Typen, kein eval/Code-Ausfuehrung. Wir nutzen es
// hier nur zum Lesen; Round-Trip-Schreiben passiert ueber die yaml-Library
// (siehe unten), die Kommentare und Schluesselreihenfolge erhaelt.
const yaml = require('js-yaml');
// 4T-000051 (Epic 3E-000010): yaml-Library (Eemeli) mit Document-API fuer
// Round-Trip-faehiges Schreiben. parseDocument liefert ein Dokument-Objekt,
// dessen set/delete-Operationen Stil und Kommentare der nicht angefassten
// Felder erhalten. Nur geaenderte Felder werden im Output neu serialisiert.
const yamlDoc = require('yaml');

// 4T-000049 (Epic 3E-000010): YAML-Frontmatter erkennen und vom Render-Pfad
// ausklammern. Akzeptiert wird nur ein Block, der mit '---' in Zeile 1
// oeffnet und mit '---' oder '...' in einer spaeteren Zeile schliesst.
// Ein einzelnes '---' am Datei-Anfang ohne Schluss ist regulaere Markdown-
// Trennlinie und wird nicht als Frontmatter behandelt. Bei Parse-Fehlern
// wird data=null und parseError=<message> zurueckgegeben; raw und body
// bleiben korrekt, damit der Render-Pfad nicht stoeren.
// 4T-000282 (Epic 3E-000050): yamlText (Blockinhalt ohne die Marker-Zeilen)
// wird mit zurueckgegeben — die Frontmatter-Zeile im Gerenderten zeigt
// ihn als Klartext-YAML an.
function extractFrontmatter(text) {
  const source = String(text || '');
  if (!source.startsWith('---')) {
    return { raw: null, data: null, body: source, parseError: null, endOffset: 0, yamlText: null };
  }
  // Erste Zeile muss genau '---' (gefolgt von \n oder \r\n oder EOF) sein.
  const firstLineEnd = source.indexOf('\n');
  const firstLine = firstLineEnd >= 0 ? source.slice(0, firstLineEnd).trimEnd() : source.trimEnd();
  if (firstLine !== '---') {
    return { raw: null, data: null, body: source, parseError: null, endOffset: 0, yamlText: null };
  }
  if (firstLineEnd < 0) {
    // Datei besteht nur aus '---' ohne Newline danach: keine Frontmatter.
    return { raw: null, data: null, body: source, parseError: null, endOffset: 0, yamlText: null };
  }
  // Suche die naechste Schliess-Zeile ('---' oder '...') exakt an Zeilenanfang.
  const closeRegex = /\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/;
  const rest = source.slice(firstLineEnd);
  const match = rest.match(closeRegex);
  if (!match) {
    // Oeffnender '---'-Block ohne Schluss: keine Frontmatter, regulaeres
    // Dokument. Damit wird ein versehentliches '---' am Datei-Anfang nicht
    // als halbgeschluckter Block interpretiert.
    return { raw: null, data: null, body: source, parseError: null, endOffset: 0, yamlText: null };
  }
  const blockBodyStart = firstLineEnd + 1; // Position nach erstem \n
  const blockBodyEnd = firstLineEnd + match.index; // vor dem schliessenden \n
  const yamlText = source.slice(blockBodyStart, blockBodyEnd);
  const endOffset = firstLineEnd + match.index + match[0].length;
  const raw = source.slice(0, endOffset);
  const body = source.slice(endOffset);
  let data = null;
  let parseError = null;
  try {
    const parsed = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
    // Nur Objekte akzeptieren (kein Skalar als Frontmatter sinnvoll).
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed;
    } else if (parsed === null || parsed === undefined) {
      data = {};
    } else {
      parseError = 'frontmatter must be a YAML mapping';
    }
  } catch (err) {
    parseError = err && err.message ? String(err.message) : 'YAML parse error';
  }
  return { raw, data, body, parseError, endOffset, yamlText };
}

// 4T-000051 (Epic 3E-000010): Schreibt eine modifizierte Frontmatter-Map
// zurueck in den Dokument-Text. Round-Trip-faehig ueber die yaml-Library:
// Kommentare und Schluesselreihenfolge bestehender Felder bleiben erhalten,
// nur tatsaechlich geaenderte Felder werden neu serialisiert.
//
// Parameter:
//   originalText - aktueller Datei-Inhalt (Frontmatter + Body, oder nur Body)
//   newData      - Plain-JS-Objekt mit der Ziel-Map. null/undefined wird zu {}
//
// Rueckgabe:
//   { ok: true,  text: string }                 bei Erfolg
//   { ok: false, error: string, text: null }    bei Fehler
//
// Sonderfaelle:
//   - originalText ohne Frontmatter und newData leer:
//       Text bleibt unveraendert.
//   - originalText mit Frontmatter und newData leer:
//       Frontmatter-Block wird komplett entfernt; Body bleibt erhalten.
//   - originalText ohne Frontmatter und newData mit Feldern:
//       Neuer Frontmatter-Block wird am Anfang eingefuegt.
//   - originalText mit Frontmatter und newData mit Feldern:
//       Diff wird auf das bestehende Document angewendet (set/delete pro Key).
function writeFrontmatter(originalText, newData, options = {}) {
  try {
    const source = String(originalText || '');
    // 4T-000069 (Epic 3E-000012): Zeilenenden-Konvention der Quelle uebernehmen.
    // Eemeli-yaml `doc.toString()` schreibt immer LF — ohne diese Normalisierung
    // mischt der Round-Trip auf Windows-Dateien LF-Frontmatter mit CRLF-Body
    // und der dirty-Flag wird schon beim ersten Auto-Save gesetzt, obwohl der
    // Nutzer nichts geaendert hat.
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const fm = extractFrontmatter(source);
    const safeData =
      newData && typeof newData === 'object' && !Array.isArray(newData) ? newData : {};
    const newKeys = Object.keys(safeData);
    // 4T-000491 (Epic 3E-000093): Komplett-Uebernahme — die hier genannten NEUEN
    // Schluessel werden auch mit leerem Wert geschrieben (als bare YAML-
    // Schluessel ueber null + nullStr unten). Der 4T-000069-Churn-Schutz fuer
    // BESTEHENDE Leer-Felder bleibt unangetastet.
    const emptyStubKeys = new Set(
      options && Array.isArray(options.emptyStubKeys) ? options.emptyStubKeys : [],
    );
    const isEmptyValue = (v) =>
      v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

    // Sonderfall 1: kein Frontmatter und nichts hinzuzufuegen.
    if (newKeys.length === 0 && fm.raw === null) {
      return { ok: true, text: source };
    }
    // Sonderfall 2: Frontmatter komplett entfernen.
    if (newKeys.length === 0 && fm.raw !== null) {
      const stripped = (fm.body || '').replace(/^\r?\n+/, '');
      return { ok: true, text: stripped };
    }

    let doc;
    let buildFresh = false;
    if (fm.raw === null || fm.parseError) {
      // Kein Frontmatter da oder vorhandener Block defekt: neu erzeugen.
      buildFresh = true;
    } else {
      // Bestehendes Document parsen, fuer Round-Trip-Treue.
      const yamlText = fm.raw.replace(/^---\r?\n/, '').replace(/\r?\n(---|\.\.\.)\s*\r?\n?$/, '');
      doc = yamlDoc.parseDocument(yamlText);
      // contents kann leer oder kein Mapping sein; in beiden Faellen
      // bauen wir das Dokument frisch auf.
      if (!doc.contents || !doc.contents.items) buildFresh = true;
    }

    if (buildFresh) {
      doc = new yamlDoc.Document();
      // 4T-000491 (Epic 3E-000093): leere Stub-Felder als bare Schluessel seeden
      // (null), damit auch ein frisch erzeugtes Frontmatter (kein bestehender
      // Block) die ergaenzten Felder zeigt.
      let seed = safeData;
      if (emptyStubKeys.size > 0) {
        seed = { ...safeData };
        for (const key of emptyStubKeys) {
          if (isEmptyValue(seed[key])) seed[key] = null;
        }
      }
      doc.contents = doc.createNode(seed);
    } else {
      const currentJs = doc.toJS() || {};
      // Schritt 1: vorhandene Keys, die in newData nicht mehr sind, loeschen.
      for (const key of Object.keys(currentJs)) {
        if (!Object.prototype.hasOwnProperty.call(safeData, key)) {
          doc.delete(key);
        }
      }
      // Schritt 2: nur tatsaechlich geaenderte/neue Felder neu setzen.
      // Identische Werte bleiben unberuehrt — damit erhaelt yaml.toString()
      // Kommentare und Stilangaben des Original-Knotens.
      //
      // 4T-000069 (Epic 3E-000012): Leer-Aequivalenz. Der Properties-Editor liest
      // leere String-/Multistring-Felder als '' bzw. [] zurueck, waehrend die
      // YAML-Library leere Werte (z.B. `Taetigkeit:` ohne Wert) als null
      // parst. Ohne Sonder-Check wuerde der Initial-Auto-Save jeden solchen
      // Wert mit `doc.set(key, '')` ueberschreiben, wodurch `Taetigkeit:`
      // zu `Taetigkeit: ''` mit Anfuehrungszeichen wuerde — semantisch
      // identisch, syntaktisch verschieden, und der Tab waere sofort dirty.
      for (const key of newKeys) {
        const newValue = safeData[key];
        const currentValue = currentJs[key];
        if (isEmptyValue(currentValue) && isEmptyValue(newValue)) {
          // 4T-000491 (Epic 3E-000093): ein NEUES Feld aus der Komplett-Uebernahme
          // wird auch leer geschrieben — als bare Schluessel (null, unten mit
          // nullStr serialisiert). Bestehende Leer-Felder bleiben unberuehrt
          // (4T-000069-Churn-Schutz), neue Nicht-Stub-Leerwerte wie bisher.
          if (emptyStubKeys.has(key) && !Object.prototype.hasOwnProperty.call(currentJs, key)) {
            doc.set(key, null);
          }
          continue;
        }
        if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
          doc.set(key, newValue);
        }
      }
    }

    // 4T-000069: doc.toString() schreibt nur LF; auf die EOL-Konvention der
    // Quelle normalisieren, damit Round-Trip bei CRLF-Dateien treu bleibt.
    // 4T-000491 (Epic 3E-000093): bei Komplett-Uebernahme leere Stub-Felder als
    // bare Schluessel ausgeben (nullStr ''); bestehende null-/bare-Knoten
    // bleiben erhalten, weil unveraenderte Knoten ihre Quelle behalten.
    const serialized = emptyStubKeys.size > 0 ? doc.toString({ nullStr: '' }) : doc.toString();
    const yamlSerialized = serialized.trimEnd().replace(/\n/g, eol);
    const newFrontmatter = `---${eol}${yamlSerialized}${eol}---${eol}`;
    // 4T-000069: Anzahl der Leerzeilen zwischen Frontmatter-Ende und Body
    // erhalten — newFrontmatter endet schon mit einem EOL, also nur das
    // ZUSAETZLICHE Whitespace aus der Quelle uebernehmen (auf eol normalisiert).
    const leadingNewlines = (fm.body || '').match(/^\r?\n*/)[0];
    const bodyClean = (fm.body || '').slice(leadingNewlines.length);
    const normalizedLeading = leadingNewlines.replace(/\r?\n/g, eol);
    return { ok: true, text: newFrontmatter + normalizedLeading + bodyClean };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'YAML write error';
    return { ok: false, error: msg, text: null };
  }
}

module.exports = { extractFrontmatter, writeFrontmatter };
