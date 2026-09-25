# Bacheca Kanban

Una **bacheca Kanban** dispone nello spazio le attività di **un** documento: ogni elenco con nome del documento si affianca come **colonna**, ogni riga di attività al suo interno come **scheda**. Chi trascina una scheda da una colonna alla successiva ne sposta la riga nel documento: la bacheca è una superficie di lavoro, non una valutazione.

La bacheca è **un'ulteriore vista dello stesso documento** e non un formato di file a sé. Tutto ciò che vi compare sta nel file come Markdown ordinario; le altre viste mostrano le stesse intestazioni e le stesse liste di attività di prima, e passare dall'una all'altra non cambia il testo.

## Da che cosa si riconosce una bacheca

Dal **contrassegno di intestazione** `kanban-plugin` nell'intestazione del documento:

```markdown
---
kanban-plugin: board
---
```

Ciò che conta è la **presenza** della chiave, non il suo valore: `board`, `list` o altro — ogni documento con questa chiave è una bacheca, e il valore trovato resta intatto. Un documento senza la chiave non è una bacheca, anche se porta intestazioni ed elenchi di attività.

## L'estensione «Kanban»

La funzione appartiene alle [estensioni interne](extensions.md) («Vista bacheca (Kanban)»). Se è disattivata, la modalità di vista viene meno, i comandi per scheda, colonna e bacheca spariscono, e con essi il sottomenu **Bacheca Kanban** del menu **Visualizza**, che non resta vuoto. Il documento rimane leggibile tale e quale; nello stato disattivato non si scrive mai, e colonne e schede restano nel testo.

La bacheca presuppone l'estensione **Attività**, perché una scheda **è** una riga di attività. Se quella è disattivata, lo è anche la bacheca.

## Creare una bacheca

Due vie, entrambe nel menu **Visualizza → Bacheca Kanban** e nella palette dei comandi (`Ctrl+K` predefinito):

| Via | Effetto |
| --- | ------- |
| **Nuova bacheca Kanban** | crea un documento nuovo, ancora senza nome, lo riempie con una bacheca iniziale e lo apre subito nella vista bacheca |
| **Converti il documento vuoto in bacheca Kanban** | scrive la stessa bacheca iniziale nel documento aperto |

**Nuova bacheca Kanban** è sempre disponibile: è la via verso la prima bacheca e non ne presuppone alcuna.

**La conversione**, invece, è disponibile solo per un documento **vuoto** che non sia già una bacheca; altrimenti la voce resta visibile e attenuata. Il motivo è la sicurezza dei file: un documento con contenuto verrebbe sovrascritto. La voce si adegua mentre si digita: al primo carattere perde il suo fondamento, all'ultimo cancellato lo riacquista. Presuppone inoltre un documento modificabile; se manca una delle condizioni, la barra di stato lo dice invece di non fare nulla in silenzio.

La bacheca iniziale porta tre colonne — **Da fare**, **In corso** e **Fatto** — e l'ultima è impostata per segnare come completate le schede che vi vengono trascinate. I titoli sono nella lingua dell'interfaccia; si modificano come qualunque altro titolo di colonna.

## Aprire la vista bacheca

La bacheca è la settima modalità di vista, accanto a Sorgente, Divisa, Renderizzata, Live, Mappa mentale e Tela: **Visualizza → Bacheca**, il pulsante nella barra di stato oppure `Ctrl+7` predefinito. Come per le altre modalità, la scelta vale per documento aperto e non per l'intera applicazione, e viene ripristinata al successivo avvio.

**La modalità dipende dal documento.** È selezionabile solo se il documento aperto è una bacheca: una vista bacheca senza bacheca non mostrerebbe altro che un avviso. Senza il contrassegno di intestazione, pulsante e voce di menu restano **visibili e attenuati**; il motivo compare nel suggerimento del pulsante. La strada della scorciatoia e della palette dei comandi non porta allora da nessuna parte e nemmeno butta fuori dalla vista attuale. Non appena il contrassegno compare nel testo o ne sparisce, l'accesso si adegua, e un documento che era aperto nella vista bacheca alla chiusura e che non è più una bacheca si apre nella vista di lettura. La [superficie Canvas](canvas.md) ha la stessa proprietà; le altre cinque modalità sono disponibili su ogni documento.

