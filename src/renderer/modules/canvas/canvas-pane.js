// 4T-001653 (Epic 3E-000287): Einbettung der Canvas-Ansicht in die Pane.
//
// Hält je Spalte genau eine Ansichts-Instanz, liest die Fence aus dem
// Dokument-Text und aktualisiert sie verzögert nach Dokument-Änderungen
// (Muster mindmap-pane.js: ein Zeitgeber je Spalte).
//
// Die Ansicht selbst (canvas-view.js) kennt weder api noch i18n noch den
// Fenster-Zustand; alles davon wird hier gereicht. Dieses Modul ist damit die
// einzige Stelle, an der die Canvas den Renderer-Zustand berührt.
//
// **Der Zugang zum Fenster-Zustand ist injiziert und nicht importiert**
// (`initCanvasPane`, gerufen aus app-init.js; Muster initMacros und
// initCommandPalette). Das ist keine Stil-Vorliebe, sondern gemessen: Ein
// direkter Import von `app-state.js` zieht diesen Ordner in den großen
// Datei-Zyklus des Renderers, und der Ordner-Import-Wächter ist eine Ratsche —
// die eingefrorene Komponente darf nicht wachsen. Von den drei erwogenen
// Importen war allein `app-state` die Ursache; `api` und `i18n` bilden keinen
// Kreis und bleiben deshalb gewöhnliche Importe.
//
// **Der Kern wird direkt importiert und nicht über die Preload-Brücke
// gebrückt** — anders als die Mindmap, deren Baum in `api.buildMindmap`
// entsteht. Grund: Jener braucht die Markdown-Pipeline des Preloads, dieser
// nicht; `canvas-core.js` ist reiner Text-Umgang ohne jede Abhängigkeit
// (Muster shared/markdown/frontmatter.js, das views.js ebenso direkt lädt).
'use strict';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import {
  canvasFlaechenTitel,
  canvasListe,
  findCanvasFences,
  parseCanvasFence,
} from '../../../shared/canvas/canvas-core.js';
import { istCanvasModusVerfuegbar } from './canvas-modus.js';
import { createCanvasView } from './canvas-view.js';
// 4T-001747 (Epic 3E-000289): Die Zerlegung einer Verweis-Angabe in Ziel, Anker
// und Abruf-Pfad steht an **einer** Stelle — dieselbe, aus der die Anzeige
// liest (Abnahme-Befund vom 2026-09-14).
import { zerlegeZiel } from './canvas-verweis-anzeige.js';

// Verzögerung der Live-Aktualisierung. Gleicher Wert wie Gliederung und
// Mindmap: am Tippen erprobt, hält die Fläche gefühlt sofort aktuell.
export const CANVAS_RENDER_DEBOUNCE_MS = 200;

const ansichten = []; // paneIdx -> Controller
const timer = []; // paneIdx -> Zeitgeber

// Injizierter Zugang zum Fenster-Zustand; siehe Modul-Kopf.
let umgebung = null;

// 4T-001130 (Epic 3E-000272): Der Karten-Inhalt ist ein **erzeugter Teilbaum**
// im Sinne jenes Wächters — gerendertes Markdown, per innerHTML in ein
// bestehendes Dokument gesetzt. Ohne den Schritt-Satz bliebe alles inert, was
// die Pipeline erst befüllt oder bedienbar macht; ein Mermaid-Diagramm in
// einer Karte bliebe etwa ein Code-Block. Der Satz läuft ohne
// Bearbeitbarkeit, weil die Karte Ansicht ist.
//
// Er wird **hereingereicht statt importiert**, nach dem Muster von
// `registriereTeilbaumSchritte` in perspective-script-view.js und aus
// demselben Grund: Ein Import von `render-mermaid.js` zöge diesen Ordner in
// den großen Datei-Zyklus des Renderers, den der Ordner-Import-Wächter als
// Ratsche eingefroren hat (gemessen am 2026-09-09). Ohne Registrierung bleibt
// die Karte unverarbeitet statt zu scheitern — der Aufrufer ist auch der
// jsdom-Unit-Test, der ohne Preload läuft.
let teilbaumSchritte = null;

/** Reicht den Schritt-Satz des erzeugten Teilbaums herein. */
export function registriereCanvasTeilbaumSchritte(fn) {
  if (typeof fn === 'function') teilbaumSchritte = fn;
}

