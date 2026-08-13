// 4T-0900 (Epic 3E-0016), Register-Paare 9 bis 11: drei gleichartige
// Durchlauf-Waechter ueber Paare, deren fehlender Eintrag heute still
// zurueckfaellt. Gebuendelt in einer Datei, weil sie Muster und Geruest
// teilen; je Paar eine eigene Pruefgruppe.
//
// Gemeinsames Prinzip: Die fuehrende Quelle wird importiert, nicht geparst,
// wo immer sie exportiert ist. Nur wo eine Tabelle modul-intern bleibt, wird
// der Quelltext gelesen — dann mit unterer Schranke, damit ein leer laufender
// Ausdruck den Waechter nicht still gruen macht.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUAL_PAGES } from '../../src/shared/manual/manual-pages.js';
import { TAB_GROUP_COLOR_KEYS } from '../../src/shared/tab-group-colors.js';
import { CLOCK_MODES } from '../../src/shared/clock/clock-options.js';
import { COMMAND_ICONS } from '../../src/shared/commands/command-icons.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// ---------------------------------------------------------------------------
// Paar 9: Handbuch-Seiten gegen die fuenf Fassungen der Ueberblicksseite.
//
// Der Ueberblick ist der Wegweiser des Handbuchs. Fehlt dort der Verweis auf
// eine Seite, bleibt sie technisch ladbar, ueber den Wegweiser aber
// unerreichbar — und das faellt nur in der Sprache auf, die man selbst liest.
// Der Handbuch-Pruefschritt verlangt den Eintrag in allen fuenf Fassungen; bis
// hierher hing die Regel am Gedaechtnis.
// ---------------------------------------------------------------------------
const SPRACHEN = ['de', 'en', 'fr', 'es', 'it'];
const handbuchSeiten = MANUAL_PAGES.map((p) => p.id).filter((id) => id !== 'overview');

describe('Paar 9: Handbuch-Überblick verweist auf jede Seite (4T-0900)', () => {
  it('alle fünf Fassungen führen jede Handbuch-Seite', () => {
    expect(handbuchSeiten.length).toBeGreaterThan(30);
    for (const sprache of SPRACHEN) {
      const text = lies(`src/i18n/help/overview.${sprache}.md`);
      const fehlend = handbuchSeiten.filter((id) => !text.includes(`(${id}.md)`));
      expect(fehlend, `Überblick ${sprache}: Seite ohne Verweis: ${fehlend.join(', ')}`).toEqual(
        [],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Paar 10: Farb-Schluessel der Reiter-Gruppen gegen das Stylesheet.
//
// Beide Orte tragen dieselbe Farb-Menge, und der Code-Kommentar an der Quelle
// verlangt ausdruecklich, sie gemeinsam zu pflegen. Fehlt eine Variable, faellt
// die Darstellung still auf die Standard-Farbe zurueck.
// ---------------------------------------------------------------------------
describe('Paar 10: Reiter-Gruppen-Farben und Stylesheet (4T-0900)', () => {
  const css = lies('src/renderer/styles.css');
  const imStylesheet = [
    ...new Set([...css.matchAll(/--tab-group-([a-z]+)\s*:/g)].map((m) => m[1])),
  ];

  it('jeder Farb-Schlüssel hat seine Stylesheet-Variable', () => {
    expect(TAB_GROUP_COLOR_KEYS.length).toBeGreaterThan(5);
    expect(imStylesheet.length).toBeGreaterThan(5);
    const ohne = TAB_GROUP_COLOR_KEYS.filter((k) => !imStylesheet.includes(k));
    expect(ohne, `Farb-Schlüssel ohne Stylesheet-Variable: ${ohne.join(', ')}`).toEqual([]);
  });

  it('jede Stylesheet-Variable gehört zu einem Farb-Schlüssel', () => {
    const verwaist = imStylesheet.filter((k) => !TAB_GROUP_COLOR_KEYS.includes(k));
    expect(verwaist, `Stylesheet-Variable ohne Farb-Schlüssel: ${verwaist.join(', ')}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paar 11: Uhr-Modi gegen ihre Symbol-Zuordnung.
//
// Die Zuordnung liegt modul-intern in clock-panel.js und ist deshalb als
// einzige der drei nur ueber den Quelltext lesbar. Fehlt ein Eintrag, setzt der
// Panel-Aufbau ein undefiniertes Symbol ein: Der Knopf bleibt leer oder zeigt
// den Text 'undefined'.
// ---------------------------------------------------------------------------
describe('Paar 11: Uhr-Modi und ihre Symbole (4T-0900)', () => {
  const quelle = lies('src/renderer/modules/clock/clock-panel.js');
  const beginn = quelle.indexOf('MODE_ICONS');
  const block = beginn < 0 ? '' : quelle.slice(beginn, quelle.indexOf('};', beginn));
  const paare = [...block.matchAll(/(\w+):\s*'([\w.-]+)'/g)];
  const zugeordnet = paare.map((m) => m[1]);
  const symbolNamen = paare.map((m) => m[2]);

  it('jeder Uhr-Modus hat ein zugeordnetes Symbol', () => {
    // Untere Schranke: Bricht die Form der Tabelle, liefe die Auswertung leer
    // und der Waechter waere still gruen.
    expect(beginn).toBeGreaterThan(-1);
    expect(zugeordnet.length).toBeGreaterThan(3);
    const ohne = CLOCK_MODES.filter((m) => !zugeordnet.includes(m));
    expect(ohne, `Uhr-Modus ohne Symbol: ${ohne.join(', ')}`).toEqual([]);
  });

  it('jedes zugeordnete Symbol ist bekannt', () => {
    const unbekannt = symbolNamen.filter((n) => !(n in COMMAND_ICONS));
    expect(unbekannt, `Symbol-Name ohne Definition: ${unbekannt.join(', ')}`).toEqual([]);
  });
});
