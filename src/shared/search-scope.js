// 4T-000758 (Epic 3E-000142): Prozess-neutraler Kern der Suche über mehrere
// Texte hinweg.
//
// Die Suche der Anwendung arbeitet auf dem aktiven Dokument und kennt dafür
// zwei Quellen (Editor-Inhalt und gerendertes Markup, siehe
// renderer/modules/search/search.js). Für Handbuch und Einstellungen reicht das
// nicht: Dort liegen die Texte in vielen Einheiten, von denen die meisten
// gerade nicht angezeigt werden und deshalb kein DOM haben.
//
// Dieses Modul beschreibt deshalb einen Trefferraum ohne jeden Bezug zur
// Anzeige: Es bekommt fertige Texte samt Herkunft herein und liefert
// Treffer, die sich später anzeigen und anspringen lassen, ohne dass ein
// zweites Mal gesucht werden müsste. Reine Funktionen, kein DOM, kein
// Electron (Muster src/shared/manual/manual-pages.js und src/shared/events/events-core.js).
//
// Die Erzeugung des regulären Ausdrucks liegt bewusst NICHT hier, sondern
// bleibt bei buildRegex in renderer/modules/search/search.js. Sonst entstünde eine
// zweite Auslegung von Groß-/Kleinschreibung und Regex-Modus, die von der
// Dokument-Suche abweichen könnte.
'use strict';

// Obergrenzen. Die Gesamt-Grenze entspricht MAX_MATCHES der Dokument-Suche;
// die Gruppen-Grenze verhindert zusätzlich, dass eine einzelne Seite die
// Trefferliste flutet und die übrigen Gruppen aus der Anzeige drängt.
const MAX_TREFFER_GESAMT = 5000;
const MAX_TREFFER_JE_GRUPPE = 200;

// Zeichen links und rechts des Treffers im Kontext-Ausschnitt.
const KONTEXT_ZEICHEN = 60;

const ELLIPSE = '…';

// Zeilen-Anfänge eines Textes als aufsteigende Offset-Liste. Erlaubt die
// Umrechnung eines Treffer-Offsets in Zeile und Spalte ohne wiederholtes
// Zerlegen des Textes.
function zeilenAnfaenge(text) {
  const anfaenge = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') anfaenge.push(i + 1);
  }
  return anfaenge;
}

// Index der Zeile, in die ein Offset fällt (binäre Suche über die
// Zeilen-Anfänge; die Liste ist aufsteigend und lückenlos).
function zeileZuOffset(anfaenge, offset) {
  let links = 0;
  let rechts = anfaenge.length - 1;
  while (links < rechts) {
    const mitte = Math.ceil((links + rechts) / 2);
    if (anfaenge[mitte] <= offset) links = mitte;
    else rechts = mitte - 1;
  }
  return links;
}

// Kürzt an einer Wortgrenze, damit der Ausschnitt nicht mitten im Wort
// beginnt oder endet. Findet sich in der Nähe der Schnittstelle kein
// Leerzeichen, wird hart geschnitten (lange Pfade, Code ohne Leerraum).
function schnittLinks(zeile, ab) {
  if (ab <= 0) return 0;
  const fenster = zeile.slice(Math.max(0, ab - 15), ab);
  const pos = fenster.lastIndexOf(' ');
  return pos < 0 ? ab : Math.max(0, ab - 15) + pos + 1;
}

function schnittRechts(zeile, bis) {
  if (bis >= zeile.length) return zeile.length;
  const fenster = zeile.slice(bis, Math.min(zeile.length, bis + 15));
  const pos = fenster.indexOf(' ');
  return pos < 0 ? bis : bis + pos;
}

