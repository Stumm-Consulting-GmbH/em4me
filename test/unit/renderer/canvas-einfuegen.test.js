// @vitest-environment jsdom
// 4T-001682 (Epic 3E-000287): Prüffälle des Einfüge-Kommandos «Canvas
// einfügen» — die Form der eingefügten Fence, ihre Gegenprobe am Kern, der
// gesagte Fehlschlag ohne änderbares Dokument und die Verdrahtung über die
// beiden Zugänge Palette und Kontextmenü.
//
// **Warum die Nachbar-Module Attrappen sind.** Geprüft wird die Schablone und
// der Dispatch-Pfad, nicht CodeMirror: Eine echte EditorView zöge den halben
// Renderer nach (Muster canvas-pane.test.js). Die View ist deshalb eine
// Attrappe mit Zähler, und die Gegenprobe der eingefügten Fence läuft über
// den echten, prozessneutralen Kern.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// getDocText ist im Bestand ein Cache über einer WeakMap; für die Attrappe
// genügt die Zeichenketten-Form des Dokuments.
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: {},
  $: () => null,
  getDocText: (doc) => String(doc),
}));
vi.mock('../../../src/renderer/modules/tasks.js', () => ({
  withCreatedDate: (zeile) => zeile,
}));
// Der Statusleisten-Hinweis kommt über einen Laufzeit-Import; ohne Attrappe
// zöge er genau die Kopplung nach, die der Laufzeit-Import vermeidet.
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (schluessel) => hinweise.push(schluessel),
}));

const { FORMAT_COMMANDS } = await import('../../../src/renderer/modules/editor/editor-format.js');
const { insertCanvas } = await import('../../../src/shared/markdown-format.js');
const { findCanvasFences, parseCanvasFence } =
  await import('../../../src/shared/canvas/canvas-core.js');
const { hatCanvasFlaeche } = await import('../../../src/renderer/modules/canvas/canvas-modus.js');
const { COMMANDS } = await import('../../../src/shared/commands/commands.js');
// 4T-001697 (Epic 3E-000287): Das Verfuegbarkeits-Modell aus 1.131.1. Die
// Sperre des Kommandos ausserhalb des Editor-Kontexts wird seither an ihm
// gemessen und nicht mehr an einem Quelltext-Muster der Palette.
const { availabilityContext, isAvailable } =
  await import('../../../src/shared/commands/command-availability.js');
// 4T-001656: Registry-Seite des Kontextmenü-Gates.
const { extensionById } = await import('../../../src/shared/extensions/extensions.js');
const { disabledCommandIdSet } = await import('../../../src/shared/extensions/extensions-core.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const hinweisAbwarten = () => new Promise((fertig) => setTimeout(fertig, 0));

// Wendet die Änderungen einer Transaktion an, wie CodeMirror es täte.
function anwenden(text, changes) {
  let ergebnis = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    ergebnis = ergebnis.slice(0, c.from) + c.insert + ergebnis.slice(c.to);
  }
  return ergebnis;
}

// Attrappe der EditorView: nur das, was der Einfüge-Pfad anfasst.
function attrappeView({ text = '', pos = text.length, readOnly = false } = {}) {
  const transaktionen = [];
  return {
    transaktionen,
    state: {
      readOnly,
      doc: { toString: () => text },
      selection: { main: { head: pos, from: pos, to: pos } },
    },
    dispatch: (tr) => transaktionen.push(tr),
    focus: () => {},
  };
}

function fuegeEin(text, pos) {
  const view = attrappeView({ text, pos });
  const ok = FORMAT_COMMANDS['insert.canvas'](view);
  return { ok, view, ergebnis: anwenden(text, view.transaktionen[0].changes) };
}

