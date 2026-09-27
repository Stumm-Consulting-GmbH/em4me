// 4T-001547 (Epic 3E-000251, E3.7): Unit-Tests der Anzeige des Datensatz-Blocks —
// Tabellen-Aufbau aus der Definition, typisierte Zellen, das Fenster und die
// beiden Fälle, in denen keine Tabelle entsteht.
//
// Die Prüffälle laufen auf zwei Ebenen: der Bauer allein und die volle
// Render-Pipeline. Die zweite Ebene ist die wichtigere, weil dieser Block das
// erste Konstrukt ist, dessen Spalten **außerhalb** seiner Fence stehen — im
// Frontmatter derselben Datei. Ein Bauer-Test allein bewiese nur, dass er
// baut, was man ihm gibt, und nicht, dass die Pipeline ihm das Richtige gibt.
//
// 4T-001548 ergänzt den dritten Ausgabe-Weg desselben Konstrukts, den portablen
// Export. Er steht hier und nicht in einer eigenen Datei, weil die
// Paritäts-Checkliste der Entwicklungsrichtlinien Lese-Ansicht, Änderungs-Modus
// und Export als drei Wege EINER Darstellung führt: Was sie unterscheidet, ist
// nur an ihrem Gegenstück abzulesen.
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderMarkdown,
  convertMarkdownPortable,
  configureExtensions,
} from '../../src/shared/markdown/markdown.js';
import {
  MAX_RECORD_ROWS,
  BOOLEAN_MARK,
  buildRecordsHtml,
} from '../../src/shared/markdown/perspective-records-html.js';
import { parseRecordBlock } from '../../src/shared/database/record-block.js';
import { extensionById } from '../../src/shared/extensions/extensions.js';

afterEach(() => {
  configureExtensions([]);
});

const FELDER = [
  { name: 'name', type: 'string' },
  { name: 'menge', type: 'number', options: { decimals: 2 } },
  { name: 'erledigt', type: 'boolean' },
];

// Ein Tabellen-Dokument: Definition im Frontmatter, Datensätze im Körper.
function tabellenDokument(zeilen, felder) {
  const fm = ['---', 'db-table:', '  fields:'];
  for (const feld of felder || ['name', 'menge', 'erledigt']) {
    if (typeof feld === 'string') fm.push(`    - name: ${feld}`);
    else fm.push(...feld);
  }
  fm.push('---', '');
  return fm.concat(['```perspective-records', ...zeilen, '```', '']).join('\n');
}

function baue(rumpf, felder, opts) {
  const model = parseRecordBlock(rumpf, felder);
  return buildRecordsHtml(model, felder, opts || {});
}

describe('Datensatz-Anzeige: Tabellen-Aufbau (4T-001547)', () => {
  it('nimmt die Spalten aus der Definition, nicht aus dem Block', () => {
    const html = baue('|-\n| Anna\n| 1\n| x', FELDER);
    expect(html).toContain('<th class="prc-head prc-type-string">name</th>');
    expect(html).toContain('<th class="prc-head prc-type-number">menge</th>');
    expect(html).toContain('<th class="prc-head prc-type-boolean">erledigt</th>');
  });

  it('nimmt die Beschriftung, wenn sie einfacher Text ist', () => {
    const felder = [{ name: 'menge', type: 'number', label: 'Anzahl' }];
    expect(baue('|-\n| 1', felder)).toContain('>Anzahl</th>');
  });

  it('lässt eine Sprach-Zuordnung ausdrücklich unaufgelöst', () => {
    // Die Auflösung über die Rückfall-Kette gehört zur Mehrsprachigkeit der
    // Datenbank-Objekte; eine halbe Auflösung hier wäre eine zweite Kette.
    const felder = [{ name: 'menge', type: 'number', label: { de: 'Anzahl', en: 'Amount' } }];
    expect(baue('|-\n| 1', felder)).toContain('>menge</th>');
  });

  it('zeigt Werte typisiert: Nachkommastellen, Haken, Rohtext', () => {
    const html = baue('|-\n| Anna\n| 12.5\n| x', FELDER);
    expect(html).toContain('>12.50</td>');
    expect(html).toContain(`>${BOOLEAN_MARK}</td>`);
    expect(html).toContain('>Anna</td>');
  });

  it('behält den Rohtext einer unpassenden Zelle und macht sie kenntlich', () => {
    const html = baue('|-\n| Anna\n| zwoelf\n| x', FELDER);
    expect(html).toContain('prc-error');
    expect(html).toContain('data-rec-err="invalidNumber"');
    expect(html).toContain('>zwoelf</td>');
  });

  it('trägt die Kennung an der Zeile, damit ein Verweis ein Ziel hat', () => {
    expect(baue('|- id="r-00042"\n| Anna\n| 1\n| x', FELDER)).toContain('data-rec-id="r-00042"');
  });
});

