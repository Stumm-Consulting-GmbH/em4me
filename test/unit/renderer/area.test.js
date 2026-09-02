// @vitest-environment jsdom
// 4T-000323/4T-000324 (Epic 3E-000058): Unit-Tests der Renderer-Bereichs-Logik
// (src/renderer/modules/area.js) — Innerhalb-Vorprüfung, lokaler
// Ziel-Resolver und der Außen-Link-Marker im gerenderten DOM.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import './api-stub.js';

const area = await import('../../../src/renderer/modules/area.js');
const { state } = await import('../../../src/renderer/modules/app/app-state.js');
const { setPlatformForTests } = await import('../../../src/shared/platform.js');

const DOC = 'C:\\Daten\\Notizen\\Sub\\doku.md';

// 4T-001225: Die Pfad-Funktionen sind plattformabhängig geworden; die
// Bestands-Erwartungen unten beschreiben das Windows-Verhalten und werden
// deshalb ausdrücklich auf win32 gepinnt, damit die Suite auch auf einer
// Linux-Maschine dieselben Fälle prüft.
beforeEach(() => {
  setPlatformForTests('win32');
});

afterEach(() => {
  state.areaPath = null;
  setPlatformForTests(undefined);
});

describe('isOutsideActiveArea (4T-000323)', () => {
  it('ohne aktiven Bereich liegt nichts außerhalb', () => {
    state.areaPath = null;
    expect(area.isOutsideActiveArea('D:\\woanders\\x.md')).toBe(false);
  });

  it('erkennt innen und außen, case-insensitiv und Trenner-tolerant', () => {
    state.areaPath = 'C:\\Daten\\Notizen';
    expect(area.isOutsideActiveArea('c:/daten/notizen/sub/a.md')).toBe(false);
    expect(area.isOutsideActiveArea('C:\\Daten\\Notizen2\\a.md')).toBe(true);
    expect(area.isOutsideActiveArea('D:\\Daten\\Notizen\\a.md')).toBe(true);
  });
});

describe('resolveLocalTarget (4T-000324)', () => {
  it('löst relative Ziele gegen den Dokument-Ordner auf', () => {
    expect(area.resolveLocalTarget(DOC, 'nachbar.md')).toBe('C:\\Daten\\Notizen\\Sub\\nachbar.md');
    expect(area.resolveLocalTarget(DOC, '../oben.md')).toBe('C:\\Daten\\Notizen\\oben.md');
    expect(area.resolveLocalTarget(DOC, '../../../raus.md')).toBe('C:\\raus.md');
    expect(area.resolveLocalTarget(DOC, './hier/tiefer.md')).toBe(
      'C:\\Daten\\Notizen\\Sub\\hier\\tiefer.md',
    );
  });

  it('behandelt absolute Pfade, Anker und URI-Encoding', () => {
    expect(area.resolveLocalTarget(DOC, 'D:/extern/x.md')).toBe('D:\\extern\\x.md');
    expect(area.resolveLocalTarget(DOC, 'ziel.md#abschnitt')).toBe(
      'C:\\Daten\\Notizen\\Sub\\ziel.md',
    );
    expect(area.resolveLocalTarget(DOC, 'mit%20leerzeichen.md')).toBe(
      'C:\\Daten\\Notizen\\Sub\\mit leerzeichen.md',
    );
  });

  it('liefert null für URLs, reine Anker und leere Ziele', () => {
    expect(area.resolveLocalTarget(DOC, 'https://example.org/x.md')).toBeNull();
    expect(area.resolveLocalTarget(DOC, 'mailto:a@example.org')).toBeNull();
    expect(area.resolveLocalTarget(DOC, '#nur-anker')).toBeNull();
    expect(area.resolveLocalTarget(DOC, '')).toBeNull();
    expect(area.resolveLocalTarget(null, 'x.md')).toBeNull();
  });
});

