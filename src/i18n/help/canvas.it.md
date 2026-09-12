# Superficie Canvas

Una **tela** è una superficie di lavoro spaziale dentro un normale documento Markdown: **schede** con testo proprio vi sono disposte liberamente e **collegamenti** tracciano le relazioni fra loro. Quando si affiancano alternative, si abbozza un flusso o si mettono prima in ordine dei pensieri, qui l'ordine nasce dalla posizione e non dalla sequenza.

La superficie è sostenuta da un blocco di codice con il tag di linguaggio `perspective-canvas`. Un documento può contenerne quanti se ne vuole, e tutto il resto al suo interno resta normale Markdown.

La funzione appartiene alle [estensioni interne](extensions.md) («Vista tela»). Disattivata, il blocco resta un normale blocco di codice, la modalità di vista scompare e i comandi per superficie e scheda spariscono. Il documento resta leggibile senza modifiche; non si perde nulla.

## Differenza rispetto alla vista grafo

Entrambe mostrano riquadri e linee, e intendono cose diverse:

| Domanda | [Vista grafo](graph.md) | Tela |
| ------- | ----------------------- | ---- |
| Da dove vengono i nodi? | dai file dell'area | creati dall'utente |
| Da dove vengono le linee? | dai collegamenti esistenti | tracciate dall'utente |
| Da dove viene la disposizione? | l'applicazione la **calcola** | l'utente la **decide** |
| Qual è il risultato? | un'analisi dell'esistente | una superficie di lavoro con contenuto proprio |

In breve: la vista grafo **analizza** e calcola da sé la propria disposizione; la tela **lascia disporre** e ricorda ciò che è stato disposto. Una scheda spostata resta dove è stata messa, un nodo del grafo no.

Lo stesso vale rispetto alla [vista mappa mentale](mindmap.md): quella ricava il proprio albero dai titoli e dagli elenchi del documento e non modifica mai il testo. La tela porta il proprio contenuto da sé e lo riscrive nel documento man mano che viene modificato.

## Creare una superficie

Il comando **«Tela»** inserisce una superficie vuota nel punto di inserimento. Due strade vi portano: la palette dei comandi (`Ctrl+K` predefinito) e il menu contestuale dell'editor → Inserisci → Tela. Nessuna scorciatoia è preassegnata; se ne può assegnare una nelle impostazioni.

Il comando richiede un documento modificabile; se manca, la barra di stato lo dice invece di non fare nulla in silenzio. Ciò che viene inserito è un blocco vuoto:

````markdown
```perspective-canvas
```
````

## Aprire la vista tela

La tela è la sesta modalità di vista, accanto a Sorgente, Divisa, Renderizzata, Live e Mappa mentale: **Visualizza → Tela**, il pulsante nella barra di stato oppure `Ctrl+6` predefinito. Come per le altre modalità, la scelta vale per documento aperto e non per l'intera applicazione.

**È l'unica delle sei modalità che dipende dal documento.** È selezionabile solo se il documento contiene una superficie Canvas: una vista tela senza superficie non mostrerebbe altro che un avviso. Senza superficie, pulsante e voce di menu restano **visibili e attenuati**; il motivo compare nel suggerimento del pulsante. La strada della scorciatoia e della palette dei comandi non porta allora da nessuna parte e nemmeno butta fuori dalla vista attuale. Non appena una superficie compare nel testo o ne sparisce, l'accesso si adegua. Un documento che era aperto nella vista tela alla chiusura e la cui superficie nel frattempo manca si apre nella vista di lettura.

## Più superfici in un documento

Se un documento porta più di una superficie, sopra la superficie compare una barra con una **scheda** per superficie; un clic cambia la superficie mostrata e la adatta. Con esattamente una superficie non c'è barra.

L'etichetta viene ricavata e non dichiarata: la prima riga utile della prima scheda, altrimenti un conteggio («Tela 2»). Nel documento non viene memorizzato nulla per questo. Quale superficie sia scelta vale per documento aperto, sopravvive alla digitazione e al cambio di modalità e non viene salvato: una pura azione di vista non deve modificare il documento.

## Schede

### Creare

- Un **doppio clic** sullo sfondo libero crea una scheda nel punto del clic e apre subito la sua immissione di testo.
- Un **clic destro** sullo sfondo → «Aggiungi scheda alla tela» fa lo stesso nel punto del clic.
- Il comando **«Aggiungi scheda alla tela»** (palette dei comandi, menu Visualizza, scorciatoia assegnabile) la colloca al centro della porzione visibile. Fuori dalla vista tela segnala nella barra di stato che le schede nascono solo lì.

### Selezionare, spostare, ridimensionare

- Un **clic** seleziona una scheda, un clic sullo sfondo annulla la selezione. È selezionato al più un elemento: una scheda o un collegamento.
- **Trascinare** sposta la scheda; i suoi collegamenti la seguono già durante il trascinamento. Non c'è griglia.
- La **maniglia nell'angolo in basso a destra** cambia la dimensione. Questa è indipendente dal contenuto: se il testo non entra, la scheda scorre — non cresce mai da sola.

