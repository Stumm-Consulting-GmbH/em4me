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

La funzione appartiene alle [estensioni interne](extensions.md) («Vista bacheca (Kanban)»). Se è disattivata, la modalità di vista viene meno, i comandi per scheda, colonna e bacheca spariscono, e con essi il sottomenu **Bacheca Kanban** del menu **Visualizza**, che non resta vuoto, e la sezione **Bacheca Kanban** delle impostazioni. Il documento rimane leggibile tale e quale; nello stato disattivato non si scrive mai, e colonne e schede restano nel testo.

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
| Impostare o cambiare la scadenza | clic sul badge di scadenza, se la data non porta alla voce di diario | — | **Imposta data…** | — |
| Rimuovere la scadenza | — | — | **Rimuovi data** | — |
| Creare una nota dalla scheda | — | — | **Crea nota dalla scheda…** | **Crea nota dalla scheda…** |
| Aprire la destinazione di un collegamento | clic sul collegamento nel testo della scheda | — | — | — |
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

**Impostare e rimuovere la scadenza.** Il menu contestuale di una scheda offre **Imposta data…** e, non appena la scheda porta una scadenza, **Rimuovi data**; anche un clic sul badge di scadenza porta a impostarla, a meno che la data porti alla voce di diario del giorno (vedi «Collegamenti e data sulla scheda»). Si sceglie nel selettore di data delle attività, a scelta con l'ora e con la scadenza esistente già indicata. La scadenza viene scritta nella riga della scheda nella notazione delle attività dell'applicazione:

```markdown
- [ ] Inviare il preventivo 📅 2026-10-02 14:00
```

Compare così anche nella vista di lettura e nelle query di attività. Ogni impostazione e ogni rimozione è un passo di annullamento; se il documento cambia mentre il selettore di data è aperto, la scelta viene scartata e la barra di stato lo dice.

**Visualizzazione relativa.** Con l'interruttore **Visualizza → Bacheca Kanban → Mostra date relative** le date di scadenza, pianificata e di inizio si leggono a partire da oggi: «oggi», «domani», «tra 3 giorni», «2 giorni fa», nella lingua dell'interfaccia e con l'ora aggiunta. La data esatta sta allora nel suggerimento del badge. Le date di creazione, di completamento e di annullamento restano assolute, perché registrano quando è successo qualcosa. L'interruttore è spento come predefinito, imposta il valore predefinito per tutte le bacheche di tutte le finestre e non cambia nulla nel documento; una singola bacheca può sostituirlo per sé (vedi «Impostazioni della bacheca»).

**Scadenze nella notazione dell'altro strumento.** Lo strumento di bacheche da cui proviene il formato scrive una scadenza come `@{…}` e un'ora come `@@{…}` nella riga della scheda. La bacheca legge entrambe e le mostra come badge di scadenza con bordo tratteggiato; il suo suggerimento ne indica la provenienza. **Alla prima modifica della scheda una tale scadenza viene riscritta nella notazione delle attività**, sia confermando un testo di scheda modificato sia impostando o rimuovendo la scadenza. La prima riga diventa la seconda:

```markdown
- [ ] Inviare il preventivo @{2026-10-02} @@{14:00}
- [ ] Inviare il preventivo 📅 2026-10-02 14:00
```

**Questo ha un prezzo:** nell'altro strumento la scadenza riscritta compare poi solo come testo dell'attività e non più come data della scheda. Chi tiene una bacheca in entrambi gli strumenti dovrebbe saperlo prima di modificare qui una tale scheda. Senza modifica non viene riscritto nulla: aprire, cambiare lo stato, spostare e archiviare lasciano la riga com'è. Una scadenza in questa notazione che non si lascia leggere — una data che non esiste, oppure un'ora senza data — resta nel testo della scheda e compare in più come badge non valido, il cui suggerimento ne indica il motivo. Un [valore di calendario](custom-calendars.md) dell'applicazione nella stessa forma tra graffe non è una tale scadenza e resta intatto.

## Tag in fondo alla scheda

Sulla scheda i tag stanno dapprima dove sono scritti: nel testo della scheda, renderizzati come nella vista di lettura. Con l'interruttore **Visualizza → Bacheca Kanban → Tag in fondo alla scheda** lasciano il testo mostrato e stanno raccolti in una riga propria in fondo alla scheda — anche i tag delle righe di seguito rientrate, ciascuno una volta e nell'ordine in cui compare. L'interruttore è spento come predefinito, imposta il valore predefinito per tutte le bacheche di tutte le finestre e non cambia nulla nel documento: i tag restano nella riga in cui stanno. Una singola bacheca può sostituirlo per sé.

