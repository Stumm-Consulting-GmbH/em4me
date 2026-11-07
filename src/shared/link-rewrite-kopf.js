// 4T-002503 (Epic 3E-000403): Kopf-Block-Anteil des Umschreibe-Kerns beim
// Umbenennen (src/shared/link-rewrite.js). Wiki-Verweise in Zeichenketten-Werten
// der obersten Ebene und in Zeichenketten-Eintraegen von Listen der obersten
// Ebene ziehen nach wie im Koerper; welche Stellen das sind, sagt
// `kopfVerweisFunde` aus link-scan.js, dieselbe Regel wie im Bereichs-Index und
// im Bedienfeld der ausgehenden Verweise.
//
// **Warum ein eigenes Modul.** Schnitt nach Fachlichkeit, ausgeloest vom
// Zeilen-Budget des Kerns: Hier steht, was allein der Kopf-Block braucht (das
// YAML lesen, die Scan-Zeilen bauen, den neuen Namen in der Schreibweise seines
// YAML-Skalars einsetzen). Der Koerper-Scan und die Ziel-Erkennung
// (collectWikiRewrites) bleiben in link-rewrite.js; der Kern ruft sie und reicht
// ihre Treffer herein, damit kein Ring-Bezug zwischen beiden Modulen entsteht.
//
// Rein string-basiert und Electron-frei wie der Kern; das YAML liest js-yaml
// (wie src/shared/markdown/frontmatter.js) mit demselben Schema wie der Index.
'use strict';

const yaml = require('js-yaml');

const { kopfVerweisFunde } = require('./markdown/link-scan.js');

// --- Verweise im Kopf-Block (4T-002503, Epic 3E-000403) --------------------

// Die Scan-Zeilen der Kopf-Block-Verweise: Map 0-basierter Zeilen-Index ->
// { zeile, spannen }. `zeile` ist die Scan-Zeile, `spannen` sind die Stellen
// der Verweise mit den Anfuehrungszeichen ihres YAML-Skalars ({ von, bis,
// quote }), fuer die Maskierung des eingesetzten Namens (yamlMaskiert).
// Eine Scan-Zeile ist so lang wie die Roh-Zeile und traegt an der
// Stelle jedes Verweises den Match-Text aus `kopfVerweisFunde` (inline-code-
// maskiert wie im Index), sonst Leerzeichen. `collectWikiRewrites` matcht auf
// ihr und ersetzt an denselben Offsets in der Roh-Zeile — wie bei den
// Text-Zellen einer Datentabelle. Alles ausser den Verweisen eines Werts der
// obersten Ebene, also Schluessel, Anfuehrungszeichen, Kommentare und Werte
// verschachtelter Strukturen, bleibt damit ausser Reichweite.
//
// Ein Kopf-Block, den yaml.load nicht liest, wird nicht umgeschrieben: Der
// Index erfasst aus ihm ebenfalls keine Verweise, und die Nachfuehrung haelt
// sich an dasselbe Bild. Das ist kein Fehlerfall des Umbenennens; der Koerper
// derselben Datei zieht unveraendert nach.
function kopfScanZeilen(zeilenTexte, fmStart) {
  const scan = new Map();
  if (fmStart <= 2) return scan; // kein Kopf-Block oder ein leerer
  let daten;
  try {
    daten = yaml.load(zeilenTexte.slice(1, fmStart - 1).join('\n'), { schema: yaml.JSON_SCHEMA });
  } catch {
    return scan; // ungueltiges YAML: kein Nachzug im Kopf-Block (siehe oben)
  }
  for (const fund of kopfVerweisFunde(daten, zeilenTexte, fmStart)) {
    // Nur woertlich gefundene Stellen sind byte-genau ersetzbar; ein Verweis
    // hinter einer YAML-Escape-Folge bleibt stehen.
    if (fund.spalte < 0) continue;
    const roh = zeilenTexte[fund.zeilenIndex];
    const bisher = scan.get(fund.zeilenIndex) || {
      zeile: ' '.repeat(roh.length),
      spannen: [],
    };
    bisher.zeile =
      bisher.zeile.slice(0, fund.spalte) +
      fund.match[0] +
      bisher.zeile.slice(fund.spalte + fund.text.length);
    bisher.spannen.push({
      von: fund.spalte,
      bis: fund.spalte + fund.text.length,
      quote: fund.quote,
      block: fund.block,
      flow: fund.flow,
      skalar: fund.skalar,
    });
    scan.set(fund.zeilenIndex, bisher);
  }
  return scan;
}

