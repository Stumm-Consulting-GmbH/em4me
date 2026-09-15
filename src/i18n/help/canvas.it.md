# Superficie Canvas

Una **tela** è una superficie di lavoro spaziale dentro un normale documento Markdown: **schede** con testo proprio vi sono disposte liberamente, **collegamenti** tracciano le relazioni fra loro, **forme** pongono segni accanto a esse e **gruppi** raccolgono ciò che sta insieme. Una scheda porta o il proprio testo, oppure mostra il contenuto di un altro documento o un'immagine dell'area. Quando si affiancano alternative, si abbozza un flusso o si mettono prima in ordine dei pensieri, qui l'ordine nasce dalla posizione e non dalla sequenza.

La superficie è sostenuta da un blocco di codice con il tag di linguaggio `perspective-canvas`. Un documento può contenerne quanti se ne vuole, e tutto il resto al suo interno resta normale Markdown.

La funzione appartiene alle [estensioni interne](extensions.md) («Vista tela»). Disattivata, il blocco resta un normale blocco di codice, la modalità di vista scompare e i comandi per superficie, scheda, scheda di collegamento, scheda immagine, forma, gruppo e ordine di sovrapposizione spariscono. Il documento resta leggibile senza modifiche; non si perde nulla.

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

- Un **clic** seleziona una scheda, un clic sullo sfondo annulla la selezione. È selezionato al più un elemento: una scheda, un collegamento, una forma o un gruppo.
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

### Schede di collegamento

Invece di portare testo proprio, una scheda mostra a scelta il contenuto di un **altro documento**: per intero, oppure a partire da un titolo o da un blocco. Il contenuto resta dov'è: la scheda non ne tiene alcuna copia e non si modifica in questo punto. Se non entra nella scheda, nella scheda si scorre.

- **Creare** — il comando **«Aggiungi scheda di collegamento alla tela»** (tavolozza dei comandi, menu Vista) la colloca al centro della porzione visibile, il clic destro sullo sfondo libero nel punto del clic. Entrambi chiedono prima la destinazione: `Invio` crea la scheda, `Esc` annulla. Senza destinazione non nasce alcuna scheda.
- **Impostare, cambiare, rimuovere la destinazione** — una scheda selezionata porta una **barra** con il campo «Destinazione del collegamento»; durante la digitazione propone i documenti dell'area. Così una scheda di testo diventa una scheda di collegamento, e «Rimuovi collegamento» la riporta a scheda di testo: il suo testo proprio resta. Le stesse azioni stanno nel **menu contestuale** della scheda.
- **Aprire la destinazione** — un **doppio clic sul contenuto mostrato** apre il documento collegato nel punto collegato, così come «Apri destinazione» nella barra e nel menu contestuale. Questo resta consentito anche nella pura vista, perché aprire non modifica nulla.
- **Riga di intestazione** — riporta l'**etichetta** della scheda, cioè il suo testo proprio, e altrimenti la destinazione con la sua ancora. Un doppio clic sulla riga di intestazione modifica l'etichetta come il testo di ogni altra scheda.

Se la destinazione non si trova, la scheda resta e indica, al posto del contenuto, che cosa ha cercato; nel file non cambia nulla. Se la destinazione viene modificata in un altro documento aperto, la scheda segue subito; una modifica a un file aperto da nessuna parte compare al successivo disegno della superficie.

### Schede immagine

Allo stesso modo una scheda mostra a scelta un'**immagine** dell'area. Anche qui non ne tiene copia: l'immagine resta un file e la scheda vi rimanda, tramite un percorso relativo al documento oppure tramite il solo nome del file. Viene **adattata** alla scheda mantenendo le proporzioni; in una scheda immagine non si scorre.

Si usa come la scheda di collegamento: il comando **«Aggiungi scheda immagine alla tela»** e la stessa voce nel menu contestuale della superficie, nella barra della scheda selezionata il campo «Immagine» — con i file immagine dell'area come proposte — nonché «Rimuovi immagine» e «Apri destinazione». Un doppio clic sull'immagine apre il file come l'applicazione apre ogni [allegato](attachments.md). La riga di intestazione riporta l'etichetta e altrimenti il nome del file immagine.

