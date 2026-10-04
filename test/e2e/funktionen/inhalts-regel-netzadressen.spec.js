// 4T-001920: Inhalts-Regel des Anzeige-Fensters gegen Netzwerk-, Freigabe- und
// Datei-Adressen. Hervorgegangen aus der Messung am 2026-10-01.
//
// Die Fälle prüfen den SOLL-Zustand: Eine Adress-Form, die nicht aus der
// Anwendung selbst oder als Daten-Adresse kommt, wird weder geladen, noch geht
// eine Anfrage an ihr Ziel ab. Fälle, in denen die Anwendung heute schon
// abweist, sind gewöhnliche Zusicherungen. Fälle, in denen heute geladen wird,
// tragen die Markierung `test.fail()`: Sie gelten als bestanden, solange der
// Zustand besteht, und werden rot, sobald die Behebung (Vorgang 4T-002068)
// greift. Wer behebt, entfernt die Markierung und hat damit die Zusicherung.
//
// Jeder Fall trägt seinen ANKER: Eine Form, die laden muss (Daten-Adresse,
// relatives Bild des Dokuments, Titelbild), oder die abgewiesene http-Adresse
// als Zeitpunkt, zu dem die Hintergründe derselben Stil-Berechnung angefragt
// sind. Ohne ihn wäre ein «nicht geladen» kein Befund, sondern ein
// Nicht-Ergebnis.
//
// Sicherheits-Grenze: Alle Ziele zeigen auf den eigenen Rechner (127.0.0.1,
// localhost, Freigabe C$ bzw. das Laufwerk des Temp-Ordners); der Mitschnitt
// der Fenster-Sitzung protokolliert jede Anfrage und bricht jede an ein anderes
// Ziel ab.
//
// Nur unter Windows: Die Freigabe-Formen (\\rechner\…, //rechner/…) sind dort
// definiert, und gemessen ist allein dort.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  warteAufRendererBereit,
  oeffneDokumentImFenster,
} = require('../helpers/app');
const { hauptSenden, hauptLesen } = require('../helpers/haupt-zugriff');
const { SEL } = require('../helpers/selectors');
const { SHELF_SETTINGS_FILENAME } = require('../../../src/shared/books/shelf-core.js');
const {
  BOOK_SETTINGS_FILENAME,
  emptyBookContainer,
  serializeBookContainer,
} = require('../../../src/shared/books/book-core.js');

test.skip(
  process.platform !== 'win32',
  'Freigabe-Adressen sind eine Windows-Form; gemessen ist allein unter Windows (4T-001920).',
);

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function makeDir(praefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), praefix));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* unkritisch */
  }
}

function uncTeile(abs) {
  const m = /^([A-Za-z]):\\(.*)$/.exec(abs);
  return { laufwerk: m[1].toUpperCase(), rest: m[2] };
}

// Die gemessenen Adress-Formen, je auf die Bild-Datei bildAbs. A1 bis A5 zeigen
// auf eine Freigabe, A6 und A7 sind Datei-Adressen, A8 ist eine kodierte
// Freigabe-Adresse; G2 und G3 sind die Gegenproben http und Daten-Adresse.
function adressFormen(bildAbs, port) {
  const { laufwerk, rest } = uncTeile(bildAbs);
  const restSlash = rest.split('\\').join('/');
  const lokalSlash = bildAbs.split('\\').join('/');
  return {
    A1: `//localhost/${laufwerk}$/${restSlash}`,
    A2: `//127.0.0.1/${laufwerk}$/${restSlash}`,
    A3: `\\\\127.0.0.1\\${laufwerk}$\\${rest}`,
    A4: `\\\\localhost\\${laufwerk}$\\${rest}`,
    A5: `file://127.0.0.1/${laufwerk}$/${restSlash}`,
    A6: `file://localhost/${lokalSlash}`,
    A7: `file:///${lokalSlash}`,
    A8: `%2F%2F127.0.0.1/${laufwerk}$/${restSlash}`,
    G2: `http://127.0.0.1:${port}/g2.png`,
    G3: `data:image/png;base64,${PNG_1X1.toString('base64')}`,
  };
}