Un clic su un tag della scheda — in fondo come nel testo — filtra la barra laterale dei tag su di esso, come nella vista di lettura; selezione e modifica della scheda non ne sono toccate. Mentre una scheda viene modificata, la sua riga dei tag è nascosta, perché l'immissione mostra il testo grezzo con i tag. I due interruttori di visualizzazione sono selezionabili solo nella vista bacheca aperta.

## Limite per colonna

Una colonna può portare un **limite**: il numero di schede che deve contenere al massimo. Nel documento sta tra parentesi alla fine del titolo della colonna, per esempio `## In corso (3)`; sulla bacheca non compare nel titolo, ma nel contatore: `2/3`.

Si imposta e si modifica con **Imposta il limite…** nel menu contestuale della testa di colonna. L'immissione compare al posto del contatore e, come un titolo di colonna, si conferma con `Invio` o un clic accanto e si annulla con `Esc`. Un'immissione vuota o `0` rimuove il limite, così come la voce **Rimuovi il limite**, che il menu offre non appena ne è impostato uno.

**Il limite non blocca.** Se la colonna porta più schede di quante ne preveda, il suo contatore viene evidenziato e il suo suggerimento dice «limite superato»; si possono comunque trascinarvi e crearvi schede. La bacheca mostra ciò che è e lascia a voi la decisione. Un `(0)` scritto a mano non vale come limite e resta parte del titolo.

## Archivio

**Archivia la scheda** nel menu contestuale di una scheda, oppure il comando **Archivia scheda della bacheca** per la scheda selezionata, toglie la scheda con le sue righe di seguito rientrate dalla sua colonna e la scrive alla fine della **sezione d'archivio** dello stesso documento. Davanti al suo testo si pone un'indicazione di data e ora, finché vale l'impostazione **Archivia con data e ora**, come da predefinito; il suo stato e i suoi altri dati restano come sono:

```markdown
***

## Archivio

- [x] 2026-09-23 14:05 Raccogliere il requisito
```

Se la sezione manca, nasce dietro l'ultima colonna, con l'intestazione che anche l'altro strumento scrive nella lingua dell'interfaccia; una sezione esistente viene proseguita con la sua intestazione e il suo contenuto.

**L'archivio conserva come predefinito le 100 schede più recenti.** Se se ne aggiunge una quando è pieno, la più vecchia ne esce; un archivio che un altro strumento ha lasciato con più schede viene ridotto alle più recenti alla prima archiviazione. Il numero è impostabile, e `0` significa illimitato (vedi «Impostazioni della bacheca»).

**Una scheda archiviata non si recupera sulla bacheca**, perché l'archivio lì non compare. L'archiviazione è però esattamente un passo di annullamento, e nel documento la scheda sta sempre in chiaro. Dopo, la selezione passa, come all'eliminazione, alla scheda successiva della colonna; senza scheda selezionata il comando resta senza effetto.

## Cercare e filtrare le schede

Nella vista bacheca il comando di ricerca (`Ctrl+F` predefinito) apre un **campo filtro** sopra le colonne invece della ricerca nel testo. Già durante la digitazione la bacheca nasconde ogni scheda il cui testo non contiene il termine cercato; le colonne restano, e il loro contatore mostra corrispondenze e totale, per esempio `1/3`. Se nessuna scheda corrisponde, lo dice un avviso sotto il campo.

Vengono esaminati il testo della scheda e le sue righe di seguito rientrate, compresi i tag e le scadenze che vi stanno; maiuscole e minuscole non contano. Il termine viene cercato come un'unica sequenza di caratteri: `verificare il preventivo` trova «Verificare il preventivo», `preventivo verificare` no. È la stessa regola del campo filtro dell'elenco delle schede di una [tela](canvas.md).

**Il documento resta invariato**, perché il filtro nasconde soltanto; agisce quindi anche in un documento non modificabile. Una scheda nascosta non resta selezionata, perché nessun tasto agisca su una scheda che non si vede. L'evidenziazione di un limite superato resta durante il filtro, perché conta tutte le schede della colonna.

