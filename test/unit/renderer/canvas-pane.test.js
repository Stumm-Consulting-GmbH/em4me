// @vitest-environment jsdom
// 4T-001653 (Epic 3E-000287): Prüffälle der Canvas-Einbettung — die Auswahl
// der Fence aus dem Dokument-Text samt Rangfolge der Hinweise, dazu die
// Verdrahtung des sechsten Ansichts-Modus über alle drei Zugänge.
//
// Die Nachbar-Module sind gemockt, weil die Pane-Einbettung sonst den halben
// Renderer-Zustand hochzöge (Muster mindmap-pane.test.js); geprüft wird die
// Ableitung des Zustands, nicht das Zeichnen — das deckt canvas-view.test.js.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 4T-001697 (Epic 3E-000287): Registry und Verfuegbarkeits-Modell fuer die
// gegenstaendliche Probe der beiden Canvas-Bedingungen. Beide Module sind
// prozessneutral und ziehen nichts vom Renderer nach.
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';

// Nur die beiden echten Importe des Moduls; den Fenster-Zustand bekommt es
// über initCanvasPane hereingereicht und importiert ihn bewusst nicht (siehe
// Modul-Kopf von canvas-pane.js).
vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: { renderMarkdown: (text) => text },
  $: () => null,
}));
// 4T-001654: Der Statusleisten-Hinweis kommt über einen Laufzeit-Import; ohne
// Attrappe zöge er den halben Renderer nach (und wäre genau die Kopplung, die
// der Laufzeit-Import vermeidet).
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (schluessel) => hinweise.push(schluessel),
}));
// 4T-001656: Der Schalt-Zustand der Erweiterung. Attrappe statt echtem
// Lebenszyklus, weil dieser den Store und die Preload-Brücke bräuchte; Vorbild
// mindmap-pane.test.js. Voreinstellung «an», damit die Fälle aus 4T-001653 und
// 4T-001654 unverändert die Dokument-Abhängigkeit messen und nicht den
// Schalter.
const istAktiv = vi.fn(() => true);
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: (id) => istAktiv(id),
}));

const {
  canvasZustandAus,
  destroyCanvas,
  initCanvasPane,
  // 4T-001701 (Epic 3E-000288): die beiden neuen Eintritte der Flächen-Kommandos.
  legeCanvasFormAn,
  // 4T-001702 (Epic 3E-000288): der Eintritt des Gruppen-Kommandos.
  legeCanvasGruppeAn,
  legeCanvasKarteAn,
  renderCanvas,
  verschiebeCanvasElement,
} = await import('../../../src/renderer/modules/canvas/canvas-pane.js');
const {
  CANVAS_EXTENSION_ID,
  hatCanvasFlaeche,
  istCanvasErweiterungAn,
  istCanvasModusVerfuegbar,
  resolveCanvasViewMode,
} = await import('../../../src/renderer/modules/canvas/canvas-modus.js');
const { VIEW_MODES, VIEW_MODE_CLASSES } =
  await import('../../../src/renderer/modules/views/view-modes.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');

const FENCE = (rumpf) => '```perspective-canvas\n' + rumpf + '\n```';
const EINE_KARTE = '!karte k1 x=0 y=0 b=200 h=100\nText';

// 4T-001697 (Epic 3E-000287): Gegenstaendliche Probe einer Verfuegbarkeits-
// Bedingung. Sie loest die beiden Quelltext-Muster ab, mit denen dieser
// Prueffall die Menue-Regeln bis 1.131.1 belegt hat: Ein Muster bricht, sobald
// jemand den Ausdruck verschiebt, und es sagt nichts darueber, was er
// ENTSCHEIDET. Die Probe traegt deshalb je Fall auch eine Gegenrichtung; ohne
// sie waere sie auch bei einer stets falschen Bedingung gruen.
function pruefeBedingung(kommandoId, sollBedingung, faelle) {
  const cmd = COMMANDS.find((c) => c.id === kommandoId);
  expect(cmd, `Kommando ${kommandoId} nicht in der Registry`).toBeTruthy();
  expect(cmd.availability, `${kommandoId} traegt die erwartete Bedingung`).toBe(sollBedingung);
  for (const [roh, soll] of faelle) {
    const ctx = availabilityContext({ hasTab: true, ...roh });
    expect(isAvailable(cmd.availability, ctx), `${kommandoId} bei ${JSON.stringify(roh)}`).toBe(
      soll,
    );
  }
}

