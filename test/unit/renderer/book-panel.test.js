// @vitest-environment jsdom
// 4T-0844 (Epic 3E-0147): Unit-Tests des Inhaltsverzeichnis-Panels (Story
// 4S-0753). Geprüft werden die reinen Helfer (Pfad-Zuordnung des gelesenen
// Kapitels, Schrittweite der Leseführung, Beschriftung) und das Rendering
// gegen einen gemockten Buch-Zustand: Baum in erklärter Reihenfolge,
// Hervorhebung des gelesenen Kapitels, Anfasser-Marker an jedem Eintrag,
// Markierung fehlender Kapitel, Abschnitt „nicht eingehängt" und der
// Leer-Hinweis ohne aktives Buch. Dazu kommen die Struktur-Pflege (4T-0845),
// das Verschieben der Kapitel-Datei (4T-0847) und die Reparatur fehlender
// Kapitel (4T-0848).
//
// Der Preload-Namensraum `books` ist gemockt (Muster area-panel-render.test.js:
// window.api-Stub plus Pane-Markup VOR dem Modul-Import, weil getPaneEls die
// Element-Referenzen beim ersten Zugriff memoisiert).
import { describe, it, expect, beforeEach } from 'vitest';
import './api-stub.js';

const pane0 = document.querySelector('.pane-group[data-pane="0"]');
pane0.innerHTML = `
  <section class="sidebar-section sidebar-book">
    <div class="book-nav">
      <button class="book-nav-btn book-prev"></button>
      <button class="book-nav-btn book-next"></button>
    </div>
    <div class="sidebar-section-body">
      <div class="book-empty"></div>
      <div class="book-main" hidden>
        <div class="book-tree"></div>
        <div class="book-unlinked" hidden>
          <div class="book-unlinked-title"></div>
          <div class="book-unlinked-list"></div>
        </div>
      </div>
    </div>
  </section>
`;

// 4T-0845: Kontextmenü-Container (dialogs.js greift ihn über die ID) und die
// Statusbar-Hinweiszeile stehen im Bestands-Markup der App; im Unit-Kontext
// werden sie hier nachgestellt.
document.body.insertAdjacentHTML('beforeend', '<div id="context-menu" hidden></div>');

// Geöffnete Kapitel sammeln statt zu öffnen — der Klick-Weg ist damit prüfbar,
// ohne den Main-Prozess zu brauchen. 4T-0845: dasselbe für die Struktur-
// Operationen; `opAntwort` steuert den Fehlerfall.
const geoeffnet = [];
const gemeldeteOps = [];
const angelegteKapitel = [];
// 4T-0847: gemeldete Verschiebe-Aufrufe; `moveAntwort` steuert den Fehlerfall
// (der Ordner-Dialog selbst läuft im Main und bleibt manueller Test).
const verschoben = [];
// 4T-0848: Vorschlags-Abrufe, gemeldete Zuordnungen und Datei-Dialog-Aufrufe;
// `suggestAntwort` und `reassignAntwort` steuern Fund-Lage und Fehlerfall.
const vorschlagsAbrufe = [];
const zugeordnet = [];
const dialogAufrufe = [];
let opAntwort = { ok: true };
let moveAntwort = { ok: true };
let suggestAntwort = { ok: true, suggestions: [] };
let reassignAntwort = { ok: true };
window.api.books = {
  getState: async () => ({ active: null }),
  onStateChanged: () => {},
  openChapter: async (relPath) => {
    geoeffnet.push(relPath);
    return { ok: true };
  },
  applyTreeOp: async (op) => {
    gemeldeteOps.push(op);
    return opAntwort;
  },
  createChapter: async (parentPath, name) => {
    angelegteKapitel.push({ parentPath, name });
    return opAntwort;
  },
  moveChapterFile: async (relPath) => {
    verschoben.push(relPath);
    return moveAntwort;
  },
  suggestMissing: async (missingPath) => {
    vorschlagsAbrufe.push(missingPath);
    return suggestAntwort;
  },
  reassignChapter: async (missingPath, newPath) => {
    zugeordnet.push({ missingPath, newPath });
    return reassignAntwort;
  },
  reassignChapterDialog: async (missingPath) => {
    dialogAufrufe.push(missingPath);
    return reassignAntwort;
  },
};

// 4T-0980 (Epic 3E-0196): book-panel.js ist in den Feature-Ordner books/
// geschnitten. Die reinen Helfer liegen in book-helpers.js, das Verschieben der
// Kapitel-Datei in book-repair.js, Anzeige und Verdrahtung im Kern. Die
// Testfälle selbst sind unverändert; nur die Bezugsquellen ziehen mit.
const {
  chapterLabel,
  chapterPathFromFile,
  dropTreeOp,
  dropZone,
  pathKey,
  readingTarget,
  subtreeKeys,
} = await import('../../../src/renderer/modules/books/book-helpers.js');
const { initBookPanel, renderBookPanel, setBookState, stepReading } =
  await import('../../../src/renderer/modules/books/book-panel.js');
const { moveActiveChapterFile, moveChapterFile } =
  await import('../../../src/renderer/modules/books/book-repair.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');

const BOOK_DIR = 'C:\\Bücher\\Reise nach Ithaka';

