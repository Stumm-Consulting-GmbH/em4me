// 4T-000985 (Epic 3E-000196): aus src/shared/markdown/plugins.js geschnitten.
// Kommentar-Gruppe: die Erkennung der %%-Kommentare und das zeilentreue
// Entfernen. Electron-frei; aufgerufen wird beides direkt aus markdown.js
// (Quelltext-Vorverarbeitung, keine markdown-it-Regel).
'use strict';

const {
  kennung,
  baueCodeFrage,
  MAX_LAENGE,
  MAX_ERGAENZTE_ZELLEN,
} = require('./comments-codefrage.js');

// ---------------------------------------------------------------------------
// 4T-000479 (Epic 3E-000089): %%-Kommentare. Text zwischen %%-Markern (im
// Fließtext und über Zeilen) erscheint in keiner gezeichneten Ansicht und
// keinem Export, bleibt aber im Quelltext. Als Quelltext-Vorverarbeitung statt
// markdown-it-Regel, weil ein Kommentar über Block-Grenzen reicht, auch über
// einen Code-Zaun hinweg, unpaarig bis zum Dokument-Ende wirkt und Code
// trotzdem wörtlich bleiben muss: Eine Regel müsste vor der Block-Gliederung
// paaren, die Code-Stücke im Fließtext aber erst nach ihr kennen.
// findPercentCommentRanges ist die gemeinsame Quelle für das Entfernen
// (renderMarkdown/convertMarkdownPortable in markdown.js) und für Einfärbung
// und Ausblendung im Editor.
//
// 4T-002802 (Epic 3E-000161): eine Code-Erkennung für Anzeige und Kommentare.
// Ob ein Marker in Code liegt, entscheidet allein der Zerleger der Anzeige; die
// Erkennung führt keine eigene Regel für Code-Zäune, eingerückte Code-Blöcke,
// Code-Stücke oder Roh-Blöcke. Die frühere Erkennung (Weg (a) der Steuerung im
// Sicherheits-Review zu 3E-000434) legte dem Zerleger Absatz-Stücke vor und
// gliederte selbst; jede eigene Gliederung entschied an einem Behälter, den sie
// nicht kannte, anders als die Anzeige, und das Fragen je Marker kostete am
// großen Dokument ein Vielfaches der Zeichenzeit.
//
// Verfahren:
// - Kandidaten sind alle nicht maskierten Marker `%%`, gierig von links. Ein
//   Rückstrich vor `%` oder `\` maskiert; Masken gelten auch im Kommentar.
// - Der Zerleger liest das ganze Dokument, jeder zu beurteilende Marker durch
//   eine eindeutige Kennung aus dem privaten Zeichen-Bereich ersetzt (kennung).
//   Als Code zählen Code-Blöcke mit Zaun, eingerückte Code-Blöcke und
//   Code-Stücke im Fließtext (baueCodeFrage). Jede Frage prüft auch, ob die
//   Kennung so zerlegt wird wie der Marker: Die Anzeige zerlegt den Text
//   zusätzlich mit den Markern und vergleicht je Absatz. Weicht ein Absatz ab
//   und ist Code beteiligt, sind seine Kennungen unsicher (belegt: die
//   E-Mail-Erkennung in spitzen Klammern nimmt `%` an, das Zeichen der
//   Kennung nicht). Die Antwort nennt außerdem die Neustart-Stellen (Anfänge
//   der obersten Blöcke, der Einträge oberster Listen, der Blöcke oberster
//   Zitate und der Zeilen oberster Tabellen, istUnterAnfang) und die
//   Definitionen von Verweisen und Fußnoten.
// - Entschieden wird der Reihe nach: Ein Marker wird so beurteilt, wie die
//   Anzeige ihn sähe, wenn die Kommentare vor ihm entfernt sind und der Text ab
//   ihm unverändert folgt. Ein Marker in Code bleibt wörtlich, ein unsicherer
//   führt auf die sichere Seite, jeder andere öffnet einen Kommentar, und der
//   nächste Marker schließt ihn.
// - Nach jedem Kommentar fragt die Erkennung die Anzeige neu, aber nur für
//   den Abschnitt um ihn (Variante B, nach Runde 1 des Sicherheits-Reviews;
//   die frühere eigene Regel, wann das Entfernen nichts ändert, ließ sich mit
//   einem Verweis täuschen). Eine Neustart-Stelle beginnt in der Anzeige mit
//   frischem Zustand, eine Tabellen-Zeile mit Kopf- und Trennzeile ihrer
//   Tabelle davor: Stimmen im Block vor und im Block nach dem Kommentar die
//   Block-Anfänge und die Antworten mit der bisherigen Zerlegung überein und
//   lässt der Kommentar die Kopfzeile einer Tabelle über das Abschnitts-Ende
//   hinaus unberührt, zerlegt die Anzeige alles außerhalb des Abschnitts wie
//   bisher. Sonst wird
//   der Abschnitt verdoppelt, zuletzt bis zum ganzen Dokument. Verweis- und
//   Fußnoten-Definitionen wirken im ganzen Dokument: Der Abschnitt bekommt die
//   bisherigen mit, und steht `]:` im Kommentar oder im Abschnitt, wird das
//   ganze Dokument gefragt.
// - Schluss-Prüfung am fertigen Text in beiden Richtungen: Jeder wörtlich
//   gelassene Marker liegt dort in Code (der erste, der es nicht tut, öffnet
//   einen Kommentar, und ab ihm wird neu entschieden), und kein öffnender
//   Marker liegt dort in Code (ein Verdacht der gemeinsamen Gegenprobe wird
//   mit dem eigenen Kommentar einzeln nachgeprüft).
// - Sichere Seite: Ohne Antwort des Zerlegers, über den Grenzen, bei einem
//   unsicheren Marker oder nach MAX_DURCHGAENGE Durchgängen ohne stimmiges
//   Ergebnis ist alles privat bis zum Dokument-Ende, beginnend am frühesten
//   ungeprüften Marker: am ersten wörtlich gelassenen des Durchgangs, sonst am
//   offenen (ein wörtlich gelassener Marker gilt erst nach der
//   Schluss-Prüfung als geprüft).
// - Ohne Backtick, Tilde, Tabulator und vier Leerzeichen in Folge gibt es
//   keinen Code; dann wird ohne Zerleger gepaart.
// - Zeilenenden liest die Erkennung wie der Zerleger: Ein einzelnes
//   Wagenrücklauf-Zeichen ist ein Zeilenende (4T-002801). Die Angleichung ist
//   längengleich, die Bereiche bleiben Stellen des Originals.
//
// Festlegungen:
// - %% in Code bleibt wörtlich, genau dort, wo die Anzeige Code zeigt, auch in
//   einem eingerückten Code-Block (bis 4T-002802 nicht geschützt; die Ausnahme
//   aus 4T-000479 hatte die Erkennung ohne Zerleger als zu unsicher begründet).
// - In Roh-HTML und Formel-Blöcken ist ein Marker nie Code.
// - Escape \%% ergibt wörtliches %% im Fließtext (die frühe Escape-Regel der
//   Anzeige zeichnet \% als %). Jeder Marker ist einzeln zu maskieren.
// - Ein unpaariger öffnender Marker wirkt bis zum Dokument-Ende.
// - Innerhalb eines Kommentars hat Markdown keine Bedeutung, auch kein
//   Code-Zaun; der nächste nicht maskierte Marker schließt.

