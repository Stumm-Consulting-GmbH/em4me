// 4T-000512 (Epic 3E-000092), ausgezogen mit 4T-001777 (Epic 3E-000291):
// Beschriftungen der Ausgabe-Wege, die ihre Texte selbst beisteuern — der
// Ereignis-Export, die Kalender-Spannen, der Canvas-Block und die Canvas-Fläche
// im portablen Export.
//
// **Warum eine eigene Datei.** `markdown.js` steht auf seinem eingefrorenen
// Größen-Wert, und die Beschriftungs-Auflösung ist die eine Fachlichkeit darin,
// die mit der Pipeline nichts zu tun hat: Sie liest einen Katalog von Platte und
// löst Schlüssel auf, während die Pipeline Markdown in HTML wandelt. Derselbe
// Schnitt hat 4T-000994 bereits den Whitelist-Sanitizer herausgelöst und die
// Datei um rund neunzig Zeilen verkleinert; die als riskant benannte Stelle ist
// der Instanz-Aufbau mit seiner semantiktragenden Reihenfolge, und der bleibt
// unberührt.
//
// Dieses Modul läuft nur in Preload und Node-Tests (nie im Renderer-Bundle) —
// die Sprachdatei wird deshalb lazy von Platte gelesen (asar-transparent); jeder
// Fehlschlag fällt weich auf die Key-Namen zurück.
'use strict';

// 4T-000391 (Epic 3E-000129): Sprachliste aus der einen Quelle.
const { isLocale, FALLBACK_LOCALE } = require('../locales.js');
const { CALENDAR_SPAN_LABEL_KEYS } = require('./plugins.js');
const { PORTABLE_EVENT_LABEL_KEYS } = require('./perspective-events.js');
const { CANVAS_BLOCK_LABEL_KEYS } = require('./canvas-block.js');
const { CANVAS_PORTABEL_LABEL_KEYS } = require('../canvas/canvas-portabel.js');
// 4T-001548 (Epic 3E-000251): der Datensatz-Block. Beim Rebase auf das Release
// 1.137.0 aus `markdown.js` hierher übernommen — jenes Release hat die Gruppe
// dort hinzugefügt, während dieser Vorgang die Auflösung herausgelöst hat.
const { RECORD_LABEL_KEYS } = require('./perspective-records-html.js');

const portableLabelCache = new Map();
// 4T-001595 (Epic 3E-000129): Die gelesenen Kataloge selbst, getrennt von den
// daraus gewonnenen Beschriftungen — der englische wird jetzt als Rückfall je
// Schlüssel gebraucht, also auch dann, wenn die Beschriftungen einer anderen
// Sprache gefragt sind.
const portableDictCache = new Map();

/** Katalog einer mitgelieferten Sprache von Platte, gemerkt. */
function mitgelieferterKatalog(code) {
  if (portableDictCache.has(code)) return portableDictCache.get(code);
  let dict = {};
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'i18n', `${code}.json`), 'utf8'),
    );
  } catch {
    // Key-Fallback (Labels bleiben die Key-Namen) — Export funktioniert.
  }
  portableDictCache.set(code, dict);
  return dict;
}

/**
 * Beschriftungen des Ereignis-Portable-Pfads.
 *
 * 4T-001594 (Epic 3E-000129), zwei Änderungen, beide vom Product Owner am
 * 2026-09-10 entschieden:
 *
 * **Der Rückfall geht auf `FALLBACK_LOCALE` statt auf `'de'`** (Frage 3, AK5).
 * Bis dahin fiel dieser dritte Leser als einziger auf Deutsch zurück, während
 * Anzeige- und Hauptprozess auf Englisch fallen; 4T-000391 hatte die
 * Abweichung bewusst stehen lassen, um mit der Zusammenführung der Liste kein
 * Verhalten zu ändern. Verbreitete Katalog-Bibliotheken (gettext, ICU,
 * i18next) kennen genau EINE konfigurierte Rückfall-Sprache, und die steht in
 * `locales.js`. Betroffen sind allein die Beschriftungen des Ereignis-Exports
 * bei einer Sprache, die kein Leser kennt.
 *
 * **`labelCatalog` versorgt eine eingespielte eigene Sprache.** Dieses Modul
 * liegt in `src/shared` und kennt kein Benutzerprofil; es kann den Katalog
 * einer eigenen Sprache nicht selbst von Platte holen. Der Aufrufer gibt ihn
 * mit, und die Beschriftungs-Gruppen werden daraus aufgelöst — ohne
 * Zwischenspeicher, weil der Katalog zur Laufzeit wechselt und nicht an einem
 * Sprach-Code hängt, der ihn eindeutig benennen würde.
 *
 * 4T-001595 (Epic 3E-000129): **Ein fehlender Schlüssel fällt auf die englische
 * Fassung zurück**, nicht mehr auf den Schlüssel-Namen — dieselbe Kette wie im
 * Anzeige- und im Hauptprozess (eingestellte Sprache → Englisch →
 * Schlüssel-Name), damit die Anwendung nicht je Prozess anders antwortet. Der
 * Zweig der mitgelieferten Fassungen geht sie mit: Dort ist sie bei schlüssel-
 * gleichen Katalogen wirkungslos, und genau das ist die Zusicherung.
 *
 * @param {string} lang Sprach-Code einer mitgelieferten Fassung.
 * @param {Record<string, string>} [labelCatalog] Katalog einer eigenen Sprache.
 * @returns {Record<string, string>} Beschriftungen, nach Schlüssel.
 */
function portableLabels(lang, labelCatalog) {
  const englisch = mitgelieferterKatalog(FALLBACK_LOCALE);
  if (labelCatalog && typeof labelCatalog === 'object') return labelsAus(labelCatalog, englisch);
  // 4T-000391: Liste aus der einen Quelle.
  const lc = isLocale(lang) ? lang : FALLBACK_LOCALE;
  if (portableLabelCache.has(lc)) return portableLabelCache.get(lc);
  const labels = labelsAus(mitgelieferterKatalog(lc), englisch);
  portableLabelCache.set(lc, labels);
  return labels;
}

/**
 * Die Beschriftungs-Gruppen aus einem Katalog herauslösen (seit dem Rebase auf
 * das Release 1.137.0 fünf: Ereignisse, Kalender-Spannen, Canvas-Block,
 * Canvas-Export und Datensatz-Block).
 *
 * 4T-001595: `rueckfall` füllt je Schlüssel auf, was der Katalog nicht kennt.
 * Kennt ihn auch der Rückfall nicht, bleibt die Beschriftung wie bisher aus —
 * der Aufrufer zeigt dann den Schlüssel-Namen.
 */
function labelsAus(dict, rueckfall) {
  const labels = {};
  for (const key of [
    ...PORTABLE_EVENT_LABEL_KEYS,
    ...CALENDAR_SPAN_LABEL_KEYS,
    ...CANVAS_BLOCK_LABEL_KEYS,
    ...CANVAS_PORTABEL_LABEL_KEYS,
    ...RECORD_LABEL_KEYS,
  ]) {
    if (typeof dict[key] === 'string') labels[key] = dict[key];
    else if (rueckfall && typeof rueckfall[key] === 'string') labels[key] = rueckfall[key];
  }
  return labels;
}

module.exports = { portableLabels, labelsAus, mitgelieferterKatalog };