describe('Canvas-Einbettung: Zustand aus dem Dokument (4T-001653)', () => {
  it('ohne Fence gibt es keine Fläche, aber einen Hinweis', () => {
    const zustand = canvasZustandAus('# Nur ein Dokument\n\nOhne Fläche.');
    expect(zustand.flaechen).toEqual([]);
    expect(zustand.hinweis).toBe('canvas.keineFence');
  });

  it('liest die Fence in ein Modell und meldet nichts, wenn alles trägt', () => {
    const zustand = canvasZustandAus(`# Titel\n\n${FENCE(EINE_KARTE)}\n`);
    expect(zustand.flaechen).toHaveLength(1);
    expect(zustand.flaechen[0].model.elemente).toHaveLength(1);
    expect(zustand.hinweis).toBeNull();
  });

  it('eine Fence ohne Karten meldet die leere Fläche', () => {
    expect(canvasZustandAus(FENCE('')).hinweis).toBe('canvas.leer');
  });

  it('Befunde des Kerns werden mit ihrer Anzahl gemeldet', () => {
    const zustand = canvasZustandAus(FENCE('!karte k1 x=0 y=0 b=nichts h=100\nText'));
    expect(zustand.hinweis).toBe('canvas.befunde');
    expect(zustand.hinweisWerte.count).toBeGreaterThan(0);
  });

  it('mehrere Flächen kommen als Liste, in der Reihenfolge des Dokuments', () => {
    // 4T-001677: Früher wurde allein die erste gelesen und ihre Zahl in einem
    // Hinweis genannt. Seit der Anordnung des Product Owners vom 2026-09-09
    // liefert die Einbettung alle, und die Ansicht macht Reiter daraus.
    const text = `${FENCE(EINE_KARTE)}\n\nDazwischen\n\n${FENCE('!karte k2 x=9 y=9 b=1 h=1\nB')}`;
    const zustand = canvasZustandAus(text);
    expect(zustand.flaechen).toHaveLength(2);
    expect(zustand.flaechen[0].model.elemente[0].id).toBe('k1');
    expect(zustand.flaechen[1].model.elemente[0].id).toBe('k2');
    expect(zustand.hinweis).toBeNull();
  });

  it('jede Fläche trägt Titel, Stelle im Dokument und Nummer', () => {
    const text = `${FENCE('!karte k1 x=0 y=0 b=1 h=1\n# Erste')}\n\n${FENCE('!karte k2 x=0 y=0 b=1 h=1\nZweite')}`;
    const zustand = canvasZustandAus(text);
    expect(zustand.flaechen[0]).toMatchObject({ titel: 'Erste', nummer: 1 });
    expect(zustand.flaechen[1]).toMatchObject({ titel: 'Zweite', nummer: 2 });
    // Die Stelle unterscheidet zwei Flächen mit gleichem Titel und überlebt
    // eine Änderung an der jeweils anderen.
    expect(zustand.flaechen[1].startZeile).toBeGreaterThan(zustand.flaechen[0].startZeile);
  });

  it('der Hinweis bezieht sich auf die gezeigte Fläche, nicht auf ihre Zahl', () => {
    const text = `${FENCE('!karte k1 x=0 y=0 b=nichts h=1\nA')}\n\n${FENCE(EINE_KARTE)}`;
    expect(canvasZustandAus(text).hinweis).toBe('canvas.befunde');
  });

  it('verträgt einen fehlenden Dokument-Text', () => {
    expect(canvasZustandAus(null).hinweis).toBe('canvas.keineFence');
    expect(canvasZustandAus(undefined).flaechen).toEqual([]);
  });

  it('jede Fläche führt den Rumpf mit, auf dem sie beruht (4T-001654)', () => {
    // Er ist der Maßstab des Abgleichs vor jeder Übernahme: Ohne ihn ließe sich
    // nicht feststellen, ob das Dokument sich zwischenzeitlich geändert hat.
    const zustand = canvasZustandAus(FENCE(EINE_KARTE));
    expect(zustand.flaechen[0].rumpf).toBe(EINE_KARTE);
  });
});

describe('Canvas-Einbettung: Schreibweg in das Dokument (4T-001654)', () => {
  // **Warum die Einbettung und nicht die Ansicht.** Die Ansicht liefert einen
  // neu serialisierten Rumpf; erst hier entscheidet sich, ob und wohin er in
  // das Dokument geht. Geprüft wird genau diese Entscheidung — das Zeichnen
  // deckt canvas-bedienung.test.js.
  const TEXT = ['# Titel', '```perspective-canvas', EINE_KARTE, '```'].join('\n');

  // Der Hinweis kommt über einen Laufzeit-Import und damit erst im nächsten
  // Mikro-Zyklus; das Verwerfen selbst ist da längst geschehen.
  const hinweisAbwarten = () => new Promise((fertig) => setTimeout(fertig, 0));

  function baueSpalte(paneIdx, tab) {
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const geschrieben = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      schreibeDokument: (idx, daten) => {
        geschrieben.push({ idx, ...daten });
        return true;
      },
    });
    renderCanvas(paneIdx);
    return { canvasEl, geschrieben };
  }

  it('schreibt den Rumpf über den Zugang, in die Zeilen der gefundenen Fence', () => {
    // `EINE_KARTE` ist eine Zeile Marker plus eine Zeile Text: Zeile 3 und 4
    // des Dokuments, zwischen den beiden Zaun-Zeilen 2 und 5.
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(0, tab);
    expect(legeCanvasKarteAn(0)).toBe(true);
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({ idx: 0, vonZeile: 3, bisZeile: 4 });
    expect(geschrieben[0].text.split('\n')).toHaveLength(3);
    expect(geschrieben[0].text.startsWith(EINE_KARTE)).toBe(true);
    destroyCanvas(0);
  });

  it('verwirft die Übernahme, wenn der vorgefundene Rumpf abweicht', async () => {
    // Die Vorsichtsregel des Vorbilds (perspective-datatable-editor.js), hier
    // schwerer wiegend: In der Fence liegt der ganze Anwender-Text der Fläche.
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(1, tab);
    tab.content = TEXT.replace('Text', 'Von anderer Stelle geändert');
    expect(legeCanvasKarteAn(1)).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.verworfen');
    destroyCanvas(1);
  });

  it('verwirft die Übernahme, wenn die Fence ganz verschwunden ist', async () => {
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(2, tab);
    tab.content = '# Nur noch Text';
    expect(legeCanvasKarteAn(2)).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.verworfen');
    destroyCanvas(2);
  });

  it('das Kommando bleibt außerhalb der Canvas-Ansicht wirkungslos und sagt es', async () => {
    // Ein stiller Fehlschlag wäre für den Nutzer nicht von einem Fehler zu
    // unterscheiden (Guard-Muster insertEventsBlock).
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(3, tab);
    tab.viewMode = 'source';
    expect(legeCanvasKarteAn(3)).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.keineAnsicht');
    destroyCanvas(3);
  });

  it('im Anzeige-Modus legt das Kommando nichts an und sagt es', async () => {
    // Befund 1 des Product Owners vom 2026-09-10: Eine Handlung, die am Ende
    // verworfen wird, darf gar nicht erst angeboten werden — und wo sie doch
    // versucht wird, ist der stille Fehlschlag für den Nutzer nicht von einem
    // Fehler zu unterscheiden (Guard-Muster insertEventsBlock).
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const geschrieben = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      istAenderbar: () => false,
      schreibeDokument: (idx, daten) => {
        geschrieben.push({ idx, ...daten });
        return true;
      },
    });
    renderCanvas(5);
    expect(legeCanvasKarteAn(5)).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.nichtAenderbar');
    destroyCanvas(5);
  });

  it('ohne den Änderbarkeits-Zugang verhält sich die Einbettung wie zuvor', () => {
    // Die Ausnahme von der Fail-closed-Regel: Der Schreibweg ist über
    // `schreibeDokument` eigens gesichert; diese Frage entscheidet allein, ob
    // eine Handlung ANGEBOTEN wird. Eine Einbettung, die den Anzeige-Modus
    // nicht kennt, verlöre sonst still ihre ganze Bedienung.
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const geschrieben = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      schreibeDokument: (idx, daten) => {
        geschrieben.push({ idx, ...daten });
        return true;
      },
    });
    renderCanvas(6);
    expect(legeCanvasKarteAn(6)).toBe(true);
    expect(geschrieben).toHaveLength(1);
    destroyCanvas(6);
  });

  it('ohne Schreib-Zugang bleibt die Fläche eine Anzeige', () => {
    // Fail-closed: Wer den Rückweg nicht liefert, bekommt keinen halben.
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    initCanvasPane({ getPaneEls: () => ({ canvasEl }), aktivesDokument: () => tab });
    renderCanvas(4);
    expect(legeCanvasKarteAn(4)).toBe(false);
    expect(tab.content).toBe(TEXT);
    destroyCanvas(4);
  });
});

