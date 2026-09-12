// 4T-001668 (Epic 3E-000287): Der Block, mit dem eine Canvas-Fence außerhalb
// der Canvas-Ansicht erscheint.
//
// **Entscheidung E8 des Konzepts «Canvas als räumliche Arbeitsfläche»**
// (Product Owner, 2026-09-09): Die Fläche liegt nach E1 in einer gewöhnlichen
// Markdown-Datei und begegnet dem Anwender damit in **jeder** Ansicht, die
// dieses Dokument zeigt. Ohne eigene Behandlung fiele sie überall auf den
// Standard-Renderer durch und zeigte hunderte Zeilen Koordinaten mitten im
// Text. An ihre Stelle tritt ein Block mit Art, Umfang, dem Zugang zur
// Canvas-Ansicht und einer **gedeckelten** Vorschau der Karten-Texte.
//
// **Warum ein eigenes Modul neben markdown.js** (Muster
// perspective-datatable-view.js und perspective-events.js): Die Fence-Regel
// dort bleibt eine Weiche, der Aufbau des Markups liegt hier. Das hält die
// Pipeline-Datei innerhalb ihres Größen-Budgets und macht den Block ohne
// markdown-it prüfbar.
//
// **Reiner Klartext, kein Markdown in der Vorschau** (Festlegung dieses
// Vorgangs): Die Karten-Texte werden HTML-escaped eingesetzt und nicht durch
// die Pipeline geschickt. Zwei Gründe: Ein gerenderter Karten-Text wäre ein
// **erzeugter Teilbaum** im Sinne des Wächters aus 4T-001130 und zöge den
// vollen Nachverarbeitungs-Satz nach sich; und die Vorschau soll die Fläche
// ankündigen, nicht sie ersetzen — dafür gibt es die Canvas-Ansicht.
//
// Prozessneutral (CJS, kein DOM): Das Modul läuft im Preload und in den
// Unit-Tests gleichermaßen.
'use strict';

const { escapeHtml } = require('./slug.js');
const {
  canvasKartenVorschau,
  canvasUmfang,
  parseCanvasFence,
} = require('../canvas/canvas-core.js');

// **Der Deckel der Vorschau** (Festlegung dieses Vorgangs zu AK2): höchstens
// sechs Karten in Dokument-Reihenfolge. Die Zahl hängt bewusst **nicht** an
// der Größe der Fläche — genau das verlangt AK2 —, und sechs ist die Menge,
// die im Fließtext noch als Block liest statt als zweites Dokument. Was
// darüber liegt, sagt eine Zeile «und N weitere»; wer alles sehen will,
// wechselt in die Canvas-Ansicht.
const VORSCHAU_KARTEN = 6;

// Zeichen-Deckel je Vorschau-Zeile. Eine Karte darf einen langen Absatz
// tragen; die Vorschau ist eine Zeile und keine Wiedergabe.
const VORSCHAU_ZEICHEN = 80;

// Label-Schlüssel des Blocks. markdown.js löst sie gegen die Sprachdatei auf
// (Muster PORTABLE_EVENT_LABEL_KEYS); ohne Auflösung bleibt der Schlüssel
// stehen, der Block funktioniert also auch ohne Sprachdatei.
const CANVAS_BLOCK_LABEL_KEYS = [
  'canvas.block.art',
  'canvas.block.umfang',
  'canvas.block.karte',
  'canvas.block.karten',
  'canvas.block.linie',
  'canvas.block.linien',
  'canvas.block.form',
  'canvas.block.formen',
  'canvas.block.gruppe',
  'canvas.block.gruppen',
  'canvas.block.umfangTrenner',
  'canvas.block.befund',
  'canvas.block.befunde',
  'canvas.block.weitere',
  'canvas.block.oeffnen',
  'canvas.block.zuklappen',
  'canvas.block.aufklappen',
];

