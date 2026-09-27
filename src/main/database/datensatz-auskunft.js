// 4T-001938 (Epic 3E-000257, Bauplan B1, B3; E7.2, E22.7): Die Auskunft über
// EINEN Datensatz für die Einzel-Maske — Definition, Zellen, Anzeige-Form,
// Erwartung für den nächsten Auftrag, Bearbeitbarkeit und der erzeugte
// Masken-Körper, alles aus einem frisch gelesenen Stand.
//
// **Frisch aus der Datei, nicht aus dem Index.** Der Index führt bewusst keine
// Zellwerte (`datensatz-erfassung.js`), und die Maske braucht sie. Gelesen wird
// über denselben Weg wie die Schreib-Schnittstelle (`record-auftrag-bestand.js`),
// also mit allen Segmenten einer geteilten Tabelle. Daraus folgt die Zusage, die
// den Weg trägt: **Anzeige und Erwartung stammen aus demselben Stand.** Die
// Erwartung ist der Stand, den der Speicher-Auftrag als zuletzt gelesen
// mitschickt; stammte sie aus einer anderen Lesung als die Anzeige, meldete der
// Stand-Vergleich eine Fremd-Änderung, die der Anwender nie gesehen hat.
//
// **Die Auslegung der Zell-Texte ist die des Schreibwegs** (`werteDes`): Der
// Trennabstand hinter dem letzten Datensatz einer Datei steht im Text seiner
// letzten Zelle und gehört nicht zu ihrem Wert (Begründung bei `zellTexte` in
// `record-write.js`). Die Zellen der Anzeige tragen deshalb denselben Text wie
// die Erwartung; sonst gälte ein unverändert gespeicherter letzter Wert als
// geändert.
//
// **Die Bearbeitbarkeit wird hier ausgewertet**, mit derselben Auswertung wie im
// Regel-Werk (`record-regel-bearbeitbar.js`): Kontext aus den vorgefundenen
// Texten, `wertePruefregel` aus dem prozess-neutralen Auswerter. Der Renderer
// rechnet damit keinen Ausdruck der Abfrage-Sprache, und die Maske sagt beim
// Öffnen dasselbe, was die Schnittstelle beim Speichern sagen würde.
//
// **Nicht hier:** Sperre, Vorgang, Beleg und jedes Schreiben, dazu die Prüfung
// der Anfrage gegen die Bereichs-Grenze, die der Kanal vor dem Aufruf leistet.
// Electron-frei; der Dateizugriff kommt herein wie bei den Regel-Modulen.
'use strict';

const { zellenNachFeldern } = require('../../shared/database/record-block.js');
const {
  anzeigeSpalte,
  kennungFuer,
  nummerAus,
} = require('../../shared/database/record-identity.js');
const { baueRegelKontext, wertePruefregel } = require('../../shared/database/record-check-eval.js');
const { datensatzRumpf } = require('../../shared/database/record-segment.js');
const {
  erzeugeMaskenKoerper,
  zerlegeMaskenKoerper,
} = require('../../shared/database/form-body.js');
const { LAGEN } = require('./record-auftrag-pruefung.js');
const { werteDes, zellText } = require('./record-auftrag-plan.js');
const {
  loeseTabelle,
  leseTabellenBestand,
  dateiFuerKennung,
} = require('./record-auftrag-bestand.js');
const { tabellenName, geltendeMaske } = require('./table-catalog.js');
// 4T-001943: Der Körper einer Masken-Datei ohne ihr Frontmatter.
const { extractFrontmatter } = require('../../shared/markdown/frontmatter.js');

function fehler(code) {
  return { status: 'error', code };
}

// Die Zell-Texte des Datensatzes in Feld-Reihenfolge; eine fehlende Zelle ist
// leer (dieselbe Regel wie `vorgefundeneTexte` im Regel-Werk).
function texteDes(record, fields) {
  const texte = werteDes(record);
  return fields.map((_feld, i) => zellText(texte, i));
}

// Die Zellen der Anzeige: Wert, Fehler und «fehlt» aus der positionsbasierten
// Zuordnung, der Text aus der Auslegung des Schreibwegs. Ein Text-Wert verliert
// mit dem Trennabstand auch dessen Zeilenumbrüche, damit Wert und Text
// dieselbe Aussage machen.
function zellenDes(record, fields, texte) {
  return zellenNachFeldern(record, fields).map((zelle, i) => {
    if (zelle.fehlt || zelle.text === texte[i]) return zelle;
    const value = typeof zelle.value === 'string' ? zelle.value.replace(/\n+$/, '') : zelle.value;
    return { ...zelle, text: texte[i], value };
  });
}

