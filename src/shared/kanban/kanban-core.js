// 4T-001846 (Epic 3E-000110): Format-Kern des Tafel-Dokuments — Erkennung und
// Zerlegung einer Kanban-Tafel, dazu der byte-treue Rückweg.
//
// Prozessneutral (CJS, reine Funktionen, kein Electron, kein DOM, kein
// Datei-Zugriff; Muster src/shared/canvas/canvas-core.js). Der Kern kennt nur
// Text und ein Modell; wer ihn aufruft, bringt den Dokument-Text mit. Er kennt
// auch **keine Sprache**: Jeder Wortlaut, der im Dokument steht, wird gelesen
// und mitgeführt, nie erfunden.
//
// **Die Tafel ist ein gewöhnliches Markdown-Dokument** (Entscheidung des
// Product Owners vom 2026-09-21): Spalten sind Überschriften, Karten sind
// Aufgaben-Zeilen, die Karten-Reihenfolge ist die Zeilen-Reihenfolge. Erkannt
// wird sie am Frontmatter-Schlüssel `kanban-plugin` des Vorbild-Werkzeugs.
//
// **Drei Festlegungen aus den Format-Befunden an den echten Tafeln des Product
// Owners** (Nachtrag vom 2026-09-21 in 4T-001846):
//
//   F1 Erkannt wird am **Vorhandensein** des Kopf-Schlüssels, nie an seinem
//      Wert. Belegt sind `list` und `board`; der Wert bleibt unangetastet.
//   F2 Erledigt-Kennzeichen und Archiv-Überschrift stehen in der Sprache des
//      Vorbilds, nicht fest englisch. Beide werden deshalb **strukturell**
//      erkannt (E-A dieses Tasks, Begründung im Lösungs-Kapitel): das Archiv
//      als der Überschriften-Abschnitt nach der Trennlinie `***`, das
//      Erledigt-Kennzeichen als erste Nicht-Leer-Zeile unter der
//      Spalten-Überschrift, die nur aus einer fett gesetzten Wortgruppe
//      besteht und keine Aufgaben-Zeile ist.
//   F3 Eine Tafel **nur aus dem Kopf** ist gültig und leer, kein Befund.
//
// **Byte-Treue über den Zeilen-Puffer statt über eine Normalform:** Das Modell
// führt die Zeilen der Quelle unverändert mit und die Zerlegung zeigt nur auf
// sie; geschrieben wird, was dasteht. Getrennt wird ausschließlich an `\n`, ein
// etwaiges `\r` bleibt am Zeilenende stehen — der bequeme Weg über /\r?\n/ mit
// späterem Join auf '\n' schriebe eine CRLF-Datei beim ersten Speichern
// vollständig um (belegter Fall aus dem Canvas-Kern, 4T-001652).
//
// **Fehler-Semantik** wie im Canvas-Kern: Ein Befund landet in `model.befunde`
// und wird nie geworfen; nichts wird verworfen. Ein Dokument, das die Anwendung
// nicht deutet, darf die Anzeige stören, aber niemals beim Speichern
// verschwinden.
//
// **Grammatik der Stufe 2** (4T-001902, Epic 3E-000318), belegt am Quelltext
// des Vorbild-Werkzeugs in Version 2.0.51 (Repositorium
// `community-archive/obsidian-kanban`, gelesen am 2026-09-23). Die Deutung
// zeigt wie alles andere nur auf den Zeilen-Puffer; eine unveränderte Tafel
// geht byte-gleich hinaus.
//
//   Termin   `@{YYYY-MM-DD}` in der Karten-Zeile, vor dem Auslöser Zeilenanfang
//            oder Leerraum (`hydrateBoard.ts:64–73`); das Menü hängt ihn mit
//            einem Leerzeichen ans Zeilenende (`Item/helpers.ts:121`). Auslöser
//            und Format sind im Vorbild einstellbar; gelesen wird hier allein
//            die Vorgabe `@` und `YYYY-MM-DD` (`settingHelpers.ts:9`,
//            `components/helpers.ts:170–182`), alles andere ist unlesbar.
//   Uhrzeit  `@@{HH:mm}`, gleicher Aufbau (`hydrateBoard.ts:76–77`,
//            `Item/helpers.ts:269`, `settingHelpers.ts:10`). Das Vorbild liest
//            sie auch ohne Datum (`hydrateBoard.ts:82–84`); hier ist das ein
//            Befund, weil ein Termin ohne Tag nicht umschreibbar ist.
//   Abgrenzung  Ein `@{…}` mit Doppelpunkt ist ein Kalender-Wert der
//            Anwendung (`calendar-core.js`) und nie ein Vorbild-Termin. Die
//            Verknüpfungs-Form `@[[…]]` (`parseMarkdown.ts:69`) wird nicht
//            gedeutet und läuft als Text durch.
//   Limit    ganze Zahl in runden Klammern am Ende des Spalten-Titels, gelesen
//            mit `/^(.*?)\s*\((\d+)\)$/` (`parser.ts:60–67`), geschrieben als
//            `${title} (${n})` (`helpers.ts:65–68`); 0 heißt kein Limit.
//   Archiv   `***`, Leerzeile, `## <t('Archive')>`, Leerzeile, Karten
//            (`list.ts:431`); Überschrift sprachabhängig (`de.ts:30`).
//            Zeitstempel `YYYY-MM-DD HH:mm` vor dem Titel ohne Trenner
//            (`boardModifiers.ts:40–55`, `StateManager.ts:230–249`); eine
//            einzeln archivierte Karte kommt unten hinzu (`boardModifiers.ts:
//            240`), und eine Obergrenze kürzt oben (`Kanban.tsx:149–158`).
'use strict';

