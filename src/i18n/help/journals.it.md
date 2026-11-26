# Diari

I diari sono serie di documenti periodici in un'area: ogni diario ha una **granularità** (giorno, settimana, mese, trimestre o anno), uno **schema di cartella** e uno **schema di nome** basati su segnaposto di data, un modello facoltativo e proprietà di data automatiche nel frontmatter. Gli **scaffali** raggruppano più diari, ad esempio dal giorno all'anno di un taccuino. Le voci vengono aperte o create al primo accesso, tramite i comandi, il pannello calendario o il blocco di navigazione.

I diari esistono solo all'interno di un'area: la configurazione vive nel file dell'area e tutti i percorsi sono relativi alla radice dell'area. Senza area, comandi e pannello mostrano un avviso. La funzionalità è commutabile come estensione «Diari» (Impostazioni → Estensioni).

## Definire diari e scaffali

Impostazioni → Diari mostra gli scaffali dell'area; «Apri» su uno scaffale porta ai suoi diari, «Chiudi scaffale» riporta alla panoramica (la riga «Senza scaffale» raccoglie i diari senza assegnazione). Per diario:

- **Nome** e, facoltativamente, uno **scaffale**.
- **Granularità**: giorno, settimana, mese, trimestre o anno.
- **Schema di cartella** e **schema di nome**: letterali più i segnaposto di data dei modelli (`{{date::…}}`), valutati all'inizio del periodo. Un'anteprima mostra il percorso di esempio del periodo attuale.
- **Modello** (facoltativo) dalla cartella dei modelli; la creazione esegue la valutazione completa dei segnaposto, dialoghi compresi.
- **Data di inizio/fine** (facoltativa): prima o dopo non vengono create voci e la navigazione si ferma lì.
- **Nomi di campo** delle proprietà di data automatiche.

Esempio di un diario settimanale con sottocartelle per anno:

| Campo | Valore |
| --- | --- |
| Granularità | Settimana |
| Schema di cartella | `Diario/{{date::yyyy}}` |
| Schema di nome | `{{date::kkkk-KWww}}` |

La voce della settimana 28 del 2026 si trova quindi in `Diario/2026/2026-KW28.md`. Per le settimane esistono due token di formato aggiuntivi: `ww` (settimana ISO, due cifre) e `kkkk` (anno della settimana, che al cambio d'anno può differire dall'anno civile); le maiuscole come `KW` restano letterali. Per i trimestri il token `q` fornisce il numero del trimestre (1–4), ad esempio `{{date::yyyy-Qq}}` → `2026-Q3`.

Uno schema modificato non rinomina i file esistenti; i punti del calendario e il riconoscimento delle voci seguono il nuovo schema. I file periodici esistenti corrispondono automaticamente se gli schemi di cartella e nome sono configurati in modo identico.

## Aprire e creare voci

- **Voce di diario di oggi** (menu File → Altre funzioni file): apre o crea la voce di oggi di un diario giornaliero; con selezione se esistono più diari giornalieri.
- **Voce di diario per una data…** (menu File → Altre funzioni file): chiede una data (AAAA-MM-GG) e il diario; il periodo è quello della data nella granularità del diario.
- **Riportare le attività aperte nella voce di diario attuale** (menu File → Altre funzioni file): apre o crea la voce del periodo in corso e vi riporta le attività aperte dell’ultima voce; vedi la sezione «Riportare le attività aperte».

La creazione produce la catena di cartelle, il contenuto del modello compilato (una voce vuota senza modello) e le proprietà del diario nel frontmatter. Una voce porta **quattro** proprietà, indipendentemente dalla granularità: il nome del diario (`journal`), la data del periodo (`journal-date`), l’inizio (`journal-start-date`) e la fine (`journal-end-date`). La data del periodo è sempre il suo **inizio**; nelle voci giornaliere le tre date coincidono quindi. I nomi di campo sono configurabili per diario e disponibili per la query Perspective — poiché ogni voce porta lo stesso insieme, una query non deve distinguere per granularità. I segnaposto di data del modello vengono valutati all’inizio del periodo: `{{date}}` restituisce la data del periodo, non il momento della creazione. Annullare un dialogo del modello interrompe la creazione; non viene creato alcun file.

