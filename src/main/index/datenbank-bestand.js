// 4T-001510 (Epic 3E-000250): Die Index-Sicht, aus der der Katalog seinen
// Bestand bildet.
//
// Der Katalog beantwortet, welche Tabellen es gibt und wie sie definiert sind;
// **welche Dateien überhaupt in Frage kommen**, weiß allein der Index. Dieses
// Modul ist die Naht dazwischen: Es löst die Wurzel auf, reicht den Status
// unverändert durch und liefert die Sicht mit Puffer-Overlay. Mehr tut es
// nicht — die Auslegung der Definitionen liegt im Katalog unter
// `src/main/database/`, der dadurch ohne den Index prüfbar bleibt.
//
// Read-only ohne eigenen Scan wie die Nachbarn in diesem Ordner: Der
// Index-Aufbau bleibt Sache des Aufrufers, hier wird nur gelesen. Die
// Status-Semantik ist die von `eventsForQuery` und `frontmatterQueryFor`, damit
// ein Aufrufer nicht je Auskunft eine andere Fallunterscheidung braucht.

'use strict';

const { indexes, resolveRootInfo } = require('./store.js');
const { entryWithOverlay, overlaysUnder } = require('./overlay.js');

/**
 * Sicht auf den Datenbank-Bestand einer Wurzel.
 *
 * 4T-001758 (Epic 3E-000253): Eine Datei ist nicht mehr Bedingung, ein
 * gebundener Bereich genügt. Grund ist die Frage nach der Bereichs-ART: Sie
 * gehört dem Bereich und nicht einem Dokument darin, und die Einstellungs-Seite
 * stellt sie, ohne dass ein Reiter offen sein muss. Der Weg dorthin lag bereits
 * offen — `resolveRootInfo` nimmt seit 4T-001514 den Bereich als Wurzel, wenn
 * keine Datei da ist, und `ensureIndexForDemand` baut ihn dann auch auf; allein
 * die Vorprüfung hier stand davor. Ohne BEIDES bleibt es bei `unavailable`.
 *
 * @param {string|null} filePath Datei, über die die Wurzel bestimmt wird.
 * @param {string|null} areaRoot Bereichs-Wurzel des Fensters, falls vorhanden.
 * @returns {object} { status, meta, sicht } — `sicht` ist null, solange der
 *   Index nicht bereit ist; der Status sagt dann, warum.
 */
function datenbankSicht(filePath, areaRoot) {
  if (!filePath && !areaRoot) return { status: 'unavailable', meta: null, sicht: null };
  const { root } = resolveRootInfo(filePath, areaRoot);
  if (!root) return { status: 'unavailable', meta: null, sicht: null };
  const entry = indexes.get(root);
  if (!entry) return { status: 'unavailable', meta: null, sicht: null };
  const meta = { wurzel: root };
  if (entry.status === 'oversized') {
    return {
      status: 'oversized',
      meta: { ...meta, fileCount: entry.fileCount, byteSize: entry.byteSize },
      sicht: null,
    };
  }
  if (entry.status === 'indexing') return { status: 'indexing', meta, sicht: null };
  if (entry.status === 'error') return { status: 'error', meta, sicht: null };
  // 4T-001510: Die Sicht mit Overlay, damit eine offene, noch nicht
  // gespeicherte Tabelle im Katalog erscheint (E25).
  return { status: 'ready', meta, sicht: entryWithOverlay(entry, overlaysUnder(root)) };
}

module.exports = { datenbankSicht };
