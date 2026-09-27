// 4T-001790 (Epic 3E-000255, E10.3, E10.4, E3): Der Änderungsbeleg als Format.
// Einen Beleg bauen und prüfen, ihn serialisieren, eine Beleg-Datei lesen, die
// Belege eines Datensatzes herausgreifen und über ihre Verkettung Auskunft
// geben.
//
// **Ein Beleg ist ein Datensatz der E3-Notation** (Bauplan F1). Die Beleg-Datei
// ist der Rumpf eines Datensatz-Blocks ohne Zaun und ohne Frontmatter, denn ein
// schließender Zaun müsste bei jedem Anfügen verschoben werden, und damit wäre
// die Datei nicht mehr rein anfügbar (E10.7). Gelesen wird deshalb mit
// `parseRecordBlock`, geschrieben mit `serializeRecordBlock`; Marker, Maskierung
// in Spalte 0 und mehrzeilige Zellen kommen von dort. Es entsteht kein zweiter
// Parser und keine zweite Maskierung (AK12).
//
// **Was am Marker steht und was in den Zellen** (Bauplan F2 und F3): Am Marker
// stehen allein die Angaben mit kontrolliertem Wertevorrat, in der
// Attribut-Grammatik des Hauses; die Werte selbst stehen als Zellen, weil sie
// freier Text sind und mehrzeilig sein dürfen. Je berührtem Feld steht ein
// Tripel aus Feld-Name, altem und neuem Wert, danach Benutzer und Rechner.
//
// **Benutzer und Rechner stehen bewusst am Ende.** Beide sind ihrer Natur nach
// einzeilig und werden beim Lesen beschnitten. Damit gerät die führende
// Leerzeile des Anfüge-Textes (F4) nie in einen Feld-Wert, sondern immer in die
// letzte Zelle, wo sie folgenlos weggeschnitten wird.
//
// **Die Werte sind Zell-Texte, keine ausgelegten Werte** (F3). E9.3 vergleicht
// den Inhalt der gelesenen Datensatz-Zeile, und ein Beleg, der Text festhält,
// übersteht eine spätere Typ-Änderung seines Feldes.
//
// **Die sechste Art `merged`** (4T-001791, E10.10) ist die Marke des
// verdichteten Belegs. Sie steht hier und nicht in der Verdichtung, weil Lesen,
// Schreiben und Verkettungs-Auskunft sie kennen müssen; ihre Angaben `since`,
// `count` und `kinds` sind Angaben am Marker wie die übrigen. Wie eine Spanne
// gebildet und eine neue Datei-Fassung daraus gebaut wird, steht in
// `change-compaction.js`.
//
// **Nicht hier:** der Erzeuger der Vorgangs-Kennung. Der je Datenbank monoton
// wachsende Zähler samt seinem Hochwasserstand gehört zur Schreib-Schnittstelle
// (AK9); dieses Modul nimmt die Kennung als Wert entgegen. Ebenso wenig gehören
// hierher der Datei-Zugriff (der liegt im Haupt-Prozess) und die Anlässe, die
// einen Beleg auslösen.
//
// Prozess-neutral (kein Electron, kein DOM, kein Datei-Zugriff, kein
// `node:path`).
'use strict';

const { kennungFuer, nummerAus } = require('./record-identity.js');
const { ATTR_RE, parseRecordBlock, serializeRecordBlock } = require('./record-block.js');

// --- Die Arten und die Angaben am Marker (F2) -----------------------------------------

// Die fünf Anlässe aus E10.1 und E10.2. Die Namen der ersten drei folgen den
// Operations-Begriffen aus E12.3, damit Berechtigung und Beleg dieselbe Sprache
// sprechen; `definition` ist die Änderung der Feld-Definition, `external` die
// festgestellte Fremd-Änderung ohne Urheber.
const ART_CREATE = 'create';
const ART_UPDATE = 'update';
const ART_DELETE = 'delete';
const ART_DEFINITION = 'definition';
const ART_EXTERNAL = 'external';
// 4T-001791 (Epic 3E-000255, E10.10): Die sechste Art ist die sichtbare Marke
// des verdichteten Belegs. Sie ist kein Anlass, sondern das Ergebnis einer
// Zusammenfassung, und sie steht trotzdem in derselben Liste, weil Lesen,
// Schreiben und Verkettung sie wie jede andere behandeln müssen.
const ART_MERGED = 'merged';
const BELEG_ARTEN = Object.freeze([
  ART_CREATE,
  ART_UPDATE,
  ART_DELETE,
  ART_DEFINITION,
  ART_EXTERNAL,
  ART_MERGED,
]);

