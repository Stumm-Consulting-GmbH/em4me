// Erzeugt icon.ico (Multi-Size) und icon.png (256px) aus den beiden
// EM4me-Quell-SVG.
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

// Ab dieser Kantenlaenge traegt das Icon die volle Bildmarke. Darunter waeren
// die vier Buchstaben nur noch Grau-Matsch, deshalb die Kompaktmarke.
const FULL_LOGO_FROM = 48;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Quadratisches PNG in der gewuenschten Kantenlaenge aus einem SVG-Puffer.
async function renderSized(svg, size) {
  return sharp(svg).resize(size, size).png().toBuffer();
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
  await fs.writeFile(PNG_PATH, pngs[pngs.length - 1]);
  const small = SIZES.filter((s) => s < FULL_LOGO_FROM).join('/');
  const large = SIZES.filter((s) => s >= FULL_LOGO_FROM).join('/');
  console.log(`Icon erzeugt: ${ICO_PATH} (${ico.length} Bytes)`);
  console.log(`  Kompaktmarke: ${small} px, volle Bildmarke: ${large} px`);
  console.log(`PNG erzeugt:  ${PNG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
