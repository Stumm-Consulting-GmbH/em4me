// 4T-002253 (Epic 3E-000262, F5 A, S6, S7; Vorab-Festlegungen 1 bis 4): Der
// Positions-Bereich einer Einzel-Maske — die eingebettete Listen-Maske zu einem
// Platzhalter `{{list:<Abfrage-Datei>}}`, gefiltert entlang der Beziehung zum
// gezeigten Kopf.
//
// **Kein neuer Baustein.** Welche Abfrage-Datei gemeint ist, über welches
// Verweis-Feld die Positionen am Kopf hängen und welche Abfrage genau seine
// Positionen liefert, sagt der Haupt-Prozess (`database:positionsliste`). Die
// Zeilen holt der Bereich wie jede Abfrage-Datei über den Abfrage-Kanal mit der
// Abfrage-Datei als Basis, die Angaben der Liste über `database:liste` wie die
// Befüllung (`mitListe` in `frontmatter-query-view.js`), und gezeichnet wird
// mit dem Listen-Modul (`zeichneListe`).
//
// **Im Lesen der Maske ist der Bereich lesend**: kein Handgriff, und ein Klick
// auf eine Zeile öffnet die Maske der Position. **Im Bearbeiten** bekommt die
// Liste die Zeilen-Bearbeitung im sammelnden Modus (`listen-zeile.js`,
// `listen-sammeln.js`): Das Speichern einer Zeile legt ihre Anweisung in
// `seite.positionen` ab, statt zu schreiben; eine spätere Anweisung derselben
// Kennung ersetzt die frühere, und eine neue Position bekommt den Verweis auf
// den Kopf ohne Eingabe. Geschrieben wird mit dem Speichern der Maske, Kopf
// zuerst, in einem Auftrag (S7, `masken-speichern.js`).
//
// **Der Bereich überdauert das Neuzeichnen der Maske im Bearbeiten.** Die Seite
// zeichnet bei jedem Zustandswechsel neu (Senden, Befunde, Konflikt); ein neu
// geladener Bereich verlöre die vorgemerkten Zeilen samt ihren Sperren. Im
// Bearbeiten hängt deshalb derselbe Inhalt wieder in den neuen Container, bis
// `gebeSperrenFrei` die Runde beendet (Speichern, Verwerfen, Umbinden,
// Schließen). Im Lesen wird jedes Mal frisch geladen.
//
// Ohne Import des Fenster-Zustands: Kanäle, Übersetzung, Sprache und
// Statuszeile kommen als Nähte herein (Muster `masken-pfade.js`); allein
// `positionsBereichAusApi` bündelt sie für die Seite.
'use strict';

import { hinweisSatz } from '../../../shared/database/table-hinweise.js';
import { openRecordHit, recordHitOf } from '../query/record-hit-click.js';
import { MODUS_BEARBEITEN } from './masken-felder.js';
import { ART_ANLEGEN } from './masken-speichern.js';
import { sperreBlaettern, zeichneListe } from './listen-maske.js';
import { erzeugeZeilenBearbeitung } from './listen-zeile.js';

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Die Ergebnismenge einer Antwort, wie `resultSetOf` der Befüllung.
function mengeDer(antwort) {
  const rs = antwort && antwort.resultSet;
  if (!rs || typeof rs !== 'object' || !rs.state || typeof rs.state !== 'object') return null;
  return Array.isArray(rs.rows) && Array.isArray(rs.columns) ? rs : null;
}

// Die Kopf-Datei aller Zeilen, wenn sie aus derselben stammen (wie `mitListe`).
function gemeinsameKopfDatei(rows) {
  const pfade = new Set(rows.map((row) => row && row.origin && row.origin.path));
  const [pfad] = pfade;
  return pfade.size === 1 && typeof pfad === 'string' && pfad ? pfad : null;
}

function kennungenDer(rows) {
  const ids = rows.map((row) => row && row.origin && row.origin.id);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))];
}

