// 4T-001632 (Epic 3E-000156): Konfiguration ausschliesslich fuer die
// Eingaben-Messung von scripts/zuordnung-pruefen.js.
//
// **Warum eine zweite Konfiguration und keine Zeile in der ersten.** Die
// Messung braucht eine Setup-Datei (test/phase-marke.js), die die Phasen-Marke
// setzt; die Haupt-Konfiguration braucht sie nicht. Vitest kennt kein
// CLI-Flag `--setupFiles`, wohl aber `--config`. Diese Datei erbt deshalb alles
// aus der Haupt-Konfiguration und legt genau eine Eigenschaft darauf. Damit
// bleibt der Normal-Lauf unberuehrt: Er laedt die Setup-Datei nicht und zahlt
// auch keinen Import.
//
// **Die Wurzel wird ausdruecklich gesetzt.** Vitest leitet `root` sonst aus dem
// Ort der Konfigurationsdatei ab, und der ist hier `test/`; alle relativen
// Pfade der geerbten Konfiguration — Projekt-Muster, globalSetup, Berichts-Ziel
// — zeigten dann ins Leere. Ein Messwerkzeug, das am falschen Ort misst, ist
// schlimmer als keines.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import basis from '../vitest.config.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default {
  ...basis,
  test: {
    ...basis.test,
    root: WURZEL,
    setupFiles: ['./test/phase-marke.js'],
  },
};
