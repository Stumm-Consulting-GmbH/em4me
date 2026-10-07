// 4T-002068 (Epic 3E-000344): Die Bild-Umwandlung der Anzeige, aus preload.js
// geschnitten.
//
// **Zweck.** Gewöhnliche Markdown-Bilder kommen als `<img src="…">` mit dem
// geschriebenen Pfad aus der Pipeline. Die Umwandlung liest eine Bilddatei
// innerhalb der Grenze und setzt sie als Daten-Adresse ein; alles andere
// verliert seine Adresse. Grenze ist der gebundene Bereich, wenn er den
// Dokument-Ordner enthält, sonst der Dokument-Ordner; dazu die Endungs-Liste
// und 20 MB.
//
// **Warum jede abgelehnte Adresse entfällt, statt stehen zu bleiben.** Bis
// 4T-002068 blieb eine Adresse, die die Umwandlung nicht auflösen durfte,
// unverändert im Element, und das Fenster lud sie selbst: eine Datei-Adresse,
// eine Freigabe-Adresse (`//rechner/…`) oder einen Pfad außerhalb der Grenze —
// gemessen an der gebauten Programmdatei. Ein Dokument aus fremder Quelle
// konnte so beim bloßen Öffnen eine Verbindung zu einem fremden Rechner
// auslösen. Seither gilt die Gegenrichtung: Was die Umwandlung nicht als
// Daten-Adresse einsetzt, verliert seine Adresse; das Element bleibt mit
// seinen übrigen Attributen stehen (Bauform wie die `src`-Schranke in
// src/shared/markdown/portable-sanitizer.js). Das gilt auch für eine fehlende
// oder nicht lesbare Datei innerhalb der Grenze: Ihr Pfad ist relativ zum
// Dokument geschrieben, das Fenster löste ihn aber gegen seine eigene Seite
// auf, und kein Weg dorthin zeigt das gemeinte Bild. Unverändert bleiben
// allein `http:`/`https:`, die die Inhalts-Regel des Fensters abweist, und
// Daten-Adressen.
//
// **Ohne Dokument-Pfad gilt eine feste Wurzel** (4T-002068, Schritt 1). Seit
// die Bild-Regel des Fensters allein Daten-Adressen zulässt, lädt das Fenster
// keine Pfad-Adresse mehr selbst. Ein Bild in einer Darstellung ohne
// Dokument-Pfad (Handbuch-Seiten, unbenannte Dokumente, Karten ohne Pfad,
// Notizen der Mindmap) war bis dahin gegen die Seite des Fensters aufgelöst
// worden (`src/renderer/index.html`); so erscheint das Logo der
// Handbuch-Überblicksseite (`../assets/em4me-logo.svg`). Dieselbe Auflösung
// gilt weiter, aber über diesen geprüften Weg: Grenze ist der Bild-Ordner der
// Anwendung (`src/assets`), dazu Endungs-Liste und 20 MB; jede andere Adresse
// verliert ihre Quelle. Die Herkunft steht dann in `data-anwendungsbild`
// statt in `data-src-original`, weil der Klick-Pfad über das zweite Attribut
// eine Anlage des Dokuments im Standardprogramm öffnet und ein Bild der
// Anwendung keine Anlage ist.
//
// **Warum ein eigenes Modul.** Ohne Electron-Abhängigkeit ist die Umwandlung
// Unit-prüfbar (test/unit/preload-images.test.js); im Vorlade-Skript war sie
// es nicht. Der Zustand der Bereichs-Wurzel bleibt im Vorlade-Skript, das ihn
// über configureAttachmentArea setzt, und kommt je Aufruf als Parameter.
// Eingebunden wie die Brücken-Teile preload-datenbank.js und
// preload-buecher.js: per relativem require aus preload.js, das ohne Sandbox
// läuft (window-manager.js, `sandbox: false`).
'use strict';

const path = require('node:path');
const fs = require('node:fs');

// P-03 (4T-000176): nur echte Bild-Formate mit bekanntem MIME-Typ einbetten.
const IMAGE_EXT_WHITELIST = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

