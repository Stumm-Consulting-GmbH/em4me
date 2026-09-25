// @vitest-environment jsdom
// 4T-001848 (Epic 3E-000110): Prüffälle der Tafel-Zeichnung — Spalten, Karten,
// Zähler, Erledigt-Zustand, Folgezeilen, die beiden leeren Zustände, der
// Befund-Hinweis und die geerbte Änderbarkeit.
//
// **Der Paritäts-Abgleich ist der Kern dieser Datei** (AK3, AK10). Geprüft wird
// nicht, dass die Karte «irgendwie gerendert» ist, sondern dass **dieselbe
// Zeile** in der Lese-Ansicht und auf der Karte dasselbe Markup für Verweise,
// Tags und Bilder ergibt. Dafür läuft hier die echte Render-Kette
// (`src/shared/markdown/markdown.js`) — dieselbe, die im Programm hinter
// `api.renderMarkdown` steht. Eine Attrappe könnte die Aussage nicht tragen:
// Sie prüfte den Aufruf, nicht das Ergebnis.
//
// Die Bild-Pfad-Auflösung des Preloads (`resolveImagesForBase`) läuft hier
// bewusst nicht mit: Sie ist fs-nah und in beiden Wegen **dieselbe** Funktion
// hinter demselben Bezugs-Pfad. Gemessen wird deshalb, dass die Karte denselben
// `src`-Rohwert und denselben Bezugs-Pfad bekommt wie die Lese-Ansicht.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../../../src/shared/markdown/markdown.js';
import { leseTafel } from '../../../src/shared/kanban/kanban-core.js';
import {
  KARTE_KLASSE,
  gewaehlteKartenZeile,
  kartenFragment,
  merkeZustand,
  stelleZustandHer,
  waehleKarte,
  zeichneTafel,
} from '../../../src/renderer/modules/kanban/kanban-tafel.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.join(dir, '../../..');
const lies = (rel) => readFileSync(path.join(wurzel, rel), 'utf8');
const de = JSON.parse(lies('src/i18n/de.json'));
const tStub = (key) => de[key] ?? key;

// Die Prozess-Brücke der Render-Kette, gestellt wie im Programm. Sie muss VOR
// dem Laden der Einbettung stehen, weil `modules/app/api.js` `window.api` beim
// Laden bindet (Muster api-stub.js); deshalb der späte, dynamische Import.
window.api = {
  renderMarkdown: (text, _pfad, optionen) => renderMarkdown(text, 'de', optionen),
};
const { initKanbanPane, istTafelAenderbar, renderKanban } =
  await import('../../../src/renderer/modules/kanban/kanban-pane.js');

// Die Umgebung der Zeichnung im Programm: echte Kette, echter Bezugs-Pfad.
function umgebung(zusatz = {}) {
  return {
    t: tStub,
    pfad: 'C:/Notizen/Tafel.md',
    renderMarkdown: (text) => renderMarkdown(text, 'de', { frontmatterBlock: false }),
    ...zusatz,
  };
}

function zeichne(text, zusatz = {}) {
  const container = document.createElement('section');
  zeichneTafel(container, leseTafel(text), umgebung(zusatz));
  return container;
}

const KOPF = '---\nkanban-plugin: board\n---\n';

const TAFEL = [
  KOPF,
  '## Offen',
  '',
  '- [ ] Erste Karte mit [[Zielnotiz]] und #arbeit',
  '\tFolgezeile mit ![Bild](bilder/plan.png)',
  '- [ ] Zweite Karte',
  '',
  '## Erledigt',
  '',
  '**Complete**',
  '- [x] Dritte Karte',
  '',
].join('\n');

