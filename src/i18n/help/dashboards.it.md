# Dashboard

Una **dashboard** dispone **riquadri** in righe. Ogni riquadro esegue una [Query Perspective](frontmatter-query.md) e ne mostra il risultato come indicatore, elenco, tabella, grafico a barre o a torta, oppure contiene un testo proprio. I **filtri** in testa restringono contemporaneamente le query di tutti i riquadri. Ne nasce una panoramica che si mantiene aggiornata da sé con il contenuto dell'area: attività aperte per stato, pagine per tema, i libri più lunghi di una tabella della banca dati, tutto a colpo d'occhio.

**Da non confondere con la vista «Dashboard» degli eventi.** Un [blocco eventi](events.md) offre tra le sue viste una che si chiama anch'essa «Dashboard» (`view: dashboard`): raccoglie gli eventi in arrivo, i traguardi e la distribuzione per categoria **di quel solo blocco**. Questa pagina descrive un'altra cosa: il blocco di codice a sé stante `perspective-dashboard`, i cui riquadri mostrano query qualsiasi sull'intera area.

Una dashboard è sostenuta da un blocco di codice con l'etichetta di linguaggio `perspective-dashboard`. Un documento può contenerne quanti ne vuole, e tutto il resto rimane Markdown ordinario.

La funzione appartiene alle [estensioni interne](extensions.md) («Dashboard») ed è attiva a partire dalla modalità di lavoro **Avanzata**. Non dipende da nessun'altra estensione, nemmeno da «Grafico di una query». Disattivata, il blocco appare come testo sorgente con una nota sopra, e il comando «Inserisci dashboard» scompare. Il documento resta invariato, e dopo la riattivazione la dashboard ricompare.

## Inserire una dashboard

Il comando **«Inserisci dashboard»** inserisce uno scheletro nel punto di inserimento. Due strade vi portano: la palette dei comandi (`Ctrl+K` predefinito) e il menu contestuale dell'editor → Inserisci → Inserisci dashboard. Nessuna scorciatoia è preassegnata; se ne può assegnare una nelle impostazioni. Il comando presuppone un documento modificabile.

Viene inserita una riga con un indicatore su tutti i documenti dell'ambito di ricerca; il suo titolo segue la lingua del programma impostata:

````markdown
```perspective-dashboard
!zeile
!kachel kennzahl titel="Conteggio"
LIST
```
````

La query `LIST` risulta poi selezionata, perché è la prima cosa da sostituire.

## Struttura del blocco

All'interno del blocco ogni elemento inizia con una **riga marcatore**: sta nella colonna 0 e inizia con `!` e una parola. La riga marcatore porta le indicazioni dell'elemento; le righe seguenti fino al marcatore successivo sono il suo contenuto. Gli elementi sono tre:

| Marcatore | Scrittura | Righe di contenuto |
|---|---|---|
| `!filter` | `!filter <nome> [titel="…"] [eigenschaft=<campo>] [vorbelegung=<valore>]` | valori elencati, uno per riga |
| `!zeile` | `!zeile` | nessuna |
| `!kachel` | `!kachel <tipo> [titel="…"] [breite=<quota>] [abfrage="<file di query>"]` | la query, per il tipo `text` Markdown |

- Le **indicazioni** hanno la forma `nome=valore`. Un valore è una parola senza spazi oppure una stringa tra virgolette doppie, in cui `\"` sta per una virgoletta e `\\` per una barra rovesciata.
- **Vocabolario:** Le parole del blocco sono tedesche, come quelle della [superficie Canvas](canvas.md), e sono le stesse in ogni lingua del programma: `!filter` è un filtro, `!zeile` una riga, `!kachel` un riquadro, `titel=` il titolo, `eigenschaft=` la proprietà, `vorbelegung=` la preselezione, `breite=` la larghezza e `abfrage=` il file di query. Marcatori, tipi di riquadro e parole di larghezza si scrivono in minuscolo; `!Kachel` è un marcatore sconosciuto. Solo i nomi dei filtri sono liberi nella grafia.
- **Protezione:** Una riga di contenuto che deve iniziare con `!` nella colonna 0 si protegge con `\!`, per esempio una riga di query che inizia con `!=`.
- **Ordine:** I filtri possono stare ovunque nel blocco e compaiono raccolti in testa, nell'ordine del blocco. Righe e riquadri seguono l'ordine del blocco.
- **Ciò che è sconosciuto resta.** Un marcatore o un'indicazione che l'applicazione non conosce rimane nel blocco con il suo testo, e un elemento invariato viene riscritto alla lettera. Un errore non butta mai via nulla: compare come nota, e il testo resta com'è.

