// 4T-001788 (Epic 3E-000255, E9, Bauplan L8): Die Sperr-Ordnung — die
// verbindliche Reihenfolge, in der mehrere Sperren genommen werden.
//
// **Warum überhaupt eine Ordnung, obwohl nie gewartet wird.** Die Anwendung
// wartet an keiner Stelle auf eine fremde Sperre; eine Verklemmung im
// klassischen Sinn kann deshalb gar nicht entstehen. Die Ordnung verhindert
// etwas anderes, das **wechselseitige Scheitern**: Zwei Aufträge mit
// überschneidenden Mengen, die in verschiedener Reihenfolge nähmen, blieben
// beide auf halber Strecke liegen und gäben beide zurück. In fester Ordnung
// stoßen sie am **ersten** gemeinsamen Gegenstand zusammen, und genau einer
// kommt durch.
//
// **Der Vergleich läuft über Code-Punkte und nicht über `localeCompare`.** Ein
// sprachabhängiger Vergleich ordnet auf zwei Rechnern mit verschiedener
// Systemsprache verschieden — und eine Ordnung, die je Rechner anders ausfällt,
// ist keine. Die Sortierung ist damit nicht die, die ein Mensch in einer Liste
// erwartete; das ist hier ohne Belang, weil niemand sie ansieht.
//
// **Rein und importfrei.** Das Modul arbeitet auf bereits **aufgelösten**
// Gegenständen (Vergleichs-Schlüssel der Tabelle, Art, Nummer), wie sie
// `loeseGegenstand` des Sperr-Speichers liefert. Es löst nichts selbst auf: Der
// Vergleichs-Schlüssel entsteht genau einmal, sonst gäbe es zwei Wahrheiten
// darüber, welche zwei Gegenstände derselbe sind.
//
// Prozess-neutral (kein Electron, kein DOM, kein Dateizugriff).
'use strict';

// Die Arten, wie der Sperr-Speicher sie benennt (seit 4T-001824 fünf). Sie stehen hier als
// eigene Konstanten, weil dieses Modul importfrei bleibt; der Gleichlauf mit
// dem Speicher ist Gegenstand eines Prüffalls und nicht eines Imports.
const ART_DATENSATZ = 'record';
const ART_DEFINITION = 'definition';
const ART_CHANGE_LOG = 'changeLog';
// 4T-001820 (Epic 3E-000254, Bauplan B1): der Vorgangs-Zähler des Bereichs.
const ART_COUNTER = 'counter';
// 4T-001824 (Epic 3E-000254, Bauplan B1): die Aufräum-Sperre eines
// liegengebliebenen Absichts-Protokolls. Ihr Gegenstand ist das Protokoll, also
// ein Vorgang des Bereichs und keine Tabelle.
const ART_SWEEP = 'sweep';

// Rang innerhalb einer Tabelle: zuerst die Definition, weil eine
// Schema-Änderung alle Datensätze berührt; dann die Datensätze aufsteigend nach
// Nummer; zuletzt die Beleg-Datei, die jeder Schreibzug am Ende anfasst. Der
// Zähler steht hinter allen dreien — und zwar nicht nur innerhalb einer
// Tabelle, siehe den Bereichs-Rang darunter.
//
// 4T-001824 (B1): Die Aufräum-Sperre steht **vor** allen übrigen Arten. Sie wird
// als erste und allein genommen, und unter ihr folgen die im Protokoll
// genannten Sperren geordnet; die übrigen Ränge sind dafür um eins gerückt.
const RANG_JE_ART = Object.freeze({
  [ART_SWEEP]: 0,
  [ART_DEFINITION]: 1,
  [ART_DATENSATZ]: 2,
  [ART_CHANGE_LOG]: 3,
  [ART_COUNTER]: 4,
});