describe('markOutsideAreaLinks (4T-000324)', () => {
  it('markiert Außen-Links mit Klasse und Pfad-Tooltip, Innen-Links nicht', () => {
    state.areaPath = 'C:\\Daten\\Notizen';
    const container = document.createElement('div');
    container.innerHTML =
      '<a id="innen" href="nachbar.md">innen</a>' +
      '<a id="aussen" href="../../raus.md">außen</a>' +
      '<a id="web" href="https://example.org">web</a>' +
      '<a id="anker" href="#abschnitt">anker</a>' +
      '<a id="wiki" class="wikilink" href="../../WikiRaus">wiki</a>';
    area.markOutsideAreaLinks(container, DOC);
    expect(container.querySelector('#innen').classList.contains('outside-area-link')).toBe(false);
    const aussen = container.querySelector('#aussen');
    expect(aussen.classList.contains('outside-area-link')).toBe(true);
    // Ohne geladenes Woerterbuch liefert t() den Key — der Tooltip muss
    // gesetzt sein; der Pfad-Inhalt wird ueber resolveLocalTarget getestet.
    expect(aussen.title).toBeTruthy();
    expect(container.querySelector('#web').classList.contains('outside-area-link')).toBe(false);
    expect(container.querySelector('#anker').classList.contains('outside-area-link')).toBe(false);
    // Wiki-Link ohne Endung wird als .md aufgelöst.
    const wiki = container.querySelector('#wiki');
    expect(wiki.classList.contains('outside-area-link')).toBe(true);
  });

  it('ohne aktiven Bereich ein No-op', () => {
    state.areaPath = null;
    const container = document.createElement('div');
    container.innerHTML = '<a href="../../raus.md">außen</a>';
    area.markOutsideAreaLinks(container, DOC);
    expect(container.querySelector('a').classList.contains('outside-area-link')).toBe(false);
  });
});

// 4T-001225 (Epic 3E-000122, Befund F2 des Linux-Lauffaehigkeits-Nachweises):
// dieselben Funktionen unter Linux — Trenner ist der Schraegstrich, die
// Schreibweise unterscheidet, und unter Windows geschriebene Links
// funktionieren nach dem Umzug weiter (Migrations-Abwaegung im Modul).
describe('Pfad-Funktionen unter Linux (4T-001225)', () => {
  const DOC_LX = '/daten/notizen/sub/doku.md';

  beforeEach(() => {
    setPlatformForTests('linux');
  });

  it('normalizeForCompare laesst Schreibweise und Backslashes unangetastet', () => {
    expect(area.normalizeForCompare('/Daten/Notizen/')).toBe('/Daten/Notizen');
    expect(area.normalizeForCompare('/a/Mit\\Backslash')).toBe('/a/Mit\\Backslash');
  });

  it('isOutsideActiveArea entscheidet case-sensitiv', () => {
    state.areaPath = '/daten/notizen';
    expect(area.isOutsideActiveArea('/daten/notizen/sub/a.md')).toBe(false);
    // Nur in der Schreibweise verschieden: unter Linux ein anderer Ort.
    expect(area.isOutsideActiveArea('/daten/Notizen/a.md')).toBe(true);
    expect(area.isOutsideActiveArea('/daten/notizen2/a.md')).toBe(true);
  });

  it('resolveLocalTarget loest mit Schraegstrich auf, auch fuer Windows-Links', () => {
    expect(area.resolveLocalTarget(DOC_LX, 'nachbar.md')).toBe('/daten/notizen/sub/nachbar.md');
    expect(area.resolveLocalTarget(DOC_LX, '../oben.md')).toBe('/daten/notizen/oben.md');
    // Unter Windows geschriebener Link nach dem Umzug (Migrations-Fall).
    expect(area.resolveLocalTarget(DOC_LX, '..\\oben.md')).toBe('/daten/notizen/oben.md');
    expect(area.resolveLocalTarget(DOC_LX, '/etc/x.md')).toBe('/etc/x.md');
  });
});

