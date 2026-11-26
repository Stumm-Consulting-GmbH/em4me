// @vitest-environment jsdom
// 4T-002641 (Epic 3E-000397): Rechen-Anteile der Lese-Position im Anzeige-
// Prozess.
//
// Geprüft werden die Teile ohne DOM: welche Ansicht einen Zeilen-Bezug hat,
// welche Zeilen-Kennung die oberste sichtbare ist und wie eine Schreibmarke in
// eine Dokument-Position übersetzt wird. Ob die Stelle in der laufenden
// Anwendung wirklich oben steht, prüft der Ablauf-Fall LP-04.
import { describe, it, expect } from 'vitest';
import './api-stub.js';
import { Text } from '@codemirror/state';

const modul = await import('../../../src/renderer/modules/views/lese-position.js');
const {
  ansichtsArt,
  zeigtEditor,
  zeigtGerendert,
  obersteSichtbareZeile,
  positionDerMarke,
  markeAusPosition,
  lageFuerBlock,
  zielDerMarke,
} = modul;

function zeilenVon(text) {
  const doc = Text.of(text.split('\n'));
  return { anzahl: doc.lines, zeile: (n) => doc.line(n) };
}

describe('ansichtsArt und Sichtbarkeit', () => {
  it('ordnet jede Ansicht ein', () => {
    expect(ansichtsArt('rendered')).toBe('gerendert');
    expect(ansichtsArt('source')).toBe('editor');
    expect(ansichtsArt('live')).toBe('editor');
    expect(ansichtsArt('split')).toBe('geteilt');
    for (const ohne of ['mindmap', 'canvas', 'kanban', 'presentation', undefined, '']) {
      expect(ansichtsArt(ohne)).toBeNull();
    }
  });

  it('nennt, ob Editor und Lese-Fläche sichtbar sind', () => {
    expect([zeigtEditor('rendered'), zeigtGerendert('rendered')]).toEqual([false, true]);
    expect([zeigtEditor('source'), zeigtGerendert('source')]).toEqual([true, false]);
    expect([zeigtEditor('live'), zeigtGerendert('live')]).toEqual([true, false]);
    expect([zeigtEditor('split'), zeigtGerendert('split')]).toEqual([true, true]);
    expect([zeigtEditor('mindmap'), zeigtGerendert('mindmap')]).toEqual([false, false]);
  });
});

describe('obersteSichtbareZeile', () => {
  // Absätze mit Abstand: Zeile 1 bei 0–20, Zeile 3 bei 30–50, Zeile 5 bei 60–80.
  const absaetze = [
    { zeile: 1, oben: 0, unten: 20 },
    { zeile: 3, oben: 30, unten: 50 },
    { zeile: 5, oben: 60, unten: 80 },
  ];

  it('nimmt das Element, das die Oberkante schneidet', () => {
    expect(obersteSichtbareZeile(absaetze, 40)).toBe(3);
    expect(obersteSichtbareZeile(absaetze, 0)).toBe(1);
  });

  it('nimmt im Abstand zwischen zwei Elementen das darunter beginnende', () => {
    expect(obersteSichtbareZeile(absaetze, 25)).toBe(3);
  });

  it('wertet ein Element, das nur bis an die Oberkante reicht, als darüber', () => {
    expect(obersteSichtbareZeile(absaetze, 50)).toBe(5);
    expect(obersteSichtbareZeile(absaetze, 49.5)).toBe(5);
  });

  it('nimmt bei verschachtelten Elementen das innerste an der Oberkante', () => {
    const liste = [
      { zeile: 10, oben: 0, unten: 300 },
      { zeile: 10, oben: 0, unten: 20 },
      { zeile: 11, oben: 20, unten: 40 },
      { zeile: 12, oben: 40, unten: 60 },
      { zeile: 13, oben: 60, unten: 80 },
    ];
    expect(obersteSichtbareZeile(liste, 45)).toBe(12);
  });

  it('liefert ohne Elemente unterhalb der Oberkante null', () => {
    expect(obersteSichtbareZeile(absaetze, 500)).toBeNull();
    expect(obersteSichtbareZeile([], 0)).toBeNull();
  });

  it('überspringt ungültige Einträge', () => {
    expect(obersteSichtbareZeile([null, { zeile: 0, oben: 0, unten: 9 }, ...absaetze], 0)).toBe(1);
  });

  it('liest die Liste nur so weit wie nötig', () => {
    let gelesen = 0;
    function* lazy() {
      for (const e of absaetze) {
        gelesen += 1;
        yield e;
      }
    }
    expect(obersteSichtbareZeile(lazy(), 10)).toBe(1);
    expect(gelesen).toBe(2);
  });
});

