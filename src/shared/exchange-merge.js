// 4T-001588 (Story 4S-000904, Epic 3E-000160): Zusammenführung einer
// eingelesenen Austausch-Datei mit dem vorhandenen Bestand.
//
// **Dieses Modul entscheidet, was geschehen soll — es tut nichts.** Es liest
// keinen Speicher, es schreibt keinen, es kennt weder Electron noch DOM. Es
// bekommt den Ist-Stand und die Abschnitte der Datei und liefert einen Plan
// samt der fertigen Werte; wer sie wohin schreibt, entscheidet der
// Hauptprozess. Das ist dieselbe Trennung wie auf der Ausgabe-Seite
// (`exchange-collect.js`) und der Grund, aus dem sich die heiklen Fälle —
// Namens-Kollision über mehrere Datenarten, Datei aus einer neueren Fassung,
// Verweis auf ein umbenanntes Makro — ohne eingerichtete Installation prüfen
// lassen.
//
// **Die Regel selbst steht nicht hier, sondern in `exchange-data-kinds.js`:**
// Ergänzt wird, was der Anwender als benannten Gegenstand angelegt hat;
// ersetzt wird, was eine Einstellung oder eine Anordnung ist (Entscheidung des
// Product Owners vom 2026-09-08). Hier liegen die drei Formen, in denen diese
// Regel ausgeführt wird.
//
// **Nichts wird still übergangen** (Zug-Entscheidung Z3). Jede Abweichung vom
// geradlinigen Fall — übersprungener Abschnitt, umbenannter Eintrag,
// verworfener Pfad, doppeltes Lesezeichen — steht im Plan und damit in der
// Vorschau und im Bericht.
'use strict';

const {
  dataKindById,
  MERGE_REPLACE,
  MERGE_APPEND,
  MERGE_APPEND_TREE,
  holeTief,
  setzeTief,
} = require('./exchange-data-kinds.js');

// --- Kleine Helfer -----------------------------------------------------------

function kopiere(wert) {
  return wert === undefined ? undefined : JSON.parse(JSON.stringify(wert));
}

// Grundtyp in der Sprache der `formen`-Deklaration. Eine Liste ist kein
// Objekt: Genau diese Unterscheidung trennt eine gültige Sektion von einer,
// deren Struktur sich in einer neueren Programm-Fassung geändert hat.
function grundtyp(wert) {
  if (Array.isArray(wert)) return 'array';
  if (wert !== null && typeof wert === 'object') return 'object';
  return 'wert';
}

/**
 * Freier Name neben einem vorhandenen: «Muster» wird zu «Muster (2)».
 *
 * Bewusst rein numerisch und NICHT übersetzt: Der Zusatz landet im
 * Datenbestand des Anwenders und nicht in der Oberfläche; ein übersetztes
 * Wort stünde nach dem nächsten Sprachwechsel falsch da.
 *
 * @param {string} name
 * @param {Set<string>} belegt
 * @returns {string}
 */
function freierName(name, belegt) {
  const stamm = String(name === undefined || name === null ? '' : name);
  let n = 2;
  let kandidat = `${stamm} (${n})`;
  while (belegt.has(kandidat)) {
    n += 1;
    kandidat = `${stamm} (${n})`;
  }
  return kandidat;
}

/**
 * Freie Kennung neben einer vorhandenen: angehängte Ziffern.
 *
 * Bewusst durch Anhängen von Ziffern und nicht durch einen Bindestrich-Zusatz:
 * Die Kennung einer Makro-Definition muss rein alphanumerisch bleiben
 * (`normalizeMacro` verwirft alles andere), und eine Regel, die für neun
 * Datenarten gilt und für die zehnte nicht, wäre keine Regel.
 *
 * @param {string} id
 * @param {Set<string>} belegt
 * @returns {string}
 */
function freieId(id, belegt) {
  const stamm = String(id === undefined || id === null ? '' : id);
  let n = 2;
  while (belegt.has(`${stamm}${n}`)) n += 1;
  return `${stamm}${n}`;
}

// --- Die drei Formen der Zusammenführung --------------------------------------

