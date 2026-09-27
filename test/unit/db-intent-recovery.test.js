// 4T-001824 (Epic 3E-000254): Der Wiederanlauf eines liegengebliebenen Auftrags —
// die beiden Auslöser und kein dritter, kein Takt, die Aufräum-Sperre, das Zu-Ende-
// Schreiben ohne doppelten Beleg, das Entsorgen von Schattenkopien, die Lage
// «Auftrag hängt», die Fehler-Einspritzung an jedem Schritt der Klammer und das
// unvollständige Protokoll (B6).
//
// **Gearbeitet wird am echten Dateisystem** in temporären Ordnern, mit echter
// Sperr-Verwaltung, echter Klammer und echter Schnittstelle (Muster
// `db-intent-log.test.js`). Ein **Neustart** ist eine neue Sperr-Verwaltung im
// selben Prozess: Sie hat ein leeres Eigen-Register und beurteilt die Sperren der
// alten als Absturz-Rest desselben Rechners, genau wie nach einem echten Absturz.
//
// **Die Fehler-Einspritzung läuft über die Nähte der Klammer** (B3), an sieben
// Stellen und in zwei Spielarten: «werfen» lässt die Naht einen Fehler melden,
// den die Klammer behandelt; «hängen» hält den Auftrag an der Stelle für immer
// an, und der Bestand bleibt so liegen, wie ein Absturz ihn hinterließe, ohne
// jedes Aufräumen der Klammer. Der eine echte Kindprozess-Abbruch steht in
// `db-intent-recovery-absturz.test.js`, die Fälle der Nachschärfung (Befunde 1
// bis 4) in `db-intent-recovery-nachschaerfung.test.js`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  WIEDERANLAUF_LAGEN as L,
  erzeugeWiederanlauf,
} from '../../src/main/database/intent-recovery.js';
import {
  ABSICHT_PRAEFIX,
  erzeugeAbsichtsProtokoll,
  protokollName,
} from '../../src/main/database/intent-log.js';
import { erzeugeSchreibSchnittstelle } from '../../src/main/database/record-auftrag.js';
import { LAGEN } from '../../src/main/database/record-auftrag-pruefung.js';
import { SPERR_FRIST_MS, erzeugeSperrVerwaltung } from '../../src/main/database/lock-lifecycle.js';
import { ART_DATENSATZ, ART_SWEEP, legeSperreAn } from '../../src/main/database/lock-store.js';
import { belegPfadFuer, leseBelegDatei } from '../../src/main/database/change-log.js';
import { vorgangsDateiPfad } from '../../src/main/database/vorgangs-kennung.js';
import { ART_EXTERNAL, ART_UPDATE } from '../../src/shared/database/change-record.js';
import {
  RESTE_MINDESTALTER_MS,
  benenneUmMitWiederholung,
  durchschreibeDatei,
  istAbsichtsSchattenkopie,
} from '../../src/main/documents/atomic-write.js';
import { DEFAULT_LOCK_FOLDER_NAME } from '../../src/shared/database/lock-folder-name.js';

const require = createRequire(import.meta.url);
const { createAreaApps } = require('../../src/main/area/area-apps.js');
const { ermittleHerkunft } = require('../../src/main/herkunft.js');

// --- Bestands-Lesungen im Modulkopf (test/README) --------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function quelltext(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

function jsDateien(verzeichnis) {
  return fs.readdirSync(verzeichnis, { withFileTypes: true }).flatMap((e) => {
    const voll = path.join(verzeichnis, e.name);
    if (e.isDirectory()) return jsDateien(voll);
    return e.name.endsWith('.js') ? [voll] : [];
  });
}

const QUELLEN = jsDateien(path.join(ROOT, 'src'))
  .map((voll) => path.relative(ROOT, voll).split(path.sep).join('/'))
  .filter((rel) => !rel.endsWith('.bundle.js'))
  .map((rel) => ({ rel, text: quelltext(rel) }));
const VERDRAHTUNG = quelltext('src/main/app/wiring.js');

// Treffer außerhalb von Kommentaren (Muster db-sperren-belege-aus-zustand.test.js).
function trefferAusserhalbKommentaren(text, muster) {
  const zeilen = [];
  for (const m of text.matchAll(muster)) {
    const zeilenAnfang = text.lastIndexOf('\n', m.index) + 1;
    if (/(^|\s)(\/\/|\*)/.test(text.slice(zeilenAnfang, m.index))) continue;
    zeilen.push(text.slice(0, m.index).split('\n').length);
  }
  return zeilen;
}

// --- Aufbau ------------------------------------------------------------------------------

let tmpDirs = [];
let verwaltungen = [];