Se l'immagine non si trova, è troppo grande o non porta un'estensione di immagine, la scheda lo dice al posto dell'immagine. **Una scheda mostra o un documento o un'immagine;** se entrambi gli attributi stanno uno accanto all'altro, vale il documento.

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

## Forme

Oltre alle schede, la superficie ospita **forme geometriche**. Non portano contenuto, ma strutturano: mettono in risalto una zona, segnano un passo di un flusso oppure pongono un segno accanto a una scheda.

### Creare

- Un **clic destro** sullo sfondo libero → «Inserisci forma» apre un sottomenu con i sei tipi e posa quello scelto nel punto del clic.
- Il comando **«Aggiungi forma alla tela»** (palette dei comandi, menu Visualizza, scorciatoia assegnabile) posa un rettangolo al centro della porzione visibile.

I tipi a disposizione sono sei: **rettangolo**, **rettangolo arrotondato**, **ellisse**, **triangolo**, **rombo** e **stella**. Non esiste uno strumento per tratti a mano libera.

### Selezionare, spostare, ridimensionare

Come per una scheda: un clic seleziona la forma, il trascinamento la sposta, la maniglia nell'angolo in basso a destra ne cambia la dimensione. Il contorno riempie il suo rettangolo e non ne conserva le proporzioni: un'ellisse tirata in larghezza resta larga.

Ciò che si afferra è la **figura disegnata** e non il rettangolo attorno a essa: un clic nell'angolo vuoto accanto a un triangolo raggiunge ciò che sta dietro.

### Tipo, colori ed etichetta

Una forma selezionata porta una **barra degli strumenti**:

- **Tipo della forma**: passa fra i sei tipi; posizione e dimensione restano.
- **Colore del bordo**: otto colori dello schema di colori. Senza scelta vale il colore predefinito.
- **Colore di riempimento**: gli stessi otto colori, disegnati come tinta, più «Nessun riempimento».
- **Modifica etichetta**: apre la stessa immissione di un doppio clic sulla forma.

L'**etichetta** è **testo semplice**, centrato nella forma. A differenza di una scheda, in essa non viene reso alcun Markdown e non si scorre: la forma struttura, la scheda porta il contenuto. `Ctrl+Invio` e un clic accanto confermano, `Esc` annulla; un testo svuotato toglie di nuovo l'etichetta.

Le stesse azioni si trovano nel **menu contestuale** della forma.

### Eliminare

`Canc` elimina la forma selezionata, così come «Elimina forma» nel suo menu contestuale. Un collegamento non si aggancia a una forma; i collegamenti corrono soltanto fra schede.

## Gruppi

Un **gruppo** è un rettangolo che raccoglie una parte della superficie e le dà un nome: «Analisi», «scartato», «prima stesura». Il suo interno resta utilizzabile: le schede e le forme che vi si trovano si possono ancora afferrare, e un doppio clic in mezzo a un gruppo crea una scheda come ovunque altrove.

### Creare

- Un **clic destro** sullo sfondo libero → «Inserisci gruppo» lo posa nel punto del clic.
- Il comando **«Aggiungi gruppo alla tela»** lo posa al centro della porzione visibile.

Un nuovo gruppo nasce **in fondo del tutto** e quindi non copre nulla.

### Etichetta e colore

Un gruppo selezionato porta una barra degli strumenti con il **colore del gruppo** — otto colori dello schema di colori, più «Colore predefinito», che toglie di nuovo l'indicazione — e con **Modifica etichetta**. L'etichetta sta in alto a sinistra sulla cornice ed è testo semplice, come per la forma. Le stesse azioni si trovano nel **menu contestuale** del gruppo.

### Membri

**È membro ciò che si trova per intero dentro il gruppo.** Non è scritto da nessuna parte: il rettangolo stesso è l'affermazione, e non esiste un secondo elenco che potrebbe discostarsene. I bordi contano come interno; ciò che sporge oltre uno spigolo non è membro. Un gruppo dentro un gruppo è membro e si sposta con esso.

Da ciò discendono le tre azioni:

| Azione | Effetto sui membri |
| ------ | ------------------ |
| Spostare il gruppo | i membri lo seguono, la loro disposizione reciproca resta invariata |
| Ridimensionare | nulla viene spostato; chi è membro si ricalcola dopo |
| Eliminare il gruppo | i membri restano al loro posto |

Chi segue il movimento è fissato all'**inizio del trascinamento**: ciò che si trovava nel gruppo al momento della presa viene con esso, anche se lungo il percorso il gruppo va ben oltre il proprio posto. L'intero trascinamento è **un** passo di annullamento.

Un collegamento non è mai membro; segue comunque le sue schede.

## Ordine di sovrapposizione sulla superficie

Schede, forme e gruppi stanno in **un ordine comune**. Quando due elementi si sovrappongono, è esso a decidere quale sta sopra; nessun tipo sta stabilmente sopra un altro.

Per l'elemento selezionato ci sono quattro comandi:

| Comando | Effetto |
| ------- | ------- |
| Porta in primo piano | sopra tutti gli altri elementi |
| Porta avanti | davanti all'elemento successivo che gli sta davanti |
| Porta indietro | dietro all'elemento successivo che gli sta dietro |
| Porta in fondo | sotto tutti gli altri elementi |

Due vie ci portano: il **menu contestuale** dell'elemento e **Visualizza → Ordine di sovrapposizione della tela**. Gli stessi comandi si trovano nella palette dei comandi (`Ctrl+K` come predefinito); nessuna scorciatoia è preassegnata, e si possono assegnare nelle impostazioni.

**I nuovi elementi hanno il loro posto:** un nuovo gruppo nasce in fondo del tutto, una nuova forma e una nuova scheda in primo piano.

**I collegamenti non ne sono toccati.** Vengono disegnati in un livello proprio sotto tutti gli elementi e non si possono spostare nell'ordine.

## Annullare

`Ctrl+Z` ritira l'ultima azione sulla superficie, `Ctrl+Y` e `Ctrl+Maiusc+Z` la ripristinano. Ogni azione è esattamente un passo: una scheda spostata, una dimensione cambiata, un collegamento creato, un testo modificato. Finché è aperta l'immissione di testo di una scheda o di un collegamento, `Ctrl+Z` vale per il testo digitato lì.

## Navigare

- **Spostare** — trascinare lo sfondo libero con il pulsante del mouse premuto.
- **Zoom** — rotellina sopra la superficie, centrata sul puntatore.
- **Adattare** — all'ingresso nella vista e al cambio di superficie, la porzione si adatta da sé al contenuto.

## Solo guardare

La superficie segue la modificabilità del suo documento. Finché il documento è in semplice visualizzazione, senza modalità di modifica attiva, la superficie è **solo consultabile**: niente maniglie, niente trascinamento, niente creazione, niente immissione di testo, niente barra degli strumenti, nessun riordino, e il menu contestuale resta senza voci. Vale per ogni tipo: scheda, collegamento, forma e gruppo. Nemmeno la via della palette dei comandi e del menu lo aggira; il mancato effetto viene detto nella barra di stato e non taciuto. Spostare la porzione, ingrandire e selezionare un elemento con un clic restano permessi, perché non toccano il documento.

La modalità di modifica libera l'uso — matita nella barra di stato, `Ctrl+E` predefinito; i dettagli sono nella pagina [Viste e presentazione](views-display.md).

## La superficie fuori dalla vista tela

Poiché la superficie si trova in un normale documento Markdown, la si incontra in ogni vista di quel documento:

| Vista | Che cosa appare |
| ----- | --------------- |
| Sorgente | il blocco in chiaro — questa vista **è** la sorgente |
| Divisa | il testo in chiaro a sinistra, il blocco di sintesi a destra |
| Renderizzata | **il blocco di sintesi**: tipo, ampiezza in schede, collegamenti, forme e gruppi, un'anteprima dei testi delle schede e il pulsante «Apri la vista Canvas» |
| Live | lo stesso blocco; quando il punto di inserimento tocca il blocco, questo si apre in testo grezzo ed è lì modificabile |
| Mappa mentale | una breve nota con tipo e ampiezza al posto del testo grezzo |
| Tela | la superficie stessa |