describe('Canvas einfügen: die Fence an der Schreibmarke (4T-001682, AK1)', () => {
  it('setzt die Fläche an die Schreibmarke und lässt den übrigen Text stehen', () => {
    const { ok, ergebnis } = fuegeEin('Vorher\n\nNachher', 6);
    expect(ok).toBe(true);
    expect(ergebnis).toBe('Vorher\n\n```perspective-canvas\n\n```\n\nNachher');
  });

  it('steht auf eigener Zeile, mit Leerzeile davor und danach', () => {
    // Mitten in einer Zeile ausgelöst: Die Fence darf nicht an den Satz
    // angehängt werden, sonst liest der Renderer sie als Fließtext.
    // Am Dokument-Ende entfällt der nachlaufende Puffer: Das Ende zählt wie
    // eine Leerzeile (Regel `blockPadding` des geteilten Kerns).
    const { ergebnis } = fuegeEin('Text', 4);
    expect(ergebnis).toBe('Text\n\n```perspective-canvas\n\n```');
    const zeilen = ergebnis.split('\n');
    expect(zeilen[1]).toBe('');
    expect(zeilen[2]).toBe('```perspective-canvas');
  });

  it('im leeren Dokument kommt sie ohne führende Leerzeilen', () => {
    const { ergebnis } = fuegeEin('', 0);
    expect(ergebnis).toBe('```perspective-canvas\n\n```');
  });

  it('die Schreibmarke steht in der Fläche, nicht dahinter', () => {
    // Wer eine Fläche einfügt, arbeitet als Nächstes in ihr.
    const view = attrappeView({ text: '', pos: 0 });
    FORMAT_COMMANDS['insert.canvas'](view);
    const tr = view.transaktionen[0];
    expect(tr.selection.anchor).toBe('```perspective-canvas\n'.length);
    expect(tr.selection.head).toBe(tr.selection.anchor);
  });
});

describe('Canvas einfügen: die Fence wird vom Kern gelesen (4T-001682, AK3)', () => {
  it('der Kern findet genau eine Fläche, leer und ohne Befund', () => {
    const { ergebnis } = fuegeEin('# Titel\n', 8);
    const treffer = findCanvasFences(ergebnis);
    expect(treffer).toHaveLength(1);
    const modell = parseCanvasFence(treffer[0].rumpf);
    expect(modell.elemente).toEqual([]);
    expect(modell.errors).toEqual([]);
  });

  it('die Zaun-Länge stammt aus dem Kern und steht nicht im Renderer', () => {
    // Der Renderer darf die drei Rückstriche nicht fest setzen: Der
    // Karten-Inhalt einer Fläche ist beliebiges Markdown und trägt selbst
    // Code-Blöcke. Belegt wird das an der Quelle — die leere Fläche allein
    // käme auch mit einem festen Zaun aus.
    const quelle = lies('src/shared/markdown-format.js');
    expect(quelle).toContain("require('./canvas/canvas-core.js')");
    expect(quelle).toMatch(/insertBlock\(text, pos, block, block\.indexOf\('\\n'\) \+ 1\)/);
    expect(lies('src/renderer/modules/editor/editor-format.js')).not.toContain(
      'perspective-canvas',
    );
  });
});

describe('Canvas einfügen: das Dokument gilt danach als Canvas (4T-001682, AK2)', () => {
  it('die Verfügbarkeits-Frage bejaht den neuen Text', () => {
    // AK2 braucht keinen eigenen Mechanismus: Die Ansicht ist nach E2 genau
    // dann wählbar, wenn das Dokument eine Fence trägt, und `hatCanvasFlaeche`
    // ist die eine Stelle, die alle Aufrufer dazu befragen.
    const text = 'Noch keine Fläche';
    expect(hatCanvasFlaeche(text)).toBe(false);
    const { ergebnis } = fuegeEin(text, text.length);
    expect(hatCanvasFlaeche(ergebnis)).toBe(true);
  });

  it('der Wechsel der Verfügbarkeit wird nach jeder Dokument-Änderung gemeldet', () => {
    // Die Einfügung ist eine gewöhnliche Dokument-Änderung, und die Kette
    // dafür steht seit 4T-001653: Der updateListener des Editors schreibt den
    // neuen Text nach `tab.content` und ruft `scheduleCanvasRender`; die
    // Einbettung prüft dort die Verfügbarkeit neu und meldet den Wechsel an
    // die Menü-Brücke. Dieses Kommando braucht deshalb keine eigene Meldung —
    // belegt an der Kette, weil sie sonst still reißen könnte.
    const editor = lies('src/renderer/modules/editor/editor.js');
    expect(editor).toContain('tab.content = getDocText(update.state.doc);');
    expect(editor).toContain('scheduleCanvasRender(pIdx);');
    const pane = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(pane).toMatch(/scheduleCanvasRender[\s\S]{0,400}?pruefeVerfuegbarkeit\(paneIdx\);/);
    expect(pane).toMatch(
      /function pruefeVerfuegbarkeit[\s\S]{0,400}?istCanvasModusVerfuegbar\(tab\)/,
    );
  });
});

