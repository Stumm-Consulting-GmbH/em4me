# Banca dati

Un file Markdown può dichiarare di essere una **tabella di banca dati** e indicare quali campi ha questa tabella. La definizione si trova nel frontmatter dello stesso file che porta anche i record; così la tabella è completa in un solo file e sopravvive a ogni operazione sul file, compresi la ridenominazione e lo spostamento al di fuori dell'applicazione.

Distinzione: la [Perspective Datatable](datatable.md) è una tabella tipizzata **all'interno di un documento**, pensata per insiemi piccoli e calcolabili, mentre la tabella di banca dati è una tabella con nome **e file proprio**, ai cui record si rimanda da altri file.

Il formato di definizione è lo stesso dei [Profili di proprietà](property-profiles.md): le stesse indicazioni per campo, la stessa linea morbida in caso di errore. Una definizione di tabella **non** è comunque un profilo di proprietà, e un file di tabella non compare nell'elenco dei profili nelle impostazioni.

## Il file della tabella

Il contenitore `db-table` nel frontmatter designa il file come tabella e porta sotto `fields` una voce per colonna:

```yaml
---
db-table:
  fields:
    - name: titolo
      type: string
      label: Titolo
      required: true
      options:
        maxLength: 120
    - name: pagine
      type: number
      options:
        decimals: 0
    - name: stato
      type: string
      values: [disponibile, in prestito, mancante]
      default: disponibile
    - name: autore
      type: record
      options:
        table: Autori
  key: titolo
  display: titolo
  lastId: 42
---
```

Già la sola **presenza** della chiave rende il file una tabella, indipendentemente dal fatto che il suo contenuto sia utilizzabile. Una tabella con un refuso nella definizione non scompare quindi in silenzio dalla banca dati, ma resta una tabella che segnala un errore.

## Indicazioni per colonna

| Indicazione | Significato |
| --- | --- |
| `name` | **Obbligatorio.** Il nome tecnico della colonna. Resta neutro rispetto alla lingua, perché figura nei rimandi e nell'ordine dei record |
| `type` | uno degli otto tipi di colonna qui sotto; senza indicazione vale `string` |
| `label` | l'etichetta per la visualizzazione, come testo o come corrispondenza da lingua a testo |
| `required` | `true` se la colonna esige un valore |
| `values` | insieme di valori fisso sotto forma di elenco |
| `default` | valore predefinito della colonna |
| `options` | indicazioni proprie del tipo, vedi sotto |

Il nome è l'**unica indicazione obbligatoria**; ogni altra indicazione si può omettere singolarmente.

## Tipi di colonna

| Tipo | Significato |
| --- | --- |
| `string` | testo, il tipo predefinito |
| `multiline` | testo su più righe |
| `number` | numero |
| `boolean` | vero/falso |
| `date` | data |
| `time` | ora |
| `link` | collegamento a un **file** |
| `record` | collegamento a un **record** di un'altra tabella |

Il collegamento a un record è il tipo con cui due tabelle entrano in relazione: un `link` punta a un file, ma un record non è un file, bensì una riga in una tabella.

**Uno stato intermedio vale per entrambi i tipi di collegamento.** La visualizzazione mostra il valore di una colonna di tipo `link` o `record` come testo e non risolve il collegamento; lì non è cliccabile. La risoluzione arriverà con una tappa successiva. Il collegamento a un singolo record non ne è toccato: si scrive nel testo corrente e più sotto ha una sezione propria.

**Tre cose sono escluse in una colonna di tabella**, e l'avviso indica ogni volta il motivo e non il solo fatto:

- **i campi calcolati** (`formula`, `lookup`) — una tabella non porta colonne calcolate; il calcolo avviene nelle query sui dati.
- **i valori strutturati** (`object`, `objectlist`) — ciò che un oggetto esprime in una cella si esprime altrimenti con una tabella dipendente attraverso una relazione.
- **le colonne a più valori** (`multistring` come tipo, `multiple: true` su un altro tipo) — una colonna multipla è una relazione travestita da colonna.

Come indicazioni di un **campo di documento** tutte e tre restano ammesse senza variazioni; sono escluse soltanto in una colonna di tabella.

## Indicazioni proprie del tipo

Il sotto-oggetto `options` porta le indicazioni che valgono solo per un determinato tipo. Sono le stesse dei [Profili di proprietà](property-profiles.md), ampliate di un'indicazione che esiste solo su una colonna:

| Tipo | Indicazione | Significato |
| --- | --- | --- |
| `string` | `maxLength` | lunghezza massima in caratteri. Un valore più lungo viene segnalato e **non troncato** |
| `number` | `decimals` | decimali attesi, da zero a dieci. Un valore con più decimali viene segnalato e **non arrotondato** |
| `record` | `table` | nome della tabella a cui punta il collegamento al record |

La lunghezza massima e i decimali fanno parte del fondo comune di indicazioni e valgono perciò allo stesso modo per le normali proprietà di un documento. Entrambe sono un **avviso sul campo** e non modificano mai il valore salvato.

## Relazioni tra tabelle

Una colonna di tipo `record` è una **colonna di collegamento**. La sua indicazione `table` indica la tabella di destinazione con il nome del suo file senza estensione, senza distinguere maiuscole e minuscole, e ogni cella della colonna punta a un record di quella tabella:

```yaml
- name: autore
  type: record
  options:
    table: Autori
```

Nella cella può stare una di due cose:

- l'**identificatore** del record di destinazione, anche nella forma breve: `r-00007` e `r-7` puntano allo stesso record;
- il **valore della chiave funzionale** del record di destinazione, se quella chiave è composta da un solo campo, per esempio `Umberto Eco`. Il confronto avviene carattere per carattere, come per la chiave stessa.

Un testo nella forma di un identificatore viene sempre letto come identificatore. La scrittura `[[Autori#^r-00007]]` di un collegamento nel testo corrente non va nella cella; lì vale come un normale valore di chiave. Una cella vuota non è un collegamento e non viene verificata; se debba essere compilata lo dice `required`.

**Nel salvataggio da parte dell'applicazione ogni collegamento viene verificato e scritto come identificatore.** La tabella di destinazione deve esistere nell'area, e il contenuto della cella deve colpire esattamente un record che esiste dopo la modifica; un record creato nella stessa modifica conta, uno eliminato in essa no. Se non ne colpisce nessuno o ne colpisce più di uno, la modifica viene respinta. La risoluzione tramite il valore di chiave funziona solo se la tabella di destinazione ha una chiave funzionale a un solo elemento; con una chiave a più elementi l'identificatore è l'unica via. Ciò che è stato risolto, l'applicazione lo scrive nella cella come identificatore completo, sia che vi fosse il valore di chiave sia la forma breve; se in seguito il valore di chiave del record di destinazione cambia, il collegamento resta valido. Un record può anche rimandare a se stesso.

