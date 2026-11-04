# Formula library

The formula library brings ready-made, verified formulas into the expression language of the [Perspective Query](frontmatter-query.md): humidity and dew point, financial mathematics, percentages, unit conversion, the body mass index and physical constants. A formula calculates wherever the application calculates and returns the same result for the same arguments everywhere: in [inline calculations](inline.md) in running text, in the computed columns of the [Perspective Datatable](datatable.md), in queries and in the formula fields of [property profiles](property-profiles.md).

```markdown
Dew point {= round(humidity.dewpoint(20, 50), 1) =} °C, payment {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, body temperature {= round(unit.celsiustofahrenheit(37), 1) =} °F
```

Dew point {= round(humidity.dewpoint(20, 50), 1) =} °C, payment {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, body temperature {= round(unit.celsiustofahrenheit(37), 1) =} °F

Alongside them come the basic mathematical functions and constants of the core, such as `round`, `pow` and `pi()`. They are not part of the extension and always calculate (section «Basic functions and mathematical constants»).

## Calling a formula and its arguments

- **One namespace per category:** a formula is called as a function with the name of its category before the dot, such as `humidity.dewpoint(20, 50)` or `finance.pmt(0.08/12, 10, 10000)`. The names are English like the rest of the function catalogue, are the same in every language version and are recognised regardless of upper and lower case.
- **Plain numbers:** every argument is a number in the unit the tables below name, such as the temperature in °C or the relative humidity in percent; the result is likewise a number in the stated unit. No calculation with units takes place. A field containing a number may stand in place of a number.
- **Arguments in square brackets** are optional arguments with a default. They can only be left out from the end: whoever needs the fifth argument writes the fourth as well.
- **Constants** are called like a function without arguments, with parentheses: `pi()` or `const.c()`. A word without parentheses stays what it is, the name of a field: a property `pi` stays a property.
- **No shorthand notations:** there is no power operator `^`, no remainder operator, no percent notation such as `8%` and no number with an exponent such as `1e-5`. `pow` and `mod` calculate power and remainder, a very small number is written as a fraction such as `1/100000`, and a percentage is a number.
- **How results appear:** results appear like all calculation results with the point as decimal separator, very large and very small values in exponent notation, such as `6.02214076e+23`. Round with `round`, render localised with `numberformat` and `currencyformat`, such as `numberformat(humidity.dewpoint(20, 50), 1)`.

## Extension and working mode

The formulas of the categories belong to the extension **«Formula library»** under "File → Settings → Extensions". It is switched on in the **Full** working mode and switched off in the Advanced and Beginner modes; its switch can be changed individually in every mode (page [Extensions](extensions.md)). Switching takes effect in open documents at the next calculation, without a restart.

**When switched off**, a call stays unchanged in the source and shows the notice **«Formula library switched off»** in place of the result instead of the message about an unknown function, in the form in which the place shows messages:

- **Inline calculation in running text:** the warning sign ⚠︎, the notice on hover.
- **Computed column of a datatable:** a dash «—» in every cell of the column, the notice on hover. The other columns keep calculating, and the table stays editable.
- **Query:** the block shows the notice instead of its result, as with any error in a query.
- **Formula field of a property profile:** the field stays empty, and the notice is shown at the field.
- **Rules of the [database](database.md):** a validation rule or editability condition that uses a formula of the library is not dropped but counts as not evaluable: a save that would have to check it is rejected, and an editability condition locks the record. A notice in the definition names the reason. In a form, a value placeholder with such a formula stays empty and marked, and a conditional section stays hidden. After switching on again, everything works as before.

**The basic functions and constants of the core always calculate**, in every working mode and also with the library switched off, and no other calculation changes through the switch.

## Basic functions and mathematical constants

Ten basic functions and four constants belong to the core of the function catalogue, without a switch. Rounding and remainder follow the OpenFormula standard (ISO/IEC 26300), sections «ROUND» and «MOD»; the constants return their value with the full precision of a floating-point number.

| Function | Purpose | Arguments → result | Example |
|---|---|---|---|
| `exp(x)` | exponential function, e to the power of x | number → number | `exp(0)` yields 1 |
| `ln(x)` | natural logarithm | number above 0 → number | `ln(e())` yields 1 |
| `log10(x)` | logarithm to base 10 | number above 0 → number | `log10(1000)` yields 3 |
| `pow(x, y)` | power, x to the power of y | base, exponent → number | `pow(2, 10)` yields 1024 |
| `sqrt(x)` | square root | number from 0 → number | `sqrt(16)` yields 4 |
| `round(x[, n])` | round to n decimals (default 0); a value exactly halfway rounds away from zero, a negative n rounds to the left of the decimal point | number, [digits] → number | `round(2.5)` yields 3, `round(-2.5)` yields −3, `round(pi() * 2, 2)` yields 6.28, `round(1234, -2)` yields 1200 |
| `abs(x)` | absolute value | number → number from 0 | `abs(-3)` yields 3 |
| `floor(x)` | round down to the next smaller whole number | number → whole number | `floor(-1.5)` yields −2 |
| `ceil(x)` | round up to the next larger whole number | number → whole number | `ceil(-1.5)` yields −1 |
| `mod(a, b)` | remainder of the division; it carries the sign of the divisor | number, divisor other than 0 → number | `mod(7, 3)` yields 1, `mod(-3, 2)` yields 1 |
| `pi()` | the circle constant π | none → 3.141592653589793 | `round(pi() * 2, 2)` yields 6.28 |
| `e()` | Euler's number e | none → 2.718281828459045 | `ln(e())` yields 1 |
| `phi()` | golden ratio (1 + √5) / 2 | none → 1.618033988749895 | `round(phi(), 3)` yields 1.618 |
| `sqrt2()` | square root of 2 | none → 1.4142135623730951 | `round(sqrt2(), 4)` yields 1.4142 |

An argument outside the domain (square root of a negative number, logarithm of zero or of a negative number, remainder with a divisor of zero), text that is not a number and a result beyond the representable number range produce the error display of the place like a division by zero, never a value such as «NaN» or «Infinity». Missing or surplus arguments, `pi(2)` included, are reported by the place like a wrong number of arguments.

## Humidity and dew point

Namespace `humidity.`. Temperatures in °C, relative humidity in percent from 0 to 100, vapour pressure in hPa, absolute humidity in g/m³.

**Source:** the Magnus formula with the constants after D. Sonntag (Meteorologische Zeitschrift, Neue Folge 3, 1994): over water K₁ = 6.112 hPa, K₂ = 17.62, K₃ = 243.12 °C, over ice K₁ = 6.112 hPa, K₂ = 22.46, K₃ = 272.62 °C; the Guide to Meteorological Instruments and Methods of Observation of the World Meteorological Organization (WMO No. 8, chapter 4 and annex 4.B) gives the same constants and ranges. The absolute humidity follows from the gas equation of water vapour with the specific gas constant 461.52 J/(kg·K).

| Formula | Purpose | Arguments → result | Example | Valid range |
|---|---|---|---|---|
| `humidity.saturationpressure(t)` | saturation vapour pressure over water | temperature °C → hPa | `humidity.saturationpressure(20)` yields about 23.33 | −45 to 60 °C |
| `humidity.saturationpressureice(t)` | saturation vapour pressure over ice | temperature °C → hPa | `humidity.saturationpressureice(-10)` yields about 2.60 | −65 to 0.01 °C |
| `humidity.vaporpressure(t, rh)` | vapour pressure from relative humidity | temperature °C, relative humidity % → hPa | `humidity.vaporpressure(20, 50)` yields about 11.66 | −45 to 60 °C, humidity 0 to 100 % |
| `humidity.absolute(t, rh)` | absolute humidity from relative humidity | temperature °C, relative humidity % → g/m³ | `humidity.absolute(21, 40)` yields about 7.31 | −45 to 60 °C, humidity 0 to 100 % |
| `humidity.relative(t, ah)` | relative humidity from absolute humidity | temperature °C, absolute humidity g/m³ → % | `humidity.relative(34.4, 7.6)` yields about 19.87 | −45 to 60 °C, absolute humidity from 0 up to the saturation value |
| `humidity.dewpoint(t, rh)` | dew point | temperature °C, relative humidity % → °C | `round(humidity.dewpoint(20, 50), 1)` yields 9.3 | −45 to 60 °C, humidity above 0 to 100 %, dew point from −45 °C |
| `humidity.relativefromdewpoint(t, td)` | relative humidity from the dew point | temperature °C, dew point °C → % | `humidity.relativefromdewpoint(20, 9.26)` yields about 50 | both −45 to 60 °C, dew point not above the temperature |

- **Below 0 °C**, vapour pressure, absolute and relative humidity and dew point are calculated over water (supercooled water), as the meteorological convention for relative humidity prescribes (WMO No. 8, annex 4.A); only `humidity.saturationpressureice` returns the value over ice.
- **An approximation:** between dew point and relative humidity there are only approximations; the Magnus formula deviates from more precise tables by a few per mille. The calculation is for pure water vapour, without the correction factor for moist air under air pressure.
- **More than saturated** is outside the range: a dew point above the temperature or an absolute humidity above the saturation value would mean a relative humidity above 100 % and shows a message.

## Financial mathematics

Namespace `finance.`. The **interest rate** is a fraction per period, so `0.08/12` for 8 percent a year with monthly payments. **Sign rule:** money paid out is negative, money received positive. **Payment timing** `type`: 0 at the end of the period (default), 1 at the start of the period. Results are amounts in the currency of the arguments or an interest rate as a fraction; no currency is checked.

**Source:** the OpenFormula standard (ISO/IEC 26300), sections of the functions of the same name («PMT», «PV», «FV», «NPV», «IRR», «RATE», «NPER», «EFFECT», «NOMINAL»), with the annuity equation 0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv and the special case of a zero rate: pmt · nper + pv + fv = 0.

| Formula | Purpose | Arguments → result | Example | Valid range |
|---|---|---|---|---|
| `finance.pmt(rate, nper, pv[, fv[, type]])` | payment of an annuity | rate per period, term in periods, present value, [future value = 0], [timing = 0] → payment | `finance.pmt(0.08/12, 10, 10000)` yields about −1037.03, with timing 1 about −1030.16 | rate above −1, term above 0 |
| `finance.pv(rate, nper, pmt[, fv[, type]])` | present value | rate, term, payment, [future value = 0], [timing = 0] → present value | `finance.pv(0.08/12, 48, 500, 20000)` yields about −35019.37 | rate above −1 |
| `finance.fv(rate, nper, pmt[, pv[, type]])` | future value | rate, term, payment, [present value = 0], [timing = 0] → future value | `finance.fv(0.06/12, 10, -200, -500, 1)` yields about 2581.40 | rate above −1 |
| `finance.npv(rate, value1[, value2, …])` | net present value | rate, cash flows → net present value | `finance.npv(0.1, -10000, 3000, 4200, 6800)` yields about 1188.44 | rate above −1; the first cash flow lies one period after the start, a cash flow at the start is added outside |
| `finance.irr(values[, guess])` | internal rate of return | cash flows as a list field, [estimate = 0.1] → rate | with the list field `payments: [-10000, 3500, 7600, 1000]`, `finance.irr(payments)` yields about 0.1133 | at least one negative and one positive cash flow, estimate above −1 |
| `finance.rate(nper, pmt, pv[, fv[, type[, guess]]])` | interest rate of an annuity | term, payment, present value, [future value = 0], [timing = 0], [estimate = 0.1] → rate per period | `finance.rate(48, -200, 8000)` yields about 0.0077, that is 0.77 % a month | term above 0, estimate above −1 |
| `finance.nper(rate, pmt, pv[, fv[, type]])` | term of an annuity | rate, payment, present value, [future value = 0], [timing = 0] → term in periods | `finance.nper(0.12/12, -100, -1000, 10000, 1)` yields about 59.67 | rate above −1; a negative term is a valid result |
| `finance.effect(rate, periods)` | effective rate from nominal rate | nominal rate as a fraction, compounding periods per year → effective rate as a fraction | `finance.effect(0.0525, 4)` yields about 0.053543 | nominal rate from 0, periods from 1 |
| `finance.nominal(rate, periods)` | nominal rate from effective rate | effective rate as a fraction, compounding periods per year → nominal rate as a fraction | `finance.nominal(0.053543, 4)` yields about 0.0525 | effective rate above 0, periods from 1 |

The number of compounding periods is a whole number; a fractional part is cut off. The internal rate of return and the interest rate are calculated step by step; if the calculation finds no solution, it shows the message «Interest rate cannot be determined: the iterative calculation does not converge», and a term that is never reached with the arguments reports «Number of periods cannot be determined».

### Cash flows for net present value and internal rate of return

- **Net present value:** the cash flows are given as individual arguments, each a number or a list field, and count in the order of the arguments; up to 254 cash-flow arguments are possible. The net present value therefore calculates at all four places.
- **Internal rate of return:** the cash flows are given as **one list field**, such as a property `payments: [-10000, 3500, 7600, 1000]`; the first cash flow lies at the start. The internal rate of return therefore calculates in a query, in the formula field of a property profile and in the rules of the database. **Running text and computed columns have no lists:** there it only receives a single number and shows the message «Cash flows without a change of sign».
- An element of a cash-flow list that is not a number or is missing does not silently drop out, because that would shift the periods of all following cash flows; it shows the message «Formula: an input is missing or not a number», as does an empty list.

## Percentages

Namespace `percent.`. Percentage arguments and percentage results are percent figures, so 19 for 19 percent.

**Source:** the usual calculation rules of percentages, given as the calculation in the table.

| Formula | Purpose | Arguments → result | Calculation | Example | Valid range |
|---|---|---|---|---|---|
| `percent.share(part, whole)` | share in percent | part, whole → % | part / whole · 100 | `percent.share(5, 20)` yields 25 | whole other than 0 |
| `percent.change(old, new)` | percentage change, negative for a decrease | old value, new value → % | (new − old) / old · 100 | `percent.change(80, 100)` yields 25, `percent.change(100, 80)` yields −20 | old value other than 0 |
| `percent.increase(value, p)` | increase by a percentage | value, percent → value | value · (1 + p/100) | `percent.increase(200, 50)` yields 300 | no restriction |
| `percent.decrease(value, p)` | decrease by a percentage | value, percent → value | value · (1 − p/100) | `percent.decrease(200, 50)` yields 100 | no restriction |
| `percent.base(w, p)` | base value from percentage value | percentage value, percent → base value | w / (p/100) | `percent.base(30, 15)` yields 200 | percent other than 0 |

## Unit conversion

Namespace `unit.`. Fixed conversions per pair of units, each in both directions, with one number as argument; there is no general conversion system with units as text.

**Source:** NIST Special Publication 811 (Guide for the Use of the International System of Units), appendix B.8; all factors are exact there.

| Formulas | Purpose | Calculation | Example |
|---|---|---|---|
| `unit.celsiustokelvin(t)`, `unit.kelvintocelsius(t)` | Celsius ↔ kelvin | T/K = t/°C + 273.15 | `unit.celsiustokelvin(0)` yields 273.15 |
| `unit.celsiustofahrenheit(t)`, `unit.fahrenheittocelsius(t)` | Celsius ↔ Fahrenheit | t/°C = (t/°F − 32) / 1.8 | `unit.celsiustofahrenheit(37)` yields 98.6, `unit.fahrenheittocelsius(212)` yields 100 |
| `unit.kelvintofahrenheit(t)`, `unit.fahrenheittokelvin(t)` | kelvin ↔ Fahrenheit | T/K = (t/°F + 459.67) / 1.8 | `unit.kelvintofahrenheit(273.15)` yields 32 |
| `unit.inchtometer(x)`, `unit.metertoinch(x)` | inch ↔ metre | 1 in = 0.0254 m | `unit.inchtometer(1)` yields 0.0254 |
| `unit.foottometer(x)`, `unit.metertofoot(x)` | foot ↔ metre | 1 ft = 0.3048 m | `unit.foottometer(1)` yields 0.3048 |
| `unit.yardtometer(x)`, `unit.metertoyard(x)` | yard ↔ metre | 1 yd = 0.9144 m | `unit.yardtometer(1)` yields 0.9144 |
| `unit.miletometer(x)`, `unit.metertomile(x)` | mile ↔ metre | 1 mi = 1609.344 m | `unit.miletometer(1)` yields 1609.344 |
| `unit.nauticalmiletometer(x)`, `unit.metertonauticalmile(x)` | nautical mile ↔ metre | 1 nmi = 1852 m | `unit.nauticalmiletometer(1)` yields 1852 |

**No valid range:** the conversions are exact defining equations without a range in the source and therefore check no range; a negative kelvin value or a negative length is also calculated by the equation. Only an argument that is not a number and a result beyond the representable number range are reported. Converting there and back yields the starting value within floating-point precision.

## Health

Namespace `health.`.

**Source:** World Health Organization (WHO), fact sheet «Obesity and overweight» and Global Health Observatory «Body mass index»; the example is given by the WHO Regional Office for Europe in the fact sheet «Nutrition for a healthy life».

| Formula | Purpose | Arguments → result | Calculation | Example | Valid range |
|---|---|---|---|---|---|
| `health.bmi(mass, height)` | body mass index | mass kg, height m → kg/m² | mass / height² | `round(health.bmi(70, 1.75), 1)` yields 22.9 | mass and height above 0 |

The formula only returns the number and assigns it to no weight class. For the classification the WHO gives these thresholds, **which apply to adults only**:

- **Underweight:** below 18.5
- **Overweight:** from 25
- **Obesity:** from 30

For children and adolescents, age- and sex-specific thresholds apply; there the value alone carries no classification. The application makes no medical assessment.

## Physical constants

Namespace `const.`. Called like a function without arguments, with parentheses; an argument in the parentheses, such as `const.c(1)`, is an error.

| Constant | Meaning | Value | Unit | Source |
|---|---|---|---|---|
| `const.c()` | speed of light in vacuum | 299792458 (exact) | m/s | CODATA 2018 |
| `const.g()` | standard acceleration of gravity | 9.80665 (exact) | m/s² | SI Brochure of the BIPM, 9th edition |
| `const.t0()` | zero point of the Celsius scale in kelvin (reference temperature T₀), the offset of the temperature conversion | 273.15 (exact) | K | SI Brochure of the BIPM, 9th edition, kelvin |
| `const.na()` | Avogadro constant | 6.02214076e+23 (exact) | 1/mol | CODATA 2018 |
| `const.r()` | molar gas constant | 8.31446261815324 (exact, product of the Avogadro and Boltzmann constants) | J/(mol·K) | CODATA 2018 |
| `const.h()` | Planck constant | 6.62607015e-34 (exact) | J·s | CODATA 2018 |
| `const.p0()` | standard pressure of the standard atmosphere | 1013.25 (definition) | hPa | SI Brochure of the BIPM, standard atmosphere |

`const.t0()` is not absolute zero; that lies at 0 K, that is −273.15 °C. The values appear at all four places with all their digits, the very large and very small ones in exponent notation.

## Messages instead of values

An argument outside the valid range of a formula **never yields a value**, but a message in place of the result that names the argument and the range, such as «Relative humidity outside the range of above 0 to 100 %» for `humidity.dewpoint(20, 120)`. Likewise reported are a missing argument or text that is not a number («Formula: an input is missing or not a number»), a result beyond the representable number range and a step-by-step calculation without a solution.

- **Inline calculation:** the warning sign ⚠︎, the message on hover.
- **Computed column:** a dash «—» in the cell, the message on hover; the other cells keep calculating, and a column that refers to this cell takes over the message.
- **Query:** the warning sign ⚠︎ in the cell, the message on hover; in a condition (`WHERE`) the message counts as not met, in sorting (`SORT`) it comes last, and `count` does not count it.
- **Formula field:** the field stays empty, and the message is shown at the field; a field that refers to this field takes over the message.
- **Database rule:** a validation rule or condition whose formula returns a message counts as not evaluable; the save is rejected, and an editability condition locks the record.

## Limits

- **No formulas of your own:** the library contains the formulas on this page; you cannot add formulas of your own.
- **No calculation with units:** arguments and results are plain numbers in the stated unit.
- **Fixed pairs of units:** temperature and length are converted; the library does not convert mass, volume, energy or pressure.
- **No language-dependent output:** results appear with the point as decimal separator; localised via `numberformat` and `currencyformat`.
