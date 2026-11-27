// 4T-002797 (Epic 3E-000449): Die reine Block-Regel der privaten Kommentare,
// herausgelöst aus comments-block.js. Sie findet und entfernt die Kommentare im
// Rumpf eines Blocks mit eigener Sprache und kennt keine Block-Art. Eigenes
// Modul, weil die Canvas-Logik diese Regel braucht und comments-block.js
// seinerseits die Canvas-Zerlegung lädt; ohne den Schnitt entstünde ein
// Import-Kreis über Ordner-Grenzen. Regel und Begründung im Kopf von
// comments-block.js, das beide Funktionen unverändert weiterreicht.
'use strict';

const { markerStellen, paareOhneCode } = require('./comments.js');

// Mermaid kennt %% selbst: `%%{ … }%%` ist eine Steuer-Anweisung, und eine
// Zeile, die mit %% beginnt, ist ein Mermaid-Kommentar. Deren Marker nehmen an
// der Paarung nicht teil; eine Mermaid-Kommentarzeile trägt keinen weiteren
// Marker, sonst gilt sie als Zeile mit privatem Kommentar.
function mermaidEigene(src, marker) {
  const aus = new Set();
  for (let k = 0; k < marker.length; k++) {
    const m = marker[k];
    if (src.charCodeAt(m + 2) === 123) {
      // `{`: Steuer-Anweisung bis zum nächsten Marker hinter `}`.
      let n = k + 1;
      while (n < marker.length && src.charCodeAt(marker[n] - 1) !== 125) n++;
      if (n < marker.length) {
        for (let j = k; j <= n; j++) aus.add(j);
        k = n;
        continue;
      }
    }
    const zeilenAnfang = src.lastIndexOf('\n', m - 1) + 1;
    if (!/^[ \t]*$/.test(src.slice(zeilenAnfang, m))) continue;
    let zeilenEnde = src.indexOf('\n', m);
    if (zeilenEnde < 0) zeilenEnde = src.length;
    if (k + 1 < marker.length && marker[k + 1] < zeilenEnde) continue;
    aus.add(k);
  }
  return aus;
}

// Kommentar-Bereiche des Rumpfs als [{ from, to, closed }], aufsteigend.
// optionen.mermaid nimmt die eigenen %%-Zeilen des Mermaid-Diagramms aus.
function blockCommentRanges(text, optionen) {
  const src = String(text == null ? '' : text);
  let marker = markerStellen(src);
  if (!marker.length) return [];
  if (optionen && optionen.mermaid) {
    const aus = mermaidEigene(src, marker);
    if (aus.size) marker = marker.filter((_, k) => !aus.has(k));
  }
  return paareOhneCode(marker, src.length);
}

// Entfernt die Kommentare des Rumpfs zeilentreu. Ein maskierter Marker `\%%`
// steht danach als `%%` da, wie im gezeichneten Fließtext; andere
// Rückstriche bleiben, weil sie in der Sprache des Blocks Bedeutung haben
// können. Mit `optionen.maskeBehalten` bleibt die Maskierung stehen: Der
// portable Export schreibt den Rumpf in Markdown-Text zurück, der danach noch
// einmal gezeichnet wird, und dort muss `\%%` wieder als Maske gelten.
function stripBlockComments(text, optionen) {
  const src = String(text == null ? '' : text);
  if (!src.includes('%%')) return src;
  const ranges = blockCommentRanges(src, optionen);
  const teile = [];
  let pos = 0;
  const entmaske = !(optionen && optionen.maskeBehalten);
  const frei = (a, b) =>
    teile.push(entmaske ? src.slice(a, b).replace(/\\(?=%%)/g, '') : src.slice(a, b));
  for (const b of ranges) {
    frei(pos, b.from);
    teile.push(src.slice(b.from, b.to).replace(/[^\n\r]+/g, ''));
    pos = b.to;
  }
  frei(pos, src.length);
  return teile.join('');
}

module.exports = { blockCommentRanges, stripBlockComments };
