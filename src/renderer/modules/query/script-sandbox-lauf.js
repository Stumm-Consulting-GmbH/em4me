'use strict';

// 4T-002465 (Epic 3E-000367, Story 4S-001149, Entscheidung 3h): Der Lauf eines
// Skripts in der Sandbox der Skript-Blöcke, herausgelöst aus der Ansicht
// (perspective-script-view.js), damit der Skript-Schritt eines Workflows
// **dieselbe** Abschottung, Lese-Schnittstelle und Zeitgrenze nutzt, ohne dass
// ein Dokument angezeigt wird.
//
// Sicherheits-Modell, unverändert aus 4T-000412 und 4T-000416, hier an genau
// einer Stelle gebaut:
// - Je Lauf ein frisches `<iframe sandbox="allow-scripts">` OHNE
//   `allow-same-origin` auf das eigene Trägerdokument `script-sandbox.html`:
//   opake Herkunft, kein Zugriff auf das Fenster, kein Preload, kein Speicher;
//   dessen CSP `default-src 'none'` schließt jedes Netz und jedes Nachladen
//   aus, das Skript läuft dort in einem Worker.
// - Verbindung ausschließlich über einen MessageChannel: Ein Auftrag mit dem
//   Quelltext und dem Daten-Abzug (rein lesend, als Kopie übertragen) geht
//   hinein, genau eine Antwort kommt über den übertragenen Port zurück und
//   wird vor der Verwendung auf ihre Form geprüft (`antwortPruefen`).
// - Zeitgrenze `SCRIPT_RUN_TIMEOUT_MS`: Danach wird das iframe entsorgt, was
//   den Worker mit beendet, und die Antwort ist `{ type: 'timeout' }`.
// - **Ein Lauf nach dem anderen je Fenster** (4T-000416-Befund): Die iframes
//   eines Fensters teilen sich einen Renderer-Prozess; die Warteschlange gibt
//   jedem Lauf sein volles Zeit-Budget ab Ausführungs-Beginn, über die Ansicht
//   und die Workflows hinweg. Die Kette reißt nie, jeder Lauf endet.
//
// Einen Schreibweg gibt es nicht: Die Sandbox reicht dem Skript allein die
// Lese-Schnittstelle `pq`, und zurück kommt nur die geprüfte Antwort.

// Zeit-Limit pro Lauf (Design-Punkt des Epics 3E-000078).
export const SCRIPT_RUN_TIMEOUT_MS = 5000;

const SANDBOX_DOKUMENT = 'script-sandbox.html';

let sandboxQueue = Promise.resolve();

