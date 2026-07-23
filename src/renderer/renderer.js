// Renderer-Entry: orchestriert die 4T-0179-Module in der Original-
// Reihenfolge des frueheren Monolithen (Seiteneffekt-Reihenfolge bleibt
// identisch; init() laeuft im app-init-Modul).
'use strict';

import './modules/live-deco.js';
import './modules/live-widgets.js';
import './modules/folding.js';
import './modules/render-mermaid.js';
import './modules/app-state.js';
import './modules/editor.js';
import './modules/panels.js';
import './modules/bookmarks.js';
import { startRenderer } from './modules/app-init.js';
import './modules/tabs.js';
import './modules/views.js';
import './modules/dialogs.js';
import './modules/properties-tags.js';
import './modules/autocomplete-help.js';
import './modules/search.js';

// Start erst nach Abschluss aller Modul-Bodies (deterministisch, zyklusfest).
startRenderer();
