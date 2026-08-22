// 4T-1045 (Epic 3E-0151): Unit-Tests des Mindmap-Kerns — Baum-Abbildung
// (Überschriften, Listen, Fließtext als Notiz), Wurzel-Regel, Quellzeilen,
// Ränder (leer, strukturlos, übersprungene Ebene), Obergrenze und die
// Anordnung (Überlappungsfreiheit, Determinismus).
//
// Gemessen wird gegen die **echte** Render-Pipeline (src/shared/markdown/
// markdown.js), nicht gegen eine eigens gebaute markdown-it-Instanz: Die
// Story 4S-0802 verlangt den Token-Strom der bestehenden Pipeline, und ein
// zweiter Parser im Test prüfte etwas anderes als das, was im Betrieb läuft.
import { describe, it, expect } from 'vitest';
import {
  buildMindmapTree,
  layoutMindmap,
  teileWurzelKinder,
  mindmapAusMarkdown,
  mindmapAusDokument,
  KNOTEN_OBERGRENZE,
} from '../../src/shared/mindmap-core.js';
import { MINDMAP_LAYOUTS } from '../../src/shared/mindmap-optionen.js';
import { md } from '../../src/shared/markdown/markdown.js';

// Kurzform: Baum aus Quelltext, Wurzel-Titel wie ein Dateiname.
function baum(text, opts = {}) {
  return mindmapAusMarkdown(text, md, { wurzelTitel: 'Datei', ...opts });
}

// Titel der Kinder eines Knotens, für knappe Erwartungen.
function titel(knoten) {
  return (knoten.kinder || []).map((k) => k.titel);
}

// Alle Knoten eines Baums in Vorordnung.
function alleKnoten(wurzel) {
  const out = [];
  const lauf = (k) => {
    out.push(k);
    (k.kinder || []).forEach(lauf);
  };
  if (wurzel) lauf(wurzel);
  return out;
}