// 4T-001277 (Epic 3E-000232, Befund B3): Die Wiki-Kurzform [[/Name]] ist kein Pfad.
//
// **Der belegte Befund.** In der Demo-Area sind [[/Earth]] und [[/Mars]] auf der
// Seite `Milky Way∕Sun` unter Linux markiert, unter Windows nicht (E2E-Fall
// DA-03, Bildschirmfoto vom 2026-08-29). Der Index ist daran unschuldig: Die
// Auflösung liefert die Ziel-Datei auf beiden Plattformen, in fünf Stufen belegt
// in `test/unit/unterseiten-kurzform.test.js`.
//
// **Die Stelle.** Die Außen-Link-Prüfung hängt einem Wiki-Ziel ohne Endung ein
// `.md` an und schickt das Ergebnis durch `resolveLocalTarget` — den Resolver
// für **Datei-Pfade**. Aus `[[/Earth]]` wird so `/Earth.md`, und das ist unter
// Linux ein absoluter Pfad an der Wurzel des Dateisystems, also außerhalb jedes
// Bereichs. Unter Windows greift der POSIX-Zweig nicht, der führende Trenner
// bleibt dokument-relativ, und das Ziel landet zufällig **innerhalb**.
//
// **Warum das die Wurzel ist und nicht ein Nebeneffekt.** `/Name` ist im
// Wiki-Namensraum kein Pfad, sondern die Kurzform für eine Unterseite der
// aktuellen Seite (`src/shared/subpages.js`, `isRelativeTarget`). Sie kann den
// Bereich gar nicht verlassen. Die Prüfung wendet einen Dateisystem-Begriff auf
// einen logischen Namensraum an — dieselbe Grenze, die 4T-001275 an `link-scan.js`
// in die andere Richtung gezogen hat.
describe('Wiki-Kurzform und die Bereichs-Grenze (4T-001277)', () => {
  const AREA_LX = '/daten/demo';
  const SUN_LX = '/daten/demo/Milky Way∕Sun.md';

  it('unter Linux liest die Aussen-Pruefung [[/Earth]] als absoluten Pfad — der Marker', () => {
    setPlatformForTests('linux');
    state.areaPath = AREA_LX;
    // Genau die Umformung der Linter-Regel 7 und von markOutsideAreaLinks:
    // Ziel ohne Endung bekommt '.md' angehaengt.
    const ziel = area.resolveLocalTarget(SUN_LX, '/Earth.md');
    expect(ziel).toBe('/Earth.md');
    expect(area.isOutsideActiveArea(ziel)).toBe(true);
  });

  it('unter Windows bleibt derselbe Verweis dokument-relativ und damit innerhalb', () => {
    setPlatformForTests('win32');
    state.areaPath = 'C:\\daten\\demo';
    const ziel = area.resolveLocalTarget('C:\\daten\\demo\\Milky Way∕Sun.md', '/Earth.md');
    expect(ziel).toBe('C:\\daten\\demo\\Earth.md');
    expect(area.isOutsideActiveArea(ziel)).toBe(false);
  });

  it('die beiden Verweise, die im Befund aufloesen, liegen auch unter Linux innerhalb', () => {
    setPlatformForTests('linux');
    state.areaPath = AREA_LX;
    // [[..]] wird zu '...md' (Endungs-Test greift bei '..' nicht) und
    // [[Light Speed]] zu 'Light Speed.md'; beide ohne fuehrenden Trenner.
    for (const ziel of ['...md', 'Light Speed.md']) {
      expect(area.isOutsideActiveArea(area.resolveLocalTarget(SUN_LX, ziel))).toBe(false);
    }
  });

  // Regressionstest der Behebung. Vor ihr war dieser Fall rot: `#kurz` trug
  // die Warn-Klasse, weil markOutsideAreaLinks denselben Weg ging wie die
  // Linter-Regel. Der Befund traf damit zwei Bedienorte, nicht nur den
  // Editor-Marker — und die Lese-Ansicht deckt kein E2E-Fall ab (DA-03 sieht
  // nur den Editor), weshalb diese Deckung hier liegt.
  it('die Lese-Ansicht markiert die Kurzform NICHT mehr als Aussen-Link', () => {
    setPlatformForTests('linux');
    state.areaPath = AREA_LX;
    const container = document.createElement('div');
    // Die href-Form stammt aus dem Wiki-Plugin (src/shared/markdown/plugins/
    // wiki.js): ein Ziel ohne Endung bekommt dort bereits '.md' angehaengt,
    // die Eltern-Form bleibt als blankes '..' stehen.
    container.innerHTML =
      '<a id="kurz" class="wikilink" href="/Earth.md">Earth</a>' +
      '<a id="eltern" class="wikilink" href="..">hoch</a>' +
      '<a id="voll" class="wikilink" href="Light Speed.md">Light Speed</a>' +
      '<a id="raus" class="wikilink" href="../../../woanders.md">raus</a>' +
      '<a id="mdraus" href="/etc/fremd.md">md-Link absolut</a>';
    area.markOutsideAreaLinks(container, SUN_LX);
    const klasse = (id) =>
      container.querySelector(`#${id}`).classList.contains('outside-area-link');
    expect(klasse('kurz')).toBe(false);
    expect(klasse('eltern')).toBe(false);
    expect(klasse('voll')).toBe(false);
    // Keine Ueber-Korrektur: Ein Wiki-Ziel, das den Bereich wirklich verlaesst,
    // wird weiterhin markiert — und ein gewoehnlicher Markdown-Link mit
    // absolutem Ziel ebenso, denn dort ist der Schraegstrich ein Pfad-Anfang.
    expect(klasse('raus')).toBe(true);
    expect(klasse('mdraus')).toBe(true);
  });
});