afterEach(async () => {
  for (const v of verwaltungen) await v.gibAllesFrei();
  verwaltungen = [];
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Letzter Ausweg: Temp-Rest bleibt im OS-Temp liegen; unkritisch.
    }
  }
  tmpDirs = [];
});

function bereich() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-wiederanlauf-'));
  tmpDirs.push(wurzel);
  return wurzel;
}

function tabelle(records, lastId) {
  const zeilen = ['---', 'db-table:', '  fields:', '    - name: Name', '    - name: Ort'];
  zeilen.push(`  lastId: ${lastId}`, '---', '', '```perspective-records');
  for (const r of records) zeilen.push(`|- id="${r.id}"`, `| ${r.name}`, `| ${r.ort}`);
  zeilen.push('```', '');
  return zeilen.join('\n');
}

const ANNA = { id: 'r-00001', name: 'Anna', ort: 'Basel' };
const NEU = ['Chur', 'Sion', 'Thun'];
const DREI = ['Kunden.md', 'Orte.md', 'Artikel.md'];
// Die Tabellen eines Protokolls stehen in der Reihenfolge seiner Sperren.
const IN_SPERR_ORDNUNG = ['Artikel.md', 'Kunden.md', 'Orte.md'];
const ZEITPUNKT = '2026-09-23T08:00:00Z';
const HERKUNFT = { benutzer: 'anna', rechner: 'SC-026' };
const KONFIG = { leseKonfig: async () => undefined };

function lege(wurzel, relativ, inhalt) {
  const ziel = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt, 'utf8');
  return ziel;
}

function lies(pfad) {
  return fs.readFileSync(pfad, 'utf8');
}

function aendere(tabelleRel, record, ort) {
  return {
    tabelle: tabelleRel,
    art: 'update',
    id: record.id,
    erwartet: { Name: record.name, Ort: record.ort },
    werte: { Ort: ort },
  };
}

const sperrOrdner = (wurzel) => path.join(wurzel, DEFAULT_LOCK_FOLDER_NAME);
const imSperrOrdner = (wurzel) =>
  fs.existsSync(sperrOrdner(wurzel)) ? fs.readdirSync(sperrOrdner(wurzel)).sort() : [];
const protokolleIn = (wurzel) => imSperrOrdner(wurzel).filter((n) => n.startsWith(ABSICHT_PRAEFIX));
const sperrDateienIn = (wurzel) => imSperrOrdner(wurzel).filter((n) => n.endsWith('.lock'));
const istProtokoll = (pfad) => path.basename(String(pfad)).startsWith(ABSICHT_PRAEFIX);
const absichtsSchattenIn = (wurzel) =>
  fs
    .readdirSync(wurzel)
    .filter(istAbsichtsSchattenkopie)
    .map((n) => path.join(wurzel, n));

function altern(pfad, um = RESTE_MINDESTALTER_MS + 60_000) {
  const alt = new Date(Date.now() - um);
  fs.utimesSync(pfad, alt, alt);
}

const isoVor = (ms) => `${new Date(Date.now() - ms).toISOString().slice(0, 19)}Z`;

function stoerung(code) {
  return Object.assign(new Error(`gestellter Abbruch (${code})`), { code });
}

async function intakteBelege(tabellenPfad) {
  return (await leseBelegDatei(tabellenPfad)).belege.filter((b) => !b.beschaedigt);
}

/**
 * Ein «Prozess»: Sperr-Verwaltung, Klammer, Wiederanlauf und Schnittstelle, so
 * verdrahtet wie in `wiring.js`. Die Nähte der Klammer und des Wiederanlaufs
 * sind einzeln übersteuerbar.
 */
function prozess(o = {}) {
  const verwaltung = erzeugeSperrVerwaltung({ ...KONFIG, ...o.verwaltung });
  verwaltungen.push(verwaltung);
  const klammer = erzeugeAbsichtsProtokoll({
    sperrVerwaltung: o.klammerVerwaltung ? o.klammerVerwaltung(verwaltung) : verwaltung,
    ...KONFIG,
    ...o.klammer,
  });
  const wiederanlauf = erzeugeWiederanlauf({
    sperrVerwaltung: verwaltung,
    ...KONFIG,
    erweiterungAktiv: () => true,
    // 4T-001824 (Nachschärfung): wie in der Verdrahtung.
    laeuft: (vorgang) => klammer.laeuft(vorgang),
    // Dieselbe Herkunft wie die Schnittstelle, die den Halter des Protokolls
    // schreibt; in der Verdrahtung ist es für beide die des Rechners.
    herkunft: () => HERKUNFT,
    ...o.anlauf,
  });
  const schnittstelle = erzeugeSchreibSchnittstelle({
    sperrVerwaltung: verwaltung,
    absichtsProtokoll: klammer,
    wiederanlauf,
    erweiterungAktiv: () => true,
    jetzt: () => ZEITPUNKT,
    herkunft: () => HERKUNFT,
    warteAbstaende: [],
  });
  return {
    verwaltung,
    wiederanlauf,
    raeumeAuf: (wurzel) => wiederanlauf.raeumeAuf(wurzel),
    auftrag: Object.assign(
      (wurzel, anweisungen) => schnittstelle.fuehreAuftragAus(wurzel, { anweisungen }),
      { schnittstelle },
    ),
  };
}

