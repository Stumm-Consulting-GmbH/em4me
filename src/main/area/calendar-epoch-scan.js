// 4T-002003 (Epic 3E-000307): Die gespeicherten Kalender-Werte eines Bereichs,
// die das Nachtragen einer Epoche umdeuten würde.
//
// **Warum im Hauptprozess.** Gezählt wird über jede Datei des Bereichs und über
// die Begleit-Datei jedes Dokuments; Dateizugriff gehört hierher
// (Prozess-Schnitt der Entwicklungsrichtlinien). Der Anzeige-Prozess bekommt
// Zahlen und Fundstellen, nie Datei-Inhalte.
//
// **Warum die Texte aus dem Vorrat der Suche kommen** (`bereichsTexte`), wie bei
// der Tag-Umbenennung (`tag-rename.js`): Geschrieben wird anschließend über die
// Ersetzen-Strecke aus 3E-000169, und die misst jeden Offset gegen genau diesen
// Stand (`suchStandFuer`). Ein eigener Lesevorgang ergäbe Offsets in einem
// Text, den die Strecke nicht kennt, und jede Abweichung fiele erst beim
// Schreiben auf.
//
// **Die Regel selbst steht nicht hier.** Was ein Nachtrag ist und welcher Wert
// betroffen ist, beantwortet `shared/calendar/calendar-epoch-guard.js` — dieselbe
// Antwort, mit der der Anzeige-Prozess die Notizen fortschreibt.
//
// **Keine Obergrenze der Fundstellen**, anders als die Trefferliste der Suche:
// Die Zahl ist die Grundlage einer Rückfrage, und eine gekappte Zahl sagte dem
// Anwender weniger, als tatsächlich umgedeutet würde.
//
// Eigener Zustand: keiner.
'use strict';

const fs = require('node:fs/promises');

const { normalizeCalendarConfig } = require('../../shared/calendar/calendar-config.js');
const {
  epochenNachtraege,
  findeUngesicherte,
} = require('../../shared/calendar/calendar-epoch-guard.js');
const { bereichsTexte } = require('./area-search.js');
// Die Rücknahme-Karte eines bereinigten Textes (4T-001671): Die Offsets
// entstehen im Text ohne Datensatz-Block und müssen in die Datei zurück, weil
// die Ersetzen-Strecke in der Datei schreibt.
const { dateiOffsetVon } = require('./area-search-datensaetze.js');
const { scanneBereich, LESE_BREITE } = require('./area-search-vorrat.js');
const { kopfRelPfad } = require('./area-search-teile.js');
const mddStore = require('../documents/mdd-store.js');

// Die Angaben eines Nachtrags, die über die Brücke reisen. Die normalisierten
// Definitionen bleiben hier: Der Anzeige-Prozess hat sie selbst, und die
// Rückfrage braucht nur Name und Kürzel.
function kopf(nachtrag) {
  return {
    blockId: nachtrag.blockId,
    calId: nachtrag.calId,
    name: nachtrag.name,
    label: nachtrag.label,
  };
}

// Die Notiz eines Dokuments, oder null. Eine fehlende Begleit-Datei ist der
// Regelfall, eine defekte setzt die Notiz-Funktion ohnehin aus (`note:read`
// meldet sie dort); in beiden Fällen gibt es hier keine Notiz zu zählen, und
// der Lauf über den Bereich geht weiter.
async function liesNotiz(mddPfad) {
  let roh;
  try {
    roh = await fs.readFile(mddPfad, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      console.warn('Epochen-Schutz: Begleit-Datei nicht lesbar:', mddPfad, err && err.message);
    }
    return null;
  }
  const geparst = mddStore.parseContainer(roh);
  if (!geparst.ok) return null;
  const notiz = mddStore.getNote(geparst.container);
  return notiz && notiz.text ? notiz.text : null;
}

/**
 * Baut den Ermittler.
 *
 * @param {object} deps
 * @param {(p: string) => string} deps.mddPathFor Pfad der Begleit-Datei, dieselbe
 *   Bildung wie beim Lesen einer Notiz (`note:read`).
 * @returns {{ermittleEpochenSchutz: Function}}
 */
