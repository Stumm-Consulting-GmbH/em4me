// 4T-001944 (Epic 3E-000257, Bauplan B1 und B2; T13, E22.2, E22.5, E22.8): Die
// Konsistenz-Prüfung über den Bestand — ein Finder, der die Befunde einer oder
// aller Tabellen des Bereichs sammelt und nichts verändert.
//
// **Warum es sie gibt.** Das Regel-Werk der Schreib-Schnittstelle prüft beim
// Schreiben, und beim Lesen wird nur markiert, was am Parsen ohnehin anfällt
// (E22.2). Was den Bestand braucht, bleibt damit ungesehen, sobald es nicht über
// einen Datenbank-Schreibweg entsteht: die Alt-Dublette eines Schlüssels (die
// Schlüssel-Regel prüft nur einen neuen oder geänderten, E22.5), ein Verweis,
// dessen Ziel später von Hand gelöscht wurde, eine Datensatz-Regel, die beim
// Lesen nicht wirkt, und eine zu kurze Datensatz-Zeile. Diese Prüfung wendet die
// prozess-neutralen Auswerter über den ganzen Bestand an.
//
// **Ein Weg, nicht zwei.** Gelesen wird über den Lauf der Regel-Hilfen
// (`record-regel-hilfen.js`), ohne Schritte und ohne Bestände eines Auftrags:
// `bestandFuer` liest jede Tabelle einmal frisch mit allen Segmenten, auch
// wenn sie zugleich Ziel eines Verweises ist. Ausgewertet wird mit denselben
// Funktionen wie im Regel-Werk (`schluesselKey`, `legeVerweisZelleAus`,
// `baueRegelKontext`, `pruefeFeldRegeln`, `pruefeDatensatzRegeln`) und mit den
// Zell-Befunden des Datensatz-Blocks (`zellWert` beim Parsen). Beide Seiten
// geben damit auf dieselbe Frage dieselbe Antwort.
//
// **Die Menge aus dem Index, die Wahrheit aus der Datei.** Welche Tabellen und
// Masken-Dateien es gibt, sagt die Sicht (Marken `table` und `form`); ihren
// Inhalt liest die Prüfung frisch. Eine Tabelle, deren Definition sich nicht
// lesen lässt, ist ein Befund ihrer Tabelle, und der Lauf geht weiter.
//
// **Die Prüfung schreibt nichts** (AK3). Sie ruft allein `readFile` des
// hereingereichten Dateizugriffs. Berichtigt wird über die Maske, in der der
// Anwender entscheidet; eine Aufräum-Funktion ist bewusst nicht vorgesehen.
//
// Electron-frei; Dateizugriff und Sicht kommen herein wie bei den Regel-Modulen.
'use strict';

const { performance } = require('node:perf_hooks');

