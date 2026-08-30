# Barre de format

La barre de format est une barre de boutons au-dessus de l'éditeur pour les gestes d'édition fréquents : formats de caractère, titres, listes, citation, liens et tableaux. Chaque bouton déclenche une commande du registre central — les mêmes commandes qu'exécutent le menu contextuel de l'éditeur, les raccourcis clavier et la palette de commandes. La barre appartient à l'extension désactivable « Barre de format » (catégorie Outils).

## Visibilité

La barre apparaît précisément lorsque l'onglet actif est en mode édition et que la vue affiche un éditeur (vue Source, Scindée ou Live). En vue lecture, sur les pages du manuel et système et en mode focus, elle est invisible. Dans la disposition de fenêtre scindée, chaque colonne d'éditeur porte sa propre barre ; un clic dans la barre de la deuxième colonne active en même temps cette colonne.

## Affectation standard et affichage de l'état

L'affectation standard regroupe par séparateurs : les formats de caractère (gras, italique, barré, surligner, code), le menu Titre, les types de liste (liste à puces, liste numérotée, liste de tâches), la citation, les deux actions de lien (lien wiki, lien externe) et le bouton Tableau. Les info-bulles montrent le nom de la commande et le raccourci actuellement actif, les noms d'affichage personnalisés les précèdent.

Les boutons enfoncés indiquent l'état à la position du curseur : les boutons de liste, de titre et de citation suivent la ligne du curseur, les boutons de format de caractère suivent la sélection ou le mot sous le curseur. Enfoncé signifie ici : un nouveau clic retire le format — l'affichage et l'effet de bascule restent identiques.

## Menu Titre

Le bouton Titre ouvre la sélection de niveau : niveau de titre un à six plus « Aucun titre », avec une coche sur le niveau de la ligne du curseur. Le bouton lui-même apparaît enfoncé dès que la ligne du curseur est un titre.

## Grille de tableau

Le bouton Tableau ouvre une grille de sélection sur le modèle des logiciels de traitement de texte : le survol marque des lignes sur des colonnes (l'étiquette indique la taille, lignes en-tête comprise), un clic insère le tableau vide avec ligne d'en-tête et ligne de séparation au curseur. Annuler retire le tableau inséré en une étape. À tous les autres accès (menu contextuel, palette, raccourci), la commande Tableau insère sans changement son gabarit standard compact.

À côté se trouve un second bouton pour le [tableau Perspective](perspective-table.md) : son icône montre un tableau à ligne d'en-tête fusionnée, et un clic insère une petite trame immédiatement valide avec une ligne d'en-tête et une ligne de données ; le curseur se place ensuite dans la première cellule d'en-tête. Il n'y a pas de grille ici, car un tableau Perspective se façonne de toute façon ensuite par des cellules fusionnées. Si l'extension des tableaux Perspective est désactivée, le bouton n'apparaît pas.

## Débordement

Si l'affectation ne tient pas dans la largeur de la colonne d'éditeur, les entrées de fin passent dans un menu supplémentaire au bord droit de la barre. Les entrées de menu montrent l'icône, le nom et la coche d'état ; le menu Titre y apparaît comme sous-menu, l'entrée Tableau ouvre la grille de sélection.

## Personnaliser l'affectation

La section « Fichier → Paramètres… → Barre de format » gère l'affectation sous forme de liste : réordonner les entrées (monter/descendre), les modifier et les retirer ; de nouvelles commandes se créent dans un dialogue en trois étapes (commande par recherche filtrée, icône du jeu sélectionné, nom d'affichage facultatif). Les séparateurs et le menu Titre sont des types d'entrée propres ; « Réinitialiser au standard » rétablit l'affectation standard. Les entrées dont la commande appartient à une extension désactivée n'apparaissent pas dans la barre — la configuration est conservée et revient avec l'extension.

## Délimitation

La barre de format est l'accès d'édition en mode édition. Les [boutons de barre d'état personnalisés](command-placement.md) du placement des commandes sont des accès en permanence visibles et librement affectables dans la barre d'état ; la palette de commandes (voir [Outils](tools.md)) est l'accès clavier éphémère à toutes les commandes.

## État désactivé

Si l'extension « Barre de format » est désactivée, la barre disparaît complètement et la section de paramètres est masquée ; toutes les commandes de format restent accessibles via le menu contextuel, les raccourcis et la palette. L'affectation reste enregistrée et s'applique inchangée après réactivation.
