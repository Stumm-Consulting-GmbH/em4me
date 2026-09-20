// IPC-Kanal-Gruppe Dialoge und Systemdienste: die nativen Meldungs- und
// Bestaetigungs-Dialoge (Speichern, Konflikt, Loeschen), der PDF-Export sowie
// die beiden Dienste, die nur im Main erreichbar sind (externer Aufruf einer
// Adresse, Rechtschreibpruefung ueber Session und WebContents).
//
// Auszug aus main.js, 4T-000999 (Epic 3E-000196). Kanal-Gruppe: dialog:*,
// events:confirmDelete, calendar:confirmDependents/blockedDelete, pdf:*,
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
 */
function registerDialogsIpc(handle, deps) {
  const { app, dialog, shell, session, senderWindow, tForWindow, getStore } = deps;
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
  handle('spellcheck:addWord', (_event, word) => {
    if (typeof word !== 'string' || word.trim() === '') return false;
    return session.defaultSession.addWordToSpellCheckerDictionary(word);
  });
  handle('spellcheck:removeWord', (_event, word) => {
    if (typeof word !== 'string' || word === '') return false;
    return session.defaultSession.removeWordFromSpellCheckerDictionary(word);
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
  handle('area:confirmTrashFile', async (event, fileName) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('areaPanel.deleteConfirmTitle'),
      message: t('areaPanel.deleteConfirmMessage').replace(
        '{name}',
        typeof fileName === 'string' ? fileName : '',
      ),
      detail: t('areaPanel.deleteConfirmDetail'),
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
  // events:confirmDelete).
  handle('calendar:confirmDependents', async (event, names) => {
    const owner = senderWindow(event);
    const t = (k) => tForWindow(owner, k);
    const list = Array.isArray(names) ? names.join(', ') : '';
    const count = Array.isArray(names) ? names.length : 0;
    const result = await dialog.showMessageBox(owner || undefined, {
      type: 'warning',
      title: t('settings.calendar.derivedConfirm.title'),
      message: t('settings.calendar.derivedConfirm.message')
        .replace('{count}', String(count))
        .replace('{names}', list),
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
    await dialog.showMessageBox(owner || undefined, {
      type: 'info',
      title: t('settings.calendar.derivedBlocked.title'),
      message: t('settings.calendar.derivedBlocked.message')
        .replace('{count}', String(Array.isArray(names) ? names.length : 0))
        .replace('{names}', Array.isArray(names) ? names.join(', ') : ''),
      buttons: [t('settings.calendar.derivedBlocked.ok')],
      noLink: true,
    });
    return true;
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