L'anteprima mostra al massimo sei schede; sotto è indicato quante altre ce ne sono. Il blocco si può **richiudere**, restando la sua riga di intestazione; questo stato vale per la sessione in corso e non viene scritto nel documento. Stampa ed esportazione PDF seguono la vista renderizzata, senza stampare i due pulsanti del blocco.

## I collegamenti nella rete dell'area

Una scheda di collegamento è un **collegamento come uno nel testo corrente**, soltanto posato su una superficie. Compare perciò ovunque l'applicazione mostri collegamenti:

| Luogo | Che cosa compare |
| ----- | ---------------- |
| collegamenti in entrata della destinazione | la superficie come origine, contrassegnata con «su una tela»; l'estratto è l'etichetta della scheda |
| collegamenti in uscita del documento | una voce del tipo «Scheda di collegamento su una tela», contrassegnata con `C` |
| [Vista grafo](graph.md) | un arco come ogni altro collegamento |

I collegamenti in entrata e in uscita sono descritti nel loro insieme nella pagina [Collegamenti](linking.md).

Se la destinazione viene **rinominata o spostata**, l'attributo della scheda segue, come un collegamento nel testo corrente; lo stesso vale per l'immagine di una scheda immagine.

Due cose non contano: un'**immagine** non riceve alcun nodo nel grafo dei collegamenti, non più di quanto lo riceva un'immagine nel testo corrente. E un collegamento nel **testo proprio** di una scheda resta fuori: conta soltanto la destinazione della scheda.

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

Altri due attributi fanno della scheda una **scheda di collegamento** o una **scheda immagine**:

```text
!karte <identificatore> x=<numero> y=<numero> b=<numero> h=<numero> doc="<destinazione>"
!karte <identificatore> x=<numero> y=<numero> b=<numero> h=<numero> bild="<immagine>"
```

`doc=` mostra il contenuto di un documento. La destinazione assume le stesse forme della destinazione di un'inclusione: il nome del documento oppure un percorso relativo al documento stesso, seguito a scelta da `#Titolo` o da `#^block-id`.

`bild=` mostra un'immagine. Il valore è un percorso relativo al documento oppure il solo nome di un file immagine dell'area; le estensioni ammesse sono `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`, `bmp` e `ico`.

Se entrambi gli attributi stanno sulla stessa scheda, vale `doc=`. Un valore vuoto e un'estensione fuori dall'elenco sono un **rilievo**; l'attributo resta comunque invariato nel file. Le righe sotto il marcatore sono anche qui il testo proprio della scheda: in una scheda di collegamento e in una scheda immagine, la sua **etichetta**.

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

### Forme

```text
!form <identificatore> x=<numero> y=<numero> b=<numero> h=<numero> art=<nome> rand=<colore> füllung=<colore>
```

Posizione e dimensione contano come per una scheda. `art=` è uno di sei nomi: `rechteck` (rettangolo), `abgerundet` (arrotondato), `oval` (ellisse), `dreieck` (triangolo), `raute` (rombo) e `stern` (stella). `rand=` e `füllung=` prendono gli stessi otto nomi di colore del collegamento, e `füllung=keine` lascia la forma senza riempimento. Senza `art` vale il rettangolo, senza `rand` il colore predefinito e senza `füllung` la forma resta senza riempimento: un valore predefinito non viene scritto, perché la sua assenza lo dice già. Le righe sotto il marcatore sono l'**etichetta**.

Un nome sconosciuto in `art` o in uno dei due colori è un **rilievo**: la forma viene conservata, disegnata come rettangolo oppure nel colore predefinito, e il suo testo resta invariato nel file.

### Gruppi

```text
!gruppe <identificatore> x=<numero> y=<numero> b=<numero> h=<numero> farbe=<nome>
```

Posizione e dimensione descrivono il rettangolo, `farbe=` prende uno degli otto nomi di colore; senza tale indicazione vale il colore predefinito. Le righe sotto il marcatore sono l'**etichetta**. **Nel file non c'è alcun elenco di membri**: chi si trova nel gruppo discende dai rettangoli e da nient'altro.

### L'ordine dentro il blocco

L'**ordine dentro il blocco è anche l'ordine di sovrapposizione** su schede, forme e gruppi: ciò che sta più in basso si trova più avanti. I collegamenti stanno nella stessa sequenza, ma non ne sono toccati; vengono disegnati in un livello proprio sotto tutti gli elementi.

