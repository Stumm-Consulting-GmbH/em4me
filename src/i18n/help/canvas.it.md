# Superficie Canvas

Una **tela** è una superficie di lavoro spaziale dentro un normale documento Markdown: **schede** con testo proprio vi sono disposte liberamente, **collegamenti** tracciano le relazioni fra loro, **forme** pongono segni accanto a esse e **gruppi** raccolgono ciò che sta insieme. Una scheda porta o il proprio testo, oppure mostra il contenuto di un altro documento o un'immagine dell'area. Quando si affiancano alternative, si abbozza un flusso o si mettono prima in ordine dei pensieri, qui l'ordine nasce dalla posizione e non dalla sequenza.

La superficie è sostenuta da un blocco di codice con il tag di linguaggio `perspective-canvas`. Un documento può contenerne quanti se ne vuole, e tutto il resto al suo interno resta normale Markdown.

La funzione appartiene alle [estensioni interne](extensions.md) («Vista tela»). Disattivata, il blocco resta un normale blocco di codice, la modalità di vista scompare e i comandi per superficie, scheda, scheda di collegamento, scheda immagine, forma, gruppo e ordine di sovrapposizione spariscono, e con essi la voce **Modifica tela** nel menu **Visualizza**, che non resta lì vuota. Il documento resta leggibile senza modifiche; non si perde nulla.

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
- Il comando **«Aggiungi scheda alla tela»** (palette dei comandi, Visualizza → Modifica tela, scorciatoia assegnabile) la colloca al centro della porzione visibile. Fuori dalla vista tela segnala nella barra di stato che le schede nascono solo lì.

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

- **Creare** — il comando **«Aggiungi scheda di collegamento alla tela»** (tavolozza dei comandi, Visualizza → Modifica tela) la colloca al centro della porzione visibile, il clic destro sullo sfondo libero nel punto del clic. Entrambi chiedono prima la destinazione: `Invio` crea la scheda, `Esc` annulla. Senza destinazione non nasce alcuna scheda.
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
- Il comando **«Aggiungi forma alla tela»** (palette dei comandi, Visualizza → Modifica tela, scorciatoia assegnabile) posa un rettangolo al centro della porzione visibile.

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

Due vie ci portano: il **menu contestuale** dell'elemento e **Visualizza → Modifica tela → Ordine di sovrapposizione della tela**. Gli stessi comandi si trovano nella palette dei comandi (`Ctrl+K` come predefinito); nessuna scorciatoia è preassegnata, e si possono assegnare nelle impostazioni.

**I nuovi elementi hanno il loro posto:** un nuovo gruppo nasce in fondo del tutto, una nuova forma e una nuova scheda in primo piano.

**I collegamenti non ne sono toccati.** Vengono disegnati in un livello proprio sotto tutti gli elementi e non si possono spostare nell'ordine.

## Annullare

`Ctrl+Z` ritira l'ultima azione sulla superficie, `Ctrl+Y` e `Ctrl+Maiusc+Z` la ripristinano. Ogni azione è esattamente un passo: una scheda spostata, una dimensione cambiata, un collegamento creato, un testo modificato. Finché è aperta l'immissione di testo di una scheda o di un collegamento, `Ctrl+Z` vale per il testo digitato lì.

## Navigare

- **Spostare** — trascinare lo sfondo libero con il pulsante del mouse premuto.
- **Zoom** — rotellina sopra la superficie, centrata sul puntatore.
- **Adattare** — all'ingresso nella vista e al cambio di superficie, la porzione si adatta da sé al contenuto.

## Elenco della tela e uso senza mouse

Accanto alla superficie si può mostrare un **elenco della tela**. Riporta ciò che si trova sulla superficie visualizzata in quel momento e rende così la superficie **enumerabile**: un elemento fuori dalla porzione visibile si ritrova attraverso l'elenco senza percorrere la superficie, e un collegamento che passa sotto una scheda vi si coglie con sicurezza.