**Un record a cui si rimanda ancora non si può eliminare.** Questo vale per ogni colonna di collegamento dell'area che punta alla sua tabella, anche per una della stessa tabella, e per i collegamenti tramite l'identificatore come tramite il valore di una chiave a un solo elemento. L'avviso indica la tabella che rimanda, le sue colonne di collegamento, il numero dei record che rimandano e il primo di essi. L'applicazione non elimina nulla insieme a esso e non svuota alcun collegamento. Chi vuole eliminare un'intestazione con le sue righe le elimina entrambe in **un'unica** modifica; allo stesso modo un collegamento non conta più se la stessa modifica lo rivolge a un'altra destinazione o lo svuota. Un collegamento nel testo corrente, per esempio `[[Autori#^r-00007]]`, invece non protegge: può rompersi come un collegamento a un file eliminato.

Entrambe le verifiche hanno bisogno della visione d'insieme delle tabelle dell'area. Se le tabelle non sono ancora state lette completamente, l'applicazione respinge una modifica che imposta un collegamento o elimina un record, e l'avviso chiede di riprovare tra un momento.

## Etichette in più lingue

L'etichetta si trova alla chiave `label`, come testo semplice oppure come corrispondenza da lingua a testo:

```yaml
- name: titolo
  label:
    de: Titel
    en: Title
    fr: Titre
```

Il **nome** del campo non ne è toccato: se fosse traducibile, una banca dati trasmessa ad altri si sfalderebbe al primo cambio di lingua. Se una corrispondenza è difettosa in sé, decade l'etichetta intera e la visualizzazione ripiega sul nome tecnico, invece di mostrare alcune lingue e lasciarne sparire altre in silenzio.

## Identificatore di record, chiave funzionale e forma di visualizzazione

Ogni record porta un **identificatore interno** della forma `r-00042`: il contrassegno `r-` per record e un numero di almeno cinque cifre. La larghezza è una larghezza minima e non un limite; dopo `r-99999` viene `r-100000`. Vengono lette entrambe le scritture, `r-42` e `r-00042` indicano lo stesso record.

Un collegamento a un record indica la tabella e l'identificatore, scritto come un'ancora di blocco: `[[Personen#^r-00042]]`. Che cosa produce un collegamento del genere e quando vale è descritto più sotto, nella sezione sulla reperibilità.

Tre indicazioni della definizione ne fanno parte:

| Indicazione | Significato |
| --- | --- |
| `lastId` | livello di piena: il numero più alto mai assegnato dalla tabella. L'identificatore successivo nasce da esso e non dai record esistenti, affinché il numero di un record eliminato non venga assegnato una seconda volta |
| `key` | la chiave funzionale: un nome di campo o un elenco di nomi di campo. Facoltativa, perché una tabella di movimenti o di misure non ha una chiave leggibile dall'uomo che abbia senso |
| `display` | il campo con cui un record viene designato. Senza indicazione vale una chiave funzionale a un solo elemento, senza nessuna delle due l'identificatore interno |

Se la chiave funzionale indica un campo che la definizione non conosce, decade la chiave **intera**: mezza chiave sarebbe una falsa promessa di univocità.

**Nel salvataggio da parte dell'applicazione la chiave funzionale resta univoca.** L'applicazione la verifica rispetto a tutti i record della tabella, anche a quelli nei suoi file successivi, e respinge una modifica dopo la quale due record porterebbero la stessa chiave; in quel caso non viene scritto nulla. L'avviso distingue tre situazioni:

- La stessa chiave compare **due volte nella stessa modifica**.
- La chiave è **già assegnata a un record**. L'avviso lo indica con il suo identificatore e la sua forma di visualizzazione.
- La chiave è **già assegnata più volte nei record esistenti**. In tal caso occorre prima correggere i record esistenti; l'avviso indica i record che la portano.

Una chiave a più elementi conta come doppia solo se tutti i suoi elementi coincidono. Se un elemento è vuoto, la chiave non viene verificata; se il campo debba essere compilato lo dice l'indicazione `required`. Il confronto avviene carattere per carattere: `Müller` e `MÜLLER` sono due chiavi diverse, e uno spazio iniziale conta. Una modifica che lascia invariata la chiave di un record non la verifica; un record che fa parte di un doppione esistente resta così modificabile nei suoi altri campi. Eliminare e ricreare la stessa chiave in un'unica modifica è consentito, così come scambiare le chiavi di due record.

## I record nel file

I record si trovano nel corpo dello stesso file, in un blocco proprio:

````markdown
```perspective-records
|- id="r-00001"
| Il nome della rosa
| 640
| disponibile
|- id="r-00002"
| Il pendolo di Foucault
| 880
| in prestito
```
````

Le regole sono volutamente brevi, perché il file è un archivio tecnico:

- Una riga che inizia con `|-` in **colonna 0** apre un record. Segue il suo identificatore interno.
- Una riga che inizia con `| ` in colonna 0 apre una cella. Ogni riga successiva appartiene alla cella corrente, quindi un valore può occupare più righe.
- Non esiste una **riga di intestazione**. Le celle corrispondono ai campi della definizione, nell'ordine; quell'ordine è il contratto.
- Conta solo la colonna 0. Una riga rientrata è sempre contenuto, anche se sembra un marcatore.
- Se una riga deve iniziare essa stessa con `|` oppure `!`, viene preceduta da una barra rovesciata: `\| così un valore inizia con una barra`.

**Non si perde mai un carattere.** Se un record ha troppe poche celle, i campi restanti rimangono vuoti; se ne ha troppe, quelle in eccesso restano intatte. Entrambi i casi vengono segnalati, ma nulla viene scritto via in silenzio — è l'unico errore che un archivio di dati non deve commettere.

## Regole di verifica

Una regola di verifica stabilisce quali valori una tabella accetta. Si trova nella definizione, in uno di due punti a seconda della sua portata:

- **`check` sulla voce di una colonna** verifica il solo valore di quella colonna.
- **`checks` al livello superiore del contenitore** è un elenco di condizioni su più campi di un record.

```yaml
db-table:
  fields:
    - name: cap
      check: '/^\d{4}$/'
    - name: quantita
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: Al massimo 100 pezzi per riga.
    - name: inizio
      type: date
    - name: fine
      type: date
  checks:
    - rule: fine >= inizio
      message: La fine è anteriore all'inizio.
```

Una regola è un testo oppure un oggetto `{ rule, message }` con un messaggio proprio; su un campo è ammesso anche un elenco di entrambe le forme. Il testo di una regola di campo assume una di tre forme:

- Un'**espressione regolare** sta tra barre, seguita facoltativamente da flag, per esempio `/^\d{4}$/` oppure `/^[a-z]+$/i`. I flag `g` e `y` sono esclusi. Una barra nel modello non ha bisogno di una barra rovesciata, perché il modello arriva fino all'ultima barra.
- Una **singola parola** è il nome di una regola fornita con l'applicazione. L'applicazione non ne conosce ancora nessuna; un nome sconosciuto decade con un avviso.
- **Ogni altro testo** è una condizione del linguaggio di interrogazione in cui il valore proprio si chiama `value`, per esempio `value > 0 AND value <= 100`. Non deve indicare un altro campo; una condizione su più campi va sotto `checks`.

