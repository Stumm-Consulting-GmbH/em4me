// 4T-001406 und 4T-001407 (Epic 3E-000244): Nachpflege der Journal-Eigenschaften
// im BESTEHENDEN Eintrags-Bestand. Zwei Gegenstände, ein Modul: die reine
// Ergänzungs-Regel für einen einzelnen Eintrag und die Zuordnung eines
// vorhandenen Datei-Bestands zu den Perioden eines Journals.
//
// Eigenes Modul und nicht der Perioden-Kern: Die Nachpflege ist ein eigener
// Gegenstand mit eigenem Lebenszyklus (Öffnen-Weg und Massen-Kommando), und
// `journal-core.js` ist mit 4T-001413 gerade erst unter sein Budget gebracht
// worden. Die Abhängigkeit ist einseitig — dieses Modul lädt den Kern, nie
// umgekehrt. Ein Re-Export über den Kern wäre bequemer für die Aufrufer, ergäbe
// aber einen Zirkel-Import; die zwei Aufrufer laden deshalb direkt hierher.
'use strict';

const { extractFrontmatter, writeFrontmatter } = require('./markdown/frontmatter');
const { addPeriods, periodAllowed, periodOf, resolveEntryPath } = require('./journal-core.js');
const { pathCompareKey } = require('./platform.js');

// Nachpflege eines BESTEHENDEN Eintrags. Der Gegensatz zu
// applyJournalProperties und die Architekturentscheidung AE2 des Epics: Beim
// Anlegen ist die Anwendung die Quelle der Wahrheit und übersteuert
// gleichnamige Felder der Vorlage; hier enthält die Datei bereits Arbeit des
// Anwenders, und ein abweichender Wert kann seine bewusste Korrektur sein.
// Ergänzt wird deshalb nur, was FEHLT. `geaendert` sagt, ob überhaupt zu
// schreiben ist — ein vollständiger Eintrag wird nicht angefasst, damit sein
// Änderungs-Zeitstempel unberührt bleibt.
function ergaenzeJournalProperties(text, properties) {
  const source = String(text == null ? '' : text);
  const fm = extractFrontmatter(source);
  // Ein defekter Block wird NICHT angefasst. Ohne diese Prüfung gälte seine
  // leere Datenlage als "nichts vorhanden", und das Ergänzen schriebe einen
  // frischen Block, der das Defekte des Anwenders ersetzt — ein stiller
  // Datenverlust genau dort, wo er ohnehin schon ein Problem hat.
  if (fm && fm.parseError) return { geaendert: false, text: source };
  const base =
    fm && fm.data && typeof fm.data === 'object' && !Array.isArray(fm.data) ? fm.data : {};
  const fehlend = {};
  for (const [key, wert] of Object.entries(properties || {})) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) fehlend[key] = wert;
  }
  if (Object.keys(fehlend).length === 0) return { geaendert: false, text: source };
  const result = writeFrontmatter(source, { ...base, ...fehlend });
  return result.ok ? { geaendert: true, text: result.text } : { geaendert: false, text: source };
}

// Obergrenze der Perioden-Läufe je Richtung. Sie greift nur, wenn Dateien im
// Ordner liegen, die zu keiner Periode des Journals gehören — dann läuft die
// Zuordnung sonst bis ans Ende der Zeit. Die Rechnung ist reine Arithmetik ohne
// Dateizugriff; 8000 Tages-Schritte sind rund 22 Jahre und damit weit jenseits
// jedes realen Bestands, kosten aber nur Millisekunden.
const MAX_ZUORDNUNGS_SCHRITTE = 8000;

// Ordnet einen vorhandenen Datei-Bestand den Perioden eines Journals zu.
//
// Die Richtung ist bewusst umgekehrt zu findPeriodForPath: Statt für JEDE Datei
// ein Perioden-Fenster abzusuchen, laufen wir die Perioden ab und schlagen den
// aufgelösten Pfad in der Datei-Menge nach. Das hat drei Vorteile — es gibt kein
// festes Such-Fenster, das einen alten Eintrag verfehlen könnte; es bleibt beim
// Auflösen von Perioden zu Pfaden und damit bei der Architekturentscheidung 5
// (kein Pfad-Parsing); und es terminiert von selbst, sobald jede Datei
// zugeordnet ist.
//
// `relPaths` sind bereichsrelative Pfade ('/'-getrennt); der Abgleich läuft über
// den Vergleichs-Schlüssel der Plattform, also case-insensitiv unter Windows.
// Dateien, die zu keiner Periode gehören, bleiben übrig und erscheinen in
// `uebergangen` — das sind fremde Dateien im selben Ordner, kein Fehler.
//
// Liefert { treffer: [{ relPath, period }], uebergangen: [relPath] }, die
// Treffer von der ältesten zur jüngsten Periode.
function ordneEintraegeZu(journal, relPaths, opts) {
  const offen = new Map();
  for (const p of Array.isArray(relPaths) ? relPaths : []) {
    if (typeof p !== 'string' || p === '') continue;
    offen.set(pathCompareKey(p.replace(/\\/g, '/')), p);
  }
  const leer = { treffer: [], uebergangen: [] };
  if (!journal || offen.size === 0) return { treffer: [], uebergangen: [...offen.values()] };
  const aroundMs = opts && typeof opts.aroundMs === 'number' ? opts.aroundMs : Date.now();
  const start = periodOf(aroundMs, journal.granularity);
  if (!start) return leer;
  const gefunden = [];
  // Eine Periode prüfen: liegt ihr aufgelöster Pfad in der offenen Menge, ist
  // sie ein Treffer und die Datei abgehakt.
  const pruefe = (period) => {
    if (!period || !periodAllowed(journal, period)) return;
    const resolved = resolveEntryPath(journal, period);
    if (!resolved.ok) return;
    const key = pathCompareKey(resolved.relPath);
    if (!offen.has(key)) return;
    gefunden.push({ relPath: offen.get(key), period });
    offen.delete(key);
  };
  pruefe(start);
  for (let i = 1; i <= MAX_ZUORDNUNGS_SCHRITTE && offen.size > 0; i++) {
    pruefe(addPeriods(start, -i));
    if (offen.size === 0) break;
    pruefe(addPeriods(start, i));
  }
  gefunden.sort((a, b) => a.period.startMs - b.period.startMs);
  return { treffer: gefunden, uebergangen: [...offen.values()] };
}

// Statischer Ordner-Präfix eines Journals: der Teil des Ordner-Schemas vor dem
// ersten Platzhalter, auf ganze Pfad-Segmente gekürzt. `Journal/{{date::yyyy}}`
// ergibt `Journal`, `Tagebuch-{{date::yyyy}}/Tag` ergibt '' (die Wurzel), weil
// schon das erste Segment variabel ist. Der Präfix ist der kleinste Ordner, der
// alle Einträge des Journals sicher enthält, und damit der Scan-Bereich der
// Massen-Nachpflege. '' bedeutet die Bereichs-Wurzel.
function ordnerPraefix(journal) {
  const muster = String((journal && journal.folderPattern) || '');
  const bisPlatzhalter = muster.split('{{')[0];
  if (bisPlatzhalter === muster) return muster.replace(/\/+$/, '');
  const segmente = bisPlatzhalter.split('/');
  segmente.pop(); // das angebrochene Segment vor dem Platzhalter entfällt
  return segmente.join('/').replace(/\/+$/, '');
}

module.exports = {
  ergaenzeJournalProperties,
  ordneEintraegeZu,
  ordnerPraefix,
  MAX_ZUORDNUNGS_SCHRITTE,
};
