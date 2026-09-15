// 4T-001747 (Epic 3E-000289): Der Körper einer Karte auf der Canvas-Fläche —
// ihr eigener Text und, seit der Grammatik G7, der angezeigte Inhalt eines
// verwiesenen Dokuments.
//
// **Warum beide Körper-Formen hier stehen und nicht in canvas-view.js.** Die
// Verzweigung zwischen ihnen ist die Aussage dieses Moduls: Eine Karte zeigt
// entweder eigenen Text oder fremden Inhalt (Leitplanke 2 des Product Owners
// vom 2026-09-09). Die Zeichnung der Fläche behält daneben, was ihr gehört —
// die Schleife über die Element-Ebene, Lage, Größe und Griff. Der Schnitt war
// zugleich geboten: `canvas-view.js` lag mit 474 Code-Zeilen dicht am Budget
// von 500, und der Einbettungs-Weg samt Kopfzeile, Auffrischung und
// Befund-Darstellung hätte es gerissen.
//
// **Die Anzeige ist die Einbettung des Bestands, in eine Karte gestellt.** Der
// Weg ist derselbe wie in `renderMarkdownEmbed` (render-mermaid.js): Abruf über
// `api.readEmbedFile`, Rendern mit unterdrückter Frontmatter-Zeile, der
// Schritt-Satz des erzeugten Teilbaums, `data-embed-base` am Körper. Gerufen
// wird der Abruf hier über den **injizierten** Rückruf `leseEinbettung` — ein
// Import von `api` oder `render-mermaid.js` zöge den Canvas-Ordner in den
// großen Datei-Zyklus des Renderers, den der Ordner-Import-Wächter als Ratsche
// eingefroren hat (Injektions-Bauweise E4 wie bei allen Nachbarn).
//
// **Der Abruf ist asynchron, die Zeichnung der Fläche ist es nicht.** Die Karte
// entsteht deshalb sofort mit Kopfzeile und leerem Körper; die Antwort füllt
// den Körper nach, ohne die Fläche neu zu zeichnen — Auswahl, Ausschnitt und
// Scroll-Stand bleiben damit unangetastet. Eine Antwort, deren Karte inzwischen
// weg ist, wird verworfen (`isConnected`).
//
// **Verschachtelte Einbettungen im verwiesenen Text werden nicht aufgelöst.**
// Das ist Bestands-Verhalten jedes Teilbaums (`einbettungen: false` in
// `applyTeilbaumSchritte`) und kein neues Versprechen; es wird benannt und
// nicht überspielt.
//
// 4T-001748 (Epic 3E-000289): Die **Bild-Karte** kommt als dritte Körper-Form
// hinzu (G8). Sie folgt demselben Aufbau — Kopfzeile, Körper, asynchron
// nachgefüllt —, holt ihren Inhalt aber über den Bild-Einbettungs-Weg
// (`embed:readImage`, Daten-Adresse) und passt ihn mit erhaltener Proportion in
// den Körper ein, statt in ihm zu scrollen: Ein halb abgeschnittenes Bild wäre
// nutzlos, ein eingepasstes ist es nicht (Leitplanke 3, angewandt auf einen
// Inhalt ohne Lese-Richtung). `doc=` gewinnt vor `bild=` — das entscheidet der
// Kern, und die Verzweigung hier liest allein das Ergebnis.
'use strict';

// Die Inhalts-Zeilen eines Elements als Beschriftung — dieselbe Regel wie bei
// Verbindung, Form und Gruppe. Eine zweite Fassung mit demselben Rumpf wäre ein
// zweiter Ort für dieselbe Aussage.
import { beschriftungsZeilen } from './canvas-linien.js';
// 4T-001748: Der Name, mit dem eine Bild-Karte ohne Beschriftung benennbar
// bleibt. Die Regel — der Dateiname, nicht der Ordner — steht im Kern, weil
// Flächen-Titel und Karten-Vorschau dieselbe Frage stellen; eine zweite
// Fassung hier liefe bei der nächsten Ergänzung auseinander.
import { kartenVerweisText } from '../../../shared/canvas/canvas-core.js';

// Auffrisch-Handlung je gezeichnetem Verweis-Körper. Eine WeakMap statt einer
// Eigenschaft am DOM-Knoten: Der Eintrag verschwindet mit dem Knoten, und ein
// Neuzeichnen der Fläche hinterlässt keinen Rest.
const AUFFRISCHER = new WeakMap();

