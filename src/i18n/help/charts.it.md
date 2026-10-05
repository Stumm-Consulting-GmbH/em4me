# Grafici di tabelle

Un **grafico di tabella** mostra i valori di una [Perspective Datatable](datatable.md) come grafico a linee, a barre, a torta o ad anello. Il grafico è un **blocco di codice a sé** nel documento, che indica la sua tabella con il suo nome. **Non contiene numeri propri**: il blocco dice soltanto quale tabella e quali delle sue colonne o righe vengono mostrate, e il grafico segue la tabella a ogni modifica — già durante la digitazione, nel sorgente come nella griglia, anche prima che il documento venga salvato.

Il grafico sta dove lo si mette: sopra la tabella, sotto di essa o in tutt’altro punto del documento. Una tabella può avere più grafici, per esempio due punti di vista sugli stessi numeri. Tabella e grafico sono visibili contemporaneamente; sulla tabella non c’è alcun commutatore. I grafici compaiono nella vista di lettura, nella vista divisa e in modalità live.

## Un esempio

Una tabella dati di nome `Vendite` e un grafico a barre che vi si riferisce:

````markdown
```perspective-datatable
table: Vendite
columns: Mese:text, Entrate:number, Uscite:number
aggregate: Entrate:sum, Uscite:sum
| Gennaio | 1200 | 800 |
| Febbraio | 1350 | 900 |
| Marzo | 1100 | 950 |
| Aprile | 1500 | 1000 |
```

```perspective-chart
table: Vendite
type: bar
labels: Mese
values: Entrate, Uscite
title: Entrate e uscite
```
````

Renderizzati, compaiono la tabella e il grafico:

```perspective-datatable
table: Vendite
columns: Mese:text, Entrate:number, Uscite:number
aggregate: Entrate:sum, Uscite:sum
| Gennaio | 1200 | 800 |
| Febbraio | 1350 | 900 |
| Marzo | 1100 | 950 |
| Aprile | 1500 | 1000 |
```

```perspective-chart
table: Vendite
type: bar
labels: Mese
values: Entrate, Uscite
title: Entrate e uscite
```

Ogni colonna di valori è una serie di dati, ogni mese una categoria sull’asse. La riga degli aggregati con le somme non ne fa parte.

## Il nome della tabella

Il nome di una tabella dati è riportato dalla riga `table:` nel suo blocco, tra le direttive di intestazione prima delle righe di dati, nell’esempio come prima riga. Il grafico lo riporta con la stessa grafia nella sua indicazione `table:`. Sono ammessi lettere (anche accentate e ß), cifre, trattino e trattino basso, niente spazi e niente punti; maiuscole e minuscole contano, `Vendite` e `vendite` sono due nomi. Il nome è allo stesso tempo l’identificatore della tabella come blocco: un collegamento come `[[Rapporto#^Vendite]]` porta a essa, un incorporamento la mostra, e le sue [proprietà del blocco](block-properties.md) sono legate a esso. Nella vista renderizzata, nella stampa e nel PDF la riga non è visibile.

- Se un nome compare più volte, conta la **prima occorrenza** nel documento.
- Un nome all’interno di un blocco di codice o nel frontmatter non dà nome a nulla; gli esempi nei blocchi di codice quindi non disturbano.
- Se il nome viola la regola o la riga compare due volte nel blocco, la tabella segnala l’errore con il numero di riga; i suoi valori restano visibili.
- Una riga `^nome` subito sotto la tabella, come la portano documenti meno recenti, vale ancora come suo nome.
- Se il nome viene rinominato tramite il pannello [Proprietà del blocco](block-properties.md), i grafici **dello stesso documento** si adeguano.

## Le indicazioni del blocco

Il blocco `perspective-chart` porta un’indicazione per riga nella forma `chiave: valore`:

