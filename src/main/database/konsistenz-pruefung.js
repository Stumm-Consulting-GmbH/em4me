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
// **Drei Module** (4T-002386, Epic 3E-000265, S5). Die Prüfung ist nach
// Verantwortlichkeit geteilt, weil die Datei das Größen-Budget ausgeschöpft
// hatte: Hier stehen die Prüfung der Tabellen und ihrer Datensätze und der
// Einstieg `pruefeKonsistenz`; die Prüfung der Masken-, Listen- und
// Abfrage-Dateien steht in `konsistenz-pruefung-dateien.js`; Katalog und
// Befund-Bau, die beide brauchen, stehen in `konsistenz-befunde.js`, damit
// zwischen den beiden Prüf-Modulen kein Import-Zyklus entsteht. Die Exporte
// dieses Moduls sind unverändert; der Katalog wird von dort weitergegeben.
// Seit 4T-002404 (Epic 3E-000266, S1) steht die Prüfung eines einzelnen
// Datensatzes samt Schlüssel-Dublette in `datensatz-pruefung.js`, weil das
// Speichern einer Karteikarte dieselbe Prüfung ruft; hier bleibt die Tabelle.
//
// Electron-frei; Dateizugriff und Sicht kommen herein wie bei den Regel-Modulen.
'use strict';

const { performance } = require('node:perf_hooks');

// 4T-002288: als Ganzes geholt, weil die Liste der Namen sonst über die
// Zeilenbreite wüchse.
const identitaet = require('../../shared/database/record-identity.js');
const { istKarteiForm } = require('../../shared/database/table-definition.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { kopfDateien, neuerLauf, bestandFuer } = require('./record-regel-hilfen.js');
const { findeZielTabelle } = require('./datensatz-liste.js');
// 4T-002307: als Ganzes geholt wie `record-identity.js` oben, damit der Befund
// der Rollen die Datei nur um seinen Aufruf wachsen lässt.
const katalog = require('./table-catalog.js');
// 4T-002386 (S5): Katalog und Befund-Bau, und die Prüfung der Dateien.
const { KONSISTENZ_BEFUNDE, befund } = require('./konsistenz-befunde.js');
// 4T-002404 (Epic 3E-000266, S1): die Prüfung eines Datensatzes, geschnitten,
// damit das Speichern einer Karteikarte dieselbe Prüfung ruft.
const {
  datensaetzeDer,
  stellenDer,
  pruefeDatensatz,
  schluesselDubletten,
} = require('./datensatz-pruefung.js');
const {
  dateienMit,
  pruefeMaske,
  standardMaskenBefund,
  pruefeAbfrage,
} = require('./konsistenz-pruefung-dateien.js');
// 4T-002386 (Schritt 4) und 4T-002387: die Befunde der Kartei-Form.
const {
  karteiBefunde,
  karteikartenBefunde,
  vorlagenPruefer,
} = require('./konsistenz-pruefung-kartei.js');

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

// `kartei` trägt Vorlagen-Prädikat und Profil-Zugang der Karteikarten (4T-002387).
async function pruefeTabelle(lauf, sicht, karten, kopf, kartei) {
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
  const stellen = stellenDer(kopfStelle, liste, bestand, definition);
  const kontext = { bestand, definition, lauf, sicht, karten };
  const dubletten = schluesselDubletten(bestand, ziel.key, liste, stellen);

  const befunde = [];
  for (let n = 0; n < liste.length; n++) {
    befunde.push(...(await pruefeDatensatz(kontext, liste[n], stellen[n])));
    if (dubletten.has(n)) befunde.push(dubletten.get(n));
  }
  const stelleVon = (id) => stellen[liste.findIndex((eintrag) => eintrag.id === id)];
  // 4T-002389: Bei einer Kartei-Tabelle meldet die Kennungs-Dublette die
  // Prüfung der Karteikarten, je Fundstelle (`karteikartenBefunde`).
  if (!istKarteiForm(definition))
    befunde.push(...kennungsDubletten(bestand, dateienJeKennung, stelleVon));
  // 4T-002288: Hinweis, kein Schaden; die nächste Neuanlage hebt den Stand an.
  const ueber = identitaet.kennungUeberStand(bestand.lastId, dateienJeKennung.keys());
  const standStelle = { ...kopfStelle, datei: kopf, kennungen: [ueber] };
  if (ueber) befunde.push(befund(KONSISTENZ_BEFUNDE.hochwasserstandZuNiedrig, standStelle));
  // 4T-002386: Bei einer Kartei-Tabelle führt der Bestand ihren Block nicht als
  // Datensätze; hier wird allein der Block gemeldet. Seit 4T-002389 trägt
  // `liste` ihre Karteikarten, die wie Datensätze geprüft werden.
  befunde.push(...karteiBefunde(ziel, kopfStelle));
  // 4T-002387: die Karteikarten im Ordner der Kartei-Tabelle.
  befunde.push(...(await karteikartenBefunde(ziel, kopfStelle, { lauf, sicht, ...kartei })));
  return { form: definition.form, datensaetze: liste.length, befunde };
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
 * @param {string|null} [p.vorlagenOrdner] Wirksamer Vorlagen-Ordner (4T-002387):
 *   Dokumente darin sind keine Karteikarten. null, wenn es keinen gibt.
 * @param {Function|null} [p.profilFelder] Profil-Felder eines Dokuments
 *   (4T-002387, Schnitt C; `erzeugeProfilFelderZugang` in `profil-felder.js`).
 *   null ohne Profile; dann entfällt der Hinweis auf abweichende Profil-Typen.
 * @returns {Promise<object>} `{status: 'ready', befunde, tabellen: Array<{name, pfad,
 *   datensaetze, befunde}>, dauerMs}`; ohne Sicht `status: 'unavailable'`, bei einer
 *   unbekannten Tabelle `{status: 'error', code}` mit einem Code aus `LAGEN`.
 */
async function pruefeKonsistenz({
  fsp,
  wurzel,
  sicht,
  tabelle = null,
  vorlagenOrdner = null,
  profilFelder = null,
}) {
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
  const kartei = { istVorlage: vorlagenPruefer(wurzel, vorlagenOrdner), profilFelder };
  const befunde = [];
  const tabellen = [];
  const zeileJeKopf = new Map();
  const formJeKopf = new Map();
  for (const kopf of kopfe) {
    const ergebnis = await pruefeTabelle(lauf, sicht, karten, kopf, kartei);
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
