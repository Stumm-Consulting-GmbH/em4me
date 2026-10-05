// 4T-002021 (Epic 3E-000192): Der Text, auf den sich ein Diagramm in einer
// Einbettung bezieht.
//
// Ein Diagramm nennt eine Tabelle «im selben Dokument». Steht es in einem
// eingebetteten Ausschnitt (`![[Datei#Abschnitt]]`, eine Verweis-Karte mit
// Anker), ist sein Dokument die eingebettete Datei im Ganzen: Der Name der
// Tabelle gilt dort überall, und die Tabelle kann außerhalb des Ausschnitts
// stehen. Beide Einbettungs-Wege (Wiki-Einbettung, Verweis-Karte der Canvas)
// lesen den ganzen Text über ihren eigenen Kanal ohne Anker nach.
//
// Bewusst ohne Import: Der Lese-Weg kommt als Funktion herein. So laden ihn die
// Einbettung in render-mermaid.js und die Verweis-Karte der Canvas, ohne dass
// die Canvas ihre Injektions-Bauweise aufgibt oder ein Import-Zyklus entsteht.
'use strict';

/**
 * @param {function(): Promise<{ok: boolean, content?: string}>} liesVoll Liest
 *   die eingebettete Datei ohne Anker über denselben Kanal wie die Einbettung
 *   (geschriebener Stand vor Platte).
 * @param {string} ausschnitt Gelesener Inhalt der Einbettung.
 * @param {string|null} anker Anker der Einbettung; ohne Anker ist der Inhalt
 *   bereits das ganze Dokument.
 * @returns {Promise<string>} Der Text, in dem die Diagramme ihre Tabelle
 *   suchen. Gelesen wird nur, wenn der Ausschnitt überhaupt ein Diagramm trägt.
 */
export async function dokumentTextEinerEinbettung(liesVoll, ausschnitt, anker) {
  const text = typeof ausschnitt === 'string' ? ausschnitt : '';
  if (!anker || !text.includes('perspective-chart')) return text;
  try {
    const voll = await liesVoll();
    return voll && voll.ok && typeof voll.content === 'string' ? voll.content : text;
  } catch (err) {
    console.warn('perspective-chart: Dokument der Einbettung nicht lesbar:', err);
    return text;
  }
}