## Filtri (`!filter`)

In testa alla dashboard, un filtro diventa un **campo di selezione**. Ciò che vi si sceglie, l'applicazione lo inserisce in ogni query che porta il suo segnaposto (sezione «Segnaposto nelle query»).

````markdown
```perspective-dashboard
!filter stato titel="Stato" vorbelegung=aperto
!filter prio titel="Priorità"
alta
media
bassa
```
````

- **Nome:** lettere, cifre e trattino basso, senza cifra all'inizio; le lettere accentate sono ammesse, il trattino e il punto no. Maiuscole e minuscole non contano. Il nome è anche il nome del segnaposto.
- **`titel=`** etichetta il campo di selezione; senza indicazione vi compare il nome.
- **Da dove vengono i valori:** Se il filtro porta righe di contenuto, i valori sono **elencati**: ogni riga non vuota è un valore, senza gli spazi ai bordi. Altrimenti **`eigenschaft=`** nomina la proprietà del frontmatter i cui valori assegnati nell'area vengono offerti; un valore di elenco conta per elemento, e ciò che si trova nella cartella dei modelli non conta. Se mancano entrambi, vale la proprietà con lo stesso nome: `!filter stato` da solo è completo. Se ci sono insieme valori elencati ed `eigenschaft=`, valgono quelli elencati, con una nota al campo.
- **La scelta** inizia sempre con la voce **«tutti»**. Seguono i valori elencati nel loro ordine oppure i valori dell'area, in ordine alfabetico secondo la lingua del programma impostata. Se una proprietà non compare nell'area, il campo offre solo «tutti», senza nota.
- **`vorbelegung=`** fissa il valore con cui il campo inizia; senza indicazione è «tutti». Con valori elencati la preselezione deve essere uno di essi (senza badare a maiuscole e minuscole), altrimenti il campo inizia con «tutti» e al campo compare una nota. Con valori dell'area la preselezione vale anche se il valore al momento non compare da nessuna parte.
- **Una scelta non è una modifica.** Vale finché il documento è aperto, separatamente per ogni colonna della vista divisa, e non viene mai scritta nel file; il documento non riceve alcun segno di modifica. Dopo la chiusura e una nuova apertura il campo ricomincia dalla preselezione. Se cambia la serie dei filtri nel blocco, anche i campi ricominciano da capo.
- **Si ricarica solo ciò che è interessato.** Dopo una nuova scelta vengono rivalutati solo i riquadri la cui query porta il segnaposto di quel filtro; gli altri restano come sono.
- **I valori restano aggiornati.** Se nell'area compare o scompare un valore, il campo di selezione si adegua. Un valore scelto che è scomparso dall'area resta scelto; i riquadri non mostrano allora alcun risultato finché non si fa un'altra scelta.
- **Limiti dei campi:** Al massimo 20 filtri ricevono un campo di selezione, e i valori con più di 500 caratteri non vengono offerti.
- **Casi di errore:** Un filtro senza nome valido viene scartato, così come un secondo filtro con lo stesso nome; vale il primo. La nota riassuntiva in fondo alla dashboard li nomina entrambi.

## Segnaposto nelle query

Nella query di un riquadro, **`$nome`** sta per la scelta del filtro con quel nome, senza badare a maiuscole e minuscole. Un segnaposto sta solo in `WHERE` e `HAVING`, ma lì in qualsiasi punto di un'espressione: come lato di un confronto, in un elenco `IN` o come argomento di una funzione come `contains(tags, $tag)`.

