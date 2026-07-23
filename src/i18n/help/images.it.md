# Immagini

Le immagini si caricano da percorsi relativi al file Markdown o da URL `http(s)`. Il manuale non include immagini dimostrative; gli esempi mostrano quindi la sintassi come blocco di codice con il risultato descritto — nei tuoi file si renderizzano direttamente.

## Sintassi delle immagini

Il testo alternativo tra parentesi quadre descrive l'immagine (importante per l'accessibilità; un testo alternativo mancante viene segnalato dal [linter Markdown](tools.md)).

```markdown
![Diagramma dell'architettura](immagini/architettura.png)
```

I percorsi relativi si risolvono rispetto alla cartella del file Markdown; per sicurezza si risolvono solo immagini sotto quella cartella (nessuna fuga `../`). Formati supportati: PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

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
