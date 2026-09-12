# Exporter et importer les paramètres

Sa propre installation représente du travail : jeux de couleurs, raccourcis clavier, disposition de la barre de format, boutons et macros personnels, agencement de la barre latérale, règles de modèles, favoris. Cette installation peut être **écrite dans un fichier** et **relue** ailleurs — sur un deuxième ordinateur, après une réinstallation ou comme sauvegarde avant une refonte importante. Les deux chemins se trouvent dans le menu Fichier → Paramètres : « Exporter… » et « Importer… ». La fonction fait partie de l'extension « Export et import des paramètres » ; à l'état désactivé, le sous-menu disparaît.

Un troisième cas d'usage se place à côté sur un pied d'égalité et n'a rien à voir avec la sauvegarde : la **transmission d'un seul [système de calendrier](custom-calendars.md)** d'une [zone](apps-windows.md) à une autre.

## Exporter

« Fichier → Paramètres → Exporter… » ouvre une sélection. Elle présente une ligne par type de données, avec son nom et le nombre de ses entrées ; n'est proposé que ce qui contient effectivement quelque chose. Tout est coché d'avance — le cas le plus fréquent est la sauvegarde complète. Qui veut emporter moins décoche de façon ciblée ; sans la moindre sélection, aucun fichier n'est créé et la sélection reste ouverte avec une indication.

Ensuite, la boîte d'enregistrement habituelle demande l'emplacement et le nom. Un nom parlant comportant la date du jour est proposé.

Ces types de données sont au choix :

| Type de données | Contenu |
|---|---|
| Paramètres | Comportement et présentation : langue, apparence, options d'éditeur et d'affichage, enregistrement automatique, historique, pièces jointes, options d'export, la configuration des tâches, des rappels et de l'affichage du calendrier ainsi que les préférences de colonnes des panneaux |
| Jeux de couleurs | les jeux créés par vous-même, avec l'attribution de celui qui vaut en mode clair et de celui qui vaut en mode sombre |
| Raccourcis clavier | vos propres réattributions des commandes |
| Barre de format | votre propre disposition de la barre de boutons |
| Boutons de la barre d’état et macros | vos propres accès dans la barre d'état, la section du menu contextuel, la liste des éléments masqués et les macros que vous avez construites |
| État des extensions | quelles extensions sont activées et lesquelles sont désactivées |
| Disposition de la barre latérale | choix des panneaux, ordre, groupes d'onglets et largeurs, avec vos propres variantes de disposition |
| Dossier et règles de modèles | le dossier de modèles et la chaîne ordonnée des règles de dossier |
| Favoris | l'arborescence des signets généraux, avec dossiers et entrées |
| Systèmes de calendrier de la zone | les blocs de chronologies de la zone ouverte |

### Choisir un seul système de calendrier

Les systèmes de calendrier sont la seule exception de cette liste : ils n'appartiennent pas à l'application mais à la zone ouverte, et voyagent donc de toute façon avec son dossier. Ils figurent ici parce que leur **transmission** est un but en soi — qui a construit un système de calendrier doit pouvoir le donner à une autre zone, sans qu'il y soit reconstruit.

Pour cela, cette ligne est à deux niveaux : sous le type de données figure **une ligne propre par bloc**, avec son nom et le nombre de ses chronologies, chacune avec sa propre case. Le même chemin porte ainsi les deux cas — tous les blocs pour la sauvegarde, un seul pour la transmission. L'interrupteur du type de données dit « tout » ou « rien » et commute ses blocs avec lui ; si seuls certains sont choisis, il affiche un état indéterminé.

Ce que l'on choisit, c'est le **bloc**, non la chronologie isolée. La raison tient au modèle : les chronologies d'un même bloc peuvent être mises en correspondance, et une chronologie dérivée s'appuie sur une autre de **son** bloc. Une chronologie extraite isolément romprait ce lien ; un bloc entier l'emporte intact.

Sans zone ouverte, le type de données n'apparaît pas du tout — il n'y en a alors aucun.

## Ce qui ne part jamais

N'est écrit que ce qui relève des types de données ci-dessus. Tout le reste reste en place, et non par mégarde, mais comme une garantie :

- **Les secrets d'accès de toute nature ne partent jamais.** L'espace de stockage dans lequel une extension externe conserve ses propres données est exclu de l'export dans son ensemble — même lorsque personne ne sait ce qui s'y trouve. C'est justement parce que l'application ne connaît pas ce contenu qu'il n'est pas transmis. Leur état d'activation, c'est-à-dire le fait qu'une extension soit activée ou désactivée, part en revanche avec le reste ; c'est de l'installation et non un secret.
- **L'état de session** comme les onglets ouverts, la taille et la position des fenêtres ainsi que les listes des éléments récents. Ils portent des chemins absolus de l'ordinateur d'origine, qui ne mènent nulle part ailleurs.
- **Les indications liées à la machine** comme les espaces de travail et les zones configurés avec leurs chemins, les introductions déjà vues et la décision d'accorder ou non sa confiance à une extension externe déterminée sur cet ordinateur. Cette décision est à prendre par ordinateur ; l'emporter reviendrait à l'anticiper ailleurs.
- **Les états en cours** comme le réveil, la minuterie et le chronomètre.

