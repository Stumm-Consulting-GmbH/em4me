# Perspective Datatable

La Perspective Datatable è una **tabella dati tipizzata con funzioni di calcolo**: le colonne hanno tipi di valore fissi, le celle accettano solo valori conformi al tipo, le righe di aggregati calcolano in tempo reale e le colonne calcolate valutano espressioni per riga. La modifica avviene direttamente nella griglia renderizzata; tutti i dati restano come testo semplice nel documento.

Delimitazione: la [Perspective Table](perspective-table.md) punta a contenuti testuali ricchi (celle di blocco multiriga, span, evidenziazione di stato). La Datatable punta a **dati strutturati e calcolabili**: piccoli insiemi come spese, registrazione dei tempi o inventari. La tabella dati fa parte delle [estensioni interne](extensions.md) e può essere disattivata lì; disattivato, il blocco resta un normale blocco di codice.

## Struttura del blocco

Un blocco di codice con il tag di lingua `perspective-datatable` contiene direttive di intestazione e righe di dati:

````markdown
```perspective-datatable
columns: Nome:text, Data:date, Importo:number(2), Fatto:boolean
aggregate: Importo:sum+avg, Fatto:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```
````

Renderizzata, la griglia appare con riga di intestazione, simboli di tipo e riga di aggregati:

```perspective-datatable
columns: Nome:text, Data:date, Importo:number(2), Fatto:boolean
aggregate: Importo:sum+avg, Fatto:count
| Anna | 2026-07-08 | 12.50 | x |
| Bert | 2026-06-30 | -3 |  |
```

- **`columns:`** (obbligatoria) dichiara le colonne come `Nome:tipo`, separate da virgole. I nomi di colonna possono contenere spazi.
- **`aggregate:`** (facoltativa) assegna funzioni di aggregato alle colonne; più funzioni per colonna si combinano con `+`.
- **`types:`** (facoltativo) commuta l'indicazione di tipo sotto le intestazioni: `shown` o `hidden`. Senza questa riga compare.
- **Le righe di dati** usano la notazione a barre (`| … | … |`), una riga per record. Un `|` nel testo si scrive `\|`.


### Un'intestazione propria per colonna

L'identificatore della colonna funge anche da intestazione. Deve restare breve e senza separatori, perché aggregati e colonne calcolate lo usano come nome. Per un'intestazione leggibile, va scritta tra virgolette doppie dopo l'identificatore:

```
columns: Importo:number(2), Totale "Totale (lordo, in €)":number(2) = Importo * 2
```

Il testo di visualizzazione può portare qualsiasi carattere, compresi spazi, virgole, due punti e segni di uguale; una virgoletta al suo interno si scrive due volte. La colonna resta indirizzata solo tramite il suo identificatore, che rimane accessibile come suggerimento sull'intestazione.

## Tipi di colonna e formati

| Tipo | Forma di memorizzazione | Esempio |
|---|---|---|
| `text` | testo libero | `Anna` |
| `number` | decimale con punto | `12.5`, `-3` |
| `date` | `AAAA-MM-GG` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (vero) o vuoto (falso) | `x` |

`number` conosce un formato di visualizzazione facoltativo: `Importo:number(2)` mostra due decimali. Visualizzazione e forma di memorizzazione restano volutamente leggibili allo stesso modo (nessuna riformattazione regionale); le celle vuote sono valide per tutti i tipi. Un valore non conforme al tipo di colonna viene contrassegnato come **cella di errore**: il testo viene conservato, un suggerimento spiega il formato atteso e il valore non entra negli aggregati.

## Collegamenti e tag nelle celle di testo

In una colonna di tipo `text`, collegamenti e tag funzionano come nel resto del documento:

````markdown
```perspective-datatable
columns: Voce:text, Importo:number(2)
| Affitto per [[Appartamento]] #fisso | 850 |
| Biglietto del treno, vedi [[Viaggio 2026\|Piano di viaggio]] | 120 |
| Quota del corso, [Iscrizione](https://example.org) | 60 |
```
````