// Die sieben Stellen aus B3 und was danach vom Bestand erwartet wird: vor der
// Marke «unberührt», danach «gewirkt».
const STELLEN = {
  sperren: 'unberuehrt',
  schattenkopien: 'unberuehrt',
  protokoll: 'unberuehrt',
  umbenennen: 'gewirkt',
  mittenUmbenennen: 'gewirkt',
  mittenBelege: 'gewirkt',
  protokollLoeschen: 'gewirkt',
};

/**
 * Die Nähte der Klammer mit einem Abbruch an einer Stelle. «hängen» löst
 * `erreicht` aus und kehrt nie zurück; beim Protokoll schreibt es vorher die
 * halbe Datei, wie ein Absturz mitten im Schreiben sie hinterließe.
 */
function eingespritzt(stelle, art) {
  let melde;
  const erreicht = new Promise((r) => (melde = r));
  const abbruch = () => {
    melde();
    if (art === 'werfen') throw stoerung('EIO');
    return new Promise(() => {});
  };
  const zahl = {};
  const zaehle = (k) => (zahl[k] = (zahl[k] || 0) + 1);
  const fsp = {
    ...fs.promises,
    writeFile: async (pfad, text, ...rest) => {
      if (stelle !== 'protokoll' || !istProtokoll(pfad))
        return fs.promises.writeFile(pfad, text, ...rest);
      if (art === 'haengen')
        await fs.promises.writeFile(pfad, text.slice(0, text.length >> 1), 'utf8');
      return abbruch();
    },
    appendFile: async (...a) =>
      stelle === 'mittenBelege' && zaehle('beleg') === 2 ? abbruch() : fs.promises.appendFile(...a),
    unlink: async (pfad) =>
      stelle === 'protokollLoeschen' && istProtokoll(pfad) ? abbruch() : fs.promises.unlink(pfad),
  };
  const klammer = {
    fsp,
    durchschreiben: async (pfad) =>
      stelle === 'schattenkopien' && !istProtokoll(pfad) && zaehle('schatten') === 2
        ? abbruch()
        : durchschreibeDatei(pfad),
    benenneUm: async (von, nach, opts) => {
      const n = zaehle('umbenennen');
      if ((stelle === 'umbenennen' && n === 1) || (stelle === 'mittenUmbenennen' && n === 2))
        return abbruch();
      return benenneUmMitWiederholung(von, nach, opts);
    },
  };
  const klammerVerwaltung = (v) => ({
    nimmGeordnet: async (wurzel, gegenstaende) => {
      if (stelle !== 'sperren') return v.nimmGeordnet(wurzel, gegenstaende);
      if (art === 'werfen') return abbruch();
      await v.nimmGeordnet(wurzel, gegenstaende);
      return abbruch();
    },
    gibZurueck: (wurzel, genommen) => v.gibZurueck(wurzel, genommen),
  });
  return { erreicht, optionen: { klammer, klammerVerwaltung } };
}

// Ein Auftrag über die gegebenen Tabellen, angehalten an der Stelle; zurück kommt
// das liegende Protokoll. Ohne Stelle hängt er am ersten Umbenennen.
async function liegendesProtokoll(wurzel, tabellen = ['Kunden.md'], stelle = 'umbenennen') {
  const pfade = tabellen.map((rel) => lege(wurzel, rel, tabelle([ANNA], 1)));
  const e = eingespritzt(stelle, 'haengen');
  void prozess(e.optionen).auftrag(
    wurzel,
    tabellen.map((rel, i) => aendere(rel, ANNA, NEU[i])),
  );
  await e.erreicht;
  const pfad = path.join(sperrOrdner(wurzel), protokolleIn(wurzel)[0]);
  return { pfade, pfad, inhalt: JSON.parse(lies(pfad)) };
}

async function erwarteGewirkt(pfade) {
  const vorgaenge = new Set();
  for (const [i, pfad] of pfade.entries()) {
    expect(lies(pfad), pfad).toContain(`| ${NEU[i]}`);
    const belege = await intakteBelege(pfad);
    expect(belege, pfad).toHaveLength(1);
    vorgaenge.add(belege[0].vorgang);
  }
  expect(vorgaenge.size).toBe(1);
}

