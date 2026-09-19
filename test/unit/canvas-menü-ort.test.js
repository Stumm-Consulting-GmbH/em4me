// 4T-001796 (Epic 3E-000315): Waechter ueber den Menue-Ort der Flaechen-Befehle.
//
// Entscheidung des Product Owners vom 2026-09-18 (Variante V2): Die sieben
// Eintraege, die auf der Canvas-Flaeche wirken, stehen gebuendelt in EINEM
// Untermenue «Flaeche bearbeiten»; der Ansichts-Modus «Canvas» bleibt bei den
// uebrigen Modi und behaelt Strg+6. Der Weg ist keine Kosmetik — Funktions-
// Katalog und Handbuch nennen ihn woertlich. Verrutscht ein Eintrag, ist die
// Anleitung still falsch.
//
// Geprueft wird zweifach. Erstens gegen den QUELLTEXT, wie es das Vorbild
// druck-menue-ort.test.js tut: menu.js ist Hauptprozess-Code, und im E2E-Lauf
// ist der Menue-Baum nicht erreichbar, weil das Menue je Fenster ueber
// win.setMenu gesetzt wird und kein Anwendungs-Menue ist. Zweitens am
// GEBAUTEN Baum: Electron ist hier auf die eine Stelle gestellt, die
// buildMenu braucht (Menu.buildFromTemplate), das Ergebnis ist damit die
// fertige Vorlage. Nur so laesst sich der Aus-Zustand zeigen — dass mit der
// abgeschalteten Erweiterung nicht nur die Eintraege, sondern auch das
// Untermenue und sein Trenner verschwinden.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extensionById } from '../../src/shared/extensions/extensions.js';

