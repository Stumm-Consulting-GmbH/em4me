// 4T-002554 (Epic 3E-000389): Zellbereich aus einer Tabellenkalkulation als
// Pipe-Tabelle. Kleine Zeilen-Zerlegung für Tabulator- und Semikolon-Text der
// Zwischenablage, die Schwelle der Erkennung und der Bau der Tabelle samt ihres
// Einsetzens als eigener Block.
//
// Bewusst klein und OHNE Anspruch auf CSV-Vollständigkeit: Das Lesen von
// CSV-Dateien gehört dem Leser des Daten-Austauschs (Regel «Erkennungen haben
// eine Heimat», Entwicklungsrichtlinien Kapitel 1). Was über die Zwischenablage
// einer Tabellenkalkulation hinausgeht, gehört nicht hierher.
//
// Rein und Electron-/DOM-frei (CJS, wie table-edit.js), damit Renderer und
// Unit-Tests dasselbe Modul nutzen. Die Serialisierung ist die des
// Tabellen-Kerns (serializePipeTable), es gibt keine zweite.
//
// Gemessen am 2026-11-05 (Microsoft Excel, Electron 33, Einfüge-Ereignis):
// Excel legt `text/plain` und `text/html` (mit `<table>`) ab, dazu ein Bild der
// Zellen als Datei. Zeilen enden in `text/plain` auf CRLF, ein Umbruch IN einer
// Zelle ist ein nacktes LF, und nur ein Feld mit Tabulator oder Umbruch steht
// in doppelten Anführungszeichen; ein Wert, der bloß mit einem
// Anführungszeichen beginnt (`"Zitat" vorn`), steht ohne Einfassung da. Eine
// leere erste Zelle lässt die Zeile mit dem Trennzeichen beginnen.
'use strict';

const { serializePipeTable } = require('./table-edit.js');
const { zitatPraefixWie, zitatTiefe } = require('../block-anchors.js');

const TABULATOR = '\t';
const SEMIKOLON = ';';

// Ein Feld ab Stelle i. Beginnt es mit einem Anführungszeichen und endet die
// Einfassung genau vor einem Trennzeichen, einem Umbruch oder dem Textende,
// ist es ein eingefasstes Feld: Trennzeichen und Umbrüche darin gehören zum
// Wert, ein verdoppeltes Anführungszeichen steht für eines. Sonst ist das
// Anführungszeichen ein gewöhnliches Zeichen des Werts (so legt Excel einen
// Wert ab, der nur mit einem Anführungszeichen beginnt).
function liesFeld(s, i, trenn) {
  const n = s.length;
  if (s[i] === '"') {
    let wert = '';
    let j = i + 1;
    while (j < n) {
      if (s[j] === '"') {
        if (s[j + 1] === '"') {
          wert += '"';
          j += 2;
          continue;
        }
        const danach = s[j + 1];
        if (j + 1 >= n || danach === trenn || danach === '\r' || danach === '\n') {
          return { wert, ende: j + 1 };
        }
        break;
      }
      wert += s[j];
      j++;
    }
  }
  let j = i;
  while (j < n && s[j] !== trenn && s[j] !== '\r' && s[j] !== '\n') j++;
  return { wert: s.slice(i, j), ende: j };
}

// Zerlegt Text in Zeilen und Felder. Zeilen enden an CRLF, CR oder LF; am Ende
// stehende leere Zeilen (ein einzelnes leeres Feld) werden verworfen.
function zerlegeZellbereich(text, trennzeichen = TABULATOR) {
  const s = String(text ?? '');
  const trenn = trennzeichen === SEMIKOLON ? SEMIKOLON : TABULATOR;
  const zeilen = [];
  if (s === '') return zeilen;
  let zeile = [];
  let i = 0;
  for (;;) {
    const { wert, ende } = liesFeld(s, i, trenn);
    zeile.push(wert);
    i = ende;
    if (i >= s.length) {
      zeilen.push(zeile);
      break;
    }
    if (s[i] === trenn) {
      i++;
      continue;
    }
    i += s[i] === '\r' && s[i + 1] === '\n' ? 2 : 1;
    zeilen.push(zeile);
    zeile = [];
    if (i >= s.length) break;
  }
  while (zeilen.length > 0) {
    const letzte = zeilen[zeilen.length - 1];
    if (letzte.length === 1 && letzte[0] === '') zeilen.pop();
    else break;
  }
  return zeilen;
}

// Liefert die HTML-Form der Zwischenablage eine Tabelle? Das HTML wird nur als
// Erkennungs-Signal gelesen, nie dargestellt.
function hatTabellenForm(html) {
  return /<table[\s>]/i.test(String(html ?? ''));
}

// Das häufigere der beiden Trennzeichen außerhalb eingefasster Felder; bei
// Gleichstand der Tabulator.
function waehleTrennzeichen(text) {
  const s = String(text ?? '');
  let tab = 0;
  let semi = 0;
  let eingefasst = false;
  for (const c of s) {
    if (c === '"') eingefasst = !eingefasst;
    else if (!eingefasst && c === TABULATOR) tab++;
    else if (!eingefasst && c === SEMIKOLON) semi++;
  }
  return semi > tab ? SEMIKOLON : TABULATOR;
}

