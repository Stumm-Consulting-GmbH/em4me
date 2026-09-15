// 4T-001746 (Epic 3E-000289): Unit-Tests der Verweis- und Bild-Karten —
// Grammatik G7 und G8 der Fence `perspective-canvas`, ihre Befund-Semantik,
// der byte-gleiche Rundlauf und die Gegenrichtung im Modell.
//
// **Warum eine eigene Datei neben canvas-core.test.js.** Dort stehen die
// Grammatik der Stufen 1 und 2 und die Zusicherungen, die für jede Element-Art
// gelten; die beiden Verweis-Angaben der Karte sind eine abgegrenzte
// Fachlichkeit mit eigener Befund-Semantik und eigenem Verträglichkeits-Fall.
// Zusammen hätten beide das Datei-Budget der Prüfdateien (800 Code-Zeilen)
// gerissen, und der Schnitt läuft damit an der Sache statt an einer Zeile —
// Muster test/unit/quellcode-export-listen.test.js.
//
// **Kein neuer Marker und keine neue Element-Art:** Text und Verweis sind zwei
// Eigenschaften derselben Karte (Präzisierung des Product Owners vom
// 2026-09-09). Geprüft wird deshalb an derselben Karte, die es schon gab, und
// die Umfang-Zählung bekommt nichts Neues.
//
// Die Rundlauf-Proben liegen wie in der Nachbar-Datei bewusst auf Eingaben,
// die eine Normalform-Ausgabe **nicht** trifft; ein Rundlauf über eine
// gewöhnliche Fläche fällt zufällig grün aus und prüft nichts (Rot-Probe aus
// 4T-001652).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseCanvasFence,
  serializeCanvasFence,
  canvasFlaechenTitel,
  canvasKartenVorschau,
  canvasUmfang,
  kartenVerweisText,
} from '../../src/shared/canvas/canvas-core.js';
import {
  erzeugeKarte,
  fuegeElementEin,
  setzeKartenVerweis,
  setzeKartenBild,
} from '../../src/shared/canvas/canvas-elemente.js';
// Der geteilte Satz der Bild-Endungen (G8). Der Prüffall liest ihn aus
// derselben Quelle wie der Kern — eine zweite Aufzählung im Test wäre die
// Kopie, die dieser Vorgang gerade abgeschafft hat.
import { BILD_ENDUNGEN } from '../../src/shared/bild-endungen.js';

// Eine gewöhnliche Fläche der Stufen 1 und 2 als Gegenprobe: Was gestern
// richtig geschrieben wurde, wird heute zeichengleich geschrieben.
const RUMPF = [
  '!karte k1 x=-320 y=-140 b=260 h=120',
  '## Ausgangslage',
  '',
  '!karte k2 x=40 y=-140 b=260 h=120',
  '## Zielbild',
  '',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'ergibt',
].join('\n');

function rundlauf(rumpf) {
  return serializeCanvasFence(parseCanvasFence(rumpf));
}

describe('Bild-Endungen — eine Quelle statt dreier Kopien', () => {
  it('lesen Kern, Wiki-Plugin und Renderer aus der geteilten Konstante', () => {
    // Die eigentliche Aussage der Verlagerung. Eine Kopie fiele hier nicht auf,
    // sondern erst Monate später an einer Endung, die nur an zwei von drei
    // Stellen steht.
    const quellen = [
      '../../src/shared/canvas/canvas-core.js',
      '../../src/shared/canvas/canvas-elemente.js',
      '../../src/shared/markdown/plugins/wiki.js',
      '../../src/renderer/modules/attachments.js',
    ];
    for (const pfad of quellen) {
      const quelle = readFileSync(new URL(pfad, import.meta.url), 'utf8');
      expect(quelle, `${pfad} liest den Satz nicht aus der geteilten Quelle`).toMatch(
        /bild-endungen\.js/,
      );
      expect(quelle, `${pfad} trägt noch eine eigene Aufzählung`).not.toMatch(/'jpeg'\s*,\s*'gif'/);
    }
  });
});

