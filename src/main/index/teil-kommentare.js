// 4T-002863 (Epic 3E-000449), Sicherheits-Review Runde 2, Befund 1: Private
// Kommentare über die Grenze eines geteilten Dokuments.
//
// **Das Problem.** Ein Dokument jenseits der Größen-Schwelle liegt in mehreren
// Teil-Dateien (document-parts.js), geschnitten vor einer Überschrift. Der
// Schnitt kennt Code-Zäune, aber keine privaten Kommentare; ein Kommentar, der
// eine Überschrift umschließt, kann deshalb über die Grenze reichen. Die
// Anzeige setzt die Teile zusammen und blendet ihn richtig aus. Der Index las
// jeden Teil für sich: Im Folgeteil stand der Rest des Kommentars als
// sichtbarer Text, und sein schließender Marker öffnete einen neuen.
//
// **Die Lösung.** Der Index bereinigt jeden Teil am zusammengesetzten
// Dokument, wie die Anzeige, und gibt jedem Teil danach seine Zeilen zurück.
// Zusammengesetzt wird nach denselben Regeln wie beim Öffnen
// (`readAssembledDocument` in src/main/documents/document-parts-io.js):
// dieselbe Zuordnungs-Zeile, dieselbe Ordnung (`orderPartFiles`), Rümpfe ohne
// Trennzeichen aneinander. Eine eigene Fassung des Ablaufs ist nötig, weil der
// Beobachter-Weg des Index synchron liest; die Bausteine sind geteilt, und
// ein Prüffall hält beide Wege gleich.
//
// **Kosten.** Ergebnis und Datei-Stand eines Dokuments bleiben gemerkt; die
// übrigen Teile prüfen nur den Stand ihrer Geschwister. Bereinigt wird nur,
// wenn irgendwo im Dokument ein Marker steht. Ein ungeteiltes Dokument zahlt
// eine Zeichen-Suche.
//
// **Sichere Seite.** Fehlt ein Teil vor dem gelesenen (auch eine Lücke in der
// Folge der Positionen) oder ist er nicht lesbar, ist unbekannt, ob ein
// Kommentar in den Teil hineinreicht; der Rumpf des Teils fällt dann ganz aus
// dem Index. Ebenso eine Zeile, die zwei Teile teilen, weil die Grenze nicht
// am Zeilenanfang liegt (nur bei Hand bearbeitete Teile). Beim Warmstart gilt
// ein gespeicherter Teil nur, solange sich weder eine Teil-Datei des Dokuments
// bewegt hat noch eine hinzugekommen ist.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { pathCompareKey } = require('../../shared/platform.js');
const { orderPartFiles, partInfoOf } = require('../../shared/document-assembly.js');
const {
  baseBasenameOf,
  buildPartBasename,
  isBlankPartBase,
  FIRST_PART_INDEX,
} = require('../../shared/document-parts.js');
const { frontmatterBodyStart } = require('../../shared/markdown/link-scan.js');
const {
  kommentareAusblenden,
  regelStand,
  textOhnePrivateKommentare,
} = require('./index-kommentare.js');

// Endungs-Liste wie im Lese-Weg (document-parts-io.js).
const MD_EXTENSION_RE = /\.(md|markdown|mdown|mkd)$/i;

// Gemerkte Dokumente, Schlüssel ist die Kopf-Datei. Klein gehalten: Gebraucht
// wird ein Eintrag, solange die Teile eines Dokuments nacheinander gelesen
// werden.
const MERKEN_MAX = 8;
const gemerkt = new Map();

/**
 * Die Teil-Dateien des Dokuments, zu dem `filePath` gehört, aus dem Inhalt der
 * Datei und den Namen ihres Ordners. Rein, ohne Datei-Zugriff.
 *
 * @param {string} filePath Pfad der gelesenen Datei.
 * @param {string} content Ihr Inhalt.
 * @param {string[]} namen Datei-Namen des Ordners.
 * @returns {{pfade: string[], eigener: number}|null} null, wenn die Datei kein
 *   Teil eines geteilten Dokuments ist.
 */
