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
import { teilungsOptionen } from '../../src/main/documents/teilungs-optionen.js';
import { formatSegmentFelder, parseSegmentFelder } from '../../src/shared/database/behaelter.js';
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

// --- 4T-001549 (Epic 3E-000251, E26.5): die zweite Schnittpunkt-Art ---------------------
//
// Die Prüffälle stehen in derselben Datei wie die der allgemeinen Teilung, und
// das ist Absicht: Der Eingriff berührt ausgeliefertes Verhalten eines fremden
// Vorhabens, und die tragende Zusage ist, dass **beide** Betriebsarten
// nebeneinander stimmen. Zwei getrennte Dateien würden genau diese Nachbarschaft
// verbergen.

// Eine Tabellen-Datei der Datenbank: Definition im Frontmatter, Datensätze im
// Block. `fuellung` macht die Datensätze groß genug, dass eine kleine Schwelle
// greift, ohne dass der Prüffall unlesbar wird.
function tabellenDatei(anzahl, fuellung = 40) {
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: name', '    - name: text', '---'];
  zeilen.push('', '```perspective-records');
  for (let i = 1; i <= anzahl; i++) {
    zeilen.push(
      `|- id="r-${String(i).padStart(5, '0')}"`,
      `| Name ${i}`,
      `| ${'x'.repeat(fuellung)}`,
    );
  }
  zeilen.push('```', '');
  return zeilen.join('\n');
}

describe('document-split.js — Schnittpunkte an der Datensatz-Grenze (AK1)', () => {
  it('findet einen Punkt vor jedem Datensatz außer dem ersten', () => {
    // Vor dem ersten wird nicht geschnitten: Der erste Teil bestünde sonst aus
    // Frontmatter und öffnendem Zaun, ohne einen einzigen Datensatz.
    expect(findSplitPoints(tabellenDatei(5))).toHaveLength(4);
    expect(findSplitPoints(tabellenDatei(1))).toHaveLength(0);
  });

  it('legt den Punkt genau auf den Zeilenanfang des Datensatz-Markers', () => {
    const text = tabellenDatei(3);
    for (const punkt of findSplitPoints(text)) {
      expect(text.slice(punkt.offset, punkt.offset + 3)).toBe('|- ');
    }
  });

  it('übergeht eine maskierte Zeile, ohne sie eigens prüfen zu müssen', () => {
    // Die Maskierung des Formats beginnt mit einem Rückstrich, ein Marker in
    // Spalte 0 mit dem Marker selbst; beides schließt einander aus.
    const text = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: n',
      '---',
      '',
      '```perspective-records',
      '|- id="r-00001"',
      '| Erste Zelle',
      '\\|- das ist Inhalt und kein Datensatz',
      '|- id="r-00002"',
      '| Zweite Zelle',
      '```',
      '',
    ].join('\n');
    const punkte = findSplitPoints(text);
    expect(punkte).toHaveLength(1);
    expect(text.slice(punkte[0].offset).startsWith('|- id="r-00002"')).toBe(true);
  });

  it('zählt nur den Datensatz-Block, nicht jede Fence der Datei', () => {
    const text = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: n',
      '---',
      '',
      '```text',
      '|- sieht aus wie ein Datensatz, steht aber in einer fremden Fence',
      '|- und diese Zeile ebenso',
      '```',
      '',
      '```perspective-records',
      '|- id="r-00001"',
      '| A',
      '|- id="r-00002"',
      '| B',
      '```',
      '',
    ].join('\n');
    expect(findSplitPoints(text)).toHaveLength(1);
  });

  it('schneidet in einer Tabellen-Datei NICHT an Überschriften', () => {
    // Die entschiedene Konsequenz der Betriebsart-Weiche: Eine Datei ist
    // entweder eine Tabelle oder keine. Das Tabellen-Dokument ist technische
    // Ablage, in der niemand von Hand Überschriften setzt.
    const text = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: n',
      '---',
      '',
      '# Eine Überschrift',
      '',
      '```perspective-records',
      '|- id="r-00001"',
      '| A',
      '```',
      '',
    ].join('\n');
    expect(findSplitPoints(text)).toHaveLength(0);
  });
});