// 4T-001820 (B1): Arten, deren Gegenstand der **Bereich als Ganzes** ist. Sie
// tragen keinen Tabellen-Schlüssel und lassen sich deshalb nicht zwischen den
// Tabellen einsortieren: Ein leerer Schlüssel stünde im Code-Punkt-Vergleich vor
// jeder Tabelle und damit an der genau falschen Stelle. Sie bekommen deshalb
// einen eigenen, vorgeschalteten Rang und stehen hinter **allen** Tabellen.
//
// Dass der Zähler zuletzt genommen wird, ist die Zusage, auf der seine Kürze
// ruht: Unter ihm wird keine weitere Sperre mehr genommen, und er kann damit
// keine fremde Nahme aufhalten.
//
// 4T-001824 (B1): Die Aufräum-Sperre ist ebenfalls bereichsweit, steht aber vor
// **allen** Tabellen statt dahinter: Ihr Rang liegt unter dem jeder Tabellen-Art,
// und daran entscheidet sich die Seite (`bereichsSeite`). Eine zweite Liste für
// «vorn» und «hinten» entsteht damit nicht.
const BEREICHS_ARTEN = Object.freeze([ART_SWEEP, ART_COUNTER]);

function istBereichsweit(art) {
  return BEREICHS_ARTEN.includes(art);
}

// 4T-001824 (B1): Wo ein Gegenstand gegenüber den Tabellen steht: -1 davor,
// 0 zwischen ihnen, 1 dahinter. Abgeleitet aus dem Rang, damit die Ordnung
// weiterhin allein aus `RANG_JE_ART` und `BEREICHS_ARTEN` folgt.
function bereichsSeite(art) {
  if (!istBereichsweit(art)) return 0;
  return RANG_JE_ART[art] < RANG_JE_ART[ART_DEFINITION] ? -1 : 1;
}

/**
 * Vergleicht zwei Zeichenketten Code-Punkt für Code-Punkt.
 *
 * Nicht `<` und `>`: Jene vergleichen UTF-16-Code-**Einheiten**, und dort steht
 * ein Zeichen jenseits der Grundebene (ein Ersatzpaar) vor `U+E000` statt
 * dahinter. Der Unterschied ist selten, aber er wäre eine zweite, stillschweigend
 * abweichende Ordnung.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negativ, null oder positiv.
 */
function vergleicheCodePunkte(a, b) {
  const links = Array.from(a);
  const rechts = Array.from(b);
  const gemeinsam = Math.min(links.length, rechts.length);
  for (let i = 0; i < gemeinsam; i += 1) {
    const x = links[i].codePointAt(0);
    const y = rechts[i].codePointAt(0);
    if (x !== y) return x - y;
  }
  return links.length - rechts.length;
}

// Die Identität eines Gegenstands als Zeichenkette, für die Doppelten-Prüfung.
// Der Trenner ist das Null-Zeichen, weil es in keinem der drei Teile vorkommt.
// Es entsteht aus seinem Code-Punkt: Prettier schreibt ein Steuerzeichen-Escape
// in einem Literal zum unsichtbaren Zeichen um, und eine Quelldatei mit einem
// rohen Null-Zeichen gilt den Werkzeugen als binär.
const TRENNER = String.fromCharCode(0);
function identitaet(eintrag) {
  return [eintrag.schluessel, eintrag.art, eintrag.nummer === null ? '' : eintrag.nummer].join(
    TRENNER,
  );
}