Una voce **già esistente** viene completata quando le mancano proprietà, per esempio perché proviene da un’altra applicazione o è stata creata a mano. Ciò avviene in due modi. All’**apertura** tramite comando, calendario o blocco di navigazione, le proprietà mancanti vengono aggiunte in silenzio; se la voce è già completa, il file resta intatto. Il comando **Completare le proprietà del diario…** porta tutte le voci esistenti di un diario allo stesso stato in una volta; prima indica quante voci vengono controllate e chiede conferma.

Creare e completare si comportano volutamente in modo diverso: alla **creazione** l’applicazione imposta le proprietà e sovrascrive i campi omonimi del modello. Al **completamento** viene aggiunto solo ciò che manca; un valore esistente resta anche se diverge dal periodo, perché può essere una correzione deliberata. I campi estranei e il resto del contenuto restano intatti in entrambi i casi, e un frontmatter danneggiato non viene toccato.

## Riportare le attività aperte

L’applicazione riporta le attività aperte dell’ultima voce esistente di un diario nella voce del periodo in corso: in un diario giornaliero in quella di oggi, in un diario settimanale in quella della settimana in corso. Questo vale per diari di qualsiasi granularità, anche se l’ultima voce risale a giorni prima. La fonte è sempre la voce precedente più recente dello stesso diario; le voci future non contano.

**Impostazioni.** Nell’editor di un diario in Impostazioni → Diari, il gruppo «Riportare le attività aperte» raccoglie tre impostazioni:

- **Riportare automaticamente alla creazione della voce** (disattivato per impostazione predefinita): con l’interruttore attivo, il riporto avviene non appena la voce del periodo in corso viene creata, qualunque sia la via: i comandi, il pannello calendario, il blocco di navigazione o il blocco linea temporale, oppure la data di una scheda di una bacheca Kanban. La semplice apertura di una voce esistente e la creazione di una voce per un altro periodo non fanno nulla.
- **Nella voce precedente**: «contrassegnare come riportata» (predefinito) mette lì l’attività riportata nello stato «Riportato» (`- [»] …`, pagina [Liste di attività](tasks.md)); «rimuovere» la cancella da lì.
- **Solo dalla sezione** (vuoto per impostazione predefinita): il testo di un’intestazione. Se il campo è compilato, vengono riportate solo le attività sotto questa intestazione e le sue sotto-intestazioni; se è vuoto, tutte le attività aperte della voce.

**Comando manuale.** **Riportare le attività aperte nella voce di diario attuale** (menu File → Altre funzioni file, anche nella palette dei comandi) riporta in qualsiasi momento nella voce del periodo in corso, anche se l’interruttore è disattivato, e anche in una voce che esiste già; se la voce manca, viene creata. Con più diari il comando chiede quale si intende. Una seconda esecuzione non riporta nulla due volte, perché le attività riportate sono contrassegnate o rimosse nella voce precedente.

**Dove arrivano le attività.** Ogni attività arriva nella nuova voce sotto l’intestazione sotto cui stava nella precedente, alla fine di quella sezione. Omonima significa stesso testo, senza badare a maiuscole e minuscole né al livello dell’intestazione; se l’intestazione compare più volte nella nuova voce, vale la prima. Se lì manca, viene creata con le attività alla fine della voce. Le attività che nella voce precedente stavano prima della prima intestazione vanno alla fine della nuova. L’ordine resta invariato.

**Sottopunti.** Un’attività si sposta con tutto ciò che sta rientrato direttamente sotto di essa, fino alla riga vuota successiva: sottoattività aperte e completate, i loro sottopunti e le righe di nota. Ciò che prosegue rientrato dopo una riga vuota non le appartiene più e resta nella voce precedente. Con «contrassegnare come riportata», ogni riga di attività del blocco spostato viene contrassegnata nella voce precedente, anche una sottoattività completata; con «rimuovere», sparisce l’intero blocco. Un’attività aperta sotto una completata o annullata, senza un’attività aperta sopra, si sposta da sola e nella nuova voce sta senza rientro.

**Che cosa conta come aperto.** Le attività il cui stato è di tipo Aperto, In corso o In attesa (pagina [Liste di attività](tasks.md), sezione «Stati personalizzati, tipo e simbolo successivo»); anche una casella con un carattere per cui non è configurato alcuno stato conta come aperta. Le attività completate e annullate e le righe di tipo Non è un'attività restano dove sono. Una riga contrassegnata come «Riportato» non viene mai riportata di nuovo, anche se questo stato è disattivato. Le caselle nei blocchi di codice, nelle citazioni e nelle tabelle non sono attività e restano dove sono. Un Filtro globale impostato vale anche qui.