const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');
const { parseFormDefinition } = require('../../shared/database/table-definition.js');
const { zerlegeMaskenKoerper, FORM_HINWEISE } = require('../../shared/database/form-body.js');
const {
  baueRegelKontext,
  pruefeFeldRegeln,
  pruefeDatensatzRegeln,
} = require('../../shared/database/record-check-eval.js');
const { CELL_ERRORS } = require('../../shared/database/record-values.js');
const { VERWEIS_ARTEN, legeVerweisZelleAus } = require('../../shared/database/record-verweis.js');
const { schluesselKey } = require('../../shared/database/record-schluessel.js');
// 4T-002288: als Ganzes geholt, weil die Liste der Namen sonst über die
// Zeilenbreite wüchse.
const identitaet = require('../../shared/database/record-identity.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { werteDes, zellText } = require('./record-auftrag-plan.js');
const { kennungVorhanden } = require('./record-auftrag-bestand.js');
const {
  VERWEIS_TYP,
  zielAngabe,
  kopfDateien,
  findeKopfDatei,
  neuerLauf,
  bestandFuer,
} = require('./record-regel-hilfen.js');
const { findeZielTabelle } = require('./datensatz-liste.js');
// 4T-002307: als Ganzes geholt wie `record-identity.js` oben, damit der Befund
// der Rollen die Datei nur um seinen Aufruf wachsen lässt.
const katalog = require('./table-catalog.js');
// 4T-002248 (Epic 3E-000262, F1 A): die Angaben der Listen-Maske einer Abfrage-Datei.
const { parseListAngaben } = require('../../shared/database/list-angaben.js');
// 4T-002253 (Epic 3E-000262, S6): der Positions-Bereich einer Masken-Datei.
const { POSITIONS_HINWEISE, pruefePositionsBereich } = require('./positions-auskunft.js');

// Der geschlossene Katalog der Befunde, wie der Lage-Katalog des Regel-Werks.
// Jeder Code hat einen Anwender-Text unter `database.konsistenz.<code>`.
const KONSISTENZ_BEFUNDE = Object.freeze({
  schluesselDoppelt: 'konsistenzSchluesselDoppelt',
  kennungDoppelt: 'konsistenzKennungDoppelt',
  // 4T-002288: Datensätze mit einer Kennung über dem Hochwasserstand der
  // Definition, oder ohne ihn; `kennungen` nennt die höchste vorhandene.
  hochwasserstandZuNiedrig: 'konsistenzHochwasserstandZuNiedrig',
  verweisTabelleUnbekannt: 'konsistenzVerweisTabelleUnbekannt',
  verweisZielFehlt: 'konsistenzVerweisZielFehlt',
  verweisMehrdeutig: 'konsistenzVerweisMehrdeutig',
  verweisSchluesselMehrteilig: 'konsistenzVerweisSchluesselMehrteilig',
  datensatzregelVerletzt: 'konsistenzDatensatzregelVerletzt',
  pruefregelVerletzt: 'konsistenzPruefregelVerletzt',
  pflichtFehlt: 'konsistenzPflichtFehlt',
  typVerletzt: 'konsistenzTypVerletzt',
  zellenZahl: 'konsistenzZellenZahl',
  maskeFeldUnbekannt: 'konsistenzMaskeFeldUnbekannt',
  maskePlatzhalterUnbekannt: 'konsistenzMaskePlatzhalterUnbekannt',
  // 4T-002183: ein Wert-Platzhalter, dessen Ausdruck sich nicht lesen lässt.
  maskeAusdruckUngueltig: 'konsistenzMaskeAusdruckUngueltig',
  // 4T-002186: die drei Fehlerbilder der bedingten Bereiche einer Masken-Datei.
  maskeEndOhneWhen: 'konsistenzMaskeEndOhneWhen',
  maskeWhenOhneEnd: 'konsistenzMaskeWhenOhneEnd',
  maskeBedingungUngueltig: 'konsistenzMaskeBedingungUngueltig',
  // 4T-002252: ein Punkt-Name in Wert oder Bedingung mit unbekanntem Kopf.
  maskePfadUnbekannt: 'konsistenzMaskePfadUnbekannt',
  maskeTabelleUnbekannt: 'konsistenzMaskeTabelleUnbekannt',
  // 4T-002184: die Angabe `form` der Definition trifft keine Masken-Datei der
  // Tabelle, oder sie nennt die einer anderen Tabelle.
  maskeAngabeUnbekannt: 'konsistenzMaskeAngabeUnbekannt',
  maskeAngabeFremd: 'konsistenzMaskeAngabeFremd',
  definitionUnlesbar: 'konsistenzDefinitionUnlesbar',
  // 4T-002248 (Epic 3E-000262, F1 A): Befunde an einer Abfrage-Datei mit den
  // Angaben der Listen-Maske. `wert` ist der Schlüssel der unbrauchbaren
  // Angabe, das unbekannte Wort in `allow` oder die Angabe `form`.
  listeAngabeUnbrauchbar: 'konsistenzListeAngabeUnbrauchbar',
  listeHandgriffUnbekannt: 'konsistenzListeHandgriffUnbekannt',
  listeMaskeUnbekannt: 'konsistenzListeMaskeUnbekannt',
  // 4T-002253 (Epic 3E-000262, S6): Befunde am Positions-Bereich `{{list:…}}`
  // einer Masken-Datei; `wert` ist die Angabe des Platzhalters.
  maskeListeDateiUnbekannt: 'konsistenzMaskeListeDateiUnbekannt',
  maskeListeNichtBearbeitbar: 'konsistenzMaskeListeNichtBearbeitbar',
  maskeListeBeziehungFehlt: 'konsistenzMaskeListeBeziehungFehlt',
  maskeListeBeziehungMehrdeutig: 'konsistenzMaskeListeBeziehungMehrdeutig',
  maskeListeAbfrageUngueltig: 'konsistenzMaskeListeAbfrageUngueltig',
  // 4T-002307 (Epic 3E-000263, S3): eine unbrauchbare Rolle im Steckbrief;
  // `wert` ist die Rolle, `zieltabelle` die Tabelle, an der sie scheitert.
  steckbriefRollen: 'konsistenzSteckbriefRollen',
});

// Die Zell-Befunde des Typs, wie `zellWert` sie vergibt. `required` und `check`
// stammen aus der Lese-Seite der Prüfregeln und haben hier eigene Befunde.
const TYP_FEHLER = new Set([
  CELL_ERRORS.number,
  CELL_ERRORS.date,
  CELL_ERRORS.time,
  CELL_ERRORS.boolean,
]);

// Die Teile eines Schlüssels für die Anzeige verbunden, wie in der
// Schlüssel-Regel; der interne Trenner des Vergleichs gehört in keine Meldung.
const ANZEIGE_TRENNER = ' / ';

// Die Gestalt eines Befunds: jede Angabe da, nicht zutreffende als `null`.
// `regel`, `meldung` und `anzahl` tragen die Angaben, die die Sätze der
// Prüfregeln und der Zellen-Zahl brauchen (wie die Lagen des Regel-Werks).
function befund(code, angaben) {
  return {
    code,
    tabelle: null,
    pfad: null,
    datei: null,
    zeile: null,
    id: null,
    anzeige: null,
    feld: null,
    felder: null,
    wert: null,
    zieltabelle: null,
    grund: null,
    kennungen: null,
    regel: null,
    meldung: null,
    anzahl: null,
    ...angaben,
  };
}

// Der Index einer Spalte nach Namen, ohne Rücksicht auf die Schreibung.
function spaltenIndex(fields, name) {
  if (typeof name !== 'string') return -1;
  const klein = name.toLowerCase();
  return fields.findIndex((feld) => feld.name.toLowerCase() === klein);
}

// --- Die Datensätze einer Tabelle --------------------------------------------------------

// Jeder Datensatz einmal, in Datei-Reihenfolge, mit Datei und Datei-Zeile.
// Eine Kennung, die in zwei Dateien steht, zählt beim ersten Vorkommen; das
// zweite ist der Befund der Kennungs-Dublette und kein zweiter Datensatz.
function datensaetzeDer(bestand) {
  const liste = [];
  const dateienJeKennung = new Map();
  for (const datei of bestand.dateien) {
    const rumpf = datensatzRumpf(datei.text);
    for (const [id, record] of datei.records) {
      if (!dateienJeKennung.has(id)) {
        dateienJeKennung.set(id, []);
        const zeile =
          rumpf && typeof record.zeile === 'number' ? rumpf.vonZeile + record.zeile + 1 : null;
        liste.push({ id, record, datei: datei.pfad, zeile });
      }
      dateienJeKennung.get(id).push(datei);
    }
  }
  return { liste, dateienJeKennung };
}

// Die Anzeige-Form eines Datensatzes, getrimmt; leer heißt null, und der
// Bedienort fällt auf die Kennung zurück (Muster der Datensatz-Liste).
function anzeigeVon(anzeigeIndex, texte) {
  if (anzeigeIndex < 0) return null;
  const text = zellText(texte, anzeigeIndex).trim();
  return text === '' ? null : text;
}

// --- Verweise ----------------------------------------------------------------------------

// Die Schlüssel-Karte einer Ziel-Tabelle, einmal je Tabelle und Lauf:
// Schlüssel-Wert -> Kennungen. Verglichen wird zeichengenau und ungetrimmt, wie
// in der Verweis-Regel.
function schluesselKarteDes(ziel, karten, kopf) {
  const schluessel = pathCompareKey(kopf);
  if (karten.has(schluessel)) return karten.get(schluessel);
  const index = spaltenIndex(ziel.bestand.fields, ziel.key[0]);
  const karte = new Map();
  for (const { id, record } of datensaetzeDer(ziel.bestand).liste) {
    const wert = zellText(werteDes(record), index);
    if (!karte.has(wert)) karte.set(wert, []);
    karte.get(wert).push(id);
  }
  karten.set(schluessel, karte);
  return karte;
}

// Prüft eine nicht leere Verweis-Zelle; liefert einen Befund oder null.
async function pruefeVerweis({ lauf, sicht, karten, feld, text, stelle }) {
  const zelle = legeVerweisZelleAus(text);
  if (zelle.art === VERWEIS_ARTEN.leer) return null;
  const mit = { ...stelle, feld: feld.name, wert: text };
  const angabe = zielAngabe(feld);
  if (angabe === null)
    return befund(KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt, { ...mit, grund: 'zielAngabeFehlt' });
  const kopf = findeKopfDatei(sicht, angabe);
  const ziel = kopf === null ? null : await bestandFuer(lauf, kopf);
  if (ziel === null || !ziel.ok)
    return befund(KONSISTENZ_BEFUNDE.verweisTabelleUnbekannt, { ...mit, zieltabelle: angabe });
  const mitZiel = { ...mit, zieltabelle: ziel.name };
  if (zelle.art === VERWEIS_ARTEN.kennung) {
    if (kennungVorhanden(ziel.bestand, zelle.wert)) return null;
    return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, mitZiel);
  }
  const key = ziel.key;
  if (key === null || key.length === 0 || spaltenIndex(ziel.bestand.fields, key[0]) < 0)
    return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, { ...mitZiel, grund: 'keinSchluessel' });
  if (key.length > 1) return befund(KONSISTENZ_BEFUNDE.verweisSchluesselMehrteilig, mitZiel);
  const treffer = schluesselKarteDes(ziel, karten, kopf).get(zelle.wert) || [];
  if (treffer.length === 0) return befund(KONSISTENZ_BEFUNDE.verweisZielFehlt, mitZiel);
  if (treffer.length > 1)
    return befund(KONSISTENZ_BEFUNDE.verweisMehrdeutig, {
      ...mitZiel,
      anzahl: treffer.length,
      kennungen: [...treffer].sort(identitaet.nachNummer),
    });
  return null;
}

