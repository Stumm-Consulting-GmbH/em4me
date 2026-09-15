// @vitest-environment jsdom
// 4T-001748 (Epic 3E-000289): Prüffälle der Bild-Karten auf der Canvas-Fläche —
// Anzeige über den Bild-Einbettungs-Weg, Kopfzeile, die drei Befunde, die
// Leiste am gewählten Element, das Anlegen über Kommando und Kontextmenü, das
// Öffnen über den Anlagen-Weg, der Ausschluss von Verweis und Bild, der
// Nur-Ansicht-Zustand und die Verdrahtung des Kommandos `canvas.addImageCard`.
//
// **Warum eine eigene Datei und nicht ein Kapitel in `canvas-verweis-karten`.**
// Der Gegenstand ist eine eigene Arbeits-Form der Karte mit eigener Anzeige,
// eigenen Befunden und eigenem Kommando; die Prüfdatei der Verweis-Karten stünde
// sonst mit zwei Themen da. Die **gemeinsamen** Bedienteile bleiben dort
// geprüft: Leiste, Abfrage und Kontextmenü sind dieselben Bauteile, und hier
// steht, was die Bild-Angabe daran anders macht.
//
// **Der Bild-Abruf ist gestellt.** Er läuft im Programm über die Prozess-Brücke
// (`api.readEmbedImage`); die Ansicht bekommt ihn als Rückruf hereingereicht,
// und genau dort setzt diese Datei an. Dass die Antwort **asynchron** kommt, ist
// wie bei der Verweis-Karte der Kern der Anzeige-Fälle: Die Karte steht sofort
// und füllt sich nach.
//
// **Die Verdrahtungs-Fälle am Ende stehen hier und nicht in `canvas-pane`**, weil
// jene Prüfdatei mit 786 von 800 Code-Zeilen keinen Block mehr aufnimmt; sie
// bringen die Attrappen der Pane-Einbettung deshalb selbst mit (Muster
// `canvas-pane.test.js`).
//
// Der t-Stub liest die echte de.json, damit ein fehlender Schlüssel auffällt.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../../src/shared/commands/commands.js';
import {
  availabilityContext,
  isAvailable,
} from '../../../src/shared/commands/command-availability.js';
import {
  canvasFlaechenTitel,
  parseCanvasFence,
  serializeCanvasFence,
} from '../../../src/shared/canvas/canvas-core.js';
import { createCanvasView } from '../../../src/renderer/modules/canvas/canvas-view.js';

// Attrappen der Pane-Einbettung — nur für die Verdrahtungs-Fälle ganz unten.
// Die Canvas-Module selbst importieren weder `api` noch `i18n` noch `views`
// (Injektions-Bauweise E4); die Zeichnungs-Fälle darüber sind davon unberührt.
vi.mock('../../../src/renderer/i18n.js', () => ({ t: (key) => key }));
vi.mock('../../../src/renderer/modules/app/api.js', () => ({
  api: { renderMarkdown: (text) => text },
  $: () => null,
}));
const hinweise = [];
vi.mock('../../../src/renderer/modules/views/views.js', () => ({
  showStatusbarHint: (schluessel) => hinweise.push(schluessel),
}));
vi.mock('../../../src/renderer/modules/extensions/extension-lifecycle.js', () => ({
  isExtensionActive: () => true,
}));

const { destroyCanvas, initCanvasPane, legeCanvasBildKarteAn, renderCanvas } =
  await import('../../../src/renderer/modules/canvas/canvas-pane.js');

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Eine Fläche mit einer Text-Karte, einer Bild-Karte mit Beschriftung und einer
// Bild-Karte ohne Beschriftung, deren Datei sich nicht finden lässt.
const RUMPF = [
  '!karte k1 x=-300 y=-100 b=200 h=100',
  'Erste',
  '',
  '!karte k2 x=100 y=-100 b=200 h=100 bild="Anlagen/Skizze.png"',
  'Die Skizze',
  'in zwei Zeilen',
  '',
  '!karte k3 x=100 y=100 b=200 h=100 bild="Fehlt.png"',
].join('\n');

const BILD_PFAD = 'C:/Bereich/Anlagen/Skizze.png';
// Ein winziges, gültiges PNG als Daten-Adresse — genau die Form, in der die
// Bild-Einbettung des Bestands antwortet.
const DATEN =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ANTWORT = { ok: true, path: BILD_PFAD, dataUrl: DATEN };

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
  const antworten = opts.antworten || { 'Anlagen/Skizze.png': ANTWORT };
  const geoeffnet = [];
  const renderMarkdown = vi.fn((text) => `<p>${text}</p>`);
  const view = createCanvasView(container, {
    t: tStub,
    renderMarkdown,
    nachRender: vi.fn(),
    istAenderbar: () => zustand.aenderbar,
    beiAenderung: (daten) => {
      geschrieben.push(daten);
      return true;
    },
    leseBild: (basis, bild) => {
      abrufe.push({ basis, bild });
      return Promise.resolve(antworten[bild] || { ok: false, error: 'not found' });
    },
    leseEinbettung: () => Promise.resolve({ ok: false, error: 'not found' }),
    oeffneBild: (bild) => {
      geoeffnet.push({ art: 'bild', wert: bild });
      return Promise.resolve(true);
    },
    oeffneZiel: (doc) => {
      geoeffnet.push({ art: 'doc', wert: doc });
      return Promise.resolve(true);
    },
    bildVorschlaege: () => Promise.resolve(opts.bildVorschlaege || ['Skizze.png', 'Foto.jpg']),
    zielVorschlaege: () => Promise.resolve(['Import', 'Zielbild']),
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
  };
}

