# Livres

Un livre réunit plusieurs fichiers Markdown dans un **ordre de lecture déclaré**. L'arborescence d'une [zone](apps-windows.md) trie par ordre alphabétique, les [sous-pages](subpages.md) portent leur hiérarchie dans le nom de fichier ; un livre, lui, écrit sa structure noir sur blanc, dans un fichier compagnon placé dans le dossier du livre. Les chapitres restent des fichiers Markdown ordinaires et se lisent séparément, même sans l'application.

## Ce qu'est un livre

Un livre vit dans un dossier qui lui est propre. Trois choses s'y trouvent :

- le **fichier du livre**, un fichier Markdown ordinaire contenant le texte du livre ; les propriétés et une référence d'image vont dans le [frontmatter](frontmatter.md), comme partout ailleurs,
- le **fichier compagnon** `Book_Settings.mdda`, qui nomme le fichier du livre et porte l'arbre des chapitres,
- les **chapitres** sous forme de fichiers Markdown, directement dans le dossier du livre ou dans des sous-dossiers de profondeur quelconque.

Un dossier de livre ressemble donc à peu près à ceci :

```text
Voyage à Ithaque/
  Book_Settings.mdda
  Voyage à Ithaque.md
  Partie 1/
    Le départ.md
    Le port.md
  Partie 2/
    Le retour.md
```

### Le fichier compagnon

Le fichier compagnon est du JSON indenté et lisible. Il nomme le fichier du livre et décrit l'arbre des chapitres ; les chemins sont relatifs au dossier du livre :

```json
{
  "schemaVersion": 1,
  "book": { "file": "Voyage à Ithaque.md" },
  "chapters": [
    {
      "path": "Partie 1/Le départ.md",
      "children": [{ "path": "Partie 1/Le port.md", "children": [] }]
    },
    { "path": "Partie 2/Le retour.md", "children": [] }
  ]
}
```

Deux propriétés du modèle en découlent. D'abord, l'application reconnaît un livre **au seul fichier compagnon** : un fichier Markdown est le fichier du livre exactement lorsque le fichier compagnon de son dossier le nomme. Rien n'est inscrit dans le fichier Markdown pour cela, il ne porte aucune référence en retour. Ensuite, l'**emplacement du dossier ne dit rien de la structure** : l'endroit où se trouve un fichier de chapitre est libre et modifiable à tout moment, la structure réside uniquement dans l'arbre des chapitres.

Un chapitre appartient à exactement un livre et y figure exactement une fois. Rattacher le même fichier plusieurs fois n'est pas prévu.

## Ouvrir et créer un livre

Les deux voies se trouvent dans le menu **Fichier**, auprès des entrées de zone :

- **Ouvrir un livre…** demande le dossier du livre. S'il ne contient pas de fichier compagnon nommant un fichier de livre, l'application signale que le dossier n'est pas un livre et ne change rien.
- **Nouveau livre…** demande un dossier parent et un nom. L'application y crée le dossier du livre, avec le fichier du livre de même nom et le fichier compagnon, puis ouvre le livre.
- **Fermer le livre** ferme le livre avec sa fenêtre et ses onglets ; en cas de modifications non enregistrées, l'application demande comme à la fermeture d'une fenêtre.

Un livre ouvert se comporte **comme une zone** : il s'ouvre comme application à part avec sa propre fenêtre, le titre de la fenêtre porte le nom du livre, et le dossier du livre avec ses sous-dossiers est l'espace de travail de cette fenêtre. Ce qui se trouve hors du dossier du livre n'y est ni visible ni utilisable ; les images et pièces jointes d'un livre appartiennent donc au dossier du livre. Deux livres ne sont jamais dans la même fenêtre : si le livre est déjà ouvert, l'application saute vers sa fenêtre, et un deuxième livre ouvre la sienne. À l'ouverture, le fichier du livre apparaît comme onglet, la table des matières s'affiche, et un livre ouvert est restauré au démarrage suivant. Un chapitre s'ouvre par ailleurs tout à fait normalement, sans contexte de livre ; il reste un fichier Markdown ordinaire.

## La table des matières

Le panneau **Livre** affiche l'arbre des chapitres dans l'ordre déclaré. Un clic ouvre un chapitre, celui qui est en cours de lecture est mis en évidence. Devant chaque nom se trouve un marqueur, qui sert aussi de poignée pour l'entretien. Le panneau se bascule comme tous les autres : par le bouton de la barre d'état ou par Affichage → Panneaux → Livre. Côté, ordre et groupes d'onglets suivent les règles de la [barre latérale](sidebar.md).