`Esc` nel campo termina il filtro e mostra di nuovo tutte le schede; lo stesso vale per il passaggio a un'altra vista o a un altro documento. Se nel frattempo la bacheca si ridisegna, testo cercato e focus di immissione restano.

## Impostazioni della bacheca

Il comportamento della bacheca si imposta su due livelli: come **valore predefinito** per tutte le bacheche e **per singola bacheca** con un valore proprio. Un valore proprio prevale sul predefinito; una bacheca senza valori propri segue in tutto i valori predefiniti.

**I valori predefiniti** stanno in **File → Impostazioni… → Bacheca Kanban**, nel blocco **Estensioni (interne)**:

| Impostazione | predefinito |
| ------------ | ----------- |
| **Tag a piè di scheda** | disattivo |
| **Mostra le scadenze in forma relativa** | disattivo |
| **Archivia con data e ora** | attivo |
| **Limite dell’archivio in schede (0 = illimitato)** | 100 |
| **La data porta alla voce di diario del giorno** | disattivo |

Le due spunte del menu **Visualizza → Bacheca Kanban** mostrano e impostano gli stessi valori predefiniti delle prime due righe. Un valore predefinito non scrive mai in un documento.

**Per singola bacheca**, **Impostazioni di questa bacheca…** apre un dialogo — nel menu **Visualizza → Bacheca Kanban**, nel menu contestuale di una testa di colonna e nella palette dei comandi. La superficie libera della bacheca non ha un menu contestuale proprio; la voce sta quindi sulla testa di colonna.

| Impostazione | Scelta nel dialogo | «come predefinito» significa |
| ------------ | ------------------ | ---------------------------- |
| i quattro interruttori della tabella sopra | **come predefinito (attivo)** o **come predefinito (disattivo)**, **attivo**, **disattivo** | il valore della pagina delle impostazioni, indicato tra parentesi |
| **Limite dell’archivio (schede)** | **come predefinito (…)** o **valore proprio** con un numero | il limite della pagina delle impostazioni |
| **Cartella delle nuove note** | **come predefinito (cartella della bacheca)** o **valore proprio** tramite **Scegli cartella…** | la cartella in cui si trova la bacheca |
| **Modello delle nuove note** | **come predefinito (scelta alla creazione)** o **valore proprio** tramite **Scegli modello…** | regola di cartella o scelta alla creazione |
| **Dati della nota collegata** | **come predefinito (nessun dato)** o **valore proprio** con una riga per dato | le schede non mostrano dati |

La scelta stessa mostra da dove viene un valore: **come predefinito** segue la pagina delle impostazioni e si adegua quando questa cambia; tutto il resto vale solo per questa bacheca. Si ripristina scegliendo di nuovo **come predefinito**. Un limite proprio di `0` o meno significa illimitato.

Per i dati della nota collegata ogni riga porta la **Chiave nell’intestazione del documento**, un **Nome visualizzato (facoltativo)** e la casella **Nascondi nome**; **Rimuovi** toglie la riga, **Aggiungi dato** ne aggiunge una. Una riga senza chiave viene scartata con **Applica**.

La cartella di destinazione si sceglie con il dialogo di cartella dell'applicazione. Deve trovarsi nell'area aperta — altrimenti un avviso dice «La cartella si trova al di fuori dell’area.» — e viene salvata relativa alla sua radice, la radice stessa come `/`; senza area aperta, relativa alla cartella della bacheca. Il modello viene dalla selezione dei modelli dell'applicazione e viene salvato con il suo percorso nella cartella dei modelli.

**Applica** scrive soltanto le impostazioni modificate nel blocco delle impostazioni alla fine del documento della bacheca, come **un** passo di annullamento; se il blocco manca, nasce in quel momento. **Annulla**, `Esc` e un clic accanto al dialogo non cambiano nulla. L'effetto è subito visibile, senza riaprire il documento. Il dialogo presuppone la vista bacheca aperta e un documento modificabile; se il documento è cambiato mentre il dialogo era aperto, la conferma viene scartata e la barra di stato lo dice. Se il blocco non si lascia leggere, la bacheca non scrive nulla e dice: «Il blocco delle impostazioni alla fine della bacheca non è leggibile: le impostazioni non sono state scritte.»

## Nota da una scheda

**Crea nota dalla scheda…** fa di una scheda una nota propria, nel menu contestuale della scheda oppure, per la scheda selezionata, dalla palette dei comandi. Il testo della scheda senza i suoi marcatori — tag, marcatori di attività e una scadenza nella notazione dell'altro strumento — diventa il nome della nota, e sulla scheda il collegamento a essa prende il posto del testo. I marcatori restano nel loro ordine, e così le righe di seguito rientrate; la prima riga diventa la seconda:

```markdown
- [ ] Scrivere il preventivo #cliente 📅 2026-10-02
- [ ] [[Scrivere il preventivo]] #cliente 📅 2026-10-02
```

Un collegamento nel testo della scheda entra nel nome con il suo testo visualizzato. Le barre e i caratteri che un nome di file non può contenere diventano `_`; non nasce quindi alcuna sottopagina. Se del testo non resta nulla di utilizzabile, l'applicazione chiede il nome. Una scheda il cui testo senza marcatori è vuoto non offre la voce.

**Dove finisce la nota:** nella cartella di destinazione delle impostazioni della bacheca, altrimenti nella cartella della bacheca. Se la cartella impostata non esiste, un avviso lo dice e il dialogo di cartella ne fa scegliere un'altra; una cartella mancante non viene mai creata.

**Se il nome esiste già**, non si sovrascrive mai. L'applicazione chiede «Esiste già un documento «Nome». Come si desidera procedere?» e offre **Scegli un altro nome…** — la richiesta del nome, con il nome già indicato — e **Collega al documento esistente**: allora non nasce alcun file, la scheda riceve il collegamento al documento esistente, e questo non viene aperto. `Esc` interrompe.

**Quale modello vale**, in quest'ordine:

1. il modello delle impostazioni della bacheca; se non si trova, un avviso lo dice e segue la selezione;
2. altrimenti la [regola di cartella](templates.md) della cartella di destinazione;
3. altrimenti la selezione dei modelli con **Nessun modello (nota vuota)** al primo posto.

Se non sono configurati modelli o l'estensione «Modelli» è disattivata, nasce senza selezione una nota vuota. Un modello scelto viene compilato come con **Nuovo file da modello…**, con il nome della nota come titolo.

**Dopo**, l'applicazione crea il file, sostituisce il testo della scheda e apre la nuova nota come documento a sé; la bacheca resta aperta accanto. Una scadenza nella notazione dell'altro strumento viene riscritta come quando si modifica la scheda. Se la creazione non riesce, la scheda resta invariata. Se la bacheca è cambiata mentre i dialoghi erano aperti, anche la scheda resta invariata, ma la nota è creata e aperta, e un avviso dice entrambe le cose.

**L'annullamento** ripristina il testo della scheda in un solo passo; la nota creata resta come file.

## Dati della nota collegata

Se una scheda porta un collegamento a una nota, può mostrare dati dalla sua **intestazione del documento** — per esempio stato, responsabili o un'immagine di copertina. Quali, lo stabilisce l'impostazione **Dati della nota collegata** della bacheca; come predefinito una scheda non ne mostra.

**Quale collegamento vale:** il primo collegamento wiki con una destinazione, nella riga della scheda o nelle sue righe di seguito. Un semplice collegamento a una sezione come `[[#Sezione]]` e l'incorporamento di un'immagine non contano; l'incorporamento di un documento conta.

**Come compaiono i dati:** come righe «Nome: valore» sotto il testo della scheda, prima di badge e tag. Il nome è il nome visualizzato dell'impostazione, altrimenti la chiave; con **Nascondi nome** compare solo il valore. Compaiono solo chiavi con un valore, nell'ordine dell'impostazione. Un elenco viene unito con virgole. Un dato è limitato a due righe; il valore completo sta nel suggerimento.

**Immagini:** se un valore nel suo insieme è un percorso con estensione d'immagine o un collegamento come `[[immagine.png]]` o `![[immagine.png|200]]`, al suo posto compare l'immagine alla larghezza della scheda e con altezza limitata. Viene cercata relativamente alla nota collegata, all'interno dell'area aperta, senza area nella cartella della nota e al di sotto. Se l'immagine manca, il dato viene omesso; un indirizzo web non diventa mai un'immagine.

I dati vengono solo letti, mai scritti, e le schede compaiono subito — i dati seguono non appena sono stati letti. **Aggiornati** lo sono al successivo ridisegno della bacheca: dopo un cambio di vista, una modifica della bacheca o il ritorno al suo documento. Se la nota viene modificata mentre la bacheca resta visibile accanto, lo stato nuovo compare solo al ridisegno successivo.

## Collegamenti e data sulla scheda