## Che cosa mostra la bacheca

- Le **colonne** affiancate, ciascuna con il suo titolo e il numero delle sue schede; se la colonna porta un limite, il contatore mostra entrambi, per esempio `2/3`. Se non stanno una accanto all'altra, la striscia delle colonne scorre in orizzontale; una colonna lunga scorre in verticale per conto suo.
- Le **schede** una sotto l'altra, nell'ordine delle loro righe nel documento. Il testo della scheda è **renderizzato**: collegamenti, tag, evidenziazioni e immagini compaiono come nella vista di lettura. I tag stanno nel testo dove sono scritti oppure, a scelta, raccolti in fondo alla scheda.
- Le **righe di seguito rientrate** di un'attività compaiono come aggiunta sulla sua scheda.
- I **dati dell'attività** — scadenza e ora, priorità, ricorrenza e gli altri marcatori — compaiono come badge sotto il testo della scheda.
- Lo **stato** dell'attività compare come casella sulla scheda, con il carattere che sta nel documento — anche con un carattere di stato personalizzato.
- Una colonna che segna come completate le schede trascinate al suo interno porta per questo un contrassegno accanto al suo contatore di schede.

Una bacheca senza colonne e una colonna senza schede lo dicono al loro posto, invece di mostrare una superficie vuota. Se una parte della bacheca non si lascia leggere, sopra compare un riquadro informativo con il numero di riga e una frase per ogni rilievo; ciò che è stato leggibile compare comunque sotto.

## Schede

| Azione | Mouse | Tastiera | Menu contestuale | Comando |
| ------ | ----- | -------- | ---------------- | ------- |
| Creare | pulsante **Aggiungi scheda** ai piedi della colonna | — | — | **Aggiungi scheda alla bacheca** |
| Selezionare | clic sulla scheda | — | — | — |
| Modificare | doppio clic sulla scheda | `Invio` o `F2` | **Modifica la scheda** | — |
| Confermare | clic fuori dalla scheda | `Invio` | — | — |
| Annullare | — | `Esc` | — | — |
| Cambiare lo stato | clic sulla casella | `Spazio` | — | — |
| Impostare o cambiare la scadenza | clic sul badge di scadenza | — | **Imposta data…** | — |
| Rimuovere la scadenza | — | — | **Rimuovi data** | — |
| Archiviare | — | — | **Archivia la scheda** | **Archivia scheda della bacheca** |
| Eliminare | — | `Canc` | **Elimina la scheda** | — |

**Una scheda nuova è subito scrivibile** e nasce ai piedi della colonna in cui è stata creata. Se il suo testo resta vuoto, non nasce alcuna scheda — né nel documento né come passo di annullamento.

**Ciò che si modifica è il testo grezzo della scheda**, su una sola riga. Chi scrive una scheda scrive Markdown e deve vederlo. I marcatori della riga di attività — scadenza, ora, priorità e ricorrenza — appartengono alla riga e restano intatti durante la modifica; lo stesso vale per le righe di seguito rientrate. Una scadenza nella notazione dell'altro strumento sta invece nel testo e viene riscritta alla conferma (vedi «Dati sulla scheda»). Un testo invariato non scrive nulla nel documento.

**Il cambio di stato segue la stessa strada di un clic sulla casella nella vista di lettura**, catena degli stati, date automatiche e ricorrenza comprese. Non esiste una seconda logica degli stati.

**Si elimina senza richiesta di conferma.** L'azione è a un solo passo di annullamento, e una domanda su ogni scheda sarebbe un clic di troppo. Dopo, la selezione passa alla scheda successiva della colonna, altrimenti alla precedente.

## Colonne

| Azione | Mouse | Tastiera | Menu contestuale | Comando |
| ------ | ----- | -------- | ---------------- | ------- |
| Creare | pulsante **Aggiungi colonna** in fondo alla striscia | — | — | **Aggiungi colonna alla bacheca** |
| Rinominare | doppio clic sul titolo della colonna | — | **Rinomina la colonna** | — |
| Confermare | clic fuori dal campo | `Invio` | — | — |
| Annullare | — | `Esc` | — | — |
| Impostare o cambiare il limite | — | — | **Imposta il limite…** | — |
| Rimuovere il limite | — | — | **Rimuovi il limite** | — |
| Eliminare | — | — | **Elimina la colonna** | — |
| Attivare o disattivare il contrassegno | — | — | **Segna come completate le schede trascinate al suo interno** (con spunta) | — |

