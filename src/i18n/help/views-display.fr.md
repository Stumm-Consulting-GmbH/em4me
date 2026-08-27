# Vues et affichage

L'apparence d'un document se décide à deux niveaux. La **vue** appartient à l'onglet : elle détermine si le document est montré rendu, en source, scindé ou en direct. L'**apparence** vaut pour toute l'application : thème, zoom, largeur du contenu et polices. Cette page réunit les deux niveaux et nomme l'emplacement de chaque réglage.

## Les cinq vues

Chaque onglet se trouve dans exactement une des cinq vues. Le mode choisi vaut par onglet et non globalement : un document peut rester ouvert en rendu pendant qu'un deuxième est édité en source à côté.

| Vue         | Ce qu'elle montre                                     | Raccourci par défaut |
| ----------- | ----------------------------------------------------- | -------------------- |
| **Rendu**   | uniquement le résultat mis en forme                   | `Ctrl+1`             |
| **Scindée** | la source et le résultat côte à côte                  | `Ctrl+2`             |
| **Source**  | uniquement la source Markdown                         | `Ctrl+3`             |
| **Direct**  | la source, mise en forme là où l'on écrit             | `Ctrl+4`             |
| **Carte mentale** | la structure du document sous forme de carte    | `Ctrl+5`             |

Le changement se fait par les boutons de la barre d'état ou par le haut du menu Affichage ; la carte mentale se trouve dans le menu et sur son raccourci, pas dans la barre d'état. La vue qu'obtient un onglet nouvellement ouvert se règle dans la section « Comportement » des paramètres.

### Mode direct

Le mode direct rend le Markdown directement dans l'éditeur : gras et italique, liens, tableaux, code, images, formules KaTeX et diagrammes Mermaid apparaissent tels qu'ils sont dans le résultat rendu. Lorsque le curseur se trouve dans une ligne, cette ligne précise montre sa source brute et reste modifiable. Le va-et-vient entre écrire et vérifier disparaît ainsi.

### Carte mentale

La carte mentale montre les titres et les listes du document sous forme d'arbre, et le texte courant comme note sur le nœud. Elle appartient à l'extension du même nom et disparaît avec elle ; structure, manipulation, les cinq positions de la racine et la valeur par document sont décrites sur la page [Vue carte mentale](mindmap.md).

### Modifier

