# Eventi

La gestione degli eventi tiene **appuntamenti, compleanni, anniversari e date di progetto** direttamente nel documento: come blocco eventi incorporato con proprie righe di dati o come aggregazione tramite le proprietà del frontmatter dai file dell'area. Ogni voce mostra la **differenza di tempo rispetto a oggi** in quattro scaglioni, oltre a traguardi, ricorrenza annuale, filtri, cinque viste aggiuntive e collegamenti tra eventi.

La funzione fa parte delle [estensioni interne](extensions.md) («Eventi») e richiede i [Profili di proprietà](property-profiles.md): se tale estensione viene disattivata, anche la gestione degli eventi si disattiva. Disattivato, il blocco resta un normale blocco di codice.

## Struttura del blocco

Un blocco di codice con il tag di lingua `perspective-events` contiene direttive di intestazione facoltative e righe di dati; il comando «Inserisci blocco eventi» (tramite la palette dei comandi, è possibile assegnare una scorciatoia nelle impostazioni) inserisce un blocco vuoto nella posizione del cursore:

````markdown
```perspective-events
| 2020-01-01 | | Avvio del progetto Alpha | projekt | Nota di avvio | | | | |
| 1990-03-10 | | Compleanno di Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Fase del progetto | projekt | | | | | |
```
````

Renderizzata, la tabella eventi appare con distintivi di categoria e una colonna di differenza di tempo:

```perspective-events
| 2020-01-01 | | Avvio del progetto Alpha | projekt | Nota di avvio | | | | |
| 1990-03-10 | | Compleanno di Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Fase del progetto | projekt | | | | | |
```

Ogni riga di dati porta nove celle in un ordine fisso:

| Cella | Campo | Contenuto |
|---|---|---|
| 1 | Data | data `AAAA-MM-GG` |
| 2 | Fine | data facoltativa per gli intervalli |
| 3 | Evento | il testo dell'evento (obbligatorio) |
| 4 | Categoria | uno degli otto valori di categoria |
| 5 | Note | multiriga, interruzione di riga come `\n` |
| 6 | annuale | `x` = ricorrenza annuale |
| 7 | Identificatore | assegnato automaticamente non appena la voce viene collegata |
| 8 | Predecessore | elenco di identificatori, separati da virgole |
| 9 | Successore | elenco di identificatori, separati da virgole |