// --- Ein Datensatz -----------------------------------------------------------------------

function meldungVon(verletzung) {
  return verletzung.message === null || verletzung.message === undefined ? '' : verletzung.message;
}

// Zellen-Zahl, Pflicht, Typ, Feld-Regeln und Verweise je Feld, danach die
// Datensatz-Regeln. Die Zell-Texte folgen der Auslegung des Schreibwegs
// (`werteDes`): Der Trennabstand vor dem Zaun gehört nicht zum Wert.
async function pruefeDatensatz(kontext, eintrag, stelle) {
  const { bestand, definition, lauf, sicht, karten } = kontext;
  const { fields } = bestand;
  const { record } = eintrag;
  const befunde = [];
  const texte = werteDes(record);
  if (record.cells.length !== fields.length)
    befunde.push(
      befund(KONSISTENZ_BEFUNDE.zellenZahl, {
        ...stelle,
        wert: String(record.cells.length),
        anzahl: fields.length,
      }),
    );
  const regelKontext = baueRegelKontext(fields, texte);
  for (let i = 0; i < fields.length; i++) {
    const feld = fields[i];
    const zelle = record.cells[i];
    const text = zellText(texte, i);
    // Die leere Zelle des Wahrheitswerts ist der Wert «nein» und kein fehlender
    // (dieselbe Regel wie beim Lesen und Schreiben).
    const leer = zelle === undefined || text.trim() === '';
    if (feld.required === true && feld.type !== 'boolean' && leer) {
      befunde.push(befund(KONSISTENZ_BEFUNDE.pflichtFehlt, { ...stelle, feld: feld.name }));
      continue;
    }
    if (zelle === undefined) continue;
    if (TYP_FEHLER.has(zelle.error)) {
      befunde.push(
        befund(KONSISTENZ_BEFUNDE.typVerletzt, { ...stelle, feld: feld.name, wert: text.trim() }),
      );
      continue;
    }
    for (const v of pruefeFeldRegeln(feld, text, regelKontext))
      befunde.push(
        befund(KONSISTENZ_BEFUNDE.pruefregelVerletzt, {
          ...stelle,
          feld: v.feld,
          wert: v.wert,
          regel: v.quelle,
          meldung: meldungVon(v),
          grund: v.grund,
        }),
      );
    if (feld.type === VERWEIS_TYP) {
      const gefunden = await pruefeVerweis({ lauf, sicht, karten, feld, text, stelle });
      if (gefunden !== null) befunde.push(gefunden);
    }
  }
  for (const v of pruefeDatensatzRegeln(definition.checks, regelKontext, fields))
    befunde.push(
      befund(KONSISTENZ_BEFUNDE.datensatzregelVerletzt, {
        ...stelle,
        felder: v.felder,
        regel: v.quelle,
        meldung: meldungVon(v),
        grund: v.grund,
      }),
    );
  return befunde;
}

