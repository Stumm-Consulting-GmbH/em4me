// 4T-002161 (Epic 3E-000149): Regeln der Folien-Darstellung ohne DOM -
// Geometrie und Skalierung der Folie, Grammatik der Hintergrund-Angaben nach
// Marp und das Herausziehen der Hintergrund-Bilder aus dem Quelltext einer
// Folie.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM). Die
// Ansicht (renderer/modules/presentation/presentation-folie.js) baut daraus
// die Folie; die Ausgaben des Foliensatzes (4T-002163) brauchen dieselben
// Regeln und laden dasselbe Modul.
//
// **Geometrie** (Teil 3 von 4T-000721, Modell von Marp und reveal.js): Die
// Folie hat eine feste Entwurfsgroesse, 1280 x 720 bei 16:9 und 960 x 720 bei
// `size: 4:3` (die Hoehe bleibt, wie bei Marp). Der Inhalt wird in dieser
// Groesse gesetzt und als Ganzes gleichmaessig skaliert; Schriftgroessen und
// Umbrueche haengen damit nicht an der Fenstergroesse.
//
// **Hintergrund und Zweiteilung** (Entscheidung 3b, Marp-Schreibweise): Ein
// Bild, dessen Alternativtext mit dem Wort `bg` beginnt, ist kein Inhalt,
// sondern Hintergrund. Schluesselwoerter danach (Marpit
// `src/markdown/image/parse.js` und `background_image/advanced.js`):
// `cover` (Vorgabe), `contain` und `fit` (gleichbedeutend), `auto`, eine
// Prozent-Groesse `NN%`, `left`/`right` fuer die Zweiteilung mit optionaler
// Breite `left:NN%`/`right:NN%` (Vorgabe 50 %) und `vertical` fuer
// uebereinander statt nebeneinander bei mehreren Bildern. Andere Woerter
// (etwa Filter wie `blur`) werden nicht gedeutet und stoeren nicht.
'use strict';

const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');
const { maskInlineCode } = require('../markdown/link-scan.js');

/** Entwurfsgroessen je Format in Pixel. */
const FOLIEN_GEOMETRIE = Object.freeze({
  '16:9': Object.freeze({ breite: 1280, hoehe: 720 }),
  '4:3': Object.freeze({ breite: 960, hoehe: 720 }),
});
const GEOMETRIE_VORGABE = '16:9';

/** Rand um die skalierte Folie in der Ansicht, in Bildschirm-Pixeln. */
const FOLIEN_RAND = 24;

/**
 * Entwurfsgroesse zum Format des Kopfs (`size`); unbekannt -> 16:9.
 *
 * @param {string|null|undefined} size
 * @returns {{breite: number, hoehe: number, format: string}}
 */
function folienGeometrie(size) {
  const format = Object.prototype.hasOwnProperty.call(FOLIEN_GEOMETRIE, size)
    ? size
    : GEOMETRIE_VORGABE;
  return { ...FOLIEN_GEOMETRIE[format], format };
}

/**
 * Gleichmaessige Skalierung der Folie in eine verfuegbare Flaeche:
 * skala = min((B - 2r) / breite, (H - 2r) / hoehe), nie negativ.
 *
 * @param {number} verfuegbarBreite
 * @param {number} verfuegbarHoehe
 * @param {{breite: number, hoehe: number}} geometrie
 * @param {number} [rand]
 * @returns {{skala: number, breite: number, hoehe: number}} skala und die
 *   skalierte Groesse in Bildschirm-Pixeln.
 */
function folienSkalierung(verfuegbarBreite, verfuegbarHoehe, geometrie, rand = FOLIEN_RAND) {
  const g = geometrie || FOLIEN_GEOMETRIE[GEOMETRIE_VORGABE];
  const b = Number(verfuegbarBreite) - 2 * rand;
  const h = Number(verfuegbarHoehe) - 2 * rand;
  let skala = Math.min(b / g.breite, h / g.hoehe);
  if (!Number.isFinite(skala) || skala < 0) skala = 0;
  return { skala, breite: g.breite * skala, hoehe: g.hoehe * skala };
}

// --- Hintergrund-Angaben ---------------------------------------------------

const PROZENT_RE = /^(\d+(?:\.\d+)?)%$/;
const SEITE_RE = /^(left|right)(?::(\d+(?:\.\d+)?)%)?$/;
const SPALTE_VORGABE = '50%';

/**
 * Deutet den Alternativtext eines Bildes als Hintergrund-Angabe.
 *
 * @param {string} alt
 * @returns {null|{groesse: string, seite: null|'left'|'right', breite: string,
 *   vertikal: boolean}} null, wenn das erste Wort nicht `bg` ist.
 *   `groesse` ist `cover`, `contain`, `auto` oder eine Prozent-Angabe;
 *   `breite` ist die Breite der Bildspalte bei der Zweiteilung.
 */
