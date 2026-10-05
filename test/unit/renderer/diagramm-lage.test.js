// @vitest-environment jsdom
// 4T-002024 (Epic 3E-000192): Die Lage «Datentabelle angeklickt» bzw.
// «Diagramm ausgewählt» im Zustand des Editors (charts/chart-lage.js).
//
// Gemessen an einer echten `EditorView` ohne Live-Widgets: Gegenstand ist das
// Zustands-Feld selbst — wie es die Stelle durch Transaktionen mitführt, wann
// es sie fallen lässt, wie `lageFuer` Klick-Lage und Schreibmarke verrechnet und
// wann das Menü der Anwendung eine Meldung bekommt. Die Bedienwege, die die Lage
// setzen, stehen in diagramm-auswahl.test.js und diagramm-kontextmenue.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  findChartBlockAtLine,
  findDatatableAtLine,
} from '../../../src/shared/charts/chart-edit.js';
import {
  blockBei,
  klickLage,
  lageErweiterung,
  lageFuer,
  loescheLage,
  merkeOffen,
  MELDE_RUHE_MS,
  merkeGemeldeteLage,
  offenFuer,
  registriereLageMeldung,
  setzeLage,
  vergissOffen,
} from '../../../src/renderer/modules/charts/chart-lage.js';

const Z = '```';
const TABELLE = [
  `${Z}perspective-datatable`,
  'columns: Monat:text, Einnahmen:number',
  '| Januar | 100 |',
  '| Februar | 90 |',
  Z,
  '^umsatz',
];
const DIAGRAMM = [`${Z}perspective-chart`, 'table: ^umsatz', 'type: bar', Z];

// Zeile 1 Absatz, 3–7 Datentabelle, 8 Name, 10–13 Diagramm, 15–17 Pipe-Tabelle.
const DOK = [
  'Absatz',
  '',
  ...TABELLE,
  '',
  ...DIAGRAMM,
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  'Ende',
].join('\n');

const LIVE = { viewMode: 'live' };
const SPLIT = { viewMode: 'split' };

let view = null;
const schreibschutz = new Compartment();

function baue(doc = DOK) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [lageErweiterung, schreibschutz.of(EditorState.readOnly.of(false))],
    }),
    parent,
  });
  return view;
}

const zeilenAnfang = (n) => view.state.doc.line(n).from;
const setze = (art, zeile, modus = 'live') =>
  view.dispatch({ effects: setzeLage.of({ art, pos: zeilenAnfang(zeile), modus }) });
const marke = (zeile) => view.dispatch({ selection: { anchor: zeilenAnfang(zeile) } });

afterEach(() => {
  if (view) view.destroy();
  view = null;
  document.body.innerHTML = '';
  registriereLageMeldung(null);
  merkeGemeldeteLage({ inDatentabelle: false, diagrammGewaehlt: false });
  vi.useRealTimers();
});