Tre vie mostrano e nascondono l'elenco, come per ogni altro pannello della [barra laterale](sidebar.md): il **pulsante** nella barra di stato, **Visualizza → Barra laterale → Pannelli → Elenco della tela** e la palette dei comandi (`Ctrl+K` predefinito). Nessuna scorciatoia è preassegnata; se ne assegna una nelle impostazioni. Lo stato vale per colonna e sopravvive al cambio di documento e a un riavvio. Se la vista tela è disattivata come [estensione interna](extensions.md), l'elenco non esiste: né il pulsante, né la voce di menu, né la voce nella palette dei comandi.

### Che cosa mostra l'elenco

- **Tutti i tipi di elemento**: schede, forme e gruppi, ogni riga riconoscibile dal suo tipo.
- **Sotto ogni scheda i suoi collegamenti**, ciascuno con direzione e controparte. Una maniglia di ripiegamento sulla scheda li mostra e li nasconde.
- **L'ordine dell'elenco è l'ordine di sovrapposizione:** ciò che sta più in basso nell'elenco sta più avanti sulla superficie. Una seconda indicazione dell'ordine è quindi superflua.
- Se il documento porta **più superfici**, l'elenco appartiene a quella visualizzata; un cambio dalla barra delle schede fa cambiare anche l'elenco.
- Una riga sopra l'elenco indica il **numero di elementi** — oppure dice, al suo posto, che nessun documento è aperto, che il documento non porta alcuna superficie o che la superficie è ancora vuota.

**Selezione ed elenco mostrano la stessa cosa, in entrambe le direzioni.** Ciò che è selezionato sulla superficie è evidenziato nell'elenco; ciò che è selezionato nell'elenco è evidenziato sulla superficie e si porta **al centro della porzione**, mentre l'ingrandimento resta invariato. Se il documento non è nella vista tela, selezionare una voce vi conduce prima; se il documento non porta alcuna superficie, la barra di stato dice che quella vista per esso non c'è.

### I tasti nell'elenco

| Tasto | Effetto |
| ----- | ------- |
| `Freccia su`, `Freccia giù` | alla riga precedente o successiva; la superficie seleziona con essa e porta l'elemento al centro |
| `Home`, `Fine` | alla prima o all'ultima riga |
| `Invio` | modifica l'elemento selezionato: il testo di una scheda, la didascalia di una forma, di un gruppo o di un collegamento |
| `Canc` | elimina l'elemento selezionato |
| tasto menu contestuale, `Maiusc+F10` | apre il menu contestuale dell'elemento; senza elemento selezionato, il menu della superficie con le sue vie di creazione |
| `Esc` | toglie la selezione |

Modificare ed eliminare presuppongono un documento modificabile e una vista tela aperta. Se manca una delle due condizioni, la barra di stato lo dice invece di non fare nulla in silenzio; in un documento non modificabile l'elenco continua a mostrare e a selezionare.

### Aggiungere un collegamento senza mouse

La voce **«Aggiungi collegamento alla tela…»** nel menu contestuale di una scheda avvia la **scelta della destinazione nell'elenco**. Si svolge in due passaggi, perché un collegamento ha due estremità e senza puntatore non esiste un punto in cui nominare di sfuggita la controparte:

1. La scheda di partenza è la scheda selezionata.
2. L'elenco percorre poi soltanto le **altre schede**, e la riga sopra di esso dice che va scelta una destinazione. `Invio` conferma, un clic su una riga di scheda pure, `Esc` annulla e ripristina lo stato precedente.

I lati di aggancio li determina l'applicazione dalla posizione delle due schede; si cambiano poi nella barra del collegamento selezionato. Se non c'è una seconda scheda, la barra di stato lo dice.

### Cercare dentro la superficie

In testa all'elenco sta un **campo di filtro**. Restringe l'elenco agli elementi che contengono il testo digitato. Vengono percorsi

- il **testo** di una scheda nonché la didascalia di una forma e di un gruppo,
- la **destinazione di rimando** di una scheda di collegamento e il **nome dell'immagine** di una scheda immagine,
- la **didascalia** di un collegamento.

