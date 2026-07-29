# Outils

Neuf assistants pour le travail quotidien sur le texte : linter, recherche, rechercher et remplacer, éditeur de tableaux, export PDF, palette de commandes, saisie de date et d'heure, horloge avec réveils, minuteur, chronomètre et calendrier mensuel, ligne de titre. Les accès et raccourcis par défaut figurent dans le [tableau des fonctionnalités](functions.md).

## Linter Markdown

Le linter marque discrètement sept défauts typiques dans l'éditeur (vues Source, Scindée et Direct) ; survoler une marque affiche l'explication. Les exemples sont en blocs de code pour que cette page reste elle-même sans marque.

| Règle | Infraction | Correction |
|---|---|---|
| URL nue | `Voir https://example.org à ce sujet.` | `Voir [l'exemple](https://example.org) à ce sujet.` |
| Texte de lien vide | `[](https://example.org)` | `[Exemple](https://example.org)` |
| Texte alternatif manquant | `![](image.png)` | `![Croquis d'architecture](image.png)` |
| Lien wiki sans cible | `[[Nom-erroné]]` | `[[Plan projet]]` (fichier existant) |
| Ancre wiki cassée | `[[Plan projet#Absent]]` | `[[Plan projet#Jalons]]` (ancre existante) |
| Type de callout inconnu | `> [!important] Titre` | `> [!warning] Titre` (type de la liste blanche) |
| Marqueur de commentaire non apparié | `Texte %% sans fermeture` | `Texte %%privé%% suite` ou `\%%` pour un `%%` littéral |

## Recherche plein texte

La recherche (défaut `Ctrl+F`) trouve en direct pendant la saisie ; la zone de recherche suit la vue (texte source ou aperçu). Deux bascules la complètent : `.*` pour les expressions régulières, `Aa` pour la casse. `F3` et `Maj+F3` sautent entre les résultats, dans la barre de recherche aussi `Entrée` / `Maj+Entrée`.

Le point d'interrogation de la barre de recherche ouvre un aide-mémoire regex ; les motifs les plus importants :

| Motif | Signification |
|---|---|
| `.` | caractère quelconque |
| `*` / `+` / `?` | 0+, 1+ ou 0–1 répétitions |
| `^` / `$` | début / fin de ligne |
| `\d` / `\w` / `\s` | chiffre / caractère de mot / espace |
| `[abc]` / `[^abc]` | un / aucun des caractères |
| `a\|b` | a ou b |

## Rechercher et remplacer

En mode édition (défaut `Ctrl+H`) une ligne de remplacement s'ajoute. Avec la bascule regex active, les références arrière fonctionnent dans le texte de remplacement : `$1`, `$2` pour les groupes capturés. « Tout remplacer » est une transaction unique, un seul `Ctrl+Z` annule tout ensemble.

```text
Rechercher : (\d{2})\.(\d{2})\.(\d{4})
Remplacer :  $3-$2-$1
Effet :      12.06.2026 → 2026-06-12
```

## Où la recherche porte

La portée suit l’onglet dans lequel la recherche est ouverte ; les portées s’excluent mutuellement :

| Onglet actif | La recherche couvre |
|---|---|
| Fichier isolé | ce fichier, en source ou en aperçu |
| Fichier d’une zone ouverte | **tous** les fichiers Markdown de la zone |
| Page du manuel | **toutes** les pages du manuel, même non ouvertes |
| Paramètres | **toutes** les sections des paramètres, même jamais visitées |

La portée en vigueur s’affiche à gauche dans la barre de recherche.

Au-delà du fichier isolé, les occurrences apparaissent dans le panneau **Résultats de recherche**, groupées par fichier, page ou section, avec un décompte par groupe. Un clic ouvre la cible et met l’endroit en évidence ; `F3` franchit la limite du groupe.

### Dans une zone

Le **fichier ouvert vient en premier**, et avec son état non enregistré : ce qui se trouve dans l’éditeur est trouvé, même avant l’enregistrement. Ses occurrences restent mises en évidence dans le texte comme d’habitude, la liste s’y ajoute. Pour les autres fichiers, c’est l’état enregistré sur le disque qui compte.

La recherche porte sur les fichiers Markdown de la zone. Les autres fichiers et les fichiers d’accompagnement de l’application restent à l’écart.

