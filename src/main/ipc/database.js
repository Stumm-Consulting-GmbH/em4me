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

// 4T-001792: Die Antwort, wenn eine der Vorbedingungen nicht erfüllt ist. Sie
// ist als Funktion und nicht als geteilte Konstante geschrieben, damit kein
// Aufrufer die Listen einer fremden Antwort in der Hand hält.
function ohneZugriff() {
  return { status: 'unavailable', belege: [], befunde: [], verkettung: null };
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
        hints: [],
      };
    const ueberblick = await katalogUeberblick({
      sicht,
      status,
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
    return { ...definition, meta };
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

  // 4T-001938: Das Tor der Erweiterung, bei jeder Anfrage frisch gefragt, weil
  // der Anwender die Erweiterung im laufenden Programm ausschalten darf. Wie in
  // der Schreib-Schnittstelle fällt es als einzige Naht ohne Wurf zurück, und
  // zwar auf «aus»: Ein fehlendes Tor verweigert, statt Datensätze zu zeigen.
  const torOffen = () => typeof datenbankAktiv === 'function' && datenbankAktiv() === true;

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
  handle('database:datensatz', async (event, params) => {
    if (!istObjekt(params) || !istText(params.tabelle)) return ohneZugriff();
    const { tabelle, kennung } = params;
    if (kennung !== null && !istText(kennung)) return ohneZugriff();
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
}

module.exports = { registerDatabaseIpc };
