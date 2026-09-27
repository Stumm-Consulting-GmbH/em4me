// 4T-001787 (Epic 3E-000255, E9): Der Sperr-Speicher — Anlegen, Lesen,
// Auflisten und Entfernen (AK4 bis AK9), der frisch gelesene Ordnername (AK13)
// und die Zusicherung, dass kein Sperr-Vorgang Tabellen- oder Bereichsdatei
// anfasst (AK8).
//
// **Gearbeitet wird an echten Temp-Verzeichnissen**, weil der Gegenstand das
// exklusive Anlegen des Dateisystems IST. Eine Attrappe des Dateisystems prüfte
// die Attrappe: Sie entscheidet selbst, wann sie EEXIST meldet, und damit wäre
// gerade die Eigenschaft nicht gemessen, auf der die ganze Sperre ruht.
//
// **Der Wettlauf ist echt und nicht nachgestellt.** Viele Anlege-Versuche auf
// denselben Gegenstand laufen gleichzeitig; genau einer darf gewinnen. Ein Fall,
// der die Versuche nacheinander fährt, misst nur die Reihenfolge, die er selbst
// hergestellt hat. Der Wettlauf über zwei Rechner auf der Netz-Freigabe ist
// davon unberührt und gehört zum Lebenszyklus (4T-001788).
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ART_CHANGE_LOG,
  ART_COUNTER,
  ART_DATENSATZ,
  ART_DEFINITION,
  ART_SWEEP,
  MAX_SPERR_DATEINAME,
  SPERR_CODES,
  SPERR_SCHEMA_VERSION,
  entferneSperre,
  gegenstandAusDateiName,
  legeSperreAn,
  leseSperre,
  listeSperren,
  loeseGegenstand,
  sperrDateiName,
  sperrOrdnerName,
  standVon,
} from '../../src/main/database/lock-store.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

const HERKUNFT = () => ({ benutzer: 'anna', rechner: 'SC-026' });
const ZEITPUNKT = '2026-09-19T08:30:15Z';

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

// Ein Bereich mit einer Tabellen-Datei. Die Bereichsdatei entsteht nur, wo ein
// Fall sie braucht — ihre Abwesenheit ist selbst ein Prüf-Gegenstand.
function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-sperre-'));
  tmpDirs.push(wurzel);
  fs.writeFileSync(path.join(wurzel, 'Kunden.md'), '# Kunden\n', 'utf8');
  return wurzel;
}

// Die Naht zur Bereichs-Konfiguration: eine Attrappe, deren Rückgabe der Fall
// setzt. Gezählt wird, WIE OFT sie gerufen wird — daran hängt die Zusicherung
// «bei jedem Zugriff frisch, kein Zwischenspeicher».
function konfig(sektion) {
  const zustand = { sektion };
  const leseKonfig = vi.fn(async () => zustand.sektion);
  return { zustand, leseKonfig };
}

function nahtstellen(leseKonfig, zusatz) {
  return { leseKonfig, jetzt: () => ZEITPUNKT, herkunft: HERKUNFT, ...zusatz };
}

