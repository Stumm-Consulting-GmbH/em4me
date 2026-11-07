# Workflow

Un **workflow** mette per iscritto operazioni ricorrenti come sequenza fissa di passi: creare, rinominare, spostare, copiare e spostare nel cestino file e cartelle, accodare o inserire testo, impostare proprietà ed etichette nell'intestazione, spuntare attività, eseguire comandi, macro e altri workflow. Condizioni e ripetizioni decidono quali passi vengono eseguiti e per quali file; un passo di script calcola un valore senza scrivere nulla. Un workflow è un **normale file Markdown**; ciò che fa sta in un blocco di comandi fissi, una riga per passo. Il file resta così leggibile senza l'applicazione, si può condividere e si modifica come qualsiasi altro documento.

Un workflow si avvia **a mano**: dal menu, dalla palette dei comandi, con una scorciatoia da tastiera, un pulsante sopra il blocco o il menu contestuale del pannello dell'area. Un workflow con pianificazione viene inoltre eseguito **secondo la pianificazione**, un workflow con evento **a un evento** dell'area, per esempio un nuovo file in una cartella, in entrambi i casi non appena è attivato. **Prima che venga eseguito il primo passo, l'applicazione controlla l'intero workflow**; un errore compare sopra il blocco con riga e motivo, e non viene eseguito nulla.

## L'estensione «Workflow»

La funzione fa parte delle [estensioni integrate](extensions.md) («Workflow», gruppo **Strumenti**) ed è attiva nella modalità di lavoro **Completa**, disattivata nelle modalità **Principiante** e **Avanzata**. Se è disattivata, un blocco `workflow` è un normale blocco di codice senza evidenziazione, senza indicazione del controllo e senza pulsanti; non ci sono comandi dei workflow, né il sottomenu **Workflow**, né la pagina **Esecuzioni dei workflow**, né l'elemento **Workflow** nella barra di stato, né le sezioni delle impostazioni **Workflow**, né l'esecuzione secondo la pianificazione, né l'esecuzione a un evento. Un file di workflow è allora un normale documento. Non si perde nulla: file, stati di esecuzione con lo stato di attivazione e la cartella dei workflow impostata restano invariati quando la si riattiva.

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

L'intestazione porta contrassegno, nome, attivatore, descrizione e, a seconda dell'attivatore, la pianificazione o l'evento:

| Chiave | Obbligatoria | Significato |
| --- | --- | --- |
| `workflow` | sì | `true` contrassegna il file come workflow. |
| `name` | no | Nome del workflow nel menu, nella palette dei comandi e negli avvisi; senza indicazione vale il nome del file senza estensione. |
| `trigger` | no | Attivatore: `manual` per l'avvio a mano, `schedule` per l'esecuzione secondo la pianificazione, `event` per l'esecuzione a un evento; senza indicazione vale `manual`. |
| `schedule` | con `trigger: schedule` | Pianificazione su una riga, per esempio `every weekday at 08:00` (sezione «Pianificazione e attivazione»). |
| `missed` | no | Trattamento delle esecuzioni perse: `run-once` recupera una volta, `skip` le lascia decadere; senza indicazione vale `run-once`. |
| `event` | con `trigger: event` | Evento su una riga, per esempio `file-created in "Ingresso"` (sezione «Eventi»). |
| `description` | no | Breve descrizione; la pagina **Esecuzioni dei workflow** la mostra come suggerimento sul nome. |

Un attivatore diverso da `manual`, `schedule` o `event` viene indicato come «non ancora supportato», e il workflow non viene eseguito; il file resta invariato. Nemmeno un file con due o più blocchi `workflow`, o con nessuno, viene eseguito. Un blocco che contiene solo commenti è valido e non fa nulla.

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
- segnaposto errati, modelli illeggibili e modelli disattivati,
- una pianificazione illeggibile, un orario mancante o non ammesso, `schedule` senza `trigger: schedule` e viceversa, nonché un valore sconosciuto per `missed`,
- una riga di evento illeggibile, un evento sconosciuto, una cartella fuori dall'area, un modello di nome non valido, `event` senza `trigger: event` e viceversa, più di una riga `event` e un segnaposto che l'evento non fornisce,
- un `end` mancante o in eccesso, un `else` senza condizione o un secondo `else`, blocchi oltre tre livelli, un ciclo dentro un ciclo, un modello di nome non valido per `for-each` e `{{item}}` fuori da un ciclo,
- per il passo di script, una sezione mancante, ripetuta o senza script, un nome non valido o doppio, un risultato che fornisce solo una riga successiva, e blocchi di script disattivati.

Un rilievo ferma l'esecuzione **prima del primo passo**; un file di workflow errato non viene quindi eseguito affatto invece che in parte. Il controllo segnala tutti i rilievi insieme; la riga indicata è la riga nel documento come la conta l'editor, intestazione compresa. Unica eccezione è il rilievo «Solo manuale» (sezioni «Pianificazione e attivazione» ed «Eventi»): impedisce soltanto l'attivazione, l'avvio a mano resta possibile.

Ciò che solo un passo precedente può produrre viene controllato dall'applicazione al passo stesso: se esistono un file, una sezione o un titolo. Se in quel momento manca, il passo fallisce.

## Comandi

I comandi, ordinati secondo il loro oggetto. I percorsi sono relativi alla radice dell'area.

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
| `notify` | mostrare un testo come avviso | testo | `notify "Riepilogo settimanale creato"` |
| `stop` | terminare l'esecuzione con un testo | testo | `stop "Niente da fare"` |

- `command` prende l'identificativo fisso di un comando, come `view.modeSplit`, `view.modeLive` o `file.save`, e lo esegue nella finestra di avvio. Se in quel momento non è eseguibile, il passo fallisce. Macro e workflow non passano per `command`, ma per i propri comandi.
- `macro` e `workflow` possono essere annidati al massimo su cinque livelli. Un workflow richiamato ritorna dopo il suo ultimo passo; se vi fallisce un passo, termina l'intera esecuzione.
- `notify` mostra il suo testo nella barra di stato e, in un'esecuzione pianificata o da un evento, anche come notifica del sistema operativo (sezione «Svolgimento di un'esecuzione»).
- `stop` termina l'intera esecuzione, anche da un workflow richiamato; la barra di stato mostra «Workflow ‹Nome› terminato alla riga N: testo».

