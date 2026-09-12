// 4T-001653 (Epic 3E-000287): Wächter über eine Klasse — jede Schaltflächen-Art,
// die im Code deaktiviert wird, muss das auch **sehen lassen**.
//
// **Anlass.** Der Product Owner meldete am 2026-09-09 in der Abnahme des
// Canvas-Modus: Die Schaltfläche der Canvas-Ansicht ist bei einem Dokument
// ohne Fläche zwar wirkungslos, sieht aber aus wie jede andere — weder im
// hellen noch im dunklen Schema war ein Unterschied zu sehen. Ursache war
// nicht die Canvas: `.btn` und `.btn-toggle` tragen seit jeher eine
// `:disabled`-Regel, `.view-btn` nie. Die Ansichts-Schalter werden aber schon
// seit 4T-000277 auf System-Seiten deaktiviert — der Mangel lag also zwei
// Epics lang im Bestand und war nur nie aufgefallen, weil niemand auf einer
// Einstellungs-Seite einen Ansichts-Schalter gesucht hat.
//
// **Warum ein Wächter und nicht nur die eine Regel.** Der Fehler ist kein
// Tippfehler, sondern eine Lücke zwischen zwei Orten: Der Code setzt
// `disabled`, das Stilblatt weiß nichts davon. Diese Lücke kann bei jeder
// neuen Schaltflächen-Art wieder entstehen, und sie fällt niemandem auf, weil
// nichts kaputtgeht — es sieht nur falsch aus. Ein Schalter, der sich nicht
// drücken lässt und dabei aussieht wie ein drückbarer, ist schlimmer als ein
// fehlender: Der Nutzer klickt und hält die Anwendung für kaputt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const css = readFileSync(path.join(wurzel, 'src/renderer/styles.css'), 'utf8');
const tabs = readFileSync(path.join(wurzel, 'src/renderer/modules/tabs/tabs.js'), 'utf8');

// Die Schaltflächen-Arten der Statusleiste, die im Code deaktiviert werden.
const ARTEN = ['.btn', '.btn-toggle', '.view-btn'];

// Ein Block `<selektor> { … }` aus dem Stilblatt.
function block(selektor) {
  const treffer = new RegExp(`\\${selektor}:disabled\\s*\\{([^}]*)\\}`).exec(css);
  return treffer ? treffer[1] : null;
}

describe('Deaktivierte Schaltflächen sind sichtbar deaktiviert (4T-001653)', () => {
  it('jede deaktivierbare Art trägt eine :disabled-Regel', () => {
    const ohne = ARTEN.filter((art) => block(art) === null);
    expect(
      ohne,
      `Ohne :disabled-Regel in styles.css: ${ohne.join(', ')} — ` +
        'eine Schaltfläche, die sich nicht drücken lässt, muss das zeigen.',
    ).toEqual([]);
  });

  it('die Regel dämpft sichtbar und nimmt den Zeiger zurück', () => {
    for (const art of ARTEN) {
      const regel = block(art);
      expect(regel, `${art}:disabled ohne Deckkraft`).toMatch(/opacity:\s*0?\.\d/);
      expect(regel, `${art}:disabled ohne cursor`).toMatch(/cursor:\s*default/);
    }
  });

  it('alle drei Arten dämpfen gleich stark', () => {
    // Verschiedene Werte wären für den Nutzer ein Unterschied ohne Bedeutung.
    const werte = ARTEN.map((art) => /opacity:\s*([\d.]+)/.exec(block(art))[1]);
    expect(new Set(werte).size, `Uneinheitliche Deckkraft: ${werte.join(', ')}`).toBe(1);
  });

  it('kein Hover-Effekt auf einer deaktivierten Schaltfläche', () => {
    // Sonst leuchtet der tote Schalter beim Überfahren auf und verspricht
    // genau das, was er nicht kann.
    for (const art of ARTEN) {
      const hover = new RegExp(`\\${art}:hover(:not\\(:disabled\\))?\\s*\\{`).exec(css);
      expect(hover, `${art}:hover nicht gefunden`).not.toBeNull();
      expect(hover[1], `${art}:hover greift auch im deaktivierten Zustand`).toBe(':not(:disabled)');
    }
  });

  it('die Ansichts-Schalter werden tatsächlich deaktiviert', () => {
    // Gegenprobe: Ohne sie schützte die Regel oben einen Zustand, den es
    // nicht gibt. Zwei Fälle sind belegt — System-Seiten (4T-000277) und das
    // Dokument ohne Canvas-Fläche (4T-001653).
    expect(tabs).toMatch(/b\.disabled = systemTab/);
    expect(tabs).toMatch(/dataset\.view === 'canvas' && !canvasVerfuegbar/);
  });
});
