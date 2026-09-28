// 4T-001846 (Epic 3E-000110): Der eine Wert des Einstellungs-Blocks, den eine
// Spalten-Änderung nachführen muss.
//
// Prozessneutral wie der Kern nebenan; die einzige Abhängigkeit ist sein
// Zeilen-Werkzeug.
//
// **Warum überhaupt ein Eingriff in einen Rest** (Entscheidung E-B dieses
// Tasks): Der Einstellungs-Block des Vorbilds führt unter `list-collapse` einen
// Wahrheitswert **je Spalte**, in der Reihenfolge der Spalten. Bliebe die Liste
// beim Anlegen, Löschen und Verschieben einer Spalte stehen, hätte das
// Vorbild-Werkzeug nach der ersten Spalten-Änderung die falschen Spalten
// eingeklappt — ein stiller Schaden an fremden Daten, und zwar an Daten, die
// diese Anwendung gar nicht deutet.
//
// **Wie schmal der Eingriff ist:** Geändert wird ausschließlich der Text
// zwischen den eckigen Klammern dieses einen Schlüssels, und die Einträge, die
// bleiben, behalten ihren Wortlaut zeichengenau. Der übrige Block — Zeile,
// Schlüssel-Reihenfolge, Abstände, Code-Zaun, der abschließende `%%` — bleibt
// byte-gleich; ein Neuschreiben der JSON-Zeile aus einem geparsten Objekt käme
// nicht in Frage, weil es jede fremde Angabe umformatieren würde.
//
// **Vier Lagen, in denen nichts geschieht** (E-B): kein Block, kein Schlüssel,
// eine Listen-Länge, die schon vorher nicht zur Spaltenzahl passt, oder eine
// nicht lesbare JSON-Zeile. In allen vieren bleibt der Block unangetastet und
// es wird nichts angelegt — wer die Lage nicht versteht, repariert sie nicht.
//
// **Seit der Stufe 3** (4T-001954, Epic 3E-000319) liest der Kern den Block
// als Einstellungen **je Tafel** und schreibt ihn je Schlüssel (Entscheidung
// des Product Owners vom 2026-09-25, Frage B1 in 4T-001953: der Block ist der
// Ablage-Ort). Dieselben zwei Regeln wie bei `list-collapse` tragen weiter:
// Geändert wird allein die Spanne des einen Schlüssels in der JSON-Zeile, alles
// andere bleibt Byte für Byte stehen; und eine Zeile, die der Kern nicht
// versteht, schreibt er nicht. Hinzu kommen das Anlegen des Blocks, wenn er
// fehlt, und das Entfernen eines Schlüssels für «wie Vorgabe».
//
// **Die Schlüssel-Abbildung** ist am Quelltext des Vorbild-Werkzeugs belegt
// (`src/Settings.ts` im Repositorium `community-archive/obsidian-kanban`, vormals
// `mgmeyers/obsidian-kanban`, Stand `5134c05`, gelesen am 2026-09-25): Typ-Liste
// `KanbanSettings` Zeile 52–93, Schalter
// `move-tags` Zeile 475–515 mit der Beschreibung «When toggled, tags will be
// displayed in the card's footer instead of the card's body.», Obergrenze
// Zeile 405–440 (`-1` heißt unbegrenzt), `DataKey` in
// `src/components/types.ts` Zeile 25–30. Der Block entsteht beim Vorbild als
// zwei Leerzeilen, Marke, Zaun, einzeiliges JSON, Zaun, `%%` ohne
// Schluss-Umbruch (`settingsToCodeblock` in `src/parsers/common.ts:29–39`).
'use strict';

const {
  ohneCr,
  crVon,
  istLeer,
  leseTafel,
  schreibeTafel,
  KANBAN_EINSTELLUNGS_MARKE,
} = require('./kanban-core.js');

const LIST_COLLAPSE_SCHLUESSEL = 'list-collapse';