### Les fichiers non rattachés

Sous l'arbre se trouve la section **Non rattachés** avec les fichiers Markdown du dossier du livre qui ne figurent dans aucun chapitre. Ils ne sont pas cachés mais restent visibles et utilisables, afin que l'on voie ce qui attend encore sa place. Le fichier du livre lui-même n'y apparaît jamais, il n'est pas un chapitre.

## Entretenir la structure des chapitres

Les trois voies ne modifient **que la déclaration** du fichier compagnon. Aucun fichier n'est déplacé, renommé ou supprimé au passage.

### Glisser

Le marqueur placé devant le nom d'un chapitre permet de glisser ce chapitre avec ses sous-chapitres. L'endroit survolé au-dessus de la ligne cible décide de la chute : le tiers supérieur place avant, le tiers inférieur après, le milieu rattache comme sous-chapitre. Un dépôt sur la zone libre du panneau ajoute à la fin du niveau supérieur. Une entrée venant de « Non rattachés » rejoint l'arbre par le même chemin. Glisser un chapitre sous l'un de ses propres sous-chapitres est exclu.

### Clavier

Lorsqu'une ligne a le focus, ces entrées fixes agissent sur le chapitre et ses sous-chapitres :

| Entrée | Effet |
|---|---|
| `Alt+↑` / `Alt+↓` | une position vers le haut ou vers le bas dans le niveau |
| `Alt+→` | imbriquer : devient le dernier sous-chapitre de son prédécesseur |
| `Alt+←` | désimbriquer : monte d'un niveau, derrière son ancien chapitre parent |
| `Entrée` / `Espace` | ouvrir le chapitre |

Au bord d'un niveau, l'arbre reste inchangé et ne signale rien : il n'y a tout simplement pas de cible.

### Menu contextuel

Le clic droit sur une ligne propose :

- **Nouveau chapitre** crée un fichier et le rattache aussitôt. Le nom se saisit directement dans le panneau ; le fichier naît dans le dossier du chapitre parent, au niveau supérieur dans le dossier du livre.
- **Détacher** retire l'entrée de l'arbre. Le fichier subsiste et apparaît ensuite sous « Non rattachés ».
- **Rattacher** est la voie inverse sur un fichier non rattaché ; il rejoint la fin du niveau supérieur.

Sur la zone libre du panneau, le clic droit crée un nouveau chapitre au niveau supérieur.

## Lire au-delà des limites de chapitre

Deux boutons dans l'en-tête du panneau avancent et reculent d'une position ; les mêmes pas existent comme commandes dans la palette et, par défaut, sur `Ctrl+Alt+Page suiv.` et `Ctrl+Alt+Page préc.`. Le parcours suit l'ordre de lecture de l'arbre : un chapitre précède ses sous-chapitres, puis viennent ses frères et sœurs.

Aux extrémités, il n'y a pas de bouclage. Au lieu de sauter silencieusement à l'autre bout, la barre d'état signale que le début ou la fin du livre est atteint ; les boutons y sont désactivés. Les fichiers non rattachés restent hors du parcours.

## Déplacer les fichiers de chapitre

Comme l'emplacement du dossier est libre, sa modification dispose d'une commande propre : **Déplacer le fichier du chapitre…** dans le menu contextuel d'une entrée. Elle demande un dossier cible à l'intérieur du dossier du livre et y déplace le fichier. Deux choses suivent :

- les **références** au fichier depuis d'autres documents,
- l'**arbre des chapitres**, dont l'entrée conserve la même place et les mêmes sous-chapitres.

Une cible hors du dossier du livre est refusée, tout comme une cible qui contient déjà un fichier de ce nom. Le fichier du livre lui-même ne se déplace pas. Renommer un fichier de chapitre fonctionne comme pour tout autre fichier et met à jour l'arbre des chapitres de la même façon.

## Réparer les chapitres manquants

Si un fichier de chapitre est déplacé ou supprimé hors de l'application, son entrée pointe dans le vide. Elle ne disparaît pas mais reste dans la table des matières et porte la marque **manquant** ; elle n'est pas cliquable, car il n'y a rien à ouvrir.