describe('Lage lesen (lageFuer)', () => {
  beforeEach(() => baue());

  it('ohne Klick und mit der Schreibmarke außerhalb: weder Tabelle noch Diagramm', () => {
    expect(lageFuer(view, LIVE)).toMatchObject({
      inDatentabelle: false,
      diagrammGewaehlt: false,
      art: null,
      zeile: null,
      quelle: null,
    });
  });

  it('die Schreibmarke in einer Zeile der Datentabelle zählt, mit deren Öffner-Zeile', () => {
    marke(5);
    expect(lageFuer(view, LIVE)).toMatchObject({
      inDatentabelle: true,
      diagrammGewaehlt: false,
      zeile: 3,
      quelle: 'marke',
    });
  });

  it('die Schreibmarke im Diagramm-Block zählt als ausgewählt', () => {
    marke(12);
    expect(lageFuer(view, SPLIT)).toMatchObject({
      diagrammGewaehlt: true,
      inDatentabelle: false,
      zeile: 10,
      quelle: 'marke',
    });
  });

  it('eine gewöhnliche Markdown-Tabelle zählt nicht als Datentabelle', () => {
    marke(17);
    expect(lageFuer(view, LIVE).inDatentabelle).toBe(false);
  });

  it('die Klick-Lage gilt in ihrer Ansicht, mit der Öffner-Zeile des Blocks', () => {
    setze('diagramm', 10);
    expect(lageFuer(view, LIVE)).toMatchObject({
      diagrammGewaehlt: true,
      zeile: 10,
      quelle: 'klick',
    });
  });

  it('in einer anderen Ansicht gilt die Klick-Lage nicht', () => {
    setze('datentabelle', 3, 'live');
    expect(lageFuer(view, SPLIT).inDatentabelle).toBe(false);
    setze('datentabelle', 3, 'split');
    expect(lageFuer(view, SPLIT).inDatentabelle).toBe(true);
    expect(lageFuer(view, LIVE).inDatentabelle).toBe(false);
  });

  it('die Klick-Lage schlägt die Schreibmarke', () => {
    marke(4);
    setze('diagramm', 10);
    expect(lageFuer(view, LIVE)).toMatchObject({
      inDatentabelle: false,
      diagrammGewaehlt: true,
      quelle: 'klick',
    });
  });

  it('eine Klick-Lage an einer Zeile ohne Block ihrer Art gilt nicht', () => {
    // Datentabelle gemeldet, dort steht aber ein Diagramm.
    view.dispatch({ effects: setzeLage.of({ art: 'datentabelle', pos: zeilenAnfang(10) }) });
    expect(lageFuer(view, LIVE)).toMatchObject({ inDatentabelle: false, diagrammGewaehlt: false });
  });

  it('ohne Änderbarkeit gilt die Klick-Lage nicht (F5)', () => {
    setze('diagramm', 10);
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(true)) });
    expect(lageFuer(view, LIVE).quelle).not.toBe('klick');
    expect(lageFuer(view, LIVE).diagrammGewaehlt).toBe(false);
  });

  it('wird Bearbeiten ausgeschaltet, fällt die Lage (F5)', async () => {
    setze('diagramm', 10);
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(true)) });
    await Promise.resolve();
    expect(klickLage(view.state)).toBeNull();
    view.dispatch({ effects: schreibschutz.reconfigure(EditorState.readOnly.of(false)) });
    expect(lageFuer(view, LIVE).diagrammGewaehlt).toBe(false);
  });

  it('das Ergebnis wird je Zustand und Ansicht einmal gebildet', () => {
    setze('datentabelle', 3);
    const erst = lageFuer(view, LIVE);
    expect(lageFuer(view, LIVE)).toBe(erst);
    expect(lageFuer(view, SPLIT)).not.toBe(erst);
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    expect(lageFuer(view, LIVE)).not.toBe(erst);
    expect(lageFuer(view, LIVE)).toEqual(erst);
  });
});