Il pulsante **Aggiungi colonna** c'è anche su una bacheca senza alcuna colonna; altrimenti non ci sarebbe una via verso la prima. Se il titolo resta vuoto, non nasce alcuna colonna.

**La rinomina tocca solo la riga di intestazione**: rientro, cancelletti e spaziatura restano, un limite resta nella notazione in cui è stato trovato, e le schede della colonna restano intatte.

**All'eliminazione si chiede conferma non appena la colonna porta schede.** Una colonna vuota sparisce senza domanda; una piena indica nella domanda il suo titolo e il suo numero di schede ed è preimpostata su **Annulla**. Il motivo della differenza: eliminando una colonna sparisce più di quanto l'azione annunci, cioè anche le sue schede.

I due comandi di creazione — per la scheda e per la colonna — e l'archiviazione della scheda selezionata stanno nel menu **Visualizza → Bacheca Kanban** e nella palette dei comandi. Per essi non è predefinita alcuna scorciatoia da tastiera; se ne può assegnare una nelle impostazioni.

## Spostare con il mouse

**Una scheda si trascina per la scheda, una colonna per la sua testa.** Durante il trascinamento l'elemento trascinato arretra e un contrassegno mostra dove verrà posato. Con il puntatore sul bordo, la superficie sotto di esso continua a scorrere: la striscia delle colonne in orizzontale, l'elenco delle schede in verticale.

Quale colonna si intenda lo decide la sola orizzontale: un puntatore sotto l'ultima scheda intende comunque quella colonna.

Il trascinamento finisce al rilascio. `Esc`, la perdita della finestra e il rilascio fuori da ogni colonna lo interrompono senza modificare il documento; lo stesso vale se la scheda torna al proprio posto. Dopo il rilascio la scheda spostata è selezionata.

Finché una scheda o un titolo di colonna è in modifica non inizia alcun trascinamento; in un documento non modificabile nemmeno. **Senza mouse non si può spostare**; tutte le altre azioni della bacheca sono raggiungibili anche da tastiera e dai menu.

## Una colonna che segna come completato

Ogni colonna porta l'impostazione **Segna come completate le schede trascinate al suo interno**, commutata dal suo menu contestuale. Quando è attiva:

- Una scheda trascinata **dentro** e ancora aperta viene segnata come completata.
- Una scheda completata trascinata **fuori** da una colonna simile verso una ordinaria viene riaperta.
- Un riordino tra due colonne ordinarie lascia lo stato intatto.

Spostare e segnare sono insieme **una** azione e quindi un solo passo di annullamento. Quale stato venga impostato lo decide la catena degli stati delle attività, e la data di completamento compare e sparisce come nella vista di lettura.

**Se la scheda porta una regola di ricorrenza**, il contrassegno genera la successiva istanza dell'attività, come ovunque. Sulla bacheca quell'istanza atterra **nella colonna da cui la scheda è stata tirata**, al posto della vecchia scheda — e non nella colonna dei completati. Un'attività aperta nella colonna dei completati sarebbe esattamente la contraddizione che una bacheca è lì per sciogliere. In un riordino all'interno della stessa colonna l'istanza vi resta e prende il vecchio posto della scheda.

## Dati sulla scheda

Sotto il testo della scheda compare una fila di **badge** con i dati dell'attività: la scadenza con la sua ora, le date pianificata e di inizio, la priorità, la ricorrenza e gli altri marcatori di attività. Sono gli stessi badge della vista di lettura, con la stessa segnalazione per i dati scaduti e non validi. Una scheda senza dati non porta una tale fila.

**Impostare e rimuovere la scadenza.** Il menu contestuale di una scheda offre **Imposta data…** e, non appena la scheda porta una scadenza, **Rimuovi data**; anche un clic sul badge di scadenza porta a impostarla. Si sceglie nel selettore di data delle attività, a scelta con l'ora e con la scadenza esistente già indicata. La scadenza viene scritta nella riga della scheda nella notazione delle attività dell'applicazione:

```markdown
- [ ] Inviare il preventivo 📅 2026-10-02 14:00
```

Compare così anche nella vista di lettura e nelle query di attività. Ogni impostazione e ogni rimozione è un passo di annullamento; se il documento cambia mentre il selettore di data è aperto, la scelta viene scartata e la barra di stato lo dice.

**Visualizzazione relativa.** Con l'interruttore **Visualizza → Bacheca Kanban → Mostra date relative** le date di scadenza, pianificata e di inizio si leggono a partire da oggi: «oggi», «domani», «tra 3 giorni», «2 giorni fa», nella lingua dell'interfaccia e con l'ora aggiunta. La data esatta sta allora nel suggerimento del badge. Le date di creazione, di completamento e di annullamento restano assolute, perché registrano quando è successo qualcosa. L'interruttore è spento come predefinito, vale per tutte le bacheche di tutte le finestre e non cambia nulla nel documento.

**Scadenze nella notazione dell'altro strumento.** Lo strumento di bacheche da cui proviene il formato scrive una scadenza come `@{…}` e un'ora come `@@{…}` nella riga della scheda. La bacheca legge entrambe e le mostra come badge di scadenza con bordo tratteggiato; il suo suggerimento ne indica la provenienza. **Alla prima modifica della scheda una tale scadenza viene riscritta nella notazione delle attività**, sia confermando un testo di scheda modificato sia impostando o rimuovendo la scadenza. La prima riga diventa la seconda:

```markdown
- [ ] Inviare il preventivo @{2026-10-02} @@{14:00}
- [ ] Inviare il preventivo 📅 2026-10-02 14:00
```

**Questo ha un prezzo:** nell'altro strumento la scadenza riscritta compare poi solo come testo dell'attività e non più come data della scheda. Chi tiene una bacheca in entrambi gli strumenti dovrebbe saperlo prima di modificare qui una tale scheda. Senza modifica non viene riscritto nulla: aprire, cambiare lo stato, spostare e archiviare lasciano la riga com'è. Una scadenza in questa notazione che non si lascia leggere — una data che non esiste, oppure un'ora senza data — resta nel testo della scheda e compare in più come badge non valido, il cui suggerimento ne indica il motivo. Un [valore di calendario](custom-calendars.md) dell'applicazione nella stessa forma tra graffe non è una tale scadenza e resta intatto.

## Tag in fondo alla scheda

Sulla scheda i tag stanno dapprima dove sono scritti: nel testo della scheda, renderizzati come nella vista di lettura. Con l'interruttore **Visualizza → Bacheca Kanban → Tag in fondo alla scheda** lasciano il testo mostrato e stanno raccolti in una riga propria in fondo alla scheda — anche i tag delle righe di seguito rientrate, ciascuno una volta e nell'ordine in cui compare. L'interruttore è spento come predefinito, vale per tutte le bacheche di tutte le finestre e non cambia nulla nel documento: i tag restano nella riga in cui stanno.

Un clic su un tag della scheda — in fondo come nel testo — filtra la barra laterale dei tag su di esso, come nella vista di lettura; selezione e modifica della scheda non ne sono toccate. Mentre una scheda viene modificata, la sua riga dei tag è nascosta, perché l'immissione mostra il testo grezzo con i tag. I due interruttori di visualizzazione sono selezionabili solo nella vista bacheca aperta.

## Limite per colonna

Una colonna può portare un **limite**: il numero di schede che deve contenere al massimo. Nel documento sta tra parentesi alla fine del titolo della colonna, per esempio `## In corso (3)`; sulla bacheca non compare nel titolo, ma nel contatore: `2/3`.

Si imposta e si modifica con **Imposta il limite…** nel menu contestuale della testa di colonna. L'immissione compare al posto del contatore e, come un titolo di colonna, si conferma con `Invio` o un clic accanto e si annulla con `Esc`. Un'immissione vuota o `0` rimuove il limite, così come la voce **Rimuovi il limite**, che il menu offre non appena ne è impostato uno.

**Il limite non blocca.** Se la colonna porta più schede di quante ne preveda, il suo contatore viene evidenziato e il suo suggerimento dice «limite superato»; si possono comunque trascinarvi e crearvi schede. La bacheca mostra ciò che è e lascia a voi la decisione. Un `(0)` scritto a mano non vale come limite e resta parte del titolo.

