// 4T-002827 (Epic 3E-000416): Ein Ziel, das der Anwender in einem Datei-Dialog
// des Hauptprozesses gewählt hat, gegen die geschützten Ordner prüfen.
//
// Die Anmelde-Stelle (`channel-guard.js`) prüft nur, was ein Kanal als
// Pfad-Angabe mitbringt. Ein Kanal, der seinen Dialog selbst öffnet, bekommt
// sein Ziel erst danach; vor dieser Aufgabe schrieben sieben solche Wege in
// die geschützten Ordner, obwohl die Entscheidung zur Grenzprüfung (Frage V5,
// Antwort a) Speichern, Ausgaben und Anlegen dort abweist. Jeder dieser Wege
// fragt nun nach dem Dialog hier, mit derselben Prüfung wie die Anmelde-Stelle
// (`checkTarget`), und meldet eine Abweisung dem Anwender in seiner Sprache.
//
// Die Liste dieser Wege führt `DIALOG_WEGE`; ein Wächter-Prüffall gleicht sie
// mit jedem Kanal ab, der einen Speichern- oder Ordner-Dialog öffnet, damit ein
// neuer Weg nicht ungeprüft bleibt.
'use strict';

/**
 * Die Kanäle, die nach einem eigenen Dialog selbst schreiben oder anlegen,
 * je mit der Stelle, an der sie prüfen. Lesende Dialoge und Dialoge, deren
 * Ziel über einen erklärten Folge-Kanal geschrieben wird, führt der Wächter
 * `test/unit/dialog-wege-geschuetzte-ordner.test.js` mit ihrem Grund.
 */
const DIALOG_WEGE = Object.freeze({
  'file:saveAs': 'src/main/ipc/files.js',
  'demoArea:create': 'src/main/ipc/areas.js',
  'books:createDialog': 'src/main/books/book-apps.js',
  'shelves:createDialog': 'src/main/books/shelf-apps.js',
  'canvas:importJsonCanvas': 'src/main/ipc/canvas-import.js',
  'locales:saveTemplate': 'src/main/ipc/locales.js',
  'locales:updateDialog': 'src/main/ipc/locales.js',
});

// Die Texte je Art, ausgeschrieben, damit eine Suche nach dem Schlüssel sie findet.
const MELDUNGS_TEXTE = Object.freeze({
  protectedFolder: { title: 'area.protectedFolderTitle', message: 'area.protectedFolderMessage' },
  targetUnchecked: { title: 'area.targetUncheckedTitle', message: 'area.targetUncheckedMessage' },
});

/**
 * Die Text-Art einer Abweisung: `protectedFolder` für den Grund «geschützter
 * Ordner», `targetUnchecked` für jeden anderen Grund der Anmelde-Stelle.
 *
 * @param {{error?: string}} abweisung Antwort von `checkTarget`.
 * @returns {'protectedFolder'|'targetUnchecked'}
 */
function textArtDerAbweisung(abweisung) {
  return abweisung && abweisung.error === 'guard:protectedFolder'
    ? 'protectedFolder'
    : 'targetUnchecked';
}

/**
 * Prüft das gewählte Ziel und meldet eine Abweisung im Fenster.
 *
 * Fehlt `checkTarget`, prüft die Funktion nichts: So bleiben die Prüffälle
 * der Handler ohne die Verdrahtung lauffähig. Im Programm reicht `main.js`
 * die Prüfung an jedes Modul (Wächter `dialog-wege-geschuetzte-ordner.test.js`).
 *
 * @param {object} args
 * @param {Function} [args.checkTarget] Prüfung aus `channel-guard.js`.
 * @param {object} args.dialog Electron-Dialog-Modul.
 * @param {object|null} args.owner Fenster des Dialogs.
 * @param {(win: object|null, key: string) => string} args.tForWindow Übersetzung.
 * @param {string} args.kanal Kanal, dessen Handler fragt.
 * @param {string} args.ziel Gewähltes oder daraus errechnetes Ziel.
 * @param {'write'|'create'} args.umfang Umfang des Zugriffs.
 * @param {boolean} [args.melden=true] Abweisung im Fenster melden.
 * @returns {Promise<object|null>} `null`, wenn das Ziel frei ist, sonst die Abweisung.
 */
async function weiseGeschuetztesZielAb({
  checkTarget,
  dialog,
  owner,
  tForWindow,
  kanal,
  ziel,
  umfang,
  melden = true,
}) {
  if (typeof checkTarget !== 'function') return null;
  const abweisung = await checkTarget(kanal, ziel, umfang);
  if (!abweisung) return null;
  if (melden) {
    // Review-Befund Z4 vom 2026-11-22: «gehört zum Programm» nur beim Grund
    // protectedFolder; ein nicht prüfbares Ziel (resolveFailed, danglingLink,
    // protectedListUnavailable) bekommt einen eigenen Text.
    const texte = MELDUNGS_TEXTE[textArtDerAbweisung(abweisung)];
    await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: tForWindow(owner, texte.title),
      message: tForWindow(owner, texte.message),
      detail: ziel,
      buttons: ['OK'],
    });
  }
  return abweisung;
}

module.exports = { DIALOG_WEGE, textArtDerAbweisung, weiseGeschuetztesZielAb };
