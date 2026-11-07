// 4T-002512 (Epic 3E-000402): Der Block, mit dem eine Fence
// `perspective-dashboard` in der Markdown-Pipeline erscheint — das Gerüst des
// Dashboards aus Kopf, Zeilen und Kacheln, die Fehler-Kacheln an ihrem Platz,
// die Text-Kacheln, der Sammel-Hinweis am Fuß, die Hinweis-Fläche des leeren
// Blocks und der Aus-Zustand mit Hinweis über dem Quelltext.
//
// **Warum ein eigenes Modul neben markdown.js** (Muster `canvas-block.js`):
// Die Fence-Regel dort bleibt eine Weiche, der Aufbau des Markups liegt hier.
// Das hält die Pipeline-Datei innerhalb ihres eingefrorenen Größenwerts und
// macht den Block über die Pipeline prüfbar, ohne dass markdown.js die
// Grammatik kennt. Das Modell liest der Format-Kern
// (`dashboard/dashboard-core.js`), hier wird allein seine Sicht gezeichnet.
//
// **Daten-Kacheln sind noch keine Abfrage-Container** (Abschnitt 3.2 der
// Konzept-Stufe 4T-002506): Ihr Inhalt trägt die Abfrage in `data-db-query`,
// das Ziel einer Abfrage-Datei in `data-dashboard-abfrage` und die Vorgabe-Form
// der Art in `data-dashboard-form`. Zum Abfrage-Container macht ihn erst der
// Befüllungs-Schritt der Anzeige (D7), damit die Pipeline keine Abfrage
// ausführt und die Filter-Werte vor der ersten Auswertung gesetzt sind.
//
// **Alles aus dem Block kommt als Text in das Markup** (Render-Sicherheit der
// Entwicklungsrichtlinien): Titel, Hinweise, Abfragen und Ziele werden
// HTML-geschützt eingesetzt. Allein die Text-Kachel trägt gerendertes Markdown,
// und zwar aus derselben Instanz wie das Dokument ringsherum (`md` mit
// `html: false`), also durch dieselben Regeln und denselben Schutz.
//
// Prozessneutral (CJS, kein DOM): Das Modul läuft im Preload und in den
// Unit-Tests gleichermaßen.
'use strict';

const { escapeHtml } = require('./slug.js');
const { stripPercentComments } = require('./plugins.js');
const {
  DASHBOARD_EXTENSION_ID,
  DASHBOARD_FENCE,
  parseDashboardFence,
  dashboardSicht,
} = require('../dashboard/dashboard-core.js');

const HINWEIS = 'dashboard.hint.';

// Die Befund-Codes des Format-Kerns und der späteren Befüllung (Abschnitte
// 1.3 bis 1.6 der Konzept-Stufe), dazu `zusatzUnbekannt` aus der Entscheidung
// der Sitzung vom 2026-11-03. Je Code ein Sprach-Schlüssel `dashboard.hint.<code>`.
const DASHBOARD_HINWEIS_CODES = Object.freeze([
  'leer',
  'inhaltVorMarker',
  'markerUnbekannt',
  'filterOhneName',
  'filterDoppelt',
  'filterQuelleDoppelt',
  'vorbelegungUnbekannt',
  'inhaltOhneBedeutung',
  'artUnbekannt',
  'quelleDoppelt',
  'quelleFehlt',
  'textMitQuelle',
  'abfrageDateiFehlt',
  'abfrageDateiNichtLesbar',
  'keineAbfrageDatei',
  'abfrageDateiOhneBlock',
  'abfrageDateiMehrereBloecke',
  'kennzahlOhneZahl',
  'breiteUnbekannt',
  'zusatzUnbekannt',
]);

// Label-Schlüssel des Blocks. markdown.js löst sie über `portable-labels.js`
// gegen die Sprachdatei auf (Muster CANVAS_BLOCK_LABEL_KEYS); ohne Auflösung
// bleibt der Schlüssel stehen, der Block funktioniert also auch ohne
// Sprachdatei. `filterAlle` und `exportVorbelegung` gehören den späteren
// Schritten D8 und D10 und stehen hier, weil die Gruppe eine ist.
const DASHBOARD_BLOCK_LABEL_KEYS = [
  ...DASHBOARD_HINWEIS_CODES,
  'zeile',
  'sammel',
  'filterAlle',
  'aus',
  'exportVorbelegung',
].map((code) => HINWEIS + code);