describe('positionDerMarke und markeAusPosition', () => {
  const zeilen = zeilenVon('abc\ndefgh\n\nxy');

  it('übersetzt Zeile und Spalte in eine Position', () => {
    expect(positionDerMarke({ zeile: 1, spalte: 0 }, zeilen)).toBe(0);
    expect(positionDerMarke({ zeile: 2, spalte: 3 }, zeilen)).toBe(7);
    expect(positionDerMarke({ zeile: 4, spalte: 1 }, zeilen)).toBe(12);
  });

  it('begrenzt eine Spalte hinter dem Zeilenende auf das Zeilenende', () => {
    expect(positionDerMarke({ zeile: 1, spalte: 99 }, zeilen)).toBe(3);
    expect(positionDerMarke({ zeile: 3, spalte: 4 }, zeilen)).toBe(10);
  });

  it('setzt bei amZeilenEnde an das Ende der Zeile', () => {
    expect(positionDerMarke({ zeile: 4, spalte: 0, amZeilenEnde: true }, zeilen)).toBe(13);
  });

  it('begrenzt die Zeile auf das Dokument', () => {
    expect(positionDerMarke({ zeile: 99, spalte: 0 }, zeilen)).toBe(11);
  });

  it('liefert bei ungültigen Eingaben null', () => {
    expect(positionDerMarke(null, zeilen)).toBeNull();
    expect(positionDerMarke({ zeile: 1, spalte: 0 }, null)).toBeNull();
    expect(positionDerMarke({ zeile: '1', spalte: 0 }, zeilen)).toBeNull();
  });

  it('bildet die Schreibmarke aus Position und Zeilen-Anfang', () => {
    expect(markeAusPosition(7, 2, 4)).toEqual({ zeile: 2, spalte: 3 });
    expect(markeAusPosition(0, 1, 0)).toEqual({ zeile: 1, spalte: 0 });
    expect(markeAusPosition(5, 0, 0)).toBeNull();
    expect(markeAusPosition(1.5, 1, 0)).toBeNull();
  });

  it('übersetzt hin und zurück verlustfrei', () => {
    const marke = { zeile: 2, spalte: 4 };
    const pos = positionDerMarke(marke, zeilen);
    const zeile = zeilen.zeile(2);
    expect(markeAusPosition(pos, 2, zeile.from)).toEqual(marke);
  });
});

// Eine Schreibmarke in einem eingebetteten Bedienelement des Live-Modus
// (Tabellen-Zelle) wird nicht gesetzt; ob die Tabelle danach als Tabelle
// erscheint, prüft der Ablauf-Fall LP-04 (f).
describe('zielDerMarke', () => {
  const zeilen = zeilenVon('abc\n| a | b |\nxy');

  it('liefert ohne Prüfung die Position der Marke', () => {
    expect(zielDerMarke({ zeile: 3, spalte: 1 }, zeilen)).toBe(15);
  });

  it('liefert die Position, wenn sie im Text liegt', () => {
    const eingebettet = (pos) => pos >= 4 && pos <= 13;
    expect(zielDerMarke({ zeile: 3, spalte: 1 }, zeilen, eingebettet)).toBe(15);
    expect(zielDerMarke({ zeile: 1, spalte: 3 }, zeilen, eingebettet)).toBe(3);
  });

  it('liefert null, wenn die Position in einem Bedienelement liegt', () => {
    const eingebettet = (pos) => pos >= 4 && pos <= 13;
    expect(zielDerMarke({ zeile: 2, spalte: 3 }, zeilen, eingebettet)).toBeNull();
    expect(zielDerMarke({ zeile: 2, spalte: 0 }, zeilen, eingebettet)).toBeNull();
  });

  it('liefert bei ungültiger Marke null, ohne zu prüfen', () => {
    let gefragt = false;
    const eingebettet = () => (gefragt = true);
    expect(zielDerMarke(null, zeilen, eingebettet)).toBeNull();
    expect(gefragt).toBe(false);
  });
});

// Sofortige Bildlauf-Lage des Editors beim Herstellen (Ansichts-Wechsel ohne
// Zwischenbild); ob kein Bild die alte Lage zeigt, prüft der Ablauf-Fall LP-07.
describe('lageFuerBlock', () => {
  it('setzt die Oberkante des Blocks an die Oberkante der Fläche', () => {
    // Fläche ab 100, Dokument-Anfang bei 104 (Innenabstand), noch nicht gerollt.
    expect(lageFuerBlock(800, 104, 100, 0)).toBe(804);
  });

  it('rechnet die bisherige Lage heraus', () => {
    // Bei Lage 500 liegt der Dokument-Anfang 500 Bildpunkte über seinem Platz.
    expect(lageFuerBlock(800, 104 - 500, 100, 500)).toBe(804);
  });

  it('rundet und geht nie unter 0', () => {
    expect(lageFuerBlock(10.6, 100, 100, 0)).toBe(11);
    expect(lageFuerBlock(0, 90, 100, 0)).toBe(0);
  });
});

