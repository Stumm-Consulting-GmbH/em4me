// 4T-002182 (Epic 3E-000261, Sitzungs-Entscheidung S1): Der Inhalt der
// Einzel-Maske unter ihrem Kopf — der Satz «nicht bearbeitbar», die Hinweise
// zum Masken-Körper, der Körper selbst und der Nachlauf, wenn die Seite im
// Dokument hängt.
//
// **Ausgezogen aus `masken-seite.js` ohne Verhaltensänderung** (Muster der
// früheren Auszüge `masken-speichern.js` und `masken-sperre.js`): Die Seite
// behält Zustand, Ablauf und Kopf und ruft hier das Zeichnen; Texte, Klassen,
// Ereignisse und die Reihenfolge der Schritte sind dieselben wie zuvor. Anlass
// ist das Größen-Budget der Seite, die neue Grammatik des Körpers (Wert und
// Bereich) wächst hier und nicht dort.
//
// **Das Zustands-Objekt der Seite kommt herein** (`seite`), dazu die
// Verweis-Hilfe für die Listen der Ziel-Tabellen und die Sprache des Anwenders.
// Den Fenster-Zustand importiert das Modul nicht; Kanal (`api.renderMarkdown`)
// und Schritt-Satz (`applyTeilbaumSchritte`) kommen über ihre eigenen Module,
// die der Prüffall `db-masken-koerper.test.js` ersetzt.
//
// **Der Wert-Platzhalter** (4T-002183, F3 A, S3, S4): Ein Wert-Segment wird
// eine nicht bearbeitbare Stelle `.db-form-computed`, kein Eingabe-Element.
// Ausgewertet wird über `form-wert.js` gegen den Stand des Datensatzes, im
// Bearbeiten gegen den Entwurf; jede Eingabe in ein Feld rechnet alle Stellen
// neu, und zwar nur die Stellen, nicht die Maske, damit Fokus und Eingabe-Stand
// bleiben. Dargestellt wird mit der Zell-Formatierung der Abfrage-Ausgabe
// (`cellSegments` aus dem Darstellungs-Kern, `appendSegments` der
// Tabellen-Ausgabe), damit ein Wert so aussieht wie in einer Tabellen-Abfrage.
// Ohne Wert bleibt die Stelle leer und trägt die Markierung samt Tooltip.
//
// **Der Wert im Satz** (4T-002186, Entscheidung des Product Owners vom
// 2026-10-10): Ein Wert-Segment mit `imSatz` steht innerhalb einer Textzeile.
// Es wird nicht als eigener Block gezeichnet, sondern als `span` im gerenderten
// Text seines Absatzes: Die Zerlegung liefert Text und Wert getrennt, und der
// Markdown-Weg kennt kein rohes HTML (`html: false`); deshalb bekommt der
// Markdown-Text an der Stelle des Wertes eine Marke aus Zeichen des privaten
// Unicode-Bereichs, die der Renderer als Text durchreicht, und nach dem Rendern
// wird die Marke im Text-Knoten durch die Stelle ersetzt. Eine Marke, die im
// gerenderten Text nicht mehr auffindbar ist (etwa in einem Link-Ziel), fällt
// an das Ende des Blocks, damit kein Wert verschwindet. Aufeinanderfolgende
// Text- und Satz-Wert-Segmente bilden dafür **einen** Block.
//
// **Bedingte Bereiche** (4T-002186, E7.8, F5 A): Ein Bereichs-Segment wird ein
// `div.db-form-section` mit seinen Kindern, nach derselben Zeichnung wie die
// oberste Ebene. Sichtbar ist es, wenn seine Bedingung über demselben Kontext
// wie die Werte wahr ist; sonst trägt es das Attribut `hidden`. Verborgen wird
// die Anzeige, nie der Inhalt: Felder und Werte darin bleiben im Dokument und
// behalten Eingabe und Wert, und jede Eingabe wertet die Bedingungen neu aus,
// ohne etwas neu zu erzeugen. Ein innerer Bereich hängt im äußeren und ist
// damit nur mit ihm sichtbar. Welche Felder gerade in einem verborgenen
// Bereich stehen, schreibt der Körper nach jeder Auswertung in
// `seite.verborgen`, damit das Speichern eine Abweisung an einem solchen Feld
// im Kopf zeigen kann (S6).
//
// **Die Navigation** (4T-002185, F4 A): Reicht die Seite in `umgebung` ihre
// Navigation (`masken-navigation.js`) herein, bekommt der Körper deren
// Klick-Hörer für Links, und jedes Verweis-Feld deren Klick-Weg zum verwiesenen
// Datensatz. Ohne Navigation bleibt der Körper, wie er war.
//
// **Verweis-Pfade** (4T-002252, F6 A, S8, Festlegung 4, 5): Wert- und
// Bereichs-Segmente mit `pfad: true` rechnet nicht der Körper, sondern der
// Haupt-Prozess. `rechne()` wertet die übrigen Stellen sofort lokal aus wie
// bisher und reicht alle Pfad-Stellen zusammen an die Naht `pfade`
// (`masken-pfade.js`), mit dem Stand als Entwurf; deren Antwort setzt die Werte
// über dieselbe Stelle (`fuelleWert`) und zeigt oder verbirgt die Bereiche. Ein
// leerer Wert ergibt die leere, markierte Stelle, eine nicht erfüllte Bedingung
// den verborgenen Bereich. Ein Ziel-Feld, das die Ziel-Tabelle nicht führt,
// kommt einmal je Pfad als Hinweis in den Kopf. Ohne Naht bleiben Pfad-Stellen
// leer und markiert, und Pfad-Bereiche verborgen.
//
// **Der Positions-Bereich** (4T-002253, F5 A, S6): Ein Segment `liste` wird ein
// Container `div.db-form-positions` mit `data-form-list`; den Inhalt zeichnet
// die Naht `positionen` (`masken-positionen.js`) mit der Zeile ab dem Anfang der
// Datei. Ohne Naht bleibt der Container leer.
//
// **Die Berechtigung** (4T-002311, E12.4, S4): Die Antwort des Datensatz-Kanals
// trägt die Erlaubnis-Menge der Tabelle (`rechte`) und die geltende Rolle
// (`rolle`). Bearbeitbar ist ein Datensatz, wenn seine Bedingung es erlaubt UND
// die Rolle ändern darf, bei einer Neuanlage anlegen; löschbar, wenn die
// Bedingung es erlaubt und die Rolle löschen darf. Verwehrt die Rolle das
// Ändern, nennt der Satz über dem Körper die Rolle statt des Grunds der
// Bedingung.
'use strict';

