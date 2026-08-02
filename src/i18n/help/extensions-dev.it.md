# Creare estensioni

Le estensioni esterne sono pacchetti creati da te che estendono il rendering e l'interfaccia dell'app tramite un'interfaccia definita e versionata (API delle estensioni v1). Questa pagina descrive la struttura del pacchetto, l'API completa e il percorso dall'installazione all'attivazione.

> [!warning] Avviso di sicurezza
> Un'estensione esterna attivata è codice di terze parti con **pieno accesso ai tuoi documenti e all'intera app**. Non esiste un livello tecnico di protezione (nessuna sandbox); la protezione è la tua decisione consapevole nella finestra di avviso. Attiva solo estensioni di cui conosci la fonte e di cui puoi esaminare il codice.

## Struttura del pacchetto

Un pacchetto di estensione è una cartella nella directory delle estensioni del profilo utente. L'azione «Apri cartella» della sezione impostazioni Estensioni (esterne) apre la directory in Esplora file.

```text
<profilo utente>/extensions/
└── mia-estensione/
    ├── manifest.json     (obbligatorio: descrive il pacchetto)
    ├── main.js           (punto d'ingresso UI, modulo ES)
    └── markdown.js       (contributo di rendering, plugin markdown-it)
```

Il nome della cartella deve corrispondere all'ID dell'estensione. Sono consentiti altri file; `main.js` può caricarli tramite istruzioni `import` relative.

## Riferimento del manifest

Il file `manifest.json` descrive il pacchetto:

```json
{
  "id": "mia-estensione",
  "name": "La mia estensione",
  "version": "1.0",
  "apiVersion": "1.0",
  "description": "Breve descrizione per la sezione impostazioni.",
  "entry": "main.js",
  "markdownPlugin": "markdown.js"
}
```

| Campo | Obbligatorio | Significato |
|---|---|---|
| `id` | sì | Identificatore stabile in minuscolo con trattini (kebab-case); deve corrispondere al nome della cartella. |
| `name` | sì | Nome visualizzato nella sezione impostazioni e nella finestra di avviso. |
| `version` | sì | Versione del pacchetto (`major.minor.patch`). La conferma di fiducia vale per versione; dopo un cambio di versione serve una nuova conferma. |
| `apiVersion` | sì | Versione dell'API per cui il pacchetto è costruito (vedi versionamento). |
| `entry` | uno dei due | Punto d'ingresso UI: modulo ES con `activate(ctx)`. |
| `markdownPlugin` | uno dei due | Contributo di rendering: file che esporta un plugin markdown-it. |
| `description` | no | Breve descrizione per la sezione impostazioni. |

`entry` e `markdownPlugin` sono semplici nomi di file nella cartella del pacchetto (senza percorsi). Almeno uno dei due campi è obbligatorio.

## Installazione e attivazione

1. Copia la cartella del pacchetto nella directory delle estensioni.
2. Nella sezione Estensioni (esterne) premi «Aggiorna»: il pacchetto appare con lo stato «Non attivata». I pacchetti appena rilevati partono sempre disattivati.
3. «Attiva…» apre la finestra di avviso. Il codice viene eseguito solo dopo la conferma; la conferma viene salvata per estensione e versione.
4. L'estensione ha effetto immediato e in tutte le finestre; lo stato sopravvive al riavvio.

«Disattiva» ritira subito tutti i contributi (la conferma resta salvata; riattivare la stessa versione non chiede di nuovo). «Rimuovi…» elimina definitivamente la cartella del pacchetto dopo una propria conferma.

## Contributo di rendering: plugin markdown-it

Il file indicato in `markdownPlugin` esporta una funzione plugin markdown-it:

```js
'use strict';
module.exports = function mioPlugin(md) {
  md.inline.ruler.after('emphasis', 'mio-smiley', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== ':-)') return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = '<span class="ext-beispiel-smiley">☺</span>';
    }
    state.pos += 3;
    return true;
  });
};
```

Il file viene eseguito in un ambiente proprio e vuoto: esistono `module` ed `exports`, ma **non** ci sono `require`, `process` né DOM. Il plugin viene applicato a entrambe le istanze di rendering (visualizzazione ed esportazione portabile), dopo tutte le registrazioni integrate. Se il plugin genera un errore alla registrazione, l'estensione viene disattivata automaticamente e il testo dell'errore appare nella sezione impostazioni.

Tre punti da chiarire per primi quando si definisce una sintassi propria:

- **Il carattere iniziale deve essere un carattere terminatore.** Le regole inline vengono invocate solo in corrispondenza di determinati caratteri; tutto ciò che sta in mezzo viene consumato in un solo blocco dalla regola di testo integrata. Una regola posta su un altro carattere scatta solo a inizio paragrafo e mai a metà frase. L'elenco comprende tra gli altri `!`, `#`, `$`, `%`, `&`, `*`, `+`, `-`, `:`, `<`, `=`, `>`, `@`, `[`, `]`, `^`, `_`, `` ` ``, `{`, `}` e `~`; una parentesi tonda, ad esempio, non ne fa parte.
- **Il contenuto che proviene dal documento va in un token proprio.** L'esempio sopra inserisce markup già pronto come `html_inline`; è innocuo finché il contenuto è costante, come qui lo smiley. Non appena del testo del documento finisce nel markup, va sottoposto a escaping: meglio allora definire un token proprio con una regola in `md.renderer.rules` e lasciare l'escaping al motore di rendering, invece di scriverlo a mano e dimenticarlo da qualche parte.
- **Il contributo di rendering non agisce nella modalità diretta.** Ha effetto nella vista renderizzata e nell'esportazione portabile; nella modalità diretta l'applicazione usa decorazioni dell'editor, per le quali l'API non prevede alcun contributo. La tua sintassi resta quindi non marcata nell'editor.

## Punto d'ingresso UI

Il file indicato in `entry` è un modulo ES. Il suo export predefinito fornisce `activate(ctx)` e, facoltativamente, `deactivate()`:

```js
export default {
  activate(ctx) {
    // registrare i contributi (vedi riferimento ctx)
  },
  deactivate() {
    // facoltativo: pulizia propria; i contributi registrati
    // vengono ritirati dall'app stessa alla disattivazione
  },
};
```

`activate` viene eseguito all'avvio dell'app (se l'estensione è attiva) e a ogni attivazione. Se `activate` genera un errore, tutti i contributi già registrati vengono annullati e l'estensione viene disattivata automaticamente.

### Riferimento ctx (API v1)

| Membro | Significato |
|---|---|
| `ctx.apiVersion` | Versione dell'API dell'app (ad es. `1.0`). |
| `ctx.manifest` | Copia congelata di `id`, `name`, `version`, `description`. |
| `ctx.registerSidebarPanel(def)` | Contribuire un pannello della barra laterale (vedi sotto). |
| `ctx.registerCommand(def)` | Contribuire un comando, con scorciatoia predefinita opzionale. |
| `ctx.registerSettingsSection(def)` | Contribuire una propria sezione impostazioni. |
| `ctx.addTranslations(bundles, defaultLocale)` | Registrare traduzioni proprie. |
| `ctx.t(key)` | Risolvere una traduzione: lingua attiva → lingua predefinita → chiave. |
| `ctx.getLanguage()` | Lingua attiva dell'interfaccia (`de`, `en`, `fr`, `es`, `it`). |
| `ctx.getTheme()` | Tema attivo (`light` o `dark`). |
| `ctx.getThemeVariable(name)` | Valore di una variabile CSS del tema, ad es. `--render-font-size`. |
| `ctx.getRenderRoot(colonna)` | Contenitore della vista renderizzata di una colonna, oppure `null`. |
| `ctx.onRenderUpdated(cb)` | Evento dopo ogni ricostruzione della vista renderizzata. |
| `ctx.storage.get(key)` / `ctx.storage.set(key, value)` | Spazio di persistenza dell'estensione (asincrono). |

Tutto ciò che non è elencato qui non fa parte dell'API pubblica — anche se tecnicamente raggiungibile — e può cambiare in qualsiasi momento.

### Pannello della barra laterale

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, paneIdx) {
    body.textContent = 'Contenuto del pannello';
  },
});
```

Il pannello riceve una propria sezione per colonna ed è visibile finché l'estensione è attiva. Posizione, lato e gruppi di schede seguono la normale disposizione della barra laterale (pagina del manuale Barra laterale) e vengono salvati. Al posto di `titleKey` (consigliato, multilingue tramite `addTranslations`) è possibile anche un `title` fisso.

### Comando

```js
ctx.registerCommand({
  id: 'contare',
  titleKey: 'command.title',
  defaultBinding: 'CmdOrCtrl+Alt+9',
  run() {
    // azione
  },
});
```

Il comando appare nell'editor delle scorciatoie da tastiera (gruppo «Generale») e lì può essere riassegnato; `defaultBinding` è opzionale. Le voci di menu e le voci della pagina generata delle scorciatoie del manuale non fanno parte della v1.

### Sezione impostazioni

```js
ctx.registerSettingsSection({
  id: 'impostazioni',
  titleKey: 'settings.title',
  render(container) {
    const input = document.createElement('input');
    ctx.storage.get('valore').then((v) => {
      input.value = typeof v === 'string' ? v : '';
    });
    input.addEventListener('change', () => ctx.storage.set('valore', input.value));
    container.appendChild(input);
  },
});
```

La sezione appare nella navigazione delle impostazioni finché l'estensione è attiva. I valori vanno nello spazio `ctx.storage`; vengono conservati alla disattivazione.

### Traduzioni

```js
ctx.addTranslations(
  {
    it: { 'panel.title': 'Il mio pannello' },
    en: { 'panel.title': 'My panel' },
  },
  'en',
);
```

`ctx.t('panel.title')` risolve nella lingua attiva e ricade sulla lingua predefinita dell'estensione (secondo argomento), infine sulla chiave stessa. Le chiavi dei campi `titleKey` sono risolte con lo stesso meccanismo e seguono il cambio di lingua dell'app.

### Punto di aggancio del rendering

Un pannello che voglia dire qualcosa sul documento visualizzato ha bisogno di due cose: il contenitore della vista renderizzata e la notizia che è cambiata.

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, colonna) {
    disegna(body, colonna);
  },
});

ctx.onRenderUpdated((colonna) => {
  // Documento ricostruito o vista cambiata in questa colonna
  const radice = ctx.getRenderRoot(colonna);
  const trovati = radice ? radice.querySelectorAll('.mio-segno') : [];
  // … riempire di nuovo il pannello di questa colonna
});
```

