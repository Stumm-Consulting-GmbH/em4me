# Frontmatter et propriétés

Un bloc YAML en début de fichier porte les métadonnées. Il apparaît en vue Lecture sous forme de ligne frontmatter repliée, est affiché discrètement dans l'éditeur source et entretenu sous forme de formulaire via la barre Propriétés.

## Bloc YAML

Le bloc se trouve entre deux lignes `---` et doit être la toute première ligne du fichier — c'est pourquoi cette page du manuel le montre en bloc de code plutôt qu'en direct :

```markdown
---
title: Plan projet
aliases: [Plan, Roadmap]
tags: [projet/markdown, planification]
review: 2026-07-01
final: false
---
```

## Affichage dans le rendu

En tête de la vue rendue, le frontmatter apparaît comme une ligne repliée discrète avec le nombre de champs. Le survol déplie le YAML en clair (commentaires compris), l'éloignement le replie ; un clic sur la ligne l'épingle, un autre clic la libère. La ligne se manipule au clavier (focus, puis Entrée ou Espace) et est en lecture seule — l'édition passe par la barre Propriétés ou le texte source. En cas d'erreur de syntaxe YAML, la ligne montre le texte brut sans nombre de champs.

En mode Live, la même ligne remplace les lignes YAML tant que le curseur reste à l'extérieur ; l'entrée du curseur ou un clic dans le YAML déplié bascule vers le texte source éditable, la sortie replie de nouveau.

L'affichage se désactive sous Fichier → Paramètres… → Apparence (par défaut : activé). Le réglage supplémentaire « Afficher le frontmatter déplié » (par défaut : désactivé) y garde le bloc ouvert en permanence — dans la vue rendue, en mode direct et donc aussi dans l'export PDF.

## Champs particuliers

- `aliases:` rend le fichier accessible sous d'autres noms via `[[Alias]]` ; les rétroliens le trouvent par n'importe quel alias et marquent les correspondances « via alias » (voir [Liens](linking.md)).
- `tags:` ajoute des tags en plus des `#tags` du texte courant ; les deux sources alimentent la barre latérale des tags.

## Vue de l'éditeur par document

Les trois bascules de vue de l'éditeur — marge de pliage, numéros de ligne et retour à la ligne — sont enregistrées par document dans le frontmatter et voyagent avec le fichier, y compris lors d'une copie ou d'une ouverture sur une autre machine :

```markdown
---
fold-gutter: false
line-numbers: true
word-wrap: true
---
```

Seules les vraies valeurs `true`/`false` sont prises en compte ; les autres valeurs sont ignorées. La résolution suit cet ordre : la clé du frontmatter avant le réglage global par défaut (Fichier → Paramètres… → Apparence) avant la valeur par défaut intégrée (pliage activé, numéros de ligne activés, retour à la ligne désactivé).

La bascule via la barre d'état ou le menu Affichage écrit la nouvelle valeur directement dans le frontmatter du document actif : le fichier devient ainsi modifié et est enregistré par la voie d'enregistrement normale. Si un document n'a pas encore de frontmatter, la bascule crée le bloc.

Cas particuliers : dans les cibles en lecture seule (comme les pages du manuel) et en cas de YAML incorrect, la bascule n'agit que de façon éphémère pour la session en cours. Dans les onglets Sans titre, elle est également éphémère ; au premier enregistrement, l'application reporte les valeurs qui diffèrent de la valeur par défaut dans le frontmatter du nouveau fichier.

## Image de couverture

La propriété `cover` place une image en tête du document : sur toute la largeur du contenu, recadrée à une hauteur réglable et jamais déformée. Deux autres propriétés fixent la hauteur et le cadrage :

```markdown
---
cover: images/plage.jpg
cover-height: 240
cover-position: top
---
```

L'image s'indique de deux façons :

- **comme chemin relatif au document**, comme pour une image ordinaire : `cover: images/plage.jpg`. La même limite, les mêmes formats et le même plafond de 20 Mo s'appliquent que sur la page [Images](images.md).
- **comme nom entre doubles crochets, entre guillemets** : `cover: "[[plage.jpg]]"`. L'application trouve alors l'image par son nom, quel que soit le dossier de la zone où elle se trouve.

Si l'image est renommée, l'application n'adapte pas la valeur de `cover` ; le nouveau nom se saisit à la main.

`cover-height` est la hauteur en pixels, 200 par défaut ; les valeurs inférieures à 80 ou supérieures à 600 sont ramenées à la limite la plus proche. `cover-position` choisit la partie visible de l'image : un nombre de 0 à 100, mesuré depuis le haut (0 montre le bord supérieur, 100 le bord inférieur), ou l'un des mots `top`, `center` et `bottom` ; par défaut, le milieu. Ce qui n'est pas compris revient silencieusement à la valeur par défaut.