// Vorgabe-Form je Daten-Art (Abschnitte 1.6 und 3.3): Kennzahl, Liste und
// Tabelle sind interne Formen der Anzeige, Balken und Kreis die öffentlichen
// Formen `bar` und `pie` der Abfrage.
const VORGABE_FORM = Object.freeze({
  kennzahl: 'kennzahl',
  liste: 'liste',
  tabelle: 'tabelle',
  balken: 'bar',
  kreis: 'pie',
});

/** Ist die Info-Zeichenfolge die des Dashboard-Blocks? */
function istDashboardFence(lang) {
  return lang === DASHBOARD_FENCE;
}

function labelLeser(env) {
  // Lazy: `portable-labels.js` lädt dieses Modul für die Schlüssel-Gruppe.
  const { portableLabels } = require('./portable-labels.js');
  const labels = portableLabels((env && env.lang) || 'de');
  return (key) => (typeof labels[key] === 'string' ? labels[key] : key);
}

// Ein Befund als Listen-Punkt: Zeile im Block (ab 1) und Text. Der Ersatz
// läuft über eine Funktion, damit ein `$` im Rohtext kein Ersetzungs-Muster ist.
function hinweisPunkt(L, befund) {
  const text = L(HINWEIS + befund.code).replace('{detail}', () => befund.detail);
  const zeile =
    befund.zeile == null
      ? ''
      : `<span class="dashboard-hinweis-zeile">${escapeHtml(
          L(HINWEIS + 'zeile').replace('{zeile}', String(befund.zeile)),
        )}</span> `;
  return `<li class="dashboard-hinweis">${zeile}${escapeHtml(text)}</li>`;
}

function hinweisListe(L, befunde) {
  if (befunde.length === 0) return '';
  return `<ul class="dashboard-hinweise">${befunde.map((b) => hinweisPunkt(L, b)).join('')}</ul>`;
}

// Zeile im Gesamt-Dokument aus der Zeile im Rumpf: Der Rumpf beginnt eine
// Zeile unter dem öffnenden Zaun. Ohne bekannten Zaun gibt es keine Zuordnung.
function dokumentZeile(kontext, zeileImRumpf) {
  return kontext.lineStart > 0 && zeileImRumpf != null ? kontext.lineStart + zeileImRumpf : 0;
}

function quellZeileAttr(zeile) {
  return zeile > 0 ? ` data-source-line="${zeile}"` : '';
}

// Überschriften einer Text-Kachel werden zu Abschnitts-Titeln mit der Rolle
// einer Überschrift (Abschnitt 1.6 der Konzept-Stufe, zu prüfen in diesem
// Vorgang). Als echte `h1` bis `h6` störten sie das äußere Dokument zweifach:
// Die Gliederung ordnet die gerenderten Überschriften der Reihe nach den
// Überschriften des Quelltexts zu, und der Sprung zu einer Überschrift sucht
// ihre Kennung, die eine Kachel-Überschrift gleichen Wortlauts doppelt trüge.
function entschaerfeUeberschrift(token) {
  if (token.type !== 'heading_open' && token.type !== 'heading_close') return;
  const ebene = token.tag.slice(1);
  token.tag = 'div';
  if (token.type === 'heading_close') return;
  token.attrs = (token.attrs || []).filter(([name]) => name !== 'id' && name !== 'tabindex');
  token.attrJoin('class', `dashboard-ueberschrift dashboard-ueberschrift-${ebene}`);
  token.attrSet('role', 'heading');
  token.attrSet('aria-level', ebene);
}

/**
 * Markdown einer Text-Kachel, synchron mit derselben Instanz gerendert und
 * lazy geholt nach dem Muster `perspective-table.js` (CJS-Zyklus: markdown.js
 * lädt dieses Modul zuerst). Die Zeilen-Zuordnung zeigt auf die Zeilen des
 * Gesamt-Dokuments, damit Scroll-Abgleich und Aufgaben-Kästchen die richtige
 * Stelle treffen; die Nummerierung der Überschriften bleibt aus, weil sie zum
 * Dokument gehört. Ein Dashboard-Block in der Kachel bleibt Quelltext
 * (`imDashboard`).
 */
function textKachelHtml(text, ersteZeile, kontext) {
  const { md } = require('./markdown.js');
  const quelle = kontext.enabled('comments') ? stripPercentComments(text) : text;
  const aussen = kontext.env || {};
  const env = {
    lang: aussen.lang || 'de',
    sourceLineOffset: ersteZeile > 0 ? ersteZeile - 1 : 0,
    headingNumbering: { enabled: false, startLevel: 1 },
    dbTable: aussen.dbTable,
    calendarSystems: aussen.calendarSystems,
    calendarLabels: aussen.calendarLabels,
    imDashboard: true,
  };
  const tokens = md.parse(quelle, env);
  tokens.forEach(entschaerfeUeberschrift);
  return md.renderer.render(tokens, md.options, env);
}