Il numero di colonna è lo stesso del secondo argomento di `render`. `ctx.getRenderRoot` restituisce `null` finché la colonna non mostra una vista renderizzata, cioè nelle viste sorgente, diretta e di sistema; non è un caso di errore, ma lo stato normale. L'evento scatta sia dopo una ricostruzione del documento sia al passaggio verso una vista con contenuto renderizzato e ritorno.

Due indicazioni: nel contenitore cerca solo i **tuoi** elementi, quelli prodotti dal tuo contributo di rendering, e non elementi dell'applicazione, la cui struttura non è garantita. La cancellazione la esegue l'applicazione alla disattivazione; la funzione restituita serve solo se vuoi smettere prima.

## Versionamento e compatibilità

L'API delle estensioni porta un proprio numero di versione semantico; l'applicazione è attualmente alla **1.1**. Un pacchetto dichiara in `apiVersion` la versione dell'API per cui è costruito. È compatibile se la versione maggiore corrisponde a quella dell'app e la versione minore dichiarata non è più recente di quella dell'app. Un pacchetto che dichiara `"1.0"` continua quindi a funzionare invariato; chi usa il punto di aggancio del rendering dichiara `"1.1"` e richiede così un'app che lo conosca. I pacchetti incompatibili non vengono mai caricati e sono elencati nella sezione impostazioni con un messaggio chiaro.

Promessa di stabilità: le firme documentate in questa pagina restano stabili all'interno della stessa versione maggiore.

## Diagnosi degli errori

- Se un'estensione genera un errore al caricamento (errore di manifest, errore di import, `activate`, registrazione del plugin), viene disattivata automaticamente; la sezione impostazioni mostra lo stato «Errore» con il testo dell'errore, anche dopo un riavvio.
- I manifest non validi sono elencati con dettagli diagnostici e non vengono mai caricati.
- Gli errori a runtime nei comandi o nel disegno di un pannello non bloccano l'app; i dettagli compaiono nel log della console.
- «Attiva…» dopo un errore ritenta il caricamento (il testo dell'errore viene azzerato).

## Note sulla qualità

L'isolamento degli errori intercetta i crash, non la scarsa qualità. È tua responsabilità in particolare:

- **Prestazioni di rendering:** le regole markdown-it vengono eseguite a ogni rendering; regole costose rallentano digitazione e anteprima.
- **Output pulito:** l'HTML generato deve adattarsi allo stile del documento e non caricare risorse remote (link dimostrativi verso `example.org`).
- **Pulizia:** timer propri, listener al di fuori dei contributi registrati e stati globali vanno in `deactivate()`.

L'estensione di riferimento **Notiz-Merker** (segnaposto per note) funge da modello eseguibile. Usa tutti i tipi di contributo di questa pagina in un unico insieme: una sintassi propria marca dei passaggi, un pannello li raccoglie in un elenco su cui si può saltare, un comando li percorre e una sezione impostazioni regola colore e ordinamento. Si trova nel codice sorgente pubblicato del programma, nella cartella `addon_examples/notiz-merker/`, e porta con sé un proprio README, che nomina anche i limiti in cui si imbatterà ogni estensione di propria mano.
