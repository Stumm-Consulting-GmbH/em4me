# Libreria di formule

La libreria di formule porta formule pronte e verificate nel linguaggio delle espressioni della [Query Perspective](frontmatter-query.md): umidità e punto di rugiada, matematica finanziaria, percentuali, conversione di unità, indice di massa corporea e costanti fisiche. Una formula calcola ovunque l'applicazione calcoli e dà ovunque lo stesso risultato per gli stessi dati: nei [calcoli in linea](inline.md) del testo corrente, nelle colonne calcolate della [Perspective Datatable](datatable.md), nelle query e nei campi formula dei [profili di proprietà](property-profiles.md).

```markdown
Punto di rugiada {= round(humidity.dewpoint(20, 50), 1) =} °C, rata {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, temperatura corporea {= round(unit.celsiustofahrenheit(37), 1) =} °F
```

Punto di rugiada {= round(humidity.dewpoint(20, 50), 1) =} °C, rata {= round(finance.pmt(0.08/12, 10, 10000), 2) =}, temperatura corporea {= round(unit.celsiustofahrenheit(37), 1) =} °F

Vi si aggiungono le funzioni matematiche di base e le costanti del nucleo, come `round`, `pow` e `pi()`. Non fanno parte dell'estensione e calcolano sempre (sezione «Funzioni di base e costanti matematiche»).

## Chiamata e dati

- **Uno spazio dei nomi per categoria:** una formula si chiama come una funzione, con il nome della sua categoria prima del punto, per esempio `humidity.dewpoint(20, 50)` o `finance.pmt(0.08/12, 10, 10000)`. I nomi sono inglesi come il resto del catalogo delle funzioni, valgono uguali in tutte le versioni linguistiche e vengono riconosciuti senza distinguere maiuscole e minuscole.
- **Numeri puri:** ogni dato è un numero nell'unità indicata dalle tabelle qui sotto, per esempio la temperatura in °C o l'umidità relativa in percento; anche il risultato è un numero nell'unità indicata. Non si calcola con le unità. Al posto di un numero può stare un campo che contiene un numero.
- **I dati tra parentesi quadre** sono facoltativi e hanno un valore predefinito. Si possono omettere solo dalla fine: chi ha bisogno del quinto dato scrive anche il quarto.
- **Le costanti** si chiamano come una funzione senza dati, con le parentesi: `pi()` o `const.c()`. Una parola senza parentesi resta ciò che è, il nome di un campo: una proprietà `pi` resta una proprietà.
- **Nessuna scrittura abbreviata:** non esistono un operatore di potenza `^`, un operatore di resto, una notazione percentuale come `8%` né un numero con esponente come `1e-5`. `pow` e `mod` calcolano potenza e resto, un numero molto piccolo si scrive come frazione, per esempio `1/100000`, e una percentuale è un numero.
- **Visualizzazione del risultato:** i risultati compaiono come tutti i risultati di calcolo, con il punto come separatore decimale, i valori molto grandi e molto piccoli in notazione esponenziale, per esempio `6.02214076e+23`. Si arrotonda con `round` e si presenta secondo la lingua con `numberformat` e `currencyformat`, per esempio `numberformat(humidity.dewpoint(20, 50), 1)`.

## Estensione e modalità di lavoro

Le formule delle categorie appartengono all'estensione **«Libreria di formule»** in «File → Impostazioni → Estensioni». È attiva nella modalità di lavoro **Completa** e disattivata nelle modalità Avanzata e Principiante; il suo interruttore si regola singolarmente in ogni modalità (pagina [Estensioni](extensions.md)). Un cambio agisce nei documenti aperti al calcolo successivo, senza riavvio.

**Disattivata**, una chiamata resta invariata nel sorgente e mostra al posto del risultato l'avviso **«Libreria di formule disattivata»** invece del messaggio di una funzione sconosciuta, nella forma in cui il luogo mostra i messaggi:

- **Calcolo in linea nel testo corrente:** il segno di avvertimento ⚠︎, l'avviso al passaggio del mouse.
- **Colonna calcolata di una datatable:** un trattino «—» in ogni cella della colonna, l'avviso al passaggio del mouse. Le altre colonne continuano a calcolare e la tabella resta modificabile.
- **Query:** il blocco mostra l'avviso al posto del suo risultato, come per ogni errore di una query.
- **Campo formula di un profilo di proprietà:** il campo resta vuoto e l'avviso compare al campo.
- **Regole della [banca dati](database.md):** una regola di verifica o una condizione di modificabilità che usa una formula della libreria non viene scartata, ma vale come non valutabile: un salvataggio che dovrebbe verificarla viene respinto, e una condizione di modificabilità blocca il record. Un avviso nella definizione ne indica il motivo. In una maschera, un segnaposto di valore con una tale formula resta vuoto e marcato, e una sezione condizionale resta nascosta. Dopo la riattivazione tutto funziona come prima.

**Le funzioni di base e le costanti del nucleo calcolano sempre**, in ogni modalità di lavoro e anche con la libreria disattivata, e nessun altro calcolo cambia per l'interruttore.

## Funzioni di base e costanti matematiche

Dieci funzioni di base e quattro costanti fanno parte del nucleo del catalogo delle funzioni, senza interruttore. Arrotondamento e resto seguono la norma OpenFormula (ISO/IEC 26300), sezioni «ROUND» e «MOD»; le costanti danno il loro valore con la piena precisione di un numero in virgola mobile.

| Funzione | Scopo | Dati → risultato | Esempio |
|---|---|---|---|
| `exp(x)` | funzione esponenziale, e elevato a x | numero → numero | `exp(0)` dà 1 |
| `ln(x)` | logaritmo naturale | numero maggiore di 0 → numero | `ln(e())` dà 1 |
| `log10(x)` | logaritmo in base 10 | numero maggiore di 0 → numero | `log10(1000)` dà 3 |
| `pow(x, y)` | potenza, x elevato a y | base, esponente → numero | `pow(2, 10)` dà 1024 |
| `sqrt(x)` | radice quadrata | numero da 0 → numero | `sqrt(16)` dà 4 |
| `round(x[, n])` | arrotondare a n decimali (predefinito 0); un valore esattamente a metà si arrotonda allontanandosi dallo zero, un n negativo arrotonda a sinistra della virgola | numero, [cifre] → numero | `round(2.5)` dà 3, `round(-2.5)` dà −3, `round(pi() * 2, 2)` dà 6.28, `round(1234, -2)` dà 1200 |
| `abs(x)` | valore assoluto | numero → numero da 0 | `abs(-3)` dà 3 |
| `floor(x)` | arrotondare al numero intero inferiore | numero → numero intero | `floor(-1.5)` dà −2 |
| `ceil(x)` | arrotondare al numero intero superiore | numero → numero intero | `ceil(-1.5)` dà −1 |
| `mod(a, b)` | resto della divisione; porta il segno del divisore | numero, divisore diverso da 0 → numero | `mod(7, 3)` dà 1, `mod(-3, 2)` dà 1 |
| `pi()` | pi greco π | nessuno → 3.141592653589793 | `round(pi() * 2, 2)` dà 6.28 |
| `e()` | numero di Eulero e | nessuno → 2.718281828459045 | `ln(e())` dà 1 |
| `phi()` | sezione aurea (1 + √5) / 2 | nessuno → 1.618033988749895 | `round(phi(), 3)` dà 1.618 |
| `sqrt2()` | radice quadrata di 2 | nessuno → 1.4142135623730951 | `round(sqrt2(), 4)` dà 1.4142 |

Un dato fuori dal dominio di definizione (radice di un numero negativo, logaritmo di zero o di un numero negativo, resto con divisore zero), un testo che non è un numero e un risultato oltre l'intervallo dei numeri rappresentabili producono la visualizzazione di errore del luogo, come una divisione per zero, mai un valore come «NaN» o «Infinity». Dati mancanti o in eccesso, anche `pi(2)`, vengono segnalati dal luogo come un numero di argomenti errato.

## Umidità e punto di rugiada

Spazio dei nomi `humidity.`. Temperature in °C, umidità relativa in percento da 0 a 100, pressione di vapore in hPa, umidità assoluta in g/m³.

**Fonte:** formula di Magnus con le costanti secondo D. Sonntag (Meteorologische Zeitschrift, Neue Folge 3, 1994): sull'acqua K₁ = 6,112 hPa, K₂ = 17,62, K₃ = 243,12 °C, sul ghiaccio K₁ = 6,112 hPa, K₂ = 22,46, K₃ = 272,62 °C; la Guida agli strumenti e ai metodi di osservazione meteorologica dell'Organizzazione meteorologica mondiale (OMM-N. 8, capitolo 4 e allegato 4.B) riporta le stesse costanti e gli stessi intervalli. L'umidità assoluta deriva dall'equazione dei gas del vapore acqueo con la costante specifica 461,52 J/(kg·K).

