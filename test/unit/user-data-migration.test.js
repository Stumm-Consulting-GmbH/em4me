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
    expect(ergebnis.uebernommen).toEqual(['config.json', 'drafts', 'extensions']);
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
    expect(MIGRATED_USER_DATA).toEqual(['config.json', 'drafts', 'extensions']);
  });
});
