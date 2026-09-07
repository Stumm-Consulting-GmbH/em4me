// 4T-001130 (Epic 3E-000272): Wächter über die Klasse «erzeugter Teilbaum».
//
// Der behobene Mangel ist keine einzelne Stelle, sondern eine Klasse: Ein Modul
// baut aus Markdown einen Teilbaum, setzt ihn per `innerHTML` ein und zieht die
// Nachverarbeitung der Render-Pipeline nicht nach. Die Konstrukte darin bleiben
// inert — was die Pipeline erst befüllt, bleibt leer; was sie erst bedienbar
// macht, bleibt stumm. Gefunden wurde die Klasse dreimal: Ausgabe eines
// Skript-Blocks (4T-001110), Wiki-Einbettung (2026-08-29) und Notiz-Vorschau
// (2026-09-05, gefunden von genau diesem Wächter).
//
// Dieser Wächter hält den Vollbestand gegen die Klassifikation: JEDE Stelle, die
// `api.renderMarkdown` aufruft, gehört in genau eine der drei Klassen, und jede
// Klasse hat ihre Pflicht. Eine neue Stelle, die niemand einordnet, macht ihn
// rot — das ist seine Aufgabe, denn die vierte Fundstelle wäre sonst wieder ein
// Zufallsfund.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.resolve(HERE, '..', '..', 'src', 'renderer');

// Klasse 1: Vollansicht. Zeigt ein ganzes Dokument in einer Pane oder Seite und
// ruft `applyRenderPipeline` — den vollen Satz samt Bearbeitbarkeit.
const VOLLANSICHT = [
  'modules/views/pane-render.js',
  'modules/editor/editor-preview.js',
  'modules/properties/properties-save.js',
  'modules/properties/properties-suggest.js',
  'modules/views/history-page.js',
  'modules/views/history-status.js',
];

// Klasse 2: Erzeugter Teilbaum. Setzt gerenderten Markdown in ein bestehendes
// Dokument und ruft `applyTeilbaumSchritte` — Darstellung und Befüllung ohne
// Bearbeitbarkeit (Entscheidung des Product Owners vom 2026-09-05).
const TEILBAUM = [
  'modules/render-mermaid.js',
  'modules/query/perspective-script-view.js',
  'modules/panels/notes-panel.js',
];

// Klasse 3: Widget-Extraktion im Editor. Rendert ein EINZELNES Konstrukt in
// einen Wegwerf-Container und entnimmt daraus einen Knoten; der Container selbst
// wird nie eingesetzt. Kein Schritt-Satz, und zwar aus einem benannten Grund:
// Diese Stellen laufen je sichtbarem Block im Editor, und die
// Performance-Leitplanke verbietet dort Voll-Dokument-Arbeit (Entwicklungs-
// richtlinien, Kapitel 5). Wer eine Stelle hier einträgt, trägt die Begründung
// mit ein.
const WIDGET_EXTRAKTION = [
  'modules/live/live-widget-render.js',
  'modules/live/live-mermaid-widget.js',
];

function dateienMitRenderAufruf() {
  const treffer = [];
  const gehe = (dir) => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        gehe(voll);
        continue;
      }
      if (!eintrag.name.endsWith('.js')) continue;
      // Das gebaute Bundle ist eine Kopie der Quellen und zählt nicht.
      if (eintrag.name.endsWith('.bundle.js')) continue;
      const inhalt = fs.readFileSync(voll, 'utf8');
      if (/\bapi\.renderMarkdown\s*\(/.test(inhalt)) {
        treffer.push(path.relative(RENDERER, voll).split(path.sep).join('/'));
      }
    }
  };
  gehe(RENDERER);
  return treffer.sort();
}

const lies = (rel) => fs.readFileSync(path.join(RENDERER, rel), 'utf8');

