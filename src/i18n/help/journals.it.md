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

- **Voce di diario di oggi** (menu File): apre o crea la voce di oggi di un diario giornaliero; con selezione se esistono più diari giornalieri.
- **Voce di diario per una data…** (menu File): chiede una data (AAAA-MM-GG) e il diario; il periodo è quello della data nella granularità del diario.

La creazione produce la catena di cartelle, il contenuto del modello compilato (una voce vuota senza modello) e le proprietà di data nel frontmatter: i diari giornalieri ricevono la data (`journal-date`), i periodi di più giorni inizio e fine (`journal-start-date`, `journal-end-date`); i nomi di campo sono configurabili per diario e disponibili per la query Perspective. I segnaposto di data del modello vengono valutati all'inizio del periodo: `{{date}}` restituisce la data del periodo, non il momento della creazione. Annullare un dialogo del modello interrompe la creazione; non viene creato alcun file.

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

All'interno di una voce di diario mostra il periodo attuale in grande (con una riga aggiuntiva come «Questa settimana» per il periodo attuale), sopra i periodi superiori dello stesso scaffale (mese, trimestre, anno, dove esiste un diario; le lacune vengono omesse) e frecce al periodo precedente e successivo. I clic aprono le voci e creano quelle mancanti; la navigazione si ferma ai limiti di data del diario. Proprio qui, nella pagina del manuale, lo stesso blocco mostra l'avviso per i documenti al di fuori di un diario:

```perspective-journal-nav
```

Nell'esportazione PDF e portabile il blocco viene sostituito dall'etichetta statica del periodo, senza collegamenti di creazione.

## Regole di settimana

Le settimane seguono rigorosamente ISO 8601: la settimana inizia il lunedì e la prima settimana di un anno è quella che contiene il primo giovedì. L'anno della settimana (`kkkk`) può quindi differire dall'anno civile (`yyyy`) al cambio d'anno: il 1° gennaio 2021, ad esempio, appartiene alla settimana 53 dell'anno di settimana 2020.
