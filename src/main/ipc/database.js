// 4T-001510 (Epic 3E-000250, E4): Die Kanäle des Katalogs — der Vertrag, über
// den die Oberfläche nach Tabellen und ihren Definitionen fragt.
//
// **Zwei Kanäle, weil der Katalog zwei Auskünfte gibt** (Entscheidung des
// Product Owners vom 2026-09-06; Begründung im Katalog-Modul):
//
//   database:overview   Steckbrief, Tabellen-Namen und Fehlerlagen
//   database:table      die vollständige Definition EINER Tabelle
//
// 4T-001758 (Epic 3E-000253): Der Überblick trägt zusätzlich die Bereichs-ART
// (`istDatenbankBereich`) und ist auch ohne offene Datei aufrufbar, sofern ein
// Bereich gebunden ist. Ein eigener Kanal für die Bereichs-Art wäre eine zweite
// Anfrage auf denselben Bestand gewesen; die Begründung steht am Feld im
// Katalog-Modul.
//
// 4T-001792 (Epic 3E-000255, E10.14): Ein dritter Kanal kommt hinzu, weil er
// eine dritte Auskunft gibt:
//
//   database:changeLog  die Änderungsbelege EINES Datensatzes
//
// **Er prüft selbst und fail-closed**, anders als die beiden oberen, die nur
// den Index befragen. Der Grund liegt in seinem Zugriff: Er liest eine Datei
// NEBEN dem übergebenen Pfad und geht damit am Index vorbei, der sonst die
// Bereichs-Grenze mit einhält. Was der Index leistet, muss dieser Kanal
// deshalb selbst leisten (Bauplan S1).
//
// 4T-001825 (Epic 3E-000254, Bauplan B1): Zwei Kanäle der Schreib-Schnittstelle
// kommen hinzu, einer je Einstieg der Schnittstelle und nicht einer je
// Operation:
//
//   database:auftrag    ein ganzer Auftrag (anlegen, ändern, löschen)
//   database:neuanlage  das Eröffnen einer Neuanlage in EINER Tabelle
//
// Der Auftrag bleibt EIN Kanal, weil er als Ganzes wirkt; ein Kanal je
// Operation zerschnitte die Transaktion über mehrere Tabellen. Das Eröffnen ist
// ein eigener Vertrag mit eigener Rückgabe (Kennung und Hochwasserstand). Beide
// prüfen wie `database:changeLog` selbst und fail-closed, bevor sie die
// Schnittstelle rufen (B2), und reichen deren Ergebnis unverändert durch (B3).
//
// 4T-001938 (Epic 3E-000257, Bauplan B1, B3, B4): Ein sechster Kanal gibt die
// Auskunft, die keiner der fünf gibt, nämlich Datensätze mit ihren Zellen:
//
//   database:datensatz  EIN Datensatz für die Einzel-Maske, frisch gelesen
//
// Er prüft wie `database:neuanlage` selbst und fail-closed und reicht dann an
// `datensatz-auskunft.js` durch; die Logik liegt dort.
//
// 4T-001941 (Epic 3E-000257, Bauplan B1): Ein siebter Kanal bedient die
// Datensatz-Sperre der Maske:
//
//   database:sperre     nehmen, freigeben, brechen oder Auskunft für EINEN Datensatz
//
// Er prüft wie `database:datensatz` selbst und fail-closed und reicht an
// `sperre-bedienung.js` durch; die Logik liegt dort.
//
// 4T-001942 (Epic 3E-000257, Bauplan B1): Ein achter Kanal liefert die
// Wertehilfe der Verweis-Felder:
//
//   database:datensaetze  die Datensätze EINER Tabelle mit Kennung, Anzeige-Form
//                         und Schlüssel, frisch gelesen
//
// Er prüft wie `database:datensatz` selbst und fail-closed, nimmt die Tabelle
// aber auch beim Namen und prüft die Lage erst nach der Auflösung auf den Pfad;
// die Logik liegt in `datensatz-liste.js`.
//
// 4T-001943 (Epic 3E-000257, Bauplan B1): Ein neunter Kanal schreibt die
// erzeugte Maske einer Tabelle als Datei heraus:
//
//   database:maskeSchreiben  die Masken-Datei EINER Tabelle exklusiv anlegen
//
// Er prüft wie `database:datensatz` selbst und fail-closed und reicht an
// `masken-datei.js` durch; die Logik liegt dort. `database:datensatz` bekommt
// dazu die Sicht herein, damit er den Körper einer Masken-Datei liefern kann.
//
// 4T-001944 (Bauplan B3): Ein zehnter Kanal prüft den Bestand:
//
//   database:konsistenz  die Befunde EINER oder aller Tabellen, frisch gelesen
//
// Er prüft wie `database:datensaetze` selbst und fail-closed und reicht an
// `konsistenz-pruefung.js` durch; die Logik liegt dort.
//
// 4T-001945 (Bauplan B2): Ein elfter Kanal gibt den Verwendungsnachweis:
//
//   database:verwendung  wer EINE Tabelle oder EINEN Datensatz benutzt, frisch gelesen
//
// Er prüft wie `database:konsistenz` selbst und fail-closed und reicht an
// `verwendungsnachweis.js` durch; die Logik liegt dort.
//
// 4T-002249 (Epic 3E-000262, S1, S2): Ein zwölfter Kanal gibt die Auskunft über
// eine Listen-Maske:
//
//   database:liste  Angaben, Quell-Tabelle, Feld je Spalte und Maske EINER Abfrage-Datei
//
// Er prüft wie `database:datensaetze` selbst und fail-closed und reicht an
// `listen-auskunft.js` durch; die Logik liegt dort. Die Zeilen liefert er nicht,
// weil die Ergebnismenge der Abfrage im Anzeige-Prozess bereits vorliegt.
// 4T-002250 (S3): Mit den Kennungen der gelieferten Zeilen nennt er dazu die
// Zeilen, deren Datensatz nach `editable` der Definition nicht änderbar ist.
//
// 4T-002252 (Epic 3E-000262, S1, S8): Ein dreizehnter Kanal wertet die Ausdrücke
// einer Einzel-Maske aus, die einen Pfad über ein Verweis-Feld nennen:
//
//   database:ausdruecke  Werte und Bedingungen EINES Datensatz-Entwurfs
//
// Er prüft wie `database:datensatz` selbst und fail-closed und reicht an
// `ausdruecke-auskunft.js` durch; die Logik liegt dort.
//
// 4T-002333 (Epic 3E-000264, T3): Ein vierzehnter Kanal sagt dem Klick auf einen
// Verweis `[[Tabelle#^…]]`, ob er in die Maske führt:
//
//   database:verweisZiel  Kopf-Datei und Kennung des Datensatzes zu Ziel und Anker
//
// Er prüft wie `database:datensaetze` selbst und fail-closed und fragt die eine
// Auflösungs-Ordnung in `datensatz-verweis-aufloesung.js`, aus der auch die
// Gültigkeit des Verweises antwortet. Er liest nur und schreibt nie.
//
// **Warum die Oberfläche kein Frontmatter selbst liest** (E4): Der Katalog
// braucht den Bestand über die einzelne Datei hinaus und liegt deshalb im
// Haupt-Prozess; Maßstab ist die Reichweite des Zugriffs und nicht die
// Zugehörigkeit zu einem Baustein. Ein Fenster kennt nur seine eigenen
// Dokumente und könnte die Frage «welche Tabellen gibt es» gar nicht
// beantworten.
//
// Die Form folgt den Profil-Kanälen, wie E4 es vorgibt: ein Modul je
// Fachlichkeit mit gebündelten Kanälen und Deps-Objekt. Der Grundsatz der
// Abfrage-Sprache gilt auch hier — ein unvollständiger Kontext ergibt die leere
// Menge und nie ein zu großes Ergebnis.
'use strict';

