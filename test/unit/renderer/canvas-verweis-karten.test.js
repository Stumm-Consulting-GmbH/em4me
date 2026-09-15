// @vitest-environment jsdom
// 4T-001747 (Epic 3E-000289): Prüffälle der Verweis-Karten auf der
// Canvas-Fläche — Anzeige über den Einbettungs-Weg, Kopfzeile, Auffrischung,
// Befund «Ziel nicht gefunden», die Leiste am gewählten Element, das Anlegen
// über Kommando und Kontextmenü, das Öffnen des Ziels und der Nur-Ansicht-Zustand.
//
// Geprüft wird an der zusammengesetzten Ansicht (`createCanvasView`) und nicht
// an einem der drei Module allein: Der Gegenstand ist die Handlung des Nutzers,
// und die beginnt an einem gezeichneten Element. Der Schreibweg endet hier an
// einem Rückruf-Doppel — die Einbettung in das Dokument prüft
// canvas-pane.test.js (Muster canvas-formen.test.js).
//
// **Der Abruf des Ziels ist gestellt.** Er läuft im Programm über die
// Prozess-Brücke (`api.readEmbedFile`); die Ansicht bekommt ihn als Rückruf
// hereingereicht, und genau dort setzt diese Datei an. Dass die Antwort
// **asynchron** kommt, ist der Kern der meisten Fälle: Die Karte steht sofort
// und füllt sich nach.
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canvasFlaechenTitel,
  parseCanvasFence,
  serializeCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';
import {
  frischeVerweisKarten,
  zerlegeZiel,
} from '../../../src/renderer/modules/canvas/canvas-verweis-anzeige.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Eine Fläche mit allen drei Karten-Formen der Stufe 3: eine gewöhnliche
// Text-Karte, eine Verweis-Karte mit Beschriftung und Anker und eine
// Verweis-Karte ohne Beschriftung, deren Ziel sich nicht auflösen lässt.
const RUMPF = [
  '!karte k1 x=-300 y=-100 b=200 h=100',
  'Erste',
  '',
  '!karte k2 x=100 y=-100 b=200 h=100 doc="Konzepte/Import.md#Zielbild"',
  'Der Import',
  'in zwei Zeilen',
  '',
  '!karte k3 x=100 y=100 b=200 h=100 doc="Fehlt.md"',
].join('\n');

const ZIEL_PFAD = 'C:/Bereich/Konzepte/Import.md';
const ANTWORT = {
  ok: true,
  path: ZIEL_PFAD,
  displayPath: 'Import.md',
  content: '## Zielbild\n\nDer Import liest künftig mehrere Quellen.',
};

function flaechenAus(rumpf) {
  const model = parseCanvasFence(rumpf);
  return [{ model, titel: canvasFlaechenTitel(model), startZeile: 1, nummer: 1, rumpf }];
}

// Ein Durchlauf der Mikro-Aufgaben: Der Abruf ist ein Promise, und die Antwort
// trifft frühestens im nächsten Zyklus ein.
const warte = () => new Promise((fertig) => setTimeout(fertig, 0));

function baueAnsicht(rumpf = RUMPF, opts = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const geschrieben = [];
  const abrufe = [];
  const menue = { offen: false, eintraege: [] };
  const zustand = { aenderbar: opts.aenderbar !== false };
  const antworten = opts.antworten || { 'Konzepte/Import.md': ANTWORT };
  const geoeffnet = [];
  const renderMarkdown = vi.fn((text) => `<p>${text}</p>`);
  const nachRender = vi.fn();
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown,
    nachRender,
    istAenderbar: () => zustand.aenderbar,
    beiAenderung: (daten) => {
      geschrieben.push(daten);
      return true;
    },
    leseEinbettung: (basis, ziel, anker) => {
      abrufe.push({ basis, ziel, anker });
      const antwort = antworten[ziel];
      return Promise.resolve(antwort || { ok: false, error: 'not found' });
    },
    oeffneZiel: (doc) => {
      geoeffnet.push(doc);
      return Promise.resolve(true);
    },
    zielVorschlaege: () => Promise.resolve(opts.vorschlaege || ['Import', 'Zielbild']),
    // 4T-001747 (Abnahme-Befund vom 2026-09-14): Die zurückgestellte
    // Neu-Übergabe wird nach der Handlung aus dem aktuellen Dokument geholt.
    // Ohne Angabe bleibt es beim Schnappschuss — der Stand der übrigen Fälle.
    neuUebergeben: opts.neuUebergeben,
    zeigeKontextmenue: ({ eintraege }) => {
      Object.assign(menue, { offen: true, eintraege });
    },
    schliesseKontextmenue: () => {
      menue.offen = false;
    },
    kontextmenueOffen: () => menue.offen,
  });
  const buehne = container.querySelector('.canvas-buehne');
  buehne.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    right: 800,
    bottom: 400,
  });
  view.setFlaechen(flaechenAus(rumpf), { pfad: 'C:/Bereich/Fläche.md' });
  // Ohne Einpassung sind Klick-Punkt und Flächen-Koordinate dieselbe Zahl.
  view.reset();
  return {
    container,
    view,
    buehne,
    geschrieben,
    abrufe,
    menue,
    zustand,
    geoeffnet,
    renderMarkdown,
    nachRender,
  };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const kopfVon = (c, id) => karteMit(c, id).querySelector('.canvas-karte-kopf');