describe('Canvas einfügen: ohne änderbares Dokument (4T-001682, AK4)', () => {
  it('schreibt im schreibgeschützten Editor nicht und sagt es', async () => {
    hinweise.length = 0;
    const view = attrappeView({ text: 'Text', pos: 4, readOnly: true });
    expect(FORMAT_COMMANDS['insert.canvas'](view)).toBe(false);
    expect(view.transaktionen).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.keinEditor');
  });

  it('ohne Editor bleibt es folgenlos und sagt es ebenfalls', async () => {
    hinweise.length = 0;
    expect(FORMAT_COMMANDS['insert.canvas'](null)).toBe(false);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.keinEditor');
  });

  it('in der Lese-Ansicht kommt das Kommando gar nicht erst zur Ausführung', () => {
    // Zwei Sperren greifen vor der Funktion, beide aus dem Bestand: Ein
    // Dokument ohne Änderungsmodus trägt einen schreibgeschützten Editor, und
    // die Palette gibt ein Kommando nicht frei, dessen Verfügbarkeits-Bedingung
    // im aktuellen Kontext nicht zutrifft (gedimmter Eintrag).
    expect(lies('src/renderer/modules/editor/editor.js')).toContain(
      'EditorState.readOnly.of(!tab.editMode)',
    );

    // 4T-001697: Die zweite Sperre wird am Modell gemessen statt am Quelltext.
    // Das Quelltext-Muster von 4T-001682 hat die Umstellung der Palette auf das
    // gemeinsame Verfügbarkeits-Modell (1.131.1, Epic 3E-000295) nicht
    // überlebt; die ZUSAGE ist dieselbe geblieben und wird hier gegenständlich
    // belegt.
    const cmd = COMMANDS.find((c) => c.id === 'insert.canvas');
    expect(cmd.availability, 'insert.canvas trägt die Editor-Bedingung').toBe('editor');

    const dokument = {
      hasTab: true,
      manualTab: false,
      systemTab: false,
      hasArea: true,
      hasBook: false,
      hasShelf: false,
      hasWorkspace: false,
      canvasTab: false,
      inTable: false,
      hasCalendarConfig: false,
    };
    const leseAnsicht = availabilityContext({
      ...dokument,
      viewMode: 'rendered',
      editMode: false,
    });
    expect(isAvailable(cmd.availability, leseAnsicht), 'Lese-Ansicht: gesperrt').toBe(false);

    // Nicht-Vakuität: Ohne diese Gegenprobe wäre der Satz oben auch dann grün,
    // wenn das Kommando in JEDER Lage gesperrt wäre.
    const bearbeitung = availabilityContext({
      ...dokument,
      viewMode: 'source',
      editMode: true,
    });
    expect(isAvailable(cmd.availability, bearbeitung), 'Quelltext im Edit-Modus: frei').toBe(true);
  });
});

