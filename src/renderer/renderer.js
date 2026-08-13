// Renderer-Entry: orchestriert die 4T-0179-Module in der Original-
// Reihenfolge des frueheren Monolithen (Seiteneffekt-Reihenfolge bleibt
// identisch; init() laeuft im app-init-Modul).
'use strict';

// 4T-0982 (Epic 3E-0196): die beiden Live-Modus-Module sind in den Feature-
// Ordner modules/live/ umgezogen. Sie stehen an der Stelle der Vorgänger,
// damit die Seiteneffekt-Reihenfolge unverändert bleibt; die Listener der
// Live-Rebuilds hängen jetzt in live/live-interaction.js, das live-widgets.js
// über livePreviewExtensions in den Import-Graphen zieht.
import './modules/live/live-deco.js';
import './modules/live/live-widgets.js';
import './modules/editor/folding.js';
import './modules/render-mermaid.js';
import './modules/app/app-state.js';
import './modules/editor/editor.js';
// 4T-0990 (Epic 3E-0196): panels.js ist in den Feature-Ordner modules/panels/
// geteilt. Die Nachfolger stehen an der Stelle des Vorgängers, damit die
// Seiteneffekt-Reihenfolge unverändert bleibt; die vier Panel-Registrierungen
// hängen jetzt in den vier panel-*-Modulen und werden hier in derselben
// Reihenfolge geladen wie zuvor am Ende von panels.js.
import './modules/panels/panels.js';
import './modules/panels/panel-outline.js';
import './modules/panels/panel-outgoing.js';
import './modules/panels/panel-subpages.js';
import './modules/panels/panel-backlinks.js';
// 4T-0991 (Epic 3E-0196): bookmarks.js ist in den Feature-Ordner
// modules/bookmarks/ geteilt. Der Kern steht an der Stelle des Vorgängers und
// zieht die übrigen Module des Ordners über seinen Import-Graphen nach; die
// Panel-Registrierung und der Fenster-Broadcast hängen unverändert an ihm.
import './modules/bookmarks/bookmarks.js';
import { startRenderer } from './modules/app-init.js';
import './modules/tabs/tabs.js';
// 4T-0989 (Epic 3E-0196): views.js ist in den Feature-Ordner modules/views/
// geteilt. Der Kern steht an der Stelle des Vorgängers; die übrigen Module des
// Ordners hängen an den Import-Graphen ihrer Verbraucher.
import './modules/views/views.js';
// 4T-0978 (Epic 3E-0196): modules/dialogs/dialogs.js ist in die Modale, die generischen
// Menü-Helfer und das Reiter-Kontextmenü geteilt. Die drei Nachfolger stehen an
// der Stelle des Vorgängers, damit die Seiteneffekt-Reihenfolge unverändert
// bleibt und der Schließ-Haken des Gruppen-Menüs sicher angemeldet wird.
import './modules/dialogs/context-menu-utils.js';
import './modules/dialogs/dialogs.js';
import './modules/tabs/tab-context-menu.js';
import './modules/tabs/tab-group-menu.js';
import './modules/properties/properties-tags.js';
import './modules/editor/autocomplete-help.js';
import './modules/search/search.js';

// Start erst nach Abschluss aller Modul-Bodies (deterministisch, zyklusfest).
startRenderer();