### Scrivere il testo

Un **doppio clic dentro una scheda** la porta sul suo testo grezzo. Lì c'è normale Markdown, reso dentro la scheda: titoli, evidenziazioni, elenchi, tabelle, formule e diagrammi compresi.

| Immissione | Effetto |
| ---------- | ------- |
| Clic fuori dalla scheda | conferma |
| `Ctrl+Invio` | conferma |
| `Esc` | annulla |

Un testo immutato non scrive nulla nel documento.

### Eliminare

`Canc` elimina la scheda selezionata, così come «Elimina la scheda» nel suo menu contestuale. I collegamenti la cui estremità punta su di essa spariscono con lei, in un passo che si annulla in blocco.

## Collegamenti

### Creare

Una scheda selezionata mostra quattro **maniglie di collegamento**, una per lato. Un trascinamento da una maniglia su un'altra scheda crea il collegamento; una linea di anteprima segue il puntatore. Durante il trascinamento, la scheda sotto il puntatore mostra quattro **zone di arrivo** lungo i suoi bordi: rilasciare su una zona fissa il lato di arrivo, rilasciare sul corpo della scheda lascia quel lato all'applicazione. Un trascinamento nel vuoto o di nuovo sulla stessa scheda non crea nulla.

### Modificare

Un collegamento selezionato porta una piccola **barra degli strumenti** al centro del suo percorso:

- **Cambia la direzione** — a ciclo: freccia verso la destinazione (→), freccia a entrambe le estremità (↔), senza punta (—). Il segno sul pulsante mostra lo stato attuale.
- **Inverti la direzione** — scambia inizio e fine insieme ai loro lati di collegamento.
- **Colore** — otto colori dello schema di colori, più «Nessun colore».
- **Lato di partenza** e **Lato di arrivo** — automatico, sinistra, destra, alto o basso. «Automatico» sceglie il lato in base alla posizione delle due schede; un lato scelto espressamente resta fermo anche quando una scheda viene spostata.
- **Etichetta** — apre la stessa immissione di testo di un doppio clic sul collegamento. Il testo si colloca poi lungo la linea.

Le stesse azioni si trovano nel **menu contestuale** del collegamento (clic destro). `Canc` elimina il collegamento selezionato.

## Annullare

`Ctrl+Z` ritira l'ultima azione sulla superficie, `Ctrl+Y` e `Ctrl+Maiusc+Z` la ripristinano. Ogni azione è esattamente un passo: una scheda spostata, una dimensione cambiata, un collegamento creato, un testo modificato. Finché è aperta l'immissione di testo di una scheda o di un collegamento, `Ctrl+Z` vale per il testo digitato lì.

## Navigare

- **Spostare** — trascinare lo sfondo libero con il pulsante del mouse premuto.
- **Zoom** — rotellina sopra la superficie, centrata sul puntatore.
- **Adattare** — all'ingresso nella vista e al cambio di superficie, la porzione si adatta da sé al contenuto.

## Solo guardare

La superficie segue la modificabilità del suo documento. Finché il documento è in semplice visualizzazione, senza modalità di modifica attiva, la superficie è **solo consultabile**: niente maniglie, niente trascinamento, niente creazione, niente immissione di testo, niente barra degli strumenti, e il menu contestuale resta senza voci. Spostare la porzione, ingrandire e selezionare un elemento con un clic restano permessi, perché non toccano il documento.

La modalità di modifica libera l'uso — matita nella barra di stato, `Ctrl+E` predefinito; i dettagli sono nella pagina [Viste e presentazione](views-display.md).

## La superficie fuori dalla vista tela

Poiché la superficie si trova in un normale documento Markdown, la si incontra in ogni vista di quel documento:

| Vista | Che cosa appare |
| ----- | --------------- |
| Sorgente | il blocco in chiaro — questa vista **è** la sorgente |
| Divisa | il testo in chiaro a sinistra, il blocco di sintesi a destra |
| Renderizzata | **il blocco di sintesi**: tipo, ampiezza in schede e collegamenti, un'anteprima dei testi delle schede e il pulsante «Apri la vista Canvas» |
| Live | lo stesso blocco; quando il punto di inserimento tocca il blocco, questo si apre in testo grezzo ed è lì modificabile |
| Mappa mentale | una breve nota con tipo e ampiezza al posto del testo grezzo |
| Tela | la superficie stessa |

L'anteprima mostra al massimo sei schede; sotto è indicato quante altre ce ne sono. Il blocco si può **richiudere**, restando la sua riga di intestazione; questo stato vale per la sessione in corso e non viene scritto nel documento. Stampa ed esportazione PDF seguono la vista renderizzata, senza stampare i due pulsanti del blocco.