**Un collegamento nel testo della scheda apre la sua destinazione**, come un clic nella vista di lettura: un collegamento wiki con e senza testo visualizzato, un collegamento a una destinazione ancora mancante, un normale collegamento Markdown e un indirizzo web si comportano come lì. Il clic non seleziona la scheda e agisce anche in un documento non modificabile; un'immissione aperta viene prima confermata. Un doppio clic su un collegamento non apre la modifica — si modifica con un doppio clic accanto al collegamento, con `Invio`, `F2` o dal menu contestuale.

**La data porta alla voce di diario del giorno** se per la bacheca vale l'impostazione **La data porta alla voce di diario del giorno** (disattivata come predefinito) e l'area aperta ha almeno un [diario](journals.md) con granularità «Giorno». Allora il badge di scadenza è sottolineato, il puntatore diventa una mano e il suggerimento dice «Apri la voce di diario di questo giorno». Un clic apre la voce di quel giorno e la crea se non esiste ancora — come **Voce di diario di oggi** per quella di oggi; se ci sono più diari di questo tipo, viene chiesto quale. L'ora non ha importanza. Questo vale anche per una scadenza nella notazione dell'altro strumento e in un documento non modificabile, perché la bacheca non cambia nulla. La scadenza si cambia allora con **Imposta data…** nel menu contestuale della scheda.

Senza area aperta o senza diario con granularità «Giorno» il badge resta quello che era: il clic apre il selettore di data, e non compare alcun avviso. Lo stesso se l'impostazione è disattivata.

## Annullare

`Ctrl+Z` ritira l'ultima azione sulla bacheca, `Ctrl+Y` e `Ctrl+Maiusc+Z` la ripristinano. Ogni azione è esattamente un passo: una scheda creata, un testo modificato, un cambio di stato, un trascinamento con il suo contrassegno, una colonna eliminata con tutte le sue schede, una scadenza impostata o rimossa, un limite cambiato, una scheda archiviata, una conferma nel dialogo **Impostazioni di questa bacheca…**, la sostituzione del testo della scheda con il collegamento a una nota creata — il cui file resta. Finché è aperta l'immissione di una scheda o di un titolo di colonna, `Ctrl+Z` vale per il testo digitato lì.

Se il documento cambia nel frattempo altrove — perché lo stesso documento viene modificato accanto, per esempio —, l'azione iniziata viene annullata invece di essere scritta alla cieca; la barra di stato lo dice e la bacheca si ridisegna.

## Solo guardare

La bacheca segue la modificabilità del suo documento. Finché il documento è in semplice visualizzazione, senza la modalità di modifica attiva, la bacheca è **di sola consultazione**: nessun pulsante, nessun trascinamento, nessuna immissione, nessuna casella cliccabile, e il menu contestuale resta senza voci. Nemmeno la strada della palette dei comandi e dei menu la aggira; il mancato esito viene detto nella barra di stato e non taciuto. Guardare, selezionare, scorrere e filtrare le schede restano permessi, perché non toccano il documento; lo stesso vale per i due interruttori di visualizzazione, il clic su un collegamento e il clic su una data che porta alla voce di diario del giorno. Per il resto il badge di scadenza qui è solo indicazione. **Impostazioni di questa bacheca…** e **Crea nota dalla scheda…** scrivono nel documento e quindi non sono disponibili.

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

**La sezione d'archivio e il blocco delle impostazioni non vengono mostrati sulla bacheca.** Il blocco delle impostazioni viene modificato solo tramite il dialogo **Impostazioni di questa bacheca…**, la sezione d'archivio solo archiviando una scheda; per il resto entrambi restano tali e quali nel file, e chi apre una bacheca e la richiude senza modifiche riottiene esattamente lo stesso file — comprese le terminazioni di riga, un'interruzione finale mancante e tutte le indicazioni che questa applicazione non conosce.

Un'eccezione con buona ragione: se il blocco delle impostazioni contiene l'elenco di quali colonne sono richiuse, quell'elenco si adegua quando una colonna viene creata, eliminata o spostata. Se restasse com'era, l'altro strumento avrebbe poi richiuso le colonne sbagliate. Tutto il resto del blocco rimane carattere per carattere com'era, finché non si modifica un'impostazione della bacheca — e anche allora cambia solo la sua voce (vedi «Compatibilità con altri strumenti»).

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

