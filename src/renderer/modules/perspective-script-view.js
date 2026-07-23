'use strict';

// 4T-0412 (Epic 3E-0078): Renderer-seitige Laufzeit der Skript-Blöcke
// (perspective-script). Der Fence rendert (markdown.js) als Platzhalter
// <div class="perspective-script" data-script-source="…">. Dieses Modul
// entscheidet über die Ausführung (Einstellung, Default aus), startet pro
// Block eine isolierte Sandbox (script-sandbox.html als
// <iframe sandbox="allow-scripts"> ohne allow-same-origin — opake Origin,
// kein Parent-DOM, kein Preload, kein Netz dank eigener CSP), kommuniziert
// ausschließlich über einen MessageChannel und übersetzt die serialisierte
// Ausgabe-Beschreibung kontrolliert in DOM (Element-Whitelist, 4T-0413).
//
// Muster frontmatter-query-view.js: modus-agnostisch (Render-Pane, Reading,
// Live-Block-Widget), Generations-Token pro Container gegen veraltete
// Antworten, Idle-Barriere für den PDF-Export.

import { api } from './api.js';
import { t } from '../i18n.js';

// Zeit-Limit pro Lauf (Design-Punkt des Epics): bei Überschreitung wird das
// iframe entsorgt und der Block zeigt den lokalisierten Timeout-Hinweis.
// Konfigurierbarer Default auf Modul-Ebene (bewusst ohne UI in v1).
export const SCRIPT_RUN_TIMEOUT_MS = 5000;

// --- Schalt-Zustand -----------------------------------------------------------
// 4T-0412: internes Flag hinter dem Store-Key scripts.run (Default aus, nur
// explizites true aktiviert). 4T-0414 ersetzt das Flag durch die echte
// Einstellung (UI, Warntext, Broadcast); der Lese-Pfad hier bleibt derselbe.
let scriptsEnabled = false;

export function isPerspectiveScriptsEnabled() {
  return scriptsEnabled;
}

export function setPerspectiveScriptsEnabled(value) {
  scriptsEnabled = value === true;
}

export async function initPerspectiveScriptsFromStore() {
  let stored;
  try {
    stored = await api.getSetting('scripts.run');
  } catch (err) {
    console.warn('Skript-Block-Setting laden fehlgeschlagen:', err);
  }
  setPerspectiveScriptsEnabled(stored === true);
}

// 4T-0414: Zustand anwenden und alle sichtbaren Skript-Blöcke neu aufbauen
// (Ausführung bzw. Quelltext-Rückfall) — ohne Neustart, modus-agnostisch
// über die Platzhalter im DOM. Idempotent: läuft lokal beim Anwenden der
// Einstellung und beim Multi-Window-Broadcast (auch im Sender-Fenster);
// ein unveränderter Zustand ist ein No-op.
export function applyPerspectiveScriptsEnabled(value) {
  const next = value === true;
  if (next === scriptsEnabled) return;
  scriptsEnabled = next;
  const els = document.querySelectorAll('.perspective-script[data-script-source]');
  for (const el of els) runOneScriptContainer(el, el.dataset.scriptBase || '');
}

// --- Idle-Barriere für den PDF-Export ---------------------------------------
// Zählt laufende Ausführungen; der Export wartet über
// waitForPerspectiveScriptsIdle(), bis alle sichtbaren Blöcke ihr Ergebnis
// (oder Fehler/Timeout) haben — analog waitForFrontmatterQueriesIdle.
let pendingRuns = 0;
let idleResolvers = [];

function runStarted() {
  pendingRuns += 1;
}

