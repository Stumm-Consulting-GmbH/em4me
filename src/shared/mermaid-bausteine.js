// 4T-002617 (Epic 3E-000391): Katalog und reine Funktionen der Mermaid-Bausteine.
//
// Prozessneutral (CJS, ohne Electron, ohne DOM) wie markdown-format.js, damit
// Katalog, Kennungen, Einrückung und Einfüge-Änderungen ohne Oberfläche prüfbar
// sind. Die Änderungen haben das Format von markdown-format.js:
// { changes: [{ from, to, insert }], selFrom, selTo } mit absoluten Offsets der
// Auswahl nach der Änderung; der Renderer dispatcht sie in einem Schritt.
//
// Schablonen-Zeichen (V1 bis V4 des Epics):
//   <n>      nächste freie Zahl zum Buchstaben des Bausteins (V2)
//   <a> <b>  die beiden zuletzt angelegten Kennungen der eigenen Muster (V3)
//   <heute>  Tagesdatum JJJJ-MM-TT, vom Aufrufer hineingereicht
//   {name}   Platzhalter-Text aus den Sprachdateien (mermaid.bausteine.platzhalter.name)
// Führende Leerzeichen einer Schablonen-Zeile sind die zusätzliche Einrückung
// innerer Zeilen mehrzeiliger Bausteine (V5).
'use strict';

const PLATZHALTER_PRAEFIX = 'mermaid.bausteine.platzhalter.';

// Alle Namen der Text-Platzhalter; je Name ein Schlüssel in den fünf Fragmenten
// src/i18n/fragments/<code>/editor.json. Die Texte enthalten keines der in
// Mermaid bedeutsamen Zeichen (V4).
const PLATZHALTER = [
  'start',
  'ende',
  'schritt',
  'frage',
  'ja',
  'teilnehmer',
  'nachricht',
  'antwort',
  'bedingung',
  'fall',
  'sonst',
  'plan',
  'abschnitt',
  'aufgabe',
  'meilenstein',
  'klasse',
  'attribut',
  'methode',
];

// Der Katalog aus V1, Reihenfolge der Arten wie in der Auswahl. `buchstaben`
// sind die eigenen Kennungs-Muster der Art (V2), `neueKennung` die Zeile, mit
// der ein verbindender Baustein fehlende Bezüge anlegt (V3; beim Zeitplan
// keine, dort tritt `ohneBezug` an die Stelle).
const KATALOG = {
  flowchart: {
    kopf: 'flowchart TD',
    buchstaben: ['N'],
    neueKennung: 'N<n>[{schritt}]',
    geruest: ['N1[{start}] --> N2[{ende}]'],
    bausteine: [
      { id: 'knoten', buchstabe: 'N', zeilen: ['N<n>[{schritt}]'] },
      { id: 'verzweigung', buchstabe: 'N', zeilen: ['N<n>{{frage}}'] },
      { id: 'verbindung', bezuege: 2, zeilen: ['<a> --> <b>'] },
      { id: 'beschriftet', bezuege: 2, zeilen: ['<a> -->|{ja}| <b>'] },
    ],
  },
  sequenceDiagram: {
    kopf: 'sequenceDiagram',
    buchstaben: ['T'],
    neueKennung: 'participant T<n> as {teilnehmer} <n>',
    geruest: [
      'participant T1 as {teilnehmer} 1',
      'participant T2 as {teilnehmer} 2',
      'T1->>T2: {nachricht}',
    ],
    bausteine: [
      { id: 'teilnehmer', buchstabe: 'T', zeilen: ['participant T<n> as {teilnehmer} <n>'] },
      { id: 'nachricht', bezuege: 2, zeilen: ['<a>->><b>: {nachricht}'] },
      { id: 'antwort', bezuege: 2, zeilen: ['<b>-->><a>: {antwort}'] },
      {
        id: 'schleife',
        bezuege: 2,
        zeilen: ['loop {bedingung}', '  <a>->><b>: {nachricht}', 'end'],
      },
      {
        id: 'alternative',
        bezuege: 2,
        zeilen: [
          'alt {fall}',
          '  <a>->><b>: {nachricht}',
          'else {sonst}',
          '  <b>-->><a>: {antwort}',
          'end',
        ],
      },
    ],
  },
  gantt: {
    kopf: 'gantt',
    buchstaben: ['A', 'M'],
    neueKennung: null,
    geruest: [
      'title {plan}',
      'dateFormat YYYY-MM-DD',
      'section {abschnitt}',
      '{aufgabe} :A1, <heute>, 3d',
    ],
    bausteine: [
      { id: 'abschnitt', zeilen: ['section {abschnitt}'] },
      {
        id: 'aufgabe',
        buchstabe: 'A',
        bezuege: 1,
        zeilen: ['{aufgabe} :A<n>, after <b>, 3d'],
        ohneBezug: ['{aufgabe} :A<n>, <heute>, 3d'],
      },
      {
        id: 'meilenstein',
        buchstabe: 'M',
        bezuege: 1,
        zeilen: ['{meilenstein} :milestone, M<n>, after <b>, 0d'],
        ohneBezug: ['{meilenstein} :milestone, M<n>, <heute>, 0d'],
      },
    ],
  },
  classDiagram: {
    kopf: 'classDiagram',
    buchstaben: ['K'],
    neueKennung: 'class K<n>["{klasse} <n>"]',
    geruest: ['class K1["{klasse} 1"]', 'class K2["{klasse} 2"]', 'K1 <|-- K2'],
    bausteine: [
      { id: 'klasse', buchstabe: 'K', zeilen: ['class K<n>["{klasse} <n>"]'] },
      {
        id: 'mitglieder',
        buchstabe: 'K',
        zeilen: ['class K<n>["{klasse} <n>"] {', '  +{attribut}', '  +{methode}()', '}'],
      },
      { id: 'vererbung', bezuege: 2, zeilen: ['<a> <|-- <b>'] },
      { id: 'beziehung', bezuege: 2, zeilen: ['<a> --> <b>'] },
      { id: 'teilVon', bezuege: 2, zeilen: ['<a> *-- <b>'] },
    ],
  },
};

