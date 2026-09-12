// 4T-001593 und 4T-001594 (Story 4S-000905, Epic 3E-000129): E2E-Funktions-
// Suite der eigenen Sprachdateien.
//
// SE-01: Eine gültige Datei landet im Benutzerprofil und überdauert den
// Programm-Start; SE-02: eine bösartig präparierte Datei wird abgewiesen und
// lässt den Bestand unangetastet; SE-03: dieselbe Sprache erneut einspielen
// fragt nach und ersetzt erst nach Bestätigung; SE-04: unbekannte Schlüssel
// werden übersprungen und gemeldet.
//
// 4T-001594 setzt die Reihe an der Stelle fort, an der die Sprache benutzbar
// wird: SE-05 Auswahl und Wechsel, SE-06 Beständigkeit über den Start, SE-07
// sichtbarer Rückfall bei fehlender Datei (AK6), SE-08 Entfernen.
//
// 4T-001595 ergänzt SE-09: eine bewusst UNVOLLSTÄNDIGE eigene Sprache — der
// Rückfall gilt je Schlüssel und geht auf Englisch, und die Lücke bleibt still.
//
// 4T-001596 macht die Lücke sichtbar: SE-10 der Alterungs-Hinweis samt seiner
// Wiederholungs-Sperre über den Programm-Start hinweg, SE-11 die Ausgabe der
// aktualisierten eigenen Sprachdatei.
//
// **Warum diese drei am laufenden Programm und nicht in der Unit-Suite:** Die
// Prüfung selbst misst `test/unit/locale-file.test.js` mit 26 Fällen und neun
// Rot-Proben. Hier geht es um das, was dort nicht messbar ist — dass die Datei
// wirklich im Benutzerprofil ankommt, den Start überdauert und dass nach einer
// Abweisung dort nichts liegt.
//
// Öffnen- und Bestätigungs-Dialog werden gestellt (Muster
// einbettungen.spec.js); die nativen Dialoge sind nicht Gegenstand des Weges.
//
// describe-Titel tragen die Matrix-ID (test/abdeckungs-matrix.json, F-286).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/app');

const WURZEL = path.join(__dirname, '..', '..', '..');
const I18N = path.join(WURZEL, 'src', 'i18n');
const EN = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));
const DE = JSON.parse(fs.readFileSync(path.join(I18N, 'de.json'), 'utf8'));

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // unkritisch
  }
}

// Ein Schlüssel mit schlichtem Text — aus dem echten Bestand gesucht, nicht
// behauptet: Eine Vorbelegung, die eine Form behauptet, teilt den Fehler, den
// sie finden soll (Lehre aus 4T-001588).
const SCHLICHT = Object.keys(EN).find(
  (k) => !/[`*[\]<>{}]/.test(EN[k]) && EN[k].length > 5 && EN[k].length < 60,
);

async function stelleOeffnenDialog(app, ziel) {
  await app.evaluate(({ dialog }, z) => {
    dialog.showOpenDialog = async () =>
      z ? { canceled: false, filePaths: [z] } : { canceled: true, filePaths: [] };
  }, ziel);
}

// Stellt die Ersetzen-Rückfrage auf eine feste Antwort (0 = ersetzen, 1 = nein).
async function stelleRueckfrage(app, antwort) {
  await app.evaluate(({ dialog }, a) => {
    dialog.showMessageBox = async () => ({ response: a });
  }, antwort);
}

async function loeseAus(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:importLocale');
  });
}

// Die abgelegte Datei heisst nach dem Sprach-Code aus @@locale, nicht nach
// dem Namen der eingespielten Datei.
const abgelegt = (userData, code) => path.join(userData, 'locales', `${code}.json`);

// Eine Sprachdatei, wie der Anwender sie erzeugt: Identität oben, Werte danach.
function sprachdatei(code, name, werte) {
  return JSON.stringify({ '@@locale': code, '@@name': name, ...werte }, null, 2) + '\n';
}

// --- 4T-001594: Auswahl, Wechsel, Beständigkeit, Rückfall, Entfernen --------

// Ein Schlüssel, dessen Text die Oberfläche als sichtbaren Inhalt trägt — aus
// index.html gesucht, nicht behauptet (Lehre aus 4T-001588). SCHLICHT oben
// taugt dafür nicht: Sein Text steht nirgends als data-i18n im Gerüst, und ein
// Fall, der einen unsichtbaren Text prüft, prüft nichts.
const HTML = fs.readFileSync(path.join(WURZEL, 'src', 'renderer', 'index.html'), 'utf8');
const SICHTBARE = [...HTML.matchAll(/data-i18n="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((k) => EN[k] && !/[`*[\]<>{}]/.test(EN[k]) && EN[k].length > 5 && EN[k].length < 60);
const SICHTBAR = SICHTBARE[0];
// 4T-001595: Ein ZWEITER sichtbarer Schlüssel, verschieden vom ersten — SE-09
// braucht einen, den die eingespielte Datei bewusst NICHT kennt.
const SICHTBAR_2 = SICHTBARE.find((k) => k !== SICHTBAR);
const EIGENER_TEXT = 'Op Platt un nich anners';