// Kontext-Ausschnitt um einen Treffer herum, samt der Offsets des Treffers
// INNERHALB des Ausschnitts. Die Offsets sind der Grund für diese Funktion:
// Die Trefferliste soll den Fund hervorheben, ohne den regulären Ausdruck
// ein zweites Mal anzuwenden (bei Regex-Mustern mit Zustand wäre das eine
// Fehlerquelle, und bei vielen Treffern schlicht Arbeit ohne Nutzen).
function baueAusschnitt(zeile, vonInZeile, bisInZeile) {
  const rohLinks = Math.max(0, vonInZeile - KONTEXT_ZEICHEN);
  const rohRechts = Math.min(zeile.length, bisInZeile + KONTEXT_ZEICHEN);
  // Nie in den Treffer hineinschneiden: Die Wortgrenzen-Korrektur gilt nur
  // außerhalb des Fundes.
  const links = Math.min(schnittLinks(zeile, rohLinks), vonInZeile);
  const rechts = Math.max(schnittRechts(zeile, rohRechts), bisInZeile);

  const kern = zeile.slice(links, rechts);
  const vorne = links > 0 ? ELLIPSE : '';
  const hinten = rechts < zeile.length ? ELLIPSE : '';
  return {
    ausschnitt: vorne + kern + hinten,
    von: vorne.length + (vonInZeile - links),
    bis: vorne.length + (bisInZeile - links),
  };
}

// Treffer eines Eintrags. Der reguläre Ausdruck kommt mit gesetztem
// g-Flag herein (buildRegex erzeugt 'gm' bzw. 'gmi'); lastIndex wird hier
// zurückgesetzt, damit ein wiederverwendeter Ausdruck nicht mitten im Text
// zu suchen beginnt.
// Ein einzelner Treffer aus Offset und Länge — die Stelle, an der Suchlauf und
// Fundstellen-Ermittlung zusammenlaufen.
//
// Herausgelöst mit 4T-001531 (Epic 3E-000175), als die Trefferliste einen
// zweiten Lieferanten bekam: Die Tag-Umbenennung kennt ihre Fundstellen
// bereits (`shared/tag-erkennung.js`) und braucht keinen Ausdruck mehr, wohl
// aber dieselbe Zeilen- und Kontext-Rechnung. Sie ein zweites Mal
// auszuschreiben hieße, zwei Trefferlisten auseinanderlaufen zu lassen, die
// der Anwender als eine sieht.
function trefferAnStelle(eintrag, text, anfaenge, offset, laenge) {
  const zeilenIdx = zeileZuOffset(anfaenge, offset);
  const zeilenStart = anfaenge[zeilenIdx];
  const zeilenEnde = zeilenIdx + 1 < anfaenge.length ? anfaenge[zeilenIdx + 1] - 1 : text.length;
  const zeile = text.slice(zeilenStart, zeilenEnde);
  const vonInZeile = offset - zeilenStart;
  // Ein Treffer, der über das Zeilenende hinausreicht (mehrzeiliges
  // Muster), wird für die Anzeige an der Zeile abgeschnitten. Die
  // Sprung-Angabe bleibt der echte Beginn des Fundes.
  const bisInZeile = Math.min(vonInZeile + laenge, zeile.length);

  const kontext = baueAusschnitt(zeile, vonInZeile, bisInZeile);
  return {
    gruppe: eintrag.gruppe,
    gruppeTitel: eintrag.titel || '',
    quelle: eintrag.quelle || '',
    sprung: {
      offset,
      zeile: zeilenIdx,
      spalte: vonInZeile,
      kennung: eintrag.kennung || null,
    },
    ausschnitt: kontext.ausschnitt,
    von: kontext.von,
    bis: kontext.bis,
  };
}

/**
 * Treffer eines Eintrags an bereits bekannten Stellen (4T-001531).
 *
 * @param {object} eintrag { gruppe, titel, text, quelle?, kennung? }
 * @param {Array<{offset: number, laenge: number}>} stellen Fundstellen im Text.
 *   Weitere Felder einer Stelle reisen unverändert als `zusatz` am Treffer mit;
 *   die Trefferliste zeigt sie an, ohne dass dieser Kern sie deuten müsste.
 * @returns {Array<object>} Treffer in der Reihenfolge der Stellen.
 */