describe('Tafel-Zeichnung: Spalten, Karten und Zähler (4T-001848, AK1/AK2)', () => {
  it('AK1: die Spalten stehen nebeneinander, jede mit Titel und Karten-Zähler', () => {
    const container = zeichne(TAFEL);
    const spalten = [...container.querySelectorAll('.kanban-spalte')];
    expect(spalten).toHaveLength(2);
    expect(spalten.map((s) => s.querySelector('.kanban-spalte-titel').textContent)).toEqual([
      'Offen',
      'Erledigt',
    ]);
    expect(spalten.map((s) => s.querySelector('.kanban-spalte-zaehler').textContent)).toEqual([
      '2',
      '1',
    ]);
    // Der Zähler sagt auch in Worten, was er zählt — sonst ist eine nackte Zahl
    // für Hilfsmittel eine Zahl ohne Gegenstand.
    expect(spalten[0].querySelector('.kanban-spalte-zaehler').getAttribute('aria-label')).toBe(
      '2 Karten',
    );
    // Das waagerechte Rollen ist eine Zusage des Stilblatts (AK7); die
    // Zeichnung liefert den Streifen, der sie tragen kann.
    expect(container.querySelector('.kanban-spalten')).not.toBeNull();
  });

  it('AK2: die Karten stehen in der Reihenfolge ihrer Zeilen im Dokument', () => {
    const container = zeichne(TAFEL);
    const karten = [...container.querySelectorAll(`.${KARTE_KLASSE}`)];
    expect(karten.map((k) => Number(k.dataset.zeile))).toEqual([6, 8, 13]);
    // Und die Reihenfolge ist aufsteigend, nicht bloß vollständig.
    const nummern = karten.map((k) => Number(k.dataset.zeile));
    expect([...nummern].sort((a, b) => a - b)).toEqual(nummern);
  });

  it('jede Karte trägt ihren Rückweg ins Dokument', () => {
    // Die Bedien-Vorgänge dieser Ausbaustufe schreiben über die Zeilen-Nummern
    // und suchen die Karte nicht im Text.
    const erste = zeichne(TAFEL).querySelector(`.${KARTE_KLASSE}`);
    expect(erste.dataset).toMatchObject({
      spalte: '0',
      karte: '0',
      zeile: '6',
      letzteZeile: '7',
      status: ' ',
    });
    const spalte = zeichne(TAFEL).querySelector('.kanban-spalte');
    expect(spalte.dataset.titelZeile).toBe('4');
  });

  it('eine Tafel mit vielen Spalten wird vollständig gezeichnet', () => {
    const viele = [KOPF];
    for (let i = 1; i <= 12; i++) viele.push(`## Spalte ${i}`, '', `- [ ] Karte ${i}`, '');
    const container = zeichne(viele.join('\n'));
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(12);
    expect(container.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(12);
  });
});

// 4T-001905 (Story 4S-000981): Die Obergrenze steht im Dokument als Zahl in
// Klammern am Titel-Ende, auf der Tafel am Zähler.
describe('Tafel-Zeichnung: Obergrenze der Spalte (4T-001905, AK1/AK3/AK4/AK7)', () => {
  // Drei Karten je Spalte; die Obergrenzen liegen darunter, darauf, darüber.
  const mitLimits = (...titel) =>
    [KOPF, ...titel.flatMap((t) => [`## ${t}`, '', '- [ ] A', '- [ ] B', '- [ ] C', ''])].join(
      '\n',
    );
  const spaltenVon = (container) => [...container.querySelectorAll('.kanban-spalte')];
  const zaehlerVon = (el) => el.querySelector('.kanban-spalte-zaehler');

  it('AK1/AK3: der Titel steht ohne Klammer-Zahl, der Zähler zeigt «n/Obergrenze»', () => {
    const [spalte] = spaltenVon(zeichne(mitLimits('Offen (5)')));
    expect(spalte.querySelector('.kanban-spalte-titel').textContent).toBe('Offen');
    expect(zaehlerVon(spalte).textContent).toBe('3/5');
    expect(spalte.dataset.limit).toBe('5');
    // Beide Zahlen auch in Worten, für Hinweistext und Vorlese-Programme.
    expect(zaehlerVon(spalte).title).toBe('3 von 5 Karten');
    expect(zaehlerVon(spalte).getAttribute('aria-label')).toBe('3 von 5 Karten');
  });

  it('AK4: hervorgehoben wird erst bei n GRÖSSER als die Obergrenze', () => {
    const spalten = spaltenVon(zeichne(mitLimits('Unter (4)', 'Genau (3)', 'Über (2)')));
    const ueber = spalten.map((s) => s.classList.contains('kanban-spalte-ueberschritten'));
    expect(ueber, 'unter, an, über der Grenze').toEqual([false, false, true]);
    expect(zaehlerVon(spalten[2]).textContent).toBe('3/2');
    expect(zaehlerVon(spalten[2]).title).toBe('3 von 2 Karten – Obergrenze überschritten');
  });

  it('AK3/AK4: ohne Obergrenze nur die Zahl und nie eine Hervorhebung', () => {
    const [spalte] = spaltenVon(zeichne(mitLimits('Offen')));
    expect(zaehlerVon(spalte).textContent).toBe('3');
    expect(zaehlerVon(spalte).title).toBe('3 Karten');
    expect(spalte.dataset.limit).toBeUndefined();
    expect(spalte.classList.contains('kanban-spalte-ueberschritten')).toBe(false);
  });

  it('AK7: eine Nicht-Zahl oder eine (0) in Klammern bleibt Titel', () => {
    const spalten = spaltenVon(zeichne(mitLimits('Später (bald)', 'Fertig (0)', 'Mitte (2) x')));
    expect(spalten.map((s) => s.querySelector('.kanban-spalte-titel').textContent)).toEqual([
      'Später (bald)',
      'Fertig (0)',
      'Mitte (2) x',
    ]);
    for (const spalte of spalten) {
      expect(zaehlerVon(spalte).textContent).toBe('3');
      expect(spalte.classList.contains('kanban-spalte-ueberschritten')).toBe(false);
    }
  });

  it('AK6: eine fremde Obergrenze ohne Leerzeichen wird ebenso gelesen', () => {
    const [spalte] = spaltenVon(zeichne(mitLimits('In Arbeit(2)')));
    expect(spalte.querySelector('.kanban-spalte-titel').textContent).toBe('In Arbeit');
    expect(zaehlerVon(spalte).textContent).toBe('3/2');
    expect(spalte.classList.contains('kanban-spalte-ueberschritten')).toBe(true);
  });

  it('AK4: das Stilblatt hebt über die Warnfarbe des Themes hervor, nicht über einen Festwert', () => {
    const css = lies('src/renderer/styles/kanban.css');
    const block = /\.kanban-spalte-ueberschritten \.kanban-spalte-zaehler \{[^}]*\}/.exec(css);
    expect(block, 'Regel der Hervorhebung fehlt').not.toBeNull();
    expect(block[0]).toContain('var(--linter-warn)');
    expect(block[0]).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    // Die Variable ist für helles UND dunkles Schema gesetzt.
    expect(lies('src/renderer/styles.css').match(/--linter-warn:/g)).toHaveLength(2);
  });
});