import { currentDictionary, t } from '../../i18n.js';
import { api } from '../app/api.js';
import { applyTeilbaumSchritte } from '../render-mermaid.js';
import { loeseBeschriftung } from '../../../shared/database/beschriftung.js';
import { hinweisSatz } from '../../../shared/database/table-hinweise.js';
import {
  baueWertKontext,
  texteDesStands,
  werteBedingungAus,
  werteWertAus,
  wertAlsAusdruck,
} from '../../../shared/database/form-wert.js';
import { FORM_HINWEISE } from '../../../shared/database/form-body.js';
import { cellSegments } from '../../../shared/query/result-display.js';
import { appendSegments } from '../query/display-list-table.js';
import { baueFeldElement } from './masken-felder.js';
import { markiereFeld } from './masken-speichern.js';

// Die Marke eines Wertes im Satz im Markdown-Text: Anfang, laufende Nummer,
// Ende. Zeichen des privaten Unicode-Bereichs, die in keinem Masken-Text
// vorkommen und die der Markdown-Renderer unverändert als Text durchreicht.
const MARKE_ANFANG = '';
const MARKE_ENDE = '';

function el(tag, className, text) {
  const knoten = document.createElement(tag);
  if (className) knoten.className = className;
  if (text !== undefined) knoten.textContent = text;
  return knoten;
}

// Wie in `masken-datei.js`: Gibt es den Schlüssel im geladenen Katalog?
function hatSchluessel(key) {
  const dict = currentDictionary();
  return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
}

