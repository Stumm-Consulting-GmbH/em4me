# Esportare e importare le impostazioni

La configurazione personale è lavoro: combinazioni di colori, scorciatoie da tastiera, l'occupazione della barra di formattazione, pulsanti e macro propri, la disposizione della barra laterale, regole dei modelli, segnalibri. Questa configurazione si lascia **scrivere in un file** e **rileggere** altrove — su un secondo computer, dopo una nuova installazione oppure come salvataggio prima di una ristrutturazione più ampia. Entrambe le vie stanno nel menu File → Impostazioni: «Esporta…» e «Importa…». La funzione fa parte dell'estensione «Esportazione e importazione delle impostazioni»; nello stato disattivato il sottomenu scompare.

Un terzo caso d'uso sta accanto a pari titolo e con il salvataggio non ha nulla a che vedere: la **trasmissione di un singolo [sistema di calendario](custom-calendars.md)** da un'[area](apps-windows.md) a un'altra.

## Esportare

«File → Impostazioni → Esporta…» apre una selezione. Essa porta una riga per tipo di dati, con il suo nome e il numero delle sue voci; viene offerto solo ciò che contiene effettivamente qualcosa. Tutto è preselezionato — il caso più frequente è il salvataggio completo. Chi vuole portarsi via meno toglie il segno di spunta in modo mirato; senza alcuna selezione non nasce nessun file, e la selezione resta aperta con un'indicazione.

Successivamente la consueta finestra di salvataggio chiede posizione e nome. Viene proposto un nome parlante con la data del giorno.

Questi tipi di dati sono a disposizione:

| Tipo di dati | Contenuto |
|---|---|
| Impostazioni | Comportamento e presentazione: lingua, aspetto, opzioni di editor e di visualizzazione, salvataggio automatico, cronologia, allegati, opzioni di esportazione, la configurazione di attività, promemoria e visualizzazione del calendario nonché le preferenze di colonna dei pannelli |
| Combinazioni di colori | le combinazioni create da voi stessi, insieme all'assegnazione di quale valga in modalità chiara e quale in modalità scura |
| Scorciatoie da tastiera | le riassegnazioni proprie dei comandi |
| Barra di formattazione | l'occupazione propria della barra dei pulsanti |
| Pulsanti della barra di stato e macro | gli accessi propri nella barra di stato, la sezione del menu contestuale, l'elenco degli elementi nascosti e le macro costruite da voi |
| Stato delle estensioni | quali estensioni sono attivate e quali disattivate |
| Disposizione della barra laterale | scelta dei pannelli, ordine, gruppi di schede e larghezze, insieme alle varianti di disposizione proprie |
| Cartella e regole dei modelli | la cartella dei modelli e la catena ordinata delle regole di cartella |
| Segnalibri | l'albero dei segnalibri generali, con cartelle e voci |
| Sistemi di calendario dell’area | i blocchi di cronologie dell'area aperta |

### Scegliere un singolo sistema di calendario

I sistemi di calendario sono l'unica eccezione di questo elenco: non appartengono all'applicazione, bensì all'area aperta, e viaggiano perciò comunque con la sua cartella. Stanno qui perché la loro **trasmissione** è uno scopo a sé — chi ha costruito un sistema di calendario deve poterlo dare a un'altra area, senza che là venga ricostruito.

Per questo tale riga è a due livelli: sotto il tipo di dati sta **una riga propria per ogni blocco**, con il suo nome e il numero delle sue cronologie, ciascuna con la propria casella. Così la stessa via porta entrambi i casi — tutti i blocchi per il salvataggio, uno solo per la trasmissione. L'interruttore del tipo di dati dice «tutto» oppure «niente» e commuta con sé i propri blocchi; se ne sono scelti solo alcuni, mostra uno stato indeterminato.

Ciò che si sceglie è il **blocco**, non la singola cronologia. Il motivo sta nel modello: le cronologie dello stesso blocco possono essere messe in corrispondenza, e una cronologia derivata si appoggia a un'altra del **proprio** blocco. Una cronologia estratta da sola spezzerebbe questo legame; un blocco intero se la porta intatta.

Senza un'area aperta il tipo di dati non compare affatto — non ce n'è allora nessuno.

## Che cosa non parte mai

Viene emesso esclusivamente ciò che appartiene ai tipi di dati qui sopra. Tutto il resto resta dov'è, e non per svista, bensì come garanzia:

- **I segreti di accesso di ogni genere non partono mai.** Lo spazio di archiviazione in cui un'estensione esterna tiene i propri dati è escluso dall'esportazione nel suo insieme — anche quando nessuno sa che cosa vi si trovi. Proprio perché l'applicazione non conosce questo contenuto, esso non viene trasmesso. Il loro stato di attivazione, cioè se un'estensione sia attivata o disattivata, parte invece con il resto; quella è configurazione e non un segreto.
- **Lo stato della sessione** come le schede aperte, dimensione e posizione delle finestre nonché gli elenchi dei documenti recenti. Portano percorsi assoluti del computer di origine, che altrove non portano da nessuna parte.
- **Le indicazioni legate alla macchina** come gli spazi di lavoro e le aree configurati con i loro percorsi, le introduzioni già viste e la decisione se su questo computer una determinata estensione esterna sia ritenuta affidabile. Questa decisione va presa per ogni computer; portarla con sé significherebbe anticiparla altrove.
- **Gli stati in corso** come sveglia, timer e cronometro.

