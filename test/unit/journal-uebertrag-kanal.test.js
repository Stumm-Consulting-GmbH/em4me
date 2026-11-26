// 4T-002737 (Epic 3E-000396): Ablauf des Kanals `journals:uebertrageAufgaben`
// (src/main/ipc/area-journals-uebertrag.js) mit Wegwerf-Bereich und
// injizierten Abhängigkeiten: Eingabe und Grenze, Quelle und Ziel (V1),
// Erweiterungen, ungespeicherte Stände (V8), Größe (V16), Reihenfolge,
// Vergleich vor dem Schreiben und Rückweg (V9), Dokument-Historie. Nach jedem
// erfolgreichen Lauf wird der Inhalt beider Dateien auf der Platte geprüft.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  fuehreUebertragAus,
  listeMarkdownDateien,
  ZEICHEN_UEBERTRAGEN,
} from '../../src/main/ipc/area-journals-uebertrag.js';
import { VORGABE_ZEICHEN } from '../../src/shared/journal-uebertrag.js';
import { TASK_STATE_DEFAULTS } from '../../src/shared/markdown/plugins/tasks.js';
import { ersetzeDateiOderWirf } from '../../src/main/documents/atomic-write.js';
import selbstSchreib from '../../src/main/documents/self-write.js';

// Die Plattform-Eigenschaft wird über DIESELBE Modul-Instanz gesetzt, die der
// Kanal benutzt: Vitest führt für 'import' und 'require' getrennte Instanzen
// (Muster area-path.test.js). Mit 'import' griff die Umschaltung nur dort, wo
// der Wirt ohnehin Windows ist; unter Linux blieb der Fall der anderen
// Schreibweise rot.
const { setPlatformForTests } = createRequire(import.meta.url)('../../src/shared/platform.js');

const TAG = {
  id: 'tag',
  granularity: 'day',
  folderPattern: 'Journal',
  namePattern: '{{date::yyyy-MM-dd}}',
};
const HEUTE = new Date(2026, 10, 15).getTime();
const MB5 = 5 * 1024 * 1024;

let tmpDirs = [];
afterEach(() => {
  setPlatformForTests(undefined);
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

function bereich(dateien) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'em4me-uebertrag-'));
  tmpDirs.push(root);
  for (const [rel, text] of Object.entries(dateien)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
  }
  return root;
}

const pfad = (root, tag) => path.join(root, 'Journal', `${tag}.md`);
const lies = (root, tag) => fs.readFileSync(pfad(root, tag), 'utf8');

function abh(root, over = {}) {
  const journal = over.journal || TAG;
  return {
    bereich: { rootPath: root },
    fenster: null,
    leseJournalsKonfig: async () => ({ journals: [journal] }),
    listeEintraege: listeMarkdownDateien,
    istDatei: async (abs) => {
      try {
        return (await fsp.stat(abs)).isFile();
      } catch {
        return false;
      }
    },
    groesse: async (abs) => (await fsp.stat(abs)).size,
    leseDatei: (abs) => fsp.readFile(abs, 'utf8'),
    schreibeDatei: (abs, text) => ersetzeDateiOderWirf(abs, text),
    pufferTexte: () => [],
    einstellungen: () => ({}),
    ...over,
  };
}

const QUELLE = '# Arbeit\n- [ ] offen\n- [x] erledigt\n';
const ZIEL = '# Arbeit\n';
// Der Kern setzt hinter eine Überschrift, die keine Liste ist, eine Leerzeile.
const ZIEL_NEU = '# Arbeit\n\n- [ ] offen\n';

function standard() {
  return bereich({
    'Journal/2026-11-12.md': QUELLE,
    'Journal/2026-11-15.md': ZIEL,
    'Journal/2026-11-16.md': '# Arbeit\n- [ ] morgen\n',
  });
}