describe('document-split.js — die allgemeine Teilung bleibt unberührt (AK2)', () => {
  it('schneidet ohne Tabellen-Marke weiter an Überschriften, auch bei Datensatz-Zeilen', () => {
    // Dieselbe Fence, aber keine Definition im Frontmatter: Das ist keine
    // Tabellen-Datei, also gilt der Überschriften-Weg — und dessen Regel, dass
    // Fence-Inhalt übersprungen wird.
    const text = [
      '# Erster',
      '',
      '```perspective-records',
      '|- id="r-00001"',
      '| A',
      '|- id="r-00002"',
      '| B',
      '```',
      '',
      '# Zweiter',
      '',
    ].join('\n');
    const punkte = findSplitPoints(text);
    expect(punkte).toHaveLength(1);
    expect(text.slice(punkte[0].offset).startsWith('# Zweiter')).toBe(true);
  });

  it('lässt ein Frontmatter ohne die Marke den Überschriften-Weg gehen', () => {
    const text = `---\ntitle: T\n---\n${abschnitt('A', 90)}${abschnitt('B', 90)}`;
    expect(findSplitPoints(text)).toHaveLength(1);
  });
});

describe('document-split.js — Zerlegung einer Tabellen-Datei (AK3 bis AK5)', () => {
  it('setzt eine zerlegte Tabelle zeichengleich wieder zusammen', () => {
    // Die tragende Zusage, hier für die zweite Schnittpunkt-Art. Verglichen wird
    // wie bei den Dokumenten gegen den Ausgangstext MIT ergänzter
    // Zuordnungs-Zeile, weil das erste Teilen sie der Kopf-Datei hinzufügt.
    const text = tabellenDatei(12);
    const plan = planeZerlegung({ text, base: 'Bestellungen', schwelle: 300 });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile.length).toBeGreaterThan(2);
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(writePartLine(text, { index: 1, base: 'Bestellungen' }).text);
  });

  it('beginnt jedes Folge-Segment mit einem vollständigen Datensatz', () => {
    // Kein Datensatz wird je zerteilt — die Grenze liegt vor seinem Marker.
    const plan = planeZerlegung({ text: tabellenDatei(12), base: 'B', schwelle: 300 });
    for (const teil of plan.teile.slice(1)) {
      const rumpf = teil.text.split('---\n').slice(2).join('---\n');
      expect(rumpf.startsWith('|- ')).toBe(true);
    }
  });

  it('lässt einen einzelnen Datensatz ganz, auch über der Schwelle', () => {
    const plan = planeZerlegung({ text: tabellenDatei(1, 400), base: 'B', schwelle: 100 });
    expect(plan.geteilt).toBe(false);
    expect(plan.grund).toBe('kein-schnittpunkt');
  });

  it('teilt eine Tabelle ohne Datensätze nicht und meldet keinen Fehler', () => {
    const text = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: n',
      '---',
      '',
      '```perspective-records',
      '```',
      '',
    ].join('\n');
    const plan = planeZerlegung({ text, base: 'B', schwelle: 10 });
    expect(plan.ok).toBe(true);
    expect(plan.geteilt).toBe(false);
  });

  it('hält die Ablage-Schwelle bereit, an der die Segmente gemessen werden', () => {
    // Die Schwelle selbst anzuwenden ist 4T-001550; hier steht allein, dass die
    // Zerlegung mit ihr arbeitet, sobald der Aufrufer sie mitgibt.
    const plan = planeZerlegung({
      text: tabellenDatei(4000, 200),
      base: 'B',
      schwelle: ABLAGE_SCHWELLE,
    });
    expect(plan.geteilt).toBe(true);
    expect(plan.teile.length).toBeGreaterThan(1);
  });
});

// --- 4T-001550 (Epic 3E-000251, E26.1/E26.3): Segmentierung der Tabellen-Ablage ---------