/**
 * Darf der Datensatz bearbeitet werden? Nur eine ausdrücklich nicht erfüllte
 * Bearbeitbarkeits-Bedingung verneint, seit 4T-002311 ebenso die Rolle ohne
 * `update`, bei einer Neuanlage ohne `create`.
 *
 * @param {object|null} daten Der Stand der Seite.
 * @param {{neu?: boolean}} [optionen] `neu` für eine Neuanlage.
 * @returns {boolean}
 */
export function istBearbeitbar(daten, { neu = false } = {}) {
  return bedingungErlaubt(daten) && rolleErlaubt(daten, neu ? 'create' : 'update');
}

// Nur eine ausdrücklich nicht erfüllte Bearbeitbarkeits-Bedingung verneint.
function bedingungErlaubt(daten) {
  return !(daten && daten.editable && daten.editable.erfuellt === false);
}

/**
 * Darf die eigene Rolle die Operation an der Tabelle (4T-002311, E12.4)?
 * **Fehlt die Erlaubnis-Menge oder ist sie null** (Antwort ohne Sicht,
 * abgeschaltete Erweiterung, ältere Antwort), verhält sich die Oberfläche wie
 * ohne Rollen und bietet an; geschützt wird an der Schreib-Schnittstelle, die
 * seit 4T-002309 bei nicht bestimmbarer Menge abweist.
 *
 * @param {{rechte?: object|null}|null} daten Antwort mit `rechte`.
 * @param {'create'|'update'|'delete'} operation
 * @returns {boolean}
 */
export function rolleErlaubt(daten, operation) {
  const rechte = daten && daten.rechte;
  if (!rechte || typeof rechte !== 'object') return true;
  return rechte[operation] === true;
}

/**
 * Darf der Datensatz gelöscht werden? Bedingung und Rolle (4T-002311).
 *
 * @param {object|null} daten Der Stand der Seite.
 * @returns {boolean}
 */
export function istLoeschbar(daten) {
  return bedingungErlaubt(daten) && rolleErlaubt(daten, 'delete');
}

// 4T-002311 (Story AK4): Der Satz, wenn die Rolle das Ändern verwehrt, mit
// Rolle und Tabelle; ersetzt über eine Funktion, damit ein `$` im Namen kein
// Ersetzungs-Muster ist.
function rolleKeinUpdateText(daten, tabellenPfad) {
  const rolle = typeof daten.rolle === 'string' && daten.rolle !== '' ? daten.rolle : '—';
  const tabelle = String(tabellenPfad || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.md$/i, '');
  return t('database.form.rolleKeinUpdate')
    .replace('{rolle}', () => rolle)
    .replace('{tabelle}', () => tabelle);
}

// Die Aussage «nicht bearbeitbar» mit dem Meldungstext der Bedingung in der
// Sprache des Anwenders, sonst dem Grund der Auswertung.
function nichtBearbeitbarText(editable, sprache) {
  const meldung = loeseBeschriftung(editable.meldung, sprache);
  let grund = meldung;
  if (!grund) {
    const key = `database.form.notEditableReason.${editable.grund}`;
    grund = hatSchluessel(key) ? t(key) : t('database.form.notEditableReason.default');
  }
  return t('database.form.notEditable').replace('{reason}', grund);
}

/**
 * Die Hinweise zum Masken-Körper als Liste; ohne Hinweis kein Block.
 *
 * @param {HTMLElement} wurzel Wurzel der Seite.
 * @param {Array<object>} hints Die Hinweise des Körpers.
 */
export function zeichneHinweise(wurzel, hints) {
  if (hints.length === 0) return;
  const block = el('div', 'db-form-hints');
  block.appendChild(el('span', 'db-form-hints-title', t('database.form.hints')));
  const liste = el('ul', 'db-form-hints-list');
  for (const hinweis of hints) {
    const punkt = el('li', 'db-form-hint', hinweisSatz(hinweis, t));
    punkt.dataset.formCode = String(hinweis.code || '');
    liste.appendChild(punkt);
  }
  block.appendChild(liste);
  wurzel.appendChild(block);
}