/**
 * `append`: die benannten Listen ergänzen, den Rest des Werts ersetzen.
 *
 * Der vorhandene Eintrag bleibt dabei als Ganzes unangetastet — er wird nicht
 * verglichen, nicht überschrieben und nicht ergänzt. Der eingelesene tritt
 * daneben. Das ist die Zusicherung, um die es in diesem Task geht: Was der
 * Anwender selbst angelegt hat, kann eine fremde Datei nicht verändern.
 *
 * @param {object} deklaration `merge`-Block der Datenart.
 * @param {object} istWerte Ist-Stand unter seinen Pfaden.
 * @param {object} neuWerte Eingelesene Werte unter denselben Pfaden.
 * @param {Map<string,string>} idAbbildung Sammelstelle umbenannter Verweis-Kennungen.
 * @returns {{values: object, umbenannt: Array, abgewiesen: string[], hinzu: number}}
 */
function ergaenzeListen(deklaration, istWerte, neuWerte, idAbbildung) {
  const ergebnis = {};
  const umbenannt = [];
  const abgewiesen = [];
  let hinzu = 0;

  // Jeder Pfad der Datenart wird zunächst ersetzt; die Listen setzen darauf.
  for (const pfad of Object.keys(neuWerte)) ergebnis[pfad] = kopiere(neuWerte[pfad]);

  for (const liste of deklaration.lists || []) {
    const { path: pfad, at, idKey, nameKey, refs, refPrefix, pruefe } = liste;
    if (!(pfad in neuWerte)) continue;

    const istListe = holeTief(istWerte[pfad], at);
    const neuListe = holeTief(neuWerte[pfad], at);
    if (!Array.isArray(neuListe)) continue;
    const vorhanden = Array.isArray(istListe) ? istListe : [];

    const belegteIds = new Set(
      vorhanden.map((e) => (e && idKey ? e[idKey] : undefined)).filter((v) => v !== undefined),
    );
    const belegteNamen = new Set(
      vorhanden.map((e) => (e && nameKey ? e[nameKey] : undefined)).filter((v) => v !== undefined),
    );

    const zusammen = vorhanden.map((e) => kopiere(e));
    // Wohin ein eingelesener Eintrag gewandert ist: Grundlage der
    // Verweis-Korrektur weiter unten.
    const stelleFuerAlteId = new Map();
    for (const roh of neuListe) {
      const eintrag = kopiere(roh);
      if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) continue;
      const alteId = idKey ? eintrag[idKey] : undefined;

      // 4T-001590: Die Eintrags-Pruefung der Datenart, sofern sie eine hat.
      // Sie sitzt VOR der Umbenennung, weil sie den Gegenstand misst und
      // nicht seinen Namen. Ein Eintrag, der sie nicht besteht, wird nicht
      // uebernommen und erscheint mit seinem Namen im Bericht: Ein halber
      // Eintrag waere schlimmer als keiner, und ein stillschweigend
      // weggelassener ebenso (Zug-Entscheidung Z3).
      if (typeof pruefe === 'function' && !pruefe(eintrag)) {
        const bezeichnung = nameKey && eintrag[nameKey] !== undefined ? eintrag[nameKey] : alteId;
        abgewiesen.push(String(bezeichnung === undefined ? '' : bezeichnung));
        continue;
      }

      if (idKey && belegteIds.has(eintrag[idKey])) {
        const neu = freieId(alteId, belegteIds);
        eintrag[idKey] = neu;
        if (refPrefix) idAbbildung.set(refPrefix + alteId, refPrefix + neu);
      }
      if (idKey && eintrag[idKey] !== undefined) belegteIds.add(eintrag[idKey]);

      if (nameKey && belegteNamen.has(eintrag[nameKey])) {
        const alt = eintrag[nameKey];
        const neu = freierName(alt, belegteNamen);
        eintrag[nameKey] = neu;
        umbenannt.push({ von: String(alt), nach: neu });
      }
      if (nameKey && eintrag[nameKey] !== undefined) belegteNamen.add(eintrag[nameKey]);

      if (alteId !== undefined) stelleFuerAlteId.set(alteId, eintrag[idKey]);
      zusammen.push(eintrag);
      hinzu += 1;
    }
    ergebnis[pfad] = setzeTief(ergebnis[pfad], at, zusammen);

    // Verweise NEBEN der Liste, die eine Umbenennung mittragen müssen: der
    // Aktiv-Verweis eines Farbschemas zeigte sonst auf eine Kennung, die es
    // nach der Zusammenführung nicht mehr gibt — `normalizeState` setzte ihn
    // dann still auf die Vorgabe zurück, und der Anwender bekäme sein eben
    // eingelesenes Schema gar nicht zu sehen.
    for (const weg of refs || []) {
      const wert = holeTief(ergebnis[pfad], weg);
      if (typeof wert !== 'string') continue;
      const neueId = stelleFuerAlteId.get(wert);
      if (neueId !== undefined && neueId !== wert) {
        ergebnis[pfad] = setzeTief(ergebnis[pfad], weg, neueId);
      }
    }
  }
  return { values: ergebnis, umbenannt, abgewiesen, hinzu };
}

