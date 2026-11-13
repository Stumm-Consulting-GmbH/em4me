// 4T-002545 (Epic 3E-000368, Stories 4S-001196 und 4S-001200): Die
// Schreib-Schritte der Datenbank im Hauptprozess — `db-create`, `db-update` und
// `db-delete` über die Schreib-Schnittstelle der Datenbank (`record-auftrag.js`).
//
// **Ein Schreibweg** (Ausführungs-Entscheidung 1 der Konzept-Runde 4T-002543):
// Jeder Schritt ist genau EIN Auftrag an dieselbe Schnittstelle, durch die auch
// die Maske speichert (Df). Prüfregeln, Typ, Pflicht-Angabe, Schlüssel,
// Verweise, Lösch-Schutz und Rechte prüft allein die Schnittstelle; die Rechte
// hängen am Anmeldenamen des Betriebssystems, den sie selbst ermittelt (De).
// Dieses Modul baut keine eigene Rechte-Logik und reicht keine Identität aus
// dem Fenster durch. Werte gehen als Text an die Schnittstelle
// (Ausführungs-Entscheidung 6).
//
// **Tabelle** (Ausführungs-Entscheidung 2): als Pfad relativ zur
// Bereichs-Wurzel oder als Name, über dieselbe Auflösung wie der Prüfer
// (`workflow-db-lookup.js`); zwei gleichnamige sind «Tabelle uneindeutig», nie
// die erste.
//
// **Datensatz** (Da): Zuerst gilt die Angabe als Kennung und wird frisch von
// der Platte gelesen, auf demselben Weg wie die Maske (`liesDatensatz`); so
// findet ein Schritt auch eine Kennung, die ein Schritt davor im selben Lauf
// angelegt hat. Ist sie keine Kennung der Tabelle, gilt die Auflösungs-Ordnung
// der Verweise (`loeseDatensatzVerweis`, Anzeige-Form am Platten-Stand des
// Index); mehrere Treffer sind «uneindeutig», keiner «nicht gefunden».
//
// **Erwartung und Sperre** (Ausführungs-Entscheidung 3, Df): `db-update` und
// `db-delete` geben den unmittelbar davor gelesenen Stand als Erwartung mit.
// Eine Datensatz-Sperre, die dieser Prozess hält (eine offene Maske in
// derselben Anwendung), nähme die Schnittstelle aus ihrer Sperr-Menge; der
// Schritt fragt sie deshalb selbst ab und endet mit demselben Fehlschlag wie
// bei einer fremden Sperre. Gewartet wird nie.
//
// **Lauf-Marke** (Ausführungs-Entscheidung 5): Über die Option `vorSchreiben`
// der Schnittstelle merkt der Schritt vor dem ersten Schreiben jede Datei des
// Plans mit ihrem neuen Inhalt (`merkeLaufStand`); so löst nichts davon ein
// Ereignis aus.
//
// **Index auf dem Stand der eigenen Schreibvorgänge** (Nachtrag zu E3): Nach
// jedem Auftrag merkt der Schritt die geschriebenen und entfernten Dateien im
// Schreib-Stand (`workflow-db-schreibstand.js`); vor jeder Index-Frage trägt
// `indexAufEigenenStand` sie über den Weg des Beobachters nach. So findet die
// Anzeige-Form auch einen Datensatz, den ein Schritt unmittelbar davor
// angelegt oder umbenannt hat, unabhängig vom Zeitabstand.
//
// **Ergebnis** (übertragbar, sprachneutral): `{ ok: true, effect: { kind: 'db',
// paths, table, record, transaction }, record }` mit der Kennung des
// Datensatzes (bei `db-create` der neuen) und der Vorgangs-Kennung des
// Auftrags; sonst `{ ok: false, code, detail }`. Eine Abweisung der
// Schnittstelle reist als `dbRejected` mit ihren Lagen; den Satz bildet das
// Fenster aus den Texten der Maske (`auftrag-text.js`).
//
// Eigener Zustand: keiner.
'use strict';

