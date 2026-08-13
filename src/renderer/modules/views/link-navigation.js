// --- Link-Aktivierung und Render-Klick --------------------------------------
// 4T-0989 (Epic 3E-0196): aus views.js in den Ordner views/ ausgezogen.
// Gemeinsame Klick-Strecke von Render-Pane und Live-Modus: href aufloesen und
// oeffnen (Datei, Anlage, Bild, Handbuch-Seite, Tag), Task-Status im
// Quelltext toggeln und der Alias-Rueckfall des Wiki-Links.
'use strict';

import { api } from '../app/api.js';
// 4T-0336 (Epic 3E-0061): Unterseiten-Namens-Logik — Expansion relativer
// Ziele ('/Name', '..') gegen den Basename der aktiven Datei.
import {
  expandRelativeTarget,
  isRelativeTarget,
  toFileBasename,
} from '../../../shared/subpages.js';
import { state } from '../app/app-state.js';
// 4T-0365 (Epic 3E-0067): Klick-Pfad des Block-Metadaten-Indikators (oeffnet
// das Block-Eigenschaften-Panel mit dem Anker als Kontext).
import { openBlockPropsForAnchor } from '../properties/block-props-panel.js';
import { paneEditors } from '../editor/editor.js';
// 4T-0204: Toggle-Pfad der Status-Zeichen; seit 4T-0497 folgt der Klick
// der konfigurierten Toggling-Kette (gemeinsame Funktion beider Ansichten).
import { performStatusToggle, isBasicTaskChar } from '../task-states.js';
// 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Abfrage-Treffer
// (Status-Toggle, Verschieben, Bearbeiten) — zentraler Klick-Dispatch.
import { handleTaskQueryAction } from '../task-query-actions.js';
import { activatePane, openInPane, reportMenuStateNow } from '../tabs/tabs.js';
// 4T-0213 (Epic 3E-0042): Handbuch-Link-Resolver — Links in Handbuch-Tabs
// loesen gegen die Seiten-Registry auf statt gegen das Dateisystem.
import { findManualTabAcrossPanes, openManualPage, resolveManualHref } from '../manual.js';
import { showAliasDialog } from '../dialogs/dialogs.js';
import { applyTagsVisibility, persistTagsSettings } from '../properties/properties-tags.js';
import { renderTags } from '../editor/autocomplete-help.js';

import {
  navigateToAnchorInPane,
  scrollToAnchorAfterOpen,
  scrollToLineAfterOpen,
  normalizedAnchorId,
} from './anchor-navigation.js';
import { renderPaneContent } from './pane-render.js';
import { showStatusbarHint } from './views.js';

