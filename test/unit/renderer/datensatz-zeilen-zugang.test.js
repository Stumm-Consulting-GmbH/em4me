// @vitest-environment jsdom
// 4T-001792 (Epic 3E-000255, AK6): Der Zugang von der Datensatz-Zeile zu den
// Änderungsbelegen — Variante 1 der Entscheidung des Product Owners vom
// 2026-09-18, eine Schaltfläche am Zeilen-Anfang.
//
// **Der Block kommt aus der Pipeline und wird nicht von Hand gebaut** (Muster
// `canvas-block-zustand.test.js`). Ein selbst geschriebenes Markup prüfte sonst
// eine Form, die es im Betrieb nicht gibt, und genau die Attribute, an denen
// die Bedienung hängt — `data-rec-id` an der Zeile, `tabindex` an der
// Schaltfläche —, wären die ersten, die auseinanderliefen.
//
// **Die Umgebung ist eingereicht und nicht nachgebaut.** Das Modul importiert
// aus Ordner-Zyklus-Gründen nichts (Begründung in seinem Kopf); die Prüffälle
// nutzen dieselbe Naht, die `app-init.js` bedient, und messen an ihr, was der
// Zugang tatsächlich öffnen würde.
//
// **Was hier NICHT geprüft wird und warum:** die Sichtbarkeit der Schaltfläche.
// Sie hängt an `opacity` im Stilblatt, und jsdom kennt die CSS-Kaskade nicht;
// den Nachweis führt der End-zu-End-Fall `funktionen/beleg-ansicht.spec.js` an
// der laufenden Anwendung.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyRecordRowAccess,
  initRecordRowAccess,
  istAktiverOrt,
  spalteZu,
  tabellenPfadZu,
} from '../../../src/renderer/modules/database/datensatz-zeilen-zugang.js';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';

// Zwei Datensätze mit Kennung, einer ohne — die drei Lagen, die die
// Aktions-Spalte unterscheiden muss.
const DOKUMENT = [
  '---',
  'db-table:',
  '  fields:',
  '    - name: Name',
  '    - name: Ort',
  '---',
  '',
  '# Kunden',
  '',
  '```perspective-records',
  '|- id="r-00001"',
  '| Anna Muster',
  '| Basel',
  '|- id="r-00002"',
  '| Beat Beispiel',
  '| Bern',
  '|-',
  '| Ohne Kennung',
  '| Zug',
  '```',
  '',
].join('\n');

const PFAD = 'C:/Bereich/Kunden.md';

// Aufrufe des eingereichten Einstiegs: [pfad, kennung].
let geoeffnet = [];
// Aktiver Reiter je Spalte; die Prüffälle setzen ihn um.
let reiter = [];
// 4T-001939: Aufrufe der beiden neuen Einstiege — Maske [pfad, kennung] und
// Neuanlage [pfad].
let masken = [];
let neuanlagen = [];

function setzeUmgebung() {
  initRecordRowAccess({
    aktivesDokument: (paneIdx) => reiter[paneIdx] || null,
    oeffneBelege: (pfad, kennung) => geoeffnet.push([pfad, kennung]),
    oeffneMaske: (pfad, kennung) => masken.push([pfad, kennung]),
    neuerDatensatz: (pfad) => neuanlagen.push([pfad]),
  });
}

/**
 * Baut eine Spalten-Gruppe mit dem gerenderten Dokument.
 *
 * `ort` benennt die Hülle, in welche der gerenderte Inhalt kommt, und trifft
 * damit genau die Frage aus Bauplan Z4:
 *   'lese'      der gerenderte Haupt-Container der Spalte
 *   'live'      der Haupt-Editor der Spalte (Block-Widget des Live-Modus)
 *   'einbettung' eine Wiki-Einbettung IM Haupt-Container
 *   'notiz'     die Vorschau des Notiz-Panels in der Seitenleiste
 *   'system'    eine System-Seite
 *   'canvas'    eine Karte der Canvas-Fläche
 */