function runFinished() {
  pendingRuns = Math.max(0, pendingRuns - 1);
  if (pendingRuns === 0 && idleResolvers.length) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export function waitForPerspectiveScriptsIdle() {
  if (pendingRuns === 0) return Promise.resolve();
  return new Promise((resolve) => idleResolvers.push(resolve));
}

// --- Ergebnis-Aufbau ----------------------------------------------------------

function statusNode(key, replacements) {
  const div = document.createElement('div');
  div.className = 'perspective-script-status';
  let text = t(key);
  if (replacements) {
    for (const [ph, val] of Object.entries(replacements)) text = text.replace(ph, val);
  }
  div.textContent = text;
  return div;
}

function errorNode(text) {
  const div = document.createElement('div');
  div.className = 'perspective-script-status perspective-script-error';
  div.textContent = text;
  return div;
}

// Quelltext-Darstellung (Einstellung aus): Hinweis-Banner mit Verweis auf
// die Einstellung (4T-0414) plus Code-Block wie der Default-Fence-Renderer,
// damit der Block-Inhalt sichtbar bleibt. Exportiert für den jsdom-Unit-Test.
export function renderSourceFallback(el, source, tFn) {
  const translate = typeof tFn === 'function' ? tFn : t;
  el.textContent = '';
  const banner = document.createElement('div');
  banner.className = 'perspective-script-banner';
  banner.textContent = translate('script.disabledBanner');
  el.appendChild(banner);
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-perspective-script';
  code.textContent = source;
  pre.appendChild(code);
  el.appendChild(pre);
}

// --- Whitelist-Übersetzer -----------------------------------------------------
// Übersetzt die serialisierte Ausgabe-Beschreibung der Sandbox in DOM.
// Positiv-Liste von Elementen und Attributen (Entwicklungsrichtlinien,
// Sicherheits-Kapitel: Whitelists statt Blacklists); alles andere wird
// verworfen. Interne Links laufen über den bestehenden data-fm-path-
// Klick-Pfad der Abfrage-Treffer. 4T-0413 baut den Umfang aus (md-Knoten,
// Link-Auflösung gegen den Index); exportiert für den jsdom-Unit-Test.
const ALLOWED_TAGS = new Set([
  'div',
  'span',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'br',
  'hr',
  'sup',
  'sub',
  'mark',
  'small',
  'dl',
  'dt',
  'dd',
]);

// Global erlaubte Attribute plus Zell-Attribute (numerisch validiert).
const ALLOWED_ATTRS = new Set(['class', 'title']);
const ALLOWED_CELL_ATTRS = new Set(['colspan', 'rowspan']);

// Ausgabe-Deckel gegen Renderer-Blockade durch Massen-Ausgaben: harte
// Knoten-Obergrenze und Verschachtelungs-Tiefe; bei Überschreitung wird der
// Aufbau abgebrochen und ein lokalisierter Hinweis angehängt.
const MAX_OUTPUT_NODES = 20000;
const MAX_OUTPUT_DEPTH = 32;

export function buildScriptOutputDom(output, basePath, tFn) {
  const translate = typeof tFn === 'function' ? tFn : t;
  const frag = document.createDocumentFragment();
  // 4T-0413: basePath wandert im Budget-Objekt mit (md-Knoten rendern über
  // die Pipeline mit Bild-/Link-Auflösung relativ zur Dokument-Basis).
  const budget = { nodes: 0, truncated: false, basePath: basePath || '' };
  appendNodes(frag, Array.isArray(output) ? output : [], 0, budget);
  if (budget.truncated) {
    const note = document.createElement('div');
    note.className = 'perspective-script-status';
    note.textContent = translate('script.outputTruncated');
    frag.appendChild(note);
  }
  return frag;
}

function takeBudget(budget) {
  budget.nodes += 1;
  if (budget.nodes > MAX_OUTPUT_NODES) {
    budget.truncated = true;
    return false;
  }
  return true;
}

function appendNodes(parent, nodes, depth, budget) {
  if (!Array.isArray(nodes)) return;
  if (depth > MAX_OUTPUT_DEPTH) {
    budget.truncated = true;
    return;
  }
  for (const node of nodes) {
    if (budget.truncated) return;
    appendNode(parent, node, depth, budget);
  }
}

function appendNode(parent, node, depth, budget) {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'text') {
    if (!takeBudget(budget)) return;
    parent.appendChild(document.createTextNode(String(node.text ?? '')));
    return;
  }
  if (node.kind === 'el') {
    const tag = String(node.tag || '').toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Nicht erlaubtes Element: Knoten samt Attributen verwerfen, Kinder
      // aber anzeigen (Inhalt bleibt sichtbar, Struktur fällt weg).
      appendNodes(parent, node.children, depth + 1, budget);
      return;
    }
    if (!takeBudget(budget)) return;
    const el = document.createElement(tag);
    if (node.attrs && typeof node.attrs === 'object') {
      for (const [name, value] of Object.entries(node.attrs)) {
        const attr = String(name).toLowerCase();
        if (ALLOWED_ATTRS.has(attr)) {
          el.setAttribute(attr, String(value));
        } else if ((tag === 'td' || tag === 'th') && ALLOWED_CELL_ATTRS.has(attr)) {
          const n = parseInt(String(value), 10);
          if (Number.isFinite(n) && n >= 1 && n <= 1000) el.setAttribute(attr, String(n));
        }
      }
    }
    appendNodes(el, node.children, depth + 1, budget);
    parent.appendChild(el);
    return;
  }
  if (node.kind === 'link') {
    if (!takeBudget(budget)) return;
    // Interne Ziele über den zentralen Klick-Pfad (data-fm-path -> openInPane),
    // wie die Treffer der Perspective-Abfrage. Kein href-Schema aus Skripten.
    const a = document.createElement('a');
    a.className = 'perspective-query-item';
    a.href = '#';
    const path = String(node.path || '');
    a.textContent = String(node.label || '') || path;
    a.title = path;
    a.dataset.fmPath = path;
    // 4T-0413: Block-Ziele tragen den Anker — der Klick-Pfad springt nach
    // dem Öffnen zum Block (bestehende Anker-Sprung-Mechanik der Abfrage).
    if (typeof node.anchor === 'string' && node.anchor) {
      a.dataset.fmAnchor = '^' + node.anchor;
    }
    parent.appendChild(a);
    return;
  }
  if (node.kind === 'list') {
    appendListNode(parent, node, depth, budget);
    return;
  }
  if (node.kind === 'table') {
    appendTableNode(parent, node, depth, budget);
    return;
  }
  if (node.kind === 'md') {
    // 4T-0413: Markdown-Ausgabe über die bestehende Render-Pipeline (kein
    // Roh-HTML: die Pipeline rendert mit html:false und escapt selbst).
    // Dynamische Platzhalter (Skript-/Abfrage-Blöcke) werden entfernt —
    // keine rekursive Ausführung aus Skript-Ausgaben heraus.
    if (!takeBudget(budget)) return;
    const text = String(node.text ?? '');
    const div = document.createElement('div');
    div.className = 'perspective-script-md';
    const html = renderMarkdownHtml(text, budget.basePath);
    if (html === null) {
      div.textContent = text;
    } else {
      div.innerHTML = html;
      for (const nested of div.querySelectorAll('.perspective-script, .perspective-query')) {
        nested.remove();
      }
    }
    parent.appendChild(div);
    return;
  }
  // Unbekannte Knoten-Arten werden verworfen (Whitelist-Prinzip).
}