/**
 * Verdrahtet die Canvas-Einbettung mit dem Fenster-Zustand.
 *
 * @param {object} zugang
 * @param {Function} zugang.getPaneEls (paneIdx) => Pane-Elemente.
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument oder null.
 * @param {Function} [zugang.beiVerfuegbarkeitsWechsel] (paneIdx, jetzt) => void.
 * @param {Function} [zugang.schreibeDokument] (paneIdx, {vonZeile, bisZeile, text})
 *   => boolean (4T-001654). Ersetzt den Zeilen-Bereich im Editor der Spalte als
 *   **eine** Transaktion. Hereingereicht statt importiert, weil ein Import von
 *   `editor.js` einen Zyklus editor -> canvas-pane -> editor bildete.
 * @param {Function} [zugang.istAenderbar] (paneIdx) => boolean (Befund 1 des
 *   Product Owners vom 2026-09-10). Sagt, ob das Dokument der Spalte gerade
 *   geschrieben werden darf — im Anzeige-Modus tut es das nicht, und die Fläche
 *   bietet dann keine schreibende Handlung mehr an. Hereingereicht statt
 *   ermittelt, weil die Antwort am Reiter-Zustand und an der EditorView der
 *   Spalte hängt und beide dem Fenster-Zustand gehören.
 * @param {Function} [zugang.rueckgaengig] (paneIdx) => boolean (4T-001654).
 *   Ein Schritt zurück in der Historie der Spalte. Aus demselben Grund
 *   hereingereicht wie der Schreibweg: Die Historie lebt im Editor.
 * @param {Function} [zugang.wiederholen] (paneIdx) => boolean.
 * @param {Function} [zugang.zeigeKontextmenue] (paneIdx, {x, y, eintraege})
 *   => void (4T-001683). Baut das gemeinsame Kontextmenü des Fensters. Der
 *   Canvas-Ordner darf die Menü-Helfer nicht importieren, weil sie am
 *   Fenster-Zustand hängen; die Einträge kommen deshalb von hier und das
 *   Bauen von dort.
 * @param {Function} [zugang.schliesseKontextmenue] () => void.
 * @param {Function} [zugang.kontextmenueOffen] () => boolean.
 */
export function initCanvasPane(zugang) {
  umgebung = zugang || null;
}

// 4T-001654: Der Hinweis in der Statusleiste kommt über einen Laufzeit-Import
// (Muster live-table-zelle.js). Ein statischer Bezug auf `views.js` bildete
// einen Ordner-übergreifenden Zyklus — jenes Modul ruft `renderCanvas` —, und
// der Ordner-Import-Wächter ist eine Ratsche. Ein Fehlschlag bleibt folgenlos:
// Der Hinweis ist Beiwerk, das Verwerfen der Änderung ist schon geschehen.
function zeigeHinweis(schluessel) {
  import('../views/views.js')
    .then((modul) => modul.showStatusbarHint(schluessel, { error: true, duration: 2500 }))
    .catch(() => {});
}

/**
 * Stellt den neu serialisierten Rumpf einer Fläche in das Dokument.
 *
 * **Der Abgleich vor der Übernahme** ist die Vorsichtsregel des Vorbilds
 * (`perspective-datatable-editor.js`) und wiegt hier schwerer als dort: In der
 * Fence liegt der ganze Anwender-Text der Fläche. Die Fence wird im
 * **aktuellen** Dokument neu gesucht (Wiedererkennung über die Stelle, wie in
 * `findeWieder`), und stimmt ihr Rumpf nicht byte-gleich mit dem überein, auf
 * dem die Ansicht beruht, wird die Änderung **verworfen** statt falsch
 * geschrieben. Danach zeichnet die Fläche aus dem Dokument neu, damit die
 * Anzeige nicht auf einem Stand stehen bleibt, den es nirgends gibt.
 *
 * @returns {boolean} `true`, wenn geschrieben wurde.
 */
function schreibeFlaeche(paneIdx, { flaeche, rumpf }) {
  if (!umgebung || typeof umgebung.schreibeDokument !== 'function' || !flaeche) return false;
  const tab = umgebung.aktivesDokument(paneIdx);
  if (!tab || typeof tab.content !== 'string') {
    zeigeHinweis('canvas.verworfen');
    return false;
  }
  const fence = findCanvasFences(tab.content).find((f) => f.startZeile === flaeche.startZeile);
  if (!fence || fence.rumpf !== flaeche.rumpf) {
    zeigeHinweis('canvas.verworfen');
    renderCanvas(paneIdx);
    return false;
  }
  // `startZeile` ist die Stelle der Zaun-Zeile (1-basiert); der Rumpf beginnt
  // eine Zeile darunter und endet eine Zeile vor dem schließenden Zaun.
  const ok =
    umgebung.schreibeDokument(paneIdx, {
      vonZeile: fence.startZeile + 1,
      bisZeile: fence.endeZeile - 1,
      text: rumpf,
    }) !== false;
  if (!ok) {
    zeigeHinweis('canvas.verworfen');
    renderCanvas(paneIdx);
  }
  return ok;
}

