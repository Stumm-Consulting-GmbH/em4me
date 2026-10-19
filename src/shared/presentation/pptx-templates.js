// 4T-002293 (Epic 3E-000349): XML-Vorlagen des PowerPoint-Containers der
// Stufe 3. Schwester-Modul von pptx-writer.js, das die Teile zusammensetzt;
// hier stehen allein die Texte der Teile nach Office Open XML (ECMA-376),
// als Konstanten und Vorlagen-Funktionen mit wenigen Einsetzstellen.
//
// Vorbild für Auswahl der Teile und Beziehungen ist die Ausgabe der
// Bibliothek pptxgenjs, mit der das Vorbild Marp seine PowerPoint-Dateien
// schreibt (Entscheidung C1 vom 2026-10-17 in 4T-002290); übernommen ist die
// Struktur, kein Code. Abweichend davon steht je Teil genau ein Inhaltstyp.
//
// Jeder eingesetzte Text ist beim Aufruf bereits maskiert (`xmlText` in
// pptx-writer.js); Zahlen kommen geprüft herein. Prozessneutral, ohne
// `require`.
'use strict';

const XML_KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Namensräume nach ECMA-376, Teil 1 (Transitional) und Teil 2 (OPC). */
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_CP = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
const NS_EP = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';
const NS_VT = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';

/** Beziehungs-Typen; `officeDocument` und `extended-properties` liegen unter NS_R. */
const REL = {
  officeDocument: `${NS_R}/officeDocument`,
  coreProperties: `${NS_REL}/metadata/core-properties`,
  extendedProperties: `${NS_R}/extended-properties`,
  slideMaster: `${NS_R}/slideMaster`,
  notesMaster: `${NS_R}/notesMaster`,
  slide: `${NS_R}/slide`,
  slideLayout: `${NS_R}/slideLayout`,
  notesSlide: `${NS_R}/notesSlide`,
  image: `${NS_R}/image`,
  theme: `${NS_R}/theme`,
  presProps: `${NS_R}/presProps`,
  viewProps: `${NS_R}/viewProps`,
  tableStyles: `${NS_R}/tableStyles`,
};

const CT_PML = 'application/vnd.openxmlformats-officedocument.presentationml';

/** Inhaltstypen der Überschreibungen in `[Content_Types].xml`. */
const INHALTSTYP = {
  presentation: `${CT_PML}.presentation.main+xml`,
  slideMaster: `${CT_PML}.slideMaster+xml`,
  slideLayout: `${CT_PML}.slideLayout+xml`,
  slide: `${CT_PML}.slide+xml`,
  notesSlide: `${CT_PML}.notesSlide+xml`,
  notesMaster: `${CT_PML}.notesMaster+xml`,
  presProps: `${CT_PML}.presProps+xml`,
  viewProps: `${CT_PML}.viewProps+xml`,
  tableStyles: `${CT_PML}.tableStyles+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};

/** Vorgaben je Endung: Beziehungen, sonstiges XML, Bilder. */
const VORGABEN = [
  ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
  ['xml', 'application/xml'],
  ['png', 'image/png'],
];

const NS_PML_ALLE = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;

/** Kopf jedes Form-Baums: Gruppe ohne eigene Lage (ECMA-376, 19.3.1.45). */
const BAUM_KOPF =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** Farbzuordnung des Masters auf das Theme, die Office-Vorgabe. */
const FARB_ZUORDNUNG =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
  'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
  'hlink="hlink" folHlink="folHlink"';

/** Text-Grundform einer Ebene; die Folien tragen keinen Text, die Notizen schon. */
function ebene(groesse) {
  return (
    `<a:lvl1pPr><a:defRPr sz="${groesse}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
    '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>' +
    '</a:defRPr></a:lvl1pPr>'
  );
}

/**
 * @param {Array<{ id: string, typ: string, ziel: string }>} beziehungen
 * @returns {string} ein Beziehungs-Teil (`*.rels`).
 */
function beziehungenXml(beziehungen) {
  const zeilen = beziehungen.map(
    (b) => `<Relationship Id="${b.id}" Type="${b.typ}" Target="${b.ziel}"/>`,
  );
  return `${XML_KOPF}<Relationships xmlns="${NS_REL}">${zeilen.join('')}</Relationships>`;
}

/**
 * @param {Array<{ teil: string, typ: string }>} ueberschreibungen
 *   `teil` als Paket-Pfad ohne führenden Schrägstrich.
 * @returns {string} `[Content_Types].xml`.
 */