const ARTEN = Object.keys(KATALOG);

// Platzhalter-Texte aus einer Übersetzungs-Funktion (Renderer: t()).
function platzhalterTexte(t) {
  const texte = {};
  for (const name of PLATZHALTER) texte[name] = t(PLATZHALTER_PRAEFIX + name);
  return texte;
}

// --- Diagramm-Art (V6) ---------------------------------------------------------

// Erste Körper-Zeile, die die Art trägt: nicht leer, kein Mermaid-Kommentar
// (`%%`) und nicht in einem Vorspann aus `---`-Zeilen. Liefert den Index dieser
// Zeile und ihr erstes Wort, `graph` als `flowchart`; ohne solche Zeile null.
function artAusKoerper(zeilen) {
  let i = 0;
  while (i < zeilen.length && zeilen[i].trim() === '') i++;
  if (i < zeilen.length && zeilen[i].trim() === '---') {
    i++;
    while (i < zeilen.length && zeilen[i].trim() !== '---') i++;
    i++;
  }
  for (; i < zeilen.length; i++) {
    const s = zeilen[i].trim();
    if (s === '' || s.startsWith('%%')) continue;
    const wort = s.split(/\s+/)[0];
    return { art: wort === 'graph' ? 'flowchart' : wort, kopfIndex: i };
  }
  return null;
}

// --- Kennungen (V2, V3) --------------------------------------------------------

function kennungsMuster(buchstaben) {
  return new RegExp(`\\b([${buchstaben.join('')}])(\\d+)\\b`, 'g');
}

// Nächste freie Zahl zu einem Buchstaben: größte als ganzes Wort vorkommende
// Zahl plus eins, sonst 1.
function naechsteKennung(koerper, buchstabe) {
  let max = 0;
  for (const m of koerper.matchAll(kennungsMuster([buchstabe]))) {
    max = Math.max(max, parseInt(m[2], 10));
  }
  return max + 1;
}

// Kennungen der eigenen Muster in Reihenfolge ihres ersten Auftretens.
function kennungenInReihenfolge(koerper, buchstaben) {
  const gesehen = new Set();
  const liste = [];
  for (const m of koerper.matchAll(kennungsMuster(buchstaben))) {
    if (!gesehen.has(m[0])) {
      gesehen.add(m[0]);
      liste.push(m[0]);
    }
  }
  return liste;
}

// --- Einrückung (V5) -----------------------------------------------------------

function fuehrenderLeerraum(zeile) {
  return /^[ \t]*/.exec(zeile)[0];
}