// 4T-002503 (Befund B2 des Reviews): Der neue Name steht nach dem Ersetzen im
// YAML-Skalar des Verweises und muss dessen Schreibweise folgen, sonst entsteht
// ungueltiges YAML: in einfachen Anfuehrungszeichen `'` -> `''`, in doppelten
// `\` -> `\\` und `"` -> `\"`. Ein Skalar ohne Anfuehrungszeichen bekommt den
// Namen unveraendert. `hits` zeigen den eingesetzten Text, also maskiert.
function yamlMaskiert(f, spanne) {
  if (!spanne || !spanne.quote) return f;
  const replacement =
    spanne.quote === "'"
      ? f.replacement.replace(/'/g, "''")
      : f.replacement.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return replacement === f.replacement ? f : { ...f, replacement };
}

// 4T-002503 (Befund C3 des Reviews): In einem Skalar ohne Anfuehrungszeichen
// (ausserhalb eines Block-Skalars) macht ein neuer Name mit `: ` oder ` #` das
// YAML ungueltig oder schneidet den Wert ab, in einer Flow-Sammlung ebenso ein
// Name mit `,`, `[`, `]`, `{` oder `}`. Dann wird der ganze Skalar in doppelte
// Anfuehrungszeichen gefasst. Der Wert-Anfang aendert sich beim Umbenennen nie
// (ein Wert, der mit `[[` beginnt, ist in YAML eine Liste und wird nicht
// erfasst), deshalb gibt es keinen weiteren Anlass.
function brauchtAnfuehrung(name, flow) {
  return /:\s|\s#/.test(name) || (flow && /[,[\]{}]/.test(name));
}

// 4T-002503: Die Ersetzungen einer Kopf-Block-Zeile. `treffer` sind die
// Wiki-Ersetzungen, die collectWikiRewrites in link-rewrite.js auf der
// Scan-Zeile (`kopf.zeile`) gefunden hat. Jeder Treffer folgt der
// Schreibweise seines Skalars (yamlMaskiert). Braucht ein Treffer in einem
// Skalar ohne Anfuehrungszeichen das Einfassen (brauchtAnfuehrung), wird der
// Skalar als Ganzes ersetzt: sein Text mit allen Ersetzungen darin, mit `\` und
// `"` maskiert, in doppelten Anfuehrungszeichen. Ist seine Spanne nicht sicher
// bekannt (mehrzeiliger Skalar), bleibt der Verweis stehen, statt das YAML zu
// beschaedigen; der Linter bleibt das Netz.
function kopfErsetzungen(line, kopf, treffer) {
  const roh = treffer.map((f) => ({
    f,
    spanne: kopf.spannen.find((s) => f.spanStart >= s.von && f.spanStart < s.bis) || null,
  }));
  const einfassen = new Map(); // Anfangs-Spalte des Skalars -> Spanne des Skalars
  const unsicher = new Set(); // Treffer, die ohne sicheres Einfassen stehen bleiben
  for (const { f, spanne } of roh) {
    if (!spanne || spanne.quote || spanne.block) continue;
    if (!brauchtAnfuehrung(f.replacement, spanne.flow)) continue;
    if (spanne.skalar) einfassen.set(spanne.skalar.von, spanne.skalar);
    else unsicher.add(f);
  }
  const out = [];
  const teile = new Map(); // Anfangs-Spalte des Skalars -> Treffer darin
  for (const { f, spanne } of roh) {
    if (unsicher.has(f)) continue;
    const skalar = spanne && spanne.skalar;
    if (skalar && einfassen.has(skalar.von)) {
      if (!teile.has(skalar.von)) teile.set(skalar.von, []);
      teile.get(skalar.von).push(f);
    } else {
      out.push(yamlMaskiert(f, spanne));
    }
  }
  for (const [von, skalar] of einfassen) {
    const darin = (teile.get(von) || []).sort((a, b) => a.spanStart - b.spanStart);
    let text = '';
    let pos = skalar.von;
    for (const f of darin) {
      text += line.slice(pos, f.spanStart) + f.replacement;
      pos = f.spanStart + f.spanLen;
    }
    text += line.slice(pos, skalar.bis);
    out.push({
      spanStart: skalar.von,
      spanLen: skalar.bis - skalar.von,
      replacement: '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"',
      typ: 'wiki',
      fullText: line.slice(skalar.von, skalar.bis),
      fullStart: skalar.von,
    });
  }
  return out;
}

module.exports = { kopfScanZeilen, kopfErsetzungen, yamlMaskiert, brauchtAnfuehrung };
