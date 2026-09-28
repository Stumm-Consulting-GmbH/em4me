// @vitest-environment jsdom
// 4T-001864 (Epic 3E-000320): Hinweis-Kästen in jeder Schreibweise — die
// Stellen 3 bis 7 der Bestands-Erhebung auf der Seite des Editors:
//
//   Stelle 3 und 4  Vor-Durchlauf der Live-Ansicht (computeCalloutScan)
//   Stelle 5        Marker-Bereich und Symbol-Widget (runCalloutPasses)
//   Stelle 6        Marker-Hervorhebung im Quelltext-Modus
//   Stelle 7        Prüfung des Markdown-Linters auf unbekannte Typen
//
// Je Stelle ein eigener Prüffall, weil sieben Stellen sieben Gelegenheiten
// sind, eine zu vergessen: Ein Fall über das Konstrukt als Ganzes bliebe grün,
// wenn etwa nur der Marker-Bereich der Stelle 5 die Großform verfehlte — die
// Box stünde dann, aber mit `[!NOTE]` als Roh-Text davor.
//
// Wie im Render-Weg wird die GLEICHWERTIGKEIT geprüft: Die Groß- und die
// Mischform müssen dieselben Dekorationen an denselben Stellen erzeugen wie
// die Kleinform. Die Stellen 1 und 2 liegen in
// test/unit/render/callouts-schreibweise.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import './api-stub.js';

const { computeCalloutScan, computeContainerScan } =
  await import('../../../src/renderer/modules/live/live-scans.js');
const { runCalloutPasses } =
  await import('../../../src/renderer/modules/live/live-pass-callouts.js');
const { buildCalloutMarkerDecorations } =
  await import('../../../src/renderer/modules/live/live-marker-fields.js');
const { unknownCalloutTypeRanges } =
  await import('../../../src/renderer/modules/editor/editor-lint.js');
const { applyExtensionsState, resetExtensionStateForTests } =
  await import('../../../src/renderer/modules/extensions/extension-lifecycle.js');

afterEach(() => {
  resetExtensionStateForTests();
});

async function calloutsAus() {
  await applyExtensionsState(['callouts'], { persist: false });
}

const doc = (text) => EditorState.create({ doc: text }).doc;

// Dieselbe Box in den vier Schreibweisen, gleich lang, damit die Positionen
// der Dekorationen unmittelbar vergleichbar sind.
const FORMEN = ['note', 'NOTE', 'Note', 'nOtE'];

describe('Stelle 3 und 4: Vor-Durchlauf der Live-Ansicht', () => {
  it('erkennt jede Schreibweise und führt sie auf den Schlüssel der Typ-Tafel (AK2, AK11)', () => {
    for (const form of FORMEN) {
      const { calloutInfos, calloutLines } = computeCalloutScan(doc(`> [!${form}]\n> Inhalt`));
      expect(calloutInfos, form).toEqual([
        { type: 'note', foldChar: '', overrideTitle: '', headerLineNo: 1, lastLineNo: 2 },
      ]);
      expect([...calloutLines], form).toEqual([1, 2]);
    }
  });

  it('behält Klapp-Zeichen und eigenen Titel, wie sie geschrieben sind (AK6, AK12)', () => {
    const { calloutInfos } = computeCalloutScan(doc('> [!WARNING]- Mein TITEL\n> x'));
    expect(calloutInfos[0]).toMatchObject({
      type: 'warning',
      foldChar: '-',
      overrideTitle: 'Mein TITEL',
    });
    expect(computeCalloutScan(doc('> [!Tip]+\n> x')).calloutInfos[0].foldChar).toBe('+');
  });

  it('übergeht unbekannte Typen und geschachtelte Zitate in jeder Schreibweise (AK13, AK14)', () => {
    for (const text of ['> [!UNBEKANNT]\n> x', '> [!IMPORTANT]\n> x', '> > [!NOTE]\n> > x']) {
      expect(computeCalloutScan(doc(text)).calloutInfos, text).toEqual([]);
    }
  });
});

// Die Dekorationen eines Sichtbereichs als vergleichbare Beschreibung:
// Stelle, Art und — bei Widgets — der Typ, für den das Widget steht.
function beschreibe(ranges) {
  return ranges.map((r) => {
    const spec = r.value.spec || {};
    const art = spec.widget
      ? `${spec.widget.constructor.name}:${spec.widget.type}`
      : spec.class || (spec.attributes && spec.attributes.class) || '?';
    return `${r.from}-${r.to} ${art}`;
  });
}

