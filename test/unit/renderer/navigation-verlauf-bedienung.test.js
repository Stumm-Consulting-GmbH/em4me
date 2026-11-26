// @vitest-environment jsdom
// 4T-002642 (Epic 3E-000397): Bedienung des Verlaufs «Zurück» und «Vor» im
// Fenster, mit gereichtem Zugang statt laufender Anwendung.
//
// Die Spalten sind einfache Objekte `{ tabs, activeIndex }`; Aktivieren und
// Öffnen ahmen `activateTab` und `openInPane` nach, samt der Einhänge-Aufrufe
// `merkeVerlassen` und `merkeAnkunft`. Messen und Herstellen der Stelle sind
// durch Attrappen ersetzt: Die Stelle eines Reiters steht in seinem Feld
// `stelleJetzt`, hergestellte Stellen werden mitgeschrieben. Ob die Stelle in
// der laufenden Anwendung wirklich oben steht, prüfen die Ablauf-Fälle VZ-01
// bis VZ-07.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import './api-stub.js';
import { pathCompareKey, setPlatformForTests } from '../../../src/shared/platform.js';

const hergestellt = [];
let spaltenRef = [];

vi.mock('../../../src/renderer/modules/views/lese-position.js', () => ({
  messeStelle: (paneIdx) => {
    const pane = spaltenRef[paneIdx];
    const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
    return tab && tab.stelleJetzt ? { ...tab.stelleJetzt } : null;
  },
  stelleHer: (paneIdx, stelle) => {
    const pane = spaltenRef[paneIdx];
    hergestellt.push({ paneIdx, tab: pane.tabs[pane.activeIndex], stelle });
  },
}));

const modul = await import('../../../src/renderer/modules/views/navigation-verlauf-bedienung.js');
const {
  verdrahteNavigationsVerlauf,
  leereNavigationsVerlauf,
  merkeVerlassen,
  merkeAnkunft,
  merkeVorSchliessen,
  merkeSpaltenWechsel,
  merkeSprung,
  merkeSprungZiel,
  ohneVerlauf,
  geheZurueck,
  geheVor,
  kannZurueck,
  kannVor,
  navigationsZustand,
  benenneVerlaufUm,
  schluesselVon,
  verlaufsLaenge,
  behandleMaustaste,
} = modul;

function stelle(zeileOben, marke = null) {
  return { zeileOben, schreibmarke: marke };
}

function reiter(pfad, zeile = 1) {
  return { path: pfad, stelleJetzt: stelle(zeile) };
}

// Fenster-Attrappe mit zwei möglichen Spalten und einer «Platte».
function fenster({ platte = new Set() } = {}) {
  const f = {
    spalten: [{ tabs: [], activeIndex: -1 }],
    aktiv: 0,
    hinweise: [],
    meldungen: 0,
    platte,
  };
  spaltenRef = f.spalten;
  f.aktiviereSpalte = (p) => {
    f.aktiv = p;
  };
  f.aktiviereReiter = (p, i) => {
    merkeVerlassen();
    f.spalten[p].activeIndex = i;
    f.aktiv = p;
    merkeAnkunft();
  };
  f.oeffne = async (p, pfad) => {
    if (!f.platte.has(pfad)) return p;
    const da = f.spalten.findIndex((s) => s.tabs.some((t) => t.path === pfad));
    if (da >= 0) {
      f.aktiviereReiter(
        da,
        f.spalten[da].tabs.findIndex((t) => t.path === pfad),
      );
      return da;
    }
    f.spalten[p].tabs.push(reiter(pfad));
    f.aktiviereReiter(p, f.spalten[p].tabs.length - 1);
    return p;
  };
  f.schliesse = (p, i) => {
    const pane = f.spalten[p];
    if (i === pane.activeIndex) merkeVorSchliessen();
    pane.tabs.splice(i, 1);
    pane.activeIndex = pane.tabs.length ? Math.min(i, pane.tabs.length - 1) : -1;
  };
  f.zugang = {
    spalten: () => f.spalten,
    aktiveSpalte: () => f.aktiv,
    aktiviereSpalte: f.aktiviereSpalte,
    aktiviereReiter: f.aktiviereReiter,
    oeffne: f.oeffne,
    meldeMenue: () => {
      f.meldungen += 1;
    },
    hinweis: (text) => f.hinweise.push(text),
    t: (key) => key,
    vorhanden: async (pfad) => f.platte.has(pfad),
  };
  f.gezeigt = () => {
    const pane = f.spalten[f.aktiv];
    return pane.tabs[pane.activeIndex] || null;
  };
  verdrahteNavigationsVerlauf(f.zugang);
  return f;
}