// Ohne Dokument-Pfad: Bezugs-Ordner der geschriebenen Adresse ist der Ordner
// der Seite des Fensters, Grenze der Bild-Ordner der Anwendung. Beide liegen
// im gepackten Zustand im Archiv der Anwendung, das `fs` im Vorlade-Skript
// lesen kann.
const SEITEN_ORDNER = path.join(__dirname, '..', 'renderer');
const ANWENDUNGS_BILDER = path.join(__dirname, '..', 'assets');

// Liegt ziel innerhalb von wurzel? Case-insensitiv wie das Windows-Dateisystem,
// Semantik identisch zu area-path.isInsideArea (die Wurzel selbst zählt als
// innerhalb, Präfix-Nachbarn matchen nicht). Hier nachgebildet statt importiert,
// damit das Modul ohne weitere Abhängigkeit prüfbar bleibt.
function liegtInWurzel(wurzel, ziel) {
  const w = path
    .resolve(wurzel)
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  const z = path.resolve(ziel).toLowerCase();
  return z === w || z.startsWith(w + path.sep);
}

// Das Element ohne seine Adresse; die übrigen Attribute bleiben.
function ohneQuelle(pre, post) {
  return `<img ${pre}${post.trimStart()}>`;
}

/**
 * Bilder mit Pfad-Adressen als Daten-Adresse einbetten, damit sie ohne
 * Datei-Zugriff des Fensters erscheinen; jede andere Adresse außer
 * `http:`/`https:` und Daten-Adressen entfällt.
 *
 * @param {string} html Ausgabe der Markdown-Pipeline.
 * @param {string|null} basePath Pfad des Dokuments; ohne ihn gilt die feste
 *   Wurzel der Bilder der Anwendung (Kopf-Kommentar).
 * @param {string|null} bildAufloesungsWurzel Wurzel des gebundenen Bereichs
 *   oder null; ohne Dokument-Pfad ohne Wirkung.
 * @returns {string}
 */
