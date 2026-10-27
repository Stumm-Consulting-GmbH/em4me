# Workflows

Un **workflow** consigne des manipulations récurrentes sous forme de suite fixe d'étapes : créer, renommer, déplacer et copier des fichiers et des dossiers, ajouter ou insérer du texte, définir des propriétés dans l'en-tête, exécuter des commandes, des macros et d'autres workflows. Un workflow est un **fichier Markdown ordinaire** ; ce qu'il fait figure dans un bloc de commandes fixes, une ligne par étape. Le fichier reste ainsi lisible sans l'application, se transmet et se modifie comme tout autre document.

Un workflow se lance **à la main** : depuis le menu, la palette de commandes, par un raccourci clavier, un bouton au-dessus du bloc ou le menu contextuel du panneau de zone. **Avant que la première étape ne s'exécute, l'application vérifie le workflow entier** ; une erreur s'affiche au-dessus du bloc avec la ligne et le motif, et rien ne s'exécute.

## L'extension « Workflows »

La fonction fait partie des [extensions intégrées](extensions.md) (« Workflows », groupe **Outils**) ; elle est activée dans le mode de travail **Complet** et désactivée dans les modes **Débutant** et **Avancé**. Désactivée, un bloc `workflow` est un bloc de code ordinaire sans mise en évidence, sans affichage de vérification et sans bouton ; il n'y a ni commandes des workflows, ni sous-menu **Workflows**, ni page **Exécutions des workflows**, ni sections de paramètres **Workflows**. Un fichier de workflow est alors un document ordinaire. Rien n'est perdu : les fichiers, les états d'exécution et le dossier de workflows défini sont inchangés après la réactivation.

## Structure d'un fichier de workflow

Un fichier est un workflow si son en-tête porte la marque `workflow: true`. Ce que fait le workflow figure dans **exactement un** bloc de code de langage `workflow`. Le reste du texte est la description destinée aux personnes ; ses sections peuvent servir de source d'un contenu (section « Sources d'un contenu » plus bas).

````markdown
---
workflow: true
name: Bilan hebdomadaire
description: Crée le bilan de la semaine et l'inscrit dans le journal de bord.
---

# Bilan hebdomadaire

```workflow
# Créer le bilan à partir du modèle et l'ouvrir
create "Bilans/{{date}} Semaine.md" from-template "Bilan.md"
open "Bilans/{{date}} Semaine.md"
insert "Journal de bord.md" under "Bilans" from-section "Entrée"
notify "Bilan créé"
```

## Entrée

- Bilan hebdomadaire créé.
````

L'en-tête ne porte que la marque, le nom, le déclencheur et la description :

| Clé | Obligatoire | Signification |
| --- | --- | --- |
| `workflow` | oui | `true` marque le fichier comme workflow. |
| `name` | non | Nom du workflow dans le menu, la palette de commandes et les messages ; sans indication, le nom du fichier sans extension s'applique. |
| `trigger` | non | Déclencheur ; sans indication, `manual` s'applique, le lancement à la main. |
| `description` | non | Description courte ; la page **Exécutions des workflows** l'affiche en infobulle sur le nom. |

Un autre déclencheur que `manual` est signalé comme « pas encore pris en charge », et le workflow ne s'exécute pas ; le fichier reste inchangé. Un fichier portant deux blocs `workflow` ou plus, ou aucun, ne s'exécute pas non plus. Un bloc ne contenant que des commentaires est valide et ne fait rien.

## Lignes de commande

Les lignes du bloc suivent une forme fixe :

- **Une ligne est une commande.** Les lignes vides et celles qui commencent par `#` sont des commentaires. Il n'y a pas de commentaire après une commande, ni de suite sur plusieurs lignes.
- **D'abord le mot-clé, puis les indications**, séparés par des espaces. Les mots-clés sont anglais et écrits en minuscules : `create`, pas `Create`.
- **Chemins et textes** figurent entre guillemets doubles droits. Un guillemet dans le texte s'écrit `\"` ; toute autre barre oblique inverse reste telle quelle. Les guillemets typographiques, tels qu'un traitement de texte les insère lors d'une copie, sont une erreur.
- **Nombres et identifiants de commande** figurent sans guillemets : `wait 2`, `command view.modeSplit`.
- **Les options nommées** sont une paire option et valeur, comme `from-template "Jour.md"` ou `under "Journal"`, ou un mot seul comme `at-start`. Elles suivent les autres indications dans un ordre quelconque, au plus une de chaque sorte.
- **Les chemins** sont relatifs à la racine de la zone dans laquelle le workflow est lancé ; le séparateur est la barre oblique `/`. Un chemin absolu et un chemin avec `..` ne sont pas autorisés. Le chemin après `from-template` désigne un modèle et est relatif au [dossier de modèles](templates.md).