const fsp = require('node:fs/promises');
// 4T-001825: Auflösen einer Tabellen-Angabe gegen die Bereichs-Wurzel.
const path = require('node:path');
const {
  createDatabaseCatalogCache,
  katalogUeberblick,
  rolleUndRechteDerTabelle,
  tabellenDefinition,
} = require('../database/table-catalog.js');
// 4T-001792 (Epic 3E-000255): Die harte Bereichs-Grenze der Anwendung und der
// lesende Zugriff auf die Beleg-Datei. Beide liegen fertig bereit; hier
// entsteht keine zweite Prüfung und keine zweite Lesung.
const { isInsideArea } = require('../area/area-path.js');
const { belegeDesDatensatzes } = require('../database/change-log.js');
// 4T-001938: Die Auskunft über einen Datensatz und die wirksame Rückfall-Sprache
// der Datenbank, aus der die Beschriftungen der erzeugten Maske aufgelöst werden.
const { liesDatensatz } = require('../database/datensatz-auskunft.js');
const { wirksameRueckfallSprache } = require('../../shared/database/database-steckbrief.js');
// 4T-002148: die Codes der Rollen-Hinweise für die Antwort bei geschlossenem Tor.
const { ROLLEN_HINWEISE, ZUORDNUNG_HINWEISE } = require('../../shared/database/rollen-angaben.js');
// 4T-001941: Die Bedienung der Datensatz-Sperre über die eine Sperr-Verwaltung.
const { AKTIONEN: SPERR_AKTIONEN, bediene } = require('../database/sperre-bedienung.js');
// 4T-001942: Die Liste der Datensätze einer Tabelle für die Wertehilfe.
const { findeZielTabelle, liesDatensatzListe } = require('../database/datensatz-liste.js');
// 4T-001943: Die Masken-Datei einer Tabelle herausschreiben.
const { schreibeMaskenDatei } = require('../database/masken-datei.js');
// 4T-001944: Die Konsistenz-Prüfung über den Bestand.
const { pruefeKonsistenz } = require('../database/konsistenz-pruefung.js');
// 4T-001945: Der Verwendungsnachweis auf Tabellen- und Datensatz-Ebene.
const {
  verwendungDerTabelle,
  verwendungDesDatensatzes,
} = require('../database/verwendungsnachweis.js');
// 4T-002249: Die Auskunft über eine Listen-Maske.
const { fremdeMaskenDerAbfragen, liesListe } = require('../database/listen-auskunft.js');
// 4T-002253 (Epic 3E-000262): der Positions-Bereich einer Einzel-Maske.
const { liesPositionsListe } = require('../database/positions-auskunft.js');
// 4T-002252: Die Pfad-Ausdrücke der Einzel-Maske.
const { werteAusdrueckeAus } = require('../database/ausdruecke-auskunft.js');
// 4T-002333: Das Ziel eines Datensatz-Verweises für den Klick in die Maske.
const { verweisZiel } = require('../index/datensatz-verweis-aufloesung.js');

// 4T-002252: Höchstzahl der Ausdrücke je Anfrage; eine Maske mit mehr
// Pfad-Stellen ist kein Anwendungsfall, sondern eine Anfrage in falscher Form.
const MAX_AUSDRUECKE = 200;

