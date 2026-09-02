// Menü-Factory pro Fenster. Baut das native Electron-Menu (Datei, Ansicht,
// Hilfe) aus den i18n-Strings und dem zuletzt vom Renderer gemeldeten Stand
// (Sprache, View-Modus, Toggles, Sitzungs-Setting).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Menu } = require('electron');
// 4T-000207 (Epic 3E-000015): Accelerators kommen aus der Kommando-Registry
// (effektive Map wird von main.js aus Registry plus Store gemerged und in
// state.hotkeys uebergeben); der Fallback deckt defensive Aufrufe ohne
// Map ab und entspricht den Registry-Defaults.
const { effectiveMenuAccelerators } = require('../../shared/commands/commands');
// 4T-000538 (Epic 3E-000098): Farbpunkt-Icons des Arbeitsbereichs-Untermenues.
// 4T-000887: seither in menu-icons.js, weil Bitmap-Zeichnung eine eigene
// Fachlichkeit neben dem Menue-Baum ist.
const { workspaceDotIcon } = require('./menu-icons');
// 4T-000888 (Epic 3E-000168): Aufbau der vier "Zuletzt geoeffnet"-Untermenues
// (Dateien, Bereiche, Buecher, Regale) — eigene Fachlichkeit neben dem
// Menue-Baum, Muster menu-icons.js.
const { createRecentListBuilder } = require('./menu-recent');
// 4T-000568 (Epic 3E-000104): Panel-Zugangs-Modell — Label-Key, Toggle-Kommando
// (Accelerator) und Fallback-Reihenfolge des Panel-Untermenues.
const { PANEL_ACCESS, panelAccessById } = require('../../shared/panel-access');

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'es', 'it'];
const FALLBACK_LOCALE = 'en';

const dictCache = new Map();

function loadDict(locale) {
  const target = SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;
  if (dictCache.has(target)) return dictCache.get(target);
  try {
    const file = path.join(__dirname, '..', '..', 'i18n', `${target}.json`);
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    dictCache.set(target, dict);
    return dict;
  } catch {
    if (target !== FALLBACK_LOCALE) return loadDict(FALLBACK_LOCALE);
    return {};
  }
}

// M-18 (4T-000183): clearDictCache entfernt — exportiert, aber von keiner
// Stelle aufgerufen (der Cache bleibt ueber die App-Laufzeit warm; das
// Menue wird bei Sprachwechsel ueber buildMenu mit frischem Dict gebaut).

// --- Untermenue-Saeuberung (4T-000887, Epic 3E-000168) ---------------------------
// Die Menue-Baeume sind seit der Neuordnung mehrstufig; jede Ebene kann durch
// unless() Luecken bekommen (deaktivierte Erweiterung). compactSubmenu wirft
// die Luecken weg und mit ihnen jeden Trenner, der dadurch fuehrend, doppelt
// oder abschliessend stuende. Ein Untermenue, von dem nichts uebrig bleibt,
// liefert eine leere Liste — der Aufrufer laesst den Menuepunkt dann ganz weg,
// statt einen toten Eintrag stehen zu lassen (Muster 4T-000294).
function compactSubmenu(items) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === 'separator') {
      if (out.length === 0) continue;
      if (out[out.length - 1].type === 'separator') continue;
    }
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

// Liefert einen lokalisierten String aus dem Dictionary einer Sprache. Wird
// von main.js fuer Dialog-Texte (Recent-Liste loeschen, Datei nicht gefunden)
// genutzt, die unabhaengig vom Fenster-Menue gerendert werden.
function tForLocale(locale, key) {
  const dict = loadDict(locale);
  return dict[key] != null ? dict[key] : key;
}