// Markdown-Rendering über die Preload-Pipeline; null bei Fehler (der
// Aufrufer fällt auf die Text-Darstellung zurück). Eigener Helfer, damit
// der jsdom-Unit-Test ohne Preload läuft (api undefined -> catch).
function renderMarkdownHtml(text, basePath) {
  try {
    return api.renderMarkdown(text, basePath || null, { frontmatterBlock: false });
  } catch {
    return null;
  }
}

function appendListNode(parent, node, depth, budget) {
  if (!takeBudget(budget)) return;
  const ul = document.createElement('ul');
  ul.className = 'perspective-script-list';
  appendListItems(ul, node.items, depth + 1, budget);
  parent.appendChild(ul);
}

function appendListItems(ul, items, depth, budget) {
  if (!Array.isArray(items)) return;
  if (depth > MAX_OUTPUT_DEPTH) {
    budget.truncated = true;
    return;
  }
  for (const item of items) {
    if (budget.truncated) return;
    if (!item || typeof item !== 'object') continue;
    if (!takeBudget(budget)) return;
    const li = document.createElement('li');
    appendNodes(li, item.content, depth + 1, budget);
    if (Array.isArray(item.children) && item.children.length > 0) {
      const nested = document.createElement('ul');
      appendListItems(nested, item.children, depth + 1, budget);
      li.appendChild(nested);
    }
    ul.appendChild(li);
  }
}

