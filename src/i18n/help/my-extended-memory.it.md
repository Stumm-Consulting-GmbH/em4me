# My Extended Memory

Chi lavora a lungo con questa applicazione accumula contenitori: [aree](apps-windows.md) per i progetti, [libri](books.md) per i testi lunghi, librerie per intere raccolte, oltre agli [spazi di lavoro](apps-windows.md) configurati. Sono sparsi sul disco, su chiavette e su unità di rete, e nessuna vista dell'applicazione li mostra insieme: ogni vista riguarda ciò che è aperto in quel momento.

**My Extended Memory è questa vista comune.** La pagina si apre con «Visualizza → My Extended Memory» oppure dalla palette dei comandi, in una scheda dedicata; non è modificabile. In quattro sezioni — spazi di lavoro, aree, libri, librerie — ogni contenitore occupa una riga con il suo nome, la sua posizione e alcuni dati chiave.

## Che cosa mostra la pagina — e che cosa non fa

**La pagina mostra ciò che avete aggiunto voi stessi.** Non esamina alcuna unità, non trova nulla da sola e non pretende di essere completa. Un'area che non avete mai aggiunto qui non compare, anche se ieri ci avete lavorato.

È voluto e non è una lacuna. Una ricerca su tutte le unità collegate durerebbe a lungo, troverebbe per strada cartelle che non riguardano nessuno e dipenderebbe da quali unità siano collegate in quel momento. L'elenco che tenete voi stessi è invece breve, affidabile ed è il vostro ordine. La nota in cima alla pagina lo dice in modo permanente, anche quando l'elenco è ormai pieno.

## Aggiungere un contenitore

«Aggiungi contenitore…» apre un blocco di proposte.

**Vengono proposti i contenitori aperti di recente** — aree, libri e librerie dagli elenchi dei documenti recenti — **e gli spazi di lavoro configurati**, raggruppati per tipo. Ciò che è già nell'elenco non compare più fra le proposte. «Aggiungi» accanto a una proposta la aggiunge.

**«Scegli cartella…» è la via completa** ed è sempre presente, anche quando non c'è nulla da proporre. La consueta finestra di scelta della cartella chiede la cartella del contenitore; il tipo lo determina l'applicazione stessa, nell'ordine **libreria, libro, area**: se la cartella porta il file di accompagnamento di una libreria, è una libreria; se porta quello di un libro, è un libro; altrimenti è un'area.

Tre casi portano a un messaggio invece che a una voce:

- La cartella **al momento non è raggiungibile**: una chiavetta staccata, un'unità di rete non collegata. Viene aggiunto solo ciò che è leggibile al momento dell'aggiunta; altrimenti il tipo non si può determinare.
- Il percorso scelto punta a un **file** e non a una cartella.
- Il contenitore **è già** nell'elenco. Una seconda voce per la stessa cartella non nasce.

## Rimuovere una voce

«Rimuovi» toglie la riga dall'elenco — **e nient'altro**. La cartella, i suoi file e i suoi file di accompagnamento restano intatti; anche uno spazio di lavoro resta configurato. Ciò che viene rimosso è la voce, non il contenitore. Aggiungerlo di nuovo è possibile in qualsiasi momento.

## I dati chiave

Ogni riga porta un riferimento temporale e una breve selezione: per un'area il numero di file Markdown, per un libro il numero di capitoli, per una libreria il numero di libri e, in ogni caso, lo spazio occupato.

**I dati non vengono aggiornati di continuo.** Sono rilevati nel momento in cui il contenitore viene aggiunto e poi solo su vostra richiesta: «Rileva di nuovo» legge il contenitore un'altra volta e fissa un nuovo riferimento temporale. Per questo il riferimento compare su ogni riga: dice a quale momento si riferiscono i dati. Chi ha lavorato una settimana in un'area vede qui dapprima i dati della settimana precedente; un clic li porta a oggi.

Uno **spazio di lavoro** non ha dati chiave né pulsante di rilevamento: non è una cartella, ma una composizione. Ciò che compone sta nella sua riga e nella vista di dettaglio.

### Un contenitore che al momento non è raggiungibile

**Resta nell'elenco**, con il contrassegno «non raggiungibile» e con gli ultimi dati noti insieme al loro vecchio riferimento temporale. Una chiavetta riposta nel cassetto non è un motivo per perdere la voce: i dati di allora restano l'informazione di cui disponete. «Apri» e «Rileva di nuovo» non hanno effetto su una riga simile e sono perciò disattivati; «Dettagli» e «Rimuovi» funzionano ancora.