/**
 * Legt eine Karte in der Mitte des sichtbaren Ausschnitts der aktiven Fläche
 * an — der Weg des Kommandos aus Menü und Kommando-Palette (4T-001654).
 *
 * Außerhalb der Canvas-Ansicht bleibt das Kommando wirkungslos und sagt es
 * (Muster `insertEventsBlock`): Ein stiller Fehlschlag wäre für den Nutzer
 * nicht von einem Fehler zu unterscheiden.
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeCanvasKarteAn(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const ansicht = ansichten[paneIdx];
  if (!tab || tab.viewMode !== 'canvas' || !ansicht) {
    zeigeHinweis('canvas.keineAnsicht');
    return false;
  }
  // Befund 1 vom 2026-09-10: Im Anzeige-Modus wird nichts angelegt — und es
  // wird gesagt (Guard-Muster `insertEventsBlock`). Ein stiller Fehlschlag
  // wäre für den Nutzer nicht von einem Fehler zu unterscheiden, und genau
  // das war die gemeldete Erfahrung an der gezogenen Linie.
  if (!istAenderbar(paneIdx)) {
    zeigeHinweis('canvas.nichtAenderbar');
    return false;
  }
  return ansicht.karteAnlegen() !== false;
}

/**
 * Gemeinsamer Eintritt der Flächen-Kommandos (4T-001701).
 *
 * Die drei Bedingungen sind für jedes von ihnen dieselben — Canvas-Ansicht
 * offen, Fläche vorhanden, Dokument änderbar —, und jede wird **gesagt** statt
 * still verworfen (Guard-Muster `insertEventsBlock`): Ein stiller Fehlschlag
 * wäre für den Nutzer nicht von einem Fehler zu unterscheiden.
 *
 * Hier liegt zugleich die Stelle, an der das Verfügbarkeits-Modell aufhört:
 * Es kennt die offene Fläche, nicht aber den Anzeige-Modus und nicht die
 * Auswahl auf der Fläche. Beides fängt dieser Guard ab.
 *
 * @param {number} paneIdx
 * @param {Function} handlung (ansicht) => boolean
 * @returns {boolean}
 */
function anDerFlaeche(paneIdx, handlung) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const ansicht = ansichten[paneIdx];
  if (!tab || tab.viewMode !== 'canvas' || !ansicht) {
    zeigeHinweis('canvas.nurInAnsicht');
    return false;
  }
  if (!istAenderbar(paneIdx)) {
    zeigeHinweis('canvas.nurLesbar');
    return false;
  }
  return handlung(ansicht) !== false;
}

/**
 * Legt eine Form in der Mitte des sichtbaren Ausschnitts der aktiven Fläche
 * an — der Weg des Kommandos aus Menü und Kommando-Palette (4T-001701).
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeCanvasFormAn(paneIdx) {
  return anDerFlaeche(paneIdx, (ansicht) => ansicht.formAnlegen());
}

/**
 * Legt eine Gruppe in der Mitte des sichtbaren Ausschnitts der aktiven Fläche
 * an — der Weg des Kommandos aus Menü und Kommando-Palette (4T-001702).
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeCanvasGruppeAn(paneIdx) {
  return anDerFlaeche(paneIdx, (ansicht) => ansicht.gruppeAnlegen());
}

/**
 * Fragt das Ziel ab und legt danach eine Verweis-Karte in der aktiven Fläche
 * an — der Weg des Kommandos aus Menü und Kommando-Palette (4T-001747).
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeCanvasVerweisKarteAn(paneIdx) {
  return anDerFlaeche(paneIdx, (ansicht) => ansicht.verweisKarteAnlegen());
}

/**
 * Fragt das Bild ab und legt danach eine Bild-Karte in der aktiven Fläche an —
 * der Weg des Kommandos aus Menü und Kommando-Palette (4T-001748).
 *
 * @param {number} paneIdx
 * @returns {boolean}
 */
export function legeCanvasBildKarteAn(paneIdx) {
  return anDerFlaeche(paneIdx, (ansicht) => ansicht.bildKarteAnlegen());
}

/**
 * Löst das Bild einer Karte auf und öffnet es über den Anlagen-Weg der
 * Anwendung (4T-001748, Entscheidung F3).
 *
 * **Hier ausdrücklich NICHT derselbe Aufruf wie die Anzeige** — anders als beim
 * Dokument-Verweis (4T-001747, Entscheidung 11), und mit Absicht: Die Anzeige
 * ruft `readEmbedImage`, und genau dieser Aufruf schlägt bei einem Bild über
 * der Größen-Grenze fehl. Das Öffnen muss aber gerade dort tragen, weil der
 * Anwender das zu große Bild ansehen will. Gerufen wird deshalb
 * `resolveEmbedTarget` — **dieselben drei Auflösungs-Stufen und dieselbe
 * Bereichs-Grenze**, nur ohne das Lesen der Datei. Die Art `other` steht dabei
 * bewusst: Ihre Endungs-Regel ist die leere, und die Endung hat der Kern schon
 * geprüft (`BILD_ENDUNGEN`, G8); die Art `image` des Auflösers führt kein
 * `ico` und verweigerte damit ein Bild, das die Grammatik erlaubt.
 */
async function oeffneBildZiel(paneIdx, bild) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  let ergebnis;
  try {
    ergebnis = await api.resolveEmbedTarget(
      tab && tab.path ? tab.path : '',
      String(bild == null ? '' : bild),
      'other',
    );
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.ok || !ergebnis.path) {
    zeigeHinweis('canvas.bildZielFehlt');
    return false;
  }
  // Laufzeit-Import aus demselben Grund wie beim Öffnen eines Dokuments: Ein
  // statischer Bezug auf `views/` zöge den Canvas-Ordner in den großen
  // Datei-Zyklus des Renderers. Die Anlagen-Strecke bringt ihre beiden Grenzen
  // (Wurzel, Rückfrage bei ausführbaren Endungen) und ihre Meldungen mit.
  const navigation = await import('../views/link-navigation.js');
  return navigation.oeffneAnlage(paneIdx, ergebnis.path);
}