const DATENSATZ = { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00042' };
const DEFINITION = { art: ART_DEFINITION, tabelle: 'Kunden.md' };

// --- AK4, AK5, AK7: anlegen, lesen, entfernen ------------------------------------------

describe('Sperr-Speicher: anlegen, lesen, entfernen (4T-001787, AK4, AK5, AK7)', () => {
  it('legt die Sperre am abgeleiteten Ort an und erzeugt den Ordner dabei', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const ergebnis = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.gehalten).toBe(true);
    expect(ergebnis.ordner).toBe(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    expect(fs.existsSync(ergebnis.pfad)).toBe(true);
  });

  it('schreibt Gegenstand, Benutzer, Rechner und Zeitpunkt in die Datei (AK5)', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const ergebnis = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));
    const inhalt = JSON.parse(fs.readFileSync(ergebnis.pfad, 'utf8'));

    expect(inhalt).toEqual({
      schemaVersion: SPERR_SCHEMA_VERSION,
      art: ART_DATENSATZ,
      tabelle: 'Kunden.md',
      id: 'r-00042',
      benutzer: 'anna',
      rechner: 'SC-026',
      zeitpunkt: ZEITPUNKT,
    });
    // UTC, sekundengenau — die Zeitstempel-Konvention des Projekts.
    expect(inhalt.zeitpunkt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('trägt die ursprüngliche Schreibweise des Pfades im Inhalt', async () => {
    const wurzel = bereich();
    fs.mkdirSync(path.join(wurzel, 'Stammdaten'));
    fs.writeFileSync(path.join(wurzel, 'Stammdaten', 'Käufer.md'), '# K\n', 'utf8');
    const { leseKonfig } = konfig(undefined);

    const ergebnis = await legeSperreAn(
      wurzel,
      { art: ART_DEFINITION, tabelle: 'Stammdaten/Käufer.md' },
      null,
      nahtstellen(leseKonfig),
    );
    const inhalt = JSON.parse(fs.readFileSync(ergebnis.pfad, 'utf8'));

    expect(inhalt.tabelle).toBe('Stammdaten/Käufer.md');
    // Der Dateiname dagegen trägt die kleingeschriebene Form.
    expect(path.basename(ergebnis.pfad)).toContain('stammdaten');
  });

  it('nimmt optionale Zusatz-Felder an, ohne die eigenen zu verlieren', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const ergebnis = await legeSperreAn(
      wurzel,
      DATENSATZ,
      { vorgang: '17', art: 'untergeschoben' },
      nahtstellen(leseKonfig),
    );
    const inhalt = JSON.parse(fs.readFileSync(ergebnis.pfad, 'utf8'));

    expect(inhalt.vorgang).toBe('17');
    expect(inhalt.art).toBe(ART_DATENSATZ);
  });

  it('liest die Sperre mit ihrem Halter zurück', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));

    expect(gelesen.vorhanden).toBe(true);
    expect(gelesen.halterUnbekannt).toBe(false);
    expect(gelesen.halter.rechner).toBe('SC-026');
  });

  it('meldet eine nicht vorhandene Sperre als frei', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));

    expect(gelesen).toMatchObject({ ok: true, vorhanden: false, halter: null });
  });

  it('entfernt die Sperre; ein zweites Entfernen ist kein Fehler', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const angelegt = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    expect(await entferneSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig))).toMatchObject({
      ok: true,
      entfernt: true,
    });
    expect(fs.existsSync(angelegt.pfad)).toBe(false);
    expect(await entferneSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig))).toMatchObject({
      ok: true,
      entfernt: false,
    });
  });

  it('meldet die zweite Sperre desselben Gegenstands als belegt, samt Halter', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    const zweite = await legeSperreAn(
      wurzel,
      DATENSATZ,
      null,
      nahtstellen(leseKonfig, { herkunft: () => ({ benutzer: 'bert', rechner: 'SC-027' }) }),
    );

    expect(zweite.ok).toBe(true);
    expect(zweite.gehalten).toBe(false);
    expect(zweite.belegt).toBe(true);
    expect(zweite.halter).toMatchObject({ benutzer: 'anna', rechner: 'SC-026' });
    // Die bestehende Sperre bleibt unberührt.
    expect(JSON.parse(fs.readFileSync(zweite.pfad, 'utf8')).benutzer).toBe('anna');
  });

  it('lässt beim gleichzeitigen Anlegen genau einen gewinnen', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const versuche = Array.from({ length: 40 }, () =>
      legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig)),
    );
    const ergebnisse = await Promise.all(versuche);

    expect(ergebnisse.every((e) => e.ok)).toBe(true);
    expect(ergebnisse.filter((e) => e.gehalten === true)).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.belegt === true)).toHaveLength(39);
  });
});

// --- AK7: beschädigter Inhalt ----------------------------------------------------------