```workflow
# Commentaire : créer le dossier d'un nouveau projet
mkdir "Projets/{{prompt:Nom du projet ?}}/Notes"
replace "{{file}}" "Statut : ouvert" "Statut : \"en cours\""
insert "{{file}}" at-start from-file "Blocs/En-tête.md"
```

## Vérifier avant d'exécuter

Avant la première étape, l'application vérifie le fichier entier ainsi que chaque workflow qu'il appelle. Elle signale entre autres :

- les commandes inconnues et les commandes d'une étape ultérieure,
- les indications manquantes, en trop ou mal écrites, les options inconnues ou en double,
- les chemins hors de la zone, les chemins et textes vides, les nouveaux noms invalides,
- une attente de plus de dix secondes,
- les commandes, macros et workflows inconnus, ainsi que les noms portés par plusieurs macros ou workflows,
- un workflow qui s'appelle lui-même, y compris par le détour d'un autre, et une imbrication de plus de cinq niveaux,
- les espaces réservés erronés, les modèles illisibles et les modèles désactivés.

Une anomalie arrête l'exécution **avant la première étape** ; un fichier de workflow erroné ne s'exécute donc pas du tout au lieu de s'exécuter en partie. La vérification signale toutes les anomalies à la fois ; la ligne indiquée est la ligne dans le document telle que l'éditeur la compte, en-tête compris.

Ce que seule une étape antérieure peut produire est vérifié par l'application à l'étape même : l'existence d'un fichier, d'une section ou d'un titre. S'il manque à ce moment, l'étape échoue.

## Commandes

Les commandes de la première étape, classées selon leur objet. Les chemins sont relatifs à la racine de la zone.

### Fichiers et dossiers

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `create` | créer un fichier, vide ou avec contenu | chemin ; au choix une source | `create "Journal/{{date}}.md" from-template "Jour.md"` |
| `rename` | renommer un fichier ou un dossier | chemin, nouveau nom | `rename "Brouillon.md" "Note {{date}}.md"` |
| `move` | déplacer un fichier ou un dossier dans un dossier ; les liens sont mis à jour | chemin, dossier cible | `move "{{file}}" "Archives/2026"` |
| `copy` | copier un fichier | chemin, cible | `copy "Gabarits/Liste.md" "Projets/Nouveau/Liste.md"` |
| `mkdir` | créer un dossier, même imbriqué | chemin | `mkdir "Projets/Nouveau/Notes"` |
| `open` | ouvrir un fichier dans la fenêtre ou passer à lui | chemin | `open "Journal/{{date}}.md"` |
| `close` | fermer un document ouvert | chemin | `close "{{file}}"` |

- **Cible existante :** si la cible de `create`, `copy`, `rename` ou `move` existe déjà, l'étape échoue ; rien n'est écrasé.
- **Dossier cible manquant :** `create`, `copy` et `move` le créent à l'intérieur de la zone.
- **Déplacer et renommer** suivent le même chemin que dans le panneau de zone : les liens vers le fichier sont mis à jour, les sous-pages et le fichier compagnon suivent.
- `mkdir` sur un dossier existant et `close` sur un document non ouvert réussissent sans rien modifier. `close` sur un document non enregistré affiche la demande d'enregistrement habituelle ; « Annuler » met fin à l'exécution à cette ligne.

### Contenu et en-tête

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `append` | placer un contenu à la fin d'un fichier | chemin, source | `append "{{file}}" from-section "Points ouverts"` |
| `insert` | insérer un contenu sous un titre ou au début | chemin, emplacement (`under "Titre"` ou `at-start`), source | `insert "{{file}}" under "Journal" from-section "Entrée"` |
| `replace` | remplacer chaque occurrence d'un texte | chemin, texte cherché, remplacement | `replace "{{file}}" "PROJET" "{{prompt:Nom du projet ?}}"` |
| `set-property` | définir ou modifier une propriété dans l'en-tête | chemin, nom, valeur | `set-property "{{file}}" statut "terminé"` |
| `remove-property` | retirer une propriété de l'en-tête | chemin, nom | `remove-property "{{file}}" brouillon` |