// 4T-001747 (Epic 3E-000289): Endung einer Markdown-Datei, wie sie der
// Einbettungs-Auflöser des Bestands kennt. Derselbe Satz wie im Wiki-Plugin
// (`src/shared/markdown/plugins/wiki.js`) und in der Endungs-Positivliste von
// `embed:read`; er steht hier als eigene Zeile und nicht als Import, weil ein
// Bezug des Canvas-Ordners auf `shared/markdown/` eine neue Ordner-Kante
// zöge, die der Ordner-Import-Wächter als Ratsche misst.
const MD_ENDUNG = /\.(md|markdown|mdown|mkd)$/i;
// Irgendeine Endung — dieselbe Erkennung wie im Wiki-Plugin. Wer eine hat,
// bekommt keine zweite angehängt.
const IRGENDEINE_ENDUNG = /\.[a-z0-9]+$/i;

/**
 * Zerlegt eine Verweis-Angabe in Ziel, Anker und Abruf-Pfad (G7).
 *
 * Das Ziel nimmt dieselben Formen wie das Ziel einer Einbettung `![[…]]`; der
 * Anker steht hinter dem ersten `#` und behält sein `^` einer Block-Kennung,
 * weil der Auflöser des Bestands ihn genau so erwartet.
 *
 * **Warum es zwei Fassungen des Ziels gibt** (Abnahme-Befund des Product
 * Owners vom 2026-09-14). `ziel` ist der Text, wie der Anwender ihn
 * geschrieben hat — er steht in der Kopfzeile und im Befund. `pfad` ist die
 * Fassung für den Abruf: Der Auflöser `embed:read` prüft die Endung gegen eine
 * Positivliste und weist alles ohne Markdown-Endung mit
 * `extension not allowed` ab. Das Wiki-Plugin hängt vor dem Abruf `.md` an
 * (`if (!ext) finalPath = pathPart + '.md'`), und dieselbe Regel gilt hier:
 * Ohne sie zeigte jede Verweis-Karte auf einen Dokument-Namen ohne Endung —
 * also auf die übliche Schreibweise — den Befund «Ziel nicht gefunden», obwohl
 * die Datei danebenlag.
 *
 * @param {string} [doc] Wert der Angabe `doc=`.
 * @returns {{ziel: string, anker: string, pfad: string}}
 */
export function zerlegeZiel(doc) {
  const text = String(doc == null ? '' : doc);
  const trenner = text.indexOf('#');
  const ziel = trenner < 0 ? text : text.slice(0, trenner);
  const anker = trenner < 0 ? '' : text.slice(trenner + 1);
  return { ziel, anker, pfad: abrufPfad(ziel) };
}

// Die Abruf-Fassung eines Ziels: ohne Endung wird `.md` angehängt, eine
// vorhandene bleibt unangetastet. Eine fremde Endung wird bewusst NICHT
// ersetzt — `doc=` meint ein Markdown-Dokument, und der Auflöser soll eine
// `doc="Bild.png"` weiterhin abweisen statt sie stillschweigend umzudeuten.
function abrufPfad(ziel) {
  const text = String(ziel || '').trim();
  if (text === '') return text;
  if (MD_ENDUNG.test(text) || IRGENDEINE_ENDUNG.test(text)) return text;
  return `${text}.md`;
}

/**
 * Die Beschriftung einer Karte als einfacher Text (Entscheidung F1 des Product
 * Owners vom 2026-09-12).
 *
 * **Vollständig und einzeilig gemacht, nicht gekürzt.** Der Anwender hat sie
 * geschrieben, damit sie dasteht; Zeilenumbrüche werden zu Leerzeichen, weil
 * die Kopfzeile eine Zeile ist, und der Umbruch bei Bedarf ist Sache des
 * Stilblatts.
 */