// --- Link-Aktivierung (gemeinsam fuer Render-Pane und Live-Modus) ----------
// 4T-0082 (Epic 3E-0014): Aus handleRenderedClick extrahierte Klick-Logik.
// Verarbeitet einen href ohne DOM-Bezug; isWikilink steuert den Alias-Fallback
// (relevant nur bei Wiki-Links, deren direkter Datei-Pfad nicht aufloesbar
// ist). Wird sowohl vom Render-Pane-Klick auf <a>-Elementen als auch vom
// Live-Modus-Klick auf cm-live-link/cm-live-wikilink-Decorations aufgerufen.
export async function activateLink(paneIdx, href, isWikilink, baseOverride) {
  if (!href) return;
  activatePane(paneIdx);

  if (/^https?:\/\//i.test(href)) {
    api.openExternal(href);
    return;
  }
  // 4T-0056: Klick auf einen Tag-Link (#tag:<name>) aktiviert den Tag in
  // der Tag-Sidebar (Sektion einblenden falls noetig, Filter setzen).
  if (href.startsWith('#tag:')) {
    const tagName = decodeURIComponent(href.slice(5));
    if (!state.tags.visibleByPane[paneIdx]) {
      state.tags.visibleByPane[paneIdx] = true;
      applyTagsVisibility(paneIdx);
      persistTagsSettings();
      if (paneIdx === state.activePaneIndex && typeof reportMenuStateNow === 'function') {
        reportMenuStateNow();
      }
    }
    state.tags.filterByPane[paneIdx] = tagName;
    renderTags(paneIdx);
    return;
  }
  if (href.startsWith('#')) {
    // 4T-0054: Anker im selben Dokument. K-02 (4T-0186): modusbewusst —
    // im Live-/Source-Modus wird die Heading- bzw. Block-Anker-Zeile im
    // Editor angesprungen statt ins unsichtbare Render-DOM zu scrollen.
    navigateToAnchorInPane(paneIdx, href.slice(1));
    return;
  }
  if (/^[a-z]+:/i.test(href)) {
    if (href.startsWith('mailto:')) api.openExternal(href);
    return;
  }
  // 4T-0054: Pfad und Anker trennen. Nach dem Oeffnen der Ziel-Datei
  // scrollen wir zum Anker (Heading-Slug oder Block-ID).
  const hashIdx = href.indexOf('#');
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const anchorPart = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';
  const pane = state.panes[paneIdx];
  if (!pane || pane.activeIndex < 0) return;
  const baseTab = pane.tabs[pane.activeIndex];
  // 4T-0213: Handbuch-Tabs sind pfadlos — relative Links werden gegen die
  // Seiten-Registry aufgeloest (Ziel-Seite oeffnen bzw. aktivieren,
  // optional zum Anker scrollen), nicht gegen das Dateisystem. Nicht
  // registrierte Ziele bleiben bewusst wirkungslos.
  if (baseTab.manualPage && !baseOverride) {
    const hashIdxManual = href.indexOf('#');
    const manualPathPart = hashIdxManual >= 0 ? href.slice(0, hashIdxManual) : href;
    const manualAnchorPart = hashIdxManual >= 0 ? href.slice(hashIdxManual + 1) : '';
    const pageId = resolveManualHref(manualPathPart);
    if (pageId) {
      await openManualPage(pageId);
      if (manualAnchorPart) {
        const target = findManualTabAcrossPanes(pageId);
        if (target) scrollToAnchorAfterOpen(target.paneIdx, manualAnchorPart);
      }
    }
    return;
  }
  // R2-02 (4T-0174): Links in Markdown-Embeds loesen gegen die Embed-Datei
  // auf (baseOverride aus data-embed-base), nicht gegen den Pane-Tab.
  const basePath = baseOverride || baseTab.path;
  // 4T-0336 (Epic 3E-0061): relative Unterseiten-Links ('/Name.md', '..')
  // gegen den Basename der aktiven bzw. Embed-Basis-Datei expandieren.
  // Ergebnis ist die U+2215-Dateinamens-Form; danach laeuft der normale
  // Aufloesungs-Weg (dokument-relativ, dann Index-Fallback).
  let effectivePath = pathPart;
  if (isWikilink && isRelativeTarget(pathPart)) {
    if (!basePath) return;
    const activeBase = api.basename(basePath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const targetNoExt = pathPart.replace(/\.(md|markdown|mdown|mkd)$/i, '');
    const expanded = expandRelativeTarget(activeBase, targetNoExt);
    if (!expanded) return; // '..' auf einer Top-Level-Seite
    effectivePath = expanded + '.md';
  }
  const resolved = await api.resolveLink(basePath, effectivePath);
  if (!resolved) return;
  const exists = await api.fileExists(resolved);
  if (!exists) {
    if (isWikilink && basePath) {
      // 4T-0337 (Epic 3E-0061): deterministischer Versuch ohne Index —
      // Unterseiten liegen konventionell im Ordner der Elternseite, also
      // '/' -> U+2215 im selben Ordner uebersetzen (Ordner-Pfad-Match hat
      // durch den fileExists-Check oben weiterhin Vorrang).
      if (/[/\\]/.test(effectivePath)) {
        const translated = toFileBasename(effectivePath.replace(/\\/g, '/'));
        const cand = await api.resolveLink(basePath, translated);
        if (cand && (await api.fileExists(cand))) {
          // 4T-0631 (Epic 3E-0102): Link-Klicks im Dokument-Inhalt erben die
          // Tab-Gruppe des Quell-Tabs (gilt fuer alle openInPane-Aufrufe der
          // Link-Aufloesung hier; activateLink wird nur von den Klick-Pfaden
          // des Render-Panes und des Live-Modus gerufen).
          const realPane = await openInPane(paneIdx, [cand], { inheritGroup: true });
          if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
          return;
        }
      }
      // B-13 (4T-0175): Suchraum-Fallback ueber den Backlinks-Index —
      // was das Panel als Treffer meldet (Aufloesung ueber den ganzen
      // Suchraum), muss auch klickbar sein. Erst Datei-Treffer im Index,
      // dann der bestehende Alias-Fallback.
      // 4T-0336: volle logische Ziel-Form statt nur des Basenames — der
      // Resolver matcht Pfad-Form (B-13) und Unterseiten-Form; fuehrende
      // './'-/'../'-Ordner-Segmente traegt der Suffix-Match nicht.
      const basename = effectivePath
        .replace(/\.(md|markdown|mdown|mkd)$/i, '')
        .replace(/\\/g, '/')
        .replace(/^(\.\.?\/)+/, '');
      try {
        const idx = await api.resolveWikiTargetInIndex(basePath, basename);
        if (idx && idx.status === 'ready' && idx.candidates.length > 0) {
          const target =
            idx.candidates.length === 1
              ? idx.candidates[0]
              : await showAliasDialog(basename, idx.candidates);
          if (target) {
            // R4-09 (4T-0186): tatsaechliche Ziel-Pane verwenden — die
            // Datei kann in der anderen Spalte bereits offen sein.
            const realPane = await openInPane(paneIdx, [target], { inheritGroup: true });
            if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
          }
          return;
        }
      } catch {
        /* Index nicht verfuegbar — weiter zum Alias-Fallback */
      }
      // 4T-0050 (Epic 3E-0010): Alias-Fallback. Eindeutiger Treffer oeffnet
      // direkt; mehrdeutiger Treffer zeigt den Disambiguation-Dialog.
      const aliasTarget = await tryResolveByAlias(basePath, resolved);
      if (aliasTarget) {
        const realPane = await openInPane(paneIdx, [aliasTarget], { inheritGroup: true });
        if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
      }
    }
    return;
  }
  const isMd = await api.isMarkdownPath(resolved);
  if (!isMd) {
    // 4T-0790 (Epic 3E-0125): Ein Verweis auf eine Nicht-Markdown-Datei blieb
    // hier bisher wirkungslos — eine eingefuegte Anlage waere damit sichtbar,
    // aber unerreichbar gewesen. Jetzt oeffnet sie die Standardanwendung. Die
    // beiden Grenzen (Wurzel, Rueckfrage bei ausfuehrbaren Endungen) liegen im
    // Hauptprozess, damit sie fuer jeden Aufrufer identisch gelten.
    await oeffneAnlage(paneIdx, resolved);
    return;
  }
  // R4-09 (4T-0186): tatsaechliche Ziel-Pane verwenden.
  const realPane = await openInPane(paneIdx, [resolved], { inheritGroup: true });
  if (anchorPart) scrollToAnchorAfterOpen(realPane, anchorPart);
}

// 4T-0790 (Epic 3E-0125): Bild-Quelle aus dem Dokument (relativer Pfad) gegen
// die aktive Datei aufloesen und oeffnen. Gemeinsame Strecke von Render-Klick
// und Editor-Doppelklick.
export async function oeffneBildAusQuelle(paneIdx, quelle) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  if (!tab || !tab.path) return false;
  let dekodiert = quelle;
  try {
    dekodiert = decodeURI(quelle);
  } catch {
    /* literales '%' im Namen: unkodiert weiterverwenden */
  }
  const absolut = await api.resolveLink(tab.path, dekodiert);
  if (!absolut) return false;
  return oeffneAnlage(paneIdx, absolut);
}