// Alle Kennungen eines Lesezeichen-Baums (Ordner wie Dateien).
function baumIds(knoten, aus) {
  const menge = aus || new Set();
  for (const n of Array.isArray(knoten) ? knoten : []) {
    if (!n || typeof n !== 'object') continue;
    if (typeof n.id === 'string') menge.add(n.id);
    if (Array.isArray(n.children)) baumIds(n.children, menge);
  }
  return menge;
}

// Alle Datei-Ziele eines Lesezeichen-Baums.
function baumZiele(knoten, aus) {
  const menge = aus || new Set();
  for (const n of Array.isArray(knoten) ? knoten : []) {
    if (!n || typeof n !== 'object') continue;
    if (n.type === 'file' && typeof n.filePath === 'string') menge.add(n.filePath);
    if (Array.isArray(n.children)) baumZiele(n.children, menge);
  }
  return menge;
}

// Kennungen eines eingelesenen Teilbaums auf freie umschreiben. Die Kennung
// ist technisch und dem Anwender unsichtbar; sie wird deshalb ohne Meldung
// vergeben, während eine Namens-Änderung immer im Bericht steht.
function frischeIds(knoten, belegt) {
  const aus = [];
  for (const roh of Array.isArray(knoten) ? knoten : []) {
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) continue;
    const n = kopiere(roh);
    if (typeof n.id === 'string' && belegt.has(n.id)) n.id = freieId(n.id, belegt);
    if (typeof n.id === 'string') belegt.add(n.id);
    if (Array.isArray(n.children)) n.children = frischeIds(n.children, belegt);
    aus.push(n);
  }
  return aus;
}

/**
 * `appendTree`: die Wurzel-Ebene eines Knoten-Baums ergänzen.
 *
 * Zwei Regeln, die sich aus dem Gegenstand ergeben:
 *
 * Ein Datei-Knoten der Wurzel-Ebene, dessen Ziel im vorhandenen Baum schon
 * steht, wird ÜBERSPRUNGEN — ein zweites Lesezeichen auf dieselbe Datei ist
 * kein Gewinn, sondern Unordnung. Er erscheint als übersprungen im Bericht.
 *
 * Ein Ordner kommt dagegen IMMER als Ganzes mit, auch wenn er Ziele enthält,
 * die anderswo schon stehen. Der Ordner ist die Ordnungs-Arbeit des Anwenders;
 * ihn zu durchlöchern wäre schlimmer als ein doppelter Eintrag darin.
 *
 * @param {Array} istBaum
 * @param {Array} neuBaum
 * @returns {{baum: Array, umbenannt: Array, hinzu: number, uebersprungen: number}}
 */
function ergaenzeBaum(istBaum, neuBaum) {
  const vorhanden = Array.isArray(istBaum) ? istBaum : [];
  const neue = Array.isArray(neuBaum) ? neuBaum : [];
  const belegteIds = baumIds(vorhanden);
  const belegteNamen = new Set(
    vorhanden.filter((n) => n && n.type === 'folder').map((n) => n.name),
  );
  const belegteZiele = baumZiele(vorhanden);

  const ergebnis = vorhanden.map((n) => kopiere(n));
  const umbenannt = [];
  let hinzu = 0;
  let uebersprungen = 0;

  for (const roh of neue) {
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) continue;
    if (roh.type === 'file' && typeof roh.filePath === 'string' && belegteZiele.has(roh.filePath)) {
      uebersprungen += 1;
      continue;
    }
    const [knoten] = frischeIds([roh], belegteIds);
    if (!knoten) continue;
    if (knoten.type === 'folder' && belegteNamen.has(knoten.name)) {
      const alt = knoten.name;
      knoten.name = freierName(alt, belegteNamen);
      umbenannt.push({ von: String(alt), nach: knoten.name });
    }
    if (knoten.type === 'folder') belegteNamen.add(knoten.name);
    if (knoten.type === 'file' && typeof knoten.filePath === 'string') {
      belegteZiele.add(knoten.filePath);
    }
    ergebnis.push(knoten);
    hinzu += 1;
  }
  return { baum: ergebnis, umbenannt, hinzu, uebersprungen };
}

