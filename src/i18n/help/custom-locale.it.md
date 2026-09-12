# Lingua dell'interfaccia propria

L'interfaccia è disponibile in cinque lingue fornite. Chi ne ha bisogno di una sesta — una lingua regionale, una lingua che nessun programma serve o semplicemente il lessico del proprio ambito — la traduce da sé. Il percorso ha tre passi: **scaricare il modello**, **tradurlo nel proprio editor**, **caricarlo**. La lingua propria compare poi nella selezione della lingua della barra di stato, accanto a quelle fornite. Tutti i percorsi si trovano nel menu File → Lingua propria: «Scaricare il modello…», «Caricare…», «Rimuovere…» e «Aggiornare…».

I percorsi di comando appartengono all'estensione «Lingua dell'interfaccia propria» ([Estensioni](extensions.md)); nello stato disattivato il sottomenu scompare. Una lingua già caricata non ne è toccata: continua a essere letta e resta selezionata. Lo stato disattivato toglie un percorso, mai una lingua.

## Scaricare il modello

«File → Lingua propria → Scaricare il modello…» scrive l'intero patrimonio di testi dell'applicazione in un file JSON; la consueta finestra di salvataggio chiede posizione e nome. Il modello porta **sempre l'inglese**, indipendentemente dalla lingua impostata: l'inglese è la versione di riferimento con cui una traduzione viene poi confrontata.

Il file è un elenco piatto di chiavi e testi. In cima stanno due voci vuote con cui la lingua si dà un nome; sotto segue, voce per voce, il patrimonio inglese:

```json
{
  "@@locale": "",
  "@@name": "",
  "toolbar.open": "Open",
  "view.source": "Source",
  "view.split": "Split",
  …
}
```

A sinistra sta la chiave, a destra il testo. **Si traduce esclusivamente la parte destra.** Le chiavi restano invariate: è attraverso di esse che l'applicazione ritrova i suoi testi.

Come si chiami il file, invece, non ha alcun significato. Può assumere qualsiasi nome nel copiarlo, nello scaricarlo una seconda volta o nel rinominarlo; quale lingua porti è scritto **dentro** di esso e non nel suo nome.

## Tradurre nel proprio editor

Il file è normale JSON e si modifica in qualsiasi editor che salvi il testo in UTF-8. Quattro cose meritano attenzione.

### Dare un nome alla lingua

Le due voci in cima sono vuote perché siano riconoscibili come un invito:

- `@@locale` è il **codice** della lingua: due o tre lettere, facoltativamente con un'aggiunta di scrittura o di regione, quindi `nds` oppure `nds-DE`. Si verifica la forma, non l'esistenza: chi traduce una lingua che nessuna norma registra deve poterla nominare comunque. Il codice di una lingua fornita non è ammesso: una lingua propria si affianca **a** quelle fornite, non ne sostituisce nessuna.
- `@@name` è il **nome visualizzato**, così come deve comparire nella selezione della lingua, al massimo 40 caratteri. È consuetudine indicare il nome della lingua nella lingua stessa.

### Segnaposto

Alcuni testi portano segnaposto tra parentesi graffe, per esempio `{name}` oppure `{n}`. L'applicazione vi inserisce un valore durante l'esecuzione: un nome di file, un numero. I segnaposto si riprendono **invariati**: stessa grafia, stesso insieme. La loro **posizione nella frase** è invece libera, perché nessuna costruzione di frase somiglia a un'altra.

### Formattazione

Una parte dei testi porta formattazione Markdown perché compare in una tabella del manuale: una parola in caratteri di codice, più di rado un collegamento o una messa in risalto. La regola è questa: un testo tradotto può portare esattamente i **tipi** di formattazione che l'originale porta alla **stessa** voce, non lo stesso numero. Dove l'originale ha un tratto di codice, ce ne possono essere due; dove non ha alcun collegamento, non se ne aggiunge nessuno. E un collegamento punta a una destinazione ordinaria: `http`, `https`, `mailto` o una destinazione interna al manuale.

### L'incompleto è ammesso

Una traduzione non deve essere finita per avere effetto. Basta che il file porti almeno una voce nota; tutto il resto può restare in inglese ed essere completato più tardi. Ciò che manca compare in inglese — si veda la sezione «Ciò che non è ancora tradotto».

## Caricare e verificare

«File → Lingua propria → Caricare…» chiede il file. La verifica avviene **prima** che venga depositato alcunché: dimensione e struttura, poi ogni voce quanto a un testo come valore, a segnaposto invariati, a formattazione ammessa e a destinazioni di collegamento ammesse, oltre ai due campi del nome.

Valgono qui due garanzie:

- **Un rifiuto nomina la voce** a cui si riferisce, insieme al motivo: per esempio che i segnaposto di una determinata chiave differiscono da quelli dell'originale. Il punto è così reperibile nell'editor, invece di dover scorrere l'intero file.
- **Nulla viene ripreso a metà.** Se la verifica trova una violazione, il patrimonio esistente resta intatto; non nasce alcuna lingua composta per metà dal file e per metà dal nulla.

