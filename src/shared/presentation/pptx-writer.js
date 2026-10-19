// 4T-002293 (Epic 3E-000349): PowerPoint-Container der Stufe 3 — ein
// Foliensatz als `.pptx`, je Folie ein Bild in voller Folien-Größe und die
// Sprecher-Notizen im Notizen-Feld (Entscheidung C1 des Product Owners vom
// 2026-10-17: Eigenbau ohne neue Abhängigkeit, gekennzeichnete Abweichung vom
// Standard pptxgenjs; Begründung in 4T-002293 und 4T-002290).
//
// Dieses Modul prüft die Eingabe, setzt die Teile aus den Vorlagen in
// pptx-templates.js zusammen und gibt sie dem ZIP-Schreiber. Teile und
// Beziehungen folgen der Struktur von pptxgenjs (Vorbild Marp):
//
// - Paket: `[Content_Types].xml` (als erster Eintrag), `_rels/.rels`,
//   `docProps/core.xml`, `docProps/app.xml`;
// - Präsentation: `ppt/presentation.xml` samt Beziehungen, `presProps`,
//   `viewProps`, `tableStyles`, ein Folien-Master mit einem leeren Layout und
//   ein Notizen-Master, **jeder mit seinem eigenen Theme** (`theme1.xml` und
//   `theme2.xml`, inhaltsgleich). PowerPoint 16 weist ein Theme, das zwei
//   Master teilen, als beschädigt ab (HRESULT 0x80070570) und öffnet die Datei
//   nur mit Reparatur, die ein zweites Theme anlegt; so schreibt PowerPoint
//   die Datei auch selbst (Befund in 4T-002293);
// - je Folie: `ppt/slides/slideN.xml` mit dem Bild `ppt/media/imageN.png` und
//   `ppt/notesSlides/notesSlideN.xml`. Auch eine Folie ohne Notizen bekommt
//   ihre Notizen-Folie, mit leerem Platzhalter `body` (AK4 des Tasks), damit
//   jede Folie dieselbe Struktur hat, wie PowerPoint sie selbst schreibt.
//
// **Größen** (Ausführungs-Entscheidung vom 2026-10-17, 4T-002290): Folie
// 16:9 → 12192000 × 6858000 EMU, 4:3 → 9144000 × 6858000 EMU (Pixel der
// Entwurfsgröße durch 96 in Zoll, wie Marp, zugleich die Vorgaben von
// PowerPoint); Notizen-Seite 6858000 × 9144000 EMU in beiden Formaten.
//
// **Notizen:** Klartext, jede Zeile ein Absatz, mehrere Notizen einer Folie
// durch einen leeren Absatz getrennt. Markdown wird nicht gedeutet, weil das
// Notizen-Feld reiner Text ist (so auch Marp).
//
// **Text-Sicherheit:** eigene Maskierung `xmlText` statt `escapeHtml` aus
// src/shared/markdown/slug.js. Jene maskiert kein `'` und lässt Steuerzeichen
// stehen, die in XML 1.0 unzulässig sind; ein solches Zeichen in einer Notiz
// machte die ganze Datei unlesbar.
//
// Prozessneutral: nur das Schwester-Modul und der ZIP-Schreiber, kein Node-
// Modul zur Lade-Zeit; die Kompression wird übergeben (`deflate`).
'use strict';

const { erstelleZip } = require('./zip-writer');
const V = require('./pptx-templates');

/** Folien-Größe je Format in EMU (914400 je Zoll). */
const FOLIEN_FORMATE = Object.freeze({
  '16:9': Object.freeze({ breite: 12192000, hoehe: 6858000 }),
  '4:3': Object.freeze({ breite: 9144000, hoehe: 6858000 }),
});

/** Notizen-Seite: Hochformat 7,5 × 10 Zoll, die Vorgabe von PowerPoint. */
const NOTIZEN_GROESSE = Object.freeze({ breite: 6858000, hoehe: 9144000 });