beforeEach(() => {
  leereNavigationsVerlauf();
  hergestellt.length = 0;
  verdrahteNavigationsVerlauf(null);
});

describe('vor der Verdrahtung', () => {
  it('ist jede Funktion wirkungslos und wirft nicht', async () => {
    spaltenRef = [{ tabs: [reiter('/a.md')], activeIndex: 0 }];
    merkeVerlassen();
    merkeAnkunft();
    merkeSprung(0, 30);
    merkeSprungZiel();
    merkeVorSchliessen();
    expect(verlaufsLaenge()).toBe(0);
    expect(kannZurueck()).toBe(false);
    expect(kannVor()).toBe(false);
    expect(await geheZurueck()).toBe(false);
    expect(await geheVor()).toBe(false);
  });

  it('hebt ein unvollständiger Zugang die Verdrahtung auf', () => {
    const f = fenster();
    verdrahteNavigationsVerlauf({ ...f.zugang, oeffne: undefined });
    f.spalten[0].tabs.push(reiter('/a.md'));
    f.aktiviereReiter(0, 0);
    expect(verlaufsLaenge()).toBe(0);
  });
});

describe('Schlüssel', () => {
  it('bildet ihn aus dem Pfad des Reiters, ohne Pfad je Reiter-Objekt', () => {
    expect(schluesselVon({ path: '/Dok/A.md' })).toBe(pathCompareKey('/Dok/A.md'));
    // Unter Windows gleicher Schlüssel bei anderer Groß- und Kleinschreibung,
    // unter Linux nicht; die Plattform wird gesetzt, damit der Fall auf jedem
    // Prüf-Rechner beide Seiten prüft.
    try {
      setPlatformForTests('win32');
      expect(schluesselVon({ path: 'C:\\Dok\\A.md' })).toBe(
        schluesselVon({ path: 'c:\\dok\\a.MD' }),
      );
      setPlatformForTests('linux');
      expect(schluesselVon({ path: '/Dok/A.md' })).not.toBe(schluesselVon({ path: '/dok/a.md' }));
    } finally {
      setPlatformForTests(undefined);
    }
    const ohne1 = { path: null };
    const ohne2 = { path: null };
    expect(schluesselVon(ohne1)).toBe(schluesselVon(ohne1));
    expect(schluesselVon(ohne1)).not.toBe(schluesselVon(ohne2));
  });
});