function planeTeile(filePath, content, namen) {
  const info = partInfoOf(content);
  if (!info || !isBlankPartBase(info.base)) return null;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath) || '.md';
  const basenames = [];
  const dateien = new Map();
  for (const name of namen || []) {
    if (!MD_EXTENSION_RE.test(name)) continue;
    const basename = name.replace(MD_EXTENSION_RE, '');
    basenames.push(basename);
    dateien.set(pathCompareKey(basename), name);
  }
  const headName = dateien.get(pathCompareKey(info.base));
  const selbstKopf = !headName && info.index === FIRST_PART_INDEX;
  const headBasename = selbstKopf
    ? path.parse(filePath).name
    : headName
      ? headName.replace(MD_EXTENSION_RE, '')
      : info.base;
  const { parts } = orderPartFiles(headBasename, basenames, pathCompareKey);
  // Sicherheits-Review Runde 3, Befund 1: Jede Position bis zur höchsten
  // vorhandenen bekommt einen Eintrag, auch eine Lücke. Ihr Pfad besteht
  // nicht, ihr Rumpf ist damit nicht lesbar, und ab ihr gilt die sichere
  // Seite; zusammengesetzt über die Lücke hinweg reichte ein Kommentar-Rest
  // aus dem fehlenden Teil sonst als sichtbarer Text in den nächsten.
  const hoechste = parts[parts.length - 1].index;
  if (hoechste <= FIRST_PART_INDEX) return null;
  const nachIndex = new Map(parts.map((p) => [p.index, p.basename]));
  const pfade = [];
  for (let index = FIRST_PART_INDEX; index <= hoechste; index++) {
    const basename = nachIndex.get(index) || buildPartBasename(headBasename, index);
    const datei = dateien.get(pathCompareKey(basename));
    pfade.push(path.join(dir, datei || `${basename}${ext}`));
  }
  const eigenerSchluessel = pathCompareKey(filePath);
  const eigener = pfade.findIndex((p) => pathCompareKey(p) === eigenerSchluessel);
  return eigener < 0 ? null : { pfade, eigener };
}

function rumpfVon(content) {
  const zeilen = String(content)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  return zeilen.slice(frontmatterBodyStart(zeilen)).join('\n');
}

const leer = (rumpf) => rumpf.split('\n').map(() => '');

/**
 * Bereinigt die Teile eines Dokuments am zusammengesetzten Rumpf.
 *
 * @param {Array<string|null>} rumpfe Rumpf je Teil in Reihenfolge; null für
 *   einen Teil, der nicht lesbar ist.
 * @param {(text: string) => string} bereinige Zeilentreue Bereinigung.
 * @returns {Array<string[]|null>} Je Teil die bereinigten Rumpf-Zeilen, null
 *   für «unverändert» und für einen nicht lesbaren Teil.
 */
function bereinigeTeile(rumpfe, bereinige) {
  const n = rumpfe.length;
  const ergebnis = new Array(n).fill(null);
  let bis = rumpfe.indexOf(null);
  if (bis < 0) bis = n;
  // Nach einem nicht lesbaren Teil ist der Zustand unbekannt: sichere Seite.
  // Zweitblick Runde 3, Befund 1: Ein weiterer nicht lesbarer Teil bleibt null.
  for (let i = bis + 1; i < n; i++) ergebnis[i] = rumpfe[i] === null ? null : leer(rumpfe[i]);
  const zusammen = rumpfe.slice(0, bis).join('');
  if (!zusammen.includes('%%')) return ergebnis;
  const sauber = bereinige(zusammen).split('\n');
  if (sauber.length !== zusammen.split('\n').length) {
    for (let i = 0; i < bis; i++) ergebnis[i] = leer(rumpfe[i]);
    return ergebnis;
  }
  let zeile = 0;
  let ersteGeteilt = false;
  for (let i = 0; i < bis; i++) {
    const roh = rumpfe[i].split('\n');
    const teil = sauber.slice(zeile, zeile + roh.length);
    // Die letzte Zeile eines Teils ist im zusammengesetzten Text zugleich die
    // erste des nächsten. Endet der Teil mit einem Umbruch, ist sie bei ihm
    // leer; sonst teilen sich zwei Teile eine Zeile, und sie fällt bei beiden
    // weg.
    if (ersteGeteilt) teil[0] = '';
    ersteGeteilt = false;
    if (i < bis - 1) {
      if (roh[roh.length - 1] !== '' && rumpfe[i + 1] !== '') ersteGeteilt = true;
      teil[teil.length - 1] = '';
    }
    zeile += roh.length - 1;
    const gleich = teil.length === roh.length && teil.every((z, k) => z === roh[k]);
    ergebnis[i] = gleich ? null : teil;
  }
  return ergebnis;
}

function merke(schluessel, eintrag) {
  gemerkt.delete(schluessel);
  gemerkt.set(schluessel, eintrag);
  while (gemerkt.size > MERKEN_MAX) gemerkt.delete(gemerkt.keys().next().value);
}

const standZeile = (pfad, st) => [path.basename(pfad), st ? st.mtimeMs : 0, st ? st.size : -1];

