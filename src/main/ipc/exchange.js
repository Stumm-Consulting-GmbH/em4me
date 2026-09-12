// 4T-001587 und 4T-001588 (Story 4S-000904, Epic 3E-000160): Kanal-Gruppe des
// Ex- und Imports der eigenen Einrichtung. Kanäle: exchange:list,
// exchange:build, exchange:openDialog, exchange:plan, exchange:apply.
//
// Das Sammeln liegt hier und nicht im Anzeige-Prozess, weil die globalen Werte
// allein der Hauptprozess hält (Befund B1 der Konzept-Stufe,
// `src/main/app/settings-store.js:115-176`) und die bereichsgebundenen
// Kalender-Systeme aus der Bereichsdatei kommen (Befund B3). Der Renderer
// bekommt für die Auswahl-Liste nur Kennung, Beschriftungs-Schlüssel und
// Anzahl — nie die Werte selbst; die Datei entsteht fertig hier.
//
// **Für das Einlesen gilt dasselbe in der Gegenrichtung:** Der Renderer sieht
// den Plan — was ergänzt, was ersetzt, was umbenannt und was übersprungen wird
// —, nie die Werte. Geschrieben wird ausschließlich hier und ausschließlich
// über die bestehenden Wege (`settings-verteilung.js` für den globalen
// Speicher, `writeAreaCalendarConfig` für die Bereichsdatei).
//
// Eigener Zustand: **eine** Ablage, der bestätigte Plan je Fenster. Sie ist
// unvermeidlich und bewusst klein — die Begründung steht bei `plaene`.
'use strict';

const fs = require('node:fs/promises');
const { collectDataKinds, buildExchangeSections } = require('../../shared/exchange-collect');
const { EXCHANGE_KIND, DATA_KIND_IDS } = require('../../shared/exchange-data-kinds');
const {
  writeExchangeFile,
  readExchangeFile,
  FORMAT_VERSION,
} = require('../../shared/exchange-file');
const { planeUebernahme, planSignatur } = require('../../shared/exchange-merge');
const {
  createSettingsVerteilung,
  verteilSchluesselUnter,
  VERTEIL_SCHLUESSEL,
} = require('./settings-verteilung');

/**
 * Registriert die Kanäle des Einrichtungs-Austauschs.
 *
 * @param {(channel: string, listener: Function) => void} handle Registrier-Funktion aus main.js.
 * @param {object} deps Abhängigkeiten aus main.js.
 * @param {object} deps.dialog Electron-Dialoge (Öffnen-Dialog des Einlesens).
 * @param {() => object|null} deps.getStore Globaler Einstellungs-Speicher.
 * @param {(event: object) => object|null} deps.senderWindow Fenster des Absenders.
 * @param {(win: object) => object|null} deps.areaOfWindow Bereichs-Bindung eines Fensters.
 * @param {(rootPath: string) => Promise<*>} deps.readAreaCalendarConfig Kalender-Sektion lesen.
 * @param {(rootPath: string, config: *) => Promise<object>} deps.writeAreaCalendarConfig Kalender-Sektion schreiben.
 * @param {(channel: string, ...args: any[]) => void} deps.broadcast Meldung an alle Fenster.
 * @param {(win: object, key: string) => string} deps.tForWindow Übersetzung im Fenster-Kontext.
 * @param {() => string} deps.fullVersion Volle Anzeige-Version.
 * @param {object} deps.app Electron-App (Produkt-Name der Herkunft).
 */