// Höchstzahl der Durchgänge: Jeder Durchgang nach dem ersten beginnt an einem
// Marker, den die Schluss-Prüfung als nicht in Code erkannt hat.
const MAX_DURCHGAENGE = 6;
// Längste Eingabe, die dem Zerleger vorgelegt wird, MAX_LAENGE in
// comments-codefrage.js; darüber sichere Seite.
// Aufwand eines Aufrufs: Summe der vorgelegten Zeichen über alle Zerlegungen,
// jede Vorlage zweimal zerlegt (mit Kennungen und mit Markern). Ein Dokument
// mit Kommentaren und wörtlich gelassenen Markern braucht drei Vorlagen des
// ganzen Textes (erste Zerlegung, beide Richtungen der Schluss-Prüfung) und
// dazu je Kommentar einen Abschnitt; ab etwa 2,5 MB gilt für es die sichere
// Seite. Ein Dokument üblicher Größe verbraucht einen kleinen Bruchteil.
const MAX_AUFWAND_ZEICHEN = 8000000;
// Höchstzahl der Marker, die eine Kennung tragen können (zwei Zeichen zu je
// 2048 und 4096 Werten).
const MAX_MARKER = 2048 * 4096;
// Leit-Zeichen der Kennungen: das erste Zeichen dieses Bereichs, das im
// Dokument nicht vorkommt. Kommt keines frei vor, gilt die sichere Seite.
const LEIT_VON = 0xe000;
const LEIT_BIS = 0xe100;