// **Warum die eigenen Sprachdateien der Fälle SE-05 bis SE-08 VOLLSTÄNDIG
// sind.** Vor 4T-001595 gab es den Rückfall je fehlendem Schlüssel nicht: Die
// Oberfläche zeigte für jeden Schlüssel, den die Datei nicht kannte, seinen
// Namen — und meldete ihn als Konsolen-Fehler (4T-000900). Eine Datei mit zwei
// Einträgen machte jeden Fall über den Konsolen-Wächter rot, ohne dass etwas
// kaputt wäre. Ein Übersetzer liefert ohnehin einen vollständigen Katalog;
// diese Fälle bilden genau das ab und ändern nur den einen geprüften Text.
//
// 4T-001595 hat den Zwang aufgehoben, aber nicht die Zweckmäßigkeit: SE-05 bis
// SE-08 messen Auswahl, Beständigkeit, Rückfall der ganzen Datei und Entfernen
// — und tun das an dem Fall, den ein Übersetzer abliefert. Die unvollständige
// Datei ist der eigene Gegenstand von SE-09, unten.
function vollstaendigeSprachdatei(code, name, ersetzungen = {}) {
  return sprachdatei(code, name, { ...EN, ...ersetzungen });
}

// Die Entfernen-Rückfrage des Hauptprozesses ist derselbe showMessageBox wie
// die Ersetzen-Rückfrage; stelleRueckfrage(app, 0) wählt die erste Schaltfläche.
async function loeseEntfernenAus(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:removeLocale');
  });
}

// Die Einstellung, wie sie auf der Platte steht — die Frage «überdauert das den
// Start» beantwortet nur die Datei, nicht die Oberfläche.
function gespeicherteSprache(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).language;
  } catch {
    return undefined;
  }
}

