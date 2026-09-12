// 4T-001594 (Story 4S-000905, Epic 3E-000129): Lesen der eingespielten eigenen
// Sprachen aus dem Benutzerprofil.
//
// **Warum ein eigenes Modul und nicht der IPC-Kanal.** Die eigene Sprache hat
// in diesem Task drei Leser: den Kanal `locales:read` für den Anzeige-Prozess,
// den Menü-Aufbau des Hauptprozesses (`loadDict` in menu/menu.js, der auch die
// Dialoge des Betriebssystems versorgt) und die Verwaltungs-Liste. Läge das
// Lesen im IPC-Modul, holte sich der Menü-Aufbau seinen Katalog aus einem
// Kanal-Modul, das seinerseits das Menü lädt — ein Kreis. Hier liegt es
// electron-frei: Die Wurzel wird hereingereicht, `app.getPath('userData')`
// kennt das Modul nicht.
//
// **Warum synchron.** `loadDict` ist synchron und wird aus dem Menü-Aufbau
// heraus gerufen; ein Versprechen wäre dort nicht abwartbar. Gelesen wird eine
// einzelne Datei im Benutzerprofil, dieselbe Größenordnung wie die
// mitgelieferten Fassungen, die `loadDict` seit jeher mit `readFileSync` holt.
// Die asynchronen IPC-Kanäle rufen die Funktionen unverändert mit.
//
// **Warum die Datei beim Lesen ERNEUT geprüft wird.** Sie liegt in einem
// Ordner, den der Anwender mit jedem Editor erreicht. Die Sicherheits-
// Zusicherung des Epics lautet «kein ungeprüfter Text erreicht die
// Oberfläche», und die gilt beim Lesen, nicht nur beim Einspielen: Eine nach
// dem Einspielen veränderte Datei ginge sonst ungeprüft in die Menüs und in
// die generierten Handbuch-Seiten. Eine Datei, die die Prüfung nicht mehr
// besteht, gilt als nicht vorhanden — der Aufrufer fällt auf Englisch zurück.
//
// 4T-001596 hängt am Ende drei electron-freie Bausteine des Alterungs-Hinweises
// an: den Mengen-Vergleich gegen die englische Fassung, die aktualisierte
// Fassung der eigenen Sprachdatei und die Entscheidung über den Wiederhol-
// Merker.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  pruefeSprachdatei,
  kennungAusMetadaten,
  META_LOCALE,
  META_NAME,
} = require('../../shared/locale-file');
const { isCustomLocale, customLocaleCode } = require('../../shared/locales');

/**
 * Datei-Pfad einer eingespielten Sprache aus Wurzel und Sprach-Code.
 *
 * Sicherheits-Kontrakt wie bei den externen Erweiterungen
 * (`ipc/extensions.js`): Der Anzeige-Prozess reicht nur Kennungen herein, jeder
 * Pfad entsteht aus der Wurzel plus einem Code, der gegen das Muster geprüft
 * ist. Der Gegen-Check auf die Wurzel bleibt daneben stehen, weil er billig ist
 * und die Zusicherung an Ort und Stelle zeigt.
 *
 * Die Funktion lag bis 4T-001594 als `localeDatei(app, code)` im IPC-Modul; sie
 * ist hierher gewandert, weil sie seither drei Leser hat und der Menü-Aufbau
 * das IPC-Modul nicht laden darf. `ipc/locales.js` reicht sie unverändert
 * weiter.
 *
 * @param {string} wurzel Absoluter Pfad des Sprach-Ordners im Benutzerprofil.
 * @param {string} code Sprach-Code aus den Metadaten.
 * @returns {string|null} Pfad oder null, wenn der Code die Wurzel verließe.
 */
function localeDateiIn(wurzel, code) {
  if (!/^[a-zA-Z0-9-]{1,35}$/.test(String(code))) return null;
  const ziel = path.join(wurzel, `${code}.json`);
  return path.resolve(ziel).startsWith(path.resolve(wurzel) + path.sep) ? ziel : null;
}

/**
 * Liest den Katalog einer eingespielten eigenen Sprache.
 *
 * @param {string} wurzel Absoluter Pfad des Sprach-Ordners im Benutzerprofil.
 * @param {string} id Kennung der Form `custom:<code>`.
 * @param {Record<string, string>} referenz Englische Fassung als Bezugsgröße.
 * @param {string[]} mitgelieferteCodes Codes der mitgelieferten Sprachen.
 * @returns {{ok: true, id: string, code: string, name: string, werte: object}|{ok: false, error: string, detail?: string}}
 */