export function kartenBeschriftung(el) {
  return beschriftungsZeilen(el || {})
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Die Bild-Angabe einer Karte, wie sie dasteht (4T-001748, G8).
 *
 * **Warum der verworfene Rohtext mitkommt.** Der Kern lässt `el.bild` leer,
 * wenn die Angabe keine zulässige Bild-Endung trägt (Befund
 * `ungueltigeBildEndung`); ihr **Rohtext** bleibt in `attrs` und in der Datei
 * stehen (G1). Die Anzeige braucht beides: den geprüften Wert, um das Bild zu
 * holen, und den verworfenen, um den Befund mit dem Namen zu nennen, den der
 * Anwender geschrieben hat. Ohne ihn stünde dort eine gewöhnliche Text-Karte,
 * und der Anwender bekäme auf einen Tippfehler gar keine Antwort.
 *
 * @returns {{wert: string, gueltig: boolean}}
 */
function bildAngabe(el) {
  if (el && el.bild) return { wert: String(el.bild), gueltig: true };
  const roh = el && el.attrs && el.attrs.bild != null ? String(el.attrs.bild) : '';
  return { wert: roh, gueltig: false };
}

/**
 * Baut das Innere einer Karte: Kopfzeile und Einbettungs-Körper bei einer
 * Verweis-Karte, Kopfzeile und eingepasstes Bild bei einer Bild-Karte, sonst
 * den gerenderten eigenen Text.
 *
 * Die Reihenfolge der Zweige ist die Rangfolge aus G8: `doc=` gewinnt, und ein
 * daneben stehendes `bild=` bleibt vollständig unbeachtet.
 *
 * @param {HTMLElement} karte Das `<article class="canvas-karte">`.
 * @param {object} el Element der Art `karte` aus dem Modell des Kerns.
 * @param {object} [ctx]
 * @param {Function} [ctx.t] Übersetzungs-Funktion (injiziert).
 * @param {string} [ctx.pfad] Pfad des Dokuments, das die Fläche trägt.
 * @param {Function} [ctx.renderMarkdown] (text, pfad, optionen) => HTML.
 * @param {Function} [ctx.nachRender] (container, pfad) => void.
 * @param {Function} [ctx.leseEinbettung] (basisPfad, ziel, anker) =>
 *   Promise<{ok, path, displayPath, content}>. Fehlt der Rückruf, zeigt die
 *   Verweis-Karte ihren Befund — genau der Stand der Zeichnungs-Prüffälle.
 * @param {Function} [ctx.leseBild] (basisPfad, bild) => Promise<{ok, path,
 *   dataUrl}> (4T-001748). Fehlt der Rückruf, zeigt die Bild-Karte ihren
 *   Befund, aus demselben Grund.
 */
export function baueKartenInneres(karte, el, ctx = {}) {
  if (el && el.doc) baueVerweisKarte(karte, el, ctx);
  else if (bildAngabe(el).wert.trim() !== '') baueBildKarte(karte, el, ctx);
  else baueTextKarte(karte, el, ctx);
}

function koerper(klassen) {
  const knoten = document.createElement('div');
  // `markdown-body` bringt die Typografie der Lese-Ansicht mit; ohne sie sähe
  // derselbe Text in der Karte anders aus als im Dokument.
  knoten.className = klassen;
  return knoten;
}

function baueTextKarte(karte, el, ctx) {
  const inhalt = koerper('canvas-karte-inhalt markdown-body');
  const text = (el && el.inhalt) || '';
  if (typeof ctx.renderMarkdown === 'function') {
    try {
      inhalt.innerHTML = ctx.renderMarkdown(text, ctx.pfad || '');
      // Der Karten-Inhalt ist ein erzeugter Teilbaum: Ohne den Schritt-Satz
      // bliebe alles inert, was die Render-Pipeline erst befüllt oder bedienbar
      // macht (Wächter 4T-001130).
      if (typeof ctx.nachRender === 'function') ctx.nachRender(inhalt, ctx.pfad || '');
    } catch {
      // Ein Render-Fehler darf die ganze Fläche nicht leeren; die Karte zeigt
      // dann ihren Klartext.
      inhalt.textContent = text;
    }
  } else {
    inhalt.textContent = text;
  }
  karte.appendChild(inhalt);
}

function baueVerweisKarte(karte, el, ctx) {
  karte.classList.add('canvas-karte-verweis');
  const kopf = document.createElement('div');
  kopf.className = 'canvas-karte-kopf';
  karte.appendChild(kopf);
  // Die Klasse `wiki-embed-md-body` steht hier mit Absicht: Der Körper **ist**
  // ein Einbettungs-Körper nach jedem Merkmal, an dem der Bestand einen
  // erkennt — er trägt den aufgelösten Ziel-Pfad und ist die Auflösungs-Basis
  // für Links darin (link-navigation.js, area.js). Ein zweiter Marker daneben
  // wäre eine zweite Quelle derselben Aussage.
  const inhalt = koerper(
    'canvas-karte-inhalt canvas-karte-koerper markdown-body wiki-embed-md-body',
  );
  karte.appendChild(inhalt);
  setzeKopf(kopf, el, null);
  const auffrischen = () => hole(kopf, inhalt, el, ctx);
  AUFFRISCHER.set(inhalt, auffrischen);
  void auffrischen();
}

// Ein Abruf, eine Antwort. Der Rückruf darf fehlen (Zeichnungs-Prüffall) und
// darf scheitern; beides mündet in denselben Befund-Zweig.
function hole(kopf, inhalt, el, ctx) {
  const { pfad, anker } = zerlegeZiel(el.doc);
  let abruf = null;
  if (typeof ctx.leseEinbettung === 'function') {
    try {
      abruf = ctx.leseEinbettung(ctx.pfad || '', pfad, anker || null);
    } catch {
      abruf = null;
    }
  }
  if (!abruf || typeof abruf.then !== 'function') {
    // Ohne Abruf-Rückruf gibt es nichts abzuwarten, und die Karte hängt noch
    // gar nicht im Baum — die Zeichnung baut sie erst fertig und hängt sie dann
    // ein. Der Befund wird deshalb unmittelbar gesetzt und nicht über den
    // Zweig darunter, der eine **Antwort** auf ihre Aktualität prüft.
    zeigeBefund(kopf, inhalt, el, ctx);
    return Promise.resolve();
  }
  return abruf.then(
    (erg) => uebernimm(kopf, inhalt, el, ctx, erg),
    () => uebernimm(kopf, inhalt, el, ctx, null),
  );
}

function uebernimm(kopf, inhalt, el, ctx, erg) {
  // Die Karte ist inzwischen weg — die Fläche wurde neu gezeichnet, die Karte
  // gelöscht oder die Fläche gewechselt. Die Antwort wird verworfen, statt in
  // einen Baum zu schreiben, den niemand mehr sieht.
  if (!inhalt.isConnected) return;
  if (!erg || !erg.ok) {
    zeigeBefund(kopf, inhalt, el, ctx);
    return;
  }
  inhalt.classList.remove('canvas-karte-verweis-fehlt');
  inhalt.dataset.embedBase = erg.path || '';
  const text = erg.content || '';
  if (typeof ctx.renderMarkdown === 'function') {
    try {
      // Die Frontmatter-Zeile der verwiesenen Datei bleibt unterdrückt, wie in
      // jeder Einbettung (4T-000282).
      inhalt.innerHTML = ctx.renderMarkdown(text, erg.path || '', { frontmatterBlock: false });
      // Der Bezug ist der Pfad der **verwiesenen** Datei: Abfragen und
      // Journal-Blöcke darin beziehen sich auf deren Ort, nicht auf den der
      // Fläche.
      if (typeof ctx.nachRender === 'function') ctx.nachRender(inhalt, erg.path || '');
    } catch {
      inhalt.textContent = text;
    }
  } else {
    inhalt.textContent = text;
  }
  setzeKopf(kopf, el, erg);
}

// Befund «Ziel nicht gefunden»: Die Karte bleibt stehen und nennt ihr Ziel.
// Der Rohtext ist davon unberührt — hier wird nichts geschrieben.
function zeigeBefund(kopf, inhalt, el, ctx) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  delete inhalt.dataset.embedBase;
  inhalt.classList.add('canvas-karte-verweis-fehlt');
  inhalt.textContent = String(t('canvas.verweisNichtGefunden')).replace(
    '{ziel}',
    String(el.doc || ''),
  );
  setzeKopf(kopf, el, null);
}