// Die Schwelle der Erkennung (Entscheidung T3 des Epics). Liefert die
// zerlegten Zeilen oder null.
//   - mindestens zwei Zeilen und zwei Spalten, jede Zeile gleich viele Felder;
//   - mit `tabellenForm` (Vorgabe, Strg+V und Kontextmenü «Einfügen»): die
//     HTML-Form enthält ein `<table>`-Element;
//   - ohne Tabellen-Form (Kommando «Als Tabelle einfügen»): zusätzlich beginnt
//     keine Zeile mit dem Trennzeichen, damit Code mit Tabulator-Einzug Text
//     bleibt. Mit Tabellen-Form entfällt diese Bedingung, weil eine leere erste
//     Zelle die Zeile genau so beginnen lässt (gemessen, siehe Kopf).
function zellbereichAus({ text, html } = {}, { tabellenForm = true, trennzeichen } = {}) {
  if (tabellenForm && !hatTabellenForm(html)) return null;
  const s = String(text ?? '');
  const trenn = trennzeichen || TABULATOR;
  const zeilen = zerlegeZellbereich(s, trenn);
  if (zeilen.length < 2) return null;
  const spalten = zeilen[0].length;
  if (spalten < 2) return null;
  if (!zeilen.every((z) => z.length === spalten)) return null;
  if (!tabellenForm) {
    if (s.split(/\r\n|\r|\n/).some((z) => z.startsWith(trenn))) return null;
  }
  return zeilen;
}

function istZellbereich(eingabe, optionen) {
  return zellbereichAus(eingabe, optionen) !== null;
}

// Ein senkrechter Strich bekommt einen Schutz-Strich, wenn er nicht schon
// geschützt ist (ungerade Zahl Rückstriche davor); sonst bliebe er eine
// Zellgrenze und zerbräche die Tabelle (Entscheidung T7: nur er wird geschützt).
function schuetzeStriche(wert) {
  let aus = '';
  let rueck = 0;
  for (const c of wert) {
    if (c === '|' && rueck % 2 === 0) aus += '\\';
    aus += c;
    rueck = c === '\\' ? rueck + 1 : 0;
  }
  return aus;
}

// Eine Zelle: Umbruch zu einem Leerzeichen (Entscheidung T4), getrimmt,
// senkrechter Strich geschützt.
function zellText(wert) {
  return schuetzeStriche(
    String(wert ?? '')
      .replace(/[ \t]*(\r\n|\r|\n)[ \t]*/g, ' ')
      .trim(),
  );
}

// Baut die Zeilen einer Pipe-Tabelle; die erste Zeile ist die Kopfzeile, kurze
// Zeilen werden mit leeren Zellen aufgefüllt.
function alsPipeTabelle(zeilen) {
  const liste = Array.isArray(zeilen) ? zeilen : [];
  const columnCount = liste.reduce((m, z) => Math.max(m, z.length), 1);
  const fuelle = (z) => {
    const r = z.map(zellText);
    while (r.length < columnCount) r.push('');
    return r;
  };
  const [kopf = [], ...rumpf] = liste;
  return serializePipeTable({
    header: fuelle(kopf),
    align: new Array(columnCount).fill(null),
    rows: rumpf.map(fuelle),
    columnCount,
  });
}

// Setzt die Tabellen-Zeilen an die Stelle des Bereichs [von, bis) im Text,
// als eigenen Block: Steht davor oder danach auf derselben Zeile Inhalt, kommt
// die Tabelle auf eigene Zeilen; zu Nachbar-Zeilen mit Inhalt steht eine
// Leerzeile. In einem Zitat oder einer Hinweis-Box trägt jede neue Zeile das
// Präfix der Ziel-Zeile, die Leerzeile das Präfix ohne Leerraum.
// Liefert { from, to, insert, cursor } (cursor: Ende der letzten Tabellen-Zeile).
function alsBlockEinsetzen(text, von, bis, tabellenZeilen) {
  const s = String(text ?? '');
  const zeilenAnfang = s.lastIndexOf('\n', von - 1) + 1;
  const umbruchDanach = s.indexOf('\n', bis);
  const zeilenEnde = umbruchDanach < 0 ? s.length : umbruchDanach;
  const kopf = s.slice(zeilenAnfang, von);
  const fuss = s.slice(bis, zeilenEnde);
  const ziel = kopf + fuss;
  const praefix = zitatTiefe(ziel) > 0 ? zitatPraefixWie(ziel, ziel) : '';
  const leerZeile = praefix.trimEnd();
  const leer = (zeile) => {
    const rest = zitatTiefe(zeile) > 0 ? zeile.slice(zitatPraefixWie(zeile, zeile).length) : zeile;
    return rest.trim() === '';
  };
  const aus = [];
  if (!leer(kopf)) {
    aus.push(kopf.trimEnd(), leerZeile);
  } else if (zeilenAnfang > 0) {
    const vorher = s.slice(s.lastIndexOf('\n', zeilenAnfang - 2) + 1, zeilenAnfang - 1);
    if (!leer(vorher)) aus.push(leerZeile);
  }
  for (const z of tabellenZeilen) aus.push(praefix + z);
  const cursorZeile = aus.length - 1;
  if (!leer(fuss)) {
    aus.push(leerZeile, praefix + fuss.trimStart());
  } else if (zeilenEnde < s.length) {
    const naechstesEnde = s.indexOf('\n', zeilenEnde + 1);
    const danach = s.slice(zeilenEnde + 1, naechstesEnde < 0 ? s.length : naechstesEnde);
    if (!leer(danach)) aus.push(leerZeile);
  }
  let cursor = zeilenAnfang;
  for (let k = 0; k <= cursorZeile; k++) cursor += aus[k].length + (k < cursorZeile ? 1 : 0);
  return { from: zeilenAnfang, to: zeilenEnde, insert: aus.join('\n'), cursor };
}

module.exports = {
  TABULATOR,
  SEMIKOLON,
  zerlegeZellbereich,
  hatTabellenForm,
  waehleTrennzeichen,
  zellbereichAus,
  istZellbereich,
  alsPipeTabelle,
  alsBlockEinsetzen,
};