// Buch mit zwei Teilen, einem Unterkapitel, einer nicht eingehängten Datei
// und einem deklarierten Kapitel ohne Datei.
function buchStand() {
  return {
    active: {
      bookDir: BOOK_DIR,
      bookFileName: 'Reise nach Ithaka.md',
      tree: [
        {
          path: 'Teil 1/Aufbruch.md',
          children: [{ path: 'Teil 1/Der Hafen.md', children: [] }],
        },
        { path: 'Teil 2/Heimkehr.md', children: [] },
      ],
      readingOrder: ['Teil 1/Aufbruch.md', 'Teil 1/Der Hafen.md', 'Teil 2/Heimkehr.md'],
      unlinked: ['Notizen/Skizze.md'],
      missing: ['Teil 2/Heimkehr.md'],
      // 4T-0848: namensgleicher Fund zum fehlenden Kapitel (der Main-Prozess
      // legt ihn dem Zustand bei).
      missingSuggestions: { 'Teil 2/Heimkehr.md': ['Archiv/Heimkehr.md'] },
    },
  };
}

// Aktiven Reiter der Spalte 0 auf eine Datei setzen (null = kein Reiter).
function setzeReiter(absPfad) {
  const pane = state.panes[0];
  if (absPfad === null) {
    pane.tabs = [];
    pane.activeIndex = -1;
    return;
  }
  pane.tabs = [{ path: absPfad }];
  pane.activeIndex = 0;
}

const zeilen = () => [...pane0.querySelectorAll('.book-tree .book-entry-row')];
const zeileMit = (relPfad) => zeilen().find((r) => r.dataset.pfad === relPfad);
const losZeilen = () => [...pane0.querySelectorAll('.book-unlinked-list .book-entry-row')];
const menue = () => document.getElementById('context-menu');
const menueEintrag = (id) => menue().querySelector(`[data-menu-id="${id}"]`);
const hinweis = () => document.getElementById('statusbar-hint');

// Ereignis-Schleife einmal leerlaufen lassen: die Bedien-Wege melden ihre
// Operation asynchron an die (gemockte) Preload-Brücke.
const abwarten = () => new Promise((r) => setTimeout(r, 0));

// 4T-0845: Die Ablage auf freier Fläche und das Kontextmenü der Panel-Fläche
// hängen am beständigen Markup und werden einmalig in initBookPanel gebunden.
initBookPanel();
await abwarten();

// Tastatur-Geste am fokussierten Eintrag.
function taste(zeile, key, altKey = true) {
  zeile.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true }));
}

// Zug am Anfasser der Quell-Zeile und Ablage über dem Ziel. `clientY` liegt in
// einer 30 Pixel hohen Zeile: 5 = oberes Drittel, 15 = Mitte, 25 = unteres
// Drittel. jsdom rechnet kein Layout, deshalb wird das Rechteck gestellt.
function ziehen(quelle, ziel, clientY) {
  const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };
  const start = new MouseEvent('dragstart', { bubbles: true });
  Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
  quelle.querySelector('.book-entry-handle').dispatchEvent(start);
  if (ziel) {
    ziel.getBoundingClientRect = () => ({ top: 0, height: 30, left: 0, width: 100 });
  }
  const drop = new MouseEvent('drop', { bubbles: true, clientY: clientY || 0 });
  Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
  (ziel || pane0.querySelector('.book-tree')).dispatchEvent(drop);
  return abwarten();
}

function rechtsklick(el) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
}

beforeEach(() => {
  geoeffnet.length = 0;
  gemeldeteOps.length = 0;
  angelegteKapitel.length = 0;
  verschoben.length = 0;
  vorschlagsAbrufe.length = 0;
  zugeordnet.length = 0;
  dialogAufrufe.length = 0;
  opAntwort = { ok: true };
  moveAntwort = { ok: true };
  suggestAntwort = { ok: true, suggestions: ['Archiv/Heimkehr.md'] };
  reassignAntwort = { ok: true };
  state.bookPanel.visibleByPane[0] = true;
  state.bookPanel.visibleByPane[1] = false;
  menue().innerHTML = '';
  menue().hidden = true;
  hinweis().textContent = '';
  hinweis().className = '';
  setzeReiter(null);
  setBookState({ active: null });
  // Ohne aktives Buch baut das Panel die Zeilen nicht neu auf; ein offener
  // Zuordnungs-Block des vorigen Falls bliebe sonst stehen.
  pane0.querySelectorAll('.book-reassign').forEach((el) => el.remove());
});

