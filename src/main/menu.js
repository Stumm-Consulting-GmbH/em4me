// Menü-Factory pro Fenster. Baut das native Electron-Menu (Datei, Ansicht,
// Hilfe) aus den i18n-Strings und dem zuletzt vom Renderer gemeldeten Stand
// (Sprache, View-Modus, Toggles, Sitzungs-Setting).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Menu, nativeImage } = require('electron');
// 4T-0207 (Epic 3E-0015): Accelerators kommen aus der Kommando-Registry
// (effektive Map wird von main.js aus Registry plus Store gemerged und in
// state.hotkeys uebergeben); der Fallback deckt defensive Aufrufe ohne
// Map ab und entspricht den Registry-Defaults.
const { effectiveMenuAccelerators } = require('../shared/commands');
// 4T-0538 (Epic 3E-0098): Hex-Werte der Acht-Farben-Palette fuer die
// Farbpunkt-Icons des Arbeitsbereichs-Untermenues.
const { TAB_GROUP_COLOR_VALUES } = require('../shared/tab-group-colors');
// 4T-0568 (Epic 3E-0104): Panel-Zugangs-Modell — Label-Key, Toggle-Kommando
// (Accelerator) und Fallback-Reihenfolge des Panel-Untermenues.
const { PANEL_ACCESS, panelAccessById } = require('../shared/panel-access');

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'es', 'it'];
const FALLBACK_LOCALE = 'en';

const dictCache = new Map();

function loadDict(locale) {
  const target = SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;
  if (dictCache.has(target)) return dictCache.get(target);
  try {
    const file = path.join(__dirname, '..', 'i18n', `${target}.json`);
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    dictCache.set(target, dict);
    return dict;
  } catch {
    if (target !== FALLBACK_LOCALE) return loadDict(FALLBACK_LOCALE);
    return {};
  }
}

// M-18 (4T-0183): clearDictCache entfernt — exportiert, aber von keiner
// Stelle aufgerufen (der Cache bleibt ueber die App-Laufzeit warm; das
// Menue wird bei Sprachwechsel ueber buildMenu mit frischem Dict gebaut).

// --- Arbeitsbereichs-Farbpunkte (4T-0538, Epic 3E-0098) ----------------------
// Native Menues koennen Haekchen und Icon nicht kombinieren; das Farbpunkt-
// Icon traegt daher beide Informationen (PO-Freigabe der Plan-Runde):
// gefuellter Kreis = offen, Ring = geschlossen, jeweils in der
// Arbeitsbereichs-Farbe. Gezeichnet als rohe BGRA-Bitmap (premultiplied
// Alpha, weiche Kante), 16 px plus 32-px-Repraesentation fuer HiDPI;
// pro (Farbe, Zustand) gecacht.
const dotIconCache = new Map();

function drawDotBitmap(size, hex, filled) {
  const buf = Buffer.alloc(size * size * 4);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = (size - 1) / 2;
  const outer = size * 0.42;
  const inner = size * 0.26;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c));
      let alpha = Math.max(0, Math.min(1, outer - d + 0.5));
      if (!filled) alpha = Math.min(alpha, Math.max(0, Math.min(1, d - inner + 0.5)));
      const i = (y * size + x) * 4;
      buf[i] = Math.round(b * alpha);
      buf[i + 1] = Math.round(g * alpha);
      buf[i + 2] = Math.round(r * alpha);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