/**
 * Füllt die Stelle eines Wert-Platzhalters neu (4T-002183). Ohne Wert bleibt
 * sie leer und trägt die Markierung `db-form-computed-empty` mit einem Satz,
 * der zwischen «kein Wert» und «ungültiger Ausdruck» unterscheidet.
 *
 * @param {HTMLElement} knoten Die Stelle `.db-form-computed`.
 * @param {{ast: object|null}} segment Das Wert-Segment des Körpers.
 * @param {object} kontext Ergebnis von `baueWertKontext`.
 */
export function fuelleWert(knoten, segment, kontext) {
  knoten.textContent = '';
  const wert = werteWertAus(segment.ast, kontext);
  const stuecke = wert === null ? [] : cellSegments(wert);
  const leer = stuecke.length === 0;
  knoten.classList.toggle('db-form-computed-empty', leer);
  if (leer) {
    knoten.title = t(segment.ast ? 'database.form.computedEmpty' : 'database.form.computedInvalid');
  } else {
    knoten.removeAttribute('title');
    appendSegments(knoten, stuecke);
  }
}

// Die Stelle eines Wert-Segments, als Block (`div`) oder im Satz (`span`).
function wertStelle(segment, imSatz) {
  const knoten = el(
    imSatz ? 'span' : 'div',
    imSatz ? 'db-form-computed db-form-computed-inline' : 'db-form-computed',
  );
  knoten.dataset.formExpr = String(segment.ausdruck || '');
  return knoten;
}

/**
 * Die Feld-Namen aller Felder, die gerade in einem verborgenen Bereich stehen
 * (4T-002186, S6), ohne Doppelte.
 *
 * @param {HTMLElement} koerper Der Körper `.db-form-body`.
 * @returns {Array<string>}
 */
export function verborgeneFelder(koerper) {
  const namen = [...koerper.querySelectorAll('.db-form-section[hidden] .db-form-field')].map(
    (feld) => feld.dataset.field,
  );
  return [...new Set(namen)];
}

// 4T-002252: Ein Hinweis, der erst aus der Auswertung entsteht, kommt in den
// Block der Hinweise über dem Körper; gibt es ihn noch nicht, entsteht er dort.
function ergaenzeHinweis(wurzel, koerper, hinweis) {
  const huelle = el('div');
  zeichneHinweise(huelle, [hinweis]);
  const liste = wurzel.querySelector('.db-form-hints-list');
  if (liste) liste.appendChild(huelle.querySelector('.db-form-hint'));
  else if (koerper.parentNode === wurzel) wurzel.insertBefore(huelle.firstChild, koerper);
  else wurzel.appendChild(huelle.firstChild);
}

// 4T-002252: Die Antwort des Kanals auf die Pfad-Stellen übernehmen.
function uebernimmPfade(werte, u, wurzel, koerper) {
  for (const antwort of Array.isArray(werte) ? werte : []) {
    const stelle = u.pfadStellen[Number(antwort.id)];
    if (!stelle) continue;
    if (stelle.art === 'wert')
      fuelleWert(stelle.knoten, { ast: wertAlsAusdruck(antwort.wert) }, {});
    else stelle.knoten.hidden = antwort.erfuellt !== true;
    if (typeof antwort.unbekannt === 'string' && !u.gemeldet.has(antwort.unbekannt)) {
      u.gemeldet.add(antwort.unbekannt);
      ergaenzeHinweis(wurzel, koerper, {
        code: FORM_HINWEISE.pfadUnbekannt,
        name: antwort.unbekannt,
        zeile: stelle.segment.zeile + u.zeilenVersatz,
      });
    }
  }
  u.seite.verborgen = verborgeneFelder(koerper);
}

