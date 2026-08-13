// IPC-Kanal-Gruppe Dialoge und Systemdienste: die nativen Meldungs- und
// Bestaetigungs-Dialoge (Speichern, Konflikt, Loeschen), der PDF-Export sowie
// die beiden Dienste, die nur im Main erreichbar sind (externer Aufruf einer
// Adresse, Rechtschreibpruefung ueber Session und WebContents).
//
// Auszug aus main.js, 4T-0999 (Epic 3E-0196). Kanal-Gruppe: dialog:*,
// events:confirmDelete, calendar:confirmDependents/blockedDelete, pdf:*,
// shell:openExternal, spellcheck:*.
//
// Eigener Zustand: keiner. Electron-Werte kommen ueber das Deps-Objekt, damit
// das Modul zur Lade-Zeit ohne Electron ladbar bleibt.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { printToPdfOptions } = require('../../shared/pdf-options');

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
  // 4T-0999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  handle('shell:openExternal', async (_event, url) => {
    // W-21 (4T-0309): defensiver Typ-Guard — ein Nicht-String wuerde bei
    // startsWith einen TypeError ueber die IPC-Grenze werfen.
    if (typeof url !== 'string') return;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  // --- 4T-0582 (Epic 3E-0107): Rechtschreibpruefung ---------------------------
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

  // --- 4T-0303 (Epic 3E-0054): PDF-Export ------------------------------------
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
    // auf Weiss stellen und danach zuruecksetzen (Spike-Befund 4T-0303,
    // Rest des Fehlerbilds 1 aus 4T-0024).
    const savedBackgroundColor = owner.getBackgroundColor();
    try {
      owner.setBackgroundColor('#ffffff');
      // Format, Ausrichtung und Raender aus den Export-Einstellungen
      // (4T-0304); fehlende oder ungueltige Werte fallen im Mapping auf
      // die Defaults A4/Hochformat/normal zurueck.
      const options = printToPdfOptions({
        pageSize: store?.get('export.pdf.pageSize'),
        landscape: store?.get('export.pdf.landscape'),
        margins: store?.get('export.pdf.margins'),
      });
      const buffer = await owner.webContents.printToPDF(options);
      const absolute = path.resolve(targetPath);
      await fs.writeFile(absolute, buffer);
      return { ok: true, path: absolute };
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

  // 4T-0512 (Epic 3E-0092): Lösch-Bestätigung eines Ereignis-Eintrags
  // (Referenz-Verhalten: Löschen nur mit Bestätigung; Abbrechen ist
  // Default und Escape-Ziel).
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

  // 4T-0747 (Epic 3E-0138): Schutz der abgeleiteten Zeitrechnungen. Eine
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
