// 4T-002641 (Epic 3E-000397): gemeinsame Helfer der Ablauf-Prüfungen zur
// Lese-Position (`lese-position.spec.js`, `lese-position-ablage.spec.js`).
//
// Test-Dokument im Wegwerf-Bereich des Falls: 400 nummerierte Absätze
// «Zeile 001» bis «Zeile 400», eine Überschrift alle 50 Zeilen. Gemessen wird
// die oberste sichtbare Zeile am Text der Absätze, in der Lese-Ansicht wie im
// Editor.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { expect } = require('@playwright/test');
const { hauptSenden } = require('./haupt-zugriff');
const { SEL } = require('./selectors');
const { leseJsonOderNull } = require('./dateien');

const PANE = '.pane-group[data-pane="0"]';
const GERENDERT = `${PANE} .pane-rendered`;
const EDITOR = `${PANE} .pane-source .cm-scroller`;
const TOLERANZ = 2;

// Einfarbige PNG-Datei in gewünschter Größe, ohne Fremd-Paket (Muster
// `png` in bild-ansicht.spec.js).
const CRC_TAFEL = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngAbschnitt(typ, daten) {
  const typUndDaten = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  let c = 0xffffffff;
  for (const b of typUndDaten) c = CRC_TAFEL[(c ^ b) & 0xff] ^ (c >>> 8);
  const kopf = Buffer.alloc(4);
  kopf.writeUInt32BE(daten.length);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([kopf, typUndDaten, pruef]);
}

function png(breite, hoehe) {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; // Bit-Tiefe
  kopf[9] = 2; // Farbtyp RGB
  const zeile = Buffer.alloc(1 + breite * 3, 120);
  zeile[0] = 0;
  const roh = Buffer.concat(Array.from({ length: hoehe }, () => zeile));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngAbschnitt('IHDR', kopf),
    pngAbschnitt('IDAT', zlib.deflateSync(roh)),
    pngAbschnitt('IEND', Buffer.alloc(0)),
  ]);
}

// Text des langen Dokuments samt Dokument-Zeile je Absatz.
// `zusatz` hängt an einzelne Absätze ein Wort an, etwa einen Suchbegriff;
// `bilder` setzt so viele Bild-Verweise ohne feste Maße an den Anfang,
// `einbettung` dort das eingebettete Dokument `eingebettet.md`.
function langesDokument({ mitDiagramm = false, zusatz = {}, bilder = 0, einbettung = false } = {}) {
  const zeilen = [];
  for (let i = 1; i <= bilder; i++) zeilen.push(`![Bild ${i}](bild-${i}.png)`, '');
  if (einbettung) zeilen.push('![[eingebettet]]', '');
  if (mitDiagramm) {
    zeilen.push('```mermaid', 'flowchart TD', '  A[Start] --> B[Mitte]', '  B --> C[Ende]');
    zeilen.push('  C --> D[Schluss]', '  D --> E[Fertig]', '```', '');
  }
  const zeileVon = {};
  for (let n = 1; n <= 400; n++) {
    if ((n - 1) % 50 === 0) zeilen.push(`# Kapitel ${(n - 1) / 50 + 1}`, '');
    const extra = zusatz[n] ? ` ${zusatz[n]}` : '';
    zeilen.push(`Zeile ${String(n).padStart(3, '0')}${extra}`, '');
    zeileVon[n] = zeilen.length - 1;
  }
  return { text: zeilen.join('\n'), zeileVon };
}

// `kurzText` ersetzt den Inhalt des kurzen Dokuments; `zweites` legt eine
// zweite lange Datei `lang2.md` gleichen Inhalts an.
function legeAn(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-lese-position-'));
  const lang = path.join(dir, 'lang.md');
  const lang2 = path.join(dir, 'lang2.md');
  const kurz = path.join(dir, 'kurz.md');
  const dokument = langesDokument(opts);
  fs.writeFileSync(lang, dokument.text, 'utf8');
  if (opts.zweites) fs.writeFileSync(lang2, dokument.text, 'utf8');
  fs.writeFileSync(kurz, opts.kurzText || '# Kurz\n\nNur ein Absatz.\n', 'utf8');
  for (let i = 1; i <= (opts.bilder || 0); i++) {
    fs.writeFileSync(path.join(dir, `bild-${i}.png`), png(400, 900));
  }
  if (opts.einbettung) {
    const absaetze = Array.from({ length: 40 }, (_, i) => `Absatz E${i + 1}\n`);
    fs.writeFileSync(
      path.join(dir, 'eingebettet.md'),
      ['# Eingebettet', '', ...absaetze].join('\n'),
    );
  }
  return { dir, lang, lang2, kurz, zeileVon: dokument.zeileVon };
}