// Die Namen der Angaben sind englisch wie `id` und der Name der Fence, weil die
// Datei in einem Paket weitergegeben werden kann und eine Notation nicht
// übersetzt wird.
const ATTR_ID = 'id';
const ATTR_KIND = 'kind';
const ATTR_AT = 'at';
const ATTR_TX = 'tx';
const ATTR_N = 'n';
const ATTR_NO_OLD = 'noOld';
const ATTR_NO_NEW = 'noNew';
// 4T-001791 (Epic 3E-000255, E10.10): die drei eigenen Angaben des verdichteten
// Belegs. `since` nennt den Zeitpunkt des ältesten ersetzten Belegs, `count` die
// Zahl der ersetzten Änderungen und `kinds` die ersetzten Arten in der
// Reihenfolge ihres ersten Auftretens.
const ATTR_SINCE = 'since';
const ATTR_COUNT = 'count';
const ATTR_KINDS = 'kinds';

// Die Reihenfolge, in der die Angaben geschrieben werden. `id` steht voran,
// weil `schreibeAngaben` in `record-block.js` sie dort setzt; alles Weitere
// folgt in dieser Liste, und Unbekanntes reist am Ende mit.
const ATTR_REIHENFOLGE = Object.freeze([
  ATTR_ID,
  ATTR_KIND,
  ATTR_AT,
  ATTR_TX,
  ATTR_N,
  ATTR_NO_OLD,
  ATTR_NO_NEW,
  ATTR_SINCE,
  ATTR_COUNT,
  ATTR_KINDS,
]);

// Die gedeuteten Angaben hinter dem Marker, ohne `id`: die liest bereits
// `leseAngaben` aus `record-block.js`.
const GEDEUTETE_ATTRIBUTE = Object.freeze([
  ATTR_KIND,
  ATTR_AT,
  ATTR_TX,
  ATTR_N,
  ATTR_NO_OLD,
  ATTR_NO_NEW,
  ATTR_SINCE,
  ATTR_COUNT,
  ATTR_KINDS,
]);

// Zeitpunkt als UTC in ISO-8601-Form, sekundengenau (E10.3, AK2). Geprüft wird
// die FORM; ob der Tag kalendarisch existiert, sagt die Quelle des Zeitpunkts
// und nicht dieses Format.
const ZEITPUNKT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;

// Die Attribut-Grammatik des Hauses, `name="wert"`, kommt aus `record-block.js`
// und steht hier kein zweites Mal. Gedeutet wird damit ausschließlich der REST
// hinter der Kennung, den `leseAngaben` unangetastet stehen lässt.

// Codes der Befunde beim Lesen. Ein Beleg, der einen davon trägt, ist
// **beschädigt**: Er wird gemeldet und aus der Verkettung herausgehalten, nie
// verworfen und nie geworfen (F4, AK11).
const BELEG_CODES = Object.freeze({
  art: 'belegArtUnbekannt',
  zeitpunkt: 'belegZeitpunktUngueltig',
  kennung: 'belegKennungFehlt',
  vorgang: 'belegVorgangFehlt',
  anzahl: 'belegAnzahlUngueltig',
  fehlstellen: 'belegFehlstellenUngueltig',
  zellen: 'belegZellenUnvollstaendig',
  // 4T-001791: Die Angaben des verdichteten Belegs sind nicht auslegbar. Der
  // Beleg gilt dann als beschädigt, statt die Spanne mit geratenen Werten
  // weiterzutragen: Wie viele Änderungen er ersetzt, ist die einzige Auskunft
  // über sie, die er noch hat.
  verdichtung: 'belegVerdichtungUngueltig',
});

// Der Anfüge-Text beginnt mit einer Leerzeile (F4): Sie schließt eine Zeile ab,
// die ein abgebrochener früherer Schreibvorgang offen gelassen hat, und der neue
// Marker steht damit in jedem Fall in Spalte 0, ohne dass die Datei vorher
// gelesen werden muss.
const ANFUEGE_VORSPANN = '\n';

// --- Bauen und prüfen -----------------------------------------------------------------

function fehler(satz) {
  return new Error(`change-record: ${satz}`);
}

// Leer heißt null, nicht die leere Zeichenkette: Eine nicht ermittelbare Angabe
// ist etwas anderes als eine leere. Dieselbe Linie, die `src/main/herkunft.js`
// für Benutzer und Rechner zieht.
function alsEinzeiler(wert) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  return text === '' ? null : text;
}

