// 4T-0988 (Epic 3E-0196): Seiten-DOM und Bereichsnavigation der
// Einstellungs-Seite.
//
// Baut das Seiten-Gerüst (Titel, Navigation, Bereichs-Inhalt, Button-
// Leiste), die Vier-Block-Gliederung der Navigation und das Rendern des
// aktiven Bereichs samt Fehler-Zeile und Speicher-Status der
// Schaltflächen. Die DOM-Referenzen liegen modul-lokal und sind nur über
// Zugriffs-Funktionen erreichbar.
'use strict';

import { internalExtensions } from '../../../shared/extensions/extensions.js';
import { getLanguage, t } from '../../i18n.js';
import { state } from '../app/app-state.js';
import {
  allSettingsSections,
  applySettingsPage,
  cancelSettingsPage,
  isSettingsPageDirty,
  okSettingsPage,
  sectionById,
  settingsSections,
} from './settings-page.js';
import { cancelHotkeyCapture } from './settings-hotkeys.js';
import { pageState } from './settings-shared.js';

// --- Seiten-DOM ----------------------------------------------------------------
// Referenzen auf das zuletzt montierte DOM (pro Fenster genau eine Seite).
let pageEls = null;

// 4T-0988 (Epic 3E-0196): Die Referenzen bleiben modul-lokal; der Kern und
// die Entwurfs-Strecke erreichen sie ausschließlich über diese beiden
// Funktionen (kein beschreibbares Binding über eine Modul-Grenze).
export function settingsPageEls() {
  return pageEls;
}

export function setSettingsPageEls(els) {
  pageEls = els;
}

// 4T-0889 (Epic 3E-0168): Vier-Block-Gliederung der Bereichsnavigation
// (PO-Entscheidung, Reihenfolge fest). Die Blöcke in Anzeige-Reihenfolge:
//   general             Kern-Sektionen, also alles ohne Erweiterungs-
//                       Bindung. Die beiden Verwaltungs-Sektionen
//                       „Erweiterungen" und „Erweiterungen (extern)" stehen
//                       darin ganz am Ende (GENERAL_TRAILING_SECTION_IDS).
//   area                die bereichsgebundenen Sektionen (4T-0555), nur bei
//                       gebundenem Bereich; Inhalt und Reihenfolge
//                       unverändert.
//   extensionsInternal  Sektionen aktiver INTERNER Erweiterungen.
//   extensionsExternal  Sektionen installierter EXTERNER Erweiterungen; der
//                       Block erscheint nur, wenn es solche gibt.
const NAV_GROUP_DEFS = [
  { id: 'general', titleKey: 'settings.navGroup.general' },
  { id: 'area', titleKey: 'settings.navGroup.area' },
  { id: 'extensionsInternal', titleKey: 'settings.navGroup.extensionsInternal' },
  { id: 'extensionsExternal', titleKey: 'settings.navGroup.extensionsExternal' },
];

// Verwaltungs-Sektionen der Erweiterungen: sie bleiben im Block
// „Allgemein" (sie konfigurieren keine Erweiterung, sondern verwalten den
// Bestand), rutschen dort aber ans Ende — direkt vor die thematischen
// Blöcke, auf die sie wirken.
const GENERAL_TRAILING_SECTION_IDS = ['extensions', 'extensionsExternal'];

// Sektions-IDs, die zu einer internen Erweiterung gehören. Einzige Quelle
// ist das Feld settingsSections der Erweiterungs-Registry: dieselbe Liste,
// die die Sektion bei abgeschalteter Erweiterung ausblendet
// (disabledSettingsSectionIdSet). Eine zweite, hier gepflegte Zuordnung
// wäre beim ersten neuen Erweiterungs-Bereich auseinandergelaufen.
function internalExtensionSectionIdSet() {
  const ids = new Set();
  for (const m of internalExtensions()) {
    for (const sectionId of m.settingsSections || []) ids.add(sectionId);
  }
  return ids;
}

// 4T-0900 (Register-Paar 12/13-Muster): Beansprucht eine Erweiterung einen
// Bereich, den es nicht gibt (Tippfehler, umbenannter oder entfernter
// Bereich), fiel das bisher still durch: Der Anspruch trifft ins Leere, und
// beim Abschalten der Erweiterung verschwindet nichts. Umgekehrt landet ein
// real registrierter Bereich ohne Anspruch im Block «Allgemein» statt bei den
// Erweiterungen — auch das ohne jede Meldung.
//
// Geprueft wird gegen die UNGEFILTERTE Bereichs-Menge: settingsSections()
// blendet die Bereiche abgeschalteter Erweiterungen aus, und gegen diese
// Liste haette jede abgeschaltete Erweiterung einen Fehlalarm ausgeloest.
//
// Je Kennung nur einmal, weil der Navigations-Aufbau bei jedem Mount, jedem
// Erweiterungs-Umschalten und jedem Bereichs-Wechsel erneut laeuft. Scharf
// wird die Meldung ueber den Konsolen-Waechter der Ablauf-Laeufe (4T-0901).
const gemeldeteFehlAnsprueche = new Set();

