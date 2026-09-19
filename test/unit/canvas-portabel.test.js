// 4T-001777 (Epic 3E-000291): Unit-Tests der Entsprechung einer Canvas-Fläche
// im portablen Export (Story 4S-000951, AK1 bis AK16).
//
// **Zwei Ebenen in einer Datei**, weil der Gegenstand einer ist: das reine
// Modul `canvas-portabel.js` (Ausgabe-Form, Reihenfolge, Gruppen, Formen,
// Verbindungen, Befunde) und die **Weiche** im prozessneutralen Konverter
// (mehrere Flächen, Aus-Zustand der Erweiterung, unveränderte Eingabe). Der
// Renderer kommt nicht vor — er ist an dieser Strecke nicht beteiligt, und
// genau das ist der Grund, aus dem die Ersetzung im prozessneutralen Konverter
// hängt.
//
// **Die erwarteten Beschriftungen kommen aus den Sprachdateien und nicht aus
// der Tastatur** (Muster `export-portable.test.js`): Der Wortlaut darf sich
// ändern, die Aussage nicht.
import { describe, it, expect, afterEach } from 'vitest';
import { canvasPortabel } from '../../src/shared/canvas/canvas-portabel.js';
import {
  convertMarkdownPortable,
  configureExtensions,
} from '../../src/shared/markdown/markdown.js';
import DE from '../../src/i18n/de.json';
import EN from '../../src/i18n/en.json';
import FR from '../../src/i18n/fr.json';
import ES from '../../src/i18n/es.json';
import IT from '../../src/i18n/it.json';

// Die Beispiel-Fläche des Management-Summarys: eine Gruppe, zwei Karten, zwei
// Formen (eine beschriftet, eine nicht) und eine gerichtete Verbindung.
const BEISPIEL = [
  '!gruppe g1 x=-340 y=-180 b=660 h=280 farbe=blau',
  'Vorbereitung',
  '!karte k1 x=-300 y=-120 b=220 h=120',
  '## Zielbild',
  'Was am Ende dastehen soll',
  '!karte k2 x=60 y=-120 b=220 h=120',
  '## Offene Fragen',
  'Welche Punkte noch offen sind',
  '!form f1 x=-300 y=160 b=200 h=80 art=raute rand=rot',
  'Entscheidung?',
  '!form f2 x=60 y=160 b=120 h=60 art=oval',
  '!linie e1 k1 -> k2 von=rechts nach=links',
  'folgt aus',
].join('\n');

function fence(rumpf) {
  return '```perspective-canvas\n' + rumpf + '\n```\n';
}

describe('Canvas im portablen Export: Kopf und Karten (AK1, AK2, AK4)', () => {
  it('beginnt mit der fetten Kopf-Zeile aus Titel und Umfang', () => {
    const out = canvasPortabel(BEISPIEL, DE);
    expect(out.split('\n')[0]).toBe('**Zielbild · 2 Karten, 1 Verbindung, 2 Formen, 1 Gruppe**');
  });

  it('gibt den Karten-Text unverändert aus und erzeugt keine Überschrift', () => {
    const out = canvasPortabel(BEISPIEL, DE);
    expect(out).toContain('## Zielbild\nWas am Ende dastehen soll');
    expect(out).toContain('## Offene Fragen\nWelche Punkte noch offen sind');
    // Gegenprobe zur verworfenen Alternative aus F3: keine erzeugte
    // Überschrift über der Karte, also auch keine Doppelung des Kurznamens.
    expect(out).not.toContain('### Zielbild');
    expect(out.match(/Zielbild/g)).toHaveLength(3); // Kopf, Karte, Verbindung
  });

  it('verschiebt keine Überschriften-Ebene', () => {
    const out = canvasPortabel(['!karte k1 x=0 y=0 b=200 h=100', '# Ganz oben'].join('\n'), DE);
    expect(out).toContain('# Ganz oben');
    expect(out).not.toContain('## Ganz oben');
  });

  it('gibt eine Karte ohne Text und ohne Ziel mit dem Ersatzwort der Liste aus', () => {
    const out = canvasPortabel('!karte k1 x=0 y=0 b=200 h=100', DE);
    expect(out).toContain(DE['canvas.liste.ohneText']);
  });
});