### Comandi di manutenzione

| Comando | Significato | Dati | Esempio |
| --- | --- | --- | --- |
| `delete` | eliminare: spostare un file o una cartella nel cestino | percorso | `delete "Bozze/Vecchia.md"` |
| `add-tag` | aggiungere un'etichetta all'elenco `tags` dell'intestazione | percorso, etichetta | `add-tag "{{file}}" "fatto"` |
| `remove-tag` | togliere un'etichetta dall'elenco `tags` dell'intestazione | percorso, etichetta | `remove-tag "{{file}}" "bozza"` |
| `complete-task` | spuntare la prima attività aperta che contiene il testo cercato | percorso, testo cercato | `complete-task "Progetti/Piano.md" "Inviare l'offerta"` |
| `confirm` | porre una domanda con «Sì» e «No» | domanda | `confirm "Archiviare tutte le bozze?"` |

- **`delete`** sposta la destinazione nel cestino, come l'eliminazione nel pannello dell'area; una cartella va per intero. Con un file vanno il suo file di accompagnamento (`.mdd`) con lo stato di esecuzione e i suoi registri delle modifiche (`.mddl`). La radice dell'area non si può eliminare. Una destinazione eliminata si recupera dal cestino.
- **Una conferma per esecuzione:** se un'esecuzione contiene `delete`, **una** conferma prima del primo passo nomina tutte le destinazioni dell'esecuzione con il loro percorso, anche quelle dei workflow richiamati; «No» non lascia eseguire alcun passo, e l'esecuzione conta come inserimento annullato. Se una destinazione è aperta in questa finestra, viene chiusa prima del passo; con modifiche non salvate compare la consueta richiesta di salvataggio, e «Annulla» termina l'esecuzione a quella riga.
- **`add-tag` e `remove-tag`** modificano solo l'elenco `tags` dell'intestazione; un'etichetta già presente o assente non è un errore. Un `#` iniziale viene tralasciato, e maiuscole e minuscole non contano nel confronto; un'etichetta vuota o con spazi non è valida. Se `remove-tag` toglie l'ultima etichetta, resta l'elenco vuoto `tags: []`. Le etichette nel testo (`#etichetta`) restano intatte; per quelle c'è `replace`.
- **`complete-task`** cerca tra le attività aperte del file, le stesse che mostra la [query di attività](tasks.md), la prima il cui testo contiene il testo cercato, distinguendo maiuscole e minuscole. La spunta come un clic nella query di attività, con la data di completamento secondo le impostazioni delle attività. Se non ne trova nessuna, il passo fallisce.
- **`confirm`** mostra la domanda con «Sì» e «No». «Sì» prosegue l'esecuzione; «No» la termina senza fallimento, e la barra di stato mostra «Workflow ‹Nome› terminato alla riga N: «domanda» con risposta No».
- **File aperti:** su un file aperto e non salvato in una finestra, `add-tag`, `remove-tag` e `complete-task` agiscono tramite quella finestra, come i comandi per il contenuto.
- `delete` e `confirm` richiedono una persona presente: in un workflow con `trigger: schedule` o `trigger: event` sono il rilievo «Solo manuale».

### Condizioni, ripetizioni e script

Questi comandi aprono un **blocco** che una riga `end` chiude; i passi intermedi vengono eseguiti solo se la condizione è vera, oppure una volta per file. `script` è un passo singolo. Dettagli nelle sezioni «Condizioni e ripetizioni» e «Passo di script».

| Comando | Significato | Dati | Esempio |
| --- | --- | --- | --- |
| `if-exists` | se esiste: blocco solo se il file o la cartella esiste | percorso | `if-exists "Registro.md"` |
| `if-missing` | se manca: blocco solo se il file o la cartella manca | percorso | `if-missing "Diario/{{date}}.md"` |
| `if-property` | se proprietà: blocco solo se la proprietà nell'intestazione ha il valore o, senza valore, è impostata | percorso, nome, valore facoltativo | `if-property "{{file}}" status "aperto"` |
| `if-script` | se script: blocco solo se lo script di una sezione è vero | titolo | `if-script "Conteggio"` |
| `else` | altrimenti: introduce la parte che vale se la condizione non è vera | nessuno | `else` |
| `end` | fine: chiude il blocco di una condizione o di un ciclo | nessuno | `end` |
| `for-each` | per ogni: blocco una volta per ogni file che corrisponde al modello | cartella con modello di file | `for-each "Ingresso/*.md"` |
| `script` | script: eseguire il blocco di script di una sezione e dare un nome al suo risultato | titolo, `as "nome"` | `script "Conteggio" as "numero"` |

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
| `{{file}}` | percorso del documento attivo all'avvio, relativo alla radice dell'area, per esempio `Progetti/Piano.md`; in un'esecuzione da un evento, il file dell'evento (sezione «Eventi») |
| `{{title}}` | titolo del documento attivo all'avvio |
| `{{folder}}` | cartella del documento attivo all'avvio, relativa alla radice dell'area |
| `{{area}}` | nome dell'area |
| `{{clipboard}}` | testo degli appunti all'avvio; in un'esecuzione pianificata o da un evento, ciò che si trova in quel momento negli appunti |
| `{{prompt:Domanda}}`, `{{prompt:Domanda:Predefinito}}` | finestra di inserimento |
| `{{select:Domanda:a,b,c}}` | finestra di scelta |
| `{{from}}` | con `file-moved`, il percorso precedente del file |
| `{{task}}` | con `task-done`, il testo dell'attività completata |
| `{{item}}`, `{{item:name}}` | in un ciclo `for-each`, il percorso del file corrente e il suo nome senza estensione |
| `{{script:name}}` | il risultato del passo di script `script … as "name"` |

