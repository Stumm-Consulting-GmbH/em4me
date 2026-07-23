# Menu contextuel de l'éditeur

Un clic droit dans l'éditeur ouvre un menu contextuel qui rend les constructions de mise en forme, de paragraphe et d'insertion accessibles directement sur le texte. Il est disponible en mode source et en mode live. Les accès et les raccourcis par défaut figurent dans le [tableau des fonctions](functions.md).

## Structure

De haut en bas, le menu se divise en six groupes :

- **Lien** — entourer la sélection d'un lien wiki ou d'un lien externe.
- **Format** — niveau caractère : gras, italique, barré, surligné, code, maths, commentaire et « effacer la mise en forme ».
- **Paragraphe** — niveau ligne : liste à puces, liste numérotée, liste de tâches, titre 1 à 6, aucun titre et citation.
- **Insérer** — modèles : note de bas de page, tableau, encadré, ligne horizontale et bloc de code.
- **Tableau** — opérations d'édition pour le tableau au niveau du curseur ; n'apparaît que lorsque le curseur se trouve dans un tableau.
- **Presse-papiers** — couper, copier, coller, tout sélectionner.

Les raccourcis par défaut pour gras (`Ctrl+B`) et italique (`Ctrl+I`) fonctionnent aussi sans le menu ; toutes les autres actions peuvent être associées à un raccourci dans les paramètres.

## Sémantique de sélection

Les formats de caractère suivent la sélection :

- Avec une sélection, l'action s'applique aux caractères sélectionnés.
- Sans sélection, elle prend le mot sous le curseur.
- Si le curseur n'est pas dans un mot, une paire de marqueurs vide est insérée et le curseur placé entre les deux.

Les espaces de début et de fin restent en dehors des marqueurs.

## Bascules et coches

Toutes les actions de format et de paragraphe sont des bascules : si le format est déjà appliqué, la même action le retire. Lors du changement de type de liste, le préfixe existant est remplacé plutôt qu'empilé. Le sous-menu Paragraphe indique par une coche l'état actif pour la ligne du curseur, par exemple un niveau de titre donné ou « aucun titre ».

## Plusieurs lignes

Si la sélection couvre plusieurs lignes, une action de paragraphe s'applique à toutes. Une liste numérotée est numérotée de façon continue.

## Sous-menu Tableau

Lorsque le curseur se trouve dans un tableau, le groupe **Tableau** apparaît en plus avec un sous-menu ; en dehors des tableaux, il est absent. Les opérations agissent sur le tableau au niveau du curseur et fonctionnent dans les deux types de tableaux, le tableau pipe et la [Perspective Table](perspective-table.md) :

- **Alignement** — aligner la colonne à gauche, au centre ou à droite ; une coche indique l'alignement actuel de la colonne du curseur.
- **Lignes** — déplacer vers le haut ou le bas, insérer en dessous, supprimer.
- **Colonnes** — déplacer vers la gauche ou la droite, insérer à droite, supprimer.
- **Transposer** — échanger lignes et colonnes ; la ligne d'en-tête devient la première colonne.

Chaque opération est une seule étape d'annulation. Les cibles impossibles apparaissent grisées : la ligne d'en-tête et la ligne de séparation d'un tableau pipe ne peuvent pas être déplacées ni supprimées, et la dernière colonne ne peut pas être supprimée. Lors de l'intervention, les tableaux pipe sont réécrits mis en forme (pipes extérieurs, colonnes alignées avec des espaces) ; cela vaut aussi pour les tableaux sans bordure. Dans les tableaux Perspective, les opérations sur les lignes travaillent sur les sections `|-` ; les opérations sur les colonnes et la transposition n'y sont possibles que sans `colspan`/`rowspan` et sont sinon refusées avec un message. Toutes les opérations figurent aussi dans la palette de commandes et peuvent être associées à des raccourcis ; l'extension « Outils de tableau » désactive le sous-menu et ses commandes.

## Protection dans les liens et le code

À l'intérieur d'une cible de lien wiki et d'un code en ligne, les actions de format restent volontairement sans effet, car les marqueurs y détruiraient la structure. « Effacer la mise en forme » nettoie en revanche encore à ces endroits.

## Éditeur en lecture seule

Si l'éditeur est en lecture seule, c'est-à-dire une vue sans mode édition, le menu n'affiche que copier et tout sélectionner ; les groupes lien, format, paragraphe et insertion sont omis.