Si cerca come una sequenza di caratteri unica, senza riguardo a maiuscole e minuscole — la stessa regola della palette dei comandi; non esistono modelli né corrispondenze approssimate. Le occorrenze sono evidenziate nella riga, la riga sopra l'elenco le conta e, se non resta nulla, lo dice invece di svuotare l'elenco senza una parola. Una scheda resta quando corrisponde uno dei suoi collegamenti; quando corrisponde la scheda stessa, tutti i suoi collegamenti restano con essa. Finché un filtro è attivo, le schede sono aperte: un'occorrenza sotto una scheda ripiegata non sarebbe tale.

| Immissione | Effetto |
| ---------- | ------- |
| `Invio` | salta all'occorrenza: selezionata, centrata, fuoco nell'elenco. Viene presa la riga selezionata se è fra le occorrenze, altrimenti la prima |
| `Freccia giù` | lo stesso; da lì le frecce percorrono le restanti occorrenze |
| `Esc` | svuota il campo senza toccare la selezione. Con il campo vuoto non ha effetto |

**`Ctrl+F` conduce in questo campo nella vista tela** e non nella barra di ricerca. Il motivo: chi cerca in questa vista cerca sulla superficie che ha davanti; la barra di ricerca, invece, percorre il testo del documento e mostra le sue occorrenze là dove in questa vista non c'è nulla da vedere. In ogni altra vista `Ctrl+F` apre la barra di ricerca come prima, e se l'estensione tela è disattivata, quella vista non c'è e neppure questo scambio.

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

## La superficie nell'esportazione portabile

**File → Altre funzioni file → Esporta → Markdown portabile…** scrive una versione del documento che dice qualcosa anche senza questa applicazione. In essa ogni superficie compare come la sua **corrispondenza in Markdown**: lo stesso contenuto e la stessa rete di relazioni, in Markdown ordinario. Senza di essa il destinatario riceverebbe un blocco di codice pieno di righe di coordinate con cui non potrebbe fare nulla.

| Sulla superficie | Nell'esportazione |
| ---------------- | ----------------- |
| la superficie stessa | una riga di testa in grassetto con il suo titolo — la prima riga della sua prima scheda — e la sua ampiezza, la stessa indicazione della riga di intestazione del blocco |
| una scheda | il suo testo, **invariato**; i titoli al suo interno restano come sono, e sopra la scheda non compare alcun titolo inventato |
| una scheda di collegamento | la sua etichetta e, sotto, il collegamento nella stessa scrittura del resto del testo del documento |
| una scheda immagine | la sua etichetta e, sotto, l'immagine come incorporazione |
| un gruppo | una riga in grassetto con il suo nome; subito sotto stanno gli elementi che si trovano al suo interno |
| una forma con etichetta | un punto elenco composto dal suo tipo e dalla sua etichetta; una forma senza etichetta viene omessa |
| i collegamenti | **un** elenco alla fine della superficie, ogni riga con le due schede, il segno della loro direzione e, se presente, l'etichetta |
| un'indicazione errata | una riga di nota presso l'elemento interessato — oppure alla fine della superficie, se non spetta ad alcun elemento |

L'ordine è quello del blocco e quindi l'ordine di sovrapposizione che mostra anche l'elenco della tela. **Nulla viene accorciato:** tutte le schede compaiono per intero, a differenza dell'anteprima limitata del blocco. Se il documento contiene più superfici, ciascuna riceve la propria riga di testa e il proprio elenco dei collegamenti.

Questa superficie

````markdown
```perspective-canvas
!gruppe g1 x=-300 y=-160 b=600 h=200 farbe=blau
Analisi

!karte k1 x=-260 y=-120 b=240 h=120
Punto di partenza

!karte k2 x=40 y=-120 b=240 h=120
Obiettivo

!karte k3 x=-100 y=140 b=240 h=120 doc="Concetti/Import.md#Obiettivo"
L'obiettivo nel concetto

!form f1 x=220 y=140 b=120 h=120 art=stern rand=rot
Messaggio chiave

!linie e1 k1 -> k2 von=rechts nach=links
produce
```
````

si presenta così nell'esportazione portabile:

```markdown
**Punto di partenza · 3 schede, 1 collegamento, 1 forma, 1 gruppo**

**Analisi**

Punto di partenza

Obiettivo

L'obiettivo nel concetto

[[Concetti/Import.md#Obiettivo]]

- Stella: Messaggio chiave

**Collegamenti**

- Punto di partenza → Obiettivo: produce
```