const PORTABEL_KENNZEICHNUNG_RE = /^\s*<!--\s*perspective-portable\s*-->/;

let angemeldeteCodeFrage = null;
let angemeldeteCodeFragePortabel = null;

// Meldet die Code-Fragen der Laufzeit-Welt an: eine für die gewöhnliche und
// eine für die portable Fassung der Anzeige. Eine Code-Frage bekommt den Text
// mit Kennungen und das Leit-Zeichen und liefert die Nummern der Marker, deren
// Kennung in Code liegt, als Feld, oder null ohne Antwort.
function setzeCodeFrage(frage, fragePortabel) {
  angemeldeteCodeFrage = typeof frage === 'function' ? frage : null;
  angemeldeteCodeFragePortabel = typeof fragePortabel === 'function' ? fragePortabel : null;
}

function codeFrageFuer(portabel) {
  return (portabel && angemeldeteCodeFragePortabel) || angemeldeteCodeFrage;
}

// Meldet die Zerleger beider Fassungen der Anzeige als Code-Fragen an.
function meldeZerlegerAn(mdInstanz, mdPortabelInstanz) {
  setzeCodeFrage(baueCodeFrage(mdInstanz), baueCodeFrage(mdPortabelInstanz));
}

// Prüft die Form einer Antwort; liefert sie oder null.
function antwortInForm(antwort) {
  if (Array.isArray(antwort)) return antwort;
  if (
    antwort &&
    typeof antwort === 'object' &&
    Array.isArray(antwort.code) &&
    Array.isArray(antwort.unsicher) &&
    Array.isArray(antwort.bloecke)
  )
    return antwort;
  return null;
}

// Antwort der angemeldeten Code-Frage für Aufrufer ohne eigenen Zerleger (die
// Brücke des Vorab-Skripts). `optionen` wie bei baueCodeFrage; ein Objekt wird
// auf seine bekannten Felder beschränkt. Liefert die Antwort oder null.
function kommentarImCode(text, leit, portabel, optionen) {
  const frage = codeFrageFuer(portabel === true);
  if (!frage) return null;
  const opt =
    optionen !== null && typeof optionen === 'object'
      ? { gliederung: true, definitionen: optionen.definitionen }
      : optionen === true;
  return antwortInForm(frage(text, leit, opt));
}

// Stellen der nicht maskierten Marker, gierig von links.
function kandidaten(src) {
  const marker = [];
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c === 92 && (src.charCodeAt(i + 1) === 37 || src.charCodeAt(i + 1) === 92)) i++;
    else if (c === 37 && src.charCodeAt(i + 1) === 37) {
      marker.push(i);
      i++;
    }
  }
  return marker;
}

// Paarung ohne Code: jeder Marker öffnet oder schließt.
function paareOhneCode(marker, len) {
  const ranges = [];
  for (let k = 0; k < marker.length; k += 2) {
    if (k + 1 < marker.length)
      ranges.push({ from: marker[k], to: marker[k + 1] + 2, closed: true });
    else ranges.push({ from: marker[k], to: len, closed: false });
  }
  return ranges;
}