describe('Verlassen und Ankommen', () => {
  it('legt beim ersten Wechsel zuerst den verlassenen Ort an', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md', 120), reiter('/b.md'));
    f.spalten[0].activeIndex = 0;
    f.aktiviereReiter(0, 1);
    expect(verlaufsLaenge()).toBe(2);
    expect(kannZurueck()).toBe(true);
    expect(kannVor()).toBe(false);
    expect(f.meldungen).toBeGreaterThan(0);
  });

  it('legt beim erneuten Aktivieren desselben Reiters keinen Eintrag an', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 0);
    expect(verlaufsLaenge()).toBe(1);
  });

  it('legt in der Hülle ohne Verlauf keinen Eintrag an', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    ohneVerlauf(() => f.aktiviereReiter(0, 1));
    expect(verlaufsLaenge()).toBe(1);
    // Nach der Hülle wirkt der Verlauf wieder: Der in der Hülle gezeigte b ist
    // nicht der aktuelle Ort und wird beim Verlassen eingetragen (Story AK1),
    // danach folgt c.
    f.aktiviereReiter(0, 2);
    expect(verlaufsLaenge()).toBe(3);
  });

  it('hält die Hülle bis zum Ende eines Versprechens', async () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    let fertig;
    const lauf = ohneVerlauf(
      () =>
        new Promise((r) => {
          fertig = r;
        }),
    );
    f.aktiviereReiter(0, 1);
    expect(verlaufsLaenge()).toBe(1);
    fertig();
    await lauf;
    // b wird beim Verlassen eingetragen (Story AK1), danach folgt c.
    f.aktiviereReiter(0, 2);
    expect(verlaufsLaenge()).toBe(3);
  });

  // Review 3E-000397: Ersetzen des Reiter-Inhalts (`tab-ersetzen.js`). Der
  // Eintrag der alten Datei bekommt ihre Stelle, der neuen ihre offene Stelle;
  // die gemessene Stelle der alten Datei gelangt nicht in den neuen Eintrag.
  // Der Fall prüft die beiden Modul-Funktionen; dass `tab-ersetzen.js` sie vor
  // dem Pfad-Wechsel aufruft und die Aktivierung ohne Verlaufs-Eintrag fährt,
  // weist der Ablauf-Fall `LP-08` in `test/e2e/funktionen/lese-position-ablage.spec.js` nach.
  it('Ersetzen des Reiter-Inhalts: alter Eintrag mit seiner Stelle, neuer mit der offenen', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md']) });
    f.spalten[0].tabs.push(reiter('/a.md', 1));
    f.aktiviereReiter(0, 0);
    const tab = f.spalten[0].tabs[0];
    tab.stelleJetzt = stelle(120);
    modul.merkeErsetzenVorher(0);
    tab.path = '/b.md';
    tab.stelleOffen = stelle(40);
    ohneVerlauf(() => f.aktiviereReiter(0, 0));
    modul.merkeErsetzenNachher();
    expect(verlaufsLaenge()).toBe(2);
    expect(kannZurueck()).toBe(true);
    // Die Stelle, an der die Spalte b zeigt, wird erst beim Verlassen gemessen.
    tab.stelleJetzt = null;
    await geheZurueck();
    expect(f.gezeigt().path).toBe('/a.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(120));
    await geheVor();
    expect(f.gezeigt().path).toBe('/b.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(40));
  });

  it('misst beim Verlassen die Stelle des gezeigten aktuellen Orts', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md']) });
    f.spalten[0].tabs.push(reiter('/a.md', 1), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.spalten[0].tabs[0].stelleJetzt = stelle(120, { zeile: 125, spalte: 3 });
    f.aktiviereReiter(0, 1);
    await geheZurueck();
    expect(f.gezeigt().path).toBe('/a.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(120, { zeile: 125, spalte: 3 }));
  });

  it('trägt beim Schließen die Stelle ein; das Nachrücken legt keinen Eintrag an', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md']) });
    f.spalten[0].tabs.push(reiter('/a.md', 1), reiter('/b.md', 1));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.spalten[0].tabs[1].stelleJetzt = stelle(77);
    f.schliesse(0, 1);
    expect(verlaufsLaenge()).toBe(2);
    expect(f.gezeigt().path).toBe('/a.md');
    // «Zurück» von b aus wäre a; hier ist b der aktuelle Eintrag, also «Zurück» → a.
    await geheZurueck();
    expect(f.gezeigt().path).toBe('/a.md');
    await geheVor();
    expect(f.gezeigt().path).toBe('/b.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(77));
  });

  // Story AK1: Der verlassene Ort wird immer eingetragen. Nach «A → B, B
  // schließen (A rückt nach), A → C» ist der Verlauf A, B, A, C; «Zurück»
  // führt an die Ausgangsstelle in A, ein weiteres «Zurück» öffnet B wieder.
  it('trägt einen nachgerückten Reiter beim Verlassen als Besuch ein', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md', '/c.md']) });
    f.spalten[0].tabs.push(reiter('/a.md', 10));
    f.aktiviereReiter(0, 0);
    await f.oeffne(0, '/b.md');
    f.schliesse(0, 1);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(verlaufsLaenge()).toBe(2);
    f.spalten[0].tabs[0].stelleJetzt = stelle(150, { zeile: 152, spalte: 4 });
    await f.oeffne(0, '/c.md');
    expect(verlaufsLaenge()).toBe(4);
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(150, { zeile: 152, spalte: 4 }));
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/b.md');
    expect(verlaufsLaenge()).toBe(4);
  });

  // Zwei Spalten: links A (aktueller Ort), rechts X gezeigt und B verdeckt.
  function zweiSpalten() {
    const f = fenster();
    f.spalten.push({ tabs: [reiter('/x.md'), reiter('/b.md')], activeIndex: 0 });
    f.spalten[0].tabs.push(reiter('/a.md'));
    f.aktiviereReiter(0, 0);
    expect(verlaufsLaenge()).toBe(1);
    return f;
  }

  it('nimmt nach einem Spalten-Wechsel im selben Zug den Ort der verlassenen Spalte', async () => {
    const f = zweiSpalten();
    // Verweis aus A auf das rechts verdeckt offene B: erst die Spalte, dann der Reiter.
    merkeSpaltenWechsel(0);
    f.aktiv = 1;
    f.aktiviereReiter(1, 1);
    // A, B: das rechts bis eben gezeigte X war kein Ort des Anwenders.
    expect(verlaufsLaenge()).toBe(2);
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(kannZurueck()).toBe(false);
  });

  it('trägt den gezeigten Reiter ein, wenn der Anwender schon vorher in die Spalte gewechselt war', async () => {
    const f = zweiSpalten();
    merkeSpaltenWechsel(0);
    f.aktiv = 1;
    // Der Zug endet: Der Anwender ist nun in der rechten Spalte bei X.
    await Promise.resolve();
    f.aktiviereReiter(1, 1);
    // A, X, B: X war der verlassene Ort.
    expect(verlaufsLaenge()).toBe(3);
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/x.md');
  });

  it('legt beim Verlassen keinen zweiten Eintrag an, wenn der gezeigte Reiter der aktuelle Ort ist', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.aktiviereReiter(0, 2);
    expect(verlaufsLaenge()).toBe(3);
  });
});

