// 4T-001524 (Epic 3E-000169): Bereichsweites Ersetzen im Hauptprozess.
//
// Hier schreibt die Anwendung zum ersten Mal viele fremde Dateien auf einmal,
// ohne dass ein Anwender jede davon geöffnet hätte. Das prägt jede Festlegung
// dieses Moduls; die Reihenfolge unten ist die ihrer Wichtigkeit.
//
// **Positionen statt Inhalten.** Der Renderer schickt Muster, Flags, den
// Ersetzungs-Text und die ausgewählten Fundstellen als Datei mit Offsets.
// Gelesen und geschrieben wird ausschließlich hier — Dateizugriff gehört in
// den Hauptprozess (Prozess-Schnitt der Entwicklungsrichtlinien), und ein
// Auftrag, der Datei-Inhalte über die Brücke trüge, wäre bei tausend Dateien
// zudem unbezahlbar.
//
// **Die Bereichs-Grenze wird dort geprüft, wo geschrieben wird.** Je Ziel und
// unabhängig davon, was der Renderer schickt (`isInsideArea`, Muster
// `area:createFile` und `area:trashFile`). Ein Ziel außerhalb der Wurzel wird
// abgewiesen und nicht etwa stillschweigend übersprungen: Der Unterschied
// zwischen «nicht gemacht» und «nicht gemeldet» ist genau der, an dem ein
// Anwender einen Datenverlust zu spät bemerkt.
//
// **Die Sicherung ist Teil des Schreibvorgangs, nicht eine Option daneben**
// (Entscheidung E3 des Epics). Vor JEDEM Schreiben liegt der Vor-Stand in der
// Versionshistorie, auch bei abgeschalteter Historisierung — der dritte
// Zwangs-Sicherungs-Fall neben dem erzwungenen Überschreiben und dem geteilten
// Dokument (`src/main/ipc/files.js`). Schlägt die Sicherung fehl, unterbleibt
// das Schreiben dieser Datei. Eine ungesicherte Änderung entsteht nicht.
//
// **Der Bezugs-Stand entscheidet, ob überhaupt geschrieben wird.** Ein Offset
// gilt nur in dem Text, in dem die Suche ihn ermittelt hat. Deshalb wird je
// Datei frisch gelesen und mit genau diesem Stand verglichen
// (`suchStandFuer`); jede Abweichung führt zur Meldung statt zum Schreiben.
// Der Vergleich läuft über den ROHEN Text samt BOM und CRLF, denn die Offsets
// der Suche zählen ebenso — und dadurch bleiben beide von selbst erhalten.
//
// **4T-001671: Der Vergleich läuft auf der Ebene, auf der ermittelt wurde.**
// Trägt eine Datei einen Datensatz-Block, hält der Vorrat sie ohne dessen
// Inhalt; sein Text ist mit keiner Datei zeichengleich, und ein roher Vergleich
// müsste zwangsläufig scheitern und «fremd geändert» melden, obwohl niemand
// etwas geändert hat. Für einen solchen Bezugs-Stand wird der frisch gelesene
// Text derselben Bereinigung unterzogen und **zusätzlich die Rücknahme-Karte
// verglichen**: Sie ist die Rechnung, mit der die Offsets entstanden sind, und
// eine Änderung INNERHALB des Datenblocks verschiebt jede Fundstelle dahinter,
// ohne den bereinigten Text anzutasten. Beides gleich heißt: derselbe Stand.
//
// **Best-Effort über die Dateien hinweg**, wie bei der Verweis-Nachführung
// (`documents/link-update.js`): Ein Fehlschlag je Datei stoppt den Lauf nicht,
// sondern erscheint im Ergebnis. Ein Lauf über zweihundert Dateien, den die
// einundfünfzigste zum Abbruch bringt, hinterließe einen Zustand, den niemand
// beschreiben kann.
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { isInsideArea } = require('./area-path');
const { readPartLine } = require('../../shared/document-parts.js');
// 4T-001526 (Epic 3E-000169): Die Ersetzungs-Regel selbst liegt seit dem
// zweiten Aufrufer (Puffer offener Reiter) im geteilten Kern.
const { baueSuchAusdruck, wendeErsetzungenAn } = require('../../shared/ersetzen-kern.js');
const { suchStandFuer, gibBereichsVorratFrei } = require('./area-search.js');
// 4T-001671: dieselbe Bereinigung, mit der der Bezugs-Stand entstanden ist.
const { bereinigeSuchtext } = require('./area-search-datensaetze.js');
// 4T-001531 (Epic 3E-000175): Der Frontmatter-Anteil der Tag-Umbenennung. Die
// Regel liegt im geteilten Modul, der Schreibweg hier.
const { benenneTagImFrontmatterUm } = require('../../shared/tag-erkennung.js');
const { writeFrontmatter } = require('../../shared/markdown/frontmatter.js');
const selbstSchreib = require('../documents/self-write');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton über den
// Require-Cache), Muster aus link-update.js.
const markSelfWriting = selbstSchreib.merke;

