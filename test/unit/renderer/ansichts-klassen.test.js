// @vitest-environment jsdom
// 4T-1054 (Epic 3E-0151): Wächter der Ansichts-Klassenliste.
//
// **Anlass.** Die Liste der zu entfernenden Modus-Klassen stand an fünf
// Stellen im Code (Modus-Umschaltung, System-Seiten- und Normal-Pfad des
// Pane-Renderns, zweimal der PDF-Export, Wechsel in den Bearbeiten-Modus).
// Der fünfte Modus wurde in 4T-1047 nur an einer davon nachgezogen; die
// Mindmap blieb deshalb über der Einstellungs-Seite stehen. Seither gibt es
// genau eine Liste, und dieser Wächter hält sie vollständig.
//
// Geprüft wird beides: dass jeder bekannte Modus eine Klasse hat, und dass
// keine Stelle mehr eine eigene Liste führt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_VIEW_CLASS,
  VIEW_MODES,
  VIEW_MODE_CLASSES,
  applyContentViewClass,
} from '../../../src/renderer/modules/views/view-modes.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');

// Die Stellen, die früher je eine eigene Liste führten.
const AUFRUFER = [
  'src/renderer/modules/views/views.js',
  'src/renderer/modules/views/pane-render.js',
  'src/renderer/modules/views/pdf-export.js',
];

describe('Ansichts-Klassen: eine Quelle (4T-1054)', () => {
  it('jeder bekannte Modus hat genau eine Klasse', () => {
    expect(VIEW_MODE_CLASSES).toHaveLength(VIEW_MODES.length);
    for (const modus of VIEW_MODES) {
      expect(VIEW_MODE_CLASSES).toContain(`view-${modus}`);
    }
  });

  it('der Mindmap-Modus ist geführt', () => {
    // Der konkrete Fall des Befunds: Ohne diesen Eintrag blieb die Karte
    // über der Einstellungs-Seite stehen.
    expect(VIEW_MODES).toContain('mindmap');
    expect(VIEW_MODE_CLASSES).toContain('view-mindmap');
  });

  it('keine Stelle führt mehr eine eigene Klassenliste', () => {
    const treffer = [];
    for (const rel of AUFRUFER) {
      const inhalt = readFileSync(path.join(wurzel, rel), 'utf8');
      // Zwei Modus-Klassen als Zeichenketten nebeneinander sind das Muster
      // der alten, duplizierten Liste.
      if (/'view-source',\s*'view-split'/.test(inhalt)) treffer.push(rel);
    }
    expect(treffer, `Eigene Klassenliste in: ${treffer.join(', ')}`).toEqual([]);
  });

  it('alle Aufrufer nutzen die gemeinsame Funktion', () => {
    for (const rel of AUFRUFER) {
      const inhalt = readFileSync(path.join(wurzel, rel), 'utf8');
      expect(inhalt, `${rel} ruft applyContentViewClass nicht`).toContain('applyContentViewClass');
    }
  });
});

describe('Ansichts-Schaltflächen der Statusleiste (4T-1055)', () => {
  // **Anlass.** Der Mindmap-Modus kam in 4T-1047 in Menü und Befehlspalette
  // an, nicht aber in die Statusleiste, obwohl Story S-0804 (AK1) alle drei
  // Wege verlangt. Der Befund fiel erst beim Struktur-Prüfschritt des
  // Hilfe-Tasks auf. Dieser Wächter hält Schaltflächen-Satz und Modus-Liste
  // zusammen, damit ein weiterer Modus nicht wieder ohne Schaltfläche bleibt.
  const html = readFileSync(path.join(wurzel, 'src/renderer/index.html'), 'utf8');
  const schaltflaechen = [...html.matchAll(/data-view="([a-z]+)"/g)].map((m) => m[1]);

  it('jeder Modus hat genau eine Schaltfläche', () => {
    expect([...schaltflaechen].sort()).toEqual([...VIEW_MODES].sort());
  });

  it('die Mindmap-Schaltfläche folgt dem Schalt-Zustand ihrer Erweiterung', () => {
    // Ein toter Schalter wäre schlimmer als keiner: Die Sichtbarkeit wird im
    // Statusleisten-Abgleich gesetzt, und der läuft bei jedem Reiter- und
    // Modus-Wechsel.
    const tabs = readFileSync(path.join(wurzel, 'src/renderer/modules/tabs/tabs.js'), 'utf8');
    expect(tabs).toContain('isMindmapModeAvailable');
    expect(tabs).toMatch(/dataset\.view === 'mindmap'\) b\.hidden/);
  });

  it('die beiden Gruppen der mittleren Zone stehen sichtbar getrennt', () => {
    // Nur der Abstand ist geprüft, nicht sein genauer Wert: Er soll deutlich
    // über dem früheren Zonen-Abstand von 8 Pixeln liegen.
    const css = readFileSync(path.join(wurzel, 'src/renderer/styles.css'), 'utf8');
    const zone = /\.statusbar-center \{([^}]*)\}/.exec(css);
    expect(zone, 'Regel .statusbar-center nicht gefunden').not.toBeNull();
    const gap = /gap:\s*(\d+)px/.exec(zone[1]);
    expect(gap, 'kein eigener Abstand in .statusbar-center').not.toBeNull();
    expect(Number(gap[1])).toBeGreaterThan(8);
  });
});

describe('Ansichts-Klassen: Verhalten der gemeinsamen Funktion (4T-1054)', () => {
  const baueElement = () => {
    const el = document.createElement('div');
    el.className = 'content';
    return el;
  };

  it('setzt genau die verlangte Klasse', () => {
    const el = baueElement();
    applyContentViewClass(el, 'view-mindmap');
    expect(el.classList.contains('view-mindmap')).toBe(true);
    expect(el.classList.contains('content')).toBe(true);
  });

  it('entfernt jede andere Modus-Klasse, auch die des Mindmap-Modus', () => {
    const el = baueElement();
    applyContentViewClass(el, 'view-mindmap');
    applyContentViewClass(el, 'view-rendered');
    expect(el.classList.contains('view-mindmap')).toBe(false);
    expect(el.classList.contains('view-rendered')).toBe(true);
  });

  it('der Wechsel auf die System-Seite räumt den Mindmap-Modus weg', () => {
    // Genau der gemeldete Befund: Einstellungen öffnen, während die Karte
    // sichtbar ist.
    const el = baueElement();
    applyContentViewClass(el, 'view-mindmap');
    applyContentViewClass(el, SYSTEM_VIEW_CLASS);
    expect(el.classList.contains('view-mindmap')).toBe(false);
    expect(el.classList.contains(SYSTEM_VIEW_CLASS)).toBe(true);
  });

  it('der Rückweg von der System-Seite räumt deren Klasse weg', () => {
    const el = baueElement();
    applyContentViewClass(el, SYSTEM_VIEW_CLASS);
    applyContentViewClass(el, 'view-split');
    expect(el.classList.contains(SYSTEM_VIEW_CLASS)).toBe(false);
    expect(el.classList.contains('view-split')).toBe(true);
  });

  it('verträgt ein fehlendes Element und eine leere Klasse', () => {
    expect(() => applyContentViewClass(null, 'view-split')).not.toThrow();
    const el = baueElement();
    applyContentViewClass(el, 'view-split');
    applyContentViewClass(el, null);
    expect(el.className).toBe('content');
  });
});