| Indicazione | Significato |
|---|---|
| `table:` | la tabella: il suo nome nello stesso documento, per esempio `Vendite`, oppure `[[File#^Vendite]]` per una tabella in un altro documento |
| `type:` | il tipo: `line`, `bar`, `pie` o `donut` |
| `series:` | da dove vengono le serie di dati: `columns` (colonne) o `rows` (righe); senza la riga vale `columns` |
| `labels:` | la colonna delle etichette |
| `values:` | le colonne di valori, separate da virgole |
| `rows:` | le righe, tramite la loro voce nella colonna delle etichette, separate da virgole (solo con `series: rows`) |
| `title:` | un titolo sul grafico; senza la riga non ne compare alcuno |

Le chiavi e i nomi dei tipi sono gli stessi in ogni lingua dell’interfaccia; un documento ha quindi ovunque lo stesso significato. Le colonne si indicano con il loro **identificatore**, come negli aggregati della tabella dati, non con un’intestazione propria; maiuscole e minuscole non contano. Se un’indicazione compare due volte, vale la prima. Le righe che il grafico non conosce vengono ignorate e restano invariate.

## I quattro tipi

- **Linee** (`line`) e **barre** (`bar`) portano una o più serie di dati; con più serie, le barre di una categoria stanno una accanto all’altra. I valori negativi vengono disegnati.
- **Torta** (`pie`) e **anello** (`donut`) portano esattamente una serie di dati; ogni fetta è etichettata con il nome della sua categoria. Con moltissime fette, un grafico a torta o ad anello mostra solo le etichette che hanno spazio.

I numeri sull’asse dei valori sono scritti come nella tabella dati, con il punto decimale e senza separatore delle migliaia.

## Serie di dati da colonne o da righe

**Da colonne** (`series: columns`, il caso consueto): ogni colonna di valori è una serie di dati. Le categorie vengono dalla colonna delle etichette, una voce per ogni riga della tabella — come nell’esempio sopra.

**Da righe** (`series: rows`): ogni riga indicata è una serie di dati e porta il nome della sua voce nella colonna delle etichette. Il grafico indica una riga tramite questa voce, non tramite la sua posizione nella tabella; la voce va scritta esattamente come la mostra la tabella, maiuscole e minuscole comprese. Se una voce contiene essa stessa una virgola, la si scrive `\,`. Le categorie sono le intestazioni delle colonne di valori; senza indicazione `values:` sono tutte le colonne numeriche tranne la colonna delle etichette.

````markdown
```perspective-chart
table: Vendite
type: donut
series: rows
labels: Mese
rows: Aprile
title: Aprile
```
````

Renderizzato, sulla stessa tabella di sopra:

```perspective-chart
table: Vendite
type: donut
series: rows
labels: Mese
rows: Aprile
title: Aprile
```

Per entrambe le direzioni:

- **I valori provengono solo da colonne numeriche**, comprese le colonne numeriche calcolate, con i loro valori calcolati. La colonna delle etichette può essere di qualsiasi tipo.
- Dove una serie o una categoria prende il nome da una colonna, porta l’**intestazione** che la tabella mostra nella testata di quella colonna.
- Serie e categorie seguono l’**ordine della tabella**, non l’ordine in cui vengono indicate.
- La **riga degli aggregati** non appartiene né alle serie di dati né alle categorie.
- Conta il contenuto scritto della tabella: **ordinare e filtrare** la tabella dati nella vista non cambiano il grafico.

## Una tabella in un altro documento

Un grafico può anche indicare una tabella dati che si trova in un altro documento, con la scrittura di un collegamento a un blocco con nome:

```markdown
table: [[Rapporto#^Vendite]]
```

Così si può creare, per esempio, una pagina di riepilogo con grafici di tabelle provenienti da più note. Tutto ciò che vale per un grafico nello stesso documento vale anche per un grafico di questo tipo. Inoltre:

- **L’altro documento viene cercato come un incorporamento** della stessa destinazione (vedi [Collegamenti](linking.md)): con le stesse regole ed entro gli stessi limiti dell’area. L’estensione `.md` può mancare.
- **Se l’altro documento è aperto**, il grafico mostra il suo stato scritto, anche quello non ancora salvato, già durante la digitazione — che sia aperto nella stessa finestra o in un’altra. Se non è aperto, vale lo stato salvato.
- **Se il file viene modificato dall’esterno** e l’applicazione se ne accorge, il grafico viene ridisegnato con il nuovo stato senza riaprire il documento. Gli incorporamenti della stessa destinazione si aggiornano allo stesso modo.
- **Se il file viene rinominato**, l’indicazione `table:` del grafico si adegua.
- **Il riferimento è un collegamento**: nei backlink, nei collegamenti in uscita e nel grafo conta come un incorporamento.
- Il grafico si limita a **leggere** l’altro documento; non lo modifica mai.