describe('canvas-core — Grammatik der Verweis-Karte (G7, AK2)', () => {
  it('liest das Ziel in ein benanntes Feld und lässt die Beschriftung stehen', () => {
    const model = parseCanvasFence(
      '!karte k2 x=40 y=-140 b=260 h=120 doc="Konzepte/Import.md#Zielbild"\n## Zielbild\n\nText.',
    );
    expect(model.errors).toEqual([]);
    expect(model.elemente[0]).toMatchObject({
      art: 'karte',
      id: 'k2',
      x: 40,
      y: -140,
      doc: 'Konzepte/Import.md#Zielbild',
      bild: undefined,
    });
    // Der Text gehört der Karte und wird durch den Verweis nicht ersetzt.
    expect(model.elemente[0].inhalt).toBe('## Zielbild\n\nText.');
  });

  it('nimmt dieselben Ziel-Formen wie eine Einbettung, samt beider Anker-Arten', () => {
    const ziele = [
      'Import.md',
      'Import',
      'Konzepte/Import.md',
      '../Ablage/Import.md',
      'Import.md#Zielbild',
      'Import.md#^abc-123',
      'Ordner mit Leerzeichen/Über Änderungen.md#Maß & Ziel',
    ];
    for (const ziel of ziele) {
      const roh = `!karte k1 x=0 y=0 b=1 h=1 doc="${ziel}"`;
      const model = parseCanvasFence(roh);
      expect(model.errors, ziel).toEqual([]);
      expect(model.elemente[0].doc).toBe(ziel);
      // AK13 der Story: Leerzeichen, Umlaute und Sonderzeichen überleben.
      expect(rundlauf(roh)).toBe(roh);
    }
  });

  it('lässt eine Karte ohne Verweis eine Karte ohne Verweis sein', () => {
    const el = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1\nNur Text').elemente[0];
    expect(el.doc).toBeUndefined();
    expect(el.bild).toBeUndefined();
    // Kein erfundenes Feld und keine erfundene Angabe.
    expect(el.attrs.doc).toBeUndefined();
  });

  it('trägt Verweis und Beschriftung unabhängig voneinander', () => {
    // AK4 und AK5 der Story 4S-000941: vier Kombinationen, alle gültig.
    const faelle = [
      ['!karte k1 x=0 y=0 b=1 h=1', undefined, ''],
      ['!karte k1 x=0 y=0 b=1 h=1\nBeschriftung', undefined, 'Beschriftung'],
      ['!karte k1 x=0 y=0 b=1 h=1 doc="Z.md"', 'Z.md', ''],
      ['!karte k1 x=0 y=0 b=1 h=1 doc="Z.md"\nBeschriftung', 'Z.md', 'Beschriftung'],
    ];
    for (const [roh, doc, inhalt] of faelle) {
      const el = parseCanvasFence(roh).elemente[0];
      expect(el.doc, roh).toBe(doc);
      expect(el.inhalt, roh).toBe(inhalt);
      expect(rundlauf(roh), roh).toBe(roh);
    }
  });

  it('prüft die Existenz des Ziels nicht — das kann der Kern gar nicht', () => {
    // Er ist prozessneutral und kennt keine Dateien; das nicht auflösbare Ziel
    // ist ein Befund des Renderer-Pfads (4T-001747).
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 doc="Gibt/Es/Nicht.md#Weg"');
    expect(model.errors).toEqual([]);
    expect(model.elemente[0].doc).toBe('Gibt/Es/Nicht.md#Weg');
  });
});

describe('canvas-core — Grammatik der Bild-Karte (G8, AK2)', () => {
  it('liest den Bild-Pfad in ein benanntes Feld', () => {
    const model = parseCanvasFence('!karte k3 x=-140 y=120 b=260 h=160 bild="Anlagen/Skizze.png"');
    expect(model.errors).toEqual([]);
    expect(model.elemente[0]).toMatchObject({ bild: 'Anlagen/Skizze.png', doc: undefined });
  });

  it('nimmt genau die Bild-Endungen der Anlagen-Mechanik', () => {
    for (const endung of BILD_ENDUNGEN) {
      const model = parseCanvasFence(`!karte k1 x=0 y=0 b=1 h=1 bild="Bild.${endung}"`);
      expect(model.errors, endung).toEqual([]);
      expect(model.elemente[0].bild).toBe(`Bild.${endung}`);
    }
    // Groß-Kleinschreibung der Endung ist keine andere Endung.
    expect(parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 bild="Bild.PNG"').errors).toEqual([]);
  });

  it('meldet eine unzulässige Endung und lässt die Karte ihren Text zeigen', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 bild="Bericht.pdf"\nText');
    expect(model.errors).toEqual([
      { code: 'ungueltigeBildEndung', zeile: 1, detail: 'Bericht.pdf' },
    ]);
    expect(model.elemente[0].bild).toBeUndefined();
    expect(model.elemente[0].inhalt).toBe('Text');
    // Die Angabe bleibt in der Datei stehen, auch wenn die Karte bewegt wird.
    model.elemente[0].x = 42;
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=42 y=0 b=1 h=1 bild="Bericht.pdf"\nText');
  });
});