// Setzt die Stellen der Werte im Satz an die Marken im gerenderten Text ein.
// Eine Marke, die in keinem Text-Knoten mehr steht, fällt an das Ende des
// Blocks, damit kein Wert verschwindet.
function setzeStellenEin(block, stellen) {
  const laeufer = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const textKnoten = [];
  let knoten = laeufer.nextNode();
  while (knoten) {
    if (knoten.nodeValue.includes(MARKE_ANFANG)) textKnoten.push(knoten);
    knoten = laeufer.nextNode();
  }
  for (const text of textKnoten) {
    const teile = text.nodeValue.split(MARKE_ANFANG);
    const ersatz = document.createDocumentFragment();
    ersatz.appendChild(document.createTextNode(teile[0]));
    for (const teil of teile.slice(1)) {
      const trenner = teil.indexOf(MARKE_ENDE);
      const stelle = trenner >= 0 ? stellen.get(Number(teil.slice(0, trenner))) : null;
      if (stelle) ersatz.appendChild(stelle);
      ersatz.appendChild(document.createTextNode(trenner >= 0 ? teil.slice(trenner + 1) : teil));
    }
    text.parentNode.replaceChild(ersatz, text);
  }
  for (const stelle of stellen.values()) if (!block.contains(stelle)) block.appendChild(stelle);
}

// Ein Lauf aus Text- und Satz-Wert-Segmenten als EIN Markdown-Block. Der Text
// mit den Platzhaltern in ihrer Schreibweise ist das Dokument des Blocks für
// die Teilbaum-Schritte; gerendert wird der Text mit den Marken.
function zeichneTextLauf(container, lauf, u) {
  let markdown = '';
  let dokument = '';
  const stellen = new Map();
  for (const segment of lauf) {
    if (segment.art === 'markdown') {
      markdown += String(segment.text || '');
      dokument += String(segment.text || '');
      continue;
    }
    const stelle = wertStelle(segment, true);
    const nummer = u.werte.push({ knoten: stelle, segment }) - 1;
    stellen.set(nummer, stelle);
    markdown += `${MARKE_ANFANG}${nummer}${MARKE_ENDE}`;
    dokument += `{{value:${segment.ausdruck}}}`;
  }
  if (stellen.size === 0 && markdown.trim() === '') return;
  const block = el('div', 'db-form-md markdown-body');
  block.innerHTML = api.renderMarkdown(markdown, u.seite.tabellenPfad);
  if (stellen.size > 0) setzeStellenEin(block, stellen);
  container.appendChild(block);
  // 4T-002021: Der Text des Segments ist das Dokument seiner Diagramme.
  u.bloecke.push({ knoten: block, text: dokument });
}

// Eine Liste von Segmenten in einen Container zeichnen; die Kinder eines
// Bereichs nach derselben Regel in dessen Element.
function zeichneSegmente(container, liste, u) {
  let lauf = [];
  // Ein Lauf wird nur dann EIN Block, wenn er einen Wert im Satz trägt; sonst
  // bleibt jedes Text-Segment sein eigener Block, wie vor 4T-002186.
  const schliesseLauf = () => {
    if (lauf.some((segment) => segment.art === 'wert')) zeichneTextLauf(container, lauf, u);
    else for (const segment of lauf) zeichneTextLauf(container, [segment], u);
    lauf = [];
  };
  for (const segment of Array.isArray(liste) ? liste : []) {
    if (!segment) continue;
    if (segment.art === 'markdown' || (segment.art === 'wert' && segment.imSatz === true)) {
      lauf.push(segment);
      continue;
    }
    schliesseLauf();
    if (segment.art === 'feld') {
      const feld = u.felder.get(segment.name) || { name: segment.name, type: 'string' };
      const entwurf = u.seite.entwurf ? u.seite.entwurf[segment.name] : undefined;
      const element = container.appendChild(
        baueFeldElement({
          feld,
          zelle: u.zellen.get(segment.name) || null,
          modus: u.seite.modus,
          text: typeof entwurf === 'string' ? entwurf : undefined,
          sprache: u.sprache,
          ...u.verweise.optionen(feld),
          beiVerweisKlick: u.navigation ? u.navigation.beiVerweisKlick : null,
          beiAenderung: u.beiAenderung,
          gesperrt: u.gesperrt.has(segment.name),
        }),
      );
      markiereFeld(element, u.seite.befunde);
    } else if (segment.art === 'wert') {
      const knoten = container.appendChild(wertStelle(segment, false));
      u.werte.push({ knoten, segment });
    } else if (segment.art === 'bereich') {
      const knoten = el('div', 'db-form-section');
      knoten.dataset.formWhen = String(segment.bedingung || '');
      knoten.hidden = true;
      u.bereiche.push({ knoten, segment });
      zeichneSegmente(knoten, segment.kinder, u);
      container.appendChild(knoten);
    } else if (segment.art === 'liste') {
      const knoten = container.appendChild(el('div', 'db-form-positions'));
      knoten.dataset.formList = String(segment.datei || '');
      const zeile = segment.zeile + u.zeilenVersatz;
      if (u.positionen)
        u.positionen.zeichneBereich(
          knoten,
          { ...segment, zeile },
          { seite: u.seite, modus: u.seite.modus },
        );
    }
  }
  schliesseLauf();
}

