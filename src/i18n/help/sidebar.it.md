# Barra laterale

La barra laterale raggruppa i pannelli dell'app: da segnalibri, indice e area, passando per proprietà, tag e backlink, fino a calendario, promemoria e grafo del file (l'elenco completo è nella [tabella delle funzioni](functions.md)). Ogni colonna dispone di un'area della barra laterale a sinistra e a destra del contenuto. Quali pannelli sono visibili si imposta per colonna; la disposizione dei pannelli (lato, ordine, gruppi) vale per l'intera applicazione.

## Mostrare e nascondere i pannelli

Ogni pannello ha un'icona nella barra di stato e una voce nel sottomenu Visualizza → Barra laterale → Pannelli (scorciatoie predefinite nella [panoramica delle scorciatoie](shortcuts.md)); l'interruttore agisce sulla colonna attiva. Entrambi i luoghi presentano gli stessi pannelli nello stesso ordine; l'ordine si può riordinare liberamente in Impostazioni → Ordine dei pannelli e agisce contemporaneamente sul menu e sulla barra di stato. I contenuti dei singoli pannelli sono descritti nella [tabella delle funzioni](functions.md) e nelle pagine [Collegamenti](linking.md) (tag, backlink, link in uscita), [Frontmatter e proprietà](frontmatter.md), [Note del documento](notes.md) (pannello Note) e [Applicazioni, finestre e aree](apps-windows.md) (pannello dell'area).

## Comprimere ed espandere le colonne

Oltre ai singoli interruttori dei pannelli, un'intera colonna della barra laterale può essere compressa ed espansa in una volta quando serve brevemente un po' più di spazio per il testo. La compressione pone uno stato proprio sopra la visibilità dei pannelli senza modificarla; l'espansione ripristina esattamente lo stato precedente.

- **Icona di intestazione:** Nell'intestazione superiore di ogni colonna, sul bordo interno, dove la colonna incontra il testo, si trova un'icona della barra laterale. Un clic comprime la colonna. L'icona è allineata a destra nella colonna sinistra e, speculare, a sinistra nella colonna destra; compare sia nell'intestazione di sezione sia nella barra delle schede di un gruppo, e nella resa in testo come in simbolo delle intestazioni.
- **Compressa:** Una colonna compressa resta visibile come una stretta striscia sul bordo della finestra. Al passaggio del mouse vi compare l'icona; un clic espande di nuovo la colonna. Il suggerimento passa allora da comprimere a espandere.
- **Menu e comandi:** Visualizza → Barra laterale → Comprimi la barra laterale sinistra e Visualizza → Barra laterale → Comprimi la barra laterale destra commutano gli stessi stati. Entrambi i comandi sono anche nella palette dei comandi e possono ricevere una scorciatoia in Impostazioni → Scorciatoie da tastiera; non esiste un'assegnazione predefinita.

Nella vista divisa, ogni colonna dell'editor commuta le proprie due barre laterali in modo autonomo; la compressione agisce solo su quella colonna. L'ultimo stato impostato viene salvato globalmente e vale ancora al successivo avvio.

Una colonna senza pannello visibile resta invariata e scompare del tutto come prima, senza striscia né icona. La modalità focus nasconde inoltre la barra laterale in modo puramente visivo e lascia intatto lo stato di compressione; all'uscita, quello stato vale ancora.

## Disposizione: lato e ordine

Ogni pannello può stare a sinistra o a destra, l'ordine è a scelta libera. Due strade portano alla disposizione desiderata:

- **Trascinamento:** trascinare il titolo del pannello (nei gruppi, la scheda). Il terzo superiore o inferiore di un pannello lo ordina prima o dopo, il centro forma un gruppo di schede, l'area libera di una barra laterale vi aggiunge il pannello — su un lato vuoto compare una stretta striscia di rilascio durante il trascinamento. Le zone di destinazione sono evidenziate a colori; Esc annulla. Le modifiche hanno effetto immediato, anche nelle altre finestre.
- **Impostazioni → Barra laterale:** entrambi i lati come elenchi con azioni per spostare (su, giù, cambiare lato), raggruppare e separare, più un ripristino della disposizione predefinita. Le modifiche hanno effetto con Applica o OK.

La **disposizione predefinita** distribuisce i pannelli su entrambi i lati e li raggruppa in gruppi di schede tematici: a sinistra i pannelli di accesso, struttura e agenda, a destra le note e i pannelli di metadati e collegamenti. Vale finché non è impostata una disposizione personalizzata; «Ripristina la disposizione predefinita» ripristina esattamente questa distribuzione.

## Varianti

La disposizione attuale può essere salvata come **variante denominata** — con la visibilità dei pannelli di entrambe le colonne, cioè l'intera struttura della barra laterale. È possibile un numero illimitato di varianti, ad esempio una per il lavoro concettuale e una per il lavoro quotidiano.

