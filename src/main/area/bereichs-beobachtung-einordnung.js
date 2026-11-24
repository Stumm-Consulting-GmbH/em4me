// 4T-002829 (Epic 3E-000446): Einordnung der Meldungen des Betriebssystems und
// vollständiger Abgleich der gemeinsamen Bereichs-Beobachtung
// (bereichs-beobachtung.js).
//
// Die Methoden hängen am Prototyp des Beobachters (`Object.assign`) und lesen
// dessen Zustand über `this`: Abbild, gesammelte Meldungen, Schreib-Ende,
// Überwachungen und Verbraucher. Herausgeschnitten nach Fachlichkeit, weil die
// Datei des Beobachters sonst das Budget der Datei-Größen überschritte.
//
// Einordnung: Eine Meldung wird nach SAMMEL_MS mit einer Datei-Abfrage gegen
// das Abbild gehalten und als `add`, `change`, `unlink`, `addDir` oder
// `unlinkDir` gemeldet; eine Datei erst nach SCHREIB_ENDE_MS ohne Änderung.
// Meldungen aus ausgeschlossenen Teilbäumen kosten je Teilbaum und
// Sammel-Fenster höchstens eine Abfrage, Meldungen unterhalb der Tiefen-Grenze
// keine (Auflagen 3 und 4 der Plan-Freigabe vom 2026-11-23).
'use strict';

const path = require('node:path');
const { isIgnoredDirName } = require('../index/scan.js');
const {
  teileVon,
  ausgeschlossenerTeilbaum,
  tiefeVon,
  schliesseStill,
  UNBEKANNT,
} = require('./bereichs-beobachtung-baum.js');

// Schreib-Ende: so lange müssen Größe und Änderungszeit einer Datei stabil
// sein, bevor sie sich meldet (bisher chokidar awaitWriteFinish, 200 ms).
const SCHREIB_ENDE_MS = 200;
// Meldungen des Betriebssystems werden so lange gesammelt, bevor sie
// eingeordnet werden; ein Speichervorgang erzeugt oft mehrere je Datei.
const SAMMEL_MS = 50;
// Ein Schreib-Ende, dessen Datei vorübergehend nicht abfragbar ist, versucht
// es so oft mit verdoppelter Pause und überlässt sie danach dem gedrosselten
// Abgleich (Zweitblick und Sicherheits-Review, Runde 3).
const SCHREIB_ENDE_VERSUCHE = 5;

