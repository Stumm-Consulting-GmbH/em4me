// 4T-000643 (Epic 3E-000126): Uebernahme der Nutzerdaten beim Rebranding.
//
// Regressionstest zum Befund aus der Umsetzung: Bis 4T-000247 kopierte die
// Migration allein config.json. Inzwischen liegen im userData-Ordner auch die
// Entwuerfe nie gespeicherter Tabs (4T-000369) und die externen Erweiterungen
// (4T-000298). Beim Namenswechsel „Perspective Markdown++" → „EM4me" waeren
// beide zurueckgeblieben — ungesicherte Inhalte verloren, Erweiterungen neu
// einzurichten. Der Fehler faellt im Betrieb erst auf, wenn es zu spaet ist,
// deshalb hier gegen echte Temp-Ordner geprueft statt gegen Mocks.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  migrateUserData,
  PREVIOUS_PRODUCT_NAMES,
  MIGRATED_USER_DATA,
  PRODUKTIV_PROFIL,
  AUSPRAEGUNG_USER_DATA,
  MARKER_DATEI,
  reihenfolgeMitMarkerZuletzt,
} from '../../src/main/app/user-data-migration.js';

const temps = [];
const mkTemp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-migration-'));
  temps.push(dir);
  return dir;
};

// Legt ein Vorgaenger-Profil mit allen drei Bestaenden an.
function altesProfil(appData, name, { mitDrafts = true, mitExtensions = true } = {}) {
  const root = path.join(appData, name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify({ language: 'de', quelle: name }),
  );
  if (mitDrafts) {
    fs.mkdirSync(path.join(root, 'drafts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'drafts', 'manifest.json'), '{"eintraege":1}');
    fs.writeFileSync(path.join(root, 'drafts', 'entwurf-1.md'), '# Nie gespeichert');
  }
  if (mitExtensions) {
    fs.mkdirSync(path.join(root, 'extensions', 'meine-erweiterung'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'extensions', 'meine-erweiterung', 'manifest.json'),
      '{"id":"meine-erweiterung"}',
    );
  }
  return root;
}

const stillerLogger = { info() {}, warn() {} };

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    await fsp
      .rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      .catch(() => {});
  }
});