// Erste Stelle eines aufsteigenden Feldes mit Wert ab `wert`.
function ersterAb(feld, wert) {
  let lo = 0;
  let hi = feld.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (feld[m] < wert) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// Erste Stelle eines aufsteigenden Feldes mit Wert über `wert`.
function ersterUeber(feld, wert) {
  return ersterAb(feld, wert + 1);
}

// Text in der Sicht der Anzeige, Ausschnitt [a, b) des Originals: die Bereiche
// ohne Zeichen (Umbrüche bleiben), die Marker mit istKennung(n) als Kennung,
// übrige Marker wörtlich. Bereiche sind aufsteigend und überlappungsfrei, kein
// Marker als Kennung liegt in einem Bereich, und a und b sind Zeilen-Anfänge
// oder Text-Ende (kein Marker liegt über ihnen).
function sicht(src, marker, ranges, istKennung, leit, a, b) {
  const teile = [];
  let pos = a;
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ranges[m].to <= a) lo = m + 1;
    else hi = m;
  }
  let r = lo;
  let j = ersterAb(marker, a);
  for (;;) {
    while (j < marker.length && marker[j] < b && !istKennung(j)) j++;
    const mStelle = j < marker.length && marker[j] < b ? marker[j] : Infinity;
    const rStelle =
      r < ranges.length && ranges[r].from < b ? Math.max(ranges[r].from, a) : Infinity;
    if (mStelle === Infinity && rStelle === Infinity) break;
    if (rStelle <= mStelle) {
      const ende = Math.min(ranges[r].to, b);
      teile.push(src.slice(pos, rStelle), src.slice(rStelle, ende).replace(/[^\n]+/g, ''));
      pos = ende;
      r++;
    } else {
      teile.push(src.slice(pos, mStelle), kennung(leit, j));
      pos = mStelle + 2;
      j++;
    }
  }
  teile.push(src.slice(pos, b));
  return teile.join('');
}

function waehleLeit(src) {
  for (let c = LEIT_VON; c < LEIT_BIS; c++) {
    const z = String.fromCharCode(c);
    if (!src.includes(z)) return z;
  }
  return null;
}

