// 4T-000515 (Epic 3E-000092): Integrations-Tests der Ereignis-Aggregation
// gegen den echten Backlinks-Index (Temp-Verzeichnis-Fixtures, Muster
// perspective-query-index.test.js): Grundmenge über das Zuordnungs-Feld,
// WHERE-Verfeinerung, Feld-Extraktion mit mtime, Fehler-Pfade.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backlinksFor,
  eventsForQuery,
  releaseRoot,
  rootForActiveFile,
} from '../../src/main/backlinks.js';

const openRoots = new Set();
let tmpDirs = [];

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-md-ev-'));
  tmpDirs.push(dir);
  return dir;
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

async function indexFor(activeFile) {
  let result = backlinksFor(activeFile);
  openRoots.add(rootForActiveFile(activeFile));
  for (let i = 0; i < 500 && result.status === 'indexing'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    result = backlinksFor(activeFile);
  }
  return result;
}

afterEach(() => {
  vi.useFakeTimers();
  for (const root of openRoots) {
    releaseRoot(root);
  }
  vi.advanceTimersByTime(61_000);
  vi.useRealTimers();
  openRoots.clear();
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Windows-Handle noch gesperrt: Temp-Rest ist unkritisch.
    }
  }
  tmpDirs = [];
});

const OPTS = { assignField: 'class', profileName: 'Ereignis' };

async function makeFixture() {
  const root = makeRoot();
  const start = write(root, 'Start.md', '# Start\n');
  write(
    root,
    'Anna.md',
    [
      '---',
      'class: Ereignis',
      'event-date: 1990-03-10',
      'event-category: geburtstag',
      'event-recurring: true',
      '---',
      '# Anna',
      '',
    ].join('\n'),
  );
  write(
    root,
    'Projekt.md',
    [
      '---',
      // Zuordnungs-Wert case-insensitiv (freie Frontmatter-Schreibweise).
      'class: ereignis',
      'event-date: 2020-01-01',
      'event-text: Projektstart',
      'event-category: projekt',
      '---',
      '',
    ].join('\n'),
  );
  write(root, 'Kontakt.md', '---\nclass: Kontakt\nevent-date: 2021-01-01\n---\n');
  write(root, 'Ohne.md', '# ohne Frontmatter\n');
  await indexFor(start);
  return { root, start };
}

describe('events-aggregation — Grundmenge und Verfeinerung (4T-000515)', () => {
  it('liefert alle Dateien mit Ereignis-Profil-Zuordnung samt Feldern und mtime', async () => {
    const { root, start } = await makeFixture();
    const all = eventsForQuery(start, '', root, OPTS);
    expect(all.status).toBe('ready');
    expect(all.queryError).toBeUndefined();
    expect(all.events.map((e) => e.name).sort()).toEqual(['Anna', 'Projekt']);
    const anna = all.events.find((e) => e.name === 'Anna');
    expect(anna.fields.date).toBe('1990-03-10');
    expect(anna.fields.category).toBe('geburtstag');
    // event-text fehlt in der Quelle: der Titel-Fallback ist Sache des
    // Renderers, der Index liefert das Feld unbelegt.
    expect(anna.fields.text == null || anna.fields.text === '').toBe(true);
    expect([true, 'true']).toContain(anna.fields.recurring);
    expect(anna.mtimeMs).toBeGreaterThan(0);
    expect(anna.path.endsWith('Anna.md')).toBe(true);
  });

  it('verfeinert die Grundmenge über WHERE (Evaluator-Anbindung)', async () => {
    const { root, start } = await makeFixture();
    // String-Literale der Abfrage-Sprache stehen in Quotes (nackte Wörter
    // sind Feld-Referenzen).
    const filtered = eventsForQuery(start, "WHERE event-category = 'projekt'", root, OPTS);
    expect(filtered.status).toBe('ready');
    expect(filtered.events.map((e) => e.name)).toEqual(['Projekt']);
    // Die Kontakt-Datei erfüllt die WHERE-Bedingung nie mit — die
    // Profil-Zuordnung bleibt die Grundmenge.
    const dates = eventsForQuery(start, 'WHERE event-date >= date(2000-01-01)', root, OPTS);
    expect(dates.events.map((e) => e.name)).toEqual(['Projekt']);
  });

  it('meldet Syntax-Fehler und fremde Scopes als queryError', async () => {
    const { root, start } = await makeFixture();
    const broken = eventsForQuery(start, 'WHERE (kaputt', root, OPTS);
    expect(broken.status).toBe('ready');
    expect(broken.queryError).toBeTruthy();
    expect(broken.events).toEqual([]);
    const tasks = eventsForQuery(start, 'LIST TASKS', root, OPTS);
    expect(tasks.queryError && tasks.queryError.code).toBe('eventsFilesOnly');
  });
});