- **Cosa funziona**: `[[Destinazione]]`, `[[Destinazione#Ancora]]` e il collegamento con alias, che nella cella si scrive `[[Destinazione\|Alias]]`, perché ogni `|` in una cella si scrive `\|`; inoltre il collegamento Markdown `[Testo](Destinazione)`, anche con un indirizzo web, e `#tag`. Un incorporamento `![[Destinazione]]` compare come collegamento, non come contenuto incorporato.
- **Visualizzazione e clic**: nella vista di lettura, nella vista divisa e in modalità live compaiono come collegamento o come tag. Un clic su un collegamento apre la sua destinazione, un clic su un tag filtra la barra laterale dei tag come nel testo.
- **Rete dei collegamenti**: la destinazione elenca il documento tra i suoi **Backlink**, e i **Collegamenti in uscita** e la [Vista grafo](graph.md) mostrano il legame. Se la destinazione viene rinominata o spostata, il collegamento nella cella la segue; alias e tabella restano intatti.
- **I tag contano**: un tag di una cella conta nella barra laterale dei tag, nell'ordine dei suggerimenti e nelle query, e la [rinomina di un tag](linking.md) comprende anche le celle.
- **Cosa resta testo**: grassetto, corsivo, formule e altra marcatura compaiono così come sono scritti, perché una cella di testo porta valori e non prosa. Tra apici inversi anche `[[…]]` resta letterale e non è un collegamento. Le colonne numero, data, ora e booleano, le colonne calcolate e le righe di intestazione del blocco non formano collegamenti; ordinamento, filtro e aggregati lavorano sul testo scritto.
- **Disattivata**: se la tabella dati è disattivata, il blocco compare come blocco di codice senza collegamenti cliccabili; i backlink e l'aggiornamento alla rinomina restano comunque. Se i wiki link o i tag sono disattivati, il testo della cella resta testo semplice.

## Aggregati

Funzioni disponibili per tipo di colonna:

| Funzione | Significato | Consentita su |
|---|---|---|
| `sum` | somma | `number` |
| `avg` | media (arrotondata al formato della colonna) | `number` |
| `min` / `max` | valore minimo/massimo | `number`, `date`, `time` |
| `count` | numero di celle non vuote (per `boolean`: numero di quelle vere) | tutti i tipi |

Le celle vuote o in errore sono escluse. La riga di aggregati appare sotto i dati e ricalcola a ogni modifica; con vista filtrata calcola sulle righe visibili.

## Colonne calcolate

Una colonna con `= espressione` dopo il tipo calcola il proprio valore per riga a partire da altre colonne:

```perspective-datatable
columns: Articolo:text, Prezzo:number(2), Qta:number, Totale:number(2) = Prezzo * Qta
aggregate: Totale:sum
| Penna | 1.20 | 10 |
| Blocco | 3.50 | 4 |
```

- Il linguaggio delle espressioni è lo stesso della [Query Perspective](frontmatter-query.md): aritmetica, confronti, `choice(…)`, `default(…)`, funzioni di testo e altro. Ne fa parte `count(x)`; in una formula conta i valori del campo indicato nella sola riga in questione e non è la funzione di aggregazione `count` della riga degli aggregati, che conta su tutte le righe.
- I nomi di colonna nell'espressione si riferiscono ai valori della riga corrispondente; anche altre colonne calcolate sono utilizzabili in qualsiasi ordine di dichiarazione (la valutazione risolve le dipendenze). I riferimenti circolari vengono segnalati come errori di struttura.
- Il risultato deve corrispondere al tipo di colonna dichiarato, altrimenti la cella mostra un errore.
- I valori calcolati **non vengono mai salvati nel sorgente**: sono sempre ricalcolati e quindi non hanno una cella di dati nelle righe a barre. Gli aggregati sulle colonne calcolate calcolano sui valori calcolati.

## Modificare nella griglia