Esempio con «contrassegnare come riportata». La voce precedente prima:

```markdown
## Lavoro
- [ ] Scrivere il preventivo
  - [x] Raccogliere i numeri
  - [ ] Abbozzare il testo
- [x] Controllare la fattura

## Personale
- [ ] Portare la bici dal meccanico
```

La nuova voce, creata dal modello:

```markdown
## Lavoro

## Personale
```

La nuova voce dopo il riporto:

```markdown
## Lavoro

- [ ] Scrivere il preventivo
  - [x] Raccogliere i numeri
  - [ ] Abbozzare il testo

## Personale

- [ ] Portare la bici dal meccanico
```

La voce precedente dopo il riporto:

```markdown
## Lavoro
- [»] Scrivere il preventivo
  - [»] Raccogliere i numeri
  - [»] Abbozzare il testo
- [x] Controllare la fattura

## Personale
- [»] Portare la bici dal meccanico
```

Con «rimuovere», nella voce precedente resterebbero poi solo le due intestazioni e «Controllare la fattura».

**Regole di dettaglio.**

- **Modifiche non salvate:** se la voce precedente o la nuova ha modifiche non salvate in una finestra qualsiasi, non viene riportato nulla, e la barra di stato nomina la voce. Con il riporto automatico la nuova voce viene allora creata senza le attività; dopo il salvataggio, il comando manuale recupera il riporto.
- **Funzioni disattivate:** se l’estensione «Attività» è disattivata, non viene riportato nulla, perché allora niente conta come attività; il comando lo segnala nella barra di stato. Se l’estensione «Diari» è disattivata, comando e impostazioni scompaiono, e non viene riportato nulla.
- **Solo l’ultima voce:** la fonte è esattamente la voce precedente più recente. Ciò che è rimasto aperto in voci ancora più vecchie resta lì.
- **Attività già presente:** se il modello porta un’attività ogni giorno e la stessa attività è ancora aperta nella voce precedente, non arriva una seconda volta nella nuova; nella precedente viene comunque contrassegnata o rimossa. Questo vale solo se la riga è identica carattere per carattere, sta sotto la stessa intestazione e non ha nulla sotto di sé nella voce precedente. Se lì ha ricevuto sottopunti, si sposta con essi e compare quindi due volte nella nuova voce.
- **Sezione non trovata:** se «Solo dalla sezione» nomina un’intestazione che la voce precedente non ha, non viene riportato nulla, e la barra di stato lo segnala, anche con il riporto automatico.
- **Messaggi:** dopo un riporto la barra di stato indica il numero di attività e la voce da cui provengono. Che non esista una voce precedente o alcuna attività aperta lo segnala solo il comando manuale.
- **Elenchi numerati e intestazioni vuote:** un’attività di un elenco numerato conserva il suo numero; nulla viene rinumerato. Se dopo «rimuovere» resta nella voce precedente un’intestazione senza contenuto, rimane.
- **Limiti:** al massimo 500 attività per riporto, voci fino a 5 MB e al massimo 20 000 file Markdown nelle cartelle del diario; oltre non viene riportato nulla, e la barra di stato lo segnala.
- **Ritorno:** non esiste un comando di annullamento dedicato. Entrambe le voci ricevono una voce nella loro [Cronologia del documento](history.md), dove è attivata per il documento; con «contrassegnare come riportata», un clic sulla casella riapre l’attività nella voce precedente.
- **Nessun collegamento:** la riga contrassegnata nella voce precedente non riceve alcun collegamento alla nuova voce.

## Pannello calendario

Il pannello calendario (simbolo del calendario nella barra di stato) mostra la vista mensile dell'area:

- Intestazione dei giorni con **inizio lunedì**, a sinistra la **colonna delle settimane ISO**.
- I **punti** segnano i giorni con una voce giornaliera esistente; **oggi** è evidenziato.
- Un clic su un **giorno** apre o crea la voce giornaliera; un clic sulla **cella della settimana**, la voce settimanale; con più diari corrispondenti compare una selezione.
- Il filtro dell'intestazione limita a **tutti i diari**, uno **scaffale** o un **singolo diario**; le frecce sfogliano i mesi e il pulsante Oggi torna al mese attuale.

## Blocco di navigazione

Il blocco di navigazione sta nella voce come blocco di codice, tipicamente tramite il modello del diario:

````markdown
```perspective-journal-nav
```
````

