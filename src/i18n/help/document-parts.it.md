# Divisione di documenti grandi

I documenti molto grandi vengono divisi in più file al salvataggio e riuniti in un unico documento all'apertura. Nella scheda lavori come sempre: vedi un testo continuo, l'annullamento attraversa i confini e la ricerca trova il documento nel suo insieme.

Il motivo è la maneggevolezza. Un documento che supera una certa dimensione rende lento il passaggio alla modalità di modifica. La divisione mantiene maneggevole il singolo file senza importi un limite di dimensione.

## Quando avviene la divisione

La divisione avviene al **salvataggio**, non appena il documento supera circa un megabyte. La visualizzazione e la lettura non sono mai interessate.

La prima divisione di un documento viene annunciata. Puoi rifiutarla: il file resta allora indiviso e la scheda passa in sola lettura fino alla successiva apertura. Una volta create le parti, le successive si aggiungono senza chiedere.

Se il salvataggio automatico è attivo in secondo piano, non viene diviso nulla senza richiesta. La scheda resta semplicemente modificata finché non salvi una volta manualmente e rispondi alla domanda.

## Dove avviene il taglio

Il taglio avviene esclusivamente prima di un **titolo dei primi due livelli**, cioè prima di una riga che inizia con uno o due cancelletti:

```markdown
# Primo capitolo

Testo …

## Una sezione
```

Così nessun costrutto attraversa mai un confine: nessun blocco di codice, tabella, elenco o riquadro viene spezzato. I titoli all'interno di un blocco di codice o di una citazione non contano come punto di taglio.

**Se non esiste alcun titolo di questo tipo, non viene diviso nulla.** Un documento molto grande senza titoli resta un unico file; la barra di stato ti dice una volta perché. Il prezzo è scelto consapevolmente: un taglio in un punto qualsiasi cadrebbe in mezzo a un testo che forma un tutt'uno.

## Come si chiamano le parti

Il primo file conserva invariato il nome del documento. Le parti successive portano lo stesso nome con un'aggiunta:

```text
Diario di viaggio.md
Diario di viaggio•part-00002.md
Diario di viaggio•part-00003.md
```

Il separatore è il **punto elenco** `•`. È volutamente diverso da quello delle [sottopagine](subpages.md), che usano la barra di divisione `∕`: una parte non è una sottopagina, e le due devono distinguersi a colpo d'occhio.

Ogni file di parte è un normale file Markdown, leggibile per sé. Nella sua intestazione si trova una riga tecnica che annota la sua appartenenza e la sua posizione:

```yaml
doc-part: v1|2|Diario di viaggio
```

Questa riga è l'informazione vincolante su ciò che sta insieme, non il nome del file. Se sposti un file di parte in un'altra cartella, il documento non lo troverà più.

## Cosa ne vedi nel programma

Poco, ed è voluto:

- **Scheda ed editor** mostrano un documento continuo.
- **L'elenco file dell'area** mostra solo il documento, non le sue parti.
- **La ricerca** segnala un risultato di una parte successiva come risultato del documento; il salto lo apre nel punto trovato.
- **La rinomina** porta con sé tutte le parti.
- **L'intestazione del primo file** porta la riga di appartenenza. È la traccia visibile della divisione e compare anche nelle proprietà.

Nel gestore file del tuo sistema continui a vedere le parti: sono file reali nella tua cartella.

## Quando manca una parte

Se all'apertura manca una parte, perché è stata eliminata, spostata o non ancora sincronizzata, il documento si apre **in sola lettura** e indica la posizione mancante. Il salvataggio resta bloccato finché la lacuna esiste: scrivere dal testo incompleto perderebbe definitivamente la parte assente.

Ci sono due vie d'uscita. Rimetti al suo posto il file mancante e il documento sarà di nuovo completo e modificabile alla prossima apertura, senza che tu debba ripristinare nulla. Oppure elimina il file di accompagnamento `.mdd` del documento se vuoi continuare senza quella parte: vi si trova l'elenco delle parti che rende visibile la lacuna.

Se una parte è stata **modificata** al di fuori dell'applicazione, il salvataggio segnala un conflitto e non sovrascrive nulla.

## Riunire le parti

La voce di menu **File → Altre funzioni file → Riunisci le parti…** riporta le parti a un unico file ed elimina i file di parte. Ciò avviene solo su questa richiesta, mai da sé.

Se il documento riunito supera la soglia, il comando avvisa in anticipo: il salvataggio successivo lo dividerebbe subito di nuovo. Nessun contenuto va perso, ma il comando resterebbe senza effetto duraturo.

Se manca una parte, il comando si rifiuta di procedere: eliminerebbe le parti restanti e renderebbe definitiva la perdita.
