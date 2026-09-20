// 4T-001479 (Epic 3E-000177): Waechter ueber den Menue-Ort des Druck-Eintrags.
//
// Entscheidung E5 des Epics: «Drucken…» steht unter «Weitere Datei-Funktionen»
// unmittelbar VOR «Als PDF exportieren…». Die Reihenfolge ist keine Kosmetik —
// beide Wege teilen Grundlage und Ansichts-Regel, und der Handbuch-Text nennt
// den Pfad woertlich. Verrutscht der Eintrag, stimmt die Anleitung nicht mehr.
//
// 4T-001811 (Epic 3E-000292): E5 ist durch die Entscheidung des Product Owners
// vom 2026-09-19 fortgeschrieben — im Wortlaut «Dann ist alles an einer
// Stelle». «Als PDF exportieren…» ist in das Untermenue «Exportieren»
// gewandert und steht dort an ERSTER Stelle, vor «Portables Markdown…».
// «Drucken…» bleibt auf seiner Ebene, weil Drucken kein Export ist, und steht
// dort unmittelbar vor dem Untermenue-Punkt «Exportieren». Damit gilt die
// Nachbarschaft weiter, nur eine Stufe versetzt: Die Begruendung von E5 traegt
// unveraendert, denn beide Wege teilen Grundlage und Ansichts-Regel, und der
// Handbuch-Text nennt den Pfad nach wie vor woertlich.
//
// Geprueft wird gegen den QUELLTEXT: menu.js ist Hauptprozess-Code und laedt
// Electron, ist im Unit-Kontext also nicht importierbar (Muster
// menu-accelerator.test.js). Im E2E-Lauf ist der Menue-Baum nicht erreichbar,
// weil das Menue je Fenster gesetzt wird (win.setMenu) und nicht als
// Anwendungs-Menue.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../src/shared/commands/commands.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const menuQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/menu/menu.js'), 'utf8');

const I_DRUCK = menuQuelle.indexOf("label: t('menu.file.print')");
const I_UNTERMENUE = menuQuelle.indexOf("label: t('menu.file.export')");
const I_PDF = menuQuelle.indexOf("label: t('menu.file.exportPdf')");
const I_PORTABEL = menuQuelle.indexOf("label: t('menu.file.exportPortable')");

describe('Druck-Menuepunkt: Ort und Verdrahtung (E5)', () => {
  it('steht unmittelbar vor dem Untermenü «Exportieren»', () => {
    expect(I_DRUCK, 'Menue-Eintrag «Drucken…» fehlt').toBeGreaterThan(-1);
    expect(I_UNTERMENUE, 'Untermenue-Punkt «Exportieren» fehlt').toBeGreaterThan(-1);
    expect(I_DRUCK, 'Drucken muss VOR dem Untermenü «Exportieren» stehen').toBeLessThan(
      I_UNTERMENUE,
    );
    // Zwischen beiden darf kein dritter Menue-Eintrag liegen: sie gehoeren
    // in denselben Block, ohne Trenner und ohne Fremdes dazwischen.
    const dazwischen = menuQuelle.slice(I_DRUCK, I_UNTERMENUE);
    expect(dazwischen).not.toContain("type: 'separator'");
    expect(dazwischen.match(/label: t\(/g) || []).toHaveLength(1);
  });

  it('der PDF-Export ist der erste Eintrag des Untermenüs «Exportieren»', () => {
    expect(I_PDF, 'Menue-Eintrag «Als PDF exportieren…» fehlt').toBeGreaterThan(-1);
    expect(I_PORTABEL, 'Menue-Eintrag «Portables Markdown…» fehlt').toBeGreaterThan(-1);
    // Er liegt IM Untermenü (hinter dessen Beschriftung) und nicht mehr auf
    // der Ebene darüber.
    expect(I_PDF, 'Der PDF-Export muss im Untermenü «Exportieren» stehen').toBeGreaterThan(
      I_UNTERMENUE,
    );
    expect(I_PDF, 'Der PDF-Export muss VOR dem portablen Markdown stehen').toBeLessThan(I_PORTABEL);
    // «Erster Eintrag» ist mehr als «vor dem portablen Markdown»: Zwischen der
    // öffnenden Item-Liste des Untermenüs und dem PDF-Eintrag darf keine
    // weitere Beschriftung und kein Trenner liegen.
    const iListe = menuQuelle.indexOf('submenu: compactSubmenu([', I_UNTERMENUE);
    expect(iListe, 'Item-Liste des Untermenüs «Exportieren» nicht gefunden').toBeGreaterThan(-1);
    expect(iListe).toBeLessThan(I_PDF);
    const davor = menuQuelle.slice(iListe, I_PDF);
    expect(davor).not.toContain("type: 'separator'");
    expect(davor.match(/label: t\(/g) || []).toHaveLength(0);
  });

  it('teilt die Verfügbarkeits-Regel des PDF-Exports', () => {
    // Handbuch-Reiter sind druckbar, nur die Einstellungs-Seite nicht.
    //
    // 4T-001637 (Epic 3E-000295): Diese Regel steht seither nicht mehr als
    // Ausdruck im Menü-Eintrag, sondern als benannte Bedingung am Kommando;
    // der Eintrag ruft nur noch die Auswertung auf. Der Wächter prüft deshalb
    // BEIDES — dass der Eintrag delegiert und dass die Bedingung dahinter die
    // gemeinte ist. Nur das erste zu prüfen hieße, die Aussage «teilt die Regel
    // des PDF-Exports» aufzugeben, um die es diesem Fall geht.
    //
    // 4T-001811: Der Abschnitt reicht seit der Verlegung vom Druck-Eintrag bis
    // zum Untermenü-Punkt «Exportieren» — der PDF-Eintrag steht jetzt dahinter.
    const abschnitt = menuQuelle.slice(I_DRUCK, I_UNTERMENUE);
    expect(abschnitt).toContain("click: send('menu:print')");
    expect(abschnitt).toContain("accelerator: acc('file.print')");
    expect(abschnitt).toContain("enabled: avail('file.print')");

    const druck = COMMANDS.find((c) => c.id === 'file.print');
    const pdf = COMMANDS.find((c) => c.id === 'file.exportPdf');
    expect(druck.availability).toBe('contentTab');
    expect(druck.availability, 'Drucken und PDF-Export müssen dieselbe Bedingung tragen').toBe(
      pdf.availability,
    );
  });

  it('das Kommando steht mit Strg+P in der Registry', () => {
    const cmd = COMMANDS.find((c) => c.id === 'file.print');
    expect(cmd, 'Kommando file.print fehlt in der Registry').toBeTruthy();
    expect(cmd.defaultBindings).toEqual(['CmdOrCtrl+P']);
    expect(cmd.menu).toBe(true);
    // Drucken gilt dem Reiter, nicht dem Editor — sonst griffe es nur bei
    // Fokus im Quelltext.
    expect(cmd.editorScoped).toBe(false);
  });

  it('Strg+P ist keinem zweiten Kommando zugewiesen', () => {
    const kollisionen = COMMANDS.filter(
      (c) => c.id !== 'file.print' && (c.defaultBindings || []).includes('CmdOrCtrl+P'),
    );
    expect(kollisionen.map((c) => c.id)).toEqual([]);
  });
});
