// 4T-002163 (Epic 3E-000149): Der Weg zu einer neuen Praesentation — ein neues
// Dokument mit fertigem Startinhalt, geoeffnet in der Praesentations-Ansicht
// (Story 4S-001055).
//
// **Vorbild** ist der Befehl, der eine neue Kanban-Tafel anlegt
// (kanban-anlegen.js, `legeNeueTafelAn`): ein unbenanntes Dokument ueber den
// Weg von «Datei → Neu», der Ansichts-Modus beim Anlegen mitgegeben statt
// nachtraeglich geschaltet, der Startinhalt in der eingestellten Sprache.
//
// **Der Zugang wird beim Aufruf hereingereicht** statt beim Start verdrahtet:
// Der Befehl braucht nur den Weg «neues Dokument», und den haben die beiden
// Aufrufer (Kommando-Tabelle und Menue-Bindung) ohnehin zur Hand. Eine
// Verdrahtung in app-init.js ersparte nichts und kostete dort Zeilen eines
// eingefrorenen Budgets. Ein Import des Fenster-Zustands entfaellt damit wie
// beim Vorbild; dieser Ordner bleibt aus dem Datei-Zyklus des Renderers.
//
// **Der Startinhalt** traegt das Kennzeichen der Anwendung (`presentation:
// true`, Entscheidung 1a) und die Steuer-Schluessel eines gewoehnlichen
// Foliensatzes (`theme: light`, `paginate: true`), dazu drei Beispiel-Folien:
// Titelfolie, eine Folie mit Liste und Sprecher-Notiz im `%%`-Kommentar und
// eine Folie, die Hintergrundbild und Zweiteilung in Worten zeigt — als Text
// mit Code-Spanne, weil der neue Foliensatz kein Bild hat, auf das er zeigen
// koennte. Die Texte kommen aus den Sprach-Schluesseln `presentation.vorlage.*`;
// die Markdown-Syntax steht hier und nicht in der Uebersetzung.
'use strict';

import { t } from '../../i18n.js';
import { PRESENTATION_VIEW_MODE } from './presentation-modus.js';

/**
 * Der Startinhalt einer neuen Praesentation in der eingestellten Sprache.
 *
 * @param {(key: string) => string} [uebersetze] Uebersetzung (Vorgabe t).
 * @returns {string}
 */
export function praesentationStartInhalt(uebersetze = t) {
  const zweiteilung = uebersetze('presentation.vorlage.zweiteilungText')
    .replace('{bg}', '`![bg](bild.png)`')
    .replace('{links}', '`![bg left](bild.png)`');
  return [
    '---',
    'presentation: true',
    'theme: light',
    'paginate: true',
    '---',
    '',
    `# ${uebersetze('presentation.vorlage.titel')}`,
    '',
    uebersetze('presentation.vorlage.untertitel'),
    '',
    '---',
    '',
    `## ${uebersetze('presentation.vorlage.listeTitel')}`,
    '',
    `- ${uebersetze('presentation.vorlage.punkt1')}`,
    `- ${uebersetze('presentation.vorlage.punkt2')}`,
    `- ${uebersetze('presentation.vorlage.punkt3')}`,
    '',
    `%% ${uebersetze('presentation.vorlage.notiz')} %%`,
    '',
    '---',
    '',
    `## ${uebersetze('presentation.vorlage.zweiteilungTitel')}`,
    '',
    zweiteilung,
    '',
  ].join('\n');
}

/**
 * Legt ein neues Dokument an, das bereits eine Praesentation ist, und oeffnet
 * es in der Praesentations-Ansicht (Kommando `presentation.new`).
 *
 * @param {(optionen: {inhalt: string, viewMode: string}) => unknown} neuesDokument
 *   Der Weg von «Datei → Neu» (newUntitledTab).
 * @returns {boolean}
 */
export function legeNeuePraesentationAn(neuesDokument) {
  if (typeof neuesDokument !== 'function') return false;
  return (
    neuesDokument({ inhalt: praesentationStartInhalt(), viewMode: PRESENTATION_VIEW_MODE }) !==
    false
  );
}