// Teile, deren Zeilen sich gegenüber dem gemerkten Stand geändert haben; ohne
// gemerkten Stand alle. Sie muss der Beobachter-Weg neu einlesen, weil ihre
// Dateien sich nicht bewegt haben. Ein nicht lesbarer Teil (auch eine Lücke)
// ist nicht nachzulesen.
function geaenderteGeschwister(alt, pfade, eigener, ergebnis, rumpfe) {
  const vergleichbar =
    alt &&
    alt.pfade.length === pfade.length &&
    alt.pfade.every((p, i) => pathCompareKey(p) === pathCompareKey(pfade[i]));
  return pfade.filter(
    (p, i) =>
      i !== eigener &&
      rumpfe[i] !== null &&
      (!vergleichbar || JSON.stringify(alt.ergebnis[i]) !== JSON.stringify(ergebnis[i])),
  );
}

function auswerten(filePath, content, plan, stand, lies) {
  const schluessel = pathCompareKey(plan.pfade[0]);
  const alt = gemerkt.get(schluessel);
  const eigenerRumpf = rumpfVon(content);
  const passt =
    alt &&
    alt.regel === regelStand() &&
    JSON.stringify(alt.stand) === JSON.stringify(stand) &&
    alt.rumpfe[plan.eigener] === eigenerRumpf;
  if (passt) {
    return { zeilen: alt.ergebnis[plan.eigener], stand, geschwister: [] };
  }
  return lies(plan.pfade, plan.eigener).then((inhalte) => {
    const rumpfe = inhalte.map((c, i) =>
      i === plan.eigener ? eigenerRumpf : c === null ? null : rumpfVon(c),
    );
    const ergebnis = bereinigeTeile(rumpfe, textOhnePrivateKommentare);
    const geschwister = geaenderteGeschwister(alt, plan.pfade, plan.eigener, ergebnis, rumpfe);
    merke(schluessel, { regel: regelStand(), stand, rumpfe, ergebnis, pfade: plan.pfade });
    return { zeilen: ergebnis[plan.eigener], stand, geschwister };
  });
}

// Zweitblick Runde 3, Befund 3: Nur Dateien zählen als Teile, wie beim
// Öffnen (`scanPartFiles` in document-parts-io.js); ein Ordner mit Teil-Namen
// ist keiner.
const dateiNamen = (eintraege) => eintraege.filter((e) => e.isFile()).map((e) => e.name);

// Ein «Versprechen» ohne Warten, damit der synchrone Weg denselben Ablauf
// durchläuft wie der asynchrone.
const sofort = (wert) => ({ then: (f) => f(wert) });

/**
 * Bereinigungs-Zusammenhang einer Datei, synchron (Beobachter-Weg).
 *
 * @param {string} filePath Pfad der gelesenen Datei.
 * @param {string} content Ihr Inhalt.
 * @returns {{zeilen: string[]|null, stand: Array, geschwister: string[]}|null}
 *   null, wenn die Datei kein Teil eines geteilten Dokuments ist oder die
 *   Regel aus ist. `zeilen` null heißt: Rumpf unverändert.
 */
function teilKontextSync(filePath, content) {
  if (!kommentareAusblenden() || !String(content).includes('doc-part')) return null;
  let namen;
  try {
    namen = dateiNamen(fs.readdirSync(path.dirname(filePath), { withFileTypes: true }));
  } catch {
    return null;
  }
  const plan = planeTeile(filePath, content, namen);
  if (!plan) return null;
  const stand = plan.pfade.map((p) => {
    try {
      return standZeile(p, fs.statSync(p));
    } catch {
      return standZeile(p, null);
    }
  });
  const lies = (pfade, eigener) =>
    sofort(
      pfade.map((p, i) => {
        if (i === eigener) return '';
        try {
          return fs.readFileSync(p, 'utf8');
        } catch {
          return null;
        }
      }),
    );
  // Mit dem sofortigen Lesen liefert `auswerten` das Ergebnis selbst zurück.
  return auswerten(filePath, content, plan, stand, lies);
}

/**
 * Bereinigungs-Zusammenhang einer Datei, asynchron (Aufbau des Index).
 * Rückgabe wie `teilKontextSync`.
 */
async function teilKontextAsync(filePath, content) {
  if (!kommentareAusblenden() || !String(content).includes('doc-part')) return null;
  let namen;
  try {
    namen = dateiNamen(await fs.promises.readdir(path.dirname(filePath), { withFileTypes: true }));
  } catch {
    return null;
  }
  const plan = planeTeile(filePath, content, namen);
  if (!plan) return null;
  const stand = await Promise.all(
    plan.pfade.map((p) =>
      fs.promises.stat(p).then(
        (st) => standZeile(p, st),
        () => standZeile(p, null),
      ),
    ),
  );
  const lies = (pfade, eigener) =>
    Promise.all(
      pfade.map((p, i) =>
        i === eigener
          ? ''
          : fs.promises.readFile(p, 'utf8').then(
              (c) => c,
              () => null,
            ),
      ),
    );
  return auswerten(filePath, content, plan, stand, lies);
}

