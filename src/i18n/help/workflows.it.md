# Workflow

Un **workflow** mette per iscritto operazioni ricorrenti come sequenza fissa di passi: creare, rinominare, spostare e copiare file e cartelle, accodare o inserire testo, impostare proprietà nell'intestazione, eseguire comandi, macro e altri workflow. Un workflow è un **normale file Markdown**; ciò che fa sta in un blocco di comandi fissi, una riga per passo. Il file resta così leggibile senza l'applicazione, si può condividere e si modifica come qualsiasi altro documento.

Un workflow si avvia **a mano**: dal menu, dalla palette dei comandi, con una scorciatoia da tastiera, un pulsante sopra il blocco o il menu contestuale del pannello dell'area. **Prima che venga eseguito il primo passo, l'applicazione controlla l'intero workflow**; un errore compare sopra il blocco con riga e motivo, e non viene eseguito nulla.

## L'estensione «Workflow»

La funzione fa parte delle [estensioni integrate](extensions.md) («Workflow», gruppo **Strumenti**) ed è attiva nella modalità di lavoro **Completa**, disattivata nelle modalità **Principiante** e **Avanzata**. Se è disattivata, un blocco `workflow` è un normale blocco di codice senza evidenziazione, senza indicazione del controllo e senza pulsante; non ci sono comandi dei workflow, né il sottomenu **Workflow**, né la pagina **Esecuzioni dei workflow**, né le sezioni delle impostazioni **Workflow**. Un file di workflow è allora un normale documento. Non si perde nulla: file, stati di esecuzione e la cartella dei workflow impostata restano invariati quando la si riattiva.

## Struttura di un file di workflow

Un file è un workflow se la sua intestazione porta il contrassegno `workflow: true`. Ciò che il workflow fa sta in **esattamente un** blocco di codice con il linguaggio `workflow`. Il resto del testo è la descrizione per le persone; le sue sezioni possono servire da fonte di un contenuto (sezione «Fonti di un contenuto» più sotto).

````markdown
---
workflow: true
name: Riepilogo settimanale
description: Crea il riepilogo della settimana e lo annota nel registro.
---

# Riepilogo settimanale

```workflow
# Creare il riepilogo dal modello e aprirlo
create "Riepiloghi/{{date}} Settimana.md" from-template "Riepilogo.md"
open "Riepiloghi/{{date}} Settimana.md"
insert "Registro.md" under "Riepiloghi" from-section "Voce"
notify "Riepilogo creato"
```

## Voce

- Riepilogo settimanale creato.
````

L'intestazione porta solo contrassegno, nome, attivatore e descrizione:

| Chiave | Obbligatoria | Significato |
| --- | --- | --- |
| `workflow` | sì | `true` contrassegna il file come workflow. |
| `name` | no | Nome del workflow nel menu, nella palette dei comandi e negli avvisi; senza indicazione vale il nome del file senza estensione. |
| `trigger` | no | Attivatore; senza indicazione vale `manual`, l'avvio a mano. |
| `description` | no | Breve descrizione; la pagina **Esecuzioni dei workflow** la mostra come suggerimento sul nome. |

Un attivatore diverso da `manual` viene indicato come «non ancora supportato», e il workflow non viene eseguito; il file resta invariato. Nemmeno un file con due o più blocchi `workflow`, o con nessuno, viene eseguito. Un blocco che contiene solo commenti è valido e non fa nulla.

## Righe di comando

Le righe del blocco seguono una forma fissa:

- **Una riga è un comando.** Le righe vuote e quelle che iniziano con `#` sono commenti. Non c'è un commento dopo un comando, né una continuazione su più righe.
- **Prima la parola chiave, poi i dati**, separati da spazi. Le parole chiave sono inglesi e scritte in minuscolo: `create`, non `Create`.
- **Percorsi e testi** stanno tra virgolette doppie diritte. Una virgoletta nel testo si scrive `\"`; ogni altra barra rovesciata resta com'è. Le virgolette tipografiche, come le inserisce un elaboratore di testi durante la copia, contano come errore.
- **Numeri e identificativi di comando** stanno senza virgolette: `wait 2`, `command view.modeSplit`.
- **Le opzioni con nome** sono una coppia di opzione e valore, come `from-template "Giorno.md"` o `under "Registro"`, oppure una sola parola come `at-start`. Seguono gli altri dati in qualsiasi ordine, al massimo una per tipo.
- **I percorsi** sono relativi alla radice dell'area in cui si avvia il workflow; il separatore è la barra `/`. Non sono ammessi percorsi assoluti né percorsi con `..`. Il percorso dopo `from-template` indica un modello ed è relativo alla [cartella dei modelli](templates.md).

