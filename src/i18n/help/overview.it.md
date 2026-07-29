# Manuale

![EM4me](../assets/em4me-logo.svg)

_extended memory for me_

Benvenuto nel manuale di EM4me. Questa pagina di panoramica è il punto di ingresso; ogni sezione si apre in una scheda propria e si comporta come qualsiasi altra scheda: spostala, mettila nella seconda colonna o tienila aperta accanto al tuo lavoro.

## Riferimento

- [Funzionalità](functions.md) — tutte le funzionalità dell'app in una tabella: cosa fanno e come raggiungerle.
- [Scorciatoie da tastiera](shortcuts.md) — le scorciatoie attualmente attive, incluse le tue riassegnazioni.

## Scrivere in Markdown

- [Basi di Markdown](markdown-basics.md) — il nucleo Markdown: titoli, enfasi, elenchi, tabelle, collegamenti, più le particolarità CommonMark.
- [Menu contestuale dell'editor](context-menu.md) — formattare con clic destro: struttura del menu, semantica di selezione, interruttori con segni di spunta, sola lettura e modalità live.
- [Barra di formattazione](toolbar.md) — formattare con pulsante: visibilità in modalità modifica, indicazione dello stato, menu Titolo, griglia della tabella, assegnazione personalizzata.
- [Costrutti di blocco](blocks.md) — callout, contenitori personalizzati, liste di definizioni, line block, note a piè di pagina.
- [Costrutti in linea](inline.md) — evidenziazione, pedice/apice, sottolineatura, spoiler, Critic Markup, span e abbreviazioni.
- [Liste di attività](tasks.md) — liste di attività con stati standard ed estesi.
- [Promemoria](reminders.md) — momenti di avviso sulle attività con ⏰: dialogo di notifica e di recupero, elenco promemoria; l'avviso funziona solo con l'applicazione in esecuzione.
- [Immagini](images.md) — sintassi delle immagini, dimensioni, figure implicite.
- [Allegati](attachments.md) — incollare e trascinare file: posizione e impostazione, nomi, apertura nel programma predefinito.
- [Matematica e diagrammi](math-diagrams.md) — formule KaTeX, diagrammi Mermaid, blocchi di codice con evidenziazione della sintassi.
- [Emoji](emoji.md) — funzionamento degli shortcode e selezione curata.

## Collegare e gestire

- [Collegamenti](linking.md) — wiki link, ancore, incorporamenti, tag e completamento automatico.
- [Sottopagine](subpages.md) — gerarchia di pagine tramite i nomi dei file: separatore ∕ (U+2215), link relativi, breadcrumb e rinomina in cascata.
- [Vista grafo](graph.md) — relazioni di collegamento come grafo interattivo: grafo dell'area come scheda, grafo del file come pannello con profondità e direzione.
- [Frontmatter e proprietà](frontmatter.md) — metadati YAML e barra Proprietà.
- [Profili di proprietà](property-profiles.md) — definizioni di campi centralizzate con tipo, insieme di valori e valore predefinito: file di profilo, assegnazione e profilo standard, effetto in entrambi gli editor delle proprietà.
- [Query Perspective](frontmatter-query.md) — elenchi e tabelle di file dinamici: linguaggio a clausole, fonti, campi del file, funzioni, ordinamento, multicolonna, esportazione.
- [Blocchi di script](scripts.md) — JavaScript nel documento: sandbox isolata, modello di fiducia disattivato per impostazione predefinita, API pq in sola lettura con funzioni di dati, output e supporto, esempi.
- [Modelli](templates.md) — applicare modelli Markdown: cartella dei modelli con priorità dell'area, segnaposto con dialoghi, destinazione del cursore, regole di cartella.
- [Diari](journals.md) — documenti periodici per area: scaffali e granularità, schemi di cartella e nome, pannello calendario, blocco di navigazione, proprietà di data automatiche.
- [Barra laterale](sidebar.md) — organizzare i pannelli: lato, ordine, gruppi di schede, larghezze.
- [Segnalibri](bookmarks.md) — memorizzare file in due sezioni: segnalibri generali e dell'area con percorsi relativi, creazione, conversione, ordine.
- [Combinazioni di colori](color-schemes.md) — colori tramite slot denominati: assegnazione per modalità, combinazioni proprie come copia, anteprima dal vivo, limiti.
- [Applicazioni, finestre e aree](apps-windows.md) — avvio multiplo, gestione delle finestre e sistematica dei titoli.
- [Cronologia del documento](history.md) — registrare le modifiche: file di accompagnamento Markdown-Data, interruttori su tre livelli, confrontare e ripristinare revisioni.
- [Note del documento](notes.md) — una nota per documento: pannello della barra laterale con anteprima commutabile, salvataggio automatico nel file di accompagnamento, distinzione dalla cronologia.
- [Proprietà del blocco](block-properties.md) — proprietà tipizzate per ancora di blocco: pannello che segue il cursore, dati orfani, ridenominazione delle ancore, indicatore sul blocco.
- [Strumenti](tools.md) — linter Markdown, ricerca con regex, trova e sostituisci, editor di tabelle.
- [Posizionamento dei comandi](command-placement.md) — comandi come accessi propri permanenti: pulsanti della barra di stato, elenco di occultamento, voci del menu contestuale, macro.
- [Estensioni](extensions.md) — attivare o disattivare le funzioni singolarmente: categorie, dipendenze, effetto dello stato disattivato.
- [Creare estensioni](extensions-dev.md) — sviluppare estensioni esterne proprie: manifest, API delle estensioni, esempio di riferimento, avvisi di sicurezza.
- [Perspective Table](perspective-table.md) — tabelle con celle-blocco multilinea: sintassi, esempi, ordinamento, esportazione.
- [Perspective Datatable](datatable.md) — tabella dati tipizzata con funzioni di calcolo: tipi di colonna, aggregati, colonne calcolate, modifica in griglia, ordinamento e filtro.
- [Eventi](events.md) — appuntamenti, compleanni e anniversari nel documento: blocco eventi con differenze di tempo scaglionate, traguardi, filtri e quattro viste, aggregazione tramite frontmatter, collegamenti.
- [Sistemi di calendario](custom-calendars.md) — cronologie liberamente definibili per area: blocchi con calendari paralleli, livelli con cinque tipi di relazione, epoche, conversione, sintassi dei valori nel documento e selettore.

## Consigli d'uso

- Tutte le pagine del manuale sono di sola lettura; le quattro viste (Renderizzato, Diviso, Sorgente, Live) restano liberamente selezionabili.
- La **vista divisa** mostra la sorgente Markdown e il risultato renderizzato fianco a fianco — ideale per confrontare gli esempi di sintassi delle pagine tematiche con il loro risultato.
- Il **sommario** nella barra laterale naviga all'interno di una pagina; la **ricerca testuale** (predefinito `Ctrl+F`) la attraversa.
- Cambiando lingua nella barra di stato, le pagine del manuale aperte cambiano immediatamente.
- Novità, roadmap e versione attuale si trovano sul sito web del prodotto [em4me.ch](https://em4me.ch/it/). Il collegamento si apre nel browser predefinito.