// 4T-0790 (Epic 3E-0125): Anlage oeffnen und einen Misserfolg sichtbar machen.
// Gemeinsame Strecke von Link-Klick, Bild-Klick und Wiki-Embed, damit die
// Meldungen und die Grenzen nicht dreimal ausgelegt werden.
export async function oeffneAnlage(paneIdx, absolutePfad) {
  const pane = state.panes[paneIdx];
  const tab = pane && pane.activeIndex >= 0 ? pane.tabs[pane.activeIndex] : null;
  let ergebnis;
  try {
    ergebnis = await api.openAttachment({
      pfad: absolutePfad,
      dokumentPfad: (tab && tab.path) || '',
    });
  } catch (err) {
    ergebnis = { ok: false, error: (err && err.message) || String(err) };
  }
  if (ergebnis && ergebnis.ok) return true;
  // Ein vom Anwender abgebrochener Bestaetigungs-Dialog ist kein Fehler und
  // bekommt deshalb keine Meldung.
  const grund = ergebnis && ergebnis.error;
  if (grund === 'abgebrochen') return false;
  const key =
    grund === 'ausserhalb-der-wurzel'
      ? 'attachments.open.outsideRoot'
      : grund === 'nicht-gefunden' || grund === 'kein-file'
        ? 'attachments.open.notFound'
        : 'attachments.open.failed';
  showStatusbarHint(key, { error: true, duration: 4000 });
  return false;
}

