// 4T-001291 (Epic 3E-000224): Unit-Tests für das Zerlegen eines großen Dokuments
// beim Speichern (src/shared/document-split.js). Abgedeckt sind AK1 (Zerlegung
// mit Namensform und Zuordnungs-Zeile), AK2 (Schnitt nur an einer Überschrift
// der obersten zwei Ebenen, kein Konstrukt über eine Grenze), AK3 (ohne
// Schnittpunkt wird nicht geteilt) und AK5 (Wachsen durch Anfügen, ohne
// Umschichtung und ohne Wiederverwendung von Nummern).
import { describe, it, expect } from 'vitest';
import {
  DOKUMENT_SCHWELLE,
  ABLAGE_SCHWELLE,
  byteLength,
  ueberSchwelle,
  findSplitPoints,
  fuehreGrenzenNach,
  planeZerlegung,
} from '../../src/shared/document-split.js';
import { assembleParts } from '../../src/shared/document-assembly.js';
import {
  PART_SEP,
  PART_INFIX,
  readPartLine,
  writePartLine,
} from '../../src/shared/document-parts.js';

// Kleine Schwelle für die Tests: Die echte liegt bei 1 MB, und ein Dokument
// dieser Größe je Prüffall aufzubauen kostete Laufzeit ohne Erkenntnis. Die
// Mechanik ist von der Zahl unabhängig; dass die echte Schwelle greift, prüft
// der Fall ganz unten eigens.
const KLEIN = 100;

const teilName = (n) => `Notizen${PART_SEP}${PART_INFIX}${String(n).padStart(5, '0')}`;

// Baut einen Abschnitt aus Überschrift und Fülltext gegebener Länge.
function abschnitt(titel, fuellung) {
  return `# ${titel}\n${'x'.repeat(fuellung)}\n`;
}

describe('document-split.js — Byte-Maß (O2)', () => {
  it('zählt UTF-8-Byte, nicht Zeichen', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('äöü')).toBe(6);
    expect(byteLength('€')).toBe(3);
    expect(byteLength('😀')).toBe(4);
    expect(byteLength('')).toBe(0);
  });

  it('erkennt die Schwelle auch dort, wo der Schnellweg nicht greift', () => {
    // 40 Umlaute sind 80 Byte, aber nur 40 Code-Units: Der Schnellweg
    // (Länge mal drei) müsste hier tatsächlich zählen.
    expect(ueberSchwelle('ä'.repeat(40), 79)).toBe(true);
    expect(ueberSchwelle('ä'.repeat(40), 80)).toBe(false);
  });

  it('hält die entschiedenen Schwellen fest (O1)', () => {
    expect(DOKUMENT_SCHWELLE).toBe(1048576);
    expect(ABLAGE_SCHWELLE).toBe(734003);
  });
});

describe('document-split.js — Schnittpunkte (AK2, O3, O4)', () => {
  it('nimmt Überschriften der obersten zwei Ebenen', () => {
    const text = 'Vorspann\n# Eins\nText\n## Zwei\nText\n';
    const punkte = findSplitPoints(text).map((p) => text.slice(p.offset).split('\n')[0]);
    expect(punkte).toEqual(['# Eins', '## Zwei']);
  });

  it('nimmt tiefere Ebenen nicht', () => {
    const text = 'Vorspann\n### Drei\n#### Vier\n##### Fünf\n';
    expect(findSplitPoints(text)).toEqual([]);
  });

  it('verlangt Leerraum oder Zeilenende hinter den Rauten', () => {
    const text = 'Vorspann\n#kein-Titel\n#hashtag\n';
    expect(findSplitPoints(text)).toEqual([]);
  });

  it('nimmt eine leere Überschrift', () => {
    const text = 'Vorspann\n#\n';
    expect(findSplitPoints(text)).toHaveLength(1);
  });

  it('schneidet nicht in einem Code-Zaun (O4)', () => {
    const text = ['Vorspann', '```md', '# Beispiel', '## Auch das', '```', '# Echt'].join('\n');
    const punkte = findSplitPoints(text).map((p) => text.slice(p.offset).split('\n')[0]);
    expect(punkte).toEqual(['# Echt']);
  });

  it('schneidet nicht in einem Tilden-Zaun', () => {
    const text = ['Vorspann', '~~~', '# Beispiel', '~~~', '# Echt'].join('\n');
    expect(findSplitPoints(text)).toHaveLength(1);
  });

  it('schneidet nicht an einer eingerückten Überschrift (Liste, Callout)', () => {
    const text = ['Vorspann', '  # In der Liste', '> # Im Callout', '\t# Eingerückt'].join('\n');
    expect(findSplitPoints(text)).toEqual([]);
  });

  it('schneidet nicht im Frontmatter und nicht an seinem Ende', () => {
    const text = '---\ntitle: Test\n---\n# Erste\nText\n';
    const punkte = findSplitPoints(text);
    expect(punkte).toHaveLength(0);
  });

  it('schneidet an einer Überschrift nach dem Frontmatter, aber nicht an der ersten', () => {
    const text = '---\ntitle: Test\n---\n# Erste\nText\n# Zweite\n';
    const punkte = findSplitPoints(text).map((p) => text.slice(p.offset).split('\n')[0]);
    expect(punkte).toEqual(['# Zweite']);
  });
});