Nella **vista divisa** e in **modalità live** la griglia è modificabile direttamente; la vista di lettura e le pagine del manuale la mostrano in sola lettura. Ogni conferma riscrive il blocco di codice nel sorgente: il documento risulta non salvato come di consueto e annulla/ripristina funzionano normalmente.

- **Modificare una cella**: un clic sulla cella (o `Invio`/`F2` con la cella a fuoco) apre un campo di immissione adeguato al tipo. `Invio` o la perdita del fuoco conferma, `Esc` annulla, `Tab`/`Maiusc+Tab` conferma e passa alla cella successiva o precedente.
- **Collegamenti nella cella**: un clic su un collegamento o un tag in una cella di testo lo segue e non apre la cella. Un clic nella parte libera della cella, `Invio` o `F2` la aprono con il testo scritto. Se il collegamento stesso ha il fuoco della tastiera, `Invio` lo segue e `F2` apre la cella.
- **Suggerimenti**: in una cella di testo compare dopo `[[` e `#` lo stesso [elenco dei suggerimenti](linking.md) del testo corrente, anche in una cella vuota; `Ctrl+Spazio` lo apre in modo esplicito. Finché è aperto, le frecce scelgono, `Invio` accetta il suggerimento nel campo ed `Esc` chiude solo l'elenco; un secondo `Invio` conferma la cella. `Tab` non accetta alcun suggerimento: chiude l'elenco, conferma la cella e passa alla successiva. Nelle celle numero, data e ora non compare alcun elenco, e nella cella non propone marcatori di attività.
- **Vincolo di tipo**: un valore non conforme al tipo di colonna viene rifiutato (avviso nella barra di stato); la cella resta aperta per la correzione.
- **Boolean**: un clic sulla cella (o la barra spaziatrice) commuta direttamente il valore.
- **Righe**: il pulsante sotto la tabella aggiunge una riga alla fine dei dati; il simbolo × a inizio riga la elimina.
- Le celle delle colonne calcolate non sono modificabili; le immissioni nelle loro colonne di origine le aggiornano immediatamente.
- Una tabella con errori di struttura (vedi sotto) non è modificabile nella griglia finché l'errore non viene corretto nel sorgente.

## Ordinare e filtrare (vista)

Ordinamento e filtro agiscono **solo sulla vista**: il sorgente resta invariato, nulla viene salvato né esportato; alla riapertura del file la vista è neutra.

- **Ordinare**: un clic sull'intestazione di colonna ordina in modo conforme al tipo in ordine crescente, un secondo clic decrescente, un terzo rimuove l'ordinamento. I valori mancanti finiscono in fondo.
- **Filtrare**: il commutatore sul bordo destro della tabella mostra la riga dei filtri: le colonne di testo filtrano per ricerca di contenuto, le colonne booleane con un commutatore a tre stati (tutti/sì/no). Una nota mostra «n di m righe»; la riga di aggregati calcola sulle righe visibili.
- La modifica resta possibile in vista ordinata o filtrata e raggiunge sempre la riga corretta del sorgente.

## Errori

- **Gli errori di struttura** (tipo sconosciuto, nomi di colonna duplicati, numero di celle divergente, espressioni non valide) appaiono come elenco sopra la griglia con il numero di riga nel blocco.
- **Gli errori di cella** (valore non conforme al tipo) contrassegnano solo la cella interessata; il testo viene conservato.

## Esportazione

L'esportazione portable e l'esportazione PDF producono la tabella come tabella statica nell'ordine del documento: con tutte le righe, i valori calcolati delle colonne calcolate e la riga di aggregati, senza interattività. I collegamenti e i tag delle celle di testo vi compaiono come i collegamenti e i tag del resto del documento.

## Limiti

A partire da 1000 righe di dati la griglia mostra solo l'area di intestazione e gli aggregati con una nota; gli aggregati continuano a calcolare su tutte le righe. Gli insiemi di dati molto grandi appartengono a uno strumento dati dedicato.
