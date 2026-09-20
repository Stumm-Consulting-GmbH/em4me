// Epic 3E-000199: Einbettungen lösen ihre Ziele einheitlich auf.
//
// EB-01 (4T-001485): Ein Markdown-Ziel im NACHBAR-Ordner desselben Bereichs
//        wird eingebettet — über den Pfad und über den bloßen Namen. Vor der
//        Grenz-Verschiebung endete die Einbettung am Ordner des Dokuments,
//        während derselbe Klick das Ziel längst öffnete.
// EB-02 (4T-001485): Ein Ziel oberhalb der Bereichs-Wurzel wird nicht
//        eingebettet; der Schutz aus Befund B-02 ist verschoben, nicht
//        aufgehoben.
// EB-03 (4T-001485): Ohne gebundenen Bereich bleibt die engere Grenze des
//        Dokument-Ordners bestehen.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// Bereichs-Baum mit zwei Geschwister-Ordnern. Das einbettende Dokument liegt
// in 'quelle', sein Ziel in 'anderer' — also NICHT im eigenen Ordner und
// nicht darunter, aber im selben Bereich.
function makeBereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-eb-'));
  fs.mkdirSync(path.join(wurzel, 'quelle'));
  fs.mkdirSync(path.join(wurzel, 'anderer'));
  fs.writeFileSync(
    path.join(wurzel, 'anderer', 'nachbar.md'),
    '# Nachbar\n\nInhalt des Nachbarn.\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(wurzel, 'wurzelnah.md'),
    '# Wurzelnah\n\nDirekt an der Wurzel.\n',
    'utf8',
  );
  return wurzel;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Temp-Verzeichnis bleibt liegen; unkritisch.
  }
}

// Das Dokument schreiben, den Bereich in ein LEERES Fenster binden und die
// Datei danach über das Bereichs-Panel öffnen (Muster bereichs-panel.spec.js).
//
// Die Reihenfolge ist nicht beliebig: Die Einbettung wird beim Rendern
// aufgelöst, und die Bereichs-Bindung muss dabei stehen. Ein bestehendes
// Fenster bindet `area:openPath` zudem nur, solange es **keine offene Datei**
// hat (`appHasOpenFiles` in area-apps.js) — mit der Datei im Start-Argument
// entstünde ein zweites Fenster, und die Prüfung liefe am gebundenen vorbei.
async function starteMitEinbettung(wurzel, markdown) {
  fs.writeFileSync(path.join(wurzel, 'quelle', 'aktiv.md'), markdown, 'utf8');
  const gestartet = await launchApp();
  const { page } = gestartet;
  const res = await page.evaluate((pfad) => window.api.openAreaPath(pfad), wurzel);
  expect(res.boundExisting, `openAreaPath: ${JSON.stringify(res)}`).toBe(true);
  await expect.poll(() => page.title()).toContain(`(Bereich ${path.basename(wurzel)})`);

  // Im Panel den Ordner 'quelle' wählen und die Datei öffnen.
  const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
  await expect(section).toBeVisible();
  await section.locator('.area-dir-row', { hasText: 'quelle' }).first().click();
  await expect(section.locator('.area-files-title')).toHaveText('quelle');
  await section.locator('.area-file-row').first().click();
  await expect(page.locator(SEL.tabs0)).toHaveCount(1);
  return gestartet;
}