- `insert … under` insère directement sous le titre, avant son contenu existant ; `insert … at-start` insère au début du texte, après l'en-tête. Si le titre manque ou apparaît plusieurs fois, l'étape échoue.
- `replace` remplace chaque occurrence, comme « Tout remplacer » dans l'éditeur ; s'il n'en trouve aucune, l'étape échoue.
- `set-property` et `remove-property` laissent les autres propriétés dans leur ordre. `remove-property` sur une propriété qui n'existe pas réussit sans modification.
- **Fichiers ouverts :** si le fichier cible est ouvert dans une fenêtre et non enregistré, la modification va à cette fenêtre et y apparaît comme modification dans l'éditeur ; le travail non enregistré est conservé. Sinon, le fichier est écrit directement.

### Application et déroulement

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `command` | exécuter une commande de l'application | identifiant de commande | `command view.modeSplit` |
| `macro` | exécuter une macro des paramètres | nom de la macro | `macro "Début de journée"` |
| `workflow` | exécuter un autre workflow du dossier de workflows | nom du workflow | `workflow "Créer les dossiers"` |
| `wait` | pause en secondes, au plus 10 | nombre | `wait 2` |
| `notify` | afficher un texte comme message dans la barre d'état | texte | `notify "Bilan hebdomadaire créé"` |
| `stop` | mettre fin à l'exécution avec un texte | texte | `stop "Rien à faire"` |

- `command` prend l'identifiant fixe d'une commande, comme `view.modeSplit`, `view.modeLive` ou `file.save`, et l'exécute dans la fenêtre de lancement. Si elle n'est pas exécutable sur le moment, l'étape échoue. Macros et workflows ne passent pas par `command`, mais par leurs propres commandes.
- `macro` et `workflow` peuvent être imbriqués sur cinq niveaux au plus. Un workflow appelé revient après sa dernière étape ; si une étape y échoue, toute l'exécution prend fin.
- `stop` met fin à toute l'exécution, même depuis un workflow appelé ; la barre d'état affiche « Workflow ‹Nom› arrêté à la ligne N : texte ».

### Sources d'un contenu

`create`, `append` et `insert` tirent leur contenu de l'une de trois sources. Un contenu ne figure jamais comme texte libre dans la ligne de commande.

| Option | Contenu |
| --- | --- |
| `from-template "chemin"` | un modèle du dossier de modèles, rempli comme lors de l'application d'un modèle ; ses dialogues de saisie apparaissent avant la première étape |
| `from-file "chemin"` | le contenu d'un autre fichier de la zone, tel quel, dans l'état où il se trouve à l'étape |
| `from-section "Titre"` | le contenu d'une section du fichier de workflow lui-même, tel quel |

Une section est le texte sous son titre jusqu'au titre suivant de même niveau ou de niveau supérieur, sans le titre lui-même ; les sous-sections en font partie. Elle est trouvée comme avec un lien `[[Fichier#Titre]]`. `from-file` et `from-section` copient tel quel : les espaces réservés qu'ils contiennent restent en place. Seul un modèle est rempli. Si l'extension « Modèles » est désactivée, la vérification signale « Les modèles sont désactivés » pour `from-template` ; les workflows sans modèle continuent de s'exécuter.

## Espaces réservés

Les espaces réservés valent dans chaque indication d'une ligne de commande. Modèles et workflows partagent le même jeu ; l'écriture avec décalage et format est décrite sur la page [Modèles](templates.md).