function inhaltstypenXml(ueberschreibungen) {
  const vorgaben = VORGABEN.map(
    ([endung, typ]) => `<Default Extension="${endung}" ContentType="${typ}"/>`,
  );
  const einzeln = ueberschreibungen.map(
    (u) => `<Override PartName="/${u.teil}" ContentType="${u.typ}"/>`,
  );
  return `${XML_KOPF}<Types xmlns="${NS_CT}">${vorgaben.join('')}${einzeln.join('')}</Types>`;
}

/**
 * @param {{ titel: string, erzeuger: string, zeit: string }} m maskiert, `zeit` als W3CDTF.
 * @returns {string} `docProps/core.xml`.
 */
function kernEigenschaftenXml(m) {
  return (
    `${XML_KOPF}<cp:coreProperties xmlns:cp="${NS_CP}" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${m.titel}</dc:title><dc:creator>${m.erzeuger}</dc:creator>` +
    `<cp:lastModifiedBy>${m.erzeuger}</cp:lastModifiedBy><cp:revision>1</cp:revision>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${m.zeit}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${m.zeit}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

/**
 * @param {{ erzeuger: string, folien: number, notizen: number }} m
 * @returns {string} `docProps/app.xml`.
 */
function anwendungsEigenschaftenXml(m) {
  return (
    `${XML_KOPF}<Properties xmlns="${NS_EP}" xmlns:vt="${NS_VT}">` +
    `<Application>${m.erzeuger}</Application><Slides>${m.folien}</Slides>` +
    `<Notes>${m.notizen}</Notes></Properties>`
  );
}

/**
 * @param {{ folienIds: string[], breite: number, hoehe: number, notizBreite: number, notizHoehe: number }} m
 *   `folienIds` sind die Beziehungs-Kennungen der Folien in Folien-Reihenfolge.
 * @returns {string} `ppt/presentation.xml`.
 */
function praesentationXml(m) {
  // Folien-Kennungen ab 256 (ECMA-376, 19.2.1.33: 256 bis 2147483647).
  const folien = m.folienIds.map((rid, i) => `<p:sldId id="${256 + i}" r:id="${rid}"/>`);
  return (
    `${XML_KOPF}<p:presentation ${NS_PML_ALLE} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    '<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>' +
    `<p:sldIdLst>${folien.join('')}</p:sldIdLst>` +
    `<p:sldSz cx="${m.breite}" cy="${m.hoehe}"/>` +
    `<p:notesSz cx="${m.notizBreite}" cy="${m.notizHoehe}"/>` +
    '</p:presentation>'
  );
}

const PRAESENTATIONS_EIGENSCHAFTEN_XML = `${XML_KOPF}<p:presentationPr ${NS_PML_ALLE}/>`;

const ANSICHTS_EIGENSCHAFTEN_XML =
  `${XML_KOPF}<p:viewPr ${NS_PML_ALLE}>` +
  '<p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>' +
  '<p:gridSpacing cx="76200" cy="76200"/></p:viewPr>';