// --- Die Aktions-Spalte am Zeilen-Anfang (4T-001792) ----------------------------------

describe('Datensatz-Anzeige: der Zugang zu den Änderungsbelegen (4T-001792)', () => {
  // Die Beschriftung kommt wie jeder andere Text dieses Bauers über die
  // Label-Auflösung; ohne sie stünde der Schlüssel-Name am Knopf.
  const TEXTE = { 'records.historyButton': 'Änderungsbelege anzeigen' };

  it('stellt der Kopfzeile eine Zelle ohne Text und ohne Ansage voran', () => {
    const html = baue('|- id="r-00001"\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    // Eine Spalte, die allein einen Griff trägt, hat keine Überschrift; eine
    // erfundene wäre für den Vorleser Lärm (Muster der Lösch-Spalte der
    // Datentabelle).
    expect(html).toContain('<th class="prc-head prc-action-head" aria-hidden="true"></th>');
    // Und sie steht VORN, nicht irgendwo: Variante 1 der Entscheidung vom
    // 2026-09-18 liegt am Zeilen-Anfang, weil sie bei breiten Tabellen sonst
    // aus dem sichtbaren Bereich fiele.
    expect(html.indexOf('prc-action-head')).toBeLessThan(html.indexOf('prc-type-string'));
  });

  it('stellt jeder Datenzeile mit Kennung die Schaltfläche voran', () => {
    const html = baue('|- id="r-00001"\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    expect(html).toContain('<td class="prc-action"><button type="button"');
    expect(html).toContain('class="prc-history-btn"');
    // Hinweistext für die Maus, `aria-label` für den Vorleser, beide aus
    // demselben Schlüssel.
    expect(html).toContain('title="Änderungsbelege anzeigen"');
    expect(html).toContain('aria-label="Änderungsbelege anzeigen"');
    // Die Schaltfläche steht in der Zeile VOR der ersten Datenzelle.
    const zeile = html.slice(html.indexOf('<tr class="prc-row"'));
    expect(zeile.indexOf('prc-action')).toBeLessThan(zeile.indexOf('prc-cell'));
  });

  it('hält jede Schaltfläche aus der Tabulator-Folge heraus', () => {
    // Eine Tabelle trägt bis zu 2000 Zeilen; 2000 Tabulator-Stopps wären keine
    // Erreichbarkeit. Genau eine hebt der Anzeige-Prozess auf 0 (Bauplan Z5).
    const zeilen = [];
    for (let i = 1; i <= 3; i++) zeilen.push(`|- id="r-0000${i}"`, `| Nr ${i}`, '| 1', '|');
    const html = baue(zeilen.join('\n'), FELDER, { labels: TEXTE });
    expect((html.match(/class="prc-history-btn" tabindex="-1"/g) || []).length).toBe(3);
    expect(html).not.toContain('tabindex="0"');
  });

  it('trägt das Symbol als Inline-SVG, das der Vorleser überspringt', () => {
    const html = baue('|- id="r-00001"\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    expect(html).toContain('<svg');
    expect(html).toContain('stroke="currentColor"');
    // Die Schaltfläche sagt sich über ihr aria-label an; ein zusätzlich
    // vorgelesenes Symbol wäre eine doppelte Ansage.
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    expect(svg).toContain('aria-hidden="true"');
  });

  it('gibt einer Zeile OHNE Kennung die leere Zelle ohne Schaltfläche', () => {
    // Die Belege hängen an der internen Kennung; zu einer Zeile ohne sie kann
    // es keine geben, und ein Knopf wäre ein Versprechen ohne Deckung.
    const html = baue('|-\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    expect(html).toContain('<td class="prc-action"></td>');
    expect(html).not.toContain('prc-history-btn');
  });

  it('zählt die Aktions-Spalte in der Breite der leeren Tabelle mit', () => {
    // Ohne das eine Plus stünde der Hinweis schmaler als die Tabelle und die
    // letzte Spalte fiele aus dem Rahmen.
    const html = baue('', FELDER, { labels: TEXTE });
    expect(html).toContain(`colspan="${FELDER.length + 1}"`);
  });

  it('reicht die Beschriftung über die Pipeline in der Sprache des Laufs durch', () => {
    // Der tragende Teil: Ohne den Eintrag in RECORD_LABEL_KEYS stünde hier der
    // Schlüssel-Name, und zwar in allen fünf Sprachen gleich falsch.
    const doc = tabellenDokument(['|- id="r-00001"', '| Anna', '| 1', '| x']);
    expect(renderMarkdown(doc, 'de')).toContain('aria-label="Änderungsbelege anzeigen"');
    const en = renderMarkdown(doc, 'en');
    expect(en).toContain('aria-label="Show change records"');
    expect(en).not.toContain('records.historyButton');
  });
});

// 4T-001939 (Epic 3E-000257, Bauplan B7, AK1, AK5, AK6): Die zweite
// Zeilen-Schaltfläche zur Einzel-Maske und der Fuß mit «Neuer Datensatz».
describe('Datensatz-Anzeige: der Zugang zur Einzel-Maske (4T-001939)', () => {
  const TEXTE = {
    'records.historyButton': 'Änderungsbelege anzeigen',
    'records.openButton': 'Datensatz öffnen',
    'records.newButton': 'Neuer Datensatz',
  };

  it('stellt der Beleg-Schaltfläche die Schaltfläche «Datensatz öffnen» voran', () => {
    const html = baue('|- id="r-00001"\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    const zelle = html.slice(html.indexOf('<td class="prc-action">'));
    expect(zelle).toContain('class="prc-open-btn" tabindex="-1"');
    expect(zelle).toContain('aria-label="Datensatz öffnen"');
    expect(zelle).toContain('title="Datensatz öffnen"');
    // Beide Griffe in EINER Zelle, der neue vorn.
    expect(zelle.indexOf('prc-open-btn')).toBeLessThan(zelle.indexOf('prc-history-btn'));
    expect(zelle.indexOf('prc-history-btn')).toBeLessThan(zelle.indexOf('</td>'));
  });

  it('gibt einer Zeile ohne Kennung auch keine Schaltfläche zur Maske', () => {
    const html = baue('|-\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    expect(html).toContain('<td class="prc-action"></td>');
    expect(html).not.toContain('prc-open-btn');
  });

  it('setzt unter die Tabelle den Fuß mit «Neuer Datensatz»', () => {
    const html = baue('|- id="r-00001"\n| Anna\n| 1\n| x', FELDER, { labels: TEXTE });
    expect(html).toContain(
      '<div class="prc-foot"><button type="button" class="prc-new-btn">Neuer Datensatz</button></div>',
    );
    expect(html.indexOf('</table>')).toBeLessThan(html.indexOf('prc-foot'));
    // Der Fuß ist ein einzelner Griff und steht in der Tabulator-Folge.
    expect(html).not.toMatch(/prc-new-btn"[^>]*tabindex/);
  });

  it('setzt den Fuß auch unter die leere Tabelle, die sonst keinen Weg hätte', () => {
    const html = baue('', FELDER, { labels: TEXTE });
    expect(html).toContain('class="prc-new-btn"');
  });

  it('setzt keinen Fuß, wo die Definition fehlt', () => {
    const html = baue('|-\n| Anna', [], { labels: TEXTE });
    expect(html).not.toContain('prc-foot');
    expect(html).not.toContain('prc-new-btn');
  });

  it('reicht beide Beschriftungen über die Pipeline in der Sprache des Laufs durch', () => {
    const doc = tabellenDokument(['|- id="r-00001"', '| Anna', '| 1', '| x']);
    const de = renderMarkdown(doc, 'de');
    expect(de).toContain('aria-label="Datensatz öffnen"');
    expect(de).toContain('>Neuer Datensatz</button>');
    const en = renderMarkdown(doc, 'en');
    expect(en).toContain('aria-label="Open record"');
    expect(en).toContain('>New record</button>');
    expect(en).not.toContain('records.openButton');
    expect(en).not.toContain('records.newButton');
  });

  it('entfällt im Aus-Zustand der Erweiterung samt Fuß (AK6)', () => {
    configureExtensions(['database']);
    const html = renderMarkdown(
      tabellenDokument(['|- id="r-00001"', '| Anna', '| 1', '| x']),
      'de',
    );
    expect(html).not.toContain('prc-open-btn');
    expect(html).not.toContain('prc-new-btn');
  });

  it('bleibt aus dem portablen Export heraus, Schaltfläche wie Fuß', () => {
    const out = convertMarkdownPortable(
      tabellenDokument(['|- id="r-00001"', '| Anna', '| 1', '| x']),
      true,
      'de',
    );
    // Nicht-Vakuitäts-Probe: Der Export hat die Tabelle wirklich gebaut.
    expect(out).toContain('<td>Anna</td>');
    expect(out).not.toContain('prc-open-btn');
    expect(out).not.toContain('prc-foot');
    expect(out).not.toContain('prc-new-btn');
  });
});

describe('Datensatz-Anzeige: Fenster statt Kappung (E3.7)', () => {
  function vieleDatensaetze(anzahl) {
    const zeilen = [];
    for (let i = 1; i <= anzahl; i++) zeilen.push('|-', `| Nr ${i}`, '| 1', '|');
    return zeilen.join('\n');
  }

  it('zeigt unterhalb der Grenze alle Datensätze ohne Hinweis', () => {
    const html = baue(vieleDatensaetze(3), FELDER);
    expect((html.match(/class="prc-row"/g) || []).length).toBe(3);
    expect(html).not.toContain('prc-window');
  });

  it('zeigt oberhalb der Grenze einen Ausschnitt und sagt es', () => {
    // Der Unterschied zur Kappung ist genau diese Zeile: Sie nennt, wovon der
    // Ausschnitt einer ist. Ohne sie wäre die Anzeige ein stiller Verlust.
    const html = baue(vieleDatensaetze(7), FELDER, { max: 4 });
    expect((html.match(/class="prc-row"/g) || []).length).toBe(4);
    expect(html).toContain('data-rec-shown="4"');
    expect(html).toContain('data-rec-total="7"');
  });

  it('setzt die Zahlen des Hinweises in den lokalisierten Text ein', () => {
    const html = baue(vieleDatensaetze(7), FELDER, {
      max: 4,
      labels: { 'records.window': 'Ausschnitt: {shown} von {total} Datensätzen' },
    });
    expect(html).toContain('Ausschnitt: 4 von 7 Datensätzen');
  });

  it('hält die Grenze an einer Stelle und nicht bei der Zahl der Nachbarn', () => {
    // Die 1000 der Datentabelle und der Ereignisse sind Schutz-Kappungen für
    // Prosa-Konstrukte; hier ist Größe der Normalfall.
    expect(typeof MAX_RECORD_ROWS).toBe('number');
    expect(MAX_RECORD_ROWS).toBeGreaterThan(1000);
  });
});

describe('Datensatz-Anzeige: die Fälle ohne Tabelle', () => {
  it('meldet eine Datei ohne Tabellen-Definition, statt Spalten zu raten', () => {
    const html = baue('|-\n| Anna', []);
    expect(html).toContain('prc-note-nodef');
    expect(html).not.toContain('<table');
  });

  it('zeigt eine Tabelle ohne Datensätze mit Kopf und Hinweis', () => {
    const html = baue('', FELDER, { labels: { 'records.empty': 'Keine Datensätze' } });
    expect(html).toContain('<th class="prc-head prc-type-string">name</th>');
    expect(html).toContain('Keine Datensätze');
  });

  it('meldet Befunde am Block, ohne die Tabelle zu verlieren', () => {
    const html = baue('|-\n| Anna', FELDER);
    expect(html).toContain('<table');
    expect(html).toContain('data-rec-code="recordCellsMissing"');
  });
});

describe('Datensatz-Anzeige in der Render-Pipeline (4T-001547)', () => {
  it('rendert die Fence als Tabelle mit den Spalten aus dem Frontmatter', () => {
    const html = renderMarkdown(
      tabellenDokument(['|- id="r-00001"', '| Anna', '| 1', '| x']),
      'de',
    );
    expect(html).toContain('class="perspective-records"');
    expect(html).toContain('<th class="prc-head prc-type-string">name</th>');
    expect(html).toContain('data-rec-id="r-00001"');
  });

  it('reicht den Fence-Rumpf und die Zeilen-Lage am Container durch', () => {
    const html = renderMarkdown(tabellenDokument(['|-', '| Anna', '| 1', '| x']), 'de');
    expect(html).toMatch(/data-rec-index="0"/);
    expect(html).toMatch(/data-rec-line-start="\d+"/);
    expect(html).toContain('data-rec-source=');
  });

  it('lokalisiert den Fenster-Hinweis über die Sprache des Render-Laufs', () => {
    const zeilen = [];
    for (let i = 0; i <= MAX_RECORD_ROWS; i++) zeilen.push('|-', `| Nr ${i}`, '| 1', '|');
    const html = renderMarkdown(tabellenDokument(zeilen), 'en');
    expect(html).toContain('prc-window');
    expect(html).toMatch(/Excerpt: \d+ of \d+ records/);
  });

  it('meldet einen Datensatz-Block in einer Datei ohne Definition', () => {
    const doc = ['```perspective-records', '|-', '| Anna', '```', ''].join('\n');
    expect(renderMarkdown(doc, 'de')).toContain('prc-note-nodef');
  });

  // 4T-001931 (Epic 3E-000256, E22.2, AK5): Die Regel steht im Frontmatter, die
  // Markierung entsteht beim Lesen, und sichtbar wird sie erst in der Anzeige.
  // Gemessen wird deshalb über die volle Pipeline.
  it('markiert eine Zelle mit verletzter Feld-Regel und zeigt den Datensatz weiter', () => {
    const felder = [
      ['    - name: name', '      required: true'],
      ['    - name: plz', "      check: '/^\\d{4}$/'"],
    ];
    const html = renderMarkdown(
      tabellenDokument(
        ['|- id="r-00001"', '| Anna', '| 40a', '', '|- id="r-00002"', '|', '| 4051'],
        felder,
      ),
      'de',
    );
    // Die Anzeige gibt den Zell-Text einer markierten Zelle unverändert aus,
    // samt dem Trennabstand der letzten Zelle; gemessen wird daher bis zum Tag.
    expect(html).toContain('data-rec-id="r-00001"');
    expect(html).toMatch(
      /<td class="prc-cell prc-type-string prc-error" data-rec-err="check">40a\s*<\/td>/,
    );
    // Die leere Pflicht-Zelle trägt denselben Weg mit ihrem eigenen Code.
    expect(html).toContain('data-rec-id="r-00002"');
    expect(html).toContain(
      '<td class="prc-cell prc-type-string prc-error" data-rec-err="required"></td>',
    );
    expect(html).toMatch(/<td class="prc-cell prc-type-string">4051\s*<\/td>/);
  });

  it('hängt am Schalter der Datenbank-Erweiterung', () => {
    // 4T-001760 (Epic 3E-000253): Der Fall stand seit 4T-001547 an die
    // Registrierung gebunden da — solange die Kennung `database` nicht
    // registriert war, galt sie als aktiv, und der Aus-Zustand ließ sich gar
    // nicht herstellen. Mit der Registrierung ist die Bedingung eingelöst: Der
    // Fall verlangt jetzt unbedingt den Rückfall auf den Code-Block.
    expect(extensionById('database')).not.toBeNull();
    configureExtensions(['database']);
    const html = renderMarkdown(tabellenDokument(['|-', '| Anna', '| 1', '| x']), 'de');
    expect(html).not.toContain('class="perspective-records"');
    expect(html).toContain('| Anna');
  });
});

// --- Die Meldungen unter dem Block (4T-001584) ----------------------------------------

// Die Punkte der Befund-Liste als Paar aus Code und sichtbarem Text. Gemessen
// wird über die volle Pipeline, weil erst sie die Sprachdateien mitgibt; ein
// Bauer-Aufruf ohne Beschriftungen zeigte den Rückfall und nicht den Satz.
function hinweisZeilen(html) {
  return [...html.matchAll(/<li class="prc-hint" data-rec-code="([^"]+)">([^<]*)<\/li>/g)].map(
    (treffer) => ({ code: treffer[1], text: treffer[2] }),
  );
}

// Ein Dokument ohne Definition im Frontmatter: die Datensätze stehen da, die
// Spalten fehlen.
function blockOhneDefinition(zeilen) {
  return ['```perspective-records', ...zeilen, '```', ''].join('\n');
}

describe('Datensatz-Anzeige: die Meldungen als Sätze (4T-001584)', () => {
  it('nennt fehlende Zellen mit Datensatz-Position und Feld-Zahl', () => {
    const zeilen = hinweisZeilen(renderMarkdown(tabellenDokument(['|-', '| Anna']), 'de'));
    expect(zeilen).toEqual([
      {
        code: 'recordCellsMissing',
        text: 'Datensatz 1: weniger Zellen als Felder; erwartet werden 3, die fehlenden bleiben leer.',
      },
    ]);
  });

  it('nennt überzählige Zellen ebenso', () => {
    const doc = tabellenDokument(['|-', '| Anna', '| 1', '| x', '| zu viel']);
    const zeilen = hinweisZeilen(renderMarkdown(doc, 'de'));
    expect(zeilen[0].code).toBe('recordCellsExtra');
    expect(zeilen[0].text).toContain('Datensatz 1: mehr Zellen als Felder; erwartet werden 3');
  });

  it('unterscheidet losen Text im Datensatz von losem Text am Block', () => {
    // Zwei Satzformen, weil ein Befund am ganzen Block keine Position hat: Eine
    // Klammer-Ziffer wäre dort schlicht leer geblieben.
    const imDatensatz = hinweisZeilen(
      renderMarkdown(tabellenDokument(['|-', 'lose Zeile', '| Anna', '| 1', '| x']), 'de'),
    );
    expect(imDatensatz[0].code).toBe('recordStrayContent');
    expect(imDatensatz[0].text).toContain('Datensatz 1: Text außerhalb jeder Zelle');

    const amBlock = hinweisZeilen(
      renderMarkdown(tabellenDokument(['lose Zeile', '|-', '| Anna', '| 1', '| x']), 'de'),
    );
    expect(amBlock[0].code).toBe('recordStrayContent');
    expect(amBlock[0].text).toBe(
      'Text außerhalb jedes Datensatzes; er bleibt in der Datei stehen und erscheint nicht in der Tabelle.',
    );
  });

  it('erklärt die Datei ohne Tabellen-Definition in einem Satz', () => {
    const zeilen = hinweisZeilen(renderMarkdown(blockOhneDefinition(['|-', '| Anna']), 'de'));
    expect(zeilen).toEqual([
      {
        code: 'recordNoDefinition',
        text: 'Die Datei beschreibt keine Tabelle; ohne Definition im Frontmatter entstehen aus den Datensätzen keine Spalten.',
      },
    ]);
  });

  it('erklärt eine nicht auslegbare Kennung mit ihrer Datensatz-Position', () => {
    const doc = tabellenDokument(['|- r-00042', '| Anna', '| 1', '| x']);
    const zeilen = hinweisZeilen(renderMarkdown(doc, 'de'));
    expect(zeilen[0].code).toBe('recordIdInvalid');
    expect(zeilen[0].text).toContain('Datensatz 1: die Kennung am Datensatz-Marker');
  });

  it('lässt keinen Code des Formats als sichtbaren Text durch', () => {
    // AK2 und AK3: Der Code bleibt als Daten-Attribut adressierbar, im Text
    // steht ein Satz. Ein durchschlagendes Codewort wäre genau der Befund, der
    // diesen Vorgang ausgelöst hat.
    const doc = tabellenDokument([
      'lose Zeile',
      '|- r-00042',
      '| Anna',
      '|-',
      '| Berta',
      '| 1',
      '| x',
      '| zu viel',
    ]);
    const zeilen = hinweisZeilen(renderMarkdown(doc, 'de'));
    expect(zeilen.length).toBeGreaterThan(2);
    for (const zeile of zeilen) {
      expect(zeile.code).toMatch(/^record/);
      expect(zeile.text).not.toMatch(/record[A-Z]/);
      expect(zeile.text).not.toMatch(/[{}]/);
      expect(zeile.text.length).toBeGreaterThan(20);
    }
  });

  it('spricht die Sprache des Render-Laufs', () => {
    const zeilen = hinweisZeilen(renderMarkdown(tabellenDokument(['|-', '| Anna']), 'en'));
    expect(zeilen[0].text).toBe(
      'Record 1: fewer cells than fields; 3 are expected, the missing ones stay empty.',
    );
  });
});

// Ein Tabellen-Dokument mit erklärten Typen — der Export unterscheidet sich je
// Typ (Ausrichtung, Haken, Nachkommastellen), die knappe Namensliste oben
// reicht dafür nicht.
const TYP_FELDER = [
  ['    - name: name'],
  ['    - name: menge', '      type: number', '      options:', '        decimals: 2'],
  ['    - name: erledigt', '      type: boolean'],
];

function exportiere(zeilen, felder) {
  return convertMarkdownPortable(tabellenDokument(zeilen, felder || TYP_FELDER), true, 'de');
}

describe('Datensatz-Block im portablen Export (4T-001548, E29.2)', () => {
  it('wird zur statischen Tabelle mit den Spalten aus der Definition', () => {
    const out = exportiere(['|- id="r-00001"', '| Anna', '| 12.5', '| x']);
    expect(out).toContain('<th scope="col">name</th>');
    expect(out).toContain('<td>Anna</td>');
    // Kein Container, keine Klassen: Das Export-Dokument hat kein Stylesheet.
    expect(out).not.toContain('perspective-records"');
    expect(out).not.toContain('prc-table');
  });

  it('trägt Ausrichtung und Typ-Anzeige als Inline-Angabe', () => {
    const out = exportiere(['|-', '| Anna', '| 12.5', '| x']);
    expect(out).toContain('<td style="text-align: right;">12.50</td>');
    expect(out).toContain(`<td style="text-align: center;">${BOOLEAN_MARK}</td>`);
  });

  it('setzt den Marker an die Datei-Spitze und lässt das Frontmatter vorn stehen', () => {
    const out = exportiere(['|-', '| Anna', '| 1', '| x']);
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('<!-- perspective-portable -->');
    expect(out.indexOf('db-table:')).toBeLessThan(out.indexOf('<!-- perspective-portable -->'));
  });

  it('enthält ALLE Datensätze — im Export gibt es kein Fenster', () => {
    // Der tragende Fall dieses Tasks. In der Anwendung ist das Fenster ein
    // Dienst am Anwender, der die Tabelle vor sich hat; in einer Datei, die die
    // Anwendung verlässt, wäre dasselbe Verhalten ein stiller Datenverlust —
    // der Empfänger sieht nicht, dass etwas fehlt (E3.7).
    const anzahl = MAX_RECORD_ROWS + 5;
    const zeilen = [];
    for (let i = 1; i <= anzahl; i++) zeilen.push('|-', `| Nr ${i}`, '| 1', '|');
    const out = exportiere(zeilen);
    expect((out.match(/<td>Nr /g) || []).length).toBe(anzahl);
    expect(out).toContain('<td>Nr 1</td>');
    expect(out).toContain(`<td>Nr ${anzahl}</td>`);
    expect(out).not.toContain('prc-window');
  });

  it('hält einen mehrzeiligen Wert mit <br> zusammen, auch über eine Leerzeile', () => {
    // Zwei Gründe in einem Prüffall: Ohne <br> verlöre der Empfänger die
    // Umbrüche (in der Anwendung hält sie CSS), und eine Leerzeile im Rohtext
    // beendete den HTML-Block des Markdown-Parsers mitten in der Tabelle.
    const out = exportiere(['|-', '| Erste Zeile', '', 'Nach der Leerzeile', '| 1', '|']);
    expect(out).toContain('<td>Erste Zeile<br><br>Nach der Leerzeile</td>');
    expect(out).not.toMatch(/<td>[^<]*\n/);
  });

  it('behält den Rohtext einer unpassenden Zelle und macht sie kenntlich', () => {
    const out = exportiere(['|-', '| Anna', '| zwoelf', '| x']);
    expect(out).toContain('background-color: #ffebee');
    expect(out).toContain('zwoelf');
  });

  it('zeigt eine Tabelle ohne Datensätze mit Kopf und lokalisiertem Hinweis', () => {
    // Eine Leerzeile als Rumpf und nicht der leere Rumpf: Die Fence-Erkennung
    // des Exports verlangt eine Zeile zwischen den beiden Zäunen — dieselbe
    // Regex-Gestalt, die die beiden Geschwister-Konstrukte seit je nutzen.
    const out = exportiere(['']);
    expect(out).toContain('<th scope="col">name</th>');
    expect(out).toContain('Keine Datensätze');
  });
});

describe('Portabler Export: wo er zurückweicht (4T-001548)', () => {
  // **Die Regel in einem Satz:** Der Export lässt die Fence unverändert
  // stehen, sobald der Block Inhalt trägt, den eine Tabelle nicht zeigt. Im
  // Roh-Zustand überlebt jedes Zeichen; in einer Tabelle, die es weglässt,
  // wäre der Verlust endgültig und für den Empfänger unsichtbar (E3.7).
  function bleibtRoh(out) {
    expect(out).toContain('```perspective-records');
    expect(out).not.toContain('<table>');
  }

  it('bei einer Datei ohne Tabellen-Definition', () => {
    const doc = ['```perspective-records', '|-', '| Anna', '```', ''].join('\n');
    bleibtRoh(convertMarkdownPortable(doc, true, 'de'));
  });

  it('bei überzähligen Zellen — sie stehen in der Ablage, nicht in der Tabelle', () => {
    bleibtRoh(exportiere(['|-', '| Anna', '| 1', '| x', '| eine Zelle zu viel']));
  });

  it('bei losem Text zwischen Marker und erster Zelle', () => {
    bleibtRoh(exportiere(['|-', 'loser Text', '| Anna', '| 1', '| x']));
  });

  it('bei einer nicht ausgelegten Angabe am Datensatz-Marker', () => {
    bleibtRoh(exportiere(['|- id="r-00001" quelle="import"', '| Anna', '| 1', '| x']));
  });

  it('aber NICHT bei fehlenden Zellen — dort ist nichts zu verlieren', () => {
    const out = exportiere(['|-', '| Anna']);
    expect(out).toContain('<td>Anna</td>');
    expect(out).toContain('<td style="text-align: right;"></td>');
    expect(out).not.toContain('```perspective-records');
  });

  it('hängt am Schalter der Datenbank-Erweiterung', () => {
    // 4T-001760 (Epic 3E-000253): wie im Viewer-Pfad mit der Registrierung
    // unbedingt geworden — der portable Export fällt im Aus-Zustand auf den
    // Rohtext der Fence zurück.
    expect(extensionById('database')).not.toBeNull();
    configureExtensions(['database']);
    bleibtRoh(exportiere(['|-', '| Anna', '| 1', '| x']));
  });

  it('bleibt ohne Aktions-Spalte und ohne Schaltfläche (4T-001792)', () => {
    // Die Schaltfläche führt in eine Ansicht DIESER Anwendung. Beim Empfänger
    // einer exportierten Datei wäre sie ein toter Knopf, und die Beleg-Datei
    // daneben hat er ohnehin nicht; die leere Spalte davor wäre ein
    // unerklärlicher Rand.
    const out = exportiere(['|- id="r-00001"', '| Anna', '| 12.5', '| x']);
    expect(out).toContain('<td>Anna</td>');
    expect(out).not.toContain('prc-action');
    expect(out).not.toContain('prc-history-btn');
    expect(out).not.toContain('<button');
    // Gegenprobe an der Breite: Kopfzeile und Datenzeile tragen genau so viele
    // Zellen, wie die Definition Felder hat.
    const kopf = out.slice(out.indexOf('<thead>'), out.indexOf('</thead>'));
    expect((kopf.match(/<th\b/g) || []).length).toBe(TYP_FELDER.length);
  });

  it('zählt in der leeren Tabelle nur die Felder (4T-001792)', () => {
    // Der Anzeige-Pfad zählt seit 4T-001792 eine Spalte mehr; hier darf er es
    // ausdrücklich nicht, sonst stünde beim Empfänger eine Spalte zu viel.
    const out = exportiere(['']);
    expect(out).toContain(`colspan="${TYP_FELDER.length}"`);
  });
});

// --- 4T-001833 (Epic 3E-000254, B6): Anzeige und Export lösen die Maskierung auf ---

// Ein Wert mit maskierten Zaun-Zeilen, gefolgt von einem weiteren Datensatz: So
// schreibt die Anwendung seit 4T-001833 einen Wert, der Code enthält.
const MASKIERT = [
  '|- id="r-00001"',
  '| Anna',
  '\\```',
  'code',
  '\\~~~',
  '| 1',
  '| x',
  '|- id="r-00002"',
  '| Bert',
  '| 2',
  '|',
];

describe('Datensatz-Block: maskierte Zaun-Zeilen in Anzeige und Export (4T-001833, B6)', () => {
  // 4T-001833: Die Lese-Ansicht zeigt den Wert demaskiert, der Block endet nicht vorzeitig.
  it('zeigt den Wert demaskiert und alle Datensätze dahinter', () => {
    const html = renderMarkdown(tabellenDokument(MASKIERT), 'de');
    expect(html).toContain('data-rec-id="r-00001"');
    expect(html).toContain('data-rec-id="r-00002"');
    expect(html).toContain('>Anna\n```\ncode\n~~~</td>');
    // Sichtbar ist allein die Tabelle; das Daten-Attribut am Container trägt
    // den Rohtext der Datei und damit die Maskierung, und das ist dort richtig.
    const tabelle = html.slice(html.indexOf('<table'));
    expect(tabelle).not.toContain('\\```');
    expect(tabelle).not.toContain('\\~~~');
    expect(hinweisZeilen(html)).toEqual([]);
  });

  // 4T-001833: Der portable Export ebenso.
  it('exportiert den Wert demaskiert und alle Datensätze dahinter', () => {
    const out = exportiere(MASKIERT);
    expect(out).toContain('<td>Anna<br>```<br>code<br>~~~</td>');
    expect(out).toContain('<td>Bert</td>');
    expect(out).not.toContain('\\```');
  });

  // 4T-001833: Die Hand-Datei mit längerem Zaun und unmaskierter innerer Zeile.
  it('meldet eine unmaskierte Zaun-Zeile als Satz am Datensatz, ohne etwas zu verlieren', () => {
    // Dasselbe Dokument wie `tabellenDokument`, aber mit vier Backticks als Zaun.
    const doc = [
      '---',
      'db-table:',
      '  fields:',
      '    - name: name',
      '    - name: menge',
      '    - name: erledigt',
      '---',
      '',
      '````perspective-records',
      '|- id="r-00001"',
      '| Anna',
      '```',
      '| 1',
      '| x',
      '````',
      '',
    ].join('\n');
    const html = renderMarkdown(doc, 'de');
    expect(html).toContain('>Anna\n```</td>');
    expect(hinweisZeilen(html)).toEqual([
      {
        code: 'recordFenceLine',
        text: 'Datensatz 1: eine Zeile beginnt wie ein Code-Zaun (drei Backticks oder Tilden); sie bleibt Inhalt und wird beim nächsten Schreibvorgang mit einem Rückstrich maskiert.',
      },
    ]);
  });
});
