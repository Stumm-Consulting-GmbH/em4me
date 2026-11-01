// 4T-002389 (Epic 3E-000265, Schritte 1 und 3, F1 A, F4 A): Das zweite
// Schreib-Ziel der Schreib-Schnittstelle, die Datei einer Karteikarte.
//
// **Ein zweites Ziel, keine zweite Regel-Ebene.** Plan, Prüfung, Stand-Vergleich
// und Regeln laufen für eine Kartei-Tabelle unverändert über die Werte der
// Datensätze. Dieses Modul trägt allein, was an der Ablage hängt:
//
//   1. **Der Bestand** liefert für eine Kartei-Tabelle die Karteikarten ihres
//      Ordners als Datensätze (`leseKarteikarten`), je Karteikarte eine Datei
//      des Bestands mit genau einem Datensatz. Damit sehen Wertehilfe,
//      Verweis-Regel, Lösch-Schutz, Schlüssel-Regel und Stand-Vergleich die
//      Karteikarten ohne eigenen Anschluss.
//   2. **Die Ziel-Datei eines Anlegens** (`loeseKarteiZiele`): die neue Datei
//      `<Name>.md` im Ordner der Tabelle oder das aufzunehmende Dokument;
//      4T-002405: bei einer Kopie die neue Datei mit dem Text der Vorlage als
//      Grundlage (`datei.vorlage`).
//   3. **Die Werte vor den Sperren** (`ergaenzeKarteiWerte`): der Name der
//      neuen Karteikarte im Feld des einteiligen Schlüssels, die Werte eines
//      aufzunehmenden Dokuments aus seinem Dateikopf.
//
// Den neuen Text bildet `schreibeKarteikarte` im prozess-neutralen Modul
// `karteikarte-schreiben.js`; der Plan ruft es für jede Datei des Bestands, die
// eine Karteikarte ist.
//
// **Welche Dateien in Frage kommen, sagt der Ordner und nicht der Index.**
// Abweichung vom Entwurf der Steuer-Sitzung (Index-Sicht wie in der
// Konsistenz-Prüfung), technisch begründet: Der Bestand wird unter der Sperre
// frisch gelesen (B3, Kopf von `record-auftrag-bestand.js`), und der Index zieht
// über den Beobachter nach; eine eben angelegte Karteikarte fehlte ihm noch.
// Gelesen wird der Ordner der Tabelle ohne Unterordner, über denselben
// Verzeichnis-Zugriff, mit dem der Bestand die Segmente einer geteilten Tabelle
// findet (`scanOwnParts`); ob ein Dokument eine Karteikarte ist, entscheidet
// `karteikartenArt` am frisch gelesenen Dateikopf, ohne Vorlagen-Ausschluss wie
// der Lese-Weg der Abfrage (`record-kartei-read.js`). Liegt eine zweite
// Kartei-Tabelle im Ordner, gehören die Dokumente keiner von beiden, wie in der
// Konsistenz-Prüfung (Befund `karteiOrdnerMehrdeutig`).
'use strict';

const fs = require('node:fs/promises');
const { pathCompareKey } = require('../../shared/platform.js');
const path = require('node:path');

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const {
  parseTableDefinition,
  istKarteiForm,
} = require('../../shared/database/table-definition.js');
const {
  KARTEIKARTEN_ARTEN,
  karteikartenArt,
  karteikartenWerte,
} = require('../../shared/database/karteikarte.js');
const { isInsideArea, sanitizeNewFileName } = require('../area/area-path.js');
const { MD_EXTENSION_RE } = require('../documents/document-parts-io.js');
const { LAGEN, ART_ANLEGEN, befund } = require('./record-auftrag-pruefung.js');
// 4T-002389 (Schritt 4): die Übertragung der Belege vor dem Löschen (4T-002390).
const { baueBelegUebertragung } = require('./change-log.js');

function alsText(fehler) {
  return fehler && fehler.message ? fehler.message : String(fehler);
}

// Text und Dateikopf eines Dokuments; null, wenn es fehlt oder unlesbar ist.
async function dokumentVon(fsp, pfad) {
  let roh;
  try {
    roh = String(await fsp.readFile(pfad, 'utf8'));
  } catch {
    return null;
  }
  return { text: roh, frontmatter: extractFrontmatter(roh).data };
}

// Ein Datensatz in der Gestalt, die der Bestand für die Tabellen-Form führt:
// Kennung und Zellen in der Reihenfolge der Felder. `zeile` ist null, weil die
// Werte im Dateikopf stehen und nicht in einem Datensatz-Block.
function datensatzAus(kennung, frontmatter, definition) {
  return { id: kennung, cells: karteikartenWerte(frontmatter, definition), zeile: null };
}