## Il formato di memorizzazione

La superficie si trova in chiaro nel documento. È perciò interpretabile senza questa applicazione, e ciò che sta nelle schede è leggibile in qualsiasi strumento di testo.

### Struttura

Dentro il blocco ogni elemento inizia con un **marcatore nella colonna 0**. I suoi attributi stanno sulla riga del marcatore; le righe seguenti, fino al marcatore successivo, sono il suo contenuto.

Un attributo ha la forma `nome=valore`. Un valore è o una parola senza spazi o una stringa fra virgolette dritte, nella quale `\"` sta per una virgoletta e `\\` per una barra rovesciata. Gli identificatori si compongono di lettere, cifre, trattino e trattino basso.

### Schede

```text
!karte <identificatore> x=<numero> y=<numero> b=<numero> h=<numero>
```

| Attributo | Significato |
| --------- | ----------- |
| `x`, `y` | angolo superiore sinistro della scheda |
| `b`, `h` | larghezza e altezza |

Tutti e quattro sono **numeri interi** contati in pixel con zoom 1. L'**origine si trova al centro della superficie**: i valori negativi stanno alla sua sinistra o sopra di essa. Le righe sotto il marcatore sono il testo della scheda.

### Collegamenti

```text
!linie <identificatore> <prima estremità> <freccia> <seconda estremità> von=<lato> nach=<lato> farbe=<nome>
```

Le due estremità sono identificatori di schede, e la **freccia fra loro porta la direzione**:

| Freccia | Significato |
| ------- | ----------- |
| `->` | orientata, punta alla seconda estremità |
| `<->` | punta a entrambe le estremità |
| `--` | senza punta |

`von=` indica il lato di collegamento alla prima estremità, `nach=` quello della seconda; sono ammessi `links` (sinistra), `rechts` (destra), `oben` (alto), `unten` (basso) e `auto`. `farbe=` colora la linea; sono ammessi `blau`, `rot`, `grün`, `gelb`, `lila`, `orange`, `türkis` e `pink` — blu, rosso, verde, giallo, viola, arancione, turchese e rosa. Senza questo attributo la linea è disegnata nel colore predefinito dello schema di colori. Le righe sotto il marcatore sono l'**etichetta**.

L'**ordine dentro il blocco è anche l'ordine di sovrapposizione**: ciò che sta più in basso si trova più avanti.

### Due regole che proteggono il file

- **L'uscita di sicurezza per il punto esclamativo.** Una riga di contenuto che inizia con `!` riceve una barra rovesciata davanti quando viene scritta e la perde di nuovo quando viene letta: nel documento c'è `\!Attenzione`, nella scheda appare `!Attenzione`. Se la riga deve leggersi letteralmente `\!Attenzione`, nel documento c'è `\\!Attenzione`.
- **Ciò che è sconosciuto viene conservato.** Un marcatore o un attributo che l'applicazione non conosce viene portato avanti e riscritto invariato; un elemento non modificato viene emesso parola per parola. Chi apre una superficie e la salva senza modifiche riottiene lo stesso file. Nemmeno un attributo difettoso butta via qualcosa: l'elemento viene allora disegnato in modo vistoso oppure non viene disegnato, ma non sparisce mai dal file.

### Un esempio

````markdown
```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Punto di partenza

L'importazione legge oggi una sola fonte.

!karte k2 x=40 y=-140 b=260 h=120
## Obiettivo

Più fonti, una fusione.

!karte k3 x=-140 y=120 b=260 h=160
## Domanda aperta

Come si risolvono i conflitti?

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
produce

!linie e2 k3 -- k1
schizzo relativo

!linie e3 k2 <-> k3 von=unten nach=oben
si condizionano
```
````

Nel rendering appare qui il blocco di sintesi, e il pulsante al suo interno porta sulla superficie:

```perspective-canvas
!karte k1 x=-320 y=-140 b=260 h=120
## Punto di partenza

L'importazione legge oggi una sola fonte.

!karte k2 x=40 y=-140 b=260 h=120
## Obiettivo

Più fonti, una fusione.

!karte k3 x=-140 y=120 b=260 h=160
## Domanda aperta

Come si risolvono i conflitti?

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
produce

!linie e2 k3 -- k1
schizzo relativo

!linie e3 k2 <-> k3 von=unten nach=oben
si condizionano
```

## Limiti

- Una scheda porta **testo proprio**; altri tipi di scheda non esistono. Le forme geometriche e le cornici di gruppo non fanno parte della superficie.
- Un collegamento nel testo di una scheda **non** compare nel grafo dei collegamenti né nei collegamenti in entrata: l'indice dell'area salta il contenuto dei blocchi di codice.
- La superficie si usa con il mouse; la tastiera porta l'annullamento, l'eliminazione e le immissioni di testo.
- Una superficie appartiene al suo documento. Le schede non si possono trascinare da una superficie a un'altra.