// Genau eine Fanggruppe für den Klammer-Inhalt. Verschachtelte Klammern kann es
// nicht geben: Der Wert ist eine flache Liste von Wahrheitswerten, und ein
// anderer Inhalt scheitert unten an der Token-Prüfung.
const LIST_COLLAPSE_RE = /("list-collapse"[ \t]*:[ \t]*\[)([^\][]*)(\])/;

// Der Wert, mit dem eine neu angelegte Spalte in die Liste kommt: nicht
// eingeklappt. Er steht hier und nicht an der Aufruf-Stelle, weil er zur
// Grammatik des fremden Blocks gehört und nicht zur Bedienung.
const NEUER_EINTRAG = 'false';

function tokenVon(inhalt) {
  return inhalt.trim() === '' ? [] : inhalt.split(',');
}

/**
 * Führt `list-collapse` einer Spalten-Änderung nach. Mutiert höchstens die eine
 * JSON-Zeile des übergebenen Zeilen-Puffers.
 *
 * @param {Array<string>} zeilen Zeilen-Puffer des Modells.
 * @param {object|null} einstellungen der Block aus `leseTafel`.
 * @param {number} spaltenZahl Zahl der Spalten **vor** der Änderung.
 * @param {{art: string, index?: number, von?: number, nach?: number}} aenderung
 *   `einfuegen` mit `index`, `entfernen` mit `index`, `verschieben` mit `von`
 *   und `nach` (beide als Index in der Liste, `nach` nach dem Entnehmen).
 * @returns {boolean} true, wenn die Zeile geändert wurde; false in jeder der
 *   vier Unterlassungs-Lagen.
 */
function passeListCollapseAn(zeilen, einstellungen, spaltenZahl, aenderung) {
  if (!einstellungen || einstellungen.jsonZeile == null) return false;
  const index = einstellungen.jsonZeile;
  const roh = zeilen[index];
  if (typeof roh !== 'string') return false;
  const cr = crVon(roh);
  const text = ohneCr(roh);

  // Die Lesbarkeits-Schranke: Was nicht als JSON aufgeht, wird nicht angefasst.
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    return false;
  }
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return false;
  const liste = daten[LIST_COLLAPSE_SCHLUESSEL];
  if (!Array.isArray(liste)) return false;
  // Passt die Länge schon vorher nicht zur Spaltenzahl, ist die Liste nicht die,
  // für die diese Nachführung gedacht ist. Dann gilt: Hände weg.
  if (liste.length !== spaltenZahl) return false;

  const treffer = LIST_COLLAPSE_RE.exec(text);
  if (!treffer) return false;
  const tokens = tokenVon(treffer[2]);
  if (tokens.length !== spaltenZahl) return false;
  if (!tokens.every((t) => t.trim() === 'true' || t.trim() === 'false')) return false;

  if (!wendeAn(tokens, aenderung)) return false;

  const vorn = treffer.index + treffer[1].length;
  const neu = text.slice(0, vorn) + tokens.join(',') + text.slice(vorn + treffer[2].length);
  zeilen[index] = neu + cr;
  return true;
}

// Die drei Änderungen auf der Token-Liste. Ein Index außerhalb des Bereichs
// lässt die Liste unberührt und meldet es — lieber ein unveränderter fremder
// Block als ein falsch verschobener.
function wendeAn(tokens, aenderung) {
  const art = aenderung && aenderung.art;
  if (art === 'einfuegen') {
    const i = aenderung.index;
    if (!Number.isInteger(i) || i < 0 || i > tokens.length) return false;
    tokens.splice(i, 0, NEUER_EINTRAG);
    return true;
  }
  if (art === 'entfernen') {
    const i = aenderung.index;
    if (!Number.isInteger(i) || i < 0 || i >= tokens.length) return false;
    tokens.splice(i, 1);
    return true;
  }
  if (art === 'verschieben') {
    const { von, nach } = aenderung;
    if (!Number.isInteger(von) || von < 0 || von >= tokens.length) return false;
    if (!Number.isInteger(nach) || nach < 0 || nach >= tokens.length) return false;
    const [wert] = tokens.splice(von, 1);
    tokens.splice(nach, 0, wert);
    return true;
  }
  return false;
}

// --- Einstellungen je Tafel (Stufe 3) -------------------------------------------