S'il existe ailleurs dans le dossier du livre un fichier du même nom, la ligne porte en plus un signe de recherche, en guise de proposition de retrouvaille. Elle n'est jamais exécutée d'elle-même. Le menu contextuel de l'entrée propose deux voies :

- **Réattribuer…** ouvre un choix sous la ligne. Une trouvaille unique portant le même nom y est mise en évidence et présélectionnée ; à côté, « Choisir un autre fichier… » mène au choix libre à l'intérieur du dossier du livre.
- **Détacher** supprime l'entrée lorsque le chapitre a réellement disparu.

Dès que l'attribution est faite, la ligne perd sa marque.

## Bibliothèques

Une bibliothèque regroupe des livres. Elle vit dans son propre dossier, qui contient le **fichier de bibliothèque** (un fichier Markdown ordinaire avec le texte descriptif ; les propriétés et la référence d'image `cover` se trouvent comme partout dans le [frontmatter](frontmatter.md)), le **fichier compagnon** `Shelf_Settings.mdda` et les **livres** comme dossiers de livre directement en dessous. La hiérarchie s'arrête à la bibliothèque ; il n'y a pas de bibliothèque dans une bibliothèque.

```json
{
  "schemaVersion": 1,
  "shelf": { "file": "Ma bibliothèque.md" },
  "books": ["Voyage à Ithaque", "Livre de cuisine"]
}
```

Le fichier compagnon désigne le fichier de bibliothèque et recense les livres classés dans leur ordre. Comme pour les livres, l'application reconnaît une bibliothèque **au seul fichier compagnon** ; le fichier de bibliothèque ne porte aucun renvoi.

### Ouvrir et créer une bibliothèque

Les entrées se trouvent dans le menu **Fichier**, à côté des entrées de livre : **Ouvrir une bibliothèque…** demande le dossier de bibliothèque (un dossier sans fichier de bibliothèque désigné est refusé avec un message), **Nouvelle bibliothèque…** crée le dossier, le fichier de bibliothèque et le fichier compagnon, **Fermer la bibliothèque** ferme la bibliothèque avec sa fenêtre. Ouvrir le fichier de bibliothèque lui-même ouvre aussi la bibliothèque.

Une bibliothèque ouverte se comporte **comme une zone**, exactement comme un livre : elle s'ouvre comme application à part avec sa propre fenêtre, le titre de la fenêtre porte le nom de la bibliothèque, et le dossier de la bibliothèque est l'espace de travail de cette fenêtre. Si la bibliothèque est déjà ouverte, l'application saute vers sa fenêtre. Une bibliothèque ouverte est restaurée au démarrage suivant.

La fenêtre de bibliothèque ne tient que le **niveau bibliothèque** : chaque accès à un livre, fichier du livre ou fichier de chapitre, mène à la fenêtre de ce livre, et le fichier s'y ouvre. Dans la fenêtre de bibliothèque elle-même n'ouvrent que les fichiers situés directement dans le dossier de la bibliothèque, comme le fichier de bibliothèque avec son texte de description. Ainsi des chapitres de livres différents ne partagent jamais une fenêtre.

### La vue de la bibliothèque

Une bibliothèque ouverte apparaît comme page à part dans le système d'onglets. Deux présentations sont disponibles, commutables dans la vue et mémorisées par bibliothèque : les **vignettes** montrent les images des livres en grille ; un livre sans référence d'image reçoit une vignette de substitution avec son titre. Les **lignes** montrent image, nom, nombre de chapitres, auteur et description. Un clic ouvre le livre dans sa propre fenêtre ; la bibliothèque reste en place comme vue d'ensemble.

Sous le fonds se trouve la section **Non classés** avec les dossiers de livre du dossier de bibliothèque qui ne sont pas encore classés ; **Ajouter** les classe, **Retirer** enlève un classement sans toucher au dossier du livre. Un livre classé dont le dossier manque reste visible et est marqué comme manquant.

## Activer et désactiver

Les livres et les bibliothèques forment ensemble une extension commutable (Paramètres → [Extensions](extensions.md), groupe Outils), active d'origine. À l'état désactivé, les entrées de menu, les commandes, le panneau et la vue de la bibliothèque disparaissent ; les fichiers de livre et de bibliothèque s'ouvrent alors comme tout autre fichier Markdown. Fichier du livre, fichier de bibliothèque, fichiers compagnons et chapitres restent intacts, et la réactivation rétablit l'état sans changement.
