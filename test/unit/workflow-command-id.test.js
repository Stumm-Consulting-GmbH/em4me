// 4T-002349 (Epic 3E-000184): Die Kennung des Kommandos eines Workflows
// (src/shared/workflows/workflow-command-id.js) und der dritte dynamische
// Namensraum der Kommando-Registry (src/shared/commands/commands.js).
import { describe, it, expect, afterEach } from 'vitest';
import {
  WORKFLOW_COMMAND_PREFIX,
  isLinkedWorkflowCommandId,
  linkedWorkflowCommandId,
  relPathOfCommandId,
  workflowCommandId,
} from '../../src/shared/workflows/workflow-command-id.js';
import { RESERVED_COMMAND_PREFIXES } from '../../src/shared/workflows/workflow-catalog.js';
import {
  COMMANDS,
  registerDynamicCommand,
  unregisterDynamicCommand,
} from '../../src/shared/commands/commands.js';

afterEach(() => {
  for (const id of ['workflow.a.md', 'ext.x.y', 'macro.m1', 'fremd.a'])
    unregisterDynamicCommand(id);
});

describe('workflowCommandId', () => {
  it('bildet workflow.<Pfad-Kennung> und kehrt sich um', () => {
    expect(workflowCommandId('Tag.md')).toBe('workflow.Tag.md');
    const id = workflowCommandId('Projekte/Ordner anlegen.md');
    expect(id).toBe('workflow.Projekte%2FOrdner%20anlegen.md');
    expect(relPathOfCommandId(id)).toBe('Projekte/Ordner anlegen.md');
  });

  it('trägt Umlaute, Punkte und Anführungszeichen umkehrbar, ohne " und \\', () => {
    for (const pfad of ['Wöchentlich/Rückblick.md', 'a.b.c.md', 'Er sagt "hallo".md', "it's.md"]) {
      const id = workflowCommandId(pfad);
      expect(id.startsWith(WORKFLOW_COMMAND_PREFIX)).toBe(true);
      expect(id).not.toMatch(/["\\]/);
      expect(relPathOfCommandId(id)).toBe(pfad);
    }
  });

  it('gibt derselben Datei in NFC und NFD dieselbe Kennung', () => {
    const nfc = 'Rückblick.md'.normalize('NFC');
    const nfd = 'Rückblick.md'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(workflowCommandId(nfd)).toBe(workflowCommandId(nfc));
  });

  it('trennt gleichnamige Dateien in verschiedenen Unterordnern (AK8 der Story 4S-001105)', () => {
    expect(workflowCommandId('A/Start.md')).not.toBe(workflowCommandId('B/Start.md'));
  });

  it('nimmt Rückstriche als Trenner und schneidet einen führenden Trenner ab', () => {
    expect(workflowCommandId('A\\Start.md')).toBe(workflowCommandId('A/Start.md'));
    expect(workflowCommandId('/A/Start.md')).toBe(workflowCommandId('A/Start.md'));
  });

  it('liefert null bei leerem Pfad und bei fremden oder kaputten Kennungen', () => {
    expect(workflowCommandId('')).toBeNull();
    expect(workflowCommandId(null)).toBeNull();
    expect(relPathOfCommandId('macro.a')).toBeNull();
    expect(relPathOfCommandId('workflow.')).toBeNull();
    expect(relPathOfCommandId('workflow.%E0%A4%A')).toBeNull();
  });

  it('steht unter den reservierten Präfixen des Katalogs (Befund commandReserved)', () => {
    expect(RESERVED_COMMAND_PREFIXES).toContain(WORKFLOW_COMMAND_PREFIX);
  });
});

describe('registerDynamicCommand: Namensraum workflow.', () => {
  it('nimmt workflow., ext. und macro. an und weist andere ab', () => {
    expect(registerDynamicCommand({ id: 'workflow.a.md', labelKey: 'x' })).toBe(true);
    expect(registerDynamicCommand({ id: 'ext.x.y', labelKey: 'x' })).toBe(true);
    expect(registerDynamicCommand({ id: 'macro.m1', labelKey: 'x' })).toBe(true);
    expect(registerDynamicCommand({ id: 'fremd.a', labelKey: 'x' })).toBe(false);
    const cmd = COMMANDS.find((c) => c.id === 'workflow.a.md');
    expect(cmd).toMatchObject({ dynamic: true, menu: false, categoryKey: 'help.group.general' });
  });
});

// 4T-002426 (Epic 3E-000366): Die Kennung eines Workflows aus einem verknüpften
// Bereich trägt das Kürzel der Quelle und fällt nie mit einer eigenen zusammen.
describe('linkedWorkflowCommandId (4T-002426)', () => {
  it('bildet workflow.@<Kürzel>:<Pfad-Kennung> mit dem Kürzel in Vergleichs-Form', () => {
    expect(linkedWorkflowCommandId('B', 'Fremd-Probe.md')).toBe('workflow.@b:Fremd-Probe.md');
    expect(linkedWorkflowCommandId('b', 'Ordner/A b.md')).toBe('workflow.@b:Ordner%2FA%20b.md');
    expect(linkedWorkflowCommandId('', 'x.md')).toBeNull();
    expect(linkedWorkflowCommandId('b', '')).toBeNull();
  });

  it('unterscheidet gleiche Pfade verschiedener Quellen und der eigenen', () => {
    const ids = new Set([
      workflowCommandId('A.md'),
      linkedWorkflowCommandId('b', 'A.md'),
      linkedWorkflowCommandId('c', 'A.md'),
      // Ein eigener Unterordner namens «@b» kollidiert nicht: `@` ist dort kodiert.
      workflowCommandId('@b:A.md'),
      workflowCommandId('@b/A.md'),
    ]);
    expect(ids.size).toBe(5);
  });

  it('erkennt fremde Kennungen; sie haben keinen Pfad im eigenen Ordner', () => {
    const fremd = linkedWorkflowCommandId('b', 'A.md');
    expect(isLinkedWorkflowCommandId(fremd)).toBe(true);
    expect(isLinkedWorkflowCommandId(workflowCommandId('@b/A.md'))).toBe(false);
    expect(relPathOfCommandId(fremd)).toBeNull();
    expect(relPathOfCommandId(workflowCommandId('@b/A.md'))).toBe('@b/A.md');
  });
});
