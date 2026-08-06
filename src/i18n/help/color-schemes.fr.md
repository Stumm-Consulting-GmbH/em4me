# Jeux de couleurs

Un jeu de couleurs définit les couleurs de l'application : l'interface (arrière-plans, texte, accent, barres, onglets) et le contenu rendu (titres, liens, citations, code, tableaux). Les couleurs passent par une liste choisie d'emplacements de couleur nommés qui alimentent les couleurs du thème. Un jeu est actif par mode ; le commutateur clair/sombre (icône de la barre d'état, Affichage → Apparence → Clair/Sombre/Système) bascule entre le jeu clair et le jeu sombre.

## Emplacements et groupes

Un emplacement est une couleur nommée, pas un accès direct aux détails internes. Les emplacements sont organisés en cinq groupes : Surfaces (Arrière-plan, Surface, Surface atténuée, Barre d'outils), Texte (Texte principal, Texte atténué), Accent et bordures (Accent, Texte sur accent, Bordure, Bordure marquée), Onglets (Barre d'onglets, Onglet actif) et Contenu (Fond de code, Couleur d'avertissement). Le contenu rendu suit les emplacements de surface : les liens portent l'accent, les titres le texte principal, le trait des titres et les bordures de tableau la bordure, la barre de citation la bordure marquée.

## Gérer les jeux

La gestion des jeux s'ouvre dans Paramètres → Jeux de couleurs.

- **Attribution par mode :** en haut, on choisit un jeu actif pour chaque mode (Jeu pour le mode clair, Jeu pour le mode sombre).
- **Jeux fournis** sont non modifiables et servent de modèle : Standard clair et sombre, Contraste élevé clair et sombre, Sépia, ainsi que quatre autres paires comportant chacune une version claire et une version sombre — Bleu acier (froid), Vert forêt (vert atténué), Ambre (chaud) et Graphite (gris neutre).
- **Jeu personnel :** « Nouveau depuis un modèle » ou « Dupliquer » crée une copie modifiable. Un jeu personnel peut être renommé et supprimé ; à la suppression du jeu actif, le mode revient au jeu prédéfini.
- **Éditeur d'emplacements :** un sélecteur de couleur par emplacement ; « Réinitialiser » rétablit la valeur du modèle. Les modifications prennent effet immédiatement dans toute l'application (aperçu en direct), et dans les autres fenêtres après application.

L'éditeur modifie toujours le jeu actif du mode dans lequel l'application s'exécute : en mode clair le jeu clair, en mode sombre le jeu sombre. Pour ajuster le jeu de l'autre mode, on bascule d'abord l'application vers ce mode via l'icône de thème dans la barre d'état (ou Affichage → Apparence → Clair/Sombre/Système). Ainsi, chaque changement de couleur prend effet immédiatement dans le mode exact auquel il s'applique (aperçu en direct).

## Contraste et limites

La lisibilité de vos jeux personnels est entre vos mains : il n'y a pas de vérification automatique du contraste. L'aperçu en direct montre l'effet immédiatement, et « Réinitialiser » par emplacement ramène à une valeur du modèle. Quelques couleurs restent volontairement hors des emplacements : les couleurs des groupes d'onglets et la coloration syntaxique des blocs de code suivent toujours le thème. L'export PDF reste clair et reprend les couleurs du jeu clair actif.