- **Tutte le finestre prima del primo passo:** le finestre di inserimento e di scelta dell'intera esecuzione compaiono una dopo l'altra prima che accada qualcosa, comprese quelle dei modelli usati e dei workflow richiamati. Una stessa domanda viene posta una sola volta e vale ovunque. Annullare una finestra annulla l'esecuzione, e nessun passo viene eseguito.
- **Un istante per esecuzione:** `{{date}}` e `{{time}}` hanno lo stesso valore in tutte le righe, anche a cavallo della mezzanotte. Allo stesso modo gli appunti vengono letti una sola volta all'avvio, e `{{clipboard}}` ha lo stesso contenuto in tutte le righe.
- **In un modello usato da un workflow**, `{{title}}` e `{{folder}}` indicano come sempre il nuovo file, mentre `{{file}}` e `{{area}}` indicano il documento attivo e l'area.
- **Secondo la pianificazione e agli eventi** non c'è nessuno che risponda a una finestra: in un workflow con `trigger: schedule` o `trigger: event`, i segnaposto di inserimento e di scelta sono il rilievo «Solo manuale».
- `{{item}}`, `{{item:name}}` e `{{script:name}}` ricevono il loro valore solo durante l'esecuzione; nel nome di un workflow o di una macro, nel percorso di un modello e nella destinazione di `delete` sono perciò un rilievo.
- `{{cursor}}` non è ammesso in una riga di comando. `\{{` scrive un `{{` letterale.
- Se `{{folder}}` resta vuoto nella cartella radice, `"{{folder}}/Nuovo.md"` diventa il percorso `Nuovo.md`. Senza documento attivo, `{{file}}` è vuoto, e un percorso formato con esso è un rilievo.

## Avviare un workflow

Un workflow si avvia solo in un'area aperta, e i suoi percorsi valgono in quell'area, anche se il file proviene dalla cartella dei workflow dell'intera applicazione o da un'area collegata. Le vie a mano:

| Via | Effetto |
| --- | --- |
| **File → Workflow** | ogni workflow della cartella dei workflow come voce, le sottocartelle come sottomenu |
| **Palette dei comandi** (`Ctrl+K` predefinito) | ogni workflow della cartella dei workflow come comando con il suo nome |
| **Barra di stato e menu contestuale** | il comando di un workflow, collocato tramite il [posizionamento dei comandi](command-placement.md) |
| **Scorciatoia da tastiera** | assegnata al comando di un workflow in «Impostazioni → Scorciatoie da tastiera» |
| **Pulsante «Avvia» sopra il blocco** | nella modalità live, nella vista renderizzata e nella vista divisa, a destra nella riga d'intestazione del blocco; avvia qualsiasi file di workflow, anche fuori dalla cartella dei workflow, con lo stato presente nell'editor |
| **«Avvia» nel pannello dell'area** | in cima al menu contestuale di ogni file di workflow dell'area |
| **Pagina «Esecuzioni dei workflow»** | pulsante «Avvia» nella riga di ogni workflow |

Il pulsante sopra il blocco è disattivato finché il controllo segnala un rilievo. Per un documento mai salvato mostra «Salva prima», fuori da un'area «Avviabile solo all'interno di un'area aperta». Un workflow attivato viene inoltre eseguito da solo secondo la sua pianificazione o al suo evento; l'avvio a mano resta possibile in ogni momento.

Il comando di un workflow riceve il suo identificativo dal percorso del file nella cartella dei workflow; due workflow con lo stesso nome in sottocartelle diverse restano così distinguibili. **Rinominare un workflow nell'applicazione o spostarlo all'interno della cartella dei workflow ne conserva le assegnazioni:** una scorciatoia da tastiera, un posto nella barra di stato, nel menu contestuale o nella barra di formattazione e un passo di macro che lo richiama lo seguono. **Al di fuori dell'applicazione**, per esempio nel gestore file, l'applicazione non si accorge della rinomina; le assegnazioni perdono allora la loro destinazione e vanno impostate di nuovo. Un workflow spostato fuori dalla cartella dei workflow non è più un comando; le sue assegnazioni restano salvate e tornano a funzionare non appena esso torna nello stesso posto.

## Svolgimento di un'esecuzione

1. L'applicazione controlla il workflow insieme ai workflow che richiama.
2. Le finestre di tutti i segnaposto compaiono una dopo l'altra; se l'esecuzione contiene `delete`, segue l'unica conferma delle destinazioni da eliminare.
3. I passi vengono eseguiti rigorosamente uno dopo l'altro; ciascuno attende il precedente. Condizioni e cicli decidono quali passi vengono eseguiti e quante volte.
4. Il primo fallimento termina l'esecuzione. La barra di stato mostra «Workflow ‹Nome› interrotto alla riga N: motivo».

