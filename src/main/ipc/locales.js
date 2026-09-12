// 4T-001592, 4T-001593 und 4T-001594 (Story 4S-000905, Epic 3E-000129):
// Kanal-Gruppe der eigenen Oberflächen-Sprachen. Kanäle:
// locales:saveTemplate (Vorlage ausgeben), locales:openDialog, locales:import,
// locales:confirmReplace (einspielen), locales:list, locales:remove und
// locales:removeDialog (verwalten), locales:read (Katalog einer
// eingespielten Sprache für den Anzeige-Prozess) sowie locales:gapNotice und
// locales:updateDialog (Alterungs-Hinweis und Aktualisieren der eigenen
// Sprachdatei).
//
// Dazu ein Ereignis in die Gegenrichtung: locales:changed geht nach jedem
// erfolgreichen Einspielen und Entfernen an ALLE Fenster, den Absender
// eingeschlossen (Muster taskStates:changed in ipc/settings-verteilung.js).
// Der Anzeige-Prozess baut daraufhin die Sprach-Auswahl neu und lädt seinen
// Katalog neu, wenn die betroffene Sprache eingestellt ist; ohne das Ereignis
// bliebe eine nachträglich eingespielte Sprache bis zum Neustart unsichtbar
// (AK4).
//
// Die Vorlage entsteht im Hauptprozess und nicht im Anzeige-Prozess, aus zwei
// Gruenden. Erstens haelt der Hauptprozess den Sprach-Katalog ohnehin (loadDict
// in menu/menu.js, mit Cache ueber die App-Laufzeit) — der Anzeige-Prozess
// laedt seine Fassung ueber fetch und haette fuer die englische einen zweiten
// Weg gebraucht, obwohl gerade das vermieden werden soll. Zweitens gehoert der
// Speichern-Dialog dorthin, wo die uebrigen Datei-Dialoge liegen.
//
// Kein eigener Zustand: Der Kanal liest, schreibt und vergisst.
//
// 4T-001593 haengt hier den Einspiel-Weg an, 4T-001594 die Lade-Wege der
// eingespielten Sprachen und 4T-001596 den Alterungs-Hinweis.
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { loadDict, clearDictCache } = require('../menu/menu');
const { FALLBACK_LOCALE, customLocaleId } = require('../../shared/locales');
// 4T-001594: Lesen und Auflisten der eingespielten Sprachen liegen
// electron-frei in app/custom-locales.js — dieselbe Quelle, aus der der
// Menü-Aufbau seinen Katalog holt. Ein zweiter Lese-Weg hier wäre die Kopie,
// die dieses Epic gerade beseitigt.
const {
  leseEigeneSprache,
  listeEigeneSprachen,
  localeDateiIn,
  fehlendeGegenReferenz,
  aktualisierteFassung,
  lueckenMerkerFaellig,
} = require('../app/custom-locales');
// 4T-001593: Pruefung, Kennung und Vorlagen-Aufbau liegen electron-frei im
// geteilten Modul; hier bleiben Dialog, Ablage und Verdrahtung. Der
// Vorlagen-Aufbau ist am 2026-09-09 dorthin gewandert, weil die Vorlage seither
// die Metadaten-Felder traegt, die dieselbe Pruefung wieder liest — beides
// gehoert an eine Stelle, sonst laufen Erzeugung und Pruefung auseinander.
// 4T-001594: `kennungAusMetadaten` steht hier nicht mehr — die Liste der
// eingespielten Sprachen entsteht seither in app/custom-locales.js.
const {
  pruefeSprachdatei,
  buildLocaleTemplate,
  schreibeSprachdatei,
} = require('../../shared/locale-file');
const { LOCALE_CODES } = require('../../shared/locales');
// Jeder Schreibweg des Hauptprozesses laeuft ueber den gemeinsamen atomaren
// Weg; ein eigenes fs.writeFile liesse bei einem Abbruch eine halbe Datei
// zurueck (Waechter test/unit/atomares-schreiben-aufrufer.test.js).
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');

