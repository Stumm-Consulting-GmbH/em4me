// 4T-000402 (Epic 3E-000076): Unit-Tests für das Auswertungs-Modul der
// Perspective-Query-Sprache (perspective-query-eval.js): Typ-System,
// implizite file.*-Felder, Funktions-Katalog, FROM-Quellen und Validierung.
// Prozess-neutral mit synthetischem Kontext (kein Temp-FS); die Integration
// mit dem echten Index liegt in perspective-query-index.test.js.
// 4T-001073 (Datei-Größen-Budget): Die Feld-Auflösung außerhalb des Datei-Scopes
// (BLOCKS und TASKS) liegt seit dem Schnitt in
// perspective-query-eval-scopes.test.js.
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// Über createRequire, damit die Plattform in DERSELBEN Modul-Instanz gesetzt
// wird, die query-sources.js benutzt (Muster area-path.test.js).
const { setPlatformForTests } = createRequire(import.meta.url)('../../src/shared/platform.js');
// 4T-000987 (Epic 3E-000196): Modul-Familie im Feature-Ordner src/shared/query/
// geschnitten; die Namen kommen direkt aus dem jeweiligen Modul (Kern,
// Funktions-Katalog, Format). Die geprüften Fälle bleiben unverändert.
import { parseQuery } from '../../src/shared/query/perspective-query.js';
import {
  matchesQuery,
  evaluateExpression,
  applyResultPipeline,
} from '../../src/shared/query/perspective-query-eval.js';
import { validateQuery, queryUsesLinks } from '../../src/shared/query/query-functions.js';
import {
  formatValue,
  formatValueSegments,
  formatExprSource,
} from '../../src/shared/query/query-format.js';

const DAY = 24 * 60 * 60 * 1000;
// Fester Bezugszeitpunkt (lokal 2026-07-08 12:00), damit date(today)/date(now)
// deterministisch sind.
const NOW = new Date(2026, 6, 8, 12, 0, 0).getTime();

function parseOk(query) {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}

// Synthetischer Datei-Kontext; Teile über `over` überschreibbar.
function ctxFor(over = {}) {
  return {
    props: over.props || {},
    file: {
      name: 'Alpha',
      folder: 'Projekte/Aktiv',
      path: 'Projekte/Aktiv/Alpha.md',
      ext: 'md',
      absPath: 'C:/Wurzel/Projekte/Aktiv/Alpha.md',
      size: 1234,
      ctimeMs: NOW - 30 * DAY,
      mtimeMs: NOW - 3 * DAY,
      tags: ['projekt/unter', 'Wichtig'],
      aliases: ['A1'],
      inlinks: [{ path: 'C:/Wurzel/Quelle.md', name: 'Quelle' }],
      outlinks: [{ path: 'C:/Wurzel/Ziel.md', name: 'Ziel' }],
      ...(over.file || {}),
    },
    now: NOW,
    // 4T-001073 (Epic 3E-000211): Wurzel des Suchraums; infolder braucht sie, um
    // absolute Link-Pfade gegen eine wurzel-relative Ordner-Angabe zu prüfen.
    // Ausdrücklich auf null setzbar, um den kontextlosen Ort zu prüfen.
    root: over.root === undefined ? 'C:/Wurzel' : over.root,
    resolveLinkTarget: over.resolveLinkTarget,
    // 4T-001070 (Epic 3E-000211): Kontext der Träger-Datei (Selbstbezug).
    self: over.self,
    // 4T-001072 (Epic 3E-000211): Sprache der Formatierer.
    locale: over.locale,
  };
}

function matchWith(query, over) {
  return matchesQuery(parseOk(query), ctxFor(over));
}

// 4T-001071 (Epic 3E-000211): einzelner Wert-Ausdruck (Ausdrucks-Modus des Parsers).
function exprOf(source) {
  const r = parseQuery(source, { expression: true });
  if (!r.ok) throw new Error(`unerwarteter Parse-Fehler: ${r.error.code}`);
  return r.ast;
}

describe('perspective-query-eval — Typ-System', () => {
  it('Ordnungs-Vergleiche: Zahl numerisch (auch Zahl-Strings)', () => {
    expect(matchWith('prio > 5', { props: { prio: '10' } })).toBe(true);
    expect(matchWith('prio > 5', { props: { prio: '3' } })).toBe(false);
    expect(matchWith('prio > 5', { props: {} })).toBe(false);
    expect(matchWith('prio <= 3', { props: { prio: '3' } })).toBe(true);
  });

  it('Ordnungs-Vergleiche: String lexikographisch case-insensitiv', () => {
    expect(matchWith('name < "M"', { props: { name: 'anton' } })).toBe(true);
    expect(matchWith('name < "m"', { props: { name: 'Zebra' } })).toBe(false);
  });

  it('Datums-Vergleiche: Frontmatter-ISO-Strings chronologisch', () => {
    expect(matchWith('due <= date(2026-07-08)', { props: { due: '2026-07-01' } })).toBe(true);
    expect(matchWith('due <= date(2026-07-08)', { props: { due: '2026-07-09' } })).toBe(false);
    expect(matchWith('due < "2026-07-02"', { props: { due: '2026-07-01' } })).toBe(true);
  });

  it('file.mtime gegen date(today) mit Dauer-Arithmetik', () => {
    // mtime liegt 3 Tage vor NOW: innerhalb von 7 Tagen, nicht innerhalb von 1 Tag.
    expect(matchWith('WHERE file.mtime >= date(today) - dur(7 days)')).toBe(true);
    expect(matchWith('WHERE file.mtime >= date(today) - dur(1 day)')).toBe(false);
    expect(matchWith('WHERE file.ctime < file.mtime')).toBe(true);
  });

  it('Zahl-Arithmetik mit Punkt-vor-Strich', () => {
    expect(matchWith('a = 2 + 2 * 2', { props: { a: '6' } })).toBe(true);
    expect(matchWith('a = (2 + 2) * 2', { props: { a: '8' } })).toBe(true);
    expect(matchWith('a > 10 / 4', { props: { a: '3' } })).toBe(true);
  });

  it('Datum minus Datum ergibt eine Dauer', () => {
    const v = evaluateExpression(
      parseOk('WHERE file.mtime - file.ctime >= dur(27 days)').where,
      ctxFor(),
    );
    expect(v).toBe(true);
  });

  it('String-Konkatenation über +', () => {
    const expr = parseOk('LIST a + "-" + b').fields[0].expr;
    expect(evaluateExpression(expr, ctxFor({ props: { a: 'x', b: 'y' } }))).toBe('x-y');
  });
});