// --- Eindeutigkeit -------------------------------------------------------------------------

// Die Alt-Dublette des fachlichen Schlüssels (E22.5): je beteiligtem Datensatz
// ein Befund mit allen Kennungen. Ein leerer Teil nimmt den Schlüssel aus der
// Prüfung, wie in der Schlüssel-Regel; ein Schlüssel, dessen Felder die
// Definition nicht kennt, hat nichts zu prüfen.
function schluesselDubletten(bestand, key, eintraege, stellen) {
  const befunde = new Map();
  if (!Array.isArray(key) || key.length === 0) return befunde;
  const indizes = key.map((name) => spaltenIndex(bestand.fields, name));
  if (indizes.some((i) => i < 0)) return befunde;
  const felder = indizes.map((i) => bestand.fields[i].name);
  const gruppen = new Map();
  eintraege.forEach((eintrag, n) => {
    const teile = indizes.map((i) => zellText(werteDes(eintrag.record), i));
    if (teile.some((teil) => teil === '')) return;
    const vergleich = schluesselKey(teile);
    if (!gruppen.has(vergleich)) gruppen.set(vergleich, { teile, positionen: [] });
    gruppen.get(vergleich).positionen.push(n);
  });
  for (const { teile, positionen } of gruppen.values()) {
    if (positionen.length < 2) continue;
    const kennungen = positionen.map((n) => eintraege[n].id).sort(identitaet.nachNummer);
    for (const n of positionen)
      befunde.set(
        n,
        befund(KONSISTENZ_BEFUNDE.schluesselDoppelt, {
          ...stellen[n],
          felder,
          wert: teile.join(ANZEIGE_TRENNER),
          kennungen,
        }),
      );
  }
  return befunde;
}