describe('Canvas im portablen Export: Verweis- und Bild-Karten (AK5, AK6)', () => {
  const RUMPF = [
    '!karte k1 x=0 y=0 b=200 h=100 doc="Konzepte/Import.md#Zielbild"',
    'Der Import',
    '!karte k2 x=300 y=0 b=200 h=100 bild="Anlagen/Skizze.png"',
  ].join('\n');

  it('schreibt den Verweis als Wikilink und das Bild als Einbettung', () => {
    const out = canvasPortabel(RUMPF, DE);
    expect(out).toContain('[[Konzepte/Import.md#Zielbild]]');
    expect(out).toContain('![[Anlagen/Skizze.png]]');
  });

  it('stellt den Verweis unter den eigenen Text der Karte', () => {
    const out = canvasPortabel(RUMPF, DE);
    expect(out).toContain('Der Import\n\n[[Konzepte/Import.md#Zielbild]]');
  });
});

describe('Canvas im portablen Export: Gruppen und Formen (AK8)', () => {
  it('klammert die Elemente, die in der Gruppe liegen, und lässt die übrigen frei', () => {
    const rumpf = [
      '!karte k0 x=2000 y=2000 b=200 h=100',
      'Weit draußen',
      '!gruppe g1 x=-340 y=-180 b=660 h=280 farbe=blau',
      'Vorbereitung',
      '!karte k1 x=-300 y=-120 b=220 h=120',
      'In der Gruppe',
    ].join('\n');
    const out = canvasPortabel(rumpf, DE);
    // Fence-Reihenfolge: die freie Karte zuerst, dann die Gruppe mit ihrem
    // Mitglied darunter.
    expect(out).toContain('Weit draußen\n\n**Vorbereitung**\n\nIn der Gruppe');
  });

  it('gibt ein Mitglied genau einmal aus, auch wenn es später wieder drankäme', () => {
    const rumpf = [
      // Die erste Karte gibt der Fläche ihren Titel; gezählt wird die zweite,
      // die sonst in der Kopf-Zeile ein zweites Mal erschiene.
      '!karte k0 x=2000 y=2000 b=200 h=100',
      'Titelgeber',
      '!gruppe g1 x=-340 y=-180 b=660 h=280 farbe=blau',
      'Vorbereitung',
      '!karte k1 x=-300 y=-120 b=220 h=120',
      'Einmal',
    ].join('\n');
    expect(canvasPortabel(rumpf, DE).match(/Einmal/g)).toHaveLength(1);
  });

  it('gibt eine verschachtelte Gruppe mit ihren eigenen Mitgliedern aus', () => {
    const rumpf = [
      '!gruppe g1 x=-400 y=-400 b=800 h=800 farbe=blau',
      'Außen',
      '!gruppe g2 x=-200 y=-200 b=400 h=400 farbe=rot',
      'Innen',
      '!karte k1 x=-100 y=-100 b=200 h=100',
      'Ganz innen',
    ].join('\n');
    const out = canvasPortabel(rumpf, DE);
    expect(out).toContain('**Außen**\n\n**Innen**\n\nGanz innen');
  });

  it('nennt eine Gruppe ohne Beschriftung nach ihrer Art', () => {
    const out = canvasPortabel('!gruppe g1 x=0 y=0 b=400 h=400', DE);
    expect(out).toContain('**' + DE['canvas.liste.gruppe'] + '**');
  });

  it('macht aus einer beschrifteten Form einen Aufzählungs-Punkt mit ihrer Art', () => {
    expect(canvasPortabel(BEISPIEL, DE)).toContain('- Raute: Entscheidung?');
  });

  it('lässt eine Form ohne Beschriftung entfallen', () => {
    const out = canvasPortabel(BEISPIEL, DE);
    expect(out).not.toContain('- ' + DE['canvas.formArtOval']);
  });
});