// 4T-002252: Der Entwurf ist ein Objekt aus Text-Werten, jeder Ausdruck ein
// Paar aus Text-Kennung und Text-Quelle.
function ausdrueckeInForm(params) {
  if (!istObjekt(params) || !istText(params.tabelle)) return false;
  if (params.kennung !== null && !istText(params.kennung)) return false;
  if (!istObjekt(params.entwurf)) return false;
  if (!Object.values(params.entwurf).every((wert) => typeof wert === 'string')) return false;
  const liste = params.ausdruecke;
  if (!Array.isArray(liste) || liste.length > MAX_AUSDRUECKE) return false;
  return liste.every((e) => istObjekt(e) && istText(e.id) && typeof e.quelle === 'string');
}

// 4T-001792: Die Antwort, wenn eine der Vorbedingungen nicht erfüllt ist. Sie
// ist als Funktion und nicht als geteilte Konstante geschrieben, damit kein
// Aufrufer die Listen einer fremden Antwort in der Hand hält.
function ohneZugriff() {
  return { status: 'unavailable', belege: [], befunde: [], verkettung: null };
}

// 4T-002148 (Epic 3E-000263, S11): Die Hinweise der Rollen, der Vorgabe-Rolle
// und der Zuordnung, wie sie Steckbrief und Katalog melden.
const ROLLEN_CODES = new Set([...ROLLEN_HINWEISE, ...ZUORDNUNG_HINWEISE]);
const keinRollenHinweis = (hinweis) => !(hinweis && ROLLEN_CODES.has(hinweis.code));

// 4T-002148 (S11): Ein Überblick ohne Berechtigungen, für das geschlossene Tor.
// Im Aus-Zustand bleiben Rollen, Zuordnung und Vorgabe-Rolle bloßes Frontmatter:
// keine eigene Rolle, keine Erlaubnis-Menge je Tabelle, keine ausgelegten Rollen
// im Steckbrief und keine Rollen-Hinweise unter den Fehlerlagen. Alle übrigen
// Angaben bleiben, wie der Katalog sie liefert. Der Überblick ist frisch
// gebildet; ersetzt werden seine Felder, nicht die Listen des Katalogs.
function ohneRollen(ueberblick) {
  delete ueberblick.eigeneRolle;
  ueberblick.hints = ueberblick.hints.filter(keinRollenHinweis);
  ueberblick.tabellen = ueberblick.tabellen.map(({ rechte: _rechte, ...eintrag }) => eintrag);
  if (ueberblick.steckbrief) {
    const { rollen: _r, defaultRole: _d, users: _u, ...steckbrief } = ueberblick.steckbrief;
    if (Array.isArray(steckbrief.hints))
      steckbrief.hints = steckbrief.hints.filter(keinRollenHinweis);
    ueberblick.steckbrief = steckbrief;
  }
  return ueberblick;
}

// 4T-001792: Der Beleg in der Gestalt, die die Ansicht braucht.
//
// **Ausdrücklich nicht dabei:** die rohen Zellen eines beschädigten Belegs, der
// ungedeutete Vorspann, die Zeilen-Nummer in der Datei, die Vorgangs-Kennung
// und der Pfad der Beleg-Datei. Keines davon zeigt die Seite, und was die
// Oberfläche nicht braucht, verlässt den Haupt-Prozess nicht.
function alsAnzeige(beleg) {
  const b = beleg || {};
  return {
    art: b.art || null,
    zeitpunkt: b.zeitpunkt || null,
    benutzer: b.benutzer || null,
    rechner: b.rechner || null,
    felder: (b.felder || []).map((feld) => ({ name: feld.name, alt: feld.alt, neu: feld.neu })),
    verdichtung: b.verdichtung
      ? {
          anzahl: b.verdichtung.anzahl,
          seit: b.verdichtung.seit,
          arten: [...b.verdichtung.arten],
        }
      : null,
    beschaedigt: b.beschaedigt === true,
    code: b.code || null,
  };
}

// 4T-001825 (Bauplan B2): Eine Tabellen-Angabe der Schreib-Schnittstelle ist
// ein Pfad relativ zur Bereichs-Wurzel. Aufgelöst wird er gegen DIESE Wurzel,
// und erst der aufgelöste Pfad wird geprüft: Eine Angabe wie `../x.md` oder ein
// absoluter Pfad in einen fremden Ordner scheitert damit an der Bereichs-Grenze
// und nicht erst in der Schnittstelle. Zwei Stufen in der Reihenfolge des
// Vorbilds, Lage im Bereich vor Markdown-Endung.
function tabelleZulaessig(bereichsWurzel, tabelle, isMarkdownPath) {
  const absolut = path.resolve(bereichsWurzel, tabelle);
  if (!isInsideArea(bereichsWurzel, absolut)) return false;
  if (!isMarkdownPath(absolut)) return false;
  return true;
}

// 4T-001825: Eine Text-Angabe ist eine nicht leere Zeichenkette, wie beim
// Vorbild der Pfad und die Kennung.
function istText(wert) {
  return typeof wert === 'string' && wert !== '';
}

function istObjekt(wert) {
  return !!wert && typeof wert === 'object' && !Array.isArray(wert);
}

