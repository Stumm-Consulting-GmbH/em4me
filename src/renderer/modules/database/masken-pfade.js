// 4T-002252 (Epic 3E-000262, F6 A, S1, S8, Festlegung 4): Die Auswertung der
// Pfad-Stellen einer Einzel-Maske über den Kanal `database:ausdruecke`.
//
// **Ein Aufruf für alle Pfad-Stellen zusammen, gebündelt.** Der Körper meldet
// bei jeder Neu-Rechnung alle Stellen, deren Ausdruck einen Pfad über ein
// Verweis-Feld nennt; hier wird nach einer kurzen Verzögerung einmal gefragt,
// sodass eine Folge von Eingaben einen Aufruf ergibt und nicht einen je
// Tastendruck. Bis zur Antwort bleibt der vorige Wert stehen.
//
// **Nur die jüngste Anforderung zählt.** Ein Lauf-Zähler verwirft jede Antwort,
// nach der schon eine neue Anforderung gestellt wurde; eine langsame Antwort zu
// einem älteren Stand überschreibt damit nie einen neueren.
//
// Eigenes Modul, damit Körper (`masken-koerper.js`) und Seite
// (`masken-seite.js`) unter ihrem Größen-Budget bleiben. Ohne DOM und ohne
// Fenster-Zustand; der Kanal kommt herein.
'use strict';

/**
 * Erzeugt die gebündelte Auswertung der Pfad-Stellen.
 *
 * @param {{kanal: Function, verzoegerungMs?: number}} optionen `kanal` nimmt
 *   `{ tabelle, kennung, entwurf, ausdruecke }` und liefert die Antwort des
 *   Kanals `database:ausdruecke`.
 * @returns {{anfordern: Function}}
 */
export function erzeugePfadAuswertung({ kanal, verzoegerungMs = 150 }) {
  let lauf = 0;
  let zeitgeber = null;
  return {
    /**
     * Fordert die Werte aller Pfad-Stellen an; `uebernehmen` bekommt die Liste
     * `[{ id, wert, erfuellt, unbekannt }]` mit `id` als Index in `stellen`.
     *
     * @param {{tabellenPfad: string, kennung: string|null,
     *   entwurf: Object<string, string>, stellen: Array<{quelle: string}>,
     *   uebernehmen: Function}} anforderung
     */
    anfordern({ tabellenPfad, kennung, entwurf, stellen, uebernehmen }) {
      lauf += 1;
      const meiner = lauf;
      if (zeitgeber !== null) clearTimeout(zeitgeber);
      zeitgeber = setTimeout(async () => {
        zeitgeber = null;
        let antwort;
        try {
          antwort = await kanal({
            tabelle: tabellenPfad,
            kennung,
            entwurf,
            ausdruecke: stellen.map((stelle, i) => ({ id: String(i), quelle: stelle.quelle })),
          });
        } catch {
          antwort = null;
        }
        if (meiner !== lauf) return;
        if (!antwort || antwort.status !== 'ready' || !Array.isArray(antwort.werte)) return;
        uebernehmen(antwort.werte);
      }, verzoegerungMs);
    },
  };
}