const { extractFrontmatter } = require('../markdown/frontmatter.js');
const { parseTaskLine, isValidIsoDate, isValidTime } = require('../tasks/task-markers.js');
const { findPercentCommentRanges } = require('../markdown/plugins/comments.js');
// 4T-001913: Die Zaun-Regel wohnt in `fence-level.js`; die Tafel liest sie von
// dort, statt eine eigene Fassung zu tragen (Wächter `zaun-kopien.test.js`).
const { zaunOeffnung, schliesstZaun } = require('../markdown/fence-level.js');
// 4T-001954: Das Wiki-Muster und die Inline-Code-Maskierung aus der gemeinsamen
// Erkennungs-Quelle der Verweise, damit der erste Verweis einer Karte an
// denselben Stellen gefunden wird wie im Index.
const { createWikiLinkRegex, maskInlineCode, splitAreaLink } = require('../markdown/link-scan.js');
// 4T-001957: Der Satz der Bild-Endungen aus seiner Heimat — eine Einbettung auf
// ein Bild ist kein Verweis auf eine Notiz.
const { istBildDatei } = require('../bild-endungen.js');

// Der Kopf-Schlüssel des Vorbilds. Belegt am Quelltext des Vorbild-Werkzeugs
// (`frontmatterKey` in `src/parsers/common.ts`, gelesen am 2026-09-21).
const KANBAN_KOPF_SCHLUESSEL = 'kanban-plugin';

// 4T-001852: Der Wert, den eine **neu angelegte** Tafel im Kopf trägt.
//
// Er steht hier und nicht an der Anlage-Stelle, weil er zur Grammatik des
// Formats gehört. Gelesen wird er nie — F1 erkennt am Vorhandensein des
// Schlüssels und lässt den Wert unangetastet —, aber geschrieben werden muss
// einer, und `board` ist der, den das Vorbild-Werkzeug für eine Tafel in
// Spalten-Form schreibt (belegt an den echten Tafeln des Product Owners und am
// Quelltext des Vorbilds, gelesen am 2026-09-21; `list` ist die zweite belegte
// Form und gehört zu seiner Listen-Ansicht).
const KANBAN_KOPF_WERT_NEU = 'board';

// Die Marke des Einstellungs-Blocks am Dateiende. Er ist ein `%%`-Kommentar mit
// einem Code-Zaun darin; gefunden wird er über den Kommentar-Scanner des
// Bestands, damit es keinen zweiten gibt.
const KANBAN_EINSTELLUNGS_MARKE = 'kanban:settings';

// Die Trennlinie vor dem Archiv. Belegt am Quelltext des Vorbilds
// (`archiveString = '***'`) und an der echten Tafel des Product Owners.
const ARCHIV_TRENNER = '***';

const ARCHIV_TRENNER_RE = /^ {0,3}\*{3,}[ \t]*$/;
const UEBERSCHRIFT_RE = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;

// F2: Eine Zeile, die **ausschließlich** aus einer fett gesetzten Wortgruppe
// besteht. Das Vorbild schreibt sein Kennzeichen als `**<lokalisiertes Wort>**`
// (`completeString` in `src/parsers/common.ts`) und liest es als den reinen
// Text der Zeile zurück; die Fettschrift ist damit die Schreibweise, der
// Wortlaut die Sprache des Vorbilds.
const ERLEDIGT_KENNZEICHEN_RE = /^[ \t]*\*\*(.+?)\*\*[ \t]*$/;