function appendTableNode(parent, node, depth, budget) {
  if (!takeBudget(budget)) return;
  const table = document.createElement('table');
  table.className = 'perspective-script-table';
  if (Array.isArray(node.headers) && node.headers.length > 0) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const cell of node.headers) {
      if (budget.truncated) break;
      if (!takeBudget(budget)) break;
      const th = document.createElement('th');
      appendNodes(th, cell, depth + 1, budget);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = document.createElement('tbody');
  if (Array.isArray(node.rows)) {
    for (const row of node.rows) {
      if (budget.truncated) break;
      if (!Array.isArray(row)) continue;
      if (!takeBudget(budget)) break;
      const tr = document.createElement('tr');
      for (const cell of row) {
        if (budget.truncated) break;
        if (!takeBudget(budget)) break;
        const td = document.createElement('td');
        appendNodes(td, cell, depth + 1, budget);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  parent.appendChild(table);
}

// --- Ausführung ---------------------------------------------------------------
// Pro Container ein Generations-Token (Muster frontmatter-query-view.js):
// ein Refresh während eines laufenden Laufs verwirft die veraltete Antwort.
const runTokens = new WeakMap();

// Antwort der Sandbox (bzw. der Timeout-Pfad) in Block-DOM übersetzen.
// exportiert für den jsdom-Unit-Test (Fehler-/Timeout-/Ergebnis-Bild).
export function renderScriptResult(el, msg, basePath, tFn) {
  const translate = typeof tFn === 'function' ? tFn : t;
  el.textContent = '';
  if (msg && msg.type === 'result') {
    el.appendChild(buildScriptOutputDom(msg.output, basePath, translate));
    return;
  }
  if (msg && msg.type === 'timeout') {
    el.appendChild(
      errorNode(
        translate('script.timeout').replace(
          '{seconds}',
          String(Math.round(SCRIPT_RUN_TIMEOUT_MS / 1000)),
        ),
      ),
    );
    return;
  }
  // Fehler-Pfad: lokalisierter Rahmen, Original-Meldung des Skripts als
  // Detail (Skript-Meldungen sind Nutzer-Inhalt, keine i18n-Pflicht).
  const message = msg && typeof msg.message === 'string' ? msg.message : '';
  const line = msg && typeof msg.line === 'number' && msg.line >= 1 ? msg.line : null;
  const detail =
    line !== null
      ? `${message} (${translate('script.errorLine').replace('{line}', String(line))})`
      : message;
  el.appendChild(errorNode(translate('script.error').replace('{message}', detail)));
}

// Startet den Lauf eines Skript-Block-Containers. Nicht async, damit
// runStarted() synchron läuft und die Idle-Barriere den Lauf sicher erfasst.
// 4T-0413: vor dem Sandbox-Start holt der Renderer den Daten-Snapshot über
// das Abfrage-IPC und sendet ihn einmalig mit dem Run-Auftrag; ohne
// basePath (Unbenannt-Tab) läuft das Skript ohne Index-Daten.
function runOneScriptContainer(el, basePath) {
  const token = (runTokens.get(el) || 0) + 1;
  runTokens.set(el, token);
  if (basePath) el.dataset.scriptBase = basePath;

  const source = el.dataset.scriptSource || '';
  if (!scriptsEnabled) {
    renderSourceFallback(el, source);
    return;
  }

  el.textContent = '';
  el.appendChild(statusNode('script.running'));
  runStarted();

  const dataPromise = basePath
    ? Promise.resolve(api.getPerspectiveScriptData(basePath))
    : Promise.resolve(null);
  dataPromise
    .then((snapshot) => {
      if (runTokens.get(el) !== token) {
        runFinished();
        return;
      }
      // Index noch nicht bereit bzw. nicht nutzbar: lokalisierter Status
      // statt eines Laufs mit halben Daten. Der Invalidierungs-Refresh
      // (data-script-base) startet den Block neu, sobald der Index steht.
      if (basePath && snapshot && snapshot.status !== 'ready') {
        renderIndexStatus(el, snapshot);
        runFinished();
        return;
      }
      enqueueSandboxRun(el, token, source, snapshot, basePath);
    })
    .catch(() => {
      if (runTokens.get(el) === token) {
        renderIndexStatus(el, { status: 'error' });
      }
      runFinished();
    });
}

// Nicht nutzbarer Index (indexing/oversized/error/unavailable) als Block-Status.
function renderIndexStatus(el, snapshot) {
  el.textContent = '';
  const status = snapshot && snapshot.status;
  if (status === 'indexing') {
    el.appendChild(statusNode('script.indexing'));
    return;
  }
  if (status === 'oversized') {
    const meta = (snapshot && snapshot.meta) || {};
    el.appendChild(statusNode('script.indexOversized', { '{files}': String(meta.fileCount || 0) }));
    return;
  }
  el.appendChild(errorNode(t('script.indexError')));
}

// 4T-0416-Befund (PO-Test-Iteration 0.53.0): Skript-Läufe pro Fenster
// SERIALISIEREN. Die Sandbox-iframes eines Fensters teilen sich einen
// Renderer-Prozess; ein Endlos-Skript blockiert dessen Event-Loop und ließe
// parallel gestartete Geschwister-Blöcke in deren Zeit-Limit laufen, obwohl
// ihre Skripte harmlos sind. Die Warteschlange gibt jedem Block sein volles
// Zeit-Budget ab Ausführungs-Beginn; ein Langläufer verzögert Nachfolger nur
// bis zu seinem Abbruch (sein iframe wird entsorgt, der Prozess ist wieder
// frei). Die Kette resolved über finish() immer (Ergebnis, Fehler, Timeout)
// und kann nicht reißen; veraltete Einträge (Token) werden übersprungen.
let sandboxQueue = Promise.resolve();

function enqueueSandboxRun(el, token, source, snapshot, basePath) {
  sandboxQueue = sandboxQueue.then(
    () =>
      new Promise((resolve) => {
        if (runTokens.get(el) !== token) {
          runFinished();
          resolve();
          return;
        }
        executeInSandbox(el, token, source, snapshot, basePath, resolve);
      }),
  );
}

// Führt den Skript-Block in einer frischen Sandbox aus (iframe pro Lauf).
// Das iframe hängt IM Container: verschwindet der Container (Tab-Wechsel,
// Re-Render), reißt der Browsing-Kontext ab und der Lauf endet mit dem
// Timeout-Pfad ins Leere (Token-Prüfung). Der laufende runStarted()-Zähler
// aus runOneScriptContainer wird hier über finish() abgeschlossen; onDone
// gibt die Warteschlange für den nächsten Block frei.
function executeInSandbox(el, token, source, snapshot, basePath, onDone) {
  const iframe = document.createElement('iframe');
  iframe.className = 'perspective-script-frame';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = 'script-sandbox.html';

  const channel = new MessageChannel();
  let finished = false;

  const finish = (msg) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    channel.port1.onmessage = null;
    iframe.remove();
    if (runTokens.get(el) === token) renderScriptResult(el, msg, basePath, t);
    runFinished();
    if (typeof onDone === 'function') onDone();
  };

  const timer = setTimeout(() => finish({ type: 'timeout' }), SCRIPT_RUN_TIMEOUT_MS);

  channel.port1.onmessage = (event) => {
    const msg = event.data;
    // Protokoll-Validierung der Sandbox-Antwort: nur die erwarteten Formen.
    if (msg && msg.type === 'result' && Array.isArray(msg.output)) {
      finish({ type: 'result', output: msg.output });
    } else if (msg && msg.type === 'error') {
      finish({
        type: 'error',
        message: typeof msg.message === 'string' ? msg.message : '',
        line: typeof msg.line === 'number' ? msg.line : null,
      });
    } else {
      finish({ type: 'error', message: '', line: null });
    }
  };

  iframe.addEventListener('load', () => {
    if (finished) return;
    try {
      // targetOrigin '*': die Sandbox läuft mit opaker Origin und ist über
      // ein benanntes targetOrigin nicht adressierbar; der Kanal bleibt
      // trotzdem privat, weil die Antwort-Seite der übertragene Port ist.
      iframe.contentWindow.postMessage(
        { type: 'pm-script-run', script: source, data: snapshot || null },
        '*',
        [channel.port2],
      );
    } catch (err) {
      finish({ type: 'error', message: String((err && err.message) || err), line: null });
    }
  });

  el.appendChild(iframe);
}

// Findet alle perspective-script-Platzhalter im Container und führt sie aus.
// Aufgerufen aus der Render-Pipeline (Render-Pane/Reading) und aus dem
// Live-Block-Widget. basePath darf leer sein (Unbenannt-Tab): das Skript
// läuft dann ohne Index-Daten (pq-Datenfunktionen liefern leer, 4T-0413).
export function applyPerspectiveScriptsIfPresent(container, basePath) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  const els = container.querySelectorAll('.perspective-script[data-script-source]');
  for (const el of els) runOneScriptContainer(el, basePath);
}

// --- Live-Aktualisierung über die Index-Invalidierung ------------------------
// Debounced-Neustart aller sichtbaren Skript-Blöcke, modus-agnostisch über
// data-script-base (Muster refreshVisibleFrontmatterQueries). Wirksam ab dem
// Daten-Snapshot aus 4T-0413 (Skripte lesen Index-Daten).
let refreshTimer = null;

export function refreshVisiblePerspectiveScripts() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const els = document.querySelectorAll('.perspective-script[data-script-base]');
    for (const el of els) runOneScriptContainer(el, el.dataset.scriptBase);
  }, 150);
}