function bgAngabe(alt) {
  const woerter = String(alt == null ? '' : alt)
    .trim()
    .split(/\s+/);
  if (woerter[0] !== 'bg') return null;
  const angabe = { groesse: 'cover', seite: null, breite: SPALTE_VORGABE, vertikal: false };
  for (const wort of woerter.slice(1)) {
    if (wort === 'cover' || wort === 'contain' || wort === 'auto') angabe.groesse = wort;
    else if (wort === 'fit') angabe.groesse = 'contain';
    else if (wort === 'vertical') angabe.vertikal = true;
    else if (PROZENT_RE.test(wort)) {
      const n = Number(PROZENT_RE.exec(wort)[1]);
      if (n > 0) angabe.groesse = `${n}%`;
    } else if (SEITE_RE.test(wort)) {
      const m = SEITE_RE.exec(wort);
      angabe.seite = m[1];
      if (m[2] !== undefined) {
        const n = Number(m[2]);
        // Eine Bildspalte von 0 oder 100 % liesse keine Zweiteilung uebrig.
        if (n > 0 && n < 100) angabe.breite = `${n}%`;
      }
    }
  }
  return angabe;
}

// Ein Inline-Bild mit `bg` als erstem Wort des Alternativtexts. Die Adresse
// darf in spitzen Klammern stehen und einen Titel tragen; Klammern in der
// Adresse sind nicht vorgesehen (wie bei den uebrigen Zeilen-Lesern).
const BG_BILD_RE = /!\[[ \t]*(bg(?:[ \t][^\]\n]*)?)\]\(([^()\n]*)\)/g;

/**
 * Zieht die Hintergrund-Bilder aus dem Quelltext einer Folie.
 *
 * Gefunden wird nur ausserhalb von Code-Zaeunen und Code-Spannen. Jedes
 * gefundene Bild wird aus seiner Zeile entfernt; die Zeile bleibt (leer, wenn
 * sie nur aus Bildern bestand), damit die Zeilen-Zaehlung der Folie haelt.
 *
 * @param {string} quelltext
 * @returns {{quelltext: string, bilder: Array<{markdown: string, alt: string,
 *   adresse: string, angabe: object}>}} `markdown` ist die Bild-Angabe im
 *   Wortlaut; sie wird so, wie sie steht, durch die Render-Pipeline gereicht.
 */
function hintergrundBilderZiehen(quelltext) {
  const zeilen = String(quelltext == null ? '' : quelltext).split('\n');
  const bilder = [];
  let zaun = null;
  const aus = zeilen.map((zeile) => {
    if (zaun) {
      if (schliesstZaun(zeile, zaun)) zaun = null;
      return zeile;
    }
    zaun = zaunOeffnung(zeile);
    if (zaun) return zeile;
    if (!zeile.includes('bg')) return zeile;
    const maske = maskInlineCode(zeile);
    let ergebnis = '';
    let pos = 0;
    for (const t of maske.matchAll(BG_BILD_RE)) {
      const markdown = zeile.slice(t.index, t.index + t[0].length);
      bilder.push({
        markdown,
        alt: t[1].trim(),
        adresse: t[2].trim(),
        angabe: bgAngabe(t[1]),
      });
      ergebnis += zeile.slice(pos, t.index);
      pos = t.index + t[0].length;
    }
    if (pos === 0) return zeile;
    ergebnis += zeile.slice(pos);
    return ergebnis.trim() === '' ? '' : ergebnis;
  });
  return { quelltext: aus.join('\n'), bilder };
}

/**
 * Die Anordnung der Hintergrund-Bilder einer Folie: Zweiteilung nach dem
 * ersten Bild mit Seite (Marp), sonst Hintergrund ueber die ganze Folie.
 *
 * @param {Array<{angabe: object}>} bilder
 * @returns {{seite: null|'left'|'right', breite: string, vertikal: boolean}}
 */
function hintergrundAnordnung(bilder) {
  const liste = Array.isArray(bilder) ? bilder : [];
  const geteilt = liste.find((b) => b && b.angabe && b.angabe.seite);
  const erstes = liste.find((b) => b && b.angabe);
  return {
    seite: geteilt ? geteilt.angabe.seite : null,
    breite: geteilt ? geteilt.angabe.breite : SPALTE_VORGABE,
    vertikal: Boolean(erstes && erstes.angabe.vertikal),
  };
}

module.exports = {
  FOLIEN_GEOMETRIE,
  FOLIEN_RAND,
  folienGeometrie,
  folienSkalierung,
  bgAngabe,
  hintergrundBilderZiehen,
  hintergrundAnordnung,
};