function starteMiniServer() {
  const treffer = [];
  const server = http.createServer((req, res) => {
    treffer.push(req.url);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PNG_1X1);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        treffer,
        schliessen: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function fensterIdVon(app, page) {
  const fenster = await app.browserWindow(page);
  return hauptLesen(fenster, (w) => w.id);
}

async function mitschnittSetzen(app, fensterId) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.fensterId);
      globalThis.__cspMitschnitt = [];
      win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        let lokal;
        try {
          const u = new URL(details.url);
          if (u.protocol === 'file:') {
            lokal = ['', 'localhost', '127.0.0.1'].includes(u.hostname);
          } else if (u.protocol === 'http:' || u.protocol === 'https:') {
            lokal = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
          } else {
            lokal = ['data:', 'blob:', 'devtools:', 'chrome:', 'about:'].includes(u.protocol);
          }
        } catch {
          lokal = false;
        }
        globalThis.__cspMitschnitt.push({
          url: details.url,
          art: details.resourceType,
          abgebrochen: !lokal,
        });
        callback({ cancel: !lokal });
      });
    },
    { fensterId },
  );
}

async function mitschnittLesen(app) {
  return hauptLesen(app, () => globalThis.__cspMitschnitt || []);
}

async function mitschnittEntfernen(app, fensterId) {
  await hauptSenden(
    app,
    ({ BrowserWindow }, a) => {
      const win = BrowserWindow.fromId(a.fensterId);
      if (win && !win.isDestroyed()) win.webContents.session.webRequest.onBeforeRequest(null);
    },
    { fensterId },
  );
}

async function verstossHoererSetzen(page) {
  await page.evaluate(() => {
    window.__cspVerstoesse = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspVerstoesse.push({
        blockedURI: e.blockedURI,
        direktive: e.effectiveDirective,
      });
    });
  });
}

async function verstoesseLesen(page) {
  return page.evaluate(() => window.__cspVerstoesse);
}

// Wartet, bis die Inhalts-Regel eine Adresse mit diesem Bestandteil abgewiesen
// hat. Dient als Anker: Die http-Adresse steht in derselben Stil-Berechnung wie
// die übrigen Hintergründe des Falls und wird als letzte angefügt.
async function warteAufVerstoss(page, teil) {
  await expect
    .poll(
      () =>
        page.evaluate((t) => window.__cspVerstoesse.some((v) => v.blockedURI.includes(t)), teil),
      { timeout: 15000 },
    )
    .toBe(true);
}