describe('canvas-core — Befunde der beiden Verweis-Angaben (6.3, AK6)', () => {
  it('meldet einen leeren Wert und führt die Karte als Text-Karte', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 doc="" bild=""\nText');
    expect(model.errors).toEqual([
      { code: 'leererVerweis', zeile: 1, detail: 'doc' },
      { code: 'leererVerweis', zeile: 1, detail: 'bild' },
    ]);
    expect(model.elemente[0]).toMatchObject({ doc: undefined, bild: undefined, inhalt: 'Text' });
  });

  it('lässt `doc=` gewinnen und das Bild unbeachtet in der Datei stehen', () => {
    const roh = '!karte k1 x=0 y=0 b=1 h=1 doc="Ziel.md" bild="Skizze.png"';
    const model = parseCanvasFence(roh);
    expect(model.errors).toEqual([{ code: 'doppelterVerweis', zeile: 1, detail: 'bild' }]);
    expect(model.elemente[0]).toMatchObject({ doc: 'Ziel.md', bild: undefined });
    expect(rundlauf(roh)).toBe(roh);
    // Auch das kanonische Schreiben behält die unbeachtete Angabe.
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe(roh);
  });

  it('meldet je Karte genau einen Befund: doc gewinnt vor der Endungs-Frage', () => {
    // Ein Bild, das ohnehin niemanden mehr betrifft, braucht keine zweite Rüge.
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 doc="Z.md" bild="Bericht.pdf"');
    expect(model.errors.map((f) => f.code)).toEqual(['doppelterVerweis']);
  });

  it('verwirft in keinem der Fälle ein Element', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=1 h=1 doc=""',
      '!karte k2 x=0 y=0 b=1 h=1 doc="A.md" bild="B.png"',
      '!karte k3 x=0 y=0 b=1 h=1 bild="C.txt"',
    ].join('\n');
    const model = parseCanvasFence(rumpf);
    expect(model.elemente.map((e) => e.id)).toEqual(['k1', 'k2', 'k3']);
    expect(rundlauf(rumpf)).toBe(rumpf);
  });
});

describe('canvas-core — Rundlauf über Verweis- und Bild-Karten (AK3)', () => {
  it('erhält eine Schreibweise, die eine Normalform zerstören würde', () => {
    // Bewusst normalform-fern: andere Reihenfolge der Angaben, doppelte
    // Abstände, ein unquotierter und ein überflüssig quotierter Wert, Escapes
    // im Ziel, beide Anker-Formen, unbekannte Angaben an derselben Karte.
    const roh = [
      '!karte  k1   doc=Konzepte/Import.md#Zielbild h=120 b=260 y=-140 x=40 quelle=alt',
      'Beschriftung mit «Sonderzeichen» und —',
      '!karte k2 x=0 y=0 b=1 h=1 doc="Ordner \\"eng\\"/Datei.md#^abc-123"',
      '!karte k3 x=-140 y=120 b=260 h=160 bild="Anlagen/Skizze.png" rahmen=dick',
      '!karte k4 x=0 y=0 b=1 h=1 bild="Anlagen/Über Änderungen.png"',
    ].join('\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('erhält CRLF über einer Fläche mit Verweis- und Bild-Karten', () => {
    const roh = [
      '!karte k1 x=0 y=0 b=10 h=10 doc="Ziel.md"',
      'Beschriftung',
      '!karte k2 x=0 y=0 b=10 h=10 bild="Skizze.png"',
      '!linie e1 k1 -> k2',
    ].join('\r\n');
    expect(rundlauf(roh)).toBe(roh);
  });

  it('schreibt einen geänderten Verweis kanonisch in Anführungszeichen', () => {
    // Die kanonische Form quotiert das Ziel **immer**, auch wo es die Grammatik
    // nicht verlangt: Ein Ziel mit Leerzeichen sieht in der Datei damit nicht
    // anders aus als eines ohne.
    const model = parseCanvasFence('!karte  k1 doc=Ziel.md y=0 x=0 h=1 b=1');
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe('!karte k1 doc="Ziel.md" y=0 x=0 h=1 b=1');
  });

  it('schreibt einen neu gesetzten Verweis hinter die Lage', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1');
    setzeKartenVerweis(model.elemente[0], 'Ziel.md');
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=0 y=0 b=1 h=1 doc="Ziel.md"');
  });

  it('behält unbekannte Angaben an einer Verweis-Karte auch beim Ändern (AK5, G1)', () => {
    const model = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 doc="Z.md" glanz=matt spur=2');
    model.elemente[0].x = 7;
    model.elemente[0].geaendert = true;
    expect(serializeCanvasFence(model)).toBe(
      '!karte k1 x=7 y=0 b=1 h=1 doc="Z.md" glanz=matt spur=2',
    );
  });

  it('lässt eine Fläche der Stufen 1 und 2 unverändert', () => {
    expect(rundlauf(RUMPF)).toBe(RUMPF);
  });
});

