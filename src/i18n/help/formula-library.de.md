# Formel-Bibliothek

Die Formel-Bibliothek bringt fertige, geprüfte Formeln in die Ausdrucks-Sprache der [Perspective-Abfrage](frontmatter-query.md): Feuchte und Taupunkt, Finanzmathematik, Prozentrechnung, Einheiten-Umrechnung, den Body-Mass-Index und Naturkonstanten. Eine Formel rechnet überall, wo die Anwendung rechnet, und liefert für dieselben Angaben überall dasselbe Ergebnis: in den [Inline-Berechnungen](inline.md) im Fließtext, in den berechneten Spalten der [Perspective Datatable](datatable.md), in Abfragen und in den Formel-Feldern der [Eigenschafts-Profile](property-profiles.md).

```markdown
Taupunkt {= round(humidity.dewpoint(20, 50), 1) =} °C, Rate {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, Körpertemperatur {= round(unit.celsiustofahrenheit(37), 1) =} °F
```

Taupunkt {= round(humidity.dewpoint(20, 50), 1) =} °C, Rate {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, Körpertemperatur {= round(unit.celsiustofahrenheit(37), 1) =} °F

Dazu gehören die mathematischen Grundfunktionen und Konstanten des Kerns, etwa `round`, `pow` und `pi()`. Sie sind kein Teil der Erweiterung, sondern rechnen immer (Abschnitt «Grundfunktionen und mathematische Konstanten»).

## Aufruf und Angaben

- **Namensraum je Kategorie:** Eine Formel wird als Funktion mit dem Namen ihrer Kategorie vor dem Punkt aufgerufen, etwa `humidity.dewpoint(20, 50)` oder `finance.pmt(0.08/12, 10, 10000)`. Die Namen sind englisch wie der übrige Funktions-Katalog, gelten in allen Sprachfassungen gleich und werden ohne Unterschied der Groß- und Kleinschreibung erkannt.
- **Reine Zahlen:** Jede Angabe ist eine Zahl in der Einheit, die die Tabellen unten nennen, etwa die Temperatur in °C oder die relative Feuchte in Prozent; das Ergebnis ist ebenso eine Zahl in der genannten Einheit. Eine Rechnung mit Einheiten findet nicht statt. Statt einer Zahl darf ein Feld stehen, das eine Zahl enthält.
- **Angaben in eckigen Klammern** sind ausgelassene Angaben mit Vorgabe. Weggelassen werden sie nur von hinten: Wer die fünfte Angabe braucht, schreibt die vierte mit.
- **Konstanten** werden wie eine Funktion ohne Angaben mit Klammern aufgerufen, `pi()` oder `const.c()`. Ein Wort ohne Klammern bleibt, was es ist, der Name eines Feldes: Eine Eigenschaft `pi` bleibt eine Eigenschaft.
- **Keine Kurzschreibweisen:** Es gibt keinen Potenz-Operator `^`, keinen Rest-Operator, keine Prozent-Schreibweise wie `8%` und keine Zahl mit Exponent wie `1e-5`. Potenz und Rest rechnen `pow` und `mod`, eine sehr kleine Zahl entsteht als Bruch wie `1/100000`, und Prozent ist eine Zahl.
- **Anzeige des Ergebnisses:** Ergebnisse erscheinen wie alle Rechen-Ergebnisse mit dem Punkt als Dezimaltrennzeichen, sehr große und sehr kleine Werte in Exponent-Schreibweise, etwa `6.02214076e+23`. Gerundet wird mit `round`, sprachgerecht dargestellt mit `numberformat` und `currencyformat`, etwa `numberformat(humidity.dewpoint(20, 50), 1)`.

## Erweiterung und Arbeitsmodus

Die Formeln der Kategorien gehören zur Erweiterung **«Formel-Bibliothek»** unter „Datei → Einstellungen → Erweiterungen“. Sie ist im Arbeitsmodus **Voll** eingeschaltet und in den Modi Fortgeschritten und Einsteiger ausgeschaltet; ihr Schalter lässt sich in jedem Modus einzeln umlegen (Seite [Erweiterungen](extensions.md)). Ein Umschalten wirkt in offenen Dokumenten beim nächsten Rechnen, ohne Neustart.

**Ausgeschaltet** bleibt ein Aufruf unverändert im Quelltext stehen und zeigt an der Stelle des Ergebnisses den Hinweis **«Formel-Bibliothek ausgeschaltet»** statt der Meldung zu einer unbekannten Funktion, in der Form, in der der Ort Meldungen zeigt:

- **Inline-Berechnung im Fließtext:** das Warnzeichen ⚠︎, der Hinweis beim Darüberfahren.
- **Berechnete Spalte einer Datentabelle:** ein Strich «—» in jeder Zelle der Spalte, der Hinweis beim Darüberfahren. Die übrigen Spalten rechnen weiter, und die Tabelle bleibt bearbeitbar.
- **Abfrage:** Der Block zeigt statt seines Ergebnisses den Hinweis, wie bei jedem Fehler einer Abfrage.
- **Formel-Feld eines Eigenschafts-Profils:** Das Feld bleibt leer, der Hinweis steht am Feld.
- **Regeln der [Datenbank](database.md):** Eine Prüfregel oder Bedingung der Bearbeitbarkeit, die eine Formel der Bibliothek nutzt, entfällt nicht, sondern gilt als nicht auswertbar: Ein Speichern, das sie prüfen müsste, wird abgewiesen, und eine Bedingung der Bearbeitbarkeit sperrt den Datensatz. Ein Hinweis in der Definition nennt den Grund. In einer Maske bleibt ein Wert-Platzhalter mit einer solchen Formel leer und markiert, ein bedingter Bereich verborgen. Nach dem Einschalten wirkt alles wie zuvor.

**Grundfunktionen und Konstanten des Kerns rechnen immer**, in jedem Arbeitsmodus und auch bei ausgeschalteter Bibliothek, und keine andere Rechnung ändert sich durch den Schalter.

## Grundfunktionen und mathematische Konstanten

Zehn Grundfunktionen und vier Konstanten gehören zum Kern des Funktions-Katalogs, ohne Schalter. Rundung und Rest folgen der Norm OpenFormula (ISO/IEC 26300), Abschnitte «ROUND» und «MOD»; die Konstanten liefern ihren Wert in der vollen Genauigkeit einer Gleitkommazahl.

| Funktion | Zweck | Angaben → Ergebnis | Beispiel |
|---|---|---|---|
| `exp(x)` | Exponentialfunktion, e hoch x | Zahl → Zahl | `exp(0)` ergibt 1 |
| `ln(x)` | natürlicher Logarithmus | Zahl über 0 → Zahl | `ln(e())` ergibt 1 |
| `log10(x)` | Logarithmus zur Basis 10 | Zahl über 0 → Zahl | `log10(1000)` ergibt 3 |
| `pow(x, y)` | Potenz, x hoch y | Basis, Exponent → Zahl | `pow(2, 10)` ergibt 1024 |
| `sqrt(x)` | Quadratwurzel | Zahl ab 0 → Zahl | `sqrt(16)` ergibt 4 |
| `round(x[, n])` | Runden auf n Nachkommastellen (Vorgabe 0); ein Wert genau in der Mitte rundet von null weg, ein negatives n rundet links vom Komma | Zahl, [Stellen] → Zahl | `round(2.5)` ergibt 3, `round(-2.5)` ergibt −3, `round(pi() * 2, 2)` ergibt 6.28, `round(1234, -2)` ergibt 1200 |
| `abs(x)` | Betrag | Zahl → Zahl ab 0 | `abs(-3)` ergibt 3 |
| `floor(x)` | Abrunden auf die nächste kleinere ganze Zahl | Zahl → ganze Zahl | `floor(-1.5)` ergibt −2 |
| `ceil(x)` | Aufrunden auf die nächste größere ganze Zahl | Zahl → ganze Zahl | `ceil(-1.5)` ergibt −1 |
| `mod(a, b)` | Rest der Division; er trägt das Vorzeichen des Teilers | Zahl, Teiler ungleich 0 → Zahl | `mod(7, 3)` ergibt 1, `mod(-3, 2)` ergibt 1 |
| `pi()` | Kreiszahl π | keine → 3.141592653589793 | `round(pi() * 2, 2)` ergibt 6.28 |
| `e()` | Eulersche Zahl e | keine → 2.718281828459045 | `ln(e())` ergibt 1 |
| `phi()` | Goldener Schnitt (1 + √5) / 2 | keine → 1.618033988749895 | `round(phi(), 3)` ergibt 1.618 |
| `sqrt2()` | Wurzel aus 2 | keine → 1.4142135623730951 | `round(sqrt2(), 4)` ergibt 1.4142 |

Eine Angabe außerhalb des Definitionsbereichs (Wurzel einer negativen Zahl, Logarithmus von null oder einer negativen Zahl, Rest bei Teiler null), Text, der keine Zahl ist, und ein Ergebnis jenseits des darstellbaren Zahlenbereichs ergeben die Fehler-Darstellung des Ortes wie eine Division durch null, nie einen Wert wie «NaN» oder «Infinity». Fehlende oder überzählige Angaben, auch `pi(2)`, meldet der Ort wie eine falsche Argument-Anzahl.

## Feuchte und Taupunkt

Namensraum `humidity.`. Temperaturen in °C, relative Feuchte in Prozent von 0 bis 100, Dampfdruck in hPa, absolute Feuchte in g/m³.

**Quelle:** Magnus-Formel mit den Konstanten nach D. Sonntag (Meteorologische Zeitschrift, Neue Folge 3, 1994): über Wasser K₁ = 6,112 hPa, K₂ = 17,62, K₃ = 243,12 °C, über Eis K₁ = 6,112 hPa, K₂ = 22,46, K₃ = 272,62 °C; dieselben Konstanten und Bereiche nennt der Leitfaden der Weltorganisation für Meteorologie zu Instrumenten und Beobachtungsmethoden (WMO-Nr. 8, Kapitel 4 und Anhang 4.B). Die absolute Feuchte folgt aus der Gasgleichung des Wasserdampfs mit der spezifischen Gaskonstante 461,52 J/(kg·K).

| Formel | Zweck | Angaben → Ergebnis | Beispiel | Gültigkeitsbereich |
|---|---|---|---|---|
| `humidity.saturationpressure(t)` | Sättigungsdampfdruck über Wasser | Temperatur °C → hPa | `humidity.saturationpressure(20)` ergibt rund 23.33 | −45 bis 60 °C |
| `humidity.saturationpressureice(t)` | Sättigungsdampfdruck über Eis | Temperatur °C → hPa | `humidity.saturationpressureice(-10)` ergibt rund 2.60 | −65 bis 0,01 °C |
| `humidity.vaporpressure(t, rh)` | Dampfdruck aus relativer Feuchte | Temperatur °C, relative Feuchte % → hPa | `humidity.vaporpressure(20, 50)` ergibt rund 11.66 | −45 bis 60 °C, Feuchte 0 bis 100 % |
| `humidity.absolute(t, rh)` | absolute Feuchte aus relativer Feuchte | Temperatur °C, relative Feuchte % → g/m³ | `humidity.absolute(21, 40)` ergibt rund 7.31 | −45 bis 60 °C, Feuchte 0 bis 100 % |
| `humidity.relative(t, ah)` | relative Feuchte aus absoluter Feuchte | Temperatur °C, absolute Feuchte g/m³ → % | `humidity.relative(34.4, 7.6)` ergibt rund 19.87 | −45 bis 60 °C, absolute Feuchte ab 0 bis zum Sättigungswert |
| `humidity.dewpoint(t, rh)` | Taupunkt | Temperatur °C, relative Feuchte % → °C | `round(humidity.dewpoint(20, 50), 1)` ergibt 9.3 | −45 bis 60 °C, Feuchte über 0 bis 100 %, Taupunkt ab −45 °C |
| `humidity.relativefromdewpoint(t, td)` | relative Feuchte aus dem Taupunkt | Temperatur °C, Taupunkt °C → % | `humidity.relativefromdewpoint(20, 9.26)` ergibt rund 50 | beide −45 bis 60 °C, Taupunkt nicht über der Temperatur |

- **Unter 0 °C** rechnen Dampfdruck, absolute und relative Feuchte und Taupunkt über Wasser (unterkühltes Wasser), wie es die meteorologische Konvention für die relative Feuchte vorsieht (WMO-Nr. 8, Anhang 4.A); den Wert über Eis liefert allein `humidity.saturationpressureice`.
- **Eine Näherung:** Zwischen Taupunkt und relativer Feuchte gibt es nur Näherungen; die Magnus-Formel weicht von genaueren Tafeln um einige Promille ab. Gerechnet wird für reinen Wasserdampf, ohne den Korrekturfaktor für feuchte Luft unter Luftdruck.
- **Mehr als gesättigt** ist außerhalb des Bereichs: Ein Taupunkt über der Temperatur oder eine absolute Feuchte über dem Sättigungswert ergäbe eine relative Feuchte über 100 % und zeigt eine Meldung.

## Finanzmathematik

Namensraum `finance.`. Der **Zinssatz** ist ein Anteil je Periode, also `0.08/12` für 8 Prozent im Jahr bei Monatsraten. **Vorzeichen-Regel:** ausgezahltes Geld ist negativ, eingenommenes positiv. **Zahlungs-Zeitpunkt** `type`: 0 am Periodenende (Vorgabe), 1 am Periodenanfang. Ergebnisse sind Beträge in der Währung der Angaben oder ein Zinssatz als Anteil; eine Währung wird nicht geprüft.

**Quelle:** Norm OpenFormula (ISO/IEC 26300), Abschnitte der gleichnamigen Funktionen («PMT», «PV», «FV», «NPV», «IRR», «RATE», «NPER», «EFFECT», «NOMINAL»), mit der Annuitäten-Gleichung 0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv und dem Sonderfall Zins 0: pmt · nper + pv + fv = 0.

| Formel | Zweck | Angaben → Ergebnis | Beispiel | Gültigkeitsbereich |
|---|---|---|---|---|
| `finance.pmt(rate, nper, pv[, fv[, type]])` | Rate einer Annuität | Zins je Periode, Laufzeit in Perioden, Barwert, [Endwert = 0], [Zeitpunkt = 0] → Rate | `finance.pmt(0.08/12, 10, 10000)` ergibt rund −1037.03, mit Zeitpunkt 1 rund −1030.16 | Zins über −1, Laufzeit über 0 |
| `finance.pv(rate, nper, pmt[, fv[, type]])` | Barwert | Zins, Laufzeit, Rate, [Endwert = 0], [Zeitpunkt = 0] → Barwert | `finance.pv(0.08/12, 48, 500, 20000)` ergibt rund −35019.37 | Zins über −1 |
| `finance.fv(rate, nper, pmt[, pv[, type]])` | Endwert | Zins, Laufzeit, Rate, [Barwert = 0], [Zeitpunkt = 0] → Endwert | `finance.fv(0.06/12, 10, -200, -500, 1)` ergibt rund 2581.40 | Zins über −1 |
| `finance.npv(rate, value1[, value2, …])` | Kapitalwert | Zins, Zahlungen → Kapitalwert | `finance.npv(0.1, -10000, 3000, 4200, 6800)` ergibt rund 1188.44 | Zins über −1; die erste Zahlung liegt eine Periode nach Beginn, eine Zahlung zum Beginn wird außerhalb addiert |
| `finance.irr(values[, guess])` | interner Zinsfuß | Zahlungen als Listen-Feld, [Schätzwert = 0.1] → Zins | mit dem Listen-Feld `zahlungen: [-10000, 3500, 7600, 1000]` ergibt `finance.irr(zahlungen)` rund 0.1133 | mindestens eine negative und eine positive Zahlung, Schätzwert über −1 |
| `finance.rate(nper, pmt, pv[, fv[, type[, guess]]])` | Zins einer Annuität | Laufzeit, Rate, Barwert, [Endwert = 0], [Zeitpunkt = 0], [Schätzwert = 0.1] → Zins je Periode | `finance.rate(48, -200, 8000)` ergibt rund 0.0077, also 0,77 % im Monat | Laufzeit über 0, Schätzwert über −1 |
| `finance.nper(rate, pmt, pv[, fv[, type]])` | Laufzeit einer Annuität | Zins, Rate, Barwert, [Endwert = 0], [Zeitpunkt = 0] → Laufzeit in Perioden | `finance.nper(0.12/12, -100, -1000, 10000, 1)` ergibt rund 59.67 | Zins über −1; eine negative Laufzeit ist ein gültiges Ergebnis |
| `finance.effect(rate, periods)` | Effektivzins aus Nominalzins | Nominalzins als Anteil, Zins-Perioden im Jahr → Effektivzins als Anteil | `finance.effect(0.0525, 4)` ergibt rund 0.053543 | Nominalzins ab 0, Perioden ab 1 |
| `finance.nominal(rate, periods)` | Nominalzins aus Effektivzins | Effektivzins als Anteil, Zins-Perioden im Jahr → Nominalzins als Anteil | `finance.nominal(0.053543, 4)` ergibt rund 0.0525 | Effektivzins über 0, Perioden ab 1 |

Die Zahl der Zins-Perioden ist eine ganze Zahl; ein Nachkommateil wird abgeschnitten. Interner Zinsfuß und Zins werden schrittweise gerechnet; findet die Rechnung keine Lösung, zeigt sie die Meldung «Zinssatz nicht bestimmbar: Die schrittweise Rechnung konvergiert nicht», und eine Laufzeit, die mit den Angaben nie erreicht wird, meldet «Laufzeit nicht bestimmbar».

### Zahlungen beim Kapitalwert und beim internen Zinsfuß

- **Kapitalwert:** Die Zahlungen stehen als einzelne Angaben, jede eine Zahl oder ein Listen-Feld, und zählen in der Reihenfolge der Angaben; bis zu 254 Zahlungs-Angaben sind möglich. Damit rechnet der Kapitalwert an allen vier Orten.
- **Interner Zinsfuß:** Die Zahlungen stehen als **ein Listen-Feld**, etwa eine Eigenschaft `zahlungen: [-10000, 3500, 7600, 1000]`; die erste Zahlung liegt zum Beginn. Der interne Zinsfuß rechnet deshalb in einer Abfrage, im Formel-Feld eines Eigenschafts-Profils und in den Regeln der Datenbank. **Im Fließtext und in einer berechneten Spalte gibt es keine Listen:** Dort erreicht ihn nur eine einzelne Zahl, und er zeigt die Meldung «Zahlungen ohne Vorzeichenwechsel».
- Ein Element einer Zahlungs-Liste, das keine Zahl ist oder fehlt, fällt nicht still weg, weil sich damit die Perioden aller folgenden Zahlungen verschöben; es zeigt die Meldung «Eine Angabe fehlt oder ist keine Zahl», ebenso eine leere Liste.

## Prozentrechnung

Namensraum `percent.`. Prozent-Angaben und Prozent-Ergebnisse sind Prozentzahlen, also 19 für 19 Prozent.

**Quelle:** die üblichen Rechen-Regeln der Prozentrechnung, als Rechnung in der Tabelle genannt.

| Formel | Zweck | Angaben → Ergebnis | Rechnung | Beispiel | Gültigkeitsbereich |
|---|---|---|---|---|---|
| `percent.share(part, whole)` | Anteil in Prozent | Teil, Ganzes → % | part / whole · 100 | `percent.share(5, 20)` ergibt 25 | Ganzes ungleich 0 |
| `percent.change(old, new)` | prozentuale Änderung, negativ bei Abnahme | alter Wert, neuer Wert → % | (new − old) / old · 100 | `percent.change(80, 100)` ergibt 25, `percent.change(100, 80)` ergibt −20 | alter Wert ungleich 0 |
| `percent.increase(value, p)` | um Prozent erhöhen | Wert, Prozent → Wert | value · (1 + p/100) | `percent.increase(200, 50)` ergibt 300 | keine Einschränkung |
| `percent.decrease(value, p)` | um Prozent vermindern | Wert, Prozent → Wert | value · (1 − p/100) | `percent.decrease(200, 50)` ergibt 100 | keine Einschränkung |
| `percent.base(w, p)` | Grundwert aus Prozentwert | Prozentwert, Prozent → Grundwert | w / (p/100) | `percent.base(30, 15)` ergibt 200 | Prozent ungleich 0 |

## Einheiten-Umrechnung

Namensraum `unit.`. Feste Umrechnungen je Einheiten-Paar, jeweils in beide Richtungen, mit einer Zahl als Angabe; ein allgemeines Umrechnungs-System mit Einheiten als Text gibt es nicht.

**Quelle:** NIST Special Publication 811 (Leitfaden zum Gebrauch des Internationalen Einheitensystems), Anhang B.8; alle Faktoren sind dort exakt.

| Formeln | Zweck | Rechnung | Beispiel |
|---|---|---|---|
| `unit.celsiustokelvin(t)`, `unit.kelvintocelsius(t)` | Celsius ↔ Kelvin | T/K = t/°C + 273,15 | `unit.celsiustokelvin(0)` ergibt 273.15 |
| `unit.celsiustofahrenheit(t)`, `unit.fahrenheittocelsius(t)` | Celsius ↔ Fahrenheit | t/°C = (t/°F − 32) / 1,8 | `unit.celsiustofahrenheit(37)` ergibt 98.6, `unit.fahrenheittocelsius(212)` ergibt 100 |
| `unit.kelvintofahrenheit(t)`, `unit.fahrenheittokelvin(t)` | Kelvin ↔ Fahrenheit | T/K = (t/°F + 459,67) / 1,8 | `unit.kelvintofahrenheit(273.15)` ergibt 32 |
| `unit.inchtometer(x)`, `unit.metertoinch(x)` | Zoll ↔ Meter | 1 in = 0,0254 m | `unit.inchtometer(1)` ergibt 0.0254 |
| `unit.foottometer(x)`, `unit.metertofoot(x)` | Fuß ↔ Meter | 1 ft = 0,3048 m | `unit.foottometer(1)` ergibt 0.3048 |
| `unit.yardtometer(x)`, `unit.metertoyard(x)` | Yard ↔ Meter | 1 yd = 0,9144 m | `unit.yardtometer(1)` ergibt 0.9144 |
| `unit.miletometer(x)`, `unit.metertomile(x)` | Meile ↔ Meter | 1 mi = 1609,344 m | `unit.miletometer(1)` ergibt 1609.344 |
| `unit.nauticalmiletometer(x)`, `unit.metertonauticalmile(x)` | Seemeile ↔ Meter | 1 sm = 1852 m | `unit.nauticalmiletometer(1)` ergibt 1852 |

**Kein Gültigkeitsbereich:** Die Umrechnungen sind exakte Definitions-Gleichungen ohne Bereich in der Quelle und prüfen deshalb keinen Bereich; auch eine negative Kelvin-Angabe oder eine negative Länge rechnet nach der Gleichung. Gemeldet werden allein eine Angabe, die keine Zahl ist, und ein Ergebnis jenseits des darstellbaren Zahlenbereichs. Hin- und Rückumrechnung ergeben den Ausgangswert im Rahmen der Gleitkomma-Genauigkeit.

## Gesundheit

Namensraum `health.`.

**Quelle:** Weltgesundheitsorganisation (WHO), Fact sheet «Obesity and overweight» und Global Health Observatory «Body mass index»; das Beispiel nennt das WHO-Regionalbüro für Europa im Fact sheet «Nutrition for a healthy life».

| Formel | Zweck | Angaben → Ergebnis | Rechnung | Beispiel | Gültigkeitsbereich |
|---|---|---|---|---|---|
| `health.bmi(mass, height)` | Body-Mass-Index | Masse kg, Größe m → kg/m² | mass / height² | `round(health.bmi(70, 1.75), 1)` ergibt 22.9 | Masse und Größe über 0 |

Die Formel liefert allein die Zahl und ordnet sie keiner Gewichts-Klasse zu. Für die Einordnung nennt die WHO diese Schwellen, **die nur für Erwachsene gelten**:

- **Untergewicht:** unter 18,5
- **Übergewicht:** ab 25
- **Adipositas:** ab 30

Für Kinder und Jugendliche gelten alters- und geschlechtsbezogene Schwellen; dort trägt der Wert allein keine Einordnung. Eine medizinische Bewertung nimmt die Anwendung nicht vor.

## Naturkonstanten

Namensraum `const.`. Aufruf wie eine Funktion ohne Angaben, mit Klammern; eine Angabe in den Klammern, etwa `const.c(1)`, ist ein Fehler.

| Konstante | Bedeutung | Wert | Einheit | Quelle |
|---|---|---|---|---|
| `const.c()` | Lichtgeschwindigkeit im Vakuum | 299792458 (exakt) | m/s | CODATA 2018 |
| `const.g()` | Normfallbeschleunigung | 9.80665 (exakt) | m/s² | SI-Broschüre des BIPM, 9. Auflage |
| `const.t0()` | Nullpunkt der Celsius-Skala in Kelvin (Bezugstemperatur T₀), Versatz der Temperatur-Umrechnung | 273.15 (exakt) | K | SI-Broschüre des BIPM, 9. Auflage, Kelvin |
| `const.na()` | Avogadro-Konstante | 6.02214076e+23 (exakt) | 1/mol | CODATA 2018 |
| `const.r()` | allgemeine Gaskonstante | 8.31446261815324 (exakt, Produkt aus Avogadro- und Boltzmann-Konstante) | J/(mol·K) | CODATA 2018 |
| `const.h()` | Planck-Konstante | 6.62607015e-34 (exakt) | J·s | CODATA 2018 |
| `const.p0()` | Normdruck der Standardatmosphäre | 1013.25 (Definition) | hPa | SI-Broschüre des BIPM, Standardatmosphäre |

`const.t0()` ist nicht der absolute Nullpunkt; der liegt bei 0 K, also −273,15 °C. Die Werte erscheinen an allen vier Orten mit allen Stellen, die beiden sehr großen und sehr kleinen in Exponent-Schreibweise.

## Meldungen statt Werte

Eine Angabe außerhalb des Gültigkeitsbereichs einer Formel ergibt **nie einen Wert**, sondern an der Stelle des Ergebnisses eine Meldung, die Angabe und Bereich nennt, etwa «Relative Feuchte außerhalb des Bereichs von über 0 bis 100 %» bei `humidity.dewpoint(20, 120)`. Ebenso gemeldet werden eine fehlende Angabe oder Text, der keine Zahl ist («Formel: Eine Angabe fehlt oder ist keine Zahl»), ein Ergebnis jenseits des darstellbaren Zahlenbereichs und eine schrittweise Rechnung ohne Lösung.

- **Inline-Berechnung:** das Warnzeichen ⚠︎, die Meldung beim Darüberfahren.
- **Berechnete Spalte:** ein Strich «—» in der Zelle, die Meldung beim Darüberfahren; die übrigen Zellen rechnen weiter, und eine Spalte, die auf diese Zelle verweist, übernimmt die Meldung.
- **Abfrage:** das Warnzeichen ⚠︎ in der Zelle, die Meldung beim Darüberfahren; in einer Bedingung (`WHERE`) gilt die Meldung als nicht erfüllt, beim Sortieren (`SORT`) steht sie am Ende, und `count` zählt sie nicht mit.
- **Formel-Feld:** Das Feld bleibt leer, die Meldung steht am Feld; ein Feld, das auf dieses Feld verweist, übernimmt die Meldung.
- **Regel der Datenbank:** Eine Prüfregel oder Bedingung, deren Formel eine Meldung liefert, gilt als nicht auswertbar; das Speichern wird abgewiesen, und eine Bedingung der Bearbeitbarkeit sperrt den Datensatz.

## Grenzen

- **Keine eigenen Formeln:** Die Bibliothek enthält die Formeln dieser Seite; eigene Formeln lassen sich nicht hinzufügen.
- **Keine Einheiten-Rechnung:** Angaben und Ergebnisse sind reine Zahlen in der genannten Einheit.
- **Feste Einheiten-Paare:** Umgerechnet werden Temperatur und Länge; Masse, Volumen, Energie und Druck rechnet die Bibliothek nicht um.
- **Keine sprachabhängige Ausgabe:** Ergebnisse erscheinen mit dem Punkt als Dezimaltrennzeichen; sprachgerecht über `numberformat` und `currencyformat`.
