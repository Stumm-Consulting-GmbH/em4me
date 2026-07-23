# Modelli

I modelli sono normali file Markdown in una **cartella dei modelli** configurabile. All'applicazione l'app valuta **segnaposto** selezionati: data e ora con offset e formato, titolo e cartella del file di destinazione, dialoghi di input e selezione, gli appunti e una posizione di destinazione del cursore. I modelli creano nuovi file con struttura pronta oppure inseriscono blocchi ricorrenti alla posizione del cursore; le **regole di cartella** riempiono automaticamente i nuovi file.

La funzionalità è commutabile come estensione «Modelli» (Impostazioni → Estensioni); da spenta scompaiono i comandi, la sezione delle impostazioni e le regole di cartella.

## Cartella dei modelli

La cartella dei modelli si configura nelle impostazioni (Impostazioni → Modelli):

- **Globalmente** vale la cartella dell'app per tutte le finestre.
- **Per area** si può impostare una configurazione dedicata («Usa la configurazione dell'area» nella voce «Modelli» del gruppo di navigazione «Area corrente», visibile solo quando un'area è aperta); viene salvata nel file dell'area e **sostituisce completamente quella globale** (cartella e regole, nessuna risoluzione mista). Le cartelle sono relative alla radice dell'area; i percorsi assoluti restano ammessi.

Ogni file Markdown nella cartella (sottocartelle comprese) è un modello. Le sottocartelle appaiono come gruppi nel popup di selezione. Le modifiche alla configurazione hanno effetto immediato, senza riavvio.

## Applicare i modelli

Due strade portano al modello:

- **Nuovo file da modello** (menu File): scegliere il modello nel popup filtrabile, assegnare un nome file (`/` crea una sottopagina), rispondere alla catena di dialoghi. Il file nasce con il contenuto compilato nella cartella del file attivo (senza file attivo nella radice dell'area; senza entrambi, un dialogo di cartella chiede la destinazione), si apre come scheda e il cursore salta al primo obiettivo `{{cursor}}`.
- **Inserisci modello** (menu contestuale dell'editor → Inserisci): il risultato compilato viene inserito alla posizione del cursore come singolo passo di modifica (un annulla rimuove tutto).

Più segnaposto di input e selezione appaiono **uno dopo l'altro** nell'ordine della prima occorrenza; le domande identiche vengono poste una sola volta. L'annullamento di un qualsiasi dialogo interrompe l'intera applicazione: non nasce nessun file e nessun testo inserito.

## Riferimento dei segnaposto

I segnaposto si scrivono tra doppie parentesi graffe. `\{{` scrive un `{{` letterale nel modello.

| Segnaposto | Effetto |
| --- | --- |
| `{{date}}` / `{{time}}` | data oppure ora dell'applicazione (`2026-07-09` oppure `14:30`) |
| `{{date:+7d}}` | data con offset; unità del linguaggio di query (`s`, `min`, `h`, `d`, `w`, `mo`, `y`, anche combinate: `1d 12h`), segno facoltativo |
| `{{date::dd.MM.yyyy}}` | data con formato proprio; token `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` (come la funzione di query `dateformat`); offset e formato combinabili: `{{date:+7d:dd.MM.yyyy}}` |
| `{{time:-30min:HH:mm:ss}}` | anche l'ora accetta offset e formato |
| `{{title}}` | titolo del file di destinazione (per le sottopagine la forma logica con `/`) |
| `{{folder}}` | cartella del file di destinazione (relativa alla radice in un'area) |
| `{{prompt:Domanda}}` | dialogo di input; valore predefinito facoltativo: `{{prompt:Domanda:Valore}}` |
| `{{select:Domanda:a,b,c}}` | dialogo di selezione con le opzioni `a`, `b`, `c` |
| `{{clipboard}}` | testo attuale degli appunti |
| `{{cursor}}` | posizione di destinazione del cursore dopo l'applicazione; più obiettivi numerati con `{{cursor:2}}`, il più basso è la destinazione del salto |

Modello di esempio:

````markdown
# {{title}}

Data: {{date}}, prossimo appuntamento: {{date:+7d:dd.MM.yyyy}}
Tema: {{prompt:Tema}}
Priorità: {{select:Priorità:Alta,Media,Bassa}}

## Note

{{cursor}}
````

Segnaposto sconosciuti o parametri difettosi interrompono l'applicazione con un messaggio nella barra di stato; non nasce nessun file compilato a metà.

## Regole di cartella

Le regole di cartella riempiono automaticamente i nuovi file: ogni regola assegna un **modello** a una **cartella di destinazione** (Impostazioni → Modelli). Alla creazione di un file tramite l'app (pannello dell'area, nuova sottopagina) il modello viene eseguito con la valutazione completa dei segnaposto, dialoghi compresi.

- Vince la **cartella corrispondente più profonda**; le sottocartelle contano come corrispondenza. Una voce di cartella vuota è la regola radice.
- La **cartella dei modelli stessa è esclusa** — i nuovi modelli restano vuoti.
- Scegliendo esplicitamente «Nuovo file da modello», il modello scelto ha la precedenza; la regola non si applica in aggiunta.
- L'annullamento di un dialogo crea il file **vuoto** (la creazione stessa era voluta) e mostra un avviso.
- I file creati fuori dall'app (per esempio in Esplora file) non passano per le regole.
