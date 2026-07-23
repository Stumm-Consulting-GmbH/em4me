// Absichtlich defekte Erweiterung (4T-0298): activate() wirft. Erwartetes
// Verhalten: Rollback, automatische Deaktivierung, Fehlertext im
// Einstellungs-Bereich — kein Absturz.
export default {
  activate() {
    throw new Error('Absichtlich defekt (Test 4T-0298)');
  },
};