// Ein einmal geprüfter Vertrag, der laut bricht (Entwicklungsrichtlinien,
// Kapitel 3): Ein unbrauchbarer Eintrag wird nicht still übergangen, denn eine
// Ordnung, die einen Gegenstand verschluckt, nähme eine Sperre nicht, ohne dass
// es jemand merkte.
function pruefeEintrag(eintrag, stelle) {
  if (!eintrag || typeof eintrag !== 'object') {
    throw new TypeError(`ordneSperrGegenstaende: Eintrag ${stelle} ist kein Objekt`);
  }
  // Die Art steht vor dem Schlüssel, weil sie bestimmt, ob überhaupt einer
  // erwartet wird (4T-001820, B1).
  if (RANG_JE_ART[eintrag.art] === undefined) {
    throw new TypeError(
      `ordneSperrGegenstaende: Eintrag ${stelle} mit unbekannter Art ${String(eintrag.art)}`,
    );
  }
  if (istBereichsweit(eintrag.art)) {
    // Ein bereichsweiter Gegenstand MIT Tabellen-Schlüssel ist kein Sonderfall,
    // sondern ein Irrtum des Aufrufers: Er hätte zwei verschiedene Gegenstände
    // unter derselben Art, von denen die Sperre nur einen kennt.
    if (eintrag.schluessel !== '') {
      throw new TypeError(
        `ordneSperrGegenstaende: Eintrag ${stelle} der Art ${eintrag.art} mit Tabellen-Schlüssel`,
      );
    }
    return;
  }
  if (typeof eintrag.schluessel !== 'string' || eintrag.schluessel === '') {
    throw new TypeError(`ordneSperrGegenstaende: Eintrag ${stelle} ohne Vergleichs-Schlüssel`);
  }
  if (eintrag.art === ART_DATENSATZ && !Number.isInteger(eintrag.nummer)) {
    throw new TypeError(`ordneSperrGegenstaende: Datensatz ${stelle} ohne Nummer`);
  }
}

/**
 * Bringt eine Menge aufgelöster Sperr-Gegenstände in die verbindliche
 * Reihenfolge und entfernt Doppelte.
 *
 * Sortiert wird zuerst nach dem Vergleichs-Schlüssel der Tabelle im
 * Code-Punkt-Vergleich, innerhalb einer Tabelle nach der Art (Definition,
 * Datensätze, Beleg-Datei) und innerhalb der Datensätze aufsteigend nach
 * Nummer. Bereichsweite Gegenstände stehen außerhalb der Tabellen: die
 * Aufräum-Sperre vor allen, der Vorgangs-Zähler hinter allen (4T-001824). Ein
 * Doppelter ist ein Eintrag mit gleichem Schlüssel, gleicher Art und gleicher
 * Nummer; vom ersten Auftreten an bleibt er einmal stehen.
 *
 * Die Einträge selbst werden **unverändert** zurückgegeben, samt aller Felder,
 * die ein Aufrufer an ihnen mitführt; das Modul liest nur Schlüssel, Art und
 * Nummer.
 *
 * @param {Array<{schluessel: string, art: string, nummer: number|null}>} liste
 * @returns {Array<object>} Die geordnete, von Doppelten befreite Liste.
 */
function ordneSperrGegenstaende(liste) {
  if (!Array.isArray(liste)) {
    throw new TypeError('ordneSperrGegenstaende: Liste der Gegenstände erwartet');
  }
  const einmalig = [];
  const gesehen = new Set();
  liste.forEach((eintrag, stelle) => {
    pruefeEintrag(eintrag, stelle);
    const schluessel = identitaet(eintrag);
    if (gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    einmalig.push(eintrag);
  });
  return einmalig.sort((a, b) => {
    // 4T-001820 (B1): Bereichsweite Gegenstände zuerst aus dem Tabellen-Vergleich
    // heraus und ans Ende, sonst entschiede ihr leerer Schlüssel die Reihenfolge.
    // 4T-001824 (B1): die Aufräum-Sperre an den Anfang statt ans Ende.
    const bereich = bereichsSeite(a.art) - bereichsSeite(b.art);
    if (bereich !== 0) return bereich;
    const tabelle = vergleicheCodePunkte(a.schluessel, b.schluessel);
    if (tabelle !== 0) return tabelle;
    const rang = RANG_JE_ART[a.art] - RANG_JE_ART[b.art];
    if (rang !== 0) return rang;
    return (a.nummer || 0) - (b.nummer || 0);
  });
}

module.exports = {
  ART_DATENSATZ,
  ART_DEFINITION,
  ART_CHANGE_LOG,
  ART_COUNTER,
  ART_SWEEP,
  // Exportiert für den Durchlauf-Wächter des Gleichlaufs: Er misst die Arten
  // dieser Ordnung gegen die des Sperr-Speichers und braucht dafür die Menge,
  // nicht eine hier abgeschriebene Liste.
  RANG_JE_ART,
  vergleicheCodePunkte,
  ordneSperrGegenstaende,
};