Una regola sotto `checks` è sempre una condizione del linguaggio di interrogazione. Indica i campi con il loro nome, senza distinguere maiuscole e minuscole.

Il confronto avviene come in ogni interrogazione: un numero come numero, una data e un'ora in ordine cronologico, anche rispetto a una data della forma `date(2026-01-01)`, un testo senza distinguere maiuscole e minuscole.

**C'è una trappola da conoscere.** Il linguaggio di interrogazione non conosce le parole `true`, `false` e `null`; le legge come nomi di campo, e la regola decade con un avviso. Un valore vero/falso si verifica con `value` da solo oppure con `NOT value`, sotto `checks` con il nome del campo da solo oppure preceduto da `NOT`. Se un campo è compilato lo dice `required`, non una regola di verifica.

**Nessuna regola di campo verifica un valore vuoto**, né un valore che non corrisponde al suo tipo; quello lo segnala già la verifica del tipo. L'eccezione è il valore vero/falso: la sua cella vuota significa «no», e `value` richiede perciò una casella spuntata. Una regola sotto `checks`, invece, viene sempre verificata; un confronto con un campo vuoto non è allora soddisfatto. Una regola che non si può valutare, per esempio a causa di una divisione per zero, conta come violata.

**Nel salvataggio da parte dell'applicazione le regole agiscono in modo rigoroso.** Viene verificato il record così come sarebbe dopo la modifica, con tutti i suoi campi e non solo quelli modificati. Se viola una regola, la modifica viene respinta. Per una regola di campo l'avviso indica il campo, il valore e la regola, per una regola sotto `checks` il record e la regola, e aggiunge il messaggio della regola se ne ha uno. L'eliminazione non verifica alcuna regola.

**In lettura agiscono in modo morbido.** Un valore che viola una regola di campo viene contrassegnato nella visualizzazione come un valore che non corrisponde al suo tipo; la cella mostra il suo testo invariato, il record resta visibile e nel file non cambia nulla. Allo stesso modo viene contrassegnata una cella vuota di un campo con `required`. Le regole sotto `checks` non agiscono in lettura, perché non hanno una singola cella che si possa contrassegnare.

## Modificabilità condizionata

L'indicazione `editable` al livello superiore del contenitore stabilisce a quale condizione un record può ancora essere modificato, per esempio perché una fattura registrata resti invariata:

```yaml
db-table:
  fields:
    - name: stato
      values: [aperta, registrata]
  editable:
    rule: stato != "registrata"
    message: Una fattura registrata non viene più modificata.
```

La condizione è un'espressione del linguaggio di interrogazione sui nomi di campo della tabella, come testo oppure come oggetto `{ rule, message }` con un messaggio proprio. Una tabella ha esattamente una condizione; chi ne ha bisogno di più le combina nell'espressione.

Nel salvataggio da parte dell'applicazione vale quanto segue:

- La condizione vale per la **modifica e l'eliminazione** di un record. La **creazione** resta sempre libera.
- Si misura sullo stato **salvato** del record prima della modifica, non sui nuovi valori. Chi riporta indietro lo stato nella stessa modifica resta perciò bloccato.
- Se la condizione non è soddisfatta, la modifica viene respinta. L'avviso indica il record e la condizione e aggiunge il messaggio.
- Una condizione che non si può valutare blocca.
- Un'indicazione inservibile decade con un avviso, e la tabella resta modificabile.

Senza questa indicazione ogni record è modificabile.

## Visualizzazione dei record

Nella vista di lettura e nella modalità di modifica il blocco compare come tabella con le colonne della definizione. Ogni valore è rappresentato secondo il tipo della sua colonna: numeri allineati a destra e con i decimali dichiarati, valori di verità come segno di spunta, valori su più righe con le loro interruzioni. Se un valore non corrisponde al suo tipo, la cella mostra il testo originale ed è evidenziata a colori invece di essere sostituita.

Da **2000 record** in poi la vista mostra un estratto e indica sotto di che cosa è un estratto. È una finestra e non un troncamento silenzioso: si vede che c'è dell'altro. Il limite è stato misurato e non stabilito a tavolino — fino a quel punto la tabella compare senza attesa percepibile.

Nell'**esportazione portabile**, invece, la tabella è completa, senza finestra. Un file che si consegna non deve nascondere nulla: il destinatario non ha l'applicazione e non vedrebbe che manca qualcosa.

In questa vista i record non si modificano: si modificano nella loro **maschera**, descritta nella sezione seguente; il pulsante all'inizio di ogni riga la apre. Il file di tabella è un archivio tecnico — resta leggibile a mano e, in caso di necessità, correggibile a mano, ma nel funzionamento normale non ci si lavora dentro.

## Modificare i record nella maschera

Ogni record ha una **maschera**: una pagina propria che mostra i suoi campi uno sotto l'altro, nell'ordine della definizione, ciascuno con la sua etichetta. L'applicazione la genera dalla definizione della tabella; non c'è nulla da costruire. Nella maschera si creano, si modificano e si eliminano i record.

### Aprire e creare

Un record esistente si apre con il pulsante **«Apri record»** all'inizio della sua riga, prima del pulsante dei giustificativi di modifica, sia nella vista di lettura sia nella modalità Live. Da tastiera vi porta il tasto freccia sinistra a partire dal pulsante dei giustificativi.

Tre vie creano un nuovo record:

- il pulsante **«Nuovo record»** sotto ogni tabella, anche sotto una tabella vuota,
- il pulsante **«Nuovo record»** nella riga di ogni tabella nella panoramica della banca dati,
- il comando **«Nuovo record nella tabella attiva»** nella palette dei comandi. Agisce sul file di tabella della scheda attiva; se lì non ne è aperto nessuno, la barra di stato lo segnala.

La maschera si apre in una scheda a sé il cui titolo indica il file e il record. Ne esiste una per finestra: se si apre un altro record, la stessa scheda lo mostra. Se la modifica in corso non è ancora salvata, la maschera chiede prima se debba essere scartata.

Un nuovo record riceve il suo identificatore interno già all'apertura della maschera: compare nell'intestazione, e il livello di piena `lastId` della tabella è già aggiornato. I campi sono vuoti, e il record arriva nel file solo con il primo salvataggio.

### Leggere e modificare

La maschera si apre **in lettura**. I valori compaiono come testo, un valore di verità come segno di spunta, e un campo obbligatorio è contrassegnato come tale. L'intestazione porta le azioni **«Modifica»**, **«Elimina»** e **«Giustificativi»**; l'ultima apre i giustificativi di modifica del record.

