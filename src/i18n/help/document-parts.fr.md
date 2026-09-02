# Division des grands documents

Les documents très volumineux sont divisés en plusieurs fichiers lors de l'enregistrement et réunis en un seul document à l'ouverture. Dans l'onglet, vous travaillez comme d'habitude : vous voyez un texte continu, l'annulation franchit les limites et la recherche trouve le document dans son ensemble.

La raison est la maniabilité. Un document qui dépasse une certaine taille rend le passage en mode édition laborieux. La division garde chaque fichier maniable sans vous imposer de limite de taille.

## Quand la division a lieu

La division a lieu à l'**enregistrement**, dès que le document dépasse environ un mégaoctet. L'affichage et la lecture ne sont jamais concernés.

La première division d'un document est annoncée. Vous pouvez la refuser : le fichier reste alors entier et l'onglet passe en lecture seule jusqu'à la prochaine ouverture. Une fois les parties créées, les suivantes s'ajoutent sans question.

Si l'enregistrement automatique s'exécute en arrière-plan, rien n'est divisé sans être demandé. L'onglet reste simplement modifié jusqu'à ce que vous enregistriez une fois manuellement et répondiez à la question.

## Où la coupure est faite

La coupure se fait uniquement avant un **titre des deux premiers niveaux**, c'est-à-dire avant une ligne commençant par un ou deux croisillons :

```markdown
# Premier chapitre

Texte …

## Une section
```

Ainsi, aucune construction ne franchit jamais une limite : aucun bloc de code, tableau, liste ou encadré n'est coupé en deux. Les titres à l'intérieur d'un bloc de code ou d'une citation ne comptent pas comme point de coupure.

**S'il n'existe aucun titre de ce type, rien n'est divisé.** Un document très volumineux sans titres reste un seul fichier ; la barre d'état vous indique une fois pourquoi. Ce prix est assumé : couper à un endroit quelconque tomberait au milieu d'un texte formant un tout.

## Comment les parties sont nommées

Le premier fichier conserve le nom du document tel quel. Les parties suivantes portent le même nom avec un complément :

```text
Carnet de voyage.md
Carnet de voyage•part-00002.md
Carnet de voyage•part-00003.md
```

Le séparateur est la **puce** `•`. Il est volontairement différent de celui des [sous-pages](subpages.md), qui utilisent la barre de division `∕` : une partie n'est pas une sous-page, et les deux doivent se distinguer au premier coup d'œil.

Chaque fichier de partie est un fichier Markdown ordinaire, lisible en lui-même. Son en-tête contient une ligne technique qui note son appartenance et sa position :

```yaml
doc-part: v1|2|Carnet de voyage
```

Cette ligne est l'information qui fait foi sur ce qui va ensemble, et non le nom du fichier. Déplacez un fichier de partie dans un autre dossier et le document ne le retrouvera plus.

## Ce que vous en voyez dans le programme

Peu de choses, et c'est voulu :

- **L'onglet et l'éditeur** montrent un document continu.
- **La liste de fichiers de l'espace** ne montre que le document, pas ses parties.
- **La recherche** signale un résultat d'une partie ultérieure comme résultat du document ; le saut l'ouvre à l'endroit trouvé.
- **Le renommage** emmène toutes les parties.
- **L'en-tête du premier fichier** porte la ligne d'appartenance. Elle est la trace visible de la division et apparaît aussi dans les propriétés.

Dans le gestionnaire de fichiers de votre système, vous voyez toujours les parties : ce sont de vrais fichiers dans votre dossier.

## Lorsqu'une partie manque

Si une partie manque à l'ouverture, parce qu'elle a été supprimée, déplacée ou pas encore synchronisée, le document s'ouvre **en lecture seule** et nomme la position manquante. L'enregistrement est bloqué tant que la lacune subsiste : écrire à partir du texte incomplet perdrait définitivement la partie absente.

Deux voies en sortent. Remettez le fichier manquant en place et le document sera de nouveau complet et modifiable à la prochaine ouverture, sans que vous ayez à réinitialiser quoi que ce soit. Ou supprimez le fichier compagnon `.mdd` du document si vous voulez continuer sans cette partie : il contient la liste des parties qui rend la lacune visible.

Si une partie a été **modifiée** en dehors de l'application, l'enregistrement signale un conflit et n'écrase rien.

## Réunir les parties

L'entrée de menu **Fichier → Autres fonctions de fichier → Réunir les parties…** refait un fichier unique à partir des parties et supprime les fichiers de partie. Cela n'a lieu que sur cette demande, jamais de soi-même.

Si le document réuni dépasse le seuil, la commande avertit au préalable : le prochain enregistrement le diviserait immédiatement de nouveau. Aucun contenu n'est perdu, mais la commande resterait sans effet durable.

S'il manque une partie, la commande refuse de s'exécuter : elle supprimerait les parties restantes et rendrait la perte définitive.
