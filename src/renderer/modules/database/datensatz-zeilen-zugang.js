// 4T-001792 (Epic 3E-000255, E10.14): Der Zugang von der Datensatz-Zeile zu
// den Änderungsbelegen dieses Datensatzes — Variante 1 der Entscheidung des
// Product Owners vom 2026-09-18, eine kleine Schaltfläche am Zeilen-Anfang.
//
// Das Markup baut die Pipeline (`src/shared/markdown/perspective-records-html.js`,
// Bauplan Z1); hier kommt allein die Bedienung dazu. Die Trennung ist dieselbe
// wie beim Canvas-Block: Was Lese-Ansicht und Änderungs-Modus gleich zeigen
// sollen, entsteht in der Pipeline, und was nur im Anzeige-Prozess möglich ist,
// bindet ein Modul für **beide** Ansichten (Bauplan S12 und Z2).
//
// **Ein Handler für beide Ansichten, nicht zwei** (Bauplan S12, Vorbild
// `canvas/canvas-block-zustand.js`): `MarkdownBlockWidget.ignoreEvent()` liefert
// `true`, weshalb CodeMirror kein Zeiger-Ereignis aus dem Widget an seine
// zentralen Handler gibt. Der Block bindet seinen Klick-Pfad deshalb selbst, und
// derselbe Pfad trägt die Lese-Ansicht mit; das Muster von
// `live/live-table-klick.js` taugt hier ausdrücklich nicht, weil es ohne Editor
// bewusst aussetzt.
//
// **Gehört wird auf `click` und nicht auf `mousedown`** (Bauplan S12), damit
// Eingabe- und Leertaste die Schaltfläche auslösen; der native Klick einer
// Tastatur-Auslösung ist ein `click` und kein `mousedown`. Daneben steht ein
// `mousedown`-Zuhörer, der allein den Maus-Weg bremst: Ohne ihn setzte der
// Browser die Schreibmarke in die Fence, und der Block klappte im Live-Modus
// zum Quelltext auf, noch bevor die Seite offen ist.
//
// **Warum die Umgebung injiziert und nicht importiert wird** (Muster
// `initCanvasBlock`): Ein statischer Import von `beleg-ansicht-seite.js` oder
// `app/app-state.js` zöge dieses Modul samt der Beleg-Seite in den
// eingefrorenen Datei-Zyklus des Anzeige-Prozesses, und der
// Ordner-Import-Wächter ist eine Ratsche. Am 2026-09-18 am Wächter gemessen:
// Der direkte Weg meldet zwei Dateien außerhalb der eingefrorenen
// Bestands-Komponente, der eingereichte Weg bleibt grün. Dieses Modul
// importiert deshalb gar nichts; verdrahtet wird es in `app-init.js`, das in
// jener Komponente liegt.
//
// 4T-001939 (Epic 3E-000257, Bauplan B7): Zwei Schaltflächen je Zeile und ein
// Fuß je Block. Neben der Beleg-Schaltfläche steht «Datensatz öffnen», unter
// der Tabelle «Neuer Datensatz»; alle drei laufen über denselben Klick-, Maus-
// und Tastatur-Weg, und die Umgebung reicht die beiden neuen Einstiege
// (`oeffneMaske`, `neuerDatensatz`) ebenso herein wie den der Belege. Der
// Tabulator-Stopp bleibt einer je Tabelle; Auf und Ab wechseln die Zeile und
// behalten die Art der Schaltfläche, Links und Rechts wechseln zwischen den
// beiden Schaltflächen einer Zeile.
'use strict';

// Injizierte Umgebung; siehe Modul-Kopf.
let umgebung = null;

/**
 * Verdrahtet den Zeilen-Zugang mit Fenster-Zustand und Beleg-Ansicht.
 *
 * @param {object} zugang
 * @param {Function} zugang.aktivesDokument (paneIdx) => geöffnetes Dokument
 *   oder null. Geliefert wird der aktive Reiter der Spalte.
 * @param {Function} zugang.oeffneBelege (tabellenPfad, kennung) => void.
 *   Öffnet die lesende Beleg-Ansicht; ihr eigenes Tor für den Aus-Zustand der
 *   Erweiterung «Datenbank» liegt dort und nicht hier.
 * @param {Function} [zugang.oeffneMaske] (tabellenPfad, kennung) => void.
 *   Öffnet die Einzel-Maske des Datensatzes (4T-001939); ihr Tor liegt dort.
 * @param {Function} [zugang.neuerDatensatz] (tabellenPfad) => void. Eröffnet
 *   eine Neuanlage und öffnet die Maske mit der gezogenen Kennung (4T-001939).
 */