const path = require('node:path');
const { frischerDateizugriff } = require('../documents/frisch-lesen.js');
const { merkeLaufStand } = require('../documents/self-write.js');
const { pathCompareKey } = require('../../shared/platform.js');
const { istKarteiForm } = require('../../shared/database/table-definition.js');
const { createDbLookup } = require('../../shared/workflows/workflow-db-lookup.js');
const { markierteDateien, tabellenName } = require('../database/table-catalog.js');
const { liesDatensatz } = require('../database/datensatz-auskunft.js');
const { leseDefinition, loeseTabelle } = require('../database/record-auftrag-bestand.js');
const { LAGEN } = require('../database/record-auftrag-pruefung.js');
const { ART_DATENSATZ, loeseGegenstand } = require('../database/lock-store.js');
const { loeseDatensatzVerweis } = require('../index/datensatz-verweis-aufloesung.js');
const { createDbSchreibStand } = require('./workflow-db-schreibstand.js');

/** Die Befehle dieses Moduls. */
const DB_WRITE_KEYWORDS = Object.freeze(['db-create', 'db-update', 'db-delete']);
/** Code einer Abweisung der Schreib-Schnittstelle; `detail.lagen` trägt ihre Lagen. */
const DB_REJECTED = 'dbRejected';
const ART_JE_BEFEHL = Object.freeze({
  'db-create': 'create',
  'db-update': 'update',
  'db-delete': 'delete',
});

function fehlschlag(code, detail = {}) {
  return { ok: false, code, detail };
}

// Lagen in übertragbarer Form: allein Daten, keine Fehler-Objekte.
function abgewiesen(lagen, ziel) {
  return fehlschlag(DB_REJECTED, { ...ziel, lagen: JSON.parse(JSON.stringify(lagen)) });
}

function relativ(wurzel, absPfad) {
  return path.relative(wurzel, absPfad).split(path.sep).join('/');
}

// Die Identität eines Sperr-Gegenstands über dieselbe Auflösung wie die
// Schnittstelle (`identitaet` in `record-auftrag.js`).
function identitaet(wurzel, gegenstand) {
  const gelesen = loeseGegenstand(wurzel, gegenstand);
  return gelesen.ok ? [gelesen.art, gelesen.schluessel, gelesen.kennung || ''].join('/') : null;
}

/**
 * Baut die Ausführung der Schreib-Schritte der Datenbank.
 *
 * @param {object} deps Abhängigkeiten aus main.js (`ipcDeps`).
 * @param {{fuehreAuftragAus: Function}} deps.schreibSchnittstelle Die eine
 *   Schreib-Schnittstelle des Prozesses (`app/wiring.js`).
 * @param {{gehalteneSperren: Function}} deps.sperrVerwaltung Die eine
 *   Sperr-Verwaltung des Prozesses, dieselbe wie die der Schnittstelle.
 * @param {() => boolean} deps.datenbankAktiv Tor der Erweiterung «Datenbank».
 * @param {object} deps.backlinks Bereichs-Index (`ensureIndexForDemand`, `datenbankSicht`).
 * @param {object} [deps.fsp] Dateizugriff (Vorgabe: frisch lesend).
 * @param {Function} [deps.liesDatensatz] Lese-Weg der Maske (Prüffälle).
 * @param {Function} [deps.loeseVerweis] Auflösungs-Ordnung der Verweise (Prüffälle).
 * @param {Function} [deps.merkeLaufStand] Lauf-Marke (Prüffälle).
 * @param {object} [deps.schreibStand] Der Schreib-Stand des Prozesses
 *   (`createDbSchreibStand`), geteilt mit den übrigen Datenbank-Befehlen;
 *   ohne ihn baut das Modul einen eigenen.
 * @returns {{runDbStep: Function, readRecord: Function, readValue: Function, aufloesung: object}}
 *   `aufloesung` trägt Tor, Sicht und die Auflösung von Tabelle und Datensatz
 *   für die Masken- und Konsistenz-Befehle (4T-002548).
 */