describe('Zeichen des Status «Übertragen»', () => {
  it('Kern-Vorgabe, Kanal und vorbelegter Status tragen dasselbe Zeichen', () => {
    const migrated = TASK_STATE_DEFAULTS.find((s) => s.name === 'migrated');
    expect(migrated.char).toBe('»');
    expect(VORGABE_ZEICHEN).toBe(migrated.char);
    expect(ZEICHEN_UEBERTRAGEN).toBe(migrated.char);
  });
});

describe('Erfolgreicher Übertrag', () => {
  it('kennzeichnen: Quelle ist der jüngste frühere Eintrag (vor drei Tagen), morgen zählt nicht', async () => {
    const root = standard();
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE });
    expect(r).toMatchObject({ ok: true, anzahl: 1, eingesetzt: 1, quelle: '2026-11-12' });
    expect(r.einfuegungen).toHaveLength(1);
    expect(lies(root, '2026-11-15')).toBe(ZIEL_NEU);
    expect(lies(root, '2026-11-12')).toBe('# Arbeit\n- [»] offen\n- [x] erledigt\n');
    expect(lies(root, '2026-11-16')).toBe('# Arbeit\n- [ ] morgen\n');
    // Geschrieben ohne Self-Write-Merker (V9: offene Reiter laden still neu).
    expect(selbstSchreib._hat(pfad(root, '2026-11-15'))).toBe(false);
    expect(selbstSchreib._hat(pfad(root, '2026-11-12'))).toBe(false);
  });

  it('entfernen: Modus aus dem rohen Journal-Eintrag; Summe der Aufgaben bleibt', async () => {
    const root = standard();
    const journal = { ...TAG, carryOverMode: 'remove' };
    const r = await fuehreUebertragAus(abh(root, { journal }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r.ok).toBe(true);
    expect(lies(root, '2026-11-12')).toBe('# Arbeit\n- [x] erledigt\n');
    expect(lies(root, '2026-11-15')).toBe(ZIEL_NEU);
    const zaehle = (t) => (t.match(/^- \[.\]/gm) || []).length;
    expect(zaehle(lies(root, '2026-11-12')) + zaehle(lies(root, '2026-11-15'))).toBe(
      zaehle(QUELLE),
    );
  });

  it('ein anderer Modus-Wert als «remove» kennzeichnet', async () => {
    const root = standard();
    const journal = { ...TAG, carryOverMode: 'REMOVE' };
    await fuehreUebertragAus(abh(root, { journal }), { journalId: 'tag', periodStartMs: HEUTE });
    expect(lies(root, '2026-11-12')).toContain('- [»] offen');
  });

  it('Periode aus dem Zeitwert: Ziel ist der Eintrag des übergebenen Tags, nicht «jetzt»', async () => {
    const root = bereich({
      'Journal/2026-11-10.md': '- [ ] alt\n',
      'Journal/2026-11-11.md': '',
      'Journal/2026-11-12.md': '- [ ] spaeter\n',
    });
    const mittags = new Date(2026, 10, 11, 13, 30).getTime();
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: mittags });
    expect(r).toMatchObject({ ok: true, quelle: '2026-11-10' });
    expect(lies(root, '2026-11-11')).toBe('- [ ] alt\n');
    expect(lies(root, '2026-11-12')).toBe('- [ ] spaeter\n');
  });

  it('Wochen-Journal: Quelle ist die frühere Woche', async () => {
    const woche = { ...TAG, id: 'woche', granularity: 'week' };
    // Montage: 2026-11-02 und 2026-11-09.
    const root = bereich({
      'Journal/2026-11-02.md': '- [ ] wochenaufgabe\n',
      'Journal/2026-11-09.md': '',
    });
    const mittwoch = new Date(2026, 10, 11).getTime();
    const r = await fuehreUebertragAus(abh(root, { journal: woche }), {
      journalId: 'woche',
      periodStartMs: mittwoch,
    });
    expect(r).toMatchObject({ ok: true, anzahl: 1, quelle: '2026-11-02' });
    expect(lies(root, '2026-11-09')).toBe('- [ ] wochenaufgabe\n');
    expect(lies(root, '2026-11-02')).toBe('- [»] wochenaufgabe\n');
  });

  it('Abschnitt aus dem rohen Journal-Eintrag schränkt die Quelle ein', async () => {
    const root = bereich({
      'Journal/2026-11-14.md': '# Arbeit\n- [ ] a\n# Privat\n- [ ] p\n',
      'Journal/2026-11-15.md': '',
    });
    const journal = { ...TAG, carryOverSection: 'Privat' };
    const r = await fuehreUebertragAus(abh(root, { journal }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toMatchObject({ ok: true, anzahl: 1 });
    expect(lies(root, '2026-11-15')).toBe('# Privat\n\n- [ ] p\n');
    expect(lies(root, '2026-11-14')).toBe('# Arbeit\n- [ ] a\n# Privat\n- [»] p\n');
  });

  it('Dokument-Historie beider Dateien; ein Fehler der Historie macht nichts rückgängig', async () => {
    const root = standard();
    const eintraege = [];
    const historie = {
      resolveHistoryFor: async () => ({ effective: true }),
      readPreviousTextFor: async (abs) => fs.readFileSync(abs, 'utf8'),
      recordMddOnSave: async (owner, abs, vorher, nachher) => {
        eintraege.push({ name: path.basename(abs), vorher, nachher });
        throw new Error('Historie defekt');
      },
    };
    const protokoll = vi.fn();
    const r = await fuehreUebertragAus(abh(root, { historie, protokoll }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r.ok).toBe(true);
    expect(eintraege.map((e) => e.name)).toEqual(['2026-11-15.md', '2026-11-12.md']);
    expect(eintraege[0]).toMatchObject({ vorher: ZIEL, nachher: ZIEL_NEU });
    expect(eintraege[1].vorher).toBe(QUELLE);
    expect(protokoll).toHaveBeenCalled();
    expect(lies(root, '2026-11-15')).toBe(ZIEL_NEU);
  });
});

describe('Antwort-Gründe ohne Schreiben', () => {
  async function unveraendert(root, over, eingabe, erwartet) {
    const r = await fuehreUebertragAus(abh(root, over), eingabe);
    expect(r).toEqual(erwartet);
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
  }

  it('ungueltig: Form der Eingabe', async () => {
    const root = standard();
    const u = { ok: false, grund: 'ungueltig' };
    for (const eingabe of [
      undefined,
      {},
      { journalId: '', periodStartMs: HEUTE },
      { journalId: 7, periodStartMs: HEUTE },
      { journalId: 'tag', periodStartMs: String(HEUTE) },
      { journalId: 'tag', periodStartMs: Number.NaN },
      { journalId: 'tag', periodStartMs: Infinity },
    ]) {
      await unveraendert(root, {}, eingabe, u);
    }
  });

  it('ungueltig: unbekanntes Journal und Fenster ohne Bereich', async () => {
    const root = standard();
    const u = { ok: false, grund: 'ungueltig' };
    await unveraendert(root, {}, { journalId: 'gibt-es-nicht', periodStartMs: HEUTE }, u);
    await unveraendert(root, { bereich: null }, { journalId: 'tag', periodStartMs: HEUTE }, u);
  });

  it('ungueltig: Ordner-Schema führt aus dem Bereich hinaus, nichts gelesen', async () => {
    const root = standard();
    const leseDatei = vi.fn(async () => '');
    const journal = { ...TAG, folderPattern: '../draussen' };
    await unveraendert(
      root,
      { journal, leseDatei },
      { journalId: 'tag', periodStartMs: HEUTE },
      {
        ok: false,
        grund: 'ungueltig',
      },
    );
    expect(leseDatei).not.toHaveBeenCalled();
  });

  it('erweiterung-aus: «Journale» oder «Aufgaben» ausgeschaltet', async () => {
    const root = standard();
    for (const aus of [['journals'], ['tasks']]) {
      await unveraendert(
        root,
        { einstellungen: () => ({ disabledExtensions: aus }) },
        { journalId: 'tag', periodStartMs: HEUTE },
        { ok: false, grund: 'erweiterung-aus' },
      );
    }
  });

  it('kein-ziel: Eintrag der Ziel-Periode fehlt', async () => {
    const root = bereich({ 'Journal/2026-11-12.md': QUELLE });
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE });
    expect(r).toEqual({ ok: false, grund: 'kein-ziel' });
    expect(fs.existsSync(pfad(root, '2026-11-15'))).toBe(false);
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
  });

  it('kein-frueherer-eintrag: nur der eigene und ein späterer Eintrag', async () => {
    const root = bereich({ 'Journal/2026-11-15.md': ZIEL, 'Journal/2026-11-16.md': QUELLE });
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE });
    expect(r).toEqual({ ok: false, grund: 'kein-frueherer-eintrag' });
    expect(lies(root, '2026-11-16')).toBe(QUELLE);
  });

  it('nichts-offen und abschnitt-fehlt nennen die Quelle', async () => {
    const root = bereich({
      'Journal/2026-11-12.md': '- [x] fertig\n',
      'Journal/2026-11-15.md': ZIEL,
    });
    expect(await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE })).toEqual(
      {
        ok: false,
        grund: 'nichts-offen',
        quelle: '2026-11-12',
      },
    );
    const root2 = standard();
    const journal = { ...TAG, carryOverSection: 'Privat' };
    await unveraendert(
      root2,
      { journal },
      { journalId: 'tag', periodStartMs: HEUTE },
      {
        ok: false,
        grund: 'abschnitt-fehlt',
        quelle: '2026-11-12',
      },
    );
  });

  it('ungespeichert: Puffer-Schicht hält für Quelle oder Ziel einen abweichenden Stand', async () => {
    const root = standard();
    for (const tag of ['2026-11-12', '2026-11-15']) {
      const pufferTexte = (abs) => (abs === pfad(root, tag) ? ['anderer Stand\n'] : []);
      await unveraendert(
        root,
        { pufferTexte },
        { journalId: 'tag', periodStartMs: HEUTE },
        { ok: false, grund: 'ungespeichert', eintrag: tag },
      );
    }
  });

  it('ungespeichert: Pfad der Quelle oder des Ziels in der Liste des Fensters', async () => {
    const root = standard();
    for (const tag of ['2026-11-12', '2026-11-15']) {
      await unveraendert(
        root,
        {},
        { journalId: 'tag', periodStartMs: HEUTE, ungespeichert: [pfad(root, tag)] },
        { ok: false, grund: 'ungespeichert', eintrag: tag },
      );
    }
  });

  it('ungespeichert: andere Schreibweise desselben Pfads unter Windows', async () => {
    setPlatformForTests('win32');
    const root = standard();
    await unveraendert(
      root,
      {},
      {
        journalId: 'tag',
        periodStartMs: HEUTE,
        ungespeichert: [pfad(root, '2026-11-12').toUpperCase()],
      },
      { ok: false, grund: 'ungespeichert', eintrag: '2026-11-12' },
    );
  });

  // Gegenprobe zur Umschaltung: Unter Linux unterscheidet das Dateisystem die
  // Schreibung, die andere Schreibweise nennt also eine andere Datei, und der
  // Übertrag läuft. Der Fall ist auf einem Windows-Wirt rot, sobald die
  // Umschaltung die Modul-Instanz des Kanals nicht erreicht.
  it('ungespeichert: andere Schreibweise ist unter Linux ein anderer Pfad', async () => {
    setPlatformForTests('linux');
    const root = standard();
    const r = await fuehreUebertragAus(abh(root), {
      journalId: 'tag',
      periodStartMs: HEUTE,
      ungespeichert: [pfad(root, '2026-11-12').toUpperCase()],
    });
    expect(r.ok).toBe(true);
  });

  it('ungueltig: mehr als 500 Pfade in der Liste', async () => {
    const root = standard();
    const liste = Array.from({ length: 501 }, (_, i) => path.join(root, `x${i}.md`));
    await unveraendert(
      root,
      {},
      { journalId: 'tag', periodStartMs: HEUTE, ungespeichert: liste },
      {
        ok: false,
        grund: 'ungueltig',
      },
    );
  });

  it('zu-gross: Eintrag über 5 MB', async () => {
    const root = bereich({
      'Journal/2026-11-12.md': `- [ ] a\n${'x'.repeat(MB5)}`,
      'Journal/2026-11-15.md': ZIEL,
    });
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE });
    expect(r).toEqual({ ok: false, grund: 'zu-gross' });
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
  });

  it('zu-gross: die Größe wird vor dem Lesen geprüft, gelesen wird nichts', async () => {
    const root = bereich({
      'Journal/2026-11-12.md': `- [ ] a\n${'x'.repeat(MB5)}`,
      'Journal/2026-11-15.md': ZIEL,
    });
    const leseDatei = vi.fn(async (abs) => fsp.readFile(abs, 'utf8'));
    const r = await fuehreUebertragAus(abh(root, { leseDatei }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'zu-gross' });
    expect(leseDatei).not.toHaveBeenCalled();
  });

  it('zu-gross als zweite Linie: die Größen-Abfrage nennt wenig, der Text ist groß', async () => {
    const root = bereich({
      'Journal/2026-11-12.md': `- [ ] a\n${'x'.repeat(MB5)}`,
      'Journal/2026-11-15.md': ZIEL,
    });
    const r = await fuehreUebertragAus(abh(root, { groesse: async () => 1 }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'zu-gross' });
  });

  it('geaendert: ein Eintrag wächst zwischen Planen und Schreiben über die Grenze', async () => {
    const root = standard();
    let abfragen = 0;
    const groesse = async () => (++abfragen > 2 ? MB5 + 10 : 1);
    const schreibeDatei = vi.fn();
    const r = await fuehreUebertragAus(abh(root, { groesse, schreibeDatei }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'geaendert' });
    expect(schreibeDatei).not.toHaveBeenCalled();
  });

  it('zu-viele-dateien: eine abgeschnittene Auflistung überträgt nichts', async () => {
    const root = standard();
    const schreibeDatei = vi.fn();
    const listeEintraege = (r, ordner) => ({ ...listeMarkdownDateien(r, ordner), gekappt: true });
    const r = await fuehreUebertragAus(abh(root, { listeEintraege, schreibeDatei }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'zu-viele-dateien' });
    expect(schreibeDatei).not.toHaveBeenCalled();
  });

  it('zu-gross: 501 Wurzeln (Grund des Kerns unverändert)', async () => {
    const viele = Array.from({ length: 501 }, (_, i) => `- [ ] a${i}\n`).join('');
    const root = bereich({ 'Journal/2026-11-12.md': viele, 'Journal/2026-11-15.md': ZIEL });
    const r = await fuehreUebertragAus(abh(root), { journalId: 'tag', periodStartMs: HEUTE });
    expect(r).toEqual({ ok: false, grund: 'zu-gross' });
    expect(lies(root, '2026-11-12')).toBe(viele);
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
  });
});