describe('Zurück und Vor', () => {
  it('ohne möglichen Schritt nur der Hinweis', async () => {
    const f = fenster();
    expect(await geheZurueck()).toBe(false);
    expect(await geheVor()).toBe(false);
    expect(f.hinweise).toEqual(['statusbar.navNoBack', 'statusbar.navNoForward']);
  });

  it('springt zurück und vor; eine neue Navigation schneidet den Vorwärts-Teil ab', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md', '/c.md']) });
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(navigationsZustand()).toEqual({ kannZurueck: false, kannVor: true });
    expect(await geheVor()).toBe(true);
    expect(f.gezeigt().path).toBe('/b.md');
    await geheZurueck();
    f.aktiviereReiter(0, 2);
    expect(kannVor()).toBe(false);
    expect(verlaufsLaenge()).toBe(2);
    // Die Schritte selbst legen keine Einträge an.
    await geheZurueck();
    expect(f.gezeigt().path).toBe('/a.md');
    expect(verlaufsLaenge()).toBe(2);
  });

  it('holt einen in der anderen Spalte offenen Reiter dort nach vorn', async () => {
    const f = fenster();
    f.spalten.push({ tabs: [reiter('/b.md')], activeIndex: 0 });
    f.spalten[0].tabs.push(reiter('/a.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(1, 0);
    await geheZurueck();
    expect(f.aktiv).toBe(0);
    await geheVor();
    expect(f.aktiv).toBe(1);
    expect(f.gezeigt().path).toBe('/b.md');
  });

  it('öffnet ein geschlossenes Dokument wieder an seiner Stelle', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/b.md']) });
    f.spalten[0].tabs.push(reiter('/a.md', 1), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.spalten[0].tabs[0].stelleJetzt = stelle(40);
    f.aktiviereReiter(0, 1);
    f.schliesse(0, 0);
    f.spalten[0].activeIndex = 0;
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(hergestellt.at(-1).stelle).toEqual(stelle(40));
    // Das Öffnen aus dem Verlauf legt keinen Eintrag an.
    expect(verlaufsLaenge()).toBe(2);
  });

  it('überspringt gelöschte Orte, zählt sie und entfernt sie', async () => {
    const f = fenster({ platte: new Set(['/a.md', '/c.md']) });
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.aktiviereReiter(0, 2);
    f.spalten[0].tabs.splice(1, 1);
    f.spalten[0].activeIndex = 1;
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/a.md');
    expect(f.hinweise).toEqual(['statusbar.navSkippedOne']);
    expect(verlaufsLaenge()).toBe(2);
    expect(await geheVor()).toBe(true);
    expect(f.gezeigt().path).toBe('/c.md');
  });

  it('zählt mehrere übersprungene Orte und bleibt ohne Ziel am Ausgangsort', async () => {
    const f = fenster({ platte: new Set(['/c.md']) });
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'), reiter('/c.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.aktiviereReiter(0, 2);
    f.spalten[0].tabs.splice(0, 2);
    f.spalten[0].activeIndex = 0;
    expect(await geheZurueck()).toBe(false);
    expect(f.hinweise).toEqual(['statusbar.navSkipped']);
    expect(verlaufsLaenge()).toBe(1);
    expect(kannZurueck()).toBe(false);
  });

  it('entfernt einen Eintrag ohne Pfad, dessen Reiter fehlt', async () => {
    const f = fenster({ platte: new Set(['/b.md']) });
    const seite = { path: null, stelleJetzt: null };
    f.spalten[0].tabs.push(seite, reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.spalten[0].tabs.splice(0, 1);
    f.spalten[0].activeIndex = 0;
    expect(await geheZurueck()).toBe(false);
    expect(f.hinweise).toEqual(['statusbar.navSkippedOne']);
  });
});

describe('Sprünge im Dokument', () => {
  it('legt vor und nach dem Sprung Einträge an und fasst nahe Stellen zusammen', async () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md', 1));
    f.aktiviereReiter(0, 0);
    merkeSprung(0, 80);
    expect(verlaufsLaenge()).toBe(2);
    f.spalten[0].tabs[0].stelleJetzt = stelle(80);
    merkeSprung(0, 85);
    expect(verlaufsLaenge()).toBe(2);
    await geheZurueck();
    expect(hergestellt.at(-1).stelle).toEqual(stelle(1));
  });

  it('setzt nach dem Öffnen das Ziel in den eben angelegten Eintrag', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    merkeSprung(0, 50, { nachOeffnen: true });
    expect(verlaufsLaenge()).toBe(2);
    // Ein zweiter Sprung nach dem Öffnen ist ein gewöhnlicher Sprung.
    merkeSprung(0, 200, { nachOeffnen: true });
    expect(verlaufsLaenge()).toBe(3);
  });

  it('Suchtreffer: kein zweiter Eintrag nach einem Dokument-Wechsel, sonst einer', () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    merkeVerlassen();
    f.aktiviereReiter(0, 1);
    merkeSprungZiel();
    expect(verlaufsLaenge()).toBe(2);
    merkeVerlassen();
    merkeSprungZiel();
    expect(verlaufsLaenge()).toBe(3);
  });
});