/**
 * Löst das Ziel eines Karten-Verweises auf und öffnet es als geöffnetes
 * Dokument an der verwiesenen Stelle (4T-001747, Entscheidung F3).
 *
 * **Derselbe Auflöser wie die Anzeige.** Gerufen wird `readEmbedFile` und nicht
 * ein zweiter Weg: Die drei Stufen samt Bereichs-Grenze entscheiden sonst an
 * zwei Stellen verschieden, und ein Ziel, das die Karte anzeigt, ließe sich
 * womöglich nicht öffnen.
 *
 * **Öffnen und Anker-Sprung kommen über Laufzeit-Importe**, wie der
 * Statusleisten-Hinweis darüber und aus demselben Grund: Ein statischer Bezug
 * auf `tabs.js` oder `views/` zöge den Canvas-Ordner in den großen Datei-Zyklus
 * des Renderers, den der Ordner-Import-Wächter als Ratsche eingefroren hat.
 */
async function oeffneVerweisZiel(paneIdx, doc) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  // 4T-001747 (Abnahme-Befund vom 2026-09-14): Zerlegt wird über **dieselbe**
  // Funktion wie in der Anzeige, samt ihrer Abruf-Fassung des Ziels. Die eigene
  // Zerlegung, die vorher hier stand, reichte den geschriebenen Text ungeändert
  // weiter — und ein Ziel ohne Endung weist `embed:read` mit
  // `extension not allowed` ab. Zwei Fassungen derselben Zerlegung waren
  // zugleich zwei Orte, an denen genau das unbemerkt auseinanderlaufen konnte.
  const { anker, pfad } = zerlegeZiel(doc);
  let ergebnis;
  try {
    ergebnis = await api.readEmbedFile(tab && tab.path ? tab.path : '', pfad, null);
  } catch {
    ergebnis = null;
  }
  if (!ergebnis || !ergebnis.path) {
    zeigeHinweis('canvas.verweisZielFehlt');
    return false;
  }
  const [tabs, anchor] = await Promise.all([
    import('../tabs/tabs.js'),
    import('../views/anchor-navigation.js'),
  ]);
  // Gruppe erben wie beim Öffnen-Link einer Einbettung: Die Karte liegt im
  // Dokument-Inhalt, und das Ziel gehört in dieselbe Reiter-Gruppe.
  const zielPane = await tabs.openInPane(paneIdx, [ergebnis.path], { inheritGroup: true });
  if (anker) {
    anchor.scrollToAnchorAfterOpen(typeof zielPane === 'number' ? zielPane : paneIdx, anker);
  }
  return true;
}

/**
 * Die Namen des Bereichs-Index als Vorschläge für das Ziel-Feld (4T-001747).
 *
 * **Wiederverwendet wird die Index-Abfrage, nicht die Vervollständigung des
 * Editors.** Geprüft und entschieden in diesem Vorgang: `wikiLinkCompletionSource`
 * ist eine CodeMirror-Quelle — sie bekommt einen `CompletionContext` mit
 * Dokument, Schreibmarke und EditorView, liest ihren Präfix aus der Zeile und
 * gibt CodeMirror-Optionen zurück. Nichts davon gibt es an einem Eingabe-Feld
 * der Fläche. Wiederverwendbar ist die Stufe darunter, und genau die wird
 * gerufen: `api.autocompleteWikiTargets`, derselbe Endpunkt, aus dem jene
 * Quelle ihre Namen bezieht. Die Anzeige übernimmt die `datalist` des Browsers.
 */
function verweisVorschlaege(paneIdx) {
  return namenAus(() => api.autocompleteWikiTargets(dokumentPfad(paneIdx)));
}

/**
 * Die Bild-Dateien des Bereichs als Vorschläge für das Bild-Feld (4T-001748).
 *
 * **Eine eigene Sicht des Bereichs-Index, kein Filter über der Wiki-Sicht.**
 * Nachgesehen: Jene baut ihre Liste aus den Markdown-Dateien und den
 * Zweitnamen des Index; Bilder stehen dort gar nicht, und ein Filter über einer
 * Liste ohne Bilder bliebe für immer leer. Der Kanal
 * `autocomplete:imageTargets` liest die Namens-Zuordnung der
 * Nicht-Markdown-Dateien und gibt daraus heraus, was eine Bild-Endung trägt —
 * dieselbe Bereichs-Grenze, dieselbe Antwort-Form, derselbe Aufbau-bei-Bedarf
 * wie beim Nachbarn.
 */
function bildVorschlaege(paneIdx) {
  return namenAus(() => api.autocompleteImageTargets(dokumentPfad(paneIdx)));
}

function dokumentPfad(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  return tab && tab.path ? tab.path : null;
}