function dekoriere(text, activeLines = new Set()) {
  const state = EditorState.create({ doc: text });
  const { calloutInfos } = computeCalloutScan(state.doc);
  const ranges = [];
  runCalloutPasses({
    state,
    ranges,
    activeLines,
    frontmatterEndLine: 0,
    calloutInfos,
    from: 0,
    to: state.doc.length,
  });
  return ranges;
}

describe('Stelle 5: Marker-Bereich und Symbol-Widget der Live-Ansicht', () => {
  it('versteckt den Marker in jeder Schreibweise an derselben Stelle wie bei der Kleinform (AK2)', () => {
    const soll = beschreibe(dekoriere('> [!note]\n> Inhalt'));
    // Der Marker `> [!note]` umfasst die Zeichen 0 bis 9 der Kopfzeile.
    expect(soll).toContain('0-9 cm-live-marker-hidden');
    expect(soll).toContain('0-0 CalloutIconWidget:note');
    expect(soll).toContain('9-9 CalloutDefaultTitleWidget:note');
    for (const form of FORMEN) {
      expect(beschreibe(dekoriere(`> [!${form}]\n> Inhalt`)), form).toEqual(soll);
    }
  });

  it('schließt Klapp-Zeichen und Leerraum vor dem eigenen Titel in den Marker ein (AK6, AK12)', () => {
    const soll = beschreibe(dekoriere('> [!note]- Titel\n> x'));
    expect(soll).toContain('0-11 cm-live-marker-hidden');
    expect(beschreibe(dekoriere('> [!NOTE]- Titel\n> x'))).toEqual(soll);
    // Mit eigenem Titel entfällt das Standard-Titel-Widget.
    expect(soll.some((z) => z.includes('CalloutDefaultTitleWidget'))).toBe(false);
  });

  it('baut Symbol und Standard-Titel aus der Typ-Tafel, auch bei Großform', () => {
    const widgets = dekoriere('> [!DANGER]\n> x')
      .map((r) => r.value.spec && r.value.spec.widget)
      .filter(Boolean);
    expect(widgets.map((w) => w.type)).toEqual(['danger', 'danger']);
    // toDOM schlägt in CALLOUT_TYPES nach; mit der Großform als Schlüssel liefe
    // es auf undefined und bräche ab.
    for (const w of widgets) expect(() => w.toDOM()).not.toThrow();
  });
});

describe('Stelle 6: Marker-Hervorhebung im Quelltext-Modus', () => {
  function markierungen(text) {
    const set = buildCalloutMarkerDecorations(doc(text));
    const out = [];
    set.between(0, text.length, (from, to) => {
      out.push(text.slice(from, to));
    });
    return out;
  }

  it('hebt den Marker in jeder Schreibweise hervor, samt Klapp-Zeichen (AK3)', () => {
    for (const form of FORMEN) {
      expect(markierungen(`> [!${form}]\n> x`), form).toEqual([`[!${form}]`]);
      expect(markierungen(`> [!${form}]- Titel\n> x`), form).toEqual([`[!${form}]-`]);
    }
  });

  it('bleibt bei abgeschalteter Erweiterung ohne Hervorhebung (AK8)', async () => {
    await calloutsAus();
    expect(markierungen('> [!NOTE]\n> x')).toEqual([]);
  });
});