// Kopfzeile: die Beschriftung, sonst das Ziel (F1). Der aufgelöste Anzeige-Name
// tritt an die Stelle des geschriebenen Ziels, sobald die Antwort da ist; der
// Anker erscheint daneben, weil er die Aussage mitträgt.
function setzeKopf(kopf, el, erg) {
  const eigen = kartenBeschriftung(el);
  const { ziel, anker } = zerlegeZiel(el.doc);
  kopf.textContent = '';
  const name = document.createElement('span');
  name.className = 'canvas-karte-kopf-text';
  name.textContent = eigen || (erg && erg.displayPath ? erg.displayPath : ziel);
  kopf.appendChild(name);
  if (!eigen && anker) {
    const marke = document.createElement('span');
    marke.className = 'canvas-karte-kopf-anker';
    marke.textContent = '#' + anker;
    kopf.appendChild(marke);
  }
  // Der volle Ziel-Text bleibt im Titel erreichbar, auch wenn die Kopfzeile die
  // Beschriftung zeigt.
  kopf.title = eigen ? `${eigen} — ${el.doc}` : String(el.doc || '');
}

// --- Bild-Karte (4T-001748, G8) ----------------------------------------------

// Der Körper einer Bild-Karte. Er trägt **nicht** `markdown-body` und **nicht**
// `wiki-embed-md-body`: In einer Bild-Karte steht kein Markdown, und
// `data-embed-base` bekommt sie nicht — eine Bild-Datei hat keinen Puffer, den
// eine andere geöffnete Ansicht ändern könnte, und die Auffrischung darunter
// hätte an ihr nichts zu tun.
function baueBildKarte(karte, el, ctx) {
  karte.classList.add('canvas-karte-bild-karte');
  const kopf = document.createElement('div');
  kopf.className = 'canvas-karte-kopf';
  karte.appendChild(kopf);
  const inhalt = koerper('canvas-karte-inhalt canvas-karte-koerper canvas-karte-bild-koerper');
  karte.appendChild(inhalt);
  const { wert, gueltig } = bildAngabe(el);
  setzeBildKopf(kopf, el, wert);
  if (!gueltig) {
    // Der Kern hat die Angabe wegen ihrer Endung verworfen; ein Abruf hätte
    // nichts zu holen, und der Befund steht ohne Umweg da.
    zeigeBildBefund(inhalt, ctx, 'canvas.bildKeineBildDatei', wert);
    return;
  }
  void holeBild(inhalt, ctx, wert);
}