describe('Sperr-Speicher: beschädigter Inhalt heißt belegt (4T-001787, AK7)', () => {
  async function mitInhalt(text) {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const benannt = sperrDateiName(wurzel, DATENSATZ);
    const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
    fs.mkdirSync(ordner);
    fs.writeFileSync(path.join(ordner, benannt.name), text, 'utf8');
    return { wurzel, leseKonfig };
  }

  it.each([
    ['leer', ''],
    ['nur Leerraum', '   \n'],
    ['kein JSON', '{ abgerissen'],
    ['kein Objekt', '"nur ein Text"'],
  ])('meldet bei %s «belegt, Halter unbekannt» statt «frei»', async (_lage, text) => {
    const { wurzel, leseKonfig } = await mitInhalt(text);

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));
    expect(gelesen.vorhanden).toBe(true);
    expect(gelesen.halterUnbekannt).toBe(true);

    // Und der Anlege-Versuch darf sie erst recht nicht als frei behandeln.
    const versuch = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));
    expect(versuch).toMatchObject({
      ok: true,
      gehalten: false,
      belegt: true,
      halterUnbekannt: true,
    });
  });

  it('wirft beim Auflisten nicht und meldet den Gegenstand trotzdem', async () => {
    const { wurzel, leseKonfig } = await mitInhalt('{ abgerissen');

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));

    expect(liste.ok).toBe(true);
    expect(liste.sperren).toHaveLength(1);
    expect(liste.sperren[0].halterUnbekannt).toBe(true);
    expect(liste.sperren[0].gegenstand).toEqual({
      art: ART_DATENSATZ,
      tabelle: 'kunden.md',
      id: 'r-00042',
    });
  });
});

// --- AK6, AK9: Dateiname und seine Umkehrung -------------------------------------------