describe('Canvas-Einbettung: Rückgängig über den Zugang (4T-001654)', () => {
  // **Anlass.** Befund des Product Owners vom 2026-09-10 an der gebauten
  // Programmdatei: «Strg-Z funktioniert nicht». Geprüft wird hier die Kette
  // vom Tastendruck auf der Fläche bis an den injizierten Zugang; dass dieser
  // die Historie des Editors trifft, prüft editor-historie.test.js.
  const TEXT = ['# Titel', '```perspective-canvas', EINE_KARTE, '```'].join('\n');

  function baueSpalte(paneIdx, extra = {}) {
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const rufe = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      rueckgaengig: (idx) => {
        rufe.push(['zurueck', idx]);
        return true;
      },
      wiederholen: (idx) => {
        rufe.push(['vor', idx]);
        return true;
      },
      ...extra,
    });
    renderCanvas(paneIdx);
    return { canvasEl, rufe };
  }

  const taste = (el, key, opts) =>
    el.dispatchEvent(
      new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...opts }),
    );

  it('Strg+Z auf der Fläche erreicht den Zugang mit der Spalten-Nummer', () => {
    const { canvasEl, rufe } = baueSpalte(5);
    taste(canvasEl.querySelector('.canvas-view'), 'z', { ctrlKey: true });
    expect(rufe).toEqual([['zurueck', 5]]);
    destroyCanvas(5);
  });

  it('Strg+Y erreicht den Wiederholen-Weg derselben Spalte', () => {
    const { canvasEl, rufe } = baueSpalte(6);
    taste(canvasEl.querySelector('.canvas-view'), 'y', { ctrlKey: true });
    expect(rufe).toEqual([['vor', 6]]);
    destroyCanvas(6);
  });

  it('ohne Historie-Zugang bleibt die Taste folgenlos', () => {
    // Fail-closed wie beim Schreibweg: Wer den Weg nicht liefert, bekommt
    // keinen halben.
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    initCanvasPane({ getPaneEls: () => ({ canvasEl }), aktivesDokument: () => tab });
    renderCanvas(7);
    expect(() =>
      taste(canvasEl.querySelector('.canvas-view'), 'z', { ctrlKey: true }),
    ).not.toThrow();
    destroyCanvas(7);
  });

  it('die Historie kommt aus dem Editor und wird hereingereicht', () => {
    // Ein Import von editor.js in den Canvas-Ordner bildete den bekannten
    // Zyklus; der Zugang steht deshalb in app-init.js.
    const quelle = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(quelle).toContain("rufeZugang('rueckgaengig'");
    const init = lies('src/renderer/modules/app-init.js');
    expect(init).toContain('rueckgaengigInSpalte(paneEditors[paneIdx])');
    expect(init).toContain('wiederholenInSpalte(paneEditors[paneIdx])');
    expect(lies('src/renderer/modules/editor/editor-historie.js')).toContain(
      "from '@codemirror/commands'",
    );
  });

  it('der Eintritt in die Ansicht holt den Fokus auf die Fläche', () => {
    // Ohne Fokus-Träger erreichte kein Tastendruck die Fläche — der Editor ist
    // dort per CSS versteckt und gibt ihn an den Dokument-Rumpf ab.
    const quelle = lies('src/renderer/modules/views/views.js');
    expect(quelle).toContain('fokussiereCanvas(state.activePaneIndex)');
    expect(lies('src/renderer/modules/canvas/canvas-pane.js')).toContain(
      'export function fokussiereCanvas',
    );
  });
});