| Espace réservé | Valeur dans une ligne de commande |
| --- | --- |
| `{{date}}`, `{{time}}` | date et heure du lancement, aussi avec décalage et format : `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | chemin du document actif au lancement, relatif à la racine de la zone, par exemple `Projets/Plan.md` |
| `{{title}}` | titre du document actif au lancement |
| `{{folder}}` | dossier du document actif au lancement, relatif à la racine de la zone |
| `{{area}}` | nom de la zone |
| `{{prompt:Question}}`, `{{prompt:Question:Défaut}}` | dialogue de saisie |
| `{{select:Question:a,b,c}}` | dialogue de choix |

- **Tous les dialogues avant la première étape :** les dialogues de saisie et de choix de toute l'exécution apparaissent l'un après l'autre avant que quoi que ce soit ne se produise, y compris ceux des modèles utilisés et des workflows appelés. Une même question n'est posée qu'une fois et vaut partout. Annuler un dialogue annule l'exécution, et aucune étape ne s'exécute.
- **Un instant par exécution :** `{{date}}` et `{{time}}` ont la même valeur dans toutes les lignes, même au passage de minuit.
- **Dans un modèle utilisé par un workflow**, `{{title}}` et `{{folder}}` désignent comme d'habitude le nouveau fichier, tandis que `{{file}}` et `{{area}}` désignent le document actif et la zone.
- `{{cursor}}` n'est pas autorisé dans une ligne de commande, `{{clipboard}}` n'y est disponible qu'à une étape ultérieure. `\{{` écrit un `{{` littéral.
- Si `{{folder}}` reste vide dans le dossier racine, `"{{folder}}/Nouveau.md"` donne le chemin `Nouveau.md`. Sans document actif, `{{file}}` est vide, et un chemin qui en découle est une anomalie.

## Lancer un workflow

Un workflow ne se lance que dans une zone ouverte, et ses chemins valent dans cette zone, même si le fichier provient du dossier de workflows de l'application. Les moyens :

| Moyen | Effet |
| --- | --- |
| **Fichier → Workflows** | chaque workflow du dossier de workflows comme entrée, les sous-dossiers comme sous-menus |
| **Palette de commandes** (`Ctrl+K` par défaut) | chaque workflow du dossier de workflows comme commande sous son nom |
| **Barre d'état et menu contextuel** | la commande d'un workflow, placée par le [placement des commandes](command-placement.md) |
| **Raccourci clavier** | attribué à la commande d'un workflow sous « Paramètres → Raccourcis clavier » |
| **Bouton « Lancer » au-dessus du bloc** | dans le mode direct, la vue rendue et la vue partagée, à droite dans la ligne d'en-tête du bloc ; lance tout fichier de workflow, même hors du dossier de workflows, avec l'état présent dans l'éditeur |
| **« Lancer » dans le panneau de zone** | tout en haut du menu contextuel de chaque fichier de workflow de la zone |
| **Page « Exécutions des workflows »** | bouton « Lancer » dans la ligne de chaque workflow |

Le bouton au-dessus du bloc est désactivé tant que la vérification signale une anomalie. Pour un document jamais enregistré, il affiche « Enregistrez d'abord », hors d'une zone « Ne peut être lancé que dans une zone ouverte ».

La commande d'un workflow reçoit son identifiant du chemin du fichier dans le dossier de workflows ; deux workflows de même nom dans des sous-dossiers différents restent ainsi distincts. **Renommer un workflow dans l'application ou le déplacer à l'intérieur du dossier de workflows conserve ses attributions :** un raccourci clavier, une place dans la barre d'état, le menu contextuel ou la barre de format et une étape de macro qui l'appelle suivent. **En dehors de l'application**, par exemple dans le gestionnaire de fichiers, l'application ne remarque pas le changement de nom ; les attributions perdent alors leur cible et doivent être redéfinies. Un workflow déplacé hors du dossier de workflows n'est plus une commande ; ses attributions restent enregistrées et agissent de nouveau dès qu'il revient au même endroit.

## Déroulement d'une exécution

1. L'application vérifie le workflow ainsi que les workflows qu'il appelle.
2. Les dialogues de tous les espaces réservés apparaissent l'un après l'autre.
3. Les étapes s'exécutent strictement l'une après l'autre ; chacune attend la précédente.
4. Le premier échec met fin à l'exécution. La barre d'état affiche « Workflow ‹Nom› interrompu à la ligne N : motif ».

Les étapes exécutées le restent ; il n'y a pas d'annulation sur plusieurs étapes. **Au plus un workflow s'exécute par fenêtre** ; un second lancement pendant une exécution est refusé avec un message.

## Dossier de workflows et menu

Comme pour les modèles, il existe un **dossier de workflows**, défini à deux niveaux sous « Fichier → Paramètres… » :

- **Pour toute l'application** dans la section **Extensions (internes) → Workflows**.
- **Par zone** dans la section **Zone actuelle → Workflows** avec l'interrupteur « Utiliser la configuration de zone » et le bouton « Parcourir… ». Le dossier est enregistré relativement à la racine de la zone dans le fichier de zone et **remplace** entièrement celui de l'application.

Le sous-menu **Fichier → Workflows** se trouve juste après le sous-menu **Zone**. Il montre les fichiers du dossier qui portent la marque, par ordre alphabétique de nom à chaque niveau ; les sous-dossiers apparaissent comme sous-menus, les fichiers sans marque sont omis. Après un séparateur suivent :

- **Afficher les exécutions des workflows** — ouvre la page **Exécutions des workflows**.
- **Nouveau workflow…** — demande le nom, crée dans le dossier de workflows un fichier avec en-tête, ligne de description et un bloc `workflow` vide de deux lignes de commentaire, et l'ouvre. Sans dossier défini, il demande d'abord le dossier et le retient, dans les paramètres de la zone si une zone est ouverte. Il n'écrase jamais un fichier existant. L'entrée figure aussi dans la palette de commandes.
- **Définir le dossier de workflows…** — ouvre les paramètres à la section **Workflows**.

Sans dossier défini, le sous-menu affiche « Aucun dossier de workflows défini », pour un dossier vide « Aucun workflow dans le dossier de workflows », pour un dossier inaccessible « Dossier de workflows introuvable ». Le sous-menu et les commandes suivent chaque modification dans le dossier.

## État d'exécution et la page « Exécutions des workflows »

Après chaque exécution, l'application consigne dans le **fichier compagnon** du workflow (`.mdd`, section `workflow`) l'instant, le résultat, le cas échéant la ligne interrompue et le nombre d'exécutions ; le texte du fichier de workflow reste intact. L'état d'exécution suit le fichier quand il est renommé ou déplacé, pas quand il est copié.

La page **Exécutions des workflows** s'ouvre par « Affichage → Afficher les exécutions des workflows », par « Fichier → Workflows → Afficher les exécutions des workflows » et par la palette de commandes. Elle liste **tous les workflows de la zone**, y compris ceux hors du dossier de workflows, avec les colonnes **Workflow**, **Emplacement**, **Dernière exécution**, **Résultat** et **Exécutions** et un bouton « Lancer » par ligne. Un workflow qui n'a jamais tourné figure avec « jamais exécuté ».

| Résultat | Signification |
| --- | --- |
| réussi | toutes les étapes se sont exécutées |
| interrompu à la ligne N : motif | une anomalie ou un échec a mis fin à l'exécution |
| arrêté à la ligne N | la commande `stop` a mis fin à l'exécution |
| Saisie annulée, aucune étape exécutée | un dialogue a été annulé |

Après une exécution dans cette fenêtre, la page montre le même motif que la barre d'état. Le fichier compagnon ne retient que la ligne et le type de motif ; après un redémarrage et pour une exécution depuis une autre fenêtre, des détails comme un nom de fichier apparaissent donc sous la forme « … ». La page se met à jour après chaque exécution ; le bouton « Actualiser » la relit.

## Aide dans l'éditeur

- **Mise en évidence :** dans les lignes de commande, le mot-clé apparaît en gras, le texte entre guillemets en couleur et les espaces réservés en italique, dans l'éditeur comme dans le rendu.
- **Affichage de vérification :** le mode direct, la vue rendue et la vue partagée affichent au-dessus du bloc le résultat de la vérification : en vert « prêt » ou en rouge « Ligne N : motif », avec « (+N autres) » en cas de plusieurs anomalies. Les messages sur plusieurs blocs et sur un déclencheur pas encore pris en charge y figurent aussi. L'affichage suit le texte peu après chaque modification et montre la même anomalie que celle signalée au lancement. À l'impression, dans un export et pour un fichier intégré, la ligne d'en-tête n'apparaît pas.

La mise en évidence et l'affichage ne modifient pas le texte du fichier.

## Limites

- **Seulement dans la zone :** aucune commande ne lit ni n'écrit hors de la racine de la zone dans laquelle le workflow a été lancé, pas même par un espace réservé.
- **Pas de suppression, pas de réseau, pas de programmes externes.**
- **Seulement à la main :** un workflow ne démarre jamais de lui-même et ne s'exécute que tant que l'application tourne.
- `notify` affiche son texte dans la barre d'état ; il n'y a pas de notification du système d'exploitation.
- **Les macros** restent telles quelles et peuvent être appelées comme étape ; une macro est une suite de commandes dans les paramètres, un workflow une procédure sous forme de document. **Les [blocs de script](scripts.md)** restent en lecture seule ; un workflow n'est pas un langage de script général, mais un catalogue fixe de commandes.

## Étapes ultérieures

D'autres étapes sont prévues, sans que leur portée ni leur date soient fixées : un lancement selon un calendrier, des commandes d'entretien comme la suppression avec confirmation, l'ajout et le retrait d'étiquettes ou le cochage de tâches, un lancement sur des événements de la zone, des conditions et des répétitions, ainsi que des commandes pour la [base de données](database.md). La vérification connaît déjà les mots-clés de ces commandes et les signale comme « n'est disponible qu'à une étape ultérieure », afin qu'un tel fichier ne s'exécute pas en partie.