// menu.js ist CommonJS und holt `Menu` mit require('electron'). Im Testlauf
// liefert dieses Paket nur den Pfad der ausfuehrbaren Datei, und vi.mock
// greift auf einem require() innerhalb eines CJS-Moduls nicht. Der Zugang ist
// deshalb der CJS-Modul-Zwischenspeicher: Ein Eintrag unter dem aufgeloesten
// Pfad des Pakets, gesetzt VOR dem ersten require der Menue-Fabrik, gibt ihr
// die eine Stelle, die sie braucht. buildFromTemplate reicht die Vorlage
// unveraendert zurueck — geprueft wird der Baum, den menu.js baut, nicht was
// Electron daraus macht.
const cjs = createRequire(import.meta.url);
const electronPfad = cjs.resolve('electron');
cjs.cache[electronPfad] = {
  id: electronPfad,
  filename: electronPfad,
  loaded: true,
  exports: { Menu: { buildFromTemplate: (template) => template } },
};
const { buildMenu, tForLocale } = cjs('../../src/main/menu/menu.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const menuQuelle = fs.readFileSync(path.join(WURZEL, 'src/main/menu/menu.js'), 'utf8');

// Die sechs Anlege-Befehle in ihrer festgelegten Reihenfolge (Story 4S-000958).
const ANLEGEN = [
  'canvas.addCard',
  'canvas.addShape',
  'canvas.addGroup',
  'canvas.addLinkCard',
  'canvas.addImageCard',
  'canvas.addConnection',
];

const MARKE_UNTERMENUE = "submenuOrNull('menu.view.canvasEdit', [";
const MARKE_STAPEL = "submenuOrNull('menu.view.canvasStack'";
const MARKE_MODUS = "unless('view.modeCanvas', {";

/**
 * Der Quelltext-Abschnitt des neuen Untermenues, von seinem Aufruf bis zur
 * schliessenden Klammer seiner Item-Liste. Geschnitten wird ueber die
 * Klammer-Zaehlung und nicht ueber eine zweite Text-Marke: Eine Marke am Ende
 * waere eine Verabredung, die beim naechsten Eingriff still bricht.
 */
function untermenueAbschnitt(quelle) {
  const start = quelle.indexOf(MARKE_UNTERMENUE);
  if (start < 0) return null;
  let tiefe = 0;
  for (let i = start + MARKE_UNTERMENUE.length - 1; i < quelle.length; i++) {
    if (quelle[i] === '[') tiefe++;
    else if (quelle[i] === ']') {
      tiefe--;
      if (tiefe === 0) return quelle.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Die Befund-Liste des Orts-Wächters. Als eigene Funktion, damit die Rot-Probe
 * sie an einem eingebauten Verstoß fahren kann: Ein Wächter, der nur am
 * heilen Bestand gelaufen ist, hat nichts bewiesen.
 */
function befunde(quelle) {
  const b = [];
  const abschnitt = untermenueAbschnitt(quelle);
  if (!abschnitt) return ['Untermenü «Canvas-Fläche bearbeiten» fehlt'];
  const davor = quelle.slice(0, quelle.indexOf(MARKE_UNTERMENUE));
  const ausserhalb = quelle.replace(abschnitt, '');

  // Der Modus-Eintrag steht auf oberster Ebene des Ansichtsmenüs, VOR dem
  // Untermenü — und nicht darin.
  if (!davor.includes(MARKE_MODUS)) b.push('view.modeCanvas steht nicht vor dem Untermenü');
  if (abschnitt.includes('view.modeCanvas')) b.push('view.modeCanvas steht IM Untermenü');

  // Die sechs Anlege-Befehle liegen im Untermenü, in ihrer Reihenfolge, und
  // nirgends sonst im Menü-Baum.
  let letzte = -1;
  for (const id of ANLEGEN) {
    const marke = `unless('${id}', {`;
    const i = abschnitt.indexOf(marke);
    if (i < 0) b.push(`${id} steht nicht im Untermenü`);
    else if (i < letzte) b.push(`${id} steht in falscher Reihenfolge`);
    else letzte = i;
    if (ausserhalb.includes(marke)) b.push(`${id} steht zusätzlich außerhalb des Untermenüs`);
  }

  // Das bestehende Stapel-Untermenü ist der letzte Eintrag, durch einen
  // Trenner von den Anlege-Befehlen abgesetzt.
  const iStapel = abschnitt.indexOf(MARKE_STAPEL);
  if (iStapel < 0) b.push('Stapel-Untermenü steht nicht im Untermenü');
  else {
    if (iStapel < letzte) b.push('Stapel-Untermenü steht nicht hinter den Anlege-Befehlen');
    const dazwischen = abschnitt.slice(letzte, iStapel);
    if (!dazwischen.includes("type: 'separator'")) b.push('Trenner vor dem Stapel-Untermenü fehlt');
  }
  if (ausserhalb.includes(MARKE_STAPEL)) b.push('Stapel-Untermenü steht zusätzlich außerhalb');

  // Die Karten-Liste ist ein Panel und bleibt unter Ansicht → Sidebar →
  // Panels (Paritäts-Konvention für Sidebar-Panels).
  if (abschnitt.includes('CanvasList') || abschnitt.includes('panelSubmenu')) {
    b.push('Die Karten-Liste steht im Untermenü statt bei den Panels');
  }
  return b;
}

describe('Canvas: Menü-Ort der Flächen-Befehle (4T-001796)', () => {
  it('das Untermenü trägt die sieben Einträge, der Modus steht davor', () => {
    expect(befunde(menuQuelle)).toEqual([]);
  });

  it('die Prüfung feuert an einem eingebauten Verstoß', () => {
    // Rot-Probe: Ein Anlege-Befehl zieht zurück auf die oberste Ebene. Der
    // Wächter muss das melden, sonst schreibt er die Struktur nicht fest.
    const abschnitt = untermenueAbschnitt(menuQuelle);
    const marke = "unless('canvas.addShape', {";
    const verschoben = menuQuelle.replace(
      abschnitt,
      `${marke}\n}),\n${abschnitt.replace(marke, "unless('canvas.addShapeX', {")}`,
    );
    expect(befunde(verschoben).join(' | ')).toContain('canvas.addShape');
  });
});

// --- Der gebaute Baum ------------------------------------------------------

const CANVAS_KOMMANDOS = extensionById('canvas').commands;

function baueAnsichtsMenue(disabledCommands) {
  const template = buildMenu(
    null,
    {
      locale: 'de',
      viewMode: 'canvas',
      hasActiveTab: true,
      canvasTab: true,
      disabledCommands,
    },
    null,
  );
  const modusLabel = tForLocale('de', 'menu.view.canvas');
  const ansicht = template.find(
    (top) =>
      Array.isArray(top.submenu) &&
      top.submenu.some((i) => i && i.type === 'radio' && i.label === modusLabel),
  );
  // Ohne die Erweiterung gibt es den Modus-Eintrag nicht mehr; dann wird das
  // Ansichtsmenü über den Bearbeiten-Umschalter gefunden.
  if (ansicht) return ansicht.submenu;
  const editLabel = tForLocale('de', 'menu.view.edit');
  const ersatz = template.find(
    (top) => Array.isArray(top.submenu) && top.submenu.some((i) => i && i.label === editLabel),
  );
  return ersatz ? ersatz.submenu : [];
}

function labels(items) {
  return items.map((i) => (i.type === 'separator' ? '—' : i.label));
}

/** Jede Ebene des Baums, damit die Suche kein Untermenü auslässt. */
function alleEbenen(items) {
  const out = [items];
  for (const i of items) if (i && Array.isArray(i.submenu)) out.push(...alleEbenen(i.submenu));
  return out;
}

describe('Canvas: das gebaute Untermenü und sein Aus-Zustand (4T-001796)', () => {
  const EDIT = tForLocale('de', 'menu.view.canvasEdit');
  const STAPEL = tForLocale('de', 'menu.view.canvasStack');

  it('eingeschaltet: ein Eintrag mit sechs Befehlen, Trenner und Stapel-Untermenü', () => {
    const ansicht = baueAnsichtsMenue([]);
    const eintrag = ansicht.find((i) => i.label === EDIT);
    expect(eintrag, 'Eintrag «Canvas-Fläche bearbeiten» fehlt im Ansichtsmenü').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([
      ...ANLEGEN.map((id) => tForLocale('de', `command.${id}`)),
      '—',
      STAPEL,
    ]);
    expect(eintrag.submenu[eintrag.submenu.length - 1].submenu).toHaveLength(4);
    // Der Modus bleibt außerhalb und steht vor dem Untermenü.
    const iModus = ansicht.findIndex((i) => i.label === tForLocale('de', 'menu.view.canvas'));
    expect(iModus).toBeGreaterThan(-1);
    expect(iModus).toBeLessThan(ansicht.indexOf(eintrag));
  });

  it('abgeschaltet: weder Eintrag noch leeres Untermenü noch Trenner bleiben stehen', () => {
    const ansicht = baueAnsichtsMenue(CANVAS_KOMMANDOS);
    for (const ebene of alleEbenen(ansicht)) {
      expect(ebene.some((i) => i.label === EDIT)).toBe(false);
      expect(ebene.some((i) => Array.isArray(i.submenu) && i.submenu.length === 0)).toBe(false);
      expect(ebene[ebene.length - 1] && ebene[ebene.length - 1].type).not.toBe('separator');
      for (let i = 1; i < ebene.length; i++) {
        expect(ebene[i].type === 'separator' && ebene[i - 1].type === 'separator').toBe(false);
      }
    }
  });

  it('nur die Anlege-Befehle abgeschaltet: der Trenner bleibt nicht führend stehen', () => {
    // Der Fall, für den compactSubmenu da ist: Was übrig bleibt, beginnt mit
    // dem Stapel-Untermenü und nicht mit einer leeren Linie darüber.
    const ansicht = baueAnsichtsMenue(ANLEGEN);
    const eintrag = ansicht.find((i) => i.label === EDIT);
    expect(eintrag, 'Eintrag «Canvas-Fläche bearbeiten» fehlt im Ansichtsmenü').toBeTruthy();
    expect(labels(eintrag.submenu)).toEqual([STAPEL]);
  });
});