describe('Liste ungespeicherter Pfade des Fensters', () => {
  it('fremder Pfad, fehlendes Feld und leere Liste: der Übertrag läuft', async () => {
    for (const ungespeichert of [['C:/woanders/fremd.md'], undefined, null, []]) {
      const root = standard();
      const r = await fuehreUebertragAus(abh(root), {
        journalId: 'tag',
        periodStartMs: HEUTE,
        ungespeichert,
      });
      expect(r.ok).toBe(true);
      expect(lies(root, '2026-11-15')).toBe(ZIEL_NEU);
      expect(lies(root, '2026-11-12')).toBe('# Arbeit\n- [»] offen\n- [x] erledigt\n');
    }
  });

  it('ungueltig: Feld vorhanden, aber keine Liste aus Texten (nichts geschrieben)', async () => {
    // Eine fehlerhafte Liste macht den Kanal nicht weniger vorsichtig: Er
    // weist ab, statt sie zu übergehen.
    for (const ungespeichert of ['kein-array', [1, 2], ['C:/a.md', 7], { 0: 'C:/a.md' }]) {
      const root = standard();
      const quelleVorher = lies(root, '2026-11-12');
      const zielVorher = lies(root, '2026-11-15');
      const r = await fuehreUebertragAus(abh(root), {
        journalId: 'tag',
        periodStartMs: HEUTE,
        ungespeichert,
      });
      expect(r).toEqual({ ok: false, grund: 'ungueltig' });
      expect(lies(root, '2026-11-12')).toBe(quelleVorher);
      expect(lies(root, '2026-11-15')).toBe(zielVorher);
    }
  });
});