describe('Sperr-Speicher: Dateiname und Umkehrung (4T-001787, AK6, AK9)', () => {
  const WURZEL = path.resolve('/bereich');

  it('unterscheidet Datensatz- und Definitions-Sperre am Namen (AK6)', () => {
    const datensatz = sperrDateiName(WURZEL, DATENSATZ);
    const definition = sperrDateiName(WURZEL, DEFINITION);

    expect(datensatz.name).toBe('r+kunden.md+r-00042.lock');
    expect(definition.name).toBe('d+kunden.md.lock');
    expect(gegenstandAusDateiName(datensatz.name).gegenstand.art).toBe(ART_DATENSATZ);
    expect(gegenstandAusDateiName(definition.name).gegenstand.art).toBe(ART_DEFINITION);
  });

  it.each([
    'Kunden.md',
    'Ordner/Unterordner/Käufer & Verkäufer.md',
    'Tabelle mit Leerzeichen.md',
    'Plus+Zeichen.md',
    'Prozent%Zeichen.md',
    'Stern*Zeichen.md',
    'Übermäßig größer.md',
  ])('bildet %s eindeutig ab und wieder zurück (AK9)', (relativ) => {
    const benannt = sperrDateiName(WURZEL, { art: ART_DEFINITION, tabelle: relativ });
    expect(benannt.ok).toBe(true);
    // Kein Trennzeichen und kein unter Windows verbotenes Zeichen im Namen.
    expect(benannt.name.split('+')).toHaveLength(2);
    expect(/[<>:"|?*\\/]/.test(benannt.name)).toBe(false);

    const zurueck = gegenstandAusDateiName(benannt.name);
    expect(zurueck.ok).toBe(true);
    expect(zurueck.gegenstand.tabelle).toBe(relativ.normalize('NFC').toLowerCase());
  });

  it('gibt zwei Schreibweisen desselben Pfades denselben Namen', () => {
    const gross = sperrDateiName(WURZEL, { art: ART_DEFINITION, tabelle: 'Ordner/Kunden.md' });
    const klein = sperrDateiName(WURZEL, { art: ART_DEFINITION, tabelle: 'ordner/kunden.MD' });

    expect(gross.name).toBe(klein.name);
  });

  it('nimmt beide Schreibweisen der Kennung und schreibt die aufgefüllte', () => {
    const kurz = sperrDateiName(WURZEL, { ...DATENSATZ, id: 'r-42' });
    const lang = sperrDateiName(WURZEL, { ...DATENSATZ, id: 'r-00042' });
    const zahl = sperrDateiName(WURZEL, { ...DATENSATZ, id: 42 });

    expect(kurz.name).toBe(lang.name);
    expect(zahl.name).toBe(lang.name);
    expect(gegenstandAusDateiName(kurz.name).gegenstand.id).toBe('r-00042');
  });

  it('weist einen Namen über der Obergrenze mit eigenem Code ab statt ihn zu kürzen', () => {
    const lang = `${'ü'.repeat(60)}/${'x'.repeat(120)}.md`;
    const benannt = sperrDateiName(WURZEL, { art: ART_DEFINITION, tabelle: lang });

    expect(benannt.ok).toBe(false);
    expect(benannt.code).toBe(SPERR_CODES.nameZuLang);
    expect(benannt.error).toContain(String(MAX_SPERR_DATEINAME));
  });

  it.each([
    ['ohne Endung', 'r+kunden.md+r-00042'],
    ['unbekannte Marke', 'x+kunden.md.lock'],
    ['zu wenige Teile', 'r+kunden.md.lock'],
    ['ohne Gegenstand', 'd+.lock'],
    ['unlesbare Kennung', 'r+kunden.md+k-1.lock'],
    ['kaputte Kodierung', 'd+%E0%A4%A.lock'],
  ])('deutet %s nicht als Sperre', (_lage, name) => {
    expect(gegenstandAusDateiName(name)).toMatchObject({ code: SPERR_CODES.nameUnlesbar });
  });
});

// --- Bereichs-Grenze --------------------------------------------------------------------

describe('Sperr-Speicher: Gegenstand außerhalb des Bereichs (4T-001787)', () => {
  it('weist ihn ab, bevor irgendein Zugriff stattfindet', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const spion = { readdir: fsp.readdir, readFile: fsp.readFile, writeFile: fsp.writeFile };
    const schreiben = vi.spyOn(spion, 'writeFile');
    const lesen = vi.spyOn(spion, 'readFile');

    const draussen = { art: ART_DEFINITION, tabelle: path.join(wurzel, '..', 'Fremd.md') };
    const ergebnis = await legeSperreAn(
      wurzel,
      draussen,
      null,
      nahtstellen(leseKonfig, { fsp: spion }),
    );

    expect(ergebnis).toMatchObject({ ok: false, code: SPERR_CODES.ausserhalb });
    expect(schreiben).not.toHaveBeenCalled();
    expect(lesen).not.toHaveBeenCalled();
    // Auch die Bereichs-Konfiguration wird dafür nicht gelesen: Der Gegenstand
    // steht schon vor der Frage nach dem Ordner fest.
    expect(leseKonfig).not.toHaveBeenCalled();
  });

  it('verweigert ohne die Naht zur Bereichs-Konfiguration', async () => {
    const wurzel = bereich();

    const ergebnis = await legeSperreAn(wurzel, DATENSATZ, null, { jetzt: () => ZEITPUNKT });

    expect(ergebnis).toMatchObject({ ok: false, code: SPERR_CODES.ohneKonfigNaht });
    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
  });
});

// --- AK10 bis AK13: der Ordnername ------------------------------------------------------

describe('Sperr-Speicher: der Ordnername aus der Bereichs-Konfiguration (4T-001787)', () => {
  it('folgt einer gesetzten Angabe (AK10)', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig({ lockFolderName: '.eigene-sperren' });

    const ergebnis = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    expect(ergebnis.ordner).toBe(path.join(wurzel, '.eigene-sperren'));
    expect(fs.existsSync(path.join(wurzel, '.eigene-sperren'))).toBe(true);
    expect(fs.existsSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME))).toBe(false);
  });

  it.each([
    ['fehlende Angabe', undefined],
    ['leere Angabe', { lockFolderName: '' }],
    ['unbrauchbare Angabe', { lockFolderName: 'ohne-punkt' }],
  ])('führt bei %s auf den Vorgabe-Namen (AK11, AK12)', async (_lage, sektion) => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(sektion);

    expect(await sperrOrdnerName(wurzel, { leseKonfig })).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('führt auch bei einer werfenden Bereichsdatei auf den Vorgabe-Namen (AK12)', async () => {
    const wurzel = bereich();
    const leseKonfig = vi.fn(async () => {
      throw new Error('mdda unlesbar');
    });

    expect(await sperrOrdnerName(wurzel, { leseKonfig })).toBe(DEFAULT_LOCK_FOLDER_NAME);
  });

  it('liest den Namen bei jedem Zugriff frisch, ohne Zwischenspeicher (AK13)', async () => {
    const wurzel = bereich();
    const { zustand, leseKonfig } = konfig(undefined);

    const erste = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));
    expect(erste.ordner).toBe(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));

    // Zwischen den beiden Zugriffen ändert sich die Bereichsdatei — ohne
    // Neustart, ohne erneutes Aufbauen irgendeines Zustands.
    zustand.sektion = { lockFolderName: '.spaeter' };

    const zweite = await legeSperreAn(wurzel, DEFINITION, null, nahtstellen(leseKonfig));
    expect(zweite.ordner).toBe(path.join(wurzel, '.spaeter'));
    // Jeder der beiden Zugriffe hat die Konfiguration selbst gelesen.
    expect(leseKonfig.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// --- AK4: auflisten ---------------------------------------------------------------------

describe('Sperr-Speicher: auflisten (4T-001787, AK4)', () => {
  it('meldet einen fehlenden Ordner als leere Liste', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    expect(await listeSperren(wurzel, nahtstellen(leseKonfig))).toMatchObject({
      ok: true,
      sperren: [],
    });
  });

  it('listet beide Arten mit ihrem Gegenstand', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));
    await legeSperreAn(wurzel, DEFINITION, null, nahtstellen(leseKonfig));

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));

    expect(liste.sperren.map((s) => s.gegenstand.art).sort()).toEqual([
      ART_DEFINITION,
      ART_DATENSATZ,
    ]);
    expect(liste.sperren.every((s) => s.gegenstand.tabelle === 'kunden.md')).toBe(true);
  });

  it('übergeht fremde Dateien im Ordner und fasst sie nicht an', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));
    const fremd = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, 'Notiz des Anwenders.txt');
    fs.writeFileSync(fremd, 'bleibt', 'utf8');
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, 'Unterordner'));

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));

    expect(liste.sperren).toHaveLength(1);
    expect(fs.readFileSync(fremd, 'utf8')).toBe('bleibt');
  });
});