const koerperVon = (c, id) => karteMit(c, id).querySelector('.canvas-karte-koerper');
const leiste = (c) => c.querySelector('.canvas-karte-leiste');
const zielFeld = (el) => (el ? el.querySelector('.canvas-karte-verweis-feld') : null);
const abfrage = (c) => c.querySelector('.canvas-karte-ziel-eingabe');

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key) => new window.KeyboardEvent('keydown', { bubbles: true, key });

const letztesModell = (geschrieben) => parseCanvasFence(geschrieben[geschrieben.length - 1].rumpf);
const elementAus = (geschrieben, id) =>
  letztesModell(geschrieben).elemente.find((el) => el.id === id);
const kennungen = (menue) => menue.eintraege.filter((e) => !e.separator).map((e) => e.dataId);
const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();

function waehle(container, id) {
  karteMit(container, id).dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
  window.dispatchEvent(maus('mouseup', { clientX: 0, clientY: 0 }));
}

describe('Verweis-Karten: Anzeige über den Einbettungs-Weg (AK1 bis AK3)', () => {
  it('AK1: die Verweis-Karte trägt Kopfzeile und eigenen Körper, die Text-Karte nicht', () => {
    const { container } = baueAnsicht();
    expect(karteMit(container, 'k2').classList.contains('canvas-karte-verweis')).toBe(true);
    expect(kopfVon(container, 'k2')).not.toBeNull();
    expect(koerperVon(container, 'k2')).not.toBeNull();
    expect(karteMit(container, 'k1').classList.contains('canvas-karte-verweis')).toBe(false);
    expect(kopfVon(container, 'k1')).toBeNull();
  });

  it('AK1: der Abruf geht mit Dokument-Pfad, Ziel und Anker an den Einbettungs-Weg', () => {
    const { abrufe } = baueAnsicht();
    const treffer = abrufe.find((a) => a.ziel === 'Konzepte/Import.md');
    expect(treffer).toBeTruthy();
    expect(treffer.basis).toBe('C:/Bereich/Fläche.md');
    expect(treffer.anker).toBe('Zielbild');
  });

  it('AK1: der Körper bleibt leer, bis die Antwort da ist, und füllt sich danach', async () => {
    // Der Abruf ist asynchron, die Zeichnung der Fläche ist es nicht: Die Karte
    // steht sofort und darf nicht auf die Antwort warten.
    const { container } = baueAnsicht();
    expect(koerperVon(container, 'k2').textContent).toBe('');
    await warte();
    expect(koerperVon(container, 'k2').textContent).toContain('mehrere Quellen');
  });

  it('AK1: der Körper kommt nicht aus dem eigenen Text der Karte', async () => {
    const { container } = baueAnsicht();
    await warte();
    expect(koerperVon(container, 'k2').textContent).not.toContain('in zwei Zeilen');
  });

  it('AK2: gerendert wird mit unterdrückter Frontmatter-Zeile und dem Pfad des Ziels', async () => {
    const { renderMarkdown, nachRender } = baueAnsicht();
    await warte();
    const aufruf = renderMarkdown.mock.calls.find((c) => c[1] === ZIEL_PFAD);
    expect(aufruf, 'kein Render-Aufruf mit dem aufgelösten Ziel-Pfad').toBeTruthy();
    expect(aufruf[2]).toEqual({ frontmatterBlock: false });
    // Der Schritt-Satz des erzeugten Teilbaums läuft mit dem Pfad der
    // EINGEBETTETEN Datei (Wächter 4T-001130).
    expect(nachRender.mock.calls.some((c) => c[1] === ZIEL_PFAD)).toBe(true);
  });

  it('AK2/AK8: der Körper trägt den aufgelösten Ziel-Pfad als Einbettungs-Basis', async () => {
    const { container } = baueAnsicht();
    await warte();
    expect(koerperVon(container, 'k2').dataset.embedBase).toBe(ZIEL_PFAD);
  });

  it('AK2: der Körper hält keine Kopie — der Rohtext der Karte bleibt ihr eigener Text', async () => {
    const { view, container } = baueAnsicht();
    await warte();
    const model = parseCanvasFence(RUMPF);
    expect(serializeCanvasFence(model)).toBe(RUMPF);
    expect(view.getStats().karten).toBe(3);
    expect(koerperVon(container, 'k2').getAttribute('contenteditable')).toBeNull();
  });

  it('AK3: die Kopfzeile nennt die Beschriftung, Zeilenumbrüche als Leerzeichen', () => {
    const { container } = baueAnsicht();
    expect(kopfVon(container, 'k2').textContent).toBe('Der Import in zwei Zeilen');
  });

  it('AK3: ohne Beschriftung steht erst das Ziel und danach der aufgelöste Name', async () => {
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 doc="Konzepte/Import.md#Zielbild"';
    const { container } = baueAnsicht(rumpf);
    expect(kopfVon(container, 'k9').textContent).toBe('Konzepte/Import.md#Zielbild');
    await warte();
    expect(kopfVon(container, 'k9').textContent).toBe('Import.md#Zielbild');
    expect(kopfVon(container, 'k9').querySelector('.canvas-karte-kopf-anker').textContent).toBe(
      '#Zielbild',
    );
  });

  it('AK1: das Stilblatt stellt Kopfzeile und Körper untereinander', () => {
    // jsdom rechnet kein Layout; geprüft wird die Regel, die es im Programm tut.
    const css = lies('src/renderer/styles/canvas.css');
    const regel = /\.canvas-karte-verweis \{([^}]*)\}/.exec(css);
    expect(regel, 'Regel .canvas-karte-verweis nicht gefunden').not.toBeNull();
    expect(regel[1]).toMatch(/flex-direction:\s*column/);
  });

  it('eine Antwort zu einer inzwischen verschwundenen Karte wird verworfen', async () => {
    // Der Abruf läuft, die Fläche wird neu gezeichnet: Die alte Karte ist aus
    // dem Baum, und ihre Antwort darf nirgends mehr landen.
    const { container, view } = baueAnsicht();
    const alterKoerper = koerperVon(container, 'k2');
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nNeu'), {
      pfad: 'C:/Bereich/Fläche.md',
    });
    await warte();
    expect(alterKoerper.isConnected).toBe(false);
    expect(alterKoerper.textContent).toBe('');
    expect(container.querySelectorAll('.canvas-karte-verweis')).toHaveLength(0);
  });

  it('das Nachfüllen lässt Auswahl und gezeichnete Karte unangetastet', async () => {
    const { container, view } = baueAnsicht();
    waehle(container, 'k2');
    const knoten = karteMit(container, 'k2');
    await warte();
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    // Dieselbe Karte, nicht eine neu gezeichnete: Ein Neuzeichnen verlöre den
    // Scroll-Stand des Körpers.
    expect(karteMit(container, 'k2')).toBe(knoten);
  });
});