function ganzeZahl(roh) {
  if (typeof roh !== 'string' || !/^\d+$/.test(roh)) return null;
  const zahl = parseInt(roh, 10);
  return Number.isSafeInteger(zahl) ? zahl : null;
}

function pruefeArt(roh) {
  if (typeof roh === 'string' && BELEG_ARTEN.includes(roh)) return roh;
  throw fehler(`unbekannte Art "${roh}"; zulässig sind ${BELEG_ARTEN.join(', ')}.`);
}

// Die interne Kennung des Datensatzes (E5.1). Beide Schreibweisen werden
// angenommen, geschrieben wird immer die aufgefüllte; beim Definitions-Beleg
// fehlt sie, weil er an der Definition hängt und nicht an einem Datensatz.
function pruefeKennung(roh, art) {
  const leer = roh === undefined || roh === null || roh === '';
  if (art === ART_DEFINITION) {
    if (leer) return null;
    throw fehler('der Definitions-Beleg trägt keine interne Kennung.');
  }
  const nummer = leer ? null : nummerAus(roh);
  if (nummer === null) throw fehler(`"${roh}" ist keine interne Kennung eines Datensatzes.`);
  return kennungFuer(nummer);
}

function pruefeZeitpunkt(roh) {
  if (typeof roh === 'string' && ZEITPUNKT_RE.test(roh)) return roh;
  throw fehler(`der Zeitpunkt "${roh}" steht nicht in der Form YYYY-MM-DDTHH:MM:SSZ.`);
}

// Die Vorgangs-Kennung wird als WERT entgegengenommen (AK9). Eine ganze Zahl
// ist zulässig, weil der Zähler aus E10.5 eine liefert; geschrieben wird sie als
// Text, denn am Marker steht Text.
// 4T-001791: Die Arten, bei denen die Vorgangs-Kennung fehlen darf. Bei
// `external` gibt es keinen Vorgang der Anwendung, bei `merged` umfasst die
// Spanne viele Vorgänge, und einen davon zu nennen wäre eine Behauptung.
const OHNE_VORGANG = Object.freeze([ART_EXTERNAL, ART_MERGED]);

function pruefeVorgang(roh, art) {
  if (roh === undefined || roh === null || roh === '') {
    if (OHNE_VORGANG.includes(art)) return null;
    throw fehler(
      `die Vorgangs-Kennung fehlt; nur bei den Arten ${OHNE_VORGANG.join(', ')} darf sie fehlen.`,
    );
  }
  const text = typeof roh === 'number' && Number.isSafeInteger(roh) ? String(roh) : roh;
  if (typeof text !== 'string')
    throw fehler('die Vorgangs-Kennung ist weder Text noch ganze Zahl.');
  if (text.includes('"'))
    throw fehler(
      'die Vorgangs-Kennung enthält ein Anführungszeichen; die Angabe kann es nicht tragen.',
    );
  return text;
}

function pruefeWert(roh, position, welcher) {
  if (roh === undefined || roh === null) return null;
  if (typeof roh !== 'string')
    throw fehler(`Feld ${position}: der ${welcher} Wert ist kein Zell-Text.`);
  return roh;
}

// Die berührten Felder als Liste `{ name, alt, neu }`. Ein FEHLENDER Wert
// (`undefined` oder `null`) ist etwas anderes als ein LEERER (`''`); die
// Unterscheidung trägt beim Schreiben `noOld` beziehungsweise `noNew` (AK8).
function pruefeFelder(roh) {
  if (!Array.isArray(roh)) throw fehler('die berührten Felder werden als Liste erwartet.');
  return roh.map((eintrag, i) => {
    const e = eintrag && typeof eintrag === 'object' ? eintrag : {};
    if (typeof e.name !== 'string' || e.name.trim() === '')
      throw fehler(`Feld ${i + 1} trägt keinen Namen.`);
    return {
      name: e.name,
      alt: pruefeWert(e.alt, i + 1, 'alte'),
      neu: pruefeWert(e.neu, i + 1, 'neue'),
    };
  });
}