describe('Canvas im portablen Export: Verbindungen (AK7)', () => {
  const RUMPF = [
    '!karte k1 x=0 y=0 b=200 h=100',
    '# Zielbild',
    '!karte k2 x=300 y=0 b=200 h=100',
    '# Offene Fragen',
    '!karte k3 x=600 y=0 b=200 h=100',
    '# Entwurf',
    '!linie e1 k1 -> k2',
    'folgt aus',
    '!linie e2 k2 <-> k3',
    'hängt zusammen',
    '!linie e3 k1 -- k3',
  ].join('\n');

  it('führt jede Verbindung genau einmal, mit Kurznamen, Richtung und Beschriftung', () => {
    const out = canvasPortabel(RUMPF, DE);
    expect(out).toContain('**' + DE['canvas.portabel.verbindungen'] + '**');
    expect(out).toContain('- Zielbild → Offene Fragen: folgt aus');
    expect(out).toContain('- Offene Fragen ↔ Entwurf: hängt zusammen');
    expect(out).toContain('- Zielbild — Entwurf');
    expect(out.match(/^- /gm)).toHaveLength(3);
  });

  it('steht am Ende der Fläche und nicht unter den Karten', () => {
    const out = canvasPortabel(RUMPF, DE);
    expect(out.indexOf('Entwurf\n')).toBeLessThan(out.indexOf('**Verbindungen**'));
  });

  it('lässt Zeile und Liste weg, wenn es keine Verbindung gibt', () => {
    const out = canvasPortabel('!karte k1 x=0 y=0 b=200 h=100\nAllein', DE);
    // Die Kopf-Zeile nennt die Zahl null; was fehlen muss, ist die
    // Überschrift der Liste und jeder Listen-Punkt.
    expect(out).not.toContain('**' + DE['canvas.portabel.verbindungen'] + '**');
    expect(out).not.toContain('\n- ');
  });

  it('benennt eine Karte ohne Beschriftung über ihre Kennung', () => {
    const rumpf = [
      '!karte k1 x=0 y=0 b=200 h=100',
      '!karte k2 x=300 y=0 b=200 h=100',
      '!linie e1 k1 -> k2',
    ].join('\n');
    expect(canvasPortabel(rumpf, DE)).toContain('- k1 → k2');
  });
});

describe('Canvas im portablen Export: defekte Elemente (AK11)', () => {
  it('gibt das Lesbare aus und nennt den Befund unter dem Element', () => {
    const rumpf = ['!karte k1 x=oben y=0 b=200 h=100', 'Trotzdem lesbar'].join('\n');
    const out = canvasPortabel(rumpf, DE);
    expect(out).toContain('Trotzdem lesbar');
    expect(out).toContain('ungueltigeZahl');
    expect(out).toContain('Hinweis');
  });

  it('führt einen unbekannten Marker mit seinem Text mit (G1)', () => {
    const rumpf = ['!wolke w1 x=0 y=0', 'Aus einer neueren Fassung'].join('\n');
    const out = canvasPortabel(rumpf, DE);
    expect(out).toContain('Aus einer neueren Fassung');
    expect(out).toContain('unbekannterMarker');
  });

  it('sammelt einen Befund ohne ausgegebenes Element am Ende der Fläche', () => {
    // Die Verbindung zeigt ins Leere; ihr Befund hat kein eigenes Element in
    // der Ausgabe und steht deshalb im Hinweis der Fläche.
    const rumpf = ['!karte k1 x=0 y=0 b=200 h=100', 'Da', '!linie e1 k1 -> k9'].join('\n');
    const out = canvasPortabel(rumpf, DE);
    expect(out).toContain('unbekanntesEnde');
    expect(out.trimEnd().endsWith(')')).toBe(true);
  });
});

describe('Canvas im portablen Export: kein Deckel und leere Fläche (AK10, AK16)', () => {
  it('gibt alle Karten vollständig aus, auch vierzig', () => {
    const zeilen = [];
    for (let i = 1; i <= 40; i++) {
      zeilen.push(`!karte k${i} x=${i * 300} y=0 b=200 h=100`, `Karte Nummer ${i}`);
    }
    const out = canvasPortabel(zeilen.join('\n'), DE);
    for (let i = 1; i <= 40; i++) expect(out).toContain(`Karte Nummer ${i}`);
  });

  it('kürzt keinen Karten-Text', () => {
    const lang = 'A'.repeat(500);
    const out = canvasPortabel(`!karte k1 x=0 y=0 b=200 h=100\n${lang}`, DE);
    expect(out).toContain(lang);
  });

  it('liefert für eine leere Fläche Kopf und Umfang «keine Elemente»', () => {
    const out = canvasPortabel('', DE);
    expect(out).toBe(`**${DE['canvas.block.art']} · ${DE['canvas.portabel.leer']}**`);
  });
});