```workflow
# Commento: creare la cartella di un nuovo progetto
mkdir "Progetti/{{prompt:Nome del progetto?}}/Note"
replace "{{file}}" "Stato: aperto" "Stato: \"in corso\""
insert "{{file}}" at-start from-file "Blocchi/Intestazione.md"
```

## Controllare prima di eseguire

Prima del primo passo, l'applicazione controlla l'intero file insieme a ogni workflow che esso richiama. Segnala tra l'altro:

- comandi sconosciuti e comandi di una fase successiva,
- dati mancanti, in eccesso o scritti male, opzioni sconosciute o doppie,
- percorsi fuori dall'area, percorsi e testi vuoti, nuovi nomi non validi,
- un'attesa di oltre dieci secondi,
- comandi, macro e workflow sconosciuti, e nomi portati da più macro o più workflow,
- un workflow che richiama sé stesso, anche passando per un altro, e un annidamento di oltre cinque livelli,
- segnaposto errati, modelli illeggibili e modelli disattivati.

Un rilievo ferma l'esecuzione **prima del primo passo**; un file di workflow errato non viene quindi eseguito affatto invece che in parte. Il controllo segnala tutti i rilievi insieme; la riga indicata è la riga nel documento come la conta l'editor, intestazione compresa.

Ciò che solo un passo precedente può produrre viene controllato dall'applicazione al passo stesso: se esistono un file, una sezione o un titolo. Se in quel momento manca, il passo fallisce.

## Comandi

I comandi della prima fase, ordinati secondo il loro oggetto. I percorsi sono relativi alla radice dell'area.

### File e cartelle

| Comando | Significato | Dati | Esempio |
| --- | --- | --- | --- |
| `create` | creare un file, vuoto o con contenuto | percorso; a scelta una fonte | `create "Diario/{{date}}.md" from-template "Giorno.md"` |
| `rename` | rinominare un file o una cartella | percorso, nuovo nome | `rename "Bozza.md" "Nota {{date}}.md"` |
| `move` | spostare un file o una cartella in una cartella; i collegamenti vengono aggiornati | percorso, cartella di destinazione | `move "{{file}}" "Archivio/2026"` |
| `copy` | copiare un file | percorso, destinazione | `copy "Schemi/Lista.md" "Progetti/Nuovo/Lista.md"` |
| `mkdir` | creare una cartella, anche annidata | percorso | `mkdir "Progetti/Nuovo/Note"` |
| `open` | aprire un file nella finestra o passare a esso | percorso | `open "Diario/{{date}}.md"` |
| `close` | chiudere un documento aperto | percorso | `close "{{file}}"` |

- **Destinazione esistente:** se la destinazione di `create`, `copy`, `rename` o `move` esiste già, il passo fallisce; nulla viene sovrascritto.
- **Cartella di destinazione mancante:** `create`, `copy` e `move` la creano all'interno dell'area.
- **Spostare e rinominare** seguono la stessa via del pannello dell'area: i collegamenti al file vengono aggiornati, le sottopagine e il file di accompagnamento seguono.
- `mkdir` su una cartella esistente e `close` su un documento non aperto riescono senza cambiare nulla. `close` su un documento non salvato mostra la consueta richiesta di salvataggio; «Annulla» termina l'esecuzione a quella riga.

### Contenuto e intestazione

| Comando | Significato | Dati | Esempio |
| --- | --- | --- | --- |
| `append` | mettere un contenuto alla fine di un file | percorso, fonte | `append "{{file}}" from-section "Punti aperti"` |
| `insert` | inserire un contenuto sotto un titolo o all'inizio | percorso, posizione (`under "Titolo"` o `at-start`), fonte | `insert "{{file}}" under "Registro" from-section "Voce"` |
| `replace` | sostituire ogni occorrenza di un testo | percorso, testo cercato, sostituzione | `replace "{{file}}" "PROGETTO" "{{prompt:Nome del progetto?}}"` |
| `set-property` | impostare o modificare una proprietà nell'intestazione | percorso, nome, valore | `set-property "{{file}}" stato "fatto"` |
| `remove-property` | togliere una proprietà dall'intestazione | percorso, nome | `remove-property "{{file}}" bozza` |

