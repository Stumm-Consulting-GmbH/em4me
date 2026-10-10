#!/usr/bin/env node
// 4T-001735 (Epic 3E-000307): Erzeugt die Kalender-Sektion der mitgelieferten
// Beispiel-Sammlung, die Sektion `calendarSystems` in
// `src/demo/Area_Settings.mdda`. Sie trägt einen Block «Demo calendars» mit
// zwei Zeitrechnungen aus den mitgelieferten Vorlagen, dem gregorianischen und
// dem japanischen Kalender, in englischer Sprache — die Sammlung ist
// durchgehend englisch. Die Seite «14 Calendar Systems.md» schreibt Werte in
// beiden Kalendern.
//
// **Warum die Sektion nur so entstehen darf.** Von Hand wird an ihr nichts
// geschrieben. Eine Vorlage ergibt mehrere hundert Zeilen Definition (Ebenen,
// Schalt-Regel, Woche, Quartal, Ären, Block-Anker), und bei jeder Abweichung
// von dem, was die Anwendung selbst anlegt, sähe der Anwender in der Sammlung
// eine andere Zeitrechnung als die, die er über das Aufklapp-Menü der Vorlagen
// bekäme. Dieses Skript ruft deshalb die echten Bausteine: die Fabrik der
// Vorlage (`calendar-templates.js`) mit den englischen Texten der Anwendung und
// den Schreiber der Bereichsdatei (`writeAreaCalendarConfig` aus
// `src/main/area/area-config.js`), der normalisiert, die Ablage-Form bildet und
// die übrigen Einstellungen der Datei (die Start-Seite) stehen lässt.
//
// **Die englischen Texte kommen aus den Fragmenten**, zusammengesetzt mit
// demselben Baustein wie der Bau der Sprachdateien, aber ohne zu schreiben:
// Die erzeugte Datei `src/i18n/en.json` kann älter sein als ihre Fragmente.
//
// **Die Kennungen** sind die, die die Einstellungen beim Anwenden aus den Namen
// bilden (Kleinschreibung, Bindestrich statt Leerzeichen). Sie stehen nirgends
// sichtbar; ein Wert nennt seine Zeitrechnung beim Namen.
//
// Der Wächter `test/unit/demo-kalender.test.js` hält die ausgelieferte Sektion
// gegen die Vorlagen. Ändert sich eine Vorlage — etwa durch eine neue
// japanische Ära oder eine geänderte Übersetzung —, wird er rot, und dieses
// Skript erzeugt die Sektion neu.
//
// Aufruf aus der Wurzel des Arbeitsbereichs: node scripts/demo-kalender-erzeugen.js
//
// Ohne Aufrufer in der Anwendung und ohne Electron.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { zusammensetzen } = require('./i18n-fragmente.js');
const { findCalendarTemplate } = require('../src/shared/calendar/calendar-templates.js');
const { normalizeCalendarConfig } = require('../src/shared/calendar/calendar-config.js');
const {
  parseCanonical,
  formatTuple,
  convertInBlock,
} = require('../src/shared/calendar/calendar-core.js');
const { createAreaConfig } = require('../src/main/area/area-config.js');
const mddStore = require('../src/main/documents/mdd-store.js');

const REPO = path.resolve(__dirname, '..');
const DEMO_ORDNER = path.join(REPO, 'src', 'demo');

// Der Block der Sammlung: Name und Kennung, dazu je Zeitrechnung die Vorlage,
// aus der sie entsteht, und ihre Kennung.
const DEMO_BLOCK = Object.freeze({
  id: 'demo-calendars',
  name: 'Demo calendars',
  kalender: Object.freeze([
    Object.freeze({ vorlage: 'gregorian', id: 'gregorian-calendar' }),
    Object.freeze({ vorlage: 'japanese', id: 'japanese-calendar' }),
  ]),
});

// Gegenprobe nach dem Schreiben: derselbe Tag in beiden Kalendern, wie ihn die
// Seite «14 Calendar Systems.md» schreibt.
const GEGENPROBE = { gregorian: '2026-09-30', japanese: '8-09-30 Reiwa' };

// Übersetzungs-Funktion der englischen Sprachfassung; ein fehlender Schlüssel
// bricht ab, statt den Schlüssel als Namen in die Sammlung zu schreiben.
function englisch() {
  const { dict, fehler } = zusammensetzen('en');
  if (fehler.length > 0) {
    throw new Error(`Englische Sprachfassung nicht zusammensetzbar:\n  ${fehler.join('\n  ')}`);
  }
  return (key) => {
    if (!(key in dict)) throw new Error(`Schlüssel fehlt in der englischen Fassung: ${key}`);
    return dict[key];
  };
}

// Rohe Sektion, wie die Einstellungen sie nach dem Einfügen beider Vorlagen
// und dem Anwenden an den Schreiber übergeben.
function baueRohSektion(t) {
  return {
    blocks: [
      {
        id: DEMO_BLOCK.id,
        name: DEMO_BLOCK.name,
        calendars: DEMO_BLOCK.kalender.map(({ vorlage, id }) => {
          const eintrag = findCalendarTemplate(vorlage);
          if (!eintrag) throw new Error(`Vorlage fehlt in der Sammlung: ${vorlage}`);
          return { ...eintrag.create(t), id };
        }),
      },
    ],
  };
}

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Gegenprobe fehlgeschlagen: ${text}`);
  console.log(`ok  ${text}`);
}

async function main() {
  const roh = baueRohSektion(englisch());
  const areaConfig = createAreaConfig({
    getStore: () => null,
    areaOfWindow: () => null,
    markSelfWriting: () => {},
    mddStore,
  });
  const ergebnis = await areaConfig.writeAreaCalendarConfig(DEMO_ORDNER, roh);
  if (!ergebnis.ok) throw new Error(`Bereichsdatei nicht geschrieben: ${ergebnis.error}`);

  // Rücklesen mit dem Leser der Anwendung.
  const gelesen = await areaConfig.readAreaCalendarConfig(DEMO_ORDNER);
  const konfig = normalizeCalendarConfig(gelesen);
  pruefe(konfig && konfig.blocks.length === 1, 'ein Block in der Bereichsdatei');
  const block = konfig.blocks[0];
  pruefe(
    block.calendars.length === DEMO_BLOCK.kalender.length,
    `Block «${block.name}» trägt ${block.calendars.map((c) => `«${c.name}»`).join(' und ')}`,
  );
  const [greg, jap] = block.calendars;
  const wert = parseCanonical(greg, GEGENPROBE.gregorian);
  pruefe(wert.ok, `${greg.name} liest ${GEGENPROBE.gregorian}`);
  const umgerechnet = convertInBlock(block, greg.id, wert.tuple, jap.id);
  pruefe(
    umgerechnet.ok && formatTuple(jap, umgerechnet.tuple) === GEGENPROBE.japanese,
    `${GEGENPROBE.gregorian} ist im ${jap.name} ${GEGENPROBE.japanese}`,
  );
  const container = mddStore.parseSettingsContainer(
    fs.readFileSync(path.join(DEMO_ORDNER, mddStore.MDDA_FILENAME), 'utf8'),
  );
  pruefe(
    container.ok && container.container.settings.startPage === '00 Welcome.md',
    'Start-Seite der Sammlung unverändert',
  );
  console.log(
    `\nGeschrieben: ${path.relative(REPO, path.join(DEMO_ORDNER, mddStore.MDDA_FILENAME))}`,
  );
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