// Dieselbe Kennung zweimal in einer Datei oder in zwei Dateien: ein Befund je
// Kennung, an der Datei ihres ersten Vorkommens.
function kennungsDubletten(bestand, dateienJeKennung, stelleVon) {
  const befunde = [];
  for (const [id, dateien] of dateienJeKennung) {
    if (dateien.length < 2 && !dateien[0].doppelt.has(id)) continue;
    befunde.push(befund(KONSISTENZ_BEFUNDE.kennungDoppelt, { ...stelleVon(id), kennungen: [id] }));
  }
  return befunde;
}

// --- Eine Tabelle --------------------------------------------------------------------------

function alsGrund(ziel) {
  // Ein Lage-Code ist keine Auskunft für den Anwender, eine Fehlermeldung des
  // Dateizugriffs schon.
  return typeof ziel.grund === 'string' && !Object.values(LAGEN).includes(ziel.grund)
    ? ziel.grund
    : null;
}

async function pruefeTabelle(lauf, sicht, karten, kopf) {
  const name = katalog.tabellenName(kopf);
  const kopfStelle = { tabelle: name, pfad: kopf };
  const ziel = await bestandFuer(lauf, kopf);
  if (!ziel.ok)
    return {
      form: undefined,
      datensaetze: 0,
      befunde: [
        befund(KONSISTENZ_BEFUNDE.definitionUnlesbar, {
          ...kopfStelle,
          datei: kopf,
          grund: alsGrund(ziel),
        }),
      ],
    };

  const { bestand, definition } = ziel;
  const { liste, dateienJeKennung } = datensaetzeDer(bestand);
  const anzeigeIndex = spaltenIndex(bestand.fields, identitaet.anzeigeSpalte(definition));
  const stellen = liste.map((eintrag) => ({
    ...kopfStelle,
    datei: eintrag.datei,
    zeile: eintrag.zeile,
    id: eintrag.id,
    anzeige: anzeigeVon(anzeigeIndex, werteDes(eintrag.record)),
  }));
  const kontext = { bestand, definition, lauf, sicht, karten };
  const dubletten = schluesselDubletten(bestand, ziel.key, liste, stellen);

  const befunde = [];
  for (let n = 0; n < liste.length; n++) {
    befunde.push(...(await pruefeDatensatz(kontext, liste[n], stellen[n])));
    if (dubletten.has(n)) befunde.push(dubletten.get(n));
  }
  const stelleVon = (id) => stellen[liste.findIndex((eintrag) => eintrag.id === id)];
  befunde.push(...kennungsDubletten(bestand, dateienJeKennung, stelleVon));
  // 4T-002288: Hinweis, kein Schaden; die nächste Neuanlage hebt den Stand an.
  const ueber = identitaet.kennungUeberStand(bestand.lastId, dateienJeKennung.keys());
  const standStelle = { ...kopfStelle, datei: kopf, kennungen: [ueber] };
  if (ueber) befunde.push(befund(KONSISTENZ_BEFUNDE.hochwasserstandZuNiedrig, standStelle));
  return { form: definition.form, datensaetze: liste.length, befunde };
}

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