const PNG_SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** In XML 1.0 unzulässige Zeichen samt einzelner Ersatz-Hälften (Surrogate). */
const UNZULAESSIG =
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sind genau das Ziel der Bereinigung.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Maskiert Text für Inhalt und Attribute eines XML-Teils und entfernt die in
 * XML 1.0 unzulässigen Zeichen.
 *
 * @param {string} text
 * @returns {string}
 */
function xmlText(text) {
  return text
    .replace(UNZULAESSIG, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Die Absätze des Notizen-Felds einer Folie, maskiert; `''` ist ein leerer Absatz.
 *
 * @param {string[]} notizen
 * @returns {string[]}
 */
function notizAbsaetze(notizen) {
  const absaetze = [];
  notizen.forEach((notiz, i) => {
    if (i > 0) absaetze.push('');
    for (const zeile of notiz.replace(/\r\n?/g, '\n').split('\n')) absaetze.push(xmlText(zeile));
  });
  return absaetze;
}

function istPng(bild) {
  return (
    bild instanceof Uint8Array &&
    bild.length > PNG_SIGNATUR.length &&
    PNG_SIGNATUR.every((byte, i) => bild[i] === byte)
  );
}

/**
 * Prüft die Eingabe laut, statt auf Vorgaben zurückzufallen.
 *
 * @returns {{ breite: number, hoehe: number }} die Folien-Größe.
 */
function pruefeEingabe({ folien, format, titel, erzeuger, erstellt, deflate, bildName }) {
  const groesse = Object.prototype.hasOwnProperty.call(FOLIEN_FORMATE, format)
    ? FOLIEN_FORMATE[format]
    : null;
  if (!groesse) throw new TypeError(`PowerPoint-Datei: Format ${String(format)} unbekannt`);
  if (!Array.isArray(folien) || folien.length === 0) {
    throw new TypeError('PowerPoint-Datei: keine Folien');
  }
  folien.forEach((folie, i) => {
    const nr = i + 1;
    if (!folie || typeof folie !== 'object')
      throw new TypeError(`PowerPoint-Datei: Folie ${nr} fehlt`);
    if (!istPng(folie.bild))
      throw new TypeError(`PowerPoint-Datei: Bild der Folie ${nr} ist kein PNG`);
    if (!Array.isArray(folie.notizen)) {
      throw new TypeError(`PowerPoint-Datei: Notizen der Folie ${nr} sind keine Liste`);
    }
    folie.notizen.forEach((notiz, j) => {
      if (typeof notiz !== 'string') {
        throw new TypeError(`PowerPoint-Datei: Notiz ${j + 1} der Folie ${nr} ist kein Text`);
      }
    });
  });
  if (typeof titel !== 'string') throw new TypeError('PowerPoint-Datei: Titel ist kein Text');
  if (typeof erzeuger !== 'string' || erzeuger === '') {
    throw new TypeError('PowerPoint-Datei: Erzeuger fehlt');
  }
  if (!(erstellt instanceof Date) || Number.isNaN(erstellt.getTime())) {
    throw new TypeError('PowerPoint-Datei: Erstellzeit ist kein gültiges Datum');
  }
  if (typeof deflate !== 'function') throw new TypeError('PowerPoint-Datei: deflate fehlt');
  if (typeof bildName !== 'string' || bildName === '') {
    throw new TypeError('PowerPoint-Datei: Bild-Name ist kein Text');
  }
  return groesse;
}

/**
 * Lage der beiden Platzhalter auf der Notizen-Seite: Vorschau im
 * Seitenverhältnis der Folie, mittig, darunter der Notizen-Text.
 */
function notizenLagen(groesse) {
  const vorschauHoehe = 3086100;
  const vorschauBreite = Math.round((vorschauHoehe * groesse.breite) / groesse.hoehe);
  return {
    vorschau: {
      x: Math.round((NOTIZEN_GROESSE.breite - vorschauBreite) / 2),
      y: 1143000,
      cx: vorschauBreite,
      cy: vorschauHoehe,
    },
    text: { x: 685800, y: 4400550, cx: 5486400, cy: 3600450 },
  };
}

/** W3CDTF ohne Bruchteile der Sekunde, in UTC. */
function w3cdtf(zeitpunkt) {
  return zeitpunkt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Erzeugt die Teile des Containers in Schreib-Reihenfolge.
 *
 * @returns {Array<{ name: string, daten: Uint8Array|string }>}
 */
function bauteTeile(eingabe, groesse) {
  const { folien, titel, erzeuger, erstellt, bildName } = eingabe;
  const n = folien.length;
  const teile = [];
  const typen = [];
  const teil = (name, daten, typ) => {
    teile.push({ name, daten });
    if (typ) typen.push({ teil: name, typ });
  };
  const rel = (id, typ, ziel) => ({ id, typ, ziel });

  teil(
    '_rels/.rels',
    V.beziehungenXml([
      rel('rId1', V.REL.officeDocument, 'ppt/presentation.xml'),
      rel('rId2', V.REL.coreProperties, 'docProps/core.xml'),
      rel('rId3', V.REL.extendedProperties, 'docProps/app.xml'),
    ]),
  );
  const erzeugerXml = xmlText(erzeuger);
  teil(
    'docProps/core.xml',
    V.kernEigenschaftenXml({
      titel: xmlText(titel),
      erzeuger: erzeugerXml,
      zeit: w3cdtf(erstellt),
    }),
    V.INHALTSTYP.core,
  );
  teil(
    'docProps/app.xml',
    V.anwendungsEigenschaftenXml({
      erzeuger: erzeugerXml,
      folien: n,
      notizen: folien.filter((f) => f.notizen.length > 0).length,
    }),
    V.INHALTSTYP.app,
  );

  const folienIds = folien.map((_f, i) => `rId${i + 3}`);
  teil(
    'ppt/presentation.xml',
    V.praesentationXml({
      folienIds,
      breite: groesse.breite,
      hoehe: groesse.hoehe,
      notizBreite: NOTIZEN_GROESSE.breite,
      notizHoehe: NOTIZEN_GROESSE.hoehe,
    }),
    V.INHALTSTYP.presentation,
  );
  teil(
    'ppt/_rels/presentation.xml.rels',
    V.beziehungenXml([
      rel('rId1', V.REL.slideMaster, 'slideMasters/slideMaster1.xml'),
      rel('rId2', V.REL.notesMaster, 'notesMasters/notesMaster1.xml'),
      ...folienIds.map((id, i) => rel(id, V.REL.slide, `slides/slide${i + 1}.xml`)),
      rel(`rId${n + 3}`, V.REL.presProps, 'presProps.xml'),
      rel(`rId${n + 4}`, V.REL.viewProps, 'viewProps.xml'),
      rel(`rId${n + 5}`, V.REL.theme, 'theme/theme1.xml'),
      rel(`rId${n + 6}`, V.REL.tableStyles, 'tableStyles.xml'),
    ]),
  );
  teil('ppt/presProps.xml', V.PRAESENTATIONS_EIGENSCHAFTEN_XML, V.INHALTSTYP.presProps);
  teil('ppt/viewProps.xml', V.ANSICHTS_EIGENSCHAFTEN_XML, V.INHALTSTYP.viewProps);
  teil('ppt/tableStyles.xml', V.TABELLEN_STILE_XML, V.INHALTSTYP.tableStyles);
  teil('ppt/theme/theme1.xml', V.THEME_XML, V.INHALTSTYP.theme);
  teil('ppt/slideMasters/slideMaster1.xml', V.FOLIEN_MASTER_XML, V.INHALTSTYP.slideMaster);
  teil(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    V.beziehungenXml([
      rel('rId1', V.REL.slideLayout, '../slideLayouts/slideLayout1.xml'),
      rel('rId2', V.REL.theme, '../theme/theme1.xml'),
    ]),
  );
  teil('ppt/slideLayouts/slideLayout1.xml', V.FOLIEN_LAYOUT_XML, V.INHALTSTYP.slideLayout);
  teil(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    V.beziehungenXml([rel('rId1', V.REL.slideMaster, '../slideMasters/slideMaster1.xml')]),
  );
  // Eigenes Theme des Notizen-Masters: ein geteiltes Theme gilt PowerPoint als beschädigt.
  teil('ppt/theme/theme2.xml', V.THEME_XML, V.INHALTSTYP.theme);
  teil(
    'ppt/notesMasters/notesMaster1.xml',
    V.notizenMasterXml(notizenLagen(groesse)),
    V.INHALTSTYP.notesMaster,
  );
  teil(
    'ppt/notesMasters/_rels/notesMaster1.xml.rels',
    V.beziehungenXml([rel('rId1', V.REL.theme, '../theme/theme2.xml')]),
  );

  const name = xmlText(bildName);
  folien.forEach((folie, i) => {
    const nr = i + 1;
    teil(
      `ppt/slides/slide${nr}.xml`,
      V.folieXml({ name: `${name} ${nr}`, breite: groesse.breite, hoehe: groesse.hoehe }),
      V.INHALTSTYP.slide,
    );
    teil(
      `ppt/slides/_rels/slide${nr}.xml.rels`,
      V.beziehungenXml([
        rel('rId1', V.REL.slideLayout, '../slideLayouts/slideLayout1.xml'),
        rel('rId2', V.REL.image, `../media/image${nr}.png`),
        rel('rId3', V.REL.notesSlide, `../notesSlides/notesSlide${nr}.xml`),
      ]),
    );
    teil(
      `ppt/notesSlides/notesSlide${nr}.xml`,
      V.notizenFolieXml(notizAbsaetze(folie.notizen)),
      V.INHALTSTYP.notesSlide,
    );
    teil(
      `ppt/notesSlides/_rels/notesSlide${nr}.xml.rels`,
      V.beziehungenXml([
        rel('rId1', V.REL.notesMaster, '../notesMasters/notesMaster1.xml'),
        rel('rId2', V.REL.slide, `../slides/slide${nr}.xml`),
      ]),
    );
    teil(`ppt/media/image${nr}.png`, folie.bild);
  });

  // Die Office-Programme erwarten die Inhaltstypen als ersten Eintrag.
  return [{ name: '[Content_Types].xml', daten: V.inhaltstypenXml(typen) }, ...teile];
}

/**
 * Erzeugt eine PowerPoint-Datei aus Folien-Bildern und Sprecher-Notizen.
 *
 * @param {object} eingabe
 * @param {Array<{ bild: Uint8Array, notizen: string[] }>} eingabe.folien
 *   je Folie ein PNG und ihre Notizen als Klartext (leere Liste: keine).
 * @param {'16:9'|'4:3'} eingabe.format
 * @param {string} eingabe.titel Dokument-Titel (darf leer sein).
 * @param {string} eingabe.erzeuger etwa «EM4me 1.150.0»: Erzeuger, letzter
 *   Bearbeiter und Anwendung der Metadaten.
 * @param {Date} eingabe.erstellt Erstellzeit, zugleich Zeitstempel der ZIP-Einträge.
 * @param {(daten: Uint8Array) => Uint8Array} eingabe.deflate rohes Deflate
 *   (im Hauptprozess `zlib.deflateRawSync`).
 * @param {string} [eingabe.bildName] Namens-Stamm des Bilds je Folie in der
 *   Auswahl-Liste von PowerPoint, Vorgabe «Folie»; der Aufrufer reicht ihn
 *   übersetzt herein.
 * @returns {Uint8Array} der Datei-Inhalt.
 * @throws {TypeError} bei ungültiger Eingabe; Grenz-Fehler des ZIP-Schreibers laufen durch.
 */
function erstellePptx(eingabe) {
  const roh = eingabe || {};
  const vollstaendig = { ...roh, bildName: roh.bildName === undefined ? 'Folie' : roh.bildName };
  const groesse = pruefeEingabe(vollstaendig);
  return erstelleZip(bauteTeile(vollstaendig, groesse), {
    deflate: vollstaendig.deflate,
    zeitpunkt: vollstaendig.erstellt,
  });
}

module.exports = { erstellePptx, xmlText, FOLIEN_FORMATE };