/** Tabellen-Vorlagen: leer, mit der Office-Vorgabe als Standard-Kennung. */
const TABELLEN_STILE_XML = `${XML_KOPF}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;

function farbe(name, wert) {
  return `<a:${name}><a:srgbClr val="${wert}"/></a:${name}>`;
}

function schrift(name, typ) {
  return `<a:${name}><a:latin typeface="${typ}"/><a:ea typeface=""/><a:cs typeface=""/></a:${name}>`;
}

function dreifach(teil) {
  return teil + teil + teil;
}

/**
 * Ein schlichtes Office-Theme: zwölf Farben, Schrift-Paar, je drei Füllungen,
 * Linien, Effekte und Hintergründe (die Mindestzahl nach ECMA-376, 20.1.4.1.14).
 */
const THEME_XML =
  `${XML_KOPF}<a:theme xmlns:a="${NS_A}" name="Office Theme"><a:themeElements>` +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  farbe('dk2', '44546A') +
  farbe('lt2', 'E7E6E6') +
  farbe('accent1', '4472C4') +
  farbe('accent2', 'ED7D31') +
  farbe('accent3', 'A5A5A5') +
  farbe('accent4', 'FFC000') +
  farbe('accent5', '5B9BD5') +
  farbe('accent6', '70AD47') +
  farbe('hlink', '0563C1') +
  farbe('folHlink', '954F72') +
  '</a:clrScheme>' +
  `<a:fontScheme name="Office">${schrift('majorFont', 'Calibri Light')}${schrift('minorFont', 'Calibri')}</a:fontScheme>` +
  '<a:fmtScheme name="Office">' +
  `<a:fillStyleLst>${dreifach('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:fillStyleLst>` +
  '<a:lnStyleLst>' +
  [6350, 12700, 19050]
    .map((w) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`)
    .join('') +
  '</a:lnStyleLst>' +
  `<a:effectStyleLst>${dreifach('<a:effectStyle><a:effectLst/></a:effectStyle>')}</a:effectStyleLst>` +
  `<a:bgFillStyleLst>${dreifach('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:bgFillStyleLst>` +
  '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

/** Der eine Folien-Master: weißer Hintergrund aus dem Theme, ein Layout, Text-Grundformen. */
const FOLIEN_MASTER_XML =
  `${XML_KOPF}<p:sldMaster ${NS_PML_ALLE}>` +
  '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
  `<p:spTree>${BAUM_KOPF}</p:spTree></p:cSld>` +
  `<p:clrMap ${FARB_ZUORDNUNG}/>` +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  `<p:txStyles><p:titleStyle>${ebene(4400)}</p:titleStyle><p:bodyStyle>${ebene(2800)}</p:bodyStyle>` +
  `<p:otherStyle>${ebene(1800)}</p:otherStyle></p:txStyles>` +
  '</p:sldMaster>';

/** Das eine Layout: leer, ohne Platzhalter, weil jede Folie nur ihr Bild trägt. */
const FOLIEN_LAYOUT_XML =
  `${XML_KOPF}<p:sldLayout ${NS_PML_ALLE} type="blank" preserve="1">` +
  `<p:cSld><p:spTree>${BAUM_KOPF}</p:spTree></p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

/** Lage auf der Notizen-Seite: `{ x, y, cx, cy }` in EMU. */
function lageXml(l) {
  return `<a:xfrm><a:off x="${l.x}" y="${l.y}"/><a:ext cx="${l.cx}" cy="${l.cy}"/></a:xfrm>`;
}

/**
 * Der Notizen-Master mit den beiden Platzhaltern, deren Lage die
 * Notizen-Folien erben: Vorschau der Folie oben, Notizen-Text darunter.
 *
 * @param {{ vorschau: object, text: object }} lagen
 * @returns {string} `ppt/notesMasters/notesMaster1.xml`.
 */
function notizenMasterXml(lagen) {
  return (
    `${XML_KOPF}<p:notesMaster ${NS_PML_ALLE}>` +
    '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
    `<p:spTree>${BAUM_KOPF}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name=""/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr>${lageXml(lagen.vorschau)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    '<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name=""/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr>${lageXml(lagen.text)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>' +
    '</p:spTree></p:cSld>' +
    `<p:clrMap ${FARB_ZUORDNUNG}/>` +
    `<p:notesStyle>${ebene(1200)}</p:notesStyle></p:notesMaster>`
  );
}

/**
 * @param {{ name: string, breite: number, hoehe: number }} m `name` maskiert.
 * @returns {string} `ppt/slides/slideN.xml`: das Bild in voller Folien-Größe, Beziehung rId2.
 */
function folieXml(m) {
  return (
    `${XML_KOPF}<p:sld ${NS_PML_ALLE}><p:cSld><p:spTree>${BAUM_KOPF}` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="${m.name}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
    `<p:spPr>${lageXml({ x: 0, y: 0, cx: m.breite, cy: m.hoehe })}` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

/**
 * @param {string[]} absaetze maskierte Absätze; ein leerer Text ist ein leerer Absatz.
 * @returns {string} `ppt/notesSlides/notesSlideN.xml`; ohne Absätze ein leerer `body`.
 */
function notizenFolieXml(absaetze) {
  const text = absaetze.length
    ? absaetze.map((a) => (a === '' ? '<a:p/>' : `<a:p><a:r><a:t>${a}</a:t></a:r></a:p>`)).join('')
    : '<a:p/>';
  return (
    `${XML_KOPF}<p:notes ${NS_PML_ALLE}><p:cSld><p:spTree>${BAUM_KOPF}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name=""/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name=""/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>' +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${text}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
  );
}

module.exports = {
  REL,
  INHALTSTYP,
  beziehungenXml,
  inhaltstypenXml,
  kernEigenschaftenXml,
  anwendungsEigenschaftenXml,
  praesentationXml,
  PRAESENTATIONS_EIGENSCHAFTEN_XML,
  ANSICHTS_EIGENSCHAFTEN_XML,
  TABELLEN_STILE_XML,
  THEME_XML,
  FOLIEN_MASTER_XML,
  FOLIEN_LAYOUT_XML,
  notizenMasterXml,
  folieXml,
  notizenFolieXml,
};
