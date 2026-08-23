# Manuel

![EM4me](../assets/em4me-logo.svg)

_extended memory for me_

Bienvenue dans le manuel d'EM4me. Cette page d'aperçu est le point d'entrée ; chaque section s'ouvre dans son propre onglet et se comporte comme n'importe quel autre onglet — déplacez-le, placez-le dans la deuxième colonne ou gardez-le ouvert à côté de votre travail.

**Première visite ?** La visite guidée parcourt dix étapes dans le programme en cours d'exécution : elle montre ce qui distingue cette application et désigne à chaque fois l'élément d'interface concerné. Elle démarre d'elle-même au premier lancement ; ensuite, « Aide → Visite guidée » la relance, et elle peut être interrompue à tout moment. Le manuel répond aux questions précises qui viennent ensuite.

## Référence

- [Utilité et façons de travailler](benefits.md) — à quoi sert l'application : les façons de travailler, de l'onglet à l'étagère, et l'étendue du langage Markdown.
- [Fonctionnalités](functions.md) — toutes les fonctionnalités de l'application sous forme de tableau : ce qu'elles font et comment y accéder.
- [Raccourcis clavier](shortcuts.md) — les raccourcis actuellement actifs, y compris vos propres réaffectations.

## Écrire en Markdown

- [Bases de Markdown](markdown-basics.md) — le cœur Markdown : titres, emphase, listes, tableaux, liens, plus les spécificités CommonMark.
- [Menu contextuel de l'éditeur](context-menu.md) — mettre en forme par clic droit : structure du menu, sémantique de sélection, bascules avec coches, lecture seule et mode live.
- [Barre de format](toolbar.md) — mettre en forme par bouton : visibilité en mode édition, affichage de l'état, menu Titre, grille de tableau, affectation personnalisée.
- [Constructions de bloc](blocks.md) — callouts, conteneurs personnalisés, listes de définitions, blocs de lignes, notes de bas de page.
- [Constructions en ligne](inline.md) — surlignage, indice/exposant, soulignement, spoiler, Critic Markup, spans et abréviations.
- [Images](images.md) — syntaxe des images, tailles, figures implicites.
- [Pièces jointes](attachments.md) — coller et glisser des fichiers : emplacement et réglage, nommage, ouverture dans le programme par défaut.
- [Mathématiques et diagrammes](math-diagrams.md) — formules KaTeX, diagrammes Mermaid, blocs de code avec coloration syntaxique.
- [Emoji](emoji.md) — fonctionnement des shortcodes et sélection de codes.
- [Perspective Table](perspective-table.md) — tableaux avec cellules-bloc multilignes : syntaxe, exemples, tri, export.

## Tâches, rendez-vous et temps

- [Listes de tâches](tasks.md) — listes de tâches avec statuts standard et étendus.
- [Rappels](reminders.md) — moments de notification sur les tâches avec ⏰ : dialogue de notification et de rattrapage, liste des rappels ; l'annonce ne fonctionne que lorsque l'application est ouverte.
- [Événements](events.md) — rendez-vous, anniversaires et commémorations dans le document : bloc d'événements avec écarts de temps échelonnés, jalons, filtres et quatre vues, agrégation via le frontmatter, liens.
- [Systèmes de calendrier](custom-calendars.md) — chronologies librement définissables par zone : blocs avec calendriers parallèles, niveaux avec cinq types de relation, époques, conversion, syntaxe de valeur dans le document et sélecteur.

## Métadonnées, données et requêtes

- [Frontmatter et propriétés](frontmatter.md) — métadonnées YAML et barre Propriétés.
- [Profils de propriétés](property-profiles.md) — définitions de champs centralisées avec type, plage de valeurs et valeur par défaut : fichiers de profil, association et profil standard, héritage entre profils, effet dans les deux éditeurs de propriétés.
- [Propriétés de bloc](block-properties.md) — propriétés typées par ancre de bloc : panneau qui suit le curseur, données orphelines, renommage d'ancres, indicateur sur le bloc.
- [Requête Perspective](frontmatter-query.md) — listes et tableaux de fichiers dynamiques : langage à clauses, sources, champs de fichier, fonctions, tri, multi-colonnes, export.
- [Perspective Datatable](datatable.md) — table de données typée avec fonctions de calcul : types de colonnes, agrégats, colonnes calculées, édition en grille, tri et filtrage.
- [Blocs de script](scripts.md) — JavaScript dans le document : bac à sable isolé, modèle de confiance désactivé par défaut, API pq en lecture seule avec fonctions de données, de sortie et d'aide, exemples.

## Relier et organiser

- [Liens](linking.md) — liens wiki, ancres, incorporations, tags et autocomplétion.
- [Sous-pages](subpages.md) — hiérarchie de pages via les noms de fichiers : séparateur ∕ (U+2215), liens relatifs, fil d'Ariane et renommage en cascade.
- [Vue graphe](graph.md) — relations de liens sous forme de graphe interactif : graphe de l'espace en onglet, graphe du fichier en panneau avec profondeur et direction.
- [Signets](bookmarks.md) — mémoriser des fichiers en deux sections : signets généraux et de zone avec chemins relatifs, création, conversion, ordre.
- [Modèles](templates.md) — appliquer des modèles Markdown : dossier de modèles avec priorité de zone, espaces réservés avec dialogues, cible du curseur, règles de dossier.
- [Journaux](journals.md) — documents périodiques par zone : étagères et granularités, schémas de dossier et de nom, panneau calendrier, bloc de navigation, propriétés de date automatiques.
- [Livres](books.md) — plusieurs fichiers comme un livre à l'ordre de lecture déclaré : dossier du livre avec fichier compagnon, table des matières et entretien de la structure, lecture au-delà des limites de chapitre, déplacement avec mise à jour, réparation des chapitres manquants.
- [Applications, fenêtres et zones](apps-windows.md) — démarrage multiple, gestion des fenêtres et systématique des titres.
- [Historique du document](history.md) — enregistrer les modifications : fichier compagnon Markdown-Data, réglages sur trois niveaux, comparer et restaurer des révisions.
- [Notes du document](notes.md) — une note par document : panneau de barre latérale avec aperçu commutable, enregistrement automatique dans le fichier compagnon, distinction avec l'historique.

## Interface, outils et extensions

- [Vues et affichage](views-display.md) — vues par onglet et apparence de l'application : les cinq modes dont le mode direct, l'affichage de l'éditeur, thème et mode focus, zoom, largeur du contenu et polices, paramètres, langue et barre de menus.
- [Vue carte mentale](mindmap.md) — les titres et les listes d'un document sous forme de carte : position de la racine dans cinq directions, repli, zoom, notes sur le nœud, saut vers la source, valeur par document.
- [Barre latérale](sidebar.md) — organiser les panneaux : côté, ordre, groupes d'onglets, largeurs.
- [Jeux de couleurs](color-schemes.md) — couleurs via des emplacements nommés : affectation par mode, jeux personnels comme copies, aperçu en direct, limites.
- [Outils](tools.md) — linter Markdown, recherche avec regex, rechercher et remplacer, éditeur de tableaux.
- [Placement des commandes](command-placement.md) — les commandes comme accès personnalisés durables : boutons de barre d'état, liste de masquage, entrées de menu contextuel, macros.
- [Extensions](extensions.md) — activer ou désactiver les fonctions individuellement : catégories, dépendances, effet de l'état désactivé.
- [Créer des extensions](extensions-dev.md) — développer ses propres extensions externes : manifeste, API d'extension, exemple de référence, consignes de sécurité.

## Conseils d'utilisation

- Toutes les pages du manuel sont en lecture seule ; les vues (Rendu, Scindée, Source, Direct et Carte mentale) restent librement sélectionnables.
- La **vue scindée** montre la source Markdown et le rendu côte à côte — idéal pour comparer les exemples de syntaxe des pages thématiques avec leur résultat.
- La **table des matières** dans la barre latérale permet de naviguer dans une page ; la **recherche plein texte** (défaut `Ctrl+F`) la parcourt.
- Lors d'un changement de langue dans la barre d'état, les pages du manuel ouvertes changent immédiatement.
- Les nouveautés, la feuille de route et la version actuelle se trouvent sur le site du produit [em4me.ch](https://em4me.ch/fr/). Le lien s'ouvre dans le navigateur par défaut.