// 4T-001791 (Epic 3E-000255, E10.10): die ersetzten Arten einer Spanne, in der
// Reihenfolge ihres ersten Auftretens und ohne Wiederholung.
//
// **`merged` selbst gehört nicht dazu**, und das bleibt auch bei erneuter
// Verdichtung so: Ein bereits verdichteter Beleg trägt seine eigenen Arten bei,
// und die Vereinigung nennt damit weiterhin die ursprünglichen Anlässe. Stünde
// `merged` in der Liste, verlöre sie gerade die Auskunft, für die sie da ist,
// nämlich ob die Spanne ein Anlegen oder ein Löschen enthielt.
function pruefeArten(roh) {
  const liste = Array.isArray(roh) ? roh : null;
  if (liste === null || liste.length === 0)
    throw fehler('die ersetzten Arten fehlen; ein verdichteter Beleg nennt mindestens eine.');
  for (const art of liste) {
    if (typeof art !== 'string' || art === ART_MERGED || !BELEG_ARTEN.includes(art))
      throw fehler(`"${art}" ist keine ersetzbare Art einer verdichteten Spanne.`);
  }
  return [...new Set(liste)];
}

// Die eigenen Angaben des verdichteten Belegs. Eine Spanne aus einem einzigen
// Beleg wird nicht verdichtet, deshalb ist zwei die kleinste sinnvolle Zahl;
// `seit` liegt nie nach dem Zeitpunkt des Belegs, weil es der Anfang derselben
// Spanne ist, deren Ende er nennt. Verglichen wird als Zeichenkette, was bei
// der festen ISO-8601-Form aus E10.3 dasselbe ist wie ein Zeitvergleich.
function pruefeVerdichtung(roh, zeitpunkt) {
  const v = roh && typeof roh === 'object' ? roh : {};
  const anzahl = typeof v.anzahl === 'number' && Number.isSafeInteger(v.anzahl) ? v.anzahl : null;
  if (anzahl === null || anzahl < 2)
    throw fehler('ein verdichteter Beleg ersetzt mindestens zwei Änderungen.');
  const seit = pruefeZeitpunkt(v.seit);
  if (seit > zeitpunkt)
    throw fehler(`der Anfang der Spanne "${seit}" liegt nach ihrem Ende "${zeitpunkt}".`);
  return { anzahl, seit, arten: pruefeArten(v.arten) };
}

/**
 * Baut einen Beleg aus Werten und prüft ihn.
 *
 * Ungültige Eingaben werden mit einem Fehler abgewiesen und nie still
 * korrigiert: Ein Datenspeicher, der eine unklare Angabe zurechtbiegt, schreibt
 * eine Behauptung in seine eigene Spur.
 *
 * @param {object} angaben Art, interne Kennung, Zeitpunkt, Vorgangs-Kennung,
 *   berührte Felder und Herkunft.
 * @param {string} angaben.art Eine der fünf Arten aus `BELEG_ARTEN`.
 * @param {string|null} [angaben.id] Interne Kennung; fehlt beim Definitions-Beleg.
 * @param {string} angaben.zeitpunkt UTC, ISO-8601, sekundengenau.
 * @param {string|number|null} [angaben.vorgang] Vorgangs-Kennung; darf bei
 *   `external` fehlen.
 * @param {Array<{name: string, alt?: string|null, neu?: string|null}>} angaben.felder
 * @param {{benutzer?: string, rechner?: string}} [angaben.herkunft] In der Form,
 *   die `herkunftsFelder` liefert.
 * @param {{anzahl: number, seit: string, arten: string[]}} [angaben.verdichtung]
 *   Nur bei der Art `merged`: Zahl der ersetzten Änderungen, Anfang der Spanne
 *   und die ersetzten Arten.
 * @returns {object} Der geprüfte Beleg.
 */