**Ciò che non viaggia è la disposizione spaziale.** L'esportazione restituisce contenuto e rete, non un'immagine: che cosa stava accanto e che cosa lontano non vi compare. I gruppi sono l'unica cosa che passa dalla disposizione, perché portano la struttura concettuale della superficie. E la corrispondenza è un'**uscita, non una seconda forma di memorizzazione**: da essa non si può recuperare alcuna superficie. L'originale resta intatto nel documento stesso: l'esportazione legge la superficie e non vi scrive.

**Stampa ed esportazione PDF non ne sono toccate.** Seguono la vista renderizzata e mostrano la superficie come blocco, come descritto nel capitolo precedente.

**Se la vista tela è disattivata come [estensione interna](extensions.md)**, la superficie resta anche nell'esportazione un blocco di codice leggibile — la stessa affermazione che questa pagina fa già per la vista renderizzata: il documento resta leggibile e non va perso nulla.

## Scambio con altri strumenti

Una superficie non deve restare dentro questa applicazione. Si salva come file nel formato aperto **JSON Canvas** — estensione `.canvas` —, che anche altri strumenti leggono; viceversa, un file così si legge qui. Chi lavora con qualcuno che usa un altro strumento può così consegnare la propria superficie invece di descriverla.

**La memorizzazione resta il file Markdown.** Il file scritto è un prodotto di scambio e non un secondo formato di memorizzazione: non viene aggiornato quando la superficie cambia in seguito, e alla lettura viene letto e non ripreso.

**Scrivere una superficie** — in quattro passi:

1. Aprire la vista tela. Se il documento porta più superfici, scegliere la scheda di quella voluta: viene scritta la superficie che si vede in quel momento.
2. Scegliere **File → Altre funzioni file → Esporta → Tela come JSON Canvas…**.
3. La finestra di salvataggio propone il nome del documento con l’estensione `.canvas` nella cartella del documento; nome e posizione si possono cambiare.
4. Scritto il file, compare il messaggio con ciò che è stato trasferito e ciò che no.

La voce è selezionabile solo finché la vista tela mostra una superficie; altrimenti resta visibile ma in grigio. Il documento stesso resta intatto e, se porta altre superfici, il messaggio ne indica il numero.

**Leggere un file** — in quattro passi:

1. Scegliere **File → Altre funzioni file → Importare → File JSON Canvas…**. Non servono né una superficie aperta né un documento aperto.
2. Nella finestra di apertura scegliere uno o più file con l’estensione `.canvas`; con un’area aperta devono trovarsi al suo interno.
3. Per ogni file scelto nasce **accanto ad esso** un nuovo documento con il suo nome e l’estensione `.md`. Se quel nome è già occupato, viene aggiunto un numero: `Plan.canvas` diventa allora `Plan-2.md`. Ogni nuovo documento viene aperto e mostra la vista tela.
4. Poi **un solo** messaggio copre tutti i file scelti, con una sezione per ciascuno.

I file scelti restano dove sono, invariati. **I collegamenti ritrovano i loro file** quando il file letto si trova al suo posto nella cartella ripresa — il caso consueto quando si riprende un intero fondo estraneo; una destinazione che così non si trova compare poi sulla scheda con il suo semplice nome di file e viene nominata nel messaggio.

**Dopo ogni operazione l’applicazione dice che cosa è stato trasferito e che cosa no** — ciascuno con il proprio numero, e anche quando tutto è passato. Il messaggio non è un messaggio di errore, ma la ricevuta dello scambio: i due formati non si coprono del tutto, e ciò che non coincide non deve accadere in silenzio.

**Che cosa diventa la superficie alla scrittura:**