describe('Umbenennen', () => {
  it('Einträge folgen dem neuen Pfad', async () => {
    const f = fenster({ platte: new Set(['/b.md', '/neu/a.md']) });
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    f.spalten[0].tabs.splice(0, 1);
    f.spalten[0].activeIndex = 0;
    benenneVerlaufUm('/a.md', '/neu/a.md');
    expect(await geheZurueck()).toBe(true);
    expect(f.gezeigt().path).toBe('/neu/a.md');
  });
});

describe('Maustasten', () => {
  it('Taste 3 geht zurück, Taste 4 vor; die übrigen bleiben unberührt', async () => {
    const f = fenster();
    f.spalten[0].tabs.push(reiter('/a.md'), reiter('/b.md'));
    f.aktiviereReiter(0, 0);
    f.aktiviereReiter(0, 1);
    const ereignis = (button) => ({ button, preventDefault: vi.fn() });
    const mitte = ereignis(1);
    behandleMaustaste(mitte);
    expect(mitte.preventDefault).not.toHaveBeenCalled();
    const zurueck = ereignis(3);
    behandleMaustaste(zurueck);
    expect(zurueck.preventDefault).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.gezeigt().path).toBe('/a.md');
    behandleMaustaste(ereignis(4));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.gezeigt().path).toBe('/b.md');
  });
});
