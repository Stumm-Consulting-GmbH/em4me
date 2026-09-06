// 4T-001479 (Epic 3E-000177): Waechter ueber den Menue-Ort des Druck-Eintrags.
//
// Entscheidung E5 des Epics: «Drucken…» steht unter «Weitere Datei-Funktionen»
// unmittelbar VOR «Als PDF exportieren…». Die Reihenfolge ist keine Kosmetik —
// beide Wege teilen Grundlage und Ansichts-Regel, und der Handbuch-Text nennt
// den Pfad woertlich. Verrutscht der Eintrag, stimmt die Anleitung nicht mehr.
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

describe('Druck-Menuepunkt: Ort und Verdrahtung (E5)', () => {
  it('steht unmittelbar vor dem PDF-Export', () => {
    const iDruck = menuQuelle.indexOf("label: t('menu.file.print')");
    const iPdf = menuQuelle.indexOf("label: t('menu.file.exportPdf')");
    expect(iDruck, 'Menue-Eintrag «Drucken…» fehlt').toBeGreaterThan(-1);
    expect(iPdf, 'Menue-Eintrag «Als PDF exportieren…» fehlt').toBeGreaterThan(-1);
    expect(iDruck, 'Drucken muss VOR dem PDF-Export stehen').toBeLessThan(iPdf);
    // Zwischen beiden darf kein dritter Menue-Eintrag liegen: sie gehoeren
    // in denselben Block, ohne Trenner und ohne Fremdes dazwischen.
    const dazwischen = menuQuelle.slice(iDruck, iPdf);
    expect(dazwischen).not.toContain("type: 'separator'");
    expect(dazwischen.match(/label: t\(/g) || []).toHaveLength(1);
  });

  it('teilt die enabled-Regel des PDF-Exports', () => {
    // Handbuch-Reiter sind druckbar, nur die Einstellungs-Seite nicht.
    const abschnitt = menuQuelle.slice(
      menuQuelle.indexOf("label: t('menu.file.print')"),
      menuQuelle.indexOf("label: t('menu.file.exportPdf')"),
    );
    expect(abschnitt).toContain("click: send('menu:print')");
    expect(abschnitt).toContain("accelerator: acc('file.print')");
    expect(abschnitt).toContain('!!(state && state.hasActiveTab) && !systemTab');
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