function registerExchangeIpc(handle, deps) {
  const {
    dialog,
    getStore,
    senderWindow,
    areaOfWindow,
    readAreaCalendarConfig,
    writeAreaCalendarConfig,
    broadcast,
    tForWindow,
    fullVersion,
    app,
  } = deps;

  // Dieselbe Verteilung, die auch `settings:set` fährt. Kein zweiter Weg.
  const verteileEinstellung = createSettingsVerteilung(deps);

  // Der bestätigte Plan je Fenster, zwischen Vorschau und Übernahme.
  //
  // **Warum überhaupt eine Ablage.** Der Anwender bestätigt eine Liste von
  // Wirkungen. Läse `exchange:apply` die Datei erneut, könnte sie inzwischen
  // eine andere sein — und ausgeführt würde etwas, das niemand gesehen hat.
  // Der Inhalt wird deshalb festgehalten. Der IST-Stand wird dagegen frisch
  // erhoben und der Plan neu gerechnet: Hat ein anderes Fenster inzwischen
  // etwas geändert, weicht die Signatur ab, und es wird gemeldet statt
  // geschrieben. Ein stiller Teil-Import ist ausgeschlossen (Z3) — das gilt
  // auch für den Fall, dass er auf einen anderen Bestand träfe.
  //
  // Ein Eintrag je Fenster, überschrieben von der nächsten Vorschau; er hält
  // nur, was ohnehin schon in einer Datei des Anwenders steht.
  const plaene = new Map();

  // Die Lage eines Fensters: was es ausgeben könnte. Beide Ausgabe-Kanäle
  // sammeln frisch statt einen Stand zu halten — zwischen Auswahl und Ausgabe
  // kann der Anwender in einem anderen Fenster etwas geändert haben, und
  // ausgegeben wird, was im Augenblick der Ausgabe gilt.
  async function sammle(event) {
    const store = getStore();
    const area = areaOfWindow(senderWindow(event));
    return collectDataKinds({
      readPath: (pfad) => (store ? store.get(pfad) : undefined),
      readAreaSection: area
        ? (sektion) =>
            sektion === 'calendarSystems' ? readAreaCalendarConfig(area.rootPath) : undefined
        : null,
    });
  }

  // Auswahl-Grundlage der Ausgabe. Geliefert wird nur, was tatsächlich etwas
  // enthält: Eine Zeile «0 Einträge» verspräche dem Anwender Inhalt, wo keiner
  // ist, und eine Auswahl darauf endete in einem leeren Abschnitt.
  //
  // 4T-001590: `entries` trägt die einzeln wählbaren Einträge einer Datenart
  // — heute die Zeitrechnungs-Blöcke der Kalender-Systeme. Auch hier bekommt
  // der Renderer nur Kennung, Name und Zahl, nie die Werte.
  handle('exchange:list', async (event) => {
    const gesammelt = await sammle(event);
    return {
      ok: true,
      kinds: gesammelt
        .filter((k) => k.hasValues)
        .map((k) => ({
          id: k.id,
          labelKey: k.labelKey,
          count: k.count,
          entries: k.entries || null,
        })),
    };
  });

  // Baut den Text der Austausch-Datei. Geschrieben wird er nicht hier: Der
  // Renderer führt ihn über den bestehenden Speichern-Weg (`file:saveAs`), wie
  // der portable Markdown-Export. Damit gibt es einen Schreib-Weg für Dateien
  // des Anwenders und nicht zwei.
  //
  // 4T-001590: Ein Auswahl-Element ist eine Kennung oder ein Paar
  // `{ id, entries }`; welche Formen gültig sind, prüft `buildExchangeSections`
  // und nicht dieser Kanal — die Kenntnis der Datenarten liegt dort.
  handle('exchange:build', async (event, auswahl) => {
    if (!Array.isArray(auswahl)) return { ok: false, error: 'invalid-selection' };
    const owner = senderWindow(event);
    const gesammelt = await sammle(event);
    const abschnitte = buildExchangeSections(gesammelt, auswahl, (key) => tForWindow(owner, key));
    if (!abschnitte.ok) return abschnitte;
    return writeExchangeFile({
      kind: EXCHANGE_KIND,
      sections: abschnitte.sections,
      origin: { program: app.getName(), version: fullVersion() },
    });
  });

  // --- 4T-001588: Einlesen -----------------------------------------------------

  // Öffnen-Dialog des Einlesens. **Bewusst nicht `file:openDialog`:** Jener
  // Weg zieht in einer Bereichs-App die harte Bereichsgrenze und weist jede
  // Datei ausserhalb der Bereichs-Wurzel ab (`files.js:92-107`, `:124`). Eine
  // Einrichtungs-Datei liegt aber typischerweise genau dort — auf einem Stick,
  // im Download-Ordner, auf einem Netzlaufwerk —, und die Funktion waere in
  // einer Bereichs-App unbenutzbar.
  //
  // Die Bereichsgrenze bleibt davon unberuehrt: Sie schuetzt den DOKUMENT-Raum
  // des Bereichs, und die Austausch-Datei wird nicht als Dokument geoeffnet,
  // sondern als Eingabe gelesen. Ihr Inhalt erreicht den Anzeige-Prozess nie,
  // und geschrieben wird ausschliesslich in die Ziele der Datenarten. Muster
  // eines Dialogs ohne Bereichsgrenze: `profiles:chooseFolder`
  // (`profiles.js:331`).
  handle('exchange:openDialog', async (event) => {
    const owner = senderWindow(event);
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: tForWindow(owner, 'exchange.import.dialogTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: tForWindow(owner, 'dialog.filterMarkdown'),
          extensions: ['md', 'markdown', 'mdown', 'mkd'],
        },
        { name: tForWindow(owner, 'dialog.filterAll'), extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  // Liest eine Datei und macht ihre Abschnitte zugänglich. Fehler werden
  // gemeldet, nicht geworfen ({ok,error}-Muster der bestehenden Datei-Wege).
  async function liesAustauschDatei(dateiPfad) {
    let roh;
    try {
      roh = await fs.readFile(dateiPfad, 'utf8');
    } catch {
      return { ok: false, error: 'unreadable' };
    }
    // Wie `file:read`: BOM entfernen, Zeilenenden auf LF normalisieren. Eine
    // von Hand nachbearbeitete Datei kann beides mitbringen.
    const text = roh.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const gelesen = readExchangeFile(text, { knownSections: DATA_KIND_IDS });
    if (!gelesen.ok) return gelesen;
    if (gelesen.kind !== EXCHANGE_KIND) return { ok: false, error: 'wrong-kind' };
    return gelesen;
  }

  // Wirkt ein geschriebener Pfad sofort, oder erst beim nächsten Start? Die
  // Frage hängt daran, ob der Pfad oder einer seiner Kind-Schlüssel einen
  // Verteil-Zweig hat. Sie wird beantwortet statt verschwiegen: Der Bericht
  // sagt dem Anwender, dass ein Teil erst nach einem Neustart greift.
  function wirktSofort(pfad) {
    return verteilSchluesselUnter(pfad).length > 0 || VERTEIL_SCHLUESSEL.includes(pfad);
  }

  // Vorschau: lesen, prüfen, planen — und nichts schreiben.
  handle('exchange:plan', async (event, dateiPfad) => {
    if (typeof dateiPfad !== 'string' || dateiPfad === '') {
      return { ok: false, error: 'invalid-path' };
    }
    const gelesen = await liesAustauschDatei(dateiPfad);
    if (!gelesen.ok) return gelesen;

    const gesammelt = await sammle(event);
    const plan = planeUebernahme(gesammelt, gelesen.sections);

    const owner = senderWindow(event);
    const hatBereich = !!areaOfWindow(owner);
    // Eine bereichsgebundene Datenart ohne offenen Bereich kann nirgends
    // hingeschrieben werden. Sie wird benannt, nicht still weggelassen.
    for (const eintrag of plan.kinds) {
      if (eintrag.areaSection && !hatBereich) {
        eintrag.action = 'skip';
        eintrag.grund = 'no-area';
        eintrag.values = {};
      }
    }

    const nurNachNeustart = [];
    for (const eintrag of plan.kinds) {
      if (eintrag.action === 'skip' || eintrag.areaSection) continue;
      for (const pfad of Object.keys(eintrag.values)) {
        if (!wirktSofort(pfad) && !nurNachNeustart.includes(eintrag.id)) {
          nurNachNeustart.push(eintrag.id);
        }
      }
    }

    const signatur = planSignatur(plan);
    if (owner) {
      plaene.set(owner.id, { dateiPfad, sections: gelesen.sections, signatur });
    }

    return {
      ok: true,
      formatVersion: gelesen.formatVersion,
      eigeneFassung: FORMAT_VERSION,
      neuereFassung: gelesen.formatVersion > FORMAT_VERSION,
      created: gelesen.created,
      origin: gelesen.origin,
      unknownSections: plan.unknownSections,
      nurNachNeustart,
      // Der Renderer bekommt den Plan OHNE die Werte.
      kinds: plan.kinds.map((k) => ({
        id: k.id,
        labelKey: k.labelKey,
        action: k.action,
        grund: k.grund || null,
        hinzu: k.hinzu,
        uebersprungen: k.uebersprungen,
        umbenannt: k.umbenannt,
        abgewiesen: k.abgewiesen || [],
        ersetzt: k.ersetzt.length,
        verworfen: k.verworfen,
      })),
    };
  });

  // Übernahme: genau der bestätigte Plan, oder gar nichts.
  handle('exchange:apply', async (event) => {
    const owner = senderWindow(event);
    const gemerkt = owner ? plaene.get(owner.id) : null;
    if (!gemerkt) return { ok: false, error: 'no-plan' };

    const gesammelt = await sammle(event);
    const plan = planeUebernahme(gesammelt, gemerkt.sections);
    const area = areaOfWindow(owner);
    for (const eintrag of plan.kinds) {
      if (eintrag.areaSection && !area) {
        eintrag.action = 'skip';
        eintrag.grund = 'no-area';
        eintrag.values = {};
      }
    }
    // Der Bestand hat sich zwischen Vorschau und Klick geändert: Was jetzt
    // geschähe, ist nicht, was bestätigt wurde.
    if (planSignatur(plan) !== gemerkt.signatur) {
      return { ok: false, error: 'plan-changed' };
    }
    plaene.delete(owner.id);

    const store = getStore();
    const bericht = [];
    for (const eintrag of plan.kinds) {
      if (eintrag.action === 'skip') {
        bericht.push({ ...ohneWerte(eintrag), uebernommen: false });
        continue;
      }
      try {
        if (eintrag.areaSection) {
          const ergebnis = await writeAreaCalendarConfig(
            area.rootPath,
            eintrag.values[eintrag.areaSection],
          );
          if (!ergebnis.ok) {
            bericht.push({ ...ohneWerte(eintrag), uebernommen: false, fehler: ergebnis.error });
            continue;
          }
          broadcast('calendar:changed', { rootPath: area.rootPath });
        } else {
          for (const [pfad, wert] of Object.entries(eintrag.values)) {
            if (store) store.set(pfad, wert);
            verteileEinstellung(pfad, wert, null);
            // Der geschriebene Pfad kann gröber sein als die Verteil-Zweige
            // (`sidebar` gegen `sidebar.layout`); die Kind-Schlüssel ziehen
            // mit, sonst bliebe das Eingelesene bis zum Neustart unsichtbar.
            for (const kind of verteilSchluesselUnter(pfad)) {
              verteileEinstellung(kind, store ? store.get(kind) : undefined, null);
            }
          }
        }
        bericht.push({ ...ohneWerte(eintrag), uebernommen: true });
      } catch (err) {
        // Kein stiller Abbruch: Was bis hierher übernommen wurde und was
        // nicht, steht vollständig im Bericht (AK9).
        bericht.push({
          ...ohneWerte(eintrag),
          uebernommen: false,
          fehler: err && err.message ? err.message : String(err),
        });
      }
    }

    return { ok: true, kinds: bericht, unknownSections: plan.unknownSections };
  });

  // Der Bericht trägt dieselben Angaben wie die Vorschau — und wie dort ohne
  // die Werte selbst.
  function ohneWerte(eintrag) {
    return {
      id: eintrag.id,
      labelKey: eintrag.labelKey,
      action: eintrag.action,
      grund: eintrag.grund || null,
      hinzu: eintrag.hinzu,
      uebersprungen: eintrag.uebersprungen,
      umbenannt: eintrag.umbenannt,
      abgewiesen: eintrag.abgewiesen || [],
      ersetzt: eintrag.ersetzt.length,
      verworfen: eintrag.verworfen,
    };
  }
}

module.exports = { registerExchangeIpc };