describe('Verweis-Karten: Befund «Ziel nicht gefunden» (AK7)', () => {
  it('AK7: die Karte bleibt stehen und nennt ihr Ziel', async () => {
    const { container } = baueAnsicht();
    await warte();
    const koerper = koerperVon(container, 'k3');
    expect(koerper.classList.contains('canvas-karte-verweis-fehlt')).toBe(true);
    expect(koerper.textContent).toBe(
      de['canvas.verweisNichtGefunden'].replace('{ziel}', 'Fehlt.md'),
    );
    expect(karteMit(container, 'k3')).not.toBeNull();
  });

  it('AK7: der Befund wirft nicht und schreibt nichts', async () => {
    const { geschrieben, view } = baueAnsicht();
    await warte();
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
  });

  it('AK7: der Rohtext übersteht den Rundlauf byte-gleich', async () => {
    baueAnsicht();
    await warte();
    expect(serializeCanvasFence(parseCanvasFence(RUMPF))).toBe(RUMPF);
  });

  it('ohne Abruf-Rückruf zeigt die Karte denselben Befund', () => {
    // Der Stand einer Einbettung ohne diesen Weg — und der Normalfall der
    // reinen Zeichnungs-Prüffälle.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = createCanvasView(container, { t: tStub, renderMarkdown: (x) => `<p>${x}</p>` });
    view.setFlaechen(flaechenAus(RUMPF), {});
    expect(koerperVon(container, 'k2').classList.contains('canvas-karte-verweis-fehlt')).toBe(true);
    view.destroy();
  });
});