describe('Mindmap-Kern: Baum-Abbildung (4T-1045)', () => {
  it('AK1: Überschriften bilden die oberen Baum-Ebenen', () => {
    const { root } = baum('# Titel\n\n## Eins\n\n### Tiefer\n\n## Zwei\n');
    expect(root.titel).toBe('Titel');
    expect(titel(root)).toEqual(['Eins', 'Zwei']);
    expect(titel(root.kinder[0])).toEqual(['Tiefer']);
  });

  it('AK2: hierarchische Listen setzen die Hierarchie unter ihrem Knoten fort', () => {
    const { root } = baum('# Titel\n\n## Kapitel\n\n- Alpha\n  - Alpha eins\n- Beta\n');
    const kapitel = root.kinder[0];
    expect(titel(kapitel)).toEqual(['Alpha', 'Beta']);
    expect(titel(kapitel.kinder[0])).toEqual(['Alpha eins']);
  });

  it('AK3: Fließtext wird Notiz des übergeordneten Knotens und nie eigener Knoten', () => {
    const { root } = baum('# Titel\n\n## Kapitel\n\nEin Absatz.\n\nNoch einer.\n');
    const kapitel = root.kinder[0];
    expect(kapitel.kinder).toEqual([]);
    expect(kapitel.notizen.map((n) => n.text)).toEqual(['Ein Absatz.', 'Noch einer.']);
    expect(kapitel.notizen.every((n) => n.art === 'absatz')).toBe(true);
  });

  it('AK3: Code-Blöcke und Tabellen werden Notiz, nicht Knoten', () => {
    const quelle = ['# Titel', '', '## Kapitel', '', '```js', 'const a = 1;', '```', ''].join('\n');
    const { root } = baum(quelle);
    const kapitel = root.kinder[0];
    expect(kapitel.kinder).toEqual([]);
    expect(kapitel.notizen[0].art).toBe('code');
    expect(kapitel.notizen[0].text).toContain('const a = 1;');
  });

  it('AK3: eine Tabelle ist genau eine Notiz, nicht je Zelle eine', () => {
    const quelle = ['# Titel', '', '| A | B |', '|---|---|', '| 1 | 2 |', ''].join('\n');
    const { root } = baum(quelle);
    const tabellen = root.notizen.filter((n) => n.art === 'tabelle');
    expect(tabellen).toHaveLength(1);
    expect(root.notizen).toHaveLength(1);
  });

  it('AK4: Notizen eines Knotens stehen in Dokument-Reihenfolge', () => {
    const { root } = baum('# Titel\n\nErster.\n\nZweiter.\n\nDritter.\n');
    expect(root.notizen.map((n) => n.text)).toEqual(['Erster.', 'Zweiter.', 'Dritter.']);
  });

  it('AK5: genau eine Überschrift erster Ebene wird selbst zur Wurzel', () => {
    const { root } = baum('# Einziger\n\n## Kind\n');
    expect(root.titel).toBe('Einziger');
    expect(root.art).toBe('ueberschrift');
    expect(titel(root)).toEqual(['Kind']);
  });

  it('AK5: bei mehreren Überschriften erster Ebene trägt der Dateiname die Wurzel', () => {
    const { root } = baum('# Eins\n\n# Zwei\n');
    expect(root.titel).toBe('Datei');
    expect(root.art).toBe('wurzel');
    expect(titel(root)).toEqual(['Eins', 'Zwei']);
  });

  it('AK6: jeder Knoten trägt die Zeilennummer seiner Quellstelle', () => {
    const { root } = baum('# Titel\n\n## Kapitel\n\n- Punkt\n');
    expect(root.zeile).toBe(0);
    const kapitel = root.kinder[0];
    expect(kapitel.zeile).toBe(2);
    expect(kapitel.kinder[0].zeile).toBe(4);
  });

  it('AK6: ein Kopfbereich verschiebt die Zeilennummern um seine Länge', () => {
    const { root } = baum('# Titel\n', { zeilenVersatz: 5 });
    expect(root.zeile).toBe(5);
  });

  it('AK9: eine übersprungene Ebene erzeugt keinen Leerknoten', () => {
    const { root } = baum('# Titel\n\n### Zwei Ebenen tiefer\n');
    expect(titel(root)).toEqual(['Zwei Ebenen tiefer']);
    expect(alleKnoten(root)).toHaveLength(2);
  });

  it('die Sonderregel der Referenz entfällt: eine Liste neben einem Absatz bleibt erhalten', () => {
    // markmap ignoriert Listen, wenn auf derselben Ebene Blöcke stehen. Hier
    // ist der Absatz Notiz und die Liste Knoten, die Konkurrenz besteht also
    // nicht mehr (Konzept-Entscheidung vom 2026-08-14).
    const { root } = baum('# Titel\n\nEin Absatz.\n\n- Punkt eins\n- Punkt zwei\n');
    expect(titel(root)).toEqual(['Punkt eins', 'Punkt zwei']);
    expect(root.notizen.map((n) => n.text)).toEqual(['Ein Absatz.']);
  });

  it('eine Raute in einem Code-Block ist keine Überschrift', () => {
    // Der Grund, warum der Kern die echte Pipeline nutzt statt eines eigenen
    // Zeilen-Parsers (Plan-Entscheidung vom 2026-08-14).
    const quelle = ['# Titel', '', '```', '# keine Überschrift', '```', ''].join('\n');
    const { root } = baum(quelle);
    expect(titel(root)).toEqual([]);
    expect(root.notizen[0].art).toBe('code');
  });

  it('Inline-Auszeichnungen stehen als HTML am Knoten', () => {
    const { root } = baum('# Titel\n\n## Mit **fett**\n');
    expect(root.kinder[0].titelHtml).toContain('<strong>');
  });
});