const karteMit = (c, id) => c.querySelector(`.canvas-karte[data-canvas-id="${id}"]`);
const kopfVon = (c, id) => karteMit(c, id).querySelector('.canvas-karte-kopf');
const koerperVon = (c, id) => karteMit(c, id).querySelector('.canvas-karte-koerper');
const bildVon = (c, id) => karteMit(c, id).querySelector('.canvas-karte-bild');
const leiste = (c) => c.querySelector('.canvas-karte-leiste');
const bildFeld = (el) => (el ? el.querySelector('.canvas-karte-bild-feld') : null);
const zielFeld = (el) => (el ? el.querySelector('.canvas-karte-verweis-feld') : null);
const abfrage = (c) => c.querySelector('.canvas-karte-ziel-eingabe');
const knopf = (c, aktion) =>
  leiste(c).querySelector(`.canvas-karte-knopf[data-aktion="${aktion}"]`);
// Die Vorschläge NEBEN einem Feld: seine Liste hängt in derselben Hülle.
const vorschlaegeVon = (feld) =>
  [...feld.closest('.canvas-karte-feld').querySelectorAll('option')].map((o) => o.value);

const maus = (art, opts = {}) => new window.MouseEvent(art, { bubbles: true, ...opts });
const taste = (key) => new window.KeyboardEvent('keydown', { bubbles: true, key });
const aenderung = () => new window.Event('change', { bubbles: true });

const letztesModell = (geschrieben) => parseCanvasFence(geschrieben[geschrieben.length - 1].rumpf);
const elementAus = (geschrieben, id) =>
  letztesModell(geschrieben).elemente.find((el) => el.id === id);
const kennungen = (menue) => menue.eintraege.filter((e) => !e.separator).map((e) => e.dataId);
const loese = (menue, kennung) => menue.eintraege.find((e) => e.dataId === kennung).action();

function waehle(container, id) {
  karteMit(container, id).dispatchEvent(maus('mousedown', { button: 0, clientX: 0, clientY: 0 }));
  window.dispatchEvent(maus('mouseup', { clientX: 0, clientY: 0 }));
}