**«Modifica»** trasforma ogni campo in un inserimento nella forma del suo tipo:

| Tipo | Inserimento |
| --- | --- |
| `string`, `link`, `record` | inserimento di testo su una riga, per `record` con aiuto alla scelta |
| `multiline` | inserimento di testo su più righe |
| `number`, `date`, `time` | inserimento di un numero, di una data o di un'ora |
| `boolean` | casella di controllo |

Un valore che non corrisponde al suo tipo riceve invece il semplice inserimento di testo, perché si possa vedere e correggere ciò che sta nel file; un inserimento numerico lo scarterebbe altrimenti in silenzio.

**«Salva»** scrive la modifica e torna alla lettura, **«Scarta»** torna allo stato letto senza scrivere nulla. Vengono scritti solo i campi modificati. Se non si è modificato nulla, non c'è nulla da salvare, e la barra di stato lo segnala.

Se un record non è modificabile secondo la condizione della sua tabella, **«Modifica»** ed **«Elimina»** mancano, e una frase nella maschera ne indica il motivo, con il messaggio della condizione se ne ha uno.

### Campi di riferimento e aiuto alla scelta

Un campo di tipo `record` mostra in lettura la forma di visualizzazione del suo record di destinazione e il suo identificatore, per esempio `Umberto Eco (r-00007)`, anche quando nel file c'è la forma breve `r-7`. Se il valore non colpisce esattamente un record della tabella di destinazione, un avviso sul campo lo segnala.

In modifica il campo offre un **aiuto alla scelta**: un elenco dei record della tabella di destinazione, ciascuno con forma di visualizzazione e identificatore. Digitare restringe l'elenco, una scelta inserisce l'identificatore, e il tasto Esc chiude l'elenco. Se corrispondono più di cinquanta voci, l'elenco indica quante altre ce ne sono.

Scegliere non è obbligatorio. Una forma breve dell'identificatore o un valore della chiave funzionale a un solo elemento inserito a mano resta com'è, e al salvataggio l'applicazione scrive al suo posto l'identificatore completo, come descritto nella sezione «Relazioni tra tabelle». Se la definizione non indica alcuna tabella di destinazione o se questa non esiste, il campo è di sola lettura.

### Messaggi e modifiche altrui

Se l'applicazione respinge una modifica, non viene scritto nulla; la maschera resta in modifica, e quanto inserito resta com'è. Ogni messaggio sta dove deve stare. Se riguarda un campo, compare su quel campo, il campo è contrassegnato, e il primo campo interessato riceve il focus. Una regola violata sotto `checks` contrassegna tutti i suoi campi e compare nell'intestazione della maschera, come ogni messaggio che non appartiene ad alcun campo, per esempio quello della protezione dall'eliminazione.

Già in lettura la maschera contrassegna con un messaggio sul campo un valore che non corrisponde al suo tipo, che viola una regola di campo o che manca pur essendo obbligatorio.

Se qualcuno ha modificato il record da quando la maschera lo ha letto, per esempio a mano nel file di tabella, l'applicazione per il momento non salva. La maschera mostra allora il riquadro **«Il record è stato modificato nel frattempo»** con due vie:

- **«Ricarica»** scarta la modifica in corso e mostra lo stato trovato.
- **«Salva comunque»** scrive la propria versione. Un giustificativo del tipo **Modificato dall'esterno** fissa la differenza trovata, così che nulla scompaia senza che lo si noti.

Anche la seconda via verifica tutte le regole della tabella; con essa non si può aggirare alcuna regola.

### Eliminare

**«Elimina»** chiede prima conferma: **«Eliminare questo record?»** Con **«Sì, elimina»** il record viene eliminato e la maschera si chiude; **«No»** lascia tutto com'è. Un record a cui punta ancora una colonna di collegamento non si può eliminare nemmeno qui. Quali record rimandano a esso lo mostra in anticipo l'utilizzo descritto più avanti.

### La maschera come file

La maschera generata si può impaginare. Il comando **«Salva maschera come file»** nell'intestazione della maschera la scrive come documento ordinario accanto al file di tabella, con il nome di questo seguito da ` Form`, per `Clienti.md` quindi `Clienti Form.md`. Un file esistente con quel nome non viene mai sovrascritto. Il nuovo file comincia con la versione generata:

```markdown
---
title: Clienti Form
db-form:
  table: Clienti
---

# Clienti

**Nome:** {{field:nome}}

**Quantità:** {{field:quantita}}
```

Il contenitore `db-form` indica la tabella, e per ogni campo compare nel testo un **segnaposto di campo** `{{field:<nome>}}`. Intorno ai segnaposto tutto è normale Markdown: un titolo tra due campi o una frase esplicativa compare nella maschera così come sta nel file. Una barra rovesciata davanti alle parentesi graffe trasforma un segnaposto in testo normale.

Alla successiva apertura la maschera mostra il testo del file. L'intestazione indica allora da quale file proviene la maschera, e il comando non viene più offerto; la panoramica della banca dati indica il file nella colonna **«Maschera»**. Se il file viene eliminato, la maschera mostra di nuovo la versione generata.

**Viene letto solo il segnaposto di campo.** Un campo che il file non indica non viene mostrato dalla maschera, e al salvataggio resta intatto; un nuovo record riempie solo i campi indicati. Ogni altro segnaposto e un nome di campo che la tabella non conosce restano come testo e vengono segnalati, come descritto nella sezione «Indicazioni difettose».

## Salvataggio da parte dell'applicazione

I record si creano, si modificano e si eliminano nella maschera descritta nella sezione precedente. Essa salva attraverso una via dell'applicazione che è la stessa per ogni modifica ai record; ciò che descrive questa sezione vale quindi per ciascuna di esse.

Ogni modifica passa per una via che la verifica prima della scrittura. Un valore che non corrisponde al tipo del suo campo viene respinto, così come un campo vuoto che richiede un valore. In entrambi i casi non viene scritto nulla.

A ciò si aggiungono le regole della definizione della tabella, descritte nelle sezioni precedenti. Una modifica viene respinta anche se

- dopo di essa una **chiave funzionale** sarebbe assegnata due volte,
- un **collegamento** non colpisce alcun record o ne colpisce più di uno, oppure manca la sua tabella di destinazione,
- si vuole eliminare un record a cui si **rimanda** ancora,
- un valore o un record viola una **regola di verifica**,
- un record **non è modificabile** secondo la condizione della sua tabella, oppure
- le tabelle dell'area **non sono ancora state lette completamente** e la modifica imposta un collegamento o elimina un record.

L'applicazione segnala insieme i motivi che derivano da queste regole, non solo il primo.

**Un salvataggio ha effetto per intero o per niente**, anche quando tocca più tabelle e più file: dopo ci sono tutte le sue modifiche oppure nessuna. Scrive i suoi giustificativi di modifica nella stessa operazione, e tutti i giustificativi di un'operazione portano lo stesso **identificatore di operazione**.