/**
 * Die Karteikarten einer Kartei-Tabelle als Dateien des Bestands.
 *
 * @param {object} fsp Dateizugriff (`readFile`).
 * @param {string} kopfPfad Pfad der Tabellen-Datei.
 * @param {object} definition Die Definition der Tabelle.
 * @returns {Promise<{ok: true, dateien: Array<object>}|{ok: false, grund: string}>}
 *   Je Karteikarte `{pfad, text, kopf: false, karteikarte: true, records, doppelt}`,
 *   nach Pfad geordnet. Leer, wenn eine zweite Kartei-Tabelle im Ordner liegt.
 */
async function leseKarteikarten(fsp, kopfPfad, definition) {
  const ordner = path.dirname(kopfPfad);
  let eintraege;
  try {
    eintraege = await fs.readdir(ordner, { withFileTypes: true });
  } catch (err) {
    return { ok: false, grund: alsText(err) };
  }
  const namen = eintraege
    .filter((e) => e.isFile() && MD_EXTENSION_RE.test(e.name))
    .map((e) => e.name)
    .sort();
  const dateien = [];
  for (const name of namen) {
    const pfad = path.join(ordner, name);
    if (pfad === kopfPfad) continue;
    const dokument = await dokumentVon(fsp, pfad);
    if (dokument === null || dokument.frontmatter === null) continue;
    const { frontmatter } = dokument;
    // Eine zweite Kartei-Tabelle im Ordner: Die Zugehörigkeit ist nicht
    // eindeutig, und keine der beiden führt die Dokumente als Karteikarten.
    if (istKarteiForm(parseTableDefinition(frontmatter))) return { ok: true, dateien: [] };
    const art = karteikartenArt({ pfad, frontmatter, tabellenPfad: kopfPfad, istVorlage: null });
    if (art.art !== KARTEIKARTEN_ARTEN.karteikarte) continue;
    dateien.push({
      pfad,
      text: dokument.text,
      kopf: false,
      karteikarte: true,
      records: new Map([[art.kennung, datensatzAus(art.kennung, frontmatter, definition)]]),
      doppelt: new Set(),
    });
  }
  return { ok: true, dateien };
}

// Der einteilige Schlüssel einer Definition als Feld-Name, sonst null.
function schluesselFeld(definition) {
  const key = definition && Array.isArray(definition.key) ? definition.key : null;
  return key && key.length === 1 ? key[0] : null;
}

// Der absolute Pfad eines aufzunehmenden Dokuments, oder null außerhalb des Bereichs.
function aufnahmePfad(bereichsWurzel, angabe) {
  const absolut = path.resolve(bereichsWurzel, angabe);
  if (!isInsideArea(bereichsWurzel, absolut) || !MD_EXTENSION_RE.test(absolut)) return null;
  return absolut;
}

// Ein Wert der Anweisung für ein Feld, ohne Rücksicht auf die Schreibung.
function hatWert(werte, feldName) {
  const klein = feldName.toLowerCase();
  return Object.keys(werte).some((name) => name.toLowerCase() === klein);
}

/**
 * Ergänzt vor den Sperren die Werte eines Anlegens in einer Kartei-Tabelle,
 * damit Typ- und Pflicht-Prüfung den Datensatz sehen, der entstehen wird.
 *
 * - `{ name }`: der Name im Feld des einteiligen Schlüssels, sofern die
 *   Anweisung das Feld nicht selbst nennt.
 * - `{ aufnehmen }`: die Werte, die der Dateikopf des Dokuments für die Felder
 *   der Tabelle trägt; Werte der Anweisung gehen vor.
 * - `{ name, vorlage }` (4T-002405): der Name im Schlüssel wie bei `{ name }`,
 *   die übrigen Felder aus dem Dateikopf der Vorlage; Werte der Anweisung gehen vor.
 *
 * @param {Array<object>} anweisungen Normalisierte Anweisungen; werden ergänzt.
 * @param {Map<string, object>} definitionen Ergebnis von `leseDefinition` je Tabelle.
 * @param {string} bereichsWurzel Wurzel des Bereichs.
 * @param {object} fsp Dateizugriff.
 * @returns {Promise<Array<object>>} Die Lagen; leer heißt «keine Beanstandung».
 */