describe('perspective-query-eval — implizite file.*-Felder', () => {
  it('name, folder, path, ext, size', () => {
    expect(matchWith('WHERE file.name = "alpha"')).toBe(true);
    expect(matchWith('WHERE file.folder = "Projekte/Aktiv"')).toBe(true);
    expect(matchWith('WHERE file.path = "Projekte/Aktiv/Alpha.md"')).toBe(true);
    expect(matchWith('WHERE file.ext = "md"')).toBe(true);
    expect(matchWith('WHERE file.size > 1000')).toBe(true);
    expect(matchWith('WHERE file.size > 2000')).toBe(false);
  });

  it('tags und aliases als Listen (Gleichheit = Mitgliedschaft)', () => {
    expect(matchWith('WHERE file.tags = "wichtig"')).toBe(true);
    expect(matchWith('WHERE file.aliases = "a1"')).toBe(true);
    expect(matchWith('WHERE file.tags = "fehlt"')).toBe(false);
  });

  it('inlinks/outlinks als Link-Listen (contains über den Namen)', () => {
    expect(matchWith('WHERE contains(file.outlinks, "ziel")')).toBe(true);
    expect(matchWith('WHERE contains(file.inlinks, "Quelle")')).toBe(true);
    expect(matchWith('WHERE contains(file.outlinks, "Anderes")')).toBe(false);
    expect(matchWith('WHERE length(file.inlinks) = 1')).toBe(true);
  });

  it('unbekanntes file.*-Feld und fehlender Datei-Kontext sind null', () => {
    expect(matchWith('WHERE file.unbekannt = "x"')).toBe(false);
    expect(matchesQuery(parseOk('WHERE file.name = "alpha"'), { props: {}, now: NOW })).toBe(false);
  });

  // 4T-001071 (Epic 3E-000211): file.day — Datum aus dem ISO-Präfix des Namens.
  it('file.day liest das ISO-Präfix des Namens als Datums-Wert', () => {
    const tag = (name) => evaluateExpression(exprOf('file.day'), ctxFor({ file: { name } }));
    expect(tag('2026-03-16')).toEqual({ kind: 'date', ms: new Date(2026, 2, 16).getTime() });
    // Namensrest nach dem Präfix ist erlaubt (Bestands-Form der Journal-Notizen).
    expect(tag('2026-03-16 GTD Hierarchie')).toEqual({
      kind: 'date',
      ms: new Date(2026, 2, 16).getTime(),
    });
  });

  it('file.day ist null ohne Präfix, bei unmöglichem Datum und mitten im Namen', () => {
    const tag = (name) => evaluateExpression(exprOf('file.day'), ctxFor({ file: { name } }));
    expect(tag('A Maragkopoulou')).toBe(null); // Story AK2
    expect(tag('2026-02-30 Test')).toBe(null); // Kalender-Gegenprobe
    expect(tag('20260316')).toBe(null); // Kompaktform bewusst nicht erkannt
    expect(tag('2026-03-160')).toBe(null); // kein Präfix, sondern längere Zahl
    expect(tag('Rückblick auf 2020-01-01')).toBe(null); // Datum nicht am Anfang
    // Bricht Ausdrücke nicht: Vergleich mit null ist falsch, kein Wurf.
    expect(matchWith('WHERE file.day > date(2020-01-01)', { file: { name: 'Ohne' } })).toBe(false);
  });
});