// --- 4T-001788: die dritte Art, der Stand und die Änderungszeit --------------------------

const BELEGE = { art: ART_CHANGE_LOG, tabelle: 'Kunden.md' };

describe('Sperr-Speicher: die Beleg-Datei als dritter Gegenstand (4T-001788, L3)', () => {
  it('trägt die eigene Marke im Dateinamen und kommt unverändert zurück', () => {
    const benannt = sperrDateiName(path.resolve('/bereich'), BELEGE);

    expect(benannt.name).toBe('l+kunden.md.lock');
    expect(gegenstandAusDateiName(benannt.name).gegenstand).toEqual({
      art: ART_CHANGE_LOG,
      tabelle: 'kunden.md',
      id: null,
    });
  });

  it('ist eine ANDERE Sperre als die der Definition', () => {
    // Die Definitions-Sperre mitzubenutzen wäre falsch: Sie bedeutet «das
    // Schema wird geändert», und ein Kollege, der die Definition bearbeitet,
    // hielte damit jede Verdichtung an.
    const wurzel = path.resolve('/bereich');

    expect(sperrDateiName(wurzel, BELEGE).name).not.toBe(sperrDateiName(wurzel, DEFINITION).name);
  });

  it('lässt sich anlegen, lesen und auflisten wie die beiden anderen Arten', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const angelegt = await legeSperreAn(wurzel, BELEGE, null, nahtstellen(leseKonfig));
    expect(angelegt.gehalten).toBe(true);
    expect((await leseSperre(wurzel, BELEGE, nahtstellen(leseKonfig))).vorhanden).toBe(true);

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));
    expect(liste.sperren.map((s) => s.gegenstand.art)).toEqual([ART_CHANGE_LOG]);
  });
});

describe('Sperr-Speicher: der Stand einer Sperre (4T-001788, L5)', () => {
  it('liefert beim Anlegen den Stand des geschriebenen Textes', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const angelegt = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    expect(angelegt.stand).toBe(standVon(fs.readFileSync(angelegt.pfad, 'utf8')));
  });

  it('liefert beim Lesen, beim Auflisten und im «belegt»-Ergebnis denselben Stand', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const angelegt = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));
    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));
    const zweite = await legeSperreAn(wurzel, DATENSATZ, null, nahtstellen(leseKonfig));

    expect(gelesen.stand).toBe(angelegt.stand);
    expect(liste.sperren[0].stand).toBe(angelegt.stand);
    expect(zweite.stand).toBe(angelegt.stand);
  });

  it('unterscheidet zwei Sperren desselben Gegenstands an ihrem Stand', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const erste = await legeSperreAn(wurzel, DATENSATZ, { marke: 'a' }, nahtstellen(leseKonfig));
    fs.unlinkSync(erste.pfad);
    const zweite = await legeSperreAn(wurzel, DATENSATZ, { marke: 'b' }, nahtstellen(leseKonfig));

    expect(zweite.stand).not.toBe(erste.stand);
  });

  it.each([
    ['leer', ''],
    ['nur Leerraum', '   \n'],
  ])('gibt einem %s Inhalt den Stand des leeren Textes', async (_lage, text) => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const benannt = sperrDateiName(wurzel, DATENSATZ);
    fs.mkdirSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME));
    fs.writeFileSync(path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME, benannt.name), text, 'utf8');

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));
    expect(gelesen.stand).toBe(standVon(text));
  });

  it('meldet für eine fehlende Sperre den Stand des leeren Textes', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    expect((await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig))).stand).toBe(standVon(''));
  });
});