function createWorkflowDbSteps(deps) {
  const fsp = deps.fsp || frischerDateizugriff;
  const lies = typeof deps.liesDatensatz === 'function' ? deps.liesDatensatz : liesDatensatz;
  const loeseVerweis =
    typeof deps.loeseVerweis === 'function' ? deps.loeseVerweis : loeseDatensatzVerweis;
  const merke = typeof deps.merkeLaufStand === 'function' ? deps.merkeLaufStand : merkeLaufStand;
  const schreibStand = deps.schreibStand || createDbSchreibStand({ backlinks: deps.backlinks });

  // Fail-closed: Ohne Tor gilt die Datenbank als ausgeschaltet.
  function datenbankAn() {
    return typeof deps.datenbankAktiv === 'function' && deps.datenbankAktiv() === true;
  }

  // Die Index-Sicht am Platten-Stand, nach dem Anstoß des Index wie beim
  // Schreibweg der Maske (`database:auftrag`) und auf dem Stand der eigenen
  // Schreibvorgänge; null, solange er nicht bereit ist.
  function sichtFuer(ctx) {
    const { backlinks } = deps;
    if (!backlinks) return null;
    const sender = ctx.event && ctx.event.sender ? ctx.event.sender.id : 'workflow';
    if (typeof backlinks.ensureIndexForDemand === 'function') {
      backlinks.ensureIndexForDemand(null, `${sender}:database`, ctx.root);
    }
    if (!schreibStand.indexAufEigenenStand(ctx.root)) return null;
    if (typeof backlinks.datenbankSicht !== 'function') return null;
    const lage = backlinks.datenbankSicht(null, ctx.root, { ohnePuffer: true });
    return lage && lage.sicht ? lage.sicht : null;
  }

  function loeseTabelleAuf(ctx, sicht, angabe) {
    const tabellen = markierteDateien(sicht).tabellen.map((abs) => ({
      name: tabellenName(abs),
      path: relativ(ctx.root, abs),
      abs,
    }));
    const antwort = createDbLookup({ tables: tabellen }).dbTable(angabe);
    if (antwort.state === 'ambiguous') return fehlschlag('dbTableAmbiguous', { table: angabe });
    if (antwort.state !== 'known') return fehlschlag('dbTableUnknown', { table: angabe });
    const treffer = tabellen.find((t) => t.path === antwort.path);
    return { ok: true, name: antwort.name, rel: treffer.path, abs: treffer.abs };
  }

  // Liest den Datensatz frisch wie die Maske: `{ ok, kennung, erwartet }`,
  // `{ unbekannt: true }` oder ein Fehlschlag.
  async function liesFrisch(ctx, tabelle, kennung, ziel) {
    const gelesen = await lies({ fsp, wurzel: ctx.root, tabelle: tabelle.rel, kennung });
    if (gelesen && gelesen.status === 'ready') {
      return {
        ok: true,
        kennung: gelesen.kennung,
        erwartet: gelesen.erwartet,
        datei: gelesen.datei,
        karteikarte: gelesen.karteikarte === true,
      };
    }
    const code = gelesen && typeof gelesen.code === 'string' ? gelesen.code : LAGEN.unerwartet;
    if (code === LAGEN.datensatzUnbekannt) return { unbekannt: true };
    return abgewiesen([{ code, tabelle: tabelle.rel, id: kennung }], ziel);
  }

  // Da: Kennung, sonst Anzeige-Form nach der Auflösungs-Ordnung der Verweise.
  async function loeseDatensatzAuf(ctx, sicht, tabelle, angabe, ziel) {
    const direkt = await liesFrisch(ctx, tabelle, angabe, ziel);
    if (!direkt.unbekannt) return direkt;
    const verweis = loeseVerweis(sicht, tabelle.abs, angabe);
    const status = verweis && verweis.status;
    if (status === 'mehrdeutig') return fehlschlag('dbRecordAmbiguous', ziel);
    if (status !== 'kennung' && status !== 'anzeige') return fehlschlag('dbRecordUnknown', ziel);
    const gelesen = await liesFrisch(ctx, tabelle, verweis.kennung, ziel);
    return gelesen.unbekannt ? fehlschlag('dbRecordUnknown', ziel) : gelesen;
  }

  // Df, Ausführungs-Entscheidung 3: Hält dieser Prozess die Sperre des
  // Datensatzes (eine offene Maske in derselben Anwendung)?
  function vonDiesemProzessGesperrt(ctx, tabelle, kennung) {
    const ziel = identitaet(ctx.root, { art: ART_DATENSATZ, tabelle: tabelle.rel, id: kennung });
    if (ziel === null) return false;
    const wurzel = pathCompareKey(ctx.root);
    return deps.sperrVerwaltung
      .gehalteneSperren()
      .some(
        (eintrag) =>
          !!eintrag &&
          !!eintrag.gegenstand &&
          eintrag.gegenstand.art === ART_DATENSATZ &&
          typeof eintrag.bereichsWurzel === 'string' &&
          pathCompareKey(eintrag.bereichsWurzel) === wurzel &&
          identitaet(eintrag.bereichsWurzel, eintrag.gegenstand) === ziel,
      );
  }

  // Die Karteikarte einer Neuanlage in Kartei-Form: ihr Name ist der Wert des
  // einteiligen Schlüssels, wie bei «Neue Karteikarte». Ohne ihn bleibt die
  // Angabe weg, und die Schnittstelle meldet ihre Lage.
  //
  // Anders als «Neue Karteikarte» fordert der Schritt die Ausnahme von der
  // Pflicht-Prüfung (`pflichtAussetzen`) NICHT an (Entscheidung des Product
  // Owners vom 2026-11-12): Fehlt ein Pflicht-Feld, weist die Schnittstelle mit
  // `auftragPflichtAngabeFehlt` ab wie in Tabellen-Form, und es entsteht nichts.
  async function karteikarteFuer(tabelle, werte) {
    const gelesen = await leseDefinition(fsp, tabelle.abs, tabelle.rel);
    if (!gelesen.ok || !istKarteiForm(gelesen.definition)) return null;
    const key = gelesen.definition.key;
    if (!Array.isArray(key) || key.length !== 1) return null;
    const klein = String(key[0]).toLowerCase();
    const name = Object.keys(werte).find((feld) => feld.toLowerCase() === klein);
    return name !== undefined && werte[name].trim() !== '' ? { name: werte[name] } : null;
  }

  // Die Abweisung der Schnittstelle als Fehlschlag; eine belegte
  // Datensatz-Sperre mit demselben Satz wie die eigene (E2).
  function ausAbweisung(ergebnis, ziel) {
    const lagen =
      Array.isArray(ergebnis.lagen) && ergebnis.lagen.length > 0
        ? ergebnis.lagen
        : [{ code: ergebnis.code || LAGEN.unerwartet }];
    const datensatzGesperrt = lagen.some(
      (lage) =>
        lage &&
        lage.code === LAGEN.gesperrt &&
        !!lage.gegenstand &&
        lage.gegenstand.art === ART_DATENSATZ,
    );
    return datensatzGesperrt ? fehlschlag('dbRecordLocked', ziel) : abgewiesen(lagen, ziel);
  }

  async function auftragFuer(ctx, sicht, step, tabelle, ziel) {
    const art = ART_JE_BEFEHL[step.keyword];
    const anweisung = { tabelle: tabelle.rel, art };
    if (art !== 'delete') {
      anweisung.werte = Object.fromEntries(step.pairs.map((paar) => [paar.key, paar.value]));
    }
    if (art === 'create') {
      const karteikarte = await karteikarteFuer(tabelle, anweisung.werte);
      if (karteikarte) anweisung.karteikarte = karteikarte;
      return { anweisung };
    }
    const datensatz = await loeseDatensatzAuf(ctx, sicht, tabelle, String(step.args[1]), ziel);
    if (!datensatz.ok) return { ende: datensatz };
    if (vonDiesemProzessGesperrt(ctx, tabelle, datensatz.kennung)) {
      return { ende: fehlschlag('dbRecordLocked', ziel) };
    }
    anweisung.id = datensatz.kennung;
    anweisung.erwartet = datensatz.erwartet;
    // Die Datei des Datensatzes beim Löschen: Eine Karteikarte geht fort und
    // steht nicht im Schreib-Plan; beim Ändern nennt der Plan die Datei selbst.
    return { anweisung, datei: art === 'delete' ? datensatz.datei : null };
  }

  /**
   * Führt einen Schreib-Schritt der Datenbank aus.
   *
   * @param {{root: string, event?: object}} ctx Bereich des sendenden Fensters.
   * @param {{keyword: string, args: string[], pairs?: object[]}} step geprüfter Schritt.
   * @returns {Promise<object>}
   */
  async function runDbStep(ctx, step) {
    const ziel = { table: String(step.args[0]), record: step.args.length > 1 ? step.args[1] : '' };
    if (!datenbankAn()) return abgewiesen([{ code: LAGEN.erweiterungAus }], ziel);
    const { schreibSchnittstelle, sperrVerwaltung } = deps;
    if (!schreibSchnittstelle || !sperrVerwaltung) return fehlschlag('unexpected');
    const sicht = sichtFuer(ctx);
    if (!sicht) return fehlschlag('notReady');
    const tabelle = loeseTabelleAuf(ctx, sicht, String(step.args[0]));
    if (!tabelle.ok) return tabelle;
    // Die Tabelle steht fest; ab hier nennt jeder Fehlschlag ihren Namen.
    ziel.table = tabelle.name;
    // Nur eine Tabelle im Bereich, wie beim Schreibweg der Maske.
    if (!loeseTabelle(ctx.root, tabelle.rel).ok) return fehlschlag('outsideArea');
    const vorbereitet = await auftragFuer(ctx, sicht, step, tabelle, ziel);
    if (vorbereitet.ende) return vorbereitet.ende;
    // Die Dateien des Schritts: beim Löschen die Datei des Datensatzes, dazu
    // jede Datei des Schreib-Plans.
    const geschrieben = [vorbereitet.datei].filter((pfad) => typeof pfad === 'string');
    const ergebnis = await schreibSchnittstelle.fuehreAuftragAus(
      ctx.root,
      { anweisungen: [vorbereitet.anweisung] },
      {
        vorSchreiben: (dateien) => {
          for (const datei of dateien) {
            merke(datei.pfad, datei.neu);
            geschrieben.push(datei.pfad);
          }
        },
      },
    );
    // Auch nach einer Abweisung: Ein teilweise geschriebener Auftrag hat
    // Dateien berührt, und das Nachtragen liest ohnehin die Platte.
    schreibStand.merkeGeschrieben(ctx.root, geschrieben);
    if (!ergebnis || ergebnis.ok !== true) return ausAbweisung(ergebnis || {}, ziel);
    const erstes = Array.isArray(ergebnis.ergebnisse) ? ergebnis.ergebnisse[0] : null;
    const kennung = erstes && typeof erstes.id === 'string' ? erstes.id : vorbereitet.anweisung.id;
    return {
      ok: true,
      record: kennung,
      effect: {
        kind: 'db',
        paths: [tabelle.abs],
        table: tabelle.name,
        record: kennung,
        transaction: ergebnis.vorgang,
      },
    };
  }

  /**
   * 4T-002547 (Dc, V2): Ein Datensatz einer Schleife `db-for-each`, zu Beginn
   * seiner Wiederholung frisch von der Platte gelesen, auf demselben Weg wie die
   * Maske. Die Tabelle nennt der Hauptprozess selbst (Pfad aus der Abfrage).
   *
   * @param {{root: string, event?: object}} ctx Bereich des sendenden Fensters.
   * @param {{tabelle: string, kennung: string}} anfrage Pfad der Tabelle
   *   relativ zur Bereichs-Wurzel und Kennung.
   * @returns {Promise<object>} `{ ok: true, record: { id, table, file, fields } }`
   *   mit `file` relativ zur Wurzel (Karteikarte, sonst die Tabellen-Datei) und
   *   `fields` Feld-Name → Zell-Text, sonst ein Fehlschlag.
   */
  async function readRecord(ctx, { tabelle, kennung }) {
    const ziel = { table: tabelle, record: kennung };
    if (!datenbankAn()) return abgewiesen([{ code: LAGEN.erweiterungAus }], ziel);
    const sicht = sichtFuer(ctx);
    if (!sicht) return fehlschlag('notReady');
    const tab = loeseTabelleAuf(ctx, sicht, tabelle);
    if (!tab.ok) return tab;
    ziel.table = tab.name;
    const gelesen = await liesFrisch(ctx, tab, kennung, ziel);
    // Im Lauf verschwunden: ein Fehlschlag mit Grund, nie ein stilles Überspringen.
    if (gelesen.unbekannt) return fehlschlag('dbRecordUnknown', ziel);
    if (!gelesen.ok) return gelesen;
    const datei = gelesen.karteikarte && gelesen.datei ? gelesen.datei : tab.abs;
    return {
      ok: true,
      record: {
        id: gelesen.kennung,
        table: tab.name,
        file: relativ(ctx.root, datei),
        fields: { ...gelesen.erwartet },
      },
    };
  }

  /**
   * 4T-002547 (Dd, V3): Der Wert eines Felds für `{{db:Tabelle:Datensatz:Feld}}`,
   * zum Zeitpunkt des Schritts frisch gelesen; der Datensatz wird gefunden wie
   * in den Schreib-Schritten (`loeseDatensatzAuf`). «Nicht gefunden»,
   * «uneindeutig» und ein unbekanntes Feld sind ein Fehlschlag, nie ein leerer Text.
   *
   * @param {{root: string, event?: object}} ctx
   * @param {{table: string, record: string, field: string}} anfrage
   * @returns {Promise<object>} `{ ok: true, value }` oder ein Fehlschlag.
   */
  async function readValue(ctx, { table, record, field }) {
    const ziel = { table, record };
    if (!datenbankAn()) return abgewiesen([{ code: LAGEN.erweiterungAus }], ziel);
    const sicht = sichtFuer(ctx);
    if (!sicht) return fehlschlag('notReady');
    const tab = loeseTabelleAuf(ctx, sicht, table);
    if (!tab.ok) return tab;
    ziel.table = tab.name;
    const datensatz = await loeseDatensatzAuf(ctx, sicht, tab, record, ziel);
    if (!datensatz.ok) return datensatz;
    const klein = field.toLowerCase();
    const name = Object.keys(datensatz.erwartet).find((f) => f.toLowerCase() === klein);
    if (name === undefined) return fehlschlag('dbFieldUnknown', { table: tab.name, field });
    return { ok: true, value: datensatz.erwartet[name] };
  }

  // 4T-002548 (V1): dieselbe Auflösung für db-open und db-check (workflow-db-masken.js).
  const aufloesung = { datenbankAn, sichtFuer, loeseTabelleAuf, loeseDatensatzAuf };

  return { runDbStep, readRecord, readValue, aufloesung };
}

module.exports = { DB_REJECTED, DB_WRITE_KEYWORDS, createWorkflowDbSteps };