describe('Mindmap-Kern: Ränder (4T-1045)', () => {
  it('AK8: ein leeres Dokument ergibt einen Baum aus der Wurzel allein', () => {
    const { root, knotenZahl } = baum('');
    expect(root.titel).toBe('Datei');
    expect(root.kinder).toEqual([]);
    expect(knotenZahl).toBe(1);
  });

  it('AK7: ein Dokument ohne Struktur ergibt die Wurzel mit dem Text als Notiz', () => {
    const { root } = baum('Nur ein Absatz ohne alles.\n');
    expect(root.kinder).toEqual([]);
    expect(root.notizen.map((n) => n.text)).toEqual(['Nur ein Absatz ohne alles.']);
  });

  it('AK12: oberhalb der Obergrenze wird gekappt statt weitergebaut', () => {
    const zeilen = [];
    for (let i = 0; i < KNOTEN_OBERGRENZE + 50; i++) zeilen.push(`- Punkt ${i}`);
    const { knotenZahl, gekappt } = baum(zeilen.join('\n'));
    expect(gekappt).toBe(true);
    expect(knotenZahl).toBeLessThanOrEqual(KNOTEN_OBERGRENZE);
  });

  it('ein Baum unterhalb der Obergrenze wird nicht als gekappt gemeldet', () => {
    const { gekappt } = baum('# Titel\n\n- Eins\n- Zwei\n');
    expect(gekappt).toBe(false);
  });

  it('der Kern arbeitet ohne DOM und ohne geöffneten Editor (AK11)', () => {
    // Der Testlauf selbst ist der Nachweis: keine DOM-Umgebung, kein
    // Editor-Zustand, nur Quelltext hinein und Daten heraus.
    expect(typeof globalThis.document).toBe('undefined');
    const { root } = baum('# Titel\n');
    expect(root.titel).toBe('Titel');
  });
});