- **Salva:** Visualizza → Barra laterale → Disposizioni della barra laterale → «Salva la disposizione attuale…», oppure il pulsante omonimo in Impostazioni → Barra laterale, sezione Varianti. Il nome si assegna nella finestra di dialogo; salvare con un nome esistente aggiorna quella variante.
- **Applica:** con un clic nel sottomenu Visualizza → Barra laterale → Disposizioni della barra laterale, tramite la finestra di selezione del comando «Applica variante della barra laterale», oppure negli elenchi delle varianti delle impostazioni. Applicare sostituisce immediatamente la disposizione attuale; le riorganizzazioni successive non modificano la variante — «Sovrascrivi» riporta esplicitamente la disposizione attuale in una variante esistente.
- **Gestisci:** Impostazioni → Barra laterale, sezione Varianti elenca le varianti globali con Applica, Rinomina, Sovrascrivi ed Elimina.

Le **varianti di area** appartengono a un'area: si trovano nel file dell'area, si spostano con la cartella dell'area e compaiono solo quando l'area è aperta, separate nel menu in un gruppo proprio con il nome dell'area. La loro gestione, con un pulsante di salvataggio dedicato, si trova nella sezione delle impostazioni «Varianti della barra laterale» del gruppo «Area corrente»; al salvataggio tramite il menu o il comando, un'opzione nella finestra di dialogo sceglie la destinazione (globale o area). Sono ammessi nomi uguali in entrambi i gruppi. La voce «Disposizione predefinita» nel sottomenu ripristina in qualsiasi momento la distribuzione fornita.

Le varianti sono indipendenti dagli spazi di lavoro: uno spazio di lavoro ricorda le finestre e le schede, una variante della barra laterale solo la struttura della barra laterale.

## Gruppi di schede

Più pannelli nella stessa posizione condividono lo spazio come gruppo di schede: una barra delle schede sostituisce i titoli dei pannelli e solo il pannello attivo è visibile. Mostrare un pannello raggruppato attiva la sua scheda; la scheda attiva viene ricordata.

## Larghezze

Ogni lato ha una propria larghezza (da 180 a 500 pixel), regolabile tramite il divisore tra barra laterale e contenuto. La larghezza vale per lato per entrambe le colonne e resta salvata.

## Altezze dei pannelli

Quando più pannelli sono impilati su un lato della barra laterale, una maniglia di trascinamento si trova tra ogni coppia di pannelli. Regola l'altezza del pannello soprastante: trascinare la maniglia verso l'alto o verso il basso con il mouse. Le altezze impostate restano salvate e vengono ripristinate all'avvio; un doppio clic sulla maniglia ripristina l'altezza automatica.

Il pannello più in basso di un lato non ha maniglia, perché dietro di esso non ne segue nessun altro. Segue quindi sempre l'altezza del proprio contenuto e occupa lo spazio che i pannelli soprastanti gli lasciano. Una barra di scorrimento vi compare solo se quello spazio non basta al contenuto.

Se le altezze impostate richiedono complessivamente più spazio di quello disponibile sul lato, l'intera colonna diventa scorrevole in verticale. Nessun pannello scompare: ognuno mantiene almeno la propria intestazione e quelli in basso restano raggiungibili scorrendo. Per tornare allo stato precedente basta rimpicciolire il pannello ingrandito troppo oppure ridargli l'altezza automatica con un doppio clic sulla sua maniglia.

## Altezza per pannello o per gruppo

Da che cosa dipende l'altezza di un blocco è impostabile (Impostazioni → Barra laterale).

Con **Altezza per pannello** ogni pannello mantiene la propria altezza. In un gruppo di schede vale l'altezza del pannello mostrato; scorrendolo cambia quindi l'altezza del blocco e i pannelli sottostanti si spostano con esso. È l'impostazione predefinita.

Con **Altezza fissa per gruppo** un gruppo di schede mantiene la sua altezza al cambio di scheda. Tutti i pannelli del gruppo appaiono della stessa altezza e ciò che sta sotto resta al suo posto. La maniglia sotto il gruppo regola allora la loro altezza comune; un doppio clic ripristina l'altezza automatica dell'intero gruppo.

I pannelli singoli si comportano allo stesso modo in entrambi i casi. Le altezze delle due impostazioni sono memorizzate separatamente: tornando indietro si ritrovano invariate le altezze di pannello precedenti.

## Intestazioni come simbolo

Le intestazioni dei pannelli possono passare dal testo al simbolo del rispettivo pannello (Impostazioni → Barra laterale). Il cambio vale allo stesso modo per le intestazioni di sezione e per le schede dei pannelli raggruppati; il nome del pannello resta disponibile come suggerimento e per gli screen reader. Come la disposizione, l'interruttore ha effetto con Applica o OK.