function meldeUnerfuellteBereichsAnsprueche(beansprucht) {
  const real = new Set(allSettingsSections().map((s) => s.id));
  for (const id of beansprucht) {
    if (real.has(id) || gemeldeteFehlAnsprueche.has(id)) continue;
    gemeldeteFehlAnsprueche.add(id);
    console.error(
      `Erweiterung beansprucht den Einstellungs-Bereich '${id}', den es nicht gibt: ` +
        'Der Bereich verschwindet beim Abschalten der Erweiterung nicht.',
    );
  }
}

// Block einer Sektion. Die Prüf-Reihenfolge ist bedeutungstragend: eine
// bereichsgebundene Sektion bleibt im Bereichs-Block, auch wenn sie zu
// einer Erweiterung gehört (z.B. journals, templatesArea) — der Bezug zum
// geöffneten Bereich ist für die Bedienung die stärkere Klammer.
function navGroupOfSection(section, extensionSectionIds) {
  if (section.group === 'area') return 'area';
  if (section.origin === 'external') return 'extensionsExternal';
  if (extensionSectionIds.has(section.id)) return 'extensionsInternal';
  return 'general';
}

// Baut die Navigations-Einträge aus der (gefilterten) Bereichs-Liste —
// beim Mount, beim Erweiterungs-Umschalten (4T-0295: erweiterungs-eigene
// Bereiche erscheinen und verschwinden mit ihrer Erweiterung) und beim
// Bereichs-Wechsel (4T-0555). Die Reihenfolge innerhalb eines Blocks folgt
// der Registry-Reihenfolge; Ausnahmen sind die ans Ende gezogenen
// Verwaltungs-Sektionen und der interne Erweiterungs-Block, der
// alphabetisch nach dem lokalisierten Titel sortiert (die Registry-
// Reihenfolge ist dort ohne Aussage, weil Erweiterungen unabhängig
// voneinander dazukommen).
export function buildSettingsNavEntries(nav) {
  nav.innerHTML = '';
  const extensionSectionIds = internalExtensionSectionIdSet();
  meldeUnerfuellteBereichsAnsprueche(extensionSectionIds);
  const byGroup = new Map(NAV_GROUP_DEFS.map((def) => [def.id, []]));
  for (const section of settingsSections()) {
    byGroup.get(navGroupOfSection(section, extensionSectionIds)).push(section);
  }

  const general = byGroup.get('general');
  const trailing = GENERAL_TRAILING_SECTION_IDS.map((id) =>
    general.find((s) => s.id === id),
  ).filter(Boolean);
  byGroup.set('general', [
    ...general.filter((s) => !GENERAL_TRAILING_SECTION_IDS.includes(s.id)),
    ...trailing,
  ]);

  const sprache = getLanguage();
  byGroup
    .get('extensionsInternal')
    .sort((a, b) => t(a.titleKey).localeCompare(t(b.titleKey), sprache));

  for (const def of NAV_GROUP_DEFS) {
    const sections = byGroup.get(def.id);
    if (def.id === 'area' && !state.areaPath) continue;
    if (sections.length === 0) continue;
    const wrap = document.createElement('div');
    wrap.className = 'settings-nav-group';
    wrap.dataset.navGroup = def.id;
    const title = document.createElement('div');
    title.className = 'settings-nav-group-title';
    title.textContent = t(def.titleKey);
    wrap.appendChild(title);
    for (const section of sections) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-nav-entry';
      btn.dataset.sectionId = section.id;
      btn.textContent = t(section.titleKey);
      btn.addEventListener('click', () => activateSection(section.id));
      wrap.appendChild(btn);
    }
    nav.appendChild(wrap);
  }
}

export function refreshSettingsNav() {
  if (!pageEls || !pageEls.nav || !pageEls.nav.isConnected) return;
  for (const btn of pageEls.nav.querySelectorAll('.settings-nav-entry')) {
    const id = btn.dataset.sectionId;
    btn.classList.toggle('active', id === pageState.activeSectionId);
    btn.classList.toggle('has-error', pageState.errors.has(id));
  }
}

// 4T-0554 (Epic 3E-0100): Schaltflächen spiegeln den Speicher-Status.
// Bei ungesicherten Änderungen tragen „Anwenden" und „OK" die Primary-
// Hervorhebung; ohne Änderungen ist „Anwenden" deaktiviert (PO-Entscheidung
// E2), „OK" bleibt immer klickbar (schließt die Seite auch ohne Änderungen).
// Exportiert, damit Bereichs-Module mit eigenem Broadcast-Abgleich
// (sidebar-settings.js) nach einer Entwurfs-Anpassung nachziehen können.
export function refreshSettingsButtons() {
  if (!pageEls || !pageEls.applyBtn || !pageEls.applyBtn.isConnected) return;
  const dirty = isSettingsPageDirty();
  pageEls.applyBtn.disabled = !dirty;
  pageEls.applyBtn.classList.toggle('btn-primary', dirty);
  pageEls.okBtn.classList.toggle('btn-primary', dirty);
}

