// 4T-002838 (Epic 3E-000447): private Kommentare im Rumpf eines Sonder-Blocks
// mit eigener Sprache (Diagramm, Journal-Zeitleiste, Abfrage, Dashboard,
// Mermaid-Diagramm; der Workflow-Block bleibt wörtlich, siehe REGELN). Der Rumpf ist kein Markdown: Es gibt dort
// keinen Code im Sinne der Anzeige, deshalb paart die Block-Regel ohne
// Code-Frage, mit derselben Maskierung und Paarung wie der Fließtext
// (comments.js). Ein Kommentar reicht über Zeilen, nie über den Rumpf hinaus;
// ein unpaariger Marker blendet den Rest des Rumpfs aus. Entfernt wird
// zeilentreu, damit Zeilen-Nummern in Hinweisen des Blocks stimmen.
//
// Blöcke mit Zellen (Perspective Table, Ereignis-Block, Datensatz-Block)
// nehmen diese Regel nicht für den ganzen Rumpf, sondern bereinigen den Text
// jeder Zelle für sich, nach der Zerlegung ihres Blocks (Entscheidung der
// Steuerung vom 2026-11-24 zu Frage 3, Option A): Ein Kommentar verschiebt
// dort keine Spalten und reicht nie über seine Zelle hinaus.
'use strict';

const { markerStellen, paareOhneCode } = require('./comments.js');
const {
  parsePerspectiveTableCellAttrs,
  extractPerspectiveTableStatusClass,
} = require('../perspective-table-syntax.js');
const { zaunOeffnung, schliesstZaun } = require('../fence-level.js');

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

// --- Regeln je Block-Art -------------------------------------------------------
//
// Zellen nehmen die Regel des Fließtexts (stripPercentComments): Ihr Inhalt
// ist Markdown oder wird so geschrieben, und Code-Stücke bleiben wörtlich. Ein
// Kommentar reicht dort nie über die Zelle hinaus. Lazy geladen, weil
// comments.js beim Laden der Pipeline noch nicht vollständig sein kann.
function zelle(text) {
  return require('./comments.js').stripPercentComments(text);
}

// Teilt den Text in Abschnitte, deren jeder an einer Zeile beginnt, für die
// `beginnt(zeile)` gilt; Zeilenenden bleiben am Abschnitt. Der Text vor der
// ersten solchen Zeile ist ein eigener Abschnitt.
function abschnitte(text, beginnt) {
  const zeilen = text.split(/(?<=\n)/);
  const aus = [];
  let aktuell = null;
  for (const zeile of zeilen) {
    if (aktuell === null || beginnt(zeile)) {
      aktuell = { kopf: zeile, text: zeile };
      aus.push(aktuell);
    } else {
      aktuell.text += zeile;
    }
  }
  return aus;
}

// Ereignis-Block: Eine Zeile mit `|` vorn ist ein Eintrag, dessen Zellen am
// unmaskierten `|` enden (Zerlegung wie splitEventRow: `\` schützt das
// folgende Zeichen). Zusammenhängende andere Zeilen nehmen gemeinsam die
// Block-Regel, damit ein Kommentar über mehrere Zeilen als Ganzes verschwindet;
// bleibt er dort offen, reicht er über folgende Einträge bis zu seinem Schluss
// oder zum Ende des Blocks. Eine reine Kommentarzeile wird leer und vom Leser
// übergangen.
function ereignisEintrag(zeile) {
  if (!zeile.includes('%%')) return zeile;
  const teile = [];
  let start = 0;
  for (let i = 0; i < zeile.length; i++) {
    if (zeile[i] === '\\') i++;
    else if (zeile[i] === '|') {
      teile.push(zelle(zeile.slice(start, i)), '|');
      start = i + 1;
    }
  }
  teile.push(zelle(zeile.slice(start)));
  return teile.join('');
}
// Offen ist der Abschnitt bei ungerader Marker-Zahl. Die Marker-Erkennung
// reicht nie über ein Zeilenende, deshalb wird je Zeile gezählt, statt den
// wachsenden Abschnitt neu zu lesen (Zweitblick Runde 2: Aufwand quadratisch).
function ereignisRumpf(text, optionen) {
  const aus = [];
  let lauf = '';
  let marken = 0;
  for (const zeile of text.split(/(?<=\n)/)) {
    if (marken % 2 === 0 && zeile.trimStart().startsWith('|')) {
      if (lauf) aus.push(stripBlockComments(lauf, optionen));
      lauf = '';
      marken = 0;
      aus.push(ereignisEintrag(zeile));
      continue;
    }
    lauf += zeile;
    if (zeile.includes('%%')) marken += markerStellen(zeile).length;
  }
  if (lauf) aus.push(stripBlockComments(lauf, optionen));
  return aus.join('');
}