/**
 * Zieht Verweise auf umbenannte Kennungen nach.
 *
 * Wirkt über ALLE Datenarten hinweg und nicht nur innerhalb der eigenen: Eine
 * Format-Toolbar oder eine Statusleisten-Schaltfläche verweist über
 * `macro.<Kennung>` auf ein Makro, das die Datenart daneben umbenannt hat. Ein
 * Verweis auf ein Makro, das gar nicht mitkam, bleibt unberührt — er war schon
 * in der Datei ohne Ziel.
 *
 * Ersetzt wird nur eine Zeichenkette, die einer umbenannten Kennung GENAU
 * entspricht; eine Teil-Ersetzung im Text käme einer Suchen-und-Ersetzen-Fahrt
 * durch fremde Daten gleich.
 *
 * @param {*} wert
 * @param {Map<string,string>} abbildung
 * @returns {*}
 */
function ziehVerweiseNach(wert, abbildung) {
  if (!abbildung || abbildung.size === 0) return wert;
  if (typeof wert === 'string') return abbildung.has(wert) ? abbildung.get(wert) : wert;
  if (Array.isArray(wert)) return wert.map((e) => ziehVerweiseNach(e, abbildung));
  if (wert !== null && typeof wert === 'object') {
    const aus = {};
    for (const [k, v] of Object.entries(wert)) aus[k] = ziehVerweiseNach(v, abbildung);
    return aus;
  }
  return wert;
}

// --- Der Plan -----------------------------------------------------------------

// Eine Datenart, von der nichts übrig bleibt. Sie verschwindet nicht aus dem
// Plan, sondern steht als übersprungen darin: Der Anwender hat sie in der
// Datei, und dass sie nicht ankommt, ist die Auskunft, die ihm zusteht.
function uebersprungeneDatenart(kind, verworfen) {
  return {
    id: kind.id,
    labelKey: kind.labelKey,
    areaSection: kind.areaSection || null,
    action: 'skip',
    grund: 'form',
    verworfen,
    ersetzt: [],
    umbenannt: [],
    abgewiesen: [],
    hinzu: 0,
    uebersprungen: 0,
    values: {},
  };
}

/**
 * Baut den Übernahme-Plan aus dem Ist-Stand und den Abschnitten der Datei.
 *
 * @param {Array} gesammelt Ergebnis von `collectDataKinds` — der Ist-Stand in
 *   genau der Form, in der ihn auch die Ausgabe sieht.
 * @param {Array<{name: string, value: *}>} sections Abschnitte aus `readExchangeFile`.
 * @returns {{kinds: Array, unknownSections: string[]}} Plan; `kinds[].values`
 *   trägt die fertigen Werte, `kinds[].areaSection` unterscheidet den globalen
 *   Speicher von der Bereichsdatei.
 */