function baueBeleg(angaben) {
  const a = angaben && typeof angaben === 'object' ? angaben : {};
  const art = pruefeArt(a.art);
  const herkunft = a.herkunft && typeof a.herkunft === 'object' ? a.herkunft : {};
  const zeitpunkt = pruefeZeitpunkt(a.zeitpunkt);
  const istVerdichtet = art === ART_MERGED;
  // 4T-001822 (Epic 3E-000254, B2, E10.2): Der Beleg der Fremd-Änderung trägt
  // ebenfalls keinen Urheber. Die Anwendung weiß nicht, wer die Datei von Hand
  // geändert hat; die Herkunft, die der Schreibweg mitreicht, ist die dessen,
  // der gerade ERZWINGT, und sie hier hinzuschreiben behauptete, er habe die
  // fremde Änderung vorgenommen. Die Regel steht im Format und nicht am
  // Schreibweg, an derselben Stelle wie beim verdichteten Beleg: Eine zweite
  // Heimat derselben Regel wäre ein Doppel-Mechanismus.
  const ohneUrheber = istVerdichtet || art === ART_EXTERNAL;
  return {
    art,
    id: pruefeKennung(a.id, art),
    zeitpunkt,
    vorgang: pruefeVorgang(a.vorgang, art),
    felder: pruefeFelder(a.felder),
    // 4T-001791: Benutzer und Rechner bleiben am verdichteten Beleg leer, auch
    // wenn eine Herkunft mitgegeben wird. Eine Spanne hat viele Urheber, und
    // einen davon hinzuschreiben wäre die eine Behauptung, die die Verdichtung
    // sich nicht erlauben darf. Das ist ihr Preis und wird nicht beschönigt.
    benutzer: ohneUrheber ? null : alsEinzeiler(herkunft.benutzer),
    rechner: ohneUrheber ? null : alsEinzeiler(herkunft.rechner),
    verdichtung: istVerdichtet ? pruefeVerdichtung(a.verdichtung, zeitpunkt) : null,
    attrsRest: null,
    vorspann: [],
    zeile: null,
    beschaedigt: false,
    code: null,
    zellen: null,
  };
}

/**
 * Zeitpunkt in der Form des Belegs: UTC, ISO-8601, sekundengenau.
 *
 * Steht hier und nicht beim Schreibweg, damit die Form an einer Stelle liegt.
 *
 * @param {Date|number|string} datum
 * @returns {string}
 */
function zeitpunktAus(datum) {
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) throw fehler('kein auslegbarer Zeitpunkt.');
  return `${d.toISOString().slice(0, 19)}Z`;
}

// --- Serialisieren (F4, F5) -----------------------------------------------------------

// 1-basierte, komma-getrennte Positionen der Felder, deren alter beziehungsweise
// neuer Wert fehlt. Ohne Eintrag entfällt die Angabe.
function fehlstellenListe(felder, welcher) {
  const positionen = [];
  felder.forEach((feld, i) => {
    if (feld[welcher] === null) positionen.push(i + 1);
  });
  return positionen.length === 0 ? null : positionen.join(',');
}

function angabe(name, wert) {
  return `${name}="${wert}"`;
}

// Der Beleg in der Gestalt, die `serializeRecordBlock` erwartet.
function alsDatensatz(beleg) {
  const teile = [angabe(ATTR_KIND, beleg.art), angabe(ATTR_AT, beleg.zeitpunkt)];
  if (beleg.vorgang !== null) teile.push(angabe(ATTR_TX, beleg.vorgang));
  teile.push(angabe(ATTR_N, String(beleg.felder.length)));
  const noOld = fehlstellenListe(beleg.felder, 'alt');
  const noNew = fehlstellenListe(beleg.felder, 'neu');
  if (noOld !== null) teile.push(angabe(ATTR_NO_OLD, noOld));
  if (noNew !== null) teile.push(angabe(ATTR_NO_NEW, noNew));
  // 4T-001791: die drei Angaben des verdichteten Belegs, hinter den
  // Fehlstellen und vor dem Ungedeuteten.
  if (beleg.verdichtung) {
    teile.push(angabe(ATTR_SINCE, beleg.verdichtung.seit));
    teile.push(angabe(ATTR_COUNT, String(beleg.verdichtung.anzahl)));
    teile.push(angabe(ATTR_KINDS, beleg.verdichtung.arten.join(',')));
  }
  // Unbekannte Angaben reisen unangetastet mit, am Ende: Die Verdichtung aus
  // E10.9 bringt ihre eigenen mit, und eine ältere Programmfassung darf sie
  // nicht wegschreiben.
  if (beleg.attrsRest) teile.push(beleg.attrsRest);

  const cells = [];
  for (const feld of beleg.felder) {
    cells.push({ text: feld.name });
    cells.push({ text: feld.alt === null ? '' : feld.alt });
    cells.push({ text: feld.neu === null ? '' : feld.neu });
  }
  cells.push({ text: beleg.benutzer === null ? '' : beleg.benutzer });
  cells.push({ text: beleg.rechner === null ? '' : beleg.rechner });
  // 4T-001791: Ein gelesener Beleg trägt seinen Vorspann mit, also die Zeilen
  // zwischen Marker und erster Zelle, die das Lesen nicht deutet. Sie gehen
  // damit auch über einen Rundlauf nicht verloren.
  const vorspann = Array.isArray(beleg.vorspann) ? beleg.vorspann : [];
  return { id: beleg.id, attrsRest: teile.join(' '), vorspann, cells };
}