describe('Verweis-Karten: Auffrischung bei Puffer-Änderung (AK8)', () => {
  it('AK8: die Karte des geänderten Ziels wird neu gefüllt', async () => {
    const antworten = { 'Konzepte/Import.md': ANTWORT };
    const { container, abrufe } = baueAnsicht(RUMPF, { antworten });
    await warte();
    const vorher = abrufe.length;
    antworten['Konzepte/Import.md'] = { ...ANTWORT, content: 'Frisch geschrieben.' };
    await frischeVerweisKarten(container, ZIEL_PFAD);
    expect(abrufe.length).toBe(vorher + 1);
    expect(koerperVon(container, 'k2').textContent).toContain('Frisch geschrieben');
  });

  it('AK8: eine andere Datei frischt die Karte nicht auf', async () => {
    const { container, abrufe } = baueAnsicht();
    await warte();
    const vorher = abrufe.length;
    expect(await frischeVerweisKarten(container, 'C:/Bereich/Andere.md')).toBe(0);
    expect(abrufe.length).toBe(vorher);
  });

  it('AK8: der Auffrisch-Weg des Bestands ruft die Karten mit auf', () => {
    // Gemessen am Bestand: `refreshEmbedsOfTarget` sucht über jedem Embed-Körper
    // die Hülle `.wiki-embed` und fände an einer Karte keine. Ohne diesen
    // Anstoß bliebe die Karte auf ihrem alten Stand.
    const quelle = lies('src/renderer/modules/render-mermaid.js');
    expect(quelle).toContain("from './canvas/canvas-verweis-anzeige.js'");
    expect(quelle).toContain('await frischeVerweisKarten(wurzel, zielPfad)');
  });
});