// Die Kopf-Zeile des Einstellungs-Blocks, wie das Vorbild sie schreibt. Die
// enge Form ist Absicht: Ein unpaariges `%%` irgendwo im Dokument ließe den
// Scanner einen riesigen Bereich melden, und der dürfte nie ganze Spalten
// verschlucken.
const EINSTELLUNGS_KOPF_RE = new RegExp(`^%%[ \\t]*${KANBAN_EINSTELLUNGS_MARKE}\\b`);

// 4T-001902: Die Ausdrücke des Vorbilds für Termin, Uhrzeit und Limit, wörtlich
// übernommen (Belege im Kopf-Kommentar). Die Gruppe vor dem Auslöser gehört zur
// Spanne, damit das Entfernen keinen doppelten Abstand hinterlässt.
const VORBILD_DATUM_RE = /(^|\s)@\{([^}]+)\}/g;
const VORBILD_UHRZEIT_RE = /(^|\s)@@\{([^}]+)\}/g;
const VORBILD_DATUM_FORM_RE = /^\d{4}-\d{2}-\d{2}$/;
const VORBILD_UHRZEIT_FORM_RE = /^\d{2}:\d{2}$/;
const SPALTEN_LIMIT_RE = /^(.*?)\s*\((\d+)\)$/;

// --- Zeilen-Werkzeug ---------------------------------------------------------
//
// Eigene Fassung statt eines Imports aus dem Canvas-Kern: Jener hält die drei
// Funktionen bewusst privat, und sie aus ihm herauszuziehen wäre eine Änderung
// an einem ausgelieferten Bestands-Modul für einen reinen Bequemlichkeits-
// Gewinn. Exportiert werden sie hier, damit die Schwester-Module des Ordners
// keine vierte Fassung führen.

function trenneZeilen(text) {
  return String(text == null ? '' : text).split('\n');
}