### Un'area che non è aperta

Per essa tre dati chiave restano vuoti: **etichette, attività e file senza collegamenti in entrata**. Non derivano dal conteggio dei file, ma dall'indice che l'applicazione costruisce per un'area aperta, e quell'indice esiste solo finché l'area è aperta. La riga lo dice con la nota «senza i dati dell'indice; aprite l'area e rilevate di nuovo».

Per questa pagina **non** viene costruito un indice apposta. Costerebbe una scansione completa per ogni area aggiunta e trasformerebbe una panoramica in un calcolo. Aprite l'area e rilevate di nuovo: allora ci sono tutti i dati.

## La vista di dettaglio

«Dettagli» apre sotto la riga una tabella che mostra quanto il rispettivo contenitore offre:

| Tipo | Dati chiave |
|---|---|
| Area | file Markdown, altri file, cartelle, spazio occupato, etichette, attività, file senza collegamenti in entrata |
| Libro | capitoli, file Markdown, spazio occupato, libreria di appartenenza |
| Libreria | libri, di cui non trovati, file Markdown, spazio occupato |
| Spazio di lavoro | area, libro, libreria, finestre, ultimo utilizzo |

**Due tipi di vuoto, due segni.** «non disponibile» significa: nessuno ha rilevato quel dato — le etichette di un'area non aperta, per esempio. La lineetta significa: qui quella cosa non esiste affatto — il libro di uno spazio di lavoro che non ne porta alcuno, per esempio. **Uno zero non sostituisce mai né l'uno né l'altro**: è sempre uno zero contato, e un'area senza sottocartelle lo mostra a ragione.

In un **libro** la riga «Libreria» nomina soltanto una libreria a sua volta aggiunta. Se il libro si trova in una libreria che qui non compare, la tabella dice che non è assegnato a nessuna libreria dell'elenco, invece di affermare un'appartenenza che questa pagina non conosce.

### Aprire, e la via verso le statistiche dell'area

**«Apri» sulla riga** apre il contenitore per la via consueta: area, libro e libreria secondo le regole usuali, lo spazio di lavoro come passaggio a esso. La vista di dettaglio non ha un secondo pulsante di apertura; quello della riga sta immediatamente sopra.

**Per un'area si aggiunge «Apri le statistiche dell'area».** Le [statistiche dell'area](apps-windows.md) complete riguardano sempre l'area di **questa** finestra, perciò l'area deve prima essere quella aperta. Se lo è già, le statistiche si aprono subito. Altrimenti l'area viene aperta, e dove finisca dipende da che cosa è in esecuzione: se questa finestra la assume, le statistiche seguono qui. Se arriva in un'altra finestra — perché lì è già in esecuzione un'applicazione d'area oppure perché nasce una nuova finestra —, un avviso lo dice con precisione: le statistiche dell'area si trovano lì nel menu Visualizza. Un salto qui mostrerebbe altrimenti i dati di un'area estranea.

## Esportare e importare la propria configurazione

In cima alla pagina stanno «Esportare le impostazioni…» e «Importare le impostazioni…». Portano sulla stessa via di «File → Impostazioni → Esporta…» e «Importa…»; tutto il resto — la scelta dei tipi di dati, l'anteprima, il rapporto — sta nella pagina [Esportare e importare le impostazioni](setup-exchange.md).

L'accesso sta qui perché entrambi servono la stessa domanda: che cosa mi sono configurato e come lo porto con me? Se l'estensione «Esportazione e importazione delle impostazioni» è disattivata, il blocco viene meno.

**L'elenco dei contenitori aggiunti non parte mai.** È composto da percorsi assoluti di questa macchina, che su un'altra non portano da nessuna parte; come gli spazi di lavoro configurati e gli elenchi dei documenti recenti, appartiene a ciò che resta legato alla macchina.

## Disattivare

La funzione è disattivabile come [estensione](extensions.md) «My Extended Memory». Nello stato disattivato vengono meno la voce di menu e il comando nella palette; una scheda già aperta resta finché non la chiudete.

**L'elenco dei contenitori aggiunti viene conservato.** La disattivazione toglie l'accesso, non i dati: dopo la riattivazione l'elenco è di nuovo lì immutato, con tutte le sue voci e i loro dati rilevati per ultimi.