describe('perspective-query-eval — Funktions-Katalog', () => {
  const props = { titel: 'Herbst-Plan', tags: ['rot', 'Blau'], werte: ['1', '2', '3'] };

  it('contains (case-sensitiv) und icontains (case-insensitiv)', () => {
    expect(matchWith('contains(titel, "Herbst")', { props })).toBe(true);
    expect(matchWith('contains(titel, "herbst")', { props })).toBe(false);
    expect(matchWith('icontains(titel, "herbst")', { props })).toBe(true);
    expect(matchWith('contains(tags, "Blau")', { props })).toBe(true);
    expect(matchWith('contains(tags, "blau")', { props })).toBe(false);
    expect(matchWith('icontains(tags, "blau")', { props })).toBe(true);
  });

  it('length, lower, upper, startswith, endswith', () => {
    expect(matchWith('length(tags) = 2', { props })).toBe(true);
    expect(matchWith('lower(titel) = "herbst-plan"', { props })).toBe(true);
    expect(matchWith('upper(titel) = "HERBST-PLAN"', { props })).toBe(true);
    expect(matchWith('startswith(titel, "Herbst")', { props })).toBe(true);
    expect(matchWith('endswith(titel, "Plan")', { props })).toBe(true);
    expect(matchWith('startswith(titel, "herbst")', { props })).toBe(false);
  });

  it('default und choice', () => {
    expect(matchWith('default(fehlt, "leer") = "leer"', { props })).toBe(true);
    expect(matchWith('default(titel, "leer") = "Herbst-Plan"', { props })).toBe(true);
    expect(matchWith('choice(length(tags) > 1, "viele", "wenige") = "viele"', { props })).toBe(
      true,
    );
  });

  it('number, string, dateformat', () => {
    expect(matchWith('number("42") = 42', { props })).toBe(true);
    expect(matchWith('string(42) = "42"', { props })).toBe(true);
    expect(matchWith('WHERE dateformat(file.mtime, "yyyy-MM") = "2026-07"')).toBe(true);
    expect(matchWith('WHERE dateformat(file.mtime, "yyyy/MM/dd") = "2026/07/05"')).toBe(true);
  });

  it('sum, min, max, average über Zahl-Listen', () => {
    expect(matchWith('sum(werte) = 6', { props })).toBe(true);
    expect(matchWith('min(werte) = 1', { props })).toBe(true);
    expect(matchWith('max(werte) = 3', { props })).toBe(true);
    expect(matchWith('average(werte) = 2', { props })).toBe(true);
    expect(matchWith('sum(titel) = 0', { props })).toBe(false); // nicht numerisch -> null
  });

  // 4T-001072 (Epic 3E-000211): Zahlen- und Währungs-Format, Sprach-Bindung.
  it('currencyformat: lokalisierter Betrag, EUR als Vorgabe', () => {
    const wert = (s, locale) => evaluateExpression(exprOf(s), ctxFor({ locale }));
    // Die deutsche Form trennt Betrag und Zeichen mit einem geschützten
    // Leerzeichen (U+00A0), nicht mit einem gewöhnlichen — als Escape-Form
    // geschrieben, damit die Erwartung im Quelltext eindeutig lesbar ist.
    const eur = '1.234,50 €';
    expect(wert('currencyformat(1234.5, "EUR")', 'de')).toBe(eur);
    expect(wert('currencyformat(1234.5, "EUR")', 'en')).toBe('€1,234.50');
    // Ohne Währungs-Angabe gilt EUR.
    expect(wert('currencyformat(1234.5)', 'de')).toBe(eur);
    // Zahl-Zeichenketten aus dem Frontmatter laufen über coerceNumber mit.
    expect(wert('currencyformat("1234.5", "EUR")', 'de')).toBe(eur);
  });

  it('numberformat: Locale-Vorgabe und feste Nachkommastellen', () => {
    const wert = (s, locale) => evaluateExpression(exprOf(s), ctxFor({ locale }));
    expect(wert('numberformat(1234567.891)', 'de')).toBe('1.234.567,891');
    expect(wert('numberformat(1234567.891)', 'en')).toBe('1,234,567.891');
    expect(wert('numberformat(1234.5, 2)', 'de')).toBe('1.234,50');
    expect(wert('numberformat(1234.5, 0)', 'de')).toBe('1.235');
  });

  it('Formatierer: Nicht-Zahlen sind null, unbekannte Währung fällt zurück', () => {
    const wert = (s, locale) => evaluateExpression(exprOf(s), ctxFor({ locale }));
    expect(wert('numberformat("abc")', 'de')).toBe(null);
    expect(wert('currencyformat(fehlt)', 'de')).toBe(null);
    // Unbekannter Code darf die Zelle nicht leeren, sondern zeigt die Zahl.
    expect(wert('currencyformat(1234.5, "XYZQ")', 'de')).toBe('1234.5');
    // Unbekannter Sprach-Tag fällt auf die Laufzeit-Locale, nicht auf null.
    expect(wert('numberformat(1234.5, 2)', 'kein-tag')).not.toBe(null);
  });

  it('dateformat folgt der Kontext-Sprache, ohne sie der Laufzeit-Locale', () => {
    const wert = (s, locale) => evaluateExpression(exprOf(s), ctxFor({ locale }));
    expect(wert('dateformat(date(2026-08-17), "EEEE")', 'de')).toBe('Montag');
    expect(wert('dateformat(date(2026-08-17), "EEEE")', 'en')).toBe('Monday');
    expect(wert('dateformat(date(2026-08-17), "MMMM")', 'fr')).toBe('août');
    // Regressions-Anker: ohne Kontext-Sprache bleibt es beim bisherigen
    // Verhalten (Laufzeit-Locale), also ein nicht-leerer Name statt null.
    const ohne = wert('dateformat(date(2026-08-17), "EEEE")');
    expect(typeof ohne).toBe('string');
    expect(ohne.length).toBeGreaterThan(0);
    // Die sprachfreien Token bleiben unabhängig von der Sprache gleich.
    expect(wert('dateformat(date(2026-08-17), "yyyy-MM-dd")', 'en')).toBe('2026-08-17');
  });

  // 4T-001071 (Epic 3E-000211): Tages-Zahl einer Dauer.
  it('days: ganze Tage, gerundet über die Zeitumstellung hinweg', () => {
    const tage = (s) => evaluateExpression(exprOf(s), ctxFor());
    expect(tage('days(dur(48 days))')).toBe(48);
    // Spanne OHNE Zeitumstellung: exakt 48 Tage.
    expect(tage('days(date(2026-06-18) - date(2026-05-01))')).toBe(48);
    // Spanne ÜBER die Umstellung (Ende März): lokal 47 Tage und 23 Stunden.
    // Ein Abschneiden lieferte hier 47 — der eigentliche Grund für die Rundung.
    // In einer Zone ohne Sommerzeit sind es exakt 48; der Fall bleibt grün,
    // prüft dort aber nur die Grundrechnung.
    expect(tage('days(date(2026-04-18) - date(2026-03-01))')).toBe(48);
    // Rückwärts gerichtete Spanne bleibt negativ.
    expect(tage('days(date(2026-03-01) - date(2026-04-18))')).toBe(-48);
  });

  it('days: Nicht-Dauern ergeben null', () => {
    const tage = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    expect(tage('days(5)')).toBe(null);
    expect(tage('days("7")')).toBe(null);
    expect(tage('days(date(2026-03-01))')).toBe(null);
    expect(tage('days(fehlt)', { props: {} })).toBe(null);
  });

  // 4T-001071 (Epic 3E-000211): Verkettungs-Rückfall (Konzept-Entscheid E5).
  it('Verkettung mit Nicht-Text-Werten nutzt die Anzeige-Form', () => {
    const wert = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    expect(wert('file.day + " x"', { file: { name: '2026-03-01' } })).toBe('2026-03-01 x');
    expect(wert('"n=" + 48')).toBe('n=48');
    expect(wert('"d=" + dur(2 days)')).toBe('d=2d');
    expect(wert('"L=" + file.link', { file: { name: 'Alpha', absPath: 'C:/W/Alpha.md' } })).toBe(
      'L=Alpha',
    );
    expect(wert('"t=" + file.tags')).toBe('t=projekt/unter, Wichtig');
    // Das Referenz-Muster «Letzter Kontakt» in seiner Ziel-Formulierung.
    expect(
      wert('file.day + " — " + days(date(2026-04-18) - file.day) + " Tage"', {
        file: { name: '2026-03-01' },
      }),
    ).toBe('2026-03-01 — 48 Tage');
  });

  it('Verkettung: numerischer Zweig unverändert, fehlende Werte bleiben fehlend', () => {
    const wert = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    // Regressions-Anker: Zahl plus Zahl-String bleibt Rechnung, keine Verkettung.
    expect(wert('5 + "3"')).toBe(8);
    expect(wert('"5" + "3"')).toBe('53');
    // Ein fehlender Wert macht die ganze Verkettung leer, statt eine halbe
    // Zeichenkette zu erzeugen.
    expect(wert('fehlt + " x"', { props: {} })).toBe(null);
    expect(wert('file.day + " x"', { file: { name: 'Ohne Datum' } })).toBe(null);
    // Ohne Zeichenketten-Seite bleibt es beim bisherigen null.
    expect(wert('file.link + file.link', { file: { absPath: 'C:/W/A.md' } })).toBe(null);
  });

  // 4T-001073 (Epic 3E-000211): Link-Listen-Filter über Ordner (Entscheid E8).
  // Die inlinks des Kontexts liegen absolut unter C:/Wurzel, die Ordner-Angabe
  // ist wurzel-relativ — genau der Pfad-Bruch, den die Funktion überbrückt.
  const INLINKS = [
    { path: 'C:/Wurzel/GTD/Sammeln.md', name: 'Sammeln' },
    { path: 'C:/Wurzel/GTD/Projekte/Umzug.md', name: 'Umzug' },
    { path: 'C:/Wurzel/Journal/2026-03-01.md', name: '2026-03-01' },
  ];

  // 4T-001276 (Epic 3E-000232): Der Fall prüft ausdrücklich auch die
  // Schreibweisen-Toleranz der Ordner-Angabe; die ist seit der Umstellung eine
  // Frage an das Dateisystem und wird deshalb mit gesetzter Plattform geprüft.
  it('infolder: Treffer im Ordner und darunter, gegen absolute Link-Pfade', () => {
    setPlatformForTests('win32');
    const namen = (s, over) =>
      (evaluateExpression(exprOf(s), ctxFor(over)) || []).map((l) => l.name);
    const over = { file: { inlinks: INLINKS } };
    expect(namen('infolder(file.inlinks, "GTD")', over)).toEqual(['Sammeln', 'Umzug']);
    // «darunter» heißt echter Unterordner, nicht der Ordner selbst.
    expect(namen('infolder(file.inlinks, "GTD/Projekte")', over)).toEqual(['Umzug']);
    // Groß-/Kleinschreibung und Schrägstrich-Form wie bei der FROM-Quelle.
    // Der Tokenizer kennt keine Escape-Sequenzen (am Quelltext geprüft): im
    // Abfrage-Text steht EIN Backslash, hier als JS-Escape geschrieben.
    expect(namen('infolder(file.inlinks, "gtd\\projekte")', over)).toEqual(['Umzug']);
    // Leere Ordner-Angabe ist die Wurzel und damit alles.
    expect(namen('infolder(file.inlinks, "")', over)).toHaveLength(3);
    // Wo das Dateisystem die Schreibung unterscheidet, tut es die Ordner-Angabe
    // auch; die Schrägstrich-Form bleibt davon unberührt.
    setPlatformForTests('linux');
    expect(namen('infolder(file.inlinks, "gtd\\projekte")', over)).toEqual([]);
    expect(namen('infolder(file.inlinks, "GTD\\Projekte")', over)).toEqual(['Umzug']);
    setPlatformForTests(undefined);
  });

  it('infolder: Nicht-Treffer ergibt die leere Liste, nicht null', () => {
    const over = { file: { inlinks: INLINKS } };
    // Der belegte Endknoten-Fall des Bestands: length(...) = 0 muss greifen.
    expect(matchWith('length(infolder(file.inlinks, "Archiv")) = 0', over)).toBe(true);
    expect(matchWith('length(infolder(file.inlinks, "GTD")) = 0', over)).toBe(false);
    expect(matchWith('length(infolder(file.inlinks, "GTD")) = 2', over)).toBe(true);
    // Leere Link-Liste ebenso: leer bleibt leer.
    expect(matchWith('length(infolder(file.inlinks, "GTD")) = 0', { file: { inlinks: [] } })).toBe(
      true,
    );
    // Kein Teilstring-Match auf halbem Ordner-Namen (Ordner-Grenze), wie FROM.
    expect(matchWith('length(infolder(file.inlinks, "GT")) = 0', over)).toBe(true);
  });

  it('infolder: einzelner Link zählt als einelementige Liste', () => {
    const wert = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    const over = { file: { name: 'Alpha', absPath: 'C:/Wurzel/GTD/Alpha.md' } };
    expect(wert('infolder(file.link, "GTD")', over)).toHaveLength(1);
    expect(wert('infolder(file.link, "Archiv")', over)).toHaveLength(0);
  });

  it('infolder: Nicht-Listen-Eingaben und Ziele außerhalb der Wurzel', () => {
    const wert = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    expect(wert('infolder("Text", "GTD")')).toBe(null);
    expect(wert('infolder(5, "GTD")')).toBe(null);
    expect(wert('infolder(fehlt, "GTD")', { props: {} })).toBe(null);
    // Zweites Argument muss eine Zeichenkette sein.
    expect(wert('infolder(file.inlinks, 5)', { file: { inlinks: INLINKS } })).toBe(null);
    // Eine Liste ohne Link-Werte ist eine Liste: leere Teilliste, nicht null.
    expect(wert('infolder(file.tags, "GTD")')).toEqual([]);
    // Ein Ziel außerhalb der Wurzel gehört in keinen Ordner des Suchraums.
    expect(
      wert('infolder(file.inlinks, "GTD")', {
        file: { inlinks: [{ path: 'D:/Fremd/GTD/X.md', name: 'X' }] },
      }),
    ).toEqual([]);
  });

  it('infolder: ohne Wurzel im Kontext null statt leerer Liste', () => {
    // Die kontextlosen Orte der Sprache (berechnete Spalten, Inline-Rechnung)
    // führen keine Wurzel. Eine leere Liste träfe dort mit `length(…) = 0`
    // jede Datei — der Irrtum, den Entscheid E9 ausschließt.
    const over = { root: null, file: { inlinks: INLINKS } };
    expect(evaluateExpression(exprOf('infolder(file.inlinks, "GTD")'), ctxFor(over))).toBe(null);
    expect(matchWith('length(infolder(file.inlinks, "GTD")) = 0', over)).toBe(false);
  });

  it('formatValue: Datum ISO, Dauer kompakt, Liste kommagetrennt', () => {
    expect(formatValue({ kind: 'date', ms: new Date(2026, 6, 8).getTime() })).toBe('2026-07-08');
    expect(formatValue({ kind: 'dur', ms: DAY + 2 * 60 * 60 * 1000 })).toBe('1d 2h');
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue(null)).toBe('');
  });
});