// --- Die Prüfung ---------------------------------------------------------------------------

/**
 * Prüft den Bestand einer oder aller Tabellen der Sicht.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {object|null} p.sicht Die bereite Tabellen-Sicht des Bereichs-Index.
 * @param {string|null} [p.tabelle] Name oder Pfad EINER Tabelle, oder null für alle
 *   Kopf-Dateien der Sicht.
 * @returns {Promise<object>} `{status: 'ready', befunde, tabellen: Array<{name, pfad,
 *   datensaetze, befunde}>, dauerMs}`; ohne Sicht `status: 'unavailable'`, bei einer
 *   unbekannten Tabelle `{status: 'error', code}` mit einem Code aus `LAGEN`.
 */
async function pruefeKonsistenz({ fsp, wurzel, sicht, tabelle = null }) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('pruefeKonsistenz: fsp ist Pflicht und muss readFile tragen');
  const start = performance.now();
  if (!sicht || typeof wurzel !== 'string' || wurzel === '')
    return { status: 'unavailable', befunde: [], tabellen: [], dauerMs: 0 };

  let kopfe = kopfDateien(sicht);
  let nurKopf = null;
  if (tabelle !== null && tabelle !== undefined) {
    nurKopf = findeZielTabelle({ wurzel, sicht, tabelle });
    if (nurKopf === null) return { status: 'error', code: LAGEN.tabelleUnbekannt };
    kopfe = [nurKopf];
  }

  const lauf = neuerLauf({
    bereichsWurzel: wurzel,
    schritte: [],
    bestaende: new Map(),
    tabellenSicht: () => ({ status: 'ready', sicht }),
    fsp,
  });
  const karten = new Map();
  const befunde = [];
  const tabellen = [];
  const zeileJeKopf = new Map();
  const formJeKopf = new Map();
  for (const kopf of kopfe) {
    const ergebnis = await pruefeTabelle(lauf, sicht, karten, kopf);
    formJeKopf.set(kopf, ergebnis.form);
    const zeile = {
      name: katalog.tabellenName(kopf),
      pfad: kopf,
      datensaetze: ergebnis.datensaetze,
      befunde: ergebnis.befunde.length,
    };
    tabellen.push(zeile);
    zeileJeKopf.set(pathCompareKey(kopf), zeile);
    befunde.push(...ergebnis.befunde);
  }

  const zuordnungen = [];
  const cache = katalog.createDatabaseCatalogCache();
  for (const pfad of dateienMit(sicht, 'form')) {
    const maske = await pruefeMaske({ lauf, sicht, fsp, pfad, nurKopf, wurzel, cache });
    if (maske.zuordnung) zuordnungen.push(maske.zuordnung);
    const zeile = maske.kopf === null ? null : zeileJeKopf.get(pathCompareKey(maske.kopf));
    if (zeile) zeile.befunde += maske.befunde.length;
    befunde.push(...maske.befunde);
  }

  // 4T-002184: die Angabe `form` je geprüfter Tabelle, gezählt an ihrer Zeile.
  for (const [kopf, angabe] of formJeKopf) {
    const gefunden = standardMaskenBefund(kopf, angabe, zuordnungen);
    if (gefunden === null) continue;
    zeileJeKopf.get(pathCompareKey(kopf)).befunde += 1;
    befunde.push(gefunden);
  }

  // 4T-002248: die Abfrage-Dateien, nur bei der Prüfung aller Tabellen, weil
  // ihre Tabelle erst aus der Abfrage folgt und keiner Einzel-Prüfung gehört.
  if (nurKopf === null)
    for (const pfad of dateienMit(sicht, 'query'))
      befunde.push(...(await pruefeAbfrage({ fsp, pfad, zuordnungen })));
  // 4T-002307: die Rollen des Steckbriefs, wie die Abfrage-Dateien nur bei allen.
  if (nurKopf === null)
    for (const angaben of await katalog.rollenBefundeDerSicht({ sicht, fsp }))
      befunde.push(befund(KONSISTENZ_BEFUNDE.steckbriefRollen, angaben));

  return {
    status: 'ready',
    befunde,
    tabellen,
    dauerMs: Math.round(performance.now() - start),
  };
}

module.exports = { KONSISTENZ_BEFUNDE, pruefeKonsistenz };