describe('Lage mitführen und fallen lassen', () => {
  beforeEach(() => baue());

  it('Einfügen oberhalb verschiebt die Stelle mit dem Block', () => {
    setze('diagramm', 10);
    view.dispatch({ changes: { from: 0, insert: 'neu\nneu\n' } });
    expect(lageFuer(view, LIVE)).toMatchObject({ diagrammGewaehlt: true, zeile: 12 });
  });

  it('ein gleicher Block, der danach an der alten Zeile steht, wird nicht getroffen', () => {
    const zweimal = [...DIAGRAMM, '', ...DIAGRAMM].join('\n');
    view.destroy();
    baue(zweimal);
    // Zweiter Block ab Zeile 6; oben fünf Zeilen eingefügt, dann steht der
    // erste Block an Zeile 6.
    setze('diagramm', 6);
    view.dispatch({ changes: { from: 0, insert: '1\n2\n3\n4\n5\n' } });
    expect(view.state.doc.line(6).text).toBe(`${Z}perspective-chart`);
    expect(lageFuer(view, LIVE).zeile).toBe(11);
  });

  it('eine Änderung im Inhalt des Blocks lässt die Lage stehen', () => {
    setze('diagramm', 10);
    const typ = view.state.doc.line(12);
    view.dispatch({ changes: { from: typ.from, to: typ.to, insert: 'type: line' } });
    expect(lageFuer(view, LIVE)).toMatchObject({ diagrammGewaehlt: true, zeile: 10 });
  });

  it('das Löschen des ganzen Blocks ab seiner Öffner-Zeile lässt die Lage fallen', () => {
    // Der Folge-Block (die Pipe-Tabelle ist keiner) rückt nach; mit einem
    // zweiten Diagramm direkt dahinter träfe eine mitgerutschte Stelle ihn.
    view.destroy();
    baue([...DIAGRAMM, ...DIAGRAMM].join('\n'));
    setze('diagramm', 1);
    view.dispatch({ changes: { from: 0, to: view.state.doc.line(5).from } });
    expect(view.state.doc.line(1).text).toBe(`${Z}perspective-chart`);
    expect(klickLage(view.state)).toBeNull();
    expect(lageFuer(view, LIVE).quelle).not.toBe('klick');
  });

  it('das Löschen über die Stelle hinweg lässt die Lage fallen', () => {
    setze('diagramm', 10);
    view.dispatch({ changes: { from: zeilenAnfang(9), to: zeilenAnfang(11) } });
    expect(klickLage(view.state)).toBeNull();
  });

  it('eine ausdrückliche Auswahl an anderer Stelle lässt die Lage fallen', () => {
    setze('datentabelle', 3);
    marke(16);
    expect(klickLage(view.state)).toBeNull();
  });

  it('eine unveränderte Auswahl lässt die Lage stehen', () => {
    setze('datentabelle', 3);
    view.dispatch({ selection: view.state.selection });
    expect(klickLage(view.state)).not.toBeNull();
  });

  it('eigenes Schreiben ohne Auswahl lässt die Lage stehen (Zell-Editor, Diagramm)', () => {
    setze('datentabelle', 3);
    const zelle = view.state.doc.line(5);
    view.dispatch({ changes: { from: zelle.from, to: zelle.to, insert: '| Januar | 110 |' } });
    expect(lageFuer(view, LIVE)).toMatchObject({ inDatentabelle: true, quelle: 'klick' });
  });

  it('das Ersetzen des ganzen Dokuments (Wechsel des Dokuments) lässt sie fallen', () => {
    view.destroy();
    baue(DIAGRAMM.join('\n'));
    setze('diagramm', 1);
    // Gleicher Block auch im neuen Dokument an Zeile 1: Die Lage gehörte zum
    // alten und fällt trotzdem.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: DIAGRAMM.join('\n') },
    });
    expect(klickLage(view.state)).toBeNull();
  });

  it('der Effekt loescheLage hebt sie auf', () => {
    setze('diagramm', 10);
    view.dispatch({ effects: loescheLage.of(null) });
    expect(klickLage(view.state)).toBeNull();
  });
});

describe('Stelle des offenen Dialogs', () => {
  beforeEach(() => baue());

  it('wird gemerkt, mitgeführt und vergessen; eine Auswahl ändert sie nicht', () => {
    view.dispatch({ effects: merkeOffen.of({ pos: zeilenAnfang(10) }) });
    view.dispatch({ changes: { from: 0, insert: 'oben\n' } });
    marke(1);
    expect(offenFuer(view)).toBe(zeilenAnfang(11));
    view.dispatch({ effects: vergissOffen.of(null) });
    expect(offenFuer(view)).toBeNull();
  });

  it('fällt mit dem gelöschten Block', () => {
    view.dispatch({ effects: merkeOffen.of({ pos: zeilenAnfang(10) }) });
    view.dispatch({ changes: { from: zeilenAnfang(10), to: zeilenAnfang(14) } });
    expect(offenFuer(view)).toBeNull();
  });
});