/**
 * Wurzel der eingespielten Sprachdateien im Benutzerprofil.
 *
 * Neben `config.json`, nach dem Muster von `drafts/` und `extensions/`
 * (Entscheidung des Product Owners vom 2026-09-08, Zug-Entscheidung Z2). Der
 * Weg durch die Ablage-Regel der Architektur endet damit im «Daneben» der
 * Anwendungs-Ebene und schafft KEINEN neuen Ort der Ort-Tafel: Die Dateien
 * gehoeren der Anwendung (nicht einem Bereich), sie ueberdauern eine
 * Neuinstallation, und sie brauchen keine Schreibrechte im
 * Programm-Verzeichnis.
 *
 * @param {object} app Electron-App.
 * @returns {string} Absoluter Pfad.
 */
function localesRoot(app) {
  return path.join(app.getPath('userData'), 'locales');
}

/**
 * Datei-Pfad einer eingespielten Sprache aus ihrem Sprach-Code.
 *
 * Die abgelegte Datei heisst nach dem Code aus `@@locale`, nicht nach dem
 * Namen, unter dem der Anwender sie gespeichert hatte: Der Code ist die
 * Identität der Sprache, und zwei Dateien mit demselben Code sind dieselbe
 * Sprache in zwei Fassungen.
 *
 * Sicherheits-Kontrakt wie bei den externen Erweiterungen
 * (`ipc/extensions.js`): Der Anzeige-Prozess reicht nur Kennungen herein, jeder
 * Pfad entsteht aus der Wurzel plus einem Code, den `kennungAusMetadaten`
 * bereits gegen das Sprach-Code-Muster geprüft hat. Ein Code mit Pfad-Anteil
 * kann die Funktion also gar nicht erreichen; der Gegen-Check bleibt trotzdem
 * stehen, weil er billig ist und die Zusicherung an Ort und Stelle zeigt.
 *
 * 4T-001594: Die Guard-Logik selbst ist nach `app/custom-locales.js` gewandert,
 * weil sie seither drei Leser hat und der Menü-Aufbau dieses Modul nicht laden
 * darf (er wird von ihm geladen). Hier bleibt die electron-nahe Hülle, die aus
 * der App die Wurzel macht.
 *
 * @param {object} app Electron-App.
 * @param {string} code Sprach-Code aus den Metadaten.
 * @returns {string|null} Pfad oder null, wenn der Code die Wurzel verließe.
 */
function localeDatei(app, code) {
  return localeDateiIn(localesRoot(app), code);
}

/**
 * Registriert die Kanaele der eigenen Sprachdateien.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialoge.
 * @param {object} deps.app Electron-App (Vorbelegungs-Pfad und Benutzerprofil).
 * @param {object} deps.BrowserWindow Electron-Fenster-Klasse.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 */