describe('document-split.js — Erstzerlegung (AK1, AK3)', () => {
  it('lässt ein Dokument unter der Schwelle unangetastet', () => {
    const plan = planeZerlegung({ text: '# Klein\nText\n', base: 'Notizen', schwelle: KLEIN });
    expect(plan.geteilt).toBe(false);
    expect(plan.grund).toBe('unter-schwelle');
  });

  it('teilt ein Dokument über der Schwelle und vergibt Namen und Positionen (AK1)', () => {
    const text = abschnitt('Eins', 80) + abschnitt('Zwei', 80) + abschnitt('Drei', 80);
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.geteilt).toBe(true);
    expect(plan.neuGeteilt).toBe(true);
    expect(plan.teile.map((t) => t.index)).toEqual([1, 2, 3]);
    expect(plan.teile.map((t) => t.basename)).toEqual(['Notizen', teilName(2), teilName(3)]);
    expect(plan.teile.every((t) => t.neu === t.index > 1)).toBe(true);
    for (const t of plan.teile) {
      expect(readPartLine(t.text)).toEqual({ schemaVersion: 1, index: t.index, base: 'Notizen' });
    }
  });

  it('teilt nicht, wenn es keinen Schnittpunkt gibt, und nennt den Grund (AK3)', () => {
    const text = `# Nur eine Überschrift\n${'x'.repeat(500)}\n`;
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.geteilt).toBe(false);
    expect(plan.grund).toBe('kein-schnittpunkt');
  });

  it('teilt nicht, wenn der einzige Schnittpunkt in einem Code-Zaun liegt (AK3)', () => {
    const text = `Text\n\`\`\`\n# Beispiel\n\`\`\`\n${'x'.repeat(500)}\n`;
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.geteilt).toBe(false);
  });

  it('überschreitet die Schwelle, wenn der nächste Schnittpunkt später liegt (weiche Schwelle, O4)', () => {
    const text = abschnitt('Eins', 300) + abschnitt('Zwei', 10);
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.teile).toHaveLength(2);
    expect(byteLength(plan.teile[0].text)).toBeGreaterThan(KLEIN);
  });

  it('füllt greedy bis zum letzten Schnittpunkt unter der Schwelle', () => {
    // Vier Abschnitte à 30 Byte passen zu zweien unter eine Schwelle von 100.
    const text = ['Eins', 'Zwei', 'Drei', 'Vier'].map((t) => abschnitt(t, 20)).join('');
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.teile.length).toBeLessThan(4);
    expect(plan.teile.length).toBeGreaterThan(1);
  });

  it('behält den Frontmatter der Kopf-Datei und gibt den Folgeteilen nur die Zuordnung', () => {
    const text = `---\ntitle: Mein Dokument\n---\n${abschnitt('Eins', 80)}${abschnitt('Zwei', 80)}`;
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    expect(plan.teile[0].text).toContain('title: Mein Dokument');
    expect(plan.teile[1].text).not.toContain('title:');
    expect(plan.teile[1].text.startsWith('---\n')).toBe(true);
  });
});