async function ergaenzeKarteiWerte(anweisungen, definitionen, bereichsWurzel, fsp) {
  const lagen = [];
  for (const anweisung of anweisungen) {
    const gelesen = definitionen.get(anweisung.tabelle);
    if (!gelesen || !istKarteiForm(gelesen.definition)) continue;
    const stelle = { position: anweisung.position, tabelle: anweisung.tabelle };
    if (anweisung.art !== ART_ANLEGEN) continue;
    const angabe = anweisung.karteikarte;
    if (angabe === null) {
      lagen.push(befund(LAGEN.karteiNameFehlt, stelle));
      continue;
    }
    if (angabe.name !== undefined) {
      const feld = schluesselFeld(gelesen.definition);
      if (feld !== null && !hatWert(anweisung.werte, feld)) anweisung.werte[feld] = angabe.name;
      if (angabe.vorlage === undefined) continue;
      // 4T-002405 (F5 A): Die übrigen Felder kommen aus der Vorlage; der
      // Schlüssel steht oben bereits auf dem Namen und wird nicht überschrieben.
      const vorlage = await karteikarteDerVorlage(angabe.vorlage, anweisung.tabelle, {
        bereichsWurzel,
        fsp,
        tabellenPfad: gelesen.pfad,
      });
      if (vorlage.lage) {
        lagen.push({ ...vorlage.lage, position: anweisung.position });
        continue;
      }
      for (const wert of karteikartenWerte(vorlage.frontmatter, gelesen.definition)) {
        if (!wert.fehlt && !hatWert(anweisung.werte, wert.name))
          anweisung.werte[wert.name] = wert.text;
      }
      continue;
    }
    const pfad = aufnahmePfad(bereichsWurzel, angabe.aufnehmen);
    const dokument = pfad === null ? null : await dokumentVon(fsp, pfad);
    if (dokument === null) {
      lagen.push(befund(LAGEN.karteiAufnahmeUnmoeglich, { ...stelle, datei: angabe.aufnehmen }));
      continue;
    }
    for (const wert of karteikartenWerte(dokument.frontmatter, gelesen.definition)) {
      if (!wert.fehlt && !hatWert(anweisung.werte, wert.name))
        anweisung.werte[wert.name] = wert.text;
    }
  }
  return lagen;
}

// 4T-002405 (Epic 3E-000266, F5 A): Die Vorlage einer Kopie, frisch gelesen.
// Sie muss eine Karteikarte genau dieser Tabelle sein (Ordner, keine
// Datenbank-Datei, brauchbare Kennung), ohne Vorlagen-Ausschluss wie der
// Bestand (`leseKarteikarten`). Liefert `{text, frontmatter}` oder `{lage}`.
async function karteikarteDerVorlage(angabe, tabelle, { bereichsWurzel, fsp, tabellenPfad }) {
  const stelle = { tabelle, datei: angabe };
  const pfad = aufnahmePfad(bereichsWurzel, angabe);
  const dokument = pfad === null ? null : await dokumentVon(fsp, pfad);
  if (dokument === null)
    return { lage: befund(LAGEN.karteiVorlageUnbrauchbar, { ...stelle, grund: 'unlesbar' }) };
  const art = karteikartenArt({
    pfad,
    frontmatter: dokument.frontmatter,
    tabellenPfad,
    istVorlage: null,
  });
  if (art.art !== KARTEIKARTEN_ARTEN.karteikarte)
    return { lage: befund(LAGEN.karteiVorlageUnbrauchbar, { ...stelle, grund: art.art }) };
  return dokument;
}

// Die Datei einer neuen Karteikarte: Name als Dateiname geprüft, Datei noch
// nicht vorhanden.
async function neueDatei(schritt, bereichsWurzel, fsp) {
  const { anweisung, bestand } = schritt;
  const stelle = { position: anweisung.position, tabelle: anweisung.tabelle };
  const name = anweisung.karteikarte.name;
  const dateiname = sanitizeNewFileName(name);
  // Der Name ist zugleich der Wert des Schlüssels; er wird nicht still
  // beschnitten und trägt keine Endung, damit Datei und Wert dasselbe nennen.
  if (dateiname === null || dateiname !== `${name}.md`)
    return { lage: befund(LAGEN.karteiNameUngueltig, { ...stelle, name }) };
  const pfad = path.join(path.dirname(bestand.pfad), dateiname);
  try {
    await fs.lstat(pfad);
    return { lage: befund(LAGEN.karteiDateiVorhanden, { ...stelle, name, datei: pfad }) };
  } catch (err) {
    if (!err || err.code !== 'ENOENT')
      return { lage: befund(LAGEN.lesenFehlgeschlagen, { ...stelle, grund: alsText(err) }) };
  }
  // 4T-002405 (F5 A): Eine Kopie bekommt den Text der Vorlage, unter der Sperre
  // frisch gelesen, als Grundlage; die Datei bleibt eine neue (`text: null`),
  // damit Klammer und Wiederanlauf sie wie jede neue Karteikarte anlegen.
  const angabe = anweisung.karteikarte;
  if (angabe.vorlage === undefined) return { datei: { pfad, text: null } };
  const vorlage = await karteikarteDerVorlage(angabe.vorlage, anweisung.tabelle, {
    bereichsWurzel,
    fsp,
    tabellenPfad: bestand.pfad,
  });
  if (vorlage.lage) return { lage: { ...vorlage.lage, position: anweisung.position } };
  return { datei: { pfad, text: null, vorlage: vorlage.text } };
}