function baueSpalte(ort, paneIdx = 0) {
  const html = renderMarkdown(DOKUMENT, 'de');
  const gruppe = document.createElement('section');
  gruppe.className = 'pane-group';
  gruppe.dataset.pane = String(paneIdx);
  const inhalt = document.createElement('div');
  inhalt.className = 'content';
  gruppe.appendChild(inhalt);
  document.body.appendChild(gruppe);

  const huelle = (klassen, elternKlassen) => {
    const eltern = document.createElement('section');
    eltern.className = elternKlassen;
    const kind = document.createElement('div');
    kind.className = klassen;
    eltern.appendChild(kind);
    inhalt.appendChild(eltern);
    return kind;
  };

  let ziel;
  if (ort === 'lese') ziel = huelle('markdown-body', 'pane pane-rendered');
  else if (ort === 'live') {
    const editor = huelle('cm-editor', 'pane pane-source');
    ziel = document.createElement('div');
    ziel.className = 'cm-live-block markdown-body';
    editor.appendChild(ziel);
  } else if (ort === 'einbettung') {
    const body = huelle('markdown-body', 'pane pane-rendered');
    ziel = document.createElement('div');
    ziel.className = 'wiki-embed-md-body markdown-body';
    body.appendChild(ziel);
  } else if (ort === 'notiz') ziel = huelle('notes-preview markdown-body', 'pane-sidebar');
  else if (ort === 'system') ziel = huelle('markdown-body', 'pane pane-system');
  else if (ort === 'canvas') ziel = huelle('markdown-body', 'pane pane-canvas');
  else throw new Error(`unbekannter Ort: ${ort}`);

  ziel.innerHTML = html;
  return ziel;
}

const blockIn = (container) => container.querySelector('.perspective-records');
const knoepfeIn = (container) => Array.from(container.querySelectorAll('.prc-history-btn'));

function ereignis(el, art, angaben = {}) {
  const ev =
    art === 'keydown'
      ? new window.KeyboardEvent(art, { bubbles: true, cancelable: true, ...angaben })
      : new window.MouseEvent(art, { bubbles: true, cancelable: true, button: 0, ...angaben });
  el.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = '';
  geoeffnet = [];
  masken = [];
  neuanlagen = [];
  reiter = [
    { path: PFAD, viewMode: 'rendered' },
    { path: 'C:/Bereich/Andere.md', viewMode: 'rendered' },
  ];
  setzeUmgebung();
});

describe('AK6: der Zugang wirkt in der Lese-Ansicht', () => {
  it('öffnet die Belege mit dem Pfad der Tabelle und der Kennung der Zeile', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const knopf = knoepfeIn(container)[0];
    ereignis(knopf, 'click');
    expect(geoeffnet).toEqual([[PFAD, 'r-00001']]);
  });

  it('nimmt die Kennung der angeklickten Zeile und nicht die der ersten', () => {
    // Der tragende Teil: Die Kennung steht an der ZEILE, die Schaltfläche liest
    // sie von dort. Eine Verwechslung zeigte dem Anwender die Geschichte eines
    // fremden Datensatzes — falsch, aber nicht als falsch erkennbar.
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    ereignis(knoepfeIn(container)[1], 'click');
    expect(geoeffnet).toEqual([[PFAD, 'r-00002']]);
  });

  it('nimmt den Pfad der Spalte, in der der Block steht', () => {
    const container = baueSpalte('lese', 1);
    applyRecordRowAccess(container);
    ereignis(knoepfeIn(container)[0], 'click');
    expect(geoeffnet).toEqual([['C:/Bereich/Andere.md', 'r-00001']]);
    expect(spalteZu(blockIn(container))).toBe(1);
  });

  it('gibt einer Zeile ohne Kennung keine Schaltfläche', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    // Drei Zeilen, aber nur zwei Schaltflächen: Zu einer Zeile ohne interne
    // Kennung kann es keine Belege geben.
    expect(container.querySelectorAll('tr.prc-row').length).toBe(3);
    expect(knoepfeIn(container).length).toBe(2);
    const ohne = container.querySelectorAll('tr.prc-row')[2];
    expect(ohne.querySelector('td.prc-action').children.length).toBe(0);
  });

  it('ein Klick neben die Schaltfläche bleibt folgenlos und hält nichts auf', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const ev = ereignis(container.querySelector('td.prc-cell'), 'click');
    expect(ev.defaultPrevented).toBe(false);
    expect(geoeffnet).toEqual([]);
  });
});

