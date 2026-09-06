// 4T-001471 (Epic 3E-000178): Der electron-freie Kern der Mermaid-Einbrennung —
// welche Stelle im Text ist ein Diagramm, was tritt an ihre Stelle, und wann
// bleibt der Quelltext stehen.
//
// Das Zeichnen selbst braucht Mermaid und einen messenden DOM-Knoten; es steht
// im E2E-Fall. Hier stehen die Entscheidungen, in denen ein Irrtum still Text
// des Anwenders verschlucken oder ein Diagramm verlieren wuerde.
import { describe, it, expect } from 'vitest';

import {
  collectMermaidSources,
  hasMermaidFence,
  istFehlerSvg,
  mermaidSvgBlock,
  replaceMermaidFences,
} from '../../src/shared/mermaid-fence.js';

const DIAGRAMM = ['```mermaid', 'graph TD;', '  A-->B;', '```'].join('\n');

describe('hasMermaidFence', () => {
  it('erkennt einen Fence', () => {
    expect(hasMermaidFence(`Text\n\n${DIAGRAMM}\n\nMehr Text\n`)).toBe(true);
  });

  it('meldet keinen Fence, wo keiner ist (AK10: Kurzschluss ohne Diagramm)', () => {
    expect(hasMermaidFence('Nur Text mit dem Wort mermaid darin.\n')).toBe(false);
    expect(hasMermaidFence('```js\nconst a = 1;\n```\n')).toBe(false);
    expect(hasMermaidFence('')).toBe(false);
    expect(hasMermaidFence(null)).toBe(false);
  });

  it('laesst sich durch wiederholte Aufrufe nicht aus dem Tritt bringen', () => {
    // Die Regex traegt das globale Flag; ohne Ruecksetzen von lastIndex
    // lieferte jeder zweite Aufruf false.
    const text = `${DIAGRAMM}\n`;
    expect(hasMermaidFence(text)).toBe(true);
    expect(hasMermaidFence(text)).toBe(true);
  });
});

describe('collectMermaidSources', () => {
  it('liefert die Quelltexte in Textreihenfolge', () => {
    const text = `${DIAGRAMM}\n\nZwischentext\n\n\`\`\`mermaid\npie title X\n\`\`\`\n`;
    expect(collectMermaidSources(text)).toEqual(['graph TD;\n  A-->B;\n', 'pie title X\n']);
  });

  it('behaelt Doppelungen, weil zwei gleiche Diagramme zwei Fences sind', () => {
    expect(collectMermaidSources(`${DIAGRAMM}\n\n${DIAGRAMM}\n`)).toHaveLength(2);
  });

  it('liefert nichts ohne Diagramm', () => {
    expect(collectMermaidSources('Text\n')).toEqual([]);
  });
});

describe('replaceMermaidFences', () => {
  it('ersetzt den ganzen Fence durch den gelieferten Block (AK1)', () => {
    const text = `Davor\n\n${DIAGRAMM}\n\nDanach\n`;
    const ergebnis = replaceMermaidFences(text, () => '<svg id="x"></svg>\n');
    expect(ergebnis).toBe('Davor\n\n<svg id="x"></svg>\n\n\nDanach\n');
    expect(ergebnis).not.toContain('```mermaid');
  });

  it('laesst den Fence stehen, wenn der Bauer nichts liefert (AK4, AK7)', () => {
    const text = `${DIAGRAMM}\n`;
    expect(replaceMermaidFences(text, () => null)).toBe(text);
    expect(replaceMermaidFences(text, () => undefined)).toBe(text);
  });

  it('ersetzt jeden Fence einzeln und in seiner eigenen Sache (AK5)', () => {
    const text = '```mermaid\neins\n```\n\nText\n\n```mermaid\nzwei\n```\n';
    const ergebnis = replaceMermaidFences(text, (body) => `<b>${body.trim()}</b>\n`);
    expect(ergebnis).toContain('<b>eins</b>');
    expect(ergebnis).toContain('<b>zwei</b>');
    expect(ergebnis).toContain('Text');
  });

  it('mischt zwei Fences nicht, wenn nur einer ersetzt wird (AK4 im Verbund)', () => {
    const text = '```mermaid\ngut\n```\n\n```mermaid\nkaputt\n```\n';
    const ergebnis = replaceMermaidFences(text, (body) =>
      body.includes('gut') ? '<svg></svg>\n' : null,
    );
    expect(ergebnis).toContain('<svg></svg>');
    expect(ergebnis).toContain('```mermaid\nkaputt\n```');
  });

  it('laesst fremde Code-Bloecke unberuehrt (AK8)', () => {
    const text = '```js\nconst a = 1;\n```\n\n```perspective-query\nfrom x\n```\n';
    expect(replaceMermaidFences(text, () => 'ERSETZT')).toBe(text);
  });

  it('behandelt Sonderzeichen im Ersatz woertlich', () => {
    // Der Beleg-Fall der Fehlerklasse L7: In einem Ersetzungs-TEXT waeren die
    // Dollar-Folgen Sonderzeichen fuer «alles vor der Fundstelle» und «die
    // Fundstelle selbst». Der Rueckgabewert eines Callbacks ist es nicht —
    // genau deshalb laeuft die Ersetzung ueber eine Funktion.
    const text = `Davor\n\n${DIAGRAMM}\n`;
    const ergebnis = replaceMermaidFences(text, () => '<svg>$`$&$</svg>\n');
    expect(ergebnis).toContain('<svg>$`$&$</svg>');
    expect(ergebnis).not.toContain('```mermaid');
    // Nichts ist verdoppelt worden.
    expect(ergebnis.split('Davor')).toHaveLength(2);
  });

  it('erkennt einen eingerueckten Fence und laengere Zaeune', () => {
    const text = '  ````mermaid\ngraph TD;\n````\n';
    // Der Ausdruck endet VOR dem abschliessenden Zeilenumbruch; der bleibt
    // stehen, wie beim Vorbild in journal-timeline-core.js.
    expect(replaceMermaidFences(text, () => 'X\n')).toBe('X\n\n');
  });
});