describe('Verweis-Karten: Leiste am gewählten Element (AK5, AK6)', () => {
  it('AK5: die gewählte Karte bekommt eine Leiste mit Ziel-Feld', () => {
    const { container } = baueAnsicht();
    expect(leiste(container)).toBeNull();
    waehle(container, 'k2');
    expect(leiste(container)).not.toBeNull();
    expect(zielFeld(leiste(container)).value).toBe('Konzepte/Import.md#Zielbild');
  });

  it('AK5: Öffnen und Entfernen erscheinen nur an einer Karte mit Ziel', () => {
    const { container } = baueAnsicht();
    waehle(container, 'k1');
    const aktionen = (c) =>
      [...leiste(c).querySelectorAll('.canvas-karte-knopf')].map((k) => k.dataset.aktion);
    expect(aktionen(container)).toEqual([]);
    waehle(container, 'k2');
    expect(aktionen(container)).toEqual(['oeffnen', 'entfernen']);
    // 4T-001748: Das Feld «Bild» steht an jeder Karte daneben, sein
    // Entfernen-Knopf nur an einer Bild-Karte.
    expect(leiste(container).querySelector('.canvas-karte-bild-feld')).not.toBeNull();
  });

  it('AK5: das Feld setzt den Verweis und macht aus der Text-Karte eine Verweis-Karte', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k1');
    const feld = zielFeld(leiste(container));
    feld.value = 'Konzepte/Import.md';
    feld.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(geschrieben).toHaveLength(1);
    expect(elementAus(geschrieben, 'k1').doc).toBe('Konzepte/Import.md');
    // Die Beschriftung bleibt: Sie ist der eigene Inhalt der Karte und hing nie
    // am Verweis.
    expect(elementAus(geschrieben, 'k1').inhalt).toContain('Erste');
  });

  it('AK5: «Verweis entfernen» macht die Karte wieder zur Text-Karte und behält den Text', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    leiste(container)
      .querySelector('.canvas-karte-knopf[data-aktion="entfernen"]')
      .dispatchEvent(maus('click'));
    expect(geschrieben).toHaveLength(1);
    expect(elementAus(geschrieben, 'k2').doc).toBeUndefined();
    expect(elementAus(geschrieben, 'k2').inhalt).toContain('Der Import');
    // Die Zeile trägt keine Angabe mehr; die Karte daneben behält ihre.
    expect(geschrieben[0].rumpf.split('\n')).toContain('!karte k2 x=100 y=-100 b=200 h=100');
    expect(geschrieben[0].rumpf).toContain('doc="Fehlt.md"');
  });

  it('AK5: ein unveränderter Wert schreibt nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = zielFeld(leiste(container));
    feld.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(geschrieben).toHaveLength(0);
  });

  it('Escape im Feld stellt den geschriebenen Stand wieder her und schreibt nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = zielFeld(leiste(container));
    feld.value = 'Halb getippt';
    feld.dispatchEvent(taste('Escape'));
    expect(feld.value).toBe('Konzepte/Import.md#Zielbild');
    expect(geschrieben).toHaveLength(0);
  });

  it('`Entf` im Feld löscht die Karte nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    zielFeld(leiste(container)).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    expect(karteMit(container, 'k2')).not.toBeNull();
  });

  it('AK6: «Öffnen» reicht das Ziel samt Anker an den Öffnen-Weg', () => {
    const { container, geoeffnet } = baueAnsicht();
    waehle(container, 'k2');
    leiste(container)
      .querySelector('.canvas-karte-knopf[data-aktion="oeffnen"]')
      .dispatchEvent(maus('click'));
    expect(geoeffnet).toEqual(['Konzepte/Import.md#Zielbild']);
  });

  it('die Vorschläge des Bereichs-Index landen in der Liste des Feldes', async () => {
    const { container } = baueAnsicht();
    waehle(container, 'k2');
    await warte();
    const werte = [...leiste(container).querySelectorAll('datalist option')].map((o) => o.value);
    expect(werte).toEqual(['Import', 'Zielbild']);
  });

  it('ein Klick in die Leiste zieht weder Karte noch Fläche', () => {
    const { container, view } = baueAnsicht();
    waehle(container, 'k2');
    const vorher = view.getStats();
    zielFeld(leiste(container)).dispatchEvent(
      maus('mousedown', { button: 0, clientX: 40, clientY: 40 }),
    );
    window.dispatchEvent(maus('mousemove', { clientX: 140, clientY: 90 }));
    window.dispatchEvent(maus('mouseup', { clientX: 140, clientY: 90 }));
    expect(view.getStats().tx).toBe(vorher.tx);
    expect(karteMit(container, 'k2').style.left).toBe('100px');
  });
});