function resolveImagesForBase(html, basePath, bildAufloesungsWurzel) {
  let baseDir;
  let wurzel;
  let herkunft;
  if (basePath) {
    baseDir = path.dirname(basePath);
    // 4T-000788 (Epic 3E-000125): Die Containment-Wurzel ist bei gebundenem Bereich
    // dessen Wurzel, sonst der Ordner des Dokuments. Damit wird ein zentraler
    // Anlagen-Ordner des Bereichs auch aus einem Unterordner heraus sichtbar,
    // was er unter der reinen Dokument-Ordner-Grenze nie war. Die Prüfung bleibt
    // in ihrer Härte unverändert: eine harte Grenze gegen genau eine Wurzel, und
    // zwar dieselbe, die die App überall sonst als Arbeitsraum-Grenze durchsetzt.
    // Der Bereich muss den Dokument-Ordner tatsächlich enthalten; ein
    // fensterlokal stehengebliebener Fremd-Bereich weitet sonst die Grenze für
    // ein Dokument, das gar nicht in ihm liegt.
    wurzel =
      bildAufloesungsWurzel && liegtInWurzel(bildAufloesungsWurzel, baseDir)
        ? path.resolve(bildAufloesungsWurzel)
        : baseDir;
    herkunft = 'data-src-original';
  } else {
    // 4T-002068, Schritt 1: ohne Dokument-Pfad die feste Wurzel der Bilder
    // der Anwendung (Kopf-Kommentar).
    baseDir = SEITEN_ORDNER;
    wurzel = ANWENDUNGS_BILDER;
    herkunft = 'data-anwendungsbild';
  }
  return html.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi, (match, pre, src, post) => {
    if (/^(https?:|data:)/i.test(src)) return match;
    // 4T-002068: Eine Datei-Adresse wird nie aufgelöst, auch nicht innerhalb
    // der Grenze; sie kann auf eine Freigabe zeigen (`file://rechner/…`).
    if (/^file:/i.test(src)) return ohneQuelle(pre, post);
    // P-01 (4T-000174): decodeURI INNERHALB des try — ein literales '%' im
    // Bildnamen (z.B. aus unkodiertem Wiki-Embed-src) wirft sonst einen
    // URIError und bricht den gesamten Voll-Render des Dokuments ab.
    try {
      const abs = path.resolve(baseDir, decodeURI(src));
      // P-03 (4T-000176): Containment — der Resolver folgt sonst '../' und
      // absoluten Pfaden und liest beliebige lokale Dateien ins DOM. Die
      // Prüfung steht VOR jedem Datei-Zugriff: Schon der Größen-Zugriff auf
      // eine Freigabe-Adresse wäre die Verbindung zum fremden Rechner.
      // 4T-000788: Die Wurzel ist bei gebundenem Bereich dessen Wurzelordner,
      // sonst wie bisher der Ordner des Dokuments; ohne Dokument-Pfad der
      // Bild-Ordner der Anwendung.
      if (!liegtInWurzel(wurzel, abs)) return ohneQuelle(pre, post);
      const ext = path.extname(abs).slice(1).toLowerCase();
      if (!IMAGE_EXT_WHITELIST.has(ext)) return ohneQuelle(pre, post);
      // Groessenlimit VOR dem Lesen (Memory-Schutz).
      if (fs.statSync(abs).size > MAX_IMAGE_BYTES) return ohneQuelle(pre, post);
      const mime = mimeForImage(ext);
      const data = fs.readFileSync(abs).toString('base64');
      // 4T-000790 (Epic 3E-000125): Original-Quelle als Attribut erhalten. Nach der
      // Ersetzung steht in `src` ein data:-URI, aus dem sich kein Pfad mehr
      // ableiten laesst; der Klick-Pfad braucht ihn aber, um die Anlage in der
      // Standardanwendung zu oeffnen. Der Wert stammt aus dem src-Attribut des
      // gerenderten HTML und ist dort bereits attribut-sicher. Ohne
      // Dokument-Pfad steht er in `data-anwendungsbild` (4T-002068, Schritt 1).
      return `<img ${pre}${herkunft}="${src}" src="data:${mime};base64,${data}"${post}>`;
    } catch {
      // Nicht dekodierbar, fehlend oder nicht lesbar: kein Bild, aber auch
      // keine Adresse, die das Fenster selbst lädt (4T-002068).
      return ohneQuelle(pre, post);
    }
  });
}

/**
 * Die HTML-Teile eines Mindmap-Baums durch die Bild-Umwandlung ohne
 * Dokument-Pfad schicken (4T-002068, Schritt 1). Die Mindmap rendert ihre
 * Notizen mit der Markdown-Instanz, aber nicht über renderMarkdown; ein Bild
 * darin kam deshalb mit der geschriebenen Adresse ins Fenster. Die Ansicht
 * kennt keinen Dokument-Pfad; es gilt die feste Wurzel der Bilder der
 * Anwendung, jede andere Adresse verliert ihre Quelle. Ändert den Baum an
 * Ort und Stelle.
 *
 * @param {{ root?: object }|null} ergebnis Ergebnis von mindmapAusDokument.
 * @returns {{ root?: object }|null} dasselbe Ergebnis.
 */
function mindmapBilderAufloesen(ergebnis) {
  const offen = ergebnis && ergebnis.root ? [ergebnis.root] : [];
  while (offen.length > 0) {
    const knoten = offen.pop();
    if (typeof knoten.titelHtml === 'string') {
      knoten.titelHtml = resolveImagesForBase(knoten.titelHtml, null, null);
    }
    for (const notiz of Array.isArray(knoten.notizen) ? knoten.notizen : []) {
      if (notiz && typeof notiz.html === 'string') {
        notiz.html = resolveImagesForBase(notiz.html, null, null);
      }
    }
    if (Array.isArray(knoten.kinder)) offen.push(...knoten.kinder);
  }
  return ergebnis;
}

function mimeForImage(ext) {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

module.exports = { resolveImagesForBase, mindmapBilderAufloesen };