## Quando un grafico non può essere disegnato

Se in quel momento una tabella non si presta a un grafico, al suo posto compare un avviso con il titolo **Il grafico non può essere disegnato** e una frase che ne indica il motivo. I motivi, nel loro ordine fisso:

1. **Manca l’altro documento** indicato.
2. **Il nome non compare nel documento** — oppure il grafico non indica alcuna tabella.
3. Il nome **non appartiene a una tabella dati**, ma per esempio a una tabella comune, a una Perspective Table o a un altro blocco.
4. La tabella dati stessa segnala un **errore nella sua struttura** — anche se, nonostante il messaggio, mostra ancora dei valori. Il grafico compare non appena l’errore nella tabella è corretto.
5. **Manca una colonna** indicata, una voce di riga indicata non corrisponde **ad alcuna riga o a più righe**, oppure nel grafico manca un’indicazione necessaria o ha un valore sconosciuto.
6. Una colonna indicata come valori **non è una colonna numerica**.
7. Le serie di dati scelte **non contengono nemmeno un numero**.
8. Il **tipo non si adatta ai dati**: un grafico a torta o ad anello riceve valori negativi, è fatto solo di zeri o porta più di una serie di dati — oppure il tipo manca o è sconosciuto.

Se valgono più motivi insieme, l’avviso indica il primo. Una volta corretto il motivo, il grafico compare al posto dell’avviso, già durante la digitazione. L’avviso è nella lingua dell’interfaccia e non modifica il documento.

### Valori omessi

Se solo singole celle delle serie scelte sono **vuote** o sono **celle di errore** — valori che non corrispondono al tipo della colonna —, il grafico viene disegnato senza questi valori. Una riga sotto il grafico ne indica il numero, per esempio:

> 2 valori sono stati omessi perché le loro celle sono vuote o illeggibili.

Senza valori omessi questa riga non compare; quando una cella viene compilata o corretta, il numero scende. Una tabella che si sta compilando compare così come grafico già dal suo primo numero. Linee e barre fatte solo di zeri vengono disegnate, perché gli zeri sono numeri.

## Colori

Le serie di dati portano i colori della [combinazione di colori](color-schemes.md) attiva: nel gruppo **Grafici**, ogni combinazione di colori ha dieci colori, da **Serie di dati 1** a **Serie di dati 10**. La prima serie porta il primo colore, la seconda il secondo e così via; per torta e anello ciò vale per ogni fetta. Dall’undicesima serie in poi i colori ricominciano dal primo.

Se si modifica uno di questi colori, si cambia combinazione di colori o si passa da chiaro a scuro, il grafico si adegua subito. Etichette e assi prendono i colori del testo della combinazione di colori.

## Stampa, PDF ed esportazione portabile

**La stampa e l’esportazione in PDF** (vedi [Strumenti](tools.md)) mostrano il grafico quando producono l’uscita dalla vista di lettura, dalla vista divisa o dalla modalità live. Lì il grafico viene disegnato **chiaro**, con i colori dei grafici della combinazione di colori chiara, anche se l’applicazione funziona in scuro; dopo, l’applicazione mostra di nuovo i propri colori. Un grafico che non può essere disegnato compare con il suo avviso, come sullo schermo, e a un cambio di pagina il grafico resta, per quanto possibile, insieme al suo avviso e alla sua riga dei valori omessi. Se la tabella si trova in un altro documento, l’uscita attende che sia stata letta; se ciò non riesce in tempo, al posto del grafico compare l’avviso «Non è stato possibile leggere la tabella in tempo.». Dalla vista sorgente, la stampa e l’esportazione in PDF producono il Markdown grezzo.