test.describe('EB-01: Einbettung aus dem Nachbar-Ordner (4T-001485)', () => {
  test('Ziel im selben Bereich wird über Pfad und über Namen eingebettet', async () => {
    const wurzel = makeBereich();
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\nÜber den Pfad:\n\n![[../anderer/nachbar.md]]\n\nÜber den Namen:\n\n![[nachbar]]\n',
    );
    try {
      const koerper = page.locator(`${SEL.markdownBody0} .wiki-embed-md-body`);
      // Beide Einbettungen sind aufgelöst und zeigen den Inhalt des Nachbarn.
      await expect(koerper).toHaveCount(2, { timeout: 20000 });
      await expect(koerper.nth(0)).toContainText('Inhalt des Nachbarn', { timeout: 20000 });
      await expect(koerper.nth(1)).toContainText('Inhalt des Nachbarn', { timeout: 20000 });
      // Kein Fehl-Hinweis daneben.
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(0);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('ein Ziel an der Bereichs-Wurzel wird ebenfalls eingebettet', async () => {
    const wurzel = makeBereich();
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[../wurzelnah.md]]\n',
    );
    try {
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-md-body`)).toContainText(
        'Direkt an der Wurzel',
        { timeout: 20000 },
      );
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

test.describe('EB-02: Die Grenze ist verschoben, nicht aufgehoben (4T-001485)', () => {
  test('ein Ziel oberhalb der Bereichs-Wurzel wird nicht eingebettet', async () => {
    const wurzel = makeBereich();
    // Das Ziel liegt im ELTERN-Ordner der Bereichs-Wurzel, also außerhalb.
    const draussen = path.join(path.dirname(wurzel), `scg-md-eb-draussen-${Date.now()}.md`);
    fs.writeFileSync(draussen, '# Draussen\n\nGEHEIMER INHALT.\n', 'utf8');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      `# Aktiv\n\n![[../../${path.basename(draussen)}]]\n`,
    );
    try {
      // Der Platzhalter wird als defekt gekennzeichnet, und der Inhalt der
      // Datei taucht nirgends im Dokument auf.
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(page.locator(SEL.markdownBody0)).not.toContainText('GEHEIMER INHALT');
    } finally {
      try {
        fs.rmSync(draussen, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

test.describe('EB-03: Ohne Bereich bleibt die engere Grenze (4T-001485)', () => {
  test('ein Nachbar-Ordner ist ohne gebundenen Bereich nicht erreichbar', async () => {
    const wurzel = makeBereich();
    const datei = path.join(wurzel, 'quelle', 'aktiv.md');
    fs.writeFileSync(datei, '# Aktiv\n\n![[../anderer/nachbar.md]]\n', 'utf8');
    // Datei OHNE openAreaPath öffnen: kein Bereich gebunden.
    const { app, page, userData } = await launchApp({ args: [datei] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(page.locator(SEL.markdownBody0)).not.toContainText('Inhalt des Nachbarn');
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

// EB-04 (4T-001494): Der Bereichs-Index kennt die Namen der
// Nicht-Markdown-Dateien. Geprueft ueber den Kanal, den sowohl die
// Einbettung als auch der Klick-Pfad benutzen — vor diesem Task lieferte er
// fuer Bild, PDF und Anlage bei Status 'ready' null Treffer.
test.describe('EB-04: Der Index kennt Nicht-Markdown-Namen (4T-001494)', () => {
  test('Bild, PDF und Anlage werden ueber ihren Namen gefunden, auch neu angelegte', async () => {
    const wurzel = makeBereich();
    // Anlagen neben dem Dokument, in einem eigenen Ordner.
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), 'PNG-Platzhalter');
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'unterlage.pdf'), '%PDF-1.4\n', 'utf8');
    const { app, page, userData } = await starteMitEinbettung(wurzel, '# Aktiv\n\nText.\n');
    try {
      const frage = async (name) =>
        page.evaluate(async (n) => {
          const reiter = document.querySelector('.pane-group[data-pane="0"] .tab');
          const pfad = reiter ? reiter.getAttribute('title') : null;
          const r = await window.api.resolveWikiTargetInIndex(pfad, n);
          return { status: r && r.status, anzahl: ((r && r.candidates) || []).length };
        }, name);

      await expect.poll(async () => (await frage('bild.png')).anzahl, { timeout: 20000 }).toBe(1);
      expect((await frage('bild')).anzahl).toBe(1);
      expect((await frage('unterlage.pdf')).anzahl).toBe(1);
      expect((await frage('anlagen/bild.png')).anzahl).toBe(1);

      // AK5: eine NACHTRAEGLICH angelegte Anlage zieht ueber den Watcher nach.
      fs.writeFileSync(path.join(wurzel, 'anlagen', 'spaet.png'), 'PNG-Platzhalter');
      await expect.poll(async () => (await frage('spaet.png')).anzahl, { timeout: 20000 }).toBe(1);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

// EB-05 (4T-001486): Bild-Einbettungen gehen den Platzhalter-Weg und erben
// damit die Namens-Suche. Vor diesem Task wurde ein Bild ausschliesslich
// relativ zum Dokument gefunden.
test.describe('EB-05: Bild-Einbettung ueber den asynchronen Weg (4T-001486)', () => {
  test('Bild wird ueber Pfad und ueber Namen eingebettet, mit Breite', async () => {
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    // Ein winziges gueltiges PNG (1x1, transparent).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), png);
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\nUeber den Pfad:\n\n![[../anlagen/bild.png]]\n\nUeber den Namen:\n\n![[bild.png|120]]\n',
    );
    try {
      const bilder = page.locator(`${SEL.markdownBody0} img.wiki-embed-image`);
      await expect(bilder).toHaveCount(2, { timeout: 20000 });
      // Beide tragen eine Daten-Adresse (die Inhalts-Regel laesst file:// nicht zu).
      for (const i of [0, 1]) {
        const src = await bilder.nth(i).getAttribute('src');
        expect(src.startsWith('data:image/png;base64,')).toBe(true);
      }
      // Das zweite traegt die Breiten-Angabe.
      expect(await bilder.nth(1).evaluate((el) => el.style.maxWidth)).toBe('120px');
      // Beide sind tatsaechlich geladen, nicht nur im DOM.
      for (const i of [0, 1]) {
        expect(await bilder.nth(i).evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
      }
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(0);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('ein Bild ausserhalb des Bereichs wird nicht eingebettet', async () => {
    const wurzel = makeBereich();
    const draussen = path.join(path.dirname(wurzel), `scg-md-eb-bild-${Date.now()}.png`);
    fs.writeFileSync(draussen, 'PNG-Platzhalter');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      `# Aktiv\n\n![[../../${path.basename(draussen)}]]\n`,
    );
    try {
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(page.locator(`${SEL.markdownBody0} img.wiki-embed-image`)).toHaveCount(0);
    } finally {
      try {
        fs.rmSync(draussen, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('ein fehlendes Bild zeigt den Fehl-Hinweis statt einer leeren Stelle', async () => {
    const wurzel = makeBereich();
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[gibtesnicht.png]]\n',
    );
    try {
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(1, {
        timeout: 20000,
      });
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('eine Nicht-Bild-Datei kommt nicht ins Bild-Element', async () => {
    // Die Endungs-Whitelist der Art gilt auch fuer einen Index-Treffer:
    // '![[notiz]]' darf ueber die Namens-Suche keine .txt in ein <img> holen.
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'tarnung.png.txt'), 'kein Bild', 'utf8');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[../anlagen/tarnung.png.txt|100]]\n',
    );
    try {
      // Als 'other' erkannt (keine Bild-Endung) — Klick-Link statt Bild.
      await expect(page.locator(`${SEL.markdownBody0} img.wiki-embed-image`)).toHaveCount(0, {
        timeout: 20000,
      });
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

// EB-06 (4T-001486): PDF- und sonstige Einbettungen haben jetzt eine Grenze.
// Vorher loesten sie ueber path.resolve auf und luden Dateien ausserhalb des
// Bereichs — dieselbe Luecken-Klasse wie Befund B-02, nur nie geschlossen.
test.describe('EB-06: Grenze fuer PDF- und sonstige Einbettungen (4T-001486)', () => {
  test('ein PDF ausserhalb des Bereichs wird nicht mehr geladen', async () => {
    const wurzel = makeBereich();
    const draussen = path.join(path.dirname(wurzel), `scg-md-eb-pdf-${Date.now()}.pdf`);
    fs.writeFileSync(draussen, '%PDF-1.4\n', 'utf8');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      `# Aktiv\n\n![[../../${path.basename(draussen)}]]\n`,
    );
    try {
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(1, {
        timeout: 20000,
      });
      await expect(page.locator(`${SEL.markdownBody0} embed`)).toHaveCount(0);
    } finally {
      try {
        fs.rmSync(draussen, { force: true });
      } catch {
        /* Temp-Datei bleibt liegen; unkritisch */
      }
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('ein PDF im Bereich wird ueber seinen Namen gefunden', async () => {
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'unterlage.pdf'), '%PDF-1.4\n', 'utf8');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[unterlage.pdf]]\n',
    );
    try {
      await expect(page.locator(`${SEL.markdownBody0} embed`)).toHaveCount(1, { timeout: 20000 });
      await expect(page.locator(`${SEL.markdownBody0} .wiki-embed-broken`)).toHaveCount(0);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

// EB-07 (4T-001486): Die beiden Wege, die den Platzhalter NICHT auflösen,
// bleiben unberührt — der portable Export und der Live-Modus.
//
// Der portable Export ist die Falle des Umbaus: Sein Zweig behält bewusst das
// <img>, weil dort kein Postprocessing läuft. Ohne die Ausnahme stünden im
// exportierten Dokument leere Spans. Geprüft wird deshalb an der GEÖFFNETEN
// Datei und nicht am geschriebenen Text (Lehre aus 4T-001471).
test.describe('EB-07: Portabler Export und Live-Modus (4T-001486)', () => {
  test('der portable Export zeigt das eingebettete Bild in der geoeffneten Datei', async () => {
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), png);
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[../anlagen/bild.png]]\n\nSchluss.\n',
    );
    const ziel = path.join(wurzel, 'quelle', 'export.md');
    try {
      await expect(page.locator(`${SEL.markdownBody0} img.wiki-embed-image`)).toHaveCount(1, {
        timeout: 20000,
      });
      // Exportieren (Save-Dialog gestellt, Menue-Kanal gesendet).
      await app.evaluate(({ dialog }, z) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: z });
      }, ziel);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:exportPortable');
      });
      await expect.poll(() => fs.existsSync(ziel), { timeout: 30000 }).toBe(true);
      await expect
        .poll(() => fs.readFileSync(ziel, 'utf8').includes('Schluss.'), { timeout: 30000 })
        .toBe(true);

      // Die exportierte Datei ERNEUT OEFFNEN und die Anzeige pruefen — nicht
      // den Datei-Inhalt. Zwischen beidem liegt der Sanitizer.
      const section = page.locator('.pane-group[data-pane="0"] .sidebar-area');
      await section.locator('.area-dir-row', { hasText: 'quelle' }).first().click();
      // 4T-001775 (Epic 3E-000304): Beschriftung ohne Markdown-Endung.
      await section
        .locator('.area-file-row', { hasText: /^export$/ })
        .first()
        .click();
      await expect(page.locator(`${SEL.markdownBody0} img`)).toHaveCount(1, { timeout: 20000 });
      const geladen = await page
        .locator(`${SEL.markdownBody0} img`)
        .first()
        .evaluate((el) => el.complete && el.naturalWidth > 0);
      expect(geladen, 'Bild der exportierten Datei ist geladen').toBe(true);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('der Live-Modus zeigt das eingebettete Bild', async () => {
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), png);
    // Text VOR und NACH der Einbettung: Der Live-Modus zeigt die Zeile mit der
    // Schreibmarke als Quelltext, und die steht nach dem Öffnen am Anfang.
    // Ohne diesen Abstand prüfte der Fall eine aufgeklappte Zeile statt des
    // Widgets — eine unausgesprochene Annahme über sein Umfeld.
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\nText davor.\n\n![[../anlagen/bild.png]]\n\nText danach.\n',
    );
    try {
      await page.locator(SEL.viewBtn('live')).click();
      await expect(page.locator(SEL.content0)).toHaveClass(/view-live/);
      // Das Bild steht im Live-Modus zweimal im DOM: im Widget des Editors und
      // im versteckten Render-Pane derselben Spalte. Geprüft wird das Widget.
      const bild = page.locator(`${SEL.content0} .cm-live-embed img.wiki-embed-image`);
      await expect(bild).toHaveCount(1, { timeout: 20000 });
      expect(await bild.first().evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});

// EB-08 (4T-001487): Die Ausgabe wartet auf ihre Einbettungen.
//
// **Anlass, am laufenden Programm gemessen:** Mit verzögerter Auflösung
// enthielt das erzeugte PDF weder das eingebettete Bild noch die eingebettete
// Datei — die Druck-Vorbereitung kannte fünf Idle-Barrieren, aber keine für
// Einbettungen. Für Bilder ist das eine Folge von 4T-001486 (sie sind seither
// asynchron), für Markdown-Einbettungen ein Bestands-Fehler seit ihrer
// Einführung.
//
// **Warum die Verzögerung:** Ohne sie wäre der Fall ein Rennen — mal grün,
// mal rot. Der gestellte Kanal antwortet erst nach zwei Sekunden und macht
// daraus eine Entscheidung: Wartet die Ausgabe nicht, rastert sie den leeren
// Platzhalter.
//
// **Warum am Bild-Objekt gemessen wird und nicht am Text:** Text steht im PDF
// als Glyphen-Folge einer eingebetteten Schrift; eine Suche danach findet auch
// den Text der Haupt-Datei nicht (nachgemessen). Ein Bild-Objekt dagegen ist
// im PDF strukturell sichtbar. Das eingebettete Dokument enthält deshalb
// seinerseits ein Bild — damit belegt ein Treffer beides auf einmal: dass die
// Markdown-Einbettung aufgelöst wurde und dass die VERSCHACHTELTE
// Bild-Einbettung darin mit ihr fertig wurde.
function pdfBildObjekte(buffer) {
  const treffer = buffer.toString('latin1').match(/\/Subtype\s*\/Image/g);
  return treffer ? treffer.length : 0;
}

const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Beide Embed-Kanäle verzögern und danach ein gültiges Ergebnis liefern.
async function verzoegereEmbeds(app, wurzel, ms) {
  await app.evaluate(
    async ({ ipcMain }, daten) => {
      const warte = (n) => new Promise((r) => setTimeout(r, n));
      ipcMain.removeHandler('embed:readImage');
      ipcMain.handle('embed:readImage', async () => {
        await warte(daten.ms);
        return { ok: true, path: daten.bildPfad, dataUrl: daten.dataUrl };
      });
      ipcMain.removeHandler('embed:read');
      ipcMain.handle('embed:read', async () => {
        await warte(daten.ms);
        return {
          ok: true,
          path: daten.mdPfad,
          displayPath: 'nachbar.md',
          content: '# Nachbar\n\n![[bild.png]]\n',
        };
      });
    },
    {
      ms,
      bildPfad: path.join(wurzel, 'anlagen', 'bild.png'),
      mdPfad: path.join(wurzel, 'anlagen', 'nachbar.md'),
      dataUrl: `data:image/png;base64,${MINI_PNG.toString('base64')}`,
    },
  );
}

test.describe('EB-08: Die Ausgabe wartet auf ihre Einbettungen (4T-001487)', () => {
  test('das PDF enthaelt die verzoegert aufgeloeste Einbettung samt ihrer eigenen', async () => {
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), MINI_PNG);
    fs.writeFileSync(
      path.join(wurzel, 'anlagen', 'nachbar.md'),
      '# Nachbar\n\n![[bild.png]]\n',
      'utf8',
    );
    const ziel = path.join(wurzel, 'ausgabe.pdf');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[../anlagen/nachbar.md]]\n',
    );
    try {
      await verzoegereEmbeds(app, wurzel, 2000);
      await app.evaluate(({ dialog }, z) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: z });
      }, ziel);
      // SOFORT exportieren, ohne auf die Aufloesung zu warten — genau das tut
      // ein Anwender, der das Kuerzel drueckt.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:exportPdf');
      });
      await expect.poll(() => fs.existsSync(ziel), { timeout: 60000 }).toBe(true);
      await page.waitForTimeout(1000);

      const buffer = fs.readFileSync(ziel);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(
        pdfBildObjekte(buffer),
        'Bild der verschachtelten Einbettung steht im PDF',
      ).toBeGreaterThan(0);
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });

  test('eine haengende Aufloesung verhindert die Ausgabe nicht', async () => {
    // Zeit-Grenze der Barriere: Ein Ziel, das nie antwortet, darf die Ausgabe
    // verzoegern, aber nicht blockieren.
    const wurzel = makeBereich();
    fs.mkdirSync(path.join(wurzel, 'anlagen'));
    fs.writeFileSync(path.join(wurzel, 'anlagen', 'bild.png'), MINI_PNG);
    const ziel = path.join(wurzel, 'ausgabe.pdf');
    const { app, page, userData } = await starteMitEinbettung(
      wurzel,
      '# Aktiv\n\n![[../anlagen/bild.png]]\n',
    );
    try {
      // 120 Sekunden: weit jenseits der Zeit-Grenze von fuenf Sekunden.
      await verzoegereEmbeds(app, wurzel, 120000);
      await app.evaluate(({ dialog }, z) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: z });
      }, ziel);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) win.webContents.send('menu:exportPdf');
      });
      // Die Datei entsteht trotzdem — die Barriere gibt nach ihrer Grenze auf.
      await expect.poll(() => fs.existsSync(ziel), { timeout: 60000 }).toBe(true);
      await expect(page.locator('body.printing')).toHaveCount(0);
    } finally {
      removeDir(wurzel);
      await closeApp(app, userData);
    }
  });
});
