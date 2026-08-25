# Proprietà del blocco

Quello che il frontmatter offre all'intero documento, le proprietà del blocco lo offrono ai singoli blocchi: dati chiave-valore strutturati e tipizzati, ad esempio uno stato di riunione per paragrafo o una scadenza per punto d'azione. Il supporto è l'**ancora del blocco**; i dati sono salvati nel **file associato** del documento (Markdown Data, `.mdd`), lo stesso file che contiene la [cronologia del documento](history.md) e le [note del documento](notes.md). Il testo del documento resta intatto.

## L'ancora del blocco come supporto

Un'ancora di blocco è un identificatore a scelta libera alla fine di un blocco:

```markdown
Questo paragrafo porta un'ancora. ^riunione-1
```

Nella vista renderizzata l'ancora è invisibile; rende il blocco indirizzabile. Sono ammessi lettere (anche accentate), cifre, trattino e trattino basso. Le proprietà si legano a questo identificatore: finché l'ancora è presente nel testo, i dati appartengono a questo blocco, ovunque il blocco venga spostato all'interno del documento.

## Il pannello Proprietà del blocco

Il pannello «Proprietà del blocco» si attiva come ogni pannello laterale: dal menu Visualizza → Barra laterale → Pannelli → Proprietà del blocco, dall'icona a graffe nella barra di stato o con una scorciatoia personalizzata (di fabbrica non ne è assegnata nessuna). Lato, ordine e gruppi di schede seguono le regole della [barra laterale](sidebar.md).

Il pannello **segue il cursore**: mostra le proprietà del blocco in cui si trova il cursore. L'intestazione indica l'ancora attiva e offre un selettore di tutte le ancore del file per saltare; le ancore con proprietà vi sono contrassegnate. Se il cursore è in un blocco **senza** ancora, il pannello propone «Crea ancora» e scrive alla fine del blocco un identificatore casuale breve, unico nel file.

Le righe delle proprietà funzionano come nel pannello delle proprietà del documento: ogni riga ha una chiave a scelta libera, un tipo (testo, elenco, numero, vero/falso, data, multiriga, collegamento, ora) e un campo valore adeguato. Per la chiave il pannello suggerisce le chiavi di blocco già usate nel documento. Il salvataggio è **automatico** poco dopo l'inserimento; la scheda del documento non viene contrassegnata come modificata, perché i dati risiedono nel file associato, non nel testo. Nelle viste di sola lettura il pannello si limita a mostrare i dati.

Se al documento si applicano **profili delle proprietà**, i suoi blocchi ereditano le relative definizioni: un campo definito porta qui lo stesso tipo, gli stessi valori proposti e la stessa marcatura del pannello del documento. Anche i campi strutturati (oggetto ed elenco di oggetti) si possono modificare su un paragrafo; vengono salvati nel file di accompagnamento. **Un valore annidato di questo genere non compare però nell’indice dell’area** e non può quindi fungere da condizione in una query di blocco, a differenza dei valori semplici. Anche i campi derivati compaiono qui, con il loro valore calcolato e non modificabili; non finiscono mai nel file di accompagnamento.

## Rinominare un'ancora

L'icona a matita accanto al selettore delle ancore rinomina l'ancora attiva. L'ancora nel testo, la voce dati nel file associato e i riferimenti in ingresso **all'interno dello stesso documento** vengono aggiornati insieme:

```markdown
Si veda il primo punto: [[#^riunione-1]]
```

I riferimenti da altri file non vengono adattati; chi riferisce tra file rinomina con cautela.

## Dati orfani

Se un'ancora scompare dal testo, le sue proprietà **non vanno perse**: restano nel file associato e compaiono nella sezione «Dati orfani» del pannello. Da lì possono essere assegnate a un'ancora esistente senza dati oppure eliminate definitivamente. Se un file porta la stessa ancora più volte, conta la prima occorrenza; il pannello segnala il duplicato.

## Visibilità sul blocco

I blocchi con proprietà portano un indicatore discreto alla fine del blocco nella vista renderizzata e in modalità live. Passandoci sopra si vede l'elenco chiave-valore; un clic apre il pannello con quell'ancora. L'indicatore non compare nell'esportazione PDF.

## Riferirsi ai blocchi

Un blocco con ancora può essere referenziato dallo stesso documento o da altri; il clic salta al blocco:

```markdown
[[Verbale#^riunione-1]]
```

La pagina [Collegamenti](linking.md) descrive la sintassi dei riferimenti in dettaglio. Tramite la [Query Perspective](frontmatter-query.md), i blocchi possono anche essere interrogati in base alle loro proprietà (aggiunta di ambito `BLOCKS`).

## Posizione di salvataggio e limiti

Le proprietà risiedono in una sezione propria del file associato `.mdd` e viaggiano con esso quando documento e file associato vengono copiati o spostati insieme; la **ridenominazione nell'app** porta con sé automaticamente il file associato. L'ancora è l'unica identità: se il contenuto del blocco cambia, i dati restano legati all'ancora.

Vale la pena conoscere due limiti. Altri programmi Markdown non conoscono l'accoppiamento al file associato: se il testo viene ristrutturato fuori dall'app e delle ancore scompaiono, i dati interessati finiscono nella sezione dei dati orfani (nulla si perde in silenzio). E se un blocco viene spostato in un **altro file**, le sue proprietà non lo seguono automaticamente, perché il file associato è legato al documento; vanno ricreate nel file di destinazione, mentre restano come dati orfani da ripulire nel file di origine.
