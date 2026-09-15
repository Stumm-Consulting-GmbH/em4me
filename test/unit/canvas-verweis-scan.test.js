// 4T-001749 (Epic 3E-000289): Karten-Verweise im Bereichs-Index, in den
// ausgehenden Verweisen und im Umbenennungs-Nachzug — die prozessneutrale
// Hälfte.
//
// Geprüft wird hier die geteilte Erkennung (src/shared/markdown/link-scan.js),
// der Verweis-Parser des Bereichs-Index (src/main/index/parse.js, über
// parseContent ohne Datei-Zugriff) und der Umbenennungs-Nachzug
// (src/shared/link-rewrite.js). Die Wirkung auf Kanten, Rückverweise und
// Verweis-Graph steht in canvas-verweis-kanten.test.js, weil sie einen echten
// Index braucht; die ausgehenden Verweise des Panels stehen bei ihrem Modul in
// renderer/struktur-und-state.test.js.
//
// **Die Negativ-Fälle sind hier kein Beiwerk.** Ein zu viel gefundener Treffer
// erzeugt eine Kante, die niemand erklären kann, ein zu wenig gefundener fehlt
// lautlos, und beides fällt in keinem anderen Gate auf. Ohne die Rot-Proben
// prüfte der Positiv-Satz nur, dass überhaupt etwas gefunden wird.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { parseContent } from '../../src/main/index/parse.js';
import { computeLinkRewrites } from '../../src/shared/link-rewrite.js';
import {
  istCanvasFenceInfo,
  kartenBeschriftung,
  packeKartenVerweisWert,
  scanneKartenVerweise,
} from '../../src/shared/markdown/link-scan.js';

// Der Canvas-Kern wird ausschließlich LESEND herangezogen, für den
// Gleichlauf-Wächter der Grammatik weiter unten.
const require_ = createRequire(import.meta.url);
const { parseCanvasFence } = require_('../../src/shared/canvas/canvas-core.js');

const QUELLE = 'C:/bereich/Quelle.md';

// Baut ein Dokument mit genau einer Canvas-Fence.
function flaeche(...zeilen) {
  return ['# Titel', '', '```perspective-canvas', ...zeilen, '```', ''].join('\n');
}

// Die Karten-Treffer eines Dokuments (alles Übrige bleibt draußen).
function kartenTreffer(text, pfad = QUELLE) {
  return parseContent(pfad, text).hits.filter((h) => h.linkTyp === 'canvas');
}

// --- Geteilte Erkennung -------------------------------------------------------