// --- Render-Klick (Markdown-Links) ------------------------------------------
// Duenner Wrapper um activateLink: extrahiert href und Wikilink-Flag aus
// dem <a>-Element des Render-Panes.
export async function handleRenderedClick(e, paneIdx) {
  // K-11 (4T-0186): Task-Checkbox-Klick im Render-Pane — toggelt den
  // Marker im Quelltext (Paritaet zum Live-Modus-Task-Toggle).
  if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
    toggleTaskFromRendered(paneIdx, e.target);
    return;
  }
  // 4T-0204: Klick auf eine erweiterte Status-Box — gleiche Mechanik,
  // Semantik: erweiterter Status wird abgeschlossen (`[x]`).
  const stateBox = e.target instanceof Element ? e.target.closest('.task-state-box') : null;
  if (stateBox) {
    toggleTaskFromRendered(paneIdx, stateBox);
    return;
  }
  // 4T-0355 (Epic 3E-0065): Klick auf einen Frontmatter-Abfrage-Eintrag öffnet
  // die exakte Zieldatei über den absoluten Index-Pfad (data-fm-path), ohne
  // erneute Namensauflösung. Vor der generischen <a>-Behandlung, weil die
  // Einträge selbst <a href="#"> sind. 4T-0409 (Epic 3E-0077): Block-Treffer
  // tragen zusätzlich data-fm-anchor ('^id') — nach dem Öffnen springt die
  // bestehende Anker-Mechanik zum Block (modusbewusst, wie der Wiki-Link).
  // 4T-0504 (Epic 3E-0096): Rueckschreib-Aktionen der Task-Treffer (Status-
  // Toggle, Verschieben, Bearbeiten) — vor dem Treffer-Link, weil die
  // Aktions-Elemente innerhalb desselben Listen-Eintrags liegen.
  if (handleTaskQueryAction(e.target, paneIdx)) {
    e.preventDefault();
    return;
  }
  const fmItem = e.target instanceof Element ? e.target.closest('[data-fm-path]') : null;
  if (fmItem && fmItem.dataset.fmPath) {
    e.preventDefault();
    activatePane(paneIdx);
    const fmAnchor = fmItem.dataset.fmAnchor || '';
    // 4T-0502 (Epic 3E-0096): Task-Treffer tragen die Quell-Zeile — nach dem
    // Öffnen springt der modusbewusste Zeilen-Sprung dorthin.
    const fmLine = parseInt(fmItem.dataset.fmLine || '', 10);
    // 4T-0631 (Epic 3E-0102): Abfrage-Treffer-Klick im Dokument erbt die Gruppe.
    const realPane = await openInPane(paneIdx, [fmItem.dataset.fmPath], { inheritGroup: true });
    if (fmAnchor) scrollToAnchorAfterOpen(realPane, normalizedAnchorId(fmAnchor));
    else if (Number.isFinite(fmLine)) scrollToLineAfterOpen(realPane, fmLine);
    return;
  }
  // 4T-0365 (Epic 3E-0067): Klick auf den Block-Metadaten-Indikator öffnet das
  // Panel „Block-Eigenschaften" mit dem Anker als Kontext (vor der generischen
  // <a>-Behandlung — der Indikator ist ein <button>, kein Link).
  const metaInd = e.target instanceof Element ? e.target.closest('.block-meta-indicator') : null;
  if (metaInd && metaInd.dataset.anchorId) {
    e.preventDefault();
    openBlockPropsForAnchor(paneIdx, metaInd.dataset.anchorId);
    return;
  }
  // 4T-0790 (Epic 3E-0125): Klick auf ein eingebettetes Bild oeffnet es in der
  // Standardanwendung. Ein Bild ist kein Link und faellt sonst durch den
  // closest('a')-Zweig unten hindurch, ohne dass etwas geschieht. In der
  // Render-Ansicht genuegt der einfache Klick, weil es hier keine Schreibmarke
  // gibt (PO-Festlegung 2026-07-29; im Editor gilt der Doppelklick).
  //
  // Der Pfad wird aus dem Quelltext-Attribut geholt, nicht aus `src`: Dort
  // steht nach der Aufloesung ein data:-URI, aus dem sich kein Pfad mehr
  // ableiten laesst.
  if (e.target instanceof HTMLImageElement) {
    const quelle = e.target.getAttribute('data-src-original') || '';
    if (quelle && !/^(https?:|data:)/i.test(quelle)) {
      e.preventDefault();
      await oeffneBildAusQuelle(paneIdx, quelle);
      return;
    }
  }
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  // R2-02 (4T-0174): Klicks innerhalb eines Markdown-Embeds tragen die
  // Embed-Datei als Resolve-Basis (data-embed-base am Embed-Body).
  const embedBody = a.closest('.wiki-embed-md-body');
  const baseOverride =
    embedBody && embedBody.dataset.embedBase ? embedBody.dataset.embedBase : null;
  await activateLink(paneIdx, href, a.classList.contains('wikilink'), baseOverride);
}