describe('Canvas: Kommando „Karte anlegen" über alle Zugänge (4T-001654)', () => {
  // Dieselbe Sorgfalt wie beim Modus selbst (4T-001653): Ein Kommando, das in
  // Registry, Menü, Brücke und Dispatcher nicht durchgängig verdrahtet ist,
  // fällt sonst erst im Struktur-Prüfschritt auf.
  it('das Kommando steht in der Registry, ohne Vorgabe-Kürzel', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'canvas\.addCard',[\s\S]{0,400}?\},/.exec(quelle);
    expect(block, 'Kommando canvas.addCard fehlt').not.toBeNull();
    expect(block[0]).toContain('defaultBindings: [],');
    expect(block[0]).toContain("labelKey: 'command.canvas.addCard'");
    expect(block[0]).toContain('menu: true');
  });

  it('der Dispatcher ruft die Einbettung, nicht die Ansicht', () => {
    const quelle = lies('src/renderer/modules/app/app-commands.js');
    expect(quelle).toContain("'canvas.addCard'");
    expect(quelle).toContain('legeCanvasKarteAn(state.activePaneIndex)');
  });

  it('der Menü-Eintrag hängt an Ansicht und Fläche zugleich', () => {
    // Anders als der Modus-Eintrag genügt die Fläche allein nicht: Die Karte
    // entsteht in der gezeigten Fläche, und die gibt es nur in dieser Ansicht.
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("send('menu:canvasAddCard')");
    expect(menu).toContain("acc('canvas.addCard')");
    // 4T-001697: Die Bedingung steht seit dem Verfuegbarkeits-Modell aus
    // 1.131.1 nicht mehr als Ausdruck am Menue-Eintrag, sondern als benannte
    // Bedingung im Katalog. Gemessen wird sie deshalb dort, und der
    // Menue-Eintrag wird darauf geprueft, dass er sie AUSWERTET statt eine
    // eigene zu fuehren.
    expect(menu).toContain("enabled: avail('canvas.addCard')");
    pruefeBedingung('canvas.addCard', 'canvasKarte', [
      [{ canvasTab: true, viewMode: 'canvas' }, true],
      [{ canvasTab: true, viewMode: 'rendered' }, false],
      [{ canvasTab: false, viewMode: 'canvas' }, false],
      [{ canvasTab: true, viewMode: 'canvas', systemTab: true }, false],
    ]);
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:canvasAddCard'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuCanvasAddCard(',
    );
  });

  it('der Schreibweg wird hereingereicht und nicht importiert', () => {
    // Ein Import von editor.js bildete den Zyklus editor -> canvas-pane ->
    // editor; die EditorView kommt deshalb aus app-init.js.
    const quelle = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(quelle).not.toMatch(/from '\.\.\/editor\/editor\.js'/);
    expect(quelle).toContain('umgebung.schreibeDokument');
    const init = lies('src/renderer/modules/app-init.js');
    expect(init).toContain('schreibeDokument:');
    expect(init).toMatch(/userEvent: 'input'/);
  });

  it('die Bedienung bleibt frei von Renderer-Zustand', () => {
    // Injektions-Bauweise E4: Die Bedien-Logik kennt weder api noch i18n noch
    // app-state — nur den prozessneutralen Kern, die Geometrie und ihre
    // Nachbarn im Canvas-Ordner. 4T-001655: Der Nachbar kam hinzu, weil die
    // Frage «was ist Hintergrund der Fläche» seit den anfassbaren Verbindungen
    // an drei Stellen dieselbe Antwort braucht; der Ordner-Import-Wächter hält
    // den Canvas-Ordner weiterhin außerhalb des Renderer-Zyklus.
    const quelle = lies('src/renderer/modules/canvas/canvas-bedienung.js');
    const bezuege = [...quelle.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(bezuege.length).toBeGreaterThan(0);
    for (const bezug of bezuege) {
      expect(bezug, `unerlaubter Import ${bezug}`).toMatch(
        /^(?:\.\.\/\.\.\/\.\.\/shared\/canvas\/|\.\/canvas-)/,
      );
    }
  });

  it('die Texte des Kommandos stehen im Katalog', () => {
    const de = JSON.parse(lies('src/i18n/de.json'));
    for (const key of ['command.canvas.addCard', 'canvas.verworfen', 'canvas.keineAnsicht']) {
      expect(de[key], `Schlüssel ${key} fehlt`).toBeTruthy();
    }
  });
});