describe('Canvas einfügen: eine Transaktion (4T-001682, AK5)', () => {
  it('setzt die Fläche in genau einem Schritt und kennzeichnet ihn als Eingabe', () => {
    // Ein Rückgängig nimmt die Fläche damit ganz zurück, und die
    // Änderungs-Kennzeichnung des Dokuments greift wie bei jeder Eingabe.
    const view = attrappeView({ text: 'Text', pos: 4 });
    FORMAT_COMMANDS['insert.canvas'](view);
    expect(view.transaktionen).toHaveLength(1);
    const tr = view.transaktionen[0];
    expect(tr.userEvent).toBe('input');
    expect(tr.changes).toHaveLength(1);
    expect(tr.scrollIntoView).toBe(true);
  });
});

describe('Canvas einfügen: Verdrahtung über beide Zugänge (4T-001682)', () => {
  // Dieselbe Sorgfalt wie bei Modus und Karten-Kommando (4T-001653,
  // 4T-001654): Ein Kommando, das nicht durchgängig verdrahtet ist, fällt
  // sonst erst im Struktur-Prüfschritt auf.
  const cmd = COMMANDS.find((c) => c.id === 'insert.canvas');

  it('steht in der Registry, ohne Vorgabe-Kürzel und ohne Menü-Eintrag', () => {
    expect(cmd).toBeDefined();
    expect(cmd.labelKey).toBe('command.insert.canvas');
    expect(cmd.descKey).toBe('help.feature.canvas');
    expect(cmd.categoryKey).toBe('help.group.editing');
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(false);
    expect(cmd.editorScoped).toBe(true);
  });

  it('ist als Editor-Kommando hinterlegt und hat keinen zweiten Pfad', () => {
    // editorScoped-Kommandos laufen über EDITOR_COMMAND_FUNCTIONS, das
    // FORMAT_COMMANDS einspeist; ein Eintrag im Dispatcher wäre ein zweiter
    // Ausführungs-Pfad und damit eine Divergenz-Quelle.
    expect(typeof FORMAT_COMMANDS['insert.canvas']).toBe('function');
    expect(lies('src/renderer/modules/editor/editor-keymaps.js')).toContain('...FORMAT_COMMANDS');
    expect(lies('src/renderer/modules/app/app-commands.js')).not.toContain("'insert.canvas'");
  });

  it('steht im Einfügen-Untermenü des Editor-Kontextmenüs', () => {
    expect(lies('src/renderer/modules/editor/editor-context-menu.js')).toContain(
      "ins('canvas', 'insert-canvas')",
    );
  });

  // 4T-001656 (Epic 3E-000287): erweiterungs-gebunden wie das Gerüst der
  // Perspective-Tabelle daneben. Ist `canvas` abgeschaltet, gibt es nichts
  // einzufügen, und der Eintrag verschwindet aus dem Kontextmenü — die übrigen
  // Zugänge (Palette, Tastenkürzel-Seite) filtert dieselbe Kommando-Menge.
  it('AK5: der Kontextmenü-Eintrag hängt am Schalter der Canvas-Erweiterung', () => {
    const quelle = lies('src/renderer/modules/editor/editor-context-menu.js');
    expect(quelle).toContain("if (!aus.has('insert.canvas')) submenu.push(ins('canvas'");
    // Die Herkunft der Menge: die commands-Liste des Registry-Eintrags.
    expect(extensionById('canvas').commands).toContain('insert.canvas');
    expect(disabledCommandIdSet(['canvas']).has('insert.canvas')).toBe(true);
    expect(disabledCommandIdSet([]).has('insert.canvas')).toBe(false);
  });

  it('die Texte des Kommandos stehen in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const woerter = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of ['command.insert.canvas', 'canvas.keinEditor', 'help.feature.canvas']) {
        expect(woerter[key], `${sprache}.json fehlt ${key}`).toBeTruthy();
      }
    }
  });

  it('die reine Schablone ist ohne den Renderer aufrufbar', () => {
    // Sie liegt bei den übrigen Einfüge-Schablonen im geteilten Kern und ist
    // damit auch außerhalb des Editors prüfbar.
    const r = insertCanvas('', 0);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].insert).toBe('```perspective-canvas\n\n```');
  });
});
