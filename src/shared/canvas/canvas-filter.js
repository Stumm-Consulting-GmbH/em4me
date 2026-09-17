// 4T-001771 (Epic 3E-000290): Der Filter über der Karten-Liste einer
// Canvas-Fläche (Story 4S-000950).
//
// **Entscheidung F4 des Product Owners vom 2026-09-15:** Der Ort der Suche ist
// ein Filter-Feld im Panel. Die Regel selbst steht hier — prozessneutral (CJS,
// reine Funktionen, kein DOM, kein Electron, kein Datei-Zugriff), wie der
// übrige Kern und aus demselben Grund: Sie ist ohne Anzeige prüfbar, und die
// Anzeige bekommt ihre Treffer samt Fundstellen geliefert, statt ein zweites
// Mal zu suchen (Muster `search-panel.js`, das die Offsets des Kerns benutzt).
//
// **Eigene Datei und kein Anbau an `canvas-core.js`:** Jener steht am
// 2026-09-15 bei 482 von 500 Code-Zeilen; der Filter hätte sein Budget
// gesprengt, und eine Ausnahme in der Größen-Ratsche ist nach deren eigener
// Regel den genuin tabellarischen Einheiten vorbehalten — was ein Kern-Modul
// nicht ist. Der Schnitt ist zudem fachlich sauber: `canvas-core.js` liest und
// schreibt die Fence, dieses Modul engt eine fertige Liste ein.
//
// **Die Filter-Regel ist die der Kommando-Palette** (`command-palette-filter.js`,
// nachgesehen am 2026-09-15): getrimmter, locale-korrekt kleingeschriebener
// Suchtext als **eine** Teilzeichenkette, kein Wort-für-Wort-Zerlegen, kein
// Muster, kein unscharfer Treffer. Zwei Filter-Felder derselben Anwendung, die
// sich bei derselben Eingabe verschieden verhalten, wären für den Anwender
// nicht erklärbar; die Abgrenzung der Story nennt Muster-Suche ohnehin
// ausdrücklich als nicht enthalten.
'use strict';

/**
 * Normalisiert die Roh-Eingabe des Filter-Feldes (Muster
 * `normalizeFilterQuery` der Kommando-Palette): Trim plus locale-korrektes
 * Kleinschreiben, damit etwa das türkische I nicht falsch fällt.
 *
 * @param {string} text Roh-Eingabe.
 * @returns {string} normalisierter Suchtext; leer, wenn nicht gesucht wird.
 */
function normalisiereCanvasSuche(text) {
  return String(text == null ? '' : text)
    .trim()
    .toLocaleLowerCase();
}

/**
 * Die Fundstellen eines Suchtextes in einem Feld-Wert.
 *
 * Drei Rückgaben, weil «kein Treffer» und «Treffer ohne hervorhebbare Stelle»
 * zwei verschiedene Aussagen sind:
 *
 *   - `null` — der Wert enthält den Suchtext nicht.
 *   - `[]` — er enthält ihn, aber die Stellen sind nicht belastbar: Das
 *     Kleinschreiben hat die Länge verschoben (es gibt Zeichen, aus denen
 *     dabei zwei werden), und ein Index aus der kleingeschriebenen Fassung
 *     zeigte im Original auf die falsche Stelle. Ein Treffer ohne
 *     Hervorhebung ist dann die ehrliche Antwort; eine falsch gesetzte
 *     Hervorhebung wäre die schlechtere.
 *   - `[[von, bis], …]` — die Fundstellen als Halb-offene Bereiche im
 *     **Original-Wert**, in Lese-Reihenfolge und ohne Überlappung.
 *
 * @param {string} wert Der zu durchsuchende Feld-Wert.
 * @param {string} nadel Bereits normalisierter Suchtext.
 * @returns {Array<Array<number>>|null}
 */
