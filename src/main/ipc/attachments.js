// IPC-Kanal-Gruppe Anlagen: Ablage einer Anlage samt Verweis-Pfad, Oeffnen
// einer Anlage in der Standardanwendung und die Anlagen-Konfiguration
// (globaler Wert im Speicher, Bereichs-Sektion in der Bereichsdatei).
//
// Auszug aus main.js, 4T-001000 (Epic 3E-000196). Kanal-Gruppe: attachment:*,
// attachments:*.
//
// Eigener Zustand: keiner; die Pfad-Rechnung liegt im reinen Modul
// attachment-path, die Bereichs-Leser kommen als Deps.
'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const attachmentPath = require('../documents/attachment-path');
const { isInsideArea } = require('../area/area-path');
const selbstSchreib = require('../documents/self-write');

// 4T-000947: dieselbe Instanz wie in der Verdrahtung (Modul-Singleton ueber den
// Require-Cache).
const markSelfWriting = selbstSchreib.merke;

/**
 * Registriert die Anlagen-Kanaele.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhaengigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialog-Modul.
 * @param {object} deps.shell Electron-Shell-Modul (Oeffnen in der Standardanwendung).
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(win: object, key: string) => string} deps.tForWindow Uebersetzung im Fenster-Kontext.
 * @param {() => object|null} deps.getStore Einstellungs-Speicher (steht bei der Registrierung fest).
 * @param {object} deps.mddStore Container-Kern der Begleitdateien.
 * @param {Function} deps.readAreaAttachmentsConfig Anlagen-Sektion der Bereichsdatei lesen.
 * @param {Function} deps.resolveAttachmentsConfig Wirksame Anlagen-Konfiguration aufloesen.
 * @param {Function} deps.bereinigterQuellName Dateiname aus der mitgebrachten Quelle.
 */
