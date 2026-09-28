// 4T-001728 (Epic 3E-000305): Fenster-Seite der Wecker- und Timer-Meldung in
// allen Fenstern (src/renderer/modules/clock/clock-due-sync.js) — Räumen nach
// einer Bearbeitung in einem anderen Fenster und Nachholen des offenen Stands
// ohne eine bereits geräumte Meldung.
import { describe, it, expect } from 'vitest';
import { verbindeUhrMeldung } from '../../../src/renderer/modules/clock/clock-due-sync.js';

function aufbau({ offen = { items: [] }, dialogOffen = true } = {}) {
  const pending = new Map();
  const spur = [];
  let handler = null;
  const meldung = verbindeUhrMeldung({
    onHandled: (cb) => {
      handler = cb;
    },
    offene: async () => offen,
    keyOf: (item) => item.id,
    pending,
    istOffen: () => dialogOffen,
    schliessen: () => spur.push('geschlossen'),
    neuZeichnen: () => spur.push('neu gezeichnet'),
    zeigen: (payload) => {
      spur.push(`gezeigt ${payload.items.map((i) => i.id).join(',')}`);
      for (const item of payload.items) pending.set(item.id, item);
    },
  });
  return { meldung, pending, spur, raeumen: (keys) => handler({ keys }) };
}

describe('verbindeUhrMeldung (4T-001728)', () => {
  it('räumt einen Eintrag und zeichnet neu, solange andere bleiben; schließt mit dem letzten', () => {
    const a = aufbau();
    a.pending.set('t1', { id: 't1' });
    a.pending.set('t2', { id: 't2' });
    a.raeumen(['t1']);
    expect([...a.pending.keys()]).toEqual(['t2']);
    a.raeumen(['t2']);
    expect(a.spur).toEqual(['neu gezeichnet', 'geschlossen']);
  });

  it('eine Räum-Meldung für fremde Schlüssel oder bei geschlossenem Dialog bewirkt nichts', () => {
    const a = aufbau({ dialogOffen: false });
    a.pending.set('t1', { id: 't1' });
    a.raeumen(['anderer']);
    a.raeumen(['t1']);
    expect(a.spur).toEqual([]);
    expect(a.pending.size).toBe(0);
  });

  it('nachholen zeigt nur, was nicht schon geräumt ist; eine neue Zustellung hebt den Vermerk auf', async () => {
    const a = aufbau({ offen: { items: [{ id: 't1' }, { id: 't2' }] } });
    a.raeumen(['t1']);
    await a.meldung.nachholen();
    expect(a.spur).toEqual(['gezeigt t2']);
    a.meldung.zugestellt([{ id: 't1' }]);
    await a.meldung.nachholen();
    expect(a.spur.at(-1)).toBe('gezeigt t1,t2');
  });
});