describe('mermaidSvgBlock', () => {
  // Entscheidung D (2026-09-05): Markdown-Bild mit Data-Adresse statt inline
  // SVG. Das inline SVG verschwand beim erneuten Oeffnen der exportierten
  // Datei, weil deren Portable-Marker den Whitelist-Sanitizer scharf schaltet
  // und dessen enge Liste kein <svg> kennt.
  // Ohne regulaeren Ausdruck: Der Alt-Text steht zwischen den ersten beiden
  // Klammern, die Data-Adresse dahinter.
  // Ohne regulaeren Ausdruck: Alt-Text und Data-Adresse stehen in Attributen.
  const auslesen = (block) => {
    const altKopf = String.fromCharCode(60) + 'img alt="';
    const quelleKopf = '" src="data:image/svg+xml;base64,';
    const i = block.indexOf(quelleKopf);
    if (!block.startsWith(altKopf) || i < 0) {
      throw new Error('Kein Bild-Element mit Data-Adresse: ' + block);
    }
    const alt = block.slice(altKopf.length, i);
    const b64 = block.slice(
      i + quelleKopf.length,
      block.indexOf(String.fromCharCode(34), i + quelleKopf.length),
    );
    return { alt, svg: Buffer.from(b64, 'base64').toString('utf8') };
  };

  it('liefert ein Bild-Element mit Data-Adresse, kein inline SVG', () => {
    const block = mermaidSvgBlock('<svg></svg>', 'Diagramm');
    expect(block.startsWith('<img ')).toBe(true);
    expect(block).not.toContain('<div');
    expect(block).toContain('data:image/svg+xml;base64,');
    expect(block).not.toContain('<svg');
  });

  it('traegt das SVG verlustfrei in der Data-Adresse', () => {
    const svg = '<svg aria-roledescription="flowchart-v2"><g/></svg>';
    expect(auslesen(mermaidSvgBlock(svg, 'Diagramm')).svg).toBe(svg);
  });

  it('uebersteht Umlaute in den Beschriftungen', () => {
    const svg = '<svg><text>Groesse, Uebergang, Massnahme: äöüß</text></svg>';
    expect(auslesen(mermaidSvgBlock(svg, 'Diagramm')).svg).toBe(svg);
  });

  it('nimmt den gelieferten Alt-Text und faellt sonst zurueck', () => {
    expect(auslesen(mermaidSvgBlock('<svg/>', 'Diagramma')).alt).toBe('Diagramma');
    expect(auslesen(mermaidSvgBlock('<svg/>', '')).alt).toBe('Diagramm');
    expect(auslesen(mermaidSvgBlock('<svg/>', null)).alt).toBe('Diagramm');
  });

  it('entfernt Anfuehrungszeichen aus dem Alt-Text, die aus dem Attribut ausbraechen', () => {
    expect(auslesen(mermaidSvgBlock('<svg/>', 'A' + String.fromCharCode(34) + 'B')).alt).toBe('AB');
  });

  it('liefert nichts bei leerem Bild — der Fence bleibt dann stehen', () => {
    expect(mermaidSvgBlock('')).toBeNull();
    expect(mermaidSvgBlock('   ')).toBeNull();
    expect(mermaidSvgBlock(null)).toBeNull();
  });
});

describe('istFehlerSvg', () => {
  it('erkennt das Fehler-Bild von Mermaid (AK4)', () => {
    expect(istFehlerSvg('<svg aria-roledescription="error"><g/></svg>')).toBe(true);
  });

  it('haelt ein leeres Ergebnis fuer einen Fehler', () => {
    expect(istFehlerSvg('')).toBe(true);
    expect(istFehlerSvg(null)).toBe(true);
  });

  it('laesst ein gutes Bild durch', () => {
    expect(istFehlerSvg('<svg aria-roledescription="flowchart-v2"><g/></svg>')).toBe(false);
  });
});
