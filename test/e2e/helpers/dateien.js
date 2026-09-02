// 4T-000757 (Epic 3E-000156): Warte-Helfer fuer Dateien, die die Anwendung
// gerade schreibt.
//
// Eine Datei entsteht vor ihrem Inhalt. Wer allein auf ihre Existenz
// wartet, endet das Warten im Moment der Anlage und liest unter Last einen
// leeren oder halben Stand: bei Text ergibt das einen Vergleichs-Fehler,
// bei JSON einen Parse-Abbruch. Beides ist lastabhaengig und damit flaky
// (Befund JR-07 im Release-Lauf 0.94.0). Deshalb wartet jede Pruefung, die
// den Inhalt braucht, auch auf den Inhalt.
//
// Die Lese-Funktionen liefern null statt zu werfen, damit sie sich direkt
// als Poll-Bedingung eignen.
'use strict';

const fs = require('node:fs');
const { expect } = require('@playwright/test');

function leseTextOderNull(pfad) {
  if (!fs.existsSync(pfad)) return null;
  try {
    return fs.readFileSync(pfad, 'utf8');
  } catch {
    return null;
  }
}

function leseJsonOderNull(pfad) {
  const text = leseTextOderNull(pfad);
  if (text === null || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Wartet, bis die Datei den erwarteten Teil-Text traegt, und liefert den
// vollstaendigen Inhalt fuer weitere Pruefungen.
async function warteAufText(pfad, teil, opts) {
  await expect.poll(() => leseTextOderNull(pfad), opts).toContain(teil);
  return fs.readFileSync(pfad, 'utf8');
}

// Wartet, bis die Datei vollstaendig geschrieben und parsebar ist, und
// liefert den geparsten Stand.
async function warteAufJson(pfad, opts) {
  await expect.poll(() => leseJsonOderNull(pfad), opts).not.toBeNull();
  return leseJsonOderNull(pfad);
}

module.exports = { leseTextOderNull, leseJsonOderNull, warteAufText, warteAufJson };