function ohneCr(zeile) {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

// Das Trenn-Artefakt einer Zeile, damit eine neu erzeugte Zeile es übernimmt.
function crVon(zeile) {
  return zeile != null && zeile.endsWith('\r') ? '\r' : '';
}

function ermittleZeilenende(zeilen) {
  const mitCr = zeilen.filter((z) => z.endsWith('\r')).length;
  return mitCr > 0 && mitCr * 2 >= zeilen.length ? '\r\n' : '\n';
}

function istLeer(zeile) {
  return zeile == null || ohneCr(zeile).trim() === '';
}

// --- Erkennung ----------------------------------------------------------------

/**
 * F1: Ein Dokument ist eine Tafel, wenn sein Kopf den Schlüssel trägt — der
 * Wert ist gleichgültig und bleibt unangetastet.
 *
 * @param {string} text voller Dokument-Text.
 * @returns {boolean}
 */
function istTafelDokument(text) {
  const quelle = String(text == null ? '' : text);
  // Vorfilter wie in `istCanvasDokument`: Die Frage läuft bei jedem
  // Modus-Wechsel und in aller Regel über ein Dokument ohne Kennzeichen.
  if (!quelle.includes(KANBAN_KOPF_SCHLUESSEL)) return false;
  const kopf = extractFrontmatter(quelle);
  if (!kopf.data || kopf.parseError) return false;
  return Object.prototype.hasOwnProperty.call(kopf.data, KANBAN_KOPF_SCHLUESSEL);
}

// --- Zerlegung ------------------------------------------------------------------

// Zeilen-Nummer (0-basiert) zu einem Zeichen-Offset.
function zeileZuOffset(quelle, offset) {
  let zeile = 0;
  for (let i = 0; i < offset && i < quelle.length; i++) if (quelle[i] === '\n') zeile++;
  return zeile;
}

/**
 * Der Einstellungs-Block am Dateiende als unangetasteter Rest.
 *
 * Gefunden über `findPercentCommentRanges` — denselben Scanner, den Render-Pfad
 * und Editor-Dekoration benutzen. Er behandelt den Block samt dem darin
 * enthaltenen Code-Zaun als **einen** Kommentar, und genau daran hängt der
 * Erhalt des Blocks.
 */
function findeEinstellungen(quelle, zeilen) {
  if (!quelle.includes(KANBAN_EINSTELLUNGS_MARKE)) return null;
  let treffer = null;
  for (const bereich of findPercentCommentRanges(quelle)) {
    const vonZeile = zeileZuOffset(quelle, bereich.from);
    if (!EINSTELLUNGS_KOPF_RE.test(ohneCr(zeilen[vonZeile] || '').trim())) continue;
    treffer = {
      vonZeile,
      bisZeile: zeileZuOffset(quelle, Math.max(bereich.from, bereich.to - 1)),
      geschlossen: bereich.closed,
      jsonZeile: null,
    };
  }
  if (!treffer) return null;
  for (let i = treffer.vonZeile; i <= treffer.bisZeile; i++) {
    const text = ohneCr(zeilen[i] || '').trim();
    if (!text.startsWith('{') || !text.endsWith('}')) continue;
    try {
      const daten = JSON.parse(text);
      if (daten && typeof daten === 'object' && !Array.isArray(daten)) {
        treffer.jsonZeile = i;
        break;
      }
    } catch {
      // Eine nicht lesbare Zeile ist kein Befund: Der Block bleibt ein Rest,
      // und wer ihn nachführen will, lässt ihn nach E-B unangetastet.
    }
  }
  return treffer;
}

// F2: Das Archiv ist der Überschriften-Abschnitt nach der Trennlinie `***`. Die
// Trennlinie gehört zum Rest, weil sie seine Grenze **ist**.
function findeArchiv(zeilen, bis) {
  let inZaun = null;
  for (let i = 0; i < bis; i++) {
    const text = ohneCr(zeilen[i]);
    if (inZaun) {
      if (schliesstZaun(text, inZaun)) inZaun = null;
      continue;
    }
    inZaun = zaunOeffnung(text);
    if (inZaun) continue;
    if (!ARCHIV_TRENNER_RE.test(text)) continue;
    for (let j = i + 1; j < bis; j++) {
      if (istLeer(zeilen[j])) continue;
      const kopf = UEBERSCHRIFT_RE.exec(ohneCr(zeilen[j]));
      // 4T-001902: Überschrift und ihre Zeile kommen mit, weil das Archivieren
      // hinter ihr anfügt und die Überschrift eines fremden Archivs nie
      // anrührt.
      if (kopf) {
        return {
          trennerZeile: i,
          ueberschriftZeile: j,
          ueberschrift: kopf[4].trimEnd(),
          bisZeile: bis - 1,
          karten: [],
        };
      }
      break;
    }
  }
  return null;
}

// Das erste Vorkommen eines Ausdrucks als Inhalt samt Zeichen-Spanne. Ein
// Treffer, den `ueberspringe` verwirft, zählt nicht — beim Datum der
// Kalender-Wert mit Doppelpunkt, der danach noch ein echtes Datum zulässt.
function erstesVorkommen(zeile, ausdruck, ueberspringe) {
  for (const treffer of zeile.matchAll(ausdruck)) {
    if (ueberspringe && ueberspringe(treffer[2])) continue;
    return { inhalt: treffer[2], von: treffer.index, bis: treffer.index + treffer[0].length };
  }
  return null;
}

/**
 * 4T-001902: Der Vorbild-Termin einer Karten-Zeile, **nur lesend**.
 *
 * Gelesen wird je das erste Vorkommen von Datum und Uhrzeit; ein weiteres
 * bleibt Text, wie es beim Vorbild nach dem Ersetzen an Ort und Stelle
 * (`Item/helpers.ts:119`) ebenfalls stehen bliebe. Ein unlesbarer Wert ist ein
 * Befund am Termin und keiner an der Tafel: Die Tafel ist gültig, nur dieser
 * eine Wert lässt sich nicht umschreiben.
 *
 * @param {string} zeile Karten-Zeile ohne Zeilenende-Artefakt.
 * @returns {null|{datum: string|null, uhrzeit: string|null,
 *   spannen: Array<{von: number, bis: number}>, lesbar: boolean,
 *   befund: null|{code: string, detail: string}}}
 */
function lesVorbildTermin(zeile) {
  const datum = erstesVorkommen(zeile, VORBILD_DATUM_RE, (inhalt) => inhalt.includes(':'));
  const uhrzeit = erstesVorkommen(zeile, VORBILD_UHRZEIT_RE, null);
  if (!datum && !uhrzeit) return null;
  const termin = {
    datum: null,
    uhrzeit: null,
    spannen: [datum, uhrzeit]
      .filter(Boolean)
      .map(({ von, bis }) => ({ von, bis }))
      .sort((a, b) => a.von - b.von),
    lesbar: false,
    befund: null,
  };
  if (!datum) {
    termin.befund = { code: 'uhrzeitOhneDatum', detail: uhrzeit.inhalt };
    return termin;
  }
  if (!VORBILD_DATUM_FORM_RE.test(datum.inhalt) || !isValidIsoDate(datum.inhalt)) {
    termin.befund = { code: 'terminUnlesbar', detail: datum.inhalt };
    return termin;
  }
  if (uhrzeit && (!VORBILD_UHRZEIT_FORM_RE.test(uhrzeit.inhalt) || !isValidTime(uhrzeit.inhalt))) {
    termin.befund = { code: 'terminUnlesbar', detail: uhrzeit.inhalt };
    return termin;
  }
  termin.datum = datum.inhalt;
  termin.uhrzeit = uhrzeit ? uhrzeit.inhalt : null;
  termin.lesbar = true;
  return termin;
}

// 4T-001902: Das Limit einer Spalte. Eine 0 ist im Vorbild «kein Limit» und
// bleibt hier Teil des Titels, damit gilt: `limit === null` genau dann, wenn
// `titelOhneLimit === titel`.
function lesSpaltenLimit(titel) {
  const treffer = SPALTEN_LIMIT_RE.exec(titel);
  if (!treffer) return null;
  const zahl = Number(treffer[2]);
  if (!Number.isSafeInteger(zahl) || zahl < 1) return null;
  return { zahl, titel: treffer[1] };
}

// Die Karten einer Spalte samt ihren eingerückten Folgezeilen. Eine Karte ist
// **genau eine** Aufgaben-Zeile ohne Einrückung; eine eingerückte Aufgaben-Zeile
// ist Folgezeile und nie eine eigene Karte (Story 4S-000971).
function lesKarten(zeilen, von, bis) {
  const karten = [];
  let inZaun = null;
  for (let i = von; i < bis; i++) {
    const text = ohneCr(zeilen[i]);
    if (inZaun) {
      if (schliesstZaun(text, inZaun)) inZaun = null;
      continue;
    }
    inZaun = zaunOeffnung(text);
    if (inZaun) continue;
    const aufgabe = parseTaskLine(text);
    if (!aufgabe || aufgabe.indent !== '') continue;
    const karte = {
      zeile: i,
      roh: zeilen[i],
      aufgabe,
      text: aufgabe.description,
      status: aufgabe.statusChar,
      // Strukturell und ohne Deutung: Das Kästchen ist nicht leer. Welche
      // Bedeutung ein Zeichen trägt, weiß der Status-Katalog der Anwendung und
      // nicht dieser Kern.
      abgehakt: aufgabe.statusChar !== ' ',
      // 4T-001902: nur in der ersten Zeile der Karte, wie das Vorbild ihn
      // anhängt; Spannen zählen in `ohneCr(roh)`.
      vorbildTermin: lesVorbildTermin(text),
      folgeZeilen: [],
      letzteZeile: i,
    };
    for (let j = i + 1; j < bis; j++) {
      const folge = ohneCr(zeilen[j]);
      if (folge.trim() === '' || !/^[ \t]/.test(folge)) break;
      karte.folgeZeilen.push(j);
      karte.letzteZeile = j;
    }
    karten.push(karte);
    i = karte.letzteZeile;
  }
  return karten;
}

// F2: Das Erledigt-Kennzeichen ist die **erste** Nicht-Leer-Zeile unter der
// Überschrift, wenn sie nur aus einer fett gesetzten Wortgruppe besteht. Steht
// dort etwas anderes, trägt die Spalte kein Kennzeichen — eine spätere fette
// Zeile ist Karten-Inhalt und keine Einstellung.
function lesErledigtKennzeichen(zeilen, von, bis) {
  for (let i = von; i < bis; i++) {
    if (istLeer(zeilen[i])) continue;
    const text = ohneCr(zeilen[i]);
    if (parseTaskLine(text)) return null;
    const treffer = ERLEDIGT_KENNZEICHEN_RE.exec(text);
    return treffer ? { zeile: i, wortlaut: treffer[1] } : null;
  }
  return null;
}

function lesSpalten(zeilen, von, bis) {
  const koepfe = [];
  let inZaun = null;
  for (let i = von; i < bis; i++) {
    const text = ohneCr(zeilen[i]);
    if (inZaun) {
      if (schliesstZaun(text, inZaun)) inZaun = null;
      continue;
    }
    inZaun = zaunOeffnung(text);
    if (inZaun) continue;
    const treffer = UEBERSCHRIFT_RE.exec(text);
    if (treffer) {
      koepfe.push({
        zeile: i,
        // Der Rohtext vor dem Titel — Einzug, Rauten und Abstand. Eine
        // Umbenennung schreibt ihn unverändert wieder hin, statt die Zeile in
        // eine Normalform zu bringen.
        praefix: treffer[1] + treffer[2] + treffer[3],
        raute: treffer[2],
        titel: treffer[4],
      });
    }
  }
  return koepfe.map((kopf, nr) => {
    const endeZeile = nr + 1 < koepfe.length ? koepfe[nr + 1].zeile : bis;
    const kennzeichen = lesErledigtKennzeichen(zeilen, kopf.zeile + 1, endeZeile);
    const titel = kopf.titel.trimEnd();
    const limit = lesSpaltenLimit(titel);
    return {
      titel,
      limit: limit ? limit.zahl : null,
      titelOhneLimit: limit ? limit.titel : titel,
      titelZeile: kopf.zeile,
      praefix: kopf.praefix,
      raute: kopf.raute,
      endeZeile,
      erledigt: kennzeichen !== null,
      erledigtZeile: kennzeichen ? kennzeichen.zeile : null,
      erledigtWortlaut: kennzeichen ? kennzeichen.wortlaut : null,
      karten: lesKarten(zeilen, kennzeichen ? kennzeichen.zeile + 1 : kopf.zeile + 1, endeZeile),
    };
  });
}

/**
 * Liest ein Tafel-Dokument in ein Modell. Wirft nie.
 *
 * @param {string} text voller Dokument-Text.
 * @returns {object} Modell mit `istTafel`, `zeilen`, `spalten`, `archiv`,
 *   `einstellungen`, `befunde` und `zeilenende`.
 */
function leseTafel(text) {
  const quelle = String(text == null ? '' : text);
  const zeilen = trenneZeilen(quelle);
  const befunde = [];
  const kopf = extractFrontmatter(quelle);
  const model = {
    quelle,
    zeilen,
    zeilenende: ermittleZeilenende(zeilen),
    istTafel: false,
    kennzeichen: null,
    kopfZeilen: 0,
    spalten: [],
    archiv: null,
    einstellungen: null,
    befunde,
  };
  if (kopf.raw === null) {
    befunde.push({ code: 'keinKopf', zeile: 1, detail: '' });
    return model;
  }
  model.kopfZeilen = zeileZuOffset(quelle, kopf.endOffset);
  if (kopf.parseError) {
    befunde.push({ code: 'kopfUnlesbar', zeile: 1, detail: String(kopf.parseError) });
    return model;
  }
  if (!Object.prototype.hasOwnProperty.call(kopf.data, KANBAN_KOPF_SCHLUESSEL)) {
    befunde.push({ code: 'keinKennzeichen', zeile: 1, detail: KANBAN_KOPF_SCHLUESSEL });
    return model;
  }
  model.istTafel = true;
  // F1: Der Wert wird mitgeführt, nie gedeutet und nie geschrieben.
  const wert = kopf.data[KANBAN_KOPF_SCHLUESSEL];
  model.kennzeichen = wert == null ? '' : String(wert);

  model.einstellungen = findeEinstellungen(quelle, zeilen);
  if (model.einstellungen && !model.einstellungen.geschlossen) {
    befunde.push({
      code: 'einstellungsBlockOffen',
      zeile: model.einstellungen.vonZeile + 1,
      detail: KANBAN_EINSTELLUNGS_MARKE,
    });
  }
  const bisRest = model.einstellungen ? model.einstellungen.vonZeile : zeilen.length;
  model.archiv = findeArchiv(zeilen, bisRest);
  // 4T-001902: Die Archiv-Karten nach derselben Regel wie die einer Spalte;
  // Leerzeilen und Prosa im Archiv bleiben stehen und zählen nicht.
  if (model.archiv) {
    model.archiv.karten = lesKarten(zeilen, model.archiv.ueberschriftZeile + 1, bisRest);
  }
  model.spalten = lesSpalten(
    zeilen,
    model.kopfZeilen,
    model.archiv ? model.archiv.trennerZeile : bisRest,
  );
  return model;
}

/**
 * Schreibt das Modell zurück. Unberührte Zeilen gehen zeichengenau hinaus —
 * ein unverändertes Modell ist byte-gleich mit seiner Quelle, einschließlich
 * Zeilenenden-Konvention und fehlendem Schluss-Umbruch.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @returns {string}
 */
function schreibeTafel(model) {
  const zeilen = model && Array.isArray(model.zeilen) ? model.zeilen : [];
  return zeilen.join('\n');
}

// --- Erster Verweis einer Karte (Stufe 3) -------------------------------------
//
// 4T-001954 (Epic 3E-000319): Maßgeblich für die Angaben der verlinkten Notiz
// ist der **erste Wiki-Verweis** der Karte (Story 4S-000985, AK4). Gefunden wird
// er mit dem Wiki-Muster der gemeinsamen Erkennungs-Quelle
// (`src/shared/markdown/link-scan.js`) auf der Zeile mit maskiertem Inline-Code;
// zerlegt wird er nach den Regeln des Render-Plugins
// (`src/shared/markdown/plugins/wiki.js`): Alias hinter dem ersten `|`, ein
// Rückstrich am Ziel-Ende fällt weg, Anker hinter dem ersten `#`, und ein
// Verweis mit `[` im Inneren ist keiner. Code-Zäune zählen nicht.
//
// **Die Verweis-Form `@[[…]]` des Vorbilds ist kein Verweis auf eine Notiz**,
// sondern ein Termin in Verweis-Form (`parseMarkdown.ts:69`); sie wird
// übersprungen. Ein `![[…]]` ist eine Einbettung: Sein Teil hinter dem `|` ist
// nach dem Render-Plugin eine Größenangabe und kein Alias, er steht deshalb in
// `zusatz`.

function zerlegeVerweis(inneres, einbettung, roh) {
  const strich = inneres.indexOf('|');
  const zielRoh = (strich >= 0 ? inneres.slice(0, strich) : inneres).replace(/\\$/, '').trim();
  const hinten = strich >= 0 ? inneres.slice(strich + 1).trim() : null;
  if (!zielRoh) return null;
  const raute = zielRoh.indexOf('#');
  const ziel = raute >= 0 ? zielRoh.slice(0, raute) : zielRoh;
  const anker = raute >= 0 ? zielRoh.slice(raute + 1).trim() || null : null;
  if (einbettung && !ziel) return null;
  return {
    ziel,
    anker,
    alias: einbettung ? null : hinten || null,
    zusatz: einbettung ? hinten || null : null,
    einbettung,
    // Das Kürzel einer Bereichs-Verknüpfung `[[@kuerzel:Ziel]]`, sonst null.
    // `ziel` bleibt dabei unverändert samt Kürzel, damit jeder Aufrufer den
    // Verweis so auflöst, wie ihn die Lese-Ansicht auflöst.
    bereich: splitAreaLink(ziel).prefix,
    roh,
  };
}

/**
 * Der erste Wiki-Verweis in einem Text, auch über mehrere Zeilen.
 *
 * @param {string} text Kartentext (eine oder mehrere Zeilen).
 * @returns {null|{ziel: string, anker: string|null, alias: string|null,
 *   zusatz: string|null, einbettung: boolean, bereich: string|null,
 *   roh: string, zeile: number}} `zeile` zählt ab 0 im übergebenen Text;
 *   ein reiner Anker `[[#Abschnitt]]` hat das leere Ziel.
 */
function ersterVerweis(text) {
  for (const verweis of verweiseDesTexts(text)) return verweis;
  return null;
}

// Alle Wiki-Verweise eines Textes in Lese-Reihenfolge, nach den Regeln oben.
// 4T-001957: aus `ersterVerweis` herausgelöst, damit «erster Verweis» und
// «erster Verweis mit Ziel» denselben Durchlauf nehmen und nicht zwei Fassungen
// derselben Erkennung entstehen; das Verhalten von `ersterVerweis` ist
// unverändert (seine Prüffälle aus 4T-001954 stehen unangetastet).
function* verweiseDesTexts(text) {
  let inZaun = null;
  const zeilen = trenneZeilen(text);
  for (let nr = 0; nr < zeilen.length; nr++) {
    const zeile = ohneCr(zeilen[nr]);
    if (inZaun) {
      if (schliesstZaun(zeile, inZaun)) inZaun = null;
      continue;
    }
    inZaun = zaunOeffnung(zeile);
    if (inZaun) continue;
    const maskiert = maskInlineCode(zeile);
    for (const treffer of maskiert.matchAll(createWikiLinkRegex())) {
      const davor = treffer.index > 0 ? maskiert[treffer.index - 1] : '';
      if (davor === '@') continue;
      const inneres = zeile.slice(treffer.index + 2, treffer.index + treffer[0].length - 2);
      if (inneres.includes('[')) continue;
      const einbettung = davor === '!';
      const roh = zeile.slice(
        treffer.index - (einbettung ? 1 : 0),
        treffer.index + treffer[0].length,
      );
      const verweis = zerlegeVerweis(inneres, einbettung, roh);
      if (verweis) yield { ...verweis, zeile: nr };
    }
  }
}

/**
 * Der erste Wiki-Verweis eines Textes, der auf eine **Notiz** zeigen kann.
 *
 * 4T-001957 (Story 4S-000985): Maßgeblich für die Angaben der verlinkten Notiz
 * ist der erste Verweis **mit Ziel**. Übersprungen werden ein reiner Anker
 * `[[#Abschnitt]]` — er zeigt auf die Tafel selbst — und eine Einbettung auf
 * eine Bilddatei `![[bild.png]]`, die ein Bild zeigt und keine Notiz meint.
 * Eine Einbettung auf ein Dokument zählt. Gezählt wird dann der nächste Verweis.
 *
 * **Abweichung vom Vorbild-Werkzeug:** Es nimmt den **letzten** Verweis der
 * Karte (jeder weitere überschreibt den vorigen); hier gilt der erste, wie die
 * Story es festlegt (Entscheidung des Product Owners vom 2026-09-25).
 *
 * @param {string} text Kartentext (eine oder mehrere Zeilen).
 * @returns {null|object} wie `ersterVerweis`.
 */
function ersterVerweisMitZiel(text) {
  for (const verweis of verweiseDesTexts(text)) {
    if (!verweis.ziel) continue;
    if (verweis.einbettung && istBildDatei(verweis.ziel)) continue;
    return verweis;
  }
  return null;
}

/**
 * Der erste Wiki-Verweis einer Karte: gesucht in ihrer Zeile und danach in
 * ihren eingerückten Folgezeilen, also in allem, was die Karte zeigt.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @param {object} karte Karte aus `model.spalten[..].karten`.
 * @returns {null|object} wie `ersterVerweis`; `zeile` ist die Zeile im
 *   Dokument (ab 0).
 */
function ersterVerweisDerKarte(model, karte) {
  return verweisDerKarte(model, karte, ersterVerweis);
}

/**
 * Der erste Wiki-Verweis einer Karte mit Ziel (siehe `ersterVerweisMitZiel`),
 * gesucht in ihrer Zeile und ihren Folgezeilen.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @param {object} karte Karte aus `model.spalten[..].karten`.
 * @returns {null|object} wie `ersterVerweisDerKarte`.
 */
function ersterVerweisMitZielDerKarte(model, karte) {
  return verweisDerKarte(model, karte, ersterVerweisMitZiel);
}

function verweisDerKarte(model, karte, suche) {
  if (!model || !Array.isArray(model.zeilen) || !karte) return null;
  const von = karte.zeile;
  const bis = Number.isInteger(karte.letzteZeile) ? karte.letzteZeile : von;
  const verweis = suche(model.zeilen.slice(von, bis + 1).join('\n'));
  return verweis ? { ...verweis, zeile: von + verweis.zeile } : null;
}

/**
 * Umfang einer Tafel in Spalten, Karten und Befunden — die Zahlen, die eine
 * Anzeige braucht, ohne sie selbst abzuzählen.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @returns {{spalten: number, karten: number, abgehakt: number, befunde: number}}
 */
function tafelUmfang(model) {
  const spalten = model && Array.isArray(model.spalten) ? model.spalten : [];
  let karten = 0;
  let abgehakt = 0;
  for (const spalte of spalten) {
    karten += spalte.karten.length;
    abgehakt += spalte.karten.filter((k) => k.abgehakt).length;
  }
  return {
    spalten: spalten.length,
    karten,
    abgehakt,
    befunde: model && Array.isArray(model.befunde) ? model.befunde.length : 0,
  };
}

module.exports = {
  KANBAN_KOPF_SCHLUESSEL,
  KANBAN_KOPF_WERT_NEU,
  KANBAN_EINSTELLUNGS_MARKE,
  ARCHIV_TRENNER,
  ERLEDIGT_KENNZEICHEN_RE,
  SPALTEN_LIMIT_RE,
  istTafelDokument,
  leseTafel,
  schreibeTafel,
  tafelUmfang,
  // 4T-001954: der erste Verweis einer Karte.
  ersterVerweis,
  ersterVerweisDerKarte,
  // 4T-001957: der erste Verweis mit Ziel, maßgeblich für die Angaben der Notiz.
  ersterVerweisMitZiel,
  ersterVerweisMitZielDerKarte,
  // Bausteine für die Schwester-Module des Ordners; bewusst exportiert statt
  // dort ein zweites Mal geschrieben (Muster task-markers.js).
  trenneZeilen,
  ohneCr,
  crVon,
  istLeer,
};
