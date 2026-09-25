// Menü-Factory pro Fenster. Baut das native Electron-Menu (Datei, Ansicht,
// Hilfe) aus den i18n-Strings und dem zuletzt vom Renderer gemeldeten Stand
// (Sprache, View-Modus, Toggles, Sitzungs-Setting).
'use strict';

const { Menu } = require('electron');
// 4T-000207 (Epic 3E-000015): Accelerators kommen aus der Kommando-Registry
// (effektive Map wird von main.js aus Registry plus Store gemerged und in
// state.hotkeys uebergeben); der Fallback deckt defensive Aufrufe ohne
// Map ab und entspricht den Registry-Defaults.
const {
  commandAvailability,
  effectiveMenuAccelerators,
} = require('../../shared/commands/commands');
// 4T-001637 (Epic 3E-000295): Verfuegbarkeits-Modell — das Menue entscheidet
// die Freigabe seiner Eintraege nicht mehr selbst, sondern wertet dieselbe
// Bedingung aus, die auch die Kommando-Palette liest.
const { availabilityContext, isAvailable } = require('../../shared/commands/command-availability');
// 4T-000538 (Epic 3E-000098): Farbpunkt-Icons des Arbeitsbereichs-Untermenues.
// 4T-000887: seither in menu-icons.js, weil Bitmap-Zeichnung eine eigene
// Fachlichkeit neben dem Menue-Baum ist.
const { workspaceDotIcon } = require('./menu-icons');
// 4T-000888 (Epic 3E-000168): Aufbau der vier "Zuletzt geoeffnet"-Untermenues
// (Dateien, Bereiche, Buecher, Regale) — eigene Fachlichkeit neben dem
// Menue-Baum, Muster menu-icons.js.
const { createRecentListBuilder } = require('./menu-recent');
// 4T-001737 (Epic 3E-000308): Aufbau des Arbeitsbereiche-Untermenues samt der
// Label-Bildung aus Name und Bereichs-Zuordnung — aus demselben Grund
// ausgeloest wie die beiden Nachbarn darueber (Begruendung im Modul-Kopf).
const { createWorkspacesSubmenuBuilder } = require('./menu-workspaces');
// 4T-001738 (Epic 3E-000308): Der Fenster-Block des Datei-Menues («Neues
// Fenster» vor «Neue Applikation») liegt in menu-fenster.js, weil seine
// Reihenfolge eine Entscheidung ist und dort gegenstaendlich pruefbar bleibt.
const { windowMenuItems } = require('./menu-fenster');
// 4T-000568 (Epic 3E-000104): Panel-Zugangs-Modell — Label-Key, Toggle-Kommando
// (Accelerator) und Fallback-Reihenfolge des Panel-Untermenues.
const { PANEL_ACCESS, panelAccessById } = require('../../shared/panel-access');

// 4T-000391 (Epic 3E-000129): Rueckfall-Sprache aus der einen Quelle.
const { FALLBACK_LOCALE } = require('../../shared/locales');
// 4T-001594 (Epic 3E-000129): Der Katalog-Lader des Hauptprozesses wohnt seit
// dem Auszug in menu-dict.js; die Menue-Fabrik ruft ihn nur noch auf und reicht
// ihn ueber ihre Exporte weiter.
const { loadDict, tForLocale, clearDictCache } = require('./menu-dict');

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

