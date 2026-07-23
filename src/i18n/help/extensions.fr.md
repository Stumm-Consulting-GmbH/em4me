# Extensions

De nombreuses fonctions de l'application sont des extensions intégrées et peuvent être activées ou désactivées individuellement. Le cœur — éditeur, onglets et fenêtres, gestion des fichiers, modes d'affichage, cadre de la barre latérale, réglages, manuel, thème, langues et le rendu de base CommonMark — n'est volontairement pas désactivable ; l'application reste ainsi toujours fonctionnelle.

## Activer et désactiver

La section Extensions des réglages (Fichier → Paramètres → Extensions) liste toutes les extensions intégrées en trois catégories :

- **Rendu** — constructions Markdown comme les callouts, les notes de bas de page, le surlignage, la typographie, les tableaux Perspective, les formules KaTeX, les diagrammes Mermaid ou la coloration syntaxique.
- **Connexions** — liens wiki, intégrations wiki, tags et autocomplétion.
- **Outils** — linter Markdown, marque-pages, mode focus avec défilement machine à écrire, statistiques de mots et bouton de copie de code.

Chaque ligne affiche un nom et une courte description. Les modifications prennent effet avec Appliquer ou OK — immédiatement, sans redémarrage et dans toutes les fenêtres.

## Effet de l'état désactivé

- **Extensions de rendu :** la syntaxe s'affiche en texte brut ou en Markdown standard. `==surligné==` reste par exemple du texte visible, et un bloc Mermaid devient un bloc de code ordinaire.
- **Panneaux et accès :** les panneaux latéraux, boutons de la barre d'état, entrées de menu et raccourcis associés disparaissent ; aucun élément mort ne subsiste.
- **Sections de réglages :** si une extension apporte sa propre section de réglages (par exemple les états de tâches), celle-ci n'apparaît dans la navigation que lorsque l'extension est active.

## Dépendances

Certaines extensions s'appuient sur d'autres : les intégrations wiki ont besoin des liens wiki. Si la base est désactivée, les extensions dépendantes se désactivent avec elle ; la section affiche alors l'indication « Désactivé par dépendance ». L'extension dépendante conserve son propre état et redevient effective dès que la base est réactivée.

## Les données sont conservées

Désactiver ne supprime rien : l'arborescence des marque-pages, les définitions d'états de tâches, la visibilité des panneaux, les raccourcis personnalisés et tous les autres réglages restent enregistrés et reviennent à l'activation.

## Extensions externes

Outre les extensions internes, l'application charge aussi des paquets d'extension externes créés par vous-même. Ils se gèrent dans la section de paramètres Extensions (externes) : les paquets nouvellement détectés sont désactivés, l'activation exige une confirmation explicite dans la boîte d'avertissement (le code tiers obtient un accès complet aux documents et à l'application), et les paquets défectueux sont désactivés automatiquement. La création d'un paquet est décrite sur la page [Créer des extensions](extensions-dev.md).