describe('Mindmap-Kern: Anordnung (4T-1045)', () => {
  const quelle = [
    '# Wurzel',
    '',
    '## Ast eins',
    '',
    '- Blatt A',
    '- Blatt B',
    '',
    '## Ast zwei',
    '',
    '- Blatt C',
    '',
  ].join('\n');

  it('AK10: kein Knoten überlappt einen anderen', () => {
    const { root } = baum(quelle);
    layoutMindmap(root);
    const knoten = alleKnoten(root);
    for (let i = 0; i < knoten.length; i++) {
      for (let j = i + 1; j < knoten.length; j++) {
        const a = knoten[i];
        const b = knoten[j];
        const getrenntX = a.x + a.breite <= b.x || b.x + b.breite <= a.x;
        const getrenntY =
          a.y + a.hoehe / 2 <= b.y - b.hoehe / 2 || b.y + b.hoehe / 2 <= a.y - a.hoehe / 2;
        expect(getrenntX || getrenntY, `Überlappung zwischen „${a.titel}" und „${b.titel}"`).toBe(
          true,
        );
      }
    }
  });

  it('AK10: gleicher Eingang ergibt exakt gleiche Anordnung', () => {
    const eins = baum(quelle).root;
    const zwei = baum(quelle).root;
    layoutMindmap(eins);
    layoutMindmap(zwei);
    const lage = (w) => alleKnoten(w).map((k) => `${k.titel}@${k.x},${k.y}`);
    expect(lage(eins)).toEqual(lage(zwei));
  });

  it('jede Ebene bekommt eine Spalte, deren Breite ihr breitester Knoten bestimmt', () => {
    const { root } = baum(quelle);
    layoutMindmap(root, { spaltenAbstand: 10, messen: () => ({ breite: 50, hoehe: 10 }) });
    expect(root.x).toBe(0);
    expect(root.kinder[0].x).toBe(60);
    expect(root.kinder[0].kinder[0].x).toBe(120);
  });

  it('ein sehr breiter Knoten ragt nicht in die Spalte seiner Kinder', () => {
    // Regressionsfall aus 4T-1045: Ein festes Spalten-Raster ließ Knoten,
    // die breiter als das Raster sind, in die nächste Spalte laufen. Mit
    // kurzen Titeln blieb das unsichtbar, weil die Schätzbreite klein ist.
    const lang =
      'Ein ausgesprochen langer Überschriften-Titel, der die Höchstbreite sicher erreicht';
    const { root } = baum(`# ${lang}\n\n## Kind\n`);
    layoutMindmap(root);
    expect(root.x + root.breite).toBeLessThanOrEqual(root.kinder[0].x);
  });

  it('AK10: auch bei langen Titeln überlappt kein Knoten einen anderen', () => {
    const lang = 'Ein ausgesprochen langer Titel, der die Höchstbreite der Knoten sicher erreicht';
    const { root } = baum(`# ${lang}\n\n## ${lang} zwei\n\n- ${lang} drei\n- Kurz\n`);
    layoutMindmap(root);
    const knoten = alleKnoten(root);
    for (let i = 0; i < knoten.length; i++) {
      for (let j = i + 1; j < knoten.length; j++) {
        const a = knoten[i];
        const b = knoten[j];
        const getrenntX = a.x + a.breite <= b.x || b.x + b.breite <= a.x;
        const getrenntY =
          a.y + a.hoehe / 2 <= b.y - b.hoehe / 2 || b.y + b.hoehe / 2 <= a.y - a.hoehe / 2;
        expect(getrenntX || getrenntY, `Überlappung bei „${a.titel}" und „${b.titel}"`).toBe(true);
      }
    }
  });

  it('ein innerer Knoten sitzt auf der Mitte seiner Kinder', () => {
    const { root } = baum(quelle);
    layoutMindmap(root);
    const ast = root.kinder[0];
    const mitte = (ast.kinder[0].y + ast.kinder[ast.kinder.length - 1].y) / 2;
    expect(ast.y).toBeCloseTo(mitte, 6);
  });

  it('ein eingeklappter Knoten verbirgt seine Kinder in der Anordnung', () => {
    const { root } = baum(quelle);
    root.kinder[0].eingeklappt = true;
    const offen = layoutMindmap(baum(quelle).root).hoehe;
    const zu = layoutMindmap(root).hoehe;
    expect(zu).toBeLessThan(offen);
    expect(root.kinder[0].kinder[0].y).toBeUndefined();
  });

  it('eine eigene Messung übersteuert die Schätzung', () => {
    const { root } = baum('# Wurzel\n\n## Kind\n');
    layoutMindmap(root, { messen: () => ({ breite: 50, hoehe: 10 }) });
    expect(root.breite).toBe(50);
    expect(root.hoehe).toBe(10);
  });

  it('ein leerer Baum liefert eine leere Anordnung statt eines Fehlers', () => {
    expect(layoutMindmap(null)).toEqual({ root: null, breite: 0, hoehe: 0 });
  });
});