**Che cosa avviene diversamente qui:** come predefinito l'archiviazione mette un'indicazione di data e ora e mantiene l'archivio a 100 schede; l'altro strumento fa entrambe le cose solo se è impostato così. Per i dati della nota collegata vale qui il **primo** collegamento di una scheda, nell'altro strumento l'ultimo; una scheda con più collegamenti mostra quindi nei due strumenti i dati di note diverse.

### Le impostazioni nel blocco delle impostazioni

Le impostazioni di una bacheca stanno nel blocco delle impostazioni a fine file, nella notazione dell'altro strumento; entrambi gli strumenti leggono e scrivono le stesse voci:

| Impostazione qui | Voce nel blocco |
| ---------------- | --------------- |
| Tag a piè di scheda | `move-tags` |
| Mostra le scadenze in forma relativa | `show-relative-date` |
| Archivia con data e ora | `archive-with-date` |
| Limite dell’archivio | `max-archive-size` (`-1` significa illimitato) |
| La data porta alla voce di diario del giorno | `link-date-to-daily-note` |
| Cartella delle nuove note | `new-note-folder` |
| Modello delle nuove note | `new-note-template` |
| Dati della nota collegata | `metadata-keys` |

Un esempio della riga nel blocco, con un'indicazione propria dell'altro strumento in testa:

```json
{"kanban-plugin":"board","move-tags":true,"max-archive-size":-1}
```

**Si scrive per voce.** Se il dialogo cambia un'impostazione, cambia soltanto la sua voce; ordine, grafia e tutte le altre indicazioni del blocco restano carattere per carattere, anche quelle che questa applicazione non conosce, come un formato di data o colori per i tag. Una voce nuova va alla fine della riga. **come predefinito** rimuove la voce; un blocco che resta così vuoto rimane come `{}`. Se il blocco manca, nasce alla prima conferma a fine file. Una voce il cui valore non si addice all'impostazione vale come non impostata; si applica il valore predefinito. Un limite proprio di `0` o meno viene scritto come `-1`, il valore che l'altro strumento conosce per illimitato.

## Limiti

- **Un documento porta una bacheca.** Più bacheche in un file non esistono; le colonne del documento sono le colonne dell'unica bacheca.
- **Viene convertito solo un documento vuoto.** Un documento con contenuto non viene dichiarato bacheca, perché andrebbe perso del testo; chi vuole travasare un elenco esistente crea una bacheca e vi porta il testo da sé.
- **Si sposta con il mouse.** Non esiste un gesto da tastiera per spostare schede e colonne.
- **Una scheda porta una riga.** Ciò che si modifica è il testo della riga di attività; le sue righe di seguito rientrate compaiono sulla scheda, ma si modificano nel documento e non su di essa.
- **Viene letta la notazione predefinita dell'altro strumento:** una scadenza nella forma `@{AAAA-MM-GG}` e un'ora nella forma `@@{HH:mm}`, ogni volta la prima occorrenza nella riga della scheda. Un formato impostato diversamente, una seconda occorrenza e la forma di collegamento `@[[…]]` restano testo.
- **Sulla bacheca nessuna strada riporta dall'archivio.** Le schede archiviate lì non compaiono e si recuperano solo nel documento stesso; come predefinito l'archivio conserva le 100 schede più recenti.
- **I dati della nota collegata sono testo.** Il Markdown in un valore non viene reso; come immagine compare solo un valore che nel suo insieme punta a un file d'immagine, non un elenco di immagini e non la notazione d'immagine `![](…)`. Ricerca e filtro della bacheca non includono i dati.
- **I dati non seguono il collegamento ovunque.** Un collegamento verso un'area collegata e una nota che si troverebbe solo tramite il suo alias restano senza dati; se ci sono più note con lo stesso nome, vale la prima. I dati si aggiornano al successivo ridisegno della bacheca, non al salvataggio della nota.
- **La data porta solo a un diario con granularità «Giorno».** Senza area aperta o senza un tale diario la data resta un badge ordinario, il cui clic apre il selettore di data.
- **Il nome di una nota creata è un nome di file.** Le barre diventano trattini bassi, non nasce alcuna sottopagina; un marcatore di scadenza in mezzo al testo, seguito da altro testo, vale come testo e sta anch'esso nel nome.
- **Una colonna senza intestazione non esiste.** Le righe di attività che stanno prima della prima intestazione non appartengono ad alcuna colonna e quindi non compaiono sulla bacheca; nel documento restano dove sono.