function fundStellen(wert, nadel) {
  const text = String(wert == null ? '' : wert);
  if (!nadel || text === '') return null;
  const klein = text.toLocaleLowerCase();
  if (!klein.includes(nadel)) return null;
  if (klein.length !== text.length) return [];
  const stellen = [];
  let ab = 0;
  for (;;) {
    const von = klein.indexOf(nadel, ab);
    if (von < 0) break;
    stellen.push([von, von + nadel.length]);
    ab = von + nadel.length;
  }
  return stellen;
}

// Ein Eintrag ohne Filter: dieselben Felder, dazu die leeren Fundstellen-Sätze.
// Die Anzeige bekommt damit **immer** dieselbe Form, ob gefiltert wird oder
// nicht, und braucht keine zweite Zeichen-Strecke für den ungefilterten Fall.
function ohneStellen(eintrag) {
  const verbindungen = Array.isArray(eintrag.verbindungen) ? eintrag.verbindungen : [];
  return {
    ...eintrag,
    stellen: {},
    verbindungen: verbindungen.map((v) => ({ ...v, stellen: {} })),
  };
}

/**
 * Engt die Liste einer Fläche auf die Einträge ein, die den Suchtext tragen
 * (AK1 bis AK3 der Story 4S-000950).
 *
 * **Durchsucht wird, was auf der Fläche steht** und in der Liste bereits als
 * Feld liegt: der Text einer Karte sowie die Beschriftung von Form und Gruppe
 * (`text`), das Ziel einer Verweis-Karte und der Name des Bildes einer
 * Bild-Karte (`ziel`, beides aus `kartenVerweisText`) und die Beschriftung
 * jeder Verbindung (`verbindungen[].text`). Groß- und Kleinschreibung spielen
 * keine Rolle.
 *
 * **Eine Karte bleibt auch dann, wenn nur eine ihrer Verbindungen trifft** —
 * die Verbindung hat keine eigene Zeile ohne ihre Karte, und eine Trefferliste,
 * die den Träger verschweigt, zeigte den Treffer nirgends. Trifft die Karte
 * dagegen selbst, bleiben **alle** ihre Verbindungen stehen: Sie gehören zu
 * ihr, und sie zu beschneiden nähme dem Treffer gerade den Zusammenhang, wegen
 * dessen er gesucht wurde.
 *
 * **Die Gegenstelle einer Verbindung wird nicht durchsucht.** Sie ist eine
 * Kennung und keine Beschriftung; wer nach der Karte sucht, findet deren Zeile.
 *
 * @param {Array<object>} liste Einträge aus `canvasListe(model)`.
 * @param {string} suche Roh-Eingabe des Filter-Feldes.
 * @returns {Array<object>} die passenden Einträge in unveränderter Reihenfolge,
 *   je Eintrag und je Verbindung um `stellen` ergänzt: ein Satz aus Feld-Name
 *   auf Fundstellen, leer bei einem Feld ohne Treffer.
 */
function canvasListeFiltern(liste, suche) {
  const eintraege = Array.isArray(liste) ? liste : [];
  const nadel = normalisiereCanvasSuche(suche);
  if (!nadel) return eintraege.map(ohneStellen);
  const treffer = [];
  for (const eintrag of eintraege) {
    const imText = fundStellen(eintrag.text, nadel);
    const imZiel = fundStellen(eintrag.ziel, nadel);
    const selbst = imText !== null || imZiel !== null;
    const verbindungen = [];
    for (const verbindung of Array.isArray(eintrag.verbindungen) ? eintrag.verbindungen : []) {
      const imLabel = fundStellen(verbindung.text, nadel);
      if (!selbst && imLabel === null) continue;
      verbindungen.push({ ...verbindung, stellen: imLabel ? { text: imLabel } : {} });
    }
    if (!selbst && verbindungen.length === 0) continue;
    const stellen = {};
    if (imText) stellen.text = imText;
    if (imZiel) stellen.ziel = imZiel;
    treffer.push({ ...eintrag, stellen, verbindungen });
  }
  return treffer;
}

module.exports = { normalisiereCanvasSuche, fundStellen, canvasListeFiltern };
