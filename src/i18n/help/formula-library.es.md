# Biblioteca de fórmulas

La biblioteca de fórmulas aporta fórmulas listas y comprobadas al lenguaje de expresiones de la [Consulta Perspective](frontmatter-query.md): humedad y punto de rocío, matemáticas financieras, porcentajes, conversión de unidades, índice de masa corporal y constantes físicas. Una fórmula calcula en todos los lugares donde calcula la aplicación y da en todos ellos el mismo resultado para los mismos datos: en los [cálculos en línea](inline.md) del texto corrido, en las columnas calculadas de la [Perspective Datatable](datatable.md), en las consultas y en los campos de fórmula de los [perfiles de propiedades](property-profiles.md).

```markdown
Punto de rocío {= round(humidity.dewpoint(20, 50), 1) =} °C, cuota {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, temperatura corporal {= round(unit.celsiustofahrenheit(37), 1) =} °F
```

Punto de rocío {= round(humidity.dewpoint(20, 50), 1) =} °C, cuota {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, temperatura corporal {= round(unit.celsiustofahrenheit(37), 1) =} °F

Se suman las funciones matemáticas básicas y las constantes del núcleo, como `round`, `pow` y `pi()`. No forman parte de la extensión y calculan siempre (sección «Funciones básicas y constantes matemáticas»).

## Llamada y datos

- **Un espacio de nombres por categoría:** una fórmula se llama como una función, con el nombre de su categoría delante del punto, por ejemplo `humidity.dewpoint(20, 50)` o `finance.pmt(0.08/12, 10, 10000)`. Los nombres están en inglés como el resto del catálogo de funciones, valen igual en todas las versiones de idioma y se reconocen sin distinguir mayúsculas y minúsculas.
- **Números puros:** cada dato es un número en la unidad que indican las tablas de abajo, por ejemplo la temperatura en °C o la humedad relativa en por ciento; el resultado es igualmente un número en la unidad indicada. No se calcula con unidades. En lugar de un número puede figurar un campo que contenga un número.
- **Los datos entre corchetes** son opcionales y tienen un valor por defecto. Solo pueden omitirse desde el final: quien necesita el quinto dato escribe también el cuarto.
- **Las constantes** se llaman como una función sin datos, con paréntesis: `pi()` o `const.c()`. Una palabra sin paréntesis sigue siendo lo que es, el nombre de un campo: una propiedad `pi` sigue siendo una propiedad.
- **Sin escrituras abreviadas:** no hay operador de potencia `^`, ni operador de resto, ni notación de porcentaje como `8%`, ni número con exponente como `1e-5`. `pow` y `mod` calculan potencia y resto, un número muy pequeño se escribe como fracción, por ejemplo `1/100000`, y un porcentaje es un número.
- **Presentación del resultado:** los resultados aparecen como todos los resultados de cálculo, con el punto como separador decimal, y los valores muy grandes y muy pequeños en notación exponencial, por ejemplo `6.02214076e+23`. Se redondea con `round` y se presenta según el idioma con `numberformat` y `currencyformat`, por ejemplo `numberformat(humidity.dewpoint(20, 50), 1)`.

## Extensión y modo de trabajo

Las fórmulas de las categorías pertenecen a la extensión **«Biblioteca de fórmulas»** en «Archivo → Configuración → Extensiones». Está activada en el modo de trabajo **Completo** y desactivada en los modos Avanzado y Principiante; su interruptor se ajusta por separado en cada modo (página [Extensiones](extensions.md)). Un cambio actúa en los documentos abiertos en el siguiente cálculo, sin reiniciar.

**Desactivada**, una llamada queda sin cambios en el texto fuente y muestra en lugar del resultado el aviso **«Biblioteca de fórmulas desactivada»** en vez del mensaje de una función desconocida, en la forma en que el lugar muestra los mensajes:

- **Cálculo en línea en el texto corrido:** el signo de advertencia ⚠︎, el aviso al pasar el ratón.
- **Columna calculada de una datatable:** un guion «—» en cada celda de la columna, el aviso al pasar el ratón. Las demás columnas siguen calculando y la tabla sigue siendo editable.
- **Consulta:** el bloque muestra el aviso en lugar de su resultado, como en cualquier error de una consulta.
- **Campo de fórmula de un perfil de propiedades:** el campo queda vacío y el aviso aparece en el campo.
- **Reglas de la [base de datos](database.md):** una regla de comprobación o una condición de edición que usa una fórmula de la biblioteca no se descarta, sino que se considera no evaluable: un guardado que tendría que comprobarla se rechaza, y una condición de edición bloquea el registro. Un aviso en la definición nombra el motivo. En un formulario, un marcador de valor con tal fórmula queda vacío y marcado, y una sección condicional queda oculta. Tras activarla de nuevo, todo funciona como antes.

**Las funciones básicas y las constantes del núcleo calculan siempre**, en cada modo de trabajo y también con la biblioteca desactivada, y ningún otro cálculo cambia por el interruptor.

## Funciones básicas y constantes matemáticas

Diez funciones básicas y cuatro constantes forman parte del núcleo del catálogo de funciones, sin interruptor. El redondeo y el resto siguen la norma OpenFormula (ISO/IEC 26300), secciones «ROUND» y «MOD»; las constantes dan su valor con la precisión completa de un número de coma flotante.

| Función | Propósito | Datos → resultado | Ejemplo |
|---|---|---|---|
| `exp(x)` | función exponencial, e elevado a x | número → número | `exp(0)` da 1 |
| `ln(x)` | logaritmo natural | número mayor que 0 → número | `ln(e())` da 1 |
| `log10(x)` | logaritmo en base 10 | número mayor que 0 → número | `log10(1000)` da 3 |
| `pow(x, y)` | potencia, x elevado a y | base, exponente → número | `pow(2, 10)` da 1024 |
| `sqrt(x)` | raíz cuadrada | número desde 0 → número | `sqrt(16)` da 4 |
| `round(x[, n])` | redondear a n decimales (por defecto 0); un valor exactamente en el medio se redondea alejándose de cero, un n negativo redondea a la izquierda de la coma | número, [decimales] → número | `round(2.5)` da 3, `round(-2.5)` da −3, `round(pi() * 2, 2)` da 6.28, `round(1234, -2)` da 1200 |
| `abs(x)` | valor absoluto | número → número desde 0 | `abs(-3)` da 3 |
| `floor(x)` | redondear al número entero inferior | número → número entero | `floor(-1.5)` da −2 |
| `ceil(x)` | redondear al número entero superior | número → número entero | `ceil(-1.5)` da −1 |
| `mod(a, b)` | resto de la división; lleva el signo del divisor | número, divisor distinto de 0 → número | `mod(7, 3)` da 1, `mod(-3, 2)` da 1 |
| `pi()` | número π | ninguno → 3.141592653589793 | `round(pi() * 2, 2)` da 6.28 |
| `e()` | número de Euler e | ninguno → 2.718281828459045 | `ln(e())` da 1 |
| `phi()` | número áureo (1 + √5) / 2 | ninguno → 1.618033988749895 | `round(phi(), 3)` da 1.618 |
| `sqrt2()` | raíz cuadrada de 2 | ninguno → 1.4142135623730951 | `round(sqrt2(), 4)` da 1.4142 |

Un dato fuera del dominio de definición (raíz de un número negativo, logaritmo de cero o de un número negativo, resto con divisor cero), un texto que no es un número y un resultado más allá del rango de números representables producen la presentación de error del lugar, como una división por cero, nunca un valor como «NaN» o «Infinity». Los datos que faltan o sobran, también `pi(2)`, los señala el lugar como un número de argumentos incorrecto.

## Humedad y punto de rocío

Espacio de nombres `humidity.`. Temperaturas en °C, humedad relativa en por ciento de 0 a 100, presión de vapor en hPa, humedad absoluta en g/m³.

**Fuente:** fórmula de Magnus con las constantes según D. Sonntag (Meteorologische Zeitschrift, Neue Folge 3, 1994): sobre agua K₁ = 6,112 hPa, K₂ = 17,62, K₃ = 243,12 °C, sobre hielo K₁ = 6,112 hPa, K₂ = 22,46, K₃ = 272,62 °C; la Guía de instrumentos y métodos de observación meteorológicos de la Organización Meteorológica Mundial (OMM-N° 8, capítulo 4 y anexo 4.B) da las mismas constantes y rangos. La humedad absoluta resulta de la ecuación de los gases del vapor de agua con la constante específica 461,52 J/(kg·K).

| Fórmula | Propósito | Datos → resultado | Ejemplo | Rango de validez |
|---|---|---|---|---|
| `humidity.saturationpressure(t)` | presión de vapor de saturación sobre agua | temperatura °C → hPa | `humidity.saturationpressure(20)` da unos 23.33 | −45 a 60 °C |
| `humidity.saturationpressureice(t)` | presión de vapor de saturación sobre hielo | temperatura °C → hPa | `humidity.saturationpressureice(-10)` da unos 2.60 | −65 a 0,01 °C |
| `humidity.vaporpressure(t, rh)` | presión de vapor a partir de la humedad relativa | temperatura °C, humedad relativa % → hPa | `humidity.vaporpressure(20, 50)` da unos 11.66 | −45 a 60 °C, humedad de 0 a 100 % |
| `humidity.absolute(t, rh)` | humedad absoluta a partir de la humedad relativa | temperatura °C, humedad relativa % → g/m³ | `humidity.absolute(21, 40)` da unos 7.31 | −45 a 60 °C, humedad de 0 a 100 % |
| `humidity.relative(t, ah)` | humedad relativa a partir de la humedad absoluta | temperatura °C, humedad absoluta g/m³ → % | `humidity.relative(34.4, 7.6)` da unos 19.87 | −45 a 60 °C, humedad absoluta desde 0 hasta el valor de saturación |
| `humidity.dewpoint(t, rh)` | punto de rocío | temperatura °C, humedad relativa % → °C | `round(humidity.dewpoint(20, 50), 1)` da 9.3 | −45 a 60 °C, humedad de más de 0 a 100 %, punto de rocío desde −45 °C |
| `humidity.relativefromdewpoint(t, td)` | humedad relativa a partir del punto de rocío | temperatura °C, punto de rocío °C → % | `humidity.relativefromdewpoint(20, 9.26)` da unos 50 | ambos de −45 a 60 °C, punto de rocío no por encima de la temperatura |

- **Por debajo de 0 °C**, la presión de vapor, la humedad absoluta y relativa y el punto de rocío se calculan sobre agua (agua subenfriada), como prevé la convención meteorológica para la humedad relativa (OMM-N° 8, anexo 4.A); solo `humidity.saturationpressureice` da el valor sobre hielo.
- **Una aproximación:** entre punto de rocío y humedad relativa solo hay aproximaciones; la fórmula de Magnus se desvía de tablas más precisas en unas milésimas. El cálculo vale para vapor de agua puro, sin el factor de corrección del aire húmedo bajo presión atmosférica.
- **Más que saturado** está fuera del rango: un punto de rocío por encima de la temperatura o una humedad absoluta por encima del valor de saturación daría una humedad relativa superior al 100 % y muestra un mensaje.

## Matemáticas financieras

Espacio de nombres `finance.`. El **tipo de interés** es una fracción por período, es decir `0.08/12` para un 8 por ciento anual con cuotas mensuales. **Regla de signos:** el dinero pagado es negativo, el cobrado positivo. **Momento del pago** `type`: 0 al final del período (por defecto), 1 al principio del período. Los resultados son importes en la moneda de los datos o un tipo de interés como fracción; no se comprueba ninguna moneda.

**Fuente:** norma OpenFormula (ISO/IEC 26300), secciones de las funciones del mismo nombre («PMT», «PV», «FV», «NPV», «IRR», «RATE», «NPER», «EFFECT», «NOMINAL»), con la ecuación de anualidad 0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv y el caso especial de interés cero: pmt · nper + pv + fv = 0.

| Fórmula | Propósito | Datos → resultado | Ejemplo | Rango de validez |
|---|---|---|---|---|
| `finance.pmt(rate, nper, pv[, fv[, type]])` | cuota de una anualidad | interés por período, plazo en períodos, valor actual, [valor final = 0], [momento = 0] → cuota | `finance.pmt(0.08/12, 10, 10000)` da unos −1037.03, con momento 1 unos −1030.16 | interés mayor que −1, plazo mayor que 0 |
| `finance.pv(rate, nper, pmt[, fv[, type]])` | valor actual | interés, plazo, cuota, [valor final = 0], [momento = 0] → valor actual | `finance.pv(0.08/12, 48, 500, 20000)` da unos −35019.37 | interés mayor que −1 |
| `finance.fv(rate, nper, pmt[, pv[, type]])` | valor final | interés, plazo, cuota, [valor actual = 0], [momento = 0] → valor final | `finance.fv(0.06/12, 10, -200, -500, 1)` da unos 2581.40 | interés mayor que −1 |
| `finance.npv(rate, value1[, value2, …])` | valor actual neto | interés, flujos → valor actual neto | `finance.npv(0.1, -10000, 3000, 4200, 6800)` da unos 1188.44 | interés mayor que −1; el primer flujo está un período después del inicio, un flujo en el inicio se suma aparte |
| `finance.irr(values[, guess])` | tasa interna de retorno | flujos como campo de lista, [estimación = 0.1] → tipo | con el campo de lista `pagos: [-10000, 3500, 7600, 1000]`, `finance.irr(pagos)` da unos 0.1133 | al menos un flujo negativo y uno positivo, estimación mayor que −1 |
| `finance.rate(nper, pmt, pv[, fv[, type[, guess]]])` | tipo de interés de una anualidad | plazo, cuota, valor actual, [valor final = 0], [momento = 0], [estimación = 0.1] → tipo por período | `finance.rate(48, -200, 8000)` da unos 0.0077, es decir un 0,77 % al mes | plazo mayor que 0, estimación mayor que −1 |
| `finance.nper(rate, pmt, pv[, fv[, type]])` | plazo de una anualidad | interés, cuota, valor actual, [valor final = 0], [momento = 0] → plazo en períodos | `finance.nper(0.12/12, -100, -1000, 10000, 1)` da unos 59.67 | interés mayor que −1; un plazo negativo es un resultado válido |
| `finance.effect(rate, periods)` | tipo efectivo a partir del nominal | tipo nominal como fracción, períodos de capitalización por año → tipo efectivo como fracción | `finance.effect(0.0525, 4)` da unos 0.053543 | tipo nominal desde 0, períodos desde 1 |
| `finance.nominal(rate, periods)` | tipo nominal a partir del efectivo | tipo efectivo como fracción, períodos de capitalización por año → tipo nominal como fracción | `finance.nominal(0.053543, 4)` da unos 0.0525 | tipo efectivo mayor que 0, períodos desde 1 |

El número de períodos de capitalización es un número entero; una parte decimal se trunca. La tasa interna de retorno y el tipo de interés se calculan paso a paso; si el cálculo no encuentra solución, muestra el mensaje «Tasa de interés no determinable: el cálculo iterativo no converge», y un plazo que nunca se alcanza con los datos indica «Número de períodos no determinable».

### Flujos del valor actual neto y de la tasa interna de retorno

- **Valor actual neto:** los flujos figuran como datos sueltos, cada uno un número o un campo de lista, y cuentan en el orden de los datos; son posibles hasta 254 datos de flujo. Por eso el valor actual neto calcula en los cuatro lugares.
- **Tasa interna de retorno:** los flujos figuran como **un campo de lista**, por ejemplo una propiedad `pagos: [-10000, 3500, 7600, 1000]`; el primer flujo está en el inicio. Por eso la tasa interna de retorno calcula en una consulta, en el campo de fórmula de un perfil de propiedades y en las reglas de la base de datos. **El texto corrido y las columnas calculadas no tienen listas:** allí solo recibe un número suelto y muestra el mensaje «Flujos de caja sin cambio de signo».
- Un elemento de una lista de flujos que no es un número o que falta no desaparece en silencio, porque desplazaría los períodos de todos los flujos siguientes; muestra el mensaje «Fórmula: falta un dato o no es un número», igual que una lista vacía.

## Porcentajes

Espacio de nombres `percent.`. Los datos y resultados en porcentaje son cifras porcentuales, es decir 19 para un 19 por ciento.

**Fuente:** las reglas de cálculo habituales de los porcentajes, indicadas como cálculo en la tabla.

| Fórmula | Propósito | Datos → resultado | Cálculo | Ejemplo | Rango de validez |
|---|---|---|---|---|---|
| `percent.share(part, whole)` | proporción en por ciento | parte, total → % | part / whole · 100 | `percent.share(5, 20)` da 25 | total distinto de 0 |
| `percent.change(old, new)` | variación porcentual, negativa en una disminución | valor anterior, valor nuevo → % | (new − old) / old · 100 | `percent.change(80, 100)` da 25, `percent.change(100, 80)` da −20 | valor anterior distinto de 0 |
| `percent.increase(value, p)` | aumentar un porcentaje | valor, por ciento → valor | value · (1 + p/100) | `percent.increase(200, 50)` da 300 | sin restricción |
| `percent.decrease(value, p)` | disminuir un porcentaje | valor, por ciento → valor | value · (1 − p/100) | `percent.decrease(200, 50)` da 100 | sin restricción |
| `percent.base(w, p)` | valor base a partir del valor porcentual | valor porcentual, por ciento → valor base | w / (p/100) | `percent.base(30, 15)` da 200 | por ciento distinto de 0 |

## Conversión de unidades

Espacio de nombres `unit.`. Conversiones fijas por par de unidades, cada una en ambos sentidos, con un número como dato; no hay un sistema de conversión general con unidades como texto.

**Fuente:** NIST Special Publication 811 (guía para el uso del Sistema Internacional de Unidades), apéndice B.8; todos los factores son exactos allí.

| Fórmulas | Propósito | Cálculo | Ejemplo |
|---|---|---|---|
| `unit.celsiustokelvin(t)`, `unit.kelvintocelsius(t)` | Celsius ↔ kelvin | T/K = t/°C + 273,15 | `unit.celsiustokelvin(0)` da 273.15 |
| `unit.celsiustofahrenheit(t)`, `unit.fahrenheittocelsius(t)` | Celsius ↔ Fahrenheit | t/°C = (t/°F − 32) / 1,8 | `unit.celsiustofahrenheit(37)` da 98.6, `unit.fahrenheittocelsius(212)` da 100 |
| `unit.kelvintofahrenheit(t)`, `unit.fahrenheittokelvin(t)` | kelvin ↔ Fahrenheit | T/K = (t/°F + 459,67) / 1,8 | `unit.kelvintofahrenheit(273.15)` da 32 |
| `unit.inchtometer(x)`, `unit.metertoinch(x)` | pulgada ↔ metro | 1 in = 0,0254 m | `unit.inchtometer(1)` da 0.0254 |
| `unit.foottometer(x)`, `unit.metertofoot(x)` | pie ↔ metro | 1 ft = 0,3048 m | `unit.foottometer(1)` da 0.3048 |
| `unit.yardtometer(x)`, `unit.metertoyard(x)` | yarda ↔ metro | 1 yd = 0,9144 m | `unit.yardtometer(1)` da 0.9144 |
| `unit.miletometer(x)`, `unit.metertomile(x)` | milla ↔ metro | 1 mi = 1609,344 m | `unit.miletometer(1)` da 1609.344 |
| `unit.nauticalmiletometer(x)`, `unit.metertonauticalmile(x)` | milla náutica ↔ metro | 1 M = 1852 m | `unit.nauticalmiletometer(1)` da 1852 |

**Sin rango de validez:** las conversiones son ecuaciones de definición exactas sin rango en la fuente y por eso no comprueban ningún rango; también un valor negativo en kelvin o una longitud negativa se calcula según la ecuación. Solo se señalan un dato que no es un número y un resultado más allá del rango de números representables. La ida y la vuelta devuelven el valor de partida dentro de la precisión de coma flotante.

## Salud

Espacio de nombres `health.`.

**Fuente:** Organización Mundial de la Salud (OMS), nota descriptiva «Obesity and overweight» y Global Health Observatory «Body mass index»; el ejemplo lo da la Oficina Regional de la OMS para Europa en la nota descriptiva «Nutrition for a healthy life».

| Fórmula | Propósito | Datos → resultado | Cálculo | Ejemplo | Rango de validez |
|---|---|---|---|---|---|
| `health.bmi(mass, height)` | índice de masa corporal | masa kg, estatura m → kg/m² | mass / height² | `round(health.bmi(70, 1.75), 1)` da 22.9 | masa y estatura mayores que 0 |

La fórmula solo da el número y no lo asigna a ninguna clase de peso. Para la clasificación, la OMS indica estos umbrales, **que solo valen para adultos**:

- **Bajo peso:** menos de 18,5
- **Sobrepeso:** desde 25
- **Obesidad:** desde 30

Para niños y adolescentes se aplican umbrales según edad y sexo; allí el valor solo no permite ninguna clasificación. La aplicación no hace ninguna valoración médica.

## Constantes físicas

Espacio de nombres `const.`. Llamada como una función sin datos, con paréntesis; un dato entre los paréntesis, por ejemplo `const.c(1)`, es un error.

| Constante | Significado | Valor | Unidad | Fuente |
|---|---|---|---|---|
| `const.c()` | velocidad de la luz en el vacío | 299792458 (exacto) | m/s | CODATA 2018 |
| `const.g()` | aceleración normal de la gravedad | 9.80665 (exacto) | m/s² | Folleto sobre el SI del BIPM, 9.ª edición |
| `const.t0()` | cero de la escala Celsius en kelvin (temperatura de referencia T₀), desplazamiento de la conversión de temperatura | 273.15 (exacto) | K | Folleto sobre el SI del BIPM, 9.ª edición, kelvin |
| `const.na()` | constante de Avogadro | 6.02214076e+23 (exacto) | 1/mol | CODATA 2018 |
| `const.r()` | constante molar de los gases | 8.31446261815324 (exacto, producto de las constantes de Avogadro y de Boltzmann) | J/(mol·K) | CODATA 2018 |
| `const.h()` | constante de Planck | 6.62607015e-34 (exacto) | J·s | CODATA 2018 |
| `const.p0()` | presión normal de la atmósfera estándar | 1013.25 (definición) | hPa | Folleto sobre el SI del BIPM, atmósfera estándar |

`const.t0()` no es el cero absoluto; este está en 0 K, es decir −273,15 °C. Los valores aparecen en los cuatro lugares con todas sus cifras, los muy grandes y muy pequeños en notación exponencial.

## Mensajes en lugar de valores

Un dato fuera del rango de validez de una fórmula **nunca da un valor**, sino en lugar del resultado un mensaje que nombra el dato y el rango, por ejemplo «Humedad relativa fuera del rango de más de 0 a 100 %» con `humidity.dewpoint(20, 120)`. Del mismo modo se señalan un dato que falta o un texto que no es un número («Fórmula: falta un dato o no es un número»), un resultado más allá del rango de números representables y un cálculo paso a paso sin solución.

- **Cálculo en línea:** el signo de advertencia ⚠︎, el mensaje al pasar el ratón.
- **Columna calculada:** un guion «—» en la celda, el mensaje al pasar el ratón; las demás celdas siguen calculando, y una columna que remite a esta celda toma el mensaje.
- **Consulta:** el signo de advertencia ⚠︎ en la celda, el mensaje al pasar el ratón; en una condición (`WHERE`) el mensaje cuenta como no cumplido; al ordenar (`SORT`) queda al final, y `count` no lo cuenta.
- **Campo de fórmula:** el campo queda vacío y el mensaje aparece en el campo; un campo que remite a este campo toma el mensaje.
- **Regla de la base de datos:** una regla de comprobación o una condición cuya fórmula da un mensaje se considera no evaluable; el guardado se rechaza, y una condición de edición bloquea el registro.

## Límites

- **Sin fórmulas propias:** la biblioteca contiene las fórmulas de esta página; no se pueden añadir fórmulas propias.
- **Sin cálculo con unidades:** datos y resultados son números puros en la unidad indicada.
- **Pares de unidades fijos:** se convierten temperatura y longitud; la biblioteca no convierte masa, volumen, energía ni presión.
- **Sin salida según el idioma:** los resultados aparecen con el punto como separador decimal; según el idioma mediante `numberformat` y `currencyformat`.