// Erste Zeile des Kachel-Textes im Gesamt-Dokument. Der Format-Kern schneidet
// Leerzeilen am Rand ab; die Zuordnung zählt sie deshalb hier mit.
function ersteTextZeile(model, k, kontext) {
  const el = model.elemente[k.index];
  const zeilen = String((el && el.inhalt) || '').split('\n');
  let leer = 0;
  while (leer < zeilen.length && zeilen[leer].trim() === '') leer++;
  return dokumentZeile(kontext, k.zeile + 1 + leer);
}

function kachelHtml(k, model, kontext) {
  const { L } = kontext;
  const fehlerKachel = k.art === null || (k.art !== 'text' && k.quelle === null);
  const klassen = ['dashboard-kachel'];
  klassen.push(k.breite.fest ? `dashboard-breite-${k.breite.zwoelftel}` : 'dashboard-breite-frei');
  if (fehlerKachel) klassen.push('dashboard-kachel-fehler');
  else klassen.push(`dashboard-kachel-${k.art}`);
  const kopf =
    `<div class="${klassen.join(' ')}" data-dashboard-zeile="${k.zeile}"` +
    (k.art ? ` data-dashboard-art="${k.art}"` : '') +
    `${quellZeileAttr(dokumentZeile(kontext, k.zeile))}>`;
  const titel =
    k.titel === '' ? '' : `<div class="dashboard-kachel-titel">${escapeHtml(k.titel)}</div>`;
  const hinweise = hinweisListe(L, k.fehler);
  if (fehlerKachel) return `${kopf}${titel}${hinweise}</div>`;

  let inhalt;
  if (k.quelle.typ === 'text') {
    const html = textKachelHtml(k.quelle.text, ersteTextZeile(model, k, kontext), kontext);
    inhalt = `<div class="dashboard-kachel-inhalt dashboard-text">${html}</div>`;
  } else {
    const quelle =
      k.quelle.typ === 'abfrage'
        ? `data-db-query="${escapeHtml(k.quelle.text)}"`
        : `data-dashboard-abfrage="${escapeHtml(k.quelle.ziel)}"`;
    inhalt =
      `<div class="dashboard-kachel-inhalt" ${quelle} ` +
      `data-dashboard-form="${VORGABE_FORM[k.art]}"></div>`;
  }
  return `${kopf}${titel}${hinweise}${inhalt}</div>`;
}

// Der Kopf trägt Platz für die Filter; die Auswahlfelder baut D8 aus diesen
// Angaben. Werte reisen als JSON-Liste, damit ein Komma im Wert nichts trennt.
// 4T-002516: Die Befunde eines Filters (`filterQuelleDoppelt`,
// `vorbelegungUnbekannt`, `zusatzUnbekannt`) stehen an seinem Platz, mit der
// Zeile im Block wie bei den Kacheln; die Anzeige setzt das Auswahlfeld davor.
// Ein Filter ohne gültigen Namen und ein doppelter entfallen und haben keinen
// Platz, ihre Befunde bleiben im Sammel-Hinweis.
function kopfHtml(filter, L) {
  if (filter.length === 0) return '';
  const teile = filter.map((f) => {
    const attrs = [
      `data-filter-name="${escapeHtml(f.name)}"`,
      `data-filter-titel="${escapeHtml(f.titel)}"`,
    ];
    if (f.werte) attrs.push(`data-filter-werte="${escapeHtml(JSON.stringify(f.werte))}"`);
    else attrs.push(`data-filter-eigenschaft="${escapeHtml(f.eigenschaft)}"`);
    if (f.vorbelegung !== null) {
      attrs.push(`data-filter-vorbelegung="${escapeHtml(f.vorbelegung)}"`);
    }
    return `<span class="dashboard-filter" ${attrs.join(' ')}>${hinweisListe(L, f.fehler)}</span>`;
  });
  return `<div class="dashboard-kopf">${teile.join('')}</div>`;
}