describe('document-split.js — Umkehr-Eigenschaft (die tragende Zusage)', () => {
  // Der Prüffall aus 4T-001290 hält fest, dass das Zusammensetzen die Rümpfe ohne
  // Trennzeichen aneinanderhängt. Hier steht das Gegenstück: Was diese Seite
  // schneidet, muss jene Seite zeichengleich zurückgeben.
  //
  // Verglichen wird gegen den Ausgangstext MIT ergänzter Zuordnungs-Zeile, nicht
  // gegen den nackten Ausgangstext: Das erste Teilen fügt der Kopf-Datei die
  // Zeile hinzu, die sie vorher nicht hatte (F2/F6 — sie ist die Wahrheit und
  // zugleich die Spur, an der der Anwender die Teilung erkennt). Der
  // Dokument-Stand nach dem Speichern ist deshalb um genau diese Zeile länger
  // als der Puffer davor, und der Schreib-Weg muss ihn dem Reiter zurückgeben,
  // sonst meldet das nächste Speichern einen Konflikt gegen sich selbst.
  const faelle = {
    'ohne Frontmatter': abschnitt('Eins', 80) + abschnitt('Zwei', 80) + abschnitt('Drei', 80),
    'mit Frontmatter': `---\ntitle: T\ntags:\n  - a\n---\n${abschnitt('A', 90)}${abschnitt('B', 90)}`,
    'mit Code-Zaun': `# A\n\`\`\`js\nconst x = 1;\n\`\`\`\n${'y'.repeat(90)}\n# B\n${'z'.repeat(90)}\n`,
    'mit Umlauten und Emoji': `# Größe 😀\n${'ä'.repeat(60)}\n# Zweiter Teil\n${'ö'.repeat(60)}\n`,
    'ohne Zeilenumbruch am Ende': `# A\n${'x'.repeat(90)}\n# B\n${'y'.repeat(90)}`,
    'mit Leerzeilen an der Grenze': `# A\n${'x'.repeat(90)}\n\n\n# B\n${'y'.repeat(90)}\n`,
  };
  for (const [name, text] of Object.entries(faelle)) {
    it(`setzt ein zerlegtes Dokument zeichengleich wieder zusammen — ${name}`, () => {
      const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
      expect(plan.geteilt).toBe(true);
      const zurueck = assembleParts(
        plan.teile.map((t) => ({ index: t.index, content: t.text })),
      ).text;
      expect(zurueck).toBe(writePartLine(text, { index: 1, base: 'Notizen' }).text);
    });
  }

  it('lässt den Text unverändert, wenn die Zuordnungs-Zeile schon steht', () => {
    const text = writePartLine(abschnitt('A', 90) + abschnitt('B', 90), {
      index: 1,
      base: 'Notizen',
    }).text;
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(text);
  });
});

describe('document-split.js — Grenzen nachführen (AK5)', () => {
  it('lässt eine Grenze vor der Änderung stehen und verschiebt die dahinter', () => {
    const alt = 'AAAA' + 'BBBB' + 'CCCC';
    const neu = 'AAAA' + 'BBxBB' + 'CCCC';
    const nach = fuehreGrenzenNach(alt, neu, [4, 8]);
    expect(nach.erhalten).toEqual([4, 9]);
    expect(nach.verschluckt).toBe(0);
  });

  it('erhält eine Grenze, die genau am Rand des geänderten Bereichs liegt', () => {
    const alt = 'AAAA' + 'BBBB' + 'CCCC';
    const neu = 'AAAAxxxxxxxxCCCC';
    const nach = fuehreGrenzenNach(alt, neu, [4, 8]);
    expect(nach.verschluckt).toBe(0);
    expect(nach.erhalten).toEqual([4, 12]);
  });

  it('meldet eine Grenze mitten im geänderten Bereich als verschluckt', () => {
    const alt = 'AAAA' + 'BBBB' + 'CCCC';
    const neu = 'AAxxxxxxxxCC';
    const nach = fuehreGrenzenNach(alt, neu, [4, 8]);
    expect(nach.verschluckt).toBe(2);
    expect(nach.erhalten).toEqual([]);
  });

  it('kommt mit einem unveränderten Text ohne Verschiebung aus', () => {
    const alt = 'AAAABBBB';
    const nach = fuehreGrenzenNach(alt, alt, [4]);
    expect(nach.erhalten).toEqual([4]);
    expect(nach.verschluckt).toBe(0);
  });
});

