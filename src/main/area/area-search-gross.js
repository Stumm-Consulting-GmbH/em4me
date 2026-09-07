// 4T-001260 (Epic 3E-000272): Dateien oberhalb der Einzelgrenze des
// Bereichs-Suchraums.
//
// Der Speicher-Deckel des Suchraums gilt fuer den ganzen Bereich, und genau
// darin lag der Mangel: Eine einzige sehr grosse Datei brauchte ihn auf, und
// danach lief die Suche ueber JEDES gewoehnliche Prosa-Dokument ueber die
// Platte. Gemessen am 2026-09-05: 200 Prosa-Dokumente (zusammen 7,8 MB)
// brauchten allein 33 ms je Suchlauf und neben einer einzelnen 53-MB-Datei
// 192 ms — die Grenze traf nicht den Verursacher, sondern alle anderen. Nach
// der Behebung bleibt derselbe Bestand im Vorrats-Modus und braucht 112 ms.
//
// Eine Datei oberhalb der Einzelgrenze bleibt deshalb aus dem Vorrat und wird
// je Lauf gelesen; der uebrige Bestand behaelt seinen Vorrat. Damit traegt die
// grosse Datei die Kosten, die sie verursacht.
//
// Eigenes Modul aus demselben Grund wie area-search-cache.js und
// area-search-teile.js: Die Suche selbst bleibt in area-search.js, die
// Beistell-Fachlichkeiten stehen daneben. Der Schnitt ist hier zusaetzlich vom
// Datei-Budget erzwungen worden (500 Zeilen), und er faellt leicht, weil dieses
// Modul allein an der Platte haengt und nichts vom Suchlauf weiss.
'use strict';

const fs = require('node:fs');

// Obergrenze je EINZELNER Datei, Entscheidung des Product Owners vom
// 2026-09-05. Die Zahl folgt dem Index-Parser, der eine Einzeldatei ab
// derselben Groesse abweist (`MAX_FILE_BYTES` in src/main/index/parse.js) —
// dieselbe Groessenordnung fuer dieselbe Frage, statt einer neu erfundenen.
const MAX_DATEI_BYTES = 10 * 1024 * 1024;

/**
 * Liest die Texte der Dateien oberhalb der Einzelgrenze, je Suchlauf.
 *
 * Sie liegen nicht im Vorrat, gehoeren aber in denselben Trefferraum: Sie
 * fallen aus dem SPEICHER, nicht aus dem TREFFERRAUM. Der Puffer-Stand hat wie
 * ueberall Vorrang vor der Platte, damit die Zusage «gefunden wird auch
 * Ungespeichertes» nicht an der Dateigroesse haengt.
 *
 * @param {Array<{rel: string, abs: string}>} grosse Die Dateien ueber der Grenze.
 * @param {object} opt
 * @param {number} opt.leseBreite Dateien je Lese-Welle (wie im Direkt-Weg).
 * @param {(rel: string) => string|null} opt.pufferStand Puffer-Stand oder null.
 * @param {string|null} [opt.aktivRel] Die offene Datei, falls im Bereich.
 * @param {string|null} [opt.aktivText] Ihr Editor-Stand.
 * @returns {Promise<Map<string, string>>} Texte je wurzel-relativem Pfad.
 */
async function lieseGrosseDateien(grosse, opt) {
  const texte = new Map();
  const liste = Array.isArray(grosse) ? grosse : [];
  if (liste.length === 0) return texte;
  const { leseBreite, pufferStand, aktivRel = null, aktivText = null } = opt;
  const hatEditorStand = !!aktivRel && typeof aktivText === 'string';
  for (let i = 0; i < liste.length; i += leseBreite) {
    const welle = liste.slice(i, i + leseBreite);
    const inhalte = await Promise.all(
      welle.map((d) => {
        if (hatEditorStand && d.rel === aktivRel) return Promise.resolve(aktivText);
        const puffer = pufferStand(d.rel);
        if (puffer !== null) return Promise.resolve(puffer);
        return fs.promises.readFile(d.abs, 'utf8').catch(() => null);
      }),
    );
    for (let k = 0; k < welle.length; k++) {
      if (inhalte[k] !== null) texte.set(welle[k].rel, inhalte[k]);
    }
  }
  return texte;
}

module.exports = { MAX_DATEI_BYTES, lieseGrosseDateien };