// Spielt die Datei ein und wartet, bis sie im Benutzerprofil liegt.
async function spieleEin(app, quelle, userData, code) {
  await stelleOeffnenDialog(app, quelle);
  await expect
    .poll(
      async () => {
        await loeseAus(app);
        return fs.existsSync(abgelegt(userData, code));
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

test.describe('SE-01: gültige Sprachdatei einspielen (F-286)', () => {
  test('legt sie im Benutzerprofil ab und meldet den Umfang', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    // Der Datei-Name ist bewusst NICHTSSAGEND: Die Identität steht in der
    // Datei, und genau das misst der Fall.
    const quelle = path.join(temp, 'irgendein-name (1).json');
    fs.writeFileSync(
      quelle,
      sprachdatei('nds', 'Plattdüütsch', { [SCHLICHT]: 'Een ganz normale Text.' }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await stelleOeffnenDialog(app, quelle);
      await expect
        .poll(
          async () => {
            await loeseAus(app);
            return fs.existsSync(abgelegt(userData, 'nds'));
          },
          { timeout: 30000 },
        )
        .toBe(true);

      const inhalt = JSON.parse(fs.readFileSync(abgelegt(userData, 'nds'), 'utf8'));
      expect(inhalt[SCHLICHT]).toBe('Een ganz normale Text.');
      // Die abgelegte Datei trägt ihre Identität weiter — wer sie im
      // Benutzerprofil ansieht, erkennt die Sprache ohne den Datei-Namen.
      expect(inhalt['@@locale']).toBe('nds');
      expect(inhalt['@@name']).toBe('Plattdüütsch');
      // Die Meldung nennt den Namen aus der Datei und die Zahl der Einträge.
      await expect(page.locator('#statusbar-hint')).toContainText('Plattdüütsch');
      await expect(page.locator('#statusbar-hint')).toContainText('1');
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-02: bösartig präparierte Datei (F-286)', () => {
  test('wird abgewiesen, und im Benutzerprofil liegt nichts', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'boese.json');
    // Ein Link in einem Schlüssel, den das Original als schlichten Text führt:
    // Er erschiene in der generierten Handbuch-Seite als echter Link.
    fs.writeFileSync(
      quelle,
      sprachdatei('xyz', 'Böse Sprache', { [SCHLICHT]: 'Klick [hier](https://example.invalid).' }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await stelleOeffnenDialog(app, quelle);
      // Der Hinweis ist die Wirkung, auf die gewartet wird — eine ausbleibende
      // Datei allein hiesse nur, dass noch nichts geschehen ist.
      await expect
        .poll(
          async () => {
            await loeseAus(app);
            return page.locator('#statusbar-hint').getAttribute('class');
          },
          { timeout: 30000 },
        )
        .toContain('error');

      await expect(page.locator('#statusbar-hint')).toContainText(SCHLICHT);
      expect(fs.existsSync(abgelegt(userData, 'xyz'))).toBe(false);
      // Der Ablage-Ordner bleibt leer oder entsteht gar nicht erst.
      const ordner = path.join(userData, 'locales');
      expect(!fs.existsSync(ordner) || fs.readdirSync(ordner).length === 0).toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-03: dieselbe Sprache erneut einspielen (F-286)', () => {
  test('fragt nach und ersetzt erst nach Bestätigung', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'zweimal.json');
    fs.writeFileSync(
      quelle,
      sprachdatei('nds', 'Plattdüütsch', { [SCHLICHT]: 'Erste Fassung.' }),
      'utf8',
    );

    const { app, userData } = await launchApp({ settings: { language: 'de' } });
    const ziel = abgelegt(userData, 'nds');
    try {
      await stelleOeffnenDialog(app, quelle);
      await expect
        .poll(
          async () => {
            await loeseAus(app);
            return fs.existsSync(ziel);
          },
          { timeout: 30000 },
        )
        .toBe(true);

      // Zweiter Anlauf mit geänderter Datei, Rückfrage verneint: Der Bestand
      // bleibt die erste Fassung.
      fs.writeFileSync(
        quelle,
        sprachdatei('nds', 'Plattdüütsch', { [SCHLICHT]: 'Zweite Fassung.' }),
        'utf8',
      );
      await stelleRueckfrage(app, 1);
      await loeseAus(app);
      await new Promise((r) => setTimeout(r, 1500));
      expect(JSON.parse(fs.readFileSync(ziel, 'utf8'))[SCHLICHT]).toBe('Erste Fassung.');

      // Dritter Anlauf, Rückfrage bejaht: Jetzt wird ersetzt.
      await stelleRueckfrage(app, 0);
      await expect
        .poll(
          async () => {
            await loeseAus(app);
            return JSON.parse(fs.readFileSync(ziel, 'utf8'))[SCHLICHT];
          },
          { timeout: 30000 },
        )
        .toBe('Zweite Fassung.');
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-04: unbekannte Schlüssel (F-286)', () => {
  test('werden übersprungen und gemeldet, statt die Datei abzuweisen', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'alt.json');
    fs.writeFileSync(
      quelle,
      sprachdatei('nds', 'Plattdüütsch', { [SCHLICHT]: 'Gültig.', 'aus.alter.fassung': 'Rest' }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await stelleOeffnenDialog(app, quelle);
      await expect
        .poll(
          async () => {
            await loeseAus(app);
            return fs.existsSync(abgelegt(userData, 'nds'));
          },
          { timeout: 30000 },
        )
        .toBe(true);

      const inhalt = JSON.parse(fs.readFileSync(abgelegt(userData, 'nds'), 'utf8'));
      // Die Metadaten und der eine bekannte Schlüssel; der unbekannte fehlt.
      expect(Object.keys(inhalt)).toEqual(['@@locale', '@@name', SCHLICHT]);
      // Die Meldung nennt den abgeleiteten Sprach-Namen und beide Zahlen: den
      // Umfang und die Lücke. Geprüft wird gegen die Sache, nicht gegen ein
      // Text-Fragment mit rohem Platzhalter — der Wortlaut darf sich ändern.
      const hinweis = page.locator('#statusbar-hint');
      await expect(hinweis).toContainText('Plattdüütsch');
      await expect(hinweis).toContainText('1');
      // Der Rahmen-Satz stammt aus der deutschen Fassung, ohne die Platzhalter.
      const anfang = DE['locales.import.doneWithSkipped'].split('{name}')[0].trim();
      if (anfang) await expect(hinweis).toContainText(anfang);
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-05: eigene Sprache auswählen und wechseln (F-286)', () => {
  test('steht in einer eigenen Gruppe der Auswahl und wirkt nach der Wahl', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'platt.json');
    fs.writeFileSync(
      quelle,
      vollstaendigeSprachdatei('nds', 'Plattdüütsch', { [SICHTBAR]: EIGENER_TEXT }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await spieleEin(app, quelle, userData, 'nds');

      // AK1 und AK4: Die Auswahl zieht ohne Neustart nach. Der Eintrag steht in
      // einer <optgroup> — gleichrangig wählbar, aber als eingespielt erkennbar
      // (Plan-Freigabe vom 2026-09-10, Frage 2). Der Text ist der Name aus
      // `@@name`, nicht der Datei- oder Code-Name.
      const eintrag = page.locator('#lang-select optgroup > option[value="custom:nds"]');
      await expect(eintrag).toHaveCount(1, { timeout: 20000 });
      await expect(eintrag).toHaveText('Plattdüütsch');

      // AK2: Nach der Wahl spricht das Fenster die eigene Sprache.
      await page.selectOption('#lang-select', 'custom:nds');
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EIGENER_TEXT);

      // Das Sprach-Attribut des Dokuments trägt den Code aus `@@locale`:
      // 'custom:nds' wäre kein gültiges Sprach-Etikett.
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('nds');
      await expect.poll(() => gespeicherteSprache(userData), { timeout: 20000 }).toBe('custom:nds');
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-06: eingestellte eigene Sprache beim Start (F-286)', () => {
  test('überdauert den Programm-Start und steht in der Auswahl', async () => {
    // Das Profil entsteht VOR dem Start, mit Datei und Einstellung — genau die
    // Lage nach einem Neustart. Deshalb kein frisches Profil aus launchApp,
    // sondern ein vorbereitetes.
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-e2e-'));
    fs.mkdirSync(path.join(userData, 'locales'), { recursive: true });
    fs.writeFileSync(
      abgelegt(userData, 'nds'),
      vollstaendigeSprachdatei('nds', 'Plattdüütsch', { [SICHTBAR]: EIGENER_TEXT }),
      'utf8',
    );

    const { app, page } = await launchApp({ userData, settings: { language: 'custom:nds' } });
    try {
      // AK3: Die Oberfläche steht ohne jedes Zutun in der eigenen Sprache.
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EIGENER_TEXT);
      await expect(page.locator('#lang-select')).toHaveValue('custom:nds');
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('nds');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SE-07: eingestellte eigene Sprache ohne Datei (F-286)', () => {
  test('fällt sichtbar auf Englisch zurück und behält die Einstellung', async () => {
    // Der Fall, der vor 4T-001594 lautlos war: Die Einstellung nennt eine
    // Sprache, deren Datei nicht (mehr) da ist.
    const { app, page, userData } = await launchApp({ settings: { language: 'custom:nds' } });
    try {
      // AK6, erster Teil: Die Oberfläche steht auf der Rückfall-Sprache.
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EN[SICHTBAR]);

      // AK6, zweiter Teil: und sie sagt es. Der erwartete Text kommt aus der
      // englischen Sprachdatei, nicht aus der Tastatur — der Wortlaut darf sich
      // ändern, die Aussage nicht. Ohne eingespielte Sprache ist der Name, den
      // die Anwendung kennt, der Code aus der Kennung.
      const erwartet = EN['locales.fallback.missing'].replace('{name}', 'nds');
      await expect(page.locator('#statusbar-hint')).toHaveText(erwartet);

      // Und die Einstellung bleibt stehen: Wer die Datei erneut einspielt, soll
      // seine Sprache wiederbekommen, ohne sie erneut zu wählen.
      expect(gespeicherteSprache(userData)).toBe('custom:nds');
    } finally {
      await closeApp(app, userData);
    }
  });
});

test.describe('SE-08: eingespielte Sprache entfernen (F-286)', () => {
  test('nimmt die Datei weg und stellt die Anwendung auf Englisch', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'platt.json');
    fs.writeFileSync(
      quelle,
      vollstaendigeSprachdatei('nds', 'Plattdüütsch', { [SICHTBAR]: EIGENER_TEXT }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await spieleEin(app, quelle, userData, 'nds');
      await expect(page.locator('#lang-select optgroup > option[value="custom:nds"]')).toHaveCount(
        1,
        { timeout: 20000 },
      );
      await page.selectOption('#lang-select', 'custom:nds');
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EIGENER_TEXT);

      // Der Auswahl-Dialog des Hauptprozesses wird stellvertreten: erste
      // Schaltfläche (Muster SE-03).
      await stelleRueckfrage(app, 0);
      await expect
        .poll(
          async () => {
            await loeseEntfernenAus(app);
            return fs.existsSync(abgelegt(userData, 'nds'));
          },
          { timeout: 30000 },
        )
        .toBe(false);

      // AK8 von 4T-001593: Die entfernte Sprache war die eingestellte — die
      // Anwendung fällt auf Englisch zurück, und zwar dauerhaft: Das Entfernen
      // ist eine bewusste Handlung, also wird die Einstellung überschrieben.
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EN[SICHTBAR]);
      await expect(page.locator('#lang-select')).toHaveValue('en');
      // Ohne eingespielte Sprache steht auch keine Gruppe mehr in der Auswahl.
      await expect(page.locator('#lang-select optgroup')).toHaveCount(0);
      await expect.poll(() => gespeicherteSprache(userData), { timeout: 20000 }).toBe('en');
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

// --- 4T-001595: Rückfall je Schlüssel auf Englisch -------------------------

test.describe('SE-09: unvollständige eigene Sprache (F-286)', () => {
  test('zeigt die eigenen Texte und füllt den Rest englisch auf', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'unfertig.json');
    // Genau die Lage, für die dieser Task gebaut ist: Der Übersetzer hat einen
    // Schlüssel fertig, alle anderen fehlen. Kein `vollstaendigeSprachdatei`
    // hier — die Unvollständigkeit IST der Gegenstand.
    fs.writeFileSync(
      quelle,
      sprachdatei('nds', 'Plattdüütsch', { [SICHTBAR]: EIGENER_TEXT }),
      'utf8',
    );

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await spieleEin(app, quelle, userData, 'nds');
      await expect(page.locator('#lang-select optgroup > option[value="custom:nds"]')).toHaveCount(
        1,
        { timeout: 20000 },
      );
      await page.selectOption('#lang-select', 'custom:nds');

      // AK1, erster Teil: Was die Datei kennt, steht in ihrer Sprache.
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EIGENER_TEXT);
      // AK1, zweiter Teil, und der Kern des Falls: Was sie NICHT kennt, steht
      // englisch da — nicht als roher Schlüssel-Name (AK2). Der erwartete Text
      // kommt aus src/i18n/en.json, nicht aus der Tastatur.
      await expect(page.locator(`[data-i18n="${SICHTBAR_2}"]`).first()).toHaveText(EN[SICHTBAR_2]);

      // Und die Anwendung spricht die eigene Sprache, nicht die Rückfall-Sprache:
      // Der Rückfall gilt je Schlüssel, nicht für die ganze Datei.
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('nds');
      await expect(page.locator('#lang-select')).toHaveValue('custom:nds');

      // Der Konsolen-Wächter von closeApp trägt den zweiten Teil der
      // Entscheidung: Eine Lücke der eigenen Sprache wird still gesammelt
      // (fehlendeSchluesselDerEigenenSprache, Leser 4T-001596), nicht als
      // Konsolen-Fehler gemeldet. Ein console.error je fehlendem Schlüssel
      // machte diesen Fall rot — und genau daran ist er scharf.
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});

// --- 4T-001596: Alterungs-Hinweis und Aktualisieren der eigenen Datei -------

// Die Datei der beiden Fälle: dieselbe Lage wie in SE-09, ein einziger
// übersetzter Eintrag. Die Zahl der Lücke wird daraus BERECHNET und nicht
// getippt — eine getippte Zahl veraltete mit dem nächsten neuen Schlüssel.
const UNVOLLSTAENDIG = () => sprachdatei('nds', 'Plattdüütsch', { [SICHTBAR]: EIGENER_TEXT });
const FEHLENDE_SCHLUESSEL = Object.keys(EN).filter((k) => k !== SICHTBAR);

// Stellt den Speichern-Dialog auf ein festes Ziel (Muster sprach-vorlage.spec.js).
async function stelleSpeichernDialog(app, ziel) {
  await app.evaluate(({ dialog }, z) => {
    dialog.showSaveDialog = async () =>
      z ? { canceled: false, filePath: z } : { canceled: true, filePath: undefined };
  }, ziel);
}

async function loeseAktualisierenAus(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('menu:updateLocale');
  });
}

test.describe('SE-10: Alterungs-Hinweis bei fehlenden Einträgen (F-286)', () => {
  test('nennt den Umfang der Lücke und meldet denselben Stand nicht erneut', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'unfertig.json');
    fs.writeFileSync(quelle, UNVOLLSTAENDIG(), 'utf8');

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await spieleEin(app, quelle, userData, 'nds');
      await expect(page.locator('#lang-select optgroup > option[value="custom:nds"]')).toHaveCount(
        1,
        { timeout: 20000 },
      );
      await page.selectOption('#lang-select', 'custom:nds');

      // AK1, AK2 und AK4: ein Hinweis in der Statusleiste, keine Unterbrechung,
      // und er nennt Name und Umfang. Der erwartete Text kommt aus der
      // ENGLISCHEN Fassung: Die eigene Sprache kennt den Hinweis-Schlüssel
      // selbst nicht, also greift der Rückfall je Schlüssel aus 4T-001595 —
      // eine sprechende Gegenprobe auf beide Tasks zugleich.
      const erwartet = EN['locales.gap.hint']
        .replace('{name}', 'Plattdüütsch')
        .replace('{n}', String(FEHLENDE_SCHLUESSEL.length));
      await expect(page.locator('#statusbar-hint')).toHaveText(erwartet, { timeout: 20000 });
    } finally {
      // KEIN Aufräumen des Profils: Der zweite Teil des Falls braucht genau
      // dieses Profil samt Merker weiter.
      await closeApp(app);
    }

    // AK6: Derselbe Stand — dieselbe Sprache, dieselbe Zahl, dieselbe
    // Programmfassung — meldet sich beim nächsten Start nicht erneut.
    const zweiter = await launchApp({ userData, settings: { language: 'custom:nds' } });
    try {
      // Die eigene Sprache steht, der Hinweis nicht. Zuerst die Gegenprobe,
      // dass der Start überhaupt in der eigenen Sprache angekommen ist —
      // sonst bewiese ein ausbleibender Hinweis nur, dass nichts geschah.
      await expect(zweiter.page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(
        EIGENER_TEXT,
      );
      await zweiter.page.waitForTimeout(1500);
      await expect(zweiter.page.locator('#statusbar-hint')).not.toHaveClass(/visible/);
    } finally {
      await closeApp(zweiter.app, userData);
      removeDir(temp);
    }
  });
});

test.describe('SE-11: eigene Sprachdatei aktualisieren (F-286)', () => {
  test('schreibt die vollständige Datei mit eigenen Texten und englischen Lücken', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-se-'));
    const quelle = path.join(temp, 'unfertig.json');
    fs.writeFileSync(quelle, UNVOLLSTAENDIG(), 'utf8');
    const ziel = path.join(temp, 'aktualisiert.json');

    const { app, page, userData } = await launchApp({ settings: { language: 'de' } });
    try {
      await spieleEin(app, quelle, userData, 'nds');
      await expect(page.locator('#lang-select optgroup > option[value="custom:nds"]')).toHaveCount(
        1,
        { timeout: 20000 },
      );
      await page.selectOption('#lang-select', 'custom:nds');
      await expect(page.locator(`[data-i18n="${SICHTBAR}"]`).first()).toHaveText(EIGENER_TEXT);

      // Zwei Dialoge des Betriebssystems liegen auf dem Weg, beide werden
      // gestellt statt bedient: die Auswahl der Sprache (erste Schaltfläche,
      // Muster SE-08) und das Speichern-Ziel (Muster sprach-vorlage.spec.js).
      // Gestellt lässt sich der ganze Weg bis zur geschriebenen Datei messen.
      await stelleRueckfrage(app, 0);
      await stelleSpeichernDialog(app, ziel);
      await expect
        .poll(
          async () => {
            await loeseAktualisierenAus(app);
            return fs.existsSync(ziel);
          },
          { timeout: 30000 },
        )
        .toBe(true);

      // AK3, in der Fassung der Entscheidung des Product Owners vom
      // 2026-09-10: Was der Anwender bekommt, ist seine GANZE Datei auf dem
      // Stand der laufenden Programmfassung.
      const inhalt = JSON.parse(fs.readFileSync(ziel, 'utf8'));
      // Die Identität steht oben und stammt aus der eigenen Datei, nicht aus
      // der Vorlage — sonst wäre das Ergebnis eine namenlose Vorlage.
      expect(Object.keys(inhalt).slice(0, 2)).toEqual(['@@locale', '@@name']);
      expect(inhalt['@@locale']).toBe('nds');
      expect(inhalt['@@name']).toBe('Plattdüütsch');
      // Die eigene Übersetzung bleibt stehen …
      expect(inhalt[SICHTBAR]).toBe(EIGENER_TEXT);
      // … die Lücken stehen englisch an ihrer Stelle …
      expect(inhalt[SICHTBAR_2]).toBe(EN[SICHTBAR_2]);
      // … und die Datei ist so vollständig wie die englische Fassung. Die Zahl
      // wird aus en.json BERECHNET und nicht getippt.
      expect(Object.keys(inhalt)).toHaveLength(Object.keys(EN).length + 2);
      expect(FEHLENDE_SCHLUESSEL.every((k) => inhalt[k] === EN[k])).toBe(true);
    } finally {
      await closeApp(app, userData);
      removeDir(temp);
    }
  });
});
