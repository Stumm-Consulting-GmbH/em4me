// 4T-001525 (Epic 3E-000169): Die Auswahl je Fundstelle für das bereichsweite
// Ersetzen.
//
// Eigenes Modul und kein Kapitel in search-panel.js: Die Trefferliste zeigt an
// und wählt an, diese Schicht hält fest, WAS ersetzt werden soll. Der Schnitt
// folgt dem der Nachbarn (search-run.js, search-area.js, search-jump.js) und
// hält beide Seiten unter dem Zeilen-Budget.
//
// Die Auswahl ist eine ZWEITE, unabhängige Ebene neben dem Auswahl-Index des
// Panels. Der Index sagt, wohin gesprungen wird; diese Menge sagt, was ersetzt
// wird. Zwei Bedeutungen auf einer Mechanik wären der naheliegende Fehler: Ein
// Anwender, der mit den Pfeiltasten durch die Liste blättert, änderte damit
// unversehens seine Auswahl.
//
// Gespeichert werden die ABGEWÄHLTEN Fundstellen, nicht die ausgewählten. Das
// ist kein Kniff, sondern die Vorgabe selbst: «alles ausgewählt» ist der leere
// Zustand, und ein erneuter Suchlauf bringt neue Treffer von sich aus
// ausgewählt mit, ohne dass jemand sie nachtragen müsste.
'use strict';

// Abgewählte Fundstellen. Modul-Zustand wie der Trefferbestand selbst: Er
// gehört zur laufenden Such-Sitzung, überlebt keinen Neustart und wird nie
// persistiert.
const abgewaehlt = new Set();

// Anfrage des letzten Laufs (Raum, Muster, Flags).
let letzteAnfrage = null;

// Schlüssel einer Fundstelle: Gruppe und Offset, getrennt durch ein Zeichen,
// das in keinem von beiden vorkommen kann. Beide Angaben stammen aus dem
// Suchraum-Kern und beschreiben die STELLE, nicht ihren Platz in der Liste —
// nur deshalb findet ein zweiter Lauf über dasselbe Muster dieselbe Auswahl
// wieder, auch wenn die laufenden Nummern sich verschoben haben.
export function schluessel(treffer) {
  const offset = treffer && treffer.sprung ? treffer.sprung.offset : '';
  return `${treffer.gruppe}\u0000${offset}`;
}

export function istGewaehlt(treffer) {
  return !abgewaehlt.has(schluessel(treffer));
}

export function waehle(treffer, an) {
  if (an) abgewaehlt.delete(schluessel(treffer));
  else abgewaehlt.add(schluessel(treffer));
}

export function waehleAlle(treffer, an) {
  for (const einzelner of treffer) waehle(einzelner, an);
}

// Dreiwertiger Zustand einer Gruppe, aus ihren Treffern abgeleitet und nicht
// getrennt geführt: Ein zweiter Speicherort für dieselbe Aussage liefe
// unweigerlich auseinander.
export function gruppenZustand(treffer) {
  if (treffer.length === 0) return 'keine';
  const gewaehlt = treffer.filter(istGewaehlt).length;
  if (gewaehlt === 0) return 'keine';
  return gewaehlt === treffer.length ? 'ganz' : 'teilweise';
}

export function leereAuswahl() {
  abgewaehlt.clear();
  letzteAnfrage = null;
}

/**
 * Meldet die Anfrage des laufenden Suchlaufs und leert die Auswahl, wenn sie
 * eine andere ist als beim letzten Mal.
 *
 * Dasselbe Muster im selben Raum meint dieselben Fundstellen — dort bleibt die
 * Auswahl bestehen, auch über den Lauf hinweg, den ein Reiter-Wechsel auslöst.
 * Ein anderes Muster findet andere Stellen, und eine mitgeschleppte Abwahl
 * bezöge sich auf nichts.
 */
export function pruefeAnfrage(raum, muster, flags) {
  const anfrage = `${raum || ''}\u0000${muster || ''}\u0000${flags || ''}`;
  if (anfrage === letzteAnfrage) return;
  abgewaehlt.clear();
  letzteAnfrage = anfrage;
}

/**
 * Die ausgewählten Fundstellen, nach Datei gebündelt.
 *
 * Genau die Form, die der Kanal `areaReplace:run` entgegennimmt (4T-001524):
 * absoluter Pfad und die Offsets im gesuchten Text.
 *
 * 4T-001531 (Epic 3E-000175): Eine Fundstelle im Frontmatter-Feld trägt ihre
 * Art am Treffer und wandert in die zweite Liste. Sie hat zwar einen Offset —
 * die Vorschau zeigt sie mit Kontext wie jede andere —, aber geschrieben wird
 * sie über das Feld und nicht über die Position. Beide in einen Topf zu werfen
 * hieße, dieselbe Stelle zweimal zu ändern.
 *
 * @param {Array} treffer Trefferbestand des laufenden Suchlaufs.
 * @returns {Array<{pfad: string, offsets: number[], frontmatter: number[]}>}
 */
export function ausgewaehlteFundstellen(treffer) {
  const nachPfad = new Map();
  for (const einzelner of treffer) {
    const pfad = einzelner && einzelner.sprung ? einzelner.sprung.kennung : null;
    if (!pfad || !Number.isInteger(einzelner.sprung.offset)) continue;
    if (!istGewaehlt(einzelner)) continue;
    if (!nachPfad.has(pfad)) nachPfad.set(pfad, { pfad, offsets: [], frontmatter: [] });
    const zusatz = einzelner.zusatz;
    if (zusatz && zusatz.art === 'frontmatter') {
      if (Number.isInteger(zusatz.index)) nachPfad.get(pfad).frontmatter.push(zusatz.index);
    } else {
      nachPfad.get(pfad).offsets.push(einzelner.sprung.offset);
    }
  }
  return [...nachPfad.values()];
}

export function anzahlAusgewaehlt(treffer) {
  return treffer.filter(istGewaehlt).length;
}