// Die Schlüssel-Abbildung: hiesiger Name, Schlüssel im Block, Art des Werts.
// Alle acht Schlüssel sind die des Vorbilds; einen eigenen, mit `em4me-`
// vorangestellten braucht keine Einstellung. «Tags am Kartenfuß» ist `move-tags`,
// weil der Schalter des Vorbilds genau das tut, was die hiesige Story beschreibt:
// die Tags am Fuß der Karte statt im Text zeigen (Beleg im Kopf-Kommentar).
const TAFEL_EINSTELLUNGEN = Object.freeze(
  [
    { name: 'zielordner', schluessel: 'new-note-folder', art: 'text' },
    { name: 'vorlage', schluessel: 'new-note-template', art: 'text' },
    { name: 'archivMitZeitstempel', schluessel: 'archive-with-date', art: 'schalter' },
    { name: 'archivObergrenze', schluessel: 'max-archive-size', art: 'obergrenze' },
    { name: 'termineRelativ', schluessel: 'show-relative-date', art: 'schalter' },
    { name: 'feldwahl', schluessel: 'metadata-keys', art: 'feldwahl' },
    { name: 'datumZurTagesnotiz', schluessel: 'link-date-to-daily-note', art: 'schalter' },
    { name: 'tagsAmFuss', schluessel: 'move-tags', art: 'schalter' },
  ].map((eintrag) => Object.freeze(eintrag)),
);

// Der Wert der Archiv-Obergrenze, der beim Vorbild «unbegrenzt» heißt.
const ARCHIV_UNBEGRENZT = -1;

// Ein Eintrag der Feldwahl in der Schreibweise des Vorbilds (`DataKey`): alle
// vier Felder sind dort Pflicht, also auch hier. Ein Eintrag, dem eines fehlt,
// wird nicht ergänzt, sondern macht die Feldwahl undeutbar — geraten wird nicht.
function feldAusVorbild(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return undefined;
  const { metadataKey, label, shouldHideLabel, containsMarkdown } = roh;
  if (typeof metadataKey !== 'string' || metadataKey.trim() === '') return undefined;
  if (typeof label !== 'string') return undefined;
  if (typeof shouldHideLabel !== 'boolean' || typeof containsMarkdown !== 'boolean') {
    return undefined;
  }
  return {
    feld: metadataKey,
    bezeichnung: label,
    bezeichnungVerbergen: shouldHideLabel,
    enthaeltMarkdown: containsMarkdown,
  };
}

function feldInVorbild(feld) {
  if (!feld || typeof feld !== 'object') return undefined;
  const roh = {
    metadataKey: feld.feld,
    label: feld.bezeichnung == null ? '' : feld.bezeichnung,
    shouldHideLabel: feld.bezeichnungVerbergen === true,
    containsMarkdown: feld.enthaeltMarkdown === true,
  };
  return feldAusVorbild(roh) ? roh : undefined;
}

/**
 * Deutet einen Wert des Blocks. `undefined` heißt «nicht deutbar»; der Aufrufer
 * behandelt ihn wie einen fehlenden Schlüssel.
 */
function deuteWert(art, roh) {
  if (art === 'schalter') return typeof roh === 'boolean' ? roh : undefined;
  if (art === 'text') return typeof roh === 'string' && roh.trim() !== '' ? roh : undefined;
  if (art === 'obergrenze') {
    return Number.isSafeInteger(roh) && roh >= ARCHIV_UNBEGRENZT ? roh : undefined;
  }
  if (art === 'feldwahl') {
    if (!Array.isArray(roh)) return undefined;
    const felder = roh.map(feldAusVorbild);
    return felder.every(Boolean) ? felder : undefined;
  }
  return undefined;
}

// Der Rückweg: ein hiesiger Wert in die Schreibweise des Vorbilds, nach
// derselben Regel geprüft wie beim Lesen, damit nie etwas geschrieben wird,
// das der Kern selbst nicht zurücklesen könnte.
function schreibWert(art, wert) {
  if (art === 'feldwahl') {
    if (!Array.isArray(wert)) return undefined;
    const roh = wert.map(feldInVorbild);
    return roh.every(Boolean) ? roh : undefined;
  }
  return deuteWert(art, wert);
}