/**
 * Stimmt der gemerkte Stand der Teile eines Dokuments mit dem Verzeichnis-
 * Durchlauf überein? Für den Warmstart: Ein Teil gilt nur dann als
 * unverändert, wenn es auch seine Geschwister sind.
 *
 * @param {Array|undefined} teilStand Gemerkter Stand aus dem Speicher.
 * @param {string} filePath Pfad des Teils.
 * @param {{mtimes: Map, sizes: Map}} scan Verzeichnis-Durchlauf.
 * @returns {boolean}
 */
function teilStandPasst(teilStand, filePath, scan) {
  if (!Array.isArray(teilStand)) return true;
  const dir = path.dirname(filePath);
  const gemerkteNamen = new Set();
  const einzeln = teilStand.every((z) => {
    if (!Array.isArray(z) || z.length !== 3) return false;
    const p = path.join(dir, String(z[0]));
    // Ein beim Merken fehlender Teil (Lücke, fehlender Kopf) passt nur,
    // solange er weiter fehlt.
    if (z[2] === -1) return !scan.mtimes.has(p);
    gemerkteNamen.add(pathCompareKey(String(z[0])));
    return scan.mtimes.get(p) === z[1] && scan.sizes.get(p) === z[2];
  });
  if (!einzeln) return false;
  // Sicherheits-Review Runde 3, Befund 1: Eine seither hinzugekommene
  // Teil-Datei desselben Dokuments ändert die Zusammensetzung, auch wenn sich
  // keine gemerkte Datei bewegt hat. Durchsucht wird nur für Teile geteilter
  // Dokumente, und nur sie tragen einen gemerkten Stand.
  const grund = pathCompareKey(baseBasenameOf(path.parse(filePath).name));
  for (const p of scan.mtimes.keys()) {
    if (path.dirname(p) !== dir) continue;
    const name = path.basename(p);
    if (!MD_EXTENSION_RE.test(name)) continue;
    const basename = name.replace(MD_EXTENSION_RE, '');
    if (pathCompareKey(baseBasenameOf(basename)) !== grund) continue;
    if (!gemerkteNamen.has(pathCompareKey(name))) return false;
  }
  return true;
}

/**
 * Die Geschwister einer gelöschten Datei; ihr Dokument wird vergessen. Sie
 * muss der Beobachter-Weg neu einlesen, weil ein Kommentar aus dem gelöschten
 * Teil in sie hineinreichen konnte. Gesucht wird im gemerkten Dokument und
 * nach dem Namen (Kopf-Datei und Folgeteile desselben Grundnamens), weil nach
 * einem Warmstart nichts gemerkt ist.
 *
 * @param {string} filePath Pfad der gelöschten Datei.
 * @returns {string[]}
 */
function geschwisterNachLoeschung(filePath) {
  if (!kommentareAusblenden()) return [];
  const gesucht = pathCompareKey(filePath);
  const ergebnis = new Map();
  for (const [schluessel, eintrag] of gemerkt) {
    if (!eintrag.pfade.some((p) => pathCompareKey(p) === gesucht)) continue;
    gemerkt.delete(schluessel);
    for (const p of eintrag.pfade) ergebnis.set(pathCompareKey(p), p);
  }
  const dir = path.dirname(filePath);
  let namen = [];
  try {
    namen = fs.readdirSync(dir);
  } catch {
    /* Ordner weg: nichts nachzulesen */
  }
  const basenames = namen
    .filter((n) => MD_EXTENSION_RE.test(n))
    .map((n) => [n.replace(MD_EXTENSION_RE, ''), n]);
  const grund = pathCompareKey(baseBasenameOf(path.parse(filePath).name));
  for (const [basename, name] of basenames) {
    if (pathCompareKey(baseBasenameOf(basename)) === grund) {
      const p = path.join(dir, name);
      ergebnis.set(pathCompareKey(p), p);
    }
  }
  ergebnis.delete(gesucht);
  return [...ergebnis.values()].filter((p) => fs.existsSync(p));
}

/** Vergisst alle gemerkten Dokumente (Prüffälle; einen Regelwechsel deckt `regelStand`). */
function vergissTeile() {
  gemerkt.clear();
}

module.exports = {
  planeTeile,
  bereinigeTeile,
  teilKontextSync,
  teilKontextAsync,
  teilStandPasst,
  geschwisterNachLoeschung,
  vergissTeile,
};