// Schritte 6 und 7: Lesen der gemerkten Stelle beim Öffnen und Verwerfen, wenn
// ein Sprung-Ziel folgt. Ob die Stelle beim ersten Darstellen sichtbar steht,
// prüfen die Ablauf-Fälle LP-01 bis LP-03.
describe('leseOffeneStelle', () => {
  const { leseOffeneStelle } = modul;

  it('gibt die gelesene Stelle geprüft zurück', async () => {
    window.api.lesePositionLesen = async () => ({ zeileOben: 12, schreibmarke: null });
    expect(await leseOffeneStelle('C:/a.md')).toEqual({ zeileOben: 12, schreibmarke: null });
  });

  it('liefert null ohne Eintrag, bei ungültigem Wert und bei einem Fehler der Brücke', async () => {
    window.api.lesePositionLesen = async () => null;
    expect(await leseOffeneStelle('C:/a.md')).toBeNull();
    window.api.lesePositionLesen = async () => ({ zeileOben: 'zwölf' });
    expect(await leseOffeneStelle('C:/a.md')).toBeNull();
    const warnung = console.warn;
    console.warn = () => {};
    try {
      window.api.lesePositionLesen = async () => {
        throw new Error('Kanal fort');
      };
      expect(await leseOffeneStelle('C:/a.md')).toBeNull();
    } finally {
      console.warn = warnung;
    }
  });

  it('fragt ohne Pfad nicht und liefert null', async () => {
    let gefragt = false;
    window.api.lesePositionLesen = async () => {
      gefragt = true;
      return { zeileOben: 3, schreibmarke: null };
    };
    expect(await leseOffeneStelle('')).toBeNull();
    expect(await leseOffeneStelle(null)).toBeNull();
    expect(gefragt).toBe(false);
  });
});

// Zugang zum Fenster-Zustand, wie ihn renderer.js reicht; hier mit eigenen
// Spalten statt des Fenster-Zustands.
function zugangMit(spalten) {
  return {
    spalten: () => spalten,
    elemente: () => null,
    editor: () => null,
    kennungen: () => [],
    elementFuerZeile: () => null,
  };
}

describe('vor der Verdrahtung', () => {
  it('sind die Funktionen mit Zugang zur Spalte wirkungslos und werfen nicht', async () => {
    const aktiv = {
      path: 'C:/a.md',
      viewMode: 'rendered',
      content: 'a\nb\nc',
      stelleOffen: { zeileOben: 2, schreibmarke: null },
    };
    const spalten = [{ tabs: [aktiv], activeIndex: 0 }];
    let gemerkt = 0;
    window.api.lesePositionMerken = async () => {
      gemerkt += 1;
    };
    // Ein unvollständiger Zugang hebt die Verdrahtung ebenso auf wie keiner.
    for (const ohne of [null, { ...zugangMit(spalten), editor: undefined }]) {
      modul.verdrahteLesePosition(ohne);
      expect(modul.messeStelle(0)).toBeNull();
      expect(() => modul.verwirfStelle(0)).not.toThrow();
      expect(() => modul.stelleOffeneHer(0)).not.toThrow();
      expect(aktiv.stelleOffen).toEqual({ zeileOben: 2, schreibmarke: null });
      expect(() => modul.notiereAnzeige(0)).not.toThrow();
      expect(() => modul.verlasseAnzeige(0)).not.toThrow();
      await modul.merkeAktiveStelle(0);
      await modul.merkeAlleSpalten();
      expect(gemerkt).toBe(0);
    }
    // Mit Zugang wirkt dieselbe Funktion auf denselben Reiter.
    modul.verdrahteLesePosition(zugangMit(spalten));
    try {
      modul.verwirfStelle(0);
      expect(aktiv.stelleOffen).toBeNull();
    } finally {
      modul.verdrahteLesePosition(null);
    }
  });
});

describe('verwirfStelle', () => {
  it('leert die offene Stelle des aktiven Reiters der Spalte und lässt andere stehen', () => {
    const aktiv = { path: 'C:/a.md', viewMode: 'rendered', stelleOffen: { zeileOben: 5 } };
    const anderer = { path: 'C:/b.md', viewMode: 'rendered', stelleOffen: { zeileOben: 7 } };
    modul.verdrahteLesePosition(zugangMit([{ tabs: [anderer, aktiv], activeIndex: 1 }]));
    try {
      modul.verwirfStelle(0);
      expect(aktiv.stelleOffen).toBeNull();
      expect(anderer.stelleOffen).toEqual({ zeileOben: 7 });
      expect(() => modul.verwirfStelle(5)).not.toThrow();
    } finally {
      modul.verdrahteLesePosition(null);
    }
  });
});
