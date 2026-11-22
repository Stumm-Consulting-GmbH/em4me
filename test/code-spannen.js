// 4T-002374 (Epic 3E-000156): Prüfungen über erzeugten Text außerhalb der
// Code-Spannen.
//
// **Wozu.** Zwei Wächter prüfen erzeugten Text auf Reste ihrer Schablone: die
// Release-Hinweise (test/unit/release-hinweise.test.js) auf Platzhalter und
// Anleitungs-Kommentare, die gebauten Seiten der Webseite
// (test/unit/web-inhalte.test.js) auf Platzhalter. Der Anwender-Text einer
// Version darf beides als Beispiel in einer Code-Spanne nennen, etwa die
// Platzhalter einer Masken-Datei wie `{{end}}` oder die Angaben je Folie einer
// Präsentation als HTML-Kommentar; ein Rest der Schablone stünde dagegen im
// Fließtext. Beide Wächter trugen dafür je eine eigene Zeile, die die
// Code-Spannen vor der Prüfung entfernte, und am 2026-10-24 fehlte sie zuerst
// im einen, dann im anderen (Fehlerklasse L10, Untertyp U2). Hier steht die
// Regel einmal.
//
// **Was eine Code-Spanne ist.** Ein Paar einfacher Backticks in derselben
// Zeile, wörtlich die Regel beider Wächter bis 4T-002374: `/`[^`\n]*`/g`. Eine
// Spanne aus doppelten Backticks oder ein Code-Zaun sind damit nicht eigens
// erkannt; ein Backtick ohne Gegenstück in derselben Zeile verdeckt nichts.
//
// **Zuschnitt für weitere Nutzer.** Die Funktionen nehmen beliebigen Text und
// ein beliebiges Muster und wissen nichts von Versionen, Dateien oder dem Bau.
// So kann ein Wächter, der den Anwender-Text auch unter dem Arbeitsnamen der
// Versions-Datei prüft (4T-002314), sie auf den daraus erzeugten Text anwenden,
// ohne sie zu ändern.

/** Platzhalter einer Schablone: ein Wort in doppelten geschweiften Klammern. */
export const PLATZHALTER_MUSTER = /\{\{\w+\}\}/g;

/**
 * Der Text ohne seine Code-Spannen.
 *
 * @param {string} text
 * @returns {string}
 */
export function ohneCodeSpannen(text) {
  return String(text).replace(/`[^`\n]*`/g, '');
}

/**
 * Alle Treffer eines Musters außerhalb der Code-Spannen, in der Reihenfolge
 * ihres Auftretens. Ein Muster ohne Flag `g` wird trotzdem vollständig
 * durchsucht; der Zustand eines übergebenen Musters bleibt unberührt.
 *
 * @param {string} text
 * @param {RegExp} muster
 * @returns {string[]}
 */
export function fundeAusserhalbCodeSpannen(text, muster) {
  const flags = muster.flags.includes('g') ? muster.flags : `${muster.flags}g`;
  return [...ohneCodeSpannen(text).matchAll(new RegExp(muster.source, flags))].map(
    (treffer) => treffer[0],
  );
}

/**
 * Stehen gebliebene Platzhalter außerhalb der Code-Spannen.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function platzhalterAusserhalbCodeSpannen(text) {
  return fundeAusserhalbCodeSpannen(text, PLATZHALTER_MUSTER);
}