I passi eseguiti restano eseguiti; non c'è un annullamento di un'esecuzione (sezione «Che cosa ha fatto un'esecuzione»). **In ogni finestra è in esecuzione al massimo un workflow**; un secondo avvio durante un'esecuzione viene respinto con un avviso.

**Messaggi:** in un avvio a mano, `notify` mostra il suo testo nella barra di stato. In un'esecuzione pianificata, anche recuperata, e in un'esecuzione da un evento, il testo esce in più come **notifica del sistema operativo**, con il nome del workflow come titolo; lo stesso vale per l'interruzione di una tale esecuzione con riga e motivo, anche se il workflow non contiene `notify`. La notifica compare solo se nessuna finestra dell'applicazione è in primo piano, e una sola volta per messaggio; altrimenti basta l'avviso nella barra di stato. Se e come il sistema operativo la mostri dipende dalle sue impostazioni di notifica.

## Condizioni e ripetizioni

Una **condizione** lascia eseguire dei passi solo se qualcosa è vero; un **ciclo** ripete dei passi per ogni file di una cartella. Entrambi aprono un blocco che una riga `end` chiude:

```workflow
# Creare la nota del giorno solo se manca
if-missing "Diario/{{date}}.md"
  create "Diario/{{date}}.md"
else
  notify "La nota del giorno esiste già"
end
open "Diario/{{date}}.md"
```

### Condizioni

- `if-exists "percorso"` è vera se il file o la cartella esiste, `if-missing "percorso"` se manca.
- `if-property "percorso" nome "valore"` è vera se la proprietà nell'intestazione ha esattamente quel valore; numeri e valori logici si confrontano per come sono scritti. Per una **lista** come `tags` è vera se la lista contiene il valore. Senza valore (`if-property "percorso" nome`) è vera se la proprietà è impostata e non vuota, per una lista se la lista non è vuota. Un file senza intestazione non la rende vera; se il file manca, il passo fallisce.
- `if-script "sezione"` è vera se lo script della sezione è vero (sezione «Passo di script»).
- Il controllo avviene quando si raggiunge la riga, con lo stato lasciato dai passi precedenti; un file aperto e non salvato conta con il suo stato nell'editor.

### La forma a blocchi

- `else` introduce a scelta la parte che vale se la condizione non è vera; ogni condizione ha al massimo un `else`, un ciclo nessuno.
- `end` chiude l'ultimo blocco aperto. `else` ed `end` stanno ciascuno su una riga propria.
- **Il rientro** è ammesso e consigliato perché il blocco resti leggibile; non ha alcun significato.
- I blocchi si possono annidare fino a **tre livelli**, ciclo compreso.
- Un `end` mancante o in eccesso, un `else` senza condizione e un annidamento troppo profondo vengono segnalati dal controllo prima del primo passo, con la riga.

### Ciclo sui file di una cartella

`for-each "cartella/modello"` ripete i passi fino a `end` per ogni file che corrisponde al modello. `{{item}}` è il percorso del file corrente, relativo alla radice dell'area, `{{item:name}}` il suo nome senza estensione:

```workflow
# Archiviare le note concluse dell'ingresso
for-each "Ingresso/*.md"
  if-property "{{item}}" status "concluso"
    add-tag "{{item}}" "archivio"
    move "{{item}}" "Archivio"
  end
end
```

- **Modello:** prima la cartella, poi un modello del nome del file con `*` per un numero qualsiasi di caratteri e `?` per esattamente uno, per esempio `Ingresso/*.md`. Un `**` prima del modello del file aggiunge le sottocartelle (`Progetti/**/*.md`), un `**` alla fine indica tutti i file con le sottocartelle (`Ingresso/**`). Maiuscole e minuscole non contano; i caratteri jolly nella parte della cartella sono un rilievo.
- **Elenco fisso:** i file vengono stabiliti all'ingresso nel ciclo ed elaborati in ordine alfabetico, i numeri come nel gestore di file (`2` prima di `10`). I file che l'esecuzione crea nel ciclo non si aggiungono. File e cartelle il cui nome inizia con un punto non contano.
- **Limite:** al massimo **500 file**. Con più file il passo fallisce prima della prima ripetizione, con «Più di 500 file; nessun file è stato elaborato». Anche una cartella mancante è un fallimento.
- I cicli non si possono annidare uno nell'altro; una condizione nel ciclo è ammessa.
- `{{item}}` e `{{item:name}}` valgono solo all'interno di un ciclo. Le finestre di inserimento nel ciclo compaiono una volta prima del primo passo, e la risposta vale per ogni file.

## Passo di script

Un **passo di script** esegue un [blocco di script](scripts.md) del file di workflow e ne usa il risultato nelle righe successive o come condizione. Lo script calcola e controlla; non può scrivere. L'esempio conta i file della cartella «Attività» con `status: aperto`:

````markdown
```workflow
script "Conteggio" as "aperti"
if-script "Conteggio"
  notify "File aperti nella cartella Attività: {{script:aperti}}"
else
  notify "Niente di aperto"
end
```

## Conteggio

```perspective-script
return pq.pages('Attività').filter(function (p) { return p.status === 'aperto'; }).length;
```
````

- **`script "sezione" as "nome"`** esegue il primo blocco di script (`perspective-script`) sotto il titolo «sezione» del file di workflow; la sezione si trova come con `from-section`. Il suo **risultato** è poi disponibile come `{{script:nome}}` in ogni riga successiva: il valore di ritorno dello script (un testo, un numero o un valore logico), altrimenti il testo del suo output senza spazi ai margini. Il nome è fatto di lettere, cifre, `_` e `-`; maiuscole e minuscole non contano, e ogni nome si assegna una sola volta.
- **`if-script "sezione"`** apre un blocco come le altre condizioni. È vera se lo script restituisce `true`, un testo non vuoto o un numero diverso da zero; `false`, un testo vuoto, `0` e nessun valore non la rendono vera.
- **La stessa sandbox dei blocchi di script:** lo script legge i dati dell'area tramite l'interfaccia pq, con il file di workflow come documento proprio (`pq.current()`), e non ha accesso a file, rete né all'applicazione. È **di sola lettura**. Viene interrotto dopo **5 secondi**. Un errore o un'interruzione è un fallimento del passo e termina l'esecuzione con «Script non riuscito» o «Script interrotto dopo 5 secondi».
- **Impostazione «Esegui blocchi di script»:** il passo di script segue la stessa impostazione dei blocchi di script (**Impostazioni → Comportamento**, disattivata per impostazione predefinita). Se è disattivata, il controllo segnala «I blocchi di script sono disattivati» con la riga; il workflow non viene eseguito e non si può attivare. Subito prima di ogni script l'applicazione consulta di nuovo l'impostazione.
- Il controllo cerca la sezione prima del primo passo: se manca, compare più volte o non contiene alcun blocco di script, è un rilievo. Anche un `{{script:nome}}` prima del passo che lo fornisce è un rilievo; se il passo che lo fornisce non è stato eseguito in un ramo, la riga fallisce.

## Pianificazione e attivazione

Un workflow con `trigger: schedule` e una riga `schedule` viene eseguito da solo alle scadenze della sua pianificazione non appena è **attivato**:

```yaml
---
workflow: true
name: Nota del giorno
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---
```

### La riga di pianificazione

La pianificazione è una riga di parole inglesi, sul modello delle [attività ricorrenti](tasks.md):

| Forma | Significato | Esempio |
| --- | --- | --- |
| `every N minutes` | ogni N minuti | `every 30 minutes` |
| `every N hours` | ogni N ore | `every 2 hours` |
| `every day at HH:MM`, `every N days at HH:MM` | ogni giorno od ogni N giorni all'orario | `every day at 08:00` |
| `every weekday at HH:MM` | dal lunedì al venerdì all'orario | `every weekday at 07:30` |
| `every <giorni> at HH:MM` | nei giorni della settimana indicati | `every monday, thursday at 18:00` |
| `every N weeks on <giorni> at HH:MM` | ogni N settimane nei giorni indicati | `every 2 weeks on monday at 08:00` |
| `every N months on the <giorno> at HH:MM` | ogni N mesi nel giorno indicato | `every month on the 1st at 09:00` |
| `every month on the last at HH:MM` | l'ultimo giorno del mese | `every month on the last at 17:00` |

- **Orario:** `at HH:MM` è obbligatorio per giorni, giorni feriali, settimane e mesi e non è ammesso per minuti e ore; l'orario ha esattamente la forma `08:00`.
- **Scrittura:** senza numero vale `1` (`every day`, `every week`, `every month`); singolare e plurale valgono allo stesso modo. I giorni della settimana si scrivono in inglese (da `monday` a `sunday`), separati da virgola o `and`. Il giorno del mese si scrive `1st`, `2nd`, `3rd`, `15th` o come semplice numero. Maiuscole e minuscole non contano.
- **Conteggio:** un intervallo come `every 30 minutes` o `every 2 weeks` si conta dalla fine dell'ultima esecuzione, prima della prima esecuzione dall'attivazione, non su una griglia fissa dell'orologio.
- Un file porta esattamente una riga `schedule`. Un errore in essa è un rilievo con la sua riga nell'intestazione, per esempio «Pianificazione … non leggibile» o «Manca 'at'».

### Interpretazione

- **Ora locale:** l'orario è quello del computer, come per promemoria e sveglie. `08:00` resta `08:00` al passaggio all'ora legale o solare; se un orario non esiste quando l'orologio va avanti, per esempio `02:30`, il workflow viene eseguito al minuto esistente successivo.
- **Settimana:** la settimana inizia il lunedì.
- **Fine mese:** `last` è l'ultimo giorno del mese. Un giorno che un mese non ha, per esempio `31st` in aprile, viene saltato in quel mese; chi intende la fine del mese scrive `last`.

### Quando un workflow viene eseguito secondo la pianificazione

**Un workflow pianificato viene eseguito finché l'applicazione e la sua area sono aperte.** Non c'è alcun servizio in background, e l'applicazione non si avvia da sola. Controlla ogni 30 secondi se un workflow è in scadenza; un'esecuzione inizia quindi fino a mezzo minuto dopo la sua scadenza.

- Un workflow in scadenza viene eseguito in esattamente una finestra della sua area, anche se l'area è aperta in più finestre. Se è in corso un altro workflow, quello in scadenza attende che una finestra dell'area sia libera.
- Dopo ogni esecuzione, l'applicazione calcola la scadenza successiva; la pagina **Esecuzioni dei workflow** la mostra nella colonna **Prossima esecuzione**.
- Un'esecuzione pianificata si svolge senza nessuno presente e non pone domande. Perciò i segnaposto di inserimento e di scelta, `confirm` e `delete` sono il rilievo **«Solo manuale»** in un workflow con `trigger: schedule`: non lo si può attivare, ma lo si può sempre avviare a mano, e le finestre compaiono allora come di consueto. Se solo un modello usato o un workflow richiamato chiede un inserimento, l'esecuzione pianificata si interrompe prima del primo passo con questo rilievo.

### Esecuzioni perse

Una scadenza è persa se è caduta mentre l'applicazione o l'area erano chiuse o il computer era in sospensione. Che cosa accade allora lo stabilisce il campo `missed`:

- **`run-once`** (predefinito): il workflow viene recuperato **una volta** all'apertura dell'area, anche se le scadenze perse sono più d'una. La barra di stato segnala «Workflow ‹Nome› recuperato», e la pagina **Esecuzioni dei workflow** mostra «(recuperato)» dopo l'ultima esecuzione.
- **`skip`**: la scadenza persa decade, e il workflow attende la successiva. La pagina mostra «saltato:» con la scadenza decaduta.

### Attivare

Un workflow con `trigger: schedule` o `trigger: event` **non è attivato** dopo la creazione, la copia o la ricezione; viene eseguito automaticamente solo dopo che l'utente lo ha attivato. Lo stato di attivazione si trova nello stato di esecuzione del file di accompagnamento e non segue la copia. Si attiva in tre punti, che compaiono tutti solo con `trigger: schedule` e `trigger: event`:

- **pagina «Esecuzioni dei workflow»**: la casella della colonna **Attivato**,
- **sopra il blocco**: il pulsante «Attivato» accanto ad «Avvia», premuto «✓ Attivato»,
- **pannello dell'area**: nel menu contestuale del file di workflow, «Attiva» o «Disattiva».

L'attivazione controlla il workflow come prima di un'esecuzione. In caso di rilievo viene respinta, e la barra di stato mostra «Non attivato:» con motivo e riga; altrimenti segnala «Workflow ‹Nome› attivato, prossima esecuzione» con la scadenza. Disattivare è possibile in ogni momento, anche con un rilievo.

**Definizione modificata:** se dopo l'attivazione cambia il blocco `workflow`, una delle righe `trigger`, `schedule`, `missed` ed `event` o un blocco di script eseguito da un passo di script, anche senza salvare nell'editor, il workflow conta come «non attivato: definizione modificata» e non viene più eseguito automaticamente finché non viene attivato di nuovo. Modificare nome e descrizione non ha effetto. Così un contenuto modificato che nessuno ha approvato non viene mai eseguito senza nessuno presente.

### L'elemento «Workflow» della barra di stato

Finché almeno un workflow dell'area è attivato, l'elemento **Workflow** si trova nella parte destra della barra di stato. Mostra l'ultima esecuzione pianificata o da un evento con il segno del risultato, il nome e l'ora, per esempio «✓ Nota del giorno 08:00»; un'esecuzione di un giorno precedente porta in più giorno e mese. I segni sono `✓` per riuscito, `✗` per interrotto, `■` per terminato e `–` per un inserimento annullato; un'interruzione compare nel colore dell'avviso di errore. Senza esecuzioni di questo tipo finora mostra «Workflow». Il suggerimento indica data, ora e risultato, un clic apre la pagina **Esecuzioni dei workflow**. In una barra di stato stretta l'elemento si ripiega insieme agli altri elementi.

## Eventi

Un workflow con `trigger: event` e una riga `event` viene eseguito automaticamente quando il suo **evento** si verifica nell'area, non appena è attivato. Nasce così, per esempio, una **regola di cartella**: ogni nota che arriva nella cartella «Ingresso» riceve un'etichetta, che sia stata creata nell'applicazione, depositata con il gestore di file o portata da una sincronizzazione.

````markdown
---
workflow: true
name: Etichettare l'ingresso
trigger: event
event: file-created in "Ingresso" matching "*.md"
---

```workflow
add-tag "{{file}}" "ingresso"
notify "Nuovo nell'ingresso: {{file}}"
```
````

### La riga dell'evento

La riga ha la forma `event: <evento> [in "<cartella o file>"] [matching "<modello>"]`:

| Evento | si verifica quando … | `{{file}}` è … | Esempio |
| --- | --- | --- | --- |
| `file-created` | un file viene creato nell'area, anche dall'esterno | il nuovo file | `event: file-created in "Ingresso"` |
| `file-changed` | un file viene modificato, anche dall'esterno; compreso il salvataggio nell'applicazione | il file modificato | `event: file-changed in "Progetti" matching "*.md"` |
| `file-moved` | un file viene rinominato o spostato nell'applicazione | il nuovo percorso; quello precedente è `{{from}}` | `event: file-moved in "Archivio"` |
| `task-done` | un'attività passa a completata | il file dell'attività; il suo testo è `{{task}}` | `event: task-done in "Piano settimanale.md"` |
| `area-opened` | l'area è aperta e letta | (nessun file) | `event: area-opened` |
| `reminder-due` | un promemoria dell'area scade | il file del promemoria | `event: reminder-due` |

- **`in`** limita a una cartella con le sue sottocartelle o a un singolo file, relativo alla radice dell'area; una cartella `Ingresso` non corrisponde mai a una cartella il cui nome inizia soltanto con quel nome, come `Ingresso vecchio`. **`matching`** limita a un modello del nome del file, con `*` e `?`, senza cartella. Entrambi sono facoltativi; `in` precede `matching`, i valori stanno tra virgolette diritte, e maiuscole e minuscole non contano. Con `file-moved` vale la nuova posizione.
- Con `area-opened` e `reminder-due`, `in` e `matching` non sono ammessi.
- **Esattamente una riga `event` per file.** Chi vuole rispondere a più eventi scrive per ogni evento un piccolo workflow che ne richiama uno comune con `workflow "Nome"`.
- **Spostare:** uno spostamento nel gestore di file compare come `file-created` nella nuova posizione; solo l'applicazione conosce `file-moved`, perché solo lei sa da dove viene un file.
- **Attività completata** significa: una riga di attività passa a uno stato del tipo «completato», che sia con un clic sulla casella, nella [query di attività](tasks.md), con una `x` digitata o con una modifica dall'esterno. Un clic o una `x` digitata fanno scattare l'evento poco dopo, anche prima del salvataggio; il salvataggio successivo non lo fa scattare una seconda volta. Un'attività annullata non è completata. `{{task}}` è il testo dell'attività senza casella, date e priorità.

### Che cosa può fare un'esecuzione a un evento

- Un'esecuzione da un evento si svolge **senza nessuno presente**, come un'esecuzione pianificata: i segnaposto di inserimento e di scelta, `confirm` e `delete` sono il rilievo «Solo manuale». **Agli eventi non si elimina mai nulla.**
- `{{file}}`, `{{from}}` e `{{task}}` portano i valori dell'evento (tabella sopra). Il controllo segnala un segnaposto che l'evento non fornisce: `{{file}}` con `area-opened`, `{{from}}` tranne che con `file-moved`, `{{task}}` tranne che con `task-done`.

### Quando agiscono gli eventi

**Gli eventi agiscono finché l'applicazione e l'area sono aperte in una finestra, e non vengono recuperati.** Ciò che è accaduto mentre l'area era chiusa non fa scattare nulla all'apertura; chi vuole riordinare all'apertura scrive un workflow con `area-opened` e `for-each`.

- **Antirimbalzo:** le segnalazioni dello stesso file entro **2 secondi** danno un solo evento; un salvataggio che produce più segnalazioni avvia così un workflow una volta sola. Un file scritto di continuo fa scattare l'evento al più tardi dopo 10 secondi.
- **Che cosa non fa mai scattare nulla:** i file di accompagnamento (`.mdd`, `.mddl`), la cartella dei blocchi e i file e le cartelle il cui nome inizia con un punto.
- **Ordine:** se un evento corrisponde a più workflow attivati, ciascuno viene eseguito una volta, uno dopo l'altro nell'ordine dei loro percorsi. Per area le esecuzioni da eventi si susseguono una dopo l'altra, nell'ordine degli eventi e in esattamente una finestra; se lì è in esecuzione un workflow, l'evento attende. Alla chiusura dell'area gli eventi in attesa decadono.
- `area-opened` si verifica una volta per apertura, anche per un'area che l'applicazione riapre all'avvio. `reminder-due` si verifica quando il promemoria scade alla sua ora; i promemoria consegnati in ritardo all'apertura dell'area non fanno scattare nulla.

### Nessuna catena

**Un workflow reagisce a ciò che fate voi o altri programmi, mai a ciò che fa un workflow.** Ciò che un'esecuzione crea, modifica, sposta o spunta non fa scattare alcun evento; un workflow che, a un nuovo file in «Ingresso», crea esso stesso un file in «Ingresso» non gira quindi in tondo. Chi vuole una sequenza richiama espressamente il secondo workflow con `workflow "Nome"`. Se un passo scrive in un documento aperto e non salvato, solo il vostro salvataggio è una modifica del file e fa scattare `file-changed`; un'attività che un tale passo spunta nel documento fa scattare `task-done`.

**Freno di emergenza:** se lo stesso workflow viene eseguito da eventi più di **20 volte in 5 minuti**, per esempio perché un altro programma risponde alle sue modifiche, la 21ª esecuzione non parte più. Il workflow viene disattivato, gli eventi in attesa per lui decadono, e la barra di stato segnala «Workflow ‹Nome› disattivato: più di 20 esecuzioni attivate da eventi in 5 minuti», senza finestre in primo piano anche come notifica del sistema operativo. La pagina **Esecuzioni dei workflow** mostra «non attivato: freno di emergenza» sotto la casella e il motivo nella colonna **Risultato**. Dopo una nuova attivazione il freno ricomincia a contare.

### Attivazione e indicazione

Un workflow con `trigger: event` si attiva negli stessi tre punti di uno pianificato (sezione «Attivare»); la riga `event` fa parte della definizione. Dopo l'attivazione la barra di stato segnala per esempio «Workflow ‹Nome› attivato, eseguito alla creazione di un file in ‹Ingresso›». Nella pagina **Esecuzioni dei workflow**, la colonna **Prossima esecuzione** mostra l'evento a parole, per esempio «alla creazione di un file in ‹Ingresso›», e la colonna **Ultima esecuzione** l'origine, per esempio «evento: nuovo file ‹Ingresso/Scan.md›». `notify` e un'interruzione escono anche come notifica del sistema operativo, come per la pianificazione, e l'elemento **Workflow** della barra di stato mostra anche l'ultima esecuzione da un evento.

## Cartella dei workflow e menu

Come per i modelli, esiste una **cartella dei workflow**, impostata su due livelli in «File → Impostazioni…»:

- **Per l'intera applicazione** nella sezione **Estensioni (interne) → Workflow**.
- **Per area** nella sezione **Area corrente → Workflow** con l'interruttore «Usa la configurazione dell'area» e il pulsante «Sfoglia…». La cartella viene salvata relativa alla radice dell'area nel file dell'area e **sostituisce** completamente quella dell'applicazione.

La cartella dei workflow dell'intera applicazione viaggia con il file di configurazione, come tipo di dati «Cartella dei workflow» della pagina [Esportare e importare le impostazioni](setup-exchange.md), e ha effetto subito dopo l'importazione. La cartella per area si trova nel file dell'area e viaggia con l'area.

Il sottomenu **File → Workflow** si trova subito dopo il sottomenu **Area**. Mostra i file della cartella che portano il contrassegno, in ordine alfabetico per nome a ogni livello; le sottocartelle compaiono come sottomenu, i file senza contrassegno vengono tralasciati. Dopo i propri seguono, ciascuno dietro un separatore, i workflow delle aree collegate con consenso (sezione seguente). Dopo un ulteriore separatore seguono:

- **Mostra esecuzioni dei workflow** — apre la pagina **Esecuzioni dei workflow**.
- **Nuovo workflow…** — chiede il nome, crea nella cartella dei workflow un file con intestazione, una riga di descrizione e un blocco `workflow` vuoto con due righe di commento, e lo apre. Senza cartella impostata, chiede prima la cartella e la conserva, nelle impostazioni dell'area se un'area è aperta. Non sovrascrive mai un file esistente. La voce si trova anche nella palette dei comandi.
- **Imposta cartella dei workflow…** — apre le impostazioni alla sezione **Workflow**.

Senza cartella impostata, il sottomenu mostra «Nessuna cartella dei workflow impostata», con una cartella vuota «Nessun workflow nella cartella dei workflow», con una cartella irraggiungibile «Cartella dei workflow non trovata». Il sottomenu e i comandi seguono ogni modifica nella cartella.

## Workflow delle aree collegate

Come i modelli, i workflow di un'[area collegata](linking.md) possono essere proposti accanto ai propri. Per questo ogni collegamento in **Impostazioni → Area corrente → Collegamenti tra aree** porta accanto a «Modelli» la casella **Workflow**; all'inizio è disattivata e indipendente da quella dei modelli.

- **Dove compaiono:** i workflow della cartella dei workflow che l'area collegata ha impostato per sé compaiono nel sottomenu **File → Workflow** dopo i propri, nella palette dei comandi e nella pagina **Esecuzioni dei workflow**, ciascuno come «Nome (@prefisso)» con il prefisso del collegamento. I nuovi workflow della fonte compaiono senza riavvio.
- **Dove agiscono:** un tale workflow viene eseguito nell'area **propria**. Tutti i percorsi valgono nella radice dell'area propria; dall'area collegata viene letto solo il file di workflow stesso, comprese le sue sezioni per `from-section`. Una chiamata `workflow "Nome"` cerca nell'area propria.
- **Solo a mano:** un workflow di un'area collegata non si può attivare. L'applicazione non scrive alcuno stato di esecuzione nell'area altrui; la pagina mostra al suo posto «dall'area ‹prefisso›», e la barra di stato segnala un'esecuzione riuscita con «Workflow ‹Nome› dall'area ‹prefisso› eseguito correttamente».
- **Senza accesso:** se l'area collegata, il suo file dell'area o la sua cartella dei workflow non sono leggibili, i suoi workflow vengono tralasciati senza avviso. Con i collegamenti tra aree disattivati non compaiono workflow altrui.

## Stato di esecuzione e la pagina «Esecuzioni dei workflow»

Dopo ogni esecuzione, l'applicazione registra nel **file di accompagnamento** del workflow (`.mdd`, sezione `workflow`) l'istante, il risultato, se del caso la riga interrotta, il numero di esecuzioni, l'origine dell'esecuzione e il registro dell'ultima esecuzione, per un workflow pianificato o con evento inoltre lo stato di attivazione, per la pianificazione la scadenza successiva e per un'esecuzione da un evento l'evento che l'ha avviata con il suo file; il testo del file di workflow resta intatto. Lo stato di esecuzione segue il file quando viene rinominato o spostato, non quando viene copiato.

La pagina **Esecuzioni dei workflow** si apre con «Visualizza → Mostra esecuzioni dei workflow», con «File → Workflow → Mostra esecuzioni dei workflow», dalla palette dei comandi e con un clic sull'elemento **Workflow** della barra di stato. Elenca **tutti i workflow dell'area**, anche quelli fuori dalla cartella dei workflow, e poi i workflow delle aree collegate con consenso, con queste colonne e un pulsante «Avvia» per riga:

| Colonna | Contenuto |
| --- | --- |
| **Workflow**, **Posizione** | nome con la descrizione come suggerimento, cartella del file |
| **Attivato** | casella per attivare, solo con `trigger: schedule` e `trigger: event`; con una definizione modificata in più «non attivato: definizione modificata», dopo un intervento del freno di emergenza «non attivato: freno di emergenza» |
| **Prossima esecuzione** | scadenza della prossima esecuzione pianificata, per un workflow con evento l'evento a parole, in entrambi i casi finché il workflow è attivato |
| **Ultima esecuzione** | istante dell'ultima esecuzione, con «(recuperato)» per un'esecuzione recuperata, con evento e file per un'esecuzione da un evento, sotto se del caso «saltato:» con la scadenza; in più il pulsante «Registro (N)» |
| **Risultato** | risultato dell'ultima esecuzione, tabella seguente |
| **Esecuzioni** | numero di esecuzioni |

Un workflow mai eseguito compare con «mai eseguito».

| Risultato | Significato |
| --- | --- |
| riuscito | tutti i passi sono stati eseguiti |
| interrotto alla riga N: motivo | un rilievo o un fallimento ha terminato l'esecuzione |
| terminato alla riga N | il comando `stop` o un «No» a `confirm` ha terminato l'esecuzione |
| Inserimento annullato, nessun passo eseguito | una finestra o la conferma delle destinazioni da eliminare è stata annullata |

Dopo un'esecuzione in questa finestra, la pagina mostra lo stesso motivo della barra di stato. Il file di accompagnamento conserva solo la riga e il tipo di motivo; dopo un riavvio e per un'esecuzione da un'altra finestra, singoli dettagli come un nome di file compaiono perciò come «…». La pagina si aggiorna dopo ogni esecuzione e ogni attivazione; il pulsante «Aggiorna» la rilegge.

### Che cosa ha fatto un'esecuzione

Il pulsante «Registro (N)» apre sotto la riga il **registro** dell'ultima esecuzione: ogni file e ogni cartella che ha creato, modificato, spostato, copiato o eliminato, come «Riga N: comando – percorso», con il percorso relativo alla radice dell'area. Se l'esecuzione non ha toccato nulla, mostra «Nessun file toccato»; con moltissimi file toccati, il registro è troncato e lo indica.

Non c'è un annullamento di un'intera esecuzione. Si annulla in modo mirato, con i mezzi che esistono comunque: le modifiche al contenuto con la [cronologia del documento](history.md) del file toccato, ciò che è stato eliminato dal cestino, ciò che è stato creato, spostato e copiato nel pannello dell'area.

## Supporto nell'editor

- **Evidenziazione:** nelle righe di comando la parola chiave è in grassetto, il testo tra virgolette a colori e i segnaposto in corsivo, nell'editor come nella vista di lettura. Le parole di blocco delle condizioni e dei cicli, `else` ed `end` sono inoltre sottolineate a puntini nell'editor.
- **Indicazione del controllo:** la modalità live, la vista renderizzata e la vista divisa mostrano sopra il blocco il risultato del controllo: in verde «pronto» o in rosso «Riga N: motivo», con «(+N altri)» in caso di più rilievi. Lì compaiono anche gli avvisi su più blocchi e su un attivatore non ancora supportato, nonché i rilievi della pianificazione con la loro riga nell'intestazione. L'indicazione segue il testo poco dopo ogni modifica e mostra lo stesso rilievo che segnala l'avvio. Nella stampa, in un'esportazione e in un file incorporato la riga d'intestazione non compare.
- **Pulsante «Attivato»:** con `trigger: schedule` e `trigger: event`, la riga d'intestazione porta accanto ad «Avvia» il pulsante per attivare (sezione «Pianificazione e attivazione»).

Evidenziazione e indicazione non modificano il testo del file.

## Limiti

- **Solo nell'area:** nessun comando legge o scrive fuori dalla radice dell'area in cui il workflow è stato avviato, nemmeno tramite un segnaposto; ciò vale anche per un workflow di un'area collegata.
- **Nessuna rete, nessun programma esterno.** Si elimina solo con `delete`, solo in un avvio a mano, dopo una conferma e verso il cestino.
- **Nessuna esecuzione senza area aperta:** un workflow pianificato viene eseguito solo finché l'applicazione e la sua area sono aperte; recupera le scadenze perse secondo le regole di `missed`. Anche gli eventi agiscono solo con l'area aperta e non vengono recuperati.
- **Nessuna catena:** un workflow reagisce a ciò che fate voi o altri programmi, mai a ciò che fa un workflow. Chi vuole una sequenza richiama il workflow successivo con `workflow "Nome"`; contro un ciclo attraverso altri programmi, il freno di emergenza ferma un workflow dopo più di 20 esecuzioni da eventi in 5 minuti (sezione «Eventi»).
- **Limiti dei blocchi:** al massimo tre livelli di annidamento, nessun ciclo dentro un ciclo e al massimo 500 file per ciclo.
- **Nessun annullamento di un'esecuzione:** i passi eseguiti restano eseguiti; il registro mostra ciò che l'ultima esecuzione ha toccato, e si annulla in modo mirato.
- **Le macro** restano come sono e si possono richiamare come passo; una macro è una sequenza di comandi nelle impostazioni, un workflow una procedura come documento. **I [blocchi di script](scripts.md)** restano di sola lettura, anche come passo di script; un workflow non è un linguaggio di script generale, ma un catalogo fisso di comandi.

## Fasi successive

È prevista un'altra fase, senza che portata e tempi siano fissati: comandi per la [banca dati](database.md). Il controllo conosce già le parole chiave di questi comandi e le segnala come «disponibile solo in una fase successiva», affinché un file del genere non venga eseguito in parte.