function leseEigeneSprache(wurzel, id, referenz, mitgelieferteCodes = []) {
  // `unbekannt` deckt beides ab: eine Angabe, die gar keine Kennung einer
  // eigenen Sprache ist, und eine, deren Code keinen Datei-Namen ergeben kann
  // (etwa `custom:../x`). Beide benennen keine Sprache, die es geben könnte;
  // eine feinere Unterscheidung hülfe dem Aufrufer nicht und nennte dem
  // Anzeige-Prozess mehr über die Ablage, als er wissen muss.
  if (!isCustomLocale(id)) return { ok: false, error: 'unbekannt' };
  const code = customLocaleCode(id);
  const datei = localeDateiIn(wurzel, code);
  if (!datei) return { ok: false, error: 'unbekannt', detail: code };

  let roh;
  try {
    roh = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    // Die fehlende Datei ist der erwartete Fall (eingestellte Sprache
    // entfernt) und kein Fehler des Systems; alles Übrige — Rechte, defektes
    // Laufwerk — ist einer und bekommt eine eigene Kennung.
    if (err && err.code === 'ENOENT') return { ok: false, error: 'fehlt' };
    return { ok: false, error: 'lesen', detail: String(err && err.message) };
  }
  // Ein UTF-8-BOM ist im Editor unsichtbar und ließe den JSON-Parser
  // scheitern; die Datei ist deshalb nicht falsch, nur anders gespeichert
  // (dieselbe Behandlung wie beim Einspielen).
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  const geprueft = pruefeSprachdatei(roh, referenz, mitgelieferteCodes);
  if (!geprueft.ok) return { ok: false, error: 'ungueltig', detail: geprueft.error };

  // `werte` trägt die @@-Felder nicht: Die Prüfung sortiert sie als Metadaten
  // aus, und der Katalog der Oberfläche kennt nur Übersetzungs-Schlüssel.
  return {
    ok: true,
    id: geprueft.id,
    code: geprueft.code,
    name: geprueft.name,
    werte: geprueft.werte,
  };
}

/**
 * Listet die eingespielten eigenen Sprachen mit Kennung, Code, Anzeige-Name
 * und Umfang — nie Pfade, nie Werte.
 *
 * Code und Name kommen aus den Metadaten der Datei und nicht aus ihrem Namen.
 * Anders als beim Lesen läuft hier NICHT die volle Prüfung: Die Liste nennt,
 * was da ist, und kein Wert aus ihr wird angezeigt; die Prüfung sitzt an der
 * Stelle, an der Text in die Oberfläche geht.
 *
 * @param {string} wurzel Absoluter Pfad des Sprach-Ordners im Benutzerprofil.
 * @param {string[]} mitgelieferteCodes Codes der mitgelieferten Sprachen.
 * @returns {Array<{id: string, code: string, name: string, keys: number}>}
 */
function listeEigeneSprachen(wurzel, mitgelieferteCodes = []) {
  let namen;
  try {
    namen = fs.readdirSync(wurzel);
  } catch {
    // Kein Ordner heißt: nichts eingespielt. Das ist kein Fehler.
    return [];
  }
  const sprachen = [];
  for (const dateiName of namen) {
    if (!dateiName.endsWith('.json')) continue;
    const datei = localeDateiIn(wurzel, dateiName.slice(0, -'.json'.length));
    if (!datei) continue;
    try {
      const inhalt = JSON.parse(fs.readFileSync(datei, 'utf8'));
      const kennung = kennungAusMetadaten(inhalt, mitgelieferteCodes);
      if (!kennung.ok) continue;
      const werte = Object.keys(inhalt).filter((k) => !k.startsWith('@@'));
      sprachen.push({
        id: kennung.id,
        code: kennung.code,
        name: kennung.name,
        keys: werte.length,
      });
    } catch {
      // Eine unlesbar gewordene Datei wird übergangen statt gemeldet: Sie ist
      // kein Zustand, den der Anwender hier herbeigeführt hat, und die Liste
      // soll darüber nicht scheitern.
    }
  }
  return sprachen;
}

// --- 4T-001596: Alterungs-Hinweis bei fehlenden Schlüsseln ------------------
//
// Alles drei liegt hier und nicht im IPC-Modul, damit es OHNE Electron prüfbar
// bleibt (Muster der Injektions-Naht `eigeneWurzel` in menu-dict.js): Der
// Speicher kommt als Argument herein, `app.getVersion()` bleibt draußen.

/**
 * Schlüssel der Bezugs-Fassung, die eine eigene Sprache nicht kennt.
 *
 * Die Reihenfolge ist die der Bezugs-Fassung und nicht die des Alphabets: Wer
 * die ausgegebene Datei neben die Vorlage legt, findet dieselben Einträge an
 * denselben Stellen wieder.
 *
 * @param {Record<string, string>} werte Katalog der eigenen Sprache.
 * @param {Record<string, string>} referenz Englische Fassung als Bezugsgröße.
 * @returns {string[]} Fehlende Schlüssel in der Reihenfolge der Bezugs-Fassung.
 */
