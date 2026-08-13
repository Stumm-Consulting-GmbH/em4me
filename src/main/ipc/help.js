// IPC-Kanal-Gruppe Handbuch: Loader der gebuendelten Handbuch-Seiten, einzeln
// und als Sammel-Abruf einer Sprache fuer die Handbuch-Suche.
//
// Auszug aus main.js, 4T-1000 (Epic 3E-0196). Kanal-Gruppe: help:*.
//
// Eigener Zustand: keiner, und keine Deps: Der Sicherheits-Kontrakt haengt
// allein an der Seiten-Registry (Whitelist statt Pfad aus Renderer-Input).
// Der Helfer ladeGebuendelteSeite bedient beide Kanaele.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { MANUAL_PAGES, manualPageById } = require('../../shared/manual/manual-pages');

/**
 * Registriert die Handbuch-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} _deps Abhaengigkeiten aus main.js (dieses Modul braucht keine).
 */
function registerHelpIpc(handle, _deps) {
  // 4T-0213 (Epic 3E-0042): Generischer Handbuch-Seiten-Loader. Liefert
  // die gebuendelte Seite src/i18n/help/<pageId>.<locale>.md — pageId
  // strikt gegen die Seiten-Registry geprueft (Whitelist statt Pfad aus
  // Renderer-Input), Locale-Sanitizing und Fallback Englisch. Mit 4T-0216
  // ist der fruehere Spezial-Loader fuer die Tabellen-Hilfeseite (4T-0036)
  // hierin aufgegangen.
  // X-05 (4T-0182): Das fs-Lesen hier funktioniert auch IN der asar
  // (Electron patcht fs transparent). Der asarUnpack-Eintrag fuer
  // src/i18n/**/* in package.json existiert fuer den RENDERER, der seine
  // Sprachdateien per fetch('../i18n/<lang>.json') laedt (i18n.js) —
  // fetch kann nicht in die asar greifen.
  // 4T-0758 (Epic 3E-0142): Die Datei-Aufloesung liegt in einem Helfer,
  // weil sie seither zwei Aufrufer hat (Einzel-Seite und Sammel-Abruf der
  // Suche). Zwei Fassungen wuerden beim naechsten Eingriff auseinander
  // laufen, etwa beim Fallback-Verhalten.
  const ladeGebuendelteSeite = async (page, locale) => {
    if (!page || page.source !== 'bundled') return '';
    const safe = typeof locale === 'string' ? locale.toLowerCase().replace(/[^a-z-]/g, '') : '';
    const candidates = [];
    if (safe) candidates.push(safe);
    if (!candidates.includes('en')) candidates.push('en');
    for (const code of candidates) {
      try {
        const file = path.join(__dirname, '..', '..', 'i18n', 'help', `${page.id}.${code}.md`);
        return await fs.readFile(file, 'utf8');
      } catch (_err) {
        // weiter zum naechsten Kandidaten
      }
    }
    return '';
  };

  handle('help:getManualPage', async (_event, pageId, locale) =>
    ladeGebuendelteSeite(manualPageById(pageId), locale),
  );

  // 4T-0758 (Epic 3E-0142): Alle gebuendelten Seiten einer Sprache in einem
  // Zug, fuer die Suche ueber das ganze Handbuch. Die generierten Seiten
  // entstehen im Renderer und sind hier bewusst nicht enthalten; der
  // Sicherheits-Kontrakt bleibt unveraendert, weil ueber die Registry
  // iteriert wird und kein Renderer-Input in einen Pfad geht.
  handle('help:getAllManualPages', async (_event, locale) => {
    const gebuendelt = MANUAL_PAGES.filter((p) => p.source === 'bundled');
    const inhalte = await Promise.all(gebuendelt.map((p) => ladeGebuendelteSeite(p, locale)));
    return gebuendelt.map((p, i) => ({ id: p.id, text: inhalte[i] }));
  });
}

module.exports = { registerHelpIpc };