function workspaceDotIcon(colorKey, open) {
  const key = `${colorKey}:${open ? 'o' : 'c'}`;
  const cached = dotIconCache.get(key);
  if (cached !== undefined) return cached;
  const hex = TAB_GROUP_COLOR_VALUES[colorKey] || TAB_GROUP_COLOR_VALUES.blue;
  let icon;
  try {
    icon = nativeImage.createFromBitmap(drawDotBitmap(16, hex, open), { width: 16, height: 16 });
    icon.addRepresentation({
      scaleFactor: 2.0,
      width: 32,
      height: 32,
      buffer: drawDotBitmap(32, hex, open),
    });
  } catch {
    // Defensiv: ohne Icon bleibt der Menue-Eintrag voll funktionsfaehig.
    icon = null;
  }
  dotIconCache.set(key, icon);
  return icon;
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
  // 4T-0325 (Epic 3E-0058): zuletzt geoeffnete Bereiche.
  const recentAreas = Array.isArray(state && state.recentAreas) ? state.recentAreas : [];
  // 4T-0277: System-Seiten (Einstellungen) kennen keine View-Modi, kein
  // Bearbeiten/Speichern und keinen Export — betroffene Eintraege sind
  // deaktiviert (Muster manualTab der Handbuch-Tabs).
  const systemTab = !!(state && state.systemTab);

  // 4T-0207: effektive Accelerators pro Kommando-ID. Leerer String =
  // Kommando bewusst ohne Binding -> Menue-Eintrag ohne Accelerator
  // (Electron erwartet dann undefined).
  const hotkeys = (state && state.hotkeys) || effectiveMenuAccelerators(null);
  const acc = (commandId) => hotkeys[commandId] || undefined;

  // 4T-0294 (Epic 3E-0052): Eintraege deaktivierter Erweiterungen
  // verschwinden aus dem Menue (kein toter Menuepunkt). unless liefert
  // null, die Template-Listen filtern mit .filter(Boolean).
  const disabledCommands = new Set((state && state.disabledCommands) || []);
  const unless = (commandId, item) => (disabledCommands.has(commandId) ? null : item);

  // 4T-0568 (Epic 3E-0104): Panel-Untermenue aus der vom Renderer
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

  // 4T-0626 (Epic 3E-0119): Untermenue „Sidebar-Anordnungen" aus den vom
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

  // Recent-Files-Submenue dynamisch befuellen. Bei leerer Liste ein disabled
  // Platzhalter, sonst je Eintrag ein MenuItem (Dateiname mit Disambiguator
  // bei gleichnamigen Dateien), gefolgt von Trenner und „Liste loeschen".
  // M-11 (4T-0188): Das toolTip-Property wirkt nur auf macOS und ist auf
  // Windows wirkungslos (harmlos, bleibt fuer einen etwaigen macOS-Port);
  // die Unterscheidung gleichnamiger Dateien leistet auf Windows allein
  // der Ordner-Disambiguator im Label.
  const buildRecentSubmenu = () => {
    if (recentFiles.length === 0) {
      return [{ label: t('menu.file.recentEmpty'), enabled: false }];
    }
    const basenameCount = new Map();
    for (const p of recentFiles) {
      const b = path.basename(p);
      basenameCount.set(b, (basenameCount.get(b) || 0) + 1);
    }
    const items = recentFiles.map((fullPath) => {
      const base = path.basename(fullPath);
      const label =
        basenameCount.get(base) > 1 ? `${base} (${path.basename(path.dirname(fullPath))})` : base;
      return {
        // M-12 (4T-0173): '&' im Dateinamen wuerde Windows als Mnemonic
        // interpretieren (unterstrichener Buchstabe statt '&'); nur fuer
        // das Anzeige-Label escapen.
        label: label.replace(/&/g, '&&'),
        toolTip: fullPath,
        click: () => {
          if (actions && actions.openRecent) actions.openRecent(fullPath);
        },
      };
    });
    items.push({ type: 'separator' });
    items.push({
      label: t('menu.file.recentClear'),
      click: () => {
        if (actions && actions.clearRecent) actions.clearRecent();
      },
    });
    return items;
  };

  // 4T-0325 (Epic 3E-0058): Submenue "Zuletzt geoeffnete Bereiche" —
  // Eintrag-Label ist der Ordnername (Mnemonic-escaped), der volle Pfad
  // steht als toolTip (macOS) und ist ueber die Eintrags-Eindeutigkeit
  // der Liste ohnehin gegeben; gleichnamige Ordner werden wie bei den
  // Dateien ueber den Eltern-Ordner disambiguiert.
  const buildRecentAreasSubmenu = () => {
    if (recentAreas.length === 0) {
      return [{ label: t('menu.file.recentAreasEmpty'), enabled: false }];
    }
    const basenameCount = new Map();
    for (const p of recentAreas) {
      const b = path.basename(p);
      basenameCount.set(b, (basenameCount.get(b) || 0) + 1);
    }
    const items = recentAreas.map((fullPath) => {
      const base = path.basename(fullPath);
      const label =
        basenameCount.get(base) > 1 ? `${base} (${path.basename(path.dirname(fullPath))})` : base;
      return {
        label: label.replace(/&/g, '&&'),
        toolTip: fullPath,
        click: () => {
          if (actions && actions.openRecentArea) actions.openRecentArea(fullPath);
        },
      };
    });
    items.push({ type: 'separator' });
    items.push({
      label: t('menu.file.recentClear'),
      click: () => {
        if (actions && actions.clearRecentAreas) actions.clearRecentAreas();
      },
    });
    return items;
  };

  // 4T-0538 (Epic 3E-0098): Untermenue "Arbeitsbereiche" — Liste aller
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
          // 4T-0338 (Epic 3E-0061): Unterseite zur aktiven Datei anlegen
          // (U+2215-Namens-Konvention; Dialog fragt das Segment ab).
          label: t('menu.file.newSubpage'),
          accelerator: acc('file.newSubpage'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: send('menu:newSubpage'),
        },
        unless('file.newFromTemplate', {
          // 4T-0426 (Epic 3E-0080): neue Datei aus Vorlage (Auswahl-Popup
          // und Platzhalter-Dialoge laufen im Renderer). Immer aktiv; ohne
          // konfigurierten Vorlagen-Ordner oder Ziel-Kontext meldet der
          // Renderer einen lokalisierten Hinweis.
          label: t('menu.file.newFromTemplate'),
          accelerator: acc('file.newFromTemplate'),
          click: send('menu:newFromTemplate'),
        }),
        unless('journal.openToday', {
          // 4T-0433 (Epic 3E-0081): heutiger Journal-Eintrag. Nur bei
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
          // 4T-0433 (Epic 3E-0081): Journal-Eintrag fuer gewaehltes Datum
          // (Bereichs-Bindung wie beim Heute-Eintrag).
          label: t('menu.file.journalForDate'),
          accelerator: acc('journal.openForDate'),
          enabled: !!(state && state.hasArea),
          click: send('menu:journalForDate'),
        }),
        {
          label: t('menu.file.open'),
          accelerator: acc('file.open'),
          click: send('menu:openFile'),
        },
        {
          label: t('menu.file.recent'),
          submenu: buildRecentSubmenu(),
        },
        unless('file.bookmarkAdd', {
          // 4T-0075 (Epic 3E-0013): "Aktive Datei merken" direkt auf der
          // obersten Datei-Menue-Ebene. Toggle der Sektion liegt im
          // Ansichts-Menue (Lesezeichen).
          label: t('menu.file.bookmarks.add'),
          accelerator: acc('file.bookmarkAdd'),
          enabled: !!(state && state.hasActiveTab),
          click: send('menu:bookmarkAdd'),
        }),
        // 4T-0538 (Epic 3E-0098): Vier-Block-Gliederung des oberen Datei-
        // Menue-Abschnitts (Workshop-Punkt 7 mit PO-Ergaenzung): Block 1
        // Dateien (oben), Block 2 Bereiche, Block 3 Applikation, Block 4
        // Arbeitsbereiche. Die Gliederung ist dauerhafte Menue-Struktur;
        // bei deaktivierter Erweiterung entfaellt nur Block 4 samt Trenner.
        { type: 'separator' },
        {
          // 4T-0322 (Epic 3E-0058): Ordner-Bereich als Arbeitsraum der
          // Applikation oeffnen.
          label: t('menu.file.openArea'),
          accelerator: acc('area.open'),
          click: send('menu:openArea'),
        },
        {
          // 4T-0322: Bereich schliessen — schliesst alle Fenster der
          // Bereichs-App; nur bei aktivem Bereich aktiv.
          label: t('menu.file.closeArea'),
          accelerator: acc('area.close'),
          enabled: !!(state && state.hasArea),
          click: send('menu:closeArea'),
        },
        {
          // 4T-0325 (Epic 3E-0058): schneller Wiedereinstieg in Bereiche.
          label: t('menu.file.recentAreas'),
          submenu: buildRecentAreasSubmenu(),
        },
        unless('area.createDemo', {
          // 4T-0632 (Epic 3E-0102): mitgelieferte Demo-Inhalte in einen
          // leeren Ordner kopieren und als Bereich oeffnen (Erweiterung
          // demo-area; im Aus-Zustand entfaellt der Eintrag).
          label: t('menu.file.createDemoArea'),
          accelerator: acc('area.createDemo'),
          click: send('menu:createDemoArea'),
        }),
        // 4T-0843 (Epic 3E-0147): Buecher stehen bei den Bereichs-Eintraegen
        // (PO-Klaerung zum Umsetzungs-Start), weil ein geoeffnetes Buch ein
        // eigener Kontext auf derselben Ebene wie Bereich und Arbeitsbereich
        // ist. Alle drei Aktionen fuehrt der Main direkt aus (Ordner-Dialog,
        // Anlage, aktives Buch der Applikation). Anders als beim Bereich
        // gibt es keinen Renderer-Umweg, weil im Fenster nichts zu
        // entscheiden ist.
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
        { type: 'separator' },
        {
          // 4T-0319 (Epic 3E-0057): neue logische Applikation (eigener
          // Fenster-Verbund mit eigener Nummerierung; entspricht dem
          // EXE-Zweitstart ohne Datei-Argument). Eigener Mini-Block
          // (PO-Ergaenzung zu Workshop-Punkt 7 in 3E-0098).
          label: t('menu.file.newApp'),
          accelerator: acc('app.newApplication'),
          click: send('menu:newApplication'),
        },
        unless('workspace.manage', { type: 'separator' }),
        unless('workspace.manage', {
          label: t('menu.file.workspaces'),
          submenu: buildWorkspacesSubmenu(),
        }),
        { type: 'separator' },
        {
          label: t('menu.file.autoSave'),
          type: 'checkbox',
          checked: !!(state && state.autoSave),
          click: () => {
            if (actions && actions.toggleAutoSave) actions.toggleAutoSave();
          },
        },
        {
          label: t('menu.file.save'),
          accelerator: acc('file.save'),
          // 4T-0213: Handbuch-Tabs sind read-only — Speichern deaktiviert.
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
        {
          // 4T-0339 (Epic 3E-0061): aktive Datei umbenennen (Dialog im
          // Renderer; Unterseiten-Baeume kaskadieren, 4T-0340).
          label: t('menu.file.rename'),
          accelerator: acc('file.rename'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: send('menu:renameFile'),
        },
        {
          // 4T-0774 (Epic 3E-0128): Unterseite von der uebergeordneten Seite
          // loesen. Ob die aktive Datei ueberhaupt eine Unterseite ist, prueft
          // der Renderer und meldet es als Hinweis — wie beim Umbenennen, damit
          // der Eintrag nicht ohne erkennbaren Grund verschwindet.
          label: t('menu.file.detachSubpage'),
          accelerator: acc('file.detachSubpage'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: send('menu:detachSubpage'),
        },
        {
          // 4T-0303 (Epic 3E-0054): PDF-Export des gerenderten Inhalts.
          // Direkt nach "Speichern unter..." (Epic-Festlegung). Handbuch-Tabs
          // sind exportierbar (gerenderter Inhalt vorhanden), nur der
          // Einstellungs-Tab (systemTab) ist ausgenommen.
          label: t('menu.file.exportPdf'),
          accelerator: acc('file.exportPdf'),
          enabled: !!(state && state.hasActiveTab) && !systemTab,
          click: send('menu:exportPdf'),
        },
        {
          // 4T-0041 (Epic 3E-0008): Export-Submenu fuer den HTML-Konverter.
          // 'Portables Markdown...' ersetzt perspective-table-Codeblocks im aktiven
          // Tab durch inline HTML-Tabellen und speichert das Ergebnis ueber
          // einen Save-As-Dialog (Vorbelegung '<basename>-portable.md').
          label: t('menu.file.export'),
          enabled: !!(state && state.hasActiveTab) && !systemTab,
          submenu: [
            {
              label: t('menu.file.exportPortable'),
              click: send('menu:exportPortable'),
            },
          ],
        },
        { type: 'separator' },
        {
          // 4T-0018: Settings-Dialog (Schriftart, -groesse). Renderer-Hook.
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
          // 4T-0085 (Epic 3E-0014): Vierter View-Modus "Live" mit Inline-
          // Render im Source-Editor. Hotkey CmdOrCtrl+4 schliesst die
          // 1-2-3-4-Folge ab.
          label: t('menu.view.live'),
          type: 'radio',
          checked: viewMode === 'live',
          enabled: !systemTab,
          accelerator: acc('view.modeLive'),
          click: send('menu:viewChange', 'live'),
        },
        { type: 'separator' },
        {
          // 4T-0019: Edit-Modus auch im Menue erreichbar (im Fokus-Modus ist
          // der Toolbar-Button rechts unten ausgeblendet). Pro aktivem Tab.
          label: t('menu.view.edit'),
          type: 'checkbox',
          checked: !!(state && state.editMode),
          // 4T-0213: Handbuch-Tabs sind read-only — Bearbeiten deaktiviert
          // (sonst toggelt die native Checkbox sichtbar, obwohl der
          // Renderer-Guard den Modus-Wechsel verwirft).
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          accelerator: acc('view.toggleEdit'),
          click: send('menu:toggleEdit'),
        },
        {
          // 4T-0070: Scroll-Synchronisation zwischen Source- und Render-Pane
          // in der geteilten Ansicht. Pro aktivem Tab.
          label: t('menu.view.scrollSync'),
          type: 'checkbox',
          checked: !!(state && state.scrollSyncEnabled),
          enabled: !!(state && state.hasActiveTab),
          click: send('menu:toggleScrollSync'),
        },
        {
          // 4T-0333 (Epic 3E-0060): Historien-Ansicht des aktiven Dokuments
          // (Revisionsliste, Vergleich, Wiederherstellen) als System-Seite.
          label: t('menu.view.history'),
          accelerator: acc('history.open'),
          enabled: !!(state && state.hasActiveTab) && !(state && state.manualTab) && !systemTab,
          click: send('menu:openHistory'),
        },
        unless('graph.openArea', {
          // 4T-0455 (Epic 3E-0084): Bereichs-Graph als read-only Tab; nur
          // bei aktivem Bereich aktiv (Muster journal.openToday).
          label: t('menu.view.areaGraph'),
          accelerator: acc('graph.openArea'),
          enabled: !!(state && state.hasArea),
          click: send('menu:openAreaGraph'),
        }),
        unless('stats.openArea', {
          // 4T-0620 (Epic 3E-0117): Bereichs-Statistik als read-only Tab,
          // direkt hinter dem Bereichs-Graph (beide bereichsweite
          // Auswertungen); nur bei aktivem Bereich aktiv.
          label: t('menu.view.areaStats'),
          accelerator: acc('stats.openArea'),
          enabled: !!(state && state.hasArea),
          click: send('menu:openAreaStats'),
        }),
        {
          // 4T-0480 (Epic 3E-0089): Kommando-Palette — filterbares Popup
          // aller Registry-Kommandos; immer verfuegbar (Kern-Bedienung).
          label: t('menu.view.commandPalette'),
          accelerator: acc('app.commandPalette'),
          click: send('menu:openCommandPalette'),
        },
        { type: 'separator' },
        {
          // 4T-0568 (Epic 3E-0104): Panel-Untermenue — alle 13 Panel-Toggles
          // gebuendelt, in der vom Renderer gemeldeten, frei einstellbaren
          // Reihenfolge (identisch zur Statusbar-Leiste). Ersetzt die
          // frueheren elf Einzel-Eintraege.
          label: t('menu.view.panels'),
          submenu: panelSubmenu,
        },
        {
          // 4T-0626 (Epic 3E-0119): benannte Sidebar-Anordnungen — direkt
          // beim Panel-Untermenue (derselbe Themen-Block Sidebar/Panels).
          label: t('menu.view.sidebarLayouts'),
          submenu: variantsSubmenu,
        },
        // 4T-0697 (Epic 3E-0141): linke/rechte Sidebar-Spalte der aktiven
        // Editor-Spalte ein-/ausklappen. BEWUSST direkte Eintraege im
        // Ansichtsmenue, NICHT im Panel-Untermenue — dieses ist dem Waechter
        // panel-zugaenge.spec.js vorbehalten, der dort nur Panel-Checkboxen
        // erwartet. Haekchen aus dem Menue-State der aktiven Pane-Group; im
        // Aus-Zustand der Erweiterung entfernt unless() beide Eintraege.
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
        { type: 'separator' },
        {
          label: t('menu.view.foldGutter'),
          type: 'checkbox',
          checked: !!(state && state.foldGutter),
          enabled: togglesEnabled,
          click: send('menu:toggleFoldGutter'),
        },
        {
          label: t('menu.view.lineNumbers'),
          type: 'checkbox',
          checked: !!(state && state.lineNumbers),
          enabled: togglesEnabled,
          click: send('menu:toggleLineNumbers'),
        },
        {
          label: t('menu.view.wordWrap'),
          type: 'checkbox',
          checked: !!(state && state.wordWrap),
          enabled: togglesEnabled,
          click: send('menu:toggleWordWrap'),
        },
        { type: 'separator' },
        unless('view.toggleFocusMode', {
          // 4T-0019: Fokus-Modus toggelt UI-Chrome (Tabbar, Statusbar, Sidebar)
          // im aktiven Fenster. Wirkt nur auf dieses Fenster, persistierter
          // Wert ist global.
          label: t('menu.view.focusMode'),
          type: 'checkbox',
          checked: !!(state && state.focusMode),
          accelerator: acc('view.toggleFocusMode'),
          click: send('menu:toggleFocusMode'),
        }),
        unless('view.toggleTypewriterScroll', {
          // 4T-0019: Typewriter-Scroll haelt die Cursor-Zeile im Editor-Pane
          // vertikal zentriert.
          label: t('menu.view.typewriterScroll'),
          type: 'checkbox',
          checked: !!(state && state.typewriterScroll),
          click: send('menu:toggleTypewriterScroll'),
        }),
        { type: 'separator' },
        {
          // 4T-0030: Theme-Untermenue mit drei Radio-Items.
          // 'System' folgt dem Windows-Theme (bisheriges Verhalten),
          // 'Hell'/'Dunkel' erzwingen das jeweilige Theme app-weit.
          label: t('menu.view.theme'),
          submenu: [
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
          ],
        },
        { type: 'separator' },
        {
          // 4T-0084 (Epic 3E-0014): Entwickler-Tools-Toggle. Standard-
          // Shortcut Strg+Umschalt+I ist in dieser App fuer Outline
          // belegt (Zeile 220); F12 als alternative Bindung gibt
          // Zugang zur Konsole fuer Debug-Sessions.
          // M-10/K-03 (4T-0185): Label lokalisiert (war als einziges
          // Menue-Label hartkodiert deutsch).
          // M-10-Folge (4T-0191): F12 bleibt BEWUSST ohne Eintrag im
          // Hilfe-Dialog und in der README-Tastenkuerzel-Tabelle —
          // Entwickler-Tools sind ein Debug-Werkzeug, kein beworbenes
          // Nutzer-Feature; der Menuepunkt selbst zeigt das Kuerzel.
          label: t('menu.view.devTools'),
          accelerator: 'F12',
          role: 'toggleDevTools',
        },
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
          label: t('menu.help.about'),
          click: send('menu:openAbout'),
        },
        { type: 'separator' },
        {
          label: t('menu.help.restoreSession'),
          type: 'checkbox',
          checked: !!(state && state.restoreSession),
          click: send('menu:toggleRestoreSession'),
        },
      ],
    },
  ];

  // 4T-0294: unless()-Luecken (deaktivierte Erweiterungen) entfernen.
  for (const top of template) {
    if (Array.isArray(top.submenu)) top.submenu = top.submenu.filter(Boolean);
  }
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu, tForLocale };