describe('Stelle 7: Prüfung des Markdown-Linters', () => {
  const gemeldet = (text) => unknownCalloutTypeRanges(text).map((r) => text.slice(r.from, r.to));

  it('meldet einen bekannten Typ in keiner Schreibweise (AK4)', () => {
    for (const form of FORMEN) expect(gemeldet(`> [!${form}]\n> x`), form).toEqual([]);
    expect(gemeldet('> [!WARNING]- Titel\n> x')).toEqual([]);
  });

  it('meldet einen unbekannten Typ in jeder Schreibweise und nennt ihn, wie er geschrieben ist (AK4, AK14)', () => {
    const text = [
      '> [!UNBEKANNT]',
      '',
      '> [!unbekannt]',
      '',
      '> [!IMPORTANT] Titel',
      '',
      '> [!Caution]',
    ].join('\n');
    expect(gemeldet(text)).toEqual(['UNBEKANNT', 'unbekannt', 'IMPORTANT', 'Caution']);
    // Der markierte Bereich liegt genau auf dem Typ-Namen — der Hinweis des
    // Linters liest ihn aus dieser Spanne.
    const [erster] = unknownCalloutTypeRanges(text);
    expect(erster).toEqual({ from: 4, to: 13, type: 'UNBEKANNT' });
  });

  it('meldet bei abgeschalteter Erweiterung nichts, in keiner Schreibweise (AK8)', async () => {
    expect(gemeldet('> [!UNBEKANNT]\n> x')).toEqual(['UNBEKANNT']);
    await calloutsAus();
    expect(gemeldet('> [!UNBEKANNT]\n> x')).toEqual([]);
    expect(gemeldet('> [!NOTE]\n> x')).toEqual([]);
  });
});

// 4T-001914 (Epic 3E-000320): Container-Blöcke `::: name` in jeder Schreibweise
// — die Container-Stellen 4 bis 7 der Bestands-Erhebung in der Live-Ansicht:
//
//   Container-Stelle 4 und 5  Vor-Durchlauf (computeContainerScan): Namens-
//                             Muster und Einordnung über containerKind
//   Container-Stelle 6        Marker-Bereich vor einem eigenen Titel
//   Container-Stelle 7        Kopfzeile der neutralen Box: der Name bleibt als
//                             Titel stehen (Fehlerbehebung S4)
//
// Die Container-Stellen 1 bis 3 liegen in
// test/unit/render/callouts-schreibweise.test.js.
describe('Container-Stelle 4 und 5: Vor-Durchlauf der Container', () => {
  const scan = (text) => computeContainerScan(doc(text)).containerInfos;

  it('erkennt jede Schreibweise eines Typs und führt sie auf den Tafel-Schlüssel (AK2)', () => {
    for (const form of ['warning', 'WARNING', 'Warning', 'wArNiNg']) {
      expect(scan(`::: ${form}\nInhalt\n:::`), form).toEqual([
        {
          type: 'warning',
          kind: 'callout',
          name: form,
          overrideTitle: '',
          isCallout: true,
          headerLineNo: 1,
          endLineNo: 3,
          hasClose: true,
        },
      ]);
    }
  });

  it('behält den eigenen Titel hinter einem gemischt geschriebenen Typ, wie er geschrieben ist (AK4)', () => {
    expect(scan('::: wArNiNg Eigener TITEL\nx\n:::')[0]).toMatchObject({
      type: 'warning',
      isCallout: true,
      overrideTitle: 'Eigener TITEL',
    });
  });

  it('ordnet unbekannte und geerbte Namen als neutrale Box ein, den Namen wie geschrieben (AK5, AK7)', () => {
    expect(scan('::: Meine-Box\nx\n:::')[0]).toMatchObject({
      type: 'meine-box',
      kind: 'plain',
      name: 'Meine-Box',
      isCallout: false,
    });
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(scan(`::: ${name}\nx\n:::`)[0], name).toMatchObject({
        kind: 'plain',
        name,
        isCallout: false,
      });
    }
  });

  it('erkennt den Mehrspalten-Namen in jeder Schreibweise, eine ungültige Zahl ergibt die neutrale Box (AK6)', () => {
    for (const kopf of ['::: columns 2', '::: COLUMNS 2', '::: Columns 2']) {
      expect(scan(`${kopf}\nx\n:::`)[0], kopf).toMatchObject({ kind: 'columns', isCallout: false });
    }
    expect(scan('::: COLUMNS 7\nx\n:::')[0]).toMatchObject({
      kind: 'plain',
      type: 'columns',
      name: 'COLUMNS',
    });
  });
});