describe('Bild-Karten: Anzeige über den Bild-Einbettungs-Weg (AK1 bis AK3)', () => {
  it('AK1: die Bild-Karte trägt Kopfzeile und eigenen Körper, die Text-Karte nicht', () => {
    const { container } = baueAnsicht();
    expect(karteMit(container, 'k2').classList.contains('canvas-karte-bild-karte')).toBe(true);
    expect(kopfVon(container, 'k2')).not.toBeNull();
    expect(koerperVon(container, 'k2')).not.toBeNull();
    expect(karteMit(container, 'k1').classList.contains('canvas-karte-bild-karte')).toBe(false);
    expect(kopfVon(container, 'k1')).toBeNull();
  });

  it('AK2: der Abruf geht mit Dokument-Pfad und Bild-Angabe an den Einbettungs-Weg', () => {
    const { abrufe } = baueAnsicht();
    const treffer = abrufe.find((a) => a.bild === 'Anlagen/Skizze.png');
    expect(treffer, 'kein Abruf mit der geschriebenen Bild-Angabe').toBeTruthy();
    expect(treffer.basis).toBe('C:/Bereich/Fläche.md');
  });

  it('AK1: der Körper bleibt leer, bis die Antwort da ist, und trägt danach das Bild', async () => {
    const { container } = baueAnsicht();
    expect(bildVon(container, 'k2')).toBeNull();
    await warte();
    expect(bildVon(container, 'k2').getAttribute('src')).toBe(DATEN);
  });

  it('AK2: das Bild kommt als Daten-Adresse und behält den aufgelösten Pfad', async () => {
    // Die Inhalts-Sicherheits-Regel lässt als Bild-Quelle nur `self` und
    // `data:` zu; der aufgelöste Pfad bleibt daneben stehen, weil sich aus
    // einer Daten-Adresse kein Pfad mehr ableiten lässt.
    const { container } = baueAnsicht();
    await warte();
    const bild = bildVon(container, 'k2');
    expect(bild.getAttribute('src').startsWith('data:image/png;base64,')).toBe(true);
    expect(bild.dataset.srcOriginal).toBe(BILD_PFAD);
  });

  it('AK2: der Bild-Körper wird nicht durch die Markdown-Strecke geschickt', async () => {
    // Eine Bild-Karte hält keinen Text und keine Kopie: In ihrem Körper steht
    // ein `<img>` und nichts sonst.
    const { container, renderMarkdown } = baueAnsicht();
    await warte();
    expect(renderMarkdown.mock.calls.some((c) => String(c[0]).includes('Die Skizze'))).toBe(false);
    expect(koerperVon(container, 'k2').children).toHaveLength(1);
  });

  it('AK3: die Kopfzeile nennt die Beschriftung, Zeilenumbrüche als Leerzeichen', () => {
    const { container } = baueAnsicht();
    expect(kopfVon(container, 'k2').textContent).toBe('Die Skizze in zwei Zeilen');
    expect(kopfVon(container, 'k2').title).toBe('Die Skizze in zwei Zeilen — Anlagen/Skizze.png');
  });

  it('AK3: ohne Beschriftung steht der Name der Bild-Datei, nicht ihr Pfad', () => {
    // Ein Bild wird im Bereich über seinen NAMEN gefunden; sein Ordner ist
    // Ablage und keine Aussage (Regel des Kerns).
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 bild="Anlagen/Skizze.png"';
    const { container } = baueAnsicht(rumpf);
    expect(kopfVon(container, 'k9').textContent).toBe('Skizze.png');
  });

  it('AK1/AK4: das Stilblatt passt das Bild ein, stapelt die Teile und scrollt nicht', () => {
    // jsdom rechnet kein Layout; geprüft wird die Regel, die es im Programm tut.
    const css = lies('src/renderer/styles/canvas.css');
    const regel = (wahl) => {
      const treffer = new RegExp(`\\${wahl} \\{([^}]*)\\}`).exec(css);
      expect(treffer, `Regel ${wahl} nicht gefunden`).not.toBeNull();
      return treffer[1];
    };
    expect(regel('.canvas-karte-bild-karte')).toMatch(/flex-direction:\s*column/);
    expect(regel('.canvas-karte-bild-koerper')).toMatch(/overflow:\s*hidden/);
    expect(regel('.canvas-karte-bild')).toMatch(/object-fit:\s*contain/);
    expect(regel('.canvas-karte-bild')).toMatch(/max-width:\s*100%/);
    expect(regel('.canvas-karte-bild')).toMatch(/max-height:\s*100%/);
  });

  it('eine Antwort zu einer inzwischen verschwundenen Karte wird verworfen', async () => {
    const { container, view } = baueAnsicht();
    const alterKoerper = koerperVon(container, 'k2');
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nNeu'), {
      pfad: 'C:/Bereich/Fläche.md',
    });
    await warte();
    expect(alterKoerper.isConnected).toBe(false);
    expect(alterKoerper.querySelector('.canvas-karte-bild')).toBeNull();
    expect(container.querySelectorAll('.canvas-karte-bild-karte')).toHaveLength(0);
  });

  it('das Nachfüllen lässt Auswahl und gezeichnete Karte unangetastet', async () => {
    const { container, view } = baueAnsicht();
    waehle(container, 'k2');
    const knoten = karteMit(container, 'k2');
    await warte();
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    expect(karteMit(container, 'k2')).toBe(knoten);
  });
});