## Archivio

**Archivia la scheda** nel menu contestuale di una scheda, oppure il comando **Archivia scheda della bacheca** per la scheda selezionata, toglie la scheda con le sue righe di seguito rientrate dalla sua colonna e la scrive alla fine della **sezione d'archivio** dello stesso documento. Davanti al suo testo si pone un'indicazione di data e ora; il suo stato e i suoi altri dati restano come sono:

```markdown
***

## Archivio

- [x] 2026-09-23 14:05 Raccogliere il requisito
```

Se la sezione manca, nasce dietro l'ultima colonna, con l'intestazione che anche l'altro strumento scrive nella lingua dell'interfaccia; una sezione esistente viene proseguita con la sua intestazione e il suo contenuto.

**L'archivio conserva le 100 schede più recenti.** Se se ne aggiunge una quando è pieno, la più vecchia ne esce; un archivio che un altro strumento ha lasciato con più schede viene ridotto alle 100 più recenti alla prima archiviazione.

**Una scheda archiviata non si recupera sulla bacheca**, perché l'archivio lì non compare. L'archiviazione è però esattamente un passo di annullamento, e nel documento la scheda sta sempre in chiaro. Dopo, la selezione passa, come all'eliminazione, alla scheda successiva della colonna; senza scheda selezionata il comando resta senza effetto.

## Cercare e filtrare le schede

Nella vista bacheca il comando di ricerca (`Ctrl+F` predefinito) apre un **campo filtro** sopra le colonne invece della ricerca nel testo. Già durante la digitazione la bacheca nasconde ogni scheda il cui testo non contiene il termine cercato; le colonne restano, e il loro contatore mostra corrispondenze e totale, per esempio `1/3`. Se nessuna scheda corrisponde, lo dice un avviso sotto il campo.

Vengono esaminati il testo della scheda e le sue righe di seguito rientrate, compresi i tag e le scadenze che vi stanno; maiuscole e minuscole non contano. Il termine viene cercato come un'unica sequenza di caratteri: `verificare il preventivo` trova «Verificare il preventivo», `preventivo verificare` no. È la stessa regola del campo filtro dell'elenco delle schede di una [tela](canvas.md).

**Il documento resta invariato**, perché il filtro nasconde soltanto; agisce quindi anche in un documento non modificabile. Una scheda nascosta non resta selezionata, perché nessun tasto agisca su una scheda che non si vede. L'evidenziazione di un limite superato resta durante il filtro, perché conta tutte le schede della colonna.

`Esc` nel campo termina il filtro e mostra di nuovo tutte le schede; lo stesso vale per il passaggio a un'altra vista o a un altro documento. Se nel frattempo la bacheca si ridisegna, testo cercato e focus di immissione restano.

## Annullare

`Ctrl+Z` ritira l'ultima azione sulla bacheca, `Ctrl+Y` e `Ctrl+Maiusc+Z` la ripristinano. Ogni azione è esattamente un passo: una scheda creata, un testo modificato, un cambio di stato, un trascinamento con il suo contrassegno, una colonna eliminata con tutte le sue schede, una scadenza impostata o rimossa, un limite cambiato, una scheda archiviata. Finché è aperta l'immissione di una scheda o di un titolo di colonna, `Ctrl+Z` vale per il testo digitato lì.

Se il documento cambia nel frattempo altrove — perché lo stesso documento viene modificato accanto, per esempio —, l'azione iniziata viene annullata invece di essere scritta alla cieca; la barra di stato lo dice e la bacheca si ridisegna.

## Solo guardare

La bacheca segue la modificabilità del suo documento. Finché il documento è in semplice visualizzazione, senza la modalità di modifica attiva, la bacheca è **di sola consultazione**: nessun pulsante, nessun trascinamento, nessuna immissione, nessuna casella cliccabile, e il menu contestuale resta senza voci. Nemmeno la strada della palette dei comandi e dei menu la aggira; il mancato esito viene detto nella barra di stato e non taciuto. Guardare, selezionare, scorrere e filtrare le schede restano permessi, perché non toccano il documento; lo stesso vale per i due interruttori di visualizzazione. Il badge di scadenza qui è solo indicazione.