| Formula | Scopo | Dati → risultato | Esempio | Intervallo di validità |
|---|---|---|---|---|
| `humidity.saturationpressure(t)` | pressione di vapore saturo sull'acqua | temperatura °C → hPa | `humidity.saturationpressure(20)` dà circa 23.33 | da −45 a 60 °C |
| `humidity.saturationpressureice(t)` | pressione di vapore saturo sul ghiaccio | temperatura °C → hPa | `humidity.saturationpressureice(-10)` dà circa 2.60 | da −65 a 0,01 °C |
| `humidity.vaporpressure(t, rh)` | pressione di vapore dall'umidità relativa | temperatura °C, umidità relativa % → hPa | `humidity.vaporpressure(20, 50)` dà circa 11.66 | da −45 a 60 °C, umidità da 0 a 100 % |
| `humidity.absolute(t, rh)` | umidità assoluta dall'umidità relativa | temperatura °C, umidità relativa % → g/m³ | `humidity.absolute(21, 40)` dà circa 7.31 | da −45 a 60 °C, umidità da 0 a 100 % |
| `humidity.relative(t, ah)` | umidità relativa dall'umidità assoluta | temperatura °C, umidità assoluta g/m³ → % | `humidity.relative(34.4, 7.6)` dà circa 19.87 | da −45 a 60 °C, umidità assoluta da 0 fino al valore di saturazione |
| `humidity.dewpoint(t, rh)` | punto di rugiada | temperatura °C, umidità relativa % → °C | `round(humidity.dewpoint(20, 50), 1)` dà 9.3 | da −45 a 60 °C, umidità da oltre 0 a 100 %, punto di rugiada da −45 °C |
| `humidity.relativefromdewpoint(t, td)` | umidità relativa dal punto di rugiada | temperatura °C, punto di rugiada °C → % | `humidity.relativefromdewpoint(20, 9.26)` dà circa 50 | entrambi da −45 a 60 °C, punto di rugiada non sopra la temperatura |

- **Sotto 0 °C** pressione di vapore, umidità assoluta e relativa e punto di rugiada si calcolano sull'acqua (acqua sopraffusa), come prevede la convenzione meteorologica per l'umidità relativa (OMM-N. 8, allegato 4.A); solo `humidity.saturationpressureice` dà il valore sul ghiaccio.
- **Un'approssimazione:** tra punto di rugiada e umidità relativa esistono solo approssimazioni; la formula di Magnus si discosta da tabelle più precise di alcuni per mille. Il calcolo vale per vapore acqueo puro, senza il fattore di correzione dell'aria umida sotto pressione atmosferica.
- **Più che saturo** è fuori intervallo: un punto di rugiada sopra la temperatura o un'umidità assoluta sopra il valore di saturazione darebbe un'umidità relativa oltre il 100 % e mostra un messaggio.

## Matematica finanziaria

Spazio dei nomi `finance.`. Il **tasso di interesse** è una quota per periodo, quindi `0.08/12` per l'8 percento annuo con rate mensili. **Regola dei segni:** il denaro versato è negativo, quello incassato positivo. **Momento del pagamento** `type`: 0 a fine periodo (predefinito), 1 a inizio periodo. I risultati sono importi nella valuta dei dati o un tasso come quota; nessuna valuta viene verificata.

**Fonte:** norma OpenFormula (ISO/IEC 26300), sezioni delle funzioni omonime («PMT», «PV», «FV», «NPV», «IRR», «RATE», «NPER», «EFFECT», «NOMINAL»), con l'equazione della rendita 0 = pv · (1 + rate)^nper + pmt · (1 + rate · type) · ((1 + rate)^nper − 1) / rate + fv e il caso particolare del tasso zero: pmt · nper + pv + fv = 0.

