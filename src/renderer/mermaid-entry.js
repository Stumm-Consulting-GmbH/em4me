// 4T-0021: Entry-Point fuer den separaten Mermaid-Bundle. Wird von
// scripts/build-mermaid.js zu src/renderer/mermaid.bundle.js gebaut und
// vom Renderer per dynamischem import() lazy geladen — der Bundle wird
// damit nur fuer Dokumente geladen, die tatsaechlich Mermaid-Bloecke
// enthalten.
import mermaid from 'mermaid';
export default mermaid;
