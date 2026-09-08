// 4T-001526 (Epic 3E-000169): Der Lauf des bereichsweiten Ersetzens im
// Anzeige-Prozess.
//
// Verbindet die drei Teile, die vorher einzeln entstanden sind: die Auswahl der
// Trefferliste (4T-001525), die Schreib-Strecke im Hauptprozess (4T-001524) und
// die offenen Reiter dieses Fensters.
//
// **Der Auftrag wird geteilt, nicht verdoppelt** (Entscheidung E5). Eine Datei
// mit ungespeicherten Änderungen bekommt die Ersetzung auf ihren PUFFER, als
// eine Rückgängig-Einheit, und bleibt geändert; jede andere geht an den
// Hauptprozess und wird auf der Platte geschrieben. Verworfen wurde das Muster
// des Umbenennens (vorher speichern erzwingen), weil es den Anwender zu
// ungewollten Zwischenständen zwänge. Der Hauptprozess weist eine Datei mit
// abweichendem Puffer ohnehin ab (Grund «offen») — dieser Schnitt hier ist die
// Bedienung, jene Abweisung das Netz darunter.
//
// **Die Ersetzungs-Regel ist geteilt** (`shared/ersetzen-kern.js`): Puffer und
// Platte setzen an derselben Stelle dasselbe ein, sonst hinge das Ergebnis
// daran, ob eine Datei zufällig offen war.
//
// Muster für Puffer-Behandlung und Bericht ist durchgehend die
// Verweis-Nachführung (`modules/views/link-update.js`).
'use strict';

// History-Isolation, damit die programmatische Ersetzung eine eigene
// Rückgängig-Einheit bildet und nicht mit der letzten Nutzer-Eingabe
// verschmilzt (Muster 4T-000345).
import { isolateHistory } from '@codemirror/commands';

import { t } from '../../i18n.js';
import { api } from '../app/api.js';
import { state } from '../app/app-state.js';
import { normalizeForCompare } from '../area.js';
import { paneEditors } from '../editor/editor.js';
import { showLinkReportDialog } from '../dialogs/dialogs.js';
import { invalidatePaneRenderCache, renderPaneContent } from '../views/pane-render.js';
import { renderTabbar } from '../views/tabbar.js';
import { wendeErsetzungenAn } from '../../../shared/ersetzen-kern.js';
// 4T-001531 (Epic 3E-000175): Der Frontmatter-Weg der Tag-Umbenennung, geteilt
// mit dem Hauptprozess aus demselben Grund wie die Ersetzungs-Regel selbst.
import { benenneTagImFrontmatterUm } from '../../../shared/tag-erkennung.js';
import { ausgewaehlteFundstellen } from './search-panel.js';

function gleicherPfad(a, b) {
  return !!a && !!b && normalizeForCompare(a) === normalizeForCompare(b);
}

// Alle Reiter dieses Fensters mit Datei-Pfad, samt ihrer Spalte und ihrem Rang
// darin. Handbuch- und System-Seiten haben keine Datei und bleiben draußen.
function offeneReiter() {
  const treffer = [];
  for (let p = 0; p < state.panes.length; p++) {
    const pane = state.panes[p];
    for (let i = 0; i < pane.tabs.length; i++) {
      const tab = pane.tabs[i];
      if (!tab.path || tab.manualPage || tab.systemPage) continue;
      treffer.push({ tab, paneIdx: p, aktiv: i === pane.activeIndex });
    }
  }
  return treffer;
}

// Eine Datei gilt als «im Puffer», sobald IRGENDEIN Reiter sie mit
// ungespeicherten Änderungen hält. Der Platten-Stand ist dann nicht der Stand,
// auf dem die Suche ihre Fundstellen ermittelt hat.
function istImPuffer(pfad) {
  return offeneReiter().some((r) => r.tab.dirty && gleicherPfad(r.tab.path, pfad));
}

// Anzeigename einer Datei im Bericht: der Dateiname ohne Pfad, wie in der
// Verweis-Nachführung. Der volle Pfad stünde in der Zeile und machte die Liste
// unlesbar; die Trefferliste daneben zeigt ohnehin den Bereichs-Pfad.
function anzeigeName(pfad) {
  return api.basename(pfad);
}