describe('Teilungs-Vorgaben je Datei-Art (AK1)', () => {
  it('misst eine Tabellen-Datei an der Ablage-Schwelle, ein Dokument an der Dokument-Schwelle', () => {
    const tab = teilungsOptionen(tabellenDatei(2));
    expect(tab.istTabelle).toBe(true);
    expect(tab.schwelle).toBe(ABLAGE_SCHWELLE);
    const doc = teilungsOptionen(`---\ntitle: T\n---\n${abschnitt('A', 10)}`);
    expect(doc.istTabelle).toBe(false);
    expect(doc.schwelle).toBe(DOKUMENT_SCHWELLE);
    expect(doc.segmentFelder).toBeNull();
  });

  it('liefert die Feld-Namen in der Reihenfolge der Definition', () => {
    expect(teilungsOptionen(tabellenDatei(1)).segmentFelder).toEqual(['name', 'text']);
  });

  it('liefert keine Namen, wenn die Definition keine gültige Spalte trägt', () => {
    // Eine Tabelle bleibt eine Tabelle, auch wenn ihr Behälter leer ist — sie
    // bekommt dann nur keine Lese-Hilfe, statt einer leeren.
    const text = ['---', 'db-table:', '  fields: []', '---', '', 'Text', ''].join('\n');
    const opt = teilungsOptionen(text);
    expect(opt.istTabelle).toBe(true);
    expect(opt.segmentFelder).toBeNull();
  });
});

describe('Lese-Hilfe im Folge-Segment (AK3, AK4)', () => {
  function segmentiere(anzahl, felder) {
    const text = tabellenDatei(anzahl);
    return planeZerlegung({ text, base: 'Bestellungen', schwelle: 300, segmentFelder: felder });
  }

  it('trägt die Feld-Namen in jedem Folge-Segment, aber nicht in der Kopf-Datei', () => {
    // Die Kopf-Datei zeigt Definition und Daten zugleich (E3.2) und braucht die
    // Hilfe nicht; eine zweite Liste neben der Definition wäre eine zweite
    // Heimat für dieselbe Aussage.
    const plan = segmentiere(12, ['name', 'text']);
    expect(plan.teile.length).toBeGreaterThan(2);
    expect(plan.teile[0].text).not.toContain('db-fields:');
    for (const teil of plan.teile.slice(1)) {
      expect(teil.text).toContain('db-fields: name | text');
    }
  });

  it('schreibt die Liste neu, statt eine veraltete fortzuschreiben', () => {
    // Die Reparatur aus E26.3: Ein umbenanntes Feld lässt die Liste eines alten
    // Segments veralten, und der nächste Schreibvorgang setzt sie richtig —
    // dasselbe Muster, mit dem E3.6 die Fence-Länge behandelt.
    const plan = segmentiere(12, ['kunde', 'betrag']);
    for (const teil of plan.teile.slice(1)) {
      expect(teil.text).toContain('db-fields: kunde | betrag');
      expect(teil.text).not.toContain('name | text');
    }
  });

  it('lässt den Schlüssel weg, wenn es keine Namen gibt', () => {
    const plan = segmentiere(12, null);
    for (const teil of plan.teile) expect(teil.text).not.toContain('db-fields:');
  });

  it('lässt die Umkehr-Eigenschaft unberührt', () => {
    // Die Lese-Hilfe steht im Frontmatter des Folge-Segments, und genau den
    // entfernt das Zusammensetzen ohnehin.
    const text = tabellenDatei(12);
    const plan = planeZerlegung({
      text,
      base: 'Bestellungen',
      schwelle: 300,
      segmentFelder: ['name', 'text'],
    });
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(writePartLine(text, { index: 1, base: 'Bestellungen' }).text);
  });
});

describe('Form der Lese-Hilfe (4T-001550)', () => {
  it('trennt die Namen sichtbar und liest sie wieder ein', () => {
    expect(formatSegmentFelder(['kunde', 'menge'])).toBe('kunde | menge');
    expect(parseSegmentFelder('kunde | menge')).toEqual(['kunde', 'menge']);
  });

  it('ergibt null bei einer leeren Liste und [] bei einer fehlenden Angabe', () => {
    expect(formatSegmentFelder([])).toBeNull();
    expect(formatSegmentFelder(['  ', ''])).toBeNull();
    expect(formatSegmentFelder(null)).toBeNull();
    expect(parseSegmentFelder(undefined)).toEqual([]);
    expect(parseSegmentFelder('')).toEqual([]);
  });

  it('verträgt fehlenden Leerraum um den Trenner', () => {
    expect(parseSegmentFelder('kunde|menge')).toEqual(['kunde', 'menge']);
  });
});