/**
 * Die Einstellungen je Tafel aus einem bereits gelesenen Modell.
 *
 * @param {object} model Modell aus `leseTafel`.
 * @returns {{block: boolean, werte: object, befunde: Array<object>}} `werte`
 *   trägt nur die gesetzten Einstellungen unter ihrem hiesigen Namen; was
 *   fehlt oder nicht deutbar ist, gilt als «wie Vorgabe». Ein nicht deutbarer
 *   Wert hinterlässt einen Befund `einstellungUngueltig` mit dem Schlüssel.
 */
function einstellungenAusModell(model) {
  const ergebnis = { block: false, werte: {}, befunde: [] };
  const block = model && model.einstellungen;
  if (!block) return ergebnis;
  ergebnis.block = true;
  if (block.jsonZeile == null) {
    ergebnis.befunde.push({
      code: 'einstellungsBlockUnlesbar',
      zeile: block.vonZeile + 1,
      detail: KANBAN_EINSTELLUNGS_MARKE,
    });
    return ergebnis;
  }
  // `findeEinstellungen` hat die Zeile bereits als JSON-Objekt gelesen.
  const daten = JSON.parse(ohneCr(model.zeilen[block.jsonZeile]).trim());
  for (const eintrag of TAFEL_EINSTELLUNGEN) {
    if (!Object.prototype.hasOwnProperty.call(daten, eintrag.schluessel)) continue;
    const wert = deuteWert(eintrag.art, daten[eintrag.schluessel]);
    if (wert === undefined) {
      ergebnis.befunde.push({
        code: 'einstellungUngueltig',
        zeile: block.jsonZeile + 1,
        detail: eintrag.schluessel,
      });
    } else {
      ergebnis.werte[eintrag.name] = wert;
    }
  }
  return ergebnis;
}

/**
 * Liest die Einstellungen je Tafel aus dem Block am Dateiende. Wirft nie.
 *
 * @param {string} text voller Dokument-Text.
 * @returns {{block: boolean, werte: object, befunde: Array<object>}}
 */
function leseTafelEinstellungen(text) {
  const model = leseTafel(text);
  if (!model.istTafel) {
    return { block: false, werte: {}, befunde: [{ code: 'keinTafelDokument', detail: '' }] };
  }
  return einstellungenAusModell(model);
}

// --- Die JSON-Zeile je Schlüssel ---------------------------------------------------
//
// Ein kleiner Zerleger für das **oberste** Objekt der Zeile: je Schlüssel die
// Spanne vom Anführungszeichen des Schlüssels bis zum Ende seines Werts. Mehr
// braucht es nicht, um einen Wert zu ersetzen, einen Schlüssel anzuhängen oder
// ihn samt seinem Komma herauszunehmen — und nichts davon fasst ein Zeichen
// außerhalb dieser Spanne an.

function ueberspringeLeerraum(text, i) {
  let j = i;
  while (j < text.length && ' \t\n\r'.includes(text[j])) j++;
  return j;
}

// Index hinter dem schließenden Anführungszeichen, -1 ohne Schluss.
function zeichenketteEnde(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '"') return j + 1;
  }
  return -1;
}

// Index hinter dem Wert, der bei `i` beginnt, -1 wenn er nicht aufgeht.
function wertEnde(text, i) {
  if (text[i] === '"') return zeichenketteEnde(text, i);
  if (text[i] === '{' || text[i] === '[') {
    let tiefe = 0;
    for (let j = i; j < text.length; j++) {
      const zeichen = text[j];
      if (zeichen === '"') {
        const ende = zeichenketteEnde(text, j);
        if (ende < 0) return -1;
        j = ende - 1;
      } else if (zeichen === '{' || zeichen === '[') {
        tiefe++;
      } else if (zeichen === '}' || zeichen === ']') {
        tiefe--;
        if (tiefe === 0) return j + 1;
      }
    }
    return -1;
  }
  let j = i;
  while (j < text.length && !',}] \t\r\n'.includes(text[j])) j++;
  return j > i ? j : -1;
}