describe('Tafel-Zeichnung: Erledigt-Zustand und Folgezeilen (AK4/AK5)', () => {
  it('AK4: der Erledigt-Zustand ist auf der Karte erkennbar', () => {
    const karten = [...zeichne(TAFEL).querySelectorAll(`.${KARTE_KLASSE}`)];
    const offen = karten[0];
    const erledigt = karten[2];
    expect(offen.classList.contains('kanban-karte-erledigt')).toBe(false);
    expect(erledigt.classList.contains('kanban-karte-erledigt')).toBe(true);
    // Das Zeichen des Dokuments steht im Kästchen, und es steht als Text da —
    // der Status-Katalog kennt frei belegte Zeichen.
    expect(erledigt.querySelector('.kanban-karte-kasten').textContent).toBe('x');
    expect(erledigt.querySelector('.kanban-karte-kasten').getAttribute('aria-label')).toBe(
      'Erledigt',
    );
    expect(offen.querySelector('.kanban-karte-kasten').getAttribute('aria-label')).toBe('Offen');
    expect(erledigt.dataset.status).toBe('x');
  });

  it('ein frei belegtes Status-Zeichen gilt als abgehakt und erscheint unverändert', () => {
    const karte = zeichne(`${KOPF}\n## Offen\n\n- [/] Halb fertig\n`).querySelector(
      `.${KARTE_KLASSE}`,
    );
    expect(karte.classList.contains('kanban-karte-erledigt')).toBe(true);
    expect(karte.querySelector('.kanban-karte-kasten').textContent).toBe('/');
  });

  it('AK5: eingerückte Folgezeilen erscheinen auf der Karte, ohne Code-Block zu werden', () => {
    const karte = zeichne(TAFEL).querySelector(`.${KARTE_KLASSE}`);
    const inhalt = karte.querySelector('.kanban-karte-inhalt');
    expect(inhalt.textContent).toContain('Folgezeile');
    // Der Einzug der Quelle darf nicht als Code-Block ankommen — genau das
    // passierte, wenn das Fragment die Zeilen unverändert übernähme.
    expect(inhalt.querySelector('pre')).toBeNull();
  });

  it('das Fragment nimmt den gemeinsamen Einzug weg und behält die Stufen darunter', () => {
    const model = leseTafel(
      `${KOPF}\n## Offen\n\n- [ ] Karte\n\tErste Folgezeile\n\t- Unterpunkt\n\t\t- Tiefer\n`,
    );
    const fragment = kartenFragment(model.spalten[0].karten[0], model.zeilen);
    expect(fragment).toBe('Karte\nErste Folgezeile\n- Unterpunkt\n\t- Tiefer');
  });

  it('eine Karte ohne Folgezeilen liefert genau ihren Text', () => {
    const model = leseTafel(`${KOPF}\n## Offen\n\n- [ ] Nur Text\n`);
    expect(kartenFragment(model.spalten[0].karten[0], model.zeilen)).toBe('Nur Text');
  });
});