- `insert … under` inserisce direttamente sotto il titolo, prima del suo contenuto precedente; `insert … at-start` inserisce all'inizio del testo, dopo l'intestazione. Se il titolo manca o compare più volte, il passo fallisce.
- `replace` sostituisce ogni occorrenza, come «Sostituisci tutto» nell'editor; se non ne trova nessuna, il passo fallisce.
- `set-property` e `remove-property` lasciano le altre proprietà nel loro ordine. `remove-property` su una proprietà che non esiste riesce senza modifiche.
- **File aperti:** se il file di destinazione è aperto in una finestra e non salvato, la modifica va a quella finestra e vi compare come modifica nell'editor; il lavoro non salvato resta. Altrimenti il file viene scritto direttamente.

### Applicazione e svolgimento

| Comando | Significato | Dati | Esempio |
| --- | --- | --- | --- |
| `command` | eseguire un comando dell'applicazione | identificativo del comando | `command view.modeSplit` |
| `macro` | eseguire una macro delle impostazioni | nome della macro | `macro "Inizio giornata"` |
| `workflow` | eseguire un altro workflow della cartella dei workflow | nome del workflow | `workflow "Creare cartelle"` |
| `wait` | pausa in secondi, al massimo 10 | numero | `wait 2` |
| `notify` | mostrare un testo come avviso nella barra di stato | testo | `notify "Riepilogo settimanale creato"` |
| `stop` | terminare l'esecuzione con un testo | testo | `stop "Niente da fare"` |

- `command` prende l'identificativo fisso di un comando, come `view.modeSplit`, `view.modeLive` o `file.save`, e lo esegue nella finestra di avvio. Se in quel momento non è eseguibile, il passo fallisce. Macro e workflow non passano per `command`, ma per i propri comandi.
- `macro` e `workflow` possono essere annidati al massimo su cinque livelli. Un workflow richiamato ritorna dopo il suo ultimo passo; se vi fallisce un passo, termina l'intera esecuzione.
- `stop` termina l'intera esecuzione, anche da un workflow richiamato; la barra di stato mostra «Workflow ‹Nome› terminato alla riga N: testo».

### Fonti di un contenuto

`create`, `append` e `insert` prendono il loro contenuto da una di tre fonti. Un contenuto non sta mai come testo libero nella riga di comando.

| Opzione | Contenuto |
| --- | --- |
| `from-template "percorso"` | un modello della cartella dei modelli, compilato come quando si applica un modello; le sue finestre di inserimento compaiono prima del primo passo |
| `from-file "percorso"` | il contenuto di un altro file dell'area, alla lettera, così com'è al momento del passo |
| `from-section "Titolo"` | il contenuto di una sezione del file di workflow stesso, alla lettera |

Una sezione è il testo sotto il suo titolo fino al titolo successivo di livello uguale o superiore, senza il titolo stesso; le sottosezioni ne fanno parte. Viene trovata come con un collegamento `[[File#Titolo]]`. `from-file` e `from-section` copiano alla lettera: i segnaposto che contengono restano come sono. Solo un modello viene compilato. Se l'estensione «Modelli» è disattivata, il controllo segnala «I modelli sono disattivati» per `from-template`; i workflow senza modelli continuano a funzionare.

## Segnaposto

I segnaposto valgono in ogni dato di una riga di comando. Modelli e workflow condividono lo stesso insieme; la scrittura con scostamento e formato è descritta nella pagina [Modelli](templates.md).

| Segnaposto | Valore in una riga di comando |
| --- | --- |
| `{{date}}`, `{{time}}` | data e ora dell'avvio, anche con scostamento e formato: `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | percorso del documento attivo all'avvio, relativo alla radice dell'area, per esempio `Progetti/Piano.md` |
| `{{title}}` | titolo del documento attivo all'avvio |
| `{{folder}}` | cartella del documento attivo all'avvio, relativa alla radice dell'area |
| `{{area}}` | nome dell'area |
| `{{prompt:Domanda}}`, `{{prompt:Domanda:Predefinito}}` | finestra di inserimento |
| `{{select:Domanda:a,b,c}}` | finestra di scelta |