function registerLocalesIpc(handle, deps) {
  const { dialog, app, BrowserWindow, senderWindow, tForWindow, getStore } = deps;
  // 4T-001596: Der Merker des zuletzt gemeldeten Luecken-Standes wohnt in der
  // Konfiguration. registerIpc laeuft nach loadStore, der Speicher steht also
  // fest (Muster ipc/settings.js).
  const store = getStore();

  // --- 4T-001594: gemeinsame Bausteine der Verwaltungs-Wege -----------------

  /** Frische Liste der eingespielten Sprachen. */
  const sprachenListe = () => listeEigeneSprachen(localesRoot(app), LOCALE_CODES);

  /**
   * Verwirft den Katalog-Zwischenspeicher des Hauptprozesses und meldet die
   * Änderung an ALLE Fenster, den Absender eingeschlossen.
   *
   * Der Absender bekommt das Ereignis mit, weil er die Auswahl aus derselben
   * Liste baut wie jedes andere Fenster; ihn auszunehmen hieße, denselben
   * Nachzug an zwei Stellen zu schreiben (Muster taskStates:changed).
   *
   * @param {'import'|'remove'} grund Auslöser der Meldung.
   * @param {string} id Kennung der betroffenen Sprache.
   */
  const meldeAenderung = (grund, id) => {
    clearDictCache(id);
    const sprachen = sprachenListe();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('locales:changed', { grund, id, sprachen });
    }
  };

  /**
   * Entfernt die Datei einer eingespielten Sprache.
   *
   * Gemeinsame Logik von `locales:remove` und `locales:removeDialog`: Ein
   * zweiter Löschweg wäre eine zweite Gelegenheit, den Pfad-Guard zu vergessen.
   *
   * @param {string} code Sprach-Code.
   * @returns {Promise<{ok: true}|{ok: false, error: string, detail?: string}>}
   */
  const entferneDatei = async (code) => {
    const ziel = localeDatei(app, code);
    if (!ziel) return { ok: false, error: 'locale-ungueltig' };
    try {
      await fsp.rm(ziel, { force: true });
    } catch (err) {
      return { ok: false, error: 'remove-failed', detail: String(err && err.message) };
    }
    return { ok: true };
  };

  // Gibt die Vorlage aus: Katalog holen, Ziel erfragen, schreiben.
  //
  // Die Vorlage entsteht aus der ENGLISCHEN Fassung, weil Englisch zugleich die
  // Rueckfall-Sprache ist (4T-001595): Was der Uebersetzer vor sich sieht, ist
  // genau der Text, der bei einem fehlenden Eintrag stehen bliebe.
  handle('locales:saveTemplate', async (event) => {
    const owner = senderWindow(event);
    const dict = loadDict(FALLBACK_LOCALE);
    // Ein leerer Katalog waere ein Fehler des Bestands und keine leere Vorlage:
    // Wer sie bearbeitete, uebersetzte nichts und spielte spaeter eine Datei
    // ein, die jede Zeile der Oberflaeche vermissen laesst.
    if (!dict || Object.keys(dict).length === 0) {
      return { ok: false, error: 'empty-catalog' };
    }

    // Der Datei-Name ist beliebig: Die Sprache benennt sich seit dem
    // 2026-09-09 IN der Datei (@@locale, @@name), und der Vorschlag ist nur
    // noch eine Bequemlichkeit. Worauf es ankommt, sagt die Rueckmeldung nach
    // dem Speichern.
    const vorschlag = `${tForWindow(owner, 'locales.template.fileStem')}.json`;
    const dlgResult = await dialog.showSaveDialog(owner || undefined, {
      title: tForWindow(owner, 'locales.template.saveDialogTitle'),
      defaultPath: path.join(app.getPath('home'), vorschlag),
      filters: [
        { name: tForWindow(owner, 'dialog.filterJson'), extensions: ['json'] },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    // Abbruch ist kein Fehler: Der Aufrufer zeigt dafuer keinen Hinweis.
    if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };

    const ziel = path.resolve(dlgResult.filePath);
    try {
      await ersetzeDateiOderWirf(ziel, buildLocaleTemplate(dict));
    } catch (err) {
      // Fehlende Rechte, belegter Pfad, volles Laufwerk: Der Anzeige-Prozess
      // bekommt eine Kennung und macht daraus einen lesbaren Satz, statt die
      // System-Meldung durchzureichen.
      return { ok: false, error: 'write-failed', detail: String(err && err.message) };
    }
    return { ok: true, path: ziel, keys: Object.keys(dict).length };
  });

  // --- 4T-001593: Einspielen, Pruefen, Ablegen -------------------------------

  // Waehlt die Datei. Getrennt vom Einspielen, damit der Anzeige-Prozess einen
  // Abbruch von einem Fehlschlag unterscheiden kann, ohne dass der Dialog
  // waehrend der Pruefung offen bliebe (Muster exchange:openDialog).
  handle('locales:openDialog', async (event) => {
    const owner = senderWindow(event);
    const dlgResult = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'locales.import.openDialogTitle'),
      properties: ['openFile'],
      filters: [
        { name: tForWindow(owner, 'dialog.filterJson'), extensions: ['json'] },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (dlgResult.canceled || !dlgResult.filePaths || dlgResult.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: path.resolve(dlgResult.filePaths[0]) };
  });

  // Spielt eine gewaehlte Datei ein: lesen, pruefen, ablegen. Ein Verstoss
  // laesst den Bestand unangetastet — geschrieben wird erst, wenn die Pruefung
  // vollstaendig durch ist (Zug-Entscheidung Z3: kein stiller Teil-Import).
  handle('locales:import', async (event, dateiPfad, opts) => {
    if (typeof dateiPfad !== 'string' || !dateiPfad) return { ok: false, error: 'kein-pfad' };

    let roh;
    try {
      roh = await fsp.readFile(dateiPfad, 'utf8');
    } catch (err) {
      return { ok: false, error: 'read-failed', detail: String(err && err.message) };
    }
    // Ein UTF-8-BOM ist im Editor unsichtbar und wuerde den JSON-Parser
    // scheitern lassen; die Datei ist deshalb nicht falsch, nur anders
    // gespeichert.
    if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

    // Der Datei-Name spielt keine Rolle: Kennung und Anzeige-Name stehen in
    // der Datei (@@locale, @@name).
    const geprueft = pruefeSprachdatei(roh, loadDict(FALLBACK_LOCALE), LOCALE_CODES);
    if (!geprueft.ok) return geprueft;

    const ziel = localeDatei(app, geprueft.code);
    if (!ziel) return { ok: false, error: 'locale-ungueltig', detail: geprueft.code };

    // Ersetzen ist der erwartete Wiederhol-Fall (der Anwender uebersetzt
    // weiter und spielt erneut ein) und wird bestaetigt statt still
    // ausgefuehrt. Die Bestaetigung holt der Anzeige-Prozess; hier entscheidet
    // allein das Flag, damit der Weg auch ohne Oberflaeche pruefbar bleibt.
    let ersetzt;
    try {
      await fsp.access(ziel);
      ersetzt = true;
    } catch {
      ersetzt = false;
    }
    if (ersetzt && !(opts && opts.ersetzen === true)) {
      return {
        ok: false,
        error: 'existiert',
        id: geprueft.id,
        code: geprueft.code,
        name: geprueft.name,
      };
    }

    try {
      await fsp.mkdir(localesRoot(app), { recursive: true });
      // Abgelegt wird MIT den Metadaten: Die Datei im Benutzerprofil ist
      // dieselbe Art Datei wie die eingespielte, und wer sie dort ansieht,
      // erkennt die Sprache ohne den Umweg über den Datei-Namen.
      await ersetzeDateiOderWirf(
        ziel,
        schreibeSprachdatei(geprueft.code, geprueft.name, geprueft.werte),
      );
    } catch (err) {
      return { ok: false, error: 'write-failed', detail: String(err && err.message) };
    }

    // 4T-001594: Erst jetzt — nach dem Schreiben — verliert der Hauptprozess
    // seinen Katalog und erfahren die Fenster davon. Beim Ersetzen ist genau
    // das der Kern: Ohne Verwerfen zeigten Menüs und Betriebssystem-Dialoge
    // bis zum Neustart die alte Fassung weiter.
    meldeAenderung('import', geprueft.id);

    return {
      ok: true,
      id: geprueft.id,
      code: geprueft.code,
      name: geprueft.name,
      keys: Object.keys(geprueft.werte).length,
      uebersprungen: geprueft.uebersprungen,
      ersetzt,
    };
  });

  // Bestaetigung des Ersetzens. Eigener Kanal statt einer Rueckfrage im
  // Anzeige-Prozess, weil die uebrigen Bestaetigungen der Anwendung ebenfalls
  // System-Dialoge sind (Muster extensions:confirmTrust) und ein zweiter
  // Bestaetigungs-Stil den Anwender ratlos liesse.
  handle('locales:confirmReplace', async (event, name) => {
    if (typeof name !== 'string' || !name) return false;
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'question',
      title: t('locales.import.replaceTitle'),
      // Genannt wird der ANZEIGE-Name aus der Datei, nicht der Code: Der
      // Anwender erkennt seine Sprache an dem Namen, den er ihr gegeben hat.
      message: t('locales.import.replaceMessage').replace('{name}', name),
      detail: t('locales.import.replaceDetail'),
      buttons: [t('locales.import.replaceConfirm'), t('locales.import.replaceCancel')],
      // Abbrechen ist Vorgabe und Escape-Ziel: Der Weg ueberschreibt eine
      // Arbeit, die der Anwender ausserhalb geleistet hat.
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // Listet die eingespielten Sprachen. Der Anzeige-Prozess bekommt Kennung,
  // Code, Anzeige-Name und Umfang — nie Pfade, nie Werte. Code und Name kommen
  // aus den Metadaten der Datei und nicht aus ihrem Namen; 4T-001594 baut aus
  // dieser Liste die Eintraege der Sprach-Auswahl.
  //
  // 4T-001594: Der Durchlauf durch den Ordner liegt seither in
  // app/custom-locales.js, weil der Menü-Aufbau dieselbe Liste braucht.
  handle('locales:list', async () => ({ ok: true, sprachen: sprachenListe() }));

  // Entfernt eine eingespielte Sprache. Eine Sprache, die man nicht mehr los
  // wird, waere eine Falle; der Rueckfall auf die Vorgabe-Sprache liegt beim
  // Anzeige-Prozess, weil dort die Einstellung wohnt.
  handle('locales:remove', async (_event, code) => {
    const weg = await entferneDatei(code);
    if (!weg.ok) return weg;
    meldeAenderung('remove', customLocaleId(code));
    return { ok: true, code };
  });

  // --- 4T-001594: Lesen und der Bedien-Weg zum Entfernen ---------------------

  // Liefert den Katalog einer eingespielten Sprache an den Anzeige-Prozess.
  //
  // Der Kanal steht NEBEN dem bestehenden fetch-Weg der mitgelieferten
  // Fassungen und ersetzt ihn nicht (Entscheidung des Product Owners vom
  // 2026-09-10, Frage 1): Der fetch-Weg funktioniert für das Bündel und wird
  // von der Auslieferungs-Konfiguration getragen; eine Vereinheitlichung baute
  // den Weg der fünf Sprachen ohne Anwender-Nutzen um. Für eine Datei
  // außerhalb des Bündels erreicht fetch das Ziel gar nicht — der
  // Anzeige-Prozess hat ohne Node-Integration keinen Dateisystem-Zugriff.
  //
  // Hereingereicht wird ausschließlich die Kennung; jeder Pfad entsteht hier
  // (Sicherheits-Kontrakt aus 4T-001593). Herausgereicht wird {ok, error}
  // statt einer Ausnahme über die Prozess-Grenze (Entwicklungsrichtlinien,
  // Kapitel 3).
  handle('locales:read', async (_event, id) => {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'unbekannt' };
    return leseEigeneSprache(localesRoot(app), id, loadDict(FALLBACK_LOCALE), LOCALE_CODES);
  });

  // Stellt die eingespielten Sprachen zur Auswahl und entfernt die gewählte.
  //
  // Ein System-Dialog wie bei der Ersetzen-Rückfrage und nicht eine eigene
  // Oberfläche: Die übrigen Bestätigungen der Anwendung sind System-Dialoge,
  // und ein zweiter Bestätigungs-Stil ließe den Anwender ratlos. Die
  // Schaltflächen tragen die ANZEIGE-Namen aus den Dateien, weil der Anwender
  // seine Sprache an dem Namen erkennt, den er ihr gegeben hat.
  handle('locales:removeDialog', async (event) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const sprachen = sprachenListe();
    // Nichts eingespielt: Der Aufrufer sagt das in der Statusleiste, statt
    // einen Dialog mit einer leeren Auswahl zu zeigen.
    if (sprachen.length === 0) return { ok: true, keine: true };

    const buttons = [...sprachen.map((s) => s.name), t('locales.remove.cancel')];
    const abbrechen = buttons.length - 1;
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'question',
      title: t('locales.remove.title'),
      message: t('locales.remove.message'),
      detail: t('locales.remove.detail'),
      buttons,
      // Abbrechen ist Vorgabe und Escape-Ziel: Der Weg löscht eine Arbeit,
      // die der Anwender außerhalb geleistet hat.
      defaultId: abbrechen,
      cancelId: abbrechen,
      noLink: true,
    });
    if (result.response === abbrechen || result.response < 0) return { ok: true, entfernt: null };

    const gewaehlt = sprachen[result.response];
    if (!gewaehlt) return { ok: true, entfernt: null };
    const weg = await entferneDatei(gewaehlt.code);
    if (!weg.ok) return { ok: false, error: 'entfernen' };
    meldeAenderung('remove', gewaehlt.id);
    return {
      ok: true,
      entfernt: { id: gewaehlt.id, code: gewaehlt.code, name: gewaehlt.name },
    };
  });

  // --- 4T-001596: Alterungs-Hinweis und Aktualisieren der eigenen Datei ------

  // Fragt, ob der Alterungs-Hinweis faellig ist, und merkt sich die Antwort.
  //
  // Die ERHEBUNG der Luecke liegt im Anzeige-Prozess: Dort stehen beide
  // Kataloge nebeneinander, der aktive und der englische, und ein zweiter
  // Vergleich hier laese dieselben Dateien ein zweites Mal. Hier liegt allein
  // die Frage, ob dieser Stand schon gemeldet wurde — samt der Programm-
  // Version, die der Hauptprozess kennt und der Anzeige-Prozess nicht braucht.
  handle('locales:gapNotice', async (_event, kennung, anzahl) => {
    if (typeof kennung !== 'string' || !kennung) return { ok: false, error: 'unbekannt' };
    // W-21 (4T-000309): Typ-Guard vor der Rechnung — eine Zeichenkette oder
    // NaN liefe sonst als Zahl durch den Vergleich und schriebe Unsinn in die
    // Konfiguration.
    if (!Number.isInteger(anzahl) || anzahl < 0) return { ok: false, error: 'unbekannt' };
    return { ok: true, faellig: lueckenMerkerFaellig(store, kennung, anzahl, app.getVersion()) };
  });

  // Gibt die eigene Sprachdatei auf dem Stand der laufenden Programmfassung
  // aus: dieselbe Form wie die Vorlage, aber mit der Identitaet und den
  // Uebersetzungen des Anwenders; die Eintraege, die seine Datei nicht kennt,
  // stehen an ihrer Stelle auf Englisch (Entscheidung des Product Owners vom
  // 2026-09-10).
  //
  // **Warum die ganze Datei und nicht die Lueckenliste.** Der Anwender
  // speichert das Ergebnis ueber seine bisherige Datei, uebersetzt die englisch
  // gebliebenen Zeilen und spielt sie wieder ein. Die Lueckenliste hatte ihm
  // dagegen ein Zusammenfuehren zweier Dateien von Hand aufgebuerdet.
  //
  // **Warum die Sprache im Dialog gewaehlt wird und nicht die eingestellte
  // ist.** Wer zwei eigene Sprachen pflegt, will beide aktualisieren koennen,
  // ohne die Oberflaeche vorher umzustellen. Der Dialog ist derselbe wie beim
  // Entfernen — die Schaltflaechen tragen die Anzeige-Namen aus den Dateien.
  //
  // Gelesen wird die Datei im Benutzerprofil und nicht der Katalog des
  // Anzeige-Prozesses: Der Hauptprozess soll seine Antwort aus der Quelle
  // ziehen und nicht aus dem, was ihm ein Fenster darueber erzaehlt.
  handle('locales:updateDialog', async (event) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const sprachen = sprachenListe();
    // Nichts eingespielt: Der Aufrufer sagt das in der Statusleiste, statt
    // einen Dialog mit einer leeren Auswahl zu zeigen (Muster removeDialog).
    if (sprachen.length === 0) return { ok: true, keine: true };

    const buttons = [...sprachen.map((s) => s.name), t('locales.update.cancel')];
    const abbrechen = buttons.length - 1;
    const wahl = await dialog.showMessageBox(owner || undefined, {
      type: 'question',
      title: t('locales.update.title'),
      message: t('locales.update.message'),
      detail: t('locales.update.detail'),
      buttons,
      // Abbrechen ist Vorgabe und Escape-Ziel wie beim Entfernen: Der Weg
      // endet in einer Datei, die der Anwender ueber seine eigene legt.
      defaultId: abbrechen,
      cancelId: abbrechen,
      noLink: true,
    });
    if (wahl.response === abbrechen || wahl.response < 0) return { ok: true, abgebrochen: true };
    const gewaehlt = sprachen[wahl.response];
    if (!gewaehlt) return { ok: true, abgebrochen: true };

    const referenz = loadDict(FALLBACK_LOCALE);
    const gelesen = leseEigeneSprache(localesRoot(app), gewaehlt.id, referenz, LOCALE_CODES);
    if (!gelesen.ok) return { ok: false, error: 'lesen' };

    // Die Zahl steht in der Rueckmeldung, damit der Anwender weiss, wie viel
    // Arbeit vor ihm liegt — und sie zaehlt, was in der neuen Datei englisch
    // geblieben ist, nicht was ihr fehlt: In der Datei fehlt nichts mehr.
    const fehlend = fehlendeGegenReferenz(gelesen.werte, referenz).length;

    // Der Datei-Name traegt den Sprach-Code voran: Wer zwei eigene Sprachen
    // pflegt, haette sonst zweimal denselben Vorschlag vor sich.
    const vorschlag = `${gelesen.code}-${t('locales.update.fileStem')}.json`;
    const dlgResult = await dialog.showSaveDialog(owner || undefined, {
      title: t('locales.update.saveDialogTitle'),
      defaultPath: path.join(app.getPath('home'), vorschlag),
      filters: [
        { name: t('dialog.filterJson'), extensions: ['json'] },
        { name: t('dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };

    const fassung = aktualisierteFassung(gelesen.code, gelesen.name, gelesen.werte, referenz);
    const ziel = path.resolve(dlgResult.filePath);
    try {
      // Serialisiert wird ueber denselben Weg wie Vorlage und abgelegte Datei:
      // Die Fassung TRAEGT die beiden Metadaten-Felder bereits, und sie voran
      // zu stellen setzt dieselben Werte an dieselbe Stelle. Ein eigenes
      // JSON.stringify hier waere die zweite Serialisierung, die beim naechsten
      // Form-Wechsel auseinanderliefe.
      await ersetzeDateiOderWirf(ziel, schreibeSprachdatei(gelesen.code, gelesen.name, fassung));
    } catch (err) {
      return { ok: false, error: 'write-failed', detail: String(err && err.message) };
    }
    return { ok: true, path: ziel, name: gelesen.name, fehlend };
  });
}

module.exports = { registerLocalesIpc, localesRoot, localeDatei };