describe('Sperr-Speicher: die Änderungszeit als Rückfall der Frist (4T-001788, L7)', () => {
  it('erfragt sie nicht, solange der Inhalt einen auslegbaren Zeitpunkt trägt', async () => {
    // Sonst kostete jede Sperr-Lesung einen zweiten Weg über das Netz für eine
    // Angabe, die niemand ansieht.
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const sicht = { ...fsp, stat: fsp.stat };
    const stattgeben = vi.spyOn(sicht, 'stat');
    const deps = nahtstellen(leseKonfig, { fsp: sicht });
    await legeSperreAn(wurzel, DATENSATZ, null, deps);

    const gelesen = await leseSperre(wurzel, DATENSATZ, deps);

    expect(gelesen.geaendertMs).toBe(null);
    expect(stattgeben).not.toHaveBeenCalled();
  });

  it.each([
    ['unbrauchbarem Inhalt', '{ abgerissen'],
    ['unlesbarem Zeitpunkt', '{"schemaVersion":1,"zeitpunkt":"neulich"}'],
    ['fehlendem Zeitpunkt', '{"schemaVersion":1,"rechner":"SC-027"}'],
  ])('liefert sie bei %s mit', async (_lage, text) => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const ordner = path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
    fs.mkdirSync(ordner);
    const pfad = path.join(ordner, sperrDateiName(wurzel, DATENSATZ).name);
    fs.writeFileSync(pfad, text, 'utf8');
    // Fest gesetzt statt von der Uhr genommen (test/README).
    const alt = new Date('2026-09-18T12:00:00Z');
    fs.utimesSync(pfad, alt, alt);

    const gelesen = await leseSperre(wurzel, DATENSATZ, nahtstellen(leseKonfig));

    expect(gelesen.geaendertMs).toBe(alt.getTime());
  });
});

describe('Sperr-Speicher: die Gegenstands-Auflösung als Grundlage der Ordnung (4T-001788, L8)', () => {
  it('liefert Vergleichs-Schlüssel, Art und nackte Nummer', () => {
    const wurzel = path.resolve('/bereich');

    expect(loeseGegenstand(wurzel, { ...DATENSATZ, id: 'r-42' })).toMatchObject({
      ok: true,
      art: ART_DATENSATZ,
      schluessel: 'kunden.md',
      kennung: 'r-00042',
      nummer: 42,
    });
    expect(loeseGegenstand(wurzel, DEFINITION)).toMatchObject({ kennung: null, nummer: null });
    expect(loeseGegenstand(wurzel, BELEGE)).toMatchObject({ art: ART_CHANGE_LOG, nummer: null });
  });
});

// --- 4T-001820: die vierte Art, der Vorgangs-Zähler des Bereichs -------------------------

const ZAEHLER = { art: ART_COUNTER };