Un `|` nel testo si scrive `\|`, una barra rovesciata `\\`. I problemi di valore delle singole voci (data mancante o non valida, fine prima dell'inizio, categoria sconosciuta) sono **avvisi lievi**: la voce resta visibile. Gli errori di struttura del blocco (direttiva sconosciuta, troppe celle) bloccano la modifica finché il sorgente non viene corretto.

## Modello dei campi: il profilo interno

I campi evento sono definiti come un **profilo di proprietà interno** fisso denominato `Ereignis`. Compare automaticamente nella risoluzione dei profili e nell'elenco dei profili delle impostazioni (contrassegnato, non modificabile) e agisce anche senza una cartella di profili configurata. Dettagli sul meccanismo dei profili nella pagina [Profili di proprietà](property-profiles.md).

| Campo | Tipo |
|---|---|
| `event-date` | Data |
| `event-end` | Data |
| `event-text` | Testo |
| `event-category` | scelta tra gli otto valori di categoria |
| `event-notes` | testo multiriga |
| `event-recurring` | Booleano |
| `event-predecessors` | Elenco |
| `event-successors` | Elenco |

Gli otto valori di categoria sono `geburtstag`, `todestag`, `jahrestag`, `jubilaeum`, `projekt`, `termin`, `erinnerung` e `sonstiges`: valori tecnici nel sorgente, visualizzati come nomi localizzati in distintivi colorati.

## Modificare nella tabella

La tabella è direttamente modificabile nella vista divisa, in modalità live **e nella vista di lettura** (le pagine del manuale e gli incorporamenti restano in sola lettura). Ogni conferma riscrive nel blocco di codice, come un unico passo di annullamento.

- **Aggiungere**: riga di modulo sotto la tabella; il testo dell'evento è il campo obbligatorio, il simbolo 📅 apre un selettore di calendario per i campi data.
- **Modificare**: l'azione matita della riga apre i campi di immissione; `Invio` conferma, `Esc` annulla.
- **Duplicare**: crea una copia della voce, volutamente senza collegamenti.
- **Eliminare**: dopo conferma; i collegamenti di altre voci verso quella eliminata vengono ripuliti anch'essi.

### Colonna della differenza di tempo

La differenza rispetto a oggi appare in quattro scaglioni: anni, mesi, settimane e giorni, calcolati con precisione di calendario, con la direzione «passato», «futuro» o «oggi». Se è impostata una fine, la colonna mostra inoltre la durata dell'intervallo. In caso di ricorrenza annuale, un conto alla rovescia scorre fino alla prossima occorrenza; il 29 febbraio cade il 28 negli anni non bisestili.

### Traguardi

Gli eventi segnalano distanze tonde come traguardi: multipli di mille in giorni, multipli di cento in settimane, multipli di cento in mesi, anni interi nonché gli anni di giubileo 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90 e 100.

## Ordinare e filtrare

Un clic sull'intestazione di colonna ordina per data, fine, evento o categoria (un nuovo clic inverte la direzione; per impostazione predefinita, data decrescente, i valori vuoti si collocano in fondo). La barra dei filtri combina la ricerca di testo, la selezione di categoria, il periodo (con preimpostazioni come «Oggi», «Questa settimana», «Prossimi 30 giorni») e le opzioni «solo con note», «solo ricorrenti», «solo con durata»; un contatore mostra le voci visibili.

I filtri con nome possono essere salvati come direttiva `filter:` nel blocco e applicati dalla barra:

````markdown
```perspective-events
filter: Ricorrenti := recurring=x
filter: Compleanni := categories=geburtstag; from=2026-01-01
| 1990-03-10 | | Compleanno di Anna | geburtstag | | x | | | |
```
````

La direttiva porta coppie `Nome := Chiave=Valore`, separate da `;`: `text`, `categories` (separate da virgole, `none` = senza categoria), `from`, `to` nonché le opzioni `notes`, `recurring` e `timespan` (`x` = attivo). Un `;` nel valore si scrive `\;`.

## Viste

Il commutatore sopra il blocco alterna tra **Tabella, Dashboard, calendario mensile, calendario settimanale, Cronologia e Gantt**; la scelta viene scritta nel blocco come direttiva `view:` (`table`, `dashboard`, `month`, `week`, `timeline`, `gantt`). Un clic su un evento in una vista aggiuntiva salta alla riga della tabella.

```perspective-events
view: dashboard
| 1990-03-10 | | Compleanno di Anna | geburtstag | | x | | | |
| 2026-07-20 | | Workshop | termin | | | | | |
| 2026-08-30 | | Festa d'estate | jahrestag | | x | | | |
```

La dashboard raggruppa gli eventi in arrivo, i traguardi raggiunti e prossimi e la distribuzione per categoria; i calendari collocano le voci su una griglia mensile o settimanale con un contrassegno di oggi; la cronologia raggruppa cronologicamente.

### Gantt

La vista Gantt dispone gli eventi come barre su un asse temporale comune, una riga per voce, ordinate per data. Una voce con fine diventa una barra estesa sulla sua durata, una voce senza fine un rombo alla sua data; il colore proviene dalla categoria. Linee tratteggiate collegano predecessori e successori, una linea verticale segna il giorno corrente.

```perspective-events
view: gantt
| 2026-07-06 | 2026-07-31 | Fase di concetto | projekt | | | e1 | | e2 |
| 2026-08-03 | 2026-09-11 | Realizzazione | projekt | | | e2 | e1 | |
| 2026-08-01 | | Approvazione | termin | | | | | |
```

La suddivisione dell'asse deriva dall'estensione: le estensioni brevi mostrano giorni, quelle medie settimane, quelle lunghe mesi. Per una risoluzione più fine, si restringe il periodo con il filtro. Gli eventi ricorrenti stanno alla loro **prossima occorrenza** e portano il segno ↻, così l'asse non risale all'anno di origine. Accanto al nome, ★ indica un traguardo raggiunto e ⛓ il numero di collegamenti. Le voci senza data valida compaiono solo nella tabella. Le barre non si trascinano; le date si modificano nella vista tabella.

## Aggregazione tramite frontmatter

Invece delle proprie righe di dati, il blocco può raccogliere gli eventi **dai file dell'area**: una direttiva `query:` contrassegna l'aggregazione, le righe di dati non sono allora consentite. L'insieme di base è costituito da tutti i file dell'area il cui campo di assegnazione nomina il profilo `Ereignis`; i dati degli eventi provengono dai loro campi del frontmatter (`event-date`, `event-text`, …).

````markdown
```perspective-events
query: WHERE event-category = 'geburtstag'
```
````

Il testo della query usa il linguaggio a clausole della [Query Perspective](frontmatter-query.md) (`FROM`, `WHERE`, confronti, funzioni); una query vuota raccoglie tutti i file con il profilo `Ereignis`. I valori di testo vanno tra virgolette (`'geburtstag'`): una parola nuda sarebbe un riferimento a un campo.

- **Clic sulla riga** apre il file di origine; la provenienza di ogni voce resta visibile.
- **La modifica riscrive**: le modifiche nella tabella aggregata finiscono nel frontmatter del file di origine, anche se non è aperto. Se il file di origine è aperto con modifiche non salvate, un avviso vi rimanda; se è stato modificato nel frattempo sul disco, non viene scritto nulla (avviso di conflitto).
- **Limiti**: nell'aggregazione non esistono aggiunta ed eliminazione: i nuovi file di evento nascono come documenti normali con il profilo `Ereignis`. L'aggregazione richiede un'area aperta con indice.

## Collegamenti

Gli eventi possono essere concatenati come **predecessori e successori**: nel blocco tramite identificatori assegnati automaticamente (celle da 7 a 9), nell'aggregazione tramite i campi elenco `event-predecessors`/`event-successors` con riferimenti a file. Entrambi i lati vengono sempre mantenuti insieme.

- L'**indicatore di collegamento** nella colonna della data apre una finestra popup con i riferimenti: salto alla voce collegata o apertura del file collegato, nel contesto modificabile anche una ricerca e un commutatore predecessore/successore.
- Gli identificatori nascono solo con il primo collegamento; la duplicazione non riporta alcun collegamento, l'eliminazione ripulisce entrambi i lati.
- I collegamenti connettono solo voci dello stesso mondo: voci di blocco tra loro o file tra loro, non oltre il confine.
- I riferimenti orfani (destinazione eliminata o rinominata) appaiono come avviso lieve con un pulsante per rimuoverli.

## Esportazione

L'esportazione portable converte i blocchi eventi incorporati in tabelle statiche con testi già pronti nella lingua di esportazione (la colonna della differenza di tempo calcola al momento dell'esportazione); i blocchi di aggregazione restano come blocco di codice, perché il loro contenuto dipende dall'area.