// Die Namen einer Vorschlags-Antwort. Beide Sichten antworten in derselben Form
// (`{status, suggestions}`), und beide dürfen scheitern, ohne dass ein Feld
// dadurch ausfällt: Ein Feld ohne Vorschläge ist immer noch ein Feld.
async function namenAus(abfrage) {
  let antwort;
  try {
    antwort = await abfrage();
  } catch {
    antwort = null;
  }
  if (!antwort || antwort.status !== 'ready' || !Array.isArray(antwort.suggestions)) return [];
  return antwort.suggestions.map((s) => (s && s.name ? String(s.name) : '')).filter(Boolean);
}

/**
 * Verschiebt das gewählte Element der aktiven Fläche im Stapel (Story
 * 4S-000932).
 *
 * Ist nichts gewählt, sagt die Fläche es. Das ist der zweite Fall, den das
 * Verfügbarkeits-Modell nicht trägt: Die Auswahl lebt in der Ansicht, und ein
 * gemeldetes Feld dafür ginge bei jedem Klick über die Prozess-Brücke.
 *
 * @param {number} paneIdx
 * @param {string} befehl einer aus `STAPEL_BEFEHLE`.
 * @returns {boolean}
 */
export function verschiebeCanvasElement(paneIdx, befehl) {
  return anDerFlaeche(paneIdx, (ansicht) => {
    if (!ansicht.gewaehltesElement()) {
      zeigeHinweis('canvas.keineAuswahl');
      return false;
    }
    // Ein `false` von hier heißt «lag schon ganz vorn» und ist kein Fehler:
    // Der Anwender sieht die unveränderte Fläche, und ein Hinweis darauf wäre
    // Lärm statt Auskunft.
    return ansicht.verschiebeImStapel(befehl);
  });
}

// Baut die Ansicht einer Spalte auf, falls noch nicht vorhanden.
function ansichtFuer(paneIdx) {
  if (ansichten[paneIdx]) return ansichten[paneIdx];
  if (!umgebung) return null;
  const els = umgebung.getPaneEls(paneIdx);
  if (!els || !els.canvasEl) return null;
  els.canvasEl.innerHTML = '';
  ansichten[paneIdx] = createCanvasView(els.canvasEl, {
    t,
    // 4T-001747: Die Optionen reisen mit — der Körper einer Verweis-Karte wird
    // mit unterdrückter Frontmatter-Zeile gerendert, wie jede Einbettung.
    renderMarkdown: (text, pfad, optionen) => api.renderMarkdown(text, pfad, optionen),
    nachRender: (container, pfad) => {
      if (teilbaumSchritte) teilbaumSchritte(container, pfad);
    },
    // 4T-001747: Der Einbettungs-Weg des Bestands, hereingereicht statt in der
    // Ansicht importiert (Injektions-Bauweise E4).
    leseEinbettung: (basisPfad, ziel, anker) => api.readEmbedFile(basisPfad, ziel, anker),
    // 4T-001748: Der Bild-Einbettungs-Weg des Bestands — Daten-Adresse,
    // Größen-Grenze und Bereichs-Grenze kommen von dort und nicht von hier.
    leseBild: (basisPfad, bild) => api.readEmbedImage(basisPfad, bild),
    oeffneZiel: (doc) => oeffneVerweisZiel(paneIdx, doc),
    oeffneBild: (bild) => oeffneBildZiel(paneIdx, bild),
    zielVorschlaege: () => verweisVorschlaege(paneIdx),
    bildVorschlaege: () => bildVorschlaege(paneIdx),
    // 4T-001654: Der Rückweg aus der Ansicht in das Dokument.
    beiAenderung: (daten) => schreibeFlaeche(paneIdx, daten),
    // 4T-001747 (Abnahme-Befund vom 2026-09-14): Eine während einer
    // Bedien-Handlung zurückgestellte Neu-Übergabe wird aus dem **aktuellen**
    // Dokument nachgeholt und nicht aus ihrem Schnappschuss — der beschreibt
    // den Stand vor der Handlung und machte sie beim Nachholen rückgängig.
    neuUebergeben: () => renderCanvas(paneIdx),
    // Befund 1 vom 2026-09-10: Im Anzeige-Modus ist die Fläche nur ansehbar.
    istAenderbar: () => istAenderbar(paneIdx),
    // 4T-001654: Rückgängig und Wiederholen auf der Historie dieser Spalte.
    // Sie gehören dem Editor; die Fläche reicht nur die Taste weiter.
    rueckgaengig: () => rufeZugang('rueckgaengig', paneIdx),
    wiederholen: () => rufeZugang('wiederholen', paneIdx),
    // 4T-001769: Die Meldung an die Karten-Liste, sobald sich der Stand der
    // Fläche ändert — Auswahl, gezeigte Fläche oder Inhalt.
    beiStandWechsel: () => meldeStand(paneIdx),
    // 4T-001683: Zugang zum gemeinsamen Kontextmenü des Fensters.
    zeigeKontextmenue: (daten) => rufeZugang('zeigeKontextmenue', paneIdx, daten),
    schliesseKontextmenue: () => rufeZugang('schliesseKontextmenue'),
    kontextmenueOffen: () => rufeZugang('kontextmenueOffen') === true,
  });
  return ansichten[paneIdx];
}