// Anfragen des Mitschnitts, die das Ziel erreichen: jede Datei-Adresse mit
// Rechner-Angabe (Freigabe) und jede Datei-Adresse auf die Bild-Datei selbst.
// Die Rechner-Angabe wird aus der Adresse gelesen, nicht über URL(), weil
// dessen Zerlegung «localhost» bei Datei-Adressen verwirft.
function zielAnfragen(mitschnitt, bildAbs) {
  const ziel = path.resolve(bildAbs).toLowerCase();
  return mitschnitt
    .filter((e) => {
      const m = /^file:\/\/([^/?#]*)([^?#]*)/i.exec(e.url);
      if (!m) return false;
      if (m[1] !== '') return true;
      let pfad;
      try {
        pfad = decodeURIComponent(m[2]);
      } catch {
        return false;
      }
      if (/^\/[A-Za-z]:/.test(pfad)) pfad = pfad.slice(1);
      return path.resolve(pfad).toLowerCase() === ziel;
    })
    .map((e) => e.url);
}

// Rahmen jedes Falls: Prüf-Server, Anwendung, Mitschnitt und Verstoß-Hörer.
async function mitFenster(ablauf) {
  const server = await starteMiniServer();
  const { app, page, userData } = await launchApp();
  try {
    await warteAufRendererBereit(page);
    const fensterId = await fensterIdVon(app, page);
    await mitschnittSetzen(app, fensterId);
    await verstossHoererSetzen(page);
    await ablauf({ app, page, server });
    await mitschnittEntfernen(app, fensterId);
  } finally {
    await closeApp(app, userData, { force: true });
    await server.schliessen();
  }
}

// Setzt je Form ein Bild-Element unmittelbar ins Fenster und wartet dessen
// Ausgang ab; danach je Form außer der Daten-Adresse einen Hintergrund und als
// letzten den Anker-Hintergrund.
async function ladeImFenster(page, formen, ankerAdresse) {
  return page.evaluate(
    async ({ liste, anker }) => {
      const box = document.createElement('div');
      box.id = 'ir-pruefung';
      document.body.appendChild(box);
      const bilder = {};
      for (const f of liste) {
        const img = document.createElement('img');
        bilder[f.name] = await new Promise((resolve) => {
          const uhr = setTimeout(() => resolve('zeitgrenze'), 20000);
          img.onload = () => {
            clearTimeout(uhr);
            resolve(img.naturalWidth > 0 ? 'load' : 'leer');
          };
          img.onerror = () => {
            clearTimeout(uhr);
            resolve('error');
          };
          img.src = f.adresse;
          box.appendChild(img);
        });
      }
      const hintergruende = liste
        .filter((f) => !f.adresse.startsWith('data:'))
        .map((f, i) => `${f.adresse}?css=${i}`);
      hintergruende.push(anker);
      for (const adresse of hintergruende) {
        const span = document.createElement('span');
        span.style.display = 'inline-block';
        span.style.width = '4px';
        span.style.height = '4px';
        span.style.backgroundImage = `url("${adresse}")`;
        box.appendChild(span);
      }
      return bilder;
    },
    { liste: formen, anker: ankerAdresse },
  );
}

async function zeigeGerendert(app, page, datei) {
  await oeffneDokumentImFenster(app, page, datei);
  await page.locator(SEL.viewBtn('rendered')).click();
  await expect(page.locator(SEL.markdownBody0)).toContainText('Prüfdokument');
  await expect
    .poll(() =>
      page.evaluate(
        (sel) => Array.from(document.querySelectorAll(`${sel} img`)).every((i) => i.complete),
        SEL.markdownBody0,
      ),
    )
    .toBe(true);
}

async function geladeneBilder(page) {
  return page.evaluate(
    (sel) =>
      Array.from(document.querySelectorAll(`${sel} img`))
        .filter((i) => i.naturalWidth > 0)
        .map((i) => i.alt),
    SEL.markdownBody0,
  );
}

function bildOrdner() {
  const dir = makeDir('em4me-csp-');
  const bildAbs = path.join(dir, 'bild.png');
  fs.writeFileSync(bildAbs, PNG_1X1);
  return { dir, bildAbs };
}

test.describe('IR-01: Fenster weist http und kodierte Freigabe-Adresse ab', () => {
  test('Bild und Hintergrund über http und %2F%2F werden nicht geladen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const anker = `http://127.0.0.1:${server.port}/anker-ir01.png`;
        const bilder = await ladeImFenster(
          page,
          [
            { name: 'G3', adresse: f.G3 },
            { name: 'G2', adresse: f.G2 },
            { name: 'A8', adresse: f.A8 },
          ],
          anker,
        );
        expect(bilder.G3, 'Anker: Daten-Adresse lädt').toBe('load');
        await warteAufVerstoss(page, 'anker-ir01.png');
        expect(bilder.G2).toBe('error');
        expect(bilder.A8).not.toBe('load');
        const verstoesse = (await verstoesseLesen(page)).map((v) => v.blockedURI);
        expect(verstoesse).toContain(f.G2);
        expect(verstoesse.some((u) => u.startsWith(`${f.G2}?css=`))).toBe(true);
        expect(server.treffer).toEqual([]);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-02: Fenster weist Freigabe-Adressen ab', () => {
  // Bekannter Zustand bis zur Behebung, Vorgang 4T-002068.
  test.fail('Bild und Hintergrund über eine Freigabe werden nicht geladen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const namen = ['A1', 'A2', 'A3', 'A4', 'A5'];
        const bilder = await ladeImFenster(
          page,
          [{ name: 'G3', adresse: f.G3 }, ...namen.map((n) => ({ name: n, adresse: f[n] }))],
          `http://127.0.0.1:${server.port}/anker-ir02.png`,
        );
        expect(bilder.G3, 'Anker: Daten-Adresse lädt').toBe('load');
        await warteAufVerstoss(page, 'anker-ir02.png');
        const geladen = namen.filter((n) => bilder[n] === 'load');
        expect(geladen, 'geladene Freigabe-Formen').toEqual([]);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-03: Fenster weist Datei-Adressen ab', () => {
  // Bekannter Zustand bis zur Behebung, Vorgang 4T-002068.
  test.fail('Bild und Hintergrund über eine Datei-Adresse werden nicht geladen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const namen = ['A6', 'A7'];
        const bilder = await ladeImFenster(
          page,
          [{ name: 'G3', adresse: f.G3 }, ...namen.map((n) => ({ name: n, adresse: f[n] }))],
          `http://127.0.0.1:${server.port}/anker-ir03.png`,
        );
        expect(bilder.G3, 'Anker: Daten-Adresse lädt').toBe('load');
        await warteAufVerstoss(page, 'anker-ir03.png');
        const geladen = namen.filter((n) => bilder[n] === 'load');
        expect(geladen, 'geladene Datei-Formen').toEqual([]);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-04: Gewöhnliches Dokument weist http, Einbettung und Schema-Formen ab', () => {
  test('Bild über http, Wiki-Einbettung auf eine Freigabe und Rückstrich-, Datei- und kodierte Formen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    fs.writeFileSync(path.join(dir, 'beleg.pdf'), '%PDF-1.4\n', 'utf8');
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const datei = path.join(dir, 'gewoehnlich-ir04.md');
        fs.writeFileSync(
          datei,
          [
            '# Prüfdokument gewöhnlich',
            '',
            '![G4](bild.png)',
            '',
            `![G2](http://127.0.0.1:${server.port}/md-ir04.png)`,
            '',
            `![A3](<${f.A3}>)`,
            '',
            `![A5](${f.A5})`,
            '',
            `![A7](${f.A7})`,
            '',
            `![A8](${f.A8})`,
            '',
            `![[${f.A2}]]`,
            '',
            `![[${f.A2.replace('bild.png', 'beleg.pdf')}]]`,
            '',
          ].join('\n'),
          'utf8',
        );
        await zeigeGerendert(app, page, datei);
        await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(2);
        await warteAufVerstoss(page, 'md-ir04.png');
        expect(await geladeneBilder(page), 'Anker: allein das relative Bild lädt').toEqual(['G4']);
        expect(server.treffer).toEqual([]);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-05: Gewöhnliches Dokument weist Freigabe-Adressen ohne Schema ab', () => {
  // Bekannter Zustand bis zur Behebung, Vorgang 4T-002068.
  test.fail('Bild über //rechner/… wird nicht geladen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const datei = path.join(dir, 'gewoehnlich-ir05.md');
        fs.writeFileSync(
          datei,
          [
            '# Prüfdokument gewöhnlich',
            '',
            '![G4](bild.png)',
            '',
            `![A1](${f.A1})`,
            '',
            `![A2](${f.A2})`,
            '',
          ].join('\n'),
          'utf8',
        );
        await zeigeGerendert(app, page, datei);
        const geladen = await geladeneBilder(page);
        expect(geladen, 'Anker: das relative Bild lädt').toContain('G4');
        expect(geladen, 'allein das relative Bild lädt').toEqual(['G4']);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-06: Portables Dokument weist Bild-Element auf Freigabe und Hintergrund über http ab', () => {
  test('Bild-Element mit //rechner/… und Hintergrund über http werden nicht geladen', async () => {
    test.setTimeout(120000);
    const { dir, bildAbs } = bildOrdner();
    try {
      await mitFenster(async ({ app, page, server }) => {
        const f = adressFormen(bildAbs, server.port);
        const datei = path.join(dir, 'portabel-ir06.md');
        fs.writeFileSync(
          datei,
          [
            '<!-- perspective-portable -->',
            '',
            '# Prüfdokument portabel',
            '',
            `<div><img src="${f.A2}" alt="P1"><span style="display:inline-block;width:4px;height:4px;background:url(http://127.0.0.1:${server.port}/anker-ir06.png)">P3</span></div>`,
            '',
          ].join('\n'),
          'utf8',
        );
        await zeigeGerendert(app, page, datei);
        await warteAufVerstoss(page, 'anker-ir06.png');
        expect(await geladeneBilder(page)).toEqual([]);
        expect(server.treffer).toEqual([]);
        expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
      });
    } finally {
      cleanupDir(dir);
    }
  });
});

test.describe('IR-07: Portables Dokument weist Hintergründe über Freigabe- und Datei-Adressen ab', () => {
  // Bekannter Zustand bis zur Behebung, Vorgang 4T-002068.
  test.fail(
    'Hintergrund über //rechner/…, file:/// und file://rechner/… wird nicht geladen',
    async () => {
      test.setTimeout(120000);
      const { dir, bildAbs } = bildOrdner();
      try {
        await mitFenster(async ({ app, page, server }) => {
          const f = adressFormen(bildAbs, server.port);
          const datei = path.join(dir, 'portabel-ir07.md');
          fs.writeFileSync(
            datei,
            [
              '<!-- perspective-portable -->',
              '',
              '# Prüfdokument portabel',
              '',
              `<div><span style="display:inline-block;width:4px;height:4px;background-image:url(${f.A2}?p=css)">P2</span><span style="display:inline-block;width:4px;height:4px;background:url(${f.A7}?p=css7)">P4</span><span style="display:inline-block;width:4px;height:4px;background:url(http://127.0.0.1:${server.port}/anker-ir07.png)">P3</span></div>`,
              '',
              `<span style="display:inline-block;width:4px;height:4px;background:url(${f.A5}?p=inline)">P5</span>`,
              '',
            ].join('\n'),
            'utf8',
          );
          await zeigeGerendert(app, page, datei);
          await warteAufVerstoss(page, 'anker-ir07.png');
          expect(zielAnfragen(await mitschnittLesen(app), bildAbs)).toEqual([]);
        });
      } finally {
        cleanupDir(dir);
      }
    },
  );
});

test.describe('IR-08: Titelbild der Regal-Ansicht ohne Datei-Adresse', () => {
  // Bekannter Zustand bis zur Behebung, Vorgang 4T-002068.
  test.fail(
    'cover.png im Buch-Ordner erscheint, ohne über eine Datei-Adresse geladen zu werden',
    async () => {
      test.setTimeout(120000);
      const parent = makeDir('em4me-csp-regal-');
      const shelfDir = path.join(parent, 'Bibliothek');
      fs.mkdirSync(shelfDir);
      fs.writeFileSync(path.join(shelfDir, 'Bibliothek.md'), '# Bibliothek\n', 'utf8');
      fs.writeFileSync(
        path.join(shelfDir, SHELF_SETTINGS_FILENAME),
        JSON.stringify(
          { schemaVersion: 1, shelf: { file: 'Bibliothek.md' }, books: ['Mit Bild'] },
          null,
          2,
        ),
        'utf8',
      );
      const bookDir = path.join(shelfDir, 'Mit Bild');
      fs.mkdirSync(bookDir);
      fs.writeFileSync(path.join(bookDir, 'Mit Bild.md'), '---\ncover: cover.png\n---\n', 'utf8');
      const coverAbs = path.join(bookDir, 'cover.png');
      fs.writeFileSync(coverAbs, PNG_1X1);
      fs.writeFileSync(
        path.join(bookDir, BOOK_SETTINGS_FILENAME),
        serializeBookContainer(emptyBookContainer('Mit Bild.md')),
        'utf8',
      );
      try {
        await mitFenster(async ({ app, page }) => {
          await page.evaluate((d) => window.api.shelves.openPath(d), shelfDir);
          const VIEW = '.pane-group[data-pane="0"] .pane-system .shelf-view-page';
          await expect(page.locator(VIEW)).toBeVisible();
          const bild = page.locator(`${VIEW} img`).first();
          await expect(bild).toBeAttached();
          await expect.poll(() => bild.evaluate((i) => i.complete)).toBe(true);
          expect(
            await bild.evaluate((i) => i.naturalWidth),
            'Anker: das Titelbild erscheint',
          ).toBeGreaterThan(0);
          expect(zielAnfragen(await mitschnittLesen(app), coverAbs)).toEqual([]);
        });
      } finally {
        cleanupDir(parent);
      }
    },
  );
});