describe('Reine Helfer (4T-0844)', () => {
  it('pathKey vereinheitlicht Trenner, Schluss-Trenner und Schreibweise', () => {
    expect(pathKey('Teil 1\\Aufbruch.MD')).toBe('teil 1/aufbruch.md');
    expect(pathKey('C:/Buch/')).toBe('c:/buch');
    expect(pathKey(null)).toBe('');
  });

  it('chapterPathFromFile liefert den buch-relativen Pfad in Datei-Schreibweise', () => {
    expect(chapterPathFromFile(BOOK_DIR, `${BOOK_DIR}\\Teil 1\\Aufbruch.md`)).toBe(
      'Teil 1/Aufbruch.md',
    );
    // Schreibweise des Ordners egal (Windows-Dateisystem), Ergebnis bleibt
    // die Schreibweise der Datei.
    expect(chapterPathFromFile(BOOK_DIR.toLowerCase(), `${BOOK_DIR}/Teil 2/Heimkehr.md`)).toBe(
      'Teil 2/Heimkehr.md',
    );
  });

  it('chapterPathFromFile lehnt Dateien ausserhalb des Buch-Ordners ab', () => {
    expect(chapterPathFromFile(BOOK_DIR, 'C:\\Woanders\\Datei.md')).toBeNull();
    // Praefix-Falle: derselbe Namensanfang ist kein Unterordner.
    expect(chapterPathFromFile(BOOK_DIR, `${BOOK_DIR} Anhang\\Datei.md`)).toBeNull();
    expect(chapterPathFromFile(BOOK_DIR, BOOK_DIR)).toBeNull();
    expect(chapterPathFromFile('', 'C:\\Datei.md')).toBeNull();
  });

  it('readingTarget geht in der Lese-Ordnung vor und zurueck', () => {
    const order = ['a.md', 'b.md', 'c.md'];
    expect(readingTarget(order, 'a.md', 1)).toBe('b.md');
    expect(readingTarget(order, 'b.md', -1)).toBe('a.md');
    expect(readingTarget(order, 'c.md', 1)).toBeNull();
    expect(readingTarget(order, 'a.md', -1)).toBeNull();
  });

  it('readingTarget startet ohne gelesenes Kapitel beim ersten Kapitel', () => {
    const order = ['a.md', 'b.md'];
    // Beim Oeffnen steht der Reiter auf der Buch-Datei: "vor" ist der
    // Einstieg, "zurueck" hat kein Ziel.
    expect(readingTarget(order, null, 1)).toBe('a.md');
    expect(readingTarget(order, null, -1)).toBeNull();
    expect(readingTarget([], null, 1)).toBeNull();
  });

  it('chapterLabel zeigt den Dateinamen ohne Ordner und Endung', () => {
    expect(chapterLabel('Teil 1/Der Hafen.md')).toBe('Der Hafen');
    expect(chapterLabel('Anhang.MD')).toBe('Anhang');
    expect(chapterLabel('')).toBe('');
  });
});

describe('Rendering des Inhaltsverzeichnisses (4T-0844)', () => {
  it('ohne aktives Buch bleibt der Leer-Hinweis stehen', () => {
    renderBookPanel(0);
    expect(pane0.querySelector('.book-empty').hidden).toBe(false);
    expect(pane0.querySelector('.book-main').hidden).toBe(true);
    expect(pane0.querySelector('.book-prev').disabled).toBe(true);
    expect(pane0.querySelector('.book-next').disabled).toBe(true);
  });

  it('AK1: der Baum zeigt alle Kapitel in erklaerter Reihenfolge und Verschachtelung', () => {
    setBookState(buchStand());
    const rows = zeilen();
    expect(rows.map((r) => r.dataset.pfad)).toEqual([
      'Teil 1/Aufbruch.md',
      'Teil 1/Der Hafen.md',
      'Teil 2/Heimkehr.md',
    ]);
    // Unterkapitel eine Stufe eingerueckt (6 + Tiefe * 14).
    expect(rows[0].style.paddingLeft).toBe('6px');
    expect(rows[1].style.paddingLeft).toBe('20px');
    expect(pane0.querySelector('.book-empty').hidden).toBe(true);
  });

  it('AK2: das gelesene Kapitel ist hervorgehoben, Klick oeffnet das Kapitel', () => {
    setzeReiter(`${BOOK_DIR}\\Teil 1\\Der Hafen.md`);
    setBookState(buchStand());
    const rows = zeilen();
    expect(rows.filter((r) => r.classList.contains('active')).map((r) => r.dataset.pfad)).toEqual([
      'Teil 1/Der Hafen.md',
    ]);
    rows[0].click();
    expect(geoeffnet).toEqual(['Teil 1/Aufbruch.md']);
  });

  it('AK3: nicht eingehaengte Dateien erscheinen im eigenen Abschnitt', () => {
    setBookState(buchStand());
    const abschnitt = pane0.querySelector('.book-unlinked');
    expect(abschnitt.hidden).toBe(false);
    const rows = [...pane0.querySelectorAll('.book-unlinked-list .book-entry-row')];
    expect(rows.map((r) => r.dataset.pfad)).toEqual(['Notizen/Skizze.md']);
    rows[0].click();
    expect(geoeffnet).toEqual(['Notizen/Skizze.md']);
  });

  it('AK3: ohne solche Dateien bleibt der Abschnitt verborgen', () => {
    const stand = buchStand();
    stand.active.unlinked = [];
    setBookState(stand);
    expect(pane0.querySelector('.book-unlinked').hidden).toBe(true);
  });

  it('AK4: jeder Eintrag traegt einen Marker als Anfasser', () => {
    setBookState(buchStand());
    const alle = [...pane0.querySelectorAll('.book-entry-row')];
    expect(alle.length).toBe(4);
    for (const row of alle) {
      expect(row.querySelector('.book-entry-handle')).not.toBeNull();
    }
  });

  it('ein deklariertes Kapitel ohne Datei ist markiert und nicht anklickbar', () => {
    setBookState(buchStand());
    const fehlt = zeilen().find((r) => r.dataset.pfad === 'Teil 2/Heimkehr.md');
    expect(fehlt.classList.contains('missing')).toBe(true);
    expect(fehlt.title).toContain('Teil 2/Heimkehr.md');
    fehlt.click();
    expect(geoeffnet).toEqual([]);
  });

  it('ein Buch ohne eingehaengtes Kapitel zeigt den eigenen Hinweis', () => {
    const stand = buchStand();
    stand.active.tree = [];
    stand.active.readingOrder = [];
    stand.active.missing = [];
    setBookState(stand);
    expect(zeilen()).toHaveLength(0);
    expect(pane0.querySelector('.book-chapters-empty')).not.toBeNull();
  });

  it('ein zweiter Lauf haengt die Zeilen nicht doppelt an', () => {
    setBookState(buchStand());
    renderBookPanel(0);
    expect(zeilen()).toHaveLength(3);
  });
});