// Ruft eine optionale Funktion des injizierten Zugangs. Fehlt sie, ist das
// kein Fehler, sondern der Stand einer Einbettung ohne diesen Weg — der
// jsdom-Prüffall reicht bewusst nur, was er messen will.
function rufeZugang(name, ...args) {
  if (!umgebung || typeof umgebung[name] !== 'function') return false;
  return umgebung[name](...args);
}

/**
 * Darf die Fläche der Spalte geschrieben werden (Befund 1 vom 2026-09-10)?
 *
 * **Der fehlende Rückruf heißt hier «ja» und nicht «nein».** Das ist die
 * Ausnahme von der Fail-closed-Regel und hat einen Grund: Der Schreibweg ist
 * über `schreibeDokument` eigens gesichert und liefert ohne Zugang gar nichts;
 * diese Frage entscheidet allein, ob die Fläche eine Handlung **anbietet**.
 * Eine Einbettung, die den Anzeige-Modus nicht kennt, verhält sich damit wie
 * vor diesem Befund, statt zur reinen Anzeige zu werden.
 */
function istAenderbar(paneIdx) {
  if (!umgebung || typeof umgebung.istAenderbar !== 'function') return true;
  return umgebung.istAenderbar(paneIdx) === true;
}

/**
 * Liest den Zustand einer Canvas aus einem Dokument-Text.
 *
 * Prozessnah, aber ohne DOM: als eigene Funktion exportiert, damit die
 * Auswahl der Flächen und die Wahl des Hinweises ohne Pane geprüft werden
 * kann.
 *
 * **Seit 4T-001677 liefert sie alle Flächen des Dokuments**, nicht mehr allein
 * die erste. Die Ansicht macht daraus Reiter (Anordnung des Product Owners
 * vom 2026-09-09); der Hinweis auf mehrere Flächen entfällt damit, weil die
 * Leiste sie zeigt statt sie anzukündigen.
 *
 * @param {string} inhalt Dokument-Text.
 * @returns {{flaechen: Array<object>, hinweis: string|null, hinweisWerte: object|null}}
 */
export function canvasZustandAus(inhalt) {
  const text = typeof inhalt === 'string' ? inhalt : '';
  const fences = findCanvasFences(text);
  if (fences.length === 0) {
    return { flaechen: [], hinweis: 'canvas.keineFence', hinweisWerte: null };
  }
  const flaechen = fences.map((fence, i) => {
    const model = parseCanvasFence(fence.rumpf);
    return {
      model,
      titel: canvasFlaechenTitel(model),
      // Die Stelle im Dokument ist die stabile Kennung einer Fläche: Sie
      // überlebt eine Live-Aktualisierung, solange die Fence dort steht, und
      // unterscheidet zwei Flächen mit gleichem Titel.
      startZeile: fence.startZeile,
      // 4T-001654: Der Rumpf, auf dem die Ansicht beruht. Er ist der Maßstab
      // des Abgleichs vor jeder Übernahme — ohne ihn ließe sich nicht
      // feststellen, ob das Dokument sich zwischenzeitlich geändert hat.
      rumpf: fence.rumpf,
      nummer: i + 1,
    };
  });

  // Genau ein Hinweis, und er bezieht sich auf die **gezeigte** Fläche. Die
  // Rangfolge von früher entfällt mit dem Mehrere-Flächen-Hinweis; übrig
  // bleibt, was der Anwender an der Fläche selbst nicht sehen kann.
  let hinweis = null;
  let hinweisWerte = null;
  const erste = flaechen[0];
  if (erste.model.errors.length > 0) {
    hinweis = 'canvas.befunde';
    hinweisWerte = { count: erste.model.errors.length };
  } else if (erste.model.elemente.filter((el) => el.art === 'karte').length === 0) {
    hinweis = 'canvas.leer';
  }
  return { flaechen, hinweis, hinweisWerte };
}

// --- Auskunft für die Karten-Liste (4T-001769) ---------------------------------
//
// Die Karten-Liste ist ein Sidebar-Panel und damit außerhalb dieses Ordners
// (Entscheidung F1 des Product Owners vom 2026-09-15). Sie liest den Stand der
// Fläche über diese beiden Griffe und schreibt nie selbst — der eine Schreibweg
// bleibt der eine Schreibweg (E11).
//
// **Gemeldet statt importiert:** Das Panel trägt sich hier ein, dieses Modul
// kennt es nicht. Ein Import in die Gegenrichtung zöge den Canvas-Ordner in den
// großen Datei-Zyklus des Renderers, den der Ordner-Import-Wächter als Ratsche
// eingefroren hat — dieselbe Begründung wie beim injizierten Fenster-Zustand im
// Modul-Kopf.
const beobachter = new Set();

/**
 * Meldet einen Beobachter an, der bei jeder Änderung des Flächen-Stands
 * gerufen wird (Auswahl, gezeigte Fläche, Inhalt, Ansichts-Modus).
 *
 * @param {Function} fn (paneIdx) => void
 */
