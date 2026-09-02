// @vitest-environment jsdom
// 4T-000644 (Epic 3E-000127): Erststart-Logik der geführten Produkt-Tour
// (src/renderer/modules/tour/tour.js). Prüfgegenstand ist ausschließlich die
// Merker-Mechanik, also die Stelle, an der ein Irrtum dauerhaft wirkt: Wann
// läuft die Tour von selbst an, und wann wird `tourSeen` geschrieben?
//
// jsdom-Umgebung, weil das Modul beim Start ein Overlay an document.body hängt.
// Der api-Stub steht VOR dem dynamischen Modul-Import, weil api.js `window.api`
// beim Laden festhält (Muster date-picker.test.js).
//
// Unter jsdom hat kein Element eine Bildschirm-Fläche (getBoundingClientRect
// liefert Nullen), weshalb der Sichtbarkeits-Filter des Moduls jede Station auf
// die ankerlose Karte zurückfallen lässt. Für diese Prüfung ist das
// unerheblich: Geprüft werden Anlauf und Merker, nicht die Hervorhebung. Die
// verankerte Darstellung deckt die E2E-Spec produkt-tour.spec.js ab, die
// Kopplung der Anker an das Markup der Wächter tour-stationen.test.js.
//
// **Die Abbruch-Fälle beenden die Tour bewusst sofort**, also mitten im
// Stations-Übergang von driver.js. Bis zum 2026-08-19 schrieb tour.js den
// Merker allein über `onDestroyed`, und driver.js ruft diesen Haken erst,
// nachdem der Übergang durch ist und `__activeElement`/`__activeStep` stehen
// (Vorgabe-Dauer 400 ms); ein sofortiger Abbruch blieb damit unverbucht. Seit
// der Umstellung auf `onDestroyStarted` hängt die Schreibung nicht mehr am
// Übergang. Die Fälle unten sind der Regressionsschutz dafür.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './api-stub.js';

const { startTour, maybeStartTourOnFirstRun } =
  await import('../../../src/renderer/modules/tour/tour.js');

const POPOVER = '.driver-popover.em4me-tour';

// Vorspul-Weite für den Stations-Übergang von driver.js.
//
// Gebraucht wird sie nur noch an einer Stelle: für den Fall, der den
// abgeschlossenen Übergang zeigt. Dann feuern beide Haken nacheinander
// (`onDestroyStarted` und, aus dem darin ausgelösten destroy(), `onDestroyed`),
// und die Flag-Sicherung im Modul muss die zweite Schreibung schlucken. Ohne
// diesen Fall bliebe genau der Pfad ungeprüft, auf dem der Merker doppelt
// geschrieben werden könnte.
//
// Der Wert liegt über der Vorgabe-Dauer von driver.js (400 ms; das Tour-Modul
// setzt sie nicht um). Ein Versionssprung, der die Vorgabe anhebt, lässt den
// Fall rot laufen statt still falsch — das ist die gewollte Richtung.
//
// Vorgespult statt gewartet, weil eine echte Wartezeit unter Fremdlast auf dem
// Prüf-Rechner reißt; genau dieses Fehlerbild ist der Anlass von
// test/zeitlimits.js. Mit falscher Uhr läuft der Fall unabhängig von der
// Rechnerlast in Millisekunden.
const UEBERGANG_MS = 600;

function popover() {
  return document.querySelector(POPOVER);
}

// Den Stations-Übergang zu Ende bringen (Begründung an UEBERGANG_MS).
async function beendeUebergang() {
  await vi.advanceTimersByTimeAsync(UEBERGANG_MS);
}

// Die Tour über ihren Schließen-Knopf beenden — der Weg, den auch ein Anwender
// nimmt. Bewusst nicht über instanz.destroy(): Der öffentliche destroy() umgeht
// laut Paket-Vertrag den Haken `onDestroyStarted`, und genau dieser Haken ist
// der Weg, über den der Abbruch eines Anwenders den Merker schreibt.
function schliesseUeberKnopf() {
  const knopf = document.querySelector('.driver-popover-close-btn');
  if (knopf) knopf.click();
}

// Gelesener Merker-Wert des jeweiligen Falls; die Stub-Funktion liest ihn zur
// Aufrufzeit, damit ein Fall ihn setzen kann, ohne den Stub neu zu bauen.
let merkerWert;
let setzAufrufe;

beforeEach(() => {
  vi.useFakeTimers();
  merkerWert = undefined;
  setzAufrufe = [];
  window.api.getSetting = vi.fn(async () => merkerWert);
  window.api.setSetting = vi.fn(async (key, wert) => {
    setzAufrufe.push([key, wert]);
  });
});

afterEach(() => {
  // Modul-Zustand aufräumen: `laufendeTour` lebt im Modul und überdauerte den
  // Fall sonst bis in den nächsten. Erst danach die echte Uhr zurückgeben.
  schliesseUeberKnopf();
  vi.useRealTimers();
});