// Eine Sperre von Hand, wie ein anderer Prozess oder Rechner sie hinterließe.
function fremdeSperre(
  wurzel,
  gegenstand,
  { rechner = 'FREMD-PC', alterMs = 0, pid = 424242 } = {},
) {
  return legeSperreAn(
    wurzel,
    gegenstand,
    { marke: 'fremd', pid },
    { ...KONFIG, herkunft: () => ({ benutzer: 'bert', rechner }), jetzt: () => isoVor(alterMs) },
  );
}

// --- AK8, B3: Fehler-Einspritzung an jedem Schritt ---------------------------------------

describe('Wiederanlauf: Abbruch an jeder Stelle der Klammer (4T-001824, AK8)', () => {
  const FAELLE = Object.keys(STELLEN).flatMap((stelle) => [
    [stelle, 'werfen'],
    [stelle, 'haengen'],
  ]);

  it.each(FAELLE)(
    'AK8 %s (%s): danach vollständig gewirkt oder vollständig unberührt',
    async (stelle, art) => {
      const wurzel = bereich();
      const pfade = DREI.map((rel) => lege(wurzel, rel, tabelle([ANNA], 1)));
      const vorher = pfade.map(lies);
      const anweisungen = DREI.map((rel, i) => aendere(rel, ANNA, NEU[i]));
      const e = eingespritzt(stelle, art);

      const lauf = prozess(e.optionen).auftrag(wurzel, anweisungen);
      if (art === 'werfen') await lauf;
      await e.erreicht;
      // Der Neustart: eine neue Verwaltung, ein neuer Wiederanlauf.
      const neu = prozess();
      expect((await neu.raeumeAuf(wurzel)).ok).toBe(true);

      if (STELLEN[stelle] === 'gewirkt') {
        await erwarteGewirkt(pfade);
        expect(protokolleIn(wurzel)).toEqual([]);
      } else {
        expect(pfade.map(lies)).toEqual(vorher);
        expect(pfade.filter((p) => fs.existsSync(belegPfadFuer(p)))).toEqual([]);
        // Und der Bestand nimmt danach ohne Zutun wieder Aufträge an.
        const folge = await neu.auftrag(wurzel, anweisungen);
        expect(folge.ok, JSON.stringify(folge.lagen)).toBe(true);
        await erwarteGewirkt(pfade);
      }
      // Zurückgelassene Schattenkopien eines Abbruchs vor der Marke verschwinden,
      // sobald sie alt sind; Sperren liegen keine mehr.
      for (const rest of absichtsSchattenIn(wurzel)) altern(rest);
      await neu.raeumeAuf(wurzel);
      expect(absichtsSchattenIn(wurzel)).toEqual([]);
      expect(sperrDateienIn(wurzel)).toEqual([]);
    },
  );
});

// --- AK4, AK5, AK9: zu Ende schreiben, wiederholbar, ohne doppelten Beleg ---------------