describe('Container-Stelle 6 und 7: Dekorationen der Container in der Live-Ansicht', () => {
  it('dekoriert jede Schreibweise eines Typs wie die Kleinform, samt Symbol und Standard-Titel (AK2)', () => {
    const soll = beschreibe(dekoriere('::: warning\nInhalt\n:::'));
    expect(soll).toContain('0-0 CalloutIconWidget:warning');
    expect(soll).toContain('11-11 CalloutDefaultTitleWidget:warning');
    for (const form of ['WARNING', 'Warning', 'wArNiNg']) {
      expect(beschreibe(dekoriere(`::: ${form}\nInhalt\n:::`)), form).toEqual(soll);
    }
  });

  it('versteckt vor einem eigenen Titel nur `::: Name ` in jeder Schreibweise (AK4, Container-Stelle 6)', () => {
    const soll = beschreibe(dekoriere('::: warning Titel\nx\n:::'));
    // `::: warning ` umfasst die Zeichen 0 bis 12 der Kopfzeile.
    expect(soll).toContain('0-12 cm-live-marker-hidden');
    expect(beschreibe(dekoriere('::: WARNING Titel\nx\n:::'))).toEqual(soll);
    expect(beschreibe(dekoriere('::: wArNiNg Titel\nx\n:::'))).toEqual(soll);
  });

  it('lässt den Namen einer neutralen Box als Titel stehen, wie er geschrieben ist (AK8, Container-Stelle 7)', () => {
    const text = '::: Meine-Box\nInhalt\n:::';
    const deko = beschreibe(dekoriere(text));
    // Versteckt ist `::: ` (Zeichen 0 bis 4), der Name (4 bis 13) bleibt sichtbar.
    expect(deko).toContain('0-4 cm-live-marker-hidden');
    expect(deko).toContain('0-0 cm-live-container-header');
    expect(deko.some((z) => z.startsWith('0-13 cm-live-marker-hidden'))).toBe(false);
    expect(deko.some((z) => z.startsWith('4-13 cm-live-marker-hidden'))).toBe(false);
    // Die schließende Zeile bleibt versteckt wie bisher.
    expect(deko).toContain('21-24 cm-live-marker-hidden');
    // Kleinform: dieselben Stellen.
    expect(beschreibe(dekoriere('::: meine-box\nInhalt\n:::'))).toEqual(deko);
  });

  it('versteckt einen Text hinter dem unbekannten Namen, der Titel bleibt der Name (Auslegung S4)', () => {
    const deko = beschreibe(dekoriere('::: Meine-Box Weiterer Text\nx\n:::'));
    expect(deko).toContain('0-4 cm-live-marker-hidden');
    // ` Weiterer Text` von Zeichen 13 bis zum Zeilenende 27.
    expect(deko).toContain('13-27 cm-live-marker-hidden');
  });

  it('gibt geerbten Namen die neutrale Box mit Titel und kein Symbol (AK7)', () => {
    const deko = beschreibe(dekoriere('::: constructor\nx\n:::'));
    expect(deko).toContain('0-0 cm-live-container');
    expect(deko).toContain('0-4 cm-live-marker-hidden');
    expect(deko.some((z) => z.includes('Callout'))).toBe(false);
  });

  it('lässt den Mehrspalten-Block in jeder Schreibweise ohne Titel (AK6)', () => {
    const soll = beschreibe(dekoriere('::: columns 2\nx\n:::'));
    // Die ganze Kopfzeile ist versteckt, wie vor diesem Task.
    expect(soll).toContain('0-13 cm-live-marker-hidden');
    expect(soll.some((z) => z.includes('cm-live-container-header'))).toBe(false);
    expect(beschreibe(dekoriere('::: COLUMNS 2\nx\n:::'))).toEqual(soll);
    // Ungültige Zahl: neutrale Box, der Name bleibt als Titel stehen.
    const rueckfall = beschreibe(dekoriere('::: COLUMNS 7\nx\n:::'));
    expect(rueckfall).toContain('0-4 cm-live-marker-hidden');
    expect(rueckfall).toContain('11-13 cm-live-marker-hidden');
  });

  it('zeigt in der Cursor-Zeile die ganze Kopfzeile, wie sie geschrieben ist', () => {
    const deko = beschreibe(dekoriere('::: Meine-Box\nx\n:::', new Set([1])));
    expect(deko.some((z) => /^0-\d+ cm-live-marker-hidden$/.test(z))).toBe(false);
  });

  it('dekoriert bei abgeschalteter Erweiterung nichts, in keiner Schreibweise (AK11)', async () => {
    await applyExtensionsState(['custom-containers'], { persist: false });
    for (const text of ['::: warning\nx\n:::', '::: WARNING\nx\n:::', '::: Meine-Box\nx\n:::']) {
      expect(dekoriere(text), text).toEqual([]);
    }
  });
});