describe('Sperr-Speicher: der Vorgangs-Zähler als vierter Gegenstand (4T-001820, B1)', () => {
  it('trägt allein seine Marke im Dateinamen und kommt unverändert zurück', () => {
    const benannt = sperrDateiName(path.resolve('/bereich'), ZAEHLER);

    expect(benannt.name).toBe('c.lock');
    expect(gegenstandAusDateiName(benannt.name).gegenstand).toEqual({
      art: ART_COUNTER,
      tabelle: null,
      id: null,
    });
  });

  it('löst auf den Bereich als Ganzes auf, ohne Tabelle und ohne Kennung', () => {
    const wurzel = path.resolve('/bereich');

    expect(loeseGegenstand(wurzel, ZAEHLER)).toMatchObject({
      ok: true,
      art: ART_COUNTER,
      relativ: '',
      schluessel: '',
      kennung: null,
      nummer: null,
    });
  });

  it('weist eine mitgegebene Tabelle und eine mitgegebene Kennung ab', () => {
    // Abgewiesen statt übergangen: Wer hier eine Tabelle mitgibt, meint etwas
    // anderes als diese Sperre, und ein still verworfenes Feld wäre die Stelle,
    // an der zwei Gegenstände denselben Dateinamen bekämen.
    const wurzel = path.resolve('/bereich');

    expect(loeseGegenstand(wurzel, { art: ART_COUNTER, tabelle: 'Kunden.md' })).toMatchObject({
      ok: false,
      code: SPERR_CODES.gegenstand,
    });
    expect(loeseGegenstand(wurzel, { art: ART_COUNTER, id: 'r-00001' })).toMatchObject({
      ok: false,
      code: SPERR_CODES.gegenstand,
    });
  });

  it('lässt sich anlegen, lesen, auflisten und entfernen wie die drei anderen Arten', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    const angelegt = await legeSperreAn(wurzel, ZAEHLER, null, nahtstellen(leseKonfig));
    expect(angelegt.gehalten).toBe(true);
    // Der Inhalt nennt keine Tabelle: Eine leere Angabe wäre eine Aussage über
    // einen Gegenstand, den es nicht gibt.
    expect(angelegt.inhalt).toEqual({
      schemaVersion: SPERR_SCHEMA_VERSION,
      art: ART_COUNTER,
      benutzer: 'anna',
      rechner: 'SC-026',
      zeitpunkt: ZEITPUNKT,
    });

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));
    expect(liste.sperren.map((s) => s.gegenstand)).toEqual([
      { art: ART_COUNTER, tabelle: null, id: null },
    ]);

    expect((await entferneSperre(wurzel, ZAEHLER, nahtstellen(leseKonfig))).entfernt).toBe(true);
    expect((await leseSperre(wurzel, ZAEHLER, nahtstellen(leseKonfig))).vorhanden).toBe(false);
  });

  it('ist ein anderer Gegenstand als jede Tabellen-Sperre', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);

    await legeSperreAn(wurzel, ZAEHLER, null, nahtstellen(leseKonfig));
    const daneben = await legeSperreAn(wurzel, DEFINITION, null, nahtstellen(leseKonfig));

    // Die zweite Sperre kommt durch: Der Zähler hält die Definition nicht auf.
    expect(daneben.gehalten).toBe(true);
    expect((await legeSperreAn(wurzel, ZAEHLER, null, nahtstellen(leseKonfig))).belegt).toBe(true);
  });
});

// --- 4T-001824: die fünfte Art, die Aufräum-Sperre eines Protokolls --------------------