export function initRecordRowAccess(zugang) {
  umgebung = zugang || null;
}

// Die Hüllen, in denen ein Datensatz-Block **nicht** das Dokument des aktiven
// Reiters zeigt (Bauplan Z4). Erhoben am Bestand am 2026-09-18: Ein
// Datensatz-Block erscheint als Tabelle nur dort, wo die Feld-Definition aus
// dem Frontmatter seiner eigenen Datei mitkommt — also in der Wiki-Einbettung
// (eigene Datei) und in einer Verweis-Karte der Canvas (ebenfalls eigene
// Datei). Die Ausgabe eines Skript-Blocks rendert erzeugten Text ohne
// Frontmatter und zeigt deshalb heute keine Tabelle; sie steht hier trotzdem,
// weil «im Zweifel passiv» gilt und ein Skript künftig ein Frontmatter
// ausgeben könnte.
const PASSIV_HUELLEN = '.wiki-embed-md-body, .perspective-script-md';

// Die beiden Orte, an denen der Block das Dokument des aktiven Reiters zeigt:
// der gerenderte Haupt-Container der Spalte und ihr Haupt-Editor. Alles
// andere — Notiz-Vorschau in der Seitenleiste, Canvas-Fläche, System-Seite,
// Handbuch-Seite — fällt damit von selbst heraus, ohne je einzeln benannt zu
// werden. Das ist der Unterschied zu einer Verbots-Liste: Eine neue
// Anzeige-Stelle ist zuerst passiv und nicht zuerst falsch.
const AKTIVE_ORTE = '.pane-rendered .markdown-body, .pane-source';

/**
 * Spalten-Index eines Blocks. Die Spalten-Gruppe umschließt Editor und
 * Lese-Ansicht, weshalb **ein** Weg für beide Herkünfte genügt (Muster
 * `events-editor.js`, `perspective-datatable-editor.js`).
 *
 * @param {Element} el
 * @returns {number} Index oder -1.
 */
export function spalteZu(el) {
  const gruppe = el && el.closest ? el.closest('.pane-group') : null;
  if (!gruppe) return -1;
  const idx = parseInt(gruppe.dataset.pane, 10);
  return Number.isFinite(idx) ? idx : -1;
}

/**
 * Zeigt dieser Block das Dokument des aktiven Reiters seiner Spalte?
 *
 * **Im Zweifel passiv** (Bauplan Z4). Der Pfad des aktiven Reiters wäre in
 * jeder anderen Umgebung der falsche, und eine Schaltfläche, welche die Belege
 * einer **anderen** Datei öffnete, wäre schlimmer als keine.
 *
 * @param {Element} block
 * @returns {boolean}
 */
export function istAktiverOrt(block) {
  if (!block || typeof block.closest !== 'function') return false;
  if (block.closest(PASSIV_HUELLEN)) return false;
  return !!block.closest(AKTIVE_ORTE);
}

/**
 * Pfad der Tabellen-Datei zu einem Block (Bauplan Z3).
 *
 * **Ein Weg für beide Ansichten** statt der zwei aus Bauplan S12: über den
 * umschließenden Spalten-Container zum aktiven Reiter und zu dessen Pfad. Das
 * führt zum selben Ergebnis, weil der Editor der Spalte genau den aktiven
 * Reiter bearbeitet.
 *
 * Eine System- oder Handbuch-Seite und ein Reiter ohne Pfad ergeben `null`:
 * Beide haben keine Datei, neben der eine Beleg-Datei liegen könnte.
 *
 * @param {Element} block
 * @returns {string|null}
 */
export function tabellenPfadZu(block) {
  if (!umgebung || typeof umgebung.aktivesDokument !== 'function') return null;
  const idx = spalteZu(block);
  if (idx < 0) return null;
  const tab = umgebung.aktivesDokument(idx);
  if (!tab || tab.systemPage || tab.manualPage) return null;
  return typeof tab.path === 'string' && tab.path !== '' ? tab.path : null;
}

// 4T-001939: Die beiden Arten der Zeilen-Schaltfläche, in der Reihenfolge der
// Zeile, und der Griff im Fuß des Blocks.
const ZEILEN_KNOEPFE = '.prc-open-btn, .prc-history-btn';
const ART_KNOEPFE = ['.prc-open-btn', '.prc-history-btn'];
const FUSS_KNOPF = '.prc-new-btn';

// Alle Zeilen-Schaltflächen einer Tabelle in Dokument-Reihenfolge.
function schaltflaechen(block) {
  return Array.from(block.querySelectorAll(ZEILEN_KNOEPFE));
}

