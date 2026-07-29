// 4T-0642 / 4T-0789 (Epic 3E-0125): E2E-Suite fuer das Ablegen von Anlagen.
//
// AN-01 bis AN-04: Einfuegen aus der Zwischenablage. Die Pfad-Rechnung selbst
// ist in attachment-path.test.js bewiesen; hier laeuft der echte Editor-Pfad
// ueber Preload und Hauptprozess, inklusive der Faelle, die nur dort sichtbar
// werden (Ablage auf der Platte, erzeugter Verweis, Rueckfall bei ungespeichertem
// Dokument).
//
// AN-05 bis AN-07: Ziehen auf die Dokument-Flaechen und die Abgrenzung gegen
// den bestehenden Oeffnen-Weg.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');
const { SEL } = require('../helpers/selectors');

// 1x1-PNG, ausreichend als Datei-Inhalt; die Sicht-Pruefung leistet das
// manuelle Test-Material, hier zaehlt allein die Ablage.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Aufraeumen darf den Lauf nicht rot machen */
  }
}

// Wartet auf den INHALT des Ablage-Ordners, nicht auf dessen blosse Existenz.
// Der Ordner entsteht mit mkdir und ist einen Wimpernschlag vor der Datei da;
// ein Test, der auf ihn wartet und dann liest, sieht sporadisch ein leeres
// Verzeichnis (Stabilitaetsregel 12 in test/README).
async function dateienIn(ordner, anzahl) {
  await expect
    .poll(() => (fs.existsSync(ordner) ? fs.readdirSync(ordner).length : 0), { timeout: 5000 })
    .toBe(anzahl);
  return fs.readdirSync(ordner);
}

// Synthetisches paste-Ereignis mit einer Datei im DataTransfer. Ein echtes
// System-Clipboard laesst sich im Testlauf nicht mit Datei-Inhalt belegen; der
// Handler haengt am DOM-Ereignis, und genau das wird hier ausgeloest. Der Weg
// deckt damit den Bytes-Zweig ab (ohne Quell-Pfad), also den Fall
// „Bildschirmfoto".
async function pasteDatei(page, dateiname, mimeTyp, base64) {
  await page.evaluate(
    ({ dateiname, mimeTyp, base64 }) => {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], dateiname, { type: mimeTyp }));
      const ziel = document.querySelector('.pane-group[data-pane="0"] .pane-source .cm-content');
      ziel.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { dateiname, mimeTyp, base64 },
  );
}

