// 4T-002630 (Epic 3E-000395): Titelbild eines Dokuments über die Eigenschaft
// `cover` im Kopf des Dokuments, mit `cover-height` und `cover-position`.
//
// **Zweck.** Der Kern liest die Angaben aus dem Kopf, prüft die Werte und baut
// den Kopf-Bereich, den die Pipeline in der Vollansicht vor die Frontmatter-Zeile
// setzt (`renderMarkdown`, Option `titelbild`) und den die Live-Ansicht aus
// derselben Quelle als Block zeigt (`src/renderer/modules/live/live-titelbild.js`).
// Prozessneutral: CommonJS, ohne Electron, ohne DOM.
//
// **Drei Formen des Werts** (Entscheidungen V3, V4 und V10 des Epics):
// - `pfad`: eine Bilddatei, relativ zum Ordner des Dokuments oder absolut. Das
//   Element `<img>` trägt den Pfad kodiert; die Bild-Auflösung des Vorlade-Skripts
//   (`src/main/preload-images.js`) macht daraus eine Daten-Adresse innerhalb der
//   Grenze oder nimmt die Adresse weg. Ein neuer Datei-Zugriff entsteht nicht.
// - `wiki`: `[[Name]]` als Zeichenkette oder als Liste mit einer Liste mit einer
//   Zeichenkette (die Form ohne Anführungszeichen); Platzhalter der
//   Wiki-Einbettung, aufgelöst mit Namens-Suche und Grenze im Renderer.
// - `netz`: `http:` oder `https:`. Bilder aus dem Netz lädt das Programm nicht
//   (Antwort des Product Owners auf P3); an ihrer Stelle steht ein Hinweis.
//
// **Sicherheit.** Der geschriebene Wert erscheint nur kodiert und für Attribute
// maskiert; der Stil-Wert entsteht ausschließlich aus den geprüften Zahlen von
// Höhe und Lage, nie aus Text des Dokuments.
'use strict';

/** Vorgaben und Grenzen von Höhe (Bildpunkte) und Lage (Prozent von oben), V9. */
const HOEHE_VORGABE = 200;
const HOEHE_MIN = 80;
const HOEHE_MAX = 600;
const LAGE_VORGABE = 50;
const LAGE_WOERTER = { top: 0, center: 50, bottom: 100 };

// Maskierung für Attribut-Werte (Muster escapeHtml in plugins/wiki.js), hier mit
// dem einfachen Anführungszeichen.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function begrenze(wert, min, max) {
  return Math.min(max, Math.max(min, wert));
}

function istEinfachesObjekt(wert) {
  return !!wert && typeof wert === 'object' && !Array.isArray(wert);
}

// `cover-height`: endliche Zahl oder Ziffern-Zeichenkette, gerundet, begrenzt.
function leseHoehe(wert) {
  let zahl = null;
  if (typeof wert === 'number' && Number.isFinite(wert)) zahl = wert;
  else if (typeof wert === 'string' && /^\s*\d+\s*$/.test(wert)) zahl = Number(wert);
  if (zahl === null) return HOEHE_VORGABE;
  return begrenze(Math.round(zahl), HOEHE_MIN, HOEHE_MAX);
}

// `cover-position`: Zahl 0 bis 100 (begrenzt) oder top/center/bottom.
function leseLage(wert) {
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return begrenze(Math.round(wert), 0, 100);
  }
  if (typeof wert === 'string') {
    const wort = wert.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LAGE_WOERTER, wort)) return LAGE_WOERTER[wort];
  }
  return LAGE_VORGABE;
}

// Name aus dem Inneren einer Wiki-Form: Anker (`#`) und Breite (`|`) entfallen.
function wikiName(inneres) {
  return String(inneres).split('|')[0].split('#')[0].trim();
}