La modalità di modifica libera l'uso: la matita nella barra di stato, `Ctrl+E` predefinito; i dettagli li descrive la pagina [Viste e visualizzazione](views-display.md).

## Bacheca e query di attività

La bacheca e la [query di attività](tasks.md) mostrano entrambe attività e intendono cose diverse:

| Domanda | Query di attività | Bacheca Kanban |
| ------- | ----------------- | -------------- |
| Da dove vengono le righe? | da **tutti** i file dello spazio di ricerca | da **un** documento |
| Da dove viene l'ordine? | da filtro, ordinamento e raggruppamento della query | dal punto in cui la riga sta nel documento |
| Che cosa produce un riordino? | nulla: la query ricalcola | la riga si sposta nel documento |
| Qual è il risultato? | una vista sui propri file | una superficie di lavoro con un ordine proprio |

In breve: la query **raccoglie** su tutti i file e ordina secondo regole; la bacheca **dispone** a mano le righe di un documento e ricorda quella disposizione, perché sta nel testo. Le due cose non si escludono: le attività di una bacheca compaiono in una query come qualunque altra riga di attività.

## Il formato di memorizzazione

Una bacheca sta in chiaro nel suo documento. È quindi interpretabile anche senza questa applicazione, e chi apre il file in uno strumento di testo vede un elenco di attività ordinario per ogni colonna.

### Struttura

| Parte | Come compare nel documento |
| ----- | -------------------------- |
| Contrassegno | la chiave `kanban-plugin` nell'intestazione |
| Colonna | un'**intestazione** con il titolo della colonna |
| Impostazione «completato» | subito sotto l'intestazione, una riga composta da nient'altro che un **gruppo di parole in grassetto** |
| Limite | un numero tra parentesi alla fine dell'intestazione, per esempio `## In corso (3)` |
| Scheda | una **riga di attività** sotto quell'intestazione |
| Scadenza di una scheda | il marcatore di scadenza `📅` con una data e, a scelta, un'ora nella riga di attività |
| Aggiunta di una scheda | le righe **rientrate** subito sotto la sua riga di attività |
| Archivio | tutto ciò che segue una linea di separazione di tre asterischi: un'intestazione e, sotto, le schede archiviate con data e ora |
| Impostazioni | un commento privato tra marcatori `%%` a fine file |

Un esempio:

```markdown
---
kanban-plugin: board
---

## Da fare

- [ ] Verificare il preventivo #acquisti
  La domanda agli acquisti è ancora aperta
- [ ] Confermare l'appuntamento 📅 2026-10-02 14:00


## In corso (2)

- [/] Scrivere il capitolo del manuale


## Fatto

**Completato**

- [x] Raccogliere il requisito


***

## Archivio

- [x] 2026-09-01 09:15 Abbozzare il modello
```

**Il livello dell'intestazione non è fissato.** Vengono scritti due cancelletti; viene letto ogni livello, e una colonna appena creata assume il livello della prima colonna esistente. Una bacheca scritta a mano non viene quindi respinta.

**Il contrassegno di completamento è il testo in grassetto stesso**, non una parola precisa: viene riconosciuto dalla sua forma e conservato nella grafia che sta nel file. Quando l'applicazione crea essa stessa una colonna simile, scrive per prima la dicitura che già compare in quella bacheca e, in mancanza, la dicitura della lingua di interfaccia impostata.

**Le righe vuote fanno parte della forma:** una riga vuota sotto l'intestazione o sotto il contrassegno di completamento, due prima dell'intestazione successiva. Una colonna vuota senza contrassegno porta quindi tre righe vuote di seguito.

**L'archivio** sta dietro l'ultima colonna e comincia con la linea di separazione; viene riconosciuto da essa, non dalla dicitura della sua intestazione. Ogni scheda archiviata porta davanti al suo testo un'indicazione di data e ora nella forma `AAAA-MM-GG HH:mm`.

### Che cosa resta intatto

**La sezione d'archivio e il blocco delle impostazioni non vengono mostrati sulla bacheca.** Il blocco delle impostazioni non viene mai modificato, la sezione d'archivio solo archiviando una scheda; per il resto entrambi restano tali e quali nel file, e chi apre una bacheca e la richiude senza modifiche riottiene esattamente lo stesso file — comprese le terminazioni di riga, un'interruzione finale mancante e tutte le indicazioni che questa applicazione non conosce.