// Die Historie arbeitet auf dem um BOM und CRLF bereinigten Text — symmetrisch
// zu `file:read` und zu `save-guard.normalizeForCompare`. Geschrieben wird
// dagegen der rohe Text; sonst normalisierte ein Ersetzen fremde Dateien still
// mit, die noch nie jemand geöffnet hat.
function normalisiere(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

// Wurzel-relativer, portabler ('/') und NFC-normalisierter Schlüssel — dieselbe
// Form wie im Vorrat der Suche, damit beide dieselbe Datei gleich benennen.
function relPfad(absPfad, wurzel) {
  return path.relative(wurzel, absPfad).split(path.sep).join('/').normalize('NFC');
}

/**
 * Baut die Ersetzen-Strecke.
 *
 * @param {object} deps Abhängigkeiten aus der Verdrahtung.
 * @param {Function} deps.resolveHistoryFor Auflösung der Historisierungs-Schaltung.
 * @param {Function} deps.recordMddOnSave Protokollierung einer Speicherung.
 * @returns {{ersetzeImBereich: Function}} Der Lauf über einen Bereich.
 */
// 4T-001671: Ist der frisch gelesene Text derselbe Stand, auf dem die
// Fundstellen ermittelt wurden?
//
// Bei einem rohen Bezugs-Stand (offener Puffer, Datei ohne Datensatz-Block) ist
// das der zeichengenaue Vergleich wie bisher. Bei einem bereinigten Stand wird
// derselbe Schnitt auf den gelesenen Text angewandt und neben dem Text auch die
// Ruecknahme-Karte verglichen: Ohne sie bliebe eine Aenderung innerhalb des
// Datenblocks unbemerkt, obwohl sie jede Fundstelle dahinter verschiebt.
function istDerselbeStand(roh, bezug) {
  if (!bezug || typeof bezug.text !== 'string') return false;
  if (bezug.ebene !== 'bereinigt') return roh === bezug.text;
  const b = bereinigeSuchtext(roh);
  if (!b) return false;
  if (b.text !== bezug.text) return false;
  return gleicheKarte(b.karte, bezug.karte);
}

function gleicheKarte(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].ab !== y[i].ab || x[i].verschiebung !== y[i].verschiebung) return false;
  }
  return true;
}

