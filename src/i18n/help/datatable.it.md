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
- **Le righe di dati** usano la notazione a barre (`| … | … |`), una riga per record. Un `|` nel testo si scrive `\|`.

## Tipi di colonna e formati

| Tipo | Forma di memorizzazione | Esempio |
|---|---|---|
| `text` | testo libero | `Anna` |
| `number` | decimale con punto | `12.5`, `-3` |
| `date` | `AAAA-MM-GG` | `2026-07-08` |
| `time` | `HH:MM` | `09:30` |
| `boolean` | `x` (vero) o vuoto (falso) | `x` |

`number` conosce un formato di visualizzazione facoltativo: `Importo:number(2)` mostra due decimali. Visualizzazione e forma di memorizzazione restano volutamente leggibili allo stesso modo (nessuna riformattazione regionale); le celle vuote sono valide per tutti i tipi. Un valore non conforme al tipo di colonna viene contrassegnato come **cella di errore**: il testo viene conservato, un suggerimento spiega il formato atteso e il valore non entra negli aggregati.

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

- Il linguaggio delle espressioni è lo stesso della [Query Perspective](frontmatter-query.md): aritmetica, confronti, `choice(…)`, `default(…)`, funzioni di testo e altro.
- I nomi di colonna nell'espressione si riferiscono ai valori della riga corrispondente; anche altre colonne calcolate sono utilizzabili in qualsiasi ordine di dichiarazione (la valutazione risolve le dipendenze). I riferimenti circolari vengono segnalati come errori di struttura.
- Il risultato deve corrispondere al tipo di colonna dichiarato, altrimenti la cella mostra un errore.
- I valori calcolati **non vengono mai salvati nel sorgente**: sono sempre ricalcolati e quindi non hanno una cella di dati nelle righe a barre. Gli aggregati sulle colonne calcolate calcolano sui valori calcolati.

## Modificare nella griglia

Nella **vista divisa** e in **modalità live** la griglia è modificabile direttamente; la vista di lettura e le pagine del manuale la mostrano in sola lettura. Ogni conferma riscrive il blocco di codice nel sorgente: il documento risulta non salvato come di consueto e annulla/ripristina funzionano normalmente.

- **Modificare una cella**: un clic sulla cella (o `Invio`/`F2` con la cella a fuoco) apre un campo di immissione adeguato al tipo. `Invio` o la perdita del fuoco conferma, `Esc` annulla, `Tab`/`Maiusc+Tab` conferma e passa alla cella successiva o precedente.
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

L'esportazione portable e l'esportazione PDF producono la tabella come tabella statica nell'ordine del documento: con tutte le righe, i valori calcolati delle colonne calcolate e la riga di aggregati, senza interattività.

## Limiti

A partire da 1000 righe di dati la griglia mostra solo l'area di intestazione e gli aggregati con una nota; gli aggregati continuano a calcolare su tutte le righe. Gli insiemi di dati molto grandi appartengono a uno strumento dati dedicato.