describe('Geteilte Erkennung der Verweis-Angaben (link-scan.js, 4T-001749)', () => {
  it('erkennt die Info-Zeichenfolge der Fläche am ersten Wort', () => {
    expect(istCanvasFenceInfo('perspective-canvas')).toBe(true);
    expect(istCanvasFenceInfo('  perspective-canvas  ')).toBe(true);
    expect(istCanvasFenceInfo('perspective-canvas titel=Egal')).toBe(true);
    expect(istCanvasFenceInfo('js')).toBe(false);
    expect(istCanvasFenceInfo('perspective-events')).toBe(false);
    expect(istCanvasFenceInfo('')).toBe(false);
  });

  it('liest Wert, Schreibform und Spanne beider Angaben', () => {
    const treffer = scanneKartenVerweise('!karte k1 x=0 y=0 doc="Ziel.md#Kapitel" bild=bild.png');
    expect(treffer.map((t) => t.name)).toEqual(['doc', 'bild']);
    expect(treffer[0].wert).toBe('Ziel.md#Kapitel');
    expect(treffer[0].quotiert).toBe(true);
    expect(treffer[1].wert).toBe('bild.png');
    expect(treffer[1].quotiert).toBe(false);
    const zeile = '!karte k1 x=0 y=0 doc="Ziel.md#Kapitel" bild=bild.png';
    expect(zeile.slice(treffer[0].rohStart, treffer[0].rohStart + treffer[0].rohLen)).toBe(
      '"Ziel.md#Kapitel"',
    );
    expect(zeile.slice(treffer[1].nameStart)).toBe('bild=bild.png');
  });

  it('löst die Escapes der Grammatik auf und packt sie wieder ein', () => {
    const treffer = scanneKartenVerweise('!karte k1 doc="Mein \\"Ziel\\".md"');
    expect(treffer[0].wert).toBe('Mein "Ziel".md');
    expect(packeKartenVerweisWert(treffer[0].wert, { quotiert: true })).toBe(
      '"Mein \\"Ziel\\".md"',
    );
    // Ohne Anführungszeichen nur dort, wo der Wert sie nicht braucht.
    expect(packeKartenVerweisWert('Ziel', { quotiert: false })).toBe('Ziel');
    expect(packeKartenVerweisWert('Mein Ziel', { quotiert: false })).toBe('"Mein Ziel"');
  });

  it('nimmt keine Angabe aus dem Inneren eines quotierten Wertes', () => {
    // Das `doc=` steht hier im Wert eines anderen Attributs. Eine Regex auf
    // Wortgrenzen fiele darauf herein; die Zerlegung des Kerns tut es nicht.
    expect(scanneKartenVerweise('!karte k1 titel="ein doc=Ziel im Text"')).toEqual([]);
  });

  it('gibt eine leere Angabe nicht als Treffer aus', () => {
    expect(scanneKartenVerweise('!karte k1 doc=""')).toEqual([]);
    expect(scanneKartenVerweise('!karte k1 doc="   "')).toEqual([]);
    expect(scanneKartenVerweise('!karte k1 doc=')).toEqual([]);
  });

  it('gilt nur für die Marker-Zeile einer Karte in Spalte 0', () => {
    expect(scanneKartenVerweise('!form f1 doc="Ziel"')).toEqual([]);
    expect(scanneKartenVerweise('!kartenhalter k1 doc="Ziel"')).toEqual([]);
    expect(scanneKartenVerweise(' !karte k1 doc="Ziel"')).toEqual([]);
    expect(scanneKartenVerweise('\\!karte k1 doc="Ziel"')).toEqual([]);
    expect(scanneKartenVerweise('Text mit !karte k1 doc="Ziel"')).toEqual([]);
  });

  it('liefert die Beschriftung der Karte als erste nicht-leere Inhalts-Zeile', () => {
    const zeilen = ['!karte k1 doc="Ziel"', '', 'Mein Überblick', 'weiter', '!karte k2'];
    expect(kartenBeschriftung(zeilen, 0)).toBe('Mein Überblick');
    // Ohne eigenen Text bleibt sie leer — der Aufrufer fällt auf die Zeile
    // zurück.
    expect(kartenBeschriftung(zeilen, 4)).toBe('');
    expect(kartenBeschriftung(['!karte k1', '```'], 0)).toBe('');
    // Der Rückstrich-Schutz einer Inhalts-Zeile wird aufgelöst wie im Kern.
    expect(kartenBeschriftung(['!karte k1', '\\!kein Marker'], 0)).toBe('!kein Marker');
  });

  it('liest dieselben Werte wie der Canvas-Kern (Gleichlauf-Wächter)', () => {
    // Die Zusage «dieselbe Grammatik» ist kein Versprechen, sondern diese
    // Prüfung: Beide Leser laufen über dieselben Marker-Zeilen, und was der
    // Kern als `doc`/`bild` führt, muss die geteilte Erkennung ebenso finden.
    const zeilen = [
      '!karte k1 doc="Ziel"',
      '!karte k2 doc=Ziel',
      '!karte k3 doc="Mein Ziel.md#Kapitel"',
      '!karte k4 doc="Mein \\"Ziel\\".md"',
      '!karte k5 doc="C:\\\\Pfad\\\\Ziel.md"',
      '!karte k6 bild="Anlagen/Skizze.png"',
      '!karte k7 x=10 y=-20 b=200 h=100 doc="A" bild="b.png"',
      '!karte k8 titel="ein doc=Falle" doc="Echt"',
      '!karte k9 doc="A" doc="B"',
    ];
    for (const zeile of zeilen) {
      const el = parseCanvasFence(zeile).elemente[0];
      const letzte = (name) =>
        scanneKartenVerweise(zeile)
          .filter((a) => a.name === name)
          .pop();
      const gescannt = letzte('doc');
      // Der Kern verwirft `bild` bei doppelter Angabe erst in der Auswertung;
      // verglichen wird deshalb gegen die rohen Attribute, die beide lesen.
      expect(gescannt ? gescannt.wert : undefined).toBe(el.attrs.doc);
      const gescanntBild = letzte('bild');
      expect(gescanntBild ? gescanntBild.wert : undefined).toBe(el.attrs.bild);
    }
  });

  it('bleibt prozessneutral: kein Electron, kein DOM, kein Datei-Zugriff', () => {
    const quelle = readFileSync(
      new URL('../../src/shared/markdown/link-scan.js', import.meta.url),
      'utf8',
    );
    const importe = [...quelle.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    // Unverändert die eine Abhängigkeit des Bestands — der Canvas-Kern ist
    // bewusst NICHT hinzugekommen (Entscheidung 4T-001749).
    expect(importe).toEqual(['../area-link-syntax.js']);
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});

// --- Verweis-Parser des Bereichs-Index ---------------------------------------

describe('Verweis-Parser: Karten-Verweise (AK1 bis AK3, 4T-001749)', () => {
  it('AK1: erzeugt je Angabe einen Treffer mit dem Typ der Karte', () => {
    const treffer = kartenTreffer(flaeche('!karte k1 x=0 y=0 b=200 h=100 doc="Import"'));
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({
      zeile: 4,
      linkTyp: 'canvas',
      zielBasename: 'Import',
      zielAbsolut: null,
      anker: null,
    });
  });

  it('AK2: die Rückgabe-Form von parseContent bleibt unverändert', () => {
    const ohne = parseContent(QUELLE, '# Titel\n\n[[Normal]]\n');
    const mit = parseContent(QUELLE, flaeche('!karte k1 doc="Import"'));
    expect(Object.keys(mit).sort()).toEqual(Object.keys(ohne).sort());
    expect(Object.keys(mit[0] || {})).toEqual([]);
    // Die Treffer tragen dieselben Felder wie ein Wiki-Treffer.
    const wiki = parseContent(QUELLE, '[[Normal]]\n').hits[0];
    expect(Object.keys(mit.hits[0]).sort()).toEqual(Object.keys(wiki).sort());
  });

  it('AK2: Ziel, Anker und Unterseiten-Form folgen den Regeln des Wiki-Scans', () => {
    const treffer = kartenTreffer(
      flaeche(
        '!karte k1 doc="Import"',
        '!karte k2 doc="Konzepte/Import.md#Zielbild"',
        '!karte k3 doc="Import#^b-00042"',
        '!karte k4 doc="/Unterseite"',
        '!karte k5 doc="Mein Ziel mit Leerzeichen"',
      ),
    );
    expect(treffer.map((t) => [t.zielBasename, t.anker])).toEqual([
      ['Import', null],
      ['Konzepte/Import.md', 'Zielbild'],
      ['Import', '^b-00042'],
      // Relatives Unterseiten-Ziel gegen den eigenen Basename expandiert
      // (U+2215-Form wie im Wiki-Scan).
      ['Quelle\u2215Unterseite', null],
      ['Mein Ziel mit Leerzeichen', null],
    ]);
  });

  it('AK2: der Ausschnitt ist die Beschriftung der Karte, sonst die Marker-Zeile', () => {
    const treffer = kartenTreffer(
      flaeche('!karte k1 doc="Import"', 'Mein Überblick', '!karte k2 doc="Zweites"'),
    );
    expect(treffer[0].snippet).toBe('Mein Überblick');
    expect(treffer[1].snippet).toBe('!karte k2 doc="Zweites"');
  });

  it('nimmt mehrere Karten in einer Fence und mehrere Fences in einer Datei', () => {
    const text = [
      '```perspective-canvas',
      '!karte k1 doc="Eins"',
      '!karte k2 doc="Zwei"',
      '```',
      '',
      'Dazwischen',
      '',
      '~~~perspective-canvas',
      '!karte k3 doc="Drei"',
      '~~~',
      '',
    ].join('\n');
    expect(kartenTreffer(text).map((t) => t.zielBasename)).toEqual(['Eins', 'Zwei', 'Drei']);
  });

  it('AK3 (Rot-Probe): ein Wiki-Link im eigenen Text einer Karte erzeugt keinen Treffer', () => {
    const hits = parseContent(
      QUELLE,
      flaeche('!karte k1 doc="Import"', 'Siehe [[NichtGezaehlt]] dazu'),
    ).hits;
    expect(hits.map((h) => h.zielBasename)).toEqual(['Import']);
  });

  it('AK3 (Rot-Probe): eine Fence anderer Art bleibt unberührt', () => {
    const text = ['```js', '!karte k1 doc="Fremd"', '```', ''].join('\n');
    expect(parseContent(QUELLE, text).hits).toEqual([]);
    const ohneInfo = ['```', '!karte k1 doc="Fremd"', '```', ''].join('\n');
    expect(parseContent(QUELLE, ohneInfo).hits).toEqual([]);
  });

  it('AK7 (Rot-Probe): bild= erzeugt keinen Treffer', () => {
    const text = flaeche('!karte k1 x=0 y=0 bild="Anlagen/Skizze.png"');
    expect(parseContent(QUELLE, text).hits).toEqual([]);
  });

  it('Rot-Probe: eine Karte ohne doc= und ein reiner Anker erzeugen keinen Treffer', () => {
    const text = flaeche('!karte k1 x=0 y=0 b=200 h=100', '!karte k2 doc="#NurAnker"');
    expect(parseContent(QUELLE, text).hits).toEqual([]);
  });

  it('Rot-Probe: ein Verknüpfungs-Ziel in einen anderen Bereich bleibt draußen', () => {
    expect(kartenTreffer(flaeche('!karte k1 doc="@archiv:Ziel"'))).toEqual([]);
  });

  it('Rot-Probe: die geschlossene Fence trägt nicht weiter', () => {
    const text = [
      '```perspective-canvas',
      '!karte k1 doc="Drinnen"',
      '```',
      '',
      '!karte k2 doc="Draussen"',
      '',
    ].join('\n');
    expect(kartenTreffer(text).map((t) => t.zielBasename)).toEqual(['Drinnen']);
  });

  it('Rot-Probe: eine innere Fence gleicher Art beendet die Fläche (Bestands-Verhalten)', () => {
    // Das Fence-Tracking des Parsers ist bewusst einfach und kennt keine
    // Verschachtelung; festgehalten wird, was daraus folgt, statt es zu raten.
    const text = [
      '```perspective-canvas',
      '!karte k1 doc="Drinnen"',
      '```',
      '!karte k2 doc="NachInnererFence"',
      '```',
      '',
    ].join('\n');
    expect(kartenTreffer(text).map((t) => t.zielBasename)).toEqual(['Drinnen']);
  });

  it('Rot-Probe: eine unabgeschlossene Fläche liest bis zum Datei-Ende', () => {
    const text = ['```perspective-canvas', '!karte k1 doc="Import"', ''].join('\n');
    expect(kartenTreffer(text).map((t) => t.zielBasename)).toEqual(['Import']);
  });

  it('nimmt bei zwei doc=-Angaben das letzte, wie der Canvas-Kern', () => {
    const treffer = kartenTreffer(flaeche('!karte k1 doc="Erst" doc="Zuletzt"'));
    expect(treffer.map((t) => t.zielBasename)).toEqual(['Zuletzt']);
  });
});

// --- Umbenennungs-Nachzug -----------------------------------------------------

describe('Umbenennungs-Nachzug der Karten-Verweise (AK9, 4T-001749)', () => {
  const KONTEXT = '/bereich/Kapitel/Quelle.md';

  function umschreiben(zeilen, renames, contextPath = KONTEXT) {
    return computeLinkRewrites(flaeche(...zeilen), { renames, contextPath });
  }

  const umbenannt = (oldBase, newBase, dir = '/bereich/Kapitel') => ({
    oldBase,
    newBase,
    oldAbs: `${dir}/${oldBase}.md`,
    newAbs: `${dir}/${newBase}.md`,
  });

  it('zieht doc= beim Umbenennen nach wie einen Wiki-Link', () => {
    const res = umschreiben(['!karte k1 x=0 y=0 doc="Alt"'], [umbenannt('Alt', 'Neu')]);
    expect(res.changed).toBe(true);
    expect(res.newContent).toContain('!karte k1 x=0 y=0 doc="Neu"');
    expect(res.hits).toEqual([{ zeile: 4, alt: 'doc="Alt"', neu: 'doc="Neu"', typ: 'canvas-doc' }]);
  });

  it('erhält den Anker und die Unterseiten-Schreibweise', () => {
    const mitAnker = umschreiben(['!karte k1 doc="Alt#Kapitel"'], [umbenannt('Alt', 'Neu')]);
    expect(mitAnker.newContent).toContain('doc="Neu#Kapitel"');
    const mitBlock = umschreiben(['!karte k1 doc="Alt#^b-1"'], [umbenannt('Alt', 'Neu')]);
    expect(mitBlock.newContent).toContain('doc="Neu#^b-1"');
    const unterseite = umschreiben(
      ['!karte k1 doc="Eltern/Kind"'],
      [umbenannt('Eltern\u2215Kind', 'Eltern\u2215Enkel')],
    );
    expect(unterseite.newContent).toContain('doc="Eltern/Enkel"');
  });

  it('erhält eine Markdown-Endung am Ziel', () => {
    const res = umschreiben(['!karte k1 doc="Alt.md#Kapitel"'], [umbenannt('Alt', 'Neu')]);
    expect(res.newContent).toContain('doc="Neu.md#Kapitel"');
  });

  it('schreibt beim Verschieben den ganzen relativen Pfad neu', () => {
    const res = umschreiben(
      ['!karte k1 doc="../Konzepte/Alt.md"'],
      [
        {
          oldBase: 'Alt',
          newBase: 'Alt',
          oldAbs: '/bereich/Konzepte/Alt.md',
          newAbs: '/bereich/Archiv/Alt.md',
        },
      ],
    );
    expect(res.newContent).toContain('doc="../Archiv/Alt.md"');
  });

  it('zieht bild= nach wie einen relativen Bild-Verweis', () => {
    const res = umschreiben(
      ['!karte k1 bild="Anlagen/Skizze.png"'],
      [
        {
          oldBase: 'Skizze',
          newBase: 'Plan',
          oldAbs: '/bereich/Kapitel/Anlagen/Skizze.png',
          newAbs: '/bereich/Kapitel/Anlagen/Plan.png',
        },
      ],
    );
    expect(res.changed).toBe(true);
    expect(res.newContent).toContain('bild="Anlagen/Plan.png"');
    expect(res.hits[0].typ).toBe('canvas-bild');
  });

  it('zieht bild= auch als blossen Namen aus dem Bereich nach', () => {
    // Die Namens-Suche des Index löst `bild="Skizze.png"` auch dann auf, wenn
    // das Bild in einem anderen Ordner liegt; der Nachzug kennt keinen Index
    // und vergleicht deshalb über den vollen Dateinamen.
    const res = umschreiben(
      ['!karte k1 bild="Skizze.png"'],
      [
        {
          oldBase: 'Skizze',
          newBase: 'Plan',
          oldAbs: '/bereich/Anlagen/Skizze.png',
          newAbs: '/bereich/Anlagen/Plan.png',
        },
      ],
    );
    expect(res.newContent).toContain('bild="Plan.png"');
  });

  it('erhält die Schreibform des Bestands', () => {
    const unquotiert = umschreiben(['!karte k1 doc=Alt'], [umbenannt('Alt', 'Neu')]);
    expect(unquotiert.newContent).toContain('doc=Neu');
    const mitLeerzeichen = umschreiben(['!karte k1 doc=Alt'], [umbenannt('Alt', 'Neu mit Raum')]);
    expect(mitLeerzeichen.newContent).toContain('doc="Neu mit Raum"');
  });

  it('AK9: die übrige Fence bleibt byte-gleich', () => {
    const vorher = flaeche(
      '!karte k1 x=-320 y=-140 b=260 h=120 doc="Alt" titel="Bleibt so"',
      'Beschriftung mit [[Alt]] im Text',
      '!karte k2 x=40 y=-140 b=260 h=120',
      'Zweite Karte',
      '!linie e1 k1 -> k2 farbe=blau',
      '!form f1 x=0 y=0 b=10 h=10 art=oval',
    );
    const res = computeLinkRewrites(vorher, {
      renames: [umbenannt('Alt', 'Neu')],
      contextPath: KONTEXT,
    });
    expect(res.changed).toBe(true);
    // Genau eine Angabe ist angefasst: Der Unterschied beider Fassungen ist
    // die Zeichenfolge `doc="Alt"` gegen `doc="Neu"` und sonst nichts — auch
    // der Wiki-Link im eigenen Text der Karte bleibt stehen.
    expect(res.newContent).toBe(vorher.replace('doc="Alt"', 'doc="Neu"'));
    expect(res.newContent).toContain('Beschriftung mit [[Alt]] im Text');
    expect(res.hits).toHaveLength(1);
  });

  it('lässt eine Fence anderer Art unangetastet (Rot-Probe)', () => {
    const text = ['```js', '!karte k1 doc="Alt"', '```', ''].join('\n');
    const res = computeLinkRewrites(text, {
      renames: [umbenannt('Alt', 'Neu')],
      contextPath: KONTEXT,
    });
    expect(res.changed).toBe(false);
    expect(res.newContent).toBe(text);
  });

  it('lässt eine nicht betroffene Angabe unangetastet (Rot-Probe)', () => {
    const res = umschreiben(['!karte k1 doc="Fremd" bild="Fremd.png"'], [umbenannt('Alt', 'Neu')]);
    expect(res.changed).toBe(false);
  });
});