Le mode modification active l'éditeur et agit dans la vue source, la vue scindée et la vue directe (défaut `Ctrl+E`, crayon dans la barre d'état, Affichage → Modifier). Un clic sur le crayon dans la vue de lecture pure bascule d'elle-même en vue scindée et y active l'éditeur. Les moyens de mise en forme du mode modification sont décrits par les pages [Menu contextuel de l'éditeur](context-menu.md) et [Barre de format](toolbar.md).

## Affichage de l'éditeur

Le sous-menu Affichage → Affichage de l'éditeur regroupe les cinq interrupteurs qui concernent l'éditeur lui-même. Les mêmes interrupteurs se trouvent sous forme d'icônes dans la barre d'état.

- **Pliage** affiche la gouttière de pliage au bord gauche : titres, listes et blocs s'y replient, et la hiérarchie reste visible comme trace.
- **Numéros de ligne** affiche la colonne des numéros.
- **Retour à la ligne** coupe les longues lignes au bord de la fenêtre au lieu de défiler horizontalement.
- **Synchronisation du défilement** couple les deux moitiés de la vue scindée : en faisant défiler la source, le résultat suit par le contenu, et inversement. L'interrupteur vaut par onglet.
- **Défilement machine à écrire** garde la ligne du curseur centrée verticalement dès que le curseur bouge. Il n'agit qu'en mode modification.

Les trois premiers interrupteurs sont **liés au document** : leur valeur passe dans le frontmatter du fichier (`fold-gutter`, `line-numbers`, `word-wrap`) et voyage avec lui. La bascule y écrit la nouvelle valeur et marque le fichier comme modifié ; un document sans indication propre suit le réglage par défaut sous Fichier → Paramètres… → Apparence. L'ordre de résolution est décrit sur la page [Frontmatter et propriétés](frontmatter.md).

## Apparence

### Clair, sombre et système

L'application tourne dans un thème clair ou sombre ; la valeur par défaut suit le thème du système d'exploitation. Le changement passe par l'icône de thème de la barre d'état ou par Affichage → Apparence → Clair/Sombre/Système. Les couleurs qu'utilise un thème se déterminent librement par les jeux de couleurs, voir [Jeux de couleurs](color-schemes.md).

Sous Linux, la valeur par défaut du système dépend de l'environnement de bureau : s'il ne signale aucune préférence clair/sombre, le thème clair reste en place. Le changement manuel y fonctionne sans restriction.

### Mode focus

Le mode focus masque la barre d'onglets, la barre d'état et la barre latérale et ne laisse que le document (Affichage → Apparence → Mode focus, défaut `Ctrl+Maj+F`). La barre de menus reste accessible par `Alt`. `Esc` quitte le mode, sauf si un dialogue ou un menu est justement ouvert. Un état réduit de la barre latérale n'en est pas affecté et reste valable après la sortie.

### Ligne active

La ligne du curseur reçoit un fond discret en mode modification, aussi bien en vue source qu'en vue directe et jusque dans la colonne des numéros de ligne. En vue de lecture pure, elle reste sans marque, parce qu'il n'y a pas de curseur. La teinte est semi-transparente et se pose donc sur n'importe quel jeu de couleurs ; sélection, résultats de recherche et marques du linter restent visibles par-dessus. Interrupteur : Fichier → Paramètres… → Apparence.

### Zoom

Le contenu de chaque onglet s'agrandit et se réduit indépendamment par pas de dix pour cent (défaut `Ctrl + +`, `Ctrl + −`, `Ctrl + 0`, ainsi que `Ctrl` avec la molette). Si le facteur s'écarte de cent pour cent, la barre d'état l'affiche ; un clic dessus réinitialise. Le zoom est volatile et ne survit pas à la fermeture de la fenêtre.

### Largeur du contenu

La largeur du contenu détermine en pourcentage la place qu'occupe l'affichage rendu (20 à 100, valeur par défaut 80). Les valeurs plus étroites restent centrées. Elle vaut pour la vue rendue et la vue scindée ; l'export PDF utilise indépendamment toute la largeur d'impression. Réglage : Fichier → Paramètres… → Apparence.

### Police et taille

La police et la taille se choisissent séparément pour la surface d'édition et pour la vue rendue ; la taille se situe entre 8 et 32. Les valeurs valent pour tous les documents et prennent effet immédiatement dans toutes les fenêtres ouvertes. Réglage : Fichier → Paramètres… → Apparence.

## État de la fenêtre

La position, la taille et l'état agrandi d'une fenêtre sont mémorisés à la fermeture et restaurés au démarrage suivant. Rien n'est à régler pour cela. Ce qui ramène en plus une session entière avec ses onglets est décrit sur la page [Applications, fenêtres et zones](apps-windows.md).

## Statistiques de mots

La barre d'état affiche les mots, les caractères et le temps de lecture estimé du fichier actif. Si quelque chose est sélectionné dans l'éditeur, l'affichage bascule sur la sélection. Un clic ouvre un dialogue détaillé avec les paragraphes, les phrases et le nombre de titres par niveau. Le frontmatter, les blocs de code et les formules KaTeX ne sont pas comptés.

## Paramètres

Les paramètres s'ouvrent dans un onglet propre (Fichier → Paramètres…, défaut `Ctrl+,`). Leur navigation se divise en quatre blocs :

- **Général** — tout ce qui vaut pour l'application entière, par exemple apparence, comportement, raccourcis clavier et export.
- **Zone actuelle** — les réglages de la zone ouverte. Le bloc n'apparaît que tant qu'une zone est ouverte.
- **Extensions (internes)** — l'activation et la désactivation des extensions fournies, avec leurs propres sections.
- **Extensions (externes)** — la gestion des paquets d'extension installés soi-même.

Les modifications agissent d'abord comme brouillon avec aperçu en direct de l'apparence. Appliquer et OK enregistrent ; les deux ne sont mis en évidence qu'en présence de modifications non enregistrées, sans modification Appliquer est estompé. Annuler ou la fermeture de l'onglet rejette le brouillon. Les valeurs enregistrées valent immédiatement dans toutes les fenêtres ouvertes. Davantage sur les deux blocs d'extensions se trouve sur la page [Extensions](extensions.md).

## Langue

L'interface existe en allemand, anglais, français, espagnol et italien. Le changement passe par le sélecteur de langue de la barre d'état ; les pages du manuel ouvertes changent immédiatement avec lui.

## Barre de menus

La barre de menus porte les trois menus Fichier, Affichage et Aide. `Alt` active la commande au clavier, et les lettres soulignées mènent directement au menu correspondant, par exemple `Alt+F` pour Fichier. Les raccourcis actuellement actifs de toutes les commandes sont listés sur la page [Raccourcis clavier](shortcuts.md).

Tout à la fin du menu Affichage se trouvent les outils de développement. Ils sont volontairement fixés sur `F12` et ne sont pas réaffectables : ce sont des outils de diagnostic et non une partie du travail quotidien.