/**
 * Ersetzt in den offenen, geänderten Reitern auf deren Puffer.
 *
 * Der Puffer wird frisch geprüft: Hat der Anwender seit dem Suchlauf getippt,
 * passen die Offsets nicht mehr, und die Datei wird gemeldet statt geraten.
 */
function ersetzeInPuffern(ziele, opts) {
  const geaendert = [];
  const veraendert = [];
  const erledigt = new Set();
  const tag = opts && opts.tag && opts.tag.alt && opts.tag.neu ? opts.tag : null;
  for (const { tab, paneIdx, aktiv } of offeneReiter()) {
    const ziel = ziele.find((z) => gleicherPfad(z.pfad, tab.path));
    if (!ziel) continue;
    const gewirkt = wendeErsetzungenAn(tab.content, ziel.offsets, opts);
    if (!gewirkt.ok) {
      if (!erledigt.has(ziel.pfad)) veraendert.push(ziel.pfad);
      erledigt.add(ziel.pfad);
      continue;
    }
    // 4T-001531 (Epic 3E-000175): Der Frontmatter-Anteil einer Tag-Umbenennung,
    // auf demselben Weg wie im Hauptprozess und in derselben Reihenfolge —
    // erst die Offsets, dann das Feld. Ein offener Reiter soll dasselbe
    // Ergebnis tragen wie die Datei daneben, die gerade nicht offen war.
    let text = gewirkt.text;
    let anzahl = gewirkt.anzahl;
    if (tag && ziel.frontmatter && ziel.frontmatter.length > 0) {
      const imFeld = benenneTagImFrontmatterUm(text, {
        alt: tag.alt,
        neu: tag.neu,
        indizes: ziel.frontmatter,
        schreibe: api.writeFrontmatter,
      });
      if (!imFeld.ok) {
        if (!erledigt.has(ziel.pfad)) veraendert.push(ziel.pfad);
        erledigt.add(ziel.pfad);
        continue;
      }
      text = imFeld.text;
      anzahl += imFeld.anzahl;
    }
    if (text === tab.content) continue;
    const view = paneEditors[paneIdx];
    if (aktiv && view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: isolateHistory.of('full'),
      });
    } else {
      // Nicht sichtbarer Reiter: nur den Puffer setzen; der Doc-Aufbau beim
      // Aktivieren (syncEditorForPane) nutzt tab.content.
      tab.content = text;
    }
    if (!erledigt.has(ziel.pfad)) {
      geaendert.push({ pfad: ziel.pfad, anzahl, imPuffer: true });
      erledigt.add(ziel.pfad);
    }
    renderTabbar(paneIdx);
  }
  return { geaendert, veraendert };
}

// Offene, NICHT geänderte Reiter auf geschriebene Dateien laden den neuen
// Platten-Stand nach (AK4). Ohne diesen Schritt zeigte ein offener Reiter den
// Stand von vorher, während die Datei daneben längst anders aussieht.
async function ladeGeschriebeneNach(geschrieben) {
  const pfade = geschrieben.map((g) => g.pfad);
  for (const { tab, paneIdx, aktiv } of offeneReiter()) {
    if (tab.dirty) continue;
    if (!pfade.some((p) => gleicherPfad(p, tab.path))) continue;
    try {
      const daten = await api.readFile(tab.path);
      if (!daten || !daten.ok) continue;
      tab.content = daten.content;
      tab.originalContent = daten.content;
      tab.dirty = false;
      if (aktiv) {
        invalidatePaneRenderCache();
        renderPaneContent(paneIdx);
      }
      renderTabbar(paneIdx);
    } catch {
      /* Lesefehler: Reiter unveraendert lassen, der Bericht nennt die Datei */
    }
  }
}