/**
 * Baut das Dashboard einer Fence.
 *
 * @param {string} rumpf Fence-Rumpf (ohne Zaun-Zeilen).
 * @param {object} kontext
 * @param {number} kontext.lineStart 1-basierte Zeile des öffnenden Zauns im
 *   Gesamt-Dokument, 0 wenn unbekannt.
 * @param {number} kontext.lineEnd 1-basierte Zeile des schließenden Zauns.
 * @param {number} kontext.index Ordnungszahl des Blocks im Render-Lauf.
 * @param {(key: string) => string} kontext.L Beschriftungs-Leser.
 * @param {(id: string) => boolean} kontext.enabled Schalter-Stand.
 * @param {object} kontext.env Render-Umgebung des Dokuments.
 * @returns {string} HTML des Blocks.
 */
function renderDashboardBlock(rumpf, kontext) {
  const { L } = kontext;
  const model = parseDashboardFence(String(rumpf == null ? '' : rumpf));
  const sicht = dashboardSicht(model);
  const teile = [kopfHtml(sicht.filter, L)];

  // Befunde mit eigenem Platz: die eines Filters am Kopf (4T-002516) und die
  // einer Kachel. Alle übrigen, außer der Hinweis-Fläche, sammelt der Fuß,
  // damit kein Befund unsichtbar bleibt.
  const amPlatz = new Set();
  for (const f of sicht.filter) f.fehler.forEach((b) => amPlatz.add(b));
  for (const reihe of sicht.zeilen) {
    for (const k of reihe.kacheln) k.fehler.forEach((b) => amPlatz.add(b));
  }
  if (sicht.leer) {
    teile.push(`<div class="dashboard-leer">${escapeHtml(L(HINWEIS + 'leer'))}</div>`);
  }
  for (const reihe of sicht.zeilen) {
    // Eine Zeile ohne Kachel bleibt ohne Hinweis leer und ohne eigenen Platz.
    if (reihe.kacheln.length === 0) continue;
    const kacheln = reihe.kacheln.map((k) => kachelHtml(k, model, kontext)).join('');
    teile.push(
      `<div class="dashboard-zeile"${quellZeileAttr(dokumentZeile(kontext, reihe.zeile))}>` +
        `${kacheln}</div>`,
    );
  }
  const gesammelt = sicht.errors.filter((b) => !amPlatz.has(b) && b.code !== 'leer');
  if (gesammelt.length > 0) {
    teile.push(
      `<div class="dashboard-sammel"><div class="dashboard-sammel-titel">` +
        `${escapeHtml(L(HINWEIS + 'sammel'))}</div>${hinweisListe(L, gesammelt)}</div>`,
    );
  }
  return (
    `<div class="perspective-dashboard" data-dashboard-index="${kontext.index}" ` +
    `data-dashboard-start="${kontext.lineStart}" data-dashboard-ende="${kontext.lineEnd}"` +
    `${quellZeileAttr(kontext.lineStart)}>${teile.join('')}</div>\n`
  );
}

/**
 * Die Weiche der Fence-Regel in markdown.js. Ist die Erweiterung aus (Story
 * 4S-001188, AK2), steht über dem gewöhnlichen Code-Block der Hinweis der
 * ausgeschalteten Erweiterung; das hat kein anderes Konstrukt (Befund 2 der
 * Konzept-Stufe). In einer Text-Kachel bleibt ein Dashboard-Block Quelltext.
 *
 * @param {object} token Fence-Token aus markdown-it.
 * @param {object} env Render-Umgebung.
 * @param {(id: string) => boolean} enabled Schalter-Stand der Pipeline.
 * @param {() => string} codeBlock gewöhnlicher Code-Block dieses Tokens.
 * @returns {string}
 */
function dashboardFenceHtml(token, env, enabled, codeBlock) {
  if (env && env.imDashboard) return codeBlock();
  const offset = (env && env.sourceLineOffset) || 0;
  const lineStart = token.map ? token.map[0] + 1 + offset : 0;
  const L = labelLeser(env);
  if (!enabled(DASHBOARD_EXTENSION_ID)) {
    return (
      `<div class="dashboard-aus-hinweis"${quellZeileAttr(lineStart)}>` +
      `${escapeHtml(L(HINWEIS + 'aus'))}</div>\n${codeBlock()}`
    );
  }
  const index =
    env && typeof env === 'object'
      ? (env.__perspectiveDashboardCount = (env.__perspectiveDashboardCount || 0) + 1) - 1
      : 0;
  return renderDashboardBlock(String(token.content || ''), {
    lineStart,
    lineEnd: token.map ? token.map[1] + offset : 0,
    index,
    L,
    enabled,
    env,
  });
}

module.exports = {
  DASHBOARD_BLOCK_LABEL_KEYS,
  DASHBOARD_HINWEIS_CODES,
  VORGABE_FORM,
  istDashboardFence,
  renderDashboardBlock,
  dashboardFenceHtml,
};