/**
 * Der Beleg als Rumpf eines Datensatz-Blocks, ohne führende und ohne
 * abschließende Leerzeile.
 *
 * @param {object} beleg
 * @returns {string}
 */
function serialisiereBeleg(beleg) {
  return serializeRecordBlock([alsDatensatz(beleg)], []);
}

/**
 * Der Text, der in einem Schreibaufruf an die Beleg-Datei angefügt wird (F4):
 * eine Leerzeile, der Beleg, ein abschließendes Zeilenende.
 *
 * @param {object} beleg
 * @returns {string}
 */
function anfuegeText(beleg) {
  return `${ANFUEGE_VORSPANN}${serialisiereBeleg(beleg)}\n`;
}

// --- Lesen ----------------------------------------------------------------------------

// Zerlegt den Rest hinter der Kennung in die gedeuteten Angaben und das, was
// dieses Modul nicht deutet. Der ungedeutete Teil bleibt als Text erhalten,
// damit eine ältere Programmfassung die Angaben einer neueren nicht verliert.
function leseAttribute(roh) {
  const text = typeof roh === 'string' ? roh : '';
  const werte = new Map();
  const verbraucht = [];
  ATTR_RE.lastIndex = 0;
  let treffer;
  while ((treffer = ATTR_RE.exec(text)) !== null) {
    const name = treffer[1];
    if (!GEDEUTETE_ATTRIBUTE.includes(name) || werte.has(name)) continue;
    werte.set(name, treffer[2]);
    verbraucht.push(treffer[0]);
  }
  let uebrig = text;
  for (const teil of verbraucht) uebrig = uebrig.replace(teil, ' ');
  uebrig = uebrig.replace(/\s+/g, ' ').trim();
  return { werte, rest: uebrig === '' ? null : uebrig };
}

// Die Positionen aus `noOld` beziehungsweise `noNew` als Menge, oder null, wenn
// die Angabe nicht auslegbar ist. Eine unauslegbare Fehlstellen-Angabe macht den
// Beleg beschädigt, statt sie zu übergehen: Wer sie übergeht, verwechselt den
// fehlenden Wert mit dem leeren, und genau diese Unterscheidung ist ihr Zweck.
function fehlstellen(roh, anzahl) {
  if (roh === undefined || roh === null || roh === '') return new Set();
  const menge = new Set();
  for (const teil of String(roh).split(',')) {
    const zahl = ganzeZahl(teil.trim());
    if (zahl === null || zahl < 1 || zahl > anzahl) return null;
    menge.add(zahl);
  }
  return menge;
}

function beschaedigt(roh, code) {
  return { ...roh, code, beschaedigt: true };
}

// 4T-001791: Die Angaben des verdichteten Belegs beim Lesen. Liefert null,
// sobald eine davon nicht auslegbar ist; der Aufrufer meldet den Beleg dann als
// beschädigt, statt eine Zahl zu raten. Die Prüfungen sind dieselben wie beim
// Bauen, hier nur ohne Wurf.
function leseVerdichtung(werte, zeitpunkt) {
  const anzahl = ganzeZahl(werte.has(ATTR_COUNT) ? werte.get(ATTR_COUNT) : null);
  if (anzahl === null || anzahl < 2) return null;
  const seit = werte.has(ATTR_SINCE) ? werte.get(ATTR_SINCE) : null;
  if (typeof seit !== 'string' || !ZEITPUNKT_RE.test(seit) || seit > zeitpunkt) return null;
  const arten = String(werte.has(ATTR_KINDS) ? werte.get(ATTR_KINDS) : '')
    .split(',')
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '');
  if (arten.length === 0) return null;
  if (arten.some((art) => art === ART_MERGED || !BELEG_ARTEN.includes(art))) return null;
  return { anzahl, seit, arten: [...new Set(arten)] };
}

