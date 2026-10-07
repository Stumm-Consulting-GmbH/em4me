# Immagini

Le immagini si caricano da file locali il cui percorso è indicato rispetto al file Markdown, oppure da dati incorporati nel testo. In un documento mai salvato le immagini locali compaiono solo dopo il salvataggio, perché fino ad allora non ha una cartella rispetto alla quale risolvere il loro percorso. Le immagini con un indirizzo di rete (`http(s)`) volutamente non vengono mostrate, perché per sicurezza l'applicazione non carica contenuti dalla rete; metti invece un'immagine del genere come file accanto al documento. Il manuale non include immagini dimostrative; gli esempi mostrano quindi la sintassi come blocco di codice con il risultato descritto — nei tuoi file si renderizzano direttamente.

## Sintassi delle immagini

Il testo alternativo tra parentesi quadre descrive l'immagine (importante per l'accessibilità; un testo alternativo mancante viene segnalato dal [linter Markdown](tools.md)).

```markdown
![Diagramma dell'architettura](immagini/architettura.png)
```

I percorsi relativi si risolvono rispetto alla cartella del file Markdown. Per sicurezza compaiono solo immagini entro un confine fisso: se il documento si trova in un'area aperta, è l'intera area, altrimenti la cartella del file Markdown con le sue sottocartelle. Non vengono mostrate le immagini con un indirizzo di file (`file:`), le immagini su una condivisione di rete (`//server/…` o `\\server\…`) e i percorsi che portano fuori dal confine, relativi con `../` o assoluti. Formati supportati: PNG, JPG/JPEG, GIF, WebP, SVG, BMP; un file immagine può essere grande al massimo 20 MB.

## Dimensioni delle immagini

Un suffisso di dimensione dopo l'URL imposta larghezza e/o altezza in pixel:

```markdown
![Alt](immagine.png =300x200)   larghezza 300, altezza 200
![Alt](immagine.png =300x)      solo larghezza, altezza proporzionale
![Alt](immagine.png =x200)      solo altezza, larghezza proporzionale
```

I suffissi non validi restano testo grezzo e non vengono interpretati.

## Figure implicite

Un'immagine **da sola in un paragrafo** diventa una figura con il testo alternativo come didascalia centrata. Le immagini nel testo corrente restano invariate.

```markdown
Paragrafo prima.

![Cifre trimestrali a confronto](chart.png)

Paragrafo dopo.
```

Risultato: l'immagine appare con la didascalia «Cifre trimestrali a confronto» centrata sotto.

## Incorporare immagini con incorporamento wiki

In alternativa `![[immagine.png]]` incorpora un'immagine tramite la sintassi wiki, incluso il modificatore di dimensione `![[immagine.png|300]]` — dettagli nella pagina [Collegamenti](linking.md).

## Ingrandire un'immagine

Un clic su un'immagine nella vista «Renderizzato» — allo stesso modo nella sua metà della vista «Diviso» — la mostra ingrandita sull'intera finestra. Lo sfondo si scurisce e l'immagine appare grande quanto consentono la finestra e la sua risoluzione: intera, non deformata e mai oltre le sue dimensioni. Un'immagine piccola resta quindi alle sue dimensioni, al centro. Un'indicazione di dimensione nel documento (`=300x`) non limita l'ingrandimento. Questo vale per ogni immagine visualizzata, anche in tabelle, riquadri e incorporamenti, e anche per un'immagine che è essa stessa un collegamento.

Sotto l'immagine compare la didascalia — il testo alternativo o, se manca, il nome del file — e sotto ancora due pulsanti:

- **Apri nel programma predefinito** apre il file dell'immagine nel programma che il sistema operativo gli assegna, con gli stessi limiti di qualsiasi [allegato](attachments.md). L'ingrandimento resta aperto. Un'immagine scritta nel testo come dati, senza un file proprio, non mostra questo pulsante.
- **Chiudi** chiude l'ingrandimento.

Tre modi per chiuderlo, tutti con lo stesso effetto: il pulsante «Chiudi», il tasto `Esc` o un clic sull'area scurita accanto all'immagine. Con la tastiera, `Tab` passa da un pulsante all'altro senza uscire dall'ingrandimento.

Un'immagine che la vista non visualizza — per esempio perché manca il suo file — è sostituita dal suo testo alternativo e non apre alcun ingrandimento. Nella vista «Live» un clic non apre alcun ingrandimento; lì un doppio clic apre l'immagine nel programma predefinito.