// 4T-001276 (Epic 3E-000232, Befund B1): Die Ordner- und Pfad-Vergleiche der
// Quellen-Ebene fragen seither die zentrale Plattform-Auskunft. Die Fälle
// behalten ihre Aussage und setzen dafür die Plattform ausdrücklich; das
// Linux-Verhalten prüft das Gegenstück am Blockende. Die TAG-Quelle ist davon
// bewusst nicht betroffen — ein Tag ist ein logischer Name, kein Pfad.
describe('perspective-query-eval — FROM-Quellen', () => {
  beforeEach(() => setPlatformForTests('win32'));
  afterEach(() => setPlatformForTests(undefined));

  it('Ordner-Quelle: Präfix-Match, case-insensitiv', () => {
    expect(matchWith('FROM "Projekte"')).toBe(true);
    expect(matchWith('FROM "projekte/aktiv"')).toBe(true);
    expect(matchWith('FROM "Projekte/Anderes"')).toBe(false);
    expect(matchWith('FROM "Projekt"')).toBe(false); // kein Teilstring-Match
  });

  it('Ordner-Quelle: Schreibweise zählt, wo das Dateisystem sie unterscheidet', () => {
    setPlatformForTests('linux');
    // Präfix-Match und Nicht-Teilstring-Regel gelten unverändert …
    expect(matchWith('FROM "Projekte"')).toBe(true);
    expect(matchWith('FROM "Projekt"')).toBe(false);
    // … aber ein anders geschriebener Ordner ist ein anderer Ordner.
    expect(matchWith('FROM "projekte/aktiv"')).toBe(false);
  });

  it('Tag-Quelle: hierarchisch und case-insensitiv, Negation über -', () => {
    expect(matchWith('FROM #projekt')).toBe(true); // trifft projekt/unter
    expect(matchWith('FROM #projekt/unter')).toBe(true);
    expect(matchWith('FROM #wichtig')).toBe(true);
    expect(matchWith('FROM #fehlt')).toBe(false);
    expect(matchWith('FROM -#projekt')).toBe(false);
    expect(matchWith('FROM "Projekte" AND -#fehlt')).toBe(true);
  });

  it('Link-Quellen über den Ziel-Resolver', () => {
    const resolveLinkTarget = (t) => {
      if (t === 'Ziel') return new Set(['c:/wurzel/ziel.md']);
      if (t === 'Quelle') return new Set(['c:/wurzel/quelle.md']);
      return new Set();
    };
    // [[Ziel]]: Dateien, die auf Ziel verlinken -> outlinks enthalten Ziel.
    expect(matchWith('FROM [[Ziel]]', { resolveLinkTarget })).toBe(true);
    expect(matchWith('FROM [[Quelle]]', { resolveLinkTarget })).toBe(false);
    // outgoing([[Quelle]]): Dateien, auf die Quelle verlinkt -> inlinks von Quelle.
    expect(matchWith('FROM outgoing([[Quelle]])', { resolveLinkTarget })).toBe(true);
    expect(matchWith('FROM outgoing([[Ziel]])', { resolveLinkTarget })).toBe(false);
    // Ohne Resolver (kein Index-Kontext) matcht keine Link-Quelle.
    expect(matchWith('FROM [[Ziel]]')).toBe(false);
  });

  it('FROM und WHERE müssen beide zutreffen', () => {
    expect(matchWith('FROM #wichtig WHERE file.size > 1000')).toBe(true);
    expect(matchWith('FROM #wichtig WHERE file.size > 9999')).toBe(false);
    expect(matchWith('FROM #fehlt WHERE file.size > 1000')).toBe(false);
  });

  // 4T-001070 (Epic 3E-000211): Selbstbezugs-Quelle. Der Kontext der Träger-Datei
  // steht in ctx.self; die Quelle braucht keinen Ziel-Resolver, weil ihr Ziel
  // der bekannte Pfad der Träger-Datei ist.
  it('Selbstbezugs-Quelle über den Kontext der Träger-Datei', () => {
    // Träger ist 'Ziel' — die Treffer-Datei verlinkt darauf (outlinks).
    const selfZiel = ctxFor({ file: { name: 'Ziel', absPath: 'C:/Wurzel/Ziel.md' } });
    expect(matchesQuery(parseOk('FROM [[]]'), ctxFor({ self: selfZiel }))).toBe(true);
    expect(matchesQuery(parseOk('FROM outgoing([[]])'), ctxFor({ self: selfZiel }))).toBe(false);
    // Träger ist 'Quelle' — sie verlinkt auf die Treffer-Datei (inlinks).
    const selfQuelle = ctxFor({ file: { name: 'Quelle', absPath: 'C:/Wurzel/Quelle.md' } });
    expect(matchesQuery(parseOk('FROM [[]]'), ctxFor({ self: selfQuelle }))).toBe(false);
    expect(matchesQuery(parseOk('FROM outgoing([[]])'), ctxFor({ self: selfQuelle }))).toBe(true);
    // Pfad-Vergleich case-insensitiv (Windows-Dateisystem).
    const selfKlein = ctxFor({ file: { absPath: 'c:/wurzel/ziel.md' } });
    expect(matchesQuery(parseOk('FROM [[]]'), ctxFor({ self: selfKlein }))).toBe(true);
    // OHNE Träger-Kontext: leere Menge, nicht 'alles' (Konzept-Entscheid E2).
    expect(matchWith('FROM [[]]')).toBe(false);
    expect(matchWith('FROM outgoing([[]])')).toBe(false);
  });
});