Un'eccezione con buona ragione: se il blocco delle impostazioni contiene l'elenco di quali colonne sono richiuse, quell'elenco si adegua quando una colonna viene creata, eliminata o spostata. Se restasse com'era, l'altro strumento avrebbe poi richiuso le colonne sbagliate. Tutto il resto del blocco rimane carattere per carattere com'era.

Viene scritto sempre e solo l'intervallo di righe che cambia davvero, mai l'intero documento. Il cursore e le piegature dell'editor restano così al loro posto.

## Compatibilità con altri strumenti

Il formato proviene da uno strumento di bacheche molto diffuso per le note in Markdown, e la compatibilità con esso è una promessa esplicita: una bacheca scritta là si apre e si modifica qui, e una bacheca modificata qui si riusa là.

**Che cosa viene letto e conservato:**

- il contrassegno di intestazione con il suo valore, qualunque esso sia,
- colonne, schede e le loro righe di seguito rientrate,
- il limite nel titolo della colonna, anche nella notazione senza spazio prima della parentesi,
- scadenze e ore nella notazione dell'altro strumento, fino alla prima modifica della loro scheda (vedi sotto),
- il contrassegno di completamento nella **sua** lingua, anche se non è quella dell'interfaccia,
- la sezione d'archivio dopo la linea di separazione, con la sua intestazione e le sue schede,
- il blocco delle impostazioni a fine file con tutte le indicazioni, anche sconosciute,
- tutto ciò che sta oltre nel file: viaggia senza modifiche.

**Che cosa cambia modificando:** una scadenza nella notazione dell'altro strumento viene riscritta nella notazione delle attività dell'applicazione alla prima modifica della sua scheda (vedi «Dati sulla scheda»). **Nell'altro strumento compare poi solo come testo** e non più come data della scheda. Tutti gli altri dati di un'attività — marcatori di data, priorità, ricorrenza, tag — restano nella loro riga e continuano ad agire dovunque altro, nella vista di lettura e nelle query di attività.

**Che cosa avviene diversamente qui:** l'archiviazione mette sempre un'indicazione di data e ora e mantiene l'archivio a 100 schede; l'altro strumento fa entrambe le cose solo se è impostato così. Le indicazioni del suo blocco delle impostazioni, come un altro formato di data o un altro limite d'archivio, la bacheca non le valuta.

## Limiti

- **Un documento porta una bacheca.** Più bacheche in un file non esistono; le colonne del documento sono le colonne dell'unica bacheca.
- **Viene convertito solo un documento vuoto.** Un documento con contenuto non viene dichiarato bacheca, perché andrebbe perso del testo; chi vuole travasare un elenco esistente crea una bacheca e vi porta il testo da sé.
- **Si sposta con il mouse.** Non esiste un gesto da tastiera per spostare schede e colonne.
- **Una scheda porta una riga.** Ciò che si modifica è il testo della riga di attività; le sue righe di seguito rientrate compaiono sulla scheda, ma si modificano nel documento e non su di essa.
- **Viene letta la notazione predefinita dell'altro strumento:** una scadenza nella forma `@{AAAA-MM-GG}` e un'ora nella forma `@@{HH:mm}`, ogni volta la prima occorrenza nella riga della scheda. Un formato impostato diversamente, una seconda occorrenza e la forma di collegamento `@[[…]]` restano testo.
- **Sulla bacheca nessuna strada riporta dall'archivio.** Le schede archiviate lì non compaiono e si recuperano solo nel documento stesso; l'archivio conserva un numero fisso delle 100 schede più recenti.
- **Non esistono impostazioni per singola bacheca.** I due interruttori di visualizzazione valgono per tutte le bacheche; il blocco delle impostazioni viene letto e conservato, ma le sue indicazioni non agiscono sulla bacheca.
- **Una scheda non è una nota.** Da una scheda non nasce una nota propria, la scheda non mostra campi o immagini di una nota collegata, e una data sulla scheda non apre una nota giornaliera.
- **Una colonna senza intestazione non esiste.** Le righe di attività che stanno prima della prima intestazione non appartengono ad alcuna colonna e quindi non compaiono sulla bacheca; nel documento restano dove sono.