function planeUebernahme(gesammelt, sections) {
  const istNach = new Map(
    (Array.isArray(gesammelt) ? gesammelt : []).map((k) => [k.id, k.values || {}]),
  );
  const unknownSections = [];
  const kinds = [];
  const idAbbildung = new Map();

  for (const abschnitt of Array.isArray(sections) ? sections : []) {
    const kind = dataKindById(abschnitt.name);
    if (!kind) {
      unknownSections.push(abschnitt.name);
      continue;
    }
    const istWerte = istNach.get(kind.id) || {};
    const roh = abschnitt.value;

    // Ein Abschnitt trägt seine Werte unter ihren Pfaden (Entscheidung 1 aus
    // 4T-001587). Etwas anderes ist keine Datenart dieses Formats.
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
      kinds.push(uebersprungeneDatenart(kind, [kind.id]));
      continue;
    }

    // Form-Prüfung je Pfad. Ein Pfad in anderer Gestalt wird verworfen und
    // benannt, statt eine fremde Struktur in den Speicher zu lassen.
    const neuWerte = {};
    const verworfen = [];
    const erlaubt = kind.areaSection ? [kind.areaSection] : kind.paths;
    for (const pfad of Object.keys(roh)) {
      // Fail closed in der Gegenrichtung: Was die Registry nicht kennt, kommt
      // nicht in den Speicher — auch nicht aus einer Datei, die eine spätere
      // Programm-Fassung geschrieben hat.
      if (!erlaubt.includes(pfad)) {
        verworfen.push(pfad);
        continue;
      }
      const erwartet = kind.formen ? kind.formen[pfad] : undefined;
      if (erwartet && grundtyp(roh[pfad]) !== erwartet) {
        verworfen.push(pfad);
        continue;
      }
      neuWerte[pfad] = kopiere(roh[pfad]);
    }

    if (Object.keys(neuWerte).length === 0) {
      kinds.push(uebersprungeneDatenart(kind, verworfen));
      continue;
    }

    const modus = kind.merge ? kind.merge.mode : MERGE_REPLACE;
    if (modus === MERGE_APPEND) {
      const { values, umbenannt, abgewiesen, hinzu } = ergaenzeListen(
        kind.merge,
        istWerte,
        neuWerte,
        idAbbildung,
      );
      kinds.push({
        id: kind.id,
        labelKey: kind.labelKey,
        areaSection: kind.areaSection || null,
        action: 'append',
        verworfen,
        ersetzt: Object.keys(values),
        umbenannt,
        abgewiesen,
        hinzu,
        uebersprungen: 0,
        values,
      });
    } else if (modus === MERGE_APPEND_TREE) {
      const pfad = kind.merge.path;
      const { baum, umbenannt, hinzu, uebersprungen } = ergaenzeBaum(
        istWerte[pfad],
        neuWerte[pfad],
      );
      kinds.push({
        id: kind.id,
        labelKey: kind.labelKey,
        areaSection: kind.areaSection || null,
        action: 'append',
        verworfen,
        ersetzt: [],
        umbenannt,
        abgewiesen: [],
        hinzu,
        uebersprungen,
        values: { [pfad]: baum },
      });
    } else {
      kinds.push({
        id: kind.id,
        labelKey: kind.labelKey,
        areaSection: kind.areaSection || null,
        action: 'replace',
        verworfen,
        ersetzt: Object.keys(neuWerte),
        umbenannt: [],
        abgewiesen: [],
        hinzu: 0,
        uebersprungen: 0,
        values: neuWerte,
      });
    }
  }

  // Nachlauf über den GANZEN Plan: Erst jetzt stehen alle Umbenennungen fest,
  // und ein Verweis kann in einer Datenart stehen, die vor der umbenannten
  // verarbeitet wurde.
  if (idAbbildung.size > 0) {
    for (const eintrag of kinds) eintrag.values = ziehVerweiseNach(eintrag.values, idAbbildung);
  }

  return { kinds, unknownSections };
}

/**
 * Kurzform des Plans für den Vergleich zwischen Vorschau und Übernahme.
 *
 * Bestätigt wird eine Liste von Wirkungen, nicht eine Datei: Ändert ein
 * anderes Fenster zwischen Vorschau und Klick den Bestand, führte die
 * Übernahme etwas anderes aus als das Bestätigte. Die Signatur macht diesen
 * Fall gegenständlich, statt sich auf seine Unwahrscheinlichkeit zu verlassen.
 *
 * @param {{kinds: Array, unknownSections: string[]}} plan
 * @returns {string}
 */
function planSignatur(plan) {
  const teile = ((plan && plan.kinds) || []).map((k) =>
    [
      k.id,
      k.action,
      k.hinzu,
      k.uebersprungen,
      k.umbenannt.map((u) => `${u.von}>${u.nach}`).join('|'),
      (k.abgewiesen || []).join('|'),
      k.ersetzt.join('|'),
      k.verworfen.join('|'),
    ].join(':'),
  );
  teile.push(`?${((plan && plan.unknownSections) || []).join('|')}`);
  return teile.join(';');
}

module.exports = {
  planeUebernahme,
  planSignatur,
  freierName,
  freieId,
  ergaenzeBaum,
  ziehVerweiseNach,
};
