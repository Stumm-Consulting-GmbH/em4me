# Sous-pages

Les pages peuvent avoir des sous-pages à n'importe quelle profondeur, par exemple `Processus-A/Brouillon` ou `Processus-A/Realisation/Detail`. La hiérarchie est une structure logique, indépendante des dossiers dans lesquels se trouvent les fichiers. Cela permet aussi des sous-pages du même nom sous des pages différentes, par exemple un `Brouillon` pour `Processus-A` et un autre pour `Processus-B`.

## Convention de nommage

Le nom du fichier porte la hiérarchie : le **séparateur de sous-pages est `∕` (Unicode U+2215, « barre de division »)**. Il ressemble à une barre oblique sans en être une : la vraie barre oblique sert de séparateur de chemin sur tous les systèmes et est donc exclue des noms de fichiers, alors que ce caractère y est autorisé et n'apparaît pratiquement jamais dans des noms ordinaires — c'est précisément ce qui rend sans ambiguïté le fait qu'un fichier est une sous-page.

```text
Processus-A.md                       page
Processus-A∕Brouillon.md             sous-page de Processus-A
Processus-A∕Realisation∕Detail.md    deuxième niveau
```

Le caractère ne doit jamais être saisi : les nouvelles sous-pages se créent via **Fichier → Autres fonctions de fichier → Nouvelle sous-page…** (une boîte de dialogue demande le nom ; le fichier est créé dans le dossier du fichier actif et s'ouvre comme onglet). Pour créer un fichier manuellement dans l'explorateur, copiez le caractère depuis cette page : `∕`

## Liens vers des sous-pages

Dans les liens wiki, on écrit toujours la barre oblique normale ; l'application la traduit dans le nom de fichier. Les cibles relatives pointent vers la propre sous-page ou la page parente et fonctionnent donc indépendamment du nom de la page actuelle :

```markdown
[[Processus-A/Brouillon]]     ouvre la sous-page Brouillon de Processus-A
[[/Brouillon]]                sous-page Brouillon de la page ACTUELLE
[[..]]                        page parente de la sous-page actuelle
![[Processus-A/Brouillon]]    incorpore la sous-page
```

La résolution cherche d'abord un chemin de dossier réel (`[[sousdossier/Fichier]]` reste un lien de chemin), puis le fichier de sous-page — dans le dossier du fichier et dans toute la portée de recherche. Si les deux existent, le [linter Markdown](tools.md) marque la cible comme ambiguë. Après `[[`, l'autocomplétion propose les sous-pages en notation barre oblique ; après `[[/`, les sous-pages de la page actuelle.

## Navigation

Quand une sous-page est active, un **fil d'Ariane** au-dessus du document (vues lecture, partagée et live) montre la chaîne parente avec des niveaux cliquables ; les niveaux intermédiaires inexistants sont soulignés en pointillés et non cliquables. La section latérale **Sous-pages** (Affichage → Barre latérale → Panneaux → Sous-pages, ou l'icône de sous-pages dans la barre d'état) liste les sous-pages directes du fichier actif ; un clic les ouvre.

## Renommer

**Fichier → Autres fonctions de fichier → Renommer…** (aussi dans le menu contextuel de l'onglet) renomme le fichier actif. Les onglets ouverts, les signets, la liste des fichiers récents et le [fichier compagnon d'historique](history.md) suivent.

- Renommer une page **avec des sous-pages** emporte tout son arbre de sous-pages ; la boîte de dialogue en indique le nombre au préalable.
- Renommer une **sous-page** ne change que son propre segment de nom ; la chaîne parente est conservée. Cela vaut aux deux endroits, y compris dans la [ligne de titre](tools.md) au-dessus du document : la partie parente y précède le segment modifiable, atténuée et non modifiable.
- **Modifier le nom complet :** L'option du même nom dans la boîte de dialogue de renommage libère aussi les parties parentes du nom d'une sous-page. Elle est délibérément désactivée par défaut, car une modification à cet endroit place la page sous une autre page parente et agit sur toutes ses propres sous-pages.
- **Mettre à jour les liens :** La case « Mettre à jour les liens dans les autres fichiers » récrit les liens wiki, incorporations et liens Markdown relatifs entrants vers le nouveau nom ; dans la cascade, aussi les références vers chaque sous-page renommée. Une seconde case affiche au préalable un **aperçu** des fichiers concernés ; après l'exécution, un **rapport** récapitule les fichiers renommés, mis à jour et non modifiables. Les valeurs par défaut se trouvent sous Paramètres → Comportement → « Liens lors du renommage ».
- Les documents ouverts suivent ; un document avec des **modifications non enregistrées** reçoit la mise à jour dans l'éditeur comme une étape d'annulation propre, tandis que sur le disque seul le dernier état enregistré est mis à jour.
- Avec l'[historique du document](history.md) activé, chaque mise à jour est traçable comme révision et peut être annulée ; sans historique, aucun retour en arrière.
- Dans une application de zone, la mise à jour couvre toute la zone ; sans zone, l'espace de recherche connu, et le linter reste le filet pour le reste.

## Détacher

**Fichier → Autres fonctions de fichier → Détacher de la page parente…** (aussi dans le menu contextuel de l'onglet d'une sous-page) fait d'une sous-page une page autonome : `Prozess-A/Entwurf` devient `Entwurf`.

- La boîte de dialogue indique au préalable la cible et le nombre de **sous-pages propres** qui suivent. `Prozess-A/Entwurf/Tief` devient `Entwurf/Tief` : la hiérarchie en dessous est donc conservée.
- **Les liens restent valides :** la mise à jour des liens entrants emprunte le même chemin que le renommage, avec les mêmes cases pour l'aperçu et le rapport.
- Le **nom cible est modifiable dans la boîte de dialogue**. C'est utile lorsqu'un fichier porte déjà ce nom au niveau visé : rien n'est renommé dans ce cas, et un nom différent aboutit au second essai.
- Une barre oblique n'est pas autorisée dans le nom cible, car le résultat est une page autonome. Déplacer une page sous une **autre** page parente n'en fait pas partie ; qui en a besoin modifie le nom complet dans la boîte de dialogue de renommage.
