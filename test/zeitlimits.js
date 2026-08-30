// 4T-0944 (Epic 3E-0156): Zeitlimits teurer Prüf-Fälle, benannt nach ihrem
// Auslöser.
//
// Das voreingestellte Limit von Vitest (5000 ms, `vitest.config.mjs`) bleibt
// bewusst eng, damit ein echter Hänger nicht in einem pauschal hohen Wert
// untergeht. Es reicht aber für Fälle nicht, die einen realen Prozess starten,
// den vollen Repositoriums-Bestand lesen oder ein Erzeugnis bauen: Ihre
// isolierte Laufzeit liegt zwar deutlich darunter, unter Fremdlast auf dem
// Rechner reißen sie die Grenze trotzdem. Genau dieses Fehlerbild ist zwischen
// dem 2026-08-06 und dem 2026-08-18 sechsmal aufgetreten, in vier Dateien, und
// wurde jedes Mal punktuell mit einer nackten Zahl an der betroffenen Stelle
// behandelt.
//
// Die Zahlen stehen deshalb hier, unter einem Namen, der ihren **Auslöser**
// nennt. Das hat drei Wirkungen: Wer einen neuen teuren Fall schreibt, findet
// den passenden Wert, statt ihn zu schätzen; wer einen Wert ändern will, ändert
// ihn an einer Stelle; und der Wächter `scripts/lint-test-zeitlimits.js` kann
// prüfen, dass kein Limit als nackte Zahl in einer Prüfdatei landet.
//
// Ein Limit ist eine **Obergrenze, kein Laufzeit-Ziel**: Ein billiger Fall in
// einer teuren Datei läuft weiterhin in Millisekunden. Wer ein Limit anhebt,
// hebt es hier an und begründet es im Kommentar.
//
// ES-Modul, weil ausschließlich die Prüfdateien es importieren; der Wächter
// unter scripts/ liest die Namen deshalb aus dem Quelltext statt per require.

// Realer Prozess-Start (git, node, npm) im Aufbau oder im Prüf-Schritt.
// Belegt: `verlauf-erzeugen` legt je Fall ein Wegwerf-Repositorium an und
// fährt reale git-Läufe; isoliert rund 2 s, unter Last über 5 s.
export const PROZESS_ZEITLIMIT = 30000;

// Lesen des vollen Repositoriums-Bestands (über 1300 Aufgaben-Dateien, rund
// 6 s allein für den Lauf über die Dateien). Belegt an `pm-dokumente` und
// `ueberblick-aggregate`, die das 5000-ms-Limit auch **isoliert** rissen.
export const BESTAND_ZEITLIMIT = 30000;

// Vollständiger Bau eines Erzeugnisses (Webseite, Handbuch) innerhalb eines
// Falls. Belegt am 2026-07-25, als ein Bau-Test unter Last das
// Testsuite-Gate der Merge-Queue blockierte.
export const BAU_ZEITLIMIT = 30000;

// Mehrere Auslöser zugleich: Prozess-Start **und** vollständiges Lesen eines
// großen Bestands. Belegt an `quellcode-export`, das reale git- und
// npm-Läufe fährt und danach über 500 Dateien einliest.
export const SCHWER_ZEITLIMIT = 60000;

// Bau der gesamten Webseite einmal je Prüfdatei (Roadmap-Sichten mit allen
// Sprachfassungen). Der Bau selbst ist der Prüf-Gegenstand, nicht sein Umfeld.
export const VOLLBAU_ZEITLIMIT = 120000;

// Aufräum-Hooks, die Wegwerf-Bäume löschen. Sie brauchen mehr Luft als die
// Fälle selbst, weil Windows-Dateisperren das Löschen verzögern und weil ein
// Hook, der ins Limit läuft, einen roten Lauf mit **null** fehlgeschlagenen
// Tests erzeugt, also das am schwersten zu deutende Fehlerbild.
export const AUFRAEUM_ZEITLIMIT = 60000;

// Voller Repositoriums-Bestand unter CONTAINER-I/O. Derselbe Auslöser wie
// BESTAND_ZEITLIMIT, aber über ein gemountetes Volume: Der Linux-Gate-Lauf
// (scripts/test-linux-docker.js) reicht das Repositorium in den Container, und
// jeder einzelne Datei-Zugriff kostet dort ein Vielfaches. Der Wert ist damit
// keine Aussage über die Fach-Logik, sondern über den Prüfstand.
//
// Belegt am 2026-08-29 an der Widmungs-Ketten-Auflösung über rund 1500
// Aufgaben-Dateien: auf Windows 4356 ms für diesen EINEN Fall (er trägt damit
// fast die gesamte Laufzeit seiner Prüfdatei), im Container zweimal in Folge
// über der 60-s-Grenze von SCHWER_ZEITLIMIT — auf nachweislich lastfreiem
// Rechner, also kein Flake. Der Container-Faktor liegt damit über 13.
//
// SOFORT-MASSNAHME, kein Zielzustand: Die eigentliche Ursache ist die Laufzeit
// der Ketten-Auflösung selbst, und sie ist als eigener Vorgang verortet
// (4T-1283, Epic 3E-0032). Fällt sie, gehört dieser Wert zurück auf
// SCHWER_ZEITLIMIT. Er ist bewusst großzügig gewählt, weil ein zweiter roter
// Lauf an derselben Stelle teurer wäre als eine späte Hänger-Erkennung in
// genau diesem einen Fall; die Warnung im Kopf dieser Datei gilt unverändert
// für jeden weiteren Nutzer dieses Werts.
export const BESTAND_CONTAINER_ZEITLIMIT = 180000;