// Form und Quelle des Werts von `cover`; `{ form: null }` für alles andere.
function leseQuelle(wert) {
  // Wiki-Form ohne Anführungszeichen: `cover: [[bild.png]]` liest YAML als
  // Liste mit einer Liste mit einer Zeichenkette (V10).
  if (
    Array.isArray(wert) &&
    wert.length === 1 &&
    Array.isArray(wert[0]) &&
    wert[0].length === 1 &&
    typeof wert[0][0] === 'string'
  ) {
    const name = wikiName(wert[0][0]);
    return name ? { form: 'wiki', quelle: name } : { form: null, quelle: '' };
  }
  if (typeof wert !== 'string') return { form: null, quelle: '' };
  const text = wert.trim();
  if (!text) return { form: null, quelle: '' };
  const wiki = /^\[\[([^[\]]*)\]\]$/.exec(text);
  if (wiki) {
    const name = wikiName(wiki[1]);
    return name ? { form: 'wiki', quelle: name } : { form: null, quelle: '' };
  }
  if (/^https?:/i.test(text)) return { form: 'netz', quelle: text };
  if (/^(file|data):/i.test(text)) return { form: null, quelle: '' };
  return { form: 'pfad', quelle: text };
}

/**
 * Die Angaben des Titelbilds aus den gelesenen Daten des Kopfs.
 *
 * @param {object|null} fmData Daten des Kopfs (`extractFrontmatter(...).data`).
 * @returns {{ quelle: string, form: 'pfad'|'wiki'|'netz'|null, hoehe: number, lage: number }|null}
 *   `null` ohne Kopf oder ohne `cover`; `form: null` bei einem Wert, der kein
 *   Titelbild ergibt.
 */
function titelbildAngaben(fmData) {
  if (!istEinfachesObjekt(fmData)) return null;
  if (!Object.prototype.hasOwnProperty.call(fmData, 'cover')) return null;
  const { form, quelle } = leseQuelle(fmData.cover);
  return {
    quelle,
    form,
    hoehe: leseHoehe(fmData['cover-height']),
    lage: leseLage(fmData['cover-position']),
  };
}

// Der Hinweis trägt keinen eingebauten Text: Jeder sichtbare Text läuft über
// einen Sprach-Schlüssel (`data-i18n`), den die Nachbearbeitung der Ansicht
// einsetzt. Im Attribut `title` steht der geschriebene Wert.
function hinweis(schluessel, quelle) {
  return `<span class="titelbild-hinweis" data-i18n="${schluessel}" title="${escapeHtml(quelle)}"></span>`;
}

/**
 * Der Kopf-Bereich des Titelbilds als HTML; leer ohne Titelbild.
 *
 * @param {ReturnType<typeof titelbildAngaben>} angaben
 * @returns {string}
 */
function titelbildHtml(angaben) {
  if (!angaben || !angaben.form) return '';
  // Der Stil-Wert entsteht allein aus geprüften Zahlen; auch eine von außen
  // gereichte Angabe läuft noch einmal durch die Prüfung.
  const stil = `--titelbild-hoehe: ${leseHoehe(angaben.hoehe)}px; --titelbild-lage: ${leseLage(angaben.lage)}%`;
  const quelle = String(angaben.quelle || '');
  const kopf = (zusatz) => `<figure class="titelbild${zusatz}" style="${stil}">`;
  const fehlt = hinweis('frontmatter.coverImage.missing', quelle);
  if (angaben.form === 'netz') {
    return `${kopf(' titelbild-ohne-bild')}${hinweis('frontmatter.coverImage.remote', quelle)}</figure>\n`;
  }
  if (angaben.form === 'wiki') {
    return (
      `${kopf('')}<span class="wiki-embed wiki-embed-image" data-embed-kind="image" ` +
      `data-embed-path="${escapeHtml(quelle)}"></span>${fehlt}</figure>\n`
    );
  }
  let adresse;
  try {
    // encodeURI lässt das einfache Anführungszeichen stehen; als %27 übersteht
    // es die Maskierung und kommt über decodeURI der Bild-Auflösung zurück.
    adresse = encodeURI(quelle).replace(/'/g, '%27');
  } catch {
    // Ein einzelnes Ersatzzeichen ist nicht kodierbar: nur der Hinweis.
    return `${kopf(' titelbild-ohne-bild')}${fehlt}</figure>\n`;
  }
  return `${kopf('')}<img class="titelbild-bild" src="${escapeHtml(adresse)}" alt="">${fehlt}</figure>\n`;
}

module.exports = {
  titelbildAngaben,
  titelbildHtml,
  HOEHE_VORGABE,
  HOEHE_MIN,
  HOEHE_MAX,
  LAGE_VORGABE,
};
