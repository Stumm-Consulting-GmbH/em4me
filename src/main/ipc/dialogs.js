// IPC-Kanal-Gruppe Dialoge und Systemdienste: die nativen Meldungs- und
// Bestaetigungs-Dialoge (Speichern, Konflikt, Loeschen), der PDF-Export sowie
// die beiden Dienste, die nur im Main erreichbar sind (externer Aufruf einer
// Adresse, Rechtschreibpruefung ueber Session und WebContents).
//
// Auszug aus main.js, 4T-000999 (Epic 3E-000196). Kanal-Gruppe: dialog:*,
// events:confirmDelete, calendar:confirmDependents/blockedDelete/confirmEpochGuard, pdf:*,
// shell:openExternal, spellcheck:*, canvas:austauschBericht.
//
// Eigener Zustand: keiner. Electron-Werte kommen ueber das Deps-Objekt, damit
// das Modul zur Lade-Zeit ohne Electron ladbar bleibt.
'use strict';

const path = require('node:path');
const { ersetzeDateiOderWirf } = require('../documents/atomic-write');
const { printToPdfOptions, printSystemOptions } = require('../../shared/pdf-options');
// 4T-001805 (Epic 3E-000292): Die Saetze der Austausch-Meldung, prozessneutral
// gebildet und von beiden Richtungen geteilt.
const { austauschBericht } = require('../../shared/canvas/canvas-austausch-bericht.js');
// 4T-001800 (Epic 3E-000255): Die Lösch-Rückfrage stellt selbst fest, ob eine
// Pflicht-Begleit-Datei daneben liegt. Bereichs-Grenze und Arten-Liste kommen
// dafür von denselben Stellen wie im Lösch-Kanal.
const { isInsideArea } = require('../area/area-path');
const { pflichtBegleitPfade } = require('../documents/companion-files');

/**
 * Registriert die Dialog- und Systemdienst-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.app Electron-App-Objekt.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {object} deps.shell Electron-Shell-Modul.
 * @param {object} deps.session Electron-Session-Modul (Woerterbuch-Pflege).
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(p: string) => boolean} deps.isMarkdownPath Markdown-Erkennung am Pfad.
 * @param {object} deps.portablerBetrieb Eingefrorenes Ergebnis der Erkennung des
 *   portablen Betriebs `{ portabel, datenOrdner, beschreibbar }` (4T-001990).
 *
 * Rückgabe der beiden schreibenden Wörterbuch-Kanäle `spellcheck:addWord` und
 * `spellcheck:removeWord` (4T-001991): `{ ok: true }`, wenn die
 * Laufzeit-Umgebung den Schritt bestätigt; `{ ok: false }`, wenn sie ihn
 * ablehnt; `{ ok: false, error: 'invalid word' }` bei unbrauchbarem Wort;
 * `{ ok: false, error: 'not portable' }` im portablen Betrieb, dann ohne
 * Aufruf der Laufzeit-Umgebung.
 */