describe('Lesefuehrung im Panel-Kopf (4T-0844)', () => {
  it('ohne gelesenes Kapitel fuehrt vor zum ersten Kapitel, zurueck ist gesperrt', () => {
    setzeReiter(`${BOOK_DIR}\\Reise nach Ithaka.md`);
    setBookState(buchStand());
    expect(pane0.querySelector('.book-prev').disabled).toBe(true);
    expect(pane0.querySelector('.book-next').disabled).toBe(false);
    stepReading(0, 1);
    expect(geoeffnet).toEqual(['Teil 1/Aufbruch.md']);
  });

  it('mitten im Buch sind beide Richtungen frei', () => {
    setzeReiter(`${BOOK_DIR}\\Teil 1\\Der Hafen.md`);
    setBookState(buchStand());
    expect(pane0.querySelector('.book-prev').disabled).toBe(false);
    expect(pane0.querySelector('.book-next').disabled).toBe(false);
    stepReading(0, -1);
    stepReading(0, 1);
    expect(geoeffnet).toEqual(['Teil 1/Aufbruch.md', 'Teil 2/Heimkehr.md']);
  });

  it('am Ende der Lese-Ordnung ist vor gesperrt und bleibt wirkungslos', () => {
    setzeReiter(`${BOOK_DIR}\\Teil 2\\Heimkehr.md`);
    setBookState(buchStand());
    expect(pane0.querySelector('.book-next').disabled).toBe(true);
    stepReading(0, 1);
    expect(geoeffnet).toEqual([]);
  });
});

// --- 4T-0846 (Story 4S-0755): Leseführung über Kapitel-Grenzen --------------

describe('Leseführung über Kapitel-Grenzen (4T-0846)', () => {
  it('AK1: der Schritt folgt der Lese-Ordnung über Datei- und Ebenen-Grenzen', () => {
    // Von einem Kapitel in sein Unterkapitel, von dort in den nächsten Teil:
    // ein Kapitel steht vor seinen Unterkapiteln, danach die Geschwister.
    setzeReiter(`${BOOK_DIR}\\Teil 1\\Aufbruch.md`);
    setBookState(buchStand());
    stepReading(0, 1);
    setzeReiter(`${BOOK_DIR}\\Teil 1\\Der Hafen.md`);
    setBookState(buchStand());
    stepReading(0, 1);
    expect(geoeffnet).toEqual(['Teil 1/Der Hafen.md', 'Teil 2/Heimkehr.md']);
  });

  it('AK3: am Ende meldet die Hinweis-Zeile die Grenze, statt umzulaufen', () => {
    setzeReiter(`${BOOK_DIR}\\Teil 2\\Heimkehr.md`);
    setBookState(buchStand());
    stepReading(0, 1);
    expect(geoeffnet).toEqual([]);
    expect(hinweis().textContent).toBe('bookPanel.readingAtEnd');
  });

  it('AK3: am Anfang gilt dasselbe in der Gegenrichtung', () => {
    setzeReiter(`${BOOK_DIR}\\Teil 1\\Aufbruch.md`);
    setBookState(buchStand());
    stepReading(0, -1);
    expect(geoeffnet).toEqual([]);
    expect(hinweis().textContent).toBe('bookPanel.readingAtStart');
  });

  it('AK4: eine nicht eingehängte Datei liegt außerhalb der Führung', () => {
    setzeReiter(`${BOOK_DIR}\\Notizen\\Skizze.md`);
    setBookState(buchStand());
    // Sie hat keine Position in der Lese-Ordnung: zurück gibt es kein Ziel,
    // vor beginnt das Buch von vorn.
    stepReading(0, -1);
    expect(hinweis().textContent).toBe('bookPanel.readingAtStart');
    stepReading(0, 1);
    expect(geoeffnet).toEqual(['Teil 1/Aufbruch.md']);
  });

  it('ohne aktives Buch nennt der Hinweis den Grund', () => {
    setBookState({ active: null });
    stepReading(0, 1);
    expect(geoeffnet).toEqual([]);
    expect(hinweis().textContent).toBe('bookPanel.readingNoBook');
    expect(hinweis().classList.contains('error')).toBe(true);
  });
});

// --- 4T-0847 (Story 4S-0756): Kapitel-Datei verschieben -----------------------