// K-11 (4T-0186): Klick auf eine Task-Checkbox im Render-Pane. Das <li>
// traegt die Quell-Zeile (sourceLineMapper); dort wird der Marker
// `[ ]`/`[x]` im Editor-Doc getoggelt. Der UpdateListener pflegt danach
// tab.content, Dirty-Flag und (im Split) die Vorschau; das native
// Checkbox-Visual toggelt der Browser selbst — DOM und Quelle bleiben
// damit auch ohne Re-Render des Reading-Panes synchron.
export function toggleTaskFromRendered(paneIdx, checkboxEl) {
  // Checkboxen in Markdown-Embeds bleiben passiv: deren data-source-line
  // bezieht sich auf die Embed-Datei, nicht auf das aktive Doc.
  if (checkboxEl.closest('.wiki-embed-md-body')) return;
  // 4T-0213: im read-only Handbuch-Tab bleibt der Status-Klick inert
  // (EditorState.readOnly blockiert programmatische Dispatches nicht).
  const paneForGuard = state.panes[paneIdx];
  const tabForGuard =
    paneForGuard && paneForGuard.activeIndex >= 0
      ? paneForGuard.tabs[paneForGuard.activeIndex]
      : null;
  if (tabForGuard && tabForGuard.manualPage) return;
  const li = checkboxEl.closest('li[data-source-line]');
  const view = paneEditors[paneIdx];
  if (!li || !view) return;
  const ln = parseInt(li.dataset.sourceLine, 10);
  // 4T-0497: der Klick folgt der konfigurierten Toggling-Kette (Basis
  // `[ ]` <-> `[x]` fest, erweiterte Status auf ihr Folge-Symbol); der
  // Dispatch samt Undo-Haertung (4T-0484) liegt in performStatusToggle.
  const toggle = performStatusToggle(view, ln);
  if (!toggle) return;
  // 4T-0204: sobald eine Status-Box beteiligt ist (Quelle oder Ziel),
  // aendert sich die Darstellung (Box <-> Checkbox bzw. Glyph/Farbe);
  // anders als beim nativen Checkbox-Visual (K-11) muss das Reading-Pane
  // dann neu rendern. renderPaneContent stellt die Scroll-Position aus
  // tab.scrollRen wieder her.
  if (!isBasicTaskChar(toggle.fromChar) || !isBasicTaskChar(toggle.toChar)) {
    renderPaneContent(paneIdx);
  }
}

// 4T-0050: Hilfsfunktion fuer den Wiki-Link-Alias-Fallback. Bekommt den
// auf den Basispfad aufgeloesten Datei-Pfad (der nicht existiert) und
// extrahiert daraus den Wiki-Link-Basename. Dann Backend-Lookup im
// Alias-Index. Bei keinem Treffer liefert die Funktion null (Renderer
// macht nichts weiter, Linter markiert den Link als broken). Bei einem
// Treffer den Pfad; bei mehreren den vom Nutzer im Dialog gewaehlten.
export async function tryResolveByAlias(activeFilePath, resolvedPath) {
  // Wiki-Link-Plugin (src/shared/markdown/plugins.js) haengt '.md' an, wenn das Ziel keine
  // Extension hat. Wir muessen den Basename ohne Extension extrahieren,
  // damit er gegen die Alias-Eintraege gematcht werden kann (Aliases sind
  // ohne Extension).
  const basename = api.basename(resolvedPath).replace(/\.(md|markdown|mdown|mkd)$/i, '');
  if (!basename) return null;
  let result;
  try {
    result = await api.resolveWikiTargetByAlias(activeFilePath, basename);
  } catch {
    return null;
  }
  if (!result || result.status !== 'ready') return null;
  const candidates = result.candidates || [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Mehrdeutigkeit: Auswahl-Dialog.
  return await showAliasDialog(result.viaAlias || basename, candidates);
}