describe('Zwischen Planen und Schreiben', () => {
  function zweitesLesenAnders(root, tag) {
    const zaehler = new Map();
    return async (abs) => {
      const n = (zaehler.get(abs) || 0) + 1;
      zaehler.set(abs, n);
      const text = await fsp.readFile(abs, 'utf8');
      return n >= 2 && abs === pfad(root, tag) ? `${text}- [ ] neu getippt\n` : text;
    };
  }

  it('geaendert: Quelle oder Ziel liefert beim zweiten Lesen anderes, nichts geschrieben', async () => {
    for (const tag of ['2026-11-12', '2026-11-15']) {
      const root = standard();
      const schreibeDatei = vi.fn();
      const r = await fuehreUebertragAus(
        abh(root, { leseDatei: zweitesLesenAnders(root, tag), schreibeDatei }),
        {
          journalId: 'tag',
          periodStartMs: HEUTE,
        },
      );
      expect(r).toEqual({ ok: false, grund: 'geaendert' });
      expect(schreibeDatei).not.toHaveBeenCalled();
      expect(lies(root, '2026-11-12')).toBe(QUELLE);
      expect(lies(root, '2026-11-15')).toBe(ZIEL);
    }
  });

  // Befund des Probe-Durchlaufs der Prüf-Anleitung vom 2026-11-15: Die
  // Puffer-Schicht führt auch Stände, die dem Platten-Stand gleichen (ein
  // Reiter mit Editor meldet seinen Text nach jedem Dokument-Wechsel, auch
  // nach stillem Neuladen). Ein solcher Stand ist nicht ungespeichert.
  it('Puffer-Stand gleich dem Platten-Stand: der Übertrag läuft', async () => {
    const root = standard();
    const pufferTexte = (abs) => [fs.readFileSync(abs, 'utf8')];
    const r = await fuehreUebertragAus(abh(root, { pufferTexte }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r.ok).toBe(true);
    expect(lies(root, '2026-11-12')).not.toBe(QUELLE);
    expect(lies(root, '2026-11-15')).not.toBe(ZIEL);
  });

  // Befund der dritten Review-Runde: Hält ein Fenster den Eintrag unverändert
  // und ein zweites geändert, zählt der geänderte Stand, gleich welches
  // Fenster zuletzt gemeldet hat.
  it('ungespeichert: zwei Fenster, eines unverändert und eines geändert', async () => {
    const root = standard();
    for (const tag of ['2026-11-12', '2026-11-15']) {
      for (const reihenfolge of [0, 1]) {
        const pufferTexte = (abs) => {
          if (abs !== pfad(root, tag)) return [];
          const beide = [fs.readFileSync(abs, 'utf8'), 'anderer Stand\n'];
          return reihenfolge === 0 ? beide : beide.reverse();
        };
        const r = await fuehreUebertragAus(abh(root, { pufferTexte }), {
          journalId: 'tag',
          periodStartMs: HEUTE,
        });
        expect(r).toEqual({ ok: false, grund: 'ungespeichert', eintrag: tag });
        expect(lies(root, '2026-11-12')).toBe(QUELLE);
        expect(lies(root, '2026-11-15')).toBe(ZIEL);
      }
    }
  });

  it('ungespeichert: eine Auskunft, die keine Liste ist, macht den Kanal nicht weniger vorsichtig', async () => {
    const root = standard();
    const r = await fuehreUebertragAus(abh(root, { pufferTexte: () => null }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'ungespeichert', eintrag: '2026-11-12' });
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
  });

  it('Puffer-Stand weicht nur in BOM und Zeilenenden ab: der Übertrag läuft', async () => {
    const root = standard();
    const mitWindowsEnden = (text) => '\uFEFF' + text.replace(/\n/g, '\r\n');
    fs.writeFileSync(pfad(root, '2026-11-12'), mitWindowsEnden(QUELLE), 'utf8');
    fs.writeFileSync(pfad(root, '2026-11-15'), mitWindowsEnden(ZIEL), 'utf8');
    const pufferTexte = (abs) => [abs === pfad(root, '2026-11-12') ? QUELLE : ZIEL];
    const r = await fuehreUebertragAus(abh(root, { pufferTexte }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r.ok).toBe(true);
  });

  it('ungespeichert: Stand erscheint erst bei der Wiederholung der Prüfung', async () => {
    const root = standard();
    let aufrufe = 0;
    const pufferTexte = (abs) =>
      abs === pfad(root, '2026-11-15') && ++aufrufe > 1 ? ['anderer Stand\n'] : [];
    const schreibeDatei = vi.fn();
    const r = await fuehreUebertragAus(abh(root, { pufferTexte, schreibeDatei }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'ungespeichert', eintrag: '2026-11-15' });
    expect(schreibeDatei).not.toHaveBeenCalled();
  });
});

describe('Schreibfehler und Rückweg', () => {
  function scheitertBei(root, tag, { auchZurueck = false } = {}) {
    let versuche = 0;
    return async (abs, text) => {
      if (abs === pfad(root, tag)) throw Object.assign(new Error('gesperrt'), { code: 'EBUSY' });
      if (auchZurueck && abs === pfad(root, '2026-11-15') && ++versuche > 1) {
        throw Object.assign(new Error('gesperrt'), { code: 'EBUSY' });
      }
      await ersetzeDateiOderWirf(abs, text);
    };
  }

  it('Schreiben der Quelle scheitert: Ziel wird zurückgeschrieben', async () => {
    const root = standard();
    const r = await fuehreUebertragAus(
      abh(root, { schreibeDatei: scheitertBei(root, '2026-11-12') }),
      {
        journalId: 'tag',
        periodStartMs: HEUTE,
      },
    );
    expect(r).toEqual({ ok: false, grund: 'schreibfehler', zielZurueck: true });
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
  });

  it('auch das Zurückschreiben scheitert: zielZurueck false, Quelle unverändert', async () => {
    const root = standard();
    const schreibeDatei = scheitertBei(root, '2026-11-12', { auchZurueck: true });
    const r = await fuehreUebertragAus(abh(root, { schreibeDatei }), {
      journalId: 'tag',
      periodStartMs: HEUTE,
    });
    expect(r).toEqual({ ok: false, grund: 'schreibfehler', zielZurueck: false });
    expect(lies(root, '2026-11-15')).toBe(ZIEL_NEU);
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
  });

  it('Schreiben des Ziels scheitert: schreibfehler, Quelle nie angefasst', async () => {
    const root = standard();
    const r = await fuehreUebertragAus(
      abh(root, { schreibeDatei: scheitertBei(root, '2026-11-15') }),
      {
        journalId: 'tag',
        periodStartMs: HEUTE,
      },
    );
    expect(r).toEqual({ ok: false, grund: 'schreibfehler' });
    expect(lies(root, '2026-11-15')).toBe(ZIEL);
    expect(lies(root, '2026-11-12')).toBe(QUELLE);
  });
});

describe('listeMarkdownDateien', () => {
  it('listet .md-Dateien bereichsrelativ und weist einen Ordner außerhalb ab', () => {
    const root = bereich({ 'Journal/a.md': '', 'Journal/b.txt': '', 'Journal/2026/c.MD': '' });
    const r = listeMarkdownDateien(root, 'Journal');
    expect(r.ok).toBe(true);
    expect(r.relPaths.sort()).toEqual(['Journal/2026/c.MD', 'Journal/a.md']);
    expect(listeMarkdownDateien(root, '../draussen')).toEqual({ ok: false, error: 'outside-area' });
  });
});