function createAreaReplace(deps) {
  const { resolveHistoryFor, recordMddOnSave } = deps;

  // Ein Ziel. Liefert die Zeile, die im Ergebnis erscheint:
  //   { art: 'geaendert', anzahl }  geschrieben
  //   { art: 'veraendert' }         seit der Vorschau geändert, nicht geschrieben
  //   { art: 'fehler', grund }      abgewiesen oder fehlgeschlagen
  //   { art: 'nichts' }             nichts zu tun (kein Offset, gleicher Text)
  async function ersetzeInDatei(lauf, ziel) {
    const { wurzel, muster, flags, ersetzung, regexModus, owner, tag } = lauf;
    const abs = path.resolve(ziel.pfad);

    // AK3: zuerst die Grenze, vor jedem Datei-Zugriff. Ein Ziel außerhalb des
    // Bereichs wird nicht gelesen und nicht geschrieben.
    if (!isInsideArea(wurzel, abs)) return { art: 'fehler', grund: 'ausserhalb' };

    const offsets = [...new Set(ziel.offsets)].sort((a, b) => a - b);
    // 4T-001531 (Epic 3E-000175): Eine Datei kann allein im Frontmatter zu
    // ändern sein — dann gibt es keinen Offset und trotzdem etwas zu tun.
    if (offsets.length === 0 && ziel.frontmatter.length === 0) return { art: 'nichts' };

    const bezug = suchStandFuer(wurzel, relPfad(abs, wurzel));
    if (!bezug) return { art: 'fehler', grund: 'keinVorrat' };

    let roh;
    try {
      roh = await fs.readFile(abs, 'utf8');
    } catch (err) {
      return { art: 'fehler', grund: 'lesen', detail: meldung(err) };
    }

    // Ein Teil eines geteilten Dokuments: Die Suche hat ihre Treffer im
    // ZUSAMMENGESETZTEN Text ermittelt (area-search-teile.js), die Offsets
    // gelten also für ein Dokument, das so auf keiner Platte liegt. Hier zu
    // schreiben hieße, an einer umgerechneten Stelle zu raten. Das Ersetzen in
    // geteilten Dokumenten bleibt deshalb ausdrücklich unbedient und wird als
    // solches gemeldet, statt einen falschen Treffer zu ersetzen.
    if (readPartLine(roh)) return { art: 'fehler', grund: 'geteilt' };

    // AK6: Der Platten-Stand muss der Stand sein, auf dem die Fundstellen
    // ermittelt wurden. Eine offene Datei mit ungespeicherten Änderungen ist
    // der häufigste Fall und bekommt einen eigenen Grund, weil der Anwender
    // dort etwas tun kann (speichern), während er bei einer fremden Änderung
    // nur neu suchen kann.
    if (!istDerselbeStand(roh, bezug)) {
      return bezug.quelle === 'puffer' ? { art: 'fehler', grund: 'offen' } : { art: 'veraendert' };
    }

    // Ersetzt wird ausschliesslich an den uebergebenen Fundstellen; die Regel
    // dafuer teilt sich dieser Weg mit dem Puffer-Weg des Anzeige-Prozesses
    // (4T-001526), damit beide an derselben Stelle dasselbe einsetzen.
    const gewirkt = wendeErsetzungenAn(roh, offsets, { muster, flags, ersetzung, regexModus });
    if (!gewirkt.ok) return { art: 'fehler', grund: gewirkt.grund, detail: gewirkt.detail };

    // 4T-001531 (Epic 3E-000175): Der Frontmatter-Anteil der Tag-Umbenennung.
    // Er läuft NACH den Offsets und auf deren Ergebnis: Die Offsets gelten im
    // ursprünglichen Text, und `writeFrontmatter` setzt den Block neu zusammen
    // — umgekehrt zeigte jeder Fließtext-Offset hinter eine verschobene Grenze.
    // Beide Anteile werden EINMAL geschrieben und einmal gesichert; zwei
    // Schreibvorgänge wären zwei Historien-Einträge für eine Umbenennung.
    let neu = gewirkt.text;
    let fmAnzahl = 0;
    if (ziel.frontmatter.length > 0) {
      const imFeld = benenneTagImFrontmatterUm(neu, {
        alt: tag.alt,
        neu: tag.neu,
        indizes: ziel.frontmatter,
        schreibe: writeFrontmatter,
      });
      if (!imFeld.ok) {
        return imFeld.grund === 'veraendert'
          ? { art: 'veraendert' }
          : { art: 'fehler', grund: imFeld.grund };
      }
      neu = imFeld.text;
      fmAnzahl = imFeld.anzahl;
    }

    // AK7: Ein Ergebnis, das dem Bestand gleicht, ist keine Änderung. Ohne
    // diesen Halt schriebe ein Ersetzen von «Notiz» durch «Notiz» jede
    // getroffene Datei neu und historisierte sie.
    if (neu === roh) return { art: 'nichts' };

    const vorStand = normalisiere(roh);
    const neuStand = normalisiere(neu);

    // AK4 und AK5, die Zwangs-Sicherung (E3). Sie läuft VOR dem Schreiben und
    // unabhängig von der Historisierungs-Einstellung; erst ihr Gelingen gibt
    // das Schreiben frei.
    //
    // Der Vor-Stand kommt aus dem eben gelesenen Text und nicht aus einem
    // zweiten Lesevorgang (`readPreviousTextFor`): Zwischen zwei Lesevorgängen
    // läge ein Zeitfenster, in dem sich die Datei ändern kann — und dann
    // sicherte die Historie einen anderen Stand als den, der gleich
    // überschrieben wird.
    const sicherung = await recordMddOnSave(owner, abs, vorStand, vorStand);
    if (!sicherung || sicherung.ok !== true) {
      return { art: 'fehler', grund: 'sicherung', detail: sicherung && sicherung.grund };
    }

    // Die Schaltung wird vor dem Schreiben aufgelöst, weil sie den Frontmatter
    // des NEUEN Inhalts liest (Muster file:save) — nach dem Schreiben wäre das
    // eine zweite Quelle für dieselbe Aussage.
    let historisiert = false;
    try {
      historisiert = (await resolveHistoryFor(owner, abs, neuStand)).effective;
    } catch (err) {
      // Die Auflösung ist eine Auskunft und keine Zusicherung; ihr Ausfall
      // darf den Lauf nicht anhalten. Der Vor-Stand liegt bereits sicher.
      console.warn('Bereichs-Ersetzen: Historisierungs-Schaltung nicht lesbar:', abs, meldung(err));
    }

    try {
      await ersetzeDateiOderWirf(abs, neu, { markSelfWriting });
    } catch (err) {
      return { art: 'fehler', grund: 'schreiben', detail: meldung(err) };
    }

    // Bei eingeschalteter Historisierung kommt der reguläre Eintrag dazu. Er
    // liegt hinter dem Schreiben wie überall sonst (Schreib-Reihenfolge der
    // Epic-Entscheidung aus 3E-000060: erst .md, dann .mdd) und ist gegenüber
    // der Sicherung oben verlustfrei: Der Vor-Stand steht dort bereits, dieses
    // Paket trägt den Schritt von ihm zum neuen Inhalt nach.
    if (historisiert) await recordMddOnSave(owner, abs, vorStand, neuStand);

    return { art: 'geaendert', anzahl: gewirkt.anzahl + fmAnzahl };
  }

  /**
   * Ersetzt an den ausgewählten Fundstellen eines Bereichs.
   *
   * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
   * @param {object} auftrag
   * @param {string} auftrag.muster Regex-Quelltext, im Renderer aus buildRegex
   *   erzeugt — dieselbe eine Auslegung wie beim Suchlauf.
   * @param {string} auftrag.flags Flags desselben Ausdrucks.
   * @param {string} auftrag.ersetzung Ersetzungs-Text.
   * @param {boolean} auftrag.regexModus Rückverweise im Ersetzungs-Text auswerten.
   * @param {Array<{pfad: string, offsets: number[]}>} auftrag.dateien Ausgewählte
   *   Fundstellen je Datei (absoluter Pfad, Offsets im gesuchten Text).
   * @param {object|null} auftrag.owner Fenster der Anfrage (für die Historie).
   * @returns {Promise<{geaendert: Array, fehlgeschlagen: Array, veraendert: Array}>}
   */
  async function ersetzeImBereich(wurzel, auftrag = {}) {
    const ergebnis = { geaendert: [], fehlgeschlagen: [], veraendert: [] };
    const mitTag = !!(auftrag.tag && auftrag.tag.alt && auftrag.tag.neu);
    const dateien = sammleZiele(auftrag.dateien, mitTag);
    if (typeof wurzel !== 'string' || !wurzel || dateien.length === 0) return ergebnis;

    const muster = typeof auftrag.muster === 'string' ? auftrag.muster : '';
    const flags = typeof auftrag.flags === 'string' && auftrag.flags ? auftrag.flags : 'gm';
    // Das Muster wird EINMAL vorab geprüft, statt je Datei zu scheitern: Ein
    // unbrauchbarer Ausdruck ist kein Grund, den Auftrag stillschweigend fallen
    // zu lassen — jede Datei erscheint mit ihrem Grund im Ergebnis.
    try {
      if (!muster) throw new Error('leeres Muster');
      baueSuchAusdruck(muster, flags);
    } catch (err) {
      for (const ziel of dateien) {
        ergebnis.fehlgeschlagen.push({ pfad: ziel.pfad, grund: 'muster', detail: meldung(err) });
      }
      return ergebnis;
    }

    const lauf = {
      // Die Wurzel bleibt, wie sie hereinkommt: Der Vorrat der Suche ist unter
      // GENAU dieser Zeichenkette abgelegt, und eine hier vorgenommene
      // Normalisierung fiele beim Nachschlagen des Bezugs-Stands als Fehlschlag
      // auf, nicht als Verbesserung. Die Grenz-Pruefung normalisiert ohnehin
      // selbst (isInsideArea), und path.relative tut es ebenso.
      wurzel,
      muster,
      flags,
      ersetzung: typeof auftrag.ersetzung === 'string' ? auftrag.ersetzung : '',
      regexModus: !!auftrag.regexModus,
      // 4T-001531: Alter und neuer Tag-Name. Nur die Umbenennung setzt sie;
      // ohne sie bleibt der Frontmatter-Anteil jedes Ziels leer.
      tag: {
        alt: auftrag.tag && typeof auftrag.tag.alt === 'string' ? auftrag.tag.alt : '',
        neu: auftrag.tag && typeof auftrag.tag.neu === 'string' ? auftrag.tag.neu : '',
      },
      owner: auftrag.owner || null,
    };

    // Datei für Datei, nicht nebenläufig: Historie und Schreibweg berühren je
    // Dokument mehrere Dateien (.md und .mdd), und der Gewinn einer Welle wöge
    // die Verschränkung zweier Sicherungs-Vorgänge nicht auf.
    for (const ziel of dateien) {
      const zeile = await ersetzeInDatei(lauf, ziel);
      if (zeile.art === 'geaendert') {
        ergebnis.geaendert.push({ pfad: ziel.pfad, anzahl: zeile.anzahl });
      } else if (zeile.art === 'veraendert') {
        ergebnis.veraendert.push(ziel.pfad);
      } else if (zeile.art === 'fehler') {
        const eintrag = { pfad: ziel.pfad, grund: zeile.grund };
        if (zeile.detail) eintrag.detail = zeile.detail;
        ergebnis.fehlgeschlagen.push(eintrag);
      }
    }

    // Der Vorrat der Suche hält die Texte, die eben überschrieben wurden. Er
    // wird freigegeben statt fortgeschrieben: Der nächste Suchlauf baut ihn
    // aus dem Cache neu auf und liest allein die geänderten Dateien nach,
    // während ein Fortschreiben eine zweite Stelle wäre, an der die Wahrheit
    // über den Datei-Bestand entstünde.
    if (ergebnis.geaendert.length > 0) gibBereichsVorratFrei(lauf.wurzel);

    return ergebnis;
  }

  return { ersetzeImBereich };
}

