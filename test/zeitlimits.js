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
// Angehoben am 2026-08-31 von 30 s, aus demselben Grund wie das
// Bestands-Limit darunter: Im Linux-Container auf SC-026 zahlt auch ein
// git-Prozess über die Windows-Brücke ein Vielfaches, und der worktree-Fall
// von `pm-dokumente` riss die 30 s dreimal in Folge. Obergrenze, kein Ziel.
export const PROZESS_ZEITLIMIT = 90000;

// Lesen des vollen Repositoriums-Bestands (über 1300 Aufgaben-Dateien, rund
// 6 s allein für den Lauf über die Dateien). Belegt an `pm-dokumente` und
// `ueberblick-aggregate`, die das 5000-ms-Limit auch **isoliert** rissen.
// Angehoben am 2026-08-31 von 30 s: Im Linux-Container auf SC-026 zahlt jeder
// Datei-Zugriff über die Windows-Brücke rund das Siebenfache (test/README,
// gemessene Größenordnungen), und unter der dortigen Synchronisations-Last
// rissen zwei Voll-Läufe in Folge die 30 s. Obergrenze, kein Laufzeit-Ziel.
export const BESTAND_ZEITLIMIT = 90000;

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

// 4T-1283: Hier stand vom 2026-08-29 bis zum 2026-08-30 ein
// BESTAND_CONTAINER_ZEITLIMIT von 180 s. Es war die ausdrücklich benannte
// Sofort-Maßnahme zu einem Fall, der im Container die 60-s-Grenze riss, und ist
// mit der Behebung seiner Ursache **entfallen** statt ein drittes Mal angehoben
// zu werden.
//
// Die Ursache lag nicht am Prüfstand, sondern im Werkzeug: Der Regel-Leser der
// Ketten-Auflösung las bei jedem Aufruf das ganze Aufgaben-Verzeichnis neu.
// Gemessen über den Bestand waren das 6072 Verzeichnis-Lesungen mit zusammen
// 9,7 Millionen Einträgen; mit Verzeichnis-Karte und Inhalts-Zwischenspeicher
// ist es **eine** Lesung. Der Fall liegt seither im Container bei 3,5 s statt
// über 60 s und trägt wieder SCHWER_ZEITLIMIT wie die übrigen Fälle seiner
// Datei.
//
// Der Merkposten bleibt hier stehen, weil die Lehre allgemeiner ist als ihr
// Anlass: Eine Zeitgrenze, die zweimal an derselben Stelle steigt, misst nicht
// mehr den Prüfstand, sondern verdeckt einen Befund.