describe('Verweis-Karten: Anlegen über Kommando und Kontextmenü (AK4)', () => {
  it('AK4: das Kommando fragt zuerst das Ziel ab und legt noch keine Karte an', () => {
    const { container, view, geschrieben } = baueAnsicht();
    expect(view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } })).toBe(true);
    expect(abfrage(container)).not.toBeNull();
    expect(geschrieben).toHaveLength(0);
  });

  it('AK4: Enter legt die Karte mit ihrem Ziel an, mittig unter der Stelle', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    const feld = zielFeld(abfrage(container));
    feld.value = 'Konzepte/Import.md#Zielbild';
    feld.dispatchEvent(taste('Enter'));
    expect(geschrieben).toHaveLength(1);
    const alt = new Set(['k1', 'k2', 'k3']);
    const neu = letztesModell(geschrieben).elemente.find(
      (el) => el.art === 'karte' && !alt.has(el.id),
    );
    expect(elementAus(geschrieben, neu.id).doc).toBe('Konzepte/Import.md#Zielbild');
    expect(neu.x).toBe(-120);
    expect(neu.y).toBe(-60);
    expect(abfrage(container)).toBeNull();
  });

  it('AK4: Escape bricht ab, ohne eine Karte zu hinterlassen', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    zielFeld(abfrage(container)).dispatchEvent(taste('Escape'));
    expect(abfrage(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
  });

  it('AK4: ohne Ziel entsteht keine Karte', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    zielFeld(abfrage(container)).dispatchEvent(taste('Enter'));
    expect(geschrieben).toHaveLength(0);
  });

  it('AK4: eine offene Abfrage hält eine Neu-Übergabe zurück', () => {
    // Sonst zeichnete die Live-Aktualisierung die Eingabe weg, in die der
    // Anwender gerade schreibt.
    const { container, view } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nNeu'), {});
    expect(view.getStats().karten).toBe(3);
    expect(abfrage(container)).not.toBeNull();
  });

  it('AK4: das Kontextmenü der Fläche bietet die Verweis-Karte an der Klick-Stelle', () => {
    const { buehne, container, menue } = baueAnsicht();
    buehne.dispatchEvent(maus('contextmenu', { clientX: 0, clientY: 0 }));
    expect(kennungen(menue)).toContain('canvas-add-link-card');
    loese(menue, 'canvas-add-link-card');
    expect(abfrage(container)).not.toBeNull();
  });
});

describe('Verweis-Karten: Doppelklick und Kontextmenü der Karte (AK6, B6)', () => {
  it('AK6: der Doppelklick auf den Körper öffnet das Ziel', async () => {
    const { container, geoeffnet } = baueAnsicht();
    await warte();
    koerperVon(container, 'k2').dispatchEvent(maus('dblclick'));
    expect(geoeffnet).toEqual(['Konzepte/Import.md#Zielbild']);
    expect(container.querySelector('.canvas-karte-eingabe')).toBeNull();
  });

  it('der Doppelklick auf die Kopfzeile bearbeitet die Beschriftung', () => {
    const { container } = baueAnsicht();
    kopfVon(container, 'k2').dispatchEvent(maus('dblclick'));
    const eingabe = container.querySelector('.canvas-karte-eingabe');
    expect(eingabe).not.toBeNull();
    expect(eingabe.value).toContain('Der Import');
  });

  it('an der Text-Karte bleibt der Doppelklick die Rohtext-Eingabe', () => {
    const { container, geoeffnet } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('dblclick'));
    expect(container.querySelector('.canvas-karte-eingabe')).not.toBeNull();
    expect(geoeffnet).toHaveLength(0);
  });

  it('B6: das Kontextmenü der Karte trägt die drei Verweis-Einträge', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(kennungen(menue)).toEqual([
      'canvas-card-edit',
      'canvas-card-delete',
      'canvas-card-link-set',
      // 4T-001748: «Bild setzen…» steht neben «Verweis setzen…».
      'canvas-card-image-set',
      'canvas-card-link-open',
      'canvas-card-link-remove',
      'canvas-stack-ganzNachVorn',
      'canvas-stack-eineStufeVor',
      'canvas-stack-eineStufeZurueck',
      'canvas-stack-ganzNachHinten',
    ]);
    // Der Block steht hinter einem Trenner.
    const vorSetzen =
      menue.eintraege[menue.eintraege.findIndex((e) => e.dataId === 'canvas-card-link-set') - 1];
    expect(vorSetzen.separator).toBe(true);
  });

  it('B6: ohne Ziel bietet das Menü allein «Verweis setzen…» an', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(kennungen(menue)).toContain('canvas-card-link-set');
    expect(kennungen(menue)).not.toContain('canvas-card-link-open');
    expect(kennungen(menue)).not.toContain('canvas-card-link-remove');
  });

  it('B6: die Einträge rufen dieselben Handlungen wie die Leiste', () => {
    const { container, menue, geoeffnet, geschrieben } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    loese(menue, 'canvas-card-link-open');
    expect(geoeffnet).toEqual(['Konzepte/Import.md#Zielbild']);
    loese(menue, 'canvas-card-link-remove');
    expect(elementAus(geschrieben, 'k2').doc).toBeUndefined();
  });

  it('B6: «Verweis setzen…» führt in das Feld der Leiste und nicht in eine zweite Eingabe', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(loese(menue, 'canvas-card-link-set')).toBe(true);
    expect(leiste(container)).not.toBeNull();
    expect(container.querySelectorAll('.canvas-karte-verweis-feld')).toHaveLength(1);
  });
});