Prima che le nuove versioni dei file abbiano effetto, l'applicazione le scrive in modo definitivo sul supporto di memoria. Un'interruzione di corrente o una connessione di rete che cade non lascia quindi alcuna operazione a metà. (Su Linux questo vale con una riserva: lì l'applicazione non scrive in modo definitivo le voci di cartella separatamente, per cui un'interruzione di corrente proprio nel momento del salvataggio può lasciare l'operazione incompiuta fino alla successiva apertura dell'area.) Questo richiede tempo: un salvataggio dura circa un decimo di secondo su un disco locale e da un quarto di secondo a mezzo secondo su un'unità di rete.

Chi legge contemporaneamente, mentre un salvataggio è in corso, può vedere uno stato intermedio, per esempio l'intestazione di una fattura senza le sue righe. È un caso noto e accettato deliberatamente.

Se un arresto anomalo lascia un salvataggio incompiuto, l'applicazione lo porta a termine al salvataggio successivo in quest'area o all'apertura dell'area. Fino ad allora le tabelle interessate non accettano modifiche e lo segnalano con un messaggio. Nulla va perduto.

## Giustificativi di modifica

Chi crea, modifica o elimina un record attraverso l'applicazione lascia una traccia: accanto al file della tabella l'applicazione tiene un secondo file in cui ognuna di queste modifiche compare come **giustificativo di modifica**. Esso risponde alla domanda su chi abbia modificato quale campo, quando e da quale valore a quale valore.

### Che cosa sono e dove si trovano

Al file di tabella `Clienti.md` corrisponde il file `Clienti.mddl` nella stessa cartella. L'applicazione lo crea e lo estende; non occorre fare nulla per questo, e su di esso non va fatto nulla.

Cinque proprietà sono da conoscere:

- **Non compare in alcun elenco di file** dell'applicazione e non si apre come documento. È un deposito tecnico accanto alla tabella.
- Viene **soltanto esteso** e mai riscritto. Un giustificativo già scritto resta al suo posto carattere per carattere; l'unica operazione che lo tocca è il raggruppamento descritto più sotto.
- **Segue** la tabella quando questa viene rinominata o spostata dentro l'applicazione, e finisce con essa nel cestino del sistema operativo quando la si elimina. Da lì si recuperano entrambi insieme.
- Chi lo **modifica o lo cancella a mano** perde la traccia in modo irrecuperabile. Non esiste un secondo deposito dal quale la si potrebbe ripristinare.
- Tutti i giustificativi di uno stesso salvataggio portano **lo stesso identificatore di operazione**. Così resta riconoscibile nel file che più modifiche vanno insieme, per esempio l'intestazione di una fattura e le sue righe.

### La vista sul record

Nella vista di lettura e nella modalità Live ogni riga di record porta al proprio inizio un pulsante **«Mostra i giustificativi di modifica»**. Un clic su di esso apre la pagina **«Giustificativi di modifica»** in una scheda a sé. Senza mouse il tabulatore porta nella tabella, i tasti freccia cambiano riga, i tasti Inizio e Fine portano alla prima e all'ultima, e il tasto Invio o la barra spaziatrice apre la pagina.

La pagina mostra i giustificativi del record, **il più recente per primo**. Ciascuno porta il momento nel fuso orario locale, il tipo (**Creato**, **Modificato**, **Eliminato**), l'utente, il computer e, per ogni campo toccato, il valore **Prima** e **Dopo**. Un valore mancante compare come «non presente», uno vuoto come «vuoto»; i due non sono la stessa cosa.

Due tipi sono contrassegnati a parte:

- **Modificato dall'esterno** significa che l'applicazione ha trovato, alla propria scrittura successiva, una differenza che non aveva causato essa stessa. Allora non è noto alcun autore, e il giustificativo lo dice.
- **Raggruppato** significa che il raggruppamento ha riunito in un solo giustificativo un periodo di più modifiche. Esso indica quante modifiche sostituisce, da quando si estende il periodo e quali tipi vi si trovavano.

Dove la traccia si rompe, la pagina lo dice nel punto in cui si nota. I casi sono due. Il valore precedente di un campo **è diverso**, allora il giustificativo non si collega a quello che lo precede. Oppure un giustificativo **non è leggibile**, allora non si sa che cosa abbia modificato, e la verifica riparte dopo di esso. Se l'intero file non è leggibile, la pagina dice anche questo e lascia intatto il suo contenuto.

La pagina **si limita a leggere**, in essa non si modifica nulla; il pulsante «Aggiorna» recupera di nuovo lo stato. Con moltissimi giustificativi mostra un estratto e scrive sopra di che cosa sia un estratto.

### Il raggruppamento

Un file di giustificativi cresce a ogni modifica. Perché non cresca senza fine, l'applicazione raggruppa, a partire da una doppia soglia, i giustificativi più vecchi dei record modificati di frequente invece di cancellarli. Senza un'indicazione propria valgono **0,7 MB** per l'intero file e **200 giustificativi per record**.

Entrambi i limiti si impostano per ogni tabella, nel frontmatter del file di tabella sotto l'indicazione `changeLog`:

```yaml
---
db-table:
  fields:
    - name: titolo
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` è la dimensione del file in byte, `maxPerRecord` il numero di giustificativi per record. La parola `unlimited` disattiva il limite corrispondente. Ogni indicazione vale per sé, un'indicazione omessa mantiene il proprio valore predefinito, e un'indicazione inutilizzabile viene segnalata come anomalia, dopo di che vale ugualmente il valore predefinito.

**Il raggruppamento ha un prezzo.** Un giustificativo raggruppato indica da quale valore a quale valore abbia portato un periodo, quante modifiche sostituisce e se al suo interno vi fosse una creazione o un'eliminazione. Non dice più chi abbia modificato che cosa e quando, singolarmente; quella parte della traccia è poi scomparsa. Una promessa vale senza eccezione: non si raggruppa mai al di là di un giustificativo del tipo **Modificato dall'esterno**. Esso chiude il periodo e resta invariato.

### Il limite, detto con onestà

Una modifica fatta a mano in un editor sul file di tabella non produce **alcun** giustificativo. L'applicazione non la vede nel momento in cui avviene.

Quello che fa invece: alla propria scrittura successiva confronta lo stato trovato con quello atteso. Se differiscono, per il momento non salva la nuova modifica, così che la versione attuale possa essere esaminata; se poi viene salvata comunque, un giustificativo del tipo **Modificato dall'esterno** fissa la differenza. Così non scompare nulla senza che lo si noti. Il giustificativo però non indica né il momento né l'autore di quella modifica, perché nessuno dei due è noto.

## Blocchi

Quando più persone lavorano nella stessa area di banca dati, per esempio su un'unità di rete condivisa, un blocco fa sì che due di esse non modifichino contemporaneamente lo stesso record.