export function beobachteCanvasStand(fn) {
  if (typeof fn === 'function') beobachter.add(fn);
}

function meldeStand(paneIdx) {
  for (const fn of beobachter) {
    try {
      fn(paneIdx);
    } catch (err) {
      // Ein Beobachter darf die Fläche nicht mitreißen: Sie zeichnet gerade,
      // und ein Fehler in einer Anzeige daneben ist kein Grund, das Zeichnen
      // abzubrechen.
      console.warn('Canvas-Beobachter fehlgeschlagen:', err);
    }
  }
}

/**
 * Der Stand der Fläche einer Spalte, wie ihn die Karten-Liste braucht.
 *
 * **Die Liste kommt aus dem Dokument-Text und nicht aus der Ansicht**, denn sie
 * soll auch dann etwas zeigen, wenn das Dokument gerade nicht in der
 * Canvas-Ansicht steht (AK8: das Bestätigen führt dann erst dorthin). Welche
 * Fläche gezeigt wird und was gewählt ist, weiß dagegen nur die Ansicht — und
 * auch nur dann, wenn sie offen ist.
 *
 * @param {number} paneIdx
 * @returns {{hatDokument: boolean, inAnsicht: boolean, aenderbar: boolean,
 *   verfuegbar: boolean, flaechen: number, liste: Array<object>,
 *   gewaehlt: string|null}}
 */
export function canvasListenStand(paneIdx) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const inAnsicht = !!(tab && tab.viewMode === 'canvas' && ansichten[paneIdx]);
  const stand = {
    hatDokument: !!tab,
    inAnsicht,
    aenderbar: istAenderbar(paneIdx),
    // E9: Ohne Fläche im Dokument gibt es die Canvas-Ansicht nicht; das Panel
    // sagt dann, warum das Bestätigen eines Eintrags nichts bewirkt.
    verfuegbar: istCanvasModusVerfuegbar(tab),
    flaechen: 0,
    liste: [],
    gewaehlt: null,
  };
  if (!tab || typeof tab.content !== 'string') return stand;
  const flaechen = canvasZustandAus(tab.content).flaechen;
  stand.flaechen = flaechen.length;
  if (flaechen.length === 0) return stand;
  const zeiger = inAnsicht ? ansichten[paneIdx].getStats() : null;
  const gezeigt = flaechen[zeiger ? zeiger.gewaehlt : 0] || flaechen[0];
  stand.liste = canvasListe(gezeigt.model);
  stand.gewaehlt = zeiger
    ? zeiger.gewaehlteKarte ||
      zeiger.gewaehlteForm ||
      zeiger.gewaehlteGruppe ||
      zeiger.gewaehlteLinie ||
      null
    : null;
  return stand;
}

/**
 * Wählt ein Element der gezeigten Fläche und rückt es zentriert in den
 * Ausschnitt (4T-001769). Ohne offene Canvas-Ansicht gibt es nichts zu zeigen.
 *
 * **`null` als Kennung hebt die Auswahl auf** (4T-001770): Escape in der
 * Karten-Liste wählt ab, wie es der Klick auf den Hintergrund der Fläche tut.
 * Ohne Hinweis und ohne Änderbarkeits-Prüfung — Auswählen und Abwählen fassen
 * das Dokument nicht an (Fortschreibung von E3 vom 2026-09-10).
 *
 * @param {number} paneIdx
 * @param {string|null} id Kennung des Elements.
 * @returns {boolean}
 */
export function zeigeCanvasElement(paneIdx, id) {
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  const ansicht = ansichten[paneIdx];
  if (!tab || tab.viewMode !== 'canvas' || !ansicht) return false;
  return ansicht.zeigeElement(id) === true;
}

/**
 * Führt eine Handlung der Karten-Liste an einem Element der Fläche aus
 * (4T-001770): die Rohtext-Eingabe, das Löschen, das Kontextmenü an der Stelle
 * eines Listen-Eintrags oder die neue Verbindung zu einer Gegenstelle.
 *
 * Läuft über den **gemeinsamen Eintritt der Flächen-Kommandos** und damit über
 * dessen drei Bedingungen: Canvas-Ansicht offen, Fläche vorhanden, Dokument
 * änderbar. Jede von ihnen wird gesagt statt still verworfen — auch beim
 * Kontextmenü, denn ein Menü, das auf eine Taste hin gar nicht erscheint, wäre
 * für den Anwender von einem Fehler nicht zu unterscheiden.
 *
 * @param {number} paneIdx
 * @param {string|null} id Kennung des Elements; `null` meint die Fläche selbst.
 * @param {object} handlung Siehe `zeigeElement` der Karten-Bedienung.
 * @returns {boolean}
 */
export function handleCanvasElement(paneIdx, id, handlung) {
  return anDerFlaeche(paneIdx, (ansicht) => ansicht.zeigeElement(id, handlung));
}

/**
 * Zeichnet die Canvas der Spalte neu. Der Aufruf ist synchron und damit so
 * billig wie das Rendern der Lese-Ansicht.
 */