// --- 4T-001070 (Epic 3E-000211): Selbstbezug als Wert-Zugriff --------------------

describe('perspective-query-eval — Selbstbezug this.', () => {
  const selfCtx = ctxFor({
    props: { status: 'aktiv', prio: '1' },
    file: {
      name: 'Träger',
      folder: 'CRM/Personen',
      path: 'CRM/Personen/Träger.md',
      absPath: 'C:/Wurzel/CRM/Personen/Träger.md',
      tags: ['crm'],
    },
  });

  it('this.file.* und this.<eigenschaft> lösen gegen die Träger-Datei auf', () => {
    const ctx = ctxFor({ props: { status: 'ruht' }, self: selfCtx });
    expect(evaluateExpression(parseQuery('this.file.name', { expression: true }).ast, ctx)).toBe(
      'Träger',
    );
    expect(evaluateExpression(parseQuery('this.file.folder', { expression: true }).ast, ctx)).toBe(
      'CRM/Personen',
    );
    // Frontmatter der Träger-Datei, nicht der Treffer-Zeile.
    expect(evaluateExpression(parseQuery('this.status', { expression: true }).ast, ctx)).toBe(
      'aktiv',
    );
    expect(evaluateExpression(parseQuery('status', { expression: true }).ast, ctx)).toBe('ruht');
    // this.file.link ist ein Link-Wert (Referenz-Anwendungsfall der Analyse).
    expect(evaluateExpression(parseQuery('this.file.link', { expression: true }).ast, ctx)).toEqual(
      {
        kind: 'link',
        path: 'C:/Wurzel/CRM/Personen/Träger.md',
        name: 'Träger',
      },
    );
  });

  it('ohne Träger-Kontext ergibt jeder Selbstbezug null', () => {
    const ctx = ctxFor();
    expect(evaluateExpression(parseQuery('this.file.name', { expression: true }).ast, ctx)).toBe(
      null,
    );
    expect(evaluateExpression(parseQuery('this.status', { expression: true }).ast, ctx)).toBe(null);
  });

  it('nacktes this und verschachteltes this.this sind null, kein Fehler', () => {
    const ctx = ctxFor({ self: selfCtx });
    expect(evaluateExpression(parseQuery('this', { expression: true }).ast, ctx)).toBe(null);
    expect(
      evaluateExpression(parseQuery('this.this.file.name', { expression: true }).ast, ctx),
    ).toBe(null);
  });

  it('gilt im Block- und im Task-Scope gleich (Träger bleibt Träger)', () => {
    const ctx = {
      ...ctxFor({ self: selfCtx }),
      block: { anchor: 'a1', values: { status: 'block-wert' }, updatedMs: NOW },
    };
    // Der Block überschreibt den nackten Namen, nicht den Selbstbezug.
    expect(evaluateExpression(parseQuery('status', { expression: true }).ast, ctx)).toBe(
      'block-wert',
    );
    expect(evaluateExpression(parseQuery('this.status', { expression: true }).ast, ctx)).toBe(
      'aktiv',
    );
  });
});