// Die Anzeige des Datensatzes: seine Kennung, dazu in Klammern der Text seiner
// Anzeige-Spalte, wenn es einen gibt. Dieselbe Konvention wie im Regel-Werk
// (Lösch-Schutz, Schlüssel-Regel, Bearbeitbarkeit): Eine Spalte aus Leerraum
// benennt nichts.
function anzeigeVon(fields, spalte, texte, id) {
  if (spalte === null) return id;
  const index = fields.findIndex((feld) => feld.name.toLowerCase() === spalte.toLowerCase());
  const text = index < 0 ? '' : texte[index];
  return text.trim() === '' ? id : `${id} (${text})`;
}

// Die Bearbeitbarkeit des vorgefundenen Zustands (E22.7), oder null ohne
// Bedingung. Die Meldung reist unaufgelöst; ohne eigenen Text bleibt sie leer
// wie im Regel-Werk, weil der Anwender-Text die Bedingung selbst nennt.
function bearbeitbarkeit(definition, fields, texte) {
  if (!definition.editable) return null;
  const kontext = baueRegelKontext(fields, texte);
  const geprueft = wertePruefregel(definition.editable, { kontext });
  const meldung =
    geprueft.message === null || geprueft.message === undefined ? '' : geprueft.message;
  return { erfuellt: geprueft.erfuellt, grund: geprueft.grund, meldung };
}

// Die Zeile der Datei, an der der Datensatz beginnt, gezählt ab 1. Der
// Datensatz-Block kennt nur die Zeile innerhalb seines Rumpfs; der Abstand des
// Rumpfs vom Datei-Anfang kommt aus derselben Rumpf-Erkennung, die der Bestand
// beim Lesen benutzt hat.
function zeileIn(datei, record) {
  const rumpf = datensatzRumpf(datei.text);
  if (!rumpf || typeof record.zeile !== 'number') return null;
  return rumpf.vonZeile + record.zeile + 1;
}

// Die Erwartung für den nächsten Auftrag: jedes Feld mit seinem vorgefundenen
// Text, unter dem Namen der Definition. `erwarteteTexte` im Plan-Modul macht
// daraus wieder genau diese Zell-Liste.
function erwartungAus(fields, texte) {
  const erwartet = {};
  fields.forEach((feld, i) => {
    erwartet[feld.name] = texte[i];
  });
  return erwartet;
}

// 4T-001943 (Bauplan B3): Der Körper der Maske — aus der geltenden
// Masken-Datei, sonst der erzeugte. Die Datei wird frisch gelesen, damit eine
// Änderung beim nächsten Öffnen wirkt; welche Datei gilt, sagt der Katalog.
// Lässt sie sich nicht lesen (eben gelöscht, gesperrt), gilt wieder die
// erzeugte Maske, statt dass die Maske ausfiele. Die Zeile eines Hinweises
// zählt ab dem Anfang der DATEI, weil der Anwender sie dort sucht.
async function koerperDer({ fsp, sicht, cache, tabellenPfad, fields, erzeugt }) {
  const maske = sicht ? await geltendeMaske({ sicht, fsp, cache, tabellenPfad }) : null;
  if (maske !== null) {
    let roh;
    try {
      roh = String(await fsp.readFile(maske, 'utf8'));
    } catch {
      roh = null;
    }
    if (roh !== null) {
      const fm = extractFrontmatter(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh);
      const versatz = fm.raw === null ? 0 : fm.raw.split('\n').length - 1;
      const zerlegt = zerlegeMaskenKoerper(fm.body, fields);
      const hints = zerlegt.hints.map((h) => ({ ...h, zeile: h.zeile + versatz }));
      return { quelle: 'datei', pfad: maske, text: fm.body, segmente: zerlegt.segmente, hints };
    }
  }
  return { quelle: 'erzeugt', pfad: null, text: erzeugt, ...zerlegeMaskenKoerper(erzeugt, fields) };
}