- **Tutte le finestre prima del primo passo:** le finestre di inserimento e di scelta dell'intera esecuzione compaiono una dopo l'altra prima che accada qualcosa, comprese quelle dei modelli usati e dei workflow richiamati. Una stessa domanda viene posta una sola volta e vale ovunque. Annullare una finestra annulla l'esecuzione, e nessun passo viene eseguito.
- **Un istante per esecuzione:** `{{date}}` e `{{time}}` hanno lo stesso valore in tutte le righe, anche a cavallo della mezzanotte.
- **In un modello usato da un workflow**, `{{title}}` e `{{folder}}` indicano come sempre il nuovo file, mentre `{{file}}` e `{{area}}` indicano il documento attivo e l'area.
- `{{cursor}}` non è ammesso in una riga di comando, `{{clipboard}}` vi sarà disponibile solo in una fase successiva. `\{{` scrive un `{{` letterale.
- Se `{{folder}}` resta vuoto nella cartella radice, `"{{folder}}/Nuovo.md"` diventa il percorso `Nuovo.md`. Senza documento attivo, `{{file}}` è vuoto, e un percorso formato con esso è un rilievo.

## Avviare un workflow

Un workflow si avvia solo in un'area aperta, e i suoi percorsi valgono in quell'area, anche se il file proviene dalla cartella dei workflow dell'intera applicazione. Le vie:

| Via | Effetto |
| --- | --- |
| **File → Workflow** | ogni workflow della cartella dei workflow come voce, le sottocartelle come sottomenu |
| **Palette dei comandi** (`Ctrl+K` predefinito) | ogni workflow della cartella dei workflow come comando con il suo nome |
| **Barra di stato e menu contestuale** | il comando di un workflow, collocato tramite il [posizionamento dei comandi](command-placement.md) |
| **Scorciatoia da tastiera** | assegnata al comando di un workflow in «Impostazioni → Scorciatoie da tastiera» |
| **Pulsante «Avvia» sopra il blocco** | nella modalità live, nella vista renderizzata e nella vista divisa, a destra nella riga d'intestazione del blocco; avvia qualsiasi file di workflow, anche fuori dalla cartella dei workflow, con lo stato presente nell'editor |
| **«Avvia» nel pannello dell'area** | in cima al menu contestuale di ogni file di workflow dell'area |
| **Pagina «Esecuzioni dei workflow»** | pulsante «Avvia» nella riga di ogni workflow |

Il pulsante sopra il blocco è disattivato finché il controllo segnala un rilievo. Per un documento mai salvato mostra «Salva prima», fuori da un'area «Avviabile solo all'interno di un'area aperta».

Il comando di un workflow riceve il suo identificativo dal percorso del file nella cartella dei workflow; due workflow con lo stesso nome in sottocartelle diverse restano così distinguibili. **Rinominare un workflow nell'applicazione o spostarlo all'interno della cartella dei workflow ne conserva le assegnazioni:** una scorciatoia da tastiera, un posto nella barra di stato, nel menu contestuale o nella barra di formattazione e un passo di macro che lo richiama lo seguono. **Al di fuori dell'applicazione**, per esempio nel gestore file, l'applicazione non si accorge della rinomina; le assegnazioni perdono allora la loro destinazione e vanno impostate di nuovo. Un workflow spostato fuori dalla cartella dei workflow non è più un comando; le sue assegnazioni restano salvate e tornano a funzionare non appena esso torna nello stesso posto.

## Svolgimento di un'esecuzione

1. L'applicazione controlla il workflow insieme ai workflow che richiama.
2. Le finestre di tutti i segnaposto compaiono una dopo l'altra.
3. I passi vengono eseguiti rigorosamente uno dopo l'altro; ciascuno attende il precedente.
4. Il primo fallimento termina l'esecuzione. La barra di stato mostra «Workflow ‹Nome› interrotto alla riga N: motivo».

I passi eseguiti restano eseguiti; non c'è un annullamento su più passi. **In ogni finestra è in esecuzione al massimo un workflow**; un secondo avvio durante un'esecuzione viene respinto con un avviso.

## Cartella dei workflow e menu

Come per i modelli, esiste una **cartella dei workflow**, impostata su due livelli in «File → Impostazioni…»:

- **Per l'intera applicazione** nella sezione **Estensioni (interne) → Workflow**.
- **Per area** nella sezione **Area corrente → Workflow** con l'interruttore «Usa la configurazione dell'area» e il pulsante «Sfoglia…». La cartella viene salvata relativa alla radice dell'area nel file dell'area e **sostituisce** completamente quella dell'applicazione.

Il sottomenu **File → Workflow** si trova subito dopo il sottomenu **Area**. Mostra i file della cartella che portano il contrassegno, in ordine alfabetico per nome a ogni livello; le sottocartelle compaiono come sottomenu, i file senza contrassegno vengono tralasciati. Dopo un separatore seguono:

- **Mostra esecuzioni dei workflow** — apre la pagina **Esecuzioni dei workflow**.
- **Nuovo workflow…** — chiede il nome, crea nella cartella dei workflow un file con intestazione, una riga di descrizione e un blocco `workflow` vuoto con due righe di commento, e lo apre. Senza cartella impostata, chiede prima la cartella e la conserva, nelle impostazioni dell'area se un'area è aperta. Non sovrascrive mai un file esistente. La voce si trova anche nella palette dei comandi.
- **Imposta cartella dei workflow…** — apre le impostazioni alla sezione **Workflow**.

Senza cartella impostata, il sottomenu mostra «Nessuna cartella dei workflow impostata», con una cartella vuota «Nessun workflow nella cartella dei workflow», con una cartella irraggiungibile «Cartella dei workflow non trovata». Il sottomenu e i comandi seguono ogni modifica nella cartella.

## Stato di esecuzione e la pagina «Esecuzioni dei workflow»

Dopo ogni esecuzione, l'applicazione registra nel **file di accompagnamento** del workflow (`.mdd`, sezione `workflow`) l'istante, il risultato, se del caso la riga interrotta e il numero di esecuzioni; il testo del file di workflow resta intatto. Lo stato di esecuzione segue il file quando viene rinominato o spostato, non quando viene copiato.

La pagina **Esecuzioni dei workflow** si apre con «Visualizza → Mostra esecuzioni dei workflow», con «File → Workflow → Mostra esecuzioni dei workflow» e dalla palette dei comandi. Elenca **tutti i workflow dell'area**, anche quelli fuori dalla cartella dei workflow, con le colonne **Workflow**, **Posizione**, **Ultima esecuzione**, **Risultato** ed **Esecuzioni** e un pulsante «Avvia» per riga. Un workflow mai eseguito compare con «mai eseguito».

| Risultato | Significato |
| --- | --- |
| riuscito | tutti i passi sono stati eseguiti |
| interrotto alla riga N: motivo | un rilievo o un fallimento ha terminato l'esecuzione |
| terminato alla riga N | il comando `stop` ha terminato l'esecuzione |
| Inserimento annullato, nessun passo eseguito | una finestra è stata annullata |

Dopo un'esecuzione in questa finestra, la pagina mostra lo stesso motivo della barra di stato. Il file di accompagnamento conserva solo la riga e il tipo di motivo; dopo un riavvio e per un'esecuzione da un'altra finestra, singoli dettagli come un nome di file compaiono perciò come «…». La pagina si aggiorna dopo ogni esecuzione; il pulsante «Aggiorna» la rilegge.

## Supporto nell'editor

- **Evidenziazione:** nelle righe di comando la parola chiave è in grassetto, il testo tra virgolette a colori e i segnaposto in corsivo, nell'editor come nella vista di lettura.
- **Indicazione del controllo:** la modalità live, la vista renderizzata e la vista divisa mostrano sopra il blocco il risultato del controllo: in verde «pronto» o in rosso «Riga N: motivo», con «(+N altri)» in caso di più rilievi. Lì compaiono anche gli avvisi su più blocchi e su un attivatore non ancora supportato. L'indicazione segue il testo poco dopo ogni modifica e mostra lo stesso rilievo che segnala l'avvio. Nella stampa, in un'esportazione e in un file incorporato la riga d'intestazione non compare.

Evidenziazione e indicazione non modificano il testo del file.

## Limiti

- **Solo nell'area:** nessun comando legge o scrive fuori dalla radice dell'area in cui il workflow è stato avviato, nemmeno tramite un segnaposto.
- **Nessuna eliminazione, nessuna rete, nessun programma esterno.**
- **Solo a mano:** un workflow non si avvia mai da solo e viene eseguito solo mentre l'applicazione è in funzione.
- `notify` mostra il suo testo nella barra di stato; non c'è una notifica del sistema operativo.
- **Le macro** restano come sono e si possono richiamare come passo; una macro è una sequenza di comandi nelle impostazioni, un workflow una procedura come documento. **I [blocchi di script](scripts.md)** restano di sola lettura; un workflow non è un linguaggio di script generale, ma un catalogo fisso di comandi.

## Fasi successive

Sono previste altre fasi, senza che portata e tempi siano fissati: un avvio secondo un calendario, comandi di manutenzione come l'eliminazione con conferma, l'aggiunta e la rimozione di etichette o la spunta di attività, un avvio su eventi dell'area, condizioni e ripetizioni, nonché comandi per la [banca dati](database.md). Il controllo conosce già le parole chiave di questi comandi e le segnala come «disponibile solo in una fase successiva», affinché un file del genere non venga eseguito in parte.