describe('Zusicherungen der Schreib-Politik (AK5 bis AK7, E26.2)', () => {
  // Ein Bestand aus zwei Segmenten, dessen zweites deutlich größer ist als die
  // Schwelle, mit der gleich gerechnet wird — die Lage nach einer gesenkten
  // Einstellung oder beim Öffnen einer fremden Datenbank.
  function datensaetze(von, bis) {
    const z = [];
    for (let i = von; i <= bis; i++) {
      z.push(`|- id="r-${String(i).padStart(5, '0')}"`, `| Name ${i}`, `| ${i}`);
    }
    return z;
  }

  function bestandZweiSegmente() {
    const kopf =
      [
        '---',
        'db-table:',
        '  fields:',
        '    - name: kunde',
        '    - name: menge',
        '---',
        '',
        '```perspective-records',
        ...datensaetze(1, 6),
      ].join('\n') + '\n';
    const zweites = [
      '---',
      'doc-part: v1|2|B',
      'db-fields: kunde | menge',
      '---',
      ...datensaetze(7, 30),
      '```',
      '',
    ].join('\n');
    return [
      { index: 1, basename: 'B', content: writePartLine(kopf, { index: 1, base: 'B' }).text },
      { index: 2, basename: `B${PART_SEP}${PART_INFIX}00002`, content: zweites },
    ];
  }

  function plane(text, schwelle, bestand) {
    return planeZerlegung({
      text,
      base: 'B',
      schwelle,
      bestand,
      segmentFelder: ['kunde', 'menge'],
    });
  }

  it('liest eine vorgefundene Aufteilung mit übergroßem Segment, ohne sie zu ändern', () => {
    const bestand = bestandZweiSegmente();
    const gesamt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    // Das zweite Segment ist um ein Vielfaches größer als die Schwelle.
    expect(byteLength(bestand[1].content)).toBeGreaterThan(150);
    const plan = plane(gesamt, 150, bestand);
    expect(plan.teile).toHaveLength(2);
    expect(plan.teile.every((t) => t.geaendert === false)).toBe(true);
  });

  it('schneidet ein vorhandenes Segment NICHT neu, nur weil die Schwelle gesunken ist', () => {
    // Der belegte Fall: Der Anwender ändert eine Zelle im ERSTEN Segment, das
    // zweite rührt er nicht an. Vor Weg A zerfiel es trotzdem in zwei Dateien,
    // weil die Rotation den letzten Teil ohne Rücksicht auf die Berührung teilte.
    const bestand = bestandZweiSegmente();
    const gesamt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const plan = plane(gesamt.replace('| Name 3', '| Name drei'), 400, bestand);
    expect(plan.teile).toHaveLength(2);
    // Und der Datensatz-Bestand des zweiten Segments ist unangetastet.
    expect(plan.teile[1].text).toContain('r-00007');
    expect(plan.teile[1].text).toContain('r-00030');
  });

  it('teilt den letzten Teil weiterhin, wenn die Änderung ihn berührt', () => {
    // Die Gegenprobe: Ohne sie wäre die Regel keine Bedingung, sondern eine
    // Abschaltung der Rotation.
    const bestand = bestandZweiSegmente();
    const gesamt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const gewachsen = gesamt.replace('```\n', datensaetze(31, 50).join('\n') + '\n```\n');
    expect(plane(gewachsen, 400, bestand).teile.length).toBeGreaterThan(2);
  });

  it('lässt einen mittleren Teil groß werden, ohne ihn zu zerschneiden (AK7)', () => {
    // Kein Datensatz wechselt je seine Datei: Ein Einschub in der Mitte
    // verschiebt die hinteren Grenzen, verteilt aber nichts um.
    const bestand = bestandZweiSegmente();
    const gesamt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const eingefuegt = gesamt.replace('| Name 3', '| Name 3\n|- id="r-00099"\n| Neu\n| 99');
    const plan = plane(eingefuegt, 400, bestand);
    expect(plan.teile).toHaveLength(2);
    expect(plan.teile[0].text).toContain('r-00099');
    expect(plan.teile[1].text).toContain('r-00007');
  });

  it('bleibt auch nach dem unberührten Lauf zeichengleich zusammensetzbar', () => {
    const bestand = bestandZweiSegmente();
    const gesamt = assembleParts(bestand.map((t) => ({ index: t.index, content: t.content }))).text;
    const geaendert = gesamt.replace('| Name 3', '| Name drei');
    const plan = plane(geaendert, 400, bestand);
    const zurueck = assembleParts(
      plan.teile.map((t) => ({ index: t.index, content: t.text })),
    ).text;
    expect(zurueck).toBe(geaendert);
  });
});
