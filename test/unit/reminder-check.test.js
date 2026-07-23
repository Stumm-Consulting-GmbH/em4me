// 4T-0525 (Epic 3E-0095): Unit-Tests der Scheduler-Factory
// createReminderChecker (src/main/reminder-check.js) mit vollstaendig
// injizierten Fake-Abhaengigkeiten (kein Electron): Erst-Lauf als
// Nachhol-Lieferung (catchUp), kein Doppel-Feuern, Neu-Faelligkeit ueber eine
// verstellbare Uhr, Nicht-bereiter Index, deaktivierte Erweiterung, Mute und
// Retrigger, Panel-Liste, sowie die Fehler-Isolation pro Bereich. Die Uhr
// (deps.now) und die Datei-Zeilen sind pro Test verstellbar; deps.send
// zeichnet die Zustellungen in ein Array auf. Datumswerte in 2099 (nie
// Gegenwart).
//
// ESM-Syntax wie die uebrigen Unit-Tests (vitest.config.mjs); das CJS-Modul
// wird ueber die ESM-Interop importiert.
import { describe, it, expect } from 'vitest';
import { createReminderChecker, CHECK_INTERVAL_MS } from '../../src/main/reminder-check.js';

// Status-Typ-Resolver ohne Settings (offen/unbekannt loesen aus).
const statusTypeOf = (ch) =>
  ch === 'x' ? 'DONE' : ch === '-' ? 'CANCELLED' : ch === ' ' ? 'TODO' : null;

// Standard-Fixture: zwei ueberfaellige Anker (bezogen auf den Default-Jetzt
// 2099-06-15 12:00) und ein zukuenftiger. Der Schluessel bildet sich aus Pfad
// plus Roh-Zeile (nicht aus der Bereichs-Wurzel).
const DEFAULT_LINES = [
  { path: 'a.md', zeile: 1, text: '- [ ] Alpha ⏰ 2099-06-15 08:00' },
  { path: 'a.md', zeile: 2, text: '- [ ] Beta ⏰ 2099-06-14 09:00' },
  { path: 'a.md', zeile: 3, text: '- [ ] Gamma ⏰ 2099-06-20 09:00' },
];

// Test-Harness mit einer veraenderbaren Konfiguration (cfg): Uhr, Zeilen,
// Erweiterungs-Schalter, Bereiche und ein Fehler-Schalter fuer areas().
function makeHarness(init = {}) {
  const cfg = {
    enabled: init.enabled !== false,
    lines: init.lines !== undefined ? init.lines : DEFAULT_LINES,
    now: init.now || new Date(2099, 5, 15, 12, 0), // 2099-06-15 12:00
    areas: init.areas || [{ root: 'R' }],
    throwAreas: !!init.throwAreas,
  };
  const sent = [];
  const deps = {
    areas: () => {
      if (cfg.throwAreas) throw new Error('areas boom');
      return cfg.areas;
    },
    taskLines: (root) => (typeof cfg.lines === 'function' ? cfg.lines(root) : cfg.lines),
    buildEnv: () => ({
      enabled: cfg.enabled,
      globalFilter: '',
      statusTypeOf,
      defaultTime: '09:00',
    }),
    send: (root, channel, payload) => sent.push({ root, channel, payload }),
    now: () => cfg.now,
  };
  const checker = createReminderChecker(deps);
  return {
    checker,
    cfg,
    sent,
    dueSends: () => sent.filter((s) => s.channel === 'reminders:due'),
    reset: () => {
      sent.length = 0;
    },
  };
}

// --- 1. Erst-Lauf, kein Doppel-Feuern, Neu-Faelligkeit -----------------------------
describe('createReminderChecker — Nachhol-Lieferung und Takt (4T-0525)', () => {
  it('liefert im Erst-Lauf alle ueberfaelligen als EIN reminders:due mit catchUp true', () => {
    const h = makeHarness();
    h.checker.tick();
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].root).toBe('R');
    expect(due[0].payload.catchUp).toBe(true);
    expect(due[0].payload.items.map((i) => i.description).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('feuert dieselben Anker im zweiten Takt nicht erneut, liefert aber neu faellig gewordene mit catchUp false', () => {
    const h = makeHarness();
    h.checker.tick();
    h.reset();
    // Zweiter Takt bei unveraenderter Uhr: nichts Neues.
    h.checker.tick();
    expect(h.dueSends()).toHaveLength(0);
    // Uhr vorstellen, bis Gamma faellig ist.
    h.cfg.now = new Date(2099, 5, 20, 12, 0); // 2099-06-20 12:00
    h.checker.tick();
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].payload.catchUp).toBe(false);
    expect(due[0].payload.items.map((i) => i.description)).toEqual(['Gamma']);
  });
});

// --- 2. Index nicht bereit ----------------------------------------------------------
describe('createReminderChecker — Index nicht bereit (4T-0525)', () => {
  it('sendet nichts und bewahrt catchUp fuer den spaeteren ersten echten Lauf', () => {
    let ready = false;
    const h = makeHarness({ lines: () => (ready ? DEFAULT_LINES : null) });
    h.checker.tick();
    expect(h.sent).toHaveLength(0);
    // Sobald der Index bereit ist, ist der erste echte Lauf die Nachhol-Lieferung.
    ready = true;
    h.checker.tick();
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].payload.catchUp).toBe(true);
  });
});

