// 4T-001452 (Epic 3E-000190): Auflösung eines Verknüpfungs-Links über die
// Bereichs-Grenze — vom Kürzel zur Datei im verknüpften Bereich.
//
// Zwei Stufen, in dieser Reihenfolge (Entscheidung P1 des Product Owners vom
// 2026-09-05, Weg b):
//   1. WURZEL-RELATIV rechnen. Kostet nichts und trifft den häufigen Fall.
//   2. Nur wenn das nichts findet: NAMENS-SUCHE im verknüpften Bereich.
//      Sie stellt her, was der Anwender vom eigenen Bereich kennt — dort
//      findet `[[Datei]]` die Datei überall im Baum, weil der Index sie
//      kennt. Ohne die zweite Stufe funktionierte `[[@zt:Datei]]` nur in der
//      Wurzel des verknüpften Bereichs, und dieser Sonderfall behielte
//      niemand im Kopf.
//
// Warum kein Index für den verknüpften Bereich: Der Index kennt genau EINE
// Wurzel je Eintrag (`resolveRootInfo`, src/main/index/store.js), und die
// eingehende Richtung bleibt in Stufe 1 ausdrücklich draußen (Entscheidung E3
// der Konzept-Stufe 4T-001368). Ein zweiter Index wäre ein eigener
// Architektur-Schritt. Der Scan hier ersetzt ihn NICHT — er beantwortet eine
// einzelne Frage und behält nichts.
//
// Die Einschließung bleibt in beiden Stufen: Was nicht innerhalb der
// verknüpften Wurzel liegt, kommt nicht zurück. Geprüft wird mit derselben
// einen Innerhalb-Prüfung wie überall sonst (area-path.js).
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { isInsideArea } = require('./area-path');
const { findAreaLink } = require('./area-links');
const { normalizeAreaPrefix } = require('../../shared/area-link-syntax');
const { normalizeNameKey, MD_EXT_RE } = require('../../shared/markdown/link-scan.js');
const { isIgnoredDirName } = require('../backlinks');

// Obergrenze der Namens-Suche. Sie ist kein Leistungs-Schutz — der Scan kostet
// gemessen 27 ms je 1000 Dateien (src/main/area/area-search.js) —, sondern ein
// Riegel gegen einen versehentlich verknüpften Riesen-Ordner, etwa ein
// Laufwerks-Wurzelverzeichnis. Wird sie erreicht, liefert die Suche das
// bisher Gefundene und meldet den Abbruch.
const MAX_SCAN_DATEIEN = 50000;

/**
 * Rechnet ein Ziel wurzel-relativ in den verknuepften Bereich.
 *
 * Reine Pfad-Rechnung ohne Datei-Zugriff. Liefert null bei einem Ausbruch aus
 * der verknuepften Wurzel ('..'-Segmente, absolute Angaben ausserhalb) und
 * wenn das Ziel die Wurzel selbst waere.
 *
 * @param {string} wurzel Wurzel des verknuepften Bereichs.
 * @param {string} ziel Ziel-Teil des Links, ohne Kuerzel und ohne Anker.
 * @returns {string|null} Absoluter Pfad oder null.
 */
function pfadImVerknuepftenBereich(wurzel, ziel) {
  if (typeof wurzel !== 'string' || wurzel === '') return null;
  if (typeof ziel !== 'string' || ziel.trim() === '') return null;
  const absolut = path.resolve(wurzel, ziel.trim());
  if (!isInsideArea(wurzel, absolut)) return null;
  if (path.resolve(wurzel) === absolut) return null;
  return absolut;
}

/**
 * Vergleichs-Name eines Ziels: ohne Ordner-Anteil, ohne Markdown-Endung,
 * gefaltet wie im Index (normalizeNameKey).
 *
 * Bewusst dieselbe Faltung wie der Backlinks-Index: Was im eigenen Bereich als
 * derselbe Name gilt, muss im verknuepften Bereich ebenso gelten, sonst
 * verhielte sich derselbe Link je nach Seite der Grenze verschieden.
 *
 * @param {string} ziel Ziel-Teil des Links.
 * @returns {string} Vergleichs-Name oder ''.
 */