describe('Wiederanlauf: zu Ende schreiben (4T-001824, AK4, AK5, AK9)', () => {
  it('AK4 schreibt ein vollständiges Protokoll zu Ende und entfernt Protokoll und Sperren', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, DREI);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse).toEqual([
      expect.objectContaining({
        lage: L.fertiggeschrieben,
        vorgang: liegt.inhalt.vorgang,
        tabellen: IN_SPERR_ORDNUNG,
        umbenennungen: { ausgefuehrt: 3, uebersprungen: 0 },
        belege: { angefuegt: 3, uebersprungen: 0 },
      }),
    ]);
    await erwarteGewirkt(liegt.pfade);
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });

  it('AK4, AK5 führt ein teilweise ausgeführtes Protokoll zu Ende und überspringt Erledigtes', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, DREI);
    // Erledigt: die erste von drei Umbenennungen und der erste von drei Belegen.
    const [erste] = liegt.inhalt.umbenennungen;
    fs.renameSync(erste.von, erste.nach);
    fs.appendFileSync(liegt.inhalt.belege[0].pfad, liegt.inhalt.belege[0].text, 'utf8');

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({
      lage: L.fertiggeschrieben,
      umbenennungen: { ausgefuehrt: 2, uebersprungen: 1 },
      belege: { angefuegt: 2, uebersprungen: 1 },
    });
    await erwarteGewirkt(liegt.pfade);
  });

  it('AK5 unterscheidet Fremd-Beleg und gewöhnlichen Beleg unter derselben Kennung', async () => {
    // Ein erzwungener Auftrag trägt zwei Belege desselben Datensatzes unter
    // einer Vorgangs-Kennung. Angehalten nach dem ersten: Allein das Suchen
    // nach beiden Kennungen hielte den zweiten für angefügt.
    const wurzel = bereich();
    const kunden = lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    fs.writeFileSync(kunden, lies(kunden).replace('| Basel', '| Zug'), 'utf8');
    const e = eingespritzt('mittenBelege', 'haengen');
    void prozess(e.optionen).auftrag(wurzel, [
      { ...aendere('Kunden.md', ANNA, 'Chur'), erzwingen: true },
    ]);
    await e.erreicht;
    expect((await intakteBelege(kunden)).map((b) => b.art)).toEqual([ART_EXTERNAL]);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0].belege).toEqual({ angefuegt: 1, uebersprungen: 1 });
    expect((await intakteBelege(kunden)).map((b) => b.art)).toEqual([ART_EXTERNAL, ART_UPDATE]);
  });

  it.each([
    ['mitten in den Umbenennungen', 'umbenennen', { ausgefuehrt: 2, uebersprungen: 1 }],
    ['mitten in den Belegen', 'beleg', { ausgefuehrt: 0, uebersprungen: 3 }],
  ])(
    'AK9 lässt einen Wiederanlauf, der %s abbricht, vom nächsten zu Ende führen',
    async (_l, wo, zahl) => {
      const wurzel = bereich();
      const liegt = await liegendesProtokoll(wurzel, DREI);
      let n = 0;
      const erster = prozess({
        anlauf: {
          benenneUm: async (von, nach, o) => {
            if (wo === 'umbenennen' && (n += 1) === 2) throw stoerung('EBUSY');
            return benenneUmMitWiederholung(von, nach, o);
          },
          fsp: {
            ...fs.promises,
            appendFile: async (...a) => {
              if (wo === 'beleg' && (n += 1) === 2) throw stoerung('EIO');
              return fs.promises.appendFile(...a);
            },
          },
        },
      });

      const abgebrochen = await erster.raeumeAuf(wurzel);
      expect(abgebrochen.ergebnisse[0]).toMatchObject({
        lage: L.abgebrochen,
        tabellen: IN_SPERR_ORDNUNG,
      });
      expect(protokolleIn(wurzel)).toEqual([path.basename(liegt.pfad)]);
      // Die Sperren sind zurückgegeben, auch nach dem Wurf.
      expect(erster.verwaltung.gehalteneSperren()).toEqual([]);

      const zweiter = await prozess().raeumeAuf(wurzel);
      expect(zweiter.ergebnisse[0]).toMatchObject({
        lage: L.fertiggeschrieben,
        umbenennungen: zahl,
      });
      await erwarteGewirkt(liegt.pfade);
    },
  );
});

// --- AK3, AK10: die Aufräum-Sperre ---------------------------------------------------------

describe('Wiederanlauf: die Aufräum-Sperre (4T-001824, AK3, AK10)', () => {
  it('AK3 lässt von mehreren gleichzeitigen Aufräumern genau einen räumen; die übrigen warten nicht', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, DREI);
    let loslassen;
    const schranke = new Promise((r) => (loslassen = r));
    const umbenannt = vi.fn(async (von, nach, o) => {
      await schranke;
      return benenneUmMitWiederholung(von, nach, o);
    });
    const p = prozess({ anlauf: { benenneUm: umbenannt } });

    const laeufe = [1, 2, 3, 4].map(() => p.raeumeAuf(wurzel));
    const fertig = [];
    laeufe.forEach((lauf, i) => lauf.then(() => fertig.push(i)));
    // Drei sind fertig, während der vierte noch unter der Aufräum-Sperre steht.
    await vi.waitFor(() => expect(fertig).toHaveLength(3));
    loslassen();
    const ergebnisse = await Promise.all(laeufe);

    expect(ergebnisse.map((e) => e.ergebnisse[0].lage).sort()).toEqual([
      L.fertiggeschrieben,
      L.wirdAufgeraeumt,
      L.wirdAufgeraeumt,
      L.wirdAufgeraeumt,
    ]);
    expect(umbenannt).toHaveBeenCalledTimes(3);
    await erwarteGewirkt(liegt.pfade);
  });

  it('AK10 übernimmt eine verwaiste Aufräum-Sperre desselben Rechners ohne laufenden Prozess', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    const gegenstand = { art: ART_SWEEP, id: liegt.inhalt.vorgang };
    await fremdeSperre(wurzel, gegenstand, { rechner: ermittleHerkunft().rechner });
    const p = prozess({
      verwaltung: { prozess: { pid: process.pid, lebt: (pid) => pid === process.pid } },
    });

    expect((await p.raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.fertiggeschrieben);
    expect(imSperrOrdner(wurzel)).toEqual([]);
  });

  it('AK10 bricht eine abgelaufene fremde Aufräum-Sperre und räumt auf', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    const gegenstand = { art: ART_SWEEP, id: liegt.inhalt.vorgang };
    await fremdeSperre(wurzel, gegenstand, { alterMs: SPERR_FRIST_MS + 60_000 });

    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.fertiggeschrieben);
    await erwarteGewirkt(liegt.pfade);
  });

  it('AK10 lässt eine lebende fremde Aufräum-Sperre stehen und räumt nicht', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    const gegenstand = { art: ART_SWEEP, id: liegt.inhalt.vorgang };
    await fremdeSperre(wurzel, gegenstand);

    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.wirdAufgeraeumt);
    expect(protokolleIn(wurzel)).toEqual([path.basename(liegt.pfad)]);
    expect(fs.existsSync(belegPfadFuer(liegt.pfade[0]))).toBe(false);
  });
});