````markdown
```perspective-dashboard
!filter stato
!kachel kennzahl titel="Risultati"
LIST FROM "Attività" WHERE priorita = "alta" OR stato = $stato
```
````

- **Un valore scelto** si confronta come una stringa, quindi `stato = $stato` si comporta esattamente come `stato = "aperto"`: senza badare a maiuscole e minuscole e, per una proprietà di elenco, come appartenenza. Il valore non viene mai letto come testo di query.
- **Se il filtro è su «tutti»,** la condizione più piccola che porta il segnaposto viene meno e conta come soddisfatta; un `NOT` subito prima viene meno con essa. `AND` e `OR` sopra calcolano normalmente: nell'esempio «tutti» restituisce perciò tutte le attività, perché il lato destro dell'`OR` è soddisfatto. Una proprietà che porta letteralmente il valore «tutti» non entra in conflitto con questo.
- **Un nome senza filtro** vale come «tutti»; sopra il risultato del riquadro compare allora una nota con il nome.

Come si comportano i segnaposto al di fuori di una dashboard, per esempio in una query nel testo corrente o in un file di query aperto da solo, lo descrive la pagina [Query Perspective](frontmatter-query.md), sezione «Segnaposto».

## Righe (`!zeile`)

`!zeile` inizia una nuova riga della griglia; non porta indicazioni. I riquadri prima del primo `!zeile` formano una prima riga, così che una dashboard di una sola riga può fare a meno di questo marcatore. Un `!zeile` senza riquadro dopo di sé resta vuoto. Il testo nelle righe sotto `!zeile` non ha significato, resta al suo posto e viene nominato nella nota riassuntiva.

## Riquadri (`!kachel`)

Un riquadro nomina per prima cosa il suo **tipo**, poi a scelta titolo, larghezza e un file di query. Senza tipo non è completo; un tipo predefinito non esiste.

- **`titel=`** sta sopra il riquadro. Senza indicazione la riga del titolo resta vuota, e un indicatore mostra solo il suo numero.
- **Fonte dei dati, esattamente una:** O le righe di contenuto sono la query, oppure `abfrage=` nomina un file di query (sezione «Riquadro con file di query»).
- Altre parole dopo il tipo, per esempio `!kachel kennzahl Aperte`, non hanno significato; il riquadro resta valido, e una nota sopra di esso rimanda all'indicazione `titel=`. Lo stesso vale per parole dopo il nome di un filtro.

### Larghezza

| Indicazione | Quota della riga |
|---|---|
| `breite=ganz` (intera) | 12/12 |
| `breite=halb` (metà) | 6/12 |
| `breite=drittel` (terzo) | 4/12 |
| `breite=viertel` (quarto) | 3/12 |
| `breite=n/12` (n da 1 a 12) | n/12; un `n` da solo vale allo stesso modo |

- **I riquadri senza indicazione** si dividono in parti uguali ciò che i riquadri con indicazione lasciano libero nella loro riga. Senza alcuna indicazione tutti i riquadri si dividono l'intera larghezza.
- **Più di dodici dodicesimi** in una riga vanno a capo nella riga successiva senza nota.
- **Una dashboard stretta** dispone i riquadri uno sotto l'altro, e così anche i campi di selezione in testa. Conta la larghezza del blocco, non quella della finestra, perché resti leggibile anche in una colonna della vista divisa.
- Un valore sconosciuto produce una nota sopra il riquadro, che si comporta come senza indicazione.

### I sei tipi di riquadro

Il tipo determina la presentazione. Un `DISPLAY` nella query viene ignorato, senza nota.

| Tipo | Si aspetta | Mostra | Non adatto |
|---|---|---|---|
| `kennzahl` (indicatore) | qualsiasi query | un numero grande o un numero per gruppo (sotto) | tabella raggruppata o totale generale, in entrambi i casi senza numero: tabella con nota |
| `liste` (elenco) | `LIST`, anche con `TASKS` e `BLOCKS` | l'elenco come nel testo corrente | `TABLE`: tabella con nota |
| `tabelle` (tabella) | `TABLE` | la tabella come nel testo corrente | `LIST`: elenco con nota |
| `balken` (barre) | `TABLE` con una colonna di numeri | un grafico a barre come con `DISPLAY bar` | tabella con il motivo come nota |
| `kreis` (torta) | `TABLE` con una colonna di numeri | un grafico a torta come con `DISPLAY pie` | tabella con il motivo come nota |
| `text` | nessuna query | il Markdown delle righe di contenuto | — |