// Ein Rückgabe-Wert nur als übertragbarer Einzelwert, sonst null.
function wertPruefen(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * Prüft die Antwort der Sandbox auf ihre Form; alles Unerwartete wird ein
 * Fehler ohne Meldung.
 *
 * @param {*} msg `event.data` vom Port.
 * @returns {{type: 'result', output: object[], value: (string|number|boolean|null)}
 *   |{type: 'error', message: string, line: (number|null)}}
 */
export function antwortPruefen(msg) {
  if (msg && msg.type === 'result' && Array.isArray(msg.output)) {
    return { type: 'result', output: msg.output, value: wertPruefen(msg.value) };
  }
  if (msg && msg.type === 'error') {
    return {
      type: 'error',
      message: typeof msg.message === 'string' ? msg.message : '',
      line: typeof msg.line === 'number' ? msg.line : null,
    };
  }
  return { type: 'error', message: '', line: null };
}

// Führt das Skript in einer frischen Sandbox aus; `fertig` bekommt genau eine
// Antwort.
function ausfuehren(source, data, mount, timeoutMs, fertig) {
  const iframe = document.createElement('iframe');
  iframe.className = 'perspective-script-frame';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.display = 'none';
  iframe.src = SANDBOX_DOKUMENT;

  const channel = new MessageChannel();
  let beendet = false;
  let timer = null;

  const finish = (msg) => {
    if (beendet) return;
    beendet = true;
    clearTimeout(timer);
    channel.port1.onmessage = null;
    iframe.remove();
    fertig(msg);
  };

  timer = setTimeout(() => finish({ type: 'timeout' }), timeoutMs);
  channel.port1.onmessage = (event) => finish(antwortPruefen(event.data));

  iframe.addEventListener('load', () => {
    if (beendet) return;
    try {
      // targetOrigin '*': die Sandbox läuft mit opaker Origin und ist über
      // ein benanntes targetOrigin nicht adressierbar; der Kanal bleibt
      // trotzdem privat, weil die Antwort-Seite der übertragene Port ist.
      iframe.contentWindow.postMessage(
        { type: 'pm-script-run', script: source, data: data || null },
        '*',
        [channel.port2],
      );
    } catch (err) {
      finish({ type: 'error', message: String((err && err.message) || err), line: null });
    }
  });

  mount.appendChild(iframe);
}

/**
 * Reiht einen Lauf in die Warteschlange des Fensters ein.
 *
 * @param {{source: string, data?: object|null, mount?: Element,
 *   isCurrent?: () => boolean, timeoutMs?: number}} auftrag `mount` nimmt das
 *   iframe auf (die Ansicht: der Container des Blocks, ein Workflow:
 *   `document.body`); `isCurrent` sagt vor dem Start, ob der Lauf noch
 *   gebraucht wird.
 * @returns {Promise<object>} Antwort aus `antwortPruefen`, `{ type: 'timeout' }`
 *   oder `{ type: 'stale' }`, wenn der Lauf nicht mehr gebraucht wurde.
 */
export function runInScriptSandbox({ source, data, mount, isCurrent, timeoutMs } = {}) {
  const lauf = sandboxQueue.then(
    () =>
      new Promise((resolve) => {
        if (typeof isCurrent === 'function' && !isCurrent()) {
          resolve({ type: 'stale' });
          return;
        }
        try {
          ausfuehren(
            String(source == null ? '' : source),
            data,
            mount || document.body,
            typeof timeoutMs === 'number' ? timeoutMs : SCRIPT_RUN_TIMEOUT_MS,
            resolve,
          );
        } catch (err) {
          resolve({ type: 'error', message: String((err && err.message) || err), line: null });
        }
      }),
  );
  sandboxQueue = lauf.then(
    () => undefined,
    () => undefined,
  );
  return lauf;
}

// Text eines Knotens der Ausgabe-Beschreibung, in Lese-Reihenfolge.
function knotenText(node, teile, tiefe) {
  if (!node || typeof node !== 'object' || tiefe > 32) return;
  if (node.kind === 'text' || node.kind === 'md') teile.push(String(node.text ?? ''));
  else if (node.kind === 'link') teile.push(String(node.label || node.path || ''));
  else if (node.kind === 'el') knotenListe(node.children, teile, tiefe + 1);
  else if (node.kind === 'list') eintraege(node.items, teile, tiefe + 1);
  else if (node.kind === 'table') {
    for (const row of [node.headers, ...(Array.isArray(node.rows) ? node.rows : [])]) {
      if (!Array.isArray(row)) continue;
      teile.push(row.map((zelle) => scriptOutputText(zelle)).join('\t'), '\n');
    }
  }
}

function knotenListe(nodes, teile, tiefe) {
  if (Array.isArray(nodes)) for (const n of nodes) knotenText(n, teile, tiefe);
}

function eintraege(items, teile, tiefe) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    knotenListe(item.content, teile, tiefe);
    teile.push('\n');
    eintraege(item.children, teile, tiefe + 1);
  }
}

/**
 * Der Text einer Ausgabe-Beschreibung der Sandbox (Ergebnis eines Skripts, das
 * nichts zurückgibt, sondern mit `pq.out` ausgibt), ohne Leerraum am Rand.
 *
 * @param {object[]} output
 * @returns {string}
 */
export function scriptOutputText(output) {
  const teile = [];
  knotenListe(output, teile, 0);
  return teile.join('').trim();
}
