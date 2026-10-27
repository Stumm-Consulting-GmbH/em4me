// 4T-002351 (Epic 3E-000184): Kennungen, die Darstellung, Editor und
// Erweiterung der Workflows gemeinsam brauchen.
//
// **Warum ein eigenes Modul:** Die Fence-Weiche der Pipeline
// (`src/shared/markdown/workflow-block.js`), die Hervorhebung im Editor und die
// Kopfzeile der Live-Ansicht schalten an derselben Erweiterung und erkennen
// denselben Block; die Kennungen stehen deshalb an einer Stelle (Muster
// `CANVAS_EXTENSION_ID` in `src/shared/canvas/canvas-core.js`). Registriert
// ist die Erweiterung seit 4T-002352 in `src/shared/extensions/extensions.js`;
// dort steht die Kennung als Literal, weil die Registry nichts aus App-Modulen
// importiert, und `test/unit/render/extensions-aus-workflows.test.js` hält
// beide Stellen gleich.
//
// Die Sprache des Blocks ist dieselbe, die die Erkennung in
// `workflow-document.js` liest (G1).
//
// Prozess-neutral: kein Electron, kein DOM, kein Datei-Zugriff.
'use strict';

const WORKFLOWS_EXTENSION_ID = 'workflows';
const WORKFLOW_FENCE_LANG = 'workflow';

module.exports = { WORKFLOWS_EXTENSION_ID, WORKFLOW_FENCE_LANG };