export function renderCanvas(paneIdx) {
  if (!umgebung) return;
  const tab = umgebung.aktivesDokument(paneIdx);
  if (!tab || tab.viewMode !== 'canvas') return;
  const ansicht = ansichtFuer(paneIdx);
  if (!ansicht) return;

  const { flaechen, hinweis, hinweisWerte } = canvasZustandAus(tab.content);
  ansicht.setFlaechen(flaechen, { pfad: tab.path || '', hinweis, hinweisWerte });
}

// Zuletzt gemeldete Verfügbarkeit je Spalte; siehe pruefeVerfuegbarkeit.
const verfuegbar = [];

// 4T-001653: Seit der Anordnung vom 2026-09-09 hängt die Auswählbarkeit des
// Modus am Dokument — also muss sie nachziehen, sobald der Nutzer die Fence
// schreibt oder löscht. Der Abgleich läuft im 200-ms-Takt der Canvas und
// meldet **nur den Wechsel**: Der Menü-Zustand geht über die Prozess-Brücke,
// und ihn im Tipp-Takt zu senden wäre die teurere Hälfte dieser Regel.
function pruefeVerfuegbarkeit(paneIdx) {
  if (!umgebung) return;
  const tab = umgebung.aktivesDokument(paneIdx);
  const jetzt = istCanvasModusVerfuegbar(tab);
  if (verfuegbar[paneIdx] === jetzt) return;
  verfuegbar[paneIdx] = jetzt;
  if (typeof umgebung.beiVerfuegbarkeitsWechsel === 'function') {
    umgebung.beiVerfuegbarkeitsWechsel(paneIdx, jetzt);
  }
}

/** Verzögerte Aktualisierung nach einer Dokument-Änderung. */
export function scheduleCanvasRender(paneIdx) {
  if (timer[paneIdx]) clearTimeout(timer[paneIdx]);
  timer[paneIdx] = setTimeout(() => {
    timer[paneIdx] = null;
    pruefeVerfuegbarkeit(paneIdx);
    renderCanvas(paneIdx);
    // 4T-001769: Die Karten-Liste zeigt die Fläche auch dann, wenn das Dokument
    // gerade nicht in der Canvas-Ansicht steht — dort kommt keine Meldung aus
    // dem Zeichnen, weil `renderCanvas` vorher aussteigt.
    meldeStand(paneIdx);
  }, CANVAS_RENDER_DEBOUNCE_MS);
}

/**
 * Wählt in der Canvas-Ansicht der Spalte die Fläche, deren Fence an der
 * angegebenen Zeile beginnt (4T-001668).
 *
 * Der Zugang im Block außerhalb der Canvas-Ansicht kennt seine Fence nur über
 * ihre Stelle im Dokument — dieselbe Kennung, mit der die Ansicht eine Fläche
 * über eine Live-Aktualisierung hinweg wiederfindet (`findeWieder`). Deshalb
 * die Stelle und nicht die laufende Nummer: Sie übersteht eine Änderung an
 * einer anderen Fläche unbeschadet.
 *
 * @param {number} paneIdx
 * @param {number} startZeile 1-basierte Zeile der öffnenden Zaun-Zeile.
 * @returns {boolean} `true`, wenn eine Fläche zu dieser Stelle gefunden wurde.
 */
export function waehleCanvasFlaecheAbZeile(paneIdx, startZeile) {
  const ansicht = ansichten[paneIdx];
  const tab = umgebung ? umgebung.aktivesDokument(paneIdx) : null;
  if (!ansicht || !tab) return false;
  const index = canvasZustandAus(tab.content).flaechen.findIndex(
    (f) => f.startZeile === startZeile,
  );
  if (index < 0) return false;
  ansicht.waehleFlaeche(index);
  return true;
}

/** Passt die Fläche der Spalte in das Sichtfenster ein. */
export function fitCanvas(paneIdx) {
  const ansicht = ansichten[paneIdx];
  if (ansicht) ansicht.fit();
}

/**
 * Holt den Tastatur-Fokus auf die Fläche der Spalte (4T-001654).
 *
 * Gerufen beim Eintritt in die Ansicht. Der Editor ist dort per CSS versteckt
 * und verliert den Fokus an den Dokument-Rumpf; ohne diesen Griff läge der
 * Fokus nirgends, und weder `Entf` noch `Strg+Z` erreichten die Fläche. Ein
 * eigener Aufruf statt eines Seiteneffekts von `fitCanvas`: Beide Schritte
 * fallen zwar am selben Ort an, sagen aber Verschiedenes.
 */
export function fokussiereCanvas(paneIdx) {
  const ansicht = ansichten[paneIdx];
  if (ansicht) ansicht.fokussiere();
}

/**
 * Löst die Ansicht einer Spalte. Wird beim Verlassen des Modus gerufen, damit
 * weder Zeitgeber noch Fenster-Listener zurückbleiben.
 */
export function destroyCanvas(paneIdx) {
  if (timer[paneIdx]) {
    clearTimeout(timer[paneIdx]);
    timer[paneIdx] = null;
  }
  const ansicht = ansichten[paneIdx];
  if (ansicht) {
    ansicht.destroy();
    ansichten[paneIdx] = null;
  }
}