L’**esportazione portabile** scrive il grafico nel file come **immagine**, disegnata chiara, così che un destinatario lo veda senza questa applicazione. Nell’esportazione la tabella resta una tabella; l’immagine prende soltanto il posto del blocco del grafico. Se è stato necessario omettere valori, sotto l’immagine compare la stessa riga che sullo schermo. Un grafico che non può essere disegnato resta un blocco invariato. L’immagine è incorporata nel file; il visualizzatore del destinatario deve saper mostrare immagini di questo tipo, come per i diagrammi Mermaid della pagina [Matematica e diagrammi](math-diagrams.md).

Ovunque, l’uscita contiene i valori che il grafico mostra al momento dell’uscita, compresi quelli non salvati e quelli di un altro documento. La stampa e l’esportazione non modificano il documento.

## Inserire e modificare un grafico

Non occorre scrivere un grafico a mano. Due comandi con una finestra di dialogo comune lo inseriscono a partire da una tabella dati e lo modificano in seguito, senza dover conoscere le indicazioni del blocco, il nome della tabella o gli identificatori delle sue colonne: **Inserisci grafico per questa tabella** e **Modifica grafico**.

### Inserire

**Inserisci grafico per questa tabella** si trova in quattro punti:

- nel **menu contestuale della tabella dati**: clic destro sulla griglia in modalità live o nella metà renderizzata della vista divisa, su una cella, un’intestazione di colonna o il margine intorno alla griglia. La tabella resta visualizzata come griglia, e il menu porta solo questa voce.
- nel [menu contestuale dell’editor](context-menu.md), quando il cursore si trova in una tabella dati, per esempio dopo un clic destro nel suo sorgente;
- nel menu **Visualizza → Grafico**;
- nella **palette dei comandi** (`Ctrl+K` come predefinito).

Il comando si può scegliere solo se il documento è modificabile ed è stabilito su quale tabella dati agisce: il cursore si trova in una tabella dati, oppure si è fatto clic sulla tabella — perché si sta lavorando in una delle sue celle o perché il clic destro l’ha colpita. Finché una cella della tabella dati è in modifica, il comando si può quindi scegliere anche dal menu e dalla palette dei comandi. Una normale tabella Markdown o una Perspective Table non conta come tabella dati. Un clic destro nell’inserimento di una cella aperta non mostra alcun menu; l’inserimento resta aperto.

Il comando apre la finestra di dialogo descritta più sotto. Dopo la conferma:

- **Il nome della tabella.** Se la tabella non ha ancora un nome, riceve come prima riga del suo blocco `table: tabelle-1`, con il numero più piccolo ancora libero nel documento: se `tabelle-1` è già assegnato, diventa `tabelle-2`, e così via. Sotto la tabella non viene scritto nulla. Se ha già un nome, resta invariata, e il grafico indica quel nome.
- **La posizione.** Il blocco del grafico si trova subito sotto la tabella; un grafico che vi si trova già scende di un posto. Un altro grafico per la stessa tabella indica lo stesso nome.
- **La visualizzazione.** La tabella e il nuovo grafico compaiono subito disegnati; in modalità live il nuovo grafico risulta poi selezionato.
- **Annullare.** Un unico passo di annullamento (`Ctrl+Z`) toglie insieme il grafico e un nome assegnato nel frattempo.

Annullare la finestra di dialogo non cambia nulla: non nasce né un grafico né un nome.

### La finestra di dialogo

La finestra di dialogo porta il titolo del comando, **Inserisci grafico per questa tabella** all’inserimento e **Modifica grafico** alla modifica; alla modifica indica sotto la tabella, per esempio **Tabella: Vendite**. Offre solo ciò che la tabella fornisce, così che non può nascere alcuna indicazione non valida. I campi, dall’alto verso il basso:

| Campo | Che cosa offre |
|---|---|
| **Tipo di grafico** | Linee, Barre, Torta o Anello |
| **Serie di dati da** | Colonne o Righe; una direzione che non lascerebbe alcuna serie di dati non si può scegliere |
| **Colonna delle etichette** | ogni colonna della tabella, con la sua intestazione; non si può scegliere una colonna accanto alla quale non resterebbe alcuna serie di dati |
| **Serie di dati (colonne di valori)** | con serie da colonne: le colonne numeriche tranne la colonna delle etichette, comprese quelle calcolate, contrassegnate con «calcolata» |
| **Serie di dati (righe)** | con serie da righe: le righe, ciascuna con la sua voce nella colonna delle etichette |
| **Titolo (facoltativo)** | un testo libero; se resta vuoto, non compare alcun titolo |

Sotto si trovano i pulsanti **Annulla** e **Inserisci** oppure **Applica**. Inoltre:

- Con **Linee** e **Barre** si possono spuntare più serie di dati; una resta sempre spuntata. Con **Torta** e **Anello** se ne sceglie esattamente una, e la finestra di dialogo lo dice: «Un grafico a torta o ad anello mostra esattamente una serie di dati.»
- Le righe la cui voce nella colonna delle etichette è vuota o non univoca non si possono scegliere; una frase sotto l’elenco ne indica il numero.
- All’inserimento la finestra di dialogo è precompilata con: Barre, serie da colonne, come etichette la prima colonna che non è numerica (altrimenti la prima selezionabile) e tutte le colonne numeriche selezionabili.
- **Senza mouse:** all’apertura il focus è sul tipo di grafico; il tabulatore percorre i campi e resta nella finestra di dialogo. `Invio` conferma da un campo, `Esc` annulla, come anche un clic fuori dalla finestra di dialogo.
- È sempre aperta una sola finestra di dialogo. Richiamare di nuovo uno dei due comandi, per esempio dalla palette dei comandi, porta in primo piano la finestra di dialogo aperta.

### Modificare

**Modifica grafico** agisce sul grafico selezionato. Un grafico è selezionato quando il cursore si trova nel suo blocco e, in modalità live, anche quando vi si è fatto clic: un clic lo evidenzia, resta disegnato e il cursore resta dov’era. `Esc` o un clic nel testo accanto annulla la selezione. Il sorgente del blocco resta raggiungibile con i tasti freccia.

Il comando si trova negli stessi quattro punti:

- nel **menu contestuale del grafico**: clic destro sul grafico disegnato in modalità live o nella metà renderizzata della vista divisa. Il grafico resta disegnato, e il menu porta solo questa voce.
- nel [menu contestuale dell’editor](context-menu.md), quando il cursore si trova nel blocco del grafico;
- nel menu **Visualizza → Grafico**;
- nella **palette dei comandi**.

Si può scegliere solo se è selezionato un grafico e il documento è modificabile. Apre la stessa finestra di dialogo dell’inserimento, precompilata con le indicazioni del blocco; offre le colonne e le righe della tabella che il grafico nomina. Dopo la conferma il blocco porta le indicazioni modificate, e il grafico compare subito con esse. Vale quanto segue:

- Il nome che il grafico indica e la tabella stessa restano invariati; viene scritto solo il blocco del grafico.
- Le indicazioni del blocco che la finestra di dialogo non conosce vengono conservate.
- Confermare senza modifiche non scrive nulla, annullare non cambia nulla.
- Un unico passo di annullamento toglie la modifica.

**Una tabella in un altro documento.** Anche un grafico con l’indicazione `table: [[File#^nome]]` si modifica così. La finestra di dialogo legge le colonne e le righe dall’altro documento e lo nomina sotto il titolo, per esempio **Tabella: Vendite nel documento «Rapporto»**. Viene scritto solo il blocco del proprio documento; l’altro documento resta invariato. Un grafico di questo tipo non si può inserire con il comando, perché esso agisce sempre sulla tabella da cui viene richiamato; un grafico per una tabella di un altro documento nasce scrivendolo (vedi «Una tabella in un altro documento» più sopra).

### Quando al posto della finestra di dialogo compare un messaggio

Se per la tabella non può nascere alcun grafico, non si apre alcuna finestra di dialogo; al suo posto un messaggio nella barra di stato ne indica il motivo, per esempio «Non è possibile inserire un grafico per questa tabella. La tabella non ha nessuna colonna numerica.» Succede:

- all’inserimento come alla modifica, se la tabella **non ha nessuna colonna numerica**, se nessuna delle sue colonne e righe dà una serie di dati o se segnala un **errore nella sua struttura**, e se il blocco della tabella o del grafico non è chiuso;
- alla modifica, inoltre, se la tabella che il grafico nomina **non si trova** — il nome non compare, oppure l’altro documento manca — o se il nome **non appartiene a una tabella dati**. Se l’altro documento è ancora in fase di indicizzazione, il messaggio chiede di riprovare tra un momento.

Se la tabella o il grafico vengono modificati mentre la finestra di dialogo è aperta, la conferma non scrive nulla, e un messaggio lo segnala; lo stesso vale se nel frattempo la modalità di modifica è stata disattivata o un altro documento ha preso il posto del documento.

### Dove i comandi non si possono scegliere

- Nella **vista di lettura** il documento non è modificabile: un clic destro su una tabella dati o su un grafico non mostra alcun menu, e nessuno dei due comandi si può scegliere.
- Se la **modalità di modifica è disattivata** (Visualizza → Modifica), vale lo stesso in modalità live e nella vista divisa; un clic allora non seleziona nemmeno un grafico.
- Una tabella dati o un grafico in un incorporamento, nell’uscita di un blocco di script o su una scheda di una tela non offre nessuna di queste voci al clic destro.

### Con la tastiera

In modalità live la griglia della tabella dati non è raggiungibile con la tastiera. La via senza mouse passa per il cursore: con i tasti freccia nel blocco della tabella o del grafico, che allora mostra il suo sorgente, e poi il comando dalla palette dei comandi o dal menu **Visualizza → Grafico**. Nella metà renderizzata della vista divisa il tabulatore raggiunge le celle della tabella dati; una cella con il focus vale come una cella cliccata. La finestra di dialogo stessa si usa interamente senza mouse.

## L’estensione «Grafico di una tabella dati»

I grafici fanno parte delle [estensioni interne](extensions.md) e sono attivi nella modalità di lavoro **Completa**. Se l’estensione è disattivata, il blocco compare come un normale blocco di codice, anche nella stampa, nel PDF e nell’esportazione portabile; il documento resta invariato e, dopo la riattivazione, il grafico ricompare. I due comandi allora non ci sono, né nel menu, né nella palette dei comandi, né in un menu contestuale.

I grafici si basano sull’estensione **Perspective Datatable**: finché sono attivi, la tabella dati non si può disattivare. Se la tabella dati è disattivata, lo sono anche i grafici.

## Limiti

- **L’unica fonte è la tabella dati.** Una normale tabella Markdown, una Perspective Table, i risultati di una query e i record del database non sono fonte di un grafico.
- **Si modifica la tabella, non il grafico.** Il grafico è un’immagine; su di esso i valori non si possono né modificare né mostrare al passaggio del puntatore. Del grafico si modificano soltanto le indicazioni, con «Modifica grafico» o nel sorgente.
- **Nessun calcolo proprio.** Il grafico non forma somme né medie tra le serie; per mostrarle, le si calcola in una colonna calcolata della tabella.
- **Quattro tipi.** Grafici ad area, barre impilate e altri tipi non esistono.
- **I colori appartengono alla combinazione di colori**, non al singolo grafico.
- **Le modifiche dall’esterno a un altro documento** vengono notate solo se l’applicazione sorveglia il file: se il documento si trova in un’area, l’intera radice dell’area, altrimenti la cartella del documento fino a due livelli di profondità — e solo dopo che l’applicazione ha letto completamente quella cartella una prima volta.
- **Un altro documento in un’area collegata** (scritto `[[@zt:File#^nome]]`) non viene trovato; al posto del grafico compare l’avviso del documento mancante, così come non compare un incorporamento della stessa destinazione.
- **Rinominare il nome di una tabella** aggiorna solo i grafici dello stesso documento. I grafici di altri documenti non si adeguano, e nemmeno un’indicazione che indica il proprio documento nella forma `[[File#^nome]]`.
- **Una tabella dati in una citazione** o in un elenco con un rientro maggiore non porta alcun nome che il grafico, un collegamento o un incorporamento trovino.