describe('Bild-Karten: die drei Befunde (AK7)', () => {
  it('AK7: ein nicht gefundenes Bild lässt die Karte stehen und nennt den Namen', async () => {
    const { container } = baueAnsicht();
    await warte();
    const koerper = koerperVon(container, 'k3');
    expect(koerper.classList.contains('canvas-karte-verweis-fehlt')).toBe(true);
    expect(koerper.textContent).toBe(de['canvas.bildNichtGefunden'].replace('{ziel}', 'Fehlt.png'));
    expect(karteMit(container, 'k3')).not.toBeNull();
  });

  it('AK7: ein Bild über der Größen-Grenze bekommt seinen eigenen Hinweis', async () => {
    // Der Auflöser meldet diesen Fall gesondert, und er hat eine andere
    // Abhilfe: Wer die Datei hat und sie nur verkleinern muss, soll nicht nach
    // ihr suchen.
    const antworten = { 'Anlagen/Skizze.png': { ok: false, error: 'too large' } };
    const { container } = baueAnsicht(RUMPF, { antworten });
    await warte();
    expect(koerperVon(container, 'k2').textContent).toBe(
      de['canvas.bildZuGross'].replace('{ziel}', 'Anlagen/Skizze.png'),
    );
  });

  it('AK7: eine im Kern verworfene Endung zeigt den Hinweis ohne Abruf', async () => {
    // Der Kern nimmt `bild=` nur mit einer zulässigen Bild-Endung an und lässt
    // `el.bild` sonst leer; der Rohtext bleibt in der Datei. Ohne diesen Zweig
    // stünde dort eine gewöhnliche Text-Karte, und der Anwender bekäme auf
    // seinen Tippfehler gar keine Antwort.
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 bild="Notiz.txt"';
    const { container, abrufe } = baueAnsicht(rumpf);
    await warte();
    expect(koerperVon(container, 'k9').textContent).toBe(
      de['canvas.bildKeineBildDatei'].replace('{ziel}', 'Notiz.txt'),
    );
    expect(abrufe).toHaveLength(0);
    expect(kopfVon(container, 'k9').textContent).toBe('Notiz.txt');
  });

  it('AK7: eine vom Auflöser abgewiesene Endung bekommt denselben Hinweis', async () => {
    // Die Grammatik führt `ico`, die Positivliste des Auflösers nicht — die
    // Endung schlägt dann erst dort zu. Für den Anwender ist es dieselbe
    // Auskunft.
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 bild="Marke.ico"';
    const antworten = { 'Marke.ico': { ok: false, error: 'extension not allowed' } };
    const { container } = baueAnsicht(rumpf, { antworten });
    await warte();
    expect(koerperVon(container, 'k9').textContent).toBe(
      de['canvas.bildKeineBildDatei'].replace('{ziel}', 'Marke.ico'),
    );
  });

  it('AK7: kein Befund schreibt, und der Rohtext übersteht den Rundlauf byte-gleich', async () => {
    const { geschrieben, view } = baueAnsicht();
    await warte();
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
    expect(serializeCanvasFence(parseCanvasFence(RUMPF))).toBe(RUMPF);
  });

  it('ohne Abruf-Rückruf zeigt die Karte denselben Befund', () => {
    // Der Stand der reinen Zeichnungs-Prüffälle.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = createCanvasView(container, { t: tStub, renderMarkdown: (x) => `<p>${x}</p>` });
    view.setFlaechen(flaechenAus(RUMPF), {});
    expect(koerperVon(container, 'k2').classList.contains('canvas-karte-verweis-fehlt')).toBe(true);
    view.destroy();
  });
});

describe('Bild-Karten: Leiste am gewählten Element (AK5, AK6)', () => {
  it('AK5: jede gewählte Karte bekommt das Bild-Feld, vorbelegt mit ihrer Angabe', () => {
    const { container } = baueAnsicht();
    waehle(container, 'k1');
    expect(bildFeld(leiste(container)).value).toBe('');
    waehle(container, 'k2');
    expect(bildFeld(leiste(container)).value).toBe('Anlagen/Skizze.png');
  });

  it('AK5: Öffnen und «Bild entfernen» erscheinen nur an einer Karte mit Bild', () => {
    const { container } = baueAnsicht();
    const aktionen = (c) =>
      [...leiste(c).querySelectorAll('.canvas-karte-knopf')].map((k) => k.dataset.aktion);
    waehle(container, 'k1');
    expect(aktionen(container)).toEqual([]);
    waehle(container, 'k2');
    expect(aktionen(container)).toEqual(['oeffnen', 'bildEntfernen']);
  });

  it('AK5: das Feld macht aus der Text-Karte eine Bild-Karte', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k1');
    const feld = bildFeld(leiste(container));
    feld.value = 'Anlagen/Skizze.png';
    feld.dispatchEvent(aenderung());
    expect(geschrieben).toHaveLength(1);
    expect(elementAus(geschrieben, 'k1').bild).toBe('Anlagen/Skizze.png');
    // Die Beschriftung bleibt: Sie ist der eigene Inhalt der Karte.
    expect(elementAus(geschrieben, 'k1').inhalt).toContain('Erste');
  });

  it('AK5: das Bild lässt sich wechseln', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = bildFeld(leiste(container));
    feld.value = 'Anlagen/Foto.jpg';
    feld.dispatchEvent(aenderung());
    expect(elementAus(geschrieben, 'k2').bild).toBe('Anlagen/Foto.jpg');
  });

  it('AK5: «Bild entfernen» macht die Karte wieder zur Text-Karte und behält den Text', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    knopf(container, 'bildEntfernen').dispatchEvent(maus('click'));
    expect(geschrieben).toHaveLength(1);
    expect(elementAus(geschrieben, 'k2').bild).toBeUndefined();
    expect(elementAus(geschrieben, 'k2').inhalt).toContain('Die Skizze');
    // Die Zeile trägt keine Angabe mehr; die Karte daneben behält ihre.
    expect(geschrieben[0].rumpf.split('\n')).toContain('!karte k2 x=100 y=-100 b=200 h=100');
    expect(geschrieben[0].rumpf).toContain('bild="Fehlt.png"');
  });

  it('AK5: eine unzulässige Endung wird nicht geschrieben, und das Feld kehrt zurück', () => {
    // Der Kern setzt sie gar nicht erst (G8). Ein Feld, das den Wert behielte,
    // behauptete eine Änderung, die es nicht gab.
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = bildFeld(leiste(container));
    feld.value = 'Notiz.txt';
    feld.dispatchEvent(aenderung());
    expect(geschrieben).toHaveLength(0);
    expect(feld.value).toBe('Anlagen/Skizze.png');
  });

  it('AK5: ein unveränderter Wert schreibt nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    bildFeld(leiste(container)).dispatchEvent(aenderung());
    expect(geschrieben).toHaveLength(0);
  });

  it('Escape im Feld stellt den geschriebenen Stand wieder her und schreibt nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = bildFeld(leiste(container));
    feld.value = 'Halb getippt';
    feld.dispatchEvent(taste('Escape'));
    expect(feld.value).toBe('Anlagen/Skizze.png');
    expect(geschrieben).toHaveLength(0);
  });

  it('`Entf` im Feld löscht die Karte nicht', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    bildFeld(leiste(container)).dispatchEvent(taste('Delete'));
    expect(geschrieben).toHaveLength(0);
    expect(karteMit(container, 'k2')).not.toBeNull();
  });

  it('AK6: «Öffnen» reicht das Bild an den Anlagen-Weg und nicht an den Dokument-Weg', () => {
    const { container, geoeffnet } = baueAnsicht();
    waehle(container, 'k2');
    knopf(container, 'oeffnen').dispatchEvent(maus('click'));
    expect(geoeffnet).toEqual([{ art: 'bild', wert: 'Anlagen/Skizze.png' }]);
  });

  it('AK8: die Bild-Dateien des Bereichs landen in der Liste des Bild-Feldes', async () => {
    const { container } = baueAnsicht();
    waehle(container, 'k2');
    await warte();
    expect(vorschlaegeVon(bildFeld(leiste(container)))).toEqual(['Skizze.png', 'Foto.jpg']);
  });

  it('AK8: jedes Feld bekommt SEINE Liste, nicht die des Nachbarn', async () => {
    // Beide Felder stehen in derselben Leiste, und beide haben eine eigene
    // Vorschlags-Liste. Ein Nachtrag, der das erste `<datalist>` im Teilbaum
    // füllte, träfe je nach Reihenfolge das falsche Feld.
    const { container } = baueAnsicht();
    waehle(container, 'k2');
    await warte();
    expect(vorschlaegeVon(zielFeld(leiste(container)))).toEqual(['Import', 'Zielbild']);
    expect(vorschlaegeVon(bildFeld(leiste(container)))).not.toContain('Import');
  });
});