function kuerze(text, max) {
  const s = String(text == null ? '' : text);
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// Zahlwort mit Einzahl- und Mehrzahl-Schlüssel. Die Trennung liegt in den
// Sprachdateien und nicht in einer Regel hier: Welche Form zu welcher Zahl
// gehört, ist Sache der Sprache.
function zahlwort(L, n, einzahl, mehrzahl) {
  return L(n === 1 ? einzahl : mehrzahl).replace('{n}', String(n));
}

/**
 * Baut den Block einer Canvas-Fence.
 *
 * @param {string} rumpf Fence-Rumpf (ohne Zaun-Zeilen).
 * @param {object} [opts]
 * @param {number} [opts.lineStart] 1-basierte Zeile der öffnenden Zaun-Zeile im
 *   Gesamt-Dokument. Sie ist die **Stelle** der Fence und damit der Schlüssel,
 *   über den der Zugang die richtige Fläche wählt und der Klapp-Zustand
 *   wiedergefunden wird.
 * @param {number} [opts.lineEnd] 1-basierte Zeile der schließenden Zaun-Zeile.
 * @param {object} [opts.labels] aufgelöste Schlüssel-Text-Karte.
 * @returns {string} HTML des Blocks.
 */
function renderCanvasBlock(rumpf, opts = {}) {
  const labels = opts.labels || {};
  const L = (key) => (typeof labels[key] === 'string' ? labels[key] : key);
  const model = parseCanvasFence(String(rumpf == null ? '' : rumpf));
  const { karten, linien, formen, gruppen, befunde } = canvasUmfang(model);
  const lineStart = Number.isFinite(opts.lineStart) ? opts.lineStart : 0;
  const lineEnd = Number.isFinite(opts.lineEnd) ? opts.lineEnd : 0;

  // 4T-001700: Formen und Gruppen erscheinen **nur, wenn es welche gibt** —
  // dieselbe Regel wie beim Befund-Hinweis darunter und aus demselben Grund:
  // Ein dauerhaftes «0 Formen» wäre Rauschen in einer Kopfzeile, die knapp
  // bleiben soll, und die allermeisten Flächen tragen keine. Karten und
  // Verbindungen bleiben die beiden festen Zahlen; sie beschreiben die Fläche
  // auch dann, wenn sie null sind.
  const teile = [
    L('canvas.block.umfang')
      .replace('{karten}', zahlwort(L, karten, 'canvas.block.karte', 'canvas.block.karten'))
      .replace('{linien}', zahlwort(L, linien, 'canvas.block.linie', 'canvas.block.linien')),
  ];
  if (formen > 0) teile.push(zahlwort(L, formen, 'canvas.block.form', 'canvas.block.formen'));
  if (gruppen > 0) {
    teile.push(zahlwort(L, gruppen, 'canvas.block.gruppe', 'canvas.block.gruppen'));
  }
  const umfang = teile.join(L('canvas.block.umfangTrenner'));

  const kopf = [
    '<div class="canvas-block-kopf">',
    `<span class="canvas-block-art">${escapeHtml(L('canvas.block.art'))}</span>`,
    `<span class="canvas-block-umfang">${escapeHtml(umfang)}</span>`,
  ];
  // Befunde erscheinen nur, wenn es welche gibt: Eine dauerhafte «0 Befunde»
  // wäre Rauschen in einer Kopfzeile, die knapp bleiben soll.
  if (befunde > 0) {
    const text = zahlwort(L, befunde, 'canvas.block.befund', 'canvas.block.befunde');
    kopf.push(`<span class="canvas-block-befunde">${escapeHtml(text)}</span>`);
  }
  // **Der Zugang ist ein Knopf und kein Klick auf den ganzen Block**
  // (Festlegung dieses Vorgangs zur dritten offenen Frage). Im Live-Modus liegt
  // der Block in einem Editor: Ein Klick auf seine Fläche setzte den
  // Schreibpunkt in die Fence und klappte sie damit zum Klartext auf — genau
  // das, was AK5 verbietet. Ein Knopf trägt sein Ziel außerdem sichtbar,
  // während eine anklickbare Fläche es nur andeutet.
  //
  // Die beiden Beschriftungen des Klapp-Knopfes reisen als Attribute mit,
  // damit der Renderer sie beim Umschalten tauschen kann, ohne die
  // Übersetzung selbst zu kennen (er hängt sonst am i18n-Modul und damit am
  // eingefrorenen Datei-Zyklus des Renderers).
  kopf.push(
    '<span class="canvas-block-aktionen">',
    `<button type="button" class="canvas-block-knopf canvas-block-oeffnen" ` +
      `data-canvas-oeffnen="${lineStart}" title="${escapeHtml(L('canvas.block.oeffnen'))}">` +
      `${escapeHtml(L('canvas.block.oeffnen'))}</button>`,
    `<button type="button" class="canvas-block-knopf canvas-block-klappen" ` +
      `aria-expanded="true" data-canvas-zu="${escapeHtml(L('canvas.block.zuklappen'))}" ` +
      `data-canvas-auf="${escapeHtml(L('canvas.block.aufklappen'))}" ` +
      `title="${escapeHtml(L('canvas.block.zuklappen'))}">−</button>`,
    '</span>',
    '</div>',
  );

  const rumpfTeile = ['<div class="canvas-block-rumpf">'];
  const kartenElemente = model.elemente.filter((el) => el.art === 'karte');
  for (const el of kartenElemente.slice(0, VORSCHAU_KARTEN)) {
    const { titel, zeile } = canvasKartenVorschau(el);
    rumpfTeile.push('<div class="canvas-block-karte">');
    rumpfTeile.push(
      `<span class="canvas-block-karte-titel">${escapeHtml(kuerze(titel, VORSCHAU_ZEICHEN))}</span>`,
    );
    if (zeile !== '') {
      rumpfTeile.push(
        `<span class="canvas-block-karte-zeile">${escapeHtml(kuerze(zeile, VORSCHAU_ZEICHEN))}</span>`,
      );
    }
    rumpfTeile.push('</div>');
  }
  if (kartenElemente.length > VORSCHAU_KARTEN) {
    const rest = String(kartenElemente.length - VORSCHAU_KARTEN);
    rumpfTeile.push(
      `<div class="canvas-block-weitere">${escapeHtml(L('canvas.block.weitere').replace('{n}', rest))}</div>`,
    );
  }
  rumpfTeile.push('</div>');

  return (
    `<div class="perspective-canvas canvas-block" data-canvas-start="${lineStart}" ` +
    `data-canvas-ende="${lineEnd}" data-source-line="${lineStart}">` +
    kopf.join('') +
    // Die leere Fläche bekommt keine Vorschau: Ein leerer Kasten unter der
    // Kopfzeile behauptete einen Inhalt, den es nicht gibt. Die Kopfzeile sagt
    // «0 Karten», und das ist die vollständige Auskunft.
    (kartenElemente.length > 0 ? rumpfTeile.join('') : '') +
    '</div>\n'
  );
}

module.exports = {
  CANVAS_BLOCK_LABEL_KEYS,
  VORSCHAU_KARTEN,
  VORSCHAU_ZEICHEN,
  renderCanvasBlock,
};