### Che cosa viene bloccato e quando

Viene bloccato il singolo **record**, e proprio nel momento in cui la sua modifica comincia. Viene rilasciato non appena la modifica finisce, tanto al salvataggio quanto all'abbandono. La semplice consultazione non blocca nulla: altrimenti un elenco con centinaia di record li bloccherebbe tutti in una volta a ogni sguardo.

Nella maschera la modifica comincia con **«Modifica»** oppure con **«Elimina»**, che prende il blocco già prima della sua richiesta di conferma. Finisce al salvataggio, con **«Scarta»**, con **«Ricarica»**, all'annullamento della richiesta di eliminazione, al passaggio a un altro record e alla chiusura della scheda della maschera. Se l'applicazione respinge un salvataggio, il blocco resta, perché la modifica continua. L'apertura della maschera e la creazione di un nuovo record non bloccano nulla.

Se viene modificata la **definizione di una tabella**, per quel tempo è bloccata la definizione, perché una modifica alle colonne tocca tutti i record della tabella.

### Quando un record è già bloccato

L'applicazione non sovrascrive mai in silenzio. Indica **chi** tiene il record, **su quale computer** e **da quando**, e lascia due vie: leggere il record in **sola lettura** oppure **forzare** il blocco.

Nella maschera questa indicazione compare come riquadro **«Il record è bloccato»**, e la maschera resta in lettura. **«Solo consultare»** chiude il riquadro. **«Forza il blocco»** compare solo quando il termine indicato sotto è scaduto, e dopo la forzatura porta direttamente alla modifica; se nel frattempo il blocco è cambiato, la forzatura viene respinta, e il riquadro mostra i dati riletti.

Un blocco altrui si può forzare solo quando è **più vecchio di quattro ore**. Il termine è volutamente grossolano: gli orologi di due computer possono discostarsi senza che una modifica in corso appaia abbandonata. Anche dopo la scadenza del termine l'applicazione non rimuove mai da sé un blocco altrui. Si limita a offrire la forzatura, e la decisione resta a chi lavora. Chi ha subito la forzatura del proprio blocco lo viene a sapere non appena la propria modifica finisce.

**Titolare sconosciuto.** Se esiste un blocco che non indica alcun titolare, per esempio perché al momento della creazione è stato scritto in modo incompleto, il riquadro lo dice esattamente così invece di inventare dati. Anche allora il record si può solo consultare, e il blocco si può forzare solo dopo la scadenza dello stesso termine.

Se un'**altra finestra** di questa applicazione sta modificando il record, il riquadro dice anche questo. Lì viene offerto solo «Solo consultare», perché il blocco di una propria finestra non si può forzare.

### Dopo un arresto anomalo

Se dopo un arresto anomalo dell'applicazione resta un blocco **proprio**, esso non è d'ostacolo: l'applicazione riconosce che il blocco proviene da questo computer e che il programma che lo teneva non è più in esecuzione, e lo rileva senza chiedere. Se invece è una seconda finestra dell'applicazione a tenere il record, lì esso vale come bloccato al pari che per chiunque altro.

### Che cosa il blocco non fa

Un blocco è un accordo fra le applicazioni che lavorano in quest'area, e non una proprietà del file. Chi modifica il file di tabella a mano in un editor non vede alcun blocco. Per questo l'applicazione verifica inoltre a **ogni** salvataggio se il record si presenta ancora come lo ha letto, anche quando tiene il blocco.

### La cartella dei blocchi

I blocchi si trovano come piccoli file in una cartella nella radice dell'area, in via predefinita `.area-locks`. Nasce con il primo blocco, e l'applicazione la tiene: non compare in alcun elenco di file, né nella ricerca né nelle statistiche. A differenza dei giustificativi di modifica non fissa nulla di duraturo. Se nessuno lavora, è vuota e può mancare. Durante un salvataggio l'applicazione vi deposita inoltre un piccolo protocollo dell'operazione, che scompare di nuovo quando questa finisce; se un arresto anomalo lascia l'operazione incompiuta, il protocollo resta finché l'applicazione non ha portato a termine l'operazione. Da essa non va cancellato nulla a mano finché qualcuno lavora o vi si trova un protocollo.

Il **nome della cartella** si cambia in **File → Impostazioni… → Area corrente → Banca dati**, nel campo **«Nome della cartella dei blocchi»**. Vale quanto segue:

- Il nome vale **per l'area** e quindi per tutte le persone che vi lavorano. Risiede nel file dell'area e viaggia con la cartella dell'area.
- Il nome **deve iniziare con un punto**, perché è proprio da questo che l'applicazione riconosce che una cartella non appartiene all'indice, alla ricerca e alle statistiche. Non sono inoltre ammessi i separatori di percorso, i caratteri vietati su Windows e i nomi di dispositivo riservati come `CON`, e sotto quel nome non deve trovarsi ancora nient'altro nella radice dell'area.
- La modifica rinomina la cartella esistente invece di crearne una seconda. Riesce soltanto **finché nessuno ha un record in modifica**. Altrimenti il messaggio indica chi sta lavorando, e tutto resta com'era.

## Verifica di coerenza

Nel salvataggio da parte dell'applicazione ogni modifica viene verificata. Ciò che arriva nei file per un'altra via, per esempio a mano in un editor, nessuno lo verifica strada facendo, e alcune regole in lettura non agiscono affatto. La **verifica di coerenza** percorre quindi l'intero insieme dei dati e indica dove esso contraddice le regole della banca dati.

Si trova nella panoramica della banca dati: **«Verifica coerenza»** nell'intestazione verifica tutte le tabelle, **«Verifica»** nella riga di una tabella solo quella. Anche il comando **«Verifica la coerenza del database»** nella palette dei comandi verifica tutte le tabelle; per farlo apre la panoramica.

Il risultato compare nella sezione **«Verifica di coerenza»** della panoramica: la durata, per ogni tabella il numero dei suoi record e dei rilievi, e sotto i rilievi con tabella, record, campo e una frase in chiaro. Un clic sul record apre la sua maschera. L'elenco mostra al massimo i primi 500 rilievi e indica allora quanti sono in totale.

Vengono trovati:

- una chiave funzionale assegnata più volte, con un rilievo per ogni record coinvolto, e un identificatore che compare più di una volta nella tabella;
- un collegamento che non colpisce alcun record, che ne colpisce più di uno o che punta tramite un valore di chiave a una tabella con chiave a più elementi, e una colonna di collegamento la cui tabella di destinazione manca o non è indicata;
- un valore che non corrisponde al suo tipo, che viola una regola di campo o che manca pur essendo obbligatorio, e un record che viola una regola sotto `checks`;
- un record con più o meno celle di quanti campi abbia la tabella;
- in un file di maschera, un campo sconosciuto, un segnaposto sconosciuto o una tabella sconosciuta;
- una tabella la cui definizione non si può leggere; i suoi record restano allora non verificati, e la verifica prosegue con le altre tabelle.