### Due regole che proteggono il file

- **L'uscita di sicurezza per il punto esclamativo.** Una riga di contenuto che inizia con `!` riceve una barra rovesciata davanti quando viene scritta e la perde di nuovo quando viene letta: nel documento c'è `\!Attenzione`, nella scheda appare `!Attenzione`. Se la riga deve leggersi letteralmente `\!Attenzione`, nel documento c'è `\\!Attenzione`.
- **Ciò che è sconosciuto viene conservato.** Un marcatore o un attributo che l'applicazione non conosce viene portato avanti e riscritto invariato; un elemento non modificato viene emesso parola per parola. Chi apre una superficie e la salva senza modifiche riottiene lo stesso file. Nemmeno un attributo difettoso butta via qualcosa: l'elemento viene allora disegnato in modo vistoso oppure non viene disegnato, ma non sparisce mai dal file.

### Un esempio

````markdown
```perspective-canvas
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analisi

!karte k1 x=-320 y=-140 b=260 h=120
## Punto di partenza

L'importazione legge oggi una sola fonte.

!karte k2 x=40 y=-140 b=260 h=120
## Obiettivo

Più fonti, una fusione.

!karte k3 x=-140 y=120 b=260 h=160
## Domanda aperta

Come si risolvono i conflitti?

!karte k4 x=420 y=-200 b=240 h=160 doc="Concetti/Import.md#Obiettivo"
L'obiettivo nel concetto

!karte k5 x=420 y=-20 b=240 h=140 bild="allegati/schizzo.png"
Schizzo dell'interfaccia

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Messaggio chiave

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
!gruppe g1 x=-360 y=-200 b=740 h=220 farbe=blau
Analisi

!karte k1 x=-320 y=-140 b=260 h=120
## Punto di partenza

L'importazione legge oggi una sola fonte.

!karte k2 x=40 y=-140 b=260 h=120
## Obiettivo

Più fonti, una fusione.

!karte k3 x=-140 y=120 b=260 h=160
## Domanda aperta

Come si risolvono i conflitti?

!karte k4 x=420 y=-200 b=240 h=160 doc="Concetti/Import.md#Obiettivo"
L'obiettivo nel concetto

!karte k5 x=420 y=-20 b=240 h=140 bild="allegati/schizzo.png"
Schizzo dell'interfaccia

!form f1 x=260 y=140 b=120 h=120 art=stern rand=rot füllung=gelb
Messaggio chiave

!linie e1 k1 -> k2 von=rechts nach=links farbe=blau
produce

!linie e2 k3 -- k1
schizzo relativo

!linie e3 k2 <-> k3 von=unten nach=oben
si condizionano
```

## Limiti

- Il **contenuto mostrato** di una scheda di collegamento non si modifica nella scheda; si modifica nel documento su cui essa punta. Forme e gruppi non portano alcun contenuto reso, bensì al più un'etichetta di testo semplice.
- **Le inclusioni dentro il contenuto mostrato non vengono risolte.** Se una scheda di collegamento mostra un documento che a sua volta include qualcosa, quel punto resta vuoto nella scheda; tutto il resto compare invariato.
- Una modifica alla destinazione compare **subito** finché questa viene modificata in un altro documento aperto; se viene modificato un file aperto da nessuna parte, ciò compare al successivo disegno della superficie.
- **Il disegno libero non esiste.** La superficie conosce i sei tipi di forma e nessun'altra geometria; tratti a mano libera, frecce tracciate da sé e immissione con la penna non ne fanno parte.
- Un **collegamento** corre soltanto fra schede; non si aggancia né a una forma né a un gruppo.
- Un collegamento nel **testo proprio** di una scheda non compare nel grafo dei collegamenti né nei collegamenti in entrata; conta soltanto la destinazione di una scheda di collegamento. Un'immagine non riceve alcun nodo nel grafo dei collegamenti.
- La superficie si usa con il mouse; la tastiera porta l'annullamento, l'eliminazione e le immissioni di testo.
- Una superficie appartiene al suo documento. Le schede non si possono trascinare da una superficie a un'altra.