// Findet die Kommentar-Bereiche als [{ from, to, closed }], aufsteigend und
// überlappungsfrei, in Stellen des übergebenen Textes. `to` schließt den
// schließenden Marker ein; ein unpaariger Kommentar reicht bis zum Ende und
// trägt closed: false. optionen.imCode ersetzt die angemeldete Code-Frage (für
// Prüfungen), mit derselben Form.
function findPercentCommentRanges(text, optionen) {
  // Zeilenenden wie der Zerleger: ein einzelnes Wagenrücklauf-Zeichen wird
  // längengleich zum Zeilenvorschub, ein Paar bleibt (der Zerleger gleicht es
  // selbst an).
  const src = String(text == null ? '' : text).replace(/\r(?!\n)/g, '\n');
  const len = src.length;
  const marker = kandidaten(src);
  if (marker.length === 0) return [];
  if (!/[`~\t]| {4}/.test(src)) return paareOhneCode(marker, len);

  const sichereSeite = (ranges, ab) =>
    ranges.filter((b) => b.to <= ab).concat([{ from: ab, to: len, closed: false }]);

  const portabel = PORTABEL_KENNZEICHNUNG_RE.test(src);
  const frageRoh =
    optionen && typeof optionen.imCode === 'function' ? optionen.imCode : codeFrageFuer(portabel);
  if (!frageRoh || len > MAX_LAENGE || marker.length > MAX_MARKER)
    return sichereSeite([], marker[0]);
  const leit = waehleLeit(src);
  if (!leit) return sichereSeite([], marker[0]);

  // Zeilen-Anfänge; die Sicht behält jeden Umbruch, die Zeilen-Nummern der
  // Anzeige sind also Zeilen des Originals.
  const zeilen = [0];
  for (let p = src.indexOf('\n'); p !== -1; p = src.indexOf('\n', p + 1)) zeilen.push(p + 1);
  const nZeilen = zeilen.length;
  const zeileVon = (stelle) => ersterUeber(zeilen, stelle) - 1;
  const stelleVon = (zeile) => (zeile >= nZeilen ? len : zeilen[zeile]);

  // Schutzgrenze einer Tabelle mit Kopfzeile `kopf` und `spaltenZahl` Spalten:
  // Ihre Zeilen enden spätestens an der ersten Zeile ab dem Kopf, die im
  // Original leer ist. Eine solche Zeile bleibt in jeder Sicht leer, weil eine
  // Sicht nur Zeichen entfernt oder einen Marker durch eine Kennung ersetzt.
  // Jede Zeile ergänzt höchstens `spaltenZahl` Zellen; bleibt das Produkt unter
  // der Obergrenze der Anzeige, kann keine Teilsumme sie erreichen, und die
  // Zeilen hängen nicht von den Zeilen davor ab.
  const leerAb = new Map();
  const ohneZellGrenze = (kopf, spaltenZahl) => {
    let leere = leerAb.get(kopf);
    if (leere === undefined) {
      leere = kopf;
      while (leere < nZeilen && src.slice(zeilen[leere], stelleVon(leere + 1)).trim() !== '')
        leere++;
      leerAb.set(kopf, leere);
    }
    return spaltenZahl * (leere - kopf) <= MAX_ERGAENZTE_ZELLEN;
  };

  // Neustart-Stellen einer Antwort in Zeilen des ganzen Dokuments, als
  // { bloecke, koepfe }; bei einer Antwort außer Form ist bloecke null. Die
  // Vorlage begann an Zeile `versatz`. Mit `kopfZeile` (ab 0) waren ihr Kopf- und
  // Trennzeile dieser Tabelle vorangestellt: Vorlagen-Zeile z ab 2 ist Zeile
  // z - 2 + versatz, und Kopf 0 ist die Kopfzeile. Eine Antwort ohne Köpfe
  // (frühere Form) nennt keine Tabellen-Zeilen. Eine Tabellen-Zeile zählt nur,
  // wo die Schutzgrenze hält (ohneZellGrenze).
  const neustarts = (antwort, versatz, kopfZeile) => {
    const bl = antwort.bloecke;
    const kp = antwort.koepfe === undefined ? null : antwort.koepfe;
    const sp = antwort.spalten === undefined ? null : antwort.spalten;
    const kaputt = { bloecke: null, koepfe: null };
    if (kp !== null && (!Array.isArray(kp) || kp.length !== bl.length)) return kaputt;
    if (kp !== null && (!Array.isArray(sp) || sp.length !== bl.length)) return kaputt;
    const bloecke = [];
    const koepfe = [];
    for (let i = 0; i < bl.length; i++) {
      const z = bl[i];
      if (!Number.isInteger(z) || z < 0 || (i > 0 && bl[i - 1] >= z)) return kaputt;
      const h = kp === null ? -1 : kp[i];
      if (!Number.isInteger(h) || (h !== -1 && (h < 0 || h > z - 2))) return kaputt;
      if (h >= 0 && !(Number.isInteger(sp[i]) && sp[i] >= 1)) return kaputt;
      let zeile = z + versatz;
      let kopf = h < 0 ? -1 : h + versatz;
      if (kopfZeile >= 0) {
        if (z < 2) continue;
        if (h === 1) return kaputt;
        zeile = z - 2 + versatz;
        kopf = h < 0 ? -1 : h === 0 ? kopfZeile : h - 2 + versatz;
      }
      if (kopf >= 0 && !ohneZellGrenze(kopf, sp[i])) continue;
      bloecke.push(zeile);
      koepfe.push(kopf);
    }
    return { bloecke, koepfe };
  };

  let aufwand = 0;
  // Legt der Anzeige eine Vorlage vor. Liefert { code, unsicher, bloecke,
  // koepfe, definitionen } oder null (keine Antwort, Aufwand erschöpft);
  // `versatz` und `kopfZeile` wie bei neustarts. Eine Antwort als Feld (frühere
  // Form) trägt keine Block-Grenzen; dann wird nach jedem Kommentar das ganze
  // Dokument gefragt.
  const frage = (vorlage, definitionen, versatz = 0, kopfZeile = -1) => {
    aufwand += vorlage.length;
    if (aufwand > MAX_AUFWAND_ZEICHEN) return null;
    let antwort;
    try {
      antwort = antwortInForm(frageRoh(vorlage, leit, { gliederung: true, definitionen }));
    } catch {
      return null;
    }
    if (!antwort) return null;
    if (Array.isArray(antwort))
      return {
        code: new Set(antwort),
        unsicher: new Set(),
        bloecke: null,
        koepfe: null,
        definitionen: null,
      };
    return {
      code: new Set(antwort.code),
      unsicher: new Set(antwort.unsicher),
      ...neustarts(antwort, versatz, kopfZeile),
      definitionen: antwort.definitionen || null,
    };
  };

  // Das ganze Dokument ohne die Bereiche, Marker ab Nummer k und die wörtlich
  // gelassenen als Kennung.
  const ganz = (ranges, k, woertlich) =>
    frage(
      sicht(src, marker, ranges, (j) => j >= k || woertlich.has(j), leit, 0, len),
      null,
    );

  // Gleiche Neustart-Stellen samt Kopfzeilen zweier Stände in [von, bis).
  const gleicheAnfaenge = (alt, neu, von, bis) => {
    const i = ersterAb(alt.bloecke, von);
    const j = ersterAb(neu.bloecke, von);
    const n = ersterAb(alt.bloecke, bis) - i;
    if (ersterAb(neu.bloecke, bis) - j !== n) return false;
    for (let x = 0; x < n; x++) {
      if (alt.bloecke[i + x] !== neu.bloecke[j + x] || alt.koepfe[i + x] !== neu.koepfe[j + x])
        return false;
    }
    return true;
  };

  // Neue Antwort nach dem Entfernen des Kommentars `bereich`, für die Marker ab
  // Nummer k. Vorgelegt wird der Abschnitt um den Kommentar: von der
  // Neustart-Stelle vor der, in deren Block er beginnt, bis zur zweiten
  // Neustart-Stelle nach seinem Ende (blockAnfaenge). Beginnt der Abschnitt an
  // einer Tabellen-Zeile, stehen Kopf- und Trennzeile ihrer Tabelle davor.
  // Stimmen die Neustart-Stellen samt Kopfzeilen im Block davor und im Block
  // danach und die Antworten im Block danach mit der bisherigen Zerlegung
  // überein, zerlegt die Anzeige das ganze Dokument davor und danach wie
  // bisher. Eine Tabelle liest ihre Zeilen gegen Kopf- und Trennzeile, auch
  // jenseits des Abschnitts-Endes: Berührt der Kommentar Kopf- oder Trennzeile
  // einer Tabelle mit Zeilen im Block danach, gleich ob sie über das Ende
  // reicht, gilt die Übereinstimmung nicht (kopfBeruehrt). Die Prüfung ist eine
  // vorsichtige Schranke: Nach der Lesung im Zweitblick, Runde 1 zu 4T-002837,
  // behält ein Kommentar allein im Kopf die Spaltenzahl, oder die Tabelle
  // zerfällt, und den Zerfall fängt schon der Vergleich der Block-Anfänge; ein
  // Prüffall, der nur an ihr rot wird, ist nicht bekannt. Sie kostet allein bei
  // Kommentaren im Tabellen-Kopf, dort aber das Verdoppeln bis zum ganzen
  // Dokument, solange die Tabelle nach dem Kommentar Zeilen hat (Zweitblick
  // Runde 2). Sonst wird der Abschnitt verdoppelt, zuletzt bis zum ganzen
  // Dokument.
  // Definitionen (`]:`) wirken im ganzen Dokument: Steht eine im Kommentar oder
  // in der Vorlage, wird das ganze Dokument gefragt; sonst bekommt der
  // Abschnitt die bisherigen mit.
  const nachKommentar = (stand, bereich, ranges, k, woertlich) => {
    const bl = stand.bloecke;
    if (!bl || src.slice(bereich.from, bereich.to).includes(']:'))
      return ganz(ranges, k, woertlich);
    const istKennung = (j) => j >= k || woertlich.has(j);
    const kv = zeileVon(bereich.from);
    const kb = zeileVon(bereich.to - 1);
    const bi = ersterUeber(bl, kv) - 1;
    const fi = ersterUeber(bl, kb);
    const anfang = bi >= 0 ? bl[bi] : 0;
    const folge = fi < bl.length ? bl[fi] : nZeilen;
    for (let weite = 1; ; weite *= 2) {
      const s = bi - weite >= 0 ? bl[bi - weite] : 0;
      const h = bi - weite >= 0 ? stand.koepfe[bi - weite] : -1;
      const e = fi + weite < bl.length ? bl[fi + weite] : nZeilen;
      if (s === 0 && e === nZeilen) return ganz(ranges, k, woertlich);
      const a = stelleVon(s);
      const b = stelleVon(e);
      const kopf =
        h >= 0 ? sicht(src, marker, ranges, istKennung, leit, stelleVon(h), stelleVon(h + 2)) : '';
      const vorlage = kopf + sicht(src, marker, ranges, istKennung, leit, a, b);
      if (vorlage.includes(']:')) return ganz(ranges, k, woertlich);
      const antwort = frage(vorlage, stand.definitionen, s, h);
      if (!antwort || !antwort.bloecke) return null;
      if (!gleicheAnfaenge(stand, antwort, s, anfang) || !gleicheAnfaenge(stand, antwort, folge, e))
        continue;
      let kopfBeruehrt = false;
      for (let i = ersterAb(antwort.bloecke, folge); i < antwort.bloecke.length; i++) {
        const hk = antwort.koepfe[i];
        if (hk >= 0 && kv <= hk + 1 && kb >= hk) kopfBeruehrt = true;
      }
      if (kopfBeruehrt) continue;
      // Auch die Antworten im Block danach stimmen mit den bisherigen überein.
      const ersterMarker = Math.max(k, ersterAb(marker, a));
      let gleich = true;
      for (let j = Math.max(k, ersterAb(marker, stelleVon(folge))); j < marker.length; j++) {
        if (marker[j] >= b) break;
        if (
          antwort.code.has(j) !== stand.code.has(j) ||
          antwort.unsicher.has(j) !== stand.unsicher.has(j)
        ) {
          gleich = false;
          break;
        }
      }
      if (!gleich) continue;
      for (let j = ersterMarker; j < marker.length && marker[j] < b; j++) {
        stand.code.delete(j);
        stand.unsicher.delete(j);
        if (antwort.code.has(j)) stand.code.add(j);
        if (antwort.unsicher.has(j)) stand.unsicher.add(j);
      }
      const vor = ersterAb(bl, s);
      const nach = ersterAb(bl, e);
      stand.bloecke = bl.slice(0, vor).concat(antwort.bloecke, bl.slice(nach));
      stand.koepfe = stand.koepfe.slice(0, vor).concat(antwort.koepfe, stand.koepfe.slice(nach));
      return stand;
    }
  };

  // Sichere Seite ab dem frühesten ungeprüften Marker: dem ersten wörtlich
  // gelassenen, sonst dem aktuellen. Ein wörtlich gelassener Marker gilt erst
  // nach der Schluss-Prüfung am fertigen Text als geprüft.
  const fruehester = (woertlich, k) => marker[woertlich.length ? woertlich[0] : k];

  const erzwungen = new Set();
  let start = { ranges: [], oeffner: [], woertlich: [], k: 0 };
  for (let durchgang = 0; durchgang < MAX_DURCHGAENGE; durchgang++) {
    const ranges = start.ranges.slice();
    const oeffner = start.oeffner.slice();
    const woertlich = start.woertlich.slice();
    const woertlichMenge = new Set(woertlich);
    let k = start.k;
    let stand = ganz(ranges, k, woertlichMenge);
    if (!stand) return sichereSeite(ranges, fruehester(woertlich, k));
    while (k < marker.length) {
      if (stand.unsicher.has(k)) return sichereSeite(ranges, fruehester(woertlich, k));
      if (stand.code.has(k) && !erzwungen.has(k)) {
        woertlich.push(k);
        woertlichMenge.add(k);
        k++;
        continue;
      }
      oeffner.push(k);
      if (k + 1 >= marker.length) {
        ranges.push({ from: marker[k], to: len, closed: false });
        break;
      }
      const bereich = { from: marker[k], to: marker[k + 1] + 2, closed: true };
      ranges.push(bereich);
      k += 2;
      if (k < marker.length) {
        stand = nachKommentar(stand, bereich, ranges, k, woertlichMenge);
        if (!stand) return sichereSeite(ranges, fruehester(woertlich, k));
      }
    }

    // Schluss-Prüfung, erste Richtung: Jeder wörtlich gelassene Marker liegt
    // im fertigen Text in Code. Der erste, der es nicht tut, öffnet einen
    // Kommentar, und ab ihm wird neu entschieden; ist er unsicher, gilt ab ihm
    // die sichere Seite.
    if (woertlich.length) {
      const pruefung = frage(
        sicht(src, marker, ranges, (j) => woertlichMenge.has(j), leit, 0, len),
        null,
      );
      if (!pruefung) return sichereSeite(ranges, marker[woertlich[0]]);
      const fehlt = woertlich.find((w) => !pruefung.code.has(w));
      if (fehlt !== undefined) {
        if (pruefung.unsicher.has(fehlt)) return sichereSeite(ranges, marker[fehlt]);
        erzwungen.add(fehlt);
        const bleiben = ranges.filter((b) => b.to <= marker[fehlt]).length;
        start = {
          ranges: ranges.slice(0, bleiben),
          oeffner: oeffner.slice(0, bleiben),
          woertlich: woertlich.filter((w) => w < fehlt),
          k: fehlt,
        };
        continue;
      }
    }
    if (ranges.length === 0) return ranges;
    // Schluss-Prüfung, zweite Richtung: Kein öffnender Marker liegt im fertigen
    // Text in Code. Die Gegenprobe zeigt alle öffnenden Marker auf einmal als
    // Kennung, ihre Kommentare sind entfernt. Eine Kennung kann dabei Zeichen
    // trennen, die erst das Entfernen zusammenführt (zwei Backticks vor und
    // einer nach dem Kommentar ergeben einen Zaun); ein Treffer ist deshalb nur
    // ein Verdacht. Jeder verdächtige Marker wird einzeln nachgeprüft: der
    // fertige Text mit seinem eigenen Kommentar, er und sein schließender
    // Marker als Kennung. Liegt er dort in Code, ist er unsicher oder bleibt
    // die Antwort aus, gilt ab ihm die sichere Seite.
    const oeffnerMenge = new Set(oeffner);
    const ohneOeffner = ranges.map((b) => ({ from: b.from + 2, to: b.to }));
    const gegenprobe = frage(
      sicht(
        src,
        marker,
        ohneOeffner,
        (j) => woertlichMenge.has(j) || oeffnerMenge.has(j),
        leit,
        0,
        len,
      ),
      null,
    );
    if (!gegenprobe) return sichereSeite(ranges, marker[oeffner[0]]);
    for (let i = 0; i < oeffner.length; i++) {
      const o = oeffner[i];
      if (!gegenprobe.code.has(o) && !gegenprobe.unsicher.has(o)) continue;
      const andere = ranges.slice(0, i).concat(ranges.slice(i + 1));
      const probe = frage(
        sicht(
          src,
          marker,
          andere,
          (j) => woertlichMenge.has(j) || j === o || j === o + 1,
          leit,
          0,
          len,
        ),
        null,
      );
      if (!probe || probe.code.has(o) || probe.unsicher.has(o)) {
        return sichereSeite(ranges, marker[o]);
      }
    }
    return ranges;
  }
  return sichereSeite(start.ranges, fruehester(start.woertlich, start.k));
}

// Entfernt die Kommentare zeilentreu: Zeichen weg, Zeilenumbrüche bleiben.
function stripPercentComments(text, optionen) {
  const src = String(text == null ? '' : text);
  const ranges = findPercentCommentRanges(src, optionen);
  if (!ranges.length) return src;
  const teile = [];
  let pos = 0;
  for (const b of ranges) {
    teile.push(src.slice(pos, b.from), src.slice(b.from, b.to).replace(/[^\n\r]+/g, ''));
    pos = b.to;
  }
  teile.push(src.slice(pos));
  return teile.join('');
}

module.exports = {
  // 4T-002838: Stellen und Paarung ohne Code für die Sonder-Blöcke
  // (comments-block.js), damit Maskierung und Paarung nur hier stehen.
  markerStellen: kandidaten,
  paareOhneCode,
  findPercentCommentRanges,
  stripPercentComments,
  setzeCodeFrage,
  baueCodeFrage,
  meldeZerlegerAn,
  kommentarImCode,
  MAX_DURCHGAENGE,
  MAX_LAENGE,
  MAX_AUFWAND_ZEICHEN,
  MAX_ERGAENZTE_ZELLEN,
};