// Der Grund eines Fehlschlags als Satz. Die Kennungen kommen aus dem
// Hauptprozess (4T-001524) und aus dem Puffer-Weg; ein unbekannter Grund wird
// wörtlich gezeigt, statt still zu verschwinden.
function grundText(grund) {
  const schluessel = `areaReplace.reason.${grund}`;
  const text = t(schluessel);
  return text === schluessel ? grund : text;
}

function zeigeBericht({ geaendert, fehlgeschlagen, veraendert }) {
  const geaendertZeilen = geaendert.map((g) => ({
    text: anzeigeName(g.pfad),
    detail:
      t('areaReplace.hits').replace('{n}', String(g.anzahl)) +
      (g.imPuffer ? ` · ${t('areaReplace.inBuffer')}` : ''),
  }));
  const fehlerZeilen = fehlgeschlagen.map((f) => ({
    text: anzeigeName(f.pfad),
    detail: grundText(f.grund),
  }));
  const veraendertZeilen = veraendert.map((p) => ({ text: anzeigeName(p) }));
  return showLinkReportDialog({
    title: t('areaReplace.report.title'),
    sections: [
      {
        title: t('areaReplace.report.changed'),
        rows: geaendertZeilen,
        emptyText: t('areaReplace.report.empty'),
      },
      {
        title: t('areaReplace.report.failed'),
        rows: fehlerZeilen,
        emptyText: t('areaReplace.report.empty'),
      },
      {
        title: t('areaReplace.report.stale'),
        rows: veraendertZeilen,
        emptyText: t('areaReplace.report.empty'),
      },
    ],
    okLabel: t('dialog.ok'),
  });
}

/**
 * Führt das bereichsweite Ersetzen über die Auswahl der Trefferliste aus.
 *
 * @param {object} opts muster, flags, ersetzung, regexModus. Bei einer
 *   Tag-Umbenennung (4T-001531) zusätzlich `tag` mit altem und neuem Namen;
 *   `opts` reist als Ganzes zum Hauptprozess, ein weiterer Schnitt entstünde
 *   sonst allein aus dieser Ergänzung.
 * @returns {Promise<object|null>} Das zusammengeführte Ergebnis, oder null,
 *   wenn nichts ausgewählt war.
 */
export async function ersetzeAuswahlImBereich(opts) {
  const auswahl = ausgewaehlteFundstellen();
  if (auswahl.length === 0) return null;

  // Der Schnitt zwischen Puffer und Platte. Er läuft VOR dem Auftrag, damit
  // der Hauptprozess die Puffer-Dateien gar nicht erst als «offen» abweisen
  // muss — die Abweisung bleibt das Netz für alles, was hier durchrutscht.
  const imPuffer = auswahl.filter((z) => istImPuffer(z.pfad));
  const anPlatte = auswahl.filter((z) => !istImPuffer(z.pfad));

  let antwort = { geaendert: [], fehlgeschlagen: [], veraendert: [] };
  if (anPlatte.length > 0) {
    try {
      const roh = await api.replaceInArea({ ...opts, dateien: anPlatte });
      if (roh) {
        antwort = {
          geaendert: Array.isArray(roh.geaendert) ? roh.geaendert : [],
          fehlgeschlagen: Array.isArray(roh.fehlgeschlagen) ? roh.fehlgeschlagen : [],
          veraendert: Array.isArray(roh.veraendert) ? roh.veraendert : [],
        };
      }
    } catch (err) {
      // Ein Fehlschlag der Brücke betrifft den ganzen Platten-Anteil; er wird
      // benannt, statt als «nichts passiert» zu erscheinen.
      antwort.fehlgeschlagen = anPlatte.map((z) => ({
        pfad: z.pfad,
        grund: 'kanal',
        detail: err && err.message ? err.message : String(err),
      }));
    }
  }

  const puffer = ersetzeInPuffern(imPuffer, opts);
  await ladeGeschriebeneNach(antwort.geaendert);

  const ergebnis = {
    geaendert: [...antwort.geaendert, ...puffer.geaendert],
    fehlgeschlagen: antwort.fehlgeschlagen,
    veraendert: [...antwort.veraendert, ...puffer.veraendert],
  };
  await zeigeBericht(ergebnis);
  return ergebnis;
}