function trefferAnStellen(eintrag, stellen) {
  const text = typeof eintrag.text === 'string' ? eintrag.text : '';
  if (!text || !Array.isArray(stellen) || stellen.length === 0) return [];
  const anfaenge = zeilenAnfaenge(text);
  const treffer = [];
  for (const stelle of stellen) {
    if (!stelle || !Number.isInteger(stelle.offset) || stelle.offset < 0) continue;
    if (stelle.offset >= text.length) continue;
    const laenge = Number.isInteger(stelle.laenge) && stelle.laenge > 0 ? stelle.laenge : 1;
    const gebaut = trefferAnStelle(eintrag, text, anfaenge, stelle.offset, laenge);
    const zusatz = { ...stelle };
    delete zusatz.offset;
    delete zusatz.laenge;
    treffer.push(Object.keys(zusatz).length > 0 ? { ...gebaut, zusatz } : gebaut);
  }
  return treffer;
}

// Treffer eines Eintrags. Der reguläre Ausdruck kommt mit gesetztem
// g-Flag herein (buildRegex erzeugt 'gm' bzw. 'gmi'); lastIndex wird hier
// zurückgesetzt, damit ein wiederverwendeter Ausdruck nicht mitten im Text
// zu suchen beginnt.
function trefferImText(eintrag, regex, restBudget, grenzeJeGruppe) {
  const text = typeof eintrag.text === 'string' ? eintrag.text : '';
  if (!text) return [];

  const anfaenge = zeilenAnfaenge(text);
  const treffer = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[0].length === 0) {
      // Null-Breiten-Treffer (etwa bei den Mustern ^ oder $) würden die
      // Schleife nie beenden; dieselbe Absicherung wie in der
      // Dokument-Suche.
      regex.lastIndex += 1;
      continue;
    }
    treffer.push(trefferAnStelle(eintrag, text, anfaenge, m.index, m[0].length));

    if (treffer.length >= grenzeJeGruppe) break;
    if (treffer.length >= restBudget) break;
  }
  return treffer;
}

// Sucht über eine Liste von Einträgen und liefert die Treffer in der
// Reihenfolge der Einträge.
//
// eintraege: [{ gruppe, titel, text, quelle?, kennung? }]
//   gruppe   stabile Kennung der Einheit (Handbuch-Seiten-ID,
//            Einstellungs-Bereichs-ID)
//   titel    lokalisierter Anzeige-Titel der Einheit
//   text     durchsuchter Volltext
//   quelle   optionale Herkunfts-Kennung ('manual', 'settings', …)
//   kennung  optionale Sprung-Kennung innerhalb der Einheit (bei
//            Einstellungen die Feld-Kennung; bei Seiten null, dort trägt
//            der Offset)
//
// Rückgabe: { treffer, abgeschnitten, gruppen }
//   abgeschnitten  true, wenn eine Obergrenze gegriffen hat (die Anzeige
//                  soll das sichtbar machen, statt Vollständigkeit
//                  vorzutäuschen)
//   gruppen        Trefferzahl je Gruppe in Eintrags-Reihenfolge
function sucheInTexten(eintraege, regex, grenzen) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  const gesamtGrenze = (grenzen && grenzen.gesamt) || MAX_TREFFER_GESAMT;
  const gruppenGrenze = (grenzen && grenzen.jeGruppe) || MAX_TREFFER_JE_GRUPPE;

  const treffer = [];
  const gruppen = [];
  let abgeschnitten = false;

  for (const eintrag of liste) {
    if (!eintrag || typeof eintrag.gruppe !== 'string' || eintrag.gruppe === '') continue;
    const restBudget = gesamtGrenze - treffer.length;
    if (restBudget <= 0) {
      abgeschnitten = true;
      break;
    }
    const gefunden = trefferImText(eintrag, regex, restBudget, gruppenGrenze);
    if (gefunden.length === 0) continue;
    if (gefunden.length >= gruppenGrenze || gefunden.length >= restBudget) abgeschnitten = true;
    gruppen.push({
      gruppe: eintrag.gruppe,
      titel: eintrag.titel || '',
      anzahl: gefunden.length,
    });
    treffer.push(...gefunden);
  }

  return { treffer, abgeschnitten, gruppen };
}

module.exports = {
  MAX_TREFFER_GESAMT,
  MAX_TREFFER_JE_GRUPPE,
  KONTEXT_ZEICHEN,
  sucheInTexten,
  // 4T-001531 (Epic 3E-000175): der zweite Zugang — Treffer aus bekannten
  // Fundstellen statt aus einem Ausdruck.
  trefferAnStellen,
};
