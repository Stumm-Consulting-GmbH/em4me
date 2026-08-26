// Erzeugt icon.ico (Multi-Size), icon.png (256px), icon-512.png und
// icon.icns aus den beiden EM4me-Quell-SVG.
// 4T-1204 (Epic 3E-0121): icon-512.png ist die Linux-Build-Grundlage
// (electron-builder verlangt dort mindestens 512 px), icon.icns die
// macOS-Grundlage. Die ICNS entsteht OHNE neue Abhaengigkeit: Der Container
// traegt PNG-basierte Eintraege (Typen icp4 bis ic10), sein Aufbau ist
// Typ-Kennung plus Laenge je Eintrag — handgeschrieben in icnsFromPngs.
// Beide neuen Dateien sind reine Build-Grundlagen und vom Windows-Paket
// ausgeschlossen (package.json, build.files).
// 4T-0649 (Epic 3E-0126): Die ICO ist bewusst GESTAFFELT — eine ICO-Datei
// kann pro Groesse ein eigenes Bild fuehren, und Windows greift je nach
// Anzeige-Ort zur passenden Stufe:
//   16/24/32 px -> em4me-mark.svg  (Kompaktmarke: nur die Vier, Buchstaben
//                  als Punkte; Titelleiste, Taskleiste, kleine Listen)
//   ab 48 px    -> em4me-logo.svg  (volle Bildmarke mit E, M, m, e; Desktop-
//                  Verknuepfung, Alt-Tab, Datei-Eigenschaften)
// Das frueher noetige Wrapper-SVG (helle Plate um den fremden Markdown Mark)
// entfaellt: Beide Quellen bringen ihr goldenes Plaettchen selbst mit.
// X-07 (4T-0182): bewusst NICHT an den regulaeren Build gekoppelt — die
// ICO wird nur nach Aenderungen an den Quell-SVG manuell per
// `npm run build:icon` neu erzeugt (kein sharp-Lauf pro Build).
'use strict';

const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('node:fs/promises');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');
const MARK_PATH = path.join(ASSETS, 'em4me-mark.svg');
const LOGO_PATH = path.join(ASSETS, 'em4me-logo.svg');
const ICO_PATH = path.join(ASSETS, 'icon.ico');
const PNG_PATH = path.join(ASSETS, 'icon.png');
const PNG512_PATH = path.join(ASSETS, 'icon-512.png');
const ICNS_PATH = path.join(ASSETS, 'icon.icns');

// Ab dieser Kantenlaenge traegt das Icon die volle Bildmarke. Darunter waeren
// die vier Buchstaben nur noch Grau-Matsch, deshalb die Kompaktmarke.
const FULL_LOGO_FROM = 48;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// ICNS-Eintraege mit PNG-Inhalt: Typ-Kennung -> Kantenlaenge. Die Staffel
// (Kompaktmarke unter FULL_LOGO_FROM) gilt unveraendert auch hier.
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

// Quadratisches PNG in der gewuenschten Kantenlaenge aus einem SVG-Puffer.
async function renderSized(svg, size) {
  return sharp(svg).resize(size, size).png().toBuffer();
}

// Baut den ICNS-Container aus PNG-Eintraegen: 8-Byte-Kopf ('icns' +
// Gesamtlaenge, Big-Endian), danach je Eintrag Typ (4 Byte ASCII) + Laenge
// (4 Byte, inklusive der 8 Kopf-Bytes) + PNG-Daten. entries:
// [{ type, png }] — rein und unit-testbar.
function icnsFromPngs(entries) {
  const teile = [];
  let gesamt = 8;
  for (const { png } of entries) gesamt += 8 + png.length;
  const kopf = Buffer.alloc(8);
  kopf.write('icns', 0, 'ascii');
  kopf.writeUInt32BE(gesamt, 4);
  teile.push(kopf);
  for (const { type, png } of entries) {
    const eintrag = Buffer.alloc(8);
    eintrag.write(type, 0, 'ascii');
    eintrag.writeUInt32BE(8 + png.length, 4);
    teile.push(eintrag, png);
  }
  return Buffer.concat(teile);
}

async function main() {
  const mark = await fs.readFile(MARK_PATH);
  const logo = await fs.readFile(LOGO_PATH);
  const pngs = [];
  for (const size of SIZES) {
    pngs.push(await renderSized(size >= FULL_LOGO_FROM ? logo : mark, size));
  }
  const ico = await toIco(pngs);
  await fs.writeFile(ICO_PATH, ico);
  await fs.writeFile(PNG_PATH, pngs[SIZES.indexOf(256)]);
  const png512 = await renderSized(logo, 512);
  await fs.writeFile(PNG512_PATH, png512);
  const icnsEintraege = [];
  for (const [type, size] of ICNS_TYPES) {
    icnsEintraege.push({
      type,
      png: await renderSized(size >= FULL_LOGO_FROM ? logo : mark, size),
    });
  }
  const icns = icnsFromPngs(icnsEintraege);
  await fs.writeFile(ICNS_PATH, icns);
  const small = SIZES.filter((s) => s < FULL_LOGO_FROM).join('/');
  const large = SIZES.filter((s) => s >= FULL_LOGO_FROM).join('/');
  console.log(`Icon erzeugt: ${ICO_PATH} (${ico.length} Bytes)`);
  console.log(`  Kompaktmarke: ${small} px, volle Bildmarke: ${large} px`);
  console.log(`PNG erzeugt:  ${PNG_PATH}`);
  console.log(`PNG erzeugt:  ${PNG512_PATH} (Linux-Build-Grundlage)`);
  console.log(
    `ICNS erzeugt: ${ICNS_PATH} (${icns.length} Bytes, ${ICNS_TYPES.map(([, s]) => s).join('/')} px)`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { icnsFromPngs, ICNS_TYPES };