All'interno di una voce di diario mostra il periodo attuale in grande (sotto, la collocazione temporale: «Oggi» o «Questa settimana» per il periodo in corso, altrimenti la sua distanza — «ieri», «3 settimane fa», «tra 2 anni», sempre nell’unità del periodo), sopra i periodi superiori dello stesso scaffale (mese, trimestre, anno, dove esiste un diario; le lacune vengono omesse) e frecce al periodo precedente e successivo. I clic aprono le voci e creano quelle mancanti; la navigazione si ferma ai limiti di data del diario. **Le due frecce sfogliano nella stessa scheda:** la voce precedente cede il posto alla nuova, e la scheda conserva modalità di visualizzazione, modalità di modifica, ingrandimento, gruppo e posizione. Se porta modifiche non salvate compare la stessa domanda della chiusura; se la voce vicina è già aperta, viene attivata la sua scheda. I collegamenti ai periodi superiori aprono invece una scheda propria, perché cambiano livello invece di sfogliare. **Accanto a ogni freccia sta il nome del suo periodo di destinazione**, così si vede dove porta; se il blocco si restringe, quel nome cede e il pulsante resta. **Un punto sotto un periodo significa: quella voce esiste già** — lo stesso segno del pannello calendario e della linea del tempo. Compare su tutti i periodi del blocco, anche su quelli superiori e su entrambi i vicini; dove manca, il clic crea la voce. Proprio qui, nella pagina del manuale, lo stesso blocco mostra l'avviso per i documenti al di fuori di un diario:

```perspective-journal-nav
```

Entrambi i blocchi del diario, questo e la linea temporale più sotto, verificano inoltre di riferirsi alla voce visualizzata. In caso contrario, o se la voce non esiste più, un messaggio di errore sostituisce la visualizzazione: un periodo errato non sarebbe riconoscibile come tale e viene quindi omesso.

Nell'esportazione PDF e portabile il blocco viene sostituito dall'etichetta statica del periodo, senza collegamenti di creazione.

## Blocco linea temporale

Il blocco linea temporale mostra il quadro dei periodi come calendario dentro la voce. Conosce quattro modi:

````markdown
```perspective-journal-timeline
mode: month
```
````

| Modo | Rappresentazione |
|---|---|
| `week` | la settimana della voce su una sola riga |
| `month` | un calendario mensile |
| `quarter` | tre calendari mensili affiancati |
| `year` | dodici calendari mensili come griglia annuale |

`calendar` è la grafia equivalente di `year` (proviene da materiale importato). Senza l'indicazione `mode` vale `month`. Un valore sconosciuto compare come avviso dentro il blocco, così un errore di battitura non passa inosservato.

**Struttura.** La colonna dei numeri di settimana sta a sinistra, l'intestazione dei giorni in alto, a partire da lunedì. I giorni con una voce già presente portano un punto, il giorno corrente è in evidenza. La riga di intestazione mostra i periodi sopra il livello del calendario, e il livello del modo è in evidenza: il modo settimana evidenzia la settimana, il modo mese il mese, il modo trimestre il trimestre, il modo anno l'anno.

**Clic.** Ogni elemento apre il proprio periodo: il giorno apre la voce giornaliera, la settimana la voce settimanale, il nome del mese e le etichette di intestazione il rispettivo periodo. Le voci mancanti vengono create nel farlo. Contano i diari dello scaffale a cui appartiene la voce; dove quello scaffale non ha un diario per un livello, l'etichetta è di sola lettura. Fuori dai limiti di data di un diario non nasce alcuna voce.

Il periodo mostrato dal blocco segue la voce in cui si trova, non il giorno corrente: nella nota settimanale di una settimana passata, `month` mostra il mese di quella settimana.

Come il blocco di navigazione, anche questo blocco compare come avviso fuori da una voce di diario:

```perspective-journal-timeline
mode: week
```

L'esportazione PDF stampa il calendario così come appare sullo schermo. L'esportazione portabile lo trasforma in una tabella per mese, con un punto sui giorni che hanno una voce e senza collegamenti di creazione.

## Regole di settimana

Le settimane seguono rigorosamente ISO 8601: la settimana inizia il lunedì e la prima settimana di un anno è quella che contiene il primo giovedì. L'anno della settimana (`kkkk`) può quindi differire dall'anno civile (`yyyy`) al cambio d'anno: il 1° gennaio 2021, ad esempio, appartiene alla settimana 53 dell'anno di settimana 2020.