// --- AK6: Schattenkopien eines Abbruchs vor der Marke -----------------------------------

describe('Wiederanlauf: Schattenkopien entsorgen (4T-001824, AK6)', () => {
  it('AK6 entfernt nur eigene, alte, von keinem Protokoll genannte Absichts-Schattenkopien', async () => {
    const wurzel = bereich();
    // Ein liegendes Protokoll, dessen Aufräumen ein lebender Fremder hält: Es
    // bleibt liegen, und seine Schattenkopie mit ihm.
    const liegt = await liegendesProtokoll(wurzel);
    await fremdeSperre(wurzel, { art: ART_SWEEP, id: liegt.inhalt.vorgang });
    const genannt = liegt.inhalt.umbenennungen[0].von;
    altern(genannt);
    const lege1 = (name, alt = true) => {
      const pfad = lege(wurzel, name, 'Rest\n');
      if (alt) altern(pfad);
      return pfad;
    };
    const eigene = [
      lege1('.Kunden.md.em4me-absicht-424242-1'),
      lege1('.Orte.md.em4me-absicht-7-2'),
    ];
    const bleiben = [
      lege1('.Kunden.md.em4me-absicht-x-1'),
      lege1('Kunden.md.em4me-absicht-424242-3'),
      lege1('.Kunden.md.em4me-absicht-424242-4.bak'),
      lege1('.Kunden.md.em4me-neu-424242-5'),
      lege1('.Kunden.md.em4me-absicht-424242-6', false),
      genannt,
    ];
    const ziel = lies(liegt.pfade[0]);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(L.wirdAufgeraeumt);
    expect([...ergebnis.entsorgt].sort()).toEqual([...eigene].sort());
    for (const pfad of eigene) expect(fs.existsSync(pfad), pfad).toBe(false);
    for (const pfad of bleiben) expect(fs.existsSync(pfad), pfad).toBe(true);
    expect(lies(liegt.pfade[0])).toBe(ziel);
  });
});

// --- AK7, AK11: die Lage «Auftrag hängt» -------------------------------------------------

describe('Wiederanlauf: ein hängender Auftrag weist ab (4T-001824, AK7, AK11)', () => {
  it('AK7, AK11 weist die betroffenen Tabellen ab, lässt andere laufen und nimmt nach dem Aufräumen wieder an', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel, ['Kunden.md', 'Orte.md']);
    const artikel = lege(wurzel, 'Artikel.md', tabelle([ANNA], 1));
    const fremd = await fremdeSperre(wurzel, { art: ART_SWEEP, id: liegt.inhalt.vorgang });
    const vorher = lies(liegt.pfade[0]);
    const zaehler = lies(vorgangsDateiPfad(wurzel));
    const p = prozess();

    const abgewiesen = await p.auftrag(wurzel, [aendere('kunden.md', ANNA, 'Genf')]);

    expect(abgewiesen).toMatchObject({ ok: false, code: LAGEN.haengt });
    expect(abgewiesen.lagen).toEqual([
      expect.objectContaining({
        code: LAGEN.haengt,
        tabellen: ['Kunden.md', 'Orte.md'],
        vorgang: liegt.inhalt.vorgang,
        protokoll: liegt.pfad,
        lage: L.wirdAufgeraeumt,
      }),
    ]);
    expect(lies(liegt.pfade[0])).toBe(vorher);
    expect(lies(vorgangsDateiPfad(wurzel))).toBe(zaehler);

    // B5: Eine andere Tabelle desselben Bereichs läuft.
    expect((await p.auftrag(wurzel, [aendere('Artikel.md', ANNA, 'Genf')])).ok).toBe(true);
    expect(lies(artikel)).toContain('| Genf');

    // AK11: Ist das Hindernis fort, räumt der nächste Auftrag auf und läuft.
    fs.unlinkSync(fremd.pfad);
    const danach = await p.auftrag(wurzel, [
      aendere('Kunden.md', { ...ANNA, ort: 'Chur' }, 'Genf'),
    ]);
    expect(danach.ok, JSON.stringify(danach.lagen)).toBe(true);
    expect(lies(liegt.pfade[0])).toContain('| Genf');
    expect(lies(liegt.pfade[1])).toContain('| Sion');
    expect((await intakteBelege(liegt.pfade[0])).map((b) => Number(b.vorgang))).toEqual([
      liegt.inhalt.vorgang,
      danach.vorgang,
    ]);
    expect(protokolleIn(wurzel)).toEqual([]);
  });

  it('AK7 weist ab, wenn der Blick in den Sperr-Ordner scheitert (fail-closed)', async () => {
    const wurzel = bereich();
    lege(wurzel, 'Kunden.md', tabelle([ANNA], 1));
    const fsp = { ...fs.promises, readdir: async () => Promise.reject(stoerung('EACCES')) };

    const ergebnis = await prozess({ anlauf: { fsp } }).auftrag(wurzel, [
      aendere('Kunden.md', ANNA, 'Genf'),
    ]);

    expect(ergebnis).toMatchObject({ ok: false, code: LAGEN.unerwartet });
    expect(lies(path.join(wurzel, 'Kunden.md'))).toContain('| Basel');
  });
});