describe('Erzeugte Teilbäume durchlaufen den entschiedenen Schritt-Satz (4T-001130)', () => {
  it('jede Stelle mit api.renderMarkdown ist genau einer Klasse zugeordnet', () => {
    const bekannt = new Set([...VOLLANSICHT, ...TEILBAUM, ...WIDGET_EXTRAKTION]);
    const gefunden = dateienMitRenderAufruf();
    const unbekannt = gefunden.filter((f) => !bekannt.has(f));
    // Die Meldung nennt den Weg zur Auflösung, nicht nur den Befund: Eine neue
    // Stelle ist kein Fehler, eine nicht eingeordnete schon.
    expect(
      unbekannt,
      `Nicht eingeordnete Stelle(n) mit api.renderMarkdown: ${unbekannt.join(', ')}. ` +
        'Jede gehört in eine der drei Klassen dieses Wächters — Vollansicht ' +
        '(applyRenderPipeline), erzeugter Teilbaum (applyTeilbaumSchritte) oder ' +
        'Widget-Extraktion (kein Schritt-Satz, Begründung eintragen).',
    ).toEqual([]);
    // Gegenprobe gegen eine still verschwundene Datei: Jede eingetragene Stelle
    // muss es auch geben, sonst schützt die Liste einen Bestand von gestern.
    for (const eintrag of bekannt) {
      expect(
        gefunden,
        `${eintrag} steht in der Klassen-Liste, ruft aber kein api.renderMarkdown`,
      ).toContain(eintrag);
    }
  });

  it('jede Vollansicht ruft die volle Pipeline', () => {
    for (const datei of VOLLANSICHT) {
      expect(lies(datei), `${datei} ruft applyRenderPipeline nicht`).toMatch(
        /applyRenderPipeline\s*\(/,
      );
    }
  });

  it('jeder erzeugte Teilbaum ruft den Teilbaum-Schritt-Satz', () => {
    for (const datei of TEILBAUM) {
      expect(lies(datei), `${datei} ruft applyTeilbaumSchritte nicht`).toMatch(
        /applyTeilbaumSchritte\s*\(|teilbaumSchritte\s*\(/,
      );
    }
  });

  it('keine Widget-Extraktion zieht den Schritt-Satz nach (Performance-Leitplanke)', () => {
    for (const datei of WIDGET_EXTRAKTION) {
      expect(lies(datei), `${datei} zieht einen Schritt-Satz nach — Begründung prüfen`).not.toMatch(
        /applyRenderPipeline\s*\(|applyTeilbaumSchritte\s*\(/,
      );
    }
  });
});

describe('Der Schritt-Satz selbst (Entscheidung des Product Owners vom 2026-09-05)', () => {
  const quelle = () => lies('modules/render-mermaid.js');

  it('beide Einstiege laufen durch dieselbe Folge', () => {
    // Eine Kopie der Folge je Einstieg wäre der Rückfall in genau den Zustand,
    // den dieser Vorgang behebt: Ein neuer Schritt käme in die eine Liste und
    // fehlte in der anderen.
    const s = quelle();
    expect(s).toMatch(/function wendeSchritteAn\(/);
    for (const einstieg of ['applyRenderPipeline', 'applyTeilbaumSchritte']) {
      const ab = s.slice(s.indexOf(`export function ${einstieg}(`));
      const koerper = ab.slice(0, ab.indexOf('\n}\n'));
      expect(koerper, `${einstieg} ruft wendeSchritteAn nicht`).toMatch(/wendeSchritteAn\(/);
    }
  });

  it('der Teilbaum bleibt Ansicht: keine Bearbeitbarkeit', () => {
    const s = quelle();
    const ab = s.slice(s.indexOf('export function applyTeilbaumSchritte('));
    const koerper = ab.slice(0, ab.indexOf('\n}\n'));
    expect(koerper).toMatch(/bearbeitbar:\s*false/);
  });

  it('die Vollansicht behält Bearbeitbarkeit, Frontmatter-Zeile und Such-Lauf', () => {
    const s = quelle();
    const ab = s.slice(s.indexOf('export function applyRenderPipeline('));
    const koerper = ab.slice(0, ab.indexOf('\n}\n'));
    expect(koerper).toMatch(/bearbeitbar:\s*true/);
    expect(koerper).toMatch(/frontmatterZeile:\s*true/);
    expect(koerper).toMatch(/suchLauf:\s*true/);
  });

  it('die Befüllungs-Schritte gelten im Teilbaum (AK5)', () => {
    // Der Kern der zweiten Fundstelle: Eine Abfrage im eingebetteten Dokument
    // zeigte einen leeren Platzhalter, weil die Befüllung nie lief. Sie gehört
    // damit in die gemeinsame Folge und nicht hinter ein Vollansichts-Flag.
    const s = quelle();
    const ab = s.slice(s.indexOf('function wendeSchritteAn('));
    const koerper = ab.slice(0, ab.indexOf('\n}\n'));
    for (const schritt of [
      'applyFrontmatterQueriesIfPresent',
      'applyJournalNavIfPresent',
      'applyJournalTimelineIfPresent',
      'applyPerspectiveScriptsIfPresent',
      'applyBlockMetaIndicators',
      'applyMermaidIfPresent',
    ]) {
      expect(koerper, `${schritt} fehlt in der gemeinsamen Folge`).toContain(schritt);
    }
    // Und sie hängen nicht am Bearbeitbarkeits-Schalter.
    expect(koerper).toMatch(/if \(dynamischeBloecke\) applyFrontmatterQueriesIfPresent/);
  });

  it('der Teilbaum-Satz macht keine Einbettungen (Tiefen-Grenze, AK7)', () => {
    // Die Verschachtelungs-Grenze zählt der Aufrufer, weil nur er den
    // Tiefenzähler führt. Zöge der Teilbaum-Satz die Einbettungen selbst nach,
    // liefe die Rekursion an der Grenze aus AK6 der Story 4S-000207 vorbei.
    const s = quelle();
    const ab = s.slice(s.indexOf('export function applyTeilbaumSchritte('));
    const koerper = ab.slice(0, ab.indexOf('\n}\n'));
    expect(koerper).toMatch(/einbettungen:\s*false/);
    // Gegenprobe: Der Aufrufer der Einbettung zählt weiterhin hoch.
    expect(s).toMatch(/applyWikiEmbedsIfPresent\(body, result\.path, depth \+ 1\)/);
  });

  it('die Skript-Ausgabe hält ihre dokumentierte Ausnahme', () => {
    // Das Handbuch sagt zu, dass eingebettete Abfrage- und Skript-Blöcke in der
    // Ausgabe eines Skript-Blocks NICHT ausgeführt werden. Fiele das Flag weg,
    // liefe die Zusage still ins Leere.
    const s = lies('modules/query/perspective-script-view.js');
    expect(s).toMatch(/dynamischeBloecke:\s*false/);
  });
});