// Die Schaltflächen derselben Art wie `knopf`, in Dokument-Reihenfolge; sie
// sind die Reihe, in der Auf, Ab, Pos1 und Ende wandern.
function gleicheArt(block, knopf) {
  const art = ART_KNOEPFE.find((sel) => knopf.matches(sel));
  return art ? Array.from(block.querySelectorAll(art)) : [];
}

// 4T-001939: Der Stopp, den der Anwender ohne eigenes Zutun vorfindet, bleibt
// die erste Beleg-Schaltfläche, wie vor der zweiten Art. Damit ändert sich für
// den bisherigen Tastatur-Weg nichts; die Maske erreicht er mit Links.
function vorgabeStopp(knoepfe) {
  return knoepfe.find((knopf) => knopf.matches('.prc-history-btn')) || knoepfe[0] || null;
}

// 4T-001792 (Bauplan Z5): Genau **eine** Schaltfläche je Tabelle steht in der
// Tabulator-Folge; die Pfeiltasten wechseln die Zeile und nehmen den Stopp mit.
// Zweitausend Tabulator-Stopps wären keine Erreichbarkeit, sondern eine
// Tastatur-Falle.
//
// Gesetzt wird der Stopp bei **jedem** Anwenden neu, nicht nur beim Binden:
// Ein Cache-Klon des Live-Widgets bringt das Markup mit lauter `-1` zurück,
// und ohne diesen Schritt wäre die Tabelle danach gar nicht mehr erreichbar.
function setzeTabulatorStopp(knoepfe, ziel) {
  if (knoepfe.length === 0) return;
  const gewaehlt = ziel && knoepfe.includes(ziel) ? ziel : vorgabeStopp(knoepfe);
  for (const knopf of knoepfe) {
    knopf.setAttribute('tabindex', knopf === gewaehlt ? '0' : '-1');
  }
}

// Fokus-Wechsel der Pfeil-, Pos1- und Ende-Tasten. Der Tabulator-Stopp wandert
// mit, damit ein späterer Tabulator-Sprung dort wieder ankommt, wo der Anwender
// zuletzt war.
//
// 4T-001939: `reihe` ist die Folge, in der die Taste wandert — die Knöpfe
// derselben Art für Auf, Ab, Pos1 und Ende, die Knöpfe der Zeile für Links und
// Rechts. Der Stopp wird über ALLE Zeilen-Knöpfe der Tabelle gesetzt, damit es
// bei einem bleibt.
function bewegeFokus(alle, reihe, von, richtung) {
  const idx = reihe.indexOf(von);
  if (idx < 0) return false;
  let ziel = idx;
  if (richtung === 'auf' || richtung === 'links') ziel = Math.max(0, idx - 1);
  else if (richtung === 'ab' || richtung === 'rechts') ziel = Math.min(reihe.length - 1, idx + 1);
  else if (richtung === 'anfang') ziel = 0;
  else if (richtung === 'ende') ziel = reihe.length - 1;
  const knopf = reihe[ziel];
  if (!knopf) return false;
  setzeTabulatorStopp(alle, knopf);
  knopf.focus();
  return true;
}

const TASTEN = {
  ArrowUp: 'auf',
  ArrowDown: 'ab',
  ArrowLeft: 'links',
  ArrowRight: 'rechts',
  Home: 'anfang',
  End: 'ende',
};

// Der Griff unter dem Ziel eines Ereignisses: eine der beiden Zeilen-
// Schaltflächen oder der Knopf im Fuß, sofern er zu diesem Block gehört.
function griffZu(block, ziel, auswahl) {
  if (!ziel || typeof ziel.closest !== 'function') return null;
  const knopf = ziel.closest(auswahl);
  return knopf && block.contains(knopf) ? knopf : null;
}

// Was ein ausgelöster Griff öffnet. Jeder Weg prüft zuerst den Ort und den
// Pfad; ohne beides bleibt der Klick folgenlos (Bauplan Z4).
function loeseAus(block, knopf) {
  if (!istAktiverOrt(block)) return;
  const pfad = tabellenPfadZu(block);
  if (!pfad || !umgebung) return;
  if (knopf.matches(FUSS_KNOPF)) {
    if (typeof umgebung.neuerDatensatz === 'function') umgebung.neuerDatensatz(pfad);
    return;
  }
  const zeile = knopf.closest('tr.prc-row');
  const kennung = zeile && zeile.dataset ? zeile.dataset.recId : '';
  if (!kennung) return;
  if (knopf.matches('.prc-open-btn')) {
    if (typeof umgebung.oeffneMaske === 'function') umgebung.oeffneMaske(pfad, kennung);
    return;
  }
  if (typeof umgebung.oeffneBelege === 'function') umgebung.oeffneBelege(pfad, kennung);
}