// Ein Abruf, eine Antwort — dieselbe Bauart wie bei der Verweis-Karte.
function holeBild(inhalt, ctx, wert) {
  let abruf = null;
  if (typeof ctx.leseBild === 'function') {
    try {
      abruf = ctx.leseBild(ctx.pfad || '', wert);
    } catch {
      abruf = null;
    }
  }
  if (!abruf || typeof abruf.then !== 'function') {
    zeigeBildBefund(inhalt, ctx, 'canvas.bildNichtGefunden', wert);
    return Promise.resolve();
  }
  return abruf.then(
    (erg) => uebernimmBild(inhalt, ctx, wert, erg),
    () => uebernimmBild(inhalt, ctx, wert, null),
  );
}

function uebernimmBild(inhalt, ctx, wert, erg) {
  // Die Karte ist inzwischen weg: Die Antwort wird verworfen, statt in einen
  // Baum zu schreiben, den niemand mehr sieht.
  if (!inhalt.isConnected) return;
  if (!erg || !erg.ok || !erg.dataUrl) {
    zeigeBildBefund(inhalt, ctx, befundSchluessel(erg && erg.error), wert);
    return;
  }
  inhalt.classList.remove('canvas-karte-verweis-fehlt');
  inhalt.textContent = '';
  const bild = document.createElement('img');
  bild.className = 'canvas-karte-bild';
  bild.alt = '';
  // Der **aufgelöste** Pfad, wie am Bild einer Einbettung (`renderImageEmbed`):
  // Nach der Namens-Suche ist er ein anderer als der geschriebene, und gemeint
  // ist die gefundene Datei.
  bild.dataset.srcOriginal = erg.path || wert;
  // Daten-Adresse statt `file://`: Die Inhalts-Sicherheits-Regel der Anwendung
  // lässt als Bild-Quelle nur `self` und `data:` zu.
  bild.src = erg.dataUrl;
  inhalt.appendChild(bild);
}