describe('Bild-Karten: Anlegen über Kommando und Kontextmenü (AK4)', () => {
  it('AK4: das Kommando fragt zuerst das Bild ab und legt noch keine Karte an', () => {
    const { container, view, geschrieben } = baueAnsicht();
    expect(view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } })).toBe(true);
    expect(bildFeld(abfrage(container))).not.toBeNull();
    expect(geschrieben).toHaveLength(0);
  });

  it('AK4: Enter legt die Karte mit ihrem Bild an, mittig unter der Stelle', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    const feld = bildFeld(abfrage(container));
    feld.value = 'Anlagen/Skizze.png';
    feld.dispatchEvent(taste('Enter'));
    expect(geschrieben).toHaveLength(1);
    const alt = new Set(['k1', 'k2', 'k3']);
    const neu = letztesModell(geschrieben).elemente.find(
      (el) => el.art === 'karte' && !alt.has(el.id),
    );
    expect(neu.bild).toBe('Anlagen/Skizze.png');
    expect(neu.x).toBe(-120);
    expect(neu.y).toBe(-60);
    expect(abfrage(container)).toBeNull();
  });

  it('AK8: auch die freistehende Abfrage bekommt die Bild-Vorschläge', async () => {
    const { container, view } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    await warte();
    expect(vorschlaegeVon(bildFeld(abfrage(container)))).toEqual(['Skizze.png', 'Foto.jpg']);
  });

  it('AK4: Escape bricht ab, ohne eine Karte zu hinterlassen', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    bildFeld(abfrage(container)).dispatchEvent(taste('Escape'));
    expect(abfrage(container)).toBeNull();
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
  });

  it('AK4: ohne Bild entsteht keine Karte', () => {
    const { container, view, geschrieben } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    bildFeld(abfrage(container)).dispatchEvent(taste('Enter'));
    expect(geschrieben).toHaveLength(0);
  });

  it('AK4: eine unzulässige Endung legt keine leere Text-Karte an', () => {
    // Halb ausgeführt wäre schlimmer als gar nicht: Die Karte entstünde ohne
    // das, weswegen sie angelegt wurde.
    const { container, view, geschrieben } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    const feld = bildFeld(abfrage(container));
    feld.value = 'Notiz.txt';
    feld.dispatchEvent(taste('Enter'));
    expect(geschrieben).toHaveLength(0);
    expect(view.getStats().karten).toBe(3);
  });

  it('AK4: eine offene Abfrage hält eine Neu-Übergabe zurück', () => {
    const { container, view } = baueAnsicht();
    view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } });
    view.setFlaechen(flaechenAus('!karte n1 x=0 y=0 b=100 h=50\nNeu'), {});
    expect(view.getStats().karten).toBe(3);
    expect(abfrage(container)).not.toBeNull();
  });

  it('AK4: das Kontextmenü der Fläche bietet die Bild-Karte an der Klick-Stelle', () => {
    const { buehne, container, menue } = baueAnsicht();
    buehne.dispatchEvent(maus('contextmenu', { clientX: 0, clientY: 0 }));
    expect(kennungen(menue)).toContain('canvas-add-image-card');
    loese(menue, 'canvas-add-image-card');
    expect(bildFeld(abfrage(container))).not.toBeNull();
  });
});