function gliederVon(text) {
  let i = ueberspringeLeerraum(text, 0);
  if (text[i] !== '{') return null;
  const glieder = [];
  i = ueberspringeLeerraum(text, i + 1);
  if (text[i] === '}') return { glieder, schluss: i };
  for (;;) {
    if (text[i] !== '"') return null;
    const schluesselEnde = zeichenketteEnde(text, i);
    if (schluesselEnde < 0) return null;
    let schluessel;
    try {
      schluessel = JSON.parse(text.slice(i, schluesselEnde));
    } catch {
      return null;
    }
    let j = ueberspringeLeerraum(text, schluesselEnde);
    if (text[j] !== ':') return null;
    j = ueberspringeLeerraum(text, j + 1);
    const ende = wertEnde(text, j);
    if (ende < 0) return null;
    glieder.push({ schluessel, von: i, wertVon: j, bis: ende });
    i = ueberspringeLeerraum(text, ende);
    if (text[i] === ',') i = ueberspringeLeerraum(text, i + 1);
    else if (text[i] === '}') return { glieder, schluss: i };
    else return null;
  }
}

/**
 * Setzt oder entfernt genau einen Schlüssel in der JSON-Zeile. Ein neuer
 * Schlüssel kommt ans Ende des Objekts, wie ihn das Vorbild anfügt; ein
 * vorhandener behält seinen Platz. `roh === undefined` entfernt.
 *
 * @returns {{text: string}|{befund: object}}
 */
function setzeSchluesselInZeile(text, schluessel, roh) {
  const aufbau = gliederVon(text);
  if (!aufbau) return { befund: { code: 'einstellungsBlockUnlesbar', detail: schluessel } };
  const treffer = aufbau.glieder.filter((g) => g.schluessel === schluessel);
  // Zweimal derselbe Schlüssel: Welcher gilt, entscheidet jeder Leser anders.
  if (treffer.length > 1) return { befund: { code: 'schluesselDoppelt', detail: schluessel } };
  const wertText = roh === undefined ? null : JSON.stringify(roh);
  let neu;
  if (treffer.length === 1) {
    const glied = treffer[0];
    const nr = aufbau.glieder.indexOf(glied);
    if (wertText !== null) {
      neu = text.slice(0, glied.wertVon) + wertText + text.slice(glied.bis);
    } else if (nr > 0) {
      // Samt dem Komma davor: vom Ende des Vorgängers bis zum eigenen Ende.
      neu = text.slice(0, aufbau.glieder[nr - 1].bis) + text.slice(glied.bis);
    } else if (aufbau.glieder.length > 1) {
      neu = text.slice(0, glied.von) + text.slice(aufbau.glieder[1].von);
    } else {
      neu = text.slice(0, glied.von) + text.slice(glied.bis);
    }
  } else {
    if (wertText === null) return { text };
    const glied = JSON.stringify(schluessel) + ':' + wertText;
    const letztes = aufbau.glieder[aufbau.glieder.length - 1];
    neu = letztes
      ? text.slice(0, letztes.bis) + ',' + glied + text.slice(letztes.bis)
      : text.slice(0, aufbau.schluss) + glied + text.slice(aufbau.schluss);
  }
  // Die Gegenprobe: Das Ergebnis muss genau das erwartete Objekt sein, in der
  // erwarteten Reihenfolge. Sonst hat der Zerleger die Zeile anders verstanden
  // als ein JSON-Leser, und dann wird nicht geschrieben.
  const erwartet = JSON.parse(text);
  if (roh === undefined) delete erwartet[schluessel];
  else erwartet[schluessel] = roh;
  let ist;
  try {
    ist = JSON.parse(neu);
  } catch {
    return { befund: { code: 'einstellungsBlockUnlesbar', detail: schluessel } };
  }
  if (JSON.stringify(ist) !== JSON.stringify(erwartet)) {
    return { befund: { code: 'einstellungsBlockUnlesbar', detail: schluessel } };
  }
  return { text: neu };
}