/**
 * Erzeugt den Positions-Bereich einer Maske.
 *
 * @param {object} n Nähte.
 * @param {(params: object) => Promise<object>} n.positionsliste Kanal
 *   `database:positionsliste`.
 * @param {(pfad: string, query: string) => Promise<object>} n.abfrage Der
 *   Abfrage-Kanal (`runFrontmatterQuery` mit der Sprache der Oberfläche).
 * @param {(params: object) => Promise<object>} n.liste Kanal `database:liste`.
 * @param {Function} n.sperre Kanal `database:sperre`.
 * @param {Function} n.datensatz Kanal `database:datensatz`.
 * @param {Function} n.datensaetze Kanal `database:datensaetze`.
 * @param {Function} n.neuanlage Kanal `database:neuanlage`.
 * @param {Function} n.t Übersetzung.
 * @param {Function} [n.hat] Gibt es einen Schlüssel?
 * @param {() => string|null} [n.sprache] Aktive Sprache.
 * @param {(iso: string) => string} n.zeitpunkt Zeit-Formatierung der Oberfläche.
 * @param {(key: string) => void} n.hinweis Hinweis in der Statuszeile.
 * @returns {{zeichneBereich: Function, uebernimmOffene: Function, gebeSperrenFrei: Function}}
 */