// Ziele des Auftrags: je Pfad eine Zeile mit ganzzahligen, nicht negativen
// Offsets. Zweimal derselbe Pfad wird zusammengefasst, damit eine Datei nicht
// zweimal gesichert und geschrieben wird.
function sammleZiele(dateien, mitTag) {
  const nachPfad = new Map();
  for (const eintrag of Array.isArray(dateien) ? dateien : []) {
    if (!eintrag || typeof eintrag.pfad !== 'string' || !eintrag.pfad) continue;
    const offsets = (Array.isArray(eintrag.offsets) ? eintrag.offsets : []).filter(
      (o) => Number.isInteger(o) && o >= 0,
    );
    // 4T-001531: Die Frontmatter-Auswahl reist als Index-Liste mit, nie als
    // fertiger Wert — und nur, wenn der Auftrag ueberhaupt eine Umbenennung
    // ist. Ein Index ohne Tag-Namen haette nichts, woraus er einen Wert bilden
    // koennte.
    const frontmatter =
      mitTag && Array.isArray(eintrag.frontmatter)
        ? eintrag.frontmatter.filter((i) => Number.isInteger(i) && i >= 0)
        : [];
    const bestand = nachPfad.get(eintrag.pfad);
    if (bestand) {
      bestand.offsets.push(...offsets);
      bestand.frontmatter.push(...frontmatter);
    } else {
      nachPfad.set(eintrag.pfad, {
        pfad: eintrag.pfad,
        offsets: [...offsets],
        frontmatter: [...frontmatter],
      });
    }
  }
  return [...nachPfad.values()];
}

function meldung(err) {
  return err && err.message ? String(err.message) : String(err);
}

module.exports = { createAreaReplace };