L'image de couverture apparaît dans la vue rendue, dans sa moitié de la vue partagée et en mode Live, sous la [ligne de titre](tools.md) avec le nom de fichier et au-dessus de la ligne du frontmatter. En mode Live, elle reste en place même lorsque le curseur se trouve dans les lignes YAML, et une modification de `cover` affiche aussitôt la nouvelle image. L'image de couverture ne dépend pas de l'affichage du frontmatter et apparaît même lorsque celui-ci est désactivé ; un bloc comportant une erreur de syntaxe YAML ne produit pas d'image de couverture.

L'impression, l'export PDF et l'export HTML contiennent l'image de couverture telle que la vue rendue l'affiche. La [présentation](presentation.md), les documents intégrés, les cartes et les aperçus n'affichent pas d'image de couverture.

Si l'application ne trouve pas l'image — le fichier manque, se trouve hors de la limite, n'est pas un fichier image ou dépasse 20 Mo —, la remarque discrète « Image de couverture introuvable » apparaît à sa place, sans message d'erreur. Il en va de même dans un document jamais enregistré, jusqu'à son enregistrement. Une adresse Internet (`http:` ou `https:`) n'est pas chargée ; à sa place, une remarque invite à placer l'image comme fichier dans la zone. L'impression et l'export omettent les remarques ; une image de couverture sans image y disparaît entièrement.

Les fichiers de livre et de bibliothèque portent leur image de couverture dans la même propriété `cover` (voir [Livres](books.md)) ; lorsqu'on ouvre un tel fichier comme document, l'image apparaît aussi en tête, au-dessus de son contenu.

L'image de couverture fait partie de l'[extension interne](extensions.md) « Image de couverture », activée à partir du mode de travail **Avancé**. Si elle est désactivée, ni image ni remarque n'apparaissent ; les propriétés restent inchangées dans le document et dans la barre Propriétés, et après la réactivation l'image de couverture est de retour.

## Carte mentale par document

La clé `mindmap` détermine la façon dont la [vue carte mentale](mindmap.md) dessine ce document précis et remplace ainsi la valeur par défaut sous Fichier → Paramètres… → Carte mentale :

```markdown
---
mindmap:
  layout: mitte
  linienfuehrung: gerade
  anfangsTiefe: 2
---
```

`layout` accepte la position de la racine (`links`, `mitte`, `rechts`, `oben`, `unten`), `linienfuehrung` les valeurs `geschwungen` et `gerade` ; s'y ajoutent les nombres `farbEinfrierEbene`, `anfangsTiefe` et `hoechstBreite`. Ce qui n'est pas compris revient silencieusement à la valeur par défaut.

## Barre Propriétés

La barre Propriétés affiche les champs du frontmatter en édition directe. Le type de champ se déduit de la valeur : texte, liste, date, nombre, booléen ou multiligne. Les nouveaux champs se créent via « + Ajouter une propriété » ; les modifications suivent le paramètre d'enregistrement automatique.

Un clic dans un champ de valeur propose les valeurs déjà attribuées à cette propriété dans la zone, par ordre alphabétique ; chaque caractère saisi réduit la liste, et une valeur propre reste librement saisissable. Lorsqu'un profil de propriétés définit un ensemble de valeurs, les deux origines apparaissent ensemble et restent distinguables — les valeurs issues de l'existant sont signalées comme telles. Si la propriété n'apparaît nulle part dans la zone, aucune liste ne s'affiche. Désactivable sous Fichier → Paramètres… → Extensions.

À l'écriture, le bloc reste stable en aller-retour : commentaires, ordre des champs et style des champs non modifiés ne sont pas reformatés, et les fins de ligne CRLF restent stables. Les listes sur une ligne entre crochets sont écrites sans espaces intérieurs (`[a, b]`) ; une liste écrite `[ a, b ]` passe une seule fois à cette forme lors du premier enregistrement et reste ensuite inchangée.

En cas d'erreur de syntaxe YAML, la barre affiche le message d'erreur et bloque l'ajout jusqu'à réparation du bloc dans l'éditeur.

## Date de création et de modification

Deux champs peuvent être tenus à jour automatiquement lors de l'enregistrement : la date de création à partir de la date de création du fichier et la date de modification à partir du moment de l'enregistrement.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Les deux champs s'activent indépendamment et leurs noms sont librement modifiables. Le format est au choix date seule ou date et heure, toujours en heure locale. Une date de création existante n'est jamais écrasée ; la date de modification suit chaque enregistrement. Si un enregistrement inscrit une nouvelle date de modification, un `Ctrl+Z` juste après annule cette date avec la dernière modification qui la précède, y compris après l'enregistrement automatique.

Les champs manquants ne sont créés que si l'option correspondante est active. Sinon, seuls les champs déjà présents dans le bloc sont mis à jour et le document reste inchangé pour le reste. L'accès et l'interrupteur figurent dans le [tableau des fonctions](functions.md).