Se la verifica passa, il messaggio nomina la lingua e il numero di voci acquisite. Le chiavi che l'applicazione non conosce — resti di un modello più vecchio — vengono saltate e conteggiate nello stesso messaggio.

Se è già caricata una lingua propria con lo stesso codice, **l'applicazione chiede prima**; annullare è il valore predefinito. La sostituzione sovrascrive la versione caricata in precedenza; il file da cui proviene resta intatto.

## Scegliere la lingua propria

Si sceglie come ogni altra: tramite la selezione della lingua nella barra di stato ([Viste e visualizzazione](views-display.md)). Le lingue proprie vi compaiono in un gruppo a sé, «Lingue proprie», sotto quelle fornite, con il nome tratto da `@@name`.

La scelta ha effetto subito e ovunque: nella finestra, nei menu e nelle finestre di dialogo del sistema operativo, e ciò in tutte le finestre aperte. Si mantiene oltre un riavvio: la lingua propria è un'impostazione come ogni altra.

Se una volta il file della lingua non fosse reperibile, l'impostazione resta comunque in piedi: l'interfaccia mostra l'inglese e un messaggio dice quale lingua propria manca. Non appena il file torna, la lingua ha di nuovo effetto senza ulteriori interventi.

## Ciò che non è ancora tradotto

Se una voce manca nel file della lingua propria, l'applicazione mostra il testo **inglese**, voce per voce e non pagina per pagina né finestra per finestra. È voluto e non è un difetto: un'interfaccia tradotta a metà è utilizzabile fin dall'inizio, e il lavoro può procedere per tappe.

Chi dunque ha impostato la propria lingua e accanto vede diciture inglesi vede le **lacune della sua traduzione** e non un errore del programma. Si chiudono non appena le voci interessate sono nel file e questo viene caricato di nuovo.

## Dopo una nuova versione del programma

Un'applicazione che cresce porta con sé testi che un file tradotto in precedenza non può conoscere. La lingua propria invecchia per questo, e l'applicazione lo dice: un messaggio nella barra di stato nomina la lingua e il **numero di voci mancanti**. Compare una volta per stato: lo stesso stato non si segnala di nuovo, mentre un numero diverso o un'altra versione del programma sì.

«File → Lingua propria → Aggiornare…» ne fornisce il mezzo. Questo percorso salva il file della lingua propria allo stato della versione in esecuzione: il nome e le traduzioni proprie restano, e le voci mancanti figurano al loro posto in inglese. Traducete ciò che è ancora inglese e caricate di nuovo il file. La differenza rispetto al modello sta nella sola fonte: qui la lingua propria invece dell'inglese.

Una finestra di dialogo propone le lingue caricate per una scelta, anche se ve n'è una sola; ciò è indipendente da quale sia impostata. Il messaggio indica quante voci del file salvato sono ancora in inglese. Se non è caricata alcuna lingua propria, lo dice un messaggio invece di una finestra vuota.

## Rimuovere

«File → Lingua propria → Rimuovere…» propone in scelta le lingue caricate con il loro nome; annullare è il valore predefinito. Viene cancellato il file della lingua nel profilo dell'utente; il file da cui è stata caricata resta dove si trova.

Se la lingua rimossa è quella impostata, l'interfaccia passa all'inglese. È questa la differenza rispetto al file mancante di cui sopra: a chi toglie da sé una lingua non se ne deve ricordare l'assenza a ogni avvio.

## Dove si trova il file della lingua

Al caricamento l'applicazione deposita una copia nel **profilo dell'utente**, nella cartella `locales`, accanto ai suoi altri dati. Ne derivano tre garanzie:

- La lingua propria **sopravvive a una reinstallazione** del programma; si trova fuori dalla directory del programma.
- **Non viene scritto nulla nella directory del programma.** Il percorso non richiede quindi diritti elevati e funziona anche là dove la directory del programma è protetta da scrittura.
- Il file depositato è **dello stesso tipo** di quello caricato: porta con sé il proprio nome e si chiama secondo il codice della lingua. Chi vuole conservarlo o trasmetterlo, lo copia.

Il file viene riletto a ogni avvio e in quell'occasione verificato di nuovo: la cartella è raggiungibile con un editor, e per questo la verifica non avviene solo al caricamento.

## Ciò che la funzione non fa

Tre limiti ne fanno parte, perché l'aspettativa sia corretta:

- **Il manuale resta nelle cinque lingue fornite.** Ciò che viene tradotto è l'interfaccia, non la documentazione; con una lingua propria impostata, le pagine del manuale compaiono in inglese.
- **Non c'è alcun aiuto alla traduzione.** L'applicazione non propone nulla, non traduce nulla da sé e non verifica alcuna correttezza linguistica. Verifica la **forma** di un file, non il suo contenuto.
- **Non c'è alcun luogo di scambio.** Le lingue finite non si ottengono da un punto di raccolta. Un file di lingua è un file ordinario e segue la via di ogni altro: su supporto dati, come allegato, tramite una cartella condivisa.