Le fichier lui-même ne laisse pas non plus deviner de personne : son en-tête nomme le programme et sa version, pas l'utilisateur ni l'ordinateur.

## Le fichier

Le fichier d'échange est un **fichier Markdown** ordinaire. C'est voulu : il s'ouvre dans cette application, se lit dans n'importe quel éditeur, se compare et se versionne. Son en-tête nomme la version du format, le moment de la sortie et l'origine ; en dessous vient, par type de données, une section propre avec un titre et un bloc de code dont le contenu porte les valeurs.

````text
---
em4me: "setup"
formatVersion: 1
created: "2026-09-09T10:43:12Z"
origin:
  program: "EM4me"
  version: "…"
---

## Jeux de couleurs

```json em4me:colorSchemes
{ … }
```
````

Le champ `em4me` identifie le fichier comme fichier de paramètres de cette application et évite qu'un fichier Markdown quelconque soit choisi par mégarde à la relecture. L'indication qui suit la marque dans le bloc de code — ici `em4me:colorSchemes` — nomme le type de données de la section. Les titres au-dessus sont là pour le lecteur ; le type de données, lui, est lu depuis la marque.

## Importer

« Fichier → Paramètres → Importer… » demande le fichier. La boîte de dialogue n'est pas liée à une zone ouverte — un fichier de paramètres se trouve typiquement justement à l'extérieur, sur une clé ou dans le dossier de téléchargement.

**Rien n'est écrit immédiatement.** D'abord apparaît un **aperçu** qui indique, par type de données, ce qui se passerait : ce qui sera ajouté, remplacé, renommé et ignoré. Seul « Appliquer » l'exécute ; ensuite, un rapport montre la même liste comme résultat. L'aperçu comporte en outre le bouton « Sauvegarder l'état actuel… », qui écrit l'état actuel des types de données concernés dans un fichier propre avant que quoi que ce soit ne soit modifié.

Rien n'est passé sous silence : chaque écart au cas simple figure dans l'aperçu et dans le rapport.

### Ce qu'il advient des valeurs existantes

**Une seule** règle vaut pour tous les types de données :

> Est ajouté ce que vous avez créé comme objet nommé. Est remplacé ce qui est un réglage ou un agencement.

Sont donc ajoutés vos propres jeux de couleurs, les macros, les variantes de disposition de la barre latérale, les favoris et les blocs de calendrier : ils se placent **à côté** de l'existant, et le fonds présent n'est pas touché. Sont remplacés les paramètres, l'attribution des raccourcis clavier, la barre de format, les règles de modèles et l'état des extensions : une valeur ne connaît pas de pluriel, et deux agencements entrelacés en donneraient un troisième que personne n'a mis en place.

**En cas de nom identique, l'entrée existante reste inchangée**, et celle qui est relue vient à côté avec un ajout distinctif : « Modèle » devient « Modèle (2) ». L'aperçu nomme chacune de ces renominations. Les renvois suivent — une macro relue qui reçoit un nouvel identifiant continue d'être trouvée par son bouton.

Deux cas particuliers découlent de l'objet : un signet vers un fichier déjà mémorisé est ignoré au lieu d'être créé en double — un dossier de signets, en revanche, arrive toujours dans son ensemble, parce qu'il est votre travail de classement. Et un bloc de calendrier dont la définition est incomplète est refusé et nommé, au lieu de créer une demi-entrée.

Une partie des paramètres ne prend effet qu'après un redémarrage de l'application ; l'aperçu le dit lorsque c'est le cas.

### Fichiers issus d'une autre version du programme

Un fichier issu d'une version **plus ancienne** est lu. C'est précisément à cela que sert ce chemin : une sauvegarde qui ne serait plus lisible après la prochaine mise à jour du programme manquerait son but. Les types de données qui n'existent plus entre-temps apparaissent comme ignorés — ils sont signalés, non tus.

Un fichier issu d'une version **plus récente** est lu lui aussi, avec une indication : ce que cette version ne connaît pas est ignoré et nommé. Il en va de même à l'intérieur d'un type de données connu dont la structure a changé — ce qui n'entre pas dans la forme attendue est écarté et listé dans l'aperçu, plutôt que de laisser une structure étrangère entrer dans les paramètres.

Si le fichier est endommagé ou n'est pas du tout un fichier de paramètres, l'application le dit et n'écrit rien.

## Transmettre un système de calendrier

Le chemin dans son ensemble, en exemple :

1. Dans la **zone source**, choisir « Fichier → Paramètres → Exporter… ».
2. Retirer toutes les cases sauf celle du bloc de calendrier souhaité et enregistrer le fichier.
3. Ouvrir la **zone cible** et y choisir « Fichier → Paramètres → Importer… ».
4. Choisir le fichier, lire l'aperçu, appliquer.

Le bloc figure ensuite dans la zone cible à côté de ce qui s'y trouvait déjà, et ses chronologies s'utilisent aussitôt dans le document. S'il porte le nom d'un bloc existant — le cas normal lorsque le même système y est déjà arrivé une fois —, l'existant reste en place et le nouveau apparaît avec son ajout.

L'écriture se fait toujours dans la zone actuellement ouverte. Si aucune n'est ouverte, le type de données est ignoré et la raison est indiquée.