/**
 * Registriert die Katalog-Kanäle und die Kanäle der Schreib-Schnittstelle.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {Function} deps.areaRootForEvent Bereichs-Wurzel des sendenden Fensters.
 * @param {object} deps.backlinks Index-Fassade (Sicht, Bedarfs-Aufbau, Puffer-Text).
 * @param {Function} deps.isMarkdownPath Prüfer der Markdown-Endung aus main.js.
 * @param {{fuehreAuftragAus: Function, eroeffneNeuanlage: Function}} deps.schreibSchnittstelle
 *   **Pflicht** (4T-001825). Die eine Schreib-Schnittstelle des Prozesses aus
 *   der Verdrahtung (`app/wiring.js`).
 * @param {() => boolean} [deps.datenbankAktiv] Das Tor der Erweiterung «database»
 *   aus der Verdrahtung (4T-001938). Fehlt es, gilt die Erweiterung als aus.
 * @param {object} [deps.sperrVerwaltung] Die eine Sperr-Verwaltung des Prozesses
 *   aus der Verdrahtung (4T-001941). Fehlt sie, verweigert `database:sperre`.
 */
function registerDatabaseIpc(handle, deps) {
  const {
    areaRootForEvent,
    backlinks,
    isMarkdownPath,
    schreibSchnittstelle,
    datenbankAktiv,
    sperrVerwaltung,
  } = deps;
  // 4T-001825: Ein geprüfter Vertrag, der laut bricht (Entwicklungsrichtlinien,
  // Kapitel 3). Geprüft wird vor der ersten Registrierung, damit kein Kanal
  // halb registriert zurückbleibt; ein still fehlender Schreibweg zeigte sich
  // sonst erst beim ersten Speichern eines Anwenders.
  if (
    !schreibSchnittstelle ||
    typeof schreibSchnittstelle.fuehreAuftragAus !== 'function' ||
    typeof schreibSchnittstelle.eroeffneNeuanlage !== 'function'
  ) {
    throw new TypeError(
      'registerDatabaseIpc: schreibSchnittstelle ist Pflicht und muss fuehreAuftragAus und ' +
        'eroeffneNeuanlage tragen',
    );
  }
  // Ein prozessweiter Zwischenspeicher, wie ihn der Profil-Katalog führt: Der
  // Bestand ist derselbe für alle Fenster, und ein Speicher je Fenster läse
  // dieselbe Datei mehrfach.
  const cache = createDatabaseCatalogCache();

  // Gemeinsame Vorarbeit beider Kanäle: Index bei Bedarf aufbauen, Sicht holen.
  // Der Bedarfs-Aufbau steht hier und nicht im Katalog, weil er den Index
  // verändert und der Katalog eine reine Lese-Schicht bleibt.
  //
  // 4T-001758 (Epic 3E-000253): Ohne Datei, aber mit gebundenem Bereich ist der
  // Bereich die Wurzel. Die Einstellungs-Seite fragt nach der Bereichs-ART und
  // hat dabei kein Dokument zur Hand; ohne beides bleibt es bei `unavailable`,
  // und der Aufrufer bekommt eine Antwort statt eines Fehlers.
  function lage(event, filePath) {
    const areaRoot = areaRootForEvent(event);
    if (!filePath && !areaRoot) return { status: 'unavailable', meta: null, sicht: null };
    backlinks.ensureIndexForDemand(filePath, `${event.sender.id}:database`, areaRoot);
    return backlinks.datenbankSicht(filePath, areaRoot);
  }

  // 4T-001938: Das Tor der Erweiterung, bei jeder Anfrage frisch gefragt, weil
  // der Anwender die Erweiterung im laufenden Programm ausschalten darf. Wie in
  // der Schreib-Schnittstelle fällt es als einzige Naht ohne Wurf zurück, und
  // zwar auf «aus»: Ein fehlendes Tor verweigert, statt Datensätze zu zeigen.
  // 4T-002148: vor die beiden offenen Kanäle verlegt, die es seither ebenfalls fragen.
  const torOffen = () => typeof datenbankAktiv === 'function' && datenbankAktiv() === true;

  handle('database:overview', async (event, params) => {
    const { status, meta, sicht } = lage(event, params && params.filePath);
    // Ohne bereite Sicht wird der Status durchgereicht statt einer leeren
    // Datenbank: «noch nicht bereit» und «keine Tabellen» sind zwei Aussagen,
    // und wer sie verwechselt, zeigt einem Anwender beim Öffnen eine leere Liste.
    if (!sicht)
      return {
        status,
        meta,
        istDatenbankBereich: false,
        steckbrief: null,
        tabellen: [],
        masken: [],
        // 4T-002081: die Abfrage-Dateien, leer wie die übrigen Listen.
        abfragen: [],
        hints: [],
      };
    // 4T-002148 (S11): Der Kanal bleibt bei geschlossenem Tor offen, weil die
    // Einstellungs-Seite ihn nach der Bereichs-Art fragt; die Antwort trägt dann
    // aber keine Berechtigungen. Die Herkunft ohne Benutzer liest den
    // Anmeldenamen gar nicht erst, und `ohneRollen` nimmt das Übrige heraus.
    const offen = torOffen();
    const ueberblick = await katalogUeberblick({
      sicht,
      status,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
      ...(offen ? {} : { herkunft: () => ({}) }),
    });
    if (!offen) ohneRollen(ueberblick);
    // 4T-002254: der Hinweis «fremde Maske» je Abfrage-Datei, wie ihn die Liste kennt.
    await fremdeMaskenDerAbfragen({
      abfragen: ueberblick.abfragen,
      wurzel: areaRootForEvent(event),
      sicht,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
    });
    return { ...ueberblick, meta };
  });

  handle('database:table', async (event, params) => {
    const { status, meta, sicht } = lage(event, params && params.filePath);
    if (!sicht) return { status, meta, gefunden: false, hints: [] };
    const definition = await tabellenDefinition({
      sicht,
      status,
      tabelle: params && params.tabelle,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
    });
    // 4T-002311 (E12.4): Rolle und Erlaubnis-Menge der Tabelle, aus derselben
    // Auflösung wie die übrigen Lese-Kanäle; der Datensatz-Block fragt danach,
    // ob er «Neuer Datensatz» anbietet.
    // 4T-002148 (S11): bei geschlossenem Tor keine Auflösung.
    const berechtigung =
      definition.gefunden && torOffen()
        ? await rolleUndRechteDerTabelle({
            sicht,
            fsp,
            cache,
            bufferTextFor: backlinks.bufferTextFor,
            tabellenPfad: definition.path,
          })
        : {};
    return { ...definition, ...berechtigung, meta };
  });

  // 4T-001792 (Epic 3E-000255, E10.14, Bauplan S1): Die Änderungsbelege eines
  // Datensatzes für die lesende Beleg-Ansicht.
  //
  // **Geprüft wird in dieser Reihenfolge und vor jedem Dateizugriff:** Form der
  // beiden Parameter, gebundener Bereich des Fensters, Lage der Datei innerhalb
  // dieses Bereichs, Markdown-Endung. Jede nicht bestandene Stufe endet als
  // `unavailable`, ohne dass das Dateisystem berührt wird; ein Fenster ohne
  // gebundenen Bereich kann damit auch über einen geratenen Pfad nicht in
  // fremde Ordner sehen. Die Endung gehört dazu, weil der Pfad der Beleg-Datei
  // aus dem übergebenen gebildet wird: Ohne sie ließe sich die Bildung auf
  // beliebige Nachbar-Dateien richten.
  handle('database:changeLog', async (event, params) => {
    const p = params && typeof params === 'object' ? params : {};
    const filePath = typeof p.filePath === 'string' ? p.filePath : '';
    const recordId = typeof p.recordId === 'string' ? p.recordId : '';
    if (filePath === '' || recordId === '') return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!isInsideArea(bereichsWurzel, filePath)) return ohneZugriff();
    if (!isMarkdownPath(filePath)) return ohneZugriff();

    const gelesen = await belegeDesDatensatzes(filePath, recordId);
    // Eine fehlende Beleg-Datei meldet der Lese-Weg als Erfolg mit leerer
    // Liste; sie heißt «noch keine Änderung» und nicht «Fehler». Ein echter
    // Lesefehler dagegen wird als solcher gemeldet, statt als leere
    // Geschichte: Beides als leere Liste zu zeigen, hieße dem Anwender sagen,
    // an diesem Datensatz sei nie etwas geschehen.
    if (!gelesen.ok) return { status: 'error', belege: [], befunde: [], verkettung: null };
    return {
      status: 'ready',
      belege: gelesen.belege.map(alsAnzeige),
      // Die Befunde des Lesens gelten der ganzen DATEI, ihre Positionen also
      // einer Liste, die die Seite nicht hat. Die Position wird deshalb
      // weggelassen statt mitgereicht: Eine Zahl, die auf eine andere Liste
      // zeigt, ist schlechter als keine.
      befunde: (gelesen.befunde || []).map((befund) => ({ code: befund.code })),
      verkettung: gelesen.verkettung,
    };
  });

  // 4T-001825 (Epic 3E-000254, Bauplan B1, B2, B3): Ein Auftrag der
  // Schreib-Schnittstelle, Parameter `{ auftrag }` mit
  // `auftrag = { anweisungen: [...] }`.
  //
  // **Geprüft wird in der Reihenfolge des Vorbilds und vor jedem
  // Dateizugriff:** Form des Auftrags samt jeder Anweisung, gebundener Bereich
  // des Fensters, Lage JEDER genannten Tabelle innerhalb des Bereichs,
  // Markdown-Endung. Jede nicht bestandene Stufe endet ohne Aufruf der
  // Schnittstelle. Die Schnittstelle prüft danach erneut, und das ist gewollt:
  // Der Kanal ist die Grenze zum Anzeige-Prozess und weist fail-closed ab, die
  // Schnittstelle ist die Grenze zum Dateisystem und weist fachlich ab, mit
  // Lage-Code und Parametern je Anweisung.
  //
  // **Das Ergebnis geht unverändert zurück** (B3), gelungen wie abgewiesen: Es
  // ist sprachneutral, und den Satz dazu bildet der Bedienort über die
  // Schlüssel `database.auftrag.<Code>`.
  handle('database:auftrag', async (event, params) => {
    const auftrag = istObjekt(params) ? params.auftrag : null;
    if (!istObjekt(auftrag)) return ohneZugriff();
    const anweisungen = auftrag.anweisungen;
    if (!Array.isArray(anweisungen) || anweisungen.length === 0) return ohneZugriff();
    if (!anweisungen.every((a) => istObjekt(a) && istText(a.tabelle))) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    for (const anweisung of anweisungen) {
      if (!tabelleZulaessig(bereichsWurzel, anweisung.tabelle, isMarkdownPath)) {
        return ohneZugriff();
      }
    }
    // 4T-001928 (Epic 3E-000256): Die Regeln der Schreib-Schnittstelle fragen die
    // Tabellen-Sicht des Index nach Bereichs-Wurzel. Wie `lage()` stößt der Kanal
    // den Index an, bevor er die Schnittstelle ruft; ohne den Anstoß bliebe ein
    // noch nicht aufgebauter Index es, und jeder Auftrag mit Verweisen würde
    // fail-closed abgewiesen, ohne dass etwas ihn aufbaute.
    backlinks.ensureIndexForDemand(null, `${event.sender.id}:database`, bereichsWurzel);
    return schreibSchnittstelle.fuehreAuftragAus(bereichsWurzel, auftrag);
  });

  // 4T-001825 (Bauplan B1, B2, B3): Das Eröffnen einer Neuanlage, Parameter
  // `{ tabelle }`. Dieselben vier Stufen für die eine Tabelle; das Ergebnis
  // (Kennung und Hochwasserstand, oder die Abweisung mit `lagen`) geht
  // unverändert zurück.
  handle('database:neuanlage', async (event, params) => {
    const tabelle = istObjekt(params) ? params.tabelle : null;
    if (!istText(tabelle)) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!tabelleZulaessig(bereichsWurzel, tabelle, isMarkdownPath)) return ohneZugriff();
    return schreibSchnittstelle.eroeffneNeuanlage(bereichsWurzel, tabelle);
  });

  // 4T-001938: Die Rückfall-Sprache der Datenbank aus ihrem Steckbrief, über den
  // Katalog wie auf der Übersichts-Seite; ohne bereite Sicht gibt es keine.
  async function rueckfallSpracheFuer(event) {
    const { status, sicht } = lage(event, null);
    if (!sicht) return null;
    const ueberblick = await katalogUeberblick({
      sicht,
      status,
      fsp,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
    });
    return wirksameRueckfallSprache(ueberblick.steckbrief);
  }

  // 4T-001938 (Bauplan B3, B4): Ein Datensatz für die Einzel-Maske, Parameter
  // `{ tabelle, kennung, sprache }`; `kennung: null` heißt Neuanlage und muss
  // ausdrücklich dastehen, damit eine vergessene Kennung nicht still zur leeren
  // Maske wird. Dieselben vier Stufen wie `database:neuanlage`, davor das Tor;
  // jede nicht bestandene Stufe endet ohne Dateizugriff.
  //
  // 4T-002184 (Epic 3E-000261, AK4): Optional `maske`, der Name (ohne Endung,
  // wie ein Wiki-Link-Ziel) oder Pfad einer bestimmten Masken-Datei derselben
  // Tabelle; ohne sie zeigt die Antwort die Standard-Maske, und bestehende
  // Aufrufer bleiben unverändert. Eine Angabe in falscher Form endet wie die
  // übrigen ohne Zugriff; eine, die keine Masken-Datei dieser Tabelle nennt,
  // weist `datensatz-auskunft.js` mit eigenem Code ab. Die Lage-Prüfung des
  // Pfads braucht sie nicht, weil sie allein gegen die Masken-Dateien
  // aufgelöst wird, die der Katalog dieser Tabelle zuordnet.
  handle('database:datensatz', async (event, params) => {
    if (!istObjekt(params) || !istText(params.tabelle)) return ohneZugriff();
    const { tabelle, kennung } = params;
    if (kennung !== null && !istText(kennung)) return ohneZugriff();
    const maske = params.maske === undefined || params.maske === null ? null : params.maske;
    if (maske !== null && !istText(maske)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!tabelleZulaessig(bereichsWurzel, tabelle, isMarkdownPath)) return ohneZugriff();
    // 4T-001943 (B3): Die Sicht sagt, ob eine Masken-Datei gilt; ohne bereite
    // Sicht ist der Körper der erzeugte.
    const { sicht } = lage(event, null);
    return liesDatensatz({
      fsp,
      wurzel: bereichsWurzel,
      tabelle,
      kennung,
      sprache: istText(params.sprache) ? params.sprache : null,
      rueckfallSprache: await rueckfallSpracheFuer(event),
      sicht,
      cache,
      maske,
    });
  });

  // 4T-002252 (S1, S8): Die Pfad-Ausdrücke einer Einzel-Maske, Parameter
  // `{ tabelle, kennung, entwurf, ausdruecke, sprache }`; `kennung: null` heißt
  // Neuanlage. Dieselben Stufen wie `database:datensatz`: Form, Tor, Bereich,
  // Lage und Endung; jede nicht bestandene Stufe endet ohne Dateizugriff. Die
  // Lage-Abfrage stößt den Index des Bereichs an, aus dem gelesen wird.
  handle('database:ausdruecke', async (event, params) => {
    if (!ausdrueckeInForm(params)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!tabelleZulaessig(bereichsWurzel, params.tabelle, isMarkdownPath)) return ohneZugriff();
    lage(event, null);
    return werteAusdrueckeAus({
      root: bereichsWurzel,
      tabelle: params.tabelle,
      kennung: params.kennung,
      entwurf: params.entwurf,
      ausdruecke: params.ausdruecke,
    });
  });

  // 4T-001943 (Bauplan B1): Die erzeugte Maske einer Tabelle als Datei neben
  // die Tabelle schreiben, Parameter `{ tabelle, sprache }`. Dieselben Stufen
  // wie `database:datensatz`: Form, Tor, Bereich, Lage, Endung; jede nicht
  // bestandene Stufe endet ohne Dateizugriff. Eine vorhandene Datei wird nicht
  // überschrieben, sondern als `formDateiVorhanden` gemeldet.
  handle('database:maskeSchreiben', async (event, params) => {
    if (!istObjekt(params) || !istText(params.tabelle)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!tabelleZulaessig(bereichsWurzel, params.tabelle, isMarkdownPath)) return ohneZugriff();
    return schreibeMaskenDatei({
      fsp,
      wurzel: bereichsWurzel,
      tabelle: params.tabelle,
      sprache: istText(params.sprache) ? params.sprache : null,
      rueckfallSprache: await rueckfallSpracheFuer(event),
    });
  });

  // 4T-001941 (Bauplan B1): Die Sperre eines Datensatzes, Parameter
  // `{ aktion, tabelle, kennung, stand }`. Dieselben Stufen wie
  // `database:datensatz`: Form, Tor, Bereich, Lage, Endung; jede nicht
  // bestandene Stufe endet ohne Zugriff auf den Sperr-Ordner. Das Ergebnis ist
  // sprachneutral und geht unverändert zurück.
  handle('database:sperre', async (event, params) => {
    if (!istObjekt(params) || !Object.values(SPERR_AKTIONEN).includes(params.aktion)) {
      return ohneZugriff();
    }
    if (!istText(params.tabelle) || !istText(params.kennung)) return ohneZugriff();
    if (params.stand !== undefined && params.stand !== null && !istText(params.stand)) {
      return ohneZugriff();
    }
    if (!torOffen() || !sperrVerwaltung) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    if (!tabelleZulaessig(bereichsWurzel, params.tabelle, isMarkdownPath)) return ohneZugriff();
    return bediene({
      sperrVerwaltung,
      erweiterungAktiv: torOffen,
      wurzel: bereichsWurzel,
      aktion: params.aktion,
      tabelle: params.tabelle,
      kennung: params.kennung,
      stand: params.stand || undefined,
    });
  });

  // 4T-001942 (Bauplan B1): Die Datensätze einer Tabelle für die Wertehilfe,
  // Parameter `{ tabelle }` als Name oder Pfad. Form, Tor und Bereich wie
  // `database:datensatz`; danach die Sicht mit Index-Anstoß wie in `lage()`, weil
  // der Name nur über die Tabellen des Index aufzulösen ist. Die Lage im Bereich
  // und die Endung werden am AUFGELÖSTEN Pfad geprüft; ein unbekannter Name geht
  // als Fehlerlage des Moduls zurück, damit die Maske ihn benennen kann.
  handle('database:datensaetze', async (event, params) => {
    if (!istObjekt(params) || !istText(params.tabelle)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    const { sicht } = lage(event, null);
    if (!sicht) return ohneZugriff();
    const tabelle = params.tabelle;
    const ziel = findeZielTabelle({ wurzel: bereichsWurzel, sicht, tabelle });
    if (ziel !== null && !tabelleZulaessig(bereichsWurzel, ziel, isMarkdownPath)) {
      return ohneZugriff();
    }
    return liesDatensatzListe({ fsp, wurzel: bereichsWurzel, sicht, tabelle });
  });

  // 4T-002333 (T3): Das Ziel eines Datensatz-Verweises, Parameter
  // `{ zielPfad, anker }` mit dem absoluten Pfad, auf den der Klick den Verweis
  // aufgelöst hat, und dem Anker ohne `^`. Antwort `{ tabelle, kennung }` oder
  // `null`; `null` heißt für den Klick «bisheriger Weg» und steht deshalb für
  // jede Lage ohne eindeutigen Datensatz: Form, Tor, Bereich, Index nicht
  // bereit, keine Tabelle, Block-Anker gleichen Namens, mehrdeutiger Name.
  // Die Bereichs-Wurzel kommt wie bei den Nachbarn aus dem sendenden Fenster.
  // Gerechnet wird am Platten-Stand (`ohnePuffer`), wie die Gültigkeit.
  handle('database:verweisZiel', async (event, params) => {
    if (!istObjekt(params) || !istText(params.zielPfad) || !istText(params.anker)) return null;
    if (!torOffen()) return null;
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel || !tabelleZulaessig(bereichsWurzel, params.zielPfad, isMarkdownPath)) {
      return null;
    }
    const zielPfad = path.resolve(bereichsWurzel, params.zielPfad);
    backlinks.ensureIndexForDemand(zielPfad, `${event.sender.id}:database`, bereichsWurzel);
    const { sicht } = backlinks.datenbankSicht(zielPfad, bereichsWurzel, { ohnePuffer: true });
    if (!sicht) return null;
    return verweisZiel(sicht, zielPfad, params.anker);
  });

  // 4T-001944 (Bauplan B3): Die Konsistenz-Prüfung, Parameter `{ tabelle }` als
  // Name oder Pfad EINER Tabelle oder `null` für alle; `tabelle` muss ausdrücklich
  // dastehen. Form, Tor und Bereich wie `database:datensaetze`, danach die Sicht
  // mit Index-Anstoß; eine genannte Tabelle wird am AUFGELÖSTEN Pfad gegen Lage
  // und Endung geprüft. Die Kopf-Dateien aller Tabellen stammen aus der Sicht des
  // Bereichs und liegen damit in ihm.
  handle('database:konsistenz', async (event, params) => {
    if (!istObjekt(params)) return ohneZugriff();
    const tabelle = params.tabelle;
    if (tabelle !== null && !istText(tabelle)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    const { sicht } = lage(event, null);
    if (!sicht) return ohneZugriff();
    if (tabelle !== null) {
      const ziel = findeZielTabelle({ wurzel: bereichsWurzel, sicht, tabelle });
      if (ziel !== null && !tabelleZulaessig(bereichsWurzel, ziel, isMarkdownPath)) {
        return ohneZugriff();
      }
    }
    return pruefeKonsistenz({ fsp, wurzel: bereichsWurzel, sicht, tabelle });
  });

  // 4T-001945 (Bauplan B2): Der Verwendungsnachweis, Parameter `{ tabelle, kennung }`
  // mit `tabelle` als Name oder Pfad und `kennung` als interne Kennung für die
  // Datensatz-Ebene oder `null` für die Tabellen-Ebene; `kennung` muss ausdrücklich
  // dastehen, damit eine vergessene Kennung nicht still zur anderen Auskunft wird.
  // Form, Tor und Bereich wie `database:konsistenz`, danach die Sicht mit
  // Index-Anstoß; die Tabelle wird am AUFGELÖSTEN Pfad gegen Lage und Endung
  // geprüft. Gelesen wird nur auf Anforderung, geschrieben nie.
  handle('database:verwendung', async (event, params) => {
    if (!istObjekt(params) || !istText(params.tabelle)) return ohneZugriff();
    const { tabelle, kennung } = params;
    if (kennung !== null && !istText(kennung)) return ohneZugriff();
    if (!torOffen()) return ohneZugriff();
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return ohneZugriff();
    const { sicht } = lage(event, null);
    if (!sicht) return ohneZugriff();
    const ziel = findeZielTabelle({ wurzel: bereichsWurzel, sicht, tabelle });
    if (ziel !== null && !tabelleZulaessig(bereichsWurzel, ziel, isMarkdownPath)) {
      return ohneZugriff();
    }
    const auftrag = { fsp, wurzel: bereichsWurzel, sicht, tabelle };
    if (kennung === null) return verwendungDerTabelle(auftrag);
    return verwendungDesDatensatzes({ ...auftrag, kennung });
  });

  // 4T-002249 (S1, S2): Die Auskunft über eine Listen-Maske, Parameter
  // `{ pfad, query, spalten, tabelle }`: `pfad` die Abfrage-Datei (absolut),
  // `query` der Text ihrer Abfrage, `spalten` die Quelltexte der Spalten der
  // Ergebnismenge, `tabelle` die Kopf-Datei aus der Herkunft der Zeilen oder
  // `null`. Form, Tor und Bereich wie `database:datensaetze`; die Abfrage-Datei
  // und eine genannte Tabelle werden gegen Lage und Endung geprüft, bevor eine
  // Datei gelesen wird. Jede nicht bestandene Stufe ergibt dieselbe Antwort wie
  // eine Datei ohne Listen-Maske, `{ istListe: false }`: Für die Anzeige heißt
  // beides «Ergebnis-Tabelle wie bisher», und eine zweite Gestalt brauchte
  // niemand.
  handle('database:liste', async (event, params) => {
    const keineListe = { istListe: false };
    if (!istObjekt(params) || !istText(params.pfad) || typeof params.query !== 'string') {
      return keineListe;
    }
    const { pfad, query, spalten } = params;
    const tabelle = params.tabelle === undefined ? null : params.tabelle;
    if (!Array.isArray(spalten) || !spalten.every((s) => typeof s === 'string')) return keineListe;
    if (tabelle !== null && !istText(tabelle)) return keineListe;
    // 4T-002250 (S3): die Kennungen der gelieferten Zeilen für `nichtAenderbar`.
    const kennungen = params.kennungen === undefined ? [] : params.kennungen;
    if (!Array.isArray(kennungen) || !kennungen.every(istText)) return keineListe;
    if (!torOffen()) return keineListe;
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return keineListe;
    if (!tabelleZulaessig(bereichsWurzel, pfad, isMarkdownPath)) return keineListe;
    if (tabelle !== null && !tabelleZulaessig(bereichsWurzel, tabelle, isMarkdownPath)) {
      return keineListe;
    }
    const { sicht } = lage(event, null);
    if (!sicht) return keineListe;
    return liesListe({
      fsp,
      wurzel: bereichsWurzel,
      sicht,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
      pfad,
      query,
      spalten,
      tabelle,
      kennungen,
    });
  });

  // 4T-002253 (F5 A, S6): Die Auskunft über einen Positions-Bereich, Parameter
  // `{ datei, by, kopf: { tabelle, kennung } }`: `datei` die Angabe des
  // Platzhalters `{{list:…}}`, `by` das Verweis-Feld hinter `BY` oder `null`,
  // `kopf` Kopf-Datei und Kennung des gezeigten Datensatzes. Form, Tor und
  // Bereich wie `database:liste`; die Kopf-Tabelle wird gegen Lage und Endung
  // geprüft, bevor eine Datei gelesen wird. Jede nicht bestandene Stufe ergibt
  // `{ istListe: false }`.
  handle('database:positionsliste', async (event, params) => {
    const keineListe = { istListe: false };
    if (!istObjekt(params) || !istText(params.datei) || !istObjekt(params.kopf)) return keineListe;
    const { datei, kopf } = params;
    const by = params.by === undefined ? null : params.by;
    if (by !== null && !istText(by)) return keineListe;
    if (!istText(kopf.tabelle) || !istText(kopf.kennung)) return keineListe;
    if (!torOffen()) return keineListe;
    const bereichsWurzel = areaRootForEvent(event);
    if (!bereichsWurzel) return keineListe;
    if (!tabelleZulaessig(bereichsWurzel, kopf.tabelle, isMarkdownPath)) return keineListe;
    const { sicht } = lage(event, null);
    if (!sicht) return keineListe;
    return liesPositionsListe({
      fsp,
      wurzel: bereichsWurzel,
      sicht,
      cache,
      bufferTextFor: backlinks.bufferTextFor,
      datei,
      by,
      kopf: { tabelle: kopf.tabelle, kennung: kopf.kennung },
    });
  });
}

module.exports = { registerDatabaseIpc };
