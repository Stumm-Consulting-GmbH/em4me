// 4T-001846 (Epic 3E-000110): Die Text-Operationen der Tafel — Karten und
// Spalten anlegen, ändern, löschen und verschieben.
//
// Prozessneutral wie der Kern nebenan: reine Funktionen Text→Text, kein DOM,
// kein Electron, kein Datei-Zugriff. Jede Operation liest die Tafel, greift im
// Zeilen-Puffer des Modells an **genau** den betroffenen Stellen ein und
// schreibt zurück; alles Unberührte — Kopf, fremde Angaben, Leerzeilen-Muster,
// Archiv-Abschnitt und Einstellungs-Block — bleibt damit zeichengenau stehen.
//
// **Rückgabe statt Ausnahme:** Jede Operation liefert `{ ok: true, text }` oder
// `{ ok: false, befund }` mit einem benannten Code. Ein Befund ist eine Kennung
// und keine Prosa — der Kern kennt keine Sprache, die Meldung baut der
// Aufrufer.
//
// **Die Form neu geschriebener Zeilen folgt dem Vorbild**, belegt an seinem
// Quelltext (`itemToMd`, `laneToMd`, `completeString` in
// `src/parsers/formats/list.ts` und `src/parsers/common.ts`, gelesen am
// 2026-09-21) und an den echten Tafeln des Product Owners: eine Karte als
// `- [<Zeichen>] <Text>`, eine Spalte als Überschrift, Leerzeile, optionales
// Erledigt-Kennzeichen, Karten, zwei Leerzeilen.
//
// **Der Status-Wechsel setzt hier nur das Zeichen und wahlweise das
// Erledigt-Datum.** Die Automatik-Daten und die Wiederholung laufen über die
// bestehende Status-Kette der Anwendung (Entscheidung des Product Owners vom
// 2026-09-21); ein zweites Aufgaben-Modell entsteht nicht.
'use strict';

const {
  KANBAN_KOPF_SCHLUESSEL,
  KANBAN_KOPF_WERT_NEU,
  leseTafel,
  schreibeTafel,
  istLeer,
  ohneCr,
  crVon,
  SPALTEN_LIMIT_RE,
} = require('./kanban-core.js');
const { passeListCollapseAn } = require('./kanban-einstellungen.js');
const {
  parseTaskLine,
  serializeTaskLine,
  setStatusChar,
  setDateField,
  isValidIsoDate,
  isValidTime,
} = require('../tasks/task-markers.js');

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const UHRZEIT_RE = /^\d{2}:\d{2}$/;

// --- Rahmen -------------------------------------------------------------------

function mitTafel(text, arbeit) {
  const model = leseTafel(text);
  if (!model.istTafel) return { ok: false, befund: { code: 'keinTafelDokument', detail: '' } };
  const befund = arbeit(model);
  if (befund) return { ok: false, befund };
  return { ok: true, text: schreibeTafel(model) };
}

// Neue Zeilen übernehmen die Zeilenenden-Konvention der Quelle; sonst mischte
// die erste Änderung an einer CRLF-Datei beide Formen.
function neueZeile(model, text) {
  return model.zeilenende === '\r\n' ? text + '\r' : text;
}

/**
 * Die Einfüge-Stelle am Dokument-Ende, um den Rest hinter dem Schluss-Umbruch
 * herum.
 *
 * **Warum es diesen Griff braucht** (Befund aus 4T-001851): Das letzte Element
 * des Zeilen-Puffers einer Datei mit Schluss-Umbruch ist keine Zeile, sondern
 * das leere Stück Text dahinter. Wer **hinter** ihm einfügt, setzt seinen Block
 * an ein Element ohne Zeilenende-Artefakt — in einer CRLF-Datei entsteht damit
 * ein nackter LF, und das Dokument endet danach ohne Schluss-Umbruch. Der Fall
 * trifft jede Tafel, deren letzte Spalte bis ans Dateiende reicht, also jede
 * ohne Archiv-Abschnitt und Einstellungs-Block.
 *
 * Erkannt wird der Rest am leeren String **ohne** `\r`: Eine echte Leerzeile
 * einer CRLF-Datei ist `'\r'` und keine Einfüge-Grenze.
 */