/**
 * Der Körper: Markdown-Segmente als erzeugte Teilbäume (Klasse «erzeugter
 * Teilbaum» des Wächters render-teilbaum-schritte: Darstellung und Befüllung
 * ohne Bearbeitbarkeit, denn die Blöcke sind nicht das offene Dokument, sondern
 * aus der Definition oder der Masken-Datei erzeugt), Feld-Segmente als
 * Feld-Elemente, Wert-Segmente als nicht bearbeitbare Stellen, die jeder
 * Eingabe folgen, Bereichs-Segmente als Abschnitte, die mit ihrer Bedingung
 * erscheinen und verschwinden. Die Nachbehandlung läuft erst, wenn die Blöcke
 * im Dokument hängen (`zeichneNachlauf`).
 *
 * @param {HTMLElement} wurzel Wurzel der Seite.
 * @param {object} daten Der bereite Stand der Seite.
 * @param {{seite: object, verweise: object, sprache: string|null, navigation?: object,
 *   pfade?: object, positionen?: object}} umgebung `pfade` ist die Auswertung der
 *   Pfad-Stellen (`masken-pfade.js`, 4T-002252), `positionen` der
 *   Positions-Bereich (`masken-positionen.js`, 4T-002253).
 * @returns {Array<{knoten: HTMLElement, text: string}>} Die Markdown-Blöcke.
 */
export function zeichneKoerper(
  wurzel,
  daten,
  { seite, verweise, sprache, navigation = null, pfade = null, positionen = null },
) {
  const koerper = el('div', 'db-form-body');
  if (navigation) koerper.addEventListener('click', navigation.beiLinkKlick);
  const u = {
    seite,
    verweise,
    sprache,
    navigation,
    positionen,
    bloecke: [],
    felder: new Map(daten.fields.map((feld) => [feld.name, feld])),
    zellen: new Map(daten.zellen.map((zelle) => [zelle.name, zelle])),
    // 4T-002312: die nach ihrer Bedingung gesperrten Felder des gelesenen Stands.
    gesperrt: new Set(Array.isArray(daten.gesperrteFelder) ? daten.gesperrteFelder : []),
    // 4T-002183, 4T-002186: Die Stellen der Werte und die Bereiche mit ihrem
    // Neu-Rechnen über dem aktuellen Stand; im Lesen ist der Entwurf leer, und
    // es gilt die Zelle.
    werte: [],
    bereiche: [],
    beiAenderung: null,
    // 4T-002252: die Stellen mit Verweis-Pfad, die schon gemeldeten Pfade und
    // der Versatz der Zeilen einer Masken-Datei.
    pfadStellen: [],
    gemeldet: new Set(),
    zeilenVersatz: daten.koerper.zeilenVersatz || 0,
  };
  const fragePfade = (texte) => {
    if (u.pfadStellen.length === 0 || !pfade) return;
    pfade.anfordern({
      tabellenPfad: seite.tabellenPfad,
      kennung: seite.neu ? null : seite.kennung || null,
      entwurf: Object.fromEntries(daten.fields.map((feld, i) => [feld.name, texte[i]])),
      stellen: u.pfadStellen.map(({ art, segment }) => ({
        quelle: art === 'wert' ? segment.ausdruck : segment.bedingung,
      })),
      uebernehmen: (werte) => uebernimmPfade(werte, u, wurzel, koerper),
    });
  };
  const rechne = () => {
    if (u.werte.length > 0 || u.bereiche.length > 0) {
      const texte = texteDesStands(daten.fields, daten.zellen, seite.entwurf);
      const kontext = baueWertKontext(daten.fields, texte);
      for (const { knoten, segment } of u.werte)
        if (segment.pfad !== true) fuelleWert(knoten, segment, kontext);
      for (const { knoten, segment } of u.bereiche)
        if (segment.pfad !== true) knoten.hidden = !werteBedingungAus(segment.ast, kontext);
      fragePfade(texte);
    }
    seite.verborgen = verborgeneFelder(koerper);
  };
  u.beiAenderung = (name, text) => {
    if (seite.entwurf) seite.entwurf[name] = text;
    rechne();
  };
  zeichneSegmente(koerper, daten.koerper.segmente, u);
  // 4T-002252: Pfad-Stellen beginnen leer und markiert, Pfad-Bereiche verborgen.
  for (const { knoten, segment } of u.werte.filter((w) => w.segment.pfad === true)) {
    u.pfadStellen.push({ art: 'wert', knoten, segment });
    fuelleWert(knoten, { ast: wertAlsAusdruck(null) }, {});
  }
  for (const { knoten, segment } of u.bereiche.filter((b) => b.segment.pfad === true))
    u.pfadStellen.push({ art: 'bereich', knoten, segment });
  rechne();
  wurzel.appendChild(koerper);
  return u.bloecke;
}