function raeumeAuf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

async function ansicht(app, modus) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, m) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('menu:viewChange', m);
    },
    modus,
  );
}

function reiter(page, name) {
  return page.locator(SEL.tabs0).filter({ hasText: name }).first();
}

// Nummer des obersten sichtbaren Absatzes «Zeile NNN» im Rollen-Container.
async function obersteZeile(page, container, elemente) {
  return page.evaluate(
    ({ container, elemente }) => {
      const sc = document.querySelector(container);
      if (!sc) return null;
      const oben = sc.getBoundingClientRect().top;
      for (const el of sc.querySelectorAll(elemente)) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= oben + 1) continue;
        const m = /^Zeile (\d{3})/.exec(el.textContent.trim());
        if (m) return parseInt(m[1], 10);
      }
      return null;
    },
    { container, elemente },
  );
}

const obersteGerendert = (page) => obersteZeile(page, GERENDERT, '.markdown-body p');
const obersteImEditor = (page) => obersteZeile(page, EDITOR, '.cm-line');

// Nummer des obersten sichtbaren Absatzes, wenn sie und seine Lage vier
// gezeichnete Bilder lang gleich bleiben, sonst null. Zustands-Bedingung statt
// fester Pause vor einer Messung, solange die Ansicht noch nachsetzt.
async function obersteRuhig(page, container, elemente) {
  return page.evaluate(
    ({ container, elemente }) =>
      new Promise((fertig) => {
        const lage = () => {
          const sc = document.querySelector(container);
          if (!sc) return null;
          const oben = sc.getBoundingClientRect().top;
          for (const el of sc.querySelectorAll(elemente)) {
            const r = el.getBoundingClientRect();
            if (r.bottom <= oben + 1) continue;
            const m = /^Zeile (\d{3})/.exec(el.textContent.trim());
            if (m) return `${m[1]}@${Math.round(r.top - oben)}`;
          }
          return null;
        };
        const erste = lage();
        let n = 0;
        const takt = () => {
          if (erste === null || lage() !== erste) return fertig(null);
          if (++n >= 4) return fertig(parseInt(erste, 10));
          requestAnimationFrame(takt);
        };
        requestAnimationFrame(takt);
      }),
    { container, elemente },
  );
}

// Rollt den Container, bis der Absatz `nummer` oben steht. Der Editor zeichnet
// nur Zeilen in Sichtweite; deshalb schrittweise.
// Jeder Schritt meldet zuerst ein Rad-Ereignis, wie es der Bildlauf eines
// Anwenders mitbringt: Erst damit gibt die Anwendung das Nachsetzen der Stelle
// bei nachladenden Inhalten ab (bis zu zwei Sekunden nach einem Ansichts-
// Wechsel, beendet durch Rad, Taste, Ziehen oder Berühren). Einen Bildlauf
// allein über `scrollTop` gibt es beim Anwender nicht.
async function rolleZu(page, container, elemente, nummer) {
  const marke = `Zeile ${String(nummer).padStart(3, '0')}`;
  for (let i = 0; i < 120; i++) {
    const fertig = await page.evaluate(
      ({ container, elemente, marke, nummer }) => {
        const sc = document.querySelector(container);
        sc.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 0 }));
        const alle = [...sc.querySelectorAll(elemente)];
        const ziel = alle.find((el) => el.textContent.trim().startsWith(marke));
        const oben = sc.getBoundingClientRect().top;
        if (ziel) {
          const abstand = ziel.getBoundingClientRect().top - oben;
          if (Math.abs(abstand) < 2) return true;
          sc.scrollTop += abstand;
          return false;
        }
        const nummern = alle
          .map((el) => /^Zeile (\d{3})/.exec(el.textContent.trim()))
          .filter(Boolean)
          .map((m) => parseInt(m[1], 10));
        const groesste = nummern.length ? Math.max(...nummern) : 0;
        sc.scrollTop += groesste < nummer ? 400 : -400;
        return false;
      },
      { container, elemente, marke, nummer },
    );
    if (fertig) return;
    await page.waitForTimeout(30);
  }
  throw new Error(`${marke} nicht erreicht`);
}