// Ein gelesener Datensatz wird zum Beleg. Geprüft wird in fester Reihenfolge,
// und der ERSTE Befund steht; eine Liste aller Befunde eines beschädigten
// Belegs wäre eine Genauigkeit ohne Nutzen, weil die Folgeprüfungen auf der
// ersten aufbauen.
function belegAus(record) {
  const zellen = (record.cells || []).map((c) => String(c && c.text != null ? c.text : ''));
  const { werte, rest } = leseAttribute(record.attrsRest);
  const roh = {
    art: werte.has(ATTR_KIND) ? werte.get(ATTR_KIND) : null,
    id: record.id,
    zeitpunkt: werte.has(ATTR_AT) ? werte.get(ATTR_AT) : null,
    vorgang: werte.has(ATTR_TX) ? werte.get(ATTR_TX) : null,
    felder: [],
    benutzer: null,
    rechner: null,
    verdichtung: null,
    attrsRest: rest,
    // 4T-001791: Vorspann und Zeile reisen mit. Die Zeile ist der 0-basierte
    // Index des Belegs IM ÜBERGEBENEN TEXT, wie `parseRecordBlock` sie liefert;
    // die Verdichtung braucht sie, weil sie Zeilen-Bereiche ersetzt statt die
    // Datei neu zu schreiben.
    vorspann: Array.isArray(record.vorspann) ? record.vorspann : [],
    zeile: typeof record.zeile === 'number' ? record.zeile : null,
    beschaedigt: false,
    code: null,
    // Die rohen Zellen bleiben am beschädigten Beleg stehen, damit nichts
    // verloren geht; am vollständigen wären sie eine zweite Heimat derselben
    // Aussage.
    zellen,
  };

  if (!BELEG_ARTEN.includes(roh.art)) return beschaedigt(roh, BELEG_CODES.art);
  if (typeof roh.zeitpunkt !== 'string' || !ZEITPUNKT_RE.test(roh.zeitpunkt))
    return beschaedigt(roh, BELEG_CODES.zeitpunkt);
  if (roh.art !== ART_DEFINITION && roh.id === null) return beschaedigt(roh, BELEG_CODES.kennung);
  if (!OHNE_VORGANG.includes(roh.art) && (roh.vorgang === null || roh.vorgang === ''))
    return beschaedigt(roh, BELEG_CODES.vorgang);

  let verdichtung = null;
  if (roh.art === ART_MERGED) {
    verdichtung = leseVerdichtung(werte, roh.zeitpunkt);
    if (verdichtung === null) return beschaedigt(roh, BELEG_CODES.verdichtung);
  }

  const anzahl = ganzeZahl(werte.has(ATTR_N) ? werte.get(ATTR_N) : null);
  if (anzahl === null) return beschaedigt(roh, BELEG_CODES.anzahl);
  // Die Vollständigkeits-Probe aus F2: Ein Beleg ist genau dann vollständig,
  // wenn er `3 × n + 2` Zellen trägt. Sie ist der Grund, aus dem ein
  // abgerissener Beleg am Dateiende auffällt, ohne dass eine Prüfsumme nötig
  // wäre.
  if (zellen.length !== 3 * anzahl + 2) return beschaedigt(roh, BELEG_CODES.zellen);

  const ohneAlt = fehlstellen(werte.get(ATTR_NO_OLD), anzahl);
  const ohneNeu = fehlstellen(werte.get(ATTR_NO_NEW), anzahl);
  if (ohneAlt === null || ohneNeu === null) return beschaedigt(roh, BELEG_CODES.fehlstellen);

  const felder = [];
  for (let i = 0; i < anzahl; i++) {
    felder.push({
      name: zellen[3 * i],
      alt: ohneAlt.has(i + 1) ? null : zellen[3 * i + 1],
      neu: ohneNeu.has(i + 1) ? null : zellen[3 * i + 2],
    });
  }
  return {
    ...roh,
    felder,
    verdichtung,
    // Beschnitten, weil beide ihrer Natur nach einzeilig sind und die führende
    // Leerzeile des nächsten Anfüge-Vorgangs in der letzten Zelle landet (F3).
    benutzer: alsEinzeiler(zellen[3 * anzahl]),
    rechner: alsEinzeiler(zellen[3 * anzahl + 1]),
    zellen: null,
  };
}

/**
 * Liest eine Beleg-Datei.
 *
 * Wirft nie und verwirft nie: Ein Beleg, der die Vollständigkeits-Probe nicht
 * besteht oder dessen Pflicht-Angaben fehlen, steht als beschädigt in der Liste
 * und zusätzlich in den Befunden.
 *
 * @param {string} inhalt Der Text der Beleg-Datei.
 * @returns {{belege: object[], befunde: Array<{code: string, position: number}>}}
 */
function leseBelege(inhalt) {
  const { records } = parseRecordBlock(inhalt);
  const belege = [];
  const befunde = [];
  records.forEach((record, position) => {
    const beleg = belegAus(record);
    belege.push(beleg);
    if (beleg.beschaedigt) befunde.push({ code: beleg.code, position });
  });
  return { belege, befunde };
}

