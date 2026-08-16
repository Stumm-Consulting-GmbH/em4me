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

À l'écriture, le bloc reste stable en aller-retour : commentaires, ordre des champs et style des champs non modifiés ne sont pas reformatés, et les fins de ligne CRLF restent stables.

En cas d'erreur de syntaxe YAML, la barre affiche le message d'erreur et bloque l'ajout jusqu'à réparation du bloc dans l'éditeur.

## Date de création et de modification

Deux champs peuvent être tenus à jour automatiquement lors de l'enregistrement : la date de création à partir de la date de création du fichier et la date de modification à partir du moment de l'enregistrement.

```yaml
created: 2025-06-23 15:43
updated: 2026-07-18 12:04
```

Les deux champs s'activent indépendamment et leurs noms sont librement modifiables. Le format est au choix date seule ou date et heure, toujours en heure locale. Une date de création existante n'est jamais écrasée ; la date de modification suit chaque enregistrement.

Les champs manquants ne sont créés que si l'option correspondante est active. Sinon, seuls les champs déjà présents dans le bloc sont mis à jour et le document reste inchangé pour le reste. L'accès et l'interrupteur figurent dans le [tableau des fonctions](functions.md).
