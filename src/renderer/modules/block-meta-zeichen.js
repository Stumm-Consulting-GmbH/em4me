// 4T-002048 (Epic 3E-000192): Das Zeichen der Block-Eigenschaften (◆) hängt als
// Kind im Block mit der Anker-`id` (block-meta-indicator.js setzt es). Blöcke,
// die ihren Inhalt nachträglich setzen — ein Diagramm beim Neu-Zeichnen, ein
// Mermaid-Diagramm beim Nachrendern —, behalten es über diese beiden Helfer.
//
// **Warum ein eigenes Blatt:** block-meta-indicator.js lädt Editor, Live-Modus
// und Panel; das Diagramm lädt es deshalb nicht, sonst entstünde ein
// Import-Zyklus über Ordner-Grenzen (gemessen mit lint-ordner-importe.js). Die
// Heimat reicht beide Helfer weiter; dieses Modul lädt nichts.
'use strict';

const zeichenIn = (block) => block.querySelector(':scope > .block-meta-indicator');

// Ersetzt den Inhalt eines Blocks und hängt sein Zeichen wieder an.
export function setzeInhalt(block, html) {
  const zeichen = zeichenIn(block);
  block.innerHTML = html;
  if (zeichen) block.appendChild(zeichen);
}

// Gibt Kennung und Zeichen an ein Element, das den Block ersetzt.
export function uebernimmAnker(von, nach) {
  if (!von.id) return;
  nach.id = von.id;
  const zeichen = zeichenIn(von);
  if (zeichen) nach.appendChild(zeichen);
}