// --- B6: das unvollständige Protokoll -------------------------------------------------------

describe('Wiederanlauf: das unvollständige Protokoll (4T-001824, B6)', () => {
  function abgerissen(
    wurzel,
    text = '{\n  "schemaVersion": 1,\n  "vorgang": 5,\n  "zeitp',
    alterMs = 0,
  ) {
    const pfad = lege(wurzel, path.join(DEFAULT_LOCK_FOLDER_NAME, protokollName(5)), text);
    if (alterMs > 0) altern(pfad, alterMs);
    return pfad;
  }
  const ALT = SPERR_FRIST_MS + 60_000;

  it('B6 lässt es liegen, solange eine lebende Sperre im Ordner steht, auch wenn es alt ist', async () => {
    const wurzel = bereich();
    const pfad = abgerissen(wurzel, undefined, ALT);
    await fremdeSperre(wurzel, { art: ART_DATENSATZ, tabelle: 'Kunden.md', id: 'r-00001' });

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({ lage: L.schreiberLebt, tabellen: [] });
    expect(fs.existsSync(pfad)).toBe(true);
  });

  it('B6 verwirft es ohne lebenden Halter erst nach der Frist', async () => {
    const wurzel = bereich();
    const pfad = abgerissen(wurzel);
    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.schreiberLebt);
    expect(fs.existsSync(pfad)).toBe(true);

    altern(pfad, ALT);
    expect((await prozess().raeumeAuf(wurzel)).ergebnisse[0].lage).toBe(L.verworfen);
    expect(fs.existsSync(pfad)).toBe(false);
  });

  it('B6 verwirft es sofort, wenn sein Halter derselbe Rechner ohne laufenden Prozess ist', async () => {
    const wurzel = bereich();
    const halter = { rechner: HERKUNFT.rechner, pid: 424242 };
    const pfad = abgerissen(wurzel, JSON.stringify({ schemaVersion: 1, vorgang: 5, halter }));

    const ergebnis = await prozess({ anlauf: { prozessLebt: () => false } }).raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0].lage).toBe(L.verworfen);
    expect(fs.existsSync(pfad)).toBe(false);
  });

  it('B6 verwirft nie ein vollständiges Protokoll einer anderen Schema-Version', async () => {
    const wurzel = bereich();
    const text = JSON.stringify({ schemaVersion: 2, vorgang: 5, umbenennungen: [], belege: [] });
    const pfad = abgerissen(wurzel, text, ALT);
    const schatten = lege(wurzel, '.Kunden.md.em4me-absicht-424242-1', 'Rest\n');
    altern(schatten);

    const ergebnis = await prozess().raeumeAuf(wurzel);

    expect(ergebnis.ergebnisse[0]).toMatchObject({ lage: L.nichtLesbar, grund: 'schema' });
    expect(fs.existsSync(pfad)).toBe(true);
    // Es kann Schattenkopien nennen, die noch gebraucht werden.
    expect(fs.existsSync(schatten)).toBe(true);
  });
});

// --- AK1, AK2: die beiden Auslöser, kein dritter, kein Takt -------------------------------