describe('Meldung an das Menü der Anwendung', () => {
  let meldungen;
  let aktiv;

  beforeEach(() => {
    baue();
    meldungen = 0;
    aktiv = true;
    // Wie `reportMenuStateNow`: senden und das gesendete Paar merken.
    registriereLageMeldung(
      () => {
        meldungen += 1;
        merkeGemeldeteLage(lageFuer(view, LIVE));
      },
      () => (aktiv ? LIVE : null),
    );
  });

  it('eine Klick-Lage wird im nächsten Mikro-Takt gemeldet', async () => {
    setze('datentabelle', 3);
    expect(meldungen).toBe(0);
    await Promise.resolve();
    expect(meldungen).toBe(1);
  });

  it('Auswahl und Dokument werden erst nach der Ruhe-Zeit gemeldet', () => {
    vi.useFakeTimers();
    marke(4);
    vi.advanceTimersByTime(MELDE_RUHE_MS - 1);
    expect(meldungen).toBe(0);
    marke(5);
    vi.advanceTimersByTime(MELDE_RUHE_MS - 1);
    expect(meldungen).toBe(0);
    vi.advanceTimersByTime(1);
    expect(meldungen).toBe(1);
  });

  it('gemeldet wird nur ein geändertes Paar', async () => {
    vi.useFakeTimers();
    marke(4);
    vi.advanceTimersByTime(MELDE_RUHE_MS);
    expect(meldungen).toBe(1);
    // Weiter in derselben Tabelle: gleiches Paar, keine Meldung.
    marke(5);
    vi.advanceTimersByTime(MELDE_RUHE_MS);
    expect(meldungen).toBe(1);
    // Hinaus: das Paar kippt zurück.
    marke(1);
    vi.advanceTimersByTime(MELDE_RUHE_MS);
    expect(meldungen).toBe(2);
  });

  it('der Editor einer nicht aktiven Spalte meldet nicht', async () => {
    aktiv = false;
    setze('diagramm', 10);
    await Promise.resolve();
    expect(meldungen).toBe(0);
  });
});

describe('Meldung gegen das zuletzt gesendete Paar (F2)', () => {
  // Zwei Spalten, zwei Editoren. Die Meldung an das Menü baut den Zustand aus
  // der aktiven Spalte und merkt das gesendete Paar, wie `reportMenuStateNow`.
  let links;
  let rechts;
  let aktiv;
  let gesendet;

  function editor(doc) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    return new EditorView({
      state: EditorState.create({ doc, extensions: [lageErweiterung] }),
      parent,
    });
  }
  function sende() {
    const erg = lageFuer(aktiv, LIVE);
    merkeGemeldeteLage(erg);
    gesendet.push(`${erg.inDatentabelle}|${erg.diagrammGewaehlt}`);
  }

  beforeEach(() => {
    links = editor(DOK);
    rechts = editor(DOK);
    aktiv = links;
    gesendet = [];
    sende();
    gesendet = [];
    registriereLageMeldung(sende, (v) => (v === aktiv ? LIVE : null));
  });
  afterEach(() => {
    links.destroy();
    rechts.destroy();
  });

  it('Klick in der nicht aktiven Spalte, Aktivierung, Escape: das Menü bekommt die Aufhebung', async () => {
    // Der Hörer an der Spalten-Wurzel setzt die Lage (Capture-Phase) …
    rechts.dispatch({
      effects: setzeLage.of({ art: 'diagramm', pos: rechts.state.doc.line(10).from }),
    });
    // … zwischen den Hörern laufen die Mikro-Takte: Die Meldung sieht die
    // Spalte noch nicht als aktiv und schweigt.
    await Promise.resolve();
    expect(gesendet).toEqual([]);
    // Der Hörer, der die Spalte aktiviert, meldet selbst.
    aktiv = rechts;
    sende();
    expect(gesendet).toEqual(['false|true']);
    // Escape hebt auf: Das Menü muss die Aufhebung bekommen.
    rechts.dispatch({ effects: loescheLage.of(null) });
    await Promise.resolve();
    expect(gesendet).toEqual(['false|true', 'false|false']);
  });
});

// --- Übereinstimmung mit den Findern des Schreib-Kerns (V1) -------------------