describe('Verweis-Karten: Rundlauf und Nur-Ansicht (AK9, AK10)', () => {
  it('AK9: gesetzt, geschrieben, neu gelesen — die Angabe steht wieder da', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k1');
    const feld = zielFeld(leiste(container));
    feld.value = 'Konzepte/Import.md#Zielbild';
    feld.dispatchEvent(new window.Event('change', { bubbles: true }));
    const rumpf = geschrieben[0].rumpf;
    const model = parseCanvasFence(rumpf);
    expect(model.elemente.find((el) => el.id === 'k1').doc).toBe('Konzepte/Import.md#Zielbild');
    // Und der zweite Rundlauf über denselben Rumpf ändert kein Zeichen (G2).
    expect(serializeCanvasFence(model)).toBe(rumpf);
    expect(model.errors).toHaveLength(0);
  });

  it('AK10: im nicht änderbaren Dokument gibt es keine Leiste und kein Anlegen', () => {
    const { container, view, geschrieben } = baueAnsicht(RUMPF, { aenderbar: false });
    waehle(container, 'k2');
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    expect(leiste(container)).toBeNull();
    expect(view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } })).toBe(false);
    expect(abfrage(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
  });

  it('AK10: die Karte zeigt ihren Inhalt, und das Öffnen des Ziels bleibt erlaubt', async () => {
    const { container, geoeffnet } = baueAnsicht(RUMPF, { aenderbar: false });
    await warte();
    expect(koerperVon(container, 'k2').textContent).toContain('mehrere Quellen');
    koerperVon(container, 'k2').dispatchEvent(maus('dblclick'));
    expect(geoeffnet).toEqual(['Konzepte/Import.md#Zielbild']);
  });

  it('AK10: das Kontextmenü erscheint gar nicht', () => {
    const { container, menue } = baueAnsicht(RUMPF, { aenderbar: false });
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(menue.offen).toBe(false);
  });
});