**La verifica non cambia nulla.** Si limita a leggere, e una funzione che ripulisca da sé i rilievi volutamente non esiste: quale di due record con la stessa chiave sia quello giusto si decide nella maschera. Il risultato resta visibile finché la panoramica è aperta; dopo una correzione si verifica di nuovo.

La verifica è rapida: con alcune migliaia di record dura alcune decine di millisecondi. Se l'indice dell'area è ancora in costruzione, lo segnala e chiede di riprovare tra poco.

## Utilizzo di tabelle e record

L'**utilizzo** indica chi usa una tabella o un record. Viene letto solo quando lo si chiede, e non viene cambiato nulla.

**Per una tabella** l'azione **«Utilizzo»** compare nella sua riga della panoramica. Sotto «Utilizzato da» indica le tabelle che puntano a questa tabella con una colonna di collegamento, ciascuna con i nomi di quelle colonne, e i file di maschera della tabella. Se nessuno la usa, indica «Non utilizzato».

**Per un record** l'azione **«Utilizzato da»** compare nell'intestazione della sua maschera finché questa è in lettura. Elenca i record che rimandano a esso, ciascuno con tabella, campo, forma di visualizzazione e identificatore; un clic apre la maschera del record che rimanda. Per un nuovo record l'azione manca, perché nessuno può rimandare a un record non ancora salvato.

**L'elenco del record è l'anteprima della protezione dall'eliminazione.** Cerca esattamente come la verifica all'eliminazione, anche tramite la forma breve dell'identificatore, tramite il valore di una chiave a un solo elemento e nei file successivi di una tabella. Se un record vi compare, quello mostrato non si può eliminare. Un record che rimanda a se stesso non compare, perché non impedisce la propria eliminazione. Come per la protezione dall'eliminazione conta solo la colonna di collegamento; un collegamento nel testo corrente, per esempio `[[Clienti#^r-00001]]`, non è un utilizzo.

## Reperibilità: ricerca e collegamenti

La ricerca sull'**area** accoglie un documento di tabella senza i suoi record. Il testo esplicativo che precede il blocco di dati resta consultabile, una corrispondenza che segue il blocco porta ancora al punto giusto, e i record stessi non vengono trovati per questa via.

Il motivo sta nell'area e non nella tabella: lo spazio di ricerca tiene in memoria i testi di tutti i file Markdown e porta per questo un tetto sull'**intera** area. Bastano poche tabelle di qualche megabyte a romperlo, e da quel momento ogni ricerca torna a leggere dal disco, anche quella su un documento ordinario. I record nello spazio di ricerca costerebbero dunque la velocità non a se stessi, ma all'intera area.

**Questo è uno stato intermedio.** Finché i record non hanno un proprio tipo di corrispondenza, non sono reperibili tramite la ricerca sull'area. Due vie portano comunque a loro:

- **Cercare nel documento aperto.** Chi ha davanti il file di tabella e vi cerca dentro (predefinito `Ctrl+F`) cerca nel testo che ha davanti e ritrova i suoi record immutati. Il limite qui sopra riguarda soltanto la ricerca sull'area.
- **Rimandare direttamente a un record**, come descritto nella sezione seguente.

### Collegamento a un singolo record

Un collegamento indica la tabella e l'identificatore interno, scritto come un'ancora di blocco:

```markdown
[[Personen#^r-00042]]
```

Il collegamento **vale** se la tabella indicata porta quel record, ed è rotto se non lo porta. Si comporta così come ogni altro collegamento dell'applicazione. Vale anche quando il record non si trova nel primo file della tabella ma in uno dei suoi file successivi: per chi lo scrive la tabella è una sola, e la sua distribuzione su più file non lo riguarda.

La verifica avviene sullo stato **salvato** della tabella, come per ogni altra ancora. Un collegamento a un record appena creato e non ancora salvato non vale quindi ancora.

Se un collegamento vale lo mostra il [linter Markdown](tools.md): una destinazione rotta riceve una sottolineatura ondulata nell'editor, cioè nelle viste Sorgente, Divisa e Live. La sola vista di lettura non rappresenta la validità; lì i collegamenti validi e quelli rotti appaiono uguali.

Un clic apre il file della tabella. Al singolo record non porta ancora.

## Suddivisione di grandi insiemi di dati

Quando i dati superano circa **0,7 MB**, l'applicazione li distribuisce al salvataggio su più file affiancati e continua a trattarli come **una sola** tabella. Si apre il primo file e si vedono tutti i record; un collegamento a un record non nota la differenza.

Valgono quattro garanzie, e tre di esse dicono che cosa **non** accade:

- Il taglio avviene solo **tra due record**, mai all'interno di uno.
- Un record **non passa mai** a un altro file. I nuovi record vengono aggiunti in coda, nulla viene ridistribuito — così nessun collegamento a un record si spezza.
- Una **suddivisione esistente non viene mai ricostruita**, anche se è nata con una soglia diversa.
- Ogni file successivo indica i **nomi dei campi** nel proprio frontmatter per restare leggibile da solo. Quell'elenco è un aiuto alla lettura e non un contratto: se contraddice la definizione del primo file, prevale la definizione, e il salvataggio successivo rimette a posto l'elenco.

Il meccanismo alla base è lo stesso della [suddivisione di documenti grandi](document-parts.md); per i file di tabella cambiano solo la soglia e il punto di taglio.

## La scheda della banca dati

Una banca dati si descrive da sé nel contenitore `db-database`, nel frontmatter di un documento proprio:

```yaml
---
db-database:
  name: Biblioteca
  description: Fondo, prestiti e lettori della biblioteca di casa
  schemaVersion: '1.0'
  fallbackLocale: it
---
```

- **`name`** e **`description`** sono etichette e sono perciò possibili anch'esse come corrispondenza da lingua a testo.
- **`schemaVersion`** è testo e sta tra virgolette. Senza di esse YAML leggerebbe `1.0` come numero, e la versione `1.0` diventerebbe alla lettura la versione `1`.
- **`fallbackLocale`** è la lingua su cui ripiega un'etichetta quando non porta la lingua dell'interfaccia. Senza indicazione vale la prima lingua che compare nella scheda stessa.

Ognuna di queste indicazioni può mancare per conto proprio, e nessuna è presupposto per le tabelle: ogni tabella porta da sé la propria definizione e resta pienamente interpretabile anche senza scheda.

## L'area come banca dati

Non appena un documento contenuto in un'area porta la scheda della banca dati, l'applicazione tratta quell'area come **area di banca dati**. Non occorre dichiararla a parte: la scheda è la dichiarazione. L'affermazione sta così in un solo punto e non in due che potrebbero contraddirsi.

Un'area di banca dati riceve due cose che un'area ordinaria non ha.