describe('canvas-core — ein Leser der Stufe 2 verliert nichts (AK7, G1)', () => {
  // Der Leser der Stufe 2 ist **dieser** Code mit dem Wissensstand von damals.
  // Die Marker sind dieselben geblieben — die Stufe 3 hat keinen hinzugefügt —,
  // und genau darin liegt die Zusage: Die beiden neuen Angaben fallen bei einer
  // älteren Fassung unter G1 für unbekannte **Angaben** und werden über `attrs`
  // in ursprünglicher Reihenfolge zurückgeschrieben. `optionen.bekannteMarker`
  // trägt hier deshalb nichts bei; der Wissensstand von damals wird an der
  // Stelle hergestellt, an der er sich unterscheidet — im Modell der Karte.
  const FLAECHE = [
    '!gruppe g1 x=-360 y=-180 b=720 h=200 farbe=blau',
    'Analyse',
    '!karte k1 x=-320 y=-140 b=260 h=120',
    '## Ausgangslage',
    '',
    '!karte k2 x=40 y=-140 b=260 h=120 doc="Konzepte/Import.md#Zielbild"',
    '!karte k3 x=-140 y=120 b=260 h=160 bild="Anlagen/Skizze.png"',
    'Skizze',
    '!form s1 x=380 y=120 b=90 h=90 art=stern rand=rot füllung=gelb',
    '!linie e1 k1 -> k2 von=rechts nach=links',
  ].join('\n');

  it('schreibt eine Fläche der Stufe 3 byte-gleich zurück', () => {
    expect(rundlauf(FLAECHE)).toBe(FLAECHE);
  });

  it('behält die beiden Angaben, wenn eine ältere Fassung eine andere Karte verschiebt', () => {
    // Der eigentliche Schadensfall: zwei Programmfassungen an einer Datei. Die
    // ältere bewegt k1 und speichert — die Verweise an k2 und k3 bleiben stehen.
    const model = parseCanvasFence(FLAECHE);
    const alt = model.elemente.find((e) => e.id === 'k1');
    alt.x = 0;
    alt.geaendert = true;
    const neu = serializeCanvasFence(model);
    expect(neu).toContain('doc="Konzepte/Import.md#Zielbild"');
    expect(neu).toContain('bild="Anlagen/Skizze.png"');
    expect(neu.replace('x=0 y=-140', 'x=-320 y=-140')).toBe(FLAECHE);
  });

  it('behält sie auch, wenn die ältere Fassung genau die Verweis-Karte verschiebt', () => {
    // Die schärfere Probe: Hier trägt der Rohtext-Erhalt aus G2 nicht mehr,
    // sondern allein die Mitführung über `attrs`. Ein Leser, der `doc=` nicht
    // kennt, führt im Modell auch kein Feld dafür — und schreibt es trotzdem.
    const model = parseCanvasFence('!karte k2 x=40 y=0 b=1 h=1 doc="Ziel.md" bild="B.png"');
    const el = model.elemente[0];
    delete el.doc;
    delete el.bild;
    el.x = 0;
    el.geaendert = true;
    expect(serializeCanvasFence(model)).toBe(
      '!karte k2 x=0 y=0 b=1 h=1 doc="Ziel.md" bild="B.png"',
    );
  });
});