Barre e torta leggono la tabella secondo le regole dei grafici della pagina [Query Perspective](frontmatter-query.md), sezione «Forma di presentazione». Dipendono dall'estensione «Grafico di una query»; se è disattivata, mostrano la tabella con la nota che la presentazione a grafico è disattivata.

Elenco e tabella mostrano il risultato di una query sui record il cui file di query attiva la [maschera elenco](database.md) come griglia, come nel testo corrente; l'indicatore anche in quel caso mostra solo il suo numero.

**L'indicatore** ricava il suo numero a seconda della query:

- Una tabella le cui colonne sono esclusivamente aggregati, senza `GROUP BY` (il **totale generale**, per esempio `TABLE WITHOUT ID sum(impegno)`): il suo primo valore.
- Ogni altra query senza raggruppamento: il numero dei risultati, dopo `LIMIT`.
- Una tabella raggruppata: per gruppo il valore della prima colonna che porta un numero; se manca a un gruppo, lì compare un trattino, e un testo in questa colonna compare come testo.
- Un elenco raggruppato: per gruppo il numero dei suoi risultati.

Un solo gruppo dà un numero grande, più gruppi danno per gruppo un numero con etichetta; su più livelli i valori dei gruppi stanno uniti con « › », come nell'etichetta di un grafico. Senza risultati compare `0`. Anche una data o una durata contano come numero, così che `min(…)` e `max(…)` su date mostrano il primo o l'ultimo giorno. Numeri, date e durate compaiono nel formato della lingua del programma impostata.

### Riquadri di testo

Un riquadro del tipo `text` mostra il Markdown delle sue righe di contenuto, con collegamenti, evidenziazioni ed elenchi come nel resto del documento. Tre particolarità:

- **I titoli in un riquadro di testo** sembrano titoli, ma non appartengono alla struttura del documento: non compaiono nel sommario, non portano numerazione e non sono una destinazione di salto.
- **Tabelle dati, note a piè di pagina e ancore di blocco** in un riquadro di testo ricevono identificativi e conteggi propri, che possono coincidere con quelli del resto del documento.
- **Un blocco dashboard dentro un riquadro di testo** resta testo sorgente. Le sue righe marcatore vi hanno bisogno della protezione `\!`, perché altrimenti il blocco esterno legge ogni riga con `!` nella colonna 0 come un elemento a sé.

Un riquadro di testo non ha query; un'indicazione `abfrage=` su di esso viene ignorata con una nota.

### Riquadro con file di query

Invece di una query propria, un riquadro può nominare un **file di query**, un file con il contrassegno `db-query` ed esattamente un blocco di query (pagina [Banca dati](database.md), sezione «File di query»). Più dashboard condividono così una query curata in un solo punto.

````markdown
```perspective-dashboard
!kachel liste titel="Query condivisa" abfrage="Query/Modificati di recente"
```
````

- **Destinazione:** il nome del documento o un percorso relativo alla dashboard, le stesse forme di `doc=` di una scheda della [superficie Canvas](canvas.md).
- **Riferimento:** La query viene eseguita come se stesse nel file di query. `this.` e il collegamento wiki vuoto indicano il file di query, non la dashboard.
- **I segnaposto** nel file di query agiscono come in una query del blocco. Senza segnaposto il riquadro non è toccato dai filtri.
- **Collegamento nell'area:** L'indicazione conta come collegamento al file di query. La dashboard compare perciò nei [backlink](linking.md) del file di query, il riquadro tra i collegamenti in uscita della dashboard come incorporamento, e se il file di query viene rinominato o spostato, l'indicazione lo segue, anteprima della ridenominazione compresa. Una destinazione che non esiste resta un collegamento aperto.
- **Casi di errore:** Se la destinazione non si trova, non è un file di query, oppure non contiene alcun blocco di query o ne contiene più di uno, il riquadro mostra una nota con il nome indicato.
- **Una sola fonte:** Se sotto il riquadro ci sono righe di query e insieme `abfrage=`, non viene eseguita nessuna delle due; il riquadro diventa un riquadro di errore.