/**
 * Die Belege eines Datensatzes, in Datei-Reihenfolge.
 *
 * **Die Reihenfolge der Datei ist die maßgebliche zeitliche Reihenfolge** (F6),
 * weil sie die Reihenfolge des Anfügens ist und zwei Rechner-Uhren
 * auseinanderlaufen dürfen; `at` ist Auskunft und kein Sortier-Schlüssel.
 * Beide Schreibweisen der Kennung werden angenommen, wie im Datensatz-Block.
 *
 * @param {object[]} belege
 * @param {string} kennung Interne Kennung, aufgefüllt oder nicht.
 * @returns {object[]}
 */
function belegeZuDatensatz(belege, kennung) {
  const nummer = nummerAus(kennung);
  if (nummer === null) return [];
  const gesucht = kennungFuer(nummer);
  return (Array.isArray(belege) ? belege : []).filter((b) => b && b.id === gesucht);
}

/**
 * Auskunft über die Verkettung je Feld (F6, E10.4).
 *
 * Der neue Wert des einen Belegs ist der alte des nächsten, der dasselbe Feld
 * berührt. «Fehlt» und «leer» sind dabei verschiedene Werte. Ein Beleg der Art
 * `external` schließt definitionsgemäß an: Er hält die vorgefundene Abweichung
 * fest, und die Lücke davor ist sein Gegenstand und nicht ein zweiter Befund.
 * Ein verdichteter Beleg der Art `merged` wird dagegen wie ein gewöhnlicher
 * geprüft, und genau darin liegt die Zusage aus E10.10: Sein alter Wert muss an
 * den Beleg davor anschließen, sein neuer an den danach.
 * Beschädigte Belege bleiben außen vor, weil ihre Werte nicht gedeutet sind.
 * Ein beschädigter Beleg **unterbricht** die Kette, und zwar mit benanntem Grund:
 * Was er geändert hat, ist unbekannt. Gemeldet wird deshalb genau eine
 * Unterbrechung an seiner Position; danach setzt die Prüfung neu an, weil ein
 * Vergleich gegen den Stand davor eine zweite, unechte Wert-Lücke behauptete.
 * «Lückenlos» heißt damit, was das Wort sagt: kein unlesbarer und kein nicht
 * anschließender Beleg.
 *
 * @param {object[]} belege Belege in Datei-Reihenfolge.
 * @returns {{lueckenlos: boolean,
 *   luecken: Array<{grund: 'wert'|'beschaedigt', feld: string|null, position: number}>}}
 *   `grund` trennt den nicht anschließenden Wert vom unlesbaren Beleg; beim
 *   unlesbaren Beleg gibt es kein Feld.
 */
const LUECKE_WERT = 'wert';
const LUECKE_BESCHAEDIGT = 'beschaedigt';

function pruefeVerkettung(belege) {
  const liste = Array.isArray(belege) ? belege : [];
  const zuletzt = new Map();
  const luecken = [];
  liste.forEach((beleg, position) => {
    if (!beleg) return;
    if (beleg.beschaedigt) {
      luecken.push({ grund: LUECKE_BESCHAEDIGT, feld: null, position });
      zuletzt.clear();
      return;
    }
    for (const feld of beleg.felder || []) {
      if (
        zuletzt.has(feld.name) &&
        beleg.art !== ART_EXTERNAL &&
        zuletzt.get(feld.name) !== feld.alt
      )
        luecken.push({ grund: LUECKE_WERT, feld: feld.name, position });
      zuletzt.set(feld.name, feld.neu);
    }
  });
  return { lueckenlos: luecken.length === 0, luecken };
}

module.exports = {
  ART_CREATE,
  ART_UPDATE,
  ART_DELETE,
  ART_DEFINITION,
  ART_EXTERNAL,
  ART_MERGED,
  BELEG_ARTEN,
  BELEG_CODES,
  ATTR_ID,
  ATTR_KIND,
  ATTR_AT,
  ATTR_TX,
  ATTR_N,
  ATTR_NO_OLD,
  ATTR_NO_NEW,
  ATTR_SINCE,
  ATTR_COUNT,
  ATTR_KINDS,
  ATTR_REIHENFOLGE,
  ZEITPUNKT_RE,
  ANFUEGE_VORSPANN,
  LUECKE_WERT,
  LUECKE_BESCHAEDIGT,
  baueBeleg,
  zeitpunktAus,
  serialisiereBeleg,
  anfuegeText,
  leseBelege,
  belegeZuDatensatz,
  pruefeVerkettung,
};
