// --- HTML-Export: Datei-Huelle (4T-002167, Epic 3E-000347) ----------------------
// Setzt aus Titel, Sprache, Inhalts-HTML und Stilen eine eigenstaendige
// HTML-Datei zusammen. Reine Funktion ohne DOM-Zugriff: Das Erfassen des
// gerenderten Inhalts (Stile lesen, Bedien-Elemente entfernen, Verweise und
// Bilder behandeln) liegt in html-export.js. Geschnitten fuer den Folien-Export
// der Praesentations-Ansicht (Stufe 1), der dieselbe Huelle je Folie aufruft,
// ohne sie ein zweites Mal zu bauen.
//
// Die Datei enthaelt bewusst kein <script>: Sie zeigt den angezeigten Stand des
// Dokuments und fuehrt kein Programm aus.
//
// 4T-002163 (Epic 3E-000149): Die eine Ausnahme ist die Folien-Seite. Sie
// bekommt vom Aufrufer ausdruecklich ein kleines, eingebettetes Blaetter-Skript
// ohne Fremd-Code (`skript`) und statt `markdown-body` eine eigene Klasse fuer
// <main> (`hauptKlassen`), weil die Folie ihren Inhalts-Bereich selbst traegt.
// Ohne beide Angaben ist die Datei unveraendert die des Dokument-Exports.
'use strict';

function escapeHtmlText(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(wert) {
  return escapeHtmlText(wert).replace(/"/g, '&quot;');
}

// Ein `</style` im Stil-Text beendete den Stil-Block vorzeitig. Der Backslash
// ist in CSS ein Escape und laesst das Zeichen unveraendert stehen, die
// Bedeutung des Stils bleibt also gleich.
function sichererStilText(stile) {
  const text = Array.isArray(stile) ? stile.filter(Boolean).join('\n') : String(stile || '');
  return text.replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * Baut eine eigenstaendige HTML-Datei.
 *
 * @param {object} teile
 * @param {string} teile.titel Anzeigename des Dokuments (Inhalt von <title>).
 * @param {string} teile.sprache Sprach-Angabe der Oberflaeche (Attribut lang).
 * @param {string} teile.inhaltHtml Fertiges Inhalts-HTML (kommt unveraendert
 *   in <main class="markdown-body">).
 * @param {string|string[]} teile.stile Stil-Text oder Liste von Stil-Bloecken,
 *   in dieser Reihenfolge in einen <style>-Block.
 * @param {string} [teile.wurzelKlassen] Klassen fuer <html> (die des
 *   Wurzel-Elements der Anwendung), damit Inhalts-Regeln mit einer Bedingung an
 *   der Wurzel greifen, etwa `:root.frontmatter-expanded .markdown-body ...`.
 *   Leer: <html> ohne class-Attribut.
 * @param {string} [teile.inhaltsKlassen] Klassen eines Behaelters um <main>
 *   (die des Inhalts-Bereichs der Anwendung, etwa `content view-rendered`),
 *   damit Regeln mit diesem Vorfahren greifen. Leer: kein Behaelter.
 * @param {string} [teile.hauptKlassen] Klassen von <main> (Vorgabe
 *   `markdown-body`).
 * @param {string} [teile.skript] Eingebettetes Skript vor </body>; leer: kein
 *   <script> (Vorgabe).
 * @returns {string} Der vollstaendige Datei-Text.
 */
export function baueHtmlDatei({
  titel,
  sprache,
  inhaltHtml,
  stile,
  wurzelKlassen,
  inhaltsKlassen,
  hauptKlassen,
  skript,
}) {
  const wurzel = String(wurzelKlassen || '').trim();
  const behaelter = String(inhaltsKlassen || '').trim();
  const haupt = String(hauptKlassen || '').trim() || 'markdown-body';
  const programm = String(skript || '').trim();
  const wurzelAttr = wurzel ? ` class="${escapeHtmlAttr(wurzel)}"` : '';
  return [
    '<!doctype html>',
    `<html lang="${escapeHtmlAttr(sprache || 'de')}"${wurzelAttr}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtmlText(titel)}</title>`,
    '<style>',
    sichererStilText(stile),
    '</style>',
    '</head>',
    '<body>',
    ...(behaelter ? [`<div class="${escapeHtmlAttr(behaelter)}">`] : []),
    `<main class="${escapeHtmlAttr(haupt)}">`,
    String(inhaltHtml || ''),
    '</main>',
    ...(behaelter ? ['</div>'] : []),
    // Ein `</script` im Skript-Text beendete den Block vorzeitig; der
    // Backslash laesst die Zeichenkette in JavaScript unveraendert.
    ...(programm ? ['<script>', programm.replace(/<\/(script)/gi, '<\\/$1'), '</script>'] : []),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