## Righe di commento

Una riga che inizia nella colonna 0 con `%%` e termina con `%%` è un **commento**. Può stare prima del primo elemento, tra gli elementi e tra le righe di una query; viene tolta prima della valutazione e non viene mostrata da nessuna parte. In un riquadro di testo, `%%` segue le regole dell'estensione «Commenti» come nel resto del documento.

## Note e riquadri di errore

Un errore nel blocco non interrompe la dashboard; ogni riscontro compare dove gli spetta:

- **Un riquadro di errore** sta al suo posto nella griglia, con bordo tratteggiato, con titolo, nota e la riga nel blocco, contata da 1. Diventa riquadro di errore un riquadro con tipo sconosciuto o mancante, e un riquadro di un tipo di dati senza fonte valida: né query né file di query, entrambi insieme, oppure un file di query non utilizzabile.
- **Le note di un riquadro valido**, per esempio su una larghezza sconosciuta, stanno sopra il suo contenuto.
- **Un errore di sintassi della query** compare con la sua posizione al posto del risultato del riquadro, come per una query nel testo corrente.
- **Le note di un filtro** stanno sotto il suo campo di selezione: valori elencati ed `eigenschaft=` insieme, una preselezione sconosciuta, parole senza significato.
- **La nota riassuntiva** «Avvisi su questa dashboard» in fondo nomina ciò che non ha un posto proprio, ciascuno con la sua riga nel blocco: un marcatore sconosciuto, testo prima del primo elemento, testo sotto `!zeile` e un filtro scartato. Un marcatore sconosciuto non compare esso stesso, per non spostare la griglia.
- **Una dashboard senza riquadri** mostra, al posto della griglia, un'area di nota che spiega come nasce un riquadro; i filtri in testa restano.

Un blocco dashboard che sta a sua volta in un blocco di codice esterno resta testo letterale.

## Viste, stampa ed esportazione

- **Viste:** Renderizzato, Diviso e Dal vivo mostrano la stessa dashboard con gli stessi valori. Nella modalità Dal vivo il blocco si apre a testo sorgente non appena il cursore lo tocca, e si richiude in dashboard quando lo si lascia. Nella vista solo sorgente resta codice.
- **Incorporamento:** Una dashboard in un documento o in una sezione incorporati compare come nell'originale, e i suoi campi di selezione restano utilizzabili, perché una scelta non modifica nulla del documento.
- **Aggiornamento dal vivo:** I file nuovi, modificati ed eliminati si riflettono sui riquadri non appena l'indice li ha registrati, così come le modifiche non salvate di un file aperto.
- **La stampa e l'esportazione PDF** mostrano i riquadri con la **scelta attuale** dei filtri, nella loro disposizione e senza i campi di selezione. I grafici vi compaiono chiari, anche se l'applicazione funziona in scuro.
- **Il Markdown portabile** (**File → Altre funzioni file → Esporta → Markdown portabile…**) sostituisce il blocco con uno stato statico con la **preselezione** dei filtri, non con la scelta attuale. In alto compare una riga «Stato della preselezione: …» che nomina ogni filtro con titolo e valore, «tutti» per un filtro senza preselezione; una dashboard senza filtri non ha questa riga. Sotto seguono i riquadri **uno sotto l'altro**, perché il Markdown ordinario non conosce griglie, ciascuno con il suo titolo come intestazione: l'indicatore come testo, l'elenco come elenco puntato, la tabella come tabella Markdown, barre e torta come immagine chiara, il riquadro di testo come Markdown. Un riquadro di errore compare come intestazione con la sua nota, riga nel blocco compresa, e un riquadro la cui valutazione non termina in tempo con una nota in merito. Nell'esportazione non ci sono campi di selezione. Se l'estensione è disattivata, il blocco resta un blocco di codice nell'esportazione.

## Ambito di ricerca