/**
 * Liest einen Datensatz einer Tabelle frisch aus der Datei, samt allem, was die
 * Einzel-Maske zum Anzeigen und zum Speichern braucht.
 *
 * @param {object} p Parameter.
 * @param {object} p.fsp Dateizugriff (`readFile`); **Pflicht**.
 * @param {string} p.wurzel Wurzel des Bereichs.
 * @param {string} p.tabelle Pfad der Kopf-Datei, relativ zur Bereichs-Wurzel.
 * @param {string|null} p.kennung Interne Kennung, oder null für eine Neuanlage.
 * @param {string|null} [p.sprache] Aktive Sprache des Anwenders.
 * @param {string|null} [p.rueckfallSprache] Wirksame Rückfall-Sprache der Datenbank.
 * @param {object|null} [p.sicht] Index-Sicht des Bereichs (4T-001943); ohne sie
 *   gibt es keine Masken-Datei, und der Körper ist der erzeugte.
 * @param {Map} [p.cache] Zwischenspeicher des Katalogs für die Masken-Zuordnung.
 * @returns {Promise<object>} `{status: 'ready', tabelle, pfad, kennung, datei, zeile,
 *   fields, key, display, anzeigeSpalte, anzeige, editable, zellen, erwartet, koerper}`
 *   bzw. `{status: 'error', code}` mit einem Code aus `LAGEN`. `koerper` ist
 *   `{quelle: 'erzeugt'|'datei', pfad, text, segmente, hints}` (4T-001943).
 */
async function liesDatensatz({
  fsp,
  wurzel,
  tabelle,
  kennung,
  sprache = null,
  rueckfallSprache = null,
  sicht = null,
  cache,
}) {
  if (!fsp || typeof fsp.readFile !== 'function')
    throw new TypeError('liesDatensatz: fsp ist Pflicht und muss readFile tragen');
  if (typeof wurzel !== 'string' || wurzel === '') return fehler(LAGEN.wurzelFehlt);
  try {
    const aufgeloest = loeseTabelle(wurzel, tabelle);
    if (!aufgeloest.ok) return fehler(aufgeloest.lage.code);
    const bestand = await leseTabellenBestand(fsp, aufgeloest.pfad, tabelle);
    if (!bestand.ok) return fehler(bestand.lage.code);

    const { definition, fields } = bestand;
    const spalte = anzeigeSpalte(definition);
    const koerperText = erzeugeMaskenKoerper(definition, {
      tabellenName: tabellenName(aufgeloest.pfad),
      sprache,
      rueckfallSprache,
    });
    const allgemein = {
      status: 'ready',
      tabelle,
      pfad: aufgeloest.pfad,
      fields,
      key: definition.key || null,
      display: definition.display || null,
      anzeigeSpalte: spalte,
      koerper: await koerperDer({
        fsp,
        sicht,
        cache,
        tabellenPfad: aufgeloest.pfad,
        fields,
        erzeugt: koerperText,
      }),
    };

    // Die Neuanlage: Es gibt keinen vorgefundenen Zustand, also weder eine
    // Erwartung noch eine Bedingung, die ihn sperren könnte (E22.7 gilt für
    // Ändern und Löschen). Die Kennung zieht der Aufrufer über «Neuanlage
    // eröffnen»; hier steht sie noch nicht fest.
    if (kennung === null) {
      return {
        ...allgemein,
        kennung: null,
        datei: null,
        zeile: null,
        anzeige: null,
        editable: null,
        zellen: zellenNachFeldern(null, fields).map((zelle) => ({ ...zelle, fehlt: false })),
        erwartet: {},
      };
    }

    const id = kennungFuer(nummerAus(kennung));
    if (id === null) return fehler(LAGEN.datensatzUnbekannt);
    const fundort = dateiFuerKennung(bestand, id);
    if (!fundort.ok) return fehler(fundort.code);
    const datei = bestand.dateien.find((d) => d.pfad === fundort.pfad);
    const record = datei.records.get(id);
    const texte = texteDes(record, fields);
    return {
      ...allgemein,
      kennung: id,
      datei: datei.pfad,
      zeile: zeileIn(datei, record),
      anzeige: anzeigeVon(fields, spalte, texte, id),
      editable: bearbeitbarkeit(definition, fields, texte),
      zellen: zellenDes(record, fields, texte),
      erwartet: erwartungAus(fields, texte),
    };
  } catch {
    // Ein Bruch, den keine benannte Lage beschreibt, bekommt deren eigenen
    // Code, statt über die Prozess-Grenze geworfen zu werden.
    return fehler(LAGEN.unerwartet);
  }
}

module.exports = { liesDatensatz };
