// 4T-002386 (Epic 3E-000265, Schritt 4, Story AK4): Die Befunde der
// Konsistenz-Prüfung an einer Tabelle in Kartei-Form.
//
// **Warum ein eigenes Modul.** Die Kartei-Form wächst mit dem Epic um weitere
// Befunde (Karteikarten erkennen, Kennung, Felder, Zuordnung). Sie stehen hier
// und nicht in der Tabellen-Prüfung (`konsistenz-pruefung.js`), damit diese ihr
// Größen-Budget behält; die Codes stehen weiterhin im einen Katalog
// `KONSISTENZ_BEFUNDE` (`konsistenz-befunde.js`).
//
// **Der Befund aus 4T-002386:** Eine Kartei-Tabelle trägt in einer ihrer
// Dateien einen Datensatz-Block. Seine Zeilen gelten nicht als Datensätze; der
// Bestand führt sie deshalb gar nicht erst (`leseTabellenBestand`), und die
// übrigen Prüfungen der Tabelle laufen nicht über sie. Freier Text im Körper ist
// dagegen erlaubt und kein Befund.
//
// **Die Befunde aus 4T-002387 (F3 A):** die Karteikarten im Ordner der
// Kartei-Tabelle. Welche Dokumente dort liegen, sagt die Sicht des Index
// (`files` führt jedes Markdown-Dokument des Bereichs); ihren Dateikopf liest
// die Prüfung frisch, wie sie es bei Tabellen und Masken tut. Ob ein Dokument
// eine Karteikarte ist, entscheidet `karteikartenArt` im prozess-neutralen
// Modul `karteikarte.js`. Gemeldet werden ein Dokument ohne Kennung oder mit
// unbrauchbarer Kennung, eine Kennung, die zwei Karteikarten tragen, und zwei
// Kartei-Tabellen in einem Ordner; im letzten Fall gehören die Dokumente des Ordners keiner von beiden
// und werden nicht weiter geprüft. Seit Schnitt C (F5 A) kommt je Karteikarte
// der Hinweis auf ein Profil-Feld hinzu, das ein Feld der Tabelle mit einem
// anderen Typ führt; die Datenbank liest auch dann nach der Tabelle.
//
// Electron-frei und ohne Zustand; gelesen wird allein über `readFile` des
// hereingereichten Dateizugriffs. Die Prüfung schreibt nichts.
'use strict';

const path = require('node:path');

const { istKarteiForm } = require('../../shared/database/table-definition.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const {
  KARTEIKARTEN_ARTEN,
  imOrdnerDerTabelle,
  karteikartenArt,
  profilTypAbweichungen,
} = require('../../shared/database/karteikarte.js');
const { kopfDateien, bestandFuer } = require('./record-regel-hilfen.js');
const { createTemplateExclusion } = require('../index/query-templates.js');
const { KONSISTENZ_BEFUNDE, befund } = require('./konsistenz-befunde.js');

/**
 * Die Befunde der Kartei-Form an einer Tabelle.
 *
 * @param {object} ziel Ergebnis von `bestandFuer` mit `ok: true`.
 * @param {{tabelle: string, pfad: string}} kopfStelle Tabelle und Kopf-Datei.
 * @returns {Array<object>} Leer für eine Tabelle in Tabellen-Form; sonst je
 *   Datei mit Datensatz-Block ein Befund mit `datei` und `zeile`, der Zeile des
 *   öffnenden Zauns (ab 1) beziehungsweise der ersten Zeile eines Folge-Segments.
 */
function karteiBefunde(ziel, kopfStelle) {
  if (!istKarteiForm(ziel.definition)) return [];
  const befunde = [];
  for (const datei of ziel.bestand.dateien) {
    // 4T-002389: Die Karteikarten stehen seit dem Schreibweg im Bestand; der
    // Befund gilt den Dateien der Tabelle selbst.
    if (datei.karteikarte === true) continue;
    const rumpf = datensatzRumpf(datei.text);
    if (rumpf === null) continue;
    befunde.push(
      befund(KONSISTENZ_BEFUNDE.karteiMitDatensaetzen, {
        ...kopfStelle,
        datei: datei.pfad,
        zeile: datei.kopf ? rumpf.vonZeile : rumpf.vonZeile + 1,
      }),
    );
  }
  return befunde;
}

/**
 * Der Vorlagen-Ausschluss der Karteikarten, als Prädikat für `karteikartenArt`.
 * Derselbe Ausschluss wie in der Abfrage, ohne Quelle: Es gibt keine Angabe,
 * die einen Ordner ausdrücklich nennt, also fällt alles im Vorlagen-Ordner.
 *
 * @param {string} wurzel Wurzel des Bereichs.
 * @param {string|null} vorlagenOrdner Wirksamer Vorlagen-Ordner, oder null.
 * @returns {((pfad: string) => boolean)|null} null ohne Vorlagen-Ordner.
 */
function vorlagenPruefer(wurzel, vorlagenOrdner) {
  const ausschluss = createTemplateExclusion({
    root: wurzel,
    templatesFolder: vorlagenOrdner,
    source: null,
  });
  return ausschluss === null ? null : (pfad) => ausschluss.excludes(pfad);
}

