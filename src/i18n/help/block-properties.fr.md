# Propriétés de bloc

Ce que le frontmatter apporte au document entier, les propriétés de bloc l'apportent aux blocs individuels : des données clé-valeur structurées et typées, par exemple un statut de réunion par paragraphe ou une échéance par point d'action. Le support est l'**ancre de bloc** ; les données sont enregistrées dans le **fichier compagnon** du document (Markdown Data, `.mdd`), le même fichier qui porte l'[historique du document](history.md) et les [notes du document](notes.md). Le texte du document reste intact.

## L'ancre de bloc comme support

Une ancre de bloc est un identifiant librement choisi à la fin d'un bloc :

```markdown
Ce paragraphe porte une ancre. ^reunion-1
```

Dans la vue rendue, l'ancre est invisible ; elle rend le bloc adressable. Les lettres (y compris accentuées), les chiffres, le trait d'union et le tiret bas sont autorisés. Les propriétés s'attachent à cet identifiant : tant que l'ancre figure dans le texte, les données appartiennent à ce bloc, où que le bloc soit déplacé dans le document.

## Le panneau Propriétés de bloc

Le panneau « Propriétés de bloc » se commute comme tout panneau latéral : via le menu Affichage → Barre latérale → Panneaux → Propriétés de bloc, l'icône accolades de la barre d'état ou un raccourci clavier personnalisé (aucun n'est attribué par défaut). Côté, ordre et groupes d'onglets suivent les règles de la [barre latérale](sidebar.md).

Le panneau **suit le curseur** : il montre les propriétés du bloc dans lequel se trouve le curseur. L'en-tête nomme l'ancre active et offre un sélecteur de toutes les ancres du fichier pour y sauter ; les ancres porteuses de propriétés y sont marquées. Si le curseur est dans un bloc **sans** ancre, le panneau propose « Créer une ancre » et écrit en fin de bloc un identifiant aléatoire court, unique dans le fichier.

Les lignes de propriétés fonctionnent comme dans le panneau de propriétés du document : chaque ligne a une clé librement choisie, un type (texte, liste, nombre, vrai/faux, date, multiligne, lien, heure) et un champ de valeur adapté. Pour la clé, le panneau suggère les clés de bloc déjà utilisées dans le document. L'enregistrement est **automatique** peu après la saisie ; l'onglet du document n'est pas marqué comme modifié, car les données résident dans le fichier compagnon, pas dans le texte. Dans les vues en lecture seule, le panneau se contente d'afficher les données.

Si des **profils de propriétés** s’appliquent au document, ses blocs héritent de leurs définitions : un champ défini porte ici le même type, les mêmes valeurs proposées et le même marquage que dans le panneau du document. Les champs structurés (objet et liste d’objets) se laissent également modifier sur un paragraphe ; ils sont enregistrés dans le fichier compagnon. **Une telle valeur imbriquée n’apparaît toutefois pas dans l’index de la zone** et ne peut donc pas servir de condition dans une requête de bloc — contrairement aux valeurs simples. Les champs dérivés apparaissent ici aussi, avec leur valeur calculée et non modifiables ; ils ne figurent jamais dans le fichier compagnon.

## Renommer une ancre

L'icône crayon à côté du sélecteur d'ancres renomme l'ancre active. L'ancre dans le texte, l'entrée de données dans le fichier compagnon et les références entrantes **au sein du même document** sont mises à jour ensemble :

```markdown
Voir le premier point : [[#^reunion-1]]
```

Les références venant d'autres fichiers ne sont pas ajustées ; qui référence entre fichiers renomme avec précaution.

## Données orphelines

Si une ancre disparaît du texte, ses propriétés ne sont **pas perdues** : elles restent dans le fichier compagnon et apparaissent dans la section « Données orphelines » du panneau. De là, elles peuvent être assignées à une ancre existante sans données, ou supprimées définitivement. Si un fichier porte la même ancre plusieurs fois, la première occurrence compte ; le panneau signale le doublon.

## Visibilité sur le bloc

Les blocs avec propriétés portent un indicateur discret en fin de bloc dans la vue rendue et en mode direct. Le survol montre la liste clé-valeur ; un clic ouvre le panneau avec cette ancre. L'indicateur n'apparaît pas dans l'export PDF.

## Référencer des blocs

Un bloc avec ancre peut être référencé depuis le même document ou d'autres documents ; le clic saute au bloc :

```markdown
[[Compte-rendu#^reunion-1]]
```

La page [Liens](linking.md) décrit la syntaxe des références en détail. Via la [Requête Perspective](frontmatter-query.md), les blocs peuvent aussi être interrogés selon leurs propriétés (ajout de portée `BLOCKS`).

## Emplacement et limites

Les propriétés résident dans une section propre du fichier compagnon `.mdd` et voyagent avec lui quand document et fichier compagnon sont copiés ou déplacés ensemble ; le **renommage dans l'application** emporte automatiquement le fichier compagnon. L'ancre est la seule identité : si le contenu du bloc change, les données restent attachées à l'ancre.

Deux limites sont à connaître. D'autres programmes Markdown ignorent le couplage au fichier compagnon : si le texte est restructuré hors de l'application et que des ancres disparaissent, les données concernées rejoignent la section des données orphelines (rien ne se perd silencieusement). Et si un bloc est déplacé vers un **autre fichier**, ses propriétés ne suivent pas automatiquement, car le fichier compagnon est lié au document ; recréez-les dans le fichier cible, tandis qu'elles restent comme données orphelines à nettoyer dans le fichier source.