function registerDialogsIpc(handle, deps) {
  const {
    app,
    dialog,
    shell,
    session,
    senderWindow,
    tForWindow,
    getStore,
    // 4T-001800 (Epic 3E-000255): Bereichs-Bindung und Markdown-Erkennung für
    // die Lösch-Rückfrage, beide aus derselben Verdrahtung wie in areas.js.
    areaOfWindow,
    isMarkdownPath,
    // 4T-001991 (Epic 3E-000188): Riegel der Wörterbuch-Pflege im portablen
    // Betrieb.
    portablerBetrieb,
  } = deps;
  // 4T-000999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  handle('shell:openExternal', async (_event, url) => {
    // W-21 (4T-000309): defensiver Typ-Guard — ein Nicht-String wuerde bei
    // startsWith einen TypeError ueber die IPC-Grenze werfen.
    if (typeof url !== 'string') return;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  // --- 4T-000582 (Epic 3E-000107): Rechtschreibpruefung ---------------------------
  // Ersetzen und Woerterbuch laufen ueber das WebContents bzw. die Session; im
  // Renderer sind beide nicht erreichbar. Die Pruefsprache wird bewusst
  // nirgends gesetzt (Architekturentscheidung 6 des Epics).
  handle('spellcheck:replace', (event, word) => {
    if (typeof word !== 'string' || word === '') return false;
    event.sender.replaceMisspelling(word);
    return true;
  });
  //
  // 4T-001991 (Epic 3E-000188): Im portablen Betrieb nimmt das Programm kein
  // Wort auf und entfernt keines. Beide Aufrufe der Laufzeit-Umgebung schreiben
  // laut ihrer Schnittstellen-Beschreibung (Electron 33, electron.d.ts) nicht
  // nur in das Wörterbuch des Programms im Daten-Ordner, sondern auch in das
  // Wörterbuch des Windows-Benutzers; für die Aufnahme ist das am gebauten
  // Programm gemessen (Messung vom 2026-09-28, Befunde B3 und B4 der
  // Abnahme-Messung). Entscheidung des Product Owners vom 2026-09-28: Die
  // portable Fassung bietet die Aufnahme nicht an. Die Oberfläche blendet die
  // Bedienwege aus; dieser Riegel gilt zusätzlich für jedes Fenster, das den
  // Kanal trotzdem ruft. Er meldet das im Rückgabewert, nach dem Muster von
  // `app:oeffneDatenOrdner`.
  //
  // Die Auskunft ist das beim Start EINMAL ermittelte, eingefrorene Ergebnis
  // der Erkennung; im laufenden Programm heißt «portabel» zugleich
  // «beschreibbar» (ipc/windows.js, Kanal `app:portablerBetrieb`).
  //
  // Das Auflisten bleibt: Es liest allein das Wörterbuch des Programms, und das
  // liegt im portablen Betrieb im Daten-Ordner.
  const woerterbuchGesperrt = () => portablerBetrieb.portabel === true;
  const IM_PORTABLEN_BETRIEB_GESPERRT = Object.freeze({ ok: false, error: 'not portable' });

  handle('spellcheck:addWord', (_event, word) => {
    if (woerterbuchGesperrt()) return IM_PORTABLEN_BETRIEB_GESPERRT;
    if (typeof word !== 'string' || word.trim() === '') return { ok: false, error: 'invalid word' };
    return { ok: session.defaultSession.addWordToSpellCheckerDictionary(word) === true };
  });
  handle('spellcheck:removeWord', (_event, word) => {
    if (woerterbuchGesperrt()) return IM_PORTABLEN_BETRIEB_GESPERRT;
    if (typeof word !== 'string' || word === '') return { ok: false, error: 'invalid word' };
    return { ok: session.defaultSession.removeWordFromSpellCheckerDictionary(word) === true };
  });
  handle('spellcheck:listWords', async () => {
    try {
      const words = await session.defaultSession.listWordsInSpellCheckerDictionary();
      return Array.isArray(words) ? words : [];
    } catch (err) {
      // Das Woerterbuch liegt beim Betriebssystem; ein Lesefehler darf die
      // Einstellungs-Seite nicht zerreissen, sie zeigt dann die leere Liste.
      console.warn('listWordsInSpellCheckerDictionary fehlgeschlagen:', err);
      return [];
    }
  });

  // --- 4T-000303 (Epic 3E-000054): PDF-Export ------------------------------------
  // Zwei getrennte Endpunkte: pdf:chooseTarget zeigt den Save-Dialog,
  // pdf:print druckt und schreibt. Getrennt, damit der Renderer den
  // Print-Zustand (Light-Override, printing-Klassen) erst NACH dem Dialog
  // aufbaut — sonst stuende der native Dialog sichtbar ueber einem Fenster
  // im Print-Layout.
  handle('pdf:chooseTarget', async (event, params) => {
    const owner = senderWindow(event);
    const suggestedPath =
      params && typeof params.suggestedPath === 'string' && params.suggestedPath
        ? params.suggestedPath
        : null;
    const suggestedName =
      params && typeof params.suggestedName === 'string' && params.suggestedName
        ? params.suggestedName
        : null;
    // Tab mit Pfad: <basename>.pdf im selben Ordner (kommt fertig aus dem
    // Renderer). Pfadloser Tab (Unbenannt, Handbuch): Name im Home-Verzeichnis.
    const defaultPath =
      suggestedPath ||
      path.join(
        app.getPath('home'),
        suggestedName || `${tForWindow(owner, 'pdf.defaultUntitled')}.pdf`,
      );
    const dlgResult = await dialog.showSaveDialog(owner || undefined, {
      title: tForWindow(owner, 'pdf.saveDialogTitle'),
      defaultPath,
      filters: [{ name: tForWindow(owner, 'dialog.filterPdf'), extensions: ['pdf'] }],
    });
    if (dlgResult.canceled || !dlgResult.filePath) return { ok: false, canceled: true };
    return { ok: true, path: path.resolve(dlgResult.filePath) };
  });

  handle('pdf:print', async (event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath) {
      return { ok: false, error: 'pdf:print ohne Pfad aufgerufen' };
    }
    const owner = senderWindow(event);
    if (!owner || owner.isDestroyed()) {
      return { ok: false, error: 'Fenster nicht mehr verfuegbar' };
    }
    // Chromium malt die Fenster-Hintergrundfarbe als Seiten-Grund unter
    // die Druck-Raender. Im Dark-Theme ist das #1e1e1e (createWindow) und
    // ergaebe einen dunklen Rahmen um jede Seite — fuer die Druck-Dauer
    // auf Weiss stellen und danach zuruecksetzen (Spike-Befund 4T-000303,
    // Rest des Fehlerbilds 1 aus 4T-000024).
    const savedBackgroundColor = owner.getBackgroundColor();
    try {
      owner.setBackgroundColor('#ffffff');
      // Format, Ausrichtung und Raender aus den Export-Einstellungen
      // (4T-000304); fehlende oder ungueltige Werte fallen im Mapping auf
      // die Defaults A4/Hochformat/normal zurueck.
      const options = printToPdfOptions({
        pageSize: store?.get('export.pdf.pageSize'),
        landscape: store?.get('export.pdf.landscape'),
        margins: store?.get('export.pdf.margins'),
      });
      const buffer = await owner.webContents.printToPDF(options);
      const absolute = path.resolve(targetPath);
      await ersetzeDateiOderWirf(absolute, buffer);
      return { ok: true, path: absolute };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (!owner.isDestroyed() && savedBackgroundColor) {
        owner.setBackgroundColor(savedBackgroundColor);
      }
    }
  });

  // 4T-001479 (Epic 3E-000177): Schwester zu 'pdf:print' — dieselbe
  // Druck-Vorbereitung im Renderer, anderer Endpunkt. webContents.print()
  // oeffnet den Druckdialog des Betriebssystems (Entscheidung E3); von dort
  // kommen Drucker, Seitenbereich, Kopien und Duplex. Vorbelegt werden nur
  // Format, Ausrichtung und Raender aus den Export-Einstellungen.
  handle('print:system', async (event) => {
    const owner = senderWindow(event);
    if (!owner || owner.isDestroyed()) {
      return { ok: false, error: 'Fenster nicht mehr verfuegbar' };
    }
    // Wie bei pdf:print: Chromium malt die Fenster-Hintergrundfarbe als
    // Seiten-Grund unter die Druck-Raender; im Dark-Theme ergaebe das einen
    // dunklen Rahmen um jede Seite (Spike-Befund 4T-000303).
    const savedBackgroundColor = owner.getBackgroundColor();
    try {
      owner.setBackgroundColor('#ffffff');
      const options = printSystemOptions({
        pageSize: store?.get('export.pdf.pageSize'),
        landscape: store?.get('export.pdf.landscape'),
        margins: store?.get('export.pdf.margins'),
      });
      // print() ist Callback-basiert; failureReason 'cancelled' ist der
      // Abbruch im Systemdialog und KEIN Fehler — er wird als canceled
      // gemeldet, damit der Renderer schweigt statt zu warnen.
      const result = await new Promise((resolve) => {
        owner.webContents.print(options, (success, failureReason) => {
          if (success) resolve({ ok: true });
          else if (
            String(failureReason || '')
              .toLowerCase()
              .includes('cancel')
          )
            resolve({ ok: false, canceled: true });
          else resolve({ ok: false, error: failureReason || 'Druck fehlgeschlagen' });
        });
      });
      return result;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      if (!owner.isDestroyed() && savedBackgroundColor) {
        owner.setBackgroundColor(savedBackgroundColor);
      }
    }
  });

  // Dirty-Tab-Schliessen-Dialog. Returnt 'save' | 'discard' | 'cancel'.
  handle('dialog:confirmCloseDirty', async (event, opts) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('save.unsavedTitle'),
      message: t('save.unsavedMessage'),
      detail: opts && opts.detail ? opts.detail : '',
      buttons: [t('save.btnSave'), t('save.btnDiscard'), t('save.btnCancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (result.response === 0) return 'save';
    if (result.response === 1) return 'discard';
    return 'cancel';
  });

  // Externer-Change-Konflikt-Dialog. Returnt 'reload' | 'keepOurs'.
  handle('dialog:confirmConflict', async (event, opts) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('save.conflictTitle'),
      message: t('save.conflictMessage'),
      detail: opts && opts.detail ? opts.detail : '',
      buttons: [t('save.conflictReload'), t('save.conflictKeepOurs')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) return 'reload';
    return 'keepOurs';
  });

  // 4T-000512 (Epic 3E-000092): Lösch-Bestätigung eines Ereignis-Eintrags
  // (Referenz-Verhalten: Löschen nur mit Bestätigung; Abbrechen ist
  // Default und Escape-Ziel).
  // 4T-001407 (Epic 3E-000244): Bestaetigung der Massen-Nachpflege. Der Dialog
  // nennt die Zahlen VOR dem Lauf, weil er viele Dateien des Anwenders auf
  // einmal aendert und die Aenderung nicht zurueckgenommen werden kann.
  handle('journals:confirmNachtragen', async (event, params) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const zahl = (v) => String(Number.isFinite(v) ? v : 0);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'question',
      title: t('journal.nachtragen.confirm.title'),
      message: t('journal.nachtragen.confirm.message')
        .replace('{journal}', String((params && params.journal) || ''))
        .replace('{geprueft}', zahl(params && params.geprueft))
        .replace('{zuAendern}', zahl(params && params.zuAendern)),
      buttons: [t('journal.nachtragen.confirm.ok'), t('journal.nachtragen.confirm.cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // 4T-001851 (Epic 3E-000110): Rueckfrage vor dem Loeschen einer NICHT LEEREN
  // Spalte der Kanban-Tafel (Muster events:confirmDelete). Sie ist die eine
  // begruendete Abweichung vom «Rueckgaengig statt Rueckfrage»-Muster der
  // Karten-Bedienung: Mit der Spalte verschwinden auch ihre Karten, also mehr,
  // als die Handlung anzeigt. Eine LEERE Spalte wird ohne Rueckfrage geloescht
  // und kommt hier gar nicht an.
  //
  // Genannt werden Titel UND Kartenzahl: Ohne beides beantwortet der Dialog
  // nicht die eine Frage, auf die es ankommt — ob die richtige Spalte getroffen
  // ist und wie viel daran haengt. Vorbelegt und mit Escape belegt ist das
  // Abbrechen; die Zustimmung ist ein bewusster Klick.
  handle('kanban:confirmDeleteColumn', async (event, angaben) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const anzahl = angaben && Number.isFinite(angaben.anzahl) ? angaben.anzahl : 0;
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('kanban.spalteLoeschenTitel'),
      message: t('kanban.spalteLoeschenFrage')
        .replace('{titel}', String((angaben && angaben.titel) || ''))
        .replace('{anzahl}', String(anzahl)),
      detail: t('kanban.spalteLoeschenDetail'),
      buttons: [t('kanban.spalteLoeschenOk'), t('kanban.spalteLoeschenAbbrechen')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  handle('events:confirmDelete', async (event, entryText) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('events.confirmDelete.title'),
      message: t('events.confirmDelete.message').replace(
        '{text}',
        typeof entryText === 'string' ? entryText : '',
      ),
      buttons: [t('events.confirmDelete.confirm'), t('events.confirmDelete.cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // 4T-001351 (Epic 3E-000170): Rueckfrage vor dem Loeschen einer Datei des
  // Bereichs (Muster events:confirmDelete). Sie NENNT DEN NAMEN: Ein
  // Bestaetigungs-Dialog ohne Namen beantwortet die eine Frage nicht, auf die
  // es ankommt — ob die richtige Datei getroffen ist.
  //
  // Der Detail-Text sagt beides zu, was der Anwender hier wissen muss: dass die
  // Datei in den Papierkorb wandert und von dort wiederherstellbar ist, und
  // dass Verweise auf sie NICHT nachgezogen werden (Entscheidung E4 des Epics —
  // beim Loeschen gibt es kein Ersatz-Ziel).
  //
  // Vorbelegt und mit Escape belegt ist das Abbrechen; die Zustimmung ist ein
  // bewusster Klick.
  //
  // 4T-001800 (Epic 3E-000255): Liegt eine Pflicht-Begleit-Datei daneben, sagt
  // der Erläuterungstext in einem zusätzlichen Satz, dass die Änderungsbelege
  // mitgehen. Wer zustimmt, soll wissen, was alles verschwindet.
  //
  // Der Pfad ist die zweite, OPTIONALE Angabe, und der Haupt-Prozess stellt
  // selbst fest, was daneben liegt. Eine eigene Auskunft davor wäre ein
  // zweiter Kanal für eine Frage, die dieser Dialog selbst beantworten kann.
  // Ohne Pfad, außerhalb des Bereichs, ohne Markdown-Endung und ohne
  // Begleit-Datei bleibt die Rückfrage Wort für Wort die bisherige.
  async function hatPflichtBegleitDatei(owner, filePath) {
    if (typeof filePath !== 'string' || !filePath) return false;
    if (!isMarkdownPath(filePath)) return false;
    const area = areaOfWindow(owner);
    if (!area || !isInsideArea(area.rootPath, filePath)) return false;
    return (await pflichtBegleitPfade(path.resolve(filePath))).length > 0;
  }

  handle('area:confirmTrashFile', async (event, fileName, filePath) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const detail = (await hatPflichtBegleitDatei(owner, filePath))
      ? `${t('areaPanel.deleteConfirmDetail')} ${t('areaPanel.deleteConfirmCompanion')}`
      : t('areaPanel.deleteConfirmDetail');
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('areaPanel.deleteConfirmTitle'),
      message: t('areaPanel.deleteConfirmMessage').replace(
        '{name}',
        typeof fileName === 'string' ? fileName : '',
      ),
      detail,
      buttons: [t('areaPanel.deleteConfirmOk'), t('areaPanel.deleteConfirmCancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  // 4T-000747 (Epic 3E-000138): Schutz der abgeleiteten Zeitrechnungen. Eine
  // wirksame Änderung an einer Bezugs-Zeitrechnung verschiebt auch deren
  // Werte, deshalb Bestätigung vor dem Anwenden; das Löschen einer
  // Zeitrechnung mit Abhängigen ist gesperrt und meldet nur (Muster
  // events:confirmDelete). 4T-002065 (Epic 3E-000307): Beide Meldungen haben
  // eine eigene Einzahl-Fassung für genau eine Ableitung. Die bisherigen
  // Schlüssel tragen weiter die Mehrzahl und werden nicht umbenannt, weil
  // eigene Sprachdateien der Anwender sie übersetzt haben; die Einzahl steht
  // als Geschwister mit dem Suffix «One» daneben.
  handle('calendar:confirmDependents', async (event, names) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const list = Array.isArray(names) ? names.join(', ') : '';
    const count = Array.isArray(names) ? names.length : 0;
    let schluessel = 'settings.calendar.derivedConfirm.message';
    if (count === 1) schluessel = 'settings.calendar.derivedConfirm.messageOne';
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('settings.calendar.derivedConfirm.title'),
      message: t(schluessel).replace('{count}', String(count)).replace('{names}', list),
      buttons: [
        t('settings.calendar.derivedConfirm.apply'),
        t('settings.calendar.derivedConfirm.cancel'),
      ],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });

  handle('calendar:blockedDelete', async (event, names) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const count = Array.isArray(names) ? names.length : 0;
    let schluessel = 'settings.calendar.derivedBlocked.message';
    if (count === 1) schluessel = 'settings.calendar.derivedBlocked.messageOne';
    await dialog.showMessageBox(owner || undefined, {
      type: 'info',
      title: t('settings.calendar.derivedBlocked.title'),
      message: t(schluessel)
        .replace('{count}', String(count))
        .replace('{names}', Array.isArray(names) ? names.join(', ') : ''),
      buttons: [t('settings.calendar.derivedBlocked.ok')],
      noLink: true,
    });
    return true;
  });

  // 4T-002003 (Epic 3E-000307): Rückfrage vor dem Nachtragen einer jüngsten
  // Epoche (Muster calendar:confirmDependents). Werte ohne Epochen-Kürzel
  // würden danach als Daten der neuen Epoche gelesen; die Rückfrage nennt je
  // Zeitrechnung die Zahl und bietet an, das Kürzel der bisherigen Epoche zu
  // ergänzen. Vorbelegt ist das Sichern, weil es den Bestand erhält; Escape
  // bricht ab. Ist der Bereich zu groß zum Zählen (`zaehlbar === false`), gibt
  // es nichts zu sichern, und die Wahl ist allein Anwenden oder Abbrechen —
  // dort ist das Abbrechen vorbelegt, weil das Programm die Folge nicht
  // beziffern kann. Jede ungültige Eingabe und jeder Fehler zählt als
  // Abbruch: Ohne Zusage des Anwenders wird nichts gespeichert.
  function epochGuardAbsatz(t, eintrag, zaehlbar) {
    const name = String(eintrag.name);
    if (!zaehlbar) {
      return t('settings.calendar.epochGuard.entryTooLarge').replace('{name}', name);
    }
    let schluessel = 'settings.calendar.epochGuard.entry.other';
    if (eintrag.werte === 1) schluessel = 'settings.calendar.epochGuard.entry.one';
    else if (eintrag.dokumente === 1) schluessel = 'settings.calendar.epochGuard.entry.oneDoc';
    return t(schluessel)
      .replace('{name}', name)
      .replace('{count}', String(eintrag.werte))
      .replace('{docs}', String(eintrag.dokumente));
  }

  function epochGuardEintragGueltig(eintrag, zaehlbar) {
    if (!eintrag || typeof eintrag.name !== 'string' || eintrag.name === '') return false;
    if (!zaehlbar) return true;
    const zahl = (v) => Number.isInteger(v) && v >= 1;
    return zahl(eintrag.werte) && zahl(eintrag.dokumente);
  }

  handle('calendar:confirmEpochGuard', async (event, daten) => {
    try {
      if (!daten || typeof daten.zaehlbar !== 'boolean') return 'abbrechen';
      const { eintraege, zaehlbar } = daten;
      if (!Array.isArray(eintraege) || eintraege.length === 0) return 'abbrechen';
      if (!eintraege.every((e) => epochGuardEintragGueltig(e, zaehlbar))) return 'abbrechen';
      const owner = senderWindow(event);
      const t = (k) => tForWindow(owner, k);
      const optionen = {
        type: 'warning',
        title: t('settings.calendar.epochGuard.title'),
        message: eintraege.map((e) => epochGuardAbsatz(t, e, zaehlbar)).join('\n\n'),
        noLink: true,
      };
      if (zaehlbar) {
        optionen.detail = t('settings.calendar.epochGuard.explain');
        optionen.buttons = [
          t('settings.calendar.epochGuard.save'),
          t('settings.calendar.epochGuard.without'),
          t('settings.calendar.epochGuard.cancel'),
        ];
        optionen.defaultId = 0;
        optionen.cancelId = 2;
      } else {
        optionen.buttons = [
          t('settings.calendar.epochGuard.apply'),
          t('settings.calendar.epochGuard.cancel'),
        ];
        optionen.defaultId = 1;
        optionen.cancelId = 1;
      }
      const result = await dialog.showMessageBox(owner || undefined, optionen);
      if (zaehlbar && result.response === 0) return 'sichern';
      if (zaehlbar && result.response === 1) return 'ohne';
      if (!zaehlbar && result.response === 0) return 'ohne';
      return 'abbrechen';
    } catch {
      return 'abbrechen';
    }
  });

  // 4T-001805 (Epic 3E-000292): Ergebnis-Meldung des Austauschs mit dem offenen
  // Format JSON Canvas.
  //
  // **Der Anzeige-Prozess schickt Zahlen, keine Saetze.** Die Saetze entstehen
  // hier aus denselben Schluesseln, aus denen jeder andere Dialog dieser Datei
  // seine Texte zieht; ein fertiger Text aus dem Renderer waere ein zweiter
  // Uebersetzungs-Weg neben tForWindow. Gebildet werden sie im prozessneutralen
  // Modul canvas-austausch-bericht.js, damit beide Richtungen des Austauschs
  // denselben Bericht liefern und er ohne Electron pruefbar bleibt.
  handle('canvas:austauschBericht', async (event, params) => {
    const owner = senderWindow(event);
    const bericht = austauschBericht(params, (k) => tForWindow(owner, k));
    await dialog.showMessageBox(owner || undefined, {
      type: 'info',
      title: bericht.titel,
      message: bericht.kopf,
      detail: bericht.zeilen.join('\n'),
      buttons: [bericht.ok],
      noLink: true,
    });
    return true;
  });

  // Schreibfehler-Dialog (Datei nicht schreibbar etc.).
  handle('dialog:showSaveError', async (event, detail) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    await dialog.showMessageBox(owner || undefined, {
      type: 'error',
      title: t('save.errorTitle'),
      message: t('save.errorMessage'),
      detail: detail || '',
      buttons: ['OK'],
    });
  });
}

module.exports = { registerDialogsIpc };