Nemmeno dal file stesso si ricava una persona: la sua intestazione nomina il programma e la sua versione, non l'utente né il computer.

## Il file

Il file di scambio è un normale **file Markdown**. È voluto: si lascia aprire in questa applicazione, leggere in qualsiasi editor, confrontare e versionare. La sua intestazione nomina la versione del formato, il momento dell'emissione e la provenienza; sotto segue, per ogni tipo di dati, una sezione propria con un titolo e un blocco di codice il cui contenuto porta i valori.

````text
---
em4me: "setup"
formatVersion: 1
created: "2026-09-09T10:43:12Z"
origin:
  program: "EM4me"
  version: "…"
---

## Combinazioni di colori

```json em4me:colorSchemes
{ … }
```
````

Il campo `em4me` identifica il file come file di impostazioni di questa applicazione e protegge dal fatto che alla rilettura venga scelto per sbaglio un file Markdown qualsiasi. L'indicazione dopo il contrassegno nel blocco di codice — qui `em4me:colorSchemes` — nomina il tipo di dati della sezione. I titoli sopra di esso sono lì per il lettore; il tipo di dati viene letto dal contrassegno.

## Importare

«File → Impostazioni → Importa…» chiede il file. La finestra di dialogo non è legata a un'area aperta — un file di impostazioni si trova tipicamente proprio all'esterno, su una chiavetta o nella cartella dei download.

**Non si scrive subito.** Dapprima compare un'**anteprima** che indica, per ogni tipo di dati, che cosa accadrebbe: che cosa viene aggiunto, che cosa sostituito, che cosa rinominato e che cosa saltato. Solo «Applica» lo esegue; dopo, un rapporto mostra lo stesso elenco come risultato. Nell'anteprima si trova inoltre il pulsante «Salvare lo stato attuale…», che scrive lo stato odierno dei tipi di dati interessati in un file proprio prima che qualcosa venga modificato.

Nulla viene tralasciato in silenzio: ogni scostamento dal caso lineare sta nell'anteprima e nel rapporto.

### Che cosa accade ai valori esistenti

Vale **una sola** regola per tutti i tipi di dati:

> Viene aggiunto ciò che avete creato come oggetto con un nome. Viene sostituito ciò che è un'impostazione o una disposizione.

Vengono perciò aggiunte le combinazioni di colori proprie, le macro, le varianti di disposizione della barra laterale, i segnalibri e i blocchi di calendario: si collocano **accanto** a ciò che c'è, e il patrimonio esistente non viene toccato. Vengono sostituite le impostazioni, l'assegnazione delle scorciatoie da tastiera, la barra di formattazione, le regole dei modelli e lo stato delle estensioni: un valore non conosce il plurale, e due disposizioni intrecciate darebbero una terza che nessuno ha configurato.

**A parità di nome la voce esistente resta invariata**, e quella riletta si affianca con un'aggiunta distintiva: da «Modello» diventa «Modello (2)». L'anteprima nomina ogni rinomina di questo genere. I riferimenti si adeguano — una macro riletta che riceve un nuovo identificativo continua a essere trovata dal suo pulsante.

Due casi particolari derivano dall'oggetto: un segnalibro a un file già memorizzato viene saltato invece di essere creato due volte — una cartella di segnalibri, invece, arriva sempre nel suo insieme, perché è il vostro lavoro di ordinamento. E un blocco di calendario la cui definizione è incompleta viene rifiutato e nominato, invece di creare una mezza voce.

Una parte delle impostazioni ha effetto solo dopo un riavvio dell'applicazione; l'anteprima lo dice quando è il caso.

### File di un'altra versione del programma

Un file di una versione **più vecchia** viene letto. Proprio a questo serve la via: un salvataggio che dopo il prossimo aggiornamento del programma non fosse più leggibile mancherebbe il proprio scopo. I tipi di dati che nel frattempo non esistono più compaiono come saltati — vengono segnalati, non taciuti.

Anche un file di una versione **più recente** viene letto, con un'indicazione: ciò che questa versione non conosce viene saltato e nominato. Lo stesso vale all'interno di un tipo di dati noto la cui struttura è cambiata — ciò che non rientra nella forma attesa viene scartato ed elencato nell'anteprima, invece di lasciare entrare una struttura estranea nelle impostazioni.

Se il file è danneggiato o non è affatto un file di impostazioni, l'applicazione lo dice e non scrive nulla.

## Trasmettere un sistema di calendario

La via nel suo insieme, come esempio:

1. Nell'**area di origine** scegliere «File → Impostazioni → Esporta…».
2. Togliere tutte le caselle tranne quella del blocco di calendario desiderato e salvare il file.
3. Aprire l'**area di destinazione** e scegliere lì «File → Impostazioni → Importa…».
4. Scegliere il file, leggere l'anteprima, applicare.

Il blocco sta poi nell'area di destinazione accanto a ciò che vi era già, e le sue cronologie si lasciano usare subito nel documento. Se porta il nome di un blocco esistente — il caso normale quando lo stesso sistema è già arrivato là una volta —, quello esistente resta e il nuovo compare con la sua aggiunta.

Si scrive sempre nell'area che è aperta in quel momento. Se non ne è aperta nessuna, il tipo di dati viene saltato e il motivo viene indicato.