describe('canvas-core — Umfang und Vorschau der Verweis-Karten (AK9, AK10)', () => {
  const FLAECHE = [
    '!karte k1 x=0 y=0 b=1 h=1',
    '## Eigener Text',
    '!karte k2 x=0 y=0 b=1 h=1 doc="Konzepte/Import.md#Zielbild"',
    '!karte k3 x=0 y=0 b=1 h=1 bild="Anlagen/Skizze.png"',
    '!linie e1 k1 -> k2',
  ].join('\n');

  it('zählt Verweis- und Bild-Karten als Karten und kennt keine neue Zahl', () => {
    const umfang = canvasUmfang(parseCanvasFence(FLAECHE));
    expect(umfang).toEqual({ karten: 3, linien: 1, formen: 0, gruppen: 0, befunde: 0 });
    // Die Gegenprobe zur Versuchung, dem Muster von Formen und Gruppen zu
    // folgen: Eine Verweis-Karte ist eine Karte, keine Art neben ihr.
    expect(Object.keys(umfang)).toEqual(['karten', 'linien', 'formen', 'gruppen', 'befunde']);
  });

  it('nimmt für die Vorschau die Beschriftung, sonst das Ziel', () => {
    const el = (rumpf) => parseCanvasFence(rumpf).elemente[0];
    expect(canvasKartenVorschau(el('!karte k1 x=0 y=0 b=1 h=1 doc="A.md#B"'))).toEqual({
      titel: 'A.md#B',
      zeile: '',
    });
    expect(canvasKartenVorschau(el('!karte k1 x=0 y=0 b=1 h=1 doc="A.md#B"\n# Eigener'))).toEqual({
      titel: 'Eigener',
      zeile: '',
    });
  });

  it('nimmt für eine Bild-Karte den Namen des Bildes, nicht seinen Ordner', () => {
    // Ein Bild wird im Bereich über seinen **Namen** gefunden; sein Ordner ist
    // Ablage und keine Aussage. Beim Dokument-Ziel trägt dagegen der Anker die
    // Aussage, deshalb steht es dort vollständig da.
    const el = parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1 bild="Anlagen/Skizze.png"').elemente[0];
    expect(canvasKartenVorschau(el).titel).toBe('Skizze.png');
    expect(kartenVerweisText(el)).toBe('Skizze.png');
    expect(kartenVerweisText(null)).toBe('');
    expect(kartenVerweisText(parseCanvasFence('!karte k1 x=0 y=0 b=1 h=1').elemente[0])).toBe('');
  });

  it('benennt eine Fläche nach dem Ziel ihrer ersten Karte, wenn diese keinen Text trägt', () => {
    const titel = (rumpf) => canvasFlaechenTitel(parseCanvasFence(rumpf));
    expect(titel('!karte k1 x=0 y=0 b=1 h=1 doc="Konzepte/Import.md"')).toBe('Konzepte/Import.md');
    expect(titel('!karte k1 x=0 y=0 b=1 h=1 doc="X.md"\n# Eigener')).toBe('Eigener');
    // Der Rückfall bleibt leer, wo es nichts zu benennen gibt.
    expect(titel('!karte k1 x=0 y=0 b=1 h=1')).toBe('');
  });
});