// Zufalls-Generator mit festem Startwert (mulberry32).
function zufall(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bausteine, aus denen die Zufalls-Dokumente bestehen: Zäune aller Arten,
// längere und Tilde-Zäune, eingerückte, Zäune in Listen und Zitaten,
// Vorspann-Grenzen und gewöhnlicher Text.
const BAUSTEINE = [
  'Text',
  '',
  '```perspective-datatable',
  '```perspective-chart',
  '```perspective-chart extra',
  '```js',
  '```',
  '````',
  '````perspective-chart',
  '~~~perspective-datatable',
  '~~~',
  '   ```perspective-chart',
  '  ```perspective-datatable',
  '    ```perspective-chart',
  '- ```perspective-chart',
  '> ```perspective-datatable',
  '  ```',
  '``` x`y',
  '---',
  '...',
  'columns: A:text, B:number',
  '| a | 1 |',
  'table: ^t',
  '^t',
];

function zufallsDokument(rnd, zeilen) {
  const out = [];
  for (let i = 0; i < zeilen; i++) out.push(BAUSTEINE[Math.floor(rnd() * BAUSTEINE.length)]);
  return out.join('\n');
}

// Soll: die Öffner-Zeile nach den Findern des Kerns, je Zeile und Art.
function soll(text, art, zeile) {
  const b = (art === 'diagramm' ? findChartBlockAtLine : findDatatableAtLine)(text, zeile);
  return b ? { open: b.openLine, close: b.closeLine } : null;
}
function ist(state, art, zeile) {
  const b = blockBei(state, art, zeile);
  return b ? { open: b.open, close: b.close } : null;
}
function vergleiche(state, fehler) {
  const text = state.doc.toString();
  for (let z = 1; z <= state.doc.lines; z++) {
    for (const art of ['datentabelle', 'diagramm']) {
      const a = soll(text, art, z);
      const b = ist(state, art, z);
      if (JSON.stringify(a) !== JSON.stringify(b) && fehler.length < 3) {
        fehler.push({ text, art, z, soll: a, ist: b });
      }
    }
  }
}

describe('Bereiche der Blöcke folgen den Findern des Kerns (V1)', () => {
  it('Zufalls-Dokumente: jede Zeile, beide Arten', () => {
    const rnd = zufall(20260930);
    const fehler = [];
    for (let d = 0; d < 300; d++) {
      const state = EditorState.create({ doc: zufallsDokument(rnd, 1 + Math.floor(rnd() * 40)) });
      vergleiche(state, fehler);
    }
    expect(fehler).toEqual([]);
  });

  it('nach Änderungen: jede Zeile, beide Arten (verschobene und neu erhobene Bereiche)', () => {
    const rnd = zufall(4711);
    const fehler = [];
    for (let d = 0; d < 60; d++) {
      let state = EditorState.create({
        doc: zufallsDokument(rnd, 5 + Math.floor(rnd() * 30)),
        extensions: [lageErweiterung],
      });
      blockBei(state, 'diagramm', 1);
      for (let schritt = 0; schritt < 15; schritt++) {
        const doc = state.doc;
        const von = Math.floor(rnd() * (doc.length + 1));
        const bis = Math.min(doc.length, von + Math.floor(rnd() * 12));
        // Mal gewöhnlicher Text, mal eine Struktur-Zeile, mal nur Löschen.
        const art = rnd();
        const einfuegen =
          art < 0.5
            ? 'ab'.slice(0, 1 + Math.floor(rnd() * 2))
            : art < 0.8
              ? `\n${BAUSTEINE[Math.floor(rnd() * BAUSTEINE.length)]}\n`
              : '';
        state = state.update({ changes: { from: von, to: bis, insert: einfuegen } }).state;
        vergleiche(state, fehler);
      }
    }
    expect(fehler).toEqual([]);
  });

  it('eine Bewegung der Schreibmarke erhebt die Bereiche nicht neu', () => {
    const state = EditorState.create({ doc: DOK, extensions: [lageErweiterung] });
    const erst = blockBei(state, 'diagramm', 11);
    const bewegt = state.update({ selection: { anchor: state.doc.line(12).from } }).state;
    expect(blockBei(bewegt, 'diagramm', 11)).toBe(erst);
  });

  // Die Grenze des Vorspanns kann weit hinter dem Block liegen: Eine Zeile `---`
  // nach dem Diagramm macht aus einem Dokument ohne Vorspann eines, in dessen
  // Vorspann das Diagramm steht, und umgekehrt.
  it('eine neue oder entfernte Vorspann-Grenze hinter dem Block wird bemerkt', () => {
    const fehler = [];
    const ohneEnde = ['---', 'a: 1', ...DIAGRAMM, 'Text'].join('\n');
    let state = EditorState.create({ doc: ohneEnde, extensions: [lageErweiterung] });
    blockBei(state, 'diagramm', 3);
    // Zeile «Text» (7) um eine Grenze ergänzt.
    state = state.update({ changes: { from: state.doc.length, insert: '\n---' } }).state;
    vergleiche(state, fehler);
    // Und wieder entfernt.
    state = state.update({
      changes: { from: state.doc.line(7).to, to: state.doc.length },
    }).state;
    vergleiche(state, fehler);
    expect(fehler).toEqual([]);
  });
});