test.describe('AN-01/AN-02: Anlage aus der Zwischenablage ablegen und verlinken', () => {
  test('Bild landet im Ordner mit dem Namen des Dokuments und wird verlinkt', async () => {
    const workDir = makeWorkDir('an01-');
    const file = path.join(workDir, 'Protokoll.md');
    fs.writeFileSync(file, '# Protokoll\n\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      // In den Bearbeiten-Modus, damit der Editor das Ereignis annimmt.
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();

      await pasteDatei(page, 'image.png', 'image/png', PNG_BASE64);

      // AN-01: Die Datei liegt in der Voreinstellung, also im Ordner mit dem
      // Namen des Dokuments.
      const dateien = await dateienIn(path.join(workDir, 'Protokoll'), 1);
      // Name aus Dokumentname, Unterstrich, Datum-Uhrzeit.
      expect(dateien[0]).toMatch(/^Protokoll_\d{8}-\d{6}\.png$/);

      // AN-02: Der Verweis steht im Quelltext, als Bild-Verweis mit gefuelltem
      // Alt-Text und dokumentrelativem Pfad.
      const editorText = await page.locator(SEL.editorContent0).innerText();
      expect(editorText).toContain('![Protokoll_');
      expect(editorText).toContain('](Protokoll/Protokoll_');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('AN-03: sonstige Datei wird als Link statt als Bild verwiesen', () => {
  test('eine Nicht-Bild-Anlage erzeugt einen gewoehnlichen Markdown-Link', async () => {
    const workDir = makeWorkDir('an03-');
    const file = path.join(workDir, 'Notiz.md');
    fs.writeFileSync(file, '# Notiz\n\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();

      await pasteDatei(page, 'Bericht.pdf', 'application/pdf', PNG_BASE64);

      expect(await dateienIn(path.join(workDir, 'Notiz'), 1)).toEqual(['Bericht.pdf']);

      const editorText = await page.locator(SEL.editorContent0).innerText();
      // Link, KEIN Bild-Verweis: kein fuehrendes Ausrufezeichen.
      expect(editorText).toContain('[Bericht](Notiz/Bericht.pdf)');
      expect(editorText).not.toContain('![Bericht]');
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

// Synthetischer Zieh-Vorgang auf einem Selektor: dragenter, dragover, drop.
// Wie beim Einfuegen laesst sich ein echtes OS-Ziehen im Testlauf nicht
// ausloesen; die Handler haengen am DOM-Ereignis, und die Ablege-Zone leitet
// sich aus e.target ab — genau das wird hier gesetzt.
//
// Die beiden Ereignisse VOR dem Drop sind nicht schmueckendes Beiwerk: Erst sie
// blenden die Ueberlagerung ein. Ohne sie liefe jede Pruefung, ob die
// Ueberlagerung nach dem Ablegen wieder verschwindet, ins Leere, weil sie nie
// sichtbar gewesen waere.
async function dropDatei(page, selektor, dateiname, mimeTyp, base64) {
  await page.evaluate(
    ({ selektor, dateiname, mimeTyp, base64 }) => {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const ziel = document.querySelector(selektor);
      const rect = ziel.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      // Je Ereignis ein frischer DataTransfer mit derselben Datei; die Handler
      // lesen ihn unabhaengig voneinander aus.
      const mitDatei = () => {
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], dateiname, { type: mimeTyp }));
        return dt;
      };
      for (const typ of ['dragenter', 'dragover', 'drop']) {
        ziel.dispatchEvent(
          new DragEvent(typ, {
            dataTransfer: mitDatei(),
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      }
    },
    { selektor, dateiname, mimeTyp, base64 },
  );
}

test.describe('AN-05/AN-06: Ziehen legt auf beiden Dokument-Flaechen ab', () => {
  test('Editor-Flaeche und Render-Ansicht nehmen die Anlage entgegen', async () => {
    const workDir = makeWorkDir('an05-');
    const file = path.join(workDir, 'Bericht.md');
    fs.writeFileSync(file, '# Bericht\n\nText.\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.btnEdit).click();

      // AN-05: Ziehen auf die Editor-Flaeche legt ab.
      await dropDatei(page, SEL.editorContent0, 'gezogen.png', 'image/png', PNG_BASE64);
      const zielOrdner = path.join(workDir, 'Bericht');
      expect(await dateienIn(zielOrdner, 1)).toEqual(['gezogen.png']);
      await expect(page.locator(SEL.editorContent0)).toContainText(
        '![gezogen](Bericht/gezogen.png)',
      );

      // AN-06: Ziehen auf die Render-Ansicht legt ebenfalls ab; der Verweis
      // landet am Dokument-Ende, weil es dort keine Schreibmarke gibt.
      await dropDatei(page, SEL.markdownBody0, 'zweite.png', 'image/png', PNG_BASE64);
      await dateienIn(zielOrdner, 2);
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).toContain('![zweite](Bericht/zweite.png)');
      expect(text.trimEnd().endsWith('![zweite](Bericht/zweite.png)')).toBe(true);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

// Regression zum Befund des Product Owners aus der Test-Iteration zu 4T-0789:
// Beim Ziehen einer TEXTdatei stand anschliessend beides im Dokument, der
// Verweis UND der komplette Datei-Inhalt. Ursache war der eingebaute
// drop-Handler des Editor-Moduls, der eine gezogene Datei per FileReader als
// Text einliest; er lief vor dem Fenster-Handler. Ohne den Fix ist dieser Fall
// rot, weil der Dateiinhalt im Dokument landet.
test.describe('AN-12: gezogene Textdatei fuegt nur den Verweis ein', () => {
  test('der Inhalt der Datei landet NICHT zusaetzlich im Dokument', async () => {
    const workDir = makeWorkDir('an12-');
    const file = path.join(workDir, 'Ziel.md');
    fs.writeFileSync(file, '# Ziel\n\n', 'utf8');
    const INHALT = 'ZEILE-AUS-DER-TEXTDATEI';

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.locator(SEL.btnEdit).click();

      // Textdatei ziehen: base64 des Inhalts, damit der Helfer sie unveraendert
      // als Datei-Inhalt uebergibt.
      const b64 = Buffer.from(INHALT, 'utf8').toString('base64');
      await dropDatei(page, SEL.editorContent0, 'Notiz.txt', 'text/plain', b64);

      expect(await dateienIn(path.join(workDir, 'Ziel'), 1)).toEqual(['Notiz.txt']);
      // Zweiter Befund des Product Owners: Die Ueberlagerung blieb nach dem
      // Ablegen stehen, weil der Editor-Handler die Weitergabe stoppt und der
      // Fenster-Handler sie deshalb nicht mehr ausblendete. Ohne den
      // Capture-Aufraeumer ist diese Zeile rot.
      await expect(page.locator('#drop-overlay')).toBeHidden();
      // Der Verweis steht im Dokument …
      await expect(page.locator(SEL.editorContent0)).toContainText('[Notiz](Ziel/Notiz.txt)');
      // … der Datei-INHALT dagegen nicht. Das ist der eigentliche Befund.
      // Kurz warten, weil der eingebaute Handler asynchron liest (FileReader)
      // und der Text sonst erst nach der Pruefung erschiene.
      await page.waitForTimeout(700);
      const text = await page.locator(SEL.editorContent0).innerText();
      expect(text).not.toContain(INHALT);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('AN-07: ausserhalb der Dokument-Flaechen entsteht keine Anlage', () => {
  // Was dieser Fall NICHT zeigt: dass die Datei stattdessen geoeffnet wird. Der
  // Oeffnen-Pfad braucht einen echten Betriebssystem-Pfad (getPathForFile), den
  // eine im Testlauf erzeugte Datei nicht hat. Geprueft ist deshalb genau die
  // Abgrenzung, um die es hier geht: Ausserhalb der beiden Dokument-Flaechen
  // greift der Anlagen-Zweig nicht, und der Bestands-Weg bleibt unberuehrt.
  test('auf der Reiterleiste abgelegt wird nichts angehaengt', async () => {
    const workDir = makeWorkDir('an07-');
    const file = path.join(workDir, 'Start.md');
    fs.writeFileSync(file, '# Start\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0)).toHaveCount(1);
      const vorher = await page.locator(SEL.editorContent0).innerText();

      await dropDatei(page, SEL.tabbar0, 'gezogen.png', 'image/png', PNG_BASE64);

      // Weder ein Anlagen-Ordner noch ein Verweis entsteht.
      await page.waitForTimeout(500);
      expect(fs.existsSync(path.join(workDir, 'Start'))).toBe(false);
      expect(fs.readdirSync(workDir)).toEqual(['Start.md']);
      expect(await page.locator(SEL.editorContent0).innerText()).toBe(vorher);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

// Faengt shell.openPath im Hauptprozess ab und sammelt die Aufrufe. Ohne das
// wuerde der Testlauf echte Programme starten; geprueft werden soll, DASS und
// WOMIT geoeffnet wird, nicht das Programm selbst.
async function fangeOeffnenAb(app) {
  await app.evaluate(({ shell }) => {
    globalThis.__geoeffnet = [];
    shell.openPath = async (p) => {
      globalThis.__geoeffnet.push(p);
      return '';
    };
  });
}

const geoeffnete = (app) => app.evaluate(() => globalThis.__geoeffnet || []);

test.describe('AN-08/AN-09: Anlagen aus dem Dokument heraus oeffnen', () => {
  test('Klick auf eine verlinkte Anlage und auf ein Bild oeffnet die Standardanwendung', async () => {
    const workDir = makeWorkDir('an08-');
    fs.mkdirSync(path.join(workDir, 'Doku'));
    fs.writeFileSync(path.join(workDir, 'Doku', 'bericht.pdf'), 'PDF', 'utf8');
    fs.writeFileSync(path.join(workDir, 'Doku', 'bild.png'), Buffer.from(PNG_BASE64, 'base64'));
    const file = path.join(workDir, 'Doku.md');
    fs.writeFileSync(
      file,
      '# Doku\n\n[bericht](Doku/bericht.pdf)\n\n![bild](Doku/bild.png)\n',
      'utf8',
    );

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);
      const body = page.locator(SEL.markdownBody0);

      // AN-08: verlinkte Anlage. Ohne diesen Vorgang verpuffte der Klick.
      await body.locator('a[href="Doku/bericht.pdf"]').click();
      await expect
        .poll(() => geoeffnete(app), { timeout: 5000 })
        .toEqual([path.join(workDir, 'Doku', 'bericht.pdf')]);

      // AN-09: eingebettetes Bild, einfacher Klick in der Render-Ansicht.
      // Das Bild traegt nach der Aufloesung einen data:-URI in src; die
      // Original-Quelle steht in data-src-original.
      await body.locator('img').first().click();
      await expect.poll(async () => (await geoeffnete(app)).length, { timeout: 5000 }).toBe(2);
      expect((await geoeffnete(app))[1]).toBe(path.join(workDir, 'Doku', 'bild.png'));
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('AN-10: die Wurzel begrenzt auch das Oeffnen', () => {
  test('ein Ziel ausserhalb des Dokument-Ordners wird nicht geoeffnet', async () => {
    const workDir = makeWorkDir('an10-');
    fs.mkdirSync(path.join(workDir, 'doc'));
    fs.writeFileSync(path.join(workDir, 'fremd.pdf'), 'PDF', 'utf8');
    const file = path.join(workDir, 'doc', 'Doku.md');
    fs.writeFileSync(file, '# Doku\n\n[fremd](../fremd.pdf)\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await fangeOeffnenAb(app);

      await page.locator(SEL.markdownBody0).locator('a[href="../fremd.pdf"]').click();

      // Nichts wurde geoeffnet, und der Anwender sieht warum.
      const hint = page.locator('.statusbar-hint.visible');
      await expect(hint).toBeVisible({ timeout: 5000 });
      await expect(hint).toHaveClass(/error/);
      expect(await geoeffnete(app)).toEqual([]);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

const SETTINGS_PAGE = '.pane-group[data-pane="0"] .pane-system .settings-page';

async function oeffneEinstellungen(page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Control+,');
      return page.locator(`${SETTINGS_PAGE} .settings-nav-entry`).count();
    })
    .toBeGreaterThan(0);
}

test.describe('AN-11: Einstellung steuert den Ablage-Ort', () => {
  test('umgestellt auf „Neben dem Dokument" landet die Anlage dort', async () => {
    const workDir = makeWorkDir('an11-');
    const file = path.join(workDir, 'Doku.md');
    fs.writeFileSync(file, '# Doku\n\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await oeffneEinstellungen(page);
      await page
        .locator(`${SETTINGS_PAGE} .settings-nav-entry[data-section-id="attachments"]`)
        .click();

      // Voreinstellung ist der Ordner mit dem Namen des Dokuments.
      const select = page.locator('#settings-attachments-form');
      await expect(select).toHaveValue('dokument');
      // Das Namensfeld ist dabei inaktiv, weil diese Form keinen braucht.
      await expect(page.locator('#settings-attachments-folder')).toBeDisabled();

      await select.selectOption('fest');
      // Jetzt wird ein Name gebraucht, das Feld ist aktiv.
      await expect(page.locator('#settings-attachments-folder')).toBeEnabled();
      await select.selectOption('neben');
      await page.locator('#btn-settings-apply').click();

      // Zurueck ins Dokument und einfuegen: die Anlage liegt jetzt DANEBEN.
      await page.locator(SEL.tabs0).first().click();
      await page.locator(SEL.btnEdit).click();
      await page.locator(SEL.editorContent0).click();
      await pasteDatei(page, 'image.png', 'image/png', PNG_BASE64);

      await expect.poll(() => fs.readdirSync(workDir).length, { timeout: 5000 }).toBe(2);
      const eintraege = fs.readdirSync(workDir);
      // Positionsfrei pruefen: '.' sortiert vor '_', die Reihenfolge waere
      // sonst eine stille Annahme.
      expect(eintraege).toContain('Doku.md');
      expect(eintraege.some((n) => /^Doku_\d{8}-\d{6}\.png$/.test(n))).toBe(true);
      // Kein Unterordner entstanden.
      expect(fs.existsSync(path.join(workDir, 'Doku'))).toBe(false);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});

test.describe('AN-04: ungespeichertes Dokument meldet sich, statt still zu scheitern', () => {
  test('ohne Datei-Pfad erscheint ein Hinweis und nichts wird abgelegt', async () => {
    const workDir = makeWorkDir('an04-');
    const file = path.join(workDir, 'Vorhanden.md');
    fs.writeFileSync(file, '# Vorhanden\n\n', 'utf8');

    const { app, page, userData } = await launchApp({ args: [file] });
    try {
      // Mit einer Datei starten, damit der Renderer steht, dann einen ZWEITEN,
      // ungespeicherten Reiter anlegen. Im leeren Fenster nimmt der
      // Empty-State den Tastendruck nicht an.
      await expect(page.locator(SEL.tabs0).first()).toBeVisible();
      await page.keyboard.press('Control+n');
      await expect(page.locator(SEL.tabs0)).toHaveCount(2);
      // Ein NEUER Reiter steht bereits im Bearbeiten-Modus (nachgemessen); ein
      // Klick auf den Umschalter machte ihn read-only, und dann greift der
      // Anlagen-Zweig zu Recht nicht mehr.
      await expect(page.locator(SEL.paneSourceEditor0)).not.toHaveClass(/read-only/);
      await page.locator(SEL.editorContent0).click();

      await pasteDatei(page, 'image.png', 'image/png', PNG_BASE64);

      // Der Hinweis erscheint in der Statusbar, der Quelltext bleibt leer.
      const hint = page.locator('.statusbar-hint.visible');
      await expect(hint).toBeVisible({ timeout: 5000 });
      await expect(hint).toHaveClass(/error/);
      const editorText = await page.locator(SEL.editorContent0).innerText();
      expect(editorText).not.toContain('![');
      // Auch auf der Platte ist nichts entstanden.
      expect(fs.readdirSync(workDir)).toEqual(['Vorhanden.md']);
    } finally {
      await closeApp(app, userData, { force: true });
      removeDir(workDir);
    }
  });
});