describe('Kapitel-Datei verschieben (4T-0847)', () => {
  it('das Kontextmenü trägt den Eintrag auf Kapitel- und auf losen Zeilen', () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 1/Aufbruch.md'));
    expect(menueEintrag('book-move-file')).not.toBeNull();
    rechtsklick(losZeilen()[0]);
    expect(menueEintrag('book-move-file')).not.toBeNull();
  });

  it('ein fehlendes Kapitel bekommt den Eintrag nicht', () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 2/Heimkehr.md'));
    expect(menueEintrag('book-move-file')).toBeNull();
    expect(menueEintrag('book-detach')).not.toBeNull();
  });

  it('der Klick meldet den buch-relativen Pfad an den Main-Prozess', async () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 1/Der Hafen.md'));
    menueEintrag('book-move-file').click();
    await abwarten();
    expect(verschoben).toEqual(['Teil 1/Der Hafen.md']);
    expect(hinweis().textContent).toBe('');
  });

  it('AK4: ein Ziel außerhalb des Buch-Ordners nennt den Grund', async () => {
    setBookState(buchStand());
    moveAntwort = { ok: false, error: 'outside-book' };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('bookPanel.moveOutsideBook');
    expect(hinweis().classList.contains('error')).toBe(true);
  });

  it('Kollision und Buch-Datei haben eigene Meldungen, Unbekanntes fällt zurück', async () => {
    setBookState(buchStand());
    moveAntwort = { ok: false, error: 'exists' };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('bookPanel.moveExists');
    moveAntwort = { ok: false, error: 'book-file' };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('bookPanel.moveBookFile');
    moveAntwort = { ok: false, error: 'write-failed' };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('bookPanel.moveFailed');
  });

  it('abgebrochener Dialog und unveränderte Lage bleiben still', async () => {
    setBookState(buchStand());
    moveAntwort = { ok: false, canceled: true };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('');
    moveAntwort = { ok: false, error: 'unchanged' };
    await moveChapterFile('Teil 1/Aufbruch.md');
    expect(hinweis().textContent).toBe('');
  });

  it('das Kommando wirkt auf die gelesene Datei der Spalte', async () => {
    setzeReiter(`${BOOK_DIR}\\Teil 2\\Heimkehr.md`);
    setBookState(buchStand());
    moveActiveChapterFile(0);
    await abwarten();
    expect(verschoben).toEqual(['Teil 2/Heimkehr.md']);
  });

  it('das Kommando meldet eine Datei außerhalb des Buches statt still zu bleiben', async () => {
    setzeReiter('C:\\Woanders\\Notiz.md');
    setBookState(buchStand());
    moveActiveChapterFile(0);
    await abwarten();
    expect(verschoben).toEqual([]);
    expect(hinweis().textContent).toBe('bookPanel.moveNoChapter');
    // Dasselbe ohne aktives Buch.
    hinweis().textContent = '';
    setBookState({ active: null });
    moveActiveChapterFile(0);
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.moveNoChapter');
  });
});

// --- 4T-0845 (Story 4S-0754): Struktur-Pflege ---------------------------------

const BAUM = buchStand().active.tree;

describe('Ziel-Berechnung der Ablage (4T-0845)', () => {
  it('dropZone drittelt die Zeile in davor, hinein und dahinter', () => {
    expect(dropZone(2, 30)).toBe('before');
    expect(dropZone(15, 30)).toBe('into');
    expect(dropZone(28, 30)).toBe('after');
    // Ohne gemessene Höhe (frisch gebaute Zeile) bleibt das Einhängen übrig.
    expect(dropZone(0, 0)).toBe('into');
  });

  it('subtreeKeys sperrt den eigenen Knoten samt Unterbaum', () => {
    expect([...subtreeKeys(BAUM, 'Teil 1/Aufbruch.md')]).toEqual([
      'teil 1/aufbruch.md',
      'teil 1/der hafen.md',
    ]);
    expect(subtreeKeys(BAUM, 'Teil 2/Heimkehr.md').size).toBe(1);
    expect(subtreeKeys(BAUM, 'gibt-es-nicht.md').size).toBe(0);
  });

  it('AK1: Ablage AUF einem Eintrag hängt als dessen Unterkapitel ein', () => {
    expect(
      dropTreeOp(BAUM, 'Teil 2/Heimkehr.md', { path: 'Teil 1/Aufbruch.md', zone: 'into' }),
    ).toEqual({
      type: 'move',
      path: 'Teil 2/Heimkehr.md',
      parentPath: 'Teil 1/Aufbruch.md',
      index: null,
    });
  });

  it('AK1: Ablage zwischen Einträgen ordnet in der Ebene', () => {
    expect(
      dropTreeOp(BAUM, 'Teil 2/Heimkehr.md', { path: 'Teil 1/Aufbruch.md', zone: 'before' }),
    ).toEqual({ type: 'move', path: 'Teil 2/Heimkehr.md', parentPath: null, index: 0 });
    // Der Index zählt NACH dem Aushängen: das Ziel unterhalb der eigenen
    // Position rückt um eins vor.
    expect(
      dropTreeOp(BAUM, 'Teil 1/Aufbruch.md', { path: 'Teil 2/Heimkehr.md', zone: 'after' }),
    ).toEqual({ type: 'move', path: 'Teil 1/Aufbruch.md', parentPath: null, index: 1 });
  });

  it('eine Ablage ohne Wirkung liefert keine Operation', () => {
    // Auf sich selbst.
    expect(
      dropTreeOp(BAUM, 'Teil 2/Heimkehr.md', { path: 'Teil 2/Heimkehr.md', zone: 'into' }),
    ).toBeNull();
    // Unverändert derselbe Platz.
    expect(
      dropTreeOp(BAUM, 'Teil 1/Aufbruch.md', { path: 'Teil 2/Heimkehr.md', zone: 'before' }),
    ).toBeNull();
    // Unbekanntes Ziel.
    expect(dropTreeOp(BAUM, 'Teil 1/Aufbruch.md', { path: 'weg.md', zone: 'into' })).toBeNull();
    expect(dropTreeOp(BAUM, '', null)).toBeNull();
  });

  it('AK5: das eigene Unterkapitel ist als Ziel gesperrt', () => {
    expect(
      dropTreeOp(BAUM, 'Teil 1/Aufbruch.md', { path: 'Teil 1/Der Hafen.md', zone: 'into' }),
    ).toBeNull();
    expect(
      dropTreeOp(BAUM, 'Teil 1/Aufbruch.md', { path: 'Teil 1/Der Hafen.md', zone: 'before' }),
    ).toBeNull();
  });

  it('AK3: ein nicht eingehängter Eintrag hängt ein statt umzuhängen', () => {
    expect(
      dropTreeOp(BAUM, 'Notizen/Skizze.md', { path: 'Teil 2/Heimkehr.md', zone: 'into' }, true),
    ).toEqual({
      type: 'insert',
      path: 'Notizen/Skizze.md',
      parentPath: 'Teil 2/Heimkehr.md',
      index: null,
    });
    // Freie Fläche: ans Ende der obersten Ebene.
    expect(dropTreeOp(BAUM, 'Notizen/Skizze.md', null, true)).toEqual({
      type: 'insert',
      path: 'Notizen/Skizze.md',
      parentPath: null,
      index: null,
    });
  });
});