// Zeilen-Grenzen [von, bis) um eine Stelle.
function zeileUm(text, pos) {
  const von = text.lastIndexOf('\n', pos - 1) + 1;
  const ende = text.indexOf('\n', pos);
  return { von, bis: ende === -1 ? text.length : ende };
}

// Einrückung eines Bausteins an der Stelle `pos` im Körper [koerperVon,
// koerperBis]: die der Zeile der Schreibmarke; ist sie leer, die der nächsten
// nicht-leeren Körper-Zeile darüber; ist das die Kopfzeile, deren Einrückung
// plus zwei Leerzeichen. Steht die Schreibmarke selbst auf der Kopfzeile, gilt
// ebenso deren Einrückung plus zwei, weil der Baustein darunter entsteht.
function einrueckungFuer(text, pos, koerperVon, koerperBis) {
  const zeilen = text.slice(koerperVon, koerperBis).split('\n');
  const kopf = artAusKoerper(zeilen);
  const kopfIndex = kopf ? kopf.kopfIndex : -1;
  let index = text.slice(koerperVon, zeileUm(text, pos).von).split('\n').length - 1;
  while (index >= 0 && zeilen[index].trim() === '') index--;
  if (index < 0) return '  ';
  const leer = fuehrenderLeerraum(zeilen[index]);
  return index === kopfIndex ? leer + '  ' : leer;
}

// --- Schablonen ausfüllen ------------------------------------------------------

// Füllt Schablonen-Zeilen aus und merkt die Lage des ersten Platzhalter-Texts
// als [Zeile, Spalte, Länge] im Ergebnis.
function ausfuellen(zeilen, werte, texte) {
  let erster = null;
  const aus = zeilen.map((zeile, zi) => {
    let ergebnis = '';
    const teile = zeile.split(/(\{\w+\}|<\w+>)/);
    for (const teil of teile) {
      let wert = teil;
      const text = /^\{(\w+)\}$/.exec(teil);
      const zeichen = /^<(\w+)>$/.exec(teil);
      if (text) {
        wert = texte[text[1]];
        if (wert === undefined) throw new Error(`Platzhalter-Text fehlt: ${text[1]}`);
        if (!erster) erster = [zi, ergebnis.length, wert.length];
      } else if (zeichen && zeichen[1] in werte) {
        wert = String(werte[zeichen[1]]);
      }
      ergebnis += wert;
    }
    return ergebnis;
  });
  return { zeilen: aus, erster };
}

// Absolute Auswahl aus der Lage des ersten Platzhalters; ohne Platzhalter
// steht die Schreibmarke am Ende des Eingefügten.
function auswahl(start, zeilen, erster, ende) {
  if (!erster) return { selFrom: ende, selTo: ende };
  let off = start;
  for (let i = 0; i < erster[0]; i++) off += zeilen[i].length + 1;
  off += erster[1];
  return { selFrom: off, selTo: off + erster[2] };
}

// --- Gerüst (V5) ---------------------------------------------------------------

// Leerzeilen-Puffer vor und nach dem Block: dieselbe Regel wie bei Tabelle,
// Linie und Quelltext-Block (blockPadding aus markdown-format.js).
const { blockPadding: blockPuffer } = require('./markdown-format.js');

// Gerüst einer Art als neuer Zaun an der Schreibmarke. Der ganze Zaun bekommt
// die Einrückung der Zeile der Schreibmarke; eine Zeile nur aus Leerraum wird
// dabei ersetzt, damit der Zaun am Zeilen-Anfang beginnt. Ausgewählt ist der
// erste Platzhalter-Text.
function geruestEinfuegen(text, pos, art, { texte, heute }) {
  const eintrag = Object.hasOwn(KATALOG, art) ? KATALOG[art] : null;
  if (!eintrag) throw new Error(`Unbekannte Diagramm-Art: ${art}`);
  const zeile = zeileUm(text, pos);
  const zeilenText = text.slice(zeile.von, zeile.bis);
  const leer = fuehrenderLeerraum(zeilenText);
  const nurLeerraum = zeilenText.trim() === '';
  const von = nurLeerraum ? zeile.von : pos;
  const bis = nurLeerraum ? zeile.bis : pos;
  const rest = text.slice(0, von) + text.slice(bis);
  const { zeilen, erster } = ausfuellen(
    ['```mermaid', eintrag.kopf, ...eintrag.geruest.map((z) => '  ' + z), '```'],
    { heute },
    texte,
  );
  const mitEinzug = zeilen.map((z) => leer + z);
  const { lead, trail } = blockPuffer(rest, von);
  const insert = lead + mitEinzug.join('\n') + trail;
  const start = von + lead.length;
  const sel = erster
    ? auswahl(start, mitEinzug, [erster[0], erster[1] + leer.length, erster[2]], start)
    : { selFrom: start, selTo: start };
  return { changes: [{ from: von, to: bis, insert }], ...sel };
}

