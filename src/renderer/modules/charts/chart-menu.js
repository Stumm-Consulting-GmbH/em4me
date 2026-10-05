// 4T-002024 (Epic 3E-000192): Die Einträge der beiden Diagramm-Kommandos für
// die Kontextmenüs.
//
// Zwei Verbraucher mit derselben Eintrags-Form (`appendContextMenuItem` in
// dialogs/context-menu-utils.js): das kurze Menü am Gitter bzw. am gezeichneten
// Diagramm (charts/chart-bedienung.js, über `showContextMenuItems`) und die
// Sektion im Kontextmenü des Editors, wenn die Schreibmarke im Block steht
// (editor/editor-context-menu.js). Beide bekommen genau den einen passenden
// Eintrag (Entscheidung C5 der Sitzung vom 2026-09-30): «Diagramm zu dieser
// Tabelle einfügen» an einer Datentabelle, «Diagramm bearbeiten» an einem
// Diagramm.
//
// Ob das Menü den Eintrag überhaupt zeigen darf (änderbares Dokument,
// Erweiterung an, Spalten-Editor), entscheidet der Aufrufer; hier wird allein
// aus der Lage der Eintrag gebaut. Der Ausführer wird hineingereicht, damit das
// Modul ein Blatt bleibt und nichts importiert.
'use strict';

const EINTRAG = {
  datentabelle: { id: 'chart.insert', key: 'command.chart.insert', dataId: 'chart-insert' },
  diagramm: { id: 'chart.edit', key: 'command.chart.edit', dataId: 'chart-edit' },
};

/**
 * Die Einträge zur Lage.
 *
 * @param {object} arg
 * @param {{inDatentabelle: boolean, diagrammGewaehlt: boolean}|null} arg.lage
 *   Lage aus `lageFuer` (charts/chart-lage.js).
 * @param {Function} [arg.t] Übersetzungs-Funktion; ohne sie trägt der Eintrag
 *   nur den Schlüssel, den `appendContextMenuItem` selbst übersetzt.
 * @param {Function} arg.ausfuehren (kommandoId) => void, mit `chart.insert`
 *   bzw. `chart.edit`.
 * @returns {Array<{key: string, label?: string, dataId: string,
 *   commandId: string, action: Function}>} leer oder genau ein Eintrag;
 *   `commandId` nennt das Kommando für die Prüfung der Wählbarkeit.
 */
export function diagrammEintraege({ lage, t, ausfuehren } = {}) {
  if (!lage || typeof ausfuehren !== 'function') return [];
  const art = lage.diagrammGewaehlt ? 'diagramm' : lage.inDatentabelle ? 'datentabelle' : null;
  if (!art) return [];
  const { id, key, dataId } = EINTRAG[art];
  const eintrag = { key, dataId, commandId: id, action: () => ausfuehren(id) };
  if (typeof t === 'function') eintrag.label = t(key);
  return [eintrag];
}