/**
 * Ein neuer Block am Dateiende, in der Form des Vorbilds: Marke, Zaun,
 * einzeiliges JSON, Zaun, `%%`, davor eine Leerzeile. Er steht damit hinter dem
 * Archiv, wenn es eines gibt. Kein Byte der Quelle wird verändert; ein
 * vorhandener Schluss-Umbruch bleibt einer, ein fehlender fehlt weiter.
 */
function mitNeuemBlock(model, schluessel, roh) {
  const eol = model.zeilenende;
  const block = [
    `%% ${KANBAN_EINSTELLUNGS_MARKE}`,
    '```',
    JSON.stringify({ [schluessel]: roh }),
    '```',
    '%%',
  ].join(eol);
  const quelle = model.quelle;
  const zeilen = model.zeilen;
  if (!quelle.endsWith('\n')) return quelle + eol + eol + block;
  const leerzeileDavor = zeilen.length >= 2 && istLeer(zeilen[zeilen.length - 2]);
  return quelle + (leerzeileDavor ? '' : eol) + block + eol;
}

/**
 * Setzt eine Einstellung je Tafel oder nimmt sie zurück auf «wie Vorgabe».
 *
 * «Wie Vorgabe» **entfernt** den Schlüssel aus dem Block (Entscheidung der
 * Sitzung in 4T-001954, nach dem Vorbild, das beim Zurücksetzen ebenso
 * `$unset` schreibt). Fehlt der Block, entsteht er beim ersten Setzen; ein
 * Zurücksetzen ohne Block oder ohne Schlüssel ändert nichts.
 *
 * @param {string} text Dokument-Text.
 * @param {{name: string, wert: *}} angaben `name` aus `TAFEL_EINSTELLUNGEN`;
 *   `wert` `null` oder `undefined` heißt «wie Vorgabe».
 * @returns {{ok: boolean, text?: string, befund?: object}}
 */
function setzeTafelEinstellung(text, angaben = {}) {
  const model = leseTafel(text);
  if (!model.istTafel) return { ok: false, befund: { code: 'keinTafelDokument', detail: '' } };
  const eintrag = TAFEL_EINSTELLUNGEN.find((e) => e.name === angaben.name);
  if (!eintrag) {
    return { ok: false, befund: { code: 'unbekannteEinstellung', detail: String(angaben.name) } };
  }
  const zuruecksetzen = angaben.wert == null;
  const roh = zuruecksetzen ? undefined : schreibWert(eintrag.art, angaben.wert);
  if (!zuruecksetzen && roh === undefined) {
    return { ok: false, befund: { code: 'einstellungUngueltig', detail: eintrag.schluessel } };
  }
  const block = model.einstellungen;
  if (!block) {
    return {
      ok: true,
      text: zuruecksetzen ? model.quelle : mitNeuemBlock(model, eintrag.schluessel, roh),
    };
  }
  if (!block.geschlossen) {
    return {
      ok: false,
      befund: { code: 'einstellungsBlockOffen', detail: KANBAN_EINSTELLUNGS_MARKE },
    };
  }
  if (block.jsonZeile == null) {
    return {
      ok: false,
      befund: { code: 'einstellungsBlockUnlesbar', detail: KANBAN_EINSTELLUNGS_MARKE },
    };
  }
  const zeile = model.zeilen[block.jsonZeile];
  const ergebnis = setzeSchluesselInZeile(ohneCr(zeile), eintrag.schluessel, roh);
  if (ergebnis.befund) return { ok: false, befund: ergebnis.befund };
  model.zeilen[block.jsonZeile] = ergebnis.text + crVon(zeile);
  return { ok: true, text: schreibeTafel(model) };
}

module.exports = {
  LIST_COLLAPSE_SCHLUESSEL,
  passeListCollapseAn,
  // 4T-001954 (Epic 3E-000319): die Einstellungen je Tafel.
  TAFEL_EINSTELLUNGEN,
  ARCHIV_UNBEGRENZT,
  einstellungenAusModell,
  leseTafelEinstellungen,
  setzeTafelEinstellung,
};