// Datensatz-Block: Eine Zelle ist eine Zeile mit `|` in Spalte 0 samt ihren
// Folgezeilen (Zerlegung wie parseRecordBlock; eine maskierte Zeile beginnt
// mit `\` und ist damit Folgezeile).
function datensatzRumpf(text) {
  return abschnitte(text, (z) => z.startsWith('|'))
    .map((a) => zelle(a.text))
    .join('');
}

// Perspective Table: Eine Zelle ist eine Zeile mit `|` oder `!` vorn samt
// ihren Folgezeilen; eine Zeile mit `{|`, `|-` oder `|}` steht für sich, die
// Beschriftung `|+` ist eine Zelle. Ein Code-Block in einer Zelle gehört samt
// seinen Zeilen zu ihr. Zerlegung wie parsePerspectiveTableBlock, mit
// denselben Hilfen für Status-Klasse und Attribute. Der Vorspann einer Zelle
// (Zeichen, Status-Klasse, Attribute) bleibt außen vor, damit die Regel des
// Fließtexts einen Code-Block am Anfang des Inhalts als Code erkennt.
const STRUKTUR = /^(?:\{\||\|[-+}])/;
function tabellenRumpf(text) {
  const aus = [];
  let kopf = '';
  let lauf = '';
  let zaun = null;
  const schliesse = () => {
    aus.push(kopf + zelle(lauf));
    kopf = '';
    lauf = '';
  };
  // Öffnung und Schluss eines Code-Blocks nach der einen Zaun-Regel des Hauses.
  const oeffne = (inhalt) => {
    zaun = zaunOeffnung(inhalt.trimStart());
  };
  for (const zeile of text.split(/(?<=\n)/)) {
    const ohneEnde = zeile.replace(/\r?\n$/, '');
    const t = ohneEnde.trimStart();
    if (zaun) {
      lauf += zeile;
      if (schliesstZaun(t, zaun)) zaun = null;
      continue;
    }
    if (/^(?:\{\||[|!])/.test(t)) schliesse();
    if (/^[|!]/.test(t) && !STRUKTUR.test(t)) {
      const inhalt = parsePerspectiveTableCellAttrs(statusRest(t.slice(1).trimStart())).content;
      if (ohneEnde.endsWith(inhalt)) kopf = ohneEnde.slice(0, ohneEnde.length - inhalt.length);
      lauf = zeile.slice(kopf.length);
      oeffne(inhalt);
      continue;
    }
    lauf += zeile;
    if (!STRUKTUR.test(t)) oeffne(t);
  }
  schliesse();
  return aus.join('');
}
const statusRest = (t) => extractPerspectiveTableStatusClass(t).rest;

// Dashboard: Der Inhalt einer Text-Kachel ist Markdown und nimmt die Regel des
// Fließtexts; alles andere (Marker-Zeilen, Abfragen) die Block-Regel, je Lauf
// zusammenhängender Zeilen außerhalb von Text-Kacheln.
const TEXT_KACHEL = /^!kachel[ \t]+text(?:[ \t\r\n]|$)/;
function dashboardRumpf(text, optionen) {
  const aus = [];
  let lauf = '';
  for (const a of abschnitte(text, (z) => z.startsWith('!'))) {
    if (!TEXT_KACHEL.test(a.kopf)) {
      lauf += a.text;
      continue;
    }
    aus.push(stripBlockComments(lauf + a.kopf, optionen), zelle(a.text.slice(a.kopf.length)));
    lauf = '';
  }
  aus.push(stripBlockComments(lauf, optionen));
  return aus.join('');
}

const block = (t, optionen) => stripBlockComments(t, optionen);

// Die Regel je Sprache eines Blocks, mit der Erweiterung, die ihn als eigenen
// Block zeichnet. Ist die Erweiterung aus, zeigt die Anwendung den Block als
// Code, und dort bleibt ein Kommentar stehen wie in jedem Code-Block.
// Die Datentabelle fehlt bewusst, sie gehört zu 4T-002797. Der Workflow-Block
// fehlt ebenfalls bewusst: Seine Ausführung liest den rohen Text der Datei,
// und die Anzeige muss genau das zeigen, was «Starten» ausführt (Entscheidung
// der Steuerung vom 2026-11-24 zu Frage 4, Option A, nach dem Sicherheits-Review).
const REGELN = {
  'perspective-table': { erweiterung: 'perspective-table', regel: tabellenRumpf },
  'perspective-query': { erweiterung: null, regel: block },
  'perspective-journal-timeline': { erweiterung: 'journals', regel: block },
  'perspective-chart': { erweiterung: 'perspective-chart', regel: block },
  'perspective-dashboard': { erweiterung: 'dashboard', regel: dashboardRumpf },
  'perspective-events': { erweiterung: 'events', regel: ereignisRumpf },
  'perspective-records': { erweiterung: 'database', regel: datensatzRumpf },
  mermaid: {
    erweiterung: 'mermaid',
    regel: (t, optionen) => stripBlockComments(t, { ...optionen, mermaid: true }),
  },
};

// Der Rumpf eines Blocks der Sprache `sprache` ohne private Kommentare, oder
// unverändert, wenn die Sprache keine Regel hat oder ihre Erweiterung aus ist.
// `aktiv(id)` sagt, ob eine Erweiterung an ist; die Erweiterung «comments»
// prüft der Aufrufer. `optionen.maskeBehalten` reicht an die Block-Regel durch
// (portabler Export); Zellen behalten die Maskierung ohnehin.
function sonderRumpfOhneKommentare(sprache, rumpf, aktiv, optionen) {
  const r = REGELN[sprache];
  const text = String(rumpf == null ? '' : rumpf);
  if (!r || !text.includes('%%')) return text;
  if (r.erweiterung && !aktiv(r.erweiterung)) return text;
  return r.regel(text, optionen);
}

// Legt eine Hülle um die Zaun-Ausgabe der Instanz `mdInstanz`: Der Zeichner
// bekommt den Rumpf eines Sonder-Blocks ohne private Kommentare, solange die
// Erweiterung «comments» an ist. In der Anzeige (`exportInstanz` falsch)
// ausgenommen sind Ereignis-Block und Diagramm, deren roher Rumpf als Attribut
// für den Abgleich mit dem Dokument mitreist (Ereignis-Editor,
// Diagramm-Bedienung); den Ereignis-Block bereinigt die Pipeline am Zeichner
// der Liste, das Diagramm die Ansicht beim Lesen des Attributs. Die
// Export-Instanz zeichnet die Blöcke, die die Ersetzung der obersten Ebene
// nicht erreicht (etwa in einem Zitat), als Code; dort gilt die Hülle für
// alle Sonder-Blöcke. Der Token bekommt seinen Rumpf nach dem Zeichnen zurück.
const ROH_ALS_ATTRIBUT = new Set(['perspective-events', 'perspective-chart']);
function kommentarFreieRuempfe(mdInstanz, enabled, exportInstanz) {
  const zeichner = mdInstanz.renderer.rules.fence;
  mdInstanz.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/g)[0];
    const roh = token.content;
    const neu =
      enabled('comments') && (exportInstanz || !ROH_ALS_ATTRIBUT.has(lang))
        ? sonderRumpfOhneKommentare(lang, roh, enabled)
        : roh;
    if (neu === roh) return zeichner.call(this, tokens, idx, options, env, self);
    token.content = neu;
    try {
      return zeichner.call(this, tokens, idx, options, env, self);
    } finally {
      token.content = roh;
    }
  };
}

module.exports = {
  blockCommentRanges,
  stripBlockComments,
  sonderRumpfOhneKommentare,
  kommentarFreieRuempfe,
  ereignisRumpf,
  SONDER_SPRACHEN: Object.freeze(Object.keys(REGELN)),
};