// Das aufzunehmende Dokument, unter der Sperre frisch gelesen: im Ordner der
// Tabelle, keine Datenbank-Datei, ohne Kennung, und mit denselben Werten, die
// vor den Sperren in die Anweisung gingen.
async function aufzunehmendeDatei(schritt, bereichsWurzel, fsp) {
  const { anweisung, bestand } = schritt;
  const angabe = anweisung.karteikarte.aufnehmen;
  const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, datei: angabe };
  const pfad = aufnahmePfad(bereichsWurzel, angabe);
  const dokument = pfad === null ? null : await dokumentVon(fsp, pfad);
  if (dokument === null)
    return { lage: befund(LAGEN.karteiAufnahmeUnmoeglich, { ...stelle, grund: 'unlesbar' }) };
  const art = karteikartenArt({
    pfad,
    frontmatter: dokument.frontmatter,
    tabellenPfad: bestand.pfad,
    istVorlage: null,
  });
  if (art.art !== KARTEIKARTEN_ARTEN.ohneKennung)
    return { lage: befund(LAGEN.karteiAufnahmeUnmoeglich, { ...stelle, grund: art.art }) };
  // Hat jemand den Dateikopf zwischen dem Lesen vor den Sperren und jetzt
  // geändert, wäre der Beleg ein anderer Stand als der der Datei.
  const felder = [];
  for (const wert of karteikartenWerte(dokument.frontmatter, bestand.definition)) {
    if (wert.fehlt) continue;
    const name = Object.keys(anweisung.werte).find(
      (n) => n.toLowerCase() === wert.name.toLowerCase(),
    );
    if (name !== undefined && anweisung.werte[name] !== wert.text)
      felder.push({ name: wert.name, erwartet: anweisung.werte[name], vorgefunden: wert.text });
  }
  if (felder.length > 0)
    return {
      lage: befund(LAGEN.standWeichtAb, { ...stelle, id: schritt.id, geloescht: false, felder }),
    };
  return { datei: { pfad, text: dokument.text } };
}

/**
 * Löst unter den Sperren die Ziel-Dateien der Schritte in Kartei-Tabellen auf.
 *
 * Ein Anlegen bekommt die Datei der neuen oder der aufzunehmenden Karteikarte
 * als `schritt.pfad` und `schritt.datei`. Abgewiesen wird (Lage
 * `karteiTabelle`) das erzwungene Ändern oder Löschen einer von Hand gelöschten
 * Karteikarte, das keine Datei mehr hat; das Löschen einer vorhandenen
 * Karteikarte bindet `bindeKarteiLoeschungen` an den Plan.
 *
 * @param {Array<object>} schritte Ergebnis von `loeseSchritte`; werden ergänzt.
 * @param {string} bereichsWurzel Wurzel des Bereichs.
 * @param {object} fsp Dateizugriff.
 * @returns {Promise<Array<object>>} Die Lagen; leer heißt «keine Beanstandung».
 */
async function loeseKarteiZiele(schritte, bereichsWurzel, fsp) {
  const lagen = [];
  const neuePfade = new Set();
  for (const schritt of schritte) {
    const { anweisung, bestand } = schritt;
    if (!istKarteiForm(bestand.definition)) continue;
    const stelle = { position: anweisung.position, tabelle: anweisung.tabelle, id: schritt.id };
    // 4T-002389 (Schritt 4): Das Löschen läuft seither über den Plan; abgewiesen
    // bleibt allein der Schritt ohne Datei, das erzwungene Ändern oder Löschen
    // einer von Hand gelöschten Karteikarte.
    if (schritt.fehlt) {
      lagen.push(befund(LAGEN.karteiTabelle, stelle));
      continue;
    }
    if (anweisung.art !== ART_ANLEGEN) continue;
    const gefunden =
      anweisung.karteikarte.name !== undefined
        ? await neueDatei(schritt, bereichsWurzel, fsp)
        : await aufzunehmendeDatei(schritt, bereichsWurzel, fsp);
    if (gefunden.lage) {
      lagen.push(gefunden.lage);
      continue;
    }
    // Zwei Anweisungen desselben Auftrags an dieselbe Datei.
    // Plattformfester Vergleichs-Schlüssel (Erosions-Wächter E2): Kleinschreibung
    // allein wäre auf Linux falsch.
    const schluessel = pathCompareKey(gefunden.datei.pfad);
    if (neuePfade.has(schluessel)) {
      lagen.push(befund(LAGEN.karteiDateiVorhanden, { ...stelle, datei: gefunden.datei.pfad }));
      continue;
    }
    neuePfade.add(schluessel);
    schritt.pfad = gefunden.datei.pfad;
    schritt.datei = {
      ...gefunden.datei,
      kopf: false,
      karteikarte: true,
      records: new Map(),
      doppelt: new Set(),
    };
  }
  return lagen;
}