describe('document-split.js — Wachsen eines geteilten Dokuments (AK5)', () => {
  // Ein geteiltes Dokument aus drei Teilen als Ausgangslage.
  function bestandAus(text) {
    const plan = planeZerlegung({ text, base: 'Notizen', schwelle: KLEIN });
    return plan.teile.map((t) => ({ index: t.index, basename: t.basename, content: t.text }));
  }

  const ausgang = abschnitt('Eins', 80) + abschnitt('Zwei', 80) + abschnitt('Drei', 80);

  it('schreibt bei einer Änderung in einem Teil nur diesen einen neu', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const neu = alt.replace('# Zwei', '# Zwei geändert');
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    const geaendert = plan.teile.filter((t) => t.geaendert);
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0].index).toBe(2);
    expect(plan.neuGeteilt).toBe(false);
  });

  it('erhält die bestehenden Grenzen, statt neu aufzuteilen (nie Rebalancing)', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    // Eine große Einfügung in den ERSTEN Teil: Bei einer Neuaufteilung wanderten
    // alle folgenden Grenzen, hier bleiben sie stehen.
    const neu = alt.replace('# Eins\n', `# Eins\n${'q'.repeat(400)}\n`);
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    const geaendert = plan.teile.filter((t) => t.geaendert).map((t) => t.index);
    expect(geaendert).toEqual([1]);
    expect(byteLength(plan.teile[0].text)).toBeGreaterThan(KLEIN);
  });

  it('fügt beim Wachsen des LETZTEN Teils einen weiteren an, mit neuer Nummer', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const neu = `${alt}${abschnitt('Vier', 80)}${abschnitt('Fünf', 80)}`;
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    expect(plan.teile.length).toBeGreaterThan(bestand.length);
    const angehaengt = plan.teile.filter((t) => t.neu);
    expect(angehaengt.length).toBeGreaterThan(0);
    expect(Math.min(...angehaengt.map((t) => t.index))).toBe(bestand.length + 1);
    // Die bestehenden Teile bleiben Byte für Byte unberührt.
    for (let i = 0; i < bestand.length - 1; i++) {
      expect(plan.teile[i].geaendert).toBe(false);
    }
  });

  it('vereint ein geteiltes Dokument beim Schrumpfen NICHT von selbst (O9)', () => {
    const bestand = bestandAus(ausgang);
    const plan = planeZerlegung({
      text: '---\ndoc-part: v1|1|Notizen\n---\n# Rest\nklein\n',
      base: 'Notizen',
      schwelle: KLEIN,
      bestand,
    });
    expect(plan.geteilt).toBe(true);
  });

  it('bleibt beim Zusammensetzen zeichengleich, auch nachdem es gewachsen ist', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const neu = `${alt}${abschnitt('Vier', 200)}`;
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(neu);
  });

  it('bleibt zeichengleich, wenn eine Änderung eine Grenze überspannt', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    // Alles zwischen der Mitte des ersten und der Mitte des dritten Abschnitts
    // wird durch anderen Text ersetzt: Die Grenzen dazwischen sind verschluckt.
    const von = alt.indexOf('# Zwei') - 20;
    const bis = alt.indexOf('# Drei') + 20;
    const neu = `${alt.slice(0, von)}\n# Neu dazwischen\n${'m'.repeat(50)}\n${alt.slice(bis)}`;
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(neu);
    // Keine Nummer verschwindet, keine wird wiederverwendet.
    expect(plan.teile.map((t) => t.index)).toEqual([1, 2, 3]);
  });

  it('behält leere Teile, statt Nummern freizugeben', () => {
    const bestand = bestandAus(ausgang);
    const alt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    // Der Text zwischen der ersten und der letzten Grenze fällt ersatzlos weg.
    const von = alt.indexOf('# Zwei');
    const bis = alt.indexOf('# Drei');
    const neu = alt.slice(0, von) + alt.slice(bis);
    const plan = planeZerlegung({ text: neu, base: 'Notizen', schwelle: KLEIN, bestand });
    expect(plan.teile.map((t) => t.index)).toEqual([1, 2, 3]);
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(neu);
  });
});

describe('document-split.js — an der echten Schwelle', () => {
  it('teilt ein Dokument von etwas über 1 MB in zwei Teile', () => {
    const haelfte = 'x'.repeat(600 * 1024);
    const text = `# Erster\n${haelfte}\n# Zweiter\n${haelfte}\n`;
    const plan = planeZerlegung({ text, base: 'Notizen' });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile).toHaveLength(2);
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(writePartLine(text, { index: 1, base: 'Notizen' }).text);
  });

  it('lässt ein Dokument knapp unter 1 MB ungeteilt', () => {
    const text = `# Erster\n${'x'.repeat(1000 * 1024)}\n# Zweiter\nText\n`;
    expect(planeZerlegung({ text, base: 'Notizen' }).geteilt).toBe(false);
  });
});
