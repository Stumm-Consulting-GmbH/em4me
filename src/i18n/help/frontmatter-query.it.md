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

La forma completa si compone di **clausole**: prima il tipo di output opzionale (`LIST` o `TABLE`), poi, in ordine libero e ciascuna al massimo una volta, `FROM` (fonti), `WHERE` (condizione), `SORT` (ordinamento), `LIMIT` (tetto) e `COLUMNS` (disposizione a colonne dell'elenco). Le interruzioni di riga contano come spazi; le parole chiave ignorano maiuscole e minuscole.

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

**Raggruppamento (`GROUP BY`):** `GROUP BY espressione, …` struttura l'output delle attività sotto titoli di gruppo; ogni espressione ulteriore crea un livello di annidamento. I risultati senza valore formano l'ultimo gruppo. In questa forma la clausola si applica solo a `LIST TASKS`.

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

## Fonti (`FROM`)

`FROM` restringe lo spazio dei risultati prima della verifica della condizione:

| Fonte | Significato |
|---|---|
| `"Cartella/Sottocartella"` | file di questa cartella (relativa alla radice della query), sottocartelle incluse |
| `#tag` | file con questo tag; copre anche i sotto-tag come `#tag/sotto` |
| `[[File]]` | file che puntano a `File` |
| `outgoing([[File]])` | file a cui `File` punta |

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
| `file.folder`, `file.path` | cartella o percorso, relativi alla radice della query |
| `file.ext` | estensione del file |
| `file.size` | dimensione in byte |
| `file.ctime`, `file.mtime` | data di creazione e di modifica |
| `file.tags`, `file.aliases` | tag e alias come elenchi |
| `file.inlinks`, `file.outlinks` | file che puntano qui, e file collegati |
| `file.link` | il file stesso come link cliccabile (per le colonne di tabella) |

## Letterali e calcolo

- **I numeri** si scrivono senza virgolette (`prio > 2`); **le stringhe** vanno tra virgolette doppie o singole.
- **Data**: `date(today)` (inizio giornata), `date(now)`, `date(2026-12-31)` o con orario `date(2026-12-31 14:30)`.
- **Durata**: `dur(7 days)`, `dur(1 day 2 hours)`, in breve `dur(2w)`. Unità: `s`, `min`, `h`, `d`, `w`, `mo`, `y` più le forme lunghe; un mese conta come 30 giorni, un anno come 365 giorni.
- **Aritmetica**: `+`, `-`, `*`, `/` con la precedenza consueta; data ± durata dà una data, data − data una durata. Gli operatori tra nomi di campo richiedono spazi (`a - 1`, non `a-1` — quest'ultimo è un nome di campo).

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
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | formattare una data (token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q`) |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valori) = 6` | aggregati su elenchi di numeri |

Una funzione sconosciuta o un numero errato di argomenti mostra un avviso di errore sul blocco.

## Ordinamento e limite

`SORT campo [ASC|DESC], campo2 …` ordina il risultato su più chiavi, in base al tipo (numeri numericamente, date cronologicamente, testo alfabeticamente secondo le regole della lingua); i valori mancanti vanno in fondo indipendentemente dalla direzione. Senza `SORT` resta l'ordine alfabetico. `LIMIT n` taglia il risultato dopo l'ordinamento.

## Elenchi multicolonna

`COLUMNS n` (da 1 a 8) fa fluire l'elenco dei risultati su più colonne — pura presentazione, nessuna modifica dei dati. Con `TABLE`, `COLUMNS` viene ignorato e segnalato con una nota sul blocco.

````markdown
```perspective-query
LIST FROM #segnalibri COLUMNS 3
```
````

## Visualizzazione e interazione

- **Corrispondenze cliccabili**: ogni corrispondenza appare con il suo nome logico; il percorso completo sta nel suggerimento. Un clic apre il file di destinazione in una scheda, esattamente come un link wiki — compresi i valori di link nelle celle di tabella.
- **Aggiornamento dal vivo**: i file nuovi, modificati ed eliminati si riflettono sui risultati visibili senza ricarica manuale, non appena l'indice li ha registrati.
- **Risultato vuoto**: se la query non trova alcun file, appare una breve nota al posto di un'area vuota.
- **Query non valida**: un errore di sintassi mostra un avviso di errore con la posizione al posto di un risultato.

Le tre viste Renderizzato, Diviso e Dal vivo mostrano lo stesso risultato. Nella vista solo sorgente il blocco resta visibile come codice.

## Ambito di ricerca

L'ambito di ricerca è lo stesso dell'indice dei file:

- **Con un'area attiva** copre l'intera area; le relazioni di link (`FROM [[…]]`, `file.inlinks`) vi sono complete.
- **Senza area** copre la cartella del file più due sottolivelli.

I file fuori dall'ambito di ricerca non compaiono nel risultato. Un file non ancora salvato non ha ambito di ricerca; la query mostra allora una nota che indica che sarà disponibile dopo il salvataggio. Le modifiche non salvate di un file aperto, invece, entrano subito nel risultato; per questo non occorre salvare nulla.

## Esportazione

- **Esportazione PDF**: il risultato viene stampato come stato statico del momento del rendering, compresa la disposizione a tabella e a colonne. Le voci appaiono come testo; nel PDF non sono cliccabili.
- **Markdown portabile**: l'esportazione lascia il blocco `perspective-query` invariato come sorgente. Alla riapertura in questo programma viene di nuovo valutato dinamicamente; altri programmi Markdown lo mostrano come blocco di codice.

Per valutazioni libere oltre il linguaggio a clausole — ad esempio strutture ricorsive o riepiloghi calcolati — sono disponibili i [blocchi di script](scripts.md); la loro API pq usa lo stesso modello di campi e blocchi della query.