// Fehlertext des aktiven Bereichs unterhalb des Inhalts (Muster der
// Error-Divs des Modals, seitenweit vereinheitlicht).
export function renderActiveSectionError() {
  if (!pageEls || !pageEls.error || !pageEls.error.isConnected) return;
  const error = pageState.errors.get(pageState.activeSectionId) || null;
  pageEls.error.hidden = !error;
  pageEls.error.textContent = error || '';
}

export function renderActiveSection() {
  if (!pageEls || !pageEls.content || !pageEls.content.isConnected) return;
  if (!pageState.draft) return;
  let section = sectionById(pageState.activeSectionId);
  // 4T-0295: verschwindet der offene Bereich (Erweiterung deaktiviert,
  // z.B. per Broadcast aus einem anderen Fenster), faellt die Seite auf
  // den Bereich „Erweiterungen" zurueck.
  if (!section) {
    pageState.activeSectionId = 'extensions';
    section = sectionById('extensions');
  }
  // 4T-0555: bereichsgebundene Sektionen sind ohne gebundenen Bereich
  // nicht erreichbar (Navigations-Gruppe fehlt) — entfällt die Bindung
  // einer offenen Sektion, fällt die Seite auf den ersten Bereich zurück.
  if (section && section.group === 'area' && !state.areaPath) {
    pageState.activeSectionId = 'appearance';
    section = sectionById('appearance');
  }
  pageEls.content.innerHTML = '';
  if (!section) return;
  const heading = document.createElement('h3');
  heading.className = 'settings-section-heading';
  heading.textContent = t(section.titleKey);
  pageEls.content.appendChild(heading);
  const body = document.createElement('div');
  body.className = 'settings-section-body';
  pageEls.content.appendChild(body);
  section.render(body, pageState.draft);
  refreshSettingsNav();
  renderActiveSectionError();
  // 4T-0554: Struktur-Änderungen der Bereiche laufen über ein Re-Render
  // (Regel-/Journal-/Kalender-Editoren) — der Speicher-Status zieht mit.
  refreshSettingsButtons();
}

export function activateSection(id) {
  if (!sectionById(id)) return;
  // Bereichswechsel beendet ein laufendes Capture (die Capture-Zeile
  // verschwindet aus dem DOM; Dokument-Listener duerfen nicht haengen
  // bleiben). Der Entwurf bleibt unangetastet.
  cancelHotkeyCapture();
  pageState.activeSectionId = id;
  renderActiveSection();
}

function buildButton(id, labelKey, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = className;
  btn.textContent = t(labelKey);
  btn.addEventListener('click', onClick);
  return btn;
}

// Baut das Seiten-DOM: Titel, zweispaltiger Rumpf (Navigation links,
// Bereichs-Inhalt rechts), seitenweite Button-Leiste. Wird beim ersten
// Anzeigen, nach Sprachwechsel und nach Pane-Wechsel gerufen
// (renderSystemPane leert den Container vorher); der Entwurf liegt im
// Modul-Zustand und übersteht den Re-Mount.
export function mountSettingsPage(container) {
  const page = document.createElement('div');
  page.className = 'settings-page';

  const title = document.createElement('h2');
  title.className = 'settings-page-title';
  title.textContent = t('settings.title');
  page.appendChild(title);

  const body = document.createElement('div');
  body.className = 'settings-page-body';

  const nav = document.createElement('nav');
  nav.className = 'settings-nav';
  buildSettingsNavEntries(nav);
  body.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'settings-section-pane';
  const content = document.createElement('div');
  content.className = 'settings-section-content';
  main.appendChild(content);
  const error = document.createElement('div');
  error.className = 'settings-section-error';
  error.hidden = true;
  main.appendChild(error);
  body.appendChild(main);
  page.appendChild(body);

  const buttons = document.createElement('div');
  buttons.className = 'settings-page-buttons';
  buttons.appendChild(
    buildButton('btn-settings-cancel', 'settings.cancel', 'btn', () => cancelSettingsPage()),
  );
  // 4T-0554: „Anwenden" und „OK" starten neutral; refreshSettingsButtons
  // (am Ende von renderActiveSection) setzt Primary-Hervorhebung und
  // Deaktivierung aus dem Speicher-Status — auch beim Re-Mount einer Seite
  // mit bereits geändertem Entwurf (Sprachwechsel, Pane-Wechsel).
  const applyBtn = buildButton('btn-settings-apply', 'settings.apply', 'btn', () =>
    applySettingsPage(),
  );
  buttons.appendChild(applyBtn);
  const okBtn = buildButton('btn-settings-ok', 'settings.ok', 'btn', () => okSettingsPage());
  buttons.appendChild(okBtn);
  page.appendChild(buttons);

  container.appendChild(page);
  pageEls = { nav, content, error, applyBtn, okBtn };
  renderActiveSection();
}