function binde(block) {
  // **Der Klick-Weg.** Ein Zuhörer am Block statt einer je Schaltfläche: Die
  // Tabelle kann zweitausend Zeilen tragen, und die Delegation kostet einen
  // Zuhörer statt zweitausend.
  block.addEventListener('click', (event) => {
    const knopf = griffZu(block, event.target, `${ZEILEN_KNOEPFE}, ${FUSS_KNOPF}`);
    if (!knopf) return;
    event.preventDefault();
    event.stopPropagation();
    loeseAus(block, knopf);
  });

  // **Der Maus-Weg, und nur er.** `mousedown` hält im Live-Modus die Auswahl
  // des Browsers auf, die sonst die Schreibmarke in die Fence setzte und den
  // Block zum Quelltext aufklappte. Der `click` kommt danach trotzdem an: Ein
  // verhindertes `mousedown` unterdrückt die Auswahl und den Fokus-Wechsel,
  // nicht das Klick-Ereignis (im End-zu-End-Fall der Live-Ansicht belegt).
  block.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (!griffZu(block, event.target, `${ZEILEN_KNOEPFE}, ${FUSS_KNOPF}`)) return;
    event.preventDefault();
    event.stopPropagation();
  });

  // **Der Tastatur-Weg.** Eingabe- und Leertaste brauchen nichts, sie lösen den
  // nativen `click` der Schaltfläche aus; gebraucht wird allein der Wechsel der
  // Zeile. Liegt der Fokus nicht auf einer Schaltfläche, bleibt das Ereignis
  // unberührt — die Tabelle darf das Rollen der Ansicht nicht verschlucken.
  block.addEventListener('keydown', (event) => {
    const richtung = TASTEN[event.key];
    if (!richtung) return;
    const knopf = griffZu(block, event.target, ZEILEN_KNOEPFE);
    if (!knopf) return;
    const tabelle = knopf.closest('table.prc-table') || block;
    const zeile = knopf.closest('tr.prc-row');
    const waagrecht = richtung === 'links' || richtung === 'rechts';
    const reihe = waagrecht ? schaltflaechen(zeile || knopf) : gleicheArt(tabelle, knopf);
    if (bewegeFokus(schaltflaechen(tabelle), reihe, knopf, richtung)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

/**
 * Bindet den Zeilen-Zugang aller Datensatz-Blöcke im Container.
 *
 * Läuft bei **jedem** Einhängen — auch beim Cache-Klon eines Live-Widgets,
 * weil `cloneNode` die Zuhörer verliert (Muster der übrigen Nachverarbeitung).
 * Gebunden wird trotzdem nur **einmal je Block**, kenntlich an einer Marke im
 * `dataset`; ein zweiter Zuhörer öffnete die Seite bei einem Klick zweimal.
 *
 * Ist der Container noch nicht angeschlossen, wird der Versuch kurz
 * wiedervorgelegt: Die Ortsbestimmung aus Bauplan Z4 arbeitet mit `closest`
 * über die Spalten-Hülle und ergäbe an einem losen Teilbaum «passiv» (Muster
 * `applyCanvasBlocks`).
 *
 * @param {Element} container
 * @param {number} [versuche]
 */
export function applyRecordRowAccess(container, versuche = 3) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const bloecke =
    container.classList && container.classList.contains('perspective-records')
      ? [container]
      : Array.from(container.querySelectorAll('.perspective-records'));
  if (bloecke.length === 0) return;
  if (!container.isConnected) {
    if (versuche > 0) {
      requestAnimationFrame(() => applyRecordRowAccess(container, versuche - 1));
    }
    return;
  }
  for (const block of bloecke) {
    const aktiv = istAktiverOrt(block);
    // Die Klasse schaltet die Aktions-Spalte im Stilblatt aus, statt die
    // Schaltflächen aus dem Markup zu nehmen: Dieselbe Pipeline speist alle
    // Anzeige-Orte, und ein Ort-abhängiges Markup hätte die Parität von
    // Lese-Ansicht und Änderungs-Modus an eine zweite Bedingung gehängt.
    block.classList.toggle('prc-passiv', !aktiv);
    if (!aktiv) continue;
    const knoepfe = schaltflaechen(block);
    // Der Tabulator-Stopp wird bei jedem Anwenden neu gesetzt; die Begründung
    // steht an `setzeTabulatorStopp`.
    setzeTabulatorStopp(
      knoepfe,
      knoepfe.find((knopf) => knopf.getAttribute('tabindex') === '0') || vorgabeStopp(knoepfe),
    );
    if (block.dataset.recAccessGebunden === '1') continue;
    block.dataset.recAccessGebunden = '1';
    binde(block);
  }
}