function createEpochenSchutzScan(deps) {
  const mddPathFor = deps && deps.mddPathFor;
  if (typeof mddPathFor !== 'function') {
    throw new TypeError('calendar-epoch-scan: deps.mddPathFor fehlt');
  }

  // Die Notiz-Stellen je Nachtrag über alle Markdown-Dateien des Bereichs.
  // Eigener Scan statt der Einträge des Vorrats: Dort fehlen leere Dokumente,
  // und Teil-Dateien stehen unter ihrem Kopf — eine Notiz hängt aber an jeder
  // Datei. Gelesen wird in Wellen, damit nicht tausend Dateien zugleich offen
  // sind.
  async function notizStellen(wurzel, altKonfig, nachtraege) {
    const { dateien } = await scanneBereich(wurzel);
    const funde = [];
    for (let i = 0; i < dateien.length; i += LESE_BREITE) {
      const welle = dateien.slice(i, i + LESE_BREITE);
      const texte = await Promise.all(welle.map((d) => liesNotiz(mddPathFor(d.abs))));
      for (let k = 0; k < welle.length; k++) {
        if (!texte[k]) continue;
        const stellen = findeUngesicherte(texte[k], altKonfig, nachtraege);
        if (stellen.length > 0) funde.push({ datei: welle[k], stellen });
      }
    }
    return funde;
  }

  /**
   * Die betroffenen Werte des Bereichs je nachgetragener Epoche.
   *
   * @param {string} wurzel Absoluter Pfad der Bereichs-Wurzel.
   * @param {object} auftrag
   * @param {object|null} auftrag.alt Gespeicherte Sektion calendarSystems (roh).
   * @param {object|null} auftrag.neu Anzuwendende Sektion calendarSystems (roh).
   * @param {object|null} auftrag.aktiv { pfad, text } der offenen Datei.
   * @returns {Promise<{vorratModus: string, nachtraege: Array<{blockId: string,
   *   calId: string, name: string, label: string, werte: number|null,
   *   dokumente: number|null}>, dateien: Array<{pfad: string, offsets: number[],
   *   ersetzungen: string[]}>, notizen: Array<{pfad: string, anzahl: number}>}>}
   *   Die Zählungen stehen je Nachtrag, `dateien` und `notizen` EINMAL über alle
   *   Nachträge zusammengeführt (je Pfad ein Eintrag): Geschrieben wird in einem
   *   Lauf, und eine Datei mit Werten zweier Zeitrechnungen soll einmal gesichert
   *   und geschrieben werden. `pfad` ist absolut, `offsets` sind aufsteigende
   *   Datei-Offsets auf das `@`, `ersetzungen` im Gleichschritt der neue Text
   *   der Stelle `@{…}`. Ist der Text des Bereichs nicht vorgehalten
   *   (`vorratModus` nicht 'vorrat'), sind `werte` und `dokumente` null und
   *   beide Listen leer.
   */
  async function ermittleEpochenSchutz(wurzel, auftrag = {}) {
    const altKonfig = normalizeCalendarConfig(auftrag.alt);
    const nachtraege = epochenNachtraege(altKonfig, normalizeCalendarConfig(auftrag.neu));
    if (nachtraege.length === 0) {
      return { vorratModus: 'leer', nachtraege: [], dateien: [], notizen: [] };
    }

    const { modus, eintraege } = await bereichsTexte(wurzel, { aktiv: auftrag.aktiv || null });
    // Ohne vorgehaltenen Text gibt es keinen Stand, gegen den die Strecke
    // schreiben könnte. Die Nachträge kommen trotzdem zurück, damit die
    // Rückfrage sagen kann, dass sie nicht zählen kann — eine leere Liste
    // täuschte «nichts betroffen» vor.
    if (modus !== 'vorrat') {
      return {
        vorratModus: modus,
        nachtraege: nachtraege.map((n) => ({ ...kopf(n), werte: null, dokumente: null })),
        dateien: [],
        notizen: [],
      };
    }

    // Je Nachtrag eine Zählung; eine Stelle findet sie über Block- und
    // Kalender-Kennung, dieselbe Zuordnung wie beim Erkennen des Nachtrags.
    const schluessel = (x) => JSON.stringify([x.blockId, x.calId]);
    const zaehlung = new Map(
      nachtraege.map((n) => [schluessel(n), { ...kopf(n), werte: 0, dokumente: new Set() }]),
    );
    const zaehle = (stelle, dokument) => {
      const z = zaehlung.get(schluessel(stelle));
      z.werte += 1;
      z.dokumente.add(dokument);
    };

    const dateien = new Map();
    for (const eintrag of eintraege) {
      for (const stelle of findeUngesicherte(eintrag.text, altKonfig, nachtraege)) {
        if (!dateien.has(eintrag.kennung)) dateien.set(eintrag.kennung, []);
        dateien.get(eintrag.kennung).push({
          offset: dateiOffsetVon(stelle.offset, eintrag.karte),
          ersatz: stelle.ersatz,
        });
        zaehle(stelle, eintrag.gruppe);
      }
    }

    const notizen = new Map();
    for (const fund of await notizStellen(wurzel, altKonfig, nachtraege)) {
      // Der Pfad des Dokuments, nicht der Begleit-Datei: Lesen und Schreiben
      // einer Notiz nehmen das Dokument entgegen (`note:read`, `note:write`).
      const pfad = fund.datei.abs;
      notizen.set(pfad, (notizen.get(pfad) || 0) + fund.stellen.length);
      // Eine Teil-Datei zählt zu ihrem Dokument, wie in der Trefferliste.
      for (const stelle of fund.stellen) zaehle(stelle, kopfRelPfad(fund.datei.rel));
    }

    return {
      vorratModus: modus,
      nachtraege: [...zaehlung.values()].map((z) => ({ ...z, dokumente: z.dokumente.size })),
      dateien: [...dateien].map(([pfad, stellen]) => {
        // Aufsteigend, mit den Texten im Gleichschritt. Die Fundstellen kommen
        // schon in Text-Reihenfolge, und die Rücknahme-Karte erhält sie; die
        // Sortierung macht die Zusage unabhängig davon.
        stellen.sort((a, b) => a.offset - b.offset);
        return {
          pfad,
          offsets: stellen.map((s) => s.offset),
          ersetzungen: stellen.map((s) => s.ersatz),
        };
      }),
      notizen: [...notizen].map(([pfad, anzahl]) => ({ pfad, anzahl })),
    };
  }

  return { ermittleEpochenSchutz };
}

module.exports = { createEpochenSchutzScan };