// Die übrigen Kartei-Tabellen im Ordner der Tabelle, nach Pfad.
async function andereKarteiTabellen(lauf, sicht, kopf) {
  const andere = [];
  for (const pfad of kopfDateien(sicht)) {
    if (!imOrdnerDerTabelle(pfad, kopf)) continue;
    const ziel = await bestandFuer(lauf, pfad);
    if (ziel.ok && istKarteiForm(ziel.definition)) andere.push(ziel.name);
  }
  return andere;
}

// Text und Dateikopf eines Dokuments, oder null, wenn es sich nicht lesen
// lässt. Den Text braucht die Profil-Auflösung für die Schlagworte im Körper.
async function dokumentVon(fsp, pfad) {
  let roh;
  try {
    roh = String(await fsp.readFile(pfad, 'utf8'));
  } catch {
    return null;
  }
  const text = roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh;
  return { text, frontmatter: extractFrontmatter(text).data };
}

// 4T-002387 (Schnitt C, F5 A): Die Profil-Felder einer Karteikarte, die ein
// Feld der Tabelle mit einem anderen Typ führen, als Befunde. Ohne Zugang zu
// den Profilen (`profilFelder` null) entfällt die Prüfung still.
function profilTypBefunde(ziel, stelle, profilFelder, dokument) {
  if (typeof profilFelder !== 'function') return [];
  const felder = profilFelder(stelle.datei, dokument.frontmatter, dokument.text);
  return profilTypAbweichungen(ziel.definition, felder).map((abweichung) =>
    befund(KONSISTENZ_BEFUNDE.karteiProfilTypAbweichend, { ...stelle, ...abweichung }),
  );
}

/**
 * Die Befunde der Karteikarten einer Kartei-Tabelle.
 *
 * @param {object} ziel Ergebnis von `bestandFuer` mit `ok: true`.
 * @param {{tabelle: string, pfad: string}} kopfStelle Tabelle und Kopf-Datei.
 * @param {{lauf: object, sicht: object, istVorlage: Function|null,
 *   profilFelder?: Function|null}} umgebung Lauf der Prüfung (mit dem
 *   Dateizugriff), Sicht des Index, das Prädikat aus `vorlagenPruefer` und der
 *   Zugang zu den Profil-Feldern eines Dokuments (`profil-felder.js`; null ohne
 *   Profile, dann entfällt der Befund `karteiProfilTypAbweichend`).
 * @returns {Promise<Array<object>>} Leer für eine Tabelle in Tabellen-Form.
 */
async function karteikartenBefunde(ziel, kopfStelle, { lauf, sicht, istVorlage, profilFelder }) {
  if (!istKarteiForm(ziel.definition)) return [];
  const kopf = kopfStelle.pfad;
  const andere = await andereKarteiTabellen(lauf, sicht, kopf);
  if (andere.length > 0)
    return andere.map((name) =>
      befund(KONSISTENZ_BEFUNDE.karteiOrdnerMehrdeutig, {
        ...kopfStelle,
        datei: kopf,
        zieltabelle: name,
      }),
    );

  const befunde = [];
  const kartenJeKennung = new Map();
  const kandidaten = [...(sicht.files || new Map()).keys()].filter((p) =>
    imOrdnerDerTabelle(p, kopf),
  );
  for (const pfad of kandidaten.sort()) {
    const dokument = await dokumentVon(lauf.fsp, pfad);
    if (dokument === null || dokument.frontmatter === null) continue;
    const { frontmatter } = dokument;
    const art = karteikartenArt({ pfad, frontmatter, tabellenPfad: kopf, istVorlage });
    const name = path.basename(pfad, path.extname(pfad));
    if (art.art === KARTEIKARTEN_ARTEN.ohneKennung) {
      const code = art.hinweis ? 'karteiKennungUnbrauchbar' : 'karteiOhneKennung';
      befunde.push(befund(KONSISTENZ_BEFUNDE[code], { ...kopfStelle, datei: pfad, wert: name }));
    }
    if (art.art !== KARTEIKARTEN_ARTEN.karteikarte) continue;
    const stelle = { ...kopfStelle, datei: pfad, wert: name };
    befunde.push(...profilTypBefunde(ziel, stelle, profilFelder, dokument));
    if (!kartenJeKennung.has(art.kennung)) kartenJeKennung.set(art.kennung, []);
    kartenJeKennung.get(art.kennung).push({ pfad, name });
  }

  // Dieselbe Meldung wie die Kennungs-Dublette der Tabellen-Form, je Karteikarte
  // ein Befund, damit jede Fundstelle in der Liste steht. Ohne `pfad`, weil die
  // Maske eine Karteikarte noch nicht öffnet; die Zeile bleibt damit Text.
  for (const [kennung, karten] of kartenJeKennung) {
    if (karten.length < 2) continue;
    for (const karte of karten)
      befunde.push(
        befund(KONSISTENZ_BEFUNDE.kennungDoppelt, {
          ...kopfStelle,
          pfad: null,
          datei: karte.pfad,
          id: kennung,
          anzeige: karte.name,
          kennungen: [kennung],
        }),
      );
  }
  return befunde;
}

module.exports = { karteiBefunde, karteikartenBefunde, vorlagenPruefer };