function vergleichsName(ziel) {
  const roh = String(ziel || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return normalizeNameKey(roh.replace(MD_EXT_RE, ''));
}

/**
 * Sucht im verknuepften Bereich eine Markdown-Datei mit passendem Namen.
 *
 * Ignoriert dieselben Ordner wie der Index-Scan (isIgnoredDirName), damit
 * Suchraum und Index-Suchraum nicht auseinanderlaufen. Ein nicht lesbarer
 * Ordner wird uebersprungen statt den Scan abzubrechen (Fehler pro Knoten).
 *
 * @param {string} wurzel Wurzel des verknuepften Bereichs.
 * @param {string} name Vergleichs-Name aus vergleichsName.
 * @returns {Promise<{treffer: string[], abgebrochen: boolean}>} Alle Treffer in
 *   stabiler Reihenfolge; abgebrochen = Obergrenze erreicht.
 */
async function sucheNachName(wurzel, name) {
  const treffer = [];
  if (!name) return { treffer, abgebrochen: false };
  const ordner = [wurzel];
  let gesehen = 0;
  let abgebrochen = false;
  while (ordner.length > 0) {
    const dir = ordner.shift();
    let eintraege;
    try {
      eintraege = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // nicht lesbarer Ordner: ueberspringen, nicht abbrechen
    }
    for (const eintrag of eintraege) {
      if (eintrag.isDirectory()) {
        if (!isIgnoredDirName(eintrag.name)) ordner.push(path.join(dir, eintrag.name));
        continue;
      }
      if (!eintrag.isFile() || !MD_EXT_RE.test(eintrag.name)) continue;
      if (++gesehen > MAX_SCAN_DATEIEN) {
        abgebrochen = true;
        break;
      }
      if (normalizeNameKey(eintrag.name.replace(MD_EXT_RE, '')) === name) {
        treffer.push(path.join(dir, eintrag.name));
      }
    }
    if (abgebrochen) break;
  }
  // Stabile Reihenfolge: Der Scan liefert Verzeichnis-Reihenfolge, die sich
  // zwischen Laeufen aendern kann; bei mehreren Treffern soll derselbe Klick
  // nicht mal hier und mal dort landen.
  treffer.sort((a, b) => a.localeCompare(b, 'de'));
  return { treffer, abgebrochen };
}

/**
 * Loest einen Verknuepfungs-Link auf: vom Kuerzel zur Datei.
 *
 * @param {object} params Eingaben.
 * @param {Array} params.links Verknuepfungen des eigenen Bereichs (normalisiert).
 * @param {string} params.prefix Kuerzel aus dem Link.
 * @param {string} params.target Ziel-Teil ohne Kuerzel (Anker bereits abgetrennt).
 * @param {Function} [params.existiert] Existenz-Pruefung (Einspeisung fuer Tests);
 *   Vorgabe ist ein echter Datei-Zugriff.
 * @param {Function} [params.suche] Namens-Suche (Einspeisung fuer Tests).
 * @returns {Promise<object>} { ok, path, grund, mehrdeutig, wurzel }.
 *   grund: 'kein-kuerzel' | 'nicht-gefunden' | 'ungueltiges-ziel' | 'ziel-offline'.
 */
async function loeseVerknuepfungsLink(params) {
  const { links, prefix, target } = params || {};
  const existiert =
    typeof params.existiert === 'function'
      ? params.existiert
      : async (p) => {
          try {
            const st = await fs.stat(p);
            return st.isFile();
          } catch {
            return false;
          }
        };
  const suche = typeof params.suche === 'function' ? params.suche : sucheNachName;

  const eintrag = findAreaLink(links, prefix);
  // Ein Kuerzel ohne Eintrag loest NICHT auf. Der Link bleibt ein
  // unaufgeloester Wiki-Link; gekennzeichnet wird er vom Linter (4T-001454),
  // nicht hier — zwei Anzeigen fuer denselben Sachverhalt waeren eine zu viel.
  if (!eintrag) return { ok: false, grund: 'kein-kuerzel' };

  const wurzel = eintrag.path;
  // Stufe 1: wurzel-relativ rechnen.
  const direkt = pfadImVerknuepftenBereich(wurzel, target);
  if (direkt === null) return { ok: false, grund: 'ungueltiges-ziel', wurzel };
  if (await existiert(direkt)) return { ok: true, path: direkt, wurzel };

  // Stufe 2: Namens-Suche. Ein nicht erreichbarer Ablage-Ort (getrenntes
  // Laufwerk) ist kein Fehler des Links; er wird als eigener Grund gemeldet,
  // damit der Aufrufer ihn vom echten Nicht-Gefunden unterscheiden kann.
  try {
    await fs.access(wurzel);
  } catch {
    return { ok: false, grund: 'ziel-offline', wurzel };
  }
  const { treffer } = await suche(wurzel, vergleichsName(target));
  if (treffer.length === 0) return { ok: false, grund: 'nicht-gefunden', wurzel };
  // Bei mehreren gleichnamigen Dateien gewinnt der erste Treffer der stabilen
  // Reihenfolge; die Mehrdeutigkeit wird gemeldet, damit der Aufrufer sie
  // spaeter zur Auswahl stellen kann, ohne dass sich hier etwas aendert.
  return {
    ok: true,
    path: treffer[0],
    wurzel,
    mehrdeutig: treffer.length > 1 ? treffer : undefined,
  };
}

/**
 * Liegt ein Pfad innerhalb einer der eingetragenen Verknuepfungen?
 *
 * Das ist die eine Stelle, an der die praezisierte Zusicherung der
 * Bereichsgrenze gerechnet wird (Entscheidung P2): Eine Bereichs-Applikation
 * enthaelt nichts, was der Anwender nicht selbst verknuepft hat.
 *
 * @param {Array} links Verknuepfungen des eigenen Bereichs (normalisiert).
 * @param {string} zielPfad Zu pruefender Pfad.
 * @returns {boolean} true, wenn der Pfad in einem verknuepften Bereich liegt.
 */
function liegtInVerknuepftemBereich(links, zielPfad) {
  if (typeof zielPfad !== 'string' || zielPfad === '') return false;
  const absolut = path.resolve(zielPfad);
  for (const eintrag of links || []) {
    if (eintrag && eintrag.path && isInsideArea(eintrag.path, absolut)) return true;
  }
  return false;
}

/**
 * Darf eine Bereichs-Applikation diesen Pfad lesen?
 *
 * Die harte Bereichsgrenze aus 4T-000323 mit ihrer benannten Ausnahme. Die
 * Zusicherung aus 4S-000252 ist damit PRAEZISIERT und nicht aufgegeben
 * (Entscheidung P2 des Product Owners vom 2026-09-05): Eine Bereichs-
 * Applikation enthaelt nichts, was der Anwender nicht SELBST verknuepft hat.
 * Tragend dafuer ist, dass die Menge der erreichbaren Wurzeln aus einem
 * willentlichen Eintrag in der Bereichsdatei stammt und nicht aus einem Link —
 * ein fremdes Dokument kann sich keinen Zugang verschaffen, indem es einen
 * Link schreibt.
 *
 * Die Verknuepfungen werden erst gelesen, wenn die eigene Grenze bereits
 * «ausserhalb» gesagt hat: Der haeufige Fall innerhalb des Bereichs zahlt
 * keinen Datei-Zugriff. Ein Fehler beim Lesen schliesst die Grenze (fail
 * closed).
 *
 * @param {string} eigeneWurzel Wurzel der Bereichs-Applikation.
 * @param {string} zielPfad Zu lesender Pfad.
 * @param {Function} readAreaLinks Leser der Sektion areaLinks.
 * @returns {Promise<boolean>} true, wenn gelesen werden darf.
 */
async function darfBereichLesen(eigeneWurzel, zielPfad, readAreaLinks) {
  if (isInsideArea(eigeneWurzel, zielPfad)) return true;
  try {
    const links = await readAreaLinks(eigeneWurzel);
    return liegtInVerknuepftemBereich(links, zielPfad);
  } catch {
    return false;
  }
}

/**
 * Prueft die eingetragenen Verknuepfungen eines Bereichs und ordnet jede einem
 * von drei Befunden zu (4T-001453, Entscheidung E4 der Konzept-Stufe).
 *
 * Die Unterscheidung laeuft ueber die Erreichbarkeit des UEBERGEORDNETEN
 * Ablage-Orts und nicht ueber den Ziel-Ordner allein. Der Grund steht im
 * Gegenbeispiel: Ein fehlender Ziel-Ordner sagt fuer sich genommen nichts
 * darueber aus, ob er verschoben wurde oder ob gerade nur das Laufwerk fehlt —
 * und beide Faelle verlangen gegenteiliges Verhalten.
 *
 *   - 'ok'          Ziel-Ordner vorhanden.
 *   - 'verschoben'  Ablage-Ort erreichbar, Ziel-Ordner fehlt. Der Anwender wird
 *                   um den neuen Pfad gebeten; unterbleibt die Angabe, gelten
 *                   die betroffenen Links als UNGUELTIG.
 *   - 'offline'     Ablage-Ort nicht erreichbar. Warnung ohne Ungueltigkeit —
 *                   ein getrenntes Laufwerk darf keine Verknuepfung zerstoeren.
 *
 * Die Pruefung wirft nie und verhindert nichts; sie liefert einen Befund. Das
 * Oeffnen des Bereichs haengt nicht an ihr (Muster der Start-Seiten-Pruefung:
 * die Verknuepfung ist eine Bequemlichkeit, kein Tor).
 *
 * @param {Array} links Verknuepfungen des Bereichs (normalisiert).
 * @param {Function} [erreichbar] Erreichbarkeits-Pruefung eines Pfades
 *   (Einspeisung fuer Tests); Vorgabe ist ein echter Datei-Zugriff.
 * @returns {Promise<Array<{prefix: string, path: string, befund: string}>>} Je
 *   Verknuepfung ein Befund, in der Reihenfolge der Eintraege.
 */
async function pruefeVerknuepfungen(links, erreichbar) {
  const pruefe =
    typeof erreichbar === 'function'
      ? erreichbar
      : async (ziel) => {
          try {
            await fs.access(ziel);
            return true;
          } catch {
            return false;
          }
        };
  const befunde = [];
  for (const eintrag of links || []) {
    if (!eintrag || typeof eintrag.path !== 'string' || eintrag.path === '') continue;
    let befund;
    if (await pruefe(eintrag.path)) {
      befund = 'ok';
    } else {
      // Der uebergeordnete Ablage-Ort entscheidet. path.dirname einer Wurzel
      // liefert bei einem Laufwerks-Stamm den Stamm selbst; dann ist die Frage
      // nach dem Uebergeordneten gegenstandslos und der Fall gilt als offline,
      // weil ein nicht erreichbarer Stamm nie eine Verschiebung belegt.
      const oben = path.dirname(eintrag.path);
      const obenIstStamm = path.resolve(oben) === path.resolve(eintrag.path);
      befund = !obenIstStamm && (await pruefe(oben)) ? 'verschoben' : 'offline';
    }
    befunde.push({ prefix: eintrag.prefix, path: eintrag.path, befund });
  }
  return befunde;
}

/**
 * Die Kuerzel, deren Verknuepfung als UNGUELTIG gilt — also nur die
 * verschobenen, nicht die offline liegenden (E4). Der Linter markiert genau
 * diese Links (4T-001454).
 *
 * @param {Array} befunde Ergebnis aus pruefeVerknuepfungen.
 * @returns {string[]} Kuerzel der ungueltigen Verknuepfungen.
 */
function ungueltigeKuerzel(befunde) {
  return (befunde || []).filter((b) => b && b.befund === 'verschoben').map((b) => b.prefix);
}

// 4T-001454: Anker vom Ziel-Teil trennen. Das erste Rautezeichen trennt, wie
// ueberall im Wiki-Link (wiki.js, live-pass-inline.js, link-navigation.js).
function ankerAbtrennen(ziel) {
  const text = typeof ziel === 'string' ? ziel : '';
  const idx = text.indexOf('#');
  return idx >= 0 ? text.slice(0, idx) : text;
}

/**
 * Beurteilt eine Liste von Verknuepfungs-Links fuer den Linter (4T-001454).
 *
 * Fuenf Urteile, und nur drei davon sind ein Mangel:
 *
 *   - 'ok'            Kuerzel eingetragen, Ziel auffindbar. Kein Mangel.
 *   - 'offline'       Der verknuepfte Bereich ist zurzeit nicht erreichbar.
 *                     KEIN Mangel — ein getrenntes Laufwerk darf keinen Link
 *                     rot faerben (Entscheidung E4).
 *   - 'unbekannt'     Kein Eintrag zu diesem Kuerzel.
 *   - 'verschoben'    Der Eintrag zeigt auf einen Ordner, den es an seinem
 *                     Platz nicht mehr gibt; die Links gelten als ungueltig,
 *                     solange der neue Pfad fehlt (E4, 4T-001453).
 *   - 'nicht-gefunden' Kuerzel und Bereich sind in Ordnung, das Ziel fehlt.
 *
 * Der Bereichs-Zustand wird EINMAL fuer alle Anfragen erhoben und nicht je
 * Link: Ein Dokument mit vierzig Verweisen in denselben Bereich soll ihn nicht
 * vierzigmal befragen.
 *
 * @param {Array} links Verknuepfungen des eigenen Bereichs (normalisiert).
 * @param {Array<{prefix: string, target: string}>} anfragen Zu beurteilende Links.
 * @param {object} [einspeisung] Austauschbare Teile fuer Tests.
 * @param {Function} [einspeisung.pruefe] Erreichbarkeits-Pruefung.
 * @param {Function} [einspeisung.loese] Aufloesung eines einzelnen Links.
 * @returns {Promise<Array<{prefix: string, target: string, urteil: string}>>} Je
 *   Anfrage ein Urteil, in der Reihenfolge der Anfragen.
 */
async function beurteileVerknuepfungsLinks(links, anfragen, einspeisung) {
  const opts = einspeisung || {};
  const loese = typeof opts.loese === 'function' ? opts.loese : loeseVerknuepfungsLink;
  const befunde = await pruefeVerknuepfungen(links, opts.pruefe);
  const zustand = new Map();
  for (const b of befunde) zustand.set(normalizeAreaPrefix(b.prefix), b.befund);

  const urteile = [];
  for (const anfrage of anfragen || []) {
    const prefix = anfrage && anfrage.prefix;
    const target = anfrage && anfrage.target;
    const schluessel = normalizeAreaPrefix(prefix);
    const befund = zustand.get(schluessel);
    if (befund === undefined) {
      urteile.push({ prefix, target, urteil: 'unbekannt' });
      continue;
    }
    if (befund !== 'ok') {
      // 'verschoben' und 'offline' wandern unveraendert durch: Der Linter
      // entscheidet an ihnen, ob er markiert, und das ist genau die Stelle,
      // an der die beiden Faelle auseinandergehen.
      urteile.push({ prefix, target, urteil: befund });
      continue;
    }
    // Der Anker gehoert NICHT in die Aufloesung: Sie sucht eine Datei, und
    // 'Notiz#Kapitel' ist keine. Der Klick-Weg trennt ihn ab, bevor er
    // aufloest (link-navigation.js); der Linter bekommt den Ziel-Teil aber
    // samt Anker und muss dasselbe tun. Ohne diesen Schritt galt jeder
    // Verweis mit Anker als «nicht gefunden» und wurde faelschlich markiert,
    // obwohl der Klick ihn oeffnete.
    //
    // Geprueft wird allein, ob die DATEI auffindbar ist. Ob der Anker in ihr
    // existiert, bleibt ungeprueft — das hiesse, die Datei im verknuepften
    // Bereich zu lesen und ihre Ueberschriften zu bestimmen, und die
    // eingehende Richtung bleibt in Stufe 1 ausdruecklich draussen (E3).
    const ohneAnker = ankerAbtrennen(target);
    const treffer = await loese({ links, prefix, target: ohneAnker });
    urteile.push({ prefix, target, urteil: treffer && treffer.ok ? 'ok' : 'nicht-gefunden' });
  }
  return urteile;
}

module.exports = {
  MAX_SCAN_DATEIEN,
  pfadImVerknuepftenBereich,
  vergleichsName,
  sucheNachName,
  loeseVerknuepfungsLink,
  liegtInVerknuepftemBereich,
  darfBereichLesen,
  pruefeVerknuepfungen,
  ungueltigeKuerzel,
  beurteileVerknuepfungsLinks,
};
