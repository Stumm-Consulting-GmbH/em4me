// 4T-0604 (Epic 3E-0113): Unit-Matrix fuer die created/updated-Automatik.
// Zeitwerte werden als lokale Date-Objekte konstruiert (new Date(y, m, ...)),
// damit die Erwartungen zeitzonenunabhaengig sind.
import { describe, it, expect } from 'vitest';
import {
  formatLocalStamp,
  applyTimestampFields,
} from '../../src/shared/markdown/frontmatter-timestamps.js';

const NOW = new Date(2026, 6, 18, 12, 4).getTime(); // 2026-07-18 12:04 lokal
const BIRTH = new Date(2025, 5, 23, 15, 43).getTime(); // 2025-06-23 15:43 lokal

const cfg = (over) => ({
  createdEnabled: false,
  createdField: 'created',
  updatedEnabled: false,
  updatedField: 'updated',
  withTime: true,
  autoCreate: false,
  ...over,
});

describe('formatLocalStamp', () => {
  it('Datum und Uhrzeit bzw. nur Datum, lokale Zeit', () => {
    expect(formatLocalStamp(NOW, true)).toBe('2026-07-18 12:04');
    expect(formatLocalStamp(NOW, false)).toBe('2026-07-18');
    expect(formatLocalStamp(BIRTH, true)).toBe('2025-06-23 15:43');
  });
});

describe('applyTimestampFields: updated', () => {
  it('aktualisiert ein vorhandenes updated-Feld und erhaelt den Body', () => {
    const src = '---\nupdated: 2020-01-01 00:00\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW });
    expect(out).toContain('updated: 2026-07-18 12:04');
    expect(out).toContain('Body');
  });
  it('fuellt ein vorhandenes, aber leeres updated auch ohne Anlage-Option', () => {
    const src = '---\nupdated:\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW });
    expect(out).toContain('updated: 2026-07-18 12:04');
  });
  it('legt ein fehlendes updated ohne Anlage-Option nicht an', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    expect(applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW })).toBeNull();
  });
  it('legt ein fehlendes updated mit Anlage-Option an', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true, autoCreate: true }), {
      nowMs: NOW,
    });
    expect(out).toContain('updated: 2026-07-18 12:04');
    expect(out).toContain('titel: X');
  });
  it('keine Aenderung, wenn updated schon aktuell ist (kein Speicher-Kreislauf)', () => {
    const src = '---\nupdated: 2026-07-18 12:04\n---\nBody\n';
    expect(applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW })).toBeNull();
  });
});

describe('applyTimestampFields: created', () => {
  it('legt created aus der birthtime an (Anlage-Option)', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ createdEnabled: true, autoCreate: true }), {
      nowMs: NOW,
      birthtimeMs: BIRTH,
    });
    expect(out).toContain('created: 2025-06-23 15:43');
  });
  it('ueberschreibt ein vorhandenes created nie', () => {
    const src = '---\ncreated: 2019-09-09 09:09\n---\nBody\n';
    expect(
      applyTimestampFields(src, cfg({ createdEnabled: true, autoCreate: true }), {
        nowMs: NOW,
        birthtimeMs: BIRTH,
      }),
    ).toBeNull();
  });
  it('fuellt ein vorhandenes, aber leeres created auch ohne Anlage-Option', () => {
    const src = '---\ncreated:\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ createdEnabled: true }), {
      nowMs: NOW,
      birthtimeMs: BIRTH,
    });
    expect(out).toContain('created: 2025-06-23 15:43');
  });
  it('legt ein fehlendes created ohne Anlage-Option nicht an', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    expect(
      applyTimestampFields(src, cfg({ createdEnabled: true }), { nowMs: NOW, birthtimeMs: BIRTH }),
    ).toBeNull();
  });
  it('Fallback auf jetzt, wenn keine birthtime vorliegt', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ createdEnabled: true, autoCreate: true }), {
      nowMs: NOW,
    });
    expect(out).toContain('created: 2026-07-18 12:04');
  });
});

describe('applyTimestampFields: Reihenfolge, Anlage, Schutz', () => {
  it('legt bei Neuanlage created vor updated an', () => {
    const src = '---\ntitel: X\n---\nBody\n';
    const out = applyTimestampFields(
      src,
      cfg({ createdEnabled: true, updatedEnabled: true, autoCreate: true }),
      { nowMs: NOW, birthtimeMs: BIRTH },
    );
    expect(out.indexOf('created:')).toBeLessThan(out.indexOf('updated:'));
  });
  it('eigene Feldnamen werden verwendet', () => {
    const src = '---\nerstellt:\ngeaendert:\n---\nBody\n';
    const out = applyTimestampFields(
      src,
      cfg({
        createdEnabled: true,
        createdField: 'erstellt',
        updatedEnabled: true,
        updatedField: 'geaendert',
      }),
      { nowMs: NOW, birthtimeMs: BIRTH },
    );
    expect(out).toContain('erstellt: 2025-06-23 15:43');
    expect(out).toContain('geaendert: 2026-07-18 12:04');
  });
  it('legt ohne Frontmatter nur bei Anlage-Option einen Block an', () => {
    const src = 'Nur Text, kein Frontmatter\n';
    expect(applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW })).toBeNull();
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true, autoCreate: true }), {
      nowMs: NOW,
    });
    expect(out.startsWith('---')).toBe(true);
    expect(out).toContain('updated: 2026-07-18 12:04');
    expect(out).toContain('Nur Text, kein Frontmatter');
  });
  it('nur Datum-Format ohne Uhrzeit', () => {
    const src = '---\nupdated: alt\n---\nB\n';
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true, withTime: false }), {
      nowMs: NOW,
    });
    expect(out).toContain('updated: 2026-07-18');
    expect(out).not.toContain('12:04');
  });
  it('erhaelt Kommentare und Feld-Reihenfolge des Frontmatters', () => {
    const src = '---\n# Kopf-Kommentar\ntitel: X\nupdated: alt\ntags: [a]\n---\nBody\n';
    const out = applyTimestampFields(src, cfg({ updatedEnabled: true }), { nowMs: NOW });
    expect(out).toContain('# Kopf-Kommentar');
    expect(out.indexOf('titel: X')).toBeLessThan(out.indexOf('updated:'));
    expect(out.indexOf('updated:')).toBeLessThan(out.indexOf('tags:'));
  });
  it('defektes Frontmatter-YAML bleibt unangetastet', () => {
    const src = '---\nfoo: [bar\n---\nB\n';
    expect(
      applyTimestampFields(src, cfg({ updatedEnabled: true, autoCreate: true }), { nowMs: NOW }),
    ).toBeNull();
  });
  it('ohne aktive Automatik liefert null', () => {
    const src = '---\nupdated: x\n---\nB\n';
    expect(applyTimestampFields(src, cfg({}), { nowMs: NOW })).toBeNull();
  });
});