describe('Parität: dieselbe Zeile in Lese-Ansicht und auf der Karte (AK3/AK10)', () => {
  // Eine Zeile mit allen drei Konstrukten, um die es geht.
  const ZEILE =
    'Karte mit [[Zielnotiz|Ziel]], #arbeit/offen, ![Plan](bilder/plan.png) und **fett**';
  const DOKUMENT = `${KOPF}\n## Offen\n\n- [ ] ${ZEILE}\n`;

  // Der Karten-Körper des Lese-Wegs: das gerenderte Dokument, aus dem das
  // Listen-Element der Aufgaben-Zeile genommen wird.
  function leseAnsichtInneres() {
    const wurzel = document.createElement('div');
    wurzel.innerHTML = renderMarkdown(DOKUMENT, 'de');
    return wurzel.querySelector('li');
  }

  function karteInneres() {
    return zeichne(DOKUMENT).querySelector('.kanban-karte-inhalt');
  }

  it('AK3: der Verweis ist derselbe — Ziel, Anzeige-Text und Verweis-Klasse', () => {
    const lese = leseAnsichtInneres().querySelector('a');
    const karte = karteInneres().querySelector('a');
    expect(lese, 'die Lese-Ansicht zeigt den Verweis').not.toBeNull();
    expect(karte, 'die Karte zeigt den Verweis').not.toBeNull();
    expect(karte.outerHTML).toBe(lese.outerHTML);
  });

  it('AK3: der Tag ist derselbe — Markup und Text', () => {
    const lese = leseAnsichtInneres().querySelector('.tag, a[href^="#"]');
    const karte = karteInneres().querySelector('.tag, a[href^="#"]');
    expect(lese, 'die Lese-Ansicht zeigt den Tag').not.toBeNull();
    expect(karte.outerHTML).toBe(lese.outerHTML);
  });

  it('AK3: das Bild ist dasselbe — Quelle und Alternativtext', () => {
    const lese = leseAnsichtInneres().querySelector('img');
    const karte = karteInneres().querySelector('img');
    expect(lese, 'die Lese-Ansicht zeigt das Bild').not.toBeNull();
    expect(karte.getAttribute('src')).toBe(lese.getAttribute('src'));
    expect(karte.getAttribute('alt')).toBe(lese.getAttribute('alt'));
  });

  it('AK10: die Karte bekommt denselben Bezugs-Pfad wie die Lese-Ansicht', () => {
    // Die Bild-Auflösung des Preloads hängt allein am Bezugs-Pfad; wäre er ein
    // anderer, zeigte die Karte ein anderes oder gar kein Bild.
    const gesehen = [];
    zeichne(DOKUMENT, {
      renderMarkdown: (text, pfad) => {
        gesehen.push(pfad);
        return renderMarkdown(text, 'de', { frontmatterBlock: false });
      },
    });
    expect(gesehen).toEqual(['C:/Notizen/Tafel.md']);
  });

  it('AK10: der Schritt-Satz des erzeugten Teilbaums läuft je Karte', () => {
    // Ohne ihn bliebe auf der Karte inert, was die Kette erst befüllt oder
    // bedienbar macht (Wächter 4T-001130).
    const nachRender = vi.fn();
    const container = zeichne(TAFEL, { nachRender });
    expect(nachRender).toHaveBeenCalledTimes(container.querySelectorAll(`.${KARTE_KLASSE}`).length);
    expect(nachRender.mock.calls[0][1]).toBe('C:/Notizen/Tafel.md');
  });

  it('das Kästchen der Aufgabe geht NICHT durch die Kette', () => {
    // Es wird aus dem Modell gezeichnet; sonst brächte die Karte die
    // Listen-Struktur der Lese-Ansicht mit, die auf ihr nichts zu suchen hat.
    const karte = zeichne(TAFEL).querySelector(`.${KARTE_KLASSE}`);
    const inhalt = karte.querySelector('.kanban-karte-inhalt');
    expect(inhalt.querySelector('input[type="checkbox"]')).toBeNull();
    expect(inhalt.querySelector('li')).toBeNull();
    expect(karte.querySelector('.kanban-karte-kasten')).not.toBeNull();
  });

  it('ein Fehler der Render-Kette leert die Tafel nicht, sondern zeigt den Klartext', () => {
    const container = zeichne(TAFEL, {
      renderMarkdown: () => {
        throw new Error('Kette kaputt');
      },
    });
    const karten = [...container.querySelectorAll(`.${KARTE_KLASSE}`)];
    expect(karten).toHaveLength(3);
    expect(karten[0].querySelector('.kanban-karte-inhalt').textContent).toContain('Erste Karte');
  });
});