describe('Nutzerdaten-Migration beim Rebranding (4T-000643)', () => {
  it('übernimmt Einstellungen, Entwürfe UND Erweiterungen aus dem Vorgänger', async () => {
    const appData = mkTemp();
    altesProfil(appData, 'Perspective Markdown++');
    const userData = path.join(appData, 'EM4me');

    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      logger: stillerLogger,
    });

    expect(ergebnis.migriert).toBe(true);
    expect(ergebnis.quelle).toBe('Perspective Markdown++');
    // 4T-001336: config.json wandert ZULETZT — die Reihenfolge ist der Schutz
    // gegen eine halb uebernommene Einrichtung, die als vollstaendig gilt.
    expect(ergebnis.uebernommen).toEqual(['drafts', 'extensions', 'config.json']);
    // Der eigentliche Regressionskern: die beiden Ordner sind wirklich da.
    expect(fs.existsSync(path.join(userData, 'drafts', 'entwurf-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'drafts', 'manifest.json'))).toBe(true);
    expect(
      fs.existsSync(path.join(userData, 'extensions', 'meine-erweiterung', 'manifest.json')),
    ).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).language).toBe(
      'de',
    );
  });

  it('lässt die Quelle unangetastet (es wird nur kopiert)', async () => {
    const appData = mkTemp();
    const alt = altesProfil(appData, 'Perspective Markdown++');
    await migrateUserData({
      appDataDir: appData,
      userDataDir: path.join(appData, 'EM4me'),
      logger: stillerLogger,
    });
    expect(fs.existsSync(path.join(alt, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(alt, 'drafts', 'entwurf-1.md'))).toBe(true);
  });

  it('rührt ein bereits benutztes Profil nicht an', async () => {
    const appData = mkTemp();
    altesProfil(appData, 'Perspective Markdown++');
    const userData = path.join(appData, 'EM4me');
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ language: 'fr' }));

    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      logger: stillerLogger,
    });

    expect(ergebnis.migriert).toBe(false);
    // Weder überschrieben noch nachträglich befüllt.
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).language).toBe(
      'fr',
    );
    expect(fs.existsSync(path.join(userData, 'drafts'))).toBe(false);
  });

  it('nimmt den jüngsten vorhandenen Vorgänger, nicht den ältesten', async () => {
    const appData = mkTemp();
    altesProfil(appData, 'Markdown Viewer');
    altesProfil(appData, 'SCG Markdown');
    altesProfil(appData, 'Perspective Markdown++');

    const userData = path.join(appData, 'EM4me');
    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      logger: stillerLogger,
    });

    expect(ergebnis.quelle).toBe('Perspective Markdown++');
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).quelle).toBe(
      'Perspective Markdown++',
    );
  });

  it('kommt ohne Vorgänger und mit unvollständigem Vorgänger zurecht', async () => {
    const appData = mkTemp();
    const leer = await migrateUserData({
      appDataDir: appData,
      userDataDir: path.join(appData, 'EM4me'),
      logger: stillerLogger,
    });
    expect(leer.migriert).toBe(false);
    expect(leer.uebernommen).toEqual([]);

    // Vorgaenger ohne Entwuerfe und ohne Erweiterungen: kein Fehlerfall.
    altesProfil(appData, 'SCG Markdown', { mitDrafts: false, mitExtensions: false });
    const teilweise = await migrateUserData({
      appDataDir: appData,
      userDataDir: path.join(appData, 'EM4me'),
      logger: stillerLogger,
    });
    expect(teilweise.migriert).toBe(true);
    expect(teilweise.uebernommen).toEqual(['config.json']);
  });

  it('führt die Namens-Kette vollständig und in der richtigen Reihenfolge', () => {
    // Reihenfolge ist Vertrag: neuester Vorgaenger zuerst.
    expect(PREVIOUS_PRODUCT_NAMES).toEqual([
      'Perspective Markdown++',
      'SCG Markdown',
      'Markdown Viewer',
    ]);
    expect(MIGRATED_USER_DATA).toEqual(['drafts', 'extensions', 'config.json']);
  });
});