/**
 * Bindet das Löschen von Karteikarten an den Schreib-Plan (Schritt 4, F6 B).
 *
 * Je zu löschender Karteikarte werden ihre Belege des Plans (der Lösch-Beleg,
 * nach einem Erzwingen davor der Beleg der Fremd-Änderung) durch **einen**
 * Beleg-Eintrag an der Beleg-Datei der Tabellen-Datei ersetzt: die Kette der
 * Karteikarte aus ihrer Beleg-Datei, gefolgt von diesen Belegen, gebildet von
 * `baueBelegUebertragung` und in einem einzigen Anfüge-Aufruf geschrieben
 * (E10.7). Vorgangs- und Datensatz-Kennung des Eintrags sind die des
 * Lösch-Belegs; daran erkennt der Wiederanlauf, ob er schon angefügt ist.
 * Karteikarte und Beleg-Datei kommen in `plan.entsorgen`, die Karteikarte mit
 * ihrem gelesenen Stand, den die Klammer vor der Marke prüft.
 *
 * @param {{belege: Array<object>, entsorgen?: Array<object>}} plan Wird ergänzt.
 * @param {object} fsp Dateizugriff.
 * @returns {Promise<Array<object>>} Die Lagen; leer heißt «keine Beanstandung».
 */
async function bindeKarteiLoeschungen(plan, fsp) {
  const jeKarte = new Map();
  for (const eintrag of plan.belege) {
    if (eintrag.loeschtKarteikarte !== true) continue;
    if (!jeKarte.has(eintrag.bezugsPfad)) jeKarte.set(eintrag.bezugsPfad, []);
    jeKarte.get(eintrag.bezugsPfad).push(eintrag);
  }
  if (jeKarte.size === 0) return [];
  const ersetzt = new Map();
  const entsorgen = Array.isArray(plan.entsorgen) ? [...plan.entsorgen] : [];
  for (const [karte, eintraege] of jeKarte) {
    // Der Lösch-Beleg steht im Plan zuletzt; davor höchstens der Fremd-Beleg.
    const loesch = eintraege[eintraege.length - 1];
    const gebaut = await baueBelegUebertragung(
      { karteikartePfad: karte, tabellenPfad: loesch.tabellenPfad, loeschBeleg: loesch.text },
      { fsp },
    );
    if (!gebaut.ok)
      return [
        befund(LAGEN.belegFehlgeschlagen, {
          tabelle: loesch.tabelle,
          id: loesch.angaben.id,
          grund: gebaut.code,
        }),
      ];
    const lText = loesch.text.startsWith('\n') ? loesch.text : `\n${loesch.text}`;
    const davor = eintraege.slice(0, -1).map((e) => e.text);
    const text = `${gebaut.text.slice(0, gebaut.text.length - lText.length)}${davor.join('')}${lText}`;
    ersetzt.set(loesch, {
      tabellenPfad: loesch.tabellenPfad,
      bezugsPfad: loesch.tabellenPfad,
      tabelle: loesch.tabelle,
      angaben: loesch.angaben,
      text,
    });
    for (const pfad of gebaut.zuEntsorgen)
      entsorgen.push({ pfad, gelesen: pfad === karte ? loesch.karteikarteGelesen : null });
  }
  plan.belege = plan.belege.flatMap((e) =>
    e.loeschtKarteikarte !== true ? [e] : ersetzt.has(e) ? [ersetzt.get(e)] : [],
  );
  plan.entsorgen = entsorgen;
  return [];
}

module.exports = {
  leseKarteikarten,
  ergaenzeKarteiWerte,
  loeseKarteiZiele,
  bindeKarteiLoeschungen,
};