describe('Leere Zustände und Befunde (AK9)', () => {
  it('AK9: eine Tafel ohne Spalten wird benannt und bleibt nicht leer', () => {
    const container = zeichne(KOPF);
    expect(container.querySelector('.kanban-keine-spalten').textContent).toBe(
      de['kanban.keineSpalten'],
    );
    expect(container.querySelectorAll('.kanban-spalte')).toHaveLength(0);
  });

  it('AK9: eine Spalte ohne Karten sagt es an ihrer Stelle', () => {
    const container = zeichne(`${KOPF}\n## Offen\n\n## Erledigt\n\n- [ ] Eine\n`);
    const spalten = [...container.querySelectorAll('.kanban-spalte')];
    expect(spalten[0].querySelector('.kanban-leer-hinweis').textContent).toBe(
      de['kanban.keineKarten'],
    );
    expect(spalten[1].querySelector('.kanban-leer-hinweis')).toBeNull();
    expect(spalten[0].querySelector('.kanban-spalte-zaehler').textContent).toBe('0');
  });

  it('ein Dokument ohne Tafel-Kennzeichen zeigt den benannten Hinweis des Bestands', () => {
    // Der Schlüssel ist der aus 4T-001847; ein zweiter mit demselben Satz wäre
    // eine zweite Quelle derselben Aussage.
    const container = zeichne('---\ntags:\n---\n\n## Offen\n\n- [ ] Eine\n');
    expect(container.querySelector('.kanban-keine-tafel').textContent).toBe(
      de['kanban.keineTafel'],
    );
  });

  it('ein Befund des Format-Kerns wird verständlich angezeigt, ohne die Tafel zu leeren', () => {
    const mitOffenemBlock = `${KOPF}\n## Offen\n\n- [ ] Eine\n\n%% kanban:settings\n{"kanban-plugin":"board"}\n`;
    const container = zeichne(mitOffenemBlock);
    const kasten = container.querySelector('.kanban-befunde');
    expect(kasten, 'der Befund erscheint').not.toBeNull();
    expect(kasten.textContent).toContain(de['kanban.befund.einstellungsBlockOffen']);
    expect(kasten.querySelector('.kanban-befund-zeile').textContent).toMatch(/^Zeile \d+:$/);
    // Gegenprobe: Was lesbar war, steht weiterhin da.
    expect(container.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(1);
  });

  it('eine fehlerfreie Tafel bekommt keinen Befund-Kasten', () => {
    expect(zeichne(TAFEL).querySelector('.kanban-befunde')).toBeNull();
  });
});

describe('Geerbte Änderbarkeit und Auswahl (AK8)', () => {
  it('AK8: die Fläche sagt an einer Stelle, ob sie änderbar ist', () => {
    expect(zeichne(TAFEL).querySelector('.kanban-tafel').dataset.aenderbar).toBe('true');
    const nurAnsicht = zeichne(TAFEL, { aenderbar: false }).querySelector('.kanban-tafel');
    expect(nurAnsicht.dataset.aenderbar).toBe('false');
    expect(nurAnsicht.classList.contains('kanban-nur-ansicht')).toBe(true);
  });

  it('AK8: im nicht änderbaren Dokument entsteht kein Bedien-Griff', () => {
    // Dieser Vorgang zeichnet überhaupt keine Griffe; die Probe hält den Stand
    // fest, damit ein Bedien-Vorgang ihn nicht unbemerkt aufweicht.
    const container = zeichne(TAFEL, { aenderbar: false });
    expect(container.querySelectorAll('[class*="griff"]')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('AK8: Ansehen und Auswählen bleiben im nicht änderbaren Dokument möglich', () => {
    const container = zeichne(TAFEL, { aenderbar: false });
    const karten = [...container.querySelectorAll(`.${KARTE_KLASSE}`)];
    expect(karten.every((k) => k.tabIndex === 0)).toBe(true);
    waehleKarte(container, karten[1]);
    expect(karten[1].getAttribute('aria-selected')).toBe('true');
    expect(karten[0].getAttribute('aria-selected')).toBe('false');
    expect(gewaehlteKartenZeile(container)).toBe(8);
    waehleKarte(container, null);
    expect(gewaehlteKartenZeile(container)).toBeNull();
  });
});

describe('Nachzug beim Tippen: Roll-Stand und Auswahl überleben (4T-001848)', () => {
  it('die Auswahl wird über die Zeilen-Nummer wiedergefunden', () => {
    const container = zeichne(TAFEL);
    waehleKarte(container, container.querySelectorAll(`.${KARTE_KLASSE}`)[0]);
    const zustand = merkeZustand(container);
    expect(zustand.zeile).toBe(6);
    // Der häufige Fall des Nachzugs: Der Anwender tippt weiter unten, die
    // gewählte Karte bleibt, wo sie ist. Ohne den Erhalt wäre die Auswahl nach
    // jedem Tastendruck weg.
    const spaeter = `${TAFEL}- [ ] Vierte Karte\n`;
    zeichneTafel(container, leseTafel(spaeter), umgebung());
    stelleZustandHer(container, zustand);
    expect(gewaehlteKartenZeile(container)).toBe(6);
    const gewaehlt = container.querySelector(`.${KARTE_KLASSE}[aria-selected="true"]`);
    expect(gewaehlt.querySelector('.kanban-karte-inhalt').textContent).toContain('Erste Karte');
  });

  it('der Roll-Stand der Tafel und ihrer Spalten wird mitgenommen', () => {
    const container = zeichne(TAFEL);
    const zustand = merkeZustand(container);
    expect(zustand.spalten).toHaveLength(2);
    expect(zustand.links).toBe(0);
  });

  it('eine verschwundene Karte lässt die Tafel ohne Auswahl, nicht mit der falschen', () => {
    const container = zeichne(TAFEL);
    waehleKarte(container, container.querySelectorAll(`.${KARTE_KLASSE}`)[2]);
    const zustand = merkeZustand(container);
    zeichneTafel(container, leseTafel(`${KOPF}\n## Offen\n\n- [ ] Eine\n`), umgebung());
    stelleZustandHer(container, zustand);
    expect(gewaehlteKartenZeile(container)).toBeNull();
  });
});

describe('Einbettung in die Spalte: Puffer, Nachzug und Änderbarkeit (4T-001848)', () => {
  function spalte(tab, zugang = {}) {
    const el = document.createElement('section');
    initKanbanPane({
      getPaneEls: () => ({ kanbanEl: el }),
      aktivesDokument: () => tab,
      ...zugang,
    });
    return el;
  }

  it('gezeichnet wird aus dem Puffer des Dokuments, nicht von der Platte', () => {
    // Der Puffer ist `tab.content`; ein ungespeicherter Stand muss deshalb
    // genauso erscheinen wie ein gespeicherter (Regel der Puffer-Aktualität).
    const tab = { content: TAFEL, viewMode: 'kanban', path: 'C:/Notizen/Tafel.md', editMode: true };
    const el = spalte(tab);
    expect(renderKanban(0)).toBe(el);
    expect(el.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(3);
    expect(el.querySelector('.kanban-karte-inhalt').querySelector('a')).not.toBeNull();
  });

  it('ein unveränderter Stand wird nicht neu gezeichnet', () => {
    // Der Nachzug läuft im festen Takt; ohne diesen Merker liefe bei jedem
    // Takt ein Render-Aufruf je Karte über denselben Text.
    const tab = { content: TAFEL, viewMode: 'kanban', path: 'C:/Notizen/Tafel.md' };
    const el = spalte(tab);
    renderKanban(0);
    const vorher = el.querySelector(`.${KARTE_KLASSE}`);
    renderKanban(0);
    expect(el.querySelector(`.${KARTE_KLASSE}`)).toBe(vorher);
    // Gegenprobe: Ein geänderter Puffer zeichnet neu.
    tab.content = `${TAFEL}- [ ] Vierte Karte\n`;
    renderKanban(0);
    expect(el.querySelector(`.${KARTE_KLASSE}`)).not.toBe(vorher);
    expect(el.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(4);
  });

  it('außerhalb des Tafel-Modus wird nichts gezeichnet', () => {
    const tab = { content: TAFEL, viewMode: 'rendered', path: '' };
    const el = spalte(tab);
    expect(renderKanban(0)).toBeNull();
    expect(el.querySelectorAll(`.${KARTE_KLASSE}`)).toHaveLength(0);
  });

  it('AK8: die Fläche erbt die Änderbarkeit ihres Dokuments', () => {
    const tab = { content: TAFEL, viewMode: 'kanban', path: '' };
    let aenderbar = true;
    const el = spalte(tab, { istAenderbar: () => aenderbar });
    renderKanban(0);
    expect(istTafelAenderbar(0)).toBe(true);
    expect(el.querySelector('.kanban-tafel').dataset.aenderbar).toBe('true');
    aenderbar = false;
    renderKanban(0);
    expect(istTafelAenderbar(0)).toBe(false);
    expect(el.querySelector('.kanban-tafel').dataset.aenderbar).toBe('false');
    expect(el.querySelector('.kanban-tafel').classList.contains('kanban-nur-ansicht')).toBe(true);
  });

  it('ohne Auskunft über die Änderbarkeit gilt die Fläche als änderbar', () => {
    // Benannte Ausnahme von der Fail-closed-Regel, wie bei der Canvas: Diese
    // Frage entscheidet allein, ob eine Handlung angeboten wird; der
    // Schreibweg ist eigens gesichert.
    spalte({ content: TAFEL, viewMode: 'kanban', path: '' });
    expect(istTafelAenderbar(0)).toBe(true);
  });

  it('ein Klick wählt die Karte, Escape hebt die Auswahl auf', () => {
    const tab = { content: TAFEL, viewMode: 'kanban', path: '' };
    const el = spalte(tab);
    renderKanban(0);
    const karte = el.querySelectorAll(`.${KARTE_KLASSE}`)[1];
    karte.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(gewaehlteKartenZeile(el)).toBe(8);
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(gewaehlteKartenZeile(el)).toBeNull();
  });
});