function fehlendeGegenReferenz(werte, referenz) {
  const vorhanden = werte && typeof werte === 'object' ? werte : {};
  const bezug = referenz && typeof referenz === 'object' ? referenz : {};
  return Object.keys(bezug).filter((key) => !(key in vorhanden));
}

/**
 * Baut die aktualisierte Fassung einer eigenen Sprachdatei.
 *
 * **Was der Anwender zurückbekommt, ist seine ganze Datei auf dem Stand der
 * laufenden Programmfassung** (Entscheidung des Product Owners vom 2026-09-10)
 * und nicht die blosse Lückenliste: Er speichert sie über seine bisherige
 * Datei, übersetzt die englisch gebliebenen Einträge und spielt sie wieder ein
 * — ein Zusammenführen zweier Dateien von Hand entfällt.
 *
 * Die Reihenfolge ist die der Bezugs-Fassung, mit den beiden Metadaten-Feldern
 * voran: dieselbe Form wie die Vorlage. Wer zwei Fassungen nebeneinander legt,
 * findet dieselben Einträge an denselben Stellen.
 *
 * Eigene Schlüssel, welche die Bezugs-Fassung nicht kennt, entfallen. Sie sind
 * beim Einspielen ohnehin übersprungen worden (4T-001593) und stehen in der
 * gelesenen Fassung gar nicht mehr; die Regel steht hier trotzdem, weil sie die
 * Zusicherung an Ort und Stelle zeigt.
 *
 * @param {string} code Sprach-Code für `@@locale`.
 * @param {string} name Anzeige-Name für `@@name`.
 * @param {Record<string, string>} werte Katalog der eigenen Sprache.
 * @param {Record<string, string>} referenz Englische Fassung als Bezugsgröße.
 * @returns {Record<string, string>} Vollständige Fassung, Metadaten voran.
 */
function aktualisierteFassung(code, name, werte, referenz) {
  const eigene = werte && typeof werte === 'object' ? werte : {};
  const bezug = referenz && typeof referenz === 'object' ? referenz : {};
  const zusammen = {};
  for (const [schluessel, englisch] of Object.entries(bezug)) {
    zusammen[schluessel] = Object.prototype.hasOwnProperty.call(eigene, schluessel)
      ? eigene[schluessel]
      : englisch;
  }
  // Dieselbe Gestalt, die `schreibeSprachdatei` serialisiert: die beiden
  // Metadaten-Felder voran, danach die Werte.
  return { [META_LOCALE]: code, [META_NAME]: name, ...zusammen };
}

/** Einstellungs-Schlüssel des zuletzt gemeldeten Lücken-Standes. */
const LUECKEN_MERKER = 'customLocaleGap';

/**
 * Entscheidet, ob der Alterungs-Hinweis fällig ist, und schreibt den Merker.
 *
 * **Der Stand ist das Tripel aus Kennung, Zahl und Programm-Version** (AK6).
 * Die Kennung, weil eine zweite eigene Sprache ihre eigene Lage hat; die Zahl,
 * weil Einspielen und Ersetzen sie ändern; die Version, weil eine neue
 * Programmfassung neue Schlüssel mitbringt, ohne dass sich an der Datei etwas
 * geändert hätte. Ist das Tripel dasselbe wie beim letzten Mal, schweigt der
 * Hinweis — sonst meldete er sich bei jedem Start erneut und wäre nach drei
 * Tagen nur noch ein Geräusch.
 *
 * Eine Lücke von null löscht den Merker, statt ihn auf null zu setzen: Der
 * Übersetzer hat nachgearbeitet, und die nächste Lücke ist wieder eine neue.
 *
 * @param {object|null} store Einstellungs-Speicher (get/set/delete).
 * @param {string} kennung Kennung der eigenen Sprache.
 * @param {number} anzahl Zahl der fehlenden Einträge.
 * @param {string} version Programm-Version.
 * @returns {boolean} true, wenn der Hinweis gezeigt werden soll.
 */
function lueckenMerkerFaellig(store, kennung, anzahl, version) {
  if (!store) return false;
  const merker = store.get(LUECKEN_MERKER);
  const gleicheSprache = !!merker && merker.id === kennung;
  if (anzahl === 0) {
    if (gleicheSprache) {
      if (typeof store.delete === 'function') store.delete(LUECKEN_MERKER);
      else store.set(LUECKEN_MERKER, null);
    }
    return false;
  }
  if (gleicheSprache && merker.count === anzahl && merker.version === version) return false;
  store.set(LUECKEN_MERKER, { id: kennung, count: anzahl, version });
  return true;
}

module.exports = {
  leseEigeneSprache,
  listeEigeneSprachen,
  localeDateiIn,
  fehlendeGegenReferenz,
  aktualisierteFassung,
  lueckenMerkerFaellig,
  LUECKEN_MERKER,
};
