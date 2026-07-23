# Task-Marker

Fixture der Erweiterung „Aufgaben" (4T-0498, Epic 3E-0090). Alle Datums-Werte
sind bewusst stabil: 2020-01-01 ist immer ueberfaellig, 2099-12-31 nie. Keine
Daten nahe heute, damit der Snapshot maschinen- und zeitunabhaengig bleibt.

## Termine

- [ ] Faelliger Termin, ueberfaellig 📅 2020-01-01
- [ ] Faelliger Termin, Zukunft 📅 2099-12-31
- [ ] Faellig mit Uhrzeit 📅 2099-12-31 09:30
- [ ] Geplanter Termin ⏳ 2099-06-15
- [ ] Start-Termin 🛫 2099-03-01
- [ ] Erstellt-Datum ➕ 2020-01-01
- [x] Erledigt-Datum ✅ 2099-12-31
- [ ] Abgebrochen-Datum ❌ 2099-12-31
- [ ] Ungueltiges Datum 📅 2099-02-30

## Prioritaet

- [ ] Hoechste Prioritaet 🔺
- [ ] Hohe Prioritaet ⏫
- [ ] Mittlere Prioritaet 🔼
- [ ] Niedrige Prioritaet 🔽
- [ ] Niedrigste Prioritaet ⏬

## Wiederholung, ID und Abhaengigkeit

- [ ] Woechentliche Wiederholung 🔁 every week
- [ ] Aufgabe mit Kennung 🆔 abc123
- [ ] Abhaengige Aufgabe ⛔ abc123

## Toleranz-Marker

- [ ] Aufgabe mit Abschluss-Aktion 🏁 delete
- [ ] Aufgabe mit Erinnerung ⏰ 2099-12-31 08:00

## Sonderfaelle

- [ ] Zeile mit **Fett** und Termin 📅 2099-12-31
- Bullet ohne Checkbox mit 📅 2099-12-31 (kein Badge)
- [/] Erweiterter Status mit Termin 📅 2099-12-31
