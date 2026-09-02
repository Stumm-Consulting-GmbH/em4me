// 4T-000604 (Epic 3E-000113): Reiner Kern der Erstellungs- und Änderungszeitpunkt-
// Automatik. Setzt die konfigurierbaren Frontmatter-Felder beim Speichern,
// ohne Electron und ohne DOM, damit die Regeln unit-testbar sind. Die
// Dateisystem-Zeitstempel besorgt der Speicher-Hook im Renderer (views.js);
// er schreibt das Ergebnis anschließend cursor-schonend zurück.
'use strict';

const { extractFrontmatter, writeFrontmatter } = require('./frontmatter.js');

// Lokaler Zeitstempel als 'JJJJ-MM-TT' oder (withTime) 'JJJJ-MM-TT HH:mm'.
// Bewusst lokale Zeit: das sind nutzer-sichtbare Dokument-Daten und kein
// System-Log; minutengenau, ohne Sekunden und ohne Zeitzonen-Angabe.
function formatLocalStamp(ms, withTime) {
  const d = new Date(ms);
  const p2 = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  return withTime ? `${date} ${p2(d.getHours())}:${p2(d.getMinutes())}` : date;
}

// Liefert den neuen Dokument-Text mit gesetzten created/updated-Feldern oder
// null (nichts zu ändern, defektes YAML, Schreibfehler). null heißt für den
// Aufrufer: Dokument bleibt byte-identisch.
//
// config: { createdEnabled, createdField, updatedEnabled, updatedField,
//           withTime (bool), autoCreate (bool) }
// times:  { nowMs, birthtimeMs }
//
// Regeln (die Anlage-Option gilt nur für FEHLENDE Felder; ein vorhandenes,
// aber leeres Feld wird unabhängig davon gefüllt):
//   - updated: ein vorhandenes Feld (auch leer) erhält den Speicherzeitpunkt;
//     ein fehlendes Feld nur bei autoCreate.
//   - created: ein vorhandener Wert bleibt unangetastet (created ist
//     einmalig); ein vorhandenes, aber leeres Feld wird aus birthtimeMs
//     gefüllt (Fallback nowMs); ein fehlendes Feld nur bei autoCreate.
//   - created wird vor updated eingetragen, damit bei Neuanlage beider Felder
//     die Reihenfolge created, updated entsteht.
//   - Ohne Frontmatter-Block entsteht nur bei autoCreate ein neuer Block.
//   - Defektes Frontmatter-YAML lässt den Inhalt unangetastet.
function applyTimestampFields(content, config, times) {
  if (!config || (!config.createdEnabled && !config.updatedEnabled)) return null;
  const source = typeof content === 'string' ? content : '';
  let fm;
  try {
    fm = extractFrontmatter(source);
  } catch {
    return null;
  }
  if (fm.parseError) return null;

  const data = { ...(fm.data || {}) };
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  const isEmpty = (v) => v == null || v === '';
  const nowMs = times && typeof times.nowMs === 'number' ? times.nowMs : 0;
  const birthtimeMs = times && times.birthtimeMs ? times.birthtimeMs : nowMs;
  let changed = false;

  if (config.createdEnabled) {
    const key = config.createdField || 'created';
    // Vorhandener Wert bleibt stehen. Sonst füllen, wenn das Feld existiert
    // (auch leer) oder autoCreate ein fehlendes Feld anlegen darf.
    if (isEmpty(data[key]) && (has(key) || config.autoCreate)) {
      data[key] = formatLocalStamp(birthtimeMs, config.withTime);
      changed = true;
    }
  }

  if (config.updatedEnabled) {
    const key = config.updatedField || 'updated';
    const stamp = formatLocalStamp(nowMs, config.withTime);
    // Vorhandenes Feld (auch leer) immer auf jetzt setzen; fehlendes Feld nur
    // bei autoCreate anlegen. Gleicher Wert bedeutet keine Änderung und
    // verhindert damit einen Speicher-Kreislauf.
    if (has(key)) {
      if (data[key] !== stamp) {
        data[key] = stamp;
        changed = true;
      }
    } else if (config.autoCreate) {
      data[key] = stamp;
      changed = true;
    }
  }

  if (!changed) return null;
  const result = writeFrontmatter(source, data);
  if (!result.ok || typeof result.text !== 'string') return null;
  return result.text;
}

module.exports = { formatLocalStamp, applyTimestampFields };