describe('Bild-Karten: Doppelklick und Kontextmenü der Karte (AK6, B6)', () => {
  it('AK6: der Doppelklick auf das Bild öffnet die Anlage', async () => {
    const { container, geoeffnet } = baueAnsicht();
    await warte();
    koerperVon(container, 'k2').dispatchEvent(maus('dblclick'));
    expect(geoeffnet).toEqual([{ art: 'bild', wert: 'Anlagen/Skizze.png' }]);
    expect(container.querySelector('.canvas-karte-eingabe')).toBeNull();
  });

  it('der Doppelklick auf die Kopfzeile bearbeitet die Beschriftung', () => {
    const { container } = baueAnsicht();
    kopfVon(container, 'k2').dispatchEvent(maus('dblclick'));
    const eingabe = container.querySelector('.canvas-karte-eingabe');
    expect(eingabe).not.toBeNull();
    expect(eingabe.value).toContain('Die Skizze');
  });

  it('B6: das Kontextmenü der Karte trägt den Bild-Block', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(kennungen(menue)).toEqual([
      'canvas-card-edit',
      'canvas-card-delete',
      'canvas-card-link-set',
      'canvas-card-image-set',
      'canvas-card-link-open',
      'canvas-card-image-remove',
      'canvas-stack-ganzNachVorn',
      'canvas-stack-eineStufeVor',
      'canvas-stack-eineStufeZurueck',
      'canvas-stack-ganzNachHinten',
    ]);
  });

  it('B6: ohne Bild fehlen «Ziel öffnen» und «Bild entfernen»', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k1').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(kennungen(menue)).toContain('canvas-card-image-set');
    expect(kennungen(menue)).not.toContain('canvas-card-link-open');
    expect(kennungen(menue)).not.toContain('canvas-card-image-remove');
  });

  it('B6: die Einträge rufen dieselben Handlungen wie die Leiste', () => {
    const { container, menue, geoeffnet, geschrieben } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    loese(menue, 'canvas-card-link-open');
    expect(geoeffnet).toEqual([{ art: 'bild', wert: 'Anlagen/Skizze.png' }]);
    loese(menue, 'canvas-card-image-remove');
    expect(elementAus(geschrieben, 'k2').bild).toBeUndefined();
  });

  it('B6: «Bild setzen…» führt in das Feld der Leiste und nicht in eine zweite Eingabe', () => {
    const { container, menue } = baueAnsicht();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(loese(menue, 'canvas-card-image-set')).toBe(true);
    expect(leiste(container)).not.toBeNull();
    expect(container.querySelectorAll('.canvas-karte-bild-feld')).toHaveLength(1);
  });
});

describe('Bild-Karten: Verweis und Bild schließen einander aus (AK8 des Kerns)', () => {
  it('trägt eine Karte beides, zeigt sie das Dokument und nicht das Bild', () => {
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 doc="Import.md" bild="Anlagen/Skizze.png"';
    const { container } = baueAnsicht(rumpf);
    expect(karteMit(container, 'k9').classList.contains('canvas-karte-verweis')).toBe(true);
    expect(karteMit(container, 'k9').classList.contains('canvas-karte-bild-karte')).toBe(false);
    // Und der Rohtext behält beide Angaben.
    expect(serializeCanvasFence(parseCanvasFence(rumpf))).toBe(rumpf);
  });

  it('ein gesetztes Bild entfernt einen vorhandenen Verweis', () => {
    const rumpf = '!karte k9 x=0 y=0 b=200 h=100 doc="Import.md"';
    const { container, geschrieben } = baueAnsicht(rumpf);
    waehle(container, 'k9');
    const feld = bildFeld(leiste(container));
    feld.value = 'Anlagen/Skizze.png';
    feld.dispatchEvent(aenderung());
    const el = elementAus(geschrieben, 'k9');
    expect(el.bild).toBe('Anlagen/Skizze.png');
    expect(el.doc).toBeUndefined();
    expect(geschrieben[0].rumpf).not.toContain('doc=');
  });

  it('ein gesetzter Verweis entfernt ein vorhandenes Bild', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k2');
    const feld = zielFeld(leiste(container));
    feld.value = 'Import.md';
    feld.dispatchEvent(aenderung());
    const el = elementAus(geschrieben, 'k2');
    expect(el.doc).toBe('Import.md');
    expect(el.bild).toBeUndefined();
  });

  it('AK8: gesetzt, geschrieben, neu gelesen — die Angabe steht wieder da', () => {
    const { container, geschrieben } = baueAnsicht();
    waehle(container, 'k1');
    const feld = bildFeld(leiste(container));
    feld.value = 'Anlagen/Skizze.png';
    feld.dispatchEvent(aenderung());
    const rumpf = geschrieben[0].rumpf;
    const model = parseCanvasFence(rumpf);
    expect(model.elemente.find((el) => el.id === 'k1').bild).toBe('Anlagen/Skizze.png');
    // Und der zweite Rundlauf über denselben Rumpf ändert kein Zeichen (G2).
    expect(serializeCanvasFence(model)).toBe(rumpf);
    expect(model.errors).toHaveLength(0);
  });
});