// 4T-001336 (Epic 3E-000237): Übernahme der Einrichtung in die zweite Ausprägung.
//
// Der Vorgang liest aus dem PRODUKTIVEN Nutzerdaten-Verzeichnis. Ein Irrtum in
// der Richtung oder im Umfang träfe die Einrichtung des Product Owners, und
// zwar unbemerkt — das ist der Grund für die Prüftiefe hier.
describe('Übernahme in die zweite Ausprägung (4T-001336)', () => {
  it('nimmt Einstellungen und Erweiterungen, aber NICHT die Entwürfe', async () => {
    const appData = mkTemp();
    altesProfil(appData, PRODUKTIV_PROFIL);
    const userData = path.join(appData, 'em4me-pruefstand');

    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
      logger: stillerLogger,
    });

    expect(ergebnis.migriert).toBe(true);
    expect(ergebnis.quelle).toBe(PRODUKTIV_PROFIL);
    expect(ergebnis.uebernommen).toEqual(['extensions', 'config.json']);
    expect(fs.existsSync(path.join(userData, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(userData, 'extensions', 'meine-erweiterung'))).toBe(true);
    // Der Kern der Entscheidung des Product Owners vom 2026-09-06: Entwürfe
    // sind Inhalt, nicht Einrichtung, und eine einseitige Kopie von Text, der
    // sonst nirgends existiert, liefe unweigerlich auseinander.
    expect(fs.existsSync(path.join(userData, 'drafts'))).toBe(false);
  });

  it('schreibt nicht in die produktive Einrichtung zurück (AK7)', async () => {
    const appData = mkTemp();
    const quelle = altesProfil(appData, PRODUKTIV_PROFIL);
    const userData = path.join(appData, 'em4me-pruefstand');

    // Vollständiger Abzug der Quelle VOR der Übernahme: jeder relative Pfad
    // mit seinem Inhalt. Ein Schreibzugriff — angelegte, geänderte oder
    // entfernte Datei — verändert diesen Abzug und fällt damit auf.
    const abzug = (wurzel) => {
      const eintraege = {};
      const lauf = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const voll = path.join(dir, e.name);
          if (e.isDirectory()) lauf(voll);
          else eintraege[path.relative(wurzel, voll)] = fs.readFileSync(voll, 'utf8');
        }
      };
      lauf(wurzel);
      return eintraege;
    };
    const vorher = abzug(quelle);

    await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
      logger: stillerLogger,
    });

    expect(abzug(quelle)).toEqual(vorher);
  });

  it('verweigert die Selbst-Übernahme, wenn Quelle und Ziel derselbe Ordner sind', async () => {
    const appData = mkTemp();
    const quelle = altesProfil(appData, PRODUKTIV_PROFIL);

    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: quelle,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
      logger: stillerLogger,
    });

    // Sie greift ohnehin nicht, weil der Marker im Ziel schon liegt; der
    // ausdrückliche Riegel steht für den Fall, dass diese Reihenfolge einmal
    // fällt.
    expect(ergebnis.migriert).toBe(false);
  });

  it('übernimmt bei jedem weiteren Start nichts erneut (AK4)', async () => {
    const appData = mkTemp();
    altesProfil(appData, PRODUKTIV_PROFIL);
    const userData = path.join(appData, 'em4me-pruefstand');
    const argumente = {
      appDataDir: appData,
      userDataDir: userData,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
      logger: stillerLogger,
    };

    await migrateUserData(argumente);
    // Eine Änderung in der zweiten Ausprägung darf ein zweiter Start nicht
    // überschreiben.
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ language: 'fr' }));

    const zweiter = await migrateUserData(argumente);

    expect(zweiter.migriert).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).language).toBe(
      'fr',
    );
  });

  it('startet ohne produktive Einrichtung mit den Voreinstellungen (AK5)', async () => {
    const appData = mkTemp();
    const userData = path.join(appData, 'em4me-pruefstand');

    const ergebnis = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      previousNames: [PRODUKTIV_PROFIL],
      items: AUSPRAEGUNG_USER_DATA,
      logger: stillerLogger,
    });

    expect(ergebnis.migriert).toBe(false);
    expect(ergebnis.uebernommen).toEqual([]);
  });
});

// 4T-001336: Regressionstest zum Befund aus der Umsetzung.
describe('Marker-Datei wandert zuletzt (4T-001336)', () => {
  it('sortiert den Marker ans Ende, egal wie die Liste kommt', () => {
    expect(reihenfolgeMitMarkerZuletzt([MARKER_DATEI, 'drafts', 'extensions'])).toEqual([
      'drafts',
      'extensions',
      MARKER_DATEI,
    ]);
    expect(reihenfolgeMitMarkerZuletzt(['extensions'])).toEqual(['extensions']);
    expect(reihenfolgeMitMarkerZuletzt([])).toEqual([]);
  });

  it('holt eine abgebrochene Übernahme beim nächsten Start nach', async () => {
    // Der Befund: Bis 4T-001336 wanderte config.json ZUERST. Bricht der erste
    // Start danach ab, liegt der Marker im Ziel, die übrigen Bestände fehlen —
    // und jeder weitere Start hält die Übernahme für erledigt. Entwürfe und
    // Erweiterungen wären dauerhaft verloren.
    const appData = mkTemp();
    altesProfil(appData, 'Perspective Markdown++');
    const userData = path.join(appData, 'EM4me');

    // Ein abgebrochener erster Lauf: nur ein Teil ist übernommen.
    await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      items: ['extensions'],
      logger: stillerLogger,
    });
    expect(fs.existsSync(path.join(userData, 'extensions'))).toBe(true);
    // Entscheidend: Der Marker fehlt, die Übernahme gilt NICHT als erledigt.
    expect(fs.existsSync(path.join(userData, MARKER_DATEI))).toBe(false);

    const zweiter = await migrateUserData({
      appDataDir: appData,
      userDataDir: userData,
      logger: stillerLogger,
    });

    expect(zweiter.migriert).toBe(true);
    expect(fs.existsSync(path.join(userData, 'drafts', 'entwurf-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(userData, MARKER_DATEI))).toBe(true);
  });
});