// state: {
//   locale: 'de'|'en'|'fr'|'es'|'it',
//   viewMode: 'source'|'split'|'rendered'|null,
//   lineNumbers: boolean,
//   wordWrap: boolean,
//   restoreSession: boolean,
// }
function buildMenu(win, state, actions) {
  const locale = state && state.locale ? state.locale : FALLBACK_LOCALE;
  // 4T-001595 (Nachtrag): Der Menü-Aufbau löst über tForLocale auf, damit die
  // Rückfall-Kette je Schlüssel (eingestellte Sprache → Englisch → Name) auch
  // hier gilt. Ein eigener Nachschlag mit Rückfall auf den Schlüssel zeigte
  // dem Product Owner den rohen Schlüssel eines Menü-Eintrags, den seine
  // Sprachdatei noch nicht kannte — der vierte Auflösungs-Ort des
  // Hauptprozesses, den die Konzept-Stufe nicht gezählt hatte. Der Wächter
  // in test/unit/i18n.test.js hält den Hauptprozess seither bei einer Stelle.
  const t = (k) => tForLocale(locale, k);

  const send =
    (channel, ...args) =>
    () => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
    };

  const viewMode = state && state.viewMode ? state.viewMode : 'rendered';
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
  // 4T-001653 (Epic 3E-000287): Der Canvas-Modus ist dokument-abhaengig
  // (Anordnung des Product Owners vom 2026-09-09) — der Eintrag bleibt
  // sichtbar und wird deaktiviert, wie die uebrigen Modi auf einer
  // System-Seite. Das Verschwinden ist seit 4T-001656 dem Erweiterungs-
  // Schalter vorbehalten und laeuft ueber unless('view.modeCanvas', …).
  const canvasTab = !!(state && state.canvasTab);
  // 4T-001847 (Epic 3E-000110): Der Tafel-Modus ist ebenso dokument-abhaengig —
  // der Eintrag bleibt sichtbar und wird deaktiviert; das Verschwinden ist dem
  // Erweiterungs-Schalter vorbehalten und laeuft ueber
  // unless('view.modeKanban', …).
  const tafelTab = !!(state && state.tafelTab);
  // 4T-001904: Anzeige-Schalter der Tafel, { Einstellungs-Schlüssel: Wert }.
  const kanbanAnzeige = (state && state.kanbanAnzeige) || {};

  // 4T-000207: effektive Accelerators pro Kommando-ID. Leerer String =
  // Kommando bewusst ohne Binding -> Menue-Eintrag ohne Accelerator
  // (Electron erwartet dann undefined).
  const hotkeys = (state && state.hotkeys) || effectiveMenuAccelerators(null);
  const acc = (commandId) => hotkeys[commandId] || undefined;

  // 4T-001637 (Epic 3E-000295): Der Kontext-Vertrag des Verfuegbarkeits-Modells,
  // an GENAU EINER Stelle aus dem gemeldeten Menue-Zustand gebaut — das
  // Gegenstueck zu currentPaletteContext im Renderer.
  //
  // Woher die Felder kommen, ist die benannte Grenze des Modells (Zuschnitt
  // 4T-000918): hasArea, hasBook, hasShelf und hasWorkspace sind main-seitige
  // Wahrheit aus der App-Registry (menu-apply.js), hasTab, manualTab und
  // systemTab meldet der Renderer. Geteilt wird die REGEL, nicht die Quelle des
  // Zustands; dass beide Seiten auch denselben Wert sehen, deckt 4T-001638 mit
  // zwei E2E-Faellen ab.
  //
  // Die beiden renderer-eigenen Felder inTable und hasCalendarConfig bleiben
  // leer: Sie tragen die drei Bedingungen ohne Menue-Eintrag (editor, tabelle,
  // editorUndKalender), und kein Menue-Eintrag nennt eine davon — der
  // Durchlauf-Waechter haelt das fest.
  const availCtx = availabilityContext({
    hasTab: !!(state && state.hasActiveTab),
    manualTab: !!(state && state.manualTab),
    systemTab,
    viewMode,
    editMode: false,
    hasArea: !!(state && state.hasArea),
    hasBook: !!(state && state.hasBook),
    hasShelf: !!(state && state.hasShelf),
    hasWorkspace: !!(state && state.hasWorkspace),
    // 4T-001697 (Epic 3E-000287): das zehnte Feld, aus demselben gemeldeten
    // Zustand wie die uebrigen; es traegt die beiden Canvas-Bedingungen.
    canvasTab,
    // 4T-001847 (Epic 3E-000110): das elfte Feld, aus demselben gemeldeten
    // Zustand; es traegt die Bedingung 'tafelAnsicht'.
    tafelTab,
    // 4T-001852 (Epic 3E-000110): das zwoelfte Feld, aus demselben gemeldeten
    // Zustand; es traegt die Bedingung 'leeresDokumentOhneTafel'.
    leeresDokument: !!(state && state.leeresDokument),
  });
  // Freigabe eines Menue-Eintrags. Das Argument ist immer die Kommando-Kennung
  // desselben Eintrags; der Waechter prueft, dass sie mit der in acc() gleich
  // ist (ein vertauschtes Paar waere sonst unsichtbar).
  const avail = (commandId) => isAvailable(commandAvailability(commandId), availCtx);

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
        // 4T-001637: Die sechzehn Panel-Umschalter sind der einzige
        // Menue-Zweig, der seine Eintraege aus einem Modell baut statt sie
        // hinzuschreiben. Sie tragen deshalb kein literales acc('<id>') und
        // sind der Erhebung vom 2026-09-08 entgangen — sie hat 55 Eintraege
        // gemessen, das Menue hat 71. Ihre Bedingung ist 'immer', wie ihr
        // heutiger Zustand ohne enabled-Zeile; der Aufruf steht hier, damit
        // AUSNAHMSLOS jeder Menue-Eintrag eines Kommandos die Freigabe aus
        // derselben Quelle bezieht.
        enabled: avail(meta.commandId),
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
    enabled: avail('sidebar.saveVariant'),
    click: send('menu:saveSidebarVariant'),
  });

  // Recent-Submenues dynamisch befuellen. 4T-000325 (Epic 3E-000058) legte die
  // Bereichs-Liste neben die Datei-Liste, 4T-000888 die Buch- und die
  // Regal-Liste; seither teilen sich alle vier diesen einen Aufbau, der seit
  // 4T-000888 in menu-recent.js liegt.
  const buildRecentList = createRecentListBuilder(t, actions);

  // 4T-000538 (Epic 3E-000098): Untermenue "Arbeitsbereiche" — Liste aller
  // Arbeitsbereiche, darunter die vier Lebenszyklus-Aktionen. 4T-001737: Der
  // Aufbau liegt seither in menu-workspaces.js, weil die Label-Bildung aus
  // Name und Bereichs-Zuordnung eigene Fach-Logik mit Randfaellen ist; die
  // Farbpunkt-Bitmap wird hereingereicht, damit jenes Modul electron-frei
  // bleibt.
  const buildWorkspacesSubmenu = createWorkspacesSubmenuBuilder({
    t,
    acc,
    avail,
    send,
    actions,
    workspaces: Array.isArray(state && state.workspaces) ? state.workspaces : [],
    dotIcon: workspaceDotIcon,
  });

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
          enabled: avail('file.newTab'),
          click: () => {
            if (actions && actions.newTab) actions.newTab();
          },
        },
        {
          label: t('menu.file.open'),
          accelerator: acc('file.open'),
          enabled: avail('file.open'),
          click: send('menu:openFile'),
        },
        {
          // 4T-001501: wie "Oeffnen…" auf dem Namens-Weg. 4T-001514: Suchraum
          // traegt die aktive Datei ODER der Bereich (auch ohne Reiter).
          label: t('menu.file.quickOpen'),
          accelerator: acc('file.quickOpen'),
          enabled: avail('file.quickOpen'),
          click: send('menu:quickOpen'),
        },
        {
          label: t('menu.file.save'),
          accelerator: acc('file.save'),
          // 4T-000213: Handbuch-Tabs sind read-only — Speichern deaktiviert.
          enabled: avail('file.save'),
          click: () => {
            if (actions && actions.save) actions.save();
          },
        },
        {
          label: t('menu.file.saveAs'),
          accelerator: acc('file.saveAs'),
          enabled: avail('file.saveAs'),
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
            enabled: avail('file.newSubpage'),
            click: send('menu:newSubpage'),
          },
          unless('file.newFromTemplate', {
            // 4T-000426 (Epic 3E-000080): neue Datei aus Vorlage (Auswahl-Popup
            // und Platzhalter-Dialoge laufen im Renderer). Immer aktiv; ohne
            // konfigurierten Vorlagen-Ordner oder Ziel-Kontext meldet der
            // Renderer einen lokalisierten Hinweis.
            label: t('menu.file.newFromTemplate'),
            accelerator: acc('file.newFromTemplate'),
            enabled: avail('file.newFromTemplate'),
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
            enabled: avail('journal.openToday'),
            click: send('menu:journalToday'),
          }),
          unless('journal.openForDate', {
            // 4T-000433 (Epic 3E-000081): Journal-Eintrag fuer gewaehltes Datum
            // (Bereichs-Bindung wie beim Heute-Eintrag).
            label: t('menu.file.journalForDate'),
            accelerator: acc('journal.openForDate'),
            enabled: avail('journal.openForDate'),
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
            enabled: avail('file.bookmarkAdd'),
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
            enabled: avail('file.toggleAutoSave'),
            click: () => {
              if (actions && actions.toggleAutoSave) actions.toggleAutoSave();
            },
          },
          {
            // 4T-000339 (Epic 3E-000061): aktive Datei umbenennen (Dialog im
            // Renderer; Unterseiten-Baeume kaskadieren, 4T-000340).
            label: t('menu.file.rename'),
            accelerator: acc('file.rename'),
            enabled: avail('file.rename'),
            click: send('menu:renameFile'),
          },
          {
            // 4T-000774 (Epic 3E-000128): Unterseite von der uebergeordneten Seite
            // loesen. Ob die aktive Datei ueberhaupt eine Unterseite ist, prueft
            // der Renderer und meldet es als Hinweis — wie beim Umbenennen, damit
            // der Eintrag nicht ohne erkennbaren Grund verschwindet.
            label: t('menu.file.detachSubpage'),
            accelerator: acc('file.detachSubpage'),
            enabled: avail('file.detachSubpage'),
            click: send('menu:detachSubpage'),
          },
          {
            // 4T-001293 (Epic 3E-000224): geteiltes Dokument wieder zu einer Datei
            // machen; ob es geteilt ist, prueft der Renderer wie beim Loesen.
            label: t('menu.file.rejoinParts'),
            accelerator: acc('file.rejoinParts'),
            enabled: avail('file.rejoinParts'),
            click: send('menu:rejoinParts'),
          },
          { type: 'separator' },
          {
            // 4T-001479 (Epic 3E-000177): Druck ueber den Systemdialog, direkt
            // vor dem Untermenue «Exportieren» (Entscheidung E5 des Epics, mit
            // 4T-001811 auf den neuen Ort des PDF-Exports fortgeschrieben:
            // Drucken ist kein Export und bleibt auf dieser Ebene). Dieselbe
            // enabled-Regel wie der PDF-Export: Handbuch-Tabs sind druckbar,
            // nur der Einstellungs-Tab (systemTab) ist ausgenommen.
            label: t('menu.file.print'),
            accelerator: acc('file.print'),
            enabled: avail('file.print'),
            click: send('menu:print'),
          },
          {
            // 4T-000041 (Epic 3E-000008): Export-Submenu fuer den HTML-Konverter.
            // 'Portables Markdown...' ersetzt perspective-table-Codeblocks im aktiven
            // Tab durch inline HTML-Tabellen und speichert das Ergebnis ueber
            // einen Save-As-Dialog (Vorbelegung '<basename>-portable.md').
            label: t('menu.file.export'),
            enabled: !!(state && state.hasActiveTab) && !systemTab,
            // 4T-001805 (Epic 3E-000292): compactSubmenu, weil der zweite
            // Eintrag an der Erweiterung der Flaeche haengt und mit ihr
            // verschwindet — ein null in der Liste kaeme sonst bis zu Electron.
            submenu: compactSubmenu([
              {
                // 4T-000303 (Epic 3E-000054): PDF-Export des gerenderten Inhalts.
                // Handbuch-Tabs sind exportierbar (gerenderter Inhalt vorhanden),
                // nur der Einstellungs-Tab (systemTab) ist ausgenommen.
                //
                // 4T-001811 (Epic 3E-000292, Entscheidung des Product Owners
                // vom 2026-09-19, im Wortlaut «Dann ist alles an einer
                // Stelle»): Der Eintrag stand bis dahin eine Ebene hoeher,
                // unmittelbar nach «Drucken…». Er ist unveraendert hierher
                // verlegt — Beschriftung, Kuerzel, Kommando und
                // Verfuegbarkeits-Regel sind dieselben — und steht ZUERST,
                // vor den uebrigen Ausgabe-Wegen.
                label: t('menu.file.exportPdf'),
                accelerator: acc('file.exportPdf'),
                enabled: avail('file.exportPdf'),
                click: send('menu:exportPdf'),
              },
              {
                // 4T-000890 (Befund L-05): seit der Registrierung als Kommando
                // 'file.exportPortable' mit Accelerator-Anzeige; der Klick
                // laeuft unveraendert ueber den Menue-Kanal.
                label: t('menu.file.exportPortable'),
                accelerator: acc('file.exportPortable'),
                enabled: avail('file.exportPortable'),
                click: send('menu:exportPortable'),
              },
              // 4T-001805 (Epic 3E-000292, Entscheidung F2 des Product Owners
              // vom 2026-09-19): die Ausgabe der Flaeche im offenen Format
              // JSON Canvas, NACH dem portablen Markdown.
              unless('file.exportJsonCanvas', {
                label: t('menu.file.exportJsonCanvas'),
                accelerator: acc('file.exportJsonCanvas'),
                enabled: avail('file.exportJsonCanvas'),
                click: send('menu:exportJsonCanvas'),
              }),
            ]),
          },
          // 4T-001806 (Epic 3E-000292, Entscheidung F2 des Product Owners vom
          // 2026-09-19): das neue Untermenue «Importieren», unmittelbar NACH
          // «Exportieren» und mit einem einzigen Eintrag.
          //
          // Gebaut ueber submenuOrNull und nicht als festes Objekt: Der
          // Menuepunkt traegt KEINE eigene Freigabe-Regel — Einlesen braucht
          // weder Reiter noch offene Flaeche —, aber er haengt an seinem
          // einzigen Kind. Ist die Erweiterung der Flaeche aus, filtert
          // unless() das Kind heraus, und der Menuepunkt entfaellt mit ihm,
          // statt leer stehen zu bleiben.
          submenuOrNull('menu.file.import', [
            unless('file.importJsonCanvas', {
              label: t('menu.file.importJsonCanvas'),
              accelerator: acc('file.importJsonCanvas'),
              enabled: avail('file.importJsonCanvas'),
              click: send('menu:importJsonCanvas'),
            }),
          ]),
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
            enabled: avail('area.open'),
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
            enabled: avail('area.close'),
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
            enabled: avail('area.createDemo'),
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
            enabled: avail('book.open'),
            click: () => {
              if (actions && actions.openBook) actions.openBook();
            },
          }),
          unless('book.create', {
            label: t('menu.file.newBook'),
            accelerator: acc('book.create'),
            enabled: avail('book.create'),
            click: () => {
              if (actions && actions.createBook) actions.createBook();
            },
          }),
          unless('book.close', {
            // Nur bei aktivem Buch aktiv (Muster "Bereich schliessen").
            label: t('menu.file.closeBook'),
            accelerator: acc('book.close'),
            enabled: avail('book.close'),
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
            enabled: avail('book.moveChapterFile'),
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
            enabled: avail('shelf.open'),
            click: () => {
              if (actions && actions.openShelf) actions.openShelf();
            },
          }),
          unless('shelf.create', {
            label: t('menu.file.newShelf'),
            accelerator: acc('shelf.create'),
            enabled: avail('shelf.create'),
            click: () => {
              if (actions && actions.createShelf) actions.createShelf();
            },
          }),
          unless('shelf.close', {
            // Nur bei aktivem Regal aktiv (Muster "Buch schliessen").
            label: t('menu.file.closeShelf'),
            accelerator: acc('shelf.close'),
            enabled: avail('shelf.close'),
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
        // 4T-001738 (Epic 3E-000308): «Neues Fenster» und «Neue Applikation»
        // als Paar aus menu-fenster.js, in dieser Reihenfolge (E4).
        ...windowMenuItems({ t, acc, avail, send }),
        {
          // 4T-000018: Settings-Dialog (Schriftart, -groesse). Renderer-Hook.
          label: t('menu.file.settings'),
          accelerator: acc('app.openSettings'),
          enabled: avail('app.openSettings'),
          click: send('menu:openSettings'),
        },
        // 4T-001587 (Epic 3E-000160): Export und Import der eigenen Einstellungen,
        // unmittelbar hinter dem Einstellungs-Dialog — dort entsteht, was hier
        // exportiert wird. Eigenes Untermenue, weil der Import (4T-001588)
        // daneben tritt. Beide Beschriftungen sind Ansage des Product Owners aus
        // der Test-Iteration vom 2026-09-08: Das Untermenue traegt dasselbe Wort
        // wie der Dialog darueber, damit die Anwendung EINEN Begriff fuer die
        // Sache fuehrt. Der Struktur-Pruefschritt des Epics legt die Einordnung
        // dem Product Owner vor (4T-001591); dort ist auch zu beurteilen, ob die
        // Nachbarschaft zweier gleich benannter Eintraege bleiben soll.
        submenuOrNull('menu.file.setupSubmenu', [
          unless('file.exportSetup', {
            label: t('menu.file.exportSetup'),
            accelerator: acc('file.exportSetup'),
            enabled: avail('file.exportSetup'),
            click: send('menu:exportSetup'),
          }),
          // 4T-001588: Die Gegenrichtung steht direkt darunter; beide
          // gehoeren zur selben Erweiterung und verschwinden gemeinsam.
          unless('file.importSetup', {
            label: t('menu.file.importSetup'),
            accelerator: acc('file.importSetup'),
            enabled: avail('file.importSetup'),
            click: send('menu:importSetup'),
          }),
        ]),
        // 4T-001592 und 4T-001593 (Epic 3E-000129): Die eigene Oberflaechen-
        // Sprache, unmittelbar hinter dem Einrichtungs-Untermenue. Hierher und
        // NICHT neben die Sprach-Auswahl der Statusleiste, wie der Task es
        // zunaechst vorschlug: Die Auswahl ist ein Dauer-Schalter fuer eine
        // haeufige Handlung, die beiden Wege hier fallen einmal je
        // Uebersetzungs-Vorhaben an.
        //
        // **Eigenes Untermenue nach dem Muster des Nachbarn** (Befund des
        // Product Owners vom 2026-09-09): Die erste Fassung haengte beide
        // Eintraege FLACH ins Datei-Menue, direkt neben ein Untermenue, das
        // dieselbe Bauform traegt — einen Oberbegriff mit zwei Richtungen.
        // Zwei Formen fuer dieselbe Sache sind fuer den Anwender ein Bruch,
        // und im Bild wirkte die flache Fassung wie ein Fremdkoerper. Der
        // Oberbegriff steht deshalb im Titel und die Eintraege tragen kurze
        // Verben, genau wie «Einstellungen > Exportieren…/Importieren…».
        // Bleibt nach unless() nichts uebrig, entfaellt das Untermenue ganz.
        submenuOrNull('menu.file.localeSubmenu', [
          unless('file.exportLocaleTemplate', {
            label: t('menu.file.exportLocaleTemplate'),
            accelerator: acc('file.exportLocaleTemplate'),
            enabled: avail('file.exportLocaleTemplate'),
            click: send('menu:exportLocaleTemplate'),
          }),
          unless('file.importLocale', {
            label: t('menu.file.importLocale'),
            accelerator: acc('file.importLocale'),
            enabled: avail('file.importLocale'),
            click: send('menu:importLocale'),
          }),
          // 4T-001594 (Epic 3E-000129): Der dritte Weg — eine eingespielte
          // Sprache wieder entfernen. Er steht hier und nicht neben der
          // Sprach-Auswahl der Statusleiste, weil er zum selben Oberbegriff
          // gehört wie die beiden darüber und wie sie einmal je
          // Übersetzungs-Vorhaben anfällt (Entscheidung des Product Owners
          // vom 2026-09-10, Frage 4 des Management-Summarys). Das Vorbild
          // «Einstellungen» kennt kein Entfernen — eine eingespielte Sprache
          // dagegen ist Bestand im Benutzerprofil, und was sich anlegen lässt,
          // muss sich auch löschen lassen.
          unless('file.removeLocale', {
            label: t('menu.file.removeLocale'),
            accelerator: acc('file.removeLocale'),
            enabled: avail('file.removeLocale'),
            click: send('menu:removeLocale'),
          }),
          // 4T-001596 (Epic 3E-000129): Der vierte Weg — die eigene Sprachdatei
          // auf den Stand der laufenden Programmfassung bringen. Er steht hier,
          // weil er derselben Arbeit dient wie seine drei Nachbarn und wie sie
          // beim Uebersetzen anfaellt: Die ausgegebene Datei ist die Vorlage
          // fuer den naechsten Durchgang.
          unless('file.updateLocale', {
            label: t('menu.file.updateLocale'),
            accelerator: acc('file.updateLocale'),
            enabled: avail('file.updateLocale'),
            click: send('menu:updateLocale'),
          }),
        ]),
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
          enabled: avail('view.modeRendered'),
          accelerator: acc('view.modeRendered'),
          click: send('menu:viewChange', 'rendered'),
        },
        {
          label: t('menu.view.split'),
          type: 'radio',
          checked: viewMode === 'split',
          enabled: avail('view.modeSplit'),
          accelerator: acc('view.modeSplit'),
          click: send('menu:viewChange', 'split'),
        },
        {
          label: t('menu.view.source'),
          type: 'radio',
          checked: viewMode === 'source',
          enabled: avail('view.modeSource'),
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
          enabled: avail('view.modeLive'),
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
          enabled: avail('view.modeMindmap'),
          accelerator: acc('view.modeMindmap'),
          click: send('menu:viewChange', 'mindmap'),
        }),
        // 4T-001653 (Epic 3E-000287): Sechster Modus, die raeumliche
        // Arbeitsflaeche.
        // 4T-001656: Bei ausgeschalteter Erweiterung faellt der Eintrag ueber
        // unless() weg (Muster Mindmap) — es gibt die Ansicht dann nicht.
        // Ohne Flaeche im Dokument bleibt er dagegen sichtbar und ist
        // deaktiviert: Die Funktion gibt es, dieses Dokument traegt sie nur
        // nicht.
        unless('view.modeCanvas', {
          label: t('menu.view.canvas'),
          type: 'radio',
          checked: viewMode === 'canvas',
          enabled: avail('view.modeCanvas'),
          accelerator: acc('view.modeCanvas'),
          click: send('menu:viewChange', 'canvas'),
        }),
        // 4T-001847 (Epic 3E-000110): Siebter Modus, die Kanban-Tafel. Bei
        // ausgeschalteter Erweiterung faellt der Eintrag ueber unless() weg
        // (Muster Mindmap und Canvas) — es gibt die Ansicht dann nicht. Ohne
        // Tafel im Dokument bleibt er dagegen sichtbar und ist deaktiviert:
        // Die Funktion gibt es, dieses Dokument traegt sie nur nicht.
        unless('view.modeKanban', {
          label: t('menu.view.kanban'),
          type: 'radio',
          checked: viewMode === 'kanban',
          enabled: avail('view.modeKanban'),
          accelerator: acc('view.modeKanban'),
          click: send('menu:viewChange', 'kanban'),
        }),
        // 4T-001852 (Epic 3E-000110): die Wege zu einer Tafel und die Befehle
        // auf ihr, gebuendelt in EINEM Untermenue, das den Namen der
        // Dokument-Art traegt (Festlegung des Product Owners zum Untermenue
        // einer Dokument-Art, Erkenntnisse und Entscheidungen). Es haengt an
        // der Erweiterung und verschwindet mit ihr vollstaendig: Fallen alle
        // vier Eintraege ueber unless() weg, liefert submenuOrNull null, der
        // innere Trenner faellt mit compactSubmenu weg, und compactSubmenu der
        // Ebene darueber wirft den dann fuehrenden Trenner mit — ohne eine
        // Zeile eigener Logik, wie beim Vorbild «Canvas-Flaeche bearbeiten»
        // darunter.
        //
        // Der Modus-Eintrag «Tafel» bleibt oben bei den Modi: Die sieben Modi
        // sind eine geschlossene Auswahl, bei der genau einer gilt, und einer
        // davon in einem Untermenue machte die Auswahl unvollstaendig.
        //
        // 4T-001854: Die beiden Anlege-Befehle standen bis zum 2026-09-22
        // einzeln VOR dem Untermenue, weil ihr Ort beim Product Owner lag.
        // Er hat am 2026-09-22 Variante 1 entschieden: Sie ziehen als zweite
        // Gruppe hinter einem Trenner hier hinein — erst die beiden Wege zu
        // einer Tafel, dann die Befehle, die auf einer bestehenden Tafel
        // wirken.
        submenuOrNull('menu.view.kanbanBoard', [
          unless('kanban.newBoard', {
            label: t('command.kanban.newBoard'),
            enabled: avail('kanban.newBoard'),
            accelerator: acc('kanban.newBoard'),
            click: send('menu:kanbanNewBoard'),
          }),
          unless('kanban.convertToBoard', {
            label: t('command.kanban.convertToBoard'),
            enabled: avail('kanban.convertToBoard'),
            accelerator: acc('kanban.convertToBoard'),
            click: send('menu:kanbanConvertToBoard'),
          }),
          // 4T-001854: Der Trenner setzt die beiden Wege zu einer Tafel von den
          // Befehlen ab, die auf einer bestehenden Tafel wirken.
          { type: 'separator' },
          // 4T-001849 (Epic 3E-000110): Karte auf der Tafel anlegen. Der
          // gewoehnliche Weg ist die Schaltflaeche am Fuss der Spalte; der
          // Eintrag macht die Funktion auffindbar. Aktiviert allein, wenn das
          // aktive Dokument eine Tafel traegt UND die Tafel-Ansicht offen ist.
          // Mit ausgeschalteter Erweiterung faellt er wie der Modus-Eintrag
          // ueber unless() weg.
          unless('kanban.addCard', {
            label: t('command.kanban.addCard'),
            enabled: avail('kanban.addCard'),
            accelerator: acc('kanban.addCard'),
            click: send('menu:kanbanAddCard'),
          }),
          // 4T-001906 (Epic 3E-000318): Karte archivieren, in der Gruppe der
          // Karten-Befehle direkt hinter der Karten-Anlage und mit derselben
          // Bedingung. Wirkt auf die gewählte Karte; ohne Wahl ohne Wirkung.
          unless('kanban.archiveCard', {
            label: t('command.kanban.archiveCard'),
            enabled: avail('kanban.archiveCard'),
            accelerator: acc('kanban.archiveCard'),
            click: send('menu:kanbanArchiveCard'),
          }),
          // 4T-001851 (Epic 3E-000110): Spalte auf der Tafel anlegen,
          // unmittelbar hinter dem Karten-Eintrag und mit derselben Bedingung.
          unless('kanban.addColumn', {
            label: t('command.kanban.addColumn'),
            enabled: avail('kanban.addColumn'),
            accelerator: acc('kanban.addColumn'),
            click: send('menu:kanbanAddColumn'),
          }),
          // 4T-001904 (Epic 3E-000318): die Anzeige-Schalter als dritte Gruppe,
          // Häkchen nach dem Vorbild «Automatisch speichern»: Zustand aus der
          // gespeicherten Einstellung, nach dem Umschalten baut die
          // Einstellungs-Verteilung die Menüs neu. Ein Kanal für alle Schalter.
          { type: 'separator' },
          unless('kanban.toggleTagsFooter', {
            label: t('menu.view.kanbanTagsFooter'),
            type: 'checkbox',
            checked: kanbanAnzeige['kanban.tagsAmFuss'] === true,
            enabled: avail('kanban.toggleTagsFooter'),
            accelerator: acc('kanban.toggleTagsFooter'),
            click: send('menu:kanbanSchalter', 'kanban.toggleTagsFooter'),
          }),
          // 4T-001903: «Termine relativ anzeigen», derselbe Kanal.
          unless('kanban.toggleRelativeDates', {
            label: t('menu.view.kanbanRelativeDates'),
            type: 'checkbox',
            checked: kanbanAnzeige['kanban.terminRelativ'] === true,
            enabled: avail('kanban.toggleRelativeDates'),
            accelerator: acc('kanban.toggleRelativeDates'),
            click: send('menu:kanbanSchalter', 'kanban.toggleRelativeDates'),
          }),
        ]),
        // 4T-001796 (Epic 3E-000315): die sieben Eintraege, die auf der Flaeche
        // wirken, gebuendelt in EINEM Untermenue «Flaeche bearbeiten»
        // (Anordnung des Product Owners vom 2026-09-18, Variante V2). Sie
        // standen bis dahin einzeln untereinander im Ansichtsmenue und
        // bedeuteten in fuenf von sechs Ansichten nichts. Der Modus-Eintrag
        // darueber bleibt bei den uebrigen Modi: Die sechs Modi sind eine
        // geschlossene Auswahl, bei der genau einer gilt, und einer davon in
        // einem Untermenue machte die Auswahl unvollstaendig.
        //
        // Gebaut ueber submenuOrNull wie das Stapel-Untermenue darin: Im
        // Aus-Zustand der Erweiterung fallen alle zehn Kommandos ueber
        // unless() weg, compactSubmenu wirft den dann fuehrenden Trenner
        // mit, und der Eintrag selbst entfaellt — ohne eine Zeile eigener
        // Logik.
        submenuOrNull('menu.view.canvasEdit', [
          // 4T-001654 (Epic 3E-000287): Karte auf der Flaeche anlegen. Steht
          // bei den Flaechen-Befehlen, weil sie nur dort wirkt: aktiviert
          // allein, wenn das aktive Dokument eine Flaeche traegt UND die
          // Canvas-Ansicht offen ist. Ein Eintrag, der in jeder anderen
          // Ansicht ins Leere fuehrte, waere kein Zugang (dieselbe
          // Begruendung wie beim Modus selbst).
          // 4T-001656: Mit ausgeschalteter Erweiterung verschwindet er wie der
          // Modus-Eintrag darueber.
          unless('canvas.addCard', {
            label: t('command.canvas.addCard'),
            enabled: avail('canvas.addCard'),
            accelerator: acc('canvas.addCard'),
            click: send('menu:canvasAddCard'),
          }),
          // 4T-001701 (Epic 3E-000288): Form anlegen, mit derselben Bedingung
          // und aus demselben Grund wie die Karte darueber.
          unless('canvas.addShape', {
            label: t('command.canvas.addShape'),
            enabled: avail('canvas.addShape'),
            accelerator: acc('canvas.addShape'),
            click: send('menu:canvasAddShape'),
          }),
          // 4T-001702 (Epic 3E-000288): Gruppe anlegen, mit derselben Bedingung
          // und aus demselben Grund wie Karte und Form darueber.
          unless('canvas.addGroup', {
            label: t('command.canvas.addGroup'),
            enabled: avail('canvas.addGroup'),
            accelerator: acc('canvas.addGroup'),
            click: send('menu:canvasAddGroup'),
          }),
          // 4T-001747 (Epic 3E-000289): Verweis-Karte anlegen, hinter der Gruppe
          // und mit derselben Bedingung wie Karte, Form und Gruppe darueber.
          unless('canvas.addLinkCard', {
            label: t('command.canvas.addLinkCard'),
            enabled: avail('canvas.addLinkCard'),
            accelerator: acc('canvas.addLinkCard'),
            click: send('menu:canvasAddLinkCard'),
          }),
          // 4T-001748 (Epic 3E-000289): Bild-Karte anlegen, unmittelbar hinter der
          // Verweis-Karte und mit derselben Bedingung.
          unless('canvas.addImageCard', {
            label: t('command.canvas.addImageCard'),
            enabled: avail('canvas.addImageCard'),
            accelerator: acc('canvas.addImageCard'),
            click: send('menu:canvasAddImageCard'),
          }),
          // 4T-001770 (Epic 3E-000290): Verbindung von der gewaehlten Karte aus
          // anlegen, hinter den fuenf Anlege-Wegen und mit derselben Bedingung.
          unless('canvas.addConnection', {
            label: t('command.canvas.addConnection'),
            enabled: avail('canvas.addConnection'),
            accelerator: acc('canvas.addConnection'),
            click: send('menu:canvasAddConnection'),
          }),
          // 4T-001796: Der Trenner setzt die sechs Anlege-Befehle vom
          // Stapel-Untermenue ab — Befehle oben, die Gruppe darunter.
          { type: 'separator' },
          // 4T-001701 (Story 4S-000932): die vier Stapel-Befehle des gewaehlten
          // Elements, gebuendelt in einem Untermenue. Einzeln haetten sie das
          // Ansichtsmenue um vier kurze Zeilen verlaengert, die nur auf der
          // Flaeche etwas bedeuten; als Gruppe sind sie eine Zeile mit einem
          // Namen, der die Gruppe erklaert.
          submenuOrNull('menu.view.canvasStack', [
            unless('canvas.stackFront', {
              label: t('command.canvas.stackFront'),
              enabled: avail('canvas.stackFront'),
              accelerator: acc('canvas.stackFront'),
              click: send('menu:canvasStack', 'ganzNachVorn'),
            }),
            unless('canvas.stackForward', {
              label: t('command.canvas.stackForward'),
              enabled: avail('canvas.stackForward'),
              accelerator: acc('canvas.stackForward'),
              click: send('menu:canvasStack', 'eineStufeVor'),
            }),
            unless('canvas.stackBackward', {
              label: t('command.canvas.stackBackward'),
              enabled: avail('canvas.stackBackward'),
              accelerator: acc('canvas.stackBackward'),
              click: send('menu:canvasStack', 'eineStufeZurueck'),
            }),
            unless('canvas.stackBack', {
              label: t('command.canvas.stackBack'),
              enabled: avail('canvas.stackBack'),
              accelerator: acc('canvas.stackBack'),
              click: send('menu:canvasStack', 'ganzNachHinten'),
            }),
          ]),
        ]),
        {
          // 4T-000019: Edit-Modus auch im Menue erreichbar (im Fokus-Modus ist
          // der Toolbar-Button rechts unten ausgeblendet). Pro aktivem Tab.
          label: t('menu.view.edit'),
          type: 'checkbox',
          checked: !!(state && state.editMode),
          // 4T-000213: Handbuch-Tabs sind read-only — Bearbeiten deaktiviert
          // (sonst toggelt die native Checkbox sichtbar, obwohl der
          // Renderer-Guard den Modus-Wechsel verwirft).
          enabled: avail('view.toggleEdit'),
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
            enabled: avail('view.toggleFoldGutter'),
            accelerator: acc('view.toggleFoldGutter'),
            click: send('menu:toggleFoldGutter'),
          },
          {
            label: t('menu.view.lineNumbers'),
            type: 'checkbox',
            checked: !!(state && state.lineNumbers),
            enabled: avail('view.toggleLineNumbers'),
            accelerator: acc('view.toggleLineNumbers'),
            click: send('menu:toggleLineNumbers'),
          },
          {
            label: t('menu.view.wordWrap'),
            type: 'checkbox',
            checked: !!(state && state.wordWrap),
            enabled: avail('view.toggleWordWrap'),
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
            enabled: avail('view.toggleScrollSync'),
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
            enabled: avail('view.toggleTypewriterScroll'),
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
            enabled: avail('view.toggleSidebarLeft'),
            click: send('menu:toggleSidebarLeft'),
          }),
          unless('view.toggleSidebarRight', {
            label: t('menu.view.collapseSidebarRight'),
            type: 'checkbox',
            checked: !!(state && state.sidebarCollapsedRight),
            accelerator: acc('view.toggleSidebarRight'),
            enabled: avail('view.toggleSidebarRight'),
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
            enabled: avail('view.toggleFocusMode'),
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
          enabled: avail('history.open'),
          click: send('menu:openHistory'),
        },
        unless('graph.openArea', {
          // 4T-000455 (Epic 3E-000084): Bereichs-Graph als read-only Tab; nur
          // bei aktivem Bereich aktiv (Muster journal.openToday).
          label: t('menu.view.areaGraph'),
          accelerator: acc('graph.openArea'),
          enabled: avail('graph.openArea'),
          click: send('menu:openAreaGraph'),
        }),
        unless('stats.openArea', {
          // 4T-000620 (Epic 3E-000117): Bereichs-Statistik als read-only Tab,
          // direkt hinter dem Bereichs-Graph (beide bereichsweite
          // Auswertungen); nur bei aktivem Bereich aktiv.
          label: t('menu.view.areaStats'),
          accelerator: acc('stats.openArea'),
          enabled: avail('stats.openArea'),
          click: send('menu:openAreaStats'),
        }),
        unless('database.openOverview', {
          // 4T-001759 (Epic 3E-000253): Uebersicht der Datenbank, unmittelbar
          // hinter der Bereichs-Statistik — beide sind bereichsweite
          // Auswertungen. Aktiv bei gebundenem Bereich; ob er eine Datenbank
          // fuehrt, prueft der Anzeige-Prozess beim Oeffnen.
          label: t('menu.view.databaseOverview'),
          accelerator: acc('database.openOverview'),
          enabled: avail('database.openOverview'),
          click: send('menu:openDatabaseOverview'),
        }),
        unless('memory.openPage', {
          // 4T-001599 (Epic 3E-000191): My Extended Memory als vierter Eintrag
          // im Block der Folge-Ansichten. Immer aktiv — die Seite zeigt die
          // eingetragene Gefaess-Liste der Anwendung und haengt an keinem
          // geoeffneten Bereich.
          label: t('menu.view.myExtendedMemory'),
          accelerator: acc('memory.openPage'),
          enabled: avail('memory.openPage'),
          click: send('menu:openMemoryPage'),
        }),
        { type: 'separator' },
        {
          // 4T-000480 (Epic 3E-000089): Kommando-Palette — filterbares Popup
          // aller Registry-Kommandos; immer verfuegbar (Kern-Bedienung).
          label: t('menu.view.commandPalette'),
          accelerator: acc('app.commandPalette'),
          enabled: avail('app.commandPalette'),
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
          enabled: avail('help.open'),
          click: send('menu:openHelp'),
        },
        {
          // 4T-000644 (Epic 3E-000127): geführte Produkt-Tour, manuell startbar
          // direkt hinter dem Handbuch (beide Einstiege in die Erklärung der
          // Anwendung); ohne Default-Kürzel, die Registry liefert ein in den
          // Einstellungen belegtes Kürzel nach.
          label: t('menu.help.tour'),
          accelerator: acc('help.tour'),
          enabled: avail('help.tour'),
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
          enabled: avail('app.toggleRestoreSession'),
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

// 4T-001592 (Epic 3E-000129): `loadDict` ist seit der Sprach-Vorlage auch
// ausserhalb des Menues gefragt — die Vorlage entsteht aus derselben Quelle,
// aus der die Anwendung ihre englische Fassung laedt, statt aus einem zweiten
// Lese-Weg, der auseinanderlaufen koennte. `clearDictCache` kam mit 4T-001594
// hinzu, weil eine eigene Sprache zur Laufzeit eingespielt, ersetzt und
// entfernt wird.
// 4T-001594: Der Katalog selbst wohnt seither in menu-dict.js; die drei
// Funktionen bleiben hier im Export, damit die bestehenden Importeure
// (app/startup.js, ipc/locales.js, menu/menu-apply.js) unveraendert bleiben.
module.exports = { buildMenu, tForLocale, loadDict, clearDictCache };