describe('Mindmap-Kern: Wurzel-Lagen (4T-1049)', () => {
  const quelle = [
    '# Wurzel',
    '',
    '## Ast eins',
    '',
    '- Blatt A',
    '- Blatt B',
    '',
    '## Ast zwei',
    '',
    '- Blatt C',
    '',
  ].join('\n');

  // Alle angeordneten Knoten; verborgene tragen keine Lage und bleiben außen.
  const angeordnet = (wurzel) => alleKnoten(wurzel).filter((k) => k.x != null);

  function pruefeUeberlappungsfrei(wurzel, lage) {
    const knoten = angeordnet(wurzel);
    for (let i = 0; i < knoten.length; i++) {
      for (let j = i + 1; j < knoten.length; j++) {
        const a = knoten[i];
        const b = knoten[j];
        const getrenntX = a.x + a.breite <= b.x || b.x + b.breite <= a.x;
        const getrenntY =
          a.y + a.hoehe / 2 <= b.y - b.hoehe / 2 || b.y + b.hoehe / 2 <= a.y - a.hoehe / 2;
        expect(
          getrenntX || getrenntY,
          `Lage ${lage}: Überlappung zwischen „${a.titel}" und „${b.titel}"`,
        ).toBe(true);
      }
    }
  }

  it('AK1: jede der fünf Lagen zeichnet den Baum in ihre Richtung', () => {
    const lage = (wert) => {
      const { root } = baum(quelle);
      layoutMindmap(root, { layout: wert });
      return root;
    };

    const links = lage('links');
    expect(links.kinder.every((k) => k.x >= links.x + links.breite)).toBe(true);

    const rechts = lage('rechts');
    expect(rechts.kinder.every((k) => k.x + k.breite <= rechts.x)).toBe(true);

    const oben = lage('oben');
    expect(oben.kinder.every((k) => k.y > oben.y)).toBe(true);

    const unten = lage('unten');
    expect(unten.kinder.every((k) => k.y < unten.y)).toBe(true);

    // Mitte: ein Ast rechts der Wurzel, der andere links davon.
    const mitte = lage('mitte');
    const rechtsVon = mitte.kinder.filter((k) => k.x >= mitte.x + mitte.breite);
    const linksVon = mitte.kinder.filter((k) => k.x + k.breite <= mitte.x);
    expect(rechtsVon).toHaveLength(1);
    expect(linksVon).toHaveLength(1);
  });

  it('AK1: die Ansicht kennt jede Lage, die der Einstellungs-Bereich anbietet', () => {
    // Wächter gegen ein Auseinanderlaufen von Auswahl-Liste und Anordnung:
    // Jede angebotene Lage muss ein eigenes Bild ergeben.
    const bilder = MINDMAP_LAYOUTS.map((wert) => {
      const { root } = baum(quelle);
      layoutMindmap(root, { layout: wert });
      return alleKnoten(root)
        .map((k) => `${k.x},${k.y}`)
        .join('|');
    });
    expect(new Set(bilder).size).toBe(MINDMAP_LAYOUTS.length);
  });

  it('AK3: in keiner Lage überlappen zwei Knoten einander', () => {
    for (const wert of MINDMAP_LAYOUTS) {
      const { root } = baum(quelle);
      layoutMindmap(root, { layout: wert });
      pruefeUeberlappungsfrei(root, wert);
    }
  });

  it('AK3: auch bei sehr ungleichen Titel-Breiten überlappt nichts', () => {
    // Der Fall, der die Zusicherung «Knoten liegt in seinem Intervall»
    // erzwungen hat: Bei senkrechtem Wuchs belegt ein Knoten quer zur
    // Wuchsrichtung seine Breite, und die ist zwischen Geschwistern sehr
    // verschieden. Ohne Mindestmaß ragte ein breiter innerer Knoten in den
    // Nachbar-Teilbaum.
    const lang = 'Ein ausgesprochen langer Überschriften-Titel für die Gegenprobe der Anordnung';
    const quelleUngleich = [`# ${lang}`, '', `## ${lang} zwei`, '', '- Kurz', '', '## Ok', ''].join(
      '\n',
    );
    for (const wert of MINDMAP_LAYOUTS) {
      const { root } = baum(quelleUngleich);
      layoutMindmap(root, { layout: wert });
      pruefeUeberlappungsfrei(root, wert);
    }
  });

  it('AK2: zweimaliger Lauf über denselben Eingang ergibt dieselbe Verteilung', () => {
    for (const wert of MINDMAP_LAYOUTS) {
      const eins = baum(quelle).root;
      const zwei = baum(quelle).root;
      layoutMindmap(eins, { layout: wert });
      layoutMindmap(zwei, { layout: wert });
      const lage = (w) => alleKnoten(w).map((k) => `${k.titel}@${k.x},${k.y}`);
      expect(lage(eins), `Lage ${wert}`).toEqual(lage(zwei));
    }
  });

  it('AK2: die Verteilungs-Regel teilt nach Blatt-Zahl und in Dokument-Reihenfolge', () => {
    const blatt = (titel) => ({ titel, kinder: [] });
    const ast = (titel, zahl) => ({
      titel,
      kinder: Array.from({ length: zahl }, (_, i) => blatt(`${titel}-${i}`)),
    });
    // Gewichte 1, 4, 1: Der Schnitt nach dem ersten Ast ergibt 1 zu 5, der
    // nach dem zweiten 5 zu 1, beide weichen um 4 ab. Bei diesem Gleichstand
    // gewinnt der spätere Schnitt, die vordere Seite bekommt also mehr.
    const kinder = [ast('A', 1), ast('B', 4), ast('C', 1)];
    const { vorne, hinten } = teileWurzelKinder(kinder);
    expect(vorne.map((k) => k.titel)).toEqual(['A', 'B']);
    expect(hinten.map((k) => k.titel)).toEqual(['C']);

    // Gleich schwere Äste werden hälftig geteilt, ohne die Reihenfolge zu
    // brechen.
    const vier = [ast('A', 1), ast('B', 1), ast('C', 1), ast('D', 1)];
    const geteilt = teileWurzelKinder(vier);
    expect(geteilt.vorne.map((k) => k.titel)).toEqual(['A', 'B']);
    expect(geteilt.hinten.map((k) => k.titel)).toEqual(['C', 'D']);
  });

  it('AK8: ein einziges Wurzel-Kind steht in jeder Lage im Bild, auch mittig', () => {
    for (const wert of MINDMAP_LAYOUTS) {
      const { root } = baum('# Wurzel\n\n## Einziger Ast\n');
      const { breite, hoehe } = layoutMindmap(root, { layout: wert });
      const kind = root.kinder[0];
      expect(kind.x, `Lage ${wert}`).not.toBeUndefined();
      expect(kind.y, `Lage ${wert}`).not.toBeUndefined();
      expect(breite, `Lage ${wert}`).toBeGreaterThan(0);
      expect(hoehe, `Lage ${wert}`).toBeGreaterThan(0);
      // Die vordere Seite ist nie leer: Das einzige Kind steht rechts.
      if (wert === 'mitte') expect(kind.x).toBeGreaterThanOrEqual(root.x + root.breite);
    }
  });

  it('AK7: ein unbekannter Wert fällt still auf die Ausgangs-Lage zurück', () => {
    const unbekannt = baum(quelle).root;
    const links = baum(quelle).root;
    layoutMindmap(unbekannt, { layout: 'spirale' });
    layoutMindmap(links, { layout: 'links' });
    const lage = (w) => alleKnoten(w).map((k) => `${k.x},${k.y}`);
    expect(lage(unbekannt)).toEqual(lage(links));
  });

  it('AK9: ein eingeklappter Knoten bleibt in jeder Lage eingeklappt', () => {
    for (const wert of MINDMAP_LAYOUTS) {
      const { root } = baum(quelle);
      root.kinder[0].eingeklappt = true;
      layoutMindmap(root, { layout: wert });
      expect(root.kinder[0].kinder[0].x, `Lage ${wert}`).toBeUndefined();
      pruefeUeberlappungsfrei(root, wert);
    }
  });

  it('jeder Knoten trägt seine Wuchsrichtung, die Wurzel der mittigen Lage «mitte»', () => {
    // Die Richtung ist der einzige Weg, auf dem die Ansicht von der Lage
    // erfährt; sie trägt Text-Ausrichtung, Anfasser und Kanten-Ansatz.
    const erwartet = { links: 'rechts', rechts: 'links', oben: 'unten', unten: 'oben' };
    for (const [wert, richtung] of Object.entries(erwartet)) {
      const { root } = baum(quelle);
      layoutMindmap(root, { layout: wert });
      expect(
        angeordnet(root).every((k) => k.richtung === richtung),
        `Lage ${wert}`,
      ).toBe(true);
    }
    const { root } = baum(quelle);
    layoutMindmap(root, { layout: 'mitte' });
    expect(root.richtung).toBe('mitte');
    expect(new Set(root.kinder.map((k) => k.richtung))).toEqual(new Set(['rechts', 'links']));
  });

  it('die gelieferten Maße umfassen das ganze Bild', () => {
    for (const wert of MINDMAP_LAYOUTS) {
      const { root } = baum(quelle);
      const mass = layoutMindmap(root, { layout: wert });
      const knoten = angeordnet(root);
      const links = Math.min(...knoten.map((k) => k.x));
      const rechts = Math.max(...knoten.map((k) => k.x + k.breite));
      const oben = Math.min(...knoten.map((k) => k.y - k.hoehe / 2));
      const unten = Math.max(...knoten.map((k) => k.y + k.hoehe / 2));
      expect(mass.breite, `Lage ${wert}`).toBeGreaterThanOrEqual(rechts - links);
      expect(mass.hoehe, `Lage ${wert}`).toBeGreaterThanOrEqual(unten - oben);
    }
  });
});