L'ambito di ricerca dei riquadri è lo stesso di qualsiasi query: con un'area attiva l'intera area, senza area la cartella del documento più due sottolivelli. Ciò che si trova nella cartella dei modelli non è un risultato, a meno che una query la indichi. Un documento non ancora salvato non ha ambito di ricerca; i suoi riquadri mostrano allora la nota che la query sarà disponibile dopo il salvataggio.

## Un esempio completo

````markdown
```perspective-dashboard
%% Panoramica del progetto, stato 2026-11 %%
!filter stato titel="Stato" vorbelegung=aperto
!filter prio titel="Priorità"
alta
media
bassa

!kachel text breite=ganz
## Panoramica del progetto
Lavoro aperto per stato e priorità; dettagli in [[Regole del progetto]].

!zeile
!kachel kennzahl titel="Attività aperte" breite=drittel
LIST FROM "Attività" WHERE stato = $stato AND priorita = $prio
!kachel kennzahl titel="Impegno totale" breite=drittel
TABLE WITHOUT ID sum(impegno) AS "Impegno" FROM "Attività" WHERE stato = $stato
!kachel kennzahl titel="Per priorità" breite=drittel
TABLE count() AS "Numero" FROM "Attività" WHERE stato = $stato GROUP BY priorita

!zeile
!kachel balken titel="Attività per stato" breite=halb
TABLE count() AS "Numero" FROM "Attività" WHERE priorita = $prio GROUP BY stato
!kachel kreis titel="Quota per categoria" breite=halb
TABLE count() AS "Numero" FROM "Attività" WHERE stato = $stato GROUP BY categoria

!zeile
!kachel tabelle titel="Le dieci più vecchie" breite=8/12
TABLE stato, priorita FROM "Attività" WHERE stato = $stato SORT file.ctime ASC LIMIT 10
!kachel liste titel="Query condivisa" abfrage="Query/Modificati di recente"
```
````

- Il commento nella prima riga non compare da nessuna parte. Il filtro «Stato» offre i valori della proprietà `stato` dell'area e inizia con `aperto`; il filtro «Priorità» offre i tre valori elencati e inizia con «tutti».
- Il riquadro di testo sta prima del primo `!zeile` e forma da solo la prima riga; il suo titolo non appartiene alla struttura del documento.
- «Attività aperte» conta i risultati, «Impegno totale» mostra il totale generale senza raggruppamento, «Per priorità» un numero per priorità con etichetta.
- «Attività per stato» dipende solo dal filtro Priorità e perciò non si ricarica quando cambia lo stato.
- L'ultimo riquadro non ha indicazione di larghezza e riempie i 4/12 rimanenti. Non è toccato dai filtri finché il suo file di query non porta alcun segnaposto.

Una dashboard funzionante sui file della Demo-Area compare nella sua pagina «17 Dashboards».

## Limiti

- **I valori di un filtro presi dall'area** provengono dalle proprietà del frontmatter dei documenti dell'area, non dai campi di record o attività; per questi ci sono i valori elencati.
- **Un filtro sceglie esattamente un valore** oppure «tutti»; non esiste una scelta multipla.
- **Un segnaposto sta solo in `WHERE` e `HAVING`.** In `FROM`, nelle colonne, in `SORT`, `GROUP BY` e `LIMIT` è un errore di sintassi.
- **I tipi di riquadro si scelgono solo con il tipo,** non con `DISPLAY`; l'albero (`DISPLAY tree`) non è raggiungibile in un riquadro.
- **`!zeile` non porta indicazioni,** e un riquadro non ha un'altezza da scegliere; l'altezza segue il suo contenuto.
- **Il grafico di un riquadro è un'immagine senza comandi;** un clic su di esso non apre alcun risultato. I risultati di un elenco o di una tabella invece sono cliccabili come nel testo corrente.
- **La scelta dei filtri non viene salvata.** Chi vuole vedere stabilmente un certo stato lo fissa come preselezione nel blocco.
- **Una dashboard in una citazione o in un elenco** può perdere la scelta dei suoi filtri al passaggio alla modalità Dal vivo e tornare alla preselezione.