| Formula | Scopo | Dati → risultato | Esempio | Intervallo di validità |
|---|---|---|---|---|
| `finance.pmt(rate, nper, pv[, fv[, type]])` | rata di una rendita | tasso per periodo, durata in periodi, valore attuale, [valore futuro = 0], [momento = 0] → rata | `finance.pmt(0.08/12, 10, 10000)` dà circa −1037.03, con momento 1 circa −1030.16 | tasso maggiore di −1, durata maggiore di 0 |
| `finance.pv(rate, nper, pmt[, fv[, type]])` | valore attuale | tasso, durata, rata, [valore futuro = 0], [momento = 0] → valore attuale | `finance.pv(0.08/12, 48, 500, 20000)` dà circa −35019.37 | tasso maggiore di −1 |
| `finance.fv(rate, nper, pmt[, pv[, type]])` | valore futuro | tasso, durata, rata, [valore attuale = 0], [momento = 0] → valore futuro | `finance.fv(0.06/12, 10, -200, -500, 1)` dà circa 2581.40 | tasso maggiore di −1 |
| `finance.npv(rate, value1[, value2, …])` | valore attuale netto | tasso, flussi → valore attuale netto | `finance.npv(0.1, -10000, 3000, 4200, 6800)` dà circa 1188.44 | tasso maggiore di −1; il primo flusso cade un periodo dopo l'inizio, un flusso all'inizio si somma a parte |
| `finance.irr(values[, guess])` | tasso interno di rendimento | flussi come campo elenco, [stima = 0.1] → tasso | con il campo elenco `pagamenti: [-10000, 3500, 7600, 1000]`, `finance.irr(pagamenti)` dà circa 0.1133 | almeno un flusso negativo e uno positivo, stima maggiore di −1 |
| `finance.rate(nper, pmt, pv[, fv[, type[, guess]]])` | tasso di una rendita | durata, rata, valore attuale, [valore futuro = 0], [momento = 0], [stima = 0.1] → tasso per periodo | `finance.rate(48, -200, 8000)` dà circa 0.0077, cioè lo 0,77 % al mese | durata maggiore di 0, stima maggiore di −1 |
| `finance.nper(rate, pmt, pv[, fv[, type]])` | durata di una rendita | tasso, rata, valore attuale, [valore futuro = 0], [momento = 0] → durata in periodi | `finance.nper(0.12/12, -100, -1000, 10000, 1)` dà circa 59.67 | tasso maggiore di −1; una durata negativa è un risultato valido |
| `finance.effect(rate, periods)` | tasso effettivo dal tasso nominale | tasso nominale come quota, periodi di capitalizzazione all'anno → tasso effettivo come quota | `finance.effect(0.0525, 4)` dà circa 0.053543 | tasso nominale da 0, periodi da 1 |
| `finance.nominal(rate, periods)` | tasso nominale dal tasso effettivo | tasso effettivo come quota, periodi di capitalizzazione all'anno → tasso nominale come quota | `finance.nominal(0.053543, 4)` dà circa 0.0525 | tasso effettivo maggiore di 0, periodi da 1 |

Il numero dei periodi di capitalizzazione è un numero intero; una parte decimale viene troncata. Tasso interno di rendimento e tasso si calcolano passo dopo passo; se il calcolo non trova una soluzione, mostra il messaggio «Tasso di interesse non determinabile: il calcolo iterativo non converge», e una durata che con i dati non viene mai raggiunta segnala «Numero di periodi non determinabile».

### Flussi del valore attuale netto e del tasso interno di rendimento

- **Valore attuale netto:** i flussi stanno come dati singoli, ciascuno un numero o un campo elenco, e contano nell'ordine dei dati; sono possibili fino a 254 dati di flusso. Per questo il valore attuale netto calcola in tutti e quattro i luoghi.
- **Tasso interno di rendimento:** i flussi stanno come **un campo elenco**, per esempio una proprietà `pagamenti: [-10000, 3500, 7600, 1000]`; il primo flusso cade all'inizio. Per questo il tasso interno di rendimento calcola in una query, nel campo formula di un profilo di proprietà e nelle regole della banca dati. **Il testo corrente e le colonne calcolate non hanno elenchi:** lì riceve solo un numero singolo e mostra il messaggio «Flussi di cassa senza cambio di segno».
- Un elemento di un elenco di flussi che non è un numero o che manca non sparisce in silenzio, perché sposterebbe i periodi di tutti i flussi successivi; mostra il messaggio «Formula: un dato manca o non è un numero», come un elenco vuoto.

## Percentuali

