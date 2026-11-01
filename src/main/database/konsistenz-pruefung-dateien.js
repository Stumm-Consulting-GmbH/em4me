// 4T-002386 (Epic 3E-000265, S5): Die Konsistenz-Prüfung der Masken-, Listen-
// und Abfrage-Dateien, aus `konsistenz-pruefung.js` herausgelöst.
//
// **Was hier geprüft wird.** Je Masken-Datei die Tabelle, die Hinweise der
// Zerlegung ihres Körpers und ihre Positions-Bereiche; je Tabelle die Angabe
// `form` der Definition gegen die Masken-Dateien; je Abfrage-Datei die Angaben
// der Listen-Maske. Den Ablauf, die Zählung je Tabelle und die Reihenfolge der
// Befunde bestimmt weiterhin der Einstieg `pruefeKonsistenz` in
// `konsistenz-pruefung.js`, der die Funktionen dieses Moduls ruft.
//
// **Ohne Rückbezug.** Katalog und Befund-Bau kommen aus `konsistenz-befunde.js`;
// aus `konsistenz-pruefung.js` importiert dieses Modul nichts, damit zwischen
// beiden Prüf-Modulen kein Zyklus entsteht. Zustand hält es keinen: Lauf,
// Sicht, Dateizugriff und Katalog-Cache kommen als Argumente herein.
//
// Electron-frei; die Prüfung schreibt nichts.
'use strict';

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseFormDefinition } = require('../../shared/database/table-definition.js');
const { zerlegeMaskenKoerper, FORM_HINWEISE } = require('../../shared/database/form-body.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { findeKopfDatei, bestandFuer } = require('./record-regel-hilfen.js');
// Als Ganzes geholt wie in `konsistenz-pruefung.js`.
const katalog = require('./table-catalog.js');
// 4T-002248 (Epic 3E-000262, F1 A): die Angaben der Listen-Maske einer Abfrage-Datei.
const { parseListAngaben } = require('../../shared/database/list-angaben.js');
// 4T-002253 (Epic 3E-000262, S6): der Positions-Bereich einer Masken-Datei.
const { POSITIONS_HINWEISE, pruefePositionsBereich } = require('./positions-auskunft.js');
const { KONSISTENZ_BEFUNDE, befund } = require('./konsistenz-befunde.js');

// --- Masken-Dateien ------------------------------------------------------------------------

// Die Dateien der Sicht mit einer Marke, nach Pfad; seit 4T-002248 für die
// Masken-Dateien (`form`) und die Abfrage-Dateien (`query`).
function dateienMit(sicht, marke) {
  const pfade = [];
  for (const [absPath, marken] of sicht.dbKindsPerFile || new Map()) {
    if (Array.isArray(marken) && marken.includes(marke)) pfade.push(absPath);
  }
  return pfade.sort();
}

// Eine Masken-Datei gegen ihre Tabelle: die unbekannte Tabelle und die Hinweise
// der Zerlegung, die Zeile ab dem Anfang der Datei (Muster der
// Datensatz-Auskunft). Eine Datei ohne brauchbaren Behälter meldet bereits die
// Übersicht; eine nicht lesbare wird übergangen. Seit 4T-002184 kommt jede
// Datei, die eine Maske ist, als `zuordnung` zurück, auch wenn ihre Befunde nicht
// gefragt sind, weil die Prüfung der Angabe `form` alle Masken-Dateien braucht.
async function pruefeMaske({ lauf, sicht, fsp, pfad, nurKopf, wurzel, cache }) {
  let roh;
  try {
    roh = String(await fsp.readFile(pfad, 'utf8'));
  } catch {
    return { kopf: null, befunde: [] };
  }
  const fm = extractFrontmatter(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh);
  const form = parseFormDefinition(fm.data);
  if (!form.istMaske) return { kopf: null, befunde: [] };
  const kopf = findeKopfDatei(sicht, form.table);
  const zuordnung = { path: pfad, table: form.table, kopf };
  if (kopf === null) {
    if (nurKopf !== null) return { kopf: null, zuordnung, befunde: [] };
    return {
      kopf: null,
      zuordnung,
      befunde: [
        befund(KONSISTENZ_BEFUNDE.maskeTabelleUnbekannt, {
          tabelle: form.table,
          datei: pfad,
          wert: form.table,
        }),
      ],
    };
  }
  if (nurKopf !== null && pathCompareKey(kopf) !== pathCompareKey(nurKopf))
    return { kopf: null, zuordnung, befunde: [] };
  const ziel = await bestandFuer(lauf, kopf);
  if (!ziel.ok) return { kopf, zuordnung, befunde: [] };
  const versatz = fm.raw === null ? 0 : fm.raw.split('\n').length - 1;
  const stelle = { tabelle: katalog.tabellenName(kopf), pfad: kopf, datei: pfad };
  const zerlegt = zerlegeMaskenKoerper(fm.body, ziel.bestand.fields);
  const befunde = zerlegt.hints.map((hint) => {
    const zeile = hint.zeile + versatz;
    if (hint.code === FORM_HINWEISE.feldUnbekannt)
      return befund(KONSISTENZ_BEFUNDE.maskeFeldUnbekannt, { ...stelle, zeile, feld: hint.name });
    if (hint.code === FORM_HINWEISE.ausdruckUngueltig)
      return befund(KONSISTENZ_BEFUNDE.maskeAusdruckUngueltig, {
        ...stelle,
        zeile,
        wert: hint.name,
      });
    // 4T-002186: die Fehlerbilder der bedingten Bereiche, je ein eigener Befund.
    const bereich = BEREICHS_BEFUNDE[hint.code];
    if (bereich) return befund(bereich, { ...stelle, zeile, wert: hint.name });
    return befund(KONSISTENZ_BEFUNDE.maskePlatzhalterUnbekannt, {
      ...stelle,
      zeile,
      wert: hint.name,
    });
  });
  // 4T-002253: je Positions-Bereich dieselbe Auflösung wie in der Maske.
  for (const segment of listenSegmente(zerlegt.segmente)) {
    const p = { fsp, wurzel, sicht, cache, datei: segment.datei, by: segment.by, kopfPfad: kopf };
    const code = LISTEN_BEFUNDE[await pruefePositionsBereich(p)];
    if (code)
      befunde.push(
        befund(code, { ...stelle, zeile: segment.zeile + versatz, wert: segment.datei }),
      );
  }
  return { kopf, zuordnung, befunde };
}

// 4T-002253: Die Segmente `liste` eines Körpers, auch in Bereichen.
function listenSegmente(segmente) {
  const gefunden = [];
  for (const segment of Array.isArray(segmente) ? segmente : []) {
    if (segment && segment.art === 'liste') gefunden.push(segment);
    if (segment && Array.isArray(segment.kinder)) gefunden.push(...listenSegmente(segment.kinder));
  }
  return gefunden;
}

// 4T-002253: Hinweis-Code der Positions-Auskunft auf den Befund-Code.
const LISTEN_BEFUNDE = Object.freeze({
  [POSITIONS_HINWEISE.dateiUnbekannt]: KONSISTENZ_BEFUNDE.maskeListeDateiUnbekannt,
  [POSITIONS_HINWEISE.nichtBearbeitbar]: KONSISTENZ_BEFUNDE.maskeListeNichtBearbeitbar,
  [POSITIONS_HINWEISE.beziehungFehlt]: KONSISTENZ_BEFUNDE.maskeListeBeziehungFehlt,
  [POSITIONS_HINWEISE.beziehungMehrdeutig]: KONSISTENZ_BEFUNDE.maskeListeBeziehungMehrdeutig,
  [POSITIONS_HINWEISE.abfrageUngueltig]: KONSISTENZ_BEFUNDE.maskeListeAbfrageUngueltig,
});

// 4T-002186 (Epic 3E-000261, E7.8, S5): Hinweis-Code des Körpers auf den
// Befund-Code der bedingten Bereiche; der Text der Bedingung reist in `wert`.
const BEREICHS_BEFUNDE = Object.freeze({
  [FORM_HINWEISE.endOhneWhen]: KONSISTENZ_BEFUNDE.maskeEndOhneWhen,
  [FORM_HINWEISE.whenOhneEnd]: KONSISTENZ_BEFUNDE.maskeWhenOhneEnd,
  [FORM_HINWEISE.bedingungUngueltig]: KONSISTENZ_BEFUNDE.maskeBedingungUngueltig,
  // 4T-002252: der Pfad reist ebenso in `wert`.
  [FORM_HINWEISE.pfadUnbekannt]: KONSISTENZ_BEFUNDE.maskePfadUnbekannt,
});

// 4T-002184 (Epic 3E-000261, F2 A): Die Angabe `form` einer Definition gegen die
// Masken-Dateien, nach derselben Regel wie der Katalog (`waehleStandardMaske`),
// damit Übersicht und Prüfung auf dieselbe Frage dieselbe Antwort geben. Der
// Befund hängt an der Tabelle, weil die Angabe in ihrer Definition steht.
function standardMaskenBefund(kopf, angabe, zuordnungen) {
  const eigene = zuordnungen
    .filter((z) => z.kopf !== null && pathCompareKey(z.kopf) === pathCompareKey(kopf))
    .map((z) => z.path);
  const { hinweis } = katalog.waehleStandardMaske({ eigene, zugeordnet: zuordnungen, angabe });
  if (hinweis === null) return null;
  const stelle = { tabelle: katalog.tabellenName(kopf), pfad: kopf, datei: kopf, wert: angabe };
  if (hinweis.code === 'formDateiFremd')
    return befund(KONSISTENZ_BEFUNDE.maskeAngabeFremd, {
      ...stelle,
      zieltabelle: hinweis.expected,
    });
  return befund(KONSISTENZ_BEFUNDE.maskeAngabeUnbekannt, stelle);
}

// --- Abfrage-Dateien (4T-002248) ------------------------------------------------------------

// Eine Abfrage-Datei gegen die Angaben der Listen-Maske, nach derselben
// Auslegung wie der Katalog (`parseListAngaben`) und derselben Vergleichs-Regel
// für `form` (`trifftMaskenAngabe` gegen alle Masken-Dateien des Laufs), damit
// Übersicht und Prüfung auf dieselbe Frage dieselbe Antwort geben. Der Befund
// hängt an der Datei und an keiner Tabelle: Die Tabelle folgt erst aus `FROM`,
// und eine Abfrage-Datei ist kein Teil einer Tabelle. Eine nicht lesbare Datei
// wird übergangen wie eine nicht lesbare Masken-Datei.
async function pruefeAbfrage({ fsp, pfad, zuordnungen }) {
  let roh;
  try {
    roh = String(await fsp.readFile(pfad, 'utf8'));
  } catch {
    return [];
  }
  const fm = extractFrontmatter(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh);
  const angaben = parseListAngaben(fm.data);
  const stelle = { datei: pfad };
  const befunde = angaben.hints.map((hint) =>
    hint.code === 'listAllowUnbekannt'
      ? befund(KONSISTENZ_BEFUNDE.listeHandgriffUnbekannt, { ...stelle, wert: hint.name || '' })
      : befund(KONSISTENZ_BEFUNDE.listeAngabeUnbrauchbar, { ...stelle, wert: hint.key }),
  );
  if (
    angaben.form !== null &&
    !zuordnungen.some((z) => katalog.trifftMaskenAngabe(z.path, angaben.form))
  )
    befunde.push(befund(KONSISTENZ_BEFUNDE.listeMaskeUnbekannt, { ...stelle, wert: angaben.form }));
  return befunde;
}

module.exports = { dateienMit, pruefeMaske, standardMaskenBefund, pruefeAbfrage };
