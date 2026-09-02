// Renderer-Entry: orchestriert die 4T-000179-Module in der Original-
// Reihenfolge des frueheren Monolithen (Seiteneffekt-Reihenfolge bleibt
// identisch; init() laeuft im app-init-Modul).
'use strict';

// 4T-000971 (Epic 3E-000207): Die letzte Auffang-Ebene steht bewusst als ERSTER
// Import. Sie registriert ihre Zuhoerer als Modul-Seiteneffekt, und damit ist
// sie scharf, bevor die uebrigen Modul-Bodies laufen; ein Fehler waehrend der
// Modul-Kette ist genau der Fall, der sonst keine Spur hinterliesse.
import { setzeEntwurfsSicherung } from './modules/app/auffang-ebene.js';
// 4T-000982 (Epic 3E-000196): die beiden Live-Modus-Module sind in den Feature-
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
// 4T-000990 (Epic 3E-000196): panels.js ist in den Feature-Ordner modules/panels/
// geteilt. Die Nachfolger stehen an der Stelle des Vorgängers, damit die
// Seiteneffekt-Reihenfolge unverändert bleibt; die vier Panel-Registrierungen
// hängen jetzt in den vier panel-*-Modulen und werden hier in derselben
// Reihenfolge geladen wie zuvor am Ende von panels.js.
import './modules/panels/panels.js';
import './modules/panels/panel-outline.js';
import './modules/panels/panel-outgoing.js';
import './modules/panels/panel-subpages.js';
import './modules/panels/panel-backlinks.js';
// 4T-000991 (Epic 3E-000196): bookmarks.js ist in den Feature-Ordner
// modules/bookmarks/ geteilt. Der Kern steht an der Stelle des Vorgängers und
// zieht die übrigen Module des Ordners über seinen Import-Graphen nach; die
// Panel-Registrierung und der Fenster-Broadcast hängen unverändert an ihm.
import './modules/bookmarks/bookmarks.js';
import { startRenderer } from './modules/app-init.js';
import './modules/tabs/tabs.js';
// 4T-000989 (Epic 3E-000196): views.js ist in den Feature-Ordner modules/views/
// geteilt. Der Kern steht an der Stelle des Vorgängers; die übrigen Module des
// Ordners hängen an den Import-Graphen ihrer Verbraucher.
import './modules/views/views.js';
// 4T-000978 (Epic 3E-000196): modules/dialogs/dialogs.js ist in die Modale, die generischen
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
// 4T-000971: Der Sicherungs-Weg der Auffang-Ebene. Der Import steht am Ende der
// Kette, weil er nur eine Funktion holt und die Seiteneffekt-Reihenfolge nicht
// verschieben darf; das Modul ist zu diesem Zeitpunkt ohnehin ueber den
// Import-Graphen der Ansichten geladen.
import { collectUnsavedDrafts } from './modules/views/untitled-tabs.js';

// 4T-000971 (Weg R2): Was die Auffang-Ebene im Fehlerfall sichert, ist derselbe
// Entwurfs-Weg, den auch das Schliessen eines Fensters nimmt. Bewusst ohne die
// Einstellung `keepUnsavedDrafts`: Sie regelt den Normalfall, in dem der Nutzer
// die Wahl hat; nach einem unbehandelten Fehler gibt es diese Wahl nicht mehr,
// und die Zusage «kein Fehlweg verwirft Nutzer-Inhalte» wiegt schwerer.
setzeEntwurfsSicherung(async () => {
  const entwuerfe = collectUnsavedDrafts();
  if (!entwuerfe.length) return 0;
  await window.api.saveDrafts(entwuerfe);
  return entwuerfe.length;
});

// Start erst nach Abschluss aller Modul-Bodies (deterministisch, zyklusfest).
startRenderer();