describe('perspective-query-eval — Validierung und Link-Bedarf', () => {
  it('meldet unbekannte Funktionen und falsche Stelligkeit', () => {
    const unknown = validateQuery(parseOk('WHERE foo(1)'));
    expect(unknown).toMatchObject({ code: 'unknownFunction', name: 'foo' });
    const arity = validateQuery(parseOk('WHERE contains(tags)'));
    expect(arity).toMatchObject({ code: 'functionArity', name: 'contains' });
    expect(validateQuery(parseOk('WHERE contains(tags, "rot")'))).toBeNull();
    // Auch in Spalten- und SORT-Ausdrücken.
    expect(validateQuery(parseOk('TABLE foo(1)'))).toMatchObject({ code: 'unknownFunction' });
    expect(validateQuery(parseOk('LIST SORT foo(1)'))).toMatchObject({ code: 'unknownFunction' });
  });

  it('queryUsesLinks erkennt Link-Felder und Link-Quellen', () => {
    expect(queryUsesLinks(parseOk('WHERE contains(file.outlinks, "x")'))).toBe(true);
    expect(queryUsesLinks(parseOk('WHERE length(file.inlinks) > 0'))).toBe(true);
    expect(queryUsesLinks(parseOk('FROM [[Datei]]'))).toBe(true);
    expect(queryUsesLinks(parseOk('FROM #tag WHERE a = "1"'))).toBe(false);
    expect(queryUsesLinks(parseOk('LIST SORT file.mtime DESC'))).toBe(false);
    // 4T-001070 (Epic 3E-000211): Selbstbezugs-Quelle und Selbstbezug auf die
    // Link-Listen brauchen den Graphen ebenso; ohne diese Erkennung bliebe er
    // ungebaut und beide lieferten still leer.
    expect(queryUsesLinks(parseOk('FROM [[]]'))).toBe(true);
    expect(queryUsesLinks(parseOk('FROM outgoing([[]])'))).toBe(true);
    expect(queryUsesLinks(parseOk('WHERE contains(this.file.outlinks, "x")'))).toBe(true);
    expect(queryUsesLinks(parseOk('WHERE this.status = "aktiv"'))).toBe(false);
  });
});