describe('Canvas-Modus: Verdrahtung über alle Zugänge (4T-001653, AK1)', () => {
  // **Anlass der Prüfung.** Der Mindmap-Modus kam in 4T-001047 in Menü und
  // Palette an, nicht aber in die Statusleiste; der Befund fiel erst beim
  // Struktur-Prüfschritt auf. Dieselbe Lücke soll dem sechsten Modus nicht
  // noch einmal passieren, deshalb ist jeder Zugang hier einzeln benannt.
  it('der Modus ist in der einen Modus-Liste geführt', () => {
    expect(VIEW_MODES).toContain('canvas');
    expect(VIEW_MODE_CLASSES).toContain('view-canvas');
  });

  it('das Dokument-Gerüst trägt in jeder Spalte einen Container', () => {
    const html = lies('src/renderer/index.html');
    expect([...html.matchAll(/class="pane pane-canvas"/g)]).toHaveLength(2);
    expect(html).toContain('data-view="canvas"');
  });

  it('das Stilblatt schaltet den Container über die Modus-Klasse sichtbar', () => {
    const css = lies('src/renderer/styles/canvas.css');
    expect(css).toMatch(/\.content\.view-canvas \.pane-canvas \{/);
    expect(lies('src/renderer/index.html')).toContain('styles/canvas.css');
  });

  it('das Kommando steht in der Registry mit eigenem Kürzel', () => {
    const quelle = lies('src/shared/commands/commands.js');
    const block = /id: 'view\.modeCanvas',[\s\S]{0,400}?\},/.exec(quelle);
    expect(block, 'Kommando view.modeCanvas fehlt').not.toBeNull();
    expect(block[0]).toContain("'CmdOrCtrl+6'");
    expect(block[0]).toContain("labelKey: 'menu.view.canvas'");
  });

  it('das Kürzel ist nicht doppelt belegt', () => {
    const quelle = lies('src/shared/commands/commands.js');
    expect([...quelle.matchAll(/'CmdOrCtrl\+6'/g)]).toHaveLength(1);
  });

  it('die Einbettung importiert den Fenster-Zustand nicht, sondern bekommt ihn', () => {
    // Gemessen am 2026-09-09: Ein direkter Import von app-state.js zieht den
    // Canvas-Ordner in den grossen Datei-Zyklus des Renderers, den der
    // Ordner-Import-Wächter als Ratsche eingefroren hat. Derselbe Grund trägt
    // die späte Bindung des Teilbaum-Schritt-Satzes.
    const quelle = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(quelle).not.toMatch(/from '\.\.\/app\/app-state\.js'/);
    expect(quelle).not.toMatch(/from '\.\.\/render-mermaid\.js'/);
    expect(quelle).toContain('export function initCanvasPane');
    expect(lies('src/renderer/modules/app-init.js')).toContain('initCanvasPane({');
    expect(lies('src/renderer/modules/render-mermaid.js')).toContain(
      'registriereCanvasTeilbaumSchritte(applyTeilbaumSchritte)',
    );
  });

  it('Menü, Statusleiste und Dispatcher führen denselben Modus', () => {
    expect(lies('src/main/menu/menu.js')).toContain("send('menu:viewChange', 'canvas')");
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain("setViewMode('canvas')");
    expect(lies('src/renderer/modules/views/views.js')).toContain("mode === 'canvas'");
  });

  it('die Ansicht steht im Funktions-Katalog und in seiner Gruppen-Tabelle', () => {
    const de = JSON.parse(lies('src/i18n/de.json'));
    for (const key of ['menu.view.canvas', 'help.feature.canvas', 'help.featureName.canvas']) {
      expect(de[key], `Schlüssel ${key} fehlt`).toBeTruthy();
    }
    expect(lies('src/shared/manual/manual-feature-groups.js')).toContain("'help.feature.canvas'");
  });
});

describe('Canvas-Modus: nur bei vorhandener Fläche auswählbar (4T-001653)', () => {
  // **Anordnung des Product Owners vom 2026-09-09.** Anders als die übrigen
  // fünf Modi ist die Canvas-Ansicht dokument-abhängig: Sie zeigt ohne Fläche
  // nichts als einen Hinweis, und ein Zugang, der zuverlässig ins Leere führt,
  // ist keiner.
  const MIT = `Titel\n\n${FENCE(EINE_KARTE)}\n`;
  const OHNE = '# Nur ein Dokument\n\nOhne Fläche.';

  it('erkennt die Fläche am Dokument-Text', () => {
    expect(hatCanvasFlaeche(MIT)).toBe(true);
    expect(hatCanvasFlaeche(OHNE)).toBe(false);
    expect(hatCanvasFlaeche(null)).toBe(false);
  });

  it('eine Fence anderer Sprache zählt nicht', () => {
    expect(hatCanvasFlaeche('```perspective-events\n2026-01-01 Etwas\n```')).toBe(false);
    // Auch die blosse Erwähnung des Namens im Fliesstext ist keine Fläche —
    // der Vorfilter des Kerns darf nicht zum Fehlurteil führen.
    expect(hatCanvasFlaeche('Die Fence heisst `perspective-canvas`.')).toBe(false);
  });

  it('der Modus ist für einen Reiter mit Fläche verfügbar und sonst nicht', () => {
    expect(istCanvasModusVerfuegbar({ content: MIT })).toBe(true);
    expect(istCanvasModusVerfuegbar({ content: OHNE })).toBe(false);
    expect(istCanvasModusVerfuegbar(null)).toBe(false);
  });

  it('System-Seiten bleiben außen vor, auch mit passendem Inhalt', () => {
    expect(istCanvasModusVerfuegbar({ content: MIT, systemPage: true })).toBe(false);
  });

  it('ein gespeicherter Canvas-Reiter ohne Fläche fällt auf die Lese-Ansicht', () => {
    // Der Fall entsteht real: Reiter in der Canvas-Ansicht gespeichert, Fence
    // später ausserhalb der Anwendung aus der Datei entfernt.
    expect(resolveCanvasViewMode('canvas', OHNE)).toBe('rendered');
    expect(resolveCanvasViewMode('canvas', MIT)).toBe('canvas');
  });

  it('alle anderen Modi bleiben in beiden Fällen unangetastet', () => {
    for (const inhalt of [MIT, OHNE]) {
      for (const modus of ['source', 'split', 'rendered', 'live', 'mindmap']) {
        expect(resolveCanvasViewMode(modus, inhalt)).toBe(modus);
      }
    }
  });

  it('die Umschaltung weist den Modus ohne Fläche ab', () => {
    // Reissleine für Tastenkürzel und Kommando-Palette: Schaltfläche und
    // Menü-Eintrag sind bereits deaktiviert, der Weg über die Tastatur nicht.
    const quelle = lies('src/renderer/modules/views/views.js');
    expect(quelle).toMatch(/mode === 'canvas' && !istCanvasModusVerfuegbar\(tab\)/);
  });

  it('Schaltfläche und Menü-Eintrag hängen am selben Urteil', () => {
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    // Deaktiviert, nicht ausgeblendet — solange es allein am Dokument liegt:
    // Die Schalter-Gruppe steht mittig in der Statusleiste und wechselte sonst
    // bei jedem Reiter-Wechsel ihre Breite. 4T-001656: Ausgeblendet wird nach
    // dem Erweiterungs-Schalter und nach nichts sonst.
    expect(tabs).toMatch(/b\.dataset\.view === 'canvas' && !canvasVerfuegbar/);
    expect(tabs).not.toMatch(/b\.hidden = !canvasVerfuegbar/);
    expect(tabs).toContain('canvasTab: istCanvasModusVerfuegbar(tab)');
    expect(lies('src/main/menu/menu-state.js')).toContain('canvasTab: !!b.canvasTab');
    // 4T-001697: dasselbe Urteil, jetzt als benannte Bedingung des Katalogs;
    // der Menue-Eintrag wertet sie aus, statt sie selbst zu formulieren.
    expect(lies('src/main/menu/menu.js')).toContain("enabled: avail('view.modeCanvas')");
    pruefeBedingung('view.modeCanvas', 'canvasAnsicht', [
      [{ canvasTab: true }, true],
      [{ canvasTab: false }, false],
      [{ canvasTab: true, systemTab: true }, false],
    ]);
  });

  it('der Grund der Deaktivierung steht im Titel der Schaltfläche', () => {
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    expect(tabs).toContain("t('canvas.keineFence')");
  });

  it('der Wechsel wird gemeldet, damit der Zugang beim Tippen nachzieht', () => {
    const quelle = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(quelle).toContain('beiVerfuegbarkeitsWechsel');
    // Nur beim Wechsel, nicht bei jedem Takt: Der Menü-Zustand geht über die
    // Prozess-Brücke.
    expect(quelle).toMatch(/if \(verfuegbar\[paneIdx\] === jetzt\) return;/);
    expect(lies('src/renderer/modules/app-init.js')).toContain('beiVerfuegbarkeitsWechsel:');
  });
});

