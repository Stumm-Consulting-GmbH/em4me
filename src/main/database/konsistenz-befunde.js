// 4T-002386 (Epic 3E-000265, S5): Katalog und Gestalt der Befunde der
// Konsistenz-Prüfung, aus `konsistenz-pruefung.js` herausgelöst.
//
// **Warum ein eigenes Modul.** Die Prüfung der Tabellen (`konsistenz-pruefung.js`)
// und die Prüfung der Masken-, Listen- und Abfrage-Dateien
// (`konsistenz-pruefung-dateien.js`) bauen ihre Befunde aus demselben Katalog
// mit derselben Funktion. Läge beides in einem der beiden Prüf-Module, müsste
// das andere es von dort holen, während jenes das andere ruft: ein Import-Zyklus.
// Hier liegt es ohne Abhängigkeit, und beide Prüf-Module importieren es.
// `konsistenz-pruefung.js` gibt den Katalog unverändert weiter, damit kein
// Aufrufer den Ort kennen muss.
//
// Electron-frei und ohne Zustand.
'use strict';

// Der geschlossene Katalog der Befunde, wie der Lage-Katalog des Regel-Werks.
// Jeder Code hat einen Anwender-Text unter `database.konsistenz.<code>`.
const KONSISTENZ_BEFUNDE = Object.freeze({
  schluesselDoppelt: 'konsistenzSchluesselDoppelt',
  kennungDoppelt: 'konsistenzKennungDoppelt',
  // 4T-002288: Datensätze mit einer Kennung über dem Hochwasserstand der
  // Definition, oder ohne ihn; `kennungen` nennt die höchste vorhandene.
  hochwasserstandZuNiedrig: 'konsistenzHochwasserstandZuNiedrig',
  verweisTabelleUnbekannt: 'konsistenzVerweisTabelleUnbekannt',
  verweisZielFehlt: 'konsistenzVerweisZielFehlt',
  verweisMehrdeutig: 'konsistenzVerweisMehrdeutig',
  verweisSchluesselMehrteilig: 'konsistenzVerweisSchluesselMehrteilig',
  datensatzregelVerletzt: 'konsistenzDatensatzregelVerletzt',
  pruefregelVerletzt: 'konsistenzPruefregelVerletzt',
  pflichtFehlt: 'konsistenzPflichtFehlt',
  typVerletzt: 'konsistenzTypVerletzt',
  zellenZahl: 'konsistenzZellenZahl',
  maskeFeldUnbekannt: 'konsistenzMaskeFeldUnbekannt',
  maskePlatzhalterUnbekannt: 'konsistenzMaskePlatzhalterUnbekannt',
  // 4T-002183: ein Wert-Platzhalter, dessen Ausdruck sich nicht lesen lässt.
  maskeAusdruckUngueltig: 'konsistenzMaskeAusdruckUngueltig',
  // 4T-002186: die drei Fehlerbilder der bedingten Bereiche einer Masken-Datei.
  maskeEndOhneWhen: 'konsistenzMaskeEndOhneWhen',
  maskeWhenOhneEnd: 'konsistenzMaskeWhenOhneEnd',
  maskeBedingungUngueltig: 'konsistenzMaskeBedingungUngueltig',
  // 4T-002252: ein Punkt-Name in Wert oder Bedingung mit unbekanntem Kopf.
  maskePfadUnbekannt: 'konsistenzMaskePfadUnbekannt',
  maskeTabelleUnbekannt: 'konsistenzMaskeTabelleUnbekannt',
  // 4T-002184: die Angabe `form` der Definition trifft keine Masken-Datei der
  // Tabelle, oder sie nennt die einer anderen Tabelle.
  maskeAngabeUnbekannt: 'konsistenzMaskeAngabeUnbekannt',
  maskeAngabeFremd: 'konsistenzMaskeAngabeFremd',
  definitionUnlesbar: 'konsistenzDefinitionUnlesbar',
  // 4T-002248 (Epic 3E-000262, F1 A): Befunde an einer Abfrage-Datei mit den
  // Angaben der Listen-Maske. `wert` ist der Schlüssel der unbrauchbaren
  // Angabe, das unbekannte Wort in `allow` oder die Angabe `form`.
  listeAngabeUnbrauchbar: 'konsistenzListeAngabeUnbrauchbar',
  listeHandgriffUnbekannt: 'konsistenzListeHandgriffUnbekannt',
  listeMaskeUnbekannt: 'konsistenzListeMaskeUnbekannt',
  // 4T-002253 (Epic 3E-000262, S6): Befunde am Positions-Bereich `{{list:…}}`
  // einer Masken-Datei; `wert` ist die Angabe des Platzhalters.
  maskeListeDateiUnbekannt: 'konsistenzMaskeListeDateiUnbekannt',
  maskeListeNichtBearbeitbar: 'konsistenzMaskeListeNichtBearbeitbar',
  maskeListeBeziehungFehlt: 'konsistenzMaskeListeBeziehungFehlt',
  maskeListeBeziehungMehrdeutig: 'konsistenzMaskeListeBeziehungMehrdeutig',
  maskeListeAbfrageUngueltig: 'konsistenzMaskeListeAbfrageUngueltig',
  // 4T-002307 (Epic 3E-000263, S3): eine unbrauchbare Rolle im Steckbrief;
  // `wert` ist die Rolle, `zieltabelle` die Tabelle, an der sie scheitert.
  steckbriefRollen: 'konsistenzSteckbriefRollen',
  // 4T-002386 (Epic 3E-000265, Schritt 4): Eine Tabelle in Kartei-Form trägt in
  // `datei` ab `zeile` einen Datensatz-Block; seine Zeilen sind keine
  // Datensätze. Der Code nennt den Block nicht beim Wort, weil das Wort die
  // Zeichenfolge «lock» trägt und der Wächter der Sperr-Texte
  // (`db-sperr-ordnername.test.js`) jeden Sprach-Schlüssel mit ihr als Text zur
  // Sperre läse (dieselbe Regel wie bei den Abfrage-Codes im Hinweis-Katalog).
  karteiMitDatensaetzen: 'konsistenzKarteiMitDatensaetzen',
  // 4T-002387 (Epic 3E-000265, F3 A): Ein Dokument im Ordner einer
  // Kartei-Tabelle ohne Kennung (`datei`, `wert` der Datei-Name), oder mit der
  // Angabe `db-record`, die keine brauchbare Kennung trägt (Hinweis `cardId`;
  // eigener Code, weil die Abhilfe eine andere ist). Und zwei Kartei-Tabellen in
  // einem Ordner, gemeldet an jeder der beiden mit der anderen in
  // `zieltabelle`. Eine doppelte Kennung zweier Karteikarten ist
  // `kennungDoppelt` wie in der Tabellen-Form, je Karteikarte ein Befund.
  karteiOhneKennung: 'konsistenzKarteiOhneKennung',
  karteiKennungUnbrauchbar: 'konsistenzKarteiKennungUnbrauchbar',
  karteiOrdnerMehrdeutig: 'konsistenzKarteiOrdnerMehrdeutig',
  // 4T-002387 (Schnitt C, F5 A): An einer Karteikarte (`datei`, `wert` der
  // Datei-Name) führt ein Eigenschafts-Profil (`profil`) das Feld `feld` mit
  // dem Typ `typProfil`, die Tabelle mit `typTabelle`. Die Datenbank liest
  // nach der Tabelle; der Befund ist ein Hinweis, kein Schaden.
  karteiProfilTypAbweichend: 'konsistenzKarteiProfilTypAbweichend',
});

// Die Gestalt eines Befunds: jede Angabe da, nicht zutreffende als `null`.
// `regel`, `meldung` und `anzahl` tragen die Angaben, die die Sätze der
// Prüfregeln und der Zellen-Zahl brauchen (wie die Lagen des Regel-Werks).
function befund(code, angaben) {
  return {
    code,
    tabelle: null,
    pfad: null,
    datei: null,
    zeile: null,
    id: null,
    anzeige: null,
    feld: null,
    felder: null,
    wert: null,
    zieltabelle: null,
    grund: null,
    kennungen: null,
    regel: null,
    meldung: null,
    anzahl: null,
    // 4T-002387 (Schnitt C): Profil und die beiden Typen eines abweichenden
    // Profil-Feldes an einer Karteikarte.
    profil: null,
    typTabelle: null,
    typProfil: null,
    ...angaben,
  };
}

module.exports = { KONSISTENZ_BEFUNDE, befund };