function nahe(wert, soll) {
  return wert !== null && Math.abs(wert - soll) <= TOLERANZ;
}

// Gemerkte oberste Zeile (Dokument-Zeile) einer Datei in der Ablage oder null.
function gemerkteZeile(userData, dateiname) {
  const daten = leseJsonOderNull(path.join(userData, 'lese-positionen.json'));
  const eintraege = (daten && daten.eintraege) || {};
  const schluessel = Object.keys(eintraege).find(
    (p) => path.basename(p).toLowerCase() === dateiname,
  );
  return schluessel ? eintraege[schluessel].zeileOben : null;
}

async function bindeBereich(page, dir) {
  // Nach einem Neustart ist der Bereich schon wieder gebunden; dann kommt
  // keine Bindungs-Meldung zurück, und es zählt allein der Fenstertitel.
  await page.evaluate((p) => window.api.openAreaPath(p), dir);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(dir)})`);
}

// Öffnet eine Datei über ihre Zeile im Bereichs-Panel (Beschriftung ohne Endung).
async function oeffneImPanel(page, beschriftung) {
  const zeile = page
    .locator(`${PANE} .sidebar-area .area-file-row`)
    .filter({ hasText: new RegExp(`^${beschriftung}$`) });
  await expect(zeile).toBeVisible();
  await zeile.click();
  await expect(page.locator(SEL.activeTab0).locator('.tab-title')).toHaveText(
    new RegExp(`^${beschriftung}`),
  );
}

// Schließt den aktiven Reiter; die Spalte hat danach keinen Reiter `name` mehr.
async function schliesseAktiven(page, name) {
  await page.keyboard.press('Control+w');
  await expect(reiter(page, name)).toHaveCount(0);
}

// Zeichnet ab sofort nach jedem gezeichneten Bild die oberste sichtbare Zeile
// der Lese-Ansicht auf, solange sie das lange Dokument zeigt.
async function starteBildMessung(page) {
  await page.evaluate((container) => {
    const messungen = [];
    window.__lpMessungen = messungen;
    const ende = Date.now() + 4000;
    const miss = () => {
      const sc = document.querySelector(container);
      if (!sc || !sc.textContent.includes('Zeile 400')) return;
      const oben = sc.getBoundingClientRect().top;
      for (const el of sc.querySelectorAll('.markdown-body p')) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= oben + 1) continue;
        const m = /^Zeile (\d{3})/.exec(el.textContent.trim());
        if (m) messungen.push(parseInt(m[1], 10));
        return;
      }
    };
    // Gemessen nach dem Zeichnen: der Rückruf des Zeitgebers läuft nach dem
    // Bild, in dessen Takt er bestellt wurde.
    const takt = () => {
      if (Date.now() > ende) return;
      setTimeout(miss, 0);
      requestAnimationFrame(takt);
    };
    requestAnimationFrame(takt);
  }, GERENDERT);
}

const bildMessungen = (page) => page.evaluate(() => window.__lpMessungen || []);

// Beendet die Anwendung auf dem regulären Weg (Schließ-Anfrage an das Fenster,
// Schreiben beim Beenden) und wartet, bis der Prozess fort ist (Muster SM-09).
async function beende(app) {
  await hauptSenden(app, ({ app: a }) => a.quit());
  await app.waitForEvent('close');
}

module.exports = {
  PANE,
  GERENDERT,
  EDITOR,
  TOLERANZ,
  langesDokument,
  legeAn,
  raeumeAuf,
  ansicht,
  reiter,
  obersteZeile,
  obersteGerendert,
  obersteImEditor,
  obersteRuhig,
  rolleZu,
  nahe,
  gemerkteZeile,
  bindeBereich,
  oeffneImPanel,
  schliesseAktiven,
  starteBildMessung,
  bildMessungen,
  beende,
};