function registerAttachmentsIpc(handle, deps) {
  const {
    dialog,
    shell,
    senderWindow,
    areaOfWindow,
    tForWindow,
    getStore,
    mddStore,
    readAreaAttachmentsConfig,
    resolveAttachmentsConfig,
    bereinigterQuellName,
  } = deps;
  // 4T-000999: registerIpc laeuft nach loadStore, der Speicher steht also fest.
  // Der Bezeichner bleibt `store`, damit die Handler-Rumpfe unveraendert sind.
  const store = getStore();

  // 4T-000787 (Epic 3E-000125): Anlage ablegen und den Verweis-Pfad liefern. Der
  // eine Kanal beider Eingabewege (Einfuegen, Ziehen). Die Pfad-Rechnung liegt
  // vollstaendig im reinen Modul attachment-path; hier bleiben nur die
  // Datei-Operationen und die Parameter-Pruefung.
  //
  // Quelle ist ENTWEDER `daten` (Bytes einer Anlage ohne Datei-Herkunft, etwa
  // ein Bildschirmfoto) ODER `quellPfad` (bestehende Datei). Eine bestehende
  // Datei wird KOPIERT, nie verschoben: Der Anwender hat sie zum Einfuegen
  // gewaehlt, nicht zur Uebergabe, und sein Quell-Ordner bleibt unangetastet.
  handle('attachment:store', async (event, params) => {
    if (!params || typeof params !== 'object') return { ok: false, error: 'invalid-params' };
    const dokumentPfad = typeof params.dokumentPfad === 'string' ? params.dokumentPfad : '';
    const quellPfad = typeof params.quellPfad === 'string' ? params.quellPfad : '';
    const daten = params.daten;
    const vorschlagsName = typeof params.name === 'string' ? params.name : '';
    if (!quellPfad && !(daten instanceof Uint8Array) && !Buffer.isBuffer(daten)) {
      return { ok: false, error: 'invalid-source' };
    }

    const area = areaOfWindow(senderWindow(event));
    const konfig = await resolveAttachmentsConfig(area);
    const ort = attachmentPath.loeseAblageOrt({
      dokumentPfad,
      bereichsWurzel: area ? area.rootPath : null,
      konfig,
    });
    if (!ort.ok) return { ok: false, error: ort.grund };

    // Der Dateiname stammt entweder aus der mitgebrachten Datei oder wird aus
    // Dokumentname und Zeitstempel erzeugt.
    const ausQuelle = bereinigterQuellName(vorschlagsName, quellPfad);
    const basisName =
      ausQuelle ||
      attachmentPath.erzeugeAnlagenNamen({
        dokumentPfad,
        endung: typeof params.endung === 'string' ? params.endung : 'png',
      });

    try {
      await fs.mkdir(ort.verzeichnis, { recursive: true });
      // Belegte Namen EINMAL lesen statt je Kandidat zu statten; der Vergleich
      // laeuft case-insensitiv, weil das Windows-Dateisystem das auch tut und
      // ein nur in der Schreibweise abweichender Name sonst ueberschriebe.
      const vorhanden = new Set();
      try {
        for (const eintrag of await fs.readdir(ort.verzeichnis)) {
          vorhanden.add(eintrag.toLowerCase());
        }
      } catch {
        /* frisch angelegtes oder unlesbares Verzeichnis: nichts ist belegt */
      }
      const name = attachmentPath.freierDateiname({
        verzeichnis: ort.verzeichnis,
        name: basisName,
        existiert: (p) => vorhanden.has(path.basename(p).toLowerCase()),
      });
      if (!name) return { ok: false, error: 'kein-freier-name' };
      const ziel = path.join(ort.verzeichnis, name);
      // Doppelte Absicherung der Grenze: die Pfad-Rechnung hat sie bereits
      // geprueft, der Schreibvorgang prueft das Ergebnis erneut.
      if (!isInsideArea(ort.wurzel, ziel)) return { ok: false, error: 'ausserhalb-der-wurzel' };
      if (quellPfad) {
        // COPYFILE_EXCL: eine bestehende Datei bleibt unangetastet, falls
        // zwischen Namenssuche und Kopie jemand anders geschrieben hat.
        await fs.copyFile(quellPfad, ziel, fs.constants.COPYFILE_EXCL);
      } else {
        await fs.writeFile(ziel, Buffer.from(daten), { flag: 'wx' });
      }
      return {
        ok: true,
        pfad: ziel,
        name,
        verweis: attachmentPath.verweisPfad({ dokumentPfad, zielPfad: ziel }),
      };
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: 'exists' };
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000791 (Epic 3E-000125): Konfigurations-Stand fuer den Einstellungs-Bereich
  // „Anlagen": globale Werte (Store) und Bereichs-Sektion (Bereichsdatei).
  // hasArea/areaName steuern die Bereichs-Gruppe der UI (Muster
  // templates:getConfig).
  handle('attachments:getConfig', async (event) => {
    const area = areaOfWindow(senderWindow(event));
    const areaConfig = area ? await readAreaAttachmentsConfig(area.rootPath) : undefined;
    return {
      ok: true,
      hasArea: !!area,
      areaName: area ? area.name : null,
      global: attachmentPath.normalisiereAnlagenKonfig({
        form: store ? store.get('attachments.form') : null,
        ordnername: store ? store.get('attachments.folder') : null,
      }),
      // Die Bereichs-Sektion bleibt ABSICHTLICH un-normalisiert: Ihr Fehlen ist
      // der Wert „Wie allgemein" und darf nicht zur Voreinstellung normalisiert
      // werden, sonst waere die Uebersteuerung nicht mehr abwaehlbar.
      area: areaConfig || null,
    };
  });

  // 4T-000791: globale Anlagen-Einstellung schreiben.
  handle('attachments:setGlobalConfig', async (_event, config) => {
    if (!store) return { ok: false, error: 'no store' };
    const normalisiert = attachmentPath.normalisiereAnlagenKonfig(config);
    store.set('attachments.form', normalisiert.form);
    store.set('attachments.folder', normalisiert.ordnername);
    return { ok: true };
  });

  // 4T-000791: attachments-Sektion der Bereichsdatei schreiben (config = Objekt)
  // bzw. entfernen (config = null, also „Wie allgemein"). Muster
  // templates:setAreaConfig: die Bereichsdatei entsteht erst beim ersten
  // tatsaechlichen Setzen, eine defekte Bereichsdatei wird nie ueberschrieben.
  handle('attachments:setAreaConfig', async (event, config) => {
    const area = areaOfWindow(senderWindow(event));
    if (!area) return { ok: false, error: 'no area' };
    const mddaPath = path.join(area.rootPath, mddStore.MDDA_FILENAME);
    try {
      let container = mddStore.emptySettingsContainer();
      let raw = null;
      try {
        raw = await fs.readFile(mddaPath, 'utf8');
      } catch (err) {
        if (err && err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const parsed = mddStore.parseSettingsContainer(raw);
        if (!parsed.ok) return { ok: false, error: `mdda defekt: ${parsed.error}` };
        container = parsed.container;
      }
      const normalisiert = config ? attachmentPath.normalisiereAnlagenKonfig(config) : null;
      if (normalisiert) container.settings.attachments = normalisiert;
      else delete container.settings.attachments;
      if (raw === null && !normalisiert) return { ok: true };
      const serialized = mddStore.serializeContainer(container);
      markSelfWriting(mddaPath, serialized);
      await fs.writeFile(mddaPath, serialized, { encoding: 'utf8' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  // 4T-000790 (Epic 3E-000125): Eine Anlage in der Standardanwendung oeffnen.
  //
  // Bewusst ein EIGENER Kanal mit shell.openPath statt einer Lockerung von
  // 'shell:openExternal'. Dessen Beschraenkung auf http/https schuetzt einen
  // anderen Weg (Links aus Dokument-Inhalt ins Netz), und dort bleibt eine
  // file://-URL unerwuenscht. Zwei Grenzen (PO-Festlegung 2026-07-29):
  //
  //   1. Nur innerhalb der geltenden Wurzel — Bereich, sonst Ordner des
  //      Dokuments. Fremder Markdown-Inhalt gilt als nicht vertrauenswuerdig
  //      (Entwicklungsrichtlinien); ohne diese Grenze koennte ein zugespieltes
  //      Dokument auf jede lesbare Datei des Rechners zeigen.
  //   2. Ausfuehrbare Endungen erst nach Rueckfrage mit Name und vollem Pfad,
  //      weil sichtbarer Linktext und tatsaechliches Ziel auseinanderfallen
  //      koennen.
  handle('attachment:open', async (event, params) => {
    if (!params || typeof params !== 'object') return { ok: false, error: 'invalid-params' };
    const zielPfad = typeof params.pfad === 'string' ? params.pfad : '';
    const dokumentPfad = typeof params.dokumentPfad === 'string' ? params.dokumentPfad : '';
    if (!zielPfad) return { ok: false, error: 'invalid-params' };

    const owner = senderWindow(event);
    const area = areaOfWindow(owner);
    const wurzel = area ? area.rootPath : dokumentPfad ? path.dirname(dokumentPfad) : '';
    if (!wurzel || !isInsideArea(wurzel, zielPfad)) {
      return { ok: false, error: 'ausserhalb-der-wurzel' };
    }

    try {
      const stat = await fs.stat(zielPfad);
      if (!stat.isFile()) return { ok: false, error: 'kein-file' };
    } catch {
      return { ok: false, error: 'nicht-gefunden' };
    }

    if (attachmentPath.istAusfuehrbareEndung(zielPfad)) {
      const t = (k) => tForWindow(owner, k);
      const antwort = await dialog.showMessageBox(owner || undefined, {
        type: 'warning',
        title: t('attachments.confirmExecutable.title'),
        message: t('attachments.confirmExecutable.message').replace(
          '{name}',
          path.basename(zielPfad),
        ),
        detail: zielPfad,
        buttons: [
          t('attachments.confirmExecutable.confirm'),
          t('attachments.confirmExecutable.cancel'),
        ],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (antwort.response !== 0) return { ok: false, error: 'abgebrochen' };
    }

    // shell.openPath liefert bei Misserfolg eine nicht-leere Fehlermeldung.
    const fehler = await shell.openPath(zielPfad);
    if (fehler) return { ok: false, error: fehler };
    return { ok: true };
  });
}

module.exports = { registerAttachmentsIpc };