**Le remplacement** reste lié au fichier isolé : ouvrir la ligne de remplacement ramène la recherche au document courant.

Dans une zone très vaste, la ligne d’état du panneau signale que chaque recherche relit les fichiers ; la recherche répond alors plus lentement.

### Dans le manuel et les paramètres

Changer de section dans les paramètres n’enregistre rien, un brouillon commencé est conservé. Le remplacement y est désactivé, les deux étant en lecture seule. Avec la source Markdown d’une page du manuel sous les yeux, c’est-à-dire la vue source, la recherche revient à cette seule page.

**Différence avec la palette de commandes :** la palette trouve des **commandes** par leur nom et les exécute. Cette recherche trouve du **texte**. Qui sait ce qu’il veut faire prend la palette ; qui veut savoir où se trouve une chose ou comment elle s’appelle prend la recherche.

**Différence avec la requête Perspective :** elle filtre les fichiers selon leurs propriétés et les liste dans le document. La recherche trouve du texte courant, indépendamment de toute propriété.
## Éditeur de tableaux

Dans les tableaux pipe, `Tab` saute à la cellule suivante et `Maj+Tab` à la précédente. À la fin de la dernière ligne, `Tab` ou `Entrée` créent une nouvelle ligne de tableau avec le même nombre de colonnes ; deux `Entrée` sur une ligne vide quittent le tableau. Les tableaux sans bordure (sans pipes extérieurs) sont aussi reconnus. Les opérations de structure (déplacer, insérer et supprimer des lignes et des colonnes, alignement, transposition) sont proposées par le sous-menu **Tableau** dans le [Menu contextuel de l'éditeur](context-menu.md).
## Export PDF

« Fichier → Exporter en PDF… » (défaut `Ctrl+Maj+P`) imprime le contenu de l'onglet actif dans un fichier PDF. L'export suit la vue active : la vue source imprime le Markdown brut avec coloration syntaxique, numéros de ligne compris s'ils sont activés dans l'onglet ; les modes rendu, partagé et direct impriment le document mis en forme (partagé et direct basculent en interne vers la vue rendue pour l'impression, puis restaurent la vue). Le PDF est toujours clair, même si l'application utilise le thème sombre ; les diagrammes Mermaid sont redessinés en couleurs claires et restent vectoriels. Formules, coloration du code, encadrés et tableaux perspective apparaissent comme dans l'aperçu.

Le format de page, l'orientation et les marges se règlent dans la section « Export » des paramètres (Fichier → Paramètres…) ; par défaut : A4 en portrait avec des marges normales. Lors du passage d'une page à l'autre, blocs de code, tableaux, diagrammes, formules et encadrés restent ensemble dans la mesure du possible ; les titres ne restent pas seuls en bas de page.

## Palette de commandes

« Affichage → Palette de commandes » (défaut `Ctrl+K`) ouvre une fenêtre contextuelle filtrable de toutes les commandes de l'application. La saisie filtre la liste par sous-chaîne sur les noms de commande ; les flèches déplacent la sélection, `Entrée` ou un clic exécute la commande et ferme la fenêtre, `Échap` annule. À droite de chaque commande figure le raccourci clavier actuellement actif, y compris vos propres réaffectations de la section de paramètres « Raccourcis clavier ». Les commandes non disponibles dans le contexte actuel (par exemple les commandes d'espace sans espace ouvert) apparaissent estompées et ne peuvent pas être exécutées.

La palette est l'accès clavier éphémère au registre des commandes ; pour des accès personnalisés durables — boutons de barre d'état, entrées de menu contextuel et macros — voir la page [Placement des commandes](command-placement.md).

## Saisie de date et d'heure

Une fenêtre de calendrier insère une date et une heure à la position du curseur, y compris dans le champ de note. Trois commandes l'ouvrent : défaut `Ctrl+Alt+T` pour la date et l'heure, défaut `Ctrl+Alt+D` pour la date seule, défaut `Ctrl+Alt+U` pour l'heure seule. Les formats insérés sont `2026-07-10`, `14:30` ou combiné `2026-07-10 14:30`.

### Utiliser la fenêtre

À gauche se trouve un calendrier mensuel avec une colonne de semaines et le lundi comme début de semaine ; les flèches feuillettent les mois, `Aujourd'hui` saute au jour courant. À droite, l'heure se présente comme quatre chiffres réglables séparément (dizaines et unités des heures, dizaines et unités des minutes) avec deux-points entre les deux ; `Maintenant` règle l'heure actuelle. La date et l'heure s'activent séparément, au moins une partie restant active.

Le clavier pilote le calendrier : les flèches déplacent d'un jour (gauche, droite) ou d'une semaine (haut, bas), `Page préc.` et `Page suiv.` d'un mois, `Entrée` valide, `Échap` annule. Un clic hors de la fenêtre annule aussi.

Pour l'heure, un clic sélectionne l'un des quatre chiffres : les boutons fléchés ▲/▼ et les flèches Haut/Bas règlent le chiffre actif avec bouclage, Gauche/Droite changent de chiffre, et les touches numériques le fixent directement et passent au suivant. Les heures invalides ne peuvent ainsi tout simplement pas être saisies.

### Déclencheur de saisie

Deux points-virgules `;;` dans l'éditeur ouvrent le sélecteur combiné à cet endroit. La validation remplace les deux caractères par la valeur choisie, `Échap` les laisse en place. Dans le code, les formules et le frontmatter, la séquence ne déclenche rien ; dans les cellules d'un tableau Perspective, elle fonctionne, car la séquence y est du contenu et non du code.

### Valeurs cliquables dans l'éditeur

Dans l'éditeur, en vue source comme en mode Direct, l'application reconnaît les valeurs dans les trois formats et les souligne d'un discret pointillé. Un clic ouvre le sélecteur pré-rempli avec la valeur, les bascules suivant sa forme ; la validation la remplace sur place. Ne sont pas cliquables les valeurs

- dans le code, les formules et le frontmatter,
- sur la ligne où se trouve actuellement le curseur,
- dans les cibles de lien wiki,
- derrière les marqueurs de date des [listes de tâches](tasks.md), qui y apparaissent comme badge.

La ligne portant le curseur reste volontairement sans décoration : l'édition normale du texte s'y déroule, et la valeur redevient cliquable dès que le curseur quitte la ligne. Les vues en lecture seule n'ont pas de valeurs cliquables.

La reconnaissance capte volontairement aussi les valeurs saisies à la main : toute date et toute heure dans ces formats devient ainsi modifiable.

### Extension

Cette fonctionnalité appartient à l'extension commutable « Saisie de date et d'heure » (Paramètres → Extensions). Une fois désactivée, les commandes, le déclencheur de saisie et la décoration au clic disparaissent ; les valeurs restent du texte normal. Les formats correspondent aux marqueurs de date des listes de tâches, si bien que les deux fonctionnalités partagent la même notation.

## Horloge, réveils, minuteur, chronomètre et calendrier

Un panneau latéral affiche l'heure sous forme d'horloge analogique, d'affichage numérique et avec une ligne de date ; taille, type de cadran, trotteuse, format horaire et de date ainsi que la semaine calendaire se choisissent dans les réglages. Une barre en haut du panneau bascule entre cinq vues : horloge, réveil, minuteur, chronomètre et calendrier. Le choix vaut par colonne de la barre latérale et survit à un redémarrage.

### Taille

Trois paliers dimensionnent cadran et texte ensemble, afin que le panneau forme une seule image. Le réglage se trouve dans le bloc « Affichage » des réglages et s'applique aussi lorsque le cadran est désactivé et que seul l'affichage numérique fonctionne. Heure, ligne de date et semaine calendaire grandissent ensemble et gardent leurs proportions.

Le petit palier est prévu pour les colonnes étroites, le grand pour une colonne élargie. Si une ligne ne tient pas dans la colonne, elle n'est pas coupée en deux lignes mais rognée à gauche et à droite ; le milieu reste lisible. Pour la voir entièrement, élargir la colonne ou choisir un palier plus petit.

### Réveils

Le mode réveil accueille autant de réveils que voulu. À la création, on choisit l'heure, un nom et le motif de répétition : une fois, tous les jours ou certains jours de la semaine. L'heure passe par une commande à chiffres, une saisie invalide est donc impossible. Chaque réveil s'active séparément sans être supprimé ; un réveil unique se désactive après avoir sonné.

Un réveil échu affiche un avis que l'on confirme ou reporte d'une durée réglable (Réglages → Horloge). Si la fenêtre n'est pas au premier plan, une notification système s'y ajoute ; un clic ramène la fenêtre au premier plan.

### Minuteur et chronomètre

Le mode minuteur liste les minuteurs avec temps restant et barre de progression. Trois boutons lancent des durées courantes aussitôt, les durées libres passent par une commande heures, minutes et secondes. Démarrage, pause et remise à zéro agissent par minuteur. Le temps restant se calcule à partir d'horodatages plutôt que par décompte : un minuteur continue donc correctement même si la fenêtre était en arrière-plan ou si l'application a été fermée entre-temps. Un minuteur écoulé affiche un avis et se confirme ou se relance.

Le chronomètre compte à l'endroit, avec centièmes. Outre démarrage, pause et remise à zéro, il enregistre des temps de tour ; le tour le plus récent est en haut.

### Calendrier mensuel

Le mode calendrier affiche un mois sous forme de grille : les jours de la semaine en en-tête, lundi en premier, le jour courant mis en évidence, les jours des mois voisins atténués. La colonne des semaines à gauche se désactive et se réactive dans les réglages, sous « Calendrier ».

La navigation se trouve au-dessus du tableau. Les flèches simples feuillettent un mois, les doubles une année ; « Aujourd'hui » ramène au mois courant. Un clic sur le libellé du mois ouvre la saisie de l'année : quatre positions de chiffres qui se règlent avec les touches fléchées, se changent avec gauche et droite et se fixent directement en tapant un chiffre. Une année invalide ne peut pas être saisie, et la touche Entrée ou la coche l'applique.

Les jours sont en simple affichage. Le calendrier sert à la consultation, par exemple pour savoir sur quel jour de la semaine tombe une date lointaine ; il ne mène ni aux journaux ni aux rendez-vous. Le panneau Calendrier des journaux est là pour cela.

### Limite

Les réveils et les minuteurs ne se déclenchent que si l'application tourne. Application fermée, il n'y a pas d'avis, et une heure de réveil passée entre-temps n'est pas rattrapée au démarrage suivant. Un minuteur en cours, lui, continue correctement et se déclenche dès que le temps restant est écoulé.

### Extension

L'horloge relève de l'extension activable « Horloge » (Réglages → Extensions). Désactivée, le panneau, le bouton de la barre d'état, l'entrée de menu et la zone de réglages disparaissent ; aucun réveil ni minuteur n'est alors surveillé.

## Ligne de titre

Au-dessus du document, le nom de fichier sans extension apparaît comme une ligne de titre compacte, façon en-tête — sans numéro de ligne, fixe au défilement et dans les quatre vues (dans la vue scindée une seule fois, au-dessus de la colonne du texte source). Les sous-pages affichent leur nom logique complet en notation avec barres obliques, la partie parente apparaissant atténuée ; les documents sans nom affichent l'espace réservé « Sans titre ». Les pages du manuel et système n'ont pas de ligne de titre.

### Renommer directement

Un clic sur le titre (ou `Entrée` ou `F2` sur la ligne ayant le focus) le rend modifiable ; `Entrée` ou un clic à l'extérieur valide, `Échap` annule, un texte inchangé se termine en silence. La validation renomme le fichier via le mécanisme de renommage normal : les liens vers le fichier sont mis à jour selon le paramètre « Mettre à jour les liens dans les autres fichiers », le fichier compagnon suit, une page avec des sous-pages emporte tout son arbre de sous-pages. Les modifications non enregistrées sont enregistrées au préalable. Sur une **sous-page**, seul son propre segment de nom est modifiable ; la partie parente le précède sans être modifiable, et une barre oblique y est refusée. Sur une page sans page parente, une barre oblique en fait au contraire une sous-page. La boîte de dialogue de renommage (Fichier → Renommer…) reste disponible comme voie avec aperçu et rapport de résultat, et c'est aussi là que le nom complet d'une sous-page peut être modifié.

Les noms invalides (vides, caractères non autorisés) et les collisions de noms sont signalés par une indication directement sous le titre ; le fichier reste alors inchangé. Pour les documents sans nom, valider un nom déclenche « Enregistrer sous » avec ce nom prérempli.

### Extension

La ligne de titre appartient à l'extension commutable « Ligne de titre » (Paramètres → Extensions). Une fois désactivée, la ligne disparaît entièrement ; le nom de fichier reste visible via le titre de l'onglet et le titre de la fenêtre, et le renommage reste accessible par la boîte de dialogue.