describe('Bild-Karten: Nur-Ansicht (AK9)', () => {
  it('AK9: keine Leiste, kein Anlegen, kein Kontextmenü', () => {
    const { container, view, menue, geschrieben } = baueAnsicht(RUMPF, { aenderbar: false });
    waehle(container, 'k2');
    expect(view.getStats().gewaehlteKarte).toBe('k2');
    expect(leiste(container)).toBeNull();
    expect(view.bildKarteAnlegen({ punkt: { x: 0, y: 0 } })).toBe(false);
    expect(abfrage(container)).toBeNull();
    karteMit(container, 'k2').dispatchEvent(maus('contextmenu', { clientX: 5, clientY: 5 }));
    expect(menue.offen).toBe(false);
    expect(geschrieben).toHaveLength(0);
  });

  it('AK9: das Bild wird gezeichnet, und das Öffnen der Anlage bleibt erlaubt', async () => {
    const { container, geoeffnet } = baueAnsicht(RUMPF, { aenderbar: false });
    await warte();
    expect(bildVon(container, 'k2')).not.toBeNull();
    koerperVon(container, 'k2').dispatchEvent(maus('dblclick'));
    expect(geoeffnet).toEqual([{ art: 'bild', wert: 'Anlagen/Skizze.png' }]);
  });
});