function endeEinfuegeIndex(model, index) {
  const letzte = model.zeilen.length - 1;
  return index >= model.zeilen.length && model.zeilen[letzte] === '' ? letzte : index;
}

function holeSpalte(model, index) {
  if (!Number.isInteger(index) || index < 0 || index >= model.spalten.length) return null;
  return model.spalten[index];
}

function holeKarte(spalte, index) {
  if (!Number.isInteger(index) || index < 0 || index >= spalte.karten.length) return null;
  return spalte.karten[index];
}

function pruefeEinzeiler(wert) {
  const text = String(wert == null ? '' : wert);
  if (text.trim() === '') return null;
  if (/[\r\n]/.test(text)) return null;
  return text;
}

// Ein Status-Zeichen ist genau **ein** Codepoint — die Checkbox-Grammatik des
// Bestands lässt nicht mehr zu (CHECKBOX_LINE_RE in task-markers.js).
function pruefeStatus(wert) {
  const text = String(wert == null ? '' : wert);
  return Array.from(text).length === 1 ? text : null;
}

// --- Anlegen einer Tafel ---------------------------------------------------------

/**
 * Baut aus einem **leeren** Text das Start-Dokument einer Tafel: Kopf-Kennzeichen
 * und die übergebenen Spalten, eine davon wahlweise mit Erledigt-Einstellung.
 *
 * **Die eine Stelle, an der ein Start-Inhalt entsteht** (4T-001852). Beide Wege
 * der Bedienung — das neue Dokument und das Umwandeln eines leeren — rufen sie;
 * eine zweite Text-Vorlage in der Bedienung gäbe es sonst zweimal zu pflegen,
 * und die zweite liefe früher oder später gegen das, was der Kern nebenan lesen
 * kann.
 *
 * **Sprachlos wie der ganze Kern:** Spalten-Titel und Erledigt-Wortlaut kommen
 * vom Aufrufer. Was im Dokument steht, ist der Wortlaut der eingestellten
 * Programmsprache; der Kern erfindet ihn nicht.
 *
 * **Nur an einem leeren Text**, und leer heißt: nichts außer Leerraum. Ein
 * Dokument mit Inhalt wird nicht umgewandelt — der Kopf gehörte vor die erste
 * Zeile, und was die vorhandenen Zeilen dann bedeuten, wüsste niemand.
 *
 * **Gebaut wird der Block hier und nicht über drei Aufrufe von `legeSpalteAn`.**
 * Jene Operation setzt an einer Tafel an, die es zu diesem Zeitpunkt noch nicht
 * gibt; ihr Einfüge-Griff für das Dateiende (`endeEinfuegeIndex`) greift erst
 * ab der ersten vorhandenen Spalte, und an einer Tafel nur aus dem Kopf entstünde
 * in einer CRLF-Quelle ein nacktes LF hinter dem Kopf.
 *
 * **Die Form der Zeilen ist trotzdem bis aufs Byte dieselbe wie dort:**
 * Überschrift, eine Leerzeile, wahlweise das Erledigt-Kennzeichen, dann die
 * zwei Leerzeilen vor der nächsten Überschrift — so, wie es an den echten
 * Tafeln des Vorbild-Werkzeugs gemessen ist (Nachtrag vom 2026-09-22 in
 * 4T-001852; zuvor fehlte einer Spalte **ohne** Kennzeichen eine Leerzeile).
 * Gehalten wird die Gleichheit von einem Prüffall, der dieselbe Tafel einmal
 * hier und einmal aus Kopf plus `legeSpalteAn` baut und beide Texte
 * byte-genau vergleicht; ein zweites Auseinanderlaufen fällt damit sofort auf.
 *
 * @param {string} text Dokument-Text; muss leer oder reiner Leerraum sein.
 * @param {{spaltenTitel: Array<string>, erledigtSpalte?: number|null, erledigtWortlaut?: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function erzeugeTafel(text, angaben = {}) {
  const quelle = String(text == null ? '' : text);
  if (quelle.trim() !== '') return { ok: false, befund: { code: 'dokumentNichtLeer', detail: '' } };
  const roh = Array.isArray(angaben.spaltenTitel) ? angaben.spaltenTitel : [];
  if (roh.length === 0) return { ok: false, befund: { code: 'ungueltigerTitel', detail: '' } };
  const titel = [];
  for (const wert of roh) {
    const geprueft = pruefeEinzeiler(wert);
    if (geprueft === null) return { ok: false, befund: { code: 'ungueltigerTitel', detail: '' } };
    titel.push(geprueft);
  }
  const erledigtSpalte = angaben.erledigtSpalte == null ? null : angaben.erledigtSpalte;
  let wortlaut = null;
  if (erledigtSpalte !== null) {
    if (!Number.isInteger(erledigtSpalte) || erledigtSpalte < 0 || erledigtSpalte >= titel.length)
      return { ok: false, befund: { code: 'ungueltigePosition', detail: String(erledigtSpalte) } };
    wortlaut = pruefeWortlaut(angaben.erledigtWortlaut);
    if (!wortlaut)
      return {
        ok: false,
        befund: { code: 'kennzeichenWortlautFehlt', detail: String(angaben.erledigtWortlaut) },
      };
  }

  // Das Zeilenende der Quelle übernehmen: Ein leeres Dokument hat keines, ein
  // Dokument aus Leerraum kann eines haben, und die erste geschriebene Zeile
  // soll es nicht gegen das andere tauschen.
  const ende = quelle.includes('\r\n') ? '\r\n' : '\n';
  const zeilen = ['---', `${KANBAN_KOPF_SCHLUESSEL}: ${KANBAN_KOPF_WERT_NEU}`, '---', ''];
  titel.forEach((eintrag, nr) => {
    zeilen.push(`## ${eintrag}`, '');
    if (nr === erledigtSpalte) zeilen.push(`**${wortlaut}**`);
    zeilen.push('', '');
  });
  // Das letzte Element ist der **Schluss-Umbruch**, nicht eine Zeile: Beim
  // Zusammenfügen steht zwischen zwei Elementen je ein Umbruch, das leere
  // Element am Ende erzeugt also den Umbruch hinter der letzten Leerzeile.
  // Ohne es fiele die zweite Leerzeile der letzten Spalte weg, und das
  // Dokument wiche genau darin von `legeSpalteAn` ab.
  zeilen.push('');
  return { ok: true, text: zeilen.join(ende) };
}

// --- Karten --------------------------------------------------------------------

// Wohin eine Karte kommt: vor die Karte an `position`, sonst hinter die letzte.
// Ohne Karte hinter das Erledigt-Kennzeichen und sonst hinter die eine
// Leerzeile, die im Vorbild auf jede Spalten-Überschrift folgt.
function kartenEinfuegeIndex(model, spalte, position) {
  const karten = spalte.karten;
  if (position != null && position < karten.length) return karten[position].zeile;
  if (karten.length > 0) return karten[karten.length - 1].letzteZeile + 1;
  if (spalte.erledigtZeile != null) return spalte.erledigtZeile + 1;
  const nach = spalte.titelZeile + 1;
  return istLeer(model.zeilen[nach]) && nach < spalte.endeZeile ? nach + 1 : nach;
}

function pruefePosition(position, obergrenze) {
  if (position == null) return true;
  return Number.isInteger(position) && position >= 0 && position <= obergrenze;
}

/**
 * Legt eine Karte in einer Spalte an.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, position?: number, kartenText: string, status?: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function legeKarteAn(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    if (!pruefePosition(angaben.position, spalte.karten.length))
      return { code: 'ungueltigePosition', detail: String(angaben.position) };
    const kartenText = pruefeEinzeiler(angaben.kartenText);
    if (kartenText === null) return { code: 'ungueltigerKartenText', detail: '' };
    const status = pruefeStatus(angaben.status == null ? ' ' : angaben.status);
    if (status === null)
      return { code: 'ungueltigesStatusZeichen', detail: String(angaben.status) };
    const ziel = kartenEinfuegeIndex(model, spalte, angaben.position);
    model.zeilen.splice(ziel, 0, neueZeile(model, `- [${status}] ${kartenText}`));
    return null;
  });
}

// Die Aufgaben-Zeile einer Karte ändern, ohne ihre Marker-Segmente anzutasten:
// gelesen und geschrieben wird über den Aufgaben-Kern, der unveränderte
// Segmente byte-identisch wieder zusammensetzt.
function schreibeKartenZeile(model, karte, aendere) {
  const cr = crVon(model.zeilen[karte.zeile]);
  const aufgabe = parseTaskLine(ohneCr(model.zeilen[karte.zeile]));
  if (!aufgabe) return { code: 'keineAufgabenZeile', detail: String(karte.zeile + 1) };
  const befund = aendere(aufgabe);
  if (befund) return befund;
  model.zeilen[karte.zeile] = serializeTaskLine(aufgabe) + cr;
  return null;
}

/**
 * Ändert den Text einer Karte; Status und Angaben bleiben unberührt.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, kartenText: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function aendereKarte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    const kartenText = pruefeEinzeiler(angaben.kartenText);
    if (kartenText === null) return { code: 'ungueltigerKartenText', detail: '' };
    return schreibeKartenZeile(model, karte, (aufgabe) => {
      aufgabe.description = kartenText;
      return null;
    });
  });
}

/**
 * Setzt das Status-Zeichen einer Karte und wahlweise ihr Erledigt-Datum.
 *
 * `erledigtDatum` ist `{date, time?}` zum Setzen, `null` zum Entfernen und
 * `undefined`, wenn das Datum unberührt bleiben soll.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, status: string, erledigtDatum?: object|null}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function setzeKartenStatus(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    const status = pruefeStatus(angaben.status);
    if (status === null)
      return { code: 'ungueltigesStatusZeichen', detail: String(angaben.status) };
    const datum = angaben.erledigtDatum;
    if (datum !== undefined && datum !== null) {
      if (!datum || !DATUM_RE.test(String(datum.date || '')))
        return { code: 'ungueltigesDatum', detail: String(datum && datum.date) };
      if (datum.time != null && !UHRZEIT_RE.test(String(datum.time)))
        return { code: 'ungueltigeUhrzeit', detail: String(datum.time) };
    }
    return schreibeKartenZeile(model, karte, (aufgabe) => {
      setStatusChar(aufgabe, status);
      if (datum !== undefined) setDateField(aufgabe, 'done', datum);
      return null;
    });
  });
}

/**
 * Löscht eine Karte samt ihren eingerückten Folgezeilen.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function loescheKarte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    model.zeilen.splice(karte.zeile, karte.letzteZeile - karte.zeile + 1);
    return null;
  });
}

// Einen Zeilen-Block umhängen. Der Ziel-Index steht in den Koordinaten **vor**
// dem Entnehmen und wird danach umgerechnet; ein Ziel innerhalb des Blocks
// selbst fällt auf dessen eigenen Anfang zurück, weil ein Zug auf sich selbst
// nichts verschiebt.
function haengeUm(zeilen, von, bis, ziel) {
  const block = zeilen.slice(von, bis + 1);
  zeilen.splice(von, block.length);
  let neu = ziel;
  if (ziel > bis) neu = ziel - block.length;
  else if (ziel > von) neu = von;
  zeilen.splice(neu, 0, ...block);
}

/**
 * Verschiebt eine Karte innerhalb ihrer Spalte oder in eine andere.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, zielSpalte: number, position?: number}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function verschiebeKarte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const ziel = holeSpalte(model, angaben.zielSpalte);
    if (!ziel) return { code: 'unbekannteSpalte', detail: String(angaben.zielSpalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    if (!pruefePosition(angaben.position, ziel.karten.length))
      return { code: 'ungueltigePosition', detail: String(angaben.position) };
    haengeUm(
      model.zeilen,
      karte.zeile,
      karte.letzteZeile,
      kartenEinfuegeIndex(model, ziel, angaben.position),
    );
    return null;
  });
}

// --- Spalten --------------------------------------------------------------------

/**
 * Legt eine Spalte an und führt `list-collapse` nach (E-B).
 *
 * @param {string} text Dokument-Text.
 * @param {{position?: number, titel: string, erledigtWortlaut?: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function legeSpalteAn(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalten = model.spalten;
    if (!pruefePosition(angaben.position, spalten.length))
      return { code: 'ungueltigePosition', detail: String(angaben.position) };
    const titel = pruefeEinzeiler(angaben.titel);
    if (titel === null) return { code: 'ungueltigerTitel', detail: '' };
    const wortlaut =
      angaben.erledigtWortlaut == null ? null : pruefeWortlaut(angaben.erledigtWortlaut);
    if (angaben.erledigtWortlaut != null && wortlaut === null)
      return { code: 'ungueltigesKennzeichen', detail: String(angaben.erledigtWortlaut) };
    const stelle = angaben.position == null ? spalten.length : angaben.position;
    // Die Überschrift-Ebene folgt dem Bestand der Tafel; ein Dokument, das seine
    // Spalten auf einer anderen Ebene führt, bekommt keine Fremdkörper-Zeile.
    const raute = spalten.length > 0 ? spalten[0].raute : '##';
    const block = [`${raute} ${titel}`, ''];
    if (wortlaut) block.push(`**${wortlaut}**`);
    block.push('', '');

    // Zuerst der Wert im fremden Block, dann der Zeilen-Eingriff: Die
    // Nachführung ändert eine Zeile an Ort und Stelle und verschöbe sonst die
    // eben ermittelten Grenzen.
    passeListCollapseAn(model.zeilen, model.einstellungen, spalten.length, {
      art: 'einfuegen',
      index: stelle,
    });

    let ziel;
    if (stelle < spalten.length) ziel = spalten[stelle].titelZeile;
    else {
      // Ans Ende der Tafel: hinter die letzte Spalte, und an einer Tafel **nur
      // aus dem Kopf** (F3) hinter den Kopf samt seiner Leerzeile.
      //
      // **Beide Lagen gehen über denselben Einfüge-Griff** (Nachbesserung in
      // 4T-001851): Auch der Kopf einer Tafel ohne Spalte kann bis ans
      // Dateiende reichen, und dann gilt der Griff dort aus demselben Grund —
      // ohne ihn entstünde in einer CRLF-Quelle ein nackter LF hinter dem
      // Kopf, und das Dokument endete ohne Schluss-Umbruch.
      let roh;
      if (spalten.length > 0) roh = spalten[spalten.length - 1].endeZeile;
      else {
        roh = model.kopfZeilen;
        if (istLeer(model.zeilen[roh])) roh++;
      }
      ziel = endeEinfuegeIndex(model, roh);
      // Vor einer Überschrift steht im Vorbild eine Leerzeile. Hängt der Block
      // unmittelbar an eine Inhalts-Zeile — der Fall, wenn die letzte Spalte
      // oder der bloße Kopf bis ans Dateiende reicht —, kommt sie hinzu.
      if (ziel > 0 && !istLeer(model.zeilen[ziel - 1])) block.unshift('');
    }
    model.zeilen.splice(ziel, 0, ...block.map((z) => neueZeile(model, z)));
    return null;
  });
}

/**
 * Benennt eine Spalte um. Einzug, Rauten und Abstand der Überschrift bleiben.
 *
 * 4T-001905: Mit `limitErhalten` ist `titel` der Titel **ohne** Limit, und die
 * Obergrenze der Spalte bleibt in der Schreibweise des Dokuments stehen —
 * zeichengenau, auch eine fremde ohne Leerzeichen vor der Klammer. Neu gebaut
 * wird sie bewusst nicht: `setzeSpaltenLimit` schriebe die eigene Form und
 * änderte damit eine Obergrenze, die der Anwender nicht angefasst hat.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, titel: string, limitErhalten?: boolean}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function benenneSpalteUm(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const titel = pruefeEinzeiler(angaben.titel);
    if (titel === null) return { code: 'ungueltigerTitel', detail: '' };
    const cr = crVon(model.zeilen[spalte.titelZeile]);
    // `titelOhneLimit` ist ein Anfangsstück von `titel`; der Rest ist die
    // Obergrenze samt ihrem Leerraum, so wie sie im Dokument steht.
    const limit =
      angaben.limitErhalten === true ? spalte.titel.slice(spalte.titelOhneLimit.length) : '';
    model.zeilen[spalte.titelZeile] = spalte.praefix + titel + limit + cr;
    return null;
  });
}

/**
 * Löscht eine Spalte samt ihren Karten und führt `list-collapse` nach (E-B).
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function loescheSpalte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    passeListCollapseAn(model.zeilen, model.einstellungen, model.spalten.length, {
      art: 'entfernen',
      index: angaben.spalte,
    });
    model.zeilen.splice(spalte.titelZeile, spalte.endeZeile - spalte.titelZeile);
    return null;
  });
}

/**
 * Verschiebt eine Spalte vor die Spalte an `position`; `position` gleich der
 * Spaltenzahl hängt sie ans Ende. Führt `list-collapse` nach (E-B).
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, position: number}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function verschiebeSpalte(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalten = model.spalten;
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    if (!Number.isInteger(angaben.position) || angaben.position < 0)
      return { code: 'ungueltigePosition', detail: String(angaben.position) };
    if (angaben.position > spalten.length)
      return { code: 'ungueltigePosition', detail: String(angaben.position) };
    const nach = angaben.position > angaben.spalte ? angaben.position - 1 : angaben.position;
    passeListCollapseAn(model.zeilen, model.einstellungen, spalten.length, {
      art: 'verschieben',
      von: angaben.spalte,
      nach: Math.min(nach, spalten.length - 1),
    });
    const ziel =
      angaben.position < spalten.length
        ? spalten[angaben.position].titelZeile
        : endeEinfuegeIndex(model, spalten[spalten.length - 1].endeZeile);
    haengeUm(model.zeilen, spalte.titelZeile, spalte.endeZeile - 1, ziel);
    return null;
  });
}

function pruefeWortlaut(wert) {
  const text = pruefeEinzeiler(wert);
  if (text === null) return null;
  return text.includes('*') ? null : text.trim();
}

/**
 * Setzt oder nimmt die Erledigt-Einstellung einer Spalte.
 *
 * **Der Wortlaut kommt nicht aus dem Kern.** Das Vorbild vergleicht die Zeile
 * mit seinem **lokalisierten** Wort (`childStr === t('Complete')` in
 * `src/parsers/formats/list.ts`, gelesen am 2026-09-21); ein sprachloser Kern
 * kann ihn deshalb nicht erfinden. Vorrang hat der Wortlaut einer bereits
 * vorhandenen Erledigt-Spalte **derselben** Tafel — was dort steht, liest das
 * Vorbild nachweislich zurück —, danach die Angabe des Aufrufers. Fehlt beides,
 * ist das ein Befund und keine Vermutung.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, erledigt: boolean, wortlaut?: string}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function setzeSpaltenErledigt(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const soll = angaben.erledigt === true;
    if (soll === spalte.erledigt) return null;
    if (!soll) {
      model.zeilen.splice(spalte.erledigtZeile, 1);
      return null;
    }
    const vorhanden = model.spalten.find((s) => s.erledigtWortlaut);
    const wortlaut = vorhanden
      ? vorhanden.erledigtWortlaut
      : angaben.wortlaut == null
        ? null
        : pruefeWortlaut(angaben.wortlaut);
    if (!wortlaut) return { code: 'kennzeichenWortlautFehlt', detail: String(angaben.wortlaut) };
    const nach = spalte.titelZeile + 1;
    const ziel = istLeer(model.zeilen[nach]) && nach < spalte.endeZeile ? nach + 1 : nach;
    model.zeilen.splice(ziel, 0, neueZeile(model, `**${wortlaut}**`));
    return null;
  });
}

// --- Stufe 2: Limit und Vorbild-Termin (4T-001902) -----------------------------

/**
 * Setzt, ändert oder entfernt das Limit einer Spalte in der Form des Vorbilds:
 * ` (n)` am Titel-Ende, ein Leerzeichen vor der Klammer (`helpers.ts:65–68`).
 * Präfix der Überschrift, Titel ohne Limit und ein etwaiger Leerraum hinter dem
 * Titel bleiben zeichengenau. Eine vorhandene Klammer-Zahl wird ersetzt oder
 * entfernt, auch eine `(0)`, die das Vorbild als «kein Limit» liest.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, limit: number|null}} angaben `limit` ganze Zahl ab
 *   1 setzt, `null` entfernt.
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function setzeSpaltenLimit(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const limit = angaben.limit;
    if (limit !== null && !(Number.isSafeInteger(limit) && limit >= 1))
      return { code: 'limitUngueltig', detail: String(limit) };
    const roh = model.zeilen[spalte.titelZeile];
    const nachTitel = ohneCr(roh).slice(spalte.praefix.length + spalte.titel.length);
    const treffer = SPALTEN_LIMIT_RE.exec(spalte.titel);
    const basis = treffer ? treffer[1] : spalte.titel;
    const titel = limit === null ? basis : `${basis} (${limit})`;
    model.zeilen[spalte.titelZeile] = spalte.praefix + titel + nachTitel + crVon(roh);
    return null;
  });
}

// Nimmt die Spannen aus der Zeile, von hinten nach vorn, damit die vorderen
// gültig bleiben. Steht hinter einer Spanne unmittelbar ein Wort, bleibt ihr
// führender Leerraum stehen — sonst verschmölze es mit dem Wort davor.
function ohneSpannen(zeile, spannen) {
  let neu = zeile;
  for (const { von, bis } of [...spannen].sort((a, b) => b.von - a.von)) {
    const nach = neu.slice(bis);
    const fuehrend = /^\s/.test(neu[von]) ? neu[von] : '';
    const bleibt = fuehrend && nach !== '' && !/^\s/.test(nach) ? fuehrend : '';
    neu = neu.slice(0, von) + bleibt + nach;
  }
  return neu;
}

/**
 * Schreibt den Vorbild-Termin **einer** Karte in die Aufgaben-Schreibweise der
 * Anwendung um: Termin-Marker `📅 YYYY-MM-DD`, wahlweise mit ` HH:mm`, über den
 * Aufgaben-Kern gesetzt; ein vorhandener Termin der Zeile wird ersetzt, wie
 * das Vorbild sein Datum an Ort und Stelle ersetzt. Ein Umschreiben über die
 * ganze Tafel gibt es nicht (Entscheidung des Product Owners vom 2026-09-21).
 *
 * Ein unlesbarer Wert bleibt stehen, und die Operation liefert den Befund des
 * Termins; nichts geht verloren.
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number}} angaben
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function schreibeVorbildTerminUm(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    const termin = karte.vorbildTermin;
    if (!termin) return { code: 'keinVorbildTermin', detail: '' };
    if (!termin.lesbar) return { ...termin.befund };
    const roh = model.zeilen[karte.zeile];
    const aufgabe = parseTaskLine(ohneSpannen(ohneCr(roh), termin.spannen));
    if (!aufgabe) return { code: 'keineAufgabenZeile', detail: String(karte.zeile + 1) };
    setDateField(aufgabe, 'due', { date: termin.datum, time: termin.uhrzeit });
    model.zeilen[karte.zeile] = serializeTaskLine(aufgabe) + crVon(roh);
    return null;
  });
}

// --- Stufe 2: Termin der Karte setzen (4T-001903) ------------------------------

/**
 * Setzt, ersetzt oder entfernt den Termin einer Karte: das Feld `due` der
 * Aufgaben-Zeile, `📅 YYYY-MM-DD` wahlweise mit ` HH:mm`, über den
 * Aufgaben-Kern — dieselbe Schreibweise, die Abfragen, Kalender und
 * Erinnerungen lesen (Story 4S-000979, AK3). Die übrigen Marker-Segmente
 * bleiben byte-gleich.
 *
 * **Setzen und Entfernen sind ein Bearbeiten der Karte.** Trägt sie einen
 * lesbaren Vorbild-Termin, werden dessen Spannen deshalb zuvor aus der Zeile
 * genommen: Beim Setzen ersetzt der gewählte Termin ihn, beim Entfernen geht
 * er mit, weil die Karte ihn als ihren Termin zeigt. Ein **unlesbarer**
 * Vorbild-Termin bleibt als Text stehen; er lässt sich nicht deuten und geht
 * nie still verloren (AK7 der Story).
 *
 * @param {string} text Dokument-Text.
 * @param {{spalte: number, karte: number, termin: {date: string, time?: string|null}|null}} angaben
 *   `termin` setzt oder ersetzt, `null` entfernt.
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function setzeKartenTermin(text, angaben = {}) {
  return mitTafel(text, (model) => {
    const spalte = holeSpalte(model, angaben.spalte);
    if (!spalte) return { code: 'unbekannteSpalte', detail: String(angaben.spalte) };
    const karte = holeKarte(spalte, angaben.karte);
    if (!karte) return { code: 'unbekannteKarte', detail: String(angaben.karte) };
    const termin = angaben.termin;
    if (termin === undefined) return { code: 'ungueltigesDatum', detail: 'undefined' };
    if (termin !== null) {
      const datum = String((termin && termin.date) || '');
      if (!DATUM_RE.test(datum) || !isValidIsoDate(datum))
        return { code: 'ungueltigesDatum', detail: datum };
      if (
        termin.time != null &&
        !(UHRZEIT_RE.test(String(termin.time)) && isValidTime(termin.time))
      )
        return { code: 'ungueltigeUhrzeit', detail: String(termin.time) };
    }
    const roh = model.zeilen[karte.zeile];
    const vorbild = karte.vorbildTermin;
    const zeile =
      vorbild && vorbild.lesbar ? ohneSpannen(ohneCr(roh), vorbild.spannen) : ohneCr(roh);
    const aufgabe = parseTaskLine(zeile);
    if (!aufgabe) return { code: 'keineAufgabenZeile', detail: String(karte.zeile + 1) };
    setDateField(
      aufgabe,
      'due',
      termin === null
        ? null
        : { date: termin.date, time: termin.time == null ? null : termin.time },
    );
    model.zeilen[karte.zeile] = serializeTaskLine(aufgabe) + crVon(roh);
    return null;
  });
}

module.exports = {
  erzeugeTafel,
  legeKarteAn,
  aendereKarte,
  setzeKartenStatus,
  loescheKarte,
  verschiebeKarte,
  legeSpalteAn,
  benenneSpalteUm,
  loescheSpalte,
  verschiebeSpalte,
  setzeSpaltenErledigt,
  setzeSpaltenLimit,
  schreibeVorbildTerminUm,
  setzeKartenTermin,
  // Bausteine für die Schwester-Module des Ordners (4T-001902: das Archiv),
  // bewusst exportiert statt dort ein zweites Mal geschrieben.
  mitTafel,
  holeSpalte,
  holeKarte,
  neueZeile,
  endeEinfuegeIndex,
  pruefeEinzeiler,
  // 4T-001903: dieselbe Regel für das Herausnehmen der Vorbild-Spannen aus dem
  // angezeigten Karten-Text, damit Anzeige und Umschreiben nie auseinanderlaufen.
  ohneSpannen,
};