describe('AK6: der Zugang wirkt in der Live-Ansicht', () => {
  it('öffnet die Belege aus dem Block-Widget des Editors', () => {
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    ereignis(knoepfeIn(container)[0], 'click');
    expect(geoeffnet).toEqual([[PFAD, 'r-00001']]);
  });

  it('fängt mousedown ab, damit der Block nicht zum Quelltext aufklappt', () => {
    // Ohne `preventDefault` setzte der Browser die Schreibmarke in die Fence,
    // und das Block-Widget klappte zum Quelltext auf, noch bevor die Seite
    // offen ist.
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    const ev = ereignis(knoepfeIn(container)[0], 'mousedown');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('und der Klick kommt danach trotzdem an', () => {
    // Die Gegenprobe zum Fall darüber, und der Grund, warum der Zugang auf
    // `click` hört und nicht auf `mousedown`: Ein verhindertes `mousedown`
    // unterdrückt Auswahl und Fokus-Wechsel, nicht das Klick-Ereignis. Wäre es
    // anders, hätte der Zugang in der Live-Ansicht gar keinen Weg.
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    const knopf = knoepfeIn(container)[0];
    ereignis(knopf, 'mousedown');
    ereignis(knopf, 'click');
    expect(geoeffnet).toEqual([[PFAD, 'r-00001']]);
  });
});

describe('Bauplan Z4: wo der Zugang schweigt', () => {
  // Die Erhebung am Bestand (2026-09-18) hat zwei Umgebungen gefunden, in
  // denen ein Datensatz-Block heute als Tabelle erscheint, ohne das Dokument
  // des aktiven Reiters zu zeigen: die Wiki-Einbettung und die Verweis-Karte
  // der Canvas. Beide bringen die Feld-Definition ihrer EIGENEN Datei mit; der
  // Pfad des aktiven Reiters wäre dort der falsche.
  for (const ort of ['einbettung', 'notiz', 'system', 'canvas']) {
    it(`stellt den Block still: ${ort}`, () => {
      const container = baueSpalte(ort);
      applyRecordRowAccess(container);
      const block = blockIn(container);
      expect(istAktiverOrt(block)).toBe(false);
      expect(block.classList.contains('prc-passiv')).toBe(true);
      // Und zwar wirksam: Auch ein Klick, der die ausgeblendete Spalte doch
      // erreichte, öffnet nichts.
      ereignis(knoepfeIn(container)[0], 'click');
      expect(geoeffnet).toEqual([]);
    });
  }

  it('lässt den Block im Haupt-Inhalt und im Haupt-Editor aktiv', () => {
    for (const ort of ['lese', 'live']) {
      document.body.innerHTML = '';
      const container = baueSpalte(ort);
      applyRecordRowAccess(container);
      const block = blockIn(container);
      expect(istAktiverOrt(block)).toBe(true);
      expect(block.classList.contains('prc-passiv')).toBe(false);
    }
  });

  it('bleibt bei einem Reiter ohne Pfad folgenlos', () => {
    // Ein frisch angelegter, nie gespeicherter Reiter. Neben ihm liegt keine
    // Datei, neben der eine Beleg-Datei liegen könnte.
    reiter = [{ path: null, viewMode: 'rendered' }];
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    expect(tabellenPfadZu(blockIn(container))).toBeNull();
    ereignis(knoepfeIn(container)[0], 'click');
    expect(geoeffnet).toEqual([]);
  });

  it('bleibt bei einer System- und einer Handbuch-Seite folgenlos', () => {
    for (const marke of [{ systemPage: 'settings' }, { manualPage: 'start' }]) {
      document.body.innerHTML = '';
      geoeffnet = [];
      reiter = [{ path: null, viewMode: 'rendered', ...marke }];
      const container = baueSpalte('lese');
      applyRecordRowAccess(container);
      expect(tabellenPfadZu(blockIn(container))).toBeNull();
      ereignis(knoepfeIn(container)[0], 'click');
      expect(geoeffnet).toEqual([]);
    }
  });

  it('bleibt ohne eingereichte Umgebung folgenlos statt zu scheitern', () => {
    initRecordRowAccess(null);
    const container = baueSpalte('lese');
    expect(() => applyRecordRowAccess(container)).not.toThrow();
    expect(tabellenPfadZu(blockIn(container))).toBeNull();
    ereignis(knoepfeIn(container)[0], 'click');
    expect(geoeffnet).toEqual([]);
  });
});

describe('Bindung: einmal je Block, aber bei jedem Einhängen angewendet', () => {
  it('bindet den Klick-Pfad nicht zweimal', () => {
    // Die Nachverarbeitung läuft bei JEDEM Einhängen, auch beim Cache-Klon des
    // Live-Widgets. Ein zweiter Zuhörer öffnete die Seite bei einem Klick
    // zweimal.
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    applyRecordRowAccess(container);
    applyRecordRowAccess(container);
    ereignis(knoepfeIn(container)[0], 'click');
    expect(geoeffnet).toHaveLength(1);
  });

  it('bindet den frischen Klon erneut, weil cloneNode die Zuhörer verliert', () => {
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    // Ein Cache-Klon des Live-Widgets: dasselbe Markup samt Bindungs-Marke,
    // aber ohne Zuhörer.
    const klon = container.cloneNode(true);
    container.parentElement.appendChild(klon);
    ereignis(knoepfeIn(klon)[0], 'click');
    expect(geoeffnet).toEqual([]);
  });
});

describe('AK6 und Bauplan Z5: der Tastatur-Weg', () => {
  it('setzt genau EINEN Tabulator-Stopp, auf die erste Zeile mit Kennung', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const knoepfe = knoepfeIn(container);
    expect(knoepfe.map((k) => k.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('stellt den einen Stopp nach einem Cache-Klon wieder her', () => {
    // Der Klon bringt das Markup der Pipeline zurück, und dort trägt JEDE
    // Schaltfläche `-1`. Ohne diesen Schritt wäre die Tabelle nach dem
    // erneuten Einhängen über die Tastatur gar nicht mehr erreichbar.
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    const klon = container.cloneNode(true);
    klon.querySelectorAll('.prc-history-btn').forEach((k) => k.setAttribute('tabindex', '-1'));
    container.parentElement.appendChild(klon);
    applyRecordRowAccess(klon);
    expect(knoepfeIn(klon).map((k) => k.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('wechselt mit Pfeil ab und auf die Zeile und nimmt den Stopp mit', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const [erster, zweiter] = knoepfeIn(container);
    erster.focus();

    const ab = ereignis(erster, 'keydown', { key: 'ArrowDown' });
    expect(ab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(zweiter);
    expect(zweiter.getAttribute('tabindex')).toBe('0');
    expect(erster.getAttribute('tabindex')).toBe('-1');

    ereignis(zweiter, 'keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(erster);
    expect(erster.getAttribute('tabindex')).toBe('0');
  });

  it('springt mit Ende und Pos1 an die Ränder', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const [erster, zweiter] = knoepfeIn(container);
    erster.focus();
    ereignis(erster, 'keydown', { key: 'End' });
    expect(document.activeElement).toBe(zweiter);
    ereignis(zweiter, 'keydown', { key: 'Home' });
    expect(document.activeElement).toBe(erster);
  });

  it('bleibt an den Rändern stehen, statt umzulaufen', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const [erster, zweiter] = knoepfeIn(container);
    erster.focus();
    ereignis(erster, 'keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(erster);
    zweiter.focus();
    ereignis(zweiter, 'keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(zweiter);
  });

  it('lässt die Pfeiltasten unberührt, wenn der Fokus nicht auf dem Griff liegt', () => {
    // Sonst verschluckte die Tabelle das Rollen der Ansicht — eine Bedienung,
    // die der Anwender überall sonst hat.
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const ev = ereignis(container.querySelector('td.prc-cell'), 'keydown', { key: 'ArrowDown' });
    expect(ev.defaultPrevented).toBe(false);
  });
});

// 4T-001939 (Epic 3E-000257, Bauplan B7, AK1 und AK5): die zweite Schaltfläche
// zur Einzel-Maske und der Fuß mit «Neuer Datensatz», über denselben Klick-,
// Maus- und Tastatur-Weg wie die Beleg-Schaltfläche.
const oeffnenIn = (container) => Array.from(container.querySelectorAll('.prc-open-btn'));
const fussIn = (container) => container.querySelector('.prc-new-btn');

describe('4T-001939: der Zugang zur Einzel-Maske', () => {
  it('öffnet die Maske mit Pfad und Kennung der Zeile, in Lese- und Live-Ansicht', () => {
    for (const ort of ['lese', 'live']) {
      document.body.innerHTML = '';
      masken = [];
      const container = baueSpalte(ort);
      applyRecordRowAccess(container);
      ereignis(oeffnenIn(container)[1], 'click');
      expect(masken).toEqual([[PFAD, 'r-00002']]);
      // Die Beleg-Ansicht bleibt dabei unberührt.
      expect(geoeffnet).toEqual([]);
    }
  });

  it('fängt mousedown ab, damit der Block im Live-Modus nicht aufklappt', () => {
    const container = baueSpalte('live');
    applyRecordRowAccess(container);
    expect(ereignis(oeffnenIn(container)[0], 'mousedown').defaultPrevented).toBe(true);
    expect(ereignis(fussIn(container), 'mousedown').defaultPrevented).toBe(true);
  });

  it('eröffnet über den Fuß eine Neuanlage in der Tabelle der Spalte', () => {
    const container = baueSpalte('lese', 1);
    applyRecordRowAccess(container);
    ereignis(fussIn(container), 'click');
    expect(neuanlagen).toEqual([['C:/Bereich/Andere.md']]);
    expect(masken).toEqual([]);
  });

  it('stellt Schaltfläche und Fuß in einer passiven Hülle still', () => {
    const container = baueSpalte('einbettung');
    applyRecordRowAccess(container);
    expect(blockIn(container).classList.contains('prc-passiv')).toBe(true);
    ereignis(oeffnenIn(container)[0], 'click');
    ereignis(fussIn(container), 'click');
    expect(masken).toEqual([]);
    expect(neuanlagen).toEqual([]);
  });

  it('bleibt ohne die neuen Einstiege folgenlos statt zu scheitern', () => {
    initRecordRowAccess({ aktivesDokument: (paneIdx) => reiter[paneIdx] || null });
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    expect(() => ereignis(oeffnenIn(container)[0], 'click')).not.toThrow();
    expect(() => ereignis(fussIn(container), 'click')).not.toThrow();
  });
});

describe('4T-001939: der Tastatur-Weg mit zwei Schaltflächen je Zeile', () => {
  it('hält genau EINEN Tabulator-Stopp über beide Arten, auf der ersten Beleg-Schaltfläche', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const alle = Array.from(container.querySelectorAll('.prc-open-btn, .prc-history-btn'));
    expect(alle.filter((k) => k.getAttribute('tabindex') === '0')).toEqual([
      knoepfeIn(container)[0],
    ]);
    expect(oeffnenIn(container).map((k) => k.getAttribute('tabindex'))).toEqual(['-1', '-1']);
  });

  it('wechselt mit Links und Rechts zwischen den beiden Schaltflächen einer Zeile', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const beleg = knoepfeIn(container)[0];
    const maske = oeffnenIn(container)[0];
    beleg.focus();
    const links = ereignis(beleg, 'keydown', { key: 'ArrowLeft' });
    expect(links.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(maske);
    expect(maske.getAttribute('tabindex')).toBe('0');
    expect(beleg.getAttribute('tabindex')).toBe('-1');
    ereignis(maske, 'keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(beleg);
  });

  it('wechselt mit Ab die Zeile und behält die Art der Schaltfläche', () => {
    const container = baueSpalte('lese');
    applyRecordRowAccess(container);
    const [erste, zweite] = oeffnenIn(container);
    erste.focus();
    ereignis(erste, 'keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(zweite);
    expect(zweite.getAttribute('tabindex')).toBe('0');
    // Der eine Stopp ist gewandert, keine Beleg-Schaltfläche trägt ihn mehr.
    expect(knoepfeIn(container).map((k) => k.getAttribute('tabindex'))).toEqual(['-1', '-1']);
  });
});