// state: {
//   locale: 'de'|'en'|'fr'|'es'|'it',
//   viewMode: 'source'|'split'|'rendered'|null,
//   lineNumbers: boolean,
//   wordWrap: boolean,
//   togglesEnabled: boolean,   // true wenn aktiver Tab eine sichtbare Quellcode-Pane hat
//   restoreSession: boolean,
// }
function buildMenu(win, state, actions) {
  const locale = state && state.locale ? state.locale : FALLBACK_LOCALE;
  const dict = loadDict(locale);
  const t = (k) => (dict[k] != null ? dict[k] : k);

  const send =
    (channel, ...args) =>
    () => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
    };

  const viewMode = state && state.viewMode ? state.viewMode : 'rendered';
  const togglesEnabled = !!(state && state.togglesEnabled);
  const recentFiles = Array.isArray(state && state.recentFiles) ? state.recentFiles : [];
  // 4T-000325 (Epic 3E-000058): zuletzt geoeffnete Bereiche.
  const recentAreas = Array.isArray(state && state.recentAreas) ? state.recentAreas : [];
  // 4T-000888 (Epic 3E-000168): dieselben Listen fuer Buecher und Buecherregale.
  const recentBooks = Array.isArray(state && state.recentBooks) ? state.recentBooks : [];
  const recentShelves = Array.isArray(state && state.recentShelves) ? state.recentShelves : [];
  // 4T-000277: System-Seiten (Einstellungen) kennen keine View-Modi, kein
  // Bearbeiten/Speichern und keinen Export — betroffene Eintraege sind
  // deaktiviert (Muster manualTab der Handbuch-Tabs).
  const systemTab = !!(state && state.systemTab);

  // 4T-000207: effektive Accelerators pro Kommando-ID. Leerer String =
  // Kommando bewusst ohne Binding -> Menue-Eintrag ohne Accelerator
  // (Electron erwartet dann undefined).
  const hotkeys = (state && state.hotkeys) || effectiveMenuAccelerators(null);
  const acc = (commandId) => hotkeys[commandId] || undefined;

  // 4T-000294 (Epic 3E-000052): Eintraege deaktivierter Erweiterungen
  // verschwinden aus dem Menue (kein toter Menuepunkt). unless liefert
  // null, die Template-Listen filtern mit .filter(Boolean).
  const disabledCommands = new Set((state && state.disabledCommands) || []);
  const unless = (commandId, item) => (disabledCommands.has(commandId) ? null : item);

  // 4T-000887 (Epic 3E-000168): Untermenue-Eintrag aus einer Item-Liste, die
  // unless()-Luecken enthalten darf. Bleibt nach compactSubmenu nichts
  // uebrig, entfaellt der Menuepunkt selbst (null wird oben herausgefiltert).
  const submenuOrNull = (labelKey, items) => {
    const cleaned = compactSubmenu(items);
    return cleaned.length > 0 ? { label: t(labelKey), submenu: cleaned } : null;
  };

  // 4T-000568 (Epic 3E-000104): Panel-Untermenue aus der vom Renderer
  // gemeldeten, sortierten Liste ([{ id, visible }]). Fallback vor dem
  // ersten Report eines frischen Fensters: Modell-Reihenfolge, alle
  // unsichtbar. Panels deaktivierter Erweiterungen verschwinden doppelt —
  // der Renderer meldet sie nicht, und unless() greift zusaetzlich ueber
  // das Toggle-Kommando (deckt den Fallback ab).
  const reportedPanels =
    state && Array.isArray(state.panels) && state.panels.length > 0
      ? state.panels
      : PANEL_ACCESS.map((p) => ({ id: p.id, visible: false }));
  const panelSubmenu = reportedPanels
    .map((p) => {
      const meta = panelAccessById(p.id);
      if (!meta) return null;
      return unless(meta.commandId, {
        label: t(meta.titleKey),
        type: 'checkbox',
        checked: !!p.visible,
        accelerator: acc(meta.commandId),
        click: send('menu:togglePanel', p.id),
      });
    })
    .filter(Boolean);

  // 4T-000626 (Epic 3E-000119): Untermenue „Sidebar-Anordnungen" aus den vom
  // Renderer gemeldeten Varianten-Listen (Muster Panel-Untermenue, kein
  // zweiter Mechanismus): Standard-Anordnung, globale Varianten, Gruppe
  // „Bereich <Name>" (nur bei geoeffnetem Bereich, Kopf als deaktivierter
  // Eintrag) und „Aktuelle Anordnung speichern …".
  const variantsState = (state && state.sidebarVariants) || {
    global: [],
    area: [],
    areaName: null,
  };
  const variantsSubmenu = [
    {
      label: t('menu.view.sidebarLayoutStandard'),
      click: send('menu:resetSidebarLayout'),
    },
  ];
  if (variantsState.global.length > 0) {
    variantsSubmenu.push({ type: 'separator' });
    for (const v of variantsState.global) {
      variantsSubmenu.push({
        label: v.name,
        click: send('menu:applySidebarVariant', { scope: 'global', id: v.id }),
      });
    }
  }
  if (variantsState.area.length > 0) {
    variantsSubmenu.push({ type: 'separator' });
    variantsSubmenu.push({
      label: t('sidebarVariants.areaGroup').replace('{name}', variantsState.areaName || ''),
      enabled: false,
    });
    for (const v of variantsState.area) {
      variantsSubmenu.push({
        label: v.name,
        click: send('menu:applySidebarVariant', { scope: 'area', id: v.id }),
      });
    }
  }
  variantsSubmenu.push({ type: 'separator' });
  variantsSubmenu.push({
    label: t('menu.view.sidebarLayoutSave'),
    accelerator: acc('sidebar.saveVariant'),
    click: send('menu:saveSidebarVariant'),
  });

  // Recent-Submenues dynamisch befuellen. 4T-000325 (Epic 3E-000058) legte die
  // Bereichs-Liste neben die Datei-Liste, 4T-000888 die Buch- und die
  // Regal-Liste; seither teilen sich alle vier diesen einen Aufbau, der seit
  // 4T-000888 in menu-recent.js liegt.
  const buildRecentList = createRecentListBuilder(t, actions);

  // 4T-000538 (Epic 3E-000098): Untermenue "Arbeitsbereiche" — Liste aller
  // Arbeitsbereiche (Farbpunkt-Icon traegt die Offen-Markierung; Klick
  // oeffnet bzw. fokussiert ueber die Main-Action), darunter die vier
  // Lebenszyklus-Aktionen. hasWorkspace dimmt "Als Arbeitsbereich
  // speichern" (App ist schon benannt) bzw. aktiviert "Arbeitsbereich
  // schliessen".
  const workspaces = Array.isArray(state && state.workspaces) ? state.workspaces : [];
  const hasWorkspace = !!(state && state.hasWorkspace);
  const buildWorkspacesSubmenu = () => {
    const items = [];
    if (workspaces.length === 0) {
      items.push({ label: t('menu.file.workspacesEmpty'), enabled: false });
    } else {
      for (const w of workspaces) {
        const icon = workspaceDotIcon(w.color, !!w.open);
        items.push({
          label: String(w.name).replace(/&/g, '&&'),
          ...(icon ? { icon } : {}),
          click: () => {
            if (actions && actions.openWorkspace) actions.openWorkspace(w.id);
          },
        });
      }
    }
    items.push({ type: 'separator' });
    items.push({
      label: t('menu.file.workspaceSaveAs'),
      accelerator: acc('workspace.saveAs'),
      enabled: !hasWorkspace,
      click: send('menu:workspaceSaveAs'),
    });
    items.push({
      label: t('menu.file.workspaceCreate'),
      accelerator: acc('workspace.create'),
      click: send('menu:workspaceCreate'),
    });
    items.push({
      label: t('menu.file.workspaceClose'),
      accelerator: acc('workspace.close'),
      enabled: hasWorkspace,
      click: send('menu:workspaceClose'),
    });
    items.push({
      label: t('menu.file.workspaceManage'),
      accelerator: acc('workspace.manage'),
      click: send('menu:workspaceManage'),
    });
    return items;
  };

  // 4T-000887 (Epic 3E-000168): Neuordnung des Datei-Menues nach dem vom Product
  // Owner beschlossenen Mockup. Die oberste Ebene traegt nur noch die vier
  // taeglich gebrauchten Datei-Aktionen, den Applikations-Block und "Beenden";
  // alles Uebrige liegt in vier thematischen Untermenues (Weitere
  // Datei-Funktionen, Bereich, Buch und Buecherregal, Arbeitsbereiche). Kein
  // Eintrag ist entfallen, jede enabled-/unless-Logik und jeder Accelerator
  // reist mit seinem Eintrag mit; allein der Ort hat sich geaendert.
  const template = [
    {
      label: t('menu.file.title'),
      submenu: [
        {
          label: t('menu.file.new'),
          accelerator: acc('file.newTab'),
          click: () => {
            if (actions && actions.newTab) actions.newTab();
          },
        },
        {
          label: t('menu.file.open'),
          accelerator: acc('file.open'),
          click: send('menu:openFile'),
        },
        {
          label: t('menu.file.save'),
          accelerator: acc('file.save'),
          // 4T-000213: Handbuch-Tabs sind read-only — Speichern deaktiviert.
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: () => {
            if (actions && actions.save) actions.save();
          },
        },
        {
          label: t('menu.file.saveAs'),
          accelerator: acc('file.saveAs'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: () => {
            if (actions && actions.saveAs) actions.saveAs();
          },
        },
        { type: 'separator' },
        submenuOrNull('menu.file.more', [
          {
            // 4T-000338 (Epic 3E-000061): Unterseite zur aktiven Datei anlegen
            // (U+2215-Namens-Konvention; Dialog fragt das Segment ab).
            label: t('menu.file.newSubpage'),
            accelerator: acc('file.newSubpage'),
            enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
            click: send('menu:newSubpage'),
          },
          unless('file.newFromTemplate', {
            // 4T-000426 (Epic 3E-000080): neue Datei aus Vorlage (Auswahl-Popup
            // und Platzhalter-Dialoge laufen im Renderer). Immer aktiv; ohne
            // konfigurierten Vorlagen-Ordner oder Ziel-Kontext meldet der
            // Renderer einen lokalisierten Hinweis.
            label: t('menu.file.newFromTemplate'),
            accelerator: acc('file.newFromTemplate'),
            click: send('menu:newFromTemplate'),
          }),
          unless('journal.openToday', {
            // 4T-000433 (Epic 3E-000081): heutiger Journal-Eintrag. Nur bei
            // aktivem Bereich aktiv (PO-Befund der Release-Test-Iteration
            // 0.55.0: Journale gibt es nur pro Bereich, ohne Bereich sind
            // die Eintraege ausgegraut wie "Bereich schliessen"); ohne
            // Journale meldet der Renderer den lokalisierten Hinweis.
            label: t('menu.file.journalToday'),
            accelerator: acc('journal.openToday'),
            enabled: !!(state && state.hasArea),
            click: send('menu:journalToday'),
          }),
          unless('journal.openForDate', {
            // 4T-000433 (Epic 3E-000081): Journal-Eintrag fuer gewaehltes Datum
            // (Bereichs-Bindung wie beim Heute-Eintrag).
            label: t('menu.file.journalForDate'),
            accelerator: acc('journal.openForDate'),
            enabled: !!(state && state.hasArea),
            click: send('menu:journalForDate'),
          }),
          { type: 'separator' },
          {
            label: t('menu.file.recent'),
            submenu: buildRecentList(
              recentFiles,
              'menu.file.recentEmpty',
              'openRecent',
              'clearRecent',
            ),
          },
          unless('file.bookmarkAdd', {
            // 4T-000075 (Epic 3E-000013): "Aktive Datei merken"; der Toggle der
            // Sektion liegt im Ansichts-Menue (Lesezeichen-Panel).
            label: t('menu.file.bookmarks.add'),
            accelerator: acc('file.bookmarkAdd'),
            enabled: !!(state && state.hasActiveTab),
            click: send('menu:bookmarkAdd'),
          }),
          { type: 'separator' },
          {
            // 4T-000890 (Befund L-06): Accelerator-Anzeige aus der Registry —
            // das Kommando ist belegbar, der Menue-Eintrag zeigte das
            // gewaehlte Kuerzel bis dahin nicht an.
            label: t('menu.file.autoSave'),
            type: 'checkbox',
            checked: !!(state && state.autoSave),
            accelerator: acc('file.toggleAutoSave'),
            click: () => {
              if (actions && actions.toggleAutoSave) actions.toggleAutoSave();
            },
          },
          {
            // 4T-000339 (Epic 3E-000061): aktive Datei umbenennen (Dialog im
            // Renderer; Unterseiten-Baeume kaskadieren, 4T-000340).
            label: t('menu.file.rename'),
            accelerator: acc('file.rename'),
            enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
            click: send('menu:renameFile'),
          },
          {
            // 4T-000774 (Epic 3E-000128): Unterseite von der uebergeordneten Seite
            // loesen. Ob die aktive Datei ueberhaupt eine Unterseite ist, prueft
            // der Renderer und meldet es als Hinweis — wie beim Umbenennen, damit
            // der Eintrag nicht ohne erkennbaren Grund verschwindet.
            label: t('menu.file.detachSubpage'),
            accelerator: acc('file.detachSubpage'),
            enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
            click: send('menu:detachSubpage'),
          },
          {
            // 4T-001293 (Epic 3E-000224): geteiltes Dokument wieder zu einer Datei
            // machen; ob es geteilt ist, prueft der Renderer wie beim Loesen.
            label: t('menu.file.rejoinParts'),
            accelerator: acc('file.rejoinParts'),
            enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
            click: send('menu:rejoinParts'),
          },
          { type: 'separator' },
          {
            // 4T-000303 (Epic 3E-000054): PDF-Export des gerenderten Inhalts.
            // Handbuch-Tabs sind exportierbar (gerenderter Inhalt vorhanden),
            // nur der Einstellungs-Tab (systemTab) ist ausgenommen.
            label: t('menu.file.exportPdf'),
            accelerator: acc('file.exportPdf'),
            enabled: !!(state && state.hasActiveTab) && !systemTab,
            click: send('menu:exportPdf'),
          },
          {
            // 4T-000041 (Epic 3E-000008): Export-Submenu fuer den HTML-Konverter.
            // 'Portables Markdown...' ersetzt perspective-table-Codeblocks im aktiven
            // Tab durch inline HTML-Tabellen und speichert das Ergebnis ueber
            // einen Save-As-Dialog (Vorbelegung '<basename>-portable.md').
            label: t('menu.file.export'),
            enabled: !!(state && state.hasActiveTab) && !systemTab,
            submenu: [
              {
                // 4T-000890 (Befund L-05): seit der Registrierung als Kommando
                // 'file.exportPortable' mit Accelerator-Anzeige; der Klick
                // laeuft unveraendert ueber den Menue-Kanal.
                label: t('menu.file.exportPortable'),
                accelerator: acc('file.exportPortable'),
                click: send('menu:exportPortable'),
              },
            ],
          },
        ]),
        { type: 'separator' },
        // 4T-000887: Kontext-Block — Bereich, Buch/Buecherregal und
        // Arbeitsbereiche stehen als drei gleichrangige Untermenues
        // nebeneinander (frueher drei Bloecke auf der obersten Ebene).
        submenuOrNull('menu.file.areaSubmenu', [
          {
            // 4T-000322 (Epic 3E-000058): Ordner-Bereich als Arbeitsraum der
            // Applikation oeffnen.
            label: t('menu.file.openArea'),
            accelerator: acc('area.open'),
            click: send('menu:openArea'),
          },
          {
            // 4T-000322: Bereich schliessen — schliesst alle Fenster der
            // Bereichs-App; nur bei aktivem Bereich aktiv. 4T-000881 (Befund der
            // Test-Iteration 0.104.0): Buch- und Regal-Fenster binden intern
            // einen Bereich, sind aber keine Bereichs-Fenster — dort gelten
            // "Buch schliessen" bzw. "Buecherregal schliessen".
            label: t('menu.file.closeArea'),
            accelerator: acc('area.close'),
            enabled: !!(state && state.hasArea && !state.hasBook && !state.hasShelf),
            click: send('menu:closeArea'),
          },
          { type: 'separator' },
          {
            // 4T-000325 (Epic 3E-000058): schneller Wiedereinstieg in Bereiche.
            label: t('menu.file.recentAreas'),
            submenu: buildRecentList(
              recentAreas,
              'menu.file.recentAreasEmpty',
              'openRecentArea',
              'clearRecentAreas',
            ),
          },
          { type: 'separator' },
          unless('area.createDemo', {
            // 4T-000632 (Epic 3E-000102): mitgelieferte Demo-Inhalte in einen
            // leeren Ordner kopieren und als Bereich oeffnen (Erweiterung
            // demo-area; im Aus-Zustand entfaellt der Eintrag).
            label: t('menu.file.createDemoArea'),
            accelerator: acc('area.createDemo'),
            click: send('menu:createDemoArea'),
          }),
        ]),
        // 4T-000843 (Epic 3E-000147): Buecher sind ein eigener Kontext auf
        // derselben Ebene wie Bereich und Arbeitsbereich. Oeffnen, Anlegen und
        // Schliessen fuehrt der Main direkt aus (Ordner-Dialog, Anlage,
        // aktives Buch der Applikation); anders als beim Bereich gibt es
        // keinen Renderer-Umweg, weil im Fenster nichts zu entscheiden ist.
        submenuOrNull('menu.file.booksShelves', [
          unless('book.open', {
            label: t('menu.file.openBook'),
            accelerator: acc('book.open'),
            click: () => {
              if (actions && actions.openBook) actions.openBook();
            },
          }),
          unless('book.create', {
            label: t('menu.file.newBook'),
            accelerator: acc('book.create'),
            click: () => {
              if (actions && actions.createBook) actions.createBook();
            },
          }),
          unless('book.close', {
            // Nur bei aktivem Buch aktiv (Muster "Bereich schliessen").
            label: t('menu.file.closeBook'),
            accelerator: acc('book.close'),
            enabled: !!(state && state.hasBook),
            click: () => {
              if (actions && actions.closeBook) actions.closeBook();
            },
          }),
          unless('book.moveChapterFile', {
            // 4T-000887 (Befund L-04 des Struktur-Reviews): das Kommando
            // "Kapitel-Datei verschieben" hatte bis hierher nur das
            // Kontextmenue des Inhaltsverzeichnisses und die Palette. Der
            // Renderer entscheidet, welche Datei gemeint ist (gerade gelesenes
            // Kapitel der aktiven Spalte), deshalb der Renderer-Weg ueber den
            // Kanal statt einer Main-Aktion wie bei den drei Eintraegen davor.
            // Aktiv nur bei aktivem Buch (Muster "Buch schliessen").
            label: t('bookPanel.moveFile'),
            accelerator: acc('book.moveChapterFile'),
            enabled: !!(state && state.hasBook),
            click: send('menu:moveChapterFile'),
          }),
          // 4T-000888 (Epic 3E-000168): schneller Wiedereinstieg in Buecher, exakt
          // nach dem Muster der Bereichs-Liste. Das unless() haengt am
          // Oeffnen-Kommando: Es traegt keine eigene Kommando-ID, soll aber mit
          // der abgeschalteten Erweiterung 'books' verschwinden — sonst bliebe
          // das Untermenue allein wegen der Zuletzt-Liste stehen.
          unless('book.open', {
            label: t('menu.file.recentBooks'),
            submenu: buildRecentList(
              recentBooks,
              'menu.file.recentBooksEmpty',
              'openRecentBook',
              'clearRecentBooks',
            ),
          }),
          { type: 'separator' },
          // 4T-000867 (Epic 3E-000162): Buecherregale neben den Buechern — dieselbe
          // Aufteilung, der Main fuehrt alle drei Aktionen direkt aus.
          unless('shelf.open', {
            label: t('menu.file.openShelf'),
            accelerator: acc('shelf.open'),
            click: () => {
              if (actions && actions.openShelf) actions.openShelf();
            },
          }),
          unless('shelf.create', {
            label: t('menu.file.newShelf'),
            accelerator: acc('shelf.create'),
            click: () => {
              if (actions && actions.createShelf) actions.createShelf();
            },
          }),
          unless('shelf.close', {
            // Nur bei aktivem Regal aktiv (Muster "Buch schliessen").
            label: t('menu.file.closeShelf'),
            accelerator: acc('shelf.close'),
            enabled: !!(state && state.hasShelf),
            click: () => {
              if (actions && actions.closeShelf) actions.closeShelf();
            },
          }),
          // 4T-000888: Zuletzt geoeffnete Buecherregale als letzter Eintrag des
          // Untermenues (Gate am Regal-Oeffnen, Muster der Buch-Liste).
          unless('shelf.open', {
            label: t('menu.file.recentShelves'),
            submenu: buildRecentList(
              recentShelves,
              'menu.file.recentShelvesEmpty',
              'openRecentShelf',
              'clearRecentShelves',
            ),
          }),
        ]),
        unless('workspace.manage', {
          label: t('menu.file.workspaces'),
          submenu: buildWorkspacesSubmenu(),
        }),
        { type: 'separator' },
        {
          // 4T-000319 (Epic 3E-000057): neue logische Applikation (eigener
          // Fenster-Verbund mit eigener Nummerierung; entspricht dem
          // EXE-Zweitstart ohne Datei-Argument).
          label: t('menu.file.newApp'),
          accelerator: acc('app.newApplication'),
          click: send('menu:newApplication'),
        },
        {
          // 4T-000018: Settings-Dialog (Schriftart, -groesse). Renderer-Hook.
          label: t('menu.file.settings'),
          accelerator: acc('app.openSettings'),
          click: send('menu:openSettings'),
        },
        { type: 'separator' },
        {
          label: t('menu.file.quit'),
          role: 'quit',
        },
      ],
    },
    {
      label: t('menu.view.title'),
      submenu: [
        {
          label: t('menu.view.rendered'),
          type: 'radio',
          checked: viewMode === 'rendered',
          enabled: !systemTab,
          accelerator: acc('view.modeRendered'),
          click: send('menu:viewChange', 'rendered'),
        },
        {
          label: t('menu.view.split'),
          type: 'radio',
          checked: viewMode === 'split',
          enabled: !systemTab,
          accelerator: acc('view.modeSplit'),
          click: send('menu:viewChange', 'split'),
        },
        {
          label: t('menu.view.source'),
          type: 'radio',
          checked: viewMode === 'source',
          enabled: !systemTab,
          accelerator: acc('view.modeSource'),
          click: send('menu:viewChange', 'source'),
        },
        {
          // 4T-000085 (Epic 3E-000014): Vierter View-Modus "Live" mit Inline-
          // Render im Source-Editor. Hotkey CmdOrCtrl+4 schliesst die
          // 1-2-3-4-Folge ab.
          label: t('menu.view.live'),
          type: 'radio',
          checked: viewMode === 'live',
          enabled: !systemTab,
          accelerator: acc('view.modeLive'),
          click: send('menu:viewChange', 'live'),
        },
        // 4T-001047 (Epic 3E-000151): Fuenfter Modus. Bei ausgeschalteter
        // Erweiterung faellt der Eintrag ueber unless() weg, und der
        // Renderer schaltet einen gespeicherten Mindmap-Reiter auf die
        // Lese-Ansicht zurueck.
        unless('view.modeMindmap', {
          label: t('menu.view.mindmap'),
          type: 'radio',
          checked: viewMode === 'mindmap',
          enabled: !systemTab,
          accelerator: acc('view.modeMindmap'),
          click: send('menu:viewChange', 'mindmap'),
        }),
        {
          // 4T-000019: Edit-Modus auch im Menue erreichbar (im Fokus-Modus ist
          // der Toolbar-Button rechts unten ausgeblendet). Pro aktivem Tab.
          label: t('menu.view.edit'),
          type: 'checkbox',
          checked: !!(state && state.editMode),
          // 4T-000213: Handbuch-Tabs sind read-only — Bearbeiten deaktiviert
          // (sonst toggelt die native Checkbox sichtbar, obwohl der
          // Renderer-Guard den Modus-Wechsel verwirft).
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          accelerator: acc('view.toggleEdit'),
          click: send('menu:toggleEdit'),
        },
        { type: 'separator' },
        // 4T-000887 (Epic 3E-000168): drei thematische Untermenues statt der
        // gewachsenen Folge einzelner Toggle-Bloecke — Editor-Darstellung,
        // Sidebar, Erscheinungsbild.
        // 4T-000890 (Befund L-06): die fuenf Toggles dieses Untermenues sind
        // belegbare Registry-Kommandos, zeigten das belegte Kuerzel im Menue
        // aber nicht an; acc() schliesst die Anzeige-Luecke (gewirkt haben
        // die Kuerzel schon vorher ueber den Renderer-Dispatcher).
        submenuOrNull('menu.view.editorDisplay', [
          {
            label: t('menu.view.foldGutter'),
            type: 'checkbox',
            checked: !!(state && state.foldGutter),
            enabled: togglesEnabled,
            accelerator: acc('view.toggleFoldGutter'),
            click: send('menu:toggleFoldGutter'),
          },
          {
            label: t('menu.view.lineNumbers'),
            type: 'checkbox',
            checked: !!(state && state.lineNumbers),
            enabled: togglesEnabled,
            accelerator: acc('view.toggleLineNumbers'),
            click: send('menu:toggleLineNumbers'),
          },
          {
            label: t('menu.view.wordWrap'),
            type: 'checkbox',
            checked: !!(state && state.wordWrap),
            enabled: togglesEnabled,
            accelerator: acc('view.toggleWordWrap'),
            click: send('menu:toggleWordWrap'),
          },
          { type: 'separator' },
          {
            // 4T-000070: Scroll-Synchronisation zwischen Source- und Render-Pane
            // in der geteilten Ansicht. Pro aktivem Tab.
            label: t('menu.view.scrollSync'),
            type: 'checkbox',
            checked: !!(state && state.scrollSyncEnabled),
            enabled: !!(state && state.hasActiveTab),
            accelerator: acc('view.toggleScrollSync'),
            click: send('menu:toggleScrollSync'),
          },
          unless('view.toggleTypewriterScroll', {
            // 4T-000019: Typewriter-Scroll haelt die Cursor-Zeile im Editor-Pane
            // vertikal zentriert.
            label: t('menu.view.typewriterScroll'),
            type: 'checkbox',
            checked: !!(state && state.typewriterScroll),
            accelerator: acc('view.toggleTypewriterScroll'),
            click: send('menu:toggleTypewriterScroll'),
          }),
        ]),
        submenuOrNull('menu.view.sidebarSubmenu', [
          {
            // 4T-000568 (Epic 3E-000104): Panel-Untermenue — alle Panel-Toggles
            // gebuendelt, in der vom Renderer gemeldeten, frei einstellbaren
            // Reihenfolge (identisch zur Statusbar-Leiste).
            label: t('menu.view.panels'),
            submenu: panelSubmenu,
          },
          {
            // 4T-000626 (Epic 3E-000119): benannte Sidebar-Anordnungen — direkt
            // beim Panel-Untermenue (derselbe Themen-Block Sidebar/Panels).
            label: t('menu.view.sidebarLayouts'),
            submenu: variantsSubmenu,
          },
          { type: 'separator' },
          // 4T-000697 (Epic 3E-000141): linke/rechte Sidebar-Spalte der aktiven
          // Editor-Spalte ein-/ausklappen. BEWUSST neben dem Panel-Untermenue
          // und NICHT darin — dieses ist dem Waechter panel-zugaenge.spec.js
          // vorbehalten, der dort nur Panel-Checkboxen erwartet. Haekchen aus
          // dem Menue-State der aktiven Pane-Group; im Aus-Zustand der
          // Erweiterung entfernt unless() beide Eintraege.
          unless('view.toggleSidebarLeft', {
            label: t('menu.view.collapseSidebarLeft'),
            type: 'checkbox',
            checked: !!(state && state.sidebarCollapsedLeft),
            accelerator: acc('view.toggleSidebarLeft'),
            click: send('menu:toggleSidebarLeft'),
          }),
          unless('view.toggleSidebarRight', {
            label: t('menu.view.collapseSidebarRight'),
            type: 'checkbox',
            checked: !!(state && state.sidebarCollapsedRight),
            accelerator: acc('view.toggleSidebarRight'),
            click: send('menu:toggleSidebarRight'),
          }),
        ]),
        submenuOrNull('menu.view.appearance', [
          unless('view.toggleFocusMode', {
            // 4T-000019: Fokus-Modus toggelt UI-Chrome (Tabbar, Statusbar, Sidebar)
            // im aktiven Fenster. Wirkt nur auf dieses Fenster, persistierter
            // Wert ist global.
            label: t('menu.view.focusMode'),
            type: 'checkbox',
            checked: !!(state && state.focusMode),
            accelerator: acc('view.toggleFocusMode'),
            click: send('menu:toggleFocusMode'),
          }),
          { type: 'separator' },
          // 4T-000030: drei Theme-Radios. 'System' folgt dem Windows-Theme
          // (bisheriges Verhalten), 'Hell'/'Dunkel' erzwingen das jeweilige
          // Theme app-weit. 4T-000887: seither direkt im Erscheinungsbild statt
          // in einem eigenen Theme-Untermenue (eine Ebene weniger; der Key
          // menu.view.theme wird im Menue nicht mehr gebraucht).
          {
            label: t('menu.view.themeLight'),
            type: 'radio',
            checked: (state && state.themePref) === 'light',
            click: send('menu:setTheme', 'light'),
          },
          {
            label: t('menu.view.themeDark'),
            type: 'radio',
            checked: (state && state.themePref) === 'dark',
            click: send('menu:setTheme', 'dark'),
          },
          {
            label: t('menu.view.themeSystem'),
            type: 'radio',
            checked: !(state && state.themePref) || (state && state.themePref) === 'system',
            click: send('menu:setTheme', 'system'),
          },
        ]),
        { type: 'separator' },
        {
          // 4T-000333 (Epic 3E-000060): Historien-Ansicht des aktiven Dokuments
          // (Revisionsliste, Vergleich, Wiederherstellen) als System-Seite.
          label: t('menu.view.history'),
          accelerator: acc('history.open'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: send('menu:openHistory'),
        },
        unless('graph.openArea', {
          // 4T-000455 (Epic 3E-000084): Bereichs-Graph als read-only Tab; nur
          // bei aktivem Bereich aktiv (Muster journal.openToday).
          label: t('menu.view.areaGraph'),
          accelerator: acc('graph.openArea'),
          enabled: !!(state && state.hasArea),
          click: send('menu:openAreaGraph'),
        }),
        unless('stats.openArea', {
          // 4T-000620 (Epic 3E-000117): Bereichs-Statistik als read-only Tab,
          // direkt hinter dem Bereichs-Graph (beide bereichsweite
          // Auswertungen); nur bei aktivem Bereich aktiv.
          label: t('menu.view.areaStats'),
          accelerator: acc('stats.openArea'),
          enabled: !!(state && state.hasArea),
          click: send('menu:openAreaStats'),
        }),
        { type: 'separator' },
        {
          // 4T-000480 (Epic 3E-000089): Kommando-Palette — filterbares Popup
          // aller Registry-Kommandos; immer verfuegbar (Kern-Bedienung).
          label: t('menu.view.commandPalette'),
          accelerator: acc('app.commandPalette'),
          click: send('menu:openCommandPalette'),
        },
        // 4T-000927 (Epic 3E-000016): Der Eintrag «Entwickler-Tools» samt Trenner
        // und Kuerzel F12 ist hier entfallen (Anordnung des Product Owners vom
        // 2026-08-07). Er war seit 4T-000191 als Debug-Werkzeug und nicht als
        // beworbenes Nutzer-Feature gekennzeichnet und gehoert damit nicht in
        // das Auslieferungs-Menue einer Reife-Version. Ersatzlos entfiel er
        // nicht: Der Zugang liegt jetzt im Einstellungs-Bereich
        // «Erweiterungen (extern)», wo ihn die Zielgruppe der externen
        // Erweiterungen findet. F12 entfaellt bewusst ohne Ersatz-Bindung —
        // eine unbeworbene Taste, die im Auslieferungsstand eine Konsole
        // oeffnet, trifft irgendwann jemand versehentlich.
      ],
    },
    {
      label: t('menu.help.title'),
      submenu: [
        {
          label: t('menu.help.help'),
          accelerator: acc('help.open'),
          click: send('menu:openHelp'),
        },
        {
          // 4T-000644 (Epic 3E-000127): geführte Produkt-Tour, manuell startbar
          // direkt hinter dem Handbuch (beide Einstiege in die Erklärung der
          // Anwendung); ohne Default-Kürzel, die Registry liefert ein in den
          // Einstellungen belegtes Kürzel nach.
          label: t('menu.help.tour'),
          accelerator: acc('help.tour'),
          click: send('menu:startTour'),
        },
        {
          label: t('menu.help.about'),
          click: send('menu:openAbout'),
        },
        { type: 'separator' },
        {
          // 4T-000890 (Befund L-06): Accelerator-Anzeige aus der Registry
          // (Kommando app.toggleRestoreSession, ohne Default-Kuerzel).
          label: t('menu.help.restoreSession'),
          type: 'checkbox',
          checked: !!(state && state.restoreSession),
          accelerator: acc('app.toggleRestoreSession'),
          click: send('menu:toggleRestoreSession'),
        },
      ],
    },
  ];

  // 4T-000294: unless()-Luecken (deaktivierte Erweiterungen) entfernen. 4T-000887:
  // ueber compactSubmenu, damit ein Trenner nicht stehen bleibt, dessen Block
  // durch die Luecke leer geworden ist.
  for (const top of template) {
    if (Array.isArray(top.submenu)) top.submenu = compactSubmenu(top.submenu);
  }
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu, tForLocale };