// --- Baustein (V3, V5) ---------------------------------------------------------

// Baustein einer Art an der Schreibmarke im Körper [koerperVon, koerperBis].
// Eine leere Zeile wird ersetzt, sonst entsteht der Baustein als neue Zeile
// darunter. Fehlende Bezüge legt er mit `neueKennung` der Art an.
function bausteinEinfuegen(text, pos, art, bausteinId, opts) {
  const { texte, heute, koerperVon, koerperBis } = opts;
  const eintrag = Object.hasOwn(KATALOG, art) ? KATALOG[art] : null;
  const baustein = eintrag && eintrag.bausteine.find((b) => b.id === bausteinId);
  if (!baustein) throw new Error(`Unbekannter Baustein: ${art}/${bausteinId}`);
  const koerper = text.slice(koerperVon, koerperBis);
  const vorhanden = kennungenInReihenfolge(koerper, eintrag.buchstaben);
  const naechste = {};
  for (const b of eintrag.buchstaben) naechste[b] = naechsteKennung(koerper, b);
  const vergib = (b) => b + naechste[b]++;

  let vorlage = baustein.zeilen;
  const neu = [];
  const werte = { heute };
  const bezuege = baustein.bezuege || 0;
  if (bezuege > 0) {
    const refs = vorhanden.slice(-bezuege);
    if (refs.length < bezuege && eintrag.neueKennung) {
      const b = eintrag.buchstaben[0];
      while (refs.length < bezuege) {
        const nummer = naechste[b];
        const kennung = vergib(b);
        neu.push({ zeile: eintrag.neueKennung, nummer });
        refs.push(kennung);
      }
    }
    if (refs.length < bezuege) vorlage = baustein.ohneBezug;
    else if (bezuege === 2) [werte.a, werte.b] = refs;
    else werte.b = refs[0];
  }
  if (baustein.buchstabe) werte.n = naechste[baustein.buchstabe];

  const schablone = [];
  const zeilenWerte = [];
  for (const { zeile, nummer } of neu) {
    schablone.push(zeile);
    zeilenWerte.push({ ...werte, n: nummer });
  }
  for (const zeile of vorlage) {
    schablone.push(zeile);
    zeilenWerte.push(werte);
  }
  // Je Zeile mit eigenen Werten ausfüllen, die erste Platzhalter-Lage merken.
  const zeilen = [];
  let erster = null;
  schablone.forEach((z, i) => {
    const r = ausfuellen([z], zeilenWerte[i], texte);
    if (!erster && r.erster) erster = [i, r.erster[1], r.erster[2]];
    zeilen.push(r.zeilen[0]);
  });

  const einzug = einrueckungFuer(text, pos, koerperVon, koerperBis);
  const mitEinzug = zeilen.map((z) => einzug + z);
  const zeile = zeileUm(text, pos);
  const leer = text.slice(zeile.von, zeile.bis).trim() === '';
  const von = leer ? zeile.von : zeile.bis;
  const bis = zeile.bis;
  const insert = (leer ? '' : '\n') + mitEinzug.join('\n');
  const start = von + (leer ? 0 : 1);
  const ende = von + insert.length;
  const sel = erster
    ? auswahl(start, mitEinzug, [erster[0], erster[1] + einzug.length, erster[2]], ende)
    : { selFrom: ende, selTo: ende };
  return { changes: [{ from: von, to: bis, insert }], ...sel };
}

module.exports = {
  PLATZHALTER,
  PLATZHALTER_PRAEFIX,
  KATALOG,
  ARTEN,
  platzhalterTexte,
  artAusKoerper,
  naechsteKennung,
  kennungenInReihenfolge,
  einrueckungFuer,
  geruestEinfuegen,
  bausteinEinfuegen,
};