const EINORDNUNG = {
  vormerken(p, art) {
    let arten = this.gesammelt.get(p);
    if (!arten) {
      arten = new Set();
      this.gesammelt.set(p, arten);
    }
    arten.add(art);
    // Zeitpunkt der letzten Meldung je Pfad: Ein vollständiger Abgleich, der
    // vorher begonnen hat, kennt den Stand dieses Pfades nicht (gleicheAb).
    this.letzteMeldung.set(p, Date.now());
    if (!this.bereit || this.sammelTimer) return;
    this.sammelTimer = setTimeout(() => {
      this.sammelTimer = null;
      this.verarbeiteGesammelt();
    }, SAMMEL_MS);
  },

  verarbeiteGesammelt() {
    if (this.geschlossen) return;
    const eintraege = [...this.gesammelt];
    this.gesammelt.clear();
    // Ausgeschlossene Teilbäume: je Teilbaum eine Einordnung (Auflage 3).
    const teilbaeume = new Map();
    for (const [p, arten] of eintraege) {
      const teile = teileVon(this.wurzel, p);
      if (!teile || teile.length === 0) continue;
      if (teile.some((teil) => isIgnoredDirName(teil))) {
        if (!arten.has('rename')) continue; // reine Inhalts-Änderung
        const teilbaum = ausgeschlossenerTeilbaum(this.wurzel, teile);
        // Auch hier zuerst die Tiefen-Grenze, allein am Pfad (Auflage 4).
        if (tiefeVon(this.wurzel, teilbaum) > this.maxTiefe) continue;
        teilbaeume.set(teilbaum, true);
        continue;
      }
      // Unterhalb der Tiefen-Grenze: allein am Pfad verworfen (Auflage 4).
      if (teile.length - 1 > this.maxTiefe) continue;
      void this.ordneEin(p, arten);
    }
    for (const t of teilbaeume.keys()) void this.ordneTeilbaumEin(t);
    // Ohne laufenden Abgleich braucht niemand die Meldungs-Zeiten; ein später
    // beginnender Abgleich liegt ohnehin nach ihnen.
    if (!this.abgleichLaeuft) this.letzteMeldung.clear();
  },

  async ordneTeilbaumEin(t) {
    const st = await this.lstatBegrenzt(t);
    if (this.geschlossen || st === UNBEKANNT) return;
    if (!st) this.melde('unlink', t);
    else this.melde(st.isDirectory() ? 'addDir' : 'add', t);
  },

  async ordneEin(p, arten) {
    let st = await this.lstatBegrenzt(p);
    if (this.geschlossen) return;
    // Vorübergehend nicht abfragbar: Der Eintrag bleibt, wie er ist, und ein
    // gedrosselter Abgleich bringt Klarheit, auch auf einer Wurzel ohne Takt
    // (Zweitblick, Runde 3, Hinweis 5).
    if (st === UNBEKANNT) {
      this.fordereAbgleichAn();
      return;
    }
    const alt = this.abbild.get(p);
    // Windows und macOS unterscheiden die Schreibung nicht: Nach dem
    // Umbenennen von «a.md» in «A.md» findet lstat den alten Namen noch. Bei
    // einer Umbenennungs-Meldung für einen bekannten Pfad zählt deshalb, ob
    // der Name in dieser Schreibung im Ordner steht (Zweitblick 8).
    if (st && alt && arten && arten.has('rename') && this.schreibungEgal()) {
      const namen = await this.leseNamenBegrenzt(path.dirname(p));
      if (this.geschlossen) return;
      if (namen && !namen.includes(path.basename(p))) st = null;
    }
    if (!st) {
      if (alt) this.entferne(p, alt);
      return;
    }
    if (st.isDirectory()) {
      if (alt && !alt.ordner) this.entferne(p, alt);
      if (alt && alt.ordner) return;
      await this.ordnerNeu(p);
      return;
    }
    if (alt && alt.ordner) this.entferne(p, alt);
    const bekannt = alt && !alt.ordner;
    if (bekannt && alt.groesse === st.size && alt.mtimeMs === st.mtimeMs) return;
    this.warteSchreibEnde(p, bekannt ? 'change' : 'add', st);
  },

  async ordnerNeu(p) {
    const eintrag = { ordner: true, groesse: 0, mtimeMs: 0 };
    this.abbild.set(p, eintrag);
    this.ueberwacheOrdner(p);
    this.melde('addDir', p);
    if (tiefeVon(this.wurzel, p) >= this.maxTiefe) return;
    const neu = new Map();
    try {
      // Mit der Grenze des Meldungs-Wegs: Auch ein großer eingeschobener
      // Ordner hält nicht mehr Abfragen zugleich (Zweitblick, Runde 2).
      await this.leseBaum(p, neu, true, null, this.grenze);
    } catch {
      return; // schon wieder weg; die Meldung des Entfernens folgt
    }
    // Während des Laufs entfernt oder ersetzt: nichts darunter eintragen.
    if (this.geschlossen || this.abbild.get(p) !== eintrag) return;
    const sortiert = [...neu].sort((a, b) => a[0].length - b[0].length);
    for (const [q, e] of sortiert) {
      if (this.abbild.has(q)) continue;
      if (e.ordner) {
        this.abbild.set(q, e);
        this.melde('addDir', q);
      } else {
        this.warteSchreibEnde(q, 'add', { size: e.groesse, mtimeMs: e.mtimeMs });
      }
    }
  },

  // Entfernt einen Eintrag samt allem darunter, Dateien vor ihren Ordnern.
  entferne(p, alt) {
    this.vergissSchreibEnde(p);
    if (!alt.ordner) {
      this.abbild.delete(p);
      this.melde('unlink', p);
      return;
    }
    const praefix = p + path.sep;
    const darunter = [];
    for (const [q, e] of this.abbild) if (q.startsWith(praefix)) darunter.push([q, e]);
    darunter.sort((a, b) => b[0].length - a[0].length);
    for (const [q, e] of darunter) {
      this.abbild.delete(q);
      this.vergissUeberwachung(q);
      this.melde(e.ordner ? 'unlinkDir' : 'unlink', q);
    }
    for (const q of [...this.schreibEnde.keys()])
      if (q.startsWith(praefix)) this.vergissSchreibEnde(q);
    this.abbild.delete(p);
    this.vergissUeberwachung(p);
    this.melde('unlinkDir', p);
  },

  vergissUeberwachung(p) {
    if (p === this.wurzel) return;
    const w = this.ueberwachungen.get(p);
    if (!w) return;
    schliesseStill(w);
    this.ueberwachungen.delete(p);
  },

  vergissSchreibEnde(p) {
    const e = this.schreibEnde.get(p);
    if (!e) return;
    clearTimeout(e.timer);
    this.schreibEnde.delete(p);
  },

  // Meldet eine Datei erst, wenn Größe und Zeit SCHREIB_ENDE_MS stabil sind.
  warteSchreibEnde(p, art, st) {
    const vorher = this.schreibEnde.get(p);
    if (vorher) clearTimeout(vorher.timer);
    const eintrag = {
      art: vorher && vorher.art === 'add' ? 'add' : art,
      groesse: st.size,
      mtimeMs: st.mtimeMs,
      timer: null,
    };
    eintrag.timer = setTimeout(() => void this.pruefeSchreibEnde(p, eintrag), this.schreibEndeMs());
    this.schreibEnde.set(p, eintrag);
  },

  async pruefeSchreibEnde(p, eintrag) {
    if (this.geschlossen || this.schreibEnde.get(p) !== eintrag) return;
    const st = await this.lstatBegrenzt(p);
    if (this.geschlossen || this.schreibEnde.get(p) !== eintrag) return;
    if (st === UNBEKANNT) {
      // Vorübergehend nicht abfragbar: mit verdoppelter Pause erneut, nach
      // SCHREIB_ENDE_VERSUCHE Versuchen dem gedrosselten Abgleich überlassen.
      const versuch = (eintrag.versuch || 0) + 1;
      if (versuch > SCHREIB_ENDE_VERSUCHE) {
        this.schreibEnde.delete(p);
        this.fordereAbgleichAn();
        return;
      }
      const neu = { ...eintrag, versuch, timer: null };
      neu.timer = setTimeout(
        () => void this.pruefeSchreibEnde(p, neu),
        this.schreibEndeMs() * 2 ** versuch,
      );
      this.schreibEnde.set(p, neu);
      return;
    }
    if (!st || st.isDirectory()) {
      // Weg oder keine Datei mehr: die Einordnung übernimmt der Rest.
      this.schreibEnde.delete(p);
      this.vormerken(p, 'rename');
      return;
    }
    if (st.size !== eintrag.groesse || st.mtimeMs !== eintrag.mtimeMs) {
      this.warteSchreibEnde(p, eintrag.art, st);
      return;
    }
    this.schreibEnde.delete(p);
    const alt = this.abbild.get(p);
    const art = alt && !alt.ordner ? 'change' : 'add';
    this.abbild.set(p, { ordner: false, groesse: st.size, mtimeMs: st.mtimeMs });
    this.melde(art, p);
  },

  // Ist ein Pfad oder einer seiner Ordner nach `start` gemeldet worden oder
  // wartet noch auf seine Einordnung? Dann kennt der Abgleich seinen Stand
  // nicht, und die Einordnung der Meldung hat Vorrang.
  nachLaufbeginn(p, start) {
    for (let q = p; q && q !== this.wurzel; q = path.dirname(q)) {
      if (this.gesammelt.has(q)) return true;
      const zeit = this.letzteMeldung.get(q);
      if (zeit !== undefined && zeit >= start) return true;
      if (path.dirname(q) === q) break;
    }
    return false;
  },

  async gleicheAb() {
    this.zaehler.abgleiche++;
    const neu = new Map();
    const unlesbar = new Set();
    const start = Date.now();
    try {
      await this.leseBaum(this.wurzel, neu, false, unlesbar);
    } catch (err) {
      if (!this.geschlossen) void this.pruefeWurzelUndStarteNeu(err);
      return;
    }
    if (this.geschlossen) return;
    // Die Wurzel ist (wieder) lesbar. Fehlt die Überwachung, etwa nach einer
    // getrennten Netz-Verbindung, wird sie neu eingerichtet.
    this.wurzelFehlt = false;
    this.wurzelFehler = null;
    if (this.ueberwachungen.size === 0 && !this.rueckfall && !this.neustartTimer) {
      this.ueberwacheWurzel();
      // Unter Windows und macOS kehrt ueberwacheOrdner sofort zurück.
      for (const [p, e] of neu) if (e.ordner) this.ueberwacheOrdner(p);
    }
    // Entfernt: tiefste zuerst, damit ein Ordner nach seinem Inhalt geht.
    // Nicht gemeldet wird, was nach Laufbeginn eingeordnet wurde (Zweitblick 1)
    // oder unter einem Ordner liegt, den der Lauf nicht lesen konnte: Ein
    // kurzer Lesefehler über das Netz ist kein Löschen (Sicherheits-Review).
    const unterUnlesbar = (p) => [...unlesbar].some((u) => p === u || p.startsWith(u + path.sep));
    const weg = [...this.abbild].filter(
      ([p]) => !neu.has(p) && !unterUnlesbar(p) && !this.nachLaufbeginn(p, start),
    );
    weg.sort((a, b) => b[0].length - a[0].length);
    for (const [p, e] of weg) if (this.abbild.has(p)) this.entferne(p, e);
    // Neu und geändert: Ordner vor ihrem Inhalt.
    const sortiert = [...neu].sort((a, b) => a[0].length - b[0].length);
    for (const [p, e] of sortiert) {
      if (this.nachLaufbeginn(p, start)) continue;
      const alt = this.abbild.get(p);
      if (alt && alt.ordner !== e.ordner) this.entferne(p, alt);
      const jetzt = this.abbild.get(p);
      if (e.ordner) {
        if (jetzt) continue;
        this.abbild.set(p, e);
        this.ueberwacheOrdner(p);
        this.melde('addDir', p);
        continue;
      }
      if (this.schreibEnde.has(p)) continue;
      if (!jetzt) {
        this.abbild.set(p, e);
        this.melde('add', p);
      } else if (jetzt.groesse !== e.groesse || jetzt.mtimeMs !== e.mtimeMs) {
        this.abbild.set(p, e);
        this.melde('change', p);
      }
    }
    for (const [q, zeit] of this.letzteMeldung) if (zeit < start) this.letzteMeldung.delete(q);
  },
};

module.exports = { EINORDNUNG, SCHREIB_ENDE_MS, SAMMEL_MS, SCHREIB_ENDE_VERSUCHE };