describe('Wiederanlauf: Auslöser und Takt (4T-001824, AK1, AK2)', () => {
  function bereichsApps(wiederanlauf) {
    const fenster = { isDestroyed: () => false, webContents: { id: 1 } };
    const leer = () => {};
    return createAreaApps({
      appRegistry: {
        findAppByArea: () => 'app-1',
        windowsOf: () => [1],
        appOf: () => 'app-1',
        getArea: () => null,
      },
      getStore: () => null,
      windows: new Map([[1, fenster]]),
      lastReportedPanes: new Map(),
      appLastFocused: new Map(),
      inDenVordergrund: vi.fn(),
      createWindow: leer,
      broadcast: leer,
      persistAllWindows: leer,
      applyMenuToAllWindows: leer,
      broadcastDisplayInfo: leer,
      tForWindow: () => '',
      wiederanlauf,
    });
  }

  it('AK1 räumt beim Öffnen des Bereichs auf, ohne das Öffnen warten zu lassen', async () => {
    const wurzel = bereich();
    const liegt = await liegendesProtokoll(wurzel);
    const echt = prozess().wiederanlauf;
    const gestartet = [];
    const apps = bereichsApps({
      raeumeAuf: (w) => gestartet[gestartet.push(echt.raeumeAuf(w)) - 1],
    });

    expect(await apps.openAreaPath(wurzel, null)).toEqual({ ok: true, focusedExisting: true });
    expect(gestartet).toHaveLength(1);
    expect((await gestartet[0]).ergebnisse[0].lage).toBe(L.fertiggeschrieben);
    await erwarteGewirkt(liegt.pfade);
  });

  it('AK1 öffnet auch, wenn der Wiederanlauf nie endet oder scheitert', async () => {
    const wurzel = bereich();
    const nie = bereichsApps({ raeumeAuf: () => new Promise(() => {}) });
    const scheitert = bereichsApps({ raeumeAuf: async () => Promise.reject(stoerung('EIO')) });

    expect((await nie.openAreaPath(wurzel, null)).ok).toBe(true);
    expect((await scheitert.openAreaPath(wurzel, null)).ok).toBe(true);
  });

  it('AK1 ruft den Wiederanlauf an genau zwei Stellen des Produkt-Codes', () => {
    const aufrufe = QUELLEN.flatMap(({ rel, text }) =>
      trefferAusserhalbKommentaren(text, /\.raeumeAuf\s*\(/g).map(() => rel),
    ).sort();
    expect(aufrufe).toEqual(['src/main/area/area-apps.js', 'src/main/database/record-auftrag.js']);
    expect(QUELLEN.length).toBeGreaterThan(400);
    // Gegenprobe an einem erfundenen dritten Aufrufer.
    expect(trefferAusserhalbKommentaren('await w.raeumeAuf(r);', /\.raeumeAuf\s*\(/g)).toHaveLength(
      1,
    );
  });

  it('AK2 setzt in Wiederanlauf und Klammer keinen Zeitgeber', () => {
    for (const rel of ['src/main/database/intent-recovery.js', 'src/main/database/intent-log.js']) {
      const text = quelltext(rel);
      expect(text.length, rel).toBeGreaterThan(2000);
      for (const muster of [/\bsetTimeout\b/g, /\bsetInterval\b/g, /\bsetImmediate\b/g])
        expect(trefferAusserhalbKommentaren(text, muster), `${rel} ${muster}`).toEqual([]);
    }
    expect(trefferAusserhalbKommentaren('setInterval(f, 10);', /\bsetInterval\b/g)).toHaveLength(1);
  });

  it('bekommt in der Verdrahtung dieselbe Sperr-Verwaltung und dasselbe Tor wie die Schnittstelle', () => {
    expect(VERDRAHTUNG.match(/erzeugeWiederanlauf\(/g)).toHaveLength(1);
    expect(VERDRAHTUNG).toMatch(
      /erzeugeWiederanlauf\(\{\s*\n\s*sperrVerwaltung,\s*\n\s*leseKonfig: [^\n]*\n\s*erweiterungAktiv: datenbankAktiv,/,
    );
    expect(VERDRAHTUNG).toMatch(
      /absichtsProtokoll,\s*\n\s*wiederanlauf,\s*\n\s*erweiterungAktiv: datenbankAktiv,/,
    );
    expect(VERDRAHTUNG).toMatch(/createAreaApps\(\{[\s\S]*?\n\s*wiederanlauf,\n\s*\}\);/);
  });

  it('verweigert den Aufbau ohne Verwaltung, ohne Konfigurations-Leser und ohne Wiederanlauf', () => {
    const verwaltung = erzeugeSperrVerwaltung(KONFIG);
    expect(() => erzeugeWiederanlauf({ ...KONFIG })).toThrow(TypeError);
    expect(() => erzeugeWiederanlauf({ sperrVerwaltung: verwaltung })).toThrow(TypeError);
    expect(() => erzeugeWiederanlauf({ sperrVerwaltung: verwaltung, ...KONFIG, uhr: 5 })).toThrow(
      TypeError,
    );
    expect(() =>
      erzeugeSchreibSchnittstelle({
        sperrVerwaltung: verwaltung,
        absichtsProtokoll: erzeugeAbsichtsProtokoll({ sperrVerwaltung: verwaltung, ...KONFIG }),
        erweiterungAktiv: () => true,
      }),
    ).toThrow(TypeError);
  });
});