describe('Bild-Karten: Verdrahtung des Kommandos über alle Zugänge (AK10)', () => {
  // Dieselbe Sorgfalt wie bei Karte, Form, Gruppe und Verweis-Karte: Ein
  // Kommando, das in Registry, Menü, Brücke und Dispatcher nicht durchgängig
  // verdrahtet ist, fällt sonst erst im Struktur-Prüfschritt auf.
  it('steht in der Registry, ohne Vorgabe-Kürzel und mit eigener Katalog-Zeile', () => {
    const cmd = COMMANDS.find((c) => c.id === 'canvas.addImageCard');
    expect(cmd, 'Kommando canvas.addImageCard fehlt').toBeTruthy();
    expect(cmd.defaultBindings).toEqual([]);
    expect(cmd.menu).toBe(true);
    expect(cmd.labelKey).toBe('command.canvas.addImageCard');
    expect(cmd.descKey).toBe('help.feature.canvasImageCards');
  });

  it('trägt seine benannte Bedingung und entscheidet sie nicht selbst', () => {
    const cmd = COMMANDS.find((c) => c.id === 'canvas.addImageCard');
    expect(cmd.availability).toBe('canvasKarte');
    const faelle = [
      [{ canvasTab: true, viewMode: 'canvas' }, true],
      [{ canvasTab: true, viewMode: 'rendered' }, false],
      [{ canvasTab: false, viewMode: 'canvas' }, false],
      [{ canvasTab: true, viewMode: 'canvas', systemTab: true }, false],
    ];
    for (const [roh, soll] of faelle) {
      const ctx = availabilityContext({ hasTab: true, ...roh });
      expect(isAvailable(cmd.availability, ctx), JSON.stringify(roh)).toBe(soll);
    }
    const menu = lies('src/main/menu/menu.js');
    expect(menu).toContain("enabled: avail('canvas.addImageCard')");
    expect(menu).toContain("acc('canvas.addImageCard')");
  });

  it('die Kette Menü → Brücke → Bindung → Einbettung ist geschlossen', () => {
    expect(lies('src/main/menu/menu.js')).toContain("send('menu:canvasAddImageCard')");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.on('menu:canvasAddImageCard'");
    expect(lies('src/renderer/modules/app/app-menu-bindings.js')).toContain(
      'api.onMenuCanvasAddImageCard(',
    );
    expect(lies('src/renderer/modules/app/app-commands.js')).toContain(
      'legeCanvasBildKarteAn(state.activePaneIndex)',
    );
  });

  it('es gehört der Erweiterung der Fläche, samt seiner Katalog-Zeile', () => {
    const quelle = lies('src/shared/extensions/extensions.js');
    expect(quelle).toContain("'canvas.addImageCard',");
    expect(quelle).toContain("'help.feature.canvasImageCards',");
    expect(lies('src/shared/manual/manual-feature-groups.js')).toContain(
      "'help.feature.canvasImageCards',",
    );
  });

  it('die Texte stehen in allen fünf Sprachfassungen', () => {
    for (const sprache of ['de', 'en', 'fr', 'es', 'it']) {
      const katalog = JSON.parse(lies(`src/i18n/${sprache}.json`));
      for (const key of [
        'command.canvas.addImageCard',
        'canvas.bild',
        'canvas.bildSetzen',
        'canvas.bildEntfernen',
        'canvas.bildNichtGefunden',
        'canvas.bildZuGross',
        'canvas.bildKeineBildDatei',
        'canvas.bildZielFehlt',
        'help.feature.canvasImageCards',
        'help.featureName.canvasImageCards',
        'help.featureAccess.canvasImageCards',
      ]) {
        expect(katalog[key], `Schlüssel ${key} fehlt in ${sprache}.json`).toBeTruthy();
      }
    }
  });

  it('ausserhalb der Canvas-Ansicht bleibt sie wirkungslos und sagt es', async () => {
    const tab = { viewMode: 'source', content: '# Ohne Fläche', path: 'F.md' };
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    initCanvasPane({ getPaneEls: () => ({ canvasEl }), aktivesDokument: () => tab });
    expect(legeCanvasBildKarteAn(24)).toBe(false);
    await warte();
    expect(hinweise).toContain('canvas.nurInAnsicht');
    destroyCanvas(24);
  });

  it('im nicht änderbaren Dokument bleibt sie wirkungslos und sagt es', async () => {
    const TEXT = ['```perspective-canvas', '!karte k1 x=0 y=0 b=200 h=100', 'Text', '```'].join(
      '\n',
    );
    const tab = { viewMode: 'canvas', content: TEXT, path: 'F.md' };
    hinweise.length = 0;
    const canvasEl = document.createElement('div');
    document.body.appendChild(canvasEl);
    initCanvasPane({
      getPaneEls: () => ({ canvasEl }),
      aktivesDokument: () => tab,
      istAenderbar: () => false,
    });
    renderCanvas(25);
    expect(legeCanvasBildKarteAn(25)).toBe(false);
    await warte();
    expect(hinweise).toContain('canvas.nurLesbar');
    destroyCanvas(25);
  });

  it('Anzeige und Öffnen laufen über die beiden Bestands-Wege', () => {
    // Die Anzeige holt die Daten-Adresse über `readEmbedImage`. Das Öffnen geht
    // ausdrücklich NICHT denselben Aufruf: Der scheitert bei einem Bild über der
    // Größen-Grenze, und gerade dort muss das Öffnen tragen. `resolveEmbedTarget`
    // hat dieselben drei Auflösungs-Stufen und dieselbe Bereichs-Grenze, liest
    // die Datei aber nicht. Geöffnet wird über den Anlagen-Weg, der über einen
    // Laufzeit-Import kommt, damit der Canvas-Ordner nicht in den grossen
    // Datei-Zyklus gerät.
    const quelle = lies('src/renderer/modules/canvas/canvas-pane.js');
    expect(quelle).toContain('api.readEmbedImage(');
    expect(quelle).toContain('api.resolveEmbedTarget(');
    expect(quelle).toContain("import('../views/link-navigation.js')");
    expect(quelle).toContain('navigation.oeffneAnlage(paneIdx, ergebnis.path)');
    expect(quelle).not.toMatch(/^import .*from '\.\.\/views\/link-navigation\.js'/m);
  });

  it('AK8: die Kette vom Index über die Brücke bis in das Bild-Feld ist geschlossen', () => {
    // Die Sicht liest die Namens-Zuordnung der Nicht-Markdown-Dateien und
    // filtert sie über den geteilten Satz der Bild-Endungen; der Kanal reicht
    // sie wie sein Wiki-Nachbar durch, und die Einbettung speist sie in das
    // Feld ein. Die Sicht selbst prüft `backlinks.test.js` gegenständlich.
    const sicht = lies('src/main/index/views.js');
    expect(sicht).toContain('function bildAutocompleteSuggestions(');
    expect(sicht).toContain("require('../../shared/bild-endungen.js')");
    expect(sicht).toContain('entry.assetNameMap');
    expect(lies('src/main/backlinks.js')).toContain(
      'bildAutocompleteSuggestions: views.bildAutocompleteSuggestions,',
    );
    expect(lies('src/main/ipc/index-views.js')).toContain("handle('autocomplete:imageTargets'");
    expect(lies('src/main/preload.js')).toContain("ipcRenderer.invoke('autocomplete:imageTargets'");
    expect(lies('src/renderer/modules/canvas/canvas-pane.js')).toContain(
      'api.autocompleteImageTargets(',
    );
  });
});