describe('maybeStartTourOnFirstRun: Anlauf-Entscheidung (4T-000644)', () => {
  it('startet bei nie gesetztem Merker (undefined)', async () => {
    merkerWert = undefined;
    await maybeStartTourOnFirstRun();
    expect(window.api.getSetting).toHaveBeenCalledWith('tourSeen');
    expect(popover(), 'Erststart ohne Tour-Popover').toBeTruthy();
  });

  it('startet auch, wenn der Speicher null liefert', async () => {
    // Der Merker hat bewusst keinen Vorgabewert; ein Speicher, der einen
    // unbekannten Schlüssel als null statt undefined beantwortet, darf den
    // Erststart nicht anders behandeln.
    merkerWert = null;
    await maybeStartTourOnFirstRun();
    expect(popover()).toBeTruthy();
  });

  it('startet nicht bei gesetztem Merker true', async () => {
    merkerWert = true;
    await maybeStartTourOnFirstRun();
    expect(popover(), 'Tour lief trotz gesetztem Merker an').toBeNull();
  });

  it('startet nicht bei gesetztem Merker false', async () => {
    // Jeder gesetzte Wert unterdrückt den Anlauf, nicht nur true: Gesetzt heißt
    // «schon einmal dagewesen». Ein Vergleich auf === true statt auf != null
    // zeigte die Tour bei jedem Start erneut.
    merkerWert = false;
    await maybeStartTourOnFirstRun();
    expect(popover(), 'Tour lief trotz gesetztem Merker an').toBeNull();
  });

  it('schreibt beim bloßen Nicht-Anlauf nichts in den Speicher', async () => {
    merkerWert = true;
    await maybeStartTourOnFirstRun();
    expect(setzAufrufe).toEqual([]);
  });
});

describe('Merker-Schreiben am Ende der Tour (4T-000644)', () => {
  it('Sofort-Abbruch einer automatisch gestarteten Tour setzt tourSeen', async () => {
    // Regressionsfall zum Befund vom 2026-08-19: Der Abbruch fällt mitten in
    // den Stations-Übergang, es wird NICHT vorgespult (Begründung im Kopf).
    merkerWert = undefined;
    await maybeStartTourOnFirstRun();
    expect(popover()).toBeTruthy();
    schliesseUeberKnopf();
    expect(popover(), 'Overlay nach Abbruch noch da').toBeNull();
    expect(setzAufrufe).toEqual([['tourSeen', true]]);
  });

  it('Abbruch nach abgeschlossenem Übergang schreibt den Merker genau einmal', async () => {
    // Hier feuern beide Haken nacheinander; die Flag-Sicherung im Modul muss
    // die zweite Schreibung schlucken (Begründung an UEBERGANG_MS).
    merkerWert = undefined;
    await maybeStartTourOnFirstRun();
    await beendeUebergang();
    schliesseUeberKnopf();
    expect(popover(), 'Overlay nach Abbruch noch da').toBeNull();
    expect(setzAufrufe).toEqual([['tourSeen', true]]);
  });

  it('ein zweiter Schließ-Versuch legt nichts nach', async () => {
    merkerWert = undefined;
    await maybeStartTourOnFirstRun();
    schliesseUeberKnopf();
    // Auf der bereits zerstörten Instanz darf nichts mehr passieren.
    schliesseUeberKnopf();
    await beendeUebergang();
    expect(setzAufrufe).toEqual([['tourSeen', true]]);
  });

  it('der Start von Hand fasst den Merker weder lesend noch schreibend an', async () => {
    startTour();
    expect(popover()).toBeTruthy();
    expect(window.api.getSetting).not.toHaveBeenCalled();
    schliesseUeberKnopf();
    expect(popover()).toBeNull();
    await beendeUebergang();
    expect(setzAufrufe).toEqual([]);
  });

  it('ein Start von Hand über der laufenden automatischen Tour verbucht sie als Abbruch', async () => {
    // Neustart-Pfad: startTour zerstört die laufende Instanz direkt, und der
    // öffentliche destroy() umgeht den Haken onDestroyStarted. Das Modul
    // verbucht das Ende deshalb selbst, bevor es abräumt — ohne diese Buchung
    // ginge der Merker beim Wechsel von der automatischen auf die manuelle
    // Tour verloren.
    merkerWert = undefined;
    await maybeStartTourOnFirstRun();
    startTour();
    // Zwei übereinander liegende Overlays wären nicht bedienbar.
    expect(document.querySelectorAll(POPOVER).length).toBe(1);
    expect(setzAufrufe).toEqual([['tourSeen', true]]);
    // Die neue, von Hand gestartete Tour legt beim eigenen Ende nichts nach.
    schliesseUeberKnopf();
    await beendeUebergang();
    expect(setzAufrufe).toEqual([['tourSeen', true]]);
  });
});