// --- 4T-000403 (Epic 3E-000076): Ergebnis-Pipeline (SORT/LIMIT) ------------------

describe('perspective-query-eval — Ergebnis-Pipeline', () => {
  // Kontext-Zeile mit Kurzform: Name, Properties, optionale Datei-Felder.
  function row(name, props, fileOver = {}) {
    return ctxFor({
      props,
      file: { name, path: `${name}.md`, absPath: `C:/w/${name}.md`, ...fileOver },
    });
  }
  function pipeline(query, rows) {
    return applyResultPipeline(rows, parseOk(query)).map((c) => c.file.name);
  }

  it('sortiert numerisch (Zahl-Strings), ASC und DESC', () => {
    const rows = [row('A', { prio: '3' }), row('B', { prio: '10' }), row('C', { prio: '2' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['C', 'A', 'B']);
    expect(pipeline('LIST SORT prio DESC', rows)).toEqual(['B', 'A', 'C']);
  });

  it('sortiert Datums-Felder chronologisch', () => {
    const rows = [
      row('Alt', {}, { mtimeMs: NOW - 30 * DAY }),
      row('Neu', {}, { mtimeMs: NOW - DAY }),
      row('Mittel', {}, { mtimeMs: NOW - 10 * DAY }),
    ];
    expect(pipeline('LIST SORT file.mtime', rows)).toEqual(['Alt', 'Mittel', 'Neu']);
    expect(pipeline('LIST SORT file.mtime DESC', rows)).toEqual(['Neu', 'Mittel', 'Alt']);
  });

  it('sortiert Strings locale-bewusst und case-insensitiv', () => {
    const rows = [row('1', { t: 'zebra' }), row('2', { t: 'Äpfel' }), row('3', { t: 'banane' })];
    expect(pipeline('LIST SORT t', rows)).toEqual(['2', '3', '1']);
  });

  it('Mehrfach-Sortierung: zweiter Schlüssel entscheidet bei Gleichstand', () => {
    const rows = [
      row('A', { grp: '1', prio: '2' }),
      row('B', { grp: '1', prio: '1' }),
      row('C', { grp: '0', prio: '9' }),
    ];
    expect(pipeline('LIST SORT grp, prio', rows)).toEqual(['C', 'B', 'A']);
    expect(pipeline('LIST SORT grp, prio DESC', rows)).toEqual(['C', 'A', 'B']);
  });

  it('fehlende Werte sortieren unabhängig von der Richtung ans Ende', () => {
    const rows = [row('Ohne', {}), row('B', { prio: '2' }), row('A', { prio: '1' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['A', 'B', 'Ohne']);
    expect(pipeline('LIST SORT prio DESC', rows)).toEqual(['B', 'A', 'Ohne']);
  });

  it('Tiebreak über den Datei-Pfad, deterministisch', () => {
    const rows = [row('B', { prio: '1' }), row('A', { prio: '1' })];
    expect(pipeline('LIST SORT prio', rows)).toEqual(['A', 'B']);
  });

  it('LIMIT schneidet nach der Sortierung; ohne SORT bleibt die Basis-Ordnung', () => {
    const rows = [row('A', { prio: '3' }), row('B', { prio: '1' }), row('C', { prio: '2' })];
    expect(pipeline('LIST SORT prio LIMIT 2', rows)).toEqual(['B', 'C']);
    expect(pipeline('LIST LIMIT 2', rows)).toEqual(['A', 'B']);
    expect(pipeline('LIST LIMIT 0', rows)).toEqual([]);
    expect(pipeline('LIST', rows)).toEqual(['A', 'B', 'C']);
  });
});

// --- 4T-000404 (Epic 3E-000076): Anzeige-Segmente und Ausdrucks-Quelltext --------

describe('perspective-query-eval — Segmente und Quelltext', () => {
  it('formatValueSegments: Text, Links und kommagetrennte Listen', () => {
    expect(formatValueSegments('offen')).toEqual([{ text: 'offen' }]);
    expect(formatValueSegments(null)).toEqual([]);
    expect(formatValueSegments({ kind: 'link', path: 'C:/w/Z.md', name: 'Z' })).toEqual([
      { link: { path: 'C:/w/Z.md', name: 'Z' } },
    ]);
    expect(formatValueSegments(['a', { kind: 'link', path: 'p', name: 'n' }])).toEqual([
      { text: 'a' },
      { text: ', ' },
      { link: { path: 'p', name: 'n' } },
    ]);
    expect(formatValueSegments({ kind: 'date', ms: new Date(2026, 6, 8).getTime() })).toEqual([
      { text: '2026-07-08' },
    ]);
  });

  // 4T-001074 (Epic 3E-000211): Hervorhebung als Segment-Liste (Entscheid E10).
  it('bold: jedes Segment trägt die Marke, Links bleiben Links', () => {
    const segs = (s, over) => formatValueSegments(evaluateExpression(exprOf(s), ctxFor(over)));
    expect(segs('bold("48 Tage")')).toEqual([{ text: '48 Tage', bold: true }]);
    // Link-Segmente werden mit-ausgezeichnet und bleiben Link-Segmente.
    expect(segs('bold(file.link)', { file: { name: 'Alpha', absPath: 'C:/W/Alpha.md' } })).toEqual([
      { link: { path: 'C:/W/Alpha.md', name: 'Alpha' }, bold: true },
    ]);
    // Ein fehlender Wert bleibt fehlend, statt eine leere Hervorhebung zu geben.
    expect(evaluateExpression(exprOf('bold(fehlt)'), ctxFor({ props: {} }))).toBe(null);
    // bold(bold(x)) ist wirkungsgleich mit bold(x).
    expect(segs('bold(bold("x"))')).toEqual([{ text: 'x', bold: true }]);
  });

  it('bold: Verkettung mischt markierte und unmarkierte Anteile', () => {
    const segs = (s, over) => formatValueSegments(evaluateExpression(exprOf(s), ctxFor(over)));
    // Das Referenz-Muster in seiner Ziel-Formulierung: nur der Tages-Teil fett.
    expect(
      segs('file.day + " — " + bold(days(date(2026-04-18) - file.day) + " Tage")', {
        file: { name: '2026-03-01' },
      }),
      // Zwei Segmente, nicht drei: `+` ist linksassoziativ, die beiden
      // unmarkierten Teile sind schon zu einer Zeichenkette verschmolzen,
      // bevor der ausgezeichnete Teil dazukommt.
    ).toEqual([{ text: '2026-03-01 — ' }, { text: '48 Tage', bold: true }]);
    // Auch andersherum: markiert zuerst, unmarkiert hinten.
    expect(segs('bold("A") + "B"')).toEqual([{ text: 'A', bold: true }, { text: 'B' }]);
    // Ein fehlender Operand macht die ganze Verkettung leer (wie in 4T-001071).
    expect(evaluateExpression(exprOf('bold("A") + fehlt'), ctxFor({ props: {} }))).toBe(null);
  });

  it('bold: Sternchen im Text bleiben wörtlich, keine Markdown-Auswertung', () => {
    const segs = (s, over) => formatValueSegments(evaluateExpression(exprOf(s), ctxFor(over)));
    // Der Kern von Entscheid E10: Marker im Wert werden nicht ausgewertet.
    expect(segs('titel', { props: { titel: '**48 Tage**' } })).toEqual([{ text: '**48 Tage**' }]);
    expect(segs('bold(titel)', { props: { titel: '**x**' } })).toEqual([
      { text: '**x**', bold: true },
    ]);
  });

  it('bold: Vergleich, Ordnung und Text-Form verhalten sich wie ohne Marke', () => {
    const wert = (s, over) => evaluateExpression(exprOf(s), ctxFor(over));
    // string() und die Anzeige-Form tragen keine Marker.
    expect(wert('string(bold("48 Tage"))')).toBe('48 Tage');
    expect(formatValue(wert('bold("48 Tage")'))).toBe('48 Tage');
    // Gleichheit und Ordnung laufen über die Text-Form (Story AK5).
    expect(matchWith('bold(titel) = "abc"', { props: { titel: 'abc' } })).toBe(true);
    expect(matchWith('bold(titel) < "b"', { props: { titel: 'abc' } })).toBe(true);
    expect(matchWith('bold(titel) > "b"', { props: { titel: 'abc' } })).toBe(false);
    // Wahrheitswert ebenso: leerer Text bleibt falsch.
    expect(matchWith('bold(titel)', { props: { titel: 'abc' } })).toBe(true);
    expect(matchWith('bold(titel)', { props: { titel: '' } })).toBe(false);
    // Rechnen mit einem ausgezeichneten Wert bleibt ohne Ergebnis.
    expect(wert('bold("2") * 3')).toBe(null);
  });

  it('formatExprSource: Kopfzeilen-Fallback für Felder, Aufrufe und Arithmetik', () => {
    expect(formatExprSource(parseOk('LIST file.mtime').fields[0].expr)).toBe('file.mtime');
    expect(formatExprSource(parseOk('LIST dateformat(file.mtime, "yyyy")').fields[0].expr)).toBe(
      'dateformat(file.mtime, "yyyy")',
    );
    expect(formatExprSource(parseOk('LIST prio * 2').fields[0].expr)).toBe('prio * 2');
    expect(formatExprSource(parseOk('LIST default(status, "offen")').fields[0].expr)).toBe(
      'default(status, "offen")',
    );
  });
});

// --- 4T-000502 (Epic 3E-000096): relative Datums-Woerter der date(...)-Literale ----

describe('perspective-query-eval — relative Datums-Woerter (4T-000502)', () => {
  // date(<wort>) gegen den injizierten Bezugszeitpunkt NOW (Mi 2026-07-08 12:00).
  const dv = (word) =>
    evaluateExpression(parseOk(`LIST date(${word})`).fields[0].expr, { now: NOW });

  it('Start-Woerter liefern 00:00 des Zieltages', () => {
    expect(dv('today')).toEqual({ kind: 'date', ms: new Date(2026, 6, 8).getTime() });
    expect(dv('tomorrow')).toEqual({ kind: 'date', ms: new Date(2026, 6, 9).getTime() });
    expect(dv('yesterday')).toEqual({ kind: 'date', ms: new Date(2026, 6, 7).getTime() });
    // Woche ab Montag: NOW ist Mittwoch -> sow = Montag 2026-07-06.
    expect(dv('sow')).toEqual({ kind: 'date', ms: new Date(2026, 6, 6).getTime() });
    expect(dv('som')).toEqual({ kind: 'date', ms: new Date(2026, 6, 1).getTime() });
    expect(dv('soy')).toEqual({ kind: 'date', ms: new Date(2026, 0, 1).getTime() });
  });

  it('now liefert den exakten Bezugszeitpunkt', () => {
    expect(dv('now')).toEqual({ kind: 'date', ms: NOW });
  });

  it('End-Woerter liefern das Tages-Ende (23:59:59.999) der Periode', () => {
    // eow = Sonntag 2026-07-12, Tages-Ende (schliesst den letzten Tag ein).
    expect(dv('eow')).toEqual({
      kind: 'date',
      ms: new Date(2026, 6, 12, 23, 59, 59, 999).getTime(),
    });
    expect(dv('eom')).toEqual({
      kind: 'date',
      ms: new Date(2026, 6, 31, 23, 59, 59, 999).getTime(),
    });
    expect(dv('eoy')).toEqual({
      kind: 'date',
      ms: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
    });
  });

  it('als Bereichs-Filter: due <= date(eow) schliesst den letzten Perioden-Tag ein', () => {
    const late = { props: { due: '2026-07-12' } }; // Sonntag, letzter Wochentag
    expect(matchWith('WHERE due <= date(eow)', late)).toBe(true);
    const next = { props: { due: '2026-07-13' } }; // Montag der Folgewoche
    expect(matchWith('WHERE due <= date(eow)', next)).toBe(false);
    expect(matchWith('WHERE due >= date(sow)', { props: { due: '2026-07-06' } })).toBe(true);
  });
});