// 4T-001747 (Epic 3E-000289): Abnahme-Befund des Product Owners vom 2026-09-14
// — «Anlegen geht. Verschieben auf dem Canvas geht nicht. Inhalt der Datei wird
// nicht angezeigt. Wenn ich etwas anderes anlege, dann verschwindet die Karte
// wieder.»
//
// **Warum diese Fälle hier stehen und die vorhandenen nichts sahen.** Die Fälle
// darüber messen die Strecke mit einem gestellten Nachbarn: Der Einbettungs-Weg
// ist ein Rückruf, der auf jedes Ziel antwortet, das der Prüffall in seine
// Tabelle geschrieben hat, und die Neu-Übergabe stellt der Prüffall selbst. Die
// drei Ursachen lagen genau an diesen Nahtstellen — an der **Form** des Ziels,
// das an den Auflöser geht, an der **Herkunft** der nachgeholten Neu-Übergabe
// und am **Abbruch** der Ziel-Abfrage. Die Fälle hier greifen jede davon dort,
// wo sie sichtbar ist, ohne die echte Anwendung zu brauchen; die ganze Strecke
// prüft `test/e2e/regression/4t-001747-verweis-karte-anlegen.spec.js`.
describe('Verweis-Karten: Abnahme-Befund vom 2026-09-14', () => {
  it('Befund «Inhalt wird nicht angezeigt»: ein Ziel ohne Endung wird als .md abgerufen', () => {
    // Der Auflöser des Bestands (`embed:read`) prüft die Endung gegen eine
    // Positivliste und weist ein Ziel ohne Markdown-Endung ab; das Wiki-Plugin
    // hängt vor dem Abruf `.md` an. Ohne dieselbe Regel zeigte jede Karte auf
    // einen Dokument-Namen — die übliche Schreibweise — den Befund «Ziel nicht
    // gefunden», obwohl die Datei danebenlag.
    const { abrufe } = baueAnsicht('!karte k9 x=0 y=0 b=200 h=100 doc="Verweis-Test"');
    expect(abrufe.map((a) => a.ziel)).toEqual(['Verweis-Test.md']);
  });

  it('der geschriebene Text bleibt daneben stehen — Kopfzeile und Befund nennen ihn', async () => {
    const { container } = baueAnsicht('!karte k9 x=0 y=0 b=200 h=100 doc="Verweis-Test"');
    expect(kopfVon(container, 'k9').textContent).toBe('Verweis-Test');
    await warte();
    expect(koerperVon(container, 'k9').textContent).toContain('Verweis-Test');
    expect(koerperVon(container, 'k9').textContent).not.toContain('.md');
  });

  it('die Zerlegung liefert Ziel, Anker und Abruf-Pfad getrennt', () => {
    expect(zerlegeZiel('Verweis-Test')).toEqual({
      ziel: 'Verweis-Test',
      anker: '',
      pfad: 'Verweis-Test.md',
    });
    expect(zerlegeZiel('Konzepte/Import.md#Zielbild')).toEqual({
      ziel: 'Konzepte/Import.md',
      anker: 'Zielbild',
      pfad: 'Konzepte/Import.md',
    });
    // Eine fremde Endung bleibt, wie sie ist: `doc=` meint ein Markdown-Dokument,
    // und der Auflöser soll sie weiterhin abweisen statt sie umzudeuten.
    expect(zerlegeZiel('Bild.png').pfad).toBe('Bild.png');
    expect(zerlegeZiel('').pfad).toBe('');
  });

  it('Befund «Verschieben geht nicht»: die zurückgestellte Übergabe kommt aus dem Jetzt', () => {
    // Während des Zuges fällt der Takt der Live-Aktualisierung an und wird
    // zurückgestellt. Ihn danach aus seinem Schnappschuss anzuwenden setzte die
    // Fläche auf den Stand VOR dem Zug zurück — die Karte sprang im Moment des
    // Loslassens an ihren alten Platz, und mit ihr kehrte der veraltete `rumpf`
    // zurück, an dem die nächste Handlung scheiterte.
    const neuUebergeben = vi.fn();
    const { container, view, geschrieben } = baueAnsicht(RUMPF, { neuUebergeben });
    karteMit(container, 'k1').dispatchEvent(
      maus('mousedown', { button: 0, clientX: 0, clientY: 0 }),
    );
    window.dispatchEvent(maus('mousemove', { clientX: 50, clientY: 30 }));
    // Die Live-Aktualisierung fällt mitten im Zug an und wird zurückgestellt.
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nVeralteter Stand'), {});
    expect(view.getStats().karten).toBe(3);
    window.dispatchEvent(maus('mouseup', { clientX: 50, clientY: 30 }));
    // Geschrieben wurde die neue Lage …
    expect(elementAus(geschrieben, 'k1').x).toBe(-250);
    // … und der veraltete Schnappschuss ist nicht angewendet worden.
    expect(view.getStats().karten).toBe(3);
    expect(karteMit(container, 'k1').style.left).toBe('-250px');
    expect(neuUebergeben).toHaveBeenCalledTimes(1);
  });

  it('Befund «Karte verschwindet»: der Fokus-Verlust bricht die Ziel-Abfrage ab', async () => {
    // Ohne den Abbruch blieb das Eingabe-Feld stehen, wenn der Anwender statt
    // `Enter` danebenklickte — es sah aus wie die Karte, die es anlegen sollte,
    // liess sich nicht ziehen, zeigte nichts an und verschwand beim nächsten
    // Zeichnen der Fläche. Schwerer wog, dass mit ihm die Fläche gesperrt blieb:
    // `blockiert()` war dauerhaft wahr, und keine Neu-Übergabe kam mehr durch.
    const { container, view, geschrieben } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    const feld = zielFeld(abfrage(container));
    feld.value = 'Verweis-Test';
    feld.dispatchEvent(new window.FocusEvent('blur'));
    await warte();
    expect(abfrage(container)).toBeNull();
    // Ein Abbruch ist ein Abbruch: keine Karte, nichts geschrieben.
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
  });

  it('nach dem Abbruch nimmt die Fläche eine Neu-Übergabe wieder an', async () => {
    const { container, view } = baueAnsicht();
    view.verweisKarteAnlegen({ punkt: { x: 0, y: 0 } });
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nNeu'), {});
    expect(view.getStats().karten).toBe(3);
    zielFeld(abfrage(container)).dispatchEvent(new window.FocusEvent('blur'));
    await warte();
    expect(view.getStats().karten).toBe(1);
  });
});