**La panoramica degli oggetti della banca dati** risponde in un solo punto alla domanda su che cosa si trovi in quest'area: la scheda della banca dati con nome e descrizione, le tabelle ciascuna con il numero dei propri campi e le anomalie emerse nella lettura delle definizioni, in chiaro e non come codice. Si apre in una scheda a sé, e nella panoramica stessa non si modifica nulla; le sue azioni portano alla maschera e alle verifiche. Tre vie vi conducono:

- **Visualizza → Panoramica della banca dati**,
- il **menu contestuale del pannello dell'area**,
- la **palette dei comandi**.

In un'area senza banca dati nessuna di queste vie viene offerta.

Nell'elenco delle tabelle la colonna **«Maschera»** indica il file di maschera di una tabella e resta vuota per la maschera generata. La panoramica porta inoltre quattro azioni: **«Verifica coerenza»** nell'intestazione per tutte le tabelle e, nella riga di ogni tabella, **«Nuovo record»**, **«Verifica»** e **«Utilizzo»**. Ciò che fanno lo descrivono le sezioni «Modificare i record nella maschera», «Verifica di coerenza» e «Utilizzo di tabelle e record». Tra le anomalie compaiono anche gli avvisi sui file di maschera, indicati con il nome del file.

**La sezione delle impostazioni «Banca dati»** si trova nel gruppo di navigazione «Area corrente» (File → Impostazioni… → Area corrente → Banca dati). Mostra la stessa informazione in forma breve, cioè nome e descrizione della banca dati, il numero delle sue tabelle e il numero delle anomalie, e porta un'opzione: **«Mostrare il riepilogo all'apertura dell'area»**. Se è attiva, la panoramica si apre da sé non appena l'area viene collegata. L'opzione risiede nel file dell'area e viaggia con la cartella dell'area. Vi si aggiunge il campo **«Nome della cartella dei blocchi»**; è descritto nella sezione «Blocchi».

Inoltre l'applicazione tiene nella radice dell'area il piccolo file `Area_Database.mdda`. Contiene lo stato del contatore dei identificatori di operazione, non compare in alcun elenco di file e viaggia con la cartella dell'area; su di esso non va fatto nulla. Se manca, l'applicazione ricava di nuovo lo stato dai giustificativi di modifica.

## Indicazioni difettose

Per la definizione intera vale la linea morbida della casa: una **singola indicazione** difettosa decade e viene segnalata, la voce resta efficace; una **voce** difettosa decade, le altre colonne restano. L'avviso indica il punto, cioè la colonna interessata, l'indicazione errata e ciò che era atteso al suo posto.

L'unica eccezione è il **tipo**: un tipo al di fuori dell'insieme qui sopra fa decadere la voce intera, perché una colonna senza un tipo interpretabile non è una colonna.

Un'indicazione che l'applicazione non conosce decade singolarmente con un avviso e non causa alcun danno.

Per l'indicazione `changeLog` dei giustificativi di modifica valgono tre anomalie proprie. Se `changeLog` non è esso stesso un oggetto, questa tabella non conserva limiti propri, e valgono i valori predefiniti dell'applicazione. Se `maxBytes` oppure `maxPerRecord` non è un numero intero maggiore di zero né la parola `unlimited`, quella singola indicazione viene scartata, e vale il suo valore predefinito. Ognuna di queste situazioni viene segnalata; nessuna viene passata sotto silenzio.

La stessa linea morbida vale per le regole di verifica e per la condizione di modificabilità, regola per regola. Una regola inservibile sotto `check` oppure `checks` decade singolarmente, e le altre regole, il campo e la tabella restano; vengono segnalati una voce che non è né testo né un oggetto con `rule`, un'espressione regolare non valida, un'espressione non valida, una regola di campo con un riferimento diverso da `value`, un nome di regola sconosciuto e una regola sotto `checks` che indica un campo sconosciuto. Se `checks` non è un elenco, decadono tutte le regole sotto `checks`. Un'indicazione `editable` inservibile decade allo stesso modo, e la tabella resta modificabile. Un messaggio che non si può interpretare decade da solo; la sua regola o la sua condizione continua a verificare.

La stessa linea tollerante vale per i file di maschera. Se il contenitore `db-form` non indica alcuna tabella, o una che nella banca dati non esiste, il file resta un documento ordinario. Se una tabella ha più file di maschera, vale il primo secondo il percorso, e gli altri non vengono usati. Questi tre casi compaiono tra le anomalie della panoramica. Un segnaposto che non è un segnaposto di campo e un nome di campo che la tabella non conosce restano come testo; la maschera li segnala con la loro riga nella propria intestazione, e la verifica di coerenza li elenca come rilievi.

## Disattivare la banca dati

L'intera banca dati è un'[estensione interna](extensions.md) denominata «Banca dati», della categoria Strumenti, e si disattiva con un unico interruttore. Richiede i [Profili di proprietà](property-profiles.md), perché la forma di una definizione di tabella viene descritta e verificata tramite un profilo interno; se si disattiva questo prerequisito, la banca dati si disattiva con esso.

Da disattivata vale quanto segue:

- Il **blocco di record resta un normale blocco di codice**, nella vista di lettura, nella modalità di modifica e nell'esportazione portabile. Il suo contenuto resta leggibile; ciò che viene disattivato è la rappresentazione come tabella, non il dato.
- **La panoramica e la sezione delle impostazioni decadono**, insieme agli accessi nel menu Visualizza, nel menu contestuale del pannello dell'area e nella palette dei comandi. Una panoramica già aperta resta finché non la si chiude, come ogni altra pagina di sistema.
- Con il blocco di record decadono i suoi pulsanti **«Apri record»** e **«Nuovo record»**, con la panoramica le sue azioni **«Verifica coerenza»**, **«Verifica»** e **«Utilizzo»**, e i comandi **«Nuovo record nella tabella attiva»** e **«Verifica la coerenza del database»** spariscono dalla palette dei comandi. Così nemmeno la **maschera** è più raggiungibile, e l'applicazione non fornisce più dati né a essa, né alla verifica di coerenza, né all'utilizzo.
- Un **collegamento a un singolo record** non viene più segnalato come rotto. Senza definizioni non c'è nulla con cui confrontarlo, e un avviso senza verifica sarebbe soltanto un'affermazione.
- La **ricerca sull'area resta invariata**. I record restano esclusi dal testo integrale, perché quel limite appartiene al file di tabella e non all'interruttore; la sezione «Reperibilità» più sopra resta quindi valida.
- **Non si scrive nulla.** L'applicazione non crea, non modifica e non elimina record, non prende alcun blocco e non produce alcun giustificativo di modifica; finché è disattivata non porta a termine nemmeno un salvataggio rimasto incompiuto.

**I file restano intatti.** La disattivazione toglie l'interpretazione, non i dati: non viene cambiato un solo carattere, e la riattivazione riporta tutto. L'indice dell'area viene allora ricostruito una volta; in fondi estesi ciò richiede un istante.