export function erzeugePositionsBereich(n) {
  // Die Inhalte der Bereiche im Bearbeiten, je Gegenstand und Segment-Zeile,
  // und die Zeilen-Bearbeitungen mit ihren Sperren. Die Runde zählt hoch, wenn
  // sie endet, damit eine späte Antwort keinen alten Bereich mehr füllt.
  const inhalte = new Map();
  const bearbeitungen = new Set();
  let runde = 0;

  // Eine Position ins Gesammelte der Seite; eine spätere Anweisung derselben
  // Kennung ersetzt die frühere, beim Anlegen steht der Verweis auf den Kopf.
  function sammle(seite, feld, params) {
    const auftrag = params && params.auftrag;
    const erste = auftrag && Array.isArray(auftrag.anweisungen) ? auftrag.anweisungen[0] : null;
    if (!erste) return { ok: false };
    const anweisung = { ...erste };
    if (anweisung.art === ART_ANLEGEN)
      anweisung.werte = { ...(anweisung.werte || {}), [feld]: seite.kennung };
    if (!Array.isArray(seite.positionen)) seite.positionen = [];
    const gleich = (a) => a.tabelle === anweisung.tabelle && a.id === anweisung.id;
    const stelle = seite.positionen.findIndex(gleich);
    if (stelle >= 0) seite.positionen[stelle] = anweisung;
    else seite.positionen.push(anweisung);
    return { ok: true };
  }

  function zeilenBearbeitung(seite, feld, inhalt) {
    const zeile = erzeugeZeilenBearbeitung({
      sperre: n.sperre,
      datensatz: n.datensatz,
      auftrag: async (params) => sammle(seite, feld, params),
      datensaetze: n.datensaetze,
      neuanlage: n.neuanlage,
      t: n.t,
      hat: n.hat,
      sprache: n.sprache,
      zeitpunkt: n.zeitpunkt,
      hinweis: n.hinweis,
      beiGeschrieben: () => {},
      blaetternSperren: (aktiv) => sperreBlaettern(inhalt.querySelector('.db-list'), aktiv),
      sammelnd: true,
      // Nachtrag: eine auf den gelesenen Stand zurückgesetzte Zeile trägt ihre
      // Vormerkung aus.
      zuruecknehmen: ({ tabelle, id }) => {
        const bleibt = (a) => !(a.tabelle === tabelle && a.id === id);
        seite.positionen = (seite.positionen || []).filter(bleibt);
      },
    });
    bearbeitungen.add(zeile);
    return zeile;
  }

  function hinweisKnoten(code, segment) {
    const knoten = el(
      'p',
      'db-form-hint db-form-positions-hint',
      hinweisSatz({ code, name: segment.datei, zeile: segment.zeile }, n.t),
    );
    knoten.dataset.formCode = code;
    return knoten;
  }

  async function frage(kanal, ...args) {
    try {
      return await kanal(...args);
    } catch {
      return null;
    }
  }

  // Auskunft, Zeilen und Angaben der Liste, danach das Gitter.
  async function lade(inhalt, segment, seite, bearbeiten) {
    const meine = runde;
    const gilt = () => meine === runde;
    const auskunft = await frage(n.positionsliste, {
      datei: segment.datei,
      by: segment.by || null,
      kopf: { tabelle: seite.tabellenPfad, kennung: seite.kennung },
    });
    if (!gilt() || !auskunft || typeof auskunft !== 'object') return;
    if (auskunft.hinweis) inhalt.appendChild(hinweisKnoten(auskunft.hinweis, segment));
    if (typeof auskunft.pfad !== 'string' || typeof auskunft.query !== 'string') return;
    const rs = mengeDer(await frage(n.abfrage, auskunft.pfad, auskunft.query));
    if (!gilt() || !rs) return;
    const fertig = rs.scope === 'records' && rs.state.status === 'ready' && !rs.state.queryError;
    let liste = null;
    if (fertig && auskunft.istListe === true) {
      liste = await frage(n.liste, {
        pfad: auskunft.pfad,
        query: auskunft.query,
        spalten: rs.columns.map((c) => c.source),
        tabelle: gemeinsameKopfDatei(rs.rows),
        kennungen: kennungenDer(rs.rows),
      });
      if (!gilt()) return;
    }
    const istListe = !!liste && liste.istListe === true;
    const lesend = { istListe: false, angaben: { allow: [] }, spalten: [], nichtAenderbar: [] };
    const zeile =
      bearbeiten && istListe ? zeilenBearbeitung(seite, auskunft.beziehung.feld, inhalt) : null;
    inhalt.appendChild(zeichneListe(rs, istListe ? liste : lesend, n.t, 0, zeile));
  }

  /**
   * Zeichnet den Bereich eines Segments `liste` in seinen Container.
   *
   * @param {HTMLElement} container Das Element `div.db-form-positions`.
   * @param {{datei: string, by: string|null, zeile: number}} segment
   * @param {{seite: object, modus: string}} lage Zustand der Seite und Modus.
   */
  function zeichneBereich(container, segment, { seite, modus }) {
    const bearbeiten = modus === MODUS_BEARBEITEN;
    const schluessel = `${seite.tabellenPfad}\n${seite.kennung}\n${segment.zeile}`;
    if (!bearbeiten) inhalte.clear();
    const vorhanden = bearbeiten ? inhalte.get(schluessel) : null;
    if (vorhanden) {
      container.appendChild(vorhanden);
      return;
    }
    const inhalt = el('div', 'db-form-positions-inhalt');
    // Im Lesen öffnet der Klick auf eine Zeile die Maske der Position.
    inhalt.addEventListener('click', (event) => {
      const treffer = bearbeiten ? null : recordHitOf(event.target);
      if (!treffer) return;
      event.preventDefault();
      event.stopPropagation();
      openRecordHit(treffer);
    });
    if (bearbeiten) inhalte.set(schluessel, inhalt);
    container.appendChild(inhalt);
    void lade(inhalt, segment, seite, bearbeiten);
  }

  return {
    zeichneBereich,
    /**
     * Vor dem Speichern der Maske (Nachtrag, Sitzungs-Entscheidung): Jede offen
     * bearbeitete Zeile wird vorgemerkt wie mit ihrem «Speichern».
     *
     * @returns {Promise<boolean>} false, wenn eine dabei abgewiesen bleibt.
     */
    async uebernimmOffene() {
      let gelungen = true;
      for (const zeile of bearbeitungen) if (!(await zeile.speichereOffene())) gelungen = false;
      return gelungen;
    },
    /**
     * Beendet die Runde: alle Sperren der Bereiche frei, Inhalte verworfen;
     * der nächste Aufruf von `zeichneBereich` lädt frisch.
     */
    gebeSperrenFrei() {
      for (const zeile of bearbeitungen) zeile.gebeSperrenFrei();
      bearbeitungen.clear();
      inhalte.clear();
      runde += 1;
    },
  };
}

/**
 * Der Positions-Bereich mit den Kanälen der Anwendung, für die Seite.
 *
 * @param {{api: object, t: Function, hat: Function, state: object,
 *   locale: () => string, zeitpunkt: Function, hinweis: Function}} u
 * @returns {ReturnType<typeof erzeugePositionsBereich>}
 */
export function positionsBereichAusApi({ api, t, hat, state, locale, zeitpunkt, hinweis }) {
  return erzeugePositionsBereich({
    positionsliste: (p) => api.databasePositionsliste(p),
    abfrage: (pfad, query) => api.runFrontmatterQuery(pfad, query, locale()),
    liste: (p) => api.databaseListe(p),
    sperre: (p) => api.databaseSperre(p),
    datensatz: (p) => api.databaseDatensatz(p),
    datensaetze: (p) => api.databaseDatensaetze(p),
    neuanlage: (p) => api.databaseNeuanlage(p),
    t,
    hat,
    sprache: () => state.language || null,
    zeitpunkt,
    hinweis,
  });
}
