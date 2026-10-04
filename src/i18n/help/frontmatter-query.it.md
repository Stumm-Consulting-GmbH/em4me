# Query Perspective

La query Perspective incorpora un **elenco o una tabella di file dinamici e cliccabili** direttamente nel documento. Un blocco di codice con il tag di linguaggio `perspective-query` contiene una query sulle proprietà del frontmatter e sui campi del file; una volta renderizzato, in questo punto appare il risultato su tutti i file dell'ambito di ricerca. Ogni corrispondenza è cliccabile e apre il file di destinazione. Il risultato si mantiene aggiornato con l'insieme dei file.

Le proprietà diventano così panoramiche navigabili: una pagina iniziale tematica che elenca tutti i file correlati resta aggiornata senza interventi manuali.

## Struttura di una query

La forma più semplice è una condizione nuda; produce l'elenco alfabetico dei risultati:

````markdown
```perspective-query
ambito = "Privato"
```
````

La forma completa si compone di **clausole**: prima il tipo di output opzionale (`LIST` o `TABLE`), poi, in ordine libero e ciascuna al massimo una volta, `FROM` (fonti), `WHERE` (condizione), `GROUP BY` (raggruppamento), `HAVING` (condizione sul gruppo), `SORT` (ordinamento), `LIMIT` (tetto), `COLUMNS` (disposizione a colonne dell'elenco) e `DISPLAY` (forma di presentazione). Le interruzioni di riga contano come spazi; le parole chiave ignorano maiuscole e minuscole.

````markdown
```perspective-query
TABLE stato AS "Stato", file.mtime
FROM "Progetti" AND #attivo
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```
````

Una condizione nuda senza parola chiave di clausola viene letta come `LIST WHERE condizione`; le query esistenti continuano a funzionare invariate. I nomi di campo identici a parole chiave di clausola (come `limit`) restano utilizzabili in questa forma breve.

## Tipi di output

- **`LIST`** — elenco di file cliccabile (predefinito). Un'espressione opzionale a seguire (`LIST stato WHERE …`) appare come suffisso attenuato dietro ogni corrispondenza.
- **`TABLE colonna [AS "Titolo"], …`** — tabella con colonne liberamente definibili da campi o espressioni. Senza alias, l'espressione stessa fa da titolo di colonna. La prima colonna è il link cliccabile al file; `TABLE WITHOUT ID …` la nasconde. I valori di elenco appaiono separati da virgole, le date in formato ISO, i valori di link restano cliccabili.

## Livello di blocco (`BLOCKS`)

L'aggiunta di ambito `BLOCKS` subito dopo `LIST` o `TABLE` valuta la query sulle **proprietà di blocco** — le proprietà per ancora di blocco della pagina [Proprietà del blocco](block-properties.md). I risultati sono allora blocchi invece di file: ogni risultato appare come destinazione cliccabile nella forma `File#^ancora`; il clic apre il file e salta al blocco.

````markdown
```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```
````

- **Risoluzione dei campi**: I nomi di campo nudi corrispondono prima alle proprietà di blocco e altrimenti ricadono sulle proprietà del frontmatter del documento portante — un blocco «eredita» il suo contesto di file. I campi `file.*` e le fonti `FROM` si riferiscono sempre al documento portante.
- **`updated`**: Momento dell'ultima modifica delle proprietà di blocco, come valore di data per confronti e ordinamento (a meno che il blocco non porti una propria proprietà `updated`).
- **Tabelle**: `TABLE BLOCKS colonna, …` mostra la destinazione di blocco cliccabile nella prima colonna; `WITHOUT ID` viene dopo `BLOCKS`. Le altre colonne provengono tipicamente dalle proprietà di blocco.
- **Insieme dei risultati**: Contano solo i blocchi la cui ancora esiste nel documento; le voci orfane (proprietà senza ancora nel testo) non sono risultati. I documenti senza proprietà di blocco semplicemente non danno risultati.

````markdown
```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Progetti"
WHERE prio > 2
```
````

## Livello di attività (`TASKS`)

L'aggiunta di ambito `TASKS` subito dopo `LIST` o `TABLE` valuta la query sulle **attività** dell'ambito di ricerca (righe con casella come nella pagina [Liste di attività](tasks.md); il Filtro globale dell'estensione vale anche qui). I risultati sono singole righe di attività con casella di stato, descrizione, badge di marcatore e provenienza del file; il clic sulla descrizione apre il file sorgente alla riga. La casella di stato, il pulsante di posticipazione e il pulsante di modifica riscrivono direttamente nel file sorgente — dettagli nella pagina Liste di attività.

````markdown
```perspective-query
LIST TASKS
FROM "Progetti"
WHERE status.type = "TODO" AND due <= date(eow)
```
````

I nomi di campo nudi corrispondono prima ai campi di attività fissi e altrimenti ricadono sulle proprietà del frontmatter del documento portante; i campi `file.*` e le fonti `FROM` si riferiscono sempre al documento portante.

| Campo | Contenuto |
|---|---|
| `due`, `scheduled`, `start` | scadenze manuali come valori di data (mancante o non valida: vuoto) |
| `created`, `done`, `cancelled` | date automatiche come valori di data |
| `due.set`, `due.invalid`, … | per campo di scadenza: marcatore presente o non valido nel calendario (`"true"`/`"false"`) |
| `happens` | valore più precoce tra scadenza, pianificata e inizio |
| `priority`, `priority.rank` | livello di priorità come nome o come numero di rango (0 = la massima) |
| `status`, `status.type` | carattere di stato o tipo di stato (`TODO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `NON_TASK`) |
| `description`, `heading`, `tags` | testo della descrizione, titolo della sezione circostante, tag della riga |
| `recurrence` | regola di ricorrenza come testo |
| `id`, `dependson`, `id.set`, `id.duplicate` | ID attività, elenco dei predecessori, «ha un ID», «ID assegnato più volte» |
| `blocked`, `blocking` | bloccata da predecessori aperti, o ne blocca altri (`WHERE blocked = "true"`) |
| `urgency` | punteggio di urgenza (formula nella pagina Liste di attività) |
| `line` | numero di riga nel file sorgente |

I campi di attività booleani si filtrano tramite confronto di stringa (`blocked = "true"`), come i valori booleani del frontmatter.

**Comodità delle date:** oltre a `today`, `now` e le date fisse, i letterali `date(...)` conoscono le parole relative `tomorrow`, `yesterday` nonché i confini di periodo `sow`/`eow` (inizio settimana lunedì, fine settimana), `som`/`eom` (mese) e `soy`/`eoy` (anno). Le parole di inizio valgono per le 00:00 del giorno, quelle di fine per la fine della giornata — `due <= date(eow)` include per intero la domenica.

**Ordinamento:** senza `SORT`, la lista di attività si ordina per tipo di stato (prima ciò che è in corso, il completato e lo scartato in fondo), poi urgenza decrescente, scadenza, priorità e percorso. `SORT` (ad esempio `SORT urgency DESC` o `SORT due`) prevale su questa impostazione predefinita.

**Raggruppamento (`GROUP BY`):** `GROUP BY espressione, …` struttura l'output delle attività sotto titoli di gruppo; ogni espressione ulteriore crea un livello di annidamento, e i risultati senza valore formano l'ultimo gruppo. Raggruppamento, aggregati e condizione sul gruppo valgono a tutti i livelli; li descrive la sezione «Raggruppamento e aggregazione».

````markdown
```perspective-query
LIST TASKS GROUP BY heading, priority
```
````

**Disposizione (`HIDE`/`SHOW`/`SHORT`):** `HIDE elemento, …` nasconde blocchi di output, `SHOW` rivela quelli nascosti per impostazione predefinita, `SHORT` mostra i badge di marcatore solo come simbolo (valore completo nel suggerimento). Elementi: i sei tipi di scadenza, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink` (provenienza del file), `count` (contatore di risultati), `urgency` (badge di punteggio, solo tramite `SHOW`), `edit` e `postpone` (i due pulsanti di azione).

````markdown
```perspective-query
LIST TASKS SHOW urgency HIDE backlink, created SHORT
```
````

**Query globale:** la sezione di impostazioni **Attività** può memorizzare parti `FROM`/`WHERE` anteposte implicitamente a ogni query `TASKS` (ad esempio un filtro di cartella o di stato per l'intera sezione). Una query globale errata si segnala sul blocco con un proprio avviso.

## Livello di record (`RECORDS`)

L'aggiunta di ambito `RECORDS` subito dopo `LIST` o `TABLE` valuta la query sui **record** delle tabelle della banca dati (pagina [Banca dati](database.md)). I risultati sono singoli record: ciascuno appare con la sua forma di visualizzazione, in mancanza con il suo identificatore interno, e un clic apre la sua **maschera** invece del file di tabella.

````markdown
```perspective-query
TABLE RECORDS autore, pagine
FROM "Libri"
WHERE pagine > 500
SORT autore
```
````

- **Fonte**: `FROM` indica la tabella come stringa, con il nome del suo file senza estensione e senza distinzione tra maiuscole e minuscole (`"Libri"`) oppure come percorso relativo alla radice dell'area, estensione compresa (`"Archivio/Libri.md"`), come l'indicazione `table` di una colonna di collegamento. Più tabelle si combinano con `OR`, `AND`, parentesi e `-` come di consueto. Va indicata senza negazione almeno una tabella o una gerarchia (sezione «Gerarchie» più sotto); un tag, un link wiki, `outgoing(…)` e il link wiki vuoto producono a questo livello un messaggio di errore. Una tabella che non esiste non dà risultati. Non ne dà nemmeno una tabella il cui file si trova nella cartella dei modelli, a meno che `FROM` la indichi con il suo percorso attraverso quella cartella, ad esempio `"Modelli/Libri.md"`; il solo nome non basta (sezione «Fonti»).
- **Campi e valori**: i nomi nudi sono i campi della tabella, senza distinzione tra maiuscole e minuscole. Ogni valore ha il tipo della sua colonna, per cui condizione e ordinamento trattano i numeri come numeri e le date cronologicamente; un valore booleano si verifica con `campo = "true"` o `campo = "false"`. Se il contenuto di una cella non corrisponde al suo tipo, il valore conta come mancante. Un nome che la tabella non porta resta vuoto e non ricade sul frontmatter del file di tabella.
- **Dati propri**: `record.id` è l'identificatore interno del record, `record.table` il nome della sua tabella; entrambi prevalgono su un campo che si chiama letteralmente così. `file.*` indica il file di tabella, `this.` il file portante della query.
- **Tabelle**: `TABLE RECORDS …` mostra il risultato nella prima colonna «Record»; `WITHOUT ID` viene dopo `RECORDS`. Il titolo di una colonna è l'alias, altrimenti l'etichetta del campo nella lingua del programma impostata secondo la catena di ripiego della pagina [Banca dati](database.md), altrimenti l'espressione stessa, ad esempio per un percorso.
- **Valori di collegamento**: un campo di riferimento mostra la forma di visualizzazione del record di destinazione, in mancanza il suo identificatore, e un clic apre la maschera del record di destinazione. Un collegamento vuoto e uno che non porta da nessuna parte restano una cella vuota.
- **Ordine**: senza `SORT` i risultati seguono la loro forma di visualizzazione senza distinzione tra maiuscole e minuscole, a parità di forma di visualizzazione l'identificatore, e i record senza forma di visualizzazione vanno in fondo.
- **Due destinazioni del clic**: un record nel risultato di una query apre la maschera, mentre un collegamento nel testo corrente come `[[Libri#^r-00042]]` apre il file di tabella alla riga del record. La maschera mostra lo stato salvato.
- **Stato non salvato**: le modifiche di una tabella aperta entrano subito nel risultato, senza salvare.
- **Non a questo livello**: `bold()` in una colonna o in un'espressione di `GROUP BY` produce un messaggio di errore, perché un valore della banca dati non porta formattazione; nella condizione e nell'ordinamento resta consentito. `HIDE`, `SHOW` e `SHORT` valgono solo per `LIST TASKS` e si segnalano qui come ai livelli di file e di blocco.
- **Risultato vuoto e banca dati disattivata**: senza risultati compare «Nessun record corrisponde a questa query». Se l'estensione «Banca dati» è disattivata, l'elenco resta vuoto, sopra compare una nota e non appare alcun messaggio di errore.

### Collegamento tramite campi di riferimento

Un **percorso** attraverso un campo di riferimento legge i campi del record a cui punta: in un prestito, `libro.titolo` è il titolo del libro collegato, e `libro.editore.citta` va un livello più in là, in una terza tabella. I percorsi agiscono nelle colonne, in `WHERE` e in `SORT`:

````markdown
```perspective-query
TABLE RECORDS libro.titolo AS "Titolo", libro.autore AS "Autore", restituito
FROM "Prestiti"
WHERE libro.pagine > 300
SORT libro.titolo
```
````

- Un campo che si chiama letteralmente come il percorso, ad esempio `libro.titolo`, prevale.
- Un collegamento vuoto, uno che non porta da nessuna parte e uno il cui valore di chiave corrisponde a più record danno un valore vuoto; per quello ambiguo compare in più una nota sopra il risultato. Anche un percorso attraverso un campo che non è un collegamento resta vuoto.
- Se un percorso termina su un campo di riferimento, la cella mostra di nuovo un collegamento che apre la maschera.

La **direzione opposta** non richiede una notazione propria. Quali prestiti puntano a un libro lo dice una condizione sul campo di riferimento:

````markdown
```perspective-query
LIST RECORDS FROM "Prestiti" WHERE libro = "r-00005"
```
````

Il confronto segue la lettura di una cella di collegamento: un identificatore corrisponde in entrambe le grafie (`r-5` e `r-00005`), ogni altro testo viene confrontato con la chiave funzionale a un solo elemento del record di destinazione, carattere per carattere. La forma di visualizzazione conta solo se è al tempo stesso la chiave. `!=`, `IN` e `NOT IN` seguono la stessa regola, e `SORT` su un campo di riferimento ordina secondo la forma di visualizzazione del record di destinazione.

### Gerarchie (`ancestors`, `descendants`)

Due fonti raccolgono record su un **numero qualsiasi di livelli** di un campo di riferimento, ad esempio il personale di un'organizzazione tramite il campo `capo`:

````markdown
```perspective-query
LIST RECORDS FROM descendants([[Team#^r-00001]], capo) WHERE dal > 2015
```
````

- `descendants(destinazione, campo, …)` restituisce tutti i record che puntano alla destinazione tramite i campi indicati, direttamente o attraverso livelli intermedi; `ancestors(destinazione, campo, …)` la direzione opposta, cioè la catena dei record a cui punta la destinazione, fino in cima.
- La **destinazione** è un collegamento a un record nella grafia del testo corrente. La tabella compare con il suo nome o come percorso, anche senza estensione; dopo `#` segue l'identificatore, con o senza `^` e anche nella forma breve, oppure il valore della chiave funzionale a un solo elemento, ad esempio `[[Team#Clara]]`. Un alias dopo `|` non conta.
- **Campi**: uno o più campi di riferimento, separati da virgole, ad esempio `padre, madre`; un nome con spazi va tra virgolette. La gerarchia segue tutti i campi indicati, anche oltre i confini di tabella.
- La **destinazione stessa non fa parte** del risultato, e ogni record vi compare al massimo una volta. Non c'è un limite di profondità. Se i collegamenti formano un ciclo, la ricerca termina comunque, e sopra il risultato compare una nota invece di un messaggio di errore.
- L'insieme agisce come ogni fonte: `WHERE`, `SORT`, `LIMIT` e le colonne valgono, `AND "Tabella"` lo limita a una tabella, `-` lo esclude. Indicata da sola, una gerarchia è una fonte completa; solo negata produce un messaggio di errore, perché allora non limita alcuna tabella.
- Una destinazione che non esiste non dà risultati. Se il valore di chiave della destinazione corrisponde a più record, il risultato resta vuoto e sopra di esso compare la nota sul collegamento ambiguo.
- Entrambe le fonti esistono solo al livello di record; agli altri livelli producono un messaggio di errore.

Una gerarchia appare come albero rientrato con l'indicazione `DISPLAY tree BY campo` (sezione «Forma di presentazione»).

## Fonti (`FROM`)

`FROM` restringe lo spazio dei risultati prima della verifica della condizione:

| Fonte | Significato |
|---|---|
| `"Cartella/Sottocartella"` | file di questa cartella (relativa alla radice della query), sottocartelle incluse |
| `#tag` | file con questo tag; copre anche i sotto-tag come `#tag/sotto` |
| `[[File]]` | file che puntano a `File` |
| `outgoing([[File]])` | file a cui `File` punta |
| `[[]]` | file che puntano al file portante (sezione «Autoriferimento») |
| `outgoing([[]])` | file a cui punta il file portante |
| `descendants([[Tabella#^r-00001]], campo)` | record che puntano al record di destinazione tramite `campo`, su tutti i livelli (solo livello di record, sezione «Gerarchie») |
| `ancestors([[Tabella#^r-00001]], campo)` | record a cui punta il record di destinazione tramite `campo`, su tutti i livelli (solo livello di record) |

Al livello di record una stringa indica una tabella invece di una cartella (sezione «Livello di record»).

**I modelli non sono risultati.** Ciò che si trova nella cartella dei modelli della pagina [Modelli](templates.md), sottocartelle comprese, non compare nel risultato a nessun livello: né il file, né i suoi blocchi e attività, né i record di una tabella che vi si trova. Se `FROM` indica espressamente la cartella dei modelli o una delle sue sottocartelle, la query mostra esattamente il contenuto della cartella indicata: `FROM "Modelli"` tutti i modelli, `FROM "Progetti" OR "Modelli"` i progetti e i modelli. Non valgono come indicazione una cartella superiore come la radice dell'area `""`, una cartella negata come `-"Modelli"`, un tag e un collegamento. Se l'estensione «Modelli» è disattivata, l'esclusione non si applica.

Le fonti si combinano con `AND`, `OR`, parentesi e il prefisso di negazione `-`:

````markdown
```perspective-query
FROM ("Progetti" OR #importante) AND -#archivio
```
````

## Condizioni (`WHERE`)

| Categoria | Sintassi | Significato |
|---|---|---|
| Confronto | `campo = "valore"`, `campo != "valore"` | uguale, diverso (senza distinzione di maiuscole) |
| Ordine | `campo < valore`, `<=`, `>`, `>=` | in base al tipo: numeri numericamente, date cronologicamente, testo alfabeticamente |
| Insieme | `campo IN ("a", "b")`, `campo NOT IN (…)` | corrisponde a uno dei valori, o a nessuno |
| Logica | `AND`, `OR`, `NOT` | e, o, non (precedenza: `NOT` prima di `AND` prima di `OR`) |
| Raggruppamento | `( … )` | le parentesi raggruppano le sottoespressioni |
| Funzione | `contains(tags, "rosso")` | le chiamate di funzione sono ammesse come condizione |

Semantica dei valori: un campo scalare si confronta direttamente; in un **campo elenco** (ad es. `tags`), `=` verifica l'appartenenza e `IN` un'intersezione non vuota. Con un **campo mancante**, `=` e `IN` sono falsi, `!=` e `NOT IN` sono veri. Solo i campi del livello superiore del frontmatter sono interrogabili; i valori numerici si confrontano numericamente nei confronti di ordine (`10` sta sopra `5`).

## Campi

Oltre alle proprietà del frontmatter (nome nudo, ad es. `stato`), sono disponibili campi di file impliciti nello spazio dei nomi `file.`:

| Campo | Contenuto |
|---|---|
| `file.name` | nome logico del file (senza estensione) |
| `file.day` | data dal prefisso ISO del nome (`2026-04-18 Riunione`), altrimenti vuoto |
| `file.folder`, `file.path` | cartella o percorso, relativi alla radice della query |
| `file.ext` | estensione del file |
| `file.size` | dimensione in byte |
| `file.ctime`, `file.mtime` | data di creazione e di modifica |
| `file.tags`, `file.aliases` | tag e alias come elenchi |
| `file.inlinks`, `file.outlinks` | file che puntano qui, e file collegati |
| `file.link` | il file stesso come link cliccabile (per le colonne di tabella) |

## Autoriferimento (`this.`)

Il prefisso `this.` si riferisce al **file portante** della query, cioè al documento che contiene il blocco, e non al file trovato. Vale allo stesso modo per i campi di file e per le proprietà del frontmatter: `this.X` è ciò che `X` darebbe nel file portante.

````markdown
```perspective-query
LIST WHERE ambito = this.ambito AND file.path != this.file.path
```
````

- **Stesso significato a ogni livello**: anche nelle query `BLOCKS`, `TASKS` e `RECORDS`, `this.` indica il file portante del blocco, mai il singolo blocco, la riga di attività né il record.
- **Precedenza**: la regola `this.` prevale su una proprietà del frontmatter con lo stesso nome, esattamente come lo spazio dei nomi `file.`.
- **Senza file portante**: se non è risolvibile, ogni accesso `this.` dà un valore vuoto; un `this` nudo senza punto resta vuoto come ogni nome di campo sconosciuto.

Come **fonte**, il link wiki vuoto indica lo stesso file: `FROM [[]]` raccoglie i file che puntano ad esso, `FROM outgoing([[]])` la direzione opposta. Il file portante non è mai risultato di se stesso; senza un file portante risolvibile l'insieme resta vuoto invece di comprendere tutti i file.

## Letterali e calcolo

- **I numeri** si scrivono senza virgolette (`prio > 2`); **le stringhe** vanno tra virgolette doppie o singole.
- **Data**: `date(today)` (inizio giornata), `date(now)`, `date(2026-12-31)` o con orario `date(2026-12-31 14:30)`.
- **Durata**: `dur(7 days)`, `dur(1 day 2 hours)`, in breve `dur(2w)`. Unità: `s`, `min`, `h`, `d`, `w`, `mo`, `y` più le forme lunghe; un mese conta come 30 giorni, un anno come 365 giorni.
- **Aritmetica**: `+`, `-`, `*`, `/` con la precedenza consueta; data ± durata dà una data, data − data una durata. Gli operatori tra nomi di campo richiedono spazi (`a - 1`, non `a-1` — quest'ultimo è un nome di campo).
- **Concatenazione di testo**: se `+` non torna numericamente e un lato è una stringa, unisce le forme di visualizzazione di entrambi i lati; così nascono colonne composte come `file.day + " — " + stato`. Le addizioni puramente numeriche restano numeriche (`5 + "3"` dà 8), e un valore mancante resta mancante e lascia la cella vuota.

Uno schema tipico — «modificato negli ultimi 7 giorni»:

````markdown
```perspective-query
WHERE file.mtime >= date(today) - dur(7 days)
```
````

## Funzioni

| Funzione | Esempio | Significato |
|---|---|---|
| `contains(x, w)` | `contains(titolo, "Piano")` | sottostringa in una stringa o elemento in un elenco (distingue le maiuscole) |
| `icontains(x, w)` | `icontains(titolo, "piano")` | come `contains`, senza distinzione di maiuscole |
| `length(x)` | `length(tags) > 2` | lunghezza di una stringa o di un elenco |
| `lower(s)`, `upper(s)` | `lower(stato) = "aperto"` | minuscole o maiuscole |
| `startswith(s, p)`, `endswith(s, p)` | `startswith(file.name, "Progetto")` | inizio o fine di una stringa |
| `default(x, d)` | `default(prio, 0) > 2` | valore di riserva quando il campo manca |
| `choice(b, a, c)` | `choice(prio > 5, "alto", "normale")` | se-allora-altrimenti |
| `number(x)`, `string(x)` | `number(valore) * 2` | conversione in numero o testo |
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | formattare una data (token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` oltre a `MMMM`/`MMM`, `EEEE`/`EEE` per i nomi di mese e giorno nella lingua impostata del programma e `d`, `M` senza zero iniziale; le parentesi quadre proteggono il testo letterale: `"[settimana] ww"`) |
| `days(x)` | `days(date(today) - file.day)` | una durata come numero di giorni interi; arrotondato, perché un cambio d'ora non la sposti di un giorno |
| `numberformat(x[, n])` | `numberformat(importo, 2)` | presentare un numero localizzato: senza secondo argomento secondo la lingua, altrimenti con esattamente n decimali |
| `currencyformat(x[, v])` | `currencyformat(importo, "CHF")` | presentare un importo localizzato: in euro senza indicazione, e il numero non formattato per un codice di valuta sconosciuto |
| `infolder(l, "Cartella")` | `length(infolder(file.inlinks, "Progetti")) = 0` | il sottoelenco dei valori di link la cui destinazione si trova nella cartella o sotto di essa |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valori) = 6` | aggregati su elenchi di numeri; su un gruppo riuniscono i valori di tutti i suoi risultati (sezione «Raggruppamento e aggregazione») |
| `count(x)` | `count(tags) > 2` | numero dei valori presenti: per un elenco i suoi elementi, per un valore singolo 1, senza valore 0; `count()` senza campo conta i risultati di un gruppo |
| `bold(x)` | `bold(stato)` | presentare un valore evidenziato (sezione «Evidenziazione») |

Una funzione sconosciuta o un numero errato di argomenti mostra un avviso di errore sul blocco.

**Lingua dei formattatori:** `dateformat`, `numberformat` e `currencyformat` seguono la lingua del programma scelta nelle impostazioni, non quella del sistema operativo. Dove non c'è alcun documento dietro, come nelle colonne calcolate delle tabelle di dati e nei calcoli in linea, continua a valere la lingua dell'ambiente.

## Evidenziazione

`bold(valore)` presenta un valore evidenziato, sia nelle celle di tabella sia nel complemento di una voce di elenco e nel valore di un gruppo. La marcatura sopravvive alla concatenazione: `bold` può racchiudere anche solo una **parte** di un'espressione composta, il resto resta normale.

````markdown
```perspective-query
TABLE bold(stato) AS "Stato", file.mtime
```
````

Il contenuto delle celle non valuta Markdown: un asterisco nel testo appare letteralmente, e un'evidenziazione nasce soltanto da questa chiamata. Confronto, ordinamento e raggruppamento lavorano sul testo puro e si comportano quindi esattamente come senza marcatura; un valore mancante resta vuoto invece di produrre un'evidenziazione vuota.

## Esempio: l'ultimo contatto

Insieme, gli elementi di questa pagina danno un quadro che mostra, sulla nota di una persona, quando questa è comparsa l'ultima volta in una nota datata e quanto tempo è passato:

````markdown
```perspective-query
TABLE WITHOUT ID file.link AS "Nota",
  file.day + " — " + bold(days(date(today) - file.day) + " giorni") AS "Ultimo contatto"
FROM [[]]
SORT file.day DESC
LIMIT 1
```
````

`FROM [[]]` raccoglie le note che puntano a questo file. `file.day` legge la loro data dal nome del file, `date(today) - file.day` dà la durata fino a oggi e `days(…)` il numero di giorni interi. Il segno più compone data, trattino e numero di giorni in una cella, e `bold(…)` evidenzia la distanza: «2026-04-18 — **48 giorni**». Le note senza data nel nome si ordinano in fondo indipendentemente dalla direzione e non scalzano il risultato.

## Ordinamento e limite

`SORT campo [ASC|DESC], campo2 …` ordina il risultato su più chiavi, in base al tipo (numeri numericamente, date cronologicamente, testo alfabeticamente secondo le regole della lingua); i valori mancanti vanno in fondo indipendentemente dalla direzione. Senza `SORT` resta l'ordine alfabetico; attività e record seguono l'ordine predefinito della loro sezione. `LIMIT n` taglia il risultato dopo l'ordinamento. In una tabella raggruppata `SORT` e `LIMIT` ordinano e tagliano i gruppi invece dei risultati (sezione «Raggruppamento e aggregazione»).

## Raggruppamento e aggregazione (`GROUP BY`, `HAVING`)

`GROUP BY espressione, …` riunisce i risultati in gruppi secondo il valore di un'espressione, a ogni livello: file, blocchi, attività e record. Ogni espressione ulteriore forma un gradino sotto il precedente. I gruppi sono ordinati secondo il loro valore, e i risultati senza valore vengono per ultimi nel gruppo «(senza valore)». Un valore di elenco come `file.tags` forma un gruppo per combinazione, quindi `[rosso, blu]` e `[blu, rosso]` sono due; non si suddivide per singoli elementi dell'elenco. Un campo di riferimento al livello di record raggruppa secondo il record a cui punta: due libri con lo stesso titolo danno due gruppi, ognuno mostra la forma di visualizzazione del proprio libro, e un clic su di esso apre la maschera di quel libro.

- **Elenco**: `LIST … GROUP BY …` mostra per ogni gruppo un titolo e sotto i suoi risultati, ogni gradino rientrato di un passo. Un risultato appare e risponde al clic come nell'elenco senza raggruppamento.
- **Tabella**: `TABLE … GROUP BY …` mostra una riga per gruppo, con più gradini una per gruppo del gradino più basso; i singoli risultati non compaiono. In testa sta, per ogni espressione di `GROUP BY`, una colonna con il valore del gruppo, al posto della colonna «File» o «Record». Il suo titolo è l'etichetta del campo al livello di record, altrimenti l'espressione stessa; `WITHOUT ID` nasconde queste colonne. Le altre colonne mostrano valori sul gruppo.

````markdown
```perspective-query
TABLE RECORDS count() AS "Libri", sum(pagine) AS "Pagine"
FROM "Libri"
GROUP BY autore
HAVING count() > 1
SORT count() DESC, autore
```
````

**Riga o gruppo.** Una funzione di aggregazione prende il suo significato dal punto in cui si trova. I **punti di aggregazione** sono le colonne e il `SORT` di una tabella raggruppata, nonché `HAVING`; lì calcola su tutti i risultati del gruppo. Ovunque altrove calcola sul valore del singolo risultato, cioè in `WHERE`, nelle espressioni di `GROUP BY`, nelle colonne di una tabella senza `GROUP BY`, nel complemento dell'elenco e nel `SORT` di un elenco raggruppato. Tre esempi:

| Query | Significato |
|---|---|
| `TABLE sum(valori)` | per ogni file la somma del suo elenco `valori` (riga) |
| `TABLE sum(valori) GROUP BY stato` | per ogni stato la somma di tutti i valori di tutti i file con quello stato (gruppo) |
| `LIST GROUP BY stato HAVING count() > 2` | solo gli stati con più di due file, con i loro file sotto (condizione sul gruppo) |

**Sul gruppo** `count()` conta i risultati e `count(x)` i risultati in cui `x` ha un valore. `sum`, `average`, `min` e `max` riuniscono i valori di tutti i risultati, un elenco con tutti i suoi elementi; `min` e `max` lì accettano anche date e restituiscono allora una data. Il calcolo sugli aggregati è consentito, ad esempio `sum(pagine) / count()`. L'aggregato sull'elenco di un singolo risultato non è raggiungibile in un punto di aggregazione. Nella riga degli aggregati della [Perspective Datatable](datatable.md) la media si chiama `avg`, nella query `average`.

**Sono consentiti in un punto di aggregazione** un'espressione uguale a un'espressione di `GROUP BY` (maiuscole e minuscole dei nomi di campo non contano), letterali, aggregati e ogni calcolo o funzione su di essi, ad esempio `upper(autore) + ": " + count()`. Producono invece un messaggio di errore:

- un altro campo in una colonna o nel `SORT` di una tabella raggruppata, anche un autoriferimento con `this.`; il messaggio indica la colonna e rimanda a `LIST`, che mostra i singoli risultati;
- un altro campo in `HAVING`; il messaggio indica il campo e rimanda a `WHERE`, che filtra i singoli risultati;
- un aggregato dentro un aggregato, ad esempio `sum(count(x))`;
- `count()` senza campo in un punto di riga, ad esempio in `WHERE` o in una tabella senza `GROUP BY`;
- `HAVING` senza `GROUP BY`.

**Condizione sul gruppo (`HAVING`).** `HAVING` verifica i gruppi come `WHERE` verifica i risultati: è un'espressione di verità come dopo `WHERE`, sta solo insieme a `GROUP BY` in qualsiasi posizione tra le clausole e agisce nell'elenco come nella tabella. Con più gradini verifica i gruppi del gradino più basso. Un gruppo superiore sotto cui non resta alcun sottogruppo decade, e gli altri conservano solo i risultati dei loro sottogruppi rimasti.

**Ordine.** Nella tabella raggruppata `WHERE` filtra i risultati, poi si formano i gruppi, `HAVING` li verifica, `SORT` li ordina (senza `SORT` secondo il loro valore) e `LIMIT` limita il numero delle righe. Con più gradini `SORT` ordina i gruppi di ogni gradino tra loro. Nell'elenco raggruppato invece `SORT` e `LIMIT` ordinano e tagliano i risultati prima che si formino i gruppi, e `HAVING` agisce dopo; i gruppi stessi vi sono ordinati secondo il loro valore.

**Limiti.** Una tabella senza `GROUP BY` calcola per risultato; non esiste un totale generale su tutti i risultati senza raggruppamento. `HIDE`, `SHOW` e `SHORT` restano riservati all'elenco delle attività. L'albero (`DISPLAY tree`) non è adatto ad alcuna query raggruppata. Come fonte di un repertorio di valori o di un campo raccolta, una query raggruppata fornisce gli stessi risultati che senza raggruppamento (pagina [Profili di proprietà](property-profiles.md)).

## Elenchi multicolonna

`COLUMNS n` (da 1 a 8) fa fluire l'elenco dei risultati su più colonne — pura presentazione, nessuna modifica dei dati. Con `TABLE`, `COLUMNS` viene ignorato e segnalato con una nota sul blocco.

````markdown
```perspective-query
LIST FROM #segnalibri COLUMNS 3
```
````

## Forma di presentazione (`DISPLAY`)

L'indicazione `DISPLAY` seguita dal nome di una forma sceglie la forma in cui appare il risultato. È una clausola come le altre e di solito sta alla fine; senza di essa il risultato appare come elenco o come tabella, a seconda del tipo di output. Elenco e tabella si scelgono con `LIST` e `TABLE`, non con `DISPLAY`; `DISPLAY list` e `DISPLAY table` contano perciò come forme sconosciute.

````markdown
```perspective-query
LIST RECORDS FROM "Team" DISPLAY tree BY capo
```
````

La forma disponibile è l'**albero** (`DISPLAY tree BY campo`). Mostra i record di una query sui record rientrati lungo il campo di riferimento indicato:

- Un record sta sotto il record a cui punta il suo campo, se questo è nel risultato. Altrimenti è una **radice** e sta all'estrema sinistra: senza collegamento, con un collegamento che non porta da nessuna parte o a un record che la condizione esclude. Con `descendants(…)` le radici sono quindi i record posti direttamente sotto la destinazione, perché la destinazione stessa non fa parte del risultato.
- Radici e fratelli seguono l'ordine del risultato, che `SORT` determina.
- Ogni record compare esattamente una volta, anche se i collegamenti formano un ciclo. Un ciclo senza radice segue dopo le altre radici e comincia con il suo primo record nell'ordine del risultato.
- Agisce soltanto il campo dopo `BY`. Se una tabella porta due campi genitore come padre e madre, l'albero segue quello indicato; quali record stanno nel risultato lo determina sempre la fonte.
- Un nodo mostra la forma di visualizzazione come una voce di elenco, con `LIST` seguita dal campo aggiuntivo; con `TABLE` l'albero non mostra colonne. Un clic apre la maschera.
- Oltre i 32 livelli il rientro non aumenta più; i nodi più profondi stanno al completo al 32° livello.

**Ripiego**: se una forma è sconosciuta o non adatta alla query, il risultato appare senza di essa, cioè come elenco o tabella, con sopra una nota che indica la forma e senza messaggio di errore. L'albero è adatto solo al livello di record e solo con un campo dopo `BY` che sia un campo di riferimento in almeno una tabella del risultato. Non è mai adatto a una query raggruppata; appare allora l'output raggruppato con la nota. Un risultato vuoto mostra la sua nota di risultato vuoto e nessuna forma. Se manca il nome della forma dopo `DISPLAY` o il campo dopo `BY`, la query non è valida.

## Visualizzazione e interazione

- **Corrispondenze cliccabili**: ogni corrispondenza appare con il suo nome logico; il percorso completo sta nel suggerimento. Un clic apre il file di destinazione in una scheda, esattamente come un link wiki — compresi i valori di link nelle celle di tabella. Al livello di record una corrispondenza prende il nome dalla sua forma di visualizzazione, e un clic apre la sua maschera.
- **Aggiornamento dal vivo**: i file nuovi, modificati ed eliminati si riflettono sui risultati visibili senza ricarica manuale, non appena l'indice li ha registrati.
- **Risultato vuoto**: se la query non trova alcun file né alcun record, appare una breve nota al posto di un'area vuota.
- **Query non valida**: un errore di sintassi mostra un avviso di errore con la posizione al posto di un risultato.

Le tre viste Renderizzato, Diviso e Dal vivo mostrano lo stesso risultato. Nella vista solo sorgente il blocco resta visibile come codice.

## Ambito di ricerca

L'ambito di ricerca è lo stesso dell'indice dei file:

- **Con un'area attiva** copre l'intera area; le relazioni di link (`FROM [[…]]`, `file.inlinks`) vi sono complete.
- **Senza area** copre la cartella del file più due sottolivelli.

I file fuori dall'ambito di ricerca non compaiono nel risultato, e nemmeno ciò che si trova nella cartella dei modelli, a meno che la query la indichi (sezione «Fonti»). Un file non ancora salvato non ha ambito di ricerca; la query mostra allora una nota che indica che sarà disponibile dopo il salvataggio. Le modifiche non salvate di un file aperto, anche di una tabella della banca dati, invece entrano subito nel risultato; per questo non occorre salvare nulla.

## Esportazione

- **Esportazione PDF**: il risultato viene stampato come stato statico del momento del rendering, compresa la disposizione a tabella e a colonne. Le voci appaiono come testo; nel PDF non sono cliccabili.
- **Markdown portabile**: l'esportazione lascia il blocco `perspective-query` invariato come sorgente. Alla riapertura in questo programma viene di nuovo valutato dinamicamente; altri programmi Markdown lo mostrano come blocco di codice.

Per valutazioni libere oltre il linguaggio a clausole — ad esempio strutture ricorsive o riepiloghi calcolati — sono disponibili i [blocchi di script](scripts.md); la loro API pq usa lo stesso modello di campi e blocchi della query.