/**
 * Der Inhalt eines bereiten Stands unter dem Kopf, in dieser Reihenfolge: der
 * Satz «nicht bearbeitbar», die Hinweise und der Körper.
 *
 * @param {HTMLElement} wurzel Wurzel der Seite.
 * @param {object} daten Der bereite Stand der Seite.
 * @param {{seite: object, verweise: object, sprache: string|null}} umgebung
 * @returns {Array<{knoten: HTMLElement, text: string}>} Die Markdown-Blöcke.
 */
export function zeichneInhalt(wurzel, daten, umgebung) {
  const seite = umgebung.seite || {};
  // 4T-002311: Verwehrt die Rolle das Ändern, sagt der Satz es; für Anlegen und
  // Löschen gibt es keinen Satz, dort fehlt die Schaltfläche.
  if (!seite.neu && !rolleErlaubt(daten, 'update')) {
    wurzel.appendChild(
      el('p', 'db-form-not-editable db-form-role', rolleKeinUpdateText(daten, seite.tabellenPfad)),
    );
  } else if (!bedingungErlaubt(daten)) {
    wurzel.appendChild(
      el('p', 'db-form-not-editable', nichtBearbeitbarText(daten.editable, umgebung.sprache)),
    );
  }
  zeichneHinweise(wurzel, daten.koerper.hints);
  return zeichneKoerper(wurzel, daten, umgebung);
}

/**
 * Der Nachlauf, sobald die Wurzel im Dokument hängt: zuerst der
 * Teilbaum-Schritt-Satz je Markdown-Block, danach bekommt das erste betroffene
 * Feld eines abgewiesenen Auftrags einmal den Fokus (B5).
 *
 * @param {HTMLElement} wurzel Wurzel der Seite.
 * @param {Array<{knoten: HTMLElement, text: string}>} bloecke Aus `zeichneKoerper`.
 * @param {object} seite Das Zustands-Objekt der Seite.
 */
export function zeichneNachlauf(wurzel, bloecke, seite) {
  for (const { knoten, text } of bloecke) {
    applyTeilbaumSchritte(knoten, seite.tabellenPfad, { dokumentText: text });
  }
  const fokus = seite.fokus;
  seite.fokus = null;
  const ziel = fokus
    ? [...wurzel.querySelectorAll('.db-form-field')].find((f) => f.dataset.field === fokus)
    : null;
  const eingabe = ziel && ziel.querySelector('.db-form-input');
  if (eingabe && typeof eingabe.focus === 'function') eingabe.focus();
}