Spazio dei nomi `percent.`. Dati e risultati percentuali sono numeri percentuali, quindi 19 per il 19 percento.

**Fonte:** le consuete regole di calcolo delle percentuali, indicate come calcolo nella tabella.

| Formula | Scopo | Dati → risultato | Calcolo | Esempio | Intervallo di validità |
|---|---|---|---|---|---|
| `percent.share(part, whole)` | quota in percento | parte, totale → % | part / whole · 100 | `percent.share(5, 20)` dà 25 | totale diverso da 0 |
| `percent.change(old, new)` | variazione percentuale, negativa in caso di calo | valore precedente, valore nuovo → % | (new − old) / old · 100 | `percent.change(80, 100)` dà 25, `percent.change(100, 80)` dà −20 | valore precedente diverso da 0 |
| `percent.increase(value, p)` | aumentare di una percentuale | valore, percento → valore | value · (1 + p/100) | `percent.increase(200, 50)` dà 300 | nessuna restrizione |
| `percent.decrease(value, p)` | diminuire di una percentuale | valore, percento → valore | value · (1 − p/100) | `percent.decrease(200, 50)` dà 100 | nessuna restrizione |
| `percent.base(w, p)` | valore base dal valore percentuale | valore percentuale, percento → valore base | w / (p/100) | `percent.base(30, 15)` dà 200 | percento diverso da 0 |

## Conversione di unità

Spazio dei nomi `unit.`. Conversioni fisse per coppia di unità, ciascuna in entrambe le direzioni, con un numero come dato; non esiste un sistema di conversione generale con unità come testo.