describe('Mindmap-Kern: Kopfbereich und Zeilenversatz (4T-1045)', () => {
  // Geprüft wird die Kern-Funktion selbst, die auch die Preload-Brücke ruft:
  // Kopfbereich abtrennen, Zeilen zählen, als Versatz verrechnen. Die Brücke
  // reicht nur noch durch und ist damit ohne eigene Logik; ihr Nachweis am
  // laufenden Programm liegt im E2E-Anteil des Epics.
  const mitKopf = (text) => mindmapAusDokument(text, md, { wurzelTitel: 'Datei' });

  it('die Quellzeile zeigt auf die echte Datei, nicht auf den Rumpf', () => {
    const quelle = ['---', 'titel: Etwas', '---', '# Überschrift', ''].join('\n');
    const { root } = mitKopf(quelle);
    expect(root.titel).toBe('Überschrift');
    // Zeilen 0 bis 2 sind der Kopfbereich, die Überschrift steht in Zeile 3.
    expect(root.zeile).toBe(3);
    expect(quelle.split('\n')[root.zeile]).toBe('# Überschrift');
  });

  it('ohne Kopfbereich bleibt die Zeilennummer unverschoben', () => {
    const quelle = '# Überschrift\n';
    const { root } = mitKopf(quelle);
    expect(root.zeile).toBe(0);
    expect(quelle.split('\n')[root.zeile]).toBe('# Überschrift');
  });

  it('der Kopfbereich selbst wird kein Knoten und keine Notiz', () => {
    const quelle = ['---', 'titel: Etwas', 'tags: [a, b]', '---', '# Überschrift', ''].join('\n');
    const { root } = mitKopf(quelle);
    expect(root.kinder).toEqual([]);
    expect(root.notizen).toEqual([]);
  });
});

describe('Mindmap-Kern: Token-Eingang (4T-1045)', () => {
  it('buildMindmapTree verträgt einen fehlenden Token-Strom', () => {
    const { root, knotenZahl } = buildMindmapTree(null, { wurzelTitel: 'Leer' });
    expect(root.titel).toBe('Leer');
    expect(knotenZahl).toBe(1);
  });

  it('ohne Markdown-Instanz bleibt der Klartext, ohne dass etwas bricht', () => {
    const tokens = md.parse('# Titel\n\n## Kind\n', {});
    const { root } = buildMindmapTree(tokens, { wurzelTitel: 'Datei' });
    expect(root.titel).toBe('Titel');
    expect(root.kinder[0].titel).toBe('Kind');
    expect(root.kinder[0].titelHtml).toBeNull();
  });
});