// 4T-001656 (Epic 3E-000287): Der Aus-Zustand der Erweiterung im Renderer
// (Story 4S-000919, AK2 und AK4). Die Registry-Seite und der Render-Rückfall
// stehen in render/extensions-aus.test.js; hier die Verfügbarkeit des Modus,
// der Rückfall des gespeicherten Ansichts-Modus und die Verdrahtung der
// Bedienorte.
describe('Canvas-Erweiterung: Aus-Zustand im Renderer (4T-001656)', () => {
  const MIT = `Titel\n\n${FENCE(EINE_KARTE)}\n`;

  afterEach(() => {
    istAktiv.mockReturnValue(true);
  });

  it('fragt genau die eigene Erweiterungs-Kennung ab', () => {
    istAktiv.mockClear();
    istCanvasErweiterungAn();
    expect(istAktiv).toHaveBeenCalledWith('canvas');
    expect(CANVAS_EXTENSION_ID).toBe('canvas');
  });

  it('AK4: abgeschaltet ist der Modus auch mit Fläche nicht verfügbar', () => {
    // Nicht-Vakuitäts-Probe: eingeschaltet ist derselbe Reiter verfügbar.
    expect(istCanvasModusVerfuegbar({ content: MIT })).toBe(true);
    istAktiv.mockReturnValue(false);
    expect(istCanvasModusVerfuegbar({ content: MIT })).toBe(false);
    expect(istCanvasErweiterungAn()).toBe(false);
  });

  it('AK2: ein gespeicherter Canvas-Reiter öffnet abgeschaltet in der Lese-Ansicht', () => {
    expect(resolveCanvasViewMode('canvas', MIT)).toBe('canvas');
    istAktiv.mockReturnValue(false);
    expect(resolveCanvasViewMode('canvas', MIT)).toBe('rendered');
  });

  it('alle anderen Modi bleiben auch im Aus-Zustand unangetastet', () => {
    istAktiv.mockReturnValue(false);
    for (const modus of ['source', 'split', 'rendered', 'live', 'mindmap']) {
      expect(resolveCanvasViewMode(modus, MIT)).toBe(modus);
    }
  });

  it('AK4: Schaltfläche und Menü-Eintrag verschwinden, statt zu erschlaffen', () => {
    // Der Unterschied zum Dokument ohne Fläche: Dort gibt es die Funktion,
    // hier nicht. Ein deaktivierter Schalter behauptete eine Ansicht, die es
    // im Aus-Zustand nicht gibt.
    const tabs = lies('src/renderer/modules/tabs/tabs.js');
    expect(tabs).toContain('const canvasErweiterungAn = istCanvasErweiterungAn();');
    expect(tabs).toContain("if (b.dataset.view === 'canvas') b.hidden = !canvasErweiterungAn;");
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toMatch(/unless\('view\.modeCanvas', \{/);
    expect(menu).toMatch(/unless\('canvas\.addCard', \{/);
  });

  it('AK5: das Kontextmenü führt das Einfüge-Kommando nur bei aktiver Erweiterung', () => {
    const quelle = lies('src/renderer/modules/editor/editor-context-menu.js');
    expect(quelle).toContain("if (!aus.has('insert.canvas')) submenu.push(ins('canvas'");
  });

  it('AK4: eine offene Fläche fällt beim Abschalten auf die Lese-Ansicht', () => {
    // Der Rückfall in canvas-modus.js greift beim Öffnen; das Umschalten bei
    // offener Fläche braucht den Laufzeit-Hook, sonst bliebe das geöffnete
    // Dokument in einer Ansicht ohne Schalter und ohne Menü-Eintrag stehen.
    const quelle = lies('src/renderer/modules/app/app-extension-runtime.js');
    expect(quelle).toContain('attachExtensionRuntime(CANVAS_EXTENSION_ID, {');
    expect(quelle).toMatch(/if \(tab\.viewMode === 'canvas'\) tab\.viewMode = 'rendered';/);
  });
});

describe('Canvas: Form-Anlage und Stapel-Befehle über alle Zugänge (4T-001701)', () => {
  // Dieselbe Sorgfalt wie beim Kommando «Karte anlegen» (4T-001654): Ein
  // Kommando, das in Registry, Menü, Brücke und Dispatcher nicht durchgängig
  // verdrahtet ist, fällt sonst erst im Struktur-Prüfschritt auf.
  const NEUE = [
    'canvas.addShape',
    'canvas.stackFront',
    'canvas.stackForward',
    'canvas.stackBackward',
    'canvas.stackBack',
  ];

  it('die fünf Kommandos stehen in der Registry, ohne Vorgabe-Kürzel', () => {
    const registry = new Map(COMMANDS.map((c) => [c.id, c]));
    for (const id of NEUE) {
      const cmd = registry.get(id);
      expect(cmd, `Kommando ${id} fehlt`).toBeTruthy();
      expect(cmd.defaultBindings, id).toEqual([]);
      expect(cmd.menu, id).toBe(true);
      expect(cmd.labelKey, id).toBe(`command.${id}`);
      expect(cmd.descKey, id).toBe('help.feature.canvas');
    }
  });

  it('jedes trägt seine benannte Bedingung und entscheidet sie nicht selbst', () => {
    // Dieselbe Bedingung wie die Karten-Anlage: offene Fläche in der
    // Canvas-Ansicht. Anzeige-Modus und Auswahl auf der Fläche stehen
    // bewusst NICHT im Katalog — beides kennt der gemeldete Kontext nicht,
    // und beides fängt der Guard der Einbettung mit einem gesagten
    // Fehlschlag ab.
    const menu = lies('src/main/menu/menu.js');
    for (const id of NEUE) {
      pruefeBedingung(id, 'canvasKarte', [
        [{ canvasTab: true, viewMode: 'canvas' }, true],
        [{ canvasTab: true, viewMode: 'rendered' }, false],
        [{ canvasTab: false, viewMode: 'canvas' }, false],
        [{ canvasTab: true, viewMode: 'canvas', systemTab: true }, false],
      ]);
      expect(menu, id).toContain(`enabled: avail('${id}')`);
      expect(menu, id).toContain(`acc('${id}')`);
    }
  });

  it('die Kette Menü → Brücke → Bindung → Einbettung ist geschlossen', () => {
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("send('menu:canvasAddShape')");
    // Die vier Stapel-Befehle laufen über EINEN Kanal mit dem Befehl als
    // Nutzlast (Muster menu:viewChange); vier Kanäle wären vier Stellen, an
    // denen dieselbe Kette reissen kann.
    for (const befehl of ['ganzNachVorn', 'eineStufeVor', 'eineStufeZurueck', 'ganzNachHinten']) {
      expect(menu, befehl).toContain(`send('menu:canvasStack', '${befehl}')`);
    }
    expect(menu).toContain("submenuOrNull('menu.view.canvasStack'");
    const preload = lies('src/main/preload.js');
    expect(preload).toContain("ipcRenderer.on('menu:canvasAddShape'");
    expect(preload).toContain("ipcRenderer.on('menu:canvasStack'");
    const bindings = lies('src/renderer/modules/app/app-menu-bindings.js');
    expect(bindings).toContain('api.onMenuCanvasAddShape(');
    expect(bindings).toContain('api.onMenuCanvasStack(');
    const dispatcher = lies('src/renderer/modules/app/app-commands.js');
    expect(dispatcher).toContain('legeCanvasFormAn(state.activePaneIndex)');
    for (const befehl of ['ganzNachVorn', 'eineStufeVor', 'eineStufeZurueck', 'ganzNachHinten']) {
      expect(dispatcher, befehl).toContain(
        `verschiebeCanvasElement(state.activePaneIndex, '${befehl}')`,
      );
    }
  });

  it('die Texte der Kommandos stehen im Katalog', () => {
    const de = JSON.parse(lies('src/i18n/de.json'));
    for (const id of [...NEUE, 'menu.view.canvasStack']) {
      const key = id.startsWith('menu.') ? id : `command.${id}`;
      expect(de[key], `Schlüssel ${key} fehlt`).toBeTruthy();
    }
    for (const key of ['canvas.nurInAnsicht', 'canvas.nurLesbar', 'canvas.keineAuswahl']) {
      expect(de[key], `Schlüssel ${key} fehlt`).toBeTruthy();
    }
  });
});

describe('Canvas-Einbettung: die Guards der Flächen-Kommandos (4T-001701)', () => {
  // Der Hinweis kommt über einen Laufzeit-Import und damit erst im nächsten
  // Zyklus (Muster der Prüffälle zu 4T-001654).
  const hinweisAbwarten = () => new Promise((fertig) => setTimeout(fertig, 0));
  const EINE_FLAECHE = '!karte k1 x=0 y=0 b=200 h=100\nText';
  const TEXT = ['# Titel', '```perspective-canvas', EINE_FLAECHE, '```'].join('\n');

  function baueSpalte(paneIdx, tab, extra = {}) {
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const geschrieben = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      schreibeDokument: (idx, daten) => {
        geschrieben.push({ idx, ...daten });
        return true;
      },
      ...extra,
    });
    renderCanvas(paneIdx);
    return { canvasEl, geschrieben };
  }

  it('die Form-Anlage schreibt in die Zeilen der gefundenen Fence', () => {
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(10, tab);
    expect(legeCanvasFormAn(10)).toBe(true);
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({ idx: 10, vonZeile: 3, bisZeile: 4 });
    expect(geschrieben[0].text).toContain('!form s1 ');
    destroyCanvas(10);
  });

  it('ausserhalb der Canvas-Ansicht bleiben beide wirkungslos und sagen es', async () => {
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(11, tab);
    tab.viewMode = 'source';
    expect(legeCanvasFormAn(11)).toBe(false);
    expect(verschiebeCanvasElement(11, 'ganzNachVorn')).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.nurInAnsicht');
    destroyCanvas(11);
  });

  it('im Anzeige-Modus geschieht nichts, und es wird gesagt', async () => {
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(12, tab, { istAenderbar: () => false });
    expect(legeCanvasFormAn(12)).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.nurLesbar');
    destroyCanvas(12);
  });

  it('ohne gewähltes Element sagt der Stapel-Befehl, dass nichts gewählt ist', async () => {
    // Der Fall, den das Verfügbarkeits-Modell nicht trägt: Die Auswahl lebt in
    // der Ansicht, und ein gemeldetes Feld dafür ginge bei jedem Klick auf der
    // Fläche über die Prozess-Brücke.
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    const { geschrieben } = baueSpalte(13, tab);
    expect(verschiebeCanvasElement(13, 'ganzNachVorn')).toBe(false);
    expect(geschrieben).toHaveLength(0);
    await hinweisAbwarten();
    expect(hinweise).toContain('canvas.keineAuswahl');
    destroyCanvas(13);
  });
});

describe('Canvas: Gruppen-Anlage über alle Zugänge (4T-001702)', () => {
  // Dieselbe Sorgfalt wie bei Karte und Form: Ein Kommando, das in Registry,
  // Menü, Brücke und Dispatcher nicht durchgängig verdrahtet ist, fällt sonst
  // erst im Struktur-Prüfschritt auf.
  it('steht in der Registry, ohne Vorgabe-Kürzel', () => {
    const cmd = COMMANDS.find((c) => c.id === 'canvas.addGroup');
    expect(cmd, 'Kommando canvas.addGroup fehlt').toBeTruthy();
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.labelKey).toBe('command.canvas.addGroup');
    expect(cmd.descKey).toBe('help.feature.canvas');
  });

  it('trägt seine benannte Bedingung und entscheidet sie nicht selbst', () => {
    const menu = lies('src/main/menu/menu.js');
    pruefeBedingung('canvas.addGroup', 'canvasKarte', [
      [{ canvasTab: true, viewMode: 'canvas' }, true],
      [{ canvasTab: true, viewMode: 'rendered' }, false],
      [{ canvasTab: false, viewMode: 'canvas' }, false],
      [{ canvasTab: true, viewMode: 'canvas', systemTab: true }, false],
    ]);
    expect(menu).toContain("enabled: avail('canvas.addGroup')");
    expect(menu).toContain("acc('canvas.addGroup')");
  });

  it('die Kette Menü → Brücke → Bindung → Einbettung ist geschlossen', () => {
    expect(lies('src/main/menu/menu.js')).toContain("send('menu:canvasAddGroup')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:canvasAddGroup'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuCanvasAddGroup(',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      'legeCanvasGruppeAn(state.activePaneIndex)',
    );
  });

  it('es gehört der Erweiterung der Fläche', () => {
    // Ohne die Canvas-Ansicht gibt es keine Gruppe; im Aus-Zustand darf das
    // Kommando deshalb nicht in Menü und Palette stehen bleiben.
    const quelle = lies('src/shared/extensions/extensions.js');
    expect(quelle).toContain("'canvas.addGroup',");
  });

  it('die Gruppen-Anlage schreibt in die Zeilen der gefundenen Fence', () => {
    const TEXT = [
      '# Titel',
      '```perspective-canvas',
      '!karte k1 x=0 y=0 b=200 h=100',
      'Text',
      '```',
    ].join('\n');
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    const geschrieben = [];
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      schreibeDokument: (idx, daten) => {
        geschrieben.push({ idx, ...daten });
        return true;
      },
    });
    renderCanvas(20);
    expect(legeCanvasGruppeAn(20)).toBe(true);
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({ idx: 20, vonZeile: 3, bisZeile: 4 });
    // Ganz hinten: Die Gruppe steht vor der Karte in der Fence und verdeckt
    // damit nichts (Story 4S-000931, AK15).
    expect(geschrieben[0].text).toMatch(/^!gruppe g1 /);
    destroyCanvas(20);
  });

  it('ausserhalb der Canvas-Ansicht bleibt sie wirkungslos und sagt es', async () => {
    const tab = { viewMode: 'source', content: '# Ohne Fläche', path: 'F.md' };
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    initCanvasPane({ getPaneEls: () => ({ canvasEl }), aktivesDokument: () => tab });
    expect(legeCanvasGruppeAn(21)).toBe(false);
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(hinweise).toContain('canvas.nurInAnsicht');
    destroyCanvas(21);
  });
});