**Fonte:** NIST Special Publication 811 (guida all'uso del Sistema internazionale di unità), appendice B.8; tutti i fattori vi sono esatti.

| Formule | Scopo | Calcolo | Esempio |
|---|---|---|---|
| `unit.celsiustokelvin(t)`, `unit.kelvintocelsius(t)` | Celsius ↔ kelvin | T/K = t/°C + 273,15 | `unit.celsiustokelvin(0)` dà 273.15 |
| `unit.celsiustofahrenheit(t)`, `unit.fahrenheittocelsius(t)` | Celsius ↔ Fahrenheit | t/°C = (t/°F − 32) / 1,8 | `unit.celsiustofahrenheit(37)` dà 98.6, `unit.fahrenheittocelsius(212)` dà 100 |
| `unit.kelvintofahrenheit(t)`, `unit.fahrenheittokelvin(t)` | kelvin ↔ Fahrenheit | T/K = (t/°F + 459,67) / 1,8 | `unit.kelvintofahrenheit(273.15)` dà 32 |
| `unit.inchtometer(x)`, `unit.metertoinch(x)` | pollice ↔ metro | 1 in = 0,0254 m | `unit.inchtometer(1)` dà 0.0254 |
| `unit.foottometer(x)`, `unit.metertofoot(x)` | piede ↔ metro | 1 ft = 0,3048 m | `unit.foottometer(1)` dà 0.3048 |
| `unit.yardtometer(x)`, `unit.metertoyard(x)` | iarda ↔ metro | 1 yd = 0,9144 m | `unit.yardtometer(1)` dà 0.9144 |
| `unit.miletometer(x)`, `unit.metertomile(x)` | miglio ↔ metro | 1 mi = 1609,344 m | `unit.miletometer(1)` dà 1609.344 |
| `unit.nauticalmiletometer(x)`, `unit.metertonauticalmile(x)` | miglio nautico ↔ metro | 1 M = 1852 m | `unit.nauticalmiletometer(1)` dà 1852 |

**Nessun intervallo di validità:** le conversioni sono equazioni di definizione esatte senza intervallo nella fonte e perciò non verificano alcun intervallo; anche un valore negativo in kelvin o una lunghezza negativa si calcola secondo l'equazione. Vengono segnalati solo un dato che non è un numero e un risultato oltre l'intervallo dei numeri rappresentabili. Andata e ritorno restituiscono il valore di partenza entro la precisione in virgola mobile.

## Salute

Spazio dei nomi `health.`.

**Fonte:** Organizzazione mondiale della sanità (OMS), scheda informativa «Obesity and overweight» e Global Health Observatory «Body mass index»; l'esempio lo riporta l'Ufficio regionale dell'OMS per l'Europa nella scheda informativa «Nutrition for a healthy life».

| Formula | Scopo | Dati → risultato | Calcolo | Esempio | Intervallo di validità |
|---|---|---|---|---|---|
| `health.bmi(mass, height)` | indice di massa corporea | massa kg, statura m → kg/m² | mass / height² | `round(health.bmi(70, 1.75), 1)` dà 22.9 | massa e statura maggiori di 0 |

La formula dà soltanto il numero e non lo assegna ad alcuna classe di peso. Per la classificazione l'OMS indica queste soglie, **che valgono solo per gli adulti**:

- **Sottopeso:** sotto 18,5
- **Sovrappeso:** da 25
- **Obesità:** da 30

Per bambini e adolescenti valgono soglie per età e sesso; lì il valore da solo non permette alcuna classificazione. L'applicazione non fa alcuna valutazione medica.

## Costanti fisiche

Spazio dei nomi `const.`. Chiamata come una funzione senza dati, con le parentesi; un dato tra le parentesi, per esempio `const.c(1)`, è un errore.

| Costante | Significato | Valore | Unità | Fonte |
|---|---|---|---|---|
| `const.c()` | velocità della luce nel vuoto | 299792458 (esatto) | m/s | CODATA 2018 |
| `const.g()` | accelerazione di gravità normale | 9.80665 (esatto) | m/s² | Brochure del SI del BIPM, 9ª edizione |
| `const.t0()` | zero della scala Celsius in kelvin (temperatura di riferimento T₀), scostamento della conversione di temperatura | 273.15 (esatto) | K | Brochure del SI del BIPM, 9ª edizione, kelvin |
| `const.na()` | costante di Avogadro | 6.02214076e+23 (esatto) | 1/mol | CODATA 2018 |
| `const.r()` | costante molare dei gas | 8.31446261815324 (esatto, prodotto delle costanti di Avogadro e di Boltzmann) | J/(mol·K) | CODATA 2018 |
| `const.h()` | costante di Planck | 6.62607015e-34 (esatto) | J·s | CODATA 2018 |
| `const.p0()` | pressione normale dell'atmosfera standard | 1013.25 (definizione) | hPa | Brochure del SI del BIPM, atmosfera standard |

`const.t0()` non è lo zero assoluto; questo si trova a 0 K, cioè −273,15 °C. I valori compaiono in tutti e quattro i luoghi con tutte le loro cifre, quelli molto grandi e molto piccoli in notazione esponenziale.

## Messaggi al posto dei valori

Un dato fuori dall'intervallo di validità di una formula **non dà mai un valore**, ma al posto del risultato un messaggio che indica il dato e l'intervallo, per esempio «Umidità relativa fuori dall'intervallo da oltre 0 a 100 %» con `humidity.dewpoint(20, 120)`. Allo stesso modo vengono segnalati un dato mancante o un testo che non è un numero («Formula: un dato manca o non è un numero»), un risultato oltre l'intervallo dei numeri rappresentabili e un calcolo passo dopo passo senza soluzione.

- **Calcolo in linea:** il segno di avvertimento ⚠︎, il messaggio al passaggio del mouse.
- **Colonna calcolata:** un trattino «—» nella cella, il messaggio al passaggio del mouse; le altre celle continuano a calcolare, e una colonna che rimanda a questa cella riprende il messaggio.
- **Query:** il segno di avvertimento ⚠︎ nella cella, il messaggio al passaggio del mouse; in una condizione (`WHERE`) il messaggio vale come non soddisfatto; nell'ordinamento (`SORT`) sta in fondo, e `count` non lo conta.
- **Campo formula:** il campo resta vuoto e il messaggio compare al campo; un campo che rimanda a questo campo riprende il messaggio.
- **Regola della banca dati:** una regola di verifica o una condizione la cui formula dà un messaggio vale come non valutabile; il salvataggio viene respinto, e una condizione di modificabilità blocca il record.

## Limiti

- **Nessuna formula propria:** la libreria contiene le formule di questa pagina; non si possono aggiungere formule proprie.
- **Nessun calcolo con le unità:** dati e risultati sono numeri puri nell'unità indicata.
- **Coppie di unità fisse:** si convertono temperatura e lunghezza; la libreria non converte massa, volume, energia né pressione.
- **Nessuna uscita secondo la lingua:** i risultati compaiono con il punto come separatore decimale; secondo la lingua tramite `numberformat` e `currencyformat`.