/**
 * Der Befund-Text zu einer abschlägigen Antwort des Bild-Abrufs (4T-001748).
 *
 * **Drei Fälle statt eines**, weil sie eine verschiedene Abhilfe haben: Wer die
 * Datei hat und sie nur verkleinern muss, soll nicht nach ihr suchen. Die
 * Kennungen sind die des Bestands-Auflösers (`embed:readImage` meldet
 * `too large` für die Größen-Grenze und `extension not allowed` für eine
 * Endung außerhalb seiner Positivliste); alles Übrige — ein nicht gefundenes
 * Ziel, ein Ausbruch aus dem Bereich, ein Lesefehler — endet beim gesuchten
 * Namen, weil der Anwender in allen diesen Fällen dieselbe Frage hat.
 *
 * **Warum die Endungs-Regel überhaupt zweimal zuschlagen kann:** Der Satz der
 * Grammatik (`BILD_ENDUNGEN`) führt `ico`, die Positivliste des Auflösers
 * nicht. Eine `.ico` passiert deshalb den Kern und scheitert erst hier — und
 * bekommt genau denselben Hinweis wie eine im Kern verworfene Endung, denn für
 * den Anwender ist es dieselbe Auskunft.
 */
function befundSchluessel(fehler) {
  if (fehler === 'too large') return 'canvas.bildZuGross';
  if (fehler === 'extension not allowed') return 'canvas.bildKeineBildDatei';
  return 'canvas.bildNichtGefunden';
}

// Befund einer Bild-Karte: Die Karte bleibt stehen und nennt den Namen, den der
// Anwender geschrieben hat. Der Rohtext ist davon unberührt — hier wird nichts
// geschrieben. Die Kennzeichnung ist dieselbe wie bei der Verweis-Karte; es ist
// dieselbe Aussage, und zwei Erscheinungsbilder dafür wären zwei Sprachen.
function zeigeBildBefund(inhalt, ctx, schluessel, wert) {
  const t = typeof ctx.t === 'function' ? ctx.t : (key) => key;
  inhalt.classList.add('canvas-karte-verweis-fehlt');
  inhalt.textContent = String(t(schluessel)).replace('{ziel}', String(wert));
}

// Kopfzeile einer Bild-Karte: die Beschriftung, sonst der **Name** der
// Bild-Datei (F1). Welcher Text das ist, sagt der Kern — sein Ordner ist Ablage
// und keine Aussage, weil ein Bild im Bereich über seinen Namen gefunden wird.
function setzeBildKopf(kopf, el, wert) {
  const eigen = kartenBeschriftung(el);
  kopf.textContent = '';
  const name = document.createElement('span');
  name.className = 'canvas-karte-kopf-text';
  name.textContent = eigen || kartenVerweisText({ bild: wert });
  kopf.appendChild(name);
  // Der volle Wert bleibt im Titel erreichbar, auch wenn die Kopfzeile die
  // Beschriftung zeigt.
  kopf.title = eigen ? `${eigen} — ${wert}` : String(wert);
}

/**
 * Frischt die Verweis-Karten auf, die auf eine bestimmte Datei zeigen
 * (4T-001747, AK8).
 *
 * **Warum eine eigene Funktion neben `refreshEmbedsOfTarget`.** Jene sucht die
 * Hülle `.wiki-embed` über dem Körper und findet an einer Canvas-Karte keine —
 * die Karte **ist** die Hülle. Sie ruft diese Funktion deshalb zusätzlich auf,
 * statt ihre eigene Schleife um einen Sonderfall zu erweitern; der Abruf einer
 * Karte läuft über den injizierten Rückruf, den nur dieses Modul kennt.
 *
 * @param {HTMLElement} wurzel Teilbaum, in dem gesucht wird (Spalten-Wurzel).
 * @param {string} zielPfad Aufgelöster Pfad der geänderten Datei.
 * @returns {Promise<number>} Zahl der aufgefrischten Karten.
 */
export async function frischeVerweisKarten(wurzel, zielPfad) {
  if (!wurzel || !zielPfad || typeof wurzel.querySelectorAll !== 'function') return 0;
  const ziel = String(zielPfad).toLowerCase();
  const laeufe = [];
  for (const inhalt of wurzel.querySelectorAll('.canvas-karte-koerper[data-embed-base]')) {
    if (String(inhalt.dataset.embedBase || '').toLowerCase() !== ziel) continue;
    const erneut = AUFFRISCHER.get(inhalt);
    if (erneut) laeufe.push(erneut());
  }
  await Promise.all(laeufe);
  return laeufe.length;
}
