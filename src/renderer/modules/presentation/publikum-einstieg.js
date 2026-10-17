// 4T-002278 (Epic 3E-000348): Bau-Einstieg der Seite des Publikums-Fensters
// (scripts/build-renderer.js bündelt ihn zu src/renderer/publikum.bundle.js).
// Die Brücke `window.publikum` stellt preload-publikum.js.
'use strict';

import { starte } from './publikum-seite.js';

starte(window, window.publikum);