describe('Sperr-Speicher: die Aufräum-Sperre als fünfter Gegenstand (4T-001824, B1)', () => {
  it('trägt die Vorgangs-Kennung des Protokolls im Dateinamen und kommt unverändert zurück', () => {
    const wurzel = path.resolve('/bereich');

    // Beide Schreibweisen der Kennung, Zahl und Text, ergeben denselben Namen:
    // Der Wiederanlauf kennt sie bei einem unlesbaren Protokoll nur als Text.
    expect(sperrDateiName(wurzel, { art: ART_SWEEP, id: 7 }).name).toBe('s+7.lock');
    expect(sperrDateiName(wurzel, { art: ART_SWEEP, id: '7' }).name).toBe('s+7.lock');
    expect(gegenstandAusDateiName('s+7.lock').gegenstand).toEqual({
      art: ART_SWEEP,
      tabelle: null,
      id: '7',
    });
    // Ein Text wird kodiert wie ein Pfad und kommt zeichengleich zurück.
    const benannt = sperrDateiName(wurzel, { art: ART_SWEEP, id: 'a+b' });
    expect(benannt.name).toBe('s+a%2Bb.lock');
    expect(gegenstandAusDateiName(benannt.name).gegenstand.id).toBe('a+b');
  });

  it('weist Tabelle, fehlende und unbrauchbare Kennung ab', () => {
    const wurzel = path.resolve('/bereich');
    for (const falsch of [
      { art: ART_SWEEP, id: 7, tabelle: 'Kunden.md' },
      { art: ART_SWEEP },
      { art: ART_SWEEP, id: '' },
      { art: ART_SWEEP, id: ' 7' },
      { art: ART_SWEEP, id: -1 },
      { art: ART_SWEEP, id: 1.5 },
    ]) {
      expect(loeseGegenstand(wurzel, falsch), JSON.stringify(falsch)).toMatchObject({
        ok: false,
        code: SPERR_CODES.gegenstand,
      });
    }
    expect(gegenstandAusDateiName('s.lock').ok).toBe(false);
    expect(gegenstandAusDateiName('s+.lock').ok).toBe(false);
  });

  it('lässt sich anlegen, auflisten und entfernen; zwei Protokolle halten einander nicht auf', async () => {
    const wurzel = bereich();
    const { leseKonfig } = konfig(undefined);
    const erste = { art: ART_SWEEP, id: 3 };

    const angelegt = await legeSperreAn(wurzel, erste, null, nahtstellen(leseKonfig));
    expect(angelegt.gehalten).toBe(true);
    // Keine Tabelle im Inhalt, die Kennung als Text wie beim Datensatz.
    expect(angelegt.inhalt).toEqual({
      schemaVersion: SPERR_SCHEMA_VERSION,
      art: ART_SWEEP,
      id: '3',
      benutzer: 'anna',
      rechner: 'SC-026',
      zeitpunkt: ZEITPUNKT,
    });
    expect((await legeSperreAn(wurzel, erste, null, nahtstellen(leseKonfig))).belegt).toBe(true);
    const zweite = await legeSperreAn(
      wurzel,
      { art: ART_SWEEP, id: 4 },
      null,
      nahtstellen(leseKonfig),
    );
    expect(zweite.gehalten).toBe(true);

    const liste = await listeSperren(wurzel, nahtstellen(leseKonfig));
    expect(liste.sperren.map((s) => s.gegenstand)).toEqual([
      { art: ART_SWEEP, tabelle: null, id: '3' },
      { art: ART_SWEEP, tabelle: null, id: '4' },
    ]);
    expect((await entferneSperre(wurzel, erste, nahtstellen(leseKonfig))).entfernt).toBe(true);
    expect((await leseSperre(wurzel, erste, nahtstellen(leseKonfig))).vorhanden).toBe(false);
  });
});

// --- AK8: nichts anderes wird geschrieben -----------------------------------------------

describe('Sperr-Vorgänge schreiben weder Tabellen- noch Bereichsdatei (4T-001787, AK8)', () => {
  it('lässt beide Dateien byte-gleich und ruft keinen Schreibvorgang auf sie', async () => {
    const wurzel = bereich();
    const tabelle = path.join(wurzel, 'Kunden.md');
    const bereichsDatei = path.join(wurzel, 'Area_Settings.mdda');
    fs.writeFileSync(bereichsDatei, '{"schemaVersion":1,"settings":{}}', 'utf8');
    const vorher = {
      tabelle: fs.readFileSync(tabelle),
      bereich: fs.readFileSync(bereichsDatei),
    };

    // Ein Dateisystem, das die echten Funktionen durchreicht und zählt, WELCHE
    // Pfade es zu sehen bekommt. Ein Byte-Vergleich allein bliebe grün, wenn
    // eine Stelle die Datei mit identischem Inhalt neu schriebe.
    const sicht = {
      writeFile: fsp.writeFile,
      readFile: fsp.readFile,
      readdir: fsp.readdir,
      mkdir: fsp.mkdir,
      unlink: fsp.unlink,
    };
    const geschrieben = [];
    const schreiben = vi.spyOn(sicht, 'writeFile').mockImplementation((p, ...rest) => {
      geschrieben.push(String(p));
      return fsp.writeFile(p, ...rest);
    });
    const { leseKonfig } = konfig(undefined);
    const deps = nahtstellen(leseKonfig, { fsp: sicht });

    await legeSperreAn(wurzel, DATENSATZ, null, deps);
    await leseSperre(wurzel, DATENSATZ, deps);
    await listeSperren(wurzel, deps);
    await entferneSperre(wurzel, DATENSATZ, deps);

    expect(schreiben).toHaveBeenCalled();
    expect(geschrieben.some((p) => p === tabelle || p === bereichsDatei)).toBe(false);
    expect(fs.readFileSync(tabelle).equals(vorher.tabelle)).toBe(true);
    expect(fs.readFileSync(bereichsDatei).equals(vorher.bereich)).toBe(true);
  });
});