describe('Drag and Drop im Panel (4T-0845)', () => {
  it('AK1: die Ablage in der Mitte meldet genau eine Operation', async () => {
    setBookState(buchStand());
    await ziehen(zeileMit('Teil 2/Heimkehr.md'), zeileMit('Teil 1/Aufbruch.md'), 15);
    expect(gemeldeteOps).toEqual([
      {
        type: 'move',
        path: 'Teil 2/Heimkehr.md',
        parentPath: 'Teil 1/Aufbruch.md',
        index: null,
      },
    ]);
  });

  it('AK1: die Ablage am oberen Rand ordnet davor ein', async () => {
    setBookState(buchStand());
    await ziehen(zeileMit('Teil 2/Heimkehr.md'), zeileMit('Teil 1/Aufbruch.md'), 2);
    expect(gemeldeteOps).toEqual([
      { type: 'move', path: 'Teil 2/Heimkehr.md', parentPath: null, index: 0 },
    ]);
  });

  it('AK3: ein Eintrag aus „nicht eingehängt" wandert in den Baum', async () => {
    setBookState(buchStand());
    await ziehen(losZeilen()[0], zeileMit('Teil 1/Aufbruch.md'), 15);
    expect(gemeldeteOps).toEqual([
      {
        type: 'insert',
        path: 'Notizen/Skizze.md',
        parentPath: 'Teil 1/Aufbruch.md',
        index: null,
      },
    ]);
  });

  it('AK3: die Ablage auf freier Fläche hängt ans Ende der obersten Ebene', async () => {
    setBookState(buchStand());
    await ziehen(losZeilen()[0], null, 0);
    expect(gemeldeteOps).toEqual([
      { type: 'insert', path: 'Notizen/Skizze.md', parentPath: null, index: null },
    ]);
  });

  it('AK5: die Ablage im eigenen Unterbaum meldet nichts', async () => {
    setBookState(buchStand());
    await ziehen(zeileMit('Teil 1/Aufbruch.md'), zeileMit('Teil 1/Der Hafen.md'), 15);
    expect(gemeldeteOps).toEqual([]);
  });
});

describe('Tastatur-Gesten am Eintrag (4T-0845)', () => {
  it('AK2: Alt und die Pfeiltasten decken alle vier Verschiebungen ab', async () => {
    setBookState(buchStand());
    const zeile = zeileMit('Teil 2/Heimkehr.md');
    taste(zeile, 'ArrowUp');
    taste(zeile, 'ArrowDown');
    taste(zeile, 'ArrowRight');
    taste(zeile, 'ArrowLeft');
    await abwarten();
    expect(gemeldeteOps).toEqual([
      { type: 'moveWithinLevel', path: 'Teil 2/Heimkehr.md', direction: 'up' },
      { type: 'moveWithinLevel', path: 'Teil 2/Heimkehr.md', direction: 'down' },
      { type: 'indent', path: 'Teil 2/Heimkehr.md' },
      { type: 'outdent', path: 'Teil 2/Heimkehr.md' },
    ]);
  });

  it('ohne Alt und auf nicht eingehängten Einträgen passiert nichts', async () => {
    setBookState(buchStand());
    taste(zeileMit('Teil 2/Heimkehr.md'), 'ArrowUp', false);
    taste(losZeilen()[0], 'ArrowUp');
    await abwarten();
    expect(gemeldeteOps).toEqual([]);
  });

  it('der Eintrag ist fokussierbar und öffnet mit Enter', async () => {
    setBookState(buchStand());
    const zeile = zeileMit('Teil 1/Aufbruch.md');
    expect(zeile.tabIndex).toBe(0);
    taste(zeile, 'Enter', false);
    await abwarten();
    expect(geoeffnet).toEqual(['Teil 1/Aufbruch.md']);
  });

  it('nach dem Verschieben liegt der Fokus wieder auf dem Kapitel', async () => {
    setBookState(buchStand());
    taste(zeileMit('Teil 2/Heimkehr.md'), 'ArrowUp');
    await abwarten();
    // Der Zustands-Push des Main-Prozesses baut die Zeilen neu auf.
    setBookState(buchStand());
    expect(document.activeElement.dataset.pfad).toBe('Teil 2/Heimkehr.md');
  });
});