describe('Canvas im portablen Export: fünf Sprachfassungen (AK14)', () => {
  for (const [code, dict] of Object.entries({ de: DE, en: EN, fr: FR, es: ES, it: IT })) {
    it(`${code} setzt eigene Beschriftungen und lässt keinen Schlüssel stehen`, () => {
      const out = canvasPortabel(BEISPIEL, dict);
      expect(out).toContain(dict['canvas.portabel.verbindungen']);
      expect(out).toContain(dict['canvas.formArtRaute']);
      expect(out).not.toContain('canvas.portabel.');
      expect(out).not.toContain('canvas.formArt');
    });
  }
});

describe('Canvas im portablen Export: die Weiche im Konverter (AK1, AK9, AK12, AK15)', () => {
  afterEach(() => {
    configureExtensions([]);
  });

  it('ersetzt die Fence und lässt keinen Koordinaten-Text zurück', () => {
    const out = convertMarkdownPortable(`# Kopf\n\n${fence(BEISPIEL)}`, false, 'de');
    expect(out).toContain('**Zielbild · 2 Karten, 1 Verbindung, 2 Formen, 1 Gruppe**');
    expect(out).not.toContain('!karte k1');
    expect(out).not.toContain('perspective-canvas');
  });

  it('trennt die Entsprechung vom folgenden Absatz', () => {
    const out = convertMarkdownPortable(`${fence(BEISPIEL)}\nDanach.\n`, false, 'de');
    expect(out).toContain('folgt aus\n\nDanach.');
  });

  it('gibt jeder Fläche eines Dokuments ihren eigenen Kopf, in Dokument-Reihenfolge', () => {
    const doc = [
      fence('!karte k1 x=0 y=0 b=200 h=100\n# Erste'),
      '',
      'Dazwischen.',
      '',
      fence('!karte k2 x=0 y=0 b=200 h=100\n# Zweite'),
    ].join('\n');
    const out = convertMarkdownPortable(doc, false, 'de');
    expect(out.indexOf('**Erste · 1 Karte, 0 Verbindungen**')).toBeGreaterThan(-1);
    expect(out.indexOf('**Erste · 1 Karte, 0 Verbindungen**')).toBeLessThan(
      out.indexOf('**Zweite · 1 Karte, 0 Verbindungen**'),
    );
  });

  it('lässt die Fence als Code-Block stehen, wenn die Erweiterung aus ist', () => {
    configureExtensions(['canvas']);
    const out = convertMarkdownPortable(fence(BEISPIEL), false, 'de');
    expect(out).toContain('```perspective-canvas');
    expect(out).toContain('!karte k1 x=-300 y=-120 b=220 h=120');
    expect(out).not.toContain(DE['canvas.portabel.verbindungen']);
  });

  it('lässt den Eingabe-Text unverändert', () => {
    const quelle = `# Kopf\n\n${fence(BEISPIEL)}`;
    const kopie = String(quelle);
    convertMarkdownPortable(quelle, true, 'de');
    expect(quelle).toBe(kopie);
  });

  it('nimmt den privaten %%-Kommentar aus einem Karten-Text mit heraus', () => {
    // Die Ersetzung läuft VOR dem Kommentar-Strip; aus der Fence gehoben, ist
    // der Karten-Text gewöhnlicher Dokument-Text und unterliegt derselben
    // Regel wie er.
    const rumpf = ['!karte k1 x=0 y=0 b=200 h=100', 'Sichtbar %%geheim%% Ende'].join('\n');
    const out = convertMarkdownPortable(fence(rumpf), false, 'de');
    expect(out).toContain('Sichtbar');
    expect(out).not.toContain('geheim');
  });
});