describe('canvas-elemente — Setzen, Ändern und Entfernen der Verweise (AK4)', () => {
  const karte = (rumpf = '!karte k1 x=0 y=0 b=1 h=1\nBeschriftung') => parseCanvasFence(rumpf);

  it('setzt einen Dokument-Verweis und liest ihn aus dem geschriebenen Rumpf zurück', () => {
    const model = karte();
    expect(setzeKartenVerweis(model.elemente[0], 'Konzepte/Import.md#Zielbild')).toBe(true);
    const rumpf = serializeCanvasFence(model);
    expect(rumpf).toBe('!karte k1 x=0 y=0 b=1 h=1 doc="Konzepte/Import.md#Zielbild"\nBeschriftung');
    expect(parseCanvasFence(rumpf).elemente[0]).toMatchObject({
      doc: 'Konzepte/Import.md#Zielbild',
      inhalt: 'Beschriftung',
    });
  });

  it('ändert ein gesetztes Ziel, ohne eine zweite Angabe zu hinterlassen', () => {
    const model = karte('!karte k1 x=0 y=0 b=1 h=1 doc="Alt.md"');
    expect(setzeKartenVerweis(model.elemente[0], 'Neu.md#Stelle')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=0 y=0 b=1 h=1 doc="Neu.md#Stelle"');
    // Dasselbe Ziel ein zweites Mal ist keine Änderung.
    expect(setzeKartenVerweis(model.elemente[0], 'Neu.md#Stelle')).toBe(false);
  });

  it('macht die Karte beim Entfernen wieder zur Text-Karte und lässt ihren Text stehen', () => {
    const model = karte('!karte k1 x=0 y=0 b=1 h=1 doc="Alt.md"\nBeschriftung');
    expect(setzeKartenVerweis(model.elemente[0], null)).toBe(true);
    expect(model.elemente[0].doc).toBeUndefined();
    const rumpf = serializeCanvasFence(model);
    expect(rumpf).toBe('!karte k1 x=0 y=0 b=1 h=1\nBeschriftung');
    expect(parseCanvasFence(rumpf).elemente[0].inhalt).toBe('Beschriftung');
    expect(setzeKartenVerweis(model.elemente[0], null)).toBe(false);
  });

  it('behandelt einen leeren Wert wie ein Entfernen, statt einen Befund zu erzeugen', () => {
    const model = karte('!karte k1 x=0 y=0 b=1 h=1 doc="Alt.md"');
    expect(setzeKartenVerweis(model.elemente[0], '   ')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=0 y=0 b=1 h=1');
  });

  it('setzt ein Bild und weist eine unzulässige Endung zurück', () => {
    const model = karte();
    expect(setzeKartenBild(model.elemente[0], 'Bericht.pdf')).toBe(false);
    expect(model.elemente[0].geaendert).toBe(false);
    expect(setzeKartenBild(model.elemente[0], 'Anlagen/Skizze.png')).toBe(true);
    expect(serializeCanvasFence(model)).toBe(
      '!karte k1 x=0 y=0 b=1 h=1 bild="Anlagen/Skizze.png"\nBeschriftung',
    );
  });

  it('widmet eine Bild-Karte um, statt beide Angaben nebeneinander zu schreiben', () => {
    // Der Kern liest beide Angaben an einer Karte als Befund; eine
    // Bedien-Handlung darf ihn nicht erzeugen.
    const model = karte('!karte k1 x=0 y=0 b=1 h=1 bild="Skizze.png"');
    expect(setzeKartenVerweis(model.elemente[0], 'Ziel.md')).toBe(true);
    const rumpf = serializeCanvasFence(model);
    expect(rumpf).toBe('!karte k1 x=0 y=0 b=1 h=1 doc="Ziel.md"');
    expect(parseCanvasFence(rumpf).errors).toEqual([]);
    // Und in die andere Richtung genauso.
    expect(setzeKartenBild(model.elemente[0], 'Neu.png')).toBe(true);
    expect(serializeCanvasFence(model)).toBe('!karte k1 x=0 y=0 b=1 h=1 bild="Neu.png"');
  });

  it('rührt eine Form oder Gruppe nicht an', () => {
    const model = parseCanvasFence('!form s1 x=0 y=0 b=1 h=1\n!gruppe g1 x=0 y=0 b=1 h=1');
    expect(setzeKartenVerweis(model.elemente[0], 'Z.md')).toBe(false);
    expect(setzeKartenBild(model.elemente[1], 'B.png')).toBe(false);
    expect(serializeCanvasFence(model)).toBe(
      '!form s1 x=0 y=0 b=1 h=1\n!gruppe g1 x=0 y=0 b=1 h=1',
    );
  });

  it('legt eine Verweis- und eine Bild-Karte in einem Zug an', () => {
    const model = { elemente: [], errors: [], praeambel: [], zeilenende: '\n' };
    fuegeElementEin(model, erzeugeKarte({ id: 'k1', x: 0, y: 0, b: 260, h: 120, doc: 'Z.md#A' }));
    fuegeElementEin(model, erzeugeKarte({ id: 'k2', x: 0, y: 0, b: 260, h: 120, bild: 'S.png' }));
    expect(serializeCanvasFence(model)).toBe(
      [
        '!karte k1 x=0 y=0 b=260 h=120 doc="Z.md#A"',
        '!karte k2 x=0 y=0 b=260 h=120 bild="S.png"',
      ].join('\n'),
    );
    expect(parseCanvasFence(serializeCanvasFence(model)).errors).toEqual([]);
  });
});