describe('Kontextmenü des Inhaltsverzeichnisses (4T-0845)', () => {
  it('AK3: eine Baum-Zeile bietet neues Kapitel und Aushängen', async () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 1/Aufbruch.md'));
    expect(menueEintrag('book-new-chapter')).not.toBeNull();
    expect(menueEintrag('book-attach')).toBeNull();
    menueEintrag('book-detach').click();
    await abwarten();
    expect(gemeldeteOps).toEqual([{ type: 'remove', path: 'Teil 1/Aufbruch.md' }]);
  });

  it('AK3: eine nicht eingehängte Zeile bietet Einhängen', async () => {
    setBookState(buchStand());
    rechtsklick(losZeilen()[0]);
    expect(menueEintrag('book-detach')).toBeNull();
    menueEintrag('book-attach').click();
    await abwarten();
    expect(gemeldeteOps).toEqual([
      { type: 'insert', path: 'Notizen/Skizze.md', parentPath: null, index: null },
    ]);
  });

  it('die freie Panel-Fläche legt ein Kapitel auf oberster Ebene an', async () => {
    setBookState(buchStand());
    rechtsklick(pane0.querySelector('.book-tree'));
    menueEintrag('book-new-chapter-root').click();
    const eingabe = pane0.querySelector('.book-new-chapter-input');
    expect(eingabe).not.toBeNull();
    eingabe.value = '  Nachwort  ';
    eingabe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await abwarten();
    expect(angelegteKapitel).toEqual([{ parentPath: null, name: 'Nachwort' }]);
  });

  it('das neue Kapitel eines Eintrags entsteht unter diesem Eintrag', async () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 1/Aufbruch.md'));
    menueEintrag('book-new-chapter').click();
    const eingabe = pane0.querySelector('.book-new-chapter-input');
    eingabe.value = 'Der Wind';
    eingabe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await abwarten();
    expect(angelegteKapitel).toEqual([{ parentPath: 'Teil 1/Aufbruch.md', name: 'Der Wind' }]);
  });

  it('Escape bricht die Namens-Eingabe ab', async () => {
    setBookState(buchStand());
    rechtsklick(pane0.querySelector('.book-tree'));
    menueEintrag('book-new-chapter-root').click();
    const eingabe = pane0.querySelector('.book-new-chapter-input');
    eingabe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await abwarten();
    expect(pane0.querySelector('.book-new-chapter-input')).toBeNull();
    expect(angelegteKapitel).toEqual([]);
  });
});

// --- 4T-0848 (Story 4S-0757): Reparatur fehlender Kapitel ---------------------

const zuordnung = () => pane0.querySelector('.book-reassign');
const zuordnungsOptionen = () => [...pane0.querySelectorAll('.book-reassign-option')];

// Kontextmenü der fehlenden Zeile öffnen und „neu zuordnen" wählen.
async function starteZuordnung() {
  rechtsklick(zeileMit('Teil 2/Heimkehr.md'));
  menueEintrag('book-reassign').click();
  await abwarten();
}