// --- 3. Deaktivierte Erweiterung ----------------------------------------------------
describe('createReminderChecker — Erweiterung aus (4T-0525)', () => {
  it('sendet nichts und verbraucht keinen Zustand (catchUp bleibt fuer den spaeteren Lauf)', () => {
    const h = makeHarness({ enabled: false });
    h.checker.tick();
    expect(h.sent).toHaveLength(0);
    // Nach dem Einschalten liefert der erste Lauf weiterhin catchUp true.
    h.cfg.enabled = true;
    h.checker.tick();
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].payload.catchUp).toBe(true);
  });
});

// --- 4. Mute und Retrigger ----------------------------------------------------------
describe('createReminderChecker — mute und retrigger (4T-0525)', () => {
  it('mute(): list() zeigt das muted-Flag und tick() feuert gemutete Anker nicht', () => {
    const h = makeHarness();
    const before = h.checker.list('R');
    const alpha = before.items.find((i) => i.description === 'Alpha');
    expect(alpha.muted).toBe(false);
    h.checker.mute('R', [alpha.key]);
    const after = h.checker.list('R');
    expect(after.items.find((i) => i.description === 'Alpha').muted).toBe(true);
    // mute() meldet eine Aenderung; erst danach ticken.
    h.reset();
    h.checker.tick();
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].payload.items.map((i) => i.description)).toEqual(['Beta']);
  });

  it('retrigger(): feuert den Anker im selben Aufruf erneut und entfernt muted/reported', () => {
    const h = makeHarness();
    const alpha = h.checker.list('R').items.find((i) => i.description === 'Alpha');
    // Erst muten und einmal ticken (Beta wird gemeldet, Alpha ist gemutet).
    h.checker.mute('R', [alpha.key]);
    h.checker.tick();
    h.reset();
    // Retrigger von Alpha: sofortiges Feuern im selben Aufruf.
    h.checker.retrigger('R', [alpha.key]);
    const due = h.dueSends();
    expect(due).toHaveLength(1);
    expect(due[0].payload.items.map((i) => i.description)).toEqual(['Alpha']);
    // Alpha ist nicht mehr gemutet.
    expect(h.checker.list('R').items.find((i) => i.description === 'Alpha').muted).toBe(false);
  });
});

// --- 5. Panel-Liste -----------------------------------------------------------------
describe('createReminderChecker — list (4T-0525)', () => {
  it('ready false ohne Index oder bei ausgeschalteter Erweiterung', () => {
    expect(makeHarness({ lines: null }).checker.list('R')).toEqual({
      ready: false,
      nowLocal: null,
      items: [],
    });
    expect(makeHarness({ enabled: false }).checker.list('R').ready).toBe(false);
  });

  it('ready true mit nowLocal und korrektem due-/muted-Flag pro Eintrag', () => {
    const h = makeHarness();
    const l = h.checker.list('R');
    expect(l.ready).toBe(true);
    expect(l.nowLocal).toBe('2099-06-15T12:00');
    // Alpha/Beta sind ueberfaellig (due true), Gamma noch nicht.
    expect(l.items.find((i) => i.description === 'Alpha').due).toBe(true);
    expect(l.items.find((i) => i.description === 'Beta').due).toBe(true);
    expect(l.items.find((i) => i.description === 'Gamma').due).toBe(false);
    expect(l.items.every((i) => i.muted === false)).toBe(true);
  });

  it('reagiert auf die verstellbare Uhr (Gamma wird spaeter faellig)', () => {
    const h = makeHarness();
    expect(h.checker.list('R').items.find((i) => i.description === 'Gamma').due).toBe(false);
    h.cfg.now = new Date(2099, 5, 21, 0, 0); // 2099-06-21 00:00
    const l = h.checker.list('R');
    expect(l.nowLocal).toBe('2099-06-21T00:00');
    expect(l.items.find((i) => i.description === 'Gamma').due).toBe(true);
  });
});

// --- 6. Fehler-Isolation ------------------------------------------------------------
describe('createReminderChecker — Fehler-Isolation (4T-0525)', () => {
  it('ein Fehler in deps.areas() bricht tick() nicht und sendet nichts', () => {
    const h = makeHarness({ throwAreas: true });
    expect(() => h.checker.tick()).not.toThrow();
    expect(h.sent).toHaveLength(0);
  });

  it('ein Fehler in einem Bereich bricht tick() nicht, der zweite Bereich wird trotzdem geprueft', () => {
    const h = makeHarness({
      areas: [{ root: 'BAD' }, { root: 'R' }],
      lines: (root) => {
        if (root === 'BAD') throw new Error('bereich boom');
        return DEFAULT_LINES;
      },
    });
    expect(() => h.checker.tick()).not.toThrow();
    // Der gesunde Bereich R hat trotz des Fehlers in BAD gefeuert.
    expect(h.dueSends().some((s) => s.root === 'R')).toBe(true);
    expect(h.dueSends().some((s) => s.root === 'BAD')).toBe(false);
  });
});

// --- 7. Konstante -------------------------------------------------------------------
describe('createReminderChecker — Takt-Konstante (4T-0525)', () => {
  it('exportiert das feste 30-Sekunden-Intervall', () => {
    expect(CHECK_INTERVAL_MS).toBe(30000);
  });
});