| Sulla superficie | Che cosa ne diventa |
| ---------------- | ------------------- |
| una scheda, un gruppo, un collegamento | lo stesso di là, con posizione, dimensione, ordine, colore e didascalia |
| una forma | una scheda di testo nello stesso punto e della stessa dimensione, con la sua didascalia come testo e il suo colore di bordo come colore della scheda; che fosse una forma, e il suo riempimento, non figurano più da nessuna parte |
| la didascalia di una scheda di collegamento o immagine | una cornice con titolo attorno a quella scheda |
| i colori blu e rosa | un valore di colore, perché l’altro formato non porta un nome per questi due |
| un lato di attacco che l’applicazione sceglie da sé | nessuna indicazione; l’altro strumento sceglie il lato |
| le altre superfici dello stesso documento | nulla — il file porta esattamente una superficie; il messaggio ne indica il numero |
| un elemento errato o sconosciuto | nulla; viene contato |

**Che cosa diventa il file alla lettura:**

| Nel file | Che cosa ne diventa |
| -------- | ------------------- |
| una scheda di testo, un gruppo, un collegamento | lo stesso qui, con posizione, dimensione, ordine, colore e didascalia |
| un semplice a capo nel testo di una scheda | un a capo forzato; la scheda mostra le stesse righe dell’altro strumento |
| una scheda rivolta a un documento o a un’immagine | una scheda di collegamento o una scheda immagine; una destinazione su un titolo o su un blocco resta |
| una scheda con un indirizzo web | una scheda di testo con l’indirizzo come collegamento da toccare |
| una scheda rivolta a un altro tipo di file | una scheda di testo con un collegamento a quel file |
| il colore di una scheda | nulla — qui una scheda non porta colore |
| un valore di colore libero su un gruppo o un collegamento | il più vicino degli otto colori |
| un collegamento che inizia o finisce su un gruppo | nulla; qui i collegamenti corrono solo tra schede |
| una punta di freccia solo all’inizio | un normale collegamento orientato con inizio e fine scambiati — senza perdita |
| un’immagine di sfondo di un gruppo | nulla |

**L’andata e il ritorno non riportano al punto di partenza.** Una superficie scritta e riletta **non** torna identica: una forma è diventata una scheda di testo e tale resta, la didascalia di una scheda di collegamento è diventata una cornice. È il prezzo dello scambio e non una lacuna — marcature nascoste con cui riconoscere di nuovo l’elemento originario non esistono di proposito, perché in ogni altro strumento apparirebbero come rifiuti di dati.

**Se la vista tela è spenta come [estensione interna](extensions.md)**, nessuna delle due vie è disponibile: la voce per scrivere e la voce per leggere spariscono dal menu, e nemmeno dalla palette dei comandi si raggiungono i due comandi.

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
- **Il trascinamento libero e lo zoom non esistono da tastiera.** L'elenco della tela seleziona, modifica, elimina e crea; la posizione di un elemento si cambia da tastiera soltanto con i quattro comandi dell'ordine. Spostare, ridimensionare e muovere la porzione restano riservati al mouse.
- **L'elenco rende la superficie utilizzabile, non evidente.** Enumera ciò che vi si trova e non sostituisce quel che mostra la disposizione spaziale.
- **La ricerca nell'area continua a trovare un documento con superficie attraverso il suo testo**, perché la superficie vi sta in chiaro; una fonte propria di occorrenze non lo è. Schede, forme e gruppi presi singolarmente non compaiono quindi come occorrenze proprie: li trova il campo di filtro dell'elenco della tela.
- **L'esportazione portabile restituisce la superficie come testo, non come immagine.** La disposizione spaziale non viaggia e dalla corrispondenza non si può recuperare alcuna superficie; passano il contenuto, i gruppi e la rete dei collegamenti.
- **Un elemento errato non viene omesso in silenzio nell'esportazione**: viene scritto con ciò che ha di leggibile e accompagnato da una riga di nota. Una forma senza etichetta viene invece omessa, perché senza la rappresentazione spaziale non ne resterebbe nulla.
- **Lo scambio con il formato aperto non è un percorso di andata e ritorno senza perdite.** Una superficie scritta e riletta non torna identica: una forma torna come scheda di testo, la didascalia di una scheda di collegamento come cornice.
- **Un file del formato estraneo non viene aperto come documento, ma letto.** Resta dov’è, invariato; la superficie la porta poi il nuovo documento accanto ad esso, e ciò che vi viene cambiato non torna nel file.
- Una superficie appartiene al suo documento. Le schede non si possono trascinare da una superficie a un'altra.