describe('Reparatur fehlender Kapitel (4T-0848)', () => {
  it('AK1: der Fund wird am fehlenden Eintrag angezeigt, ohne das Menü zu öffnen', () => {
    setBookState(buchStand());
    const fehlt = zeileMit('Teil 2/Heimkehr.md');
    expect(fehlt.classList.contains('missing')).toBe(true);
    const marke = fehlt.querySelector('.book-entry-suggest-mark');
    expect(marke).not.toBeNull();
    expect(marke.title).toBe('bookPanel.reassignSuggestion');
  });

  it('ohne Fund bleibt der Eintrag ohne Vorschlags-Zeichen', () => {
    const stand = buchStand();
    stand.active.missingSuggestions = {};
    setBookState(stand);
    expect(zeileMit('Teil 2/Heimkehr.md').querySelector('.book-entry-suggest-mark')).toBeNull();
  });

  it('AK2: das Kontextmenü der fehlenden Zeile trägt beide Reparatur-Wege', () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 2/Heimkehr.md'));
    expect(menueEintrag('book-reassign')).not.toBeNull();
    expect(menueEintrag('book-detach')).not.toBeNull();
    // Eine vorhandene Kapitel-Zeile hat nichts zu reparieren.
    rechtsklick(zeileMit('Teil 1/Aufbruch.md'));
    expect(menueEintrag('book-reassign')).toBeNull();
  });

  it('AK2: Aushängen meldet die Baum-Operation wie bei jeder Kapitel-Zeile', async () => {
    setBookState(buchStand());
    rechtsklick(zeileMit('Teil 2/Heimkehr.md'));
    menueEintrag('book-detach').click();
    await abwarten();
    expect(gemeldeteOps).toEqual([{ type: 'remove', path: 'Teil 2/Heimkehr.md' }]);
  });

  it('AK3: genau ein Fund wird als Vorschlag vorbelegt, aber nicht ausgeführt', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    expect(vorschlagsAbrufe).toEqual(['Teil 2/Heimkehr.md']);
    const optionen = zuordnungsOptionen();
    expect(optionen.map((o) => o.dataset.pfad)).toEqual(['Archiv/Heimkehr.md']);
    expect(optionen[0].classList.contains('suggested')).toBe(true);
    // Nichts geschieht automatisch: erst der Klick ordnet zu.
    expect(zugeordnet).toEqual([]);
    expect(zuordnung().dataset.pfad).toBe('Teil 2/Heimkehr.md');
  });

  it('AK3: mehrere Funde stehen als Auswahl ohne Vorbelegung', async () => {
    setBookState(buchStand());
    suggestAntwort = { ok: true, suggestions: ['Archiv/Heimkehr.md', 'Entwürfe/Heimkehr.md'] };
    await starteZuordnung();
    const optionen = zuordnungsOptionen();
    expect(optionen.map((o) => o.dataset.pfad)).toEqual([
      'Archiv/Heimkehr.md',
      'Entwürfe/Heimkehr.md',
    ]);
    expect(optionen.some((o) => o.classList.contains('suggested'))).toBe(false);
  });

  it('AK2: der Klick auf den Vorschlag meldet die Zuordnung an den Main-Prozess', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    zuordnungsOptionen()[0].click();
    await abwarten();
    expect(zugeordnet).toEqual([
      { missingPath: 'Teil 2/Heimkehr.md', newPath: 'Archiv/Heimkehr.md' },
    ]);
    // Nach Erfolg bleibt die Auswahl nicht stehen.
    expect(zuordnung()).toBeNull();
    expect(hinweis().textContent).toBe('');
  });

  it('ohne namensgleichen Fund führt der Weg direkt zur Datei-Wahl', async () => {
    setBookState(buchStand());
    suggestAntwort = { ok: true, suggestions: [] };
    await starteZuordnung();
    expect(dialogAufrufe).toEqual(['Teil 2/Heimkehr.md']);
    expect(zuordnung()).toBeNull();
  });

  it('aus der Auswahl heraus führt „andere Datei" zum Datei-Dialog', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    pane0.querySelector('.book-reassign-browse').click();
    await abwarten();
    expect(dialogAufrufe).toEqual(['Teil 2/Heimkehr.md']);
    expect(zuordnung()).toBeNull();
  });

  it('Abbrechen schließt die Auswahl, ohne etwas zu melden', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    pane0.querySelector('.book-reassign-cancel').click();
    expect(zuordnung()).toBeNull();
    expect(zugeordnet).toEqual([]);
    expect(dialogAufrufe).toEqual([]);
  });

  it('eine abgewiesene Zuordnung nennt den Grund und lässt die Auswahl stehen', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    reassignAntwort = { ok: false, error: 'outside-book' };
    zuordnungsOptionen()[0].click();
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.reassignOutsideBook');
    expect(hinweis().classList.contains('error')).toBe(true);
    expect(zuordnung()).not.toBeNull();
  });

  it('Kollision, fehlende Datei und Buch-Datei haben eigene Meldungen', async () => {
    setBookState(buchStand());
    await starteZuordnung();
    const option = zuordnungsOptionen()[0];
    reassignAntwort = { ok: false, error: 'duplicate-path' };
    option.click();
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.reassignDuplicate');
    reassignAntwort = { ok: false, error: 'unknown-file' };
    option.click();
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.reassignUnknownFile');
    reassignAntwort = { ok: false, error: 'book-file' };
    option.click();
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.reassignBookFile');
    reassignAntwort = { ok: false, error: 'write-failed' };
    option.click();
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.reassignFailed');
  });

  it('abgebrochener Datei-Dialog und dieselbe Datei bleiben still', async () => {
    setBookState(buchStand());
    suggestAntwort = { ok: true, suggestions: [] };
    reassignAntwort = { ok: false, canceled: true };
    await starteZuordnung();
    expect(hinweis().textContent).toBe('');
    reassignAntwort = { ok: false, error: 'unchanged' };
    await starteZuordnung();
    expect(hinweis().textContent).toBe('');
  });
});

describe('Rückmeldung abgelehnter Operationen (4T-0845)', () => {
  it('eine abgelehnte Operation erklärt sich in der Statuszeile', async () => {
    setBookState(buchStand());
    opAntwort = { ok: false, error: 'cycle' };
    taste(zeileMit('Teil 2/Heimkehr.md'), 'ArrowUp');
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.opCycle');
    expect(hinweis().classList.contains('error')).toBe(true);
  });

  it('der Rand einer Ebene bleibt still', async () => {
    setBookState(buchStand());
    opAntwort = { ok: false, error: 'at-root' };
    taste(zeileMit('Teil 2/Heimkehr.md'), 'ArrowLeft');
    await abwarten();
    expect(hinweis().textContent).toBe('');
  });

  it('ein fehlgeschlagenes Anlegen nennt den Grund', async () => {
    setBookState(buchStand());
    opAntwort = { ok: false, error: 'exists' };
    rechtsklick(pane0.querySelector('.book-tree'));
    menueEintrag('book-new-chapter-root').click();
    const eingabe = pane0.querySelector('.book-new-chapter-input');
    eingabe.value = 'Vorwort';
    eingabe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await abwarten();
    expect(hinweis().textContent).toBe('bookPanel.newChapterExists');
  });
});
